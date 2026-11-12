# 上游已出图扣费，平台拿不到结果：ModelBay 响应体传输卡住 + 渠道冷却导致 503

- 发现：2026-10-08 16:22 巡检（review_backlog 91 → 148，16:35 时 176；nginx 5xx=72）
- 级别：告警。上游已扣费、用户拿不到图；部分时段学生提交直接被 503 拒绝
- 相关报告：[1545 RangeError](2026-10-08-1545-image-rangeerror-after-200.zh-CN.md)（另一个渠道，另一个原因）、[1415 600s 超时](2026-10-08-1415-image-upstream-600s-timeout.zh-CN.md)

## 现象

1. 渠道 `X9te4qOV0ZaPsJpErRRWS`（ModelBay，模型 `gpt-image-2-5-sunburst`）：ModelBay 后台的使用日志显示请求"消耗"成功，耗时 16～23 秒；但平台任务一直停在"提交中"，最后进 needs_review。16:19～16:26 有 24 条。
2. nginx 16:18～16:24 有 99 次 `POST /api/image-tasks` 返回 503，16:29 又有 7 次，全部来自校园出口 202.104.31.x。
3. 16:20 有 21 次 `POST /api/image-tasks` 返回 429，全部来自 202.104.31.99。这是单个用户的频率限制（20 次/分钟），属于正常保护，本报告不展开。

## 证据

### 问题 1：响应头到了，响应体几乎下不来

任务 `cc9b129a`（16:32:01 提交）的完整链路：

| 时间 | 阶段 | 说明 |
|---|---|---|
| 16:32:01 | upstream_request | POST 到 ModelBay |
| 16:32:29 | upstream_response | **HTTP 200**，28 秒（和 ModelBay 日志的 16～23 秒耗时吻合） |
| 16:32:33 | upstream_body_first_byte | 收到第一段，3,300 字节 |
| 16:42:01 | transport_exception | `TimeoutError`，600 秒到点被我方中止 |
| 16:42:01 | upstream_body_exception | `ResponseAborted`，**9.5 分钟只收到 904,420 字节** |
| 16:42:01 | provider_exception | 包装成 `GenerationSubmissionUncertainError` → needs_review |

- 平均下载速度约 1.5 KB/s。正常一张图的 b64 JSON 是 3～5 MB，要 40 分钟以上才能下完
- 同一时刻服务器网卡只有 rx 0.2～0.4 Mbps，**不是我们的带宽打满了**
- 从服务器 curl ModelBay 首页：TLS 0.44s、首字节 0.66s，建连本身正常
- 16:39 抽查时这个渠道有 11 个任务停在 submitting，但服务器到 ModelBay IP（169.58.51.174）的 ESTABLISHED 连接数是 0。可能是走了出站代理或 CDN 的其它 IP，**未确认**

结论：上游生成和扣费都完成了，**慢在把图片 base64 从 ModelBay 传回来这一段**。600 秒一到，我方就中止了连接，而这个异常被归类成"结果不确定"，所以不退款也不重试。卡在 ModelBay 出口、跨境链路，还是我方出站代理，目前分不出来。

### 问题 2：503「当前模型暂不可用」

- 来源是 [image-tasks/route.ts:219-222](../../../web/src/app/api/image-tasks/route.ts#L219-L222)：模型的所有候选渠道都处于冷却时，直接返回 503
- 冷却规则见 [channel-runtime-health.ts:15-33](../../../web/src/lib/server/channel-runtime-health.ts#L15-L33)：同一渠道连续失败 3 次后冷却 30 秒，之后每多失败一次时长翻倍，最长 5 分钟。状态保存在进程内存里
- `gpt-image-2.5-sunburst` 和 `gpt-image-2-5-sunburst` 各自只绑定了一个渠道（分别是 hr5 和 X9te），没有备用渠道
- 503 的高峰（16:18～16:24）正好和 hr5 渠道 RangeError 密集的时段（16:17～16:22）重合

推断（还没在代码里逐行核对）：RangeError 和传输超时都被记成渠道失败，连续 3 次后渠道进入冷却。唯一的渠道一冷却，全班提交这个模型都会收到 503。冷却结束后又被同类错误打回冷却，所以 503 是一阵一阵出现的。

## 现场可以马上做的（不改代码）

- 让学生暂时改用 **gpt-image-2**（hr5 渠道，1024x1024，24h 221 次成功 200 次）。这个模型没有出现 RangeError，也没有传输卡住
- 或者在后台给 sunburst 的逻辑模型多绑一个可用渠道，这样冷却时可以切换过去

## 修复方向

1. **让上游返回 URL，不返回 b64_json**（优先级最高）：响应体从几 MB 降到 1 KB 左右，传输卡住和 RangeError 两个问题都能绕开。图片由我方另外下载，下载慢也不会把"提交"判成不确定
2. 查出站链路：确认到 ModelBay 的请求是否走了代理（为什么 ESTABLISHED=0），再用服务器 curl 一次真实的大响应，测吞吐量
3. 分类修正：已经收到 `upstream_response 200` 之后的读取失败或解析失败，不应归为"提交结果不确定"。至少要记录上游请求 ID 和账单回执，方便按 ID 补图或退款
4. 冷却口径：本地解析异常（RangeError）不应计入渠道失败；渠道全部冷却时，返回带 `Retry-After` 的 429，不要用 503 冒充"模型不可用"
5. 积压：截至 16:35 review_backlog=176，其中 16:19 之后 X9te 的 24 条和 hr5 的 RangeError 那批，ModelBay / tu-zi 侧都已扣费。需要按时间和渠道去上游后台核对，再补图或退款，**不要批量重试**

## 热更新后怎么验证

```sql
-- 收到 200 之后才失败的任务数（应接近 0）
SELECT channel_id, count(*) FROM vozeb_pro_generation_tasks t
WHERE task_type='image' AND created_at > '<热更新时间>' AND last_upstream_status='submission_outcome_unknown'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(t.diagnostic_events) e WHERE e->>'phase'='upstream_response' AND e->>'status'='200')
GROUP BY 1;
```

- nginx 中 `POST /api/image-tasks` 的 503 次数降为 0
- X9te 渠道新任务的 `upstream_body_complete` 出现，并且 `responseBytes` 明显变小（如果改成了 URL）
- 巡检的 review_backlog 不再上涨
