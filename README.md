# 去字幕 · 去水印 — Render 部署版

积分制工具站：视频去字幕、视频去水印、图片去水印、图片生成。
前台 + 管理后台 + 小程序版共用同一后台数据库。

## 部署步骤（Render 免费版）

1. **上传到 GitHub**：把这个文件夹里的全部内容传到一个新建的 GitHub 仓库（不要传 `node_modules`，也不要传 `data/`）。
2. **Render 新建 Web Service**：打开 [render.com](https://render.com) → New → Web Service → 选这个仓库。
   - 如果仓库里有 `render.yaml`，Render 会按它自动创建服务和免费数据库；也可以手动建：Build Command 填 `npm install`，Start Command 填 `node server.js`，Plan 选 Free。
3. **数据库**：在 Render 里新建一个免费 Postgres（New → Postgres，Plan 选 Free），把它的连接串填到 Web Service 的环境变量 `DATABASE_URL` 里。没填 `DATABASE_URL` 时，服务会用本地 `data/db.json` 文件存储（Render 免费版重启后文件会丢，只适合临时测试）。
4. **打开网址**：部署完成后 Render 会给一个 `https://xxx.onrender.com` 的地址，打开就是前台。
5. **设置管理后台**：在网址后面加 `#/admin` 打开（也可以用 `/admin`），第一次设置管理账号和管理密码，之后用账号加密码登录。里面可以改价格、充值套餐、管理用户、看订单、填接口设置。
6. **填接口**：后台 → 接口设置，填去水印 / 去字幕 API 地址、图片生成 API Key（图片生成用 OpenAI 兼容接口）。没填之前，工具是本地预览，不扣费。
7. **小程序**：小程序工程的 `config.js` 里把 `BASE_URL` 填成这个 Render 地址，并把这个域名加到小程序后台「开发管理 → 开发设置 → request合法域名」里。

## 注意事项

- **Render 免费版 15 分钟没人访问会休眠**，下一个人打开要等 30–60 秒才唤醒，属正常现象。
- **免费 Postgres 30 天后过期会被删**，正式用请升级付费数据库或定期备份。
- **测试模式**：充值目前是测试模式（点确认直接到账，不走真实微信支付）。接通真实微信支付需要微信支付商户号，填到后台接口设置里再对接。
- 环境变量建议：`TOKEN_SECRET` 填一个随机长字符串（Render 的 render.yaml 已自动生成）。
- 本地运行：`npm install && node server.js`，打开 http://localhost:3000。
