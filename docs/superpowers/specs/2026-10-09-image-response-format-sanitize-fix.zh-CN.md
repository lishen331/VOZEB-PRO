# 模型级 imageResponseFormat 未生效修复（开发文档）

日期：2026-10-09　状态：已确认，实施中
关联：提交 b00fbad7（模型级 imageResponseFormat），`docs/development/2026-10-09-modelbay-image-url-response.zh-CN.md`

## 1. 现象

ModelBay 绑定已按文档把 `imageResponseFormat` 配成 `"url"`，但上游请求体仍然是 `response_format: "b64_json"`，4K 图片还是走 base64 大响应。

## 2. 根因（已用探针复现）

调用链：

1. `generation-channel.ts` `resolveModelAdvancedConfig`：把模型级配置合并进 advancedConfig，`imageResponseFormat: "url"` 被拍平到顶层，此时仍在。
2. `image-task-support.ts` `sanitizeConfigs` → `sanitizeAdvancedConfig`：按白名单重建对象，白名单里没有 `imageResponseFormat`，也没有 `modelConfigs`，字段在这一步丢失。
3. `explicitImageResponseFormat` 只从 `modelConfigs[model]` 读，读到 `undefined`，回落到 `protocol === "newapi" → b64_json`。

探针输出：

```
resolved.imageResponseFormat= url
sanitized keys: protocol,...,supportsReferenceAudio   （无 imageResponseFormat / modelConfigs）
explicit= undefined preferred= b64_json
```

b00fbad7 的测试直接把带 `modelConfigs` 的 config 交给 `runOpenAiImageTask`，绕过了 `sanitizeConfigs`，所以没发现。

## 3. 修改

1. `SystemChannelAdvancedConfig` 增加可选字段 `imageResponseFormat?: "url" | "b64_json"`（运行时 `resolveChannelModelAdvancedConfig` 本来就会把它拍平到顶层，这里只是让类型如实反映）。
2. `sanitizeAdvancedConfig` 保留顶层 `imageResponseFormat`，只接受 `"url"` / `"b64_json"`，其他值丢弃。
3. `explicitImageResponseFormat` 先读顶层 `advancedConfig.imageResponseFormat`，没有再读 `modelConfigs[model]`（保留后者，兼容直接传入未 sanitize 配置的调用方）。

不做：不在 sanitize 里放开整个 `modelConfigs`。`image-task-support.ts` 中另有两处从 `modelConfigs` 读 `protocol`，放开会改变它们的协议判断，超出本次范围。

## 4. 影响面

- 只影响显式配置了 `imageResponseFormat` 的绑定（目前仅 ModelBay sunburst/flare）。
- 未配置的渠道 sanitize 后结果不变，继续按 `newapi → b64_json`、其他 → `url`。

## 5. 测试

- 新增：`sanitizeConfigs` 走真实绑定解析，断言 `advancedConfig.imageResponseFormat === "url"`，且 `preferredImageResponseFormat` 返回 `"url"`。
- 新增：未配置时 newapi 渠道仍返回 `"b64_json"`；非法值被丢弃。
- 回归：`image-task-support.test.ts`、`image-task-openai-live.test.ts`，以及 `tsc --noEmit`。

## 6. 上线

部署 staging 后，用 ModelBay sunburst 跑一次 4K，确认上游请求体为 `response_format: "url"`，结果落 OSS 正常；再发生产。
