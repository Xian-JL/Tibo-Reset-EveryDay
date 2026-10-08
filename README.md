# Tibo-Reset-EveryDay

简洁的 Tibo 额度重置消息列表。来源为 [Codex Resets 中文页](https://codex-resets.com/zh-CN)，保存最近 15 条消息，按时间倒序显示中文、英文原文、北京时间和原帖链接。明确提及额度 reset 的消息标星。

公开网站：[Tibo-Reset-EveryDay](https://tibo-reset-everyday.rainy-shell-2310.chatgpt.site)，无需登录即可阅读。同步写入仍需独立授权，原有每 70 分钟任务保持启用。

## 界面与验收

深色标题区清晰展示同步状态与时间；最新消息独立标注，reset 消息使用金色星标和侧边线突出。中文正文中的重置、额度和适用账户等词句高亮，英文原文保留在独立阅读区域，完整内容与时间排序不受样式调整影响。

桌面及手机布局已检查，详见 [验收记录](docs/验收记录.md) 和 [开发大纲](docs/开发大纲.md)。

![桌面预览](docs/screenshots/desktop.jpg)

## 实现

- React / TypeScript / Vinext；Cloudflare Worker 服务端；D1 持久化。
- 英文：`https://codex-resets.com/api/v1/resets?limit=20`，需要时按游标翻页。
- 中文：`https://codex-resets.com/api/resets?locale=zh-CN`，失败时使用指定中文页的公告列表。
- 双语按原帖、时间和原文匹配；原文的空白排版仅在匹配时归一化，展示内容不改写。
- 同步使用 120 秒租约与令牌防止并发写入；记录与成功时间通过 D1 事务批量提交。
- 替换消息快照后只保留最新 15 条；采集、校验或写入失败保留旧记录与成功时间。
- 中文暂不可用时，只保留与当前英文内容和时间仍匹配的旧译文。
- 页面每分钟读取本站数据库，浏览器打开或刷新不触发外部采集。
- 公开部署时，首页与 `/api/messages` 允许匿名阅读；`POST /api/sync` 始终校验服务端写入密钥。
- 写入密钥保存在 Sites 的 `SYNC_AUTH_SECRET` 加密环境变量中，不进入前端或仓库。服务器未配置密钥时拒绝写入。

## 本地开发

需要 Node.js 24 或以上（测试使用内置 TypeScript 支持和 SQLite）、npm、Git。

```sh
npm ci
npm run db:generate
node scripts/local-db.mjs
npm run dev
```

预览地址以启动日志为准，默认 `http://127.0.0.1:5173/`。本地先配置自选的测试用 `SYNC_AUTH_SECRET`（至少 24 个字符），再使用相同值的 `X-Tibo-Sync-Key` 请求头执行一次 `POST /api/sync`，可看到真实消息；`GET /api/messages` 用于读回结果。本地调试不提供长期后台调度。正式密钥仅配置在服务器，不复制到本地示例或仓库。

```sh
node --experimental-strip-types --test tests/source.test.mts tests/sync.test.mts tests/schedule.test.mts tests/sync-auth.test.mts
node --experimental-strip-types scripts/probe-source.mts
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

测试覆盖去重与时间排序、星标语境、双语匹配、失败保留、写入回滚、租约竞争及公开站点的写入授权。生产迁移由 Sites 发布流程应用，不在请求处理过程中建表。

## 云端更新操作

已部署站点的地址和项目身份以 Sites 返回及 `.openai/hosting.json` 为准。

每 70 分钟运行一次云端任务，时区 `Asia/Shanghai`。首个计划时间为 2026-10-08 16:12，此后依次为 17:22、18:32，按 70 分钟间隔继续运行。页面超过 85 分钟未成功同步时显示延迟。任务按照以下流程操作：

1. 通过所有者可用的 Sites `get_site` 读取当前站点及平台返回的服务访问凭证。站点可以公开阅读；写入授权仍须验证。
2. 使用 `OAI-Sites-Authorization: Bearer <平台返回凭证>` 及 `X-Tibo-Sync-Key: <同一平台返回凭证>` 两个请求头向该站点的 `POST /api/sync` 发请求。服务端 `SYNC_AUTH_SECRET` 必须事先配置为这个凭证，由独立写入校验决定是否允许同步。凭证仅发送到这个站点，不放入源码、日志、任务提示或浏览器。
3. 通过同一访问方式请求 `GET /api/messages`，核实消息最多 15 条且成功同步时间与写入结果相符。
4. 写接口返回 409 表示已有任务正在采集，不启动另一批采集。其他失败保留缓存，可作一次有限重试；持续失败应报告原因。

每次任务调用已部署的采集程序，常规更新只改数据库，不重建或重新部署页面。云端任务不依赖本机预览、浏览器会话或用户在场；来源接口公开可读，不需要 X API 凭证。

**权限前提：** 公开访问只开放读取。匿名同步请求、错误密钥与伪造用户身份头都会被拒绝；跨来源写入请求也被拒绝。如果平台服务凭证更换，所有者需同步更新服务端的 `SYNC_AUTH_SECRET` 并部署使其生效，再验证定时任务调用。任务遇到授权失败应报告问题，不进行匿名写入。

**任务暂停状态：** `SYNC_SCHEDULE_PAUSED=true` 时，页面显示自动同步暂停，并隐藏下次执行时间。启用任务前，先更新其授权说明，再将该环境变量改为 `false` 并部署，使页面状态与任务启停一致。当前原任务已由所有者更新并启用，周期仍为每 70 分钟。

## 已知边界

本站仅覆盖来源收录的公告与记录。观察记录使用首次观察时间，不冒充发帖时间。星标表示明确提及重置，不证明执行或个人到账。来源正文可能被截断；可识别时在页面提示，并保留原帖链接。来源更新延迟会影响本站获取新消息的时间，免费接口的持续可用性不由本站保证。
