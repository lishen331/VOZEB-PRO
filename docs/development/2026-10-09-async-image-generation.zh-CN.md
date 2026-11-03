# 图片异步生成（ModelBay / 兔子）开发文档

2026-10-09 · 范围：测试环境（staging）与生产环境共用代码

## 1. 背景与问题

平台已有异步任务框架：`POST /api/image-tasks` 立即返回任务，worker 依次提交、持久化 `upstream_task_id`、按 `next_poll_at` 轮询、落盘，失败时退款。但 ModelBay 和兔子的图片模型配置都是“沿用渠道（OpenAI 图片接口）”，实际走的是同步的 `POST /images/generations`：

1. worker 要和上游保持一个长连接（实测 54–79 秒，上限是模型超时 10 分钟），期间没有上游任务 ID。worker 重启、网关超时或断网时，任务会落到 `needs_review`，状态写成“提交结果未知”，这时上游可能已经扣费，但平台拿不到结果。
2. ModelBay 的 `gpt-image-2-text-to-image` 和 `gpt-image-2-image-to-image` 是任务制模型。同步端点直接返回 `400 only available on asynchronous task endpoints`，所以这两个模型在平台上始终失败。
3. 渠道没有声明图片查询路径，即使上游返回 task_id，任务也只会进入 `needs_review`。

目标：让支持异步的模型真正走“提交拿 task_id → worker 分次轮询 → 落盘”，提交请求在秒级返回。

## 2. 上游实测（2026-10-08/09，测试 key：ModelBay 真人 key、兔子 key）

### 2.1 ModelBay（文档：异步图片生成-API文档.md）

| 项 | 实测 |
|---|---|
| 提交 | `POST https://api.modelbay.io/image/submit`，JSON `{"model","input":{"prompt","quality","number_of_images","aspect_ratio","input_images":[url]}}` |
| 提交响应 | `{"code":"success","data":{"task_id":"task_…"}}` |
| 查询 | `GET /image/fetch/{task_id}`，返回 `data.status`，取值 `NOT_START → IN_PROGRESS → SUCCESS / FAILURE` |
| 结果 | 实测字段是 `data.result_url`（单个字符串，指向国内 CDN）。文档写的是 `result_urls` 数组，所以两个都要兼容 |
| 失败 | `data.fail_reason`；任务不存在时返回 `400 {"code":"task_not_exist"}` |
| 计费 | 提交即预扣，失败由上游自动退回 |
| 耗时 | 文生图约 80 秒，图生图约 300 秒（`input_images` 用公网 URL） |

模型分类（同一请求分别打同步端点和异步端点）：

| 模型 | 同步 `/v1/images/generations` | 异步 `/image/submit` | 结论 |
|---|---|---|---|
| `gpt-image-2-text-to-image` | 400，提示只能走异步 | 200，task_id | 必须改异步 |
| `gpt-image-2-image-to-image` | 400，提示只能走异步 | 200，task_id | 必须改异步 |
| `gpt-image-2-5-flare` | 200，b64_json | 未测（与 sunburst 同类） | 保持同步 |
| `gpt-image-2-5-sunburst` | 200，b64_json | 400 `prompt is required` / `plugin usage enum is not an allowed value` | 上游不提供异步，保持同步 |

### 2.2 兔子（定价页 `supported_endpoint_types` 中的 `openai-video`，标注为 “Async Image Generation”）

| 项 | 实测 |
|---|---|
| 支持的模型 | `gpt-image-2`、`gpt-image-2.5-sunburst` |
| 提交（无参考图） | `POST https://api.tu-zi.com/v1/videos`，JSON `{"model","prompt","size","quality","n"}` |
| 提交（有参考图） | 同一路径，multipart，参考图放在可重复的 `input_reference` 文件字段，实测 2 张都生效。multipart 的数字字段按 JSON 类型解析，`n` 传字符串会返回 400，所以 multipart 里不传 `n` |
| 提交响应 | `{"id":"task_…","task_id":"task_…","object":"video","status":"queued"}` |
| 查询 | `GET /v1/videos/{id}`，状态 `queued → in_progress → completed / failed` |
| 结果 | `video_url` 是 S3 预签名的图片地址，24 小时有效 |
| 耗时 | 约 36–50 秒 |

## 3. 方案

### 3.1 新增两个模型级严格协议

在 `lib/channel-protocol-registry.ts` 中登记，管理员在“模型配置 → 协议”里给具体模型选用：

