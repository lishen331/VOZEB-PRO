# Short Drama Lab Prompt and Frame Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Short Drama Lab's abbreviated prompt bodies with LocalMiniDrama's nine mature templates and complete the server-owned first/key/last frame generation loop without changing other VOZEB modules.

**Architecture:** Keep the existing Short Drama Lab routes and project JSON contract, adding a Short Drama Lab-only global prompt scope and a typed frame state on each shot. The server composes editable templates with project context, validates real asset IDs, calls text planning for frame prompts, sanitizes the result, and then creates image/video tasks with bound primary references. Existing fields and routes remain readable as compatibility aliases.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL schema SQL, Vitest, ESLint, Prettier, existing image/video/text task stores.

## Global Constraints

- Every change is limited to Short Drama Lab pages, `/api/drama-lab/*`, `/api/admin/drama-lab/*`, and Short Drama Lab-owned schema/service code.
- `/drama/[id]`, generic image/video routes, Canvas, Agent, and other modules must retain existing behavior.
- Template scope is global only inside Short Drama Lab; runtime must not select a template by administrator `user_id`.
- Server-side fixed contracts and asset ID validation cannot be overridden by editable template text.
- Existing successful media and legacy shot fields must remain readable and must not be cleared by failed generation.

---

### Task 1: Migrate the nine Short Drama Lab templates and make their scope lab-global

**Files:**
- Modify: `web/src/lib/drama-lab-prompt-templates.ts`
- Modify: `web/src/lib/server/drama-lab-prompt-template-service.ts`
- Modify: `web/src/app/api/admin/drama-lab/prompt-templates/route.ts`
- Modify: `web/src/app/api/admin/drama-lab/prompt-templates/[id]/route.ts`
- Modify: `web/src/lib/server/database/schema-drama-lab.ts`
- Modify: `web/src/app/admin/drama-lab-config/page.tsx`
- Test: `web/src/lib/drama-lab-prompt-templates.test.ts`
- Test: `web/src/lib/server/drama-lab-prompt-template-service.test.ts`
- Test: `web/src/app/api/admin/drama-lab/prompt-templates/route.test.ts`

**Interfaces:**
- `resolveDramaLabPrompt(key)` continues to return `{ key, template, customized }`, but reads the single Short Drama Lab global override.
- Admin list returns exactly the nine built-in rows; admin PUT updates a built-in row; DELETE removes that built-in's Short Drama Lab override.
- Legacy keys `story_generation` and `storyboard_output_format` resolve to L's canonical `story_expansion_system` and `storyboard_user_suffix` definitions.

- [ ] **Step 1: Add failing tests** for complete L-body markers, legacy-key mapping, global resolution independent of the requesting admin, and rejection of an unbound custom template.
- [ ] **Step 2: Run the focused tests and confirm the new expectations fail.**
- [ ] **Step 3: Copy the nine LocalMiniDrama default bodies and locked suffixes into the Short Drama Lab definitions, add canonical/legacy key mapping, and keep the server contract appended after editable text.
- [ ] **Step 4: Change the schema/API resolver to use a Short Drama Lab global scope. Migrate existing rows by selecting the latest override per template key, add a unique global-key index, and keep admin authorization around writes.
- [ ] **Step 5: Remove the admin UI's create-custom path and render only the nine bound system templates with edit/reset actions.
- [ ] **Step 6: Run the focused prompt tests and the Short Drama Lab admin route tests; expect all to pass.**
- [ ] **Step 7: Commit `feat(drama-lab): migrate global prompt templates`.**

### Task 2: Add L-compatible shot context and server-side prompt sanitization

**Files:**
- Modify: `web/src/lib/drama-project-contract.ts`
- Modify: `web/src/lib/server/drama-project-service.ts`
- Modify: `web/src/lib/server/drama-lab-storyboard-extraction-service.ts`
- Modify: `web/src/lib/server/drama-lab-shot-generation-service.ts`
- Create: `web/src/lib/server/drama-lab-frame-prompt-sanitize.ts`
- Test: `web/src/lib/server/drama-lab-frame-prompt-sanitize.test.ts`
- Test: `web/src/lib/server/drama-lab-storyboard-extraction-service.test.ts`

**Interfaces:**
- `DramaShot` gains optional L context fields: `shotType`, `cameraAngle`, `location`, `time`, `action`, `result`, `emotion`, `emotionIntensity`, and `layoutDescription`.
- `sanitizeDramaLabFramePrompt(prompt, allowedNames, allNames)` returns `{ prompt, report }` and never adds an unbound asset.
- Storyboard normalization accepts only project asset IDs and persists the new context fields.

