# RunningHub Demo 工作流闭环嫁接实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以同事已跑通的 RunningHub Demo 为标准，修复平台后台配置、拉取 JSON、真实测试与无限练习前端调用之间的闭环，并在不改变现有五张单项练习大卡片的前提下接入七条流程。

**Architecture:** 继续使用 `system_model_channels.advanced_config.workflowConfigs` 作为第一版工作流持久化边界，扩展其为 Demo 型 Workflow 聚合；新增共享执行准备服务，统一完成输入校验、媒体上传、拓扑处理、`nodeInfoList` 生成和官方 RunningHub 请求。后台测试、无限练习和现有生成任务运行时都调用该服务，历史任务继续使用当前生成任务与练习会话存储。

**Tech Stack:** Next.js App Router、TypeScript、React、Ant Design 6、Tailwind、Vitest、Playwright、PostgreSQL/JSON 文件后备、RunningHub 本地 TCP fixture。

## Global Constraints

- 不复制 Demo 的页面视觉；无限练习继续使用 VOZEB PRO 当前主题、卡片、字体、图标和响应式布局。
- 现有剧本、分镜图、分镜视频、配音、音乐五张首组单项练习大卡片的 DOM、顺序、尺寸、文案和交互保持不变。
- 不删除现有 `workflowConfigs`、`modelConfigs`、逻辑模型或渠道数据；新结构必须从当前已部署结构幂等升级。
- 后台测试和用户前端调用必须共享同一套输入解析、上传、拓扑、提交、查询和结果映射代码。
- API Key、Workflow ID、节点 ID、完整请求体、完整上游响应和原始 Workflow JSON 不得返回给普通用户。
- PostgreSQL 在线功能按用户、实体、状态、时间窗、分页或聚合定向查询；不得读取整张业务表后在 Node.js 筛选。
- 每次代码修改后运行相关 Vitest 和类型检查；收尾运行 lint、typecheck、全量测试、build、Playwright 和开发文档验证。
- 中文源码、配置、脚本和文档保存为 UTF-8；交付前严格解码检查 `U+FFFD`、`U+951F`、`U+65A4`、`U+62F7`。
- 接口、页面、Service、Schema、Worker 或部署拓扑变化时，在同一个提交中更新 `VOZEB-PRO-接口索引.md`、`VOZEB-PRO-开发地图.md`。

---

### Task 1: 建立 Demo 型 Workflow 契约与七条初始目录

**Files:**
- Create: `web/src/lib/server/runninghub-demo-workflow-catalog.ts`
- Create: `web/src/lib/server/runninghub-demo-workflow-catalog.test.ts`
- Modify: `web/src/lib/auth/store-types.ts`
- Modify: `web/src/lib/server/runninghub-workflow-domain.ts`
- Modify: `web/src/lib/auth/store-normalizers-channel.ts`
- Modify: `web/src/lib/server/runninghub-workflow-domain.test.ts`

**Interfaces:**
- Produces `RunningHubWorkflowCode`, `RunningHubWorkflowAdapterType`, `RunningHubGenerationSizeOption` and the expanded `RunningHubWorkflowConfig` used by Tasks 2-6.
- Produces `demoRunningHubWorkflowCatalog()` returning the seven non-secret catalog entries copied from `过程文件/Runninghub-demo/Runninghub-demo/src/main/resources/dev-runninghub-workflows.json`.
- Keeps `workflowKey` as platform record identity and adds `workflowCode` as stable Demo/business identity.

- [ ] **Step 1: Add failing contract assertions**

Assert the seven exact codes and IDs, for example:

```ts
expect(demoRunningHubWorkflowCatalog().map((item) => item.workflowCode)).toEqual([
  "character_main_view", "scene_main_view", "prop_main_view",
  "character_multi_view", "storyboard_shot",
  "storyboard_dialogue_audio", "storyboard_shot_video",
]);
expect(demoRunningHubWorkflowCatalog().find((item) => item.workflowCode === "storyboard_shot_video")).toMatchObject({
  workflowId: "2079446871415808002", adapterType: "storyboard-shot-video", capability: "video",
});
```

