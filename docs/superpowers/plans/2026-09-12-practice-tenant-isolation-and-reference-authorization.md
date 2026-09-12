# TENANT-01/TENANT-02 无限练习租户隔离与素材授权实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 每个任务必须先写失败测试，再写最小实现；不要回滚工作区已有的其他任务修改。

**Goal:** 让无限练习所有新数据从当前 active school session 推导 `school_id + owner_user_id`，所有后续读写同时校验学校和个人，并在创建练习 Session 前完成普通素材授权与媒体类型校验；现有无限练习存量统一清理，不迁移、不恢复。

**Architecture:** 新增不可变的 `PracticeTenantScope { schoolId, ownerUserId }`，由服务端 `requireActiveSchoolContext()` 生成并沿练习项目、Session、剧本、任务、日志和媒体注册链路传递。正式 production 项目继续只使用原有 `user_id`/owner 语义；practice 行通过 `execution_profile = 'open-source-practice'` 与 `school_id` 约束区分。首次部署先在事务中清理旧 practice 存量，再补 practice 专用学校字段、索引和检查约束。普通 `asset` 先通过媒体注册/课程资料授权解析，再按输入角色校验 `image`/`audio` 类型，任何失败都在创建 Session 前返回，不产生失败 Session、任务、日志、积分或 IP 使用记录。

**Tech Stack:** Next.js Route Handler、TypeScript、PostgreSQL Repository、既有 JSON file fallback、Vitest、Playwright、参数化 SQL、现有 local media registry / school course authorization / IP library service。

## Global Constraints

- 不保留当前环境和测试环境的无限练习历史数据；只清理 execution profile 为 `open-source-practice` 或明确 practice 关联的数据。
- 普通正式创作项目、个人素材、作品、课程和学校数据不能被删除或改写。
- `school_id`、`owner_user_id` 只能由服务端当前 Session 和 active membership 推导；客户端提交的同名字段必须忽略或拒绝。
- 所有 practice 读写同时使用 `school_id = 当前学校 AND owner_user_id = 当前用户`；ID 猜测、幂等查询、恢复、重试、删除和任务结果查询都不能只按用户或只按 ID。
- 学校必须 active，membership 必须 active，角色必须为 `teacher` 或 `student`。
- `school_id` 和 `owner_user_id` 创建后不可修改；转校不迁移旧数据，离开学校后旧数据不可访问，加入新学校后只显示新学校数据。
- 练习普通素材引用必须在 Session 创建前校验记录存在、用户/学校有权使用、媒体类型匹配；不能用任意完整 `storageKey` 伪造授权来源。
- `referenceImage`、`sceneImage`、`firstFrameImage`、`lastFrameImage`、`image` 和角色/道具图片槽位只能引用图片；`audio` 只能引用音频。
- IP 引用继续走现有学校授权；IP 使用记录只能在 Session/项目成功创建后写入。
- PostgreSQL Schema 变更必须使用有序、幂等升级；已有表补列先 `ADD COLUMN IF NOT EXISTS`，不得重建表或删除正式数据。
- 保留工作区已有修改；只修改本计划涉及文件，不使用 `git restore .` 或覆盖其他任务。
- 中文源码、脚本、文档保存为 UTF-8；测试使用仓库现有 `--no-file-parallelism` 规则。

---

### Task 1: 建立租户 Scope 和清理边界契约

**Files:**
- Create: `web/src/lib/server/practice-tenant-scope.ts`
- Create: `web/src/lib/server/practice-tenant-scope.test.ts`
- Modify: `web/src/lib/server/practice-access-service.ts`
- Modify: `web/src/lib/server/practice-access-service.test.ts`
- Modify: `web/src/lib/server/generation-task-types.ts`

**Interfaces:**
- `PracticeTenantScope = { schoolId: string; ownerUserId: string }`。
- `requirePracticeTenant(actor): Promise<PracticeTenantScope>`：调用 `requireActiveSchoolContext(actor.id)`，拒绝非 active school、非 active membership、非 teacher/student。
- `assertPracticeTenant(scope, value)`：值缺失或学校/用户不一致时抛出 403/404 领域错误。
- `GenerationTaskContext` 新增可选 `schoolId?: string`；practice task 必须由可信 dispatch 写入。

