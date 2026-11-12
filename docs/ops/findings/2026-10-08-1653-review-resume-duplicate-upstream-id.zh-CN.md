# 人工接管「恢复上游任务」返回 500：上游任务 ID 重复绑定

- 发现：2026-10-08 16:53 巡检（app_err=33，其中 4 条是新的报错类型 `duplicate key ... channel_upstream_idx`）
- 级别：关注。没有影响学生的提交，但管理员在后台处理 needs_review 时操作失败，只看到 500，看不到原因
- 相关报告：[1645 ModelBay 响应体卡住](2026-10-08-1645-modelbay-body-stall-and-503-cooldown.zh-CN.md)。这批 needs_review 就是那份报告说的积压，管理员正在手动处理

## 现象

管理员在后台对 X9te 渠道（ModelBay）的 needs_review 图片任务点「恢复上游任务」并填入上游任务 ID，有 3 个任务、4 次请求返回 500：

| 时间 | 任务 | 结果 |
|---|---|---|
| 16:45:37 | `4bdf6e03` | 200，成功绑定 `…d9d6RvrwsGsW` |
| 16:45:46 | `46651b4a` | 500 |
| 16:45:53 | `cc9b129a` | 500 |
| 16:50:47 / 16:50:49 | `ad5a4215` | 500（重试一次，仍然 500） |

应用日志：`Generation task review failed { type: 'image', error: 'duplicate key value violates unique constraint "vozeb_pro_generation_tasks_channel_upstream_idx"' }`

## 证据

- 唯一索引定义：`(channel_id, upstream_task_id)`，channel 和 upstream id 都非空时生效（[schema.ts:365](../../../web/src/lib/server/database/schema.ts#L365)）。同一渠道下，一个上游任务 ID 只能属于一个平台任务
- 3 个失败任务现在都是 `running / needs_review`，`upstream_task_id` 为空，**没有被改坏**
- 最近 40 分钟内，X9te 渠道只有 `4bdf6e03` 一条任务带了上游 ID
- 接管代码 [generation-task-review-service.ts:20-26](../../../web/src/lib/server/generation-task-review-service.ts#L20-L26)：先 `attachUpstreamTask` 写任务 JSON，再 `scheduleGenerationTask` 写 `upstream_task_id` 列。冲突抛出的是数据库原始错误，不是 `GenerationTaskReviewError`，所以路由返回了通用 500（[review/route.ts:23-26](../../../web/src/app/api/admin/generation-operations/[type]/[id]/review/route.ts#L23-L26)）

## 原因

管理员填入的上游任务 ID 在这个渠道下已经绑定到别的任务。最可能的情况是同一个 ModelBay ID 被重复填给了好几个任务（16:45:37 先绑给了 `4bdf6e03`，9 秒后又填给下一个）。日志没有记录填入的 ID，**具体是哪个 ID 冲突还没确认**。

这里的唯一索引其实挡住了一个更严重的问题：如果允许重复绑定，几个学生会拿到同一张图。所以报错本身是对的，问题在于提示不清楚，以及可能存在的部分写入。

还没核对的一点：`attachUpstreamTask` 在冲突之前已经执行了。如果 `updateImageTask` 只改 JSON、不碰 `upstream_task_id` 列，失败任务的 JSON 里可能已经留下了这个上游 ID，而列是空的，两边不一致。

## 现场可以马上做的（不改代码）

- 告诉做接管的管理员：ModelBay 后台**每条消耗记录对应一个任务 ID**，要按提交时间和用户逐条对应，不要把同一个 ID 填给多个任务
- 对不上号的任务，用「提供结果」或「确认失败」处理，不要用「恢复上游任务」

## 修复方向

1. 接管前先查重：`SELECT id FROM vozeb_pro_generation_tasks WHERE channel_id=$1 AND upstream_task_id=$2 AND id<>$3`。有冲突就抛 `GenerationTaskReviewError(409, "该上游任务 ID 已绑定到任务 xxxx")`
2. 兜底：捕获 PostgreSQL `23505` 并转成 409，不要返回 500
3. 把 `attachUpstreamTask` 和 `scheduleGenerationTask` 放进同一个事务，或调换顺序先写带唯一约束的列，避免部分写入
4. 失败日志里带上被拒绝的上游 ID（截断即可），方便排查

## 热更新后怎么验证

- 在后台对一个 needs_review 任务填入已经被占用的上游 ID：应该返回 409，并提示占用它的任务 ID；该任务仍然是 `needs_review`，JSON 里的 upstream 和 `upstream_task_id` 列都没变
- nginx 里 `POST /api/admin/generation-operations/*/review` 不再出现 500
- 应用日志里 `channel_upstream_idx` 计数为 0
- 抽查本次 3 个失败任务（`46651b4a`、`cc9b129a`、`ad5a4215`）的 JSON upstream 字段，确认没有残留冲突 ID
