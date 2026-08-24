# VOZEB-PRO 周末更新与短剧实验室测试清单

更新时间：2026-08-24
测试范围：群主 `upstream/main` 周末更新、当前 `develop` 短剧实验室真实业务

## 1. 版本与部署基线

### GitHub 更新

- 远端：`https://github.com/csyqlz/VOZEB-PRO`
- 本地远端引用：`upstream/main`
- 周末最新提交：`04b32d3`，提交时间 `2026-08-23 05:18:11 +0800`
- 发布标签：`v0.0.7`
- 周末提交范围：`7d4937d`、`6ae3023`、`d654f54`、`a4b113b`、`887d9a4`、`31ffc13`、`a201e82`、`936cdc1`、`04b32d3`、`00d31f9`

`upstream/main` 与当前短剧实验室 `develop` 在 `4de8360` 后分叉。主线已经移除了 `drama-lab` 页面和 API，因此没有直接把主线覆盖到 3001；本次采用隔离烟测，保留实验室测试线。

### 服务器测试环境

| 环境 | 地址 | 镜像 | 数据库/卷 | 用途 |
| --- | --- | --- | --- | --- |
| 实验室线 | `http://8.163.37.148:3001` | `ghcr.io/lishen331/vozeb-pro:sha-8f8f87ef6c854c27a637e373170955d17bfc68e0` | 原 `vozeb_staging`、`vozeb-staging_app-data` | 测试短剧实验室 |
| 群主更新线 | 服务器本机 `http://127.0.0.1:3002`（公网端口尚未放行） | `ghcr.io/csyqlz/vozeb-pro:v0.0.7`，digest `sha256:07c75a90276f7f2ef8a911a04390a24ee9846848a1da31c4748ed36a96d80a20` | 隔离 `vozeb_v007`、`vozeb-upstream-v007-data` | 测试群主主线更新 |

部署结果：两套应用和 Worker 均为运行状态，服务器本机的 `3001`、`3002` 两个健康探针均返回 200，`/api/health/ready` 返回 `ready=true`。公网访问 3001 正常，3002 当前被服务器前置网络拦截（外部请求返回 502/端口未放行），需要在测试机上通过 SSH 隧道访问，例如映射到本机 3302：`ssh -N -L 3302:127.0.0.1:3002 ...`，然后打开 `http://127.0.0.1:3302`。3002 的 `/drama-lab` 返回 404，这是主线不包含实验室路由的预期结果；短剧实验室请使用 3001。

本次未修改 3001 的 Compose、`.env`、数据库和媒体卷；已保留旧镜像标签 `vozeb-staging:before-20260824`。

### 回滚/清理

本次隔离部署不需要回滚 3001。删除群主烟测线时执行：

```bash
docker rm -f vozeb-upstream-v007-worker vozeb-upstream-v007-smoke
docker volume rm vozeb-upstream-v007-data
# 确认不再需要副本后再删除 vozeb_v007 数据库
```

## 2. 群主周末更新功能清单

以下只列有服务端路由、任务调度、持久化或可验证运行时行为的更新；纯文档、CI 依赖和仅布局调整不列为业务验收项。