- [ ] **Step 1: 写失败测试**

测试 active teacher/student 返回 `{ schoolId, ownerUserId }`；disabled school、disabled membership、admin-only 和其他角色均拒绝；客户端传入的 `schoolId` 不参与推导。

- [ ] **Step 2: 运行失败测试**

```powershell
pnpm exec vitest run --no-file-parallelism src/lib/server/practice-tenant-scope.test.ts src/lib/server/practice-access-service.test.ts
```

Expected: 新增测试因模块/函数不存在失败。

- [ ] **Step 3: 实现最小 Scope helper**

`requirePracticeTenant()` 只读取 `requireActiveSchoolContext()` 的服务端结果，返回 `school.id` 和 actor id；不读取 request body 的学校字段。

- [ ] **Step 4: 运行通过测试**

```powershell
pnpm exec vitest run --no-file-parallelism src/lib/server/practice-tenant-scope.test.ts src/lib/server/practice-access-service.test.ts
```

Expected: PASS。

---

### Task 2: 增加数据库字段、索引、不可变约束和安全升级顺序

**Files:**
- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `web/src/lib/server/database/schema-ip-library.ts`（只在清理/使用记录查询需要新增索引时修改）
- Modify: `web/src/lib/server/database/postgres.ts`
- Modify: `web/src/lib/server/database/postgres.test.ts`
- Modify: `docs/backend-database.md`
- Create: `web/src/lib/server/practice-tenant-cleanup.ts`
- Create: `web/src/lib/server/practice-tenant-cleanup.test.ts`

**Interfaces:**
- 清理入口：`cleanupPracticeData({ executor?, mediaDeletion? }): Promise<PracticeCleanupReport>`。
- `PracticeCleanupReport` 至少包含清理的 canvas、drama、session、script、task、log、IP usage、media 数量；不接受任意表名或任意删除条件。
- 新增字段：`school_id` 到 `canvas_projects`、`drama_projects`、`practice_sessions`、`practice_copy_requests`、`practice_script_*`、`generation_tasks`、`generation_logs`、`creative_conversations`（practice conversation）、`local_media_assets`（practice media）。正式表中的 `school_id` 可为空，practice 行必须非空。

- [ ] **Step 1: 写清理和 DDL 失败测试**

覆盖：

1. cleanup 只选择 `execution_profile = 'open-source-practice'` 的 Canvas/Drama、所有 practice_sessions/script 表、practice generation tasks；
2. generation logs 只按 practice task id、practice execution profile 或明确 practice source 关联；
3. 删除 generation_log_assets 通过日志级联；
4. IP 使用只清理 `target_type = 'practice'`；
5. media 只清理 practice task/project/source 关联且没有课程、作品、正式项目、library asset 或其他 generation log 引用的注册记录；
6. DDL 先 add column/cleanup，再建立 check/index，不会删除 production 行。

- [ ] **Step 2: 运行失败测试**

```powershell
pnpm exec vitest run --no-file-parallelism src/lib/server/practice-tenant-cleanup.test.ts src/lib/server/database/postgres.test.ts
```

Expected: 新增函数/DDL 断言失败。

- [ ] **Step 3: 实现幂等清理和 Schema 升级**

Schema 升级顺序固定为：

```sql
ALTER TABLE ... ADD COLUMN IF NOT EXISTS school_id text;
-- 事务中只删除 practice 存量；正式 production 行不参与
DELETE ... WHERE execution_profile = 'open-source-practice';
-- practice-only 表清理全部旧行
ALTER TABLE ... ADD CONSTRAINT ... CHECK (...);
CREATE INDEX IF NOT EXISTS ... (school_id, user_id, updated_at DESC);
```

对 `canvas_projects` / `drama_projects` 使用条件约束：production 允许 `school_id IS NULL`，practice 必须 `school_id IS NOT NULL`；`practice_sessions`、script tables、copy requests 等全是 practice 数据，清理后设置 `school_id NOT NULL`。不删除 production Canvas/Drama、generation、media、library、course 或 work publication 数据。

