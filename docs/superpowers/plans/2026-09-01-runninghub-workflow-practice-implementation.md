# RunningHub 无限练习工作流接入实施计划

> 2026-09-02 修订：原“前端不选择模型”条款改为“前端只选择后台绑定的开源逻辑模型”。支持多个绑定，单个绑定显示只读名称，无可用绑定时模块不可提交；provider、channel、workflow、任务和计费字段继续由服务端白名单校验。

> **For agentic workers:** 使用 `superpowers:executing-plans` 按任务顺序执行。每个任务先写失败测试，再写最小实现；每个任务完成后执行定向测试、`pnpm typecheck`，并单独提交。执行前先阅读已确认设计：[2026-09-01-runninghub-workflow-practice-design.md](../specs/2026-09-01-runninghub-workflow-practice-design.md)。

**Goal:** 在已有无限练习、系统渠道、RunningHub provider 和统一生成任务基础上，完成一条可运行且可维护的自定义 RunningHub 工作流链路：平台管理员在后台配置工作流、参数契约、节点映射和出参映射，后台可以真实测试提交/查询/结果读取，学生或老师在绑定学校的无限练习中只按业务 code 使用当前启用版本，结果继续复用现有文本、图片、视频和音频任务组件。无限练习和正式生产执行档案严格隔离；本计划不实施“短剧实验室”替换当前短剧生产模块的页面和生产流程，也不让它进入无限练习。

**Architecture:** 不新增本地模型中台，不把工作流节点图搬到平台编辑。RunningHub 渠道继续保存在 `system_model_channels`，API Key 只属于渠道；运行时字段继续复用 `SystemChannelModelConfig`、`provider-task-config.ts` 和 `runninghub-provider.ts`。为支持业务 code、版本和后台测试，在同一个 `advancedConfig` JSONB 中沿用现有 `modelConfigs` 的归一化/序列化通道，增加轻量 `workflowConfigs` 注册信息；旧的 `modelConfigs` 仍作为兼容读取入口。`AuthSettings.practiceWorkflowModels` 只保存 `PracticeModuleKind -> logicalModelId` 的绑定，不让前端传 provider、Workflow ID 或节点 ID。启用版本解析后，现有练习服务把业务参数转换为 RunningHub 请求，再交给现有 text/image/video/audio 任务 API、worker、轮询、落盘和结果读取。这里的 `drama` 业务 code 只表示无限练习中的短剧项目类型；短剧实验室是另一个正式生产替换项目，不复用 `practiceWorkflowModels`，也不使用 `open-source-practice`。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Ant Design 6、Tailwind CSS 4、Zustand、PostgreSQL JSONB、Vitest、Playwright。继续沿用现有 `fetchInternalApi`、`{ code, data, msg }` 响应、管理员 Session/`upstream.manage` 权限和系统渠道脱敏审计。

## Global Constraints

- 本计划只实现 RunningHub 自定义工作流的一期接入；不实现本地模型中台、机房 GPU、队列优先级、Git 集成、完整节点图编辑器、自动依赖安装或自动节点差异分析。
- 无限练习入口和学校绑定、独立 `open-source-practice` 项目身份、现有结果展示已经由 `docs/superpowers/plans/2026-08-18-infinite-practice-pull-film-implementation.md` 覆盖；本计划只补齐工作流配置和调用。若实现发现既有计划与已确认设计冲突，先更新 spec 和本计划。
- “短剧实验室替换当前短剧模块”不属于本计划；本计划不得新增或改写 `drama-lab` 生产页面、生产路由、生产默认模型或生产计费策略。若未来短剧实验室也采用 RunningHub，另以 `production` 执行档案建立独立绑定和验收。
- 工作流状态只有 `enabled | disabled`，绝不增加“待测试”。测试结果单独保存 `lastTestAt`、`lastTestResult`、`lastTestError`，测试不会自动启用或停用版本。
- 后台测试只能由平台管理员执行，不能创建学校项目、学生作品、正式历史或积分消费；测试使用独立 `admin-workflow-test` 业务身份和审计类型。RunningHub 异步任务仍必须可查询、可恢复、可显示真实错误。
- 练习前端只发送稳定 `PracticeModuleKind`/业务 code 和业务输入；服务端根据 `practiceWorkflowModels`、`open-source-practice` 渠道用途和启用版本解析 RunningHub 配置。不能接受客户端传来的 channelId、Workflow ID、节点映射、请求模板或执行档案覆盖。
- 运行字段由管理员显式配置，禁止猜测模型目录、V2 路径、节点字段或结果字段。`requestTemplate` 是高级兼容入口，结构化的参数契约/节点映射/出参映射优先。
- Workflow ID、版本、请求模板、入参、节点映射和出参映射在每次任务创建时写入任务上下文，保证远端工作流被修改或复制后仍可追溯。启用版本只能有一个，编辑已启用版本必须复制为新版本并默认停用。
- 不新增业务表。工作流和版本元数据放入现有渠道 `advancedConfig` JSONB；`app_settings` 只增加练习业务 code 到逻辑模型的绑定字段。新增 JSONB 字段必须通过 `ADD COLUMN IF NOT EXISTS`/已有设置升级路径幂等落地，并更新数据库文档。
- Route Handler 只负责 Session、权限、入参和响应映射；业务校验放 `web/src/lib/server/`，数据库写入沿用 settings/repository。所有后台 API 使用 `{ code, data, msg }`。
- 中文源码、测试和文档统一 UTF-8。不得覆盖工作区中与本计划无关的用户改动；提交前检查 `git diff`、`git status`，排除 `output/`、`.env`、凭据和临时脚本。
- 每个任务先写失败测试。PostgreSQL 集成测试使用 `--no-file-parallelism`；不使用新增固定延时、固定轮询次数、固定重试次数或强制浏览器点击掩盖状态问题。

