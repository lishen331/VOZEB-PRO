# RunningHub Demo 对齐与伪模型清理实施计划

> **给执行 Agent：** 必须使用 `superpowers:executing-plans` 按任务顺序执行本计划。每个任务完成独立测试后再进入下一任务。当前角色只负责产品设计和实施文档，不在本轮修改业务代码。

**目标：** 在不修改无限练习前端页面的前提下，清除 RunningHub 伪模型和中间绑定，让现有后台工作流配置、测试、启用和任务链路按 Demo 方式形成可运行闭环。

**架构：** 复用当前 `workflowConfigs`、工作流服务、工作流 Runtime、Provider、任务 Route Handler 和练习 Session。以 `workflowCode` + 工作流版本 + 配置 fingerprint 作为无限练习的真实绑定；RunningHub 渠道只保存凭据并固定服务无限练习。清理旧伪模型数据时只处理 RunningHub 相关值，普通渠道模型体系保持不变。

**技术栈：** Next.js App Router、TypeScript、React、Ant Design、Tailwind、PostgreSQL/文件设置存储、Vitest、Playwright。

## 全局约束

- 必须以 `C:\CODE\VOZEB-PRO\过程文件\Runninghub-demo\Runninghub-demo` 的真实闭环为行为标准。
- 不修改 `web/src/app/(user)/practice` 下的无限练习前端页面、组件、文案、卡片或交互。
- 第一版 RunningHub 只支持 `open-source-practice`，拒绝 `production` 和 `shared`。
- 不新增第二套 RunningHub 路由、任务中心、数据库表或 Java Demo 页面。
- 不再生成、保存或读取 RunningHub 伪模型、逻辑模型绑定和 `practiceWorkflowModels` 绑定。
- 普通非 RunningHub 渠道继续使用既有模型目录、逻辑模型和默认模型流程。
- 现有持久化 PostgreSQL 不得删库、重建数据卷或依赖 `CREATE TABLE IF NOT EXISTS` 改变旧结构。
- 中文文件统一 UTF-8；每次改动后运行相关测试和类型检查。
- 不覆盖工作区已有与本需求无关的未提交改动。
- 共享 PostgreSQL 集成测试使用 `--no-file-parallelism`。

## 文件变更总览

### 必须修改或删除

- `web/src/lib/server/admin-channel-config.ts`：RunningHub 仅校验凭据和固定用途，不校验模型列表与通用模型契约。
- `web/src/lib/auth/store-normalizers-channel.ts`：RunningHub 归一化后不保留用于模型路由的伪模型配置。
- `web/src/lib/auth/store-normalizers.ts`：移除 RunningHub 伪模型派生调用，并在归一化阶段清理历史绑定。
- `web/src/lib/auth/runninghub-practice-routing.ts`：删除伪模型派生模块及对应测试。
- `web/src/lib/model-routing-config.ts`：普通渠道模型同步和校验跳过 RunningHub；不影响其他渠道。
- `web/src/lib/server/runninghub-workflow-service.ts`：固定用途、删除启用时模型派生、启用硬门槛。
- `web/src/lib/server/runninghub-workflow-domain.ts`：固定 Demo 协议默认值并维护测试 fingerprint 规则。
- `web/src/lib/server/practice-module-service.ts`：保留现有模块响应结构以免前端改动，数据直接从有效工作流生成；不从持久化模型绑定取 RunningHub 能力。
- `web/src/lib/server/practice-session-service.ts`：RunningHub 练习按 `workflowCode` 解析，错误 `logicalModelId` 不得改变工作流。
- `web/src/lib/server/runninghub-workflow-runtime.ts`：保留任务上下文和 Runtime；删除通过伪模型反查工作流的实际依赖。
- `web/src/app/api/admin/settings/route.ts`：对 RunningHub 只接收并强制 `open-source-practice`；清理提交中的 RunningHub 伪模型字段。
- `web/src/components/admin/channels/runninghub-channel-fields.tsx`：删除通用异步任务契约表单，保留固定用途说明。
- `web/src/components/admin/channels/runninghub-workflow-editor.tsx`：不向运维人员展示固定协议字段；保留 Demo 工作流字段和读取/分析/保存流程。
- `web/src/components/admin/channels/runninghub-workflow-list.tsx`：保留初始化 Demo、读取 JSON、测试、启用/停用；启用失败显示硬门槛原因。
- `web/src/components/admin/channels/admin-channel-detail-drawer.tsx`：RunningHub 隐藏上游模型和逻辑绑定 Tab，显示工作流 Tab。
- `web/src/components/admin/admin-logical-model-manager.tsx`：RunningHub 不进入模型管理和练习默认模型绑定。
- `web/src/components/admin/channels/admin-channel-workspace-model.ts`：删除渠道时不再处理 RunningHub 伪模型残留；普通渠道逻辑不变。
- `web/src/lib/auth/store-foundation.ts`、`web/src/lib/auth/store-repository.ts`、`web/src/lib/auth/postgres-auth-settings-service.ts`、`web/src/lib/auth/store-types.ts`、`web/src/lib/server/database/repository-types.ts`：停止新的 RunningHub 练习模型绑定写入；只有在确认无其他调用方后移除废弃字段类型。
- `web/src/app/api/admin/runninghub/workflows/**`：复用现有接口；按新服务契约补权限、固定用途、保存和测试响应。
- `web/src/app/api/practice/sessions/route.ts`、`web/src/app/api/practice/sessions/[id]/route.ts`、图片/视频/音频/文本既有任务 Route Handler：复用现有入口，校验和传递 workflow context。

