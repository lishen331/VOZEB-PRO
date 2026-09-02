# 无限练习单项工作台重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把无限练习的剧本、分镜图、分镜视频、配音和音乐从同一套通用表单改造成五个符合真实输入输出的单项工作台，并支持用户在后台已配置的多个开源模型中选择，同时彻底修复未提交任务长期显示“处理中”的会话状态问题。

**Architecture:** 保留现有 `practice_sessions`、RunningHub workflow、逻辑模型路由和 text/image/video/audio 任务链路。新增一个只返回公开能力信息的练习模块预检服务，浏览器据此渲染模块专用控件；服务端在创建会话前重新校验所选逻辑模型属于当前模块允许列表且渠道用途为 `open-source-practice/shared`。剧本使用不创建生成任务的 `manual` 会话，其余模块使用 `workflow` 会话，真实任务提交失败必须落盘明确错误，不能恢复成无任务的 `queued`。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Ant Design 6、Tailwind CSS 4、PostgreSQL JSONB、现有文件数据库回退、Vitest、Playwright。

## Global Constraints

- 本计划实现已确认设计 `docs/superpowers/specs/2026-09-01-infinite-practice-module-workbench-design.md`，并补充 `docs/superpowers/plans/2026-09-01-runninghub-workflow-practice-implementation.md`；发生冲突时以前者和本计划为准。
- 无限练习用户端只展示平台后台配置并发布给该模块的开源逻辑模型显示名；不得展示 RunningHub、渠道 ID、Workflow ID、节点 ID、请求模板、API Key 或内部提示词。
- `practiceWorkflowModels` 从单模型绑定升级为模块到逻辑模型 ID 数组的绑定；必须兼容现有字符串值，读取时转换为单元素数组，不要求重建数据库。
- 剧本练习固定为人工写作模式，不依赖文本模型；分镜图、分镜视频、配音和音乐没有可用开源模型时不得创建会话或生成任务。
- 多个模型时用户可以选择；一个模型时显示只读名称并默认选中；没有模型时禁用模块主操作并展示清晰原因。
- 分镜图是文字生成图片；分镜视频必须使用一张真实参考图片和提示词生成视频；配音使用文本生成音频；音乐使用音乐需求生成音频。
- 前端任务结果复用现有图片、视频、音频和文本结果读取能力，不另建生成任务或媒体存储系统。
- 短剧实验室是正式短剧生产模块的替换项目，不属于无限练习；本计划不得修改 `drama-lab` 页面、生产默认模型、生产渠道或生产计费。
- 不实施本地模型中台、GPU 调度、工作流节点图编辑器或完整动态表单设计器；首期只读取当前 RunningHub 工作流的公开输入契约。
- 不新增固定延时、固定轮询次数或固定重试次数。刷新发生在提交、打开页面、切换历史记录、窗口重新获得焦点和用户点击刷新时。
- PostgreSQL 旧库升级必须先 `ADD COLUMN IF NOT EXISTS`，再补数据、非空和约束；文件数据库记录缺少新字段时必须按旧数据语义兼容读取。
- 每个任务先写失败测试，再写最小实现；数据库集成测试使用 `--no-file-parallelism`。
- 中文源码、测试和文档统一为 UTF-8；不改动或提交工作区现有 `output/`、临时测试脚本和其他无关用户文件。

---

## File Map

| 文件 | 职责 |
| --- | --- |
| `web/src/lib/practice-domain.ts` | 公开练习模式、模块能力、输入契约和状态类型 |
| `web/src/lib/auth/store-types.ts` | 多模型后台绑定持久化类型 |
| `web/src/lib/auth/store-normalizers.ts` | 兼容旧字符串绑定并归一化为去重数组 |
| `web/src/components/admin/admin-logical-model-manager.tsx` | 管理员为每个练习模块多选开源逻辑模型 |
| `web/src/lib/server/practice-module-service.ts` | 根据设置和工作流生成脱敏后的模块能力列表 |
| `web/src/app/api/practice/modules/route.ts` | 登录且具备学校练习资格的能力读取接口 |
| `web/src/lib/server/practice-session-service.ts` | 模块输入校验、会话创建、模型选择、任务派发和公开状态 |
| `web/src/lib/server/database/practice-repository.ts` | 会话模式、所选模型和公开错误的 PostgreSQL 持久化 |
| `web/src/app/(user)/practice/components/practice-*-panel.tsx` | 五类真实单项练习工具面板 |
| `web/src/app/(user)/practice/components/practice-session-result.tsx` | 统一状态壳和按媒体类型展示结果 |
| `web/src/app/(user)/practice/components/practice-session-history.tsx` | 当前模块历史、明确状态、预览和重试 |
| `web/src/services/api/practice.ts` | 能力、会话、人工剧本保存和重试的前端 API 类型 |

## Task 1: 多开源模型绑定与领域契约

**Files:**

- Modify: `web/src/lib/practice-domain.ts`
- Modify: `web/src/lib/auth/store-types.ts`
- Modify: `web/src/lib/auth/store-normalizers.ts`
- Create: `web/src/lib/auth/store-normalizers-practice-workflow.test.ts`
- Modify: `web/src/components/admin/admin-logical-model-manager.tsx`
- Create: `web/src/components/admin/admin-logical-model-manager-practice.test.tsx`

