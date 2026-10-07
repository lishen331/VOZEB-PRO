# 渠道并发上限 · 对抗性审查报告

审查日期:2026-10-05 · 分支:`develop`(改动全部未提交)

## 结论

**不建议直接上线,建议移交重做关键部分。** 主流程(满了切下一个渠道)在文本/音频/图片/视频四条链路上都接上了,类型检查和全量测试也通过(1042 个测试文件、5400 个用例,0 失败)。但审查发现 3 个 P0 问题:计数口径不对、有调用方完全绕过闸门、取消/异常路径会泄漏占位。这三个都会让"上限 50"在生产上不等于 50。

## 需求回顾

- 每个渠道的每个模型有自己的上游并发额度(后台 `capabilityProfile.concurrencyLimit`),例如图片 100、视频 50。
- 并发按「渠道 + 模型」整体计,不分用户。一个用户开 10 个并发就占 10 个位。
- 占满后第 N+1 个请求自动切到下一个渠道,不排队。
- 没配上限 = 不限并发。

## 当前实现(一句话)

`channel-concurrency.ts` 用 Postgres 表 `channel_concurrency_reservations` + `pg_advisory_xact_lock` 原子占位(TTL 30 分钟);`generation-attempt.ts` 在 attempt 结束时释放;四个 runtime 在候选渠道上循环,占不到就试下一个;路由 `logical-model-router.ts` 另有一层内存预筛。

## P0 · 必须修,否则上限不可信

### P0-1 计数口径错:按逻辑模型计,不是按上游模型计

- 占位用 `generationModelId(config)`,它返回 `config.logicalModel || config.model`,即**逻辑模型 ID**(`generation-channel.ts:80-82`)。
- 路由预筛 `channelHasCapacity(..., candidate.upstreamModel, ...)` 用的是**上游模型名**(`logical-model-router.ts:68`)。
- 后果一:两边 key 对不上,只要逻辑 ID ≠ 上游模型名,路由预筛永远读到 0,等于失效。
- 后果二:两个逻辑模型(如「文生图-高清」「文生图-快速」)绑到同一渠道同一上游模型,各自独立计 50,合计放行 100,击穿上游真实额度。
- 后果三:上限值挂在 binding 上,同一上游模型的两个 binding 可以配不同上限,口径本身不唯一。
- 修复方向:计数 key 统一用 `channelId + upstreamModel`;上限应定义在「渠道 × 上游模型」上,而不是 binding 上(或取同一上游模型所有 binding 的最小值)。

### P0-2 有调用方完全绕过闸门

- 只有 4 个 runtime + 视频路由调用了 `reserveGenerationAttemptSlot`。
- `resolveLogicalModelCandidates` 有 21 个调用文件,其中 agent、drama-lab、one-click-film、prompt-optimization、channel-protocol-assistant 等直接打上游。已确认 `agent-run-executor.ts:182` 走 `requestFunctionCall`,不经过占位。
- 后果:这些流量不计入并发,数据库显示 30/50 时上游实际可能已经 50/50,上游返回 429,而系统以为还有余量。
- 修复方向:闸门要下沉到「真正发起上游 HTTP 请求」的唯一出口(如 `/api/ai/system/[channelId]` 代理层),而不是挂在各业务 runtime 上。

### P0-3 释放会泄漏,最坏锁死渠道 30 分钟

释放只挂在 `finishGenerationAttempt`。以下路径不会走到它:

| 路径 | 证据 | 后果 |
|---|---|---|
| 用户取消任务 | `image-tasks/[id]/route.ts:153` 等 6 个取消路由只改状态,不调 `finishGenerationAttempt` | 占位保留到 TTL |
| 取消后到达的成功结果 | `image-task-runtime.ts:294-303` 遇到 cancelled 直接 return | 同上 |
| 上游结果未知(uncertain) | `image-task-runtime.ts:86` 直接 throw,不结束 attempt | 同上 |
| 释放本身失败 | `generation-attempt.ts:48` `.catch(() => {})` 静默吞掉,无日志 | 无法排查 |

- 极端场景:一个上限 50 的渠道,50 个用户提交后立刻取消,这个渠道 30 分钟内对所有人都显示已满。
- 修复方向:释放挂到「任务进入终态」的统一出口(succeeded / failed / cancelled / needs_review),而不是 attempt 级;释放失败必须打日志。

## P1 · 会出错,但影响面较小

### P1-1 TTL 没有续期,长视频卡在边界上

- TTL 固定 30 分钟(`channel-concurrency.ts:6`),占位后不再续期。
- 视频最长约 30 分钟,任务还在跑占位就过期,下一个请求被放进来,超出额度。
- 修复方向:轮询/心跳时续期 `expires_at`,或 TTL 设为最长任务时长 × 2。

### P1-2 全满时行为与注释、与之前的说明不一致

