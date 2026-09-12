# 无限练习生成轮询池 Implementation Plan

> **For agentic workers:** Execute task-by-task. This plan is limited to the open-source-practice queue path.

**Goal:** 将无限练习的生成任务从“并发满即失败”改为“持久化排队、Worker 准入、单上游任务轮询和结果回收”。

**Architecture:** 受信任的无限练习请求跳过创建阶段的生产并发拒绝，将任务保存为 `queued`。Generation Worker 领取 queued lease 后使用现有数据库并发 reservation 原子取得 image/video/audio/text 名额；未取得名额则释放 lease 并保持 queued，取得后复用现有创建、轮询、持久化流程。

**Tech Stack:** Next.js Route Handler、TypeScript、PostgreSQL/File Provider、Generation Worker、Vitest。

## Global Constraints

- 只改无限练习 / `open-source-practice` 任务路径，不改商业闭源模块。
- 已提交上游任务必须继续使用原 `upstreamTaskId`，禁止重复创建。
- 不新增固定无限轮询；继续使用现有 `nextPollAt` 与 Worker lease。
- 每次代码修改运行相关测试和类型检查；不处理 430px 移动端。

### Task 1: Queue state and scheduler

- Add `queued` to the generation execution phase contract, database constraint, recovery index and scheduler due phases.
- Keep `queued` out of active concurrency counting.
- Add scheduler regression proving queued work is claimed and active counting does not include it.

### Task 2: Practice admission

- For trusted practice requests, create generation tasks as queued without applying the production creation-time concurrency rejection.
- Keep rate limiting, authentication, workflow validation and all production behavior unchanged.
- Add route regressions for image/video/audio/text practice requests.

### Task 3: Worker capacity gate

- Before processing a queued practice lease, use the existing atomic `withGenerationConcurrencyLimit` with the current task excluded.
- If capacity is unavailable, release the lease back to queued with an existing adaptive poll time and no error status.
- If capacity is available, call the existing type-specific runtime. It changes queued work to running/submitting and preserves original upstream identity rules.
- Add recovery regressions for defer and admit paths.

### Task 4: Practice result state

- Expose queued practice sessions as `queued` while their durable generation task is waiting for capacity.
- Preserve existing result URL/media persistence and browser polling behavior.
- Add result mapping regressions.

### Task 5: Verification

- Run relevant tests, typecheck, lint and format check.
- Run the project documentation map/update validation because scheduler/schema/API structure changes.
- Review diff and leave unrelated uncommitted work untouched.
