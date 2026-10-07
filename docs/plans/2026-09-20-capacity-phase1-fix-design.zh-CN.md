# 压测缺陷修复设计方案（第一轮）

- 文档日期：2026-09-20
- 依据：2026-09-20 容量压测阶段一 / 阶段二 / 最终报告
- 本轮改代码：A1 session 响应体瘦身、D6 上游 taskId 持久化与提交幂等、A2 上传媒体类型校验
- 本轮不改代码：C4 登录限流、C5 图片准入限流（只出方案，下一轮再动）、B3 Gemini 渠道协议（本轮不处理）
- 配套实施文档：[2026-09-20-capacity-phase1-fix-implementation.zh-CN.md](./2026-09-20-capacity-phase1-fix-implementation.zh-CN.md)

本文只讲**为什么这么改**：证据、根因、设计取舍、契约与风险。动手步骤、改哪些文件、迁移与回滚、复测验收清单，全部在实施文档里。两份文档的编号相互对应（本文 A1 / A1-b / D6 / A2 / C4 / C5 与实施文档同名）。

## 0. 结论摘要

| 编号 | 问题 | 严重度 | 本轮动作 |
| --- | --- | --- | --- |
| A1 | `/api/auth/session` 响应体约 437KB，突发档 p95 约 7.2s、21 次约 30s 响应体读取超时 | HIGH | 拆接口 + 缓存 + 压缩 |
| A1-b | 未登录调用同样返回完整大配置（本次分析新发现，报告未列） | MEDIUM | 一并收口 |
| D6 | 提交结果未知时 `upstream_task_id` 为空，费用无法逐笔对账 | HIGH | 持久化 + 幂等 + 对账钩子 |
| A2 | 上传在嗅探失败时回退信任声明类型；dataUrl 分支完全不嗅探 | MEDIUM | 统一校验入口 |
| C4 | 登录限流 8 次 /15 分钟，同出口教室第 9 人被拒 | HIGH | 仅设计 |
| C5 | 图片准入 20/分钟·用户，同 IP ×4 = 80/分钟 | HIGH | 仅设计 |
| B3 | Gemini 渠道返回 `only imagen models are supported`，10/10 needs_review | MEDIUM | 本轮不处理 |

严重度沿用团队既有分级：CRITICAL 阻断合并，HIGH 建议合并前修复，MEDIUM 视情况修复。

## 1. 证据索引（可复核）

压测实测数字，取自报告，未二次推算：

| 指标 | 数值 | 来源 |
| --- | --- | --- |
| session 响应体大小 | 约 437KB | 阶段二报告 |
| session 突发档 p50 / p95 / p99 | 约 2579ms / 7229ms / 11821ms | 阶段二报告 |
| session 响应体读取超时 | 21 次，约 30s | 阶段二、最终报告 |
| 恢复阶段 session p95 / p99 | 约 485ms / 703ms | 阶段二报告 |
| 图片超时待核查任务 | 40 人档 22 个，21 本地中止、1 上游超时 | 阶段一报告 |
| 超时任务耗时 | 多数约 600 秒 | 阶段一报告 |

两点报告已写明的口径限制，本方案不越过：21 次超时请求**已收到 HTTP 200 响应头**，不能因状态码为 200 判为成功；负载机网络带宽未独立校准，因此 437KB 是已确认事实，但不能直接认定为唯一根因。

## 2. A1：session 响应体瘦身

### 2.1 现状与代码位置

`serializePublicSettings`（`web/src/lib/auth/session.ts:107`）把两类数据拼进同一个响应：

- **身份态**：`user`、`install`，每个用户不同，不可缓存。
- **全局配置**：`logicalModels`（含每个 binding 的 `channelId`、`upstreamModel`、`priority`、`capabilityProfile`）、`systemChannels`（含 `models` 列表）、`modelPointCosts`、`generationPointMultipliers`、`generationConcurrency`、`generationDefaults`、`defaultModels`、`featureModules`、`site`。这部分**对所有用户完全相同**，且只在管理员改后台配置时变化。

体积几乎全部来自 `logicalModels` 与 `systemChannels` 两棵嵌套树。

