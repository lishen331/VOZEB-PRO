# 无限练习独立剧本模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 VOZEB-PRO 的 `open-source-practice` 范围内，实现一个单人专业剧本练习模块，支持从创意或已有剧本开始、分阶段生成、结构化编辑、AI 局部修改、版本管理和标准格式导入导出。

**Architecture:** 复用 `script-gen-ai` 的剧本块、Fountain/FDX 和 AI 工具化编辑思想，在 VOZEB-PRO 内部重新实现。剧本数据、版本、权限和模型调用全部使用 VOZEB-PRO；不迁移 Loro Sync、多人协作、Supabase、Laper 独立 API 或商业生成链路。第一期只生成和编辑剧本文本，不创建图片、视频、音频或漫剧任务。

**Tech Stack:** Next.js App Router、React、TypeScript、Ant Design、Tailwind、PostgreSQL、Vitest、Playwright；本地剧本模型使用 VOZEB-PRO 既有本地/兼容文本模型调用链，默认候选为 Qwen3。

## Global Constraints

- 所有新接口只允许服务 `executionProfile = open-source-practice` 的剧本项目。
- 不修改商业闭源模块、商业模型、商业积分、正式生产渠道或现有七条图片/视频/音频工作流。
- 业务接口继续使用 `{ code, data, msg }` 响应结构。
- Route Handler 只处理鉴权、输入解析、调用 service 和响应映射；业务规则放在 `web/src/lib/server/`。
- 所有查询必须按当前 `userId` 和剧本项目 ID 定向查询，禁止读取完整数据库后在 Node.js 筛选。
- 已有持久化 PostgreSQL 环境的 Schema 变更必须提供幂等升级语句；不能依赖 `CREATE TABLE IF NOT EXISTS` 修改旧表结构。
- AI 生成结果先进入草稿/待审核状态；写入剧本文档必须使用用户确认和稳定版本身份。
- AI 工具不得访问任意 SQL、商业模块、媒体任务创建接口或其他用户项目。
- 不保存或展示模型隐式思维链；只保存公开生成结果、工具调用摘要、修改 Patch 和错误摘要。
- 用户等待 AI 时继续编辑，迟到响应不得覆盖新内容；服务端必须校验 `baseVersionId` 或返回冲突状态。
- 每次代码改动必须运行相关 Vitest、类型检查和对应 Playwright 回归；收尾按仓库 Mandatory Testing 执行全量门禁。

---

## 现状和迁移边界

### 当前可复用能力

- 用户、Session、权限和 `open-source-practice` 执行档案。
- `web/src/app/api/practice/` 下的练习入口和会话模式。
- `web/src/lib/server/` 的服务、Repository、任务和审计模式。
- 现有本地/兼容文本模型调用能力。
- 现有数据库初始化和迁移写法。
- `script-gen-ai` 中可借鉴的结构：`ScriptBlock`、Fountain/FDX 解析、Plate/Slate 编辑交互、`read_script`、`read_entities`、`edit_script`、`edit_entities`。

### 明确不迁移

- `laper-lorosync/` 和 Loro 多人同步。
- Laper Supabase、独立鉴权、社区、订阅和独立 API。
- 多人光标、协作成员、评论协作和共享项目。
- Laper 的商业后台、Cloudflare 资产链路和独立 Chat 服务。
- 任何自动创建生图、生视频、配音或漫剧项目的动作。

---

## 目标接口与领域契约

### ScriptBlock

```ts
export type ScriptBlock =
    | { id: string; type: "scene-heading"; text: string }
    | { id: string; type: "action"; text: string }
    | { id: string; type: "character"; text: string }
    | { id: string; type: "parenthetical"; text: string }
    | { id: string; type: "dialogue"; text: string }
    | { id: string; type: "transition"; text: string }
    | { id: string; type: "note"; text: string };
```

### ScriptPracticeProject

```ts
export type ScriptPracticeProject = {
    id: string;
    userId: string;
    title: string;
    genre?: string;
    logline?: string;
    synopsis?: string;
    status: "draft" | "writing" | "completed";
    sourceType: "idea" | "fountain" | "fdx" | "text" | "markdown";
    currentVersionId?: string;
    createdAt: number;
    updatedAt: number;
};
```

### ScriptStage

```ts
export type ScriptStageKey = "idea" | "synopsis" | "outline" | "entities" | "scenes" | "screenplay" | "revision";
export type ScriptStageStatus = "not_started" | "draft" | "generating" | "awaiting_review" | "confirmed" | "failed" | "stale";
```