- [ ] **Step 1: Add failing tests for layout/context persistence, unlisted character removal, appearance normalization, scene appearance cleanup, and modern prop boilerplate cleanup.
- [ ] **Step 2: Run the focused tests and confirm failure.
- [ ] **Step 3: Port the relevant LocalMiniDrama sanitization rules into a small TypeScript service with deterministic reports.
- [ ] **Step 4: Extend the storyboard tool contract and normalizer with L context fields while preserving existing VOZEB fields and ID rejection.
- [ ] **Step 5: Include asset profiles, primary references, character whitelist, spatial layout, and prop-scale constraints in the server shot context builder.
- [ ] **Step 6: Run extraction, sanitization, and service tests; expect all to pass.
- [ ] **Step 7: Commit `feat(drama-lab): preserve storyboard context contracts`.**

### Task 3: Implement text-planned first/key/last frame generation

**Files:**
- Modify: `web/src/lib/drama-project-contract.ts`
- Modify: `web/src/lib/server/drama-project-service.ts`
- Create: `web/src/lib/server/drama-lab-frame-generation-service.ts`
- Create: `web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/generate-frame/route.ts`
- Modify: `web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/generate-image/route.ts`
- Modify: `web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/generate-video/route.ts`
- Modify: `web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/sync-generation/route.ts`
- Test: `web/src/lib/server/drama-lab-frame-generation-service.test.ts`
- Test: `web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/generate-frame/route.test.ts`

**Interfaces:**
- `DramaShot.frames?: Record<"first" | "key" | "last", DramaShotFrameState>` stores prompt, task ID, status, URL, dimensions, error, and history.
- `prepareDramaLabFrame(project, episodeId, shotId, frameType)` performs template resolution, context composition, text-model JSON parsing, sanitization, and reference selection.
- `POST .../generate-frame?episodeId=<id>&frameType=<first|key|last>` creates the image task from the prepared server prompt.

- [ ] **Step 1: Add failing tests for each frame template, strict `{ prompt, description }` parsing, sanitized prompt persistence, first-frame reference ordering, last-frame layout lock, and invalid frame types.
- [ ] **Step 2: Run the focused tests and confirm failure.
- [ ] **Step 3: Implement the typed frame state and normalization with bounded history retention.
- [ ] **Step 4: Implement text-model planning using the existing logical model router, billing headers, structured response helper, and Short Drama Lab text-generation log.
- [ ] **Step 5: Implement image task creation using only the shot's bound primary asset references; for `last`, prepend the available first-frame image reference.
- [ ] **Step 6: Route the existing key-frame image action through the new service and preserve the old response shape.
- [ ] **Step 7: Update video preparation to read persisted frame results and send first/last roles when available, with the key image as a supplementary reference.
- [ ] **Step 8: Extend sync to reconcile per-frame tasks, reject tasks owned by another user, and retry project writes after one version conflict.
- [ ] **Step 9: Run focused frame, route, and existing shot-generation tests; expect all to pass.
- [ ] **Step 10: Commit `feat(drama-lab): add server-planned frame generation`.**

### Task 4: Connect the Short Drama Lab workbench to the three frame states

**Files:**
- Modify: `web/src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx`
- Modify: `web/src/app/(user)/drama-lab/[id]/drama-lab-visual-assets-panel.tsx`
- Test: `web/src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.test.tsx`
- Test: `web/src/app/(user)/drama-lab/[id]/drama-lab-visual-assets-panel.test.tsx`

**Interfaces:**
- The workbench invokes only `generate-frame` for first/key/last and displays each frame's independent status, prompt, media, retry, and history.
- Asset changes invalidate only affected frame tasks and continue to use the server route.
- The video action remains disabled until the required persisted frame reference is available.

- [ ] **Step 1: Add failing component tests for frame buttons, frame-specific status, retry/history controls, and absence of generic front-end prompt concatenation.
- [ ] **Step 2: Run the component tests and confirm failure.
- [ ] **Step 3: Replace the single generic storyboard-image control with first/key/last frame controls while preserving the existing compact workbench layout.
- [ ] **Step 4: Wire polling and reload to the per-frame task IDs and keep existing save-success behavior.
- [ ] **Step 5: Run the Short Drama Lab component suite at desktop and narrow viewport snapshots where available.
- [ ] **Step 6: Commit `feat(drama-lab): expose three frame states in workbench`.**

### Task 5: Full verification and documentation closeout

**Files:**
- Modify: `docs/content/docs/progress/drama-lab-prompt-frame-closure-alignment.mdx`
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Test: all Short Drama Lab prompt, extraction, frame, route, and workbench tests.

- [ ] **Step 1: Run the complete Short Drama Lab Vitest selection and record the count.
- [ ] **Step 2: Run targeted ESLint, Prettier, and `git diff --check`.
- [ ] **Step 3: Run TypeScript and document only pre-existing unrelated errors if they remain.
- [ ] **Step 4: Perform authenticated browser verification of the admin template scope and Short Drama Lab frame workflow; record unavailable credentials or upstream model blockers explicitly.
- [ ] **Step 5: Mark the alignment document and pending-test checklist with verified items.
- [ ] **Step 6: Commit `test(drama-lab): verify prompt and frame closure`.**
