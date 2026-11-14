// 去字幕 · 去水印 — 前台 SPA（前台 + 管理后台 + 小程序版同一套接口）
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const state = { boot: null, user: null, token: localStorage.getItem('token') || '', adminToken: localStorage.getItem('adminToken') || '', route: '', toolFile: null, toolFileData: '', brush: null, refs: [] };
const TOOLS = {
  subtitles: { name: '视频去字幕', desc: '上传视频，框选字幕区域自动擦除', kind: 'video', priceKey: 'subtitles' },
  videowm: { name: '视频去水印', desc: '上传视频，框选水印区域自动擦除', kind: 'video', priceKey: 'videowm' },
  imagewm: { name: '图片去水印', desc: '上传图片，涂抹水印位置，智能补全背景', kind: 'image', priceKey: 'imagewm' },
  imagegen: { name: '图片生成', desc: '填提示词，可带最多 4 张参考图生图', kind: 'gen', priceKey: 'imagegen' }
};
const NAV = [
  { grp: '', items: [{ k: 'home', label: '首页', icon: '🏠' }] },
  { grp: '视频类', items: [{ k: 'subtitles', label: '视频去字幕', icon: '🎬' }, { k: 'videowm', label: '视频去水印', icon: '🎞️' }] },
  { grp: '图片类', items: [{ k: 'imagewm', label: '图片去水印', icon: '🖼️' }, { k: 'imagegen', label: '图片生成', icon: '✨' }] },
  { grp: '其他', items: [{ k: 'tasks', label: '我的任务', icon: '📋' }] }
];
const isMobile = () => window.innerWidth <= 900;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 3000); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtTime(s) { return s ? String(s).replace('T', ' ').slice(0, 19) : ''; }
function priceOf(key) { const p = state.boot && state.boot.pricing && state.boot.pricing[key]; return p ? p : { flatPoints: 0, perSecondPoints: 0, billingMode: 'flat', enabled: true }; }

async function api(path, opts) {
  const o = { headers: { 'Content-Type': 'application/json' }, ...(opts || {}) };
  if (state.token) o.headers.Authorization = 'Bearer ' + state.token;
  if (o.body && typeof o.body !== 'string') o.body = JSON.stringify(o.body);
  const r = await fetch(path, o);
  return r.json();
}
async function apiAdmin(path, opts) {
  const o = { headers: { 'Content-Type': 'application/json' }, ...(opts || {}) };
  if (state.adminToken) o.headers.Authorization = 'Bearer ' + state.adminToken;
  if (o.body && typeof o.body !== 'string') o.body = JSON.stringify(o.body);
  const r = await fetch(path, o);
  return r.json();
}
async function loadBoot() {
  try { state.boot = await api('/api/bootstrap'); } catch (e) { state.boot = null; }
  if (state.token) {
    try { const r = await api('/api/me'); if (r.ok) state.user = r.user; else { state.user = null; state.token = ''; localStorage.removeItem('token'); } } catch (e) {}
  }
}

// ---------- 导航 ----------
function navHtml(active) {
  return NAV.map(g => (g.grp ? `<div class="grp">${g.grp}</div>` : '') + g.items.map(it =>
    `<a href="#/${it.k === 'home' ? '' : it.k}" class="${active === it.k ? 'active' : ''}" data-nav><span class="ic">${it.icon}</span>${it.label}</a>`).join('')).join('');
}
function footHtml() {
  if (state.user) return `<div class="st">已登录 · ${esc(state.user.email)}<br>积分余额：<b style="color:var(--orange)">${state.user.balance}</b></div>
    <button class="btn btn-orange btn-block" onclick="goRecharge()">积分充值</button>
    <button class="btn btn-white btn-block" style="margin-top:8px" onclick="logout()">退出登录</button>`;
  return `<div class="st">未登录 · 先注册，再登录使用工具</div>
    <button class="btn btn-white btn-block" onclick="openAuth('login')">登录</button>
    <button class="btn btn-white btn-block" style="margin-top:8px" onclick="openAuth('register')">注册账号</button>
    <button class="btn btn-orange btn-block" style="margin-top:8px" onclick="openAuth('login')">积分充值</button>`;
}
function renderChrome(active) {
  $('#sideNav').innerHTML = navHtml(active);
  $('#drawerNav').innerHTML = navHtml(active);
  $('#sideFoot').innerHTML = footHtml();
  $('#drawerFoot').innerHTML = state.user
    ? `<div class="st">已登录 · ${esc(state.user.email)}<br>积分余额：<b style="color:var(--orange)">${state.user.balance}</b></div><button class="btn btn-orange btn-block" onclick="goRecharge()">积分充值</button><button class="btn btn-white btn-block" style="margin-top:8px" onclick="logout()">退出登录</button>`
    : `<button class="btn btn-orange btn-block" onclick="openAuth('login')">登录 / 注册</button>`;
  const acts = $('#topActs');
  if (isMobile()) {
    acts.innerHTML = `<button onclick="openSupport()">客服</button><button onclick="openMiniapp()">小程序</button>` +
      (state.user ? `<span class="bal">${state.user.balance}积分</span>` : `<button onclick="openAuth('login')">登录</button>`) +
      `<button class="btn btn-orange btn-sm" onclick="goRecharge()">积分充值</button>`;
  } else {
    acts.innerHTML = `<button onclick="openSupport()">客服</button><button onclick="openMiniapp()">小程序</button><button onclick="goTasks()">我的任务</button>` +
      (state.user ? `<span class="bal">${esc(state.user.nickname || state.user.email)} · ${state.user.balance}积分</span><button onclick="logout()">退出</button>` : `<button onclick="openAuth('login')">登录</button><button onclick="openAuth('register')">注册</button>`) +
      `<button class="btn btn-orange btn-sm" onclick="goRecharge()">积分充值</button>`;
  }
  $$('#sideNav a, #drawerNav a').forEach(a => a.addEventListener('click', closeDrawer));
}
function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawerBg').classList.add('hidden'); }
function openDrawer() { $('#drawer').classList.add('open'); $('#drawerBg').classList.remove('hidden'); }
$('#hamburger').onclick = openDrawer;
$('#drawerClose').onclick = closeDrawer;
$('#drawerBg').onclick = closeDrawer;
$('#adminBurger').onclick = () => $('#adminNav').classList.toggle('open');

