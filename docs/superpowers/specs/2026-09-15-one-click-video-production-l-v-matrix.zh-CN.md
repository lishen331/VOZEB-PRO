# 一键成片 L/V 行为基线与差异矩阵

日期：2026-09-17
基线：`D:\Claude code programe\VOZEB-PRO\LocalMiniDrama`（backend-node）
对象：`one-click-film`（商单生产版）

> 本文是计划 Task 1 的交付物。此前实现工作在缺少本矩阵的情况下推进，导致把"创作工坊已有功能"误当作迁移基线 —— 这违反规范 §9.3。本文用于纠正该错误并重建基线。

## 1. 口径说明

- **基线是 L**，不是创作工坊。创作工坊是教学版，与本次迁移无关，其代码不改、也不作为参考基准。
- 接口数量只用于**暴露缺口规模**，不作为验收标准。验收仍以规范 §9.2 的"同输入下可观察行为等价"为准。
- L 的部分域由 V 平台设施承载（规范"平台能力"一节），不需要在 one-click-film 下重建。

## 2. 总量与覆盖

L 后端共 **161** 个接口，按归属拆分：

| 分类 | 数量 | 处理方式 |
|---|---|---|
| V 平台承载，不迁移 | 34 | 复用 V 的模型渠道、设置、上传、资产、生成路由 |
| 素材库，需适配 | 15 | 映射到 V 素材库体系（P1） |
| **必须迁移的业务逻辑** | **108** | **已覆盖 92，即 85.2%**（§13–§18 逐条核算） |

**结论（2026-09-17 更新）：主链路已覆盖 92/108（85.2%），分镜与资产链路具备真机验证条件；仍有 12 条 P2 缺口与 4 条刻意不复制项，不等于 1:1 完成。**

> 首轮结论曾是「完成度约 9%，不具备可测条件」。那对应当时状态，现已按 §13–§18 逐条核算更新。
> 保留这段历史，避免把早期结论当成当前事实。

## 3. 必须迁移的业务域

> 下表是 **2026-09-17 重新核算**的结果。「覆盖」含三类：自有路由、V 项目聚合承载、素材库映射。
> 逐条映射见 §13（storyboards）、§14（资产三域）、§15（episodes）、§16（媒体域）、§18（素材库）。

| 域 | 覆盖/总数 | 缺口 | 说明 |
|---|---|---|---|
| storyboards | 14/21 | 7（P2） | 3 条 stream 版本（非流式已迁移）、props 独立端点、batch-infer-params、upscale、episode generate 端点 |
| characters | 15/19 | 0 | 另 4 条 SD2 声音认证属 L 特有第三方，刻意不复制 |
| scenes | 11/11 | 0 | — |
| props | 9/9 | 0 | — |
| episodes | 7/7 | 0 | 含 finalize 与 download |
| images | 6/9 | 3（P2） | `DELETE /images/:id`、分集背景列表与提取（L 特有） |
| videos | 6/7 | 1（P2） | `DELETE /videos/:id` |
| video-merges | 3/4 | 1（P2） | `DELETE /video-merges/:id` |
| audio | 2/2 | 0 | — |
| dramas | 19/19 | 0 | 多数由 `PUT /projects/:id` 聚合承载 |

**合计：覆盖 92/108，刻意不复制 4，仍为缺口 12（全部 P2）。**

## 4. P0 逐项清单

### 故事板（L 21 个接口）

