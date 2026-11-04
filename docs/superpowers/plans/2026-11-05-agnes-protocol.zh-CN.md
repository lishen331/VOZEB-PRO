# Agnes 显式渠道协议实施计划

日期：2026-11-05。用户授权：新增 Agnes 协议并重新配置现有渠道，文本、图片、视频按官方 API 文档实现。未授权 push/merge/deploy；旧镜像不识别新协议时不提前改测试环境持久化配置。

## 接口契约

- 文本：OpenAI Chat Completions JSON，保留 messages、视觉输入、工具调用与 SSE；不自动加隐藏提示词。
- 图片：`POST /v1/images/generations` JSON。文生图/编辑共用端点，参考图为 `image: string[]`，尺寸档位 `size`、比例 `ratio`，不传 `quality` 或 multipart edits。
- 视频：`POST /v1/videos` JSON。`mode=text/keyframe/reference`；`seconds` 为 4–12 的字符串；`size=720P/1080P/1K/2K`，比例为 `aspect_ratio`；Flash 只允许720P、最多5图3音频且不允许视频。标准版最多8图3音频1视频，不静默丢弃或截断素材。
- 创建响应必须保存查询用 `video_id`；使用根路径 `/agnesapi?video_id=...&model_name=...`。不把异步 task_id 冒充 video_id。
- 主状态采用顶层 status/progress/url，不受 internal_status/internal_progress 干扰。上游余额不足/队列满保留错误，不承诺配置能解除余额或队列限制。

## 文件与步骤

- [ ] 在 `store-types.ts`、`store-normalizers-channel.ts`、`channel-protocol-registry.ts` 注册 `agnes`；后台沿用统一注册表，无专门 UI 重构。
- [ ] 补 `agnes-protocol.test.ts`、`agnes-video-provider.test.ts` 与图片真实本地 HTTP fixture 的 RED；先跑失败证据再完善。
- [ ] 复用文本引擎、图片 declarative parser/持久化；新增专用图片请求构造，保留图片顺序、原始提示词与实际分辨率。
- [ ] 改造已有临时视频适配：显式协议、请求验证、队列与生产两条路径一致、video_id和查询正确。
- [ ] 更新官方模型目录（包括2.5图片与已上线文本，移除废弃推荐但不删除管理员已有模型绑定）。应用协议时保留渠道ID、凭据、启用开关、练习池和现有模型列表。
- [ ] 本地协议 fixture、专项 Vitest、tsc、eslint/prettier、全量检查与开发文档验证；所有失败准确报告。
- [ ] 给出渠道切换步骤/配置预览；未部署支持agnes的新镜像前不得把运行中渠道直接切换。

## 当前实现结果

- 已注册 `agnes` 显式协议，后台协议列表不再显示为 OpenAI；保留渠道 ID、密钥、生产/练习开关和已有模型绑定。
- 已更新 Agnes 官方模型目录：`agnes-2.5-flash`、`agnes-2.5-pro`、`agnes-image-2.0/2.1/2.5-flash`、`agnes-video-2.5/2.5-flash`。
- 文本走 Chat Completions；图片走 `/images/generations` JSON，使用 `image[]`、`size`、`ratio`，不发送 OpenAI `quality`；视频使用 `mode`、`seconds`、`size`、`aspect_ratio`、参考媒体和 `video_id` 查询。
- 已增加本地 TCP fixture，验证图片 JSON 请求和视频创建/查询完整链路。
- 专项 62 项、文本/视频/图片相关回归 110 项通过；TypeScript、ESLint、Prettier 通过。

尚未完成线上配置切换、真实 Agnes 余额/队列验收、commit、push、merge 或 deploy。

## 文档依据

官方：`https://wiki.agnes-ai.com/zh-Hans/docs/overview.md`、`agnes-25-flash.md`、`agnes-25-pro.md`、`agnes-image-21-flash.md`、`agnes-image-25-flash.md`、`agnes-video-25.md`、`agnes-video-25-flash.md`。仅官方文档与本地 fixture；本轮不反复调用付费真实模型。
