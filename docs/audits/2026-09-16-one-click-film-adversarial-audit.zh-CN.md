# 一键成片 1:1 迁移对抗性审查

日期：2026-09-16  
范围：LocalMiniDrama 一键成片/故事板 vs VOZEB-PRO 新增 one-click-film 代码  
结论：**未通过 1:1 验收，当前是平台入口 + 父任务骨架 + 部分底层复用，不是完整 L 复刻。**

## 1. 审查方法

本次同时追踪：

- L 前端 `frontweb/src/views/FilmCreate.vue` 的一键流程、媒体请求和全能提示词操作；
- L 后端 `backend-node/src/services/episodeStoryboardService.js`、`routes/storyboards.js`、`services/taskService.js`；
- V `web/src/app/(user)/one-click-film`、`web/src/app/api/one-click-film`、`web/src/lib/server/one-click-film`；
- V 实际复用的创作工坊 workflow、图片/视频/音频和成片服务。

验收原则：页面存在、按钮可点、父任务能创建都不算迁移完成；必须证明字段、请求载荷、内置提示词、参考图、状态回写和恢复行为等价。

## 2. 已确认的等价/可复用部分

| 领域 | 证据 | 结论 |
|---|---|---|
| 一级模块 | `web/src/lib/feature-modules.ts`、`navigation-tools.ts` | `one-click-film` 独立于 `drama-lab`，开关和导航位置已建立 |
| 独立项目 | `web/src/app/api/one-click-film/projects/route.ts` | 可创建/列出带 `one-click-film:` 来源标识的项目 |
| 独立工作区 | `web/src/app/(user)/one-click-film/[id]/one-click-film-project.tsx` | 可读取项目、编辑分集、导入 TXT/MD、轮询父任务 |
| 父任务基础 | `web/src/lib/server/one-click-film/orchestration.ts`、`engine.ts` | 有持久化 render 父任务、幂等、锁、取消、重试、步骤进度 |
| V Worker 接入 | `generation-task-recovery-service.ts` | 已增加 `one-click-film-workflow` 分支，能被共享 Worker 唤醒 |
| L 章节解析 | `drama-source-splitter.ts` | 已复用符号章节标题识别和多集拆分逻辑 |
| V Canvas | `one-click-film/[id]/canvas`、episode-canvas service | 已有独立入口，底层复用 V Canvas runtime；但来源前缀仍需最终核验 |

## 3. 阻断性缺口（当前不能称 1:1）

### P0-A：父任务步骤没有完整等价的 L 编排

当前 `executor.ts` 把 `assets`、`storyboard`、`images`、`videos` 映射到现有 `drama-lab-workflow-task-service`，且只传第一集 `sourceEpisodeId`，没有按 L 对每集/每项子任务完整编排和恢复。

L 的真实顺序是：

```text
角色提取 → 场景提取 → 道具提取 → 分镜脚本
→ 全能片段生成/润色（按启用项）
→ 角色图 → 场景图 → 道具图
→ 分镜图 → 分镜视频 → TTS/音频拆镜 → 整集合成
```

V 当前执行器没有逐项创建并持久化角色/场景/道具、图片、视频、TTS 子任务，也没有按已完成项跳过全部 L 单元。它目前更像“调用创作工坊 workflow 的父包装”。

### P0-B：提示词和内置提示词没有 1:1 迁移

L 的内置提示词来源：

- `LocalMiniDrama/backend-node/src/services/promptI18n.js`
- `episodeStoryboardService.js` 的 system prompt 组合；
- `routes/storyboards.js:generateUniversalSegmentPrompt`；
- `routes/storyboards.js:polishUniversalSegmentStream`。

L 的全能生成/润色至少会组装：

- 当前分镜主体、动作、场景、对白、旁白；
- 项目完整风格；
- 画幅比例；
- 分镜时长；
- 当前镜头前后镜上下文；
- 真实场景/角色/道具引用顺序；
- 已保存 `universal_segment_text`；
- L 的系统模板和规范化规则（时长标记、`@图片N` 间距等）。

当前 V `one-click-film` 目录没有全能提示词生成/润色 API，没有内置提示词组合，也没有最终上游 prompt 记录。因此用户特别问的“全能润色具体传哪些参数”，当前答案是：**一键成片尚未实现该调用，不能声称已照抄。**

### P0-C：完整故事板字段未接入一键成片

L 分镜必须持久化：

```text
storyboardNumber/title/description
sceneId/characterIds/propIds
location/time/duration/dialogue/narration/action/result/atmosphere
imagePrompt/videoPrompt
shotType/angle/angleH/angleV/angleS/movement/lightingStyle/depthOfField
layoutDescription/segmentIndex/segmentTitle/creationMode/universalSegmentText
```