| L 接口 | 优先级 | 一键成片状态 |
|---|---|---|
| `GET    /storyboards/episode/:episode_id/generate` | P0 | 未迁移 |
| `POST   /storyboards` | P0 | 未迁移 |
| `POST   /storyboards/:id/insert-before` | P0 | 未迁移 |
| `GET    /storyboards/:id` | P0 | 未迁移 |
| `PUT    /storyboards/:id` | P0 | 未迁移 |
| `DELETE /storyboards/:id` | P0 | 未迁移 |
| `POST   /storyboards/:id/props` | P0 | 未迁移 |
| `POST   /storyboards/:id/frame-prompt` | P0 | 未迁移 |
| `GET    /storyboards/:id/frame-prompts` | P0 | 未迁移 |
| `PUT    /storyboards/:id/frame-prompts/:frame_type` | P0 | 未迁移 |
| `POST   /storyboards/:id/link-tail-frame` | P0 | 未迁移 |
| `POST   /storyboards/:id/polish-prompt` | P0 | 未迁移 |
| `POST   /storyboards/:id/universal-segment-polish-stream` | P0 | 未迁移 |
| `POST   /storyboards/:id/classic-video-prompt-polish-stream` | P0 | 未迁移 |
| `POST   /storyboards/:id/universal-segment-prompt-stream` | P0 | 未迁移 |
| `POST   /storyboards/:id/universal-segment-prompt` | P0 | 未迁移 |
| `POST   /storyboards/batch-infer-params` | P0 | 未迁移 |
| `POST   /storyboards/:id/upscale` | P0 | 未迁移 |
| `POST   /storyboards/:id/regenerate-layout-description` | P0 | 未迁移 |
| `POST   /storyboards/:id/rebuild-video-prompt` | P0 | 未迁移 |
| `POST   /storyboards/:id/split-by-audio` | P0 | 未迁移 |

### 分集（L 7 个接口）

| L 接口 | 优先级 | 一键成片状态 |
|---|---|---|
| `POST   /episodes/:episode_id/storyboards` | P0 | 未迁移 |
| `POST   /episodes/:episode_id/props/extract` | P0 | 未迁移 |
| `POST   /episodes/:episode_id/characters/extract` | P0 | 未迁移 |
| `GET    /episodes/:episode_id/storyboards/status` | P0 | 未迁移 |
| `GET    /episodes/:episode_id/storyboards` | P0 | 未迁移 |
| `POST   /episodes/:episode_id/finalize` | P0 | 未迁移 |
| `GET    /episodes/:episode_id/download` | P0 | 未迁移 |

### 视频（L 7 个接口）

| L 接口 | 优先级 | 一键成片状态 |
|---|---|---|
| `GET    /videos` | P0 | 未迁移 |
| `POST   /videos` | P0 | 未迁移 |
| `POST   /videos/image/:image_gen_id` | P0 | 未迁移 |
| `POST   /videos/episode/:episode_id/batch` | P0 | 未迁移 |
| `POST   /videos/:id/resume-poll` | P0 | 未迁移 |
| `GET    /videos/:id` | P0 | 未迁移 |
| `DELETE /videos/:id` | P0 | 未迁移 |

### 图片（L 9 个接口）

| L 接口 | 优先级 | 一键成片状态 |
|---|---|---|
| `GET    /images` | P0 | 未迁移 |
| `POST   /images` | P0 | 未迁移 |
| `GET    /images/episode/:episode_id/backgrounds` | P0 | 未迁移 |
| `POST   /images/episode/:episode_id/backgrounds/extract` | P0 | 未迁移 |
| `POST   /images/episode/:episode_id/batch` | P0 | 未迁移 |
| `POST   /images/scene/:scene_id` | P0 | 未迁移 |
| `POST   /images/upload` | P0 | 未迁移 |
| `GET    /images/:id` | P0 | 未迁移 |
| `DELETE /images/:id` | P0 | 未迁移 |

### 音频（L 2 个接口）

| L 接口 | 优先级 | 一键成片状态 |
|---|---|---|
| `POST   /audio/extract` | P0 | 未迁移 |
| `POST   /audio/extract/batch` | P0 | 未迁移 |


## 5. 已完成部分（保留）

这些是此前工作中**结论仍成立**的部分：

- 一级插件入口、导航位置、独立配置页（仅控前端显示）
- 一键成片项目隔离（`sourceHandoffId` 前缀 `one-click-film:`）
- 父任务编排骨架 + 调度入队 + worker 识别 + 取消/重试/恢复
- 配音步骤真实创建 TTS 子任务
- 按音频拆镜服务端接口
- 交付导出服务端接口
- 画布往返按 `source` 分流，携带 episode/shot 定位
- 全能提示词字段合同（抄自 L `promptI18n.js`）

## 6. 此前的判断错误（纠正）

