# 学校课程章节、课时与课程资料 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** 将学校课程改造成“课程 -> 章节 -> 课时 -> 课程资料”的课程树，支持平台标准资料、学校补充资料、班级教学关联，以及“停用（可恢复）/永久删除”生命周期。

**Architecture:** 保留现有学校租户、课程分配、课程安排、教学任务和 reference-assets 上传链路。将课程章节、课时和资料从 platform_courses JSON 与 school_course_offerings.supplemental_resources 拆成带稳定 ID 的关系数据；平台资料归属平台课程，学校资料归属学校课程分配，因此本校所有使用该课程的班级共享学校资料。停用复用课程 disabled 状态并记录操作者，永久删除在数据库事务内级联业务数据、提交后清理不再被引用的文件。

**Tech Stack:** Next.js 16 App Router、TypeScript、React 19、Ant Design 6、Tailwind CSS 4、Zustand、PostgreSQL、Vitest、Playwright、现有 local media/object storage。

## Global Constraints

- Route Handler 只处理入参、鉴权、调用 service 和响应映射；业务规则放在 web/src/lib/server/。
- PostgreSQL 查询必须带课程、学校、分配、成员、状态和分页条件，禁止整表读取后在 Node.js 过滤。
- 所有接口返回 { code, data, msg }；学校资料必须经过学校上下文和 school_course_assignment 校验。
- 平台管理员使用 education.manage；学校管理员和负责老师沿用现有学校权限；学生只能读取。
- 新增表或字段时更新 docs/content/docs/backend/backend-database.mdx；接口、页面、service、repository、schema 变化时更新 VOZEB-PRO-接口索引.md 和 VOZEB-PRO-开发地图.md。
- 项目尚未上线，直接移除旧 chapters、attachments 和 supplemental_resources 读写，不写兼容双读双写或迁移兜底。
- 文件支持 .docx、.pptx、.xlsx、图片、.mp4/.mov 和 .zip；ZIP 不解压；图片和视频预览，Office 和 ZIP 下载。
- 学校资料按学校课程分配共享，不做班级级资料可见性。
- 页面和弹层必须在桌面、390px、430px 下无横向溢出；过程状态使用语义浅底，不使用深色实心状态标签。
- “停用”就是可恢复的软删除；管理员界面不出现技术性删除术语，永久清理操作统一称为“永久删除”。

---

### Task 1: Define Normalized Course Types And Schema

**Files:**
- Modify: web/src/lib/school-domain.ts
- Modify: web/src/lib/server/school-domain-repository.ts
- Modify: web/src/lib/server/database/schema-school-domain.ts
- Modify: web/src/lib/server/database/repository-types.ts when new row types are needed
- Test: web/src/lib/server/database/school-domain-schema.postgres.test.ts
- Test: web/src/lib/server/database/school-domain-repository.test.ts
- Test: web/src/lib/server/school-domain-file-repository.test.ts

**Interfaces:**
- Produce CourseChapter, CourseLesson, CourseMaterial, PlatformCourseSummary, PlatformCourseDetail and CourseDeletionImpact.
- Produce repository records and methods used by Tasks 2-4.
- Remove PlatformCourse.chapters/attachments and SchoolCourseOfferingRecord.supplementalResources from the new public contracts.

- [ ] **Step 1: Add failing type and database constraint tests**

Add fixtures for one course, chapter, lesson, platform material and school material. Assert a material has exactly one of chapterId and lessonId. In the PostgreSQL integration test, assert that a school material cannot combine a chapter from course A with a school assignment for course B, and that both-null or both-set target IDs fail.

Run:

~~~powershell
pnpm -C web vitest run src/lib/server/database/school-domain-schema.postgres.test.ts src/lib/server/database/school-domain-repository.test.ts --no-file-parallelism
~~~

Expected: FAIL because normalized tables, fields and mappers are absent.

- [ ] **Step 2: Define domain types and repository record types**

Add these public types:

~~~ts
type CourseMaterialSourceScope = "platform" | "school";
type CourseMaterialStatus = "active" | "disabled";

type CourseMaterial = {
  id: string; courseId: string; chapterId?: string; lessonId?: string;
  sourceScope: CourseMaterialSourceScope; schoolCourseAssignmentId?: string;
  title: string; fileName: string; mimeType: string; bytes: number;
  storageKey: string; url: string; sortOrder: number;
  status: CourseMaterialStatus; createdByUserId?: string;
  createdAt: string; updatedAt: string;
};

type CourseLesson = {
  id: string; courseId: string; chapterId: string; title: string;
  description: string; sortOrder: number; materials: CourseMaterial[];
  createdAt: string; updatedAt: string;
};

type CourseChapter = {
  id: string; courseId: string; title: string; description: string;
  sortOrder: number; materials: CourseMaterial[]; lessons: CourseLesson[];
  createdAt: string; updatedAt: string;
};

type PlatformCourseSummary = {
  id: string; title: string; summary: string; content: Record<string, unknown>;
  chapterCount: number; lessonCount: number; materialCount: number;
  status: PlatformCourseStatus; deletedAt?: string; deletedByUserId?: string;
  createdAt: string; updatedAt: string;
};

type PlatformCourseDetail = PlatformCourseSummary & { chapters: CourseChapter[] };
~~~

type CourseChapterRecord = Omit<CourseChapter, "materials" | "lessons">;
type CourseChapterUpdate = Partial<Pick<CourseChapterRecord, "title" | "description" | "sortOrder">> & { updatedAt: string };
type CourseLessonRecord = Omit<CourseLesson, "materials">;
type CourseLessonUpdate = Partial<Pick<CourseLessonRecord, "title" | "description" | "sortOrder">> & { updatedAt: string };
type CourseMaterialRecord = CourseMaterial;
type CourseMaterialInput = {
  chapterId?: string; lessonId?: string; title: string; storageKey: string;
};
type CourseMaterialPatch = Partial<Pick<CourseMaterial, "title" | "sortOrder" | "status">>;
type CourseMaterialUpdate = CourseMaterialPatch & { updatedAt: string };
type CourseMaterialQuery = {
  courseId: string; schoolCourseAssignmentId?: string;
  sourceScope?: CourseMaterialSourceScope; chapterId?: string; lessonId?: string;
  page?: number; pageSize?: number;
};
type CourseDeletionImpact = {
  courseId: string; chapterCount: number; lessonCount: number; materialCount: number;
  schoolCount: number; offeringCount: number; teachingAssignmentCount: number;
  submissionCount: number; storageKeys: string[];
};

Add repository records with the same scalar fields and update TeachingAssignment/TeachingAssignmentInput with optional chapterId and lessonId.

- [ ] **Step 3: Replace the PostgreSQL schema**

In schema-school-domain.ts:

1. Remove platform_courses.chapters and platform_courses.attachments.
2. Add platform_courses.deleted_at and deleted_by_user_id.
3. Add platform_course_chapters with composite (course_id, id) uniqueness and course/sort indexes.
4. Add platform_course_lessons with composite course/chapter foreign keys and course/chapter/sort indexes.
5. Add course_materials with source_scope, nullable school_course_assignment_id, chapter_id, lesson_id, storage metadata, status and timestamps. Add a check requiring exactly one target; add composite foreign keys so the target and assignment belong to course_id. Add `UNIQUE (course_id, id)` to `school_course_assignments` so `course_materials (course_id, school_course_assignment_id)` can enforce the same-course relation.
6. Add nullable chapter_id and lesson_id to teaching_assignments with indexes.
7. Remove school_course_offerings.supplemental_resources.
8. Use cascade foreign keys from a course to its chapters, lessons, materials, assignments, offerings, teaching assignments and submissions.

- [ ] **Step 4: Add repository contracts and mappers**

Add methods with these signatures:

~~~ts
getPlatformCourseTree(courseId: string, options?: { schoolCourseAssignmentId?: string }): Promise<PlatformCourseDetail | null>;
listCourseChapters(courseId: string): Promise<CourseChapterRecord[]>;
insertCourseChapter(record: CourseChapterRecord): Promise<CourseChapterRecord>;
updateCourseChapter(courseId: string, chapterId: string, patch: CourseChapterUpdate): Promise<CourseChapterRecord | null>;
deleteCourseChapter(courseId: string, chapterId: string): Promise<boolean>;
insertCourseLesson(record: CourseLessonRecord): Promise<CourseLessonRecord>;
updateCourseLesson(courseId: string, lessonId: string, patch: CourseLessonUpdate): Promise<CourseLessonRecord | null>;
deleteCourseLesson(courseId: string, lessonId: string): Promise<boolean>;
listCourseMaterials(input: CourseMaterialQuery): Promise<Page<CourseMaterialRecord>>;
getCourseMaterial(materialId: string, schoolId?: string): Promise<CourseMaterialRecord | null>;
insertCourseMaterial(record: CourseMaterialRecord): Promise<CourseMaterialRecord>;
updateCourseMaterial(materialId: string, patch: CourseMaterialUpdate): Promise<CourseMaterialRecord | null>;
deleteCourseMaterial(materialId: string): Promise<boolean>;
getPlatformCourseDeletionImpact(courseId: string): Promise<CourseDeletionImpact>;
disablePlatformCourse(courseId: string, patch: { deletedAt: string; deletedByUserId: string; updatedAt: string }): Promise<PlatformCourseRecord | null>;
restorePlatformCourse(courseId: string, patch: { updatedAt: string }): Promise<PlatformCourseRecord | null>;
permanentlyDeletePlatformCourse(courseId: string): Promise<{ storageKeys: string[] }>;
~~~

Implement the contracts in both PostgreSQL and file repositories. The PostgreSQL tree uses course-scoped queries and deterministic sort_order/id ordering; the file repository stores flat arrays with the same relationship checks and no nested legacy JSON.

- [ ] **Step 5: Run and commit the schema/domain slice**

Run:

~~~powershell
pnpm -C web vitest run src/lib/server/database/school-domain-schema.postgres.test.ts src/lib/server/database/school-domain-repository.test.ts src/lib/server/school-domain-file-repository.test.ts --no-file-parallelism
~~~

Expected: PASS. Commit:

~~~powershell
git add web/src/lib/school-domain.ts web/src/lib/server/school-domain-repository.ts web/src/lib/server/database/schema-school-domain.ts web/src/lib/server/database/repository-types.ts web/src/lib/server/database/school-domain-schema.postgres.test.ts web/src/lib/server/database/school-domain-repository.test.ts web/src/lib/server/school-domain-file-repository.test.ts
git commit -m "feat: normalize school course structure"
~~~

### Task 2: Implement Course Tree, Material Authorization And Lifecycle Services

**Files:**
- Create: web/src/lib/server/course-material-service.ts
- Modify: web/src/lib/server/school-course-service.ts
- Modify: web/src/lib/server/course-attachment-service.ts
- Modify: web/src/lib/server/database/school-domain-repository.ts
- Modify: web/src/lib/server/school-domain-file-repository.ts
- Test: web/src/lib/server/course-material-service.test.ts
- Test: web/src/lib/server/school-course-service.test.ts
- Test: web/src/lib/server/course-attachment-service.test.ts

**Interfaces:**
- Consume Task 1 repository contracts and existing school-access-service, local-media-registry and course attachment storage.
- Produce course tree, material mutation, deletion-impact, stop, restore and permanent-delete services for Tasks 3-8.

- [ ] **Step 1: Write failing service tests**

Cover these concrete cases:

~~~ts
it("rejects a target node from another course", async () => {
  await expect(createSchoolMaterial("manager-a", "assignment-a", {
    chapterId: "chapter-other", title: "资料", storageKey: "permanent/a.docx"
  })).rejects.toMatchObject({ status: 404 });
});

