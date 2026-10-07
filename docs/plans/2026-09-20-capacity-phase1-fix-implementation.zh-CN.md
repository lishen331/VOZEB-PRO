# 压测缺陷修复实施文档（第一轮）

- 文档日期：2026-09-20
- 配套设计文档：[2026-09-20-capacity-phase1-fix-design.zh-CN.md](./2026-09-20-capacity-phase1-fix-design.zh-CN.md)
- 适用对象：本轮动手改代码的同事

本文只讲**怎么动手**：步骤顺序、每步改哪些文件、测试、迁移、回滚、验收。**为什么这么改**（证据、根因、设计取舍、严重度判断）在设计文档里。遇到"为什么不是另一种做法"的疑问请回设计文档对应小节，不要在本文另立解释，以免两份漂移。

## 0. 开工前约定

**范围**。本轮只做 A1、A1-b、D6、A2 四项。C4 / C5 限流只有方案、**本轮不改代码**；B3 Gemini 本轮不处理。

**不要碰的地方**：

- `web/src/features/drama-canvas-runtime/` 是另一个会话在维护的镜像副本，本轮不同步。
- 提交时只加自己改的文件，不要 `git add .`。多个窗口在并行改同一仓库，全量提交会带走别人在建的工作。

**密钥与凭据**：中转 api_key、对象存储 AK/SK、`VOZEB_PRO_ENCRYPTION_KEY` 一律不得写进代码、日志、测试固件或文档。步骤 6 会新增上游幂等头，注意不要把请求头整体打印到日志。

**基线**：行号对应 2026-09-20 当日 `develop`。开工前先 `git pull --rebase`；若行号已漂移，以符号名定位而非行号。

## 1. 步骤总览

按"收益 / 风险比"排序。每步独立可验证、可单独回滚、可单独提交。

| 步骤 | 内容 | 对应问题 | 风险 | 回滚方式 |
| --- | --- | --- | --- | --- |
| 1 | 开启 gzip / br 压缩 | A1 | 极低 | 关配置 |
| 2 | 统一上传媒体类型校验 | A2 | 低，改动局部 | 还原校验模块与两处调用 |
| 3 | 未登录分支停止下发重配置 | A1-b | 低 | 还原该分支 |
| 4 | 新增列 + 提交前落幂等键 + 未知结果进 `needs_review` | D6 | 中，涉及 DB 与提交链路 | 保留列不用，逻辑还原 |
| 5 | 拆 `/api/model-catalog` + ETag 缓存 | A1 | 中，涉及前端 store 装配 | 前端合并层回退单请求 |
| 6 | 上游幂等头 + 恢复链路按请求 ID 追回 | D6 | 中，依赖各渠道协议差异 | 按渠道开关关闭 |

**建议步骤 1 单独上线并复测一次**。压缩与拆接口正交，437KB 的 JSON 全是重复键名，压缩比通常 8:1 以上，单独就可能消掉大部分响应体读取超时。先拿到实测数字，再决定步骤 5 的紧迫度。

## 2. 步骤 1：开启 gzip / br 压缩（A1）

**目标**：不改任何业务逻辑，先把响应体压下去。

**动手**：在 Next.js 层或反向代理层启用压缩，覆盖 `application/json`。两处任选其一，不要同时开（双重压缩会浪费 CPU 且无收益）：

- Next.js 侧：`next.config.mjs` 的 `compress` 选项。
- 反向代理侧：Nginx / 网关的 `gzip on` + `brotli on`，并确认 `gzip_types` 含 `application/json`。

**注意**：确认压缩发生在**响应体读取**之前的链路上。本轮问题是客户端读体超时，如果压缩只在内网段生效、公网段仍传原始体，收益为零。

**验证**：

```
curl -s -H "Accept-Encoding: br, gzip" -D - -o /dev/null <站点>/api/auth/session
```

看 `Content-Encoding` 是否为 `br` 或 `gzip`，并对比压缩前后 `Content-Length`。

**验收**：`/api/auth/session` 实际传输体积相比 437KB 显著下降（预期降至数十 KB 量级）。这一步**不要求**响应体结构有任何变化。

