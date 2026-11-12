# 图片上游已返回 200，本地解析栈溢出（RangeError）→ 误判为"提交结果不确定"

- 发现：2026-10-08 15:27 巡检（review_backlog 77 → 91，app_err=14）
- 级别：告警。上游大概率已扣费，用户拿不到图，任务进 `needs_review`
- 与 [2026-10-08-1415 图片 600s 超时](2026-10-08-1415-image-upstream-600s-timeout.zh-CN.md) 是**不同问题**：本问题上游 30～40 秒内正常返回，不是超时

## 现象

15:17 起，`gpt-image-2.5-sunburst` 渠道 `hr5VKuKJKirZ1-sdRZPY5` 的图片任务大批进 `needs_review / submission_outcome_unknown`。用户看到"创建结果待确认"，没有图。

- 15:15～15:30 的 15 分钟：42 张图有 21 张落入此状态
- 每条都在提交后 60 秒内结束（600s 超时那类要 10 分钟）
- 应用日志每 1～2 分钟一条 `Image task step deferred { error: 'Maximum call stack size exceeded' }`，15:18～15:35 共 25 条

## 证据

单条链路（task `43151941`，15:41:57 提交）：

| 时间 | 阶段 | 说明 |
|---|---|---|
| 15:41:57 | upstream_request | POST `api.tu-zi.com/v1/images/generations` |
| 15:42:40 | upstream_response | **200** |
| 15:42:42 | upstream_body_complete | 响应体完整读完，`responseBytes≈4.85MB`，JSON |
| 15:42:42 | transport_response | 200 |
| 15:42:42 (+0.2s) | provider_exception | `RangeError: Maximum call stack size exceeded` |
| 15:42:42 | exception | 包装成 `GenerationSubmissionUncertainError` → needs_review |

同时段成功的任务 `48277895`：同渠道同模型，响应体约 3.5MB，正常出图。

24h 按参数分组（RangeError 计数）：

| 模型 | size | quality | 总数 | RangeError | 成功 |
|---|---|---|---|---|---|
| gpt-image-2.5-sunburst | 16:9 | **medium** | 36 | **36** | 0 |
| gpt-image-2.5-sunburst | 16:9 | auto | 19 | 1 | 16 |
| gpt-image-2-all | 16:9 | auto | 8 | 5 | 2 |
| gpt-image-2 | 16:9 | medium | 2 | 1 | 0 |
| gpt-image-2 | 1024x1024 | auto | 221 | 0 | 200 |

- 7 天内首次出现：10-03 14:28，累计 60 条
- 没有参考图（refs=0），prompt 长度 55～167 字，跟输入无关
- 当前镜像 `sha-f7da1928`，10-07 17:37 启动，今天没有发版

## 原因（已确认部分 / 未确认部分）

已确认：
- 上游成功返回了完整的图片 JSON，异常发生在**拿到响应之后**的本地处理里（`withMediaDiagnosticScope("image", task, "provider", …)` 包住的 `runObservedOpenAiImageTask`，[image-task-openai.ts:130](../../../web/src/app/api/image-tasks/image-task-openai.ts#L130)）
- `response.json()` 成功（否则会记 `response_parse_exception`），所以栈溢出在 JSON 解析之后：`parseImagePayloadOrPoll` → `findImageResults` → `dedupeImageResults`，或返回后的结果落库/上报链路
- 触发条件与**响应体大小**强相关：16:9 + medium 出图大，base64 约 4.8MB 必现；auto 的约 3.5MB 基本不触发
- 这个本地异常被当成"提交结果不确定"处理（[generation-task-recovery-service.ts:741-774](../../../web/src/lib/server/generation-task-recovery-service.ts#L741-L774)），所以不自动重试也不退款。实际上上游已成功、很可能已扣费

未确认：
- 具体是哪一行抛的。日志只有 `error.message`，Next 把栈帧折叠成 `ignore-listed frames`
- 已排除：在生产容器（Node v22.23.3）里用 3.5 / 4.85 / 6.5MB 的 base64 串测试 `image-task-support.ts` 里的几个正则（`/^[a-z0-9+/=_-]+$/i`、`replace(/\s/g)`、扩展名匹配、HTML 嗅探）、`JSON.parse/stringify`、`new URL(dataUrl)`、`Buffer.from`，都不溢出
- 下一步怀疑：返回结果之后对 dataUrl 做的处理，比如 `resolveTaskMediaUrl`、结果落库/上传、诊断事件或日志脱敏（`safeError` / redaction）里对大字符串做递归或 `fromCharCode(...arr)` 这类展开

## 修复方向

1. **先拿到栈**（热更新，零风险）：在 `traceMediaException` 和 `Image task step deferred` 的日志里带上 `error.stack`（截断到前 30 帧），一次就能定位
2. **止血**（不改代码，后台即可）：把 `gpt-image-2.5-sunburst` 的默认 quality 从 medium 改成 auto，或渠道改为返回 URL 而不是 b64_json，让响应体降到 3.5MB 以下。改之前先确认对画质的影响是否可接受
3. **修根因**：定位到具体函数后，把大字符串上的递归/展开操作改成迭代或分块。补一个用约 6MB b64 响应的单测
4. **分类修正**：上游已返回 200 且 body 完整时，本地处理抛出的异常不该归为"提交结果不确定"。应保留响应（至少保留 `upstream_request_id`/账单回执），可以重放解析或明确退款
5. **积压处理**：截至 15:45，新增的 14+ 条（全部 sunburst 16:9 medium，15:17 之后）上游大概率已出图并扣费，但响应体没有落库。需要按 `upstream_request_id` 找中转核对后补图或退款，不要直接重试（会重复扣费）

## 热更新后怎么验证

```sql
-- 1. 新的 RangeError 是否归零（热更新时间点之后）
SELECT count(*) FROM vozeb_pro_generation_tasks t
WHERE created_at > '<热更新时间>' AND jsonb_typeof(diagnostic_events)='array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(t.diagnostic_events) e WHERE e->>'errorName'='RangeError');

-- 2. sunburst 16:9 medium 成功率
SELECT status, count(*) FROM vozeb_pro_generation_tasks
WHERE task_type='image' AND created_at > '<热更新时间>'
  AND payload->'config'->>'model'='gpt-image-2.5-sunburst' AND payload->'config'->>'quality'='medium'
GROUP BY 1;
```

- 如果只做了第 1 步：`docker logs vozeb-pro-generation-worker | grep -A30 'call stack'` 应能看到完整栈帧
- 如果做了第 2/3 步：用 sunburst + 16:9 + medium 手动出 3 张图，都应成功；`review_backlog` 不再随这类任务上涨
- 巡检 `app_err` 回到 0～2