| 此前说法 | 纠正 |
|---|---|
| 关闭创作工坊会导致一键成片 403 | 错。`requireFeatureModuleEnabled` 是空实现，开关按设计只控前端显示 |
| 创作工坊审批闸门会套到商单链路 | **成立，且比先前判断更严重**。见 §10 |
| 复用创作工坊工作流服务即等于对齐 L | 错。创作工坊不是基线，违反规范 §9.3 |
| 41 项测试通过即迁移达标 | 错。测试只覆盖服务层与路由层，未覆盖 UI 暴露面与 L 行为等价性 |

## 7. 计费归属缺陷

一键成片经由创作工坊工作流服务发起的生成，其上游请求 context 写死 `featureModule: "drama-lab"`，商单用量记到教学版账上。属 P0，随故事板域迁移一并修正。

## 8. 下一步

按 P0 顺序推进，每项须同时给出：V 实现位置、服务端接口、持久化字段、请求载荷对比、自动化测试。无证据项一律保持"未迁移"。

## 9. 分镜字段映射（storyboards 域证据）

L `storyboards` 表共 **31** 列（基表 24 + migration 追加 7）。逐列比对 V 的 `DramaShot` 合同：

| L 列 | V 字段 | 状态 |
|---|---|---|
| `id` | `id` | 已对齐 |
| `episode_id` | (分集容器 episodes[].shots) | 结构差异 |
| `scene_id` | `sceneId` | 已对齐 |
| `storyboard_number` | `order` | 已对齐 |
| `title` | `title` | 已对齐 |
| `description` | `description` | 已对齐 |
| `location` | `location` | 已对齐 |
| `time` | `time` | 已对齐 |
| `duration` | `duration` | 已对齐 |
| `dialogue` | `dialogue` | 已对齐 |
| `action` | `action` | 已对齐 |
| `atmosphere` | `atmosphere` | 已对齐 |
| `image_prompt` | `imagePrompt` | 已对齐 |
| `video_prompt` | `videoPrompt` | 已对齐 |
| `characters` | `characterIds` | 已对齐 |
| `shot_type` | `shotType` | 已对齐 |
| `angle` | `cameraAngle` | 已对齐 |
| `movement` | `cameraMotion` | 已对齐 |
| `video_url` | `videoUrl` | 已对齐 |
| `status` | `storyboardStatus/generationStatus` | 已对齐 |
| `created_at` | (V 项目级 createdAt) | 结构差异 |
| `updated_at` | (V 项目级 updatedAt) | 结构差异 |
| `deleted_at` | (V 无软删，改为移除元素) | 结构差异 |
| `segment_index` | `segmentIndex` | 已对齐 |
| `segment_title` | `segmentTitle` | 已对齐 |
| `angle_h` | `angleH` | 已对齐 |
| `angle_v` | `angleV` | 已对齐 |
| `angle_s` | `angleS` | 已对齐 |
| `narration` | `narration` | 已对齐 |
| `creation_mode` | `creationMode` | 已对齐 |
| `universal_segment_text` | `universalSegmentText` | 已对齐 |

**结论：字段层 27/31 已对齐，4 项属结构差异（V 用嵌套或项目级承载），无映射缺口 0 项。**

这条结论很重要，它把 P0 缺口的性质说清楚了：

- **数据合同不是缺口**。V 的 `DramaShot` 已完整覆盖 L 的分镜字段，且额外带了 28 个承载层字段（帧状态 `frames`、任务状态 `generationStatus`、音频 `dialogueAudio`/`narrationAudio`、首尾帧连续性 `continuity` 等）。
- **真正的缺口在接口面与 UI 面**。字段有了但没有接口去读写它们，也没有前端去暴露它们，所以表现为"只有壳子"。

### 结构差异说明

| L 列 | V 承载方式 |
|---|---|
| `episode_id` | V 用 `project.episodes[].shots[]` 嵌套，不用外键 |
| `created_at` / `updated_at` | V 在项目聚合级维护时间戳 |
| `deleted_at` | V 无软删，直接移除数组元素；历史留在 `storyboardHistory` |

### V 独有的承载层字段（28 个）

