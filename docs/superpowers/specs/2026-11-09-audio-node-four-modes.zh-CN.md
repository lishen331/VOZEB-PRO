# 音频节点四种生成模式：合成 / 设计 / 克隆 / 多人对话

日期：2026-11-09
交互稿：`D:\tmp\voice-node-demo.html`（已确认）
多人对话试听：`D:\tmp\instr-probe\dialogue.html`
前置文档：
- [2026-11-03-custom-voice-ui-implementation.zh-CN.md](2026-11-03-custom-voice-ui-implementation.zh-CN.md)
- [2026-11-03-voice-panel-wiring.zh-CN.md](2026-11-03-voice-panel-wiring.zh-CN.md)

## 1. 目标

画布上的音频节点支持四种生成模式，覆盖魔搭 GLM-TTS 演示的全部能力：

| 模式 | 用户做什么 | 结果 |
|---|---|---|
| 合成 | 选一个音色，输入文本 | 一段音频（现有功能） |
| 设计 | 用一句话描述声音，输入文本 | 一段音频；满意可存为「我的音色」 |
| 克隆 | 把一个音频节点连到本节点，输入文本 | 用参考音频的声音读文本；音色自动存入「我的音色」 |
| 多人对话 | 按「名字：台词」逐行写，每个角色设音色和指令 | 多个角色轮流说的一段音频 |

两个渠道：千问（阿里云百炼）和 MiniMax 官方。两家的设计、克隆接口形态不同，后端按渠道切换，前端交互一致。

## 2. 现状（2026-11-09 实测）

| 能力 | 千问 | MiniMax |
|---|---|---|
| 渠道 | 生产、测试均已接入 | 11-09 改为官方渠道（`api.minimaxi.com`），生产、测试各真实合成一次，成功 |
| 合成 | 可用 | 可用 |
| 单句指令 | 支持 `input.instruction`，自由文本 | 不支持自由文本，只有 `voice_setting.emotion`（固定枚举） |
| 设计、克隆 | 后端适配代码已写，**从未真实调用** | 同左 |
| 多人对话 | 两家都没有多人接口，需要逐句合成后拼接 | 同左 |

### 2.1 需要修正的已有代码

