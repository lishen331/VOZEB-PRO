# Suno 设置面板：两种模式分开 + 显示不全 + AI 写歌词

## 背景

Suno 已经能生成音乐，但画布音频节点的设置面板有三个问题（用户 2026-10-09 反馈，截图里面板右边被切掉）：

1. "描述生音乐"和"歌词生音乐"切换后面板完全一样。
2. 面板显示不全：右边的"一键重置"、输入框、纯音乐开关被切掉。
3. 之前商量过要加"AI 写歌词"，一直没写进文档，也没做。

## 原因

1. **两种模式一样**：[audio-model-params.ts](../../../web/src/lib/audio-model-params.ts) 里的 `SUNO_FIELDS` 是固定列表，不会随模式变化。实际发给上游的字段其实不同（`audioUpstreamFields`）：
   - 描述模式发送 `gpt_description_prompt` + `tags` + `make_instrumental`，**不发送 `title`**，可面板上还显示"歌曲标题"。
   - 歌词模式把输入框内容当歌词，作为 `prompt` 发送。同时打开"纯音乐"的话，歌词和纯音乐是矛盾的。
   - 输入框占位文字两种模式一样（`audioModelPlaceholder`）。
2. **显示不全**：弹窗外壳 [canvas-settings-popover-shell.tsx](../../../web/src/app/(user)/canvas/components/canvas-settings-popover-shell.tsx) 宽 340px，内边距 16px，内容区只有 308px。`AudioModelParamsPanel`（[audio-settings-panel.tsx](../../../web/src/components/audio-settings-panel.tsx)）又写死了 `w-[340px]`，所以右边溢出 32px 被切掉。
3. **"生成模式"出现两次**：分组标题和字段标题都叫"生成模式"。

## 改法

### 1. 显示不全
- `AudioModelParamsPanel` 去掉 `w-[340px]`，改为 `w-full`，宽度由弹窗外壳决定。MiniMax 面板用的是同一个组件，一起修好。
- 字段标题和分组标题相同时不再重复显示。

### 2. 两种模式分开
字段增加一个可选的显示条件（只在某个模式下显示），面板和参数整理都按条件过滤：

| 字段 | 描述生音乐 | 歌词生音乐 |
|---|---|---|
| 纯音乐 | 显示 | 隐藏，发送时固定为 false |
| 歌曲标题 | 隐藏（上游不收） | 显示 |
| 音乐风格 | 显示 | 显示 |
| AI 写歌词按钮 | 隐藏 | 显示 |
| 输入框占位 | "描述你想要的音乐，如：一首甜甜的恋爱歌曲" | "输入歌词，可用 [Verse] [Chorus] 分段，或点 AI 写歌词" |

### 3. AI 写歌词
歌词模式下显示"AI 写歌词"按钮：用户输入主题（默认取输入框内容），生成的歌词填进输入框，用户可以再改，然后照常生成音乐。

上游有三种接法，**需要你选一种**：

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| A. 平台已有的文本模型 | 用现有文本生成链路，加一段写歌词的提示词，要求输出 [Verse]/[Chorus] 格式 | 不加新协议，同步返回，改动最小 | 歌词质量取决于选的文本模型 |
| B. 兔子 `suno_lyrics` 模型走 `/v1/chat/completions` | 当文本模型接入 | 同步，是 Suno 自己的歌词模型 | 返回格式没实测过 |
| C. 兔子 `/suno/submit/lyrics` | 异步提交再轮询 `/suno/fetch` | 官方接口 | 要加异步任务和轮询，改动最大 |

**已选 A**（用户 2026-10-09 确认）。

实现方式：照搬现有的提示词优化链路（`/api/agent/prompt-optimization` → `optimizeCreativePrompt`），不另起一套：
- 后台默认文本模型 `settings.defaultModels.textModel`，候选渠道排序、失败换渠道、系统 AI 扣费头、无效返回退款，全部用 `prompt-optimization-service.ts` 里现有的逻辑。
- 新增写歌词的系统提示词和工具定义（`write_song_lyrics`，返回 `lyrics` 字符串）。要求：用 [Verse]/[Pre-Chorus]/[Chorus]/[Bridge] 分段；语言跟随用户主题；只输出歌词，不加解释。
- 新接口 `POST /api/agent/lyrics-writing`，请求体 `{ requestId, prompt }`，返回 `{ lyrics }`。登录校验、`text` 频率限制和提示词优化接口一致。
- 前端新增 `services/api/lyrics-writing.ts`，调用后刷新积分，和 `optimizePrompt` 写法一致。

**扣费**：按默认文本模型的现有文本价格扣积分，生成失败或返回无效时退款。

## 改动范围
- `web/src/lib/audio-model-params.ts`：字段显示条件、模式相关占位文字、歌词模式下 `make_instrumental` 固定为 false。
- `web/src/components/audio-settings-panel.tsx`：宽度、重复标题、按条件渲染。
- 两份画布代码（`app/(user)/canvas` 和 `features/drama-canvas-runtime`）的音频节点输入区：AI 写歌词按钮，以及占位文字随模式变化。两份同步改。
- 后端：AI 写歌词的接口，按选定的方案实现。

## 验证
- 单元测试：两种模式下的字段列表、发给上游的字段、旧数据（歌词模式下纯音乐为 true）发送时变成 false。
- 在浏览器里打开画布，切换两种模式，确认面板完整显示、字段随模式变化，MiniMax 面板也不再被切掉。
- 测试环境实际生成一次歌词，再用这段歌词生成一首歌。