**Interfaces:**

- Consumes: 已有 `RunningHubWorkflowBusinessCode`、`LogicalModel`、`SystemChannelPurpose` 和 `practiceWorkflowModels` 设置字段。
- Produces:

```ts
export type PracticeSessionMode = "manual" | "workflow";

export type PracticeModuleModelOption = {
    id: string;
    label: string;
};

export type PracticeModuleInputField = {
    key: string;
    label: string;
    type: "text" | "textarea" | "image" | "number" | "enum" | "boolean";
    required: boolean;
    options?: string[];
    defaultValue?: string | number | boolean | null;
};

export type PracticeModuleCapability = {
    module: PracticeModuleKind;
    mode: PracticeSessionMode;
    available: boolean;
    unavailableReason?: string;
    models: PracticeModuleModelOption[];
    inputSchema: PracticeModuleInputField[];
    outputType: "text" | "image" | "video" | "audio";
};

export type PracticeWorkflowModelBindings = Partial<Record<RunningHubWorkflowBusinessCode, string[]>>;
export function normalizePracticeWorkflowModels(value: unknown): PracticeWorkflowModelBindings;
```

- [ ] **Step 1: 为旧字符串与新数组绑定写失败测试**

```ts
it("normalizes legacy and multiple practice workflow model bindings", () => {
    expect(normalizePracticeWorkflowModels({
        "storyboard-image": "practice-image-a",
        "storyboard-video": ["practice-video-a", "practice-video-b", "practice-video-a", ""],
    })).toEqual({
        "storyboard-image": ["practice-image-a"],
        "storyboard-video": ["practice-video-a", "practice-video-b"],
    });
});
```

- [ ] **Step 2: 运行归一化测试并确认失败**

Run: `cd web; pnpm exec vitest run src/lib/auth/store-normalizers-practice-workflow.test.ts --no-file-parallelism`

Expected: FAIL，现有 `normalizePracticeWorkflowModels` 仍返回字符串。

- [ ] **Step 3: 增加领域类型并实现兼容归一化**

```ts
export function normalizePracticeWorkflowModels(value: unknown): PracticeWorkflowModelBindings {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).flatMap(([key, raw]) => {
            if (!isRunningHubWorkflowBusinessCode(key)) return [];
            const ids = (Array.isArray(raw) ? raw : [raw])
                .filter((item): item is string => typeof item === "string")
                .map((item) => item.trim())
                .filter(Boolean);
            const unique = [...new Set(ids)];
            return unique.length ? [[key, unique]] : [];
        }),
    ) as PracticeWorkflowModelBindings;
}
```

- [ ] **Step 4: 把后台练习工作流绑定控件改为多选**

在 `admin-logical-model-manager.tsx` 中保持模块分组不变，将单值 `Select` 攭为 `mode="multiple"`，选项只来自启用且存在 `open-source-practice/shared` 渠道绑定的逻辑模型。保存值必须是逻辑模型 ID 数组，删除最后一个选项时保存空数组，不回退正式生产默认模型。

```tsx
<Select
    mode="multiple"
    value={settings.practiceWorkflowModels[code] || []}
    options={practiceModelOptionsByCapability[capability]}
    onChange={(logicalModelIds) => updatePracticeWorkflowModels(code, logicalModelIds)}
    aria-label="练习开源模型"
/>
```

- [ ] **Step 5: 增加后台多选过滤测试**

断言正式生产专用渠道的模型不出现在选项中，`shared` 和 `open-source-practice` 渠道模型可同时多选，保存 patch 为：

```ts
expect(patch.practiceWorkflowModels).toEqual({
    "storyboard-image": ["practice-image-a", "practice-image-b"],
});
```

- [ ] **Step 6: 运行 Task 1 测试和类型检查**

Run: `cd web; pnpm exec vitest run src/lib/auth/store-normalizers-practice-workflow.test.ts src/components/admin/admin-logical-model-manager-practice.test.tsx --no-file-parallelism; pnpm typecheck`

Expected: 两个测试文件 PASS，TypeScript 无错误。

- [ ] **Step 7: 提交 Task 1**

```powershell
git add web/src/lib/practice-domain.ts web/src/lib/auth/store-types.ts web/src/lib/auth/store-normalizers.ts web/src/lib/auth/store-normalizers-practice-workflow.test.ts web/src/components/admin/admin-logical-model-manager.tsx web/src/components/admin/admin-logical-model-manager-practice.test.tsx
git commit -m "feat: support multiple practice workflow models"
```

## Task 2: 练习模块能力预检接口

**Files:**

- Create: `web/src/lib/server/practice-module-service.ts`
- Create: `web/src/lib/server/practice-module-service.test.ts`
- Create: `web/src/app/api/practice/modules/route.ts`
- Create: `web/src/app/api/practice/modules/route.test.ts`
- Modify: `web/src/lib/server/runninghub-workflow-domain.ts`

**Interfaces:**

- Consumes: Task 1 的 `PracticeModuleCapability`、`PracticeWorkflowModelBindings`，已有 `getAuthSettings()`、`resolveLogicalModel()`、`resolveEnabledWorkflow()` 和 `requirePracticeAccess()`。
- Produces:

```ts
export async function listPracticeModuleCapabilities(
    actor: PracticeActor,
    deps?: { settings?: AuthSettings },
): Promise<PracticeModuleCapability[]>;

export function resolvePracticeModuleModelOptions(
    settings: AuthSettings,
    module: Exclude<PracticeModuleKind, "script">,
): PracticeModuleModelOption[];
```

- [ ] **Step 1: 写能力脱敏和可用性失败测试**

```ts
it("returns manual script and only enabled open-source workflow models", async () => {
    const capabilities = await listPracticeModuleCapabilities(actor, { settings });
    expect(capabilities.find((item) => item.module === "script")).toMatchObject({
        mode: "manual",
        available: true,
        models: [],
        outputType: "text",
    });
    expect(capabilities.find((item) => item.module === "storyboard-image")?.models).toEqual([
        { id: "practice-image-a", label: "分镜图模型 A" },
        { id: "practice-image-b", label: "分镜图模型 B" },
    ]);
    expect(JSON.stringify(capabilities)).not.toContain("workflowId");
    expect(JSON.stringify(capabilities)).not.toContain("channelId");
});
```

同时覆盖：绑定存在但逻辑模型禁用、渠道用途为 `production`、渠道中没有当前业务 code 的 enabled workflow 时，模块返回 `available: false` 和固定公开原因。

- [ ] **Step 2: 运行 service 测试并确认模块不存在**

Run: `cd web; pnpm exec vitest run src/lib/server/practice-module-service.test.ts --no-file-parallelism`

Expected: FAIL，`practice-module-service.ts` 尚不存在。

- [ ] **Step 3: 实现固定模块定义与模型选项解析**

固定公开基础字段如下，RunningHub 契约只允许补充当前模块支持的 `number/enum/boolean` 可选参数，不能覆盖基础必填输入：

```ts
const BASE_MODULE_CAPABILITIES = {
    script: { mode: "manual", outputType: "text", inputSchema: [titleField, scriptContentField] },
    "storyboard-image": { mode: "workflow", outputType: "image", inputSchema: [imagePromptField] },
    "storyboard-video": { mode: "workflow", outputType: "video", inputSchema: [referenceImageField, videoPromptField] },
    dubbing: { mode: "workflow", outputType: "audio", inputSchema: [dubbingTextField] },
    music: { mode: "workflow", outputType: "audio", inputSchema: [musicPromptField] },
} satisfies Record<PracticeModuleKind, Omit<PracticeModuleCapability, "module" | "available" | "models">>;
```

解析每个绑定逻辑模型时必须验证逻辑模型启用、能力匹配、至少一个启用 binding 可解析到 `open-source-practice/shared` 渠道，并且该渠道存在匹配业务 code 的 enabled workflow。

- [ ] **Step 4: 写 Route Handler 失败测试**

测试登录学校成员得到 `{ code: 200, data: { modules }, msg: "ok" }`；普通 C 端得到 403；响应字符串不包含渠道和工作流内部字段。

- [ ] **Step 5: 实现 `GET /api/practice/modules`**

```ts
export async function GET() {
    const actor = await requireUserActor();
    const modules = await listPracticeModuleCapabilities(actor);
    return NextResponse.json({ code: 200, data: { modules }, msg: "ok" });
}
```

沿用现有 practice routes 的 Session 读取、actor 转换和错误映射，不把鉴权逻辑复制进 service。

- [ ] **Step 6: 运行 Task 2 测试和类型检查**

Run: `cd web; pnpm exec vitest run src/lib/server/practice-module-service.test.ts src/app/api/practice/modules/route.test.ts --no-file-parallelism; pnpm typecheck`

Expected: service 和 route 测试 PASS，TypeScript 无错误。

- [ ] **Step 7: 提交 Task 2**

```powershell
git add web/src/lib/server/practice-module-service.ts web/src/lib/server/practice-module-service.test.ts web/src/app/api/practice/modules/route.ts web/src/app/api/practice/modules/route.test.ts web/src/lib/server/runninghub-workflow-domain.ts
git commit -m "feat: expose practice module capabilities"
```

## Task 3: 会话模式、错误状态和数据库升级

**Files:**

- Modify: `web/src/lib/server/database/repository-types.ts`
- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `web/src/lib/server/database/practice-repository.ts`
- Modify: `web/src/lib/server/database/practice-repository.test.ts`
- Modify: `web/src/lib/server/database/postgres.ts`
- Modify: `web/src/lib/server/practice-session-service.ts`
- Modify: `web/src/lib/server/practice-session-service.test.ts`
- Modify: `docs/content/docs/backend/backend-database.mdx`

**Interfaces:**

- Consumes: `PracticeSessionMode`、已有 `PracticeSessionRecord` 和 `PracticeRepository`。
- Produces:

```ts
export type PracticeSessionRecord = {
    // existing fields
    mode: PracticeSessionMode;
    selectedLogicalModelId?: string;
    errorCode?: string;
    errorMessage?: string;
};

export type PracticeSessionPublicStatus =
    | "draft"
    | "queued"
    | "running"
    | "success"
    | "failed"
    | "cancelled";

export function publicPracticeSession(session: PracticeSessionRecord): Promise<PracticeSessionView>;
```

- [ ] **Step 1: 写 Repository round-trip 失败测试**