Assert that `workflowCode`, `adapterType`, `workflowApiJson`, `generationSizeOptions`, `remark`, `source`, and `sourceVersion` survive normalization and enter the configuration fingerprint.

- [ ] **Step 2: Implement the contract and catalog**

Extend `web/src/lib/auth/store-types.ts` with:

```ts
export type RunningHubWorkflowCode = string;
export type RunningHubWorkflowAdapterType =
  | "character-main-view" | "character-multi-view" | "scene-main-view"
  | "prop-main-view" | "storyboard-shot" | "storyboard-dialogue-audio"
  | "storyboard-shot-video" | "generic";
export type RunningHubGenerationSizeOption = {
  key: string; label: string; width?: number; height?: number; value?: string; disabled?: boolean;
};
```

Add optional migration-safe fields to `RunningHubWorkflowConfig`: `workflowCode`, `workflowApiJson`, `generationSizeOptions`, `remark`, `source`, `sourceVersion`, `adapterType`, and `adapterVersion`. New Demo records populate all of them; old records remain readable with `workflowCode` falling back to `workflowKey` during normalization.

Implement `demoRunningHubWorkflowCatalog()` from the checked-in Demo JSON. Preserve full input schema, node mappings, output mappings, runtime options, size options, timeout and API JSON; do not read Demo SQLite, `.master-key`, uploads or API keys.

- [ ] **Step 3: Include new fields in normalization and fingerprinting**

Bound every new string/array/object in `normalizeRunningHubWorkflowConfig()`. Include `workflowCode`, adapter metadata, API JSON fingerprint, size options and runtime options in `runningHubWorkflowConfigFingerprint()`. Keep existing legacy protocol fields intact.

- [ ] **Step 4: Run focused tests and typecheck**

```powershell
pnpm --dir web vitest run src/lib/server/runninghub-demo-workflow-catalog.test.ts src/lib/server/runninghub-workflow-domain.test.ts
pnpm --dir web run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add web/src/lib/auth/store-types.ts web/src/lib/auth/store-normalizers-channel.ts web/src/lib/server/runninghub-demo-workflow-catalog.ts web/src/lib/server/runninghub-demo-workflow-catalog.test.ts web/src/lib/server/runninghub-workflow-domain.ts web/src/lib/server/runninghub-workflow-domain.test.ts
git commit -m "feat: add RunningHub Demo workflow contract"
```

### Task 2: 复刻 Demo 输入解析、拓扑处理与官方 RunningHub 请求

**Files:**
- Create: `web/src/lib/server/runninghub-workflow-adapter.ts`
- Create: `web/src/lib/server/runninghub-workflow-adapter.test.ts`
- Modify: `web/src/lib/server/runninghub-workflow-runtime.ts`
- Modify: `web/src/lib/server/runninghub-provider.ts`
- Modify: `web/src/lib/server/runninghub-workflow-test-service.ts`
- Modify: `web/src/app/api/image-tasks/image-task-custom.ts`
- Modify: `web/src/app/api/video-generation-tasks/video-generation-route.ts`
- Modify: `web/src/lib/server/audio-task-runtime.ts`
- Modify: `web/src/lib/server/text-task-runtime.ts`
- Modify: `web/src/lib/server/runninghub-provider.test.ts`
- Modify: `web/src/lib/server/runninghub-workflow-runtime.test.ts`

**Interfaces:**
- Produces `prepareRunningHubWorkflowExecution(input)` returning `{ payload, nodeInfoList, workflowJsonOverride, resolvedInput }`.
- Consumes a normalized `RunningHubWorkflowConfig`, public business input and references `{ type, inputKey, url, assetId }`.
- Admin tests and generation runtimes consume this result; they do not construct a second `nodeInfoList` path.

- [ ] **Step 1: Write failing adapter/provider tests**

