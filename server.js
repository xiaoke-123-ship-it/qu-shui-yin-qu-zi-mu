// 去字幕 · 去水印 — 后台服务
// 前台 + 管理后台 + 小程序版共用同一套数据。
// 数据库：设置了 DATABASE_URL 时用 Postgres，否则用本地 data/db.json（JSON 文件存储）。
// 部署到 Render：Web Service + 免费 Postgres，DATABASE_URL 由 Render 自动注入。
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use((req, res, next) => { res.setHeader('X-Powered-By', 'qu-shui-yin-qu-zi-mu'); next(); });

const PORT = process.env.PORT || 3000;
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'change-me-in-production';
const USE_PG = !!process.env.DATABASE_URL;
let pool = null;
if (USE_PG) { const { Pool } = require('pg'); pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); }

// ---------- 工具函数 ----------
const snake = s => s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
const camelRow = r => { const o = {}; for (const k of Object.keys(r)) o[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = r[k]; return o; };
const nowIso = () => new Date().toISOString();
function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 30 * 24 * 3600 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verifyToken(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const expect = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
    if (sig !== expect) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (p.exp < Date.now()) return null;
    return p;
  } catch (e) { return null; }
}
function authUser(req) { const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.token; const p = verifyToken(t); return p && p.role === 'user' ? p : null; }
function authAdmin(req) { const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.token; const p = verifyToken(t); return p && p.role === 'admin' ? p : null; }

// ---------- 数据层 ----------
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
let mem = null;
function defaultDb() {
  return {
    seq: { user: 1000, order: 1000 },
    users: [], orders: [], transactions: [], usage: [],
    pricing: {
      subtitles: { tool: 'subtitles', name: '视频去字幕', flatPoints: 10, perSecondPoints: 0, billingMode: 'flat', enabled: true },
      videowm: { tool: 'videowm', name: '视频去水印', flatPoints: 10, perSecondPoints: 0, billingMode: 'flat', enabled: true },
      imagewm: { tool: 'imagewm', name: '图片去水印', flatPoints: 5, perSecondPoints: 0, billingMode: 'flat', enabled: true },
      imagegen: { tool: 'imagegen', name: '图片生成', flatPoints: 20, perSecondPoints: 0, billingMode: 'flat', enabled: true }
    },
    packages: [
      { id: 1, name: '体验包', price: 9.9, points: 100, desc: '新手体验，先试一次' },
      { id: 2, name: '300积分包', price: 29.9, points: 300, desc: '常用套餐' },
      { id: 3, name: '1000积分包', price: 89.9, points: 1000, desc: '超值装' },
      { id: 4, name: '5000积分包', price: 399, points: 5000, desc: '工作室装' }
    ],
    settings: {
      supportContact: '', miniappAppId: '', miniappEntry: '',
      wechatAppId: '', merchantId: '',
      imageGenApiKey: '', imageGenApiUrl: 'https://api.openai.com/v1/images/generations',
      watermarkApiUrl: '', subtitleApiUrl: '',
      adminAccountHash: '', adminPasswordHash: ''
    }
  };
}
function loadJson() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) { try { mem = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { mem = defaultDb(); } }
  else mem = defaultDb();
  saveJson();
}
function saveJson() { if (!USE_PG) fs.writeFileSync(DB_FILE, JSON.stringify(mem, null, 2)); }

