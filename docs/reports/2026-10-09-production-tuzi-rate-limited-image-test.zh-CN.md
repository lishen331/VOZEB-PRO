# 2026-10-09 生产兔子模型限速复测

## 结论

本轮针对 `gpt-image-2.5-sunburst` 使用 91 个账号，每个账号 1 张图，分 10 批提交（每批 9 张，最后 1 张），批次起始间隔约 1.2 秒。前端提交入口的 1 秒滚动窗口峰值为 9 个请求，但服务端 Worker 实际向兔子上游发起请求的 1 秒滚动窗口峰值为 11 个。

本轮**没有复现上一轮大规模 429 风暴**，但仍出现 1 个上游 429；主要失败原因不是上游限流，而是生产平台写入外部 OSS 时连接被重置/超时。

## 批次

- Run：`prod-tuzi-rate9-20261009-1791511805629`
- 环境：生产
- 模型：`gpt-image-2.5-sunburst`
- 账号：91
- 提交：91/91，HTTP 200：91，提交阶段 429：0，提交阶段 5xx：0
- 提交节奏：9/批，共 11 批（最后 1 张）；前端 1 秒峰值 9
- 上游实际 1 秒峰值：11

## 任务终态

| 状态 | 数量 |
|---|---:|
| `success / completed` | 39 |
| `error / completed` | 50 |
| `running / needs_review` | 2 |

## 上游证据

- 上游响应 200：88
- 上游响应 429：1，错误为“请求过于频繁，请稍后重试”
- 上游响应 502：1，“Upstream service temporarily unavailable”
- 上游响应 503：1，“No available compatible accounts”
- `Maximum call stack size exceeded`：0
- `upstream_body_exception`：0

## 主要失败证据

50 个错误任务中：

- 44 个：`外部存储上传失败：无法连接外部存储（ECONNRESET）`
- 5 个：`外部存储上传失败：无法连接外部存储（RequestTimeout/400）`
- 1 个：兔子上游 429

因此本轮的主瓶颈是**OSS 上传链路的并发连接/超时/连接复用**，不是模型生成接口本身。

## 服务器证据

观察窗口内：

- App `restart=0`
- `/api/health/ready=200`
- 没有新的 OOM、堆溢出或栈溢出
- `NODE_OPTIONS=--max-old-space-size=1024`
- 磁盘约 43% 使用，剩余约 27G
- App 内存峰值约 2.6G，未触发容器重启

## OSS 与前端回写

- 成功任务 39 个全部有结果 URL、媒体记录和 OSS 同步记录；
- 39 个成功图片已回写到对应测试画布节点，并验证图片 URL HTTP 200；
- 50 个错误任务未写成成功节点；
- 2 个 `needs_review` 任务没有自动重试，避免重复生成和重复扣费。

## 结论与建议

1. 仅把前端提交控制在每秒 9 张还不够，必须在 Worker 的**上游请求出口**做渠道级令牌桶/并发控制，确保实际 `upstream_request` 的 1 秒窗口不超过上游限制。
2. OSS 上传必须独立限流，建议设置小并发（如 3～5）、连接超时和指数退避；不要让大量图片上传共享无限并发的响应处理。
3. 对 OSS `ECONNRESET`、`RequestTimeout/400` 增加有限重试和幂等键；达到上限后进入可恢复状态并退款/补偿，而不是直接丢失结果。
4. 对上游 429 使用 `Retry-After` 或指数退避；对 502/503 保留 `needs_review`，禁止无任务 ID 时盲目重提。
5. 当前不需要再次重复提交这 91 个任务；重跑前先处理 OSS 上传并发，否则即使兔子限流解除仍会出现大量失败。

## 证据目录

- `C:/Users/admin/Downloads/VOZEB-capacity-20260919/production-20261009-tuzi-rate9/prod-tuzi-rate9-20261009-1791511805629/manifest.json`
- `C:/Users/admin/Downloads/VOZEB-capacity-20260919/production-20261009-tuzi-rate9/prod-tuzi-rate9-20261009-1791511805629/events.jsonl`
- `C:/Users/admin/Downloads/VOZEB-capacity-20260919/production-20261009-tuzi-rate9/prod-tuzi-rate9-20261009-1791511805629/task-snapshot.json`
- `C:/Users/admin/Downloads/VOZEB-capacity-20260919/production-20261009-tuzi-rate9/prod-tuzi-rate9-20261009-1791511805629/channel-timing-snapshot.json`