清理 SQL 使用 CTE 临时集合保存 practice project/task/log/media IDs，先删除关联表，再删主表；媒体删除前执行现有引用扫描，只有无其他业务引用的 key 才交给 local media/object storage 删除服务。

file fallback 清理 `canvas-projects.json`、`drama-projects.json`、`practice-sessions.json`、`generation-tasks.json`、`generation-logs.json`、`local-media-assets.json` 和 script repository 的 JSON 状态，只删除 execution profile/source 明确是 practice 的记录；不得清空整个文件。

- [ ] **Step 4: 更新文档并运行测试**

```powershell
pnpm exec vitest run --no-file-parallelism src/lib/server/practice-tenant-cleanup.test.ts src/lib/server/database/postgres.test.ts
pnpm exec prettier --check src/lib/server/practice-tenant-cleanup.ts src/lib/server/database/schema.ts docs/backend-database.md
```

Expected: PASS，并在 `docs/backend-database.md` 记录字段、索引、cleanup 顺序和正式数据保护边界。

---

### Task 3: Canvas / Drama 练习项目从创建到读写绑定学校

**Files:**
- Modify: `web/src/lib/server/practice-project-service.ts`
- Modify: `web/src/lib/server/canvas-project-service.ts`
- Modify: `web/src/lib/server/canvas-project-store.ts`
- Modify: `web/src/lib/server/drama-project-service.ts`
- Modify: `web/src/lib/server/drama-project-store.ts`
- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `web/src/lib/server/canvas-project-service.test.ts`
- Modify: `web/src/lib/server/drama-project-service.test.ts`
- Create/Modify: tenant scope tests for both stores

**Interfaces:**
- `CanvasProjectIdentityInput` / `DramaProjectIdentityInput` 增加必需的 practice `schoolId`（production identity 继续不要求）。
- `list/get/update/deleteCanvasProjectForTenant(scope, id)` 和 Drama 对应函数；底层 SQL/file predicate 必须同时检查 `user_id`、`school_id`、`execution_profile`。
- 正式生产调用保持现有 user-only 契约，但读到 practice 项目时必须要求并验证 scope，不能将 practice 项目作为 production 项目返回。

- [ ] **Step 1: 写跨校失败测试**

创建学校 A 用户 A 的 Canvas/Drama practice 项目；切换到学校 B 后：列表为空、详情 404、更新/删除 404；同一用户回到学校 A 后恢复可见。创建输入内伪造 `schoolId: school-b` 必须被忽略并写入当前 school A。production 项目仍可按既有 user-only 逻辑访问。

- [ ] **Step 2: 运行失败测试**

```powershell
pnpm exec vitest run --no-file-parallelism src/lib/server/canvas-project-service.test.ts src/lib/server/drama-project-service.test.ts
```

Expected: store 尚未按 school_id 过滤，新增测试失败。

- [ ] **Step 3: 实现 scope-aware store/service**

Practice create 从 `requirePracticeTenant(actor)` 取得 scope，传给 `createCanvasProject`/`createDramaProject`；`school_id` 和 owner 只在 insert 时写入。所有 practice list/get/update/delete SQL 使用：

```sql
WHERE school_id = $1 AND user_id = $2 AND execution_profile = 'open-source-practice'
```

file fallback 使用同一 predicate；保存/patch 禁止修改 `schoolId`、`ownerUserId`、`executionProfile`。Drama versions、Canvas recovery/mutation、project copy 也通过同一 scope。

- [ ] **Step 4: 运行项目测试**

```powershell
pnpm exec vitest run --no-file-parallelism src/lib/server/canvas-project-service.test.ts src/lib/server/drama-project-service.test.ts
pnpm exec eslint src/lib/server/canvas-project-service.ts src/lib/server/canvas-project-store.ts src/lib/server/drama-project-service.ts src/lib/server/drama-project-store.ts --quiet
```

Expected: PASS。

---

### Task 4: Practice Session 和幂等/重试/结果链路双重过滤