**回滚**：关掉配置项即可，无代码改动。

## 3. 步骤 2：统一上传媒体类型校验（A2）

**目标**：两条上传分支都以真实字节嗅探为准，不再回退信任声明类型。

**新增文件**：`web/src/lib/server/upload-media-validation.ts`（服务端专用）。

不要塞进 `web/src/lib/creative-upload.ts` —— 那个文件是前后端同构共享的，而 `fileTypeFromBuffer` 只能在服务端用，放进去会污染客户端包。

契约：

```
validateUploadBytes(bytes: Buffer, expectedType: "image" | "video" | "audio")
  -> { mimeType: string }        // 以嗅探结果为准
  -> 抛 Error                    // 嗅探失败或不在白名单
```

规则三条：

1. 一律先做字节嗅探。
2. 嗅探成功：结果必须同时在 `CREATIVE_UPLOAD_MIME_TYPES` 白名单内、且前缀匹配 `expectedType`。以嗅探结果为最终 `mimeType`，不采信声明值。
3. 嗅探失败：直接拒绝，不回退信任声明类型。

**改造两处调用点**：

- multipart 分支：`web/src/app/api/reference-assets/route.ts:85` 的 `resolveMultipartMimeType` 改为委托新模块，**删掉 `:91`-`:93` 的回退分支**。
- dataUrl 分支：同文件 `:73`-`:82`，解出 bytes 后同样过一遍校验。`parseMediaDataUrl`（`web/src/lib/server/reference-asset-store.ts:154`）的正则保留作快速拒绝，但不再是唯一依据。

**落盘与出站对齐**：`extensionFromMime`（`reference-asset-store.ts:170`）改为接收嗅探得到的 `mimeType`。这样扩展名、`Content-Type`、真实字节三者从写入那一刻就一致，`mimeTypeFromToken`（`:185`）按扩展名推导的结果也随之可信。

**新增测试** `web/src/lib/server/upload-media-validation.test.ts`：

- `.png` 扩展名、内容是 SVG → 两条分支都 400。
- 声明 `image/png`、实际纯文本 → 400。
- 真实 PNG / JPEG / WebP / MP4 / MP3 → 通过，且返回 `mimeType` 来自嗅探。
- 声明 `image/png`、实际是 JPEG → 存为 `.jpg`。这是纠正而非拒绝，因为内容本身合法。

**需要回归的调用方**：`one-click-asset-reference-upload.tsx`、`one-click-shot-media-upload.tsx`、`ip-content-upload.tsx`、`profile-avatar-uploader.tsx`、drama-lab 的帧与视频上传路由。合法上传行为应完全不变。

删掉回退分支为何安全、以及为何这不是存储型 XSS，见设计文档 4.1 与 4.2，本文不复述。

## 4. 步骤 3：未登录分支停止下发重配置（A1-b）

**目标**：匿名请求不再能拉走完整大配置。

**动手**：`web/src/app/api/auth/session/route.ts:36`-`:40` 的未登录分支，把 `serializePublicSettings(settings)` 换成只取 `site` + `featureModules` + `registrationEnabled` + `emailRegistrationEnabled`，不再下发 `logicalModels` / `systemChannels`。

登录页 `web/src/app/login/page.tsx:26` 只用 `.site`，不受影响。匿名用户本来也无法发起生成，不需要模型目录。

**测试**：更新 `web/src/app/api/auth/session/route.test.ts`，断言未登录响应不含 `logicalModels` 与 `systemChannels`。这条要常驻防回归。

**回滚**：还原该分支一处即可。

## 5. 步骤 4：上游 ID 持久化与提交幂等（D6 核心）

**目标**：提交结果未知时，本地仍留有可对账的句柄，且记录不再永久卡在 `submitting`。

这一步涉及 DB 与提交链路，是本轮风险最高的一步，建议单独一个提交、单独验证。

### 5.1 新增 `upstream_request_id` 列

