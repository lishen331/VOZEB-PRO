# 模汇 Seedance 真人视频协议开发文档

2026-10-08 · 目标：课堂前上线生产 · 渠道 `https://api.easyart.cc/`

## 1. 需求

模汇渠道的 Seedance 2.0 / 2.5 能正常出片，并支持真人参考图。前端无感，不加真人模式。

## 2. 现状

- staging 渠道 `ltjbgNrAMhhftnM6jPHep`（模汇x中漫 API 图片 视频 渠道）和生产模汇渠道，4 个 Seedance 模型（`doubao-seedance-2-0`、`-2-5`、`-2-0-fast`、`-2-0-mini`）的模型配置都是 `newapi` + `/video/generations`。
- 模汇文档把 `/v1/video/generations`（多模态、参考图两种）标为“已废弃”，现行接口是 `POST /v1/videos/generations`。

## 3. 实测（2026-10-08，staging 模汇令牌）

| 测试 | 结果 |
|---|---|
| `POST /api/v5/assets`（`url` + `asset_type:Image`） | `code:0`，返回数字 `Id`；约 15 秒 `Processing → Active` |
| `asset://<Id>` 提交 2.0 和 2.5 | HTTP 400 `The specified asset ... is not found`，素材库 ID 不能用于生成 |
| 真人图公网 URL 直传，`reference_image`，2.0，480p，4 秒 | 两张不同真人图都 `queued → running → succeeded`，约 4–5 分钟，结果在 `content.video_url` |
| 2.5 + `480p` | HTTP 400 `当前分辨率 480p 不支持` |

结论：模汇真人图直接传 URL 就能出片，不需要入库。素材库这条路目前不可用，本次不接。

## 4. 设计

### 4.1 新协议 `mohui-seedance`

- 登记在 `channel-protocol-registry.ts`，strict，只有 video 能力：
  - createPath / imageToVideoPath：`/v1/videos/generations`
  - queryPath：`/v1/videos/generations/:task_id`
  - resultField：`content.video_url`，statusField：`status`
- 状态 `succeeded / failed / expired` 已在通用状态集里，查询沿用 `queryVideoTaskUpstream`，不改。
- 加入协议类型联合、渠道归一化白名单、`targetUrl` 的 literal 列表和 `assertVideoReferenceRoles` 的首尾帧支持列表。

### 4.2 请求构建 `buildMohuiSeedanceVideoRequest`（`lib/mohui-seedance-video.ts`）

- `content[]`：先放 `text`，再放素材。
  - 只有 1 张首帧，或只有首帧加尾帧两张图：保留 `first_frame` / `last_frame`，按首、尾排序。
  - 其余情况：图片一律写 `reference_image`，视频写 `reference_video`，音频写 `reference_audio`。
- `resolution`：转成小写。2.0 支持 `480p/720p/1080p`；fast、mini 只支持 `480p/720p`；2.5 支持 `720p/1080p`。不在支持集里就不传，用上游默认的 720p。
- `ratio`：在 `16:9/4:3/1:1/3:4/9:16/21:9/adaptive` 内就原样传。auto 时，有首帧传 `adaptive`，否则不传。
- `duration`：auto（-1）时不传（上游默认 5 秒），其余裁剪到 4–15 秒。2.5 的上限文档没写，先按 15 秒，未验证。
- `generate_audio` 原样传，`watermark:false`。

### 4.3 真人素材

不入库。参考图沿用现有签名后的公网 URL（`signProviderReference`），和其他渠道一样。

## 5. 配置变更（staging 先，生产后）

把模汇渠道 4 个 Seedance 模型的模型配置改成 `mohui-seedance`，渠道级协议仍是 `newapi`，图片模型不动。改之前先导出原配置。生产上只改配置，不新增绑定，启用状态保持现状。

## 6. 验证

- 单测：构建器的角色、排序、分辨率、比例和时长；协议登记列表；首尾帧校验。
- tsc、vitest、prettier。
- staging：画布用模汇 2.0 分别跑无参考和真人参考图两种；2.5 跑真人参考图。
- 生产：发布后各跑一条 2.0 真人参考图。

## 7. 回滚

把模型配置改回导出的 `newapi` 原配置，立即生效。代码问题用 `workflow_dispatch` 重新部署上一个版本标签。
