# 10-23 栈溢出（保存阶段）、media_timeout、兔子素材实测

## 1. 栈溢出换了位置（f8941f86，10:53）

- 生产 v0.8.18 + 10:05 热更新，容器之后没重启
- 模汇返回的是 URL（B 项生效），从 `img.vakv.cn` 下载完成：4,845,326 字节，1824×1024 PNG
- 事件顺序：`result_media_complete` → `result_persist_start` → `result_persist_failed`（`Maximum call stack size exceeded`）
- 爆在保存结果阶段，不在热更新改过的 `rawImageBase64DataUrl`
- 诊断里没有调用栈，日志里没有 `[media-stack]`：保存阶段的异常没走 `traceMediaException`
- 待办：正式修复要覆盖保存阶段（查 persist 路径上对大 base64/大 Buffer 的正则或展开调用），并给保存阶段加栈日志

## 2. media_timeout（c6362ff7 10:08、53de6a90 11:34、9ef39ee3 11:44）

- 都是 gpt-image-2-c 图生图，模汇渠道，结果图在 `img.vakv.cn`
- 响应头 1.4 秒到，`contentLength` 4.8MB～18.7MB；30 秒内只收到几 KB（2,195 / 8,351 字节），`AbortError` 超时
- 原因是模汇图床下载慢，不是解析问题
- 另一会话 11:54 打了 HP-3（超时按文件大小放宽，见 `docs/reports/2026-10-23-prod-hotpatch-log.zh-CN.md`）
- 15:00～15:50 又集中出现：`img.vakv.cn` 6 次全失败（12～57KB/s，等到 78～207 秒仍没下完），`img.apimatou.cc` 3 次全失败，`img.ksidc.icu` 全成功。放宽超时救不了这个速度，要模汇处理图床
- 16:00 之后没再出现

## 3. 兔子真人素材实测（11:50 左右，生产令牌，非人像图）

- 上传带 `model=doubao-seedance-2-0-260128`：200，拿到 `asset://`
- 第一次审核 failed（素材适配器已变更或不可用），重新提交审核 6 秒后 `active`
- `asset://` 提交 4 秒 480P 视频：约 3 分钟 completed
- 昨天的"素材地址未返回可下载文件"没再出现
- 结论：本地分支 `hotfix/tuzi-asset-model`（上传带 model + 审核失败重提）可以继续推进

真人图复测（11:56，用户提供的真人自拍，2160×3840 PNG 9.6MB）：

- 上传带 model：200（21 秒）
- 第一次审核 failed（素材适配器已变更或不可用），重提后 6 秒 `active`
- `asset://` 提交 4 秒 480P 视频：约 4 分钟 completed，出片成功
- 测试图已从服务器和容器删除
- 结论：真人参考图走"上传带 model + 审核失败重提 + asset://"能出片。第一次审核必失败（两次实测都是），重提是必需的

## 4. 巡检漏报（13:35 发现并修复）

- 原因 1：Monitor 30 分钟到期后，`mon-loop.sh` 进程没停，到 13:35 有 7 个循环同时跑，共用 `mon-seen.txt`。旧循环先把新失败记成"已见"，输出却进了已到期的 Monitor，新 Monitor 收不到
- 原因 2：`mon-check.sh` 的栈溢出计数只认 `provider_exception`+`RangeError`，不认保存阶段的 `result_persist_failed`，也不认 URL 下载的大图
- 修复：`mon-loop.sh` 写 `mon-loop.pid`，旧实例发现 PID 不是自己就退出；`mon-check.sh` 计数加上 `Maximum call stack` 和 `result_media_upstream_body_complete`，起点改为 11:54。备份 `*.bak-1023`

10:00～13:35 实际失败（补查数据库）：

| 类型 | 次数 | 时间 | 说明 |
|---|---|---|---|
| 栈溢出 | 10 | 10:48～11:46 | 模汇 gpt-image-2-c/all、兔子 gpt-image-2、gpt-image-2.5-sunburst。11:54 另一会话的栈溢出补丁重启后 0 次 |
| 真人参考图被拒 | 约 18 | 10:50～11:51 | 模汇和兔子的 seedance 都有 |
| media_timeout | 约 13 | 全天 | 模汇 `img.vakv.cn` 下载慢 |
| `The specified asset ... is not found` | 6 | 11:42～11:49 | 模汇 doubao-seedance-2-0，`content[1]` 是数字素材 ID，未查 |
| 提交阶段中断 | 5 | 11:49～11:54、12:18 | 和热更新重启时间重合 |
| ModelBay flare `response_format` | 2 | 11:51～11:52 | 待办 6，未修 |
| 其他 | 3 | | 12:07 media_http_error 401；11:52 兔子 seedance 2.5 响应超时；11:27 兔子提示词被判违规 |

## 5. 课上其他失败

- 10:58 `ab22127d`、11:13 `5cea836a`（模汇）、11:18 `599390ba`（兔子）：参考图被上游判定可能含真人
- 11:44 `fa6626b3`：`content[1].image_url.url` 无效（`asset ... is not found`），未查
- 15:14 `92e08666`：参考**视频**被判真人（`InputVideoSensitiveContentDetected.PrivacyInformation`）。该参考视频是 15:03 `17a0b8de`（模汇 doubao-seedance-2-0）生成的写实风格结果，不是用户上传
- 15:14 `106c9fef`、15:45 `8465b267`：同一节点换 ModelBay official/seedance-2，上游返回 `does not accept reference video input`；节点显示"网络异常，请点击重试"，学生点了重试
- 15:45～15:48 兔子 5 次 `405 Not Allowed`（nginx HTML，提交 `/v1/videos` 时），我们显示成"生成渠道暂时无法连接"。15:50 实测兔子已恢复
- 15:50 `fb5c2a1d`：模汇余额不足（剩 ¥9.45，需 ¥11.94）