消费方只有两处，改造面比预期小：

| 消费方 | 位置 | 实际用到 |
| --- | --- | --- |
| session 接口 | `web/src/app/api/auth/session/route.ts:22`、`:38` | 全部字段 |
| 登录页 | `web/src/app/login/page.tsx:26` | 只用 `.site` |

真正吃重载荷的是前端 store `web/src/stores/use-config-store.ts`，在 `:242`（`systemChannels`）、`:253`、`:259`、`:268`-`:271`、`:277`（`logicalModels`）、`:293`（`modelPointCosts`）消费。任何拆分都必须继续把这些字段喂给它。

### 2.2 新发现 A1-b

`route.ts:36`-`:40` 的未登录分支同样调用 `serializePublicSettings(settings)`。也就是说**匿名请求也能拉走这 437KB**，其中包含 `logicalModels` 的上游模型名、`systemChannels` 的渠道名与模型清单。没有密钥泄露（`apiKey` 字段被固定写成 `"system"`，`baseUrl` 被改写为站内 `/api/ai/system/{id}`），但这既是放大攻击面，也是无谓带宽消耗。报告未列此项，是本次读码新发现。

### 2.3 设计

拆成"身份接口 + 目录接口"，两者缓存策略相反。

**接口一：`GET /api/auth/session`（保留，瘦身）**

只返回身份与最小引导信息，预期 1KB 量级：

```
{ user, install, settings: { site, featureModules, registrationEnabled, emailRegistrationEnabled } }
```

保留 `site` 与 `featureModules` 是必须的：首屏侧栏可见项、落地路由 `resolveLandingSlug` 都依赖 `featureModules`，若二次请求才拿到会导致侧栏闪烁与落地跳转抖动。这两项体积很小。

**接口二：`GET /api/model-catalog`（新增）**

返回可共享、可缓存的重配置：`logicalModels`、`systemChannels`、`modelPointCosts`、`generationPointMultipliers`、`generationConcurrency`、`generationDefaults`、`defaultModels`、`practiceScriptSettings`。

缓存三件套，复用仓库已有写法：

| 机制 | 取值 | 参照 |
| --- | --- | --- |
| `ETag` | 配置内容哈希（弱校验，`W/"..."`） | `web/src/lib/server/local-media-response.ts:36` 已用此形态 |
| `Cache-Control` | `private, max-age=30, stale-while-revalidate=300` | `web/src/app/api/prompts/route.ts:22` 已用同类组合，但其 `stale-while-revalidate` 为 120；此处取 300 是本方案的选择，非既有取值 |
| `304` 短路 | 命中 `if-none-match` 直接空体返回 | `local-media-response.ts:46`-`:56` 已实现 |

**关于生效时延，不能承诺"30 秒内全量生效"。** 两个参数叠加后旧配置最长可见约 330 秒：新鲜期 30 秒，之后 `stale-while-revalidate=300` 允许继续返回陈旧副本并在后台续期。管理员改后台配置的可见时延必须实测，不能按 `max-age` 单独推算。若业务要求更快生效，应下调 `stale-while-revalidate` 或增加显式失效机制，而不是只调 `max-age`。突发登录风暴里同一浏览器只真正下载一次，这一收益不受上述修正影响。

**关于"目录对所有账号一致"这一前提，已用代码核实，但仍须由测试守住。** 核实结果：`EntitlementPlanLimits`（`web/src/lib/auth/store-types.ts:337`）只含 `dailyPointSpend`、`dailyApiCalls`、`dailyImages`、`dailyVideos`、`dailyAudio`、`dailyText`，均为配额计数，无模型白名单；`planId` 位于 `serializeCurrentUser`（`session.ts:93`）而非 `serializePublicSettings`，随身份半边下发；`use-config-store.ts` 与图片生成入口均无 `planId` / `entitlement` 引用；`SchoolContext`（`school-domain.ts:20`）只有 school、membership、canManageSchool，学校设置不含模型或渠道字段；`resolvePublicCapabilityModels`（`public-model-catalog.ts:3`）不接用户参数。

