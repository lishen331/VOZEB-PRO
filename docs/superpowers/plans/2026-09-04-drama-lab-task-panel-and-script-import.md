# 短剧实验室任务状态与剧本导入修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended; tasks are already split for parallel work). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变普通 Canvas、教师/学生、商单算力和平台账户边界的前提下，为短剧实验室补齐 L 风格的统一任务状态/取消闭环，并修复 TXT/MD 剧本中文乱码与拖拽导入。

**Architecture:** 任务面板复用平台 `generation_tasks` 作为唯一事实源，按短剧项目过滤任务，在左侧剧集列表下方展示活动任务，并通过服务端任务 ID 执行取消、轮询和刷新恢复。剧本文件在浏览器端按 BOM、UTF-8 和 GB18030 解码后再提交现有小说导入 API；拖拽和文件选择共用同一个读取入口，保留预览、确认导入、2MB 限制和失败回滚。

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, lucide-react, Vitest, Testing Library, PostgreSQL-backed `generation_tasks`.

## Global Constraints

- 范围严格限定为 `drama-lab`；不得修改普通 Canvas、教师/学生管理、学校/商单算力、个人积分和平台通用生成业务语义。
- 不新增第二套任务事实表；任务状态、任务 ID、取消和恢复必须复用 `generation_tasks` 及现有任务运行时。
- 取消必须是服务端状态迁移；不能只停止浏览器轮询或用前端 `setTimeout` 冒充取消。
- 活动任务必须按项目隔离，包含剧集/分镜坐标；刷新、切换剧集和重新进入页面后能够恢复。
- 上游不支持取消时必须明确显示“取消请求已记录/停止继续轮询”，不得虚报上游已经取消。
- 剧本导入必须保留 TXT/MD、JSON/multipart、2MB 限制、预览确认、`sourceRange` 和失败回滚现有契约。
- 每个新增行为先写会失败的 Vitest/组件测试，再写最小实现；不得降低现有测试断言来掩盖回归。
- 不提交截图、临时 YAML、`.playwright-cli/` 或其他与本次功能无关的协作者文件。

---

### Task 1: 短剧实验室统一任务面板与取消链路

**Files:**
- Create: `web/src/lib/server/drama-lab-task-service.ts`
- Create: `web/src/lib/server/drama-lab-task-service.test.ts`
- Create: `web/src/app/api/drama-lab/projects/[id]/tasks/route.ts`
- Create: `web/src/app/api/drama-lab/projects/[id]/tasks/route.test.ts`
- Create: `web/src/app/(user)/drama-lab/[id]/drama-lab-task-panel.tsx`
- Create: `web/src/app/(user)/drama-lab/[id]/drama-lab-task-panel.test.tsx`
- Modify: `web/src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx`
- Modify: existing short-drama task API/service files only when required to give direct extraction tasks a durable `generation_tasks` record.

**Interfaces:**
- `GET /api/drama-lab/projects/:id/tasks?status=active` returns only authorized tasks for that project, including `id`, `taskType`, `status`, `executionPhase`, `projectId`, `episodeId`, `shotId`, `progress`, `currentStep`, `error`, and cancellation capability.
- `POST /api/drama-lab/projects/:id/tasks/:taskId/cancel` or the repository-equivalent action endpoint performs an idempotent server-side cancellation after project authorization.
- `DramaLabTaskPanel` consumes a normalized project-scoped task list and exposes per-task cancel plus parent workflow cancel; it does not own generation truth.
- Direct asset/storyboard extraction calls must either create durable text tasks or use an existing durable task runtime before the UI advertises cancellation; aborting `fetch` alone is not sufficient.

- [ ] **Step 1: Write failing service and route tests** for project filtering, task coordinates, terminal-task cancellation rejection, idempotent cancellation, and unauthorized/cross-project access.
- [ ] **Step 2: Run the focused tests and confirm they fail** for the missing task read/cancel contract.
- [ ] **Step 3: Implement the task read model and cancel route** by reusing `generation_tasks`, existing authorization, cancellation, recovery, billing and upstream cancellation services.
- [ ] **Step 4: Run the service/route tests and confirm they pass** without changing non-drama task behavior.
- [ ] **Step 5: Write failing component tests** for the L-style panel: active count, task label with episode/shot, indeterminate progress when no percentage exists, cancel button, collapsed badge, terminal error/retry display, and refresh rehydration.
- [ ] **Step 6: Implement `DramaLabTaskPanel` and wire it below the episode list** in `drama-workflow-lab-project-complete.tsx`; keep workflow modal detail but make the project panel the persistent source of active status.
- [ ] **Step 7: Integrate story, asset, storyboard, image, video, audio, workflow, review and export task producers** so each long-running operation has a task ID and no duplicate polling; preserve completed partial results on cancellation.
- [ ] **Step 8: Run focused component tests, the existing drama-lab task/recovery tests, typecheck and lint.**
- [ ] **Step 9: Commit only the task-panel/cancel files** with message `feat(drama-lab): add unified task status panel and cancellation`.

