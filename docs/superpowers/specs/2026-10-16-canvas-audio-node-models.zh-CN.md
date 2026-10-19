# 画布音频节点：按模型分参数（参考 LibTV）

## 目标

画布音频节点按所选模型展示各自的参数面板，交互参考 LibTV：

- 顶部模型选择。
- 文本框上方有快捷插入（停顿、语气词）。
- 音色选择弹窗，分音色库、我的音色、克隆。
- 可折叠的高级设置：语速、声调、音量、音色效果、稳定性、时长等。
- 音乐模型可切换"描述生音乐 / 歌词生音乐"，有纯音乐开关。

接入的模型：TTS 用 MiniMax speech-2.8、GLM-TTS、IndexTTS-2，音乐用 Suno。LibTV 里的 Seed Audio、Eleven、Mureka 我们没有渠道，不做。

## 现状（已读代码）

- 音频全链路是 OpenAI `/audio/speech` 形状，参数只有 voice、format、speed、instructions。
  - 前端：`components/audio-settings-panel.tsx`、`lib/audio-generation.ts`。音色写死为 13 个 OpenAI 音色。
  - 后端：`lib/server/audio-task-config.ts` 白名单，`audio-task-runtime.ts:68-79` 默认参数包。
- 后端已支持三种返回：二进制直存、JSON 带 URL、JSON 带任务 ID 再轮询（`queryPath`）。异步的 Suno 能直接复用。
- `/api/audio-tasks` 已接收 `input` 字段，存成 `workflowInput` 并合进请求参数。额外参数可以走这里，不用改四处白名单。
- 生产和测试的渠道里：
  - modelbay 有 `speech-2.8-hd/turbo`、`suno/v6`、`suno/v6-mini`、`suno/v6-wild`。
  - 兔子有 `speech-02*`、`tts-1*`、`suno_music`、`suno_lyrics` 等。
  - 这些模型的 requestTemplate 目前全是 OpenAI TTS 模板，Suno 用这个模板发不出正确请求。
- 画布代码有两份（`app/(user)/canvas/` 与 `features/drama-canvas-runtime/`），改动要同步两处。
## 各模型参数（来源：官方 OpenAPI / 源码）

| 模型 | 参数 |
|---|---|
| MiniMax speech-2.8-hd/turbo | voice_id；speed 0.5–2；vol 0–10；pitch -12–12；emotion（happy/sad/angry/fearful/disgusted/surprised/calm）；音色效果 voice_modify：pitch/intensity/timbre -100–100，sound_effects 四选一；sample_rate；format。文本内可写停顿 `<#0.5#>` 和语气词 `(laughs)` 等。 |
| GLM-TTS（智谱官方） | voice（7 个预置 + 克隆音色）；speed 0.5–2；volume 0–10；格式 wav/pcm；单次最多 1024 字。克隆走 `/voice/clone`，需要 3–30 秒参考音频和对应文本。 |
| IndexTTS-2 | 参考音色音频（零样本克隆）；情感控制四选一（同参考音频 / 情感参考音频 / 8 维情感滑杆 / 情感描述文本）；情感权重 0–1.6；采样参数（temperature、top_p 等）。 |
| Suno | 描述模式 `gpt_description_prompt`；歌词模式 `prompt` + `title` + `tags`（风格）；`make_instrumental` 纯音乐；`mv` 模型版本；续写 `continue_clip_id` + `continue_at`；另有歌词生成接口。异步提交，轮询拿 `audio_url`。 |

## 关键风险，需先确认

1. **MiniMax 高级参数可能传不到上游。** OpenAI `/audio/speech` 只认 model、input、voice、response_format、speed。emotion、pitch、vol、voice_modify 要用 MiniMax 原生 `/v1/t2a_v2` 的请求格式。modelbay、兔子是否转发原生格式，没有 key 验证不了。停顿和语气词写在文本里，一定能用。
2. **Suno 在网关上的接口没有确认。** 兔子的模型名和 new-api 惯例一致（`/suno/submit/music`、`/suno/fetch/:id`），但兔子文档要登录才能看，modelbay 文档打不开。需要用真实 key 各探测一次。
3. **IndexTTS-2 和 GLM-TTS 我们没有渠道。**
   - IndexTTS-2 没有官方托管 API。ModelScope 演示页的生成接口没有命名，按序号调用很不稳。只能自己部署，或者找第三方网关。
   - GLM-TTS 有智谱官方 API（`open.bigmodel.cn/api/paas/v4/audio/speech`），需要申请智谱 key 并新增渠道。
4. **克隆音色**要上传参考音频、在上游建音色、保存音色 ID 和归属，是一个单独的功能，工作量不小。

## 方案

1. **前端面板**：新增按模型分发的音频参数注册表 `lib/audio-model-params.ts`，按上游模型名匹配：minimax-speech / glm-tts / index-tts / suno / 其它（保持现有 OpenAI 面板）。面板只渲染注册表里声明的字段，额外参数通过 `input` 提交，不改现有 voice/format/speed 链路。
2. **后端协议**：
   - 新增 `suno-music` 异步协议：提交到 `/suno/submit/music`，查询 `/suno/fetch/:id`，结果取 `data[].audio_url`。字段名以探测结果为准。
   - MiniMax 先保持 OpenAI 模板。只有确认网关能转发原生格式时，才新增 `minimax-t2a` 模板，否则面板只露出语速和文本标记。
3. **分期**：
   - 一期：Suno 两种模式 + 纯音乐 + 时长/风格；MiniMax 语速、停顿、语气词，加上已验证可用的高级参数；音色库弹窗用上游预置音色。
   - 二期：GLM-TTS 渠道接入（拿到智谱 key 后）。
   - 三期：IndexTTS-2（自建或找网关）和音色克隆。
4. 两份画布代码同步改，补单测和本地协议 fixture 回归。

## 需要你决定

- 一期范围是否按上面划分？
- 能不能给我测试环境的 modelbay 和兔子 key 的使用许可？我先各发一次 Suno 和 MiniMax 原生参数的探测请求，大约消耗几首歌和几句话的额度。
- GLM-TTS 要不要申请智谱官方 key？IndexTTS-2 自建还是先不做？