## Task 1: 固定工作流领域类型、Schema 和归一化

**Files:**

- Modify: `web/src/lib/auth/store-types.ts`
- Modify: `web/src/lib/auth/store-foundation.ts`
- Modify: `web/src/lib/auth/store-normalizers-channel.ts`
- Modify: `web/src/lib/auth/store-normalizers.ts`
- Modify: `web/src/lib/auth/store-repository.ts`
- Modify: `web/src/lib/auth/postgres-auth-settings-service.ts`
- Modify: `web/src/lib/server/database/repository-types.ts`
- Modify: `web/src/lib/server/database/repositories.ts`
- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `web/src/lib/server/admin-channel-config.ts`
- Create: `web/src/lib/server/runninghub-workflow-domain.ts`
- Create: `web/src/lib/server/runninghub-workflow-domain.test.ts`

**Interfaces:**

```ts
export type RunningHubWorkflowBusinessCode =
    | "script"
    | "storyboard-image"
    | "storyboard-video"
    | "dubbing"
    | "music"
    | "canvas"
    | "drama";

export type RunningHubWorkflowInputField = {
    key: string;
    label: string;
    type: "text" | "textarea" | "image" | "images" | "video" | "audio" | "number" | "enum" | "boolean";
    required: boolean;
    options?: string[];
    defaultValue?: string | number | boolean | null;
};

export type RunningHubNodeMapping = {
    paramKey: string;
    nodeId: string;
    fieldName: string;
    valueType: "STRING" | "NUMBER" | "BOOLEAN" | "JSON";
    source: "INPUT" | "INPUT_OR_DEFAULT";
    inputKey: string;
    defaultValue?: string | number | boolean | null;
};

export type RunningHubOutputMapping = {
    key: string;
    label: string;
    nodeId?: string;
    assetType: "IMAGE" | "VIDEO" | "AUDIO" | "TEXT";
    required: boolean;
    primary?: boolean;
};

export type RunningHubWorkflowConfig = {
    workflowKey: string;
    workflowName: string;
    businessCode: RunningHubWorkflowBusinessCode;
    capability: "text" | "image" | "video" | "audio";
    providerType: "runninghub";
    workflowId: string;
    version: number;
    enabled: boolean;
    createPath: string;
    queryPath: string;
    taskIdField: string;
    statusField: string;
    resultField: string;
    requestTemplate: string;
    inputSchema: RunningHubWorkflowInputField[];
    nodeMappings: RunningHubNodeMapping[];
    outputMappings: RunningHubOutputMapping[];
    timeoutSeconds?: number;
    runOptions?: Record<string, string | number | boolean | null>;
    lastTestAt?: string;
    lastTestResult?: "success" | "failed";
    lastTestError?: string;
};
```

`SystemChannelAdvancedConfig` 增加 `workflowConfigs?: Record<string, RunningHubWorkflowConfig>`，`AuthSettings` 增加 `practiceWorkflowModels: Partial<Record<RunningHubWorkflowBusinessCode, string>>`。旧设置无该字段时归一化为空对象；已有 `modelConfigs` 保留不变。

- [ ] **Step 1: 先写失败测试**

  测试业务 code 白名单、能力映射、输入/节点/出参 JSON 结构校验、版本必须为正整数、同一渠道同一业务 code 只能存在一个启用版本、空设置默认值和旧 `modelConfigs` 兼容读取。测试还要断言 `script`/`dubbing`/`music` 分别允许 text/audio 配置，不能把任意 capability 当作合法配置；`drama` 仅作为无限练习项目类型标识，不能自动解析为短剧实验室生产配置。

- [ ] **Step 2: 运行失败测试**

  Run: `cd web; pnpm exec vitest run src/lib/server/runninghub-workflow-domain.test.ts src/lib/auth/store-normalizers-channel.test.ts src/lib/auth/postgres-auth-settings-service.test.ts`

  Expected: FAIL，类型、校验器和新设置字段尚不存在。

- [ ] **Step 3: 实现类型和纯函数校验**

  在 `runninghub-workflow-domain.ts` 集中实现 `normalizeRunningHubWorkflowConfig`、`validateRunningHubWorkflowConfig`、`workflowCapabilityForBusinessCode`、`nextWorkflowVersion` 和 `resolveEnabledWorkflow`。解析 JSON 时拒绝数组/对象之外的值、未知类型和空必填字段；错误消息包含字段路径，供后台表单直接显示。不要在 Route Handler 重复这些规则。

