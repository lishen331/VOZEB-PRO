# 记忆：一键成片（one-click-film）

> 每次接手本任务前**必须先读本文**。上下文丢失曾导致把创作工坊当基线，返工一整天。

## 硬边界（不可协商）

1. **基线是 LocalMiniDrama（L）**，路径 `D:\Claude code programe\VOZEB-PRO\LocalMiniDrama`（backend-node/src）。
2. **创作工坊（drama-lab）与本任务无关**：不改它的代码，**也不把它当参考基准**。它是教学版；一键成片是商单生产版，两者同级独立。规范 §9.3 明确禁止"把教学版现有功能当作商单版已迁移"。
3. **V 只替换承载层**：React/Next UI、V 画布、登录权限、模型渠道、任务基础设施、OSS、计费、数据访问适配器。不得删字段、简化状态机、改写请求语义、用假任务替代。
4. **画布**用 V 平台现有画布，不复制 L 的画布，不建第二套。
5. 插件开关**只控前端显示**（`requireFeatureModuleEnabled` 是空实现），不撤业务权限。
6. 未完成差异矩阵 / 请求载荷对比 / 回写对比 / 状态对比 / 同输入回归，**不得宣称完成**。

## 关键文档

- 需求规范：`docs/superpowers/specs/2026-09-15-one-click-video-production-requirements.zh-CN.md`
- 实施计划：`docs/superpowers/plans/2026-09-15-one-click-video-production.md`（40 个 checkbox）
- **差异矩阵（基线）**：`docs/superpowers/specs/2026-09-15-one-click-video-production-l-v-matrix.zh-CN.md`
- 守卫测试：`web/src/lib/one-click/migration-matrix.test.ts`

## 当前状态（2026-09-17）

L 后端 161 个接口 → V 平台承载 34、素材库适配 15、**必须迁移的业务逻辑 112，已覆盖 10（约 9%）**。

**不具备可测条件。** UI 侧尤其空：工作台 329 行，只调 6 个接口，仅有"重新加载/重试/生产流程/项目数据"。分镜卡、三模式切换、提示词弹窗、资产编辑弹窗、素材库、配音设置全部没有前端。

### 已完成（结论成立，保留）
一级入口与导航、独立配置页、项目隔离（`sourceHandoffId` 前缀 `one-click-film:`）、父任务编排+调度入队+worker识别+取消/重试/恢复、配音真实 TTS 子任务、按音频拆镜接口、导出接口、画布往返按 `source` 分流、全能提示词字段合同。

### P0 待迁移（按序）
storyboards 2/21 → dramas 6/19 → characters 0/19 → scenes 0/11 → props 0/9 → images 0/9 → episodes 0/7 → videos 0/7 → audio 0/2

### 已知缺陷
- 计费归属：经创作工坊工作流发起的生成写死 `featureModule: "drama-lab"`，商单用量记到教学版账上（P0）。
- `export` / `split-by-audio` 后端已建但**无任何前端入口**，属死代码。

## 我犯过的错（勿重复）

| 错误 | 纠正 |
|---|---|
| 复用创作工坊工作流服务，当作对齐 L | 创作工坊不是基线，违反 §9.3 |
| 拿"41 项测试全绿"当迁移达标 | 测试只覆盖服务层/路由层，未覆盖 UI 暴露面与 L 行为等价性 |
| 声称关闭创作工坊会致 403 | 空实现，夸大 |
| 跳过 Task 1 差异矩阵直接写实现 | 基线缺失是一切返工的根因 |

## L 源码导航

- 路由挂载表：`backend-node/src/routes/index.js`（161 个 `r.get/post/...`）
- 路由写法是 **handler 对象工厂**（`function routes(db, log, cfg) { return { create: (req,res)=>... } }`），不是 Express 装饰器 —— grep `router.post` 会零命中。
- 故事板核心：`services/episodeStoryboardService.js`(75kb)、`framePromptService.js`(33kb)、`promptI18n.js`(133kb)、`universalSegmentPromptBundle.js`(22kb)
- 图片/视频上游：`imageService.js`(86kb)、`videoClient.js`(160kb)、`videoService.js`(24kb)