const TABLES = {
  users: ['id', 'email', 'passwordHash', 'nickname', 'balance', 'createdAt', 'lastLoginAt', 'totalRecharged', 'totalSpent', 'useCount'],
  orders: ['id', 'userId', 'packageId', 'packageName', 'price', 'points', 'status', 'createdAt', 'paidAt'],
  transactions: ['id', 'userId', 'kind', 'points', 'balanceAfter', 'note', 'createdAt'],
  usage: ['id', 'userId', 'tool', 'toolName', 'points', 'billingDetail', 'status', 'createdAt'],
  packages: ['id', 'name', 'price', 'points', 'desc']
};
async function pgInit() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, nickname TEXT, balance INTEGER NOT NULL DEFAULT 0, created_at TEXT, last_login_at TEXT, total_recharged NUMERIC NOT NULL DEFAULT 0, total_spent INTEGER NOT NULL DEFAULT 0, use_count INTEGER NOT NULL DEFAULT 0)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, user_id INTEGER, package_id INTEGER, package_name TEXT, price NUMERIC, points INTEGER, status TEXT, created_at TEXT, paid_at TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS transactions (id SERIAL PRIMARY KEY, user_id INTEGER, kind TEXT, points INTEGER, balance_after INTEGER, note TEXT, created_at TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS usage (id SERIAL PRIMARY KEY, user_id INTEGER, tool TEXT, tool_name TEXT, points INTEGER, billing_detail TEXT, status TEXT, created_at TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS packages (id SERIAL PRIMARY KEY, name TEXT, price NUMERIC, points INTEGER, "desc" TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS pricing (tool TEXT PRIMARY KEY, name TEXT, flat_points INTEGER, per_second_points INTEGER, billing_mode TEXT, enabled BOOLEAN)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
}
async function pgGet(table, where) {
  const keys = Object.keys(where || {});
  let sql = `SELECT * FROM "${table}"`, params = [];
  if (keys.length) { sql += ' WHERE ' + keys.map((k, i) => `"${snake(k)}"=$${i + 1}`).join(' AND '); params = keys.map(k => where[k]); }
  const r = await pool.query(sql, params);
  return r.rows.map(camelRow);
}
async function pgInsert(table, row) {
  const cols = Object.keys(row).filter(k => k !== 'id');
  const vals = cols.map(k => row[k]);
  const sql = `INSERT INTO "${table}" (${cols.map(c => `"${snake(c)}"`).join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`;
  const r = await pool.query(sql, vals);
  return camelRow(r.rows[0]);
}
async function pgUpdate(table, id, patch) {
  const cols = Object.keys(patch);
  if (!cols.length) return;
  const sql = `UPDATE "${table}" SET ${cols.map((c, i) => `"${snake(c)}"=$${i + 1}`).join(',')} WHERE id=$${cols.length + 1}`;
  await pool.query(sql, [...cols.map(c => patch[c]), id]);
}
async function pgSetting(key, value) {
  if (value === undefined) { const r = await pool.query('SELECT value FROM settings WHERE key=$1', [key]); return r.rows[0] ? r.rows[0].value : ''; }
  await pool.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', [key, String(value)]);
}
async function seedPg() {
  const pr = await pool.query('SELECT COUNT(*) c FROM pricing');
  if (Number(pr.rows[0].c) === 0) {
    const d = defaultDb();
    for (const t of Object.keys(d.pricing)) { const p = d.pricing[t]; await pool.query('INSERT INTO pricing(tool,name,flat_points,per_second_points,billing_mode,enabled) VALUES($1,$2,$3,$4,$5,$6)', [p.tool, p.name, p.flatPoints, p.perSecondPoints, p.billingMode, p.enabled]); }
  }
  const pk = await pool.query('SELECT COUNT(*) c FROM packages');
  if (Number(pk.rows[0].c) === 0) for (const p of defaultDb().packages) await pool.query('INSERT INTO packages(name,price,points,"desc") VALUES($1,$2,$3,$4)', [p.name, p.price, p.points, p.desc]);
  for (const k of Object.keys(defaultDb().settings)) { const v = await pgSetting(k); if (v === '') await pgSetting(k, defaultDb().settings[k]); }
}

// 统一读写接口（两种后端同一套调用）
const store = {
  async users() { return USE_PG ? pgGet('users', {}) : mem.users; },
  async userByEmail(email) { const rows = USE_PG ? await pgGet('users', { email }) : mem.users.filter(u => u.email === email); return rows[0] || null; },
  async userById(id) { const rows = USE_PG ? await pgGet('users', { id: Number(id) }) : mem.users.filter(u => u.id === Number(id)); return rows[0] || null; },
  async addUser(u) {
    if (USE_PG) return pgInsert('users', u);
    const row = { id: ++mem.seq.user, ...u }; mem.users.push(row); saveJson(); return row;
  },
  async updateUser(id, patch) { if (USE_PG) return pgUpdate('users', Number(id), patch); const u = mem.users.find(x => x.id === Number(id)); if (u) Object.assign(u, patch); saveJson(); },
  async orders() { return USE_PG ? pgGet('orders', {}) : mem.orders; },
  async ordersByUser(uid) { return USE_PG ? pgGet('orders', { userId: Number(uid) }) : mem.orders.filter(o => o.userId === Number(uid)); },
  async addOrder(o) { if (USE_PG) return pgInsert('orders', o); const row = { id: ++mem.seq.order, ...o }; mem.orders.push(row); saveJson(); return row; },
  async updateOrder(id, patch) { if (USE_PG) return pgUpdate('orders', Number(id), patch); const o = mem.orders.find(x => x.id === Number(id)); if (o) Object.assign(o, patch); saveJson(); },
  async transactions() { return USE_PG ? pgGet('transactions', {}) : mem.transactions; },
  async txByUser(uid) { return USE_PG ? pgGet('transactions', { userId: Number(uid) }) : mem.transactions.filter(t => t.userId === Number(uid)); },
  async addTx(t) { if (USE_PG) return pgInsert('transactions', t); const row = { id: Date.now(), ...t }; mem.transactions.push(row); saveJson(); return row; },
  async usage() { return USE_PG ? pgGet('usage', {}) : mem.usage; },
  async usageByUser(uid) { return USE_PG ? pgGet('usage', { userId: Number(uid) }) : mem.usage.filter(u => u.userId === Number(uid)); },
  async addUsage(u) { if (USE_PG) return pgInsert('usage', u); const row = { id: Date.now(), ...u }; mem.usage.push(row); saveJson(); return row; },
  async packages() { return USE_PG ? pgGet('packages', {}) : mem.packages; },
  async setPackages(list) {
    if (USE_PG) { await pool.query('DELETE FROM packages'); for (const p of list) await pool.query('INSERT INTO packages(name,price,points,"desc") VALUES($1,$2,$3,$4)', [p.name, Number(p.price), Number(p.points), p.desc || '']); return; }
    mem.packages = list.map((p, i) => ({ id: i + 1, name: p.name, price: Number(p.price), points: Number(p.points), desc: p.desc || '' })); saveJson();
  },
  async pricing() {
    if (USE_PG) { const rows = await pgGet('pricing', {}); const o = {}; for (const r of rows) o[r.tool] = r; return o; }
    return mem.pricing;
  },
  async setPricing(tool, p) {
    if (USE_PG) { await pool.query('INSERT INTO pricing(tool,name,flat_points,per_second_points,billing_mode,enabled) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tool) DO UPDATE SET name=EXCLUDED.name,flat_points=EXCLUDED.flat_points,per_second_points=EXCLUDED.per_second_points,billing_mode=EXCLUDED.billing_mode,enabled=EXCLUDED.enabled', [tool, p.name, Number(p.flatPoints), Number(p.perSecondPoints), p.billingMode, p.enabled !== false]); return; }
    mem.pricing[tool] = { tool, name: p.name, flatPoints: Number(p.flatPoints), perSecondPoints: Number(p.perSecondPoints), billingMode: p.billingMode, enabled: p.enabled !== false }; saveJson();
  },
  async setting(key, value) {
    if (USE_PG) return pgSetting(key, value);
    if (value === undefined) return mem.settings[key] || '';
    mem.settings[key] = String(value); saveJson();
  },
  async settingsAll() {
    if (USE_PG) { const r = await pool.query('SELECT * FROM settings'); const o = {}; for (const row of r.rows) o[row.key] = row.value; return o; }
    return { ...mem.settings };
  }
};

function computeCost(pricing, durationSec) {
  const dur = Math.max(1, Math.ceil(Number(durationSec) || 0));
  if (pricing.billingMode === 'perSecond') return { cost: pricing.perSecondPoints * dur, detail: `按秒 ${pricing.perSecondPoints} 积分/秒 × ${dur} 秒` };
  if (pricing.billingMode === 'both') return { cost: pricing.flatPoints + pricing.perSecondPoints * dur, detail: `一次性 ${pricing.flatPoints} 积分 + 按秒 ${pricing.perSecondPoints} 积分/秒 × ${dur} 秒` };
  return { cost: pricing.flatPoints, detail: `一次性 ${pricing.flatPoints} 积分` };
}
function publicUser(u) { return u ? { id: u.id, email: u.email, nickname: u.nickname, balance: u.balance, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, totalRecharged: Number(u.totalRecharged || 0), totalSpent: u.totalSpent || 0, useCount: u.useCount || 0 } : null; }
function maskSettings(s) {
  const out = { ...s };
  for (const k of ['imageGenApiKey', 'adminAccountHash', 'adminPasswordHash']) if (out[k]) out[k] = '••••••';
  return out;
}

// ---------- API ----------
app.get('/api/bootstrap', async (req, res) => {
  try {
    const pricing = await store.pricing();
    const packages = await store.packages();
    const s = await store.settingsAll();
    res.json({ ok: true, pricing, packages, supportContact: s.supportContact || '', miniappAppId: s.miniappAppId || '', miniappEntry: s.miniappEntry || '', adminSetupNeeded: !(s.adminAccountHash && s.adminPasswordHash) });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

app.post('/api/register', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.json({ ok: false, error: '邮箱格式不正确' });
    if (password.length < 6) return res.json({ ok: false, error: '密码至少 6 位' });
    if (await store.userByEmail(email)) return res.json({ ok: false, error: '该邮箱已注册，请直接登录' });
    const hash = bcrypt.hashSync(password, 10);
    const u = await store.addUser({ email, passwordHash: hash, nickname: email.split('@')[0], balance: 0, createdAt: nowIso(), lastLoginAt: nowIso(), totalRecharged: 0, totalSpent: 0, useCount: 0 });
    res.json({ ok: true, token: signToken({ role: 'user', uid: u.id }), user: publicUser(u) });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const u = await store.userByEmail(email);
    if (!u) return res.json({ ok: false, error: '该邮箱还没注册，请先注册' });
    if (!bcrypt.compareSync(password, u.passwordHash)) return res.json({ ok: false, error: '密码不正确' });
    await store.updateUser(u.id, { lastLoginAt: nowIso() });
    const fresh = await store.userById(u.id);
    res.json({ ok: true, token: signToken({ role: 'user', uid: u.id }), user: publicUser(fresh) });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

app.get('/api/me', async (req, res) => {
  const p = authUser(req); if (!p) return res.json({ ok: false, error: '未登录' });
  const u = await store.userById(p.uid); if (!u) return res.json({ ok: false, error: '用户不存在' });
  res.json({ ok: true, user: publicUser(u) });
});

app.post('/api/create-order', async (req, res) => {
  try {
    const p = authUser(req); if (!p) return res.json({ ok: false, error: '未登录' });
    const packages = await store.packages();
    const pkg = packages.find(x => Number(x.id) === Number(req.body.packageId));
    if (!pkg) return res.json({ ok: false, error: '套餐不存在' });
    const o = await store.addOrder({ userId: p.uid, packageId: pkg.id, packageName: pkg.name, price: Number(pkg.price), points: Number(pkg.points), status: 'pending', createdAt: nowIso(), paidAt: '' });
    res.json({ ok: true, order: o, testMode: true, note: '测试模式：未接入真实微信支付，确认后直接到账' });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

app.post('/api/confirm-order', async (req, res) => {
  try {
    const p = authUser(req); if (!p) return res.json({ ok: false, error: '未登录' });
    const orders = await store.ordersByUser(p.uid);
    const o = orders.find(x => Number(x.id) === Number(req.body.orderId));
    if (!o) return res.json({ ok: false, error: '订单不存在' });
    if (o.status === 'paid') return res.json({ ok: true, order: o });
    const u = await store.userById(p.uid);
    const balance = Number(u.balance) + Number(o.points);
    await store.updateUser(u.id, { balance, totalRecharged: Number(u.totalRecharged || 0) + Number(o.price) });
    await store.updateOrder(o.id, { status: 'paid', paidAt: nowIso() });
    await store.addTx({ userId: u.id, kind: 'recharge', points: Number(o.points), balanceAfter: balance, note: `充值 ${o.packageName}（测试模式）`, createdAt: nowIso() });
    const fresh = await store.userById(u.id);
    res.json({ ok: true, order: { ...o, status: 'paid' }, user: publicUser(fresh) });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

app.get('/api/my-tasks', async (req, res) => {
  const p = authUser(req); if (!p) return res.json({ ok: false, error: '未登录' });
  const list = (await store.usageByUser(p.uid)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ ok: true, tasks: list });
});
app.get('/api/my-orders', async (req, res) => {
  const p = authUser(req); if (!p) return res.json({ ok: false, error: '未登录' });
  const list = (await store.ordersByUser(p.uid)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ ok: true, orders: list });
});
app.get('/api/my-transactions', async (req, res) => {
  const p = authUser(req); if (!p) return res.json({ ok: false, error: '未登录' });
  const list = (await store.txByUser(p.uid)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ ok: true, transactions: list });
});

// ---------- 工具使用（扣费在服务端按后台最新价格算） ----------
app.post('/api/use-tool', async (req, res) => {
  try {
    const p = authUser(req); if (!p) return res.json({ ok: false, error: '未登录' });
    const { tool, durationSec, prompt, model, fileData, fileName, mime } = req.body || {};
    const pricing = await store.pricing();
    const pr = pricing[tool];
    if (!pr) return res.json({ ok: false, error: '工具不存在' });
    if (pr.enabled === false) return res.json({ ok: false, error: '该工具已在后台停用' });
    const s = await store.settingsAll();
    const u = await store.userById(p.uid);
    const { cost, detail } = computeCost(pr, tool === 'imagewm' || tool === 'imagegen' ? 0 : durationSec);

    // 图片生成：需要配置图片生成 API
    if (tool === 'imagegen') {
      if (!s.imageGenApiKey) return res.json({ ok: false, error: '图片生成 API 未配置，请在后台接口设置填写 API Key' });
      if (Number(u.balance) < cost) return res.json({ ok: false, error: '积分不足，请先充值', needRecharge: true });
      const apiUrl = s.imageGenApiUrl || 'https://api.openai.com/v1/images/generations';
      let imgResp;
      try {
        const r = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.imageGenApiKey }, body: JSON.stringify({ model: model || 'gpt-image-2', prompt: prompt || '', n: 1, size: 'auto' }) });
        imgResp = await r.json();
      } catch (e) { return res.json({ ok: false, error: '图片生成接口调用失败：' + (e.message || e) }); }
      if (imgResp.error) return res.json({ ok: false, error: '图片生成失败：' + (imgResp.error.message || JSON.stringify(imgResp.error)) });
      const imgUrl = imgResp.data && imgResp.data[0] ? (imgResp.data[0].url || ('data:image/png;base64,' + (imgResp.data[0].b64_json || ''))) : '';
      const balance = Number(u.balance) - cost;
      await store.updateUser(u.id, { balance, totalSpent: Number(u.totalSpent || 0) + cost, useCount: Number(u.useCount || 0) + 1 });
      await store.addTx({ userId: u.id, kind: 'spend', points: -cost, balanceAfter: balance, note: `${pr.name}（${detail}）`, createdAt: nowIso() });
      await store.addUsage({ userId: u.id, tool, toolName: pr.name, points: cost, billingDetail: detail, status: 'done', createdAt: nowIso() });
      const fresh = await store.userById(u.id);
      return res.json({ ok: true, resultUrl: imgUrl, balance, user: publicUser(fresh) });
    }

    // 去水印 / 去字幕：需要配置处理接口
    const apiUrl = tool === 'subtitles' ? s.subtitleApiUrl : s.watermarkApiUrl;
    if (!apiUrl) return res.json({ ok: false, error: '处理接口未配置，请在后台接口设置填写去水印/去字幕 API 地址（当前为本地预览，不扣费）' });
    if (Number(u.balance) < cost) return res.json({ ok: false, error: '积分不足，请先充值', needRecharge: true });
    const balance = Number(u.balance) - cost;
    await store.updateUser(u.id, { balance, totalSpent: Number(u.totalSpent || 0) + cost, useCount: Number(u.useCount || 0) + 1 });
    await store.addTx({ userId: u.id, kind: 'spend', points: -cost, balanceAfter: balance, note: `${pr.name}（${detail}）`, createdAt: nowIso() });
    await store.addUsage({ userId: u.id, tool, toolName: pr.name, points: cost, billingDetail: detail, status: 'processing', createdAt: nowIso() });
    let resultUrl = '';
    try {
      const form = new FormData();
      if (fileData) { const b64 = String(fileData).split(',').pop(); form.append('file', new Blob([Buffer.from(b64, 'base64')], { type: mime || 'application/octet-stream' }), fileName || 'file'); }
      form.append('type', tool); form.append('mode', 'auto');
      const r = await fetch(apiUrl, { method: 'POST', body: form });
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('application/json')) { const j = await r.json(); resultUrl = j.result_url || j.download_url || j.url || (j.data && j.data.url) || ''; }
      else if (r.ok) { resultUrl = apiUrl; }
      if (!resultUrl) throw new Error('接口未返回结果地址');
    } catch (e) {
      // 接口失败：退回积分
      await store.updateUser(u.id, { balance: Number(u.balance), totalSpent: Math.max(0, Number(u.totalSpent || 0) - cost) });
      await store.addTx({ userId: u.id, kind: 'refund', points: cost, balanceAfter: Number(u.balance), note: `${pr.name}处理失败退款`, createdAt: nowIso() });
      const fresh = await store.userById(u.id);
      return res.json({ ok: false, error: '处理接口调用失败，已退回积分：' + (e.message || e), user: publicUser(fresh) });
    }
    const fresh = await store.userById(u.id);
    res.json({ ok: true, resultUrl, balance, user: publicUser(fresh) });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

// ---------- 管理后台 ----------
app.post('/api/admin/setup', async (req, res) => {
  try {
    const s = await store.settingsAll();
    if (s.adminAccountHash && s.adminPasswordHash) return res.json({ ok: false, error: '管理账号已设置，请直接登录' });
    const account = String(req.body.account || '').trim();
    const password = String(req.body.password || '');
    if (account.length < 3) return res.json({ ok: false, error: '管理账号至少 3 个字符' });
    if (password.length < 6) return res.json({ ok: false, error: '管理密码至少 6 位' });
    await store.setting('adminAccountHash', bcrypt.hashSync(account, 10));
    await store.setting('adminPasswordHash', bcrypt.hashSync(password, 10));
    res.json({ ok: true, token: signToken({ role: 'admin' }) });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});
app.post('/api/admin/login', async (req, res) => {
  try {
    const s = await store.settingsAll();
    const account = String(req.body.account || '').trim();
    const password = String(req.body.password || '');
    // 兼容老版本：只有密码、还没补设账号的情况
    if (s.adminPasswordHash && !s.adminAccountHash) {
      if (!bcrypt.compareSync(password, s.adminPasswordHash)) return res.json({ ok: false, error: '管理密码不正确' });
      if (account.length < 3) return res.json({ ok: false, error: '请补设管理账号（至少 3 个字符）' });
      await store.setting('adminAccountHash', bcrypt.hashSync(account, 10));
      return res.json({ ok: true, token: signToken({ role: 'admin' }) });
    }
    if (!s.adminAccountHash) return res.json({ ok: false, error: '请先设置管理账号和密码', needSetup: true });
    if (!bcrypt.compareSync(account, s.adminAccountHash) || !bcrypt.compareSync(password, s.adminPasswordHash)) return res.json({ ok: false, error: '管理账号或密码不正确' });
    res.json({ ok: true, token: signToken({ role: 'admin' }) });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});
app.get('/api/admin/data', async (req, res) => {
  try {
    if (!authAdmin(req)) return res.json({ ok: false, error: '未登录管理后台' });
    const users = await store.users();
    const orders = await store.orders();
    const usage = await store.usage();
    const txs = await store.transactions();
    const pricing = await store.pricing();
    const packages = await store.packages();
    const s = await store.settingsAll();
    const today = nowIso().slice(0, 10);
    const stats = {
      users: users.length,
      todayNew: users.filter(u => String(u.createdAt || '').slice(0, 10) === today).length,
      received: orders.filter(o => o.status === 'paid').reduce((a, o) => a + Number(o.price || 0), 0),
      paidOrders: orders.filter(o => o.status === 'paid').length,
      spentPoints: txs.filter(t => t.kind === 'spend').reduce((a, t) => a + Math.abs(Number(t.points || 0)), 0),
      processCount: usage.length,
      holdingPoints: users.reduce((a, u) => a + Number(u.balance || 0), 0),
      toolsOn: Object.values(pricing).filter(p => p.enabled !== false).length
    };
    res.json({ ok: true, stats, users: users.map(u => ({ ...publicUser(u), passwordHash: undefined })).sort((a, b) => b.id - a.id), orders: orders.sort((a, b) => b.id - a.id), usage: usage.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), pricing, packages, settings: maskSettings(s) });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});
app.post('/api/admin/pricing', async (req, res) => {
  try {
    if (!authAdmin(req)) return res.json({ ok: false, error: '未登录管理后台' });
    const p = req.body || {};
    await store.setPricing(p.tool, { name: p.name, flatPoints: p.flatPoints, perSecondPoints: p.perSecondPoints, billingMode: p.billingMode, enabled: p.enabled });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});
app.post('/api/admin/packages', async (req, res) => {
  try {
    if (!authAdmin(req)) return res.json({ ok: false, error: '未登录管理后台' });
    await store.setPackages(Array.isArray(req.body.packages) ? req.body.packages : []);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});
app.post('/api/admin/adjust-credits', async (req, res) => {
  try {
    if (!authAdmin(req)) return res.json({ ok: false, error: '未登录管理后台' });
    const u = await store.userById(req.body.userId);
    if (!u) return res.json({ ok: false, error: '用户不存在' });
    const delta = Number(req.body.delta || 0);
    const balance = Math.max(0, Number(u.balance) + delta);
    await store.updateUser(u.id, { balance });
    await store.addTx({ userId: u.id, kind: delta >= 0 ? 'adjust-add' : 'adjust-sub', points: delta, balanceAfter: balance, note: '管理员手动调整积分', createdAt: nowIso() });
    res.json({ ok: true, balance });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});
app.post('/api/admin/settings', async (req, res) => {
  try {
    if (!authAdmin(req)) return res.json({ ok: false, error: '未登录管理后台' });
    const body = req.body || {};
    const allowed = ['supportContact', 'miniappAppId', 'miniappEntry', 'wechatAppId', 'merchantId', 'imageGenApiKey', 'imageGenApiUrl', 'watermarkApiUrl', 'subtitleApiUrl'];
    for (const k of allowed) if (body[k] !== undefined && body[k] !== '••••••') await store.setting(k, body[k]);
    if (body.newAdminAccount && body.newAdminPassword) {
      if (String(body.newAdminPassword).length < 6) return res.json({ ok: false, error: '新管理密码至少 6 位' });
      await store.setting('adminAccountHash', bcrypt.hashSync(String(body.newAdminAccount), 10));
      await store.setting('adminPasswordHash', bcrypt.hashSync(String(body.newAdminPassword), 10));
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

// ---------- 静态前台 ----------
app.use(express.static(path.join(__dirname, 'public')));
app.get(['/admin', '/admin/*'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('*', (req, res) => { if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: '接口不存在' }); res.sendFile(path.join(__dirname, 'public', 'index.html')); });

async function start() {
  try {
    if (USE_PG) { await pgInit(); await seedPg(); console.log('Database: Postgres'); }
    else { loadJson(); console.log('Database: local JSON file data/db.json'); }
  } catch (e) { console.error('DB init failed, falling back to local JSON:', e.message); loadJson(); }
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
start();
