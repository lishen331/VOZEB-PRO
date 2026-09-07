# RunningHub Infinite Practice Six Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align infinite practice with the six Demo modules and seven RunningHub workflows, add per-entry visibility controls, migrate existing enabled workflows, and make testing advisory rather than blocking.

**Architecture:** Keep the existing specialized practice panels and task routes. Add normalized visibility settings consumed by the practice home and capability service, derive RunningHub practice routing during settings normalization, and retain `requiresRetest` only as an administrator warning signal.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Vitest, Playwright.

## Global Constraints

- Preserve existing workflow input fields, prompt generation, size controls, references, and task execution.
- Do not modify unrelated login-page work already present in the worktree.
- Verify desktop and 390px only; do not run 430px checks.
- Use focused tests and one related browser regression, not full-suite gates unless pushing.

---

### Task 1: Migrate historical RunningHub workflow routing

**Files:**
- Create: `web/src/lib/auth/runninghub-practice-routing.ts`
- Create: `web/src/lib/auth/store-normalizers-runninghub-practice.test.ts`
- Modify: `web/src/lib/auth/store-normalizers.ts`
- Modify: `web/src/lib/server/runninghub-workflow-service.ts`

- [ ] Add a failing normalization test for an already-enabled `prop_main_view` workflow without legacy model bindings.
- [ ] Derive the channel model, logical model, model config, and practice binding from enabled non-stale workflows.
- [ ] Reuse the derivation when an administrator enables a workflow.
- [ ] Verify normalization, module options, and session resolution.

### Task 2: Add infinite-practice entry visibility settings

**Files:**
- Modify: `web/src/lib/auth/store-types.ts`
- Modify: `web/src/lib/auth/store-foundation.ts`
- Modify: `web/src/lib/auth/store-normalizers.ts`
- Modify: `web/src/components/admin/admin-configuration-sections.tsx`
- Modify: `web/src/components/admin/use-admin-dashboard-settings-actions.tsx`
- Test: `web/src/lib/auth/store-normalizers-practice-workflow.test.ts`

- [ ] Add a failing normalization test for defaults and persisted visibility values.
- [ ] Add normalized settings for canvas, drama, character, scene, prop, storyboard image, storyboard video, and audio.
- [ ] Add compact administrator switches under an Infinite Practice section.
- [ ] Persist changes through the existing settings action.

### Task 3: Align the practice homepage to six cards

**Files:**
- Modify: `web/src/app/(user)/practice/components/practice-home.tsx`
- Modify: `web/src/app/(user)/practice/components/practice-home.test.tsx`
- Modify: `web/src/lib/server/practice-module-service.ts`
- Modify: `web/src/lib/server/practice-module-service.test.ts`

- [ ] Add failing tests for six-card order and hidden modules.
- [ ] Render character, scene, prop, storyboard image, storyboard video, and audio cards in one sequence.
- [ ] Hide canvas and drama by default and honor administrator visibility values.
- [ ] Filter hidden capabilities server-side while keeping existing panel inputs unchanged.

### Task 4: Make workflow testing advisory

**Files:**
- Modify: `web/src/lib/server/runninghub-workflow-domain.ts`
- Modify: `web/src/lib/server/runninghub-workflow-domain.test.ts`
- Modify: `web/src/lib/server/runninghub-workflow-service.ts`
- Modify: `web/src/lib/server/runninghub-workflow-service.test.ts`
- Modify: `web/src/components/admin/channels/runninghub-workflow-list.tsx`

- [ ] Add failing service tests showing an untested complete workflow can be enabled.
- [ ] Remove only the successful-test evidence rejection; retain structural validation.
- [ ] Require administrator confirmation when enabling a workflow whose `requiresRetest` is true.
- [ ] Keep the list status explicit: verified versus unverified.

### Task 5: Focused verification

- [ ] Run relevant Vitest files and TypeScript/targeted ESLint.
- [ ] Run the RunningHub administrator E2E and desktop/390px infinite-practice E2E.
- [ ] Run `git diff --check` and verify unrelated work remains untouched.
