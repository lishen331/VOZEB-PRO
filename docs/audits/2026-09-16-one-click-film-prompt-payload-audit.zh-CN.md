# 一键成片提示词与上游载荷对抗性审查

日期：2026-09-16  
范围：LocalMiniDrama 已验证故事板链路 vs VOZEB-PRO `one-click-film` 当前实现。  
结论：**不通过 1:1 验收；当前 V 是父任务骨架并复用短剧实验室 workflow，不是 L 的完整业务复刻。**

## 一、L 的真实业务合同

### 1. 故事板拆解

L 的 `generateStoryboard` 位于 `LocalMiniDrama/backend-node/src/services/episodeStoryboardService.js:1198-1416`：

- 读取当前 episode 的 `script_content`，无内容时失败：`1200-1205, 1241-1248`。
- 读取项目/剧集风格和 metadata 中的画幅、每段时长：`1207-1239`。
- 读取项目内角色、场景、道具列表，并把真实 ID/名称提供给模型：`1250-1272`。
- 用户消息由剧本文本、任务说明、数量/时长约束、三类资产列表、输出后缀组成：`1274-1332`。
- 系统提示词来自 L 内置 `getStoryboardSystemPrompt`，并根据数量、旁白、全能模式追加最高优先级合同：`1338-1378`。
- 创建持久化 `storyboard_generation` 任务并异步执行：`1380-1416`。

L 返回/持久化的分镜包含场景、角色、道具关联及摄影字段，而不是只保存一段描述。

### 2. 全能提示词生成

L 前端入口为 `LocalMiniDrama/frontweb/src/api/storyboards.js:116-126`，后端为 `LocalMiniDrama/backend-node/src/routes/storyboards.js:580-616`。

生成调用的真实输入：

- 当前分镜字段：`TITLE、DESCRIPTION、LOCATION、TIME、ACTION、DIALOGUE、NARRATION、RESULT、ATMOSPHERE`：`universalSegmentPromptBundle.js:52-61`。
- 已有图片/润色图片/视频提示词及当前 `universal_segment_text`：`62-73`。
- 当前项目和剧集风格、中文/英文风格词、画幅：`23-42`，以及 `447-467`。
- 总时长和严格的多节拍合同：`447-455`。
- `IMAGE_SLOT_MAP`、场景布局、角色白名单、实际资产引用顺序：`457-463`；真实场景/角色/道具参考状态：`76-165`。
- 上一镜/下一镜的详细字段和短摘要：`402-433`、`464-465`。
- L 内置系统提示词 `getUniversalOmniSegmentPrompt()`：`promptI18n.js:1350-1395`。

文本模型调用参数：

```text
kind = text
scene_key = image_polish
max_tokens = 2400
 temperature = 0.28
```

证据：`routes/storyboards.js:590-597`；流式版本参数为 `max_tokens=2400、temperature=0.28、silence_timeout_ms=180000`：`640-652`。

系统提示词硬约束包括：

- 输出固定多节拍格式，第二行写 M，后续 `分镜k：Tk秒`，Tk 总和必须等于总时长：`promptI18n.js:1359-1372`。
- 对白必须逐字保留，不能用“双方对话”等摘要替代：`1374-1379`。
- 只能使用 `IMAGE_SLOT_MAP` 中的 `@图片N`，场景/角色编号不可错位：`1381-1385`。
- 场景参考图是多格图时，最终视频仍必须是连续单画面：`1391-1394`。

结果经时长和 `@图片N` 空格规范化后持久化为 `universal_segment_text`：`routes/storyboards.js:601-611`、流式版本 `664-675`。

### 3. 全能提示词润色

L 前端入口：`storyboards.js:128-137`；后端：`routes/storyboards.js:682-797`。

润色除了上述 base bundle 外，额外发送：

- `draft_universal_segment_text` 当前编辑区全文：`682-694`、`743-747`。
- 完整本集剧本：`701-707`、`735`。
- 上一镜/下一镜完整上下文：`709-726`、`737-741`。
- `POLISH_PASS_STAMP`，要求多次润色不能原样重复：`728-733`。
- `DIALOGUE_RETENTION`，要求逐字保留对白/旁白：`733`。

润色文本模型参数：

```text
kind = text
scene_key = image_polish
max_tokens = 4096
temperature = 0.52
silence_timeout_ms = 180000
```

证据：`routes/storyboards.js:760-774`。结果规范化并写回 `universal_segment_text`：`786-797`。

L 的内置润色系统提示词是 `getUniversalOmniPolishPrompt()`，它继承完整全能生成合同并额外要求事实完整、明显改写、节奏增强、对白逐字保留：`promptI18n.js:1398-1410`。

