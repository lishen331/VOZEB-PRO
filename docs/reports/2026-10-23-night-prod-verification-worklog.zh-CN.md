# 2026-10-23 夜间生产验证工作记录

> 执行：Claude（会话 vozeb-pro-aa）。用户 10-23 约 03:30 授权：用学生账号在生产真人测试，修复后可自行推测试和生产，只推本次修改的文件。
> 本文件按时间顺序追加，不回改历史条目。时间为北京时间。

## 0. 起点（03:30 核实）

- 生产：`sha-232737aa`（PR #62，v0.8.18），app 03:00:44、worker 03:00:59 启动，restart=0。
- 测试：`sha-01c1f6d1`（origin/develop 最新）。
- v0.8.18 相对昨天生产 `bc2643a5` 新增：
  - `7cb3c703` 视频参考图 300–6000px 等比调整 + 前端确认框/黄框（P1-2）
  - `6f1e046b` 图片结果媒体授权按实际模型签名（P0-2）
  - `642a325f` 程序异常落调用栈（P0-1 诊断）
  - `b287d87e` 按模型显式 URL 返回格式、不再自动换格式重生（P1-1 部分 / 模汇 URL）
- 生产配置：模汇 `gpt-image-2-all`、`gpt-image-2-c` 已配 `imageResponseFormat=url`（其他会话做的）。

## 1. 部署后（03:00 起）生产只读核查

- RangeError：部署后应用/Worker 日志 0 行，库内 0 个任务；最后一次在 10-22 18 点。
- 部署后学生 25990032 跑了约 20 个图片任务（gpt-image-2-all / -c / gpt-image-2），全部成功。
- 部署后失败的 5 个图片任务都是 ModelBay `用户额度不足`（用户确认 ModelBay 没钱）。
- 21:00 之后的视频失败（部署前）：模汇旧 key 余额不足 12 个、ModelBay 素材 403 7 个、兔子真人审核 7 个、cdance2.0-fast r2v 分辨率 3 个、参考图 300px 2 个。
- 用户 03:3x 告知：模汇有钱（key「无限画布测试」剩约 ¥199），ModelBay 没钱。

## 2. 前端实际启用（有启用绑定）的图片/视频模型（03:40，学生账号 `/api/model-catalog`）

| 类型 | 逻辑模型 | 渠道 |
|---|---|---|
| 图片 | gpt-image-2 | 兔子 |
| 图片 | gpt-image-2.5-sunburst | 兔子 |
| 图片 | gpt-image-2-all、gpt-image-2-c | 模汇 |
| 图片 | gpt-image-2-5-flare、gpt-image-2-5-sunburst、gpt-image-2-image-to-image、gpt-image-2-text-to-image | ModelBay（无余额） |
| 视频 | doubao-seedance-2-0 | 模汇 |
| 视频 | doubao-seedance-2-0-260128、doubao-seedance-2-5-260628 | 兔子 |
| 视频 | official/seedance-2、official/seedance-2-5 | ModelBay（无余额） |
| 视频 | cdance2.0-0807、cdance2.0-fast-0807、cdance2.0-mini-0807 | 天翼云 |

积分：每次调用扣 1 分，失败退回。学生余额 16–85 分。

## 3. 测试方法

- 账号：学生 25990032（吴棋锋，起始 42 分）。浏览器用 playwright-cli 真实登录（勾选条款、点登录），在画布里真实点击节点、参数面板和「生成」按钮。
- 测试画布：脚本 `D:\tmp\vz-night\mkcanvas.mjs` 调用户自己的 `/api/canvas/projects` 新建画布，复用该学生昨天课上画布 `canvas-vW8xCe_Jkhg3yBHV_Lhus` 的 5 张原图（含 499×280、511×281 两张小截图），每张图都连线到同一个视频节点，提示词里用 `图片1/图片2/图片5` 引用。和课上结构一致：多图 → 连线 → 视频节点 → @图片N。
- 不改学生原有画布；所有测试画布标题以「夜测-」开头，记录在 `D:\tmp\vz-night\canvases.log`。
- 结果核对三处：生产库任务表（状态/上游状态/诊断）、画布节点回写（`nodechk.mjs`）、浏览器截图。

## 4. P1-2 视频参考图 300px（`7cb3c703`）

