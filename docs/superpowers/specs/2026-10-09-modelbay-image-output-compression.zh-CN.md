# ModelBay 图片输出压缩（方案 1）

## 背景

ModelBay 上游节点在法国，服务器在阿里云广州，跨境单连接吞吐很低。2K 图下载已需 92–357 秒，4K 会更久。超时调大不能根治，需要减少传输体积。

## 影响范围

只改 `modelbay-image-task` 协议：

- 请求体由 `buildModelBayImageTaskRequest`（`web/src/app/api/image-tasks/image-task-async-request.ts`）单独构造。
- 兔子走 `buildTuziImageTaskJsonRequest` / `buildTuziImageTaskFormData`，不改。
- 模汇走 OpenAI 兼容路径（`image-task-openai.ts` / `image-task-support.ts`），全局常量 `IMAGE_OUTPUT_FORMAT = "png"` 不改。

## 改动

1. `buildModelBayImageTaskRequest` 的 `input` 里：
   - 非透明背景：加 `output_format: "jpeg"`、`output_compression: 85`。
   - 透明背景（`outputBackground === "transparent"`）：加 `output_format: "png"`，不压缩，保留 alpha。
2. 诊断日志：结果图下载完成时记录字节数、耗时、平均 KB/s、实际图片格式（按魔数判断）。只记日志，不改变下载行为。
3. 单测：更新 `image-task-async-request.test.ts`，覆盖非透明、透明、未指定背景三种情况。确认兔子请求体不含这些字段。

## 风险与验证

- 未确认 ModelBay 是否把 `output_format` / `output_compression` 透传给上游。上线前用 staging 跑一张 2K 非透明图，看返回图片的格式和字节数：
  - 如果变成 JPEG 且体积明显变小，说明生效。
  - 如果仍是 PNG，说明字段被忽略。这种情况下无副作用，但方案 1 对 ModelBay 无效，需要另想办法。
  - 如果 ModelBay 返回 400（不认识字段），立即回退该字段。
- JPEG 有轻微画质损失，85 对照片类内容肉眼基本无差异。
- 下游按魔数识别 mime（`rawImageBase64DataUrl`、`writeRemoteAsset`），不依赖 png 后缀。

## 回退

删除 `buildModelBayImageTaskRequest` 中新增的两个字段即可，无数据迁移。