### 4. 经典/首尾帧图片请求

L 单镜图片请求在 `FilmCreate.vue:4314-4324`：

```text
storyboard_id
 drama_id
prompt
model
style
frame_type
aspect_ratio
reference_images（首尾帧站位锁定时传首帧）
use_first_frame_layout_lock
```

经典单图请求使用 `polished_prompt || image_prompt || description`：`4398-4406`。首尾帧请求先执行 `ensureProfessionalFramePrompt`，分别提交 `frame_type=storyboard_first/last`：`4302-4323`、`6961-6976`。

### 5. 经典/首尾帧/全能视频请求

L 视频请求在 `FilmCreate.vue:6651-6666`，真实载荷包括：

```text
drama_id
storyboard_id
prompt = buildSbVideoPromptForApi(sb)
api_protocol（全能 Omni 时）
video_config_id（全能 Omni 时）
image_url
first_frame_url
last_frame_url
reference_image_urls
style
aspect_ratio
resolution
duration
```

文案规则：经典使用 `video_prompt`；全能优先使用 `universal_segment_text`，不能把经典 `video_prompt` 再拼进去：`6119-6128`。全能参考图按场景→角色→道具收集：`6583-6644`、`6131+`。

全能视频还会拒绝重复参考图、超过模型上限的参考图和非法 `@图片N`，见 `drama-lab-shot-generation-service.ts:151-192`（V 对应的底层服务）。

## 二、V 当前一键成片实际行为

### 1. 一键成片没有自己的 L 全能生成/润色调用

`VOZEB-PRO/web/src/lib/server/one-click-film` 下只有：

- `engine.ts`：固定七步及父任务状态：`3-10, 12-40`。
- `executor.ts`：把 assets/storyboard/images/videos 直接映射到现有 `drama-lab-workflow-task-service`：`16-19, 35-44`。
- 没有 `universal-segment-prompt`、`universal-segment-polish` 路由，也没有 L 内置 `promptI18n` 合同的独立迁移。

因此当前一键成片不会按 L 的上述参数调用“全能生成/润色”，也没有对应请求快照测试。

### 2. V 只传第一集给子 workflow

`executor.ts:35-44` 只取 `const sourceEpisodeId = episodeIds[0]`，随后只启动一次短剧实验室 workflow。虽然父任务保留全部 `episodeIds`，但子 workflow 实际不是按每集分别执行 L 的全部步骤。

### 3. 音频步骤是占位成功

`executor.ts:20-30` 只扫描已有 `dialogueAudio.url` / `narrationAudio.url`，然后直接返回 `status: success`。没有创建 TTS 任务、传递 voice/format/speed、音频拆镜、字幕时间轴回写或音频重试/恢复。

### 4. 成片只处理第一集

`executor.ts:46-52` 只取 `episodeIds[0]`，只创建一个 `createDramaLabFinalVideoTask`，不生成多集成片，也不返回多集导出结果。

### 5. V 底层媒体服务不是 L 请求等价证明

V 的经典图片服务 `drama-lab-shot-generation-service.ts:51-65` 会额外拼接 V 的模板合同和 `shotGenerationContext`；V 视频服务 `68-148` 会追加 V 自己的动态约束、首尾状态和禁止项；全能服务 `151-198` 追加 V 的项目/剧集/风格行。这些可以是 V 的适配策略，但目前一键成片没有 L/V 请求快照来证明最终 prompt、参考图顺序、模型、比例、时长与 L 等价。

## 三、阻断性结论

| 项目 | L | V 一键成片当前 | 结论 |
|---|---|---|---|
| 全能生成 | 专用路由 + bundle + 内置 system prompt | 无专用调用 | 缺失 |
| 全能润色 | draft + 整集剧本 + 邻镜 + base bundle + system prompt | 无专用调用 | 缺失 |
| 分镜字段 | 完整摄影/叙事/关联字段持久化 | 工作区只展示统计/任务 | 缺失 |
| 图片载荷 | 模式化 prompt、frame_type、参考图、比例 | 通过短剧 workflow 间接调用 | 无等价证据 |
| 视频载荷 | 经典/首尾帧/全能分支完整载荷 | 通过短剧 workflow 间接调用 | 无等价证据 |
| 音频 | TTS、音频拆镜、字幕/时间轴 | 扫已有 URL 即成功 | 明确占位 |
| 成片 | 多集/整合导出 | 只取第一集 | 明确缺陷 |
| 画布 | L 业务与 V 画布适配 | V 画布入口已有 | namespace 仍需验证 |

**最终结论：当前不能把 V 一键成片交付为“L 1:1 复刻完成”。**

本报告仅为审查产物，没有修改业务代码。
