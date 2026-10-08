# Tibo-Reset-EveryDay

简洁的 Tibo 额度重置消息列表。来源为 [Codex Resets 中文页](https://codex-resets.com/zh-CN)，保存最近 15 条消息，按时间倒序显示中文、英文原文、北京时间和原帖链接。明确提及额度 reset 的消息标星。

## 实现

- React / TypeScript / Vinext；Cloudflare Worker 服务端；D1 持久化。
- 英文：`https://codex-resets.com/api/v1/resets?limit=20`，需要时按游标翻页。
- 中文：`https://codex-resets.com/api/resets?locale=zh-CN`，失败时使用指定中文页的公告列表。
- 双语按原帖、时间和原文匹配；原文的空白排版仅在匹配时归一化，展示内容不改写。
- 同步使用 120 秒租约与令牌防止并发写入；记录与成功时间通过 D1 事务批量提交。
- 替换消息快照后只保留最新 15 条；采集、校验或写入失败保留旧记录与成功时间。
- 中文暂不可用时，只保留与当前英文内容和时间仍匹配的旧译文。
- 页面每分钟读取本站数据库，浏览器打开或刷新不触发外部采集。
- 首版站点为所有者私有，写接口依赖 Sites 的平台访问边界。

## 本地开发

需要 Node.js 24 或以上（测试使用内置 TypeScript 支持和 SQLite）、npm、Git。

```sh
npm ci
npm run db:generate
node scripts/local-db.mjs
npm run dev
```

预览地址以启动日志为准，默认 `http://127.0.0.1:5173/`。执行一次 `POST /api/sync` 后可看到真实消息；`GET /api/messages` 用于读回结果。本地调试不提供长期后台调度。

```sh
node --experimental-strip-types --test tests/source.test.mts tests/sync.test.mts
node --experimental-strip-types scripts/probe-source.mts
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

测试覆盖去重与时间排序、星标语境、双语匹配、失败保留、写入回滚以及租约竞争。生产迁移由 Sites 发布流程应用，不在请求处理过程中建表。

## 云端更新操作

已部署站点的地址和项目身份以 Sites 返回及 `.openai/hosting.json` 为准。

每 70 分钟运行一次云端任务，时区 `Asia/Shanghai`。首个计划时间为 2026-10-08 16:12，此后依次为 17:22、18:32，按 70 分钟间隔继续运行。页面超过 85 分钟未成功同步时显示延迟。任务按照以下流程操作：

1. 通过 Sites `get_site` 读取当前站点，确认仍为所有者私有，并取得平台返回的服务访问凭证。
2. 使用 `OAI-Sites-Authorization: Bearer <平台返回凭证>` 向该站点的 `POST /api/sync` 发请求。凭证仅发送到这个站点，不放入源码、日志、任务提示或浏览器。
3. 通过同一访问方式请求 `GET /api/messages`，核实消息最多 15 条且成功同步时间与写入结果相符。
4. 写接口返回 409 表示已有任务正在采集，不启动另一批采集。其他失败保留缓存，可作一次有限重试；持续失败应报告原因。

每次任务调用已部署的采集程序，常规更新只改数据库，不重建或重新部署页面。云端任务不依赖本机预览、浏览器会话或用户在场；来源接口公开可读，不需要 X API 凭证。

**权限前提：** 写接口目前依赖所有者私有的平台边界。若以后将站点分享为公开或给外部访客，先增加写接口的独立授权，再调整站点访问范围。

## 已知边界

本站仅覆盖来源收录的公告与记录。观察记录使用首次观察时间，不冒充发帖时间。星标表示明确提及重置，不证明执行或个人到账。来源正文可能被截断；可识别时在页面提示，并保留原帖链接。来源更新延迟会影响本站获取新消息的时间，免费接口的持续可用性不由本站保证。
