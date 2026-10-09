# Codex 测试任务：生成失败收敛 / 分流削峰 / 统一提示（staging）

给 Codex 执行。目标：在 staging 构造各种上游异常，验证最近几次改动是否真的生效。只读代码、只动 staging，结束后清理。

## 0. 边界（必须遵守）

- 只能操作 staging：`lsgmadminuser@8.163.37.148`，SSH 端口 `22222`，key 由用户提供（本机脚本 `D:\tmp\vz-mon\ssh-stg.sh` 里有路径）。
- **禁止**连接生产 `8.163.33.161`，禁止改仓库代码、禁止 push。
- staging 应用：`curl http://127.0.0.1:3001/api/health/ready`；容器名用 `docker ps | grep -i staging` 查；数据库容器 `vozeb-staging-postgres-1`，表名带前缀 `vozeb_pro_`（例：`vozeb_pro_generation_tasks`、`vozeb_pro_system_model_channels`、`vozeb_pro_channel_rate_limits`）。
- 开始前确认 staging 跑的是包含本次提交的镜像（`docker inspect` 看镜像创建时间晚于本次 push，或 GitHub Actions `Staging image` 最新一次成功）。
- 所有新建的渠道、模型、环境变量都记录下来，最后第 9 节清理。

## 1. 被测改动清单

| 编号 | 改动 | 提交 |
| --- | --- | --- |
| A | 图片：同步提交出错/超时且无上游 ID → 自动重试 1 次，再失败则失败退款，不挂 `needs_review` | c263bfe3 |
| B | 图片：`submitting` 中断（进程重启）且无 ID → 约 3 分钟内失败退款 | c263bfe3 |
| C | 451 → 明确失败，提示安全审核，不换渠道 | c263bfe3 + 本次（视频） |
| D | 图片分流削峰：按渠道+上游模型令牌桶（默认 500 RPM、突发 10）+ 同时在跑上限（默认 40）；满了换同模型下一个候选渠道；全满每 200ms 重试、最多 2 秒，仍不行失败退款，提示“当前模型暂时不可用” | c427eeae |
| E | ModelBay（主机名 modelbay.io）newapi 图片：非透明图请求改 JPEG 85 压缩；透明保留 PNG | e6f8877b |
| F | 文本：提交不确定（网络断、5xx、2xx 非 JSON、2xx 无内容无 ID）→ 失败退款，不挂待确认，不换渠道 | 本次 |
| G | 文本：`submitting` 中断且无 ID → 失败退款 | 本次 |
| H | 视频：提交不确定（5xx、网络、2xx 非 JSON、2xx 无 ID，含 Gemini Veo）→ HTTP 502 `canRetry:true`，任务失败退款，不换渠道 | 本次 |
| I | 视频：`submitting` 中断且无 ID → 失败退款 | 本次 |
| J | 有上游 ID 的任务：查询报错仍按退避继续轮询，不直接失败（回归） | 不变 |
| K | 全入口统一提示（五种文案，见第 7 节） | 本次 |
| L | 后台保留原始错误：`attempts[].upstreamError`，脱敏、≤2000 字；普通用户接口不返回 | 本次 |

`last_upstream_status` 期望值：`submission_failed_without_upstream_id`（提交失败）、`submission_interrupted_without_upstream_id`（中断）、`create_failed`（明确失败）、`channel_saturated`（图片全满，可能写在任务错误里）。

## 2. 搭异常环境：假上游（mock upstream）

在 staging 机器上起一个假上游，按“模型名”决定返回什么，这样一个渠道就能模拟所有异常。

1. 写一个 Node 脚本 `~/mock-upstream/server.mjs`（只用 `node:http`，无依赖），监听 `0.0.0.0:18080`。所有 POST 都把 `{时间, path, headers 去掉 authorization, body 前 2KB}` 追加写入 `~/mock-upstream/requests.log`，然后按请求体里的 `model` 字段分支：

| model | 行为 |
| --- | --- |
| `mock-ok` | 200，返回正常结果（图片：`{"data":[{"b64_json":"<1x1 png>"}]}`；文本：OpenAI chat 格式 `choices[0].message.content="ok"`；视频：`{"id":"mock-vid-1","status":"queued"}`，查询 `GET .../mock-vid-1` 返回 completed + 一个可下载的小 mp4 URL） |
| `mock-500` | 500，body `{"error":{"message":"upstream exploded sk-test-SECRET123 https://x.example/a?key=abc"}}`（用于检查脱敏） |
| `mock-502html` | 502，body 是 nginx HTML 页 |
| `mock-reset` | 收到请求后直接 `socket.destroy()`（模拟网络断开） |
| `mock-hang` | 永远不响应（用于超时、进程中断） |
| `mock-nojson` | 200，body `not-json` |
| `mock-noid` | 200，body `{"status":"ok"}`（无内容、无任务 ID） |
| `mock-451` | 451，`{"error":{"message":"Unavailable For Legal Reasons"}}` |
| `mock-400` | 400，`{"error":{"message":"invalid size"}}` |
| `mock-quota` | 403，`{"error":{"message":"token quota is not enough"}}` |
| `mock-face` | 400，`{"error":{"message":"The input image contains a real person face"}}` |
| `mock-slow` | 等 `?` 秒（默认 20s）后按 `mock-ok` 返回（用于并发占位） |
| `mock-pollerr` | 视频：创建返回 `{"id":"mock-vid-err"}`；查询该 ID 前 3 次返回 500，之后 completed |