it("creates a school material visible to the whole school assignment", async () => {
  repository.getSchoolCourseAssignment.mockResolvedValue(assignment("school-a", "course-a"));
  repository.insertCourseMaterial.mockImplementation(async record => record);
  await expect(createSchoolMaterial("manager-a", "assignment-a", {
    lessonId: "lesson-a", title: "课堂案例", storageKey: "permanent/a.docx"
  })).resolves.toMatchObject({
    sourceScope: "school", schoolCourseAssignmentId: "assignment-a", lessonId: "lesson-a"
  });
});

it("requires the exact title before permanent deletion", async () => {
  await expect(permanentlyDeleteCourse("admin-a", "course-a", "错误名称"))
    .rejects.toMatchObject({ status: 400 });
});
~~~

Also cover anonymous/non-admin actors, non-manager teachers, disabled assignments, inactive teachers, cross-school material reads, both-null/both-set targets and stopped courses rejecting new content.

- [ ] **Step 2: Run service tests and verify they fail**

~~~powershell
pnpm -C web vitest run src/lib/server/course-material-service.test.ts src/lib/server/school-course-service.test.ts
~~~

Expected: FAIL because normalized service functions are missing.

- [ ] **Step 3: Implement tree and material service rules**

In course-material-service.ts:

1. Normalize titles/descriptions and require exactly one chapterId or lessonId.
2. Resolve the target node and verify its courseId.
3. Platform material mutations require education.manage and a non-stopped course.
4. School material mutations require school manager or the responsible teacher, an active school assignment, and the current school context.
5. Validate storage registrations as permanent attachment files with matching MIME and bytes; generate protected reference-assets URLs from storageKey.
6. Assemble platform trees or school trees by merging platform materials with materials whose schoolCourseAssignmentId equals the requested assignment.
7. Return sourceScope so the UI can distinguish “平台资料” and “本校补充资料”.
8. Prevent schools from editing or deleting platform materials.

- [ ] **Step 4: Implement stop, restore and permanent deletion**

Use disabled as the only recoverable stop state. The stop service accepts only a published course and restore always returns it to published:

~~~ts
await repository.disablePlatformCourse(courseId, {
  deletedAt: now, deletedByUserId: actorId, updatedAt: now
});
await repository.restorePlatformCourse(courseId, { updatedAt: now });
await repository.permanentlyDeletePlatformCourse(courseId);
~~~

The stop service hides the course from normal platform, school and student reads and blocks new assignments, offerings, chapters, lessons, materials and teaching tasks. Restore clears deleted metadata and returns the course to published when it was previously published. Permanent deletion is allowed for every course status, requires the exact title, fetches CourseDeletionImpact, deletes all course business records in one transaction, and returns storage keys collected before deletion.

- [ ] **Step 5: Add reference-aware file cleanup**

Implement cleanupDeletedCourseMaterials(storageKeys: string[]) in course-attachment-service.ts. It must deduplicate keys, lock registrations, query course-material and other business references, delete only unreferenced files, and return:

~~~ts
{ deletedFiles: number; deletedBytes: number; skippedShared: number; failed: string[] }
~~~

Run cleanup only after the database transaction commits. A failed transaction must not delete files; a post-commit cleanup failure must be returned and audited.

- [ ] **Step 6: Update teaching assignment target validation**

Remove old attachment/resource mapping in school-course-service.ts. Add optional chapterId and lessonId to create/update teaching assignments, verify the node belongs to the offering's course, and preserve current submission/review behavior. Remove supplementalResources from offering creation and mapping.

- [ ] **Step 7: Run and commit the service slice**

~~~powershell
pnpm -C web vitest run src/lib/server/course-material-service.test.ts src/lib/server/school-course-service.test.ts src/lib/server/course-attachment-service.test.ts src/lib/server/school-domain-file-repository.test.ts
~~~

Expected: PASS. Commit:

~~~powershell
git add web/src/lib/server/course-material-service.ts web/src/lib/server/school-course-service.ts web/src/lib/server/course-attachment-service.ts web/src/lib/server/database/school-domain-repository.ts web/src/lib/server/school-domain-file-repository.ts web/src/lib/server/course-material-service.test.ts web/src/lib/server/school-course-service.test.ts web/src/lib/server/course-attachment-service.test.ts web/src/lib/server/school-domain-file-repository.test.ts
git commit -m "feat: add course material services"
~~~

### Task 3: Add Admin, School And Teaching API Routes

**Files:**
- Create: web/src/app/api/admin/courses/[id]/tree/route.ts
- Create: web/src/app/api/admin/courses/[id]/chapters/route.ts
- Create: web/src/app/api/admin/course-chapters/[id]/route.ts
- Create: web/src/app/api/admin/course-chapters/[id]/lessons/route.ts
- Create: web/src/app/api/admin/course-lessons/[id]/route.ts
- Create: web/src/app/api/admin/courses/[id]/materials/route.ts
- Create: web/src/app/api/admin/course-materials/[id]/route.ts
- Create: web/src/app/api/admin/courses/[id]/deletion-impact/route.ts
- Create: web/src/app/api/school/courses/[id]/tree/route.ts
- Create: web/src/app/api/school/courses/[id]/materials/route.ts
- Create: web/src/app/api/school/course-materials/[id]/route.ts
- Modify: web/src/app/api/admin/courses/[id]/route.ts
- Modify: web/src/app/api/admin/course-attachments/route.ts
- Modify: web/src/app/api/teaching/assignments/route.ts
- Modify: web/src/app/api/teaching/assignments/[id]/route.ts
- Test: route.test.ts beside every new route and modified route

**Interfaces:**
- Consume Task 2 service functions and existing API response/audit helpers.
- Produce typed endpoints for Task 4 and all UI tasks.

- [ ] **Step 1: Add failing route authorization tests**

Assert 200 for an authorized admin tree request, 401 for anonymous access, 404 for a school material request from another school, and 400 for a permanent delete without exact confirmation. Assert audit actions admin.course.disable, admin.course.restore, admin.course.permanent_delete, admin.course.material.create and school.course.material.create.

- [ ] **Step 2: Implement platform routes**

Expose:

~~~text
GET    /api/admin/courses/:id/tree
POST   /api/admin/courses/:id/chapters
PATCH  /api/admin/course-chapters/:id
DELETE /api/admin/course-chapters/:id
POST   /api/admin/course-chapters/:id/lessons
PATCH  /api/admin/course-lessons/:id
DELETE /api/admin/course-lessons/:id
POST   /api/admin/courses/:id/materials
PATCH  /api/admin/course-materials/:id
DELETE /api/admin/course-materials/:id
GET    /api/admin/courses/:id/deletion-impact
PATCH  /api/admin/courses/:id       { status: "published" | "disabled" }
POST   /api/admin/courses/:id/restore
DELETE /api/admin/courses/:id        { confirmationTitle }
~~~

Use current administrator Session and education.manage. Permanent deletion returns a cleanup report and never exposes storage credentials.

- [ ] **Step 3: Implement school routes and raw upload**

Expose:

~~~text
GET    /api/school/courses/:assignmentId/tree
PUT    /api/school/course-material-uploads
POST   /api/school/courses/:assignmentId/materials
PATCH  /api/school/course-materials/:id
DELETE /api/school/course-materials/:id
~~~

Reuse the existing raw-body headers Content-Type, X-File-Name and Content-Length and shared attachment storage. The material creation request accepts a validated storageKey plus target node and title, never an arbitrary external URL.

- [ ] **Step 4: Update teaching assignment routes**

Parse optional chapterId and lessonId in create/patch bodies and return target IDs and target title in detail responses. Teachers can target only nodes in their offering; students receive read-only target data.

- [ ] **Step 5: Run and commit API tests**