### ScriptAgentOperation

```ts
export type ScriptAgentOperation =
    | "generate_synopsis"
    | "generate_outline"
    | "generate_entities"
    | "generate_scenes"
    | "generate_screenplay"
    | "rewrite_selection"
    | "expand_selection"
    | "polish_selection"
    | "enhance_conflict"
    | "check_continuity"
    | "validate_format";
```

### 公开 API 草案

```text
POST /api/practice/scripts
GET  /api/practice/scripts
POST /api/practice/scripts/import
GET  /api/practice/scripts/:id
PATCH /api/practice/scripts/:id
DELETE /api/practice/scripts/:id
GET  /api/practice/scripts/:id/versions
POST /api/practice/scripts/:id/versions
POST /api/practice/scripts/:id/agent
POST /api/practice/scripts/:id/agent/:operation/apply
GET  /api/practice/scripts/:id/export?format=fountain|fdx|pdf|text
```

实际路径必须遵循当前项目已有 API 目录约定；实施时若已有同名路由，扩展现有入口而不是创建重复接口。

---

## Task 1: 固化领域类型、解析器边界和许可证清单

**Files:**

- Create: `web/src/lib/script-practice-types.ts`
- Create: `web/src/lib/script-practice-contract.ts`
- Create: `web/src/lib/server/script-practice-format.ts`
- Create: `web/src/lib/server/script-practice-format.test.ts`
- Create: `docs/third-party/script-gen-ai-migration-inventory.md`
- Modify: `VOZEB-PRO-接口索引.md` only if exported API inventory changes in this task.

**Interfaces:**

- Consumes: `script-gen-ai` 的公开剧本块类型、Fountain/FDX 行为和当前 VOZEB-PRO 的 JSON/时间字段习惯。
- Produces: 后续任务使用的 `ScriptBlock`、`ScriptDocument`、`ScriptEntity`、`ScriptStage`、`ScriptVersion`、导入/导出函数签名。

- [ ] **Step 1: Write failing tests for block normalization.**

```ts
import { describe, expect, it } from "vitest";
import { normalizeScriptDocument } from "./script-practice-format";

describe("script practice format", () => {
    it("keeps professional screenplay block types and drops invalid blocks", () => {
        const result = normalizeScriptDocument({
            blocks: [
                { id: "s1", type: "scene-heading", text: "INT. STATION - NIGHT" },
                { id: "a1", type: "action", text: "林默走进车站。" },
                { id: "bad", type: "unknown", text: "不应保留" },
            ],
        });
        expect(result.blocks).toEqual([
            { id: "s1", type: "scene-heading", text: "INT. STATION - NIGHT" },
            { id: "a1", type: "action", text: "林默走进车站。" },
        ]);
    });
});
```

- [ ] **Step 2: Run the focused test and verify it fails.**

Run from `C:\CODE\VOZEB-PRO\web`:

```powershell
pnpm vitest run src/lib/server/script-practice-format.test.ts
```

Expected: FAIL because the new contract and normalizer do not exist.

- [ ] **Step 3: Implement the minimal types and normalizer.**

`normalizeScriptDocument` must:

1. Accept unknown JSON.
2. Keep only the seven supported block types.
3. Trim text but preserve intentional internal newlines.
4. Reject empty blocks except `note` when the note is explicitly retained by the caller.
5. Preserve stable block IDs when valid; generate IDs only for imported blocks that have no ID.
6. Return a document with `schemaVersion` and `updatedAt`.

- [ ] **Step 4: Add Fountain/FDX adapter contracts without copying unrelated Laper code.**

Define these functions:

```ts
export function parseFountain(source: string): ScriptDocument;
export function serializeFountain(document: ScriptDocument): string;
export function parseFdx(source: string): ScriptDocument;
export function serializeFdx(document: ScriptDocument): string;
export function serializePlainText(document: ScriptDocument): string;
```

The first implementation may support the block types required by the module and must return explicit parse errors for unsupported or malformed input.

- [ ] **Step 5: Add source inventory and license notes.**

Record the source repository URL, pinned commit `6f56f0cb942a65d2b752bafadb82bb363efa0d24`, copied behavior boundaries, files inspected, and whether each item is reimplemented or directly reused. Do not claim the repository is Laper’s official production source.

- [ ] **Step 6: Run focused tests and typecheck.**

```powershell
pnpm vitest run src/lib/server/script-practice-format.test.ts
pnpm typecheck
```

Expected: PASS.

