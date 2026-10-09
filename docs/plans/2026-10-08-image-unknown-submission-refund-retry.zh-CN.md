# 图片"提交结果未知"改为退款 + 自动重试 设计文档

日期：2026-10-08　状态：代码已在本地完成，未提交、未推送

## 1. 问题

画布图片任务大量停在「待人工确认」（`execution_phase = needs_review`），提示"上游提交结果不确定，未取得可查询的任务 ID；为避免重复生成和扣费，系统已停止自动重试"。用户看到的是任务一直卡住，既不出图也不退款。

## 2. 测试服实测数据（2026-10-08，staging 库只读查询）

needs_review 共 429 条，其中 418 条是诊断埋点上线前的历史任务，没有上游响应记录。有埋点的 11 条按上游真实返回分类：

| 上游返回 | 渠道 | 条数 | 实际含义 |
| --- | --- | --- | --- |
| HTTP 451 "generated images appear to be unsafe" / "内容安全策略被拒绝" | 模汇x中漫、兔子 | 5 | 上游明确拒绝，没有生成 |
| HTTP 503 anti-bot challenge | 兔子 | 2 | 上游网关拦截，没有生成 |
| HTTP 524 openai_error | 模汇x中漫 | 1 | 网关超时，结果真不确定 |
| HTTP 200 但没有图片也没有任务 ID | modelbay | 1 | 结果真不确定 |
| 视频 submit_exception | modelbay | 2 | 视频链路，本次不改 |

近 3 天模汇x中漫图片：成功 350、失败 15、待确认 5。待确认占比不高，但每一条对用户都是"卡死 + 不退款"。

结论：一半以上不是"不确定"，而是被错分类。451 不在"安全失败"状态码名单里，所以被当成"可能已扣费"挂起。

## 3. 决策（已与需求方确认）

1. 三个中转站：两个会保存请求记录，一个不会。按请求 ID 反查不能作为通用兜底，所以不依赖它来消化待确认任务。
2. 上游是否实际扣费，直接在测试服验证，暂无结论。
3. 接受"给用户退款并自动重试"：没拿到上游任务 ID 的图片提交，一律视为未交付。代价是中转那边可能已扣费，这笔成本由平台承担。
4. 其余边界情况（例如重试后仍然不确定是否要人工介入），遇到再对齐。

## 4. 方案

### 4.1 451 归为确定失败

`web/src/lib/server/generation-submission-error.ts` 的 `SAFE_SUBMISSION_FAILURE_STATUSES` 加入 `451`。

效果：内容安全拒绝直接走既有"安全失败"路径：退款、标记失败、把上游原文提示给用户（"修改提示词或参考图再试"）。不重试，因为同样的输入换渠道大概率仍被拒。

文本、音频链路共用这个函数，同样受益。

### 4.2 无任务 ID 的图片提交：退款 + 重试一次

`web/src/lib/server/generation-task-recovery-service.ts` 的 `processImageLease` 中，原来有两处会写 `needs_review + submission_outcome_unknown`：

- worker 接手时发现任务停在 `submitting` 且没有上游 ID（进程中断）
- 提交过程抛出不确定异常（524、503、200 无 ID、网络中断等）且没有上游 ID

两处统一改为调用新函数 `retryOrFailUncertainImageSubmission`：

```text
没有上游任务 ID
  └─ prepareImageTaskAutomaticRetry（复用既有逻辑：退本次扣费、切到下一个候选渠道、attemptNo 上限 2）
       ├─ 可重试 → 相位回到 created，lastUpstreamStatus = automatic_retry_after_unknown_submission，worker 立即重新提交
       └─ 已重试过 → markImageTaskFailed（退款 + 标失败 + 写失败日志）
                      lastUpstreamStatus = submission_outcome_unknown_refunded
```

重试复用的是"上游明确失败自动重试一次"的同一套机制（`retryReason: "upstream_failed"`），所以退款、换渠道、重置上游身份（`resetUpstreamIdentity`）的行为与现有路径一致，没有新增计费逻辑。

### 4.3 不变的部分

- 已拿到上游任务 ID 的任务：轮询出错仍按原逻辑退避重查，超出查询窗口仍进 `needs_review`。这类任务上游确实在跑，不能重提。
- `ImageQueryContractError`（查询协议配置错误）仍进 `needs_review`，那是配置问题，需要人看。
- 视频、文本、音频的"提交结果未知"本次不改，仍进 `needs_review`。
- `image-task-runtime.ts` 里 best-effort 写 `needs_review` 的兜底不动：worker 路径随后会被本次逻辑覆盖；不经 worker 的调用方（绑定验证）行为保持原样。

## 5. 风险与代价

| 风险 | 说明 | 处理 |
| --- | --- | --- |
| 平台被中转重复扣费 | 524 等情况上游可能已经生成并扣费，我们再提交一次 | 已接受。最多多一次（attemptNo 上限 2） |
| 用户收到两张图 | 不会。第一次的结果我们拿不到 ID，不会入库 | — |
| 重试仍失败 | 第二次仍不确定或失败，直接退款标失败，不再挂起 | 用户看到失败提示，可手动重试 |
| 历史 418 条 needs_review | 本次改动只影响新进入该分支的任务，存量不会自动处理 | 见第 7 节 |

## 6. 验证

- `npx tsc --noEmit`：exit 0
- 相关测试 16 个文件 184 条全部通过，包括：
  - 新增 `generation-submission-error.test.ts`：451 判为安全失败；503、524 仍为不确定
  - `generation-task-recovery-service.test.ts`：原用例"中断提交进入待确认"改为"退款并换渠道重提"；新增"已重试过则退款并标失败"
  - 修了一个测试隔离问题：某个 agent 用例留下未消费的 `mockRejectedValueOnce`，会串到后面的用例，`beforeEach` 里改为 `mockReset()`
- 未验证：真实中转在 524 后是否实际扣费（决策 2，待测试服实测）

## 7. 待办

1. 测试服实测：触发一次 451 和一次超时，确认用户积分已退、任务显示失败或已重试成功。
2. 存量 needs_review（图片约 400 条，多为 9 月历史任务）：建议写一次性脚本批量退款并标失败。属于批量改数据，执行前单独确认。
3. 视频链路的 `submit_exception` 是否同样改为退款重试：视频单价高、重复扣费代价大，遇到再对齐。
4. 兔子渠道 503 anti-bot：属于渠道侧问题，需要联系中转处理，代码层只负责退款重试。
