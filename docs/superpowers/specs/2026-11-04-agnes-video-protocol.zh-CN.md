# Agnes 视频协议接入（2026-11-04）

## 现象

测试服画布：文本节点可用，图片、视频节点失败，前端只显示「网络异常，请点击重试」。
失败节点模型分别是 `gamaimage`、`gamavideo`（逻辑模型），上游走 OpenAI 协议渠道（Agnes，`https://apihub.agnes-ai.com/v1`）。

## 已排除

- 密钥与出口正常：用同一把测试密钥直连 `GET /v1/models` 返回 9 个模型（含 `agnes-image-2.0/2.1/2.5-flash`、`agnes-video-2.5`、`agnes-video-2.5-flash`）。
- 图片接口正常：直连 `POST /v1/images/generations`（model、prompt、size、n）返回 200 并出图。
- 图片任务的 403 来自系统代理：`authorizeSystemAiProxyRequest` 只认 `binding.enabled = true` 的逻辑模型绑定，该渠道的 agnes 绑定当时全部关闭，代理返回「该上游模型未绑定可用逻辑模型」。这是后台配置，不是代码问题，不在本次改动范围。

## 根因

Agnes 视频不是通用 OpenAI 视频接口。官方文档（wiki.agnes-ai.com，Agnes Video 2.5 / 2.5 Flash）：

- 创建：`POST /v1/videos`，必填 `model`、`prompt`、`mode`。`mode` 取值 `text` / `keyframe` / `reference`。
  - `text`：纯文生视频，不能带任何媒体字段。
  - `keyframe`：首帧 `first_frame`、尾帧 `last_frame`，至少给一个。
  - `reference`：参考图 `images`、参考音频 `audios`，至少给一个。
- 其他字段：`seconds` 是字符串（`"4"`–`"12"`，默认 `"5"`），`aspect_ratio`（`16:9`、`1:1`、`9:16` 等），`size` 在 Flash 上只接受 `"720P"`。
- 查询：`GET /agnesapi?video_id=<VIDEO_ID>`，不走 `/v1/videos/{id}`。返回体顶层 `status`（`completed` / `failed`）和 `url`。
- 创建响应里 `video_id` 才是查询用的标识，`id` / `task_id` 是异步任务号。

实测：不带 `mode` 提交返回 HTTP 400 `mode is required`；`mode` 取值错误返回 `invalid mode`。

现有通用视频路径（`createUpstream`）拼的请求体没有 `mode`，查询路径也不是 `/agnesapi`，所以 Agnes 视频渠道一定失败。

另外，代码内置的 Agnes 目录（`agnes-model-catalog.ts`）还停留在已下线的 `agnes-video-v2.0`，现在官方模型是 `agnes-video-2.5` 和 `agnes-video-2.5-flash`。

## 改动（只动 develop / 测试服，不碰生产）

1. 新增 Agnes 视频请求构造：按参考素材推导 `mode`，字段名对齐官方文档。
   - 无参考 → `text`；有首/尾帧 → `keyframe`；有参考图或参考音频 → `reference`。
   - `seconds` 转成字符串并夹到 4–12；`size` 比例转成 `aspect_ratio`。
2. 在 `createUpstream` 里，Agnes 渠道（`isAgnesApiBaseUrl`）走这条构造，创建路径固定 `/videos`，并把返回的 `video_id` 记成上游任务号、查询路径记成 `/agnesapi?video_id=:task_id`。
3. 练习排队提交（`createQueuedPracticeVideoTaskUpstreamStep`）目前只认 RunningHub，普通渠道直接报「缺少可恢复的 RunningHub 工作流配置」。改成：RunningHub 维持原路径，其余渠道复用 `createUpstream`。
4. 更新 Agnes 模型目录：视频模型换成 `agnes-video-2.5`、`agnes-video-2.5-flash`，带上 `createPath`、`queryPath` 和推荐配置。
5. 错误读取：图片任务服务端 `readFetchError` 只读 `error.message`，代理返回的字符串 `error` 被丢掉，真实原因被盖成「状态码 403」。补上字符串形式。

## 不改

- 图片生成协议：Agnes 图片是标准 `/v1/images/generations`，直连已通过，不改请求。
- 后台渠道绑定开关：由管理员在后台打开并保存，不写进代码。
- 生产环境：本次只提交 develop。
