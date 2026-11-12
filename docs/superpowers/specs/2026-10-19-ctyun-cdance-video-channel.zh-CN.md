# 天翼云星辰 cdance 视频渠道配置与真人参考图支持

日期：2026-10-19
环境：测试 `8.163.37.148` / 生产 `8.163.33.161`
上游文档：天翼云边缘 AI 网关 cdance 对接指引（08 系列）

## 1. 当前状态

已在测试和生产建好渠道「天翼云星辰 TokenHub 视频渠道」，baseUrl `https://tokenhub.ctyun.cn/v1`，协议 `seedance`。

- 模型：`cdance2.0-0807`、`cdance2.0-fast-0807`、`cdance2.0-mini-0807`
- 逻辑模型：天翼云 Seedance 2.0 / 2.0 Fast / 2.0 Mini，默认绑定到这个渠道
- 已用真实任务验证文生视频：测试 154 秒、生产 153 秒，均成功并转存
- 渠道与三个模型均为启用状态，可以直接在画布使用

## 2. 文档核对结果

### 2.1 接口形态（确认是异步）

- 创建：`POST /contents/generations/tasks`，立即返回 `id`，状态 `queued`
- 查询：`GET /contents/generations/tasks/:id`，状态 `running` → `succeeded` / `failed`
- 结果：`content.video_url`，火山 TOS 预签名地址，有效期 24 小时
- 与我们配置的 `createPath` / `queryPath` / `resultField` / `statusField` 完全一致

### 2.2 参考图（第 4 部分）

参考图放在 `content` 数组里，格式为：

```json
{ "type": "image_url", "role": "reference_image", "image_url": { "url": "https://…" } }
```

同样支持 `video_url`（`reference_video`）和 `audio_url`（`reference_audio`）。首帧、尾帧用 `first_frame` / `last_frame` 角色。

要求：**必须是公网可访问的 URL，不能传 base64。**

我们现有实现（`video-generation-route.ts` 的 `videoReferenceContent`）已经按这个结构生成 `content`：参考图是 `image_url` + 公网 URL，参考视频/音频同理。`requestTemplate` 里的 `{{content}}` 会整体替换成该数组。

结论：**参考图不需要改代码**，但依赖画布参考图能拿到公网 URL。站内素材通过签名 URL 提供，需确认上游可访问。

### 2.3 素材上传（第 5 部分）

- 上传：`POST /api/assets/upload`，body `{ "url": "<公网图片地址>", "asset_type": "Image", "name": "..." }`
- 返回：`{ "code": 0, "data": { "Id": "asset-2026…" } }`
- 查询：`GET /api/assets/:assetId`
- 删除：`DELETE /api/assets/:assetId`
- 生成时传 `asset://<assetId>` 作为 `image_url.url`
- 文档注明「默认不开启，需要针对客户粒度加白；仅支持公网地址，不支持 base64」，素材保留最长 30 天

实测：用当前 AppKey 调 `POST /v1/api/assets/upload` 返回 200 且拿到 asset id，说明该能力对我们的账号已开通。

## 3. 待决事项

1. **是否接素材上传流程**：当前参考图直接传 URL，已满足文档第 4 部分。素材上传的第 5 部分是给「真人素材需要固定资产 ID / 复用」的场景用的。接入需要新增一套 `assets` 协议的调用（上传、删除、过期处理），代码量不小。建议先用 URL 方式上线，观察真人参考图成功率再决定。
2. **站内素材公网可达性**：需要验证画布里的站内图片 URL 能被天翼云拉到。若拉不到，才必须走素材上传。
3. **费率**：当前逻辑模型按默认单价（视频 1 点/次）计费，没有单独设价。

## 4. 变更计划（待确认后执行）

本轮不改业务代码。只做验证：

1. 在测试画布用 `天翼云 Seedance 2.0 Fast` 跑一次带参考图的图生视频，确认 `content` 里的 `image_url.url` 是公网 URL，且生成成功
2. 观察上游日志，确认参考图被正确读取（未出现「参考图无法下载」类报错）

如果第 2 步失败，再单独出一版接入素材上传的设计。
