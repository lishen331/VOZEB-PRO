# Infinite Practice Screenwriter Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current fixed-button script practice page with a real, persistent, SSE-driven screenwriter Agent that supports short-story and long-novel creation through episode scripts, review, text storyboards, and project-level character/location/prop prompts.

**Architecture:** Keep VOZEB-PRO as the only host: Next.js Route Handlers, existing Session/school tenant scope, PostgreSQL repositories, `open-source-practice` logical models, and Ant Design/React. A stable Run owns persisted items and ordered public events; the SSE endpoint starts or resumes a queued Run, streams persisted events, and specialized Agent executors load versioned domain Skills, call the configured text model, and commit artifacts before emitting `artifact_saved`. The first implementation uses one bounded deterministic stage operation per Run; the orchestrator converts natural-language requests into explicit operations and never exposes internal prompts or reasoning.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Ant Design 6, Tailwind, PostgreSQL, Zustand where cross-page state is needed, existing `requestStructuredText`, Vitest, Playwright.

## Global Constraints

- Scope is only `open-source-practice` and only the infinite-practice script module.
- Do not modify the seven existing RunningHub media workflows or commercial closed-source modules.
- Never create image, video, audio, dubbing, or final-composition tasks.
- Short-story mode must generate a complete prose story before adaptation.
- Long-novel outline generation may be bulk; prose generation accepts 1–5 chapters per Run.
- Important stage gates require one user confirmation; work inside a gate runs automatically.
- Episodes are persisted independently but do not require per-episode user confirmation.
- Retry only failed items and never regenerate successful items implicitly.
- Script supervision auto-fixes clear issues, preserves the prior version, and reports major story changes for user decision.
- Storyboard granularity is one textual shot per row.
- Character/location/prop prompts are project-level, stable-ID, deduplicated records with occurrences.
- PostgreSQL schema upgrades must be ordered and idempotent; add columns before constraints/indexes.
- Backend configuration must be fresh-read and must control the next real invocation.
- UI is three-column desktop: work tree, formal artifact/SSE output, Agent conversation. 430px is out of scope.
- Protect existing uncommitted changes in `web/src/lib/server/database/practice-repository.ts` and its test.

---

### Task 1: Domain contracts and ordered PostgreSQL schema

**Files:**
- Modify: `web/src/lib/script-practice-types.ts`
- Modify: `web/src/lib/server/database/schema.ts`
- Create: `web/src/lib/server/script-agent-domain.test.ts`
- Modify: `docs/backend-database.md` or the repository's active database documentation file

**Interfaces:**
- Produces `ScriptProjectMode`, `ScriptArtifactType`, `ScriptRunStatus`, `ScriptRunItemStatus`, `ScriptRunEventType`, `ScriptAgentKey`, `ScriptShot`, and validation helpers.
- Produces tables for artifacts, chapters, chapter events, episodes, shots, prompt assets/occurrences, Agent profiles, Skills/versions, chats, Runs/items/events, and confirmations.

- [ ] Write failing domain tests for accepted modes/event types and rejected media task types.
- [ ] Add the domain unions and runtime guards.
- [ ] Add old-table upgrade columns first, then new tables and indexes with school/owner/project scope.
- [ ] Add a schema-order regression asserting every indexed/inserted column is created or added first.
- [ ] Run focused domain/schema tests and typecheck.
- [ ] Commit `feat(practice): add screenwriter agent domain schema`.

### Task 2: Script Agent repository and tenant isolation

**Files:**
- Create: `web/src/lib/server/database/script-agent-repository.ts`
- Create: `web/src/lib/server/database/script-agent-repository.test.ts`
- Modify: `web/src/lib/server/database/index.ts`

**Interfaces:**
- Consumes `PracticeTenantScope`.
- Produces CRUD functions for project tree/artifacts/chapters/episodes/shots/assets, chat sessions/messages, Runs/items/events, confirmations, profiles, and Skill versions.
- Every method receives tenant scope; no caller-provided tenant fields are trusted.

- [ ] Write failing parameterized-query tests for cross-school scope, ordered event sequence, item idempotency, and fresh profile reads.
- [ ] Implement the PostgreSQL repository with targeted queries and transactions.
- [ ] Add a bounded JSON-file fallback only where the project requires local fallback, without weakening PostgreSQL tenancy.
- [ ] Run repository tests and typecheck.
- [ ] Commit `feat(practice): persist screenwriter agent runs`.

### Task 3: Versioned built-in Skills and real Agent profiles

**Files:**
- Create: `web/src/lib/server/script-agent-skills.ts`
- Create: `web/src/lib/server/script-agent-skills.test.ts`
- Create: `web/src/lib/server/script-agent-profiles.ts`
- Create: `web/src/lib/server/script-agent-profiles.test.ts`
- Create: `web/src/lib/server/script-agent-seed.ts`

