# mass 视频：按模式分流首尾帧与多图参考

日期：2026-11-11
状态：待批准后实现
范围：`web/src/app/api/video-generation-tasks/video-generation-route.ts` 的请求组装，加一个按模型配置生效的开关。不改表结构，不动生产配置（配置由发布后的后台/脚本单独改）。

## 一、问题

mass 的视频接口规定：关键帧模式（`image_url` / `image_base64` / `end_image_url`）与多图参考模式（`image_urls` / `image_references`）**互斥，同时传返回 400**。

现在生产的处置是：mass 的 `SD-2.0-O` / `SD-2.5-O` 模板里只保留 `image_urls`，删掉了 `image_url` / `end_image_url`。后果是：

- **全能参考**：正常，实测已出片（任务 `f87cd09a`，上游 `c3YYpwkwYuLA8w`，参考图生效）。
- **首帧**：首帧图被 `regularVideoReferences` 排除在多图之外，模板又不发 `image_url`，等于这张图完全没发出去，退化成文生视频。
- **首尾帧**：同上，两张图都没发出去。

## 二、目标

同一套模板，按本次请求实际带的参考素材决定发哪一组：

| 请求内容 | 发送字段 |
|---|---|
| 只有普通参考图（全能参考模式） | `image_urls` + `video_urls` + `audio_urls` |
| 有首帧（首帧 / 首尾帧模式） | `image_url`（有尾帧时加 `end_image_url`）+ `video_urls` + `audio_urls`，**不带 `image_urls`** |

约束：
- **只对声明了这个开关的模型生效**。生产当前只有 mass 的 `SD-2.0-O` / `SD-2.5-O` 会声明；其他渠道（昱梦、Seedance 特殊协议、兔子、模汇等）行为完全不变。
- 不改动 `pruneEmptyReferenceFields` 的通用逻辑，避免影响其他渠道。

## 三、改法

### 1. 配置项

`SystemChannelModelConfig` 增加可选字段：

```
referenceModeExclusive?: boolean
```

含义：该上游禁止“关键帧”与“多图参考”同时出现。默认未设置＝旧行为。

在 `store-normalizers-channel.ts` 的模型配置归一化里透传该布尔值（未设置则不写入，保持旧配置逐字节不变）。

### 2. 请求组装

`video-generation-route.ts` 的 `createUpstream` 里，在得到 `values` / `defaults` 之后、调用 `buildVideoProviderRequest` 之前：

- 读 `channel.advancedConfig?.modelConfigs?.[模型的规范化 key]?.referenceModeExclusive`。
- 为 true 且 `firstFrameUrl` 非空时：
  - 从 `values` 与 `defaults` 中删除多图相关键：`images`、`image_urls`、`reference_images`（以及 `content` 里由多图拼出的内容，若实现了就一并处理）。
  - 保留 `image_url`、`end_image_url`（模板已含这两个占位符）。
- 为 true 且没有首帧时：删除 `image_url`、`end_image_url`（置空，由现有的空引用字段剔除逻辑移除）。

实现方式建议放在 `provider-task-config.ts` 新增一个纯函数：

```
export function applyExclusiveReferenceMode(values, defaults, options: { exclusive: boolean; hasFirstFrame: boolean })
```

便于单测，路由只负责调用。

### 3. 模板

mass 这两个模型的 `requestTemplate` 恢复成同时包含两组字段：

```
{"model":"{{model}}","prompt":"{{prompt}}","resolution":"{{resolution}}","aspect_ratio":"{{aspect_ratio}}","duration":"{{duration}}","audio":"{{generate_audio}}","image_urls":"{{image_urls}}","video_urls":"{{video_urls}}","audio_urls":"{{audio_urls}}","image_url":"{{first_frame}}","end_image_url":"{{last_frame}}"}
```

并在 `modelConfigs` 里加 `"referenceModeExclusive": true`。这一步是配置改动，发布后单独执行，不在本次代码改动里。

## 四、测试

`provider-task-config.test.ts`（或新建）覆盖纯函数：

1. exclusive=false：值不变（回归保护）。
2. exclusive=true + 无首帧：`image_url` / `end_image_url` 被移除，`image_urls` 保留。
3. exclusive=true + 有首帧：`image_urls` / `reference_images` 被移除，`image_url` 保留。
4. exclusive=true + 首尾帧：`image_url` 与 `end_image_url` 都在，`image_urls` 不在。

`video-generation-route` 侧加一条断言：未声明该开关的渠道，构造出的请求体与改动前一致（用现有的 live/handler 测试样式）。

## 五、不改的

- 其他渠道的模板与行为。
- 现有 `{{images}}` 语义（仍表示普通参考图数组）。
- 空引用字段剔除逻辑。
- 生产配置本次不动；代码发布后再改 mass 的模板与开关。

## 六、发布与回退

代码改动走 PR + 测试环境验证 + 发版。回退只需把 mass 配置里的 `referenceModeExclusive` 去掉、模板退回只含 `image_urls`，代码开关未声明的模型行为不变，因此回退不需要重新发版。