- [ ] **Step 4: 接入 settings 归一化和持久化**

  `store-foundation.ts` 给 `practiceWorkflowModels` 空对象默认值；`store-normalizers.ts` 只保留白名单业务 code 和字符串逻辑模型 ID；`store-normalizers-channel.ts` 对 `workflowConfigs` 做深度归一化但不修改未知旧字段。`store-repository.ts`、`postgres-auth-settings-service.ts`、`repository-types.ts` 和 `repositories.ts` 读写新的 `practice_workflow_models` JSONB 字段，并让 GET/PATCH 保存后立即读取到同一快照。

- [ ] **Step 5: 添加幂等升级 SQL 和渠道校验**

  在 `schema.ts` 的已有 `app_settings` 升级区增加 `practice_workflow_models jsonb NOT NULL DEFAULT '{}'::jsonb`，使用 `ADD COLUMN IF NOT EXISTS`；不重建旧表。扩展 `admin-channel-config.ts`：RunningHub 的 `workflowConfigs` 每项必须通过领域校验；启用项必须有完整 create/query/task/status/result 配置；不能用业务 code 或 Workflow ID 猜路径。

- [ ] **Step 6: 定向测试、类型检查和提交**

  Run: `cd web; pnpm exec vitest run src/lib/server/runninghub-workflow-domain.test.ts src/lib/auth/store-normalizers-channel.test.ts src/lib/auth/postgres-auth-settings-service.test.ts src/lib/server/admin-channel-config.test.ts --no-file-parallelism; pnpm typecheck`

  ```bash
  git add web/src/lib/auth/store-types.ts web/src/lib/auth/store-foundation.ts web/src/lib/auth/store-normalizers-channel.ts web/src/lib/auth/store-normalizers.ts web/src/lib/auth/store-repository.ts web/src/lib/auth/postgres-auth-settings-service.ts web/src/lib/server/database/repository-types.ts web/src/lib/server/database/repositories.ts web/src/lib/server/database/schema.ts web/src/lib/server/admin-channel-config.ts web/src/lib/server/runninghub-workflow-domain.ts web/src/lib/server/runninghub-workflow-domain.test.ts
  git commit -m "feat: add RunningHub workflow contracts"
  ```

## Task 2: 建立工作流版本注册和后台 settings API

**Files:**

- Create: `web/src/lib/server/runninghub-workflow-service.ts`
- Create: `web/src/lib/server/runninghub-workflow-service.test.ts`
- Create: `web/src/app/api/admin/runninghub/workflows/route.ts`
- Create: `web/src/app/api/admin/runninghub/workflows/[workflowKey]/route.ts`
- Create: `web/src/app/api/admin/runninghub/workflows/[workflowKey]/versions/route.ts`
- Modify: `web/src/app/api/admin/settings/route.ts`
- Modify: `web/src/app/api/admin/settings/route.test.ts`
- Modify: `VOZEB-PRO-接口索引.md`

**Interfaces:**

- `GET /api/admin/runninghub/workflows?search=&businessCode=&status=&channelId=`：按当前管理员可见的 system channel 定向返回列表，不返回 API Key、完整 requestTemplate 或内部密钥。
- `POST /api/admin/runninghub/workflows`：创建工作流初始版本，服务端生成 `workflowKey` 和版本 `1`，默认 `disabled`。
- `GET /api/admin/runninghub/workflows/[workflowKey]`：返回当前配置和可读的脱敏测试摘要。
- `PUT /api/admin/runninghub/workflows/[workflowKey]`：未启用版本允许原地编辑；启用版本返回 409 并要求使用复制版本接口。
- `POST /api/admin/runninghub/workflows/[workflowKey]/versions`：复制指定版本，版本号递增，默认停用；支持 `activateVersion` 只在同一事务中停用旧版本并启用目标版本。
- `PATCH /api/admin/settings`：接受并校验 `practiceWorkflowModels`，只允许平台管理员绑定逻辑模型，不接受客户端直接绑定渠道或 Workflow ID。

- [ ] **Step 1: 先写失败测试**

  测试非平台管理员返回 401/403；列表搜索和状态筛选由服务端查询条件执行；创建版本默认为停用；启用版本唯一；编辑启用版本返回 409；复制版本保留完整 JSON 快照但清空测试结果；API 响应不含 `apiKey`、`webhookSecret`、完整上游响应或内部请求头。

- [ ] **Step 2: 运行失败测试**

  Run: `cd web; pnpm exec vitest run src/lib/server/runninghub-workflow-service.test.ts src/app/api/admin/settings/route.test.ts`

  Expected: FAIL，service、版本操作和 API 路由尚不存在。