2. 让 staging 应用能访问它：应用默认拒绝私网上游。给 staging 应用容器加环境变量 `VOZEB_PRO_ALLOW_PRIVATE_UPSTREAMS=1`、`VOZEB_PRO_PRIVATE_UPSTREAM_HOSTS=<mock 主机名>`。推荐把 mock 作为容器跑在应用同一个 docker network 里（`docker run -d --name vz-mock --network <应用网络> -v ~/mock-upstream:/app node:22-alpine node /app/server.mjs`），主机名就是 `vz-mock`。改环境变量需要按 staging 现有 compose 方式重建应用容器——先备份 compose / env 文件，记录原值。
3. 后台（管理员账号）新建两个系统渠道，`baseUrl=http://vz-mock:18080/v1`，api_format=openai，协议 newapi（默认），模型列表包含上表全部 model 名：
   - `mock-A`、`mock-B`（第 5 节分流用，两个渠道都挂同一个逻辑模型）。
   - 每个 model 在后台“逻辑模型”里建一个对应逻辑模型（图片、文本、视频能力分别建，名字加前缀如 `img-mock-500`），候选渠道默认只挂 `mock-A`。
   - 视频 / 图片的模型级 `timeoutMs` 设 `60000`（缩短等待；下限 5s）。文本超时固定 10 分钟，不可配置。
4. 准备一个普通测试账号（非管理员），给足积分，记录初始余额。积分流水表名在 `web/src/lib/server/database/schema.ts` 里搜 `points` 确认；也可以直接看用户积分余额接口。

接口与请求体以代码为准：`web/src/app/api/image-tasks/route.ts`、`web/src/app/api/text-tasks/route.ts`、`web/src/app/api/video-generation-tasks/video-generation-route.ts`。用测试账号登录拿 cookie 后 curl 调用；查询用 `GET /api/image-tasks/{id}` 等。

## 3. 每个用例都要检查的四件事

1. 用户接口：任务最终 `status`、`error` 文案；**不能**停在 pending/running 或 `needsReview`。
2. 数据库：`select status, execution_phase, last_upstream_status, payload->'attempts' from vozeb_pro_generation_tasks where id='...'`。
3. 积分：失败任务余额回到提交前（允许先扣后退，最终差额为 0）；成功任务正常扣。
4. mock 日志：`requests.log` 里该任务的请求次数（判断是否重试、是否换渠道）。

## 4. 失败收敛用例（A B C F G H I J）

| # | 类型 | 模型 | 期望 |
| --- | --- | --- | --- |
| 4.1 | 图片 | mock-500 | 失败、退款；mock 收到 **2 次**（自动重试 1 次）；`execution_phase=completed`；提示“网络异常，请点击重试” |
| 4.2 | 图片 | mock-reset | 同 4.1 |
| 4.3 | 图片 | mock-hang（超时 60s） | 约 2 个超时周期后失败退款，不出现 `needs_review` |
| 4.4 | 图片 | mock-451 | 立即失败，mock 只收到 1 次，不重试不换渠道；提示“内容未通过安全审核…” |
| 4.5 | 图片 | mock-400 / mock-quota / mock-face | 明确失败；提示分别是“当前模型暂时不可用…”、“当前模型暂时不可用…”、“参考图包含真人人脸…” |
| 4.6 | 图片中断 | mock-hang，提交后 10 秒内 `docker restart` 应用容器 | 重启后约 3 分钟内任务失败退款，`last_upstream_status=submission_interrupted_without_upstream_id` |
| 4.7 | 文本 | mock-500、mock-reset、mock-nojson、mock-noid 各一次 | 失败退款，`submission_failed_without_upstream_id`；mock 只收到 1 次（逻辑模型挂了 mock-A+mock-B 时也**不能**打到 mock-B） |
| 4.8 | 文本中断 | mock-hang，提交后重启容器 | 失败退款，`submission_interrupted_without_upstream_id`。注意文本 `submitting` 重新认领时间较长，最多等 12 分钟；超过记为不通过 |
| 4.9 | 视频 | mock-500、mock-502html、mock-reset、mock-nojson、mock-noid | 创建接口返回 **HTTP 502**、`canRetry:true`（以前是 202）；任务失败退款；`submission_failed_without_upstream_id`；不换渠道 |
| 4.10 | 视频 | mock-451 | 失败，不换到 mock-B；提示安全审核 |
| 4.11 | 视频 | mock-400 且逻辑模型挂 mock-A(400)+mock-B(ok) | 明确失败**会**换渠道，最终在 mock-B 成功（分流回归） |
| 4.12 | 视频中断 | mock-hang，提交后重启容器 | 失败退款，`submission_interrupted_without_upstream_id`。视频重新认领要等模型超时（已设 60s），约 2 分钟内收敛 |
| 4.13 | 视频回归 J | mock-pollerr | 查询报错期间继续轮询（`last_upstream_status=query_error:N`），最终成功，不失败不退款 |
| 4.14 | 成功回归 | 三类 mock-ok | 正常成功、正常扣费 |

