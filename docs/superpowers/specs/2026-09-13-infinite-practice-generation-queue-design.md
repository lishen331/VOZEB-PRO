# 无限练习生成轮询池设计

**日期：** 2026-09-13

## 目标

让无限练习的图片、视频、音频和文本任务在达到单用户并发上限时进入持久化队列，而不是因为下游接口返回 429 被练习记录标记为失败。任务一旦取得并发名额，只创建一次上游任务，之后由 Generation Worker 依据 `nextPollAt` 轮询同一个上游任务并持久化结果。

## 边界

- 只改变 `open-source-practice` 受信任请求；生产创作入口继续使用现有并发拒绝语义。
- 队列按任务类型隔离：image、video、audio、text。
- `queued` 不占用活动并发；`created/submitting/submitted/polling/result_ready/persisting` 占用活动并发。
- Worker 使用已有 PostgreSQL advisory lock、reservation、SKIP LOCKED 和 lease，避免重复提交与任务错乱。
- 页面只读取持久化练习 Session；浏览器轮询不重新创建任务。

## 状态流转

```text
queued -> submitting -> submitted -> polling -> result_ready -> persisting -> completed
```

上游明确失败才进入业务失败；容量不足保持 `queued`，临时查询/写入异常沿用现有 deferred/needs_review 机制。

## 验收条件

1. 同一用户连续提交多个图片任务时，超过图片并发的任务仍为 `queued`，不返回练习失败。
2. 图片、视频、音频、文本使用各自并发池。
3. Worker 取得名额后只创建一个上游任务，后续只查询原 `upstreamTaskId`。
4. 页面刷新或退出后，Worker 仍能完成任务，历史练习能读取结果。
5. 生产入口的 429、频率限制和积分逻辑不改变。
