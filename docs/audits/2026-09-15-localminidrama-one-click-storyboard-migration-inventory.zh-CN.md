# LocalMiniDrama「一键成片 / 故事板」迁移清单

日期：2026-09-15
审查范围：`D:/Claude code programe/VOZEB-PRO/LocalMiniDrama`
目的：为 VOZEB-PRO 新增的一级「一键成片」功能建立可验收的 L 行为基线。本文是迁移契约，不是“照着页面做一个壳”的 UI 清单。

## 1. 迁移边界

产品层级必须是：

```text
插件市场
├── 创作工坊（现有功能不改）
└── 一键成片（新增一级功能，可由插件开关隐藏）

平台左侧导航
├── 创作工坊
└── 一键成片
```

一键成片使用 VOZEB-PRO 的 React/Next UI、登录权限、平台画布、模型路由、Generation Worker、OSS、计费和媒体登记；但故事板的业务语义、状态迁移、请求参数、提示词组织、资产引用和恢复行为以 L 为事实基线。

本清单不允许把以下内容当成“已迁移”：只显示步骤卡、只显示按钮、前端 `setTimeout` 假进度、只保存浏览器状态、只把 L 页面 iframe 嵌入 V。

## 2. L 的真实入口与视图关系

### 2.1 入口

- L 主制作页：`frontweb/src/views/FilmCreate.vue`，路由：`/film/:id`。
- L 画布页：`frontweb/src/views/DramaCanvas.vue`，路由：`/film/:id/canvas`。
- 制作页头部通过 `goCanvasMode()` 切到画布；画布节点通过路由回到制作页并带 `episode`、`step`、`storyboard` 定位参数。
- 一键全流程入口位于制作页「一键全流程生成」区，但迁移到 V 后必须独立成 VOZEB 的一级工作区，不能把现有 V 创作工坊页面改成它。

### 2.2 页面必须保持的数据关系

```text
drama/project
  └── episodes
        ├── script_content / description
        └── storyboards
              ├── scene_id
              ├── character ids
              ├── prop ids
              ├── prompts / camera fields
              ├── image history / first / last
              └── video history / audio

同一集
  └── 平台画布 project + workflow_groups + 节点状态
```

列表工作台和画布不是两份数据，也不能复制媒体；画布只保存布局、工作流分组和节点状态，资产/分镜/媒体仍以项目数据为真源。

## 3. L 的一键成片真实步骤

L `FilmCreate.vue` 的 `runOneClickPipeline(textOnly)` 是行为基线：

| 步骤 | 行为 | 真实完成条件 | 失败/恢复要求 |
| --- | --- | --- | --- |
| 1 | 提取角色 | `generationAPI.generateCharacters(dramaId, { episode_id, outline })` 任务完成，重新加载项目 | 任务可轮询/取消；已有角色时跳过 |
| 2 | 提取场景 | `dramaAPI.extractBackgrounds(episodeId, { style, language })` 完成 | 已有场景跳过；失败记录步骤错误 |
| 3 | 提取道具 | `propAPI.extractFromScript(episodeId)` 完成 | 已有道具跳过；L 不中断整个流程但要记录错误 |
| 4 | 生成分镜脚本 | `dramaAPI.generateStoryboard(episodeId, options)` 返回 task，分镜可增量刷新 | 失败后保留已恢复分镜；支持截断续写/去重 |
| 4a | 全能模式后处理 | 每镜调用全能片段生成/润色，逐镜持久化 | 可停止；单镜失败记入流程错误 |
| 5 | 生成角色图 | 无主图角色并发生成，任务完成后重新加载资产 | 单项重试 3 次；不覆盖已有主图 |
| 6 | 生成场景图 | 单图/四宫格由资产 `generationLayout` 决定 | 单项失败不丢其他结果 |
| 7 | 生成道具图 | 单图/四视图由资产布局决定 | 单项失败可重试 |
| 8 | 生成分镜图 | 只处理没有可用图片的镜头；经典/首尾帧/全能使用各自提示词与参考图 | 不得只拼前端通用字符串 |
| 9 | 生成分镜视频 | 只处理有可用输入的镜头；使用主图/首尾帧/全能多图引用 | 上游任务可继续查询；失败不清除已有媒体 |
| 10 | 合成整集视频 | `dramaAPI.finalizeEpisode(episodeId, mergeOptions)` 任务完成并有播放地址 | 失败显示错误；可重试，不重复生成已完成镜头 |

「生成文本框架」是同一编排的前 1～4 步，明确不生成图片和视频；它不是假流程。

阶段之间 L 有倒计时确认窗口，允许用户浏览分镜/资产后继续。V 迁移时应保留“暂停/继续/取消”语义，但暂停不能只停 UI，当前任务状态和下一步边界必须可恢复。

