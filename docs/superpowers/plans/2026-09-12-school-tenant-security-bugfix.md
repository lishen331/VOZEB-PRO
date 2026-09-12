# 学校租户安全与权限 Bug 修复实施计划

> **给执行 Agent：** 必须使用 `superpowers:executing-plans` 按任务顺序执行本计划。每个任务都先写失败测试，再写最小实现，再运行对应验证；不得回滚或覆盖工作区已有的其他改动。

**目标：** 修复学校管理、学校课程、IP 库和无限练习的租户边界问题，让所有新练习数据绑定当前学校与个人，让普通练习素材在创建会话前完成授权校验，并让学校管理操作、课程状态和 IP 审计具备后端可验证的安全边界。

**架构：** 复用现有 Next.js Route Handler、Service、Repository、PostgreSQL 与 JSON fallback，不另建权限体系。服务端从当前 active school membership 推导 `PracticeTenantScope { schoolId, ownerUserId }`，核心 practice 表与任务/日志/媒体注册记录保存学校作用域；课程和 IP 操作由 Service 做业务校验、Repository 在最终 SQL 中带学校条件。当前环境和测试环境的旧 practice 存量先按明确 execution profile 清理，再启用新 Schema 约束。

**技术栈：** Next.js App Router、TypeScript、React、Ant Design、PostgreSQL、既有 JSON file fallback、Vitest、Playwright、参数化 SQL、现有学校/IP/媒体服务。

## 全局约束

- `school_id`、`membership_id`、`owner_user_id` 只能由服务端当前 Session 和 active membership 推导，客户端同名字段不得覆盖。
- 无限练习采用“学校作用域、个人所有”：访问必须满足当前 `school_id` 与当前 `user_id` 同时匹配。
- 当前环境和测试环境已有的 practice 存量统一清理；不推断旧数据学校归属，不把旧数据自动迁移到当前学校。
- 清理只能针对明确的 `open-source-practice` 数据及其练习关联，不得删除正式 Canvas/Drama、正式任务、课程、IP、作品或普通个人素材。
- 普通 `asset` 必须存在、未过期、属于当前用户、绑定当前学校且真实类型匹配；课程资料、IP、项目协作素材必须使用明确的业务引用类型。
- 学校停用、membership 停用、班级停用和课程/授权撤销必须在服务端生效，不能只隐藏前端按钮。
- 课程资料最终 UPDATE/DELETE 必须带学校边界；IP usage 的 target 必须真实存在并通过用户/学校归属验证。
- 不修改无限练习前端页面、卡片、表单和交互；前端如果继续提交兼容字段，后端不得据此绕过真实租户校验。
- PostgreSQL 已部署环境使用 `For every existing table, run `ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <column> ...` before adding indexes or constraints` 等有序幂等升级；不得删库、重建数据卷或依赖 `CREATE TABLE IF NOT EXISTS` 修改旧表。
- 共享 PostgreSQL 测试文件使用 `--no-file-parallelism`。
- 中文源码、脚本和文档保存为 UTF-8；不得覆盖无关未提交改动。

## 文件变更总览

### 学校管理员与成员导入

- Modify: `web/src/lib/server/school-tenant-service.ts`
- Modify: `web/src/lib/server/school-member-provisioning-service.ts`
- Modify: `web/src/app/api/school/members/[id]/route.ts`
- Modify: `web/src/app/api/school/members/import/route.ts`
- Modify: `web/src/lib/school-domain.ts`
- Modify: `web/src/services/api/school.ts`
- Modify: `web/src/app/(user)/school/school-administration.tsx`
- Modify: `web/src/app/(user)/school/school-csv.ts`
- Create: `web/src/lib/server/database/school-member-import-repository.ts`
- Modify: `web/src/lib/server/database/schema-school-domain.ts`
- Modify: `web/src/lib/server/audit-log-store.ts` only if the existing audit helper needs a typed batch target

### 课程

- Modify: `web/src/lib/server/school-course-service.ts`
- Modify: `web/src/lib/server/school-domain-repository.ts`
- Modify: `web/src/lib/server/database/school-domain-repository.ts`
- Modify: `web/src/lib/server/school-domain-file-repository.ts`
- Modify: `web/src/app/api/school/course-materials/[id]/route.ts`
- Modify: `web/src/app/api/school/courses/[id]/materials/route.ts`

### IP 库

- Modify: `web/src/lib/server/ip-library-access-service.ts`
- Modify: `web/src/lib/server/ip-library-download-service.ts`
- Modify: `web/src/lib/server/ip-library-service.ts`
- Modify: `web/src/lib/server/database/ip-library-repository.ts`
- Modify: `web/src/lib/server/database/schema-ip-library.ts`
- Modify: relevant existing IP routes under `web/src/app/api/ip-library/`\n- Create: `web/src/lib/server/ip-library-reference-service.test.ts`\n- Create: `web/src/lib/server/database/ip-library-repository.test.ts`

### 无限练习与媒体

