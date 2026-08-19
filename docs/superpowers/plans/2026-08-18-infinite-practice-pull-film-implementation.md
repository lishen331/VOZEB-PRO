# 无限练习、RunningHub 与拉片制作流程实施计划

> **For agentic workers:** 使用 `superpowers:executing-plans` 按任务顺序执行。每个任务先写失败测试，再写最小实现；每个任务完成后执行该任务的定向测试、`pnpm typecheck`，并单独提交。

**Goal:** 在现有 VOZEB PRO 的 Canvas、短剧、作品广场、模型渠道和生成任务基础上，增加绑定学校租户的独立“无限练习”模块：学校内 active teacher/student（学校管理员仍是 teacher + school.manage）可以创建空白练习项目，或从平台管理员标记的公开作品复制制作流程作为初始内容；普通 C 端用户不显示入口且不能直达使用；平台管理员可以配置 RunningHub 开源模型渠道、练习模型池和拉片资格，并在后台查看老师、学生和学校管理员的完整功能入口；正式生产项目、充值积分和既有 C 端创作流程保持不变。

**Architecture:** 无限练习不是正式项目的模式开关。Canvas/Drama 项目在创建时写入不可变的 `executionProfile`（`production` 或 `open-source-practice`），复制动作创建新的练习项目身份，正式项目不能被切换成练习项目。所有练习页面、项目和 session 先通过现有 school context service 校验 active membership；用户导航把 `/practice` 放入“项目”分组并按真实 school context 显隐。小模块（剧本、分镜图、分镜视频、配音、音乐）使用新的 `practice_sessions` 聚合和现有 text/image/video/audio 任务链路。模型渠道继续使用现有 `system_model_channels`、逻辑模型和任务调度器，只增加渠道用途 `production | open-source-practice | shared`；RunningHub 是一种 provider/protocol，不建立第二套模型后台。公开作品的制作流程快照绑定到 `published_work_versions`，只对平台管理员开启，公共页面在现有“灵感发现”作品预览中切换“成片/制作流程”，不新增拉片库或资产菜单。管理后台增加只读“角色功能总览”，从共享导航定义生成教师、学生和学校管理员视图，不伪造租户身份或绕过业务鉴权。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Ant Design 6、Tailwind CSS 4、Zustand、PostgreSQL、Vitest、Playwright。现有文件 Provider 继续只服务开发回退；公开作品发布与拉片复制依赖 PostgreSQL 的定向查询和事务。

## Global Constraints

