# 自定义音色：MiniMax + 千问（声音设计 / 声音克隆）

## 目标

画布音频节点的音色弹窗里加"我的音色"和"共享音色"，用户可以用 MiniMax 或千问做声音设计、声音克隆，做出来的音色直接用于合成。本文件是 `2026-10-16-canvas-audio-node-models` 第三期"音色克隆"的展开。

## 已定规则（2026-10-09 确认）

1. **渠道按价格选**：同一家上游同时有国内和国际渠道时，哪个便宜走哪个。不在代码里写死。
2. **音色归属**：音色默认只有创建者本人能看到和使用。创建者分享后，其他用户可以使用。
3. **扣费**：克隆、设计按正常价格向创建者扣积分。别人用共享音色只扣自己的合成费，不再扣克隆或设计费。

## 现状（已读代码）

- 合成请求只把 `voice_setting.voice_id` 传给 MiniMax（`web/src/lib/audio-model-params.ts:164`），所以自定义音色 ID 可以直接用于合成，合成请求不用改。
- 预置音色写死在 `minimaxVoiceOptions`（`audio-model-params.ts:20`）。
- 路由按 `binding.priority`、`weight` 排序（`web/src/lib/server/logical-model-router.ts:41`），没有按价格选渠道。
- binding 的 `capabilityProfile` 已经有 `unitCost` / `unitCostCurrency`（`web/src/lib/auth/store-types.ts:261`），可以拿来比价。
- `LogicalModelCapability` 只有 text / image / video / audio（`store-types.ts:237`）。音色管理不产出作品，不新增 capability。

## 上游对照

| | MiniMax | 千问（阿里云百炼） |
|---|---|---|
| 克隆输入 | 先 `POST /v1/files/upload`（purpose=voice_clone）拿 file_id；音频 mp3/m4a/wav，10 秒–5 分钟，≤20MB。可选 8 秒内示例音频（purpose=prompt_audio） | 参考音频推荐 10–20 秒，≤60 秒，≤10MB，不需要对应文本 |
| 克隆接口 | `POST /v1/voice_clone`，voice_id 由我们命名（8–256 位，字母开头，只含字母数字 `-` `_`，不能以 `-` `_` 结尾） | 返回音色 ID，部署完成前要轮询状态 |
| 设计接口 | `POST /v1/voice_design`，prompt（描述）+ preview_text（≤500 字），试听为 hex 编码 | `POST /api/v1/services/audio/tts/customization`，`model: "voice-enrollment"`，`action: "create_voice"`；voice_prompt ≤500 字（只支持中英文）+ preview_text 15–200 字 + prefix（字母数字 ≤10 位）；同步返回 voice_id 和 base64 wav 试听（已实测，见下文） |
| 创建费用 | 国内：复刻 9.9 元/个，设计 9.9 元/个，**首次用于合成时**才扣；试听另计 | 免费 |
| 合成 | 现有 t2a 接入 | `qwen-audio-3.1-tts-plus/flash` 非实时 HTTP，返回音频 URL |
| 限制 | 克隆音色 7 天内未用于合成会被删除 | 音色绑定创建时的模型；每账号最多 1000 个自定义音色 |

两家共同点：音色只在创建它的账号（API key）下可用。国内和国际是两套账号，音色不能互通。

## 方案

### 1. 渠道配置

给 `SystemChannelAdvancedConfig` 加一个可选块，两家共用一个结构。路径和限制都可以配置，换国内/国际域名只改渠道的 baseUrl。

```ts
voiceCustomization?: {
  provider: "minimax" | "qwen";
  region: "cn" | "intl";
  clone?: {
    uploadPath?: string;          // MiniMax: "/v1/files/upload"
    uploadPurpose?: string;       // "voice_clone"
    promptUploadPurpose?: string; // "prompt_audio"
    createPath: string;           // "/v1/voice_clone"
    statusPath?: string;          // 千问轮询部署状态
    audioLimits: { formats: string[]; minSec: number; maxSec: number; maxMB: number };
    previewModel?: string;        // "speech-2.8-hd"
  };
  design?: { createPath: string; promptMax: number; previewTextMax: number };
  ttsModels: string[];            // 该音色可用的合成模型（千问只能用创建时的模型）
  inactiveExpireDays?: number;    // MiniMax 填 7
  pricing: { clone: number; design: number; preview: number; currency: "CNY" | "USD" };
}
```