但 `EntitlementPlan` 存在 `features: string[]` 字段与 `entitlements.enabled` 开关，构成潜在入口：将来若有人用套餐 feature 控制模型可见性，共享缓存的目录会静默串号。又因为 `Cache-Control: private` 只作用于浏览器自身缓存、不进共享代理，真实风险场景是**教室共享机器上切换账号**时命中上一账号的副本。今天无害，但必须有回归测试把"目录与用户无关"钉成不变量，否则这条前提会在未来某次改动中无声失效。

**压缩**：给两个接口加 gzip / br。437KB 的 JSON 全是重复的键名和模型串，压缩比通常在 8:1 以上。这一步与拆分正交，单独就能大幅降低响应体读取超时的概率，且改动量最小，建议先落地、先复测。

### 2.4 兼容性与迁移

前端保持 `settings` 这一个视图，不让 store 感知拆分：

- `usePublicSessionStore` 并行发起两个请求，把 catalog 响应浅合并进 `payload.settings`。
- `use-config-store.ts` 的 `:242`-`:293` 全部字段路径不变，**该文件无需改动**。
- `login/page.tsx:26` 只用 `.site`，落在瘦身后的 session 接口里，无需改动。
- A1-b 一并收口：未登录分支只返回 `site` + `featureModules` + `install`，不再下发 `logicalModels` / `systemChannels`。匿名用户本来也无法发起生成。

### 2.5 测试与验收

- 单测：`serializePublicSettings` 拆分后，身份接口不含 `logicalModels` / `systemChannels`（防回归）；catalog 接口字段齐全；未登录分支不含重配置。
- 单测：相同配置两次请求 `ETag` 一致；带 `if-none-match` 返回 304 且空体。
- 现有 `web/src/lib/auth/session.test.ts`、`web/src/app/api/auth/session/route.test.ts` 需同步更新断言。
- 单测（不变量守卫）：不同 `planId`、不同 `role`、有/无学校上下文的账号，catalog 响应逐字节一致。这条是共享缓存的前提，必须常驻防回归。
- 验收：身份接口响应体降到 10KB 以内；下一轮同工作负载复测，突发档 session p95 回到 1s 量级，响应体读取超时为 0。
- 验收（缓存时延实测）：管理员改后台配置后，实测旧配置可见时长，并与 `max-age` + `stale-while-revalidate` 的理论上限（约 330 秒）比对。不接受用 `max-age` 单独换算的结论。
- 验收（切换账号）：同一浏览器登出后换账号登录，确认拿到的目录与新账号相符，不是上一账号的缓存副本。

## 3. D6：上游 taskId 持久化与提交幂等

### 3.1 现状与代码位置

提交链路（`web/src/lib/server/image-task-runtime.ts:30` `createImageTaskUpstreamStep`）的时序是：

1. `:49` 先写一条 `executionPhase: "submitting"` 的调度记录，此时**上游 id 尚不存在**，只记了 `channelId`、`provider`、`submittedAt`。
2. `:58`-`:62` 发起上游提交。
3. `:63` 进入 `handleImageProviderResult`，**只有在这里**才写上游 id：`:190`（`needs_review` 分支）或 `:206`（`pending` 分支）。

断点就在第 2 步：一旦提交请求在本地超时中止，代码走 `:66`，抛 `generationSubmissionUncertainError`。响应体从未被读取，上游 id 在本地**从不存在**，记录永久停留在 `executionPhase: "submitting"`、`upstream_task_id` 为空。

超时值吻合报告：`resolveModelRequestTimeoutMs(config, "image")` 默认 `10 * 60_000`（`web/src/lib/server/model-request-policy.ts:9`），即 600 秒，与阶段一报告"多数约 600 秒"完全一致。这条链路可以认定，不是推测。

### 3.2 后果

上游 id 缺失会同时堵死三条路：

1. **费用无法逐笔对账**。上游可能已经接单并计费，本地没有任何可与供应商账单对齐的句柄。
2. **结果无法追回**。四条恢复接口全部以上游 id 为前置条件，缺失时统一返回 409「原任务没有保存上游任务 ID，无法安全追回结果」：`image-tasks/[id]/route.ts:78`、`video-tasks/[id]/route.ts:54`、`text-tasks/[id]/route.ts:65`、`audio-tasks/[id]/route.ts:69`。
3. **重试有重复计费风险**。本地不知道上游是否接单，重试等于盲发。