- Create: `web/src/lib/server/practice-tenant-scope.ts`
- Create: `web/src/lib/server/practice-reference-authorization.ts`
- Create: `web/src/lib/server/practice-tenant-cleanup.ts`
- Modify: `web/src/lib/server/practice-access-service.ts`
- Modify: `web/src/lib/server/practice-project-service.ts`
- Modify: `web/src/lib/server/practice-session-service.ts`
- Modify: `web/src/lib/server/database/practice-repository.ts`
- Modify: `web/src/lib/server/database/script-practice-repository.ts`
- Modify: `web/src/lib/server/script-practice-service.ts`
- Modify: `web/src/lib/server/canvas-project-store.ts`
- Modify: `web/src/lib/server/drama-project-store.ts`
- Modify: `web/src/lib/server/generation-task-types.ts`
- Modify: `web/src/lib/server/generation-task-store.ts`
- Modify: `web/src/lib/server/generation-log-types.ts`
- Modify: `web/src/lib/server/generation-log-store.ts`
- Modify: `web/src/lib/server/local-media-registry.ts`
- Modify: `web/src/lib/server/reference-asset-store.ts`
- Modify: `web/src/lib/server/user-media-deletion-service.ts`
- Modify: `web/src/app/api/practice/sessions/route.ts`
- Modify: `web/src/app/api/practice/sessions/[id]/route.ts`
- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `docs/content/docs/backend/backend-database.mdx`

### 测试与回归

- Modify: existing unit/API tests next to each changed module
- Create: `web/e2e/school-tenant-security.spec.ts`
- Create: `web/e2e/infinite-practice-tenant-isolation.spec.ts`
- Modify: `VOZEB-PRO-接口索引.md` and `VOZEB-PRO-开发地图.md` only through the repository update scripts after interface changes

## Task 1：锁定学校管理员自我操作规则

**Files:**
- Modify: `web/src/lib/server/school-tenant-service.ts`
- Modify: `web/src/lib/server/school-tenant-service.test.ts`
- Create: `web/"src/app/api/school/members/[id]/route.test.ts"`
- Modify: `web/src/app/(user)/school/school-administration.tsx`

**Interfaces:**
- `updateSchoolMember(managerId, membershipId, patch)` continues to own member changes and rejects self-delete-equivalent patches.
- `removeSchoolMember(managerId, membershipId)` continues to own removal and rejects `target.userId === managerId`.
- Both Service and UI use the exact message: `不能在成员管理中删除、禁用或取消自己的管理权限，请由另一名学校管理员操作`.

- [ ] **Step 1: 写失败测试**

在 Service 测试中准备 manager A 和同校 membership A，覆盖：

```ts
await expect(removeSchoolMember("user-a", "membership-a")).rejects.toMatchObject({ status: 409 });
await expect(updateSchoolMember("user-a", "membership-a", { status: "disabled", updatedAt: now })).rejects.toMatchObject({ status: 409 });
await expect(updateSchoolMember("user-a", "membership-a", { role: "student", updatedAt: now })).rejects.toMatchObject({ status: 409 });
await expect(updateSchoolMember("user-a", "membership-a", { permissions: [], updatedAt: now })).rejects.toMatchObject({ status: 409 });
```

同时断言对 membership B 的操作仍进入原有校验和 Repository。

- [ ] **Step 2: 运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism src/lib/server/school-tenant-service.test.ts "src/app/api/school/members/[id]/route.test.ts"
```

Expected: 新增自我操作断言失败。

- [ ] **Step 3: 实现 Service 前置拦截**

在锁定目标 membership 后先比较 `membership.userId === managerId`；只要 patch 会删除、禁用、降为 student 或移除 `school.manage`，统一抛出 409。保留“学校至少一名可用管理员”的原有检查。

- [ ] **Step 4: 实现 UI 状态**

成员表格识别当前登录用户，对本人显示“当前操作者”，禁用“移出”“禁用”“取消管理”“降为学生”入口；对其他成员保留现有确认弹窗和操作。

- [ ] **Step 5: 运行通过测试并提交**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism src/lib/server/school-tenant-service.test.ts "src/app/api/school/members/[id]/route.test.ts"
pnpm --dir web exec vitest run "src/app/(user)/school/school-administration.test.tsx"
 git add web/src/lib/server/school-tenant-service.ts web/src/lib/server/school-tenant-service.test.ts web/"src/app/api/school/members/[id]/route.test.ts" web/src/app/(user)/school/school-administration.tsx
 git commit -m "fix(school): block administrator self-management"
```

## Task 2：成员导入模板、逐行预检和原子批次