| 编号 | 已实现功能 | 验证入口/代码证据 | 测试要点 |
| --- | --- | --- | --- |
| U-01 | Agent 文本规划支持标准化流式响应、上下文恢复和失败恢复 | `web/src/lib/server/text-planning-runtime.ts`、`agent-run-*`；提交 `6ae3023` | 连续发送两轮请求，刷新后检查会话、Run 和任务状态；失败后重试不重复扣费 |
| U-02 | 生成任务 Worker 支持慢任务恢复、租约/心跳和重复任务抑制 | `web/scripts/generation-worker.mjs`、`generation-task-recovery-service.ts`、`generation-task-scheduler.ts`；提交 `6ae3023`、`a4b113b` | 生成中刷新页面，确认任务继续；快速重复点击只产生一个上游任务 |
| U-03 | 图片任务保留慢响应结果、完整保存多结果并恢复历史 | `image-task-runtime.ts`、`image-task-result-service.ts`、`image-task-openai.ts`；提交 `7d4937d`、`a4b113b` | 多结果全部可见；上游响应慢时任务不提前失败；刷新后结果和生成记录仍在 |
| U-04 | 图片参考图按渠道协议转换并校验，失败时不误切换渠道/重复创建 | `image-task-reference-urls.ts`、`managed-media-input-access.ts`、`reference-asset-access.ts`；提交 `7d4937d` | URL、multipart、base64 参考图分别测试；检查上游调用次数和失败记录 |
| U-05 | 视频生成补齐 Seedance/Doubao/Sora 兼容协议、参考图和结果 URL 恢复 | `video-generation-route.ts`、`video-payloads.ts`、`video-reference-image.ts`；提交 `7d4937d` | 文生视频、图生视频和失败重试各测一次；任务完成后结果 URL 写回并可刷新恢复 |
| U-06 | 短剧主线分析增强：Word/多集来源读取、结构化分段和失败响应 | `web/src/app/api/drama/analyze/route.ts`、`drama-source-reader.ts`、`drama-analysis-segmentation.ts`；提交 `7d4937d` | 导入 Word 和多集文本，检查集顺序、分段、对白覆盖和错误提示 |
| U-07 | 短剧主线生成支持 2K/4K 能力档案恢复 | `creative-generation-preferences.tsx`、模型能力归一化；提交 `936cdc1` | 选择支持 2K/4K 的图片模型，确认尺寸进入请求且不被前端隐藏 |
| U-08 | 生成/计费/参考素材链路补齐服务端错误反馈和审计记录 | `generation-operations-service.ts`、`generation-task-review-service.ts`、相关 `route.test.ts`；提交 `7d4937d`、`6ae3023` | 成功、明确失败、超时待确认分别检查任务状态、扣费和日志 |

不纳入上述业务验收：`31ffc13`（Action 版本）、`d654f54`（重复校验流程调整）、`00d31f9`（文档/许可）、`a201e82` 和 `04b32d3` 中仅改变布局的部分。

## 3. 当前短剧实验室真实业务清单（3001）

测试前置：登录测试账号；后台配置可用默认文本、图片、视频模型；资产生成和视频测试需要可用上游渠道。每次 AI 操作都应在后台生成记录中能按短剧项目/剧集追溯。