// ---------- 路由 ----------
function route() {
  const h = location.hash || '#/';
  if (h.startsWith('#/miniapp')) return showMiniapp();
  if (h.startsWith('#/admin')) return showAdmin();
  $('#miniapp').classList.add('hidden'); $('#admin').classList.add('hidden'); $('#site').classList.remove('hidden');
  const key = h.replace('#/', '').split('?')[0] || 'home';
  state.route = key;
  const titles = { home: '首页', subtitles: '视频去字幕', videowm: '视频去水印', imagewm: '图片去水印', imagegen: '图片生成', tasks: '我的任务', recharge: '积分充值' };
  $('#crumb').textContent = titles[key] || '首页';
  renderChrome(TOOLS[key] ? key : key);
  if (key === 'home') renderHome();
  else if (TOOLS[key]) renderTool(key);
  else if (key === 'tasks') renderTasks();
  else if (key === 'recharge') renderRecharge();
  else renderHome();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
function goRecharge() { closeDrawer(); location.hash = '#/recharge'; }
function goTasks() { location.hash = '#/tasks'; }
function openMiniapp() { location.hash = '#/miniapp'; }
function openSupport() {
  const c = state.boot && state.boot.supportContact;
  toast(c ? '客服联系方式：' + c : '客服还没配置，请在后台接口设置里填写客服联系方式');
}
function logout() { state.user = null; state.token = ''; localStorage.removeItem('token'); toast('已退出登录'); route(); }

// ---------- 首页 ----------
function renderHome() {
  const p = k => priceOf(k).flatPoints;
  const el = $('#content');
  if (isMobile()) {
    el.innerHTML = `<div class="hero">
      <h1>一键去掉视频字幕与图片水印</h1>
      <p>上传视频框选字幕区域即可自动擦除，图片涂抹水印智能补全背景。网页端与小程序积分互通。</p>
      <div class="hero-btns"><a class="btn btn-orange" href="#/subtitles">开始去字幕</a><a class="btn btn-white" href="#/imagewm">图片去水印</a></div>
      <div class="checks"><span>无需安装软件</span><span>字幕区域自由框选</span><span>网页与小程序积分互通</span></div>
    </div>${toolCards()}${explainer()}`;
  } else {
    el.innerHTML = `<div class="hero">
      <h1>一键去掉视频字幕、视频水印<br>与图片水印，还能生成图片</h1>
      <p>使用流程就四步：先点「注册」用邮箱和密码创建账户，再用邮箱和密码「登录」，然后充值积分，最后上传视频框选字幕或水印区域、图片涂抹水印位置即可处理，按次扣积分；图片生成填提示词、可带最多 4 张参考图。网页版和小程序版共用同一个账号和积分。</p>
      <div class="hero-btns"><a class="btn btn-orange" href="#/subtitles">开始去字幕</a><a class="btn btn-white" href="#/videowm">视频去水印</a><a class="btn btn-white" href="#/imagewm">图片去水印</a><a class="btn btn-white" href="#/imagegen">图片生成</a></div>
      <div class="price-pill">视频去字幕 ${p('subtitles')} 积分/次 · 视频去水印 ${p('videowm')} 积分/次 · 图片去水印 ${p('imagewm')} 积分/次 · 图片生成 ${p('imagegen')} 积分/次</div>
      <div class="checks"><span>无需安装软件</span><span>字幕 / 视频水印自由框选</span><span>图片水印涂抹擦除</span><span>提示词 + 参考图生图</span></div>
    </div>${toolCards()}${explainer()}`;
  }
}
function toolCards() {
  return `<div class="cards">${Object.keys(TOOLS).map(k => {
    const t = TOOLS[k]; const pr = priceOf(t.priceKey);
    return `<div class="card" onclick="location.hash='#/${k}'"><h3>${t.name}</h3><p>${t.desc}</p><div class="price">${pr.flatPoints} 积分/次${pr.billingMode !== 'flat' ? ' · 按秒 ' + pr.perSecondPoints + ' 积分/秒' : ''}</div><div class="go">立即使用 →</div></div>`;
  }).join('')}</div>`;
}
function explainer() {
  return `<div class="section"><h2>视频去字幕、视频去水印是什么？</h2>
  <p>视频去字幕，指把已经「烧」进画面里的字幕像擦掉，再用 AI 重新补全被字幕遮挡的背景。它和播放器里的字幕开关只对处挂字幕有效不同，字幕一旦被烧进视频就只能这样处理。视频去水印同理：框选水印区域，自动擦除并补全背景。图片去水印是涂抹水印位置后智能补全。图片生成是填提示词、可带最多 4 张参考图生成图片。网页端与小程序积分互通，后台改价、改套餐后前台实时生效。</p></div>`;
}

// ---------- 登录/注册 ----------
let authMode = 'login';
function openAuth(mode) {
  authMode = mode || 'login'; closeDrawer();
  $('#authModal').classList.remove('hidden');
  setAuthMode(authMode);
}
function setAuthMode(mode) {
  authMode = mode;
  $('#tabLogin').classList.toggle('active', mode === 'login');
  $('#tabRegister').classList.toggle('active', mode === 'register');
  $('#authTitle').textContent = mode === 'login' ? '欢迎回来' : '创建账户';
  $('#authSub').textContent = mode === 'login' ? '登录您的账户以继续' : '注册以开始使用';
  $('#confirmWrap').classList.toggle('hidden', mode === 'login');
  $('#authSubmit').textContent = mode === 'login' ? '登 录' : '继 续';
  $('#authSwitch').innerHTML = mode === 'login' ? '还没有账户？<button id="authSwitchBtn">注册</button>' : '已有账户？<button id="authSwitchBtn">登录</button>';
  $('#authSwitchBtn').onclick = () => setAuthMode(mode === 'login' ? 'register' : 'login');
  $('#authErr').textContent = '';
}
$('#tabLogin').onclick = () => setAuthMode('login');
$('#tabRegister').onclick = () => setAuthMode('register');
$('#authClose').onclick = () => $('#authModal').classList.add('hidden');
$('#authModal').addEventListener('click', e => { if (e.target.id === 'authModal') $('#authModal').classList.add('hidden'); });
$$('.eye').forEach(b => b.onclick = () => { const i = document.getElementById(b.dataset.eye); i.type = i.type === 'password' ? 'text' : 'password'; });
$('#authSubmit').onclick = async () => {
  const email = $('#authEmail').value.trim();
  const pass = $('#authPass').value;
  const err = $('#authErr');
  if (!email || !pass) { err.textContent = '请填写邮箱和密码'; return; }
  if (authMode === 'register') {
    if (pass.length < 6) { err.textContent = '密码至少 6 个字符'; return; }
    if (pass !== $('#authPass2').value) { err.textContent = '两次密码不一致'; return; }
    const r = await api('/api/register', { method: 'POST', body: { email, password: pass } });
    if (!r.ok) { err.textContent = r.error || '注册失败'; return; }
    afterLogin(r);
  } else {
    const r = await api('/api/login', { method: 'POST', body: { email, password: pass } });
    if (!r.ok) { err.textContent = r.error || '登录失败'; return; }
    afterLogin(r);
  }
};
function afterLogin(r) {
  state.token = r.token; localStorage.setItem('token', r.token); state.user = r.user;
  $('#authModal').classList.add('hidden');
  toast('登录成功'); route();
}

// ---------- 工具页 ----------
function needLogin() {
  if (!state.user) { toast('请先登录'); openAuth('login'); return true; }
  return false;
}
function renderTool(key) {
  const t = TOOLS[key]; const pr = priceOf(t.priceKey);
  state.toolFile = null; state.toolFileData = ''; state.refs = [];
  const el = $('#content');
  let body = '';
  if (t.kind === 'video') {
    body = `<div class="upload" id="upBox">📁 点击上传视频（支持 mp4 / mov）<input type="file" id="fileInput" accept="video/*" class="hidden"></div>
    <div id="previewArea"></div>
    <div class="coords" id="coords"></div>
    <div class="row"><label>处理模式</label><select id="modeSel"><option>自动检测</option><option>手动框选</option></select>
    <label>擦除强度</label><select id="strSel"><option>轻度</option><option selected>中度</option><option>强力</option></select></div>`;
  } else if (t.kind === 'image') {
    body = `<div class="upload" id="upBox">🖼️ 点击上传图片<input type="file" id="fileInput" accept="image/*" class="hidden"></div>
    <div id="previewArea"></div>
    <div class="row"><label>画笔大小</label><select id="brushSel"><option value="12">小</option><option value="24" selected>中</option><option value="40">大</option></select>
    <button class="btn btn-white btn-sm" id="clearBrush">清除涂抹</button></div>`;
  } else {
    body = `<div class="field"><textarea id="prompt" rows="3" placeholder="输入提示词，例如：一张阳光下的海边度假照片"></textarea></div>
    <div class="row"><label>图片模型</label><select id="modelSel"><option value="">请选择</option><option value="gpt-image-2" selected>gpt-image-2</option><option value="gpt-image-2.5">gpt-image-2.5</option><option value="gpt-image-2.5-flare">gpt-image-2.5-flare</option><option value="gpt-image-2.5-sunburst">gpt-image-2.5-sunburst</option><option value="gpt-image-2.6">gpt-image-2.6</option></select></div>
    <div class="upload" id="upBox">＋ 添加参考图（最多 4 张）<input type="file" id="fileInput" accept="image/*" multiple class="hidden"></div>
    <div class="thumbs" id="refThumbs"></div>
    <div id="genResult"></div>`;
  }
  el.innerHTML = `<div class="toolbox"><h2>${t.name}</h2>
    <p class="sub">${t.desc} · ${pr.flatPoints} 积分/次${pr.billingMode !== 'flat' ? ' · 按秒 ' + pr.perSecondPoints + ' 积分/秒' : ''}${pr.enabled === false ? ' · 已停用' : ''}</p>
    ${body}
    <div class="progress hidden" id="prog"><i></i></div>
    <p class="status" id="status"></p>
    <button class="btn btn-orange btn-block" id="submitBtn" style="padding:14px;margin-top:8px">开始处理（${pr.flatPoints} 积分）</button>
    <p class="status" style="margin-top:10px">处理接口未配置时为本地预览，不扣费；图片生成需在后台接口设置填写 API Key。</p>
  </div>`;
  const upBox = $('#upBox'); const fi = $('#fileInput');
  upBox.onclick = () => { if (needLogin()) return; fi.click(); };
  fi.onchange = () => onFilePicked(key, fi.files);
  $('#submitBtn').onclick = () => submitTool(key);
  if (t.kind === 'image') $('#clearBrush').onclick = () => { if (state.brush) { state.brush.clear(); } };
}
function onFilePicked(key, files) {
  if (!files || !files.length) return;
  const t = TOOLS[key];
  if (t.kind === 'gen') {
    [...files].slice(0, 4 - state.refs.length).forEach(f => {
      const r = new FileReader();
      r.onload = () => { state.refs.push(r.result); renderRefs(); };
      r.readAsDataURL(f);
    });
    return;
  }
  const f = files[0];
  state.toolFile = f;
  const r = new FileReader();
  r.onload = () => { state.toolFileData = r.result; showPreview(key, r.result); };
  r.readAsDataURL(f);
}
function renderRefs() {
  $('#refThumbs').innerHTML = state.refs.map((d, i) => `<span class="ref-item"><img src="${d}"><button onclick="state.refs.splice(${i},1);renderRefs()">✕</button></span>`).join('');
}
function showPreview(key, dataUrl) {
  const area = $('#previewArea');
  if (TOOLS[key].kind === 'video') {
    area.innerHTML = `<div class="preview-wrap" id="pvWrap"><video id="pvVideo" src="${dataUrl}" controls playsinline></video><div class="selbox" id="selBox" style="left:62%;top:8%;width:30%;height:18%"><div class="handle" id="selHandle"></div></div></div>`;
    const box = $('#selBox'); const wrap = $('#pvWrap');
    const update = () => { const wr = wrap.getBoundingClientRect(); const br = box.getBoundingClientRect(); $('#coords').textContent = `框选区域：左 ${(br.left - wr.left) / wr.width * 100 | 0}% · 上 ${(br.top - wr.top) / wr.height * 100 | 0}% · 宽 ${br.width / wr.width * 100 | 0}% · 高 ${br.height / wr.height * 100 | 0}%`; };
    let drag = null;
    box.addEventListener('pointerdown', e => { if (e.target.id === 'selHandle') drag = 'resize'; else drag = 'move'; box.setPointerCapture(e.pointerId); dragX = e.clientX; dragY = e.clientY; e.preventDefault(); });
    let dragX = 0, dragY = 0;
    box.addEventListener('pointermove', e => {
      if (!drag) return;
      const wr = wrap.getBoundingClientRect(); const dx = e.clientX - dragX, dy = e.clientY - dragY; dragX = e.clientX; dragY = e.clientY;
      const st = box.style; const l = parseFloat(st.left), tp = parseFloat(st.top), w = parseFloat(st.width), h = parseFloat(st.height);
      if (drag === 'move') { st.left = Math.max(0, Math.min(100 - w, l + dx / wr.width * 100)) + '%'; st.top = Math.max(0, Math.min(100 - h, tp + dy / wr.height * 100)) + '%'; }
      else { st.width = Math.max(5, Math.min(100 - l, w + dx / wr.width * 100)) + '%'; st.height = Math.max(5, Math.min(100 - tp, h + dy / wr.height * 100)) + '%'; }
      update();
    });
    box.addEventListener('pointerup', () => drag = null);
    update();
    $('#pvVideo').onloadedmetadata = () => { state.toolDuration = $('#pvVideo').duration || 0; };
  } else {
    area.innerHTML = `<div class="preview-wrap" id="pvWrap"><img id="pvImg" src="${dataUrl}"><canvas id="brushCanvas"></canvas></div><p class="status">在图片上涂抹水印位置</p>`;
    const img = $('#pvImg'); const cv = $('#brushCanvas');
    const setup = () => {
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      const ctx = cv.getContext('2d'); let painting = false;
      const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * cv.width, y: (e.clientY - r.top) / r.height * cv.height }; };
      cv.addEventListener('pointerdown', e => { painting = true; ctx.strokeStyle = 'rgba(249,115,22,.55)'; ctx.lineWidth = Number($('#brushSel').value || 24); ctx.lineCap = 'round'; ctx.beginPath(); const p = pos(e); ctx.moveTo(p.x, p.y); cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', e => { if (!painting) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
      cv.addEventListener('pointerup', () => painting = false);
      state.brush = { clear: () => ctx.clearRect(0, 0, cv.width, cv.height) };
    };
    if (img.complete) setup(); else img.onload = setup;
  }
}
async function submitTool(key) {
  if (needLogin()) return;
  const t = TOOLS[key]; const pr = priceOf(t.priceKey);
  const status = $('#status'); const prog = $('#prog');
  if (t.kind !== 'gen' && !state.toolFile) { status.textContent = '请先上传文件'; return; }
  if (t.kind === 'gen') {
    const prompt = ($('#prompt').value || '').trim();
    if (!prompt) { status.textContent = '请先填写提示词'; return; }
    const model = $('#modelSel').value;
    if (!model) { status.textContent = '请选择图片模型'; return; }
    if (state.user.balance < pr.flatPoints) { status.textContent = '积分不足，请先充值'; toast('积分不足，请先充值'); return; }
    prog.classList.remove('hidden'); prog.firstElementChild.style.width = '40%'; status.textContent = '生成中…';
    const r = await api('/api/use-tool', { method: 'POST', body: { tool: key, prompt, model, durationSec: 0 } });
    prog.firstElementChild.style.width = '100%';
    if (!r.ok) { status.textContent = r.error || '生成失败'; return; }
    state.user = r.user;
    $('#genResult').innerHTML = `<p class="status">生成完成，剩余积分 ${r.balance}</p><img src="${esc(r.resultUrl)}" style="width:100%;border-radius:14px;margin-top:10px">`;
    status.textContent = '生成完成'; renderChrome(key);
    return;
  }
  const dur = state.toolDuration || 0;
  const cost = pr.billingMode === 'flat' ? pr.flatPoints : pr.billingMode === 'perSecond' ? Math.max(1, Math.ceil(dur)) * pr.perSecondPoints : pr.flatPoints + Math.max(1, Math.ceil(dur)) * pr.perSecondPoints;
  if (state.user.balance < cost) { status.textContent = `积分不足（本次约扣 ${cost} 积分），请先充值`; toast('积分不足，请先充值'); return; }
  prog.classList.remove('hidden'); prog.firstElementChild.style.width = '30%'; status.textContent = '处理中…';
  const r = await api('/api/use-tool', { method: 'POST', body: { tool: key, durationSec: dur, fileData: state.toolFileData, fileName: state.toolFile ? state.toolFile.name : '', mime: state.toolFile ? state.toolFile.type : '' } });
  prog.firstElementChild.style.width = '100%';
  if (!r.ok) { status.textContent = r.error || '处理失败'; if (r.user) { state.user = r.user; renderChrome(key); } return; }
  state.user = r.user;
  status.innerHTML = `处理完成，剩余积分 ${r.balance}` + (r.resultUrl ? `<br><a href="${esc(r.resultUrl)}" target="_blank" style="color:var(--orange)">下载结果 →</a>` : '');
  renderChrome(key);
}

// ---------- 我的任务 / 充值 ----------
async function renderTasks() {
  const el = $('#content');
  if (!state.user) { el.innerHTML = `<div class="toolbox"><h2>我的任务</h2><p class="sub">请先登录查看使用记录、订单和积分流水。</p><button class="btn btn-orange" onclick="openAuth('login')">去登录</button></div>`; return; }
  el.innerHTML = `<div class="toolbox"><h2>我的任务</h2><p class="sub">${esc(state.user.email)} · 积分余额 ${state.user.balance} · 累计消费 ${state.user.totalSpent} · 使用 ${state.user.useCount} 次</p><div class="tabs"><button class="active" data-tt="tasks">使用记录</button><button data-tt="orders">订单记录</button><button data-tt="tx">积分流水</button></div><div id="taskList">加载中…</div></div>`;
  const show = async kind => {
    $$('#content .tabs button').forEach(b => b.classList.toggle('active', b.dataset.tt === kind));
    const box = $('#taskList');
    if (kind === 'tasks') { const r = await api('/api/my-tasks'); box.innerHTML = r.tasks && r.tasks.length ? `<table><tr><th>时间</th><th>工具</th><th>扣分</th><th>计费</th><th>状态</th></tr>${r.tasks.map(t => `<tr><td>${fmtTime(t.createdAt)}</td><td>${esc(t.toolName)}</td><td>${t.points}</td><td>${esc(t.billingDetail || '')}</td><td>${esc(t.status)}</td></tr>`).join('')}</table>` : '暂无使用记录'; }
    if (kind === 'orders') { const r = await api('/api/my-orders'); box.innerHTML = r.orders && r.orders.length ? `<table><tr><th>时间</th><th>套餐</th><th>金额</th><th>积分</th><th>状态</th></tr>${r.orders.map(o => `<tr><td>${fmtTime(o.createdAt)}</td><td>${esc(o.packageName)}</td><td>¥${o.price}</td><td>${o.points}</td><td>${o.status === 'paid' ? '已支付' : '待支付'}</td></tr>`).join('')}</table>` : '暂无订单'; }
    if (kind === 'tx') { const r = await api('/api/my-transactions'); box.innerHTML = r.transactions && r.transactions.length ? `<table><tr><th>时间</th><th>类型</th><th>积分</th><th>余额</th><th>备注</th></tr>${r.transactions.map(t => `<tr><td>${fmtTime(t.createdAt)}</td><td>${esc(t.kind)}</td><td>${t.points > 0 ? '+' : ''}${t.points}</td><td>${t.balanceAfter}</td><td>${esc(t.note || '')}</td></tr>`).join('')}</table>` : '暂无流水'; }
  };
  $$('#content .tabs button').forEach(b => b.onclick = () => show(b.dataset.tt));
  show('tasks');
}
async function renderRecharge() {
  const el = $('#content');
  if (!state.user) { el.innerHTML = `<div class="toolbox"><h2>积分充值</h2><p class="sub">请先登录再充值。</p><button class="btn btn-orange" onclick="openAuth('login')">去登录</button></div>`; return; }
  const pkgs = (state.boot && state.boot.packages) || [];
  el.innerHTML = `<div class="toolbox"><h2>积分充值</h2><p class="sub">当前余额：<b style="color:var(--orange)">${state.user.balance} 积分</b> · 测试模式：确认后直接到账，未接入真实微信支付</p>
  ${pkgs.map(p => `<div class="pkg"><div><b>${esc(p.name)}</b><div class="pr">¥${p.price} · ${esc(p.desc || '')}</div></div><div style="text-align:right"><div class="pts">${p.points} 积分</div><button class="btn btn-orange btn-sm" style="margin-top:6px" onclick="buyPackage(${p.id})">购买</button></div></div>`).join('') || '暂无套餐，请在后台添加'}
  <p class="status" id="reStatus"></p></div>`;
}
async function buyPackage(id) {
  const r = await api('/api/create-order', { method: 'POST', body: { packageId: id } });
  if (!r.ok) { toast(r.error || '下单失败'); return; }
  $('#reStatus').textContent = '订单已创建（测试模式），正在确认到账…';
  const r2 = await api('/api/confirm-order', { method: 'POST', body: { orderId: r.order.id } });
  if (!r2.ok) { toast(r2.error || '确认失败'); return; }
  state.user = r2.user;
  $('#reStatus').textContent = `充值成功，到账 ${r.order.points} 积分，当前余额 ${r2.user.balance}`;
  toast('充值成功'); renderChrome('recharge'); renderRecharge();
}

// ---------- 小程序版 ----------
function showMiniapp() {
  $('#site').classList.add('hidden'); $('#admin').classList.add('hidden'); $('#miniapp').classList.remove('hidden');
  const tab = (location.hash.split('/')[2] || 'index');
  const tabs = [{ k: 'index', label: '首页', icon: '🏠' }, { k: 'tools', label: '工具', icon: '🧰' }, { k: 'mine', label: '我的', icon: '👤' }];
  $('#miniTabs').innerHTML = tabs.map(t => `<button class="${tab === t.k ? 'active' : ''}" onclick="location.hash='#/miniapp/${t.k}'"><span class="tic">${t.icon}</span>${t.label}</button>`).join('');
  const body = $('#miniBody');
  if (tab === 'tools') {
    body.innerHTML = `<div class="section" style="margin-top:0"><h2>全部工具</h2>${Object.keys(TOOLS).map(k => { const t = TOOLS[k]; const pr = priceOf(t.priceKey); return `<div class="tool-row" onclick="location.hash='#/${k}'"><div><b>${t.name}</b><div style="color:var(--muted);font-size:13px">${t.desc}</div></div><span class="tag">${pr.flatPoints} 积分/次 ›</span></div>`; }).join('')}</div>`;
  } else if (tab === 'mine') {
    body.innerHTML = state.user
      ? `<div class="section" style="margin-top:0"><h2>我的</h2><p>${esc(state.user.email)}</p><p style="margin-top:8px">积分余额：<b style="color:var(--orange)">${state.user.balance}</b></p><p style="margin-top:8px">累计消费 ${state.user.totalSpent} · 使用 ${state.user.useCount} 次</p><div style="margin-top:16px;display:grid;gap:10px"><button class="btn btn-orange" onclick="location.hash='#/recharge'">积分充值</button><button class="btn btn-white" onclick="location.hash='#/tasks'">我的任务</button><button class="btn btn-white" onclick="logout();location.hash='#/miniapp/mine'">退出登录</button></div></div>`
      : `<div class="section" style="margin-top:0"><h2>我的</h2><p style="color:var(--muted)">还没登录</p><div style="margin-top:16px"><button class="btn btn-orange btn-block" onclick="openAuth('login')">登录 / 注册</button></div></div>`;
  } else {
    const p = k => priceOf(k).flatPoints;
    body.innerHTML = `<div class="hero"><h1 style="font-size:24px">一键去掉视频字幕与图片水印</h1><p>上传视频框选字幕区域即可自动擦除，图片涂抹水印智能补全背景。网页端与小程序积分互通。</p>
    <div class="hero-btns"><a class="btn btn-orange" href="#/subtitles">开始去字幕</a><a class="btn btn-white" href="#/imagewm">图片去水印</a></div>
    <div class="price-pill">视频去字幕 ${p('subtitles')} 积分/次 · 视频去水印 ${p('videowm')} 积分/次 · 图片去水印 ${p('imagewm')} 积分/次 · 图片生成 ${p('imagegen')} 积分/次</div>
    <div class="checks"><span>无需安装软件</span><span>字幕区域自由框选</span><span>网页与小程序积分互通</span></div></div>
    <div class="section"><h2>四个工具</h2>${Object.keys(TOOLS).map(k => { const t = TOOLS[k]; const pr = priceOf(t.priceKey); return `<div class="tool-row" onclick="location.hash='#/${k}'"><div><b>${t.name}</b><div style="color:var(--muted);font-size:13px">${t.desc}</div></div><span class="tag">${pr.flatPoints} 积分 ›</span></div>`; }).join('')}</div>
    <p style="text-align:center;margin-top:14px"><a href="#/" style="color:var(--orange)">返回网页版 →</a></p>`;
  }
  window.scrollTo(0, 0);
}

// ---------- 管理后台 ----------
const ADMIN_TABS = [['pricing', '价格设置'], ['packages', '充值套餐'], ['users', '用户管理'], ['orders', '订单记录'], ['settings', '接口设置']];
let adminTab = 'pricing'; let adminData = null;
async function showAdmin() {
  $('#site').classList.add('hidden'); $('#miniapp').classList.add('hidden'); $('#admin').classList.remove('hidden');
  if (!state.adminToken) return renderAdminLogin();
  const r = await apiAdmin('/api/admin/data');
  if (!r.ok) { state.adminToken = ''; localStorage.removeItem('adminToken'); return renderAdminLogin(r.error); }
  adminData = r; renderAdmin();
}
function renderAdminLogin(errMsg) {
  const needSetup = state.boot && state.boot.adminSetupNeeded;
  $('#adminNav').innerHTML = '';
  $('#adminMain').innerHTML = `<div style="max-width:420px;margin:60px auto"><div class="admin-card"><h3>管理后台${needSetup ? ' · 首次设置' : '登录'}</h3>
  <p style="color:var(--muted);font-size:14px;line-height:1.7;margin-bottom:16px">${needSetup ? '第一次打开请设置管理账号和管理密码，之后用账号加密码登录。' : '输入你设置的管理账号和密码进入。'}</p>
  <div class="err">${errMsg ? esc(errMsg) : ''}</div>
  <div class="field"><input type="text" id="admAccount" placeholder="管理账号"></div>
  <div class="field"><input type="password" id="admPass" placeholder="管理密码"></div>
  <button class="btn btn-orange btn-block" id="admGo">进入后台</button>
  <p style="text-align:center;margin-top:14px"><a href="#/" style="color:var(--orange)">← 返回前台</a></p></div></div>`;
  $('#admGo').onclick = async () => {
    const account = $('#admAccount').value.trim(); const password = $('#admPass').value;
    const url = needSetup ? '/api/admin/setup' : '/api/admin/login';
    const r = await apiAdmin(url, { method: 'POST', body: { account, password } });
    if (!r.ok) { document.querySelector('#adminMain .err').textContent = r.error || '登录失败'; return; }
    state.adminToken = r.token; localStorage.setItem('adminToken', r.token);
    state.boot.adminSetupNeeded = false; showAdmin();
  };
}
function renderAdmin() {
  const d = adminData; const s = d.stats;
  $('#adminNav').innerHTML = `<h1>管理后台</h1>` + ADMIN_TABS.map(([k, label]) => `<a href="javascript:void(0)" class="${adminTab === k ? 'active' : ''}" onclick="adminTab='${k}';renderAdmin()">${label}</a>`).join('') +
    `<a href="#/" class="quit">← 返回前台</a><a href="javascript:void(0)" class="quit" onclick="state.adminToken='';localStorage.removeItem('adminToken');showAdmin()">退出后台</a>`;
  let html = `<div class="admin-top"><h2 style="font-size:20px">管理后台</h2><span style="color:var(--muted);font-size:14px">前台地址：<a href="#/" style="color:var(--orange)">#/</a> · 后台入口：#/admin</span></div>
  <div class="stat-grid">
    <div class="stat"><div class="l">注册用户</div><div class="n">${s.users}</div></div>
    <div class="stat"><div class="l">今日新增用户</div><div class="n">${s.todayNew}</div></div>
    <div class="stat"><div class="l">已收款</div><div class="n">¥${s.received}</div></div>
    <div class="stat"><div class="l">付费订单</div><div class="n">${s.paidOrders}</div></div>
    <div class="stat"><div class="l">已消费积分</div><div class="n">${s.spentPoints}</div></div>
    <div class="stat"><div class="l">处理次数</div><div class="n">${s.processCount}</div></div>
    <div class="stat"><div class="l">用户持有积分</div><div class="n">${s.holdingPoints}</div></div>
    <div class="stat"><div class="l">在售工具</div><div class="n">${s.toolsOn}</div></div>
  </div>`;
  if (adminTab === 'pricing') {
    html += `<div class="admin-card"><h3>价格设置</h3><p style="color:var(--muted);font-size:14px;margin-bottom:14px">每个工具可设一次性生成扣多少积分、每秒扣多少积分、计费方式。视频按真实时长（不足 1 秒按 1 秒）计费，扣费在服务端按最新价格算。</p>` +
      Object.keys(d.pricing).map(k => { const p = d.pricing[k]; return `<div style="border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:12px">
      <b>${esc(p.name)}</b> <label style="margin-left:12px;font-size:14px"><input type="checkbox" id="en-${k}" ${p.enabled !== false ? 'checked' : ''}> 在售</label>
      <div class="form-grid" style="margin-top:12px">
      <div><label style="font-size:13px;color:var(--muted)">一次性生成扣多少积分</label><input type="number" id="flat-${k}" value="${p.flatPoints}"></div>
      <div><label style="font-size:13px;color:var(--muted)">每秒扣多少积分</label><input type="number" id="sec-${k}" value="${p.perSecondPoints}"></div>
      <div class="full"><label style="font-size:13px;color:var(--muted)">计费方式</label><select id="mode-${k}"><option value="flat" ${p.billingMode === 'flat' ? 'selected' : ''}>一次性按次</option><option value="perSecond" ${p.billingMode === 'perSecond' ? 'selected' : ''}>按秒</option><option value="both" ${p.billingMode === 'both' ? 'selected' : ''}>一次性+按秒</option></select></div>
      </div><button class="btn btn-orange btn-sm" style="margin-top:12px" onclick="savePricing('${k}')">保存${esc(p.name)}</button></div>`; }).join('') + `</div>`;
  }
  if (adminTab === 'packages') {
    html += `<div class="admin-card"><h3>充值套餐</h3><div id="pkgList">${d.packages.map((p, i) => `<div class="form-grid" style="margin-bottom:10px"><div><input data-pkg="${i}" data-f="name" value="${esc(p.name)}"></div><div><input data-pkg="${i}" data-f="points" type="number" value="${p.points}" placeholder="积分"></div><div><input data-pkg="${i}" data-f="price" type="number" step="0.01" value="${p.price}" placeholder="价格 ¥"></div><div><input data-pkg="${i}" data-f="desc" value="${esc(p.desc || '')}" placeholder="说明"></div></div>`).join('')}</div>
    <button class="btn btn-white btn-sm" onclick="addPkgRow()">＋ 添加套餐</button> <button class="btn btn-orange btn-sm" onclick="savePackages()">保存套餐</button></div>`;
  }
  if (adminTab === 'users') {
    html += `<div class="admin-card"><h3>用户管理</h3><input type="text" id="userSearch" placeholder="按邮箱搜索…" style="margin-bottom:14px" oninput="renderAdminUsers(this.value)">
    <div style="overflow-x:auto"><table><tr><th>编号</th><th>注册邮箱</th><th>注册时间</th><th>最近登录</th><th>余额</th><th>累计充值</th><th>累计消费</th><th>使用次数</th><th>操作</th></tr><tbody id="userRows"></tbody></table></div></div>`;
  }
  if (adminTab === 'orders') {
    html += `<div class="admin-card"><h3>订单记录</h3><div style="overflow-x:auto"><table><tr><th>订单号</th><th>用户</th><th>套餐</th><th>金额</th><th>积分</th><th>状态</th><th>时间</th></tr>${d.orders.map(o => { const u = d.users.find(x => x.id === o.userId); return `<tr><td>${o.id}</td><td>${u ? esc(u.email) : o.userId}</td><td>${esc(o.packageName)}</td><td>¥${o.price}</td><td>${o.points}</td><td>${o.status === 'paid' ? '已支付' : '待支付'}</td><td>${fmtTime(o.createdAt)}</td></tr>`; }).join('') || '<tr><td colspan="7">暂无订单</td></tr>'}</table></div></div>
    <div class="admin-card"><h3>使用记录</h3><div style="overflow-x:auto"><table><tr><th>时间</th><th>用户</th><th>工具</th><th>扣分</th><th>计费</th><th>状态</th></tr>${d.usage.map(u => { const us = d.users.find(x => x.id === u.userId); return `<tr><td>${fmtTime(u.createdAt)}</td><td>${us ? esc(us.email) : u.userId}</td><td>${esc(u.toolName)}</td><td>${u.points}</td><td>${esc(u.billingDetail || '')}</td><td>${esc(u.status)}</td></tr>`; }).join('') || '<tr><td colspan="6">暂无记录</td></tr>'}</table></div></div>`;
  }
  if (adminTab === 'settings') {
    const st = d.settings;
    html += `<div class="admin-card"><h3>接口设置</h3><div class="form-grid">
    <div><label style="font-size:13px;color:var(--muted)">客服联系方式</label><input id="set-supportContact" value="${esc(st.supportContact || '')}"></div>
    <div><label style="font-size:13px;color:var(--muted)">小程序 AppID</label><input id="set-miniappAppId" value="${esc(st.miniappAppId || '')}"></div>
    <div class="full"><label style="font-size:13px;color:var(--muted)">小程序入口</label><input id="set-miniappEntry" value="${esc(st.miniappEntry || '')}"></div>
    <div><label style="font-size:13px;color:var(--muted)">微信 AppID</label><input id="set-wechatAppId" value="${esc(st.wechatAppId || '')}"></div>
    <div><label style="font-size:13px;color:var(--muted)">微信支付商户号</label><input id="set-merchantId" value="${esc(st.merchantId || '')}"></div>
    <div><label style="font-size:13px;color:var(--muted)">去水印 API 地址</label><input id="set-watermarkApiUrl" value="${esc(st.watermarkApiUrl || '')}"></div>
    <div><label style="font-size:13px;color:var(--muted)">去字幕 API 地址</label><input id="set-subtitleApiUrl" value="${esc(st.subtitleApiUrl || '')}"></div>
    <div><label style="font-size:13px;color:var(--muted)">图片生成 API 地址</label><input id="set-imageGenApiUrl" value="${esc(st.imageGenApiUrl || '')}"></div>
    <div><label style="font-size:13px;color:var(--muted)">图片生成 API Key（已填写显示为 ••••••）</label><input id="set-imageGenApiKey" value="${esc(st.imageGenApiKey || '')}" placeholder="未填写"></div>
    </div><button class="btn btn-orange btn-sm" style="margin-top:14px" onclick="saveSettings()">保存接口设置</button></div>
    <div class="admin-card"><h3>修改管理账号密码</h3><div class="form-grid"><div><label style="font-size:13px;color:var(--muted)">新管理账号</label><input id="set-newAdminAccount"></div><div><label style="font-size:13px;color:var(--muted)">新管理密码（至少 6 位）</label><input id="set-newAdminPassword" type="password"></div></div><button class="btn btn-orange btn-sm" style="margin-top:14px" onclick="saveAdminCreds()">修改账号密码</button></div>`;
  }
  $('#adminMain').innerHTML = html;
  if (adminTab === 'users') renderAdminUsers('');
}
function renderAdminUsers(q) {
  const rows = adminData.users.filter(u => !q || u.email.toLowerCase().includes(q.toLowerCase()));
  $('#userRows').innerHTML = rows.map(u => `<tr><td>U${u.id}</td><td>${esc(u.email)}</td><td>${fmtTime(u.createdAt)}</td><td>${fmtTime(u.lastLoginAt)}</td><td>${u.balance}</td><td>¥${u.totalRecharged}</td><td>${u.totalSpent}</td><td>${u.useCount}</td><td><button class="btn btn-white btn-sm" onclick="adjustCredits(${u.id},1)">+10</button> <button class="btn btn-white btn-sm" onclick="adjustCredits(${u.id},-1)">-10</button></td></tr>`).join('') || '<tr><td colspan="9">没有匹配的用户</td></tr>';
}
async function savePricing(tool) {
  const p = adminData.pricing[tool];
  const body = { tool, name: p.name, flatPoints: Number(document.getElementById('flat-' + tool).value), perSecondPoints: Number(document.getElementById('sec-' + tool).value), billingMode: document.getElementById('mode-' + tool).value, enabled: document.getElementById('en-' + tool).checked };
  const r = await apiAdmin('/api/admin/pricing', { method: 'POST', body });
  if (r.ok) { toast('已保存'); showAdmin(); } else toast(r.error || '保存失败');
}
function addPkgRow() {
  const list = document.getElementById('pkgList');
  const i = list.querySelectorAll('.form-grid').length;
  const div = document.createElement('div'); div.className = 'form-grid'; div.style.marginBottom = '10px';
  div.innerHTML = `<div><input data-pkg="${i}" data-f="name" value="新套餐"></div><div><input data-pkg="${i}" data-f="points" type="number" value="100"></div><div><input data-pkg="${i}" data-f="price" type="number" step="0.01" value="9.9"></div><div><input data-pkg="${i}" data-f="desc" value=""></div>`;
  list.appendChild(div);
}
async function savePackages() {
  const rows = [...document.querySelectorAll('#pkgList .form-grid')];
  const packages = rows.map(r => { const o = {}; r.querySelectorAll('input').forEach(i => o[i.dataset.f] = i.value); return { name: o.name, points: Number(o.points), price: Number(o.price), desc: o.desc || '' }; }).filter(p => p.name);
  const r = await apiAdmin('/api/admin/packages', { method: 'POST', body: { packages } });
  if (r.ok) { toast('已保存'); showAdmin(); } else toast(r.error || '保存失败');
}
async function adjustCredits(uid, dir) {
  const r = await apiAdmin('/api/admin/adjust-credits', { method: 'POST', body: { userId: uid, delta: dir * 10 } });
  if (r.ok) { toast('已调整，余额 ' + r.balance); showAdmin(); } else toast(r.error || '调整失败');
}
async function saveSettings() {
  const body = {};
  ['supportContact', 'miniappAppId', 'miniappEntry', 'wechatAppId', 'merchantId', 'imageGenApiKey', 'imageGenApiUrl', 'watermarkApiUrl', 'subtitleApiUrl'].forEach(k => body[k] = document.getElementById('set-' + k).value);
  const r = await apiAdmin('/api/admin/settings', { method: 'POST', body });
  if (r.ok) { toast('已保存'); showAdmin(); } else toast(r.error || '保存失败');
}
async function saveAdminCreds() {
  const body = { newAdminAccount: document.getElementById('set-newAdminAccount').value.trim(), newAdminPassword: document.getElementById('set-newAdminPassword').value };
  if (!body.newAdminAccount || !body.newAdminPassword) { toast('请填写新账号和新密码'); return; }
  const r = await apiAdmin('/api/admin/settings', { method: 'POST', body });
  if (r.ok) { toast('管理账号密码已修改，请重新登录'); state.adminToken = ''; localStorage.removeItem('adminToken'); showAdmin(); } else toast(r.error || '修改失败');
}

// ---------- 启动 ----------
(async () => { await loadBoot(); route(); })();