**Files:**
- Modify: `web/src/app/(user)/school/school-csv.ts`
- Modify: `web/src/app/(user)/school/school-administration.tsx`
- Modify: `web/src/lib/server/school-member-provisioning-service.ts`
- Modify: `web/src/app/api/school/members/import/route.ts`
- Modify: `web/src/lib/school-domain.ts`
- Modify: `web/src/services/api/school.ts`
- Create: `web/src/lib/server/database/school-member-import-repository.ts`
- Modify: `web/src/lib/server/database/schema-school-domain.ts`
- Modify: `web/"src/app/(user)/school/school-administration.test.tsx"`\n- Modify: `web/"src/app/api/school/members/import/route.test.ts"`\n- Create: `web/"src/app/(user)/school/school-csv.test.ts"`

**Interfaces:**
- `parseSchoolMemberCsv(source): { ok: boolean; rows?: ...; errors?: Array<{ row: number; field?: string; code: string; message: string }> }`。
- `previewSchoolMemberImport(managerId, rows): Promise<{ total: number; valid: number; invalid: number; errors: Array<{ row: number; field?: string; code: string; message: string }> }>`。
- `importSchoolMembers(managerId, rows, previewToken): Promise<{ batchId: string; imported: number; total: number }>`。
- Preview token is an opaque server-side token or signed digest; it contains no password and cannot be used after the submitted row set changes.

- [ ] **Step 1: 写失败测试**

覆盖：

```ts
parseSchoolMemberCsv("username,displayName,password,role\nstudent001,,Password123,student")
// errors: row 2 / displayName / required

parseSchoolMemberCsv("username,displayName,password,role\nstudent001,张三,Password123,老师")
// errors: row 2 / role / invalid

parseSchoolMemberCsv("username,displayName,password,role\nstudent001,张三,Password123,student\nstudent001,李四,Password123,student")
// errors: duplicate username
```

Service 断言只要一行无效，不调用 `createOrdinaryUsersForSchool`；全部有效时只执行一个事务；密码不进入批次、审计和响应。

- [ ] **Step 2: 运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/app/(user)/school/school-csv.test.ts" src/lib/server/school-member-provisioning-service.test.ts "src/app/api/school/members/import/route.test.ts"
```

Expected: 当前 parser 只返回整文件错误，Service 没有预检和 batch 失败。

- [ ] **Step 3: 扩展 CSV 解析和预检结果**

保留固定列顺序 `username,displayName,password,role`；使用 UTF-8 fatal 解码；逐行返回行号、字段和错误码。`displayName` 为空直接报错，不能回退为 username；`role` 只接受 `student`、`teacher`。

- [ ] **Step 4: 增加导入批次表和错误明细**

按当前 Schema 风格新增幂等表 `school_member_import_batches` 与 `school_member_import_errors`，字段包括 batch、school、operator、file name、counts、status、row number、field、code、message；禁止保存 password。新增表同步 `docs/content/docs/backend/backend-database.mdx`。

- [ ] **Step 5: 实现全量预检和单事务导入**

预检完成后返回可读结果；只有 preview 通过且 token 与 rows fingerprint 一致时，在一个事务内创建账号、membership 和 success batch。任一落库失败回滚账号、membership，写 failed batch 和不含密码的逐行错误。

- [ ] **Step 6: 增加后台模板和预览 UI**

在成员导入 Drawer 提供模板下载、示例、字段说明、角色说明、总数/有效/错误统计和逐行错误表；存在错误时禁用“确认导入”，不发起正式导入。

- [ ] **Step 7: 运行测试并提交**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/app/(user)/school/school-csv.test.ts" src/lib/server/school-member-provisioning-service.test.ts "src/app/api/school/members/import/route.test.ts" src/lib/server/database/school-member-import-repository.test.ts
pnpm --dir web exec vitest run "src/app/(user)/school/school-administration.test.tsx"
pnpm --dir web run typecheck
 git add web/src/app/(user)/school web/src/lib/server/school-member-provisioning-service.ts web/src/app/api/school/members/import web/src/lib/school-domain.ts web/src/services/api/school.ts web/src/lib/server/database/schema-school-domain.ts web/src/lib/server/database/school-member-import-repository.ts docs/content/docs/backend/backend-database.mdx
 git commit -m "fix(school): validate member imports atomically"
```

## Task 3：班级停用后的课程只读和写入拦截

**Files:**
- Modify: `web/src/lib/server/school-course-service.ts`
- Modify: `web/src/lib/server/school-domain-repository.ts`
- Modify: `web/src/lib/server/database/school-domain-repository.ts`
- Modify: `web/src/lib/server/school-domain-file-repository.ts`
- Modify: course route tests and service tests

**Interfaces:**
- 课程读取接口继续返回历史内容，但写操作返回 409：`班级已停用，历史记录仅可查看`。
- `createSchoolMaterial`、`updateCourseMaterial`、`deleteCourseMaterial` 的 Service 校验当前班级状态。
- Repository 更新/删除接口接收 `schoolId` 或等价的学校作用域参数。

- [ ] **Step 1: 写失败测试**

准备 active school、active offering、负责人和 disabled class，断言上传、修改、删除都返回 409；历史课程树、资料和已完成任务仍可读。准备另一学校资料 ID，断言 A 更新/删除 B 的资料不改变 B 数据。

