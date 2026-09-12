# 学校租户安全与权限 Bug 修复实施计划

> **给执行 Agent：** 必须使用 `superpowers:executing-plans` 按任务顺序执行本计划。每个任务先写失败测试，再写最小实现，再运行对应验证；不得回滚或覆盖工作区已有的其他改动。

**目标：** 修复学校管理员自我失权、成员导入不完整、停用班级仍可写课程资料、IP 授权和审计边界不完整，以及无限练习缺少学校作用域和普通素材前置授权等问题。

**架构：** 复用当前 Next.js Route Handler、Service、Repository、PostgreSQL 和 JSON fallback。服务端从当前 active school membership 推导不可变 `PracticeTenantScope { schoolId, ownerUserId }`；practice 主记录、任务、日志和练习媒体保存学校作用域，并在读写、重试、恢复和媒体签名前同时校验学校与个人。课程和 IP 由 Service 做业务状态检查，Repository 在最终 SQL 中带学校条件。当前环境和测试环境的旧 practice 存量按明确 execution profile 清理，不推断旧学校归属，也不迁移到当前学校。

**技术栈：** Next.js App Router、TypeScript、React、Ant Design、PostgreSQL、JSON file fallback、Vitest、Playwright、参数化 SQL、现有学校/IP/媒体服务。

## Global Constraints

- `school_id`、`membership_id`、`owner_user_id` 只能由服务端当前 Session 和 active membership 推导，客户端同名字段不得覆盖。
- 无限练习采用“学校作用域、个人所有”：访问必须满足当前 `school_id` 与当前 `user_id` 同时匹配。
- 当前环境和测试环境已有 practice 存量统一清理；不推断旧数据学校归属，不把旧数据自动迁移到当前学校。
- 清理只针对明确的 `open-source-practice` 数据及其练习关联，不得删除正式 Canvas/Drama、正式任务、课程、IP、作品或普通个人素材。
- 普通 `asset` 必须存在、未过期、属于当前用户、绑定当前学校且真实类型匹配；课程资料、IP、项目协作素材必须使用明确业务引用类型。
- 学校停用、membership 停用、班级停用和课程/IP 授权撤销必须在服务端生效，不能只隐藏前端按钮。
- 课程资料最终 UPDATE/DELETE 必须带学校边界；IP usage 的 target 必须真实存在并通过用户/学校归属验证。
- 学校管理员不能在成员管理中删除、禁用或取消自己的学校管理权限；必须由另一名学校管理员操作。
- 班级停用后历史业务允许只读，新增教学写入全部拒绝。
- 不改变正式 production 项目的既有个人所有权和计费规则。
- 无限练习页面不做视觉重做；只有为传递服务端学校作用域所需的最小请求字段或错误处理调整才允许修改调用方。
- PostgreSQL 已部署环境使用有序幂等升级：已有表先 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`，再清理、回填、约束和索引；不得删库或重建数据卷。
- 共享 PostgreSQL 测试文件使用 `--no-file-parallelism`。
- 中文源码、脚本和文档保存为 UTF-8；不得覆盖无关未提交改动。

## 文件变更总览

### 学校管理员与成员导入

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
- Modify: `web/src/app/api/school/courses/[id]/materials/route.ts`
- Modify: `web/src/app/api/school/course-materials/[id]/route.ts`
- Create: `web/src/app/api/school/course-materials/[id]/route.test.ts`
- Modify: `web/src/lib/server/school-course-service.test.ts`
- Modify: `web/src/lib/server/database/school-domain-repository.test.ts`
- Modify: `web/src/lib/server/school-domain-file-repository.test.ts`
- Modify: `web/src/lib/server/ip-library-access-service.ts`
- Modify: `web/src/lib/server/ip-library-download-service.ts`
- Modify: `web/src/lib/server/ip-library-service.ts`
- Modify: `web/src/lib/server/ip-library-reference-service.ts`
- Modify: `web/src/lib/server/database/ip-library-repository.ts`
- Modify: `web/src/lib/server/ip-library-file-repository.test.ts`
- Modify: `web/src/lib/server/school-ip-library-service.test.ts`
- Modify: `web/src/lib/server/ip-library-download-service.test.ts`
- Modify: `web/src/lib/server/ip-library-service.test.ts`
- Modify: `web/src/lib/server/database/schema-ip-library.ts`

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
- Modify: `web/src/app/api/reference-assets/route.ts` only for explicit practice upload scope
- Modify: `web/src/services/file-storage.ts` only for explicit practice upload scope
- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `web/package.json`
- Modify: `docs/content/docs/backend/backend-database.mdx`

### 端到端与开发文档

- Create: `web/e2e/school-tenant-security.spec.ts`
- Create: `web/e2e/infinite-practice-tenant-isolation.spec.ts`
- Regenerate: `VOZEB-PRO-接口索引.md` and `VOZEB-PRO-开发地图.md` through repository scripts only

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

- `removeSchoolMember(managerId, membershipId)` 在目标 `membership.userId === managerId` 时返回 409。
- `updateSchoolMember(managerId, membershipId, patch)` 只有在目标为本人且 patch 会禁用、改为 student 或移除 `school.manage` 时返回 409。
- 正常读取本人信息和修改不影响管理资格的普通资料不在本次范围内。
- 前端对本人显示“当前操作者”，禁用移出、禁用、取消管理和降为学生动作；后端拒绝绕过请求。

- [ ] **Step 1：写失败测试**

准备管理员 A、管理员 B 和同校 membership，断言：

```ts
await expect(removeSchoolMember("user-a", "membership-a")).rejects.toMatchObject({ status: 409, message: SELF_MANAGEMENT_ERROR });
await expect(updateSchoolMember("user-a", "membership-a", { status: "disabled", updatedAt: now })).rejects.toMatchObject({ status: 409 });
await expect(updateSchoolMember("user-a", "membership-a", { role: "student", updatedAt: now })).rejects.toMatchObject({ status: 409 });
await expect(updateSchoolMember("user-a", "membership-a", { permissions: [], updatedAt: now })).rejects.toMatchObject({ status: 409 });
```

同时断言管理员 A 操作管理员 B 仍进入原有权限和管理员人数规则，Route Handler 返回 409 且 Repository 不发生写入。

- [ ] **Step 2：运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/school-tenant-service.test.ts" "src/app/api/school/members/[id]/route.test.ts"
```