- [ ] **Step 3: 实现 service 和原子版本操作**

  `runninghub-workflow-service.ts` 只依赖 settings repository 和领域校验器，提供 `listWorkflows`、`getWorkflow`、`createWorkflow`、`updateWorkflow`、`copyWorkflowVersion`、`activateWorkflowVersion`、`setWorkflowEnabled`。更新/复制/启用使用一次 settings 快照更新，先验证同一 `channelId + businessCode` 的启用版本数量，再写回 `advancedConfig.workflowConfigs`；不在内存中维护第二份注册表。

- [ ] **Step 4: 实现 Route Handler 鉴权和响应映射**

  所有新路由使用当前管理员 Session 和 `hasAnyAdminPermission(user, ["upstream.manage"])`；只接受 JSON body，限制 body 大小，调用 service 后返回 `{ code, data, msg }`。列表按搜索/分页参数读取，不能把全部 channel/config 拉到浏览器后筛选。错误按 400/401/403/404/409/500 映射。

- [ ] **Step 5: 更新接口索引和 settings 回归**

  在 `VOZEB-PRO-接口索引.md` 登记 5 个工作流接口及其 service、鉴权、响应字段；在 settings API 测试中覆盖保存后立即读取、页面刷新读取和 practice binding 与渠道配置同时更新不丢字段。

- [ ] **Step 6: 定向测试、类型检查和提交**

  Run: `cd web; pnpm exec vitest run src/lib/server/runninghub-workflow-service.test.ts src/app/api/admin/runninghub/workflows/route.test.ts src/app/api/admin/runninghub/workflows/[workflowKey]/route.test.ts src/app/api/admin/runninghub/workflows/[workflowKey]/versions/route.test.ts src/app/api/admin/settings/route.test.ts --no-file-parallelism; pnpm typecheck`

  ```bash
  git add web/src/lib/server/runninghub-workflow-service.ts web/src/lib/server/runninghub-workflow-service.test.ts web/src/app/api/admin/runninghub web/src/app/api/admin/settings/route.ts web/src/app/api/admin/settings/route.test.ts VOZEB-PRO-接口索引.md
  git commit -m "feat: add RunningHub workflow admin APIs"
  ```

## Task 3: 让 RunningHub provider 支持结构化工作流请求和版本追踪

**Files:**

- Modify: `web/src/lib/server/runninghub-provider.ts`
- Modify: `web/src/lib/server/provider-task-config.ts`
- Modify: `web/src/lib/server/generation-channel.ts`
- Modify: `web/src/lib/server/generation-task-types.ts`
- Modify: `web/src/lib/server/generation-task-store.ts`
- Modify: `web/src/lib/server/generation-task-scheduler.ts`
- Modify: `web/src/lib/server/database/schema.ts`
- Create: `web/src/lib/server/runninghub-workflow-runtime.ts`
- Create: `web/src/lib/server/runninghub-workflow-runtime.test.ts`
- Modify: `web/src/lib/server/runninghub-provider.test.ts`

**Interfaces:**

```ts
export type RunningHubWorkflowRuntimeInput = {
    config: RunningHubWorkflowConfig;
    businessInput: Record<string, unknown>;
    references: Array<{ type: string; url?: string; assetId?: string }>;
};

export function buildRunningHubWorkflowPayload(input: RunningHubWorkflowRuntimeInput): Record<string, unknown>;
export function recordWorkflowTaskContext(config: RunningHubWorkflowConfig): Pick<GenerationTaskContext, "workflowKey" | "workflowVersion" | "upstreamWorkflowId" | "businessCode">;
```

`GenerationTaskContext` 增加可选 `workflowKey`、`workflowVersion`、`upstreamWorkflowId`、`businessCode` 和 `taskOrigin: "user" | "admin-workflow-test"`。默认任务 origin 为 `user`，现有 production 任务不改变。

- [ ] **Step 1: 先写失败测试**

  用本地 fetch fixture 固定以下行为：节点映射把 prompt、数字、布尔和媒体引用写入指定 `nodeId/fieldName`；`requestTemplate` 能覆盖高级字段但不能覆盖系统生成的 Workflow ID；缺少必填参数、未知 inputKey、重复 output key 和非法 assetType 在提交前失败；提交/查询只读取管理员配置的路径和字段；任务记录包含 workflow version 和远端 Workflow ID。

- [ ] **Step 2: 运行失败测试**

  Run: `cd web; pnpm exec vitest run src/lib/server/runninghub-workflow-runtime.test.ts src/lib/server/runninghub-provider.test.ts src/lib/server/provider-task-config.test.ts`

  Expected: FAIL，结构化 payload builder、任务上下文字段和校验尚不存在。

- [ ] **Step 3: 实现 payload builder**

  在 `runninghub-workflow-runtime.ts` 先按 `inputSchema` 做 required/type/enum 校验，再依据 `nodeMappings` 生成 `nodeInfoList`；若配置同时提供 `requestTemplate`，使用既有模板渲染器生成外层请求并把结构化节点参数合并到明确的工作流字段。Workflow ID 只能来自服务端 config；禁止把客户端任意 JSON 原样转发到上游。

