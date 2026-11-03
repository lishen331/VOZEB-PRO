# 图片结果先落 OSS + 兔子栈溢出修复 开发文档

日期：2026-10-09　状态：第 1 部分已部署 staging（提交 ba0ea742，run 37825468682 成功），待 4K 实测；第 2 部分经核对代码，结论是不需要改

## 1. 兔子渠道 RangeError（已改，已部署 staging）

### 根因（已复现）

- 位置：`web/src/lib/server/media-task-diagnostics.ts` 的 `redactDiagnosticText`，正则 `/[A-Za-z0-9+/=]{256,}/g`。
- 输入是几 MB 连续 base64 时，V8 正则回溯栈溢出，抛 `RangeError: Maximum call stack size exceeded`。
- 本地 vitest 探针：5MB 正常，6MB 起必现，栈顶就是这一行。生产 Node 版本的阈值可能略有不同，部署前需要再确认。
- 和响应体大小强相关：历史 RangeError 全部出现在大图上，10-03、10-06、10-07 已零星出现，10-08 改成大尺寸后集中爆发。
- 所有调用方最终只保留 512～2048 字符，扫描整段原文没有意义。

### 修改

- 新增 `DIAGNOSTIC_TEXT_SCAN_LIMIT = 16KB`。替换完密钥后先截断到 16KB，再跑正则。
- 截断后的结果仍会经过 `[blob omitted]` 和 URL、Token 脱敏，不会泄露信息。
- 新增测试：10MB 的 base64 错误体不抛异常，结果包含 `[blob omitted]`，长度 ≤ 2048。

### 验证

- `vitest run media-task-diagnostics.test.ts`：通过。
- `tsc --noEmit`：无报错。

### 未覆盖

- 还没有在生产用真实 6MB 以上的兔子响应回放验证，需要部署后看 RangeError 是否归零。
- 已经误判为 `needs_review` 的历史任务不会自动恢复，需要单独处理。

## 2. 图片结果先落 OSS，服务器只流转 URL（核对后：现有代码已经这样做，不改）

### 目标

上游仍返回 b64_json。服务器拿到响应后立刻写入 OSS，之后任务状态、轮询、前端拿到的都只有 URL。

### 现状（已逐行读代码确认）

所有图片结果（同步、轮询、custom 协议、恢复任务）都经过同一个入口 `web/src/lib/server/image-task-runtime.ts:224` 的 `handleImageProviderResult`：

1. 第 262 行调用 `prepareImageTaskResults`（`image-task-result-service.ts:12`），按顺序做：去重 → 透明图校验（第 25 行）→ 分层校验（第 34 行）→ `persistPreparedResults`（第 57 行）调 `normalizeAssets` 上传 OSS，拿回 `serverUrl`。
2. 第 274 行 `updateImageTask` 才第一次写数据库，写进去的是 `serverUrl`，不是 base64。
3. 第 283 行 `readyImageStep` 用 `stableMediaUrl` 拒绝 `data:`/`blob:` 地址，所以调度表 `resultPayload` 里也只有 URL。
4. 前端轮询拿到的是 `/api/generation-log-assets/...`。

结论：base64 只在内存里停留"解析 → 校验 → 上传"这一小段，从没进过数据库、诊断事件或前端。你要的"服务器只拿 OSS 的 URL"，现在已经是这样了。

### 为什么不把上传再往前挪

- 透明图校验、分层校验、去重这三步都要读图片字节。提前上传后还得再从 OSS 下载回来，反而更慢。
- 往前挪要改 4 个函数签名和 8 处调用，收益只是少在内存里放几秒字符串。
- 这次兔子出错的真正原因是第 1 部分的正则栈溢出，不是 base64 在链路里流转。

### 前端拿到的 URL 用哪种（原第 3 个待确认点）

建议沿用 `/api/generation-log-assets/...`，也就是现在的做法，不改。理由：

- 行业里面向用户的产品（ChatGPT、Midjourney、即梦等）普遍是"自己域名 + 鉴权代理"或"短时效签名 URL"，不会直接给 OSS 公开地址。
- 本项目已有鉴权、按用户隔离、存储后端可替换，前端也不用改。
- 签名 URL 会过期，画布里保存的历史图片过期后会裂图，还要额外做续签。

以后如果代理带宽成为瓶颈，再考虑"代理鉴权后 302 跳到短时效签名 URL"，兼顾两边。

### 结论

第 2 部分不需要开发。这次只上线第 1 部分。
