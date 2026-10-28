# 画布：模型不支持的参考素材，提交前弹窗提示

- 日期：2026-10-25
- 状态：已确认（2026-10-26），随 v0.8.19 发布

## 背景

后台给每个模型绑定配了能力（`supportsReferenceImage/Video/Audio`、`maxReferenceImages`），但只在服务端用：提交后 `assertCapabilityConstraints` / `assertReferenceCapabilities` 抛错，前端显示成通用失败（10-23 课上 ModelBay `official/seedance-2` 带参考视频，学生看到"网络异常，请点击重试"并反复重试）。

前端拿不到这些字段：`serializeModelCatalogSettings` 的 `publicCapabilityProfile` 只下发比例、分辨率、时长、批量。

## 改动

1. 下发能力（`web/src/lib/auth/session.ts`）
   - 每个启用绑定用新增的 `resolveExplicitReferenceCapabilities`（`model-routing-config.ts`）解析，回退顺序和服务端路由一致：绑定 → 全局预设 → 渠道模型配置 → 渠道。没配置的保持 undefined（按支持处理），不会被补成 false。挑出 `supportsReferenceImage/Video/Audio`、`maxReferenceImages` 加进公开 profile。只多 3 个布尔和 1 个数字，不下发渠道配置。
2. 合并多绑定（`web/src/lib/creative-model-capabilities.ts`）
   - `supportsReferenceX`：任一绑定为 true 或未配置 → 视为支持；所有绑定都明确 false 才算不支持（服务端会换下一个绑定，前端不能比服务端更严）。
   - `maxReferenceImages`：取各绑定最大值；有绑定未配置则不限。
   - 新增纯函数 `unsupportedReferenceIssues(profile, { images, videos, audios })`，返回问题列表。
3. 提交前检查（`web/src/app/(user)/canvas/[id]/use-canvas-generation-actions.tsx`，`features/drama-canvas-runtime` 的同名文件同样改）
   - 视频：在 `resolveCanvasVideoGenerationReferences` 之后、参考图尺寸确认之前检查；图片：带参考图时检查参考图能力和张数。
   - 有问题时弹 `modal.warning`，不提交、不扣分，例如：
     - 「doubao-seedance-2-0 不支持参考视频。请断开参考视频，或换一个支持参考视频的模型。」
     - 「该模型最多支持 4 张参考图，当前连接了 6 张。」
   - 重新生成（同文件约 699 行那一路）也走同一检查。
4. 不改服务端校验，它仍是最后一道。

## 不做

- 不在参数面板里加能力说明（可后续加）。
- 不改创作页、短剧实验室、一键成片、智能体入口。
- `/ui-showcase` 不动。

## 配置（同次发布）

- 默认全部打开：没配置的参考素材能力一律按支持处理，不拦截。
- 上游实测不支持的关掉：ModelBay `official/seedance-2`（渠道 `X9te4qOV0ZaPsJpErRRWS`）10-23 起 13 次报 `does not accept reference video input`，把该绑定的 `supportsReferenceVideo` 设为 false。

## 风险

- 前端判断只和后台配置一样准。10-23 ModelBay `official/seedance-2` 配置开着参考视频、上游却拒，这类要改配置，不是这次代码能解决的。

## 验证

- 单测：多绑定合并规则；`unsupportedReferenceIssues` 各分支；`serializeModelCatalogSettings` 下发新字段且不含渠道信息（`model-catalog/route.test.ts` 已有守卫）。
- 测试环境：配一个参考视频 = false 的视频模型，画布连参考视频点生成，应弹窗且无任务入库；支持的模型照常提交。
