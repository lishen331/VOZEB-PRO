# 生成失败收敛扩到文本 / 视频与所有入口，后台保留真实错误

日期：2026-10-10（北京时间）。承接 [2026-10-09-image-sync-failure-closure](2026-10-09-image-sync-failure-closure.zh-CN.md)。

## 需求方结论

1. 文本、视频与图片一致：没有上游任务 ID（实际等于同步、无从查询）时，失败不再挂 `needs_review`，直接失败并退款。
2. 用户提示统一扩到所有入口（画布、创作工作台、Agent、短剧、短剧实验室、一键成片）。
3. 第 12 条：后台保留完整真实错误。

## 改动

### A. 文本：无上游 ID 不挂待确认

[generation-task-recovery-service.ts](../../../web/src/lib/server/generation-task-recovery-service.ts) `processTextLease` 三处：

- `submitting` 中断、无 ID → 失败退款，`lastUpstreamStatus=submission_interrupted_without_upstream_id`。
- `runTextTaskStep` 返回 `needs_review`（提交结果未知）→ 失败退款，`submission_failed_without_upstream_id`。
- 执行抛错且无 ID → 失败退款，同上。

[text-task-runtime.ts](../../../web/src/lib/server/text-task-runtime.ts)：`runTextTaskStep` 提交结果不确定时直接走 `failTextTask`（写日志、退款、终态 `error`），不再返回 `needs_review`；`markTextTaskFailed` 增加可选 `upstreamError` 参数供恢复服务调用。

文本已有超时切换备用模型，不再额外加自动重试。

### B. 视频：无上游 ID 不挂待确认

- [video-generation-route.ts](../../../web/src/app/api/video-generation-tasks/video-generation-route.ts) 提交阶段：非明确失败的异常（超时、5xx、响应中断、无效 JSON、无任务 ID）不再写 `needs_review` 返回 202，改为终态失败；已扣点的（上游代理回了扣费头）退款。返回 502，`canRetry=true`。
- 恢复服务 `processVideoLease`：`submitting` 中断且无 ID → `failVideoTaskFromWorker` 失败退款。
- 已有上游 ID 的视频照旧轮询，查询窗口到期才 `needs_review`，不变。
- 451 加入视频明确失败状态码。

### C. 前端提示统一（所有入口）

新建纯函数模块 `web/src/lib/generation-feedback-message.ts`（无依赖）：

| 类别 | 文案 |
| --- | --- |
| 网络 / 上游瞬时（5xx、504、超时、中断、限流、未知） | 网络异常，请点击重试 |
| 模型不可用（模型不存在/下线、无可用渠道、上游额度不足、渠道满载、鉴权失败、参数不支持） | 当前模型暂时不可用，请切换模型后重试 |
| 内容安全（451、审核、敏感、违规） | 内容未通过安全审核，请修改描述或更换参考图后重试 |
| 保留 | 积分不足，请充值后重试；参考图包含真人人脸，请更换图片后重试 |

- 画布两份 `canvas-generation-feedback.ts` 改为从该模块取常量和映射；原色情/暴力/涉政分项文案并入“内容未通过安全审核”。
- `friendlyAgentError` 的技术错误分类改用同一组文案；登录失效、无权限等非生成提示保留。
- 原样显示 `task.error` 的入口（创作工作台待确认、短剧、短剧实验室、一键成片）套用映射。

### D. 第 12 条：后台保留真实错误

- 任务 `error`：只存用户可读文案（前端再映射一次，双保险）。
- `attempts[].upstreamError`（新增可选字段）：存上游原始错误，经 `redactDiagnosticText` 脱敏（API Key、Bearer、URL 签名参数）后截断 2000 字符。图片、文本、视频三类都写。`attempts[].error` 仍是可读文案。
- `lastUpstreamStatus`：记录分类（`submission_failed_without_upstream_id` 等）。
- 公共接口（`publicTask`）不返回 `attempts`，原始错误不会到前端。

## 风险

- 进程假死被误判时，无 ID 任务直接失败退款，上游可能已经计费。需求方已接受（与图片一致）。
- 前端文案变化影响现有单测，同步更新。

## 验证

单测、`typecheck`、`lint`；推 `develop` 触发 staging；Codex 按 [测试文档](../plans/2026-10-10-generation-failure-closure-codex-test.zh-CN.md) 在 staging 构造异常环境验证。
