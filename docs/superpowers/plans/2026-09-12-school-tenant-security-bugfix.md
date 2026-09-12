# 学校租户安全与权限 Bug 修复实施计划

> **给执行 Agent：** 必须使用 `superpowers:executing-plans` 按任务顺序执行本计划。每个任务先写失败测试，再写最小实现，再运行对应验证；不得回滚或覆盖工作区已有的其他改动。

**目标：** 修复学校管理、学校课程、IP 库和无限练习的租户边界问题，让学校管理员不能自我失权，成员导入具备逐行预检和整批原子性，停用班级进入历史只读，IP 审计和封面严格遵守学校授权，并让无限练习的新数据绑定当前学校与个人。

**架构：** 复用现有 Next.js Route Handler、Service、Repository、PostgreSQL 与 JSON fallback，不另建权限体系。服务端从当前 active school membership 推导 `PracticeTenantScope { schoolId, ownerUserId }`，practice 主数据、任务、日志和媒体注册记录保存学校作用域；课程和 IP 操作由 Service 做业务状态校验，由 Repository 在最终 SQL 中带学校条件。当前环境和测试环境已有的 practice 存量在新版本部署时统一清理，不推断旧学校归属，也不自动迁移到当前学校。

**技术栈：** Next.js App Router、TypeScript、React、Ant Design、PostgreSQL、JSON file fallback、Vitest、Playwright、参数化 SQL、现有学校/IP/媒体服务。

## Global Constraints