- [ ] **Step 4: 扩展 provider 和任务记录**

  `runninghub-provider.ts` 继续使用现有 bearer、base URL 拼接、配置路径和响应字段解析；不新增模型目录猜测。`generation-task-types.ts`、store、scheduler 和 `generation_tasks` JSON/列映射保存工作流追踪字段，worker 恢复与重试沿用同一版本，不重新解析当前启用版本。

- [ ] **Step 5: 更新统一生成 channel 转换**

  `generation-channel.ts` 的 `toSystemGenerationChannel` 将已解析 workflow 元数据放入服务端任务配置，前端 DTO 不返回 requestTemplate、节点映射或 API Key。现有非 RunningHub channel 和 legacy `modelConfigs` 继续按原逻辑运行。

- [ ] **Step 6: 定向测试、类型检查和提交**

  Run: `cd web; pnpm exec vitest run src/lib/server/runninghub-workflow-runtime.test.ts src/lib/server/runninghub-provider.test.ts src/lib/server/generation-task-store.test.ts src/lib/server/generation-task-scheduler.test.ts --no-file-parallelism; pnpm typecheck`

  ```bash
  git add web/src/lib/server/runninghub-provider.ts web/src/lib/server/provider-task-config.ts web/src/lib/server/generation-channel.ts web/src/lib/server/generation-task-types.ts web/src/lib/server/generation-task-store.ts web/src/lib/server/generation-task-scheduler.ts web/src/lib/server/database/schema.ts web/src/lib/server/runninghub-workflow-runtime.ts web/src/lib/server/runninghub-workflow-runtime.test.ts web/src/lib/server/runninghub-provider.test.ts
  git commit -m "feat: run versioned RunningHub workflows"
  ```

## Task 4: 将业务 code 接入无限练习且保持现有结果链路

**Files:**

- Modify: `web/src/lib/server/practice-session-service.ts`
- Modify: `web/src/lib/server/logical-model-router.ts`
- Modify: `web/src/lib/server/generation-execution-policy.ts`
- Modify: `web/src/app/api/practice/sessions/route.ts`
- Modify: `web/src/app/api/practice/sessions/[id]/route.ts`
- Modify: `web/src/app/api/text-tasks/route.ts`
- Modify: `web/src/app/api/image-tasks/route.ts`
- Modify: `web/src/app/api/video-generation-tasks/video-generation-route.ts`
- Modify: `web/src/app/api/audio-tasks/route.ts`
- Create: `web/src/lib/server/practice-workflow-router.ts`
- Create: `web/src/lib/server/practice-workflow-router.test.ts`
- Modify: `web/src/lib/server/practice-session-service.test.ts`
- Modify: `web/src/app/api/practice/sessions/route.test.ts`

**Interfaces:**

```ts
export type ResolvedPracticeWorkflow = {
    logicalModelId: string;
    capability: "text" | "image" | "video" | "audio";
    workflow: RunningHubWorkflowConfig;
};

export async function resolvePracticeWorkflow(module: PracticeModuleKind): Promise<ResolvedPracticeWorkflow>;
```

- [ ] **Step 1: 先写失败测试**

  测试已绑定业务 code 时只解析 `open-source-practice/shared` 渠道的启用工作流；正式渠道、停用版本、缺少版本或 input contract 不完整时返回明确 503；同一模块启用多个版本返回配置错误；未配置 workflow binding 时 legacy `practiceDefaultModels` 仍可运行，保证旧练习配置兼容；客户端传入 channelId/Workflow ID/节点 JSON 被忽略或拒绝。

- [ ] **Step 2: 运行失败测试**

  Run: `cd web; pnpm exec vitest run src/lib/server/practice-workflow-router.test.ts src/lib/server/practice-session-service.test.ts src/app/api/practice/sessions/route.test.ts`

  Expected: FAIL，练习业务 code 解析和 workflow-aware dispatch 尚不存在。

- [ ] **Step 3: 实现 workflow router**

  `practice-workflow-router.ts` 读取 `practiceWorkflowModels[module]`，调用现有 `resolveLogicalModel(..., "open-source-practice")`，再从匹配渠道的 `workflowConfigs` 解析业务 code 的唯一启用版本。若没有显式 binding，退回现有 capability 默认模型；若 binding 存在但工作流无效，直接报配置错误，不能静默调用错误工作流。无限练习 Canvas/短剧项目不绑定一个“整项目”上游任务：其内部图片、视频、配音和文本动作分别使用 `storyboard-image`、`storyboard-video`、`dubbing`、`script`/`music` 业务 code，保留 `canvas`/`drama` 作为练习项目类型和未来整项目工作流的稳定保留 code。这里不读取短剧实验室配置，也不把短剧实验室路由接入 practice dispatch。

- [ ] **Step 4: 接入 practice dispatch**

  `PracticeModelResolution` 增加可选 workflow 元数据；`dispatchPracticeTask` 把服务端生成的 payload、references 和 workflow task context 交给现有四类任务入口。前端仍只传 module、prompt、references 和 project context。不要在每个任务 Route Handler 新增 provider 分支；统一由 `toSystemGenerationChannel`、runtime 和 `generation-execution-policy` 处理。