| 时间 | 模型 | 画布 | 前端 | 结果 |
|---|---|---|---|---|
| 04:08 | cdance2.0-0807（天翼云） | canvas-qaefgPTZZC_wDYyLm4acX | 参数面板黄框列出图片3/4；点生成弹确认框「图片3：499×280 → 535×300（放大）/ 图片4：511×281 → 546×300（放大）」；点继续生成 | 任务 9f5e41ff 成功，308s，节点回写 1280×720 4s 视频，扣 1 分 |
| 04:11 | doubao-seedance-2-0（模汇） | canvas-CrprzDG48bFC0cgByXOEv | 同上确认框 | 任务 ca2fdc9d 成功，404s，节点回写 1280×720 视频 |

结论：昨天失败的同一组图，今晚天翼云、模汇各一次成功，**已修复**。

## 5. 其它已上线修复的生产核对（只读）

- P0-1 大图栈溢出：部署后 0 次 RangeError（部署前 10-22 全天 77 个任务）。部署后模汇 gpt-image-2-all / -c 已按 URL 返回，大 base64 路径不再走，结论为**未再出现**；栈记录代码已上线，但没有新异常可落栈（stacks=0），无法用真实栈验证该代码路径。
- 模汇图片 02:00–03:30 有 4 次 `system disk overloaded (96.7%–99.6%)`：这是**模汇上游自己的磁盘**（我们服务器根盘 62%），系统已自动切到第二候选（兔子成功 / ModelBay 余额不足失败）。不是我们的 bug，需要告诉模汇。
- cdance2.0-fast-0807 `resolution not valid ... in r2v`：昨天 3 次，课上学生节点 480P 成功 19 次、720P 2 次、1080P 1 次。待今晚矩阵测试确认哪档被拒。

注：生成中途离开画布，节点保持 loading；重新打开画布后自动恢复为成功并显示视频，符合恢复设计。

## 6. 10-23 课堂巡检（09:44）与栈溢出热更新

- 07:00–09:44：图片 8 个任务 0 成功，其中 6 个 `Maximum call stack size exceeded`（全部 25990047，09:34–09:40，模汇/兔子/ModelBay 都有），2 个上游余额不足。视频 7 个：cdance 3/4（1 个上游人工审核），模汇 1 成功 1 进行中，ModelBay 1 个 403。
- 昨天的 300px、无上游 ID、needs_review：今天 0 次。§5 里"栈溢出未再出现"的结论被推翻。
- 新栈记录（`642a325f`）抓到真实栈：`RegExp.test ← ee`，对应 `image-task-support.ts` 的 `rawImageBase64DataUrl` / `resolveImageBase64Like`，正则 `/^[a-z0-9+/=_-]+$/i` 扫数 MB base64 爆栈。昨天的 URL 返回只是绕开。
- 10:04 热更新（用户同意）：生产 app + worker 的 5 个含该正则的 chunk，正则换成逐字符检查 `globalThis.__vzB64`；`node --check` 通过，重启后 healthy。备份后缀 `.bak-b64-20261023-100458`，脚本 `D:\tmp\vz-night\hp-b64.sh`。**下次发版/重建容器会丢，必须随源码修复正式发版。**
- 源码修复：另一会话已在 `D:/tmp/vz-hotfix`（分支 `fix/b64-regex-overflow`）写了相同的逐字符 `isBase64Text`，未提交。不重复写。
- 热更新后：25990047 10:08 gpt-image-2 成功（他上午 6 次全栈溢出）。
- 新问题：25990032 测试任务 c6362ff7（模汇 gpt-image-2-c，10:07）上游 78s 返回 200，但下载结果图 30s 超时 `media_timeout`。待查。

## 7. 10:04 之后

课中的热更新、配置变更、上游问题和推生产前待办都在 [2026-10-23-prod-hotpatch-log.zh-CN.md](2026-10-23-prod-hotpatch-log.zh-CN.md)，这里不重复。

## 8. 夜间矩阵测试（03:30–04:40）没做完的部分

- 14 个视频用例（`D:\tmp\vz-night\cases-v1.json`、`matrix.log`），全部多图连线 + @引用。已确认结果：cdance2.0-0807 全能参考 / 视频生视频 / 文生视频成功；cdance2.0-fast 720P、1080P 成功；cdance2.0-mini 成功；兔子 2.0-260128 全能参考（含小图确认框）成功；兔子 2.5 全能参考上游 504。
- V05（cdance2.0-0807 首尾帧）、V10（兔子 2.5 视频生视频）提交后节点立即报错，原因没查。
- 图片模型矩阵（文生图、多图编辑）没跑。