依据百炼官方文档（[音色设计 API](https://docs.bailian.console.aliyun.com/zh/model-studio/voice-design-api-references)、[音色复刻 HTTP API](https://docs.bailian.console.aliyun.com/zh/model-studio/voice-clone-design-http-api)）并用只读接口实测，现有适配器需要改：

1. **千问克隆和设计共用一个模型名 `voice-enrollment`，用 `input.action` 区分操作。** 2026-11-10 用 `action: "list_voice"` 实测返回 200，账号下已有 2 个状态为 `OK` 的克隆音色（10-29 测试时创建）。上一版文档说的 `qwen-voice-enrollment` 是 Omni 模型用的，Qwen-Audio-TTS 不用它；「设计模型不存在」也是因为试的模型名不对，不是账号没开通。
2. **千问克隆请求体按官方格式重写：** `{ model: "voice-enrollment", input: { action: "create_voice", target_model, audio, prefix, language_hints? } }`。`audio` 可以是公网 URL，也可以是 `data:audio/...;base64,...`；`target_model` 必须和之后合成用的模型一致（音色绑定模型）；`prefix` 只能是字母和数字，最多 10 位。现有代码发的是 `{ voice, audio_data, audio_format }`，调不通。
3. **千问设计请求体按官方格式重写：** `{ model: "voice-enrollment", input: { action: "create_voice", target_model, voice_prompt, preview_text, prefix, language_hints? }, parameters: { response_format: "mp3" } }`。`voice_prompt` 最多 500 字，只支持中英文；`preview_text` 必须 15～200 字。返回 `output.voice_id` 和 `output.preview_audio.data`（Base64 试听音频）。
4. **千问查询状态用 `action: "query_voice"`，删除用 `action: "delete_voice"`。** 状态值：`DEPLOYING`（审核中）、`OK`（可用）、`UNDEPLOYED`（审核未通过）。现有 `queryQwenVoiceStatus` 用的 action 名不对。
5. **MiniMax 设计由服务端生成 `voice_id`。** 账户下已有设计音色 `ttv-voice-…`。`submitMinimaxVoiceDesign` 在请求里传了 `voice_id`，要去掉，以返回值为准。
6. **MiniMax 路径前缀。** 渠道 `baseUrl` 已含 `/v1`，适配器兜底路径又写了 `/v1/...`，会拼成 `/v1/v1/...`。兜底路径去掉 `/v1`。
7. **自定义音色扣费改为按成本价计算**（见 4.4）。现有代码把渠道配置里的 `pricing` 当作「创建音色费」直接扣，和上游实际收费方式不符。

## 3. 交互（按已确认的交互稿）

### 3.1 模式入口

- 位置：音频设置浮层最上面，叫「生成模式」，四个分段按钮：合成 / 设计 / 克隆 / 多人对话。和视频节点的「视频生成模式」用同一个控件（`CompactOptionGroup`）。
- 模式存在节点上（`metadata.audioMode`），不同节点互不影响。旧节点没有这个字段，按「合成」处理，行为与现在一致。
- 底部设置按钮的文字显示当前模式，例如「合成 · 龙安欢（女）· 1.00x」「克隆 · 音频1」「多人对话 · 2 个角色」。

### 3.2 模式自动切换

| 触发条件 | 行为 |
|---|---|
| 有音频节点连到本节点（且原模式不是多人对话） | **自动**切到「克隆」，输入框上方提示「连入了音频节点，已切到克隆」并带「撤销」 |
| 断开所有上游音频节点，当前是克隆 | 退回「合成」 |
| 文本里出现 2 个及以上不同的「名字：台词」 | **只提示**「检测到 N 个角色（小美、阿强），要切到多人对话吗？」，带「切换」「不用」；点「不用」后该节点不再提示 |
| 用户手动选了模式 | 之后不再自动切走 |

角色识别规则：行首 1～8 个非空白字符，后跟中文或英文冒号，冒号后至少一个非空白字符。

### 3.3 各模式的设置项

| 模式 | 浮层中的设置项 |
|---|---|
| 合成 | 音色下拉框 + 试听；基础调节；指令（仅千问）；输出格式 |
| 设计 | 声音描述（必填，最多 500 字）；基础调节；输出格式 |
| 克隆 | 参考音频卡片（显示来自哪个节点、时长、「待克隆 / 已克隆」）；基础调节；指令（仅千问）；输出格式 |
| 多人对话 | 角色列表，每个角色一张卡片：音色下拉框 + 指令（千问）或情绪下拉（MiniMax）+ 台词句数；基础调节；输出格式。全局指令框隐藏 |

### 3.4 音色下拉框

替换现在一直展开的音色列表：

- 收起时只占一行，显示当前音色名称和试听按钮。
- 点开后，下拉面板浮在其他设置项上方，不改变浮层高度。面板里有：分类、搜索、「音色库 / 我的音色」两个标签，音色按分类分组，最多显示约 6 条，其余滚动。
- 选中、点外面或按 Esc 都会收起。
- 去掉「创建音色」按钮和创建音色弹窗。自定义音色只有两个来源：设计后点「存为我的音色」，以及克隆时自动入库。
- 「共享音色」标签先不放（目前没有分享入口），数据结构保留。

### 3.5 生成后

- 设计：结果下方出现「这个声音满意吗？[名称] 存为我的音色」。不点，这个音色只用这一次。
- 克隆：结果下方显示「已存入我的音色」。同一段参考音频再次生成时，直接复用已克隆的音色，不重复克隆、不重复扣克隆费。
- 授权：克隆模式下，同一段参考音频第一次生成前，必须勾选「我已获得该声音本人授权，同意用于语音合成」，不勾不能生成。勾选记录写入审计日志。

## 4. 后端设计

### 4.1 统一入口

继续用 `POST /api/audio-tasks`，新增可选字段 `config.mode`：

| mode | 新增字段 |
|---|---|
| `tts`（默认） | 无，与现在一致 |
| `design` | `config.voiceDescription` |
| `clone` | `config.referenceAudio: { storageKey 或 url, durationMs }`、`config.cloneConsent: true` |
| `dialog` | `config.dialog: { lines: [{ role, text }], roles: { [role]: { voice, instruction?, emotion? } } }` |

不新建接口的原因：音频任务已有的排队、扣费、退款、超时恢复、结果落库都能直接复用。四个模式都是「一个任务产出一段音频」，只是执行步骤不同。

### 4.2 各模式的执行步骤（在 `audio-task-runtime` 中）

**设计**
1. 调设计接口拿到 `voice_id`：
   - 千问：`model: "voice-enrollment"`、`action: "create_voice"`、`target_model` 等于本节点所选合成模型、`voice_prompt` = 声音描述、`preview_text` = 本节点文本的前 200 字（不足 15 字时用固定的示例句补足）。返回即可用，不需要轮询。
   - MiniMax：`/voice_design`，`voice_id` 由上游生成。
2. 用这个 `voice_id` 合成本节点文本。
3. 在 `custom_voices` 写一条 `kind = design`、`saved = false` 的记录。用户点「存为我的音色」时再改为 `saved = true`，此时才出现在「我的音色」里。
4. 千问的设计音色绑定 `target_model`：在 plus 下设计的音色，在 flash 下不能用。音色列表只显示与当前模型匹配的自定义音色。

**克隆**
1. 计算参考音频的指纹：`sha256(用户 ID + 渠道 ID + 合成模型 + 参考音频的 storageKey)`。
2. 在 `custom_voices` 中查同指纹、状态为 `ready` 的记录。有就直接用，跳到第 4 步。
3. 没有就调克隆接口：
   - 千问：`model: "voice-enrollment"`、`action: "create_voice"`、`target_model` 等于所选合成模型，`audio` 传服务端签名的公网地址；然后用 `query_voice` 轮询，`OK` 为成功，`UNDEPLOYED` 为审核未通过，超过 120 秒算失败。
   - MiniMax：先 `/files/upload` 再 `/voice_clone`，同步返回。
   - 成功后写入 `custom_voices`：`kind = clone`、`saved = true`、带上指纹。
4. 用这个 `voice_id` 合成文本。
- 参考音频要求：千问 10～60 秒、≤ 10 MB、wav/mp3/m4a；MiniMax 10 秒～5 分钟、≤ 20 MB。从渠道 `voiceCustomization.audioLimits` 读取；不符合时在提交前就返回错误，不扣费。
- 指纹包含 `target_model`：同一段音频在 plus 和 flash 下各克隆一次，因为千问音色绑定模型。

**多人对话**
1. 校验：至少 2 个角色、最多 10 个角色、最多 100 句、每句最多 500 字。
2. 逐句调用合成接口，每句带上对应角色的音色和指令（千问：`input.instruction`；MiniMax：`voice_setting.emotion`）。并发上限 3，保持原始顺序。
3. 用 ffmpeg 把各句音频按顺序拼成一个文件，句间留 300 毫秒静音。生产镜像已装 ffmpeg（`Dockerfile` 第 43 行）。
4. 任一句失败：整个任务失败，退还全部积分。已合成的中间文件丢弃。

### 4.3 数据表 `custom_voices` 新增字段

| 字段 | 类型 | 用途 |
|---|---|---|
| `saved` | boolean，默认 true | 设计出来但用户没点保存的为 false，不出现在「我的音色」里 |
| `source_fingerprint` | text，可空 | 克隆用，用来判断同一段参考音频是否已克隆过；加唯一索引 `(owner_user_id, channel_id, source_fingerprint)` |
| `consent_at` | timestamptz，可空 | 克隆授权时间 |
| `unlocked_at` | timestamptz，可空 | MiniMax 音色首次合成成功、已扣音色费的时间；为空表示下次合成要收音色费 |

用 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 添加，老数据不受影响。

### 4.4 扣费：按官方成本价加 10%

**原则：** 用户扣的积分 = 上游官方公开价 × 1.1，按 100 积分 = 1 元换算，向上取整。目前没有商务折扣，成本就是官方价。

**上游官方价（2026-11-10 核对）**

| 项目 | 千问（百炼） | MiniMax（官方） |
|---|---|---|
| 合成 | 3.1-tts-plus：1.4 元 / 万字符；3.1-tts-flash：按 token，输入 1.5 元、输出 12 元 / 百万 token | speech-2.8-hd：3.5 元 / 万字符；speech-2.8-turbo：2.0 元 / 万字符（1 个汉字算 2 个字符） |
| 克隆 | 免费，只按之后的合成计费 | 不在克隆时收费；**首次用该音色合成时收 9.9 元**；克隆接口自带的试听按合成价计费 |
| 设计 | 免费，只按之后的合成计费 | 同克隆：**首次使用收 9.9 元**；接口内试听按 2.0 元 / 万字符 |

来源：百炼[声音复刻](https://docs.bailian.console.aliyun.com/zh/model-studio/voice-cloning-user-guide.md)、[声音设计](https://docs.bailian.console.aliyun.com/zh/model-studio/voice-design-user-guide.md)、[模型调用价格](https://docs.bailian.console.aliyun.com/zh/model-studio/model-pricing.md)；MiniMax [价格页](https://platform.minimaxi.com/docs/guides/pricing)。

**平台扣费规则**

| 场景 | 扣费 |
|---|---|
| 合成 | 按字数计费（见下），不再按次扣固定积分 |
| 千问克隆、设计 | 不收音色费，只收合成费 |
| MiniMax 克隆、设计 | **1,089 积分**音色费（9.9 元 × 1.1 × 100），在**首次用这个音色合成时**扣，和上游收费时点一致；之后再用这个音色只收合成费 |
| 多人对话 | 每句按字数合成计费，各句相加 |

**合成按字数计费：** 平台现在的音频是按次扣固定积分（生产上目前每次 27 积分，来自 `__default__` 默认值），和上游按字数收费对不上：短句亏不了，长文本会亏。改为：

```
扣费积分 = ceil( 字符数 ÷ 10000 × 单价(元) × 1.1 × 100 )，最少 1 积分
```

| 模型 | 每万字符成本 | 每万字符扣费（积分） |
|---|---|---|
| qwen-audio-3.1-tts-plus | 1.4 元 | 154 |
| qwen-audio-3.1-tts-flash | 约 0.6 元（按 1 字约 0.5 个输入 token、2.2 个输出 token 估算，实测 38 字输入 20、输出 43 token） | 66 |
| speech-2.8-hd | 3.5 元（汉字按 2 个字符） | 385 |
| speech-2.8-turbo | 2.0 元（汉字按 2 个字符） | 220 |

单价写进渠道配置（`voiceCustomization.pricing` 和新增的 `synthesisPricing`），后台可改，不写死在代码里。

**界面：** 生成前在按钮旁显示预计扣费；MiniMax 首次使用某个自定义音色时，额外提示「首次使用该音色会多扣 1,089 积分（上游音色解锁费）」。

**退款：** 失败按现有规则全额退。MiniMax 音色费只有在合成成功时才扣，失败不会被收。

### 4.5 MiniMax 和千问的差异，后端统一处理

| | 千问 | MiniMax |
|---|---|---|
| 指令 | 写入 `input.instruction` | 不发指令；多人对话的角色卡片显示「情绪」下拉，写入 `voice_setting.emotion` |
| 克隆 | 异步，需要轮询 | 同步 |
| 自定义音色有效期 | 长期 | 7 天内不使用会被上游删除（已有 `inactiveExpireDays: 7`，`lastUsedAt` 已在合成时更新） |

## 5. 前端改动

| 文件 | 改动 |
|---|---|
| `components/audio-settings-panel.tsx` | 加「生成模式」分段控件；按模式显示对应设置项 |
| `components/voice-selector.tsx` | 改成下拉框；去掉「创建音色」按钮和「共享音色」标签 |
| `components/create-voice-modal.tsx` | 删除 |
| 新增 `components/audio-dialog-roles.tsx` | 多人对话的角色卡片 |
| 新增 `lib/audio-dialog-script.ts` | 角色解析（纯函数，单测覆盖） |
| `canvas/[id]/use-canvas-generation-actions.tsx` | 音频生成时把模式、参考音频、对话结构传给后端 |
| `canvas/components/canvas-node-prompt-panel.tsx` | 输入框上方的模式提示、多角色确认提示、授权勾选 |
| `services/api/audio.ts` | 请求体加 `mode` 等新字段 |
| `drama-canvas-runtime/` 下对应文件 | 同步修改（短剧画布和普通画布是两份代码） |

另外，`voice-selector.tsx`、`canvas-settings-popover-shell.tsx`（两份）现在有一批**本地未提交**的改动（分类筛选、列表高度、点弹窗不再关闭浮层）。这批改动并入本次开发，一起提交。

## 6. 不做的事

- 共享音色的入口（数据字段保留）。
- 音色重命名、删除的界面（后端接口已有）。
- 多人对话里一个角色用克隆、另一个角色同时用新的参考音频即时克隆。多人对话只能选已有的音色，包括「我的音色」里已经克隆好的。
- 设计时的多次候选试听（魔搭演示没有，先不做）。
- 普通「合成」模式使用参考音频：两家的合成接口都不接收参考音频，连了音频节点又不选克隆时，参考音频不参与生成，界面上会提示。

## 7. 测试

**单元测试**
- 角色解析：中英文冒号、名字长度边界、冒号后为空、「注意：明天下雨」只算 1 个角色。
- 模式自动切换：连入、断开、手动选择后不再自动切换。
- 克隆指纹去重：同一段音频第二次不调克隆接口。
- 扣费计算：按字数计费公式、四个模型的单价、MiniMax 音色费只在首次成功合成时扣一次、千问音色不收音色费。
- 多人对话：任一句失败时整体失败并全额退款。
- 上游适配器：千问克隆、设计、查询的请求体与官方文档一致（`model: "voice-enrollment"`、`action: "create_voice" / "query_voice"`）；MiniMax 路径不出现 `/v1/v1`。

**回归**
- 旧音频节点（没有 `audioMode`）的合成结果与改动前一致。扣费从按次改为按字数，这是本次有意的变化。
- Suno、OpenAI 类音频模型不显示「生成模式」（这两类不支持设计、克隆），扣费方式不变。

**测试环境真实调用（每项至少一次）**

| | 千问 | MiniMax |
|---|---|---|
| 合成 | ✓ | ✓ |
| 设计 | ✓ | ✓ |
| 克隆（首次 + 复用） | ✓ | ✓ |
| 多人对话（含指令 / 情绪） | ✓ | ✓ |

MiniMax 的设计、克隆每次真实测试会产生 9.9 元上游费用，测试时各做一次即可。

## 8. 已确认（2026-11-10）

1. 千问设计接口：按官方文档，模型名 `voice-enrollment`，已用只读接口验证可用。
2. 定价：官方公开价 × 1.1，目前无商务折扣。
3. 生产音频扣费改为按字数计费，取代现在按次 27 积分的默认值。

## 9. 实施顺序

每步单独提交，推到 develop，在测试环境验证后再做下一步。生产发布等全部完成并验证后，单独找你确认。

1. 修正上游适配器（2.1 第 1～6 条）+ 数据表新字段 + 单测。
2. 后端：音频按字数计费 + 音色费规则（4.4）。
3. 后端：克隆模式（含指纹去重、授权记录）+ 测试环境真实克隆。
4. 后端：设计模式。
5. 后端：多人对话（逐句合成 + ffmpeg 拼接）。
6. 前端：生成模式控件、音色下拉框、多人对话角色卡片、自动切换与提示；两份画布代码同步。
7. 测试环境按第 7 节逐项真实调用，写验证记录。