### 必须新增或扩展测试

- `web/src/lib/auth/store-normalizers-runninghub-practice.test.ts`：改为验证清理历史伪模型和不再派生。
- `web/src/lib/server/runninghub-workflow-service.test.ts`：更新启用、固定用途、无模型绑定和 fingerprint 测试。
- `web/src/lib/server/practice-module-service.test.ts`：验证工作流提供能力且不依赖伪模型。
- `web/src/lib/server/practice-session-service.test.ts`：验证 workflowCode 优先和错误 logicalModelId 不影响选择。
- `web/src/lib/server/runninghub-workflow-runtime.test.ts`：验证任务上下文只使用工作流版本和 fingerprint。
- `web/src/lib/server/admin-channel-config.test.ts`：验证 RunningHub 渠道可空模型并拒绝非无限练习用途。
- `web/src/app/api/admin/settings/route.test.ts`：验证保存时清理 RunningHub 伪模型且普通渠道不受影响。
- `web/src/app/api/admin/runninghub/workflows/route.test.ts`、`[workflowKey]/route.test.ts`、`fetch-json/route.test.ts`、`test/**`：验证接口行为。
- `web/src/components/admin/channels/runninghub-channel-fields.test.tsx`、`runninghub-workflow-list.test.tsx`：验证后台减法。
- `web/e2e/admin-runninghub-workflow-demo-bootstrap.spec.ts`：验证后台闭环。
- `web/e2e/infinite-practice-demo-workflows.spec.ts`：在不改练习前端的情况下验证七条工作流调用。

## Task 1：固定清理策略并添加失败测试

**目的：** 先用测试锁定“RunningHub 渠道空模型合法、伪模型清除、普通渠道不受影响、用途固定”的行为。

**操作：**

- [ ] 在 `store-normalizers-runninghub-practice.test.ts` 增加输入：一个 RunningHub 渠道包含 `runninghub-workflow-image-rh`，`logicalModels` 含对应 binding，`practiceWorkflowModels` 含对应 ID；另一个普通渠道保留真实模型。
- [ ] 断言归一化后 RunningHub `models=[]`，RunningHub 绑定被移除，普通渠道模型和绑定仍存在，`practiceWorkflowModels={}`。
- [ ] 在 `admin-channel-config.test.ts` 断言 RunningHub `models=[]` 且用途不是 `open-source-practice` 时返回固定错误。
- [ ] 先运行：

