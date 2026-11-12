# 图片生成上游 600 秒无响应 → 提交结果不确定（needs_review）

- 发现时间：2026-10-08 14:15（北京时间）
- 环境：生产 v0.8.5（`sha-f7da1928`），`gammatv.gammablue-x.com`
- 级别：告警（24h 图片超时率 14%，批量提交时更高）
- 状态：未修复，等修复窗口处理

## 现象

图片任务提交给上游后 600 秒内没有收到任何响应，平台判定"提交结果不确定"，转入 `needs_review`。前端不报错，用户只看到没出图。系统不知道上游有没有已经生成、有没有扣费，所以不自动重试、不退款。

用户反馈：有时在上游后台能看到图已经生成，但平台没拿到。这和下面的链路吻合（平台在 600 秒放弃，上游可能之后才完成），**上游侧还没有核实**。

## 证据

链路样本（`diagnostic_events`，两条一致）：

```
15ccc145  08:52:39 upstream_request 发出
          09:02:39 transport_exception 600001ms → upstream_exception 599751ms
          09:02:39 needs_review / submission_result_unknown → submission_outcome_unknown
5398aca9  08:52:54 upstream_request → 09:02:54 transport_exception 600001ms → needs_review
```

统计（7 天，图片，全部走 newapi `/images/generations`，OpenAI 格式）：

| 项 | 数值 |
| --- | --- |
| 图片任务 | 363 条，返回上游任务 ID 的 0 条，返回上游请求 ID 的 0 条（超时任务） |
| 超时转复核 | 59 条（16%） |
| 成功请求的上游耗时 | p50 103s，p95 约 450～480s，最大 576s |
| 当前积压 | 77 条 running/needs_review，最早 09-11，28 个用户，18 条已过期 |

同一用户同一分钟提交的张数 vs 超时率：

| 一次提交张数 | 批次 | 任务 | 超时 | 超时率 |
| --- | --- | --- | --- | --- |
| 1 | 307 | 307 | 41 | 13.4% |
| 2～4 | 20 | 40 | 10 | 25.0% |
| 5～9 | 2 | 17 | 8 | 47.1% |
| 10 以上 | 0 | — | — | 7 天内没有样本 |

一次提交越多，超时率越高。和"一次性 >9 张容易出问题"的经验方向一致，但 7 天里没有 10 张以上的样本，>9 这个阈值本身还没验证。

渠道整体在途数和超时率**没有**明显相关（≤3 在途 20.7%，>20 在途 13.5%）。10-08 00:15 和 00:23 各有 80 人同时提交，前一批超时 1 条，后一批超时 20 条。

按渠道（7 天）：`hr5VKuKJ…`（gpt-image-2）21/221；`n6A5pjj_…`（gpt-image-2.5-sunburst）20/92；`_-eQ3Snt…`（gpt-image-2-all）8/26；`hr5VKuKJ…`（gpt-image-2.5-sunburst）8/18。

## 为什么勾了"异步查询"还是同步等

后台"模型路由设置"里图片渠道勾了"异步查询"，但生产图片任务实际还是一个同步 HTTP 请求：发 `POST /images/generations`，然后一直等到出图。依据：

- 7 天 363 条图片任务里，`advancedConfig.queryPath` 全部为空，`upstream_task_id` 全部为空，任务上没有写入任何查询路径。
- 代码 `web/src/app/api/image-tasks/image-task-support.ts` `parseImagePayloadOrPoll`（约 340～374 行）：只有当上游**响应体里带 task ID** 时才转入轮询；拿不到响应（600s 超时）就直接走 `GenerationSubmissionUncertainError`。
- 在 `web/src/app/api/image-tasks/` 目录内搜 `supportsAsync`，没有引用。也就是说这个勾选目前不会把图片提交改成"先拿 ID 再轮询"。其它目录有没有用到它还没查。

结论：真正的异步需要上游 `/images/generations` 先返回任务 ID，或者渠道配置一个查询路径，再加上平台的提交逻辑真的按异步走。现在这三项都不满足。

## 上游"生成了没返回"的推测

平台在 600 秒主动断开（`transport_exception 600001ms`），上游很可能继续生成并扣费，所以上游后台能看到图，平台这边没有图也没有 ID，追不回来。超时任务也没有拿到响应头里的请求 ID（连接断了，没有响应头），`readUpstreamRequestIdFromHeaders` 的兜底用不上。**需要到上游后台按时间和渠道核对**上面两条样本（北京时间 08:52:39、08:52:54，渠道 `hr5VKuKJ…`）是否已成功、是否已扣费。

## 修复方向（供修复窗口评估）

1. 先止血，只改配置：把图片渠道的"请求超时（秒）"从默认 600 调到 900～1200。上游最大耗时 576s，已经贴着 600s。超时调长后 worker 和并发名额会占得更久，需要一起确认。
2. 真异步：确认 newapi 中转是否支持异步模式（提交立即返回任务 ID 再轮询）。如果支持，就配置 `queryPath` 和 `taskIdField`，并核对平台提交逻辑能不能让上游返回 ID 而不是同步等图。
3. 批量限流：同一用户一次提交多张时，按渠道分批或排队，不要同时把 N 张都压给上游。数据表明批量越大超时率越高。
4. 积压处理：77 条 running/needs_review 需要按上游实际结果人工确认补图或退款，不能直接批量重试，否则可能重复扣费。

## 热更新修复后怎么验证

- 新提交的图片任务中，`last_upstream_status IN ('submission_outcome_unknown','submission_result_unknown')` 的比例明显低于 14%。
- 如果做了异步：新任务的 `upstream_task_id` 不为空，`diagnostic_events` 出现查询/轮询事件，不再出现 600001ms 的 `transport_exception`。
- 用 5～9 张批量提交实测一次，超时率不再接近 47%。
