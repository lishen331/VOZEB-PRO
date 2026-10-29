# 图片任务"上游 ID 丢失"根因与修复方案（讨论稿）

日期：2026-10-08　状态：讨论稿，未实施

关联：[图片提交结果未知改为退款 + 自动重试](./2026-10-08-image-unknown-submission-refund-retry.zh-CN.md)。那份文档是本方案第 4.2 节的细化，代码暂存在 `git stash@{0}`，未应用。本方案通过后两份合并。

## 1. 现象

图片任务停在「待人工确认」（`execution_phase = needs_review`），后台显示 Worker 未认领、下次查询未记录、0 积分。用户点"检查状态"返回 409「原任务没有保存上游任务 ID，无法安全追回结果」。

`c517b175` 让画布前端把 needs_review 当"生成中"继续等，10 分钟硬超时后显示"网络繁忙"。这只是把状态遮住了，后端任务永远停在 `running + needs_review`，没有任何路径能把它推进到终态。

## 2. 根因

数据来自测试服库只读查询（2026-10-08）。

### 2.1 现在所有图片渠道都是同步接口，根本不存在"上游任务 ID"

近 7 天图片任务 381 条，分布在 3 个渠道：

| 渠道 | 中转 | 协议 | 声明了 queryPath | 任务数 | 成功 | 成功里带上游任务 ID | needs_review |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ltjbgNrAMhhftnM6jPHep | easyart（模汇x中漫） | newapi `/v1/images/edits` | 否 | 370 | 350 | 0 | 5 |
| hr5VKuKJKirZ1-sdRZPY5 | 兔子 | newapi `/v1/images/edits` | 否 | 5 | 2 | 0 | 3 |
| X9te4qOV0ZaPsJpErRRWS | modelbay | newapi | 否 | 6 | 3 | 0 | 1 |

成功任务没有一条带上游任务 ID。图片在同一个 HTTP 响应里以 `b64_json` 返回，一次请求等 1 到 2 分钟。三个渠道都没有候选渠道（`candidateConfigs` 为空）。

结论：对同步接口来说，响应就是交付。这次响应没拿到图，图就永远拿不到了。中转不会替我们保存图片原文，即使有请求日志，也只有元数据。"等一个 ID 再去查"这条路对同步渠道不成立。

### 2.2 needs_review 是给异步任务设计的，被套到了同步失败上

`needs_review + submission_outcome_unknown` 的本意是：上游可能已接单，只要有 ID 就能查回结果，所以先挂起，别重复提交。代码里有三处在没有 ID 时也写入这个状态：