与 `upstream_task_id` **分开两列**，不要混存。前者是供应商的请求 ID（账单通常按它对账），后者是任务 ID，语义不同。

改动点：

- `generation_tasks` 表新增可空列 `upstream_request_id`。
- `web/src/lib/server/generation-task-scheduler.ts:32` 的 `GenerationTaskSchedulePatch` 扩展一个可选字段。
- 同文件 `:260` 附近的参数数组、`:328` 附近的行映射、`web/src/lib/server/generation-task-store.ts:1305` 的 `mapStoredTaskRecord` 一并补上该列。
- `preserveTaskExecution`（`generation-task-store.ts:1243`）要把新列加进保留列表，否则 upsert 会把它冲掉。**这点容易漏。**

迁移是纯加列、可空、无默认值回填，对既有行无影响。

### 5.2 提交前写入对账句柄

`web/src/lib/server/image-task-runtime.ts:49` 那次 `executionPhase: "submitting"` 写入时，把 `clientRequestId` 派生的幂等键一并持久化。

这样即使整条链路随后超时中止，本地仍留有 `channelId` + `provider` + 幂等键 + `submittedAt` + `attemptNo` 的组合，足以与供应商账单做窗口匹配。

`clientRequestId` 已经有了，`web/src/app/api/image-tasks/route.ts:164` 取 header 或 `context.clientRequestId`，`:174` 落库，直接复用，不要新造一套。

### 5.3 提交结果未知时进入可对账相位

`image-task-runtime.ts:66` 抛 `GenerationSubmissionUncertainError` 的路径上，追加一次调度写入：相位落到 `needs_review`，带上待对账标记，以及**已经拿到的**上游请求 ID（若响应头给了）。

**硬约束：上游没给 ID 时不得编造，也不得自动重新生成。** 这类任务只能留痕待人工对账。任何"补个 ID 让流程跑通"的做法会把费用黑洞变成更难查的错账。

相位用 `needs_review` 而非新增相位，是为了对齐现有 `generation-errors.ts:19` 的 `UNKNOWN_SUBMISSION_REVIEW_ERROR` 映射，不引入新概念。运维能直接从 `needs_review` 列表筛出"提交结果未知待对账"。

### 5.4 测试

- 模拟提交超时中止：断言相位为 `needs_review`、幂等键已落库、不再停留 `submitting`、未编造 ID。
- 同一 `clientRequestId` 重复提交只产生一条任务。两条路径各覆盖一次：文件模式走 `sameTaskRequest`（`generation-task-store.ts:1279`），Postgres 走 `ON CONFLICT DO NOTHING` 回读（`:1060`-`:1066`）。
- upsert 后 `upstream_request_id` 不被冲掉（对应 5.1 那个易漏点）。

### 5.5 回滚

逻辑还原即可，新增列可以留着不用，无需回滚迁移。

## 6. 步骤 5：拆 `/api/model-catalog` + ETag 缓存（A1）

**目标**：把身份态与全局配置拆成两个接口，前者不缓存、后者可缓存。

### 6.1 拆 `serializePublicSettings`

`web/src/lib/auth/session.ts:107` 拆成两个导出：

| 函数 | 返回 | 缓存 |
| --- | --- | --- |
| 身份侧 | `site`、`featureModules`、`registrationEnabled`、`emailRegistrationEnabled` | 不缓存 |
| 目录侧 | `logicalModels`、`systemChannels`、`modelPointCosts`、`generationPointMultipliers`、`generationConcurrency`、`generationDefaults`、`defaultModels`、`practiceScriptSettings` | 可缓存 |

`site` 与 `featureModules` **必须留在身份侧**。首屏侧栏可见项与落地路由 `resolveLandingSlug` 都依赖 `featureModules`，若等第二个请求才拿到，会出现侧栏闪烁与落地跳转抖动。这两项体积很小，留着不影响瘦身目标。

### 6.2 新增 `GET /api/model-catalog`

缓存三件套，照仓库既有写法抄，不要自创：