- [ ] **Step 5: 校验计费与现有结果读取**

  练习仍使用 `executionProfile: "open-source-practice"`，不调用个人积分扣减；学校绑定、并发、上游失败、查询、恢复、重试和审计继续沿用现有策略。`publicTaskResult` 不新增结果格式：文本、图片、视频、音频仍转换为当前 session result shape。运行记录只增加版本追踪字段。

- [ ] **Step 6: 定向测试、类型检查和提交**

  Run: `cd web; pnpm exec vitest run src/lib/server/practice-workflow-router.test.ts src/lib/server/practice-session-service.test.ts src/app/api/practice/sessions/route.test.ts src/app/api/practice/sessions/[id]/route.test.ts src/lib/server/generation-execution-policy.test.ts --no-file-parallelism; pnpm typecheck`

  ```bash
  git add web/src/lib/server/practice-session-service.ts web/src/lib/server/logical-model-router.ts web/src/lib/server/generation-execution-policy.ts web/src/app/api/practice/sessions web/src/app/api/text-tasks/route.ts web/src/app/api/image-tasks/route.ts web/src/app/api/video-generation-tasks/video-generation-route.ts web/src/app/api/audio-tasks/route.ts web/src/lib/server/practice-workflow-router.ts web/src/lib/server/practice-workflow-router.test.ts web/src/lib/server/practice-session-service.test.ts web/src/app/api/practice/sessions/route.test.ts
  git commit -m "feat: bind infinite practice to workflows"
  ```

## Task 5: 在现有上游配置后台增加工作流列表和编辑 Tabs

**Files:**

- Modify: `web/src/components/admin/channels/admin-channel-workspace.tsx`
- Modify: `web/src/components/admin/channels/admin-channel-detail-drawer.tsx`
- Modify: `web/src/components/admin/channels/runninghub-channel-fields.tsx`
- Create: `web/src/components/admin/channels/runninghub-workflow-list.tsx`
- Create: `web/src/components/admin/channels/runninghub-workflow-editor.tsx`
- Create: `web/src/components/admin/channels/runninghub-workflow-test-panel.tsx`
- Modify: `web/src/components/admin/admin-logical-model-manager.tsx`
- Create: `web/e2e/admin-runninghub-workflow.spec.ts`

**UI contract:**

- 工作流入口放在现有“上游配置 → RunningHub 渠道”详情内，不新建本地模型中台菜单。
- 列表显示名称、业务 code、能力、渠道、Workflow ID、版本、启用/停用、最近测试和操作；支持服务端搜索/筛选。
- 编辑使用“基础配置 / 平台对接 / 参数契约 / 节点映射 / 出参映射 / 测试运行”六个 Tab。JSON 区域显示格式错误的字段路径；短字段使用紧凑网格，长模板和 JSON 独占通栏。
- 新建、复制版本默认停用；启用/停用和复制版本均有明确确认；不出现“待测试”。API Key 只从渠道详情管理，工作流页面不重复输入。
- `practiceWorkflowModels` 在现有逻辑模型管理区按业务 code 绑定逻辑模型；绑定控件不显示 provider、Workflow ID 或节点字段。

- [ ] **Step 1: 先写失败的 Playwright 骨架**

  验证管理员登录后能看到 RunningHub 工作流区、六个 Tab、业务 code/版本/状态字段；普通用户不能访问后台 API；复制版本默认停用；保存后刷新列表仍显示新版本；测试面板不出现在无限练习用户页面。

- [ ] **Step 2: 运行失败的浏览器测试**

  Run: `cd web; pnpm exec playwright test e2e/admin-runninghub-workflow.spec.ts`

  Expected: FAIL，工作流后台 UI 和路由尚不存在。

- [ ] **Step 3: 实现列表与编辑表单**

  复用当前 `AdminChannelWorkspace` 的加载、错误、刷新和 Drawer 模式。`runninghub-workflow-editor.tsx` 只负责表单状态和 JSON 解析，保存/复制/启用调用 Task 2 的 API；不要把大型表单常驻铺在渠道列表主体。

- [ ] **Step 4: 接入业务 code 绑定**

  在 `admin-logical-model-manager.tsx` 的练习模型区增加业务 code 选择和逻辑模型选择，保存 `practiceWorkflowModels`。保留现有 capability 默认模型作为 legacy fallback，页面明确显示当前绑定缺失时的配置提示，但不增加新的权限角色。

- [ ] **Step 5: 完成响应式和可读状态**

  复用后台主题和 Ant Design 组件；检查 1366px、1024px、768px、390px、430px。Drawer 宽度不超过 `100vw`，JSON 编辑区域可滚动，按钮具备浅色/深色/hover/disabled 状态，无横向溢出。测试结果摘要只显示脱敏字段。