~~~powershell
pnpm -C web vitest run src/app/api/admin/courses src/app/api/admin/course-chapters src/app/api/admin/course-lessons src/app/api/admin/course-materials src/app/api/school/courses src/app/api/school/course-materials src/app/api/teaching/assignments
~~~

Expected: PASS. Commit:

~~~powershell
git add web/src/app/api/admin/courses web/src/app/api/admin/course-chapters web/src/app/api/admin/course-lessons web/src/app/api/admin/course-materials web/src/app/api/school/courses web/src/app/api/school/course-materials web/src/app/api/teaching/assignments web/src/app/api/admin/course-attachments
git commit -m "feat: expose course tree APIs"
~~~

### Task 4: Add Typed Course API Client

**Files:**
- Modify: web/src/services/api/courses.ts
- Modify: web/src/services/api/courses.test.ts

**Interfaces:**
- Consume Task 3 HTTP contracts.
- Produce typed calls for tree loading, node CRUD, platform/school material CRUD, upload, deletion impact, stop, restore and permanent deletion.

- [ ] **Step 1: Add failing request tests**

Assert exact requests for:

~~~ts
await coursesApi.getAdminCourseTree("course-a");
await coursesApi.createCourseChapter("course-a", { title: "第一章" });
await coursesApi.createSchoolCourseMaterial("assignment-a", {
  lessonId: "lesson-a", title: "资料", storageKey: "permanent/a.docx"
});
await coursesApi.permanentlyDeletePlatformCourse("course-a", "课程 A");
~~~

Expected URLs are /api/admin/courses/course-a/tree, /api/admin/courses/course-a/chapters, /api/school/courses/assignment-a/materials and DELETE /api/admin/courses/course-a with confirmationTitle in the JSON body.

- [ ] **Step 2: Implement client methods**

Add getAdminCourseTree, getSchoolCourseTree, create/update/delete chapter, create/update/delete lesson, uploadPlatformCourseMaterial, uploadSchoolCourseMaterial, create/update/deleteCourseMaterial, getCourseDeletionImpact, restorePlatformCourse and permanentlyDeletePlatformCourse. Keep raw File bodies for upload and use serializeApiParams for list queries.

- [ ] **Step 3: Run and commit**

~~~powershell
pnpm -C web vitest run src/services/api/courses.test.ts
git add web/src/services/api/courses.ts web/src/services/api/courses.test.ts
git commit -m "feat: add course tree client"
~~~

Expected: PASS.

### Task 5: Rebuild Platform Course Management

**Files:**
- Modify: web/src/app/admin/courses/components/admin-courses-section.tsx
- Modify: web/src/app/admin/courses/components/admin-courses-section.test.tsx

**Interfaces:**
- Consume Task 4 client methods and summary/detail types.
- Produce platform course tree editing, node-targeted uploads, school assignment and lifecycle controls.

- [ ] **Step 1: Add failing component tests**

Test that creating a course displays a chapter/lesson tree and no root “平台附件” section, that uploading after selecting a lesson sends lessonId, that stopped courses show “恢复”, and that “永久删除” requires exact title input before calling the API.

- [ ] **Step 2: Implement the tree editor**

Replace flat Form.List outline and savedAttachments with a responsive Modal containing a left chapter/lesson tree and a right selected-node editor. Use stable IDs for node updates. Add chapter, lesson and material actions; upload only after a node is selected. Keep course title, summary and body in the course form. Load detail tree on edit and refresh the tree after mutations.

- [ ] **Step 3: Implement labels and lifecycle dialogs**

Use chapterCount, lessonCount and materialCount in the table. Show draft/published/disabled, label disabled as “已停用”, show “停用” for published, “恢复” for disabled, and “永久删除” under a more menu. Stop confirmation states that schools and students lose access but data is retained. Permanent deletion first loads impact, lists counts, requires exact title and then calls the DELETE endpoint.

- [ ] **Step 4: Run and commit**