Expected: 新增自我操作断言失败。

- [ ] **Step 3：实现 Service 防线**

在锁定目标 membership 后、任何 update/delete mutation 前比较目标用户 ID 与操作者 ID；危险 patch 统一抛出 `SELF_MANAGEMENT_ERROR`。保留学校至少一名可用管理员规则。

- [ ] **Step 4：实现后台防误触**

从当前登录 Session 或学校上下文取得本人 user ID，成员行增加“当前操作者”标识；本人危险按钮不可点击，并提供“请由另一名学校管理员操作”的说明。对其他成员保留现有确认弹窗。

- [ ] **Step 5：运行验证**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/school-tenant-service.test.ts" "src/app/api/school/members/[id]/route.test.ts"
pnpm --dir web exec vitest run "src/app/(user)/school/school-administration.test.tsx"
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
  code: "missing_header" | "required" | "invalid" | "duplicate" | "conflict" | "encoding";
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

importSchoolMembers(managerId: string, rows: SchoolMemberCreateInput[], previewToken: string, fileName?: string): Promise<{
  batchId: string;
  imported: number;
  total: number;
}>;
```

- CSV 固定列为 `username,displayName,password,role`。
- `displayName` 为空返回 `required`，不能回退为 username。
- `role` 只接受 `student` 或 `teacher`，中文“老师/学生”在预览阶段报错。
- preview token 不保存密码；rows、学校或操作者改变后 token 无效。
- 任意错误都阻止正式导入；全部通过后在一个事务内创建用户、membership 和成功批次。
- 数据库异常整体回滚；失败批次记录错误摘要和逐行错误，但不得记录密码。

- [ ] **Step 1：写失败测试**

断言以下输入都能返回行号、字段和错误码：空姓名、中文角色、文件内重复用户名、已有账号冲突、账号已加入学校、UTF-8 解码失败。断言有任意错误时不调用账号创建；全部通过时只执行一次事务。

- [ ] **Step 2：运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/app/(user)/school/school-csv.test.ts" "src/lib/server/school-member-provisioning-service.test.ts" "src/app/api/school/members/import/route.test.ts" "src/lib/server/database/school-member-import-repository.test.ts"
```

