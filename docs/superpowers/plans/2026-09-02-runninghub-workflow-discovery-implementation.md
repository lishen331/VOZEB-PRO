# RunningHub 工作流自动发现与轻量测试实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** 在现有 RunningHub provider、无限练习和管理员工作流页面上增加“拉取工作流 JSON → 自动分析 → 运维确认 → 真实样例测试”的最小闭环，降低工作流接入复杂度；一期不提供面向运维的正式版本控制。

**Architecture:** 保留现有 systemChannels.advancedConfig.workflowConfigs 存储和异步任务链路。新增服务端工作流发现器，调用 RunningHub 官方 JSON 接口，返回节点候选并生成 inputSchema、nodeMappings、outputMappings；前端只编辑业务字段和确认候选。旧 version 字段、版本 Route 和高级协议字段继续兼容读取，但不再展示复制、切换和回滚操作。样例测试使用独立管理员测试身份，并记录当前配置指纹判断测试是否过期。

**Tech Stack:** Next.js App Router Route Handler、TypeScript、React、Ant Design、现有 runninghub-provider、现有 generation_tasks 测试存储、Vitest、Playwright、PostgreSQL/文件 Provider 兼容存储。

## Global Constraints

- 只修改 RunningHub 工作流发现、后台配置和测试链路，不修改短剧实验室、本地模型中台或正式生产默认模型。
- 所有管理员接口继续使用 { code, data, msg }，并要求 upstream.manage。
- API Key 只从服务端渠道配置读取并注入，不能进入浏览器、请求模板、日志或普通 DTO。
- 浏览器只提交业务输入和稳定业务 code，不能覆盖 channelId、Workflow ID、节点映射或请求模板。
- 官方 RunningHub 固定使用 POST /api/openapi/getJsonApiFormat、POST /task/openapi/create、POST /openapi/v2/query；非官方协议才进入高级兼容配置。
- 新增持久化字段必须使用幂等升级，不通过 CREATE TABLE IF NOT EXISTS 修改旧表结构。
- 不新增固定轮询次数、延时或输出上限；查询仍由现有任务调度和人工再次查询策略负责。
- 工作流配置或 JSON 指纹变化后，必须重新样例测试才能启用新配置；已有启用且没有指纹的旧配置保持兼容运行，直到被编辑或重新读取。
- 后台 Drawer、表单和操作列必须在桌面、390px、430px 下可见且无横向溢出。

## Current Files and Boundaries

| 文件 | 责任 | 本计划处理方式 |
| --- | --- | --- |
| web/src/lib/auth/store-types.ts | 渠道与工作流类型 | 增加发现摘要、指纹和测试状态字段，保留旧 version |
| web/src/lib/server/runninghub-provider.ts | RunningHub 请求适配 | 增加获取工作流 JSON 的官方方法 |
| web/src/lib/server/runninghub-workflow-domain.ts | 工作流校验和归一化 | 增加快速配置和指纹校验 |
| web/src/lib/server/runninghub-workflow-discovery.ts | 节点解析与候选生成 | 新建纯函数，不访问数据库 |
| web/src/lib/server/runninghub-workflow-service.ts | 工作流 CRUD 和启用 | 接收简化配置并生成服务端映射 |
| web/src/app/api/admin/runninghub/workflows/discover/route.ts | 拉取 JSON API | 新建，管理员专用，不保存配置 |
| web/src/components/admin/channels/runninghub-workflow-editor.tsx | 快速配置 UI | 默认展示业务字段和识别结果，高级字段折叠 |
| web/src/components/admin/channels/runninghub-workflow-list.tsx | 列表和操作 | 固定操作列，移除版本操作主入口 |
| web/src/lib/server/runninghub-workflow-test-service.ts | 真实样例测试 | 记录配置指纹，复用已有结果链路 |
| web/e2e/admin-runninghub-workflow-discovery.spec.ts | 浏览器闭环 | 新建，覆盖读取、确认、测试和启用 |

## Task 1: 固定简化后的领域类型和配置规则

**Files:**
- Modify: web/src/lib/auth/store-types.ts:72-101
- Modify: web/src/lib/server/runninghub-workflow-domain.ts
- Test: web/src/lib/server/runninghub-workflow-domain.test.ts