Cover Demo rules: no-reference character removes nodes `131/147/148/154` and strips `178.image`; no-reference prop removes `13/68` and `59.images.image_1`; storyboard requires `sceneImage`, packs the three prop/character slots left-to-right and removes later empty branches; video rounds duration upward and removes audio when disabled; dialogue maps valid lines to `s1`-`s10` without allocating pauses. Assert official create/query/upload paths and payload fields match the Demo client.

- [ ] **Step 2: Implement the shared adapter**

Use `inputSchema` for required/type/enum validation and `nodeMappings` for `STRING`, `NUMBER`, `BOOLEAN`, `JSON` conversion. Port the Demo topology rules into named adapter functions selected by `adapterType`. Return a parsed workflow override for topology changes and the final `nodeInfoList` for diagnostics.

```ts
export type RunningHubWorkflowExecution = {
  payload: Record<string, unknown>;
  nodeInfoList: Array<{ nodeId: string; fieldName: string; fieldValue: unknown }>;
  resolvedInput: Record<string, unknown>;
  workflowJsonOverride?: string;
};
export function prepareRunningHubWorkflowExecution(input: {
  config: RunningHubWorkflowConfig;
  businessInput: Record<string, unknown>;
  references: RunningHubWorkflowReference[];
}): RunningHubWorkflowExecution;
```

- [ ] **Step 3: Make provider requests match Demo**

For official paths, submit `apiKey`, `workflowId`, `nodeInfoList`, `workflow` and the allowlisted runtime options at the top level. Keep custom-path compatibility for legacy records. Query with `POST /openapi/v2/query` and `{ taskId }`; upload through `POST /openapi/v2/media/upload/binary`; retain API-key redaction.

- [ ] **Step 4: Route admin test submission through the adapter**

Replace the direct payload builder in `runninghub-workflow-test-service.ts` with the shared preparation function. Store the resolved node list, adapter version and workflow override in the isolated admin test record, then use the same submit/query functions as generation tasks.

- [ ] **Step 5: Run focused tests and commit**

```powershell
pnpm --dir web vitest run src/lib/server/runninghub-workflow-adapter.test.ts src/lib/server/runninghub-provider.test.ts src/lib/server/runninghub-workflow-runtime.test.ts src/lib/server/runninghub-workflow-test-service.test.ts
pnpm --dir web run typecheck
git add web/src/lib/server/runninghub-workflow-adapter.ts web/src/lib/server/runninghub-workflow-adapter.test.ts web/src/lib/server/runninghub-workflow-runtime.ts web/src/lib/server/runninghub-provider.ts web/src/lib/server/runninghub-workflow-test-service.ts web/src/lib/server/runninghub-provider.test.ts web/src/lib/server/runninghub-workflow-runtime.test.ts web/src/lib/server/runninghub-workflow-test-service.test.ts
git commit -m "feat: share RunningHub Demo workflow execution"
```

### Task 3: 加入 Demo 初始化、拉取保存与后台测试闭环 API

**Files:**
- Create: `web/src/app/api/admin/runninghub/workflows/bootstrap/route.ts`
- Create: `web/src/app/api/admin/runninghub/workflows/[workflowKey]/fetch-json/route.ts`
- Modify: `web/src/lib/server/runninghub-workflow-service.ts`
- Modify: `web/src/lib/server/admin-workflow-test-store.ts`
- Modify: `web/src/app/api/admin/runninghub/workflows/discover/route.ts`
- Modify: `web/src/app/api/admin/runninghub/workflows/[workflowKey]/test/route.ts`
- Modify: `web/src/app/api/admin/runninghub/workflows/[workflowKey]/test/[runId]/route.ts`
- Modify tests: `web/src/lib/server/runninghub-workflow-service.test.ts`, `web/src/app/api/admin/runninghub/workflows/route.test.ts`, `web/src/app/api/admin/runninghub/workflows/discover/route.test.ts`