这解释了报告里"22 个待核查、必须核对供应商账单后再重试"的处置口径——当前代码确实没给出更好的选择。

### 3.3 可复用的既有机制（不需要新造）

盘点后确认，幂等骨架已经存在，D6 主要是补齐与接线：

| 能力 | 已有实现 | 状态 |
| --- | --- | --- |
| 按请求去重 | `sameTaskRequest`（`generation-task-store.ts:1279`）比对 `type` + `userId` + `clientRequestId` + `attemptNo` | 已具备 |
| Postgres 冲突保护 | `insertTask` 用 `ON CONFLICT DO NOTHING` 后回读（`:1060`-`:1066`） | 已具备 |
| 按上游 id 反查 | `getStoredGenerationTaskByUpstream`（`:138`） | 已具备 |
| 归属校验 | `userOwnsGenerationUpstreamTask`（`generation-task-authorization.ts:4`） | 已具备 |
| 升级时保留上游身份 | `preserveTaskExecution`（`:1243`-`:1247`）保住 `upstreamTaskId` | 已具备 |
| 客户端请求 id 入参 | `image-tasks/route.ts:164` 取 header 或 `context.clientRequestId`，`:174` 落库 | 已具备 |
| Webhook 回填 | `generation-webhooks/[channelId]/route.ts:33` 已能从回调解析 `upstreamTaskId` | 已具备 |

缺的是三件事：提交前没有可对账的本地句柄、提交结果未知时没有兜底相位、上游请求 id 没有落库字段。

### 3.4 设计

**改动一：新增 `upstream_request_id` 列，与 `upstream_task_id` 分开**

报告里那条上游超时带回了请求 ID（形如 `2026091914460634...`），这是**请求 id 而非任务 id**，两者语义不同，不能混存一列。供应商账单通常按请求 id 对账，因此这一列是费用闭环的关键。调度补丁类型 `GenerationTaskSchedulePatch`（`generation-task-scheduler.ts:32`）随之扩展一个可选字段。

**改动二：提交前写入对账句柄**

在 `image-task-runtime.ts:49` 那次 `submitting` 写入时，把 `clientRequestId` 派生的幂等键一并持久化。这样即使后续整条链路超时中止，本地也留有 `channelId` + `provider` + 幂等键 + `submittedAt` + `attemptNo` 的组合，足以与供应商账单做窗口匹配。

**改动三：提交结果未知时进入可对账相位，而非永久卡在 `submitting`**

`:66` 抛 `GenerationSubmissionUncertainError` 时，追加一次调度写入，把相位落到 `needs_review` 并带上待对账标记与已知的上游请求 id（若响应头已拿到）。语义上这与现有 `generation-errors.ts:19` 的 `UNKNOWN_SUBMISSION_REVIEW_ERROR` 映射一致，不新增概念。运维因此能从 `needs_review` 列表直接筛出"提交结果未知待对账"的任务，而不是靠人工翻 `submitting` 僵尸记录。

**改动四：向上游发送幂等键，让重试不会重复计费**

把幂等键作为请求头随提交一起发给上游（`Idempotency-Key`，或按各渠道协议约定的等价头）。这样"提交结果未知"的任务可以安全重试：若上游已接单，重试会拿回同一个任务而非新建一个。这是把第 3.2 节第 3 条风险真正消掉的唯一办法——没有它，任何自动重试都是盲发。

注意各渠道对该头的支持不一致。设计上按渠道能力开关：不支持的渠道退化为当前行为（不自动重试，留给人工对账），不因为某个渠道不支持就放弃整体方案。

**改动五：恢复链路利用新字段**

四条恢复接口当前只在 `upstreamTaskId` 缺失时报 409。补充一层：若 `upstream_task_id` 为空但 `upstream_request_id` 存在，允许按请求 id 向上游查询一次，查到就回填 `upstream_task_id` 再走既有轮询逻辑。这把 22 个待核查任务里的一部分从"只能人工查账单"变成"可自动追回"。