Expected: 当前 parser 和导入服务没有逐行预检、preview token 和批次明细。

- [ ] **Step 3：实现逐行 CSV 解析**

继续使用 Papa Parse；在调用前对文件内容做 UTF-8 fatal 解码，保留固定表头和列数校验，返回行号从 CSV 表头后的第一条数据行开始计数。`displayName` 和 `role` 都在客户端预览与服务端预检各校验一次。

- [ ] **Step 4：增加批次和错误明细表**

新增幂等表 `school_member_import_batches`、`school_member_import_errors`。批次表保存学校、操作者、文件名、状态、总数、成功数、失败数和时间；错误表保存 batch ID、行号、字段、错误码和文案。禁止保存密码。

- [ ] **Step 5：实现全量预检和事务导入**

预检阶段检查当前学校、现有用户和 membership 冲突，并生成 rows fingerprint。正式导入验证 fingerprint 后，在同一事务中创建全部用户、membership 和批次结果；任一行失败回滚整批。

- [ ] **Step 6：补充后台模板和预览**

成员导入 Drawer 提供模板下载、示例、字段说明、角色说明、总行数/有效行数/错误行数和逐行错误表；存在错误时确认按钮不可用，不直接调用正式导入。

- [ ] **Step 7：运行验证**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/app/(user)/school/school-csv.test.ts" "src/lib/server/school-member-provisioning-service.test.ts" "src/app/api/school/members/import/route.test.ts" "src/lib/server/database/school-member-import-repository.test.ts"
pnpm --dir web exec vitest run "src/app/(user)/school/school-administration.test.tsx"
pnpm --dir web run typecheck
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

在学校资料上传、修改、删除的 Service 路径中读取课程 offering 的 `classId`，再读取该校班级并要求 `status='active'`。读取历史内容使用只读查询，不复用写入权限 helper。

- [ ] **Step 4：收紧 PostgreSQL Repository**

把 Repository 方法调整为接收学校作用域：

```ts
updateCourseMaterial(materialId: string, schoolId: string | undefined, patch: CourseMaterialUpdate): Promise<CourseMaterialRecord | null>;
deleteCourseMaterial(materialId: string, schoolId?: string): Promise<boolean>;
```

学校资料 SQL 使用 `material.id + school_course_assignments.school_id` 条件；platform 资料使用明确的 platform 分支。返回 0 行时由 Service 转换为资料不存在或无权访问。

- [ ] **Step 5：收紧 JSON fallback**

文件 Repository 同样用 `schoolId + materialId` 定位学校资料，不能只用资料 ID 修改或删除。补充跨学校文件存储回归。

- [ ] **Step 6：运行验证**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/school-course-service.test.ts" "src/lib/server/database/school-domain-repository.test.ts" "src/lib/server/school-domain-file-repository.test.ts" "src/app/api/school/course-materials/[id]/route.test.ts"
pnpm --dir web run typecheck
```

## Task 4：IP 可见封面与公共下载学校审计

**Files:**
- Modify: `web/src/lib/server/ip-library-access-service.ts`
- Modify: `web/src/lib/server/ip-library-download-service.ts`
- Modify: `web/src/lib/server/database/ip-library-repository.ts`
- Modify: `web/src/lib/server/ip-library-file-repository.test.ts`
- Modify: `web/src/lib/server/school-ip-library-service.test.ts`
- Modify: `web/src/lib/server/ip-library-download-service.test.ts`
- Modify: `web/src/lib/server/ip-library-service.test.ts`
- Modify: `web/src/lib/server/database/schema-ip-library.ts`
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
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/ip-library-download-service.test.ts" "src/lib/server/ip-library-service.test.ts" "src/lib/server/ip-library-file-repository.test.ts" "src/lib/server/school-ip-library-service.test.ts"
```

Expected: 当前包级封面路径直接使用 IP 本体的 `coverFileId`，下载上下文缺少完整学校回归。