**Files:**
- Modify: `web/src/lib/server/practice-session-service.ts`
- Modify: `web/src/lib/server/database/practice-repository.ts`
- Modify: `web/src/lib/server/database/repository-types.ts`
- Modify: `web/src/app/api/practice/sessions/route.ts`
- Modify: `web/src/app/api/practice/sessions/[id]/route.ts`
- Modify: `web/src/lib/server/practice-session-service.test.ts`
- Modify: `web/src/app/api/practice/sessions/route.test.ts`
- Modify: `web/src/app/api/practice/sessions/[id]/route.test.ts`

**Interfaces:**
- Practice store methods统一接收 `PracticeTenantScope`，不再只接 `userId`：`getByRequest(scope, clientRequestId)`、`get(scope,id)`、`create(scope,input)`、`claimDispatch(scope,id)`、`resetForRetry(scope,id)`、`update(scope,id,patch)`、`delete(scope,id)`、`list(scope,input)`。
- `PracticeSessionRecord` 新增 `schoolId`，且 `ownerUserId` 继续由 `userId` 表示；public response 不向客户端开放可写租户字段。

- [ ] **Step 1: 写失败测试**

覆盖：

1. 同一用户在学校 A 创建 Session 后，学校 B list/get/delete/retry/getByRequest 都返回空/404；
2. 客户端提交 `schoolId`、`ownerUserId` 不改变持久化值；
3. 重试和状态恢复仍要求当前 scope；
4. projectId 只能指向同一学校、同一用户、practice profile 的项目；
5. 创建失败时没有 Session 记录。

- [ ] **Step 2: 运行失败测试**

```powershell
pnpm exec vitest run --no-file-parallelism src/lib/server/practice-session-service.test.ts src/app/api/practice/sessions/route.test.ts src/app/api/practice/sessions/[id]/route.test.ts
```

Expected: 现有 user-only store 断言失败。

- [ ] **Step 3: 实现 scope-aware Session store 和服务**

POST 先 `requirePracticeTenant(user)`，再从 scope 设置 `schoolId/ownerUserId`；创建前不信任 body 同名字段。PostgreSQL 所有查询改为 `WHERE school_id = $1 AND user_id = $2 ...`，file fallback 同时比较两个字段。重试、删除、详情和幂等查询全部复用 scope。

- [ ] **Step 4: 连接可信任务上下文**

`dispatchPracticeTask` 将 `schoolId` 写入 GenerationTaskContext；`trustedPracticeTaskHeaders` 的签名内容从 `userId + clientRequestId` 扩展为 `schoolId + userId + clientRequestId`，防止切校后复用旧请求。恢复任务必须验证保存的 `schoolId` 与当前 Session scope 一致。

- [ ] **Step 5: 运行测试**

```powershell
pnpm exec vitest run --no-file-parallelism src/lib/server/practice-session-service.test.ts src/app/api/practice/sessions/route.test.ts src/app/api/practice/sessions/[id]/route.test.ts
```

Expected: PASS。

---

### Task 5: Script practice 全链路绑定学校

**Files:**
- Modify: `web/src/lib/server/database/script-practice-repository.ts`
- Modify: `web/src/lib/server/script-practice-service.ts`
- Modify: `web/src/lib/server/script-practice-stage-service.ts`
- Modify: `web/src/lib/server/script-practice-agent-service.ts`
- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `web/src/app/api/practice/scripts/route.ts`
- Modify: `web/src/app/api/practice/scripts/[id]/route.ts`
- Modify: all `web/src/app/api/practice/scripts/[id]/.../route.ts`
- Modify: `web/src/lib/server/script-practice-*.test.ts`

**Interfaces:**
- Script repository methods接收 `PracticeTenantScope`；project/version/entity/stage/agent operation records新增 `schoolId`。
- `createScriptProjectForPractice(scope,input)`、`getScriptProjectDetail(scope,id)`、`update/delete/list/import/version/stage/agent` 均只按 `school_id + owner_user_id + project_id` 工作。

- [ ] **Step 1: 写失败测试**

学校 A 的剧本项目、版本、实体、阶段、Agent 操作在学校 B 全部不可读写；同用户转回 A 可访问；伪造 body schoolId 不生效；删除/导出/版本恢复/Agent apply 也必须返回 404/403。

- [ ] **Step 2: 运行失败测试**