`sourceText`, `shotBoundary`, `utterances`, `lightingStyle`, `depthOfField`, `polishedPrompt`, `result`, `emotion`, `emotionIntensity`, `layoutDescription`, `frames`, `firstFrameCandidate`, `videoFrameSnapshot`, `startFramePrompt`, `endFramePrompt`, `negativePrompt`, `continuity`, `propIds`, `clueIds`, `videoMode`, `storyboardStatus`, `storyboardFrameMode`, `storyboardImageUrl`, `storyboardHistory`, `generationStatus`, `generationTaskId`, `dialogueAudio`, `narrationAudio`

这些不是 L 缺失，而是 L 用别的表（`frame_prompts`、`async_tasks`、`video_generations`）承载的内容，在 V 里内联到分镜对象上。迁移时必须保证语义等价，不能因为字段位置不同而丢状态。

## 10. 协作闸门耦合（修正结论）

先前我判断"一键成片项目没建协作组时闸门为空操作"，这个判断是**错的**。实际链路：

```
POST /api/one-click-film/projects        （创建一键成片项目）
  └→ await ensureDramaLabProjectGroup(project.id, user.id)
       └→ INSERT INTO drama_lab_project_groups
       └→ INSERT INTO drama_lab_project_members (role='owner', status='active')
```

也就是说**每个一键成片项目在创建时就被写入了创作工坊的协作组表**。因此：

1. `assertDramaLabStageAllowed` 里的 `getDramaLabProjectGroup(projectId)` **一定查得到组**，不会走 return 早退分支。
2. 接着 `requireActiveMember` 会执行；创建者本人是 `owner/active`，能通过；但**非成员访问会 403**。
3. 若该组存在 `enabled && strictMode` 的阶段配置，`assertStrictPredecessorsApproved` 会要求前序阶段审批通过后才允许继续。

即：**教学版的协作与审批配置会实际拦住商单生产链路**。这违反规范 §9.2「一键成片不是教学流程的简化版」与 §9.1「不得让两者互相影响」。

### 本次已做的处置

新建的一键成片自有路由（`generate-image`、`generate-video`）**不调用** `assertDramaLabStageAllowed`，只做项目归属校验（`sourceHandoffId` 前缀）。这符合规范：商单链路的审核应走 V 平台自身的审核能力（P1），而不是复用教学版的阶段闸门。

### 仍待处置（P0）

`POST /api/one-click-film/projects` 里的 `ensureDramaLabProjectGroup` 调用应当移除或替换为一键成片自有的成员模型。移除前需确认：现有一键成片项目的读取路径是否已依赖该组存在（否则会把已建项目锁在外面）。此项未做，保持"未迁移"。

## 11. assets / storyboard 两步的耦合核查（结论）

executor 的 `assets` 与 `storyboard` 两步仍走 `startDramaLabWorkflow`。逐项核查其耦合面：

| 检查项 | 结果 |
|---|---|
| 是否打 `/api/drama-lab/...` HTTP 路由 | **否**（该区段无 `internalJson` 调用） |
| 底层提取服务是否写 `featureModule` | **否**（`drama-lab-asset-extraction-service` / `drama-lab-storyboard-extraction-service` 均无模块身份） |
| 文本上游是否带模块计费归属 | **否**（`systemAiBillingHeaders` 不含 featureModule；日志仅 `source: "drama"`） |
| 是否调阶段闸门 | **是**，3 处：`assets` / `storyboard` / `storyboard_image` |

**结论：这两步没有计费归属问题，也不经由创作工坊的 HTTP 路由，唯一残留是阶段闸门。**

而闸门的实际影响已被 §10 的修复大幅收窄：

- **新建的一键成片项目**：不再写入协作组 → `getDramaLabProjectGroup` 返回 null → 闸门 `return` 早退，成为空操作。
- **修复前已建的旧项目**：仍有协作组，闸门仍然生效。创建者是 `owner/active` 能通过；但若该组配置了 `enabled && strictMode` 阶段，仍会被拦。