~~~powershell
pnpm -C web vitest run src/app/admin/courses/components/admin-courses-section.test.tsx
git add web/src/app/admin/courses/components/admin-courses-section.tsx web/src/app/admin/courses/components/admin-courses-section.test.tsx
git commit -m "feat: rebuild platform course tree editor"
~~~

Expected: PASS.

### Task 6: Add School-Wide Supplement Materials

**Files:**
- Modify: web/src/app/(user)/school/school-administration.tsx
- Create: web/src/app/(user)/school/school-administration.test.tsx

**Interfaces:**
- Consume school tree/material methods from Task 4 and existing school manager/teacher context.
- Produce school course detail where school materials are attached to a chapter or lesson and shared by every class using the assignment.

- [ ] **Step 1: Add failing school UI tests**

Assert that course detail shows “平台资料”, “本校补充资料” and “本校所有使用此课程的班级可见”. Assert that the old offering URL Form.List and “补充资料 URL” field do not render.

- [ ] **Step 2: Replace offering resource fields**

Remove supplementalResources from the offering creation Modal. Add a “内容与资料” action that loads the assignment tree. Render chapter/lesson nodes with source labels. Add “上传本校资料” to the selected node, upload through the school route and create a material under assignmentId. Allow only school-scope records to be renamed, reordered or removed.

- [ ] **Step 3: Keep class arrangements separate**

Retain class and responsible-teacher arrangement creation as its own operation. Show the school-wide material note in the detail Drawer. Do not create offering-level material records or class-specific visibility fields.

- [ ] **Step 4: Run and commit**

~~~powershell
pnpm -C web vitest run "src/app/(user)/school/school-administration.test.tsx"
git add "web/src/app/(user)/school/school-administration.tsx" "web/src/app/(user)/school/school-administration.test.tsx"
git commit -m "feat: add school course materials"
~~~

Expected: PASS.

### Task 7: Update Teacher And Student Learning Views

**Files:**
- Modify: web/src/app/(user)/learning/page.tsx
- Modify: web/src/app/(user)/learning/page.test.tsx
- Modify: web/src/services/api/courses.ts only when response types are incomplete

**Interfaces:**
- Consume CourseTree and class-scoped teaching assignments.
- Produce nested course display for teachers and students; only teachers with a responsible offering can mutate school materials.

- [ ] **Step 1: Add failing learning tests**

Use fixtures with two chapters, chapter-level material, two lessons, platform material and school material. Assert chapter and lesson headings, source labels, protected download links, image/video previews and absence of upload controls for students. Assert stopped courses and courses without a class offering are absent.

- [ ] **Step 2: Replace flat lessons projection**

Remove courses.flatMap(item => item.course.chapters...) and root attachments rendering. Load the selected course tree and render:

~~~text
课程
└─ 章节
   ├─ 章节资料
   └─ 课时
      ├─ 平台资料
      ├─ 本校补充资料
      └─ 已发布教学任务
~~~

Use stable IDs, real media dimensions for previews, and protected download URLs with original-download behavior through the existing route.

- [ ] **Step 3: Link teaching tasks**

Render assignments with chapterId or lessonId beneath the target node. Keep an independent teaching-task list for assignments without a target. Preserve current submit/review controls and hide all school-material mutation controls for students.

- [ ] **Step 4: Run and commit**

~~~powershell
pnpm -C web vitest run "src/app/(user)/learning/page.test.tsx"
git add "web/src/app/(user)/learning/page.tsx" "web/src/app/(user)/learning/page.test.tsx"
git commit -m "feat: show course materials in learning center"
~~~

Expected: PASS.

### Task 8: Update Documentation And Generated Development Maps

**Files:**
- Modify: docs/content/docs/backend/backend-database.mdx
- Modify: VOZEB-PRO-接口索引.md
- Modify: VOZEB-PRO-开发地图.md

**Interfaces:**
- Document final tables, indexes, endpoints, services, repositories and UI locations from Tasks 1-7.

- [ ] **Step 1: Document database and lifecycle**

