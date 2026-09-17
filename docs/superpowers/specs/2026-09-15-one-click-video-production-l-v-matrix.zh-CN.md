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
| **必须迁移的业务逻辑** | **112** | **已覆盖 10，即 8.9%** |

**结论：一键成片的业务迁移完成度约 9%，不具备可测条件。**

## 3. 必须迁移的业务域

| 域 | 已覆盖/总数 | 优先级 | 说明 |
|---|---|---|---|
| storyboards | 2/21 | P0 | 故事板核心，规范 §5 全部落在此域 |
| dramas | 6/19 | P0 | 项目、剧本、大纲、分集、进度、画布布局 |
| characters | 0/19 | P0 | 角色字段、四视图、锚点、造型、参考图 |
| scenes | 0/11 | P0 | 场景提示词、四格、参考图 |
| props | 0/9 | P0 | 道具提取与生图 |
| images | 0/9 | P0 | 分镜图生成、上传、批量、背景提取 |
| episodes | 0/7 | P0 | 分集级拆解、资产提取、合成、下载 |
| videos | 0/7 | P0 | 分镜视频、图生视频、续查、批量 |
| audio | 0/2 | P0 | 音频拆镜（拆镜服务端已建，缺 L 的 extract 语义） |
| tasks | 2/3 | P1 | 任务查询与取消已有，列表缺失 |
| video-merges | 0/4 | P1 | 成片合并 |
| extract-description-from-image | 0/1 | P1 | 图生描述 |

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
| 创作工坊审批闸门会套到商单链路 | 部分成立。`getDramaLabProjectGroup` 查不到协作组即 return，未建组时为空操作 |
| 复用创作工坊工作流服务即等于对齐 L | 错。创作工坊不是基线，违反规范 §9.3 |
| 41 项测试通过即迁移达标 | 错。测试只覆盖服务层与路由层，未覆盖 UI 暴露面与 L 行为等价性 |

## 7. 计费归属缺陷

一键成片经由创作工坊工作流服务发起的生成，其上游请求 context 写死 `featureModule: "drama-lab"`，商单用量记到教学版账上。属 P0，随故事板域迁移一并修正。

## 8. 下一步

按 P0 顺序推进，每项须同时给出：V 实现位置、服务端接口、持久化字段、请求载荷对比、自动化测试。无证据项一律保持"未迁移"。
