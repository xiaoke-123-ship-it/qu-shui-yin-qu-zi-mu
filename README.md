# 去字幕 · 去水印 — Railway 部署版

积分制工具站：视频去字幕、视频去水印、图片去水印、图片生成。
前台 + 管理后台 + 小程序版共用同一后台数据库。

## 部署步骤（Railway）

1. **更新 GitHub 仓库**：把这个文件夹里的内容传到同一个 GitHub 仓库 `qu-shui-yin-qu-zi-mu`（覆盖 `package.json`、`server.js`、`README.md`，新加 `railway.json`；不要传 `node_modules`，也不要传 `data/`）。
2. **注册/登录 Railway**：打开 [railway.app](https://railway.app)，点 Login，用 GitHub 账号登录（试用额度不用绑信用卡）。
3. **新建项目**：点 New Project → Deploy from GitHub repo → 选 `qu-shui-yin-qu-zi-mu` 仓库。Railway 会按 `railway.json` 自动安装依赖并启动（`npm install` → `node server.js`）。
4. **加数据库（必须做）**：在项目里点 + New → Database → Add PostgreSQL。Railway 会自动给 Web Service 注入 `DATABASE_URL`，服务会自动连上 Postgres。
   - 如果服务没有自动拿到 `DATABASE_URL`：点 Postgres 服务 → Variables → 复制 `DATABASE_URL` 的值，再点 Web Service → Variables → New Variable，Key 填 `DATABASE_URL`，Value 粘贴进去，服务会自动重新部署。
   - **注意：Railway 的服务器文件系统是临时的，重启/重新部署后本地 `data/db.json` 里的数据会丢，所以必须用 Postgres 才能正式使用。** 没配数据库时服务也能跑，但用户、积分、订单只存在内存/临时文件里。
5. **等部署完成**：点 Web Service → Deployments，看状态变成成功（Active）。
6. **拿网址**：点 Web Service → Settings → Networking → Generate Domain，生成一个 `https://xxx.up.railway.app` 的地址，打开就是前台。
7. **注册账号**：打开网址，用邮箱注册一个账号。
8. **设置管理后台**：在网址后面加 `#/admin` 打开（也可以用 `/admin`），第一次设置管理账号和管理密码，之后用账号加密码登录。里面可以改价格、充值套餐、管理用户、看订单、填接口设置。
9. **填接口**：后台 → 接口设置，填去水印 / 去字幕 API 地址、图片生成 API Key（图片生成用 OpenAI 兼容接口）。没填之前，工具是本地预览，不扣费。
10. **小程序**：小程序工程的 `config.js` 里把 `BASE_URL` 填成这个 Railway 地址，并把这个域名加到小程序后台「开发管理 → 开发设置 → request合法域名」里。

## 费用说明（请先看清楚）

- **Railway 给的是一次性 $5 试用额度，不用绑卡。额度用完后，Hobby 套餐是 $5/月 + 实际用量**，不是永久免费。也就是说：先用 $5 额度免费跑一阵子，额度耗尽后要继续用就得付 $5/月起。
- 这和 Render 的免费档不一样（Render 免费档永久 $0，但要绑信用卡才能建服务；免费 Postgres 30 天过期）。`render.yaml` 还留在仓库里，以后想回 Render 部署也可以。
- 建议再加一个环境变量：Web Service → Variables → New Variable，Key 填 `TOKEN_SECRET`，Value 填一串随机长字符（登录凭证的签名密钥）。

## 注意事项

- **测试模式**：充值目前是测试模式（点确认直接到账，不走真实微信支付）。接通真实微信支付需要微信支付商户号，填到后台接口设置里再对接。
- 本地运行：`npm install && node server.js`，打开 http://localhost:3000。