创建一条 `mode: "workflow"`、`selectedLogicalModelId: "practice-video-a"`、`status: "failed"`、`errorCode: "PRACTICE_MODEL_UNAVAILABLE"` 的记录，断言 SQL INSERT/UPDATE 和映射结果完整保留四个字段；再断言旧 row 缺少 `mode` 时读为 `workflow`。

- [ ] **Step 2: 运行 Repository 测试并确认失败**

Run: `cd web; pnpm exec vitest run src/lib/server/database/practice-repository.test.ts --no-file-parallelism`

Expected: FAIL，现有记录和 SQL 没有新字段。

- [ ] **Step 3: 增加有序幂等 Schema 升级**

`CREATE TABLE` 定义和旧表升级必须同时更新：

```sql
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS mode text;
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS selected_logical_model_id text;
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS error_message text;
UPDATE practice_sessions SET mode = 'workflow' WHERE mode IS NULL;
ALTER TABLE practice_sessions ALTER COLUMN mode SET DEFAULT 'workflow';
ALTER TABLE practice_sessions ALTER COLUMN mode SET NOT NULL;
ALTER TABLE practice_sessions DROP CONSTRAINT IF EXISTS practice_sessions_mode;
ALTER TABLE practice_sessions ADD CONSTRAINT practice_sessions_mode CHECK (mode IN ('manual', 'workflow'));
```

不把旧 script 记录批量改为 `manual`，因为旧记录可能已存在真实 text task；只有新建剧本会话使用人工模式。

- [ ] **Step 4: 更新 Repository create/update/map 和文件数据库兼容读取**

`updatePracticeSession()` 的 patch 加入 `mode | selectedLogicalModelId | errorCode | errorMessage`。重试成功 claim 时清空旧错误；任务派发失败时写入：

```ts
{
    status: "failed",
    errorCode: publicPracticeErrorCode(error),
    errorMessage: publicPracticeErrorMessage(error),
}
```

文件数据库读取缺少 `mode` 时根据旧记录回退为 `workflow`，缺少错误字段时保持 `undefined`。

- [ ] **Step 5: 写会话生命周期失败测试**

覆盖四条路径：

```ts
it("does not create a workflow session when model preflight fails", async () => {
    await expect(createPracticeSessionForUser(actor, input, deps)).rejects.toMatchObject({ status: 503 });
    expect(store.create).not.toHaveBeenCalled();
});

it("persists dispatch errors instead of restoring an empty queued session", async () => {
    await expect(createPracticeSessionForUser(actor, input, deps)).rejects.toThrow("工作流提交失败");
    expect(store.update).toHaveBeenLastCalledWith(actor.id, expect.any(String), expect.objectContaining({ status: "failed" }));
});

it("saves manual script without resolving a model or dispatching a task", async () => {
    const result = await createPracticeSessionForUser(actor, manualScriptInput, deps);
    expect(result).toMatchObject({ mode: "manual", status: "draft" });
    expect(deps.resolveModel).not.toHaveBeenCalled();
    expect(deps.dispatch).not.toHaveBeenCalled();
});

it("maps legacy queued sessions without task refs to a visible dispatch failure", async () => {
    expect(await publicPracticeSession(legacyQueued)).toMatchObject({
        status: "failed",
        errorCode: "PRACTICE_DISPATCH_NOT_STARTED",
    });
});
```

- [ ] **Step 6: 实现创建前预检、人工剧本保存和明确错误映射**

工作流模式顺序固定为：规范化模块与输入 → 解析/校验用户所选模型 → 校验引用 → 创建 queued session → 原子 claim → 提交任务 → 写入 taskRef。人工模式顺序为：校验剧本标题和正文 → 创建或更新 draft session → 返回公开 session，不进入模型解析。

公开错误码限定为：`PRACTICE_MODEL_UNAVAILABLE`、`PRACTICE_WORKFLOW_UNAVAILABLE`、`PRACTICE_INPUT_INVALID`、`PRACTICE_REFERENCE_INVALID`、`PRACTICE_DISPATCH_FAILED`、`PRACTICE_DISPATCH_NOT_STARTED`。错误消息不得包含 URL、渠道、workflow/node ID 或上游密钥。

- [ ] **Step 7: 更新数据库文档并运行 Task 3 测试**

Run: `cd web; pnpm exec vitest run src/lib/server/database/practice-repository.test.ts src/lib/server/practice-session-service.test.ts --no-file-parallelism; pnpm typecheck`

Expected: Repository、service 测试 PASS；数据库文档说明新字段、manual/workflow 语义和旧记录兼容。

- [ ] **Step 8: 提交 Task 3**

```powershell
git add web/src/lib/server/database/repository-types.ts web/src/lib/server/database/schema.ts web/src/lib/server/database/practice-repository.ts web/src/lib/server/database/practice-repository.test.ts web/src/lib/server/database/postgres.ts web/src/lib/server/practice-session-service.ts web/src/lib/server/practice-session-service.test.ts docs/content/docs/backend/backend-database.mdx
git commit -m "fix: persist practice session lifecycle errors"
```

## Task 4: 模块输入校验、用户选模和现有任务派发

**Files:**