因此 `images` / `videos` 是必须切走的（计费写死 drama-lab），而 `assets` / `storyboard` 属于**可延后**项：
它们复用的是与 L 行为等价的纯提取逻辑，切换收益低、回归风险高（`storyboard` 步含截断续写与
checkpoint 恢复语义）。保持现状并标注为 P1，不在此处假装已迁移。

## 12. 本轮新增的守卫测试

| 测试 | 防的是什么 |
|---|---|
| `migration-matrix.test.ts` | 基线被换成创作工坊、无证据宣称完成 |
| `dead-route-guard.test.ts` | 建好路由却无调用方（我犯过两次） |
| `project-isolation.test.ts` | 商单路由调教学版协作/闸门、读项目不校验归属 |
| `media-runner.test.ts` 回写用例 | 切换提交链路却忘了回写链路（导致永久 pending） |

## 13. storyboards 域覆盖（2026-09-17 收尾重算）

L `/storyboards` 共 21 条：**已迁移 13，结构覆盖 1，未迁移 7。**

### 已迁移（均有自有路由 + 测试 + UI 调用方）

| L 接口 | 一键成片实现 |
|---|---|
| `POST /storyboards` | `POST shots` |
| `POST /storyboards/:id/insert-before` | `POST shots/:id/insert-before` |
| `PUT /storyboards/:id` | `PUT shots/:id`（L 白名单语义） |
| `DELETE /storyboards/:id` | `DELETE shots/:id` |
| `GET /storyboards/:id/frame-prompts` | `GET shots/:id/frame-prompts` |
| `PUT .../frame-prompts/:frame_type` | `PUT shots/:id/frame-prompts/:frameType`（含 layout 覆盖语义） |
| `POST /storyboards/:id/frame-prompt` | `POST shots/:id/generate-frame`（AI 规划帧提示词 + 提交帧图任务） |
| `POST /storyboards/:id/link-tail-frame` | `extract-tail-frame` + `accept-first-frame-candidate` |
| `POST /storyboards/:id/polish-prompt` | `POST shots/:id/polish-prompt`（系统提示词逐字抄录） |
| `POST /storyboards/:id/rebuild-video-prompt` | `POST shots/:id/rebuild-video-prompt`（纯本地重组，angle 契约经 96 组合校验） |
| `.../regenerate-layout-description` | `POST shots/:id/regenerate-layout-description`（系统提示词逐字抄录） |
| `POST /storyboards/:id/universal-segment-prompt` | `POST shots/:id/universal-prompt` |
| `POST /storyboards/:id/split-by-audio` | `POST shots/:id/split-by-audio` |

### 未迁移（保持"未迁移"，不假装等价）

| L 接口 | 原因 / 优先级 |
|---|---|
| `GET /storyboards/episode/:id/generate` | 分镜拆解，现由 executor storyboard 步复用等价提取服务；独立端点未建（P1） |
| `POST /storyboards/:id/props` | 道具关联独立端点；`PUT shots/:id` 已支持 propIds（P2） |
| `universal-segment-polish-stream` | 流式版本；非流式已迁移（P2） |
| `classic-video-prompt-polish-stream` | 流式版本（P2） |
| `universal-segment-prompt-stream` | 流式版本；非流式已迁移（P2） |
| `POST /storyboards/batch-infer-params` | 批量推断参数（P2） |
| `POST /storyboards/:id/upscale` | 放大（P2） |

三条 stream 端点的非流式等价物都已迁移，差别只是响应传输方式，不影响最终提示词内容。

### 从 L 逐字抄录的提示词契约

| 文件 | 来源 | 校验方式 |
|---|---|---|
| `universal-prompt-l-system.json` | `promptI18n.getUniversalOmniSegmentPrompt` + 润色后缀 + DEFAULT_LINE3 | 快照测试 |
| `image-polish-l-system.json` | `promptI18n.getImagePolishPrompt` 中文分支 | 关键铁律断言 |
| `layout-regenerate-l-system.json` | `promptI18n.getRegenerateLayoutDescriptionPrompt` 中文分支 | 关键要求断言 |
| `angle-l-contract.json` | `angleService` 三张描述表 + 中文标签 | **全部 96 种 (h,v,s) 组合与 L 输出逐一比对一致** |