### 3.5 测试与验收

- 单测：模拟提交超时中止，断言记录相位为 `needs_review`、幂等键已落库、不再停留 `submitting`。
- 单测：同一 `clientRequestId` 重复提交，只产生一条任务（`sameTaskRequest` 路径与 Postgres `ON CONFLICT` 路径各覆盖一次）。
- 单测：`upstream_request_id` 存在而 `upstream_task_id` 为空时，恢复接口不再直接 409。

**验收口径必须分层，不能无条件要求上游 ID 非空率 100%。** 本文 3.1 节已说明：连接在拿到任何上游响应前就中止时，平台根本不可能持有供应商 ID。报告里 22 例正是两类混合——1 例上游超时（有响应、带回请求 ID），21 例本地中止（很可能什么都没拿到）。因此按可控性分四层验收：

| 层级 | 对象 | 要求 |
| --- | --- | --- |
| 1 | 本地关联 ID、提交前持久化的幂等键 | 必须 100% 完整，这部分完全可控 |
| 2 | 上游确实返回过的请求 ID / 任务 ID | 一旦出现必须及时落库，不得丢弃 |
| 3 | 上游未返回任何 ID | 明确记为"提交结果未知"，**不得编造 ID，不得自动重复生成** |
| 4 | 按请求 ID 查询、幂等重试 | 仅在渠道实际支持且已验证的前提下启用 |

第 3 层是硬约束：缺 ID 时唯一正确的行为是留痕待人工对账，任何"补一个 ID 让流程跑通"的做法都会把费用黑洞变成更难查的错账。第 4 层对应 3.4 节改动四与改动五，两者都依赖渠道协议支持度，未验证的渠道必须保持关闭。

- 验收：不存在 `executionPhase` 长期停留 `submitting` 的僵尸记录；第 3 层任务全部可在 `needs_review` 列表中按"提交结果未知待对账"筛出。

## 4. A2：上传媒体类型校验

### 4.1 现状与严重度修正

上传有两条分支，校验强度不同（`web/src/app/api/reference-assets/route.ts`）：

**multipart 分支**（`:85` `resolveMultipartMimeType`）：先用 `fileTypeFromBuffer` 做真实字节嗅探，嗅探到就按嗅探结果校验（`:88`，这段是正确的）。问题在 `:91`-`:93`：**嗅探返回空时回退去信任浏览器声明的 `file.type`**。SVG、纯文本这类没有 magic bytes 的内容嗅探必然返回空，于是一个声明为 `image/png` 的 SVG 可以通过。

**JSON dataUrl 分支**（`:73`-`:82`）：完全不嗅探。`parseMediaDataUrl`（`reference-asset-store.ts:154`）只用正则校验 `data:` 头里的声明类型在白名单内，再确认 base64 能往返。字节内容从不检查。

**严重度修正为 MEDIUM，不是存储型 XSS。** 报告把这条记为"上传接受伪造 PNG 与声明为 PNG 的 SVG"，事实成立，但读完出站链路后可以确认危害被三重拦住：

1. 落盘文件名扩展由**声明类型**决定（`extensionFromMime`，`:170`），伪装成 PNG 的 SVG 会存成 `.png`。
2. 读取时 `Content-Type` 由**扩展名**推导（`mimeTypeFromToken`，`:185`），而不是文件字节，因此该文件被当作 `image/png` 下发。
3. 出站统一带 `X-Content-Type-Options: nosniff`、`Cross-Origin-Resource-Policy: same-site`、`X-Robots-Tag: noindex`（`local-media-response.ts:13`-`:17`），且访问要过登录与归属校验（`reference-assets/[...path]/route.ts:47`、`:56`-`:61`）。

浏览器不会把 `Content-Type: image/png` 的响应当 SVG 执行，所以拿不到脚本执行。真实危害是：脏数据被转发给上游供应商，浪费额度并产生"上游返回文件无效"类失败；`download=original` 时用户拿到一个扩展名与内容不符的文件；存储被无效资产占用。

### 4.2 设计

**统一到一个校验函数，两条分支都走它。**