## 4. 分镜生成的服务端契约

### 4.1 请求

L 前端传入：

```json
{
  "style": "项目完整风格提示词",
  "aspect_ratio": "16:9",
  "storyboard_count": 20,
  "video_duration": 120,
  "include_narration": true,
  "universal_omni_storyboard": false
}
```

V 必须在服务端重建同等上下文：当前集剧本、项目比例、每段时长、当前风格、项目内真实角色/场景/道具 ID 与名称。

### 4.2 提示词组成

L 服务端 `episodeStoryboardService.generateStoryboard()`：

1. 读取当前集 `script_content`，为空时回退 `description`，两者为空直接失败。
2. 读取项目风格和 metadata 中的比例/每段时长。
3. 注入角色、场景、道具真实 ID 列表。
4. 注入数量、总时长、旁白、全能模式约束。
5. 读取系统分镜提示词模板。
6. 创建 `storyboard_generation` 异步任务后执行。

系统提示词必须强制模型返回：

- `sceneId` / 对应真实场景 ID；
- `characterIds` / 当前项目真实角色 ID；
- `propIds` / 当前项目真实道具 ID；
- `imagePrompt`、`videoPrompt`；
- `shot_type`、`angle_h`、`angle_v`、`angle_s`、`movement`、`lighting_style`、`depth_of_field`；
- `segment_index`、`segment_title`；
- `creation_mode`、`universal_segment_text`；
- `dialogue`、`narration`、`action`、`result`、`duration`。

服务端只接受项目内真实 ID，非法 ID 必须丢弃或使该镜失败，不能按名称猜测、创建幽灵资产或把 ID 直接送给图片模型作为自然语言。

### 4.3 增量保存、截断续写与恢复

L 的 `processStoryboardGeneration()` 不是一次性等完整 JSON：

- 流式响应每约 400 字符尝试解析已闭合数组元素；
- 已保存镜号用 Set 去重；
- JSON 截断时先修复已闭合元素，再尝试 `jsonrepair`；
- 最多三次续写，携带完整已生成镜头摘要和最后五镜上下文；
- 续写从 `lastShotNum + 1` 开始，禁止重复；
- 失败时恢复任务前旧分镜并清理本次候选；
- 已有部分结果且上游连接中断时，作为 `truncated` 部分成功返回；
- 完成后更新剧集总时长。

V 的验收必须包含：模型响应截断、连接中断、服务重启、重复点击、部分结果恢复，而不是只测试完整 JSON 成功。

## 5. 分镜持久化字段与媒体闭环

每条分镜至少要稳定持久化：

```text
id, episodeId, storyboardNumber, title, description
sceneId, characterIds, propIds
location, time, duration, dialogue, narration, action, result, atmosphere
imagePrompt, polishedPrompt, videoPrompt
shotType, angle, angleH, angleV, angleS, movement
lightingStyle, depthOfField, layoutDescription
segmentIndex, segmentTitle, creationMode, universalSegmentText
```

### 5.1 图片

- 经典模式：读取保存的最终图片提示词，传入分镜绑定的场景/角色/道具主参考图。
- 首尾帧模式：首帧、尾帧分别有专用提示词和历史图；生成尾帧可带首帧作为空间/站位参考。
- 全能模式：不把全能文本误当成经典静态图提示词；按平台模型契约发送文本与参考图。
- 历史图追加保存，第一次成功结果才自动设主图；已有主图不得自动覆盖。

### 5.2 视频

- 经典：主分镜图作为首帧/参考图，使用 `videoPrompt`。
- 首尾帧：传 `first_frame_url`、`last_frame_url`，并保持跨镜衔接。
- 全能：按 `scene → character(s) → prop` 顺序传参考图；只传全能片段主文本，不把经典提示词重复拼入。
- 视频任务失败后保留失败记录、错误和可继续查询的上游任务信息；继续查询不能重复提交新上游任务。

### 5.3 音频

- 对白 TTS 写入分镜对白音频；旁白 TTS 写入旁白音频。
- “按音频拆镜”把一个分镜拆成单人对白/旁白计划，移动后续镜号，复制资产关联，重建各镜视频提示词。
- 合成时按分镜时长对齐音频，可选混入对白、旁白和字幕。

## 6. 画布集成契约

VOZEB 的一键成片必须使用平台画布，不复制 L 的画布引擎。

迁移的 L 语义：