- [ ] **Step 3：统一可见封面解析**

在学校可见子 IP 已确定的范围内查询封面文件与子 IP 关系；禁止先查授权子 IP、再脱离可见范围读取包级封面。查询保持定向 SQL，不读取全量 IP 文件到 Node.js 筛选。

- [ ] **Step 4：固定下载审计上下文**

`downloadIpForUser` 只使用 `requireVisibleIp` 返回的 `schoolId`。成功和失败下载都使用同一份上下文；无学校身份的公共下载保持 `NULL`，但不能由客户端指定学校。

- [ ] **Step 5：运行验证**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/ip-library-download-service.test.ts" "src/lib/server/ip-library-service.test.ts" "src/lib/server/ip-library-file-repository.test.ts" "src/lib/server/school-ip-library-service.test.ts"
pnpm --dir web run typecheck
```

## Task 5：IP 使用记录 targetId 真实性校验

**Files:**
- Modify: `web/src/lib/server/ip-library-service.ts`
- Modify: `web/src/lib/server/ip-library-reference-service.ts`
- Modify: `web/src/lib/server/database/ip-library-repository.ts` only for narrow target lookup methods
- Modify: `web/src/lib/server/ip-library-service.test.ts`
- Create: `web/src/lib/server/ip-library-reference-service.test.ts`

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

按 targetType 调用对应项目或 Session 的定向查询，使用 `userId + schoolId + executionProfile` 条件；禁止先读取整张业务表后在 Node.js 过滤。Practice 目标兼容当前 Session/project 两种调用方式，但都必须通过当前用户和学校作用域。

- [ ] **Step 4：调整 usage 写入顺序**

先完成 IP 授权和 target 校验，再创建 usage record；保留现有幂等 ID 规则，但幂等命中不能掩盖目标不存在或越权。

- [ ] **Step 5：运行验证**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/ip-library-service.test.ts" "src/lib/server/ip-library-reference-service.test.ts"
pnpm --dir web run typecheck
```

## Task 6：无限练习 Scope、Schema 和存量清理

**Files:**
- Create: `web/src/lib/server/practice-tenant-scope.ts`
- Create: `web/src/lib/server/practice-tenant-scope.test.ts`
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
- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `web/package.json`
- Modify: `docs/content/docs/backend/backend-database.mdx`

**接口契约：**

```ts
type PracticeTenantScope = {
  schoolId: string;
  ownerUserId: string;
};

requirePracticeTenant(actor: PracticeActor): Promise<PracticeTenantScope>;
```

- Scope 只从 `requireActiveSchoolContext(actor.id)` 推导；客户端 `schoolId`、`membershipId` 和 `ownerUserId` 不得覆盖。
- `practice_sessions`、practice Canvas、practice Drama、`practice_script_projects` 创建时写入 `school_id`；剧本版本、实体、阶段、Agent 操作、任务、日志和 practice 媒体注册记录必须能够追溯同一学校。
- `school_id` 与 owner 创建后不可修改；离开学校后旧数据不可读，加入新学校后不能看到旧学校数据。
- 当前环境和测试环境已有 practice 存量统一清理，不做历史学校归属推断或迁移。

- [ ] **Step 1：写失败测试**

覆盖：active teacher/student 得到 schoolId 和 ownerUserId；disabled school/membership 拒绝；客户端提交的学校字段不影响写入；A 创建数据后保存 `school_id=A`；B context 读取、编辑、删除和重试 A 数据均返回 404；cleanup dry-run 不包含正式数据。

- [ ] **Step 2：运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/practice-tenant-scope.test.ts" "src/lib/server/practice-tenant-cleanup.test.ts" "src/lib/server/practice-session-service.test.ts" "src/lib/server/database/practice-repository.test.ts" "src/lib/server/database/script-practice-repository.test.ts"
```

Expected: 当前 practice 主记录没有完整 school scope，读取条件主要按 user/id。

- [ ] **Step 3：按顺序升级 Schema**

对现有表先执行 `ALTER TABLE <existing_table> ADD COLUMN IF NOT EXISTS school_id text`，再执行 practice 存量清理、回填/约束、索引。需要覆盖：

```text
practice_sessions
canvas_projects
 drama_projects
