# v0.8.19：热更新写回源码 + 节点错误提示显示上游真实原因

> 2026-10-25。生产当前 `sha-232737aa`（v0.8.18）+ 10-23 热更新。热更新记录见 `docs/reports/2026-10-23-prod-hotpatch-log.zh-CN.md`。

## 1. 发版基线

- 从 `main`（232737aa）拉 `release/v0.8.19`，**不从 develop 拉**：develop 上有 35+ 个 gamma-ui 迁移提交，没进过生产，不混进这次。
- 发版后合回 `develop`。
- 生产发布前必须先过测试环境，推生产由用户确认。

## 2. 热更新写回源码

行为与生产热更新完全一致，只是改写成源码。

| 编号 | 位置 | 改法 |
|---|---|---|
| HP-1 | `web/src/app/api/image-tasks/image-task-support.ts` 的 `resolveImageBase64Like`、`rawImageBase64DataUrl` | 正则 `/^[a-z0-9+/=_-]+$/i` 换成逐字符检查 `isBase64Text`（已在 `fix/b64-regex-overflow` 写好，未提交） |
| HP-2 | 新增 `parseBase64DataUrl`（indexOf 切分，返回 mime 和数据），替换所有 `/^data:([^;,]+);base64,(.+)$/` 写法：`generation-log-repository.ts:95`（报错路径）、`image-task-support.ts:829/898`、`server-media-storage.ts:139`、`text-task-runtime.ts:492`、`globalaiopc-proxy.ts:144/158`、`text-planning-runtime.ts:319`、`tuzi-asset-service.ts:99` | 热更新只替换了编译产物里 `.match(/^data:([^;,]+);base64,(.+)$/)` 这一种写法；源码把 `/s`、`.exec` 等同类写法一起改掉 |
| HP-3c | `web/src/lib/server/image-result-media-reader.ts` | 拿到响应头后重设计时：`min(600s, 30s + content-length ÷ 0.1MB/s)`；没有 content-length 仍 30s |
| HP-3b | `web/src/app/api/ai/system/[channelId]/[...path]/route.ts:60` `SYSTEM_MEDIA_TIMEOUT_MS` | 30s → 600s（外层读取已按大小限时） |
| HP-4 | `tuzi-asset-service.ts` + `video-generation-route.ts` | 合入 `hotfix/tuzi-asset-model`（88b696b9）：上传带 `model`、`name`，缓存按模型分开，审核 `failed` 重提最多 3 次。生产正在跑这段，不带会被冲掉；兔子没开素材渠道前不生效 |

测试：

- HP-1/HP-2：30MB 的 base64 / data URL 不爆栈，结果与原正则一致（含非法字符、缺 `;base64`、空数据）。
- HP-3c：模拟慢响应，带 content-length 时 30s 后不中止、到按大小算的期限才中止；不带时 30s 中止。
- HP-4：分支自带测试。

## 3. 节点错误提示

现状：`web/src/lib/generation-feedback-message.ts` 的 `generationUserMessage` 把原始错误映射成 8 条固定文案，匹配不上的统一显示「网络异常，请点击重试」。

改法：

- 用户能自己处理的原因（审核、真人、参数不合规），显示**具体原因的中文说明**，能取到的细节一并带上（第几张参考图、上限多少秒、支持哪些分辨率）。
- 上游内部原因（欠费、限流、资源紧张、我们自己的程序错误）继续显示通用文案，不暴露上游信息。
- 原始错误仍只写控制台和诊断日志。
- 具体哪些显示、哪些不显示，由用户在清单上确认后写入本节。

<!-- 用户确认后补：显示 / 不显示清单与文案 -->

## 4. asset not found

结论见 `docs/ops/findings/2026-10-25-1900-mohui-asset-not-found.zh-CN.md`：模汇服务端转换素材后火山查不到，属模汇瞬时问题，代码不改，提示按「上游内部」处理。