Add platform_course_chapters, platform_course_lessons, course_materials, deleted_at/deleted_by_user_id, teaching target IDs, composite foreign keys and permanent-delete cascade. State that school materials use school_course_assignment_id and are visible to all classes in that school assignment. State that stop is the recoverable soft delete and permanent deletion is irreversible.

- [ ] **Step 2: Document routes and ownership**

List every admin, school and teaching route with method, request body, auth scope and response data. Map course-material-service.ts, repository implementations, AdminCoursesSection, CoursesPanel and learning page.

- [ ] **Step 3: Validate document encoding and generated maps**

Run:

~~~powershell
$paths = @("docs/content/docs/backend/backend-database.mdx","VOZEB-PRO-接口索引.md","VOZEB-PRO-开发地图.md")
foreach ($path in $paths) {
  $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $path))
  $text = [System.Text.UTF8Encoding]::new($false, $true).GetString($bytes)
  if ($text.Contains([char]0xFFFD) -or $text.Contains([char]0x951F) -or $text.Contains([char]0x65A4) -or $text.Contains([char]0x62F7)) { throw "乱码：$path" }
}
~~~

Commit documentation in the same commit as the final interface/schema implementation when those files are changed.

### Task 9: Run Focused Quality Gates

**Files:**
- Test: all modified unit, repository, service, API and component tests from Tasks 1-7

- [ ] **Step 1: Run repository and service tests**

~~~powershell
pnpm -C web vitest run src/lib/server/database/school-domain-schema.postgres.test.ts src/lib/server/database/school-domain-repository.test.ts --no-file-parallelism
pnpm -C web vitest run src/lib/server/course-material-service.test.ts src/lib/server/school-course-service.test.ts src/lib/server/course-attachment-service.test.ts
~~~

Expected: all commands exit 0.

- [ ] **Step 2: Run API and UI tests**

~~~powershell
pnpm -C web vitest run src/app/api/admin/courses src/app/api/admin/course-chapters src/app/api/admin/course-lessons src/app/api/admin/course-materials src/app/api/school/courses src/app/api/school/course-materials src/app/api/teaching/assignments
pnpm -C web vitest run src/app/admin/courses/components/admin-courses-section.test.tsx "src/app/(user)/school/school-administration.test.tsx" "src/app/(user)/learning/page.test.tsx"
~~~

Expected: all commands exit 0.

### Task 10: Run Full Verification And Browser Regression

**Files:**
- Test: existing and new Playwright fixtures for admin courses, school administration and learning center

- [ ] **Step 1: Run typecheck, lint, format and full tests**

~~~powershell
pnpm -C web typecheck
pnpm -C web lint
pnpm -C web format:check
pnpm -C web test
~~~

Expected: all commands exit 0.

- [ ] **Step 2: Run the complete browser flow**

Use Playwright to verify:

1. Admin creates a course, adds chapters and lessons, uploads Word/PPT/Excel/image/video/ZIP to chapter and lesson targets, publishes and assigns the course.
2. School manager opens the assignment, uploads a supplement to a lesson, and sees the school-wide visibility notice.
3. Two classes in the same school see the supplement; a student from another school receives not-found or forbidden.
4. Student learning view shows nested nodes, source labels, image/video previews and Office/ZIP downloads; no upload controls appear.
5. Admin stops the course, confirms it disappears from school/student views, restores it and confirms the tree returns.
6. Admin opens deletion impact, permanently deletes a course with assignments and submissions after exact title confirmation, confirms all course routes return not-found, and confirms shared files remain while course-only files are removed.

Run the relevant suite:

~~~powershell
pnpm -C web e2e --grep "课程|course|material"
~~~

Repeat at desktop, 390px and 430px. Read getBoundingClientRect() for the tree, material list, upload dialog/drawer and deletion dialog; assert no horizontal overflow and action controls remain inside their parents.

- [ ] **Step 3: Inspect final diff and status**

~~~powershell
git diff --check
git status --short
~~~

Confirm that only intended course implementation and documentation files changed. Preserve existing untracked user files, output/, fixtures and environment files.