**Interfaces:**
- Produces built-in core Skills for orchestrator, novel planning/writing, chapter analysis, skeleton, adaptation, script writing/supervision, directing, storyboard, and asset prompts.
- Produces genre/carrier/specialty Skills and `compileScriptAgentInstructions(profile, project, selectedSkills)`.
- Produces fresh runtime profile resolution against enabled text logical models on `open-source-practice` channels.

- [ ] Write failing tests proving full Skill content, versions, selected genre/carrier composition, and no media tools.
- [ ] Implement concise original Skill seeds based on confirmed rules (do not copy unlicensed prompts).
- [ ] Implement idempotent database seeding and fresh profile resolution.
- [ ] Ensure each Agent has an independent model, temperature/reasoning/output policy, Skill bindings, and Tool allowlist.
- [ ] Run focused tests and typecheck.
- [ ] Commit `feat(practice): add versioned screenwriter skills`.

### Task 4: Safe Script tools and artifact materialization

**Files:**
- Create: `web/src/lib/server/script-agent-tools-v2.ts`
- Create: `web/src/lib/server/script-agent-tools-v2.test.ts`
- Modify: `web/src/lib/server/script-practice-format.ts`

**Interfaces:**
- Produces safe read/write tool definitions for project, story bible, chapters/events, adaptation, episodes/scripts, review, director plan, shots, and prompt assets.
- Produces `materializeScriptAgentArtifact` that validates structured model output and commits before an event is emitted.

- [ ] Write failing tests for tenant injection, version checks, one-to-five chapter enforcement, episode preservation, shot schema, prompt-asset dedupe, and media-tool rejection.
- [ ] Implement read tools with bounded queries.
- [ ] Implement write tools with versions and stable IDs.
- [ ] Implement screenplay block normalization and shot/prompt-asset validation.
- [ ] Run focused tests and typecheck.
- [ ] Commit `feat(practice): add safe screenwriter tools`.

### Task 5: Stable Runs, public event log, SSE replay, stop, and failed-item retry

**Files:**
- Create: `web/src/lib/server/script-agent-run-service.ts`
- Create: `web/src/lib/server/script-agent-run-service.test.ts`
- Create: `web/src/app/api/practice/scripts/[id]/runs/route.ts`
- Create: `web/src/app/api/practice/scripts/[id]/runs/[runId]/route.ts`
- Create: `web/src/app/api/practice/scripts/[id]/runs/[runId]/events/route.ts`
- Create: `web/src/app/api/practice/scripts/[id]/runs/[runId]/stop/route.ts`
- Create: `web/src/app/api/practice/scripts/[id]/runs/[runId]/retry-failed/route.ts`

**Interfaces:**
- Produces stable idempotent Run creation and event streaming with `Last-Event-ID`/`afterSequence` replay.
- `artifact_saved` exists only after the artifact transaction succeeds.
- Retry creates attempts only for failed items.

- [ ] Write failing service tests for duplicate client request, ordered events, reconnect replay, stopping, partial failure, and retry selection.
- [ ] Implement Run state transitions and per-item progress.
- [ ] Implement SSE with heartbeat from project configuration, persisted event replay, and abort on explicit stop only.
- [ ] Add Route Handler authentication and `requirePracticeTenant` checks.
- [ ] Run route/service tests and typecheck.
- [ ] Commit `feat(practice): stream persistent screenwriter runs`.

### Task 6: Real model execution and multi-Agent stage orchestration

**Files:**
- Create: `web/src/lib/server/script-agent-executor.ts`
- Create: `web/src/lib/server/script-agent-executor.test.ts`
- Create: `web/src/lib/server/script-agent-orchestrator.ts`
- Create: `web/src/lib/server/script-agent-orchestrator.test.ts`
- Modify: `web/src/lib/server/script-practice-model-runtime.ts`

**Interfaces:**
- Uses existing system AI proxy and configured logical-model candidates.
- Executes explicit operations: project planning, short story, novel outlines, 1–5 chapters, chapter analysis, adaptation bundle, episode scripts, supervision, director plan, storyboards, prompt assets, and conversational edit.
- Emits public deltas/status but never reasoning.

- [ ] Write failing local upstream fixture tests for streaming natural text plus structured tool output.
- [ ] Implement fresh profile/Skill resolution and system-proxy invocation.
- [ ] Implement deterministic operation-to-Agent dispatch and prerequisite gates.
- [ ] Implement chapter and episode item loops with success preservation and failure isolation.
- [ ] Implement supervision revisions and major-change decisions.
- [ ] Run fixture/service tests and typecheck.
- [ ] Commit `feat(practice): orchestrate screenwriter agents`.