practice_copy_requests
practice_script_projects
practice_script_versions
practice_script_entities
practice_script_stages
practice_script_agent_operations
generation_tasks
generation_logs
creative_conversations
local_media_assets
```

混合 production/practice 表使用条件约束：practice 行必须有 `school_id`，production 行保留既有可空语义；practice-only 表在清理旧行后设置 `school_id NOT NULL`。新增索引必须匹配真实查询，例如 `(school_id, user_id, updated_at DESC)`。

- [ ] **Step 4：实现 Scope 创建和双重过滤**

所有 practice create/list/get/update/delete/claim/retry/recovery 查询使用 `school_id + user_id`；普通 production 分支保持原有 user ownership。Canvas、Drama、Script 普通入口遇到 practice profile 时复核当前 active school context。

- [ ] **Step 5：实现存量 cleanup**

`practice-tenant-cleanup.ts` 同时支持 PostgreSQL 和 JSON fallback。PostgreSQL 使用明确 execution profile 和关联 ID 集合按“子表/日志资产/任务 → 主表”顺序删除；媒体删除前调用引用计数，只删除没有正式课程、作品、个人素材、production task 或其他业务引用的文件。CLI 支持：

```powershell
pnpm --dir web cleanup:practice-data -- --dry-run
pnpm --dir web cleanup:practice-data -- --confirm
```

正式清理必须显式确认，输出每类删除数量、保留原因和错误；不能默认删除。

- [ ] **Step 6：运行验证并提交**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/practice-tenant-scope.test.ts" "src/lib/server/practice-tenant-cleanup.test.ts" "src/lib/server/practice-session-service.test.ts" "src/lib/server/database/practice-repository.test.ts" "src/lib/server/database/script-practice-repository.test.ts" "src/lib/server/database/postgres.test.ts"
pnpm --dir web run typecheck
pnpm --dir web run lint -- --quiet
git add "web/src/lib/server/practice-tenant-scope.ts" "web/src/lib/server/practice-tenant-scope.test.ts" "web/src/lib/server/practice-tenant-cleanup.ts" "web/src/lib/server/practice-tenant-cleanup.test.ts" "web/scripts/cleanup-practice-data.mjs" "web/src/lib/server/practice-access-service.ts" "web/src/lib/server/practice-project-service.ts" "web/src/lib/server/practice-session-service.ts" "web/src/lib/server/database/practice-repository.ts" "web/src/lib/server/database/script-practice-repository.ts" "web/src/lib/server/script-practice-service.ts" "web/src/lib/server/canvas-project-store.ts" "web/src/lib/server/drama-project-store.ts" "web/src/lib/server/database/schema.ts" "web/package.json" "docs/content/docs/backend/backend-database.mdx"
git commit -m "fix(practice): persist school tenant scope"
```

## Task 7：普通 asset 和业务引用的创建前授权

**Files:**
- Create: `web/src/lib/server/practice-reference-authorization.ts`
- Create: `web/src/lib/server/practice-reference-authorization.test.ts`
- Modify: `web/src/lib/server/practice-session-service.ts`
- Modify: `web/src/app/api/practice/sessions/route.ts`
- Modify: `web/src/app/api/practice/sessions/[id]/route.ts`
- Modify: `web/src/lib/server/local-media-registry.ts`
- Modify: `web/src/lib/server/reference-asset-store.ts`
- Modify: `web/src/lib/server/ip-library-reference-service.ts`
- Modify: existing practice route/service tests

**接口契约：**

```ts
type PracticeReferenceInput = {
  type: "asset" | "ip" | "course-material" | "project-asset";
  id: string;
  inputKey?: string;
};

type VerifiedPracticeReference = {
  type: PracticeReferenceInput["type"];
  id: string;
  inputKey?: string;
  mediaType?: "image" | "video" | "audio";
  storageKey?: string;
};

validatePracticeReferences(
  scope: PracticeTenantScope,
  module: PracticeModuleKind,
  input: Record<string, unknown>,
  references: unknown[],
): Promise<VerifiedPracticeReference[]>;
```