**Interfaces:**
- `initializeDemoRunningHubWorkflows({ channelId, overwrite?: false })` returns `{ added, updated, skipped, workflowKeys }` and never overwrites manually modified data unless `overwrite: true` is explicit.
- `fetchAndSaveWorkflowJson(workflowKey)` calls the fixed JSON endpoint, saves `workflowApiJson` and `workflowJsonFingerprint`, and returns a sanitized summary.
- Routes return `{ code, data, msg }` and enforce `upstream.manage`.

- [ ] **Step 1: Add failing service/API tests**

Assert bootstrap is idempotent, preserves an existing modified remark, imports all seven IDs, and does not enable records automatically. Assert fetch-json persists the snapshot and updates the fingerprint. Assert admin test output carries the same workflow code, adapter version, task ID, outputs and error as the shared execution record.

- [ ] **Step 2: Implement bootstrap and fetch-json**

Merge by `workflowCode`, not display name or Workflow ID. Validate each catalog entry against the existing domain validator and persist through `setAuthSettings`. Keep discovery as a candidate-analysis endpoint, but make the saved workflow path explicit so “读取工作流” no longer returns only transient data.

- [ ] **Step 3: Make task diagnostics safe**

Persist final node mappings and adapter metadata for administrators. Redact API keys, bearer tokens, signed URLs and credential-like fields before returning DTOs. Keep task ID, status, outputs, errors and timestamps visible to administrators.

- [ ] **Step 4: Run tests, typecheck and commit**

```powershell
pnpm --dir web vitest run src/lib/server/runninghub-workflow-service.test.ts src/lib/server/runninghub-workflow-test-service.test.ts src/app/api/admin/runninghub/workflows/route.test.ts src/app/api/admin/runninghub/workflows/discover/route.test.ts
pnpm --dir web run typecheck
git add web/src/app/api/admin/runninghub/workflows web/src/lib/server/runninghub-workflow-service.ts web/src/lib/server/admin-workflow-test-store.ts
git commit -m "feat: close RunningHub workflow admin loop"
```

### Task 4: 按 Demo 工作流后台形态修复管理员界面

**Files:**
- Modify: `web/src/components/admin/channels/runninghub-workflow-list.tsx`
- Modify: `web/src/components/admin/channels/runninghub-workflow-editor.tsx`
- Modify: `web/src/components/admin/channels/runninghub-workflow-test-panel.tsx`
- Modify: `web/src/components/admin/channels/runninghub-channel-fields.tsx`
- Modify tests: `web/src/components/admin/channels/runninghub-workflow-list.test.tsx`, `web/src/components/admin/channels/runninghub-channel-fields.test.tsx`
- Modify E2E: `web/e2e/admin-runninghub-workflow.spec.ts`, `web/e2e/admin-runninghub-workflow-discovery.spec.ts`

**Interfaces:**
- The list uses bootstrap and fetch-json APIs while preserving current create/edit/delete/enable actions.
- The editor saves Demo metadata, input schema, node mappings, output mappings, runtime options, size options, JSON snapshot, remark and adapter metadata.
- The test panel renders schema-driven inputs and file slots, submits multipart files with the correct `inputKey`, and only queries when the administrator clicks “查询状态”.

- [ ] **Step 1: Add component tests**

Test workflow code/source/test status rendering, bootstrap invocation, JSON snapshot and size-option round trip, multipart file-key mapping, and action-column geometry within the viewport.

- [ ] **Step 2: Implement the Demo-shaped editor flow**

Keep existing advanced fields readable, but make the primary workflow tabs: 基础配置、输入契约、节点与产物、运行配置、上游 JSON、测试运行. Add “初始化 Demo 工作流” and “从 RunningHub 拉取最新 JSON”. Use a responsive Drawer width no greater than `100vw` at 390px and 430px. Do not expose secrets or full upstream responses to normal user DTOs.

- [ ] **Step 3: Run admin browser regression**

```powershell
pnpm --dir web run e2e -- e2e/admin-runninghub-workflow.spec.ts e2e/admin-runninghub-workflow-discovery.spec.ts
```

