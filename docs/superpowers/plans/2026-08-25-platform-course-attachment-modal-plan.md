# 平台课程附件弹窗与本地上传 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将管理员课程编辑器改为 Modal，并提供不依赖 URL 的多文件本地附件上传，覆盖案例包格式及大文件流式传输。

**Architecture:** 新增管理员课程附件流式 PUT/DELETE 接口，服务端以临时文件承接请求流，再复用 reference asset/object storage 写入和鉴权下载；课程 JSON 附件改为稳定的本地附件元数据。前端在 Modal 内维护待上传 File 列表，保存时顺序上传后再提交课程，并回收本次失败写入。

**Tech Stack:** Next.js Route Handler、TypeScript、React、Ant Design、Vitest、Playwright、Node `fs` 流、现有 reference asset/object storage 服务。

## Global Constraints

- 业务接口继续使用 `{ code, data, msg }`。
- 附件不接受外部 URL，ZIP 不自动解包。
- 允许扩展名固定为 `.docx/.pptx/.xlsx/.png/.jpg/.jpeg/.webp/.mp4/.mov/.zip`，匹配用户提供的案例包与整包上传方式。
- 不为案例包引入固定格式之外的业务解析器，不新增无依据的轮询/重试常数。
- 中文源码与文档使用 UTF-8；不修改无关文件。

### Task 1: Extend course attachment contract and streaming service

**Files:**
- Modify: `web/src/lib/school-domain.ts`
- Modify: `web/src/lib/server/school-course-service.ts`
- Modify: `web/src/lib/server/local-media-registry.ts`
- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `web/src/lib/server/reference-asset-store.ts`
- Create: `web/src/lib/server/course-attachment-service.ts`
- Test: `web/src/lib/server/course-attachment-service.test.ts`

**Interfaces:**
- Produces: `storeCourseAttachment(input: { ownerUserId: string; fileName: string; declaredMimeType: string; body: ReadableStream<Uint8Array>; contentLength?: number }): Promise<CourseAttachment>`。
- Produces: `deleteCourseAttachments(ownerUserId: string, storageKeys: string[])`，只删除当前管理员拥有且未被业务引用的附件。
- Produces: `CourseAttachment = { title: string; url: string; storageKey: string; fileName: string; mimeType: string; bytes: number }`。

- [ ] Write failing tests that pass a real `ReadableStream`, assert `.docx/.pptx/.xlsx/.png/.jpg/.jpeg/.webp/.mp4/.mov/.zip` MIME mapping, reject an empty/unsupported file, and assert temporary-file cleanup when persistence fails.
- [ ] Run `pnpm vitest run src/lib/server/course-attachment-service.test.ts` and confirm the missing service failures.
- [ ] Implement the exact interfaces above with `Readable.fromWeb`, `pipeline`, `mkdtemp`, and existing `persistExternalMediaIfEnabled`; generate a `reference-assets/permanent/.../attachments/...` key and remove the temporary directory in `finally`.
- [ ] Extend the local media registration/database type check to include `attachment`; keep existing media classification and response behavior.
- [ ] Run the focused service tests and school-course tests; confirm green.

### Task 2: Add admin streaming upload route and API client

**Files:**
- Create: `web/src/app/api/admin/course-attachments/route.ts`
- Create: `web/src/app/api/admin/course-attachments/route.test.ts`
- Modify: `web/src/services/api/courses.ts`
- Modify: `web/src/services/api/courses.test.ts`

**Interfaces:**
- Consumes: Task 1 `storeCourseAttachment` and `deleteCourseAttachments`.
- Produces: `coursesApi.uploadPlatformCourseAttachment(file: File): Promise<CourseAttachment>` and `coursesApi.deletePlatformCourseAttachments(storageKeys: string[]): Promise<void>`.

- [ ] Add a failing route test covering permission denial, streamed body metadata, and `{ code, data, msg }` response.
- [ ] Run the route test and confirm failure before implementation.
- [ ] Implement `PUT` with `education.manage` authorization, URI-encoded `X-File-Name`, `Content-Type`, `Content-Length`, and `request.body`; implement `DELETE` with `{ storageKeys: string[] }`, owner validation, reference protection, and `{ code, data, msg }` responses.
- [ ] Add `coursesApi.uploadPlatformCourseAttachment(file)` using `fetch` with the `File` body and upload headers.
- [ ] Run route and API tests.

### Task 3: Replace Drawer editor with Modal and local file controls

**Files:**
- Modify: `web/src/app/admin/courses/components/admin-courses-section.tsx`
- Modify: `web/src/app/admin/courses/components/admin-courses-section.test.tsx`

**Interfaces:**
- Consumes: Task 2 upload/delete client methods and Task 1 `CourseAttachment`.
- Produces: a responsive course editor `Modal` whose local state separates retained `CourseAttachment[]` from pending `File[]`.

- [ ] Add source-level tests asserting `Modal`, `Upload`/hidden file input, local file state, and absence of the URL rule/Drawer editor.
- [ ] Run the focused component test and confirm red assertions.
- [ ] Replace `Drawer` with `Modal` width `min(920px, calc(100vw - 24px))`, a viewport-bounded scroll body, and footer Save/Cancel controls; keep title/summary/body/outline behavior and add an Ant Design `Upload` picker with `multiple`, the exact accepted extensions, file metadata, remove buttons, and existing attachment rows.
- [ ] On save, validate the form, upload only pending files, merge returned metadata with retained attachments, submit the course, delete uploaded storage keys if upload/course submission fails, and delete removed existing storage keys after a successful update.
- [ ] Run component tests and typecheck.

### Task 4: Update browser regression and docs

**Files:**
- Modify: `web/e2e/school-education.spec.ts`
- Modify: `docs/backend-database.md` or the repository database documentation index if the file is absent

- [ ] Add small generated `.zip` and `.png` fixtures to the existing browser test temporary directory, select both through the file input, verify Modal semantics and no URL input, save, and read `fileName/mimeType/bytes/storageKey/url` through the admin API.
- [ ] Run the focused Playwright course flow at desktop, 390px, and 430px; assert no horizontal overflow.
- [ ] Locate the existing database documentation through `rg --files docs | rg 'database|数据库'`, then document `platform_courses.attachments` metadata and `local_media_assets.type = attachment` in that existing file.

### Task 5: Quality gates

- [ ] Run `pnpm vitest run` with the shared PostgreSQL files using `--no-file-parallelism` where required.
- [ ] Run `pnpm typecheck`, `pnpm lint`, and the relevant Playwright suite.
- [ ] Run the repository development-map and document validation scripts.
- [ ] Inspect `git diff`/`git status`, verify UTF-8 and replacement-character scans, and report any unavailable external storage/browser evidence.