| 机制 | 取值 | 参照实现 |
| --- | --- | --- |
| `ETag` | 配置内容哈希，弱校验 `W/"..."` | `web/src/lib/server/local-media-response.ts:36` |
| `Cache-Control` | `private, max-age=30, stale-while-revalidate=300` | `web/src/app/api/prompts/route.ts:22` 是同类组合，但其 swr 为 120 |
| `304` 短路 | 命中 `if-none-match` 返回空体 | `local-media-response.ts:46`-`:56` |

**不要对外承诺"30 秒内全量生效"。** 两参数叠加后旧配置最长可见约 330 秒（新鲜期 30 秒 + swr 300 秒）。实际时延必须实测，见验收清单。

### 6.3 前端装配

保持 `settings` 这一个视图，**不让 `use-config-store.ts` 感知拆分**：

- `usePublicSessionStore` 并行发起两个请求，把 catalog 响应浅合并进 `payload.settings`。
- `web/src/stores/use-config-store.ts` 的 `:242`-`:293` 字段路径全部不变，**该文件不需要改**。
- `web/src/app/login/page.tsx:26` 只用 `.site`，落在身份侧，不需要改。

### 6.4 测试

- 身份接口不含 `logicalModels` / `systemChannels`，catalog 接口字段齐全。
- 相同配置两次请求 `ETag` 一致；带 `if-none-match` 返回 304 且空体。
- **不变量守卫（必须常驻）**：不同 `planId`、不同 `role`、有/无学校上下文的账号，catalog 响应逐字节一致。这是共享缓存的前提。当前代码确实与账号无关，但 `EntitlementPlan.features` 是潜在入口，将来若有人用套餐 feature 控模型可见性，缓存会静默串号，必须有测试挡住。详见设计文档 2.3。
- 同步更新 `web/src/lib/auth/session.test.ts`、`web/src/app/api/auth/session/route.test.ts`。

### 6.5 回滚

前端合并层退回单请求，后端两个导出保留不动即可。

## 7. 步骤 6：上游幂等头 + 恢复链路按请求 ID 追回（D6 收尾）

**目标**：让"提交结果未知"的任务可以安全重试，并把一部分待核查任务从"只能人工查账单"变成"可自动追回"。

这一步依赖各渠道协议支持度，**必须按渠道开关，不支持的渠道保持现状**。

> **实施时更正（2026-10-06，核实代码后）**：本节原文假设"幂等头尚未发送"，与实测不符。
> `Idempotency-Key` + `X-Client-Request-Id` 早已在 `image-task-support.ts:260` 的 `taskHeaders`
> 里发送，键为 `image-task:{taskId}:attempt:{n}`，同一 attempt 重试键不变。7.1 因此**无增量代码**。
> 实测到的真实缺口是：`upstream_request_id` 列与调度器全链路（步骤 4 已建）**没有任何生产者** ——
> 正常路径拿到 task ID 后把响应头里的上游请求 ID 丢弃，只有"连 task ID 都没有"的兜底分支才读它，
> 违反第 9 节验收第 2 层"上游返回过的 ID 全部及时落库、无丢弃"。故实际实施的是**生产者 + 消费端**。

### 7.1 发送幂等头（核实后：已完成，无需改动）

把步骤 4 已落库的幂等键作为请求头随提交发给上游（`Idempotency-Key`，或按各渠道协议约定的等价头）。上游若已接单，重试会拿回同一个任务而非新建，这是消掉重复计费风险的唯一办法——没有它，任何自动重试都是盲发。

**按渠道能力开关**：不支持该头的渠道退化为当前行为，即不自动重试、留给人工对账。不要因为某个渠道不支持就放弃整体方案，也不要对未验证的渠道默认开启。

**日志注意**：不要把请求头整体打印出来，中转 api_key 在同一组头里。只记幂等键本身。

**现状（2026-10-06 核实）**：`taskHeaders`（`image-task-support.ts:253`）已对图片链路发送
`Idempotency-Key` 与 `X-Client-Request-Id`，值来自 `imagePointsIdempotencyKey(task)`，形态
`image-task:{taskId}:attempt:{attemptNo}`。文本链路经 `text-task-runtime.ts` 的 `taskHeaders`
发送，键为 `pointsIdempotencyKey(task, protocol)`。意图一致，无需新增。