The test must cover bootstrap, edit, fetch JSON, real sample submission, explicit status inspection, enable-after-success, refresh persistence, mobile Drawer geometry, and anonymous denial.

- [ ] **Step 4: Typecheck and commit**

```powershell
pnpm --dir web run typecheck
git add web/src/components/admin/channels web/e2e/admin-runninghub-workflow.spec.ts web/e2e/admin-runninghub-workflow-discovery.spec.ts
git commit -m "fix: align RunningHub workflow admin with Demo"
```

### Task 5: 扩展无限练习会话并按 Workflow Code 调度

**Files:**
- Modify: `web/src/lib/practice-domain.ts`
- Modify: `web/src/lib/server/practice-module-service.ts`
- Modify: `web/src/lib/server/practice-session-service.ts`
- Modify: `web/src/lib/server/database/repository-types.ts`
- Modify: `web/src/lib/server/database/practice-repository.ts`
- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `web/src/lib/server/database/postgres.test.ts`
- Modify: `web/src/lib/server/generation-task-types.ts`
- Modify: `web/src/lib/server/generation-task-store.ts`
- Modify: `web/src/lib/server/runninghub-workflow-runtime.ts`
- Modify: `web/src/app/api/practice/sessions/route.ts`
- Modify: `web/src/app/api/practice/sessions/[id]/route.ts`
- Modify tests: `web/src/lib/server/practice-module-service.test.ts`, `web/src/lib/server/practice-session-service.test.ts`, `web/src/lib/server/database/practice-repository.test.ts`

**Interfaces:**
- Extend `PracticeModuleKind` with `character`, `scene`, and `prop`; keep `script`, `storyboard-image`, `storyboard-video`, `dubbing`, and `music` valid.
- Add `workflowCode`, `workflowVersion`, `workflowConfigFingerprint`, and `workflowAdapterVersion` to durable practice sessions and generation task context.
- Add `resolveEnabledPracticeWorkflow(settings, workflowCode)` that searches only enabled, tested RunningHub workflows in `open-source-practice` or `shared` channels.
- Existing logical-model bindings remain readable for legacy modules, but new Demo workflow submissions resolve by stable `workflowCode` first; the browser never submits channel IDs, Workflow IDs, node IDs or templates.

- [ ] **Step 1: Write failing service and migration tests**

Test that all eight practice module values are accepted, each Demo module resolves its exact workflow code, an untested/disabled workflow is unavailable, and a session round trip preserves workflow metadata. Add schema assertions that new columns are added before indexes and the module check is upgraded with `ALTER TABLE ... DROP CONSTRAINT` then `ADD CONSTRAINT`.

- [ ] **Step 2: Add the PostgreSQL/file-compatible session fields**

Extend `practice_sessions` with idempotent migrations:

```sql
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS workflow_code text;
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS workflow_version integer;
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS workflow_config_fingerprint text;
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS workflow_adapter_version integer;
ALTER TABLE practice_sessions DROP CONSTRAINT IF EXISTS practice_sessions_module;
ALTER TABLE practice_sessions ADD CONSTRAINT practice_sessions_module CHECK (
  module IN ('script', 'character', 'scene', 'prop', 'storyboard-image', 'storyboard-video', 'dubbing', 'music')
);
```

Add the same fields to `PracticeSessionRecord`, insert/update/select mapping in `practice-repository.ts`, and JSON-file normalization. Do not rebuild `practice_sessions` or depend on `CREATE TABLE IF NOT EXISTS` to change an existing table.

- [ ] **Step 3: Resolve Demo workflow identity before legacy model routing**

Use this mapping in `practice-session-service.ts`:

```ts
const PRACTICE_WORKFLOW_BY_MODULE = {
  character: "character_main_view",
  scene: "scene_main_view",
  prop: "prop_main_view",
  "storyboard-image": "storyboard_shot",
  "storyboard-video": "storyboard_shot_video",
  dubbing: "storyboard_dialogue_audio",
} as const;
```