```powershell
pnpm --dir web vitest run src/lib/auth/store-normalizers-runninghub-practice.test.ts src/lib/server/admin-channel-config.test.ts
```

预期：新断言失败，说明当前实现还在生成/要求伪模型或接受其他用途。

- [ ] 不改代码直到失败证据被记录。

## Task 2：实现设置归一化和持久化清理

**文件：** `store-normalizers.ts`、`store-normalizers-channel.ts`、`runninghub-practice-routing.ts`、`store-foundation.ts`、`store-repository.ts`、`postgres-auth-settings-service.ts`、`store-types.ts`、`repository-types.ts`、`admin-channel-config.ts`、`model-routing-config.ts`、相关测试。

**操作：**

- [ ] 删除 `deriveRunningHubPracticeRouting()` 的导入、调用、实现和仅服务其的测试；禁止以其他函数名重建相同派生逻辑。
- [ ] 归一化 `protocol=runninghub` 渠道时固定 `purpose=open-source-practice`、`models=[]`，清除该渠道的 `modelCapabilities/modelConfigs/operationConfigs` 中伪模型配置。
- [ ] 从 `logicalModels` 的每个 bindings 删除 RunningHub channelId；空 binding 的模型删除；同一逻辑模型的普通渠道 binding 保留。
- [ ] 将 `defaultModels` 和 `practiceDefaultModels` 指向被删除逻辑模型的字段置空；将 `practiceWorkflowModels` 清空。
- [ ] 注意设置归一化必须在清理完成后再执行默认模型校验，避免历史伪模型先触发错误。
- [ ] 普通渠道继续执行现有模型能力、逻辑模型和默认模型同步。
- [ ] 使用幂等纯函数测试两次归一化结果相同。
- [ ] 再运行 Task 1 测试，预期通过。

## Task 3：固定 RunningHub 渠道后台和服务契约

**文件：** `runninghub-channel-fields.tsx`、`admin-channel-detail-drawer.tsx`、`admin-logical-model-manager.tsx`、`admin-channel-workspace-model.ts`、`runninghub-workflow-service.ts`、后台组件测试。

**操作：**

- [ ] 删除 RunningHub 渠道的用途选择，改为只读“无限练习”。渠道配置保留名称、Base URL、API Key 和启用状态。
- [ ] 删除 RunningHub 异步任务契约的人工输入；固定使用 Demo 的创建、查询、JSON 拉取和媒体上传端点。后台只显示必要的工作流字段。
- [ ] RunningHub 详情隐藏“上游模型”和“逻辑绑定”展示，工作流列表成为主运营入口；普通渠道页面不变。
- [ ] `getWorkflowChannel`、`requireRunningHubChannel` 和渠道验证统一拒绝非 `open-source-practice`，不得接受客户端绕过。
- [ ] 工作流保存仍复用原有 POST/PUT 接口，初始化 Demo 仍导入七条工作流并保持停用。
- [ ] 扩展组件测试：RunningHub 不出现“创建路径/查询路径/任务 ID 字段/结果字段/状态字段/请求模板”人工配置；工作流列表仍有初始化、读取 JSON、测试、启用动作。
- [ ] 运行：

```powershell
pnpm --dir web vitest run src/components/admin/channels/runninghub-channel-fields.test.tsx src/components/admin/channels/runninghub-workflow-list.test.tsx src/lib/server/runninghub-workflow-service.test.ts
```

预期：通过。

## Task 4：启用前硬门槛和单条 Workflow ID 更新

**文件：** `runninghub-workflow-domain.ts`、`runninghub-workflow-service.ts`、`runninghub-workflow-test-service.ts`、相关 API tests。

**操作：**