## 5. 分流削峰用例（D，仅图片）

准备：逻辑模型 `img-mock-slow` 候选渠道 = `mock-A`、`mock-B`。在后台模型配置把 `mock-A` 的 `concurrencyLimit=2`、`requestsPerMinute=6`、`burstLimit=2`；`mock-B` 同样设置。

| # | 操作 | 期望 |
| --- | --- | --- |
| 5.1 | 同时提交 3 个 mock-slow | 前 2 个打到 mock-A，第 3 个分流到 mock-B（看 `requests.log` 的 Host/渠道或任务 `payload.config.channelId`） |
| 5.2 | 同时提交 5 个 mock-slow | 4 个分别跑在 A、B；第 5 个约 2 秒后失败退款，提示“当前模型暂时不可用，请切换模型后重试” |
| 5.3 | 并发占满放开后，1 秒内连发 5 个 mock-ok（突发 2） | A、B 各放行约 2 个，其余失败或分流；查 `vozeb_pro_channel_rate_limits` 的 `tokens` 变化 |
| 5.4 | 等 1 分钟后再提交 | 令牌恢复，正常成功 |
| 5.5 | 多进程 | 如果 staging 有多个应用实例/worker，在两个实例上同时打 5.3，总放行数仍受同一个桶限制（令牌桶在 PostgreSQL 里原子扣） |

测完把 `concurrencyLimit` / `requestsPerMinute` / `burstLimit` 恢复为空（走默认 40 / 500 / 10）。

## 6. ModelBay 压缩（E）

mock 主机名不是 modelbay.io，所以分两步：

1. 用 mock 渠道发图片请求，`requests.log` 里的 body **不应**出现 `output_format: "jpeg"`（非 ModelBay 不改写）。
2. staging 上真实 ModelBay 渠道（`X9te4qOV0ZaPsJpErRRWS`，模型 `gpt-image-2-5-sunburst`）各出 1 张：普通提示词、含“透明背景”提示词。查任务结果 `mimeType`：普通应为 `image/jpeg`，透明应为 `image/png`。会消耗真实额度，只做这 2 张。

## 7. 统一提示（K，前端）

期望文案（一字不差）：

- 网络异常，请点击重试
- 当前模型暂时不可用，请切换模型后重试
- 内容未通过安全审核，请修改描述或更换参考图后重试
- 积分不足，请充值后重试
- 参考图包含真人人脸，请更换图片后重试

用测试账号在浏览器（Playwright 可）逐个入口触发 mock-500、mock-quota、mock-451、mock-face，并把测试账号积分调到 0 触发积分不足：

| 入口 | 位置 |
| --- | --- |
| 画布（图片、视频、文本节点） | `/canvas/<id>` |
| 短剧画布 runtime | drama 内嵌画布 |
| 创作工作台 | `/create`，失败卡片和“待确认”列表 |
| Agent | 画布助手面板、创作页 Agent、短剧 Agent 面板 |
| 短剧 | `/drama/<id>` 镜头视频、配音 |
| 短剧实验室 | `/drama-lab/<id>` 任务面板、资产一键提取、剧本 / 分镜工作流 |

每个入口：页面上**不能**出现原始英文报错、HTTP 码、`sk-`、URL、nginx HTML。截图存档。已知不在范围：一键成片合成（render）失败、登录失效 / 无权限提示保持原样。

## 8. 后台原始错误（L）

1. 4.1 / 4.7 / 4.9 的任务，数据库 `payload->'attempts'` 里最后一项应有 `upstreamError`，包含 `upstream exploded`，但**不含** `sk-test-SECRET123`、`key=abc`；长度 ≤ 2000。`error` 字段是可读文案。
2. 用测试账号调用 `GET /api/image-tasks/{id}`、`/api/text-tasks/{id}`、`/api/video-tasks/{id}`：响应 JSON 里**不能**出现 `upstreamError`、`attempts`、`upstream exploded`。
3. 管理员后台“生成运维”页（`/admin/generation-operations`）能看到该任务（是否展示 upstreamError 字段只记录现状，不算不通过）。

## 9. 清理

- 删除 mock 渠道和 `img-mock-*` 等逻辑模型；恢复第 5 节改过的配置。
- 恢复应用容器环境变量（去掉 `VOZEB_PRO_ALLOW_PRIVATE_UPSTREAMS` 等），按原方式重建；`curl /api/health/ready` 返回 200。
- `docker rm -f vz-mock`，删除 `~/mock-upstream`。
- 测试账号的测试任务可保留，记录 ID。

## 10. 输出报告

写到 `docs/superpowers/plans/2026-10-10-generation-failure-closure-codex-report.zh-CN.md`（只在本地，不提交）：每个用例一行：编号、通过/不通过、任务 ID、实际 status / phase / last_upstream_status、mock 请求次数、积分差额、截图路径。不通过的写清复现步骤和实际表现。最后列出清理是否完成。