- 一集一个画布上下文；
- 节点类型至少覆盖剧本、角色、场景、道具、分镜、图片、视频、音频；
- 工作流组保存选中的真实分镜 ID；
- 节点操作调用与列表工作台相同的生成任务；
- 节点显示状态来自持久化任务，不以组件卸载为准；
- 从画布定位到分镜卡片时必须带 `episodeId/storyboardId`，反向进入画布也要保留集数和定位信息；
- 画布布局与业务实体分离保存，禁止复制项目/媒体。

## 7. 任务状态机

```text
queued/pending
  → processing/running
  → completed
  → failed
  ↘ cancelled
```

每个长任务必须保存：任务 ID、项目/集/资源 ID、步骤、进度、消息、错误、结果引用、创建/更新时间。

前端要求：

- 页面刷新后通过服务端任务查询恢复进行中任务；
- 同一项目/集/资源的相同任务运行中去重；
- 用户取消会停止轮询并调用取消接口；
- 失败有错误原因、重试入口；
- 可恢复的上游视频任务有“继续查询”，不能重新提交；
- 一键成片显示当前步骤、并发任务、已完成/失败数和最终合成状态。

## 8. V 实现映射建议

| L 能力 | V 承载方式 |
| --- | --- |
| `FilmCreate.vue` 一键流程 | 一键成片独立 Next 页面/工作区，拆成流程控制器、故事板卡、资产面板、任务面板 |
| L taskService | V `generation_tasks` + Generation Worker，必须是服务端持久化任务 |
| L SQLite drama/episode/storyboard | V `drama_projects`、episodes、shots、asset 关联和媒体引用 |
| L `/film/:id/canvas` | V 平台 Canvas 项目/节点运行时 |
| L 图片/视频 API | V 平台生成路由，保留 L 的请求字段语义和参考图顺序 |
| L local_path | V 媒体登记、OSS storageKey、签名读取 URL |
| L 软删除与历史媒体 | V 版本/引用保护和历史参考图实体 |

严禁把 L 的 SQLite 表直接复制到 V、在浏览器保存业务 JSON、或为了“先跑起来”用假任务/固定超时替代任务状态机。

## 9. 必须先完成的开发顺序

1. 建立一级「一键成片」入口和前端显示开关；现有创作工坊不改。
2. 建立项目/集/画布绑定与恢复路由。
3. 实现故事/剧本输入、导入和分集持久化。
4. 实现服务端资产提取和分镜任务（增量保存、续写、恢复、去重）。
5. 实现 L 等价的分镜字段和三模式提示词链。
6. 接入资产主参考图、分镜历史图、首尾帧连续性。
7. 接入视频、TTS、按音频拆镜、整集合成。
8. 实现一键成片编排、暂停/取消/重试/恢复和画布状态同步。
9. 完成真实上游调用回归和 L/V 同输入对比。

## 10. 验收用例

### 入口与权限

- 插件市场可单独隐藏/显示一键成片；隐藏后左侧导航和直接 URL 均不可进入。
- 创作工坊仍能正常进入；关闭一键成片不影响创作工坊、普通短剧和 Canvas。
- 一键成片使用当前用户项目隔离，不能读取其他用户项目。

### 剧本与分集

- 输入 60 集 TXT/MD，预览和持久化必须是 60 集，不得按默认上限截成 20/26 集。
- 刷新、关闭页面、重新登录后剧本与集数仍存在。
- 重复点击生成不会创建两个运行任务。

### 分镜

- 经典、首尾帧、全能三模式分别产生正确字段和最终请求。
- 模型响应被截断时可看到部分镜头，续写后镜号连续且无重复。
- 真实资产 ID 非法时不创建幽灵资产。
- 关闭浏览器后任务可恢复；取消后不继续写入后续结果。

### 媒体

- 资产主图、历史图和分镜绑定关系稳定；生成图片读取绑定主参考图。
- 首尾帧可重生成、上传、历史选择，下一镜可复用上一镜尾帧。
- 视频失败显示可读错误；可恢复任务点“继续查询”不重复收费/提交。
- 对白、旁白、音频拆镜、字幕和整集合成按 L 语义工作。

### 画布

- 一集对应一个平台画布；画布节点与分镜卡共享同一任务和媒体状态。
- 画布重新打开、切换集数、定位分镜后状态一致。

## 11. “完成”定义

只有以下条件全部满足，才可以向测试报告“L 一键成片已迁移”：

- 本文第 3～7 节每一项都有实际服务端/前端实现证据；
- 不存在只读浏览器状态或 `setTimeout` 假任务作为完成依据；
- L/V 使用同一剧本、同一模型、同一风格的对照测试通过；
- 失败、取消、刷新恢复、截断续写、部分结果、重复点击均有自动化测试；
- GitHub Actions、测试环境部署和真实浏览器回归均通过。