## 14. 资产三域覆盖（characters / scenes / props）

L 资产接口共 **39** 条（characters 19、scenes 11、props 9）：

| 分类 | 数量 | 说明 |
|---|---|---|
| 已迁移专用路由 | **16** | 见下表 |
| 项目聚合承载 | 12 | V 的资产内联在项目里，读写随 `PUT /projects/:id`；**但一键成片 UI 目前没有新增/删除资产的入口**，见"局限"一节 |
| 素材库待适配 | **0** | 已适配，见 §18 |
| SD2 第三方能力 | 4 | L 特有的 sd2 声音认证；V 用自身音色体系，不复制第三方链路 |
| **真正未迁移** | **0** | 全部已覆盖 |

### 已迁移的资产能力（3 条 kind 参数化路由覆盖 15 个 L 端点）

| 一键成片路由 | 覆盖的 L 端点 |
|---|---|
| `POST assets/:assetId/ai` | `characters/scenes/props` 的 `generate-prompt`、`extract-from-image`，以及角色的 `extract-anchors`、`generate-stages` |
| `POST assets/:assetId/generate-image` | `generate-image`、`generate-four-view-image`（角色固定四视图，场景/道具默认单图可切四格） |
| `POST assets/:assetId/references` | `upload-image`、`PUT image`（设为主图）、移除参考图 |
| `POST assets/batch-generate-images` | `characters/batch-generate-images`（10 个上限） |
| `POST assets` / `PUT assets/:assetId` / `DELETE assets/:assetId` | `POST /scenes` / `POST /props` 及各域 `PUT` / `DELETE` |

三域共用同一批路由，靠 `kind` 区分 —— 这是 V 的资产合同本来就统一（`DramaNamedAsset`），不是我把差异抹平了。

### 局限（不假装已完成）

1. ~~一键成片 UI 没有新增/删除资产的入口~~ **已补**：新增 `POST assets` / `PUT assets/:assetId` / `DELETE assets/:assetId`，面板顶部有新增输入框，卡片上有删除按钮。删除会**同步清掉所有分镜里对该资产的绑定**（`characterIds` / `propIds` / `sceneId`），避免留下幽灵资产引用（规范 §8 禁止）。资产名称在项目内唯一，同名直接 409 拒绝，与 L 靠名称去重的语义一致。
2. ~~`batch-generate-images` 未迁移~~ **已补**：`POST assets/batch-generate-images`，沿用 L 的单次最多 10 个上限；优先补齐还没有主参考图的资产；逐个派发，单个失败不连坐其余。上游派发与单个生成共用 `dispatchOneClickAssetImage`，避免两条链路分叉后漏写 `featureModule`。
3. ~~素材库 7 条未适配~~ **已适配**：见 §18。
4. ~~资产编辑弹窗只读~~ **已补**：名称/描述/外貌/生图提示词四个字段改为受控输入 + 「保存资产」按钮，接 `PUT assets/:assetId`。服务端白名单为 `name`/`description`/`appearance`/`imagePrompt`/`polishedPrompt`/`singleImagePrompt`/`generationLayout`/`role`/`type`/`time`，**不含 references / primaryReferenceId**（那些由参考图链路独占维护，避免一次保存把参考图状态覆盖掉）。

### 计费归属

资产生图走一键成片自有路由，上游 context 显式写 `featureModule: "one-click-film"`。

补充一处发现：创作工坊资产面板用的客户端助手 `createImageGenerationTask`，其 `taskContext()` **不含 featureModule 字段**，所以照抄那条客户端链路会让商单用量记不到名下。这也是资产生图必须走服务端路由的原因。

## 15. episodes 域覆盖（分集级）

L `/episodes` 共 **7** 条：**已迁移 5，聚合承载 2，未迁移 0。**