- [ ] **Step 6: 定向浏览器回归、类型检查和提交**

  Run: `cd web; pnpm exec playwright test e2e/admin-runninghub-workflow.spec.ts; pnpm typecheck`

  ```bash
  git add web/src/components/admin/channels/admin-channel-workspace.tsx web/src/components/admin/channels/admin-channel-detail-drawer.tsx web/src/components/admin/channels/runninghub-channel-fields.tsx web/src/components/admin/channels/runninghub-workflow-list.tsx web/src/components/admin/channels/runninghub-workflow-editor.tsx web/src/components/admin/channels/runninghub-workflow-test-panel.tsx web/src/components/admin/admin-logical-model-manager.tsx web/e2e/admin-runninghub-workflow.spec.ts
  git commit -m "feat: add RunningHub workflow admin UI"
  ```

## Task 6: 实现后台真实测试运行，不污染学校练习和生产数据

**Files:**

- Create: `web/src/lib/server/runninghub-workflow-test-service.ts`
- Create: `web/src/lib/server/runninghub-workflow-test-service.test.ts`
- Create: `web/src/app/api/admin/runninghub/workflows/[workflowKey]/test/route.ts`
- Create: `web/src/app/api/admin/runninghub/workflows/[workflowKey]/test/[runId]/route.ts`
- Create: `web/src/lib/server/admin-workflow-test-store.ts`
- Create: `web/src/lib/server/admin-workflow-test-store.test.ts`
- Modify: `web/src/lib/server/generation-task-types.ts`
- Modify: `web/src/lib/server/generation-task-store.ts`
- Modify: `web/src/lib/server/generation-task-scheduler.ts`
- Modify: `web/src/lib/server/runninghub-workflow-runtime.ts`
- Modify: `web/src/components/admin/channels/runninghub-workflow-test-panel.tsx`
- Create: `web/e2e/admin-runninghub-workflow-test.spec.ts`

**Interfaces:**

- `POST /api/admin/runninghub/workflows/[workflowKey]/test`：接受脱敏测试输入和可选上传媒体，返回 `runId`、状态和上游 taskId；不接受 workflow config 覆盖。
- `GET /api/admin/runninghub/workflows/[workflowKey]/test/[runId]`：返回测试状态、耗时、脱敏错误和兼容现有媒体预览的结果引用。
- `admin-workflow-test-store` 保存最小摘要（workflowKey/version、taskId、状态、耗时、结果 URL/文本、错误、创建管理员），不保存 API Key、完整请求体或临时上传文件。

- [ ] **Step 1: 先写失败测试**

  测试非平台管理员被拒绝；缺少必填测试参数不会提交；测试上传媒体使用 RunningHub 上传接口；提交、查询、成功结果和失败结果都能落库；测试任务带 `taskOrigin: "admin-workflow-test"`，没有 schoolId/projectId、积分 receipt 或正式作品关联；同一 run 查询不会重复提交。

- [ ] **Step 2: 运行失败测试**

  Run: `cd web; pnpm exec vitest run src/lib/server/runninghub-workflow-test-service.test.ts src/lib/server/admin-workflow-test-store.test.ts src/app/api/admin/runninghub/workflows/[workflowKey]/test/route.test.ts`

  Expected: FAIL，测试 service/store/API 尚不存在。

- [ ] **Step 3: 实现独立测试 store 和 service**

  `admin-workflow-test-store.ts` 复用现有 `generation_tasks`（文件 Provider 回退或 PostgreSQL）保存 `taskOrigin=admin-workflow-test` 的测试任务和最小结果摘要，不创建新业务表、学校实体或作品记录。`taskOrigin`、`runId` 和工作流追踪字段作为既有任务 payload/context 的受控字段持久化，列表读取按管理员和 runId 定向查询。`runninghub-workflow-test-service.ts` 流程为：读取启用或指定停用版本 → 校验测试输入 → 上传临时媒体 → build payload → submit → 保存 run/taskId → 后续 GET 执行一次状态查询并落盘。上游仍处理时返回 `running`，不在 Route Handler 内做无限轮询。

- [ ] **Step 4: 复用现有任务/结果协议但隔离 origin**

  测试任务可以复用现有 `runninghub-provider` 和媒体结果解析，但必须使用独立 task origin、非用户 conversation/project 上下文和管理员审计；不调用 `consumeUserPoints`、学校算力池或正式失败退款。结果 URL 先按现有存储/代理策略规范化，页面只看到可预览的媒体和文本。

- [ ] **Step 5: 保存最近测试摘要**

  测试成功或失败后，在同一 settings 更新中写入 `lastTestAt/lastTestResult/lastTestError`，不改变 `enabled`。测试失败不阻断旧启用版本继续服务；启用新版本仍由管理员显式执行。

