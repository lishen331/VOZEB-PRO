# 无限练习生成链路性能优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为无限练习增加可测量的端到端阶段耗时、RunningHub 渠道全局公平准入、可配置类型轮询以及预览/CDN 分发，使两个各 50 人的课堂突发请求稳定排队且不串任务。

**Architecture:** 保留现有持久化 `queued`、lease、`SKIP LOCKED` 和单 `upstreamTaskId` 恢复机制，在其上增加渠道级 reservation 与公平领取。先落地观测和容量保护，再调整轮询，最后解耦预览与永久持久化，避免一次大改影响既有 7 条工作流。

**Tech Stack:** Next.js App Router、TypeScript、PostgreSQL、Generation Worker、RunningHub、对象存储/CDN、Vitest、Playwright。

## Global Constraints

- 只改无限练习 / `open-source-practice`，不改商业闭源模块。
- 不修改 7 条 RunningHub 工作流的入参、节点映射、输出映射或 workflowId。
- 已保存 `upstreamTaskId` 的任务只允许查询与持久化，禁止重建任务和重复计费。
- 并发和轮询限制必须来自管理员配置、供应商公开限制或已有资源保护契约。
- PostgreSQL 迁移必须使用有序幂等 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`，旧环境无需重建。
- 生产媒体不允许由 Next.js 单机承担 100 人完整字节分发。
- 430px 移动端不在本次范围。

---

## File Map

- `web/src/lib/server/database/schema.ts`：阶段时间列、渠道 reservation 表和索引的幂等迁移。
- `web/src/lib/server/generation-task-scheduler.ts`：公平领取和阶段时间写入。
- `web/src/lib/server/generation-task-store.ts`：渠道活动量、容量 reservation 和性能聚合查询。
- `web/src/lib/server/generation-task-recovery-service.ts`：渠道准入、类型轮询、preview/persist 状态推进。
- `web/src/lib/server/generation-task-types.ts`：时间与预览字段类型。
- `web/src/lib/auth/store-types.ts`、`store-foundation.ts`、`store-settings-actions.ts`：管理员性能配置契约与默认值。
- `web/src/components/admin/admin-generation-settings.tsx`：渠道/类型并发和轮询配置 UI。
- `web/src/lib/server/image-task-result-service.ts`、`video-result-normalizer.ts`：安全预览与永久持久化。
- `web/src/app/api/reference-assets/[...path]/route.ts`：对象存储跳转、Range/缓存验证。
- `web/src/lib/server/practice-session-service.ts`：对外 preview/permanent URL 选择。
- `web/src/app/(user)/practice/components/practice-module-workbench.tsx`：首次展示埋点。
- `web/src/app/api/practice/sessions/[id]/displayed/route.ts`：首次展示时间写入。
- `web/src/app/api/admin/generation-tasks/performance/route.ts`：P50/P95/P99、积压和错误率。

### Task 1: 阶段耗时数据模型

**Files:**
- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `web/src/lib/server/generation-task-types.ts`
- Modify: `web/src/lib/server/generation-task-scheduler.ts`
- Test: `web/src/lib/server/database/postgres.test.ts`
- Test: `web/src/lib/server/generation-task-scheduler.test.ts`

**Interfaces:**
- Produces: `GenerationTaskTimingPatch` and persisted `queuedAt/admittedAt/upstreamReadyAt/persistenceStartedAt/persistedAt/clientDisplayedAt`.

- [ ] **Step 1: Write failing schema tests** asserting old PostgreSQL tables receive every timing column before indexes/constraints.
- [ ] **Step 2: Run** `pnpm --dir web test -- src/lib/server/database/postgres.test.ts --no-file-parallelism`; expect FAIL for missing migration columns.
- [ ] **Step 3: Add idempotent migrations** in `schema.ts` using `ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS queued_at timestamptz` and the same statement for `admitted_at`, `upstream_ready_at`, `persistence_started_at`, `persisted_at`, `client_displayed_at`.
- [ ] **Step 4: Re-run the schema test**; expect PASS.
- [ ] **Step 5: Write failing scheduler tests** asserting each transition sets its timestamp once and never overwrites an earlier value.
- [ ] **Step 6: Run** `pnpm --dir web test -- src/lib/server/generation-task-scheduler.test.ts --no-file-parallelism`; expect FAIL for missing timing patch fields.
- [ ] **Step 7: Add `GenerationTaskTimingPatch`** and persist timestamps with `COALESCE(existing, incoming)` semantics.
- [ ] **Step 8: Re-run scheduler tests and `pnpm --dir web run typecheck`**; expect PASS.
- [ ] **Step 9: Commit** with `feat(practice): record generation stage timings`.

### Task 2: 性能聚合与后台观测

**Files:**
- Modify: `web/src/lib/server/generation-task-store.ts`
- Create: `web/src/app/api/admin/generation-tasks/performance/route.ts`
- Modify: applicable admin generation operations page
- Test: `web/src/lib/server/generation-task-store.test.ts`
- Test: `web/src/app/api/admin/generation-tasks/performance/route.test.ts`

**Interfaces:**
- Produces: `getPracticeGenerationPerformance({ workflowCode, schoolId, from, to })` returning counts, backlog, error rate and stage P50/P95/P99.

- [ ] **Step 1: Write failing repository tests** for bounded PostgreSQL percentile aggregation, workflow/school/time filters and no full-table Node.js filtering.
- [ ] **Step 2: Write failing route tests** for administrator Session, explicit permission and `{ code, data, msg }` response.
- [ ] **Step 3: Implement the parameterized aggregate query** over indexed time windows.
- [ ] **Step 4: Add compact admin cards/table** showing queue, upstream, detect, persist, visible and failure percentiles by workflow.
- [ ] **Step 5: Run focused tests, typecheck and desktop browser regression.**
- [ ] **Step 6: Commit** with `feat(admin): expose practice latency metrics`.

### Task 3: RunningHub 渠道全局容量 reservation

**Files:**
- Modify: `web/src/lib/auth/store-types.ts`
- Modify: `web/src/lib/auth/store-foundation.ts`
- Modify: `web/src/lib/auth/store-settings-actions.ts`
- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `web/src/lib/server/generation-task-store.ts`
- Modify: `web/src/lib/server/generation-task-recovery-service.ts`
- Modify: `web/src/components/admin/admin-generation-settings.tsx`
- Test: corresponding store/repository/recovery/admin tests

**Interfaces:**
- Produces: `withPracticeChannelCapacity({ channelId, taskType, taskId, limits }, handler): Promise<T | null>`.

- [ ] **Step 1: Write failing config tests** for total and per-capability channel limits, validation, persistence and immediate reread.
- [ ] **Step 2: Write failing PostgreSQL concurrency tests** proving simultaneous workers cannot exceed total/type limits and duplicate `taskId` reservation is idempotent.
- [ ] **Step 3: Add the reservation table and indexes** with ordered idempotent migration.
- [ ] **Step 4: Implement atomic advisory-lock admission** counting active phases plus unmaterialized reservations.
- [ ] **Step 5: Wrap queued practice execution** in both existing user capacity and new channel capacity; capacity failure keeps `queued` and does not call upstream.
- [ ] **Step 6: Add compact admin configuration UI** with clear text that limits are per RunningHub channel, not per user.
- [ ] **Step 7: Run concurrency tests with `--no-file-parallelism`, typecheck and browser regression.**
- [ ] **Step 8: Commit** with `feat(practice): enforce runninghub channel capacity`.

### Task 4: 学校和用户公平领取

**Files:**
- Modify: `web/src/lib/server/generation-task-scheduler.ts`
- Modify: `web/src/lib/server/generation-task-store.ts`
- Test: `web/src/lib/server/generation-task-scheduler.test.ts`
- Test: relevant PostgreSQL integration test

**Interfaces:**
- Consumes: channel capacity from Task 3.
- Produces: deterministic fair due-task ordering without changing task ownership.

- [ ] **Step 1: Write failing tests** with one noisy user and users from two schools; assert every school/user gets a turn before the noisy user receives another slot when all are due.
- [ ] **Step 2: Implement bounded SQL ranking** with `row_number()` partitions and `FOR UPDATE SKIP LOCKED`; retain `nextPollAt, createdAt, id` within each partition.
- [ ] **Step 3: Mirror semantics in File Provider** for development only.
- [ ] **Step 4: Re-run scheduler and real PostgreSQL tests.**
- [ ] **Step 5: Commit** with `feat(practice): fairly admit classroom tasks`.

### Task 5: 可配置类型轮询

**Files:**
- Modify: `web/src/lib/auth/store-types.ts`
- Modify: `web/src/lib/auth/store-foundation.ts`
- Modify: `web/src/lib/server/generation-task-scheduler.ts`
- Modify: `web/src/lib/server/generation-task-recovery-service.ts`
- Modify: `web/src/components/admin/admin-generation-settings.tsx`
- Test: scheduler/settings/admin tests

**Interfaces:**
- Produces: `practicePolling` settings by task type and age band.

- [ ] **Step 1: Write failing tests** for default compatibility, minimum interval validation and video long-running interval configuration.
- [ ] **Step 2: Implement settings persistence** without hard-coding unverified supplier limits.
- [ ] **Step 3: Pass task type into poll scheduling** and use configured age bands; retain exponential error backoff.
- [ ] **Step 4: Set the test-environment video long interval to 10 seconds** only after confirming query load budget; compare detect-lag metrics before promoting to production.
- [ ] **Step 5: Run focused tests and a single real video task**; assert no duplicate create and detect lag within target.
- [ ] **Step 6: Commit** with `perf(practice): tune polling by task type`.

### Task 6: 安全预览与后台永久持久化

**Files:**
- Modify: `web/src/lib/server/generation-task-types.ts`
- Modify: `web/src/lib/server/generation-task-recovery-service.ts`
- Modify: `web/src/lib/server/image-task-result-service.ts`
- Modify: `web/src/lib/server/video-result-normalizer.ts`
- Modify: `web/src/lib/server/practice-session-service.ts`
- Test: result/recovery/session tests

**Interfaces:**
- Produces: authenticated short-lived `previewUrl`, immutable `permanentUrl`, and `preview_ready` transition.

- [ ] **Step 1: Write failing tests** proving an upstream result can become previewable before mirror completion, while no raw credential or unrestricted URL is exposed.
- [ ] **Step 2: Add preview state** without treating preview as permanent success.
- [ ] **Step 3: Implement signed media proxy preview** bound to user/task/channel/result URL and short expiry.
- [ ] **Step 4: Continue persistence in Worker** and atomically replace preview with permanent server/object URL.
- [ ] **Step 5: Test refresh/restart recovery** from `preview_ready` without re-submitting upstream.
- [ ] **Step 6: Commit** with `perf(practice): show results before media mirroring`.

### Task 7: 图片缩略图与视频 CDN/Range

**Files:**
- Modify: `web/src/app/api/reference-assets/[...path]/route.ts`
- Modify: image variant service used by practice results
- Modify: `web/src/app/(user)/practice/components/practice-session-result.tsx`
- Test: reference asset route, image variant and practice result tests

**Interfaces:**
- Consumes: permanent media URL from Task 6.
- Produces: limited WebP preview and CDN/Range-capable video playback URL.

- [ ] **Step 1: Write failing media tests** for thumbnail dimensions, Range, MIME, Content-Length, cache headers and object-storage redirect.
- [ ] **Step 2: Return bounded WebP preview for images** while keeping original download action.
- [ ] **Step 3: Ensure videos redirect to object storage/CDN** for normal playback and support Range when local fallback is used.
- [ ] **Step 4: Add video poster/metadata-first rendering** without waiting for browser full download.
- [ ] **Step 5: Run 1/50/100 concurrent read tests** and assert 100-user playback does not proxy full bytes through Next.js when object storage is enabled.
- [ ] **Step 6: Commit** with `perf(practice): optimize classroom media delivery`.

### Task 8: 首次显示埋点和阶梯压测

**Files:**
- Create: `web/src/app/api/practice/sessions/[id]/displayed/route.ts`
- Modify: `web/src/app/(user)/practice/components/practice-module-workbench.tsx`
- Create: `web/scripts/practice-load-test.mjs`
- Create: final report under `docs/superpowers/reports/`
- Test: route/component/script contract tests

**Interfaces:**
- Produces: idempotent `clientDisplayedAt` and repeatable 1/10/50/100 load-test output.

- [ ] **Step 1: Write failing route tests** ensuring only the owner can mark first display and repeated calls do not overwrite the first timestamp.
- [ ] **Step 2: Trigger the beacon once** after image `load`, video `loadedmetadata` or audio `loadedmetadata`.
- [ ] **Step 3: Implement a load script** that creates distinct users/sessions, captures all stage timestamps, verifies task/result ownership and stops at configured error/cost thresholds.
- [ ] **Step 4: Run 1 and 10-user fixtures locally** without real supplier credentials.
- [ ] **Step 5: During an approved real-upstream window run 1 → 10 → 50 → 100**, beginning with images; run video only after the image gate passes and a cost budget is approved.
- [ ] **Step 6: Compare results against design acceptance targets** and document P50/P95/P99, errors, backlog, duplicate creates and media delivery path.
- [ ] **Step 7: Run typecheck, lint, format, full Vitest, production build and desktop browser regression.**
- [ ] **Step 8: Update and validate development docs** using the required scripts.
- [ ] **Step 9: Commit** with `test(practice): validate classroom generation capacity`.

## Release Gate

Do not enable the 100-user classroom claim until all conditions hold:

```text
50 users image: pass
100 users image: pass
50 users video: pass within approved cost window
0 cross-user result mismatches
0 duplicate upstream task creations
channel global capacity never exceeded
production media served through object storage/CDN
P95 platform overhead meets design target
```
