# 兔子 / ModelBay 生图生视频渠道与真人素材开发文档

更新 2026-10-07（第二版，基于 staging 数据与兔子实测）· 目标 2026-10-08 课堂可用

## 1. 需求

1. 画布能用 GPT image 2 / 2.5 生图，用 Seedance 2 / 2.5 生视频。
2. 生图不处理真人，只要能正常出图。
3. 视频既要正常出片，也要支持真人参考图。前端无感：不加“真人模式”，不加单独的真人模型。
4. 配好后启用用户关闭的 ModelBay 绑定，用户在画布测试。

## 2. 实测结论（2026-10-07，兔子测试令牌）

| 测试 | 结果 |
|---|---|
| `POST /v1/seedance/assets`（multipart 上传真人头像） | `success:true`，`status=pending`，`compliance_started=false` |
| `POST /v1/seedance/assets/{id}/compliance` | 返回 `review_task_id`，约 6 秒后 `GET` 变为 `active` |
| `POST /v1/videos` + `asset://` 引用（2.0，480P，4 秒） | `queued → in_progress → completed`，约 5 分钟，返回 `video_url` 和 `metadata.video_url` |
| `POST /v1/videos` + 同一张图的 base64 直传 | 创建时返回 HTTP 200 和 `queued`；约 10 秒后查询变为 `failed`，`error.message` 为 `InputImageSensitiveContentDetected.PrivacyInformation ... may contain real person` |
| `POST /v1/images/generations`，`gpt-image-2` 和 `gpt-image-2.5` | 都返回 HTTP 200 和 `data[0].url`，耗时分别 79 秒、54 秒 |

关键点：兔子拒绝真人直传是异步的，发生在任务排队之后，提交阶段拿不到拒绝。原方案“先直传，被拒再入库重提”在兔子上会让用户多等一轮还失败，所以取消。

## 3. staging 现状与根因

渠道（`vozeb_pro_system_model_channels`）：兔子是 `hr5VKuKJKirZ1-sdRZPY5`，ModelBay 是 `X9te4qOV0ZaPsJpErRRWS`，两个渠道都已启用，渠道级协议都是 `newapi`。

- 画布报错 `Invalid URL (POST /v1/doubao/api/v3/contents/generations/tasks)`：查了任务 `e62cf848…`（10-07 06:17）的落库配置，用的是渠道 `uXtWpEDAONav5A5x0C8aT`，协议 `auto`，createPath `/doubao/api/v3/contents/generations/tasks`。`auto` 不在 literal 列表里，代理按 OpenAI 规则补了 `/v1`。这个渠道已经不在当前渠道列表中。
- “当前无可用渠道”：ModelBay 的全部逻辑模型绑定（`official/seedance-*`、`gpt-image-2-*` 等）都是 `enabled:false`，也就是用户关掉的那批。
- ModelBay 现有的 Seedance 模型配置是 `custom` 或 `newapi`，走 `/videos` multipart。这条路只能传一张 `input_reference`，也不走 `prepareModelBayReferences`，所以没有真人能力。
- 兔子现有的 Seedance 模型配置是 `newapi` 的 `/video/generations`（New API Doubao 格式），不是兔子文档里 `/v1/videos` 的 `content[]` 格式，也没有素材入库。
- 代码层面：`tuzi-seedance` 协议只做了登记，没有请求构建和素材服务。`assertVideoReferenceRoles` 不认识 `tuzi-seedance` 和 `modelbay-seedance`，会拒绝首尾帧。`targetUrl` 的 literal 列表里也没有 `tuzi-seedance`。
- 生图：逻辑模型 `gpt-image-2` 已经绑定模汇（优先级 3）和兔子（8），`gpt-image-2.5` 绑定兔子，staging 日志里 10-06 生图全部成功。生图不需要改代码。

## 4. 设计

### 4.1 兔子 Seedance（新协议实现 `tuzi-seedance`）

请求体（`buildTuziSeedanceVideoRequest`，JSON，生成参数放顶层）：

- `model`；`content[]`：先放 `text`，再放参考素材。图片用 `image_url` 加 role，首帧、尾帧保持原 role，其余一律写 `reference_image`（多图不写 role 会被当成首尾帧）；视频用 `video_url` + `reference_video`；音频用 `audio_url` + `reference_audio`。
- `refer_model`：
  - 没有素材时用 `textToVideo`。
  - 只有 1 张首帧时用 `imageToVideo`。
  - 只有首帧和尾帧两张图时用 `firstAndLastFrame`。
  - 其余情况用 `referToVideo`，首尾帧和其他素材混用时，首尾帧降级为 `reference_image`。
- `duration`：时长为 auto（-1）时不传，交给上游默认 5 秒；其余值裁剪到 4–15（2.0）或 4–30（2.5）。
- `ratio`：auto 时不传。2.5 的 `imageToVideo` 和 `firstAndLastFrame` 强制 `adaptive`。
- `resolution`：转成大写 `480P/720P/1080P`，不在候选集里就不传。
- `generate_audio` 原样传。