- [ ] **Step 2: 运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism src/lib/server/school-course-service.test.ts src/lib/server/database/school-domain-repository.test.ts src/lib/server/school-domain-file-repository.test.ts "src/app/api/school/course-materials/[id]/route.test.ts"
```

Expected: disabled class write and repository cross-school assertions fail.

- [ ] **Step 3: 把班级状态纳入写权限**

在 `assertSchoolMaterialManager` 或其调用路径中读取本校 offering 的 `classId`，再读取 `school_classes.status`；非 active 统一拒绝。读取路径保留历史只读，不复用写权限 helper。

- [ ] **Step 4: 修改 PostgreSQL Repository SQL**

将 `updateCourseMaterial`、`deleteCourseMaterial` 改为带 `schoolId` 参数，使用资料与 `school_course_assignments.school_id` 的 `EXISTS`/JOIN 条件；平台资料走平台管理员分支，但学校资料不能只按 material ID 操作。返回 0 行时 Service 映射为 404/无权访问。

- [ ] **Step 5: 修改 file fallback**

文件 Repository 的更新/删除同样先按学校课程分配和资料 ID 定位，不能只按资料 ID；增加跨学校单元测试。

- [ ] **Step 6: 运行测试并提交**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism src/lib/server/school-course-service.test.ts src/lib/server/database/school-domain-repository.test.ts src/lib/server/school-domain-file-repository.test.ts "src/app/api/school/course-materials/[id]/route.test.ts"
pnpm --dir web run typecheck
 git add web/src/lib/server/school-course-service.ts web/src/lib/server/school-domain-repository.ts web/src/lib/server/database/school-domain-repository.ts web/src/lib/server/school-domain-file-repository.ts web/src/app/api/school
 git commit -m "fix(course): enforce disabled-class and school write boundaries"
```

## Task 4：学校管理员自我操作和课程跨校真实 API 回归

**Files:**
- Create: `web/e2e/school-tenant-security.spec.ts`
- Modify: existing E2E fixtures only where needed

- [ ] **Step 1: 写 E2E**

使用学校 A/B 和两个管理员：验证 A 管理员自删、自禁用、自降权均为 409 且 membership 未变化；A 更新/删除 B 资料返回 4xx 且 B 数据不变；停用班级后历史读取成功、写入失败。

- [ ] **Step 2: 运行 E2E**

```powershell
pnpm --dir web exec playwright test e2e/school-tenant-security.spec.ts --project=chromium --no-deps
```

Expected: PASS；测试不得依赖生产数据或真实外部服务。

## Task 5：IP 授权可见封面和下载学校审计

**Files:**
- Modify: `web/src/lib/server/ip-library-access-service.ts`
- Modify: `web/src/lib/server/ip-library-download-service.ts`
- Modify: `web/src/lib/server/database/ip-library-repository.ts`
- Modify: `web/src/lib/server/database/schema-ip-library.ts`
- Modify: existing IP tests and routes

**Interfaces:**
- `IpAccessContext` 保留 `schoolId?: string`；school-visible IP 必须要求当前 active school context。
- `requireVisibleIp` 返回的 detail/subIp 只能包含当前用户可见子 IP；包级封面由可见范围重新选择。
- `downloadIpForUser` 写入当前 Session 推导出的 `schoolId`；客户端不能指定。

- [ ] **Step 1: 写失败测试**

覆盖：只授权子 IP B 时 IP 包预览、详情和下载不能返回 A 封面；B 有封面时返回 B；可见子 IP 无封面时返回默认占位；学校 A 公共下载记录 `schoolId=A`；无学校用户记录为空。

- [ ] **Step 2: 运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism src/lib/server/ip-library-download-service.test.ts src/lib/server/ip-library-service.test.ts src/lib/server/database/ip-library-repository.test.ts src/app/api/ip-library
```

Expected: current package cover path and download context assertions fail or missing tests expose the gap.

- [ ] **Step 3: 统一可见封面解析**

在 `requireVisibleIp` 返回学校访问上下文后，若请求的是包级封面，先确认 `detail.coverFileId` 对应文件属于当前可见子 IP；否则按 `subIp.sortOrder, createdAt, id` 选择第一个可见子 IP 的 ready image cover；没有则返回系统占位，不读取未授权文件。

- [ ] **Step 4: 固定下载 schoolId 来源**

下载记录只接受 `requireVisibleIp` 返回的 `schoolId`；公共 IP 访问若当前用户有 active school context，则记录该学校，否则保持 NULL。不要从请求体或 query 读取学校 ID。

- [ ] **Step 5: 运行测试并提交**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism src/lib/server/ip-library-download-service.test.ts src/lib/server/ip-library-service.test.ts src/lib/server/database/ip-library-repository.test.ts src/app/api/ip-library
pnpm --dir web run typecheck
 git add web/src/lib/server/ip-library-access-service.ts web/src/lib/server/ip-library-download-service.ts web/src/lib/server/database/ip-library-repository.ts web/src/lib/server/database/schema-ip-library.ts web/src/app/api/ip-library
 git commit -m "fix(ip): enforce visible cover and school download audit"
```