### 2. 按价格选渠道

- 新增汇率配置（系统设置里一个数字，默认 7.1，管理员可改）。
- **创建音色时**：在所有开了 `voiceCustomization` 且同 provider 的渠道里，按 `pricing` 换算成人民币取最便宜的；价格相同按现有 priority。
- **预置音色合成时**：按 binding 的 `unitCost` 换算后取最便宜的，替代现有的 priority 排序。只对同时配了 unitCost 的 binding 生效，没配的保持原排序。
- **自定义音色合成时**：必须走创建它的渠道，不参与比价，该渠道失败也不切到别的渠道（别的账号下没有这个音色）。
- 按当前价格，MiniMax 会全部选国内渠道。中文按国内"一个汉字算两个字符"的规则，hd 合成两边价格接近，汇率低于约 7.0 时国际会更便宜，所以比价要用配置的汇率实时算。

### 3. 音色记录（新表 `custom_voices`）

字段：id、provider、channelId、upstreamVoiceId、kind（clone / design）、name、ownerId、ttsModel、previewUrl（转存到我们的存储）、shared、status（creating / ready / expired / deleted）、createdAt、lastUsedAt、expiresAt。

- MiniMax 克隆由平台生成 upstreamVoiceId：`vz` + 随机串，满足 MiniMax 命名规则且全局唯一。MiniMax 设计的 voice_id 由上游生成（`ttv-voice-...`），直接存返回值。
- 千问的 base64 试听和 MiniMax 的 hex 试听都转存成我们自己的文件。
- 千问 upstreamVoiceId 由上游生成，格式 `{target_model}-vd-{prefix}-{32 位随机串}`；我们只控制 prefix，固定用 `vz`。
- 每次合成成功更新 lastUsedAt。MiniMax 首次合成成功后清空 expiresAt。

### 4. 权限与共享

- 列表接口只返回 `ownerId = 当前用户` 或 `shared = true` 的记录。
- 只有创建者能改名、分享、取消分享、删除。删除会调上游删除接口，释放千问的 1000 个额度。
- 取消分享后，别人已经放在画布节点里的这个音色，下次生成时报"音色已不可用"。
- 合成接口在服务端再校验一次归属，不能只靠前端隐藏。

### 5. 扣费

- 新增全局积分单价（系统设置，"1 元 = N 积分"，管理员配置）。未配置时不允许创建克隆、设计音色。
- 克隆、设计在**创建成功时**扣创建者积分：积分 = 渠道 `pricing`（按汇率换算成人民币）× 积分单价。上游调价后改渠道 `pricing`，积分跟着变。创建失败不扣。
- 试听按试听字符扣创建者。
- 合成费用谁生成谁付，和预置音色一样。
- MiniMax 上游是首次合成才扣费，平台在创建时扣，两者时间不同。如果音色 7 天没用被上游删除，平台不退积分（创建时提示用户）。

### 6. 界面

- 音色弹窗分三栏：音色库（预置）、我的音色、共享音色。我的音色显示过期倒计时（MiniMax 未使用时）。
- 克隆：上传音频，前端先按 `audioLimits` 校验格式、时长、大小；必须勾选"我已获得声音本人授权"才能提交。
- 设计：填声音描述和试听文本，字数按配置限制。
- 创建前显示将扣的积分。
- 两份画布代码（`app/(user)/canvas/`、`features/drama-canvas-runtime/`）同步改。

### 7. 错误提示

| 上游 | 提示 |
|---|---|
| MiniMax 2038 | 上游账号未开通克隆权限，请联系管理员 |
| MiniMax 1043 | 音频识别校验未通过，请换一段更清晰的录音 |
| MiniMax 1008 | 上游余额不足，请联系管理员 |
| input_sensitive | 内容未通过审核 |
| 音色已被上游删除 | 音色已过期，请重新创建 |