**Interfaces:**

    export type RunningHubWorkflowConfig = {
      workflowKey: string;
      workflowName: string;
      businessCode: RunningHubWorkflowBusinessCode;
      capability: LogicalModelCapability;
      providerType: "runninghub";
      channelId: string;
      workflowId: string;
      version: number; // legacy storage compatibility; not user-facing
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
      workflowJsonFingerprint?: string;
      lastTestConfigFingerprint?: string;
      lastTestAt?: string;
      lastTestResult?: "success" | "failed";
      lastTestError?: string;
    };

- [ ] **Step 1: 写失败测试**

在 runninghub-workflow-domain.test.ts 增加断言：快速配置只需要 workflowName、businessCode、capability、channelId、workflowId；官方默认协议可以由服务端补齐；version 缺失时归一化为 1 但不作为用户必填；配置指纹变化会被识别为需要重新测试；已启用配置只有一个；未知业务 code、能力不匹配、空 Workflow ID 和未确认的映射仍然失败。

- [ ] **Step 2: 运行失败测试**

    cd C:\CODE\blue-oem\web
    pnpm exec vitest run src/lib/server/runninghub-workflow-domain.test.ts

Expected: FAIL，领域类型没有指纹和快速配置默认值规则。

- [ ] **Step 3: 实现最小领域改动**

在 normalizeRunningHubWorkflowConfig 中保留旧路径字段；官方 RunningHub 配置缺少路径字段时补齐固定官方路径。增加稳定 JSON 指纹函数，按排序后的输入字段、节点映射和输出映射计算。启用校验读取 lastTestConfigFingerprint，不再要求页面填写 version。

- [ ] **Step 4: 运行通过测试**

    pnpm exec vitest run src/lib/server/runninghub-workflow-domain.test.ts

Expected: PASS，且旧配置仍能归一化读取。

- [ ] **Step 5: 提交**

    git add web/src/lib/auth/store-types.ts web/src/lib/server/runninghub-workflow-domain.ts web/src/lib/server/runninghub-workflow-domain.test.ts
    git commit -m "feat: define lightweight RunningHub workflow config"

## Task 2: 增加官方工作流 JSON 拉取适配器

**Files:**
- Modify: web/src/lib/server/runninghub-provider.ts
- Test: web/src/lib/server/runninghub-provider.test.ts

**Interface:**

    export async function fetchRunningHubWorkflowJson(input: {
      baseUrl: string;
      apiKey: string;
      workflowId: string;
      fetchImpl?: FetchImplementation;
    }): Promise<unknown>;

- [ ] **Step 1: 写失败测试**

使用本地 fetch fixture 断言：请求地址为 /api/openapi/getJsonApiFormat，方法为 POST，请求体包含 workflowId，API Key 由服务端注入；401 和业务错误返回脱敏错误；成功响应交给发现器，不被浏览器直接请求。

- [ ] **Step 2: 运行失败测试**

    pnpm exec vitest run src/lib/server/runninghub-provider.test.ts -t "workflow JSON"

Expected: FAIL，provider 没有 JSON 拉取方法。

- [ ] **Step 3: 实现适配器**

复用现有 requestJson、providerUrl 和 Bearer 鉴权；固定路径为 /api/openapi/getJsonApiFormat；请求体为 { workflowId, apiKey }，其中 apiKey 只由服务端拼入；不得从客户端接受自定义 URL 或请求方法。

- [ ] **Step 4: 运行测试和类型检查**

    pnpm exec vitest run src/lib/server/runninghub-provider.test.ts -t "workflow JSON"
    pnpm typecheck

Expected: PASS。

- [ ] **Step 5: 提交**

    git add web/src/lib/server/runninghub-provider.ts web/src/lib/server/runninghub-provider.test.ts
    git commit -m "feat: fetch RunningHub workflow JSON"

## Task 3: 实现工作流节点自动分析器

**Files:**
- Create: web/src/lib/server/runninghub-workflow-discovery.ts
- Create: web/src/lib/server/runninghub-workflow-discovery.test.ts