- `school_id`、`membership_id`、`owner_user_id` 只能由服务端当前 Session 和 active membership 推导，客户端同名字段不得覆盖。
- 无限练习采用“学校作用域、个人所有”：访问必须满足当前 `school_id` 与当前 `user_id` 同时匹配。
- 当前环境和测试环境已有 practice 存量统一清理；不推断旧数据学校归属，不把旧数据自动迁移到当前学校。
- 清理只针对明确的 `open-source-practice` 数据及其练习关联，不得删除正式 Canvas/Drama、正式任务、课程、IP、作品或普通个人素材。
- 普通 `asset` 必须存在、未过期、属于当前用户、绑定当前学校且真实类型匹配；课程资料、IP、项目协作素材必须使用明确业务引用类型。
- 学校停用、membership 停用、班级停用和课程/IP 授权撤销必须在服务端生效，不能只隐藏前端按钮。
- 课程资料最终 UPDATE/DELETE 必须带学校边界；IP usage 的 target 必须真实存在并通过用户/学校归属验证。
- 不修改无限练习前端页面、卡片、表单和交互；若既有前端继续提交旧字段，后端不得以旧字段绕过真实租户校验。
- PostgreSQL 已部署环境使用有序幂等升级：已有表先 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`，再回填、清理、约束和索引；不得删库或重建数据卷。
- 共享 PostgreSQL 测试文件使用 `--no-file-parallelism`。
- 中文源码、脚本和文档保存为 UTF-8；不得覆盖无关未提交改动。

## 文件变更总览

### 学校管理与成员导入

- Modify: `web/src/lib/server/school-tenant-service.ts`
- Modify: `web/src/lib/server/school-tenant-service.test.ts`
- Modify: `web/src/app/api/school/members/[id]/route.ts`
- Create: `web/src/app/api/school/members/[id]/route.test.ts`
- Modify: `web/src/lib/server/school-member-provisioning-service.ts`
- Modify: `web/src/app/api/school/members/import/route.ts`
- Modify: `web/src/app/api/school/members/import/route.test.ts`
- Modify: `web/src/app/(user)/school/school-csv.ts`
- Create: `web/src/app/(user)/school/school-csv.test.ts`
- Modify: `web/src/app/(user)/school/school-administration.tsx`
- Modify: `web/src/app/(user)/school/school-administration.test.tsx`
- Modify: `web/src/lib/school-domain.ts`
- Modify: `web/src/services/api/school.ts`
- Create: `web/src/lib/server/database/school-member-import-repository.ts`
- Create: `web/src/lib/server/database/school-member-import-repository.test.ts`
- Modify: `web/src/lib/server/database/schema-school-domain.ts`
- Modify: `docs/content/docs/backend/backend-database.mdx`

### 学校课程与 IP 库

- Modify: `web/src/lib/server/school-course-service.ts`
- Modify: `web/src/lib/server/school-domain-repository.ts`
- Modify: `web/src/lib/server/database/school-domain-repository.ts`
- Modify: `web/src/lib/server/school-domain-file-repository.ts`
- Modify: course route tests under `web/src/app/api/school/`
- Modify: `web/src/lib/server/ip-library-access-service.ts`
- Modify: `web/src/lib/server/ip-library-download-service.ts`
- Modify: `web/src/lib/server/ip-library-service.ts`
- Modify: `web/src/lib/server/ip-library-reference-service.ts`
- Modify: `web/src/lib/server/database/ip-library-repository.ts`
- Create: `web/src/lib/server/database/ip-library-repository.test.ts`
- Modify: `web/src/lib/server/database/schema-ip-library.ts`
- Modify: `web/src/lib/server/ip-library-download-service.test.ts`
- Modify: `web/src/lib/server/ip-library-service.test.ts`
- Create: `web/src/lib/server/ip-library-reference-service.test.ts`

### 无限练习、任务与媒体

- Create: `web/src/lib/server/practice-tenant-scope.ts`
- Create: `web/src/lib/server/practice-tenant-scope.test.ts`
- Create: `web/src/lib/server/practice-reference-authorization.ts`
- Create: `web/src/lib/server/practice-reference-authorization.test.ts`
- Create: `web/src/lib/server/practice-tenant-cleanup.ts`
- Create: `web/src/lib/server/practice-tenant-cleanup.test.ts`
- Create: `web/scripts/cleanup-practice-data.mjs`
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
- Modify: `web/src/app/api/canvas/projects/[id]/route.ts`
- Modify: `web/src/app/api/drama/projects/[id]/route.ts`
- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `web/package.json`
- Modify: `docs/content/docs/backend/backend-database.mdx`

### 端到端与开发文档

- Create: `web/e2e/school-tenant-security.spec.ts`
- Create: `web/e2e/infinite-practice-tenant-isolation.spec.ts`
- Regenerate: `VOZEB-PRO-接口索引.md` and `VOZEB-PRO-开发地图.md` only through repository update scripts

---

## Task 1：禁止学校管理员自删、自禁用、自降权

**Files:**
- Modify: `web/src/lib/server/school-tenant-service.ts`
- Modify: `web/src/lib/server/school-tenant-service.test.ts`
- Modify: `web/src/app/api/school/members/[id]/route.ts`
- Create: `web/src/app/api/school/members/[id]/route.test.ts`
- Modify: `web/src/app/(user)/school/school-administration.tsx`
- Modify: `web/src/app/(user)/school/school-administration.test.tsx`

**接口契约：**

```ts
const SELF_MANAGEMENT_ERROR = "不能在成员管理中删除、禁用或取消自己的管理权限，请由另一名学校管理员操作";
```

- `removeSchoolMember(managerId, membershipId)` 在目标 `userId === managerId` 时返回 HTTP 409。
- `updateSchoolMember(managerId, membershipId, patch)` 在目标为本人且 patch 会禁用、改为 student 或移除 `school.manage` 时返回同一错误。
- 学校至少保留一名可用管理员的既有规则继续保留，但不能替代自我操作禁止规则。
- 页面识别当前操作者，禁用本人“移出”“禁用”“取消管理”和“降为学生”入口；其他成员的现有确认弹窗和操作保持不变。

- [ ] **Step 1：写失败测试**

在 Service 和 Route Handler 测试中准备学校 A、管理员 A、管理员 B 和对应 membership，断言 A 对自己执行四种危险操作都返回 409、Repository 不发生写入；A 操作 B 仍能进入原有校验。

- [ ] **Step 2：运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/school-tenant-service.test.ts" "src/app/api/school/members/[id]/route.test.ts"
```