## Task 6：IP usage targetId 真实性校验

**Files:**
- Modify: `web/src/lib/server/ip-library-service.ts`
- Modify: `web/src/lib/server/ip-library-reference-service.ts`
- Modify: `web/src/lib/server/database/ip-library-repository.ts` only if target validation needs a narrow transaction query
- Modify: IP service tests

**Interfaces:**
- `createIpUsagesForUser` / `recordIpReferenceUsage` 在 action=`reference` 时先验证 target。
- Canvas、Drama、Practice target 必须属于当前用户、当前学校并匹配 `execution_profile=open-source-practice`。
- 验证失败不写 usage、不增加统计、不调用异步补偿。

- [ ] **Step 1: 写失败测试**

准备用户 A/学校 A 的合法目标、用户 B/学校 B 的目标，断言 A 使用 B 的 targetId、空 targetId、targetType 与实体不匹配均拒绝；合法目标写入的 `schoolId` 由当前 context 推导。

- [ ] **Step 2: 运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism src/lib/server/ip-library-service.test.ts src/lib/server/ip-library-reference-service.test.ts
```

Expected: current code only validates non-empty targetId.

- [ ] **Step 3: 实现窄目标验证器**

按 `targetType` 查询对应项目/Session，使用 `userId + schoolId + executionProfile` 条件；不要读取完整业务表后在 Node.js 过滤。Practice 目标兼容当前 Session/project 两种调用方式，但必须归属当前用户和学校。

- [ ] **Step 4: 将 usage 写入放在目标验证之后**

`recordIpReferenceUsage` 先完成 IP 授权和 target 校验，再创建 usage record；任何失败不留下审计行。

- [ ] **Step 5: 运行测试并提交**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism src/lib/server/ip-library-service.test.ts src/lib/server/ip-library-reference-service.test.ts
pnpm --dir web run typecheck
 git add web/src/lib/server/ip-library-service.ts web/src/lib/server/ip-library-reference-service.ts web/src/lib/server/database/ip-library-repository.ts
 git commit -m "fix(ip): validate usage target ownership"
```

## Task 7：Practice Schema、Scope 和存量清理

**Files:**
- Create: `web/src/lib/server/practice-tenant-scope.ts`
- Create: `web/src/lib/server/practice-tenant-cleanup.ts`
- Create: `web/scripts/cleanup-practice-data.mjs`
- Modify: `web/src/lib/server/practice-access-service.ts`
- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `web/src/lib/server/database/practice-repository.ts`
- Modify: `web/src/lib/server/database/script-practice-repository.ts`
- Modify: `web/src/lib/server/canvas-project-store.ts`
- Modify: `web/src/lib/server/drama-project-store.ts`
- Modify: `web/src/lib/server/generation-task-types.ts`
- Modify: `web/src/lib/server/generation-task-store.ts`
- Modify: `web/src/lib/server/generation-log-types.ts`
- Modify: `web/src/lib/server/generation-log-store.ts`
- Modify: `web/src/lib/server/local-media-registry.ts`
- Modify: `web/src/lib/server/user-media-deletion-service.ts`
- Modify: `web/package.json`
- Modify: `docs/content/docs/backend/backend-database.mdx`
- Modify: existing tests next to each file\n- Create: `web/src/lib/server/practice-tenant-cleanup.test.ts`\n- Create: `web/src/lib/server/practice-reference-authorization.test.ts`

**Interfaces:**

```ts
type PracticeTenantScope = { schoolId: string; ownerUserId: string };
async function requirePracticeTenant(actor: { id: string; role?: string }): Promise<PracticeTenantScope>;
```

Cleanup CLI:

```powershell
pnpm --dir web cleanup:practice-data -- --dry-run
pnpm --dir web cleanup:practice-data
```

- [ ] **Step 1: 写失败测试**

覆盖：

- active teacher/student 推导学校和 owner；
- disabled school/membership 拒绝；
- `practice_sessions`、practice Canvas/Drama、script project 创建后保存 `school_id`；
- A 用户在 B context 读取/编辑/删除/重试 A 数据返回 404；
- 客户端 schoolId 不覆盖服务端；
- cleanup dry-run 只列 practice 数据，正式项目和普通素材不在删除清单。

- [ ] **Step 2: 运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism src/lib/server/practice-tenant-scope.test.ts src/lib/server/practice-tenant-cleanup.test.ts src/lib/server/practice-session-service.test.ts src/lib/server/database/practice-repository.test.ts src/lib/server/database/script-practice-repository.test.ts
```

Expected: 当前核心 practice 记录缺少 school_id，且查询只按 user/id。

- [ ] **Step 3: 按当前持久化结构增加字段**

对以下表先补列，再补索引/约束：

```text
practice_sessions.school_id
canvas_projects.school_id（仅 practice 行要求非空）
drama_projects.school_id（仅 practice 行要求非空）
practice_script_projects.school_id
practice_script_versions.school_id
practice_script_entities.school_id
practice_script_stages.school_id
practice_script_agent_operations.school_id
local_media_assets.school_id（practice 生成/上传媒体使用）
generation_tasks.school_id
 generation_logs.school_id
