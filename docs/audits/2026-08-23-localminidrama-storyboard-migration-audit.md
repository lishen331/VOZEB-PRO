# LocalMiniDrama -> VOZEB-PRO 故事版迁移对抗性审查

日期：2026-08-23  
范围：仅审查 `LocalMiniDrama` 到 `VOZEB-PRO` 的短剧实验室直接业务链路：故事梗概/剧本生成、剧本导入、资产提取与绑定、分镜提取、首/关键/尾帧、分镜图、分镜视频、音频和一键工作流。未把其他产品模块的能力混入结论。

## 结论

**未完整迁移。当前 V 更像“相同入口的重做版”，不是 L 故事版业务闭环的等价实现。**

最严重的差异有四类：

1. L 的多集、异步、服务端持久化和任务恢复没有迁移。V 的 `episodeCount` 只是传入 prompt 的普通字段，实际永远只生成当前一集；生成结果先回到浏览器，再由第二次 PUT 保存，页面关闭或保存失败会丢稿。
2. L 的分镜提取会持久化完整摄影字段、提示词、段落和全能模式，并支持流式增量保存、截断续写、去重和部分恢复。V 的提取服务明确把 `imagePrompt`/`videoPrompt` 置空，丢弃段落、灯光、景深和全能模式字段，一次请求失败即结束。
3. L 的首尾帧、跨镜头连续性、对白/旁白音频和真实一键生成流水线没有形成 V 的可操作闭环。V 有部分服务端类型和接口，但不少只是预留字段、单次提交或前端演示定时器。
4. L 的小说导入、完整项目导出、一键提取三类资产等直接功能缺失或降级为单项操作。

V 已迁移且值得保留的部分：分镜 JSON 强制引用真实 `sceneId`/`characterIds`/`propIds` 并在服务端校验；生图会读取绑定资产的主参考图；文本帧规划、图片/视频任务幂等键、日志和任务同步基础已存在。

## 证据矩阵

