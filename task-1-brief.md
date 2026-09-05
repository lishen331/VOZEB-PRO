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