```powershell
pnpm exec vitest run --no-file-parallelism src/lib/server/script-practice-service.test.ts src/lib/server/script-practice-service.detail.test.ts src/lib/server/script-practice-stage-service.test.ts src/lib/server/script-practice-agent-service.test.ts
```

Expected: 现有 owner-only 方法允许跨学校访问，新增测试失败。

- [ ] **Step 3: 改 repository 与所有 route**

每个脚本 Route 在读取 body 前后都从 `requirePracticeTenant(user)` 获取 scope；scope 不由 body 传入。repository SQL/file predicates 固定包含两个身份字段，子表查询先验证父 project scope；`owner_user_id`/`school_id` 不进入 patch 可写字段。

- [ ] **Step 4: 运行剧本测试与类型检查**

```powershell
pnpm exec vitest run --no-file-parallelism src/lib/server/script-practice-service.test.ts src/lib/server/script-practice-service.detail.test.ts src/lib/server/script-practice-stage-service.test.ts src/lib/server/script-practice-agent-service.test.ts
pnpm typecheck
```

Expected: PASS。

---

### Task 6: Generation task、log、result 和恢复链路绑定 scope

**Files:**
- Modify: `web/src/lib/server/generation-task-types.ts`
- Modify: `web/src/lib/server/generation-task-store.ts`
- Modify: `web/src/lib/server/generation-task-authorization.ts`
- Modify: `web/src/lib/server/generation-task-recovery-service.ts`
- Modify: `web/src/lib/server/generation-log-store.ts`
- Modify: `web/src/lib/server/local-media-registry.ts`
- Modify: `web/src/lib/server/reference-asset-store.ts`
- Modify: all practice task route/worker call sites under `web/src/app/api/{image-tasks,audio-tasks,text-tasks,video-generation-tasks,practice}`
- Modify: related task/log/media tests
- Modify: `web/src/lib/server/database/schema.ts`

**Interfaces:**
- `GenerationTaskContext.schoolId` required for practice profile; `StoredTaskBilling` unchanged。
- `create/get/list/link/claim/recover/cancel/retry` 的 practice 分支使用 `{ schoolId, ownerUserId }`；production 分支保持原合同。
- generation log 和 local media registration增加可选 `schoolId`，practice 写入时必填；正式数据仍可为空。

- [ ] **Step 1: 写失败测试**

1. 学校 A 的 task ID、clientRequestId、generation log 和 result 在 B 不能读取、恢复、取消、重试；
2. 同 user 转校后旧 task 不能通过 ID 或幂等 key 查询；
3. practice task 恢复上下文缺 schoolId 时拒绝；
4. practice log/media 注册必须有 schoolId，production 不受影响。

- [ ] **Step 2: 运行失败测试**

```powershell
pnpm exec vitest run --no-file-parallelism src/lib/server/generation-task-authorization.test.ts src/lib/server/generation-task-store.test.ts src/lib/server/generation-task-recovery-service.test.ts src/lib/server/generation-log-store.test.ts src/lib/server/local-media-registry.test.ts
```

Expected: 现有 task/log/media 只按 user 或 task id，新增跨校断言失败。

- [ ] **Step 3: 实现持久化和授权**

PostgreSQL task/log queries 使用 school/user 双条件；file fallback 同时过滤；task context 的 HMAC 增加 schoolId。所有 practice route 从 Session/可信 context 获取 scope，不接受客户端学校字段。生成结果媒体以 task/project/log 关联建立 practice school scope，媒体删除只在无其他引用时执行。

- [ ] **Step 4: 运行任务链路测试**

```powershell
pnpm exec vitest run --no-file-parallelism src/lib/server/generation-task-authorization.test.ts src/lib/server/generation-task-store.test.ts src/lib/server/generation-task-recovery-service.test.ts src/lib/server/generation-log-store.test.ts src/lib/server/local-media-registry.test.ts
pnpm typecheck
```

Expected: PASS。

---

### Task 7: TENANT-02 普通 asset / course material / IP / media type 授权