- 普通 `asset` 必须查 `local_media_assets` registration，验证 owner、school、scope、有效期和真实 type。
- `ip` 继续使用现有学校/IP 授权；`course-material` 和 `project-asset` 使用各自业务授权，不转成普通 asset。
- 图片槽只能接收 image，`audio` 槽只能接收 audio；不信任客户端 URL、mime、文件名或 storage key 前缀。
- 创建、重试、恢复和向上游签发媒体 URL 前都重新验证。

- [ ] **Step 1：写失败测试**

覆盖：本人当前学校 image registration + image slot 允许；其他用户/学校拒绝；无 schoolId 历史媒体拒绝；伪造 `permanent/...` 拒绝；image/audio 类型错配拒绝；未授权 IP、课程、项目引用拒绝；失败时不创建 Session、不 dispatch、不写 usage。

- [ ] **Step 2：运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/practice-reference-authorization.test.ts" "src/lib/server/practice-session-service.test.ts" "src/app/api/practice/sessions/route.test.ts" "src/app/api/practice/sessions/[id]/route.test.ts"
```

Expected: 当前会话只规范化引用结构，没有创建前的学校/用户/类型授权检查。

- [ ] **Step 3：实现授权服务**

授权服务只返回已验证的引用身份和必要媒体信息；Session service 在 `store.create()` 前调用；只有 Session 成功后才记录 IP usage。非法引用直接返回 400/403/404，不留下失败 Session、任务、积分或 usage。

- [ ] **Step 4：接入二次校验**

重试、恢复、任务创建和上游媒体签名前重新验证 Scope、registration、课程/IP/项目授权；权限撤销或转校后停止发送素材。

- [ ] **Step 5：运行验证并提交**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/practice-reference-authorization.test.ts" "src/lib/server/practice-session-service.test.ts" "src/app/api/practice/sessions/route.test.ts" "src/app/api/practice/sessions/[id]/route.test.ts" "src/lib/server/local-media-registry.test.ts" "src/lib/server/school-ip-library-service.test.ts"
pnpm --dir web run typecheck
git add "web/src/lib/server/practice-reference-authorization.ts" "web/src/lib/server/practice-reference-authorization.test.ts" "web/src/lib/server/practice-session-service.ts" "web/src/app/api/practice/sessions" "web/src/lib/server/local-media-registry.ts" "web/src/lib/server/reference-asset-store.ts" "web/src/lib/server/ip-library-reference-service.ts"
git commit -m "fix(practice): authorize tenant-scoped references before session creation"
```

## Task 8：任务、日志、媒体和普通项目入口的撤权复核

**Files:**
- Modify: `web/src/lib/server/generation-task-types.ts`
- Modify: `web/src/lib/server/generation-task-store.ts`
- Modify: `web/src/lib/server/generation-log-types.ts`
- Modify: `web/src/lib/server/generation-log-store.ts`
- Modify: `web/src/lib/server/local-media-registry.ts`
- Modify: `web/src/lib/server/user-media-deletion-service.ts`
- Modify: `web/src/app/api/image-tasks/route.ts`
- Modify: `web/src/app/api/video-generation-tasks/video-generation-route.ts`
- Modify: `web/src/app/api/audio-tasks/route.ts`
- Modify: `web/src/app/api/text-tasks/route.ts`
- Modify: `web/src/lib/server/generation-project-context.ts`
- Modify: `web/src/app/api/canvas/projects/[id]/route.ts`
- Modify: `web/src/app/api/drama/projects/[id]/route.ts`
- Modify: existing task/log/media/project tests

**接口契约：**

- practice `GenerationTaskContext` 必须携带服务端推导的 `schoolId`。
- task/log/result/media 的 practice 查询必须按 `schoolId + userId` 定向过滤。
- 被移出学校、membership 失效或转校后，不能继续免费生成、重试、恢复或读取旧 practice 结果。
- production 项目继续沿用原有 user ownership，不被 practice 条件误伤。

- [ ] **Step 1：写失败测试**

覆盖：A 创建 practice task/log/result，B context 读取 A 拒绝；A 离校后恢复/重试拒绝；A 的练习媒体不能由 B 签名或读取；production task/project 仍按原规则读取。