**Interfaces:**

    export type RunningHubNodeCandidate = {
      nodeId: string;
      fieldName: string;
      nodeTitle: string;
      nodeType: string;
      role: "prompt" | "image" | "video" | "audio" | "duration" | "enum" | "boolean" | "number" | "output" | "unknown";
      label: string;
      inputType?: RunningHubWorkflowInputField["type"];
      defaultValue?: string | number | boolean | null;
      hasExternalFileDependency: boolean;
      confidence: "high" | "medium" | "low";
    };

    export type RunningHubWorkflowDiscovery = {
      workflowId: string;
      workflowType?: string;
      nodeCount: number;
      candidates: RunningHubNodeCandidate[];
      suggestedInputs: RunningHubWorkflowInputField[];
      suggestedNodeMappings: RunningHubNodeMapping[];
      suggestedOutputs: RunningHubOutputMapping[];
      warnings: string[];
      workflowJsonFingerprint: string;
    };

    export function analyzeRunningHubWorkflowJson(input: {
      workflowId: string;
      raw: unknown;
      capability: LogicalModelCapability;
    }): RunningHubWorkflowDiscovery;

- [ ] **Step 1: 写失败测试**

用固定 fixture 覆盖 MiniMax H3 的 138.value、147/148/158.image、132.value、92；Boogu 的 62.prompt、32.image、68.image、44；文本、图片、视频、音频四种输出；默认文件名触发外部文件警告；两个候选提示词时不静默选择；缺少可写字段的节点进入 unknown。

- [ ] **Step 2: 运行失败测试**

    pnpm exec vitest run src/lib/server/runninghub-workflow-discovery.test.ts

Expected: FAIL，分析器文件不存在。

- [ ] **Step 3: 实现分析器**

按节点类型、标题、字段名、输入值类型和默认值生成候选；识别规则只生成建议，不决定 businessCode；对文件名、私有路径和无法验证的外部 URL 设置 hasExternalFileDependency=true；为候选生成业务 label；输出候选必须包含节点 ID，输入映射使用 INPUT 或 INPUT_OR_DEFAULT。

- [ ] **Step 4: 运行通过测试**

    pnpm exec vitest run src/lib/server/runninghub-workflow-discovery.test.ts

Expected: PASS，且分析结果不含 API Key。

- [ ] **Step 5: 提交**

    git add web/src/lib/server/runninghub-workflow-discovery.ts web/src/lib/server/runninghub-workflow-discovery.test.ts
    git commit -m "feat: analyze RunningHub workflow nodes"

## Task 4: 增加管理员“读取工作流” API 和快速保存规则

**Files:**
- Create: web/src/app/api/admin/runninghub/workflows/discover/route.ts
- Create: web/src/app/api/admin/runninghub/workflows/discover/route.test.ts
- Modify: web/src/lib/server/runninghub-workflow-service.ts
- Modify: web/src/lib/server/runninghub-workflow-domain.ts
- Modify: web/src/app/api/admin/runninghub/workflows/route.ts
- Modify: web/src/app/api/admin/runninghub/workflows/[workflowKey]/route.ts

**Interfaces:**

    // POST /api/admin/runninghub/workflows/discover
    type DiscoverRequest = {
      channelId: string;
      workflowIdOrUrl: string;
      capability: "text" | "image" | "video" | "audio";
    };

    type DiscoverResponse = RunningHubWorkflowDiscovery;

- [ ] **Step 1: 写失败测试**

测试未登录返回 401，没有 upstream.manage 返回 403，非 RunningHub 渠道返回 400，完整链接可以解析出 Workflow ID，别名 workflow-minimax-h3-base 不通过数字格式伪装为有效 ID，读取成功返回候选和警告，响应不包含 API Key。

- [ ] **Step 2: 运行失败测试**

    pnpm exec vitest run src/app/api/admin/runninghub/workflows/discover/route.test.ts

Expected: FAIL，Route 和服务方法不存在。

- [ ] **Step 3: 实现发现 Route 和保存入口**

Route 只负责鉴权、解析请求和响应映射；服务端读取渠道密钥，调用 fetchRunningHubWorkflowJson，再调用 analyzeRunningHubWorkflowJson。保存接口接受 workflowId、业务字段和确认后的 inputSchema、nodeMappings、outputMappings；缺少官方路径字段时由服务端补齐，高级自定义协议仍按旧字段兼容读取。