**Files:**
- Create: `web/src/lib/server/practice-reference-authorization.ts`
- Create: `web/src/lib/server/practice-reference-authorization.test.ts`
- Modify: `web/src/lib/server/practice-session-service.ts`
- Modify: `web/src/app/api/practice/sessions/route.ts`
- Modify: `web/src/app/api/practice/sessions/[id]/route.ts`
- Modify: `web/src/lib/server/reference-asset-store.ts`
- Modify: `web/src/lib/server/local-media-registry.ts`
- Modify: `web/src/lib/server/ip-library-reference-service.ts`
- Modify: `web/src/app/api/practice/sessions/*.test.ts`

**Interfaces:**
- `validatePracticeReferences(scope, module, input, references): Promise<NormalizedPracticeReferences>`。
- 对 `asset`：先读取 local media registration；owner 必须等于当前用户，或 `schoolRepository.getReadableCourseMaterial(ownerUserId, storageKey)` 返回可读课程资料；不能只看路径前缀。
- 对 IP：复用 `validateIpReferences`，但在 Session 成功写入后才调用 `recordIpReferenceUsage`。
- `expectedMediaType(module, inputKey)`：图片角色返回 `image`，`audio` 返回 `audio`；未知角色/类型不接受。

- [ ] **Step 1: 写失败测试**

覆盖以下矩阵：

| 引用 | 结果 |
|---|---|
| 当前用户自己的 image registration + image slot | 允许 |
| 其他用户 image registration | 拒绝 |
| 当前学校可读 course attachment image | 允许 |
| 不存在 storageKey 或仅伪造 `permanent/...` | 拒绝 |
| audio registration 放入 image/scene/frame slot | 拒绝 |
| image registration 放入 audio slot | 拒绝 |
| 无授权 IP / 失效 IP | 拒绝 |
| 任何失败 | 不创建 Session、不 dispatch、不写 IP usage |

- [ ] **Step 2: 运行失败测试**

```powershell
pnpm exec vitest run --no-file-parallelism src/lib/server/practice-reference-authorization.test.ts src/lib/server/practice-session-service.test.ts src/app/api/practice/sessions/route.test.ts
```

Expected: 当前 `normalizeReferences()` 只按 shape/path 接受，新增测试失败。

- [ ] **Step 3: 实现授权服务**

授权服务返回已验证的 storage key、mime/type 和 inputKey；Session service 在 `store.create()` 之前调用它。引用数据只写入规范化结果；不把客户端的 `url/serverUrl/remoteUrl` 直接当作授权来源。创建成功后再写 IP usage；dispatch 只接受已验证引用。

- [ ] **Step 4: 补 retry/recovery 校验**

重试和恢复使用 Session 内保存的引用，但仍重新检查当前 school/user 授权；引用被删除、课程授权撤销或 IP 失效时拒绝 dispatch，不创建新 task。

- [ ] **Step 5: 运行测试**

```powershell
pnpm exec vitest run --no-file-parallelism src/lib/server/practice-reference-authorization.test.ts src/lib/server/practice-session-service.test.ts src/app/api/practice/sessions/route.test.ts src/app/api/practice/sessions/[id]/route.test.ts
```

Expected: PASS。

---

### Task 8: 存量清理命令、部署顺序和文档

**Files:**
- Modify: `web/src/lib/server/practice-tenant-cleanup.ts`
- Create: `scripts/cleanup-practice-data.mjs`
- Modify: `docs/backend-database.md`
- Modify: `docs/VOZEB-PRO-开发地图.md`（仅在结构更新脚本运行后同步）
- Modify: `VOZEB-PRO-接口索引.md`（新增 API/Repository 后同步）
- Create/Modify: `web/src/lib/server/practice-tenant-cleanup.postgres.test.ts`

**Interfaces:**
- `pnpm cleanup:practice-data -- --dry-run`：报告会删除范围，不写数据。
- `pnpm cleanup:practice-data`：需要维护令牌/显式部署环境变量，在事务中清理 practice 存量并清理无其他引用媒体。
- 清理必须拒绝 production-only rows，命令输出必须报告 counts 和 skipped formal references。

- [ ] **Step 1: 写清理 dry-run 测试**

使用 fixture 同时插入 production canvas/drama/task/log/media 和 practice 对应数据；断言 dry-run 只报告 practice 记录，正式记录和被正式引用的媒体全部保留。