### 7.1b 捕获上游请求 ID 并落库（实际增量）

**缺口**：`readUpstreamRequestIdFromHeaders`（`image-task-support.ts:529`）只在
`parseImagePayloadOrPoll` 的"响应体既无图也无 task ID"兜底分支被调用一次；正常成功路径
（拿到 task ID）虽然同样带着响应头，却把请求 ID 丢掉了。

**改法**：把捕获上移到所有图片协议的唯一收口 `parseChargedImageResponse`
（`image-task-support.ts:862`）。该函数已被 openai / custom / gemini 三条路径共同调用，
且已经在读同一个 `response.headers`（`readBilling`）。捕获结果放进 `ImageTaskResult.upstreamRequestId`
（独立字段，**不与 `pending.id` / `needsReview.upstream.id` 混存** —— 前者是请求 ID，后者是任务 ID，
供应商账单通常按请求 ID 对账，语义不同）。

三个写入点随后把它透传给调度器（`image-task-runtime.ts`）：`needs_review` 分支、`submitted` 分支、
`result_ready` 分支，最终落到 `generation_tasks.upstream_request_id`。

**未做**：文本 / 音频 / 视频三条链路的 `upstream` 记录仍只有 `{ id, createPath }`，没有请求 ID 字段。
它们的 `response.headers` 在各自 runtime 里可得，但改动面较大，本轮未动。若下一轮要做，
按图片同样的形状接即可。

### 7.2 恢复链路利用新列

四条恢复接口当前只在 `upstreamTaskId` 缺失时直接返回 409：

| 接口 | 位置 | 状态 |
| --- | --- | --- |
| 图片 | `web/src/app/api/image-tasks/[id]/route.ts:78` | **已接入**按请求 ID 追回 |
| 视频 | `web/src/app/api/video-tasks/[id]/route.ts:54` | 未接入（无生产者） |
| 文本 | `web/src/app/api/text-tasks/[id]/route.ts:65` | 未接入（无生产者） |
| 音频 | `web/src/app/api/audio-tasks/[id]/route.ts:69` | 未接入（无生产者） |

图片接口补的那一层：若 `upstream_task_id` 为空但 `schedule.upstreamRequestId` 存在，
调用 `queryImageUpstreamTaskIdByRequestId` 按请求 ID 向上游查询一次；查到就回填
`upstream_task_id`（`lastUpstreamStatus: "recovered_by_request_id"`）再走既有轮询逻辑；
查不到仍返回 409，**不伪造成功**。

**渠道开关**：`advancedConfig.requestIdQueryPath`（路径模板，占位符 `{{requestId}}`，
渲染规则对齐 `queryPath` 的 `{{taskId}}`）。**未声明即关闭** —— URL 为空、不发生任何上游请求，
接口行为与改动前逐字节一致。文本/音频/视频三条链路因为连生产者都没有，无需开关，
现状即"保持关闭"。

### 7.3 测试

- `upstream_request_id` 存在而 `upstream_task_id` 为空时，恢复接口不再直接 409。✅
- 上游按请求 ID 查不到时，仍返回 409，不伪造成功。✅
- 未启用幂等的渠道，行为与改动前完全一致。✅（渠道未声明 `requestIdQueryPath` 时不发出站请求）
- 响应头带请求 ID、响应体带 task ID 的正常路径，请求 ID 不再丢失。✅

### 7.4 回滚

按渠道开关关闭即可，不需要回退代码。

## 8. 迁移与回滚汇总

**唯一的 DB 改动**是步骤 4 的 `generation_tasks.upstream_request_id`，纯加列、可空、无回填，对既有行无影响，不需要停机。

回滚粒度按步骤走，六步互不耦合：