## 实现设计（2026-10-09 补，按实测和现有代码修订）

### 渠道配置（修订第 1 节的结构）

实测后千问四个操作共用一个路径，MiniMax 是四个独立路径，结构改为：

```ts
voiceCustomization?: {
  provider: "minimax" | "qwen";
  region: "cn" | "intl";
  paths: { upload?: string; clone?: string; design?: string; delete?: string; customization?: string };
  ttsModels: string[];           // 音色可用的合成模型；创建时选其中一个绑定
  audioLimits: { formats: string[]; minSec: number; maxSec: number; maxMB: number };
  designLimits: { promptMax: number; previewTextMin: number; previewTextMax: number };
  inactiveExpireDays?: number;   // MiniMax 填 7
  pricing: { clone: number; design: number; currency: "CNY" | "USD" };
}
```

- 后台渠道编辑器加一个 JSON 文本框编辑这块，保存时校验并给出两家的默认模板。
- 上游调用直连渠道 baseUrl + apiKey（`fetchSafeOutbound`），不走 `/api/ai/system` 代理。代理按生成模型计费，音色管理不是生成。

### 系统设置

`AuthSettings` 加 `voicePricing: { usdToCny: 7.1, pointsPerYuan: 0 }`，后台"生成设置"面板加两个数字框。`pointsPerYuan = 0` 表示未配置，创建接口直接拒绝。

### 存储

- Postgres 新表 `custom_voices`（加进 `schema.ts`），文件模式用 `custom-voices.json`（`withJsonDataFileLock`）。两种模式走同一个 `lib/server/custom-voice-store.ts`。
- 在第 3 节字段之外加：`previewMimeType`、`failureReason`、`chargeReceiptId`、`upstreamRequestId`。

### 接口

| 接口 | 作用 |
|---|---|
| `GET /api/custom-voices?model=` | 我的 + 共享（只返回 ready / creating），按合成模型过滤 |
| `POST /api/custom-voices` | 创建。JSON：`kind`、`provider`、`ttsModel`、`name`；克隆带 `audio`（data URI，≤20MB）和 `consent: true`；设计带 `prompt`、`previewText` |
| `PATCH /api/custom-voices/[id]` | 改名、分享 / 取消分享，仅创建者 |
| `DELETE /api/custom-voices/[id]` | 调上游删除后标记 deleted，仅创建者 |
| `GET /api/custom-voices/[id]` | 查单条；千问克隆处于 creating 时顺带 `query_voice` 刷新状态 |

千问克隆创建后在 `after()` 里每 3 秒轮询，最长 60 秒；超时保持 creating，由前端 GET 继续刷新。

### 扣费

- 用 `consumePoints` 扣个人积分（`usageKind: "audio"`，幂等键 `custom-voice:{id}:create`），不走学校算力。
- 顺序：先扣积分，再调上游；上游失败按幂等键退款。用户看到的效果和"成功才扣"一致，并且避免上游已花钱、平台扣不到积分。
- 试听：MiniMax 设计、千问设计的试听是创建接口一起返回的，含在创建费里，不单独扣。克隆不生成试听（MiniMax 不带 `text`），用户要试听就用普通合成，按合成扣费。

### 合成

- 前端在 `params` 里传 `customVoiceId`（我们的记录 ID），不传上游 ID。
- `api/audio-tasks` 收到后：校验记录 ready、属于本人或已共享、模型在 `ttsModels` 里；候选渠道只保留记录的 `channelId`；`voice_id` 换成 `upstreamVoiceId`。不满足就报"音色已不可用"。
- 合成成功后更新 `lastUsedAt`，MiniMax 清空 `expiresAt`。
- 千问合成新增协议 `qwen-tts`：`/api/v1/services/audio/tts/SpeechSynthesizer`，结果字段 `output.audio.url`，系统代理按字面路径转发。`audio-model-params.ts` 增加 `qwen` 家族，请求体 `{ model, input: { text, voice, format, sample_rate } }`。