Expected: 新增自我操作断言失败。

- [ ] **Step 3：实现 Service 防线**

目标 membership 加锁读取后先比较 `membership.userId` 与 `managerId`，在任何 update/delete mutation 前拒绝危险操作；正常读取和对其他成员操作不受影响。

- [ ] **Step 4：实现 UI 防误触**

从当前登录用户或学校上下文取得本人 user ID，为本人行增加“当前操作者”标识并禁用危险按钮，同时显示由另一名管理员操作的说明。

- [ ] **Step 5：验证并提交**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/school-tenant-service.test.ts" "src/app/api/school/members/[id]/route.test.ts"
pnpm --dir web exec vitest run "src/app/(user)/school/school-administration.test.tsx"
git add "web/src/lib/server/school-tenant-service.ts" "web/src/lib/server/school-tenant-service.test.ts" "web/src/app/api/school/members/[id]/route.ts" "web/src/app/api/school/members/[id]/route.test.ts" "web/src/app/(user)/school/school-administration.tsx" "web/src/app/(user)/school/school-administration.test.tsx"
git commit -m "fix(school): block administrator self-management"
```

## Task 2：成员导入模板、逐行预检和整批原子提交

**Files:**
- Modify: `web/src/app/(user)/school/school-csv.ts`
- Create: `web/src/app/(user)/school/school-csv.test.ts`
- Modify: `web/src/app/(user)/school/school-administration.tsx`
- Modify: `web/src/app/(user)/school/school-administration.test.tsx`
- Modify: `web/src/lib/server/school-member-provisioning-service.ts`
- Modify: `web/src/app/api/school/members/import/route.ts`
- Modify: `web/src/app/api/school/members/import/route.test.ts`
- Modify: `web/src/lib/school-domain.ts`
- Modify: `web/src/services/api/school.ts`
- Create: `web/src/lib/server/database/school-member-import-repository.ts`
- Create: `web/src/lib/server/database/school-member-import-repository.test.ts`
- Modify: `web/src/lib/server/database/schema-school-domain.ts`
- Modify: `docs/content/docs/backend/backend-database.mdx`

**接口契约：**

```ts
type SchoolMemberImportError = {
  row: number;
  field?: "username" | "displayName" | "password" | "role";
  code: string;
  message: string;
};

type SchoolMemberCsvResult =
  | { ok: true; rows: SchoolMemberCreateInput[] }
  | { ok: false; errors: SchoolMemberImportError[] };

previewSchoolMemberImport(managerId: string, rows: SchoolMemberCreateInput[]): Promise<{
  total: number;
  valid: number;
  invalid: number;
  errors: SchoolMemberImportError[];
  previewToken: string;
}>;

importSchoolMembers(managerId: string, rows: SchoolMemberCreateInput[], previewToken: string): Promise<{
  batchId: string;
  imported: number;
  total: number;
}>;
```

- CSV 列固定为 `username,displayName,password,role`。
- `displayName` 为空立即报错，不能回退为 username。
- `role` 只接受 `student` 或 `teacher`，预览阶段定位到具体行。
- 预览 token 为不透明值或签名摘要，不含密码；rows 改变后 token 无效。
- 任意错误都阻止正式导入；全部通过后在一个事务内创建账号、membership 和成功批次。
- 数据库异常整体回滚；失败批次只记录错误摘要和逐行错误，不记录密码。

- [ ] **Step 1：写失败测试**

断言空姓名、中文角色、文件内重复用户名、已有账号冲突、已加入学校账号都在预览阶段返回行号/字段/错误码；断言任意错误不会调用账号创建，全部通过只执行一次事务。

- [ ] **Step 2：运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/app/(user)/school/school-csv.test.ts" "src/lib/server/school-member-provisioning-service.test.ts" "src/app/api/school/members/import/route.test.ts" "src/lib/server/database/school-member-import-repository.test.ts"
```