当前一键成片工作区只显示项目/分集统计和任务步骤，没有独立故事板编辑器、字段回写或上述字段验证测试。

### P0-D：媒体请求载荷没有 1:1 证据

L 的媒体合同：

- 经典：`videoPrompt` + 主分镜图/首帧；
- 首尾帧：`first_frame_url` + `last_frame_url`；
- 全能：`universalSegmentText` + 场景→角色→道具→明确参考图；
- 角色/场景/道具生成先读取保存的最终 prompt；
- 图片/视频失败保留 provider task id，可继续查询原任务。

当前 `executor.ts` 未构建这些请求，也没有一键成片专属的图片/视频/TTS 请求载荷测试。无法证明上游收到的 prompt、参考图顺序、比例、时长、模型和 provider task id 与 L 等价。

### P0-E：音频步骤是占位读取

当前 `executor.ts` 的 `audio` 步骤只扫描已有 `dialogueAudio`/`narrationAudio` URL 并返回成功；没有：

- 创建对白/旁白 TTS 任务；
- 按 L 规则传 voice、format、speed、文本和上下文；
- 音频拆镜；
- 音频任务状态、取消、重试、恢复；
- 字幕/时间轴回写。

因此这一步目前是明显的“壳”。

### P0-F：成片步骤只处理第一集

`executor.ts:runCompose` 只取 `episodeIds[0]` 创建一个 final-video task，没有按 L 的整集合成、多集结果、音频/字幕/分镜顺序和导出字段完成闭环。

### P1：画布来源隔离未完全证明

一键成片入口使用独立路径，但底层调用 `getOrCreateDramaLabEpisodeCanvasForUser`，该服务默认使用 `drama-lab-canvas:` source handoff。需要新增可选 namespace 或独立适配器，证明一键成片画布不会和创作工坊画布混淆，同时仍复用 V Canvas。

### P1：项目列表的来源筛选曾依赖 summary 不存在字段

`DramaProjectSummary` 不包含 `sourceHandoffId`。当前代码已改为回读完整项目再筛选，但需测试 PostgreSQL 和 file provider 两种模式，避免列表混入其他短剧项目。

### P1：入口总开关与直接路由

当前导航按开关过滤，但 `FeatureModuleGate` 是透明壳；需要确认关闭开关后直接访问 `/one-click-film` 的产品预期。用户此前定义是只控制前端显示，因此不应新增服务端业务禁用，但页面仍要有稳定空态/返回行为。

## 4. L/V 参数对照（用户重点问题）

### L 全能生成

L 代码入口：

- `routes/storyboards.js:581-610` `generateUniversalSegmentPrompt`
- `routes/storyboards.js:618+` 流式生成
- `routes/storyboards.js:682+` `polishUniversalSegmentStream`
- `FilmCreate.vue:5939` 等调用点

请求语义包含：分镜行、项目风格、比例、时长、场景/角色/道具引用、当前/前后镜上下文、系统全能模板；结果规范化后持久化到 `universal_segment_text`。

### V 一键成片当前

当前一键成片没有对应 `universal-segment-prompt` 或 `polish` route/service，也没有把上述参数传到文本模型，再把结果用于视频模型。因此此项状态为：**缺失，阻断 1:1 验收。**

## 5. 对抗性结论

结论：**当前不能确认“一键成片已完全照抄 L”，且不能交付商单生产。**

当前完成度更准确描述为：

```text
入口/配置/项目壳/父任务骨架：已实现
L 业务 1:1：未完成
```

最严重的不是 UI 缺失，而是：

1. 全能提示词和内置模板没有迁移；
2. 媒体请求没有按 L 构建；
3. 音频步骤是读取已有 URL 的占位实现；
4. 成片只处理第一集；
5. 独立画布 namespace 尚未最终隔离；
6. 故事板字段和增量恢复没有落到一键成片领域。

因此本次审查不通过。

## 6. 下一步修复顺序（继续开发，不等待用户确认）

1. 迁移 L 的 universal prompt bundle、生成/润色路由和参数快照；
2. 新增一键成片故事板持久化字段和真实 ID 校验；
3. 为每集/每个资产/每个媒体创建真实子任务；
4. 迁移 TTS、音频拆镜、字幕和整集合成；
5. 增加一键成片专属画布 namespace；
6. 建立 L/V 同输入请求载荷快照测试；
7. 完成本地登录端到端验证后才允许推送 GitHub。