| 协议 ID | 标签 | createPath / editPath | queryPath | resultField | statusField |
|---|---|---|---|---|---|
| `modelbay-image-task` | ModelBay 异步图片任务 | `/image/submit` | `/image/fetch/:task_id` | `data.result_urls / data.result_url` | `data.status` |
| `tuzi-image-task` | 兔子异步图片任务 | `/v1/videos` | `/v1/videos/:task_id` | `video_url` | `status` |

两者的 `taskIdField` 分别是 `data.task_id` 和 `id`，`supportsReferenceImage` 为 true。与 Seedance 协议一样，只能在模型级使用，不能设成渠道级协议。

### 3.2 执行链路（复用声明式图片协议 `runCustomImageTask` / `pollCustomImageTask`）

- `image-task-runtime.ts` 的 `usesDeclarativeImageProtocol` 加入这两个协议，提交时 `singleStep=true`，拿到 task_id 就返回 `pending`，由 worker 按现有调度轮询。
- 请求体用专用构建函数（新文件 `image-task-async-request.ts`），不使用模板：
  - ModelBay：`input.prompt`；`input.quality` 只在 `low/medium/high/auto` 中取值，`1k/2k/4k` 先转成 `low/medium/high`；`number_of_images` 固定为 1；`aspect_ratio` 由尺寸推导，auto 时不传；`input_images` 放参考图的公网 URL，有蒙版时把蒙版追加在最后（与画布提示词“最后一张是蒙版”一致）；`background` 只传 `auto/opaque`，透明背景不传。
  - 兔子：无参考图时发 JSON `{model, prompt, size, quality, n:1}`。有参考图或蒙版时改发 multipart，参考图放 `input_reference` 文件字段，蒙版追加在最后，不传 `n`。`size` 用平台已有的 `resolveRequestSize`。`quality` 只在 `low/medium/high/xhigh/max` 中取值，否则不传。
- 状态：`isPendingImageStatus` 增加 `not_start` 和 `submitted`。其他非进行中状态，如果没有图片，就按终态失败处理，原因从 `fail_reason` 或 `error.message` 读取，并走现有退款逻辑。
- 结果落盘：沿用 `prepareImageTaskResults`，结果地址经过站内 `/_media` 代理下载并转存，因为两家的结果链接都有时效。

### 3.3 站内系统代理 `/api/ai/system/{channelId}`

- `targetUrl` 的字面路径列表加入两个新协议，避免 `/image/submit` 被当成 OpenAI 路径补上 `/v1`。
- 计费分类：兔子的 `/v1/videos` 会被 `classifyPointsRequest` 识别为视频计费，导致图片任务被拒（“请求能力与逻辑模型不匹配”）或按视频倍率扣费。模型级协议是 `*-image-task` 时，改为优先按绑定能力分类（`classifyConfiguredPointsRequest`）。张数和质量倍率同时读取 `input.number_of_images`、`input.quality`，以及 multipart 表单字段。
- 查询鉴权：查询路径来自 `modelConfig.queryPath`，现有的 `authorizeSystemAiProxyRequest` 和 `userOwnsGenerationUpstreamTask` 可以直接覆盖。

### 3.4 不在范围内

- ModelBay 的 `gpt-image-2-5-flare` / `sunburst` 上游不提供异步，保持同步。
- 轮询节奏沿用调度器的 5s → 10s → 25s，不另写固定延时。

## 4. 配置变更（代码上线后由管理员在后台操作，测试和生产各做一次）

| 渠道 | 模型 | 模型级协议 |
|---|---|---|
| ModelBay | `gpt-image-2-text-to-image`、`gpt-image-2-image-to-image` | `modelbay-image-task`（必须改） |
| 兔子 | `gpt-image-2`、`gpt-image-2.5-sunburst` | `tuzi-image-task` |
| ModelBay | `gpt-image-2-5-flare`、`gpt-image-2-5-sunburst` | 不改（同步） |

## 5. 验证

1. 单元测试：两个请求构建函数（含参考图、蒙版、质量映射）、状态解析、计费分类、`targetUrl` 字面路径、注册表协议列表。
2. 本地 fixture 上游：模拟提交 → 进行中 → 成功 / 失败两条路径，走完 `/api/image-tasks` 全链路，确认 `upstream_task_id` 落库、分次轮询、结果落盘、失败退款。
3. 用测试 key 实调各一次（文生图 1 张、参考图 1 张），确认提交请求在秒级返回、最终出图。
4. `npm run typecheck`、`npm run lint`、相关 vitest。