- Modify: `web/src/lib/server/practice-session-service.ts`
- Modify: `web/src/lib/server/practice-session-service.test.ts`
- Modify: `web/src/app/api/practice/sessions/route.ts`
- Modify: `web/src/app/api/practice/sessions/route.test.ts`
- Modify: `web/src/app/api/practice/sessions/[id]/route.ts`
- Modify: `web/src/lib/server/runninghub-workflow-domain.ts`

**Interfaces:**

- Consumes: Task 2 的能力解析、Task 3 的会话字段，已有 text/image/video/audio task dispatch。
- Produces:

```ts
export type PracticeSessionCreateInput = {
    module: PracticeModuleKind;
    mode?: PracticeSessionMode;
    title: string;
    input: Record<string, unknown>;
    references?: unknown[];
    logicalModelId?: string;
    clientRequestId: string;
    projectId?: string;
    projectKind?: PracticeProjectKind;
};

export function resolvePracticeModelFromSettings(
    settings: AuthSettings,
    module: Exclude<PracticeModuleKind, "script">,
    requestedLogicalModelId?: string,
): PracticeModelResolution;

export function normalizePracticeModuleInput(
    module: PracticeModuleKind,
    input: Record<string, unknown>,
    references: unknown[],
    workflow?: RunningHubWorkflowConfig,
): { input: Record<string, unknown>; references: PracticeReference[] };
```

- [ ] **Step 1: 写用户选模边界失败测试**

覆盖：请求绑定列表内第二个模型成功；请求未绑定模型返回 400；模型已禁用或渠道变为 production 返回 503；未传模型时使用绑定列表第一个可用模型；浏览器伪造 workflow/channel 字段被忽略。

```ts
expect(resolvePracticeModelFromSettings(settings, "storyboard-image", "practice-image-b")).toMatchObject({
    logicalModelId: "practice-image-b",
    capability: "image",
});
expect(() => resolvePracticeModelFromSettings(settings, "storyboard-image", "production-image"))
    .toThrow("所选练习模型不可用");
```

- [ ] **Step 2: 写四类工作流输入失败测试**

```ts
expect(normalizePracticeModuleInput("storyboard-image", { prompt: "雨夜远景" }, [], workflow)).toMatchObject({ input: { prompt: "雨夜远景" } });
expect(() => normalizePracticeModuleInput("storyboard-video", { prompt: "镜头缓慢推进" }, [], workflow)).toThrow("请选择一张参考图片");
expect(normalizePracticeModuleInput("dubbing", { text: "我们出发。" }, [], workflow)).toMatchObject({ input: { text: "我们出发。" } });
expect(normalizePracticeModuleInput("music", { prompt: "紧张但克制" }, [], workflow)).toMatchObject({ input: { prompt: "紧张但克制" } });
```

分镜视频只接受一张 `type: "asset"` 图片引用或受控上传后得到的同类引用；服务端必须通过现有 reference asset 查询确认 MIME 是图片。工作流额外参数仅接收其 `inputSchema` 声明的 key 和类型。

- [ ] **Step 3: 实现模型白名单选择和模块输入规范化**

解析顺序为：从 `practiceWorkflowModels[module]` 取得允许 ID 数组 → 校验请求 ID 是否在数组中 → 对每个候选调用现有逻辑模型路由 → 只接受 capability 匹配且渠道用途为 `open-source-practice/shared` → 解析同一渠道当前模块的 enabled workflow。响应和 session 只保存逻辑模型 ID，workflow snapshot 仍进入现有内部任务上下文。

- [ ] **Step 4: 更新 POST route 入参和错误响应测试**

Route 只把 `logicalModelId`、模块输入、引用和幂等 request ID 传给 service。无模型/无参考图返回 400 或 503 且数据库无新 session；成功响应仍使用 `{ code, data: { session }, msg }`。

- [ ] **Step 5: 更新重试语义**

重试默认复用 session 的 `selectedLogicalModelId`。若该模型已下架，返回 `PRACTICE_MODEL_UNAVAILABLE` 并保持原 session 为 failed；不得自动换模型、重建 session、重复创建同一上游任务或重新扣费。用户另选模型时创建新的用户主动提交记录，不复用旧失败 session。

- [ ] **Step 6: 运行 Task 4 测试和类型检查**

Run: `cd web; pnpm exec vitest run src/lib/server/practice-session-service.test.ts src/app/api/practice/sessions/route.test.ts --no-file-parallelism; pnpm typecheck`

Expected: 模型白名单、模块输入、route 和重试用例 PASS。

- [ ] **Step 7: 提交 Task 4**

```powershell
git add web/src/lib/server/practice-session-service.ts web/src/lib/server/practice-session-service.test.ts web/src/app/api/practice/sessions/route.ts web/src/app/api/practice/sessions/route.test.ts web/src/app/api/practice/sessions/[id]/route.ts web/src/lib/server/runninghub-workflow-domain.ts
git commit -m "feat: dispatch module-specific practice tasks"
```

## Task 5: 五个单项练习工作台

**Files:**