- [ ] **Step 2：运行失败测试**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/generation-task-store.test.ts" "src/lib/server/generation-task-recovery-service.test.ts" "src/lib/server/local-media-registry.test.ts" "src/lib/server/canvas-project-service.test.ts" "src/lib/server/drama-project-service.test.ts"
```

Expected: 任务、日志和媒体条件主要按 user、task 或 storage key，缺少统一学校 Scope 回归。

- [ ] **Step 3：传递可信 Scope**

练习 Session dispatch 写入 `GenerationTaskContext.schoolId`；客户端 body、URL、普通项目 JSON 和 storage key 不得提升为可信学校字段。任务、日志和媒体注册的 practice 查询统一加入学校和用户条件。

- [ ] **Step 4：修复普通 Canvas/Drama 入口**

对 `executionProfile=open-source-practice` 的项目，在读取、更新、删除和生成前调用 practice access；production 项目保持当前逻辑。普通入口不能因为项目 ID 属于当前用户就跳过学校身份。

- [ ] **Step 5：运行验证并提交**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/generation-task-store.test.ts" "src/lib/server/generation-task-recovery-service.test.ts" "src/lib/server/local-media-registry.test.ts" "src/lib/server/canvas-project-service.test.ts" "src/lib/server/drama-project-service.test.ts"
pnpm --dir web run typecheck
git add "web/src/lib/server/generation-task-types.ts" "web/src/lib/server/generation-task-store.ts" "web/src/lib/server/generation-log-types.ts" "web/src/lib/server/generation-log-store.ts" "web/src/lib/server/local-media-registry.ts" "web/src/lib/server/user-media-deletion-service.ts" "web/src/app/api/image-tasks" "web/src/app/api/video-generation-tasks" "web/src/app/api/audio-tasks" "web/src/app/api/text-tasks" "web/src/lib/server/generation-project-context.ts" "web/src/app/api/canvas/projects/[id]/route.ts" "web/src/app/api/drama/projects/[id]/route.ts"
git commit -m "fix(practice): enforce tenant scope through task recovery"
```

## Task 9：双学校 API/E2E 验收

**Files:**
- Create: `web/e2e/school-tenant-security.spec.ts`
- Create: `web/e2e/infinite-practice-tenant-isolation.spec.ts`
- Modify: existing E2E fixtures only when this plan changes their endpoint contract

- [ ] **Step 1：写学校管理和课程 E2E**

使用学校 A/B、两个管理员和两个班级，验证：

```text
管理员 A 自删/自禁用/自降权 → 409，membership 不变
成员导入含错误行 → 预检失败，0 个账号创建
停用班级 → 历史读取成功，课程资料写入失败
A 资料 ID → B 不能更新/删除，B 数据不变
```

- [ ] **Step 2：写 IP 与练习 E2E**

验证：

```text
A 只授权子 IP B → 包级封面不返回 A
A 公共 IP 下载 → school_id=A
伪造 B 的 targetId → 不写 usage
A 创建 practice 数据 → school_id=A
切换 B → A 的项目、Session、任务、日志和媒体不可读
B 创建数据 → school_id=B
B 不能引用 A 的普通 asset
无 school_id 的历史 asset → Session 创建前拒绝
```

- [ ] **Step 3：运行定向 E2E**

```powershell
pnpm --dir web exec playwright test "e2e/school-tenant-security.spec.ts" "e2e/infinite-practice-tenant-isolation.spec.ts" --project=chromium --no-deps
```

Expected: PASS；使用测试数据，不调用真实 RunningHub、真实对象存储或生产数据。

## Task 10：相关全量验证、Schema 文档和开发地图

**Files:**
- Modify: `docs/content/docs/backend/backend-database.mdx`
- Regenerate: `VOZEB-PRO-接口索引.md`
- Regenerate: `VOZEB-PRO-开发地图.md`

- [ ] **Step 1：运行相关 Vitest**