### 预置音色按价格排序

`resolveLogicalModelCandidates` 只对 `audio`：配了 `unitCost` 的 binding 按换算成人民币的单价排序，占回它们原来的位置；没配的不动。其他能力不变。

### 界面

音色选择在共享组件 `components/audio-settings-panel.tsx` 里改，两份画布都引用它，所以只改一处。弹窗三栏：音色库 / 我的音色 / 共享音色，加"创建音色"按钮（克隆、设计两个标签页）。

### 测试

单测覆盖：存储（两种模式）、两家上游适配器（mock fetch，按实测返回）、权限（别人的未共享音色报错）、扣费与失败退款、价格排序、`qwen-tts` 请求体与结果读取。最后 `pnpm typecheck`、`pnpm lint`、`pnpm test`，测试环境各真实创建一个音色并合成一次。

## 范围

不分期，一期全部做完：MiniMax 克隆 + 设计、千问合成（新增协议）+ 克隆 + 设计、音色表 + 权限共享 + 创建扣费、预置音色合成按价格选渠道。

## 开发前要实测（需要用测试环境 key，会产生少量费用）

- ~~MiniMax 上传接口参数~~（已实测）。
- ~~克隆时带试听算不算"使用"~~（已实测：不算，只有 t2a 合成才算）。
- 音色在同账号不同 key 之间能不能用。**未测**：渠道清单里每家只有一个 key。
- ~~千问声音设计的 HTTP 写法~~、~~合成返回的音频 URL 有效期~~（已实测：24 小时）。千问合成单价（国内）接口不返回金额，只有 `usage.characters` / tokens，需在百炼控制台账单核对。
- ~~千问声音克隆的 HTTP 写法~~（已实测：同一 customization 接口，`audio` 传 URL 或 base64）。
- ~~读取 `output.audio.url` 嵌套字段~~（已实测：合成返回结构确认，代码里按路径读取即可）。

## 已确认（2026-10-09）

1. 克隆、设计积分在创建成功时扣。
2. MiniMax 音色 7 天未用被上游删除，不退积分。
3. 默认汇率 7.1。
4. 不分期，一期做完。
5. （2026-10-29）积分按全局积分单价自动换算，不在渠道里直接填积分。
6. （2026-10-29）上游接口用专用测试 key 实测，实测完再写上游调用代码。

## 实测记录

### 千问声音设计（2026-10-09，国内 `dashscope.aliyuncs.com`，测试音色已删除）

所有操作都是 `POST https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization`，`Authorization: Bearer <key>`，body 里固定 `"model": "voice-enrollment"`，用 `input.action` 区分。

| action | 请求 input | 返回 output | 结果 |
|---|---|---|---|
| `create_voice` | `target_model`、`voice_prompt`、`preview_text`、`prefix`、`language_hints: ["zh"]`；`parameters: { sample_rate: 24000, response_format: "wav" }` | `voice_id`、`preview_audio: { data (base64), response_format, sample_rate }` | 200，同步返回，耗时 7.5 秒；试听为 RIFF wav，约 190KB |
| `query_voice` | `voice_id` | `voice_id`、`status`（`OK`）、`target_model`、`voice_prompt`、`preview_text`、`resource_link`、`gmt_create`、`gmt_modified` | 200，创建后立即为 `OK` |
| `list_voice` | `prefix`（可选）、`page_size`、`page_index`（从 0 开始） | `total_count`、`voice_list[]`（字段同 query，不含 resource_link） | 200 |
| `delete_voice` | `voice_id` | 空对象 | 200，删除后 list 立即为空 |

结论：

- 声音设计是同步的，创建即可用，不需要轮询。克隆需要轮询（已实测，约 12 秒，见下文），用同一路径的 `query_voice`。
- 四个操作同一路径，渠道配置里千问只需配一个 `customizationPath`，不用分 create / status / delete 路径。
- 所有返回都带 `usage.count: 1` 和 `request_id`，`request_id` 记入日志便于对账。
- `resource_link` 是上游 OSS 地址，不直接给前端，试听用我们转存的文件。

