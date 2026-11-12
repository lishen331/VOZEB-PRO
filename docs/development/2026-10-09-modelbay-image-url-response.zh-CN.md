# ModelBay 图片结果改用 URL 返回（开发文档）

状态：代码已实现（第 3.2 节），待部署后按第 6 节给 ModelBay 绑定加配置
范围：仅 ModelBay 渠道（`X9te4qOV0ZaPsJpErRRWS`）的 `gpt-image-2-5-sunburst*` / `gpt-image-2-5-flare*` 绑定
不影响：兔子渠道及其他所有 `newapi` 渠道，继续使用 `b64_json`

## 1. 背景

### 1.1 现状

`preferredImageResponseFormat`（[image-task-support.ts:120](../../web/src/app/api/image-tasks/image-task-support.ts#L120)）按渠道级协议判断：`protocol === "newapi"` 一律请求 `b64_json`。理由是 New API 网关的 URL 常放在应用服务器访问不到的 CDN 上。

ModelBay 渠道是 `newapi` 协议，所以 sunburst/flare 目前都走 base64，上游把 4K 图片编码后放在 JSON 里一次性返回（单次 6MB 以上）。

### 1.2 问题

生产数据（最近 3 天，ModelBay `gpt-image-2-5-sunburst`）：

| 指标 | 数值 |
|---|---|
| 任务数 | 74 |
| 成功数 | 8 |
| 平均耗时 | 98 秒 |
| 最长耗时 | 1664 秒 |

Codex 实测（数据由 Codex 提供，本文未独立复测）：

| 方式 | 返回体 | 耗时 |
|---|---|---|
| `b64_json` | 约 6MB | 平均 14 秒，最慢约 7 分钟 |
| `url` | 448 字节 | 6.4MB 原图下载 2.35 秒 |

base64 的大响应体在 ModelBay 链路上传输慢、抖动大，容易碰到超时，并且同一份数据在内存里要多次复制（JSON 字符串、解码后的 Buffer、data URL）。

## 2. 目标与非目标

目标：
- ModelBay sunburst/flare 的生成和编辑请求带 `response_format: "url"`。
- 拿到 URL 后由服务端下载、校验，并按现有流程转存到 OSS，用户最终拿到的仍是我们自己的永久地址。
- 可以只靠改渠道配置开关和回滚，不需要重新部署。

非目标：
- 不改变其他 `newapi` 渠道的默认行为。
- 不重构现有 URL/base64 协议回退逻辑。
- 不处理兔子渠道（已通过 sha-20cc8df 修复栈溢出，另行观察）。

## 3. 方案

### 3.1 配置：模型级 `imageResponseFormat`

在渠道 `advancedConfig.modelConfigs[model]` 上新增可选字段：

```ts
imageResponseFormat?: "url" | "b64_json";
```

只给 ModelBay 下面这 8 个绑定加 `"imageResponseFormat": "url"`：

- `gpt-image-2-5-sunburst`、`-2026-09-08`、`-text-to-image`、`-image-to-image`
- `gpt-image-2-5-flare`、`-2026-09-08`、`-text-to-image`、`-image-to-image`

不加字段的模型行为不变。选模型级而不是渠道级，是因为 ModelBay 同一渠道下还有 `flux-2`、`grok-imagine`、`Z-image`、`topaz` 等模型，它们没有实测过 URL 返回。

### 3.2 代码改动

1. 类型：在 `SystemChannelAdvancedConfig` 的模型配置类型里加 `imageResponseFormat`，并在保存/读取渠道配置的规范化函数里保留这个字段（需要确认 [channel-protocol-registry.ts](../../web/src/lib/channel-protocol-registry.ts) 的 `resolveChannelModelConfig` 和后台保存逻辑不会把未知字段丢掉）。

2. `preferredImageResponseFormat`（[image-task-support.ts:120](../../web/src/app/api/image-tasks/image-task-support.ts#L120)）：先读模型级配置，没有再走原逻辑。

   ```ts
   const explicit = resolveChannelModelConfig(config.advancedConfig, config.model)?.imageResponseFormat;
   if (explicit === "url" || explicit === "b64_json") return explicit;
   return config.advancedConfig?.protocol === "newapi" ? "b64_json" : "url";
   ```

3. 显式发送 `response_format`。这一步不能漏：现在三处请求体的条件是 `allowProtocolFallback || responseFormat !== "url"`，而 `newapi` 协议下 `allowProtocolFallback` 为 false。所以只改第 2 步的话，请求体里根本不会带 `response_format`，ModelBay 会按自己的默认值返回，结果大概率还是 base64。需要改的位置：
   - 文生图 JSON 请求体：[image-task-openai.ts:171](../../web/src/app/api/image-tasks/image-task-openai.ts#L171)
   - multipart 编辑：[image-task-openai.ts:151](../../web/src/app/api/image-tasks/image-task-openai.ts#L151) 传给 `buildImageEditFormData` 的 `includeCompatibilityFields`
   - JSON 编辑：[image-task-openai.ts:421](../../web/src/app/api/image-tasks/image-task-openai.ts#L421)

   改法：增加一个 `explicitResponseFormat` 布尔值（模型配置了 `imageResponseFormat` 时为 true），条件改为 `allowProtocolFallback || explicitResponseFormat || responseFormat !== "url"`。`output_format` 是否跟着一起发，需要实测确认 ModelBay URL 模式下接受 `output_format: "png"`。

4. 不启用协议回退。ModelBay 是 `newapi`，`allowProtocolFallback` 仍为 false，URL 失败时不会自动改用 base64 重新提交。这是有意的：重新提交会让上游再出一张图、再扣一次费，而且同一任务会出现两次上游请求。

### 3.3 结果下载与转存

拿到 `data[0].url` 后，走现有链路，不新增下载代码：

`parseImagePayloadOrPoll` → `prepareImageTaskResults`（[image-task-result-service.ts:12](../../web/src/lib/server/image-task-result-service.ts#L12)）→ `inlineRemoteImageResult`（[image-task-support.ts:664](../../web/src/app/api/image-tasks/image-task-support.ts#L664)）→ 转存 OSS。

现有下载的约束：
- 走 `fetchSafeOutbound`，有出站安全校验，ModelBay 的 CDN 域名必须能通过这层校验。
- 超时 `INLINE_IMAGE_TIMEOUT_MS = 30s`，大小上限 `MAX_INLINE_IMAGE_BYTES = 20MB`。按实测 6.4MB / 2.35 秒，余量足够。
- 会校验 MIME 类型，不是图片会拒收。

已确认：即使 `inlineRemoteImageResult` 下载失败、把远程 URL 原样放回，后续 `normalizeAssets`（[generation-log-repository.ts:69](../../web/src/lib/server/generation-log-repository.ts#L69)）会再走 `writeRemoteAsset` 下载转存，失败直接抛"生成媒体保存到服务器失败"，任务失败退款，不会把 ModelBay 临时 URL 存成结果。

实现补充：严格协议（`newapi`）在重新应用预设时会覆盖模型配置，已在 `applyModelProtocol` 中保留 `imageResponseFormat`，否则后台一保存渠道字段就会丢失。

## 4. 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| ModelBay URL 有效期短，或我们下载前就过期 | 转存失败 | 拿到 URL 后马上下载（现有流程本来就是同步下载）；上线前实测 URL 的有效期 |
| 生产服务器访问不了 ModelBay 的 CDN | 转存失败 | 上线前在生产容器里 `curl` 一次 URL 返回的域名 |
| `fetchSafeOutbound` 拦截 CDN 域名或它的跳转 | 转存失败 | 同上，在生产容器里用实际代码路径验证 |
| 编辑接口（`/images/edits` multipart）不认 `response_format` | 编辑仍返回 base64 或直接报错 | 文生图和编辑分开实测；编辑不支持就只给 `-text-to-image` 和基础模型名开 |
| 下载失败但上游已经扣费 | 用户看到失败，我们承担成本 | 和现在 base64 超时的处理一致：标记失败并退用户积分。URL 模式只是把失败点从"接收响应"挪到"下载图片" |

## 5. 测试

单元测试（参考 [image-task-openai-live.test.ts](../../web/src/app/api/image-tasks/image-task-openai-live.test.ts) 现有写法）：
- `newapi` 渠道，模型配置 `imageResponseFormat: "url"`：文生图请求体包含 `response_format: "url"`。
- 同上，multipart 编辑：form-data 里有 `response_format=url`。
- 同上，JSON 编辑：请求体包含 `response_format: "url"`。
- `newapi` 渠道，没有配置该字段：仍然发送 `b64_json`（防止影响兔子等渠道）。
- 上游返回 URL，mock 服务器提供图片：任务成功，结果是 OSS 永久地址，不是上游 URL。
- 上游返回 URL，但下载返回 404 或超时：任务失败并退款，不保存上游 URL。

上线前人工验证（生产容器内）：
- 用 ModelBay key 直接调一次 sunburst 文生图 URL 模式，记录返回的域名和 URL 有效期。
- 在 `vozeb-pro-generation-worker` 容器里下载这个 URL。
- 编辑接口单独调一次。

## 6. 上线与回滚

1. 合并代码。不改配置时行为和现在完全一样，可以先发布。
2. 后台只给 `gpt-image-2-5-sunburst` 一个绑定加 `imageResponseFormat: "url"`，在生产跑几张，看任务耗时、成功率、结果地址是否都是 OSS。
3. 没问题再给其余 7 个绑定加上。
4. 观察指标：ModelBay sunburst/flare 的成功率、平均和最长耗时、`diagnostic_events` 里的 `responseBytes`（应该降到 KB 级）、下载失败次数。

回滚：删除模型配置里的 `imageResponseFormat` 字段，立即回到 `b64_json`，不需要重新部署。

## 7. 改动量估计

- 代码：2 个文件，约 20 行（`image-task-support.ts`、`image-task-openai.ts`），加上类型定义和渠道配置规范化里保留字段。
- 测试：约 6 个用例。
- 配置：ModelBay 渠道 8 个模型配置各加一个字段。