For a requested `workflowCode`, resolve the exact enabled configuration and its channel, then pass that channel/workflow context into the existing generation task route. The `character` module accepts either `character_main_view` or `character_multi_view`; `character_main_view` is the default when the client omits `workflowCode`. For `music` and `script`, preserve current logical-model behavior. If a legacy module has both a requested model and a workflow code, validate they refer to the same capability and channel instead of silently switching.

- [ ] **Step 4: Preserve trusted workflow context through task creation and retry**

Extend `GenerationTaskContext` and its database serialization with `workflowCode` and `workflowAdapterVersion`. Ensure create, recovery, query, result persistence and retry use the stored `workflowKey + version + fingerprint`, not the current latest configuration. Keep `needs_review` and `submission_outcome_unknown` semantics unchanged.

- [ ] **Step 5: Normalize Demo-specific public input**

Make `normalizePracticeModuleInput()` validate the exact special forms: character multi-view requires a source image; storyboard shot requires `sceneImage`; video accepts image and optional audio; dialogue accepts structured line/audio/emotion input and caps the public line form at the Demo-supported `s1`-`s10` schema. Do not add an arbitrary output cap or polling limit.

- [ ] **Step 6: Run service, repository and type tests**

```powershell
pnpm --dir web vitest run src/lib/server/practice-module-service.test.ts src/lib/server/practice-session-service.test.ts src/lib/server/database/practice-repository.test.ts src/lib/server/database/postgres.test.ts
pnpm --dir web run typecheck
```

Run PostgreSQL integration files with `--no-file-parallelism` when a shared test database is configured.

- [ ] **Step 7: Update structural docs and commit**

Run from the repository root:

```powershell
pwsh -NoProfile -File .\过程文件\更新开发地图.ps1
pwsh -NoProfile -File .\过程文件\验证开发文档.ps1
```

Review the generated diff, keep only the changed API/page/service/schema entries, then commit the code and both document updates together:

```powershell
git add web/src/lib/practice-domain.ts web/src/lib/server/practice-module-service.ts web/src/lib/server/practice-session-service.ts web/src/lib/server/database web/src/lib/server/generation-task-types.ts web/src/lib/server/generation-task-store.ts web/src/lib/server/runninghub-workflow-runtime.ts web/src/app/api/practice/sessions VOZEB-PRO-接口索引.md VOZEB-PRO-开发地图.md
git commit -m "feat: route practice sessions by workflow code"
```

### Task 6: 接入角色、场景、道具及七条流程的前端练习表单

**Files:**
- Modify: `web/src/services/api/practice.ts`
- Modify: `web/src/app/(user)/practice/components/practice-home.tsx`
- Modify: `web/src/app/(user)/practice/components/practice-module-workbench.tsx`
- Modify: `web/src/app/(user)/practice/components/practice-panel-types.tsx`
- Create: `web/src/app/(user)/practice/components/practice-character-panel.tsx`
- Create: `web/src/app/(user)/practice/components/practice-scene-panel.tsx`
- Create: `web/src/app/(user)/practice/components/practice-prop-panel.tsx`
- Modify: `web/src/app/(user)/practice/components/practice-storyboard-image-panel.tsx`
- Modify: `web/src/app/(user)/practice/components/practice-storyboard-video-panel.tsx`
- Modify: `web/src/app/(user)/practice/components/practice-dubbing-panel.tsx`
- Modify: `web/src/app/(user)/practice/components/practice-session-status.ts`
- Modify tests: `web/src/app/(user)/practice/page.test.tsx`, `web/src/app/(user)/practice/components/practice-home.test.tsx`, `web/src/app/(user)/practice/components/practice-module-workbench.test.tsx`
- Create/Modify E2E: `web/e2e/infinite-practice-runninghub-workflow.spec.ts`, `web/e2e/infinite-practice-module-workbenches.spec.ts`