```

如生成任务/日志表当前只通过 JSON 保存上下文，新增列仍要写入并用于定向查询；正式 production 行保持原有语义。对子表使用同校复合外键或服务层 + 参数化 SQL 的等价约束，不能让客户端传入学校。

- [ ] **Step 4: 实现 Scope 推导和创建写入**

所有 practice create service 从 `requirePracticeTenant()` 获取 scope；将 `schoolId` 写入主表和任务上下文。创建后禁止 patch school/owner 字段。`GenerationTaskContext.schoolId` 只接受可信内部 dispatch 写入。

- [ ] **Step 5: 实现双重过滤**

Practice Repository、Canvas/Drama/Script Service、Session store、任务/日志读取和恢复均使用 `school_id + user_id` 条件；ID 只作为额外条件。普通 production 路径不添加 practice 学校要求。

- [ ] **Step 6: 实现 cleanup dry-run 与正式清理**

PostgreSQL 清理使用单事务、明确 execution profile 条件和关联表顺序；file fallback 使用现有 JSON lock。媒体删除前调用现有引用计数，保留仍被正式业务引用的媒体。CLI 默认拒绝没有显式 dry-run/确认参数的生产环境直接删除，并输出每类 counts。

- [ ] **Step 7: 运行测试、Schema 检查并提交**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism src/lib/server/practice-tenant-scope.test.ts src/lib/server/practice-tenant-cleanup.test.ts src/lib/server/practice-session-service.test.ts src/lib/server/database/practice-repository.test.ts src/lib/server/database/script-practice-repository.test.ts src/lib/server/database/postgres.test.ts
pnpm --dir web run typecheck
pnpm --dir web run lint -- --quiet
 git add web/src/lib/server/practice-tenant-scope.ts web/src/lib/server/practice-tenant-cleanup.ts web/scripts/cleanup-practice-data.mjs web/src/lib/server/practice-access-service.ts web/src/lib/server/database web/src/lib/server/canvas-project-store.ts web/src/lib/server/drama-project-store.ts web/src/lib/server/generation-task-types.ts web/src/lib/server/generation-task-store.ts web/src/lib/server/generation-log-types.ts web/src/lib/server/generation-log-store.ts web/src/lib/server/local-media-registry.ts web/src/lib/server/user-media-deletion-service.ts web/package.json docs/content/docs/backend/backend-database.mdx
 git commit -m "fix(practice): persist school tenant scope"
```

## Task 8：TENANT-02 普通 asset 和业务引用前置授权

**Files:**
- Create: `web/src/lib/server/practice-reference-authorization.ts`
- Modify: `web/src/lib/server/practice-session-service.ts`
- Modify: `web/src/app/api/practice/sessions/route.ts`
- Modify: `web/src/app/api/practice/sessions/[id]/route.ts`
- Modify: `web/src/lib/server/local-media-registry.ts`
- Modify: `web/src/lib/server/reference-asset-store.ts`
- Modify: `web/src/lib/server/ip-library-reference-service.ts`
- Modify: `web/src/lib/server/school-domain-repository.ts`
- Modify: the existing tests next to each route/service; create a new test file only where the listed module has no test file

**Interfaces:**

```ts
type PracticeReferenceInput = { type: "asset" | "ip" | "course-material" | "project-asset"; id: string; inputKey?: string };
type VerifiedPracticeReference = { type: PracticeReferenceInput["type"]; id: string; inputKey?: string; mediaType?: "image" | "video" | "audio"; storageKey?: string };
async function validatePracticeReferences(scope: PracticeTenantScope, module: PracticeModuleKind, input: Record<string, unknown>, references: unknown[]): Promise<VerifiedPracticeReference[]>;
```

- [ ] **Step 1: 写失败测试**

覆盖：

- 当前用户当前学校的 image registration + image slot：允许；
- 其他用户或其他学校的 registration：拒绝；
- 无 `school_id` 的历史个人素材：拒绝；
- 伪造 `permanent/...` storage key：拒绝；
- image 放 audio slot、audio 放 image slot：拒绝；
- 课程资料、IP、项目共享素材走各自授权，不当作普通 asset；
- 任何失败都不创建 Session、不 dispatch、不产生 usage。