| 业务能力 | L 实现 | V 实现 | 判定 |
| --- | --- | --- | --- |
| 无项目直接从梗概开始 | `frontweb/src/composables/useStoryGeneration.js:44-59` 自动建项目并替换路由 | `web/src/app/api/drama-lab/projects/route.ts:82-98` 创建空 `episodes`；工作台只有有当前集才渲染编辑器（`drama-workflow-lab-project-complete.tsx:824-828,1061`） | **缺失，P1** |
| 多集生成 | `storyGenerationService.js:9-20,41-92` 按 `episode_count` 生成并兼容多种 JSON/纯文本 | `drama-lab-script-generation-service.ts:39-46,51-60,101-108` 固定 `{script}` 单集 | **缺失，P0** |
| 服务端持久化 | L `storyGenerationService.js:95-138` 调 `saveEpisodes`/`saveOutline` | V 前端收到结果后才 `saveNow` 二次 PUT（`drama-workflow-lab-project-complete.tsx:968-985`） | **非原子，P0** |
| 任务状态、轮询、取消、重启恢复 | L `taskService.js:3-125`、`routes/task.js:4-45` | V 没有 story task route；`generate-script` 直接等待文本请求 | **缺失，P0** |
| 运行中任务去重 | L `startStoryGeneration` 按项目复用 pending/processing task（`storyGenerationService.js:141-166`） | V `requestId=Date.now()`，无服务端运行任务检查 | **缺失，P1** |
| 故事风格/类型语义 | L 固定枚举 `modern/ancient/fantasy/daily`、`drama/comedy/adventure` 并注入标签（`promptI18n.js:895-960`） | V UI 使用另一套中文选项，服务端原样传字符串 | **不等价，P1** |
| 选择剧本库 | L 预览并导入梗概+全部剧集正文 | V 有脚本库导入，但 `normalizeEpisodes` 丢失 `outline/hook/nextPreview/sourceRange/reviewStatus` | **部分迁移，P1** |
| 手工保存剧本的分集识别 | L `saveScriptToBackend` 会识别剧本中的集标记并创建/更新全部 episodes | V `saveNow` 只更新当前 `episode.id` 的 `script`，不会把多集标记拆分 | **缺失，P1** |
| 生成参数持久化 | L 将 `story_style`、类型、比例及生成设置写入 drama metadata | V `storyStyle`/`scriptType`/`episodeCount` 只是组件 state，刷新后丢失且不写项目 metadata | **缺失，P1** |
| 小说/TXT/MD 导入 | L `novelImportService.js` + `/dramas/import-novel`，支持章节规则、限制章节数和可选 AI 改写 | V “导入小说”按钮无 `onClick`，无 route/service（`drama-workflow-lab-project-complete.tsx:1107-1114`） | **缺失，P1** |
| 三类资产一键提取 | L Canvas 一键顺序提取角色/场景/道具 | V `/extract-assets` 每次强制一个 `assetType`，UI 只有当前类型按钮 | **缺失，P2** |
| 分镜完整字段 | L 持久化提示词、角度三元组、灯光、景深、段落、classic/universal 等 | V extractor `imagePrompt/videoPrompt` 置空、`utterances` 置空，连续性只填角度/景别（`drama-lab-storyboard-extraction-service.ts:125-166,211-223`） | **缺失，P1** |
| 分镜容错与恢复 | L 流式增量、截断最多续写 3 次、按镜号去重、部分结果恢复、回写剧集时长（`episodeStoryboardService.js:843-1099`） | V 单次请求，整集覆盖 shots，无增量/续写/部分恢复 | **缺失，P1** |
| 真实资产 ID 关联 | L 有角色/场景/道具关联 | V tool 契约和服务端集合校验拒绝幽灵 ID（`drama-lab-storyboard-extraction-service.ts:50-64,131-165,203-208`） | **已迁移** |
| 首/关键/尾帧 | L 可生成、上传、查看/编辑专业 prompt、历史绑定、尾帧首帧站位锁和跨镜复用 | V 有三个生成按钮和 planner，但卡片没有上传、历史恢复、站位锁、上下镜复用 | **部分迁移，P1** |
| 分镜视频参考链 | L 支持首帧+尾帧、全能模式参考图、前镜尾帧衔接 | V `generate-video` 只提交一个 key/storyboard 参考（`drama-lab-shot-generation-service.ts:45-95`） | **不等价，P1/P2** |
| 对白/旁白音频与按音频拆镜 | L 有 TTS、音频 pipeline 和 `/split-by-audio` | V contract 有 `audio*` 字段，但无短剧实验室 audio route/UI/任务创建 | **缺失，P1** |
| 批量生图/生视频 | L 等待每个任务完成并统计成功/失败 | V `runBatch` 逐个 POST 后立即结束（`drama-workflow-lab-project-complete.tsx:2591-2621`） | **语义不等价，P1** |
| 一键全流程 | L 真实调用资产、分镜、图、视频、音频并轮询 | V `simulateRun` 只是 `setTimeout`，明确不创建任务/不扣额度（`drama-workflow-lab-project-complete.tsx:1517-1534,1669-1675`） | **演示逻辑，P1** |
| 审核 | L 与实际生成状态衔接 | V `simulateReview` 只是前端计时器 | **演示逻辑，P2** |
| 完整项目导出/恢复 | L ZIP 含项目 JSON、资产、关联、提示词、历史图、音频/视频 | V 只有当前集剪映草稿导出 | **缺失，P2** |

## 关键问题详述

### P0：多集故事生成闭环被截断

L 的输入从 `premise` 开始，按集数构造 JSON 数组，解析失败时仍能把纯文本兜底为第一集；异步任务负责进度、保存、结果和失败状态。V 的服务端契约却追加“只返回当前一集 `script`”，工具 schema 也只有 `{script}`。因此 UI 的“集数”输入即使填 12，也只会覆盖当前 episode。V 的单测还把 `episodeCount=12` 作为输入并期望单脚本，等于把缺陷固化为测试预期。

### P0：生成结果不是服务端原子保存

V `generate-script` 只返回文本；前端 `setFieldsValue` 后再执行 `saveNow`。浏览器关闭、网络断开、并发自动保存或 PUT 409 都会造成“上游已成功但项目没有剧本”的状态。L 的任务处理器在服务端完成 `saveEpisodes` 和 `saveOutline` 后才标记成功。

此外，V 的“保存当前剧本”也不会像 L 一样识别正文中的“第 N 集/第 N 章”标记并拆分成多集；它只 map 当前 `episode.id` 写入一个 `script`。故事配置中的风格、类型和计划集数同样只存在组件 state，刷新后不会恢复。