| L 接口 | 一键成片实现 | 状态 |
|---|---|---|
| `POST /episodes/:id/storyboards` | executor `storyboard` 步 + `shots` CRUD | 已迁移 |
| `POST /episodes/:id/characters/extract` | `POST extract-assets`（`assetType: "character"`） | 已迁移 |
| `POST /episodes/:id/props/extract` | `POST extract-assets`（`assetType: "prop"`） | 已迁移 |
| `POST /episodes/:id/finalize` | `POST episodes/:episodeId/render`（含 cancel / retry 动作） | 已迁移 |
| `GET /episodes/:id/download` | `GET episodes/:episodeId/render/artifact/:artifactId` | 已迁移 |
| `GET /episodes/:id/storyboards` | 随 `GET /projects/:id` 聚合返回 | 聚合承载 |
| `GET /episodes/:id/storyboards/status` | 分镜状态内联在 `DramaShot` 上，随项目聚合返回 | 聚合承载 |

### 资产提取的一处刻意差异

创作工坊的 `extract-assets` 只返回提取结果，落库交给前端二次写入。一键成片的版本**直接落库并按名称去重** ——
商单侧没有那层前端写入逻辑，若只返回不落库，用户点了等于没反应。去重靠名称，与 L 的提取语义一致。

### 成片链路

`episodes/:episodeId/render` 与 executor 的 `compose` 步共用同一套 V 成片服务，状态服务端持久化，
前端只轮询（`pending`/`running` 时 3 秒一次），不用 setTimeout 假装进度。下载按钮仅在
`renderTask.result.artifactId` 存在时出现，避免点开一个还没产出的成片。

## 16. 媒体域覆盖（images / videos / video-merges / audio）

L 这四域共 **22** 条：**已迁移 12，聚合承载 5，缺口 5。**

| 域 | 条数 | 已迁移 | 聚合承载 | 缺口 |
|---|---|---|---|---|
| images | 9 | 4 | 2 | 3 |
| videos | 7 | 4 | 2 | 1 |
| video-merges | 4 | 2 | 1 | 1 |
| audio | 2 | 2 | 0 | 0 |

### 已迁移映射

| L 接口 | 一键成片实现 |
|---|---|
| `POST /images` | `shots/:id/generate-image`、`assets/:id/generate-image` |
| `POST /images/scene/:scene_id` | `assets/:id/generate-image`（`kind: "scenes"`） |
| `POST /images/upload` | `assets/:id/references`（`action: "upload"`） |
| `POST /images/episode/:id/batch` | executor `images` 步 → `media-runner` |
| `POST /videos` | `shots/:id/generate-video` |
| `POST /videos/episode/:id/batch` | executor `videos` 步 → `media-runner` |
| `POST /videos/:id/resume-poll` | `sync-runner` + 通用恢复服务 |
| `POST /video-merges` / `GET /video-merges/:id` | `episodes/:episodeId/render`（POST / GET） |
| `POST /audio/extract` / `extract/batch` | `audio-runner`（TTS 子任务）+ `shots/:id/split-by-audio` |

### 一处需要说明的等价判定

`POST /videos/image/:image_gen_id`（L 的"用某张已生成图去生视频"）在 V 里没有对应的独立端点：
一键成片的 `generate-video` 是从**分镜的 frames 状态**取首/尾帧参考图。两者最终请求载荷等价
（同样是把图片 URL 作为 `first_frame`/`last_frame` 参考传给上游），但**入口形态不同** ——
L 允许直接指定任意一条 image_generations 记录，V 只能用绑定在分镜上的帧。
若后续需要"从历史候选图直接生视频"，这条要单独补。

### 缺口（5 条，均为 P2）

| L 接口 | 说明 |
|---|---|
| `DELETE /images/:id` | 删除单张生成图记录。V 侧历史留在 `storyboardHistory` / `frames.history`，无删除入口 |
| `DELETE /videos/:id` | 同上，`videoHistory` 无删除入口 |
| `DELETE /video-merges/:id` | 删除成片记录，无入口 |
| `GET /images/episode/:id/backgrounds` | L 的分集背景图列表 |
| `POST /images/episode/:id/backgrounds/extract` | L 的分集背景提取，V 用场景资产体系承载，未做等价端点 |

三条 DELETE 属"清理历史"能力，不影响生产闭环；两条 backgrounds 是 L 特有的分集背景流。
均保持"未迁移"，不假装等价。