在 `web/src/lib/creative-upload.ts` 旁新增服务端校验模块（该文件是同构共享的，`fileTypeFromBuffer` 只能在服务端用，因此不要塞进去）。契约：

```
validateUploadBytes(bytes, expectedType) -> { mimeType } | 抛错
```

规则：

1. 一律先做字节嗅探。
2. 嗅探成功：结果必须同时在 `CREATIVE_UPLOAD_MIME_TYPES` 白名单内、且前缀匹配 `expectedType`。以嗅探结果为最终 `mimeType`，**不采信声明值**。
3. 嗅探失败：直接拒绝，不再回退信任声明类型。

第 3 条是这次的实质改动。删掉回退分支之所以安全，是因为当前白名单里的每一种格式都有 magic bytes：PNG、JPEG、WebP、GIF、MP4、WebM、QuickTime、MP3、WAV、OGG、AAC、FLAC 全部可嗅探。也就是说回退分支对合法上传没有任何作用，只对伪装上传有作用。

SVG 依然不被支持——它本来就不在 `CREATIVE_UPLOAD_MIME_TYPES` 里，这不是新增限制，只是让实际行为与既有白名单一致。

**落盘与出站一并对齐**：`extensionFromMime` 改为接收嗅探得到的 `mimeType`，这样扩展名、`Content-Type`、真实字节三者从写入那一刻就一致，`mimeTypeFromToken` 的推导也随之可信。

### 4.3 兼容性

- multipart 分支：合法上传行为不变（嗅探本来就走通）；伪装上传从"静默接受"变成 400「参考素材格式不正确」。
- dataUrl 分支：新增嗅探。既有前端都是浏览器读真实文件生成 dataUrl，不受影响。
- 需要回归的调用方：`one-click-asset-reference-upload.tsx`、`one-click-shot-media-upload.tsx`、`ip-content-upload.tsx`、`profile-avatar-uploader.tsx`、drama-lab 的帧与视频上传路由。

### 4.4 测试与验收

- 单测：`.png` 扩展名但内容是 SVG → 两条分支都 400。
- 单测：声明 `image/png` 实际是纯文本 → 400。
- 单测：真实 PNG / JPEG / WebP / MP4 / MP3 → 通过，且返回的 `mimeType` 来自嗅探。
- 单测：声明 `image/png` 实际是 JPEG → 按嗅探存为 `.jpg`（纠正而非拒绝，因为内容本身合法）。
- 验收：下一轮压测的伪造上传用例全部被拒；既有合法上传用例零回归。

## 5. C4 / C5：限流方案（本轮只出方案，不改代码）

用户已明确"这次不动，先出方案"。以下为设计，不在本轮实现。

### 5.1 C4 登录限流

现状：`AUTH_LOGIN_RATE_LIMIT = { maxRequests: 8, windowMs: 15 * 60 * 1000 }`（`web/src/lib/server/security.ts:25`）。`checkAuthRateLimit`（`:66`-`:85`）在四个维度上分别计数，**任一维度超限即拒绝**：`ip`、`device`（指纹）、`account`（账号+来源）、`global`（IP 未知时兜底，配额 ×20）。

问题出在 `ip` 维度：一间教室通过同一个 NAT 出口，40 人共享一个公网 IP，第 9 个人登录就被拒。`account` 与 `device` 维度是健康的（每人各自计数），唯独 `ip` 把整间教室当成一个攻击者。

设计原则：**放宽 IP 维度，收紧账号维度**。防撞库的实际防线是 `account`（同一账号被反复试密码）与 `device`，不是 `ip`。

| 选项 | 做法 | 评价 |
| --- | --- | --- |
| 甲 | IP 维度配额改为可配置的较大值（如 200/15 分钟），`account` 保持 8 | 改动最小，立刻解决教室场景；代价是同 IP 的分布式撞库空间变大，但 `account` 维度仍然兜住单账号 |
| 乙 | 为学校出口 IP 配置白名单，命中则配额乘以倍数 | 更精准，但需要运维维护 IP 清单，学校出口换 IP 就失效 |
| 丙 | 有学校上下文时按 `schoolId` 分桶替代 IP 分桶 | 最贴合业务语义；前提是登录阶段就能拿到学校上下文，需确认 |