### P1：分镜提取结果不足以驱动后续生成

L 的分镜结果保存了后续图像/视频生成所需的摄影和叙事字段，并在模型输出被截断时续写或保留已保存部分。V 的 extractor 将提示词置空，段落、灯光、景深、全能模式等字段甚至不进入 schema；后续只能在生成图时临时规划，用户无法像 L 一样审核和编辑“提取出的分镜方案”。

### P1：帧连续性只实现了服务层片段，没有产品闭环

V `drama-lab-frame-generation-service.ts` 能让尾帧读取首帧 prompt/参考图，但工作台没有上传槽、首帧布局锁、历史版本恢复、上一镜尾帧复用，也没有把首尾帧作为视频请求的完整参考链。这个差异会直接表现为镜头之间人物站位、视线和道具状态不连续。

### P1：一键流程和批量按钮会产生“假完成”

V 批量按钮只代表请求已提交，不能代表任务完成；一键全流程和审核更是显式的 timer demo。用户会看到流程结束，但上游任务可能仍在排队或已经失败，且没有 L 的按镜头统计和失败重试语义。

## 已迁移能力与风险边界

- 保留 V 的真实 ID 白名单校验，不要退回按名称猜测资产。
- 保留 V 的服务端 prompt contract、参考图读取、计费幂等键和 generation log。
- 后续补齐 L 字段时，必须映射到 V 的 `DramaShot` contract，不能再把数据塞回前端临时字段。
- 不应把 L 的管理员私有 prompt override 直接照搬；V 需要全局短剧实验室模板的唯一约束。当前 runtime 按 `template_key` 和 `updated_at` 任取一行，管理员重复配置时来源不确定（`drama-lab-prompt-template-service.ts:14-29`）。

## 后续协同拆分

这些任务可以在互不修改同一核心文件的前提下并行：

### Agent A：故事生成与小说导入（最高优先）

- 服务端实现多集结构化输出、数组/包装对象/纯文本兜底。
- 建立 story task store、状态查询、取消、重启孤儿任务处理和项目级幂等。
- 在服务端原子保存 episodes、outline、metadata，保留已有 episode ID 并软删除被替换集。
- 新增 `/dramas/import-novel` 等价能力及前端导入对话框。
- 验收：填 1/3/12 集、刷新/关闭页面、重复点击、模型返回裸文本或截断 JSON，结果均可恢复且不会重复扣费。

### Agent B：分镜提取契约和容错

- 将 L 的 segment、摄影字段、提示词、classic/universal 字段映射进 `DramaShot`。
- 恢复流式增量保存、按镜号去重、截断续写和部分结果恢复。
- 维持真实资产 ID 白名单，服务端只接受当前项目资产。
- 验收：模型输出被截断、重复镜号、未知资产 ID、部分网络失败时，已完成镜头可见且任务状态准确。

### Agent C：帧/视频/音频连续性

- 补齐首尾帧上传、提示词查看编辑、历史恢复、首帧布局锁、上一镜尾帧复用。
- 视频请求支持首帧/尾帧/全能参考链，并实现对白/旁白 TTS 与按音频拆镜。
- 批量生成必须轮询到完成/失败，提供成功/失败计数和重试。
- 验收：相邻镜头能复用尾帧，任务失败可重试，批量结束时不再有 running task。

### Agent D：工作流、导出和配置一致性

- 把一键全流程从 timer demo 改成真实任务编排；审核状态读取真实任务结果。
- 增加完整项目 ZIP 导出/导入，包含资产、关联、提示词、帧和媒体历史。
- 给短剧实验室 prompt 表增加全局唯一键/明确 scope，修复多管理员来源漂移。
- 修复 reload 保留当前 episode，并补齐三类资产一键提取。

## 建议开发顺序

1. 先做 Agent A，解决故事生成数据模型和任务边界；否则后续资产/分镜没有稳定的多集输入。
2. 并行做 Agent B，完成分镜结构契约和恢复；两者只共享 `DramaShot`/`DramaEpisode` contract，合并时先定字段再接 UI。
3. 再做 Agent C，建立帧到视频的真实连续性和音频任务。
4. 最后做 Agent D 的编排、导出和全局配置，并执行跨模块验收。

本报告是审查结果，不包含实现修改；待与 Claude 的独立审查对比后，再锁定要进入开发的任务清单。