- [ ] 先为 `setWorkflowEnabled(workflowKey, true)` 增加失败测试：无 API JSON、映射不完整、无测试、测试失败、fingerprint 不一致均返回 409；成功测试且 fingerprint 一致才允许启用。
- [ ] 修复 fingerprint 计算范围，必须覆盖 Workflow ID、JSON、输入/节点/输出映射、运行/尺寸选项和适配器版本。
- [ ] `fetchAndSaveWorkflowJson(workflowKey)` 必须从已保存配置读取真实 `workflowId`，以 API Key 调用 Demo 固定 JSON 接口，保存 JSON 和 fingerprint；不得根据 workflowCode 猜 ID。
- [ ] 读取 JSON 后若分析结果改变映射，必须在一次保存中提交 JSON、映射和工作流配置；不允许只更新 JSON 形成半成品状态。
- [ ] 测试服务必须使用与真实无限练习相同的 Runtime/Provider；查询到成功结果才写入成功测试证据。
- [ ] 扩展 `fetch-json`、测试启动、测试查询和启用 Route Handler 测试，验证 `{ code, data, msg }`、Session 权限和错误状态。
- [ ] 运行：

```powershell
pnpm --dir web vitest run src/lib/server/runninghub-workflow-domain.test.ts src/lib/server/runninghub-workflow-service.test.ts src/lib/server/runninghub-workflow-test-service.test.ts src/app/api/admin/runninghub/workflows
```

预期：通过。

## Task 5：让现有无限练习后端按 workflowCode 工作

**文件：** `practice-module-service.ts`、`practice-session-service.ts`、`runninghub-workflow-runtime.ts`、图片/视频/音频/文本任务 Route Handler、相关测试。

**操作：**

- [ ] 先写失败测试：RunningHub 渠道 `models=[]`、没有 logicalModels、没有 practiceWorkflowModels，但七条工作流中对应项已启用且测试 fingerprint 有效时，模块能力仍可用。
- [ ] 保留无限练习前端所需响应形状，但服务端生成数据直接来自启用工作流；当前前端提交的 `logicalModelId` 只作为输入兼容，不影响 RunningHub 工作流选择。
- [ ] `resolvePracticeModelFromSettings()` 在 RunningHub 无限练习分支按精确 workflowCode 找工作流；requested workflowCode 存在时必须精确匹配；不存在时返回 `PRACTICE_WORKFLOW_UNAVAILABLE`，不得回退普通模型。
- [ ] Session 继续保存 `workflowCode/workflowVersion/workflowConfigFingerprint/workflowAdapterVersion`；`selectedLogicalModelId` 对 RunningHub 不作为执行依据。
- [ ] 任务 Route Handler 复用已有图片/视频/音频/文本入口和计费、持久化、恢复、重试机制；任务上下文携带已校验工作流。
- [ ] `workflowTaskContextForChannel`、`attachPracticeWorkflowToChannel` 和 `workflowConfigForTask` 删除伪模型依赖，保留已有安全校验和版本 fingerprint 校验。
- [ ] 明确禁止 RunningHub 作为 production/shared 或其他工作台候选；普通渠道回归不变。
- [ ] 运行：

```powershell
pnpm --dir web vitest run src/lib/server/practice-module-service.test.ts src/lib/server/practice-session-service.test.ts src/lib/server/runninghub-workflow-runtime.test.ts src/app/api/practice/sessions src/app/api/image-tasks src/app/api/video-generation-tasks src/app/api/audio-tasks src/app/api/text-tasks
pnpm --dir web run typecheck
```

预期：通过。

## Task 6：补齐 Demo 七条工作流契约回归

**文件：** `web/src/lib/server/runninghub-demo-workflow-e2e-contract.test.ts`、Provider/Runtime/Adapter 测试、`web/scripts/runninghub-workflow-fixture.mjs`。

**操作：**

- [ ] fixture 只模拟 Demo 已确认端点：`/api/openapi/getJsonApiFormat`、`/openapi/v2/media/upload/binary`、`/task/openapi/create`、`/openapi/v2/query`。
- [ ] 为七条工作流分别断言真实 Workflow ID、输入映射、节点映射、输出类型、JSON 快照、参考媒体、视频音频开关和输出结果。
- [ ] 断言创建请求包含 Demo 需要的 `apiKey/workflowId/nodeInfoList/workflow`，不依赖通用模型目录或模型接口字段。
- [ ] 断言查询请求使用 `taskId`，终态后停止，不新增自定义轮询常数。
- [ ] 测试图片、视频、音频结果的类型解析和失败原因；不使用伪模型 ID 作为事实断言。
- [ ] 运行：

