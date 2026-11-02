# 千问音色全量列表、参数提示遮挡修复、MiniMax 音乐接入评估

日期：2026-10-09

## 1. 参数提示（Tooltip）被面板遮住

**现象**：千问参数面板里“指令”旁的问号提示显示在面板下面，看不全（截图 62）。

**原因**：画布设置面板是自写的 portal（`canvas-settings-popover-shell.tsx`，zIndex 1200），不是 antd 的 Popover/Modal，antd 不会自动抬高子浮层的层级。antd Tooltip 默认 zIndex 1070，所以被盖住。面板里的 Select 已经用 `zIndex: 1305` 修过同样的问题（`audio-settings-panel.tsx:69`、`:177`），Tooltip 漏了。

**改法**：`AudioParamControl` 里的 `<Tooltip>` 加 `zIndex={1305}`。MiniMax 的“音高/强度/音色调节”提示也走这个组件，一并修好。

## 2. 千问音色补全

### 现状与官方数量对比

来源：[Qwen-Audio-TTS 音色列表](https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list)，页面表格 + 两个“基础音色”Excel 附件。

| 模型 | 当前代码 | 官方 | 说明 |
|---|---|---|---|
| qwen-audio-3.1-tts-plus | 4 | 4 | 官方只有 4 个旗舰音色，已齐 |
| qwen-audio-3.1-tts-flash | 21 | 139 | 多语种与方言 4、精品中文 42、精品英文 15、其他系统音色 27、小语种 51 |
| qwen-audio-3.0-tts-plus | 2 | 2 + 597 | 597 个基础音色在 Excel 附件里 |
| qwen-audio-3.0-tts-flash | 9 | 12 + 597 | 同上，基础音色与 plus 同名，ID 前缀不同 |

你说的“两百多种”应该就是基础音色这部分，实际是 597 个，只给 3.0 两个模型用，ID 形如 `qwen-audio-3.0-tts-flash-longcanzhuyue`、`qwen-audio-3.0-tts-plus-longcanzhuyue`。

### 已实测（用百炼渠道密钥直连，均返回 200 和音频 URL）

- `qwen-audio-3.0-tts-flash` + `qwen-audio-3.0-tts-flash-longcanzhuyue`（基础音色）
- `qwen-audio-3.0-tts-plus` + `qwen-audio-3.0-tts-plus-longcanzhuyue`（基础音色）
- `qwen-audio-3.1-tts-flash` + `qwen-audio-3.1-tts-flash-lumen_la`（小语种·拉丁语）
- `qwen-audio-3.1-tts-flash` + `Emily_v3.1`（精品英文）

### 实现

1. 新增 `web/src/lib/qwen-voice-catalog.ts`，存放从官方页面和 Excel 解析出的数据：
   - 3.1 / 3.0 页面表格里的音色：按模型存 `{ id, name, gender, trait, category }`。
   - 597 个基础音色只存一份 `{ slug, name, gender, age, trait, scene, lang }`，运行时拼上模型前缀生成 ID，避免 plus/flash 各存一遍。
   - 文件头注明来源 URL 和抓取日期。
2. 新增 `web/scripts/gen-qwen-voice-catalog.mjs`：下载官方页面和 Excel，重新生成上面的文件。官方更新音色时跑一次即可，不进构建流程。
3. `audio-model-params.ts` 的 `qwenVoiceOptionsByModel` 改为从目录生成：
   - 下拉框按分类分组（antd Select 的 options 分组）：旗舰 / 多语种与方言 / 精品中文 / 精品英文 / 其他 / 小语种（按语种）/ 基础音色。
   - 标签格式：`名称（性别·特质）`，小语种显示 `名称（语种·性别）`。
   - 下拉框已开 `showSearch`，搜索范围扩到名称、特质、语种，600 个选项也能快速找到。
   - 默认音色保持现有值不变，已有画布节点保存的 voiceId 不受影响。
4. 体积：约 750 条记录，预计 40KB 左右（gzip 后约 10KB）。`audio-model-params.ts` 在客户端加载，体积可接受，暂不做懒加载。

### 试听

官方有试听音频，分两类（已核对）：

| 来源 | 数量 | 位置 | 能否直接播放 |
|---|---|---|---|
| 页面表格音色（3.1 plus/flash、3.0 plus/flash 页面列出的） | 157 个，全部有试听；其中 74 个有多段（如多语种音色分重庆话、韩语等） | `https://g-adoc.alcasset.com/media/maas_docs/...wav`，单个约 500KB | 能：返回 `audio/wav`，`Access-Control-Allow-Origin: *`，带外站 Referer 也返回 200；我们的 CSP `media-src` 已允许 https |
| 597 个基础音色 | 597 个全部能对上（Excel 的“预览音频文件名”列） | 只在官方“基础音色试听音频包”zip 里（214MB，1025 个 wav，平均 272KB；多出的 428 个不在 Excel 里，不用） | 不能，没有在线地址，需要我们自己存 |