- [image-task-runtime.ts:92-107](../../web/src/lib/server/image-task-runtime.ts#L92-L107)：所有非"安全失败"的异常都写 `needs_review`
- [generation-task-recovery-service.ts:643-649](../../web/src/lib/server/generation-task-recovery-service.ts#L643-L649)：worker 发现任务停在 `submitting` 且没有 ID
- [generation-task-recovery-service.ts:762-774](../../web/src/lib/server/generation-task-recovery-service.ts#L762-L774)：提交抛异常且没有 ID

没有 ID 的 needs_review 是死状态：worker 不会再认领，用户"检查状态"走 [image-tasks/[id]/route.ts:94](../../web/src/app/api/image-tasks/[id]/route.ts#L94) 直接 409，只能靠人工。

### 2.3 进入 needs_review 的任务，大多数上游其实给了明确答复

近 7 天 9 条 needs_review，按诊断事件里最后一次上游响应分类：

| 上游返回 | 条数 | 实际含义 |
| --- | --- | --- |
| HTTP 451 "generated images appear to be unsafe" / "内容安全策略被拒绝" | 5 | 明确拒绝，没生成 |
| HTTP 503 anti-bot challenge（内层 status=403） | 2 | 网关拦截，请求没到模型 |
| HTTP 524 openai_error | 1 | 网关超时，上游可能还在生成，但结果已拿不到 |
| 本地 10 分钟超时中止（"The operation was aborted due to timeout"） | 1 | 没有任何响应 |

判断依据是 [generation-submission-error.ts:31](../../web/src/lib/server/generation-submission-error.ts#L31) 的白名单：只有 400/401/403/404/405/413/415/422/429 算"安全失败"，其余状态码全部算"结果未知"。451 和 5xx 都被划进了"未知"。

### 2.4 用户积分其实早就退了，挂起没有保护任何东西

系统代理 [ai/system/[channelId]/[...path]/route.ts](../../web/src/app/api/ai/system/[channelId]/[...path]/route.ts) 先扣用户积分再请求中转。上游非 2xx（L293-296）、网络异常（L286-291）、请求中止（L262）都会立即退款。截图里的"0 积分"就是这个原因。

挂起原本防的是"重复扣费"。实际上，用户这一侧在非 2xx 和超时时已经退过款，挂起只剩一个效果：任务卡死。唯一扣着用户积分的情况是 2xx 但响应体无图无 ID（[image-task-support.ts:356-365](../../web/src/app/api/image-tasks/image-task-support.ts#L356-L365)），这种情况目前也会挂起。

### 2.5 存量

测试服图片 needs_review 共 382 条，全部 `status = running`：

- 380 条没有上游任务 ID，也没有请求 ID（2026-08-19 至 2026-10-07），永远无法自动推进
- 2 条有上游任务 ID（2026-09-07），属于正常的异步待查

## 3. 修复原则

判断一个任务该不该挂起，不看"有没有拿到 ID"，看"之后还有没有办法查回结果"：

| 情况 | 之后能否查回 | 处理 |
| --- | --- | --- |
| 拿到上游任务 ID（异步渠道） | 能 | 保持现状：轮询，超出查询窗口进 needs_review，用户可"检查状态" |
| 没有任务 ID，但渠道声明了 `requestIdQueryPath`，且已存下请求 ID | 能 | 保持现状：进 needs_review，按请求 ID 追回（D6 步骤 6） |
| 其他所有没有结果的情况 | 不能 | 本次尝试按"未交付"结束：退款，自动换渠道重试 1 次，再失败就标失败 |

这条规则跟中转无关，不需要给每个渠道单独配置。以后接新中转，只要它是同步接口，就自动走第三行；只有中转确实支持按请求 ID 查回图片，并且管理员在渠道上声明了 `requestIdQueryPath`，才会走第二行。目前三个渠道都没有声明。

## 4. 方案

### 4.1 新增"可追回"判断

新增一个函数，供下面几处共用：

```ts
// 没有上游任务 ID 时，只有渠道声明了按请求 ID 查询、且本次已存下请求 ID，才算还能追回
function canRecoverImageWithoutTaskId(config: ImageTaskConfig, upstreamRequestId?: string) {
    return Boolean(upstreamRequestId && config.advancedConfig?.requestIdQueryPath?.trim());
}
```

### 4.2 三处"无 ID 写 needs_review"改为分流

涉及 2.2 节列出的三处：

```text
没有上游任务 ID
  ├─ 可追回（4.1）→ 保持 needs_review（现状）
  └─ 不可追回
       ├─ 安全失败（4.3 的 451 等）→ 退款 + 标失败，不重试
       └─ 其他 → prepareImageTaskAutomaticRetry
            ├─ attemptNo < 2 → 退款，相位回到 created，worker 重新提交
            │                  lastUpstreamStatus = automatic_retry_after_unknown_submission
            └─ 已重试过 → markImageTaskFailed（退款 + 标失败）
                           lastUpstreamStatus = submission_outcome_unknown_refunded
```

重试复用现有"上游明确失败自动重试 1 次"的机制（[generation-task-recovery-service.ts:666-685](../../web/src/lib/server/generation-task-recovery-service.ts#L666-L685)），退款、换渠道、清上游身份（`resetUpstreamIdentity`）都是既有逻辑，不新增计费代码。实现已写好，在 `stash@{0}`，需要补上"可追回"这一分支。

[image-task-runtime.ts:100](../../web/src/lib/server/image-task-runtime.ts#L100) 的 best-effort 写入改为：只在可追回时写 needs_review，否则不写，交给调用方处理。worker 路径由 4.2 接管。绑定验证（[binding-verification-runner.ts:208-210](../../web/src/lib/server/binding-verification-runner.ts#L208-L210)）有自己的 needs_review 状态，行为不变。

### 4.3 451 归为安全失败

[generation-submission-error.ts:31](../../web/src/lib/server/generation-submission-error.ts#L31) 加入 451。内容安全拒绝直接退款、标失败，并把上游原文提示给用户。不重试，因为同样的输入换个渠道大概率还是会被拒。文本、音频共用这个名单，同样生效。

### 4.4 存量 380 条

一次性脚本，只处理 `task_type = 'image' AND execution_phase = 'needs_review' AND upstream_task_id IS NULL AND (upstream_request_id IS NULL OR 渠道未声明 requestIdQueryPath)` 的任务：调用 `markImageTaskFailed` 退款并标失败。`refundImageTask` 带幂等键，已退过的不会重复退。先在测试服 dry-run 输出清单，正式执行前单独确认。

### 4.5 不改的部分

- 有上游任务 ID 的任务：轮询、查询窗口、needs_review、用户"检查状态"全部不变
- `ImageQueryContractError`（查询协议配置错误）仍进 needs_review，需要管理员修配置
- chatgpt2api 这类"只返回任务 ID 但没声明查询路径"的情况：有 ID，仍进 needs_review（AGENTS.md 第 206 行）
- 视频、文本、音频的提交结果未知：本次不改，见第 7 节

### 4.6 前端

后端修好后，没有 ID 的任务会在几分钟内变成"成功"（重试成功）或"失败"（带退款），前端按普通结果显示即可。`c517b175` 里"needs_review 当生成中继续等"的逻辑保留，因为它只会作用于真正可追回的任务。10 分钟硬超时作为兜底也保留。

## 5. 风险与代价

| 风险 | 说明 | 处理 |
| --- | --- | --- |
| 平台被中转重复扣费 | 524 或本地超时时，上游可能已生成并扣了平台的钱，重试会再扣一次 | 需求方已接受，由平台承担，每个任务最多多扣一次。近 7 天这类情况 2 条，约占 0.5% |
| 用户收到两张图 | 不会。第一次的结果我们拿不到，不会入库 | — |
| 重试仍失败 | 第二次直接退款、标失败，不再挂起 | 用户看到失败提示，可以手动重试 |
| 单渠道时"换渠道"无效 | 三个渠道都没有候选，重试仍走原渠道 | 可以接受；503 anti-bot 这类渠道侧问题重试大概率仍失败，最多多等一轮 |
| 重试叠加等待时间 | 超时场景最坏 10 分钟 + 10 分钟 | 见第 8 节问题 3 |

## 6. 需要同步修改的规则和文档

本方案和以下现有规则冲突，通过后在同一次改动里一起更新：

- `AGENTS.md` 第 197 行："`needs_review` 或 `submission_outcome_unknown` 都不得自动再次创建同类上游任务…只有图片上游明确返回生成终态失败时…自动重新提交 1 次"。改为：图片任务没有上游任务 ID 且不可追回时，视为未交付，可退款并自动重提 1 次。
- `AGENTS.md` 第 55 行：补充一句，没有上游任务 ID 且不可追回的图片任务不进 needs_review。
- `docs/content/docs/progress/pending-test.mdx:60`：更新测试预期。
- `docs/plans/2026-09-20-capacity-phase1-fix-design.zh-CN.md` 第三层："不得自动重复生成"，加注本方案的例外。
- [image-task-runtime.ts:94-99](../../web/src/lib/server/image-task-runtime.ts#L94-L99) 的注释。

## 7. 本次不做

- 视频的 `submit_exception`：视频单价高，重复扣费代价大，而且视频渠道多数是异步接口、有任务 ID。遇到再对齐。
- 文本、音频：同样暂不改。
- 兔子 503 anti-bot：渠道侧问题，需要联系中转处理。

## 8. 待讨论

1. 第 3 节的判断标准是"能否追回"，不是"有没有 ID"。这个标准大家是否认可？
2. 中转是否认 `Idempotency-Key`？目前每次 attempt 的键不同（`image-task:<id>:attempt:<n>`），重试不会被中转去重。如果某个中转支持幂等，可以考虑重试时沿用第一次的键，让它直接返回第一次的结果。三个中转都还没验证，暂不依赖。
3. 本地超时目前是 10 分钟，加上重试，最坏 20 分钟。easyart 正常出图 1 到 2 分钟。要不要把图片默认超时降到 5 分钟？这是独立改动，不在本方案范围。
4. 存量 380 条：全部退款标失败，还是只处理最近 30 天的？更早的用户可能已经不在意了，但退款对用户没有坏处。

## 9. 验证计划

单元测试：

- `generation-submission-error.test.ts`（新增）：451 为安全失败；503、524 仍为不确定
- `generation-task-recovery-service.test.ts`：
  - 中断提交、无 ID、不可追回：退款并重提
  - 已重试过：退款并标失败
  - 无任务 ID 但有请求 ID 且渠道声明了 `requestIdQueryPath`：仍进 needs_review
  - 有上游任务 ID 的现有用例：行为不变

测试服实测：

- 触发一次 451：用户积分已退，任务显示失败，并带内容安全提示
- 触发一次超时：自动重提；第二次仍失败则退款并标失败
- 存量脚本 dry-run：输出条数与 2.5 节一致（380 条）

执行顺序：`npx tsc --noEmit` → 相关 vitest → 本地重建镜像，人工验证 → 推送前单独确认。