| 步骤 | 回滚动作 | 是否需要回退 DB |
| --- | --- | --- |
| 1 压缩 | 关配置 | 否 |
| 2 上传校验 | 还原校验模块与两处调用 | 否 |
| 3 未登录分支 | 还原一处分支 | 否 |
| 4 ID 持久化 | 逻辑还原，列留着不用 | 否 |
| 5 拆接口 | 前端合并层退回单请求 | 否 |
| 6 幂等头 / 追回 | 按渠道开关关闭 | 否 |

**没有任何一步需要回退迁移**，这是刻意的设计——加列不删列、不改既有列语义。

## 9. 复测验收清单

下一轮压测逐条给出**实测数字**，不要只写结论。

**A1 / A1-b**

- [ ] 身份接口响应体 ≤ 10KB；突发档 p95 ≤ 1s；响应体读取超时 0 次
- [ ] catalog 接口第二次请求命中 304
- [ ] 不同套餐 / 角色 / 学校上下文的账号，catalog 响应一致
- [ ] 实测管理员改配置后旧配置可见时长（理论上限约 330 秒），不接受用 `max-age` 单独换算
- [ ] 同一浏览器登出换账号登录后，目录与新账号相符，不是上一账号副本
- [ ] 未登录调用不返回 `logicalModels` / `systemChannels`

**D6**。验收必须分层，**不能无条件要求上游 ID 非空率 100%**：连接在拿到任何上游响应前就中止时，平台根本不可能持有供应商 ID。

- [ ] 第 1 层：本地关联 ID 与提交前持久化的幂等键 100% 完整（完全可控，硬性要求）
- [ ] 第 2 层：上游确实返回过的请求 ID / 任务 ID 全部及时落库，无丢弃
- [ ] 第 3 层：上游未返回任何 ID 的用例，明确记为"提交结果未知"，无编造 ID、无自动重复生成
- [ ] 第 4 层：按请求 ID 查询与幂等重试，仅在已验证支持的渠道启用，未验证渠道保持关闭
- [ ] 无 `executionPhase` 停留 `submitting` 的僵尸记录
- [ ] 同 `clientRequestId` 重复提交只产生一条任务、只计费一次
- [ ] upsert 后 `upstream_request_id` 不被冲掉

**A2**

- [ ] 伪造 PNG（实为 SVG / 纯文本）全部被拒；既有合法上传零回归

**C4 / C5（本轮未实施，若下一轮已改）**

- [ ] 40 人同出口连续登录零拒绝
- [ ] 80 人同出口多图并发准入拒绝率 0
- [ ] 单账号撞库用例仍在第 9 次被拒（确认 `account` 维度未被一起放宽）

## 10. 交接说明

**本轮未处理、需要单独排期的**：

- B3 Gemini 渠道返回 `only imagen models are supported`（10/10 needs_review）。属渠道侧模型未开通或协议不匹配，非本地代码缺陷。修复前建议在后台把该渠道标记为不可用，避免用户反复触发必失败的生成。
- C4 / C5 限流只有方案，见设计文档第 5 节。
- 阶段一报告的文本长尾（最慢 608 秒）。与图片 600 秒超时同源，都受 `TEXT_MODEL_REQUEST_TIMEOUT_MS = 10 * 60_000` 约束（`web/src/lib/server/model-request-policy.ts:5`），建议下一轮单列。

**需要人工做的一件事**：报告里 22 个待核查任务的费用，仍须与供应商账单核对一次。本轮改动只保证**此后**可自动闭环，无法追溯已发生的缺口。

**复测前必须明确的口径**：437KB 与那 21 次超时之间是**相关**，不是已证的因果。报告写明负载机网络带宽未独立校准。若压缩与拆分后超时仍在，说明瓶颈在链路或负载机，需要另查，不要归因到本轮改动无效。

## 11. 参考

- 行号对应 2026-09-20 当日 `develop`，代码路径以仓库根为准。
- 设计依据与取舍：[设计文档](./2026-09-20-capacity-phase1-fix-design.zh-CN.md)。
- 压测报告三份（阶段一 / 阶段二 / 最终）由压测同事提供，不在本仓库内。
- 本文档不含账号、cookie、密钥等敏感信息；引用的渠道与任务仅保留定位所需的最小信息。