启用时校验当前配置存在成功测试记录，且当前配置指纹等于最近成功测试指纹；否则返回“请先提交样例测试”。启用/停用不创建新版本。

- [ ] **Step 4: 运行 Route、service 和类型测试**

    pnpm exec vitest run src/app/api/admin/runninghub/workflows/discover/route.test.ts src/lib/server/runninghub-workflow-service.test.ts src/lib/server/runninghub-workflow-domain.test.ts --no-file-parallelism
    pnpm typecheck

Expected: PASS。

- [ ] **Step 5: 提交**

    git add web/src/app/api/admin/runninghub/workflows/discover web/src/app/api/admin/runninghub/workflows/route.ts 'web/src/app/api/admin/runninghub/workflows/[workflowKey]/route.ts' web/src/lib/server/runninghub-workflow-service.ts web/src/lib/server/runninghub-workflow-domain.ts
    git commit -m "feat: add RunningHub workflow discovery API"
+
## Task 5: 将后台编辑器改成快速配置和节点确认

**Files:**
- Modify: web/src/components/admin/channels/runninghub-workflow-editor.tsx
- Modify: web/src/components/admin/channels/runninghub-workflow-list.tsx
- Modify: web/src/components/admin/channels/runninghub-workflow-test-panel.tsx
- Test: web/src/components/admin/channels/runninghub-workflow-list.test.tsx
- Test: web/src/components/admin/channels/runninghub-channel-fields.test.tsx

**UI Contract:**

默认编辑流程为：

    基础信息 → 读取工作流 → 确认输入/输出 → 保存 → 样例测试

- [ ] **Step 1: 写失败的组件测试**

覆盖：新建表单不显示创建路径、查询路径、任务 ID、状态、结果和请求模板；点击“读取工作流”展示提示词、参考图、视频时长、输出视频；不确定候选要求选择；默认文件依赖显示警告；已停用行显示编辑、读取、测试、启用；列表操作列始终可见；不显示复制版本和版本切换。

- [ ] **Step 2: 运行失败测试**

    pnpm exec vitest run src/components/admin/channels/runninghub-workflow-list.test.tsx src/components/admin/channels/runninghub-channel-fields.test.tsx

Expected: FAIL，当前编辑器仍要求手填底层 JSON。

- [ ] **Step 3: 实现快速配置 UI**

编辑器增加读取工作流按钮和发现结果状态；将服务端候选转换为业务字段选择器；保存时只提交确认后的业务映射。高级配置放入折叠面板，仍能查看兼容字段，但不要求普通流程填写。渠道和 API Key 只显示渠道名称及“已配置”状态。

列表保留名称、能力、业务用途、Workflow ID、输入/输出摘要、启用状态和最近测试摘要；操作列固定右侧。移除复制版本作为主操作，不删除后端旧 Route。

- [ ] **Step 4: 运行组件测试和格式检查**

    pnpm exec vitest run src/components/admin/channels/runninghub-workflow-list.test.tsx src/components/admin/channels/runninghub-channel-fields.test.tsx
    pnpm exec prettier --check src/components/admin/channels/runninghub-workflow-editor.tsx src/components/admin/channels/runninghub-workflow-list.tsx

Expected: PASS。

- [ ] **Step 5: 提交**

    git add web/src/components/admin/channels/runninghub-workflow-editor.tsx web/src/components/admin/channels/runninghub-workflow-list.tsx web/src/components/admin/channels/runninghub-workflow-test-panel.tsx web/src/components/admin/channels/runninghub-workflow-list.test.tsx web/src/components/admin/channels/runninghub-channel-fields.test.tsx
    git commit -m "feat: simplify RunningHub workflow admin UI"

## Task 6: 让真实样例测试使用动态输入并记录测试指纹

**Files:**
- Modify: web/src/lib/server/runninghub-workflow-test-service.ts
- Modify: web/src/lib/server/admin-workflow-test-store.ts
- Modify: web/src/components/admin/channels/runninghub-workflow-test-panel.tsx
- Test: web/src/lib/server/runninghub-workflow-test-service.test.ts
- Test: web/src/lib/server/admin-workflow-test-store.test.ts

**Interface:**

    type WorkflowTestResult = {
      runId: string;
      status: "pending" | "running" | "success" | "error";
      taskId?: string;
      workflowId: string;
      configFingerprint: string;
      resultUrl?: string;
      resultUrls?: string[];
      resultText?: string;
      outputs?: RunningHubOutput[];
      error?: string;
    };