**Interfaces:**
- `practiceApi.createSession()` accepts optional `workflowCode` and typed references while preserving the current `{ module, title, input, references, clientRequestId }` contract.
- `PracticeModuleCapability` exposes the server-approved public input schema and workflow availability; it never includes raw node IDs or API JSON.
- The new asset cards use existing card primitives and theme classes; no Demo-specific navigation bar or palette is introduced.

- [ ] **Step 1: Add failing component tests**

Assert the original five cards remain in the same DOM order and have the same titles. Assert a second “创作资产练习” section contains exactly 角色练习、场景练习、道具练习. Assert role mode switching shows 主形象/多视图 without a numbered process bar and that all buttons have usable disabled/focus states.

- [ ] **Step 2: Implement the new modules without changing the first card group**

Add the three module kinds to the route and panel dispatch. Keep the existing `PRACTICE_MODULES` entries unchanged and add a separate asset-card constant. Use `UserRound`, `PanelsTopLeft`/an existing scene icon, and `Box`/an existing prop icon from `lucide-react` only where those icons already match the application style.

- [ ] **Step 3: Implement Demo-specific forms**

Role panel: use a compact `Segmented` control for 主形象/多视图; main view accepts prompt, width, height and optional image; multi-view requires a main image and exposes the four Demo direction prompts and optional dimensions. Scene panel accepts prompt and size preset. Prop panel accepts prompt, width, height and optional image. These panels submit the stable workflow code rather than a guessed model ID.

Update storyboard image to require a scene image and expose up to three role/prop image slots. Update video to accept a storyboard image, prompt, optional duration/size, and an explicit audio toggle with an audio reference. Update dubbing to collect valid dialogue lines and per-line voice/emotion inputs matching `s1`-`s10`; pauses remain presentation-only and are not sent as slots.

- [ ] **Step 4: Preserve result/history/retry behavior**

Keep `PracticeSessionResult`, history, refresh, delete and retry components unchanged where possible. Ensure new module sessions use the same `recordId/taskId` references, show pending/failed/success states, and retry the original session instead of creating a new one.

- [ ] **Step 5: Run component tests, typecheck and browser regression**

```powershell
pnpm --dir web vitest run src/app/\(user\)/practice/page.test.tsx src/app/\(user\)/practice/components/practice-home.test.tsx src/app/\(user\)/practice/components/practice-module-workbench.test.tsx
pnpm --dir web run typecheck
pnpm --dir web run e2e -- e2e/infinite-practice-runninghub-workflow.spec.ts e2e/infinite-practice-module-workbenches.spec.ts
```

The browser run must cover desktop, 390px and 430px, light/dark themes, no horizontal overflow, role multi-view missing-reference blocking, media upload references, status recovery after refresh and one-click retry.

- [ ] **Step 6: Commit the practice UI slice**

```powershell
git add web/src/services/api/practice.ts web/src/app/\(user\)/practice web/e2e/infinite-practice-runninghub-workflow.spec.ts web/e2e/infinite-practice-module-workbenches.spec.ts
git commit -m "feat: add Demo workflow practice modules"
```

### Task 7: 本地闭环 fixture、全量验证与交付文档

**Files:**
- Modify: `web/scripts/runninghub-workflow-fixture.mjs`
- Create/Modify tests: `web/src/lib/server/runninghub-demo-workflow-e2e-contract.test.ts`, `web/e2e/admin-runninghub-workflow-demo-bootstrap.spec.ts`, `web/e2e/infinite-practice-demo-workflows.spec.ts`
- Modify: `docs/content/docs/backend/backend-database.mdx` only if the final migration introduces a new table or documented persistent column group
- Modify: `VOZEB-PRO-接口索引.md`, `VOZEB-PRO-开发地图.md`

**Interfaces:**
- The fixture accepts the Demo official endpoints and returns deterministic task IDs, pending/success/failure states, image/video/audio outputs and JSON fetch snapshots for all seven workflow codes.
- E2E uses the fixture port from `VOZEB_PRO_RUNNINGHUB_FIXTURE_PORT`; it never reads production admin channels or real API keys.