- [ ] **Step 2: 运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism src/lib/server/practice-reference-authorization.test.ts src/lib/server/practice-session-service.test.ts src/app/api/practice/sessions/route.test.ts src/app/api/practice/sessions/[id]/route.test.ts
```

Expected: 当前 Session 只规范化 asset shape，未在创建前查 registration school/owner/type。

- [ ] **Step 3: 实现普通 asset 授权**

用 storage key 查询 `local_media_assets` registration；必须检查 scope、未过期、owner、schoolId、媒体真实 type。不要信任客户端 URL、mime、文件名或 `permanent/` 前缀。

- [ ] **Step 4: 实现业务引用授权**

`ip` 调用现有 IP 学校授权；`course-material` 调用当前学校课程资料可读校验；`project-asset` 校验项目成员、项目学校和素材归属。未经定义的引用类型拒绝。

- [ ] **Step 5: 把前置校验接入 Session 创建**

在 `store.create()` 前执行完整验证，验证后的引用才写入 Session；只有 Session 成功后再记录 IP usage。非法引用直接返回 400/403/404，不创建失败 Session、任务、积分或上游请求。

- [ ] **Step 6: 接入重试、恢复和媒体签名前复核**

重试、恢复、生成任务实际创建和向上游签发媒体 URL 前重新验证学校 membership、Session scope、registration 和业务授权；撤销或转校后不得继续发送素材。

- [ ] **Step 7: 运行测试并提交**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism src/lib/server/practice-reference-authorization.test.ts src/lib/server/practice-session-service.test.ts src/app/api/practice/sessions/route.test.ts src/app/api/practice/sessions/[id]/route.test.ts src/lib/server/local-media-registry.test.ts src/lib/server/ip-library-reference-service.test.ts
pnpm --dir web run typecheck
 git add web/src/lib/server/practice-reference-authorization.ts web/src/lib/server/practice-session-service.ts web/src/app/api/practice/sessions web/src/lib/server/local-media-registry.ts web/src/lib/server/reference-asset-store.ts web/src/lib/server/ip-library-reference-service.ts web/src/lib/server/school-domain-repository.ts
 git commit -m "fix(practice): authorize tenant-scoped references before session creation"
```

## Task 9：任务、日志、媒体和普通入口的撤权回归

**Files:**
- Modify: generation task/log/media tests
- Modify: `web/src/app/api/image-tasks/route.ts`
- Modify: `web/src/app/api/video-generation-tasks/video-generation-route.ts`
- Modify: `web/src/app/api/audio-tasks/route.ts`
- Modify: `web/src/app/api/text-tasks/route.ts`
- Modify: `web/src/lib/server/generation-project-context.ts`
- Modify: `web/src/app/api/canvas/projects/[id]/route.ts`
- Modify: `web/src/app/api/drama/projects/[id]/route.ts`
- Modify: `web/src/lib/server/canvas-project-store.ts`
- Modify: `web/src/lib/server/drama-project-store.ts`

- [ ] **Step 1: 写跨学校/失权测试**

覆盖：

- 练习项目从普通 Canvas/Drama 入口读取、更新、删除时，当前学校和用户必须匹配；
- 被移出学校后不能继续按免费 practice 生成；
- B context 不能读取 A 的 task、log、result media；
- 任务创建后 membership/asset 授权被撤销，恢复或重试拒绝；
- 正式 production 项目不被新增 practice scope 条件误伤。

- [ ] **Step 2: 运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism src/lib/server/generation-task-store.test.ts src/lib/server/generation-task-recovery-service.test.ts src/lib/server/local-media-registry.test.ts src/lib/server/canvas-project-service.test.ts src/lib/server/drama-project-service.test.ts src/app/api/canvas/projects/[id]/route.test.ts src/app/api/drama/projects/[id]/route.test.ts
```

Expected: 现有读取/恢复条件缺少 school scope。

- [ ] **Step 3: 接入可信 task context**

practice task 只从 `requirePracticeTenant()` 和可信 Session dispatch 获得 `schoolId`；客户端 body、普通 project JSON 和 URL 不得提升为可信租户字段。任务、日志和媒体注册的 practice 查询按 school/user 定向过滤。

- [ ] **Step 4: 修复普通 Canvas/Drama 入口**

对 `executionProfile=open-source-practice` 的项目，普通入口必须调用 practice access 并验证当前学校；production 项目沿用现有 owner 语义。不能因为项目 ID 属于当前用户就跳过学校身份。

- [ ] **Step 5: 运行测试并提交**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism src/lib/server/generation-task-store.test.ts src/lib/server/generation-task-recovery-service.test.ts src/lib/server/local-media-registry.test.ts src/lib/server/canvas-project-service.test.ts src/lib/server/drama-project-service.test.ts src/app/api/canvas/projects/[id]/route.test.ts src/app/api/drama/projects/[id]/route.test.ts
pnpm --dir web run typecheck
 git add web/src/app/api/image-tasks web/src/app/api/video-generation-tasks web/src/app/api/audio-tasks web/src/app/api/text-tasks web/src/lib/server/generation-project-context.ts web/src/app/api/canvas web/src/app/api/drama web/src/lib/server/generation-task-store.ts web/src/lib/server/generation-log-store.ts web/src/lib/server/local-media-registry.ts
 git commit -m "fix(practice): enforce tenant scope through task recovery"
```

