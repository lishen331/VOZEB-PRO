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

### 覆盖现状（2026-09-17 收尾）
**storyboards 域 13/21 已迁移 + 1 结构覆盖，剩 7 条全是 P2**（3 条 stream 版本的非流式等价物已迁移；props 独立端点、batch-infer-params、upscale、episode generate 端点）。

其余域仍未开始：dramas 6/19 → characters 0/19 → scenes 0/11 → props 0/9 → images 0/9 → episodes 0/7 → videos 0/7 → audio 0/2。**下一步优先 characters（19 条，体量最大）。**

已建的一键成片自有路由（生成类均带 `featureModule: "one-click-film"`，不再经由创作工坊）：
`POST/PUT/DELETE shots`、`insert-before`、`frame-prompts[/:frameType]`、`generate-image`、`generate-video`、`generate-frame`、`extract-tail-frame`、`accept-first-frame-candidate`、`polish-prompt`、`rebuild-video-prompt`、`regenerate-layout-description`、`split-by-audio`、`universal-prompt`、`export`、`tasks*`、`episode-canvas`

### 从 L 逐字抄录的提示词契约（勿改写）
`universal-prompt-l-system.json`、`image-polish-l-system.json`、`layout-regenerate-l-system.json`、`angle-l-contract.json`（后者经全部 96 种视角组合与 L 输出逐一校验一致）。

### UI 现状
分镜卡片列表 + 编辑弹窗已可用：新增/前插/删除、三模式切换（经典/首尾帧/全能）、单镜生成图/视频、提取尾帧、应用候选首帧、AI 生成帧提示词、AI 润色图片提示词、重建视频提示词、AI 重算空间布局、按音频拆镜（预览+追加应用）。
**仍缺**：角色/场景/道具资产编辑与四视图、素材库、配音设置面板。

### 已知缺陷
- **协作闸门耦合（P0，未处置）**：`POST /api/one-click-film/projects` 会调 `ensureDramaLabProjectGroup`，把每个一键成片项目写进创作工坊协作组表。所以 `assertDramaLabStageAllowed` 一定查得到组、不会早退，教学版的审批配置会真实拦住商单链路。我先前"未建组时是空操作"的判断是错的。移除该调用前须确认现有项目读取路径是否已依赖该组存在。
- `export` / `split-by-audio` / 新增的 shot CRUD / frame-prompts / generate-image / generate-video 后端已建但**无前端入口**，属死代码，UI 侧仍是最大缺口。
- `sync-generation` 已自建基础版（`sync-runner.ts`）：图片 URL 取 serverUrl→remoteUrl→dataUrl（`ImageTask.result` **没有 `url` 字段**，我一开始写错过）、历史按 taskId+结果幂等、任务丢失则解绑避免锁死。**仍未覆盖**创作工坊那份 439 行里的：写冲突重试、任务上下文错配检测、首尾帧候选与 needs_review 完整分支 —— 保持"未迁移"。

## 血的教训：改链路必须同时改回写

我把 executor 的 images/videos 从创作工坊工作流切到一键成片自有路由后，**引入了"永久 pending"回归**：
调 `sync-generation` 的原本只有创作工坊工作流服务、创作工坊 UI、视频恢复服务（且只经创作工坊路由可达），
通用恢复服务只推进上游任务本身、**不回写分镜**。所以切链路等于把唯一的回写触发点一起摘掉了，
上游成功也没人把 URL 写回分镜。已由 `media-runner` 主动调 `syncOneClickShotGeneration` 补上。

**规律**：在这个仓库里，"提交任务"和"回写结果"是两条独立链路。动其中一条，必须检查另一条还通不通。

## 我犯过的错（勿重复）

| 错误 | 纠正 |
|---|---|
| 复用创作工坊工作流服务，当作对齐 L | 创作工坊不是基线，违反 §9.3 |
| 拿"41 项测试全绿"当迁移达标 | 测试只覆盖服务层/路由层，未覆盖 UI 暴露面与 L 行为等价性 |
| 声称关闭创作工坊会致 403 | 空实现，夸大 |
| 跳过 Task 1 差异矩阵直接写实现 | 基线缺失是一切返工的根因 |
| 建好路由但没有调用方 | 第三轮发现 generate-image/video 是死代码，计费修复其实没生效。已加 `dead-route-guard.test.ts` 守卫，新增死路由会判红 |
| 切换任务提交链路却忘了回写链路 | 导致 images/videos 永久 pending，见上节 |

## L 源码导航

- 路由挂载表：`backend-node/src/routes/index.js`（161 个 `r.get/post/...`）
- 路由写法是 **handler 对象工厂**（`function routes(db, log, cfg) { return { create: (req,res)=>... } }`），不是 Express 装饰器 —— grep `router.post` 会零命中。
- 故事板核心：`services/episodeStoryboardService.js`(75kb)、`framePromptService.js`(33kb)、`promptI18n.js`(133kb)、`universalSegmentPromptBundle.js`(22kb)
- 图片/视频上游：`imageService.js`(86kb)、`videoClient.js`(160kb)、`videoService.js`(24kb)