### 千问声音克隆 + 合成（2026-10-29，国内，测试音色保留未删）

参考音频：百炼官方样例 wav，18.9 秒，单声道 48kHz，1.8MB。

| 步骤 | 请求 | 结果 |
|---|---|---|
| 克隆（URL） | 同 customization 路径，`action: "create_voice"`，`target_model`、`prefix`、`audio`（公网 URL）、`language_hints` | 200，2.5 秒返回 `voice_id`（格式 `{target_model}-{prefix}-{32 位}`，没有 `-vd-`），`preview_audio` 为空对象 |
| 克隆（base64） | `audio: "data:audio/wav;base64,..."` | 同上，可用 |
| 部署状态 | `query_voice` 每 3 秒一次 | 两次都是约 12 秒从 `DEPLOYING` 变为 `OK` |
| 合成 | `POST /api/v1/services/audio/tts/SpeechSynthesizer`，`model`、`input: { text, voice, format, sample_rate }` | 200，1.8 秒；`output.audio.url` 是 wav 下载地址，`expires_at` 距当前正好 24 小时；`output.audio.data` 为空 |
| 用量 | 19 个汉字 | `usage: { characters: 38, input_tokens: 20, output_tokens: 64 }`，汉字按 2 字符计 |
| 跨模型 | flash 克隆的音色用 `qwen-audio-3.1-tts-plus` 合成 | 200，能用（与文档"必须一致"不符，仍按绑定模型使用，不依赖这个行为） |
| 系统音色 | `longanhuan_v3.6` 配 `qwen-audio-3.1-tts-flash` | 400 `InvalidParameter`，该音色不属于此模型 |

结论：

- 克隆需要轮询：创建后 `status = creating`，按 `query_voice` 轮询到 `OK` 再置为 `ready`，`UNDEPLOYED` 置为失败（审核未通过）。超时建议 60 秒。
- 克隆不返回试听，界面上的试听需要克隆成功后用合成接口生成一段（按合成计费）。
- 合成结果字段在 `output.audio.url`（嵌套），音频 URL 24 小时过期，必须马上转存。
- 前端上传的音频可直接转 base64 Data URI 传给上游，不需要先放到公网。

### MiniMax 克隆 + 设计 + 合成（2026-10-29，国内 `api.minimaxi.com`，测试音色保留未删）

| 步骤 | 请求 | 结果 |
|---|---|---|
| 上传 | `POST /v1/files/upload`，multipart：`purpose=voice_clone`、`file` | 200，0.6 秒，返回 `file.file_id`（数字） |
| 克隆 | `POST /v1/voice_clone`，`file_id`、`voice_id`（自定）、`text`、`model: "speech-2.8-hd"` | 200，6.1 秒；带 `text` 时返回 `demo_audio`（OSS URL，48 小时过期）和 `extra_info.usage_characters` |
| 设计 | `POST /v1/voice_design`，`prompt`、`preview_text` | 200，12.5 秒；返回 `voice_id`（上游生成，格式 `ttv-voice-{时间}-{8 位}`，我们不能命名）和 hex mp3 `trial_audio`；`charge_method: "voice_design"` |
| 合成 | `POST /v1/t2a_v2`，`voice_setting.voice_id` 用克隆/设计的 ID | 都是 200，约 1.5 秒；`extra_info.usage_voice_count: 1`（应是 9.9 元音色费在这次扣） |
| 音色列表 | `POST /v1/get_voice`，`voice_type: "all"` | 合成前克隆、设计音色都**不在**列表里；首次合成后才出现在 `voice_cloning` / `voice_generation` |

结论：

- 设计的 voice_id 由上游生成，第 3 节"平台生成 upstreamVoiceId"只适用于 MiniMax 克隆；设计要存上游返回值。
- 克隆时带试听不算"使用"：试听后音色仍不在列表中，只有 t2a 合成后才出现。7 天删除风险仍在。
- 未合成的音色在 `get_voice` 里查不到，不能用它判断音色是否存在或已过期。