- [ ] **Step 2: 实现 file/PostgreSQL 清理适配**

PostgreSQL 使用单事务 CTE；file fallback 使用各自 JSON lock。媒体删除调用现有注册表/对象存储删除能力，并在删除前做跨表/JSON 引用计数。

- [ ] **Step 3: 运行清理测试**

```powershell
pnpm exec vitest run --no-file-parallelism src/lib/server/practice-tenant-cleanup.test.ts src/lib/server/practice-tenant-cleanup.postgres.test.ts
```

Expected: PASS；不得连接管理员真实数据库或线上存储。

- [ ] **Step 4: 更新 package script 和文档**

新增：

```json
"cleanup:practice-data": "node scripts/cleanup-practice-data.mjs"
```

文档明确：先 dry-run，再备份/确认，再 cleanup，再启用新 Schema 约束；普通正式创作、学校课程、作品和个人素材不在清理范围。

---

### Task 9: 端到端跨校验收和全量质量门禁

**Files:**
- Modify: `web/e2e/infinite-practice-module-workbenches.spec.ts`
- Create: `web/e2e/infinite-practice-tenant-isolation.spec.ts`
- Modify: existing practice API/E2E fixtures only where endpoint contract changed

**Interfaces:**
- E2E 用两个 active school、同一用户先后切换 membership 或两个用户验证跨校边界；不使用真实 RunningHub。

- [ ] **Step 1: 写 E2E 失败场景**

1. School A 创建 Canvas、Drama、Session、Script；
2. School B 列表为空、ID 详情/更新/删除/重试均 404；
3. School A 用户上传/引用自己的图片允许；引用其他用户图片、课程不可读附件、伪造 storage key、错误媒体类型均在 Session 创建前返回 4xx；
4. 正式 production Canvas/Drama/素材/课程仍存在；
5. 重新加入 A 后只能恢复 A 数据，不产生迁移到 B 的记录。

- [ ] **Step 2: 运行定向 E2E**

```powershell
pnpm exec playwright test e2e/infinite-practice-tenant-isolation.spec.ts --project=chromium --no-deps
```

Expected: PASS；不调用真实上游。

- [ ] **Step 3: 运行完整相关检查**

```powershell
pnpm exec vitest run --no-file-parallelism src/lib/server/practice-tenant-scope.test.ts src/lib/server/practice-tenant-cleanup.test.ts src/lib/server/practice-reference-authorization.test.ts src/lib/server/practice-session-service.test.ts src/lib/server/canvas-project-service.test.ts src/lib/server/drama-project-service.test.ts src/lib/server/script-practice-service.test.ts src/lib/server/generation-task-authorization.test.ts
pnpm typecheck
pnpm run lint -- --quiet
pnpm run format:check
pnpm run build
```

- [ ] **Step 4: 更新开发地图和接口索引**

从仓库根目录运行：

```powershell
pwsh -NoProfile -File .\过程文件\更新开发地图.ps1
pwsh -NoProfile -File .\过程文件\验证开发文档.ps1
```

提交前检查 `git diff` / `git status`，不得包含 `output/`、`.env`、凭据或无关用户修改。

---

## 部署/执行顺序

1. 先部署包含 cleanup dry-run 和兼容读取的版本，执行 `pnpm cleanup:practice-data -- --dry-run`。
2. 确认报告只包含 practice 数据与无其他引用的 practice media。
3. 执行正式 cleanup；保留日志和 counts。
4. 执行 Schema 字段/约束/索引升级。
5. 部署 scope-aware 代码，使所有新写入都带 `school_id`。
6. 运行跨校 E2E 和正式数据保留回归。
7. 失败时停止，不通过放宽 owner 条件或回退到按 ID 查询来绕过。

## 不在本次范围

- 不保留或迁移旧无限练习历史。
- 不新增学校管理员查看全校练习的后台功能。
- 不把音乐作为独立模块；现有 `dubbing` 即配音/音频练习。
- 不修改正式生产创作项目的租户模型或计费逻辑。
- 不做跨学校迁移、待归属、管理员确认归档或历史恢复工具。