```powershell
pnpm --dir web vitest run src/lib/server/runninghub-demo-workflow-e2e-contract.test.ts src/lib/server/runninghub-provider.test.ts src/lib/server/runninghub-workflow-runtime.test.ts src/lib/server/runninghub-workflow-adapter.test.ts
```

预期：通过。

## Task 7：端到端闭环和全量质量门禁

**文件：** `web/e2e/admin-runninghub-workflow-demo-bootstrap.spec.ts`、`web/e2e/infinite-practice-demo-workflows.spec.ts`、`VOZEB-PRO-接口索引.md`、`VOZEB-PRO-开发地图.md`。

**操作：**

- [ ] 后台 E2E：创建仅含名称、地址、API Key 的 RunningHub 渠道 → 保存 → 初始化 Demo → 按 Workflow ID 拉取 JSON → 保存 → 测试并查询成功 → 启用；断言无模型 Tab、无契约字段、无逻辑绑定写入。
- [ ] 无限练习 E2E：不改前端，使用现有页面提交六类模块；后端按精确 workflowCode 调用七条工作流，刷新后结果和重试仍使用既有会话机制。
- [ ] 清理回归：准备含旧伪模型数据的设置，启动/读取/保存后断言伪模型、RunningHub bindings 和练习绑定清零；普通渠道数据保留。
- [ ] 运行相关测试：

```powershell
pnpm --dir web vitest run src/lib/auth src/lib/server/runninghub* src/lib/server/practice-module-service.test.ts src/lib/server/practice-session-service.test.ts src/app/api/admin/runninghub src/app/api/practice src/components/admin/channels
pnpm --dir web run typecheck
pnpm --dir web run lint -- --quiet
pnpm --dir web run format:check
pnpm --dir web run e2e -- e2e/admin-runninghub-workflow-demo-bootstrap.spec.ts e2e/infinite-practice-demo-workflows.spec.ts
```

- [ ] 需要共享 PostgreSQL 时，对对应 Vitest 命令增加 `--no-file-parallelism`。
- [ ] 从仓库根目录执行：

```powershell
pwsh -NoProfile -File .\过程文件\更新开发地图.ps1
pwsh -NoProfile -File .\过程文件\验证开发文档.ps1
```

- [ ] 严格 UTF-8 解码修改文件，检查 `U+FFFD`、`U+951F`、`U+65A4`、`U+62F7`；检查 `git diff --check`、`git status`，不得包含 `.env`、凭据、`output/` 或无关改动。
- [ ] 执行前端和后端 Mandatory Testing；不得把未完成的测试标为通过。

## Task 8：实施完成判定

只有同时满足以下条件才可报告完成：

1. RunningHub 渠道可以在没有任何上游模型的情况下保存。
2. RunningHub 渠道用途固定为无限练习，production/shared 被服务端拒绝。
3. 七条 Demo 工作流可以初始化、按 Workflow ID 拉取 JSON、保存、真实测试、测试成功后启用。
4. 伪模型、RunningHub 逻辑模型绑定和 `practiceWorkflowModels` 已清理，且不会在后续保存/启用时重新出现。
5. 无限练习前端代码未修改，既有页面仍能提交并得到对应工作流结果。
6. 普通模型渠道的模型路由、默认模型和正式生产流程未回归。
7. 相关单测、集成测试、类型检查、Lint、格式检查、E2E、开发地图和接口文档验证有真实通过证据。
8. 后续“按 API Key 拉取本人工作流目录”只记录在后续更新文档，不进入本版实现。

## 后续更新记录

“使用 API Key 拉取本人可见的全部 RunningHub 工作流目录”已记录在：

```text
docs/superpowers/specs/2026-09-09-runninghub-demo-aligned-cleanup-design.md
```

该需求后续必须先依据 RunningHub 官方列表接口证据设计，不能猜测接口路径，不能影响第一版 Demo 闭环。