- 以 `docs/superpowers/specs/2026-08-18-infinite-practice-pull-film-design.md` 为产品基线；如果实现发现冲突，先更新 spec 和本计划，再继续编码。
- 保留 `UserRole = "admin" | "user"`，不新增全局 teacher/student 角色。无限练习是绑定学校租户的 C 端能力：active teacher/student 可用，学校管理员以 `teacher + school.manage` 使用；没有学校 membership、成员已停用或学校已停用时不显示入口，页面和 API 直接访问返回 403/404。平台管理员身份本身不等于学校成员，不能绕过该约束；超级管理员通过后台只读角色功能总览查看老师、学生和学校管理员的功能入口。
- 正式 Canvas/短剧项目默认 `production`，练习项目创建时固定 `open-source-practice`，更新接口拒绝改变该字段。不得实现 Canvas 与短剧互转。
- “无限”只代表练习请求不调用现有用户积分钱包的扣减；管理员配置的模型池、任务并发、队列、每日总成本、媒体大小、上游限流和失败重试保护继续生效。不得以固定轮询次数、固定重试次数或硬编码上限伪装资源控制。
- 用户端不选择 RunningHub、provider 或具体模型；练习模块只选择能力。服务端根据 `open-source-practice` 执行配置解析真实逻辑模型和渠道。
- RunningHub 采用官方异步任务契约：提交得到 `taskId`，随后查询状态和结果；上传参考文件使用官方媒体上传接口返回的短期链接，不能把该链接当作本地媒体长期存储。模型的 `createPath`、`queryPath`、请求模板和结果字段必须由管理员按 RunningHub 官方模型文档填写，禁止猜测 V2 模型目录或任务路径。官方参考：[RunningHub API 文档](https://www.runninghub.cn/runninghub-api-doc-cn/)。
- 拉片只允许 sourceType 为 `canvas` 或 `drama` 的已公开、已审核、当前发布版本使用；media 类型作品不显示制作流程和复制入口。下架、撤销或新版本发布后，旧资格不继续对外可用。
- 制作流程快照必须 immutable、按 published version 绑定，并删除私聊、Agent 内部消息、执行提示词、API key、storage key、内部任务 ID、临时媒体和未发布素材。只返回经过 `published_work_assets` 白名单映射的公开媒体引用和可读结构数据。
- Route Handler 只负责 HTTP 入参、Session、必要的账号状态检查、service 调用和 `{ code, data, msg }` 响应；业务校验在 `web/src/lib/server/`，SQL 在 repository。公开路由必须再次校验当前 published version，不能只信任客户端传来的 versionId。
- PostgreSQL 在线查询必须按用户、学校、作品、版本、状态和分页定向执行；禁止读取全量作品、全量项目或整张 JSON 后在 Node.js 筛选。写入拉片快照、复制项目和幂等记录使用同一事务。
- 不改动当前工作区已有的 `web/src/proxy.ts`、`web/src/proxy.test.ts`、部署说明或学校实施计划等无关文件。所有中文源码、配置、测试和文档保存为 UTF-8，并在收尾执行严格解码与乱码检查。
- 页面沿用现有 Next.js、Ant Design、Tailwind 和后台页面模式。后台列表使用列表/卡片 + 创建/编辑 Modal/Drawer；不引入独立视觉体系，不新增“拉片库”菜单。
- 每个任务先写失败测试；测试失败时不以增加固定延时、强制点击、放宽断言或静默 skip 解决。PostgreSQL 集成文件使用 `--no-file-parallelism`。

## Task 1: 固定练习、渠道用途与拉片领域契约

**Files:**

- Create: `web/src/lib/practice-domain.ts`
- Create: `web/src/lib/practice-domain.test.ts`
- Modify: `web/src/lib/auth/store-types.ts`
- Modify: `web/src/lib/auth/store-foundation.ts`
- Modify: `web/src/lib/auth/store-normalizers.ts`
- Modify: `web/src/lib/model-routing-config.ts`
- Modify: `web/src/lib/channel-protocol-registry.ts`
- Modify: `web/src/lib/admin-permissions.ts`
- Modify: `web/src/lib/admin-permissions.test.ts`

**Interfaces:**

- Produces shared types: `PracticeExecutionProfile`, `PracticeProjectKind`, `PracticeModuleKind`, `PracticeSource`, `SystemChannelPurpose`、`PullFilmSourceType`、`PublicProcessSnapshot` 和 `resolvePracticeModelAccess`。
- Extends `SystemChannelProtocol` with `runninghub` and `SystemModelChannel` with `purpose?: "production" | "open-source-practice" | "shared"`。
- Extends `AuthSettings` with `practiceDefaultModels: SystemDefaultModels`；现有 defaultModels 仍只代表正式生产默认值。

- [ ] **Step 1: 先写失败测试**

  测试至少固定：正式模型不能被练习解析；练习模型不能被正式解析；shared 渠道两边可解析；未配置练习默认模型返回明确错误；`production` 项目不能通过纯函数变为 `open-source-practice`；只有 `canvas/drama` 允许拉片。

  ```ts
  expect(resolvePracticeModelAccess("open-source-practice", "production")).toBe(false);
  expect(resolvePracticeModelAccess("open-source-practice", "shared")).toBe(true);
  expect(isPullFilmSourceType("media")).toBe(false);
  expect(isPullFilmSourceType("drama")).toBe(true);
  ```

- [ ] **Step 2: 运行失败测试**

  Run: `cd web; pnpm exec vitest run src/lib/practice-domain.test.ts src/lib/admin-permissions.test.ts`

  Expected: FAIL，类型、协议和权限契约尚不存在。

- [ ] **Step 3: 实现契约和安全默认值**

  `practice-domain.ts` 固定以下类型，不在各页面重复声明：

  ```ts
  export type PracticeExecutionProfile = "production" | "open-source-practice";
  export type PracticeProjectKind = "canvas" | "drama";
  export type PracticeModuleKind = "script" | "storyboard-image" | "storyboard-video" | "dubbing" | "music";
  export type SystemChannelPurpose = "production" | "open-source-practice" | "shared";
  export type PracticeSource =
      | { type: "blank" }
      | { type: "published-work"; workId: string; versionId: string };
  export type PublicProcessSnapshot =
      | { sourceType: "canvas"; versionId: string; nodes: readonly PublicCanvasNode[]; assets: readonly PublicProcessAsset[] }
      | { sourceType: "drama"; versionId: string; episodes: readonly PublicDramaEpisode[]; assets: readonly PublicProcessAsset[] };
  export function canChangeExecutionProfile(from: PracticeExecutionProfile, to: PracticeExecutionProfile): false;
  export function isPullFilmSourceType(sourceType: string): sourceType is "canvas" | "drama";
  ```

  `DEFAULT_SETTINGS.practiceDefaultModels` 四个能力均为空字符串；普通渠道没有显式 purpose 时由归一化为 `shared`，避免读到旧设置后意外把正式渠道当成练习专用渠道。新增管理员职责 `content.manage` 继续负责拉片开关，`upstream.manage` 继续负责渠道和模型池，不新拆权限。

- [ ] **Step 4: 让模型路由支持执行 profile**

  将 `resolveLogicalModelConfig`、`isLogicalModelResolvable`、默认模型归一化增加可选 `executionProfile` 参数；production 只接受 `production/shared`，practice 只接受 `open-source-practice/shared`。不改变现有调用的默认行为（默认 production）。为练习默认模型增加独立校验，不能在找不到练习绑定时回退到 `defaultModels`。

- [ ] **Step 5: 运行定向测试和类型检查**

  Run: `cd web; pnpm exec vitest run src/lib/practice-domain.test.ts src/lib/model-routing-config.test.ts src/lib/channel-protocol-registry.test.ts src/lib/admin-permissions.test.ts; pnpm typecheck`

  Expected: PASS。

- [ ] **Step 6: 提交**

  ```bash
  git add web/src/lib/practice-domain.ts web/src/lib/practice-domain.test.ts web/src/lib/auth/store-types.ts web/src/lib/auth/store-foundation.ts web/src/lib/auth/store-normalizers.ts web/src/lib/model-routing-config.ts web/src/lib/channel-protocol-registry.ts web/src/lib/admin-permissions.ts web/src/lib/admin-permissions.test.ts
  git commit -m "feat: define infinite practice contracts"
  ```

## Task 2: 持久化练习模型池、渠道用途和项目身份

**Files:**

- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `web/src/lib/server/database/schema-commercial-features.ts`
- Modify: `web/src/lib/server/database/schema-triggers.ts`
- Modify: `web/src/lib/server/database/repository-types.ts`
- Modify: `web/src/lib/server/database/repositories.ts`
- Modify: `web/src/lib/server/database/repository-work-publication-mappers.ts`
- Modify: `web/src/lib/auth/store-repository.ts`
- Modify: `web/src/lib/auth/postgres-auth-settings-service.ts`
- Modify: `web/src/lib/auth/store-normalizers.ts`
- Modify: `web/src/lib/server/canvas-project-store.ts`
- Modify: `web/src/lib/server/drama-project-store.ts`
- Create: `web/src/lib/server/database/practice-repository.ts`
- Create: `web/src/lib/server/database/practice-repository.test.ts`

**Interfaces:**

- Adds `app_settings.practice_default_models` and `system_model_channels.purpose`.
- Adds immutable `execution_profile`, `school_id`, `practice_source_work_id`, `practice_source_version_id` to `canvas_projects` and `drama_projects`, with `(school_id, user_id, execution_profile, updated_at DESC)` indexes.
- Adds `practice_sessions` and `practice_copy_requests` tables, both carrying the server-derived `school_id`. A session stores module, prompt/input JSON, task references and status; a copy request stores `(school_id, user_id, client_request_id)` and resulting project identity for retry idempotency. Every repository read and write scopes by school and user.
- Adds version-bound `pull_film_enabled`, `pull_film_snapshot`, `pull_film_enabled_at`, `pull_film_enabled_by_user_id` to `published_work_versions`; a new version defaults disabled.

- [ ] **Step 1: 先写 PostgreSQL repository/schema 失败测试**

  在专用 PostgreSQL 测试库中断言：旧设置读取 purpose 为 `shared`；practice 默认模型可 round-trip；production 项目无法更新为 practice；不同学校之间不能读取或修改对方 practice 项目/session；practice copy request 重复提交返回原项目；不同用户可使用同一 clientRequestId；published version 的 pull-film 开关和快照独立于 `is_featured`。

- [ ] **Step 2: 运行失败测试**

  Run: `cd web; $env:VOZEB_PRO_RUN_POSTGRES_INTEGRATION="1"; pnpm exec vitest run src/lib/server/database/practice-repository.test.ts --no-file-parallelism`

  Expected: FAIL，目标列、表和 repository 尚不存在。

- [ ] **Step 3: 修改 Schema 和 mapper**

  在 `schema.ts`/`schema-commercial-features.ts` 增加列、CHECK、索引和触发器。`published_work_versions` 的快照使用 JSONB 但只能由 sanitizer 生成；repository 不接受任意客户端 JSON。删除/撤销/下架时清除或关闭当前公开版本的 pull-film 状态；发布新版本不继承旧快照。

  `store-repository.ts`、`postgres-auth-settings-service.ts` 和 `store-normalizers.ts` 同时读写 `practiceDefaultModels`、channel purpose，保持管理员 settings GET/PATCH 读后写一致。

- [ ] **Step 4: 扩展 Canvas/Drama store 的创建与不可变更新**

  `createCanvasProject`/`createDramaProject` 接受服务端构造的 `schoolId`、`executionProfile` 和 `PracticeSource`，列表 DTO 返回 `executionProfile` 和来源摘要；普通更新只允许 title/project JSON，若请求体带 profile、schoolId 或 source 字段直接 400。项目读取必须按 schoolId + userId + id 定向校验，不能通过列表后端筛选。

- [ ] **Step 5: 实现 practice repository**

  暴露 `createPracticeSession`、`getPracticeSessionForUser`、`listPracticeSessionsForUser`、`claimCopyRequest`、`getPullFilmVersion`、`setPullFilmVersion` 等窄接口。`claimCopyRequest` 使用 PostgreSQL 唯一约束和事务返回已存在结果，不用内存锁保证幂等。

- [ ] **Step 6: 更新数据库文档**

  在 `docs/content/docs/backend/backend-database.mdx` 增加 practice_sessions、practice_copy_requests、项目执行 profile、RunningHub purpose 和 published version 快照字段说明。

- [ ] **Step 7: 运行测试、类型检查和文档乱码检查**

  Run: `cd web; $env:VOZEB_PRO_RUN_POSTGRES_INTEGRATION="1"; pnpm exec vitest run src/lib/server/database/practice-repository.test.ts src/lib/server/database/repositories.test.ts --no-file-parallelism; pnpm typecheck`

  Expected: PASS；随后使用严格 UTF-8 解码检查新增文档。

- [ ] **Step 8: 提交**

  ```bash
  git add web/src/lib/server/database/schema.ts web/src/lib/server/database/schema-commercial-features.ts web/src/lib/server/database/schema-triggers.ts web/src/lib/server/database/repository-types.ts web/src/lib/server/database/repositories.ts web/src/lib/server/database/repository-work-publication-mappers.ts web/src/lib/auth/store-repository.ts web/src/lib/auth/postgres-auth-settings-service.ts web/src/lib/auth/store-normalizers.ts web/src/lib/server/canvas-project-store.ts web/src/lib/server/drama-project-store.ts web/src/lib/server/database/practice-repository.ts web/src/lib/server/database/practice-repository.test.ts docs/content/docs/backend/backend-database.mdx
  git commit -m "feat: persist practice identities and settings"
  ```

## Task 3: 接入 RunningHub provider 与统一执行策略

**Files:**

- Modify: `web/src/lib/channel-protocol-registry.ts`
- Modify: `web/src/lib/server/provider-task-config.ts`
- Create: `web/src/lib/server/runninghub-provider.ts`
- Create: `web/src/lib/server/runninghub-provider.test.ts`
- Modify: `web/src/lib/server/generation-task-types.ts`
- Modify: `web/src/lib/server/generation-task-store.ts`
- Modify: `web/src/lib/server/generation-task-scheduler.ts`
- Modify: `web/src/lib/server/text-task-runtime.ts`
- Modify: `web/src/lib/server/image-task-runtime.ts`
- Modify: `web/src/lib/server/video-task-runtime.ts`
- Modify: `web/src/lib/server/audio-task-runtime.ts`
- Create: `web/src/lib/server/generation-execution-policy.ts`
- Create: `web/src/lib/server/generation-execution-policy.test.ts`
- Modify: `web/src/app/api/text-tasks/route.ts`
- Modify: `web/src/app/api/image-tasks/route.ts`
- Modify: `web/src/app/api/video-generation-tasks/route.ts`
- Modify: `web/src/app/api/audio-tasks/route.ts`
- Modify: `web/src/app/api/ai/system/[channelId]/[...path]/route.ts`

**Interfaces:**

- Adds `executionProfile` to generation task context, payload and persisted `generation_tasks` row; default is production.
- Adds `resolveGenerationExecutionPolicy(input)` returning `{ profile, billingMode, channelPurpose, allowPractice }`.
- Adds `submitRunningHubTask`, `queryRunningHubTask`, `uploadRunningHubMedia` around configured paths and response fields.

- [ ] **Step 1: 先写 provider 和 billing policy 失败测试**

  测试固定：RunningHub bearer header 和 base URL 拼接；提交响应只接受配置的 taskId/result field；查询状态支持配置的 status/result field；缺少 create/query path 失败而不猜路径；practice 任务跳过 `consumeUserPoints` 但仍执行 concurrency/cost-control；production 请求伪造 practice profile 被拒绝；同一任务重试不重复计算自身并发额度。

- [ ] **Step 2: 运行失败测试**

  Run: `cd web; pnpm exec vitest run src/lib/server/runninghub-provider.test.ts src/lib/server/generation-execution-policy.test.ts src/lib/server/provider-task-config.test.ts`

  Expected: FAIL。

- [ ] **Step 3: 实现 RunningHub adapter，不猜测模型目录**

  `runninghub-provider.ts` 只消费 `SystemChannelModelConfig`/`SystemChannelAdvancedConfig` 中已经由管理员填写并校验过的路径；对官方异步响应提取 taskId、状态、结果 URL，并将不完整响应转为可重试错误。`uploadRunningHubMedia` 使用官方 `/openapi/v2/media/upload/binary`，上传成功后只把短期 `download_url` 交给当前任务，不写入 `local_media_assets`。若后续接本地模型，复用同一 provider contract，不新增用户端 provider 分支。

- [ ] **Step 4: 将 execution profile 接入所有任务入口**

  在 text/image/video/audio/AI system route 中，只有 practice API 生成的内部 context 才能传入 `open-source-practice`；现有 `/create`、Canvas、短剧和普通系统 API 仍走 production。`generation-execution-policy.ts` 统一决定是否计积分、选哪个 default model、允许的 channel purpose 和现有 cost/concurrency 检查。不要在每个 route 复制一份“免费”判断。

  任务落库后持久化 profile，worker 恢复、轮询、失败退款和审计读取该字段。practice 任务不创建积分消费记录，也不调用退款；若上游已创建但落库失败，保留现有 needs-review/恢复路径。

- [ ] **Step 5: 运行定向测试与类型检查**

  Run: `cd web; pnpm exec vitest run src/lib/server/runninghub-provider.test.ts src/lib/server/generation-execution-policy.test.ts src/lib/server/generation-task-store.test.ts src/lib/server/text-task-runtime.test.ts src/lib/server/image-task-runtime.test.ts src/lib/server/video-task-runtime.test.ts src/lib/server/audio-task-runtime.test.ts src/app/api/text-tasks/route.test.ts src/app/api/image-tasks/route.test.ts src/app/api/video-generation-tasks/route.test.ts src/app/api/audio-tasks/route.test.ts --no-file-parallelism; pnpm typecheck`

  Expected: PASS；既有 production 积分测试不变，新增 practice 测试明确断言不扣费但仍受保护。

- [ ] **Step 6: 提交**

  ```bash
  git add web/src/lib/channel-protocol-registry.ts web/src/lib/server/provider-task-config.ts web/src/lib/server/runninghub-provider.ts web/src/lib/server/runninghub-provider.test.ts web/src/lib/server/generation-task-types.ts web/src/lib/server/generation-task-store.ts web/src/lib/server/generation-task-scheduler.ts web/src/lib/server/text-task-runtime.ts web/src/lib/server/image-task-runtime.ts web/src/lib/server/video-task-runtime.ts web/src/lib/server/audio-task-runtime.ts web/src/lib/server/generation-execution-policy.ts web/src/lib/server/generation-execution-policy.test.ts web/src/app/api/text-tasks/route.ts web/src/app/api/image-tasks/route.ts web/src/app/api/video-generation-tasks/route.ts web/src/app/api/audio-tasks/route.ts web/src/app/api/ai/system/[channelId]/[...path]/route.ts
  git commit -m "feat: route practice tasks through open source providers"
  ```

## Task 4: 实现独立练习项目和小模块后端

**Files:**

- Create: `web/src/lib/server/practice-access-service.ts`
- Create: `web/src/lib/server/practice-access-service.test.ts`
- Create: `web/src/lib/server/practice-project-service.ts`
- Create: `web/src/lib/server/practice-project-service.test.ts`
- Create: `web/src/lib/server/practice-session-service.ts`
- Create: `web/src/lib/server/practice-session-service.test.ts`
- Create: `web/src/app/api/practice/projects/route.ts`
- Create: `web/src/app/api/practice/projects/[id]/route.ts`
- Create: `web/src/app/api/practice/sessions/route.ts`
- Create: `web/src/app/api/practice/sessions/[id]/route.ts`
- Create: `web/src/services/api/practice.ts`
- Create: `web/src/services/api/practice.test.ts`
- Modify: `web/src/lib/server/canvas-project-service.ts`
- Modify: `web/src/lib/server/drama-project-service.ts`

**Interfaces:**

- `POST /api/practice/projects`: `{ kind: "canvas" | "drama", title, source?: PracticeSource }`，服务端要求当前账号 active 且具备 active school membership，创建新的 practice project。
- `GET /api/practice/projects`: 只返回当前用户 practice 项目，按 kind/updatedAt 分页。
- `POST /api/practice/sessions`: `{ module, title, input, references?, clientRequestId }`，服务端选择 capability 和 practice default model，创建 session 后调度现有任务。
- `GET /api/practice/sessions/[id]`: 返回 session 和任务公开结果，不返回内部执行提示词、渠道 key 或 provider 详情。

- [ ] **Step 1: 先写账号、身份和幂等失败测试**

  覆盖：active teacher、active student、`teacher + school.manage` 均成功；无学校 membership、成员已停用、学校已停用、disabled 用户均 403；管理员账号不因全局 admin 角色绕过 school context；空白 Canvas/Drama 分别创建新 ID；从同一正式项目复制两次得到不同 practice ID；更新接口不能修改 profile；session 的 clientRequestId 重试返回同一 session。

- [ ] **Step 2: 运行失败测试**

  Run: `cd web; pnpm exec vitest run src/lib/server/practice-access-service.test.ts src/lib/server/practice-project-service.test.ts src/lib/server/practice-session-service.test.ts src/services/api/practice.test.ts`

  Expected: FAIL。

- [ ] **Step 3: 实现 practice access 和项目创建**

  `practice-access-service.ts` 复用现有 Session、用户状态和 `requireActiveSchoolContext`，允许 active teacher/student 使用；学校管理员通过 teacher membership 和 `school.manage` 自然通过，不单独增加角色分支。没有学校 context、成员或学校已停用时返回 403，未登录返回 401；全局 admin 角色不豁免。`practice-project-service.ts` 调用现有 Canvas/Drama create service；它是唯一可以设置 `open-source-practice` 的入口。普通 Canvas/Drama route 不接受该字段。创建过程把 `schoolId`、`PracticeSource` 与项目身份一起写入，不把源作品的私有会话或全量原始 JSON 直接复制。

- [ ] **Step 4: 实现小模块 session**

  `module -> capability` 固定映射：script/text、storyboard-image/image、storyboard-video/video、dubbing/audio、music/audio。session 创建调用 `generation-execution-policy` 和现有任务 service，传入 `surface: "practice"`、`executionProfile: "open-source-practice"`、`projectId: session.id`。公开结果只保存生成结果和用户原文；执行提示词仍只在任务内部使用。

- [ ] **Step 5: 实现 API 和客户端 service**

  Route Handler 做 schema 校验、Session、school context 和响应映射；`schoolId` 必须从服务端 membership 派生，不允许客户端传 `schoolId`、`channelId`、`provider`、`modelId`、`pointsCost` 或 execution profile。客户端 API 统一放在 `web/src/services/api/practice.ts`，错误沿用现有 `{ code, msg }` 解析。

- [ ] **Step 6: 运行测试、类型检查和提交**

  Run: `cd web; pnpm exec vitest run src/lib/server/practice-access-service.test.ts src/lib/server/practice-project-service.test.ts src/lib/server/practice-session-service.test.ts src/services/api/practice.test.ts; pnpm typecheck`

  ```bash
  git add web/src/lib/server/practice-access-service.ts web/src/lib/server/practice-access-service.test.ts web/src/lib/server/practice-project-service.ts web/src/lib/server/practice-project-service.test.ts web/src/lib/server/practice-session-service.ts web/src/lib/server/practice-session-service.test.ts web/src/app/api/practice web/src/services/api/practice.ts web/src/services/api/practice.test.ts web/src/lib/server/canvas-project-service.ts web/src/lib/server/drama-project-service.ts
  git commit -m "feat: add independent practice project APIs"
  ```

## Task 5: 生成并校验版本绑定的公开制作流程快照

**Files:**

- Create: `web/src/lib/public-work-process-snapshot.ts`
- Create: `web/src/lib/public-work-process-snapshot.test.ts`
- Create: `web/src/lib/server/public-work-process-service.ts`
- Create: `web/src/lib/server/public-work-process-service.test.ts`
- Modify: `web/src/lib/server/work-publication-service.ts`
- Modify: `web/src/lib/server/database/work-publication-repository.ts`
- Modify: `web/src/lib/server/database/work-governance-repository.ts`
- Modify: `web/src/lib/server/public-work-view.ts`
- Modify: `web/src/lib/server/database/repository-work-publication-mappers.ts`
- Create: `web/src/app/api/public/works/[slug]/process/route.ts`
- Create: `web/src/app/api/public/works/[slug]/copy-to-practice/route.ts`
- Create: `web/src/app/api/public/works/[slug]/process/route.test.ts`

**Interfaces:**

- `setPublishedWorkPullFilm(actorId, workId, enabled)`：只允许 admin + `content.manage`，只操作当前 published version 的 canvas/drama 作品。
- `getPublicWorkProcess(slug)`：只返回 active/public/approved/current version 且 `pull_film_enabled = true` 的快照。
- `POST /api/public/works/[slug]/copy-to-practice`：`{ kind?: "canvas" | "drama", clientRequestId }`，服务端从当前版本快照创建新 practice project，不接受任意 source/version。

- [ ] **Step 1: 先写 sanitizer 失败测试**

  给 Canvas 和 Drama 的真实项目 JSON 构造包含节点、角色、镜头、公开媒体以及私聊消息、执行提示词、storage key、临时任务 ID 的夹具，断言输出只包含公开结构和 `published_work_assets` 映射后的媒体 ID；media source、未发布版本、非公开版本和未授权版本返回不可用；快照经过 JSON round-trip 后不恢复被剥离字段。

- [ ] **Step 2: 运行失败测试**

  Run: `cd web; pnpm exec vitest run src/lib/public-work-process-snapshot.test.ts src/lib/server/public-work-process-service.test.ts src/app/api/public/works/[slug]/process/route.test.ts`

  Expected: FAIL。

- [ ] **Step 3: 实现 Canvas/Drama 安全投影**

  `public-work-process-snapshot.ts` 只接受 source JSON、sourceType、versionId 和已发布资产映射，返回白名单对象。Canvas 仅保留节点类型、位置、文本摘要、公开 assetId；Drama 仅保留项目/集/场景/镜头的标题、顺序、公开描述和公开 assetId。禁止把原始 project JSON 直接存入 `pull_film_snapshot`。

- [ ] **Step 4: 实现管理员开关和版本生命周期**

  `public-work-process-service.ts` 在同一事务中锁定 published work/version，重新读取源项目和已发布资产，生成快照后写入当前 published version。关闭、撤销、下架时清除对外可见状态；发布新版本不会继承旧快照。`isFeatured` 继续独立，不允许用 featured 状态推导 pull-film。

- [ ] **Step 5: 实现公开读取与复制入口**

  公开 process route 只返回快照和公开媒体引用，不返回用户私密字段。copy route 调用 Task 4 的 project service，并通过 `practice_copy_requests` 在同一 PostgreSQL 事务中完成幂等声明；上游查询到的作品若已换版/下架，返回 404 并不创建项目。

- [ ] **Step 6: 运行测试、类型检查和提交**

  Run: `cd web; pnpm exec vitest run src/lib/public-work-process-snapshot.test.ts src/lib/server/public-work-process-service.test.ts src/app/api/public/works/[slug]/process/route.test.ts src/lib/server/work-publication-service.test.ts src/lib/server/database/work-publication-repository.test.ts --no-file-parallelism; pnpm typecheck`

  ```bash
  git add web/src/lib/public-work-process-snapshot.ts web/src/lib/public-work-process-snapshot.test.ts web/src/lib/server/public-work-process-service.ts web/src/lib/server/public-work-process-service.test.ts web/src/lib/server/work-publication-service.ts web/src/lib/server/database/work-publication-repository.ts web/src/lib/server/database/work-governance-repository.ts web/src/lib/server/public-work-view.ts web/src/lib/server/database/repository-work-publication-mappers.ts web/src/app/api/public/works/[slug]/process web/src/app/api/public/works/[slug]/copy-to-practice web/src/app/api/public/works/[slug]/process/route.test.ts
  git commit -m "feat: publish version-bound pull-film processes"
  ```

## Task 6: 在现有后台接入 RunningHub 和练习资源策略

**Files:**

- Modify: `web/src/components/admin/channels/admin-channel-workspace.tsx`
- Modify: `web/src/components/admin/channels/admin-channel-workspace-model.ts`
- Modify: `web/src/components/admin/channels/admin-channel-onboarding-drawer.tsx`
- Modify: `web/src/components/admin/channels/admin-channel-detail-drawer.tsx`
- Modify: `web/src/components/admin/admin-logical-model-manager.tsx`
- Modify: `web/src/app/api/admin/models/route.ts`
- Modify: `web/src/app/api/admin/settings/route.ts`
- Modify: `web/src/lib/server/admin-channel-config.ts`
- Create: `web/src/components/admin/channels/runninghub-channel-fields.tsx`
- Create: `web/src/components/admin/channels/runninghub-channel-fields.test.tsx`

**Interfaces:**

- Existing `上游配置 → 渠道管理` 增加协议 RunningHub、渠道用途 segmented control、官方文档链接和按模型填写 create/query/template/result/status 的表单。
- Existing `逻辑模型` 增加“正式生产/无限练习”默认模型切换，绑定同一逻辑模型 pool；练习默认模型只能选择 open-source-practice/shared purpose 的绑定。
- `/api/admin/models` 对 RunningHub 不猜测目录；若未来要做目录同步，只能在 provider contract 增加官方已验证的专用 operation，并独立测试。当前一期提供手动模型 ID 和官方路径配置。

- [ ] **Step 1: 先写后台表单和权限失败测试**

  测试：只有 `upstream.manage` 能保存 RunningHub channel；保存 RunningHub 必须输入 base URL、协议、purpose、API key 和每个已启用模型的官方 task paths；练习默认模型不能选择 production-only channel；GET/PATCH 保存后立即回读 purpose、脱敏 key 和 practiceDefaultModels。

- [ ] **Step 2: 运行失败测试**

  Run: `cd web; pnpm exec vitest run src/components/admin/channels/runninghub-channel-fields.test.tsx src/app/api/admin/settings/route.test.ts src/lib/server/admin-channel-config.test.ts`

  Expected: FAIL。

- [ ] **Step 3: 实现现有渠道后台扩展**

  沿用现有渠道 Drawer、协议中心和逻辑模型 manager，不新增顶级“开源模型”菜单。渠道用途改变时显示明确影响：production 不可选练习；open-source-practice 不参与正式默认路由；shared 可两边使用。API key 继续由现有加密/脱敏流程处理，日志和表格不得显示密钥。

- [ ] **Step 4: 实现配置校验和保存回归**

  service 层校验 protocol/purpose/path 组合，并拒绝把练习模型绑定到 production default。settings PATCH 合并返回完整快照；测试覆盖保存后立即读取、刷新后读取和删除/清空 API key，不等待缓存自然过期。

- [ ] **Step 5: 运行测试、类型检查和提交**

  Run: `cd web; pnpm exec vitest run src/components/admin/channels/runninghub-channel-fields.test.tsx src/app/api/admin/settings/route.test.ts src/lib/server/admin-channel-config.test.ts src/lib/model-routing-config.test.ts; pnpm typecheck`

  ```bash
  git add web/src/components/admin/channels web/src/components/admin/admin-logical-model-manager.tsx web/src/app/api/admin/models/route.ts web/src/app/api/admin/settings/route.ts web/src/lib/server/admin-channel-config.ts
  git commit -m "feat: configure runninghub practice channels"
  ```

## Task 7: 在作品后台增加“设为拉片项目”管理动作

**Files:**

- Create: `web/src/app/api/admin/works/[id]/pull-film/route.ts`
- Create: `web/src/app/api/admin/works/[id]/pull-film/route.test.ts`
- Modify: `web/src/app/admin/works/components/admin-works-section.tsx`
- Modify: `web/src/app/admin/works/components/admin-works-section.test.tsx`
- Modify: `web/src/services/api/work-governance.ts`
- Modify: `web/src/lib/admin-permissions.ts`

**Interfaces:**

- `PATCH /api/admin/works/[id]/pull-film` body `{ enabled: boolean }`，要求当前 admin session + `content.manage`。
- `setAdminWorkPullFilm(id, enabled)` 客户端 API 返回 `hasProcess`、`processVersionId`、`updatedAt`。

- [ ] **Step 1: 先写 API/UI 失败测试**

  断言：普通用户、学校管理员、teacher/student 无权；media 作品和未审核作品被拒绝；canvas/drama 当前公开版本成功生成快照；关闭后 process/copy 入口消失；featured 与 pull-film 可分别开关；发布新版本后旧标记不继承。

- [ ] **Step 2: 运行失败测试**

  Run: `cd web; pnpm exec vitest run src/app/api/admin/works/[id]/pull-film/route.test.ts src/app/admin/works/components/admin-works-section.test.tsx`

  Expected: FAIL。

- [ ] **Step 3: 实现 route 和后台操作**

  Route 只映射 service 错误和 `{ code, data, msg }`，写成功/失败审计但不记录提示词、快照全文、媒体 URL 或密钥。作品详情 Drawer 增加“拉片项目”状态、启用/关闭按钮和失败原因；列表可用浅色语义标签筛选，不新增全局拉片菜单。

- [ ] **Step 4: 运行测试、类型检查和提交**

  Run: `cd web; pnpm exec vitest run src/app/api/admin/works/[id]/pull-film/route.test.ts src/app/admin/works/components/admin-works-section.test.tsx src/services/api/work-governance.test.ts; pnpm typecheck`

  ```bash
  git add web/src/app/api/admin/works/[id]/pull-film web/src/app/admin/works/components/admin-works-section.tsx web/src/app/admin/works/components/admin-works-section.test.tsx web/src/services/api/work-governance.ts web/src/lib/admin-permissions.ts
  git commit -m "feat: add admin pull-film controls"
  ```

## Task 8: 在灵感发现作品预览中加入制作流程和复制入口

**Files:**

- Modify: `web/src/lib/server/work-governance-service.ts`
- Modify: `web/src/lib/server/public-work-view.ts`
- Modify: `web/src/services/api/work-publications.ts`
- Modify: `web/src/app/api/public/gallery/route.ts`
- Modify: `web/src/components/works/public-work-gallery-card.tsx`
- Modify: `web/src/components/works/public-work-preview-modal.tsx`
- Create: `web/src/components/works/public-work-process-view.tsx`
- Create: `web/src/components/works/public-work-process-view.test.tsx`
- Modify: `web/src/app/gallery/gallery-view.tsx`
- Modify: `web/src/app/home/home-gallery.tsx`
- Modify: `web/src/app/(user)/create/components/create-inspiration-gallery.tsx`

**Interfaces:**

- Gallery item/detail 增加 `hasProcess`/`processVersionId`，不默认加载大快照。
- 作品预览内部新增 segmented/tab：`成片` 与 `制作流程`。只有 `hasProcess` 且 sourceType 为 canvas/drama 时渲染“制作流程”；两种视图都显示“复制到练习”。
- `public-work-process-view.tsx` 只读；Canvas 显示节点/资产流程摘要，Drama 显示剧本审核、分镜、镜头生成、配音/合成等已有公开状态，不显示私有提示词或内部任务日志。

- [ ] **Step 1: 先写组件失败测试**

  断言：首屏仍是成片；没有流程资格时不渲染制作流程 tab/copy；有资格时两个 tab 均可用，流程内容只读；点击复制只发一次 `clientRequestId`，成功后进入新练习项目；移动 390/430px 不横向溢出，制作流程长内容在内部滚动容器中可读。

- [ ] **Step 2: 运行失败测试**

  Run: `cd web; pnpm exec vitest run src/components/works/public-work-process-view.test.tsx src/components/works/public-work-preview-modal.test.tsx src/app/gallery/gallery-view.test.tsx`

  Expected: FAIL。

- [ ] **Step 3: 扩展 gallery DTO 和预览 modal**

  `listPublicGallery` 只 join 当前 published version 的 `pull_film_enabled` 布尔字段；不把 `pull_film_snapshot` 注入瀑布流列表。作品详情打开后按需请求 `/api/public/works/[slug]/process`。复用现有媒体浏览器和预览容器，不新增拉片库入口。

- [ ] **Step 4: 实现流程视图和复制操作**

  “制作流程”只读，所有按钮使用现有 `lucide-react` 图标和中文 tooltip。复制使用 `publicWorkPublicationsApi.copyToPractice`，失败保留当前 modal 和错误信息，不创建空项目；成功跳转 `/practice?projectId=...`。正式作品原数据不被修改。

- [ ] **Step 5: 运行测试、类型检查和提交**

  Run: `cd web; pnpm exec vitest run src/components/works/public-work-process-view.test.tsx src/components/works/public-work-preview-modal.test.tsx src/app/gallery/gallery-view.test.tsx src/app/home/home-gallery.test.tsx src/app/'(user)'/create/components/create-inspiration-gallery.test.tsx; pnpm typecheck`

  ```bash
  git add web/src/lib/server/work-governance-service.ts web/src/lib/server/public-work-view.ts web/src/services/api/work-publications.ts web/src/app/api/public/gallery/route.ts web/src/components/works/public-work-gallery-card.tsx web/src/components/works/public-work-preview-modal.tsx web/src/components/works/public-work-process-view.tsx web/src/components/works/public-work-process-view.test.tsx web/src/app/gallery/gallery-view.tsx web/src/app/home/home-gallery.tsx web/src/app/'(user)'/create/components/create-inspiration-gallery.tsx
  git commit -m "feat: show pull-film process in inspiration"
  ```

## Task 9: 完成无限练习首页、五类小模块和 Canvas/短剧复用工作区

**Files:**

- Create: `web/src/app/(user)/practice/page.tsx`
- Create: `web/src/app/(user)/practice/[module]/page.tsx`
- Create: `web/src/app/(user)/practice/components/practice-home.tsx`
- Create: `web/src/app/(user)/practice/components/practice-home.test.tsx`
- Create: `web/src/app/(user)/practice/components/practice-module-workbench.tsx`
- Create: `web/src/app/(user)/practice/components/practice-module-workbench.test.tsx`
- Modify: `web/src/app/(user)/canvas/page.tsx`
- Modify: `web/src/app/(user)/drama/page.tsx`
- Modify: `web/src/constant/navigation-tools.ts`
- Modify: `web/src/constant/navigation-tools.test.ts`

**Interfaces:**

- `/practice` 展示两个大卡片 Canvas/短剧和小卡片 script/storyboard-image/storyboard-video/dubbing/music；卡片只描述能力和最近练习，不显示 provider/model。
- Canvas/短剧卡片调用 Task 4 project API 后直接进入现有 Canvas/Drama 工作区组件；不把两个编辑器重写进 practice 目录，只通过稳定 `projectId` 和 execution profile 复用。
- `/practice/[module]` 使用单一模块 workbench，输入、引用、生成状态、历史结果都来自 server API；不能把生成日志保存在 localStorage/IndexedDB。

- [ ] **Step 1: 先写页面和路由失败测试**

  断言 active teacher、active student 和学校管理员（teacher + school.manage）可见“项目 → 无限练习”入口；无学校 membership、成员/学校已停用、未登录或 disabled 用户不显示入口，直达页面/API 返回 403/404；首页有两个大卡片和五个小卡片；点击 Canvas/短剧创建空白独立项目；点击小卡片进入对应 capability；页面不显示 RunningHub、积分扣除或“切换正式项目”按钮。

- [ ] **Step 2: 运行失败测试**

  Run: `cd web; pnpm exec vitest run src/app/'(user)'/practice/components/practice-home.test.tsx src/app/'(user)'/practice/components/practice-module-workbench.test.tsx src/constant/navigation-tools.test.ts`

  Expected: FAIL。

- [ ] **Step 3: 实现 practice home 和导航**

  在现有“项目”导航组加入 `/practice`，与“画布”“短剧”并列；只对 active school context 的 teacher/student/学校管理员显示，不新增资产菜单，也不把它放进“学校”分组。大卡片使用现有 Canvas/Drama 图标和项目列表；小卡片使用能力图标。响应式约束保证 390px/430px 首屏能看到下一层卡片，卡片不嵌套卡片，不引入营销式 hero。

- [ ] **Step 4: 复用 Canvas/短剧组件**

  `practice-home` 创建 project 后导航到 `/canvas/[id]` 或 `/drama/[id]`；现有详情页面根据项目读取到 `executionProfile` 显示“无限练习”标识和练习资源提示，但编辑、保存、素材引用、生成操作仍走原组件。正式项目不会出现练习入口，练习项目不会被正式列表当成 production 项目。

- [ ] **Step 5: 实现五类小模块 workbench**

  script 使用文本输入和可编辑结果；storyboard-image/storyboard-video 复用图片/视频结果卡；dubbing/music 复用音频结果卡。提交时只传 module、用户原文、公开引用、clientRequestId；服务端规划器和模型选择继续内部执行，公开历史只显示实际结果元数据。错误、重试和刷新恢复沿用现有 generation task 语义。

- [ ] **Step 6: 运行组件测试、浏览器烟测和类型检查**

  Run: `cd web; pnpm exec vitest run src/app/'(user)'/practice/components/practice-home.test.tsx src/app/'(user)'/practice/components/practice-module-workbench.test.tsx src/constant/navigation-tools.test.ts; pnpm typecheck`

  ```bash
  git add web/src/app/'(user)'/practice web/src/app/'(user)'/canvas/page.tsx web/src/app/'(user)'/drama/page.tsx web/src/constant/navigation-tools.ts web/src/constant/navigation-tools.test.ts
  git commit -m "feat: add infinite practice workspaces"
  ```

## Task 10: 增加超级管理员的角色功能总览与用户端预览

**Files:**

- Create: `web/src/app/admin/role-overview/components/admin-role-overview-section.tsx`
- Create: `web/src/app/admin/role-overview/components/admin-role-overview-section.test.tsx`
- Modify: `web/src/components/admin/admin-sections.ts`
- Modify: `web/src/components/admin/admin-section-nav.tsx`
- Modify: `web/src/components/admin/admin-dashboard.tsx`
- Modify: `web/src/components/admin/admin-section-preload.test.ts`
- Modify: `web/src/components/admin/admin-sections.test.ts`
- Modify: `web/src/components/admin/admin-section-nav.test.tsx`
- Modify: `web/src/constant/navigation-tools.ts`
- Modify: `web/src/constant/navigation-tools.test.ts`

**Interfaces:**

- 新增后台分区 `roleOverview`，归入“系统管理”或“帮助与支持”中的独立“角色功能”入口；全权限平台管理员默认可见，其他管理员按明确的 `system.manage` 访问规则处理。
- 角色总览提供“教师端、学生端、学校管理员端”三个视图，使用共享导航元数据展示分组、路由、功能说明、访问条件和被拒绝原因。教师端、学生端都显示“项目 → 画布、短剧、无限练习”；学校管理员额外显示学校管理、教学和校内管理入口。
- 角色总览可打开只读的入口预览面板，但不创建虚拟用户、学校、项目或练习 session，不读取任意学校业务数据；面板中的生成、保存、提交、删除等操作全部禁用并显示“角色预览”状态。
- 管理后台本身的导航仍按当前管理员权限显示；全权限平台管理员必须看到全部后台分区，不因当前用户端没有 school context 而隐藏学校、课程、商单、渠道或内容入口。

- [ ] **Step 1: 先写后台角色元数据和权限失败测试**

  覆盖：教师/学生/学校管理员视图包含正确的用户端入口；普通 C 端视图不包含无限练习；学校管理员继承 teacher 功能并增加校内管理；全权限管理员能解析全部 `ADMIN_SECTION_KEYS` 和 `roleOverview`；缺少 `system.manage` 的管理员不能访问角色总览；预览状态不产生任何写操作。

- [ ] **Step 2: 实现共享导航定义和后台只读分区**

  在 `navigation-tools.ts` 提取可供真实导航和角色预览共同使用的标签、分组、路由和访问条件元数据。真实用户端继续使用 `schoolNavigationTools(context)`，其 `/practice` 入口只在 active school context 下加入“项目”组；角色总览只使用纯元数据，不把伪造的 SchoolContext 传给真实鉴权函数。

  在 `admin-sections.ts` 注册 `roleOverview`，在 `admin-section-nav.tsx` 增加分区标题和图标，在 `admin-dashboard.tsx` 通过现有按意图预加载机制加载分区组件。角色总览展示入口清单和只读预览，不复制真实业务页面，也不让管理员通过预览调用练习 API。

- [ ] **Step 3: 运行后台定向测试和类型检查**

  Run: `cd web; pnpm exec vitest run src/components/admin/admin-sections.test.ts src/components/admin/admin-section-nav.test.tsx src/components/admin/admin-section-preload.test.ts src/app/admin/role-overview/components/admin-role-overview-section.test.tsx src/constant/navigation-tools.test.ts; pnpm typecheck`

- [ ] **Step 4: 提交**

  ```bash
  git add web/src/app/admin/role-overview web/src/components/admin/admin-sections.ts web/src/components/admin/admin-section-nav.tsx web/src/components/admin/admin-dashboard.tsx web/src/components/admin/admin-section-preload.test.ts web/src/components/admin/admin-sections.test.ts web/src/components/admin/admin-section-nav.test.tsx web/src/constant/navigation-tools.ts web/src/constant/navigation-tools.test.ts
  git commit -m "feat: add admin role feature overview"
  ```

## Task 11: 收口 API、权限、数据库文档和全量验收

**Files:**

- Create: `web/e2e/infinite-practice.spec.ts`
- Modify: `web/e2e/all-pages.spec.ts`
- Modify: `web/e2e/support.ts`
- Modify: `web/playwright.config.ts`
- Modify: `docs/content/docs/backend/backend-database.mdx`
- Modify: `docs/progress/page-api-evidence.md`
- Modify: `VOZEB-PRO-接口索引.md`
- Modify: `web/src/app/api/practice/projects/route.test.ts`
- Modify: `web/src/app/api/practice/sessions/route.test.ts`
- Modify: `web/src/app/api/public/works/[slug]/copy-to-practice/route.test.ts`

**Interfaces:**

- Produces browser evidence for school-member practice access, admin RunningHub/pull-film settings, admin role feature overview, inspiration process view, copy idempotency and production regression.
- Documents every new API, permission, execution profile, provider purpose and database field.

- [ ] **Step 1: API/安全回归**

  定向运行 practice/public/admin work route tests，覆盖 school membership/学校隔离、session ownership、无学校 membership 用户拒绝、公开版本复核、不可变 profile、不能从 body 选择 provider/model、快照字段脱敏、copy retry 不重复创建；角色功能总览只读且不创建业务数据。

  Run: `cd web; pnpm exec vitest run src/app/api/practice src/app/api/public/works src/app/api/admin/works/[id]/pull-film src/app/api/admin/settings src/lib/server/practice src/lib/server/public-work-process-service.test.ts --no-file-parallelism`

- [ ] **Step 2: 真实 PostgreSQL 回归**

  在专用 `DATABASE_URL` 上运行：

  ```powershell
  cd web
  $env:VOZEB_PRO_RUN_POSTGRES_INTEGRATION="1"
  pnpm exec vitest run src/lib/server/database/practice-repository.test.ts src/lib/server/database/work-publication-repository.test.ts src/lib/server/database/repositories.test.ts --no-file-parallelism
  ```

  Expected: 不允许全部 skip；验证 setting round-trip、版本快照、copy request 唯一约束和定向查询。

- [ ] **Step 3: Playwright 浏览器闭环**

  `infinite-practice.spec.ts` 使用真实登录 context：

  1. admin 在渠道后台创建一个手动 RunningHub open-source-practice channel，保存模型路径并配置练习默认模型；不连接真实上游，使用已有 fixture provider 验证异步 submit/query。
  2. admin 在作品后台将一个已公开 Canvas/Drama 作品设为拉片项目，确认 featured 可独立切换。
  3. 全权限 admin 打开“角色功能总览”，切换教师、学生和学校管理员视图，确认项目下并列显示画布、短剧、无限练习，且预览操作为只读。
  4. 学校 teacher、student 和学校管理员在 `/practice` 创建空白 Canvas、短剧和五类 module session；无学校 membership 的普通 C 端用户没有入口且直达返回 403/404。
  5. 学校成员从灵感发现打开制作流程，切换成片/流程并复制到练习；重复点击/刷新只得到一个 copy request 结果；不同学校不能读取对方项目。
  6. 学校成员刷新后恢复 practice project/session；正式项目仍使用 production channel，积分行为和原 C 端 `/create`、Canvas、Drama 不回归。
  7. 关闭拉片或下架作品后，公共 process/copy 入口消失。

  同时运行 desktop、390px、430px，使用正常语义点击，不用 `force` 或固定等待；读取 `getBoundingClientRect()` 验证 card、modal、内部流程滚动区和底部操作区不横向溢出。

- [ ] **Step 4: 更新文档和接口索引**

  `backend-database.mdx` 记录新增列/表、索引、快照白名单和事务边界；`page-api-evidence.md` 记录 `/practice`、灵感发现制作流程、admin 渠道/作品详情的页面到 API/service/repository 证据链；`VOZEB-PRO-接口索引.md` 记录 route、方法、权限和公开字段范围。

- [ ] **Step 5: 执行发布门禁和严格文本检查**

  ```powershell
  $strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
  $changed = git diff --name-only --diff-filter=ACMR | Where-Object { $_ -match '\.(ts|tsx|md|mdx|json|yaml|yml)$' }
  foreach ($file in $changed) { [void]$strictUtf8.GetString([System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $file))) }
  rg -n -P "\x{FFFD}|锟斤拷" $changed
  git diff --check
  cd web
  pnpm check:release
  pnpm e2e
  ```

  Expected: 无乱码、无 whitespace 错误、lint/typecheck/format/Vitest/build/Playwright 全部通过；浏览器测试使用动态空闲端口，不复用未知本机服务。

- [ ] **Step 6: 最终验收清单**

  - 平台管理员能在既有渠道后台配置 RunningHub，明确区分正式生产和无限练习模型池。
  - 平台管理员能在作品详情把公开 Canvas/短剧版本设为拉片项目，且 featured 状态独立。
  - 灵感发现作品预览能查看只读制作流程，并从成片或流程复制到新的练习身份。
  - 学校内 active teacher/student/学校管理员能创建独立 Canvas/短剧练习项目和五类小模块；普通 C 端用户无入口且不能直达使用；正式项目不能切换为练习，Canvas/短剧不能互转。
  - 全权限平台管理员能在后台角色功能总览中看到教师、学生和学校管理员的完整前端功能入口，预览不产生业务数据。
  - 练习任务不扣现有积分，但仍受渠道、队列、并发、成本和媒体保护；RunningHub 任务可提交、查询、恢复和失败处理。
  - 下架、撤销、换版本或关闭拉片后，公共制作流程和复制入口不再可用。
  - 公开流程不泄露剧本私有版本、内部提示词、私聊、API key、storage key、内部任务 ID 或未发布素材。
  - 现有 `/create`、Canvas、短剧、作品发布和充值流程继续通过原生产路由和默认模型工作。

- [ ] **Step 7: 提交**

  ```bash
  git add web/e2e/infinite-practice.spec.ts web/e2e/all-pages.spec.ts web/e2e/support.ts web/playwright.config.ts docs/content/docs/backend/backend-database.mdx docs/progress/page-api-evidence.md VOZEB-PRO-接口索引.md web/src/app/api/practice web/src/app/api/public/works web/src/app/api/admin/works/[id]/pull-film web/src/app/api/admin/settings
  git commit -m "test: cover infinite practice and pull-film workflows"
  ```

## 完成定义

只有以下条件同时满足，才能声明该模块完成：

1. Task 1-11 的定向测试和 `pnpm typecheck` 全部通过，且每个任务有独立提交。
2. RunningHub 只使用已验证的官方异步/上传契约和管理员手动模型路径，不存在猜测的目录或任务 API。
3. 练习与生产模型路由、项目身份和积分行为有自动化隔离证据。
4. 拉片快照只绑定当前公开版本，管理员权限、下架/换版生命周期和 copy 幂等均有 PostgreSQL 测试。
5. 浏览器在桌面、390px、430px 完成管理员配置、灵感发现流程查看、复制和练习工作区闭环，无横向溢出或无障碍状态回归。
6. `pnpm check:release`、全量 typecheck、Vitest、production build 和 Playwright 通过，文档与接口索引和实际实现一致。