- [ ] **Step 6: 后台浏览器回归、定向测试和提交**

  Playwright 使用本地 RunningHub fixture，验证“配置 → 测试提交 → 查询 → 图片/视频/音频/文本结果 → 失败信息 → 再次查询”链路；同时断言学校练习列表、正式作品和积分账本没有新增记录。

  Run: `cd web; pnpm exec vitest run src/lib/server/runninghub-workflow-test-service.test.ts src/lib/server/admin-workflow-test-store.test.ts src/app/api/admin/runninghub/workflows/[workflowKey]/test/route.test.ts src/app/api/admin/runninghub/workflows/[workflowKey]/test/[runId]/route.test.ts --no-file-parallelism; pnpm exec playwright test e2e/admin-runninghub-workflow-test.spec.ts; pnpm typecheck`

  ```bash
  git add web/src/lib/server/runninghub-workflow-test-service.ts web/src/lib/server/runninghub-workflow-test-service.test.ts web/src/app/api/admin/runninghub/workflows/[workflowKey]/test web/src/lib/server/admin-workflow-test-store.ts web/src/lib/server/admin-workflow-test-store.test.ts web/src/lib/server/generation-task-types.ts web/src/lib/server/generation-task-store.ts web/src/lib/server/generation-task-scheduler.ts web/src/lib/server/runninghub-workflow-runtime.ts web/src/components/admin/channels/runninghub-workflow-test-panel.tsx web/e2e/admin-runninghub-workflow-test.spec.ts
  git commit -m "feat: test RunningHub workflows from admin"
  ```

## Task 7: 全链路验收、文档和发布质量门禁

**Files:**

- Modify: `docs/content/docs/backend/backend-database.mdx`
- Modify: `VOZEB-PRO-接口索引.md`
- Modify: `VOZEB-PRO-开发地图.md`
- Modify: `docs/superpowers/specs/2026-09-01-runninghub-workflow-practice-design.md` only if implementation changes an approved contract
- Create: `web/e2e/infinite-practice-runninghub-workflow.spec.ts`
- Create: `web/scripts/runninghub-workflow-fixture.mjs` or reuse an existing local protocol fixture without adding a production dependency

- [ ] **Step 1: 先写端到端失败测试**

  使用本地 fixture 覆盖四种结果类型和至少一种上游错误：平台管理员创建 RunningHub workflow → 绑定业务 code → 测试运行成功 → 启用版本 → 学校 active teacher/student 创建无限练习 → 练习任务进入现有 task/result API → 页面展示结果。另测复制新版本、停用旧版本、刷新后版本追踪，以及正式生产请求仍不使用 practice workflow。断言短剧实验室生产路由不在本计划新增的 practice API、绑定或测试结果中；若已有生产路由被回归，必须继续使用 production 配置。

- [ ] **Step 2: 运行失败测试**

  Run: `cd web; pnpm exec playwright test e2e/infinite-practice-runninghub-workflow.spec.ts`

  Expected: FAIL，直到前六个任务完成。

- [ ] **Step 3: 更新后端数据库和开发定位文档**

  `docs/content/docs/backend/backend-database.mdx` 记录 `app_settings.practice_workflow_models`、渠道 `advancedConfig.workflowConfigs`、生成任务工作流追踪字段和升级方式。接口索引登记最终实际存在的 Route Handler；开发地图登记新增页面、service、repository/fixture 和测试入口。不要把临时脚本或输出目录纳入文档清单。

- [ ] **Step 4: 运行完整质量门禁**

  从仓库根目录执行：

  ```powershell
  pwsh -NoProfile -File .\过程文件\更新开发地图.ps1
  pwsh -NoProfile -File .\过程文件\验证开发文档.ps1
  cd web
  pnpm lint
  pnpm typecheck
  pnpm test -- --no-file-parallelism
  pnpm exec playwright test
  pnpm check:release
  ```

  PostgreSQL 集成测试另外执行：`$env:VOZEB_PRO_RUN_POSTGRES_INTEGRATION="1"; pnpm exec vitest run src/lib/server/database/repositories.test.ts src/lib/auth/postgres-auth-settings-service.test.ts --no-file-parallelism`。失败时保留完整证据，不能通过跳过测试、强制点击或增加固定延时绕过。

- [ ] **Step 5: 检查差异、编码和无关文件**

  执行 `git diff --check`、`git status --short`，用严格 UTF-8 解码新增/修改文本并扫描 `U+FFFD`、`U+951F`、`U+65A4`、`U+62F7`。确认未把 `.env`、API Key、fixture 输出、`output/` 或用户已有改动加入提交。

- [ ] **Step 6: 最终提交**

  ```bash
  git add docs/content/docs/backend/backend-database.mdx VOZEB-PRO-接口索引.md VOZEB-PRO-开发地图.md docs/superpowers/specs/2026-09-01-runninghub-workflow-practice-design.md web/e2e/infinite-practice-runninghub-workflow.spec.ts web/scripts/runninghub-workflow-fixture.mjs
  git commit -m "test: verify RunningHub infinite practice flow"
  ```

## Execution Notes

1. 先执行 Task 1-4 打通后端契约和真实练习调用，再执行 Task 5-6 完成后台配置与测试页面，最后执行 Task 7 的全链路验收。
2. 若当前仓库已经存在等价的 provider fixture、任务字段或 API 测试文件，沿用现有路径并在提交前更新本计划的 Files 清单，不复制第二套实现。
3. 后续接入本地模型时，新增 provider adapter 和后台渠道类型，复用 `RunningHubWorkflowConfig` 的业务 code、输入/输出契约、版本和任务追踪字段；本期不预留本地 GPU/调度字段。