查询沿用通用 `queryVideoTaskUpstream`：`GET /v1/videos/:task_id`，`completed` 和 `failed` 已经在通用状态集里，结果字段是 `video_url`，失败原因从 `error.message` 读。

### 4.2 兔子真人素材（新增 `tuzi-asset-service.ts`）

因为拒绝是异步的（见第 2 节），兔子渠道的图片参考一律先入库，再用 `asset://` 提交，不再做“直传被拒后重试”：

1. 读取图片字节。`data:` 直接解码，HTTP(S) 用 `fetchSafeOutbound` 下载，上限 30 MiB，并校验真实 MIME。
2. 用 `POST /v1/seedance/assets` 上传，multipart 字段为 `file`。
3. 用 `POST /v1/seedance/assets/{id}/compliance` 发起审核，只调用一次。
4. 用 `GET /v1/seedance/assets/{id}` 轮询，间隔 3 秒加抖动，最多 3 分钟，直到 `active` 时取 `data.reference`。

- `success:false`、`failed`、`deleted` 和超时都抛 `TuziAssetError`。
- 入库失败时，这一张图退回原 URL 直传，不中断任务。非真人图直传可以出片；真人图会被上游拒绝，用户看到的是上游的真实原因。这样兔子素材权限出问题时，普通视频不受影响。
- 进程内缓存的 key 是 `channelId + sha256(图片字节)`，24 小时有效，同一张脸在多个镜头里只入库一次。跨进程的 DB 缓存表放到第 8 节作为后续项。
- 视频和音频参考不入库，直接传 URL（兔子文档里素材库只用于图片真人审核）。

### 4.3 ModelBay Seedance（沿用现有 `modelbay-seedance` 代码）

- `official/seedance-2` 和 `official/seedance-2-5` 的模型配置改为 `modelbay-seedance`：createPath 和 imageToVideoPath 用 `/doubao/api/v3/contents/generations/tasks`，queryPath 用 `/doubao/api/v3/contents/generations/tasks/:task_id`，resultField 用 `content.video_url`。
- 素材继续走现有 `prepareModelBayReferences`（全部入库）。ModelBay 真人直传在提交阶段同步返回 400，按需入库可以以后再做，这次不改。

### 4.4 公共改动

- `targetUrl` 的 literal 路径列表加入 `tuzi-seedance`。
- `assertVideoReferenceRoles` 让 `tuzi-seedance` 和 `modelbay-seedance` 支持 `reference`、`first_frame`、`last_frame`。

### 4.5 生图

不改代码。staging 上兔子 `gpt-image-2` 和 `gpt-image-2.5` 的模型配置是 `/images/generations` + `/images/edits` multipart，实测能出图。ModelBay 的 `gpt-image-2-*` 配置相同，随第 5 节一起启用。

## 5. staging 配置（写共享库前先说明影响）

1. 兔子渠道：`doubao-seedance-2-0-260128` 和 `doubao-seedance-2-5-260628` 的模型配置改为 `tuzi-seedance`（路径和字段按 4.1）。只影响这两个模型，原配置先导出备份。
2. ModelBay 渠道：`official/seedance-2` 和 `official/seedance-2-5` 的模型配置按 4.3 修改。
3. 启用用户关掉的 ModelBay 逻辑模型绑定：`official/seedance-2`、`official/seedance-2-5`、`gpt-image-2-text-to-image`、`gpt-image-2-image-to-image`、`gpt-image-2-5-flare`、`gpt-image-2-5-sunburst`。
4. 优先使用后台渠道页面保存；如果改 DB，改完要确认服务读到了新配置。

## 6. 实施顺序

1. 代码：4.1、4.2、4.4，附单测。
2. 跑 tsc、vitest、prettier 和开发地图脚本，推 develop，等 staging 部署完成。
3. 按第 5 节改 staging 配置并启用。
4. 用户在画布测试：兔子和 ModelBay × Seedance 2/2.5 × {无参考、非真人图、真人图}，加上 GPT image 2/2.5 的文生图和图生图。

## 7. 验证

- 单测：`buildTuziSeedanceVideoRequest` 各模式的 refer_model、role、ratio、resolution 和 duration；`tuzi-asset-service` 的上传、审核、轮询、`success:false`、failed 和缓存命中；入库失败时退回直传。
- 兔子真实链路已经手工验证（第 2 节），部署后再用画布验证一次端到端。

## 8. 后续（不在本次范围）

- 跨进程素材缓存表 `vozeb_pro_seedance_assets`。
- ModelBay 按需入库，省 $0.05/张。
- 把 ModelBay 绑到兔子的逻辑模型下做故障转移，需要先确认 ModelBay 出片稳定。