---

## Task 2: Add PostgreSQL persistence for single-user script practice

**Files:**

- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `web/src/lib/server/database/repository-types.ts`
- Modify: `web/src/lib/server/database/repositories.ts`
- Create: `web/src/lib/server/database/script-practice-repository.ts`
- Create: `web/src/lib/server/database/script-practice-repository.test.ts`
- Modify: `docs/backend-database.md` or the current canonical database document if the repository uses another path.

**Interfaces:**

- Consumes: Task 1 domain types and current user/session repository conventions.
- Produces: user-scoped CRUD and version APIs used by service and route tasks.

- [ ] **Step 1: Add failing repository tests.**

Cover:

```ts
it("creates and reads a project only for its owner", async () => { /* ... */ });
it("stores a structured script version and restores it", async () => { /* ... */ });
it("rejects applying a patch against a stale base version", async () => { /* ... */ });
it("lists projects with user and pagination filters", async () => { /* ... */ });
```

The integration file must use the repository’s shared PostgreSQL test convention and run with `--no-file-parallelism` when schema locks or cleanup are involved.

- [ ] **Step 2: Add idempotent tables and indexes.**

Use separate tables so commercial generation tables are untouched:

```sql
CREATE TABLE IF NOT EXISTS practice_script_projects (...);
CREATE TABLE IF NOT EXISTS practice_script_documents (...);
CREATE TABLE IF NOT EXISTS practice_script_entities (...);
CREATE TABLE IF NOT EXISTS practice_script_stages (...);
CREATE TABLE IF NOT EXISTS practice_script_versions (...);
CREATE TABLE IF NOT EXISTS practice_script_agent_operations (...);
```

The migration must include:

- owner/user ID;
- project ID;
- structured JSON document;
- version and parent version;
- source and operation;
- stage status;
- model/skill/workflow snapshots where applicable;
- created/updated timestamps;
- indexes beginning with owner and project IDs;
- unique constraints for `(project_id, version)` and stable entity IDs.

If a table already exists in any persistent environment, add missing fields using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` before constraints and indexes.

- [ ] **Step 3: Implement owner-scoped repository methods.**

Required methods:

```ts
createScriptProject(input, ownerUserId)
getScriptProject(id, ownerUserId)
listScriptProjects(ownerUserId, options)
updateScriptProject(id, ownerUserId, patch)
deleteScriptProject(id, ownerUserId)
getCurrentScriptDocument(projectId, ownerUserId)
createScriptVersion(input, ownerUserId)
listScriptVersions(projectId, ownerUserId, options)
getScriptVersion(projectId, versionId, ownerUserId)
compareAndSetCurrentVersion(projectId, ownerUserId, baseVersionId, nextVersionId)
upsertScriptEntity(projectId, ownerUserId, entity)
listScriptEntities(projectId, ownerUserId, type?)
setScriptStage(projectId, ownerUserId, stage)
recordScriptAgentOperation(input, ownerUserId)
```

- [ ] **Step 4: Verify persistence, ownership, and migration behavior.**

Run:

```powershell
pnpm vitest run src/lib/server/database/script-practice-repository.test.ts --no-file-parallelism
pnpm typecheck
```

Expected: PASS, with a non-owner read returning not-found/forbidden according to the repository convention without leaking whether the project exists.

---

## Task 3: Implement the local script-model runtime and staged generation service

**Files:**

- Create: `web/src/lib/server/script-practice-model-runtime.ts`
- Create: `web/src/lib/server/script-practice-stage-service.ts`
- Create: `web/src/lib/server/script-practice-agent-service.ts`
- Create: `web/src/lib/server/script-practice-agent-tools.ts`
- Create: `web/src/lib/server/script-practice-model-runtime.test.ts`
- Create: `web/src/lib/server/script-practice-agent-service.test.ts`
- Modify: existing local text model resolver only if needed, without changing commercial behavior.

**Interfaces:**

- Consumes: Task 1 contracts and Task 2 repository methods.
- Produces: staged generation, tool-controlled edits, confirmation patches, and local-model audit records.

- [ ] **Step 1: Write failing runtime tests with a local TCP fixture.**

The fixture must assert:

```ts
it("sends only the selected script stage and public context to the local model", async () => { /* ... */ });
it("does not persist hidden reasoning content", async () => { /* ... */ });
it("returns a structured synopsis result", async () => { /* ... */ });
it("rejects a response that cannot be normalized into the requested stage schema", async () => { /* ... */ });
```

Do not call an administrator-configured real provider. Use a per-run idle random TCP port and fixed test credentials as required by `AGENTS.md`.

- [ ] **Step 2: Define the model runtime contract.**

```ts
export type ScriptModelRequest = {
    modelId: string;
    operation: ScriptAgentOperation;
    projectContext: Record<string, unknown>;
    stageInput: unknown;
    publicInstructions: string;
    responseSchema: Record<string, unknown>;
};