推荐**甲**，可选叠加**乙**。代码里已有"按维度调整配额"的先例（`:70` 对 `global` 维度用 `maxRequests * 20`），因此这是参数化改造，不是机制改造。

同一处还需修 `admin-mfa`（`web/src/app/api/auth/mfa/route.ts:69`）复用了同一配置，放宽时要分别评估——管理员 MFA 的并发压力与教室登录完全不同，不应跟着一起放宽。

### 5.2 C5 图片准入限流

现状：`image: { maxRequests: 20, windowMs: 60 * 1000 }`（`security.ts:29`），`checkGenerationRateLimit`（`:99`-`:108`）先查用户维度，再查 IP 维度且配额 ×4，即同 IP 80/分钟。调用点 `web/src/app/api/image-tasks/route.ts:147`。

报告已验证：图片受"同出口每分钟 80 次准入限制"约束，导致无法证明 80/120 人同时多图稳定通过。也就是说 IP 维度的 ×4 是实际瓶颈，而非用户维度的 20。

设计：

1. 把 `×4` 倍数提取为可配置项，不再硬编码在 `:106`。
2. 有学校上下文时，IP 分桶改为 `school` 分桶，并按班级规模设定配额（例如每人 20/分钟 × 班级人数 × 安全系数）。
3. 用户维度的 20/分钟保持不变——它是保护单用户不刷爆的合理值，报告也未发现它是瓶颈。

同样的 IP ×4 模式还出现在 `checkMediaProxyRateLimit`（`:116`）与 `checkLocalMediaRateLimit`（`:127`）。本轮不动，但下一轮压测若出现素材读取限流，应一并按同口径处理。

### 5.3 下一轮需要测什么

限流改造的验收必须由压测给出，不能靠代码审查：40 人同出口连续登录零拒绝；80 人同出口多图并发的准入拒绝率为 0；同时构造单账号撞库用例，确认 `account` 维度仍在第 9 次拒绝。

## 6. 实施与复测（见实施文档）

六步实施顺序、每步改哪些文件、数据库迁移、回滚方式与复测验收清单，均已移至[实施文档](./2026-09-20-capacity-phase1-fix-implementation.zh-CN.md)，避免同一份内容在两处漂移。

这里只保留一条设计层面的排序结论：**压缩应当第一个上**。它与拆接口正交、改动最小、风险极低，单独就可能消掉大部分响应体读取超时。先上压缩再复测，然后依据实测结果决定拆接口那步的紧迫度，而不是反过来先做大改造。

## 7. 风险与未决项

**必须由下一轮压测证实、本方案不做断言的：**

- 437KB 与那 21 次超时之间是**相关**，不是已证的因果。报告明确写了负载机带宽未独立校准。压缩与拆分之后若超时仍在，说明瓶颈在链路或负载机，需要另查。
- D6 的上游幂等头依赖各渠道协议支持度，需逐渠道确认，不能假设统一可用。
- 报告里 22 个待核查任务的费用，仍需与供应商账单人工核对一次。新增字段只保证**此后**可自动闭环，不能追溯已发生的缺口。

**本轮明确不处理的：**

- B3 Gemini 渠道 `only imagen models are supported`（10/10 needs_review）。这是渠道侧模型未开通或协议不匹配，不是本地代码缺陷，按用户决定本轮跳过。修复前建议在后台把该渠道标记为不可用，避免用户反复触发必失败的生成。
- C4 / C5 限流只出方案，不改代码。
- 阶段一报告的文本长尾（最慢 608 秒）未纳入本轮范围。该数值与图片的 600 秒超时同源，都受 `TEXT_MODEL_REQUEST_TIMEOUT_MS = 10 * 60_000` 约束（`model-request-policy.ts:5`），建议下一轮单列。

## 8. 参考

- 代码位置均以 `web/` 为根，行号对应 2026-09-20 当日 `develop`。
- 压测报告三份（阶段一 / 阶段二 / 最终）由压测同事提供，不在本仓库内。
- 报告与本文档均不含账号、cookie、密钥等敏感信息；本文档引用的渠道与任务仅保留定位所需的最小信息。





