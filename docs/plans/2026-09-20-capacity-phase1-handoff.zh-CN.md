# 压测第一轮修复 — 交接文档

- 文档日期：2026-09-21
- 面向：接手继续实施的工程师 / AI
- 配套（权威）：[设计文档](./2026-09-20-capacity-phase1-fix-design.zh-CN.md)、[实施文档](./2026-09-20-capacity-phase1-fix-implementation.zh-CN.md)

本文只讲接下来做什么、已做到哪、有哪些坑。为什么这么改看设计文档，分步怎么做看实施文档；本文与它们冲突时以它们为准。

## 1. 硬约束（先读）

- 只 `git add <具体文件>`，绝不 `git add .`。`C:\CODE` 是多会话共享工作区，全量提交会带走别的窗口在建的工作。
- 不碰 `web/src/features/drama-canvas-runtime/`（另一会话的镜像副本）与 `web/src/app/(user)/canvas/**` 里别的窗口在改的文件（提交前 `git status` 认清哪些是自己的）。
- 密钥红线：中转 api_key、对象存储 AK/SK、`VOZEB_PRO_ENCRYPTION_KEY` 不得进代码/日志/测试固件/文档。步骤 6 加上游请求头时不要整体打印请求头到日志。
- 证据优先：文档若与真实代码/依赖行为冲突，先写探针实测再改（本轮已发现多处文档前提与实际不符，见第 4 节）。
- 环境有 GateGuard 钩子：每个文件首次编辑、首次 bash，先陈述 importers / 受影响 API / 数据结构 / 用户指令原话，再重试同一操作。

## 2. 已完成（步骤 1–4，全绿、tsc 干净、未提交）

| 步骤 | 内容 | 关键文件 |
| --- | --- | --- |
| 1 (A1) | 开启响应压缩 | `web/next.config.ts` 加 `compress: true` |
| 2 (A2) | 上传字节嗅探校验、删声明类型回退 | 新建 `web/src/lib/server/upload-media-validation.ts`；改 `web/src/app/api/reference-assets/route.ts` 两分支 |
| 3 (A1-b) | 未登录不再下发重配置 | `session.ts` 新增 `serializePublicIdentitySettings`；改 `session/route.ts` 未登录分支 |
| 4 (D6 5.1) | `upstream_request_id` 列贯通 | `schema.ts` 加列 + scheduler/store/types 全链路 |

测试：新建 `upload-media-validation.test.ts`（6 条）；更新 `reference-assets/route.test.ts`（3 条假 fixture 换真 magic bytes）、`session/route.test.ts` + `session.test.ts`、`generation-task-scheduler.test.ts`（release 参数 15→16）。全部通过。

注意：文档写 `next.config.mjs`，实际是 `next.config.ts`；`compress` 在 Next 默认即 true，这里是显式声明并注明代理层取舍。

## 3. 步骤 4 收尾状态（D6 5.3）

- `web/src/lib/server/image-task-runtime.ts:66` 已加 best-effort `needs_review` 写入（未知提交不退款、落 `needs_review`、不编造上游 ID）。
- `image-task-runtime.test.ts` 的 `schedule` mock 已补 `mockResolvedValue(undefined)`（生产代码链了 `.catch()`）。接手后先跑一次确认绿：

```
cd web && npx vitest run src/lib/server/image-task-runtime.test.ts src/lib/server/generation-task-recovery-service.test.ts
npx tsc --noEmit -p tsconfig.json
```

## 4. 关键发现（改变了文档的部分前提）

1. **D6 5.3 大部分已存在。** worker 路径 `generation-task-recovery-service.ts:762-770` 已在未知提交且无上游 ID 时 release 到 `needs_review`（marker `submission_outcome_unknown`）。报告里“21 个卡 submitting”多半是 600s fetch 执行中被快照，不是永久卡住。真正的 D6 增量是 `upstream_request_id` 列（已做）。
2. **列贯通遗留缺口**：从错误 message 抓上游请求 ID（22 例中仅 1 例上游有响应带回 ID）需供应商特定解析，本轮未做。
3. **A2 严重度是 MEDIUM，不是存储型 XSS**（出站 `nosniff` + 按扩展名推 Content-Type 已拦住执行）。真实危害是脏数据转发上游浪费额度。
4. **A2 零回归靠归一化**：`file-type` v22 对 OGG 返回 `application/ogg`、opus 返回 `audio/ogg; codecs=opus`，与白名单不逐字一致。`upload-media-validation.ts` 已做归一化，改动前先重跑实测。

## 5. 待做（步骤 5、6）

### 步骤 5 — 拆 `/api/model-catalog` + ETag（A1，架构性）

- 拆 `serializePublicSettings` 为身份侧（已有 `serializePublicIdentitySettings`）与目录侧（`logicalModels`/`systemChannels`/`modelPointCosts`/`generationPointMultipliers`/`generationConcurrency`/`generationDefaults`/`defaultModels`/`practiceScriptSettings`）。
- 新建 `GET /api/model-catalog`：ETag 弱校验（参 `local-media-response.ts:36`）、`Cache-Control: private, max-age=30, stale-while-revalidate=300`（参 `prompts/route.ts:22`，其 swr 是 120）、304 短路。
- 前端 `use-public-session-store.ts` 并行两请求、把 catalog 浅合并进 `payload.settings`，让 `use-config-store.ts`（`:242`-`:293`）无需改动。
- 不变量守卫测试（常驻）：不同 planId/role/学校上下文的账号 catalog 逐字节一致。`EntitlementPlan.features` 是潜在串号入口，`Cache-Control: private` 在教室共享机换账号时可能命中上一账号副本，需测试钉死。
- 别承诺“30 秒生效”：max-age 30 + swr 300 => 最长约 330 秒，须实测。

### 步骤 6 — 上游幂等头 + 按渠道开关 + 按请求 ID 恢复（D6 收尾，依赖协议）

- 提交发幂等头（`Idempotency-Key` 或各渠道等价头），按渠道能力开关，不支持的渠道退化为现状，未验证渠道默认关闭。
- 四条恢复接口（`image/video/text/audio-tasks/[id]/route.ts`）补一层：`upstream_task_id` 空但 `upstream_request_id` 有时，按请求 ID 向上游查一次、查到回填再走既有轮询；查不到仍 409，不伪造成功。
- 先调研各渠道协议支持度，别假设统一可用。

## 6. 验收（下一轮压测，逐条给实测数字）

D6 分层验收，**不能无条件要求上游 ID 非空率 100%**（连接在拿到任何上游响应前中止时平台根本没有 ID）：
- 本地关联 ID + 幂等键 100% 完整（可控，硬要求）
- 上游确返回过的 ID 全部落库；上游没返回 ID → 记“提交结果未知”，无编造、无自动重生
- 幂等重试仅在已验证渠道启用
- 身份接口响应体 ≤10KB、突发 p95 ≤1s、读取超时 0；catalog 二次请求 304；不同账号 catalog 一致；换账号登录目录跟随新账号
- 伪造 PNG（SVG/纯文本）全拒、合法上传零回归

## 7. 不在本轮范围（交接给排期）

- B3 Gemini `only imagen models are supported`（渠道侧未开通/协议不匹配，非本地代码；修前建议后台标记该渠道不可用）。
- C4 登录限流（8/15min 撞同出口教室）、C5 图片准入（IP ×4=80/min）——只有方案，见设计文档第 5 节。
- 报告里 22 个待核查任务的历史费用需人工对供应商账单一次；本轮改动只保证此后可自动闭环，不追溯。
