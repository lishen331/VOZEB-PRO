# 一键成片 1:1 复刻 L —— 第二轮对抗性审查

日期：2026-09-17
范围：`one-click-film`（商单版）。创作工坊 `drama-lab`（教学版）代码未改动。
验证口径：不是"页面能打开"，而是**最终上游请求载荷、字段持久化、任务状态机、失败/恢复行为**与 L 等价。

## 一、本轮修掉的真实缺陷

| # | 缺陷 | 症状 | 修复 |
|---|---|---|---|
| 1 | audio 步骤是假实现 | 只读已有 `shot.dialogueAudio?.url` 汇总，**永远不会真正配音**，没有音轨也报 success | 接入 `audio-runner.ts`：遍历选定分集所有分镜的对白/旁白，经 `/api/audio-tasks` 创建真实 TTS 子任务，确定性 requestId + attemptNo，回写 `dialogueAudio`/`narrationAudio` |
| 2 | 父任务从未入调度队列 | `startOneClickFilm` 只落库、不 `scheduleGenerationTask`，**用户关掉页面后没有任何 worker 会推进**，任务永久卡 pending | 落库后立即 `scheduleGenerationTask("render", id, { executionPhase: "created" })`；retry/resume 同样重新入队 |
| 3 | 忽略用户选的分集 | tasks 路由直接 `project.episodes.map(...)`，**把没勾选的分集也拿去生成并计费** | 显式勾选优先，非法 episodeId 返回 400，空项目返回 400，`sourceEpisodeId` 必须落在选中集合内 |
| 4 | 画布回跳串模块 | 回跳硬编码 `/drama-lab/...`，**商单用户从画布返回被丢进教学版创作工坊** | 画布上下文栏与画布工作台按钮按 `source=one-click-film` 分流（回跳路径、读取哪套 API、文案）；两套 `episode-canvas` 响应形状同时兼容 |
| 5 | 缺按音频拆镜 | L 有 `audio split`，一键成片没有入口 | 新增 `split-by-audio` 路由，复用 L 的 `drama-lab-audio-split-service`（预览 + 追加式应用，不覆盖原分镜） |
| 6 | 缺交付导出 | compose 传 `autoExport: false`，且无导出路由 | 新增 `export` 路由，复用 L 的 `exportDramaLabProjectForUser`（同一份字段映射与媒体打包），支持按分集导出 |
| 7 | 画布定位丢 shotId | 前往画布不带 `shotId`，往返丢失分镜位置 | 前往时透传 `shotId`，返回时带回同一张分镜卡锚点 |

## 二、确认为"继承 L 共享实现"而非缺口

这些原先列为缺口，核查后确认一键成片与创作工坊走的是**同一份服务**，语义天然一致：

- **首尾帧 / 全能参考图顺序**：同一个 `prepareDramaLabStoryboardVideo`。已补 `video-payload-parity.test.ts` 锁死顺序为 `first_frame → last_frame → reference`；全能模式槽位顺序为**场景 → 角色 → 道具**；渠道不支持尾帧/首帧时按 L 降级并写入 `frameSnapshot.fallbackReason`；渠道未确认参考图支持时全能模式直接拒绝，不静默改用经典模式。
- **视频失败"继续查询"**：`ensureVideoTask` 对 `pending/running` 走 `recoverChild` 复用同一个上游 provider task，**只有 `error/cancelled` 才重置绑定**，不会重复提交。
- **分镜提取截断续写**：共享 `drama-lab-storyboard-extraction-service`，已内置 checkpoint 增量与**最多 3 次**续写上限（`meta.continuationAttempts < 3`）。
- **父任务 worker 识别**：`taskKind === "one-click-film-workflow"` 落在 payload 顶层，`render` 属可调度类型、`created` 属活跃阶段，租约能被正常 claim；pending 重新排期、终态释放、异常 deferred 重试。

## 三、验证结果

- 一键成片专项：**11 个测试文件 / 41 项通过**
- 创作工坊回归：**58 个文件 / 380 项通过**（未受影响）
- 画布与短剧回归：**46 个文件 / 155 项通过**
- `tsc --noEmit` 通过；一键成片相关 ESLint **0 error**；Prettier 全部符合

## 四、仍需真机验证的部分（自动化测不到）

1. 真实 TTS 上游返回的音频时长与拆镜切点是否符合预期（需实际渠道额度）。
2. 长剧集（数十集）下父任务多轮租约续期的实际耗时与并发表现。
3. 导出 zip 在超大媒体量下的内存占用（`includeMedia: true`）。

## 五、已知无关问题（不在本次改动内）

`web/src/app/api/video-generation-tasks/video-generation-route.ts` 的 TS2322 在 `develop` 主干已存在，经 `git stash` 验证非本次引入，未顺手改。

## 六、提交

本地提交，**未推送**（按用户要求由其本地验证后自行推送）：

- `c180c668` real TTS audio step, audio split parity, parent task scheduling, episode selection
- `8632e217` lock video payload parity, source-aware canvas round trip
- `58d68403` add delivery export reusing L archive contract