## Task 10：双学校 E2E、Schema/文档同步和全量验收

**Files:**
- Create: `web/e2e/infinite-practice-tenant-isolation.spec.ts`
- Create: `web/e2e/school-tenant-security.spec.ts`
- Modify: existing E2E fixtures only where endpoint contracts changed
- Modify: `docs/content/docs/backend/backend-database.mdx`
- Regenerate: `VOZEB-PRO-接口索引.md`, `VOZEB-PRO-开发地图.md` through scripts

- [ ] **Step 1: 写端到端场景**

使用两个学校 A/B 和两个用户/管理员：

```text
管理员自删/自禁用/自降权 → 409，数据不变
成员导入错误行 → 预检失败，0 个账号创建
停用班级 → 历史读取成功，课程写入失败
A 资料 ID → B 不能更新/删除
A 只授权子 IP B → 不返回 A 封面
A 公共下载 → school_id=A
伪造 B 的 targetId → 不写 IP usage
A 创建 practice 数据 → school_id=A
切换 B → A 数据、任务、媒体不可读
B 创建 asset → A asset 不可引用
无 school_id 的历史 asset → 练习创建前拒绝
```

- [ ] **Step 2: 运行定向 E2E**

```powershell
pnpm --dir web exec playwright test e2e/school-tenant-security.spec.ts e2e/infinite-practice-tenant-isolation.spec.ts --project=chromium --no-deps
```

Expected: PASS；不调用真实生产数据库、真实 RunningHub 或真实对象存储。

- [ ] **Step 3: 运行相关 Vitest、类型、Lint 和格式检查**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism src/lib/server/school-tenant-service.test.ts src/lib/server/school-member-provisioning-service.test.ts src/lib/server/school-course-service.test.ts src/lib/server/ip-library-service.test.ts src/lib/server/ip-library-download-service.test.ts src/lib/server/practice-tenant-scope.test.ts src/lib/server/practice-tenant-cleanup.test.ts src/lib/server/practice-reference-authorization.test.ts src/lib/server/practice-session-service.test.ts src/lib/server/generation-task-store.test.ts src/lib/server/canvas-project-service.test.ts src/lib/server/drama-project-service.test.ts
pnpm --dir web run typecheck
pnpm --dir web run lint -- --quiet
pnpm --dir web run format:check
pnpm --dir web run build
```

- [ ] **Step 4: 更新开发地图与接口索引**

从仓库根目录执行：

```powershell
pwsh -NoProfile -File .\过程文件\更新开发地图.ps1
pwsh -NoProfile -File .\过程文件\验证开发文档.ps1
```

如果接口索引或开发地图数量漂移，先修生成脚本/基线/文档，再继续交付；不能跳过验证。

- [ ] **Step 5: UTF-8 和差异检查**

严格解码全部修改文档和源码，检查 `U+FFFD`、`U+951F`、`U+65A4`、`U+62F7`；运行 `git diff --check`；检查 `git status`，确认没有 `.env`、凭据、`output/` 或无关工作区修改。

## 部署和执行顺序

1. 先部署包含 Schema 兼容读取、预检和 cleanup dry-run 的版本。
2. 执行 `pnpm --dir web cleanup:practice-data -- --dry-run`，确认只包含 practice 数据。
3. 备份后执行正式 cleanup；记录每类删除数量和被正式引用而保留的媒体。
4. 执行 PostgreSQL 幂等 Schema 升级，先补 practice `school_id` 列，再补索引/约束。
5. 部署所有新写入都由当前 active school context 推导 scope 的代码。
6. 执行双学校 API/E2E 和正式数据保留回归。
7. 任一失败时停止；不能通过放宽 owner 条件、删除学校条件或回退到只按 ID 查询来绕过。

## 完成判定

只有以下条件全部满足，才能报告完成：

- 管理员不能自删、自禁用、自降权；
- 成员导入有模板、逐行预检、全量原子提交、批次和审计；
- 姓名为空和中文角色在提交前被指出；
- 停用班级进入历史只读，课程资料写操作被阻止；
- 课程资料 SQL 和 file fallback 都有学校边界；
- 未授权子 IP 封面不返回；
- 公共 IP 下载记录带当前学校；
- IP usage targetId 无法伪造；
- practice 新数据具备不可变 `school_id + owner_user_id`；
- 用户转校后不能读取或使用原学校 practice 数据；
- 普通 asset 在 Session 创建前通过 owner、school、有效期和真实类型校验；
- 非法引用不创建失败 Session、任务、积分或 usage；
- 任务、日志、结果媒体和普通 Canvas/Drama 入口不绕过 practice scope；
- 正式生产数据和普通个人素材未被误删或误伤；
- 双学校测试、相关 Vitest、类型、Lint、格式、构建、E2E、开发地图和接口索引均有真实通过证据。