Expected: 当前 parser 和导入服务尚无逐行预检、token 和批次能力。

- [ ] **Step 3：实现 CSV 预检**

保留 Papa Parse 的成熟解析能力，增加 UTF-8 fatal 解码、固定表头、列数、空行、必填字段、用户名、密码、角色、重复和账号冲突校验；返回稳定的 row/field/code/message 结构。

- [ ] **Step 4：增加批次和错误明细**

新增 `school_member_import_batches` 与 `school_member_import_errors`。批次记录学校、操作人、文件名、状态、总数、成功数、失败数和时间；错误表记录批次、行号、字段、错误码和文案。禁止 password 进入数据库、审计、日志和响应。

- [ ] **Step 5：接入全量预检和事务导入**

预览时创建带过期时间的 token；正式导入重新计算 rows fingerprint 并验证 token，再在一个事务中调用账号和 membership 写入。任一失败回滚全部账号和 membership，并将批次标记为 failed。

- [ ] **Step 6：补充后台模板和预览**

成员导入 Drawer 提供模板下载、示例、字段说明、角色说明、总数/有效/错误统计和逐行错误表；存在错误时确认按钮禁用。

- [ ] **Step 7：验证并提交**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/app/(user)/school/school-csv.test.ts" "src/lib/server/school-member-provisioning-service.test.ts" "src/app/api/school/members/import/route.test.ts" "src/lib/server/database/school-member-import-repository.test.ts"
pnpm --dir web exec vitest run "src/app/(user)/school/school-administration.test.tsx"
pnpm --dir web run typecheck
git add "web/src/app/(user)/school" "web/src/lib/server/school-member-provisioning-service.ts" "web/src/app/api/school/members/import" "web/src/lib/school-domain.ts" "web/src/services/api/school.ts" "web/src/lib/server/database/schema-school-domain.ts" "web/src/lib/server/database/school-member-import-repository.ts" "web/src/lib/server/database/school-member-import-repository.test.ts" "docs/content/docs/backend/backend-database.mdx"
git commit -m "fix(school): validate member imports atomically"
```

## Task 3：班级停用后的课程历史只读和学校边界 SQL

**Files:**
- Modify: `web/src/lib/server/school-course-service.ts`
- Modify: `web/src/lib/server/school-domain-repository.ts`
- Modify: `web/src/lib/server/database/school-domain-repository.ts`
- Modify: `web/src/lib/server/school-domain-file-repository.ts`
- Modify: `web/src/app/api/school/courses/[id]/materials/route.ts`
- Modify: `web/src/app/api/school/course-materials/[id]/route.ts`
- Create: `web/src/app/api/school/course-materials/[id]/route.test.ts`
- Modify: `web/src/lib/server/school-course-service.test.ts`
- Modify: `web/src/lib/server/database/school-domain-repository.test.ts`
- Modify: `web/src/lib/server/school-domain-file-repository.test.ts`

**接口契约：**

- 班级 `active`：按既有职责允许读取和教学写入。
- 班级 `disabled`：历史成员仍可读取历史课程、资料、教学任务、提交和批改；所有教学写入返回 409：`班级已停用，历史记录仅可查看`。
- 学校资料更新和删除必须使用服务端取得的 `schoolId` 作为最终 Repository 条件。
- 平台资料仍走平台管理员的 platform 分支，不受学校资料条件误伤。

- [ ] **Step 1：写失败测试**

准备学校 A、学校 B、A 的 active/disabled 班级、课程安排、负责老师和资料，覆盖：

```text
停用班级后上传资料：409
停用班级后修改资料：409
停用班级后删除资料：409
停用班级后读取课程树：成功
停用班级后读取已有资料：成功
学校 A 更新学校 B 的资料 ID：拒绝，B 数据不变
学校 A 删除学校 B 的资料 ID：拒绝，B 数据不变
```

- [ ] **Step 2：运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/school-course-service.test.ts" "src/lib/server/database/school-domain-repository.test.ts" "src/lib/server/school-domain-file-repository.test.ts" "src/app/api/school/course-materials/[id]/route.test.ts"
```