export type ScriptModelResponse = {
    publicText?: string;
    structured?: unknown;
    usage?: { inputTokens?: number; outputTokens?: number };
};

export async function runScriptModel(request: ScriptModelRequest, context: ScriptRuntimeContext): Promise<ScriptModelResponse>;
```

The runtime may delegate to the existing compatible text-model service, but the service must remain scoped to `open-source-practice` and the script capability.

- [ ] **Step 3: Implement staged generation.**

Implement these operations:

```text
idea → synopsis
synopsis → outline
outline → entities
entities → scenes
scenes → screenplay
```

Each operation must:

1. Read only confirmed upstream stages and requested project context.
2. Set the target stage to `generating` before the model call.
3. Save a draft result and set the stage to `awaiting_review` after success.
4. Set `failed` with a sanitized error after failure.
5. Never create an image/video/audio task.
6. Require explicit confirmation before making the result the active input to the next stage.

- [ ] **Step 4: Implement bounded Agent tools.**

Required tools:

```text
read_script
read_outline
read_entities
read_scene
read_selection
rewrite_selection
expand_selection
polish_selection
create_scene
update_scene
create_character
update_character
create_location
update_location
create_beat
reorder_scenes
validate_script_structure
create_version
```

Every tool must receive `ownerUserId`, `projectId`, and the target document/version identity from the server. The model cannot supply a different owner or project ID.

- [ ] **Step 5: Implement confirmation and Patch application.**

The service must return a proposed patch containing:

```text
baseVersionId
selection/targetBlockIds
operation
before
proposedAfter
```

Applying the patch must compare the current version with `baseVersionId`. If the document changed, return a conflict result and preserve the user’s latest edit. Do not silently merge or overwrite.

- [ ] **Step 6: Add tests for isolation and stale responses.**

Cover:

```ts
it("cannot read another user project", async () => { /* ... */ });
it("cannot invoke media task creation from a script tool", async () => { /* ... */ });
it("does not apply a late AI response over a newer user version", async () => { /* ... */ });
it("creates one version after one confirmed patch", async () => { /* ... */ });
```

- [ ] **Step 7: Run focused tests and typecheck.**

```powershell
pnpm vitest run src/lib/server/script-practice-model-runtime.test.ts src/lib/server/script-practice-agent-service.test.ts
pnpm typecheck
```

Expected: PASS.

---

## Task 4: Add script practice API routes and infinite-practice permission boundary

**Files:**

- Create or modify: `web/src/app/api/practice/scripts/route.ts`
- Create: `web/src/app/api/practice/scripts/import/route.ts`
- Create or modify: `web/src/app/api/practice/scripts/[id]/route.ts`
- Create: `web/src/app/api/practice/scripts/[id]/versions/route.ts`
- Create: `web/src/app/api/practice/scripts/[id]/agent/route.ts`
- Create: `web/src/app/api/practice/scripts/[id]/agent/[operation]/apply/route.ts`
- Create: `web/src/app/api/practice/scripts/[id]/export/route.ts`
- Create matching route tests beside each route.

**Interfaces:**

- Consumes: Task 2 repository and Task 3 services.
- Produces: authenticated user-facing API with the project’s standard response shape.

- [ ] **Step 1: Add failing route tests.**

Cover:

```text
unauthenticated request → 401
user without infinite-practice access → 403
owner can create/list/read/update/delete own script project
non-owner cannot access project
import requires supported format and bounded body size
agent operation validates operation and target IDs
apply rejects stale base version
export rejects unsupported format
```

- [ ] **Step 2: Implement route-level boundary.**

Every route must:

1. Resolve the current user.
2. Check the existing infinite-practice entitlement/permission.
3. Parse bounded JSON or multipart input.
4. Pass the authenticated user ID to the service.
5. Return sanitized errors in `{ code, data, msg }`.
6. Avoid returning system prompts, hidden tool schemas, model service credentials, node mappings, or internal workflow text.

- [ ] **Step 3: Implement import and export.**

Import formats:

```text
fountain
fdx
text
markdown
```

Export formats:

```text
fountain
fdx
pdf
text
```

Imported data must be shown to the client as a preview/draft before it becomes the current document. Export must use the current user-owned document and must not expose internal snapshots.

- [ ] **Step 4: Run focused API tests and typecheck.**

```powershell
pnpm vitest run src/app/api/practice/scripts
pnpm typecheck
```

Expected: PASS.

---

## Task 5: Migrate the professional screenplay editor into the single-user practice UI

**Files:**

- Create: `web/src/app/(user)/practice/scripts/page.tsx` or the existing infinite-practice route location determined from current routing.
- Create: `web/src/app/(user)/practice/scripts/components/script-editor.tsx`
- Create: `web/src/app/(user)/practice/scripts/components/script-structure-panel.tsx`
- Create: `web/src/app/(user)/practice/scripts/components/script-agent-panel.tsx`
- Create: `web/src/app/(user)/practice/scripts/components/script-stage-bar.tsx`
- Create: `web/src/app/(user)/practice/scripts/components/script-import-dialog.tsx`
- Create: `web/src/app/(user)/practice/scripts/components/script-version-drawer.tsx`
- Create: `web/src/services/api/practice-scripts.ts`
- Create component tests where the repository convention supports them.
- Modify: the existing infinite-practice module navigation only to add the independent script entry.

**Interfaces:**

- Consumes: Task 4 APIs and Task 1 structured document types.
- Produces: desktop/mobile single-user script practice UI with professional screenplay blocks.

- [ ] **Step 1: Add failing UI tests for the editor contract.**

Use semantic interactions, not forced clicks. Cover:

```text
new project dialog shows “从一个想法开始” and “从已有剧本导入”
editor renders scene-heading/action/character/parenthetical/dialogue/transition
stage bar shows current stage and confirmed/stale states
AI proposal is visible before apply
apply creates a new version
import preview requires confirmation
version drawer restores a selected version
no collaboration controls are rendered
```

- [ ] **Step 2: Implement the professional screenplay editor.**

The editor must support:

- block-type-aware rendering;
- keyboard insertion of the next logical block type;
- character autocomplete from project entities;
- scene/location autocomplete from project entities;
- selection-based AI actions;
- user edits that update the local draft without losing unsaved content;
- save status and conflict feedback.

Use ordinary `div` wrappers for responsive layout around Ant Design controls. Verify final display, coordinates, and widths in browser tests.

- [ ] **Step 3: Implement the staged workflow UI.**

The UI must show:

```text
创意输入 → 故事梗概 → 故事大纲 → 人物与地点 → 分集与场景 → 剧本文本 → 编辑与检查
```

The user must explicitly confirm a stage before the next stage can use it. Stage changes from upstream must mark downstream drafts as stale, without deleting them.

- [ ] **Step 4: Implement the single-user AI panel.**

The panel may show:

```text
当前操作
生成建议
修改前后对比
应用修改
取消
创建版本
```

It must not show:

```text
模型思维链
系统提示词
完整工具 Schema
内部 Agent Workflow JSON
商业模块入口
协作者、成员、实时光标或共享按钮
```

- [ ] **Step 5: Add import, export, and version UI.**

Use a responsive Drawer/Modal that does not exceed `100vw` on 390px and 430px widths. Verify the editor, stage bar, AI panel, import dialog and version drawer have no horizontal overflow.

- [ ] **Step 6: Run browser regression.**

From `C:\CODE\VOZEB-PRO\web`:

```powershell
pnpm pree2e
pnpm playwright test e2e/practice-scripts.spec.ts --project=chromium
```

The test must cover desktop, 390px and 430px, light and dark themes, creation from idea, import preview, editing, AI proposal/apply, version restore, and absence of collaboration UI.

- [ ] **Step 7: Run typecheck and lint.**

```powershell
pnpm typecheck
pnpm lint
```

Expected: PASS.

---

## Task 6: Add admin configuration for the infinite-practice script model

**Files:**

- Modify: `web/src/lib/auth/store-types.ts`
- Modify: `web/src/lib/auth/store.ts` or the current settings normalization module.
- Modify: `web/src/app/api/admin/settings/route.ts`
- Modify: existing admin settings UI under `web/src/components/admin/` or the current infinite-practice settings location.
- Create: `web/src/lib/server/practice-script-settings.ts`
- Create: `web/src/lib/server/practice-script-settings.test.ts`
- Modify: `docs/backend-database.md` only if persistence is added outside existing settings storage.

**Interfaces:**

- Consumes: Task 3 model runtime and existing `open-source-practice` model settings.
- Produces: a backend-controlled local script model configuration without exposing it to commercial modules.

- [ ] **Step 1: Add failing settings tests.**

Cover:

```ts
it("normalizes script settings inside infinite practice only", async () => { /* ... */ });
it("does not accept commercial-channel settings through the script patch", async () => { /* ... */ });
it("redacts local model service secrets from GET responses", async () => { /* ... */ });
it("updates script model settings immediately after PATCH", async () => { /* ... */ });
```

- [ ] **Step 2: Define settings.**

```ts
export type PracticeScriptSettings = {
    enabled: boolean;
    defaultModelId: string;
    fallbackModelId?: string;
    endpointId?: string;
    defaultLanguage: string;
    defaultFormat: "structured" | "fountain";
    enabledSkills: string[];
    enabledTools: string[];
    agentWorkflowVersion: number;
    writeConfirmation: "always" | "high-risk-only";
    creativeControlsEnabled: boolean;
};
```

Local endpoint secrets remain server-side and must use the existing secret storage mechanism. The public settings response contains only safe labels and availability flags.

- [ ] **Step 3: Add admin read/write boundary.**

Use current admin Session and explicit infinite-practice/upstream configuration permission. Do not ask for the administrator’s password or TOTP again. GET/PATCH must bypass short caches and immediately reflect persisted changes.

- [ ] **Step 4: Verify configuration isolation.**

```powershell
pnpm vitest run src/lib/server/practice-script-settings.test.ts src/app/api/admin/settings/route.test.ts
pnpm typecheck
```

Expected: PASS.

---

## Task 7: Integrate navigation, documentation, and full verification

**Files:**

- Modify: current infinite-practice navigation/configuration files.
- Modify: `VOZEB-PRO-接口索引.md` for new routes.
- Modify: `VOZEB-PRO-开发地图.md` only when source structure changes require it.
- Modify: `docs/backend-database.md` with the final script tables and indexes.
- Modify: `docs/index.md` to link the design and implementation documents.
- Create: `e2e/practice-scripts.spec.ts` if not created in Task 5.

**Interfaces:**

- Consumes: Tasks 1–6.
- Produces: a documented, isolated and verified infinite-practice script module.

- [ ] **Step 1: Add the independent script entry.**

The entry must be visible only when the infinite-practice script module is enabled and the current user has infinite-practice access. It must not alter commercial navigation or formal drama-lab navigation.

- [ ] **Step 2: Update API index and database documentation.**

Document:

```text
script project routes
script import/export routes
script agent routes
script version routes
practice_script_* tables
ownership indexes
version constraints
```

Do not document internal model prompts, credentials or hidden tool schemas.

- [ ] **Step 3: Add migration and encoding checks.**

Run strict UTF-8 checks over all changed Markdown, TypeScript and SQL files and fail if any of these appear:

```text
U+FFFD
```

- [ ] **Step 4: Run focused quality gates.**

```powershell
pnpm vitest run src/lib/server/script-practice-format.test.ts src/lib/server/database/script-practice-repository.test.ts src/lib/server/script-practice-model-runtime.test.ts src/lib/server/script-practice-agent-service.test.ts --no-file-parallelism
pnpm vitest run src/app/api/practice/scripts
pnpm typecheck
pnpm lint
pnpm format:check
```

- [ ] **Step 5: Run browser quality gates.**

```powershell
pnpm pree2e
pnpm playwright test e2e/practice-scripts.spec.ts --project=chromium
```

Required viewport coverage:

```text
1366px or wider
390px
430px
```

Required behavior coverage:

```text
create from idea
import Fountain/FDX/text/Markdown
stage generation and confirmation
professional block editing
selection rewrite proposal
apply and version creation
stale response protection
version restore
export
no collaboration controls
no media task creation
```

- [ ] **Step 6: Run repository-wide mandatory gates before reporting completion.**

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm check:release
```

If the full browser matrix or local model fixture matrix cannot run, report the exact missing evidence and do not claim the feature is fully verified.

---

## Explicit non-goals for this implementation plan

This plan must not expand into:

```text
角色生图
场景生图
道具生图
分镜图
分镜视频
配音
音乐
漫剧项目自动创建
商业闭源模块改造
Loro 多人协作迁移
完整插件市场
系统级 GPU 调度
```

The future connection point is a separate, explicit action outside this plan:

```text
导入到漫剧项目
```

It may consume a user-confirmed script version later, but no task in this plan may implement that action.