- 路由注释说「全满时保留第一个候选去尝试」(`logical-model-router.ts:62-69`),但数据库占位会直接拒绝,任务失败并报「渠道并发已满」。
- 图片全满时返回 `retryReason: "upstream_failed"`(`image-task-runtime.ts:59`),会消耗唯一一次自动重试;重试逻辑 `prepareImageTaskAutomaticRetry`(`image-task-runtime.ts:118` 附近)取 `candidateConfigs[0]` 并清空列表,第二次只剩一个渠道可试。
- 用户看到的是「失败」而不是「排队」或「稍后重试」,产品层面需要定。
- 修复方向:全满返回明确的「繁忙,请稍后重试」(可带 retry-after),不消耗自动重试次数。

### P1-3 本地 file 模式重复计数

- 非 Postgres 下,`reserveChannelSlot` 内部调 `acquireChannelSlot`(`channel-concurrency.ts:58`),`startGenerationAttempt` 又调一次(`generation-attempt.ts:23`)。一个请求记 2 次。
- 上限 50 在本地实际只放行 25 个。生产走 Postgres 不受影响,但**本地压测结论不可信**。

### P1-4 worker 重入时内存计数漂移

- worker 崩溃或租约过期后重跑提交步骤,数据库占位因 requestId 相同是幂等的,但 `startGenerationAttempt` 会再开一个 running attempt、内存再 +1,旧 attempt 不会被结束。
- 目前只影响路由预筛(本来就因 P0-1 失效),但修好 P0-1 后会暴露出来。

### P1-5 视频恢复路径不轮询

- `video-task-runtime.ts:44-51` 只对 `task.config` 单一渠道占位,满了直接失败。
- `VideoTask` 没有 `candidateConfigs` 字段,无候选可轮询。这是 RunningHub 排队任务的恢复路径,范围窄,但如需换渠道要先持久化候选列表。

## 你点名的几个疑点,逐条结论

| 疑点 | 结论 | 依据 |
|---|---|---|
| 死锁 | **基本无风险** | 用户级并发锁 `withGenerationConcurrencyLimit` 的事务在 handler 运行前已提交(`generation-task-store.ts:923-948`),渠道占位是另一个独立短事务,不存在嵌套持锁或占着连接等连接。唯一理论风险:每次占位都执行全表 `DELETE ... WHERE expires_at <= now()`(`channel-concurrency.ts:63`),跨渠道并发时可能被 Postgres 判死锁并中止其中一个,表现为该次提交报错。现有用户级锁也是同样写法,风险低。 |
| 死循环 | **无** | 所有循环都是遍历有限候选列表,占不到就 `continue`,列表走完即结束。 |
| 异常释放 | **有问题,见 P0-3** | 取消、uncertain 异常、释放失败三条路径会泄漏。 |
| 与随机渠道抽取冲突 | **不冲突,但有认知偏差** | 代码里没有随机抽取。路由是确定性排序:优先级升序 → 权重降序 → ID(`logical-model-router.ts:38`)。权重只在优先级相同时打破平局,不是按权重随机分流。效果是「先把第一个渠道打满,再溢出到第二个」,不是负载均衡。如果产品预期是按权重分摊流量,这是另一个需求,目前没有实现。 |
| 与用户级并发限制冲突 | **不冲突** | 用户级(`generation_concurrency_reservations`,按用户×类型)和渠道级(按渠道×模型)是两层独立闸门,先过用户级再过渠道级。 |
| 与失败冷却冲突 | **不冲突** | 占位失败不会调用 `recordChannelRuntimeFailure`,不会误触发冷却;只有真实上游报错才计入。 |

## P2 · 收尾问题

- **测试缺口**:图片「满了切下一个渠道」没有专门测试;数据库占位路径(并发争抢、TTL 过期、释放)没有集成测试;没有做过真实并发压测。
- **lint**:`image-task-runtime.test.ts:56` 引入的 `acquireChannelSlot`、`resetChannelConcurrency` 未使用(warning,不阻塞 CI)。同文件另有 6 个历史遗留的未使用 import,非本次引入。
- **工作区混杂**:`develop` 上 13 个文件未提交,其中 `admin-upstream-sections.tsx` 和对应测试(共 5 行改动)与本需求无关;另有 `.scratch/`、`web/scripts/local-channel-inspect.mjs` 等临时文件。提交前需要拆分。

## 已验证项

- `tsc --noEmit`:通过
- 全量 vitest:1042 文件通过、6 跳过;5400 用例通过、32 跳过;0 失败
- eslint(改动文件):0 error,8 warning

## 交接建议

1. 先定口径(P0-1):上限定义在「渠道 × 上游模型」上,计数 key 统一。这一步决定后面所有改动。
2. 闸门下沉到上游请求唯一出口(P0-2),顺带解决四个 runtime 各自接线的重复代码。
3. 释放挂到任务终态统一出口,加日志(P0-3);TTL 加续期(P1-1)。
4. 产品确认全满时的用户体验:失败 / 繁忙提示 / 排队(P1-2)。
5. 补集成测试和真实并发压测,压测必须在 Postgres 下做(P1-3)。

当前代码可以作为参考实现保留,但 1~3 属于结构性调整,建议在新分支上重做,而不是在现有改动上打补丁。
