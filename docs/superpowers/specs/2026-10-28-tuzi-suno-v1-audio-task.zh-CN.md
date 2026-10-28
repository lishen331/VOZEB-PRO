# 兔子 Suno v1 音乐生成接入（开发文档）

日期：2026-10-28
状态：已确认，代码已实现（分支 `feat/tuzi-suno-v1`），待测试环境实测

## 目标

画布音频节点选 Suno 模型时，能通过兔子渠道真实生成一首歌，结果存进我们的媒体库。只接兔子 v1 接口（`/suno/submit/music` + `/suno/fetch/{id}`）。

不做：Suno v2（chirp-v6，10-28 实测三次全部 503 / model_not_found）、modelbay 的 `suno/v6*`、续写和上传音频、歌词生成接口 `/suno/submit/lyrics`、一次返回两首里的第二首。

## 先查了有没有别人做过

- `git fetch` 后搜 `origin/develop`、`origin/main`、全部远端分支：唯一相关提交是 `0d0f2266`（画布音频面板按模型展示 Suno 参数），只有前端参数，没有协议。
- `gh pr list --search suno`：无。
- 设计文档 `2026-10-16-canvas-audio-node-models.zh-CN.md` 第 49 行计划过新增 Suno 异步协议，但没有实现。
- 结论：没有现成修复，在 `0d0f2266` 的基础上继续。

## 实测依据（10-28，生产兔子渠道 key，脚本 `D:\tmp\vz-mon\prod-suno-probe.sh`）

- 提交：`POST https://api.tu-zi.com/suno/submit/music`，body `{"prompt":"","gpt_description_prompt":"…","make_instrumental":true,"mv":"chirp-v3-5"}`，不带 `model` 字段。
- 提交返回：任务 ID 是字符串 `data` 本身，不是 `data.task_id`。
- 查询：`GET /suno/fetch/{id}`，返回 `{code, data:{status, progress, fail_reason, data:[{audio_url,…}]}}`。
- 约 68 秒到 `SUCCESS`，每次提交约 $1.14，一次出两首。
- 文档列出的状态没有完整枚举，没有错误码。

## 现有代码对不上的地方

| # | 位置 | 问题 |
|---|---|---|
| 1 | `audio-task-runtime.ts` 提交后读任务 ID | 用 `readProviderString(data, undefined, ID_KEYS)`，不读 `taskIdField`。兔子返回 `data:"<id>"`，`data` 不在 ID_KEYS 里，会报"没有返回音频或任务 ID"并按"结果未知"处理。 |
| 2 | 系统代理 `targetUrl`（`api/ai/system/[channelId]/[...path]/route.ts:805`） | 非字面路径协议会走 `normalizeApiBaseUrl`，按 OpenAI 习惯补 `/v1`，变成 `/v1/suno/submit/music`，兔子不认。需要加进 `usesLiteralPath` 列表。 |
| 3 | 查询结果判定 | 现在只要读到 URL 就当完成。Suno 在 `streaming` 阶段 `audio_url` 可能已经有值（边生成边播的流地址），会存下半首歌。新协议必须等 `status=SUCCESS` 才取结果。 |
| 4 | 失败原因 | 兔子把原因放在 `data.fail_reason`，`ERROR_KEYS` 里没有，失败时只会显示"音频生成失败"。 |
| 5 | 渠道配置 | 兔子的 `suno_music` 目前套的是 OpenAI TTS 模板（`/audio/speech`），发不出正确请求。 |
| 6 | 描述模式的 `prompt` | 如果模板里写 `"prompt":"{{prompt}}"`，描述模式会同时带上 `prompt` 和 `gpt_description_prompt`，Suno 可能把描述当成歌词唱出来。 |

## 方案

### 1. 新增协议 `tuzi-suno`（`lib/channel-protocol-registry.ts`）

照 `tuzi-image-task` 的写法加一条严格协议，只有 `audio` 能力：

| 字段 | 值 |
|---|---|
| createPath | `/suno/submit/music` |
| queryPath | `/suno/fetch/:task_id` |
| taskIdField | `data` |
| statusField | `data.status` |
| resultField | `data.data.0.audio_url` |
| requestTemplate | `{"model":"{{model}}","mv":"chirp-v3-5"}` |

协议 ID 同步加到 `store-types.ts`、`store-normalizers-channel.ts`、`use-config-store.ts` 三处联合类型和白名单。

### 2. 系统代理按字面路径转发

`route.ts` 的 `usesLiteralPath` 加上 `tuzi-suno`，避免被补成 `/v1/suno/...`。

### 3. 音频运行时（`lib/server/audio-task-runtime.ts`）

- 提交后读任务 ID：先读 `advancedConfig.taskIdField`，读不到再退回 `ID_KEYS`。现有协议没有配 `taskIdField`，行为不变。
- 查询时如果协议是 `tuzi-suno`：只有状态属于完成集合（`success / succeeded / completed / complete`）才取结果 URL；状态在失败集合就失败；其余一律继续轮询。其他协议保持"读到 URL 就完成"。（实现时从"配了 `statusField` 就生效"收窄到只对 `tuzi-suno` 生效，因为 RunningHub 和自定义渠道已经在用 `statusField`，按字段判断会改变它们的行为。）
- 失败原因改用 `readProviderError(data)`，它已经优先读 `fail_reason`。

### 4. Suno 请求字段（`lib/audio-model-params.ts`）

描述模式补一个空的 `prompt: ""`，和实测成功的请求一致，避免模板里的 `{{prompt}}` 把描述当成歌词。歌词模式不变。

### 5. 渠道配置（数据，不是代码）

测试环境后台把兔子渠道的 `suno_music` 改成 `tuzi-suno` 协议，并在定价里给它设音频点数。生产环境的同样修改等发布审批时一起做。

## 风险

- 请求体带 `model` 字段兔子会不会拒：实测时没带。我们的代理靠 body 里的 `model` 做渠道模型校验，所以先带上，测试环境第一次真实请求就能确认；如果兔子拒绝，改成代理按路径识别模型。
- 状态枚举没有官方文档。没见过的状态一律按"处理中"轮询，靠已有的任务超时兜底，不会误判成功。
- `audio_url` 在 `cdn*.suno.ai`，走现有 `/_media` 代理下载，不带兔子的鉴权头。
- 一次出两首只存第一首，第二首的费用照样产生。要不要两首都存，后面再定。

## 验证

- 单测（`audio-task-runtime.test.ts` 和协议注册表测试）：
  - 提交返回 `{"code":"success","data":"abc"}` 时取到 ID `abc`。
  - `IN_PROGRESS` 且带 `audio_url` 时继续轮询，不完成。
  - `SUCCESS` 时取 `data.data[0].audio_url`。
  - `FAILURE` 时错误文案是 `fail_reason`。
  - 老协议（没配 `statusField`）读到 URL 仍然直接完成。
  - `tuzi-suno` 的目标 URL 不带 `/v1`。
- `pnpm typecheck`、`pnpm lint`、`pnpm test`。
- 推 `develop` 部署测试环境后，画布真实生成一首纯音乐（约 $1.14），确认能播放、进媒体库、扣点正确；再请 Codex 在测试环境复核一遍。
- 生产发布单独等审批。
