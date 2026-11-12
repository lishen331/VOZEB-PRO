# 图生图请求被上游拒绝：Unknown parameter: 'response_format'

- 发现：2026-10-22 11:50 巡检
- 级别：告警。失败量大，但是明确拒绝，不扣费
- 状态：原因未核实到代码

## 现象

带参考图的图生图（edit）报 `Unknown parameter: 'response_format'.`，任务失败。同模型的文生图（generation）正常。

近 24h（10-21 14:32 ~ 10-22 11:50）：

| 模型 | 渠道 | 失败 | 用户数 | 最后一次 |
|---|---|---|---|---|
| gpt-image-2-5-sunburst | ModelBay `X9te4qOV0ZaPsJpErRRWS` | 53 | 5 | 10:58 |
| gpt-image-2-all | 模汇X中漫 `_-eQ3SntRYtuDZz9mJ_OK` | 42 | 8 | 10-21 16:46 |
| gpt-image-2-5-flare | ModelBay `X9te4qOV0ZaPsJpErRRWS` | 37 | 7 | 11:50 |
| gpt-image-2-c | 模汇X中漫 `_-eQ3SntRYtuDZz9mJ_OK` | 13 | 5 | 10-21 16:08 |

同期 gpt-image-2-5-flare、gpt-image-2-5-sunburst 的文生图各 15 次全部成功。

## 原因（推测，未核实）

edit 请求带了 `response_format`，这几个上游的 `/images/edits` 不接受这个参数。模汇X中漫的两个模型 10-21 16:46 之后没再出现，可能当时改过渠道配置；ModelBay 的两个模型到现在还在报。

需要核实：
- ModelBay 绑定的 edit 是否显式指定了 response_format（`explicitImageResponseFormat`）
- `allowsImageProtocolFallback` 对这个渠道是否关闭，导致不会回退到不带 response_format 的请求

## 修复方向

1. 先查 ModelBay 两个模型的绑定配置，对比模汇X中漫 10-21 16:46 前后的改动
2. 如果是配置问题：edit 不发 response_format，只改后台配置，不用发版
3. 如果是代码问题：收到这条明确报错时，去掉 response_format 重发一次（不扣费的明确拒绝，可以安全重试）

## 验证

```sql
select payload->'config'->>'model', count(*) from vozeb_pro_generation_tasks
where task_type='image' and created_at > '<修复时间>' and coalesce(payload->>'error','') like '%response_format%' group by 1;
```

应为 0；用 gpt-image-2-5-flare 带 1 张参考图出 3 张图，都成功。