- [ ] **Step 1: 写失败测试**

覆盖：根据 inputSchema 校验文本、数字、枚举和必填媒体；测试上传真实参考图并覆盖默认文件节点；没有必填参考图时不创建任务；提交成功保存 taskId 和配置指纹；查询只更新同一个 run，不重复创建任务；成功结果可读取 MP4、PNG、WAV、TXT；失败显示上游原因；测试不产生 schoolId、projectId、积分流水或正式作品。

- [ ] **Step 2: 运行失败测试**

    pnpm exec vitest run src/lib/server/runninghub-workflow-test-service.test.ts src/lib/server/admin-workflow-test-store.test.ts --no-file-parallelism

Expected: FAIL，测试记录没有配置指纹和动态输入规则。

- [ ] **Step 3: 实现测试服务调整**

复用 buildRunningHubWorkflowPayload、uploadRunningHubMedia、submitRunningHubTask 和 queryRunningHubTask；测试开始时读取当前工作流配置并计算指纹；测试记录保存 workflowId、指纹、taskId 和结果摘要。成功后更新当前配置的 lastTestConfigFingerprint；配置发生变化时清除该字段并显示重新测试提示。

测试面板从 inputSchema 生成控件，图片、视频、音频使用现有受控上传机制；结果区域复用现有媒体预览组件，不新增结果协议。

- [ ] **Step 4: 运行测试、类型和格式检查**

    pnpm exec vitest run src/lib/server/runninghub-workflow-test-service.test.ts src/lib/server/admin-workflow-test-store.test.ts --no-file-parallelism
    pnpm typecheck
    pnpm exec prettier --check src/lib/server/runninghub-workflow-test-service.ts src/components/admin/channels/runninghub-workflow-test-panel.tsx

Expected: PASS。

- [ ] **Step 5: 提交**

    git add web/src/lib/server/runninghub-workflow-test-service.ts web/src/lib/server/admin-workflow-test-store.ts web/src/components/admin/channels/runninghub-workflow-test-panel.tsx web/src/lib/server/runninghub-workflow-test-service.test.ts web/src/lib/server/admin-workflow-test-store.test.ts
    git commit -m "feat: record RunningHub workflow test evidence"

## Task 7: 调整无限练习绑定和运行时测试门禁

**Files:**
- Modify: web/src/lib/server/practice-workflow-router.ts
- Modify: web/src/lib/server/runninghub-workflow-runtime.ts
- Modify: web/src/lib/server/generation-channel.ts
- Modify: web/src/lib/server/runninghub-workflow-service.ts
- Test: web/src/lib/server/practice-workflow-router.test.ts
- Test: web/src/lib/server/runninghub-workflow-runtime.test.ts

- [ ] **Step 1: 写失败测试**

断言：无限练习只解析已启用且当前配置测试指纹有效的工作流；客户端传入 Workflow ID、节点 JSON 或请求模板不能覆盖服务端配置；旧的已启用且没有指纹的配置继续兼容；配置改变后新任务被拒绝并给出“请让平台管理员重新测试”；正式生产和短剧实验室不读取 open-source-practice 工作流。

- [ ] **Step 2: 运行失败测试**

    pnpm exec vitest run src/lib/server/practice-workflow-router.test.ts src/lib/server/runninghub-workflow-runtime.test.ts

Expected: FAIL，运行时没有当前指纹门禁。

- [ ] **Step 3: 实现运行时规则**

resolvePracticeWorkflow 仍按业务 code 找唯一启用工作流；新建或已重新读取的配置必须有成功测试指纹；历史启用配置没有指纹时沿用旧行为并记录兼容标记。任务上下文保存 Workflow ID、配置指纹和业务 code，不保存 API Key。前端仍只传业务输入。

- [ ] **Step 4: 运行定向测试**

    pnpm exec vitest run src/lib/server/practice-workflow-router.test.ts src/lib/server/runninghub-workflow-runtime.test.ts src/lib/server/generation-channel.test.ts --no-file-parallelism
    pnpm typecheck

Expected: PASS。