- [ ] **Step 1: Extend the local fixture for the seven contracts**

Add fixture branches for `/api/openapi/getJsonApiFormat`, `/openapi/v2/media/upload/binary`, `/task/openapi/create`, and `/openapi/v2/query`. Record the incoming `workflowId`, `nodeInfoList`, `workflow`, uploaded file names, audio switch and duration so tests can assert that the platform sent the Demo-shaped request.

- [ ] **Step 2: Add contract tests for every workflow**

For each catalog entry, run the shared preparation function and fixture request, then assert task ID, query status, required output type, result URL/media format, and failure reason. Add explicit assertions that default reference files are not submitted when real assets are supplied and that the topology override is present when a branch must be removed.

- [ ] **Step 3: Add end-to-end admin-to-user proof**

The admin E2E must bootstrap, fetch, edit, test, inspect, enable and reload one workflow. The user E2E must create sessions for role main view, role multi-view, scene, prop, storyboard image, storyboard video and dialogue audio using the same enabled workflow configuration and confirm results are restored after reload. Assert that a failed session retry updates the original session identity.

- [ ] **Step 4: Synchronize development documents**

From the repository root run:

```powershell
pwsh -NoProfile -File .\过程文件\更新开发地图.ps1
pwsh -NoProfile -File .\过程文件\验证开发文档.ps1
```

Resolve any interface-index or development-map count drift in the generator/baseline before continuing. Do not hand-edit unrelated generated entries.

- [ ] **Step 5: Run Mandatory Testing**

From `web`:

```powershell
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
pnpm run e2e
```

Run the relevant PostgreSQL integration tests with `--no-file-parallelism` when `DATABASE_URL` is configured. Verify the local fixture is used, no real RunningHub credential was read, and browser screenshots/geometry cover desktop, 390px, 430px, light and dark themes.

- [ ] **Step 6: Verify encoding, diff and status before final commit**

```powershell
git diff --check
git status --short
```

Strictly decode every changed text file as UTF-8 and fail on `U+FFFD`, `U+951F`, `U+65A4`, or `U+62F7`. Review that `output/`, `.env`, credentials and unrelated generated files are absent.

- [ ] **Step 7: Commit the fixture/docs slice**

```powershell
git add web/scripts/runninghub-workflow-fixture.mjs web/src/lib/server/runninghub-demo-workflow-e2e-contract.test.ts web/e2e/admin-runninghub-workflow-demo-bootstrap.spec.ts web/e2e/infinite-practice-demo-workflows.spec.ts VOZEB-PRO-接口索引.md VOZEB-PRO-开发地图.md docs/content/docs/backend/backend-database.mdx
git commit -m "test: verify RunningHub Demo workflow closure"
```

## Self-Review Checklist

- [ ] **Spec coverage:** Tasks 1-2 cover the complete Demo data model, seven workflow mappings, topology, upload and official protocol. Tasks 3-4 cover initialization, JSON read/save, admin test, enable evidence and the existing backend UI. Task 5 covers durable workflow identity, migrations, task recovery and legacy compatibility. Task 6 covers the three new cards, role merge, existing card preservation, all specialized forms and responsive browser behavior. Task 7 covers local fixture, all seven end-to-end paths, docs and mandatory gates.
- [ ] **No placeholders:** Every task names exact files, interfaces, test commands and expected behavior; there are no `TBD`, `TODO`, or unspecified “handle edge cases” steps.
- [ ] **Type consistency:** `workflowCode`, `adapterType`, `prepareRunningHubWorkflowExecution`, `resolveEnabledPracticeWorkflow`, and the new practice module names are used consistently across the tasks.
- [ ] **Migration safety:** Existing JSON channel storage and `practice_sessions`/`generation_tasks` tables are preserved; all new columns and constraints use ordered idempotent upgrade statements.
- [ ] **Closure proof:** The final admin and user E2E tests use the same local fixture and shared execution service, proving that a successful backend test corresponds to a callable frontend workflow.
