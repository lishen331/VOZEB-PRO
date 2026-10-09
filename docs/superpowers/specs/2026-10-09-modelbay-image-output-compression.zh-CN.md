# ModelBay 图片输出压缩（方案 1）

## 背景

ModelBay 上游节点在法国，服务器在阿里云广州，跨境单连接吞吐很低。2K 图下载已需 92–357 秒，4K 会更久。超时调大不能根治，需要减少传输体积。

## 修正（2026-10-10）

第一版改在 `buildModelBayImageTaskRequest`（`modelbay-image-task` 异步协议），但画布实际使用的 `gpt-image-2-5-sunburst` 在 ModelBay 渠道里配置的协议是 `newapi`，走 `/images/generations`、`/images/edits`，没有经过异步接口。第一版已撤回，异步接口恢复原样。

## 影响范围

只在系统渠道代理路由 `web/src/app/api/ai/system/[channelId]/[...path]/route.ts` 转发前改写请求体，条件同时满足才生效：

- 渠道 `baseUrl` 主机名是 `modelbay.io` 或其子域名。
- 路径是 `/images/generations` 或 `/images/edits`（可带 `v1` 前缀）。
- 不需要透明通道。

兔子、模汇的渠道主机名不是 modelbay.io，请求体原样转发。全局常量 `IMAGE_OUTPUT_FORMAT = "png"` 不改。

## 改动

1. 符合条件的 JSON 或 multipart 请求：设置 `output_format: "jpeg"`、`output_compression: 85`。
2. 透明判断：`background === "transparent"`，或提示词含"透明 / alpha / transparent"。JSON 生成请求的透明要求只写在提示词里，没有 `background` 字段，所以要靠提示词判断。误判时保留 PNG，只会影响压缩，不会出错。
3. 单测（`route.test.ts`）覆盖三种情况：ModelBay 不透明请求改成 JPEG；ModelBay 透明请求保留 PNG；非 ModelBay 渠道请求不变。

## 验证

部署 staging 后，用 `gpt-image-2-5-sunburst` 出一张不透明 2K 图，查看 `remote_asset_timing` 日志里的字节数和格式，或者看画布节点 metadata 里的 `mimeType` / `bytes`：

- 变成 `image/jpeg` 且体积明显变小：生效。
- 仍是 PNG：说明 ModelBay 或上游忽略了这两个字段，这样不会有副作用，但起不到提速作用。
- 提交返回 400：撤回本改动。

## 回退

删除 `route.ts` 里的 `compressModelBayImageOutput` 调用即可，无数据迁移。