| 编号 | 已实现业务闭环 | 入口与服务端证据 | 测试步骤/通过标准 |
| --- | --- | --- | --- |
| L-01 | 项目列表、新建、读取、编辑、删除和并发冲突保护 | `/api/drama-lab/projects`；`drama-project-store.ts`；`drama-lab/[id]/outline/page.tsx` | 新建项目后刷新仍存在；两页面同时保存旧版本时后提交方收到 409，不覆盖新数据 |
| L-02 | 剧集管理、剧本编辑、自动/手动保存和项目间剧本导入 | `/api/drama-lab/projects/[id]`；`drama-workflow-lab-project-complete.tsx` | 新增/删除剧集；编辑剧本后刷新保留；从有剧本项目导入只写入故事梗概和剧本，不覆盖资产、分镜和媒体 |
| L-03 | 故事梗概到剧本的真实文本模型调用与日志 | `/api/drama-lab/projects/[id]/generate-script`；`drama-lab-script-generation-service.ts` | 填写梗概、风格、剧本类型后生成；剧本写回当前集；成功/失败均能在生成记录中找到 `drama-lab-script` 记录 |
| L-04 | 从剧本提取角色、场景、道具，并去重持久化 | `/api/drama-lab/projects/[id]/extract-assets`；`drama-lab-asset-extraction-service.ts` | 无剧本时被阻止；有剧本时分别提取三类资产；重复提取不重复追加；资产字段和提取日志保存 |
| L-05 | 从素材库导入角色、场景、道具及其参考图/文本说明 | `library-assets` 服务；`outline/page.tsx`、`drama-lab-visual-assets-panel.tsx` | 选择素材库图片或文本，导入对应资产类别；项目刷新后名称、描述和参考图仍在；同名导入被阻止 |
| L-06 | 资产参考图上传、主参考图选择和资产生图任务 | `drama-lab-visual-assets-panel.tsx`；通用 `/api/image-tasks` | 上传/选择主参考图；点击资产生图后创建真实图片任务，完成结果写回资产并可刷新查看 |
| L-07 | 一键 AI 分镜拆解，返回并持久化镜头结构和资产 ID 关联 | `/api/drama-lab/projects/[id]/extract-storyboards`；`drama-lab-storyboard-extraction-service.ts` | 已有剧本和资产时提取分镜；检查 `sceneId`、`characterIds`、`propIds` 均来自当前项目；伪造或不存在的 ID 返回错误，不创建幽灵资产 |
| L-08 | 分镜手工新增、编辑、删除、排序和资产勾选绑定 | `drama-workflow-lab-project-complete.tsx`；项目 PUT 持久化 | 修改镜头描述、景别、机位、动作、对白、时长和绑定资产；刷新后字段和顺序一致；资产绑定只保存项目内 ID |
| L-09 | 分镜图真实任务创建：读取镜头绑定资产主参考图并使用服务端模板 | `/shots/[shotId]/generate-image`；`drama-lab-shot-generation-service.ts` | 缺少绑定参考图时前端提示且不创建任务；正常时检查图片任务、参考图、模板和镜头关联，完成后 `storyboardImageUrl` 写回 |
| L-10 | 首帧、关键帧、尾帧的文本提示词规划后再创建帧图任务 | `/shots/[shotId]/generate-frame`；`drama-lab-frame-generation-service.ts`；`drama-lab-prompt-templates.ts` | 分别生成 first/key/last；文本模型返回的 prompt/description 被保存，再提交图片任务；三类帧各自有状态、URL 和错误信息 |
| L-11 | 分镜视频真实任务创建，使用当前镜头图/关键帧和绑定资产上下文 | `/shots/[shotId]/generate-video`；`prepareDramaLabStoryboardVideo` | 无分镜图或关键帧时被阻止；有前置图时创建视频任务；完成后 `videoUrl` 写回并可刷新播放 |
| L-12 | 图片、帧图、视频任务状态同步、历史版本和失败重试 | `/shots/[shotId]/sync-generation`；`storyboardHistory`、`videoHistory`、`frames` | 生成中刷新或重新进入工作台，状态继续同步；失败记录保留；重试创建新任务 ID；历史结果可恢复为当前结果 |
| L-13 | 当前集剪映草稿导出 | `/api/drama-lab/projects/[id]/export-jianying`；`drama-jianying-export.ts` | 当前集存在视频且填写合法草稿目录/版本时下载 ZIP；无视频或参数非法时前端阻止且不创建导出任务 |

## 4. 明确不作为真实业务验收

- “一键全流程”中的 `simulateRun`：前端定时器演示，不创建真实 AI 任务、不保存完整流程结果。
- “内容审核”中的 `simulateReview`：本地演示报告，不是后端 AI 审核结果，不能作为导出门禁。
- 团队协作/审批演示：当前没有项目组、通知、成员权限和审批记录持久化。
- 仅展示进度、评分或百分比的卡片：没有对应服务端任务或持久化写回时不计为功能完成。

## 5. 测试记录要求

每个用例记录：环境（3001/3002）、账号、时间、请求路径、HTTP 状态、任务 ID、生成记录 ID、最终 URL/错误信息。AI 失败时同时保存浏览器 Network、服务端容器日志和上游中转记录，不能只依据按钮 loading 状态判定成功。