- Modify: `web/src/services/api/practice.ts`
- Modify: `web/src/services/api/practice.test.ts`
- Modify: `web/src/app/(user)/practice/components/practice-module-workbench.tsx`
- Modify: `web/src/app/(user)/practice/components/practice-module-workbench.test.tsx`
- Create: `web/src/app/(user)/practice/components/practice-script-panel.tsx`
- Create: `web/src/app/(user)/practice/components/practice-storyboard-image-panel.tsx`
- Create: `web/src/app/(user)/practice/components/practice-storyboard-video-panel.tsx`
- Create: `web/src/app/(user)/practice/components/practice-dubbing-panel.tsx`
- Create: `web/src/app/(user)/practice/components/practice-music-panel.tsx`
- Create: `web/src/app/(user)/practice/components/practice-session-result.tsx`
- Reuse: `web/src/components/ip-library/ip-reference-picker.tsx`
- Reuse: `web/src/services/image-storage.ts`
- Reuse: `web/src/services/file-storage.ts`

**Interfaces:**

- Consumes: `GET /api/practice/modules`、现有 practice session API、图片/媒体存储和 IP 引用选择器。
- Produces:

```ts
export type PracticeSessionInput = {
    module: PracticeModuleKind;
    mode: PracticeSessionMode;
    title: string;
    input: Record<string, unknown>;
    references?: Array<{ type: "asset"; id: string } | IpReference>;
    logicalModelId?: string;
    clientRequestId: string;
};

practiceApi.listModules(): Promise<{ modules: PracticeModuleCapability[] }>;
practiceApi.createSession(input: PracticeSessionInput): Promise<{ session: PracticeSession }>;
```

- [ ] **Step 1: 写 API client 和面板路由失败测试**

断言 `listModules()` 请求 `/api/practice/modules`，工作台按 module 渲染不同面板；源码和 DOM 中不再出现素材 ID 文本框，也不再让五个模块共同使用“开始练习”。

```ts
expect(screen.getByRole("button", { name: "生成分镜图" })).toBeVisible();
expect(screen.getByText("等待生成分镜图")).toBeVisible();
expect(screen.queryByRole("button", { name: "开始练习" })).not.toBeInTheDocument();
```

- [ ] **Step 2: 运行前端定向测试并确认失败**

Run: `cd web; pnpm exec vitest run src/services/api/practice.test.ts 'src/app/(user)/practice/components/practice-module-workbench.test.tsx' --no-file-parallelism`

Expected: FAIL，当前只有通用表单和统一按钮。

- [ ] **Step 3: 把工作台改成共享外壳和模块面板选择**

`practice-module-workbench.tsx` 只负责加载 capability、当前 session、历史和公共错误；模块内部表单分别由五个 panel 管理。没有 capability 时显示加载态；`available: false` 时保留页面结构和结果占位，但禁用主按钮。

```tsx
const panelByModule: Record<PracticeModuleKind, ReactNode> = {
    script: <PracticeScriptPanel capability={capability} onSaved={setCurrent} />,
    "storyboard-image": <PracticeStoryboardImagePanel capability={capability} onCreated={setCurrent} />,
    "storyboard-video": <PracticeStoryboardVideoPanel capability={capability} onCreated={setCurrent} />,
    dubbing: <PracticeDubbingPanel capability={capability} onCreated={setCurrent} />,
    music: <PracticeMusicPanel capability={capability} onCreated={setCurrent} />,
};
```

- [ ] **Step 4: 实现剧本和分镜图面板**

剧本面板字段为标题、正文和可选备注，按钮“保存草稿”；保存时发送 `mode: "manual"` 和 `input: { content, notes }`。分镜图字段为画面描述、可选参考图片/IP 引用和模型；按钮“生成分镜图”，结果区在提交前也保持可见。

模型控件规则：`models.length > 1` 使用 Select；等于 1 时显示只读模型名并提交该 ID；等于 0 时不提交。

- [ ] **Step 5: 实现分镜视频面板**

字段顺序固定为模型、参考图片、视频提示词、工作流声明的可选参数。上传图片先显示本地缩略图，提交时使用现有受控图片存储得到稳定 asset 引用；未成功得到稳定引用前不创建 session。主按钮为“生成分镜视频”，结果区固定为视频容器。

- [ ] **Step 6: 实现配音和音乐面板**

配音面板固定配音文本和模型，工作流声明音色/角色/语速/情绪时追加对应控件，按钮“开始配音”。音乐面板固定音乐需求和模型，工作流声明时长/风格/格式时追加控件，按钮“生成音乐”。两者结果区均使用 `<audio controls>` 和公开输入摘要。

- [ ] **Step 7: 实现共享结果组件**

```ts
export function PracticeSessionResult({
    module,
    session,
    onRetry,
    onRefresh,
}: {
    module: PracticeModuleKind;
    session?: PracticeSession;
    onRetry: () => void;
    onRefresh: () => void;
}): ReactNode;
```

未提交时按模块显示“等待保存剧本/等待生成分镜图/等待生成分镜视频/等待生成配音/等待生成音乐”；queued/running 使用现有生成占位语义；success 显示对应媒体；failed 显示公开错误和重试；cancelled 显示已取消。不得用 `if (!result) => 正在处理中`。

- [ ] **Step 8: 运行 Task 5 测试和类型检查**

Run: `cd web; pnpm exec vitest run src/services/api/practice.test.ts 'src/app/(user)/practice/components/practice-module-workbench.test.tsx' --no-file-parallelism; pnpm typecheck`