### Task 7: Project tree, confirmations, import, and content APIs

**Files:**
- Create: `web/src/app/api/practice/scripts/[id]/tree/route.ts`
- Create: `web/src/app/api/practice/scripts/[id]/confirmations/route.ts`
- Create: chapter/episode/shot/prompt-asset Route Handlers under `web/src/app/api/practice/scripts/[id]/`
- Modify: `web/src/app/api/practice/scripts/route.ts`
- Modify: `web/src/app/api/practice/scripts/[id]/route.ts`
- Modify: `web/src/app/api/practice/scripts/import/route.ts`
- Modify: `web/src/lib/server/script-practice-service.ts`

**Interfaces:**
- Produces short/long project creation, tree projection, artifact reads/edits, 1–5 chapter requests, stage confirmation, and import preview/commit.

- [ ] Write failing route tests for short/long creation, import ownership, gate enforcement, tree states, and stale downstream marking.
- [ ] Implement project mode/parameters and tree projection.
- [ ] Implement confirmation records and downstream stale transitions.
- [ ] Upgrade import to chapter preview and safe commit.
- [ ] Run route/service tests and typecheck.
- [ ] Commit `feat(practice): expose screenwriter project workflow`.

### Task 8: Admin Screenwriter Agent control center

**Files:**
- Create: `web/src/app/api/admin/practice-script/overview/route.ts`
- Create: Agent/Skill/Tool/integration-test routes under `web/src/app/api/admin/practice-script/`
- Modify: `web/src/components/admin/admin-practice-section.tsx`
- Create: `web/src/components/admin/admin-practice-script-agent.tsx`
- Create: `web/src/components/admin/admin-practice-script-agent.test.tsx`
- Modify: admin API service files used by the dashboard

**Interfaces:**
- Fresh-read overview and Agent profiles.
- Agent test and integration test call the real model/Skill/Tool path using isolated data.
- Skill editor creates immutable versions; Tool management changes allowlists only.

- [ ] Write failing tests for valid open-source text models, independent Agent profiles, Skill version saves, immediate read-after-write, and full integration-test evidence.
- [ ] Implement overview and Agent profile table/drawer.
- [ ] Implement Skill tree/editor/version history and Tool bindings.
- [ ] Implement real isolated integration test and cleanup.
- [ ] Run admin tests and typecheck.
- [ ] Commit `feat(admin): configure screenwriter agents`.

### Task 9: Three-column workspace and real SSE reactions

**Files:**
- Replace: `web/src/app/(user)/practice/scripts/script-practice-workspace.tsx`
- Create: focused private components/hooks under `web/src/app/(user)/practice/scripts/components/`
- Modify: `web/src/services/api/practice-scripts.ts`
- Create: `web/src/app/(user)/practice/scripts/script-practice-workspace.test.tsx`

**Interfaces:**
- Left project tree; center artifact renderers; right persistent Agent chat.
- Connects by stable Run, handles all public events, reloads saved artifacts, and recovers active Runs.

- [ ] Write failing component tests for three columns, short/long trees, streaming deltas, saved-artifact replacement, stop, reconnect, confirmation gates, failed-only retry, and no raw JSON.
- [ ] Implement typed API/SSE client.
- [ ] Implement left tree and progress/failure badges.
- [ ] Implement center renderers for planning, novel, screenplay, review, shot table, and prompt assets.
- [ ] Implement right chat with Agent identities, history, streaming, stop, and retry.
- [ ] Remove fixed stage-button workflow and raw JSON previews.
- [ ] Run component tests, typecheck, and targeted browser regression at desktop width.
- [ ] Commit `feat(practice): rebuild screenwriter workspace`.

### Task 10: Full closure, docs, browser validation, and delivery

**Files:**
- Modify: `docs/backend-database.md` or active equivalent
- Modify: `VOZEB-PRO-接口索引.md`
- Modify: `VOZEB-PRO-开发地图.md`
- Add focused Playwright coverage under existing e2e structure if required

**Interfaces:**
- Produces a deployable end-to-end short-story and long-novel workflow.

- [ ] Run short-story browser closure through final text storyboard and prompt assets.
- [ ] Run long-novel closure through outlines, selected 1–5 chapters, adaptation, episode scripts, review, storyboards, and prompt assets.
- [ ] Verify refresh/reconnect, stop, failed-only retry, tenant revocation, backend config changes, and zero media tasks.
- [ ] Run typecheck, lint, format, full Vitest, and production build once after final code settles.
- [ ] Run strict UTF-8/garble check and `git diff --check`.
- [ ] Run development-map update and validation scripts.
- [ ] Commit final docs, fetch/merge current `origin/develop` without overwriting user work, and push `develop`.
- [ ] Watch staging workflow through deployment and health readiness; report any external deployment blocker with evidence.
