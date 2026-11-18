# 无限练习 Canvas 四项图像工具 Implementation Plan

> **For agentic workers:** This is the execution checklist for this feature. Follow red-green-refactor for behavior changes and do not touch the user's existing untracked files.

**Goal:** Deliver four standalone Infinite Practice tools—reverse prompt, local edit, expression reference, and super-resolution—with optional explicit saving to the personal asset library.

**Architecture:** Four small server routes share one typed client workbench. A server-only practice task proxy validates tool/input and resolves practice-only models before dispatching through existing generation task APIs. Local super-resolution reuses the Canvas image utility. The current generated result is held in the workbench until the student explicitly saves it.

**Tech Stack:** Next.js App Router, React, TypeScript, existing Gamma UI, existing image-storage and library-assets services, Vitest.

## Global Constraints

- Do not alter Canvas tool defaults, node callbacks, or graph semantics.
- Do not silently use production models or retry another model.
- Only explicit user action may save a generated result to personal assets.
- Never accept a model/channel/execution profile from the client as authoritative.
- Avoid database schema or PracticeModuleKind expansion for these tools in v1.

---

### Task 1: Define tool routing and metadata with tests

**Files:**
- Create: `web/src/lib/practice-image-tools.ts`
- Test: `web/src/lib/practice-image-tools.test.ts`
- Modify: `web/src/app/(user)/practice/components/practice-home.tsx`

**Interfaces:** `PracticeImageToolId`, `PRACTICE_IMAGE_TOOL_ENTRIES`, `getPracticeImageToolConfig(id)`.

- [ ] Add failing tests for exactly four stable IDs, route paths, labels, and rejecting unknown slugs.
- [ ] Run `pnpm --dir web exec vitest run src/lib/practice-image-tools.test.ts` and confirm expected failure.
- [ ] Implement metadata and add four entries to home `PRACTICE_TOOL_ENTRIES`, widening its ID type without changing 3D Director Desk.
- [ ] Re-run the test and `practice-home` component tests.

### Task 2: Add four access-checked pages and shared workbench shell

**Files:**
- Create: `web/src/app/(user)/practice/reverse-prompt/page.tsx`
- Create: `web/src/app/(user)/practice/local-edit/page.tsx`
- Create: `web/src/app/(user)/practice/expression-reference/page.tsx`
- Create: `web/src/app/(user)/practice/super-resolution/page.tsx`
- Create: `web/src/app/(user)/practice/components/practice-image-tool-workbench.tsx`
- Test: `web/src/app/(user)/practice/components/practice-image-tool-workbench.test.tsx`

**Interfaces:** Each server page calls the existing `requirePracticeAccess` server helper then renders shared workbench with its constant tool ID. Workbench state is discriminated by `PracticeImageToolId`.

- [ ] Add failing render tests covering per-tool control visibility, result retention on retry failure, and no save until user clicks.
- [ ] Verify RED with targeted Vitest.
- [ ] Implement pages/workbench using Gamma UI tokens/components and existing `PracticeAssetPicker`/upload controls.
- [ ] Verify GREEN, including route permission checks and mobile-safe responsive layout.

### Task 3: Implement safe server-side practice task proxy

**Files:**
- Create: `web/src/app/api/practice/image-tools/route.ts`
- Create: `web/src/app/api/practice/image-tools/route.test.ts`
- Modify if needed: existing task dispatch helpers only where a reusable server function can be extracted without behavior changes.

**Interfaces:** POST `{ toolId, prompt?, sourceUrl, maskUrl?, options? }`; response contains `{ taskId, taskType, resolvedModelId }` or safe error. Allowed tool/capability mapping is server-owned.

- [ ] Test unauthenticated and no-practice-access denial; reject unknown tool, invalid URL/MIME, prompt omissions, unsupported tool-task pair, and client-supplied model/profile/channel fields.
- [ ] Test server resolves only a model/channel usable for `open-source-practice`, records the correct billing/execution context, and never falls back to production.
- [ ] Run API route tests and observe expected RED.
- [ ] Implement service-side validation and dispatch: reverse prompt→text visual task; local edit/expression→image edit task with references; super-resolution rejected by AI proxy.
- [ ] Ensure error response redacts secrets and exposes stable diagnostic fields; run tests GREEN.

### Task 4: Wire generation results and user-controlled asset save

**Files:**
- Modify: `web/src/app/(user)/practice/components/practice-image-tool-workbench.tsx`
- Create/modify tests: workbench tests

**Interfaces:** workbench tracks task ID/status, result text/media, resolved model, safe error, and save state. Save uses `createLibraryAsset` only after explicit click.

- [ ] Test successful result renders preview/editable prompt and save control; clicking save once creates exactly one image asset.
- [ ] Test failure/retry preserves source image, prompt, mask/settings, and previous successful result; save errors leave result available.
- [ ] Wire existing task polling/result resolution and image-storage upload; implement explicit save action with duplicate-submit guard.
- [ ] Verify all tests GREEN and confirm no automatic save side-effect.

### Task 5: Implement local super-resolution safely

**Files:**
- Modify: `web/src/app/(user)/practice/components/practice-image-tool-workbench.tsx`
- Test: `web/src/app/(user)/practice/components/practice-image-tool-workbench.test.tsx`

- [ ] Test super-resolution calls `upscaleDataUrl` with selected scale/parameters and does not call practice task proxy or create AI generation tasks.
- [ ] Verify RED, wire existing Canvas utility and result upload, allow preview/download and explicit optional save.
- [ ] Run targeted tests and ensure GREEN.

### Task 6: Full verification and scope audit

**Files:** no feature changes unless a failing requirement is found.

- [ ] Run formatter/lint for touched files, targeted Vitest suites, TypeScript check, and production build.
- [ ] Verify all four routes and homepage card links in browser at desktop and mobile widths.
- [ ] Audit Canvas-related diff to confirm no existing toolbar defaults or Canvas behaviors changed.
- [ ] Audit save behavior and API execution profile; confirm no generated result auto-saved and no production fallback.
- [ ] Report test evidence and list any upstream capability/config dependency that prevents live generation.