Expected: 当前资料写权限没有统一检查班级状态，Repository 的 update/delete 只按资料 ID。

- [ ] **Step 3：加入班级状态写校验**

在学校资料上传、修改、删除的 service 路径中读取课程 offering 的 `classId`，再读取该校班级并要求 `status='active'`。读取历史内容使用只读查询，不复用写入权限 helper。

- [ ] **Step 4：收紧 PostgreSQL Repository**

把 Repository 方法调整为接收学校作用域，例如：

```ts
updateCourseMaterial(materialId: string, schoolId: string | undefined, patch: CourseMaterialUpdate): Promise<CourseMaterialRecord | null>;
deleteCourseMaterial(materialId: string, schoolId?: string): Promise<boolean>;
```

学校资料 SQL 使用 `material.id + school course assignment.school_id` 条件；platform 资料使用明确的 platform 分支。返回 0 行时由 Service 转换为资料不存在或无权访问。

- [ ] **Step 5：收紧 JSON fallback**

文件 Repository 同样用 `schoolId + materialId` 定位学校资料；不能只用资料 ID 修改或删除。补充学校 A/B 的文件存储回归。

- [ ] **Step 6：运行验证并提交**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/school-course-service.test.ts" "src/lib/server/database/school-domain-repository.test.ts" "src/lib/server/school-domain-file-repository.test.ts" "src/app/api/school/course-materials/[id]/route.test.ts"
pnpm --dir web run typecheck
git add "web/src/lib/server/school-course-service.ts" "web/src/lib/server/school-domain-repository.ts" "web/src/lib/server/database/school-domain-repository.ts" "web/src/lib/server/school-domain-file-repository.ts" "web/src/app/api/school/courses/[id]/materials/route.ts" "web/src/app/api/school/course-materials/[id]/route.ts" "web/src/app/api/school/course-materials/[id]/route.test.ts"
git commit -m "fix(course): enforce disabled-class and school boundaries"
```

## Task 4：IP 可见封面与公共下载学校审计

**Files:**
- Modify: `web/src/lib/server/ip-library-access-service.ts`
- Modify: `web/src/lib/server/ip-library-download-service.ts`
- Modify: `web/src/lib/server/database/ip-library-repository.ts`
- Create: `web/src/lib/server/database/ip-library-repository.test.ts`
- Modify: `web/src/lib/server/database/schema-ip-library.ts`
- Modify: `web/src/lib/server/ip-library-download-service.test.ts`
- Modify: `web/src/lib/server/ip-library-service.test.ts`
- Modify: existing route tests under `web/src/app/api/ip-library/`

**接口契约：**

- `requireVisibleIp` 继续返回当前用户可见的子 IP 和当前学校上下文。
- 学校用户请求 IP 包级封面时，不能无条件读取 `ip_packages.cover_file_id`。
- 如果全局封面属于当前可见子 IP，继续返回该封面；否则按 `subIp.sortOrder, createdAt, id` 选择第一个可见子 IP 的 ready 图片封面；没有可见封面时返回默认占位。
- 下载记录的 `schoolId` 由当前 active school context 推导；请求体和 query 的学校字段全部忽略。

- [ ] **Step 1：写失败测试**

准备 IP 包、子 IP A/B、两张封面和只授权 B 的学校，断言：

```text
访问包级封面不能返回 A 的文件
B 有封面时返回 B 的文件
可见子 IP 没有封面时返回默认占位
学校 A 用户下载公共 IP 的记录 schoolId=A
无学校用户下载公共 IP 的记录 schoolId=NULL
客户端传入 schoolId=B 不能改变学校 A 的记录
```

- [ ] **Step 2：运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/ip-library-download-service.test.ts" "src/lib/server/ip-library-service.test.ts" "src/lib/server/database/ip-library-repository.test.ts" "src/app/api/ip-library"
```