## 17. 配音链路（audio 域收尾）

### 本轮补齐

| 缺口 | 处置 |
|---|---|
| 配音结果 UI 完全不可见 | `audio-runner` 一直在把 `dialogueAudio` / `narrationAudio` 写回分镜，但 UI 没读过 —— "配音"只是步骤条上的静态文字。现在分镜卡显示对白/旁白的状态、说话人、音色、错误原因，并内嵌播放器播放服务端产物。 |
| 角色音色无法配置 | `prepareDramaLabAudio` 的 `voice`/`speed`/`instructions` 全部读自角色 `voiceProfile`，而该字段**不在资产白名单里**，等于配音只能用平台默认音色。现已放行并加规范化。 |

### voiceProfile 的规范化（不是直接放行）

`voiceProfile` 是对象字段，直接进白名单等于允许写任意结构，脏数据会被
`prepareDramaLabAudio` 原样传给上游。因此 `normalizeOneClickVoiceProfile` 做三件事：

- 音色必须在平台 `audioVoiceOptions` 内，非法值直接 400 拒绝；
- 语速限制在 0.25–4，越界回落 1 倍速；
- 指令截断到 2000 字符；
- 传 `null` 表示清除配置，回落平台默认音色。

### 一处类型契约的坑

`voiceProfile` 在契约里只挂在 `DramaCharacter` 上，`DramaScene` / `DramaProp` 没有。
一键成片按 `kind` 统一处理三类资产、内部用 `DramaNamedAsset`，所以直接读写会 TS2339。
已引入 `OneClickAsset`（服务端）与 `PanelAsset`（UI）两个别名表达"可能带音色的资产"，
写入侧仍只在 `kind === "characters"` 时落该字段。

### audio 域覆盖

L `/audio` 2 条（`extract` / `extract/batch`）已全部覆盖：executor `audio` 步逐集派发真实 TTS 子任务，
按音频拆镜走 `shots/:id/split-by-audio`（预览 + 追加应用）。

## 18. 素材库适配（资产域收尾）

L 的 7 条素材库接口全部适配完毕：

| L 接口 | 一键成片实现 |
|---|---|
| `POST /characters/:id/add-to-library` | `POST assets/:assetId/library`（`action: "save"`，`kind: "characters"`） |
| `POST /characters/:id/add-to-material-library` | 同上 |
| `POST /scenes/:id/add-to-library` | 同上（`kind: "scenes"`） |
| `POST /scenes/:id/add-to-material-library` | 同上 |
| `POST /props/:id/add-to-library` | 同上（`kind: "props"`） |
| `POST /props/:id/add-to-material-library` | 同上 |
| `PUT /{characters,scenes}/:id/image-from-library` | `POST assets/:assetId/library`（`action: "apply"`） |

### 一处结构差异（不是丢语义）

L 有"角色库 / 场景库 / 道具库"和"素材库"**两套**存储，所以每类资产各有两个存入端点。
V 只有统一素材库，靠 `metadata.dramaAssetType`（`character`/`scene`/`prop`，L 用单数）区分类别。
因此 L 的 6 个存入端点在 V 侧收敛为同一个 `action: "save"` —— 这是承载结构差异，不是把语义合并掉了。

### 关键约束

- **没有参考图不允许存入**：否则素材库会出现空封面条目。
- **视觉字段一并带入 metadata**（`appearance` / `imagePrompt` / `polishedPrompt` / `stages` 等，
  经 `readDramaLabAssetVisualDetails`），取用后可以直接生图而不必重写提示词。
- **角色音色随条目走**：`voiceProfile` 存入 metadata，场景/道具不会凭空带上。
- **取用时旧主图降级为 history**，不丢；新图置顶为 `primary`，`source: "library"`。
- **回填不覆盖用户已填值**：库条目的视觉字段只填资产上为空的字段。
- **拒绝 `blob:` 临时地址与非图片条目**，避免落库一个取不回来的 URL。
- 挑选器只列当前类别的图片素材，避免把道具图取给角色。
- 只读当前用户自己的素材（`getLibraryAsset(user.id, ...)`），不跨账号取用。