### Task 2: 剧本导入编码修复与拖拽导入

**Files:**
- Create: `web/src/lib/drama-novel-text-decoder.ts`
- Create: `web/src/lib/drama-novel-text-decoder.test.ts`
- Modify: `web/src/app/(user)/drama-lab/[id]/drama-lab-novel-import.tsx`
- Modify: `web/src/app/(user)/drama-lab/[id]/drama-lab-novel-import.test.tsx` (create if absent)
- Modify: `web/src/app/api/drama-lab/projects/[id]/import-novel/route.test.ts` only for decoding/contract regression coverage that belongs at the API boundary.

**Interfaces:**
- `decodeDramaNovelBytes(bytes: ArrayBuffer): { text: string; encoding: "utf-8" | "utf-16le" | "utf-16be" | "gb18030" }` detects UTF-8/UTF-16 BOMs, validates UTF-8 without replacement, then falls back to GB18030 for legacy Chinese TXT/MD files.
- `DramaLabNovelImport` sends selected and dropped files through the same `readSource(file)` path, validates extension and 2MB before decode, resets the input after processing, and keeps preview/confirm behavior unchanged.

- [ ] **Step 1: Write failing decoder tests** for UTF-8 BOM, UTF-16LE/BE BOM, valid UTF-8 without BOM, GB18030 Chinese bytes, malformed UTF-8 fallback, and the existing 2MB/extension rules.
- [ ] **Step 2: Run the decoder tests and confirm they fail** because `File.text()` currently assumes UTF-8.
- [ ] **Step 3: Implement byte-based decoding** using `ArrayBuffer`, BOM detection, fatal UTF-8 decoding, and `TextDecoder("gb18030")` fallback with a clear error when no supported decoder exists.
- [ ] **Step 4: Run decoder tests and confirm they pass.**
- [ ] **Step 5: Write failing component tests** for drag-over/drop state, accepted `.txt`/`.md` drop, rejected file feedback, and reuse of the same preview request as file selection.
- [ ] **Step 6: Add an accessible drop zone** around the “导入小说” control with keyboard/file-picker fallback, `preventDefault` drag handlers, visual drag state, and no changes to preview confirmation or server import semantics.
- [ ] **Step 7: Run component/API import tests, typecheck, lint and `git diff --check`.**
- [ ] **Step 8: Commit only the decoder/import files** with message `fix(drama-lab): decode legacy scripts and support drag import`.

### Task 3: 集成回归与人工验收准备

**Files:**
- Modify: relevant focused tests only after Tasks 1–2 are integrated.
- Create: `docs/testing/2026-09-04-drama-lab-task-and-import-checklist.md`

- [ ] **Step 1: Run both task commits together** and verify no unrelated worktree files are staged.
- [ ] **Step 2: Run focused Vitest, full TypeScript check, lint, production build and the existing Drama Lab Playwright smoke tests.**
- [ ] **Step 3: Start/verify `http://127.0.0.1:3002`, then manually test task visibility/cancellation after story, asset, storyboard, image, video and audio actions.**
- [ ] **Step 4: Manually test UTF-8, UTF-8 BOM, GB18030 and UTF-16 TXT/MD files, picker and drag/drop, preview, confirm, refresh and import failure rollback.**
- [ ] **Step 5: Record any real supplier, PostgreSQL/Worker or multi-instance limitations as environment acceptance items, not as fake UI success.**

## Validation Commands

Run from `web`:

```powershell
corepack pnpm exec vitest run src/lib/server/drama-lab-task-service.test.ts src/app/api/drama-lab/projects/[id]/tasks/route.test.ts src/lib/drama-novel-text-decoder.test.ts src/app/(user)/drama-lab/[id]/drama-lab-novel-import.test.tsx --reporter=verbose
corepack pnpm typecheck --pretty false
corepack pnpm lint
corepack pnpm exec prettier --check .
git diff --check
```

The task panel must be tested on desktop and 390px/430px widths; the drop zone must remain usable when the left sidebar is collapsed.