Expected: 五类面板、模型选择、必填校验和结果占位测试 PASS。

- [ ] **Step 9: 提交 Task 5**

```powershell
git add web/src/services/api/practice.ts web/src/services/api/practice.test.ts 'web/src/app/(user)/practice/components/practice-module-workbench.tsx' 'web/src/app/(user)/practice/components/practice-module-workbench.test.tsx' 'web/src/app/(user)/practice/components/practice-script-panel.tsx' 'web/src/app/(user)/practice/components/practice-storyboard-image-panel.tsx' 'web/src/app/(user)/practice/components/practice-storyboard-video-panel.tsx' 'web/src/app/(user)/practice/components/practice-dubbing-panel.tsx' 'web/src/app/(user)/practice/components/practice-music-panel.tsx' 'web/src/app/(user)/practice/components/practice-session-result.tsx'
git commit -m "feat: add module-specific practice workbenches"
```

## Task 6: 历史记录、结果预览和刷新闭环

**Files:**

- Modify: `web/src/app/(user)/practice/components/practice-home.tsx`
- Modify: `web/src/app/(user)/practice/components/practice-home.test.tsx`
- Modify: `web/src/app/(user)/practice/components/practice-module-workbench.tsx`
- Create: `web/src/app/(user)/practice/components/practice-session-history.tsx`
- Create: `web/src/app/(user)/practice/components/practice-session-status.ts`
- Create: `web/src/app/(user)/practice/components/practice-session-status.test.ts`
- Modify: `web/src/services/api/practice.ts`

**Interfaces:**

- Consumes: Task 3 的公开 status/error/result 和 Task 5 的结果组件。
- Produces:

```ts
export const PRACTICE_SESSION_STATUS_LABELS: Record<PracticeSession["status"], string> = {
    draft: "草稿",
    queued: "排队中",
    running: "生成中",
    success: "已完成",
    failed: "失败",
    cancelled: "已取消",
};

export function practiceModulePath(module: PracticeModuleKind, options?: {
    reference?: IpReference;
    sessionId?: string;
}): string;
```

- [ ] **Step 1: 写状态映射和 session 路由失败测试**

```ts
expect(practiceSessionStatusLabel({ status: "queued" })).toBe("排队中");
expect(practiceSessionStatusLabel({ status: "running" })).toBe("生成中");
expect(practiceSessionStatusLabel({ status: "failed" })).toBe("失败");
expect(practiceModulePath("storyboard-image", { sessionId: "session-one" }))
    .toBe("/practice/storyboard-image?sessionId=session-one");
```

断言所有状态均有映射，不存在“处理中”兜底。

- [ ] **Step 2: 运行历史和状态测试并确认失败**

Run: `cd web; pnpm exec vitest run 'src/app/(user)/practice/components/practice-session-status.test.ts' 'src/app/(user)/practice/components/practice-home.test.tsx' --no-file-parallelism`

Expected: FAIL，状态 helper 尚不存在且首页未携带 sessionId。

- [ ] **Step 3: 实现历史卡片和结果预览**

历史卡片使用 session 的真实公开结果：图片显示缩略图，视频显示视频首帧或视频图标，音频显示音频图标和时长，剧本显示正文摘要。failed 显示简短错误和重试操作；卡片点击携带 sessionId 打开对应记录。

- [ ] **Step 4: 实现无固定轮询的刷新触发**

模块页初次加载、`sessionId` 变化、浏览器 `focus` 和点击“刷新状态”时调用 `practiceApi.getSession(sessionId)`。effect cleanup 只移除 focus listener，不修改媒体 `src`，不增加 `setInterval` 或固定 retry counter。

```ts
useEffect(() => {
    if (!sessionId) return;
    const refresh = () => void loadSession(sessionId);
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
}, [sessionId, loadSession]);
```

- [ ] **Step 5: 保留用户输入并完成重试交互**

失败记录重试使用原 session ID 和现有 `retrySession()`；错误仍在时保持原输入、参考缩略图和所选模型显示。模型已下架时提示重新创建并选择可用模型，不自动替换。

- [ ] **Step 6: 运行 Task 6 测试和类型检查**

Run: `cd web; pnpm exec vitest run 'src/app/(user)/practice/components/practice-session-status.test.ts' 'src/app/(user)/practice/components/practice-home.test.tsx' 'src/app/(user)/practice/components/practice-module-workbench.test.tsx' --no-file-parallelism; pnpm typecheck`

Expected: 状态、sessionId、刷新和历史预览用例 PASS。

- [ ] **Step 7: 提交 Task 6**

```powershell
git add 'web/src/app/(user)/practice/components/practice-home.tsx' 'web/src/app/(user)/practice/components/practice-home.test.tsx' 'web/src/app/(user)/practice/components/practice-module-workbench.tsx' 'web/src/app/(user)/practice/components/practice-session-history.tsx' 'web/src/app/(user)/practice/components/practice-session-status.ts' 'web/src/app/(user)/practice/components/practice-session-status.test.ts' web/src/services/api/practice.ts
git commit -m "fix: show accurate practice history states"
```

## Task 7: 集成回归、浏览器验收和开发文档

**Files:**