- [ ] **Step 5: 提交**

    git add web/src/lib/server/practice-workflow-router.ts web/src/lib/server/runninghub-workflow-runtime.ts web/src/lib/server/generation-channel.ts web/src/lib/server/runninghub-workflow-service.ts web/src/lib/server/practice-workflow-router.test.ts web/src/lib/server/runninghub-workflow-runtime.test.ts
    git commit -m "feat: gate practice workflows by test evidence"

## Task 8: 浏览器闭环和数据兼容验收

**Files:**
- Create: web/e2e/admin-runninghub-workflow-discovery.spec.ts
- Modify: docs/content/docs/backend/backend-database.mdx
- Modify: VOZEB-PRO-接口索引.md
- Modify: VOZEB-PRO-开发地图.md
- Modify: docs/index.md
- Modify: docs/superpowers/specs/2026-09-01-runninghub-workflow-practice-design.md to add the superseded-baseline note

- [ ] **Step 1: 写浏览器验收**

使用本地 RunningHub fixture 覆盖：平台管理员进入工作流区；只填名称、能力和 Workflow ID；点击读取工作流看到业务输入和输出候选；选择参考图节点并看到默认文件警告；提交样例测试看到 taskId、状态和媒体结果；测试成功后启用，刷新后状态和最近测试仍存在；修改映射后启用被阻止，重新测试后可以启用；停用后仍可编辑、读取和测试；390px、430px 下操作按钮和结果可见；学校练习使用启用工作流，正式生产不使用该工作流。

- [ ] **Step 2: 运行浏览器测试**

    cd C:\CODE\blue-oem\web
    pnpm exec playwright test e2e/admin-runninghub-workflow-discovery.spec.ts

Expected: PASS。

- [ ] **Step 3: 更新文档定位**

在数据库文档记录新增指纹和发现摘要字段及幂等升级方式；接口索引登记 POST /api/admin/runninghub/workflows/discover；开发地图登记发现器、后台入口和测试文件；在旧设计顶部标明本文档的快速配置和轻量测试规则替代旧的手填协议和面向运维版本管理描述。不得把 API Key、真实请求体或 output/ 文件写入文档。

- [ ] **Step 4: 执行完整质量门禁**

从仓库根目录执行：

    pwsh -NoProfile -File .\过程文件\更新开发地图.ps1
    pwsh -NoProfile -File .\过程文件\验证开发文档.ps1
    cd web
    pnpm lint
    pnpm typecheck
    pnpm test -- --no-file-parallelism
    pnpm exec playwright test
    pnpm check:release

如果 PostgreSQL 集成测试涉及同一测试库，使用 --no-file-parallelism。失败时保留日志并修复根因，不能通过强制点击、固定延时或跳过测试绕过。

- [ ] **Step 5: 检查编码和差异**

    git diff --check
    git status --short

严格按 UTF-8 读取新增或修改 Markdown、TypeScript 和 JSON，扫描 U+FFFD、U+951F、U+65A4、U+62F7；确认 .env、API Key、output/、临时 fixture 和用户已有改动没有进入提交。

- [ ] **Step 6: 最终提交**

    git add web/e2e/admin-runninghub-workflow-discovery.spec.ts docs/content/docs/backend/backend-database.mdx VOZEB-PRO-接口索引.md VOZEB-PRO-开发地图.md docs/index.md docs/superpowers/specs/2026-09-01-runninghub-workflow-practice-design.md
    git commit -m "test: verify RunningHub workflow discovery flow"

## Implementation Notes

1. 不删除旧的 versions Route、version 字段或旧高级配置；它们只作为已有数据和旧调用的兼容层，不再出现在一期运维主流程。
2. 测试成功是当前配置可用的证据，不是新的工作流状态，也不触发自动启用。
3. MiniMax H3 的真实映射必须以读取 JSON 得到的节点为准：138.value、147/148/158.image、132.value、92；不得把这些 ID 写成所有视频工作流的固定默认值。
4. 参考素材测试必须覆盖“原作者默认文件失败 → 上传真实素材替换 → 任务成功”；只验证网络连通不算接入完成。
5. 后续接入本地模型时复用业务输入/输出契约、配置指纹、测试证据和任务上下文，只新增 provider adapter，不把本地调度字段提前塞进 RunningHub 表单。