Expected: 当前包级封面路径直接使用 IP 本体的 `coverFileId`，下载上下文缺少完整学校回归。

- [ ] **Step 3：统一可见封面解析**

在学校可见子 IP 已确定的范围内查询封面文件与子 IP 关系；禁止先查授权子 IP、再脱离可见范围读取包级封面。查询必须保持定向 SQL，不读取全量 IP 文件到 Node.js 筛选。

- [ ] **Step 4：固定下载审计上下文**

`downloadIpForUser` 只使用 `requireVisibleIp` 返回的 `schoolId`。成功和失败下载都使用同一份上下文；无学校身份的公共下载保持 `NULL`，但不能由客户端指定学校。

- [ ] **Step 5：运行验证并提交**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/ip-library-download-service.test.ts" "src/lib/server/ip-library-service.test.ts" "src/lib/server/database/ip-library-repository.test.ts" "src/app/api/ip-library"
pnpm --dir web run typecheck
git add "web/src/lib/server/ip-library-access-service.ts" "web/src/lib/server/ip-library-download-service.ts" "web/src/lib/server/database/ip-library-repository.ts" "web/src/lib/server/database/schema-ip-library.ts" "web/src/app/api/ip-library"
git commit -m "fix(ip): enforce visible cover and school download audit"
```

## Task 5：IP 使用记录 targetId 真实性校验

**Files:**
- Modify: `web/src/lib/server/ip-library-service.ts`
- Modify: `web/src/lib/server/ip-library-reference-service.ts`
- Modify: `web/src/lib/server/database/ip-library-repository.ts` only if narrow target queries are needed
- Create: `web/src/lib/server/ip-library-reference-service.test.ts`
- Modify: `web/src/lib/server/ip-library-service.test.ts`

**接口契约：**

- action=`reference` 时必须先验证 target，再创建 usage record。
- `canvas`、`drama` 和 `practice` target 必须真实存在，属于当前用户和当前学校，并符合 `execution_profile='open-source-practice'`。
- targetType 与目标实体不匹配时拒绝。
- 失败不写 usage、不增加统计、不记录成功审计。

- [ ] **Step 1：写失败测试**

覆盖：

```text
用户 A 使用用户 B 的 Canvas targetId：拒绝
用户 A 使用学校 B 的 Drama targetId：拒绝
practice targetId 不存在：拒绝
空 targetId：拒绝
错误 targetType：拒绝
合法 target：写入 schoolId=A 的 usage
```

- [ ] **Step 2：运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/ip-library-service.test.ts" "src/lib/server/ip-library-reference-service.test.ts"
```

Expected: 当前实现只校验 targetId 非空，没有验证目标归属。

- [ ] **Step 3：实现窄目标查询**

按 targetType 调用对应项目或 Session 的定向查询，使用 `userId + schoolId + executionProfile` 条件；禁止先读取整张业务表后在 Node.js 过滤。Practice 目标需要兼容当前 Session/project 两种调用方式，但都必须通过当前用户和学校作用域。

- [ ] **Step 4：调整 usage 写入顺序**

先完成 IP 授权和 target 校验，再创建 usage record；保留现有幂等 ID 规则，但幂等命中不能掩盖目标不存在或越权。

- [ ] **Step 5：运行验证并提交**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/ip-library-service.test.ts" "src/lib/server/ip-library-reference-service.test.ts"
pnpm --dir web run typecheck
git add "web/src/lib/server/ip-library-service.ts" "web/src/lib/server/ip-library-reference-service.ts" "web/src/lib/server/database/ip-library-repository.ts"
git commit -m "fix(ip): validate usage target ownership"
```