做法：

1. 目录里每个音色带 `preview` 字段：页面音色存官方链接（多段时存第一段）；基础音色存文件名，运行时拼成我们的地址。
2. 基础音色：新增脚本 `web/scripts/backfill-qwen-voice-previews-to-oss.mjs`，从官方 zip 取出 597 个 wav 上传到 OSS（`<prefix>/qwen-voice-previews/<文件名>.wav`，约 160MB，跳过已存在的），配置读取方式与 `backfill-prompt-images-to-oss.mjs` 相同。新增公开路由 `/api/public/qwen-voice-previews/[file]`：文件名必须在目录里，否则 404；命中则 302 到 OSS 签名地址，缓存 1 天。
3. 界面：音色下拉每一项右侧加播放按钮，下拉框旁边也放一个，用来试听当前选中的音色。同一时间只播一个，再点一次停止；点播放按钮不会选中这一项，也不会关掉下拉框。
4. 不转码：本机没有 ffmpeg，wav 单个几百 KB，点了才加载，可以接受。

### 测试

- 试听单测：每个音色都有 preview；基础音色路由对不在目录里的文件名返回 404，在目录里的返回 302 到签名地址；OSS 未启用时返回 404。
- 单测：每个模型的音色数量与官方一致（4 / 139 / 599 / 609）；3.0 基础音色 ID 前缀与模型匹配；跨模型音色不会出现在别的模型列表里；旧的默认值仍然有效。
- 浏览器：打开千问面板，确认分组显示、搜索可用、提示不再被遮挡。

## 3. MiniMax 自定义音色：先写代码，充值后实测

同意。克隆/设计的代码按 `2026-10-09-custom-voice-minimax-qwen.zh-CN.md` 继续写，用本地 fixture server 模拟上游响应跑单测和集成测试；充值后再在测试环境做真实调用，补测试记录。上线前必须完成真实实测。

## 4. MiniMax 音乐模型：目前无法通过官方 API 接入

### 公告原文（[MiniMax 音乐生成文档](https://platform.minimaxi.com/docs/guides/music-generation)）

> 自 2026 年 8 月 20 日起，付费接口（音乐生成、歌词生成）不再面向新用户提供服务，历史付费用户可继续使用现有 API 服务；免费音乐生成接口（Music-3.0-free、Music-2.6-free、music-cover-free）停止服务。如需体验或使用音乐生成能力，可前往 MiniMax Audio，或使用已发布在 Hugging Face 和魔搭 ModelScope 的 MiniMax Music 3 开源模型。

### 实测

用渠道清单里的 MiniMax 密钥调用 `/v1/music_generation`，`music-3.0` 和 `music-2.6` 都返回 HTTP 410，`status_code: 2153`，提示 “no longer available to new users”。说明这个账号不算历史付费用户。

### 可选路径

| 路径 | 可行性 | 说明 |
|---|---|---|
| A. 找历史付费账号或代理商 | 可行，成本最低 | 如果有渠道商（modelbay、兔子、向量引擎等）是 8 月 20 日前的付费用户，可以转售 music-3.0。测试环境现有渠道里只有 Suno，没有 MiniMax 音乐模型。接口格式已清楚（`/v1/music_generation`，返回 `data.audio`，`output_format: url` 时链接 24 小时有效），接入工作量小，复用现有 minimax 协议即可 |
| B. 自部署 MiniMax Music 3 开源模型 | 可行，成本高 | 需要 GPU 服务器（例如阿里云 PAI-EAS 或魔搭推理服务），显卡规格和单首成本要看模型卡再评估；还要自己写推理服务接口 |
| C. MiniMax Audio 网页产品 | 不可行 | 面向终端用户的网页，没有开放 API |

**建议**：先问现有渠道商有没有 music-3.0 / music-2.6 / music-cover；有的话按路径 A 接入，我只需要新增渠道模型映射。没有的话音乐继续用 Suno，路径 B 等有明确需求再单独立项。

## 5. 本次改动范围

需要你确认后再动手：

- [ ] 第 1 节：Tooltip 层级修复
- [ ] 第 2 节：千问音色全量目录 + 分组下拉 + 生成脚本 + 单测
- [ ] 第 3 节：MiniMax 自定义音色代码（按已有规格），真实实测等充值

第 4 节只是评估，不改代码。