```powershell
pnpm --dir web exec vitest run --no-file-parallelism "src/lib/server/school-tenant-service.test.ts" "src/lib/server/school-member-provisioning-service.test.ts" "src/lib/server/school-course-service.test.ts" "src/lib/server/database/school-domain-repository.test.ts" "src/lib/server/school-domain-file-repository.test.ts" "src/lib/server/ip-library-service.test.ts" "src/lib/server/ip-library-download-service.test.ts" "src/lib/server/practice-tenant-scope.test.ts" "src/lib/server/practice-tenant-cleanup.test.ts" "src/lib/server/practice-reference-authorization.test.ts" "src/lib/server/practice-session-service.test.ts" "src/lib/server/generation-task-store.test.ts" "src/lib/server/canvas-project-service.test.ts" "src/lib/server/drama-project-service.test.ts"
```

- [ ] **Step 2：运行类型、Lint、格式和构建**

```powershell
pnpm --dir web run typecheck
pnpm --dir web run lint -- --quiet
pnpm --dir web run format:check
pnpm --dir web run build
```

- [ ] **Step 3：同步开发地图与接口索引**

从仓库根目录执行：

```powershell
pwsh -NoProfile -File .\过程文件\更新开发地图.ps1
pwsh -NoProfile -File .\过程文件\验证开发文档.ps1
```

如果接口或开发地图数量漂移，先修生成脚本、基线或文档内容；不能跳过验证。

- [ ] **Step 4：执行 UTF-8、差异和工作区检查**

严格解码本次修改的中文文档、源码和脚本，检查 `U+FFFD`、`U+951F`、`U+65A4`、`U+62F7`；运行 `git diff --check`；确认没有 `.env`、凭据、`output/` 或无关工作区改动。

- [ ] **Step 5：按项目 Mandatory Testing 交付**

只有双学校 API/E2E、相关 Vitest、类型检查、Lint、格式检查、构建、Schema、开发地图和接口索引均有真实通过证据，才可以报告完成。

## 部署和执行顺序

1. 先部署包含新字段兼容读取、成员导入预检和 practice cleanup dry-run 的版本。
2. 执行 `pnpm --dir web cleanup:practice-data -- --dry-run`，确认报告只包含 practice 数据。
3. 完成备份后执行 `pnpm --dir web cleanup:practice-data -- --confirm`，保存每类记录数量和被正式引用而保留的媒体数量。
4. 执行 PostgreSQL 幂等 Schema 升级：先补列，再清理/回填，再补索引和约束。
5. 部署所有新写入均从 active school context 推导 scope 的版本。
6. 执行双学校 API/E2E、正式数据保留回归和全量质量门禁。
7. 任一失败时停止；不能通过放宽 owner 条件、删除 school 条件或回退到只按 ID 查询来绕过。

## 完成判定

只有以下条件全部满足，才能报告完成：

- 学校管理员不能自删、自禁用、自降权；
- 成员导入有模板、逐行预检、全量原子提交、批次和审计；
- 空姓名和中文角色在提交前被指出；
- 停用班级进入历史只读，课程资料写操作被阻止；
- 课程资料 PostgreSQL SQL 和 JSON fallback 都有学校边界；
- 未授权子 IP 封面不返回；
- 公共 IP 下载记录带当前学校；
- IP usage targetId 无法伪造；
- practice 新数据具备不可变 `school_id + owner_user_id`；
- 用户转校后不能读取或使用原学校 practice 数据；
- 普通 asset 在 Session 创建前通过 owner、school、有效期和真实类型校验；
- 非法引用不创建失败 Session、任务、积分或 usage；
- 任务、日志、结果媒体和普通 Canvas/Drama 入口不绕过 practice scope；
- 正式生产数据和普通个人素材未被误删或误伤；
- 双学校测试、相关 Vitest、类型、Lint、格式、构建、E2E、Schema、开发地图和接口索引均有真实通过证据。

## 本次明确不做

- 不增加学校管理员查看全校学生练习正文的后台功能；
- 不把个人历史素材自动迁移到新学校；
- 不做跨学校数据恢复、待归属或管理员确认归档；
- 不改变正式 production 项目的原有个人所有和计费逻辑；
- 不增加新的学校角色体系；
- 不把前端隐藏按钮当成权限修复；
- 不通过删库或重建数据库解决租户问题。
