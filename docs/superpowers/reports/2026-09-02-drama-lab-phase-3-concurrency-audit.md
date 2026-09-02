# Drama Lab Phase 3 对抗性并发审查

日期：2026-09-02
范围：仅短剧实验室 Phase 3（工作流、团队审批、Canvas 显式回写、项目导入/导出）。普通 Canvas、教师/学生管理、商单算力和通用账户不在范围内。

## 结论

定向测试当前通过 6 个文件、65 项测试。功能链路的局部回写错误已修复：`drama-lab-workflow-task-service.ts:476-485` 的 `syncShot` 现在直接等待同步请求，失败会抛出 `DramaLabWorkflowError`，因此不会在媒体未写回项目分镜时把图片/视频子任务标记为成功。协作者同步白名单也已补齐为当前项目的 active members，并增加跨协作者回写回归测试。

但以下并发问题仍是生产验收阻断项。它们不能靠浏览器重试或进程内锁可靠解决，必须在持久化层加入 CAS/fencing 或项目级原子 claim。

## P0 阻断项

| 问题 | 位置 | 影响 | 建议边界 |
| --- | --- | --- | --- |
| 工作流租约没有 fencing/CAS | `drama-lab-workflow-task-service.ts:125-159,628-683`; `generation-task-store.ts:693-711`; `generation-task-recovery-service.ts:31-104` | 90 秒租约过期后，旧 worker 仍可 `patchStep/updateChild/complete/fail`，覆盖新 worker 的结果 | 为工作流 mutation 携带 `workerId + fencingToken + expectedVersion/leaseUntil`；更新失败必须丢弃旧执行结果 |
| 锁只在单进程有效 | `drama-lab-workflow-task-service.ts:128,795-807` | 多 Node 实例同时执行同一步，重复调用 AI、媒体上游和导出 | 在 DB 做 durable step claim/advisory lock；`withWorkflowLock` 只能作为本地优化 |
| 启动检查与创建非原子 | `drama-lab-workflow-task-service.ts:57-65,97-106` | 两个协作者可同时通过 active 检查，创建两个项目工作流父任务 | 项目/协作组范围的原子 active claim（事务或唯一索引）；request id 应绑定 projectId |
| 取消/恢复与迟到执行竞态 | `drama-lab-workflow-task-service.ts:161-205` | 取消后旧执行继续写入，可能把 cancelled 工作流推进到 success；外部取消失败也被忽略 | 取消/恢复递增 run generation，所有写入匹配 generation；取消未确认时保留 `cancel_requested` |

## P1 高风险项

| 问题 | 位置 | 影响 |
| --- | --- | --- |
| 合成 child 先查后插 | `drama-lab-workflow-task-service.ts:546-574` | 多进程重复 script/assets/storyboard 提取，产生孤儿 child 和重复副作用 |
| 图片/视频槽位无原子 claim | `drama-lab-workflow-task-service.ts:401-468` | 同一镜头无 taskId 时可并发提交多个上游任务，最终绑定与父 child 不一致 |
| HTTP 工作流入口直接推进 | `web/src/app/api/drama-lab/projects/[id]/workflow/route.ts:52-69,87-90` | GET/POST/PATCH 与 recovery worker 并行执行同一步；浏览器不应直接拥有执行权 |
| 协作者同步白名单（已修复） | `web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/sync-generation/route.ts:26-36,98-126` | 已读取当前项目 active members；仍通过完整 project/episode/shot context 拒绝 foreign project/task。后续需为成员移除与任务回写竞态增加集成测试 |
| 分镜冲突重试整集覆盖 | `drama-lab-workflow-task-service.ts:517-524` | 409 后用旧 `shots` 替换最新整集，可能覆盖锁帧、媒体 URL 和协作者编辑 |
| 审核结果缺少输入版本 | `drama-lab-workflow-task-service.ts:349-359` | 剧本/资产/分镜修改后仍复用旧 passed 结果；需保存 project/episode/shot content hash |
| 导出同步压缩阻塞心跳 | `drama-lab-project-archive.ts:92-98` | `zipSync` 大包阻塞 event loop，租约失效后可能重复导出 |
| 导出 artifact 两阶段写入 | `drama-lab-workflow-export-artifact.ts:38-60` | ZIP 与 metadata 分开写、artifactId 固定 taskId，并发重试可交叉覆盖或留下半成品 |
| 创建者移除后的恢复身份 | `generation-task-recovery-service.ts:73-104` | recovery 仍以已移除 creator 访问项目，父任务可能保持 pending/running 且无人接管 |

## 本轮可安全保留的局部修复

1. 保留 `syncShot` 的错误冒泡改动；图片/视频 child 只有在同步接口成功后才能进入 `success`。
2. 为该行为补回归测试：同步接口返回非 2xx 或业务 `code != 0` 时，`advanceDramaLabWorkflow` 应返回 `error`，且不得调用 `completeWorkflowStep`。
3. 保留审核服务的视频输入修复（由并行审查任务完成），但版本 hash 仍需后续在 workflow service 绑定。
4. 本轮不改通用 scheduler/store 的 API；P0 并发项列为下一阶段的持久化协议任务，避免局部补丁制造假一致性。

## 验证记录

```text
corepack pnpm exec vitest run \
  src/lib/server/drama-lab-workflow-task-service.test.ts \
  src/app/api/drama-lab/projects/[id]/shots/[shotId]/sync-generation/route.test.ts \
  src/lib/server/drama-lab-workflow-export-artifact.test.ts \
  src/lib/server/drama-lab-project-archive.test.ts \
  src/lib/server/drama-lab-canvas-writeback-service.test.ts \
  src/lib/server/drama-lab-collaboration-service.test.ts --reporter=dot

Test Files 6 passed (6)
Tests 65 passed (65)
```

`corepack pnpm typecheck --pretty false`、`corepack pnpm lint` 和 `git diff --check` 均已通过。