- Create: `web/e2e/infinite-practice-module-workbenches.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-18-infinite-practice-pull-film-implementation.md`
- Modify: `docs/superpowers/plans/2026-09-01-runninghub-workflow-practice-implementation.md`
- Modify: `VOZEB-PRO-接口索引.md`
- Modify: `VOZEB-PRO-开发地图.md`

**Interfaces:**

- Consumes: Tasks 1-6 的后台多模型绑定、能力接口、会话 API 和五类工作台。
- Produces: 可重复运行的端到端验收和与源码一致的开发定位文档。

- [ ] **Step 1: 写本地 fixture 驱动的 Playwright 场景**

使用项目现有登录/数据库 fixture，配置两套分镜图开源逻辑模型和各一套视频、配音、音乐 workflow。用本地上游 fixture 返回图片、视频和音频结果，不依赖外部 RunningHub 环境。覆盖：

```ts
test("school member uses module-specific open-source practice workbenches", async ({ page }) => {
    await page.goto("/practice/storyboard-image");
    await expect(page.getByLabel("练习模型")).toBeVisible();
    await page.getByLabel("画面描述").fill("雨夜车站，中景，两人隔着人群对望");
    await page.getByRole("button", { name: "生成分镜图" }).click();
    await expect(page.getByRole("img", { name: "分镜图练习结果" })).toBeVisible();
});
```

同一 spec 还要覆盖剧本无模型可保存、分镜视频缺图阻止提交、视频播放器、配音/音乐音频播放器、未配置模块不创建 session、失败历史不显示“处理中”、普通 C 端不可访问。

- [ ] **Step 2: 运行定向单测和 API 集成测试**

Run:

```powershell
cd web
pnpm exec vitest run src/lib/auth/store-normalizers-practice-workflow.test.ts src/lib/server/practice-module-service.test.ts src/lib/server/database/practice-repository.test.ts src/lib/server/practice-session-service.test.ts src/app/api/practice/modules/route.test.ts src/app/api/practice/sessions/route.test.ts src/services/api/practice.test.ts 'src/app/(user)/practice/components/practice-module-workbench.test.tsx' 'src/app/(user)/practice/components/practice-home.test.tsx' --no-file-parallelism
```

Expected: 所列测试全部 PASS，无随机死锁。

- [ ] **Step 3: 运行 TypeScript、Lint 和全量 Vitest**

Run:

```powershell
cd web
pnpm typecheck
pnpm lint
pnpm exec vitest run --no-file-parallelism
```

Expected: 三项命令退出码均为 0。

- [ ] **Step 4: 运行浏览器验收**

Run: `cd web; pnpm exec playwright test e2e/infinite-practice-module-workbenches.spec.ts`

在桌面、390px 和 430px 验证：页面无横向溢出；模型 Select、图片缩略图、视频最右控件和音频播放器均在视口内；浅色/深色状态可读；结果区提交前后尺寸稳定；媒体不因 React Strict Mode effect cleanup 丢失 `src`。

- [ ] **Step 5: 更新既有计划的被修订条款**

在两个旧计划中添加明确引用，说明“前端不选择模型”的旧条款已被本计划替代为“只选择后台绑定的开源逻辑模型”；保留 RunningHub/渠道/workflow 内部字段不可见、短剧实验室独立和现有任务链复用等未冲突条款。

- [ ] **Step 6: 更新并验证接口索引和开发地图**

从仓库根目录运行：

```powershell
pwsh -NoProfile -File .\过程文件\更新开发地图.ps1
pwsh -NoProfile -File .\过程文件\验证开发文档.ps1
```

Expected: 新增 `/api/practice/modules`、练习 service、页面组件和 Schema 字段进入定位文档；验证脚本退出码为 0。

- [ ] **Step 7: 严格检查 UTF-8、替换字符和差异**

Run:

```powershell
rg -n "�|锟|斤|拷" web/src docs VOZEB-PRO-接口索引.md VOZEB-PRO-开发地图.md
git diff --check
git status --short
```

Expected: 乱码扫描无结果，`git diff --check` 无输出；`git status` 不包含 `output/`、凭据或临时测试脚本的 staged 变更。

- [ ] **Step 8: 提交 Task 7**

```powershell
git add web/e2e/infinite-practice-module-workbenches.spec.ts docs/superpowers/plans/2026-08-18-infinite-practice-pull-film-implementation.md docs/superpowers/plans/2026-09-01-runninghub-workflow-practice-implementation.md VOZEB-PRO-接口索引.md VOZEB-PRO-开发地图.md
git commit -m "test: verify infinite practice workbenches"
```

## Final Acceptance

- 平台管理员可为分镜图、分镜视频、配音和音乐各绑定一个或多个开源逻辑模型，旧的单字符串配置无损读取。
- 学校成员只看到后台允许的模型显示名；多个可选、单个只读、没有时不可提交。
- 剧本练习无需开源模型即可保存；其他四项分别得到图片、视频或音频结果。
- 未配置、参数无效和派发失败不会产生永久“处理中”的空 queued 记录。
- 历史记录可以携带 sessionId 打开真实结果，状态、错误、缩略图和播放器正确。
- 现有 Canvas、无限短剧项目、正式短剧、短剧实验室、积分、学校算力池和生产模型配置不受影响。
- 全量质量门禁、桌面/390px/430px 浏览器回归、开发地图和接口索引验证全部通过。
