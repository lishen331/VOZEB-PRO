# 同步生图失败收敛：不挂无 ID 待确认、451 明确失败、重启快速收敛

日期：2026-10-09（北京时间）
依据：[生图失败、“查不到上游 ID”根因与最终修复方案](./2026-10-09-generation-error-user-messaging-alignment.zh-CN.md)，以及 2026-10-09 与需求方逐条确认的结论。
状态：开发文档，第一阶段按本文实施；不涉及生产配置修改和发布。

## 一、需求方确认结论

| # | 结论 | 本文处理 |
| --- | --- | --- |
| 1 | 同步接口没有上游 ID，失败后不再挂 `needs_review` | 第一阶段 A |
| 2 | 451 内容安全拒绝算明确失败 | 第一阶段 B |
| 3 | ModelBay 生产渠道切到 `modelbay-image-task` | 只读核查结果见第二节，不在代码内处理 |
| 4、5 | 不动 | — |
| — | 同步接口的根治方向：削峰与渠道分流、Worker 隔离、流式处理、结果落 OSS | 削峰分流另行设计（C）；其余为第二阶段 |
| 6 | 本地 600 秒超时不改；上游返回了就应立即结束，不能等满 600 秒 | 第一阶段 D |
| 7、10、11 | 可以改 / 按建议改 | 用户提示统一，第一阶段 E |
| 8 | 等其它会话推送后再验证 | 不在本文 |
| 9 | 待定 | 不在本文 |
| 12 | 后台保留完整真实错误 | 第一阶段 F |

## 二、ModelBay 生产配置核查（只读，2026-10-09 21:50）

- `vozeb_pro_system_model_channels` 中 ModelBay（`X9te4qOV0ZaPsJpErRRWS`）渠道级 `protocol=newapi`，最后更新时间 10-08 16:52。
- `advanced_config.modelConfigs` 中全部图片模型（含 `gpt-image-2-text-to-image`、`gpt-image-2-image-to-image`、`gpt-image-2-5-*`）仍是 `protocol=newapi`、`createPath=/images/generations`，没有 `queryPath`。
- 今天 ModelBay 的 26 条图片任务全部走 `newapi`，`upstream_task_id` 为 0 条。

结论：**生产尚未切换**。切换属于生产配置修改，需在测试渠道验证后由需求方确认执行，不在本次代码改动内。

## 三、现状与根因（代码）

- [image-task-runtime.ts](../../../web/src/lib/server/image-task-runtime.ts) `createImageTaskUpstreamStep`：除 400/401/403/404/405/413/415/422/429 外的提交错误（5xx、504、超时、响应中断）一律包装成 `GenerationSubmissionUncertainError`，写 `needs_review` 后抛出；同步接口永远没有上游 ID，这些任务只能人工结束。
- [generation-task-recovery-service.ts](../../../web/src/lib/server/generation-task-recovery-service.ts) `processImageLease`：(1) 停在 `submitting` 且无 ID 的任务直接 `needs_review`；(2) 提交异常且无 ID 时 `needs_review`。
- 前端把 `needs_review` 当“仍在生成”，一直等到 10 分钟兜底，这就是“上游已经返回了，用户还要等满”的原因（第 6 条）。
- `submitting` 阶段 `nextPollAt = 提交时间 + 600 秒`，进程重启后任务要 600 秒后才会被重新认领（第 11 条）。
- `SAFE_SUBMISSION_FAILURE_STATUSES` 不含 451。

## 四、第一阶段改动

### A. 无上游 ID 的提交失败不再挂待确认

- `createImageTaskUpstreamStep` 遇到不确定错误：不写 `needs_review`，返回 `{ state: "failed", retryReason: "upstream_failed" }`，复用现有“自动重试一次”路径（`prepareImageTaskAutomaticRetry`，第 2 次仍失败则 `markImageTaskFailed` 退款）。
- 恢复服务：提交异常无 ID → 直接失败并退款；`submitting` 中断无 ID → 直接失败并退款（不自动重提，避免进程假死被误判时重复扣上游费用）。
- 已有上游 ID 的任务逻辑不变，仍按 ID 查询，查询窗口到期才 `needs_review`。

### B. 451 明确失败

- 451 加入明确失败状态码；提交返回 451 时任务错误写成安全审核提示，不重试。

### C. 同步请求削峰与渠道分流

本次不改。需求已重新对齐为“每秒发往单个渠道的请求数受控，超限时分流到同模型的其它渠道，请求发出后仍按同步等待结果”，另写设计文档后实施。

### D. 上游返回即结束（第 6 条）

- 600 秒超时不变。A 落地后，上游一旦返回错误（含 504）立即进入重试或失败，前端不再等兜底时间。

### E. 前端提示统一（画布）

- 网络异常，请点击重试
- 当前模型暂时不可用，请切换模型后重试（模型不存在/下线、无可用渠道、上游额度不足）
- 内容未通过安全审核，请修改描述或更换参考图后重试
- 积分不足与真人人脸等具体可操作提示保留。

### F. 后台保留真实错误

- 任务 `error` 只存用户可读文案；`attempts[].error` 存上游原始错误（截断 2000 字符），`lastUpstreamStatus` 记录分类。

### G. 重启快速收敛（第 11 条）

- `submitting` 阶段 `nextPollAt` 改为 `提交时间 + min(超时, 180 秒)`。执行中的 worker 每 25 秒续租（租约 90 秒），不会被抢；进程退出后约 3 分钟内由其它 worker 认领并按 A 失败退款。

## 五、第二阶段（本次不做）

Worker 与 Web 进程隔离、大响应流式解析、结果直落 OSS；生图工作台 / Agent / 视频提示统一；HTTP 状态码、已读字节等分阶段错误明细；历史无 ID `needs_review` 清理脚本（第 9 条待定）。

## 六、验证

- 单测：不确定错误 → 自动重试一次 → 二次失败退款；451 → 直接失败；`submitting` 中断 → 失败退款；画布文案映射。
- `npm run typecheck`、相关 vitest、lint。
