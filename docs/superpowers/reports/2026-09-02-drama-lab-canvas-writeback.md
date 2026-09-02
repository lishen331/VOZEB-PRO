# 短剧 Canvas 显式回写契约

## 范围

本契约只适用于短剧实验室的一级剧集 Canvas。普通 `/canvas` 不使用该接口。Canvas 结果默认只保存在 CanvasProject，只有用户显式点击“应用到短剧”时才写入 DramaProject。

## 接口

```text
POST /api/drama-lab/canvas-projects/:canvasId/writeback
```

请求体至少包含：

```json
{
  "projectId": "drama-project-id",
  "episodeId": "episode-id",
  "nodeId": "canvas-node-id",
  "kind": "asset-reference | shot-frame | shot-video | shot-field",
  "expectedProjectUpdatedAt": "2026-09-02T00:00:00.000Z",
  "expectedCanvasUpdatedAt": "2026-09-02T00:00:00.000Z"
}
```

目标参数按动作提供：

- `asset-reference`：`assetType` 为 `character`、`scene` 或 `prop`，并提供 `assetId`。
- `shot-frame`：提供 `shotId` 和 `frameType`（`first`、`key`、`last`）。节点必须是图片节点。
- `shot-video`：提供 `shotId`。节点必须是视频节点。
- `shot-field`：提供 `shotId` 和白名单 `field`，节点必须是文本节点。

服务端会校验 Canvas 的 `sourceHandoffId` 与项目/剧集完全一致，校验节点上下文、真实资产/镜头 ID、项目版本和可选的 Canvas 版本。带 `storageKey` 的媒体必须属于当前用户、类型匹配且未过期；没有归属登记的媒体只允许本地相对 URL，外部 URI 会被拒绝。版本冲突返回 `409`，不会静默覆盖或自动重试。

成功响应为 `{ code: 0, data: { project, canvas, applied }, msg }`。接口不会修改 CanvasProject；需要再次投影时由用户显式执行同步。
