# 短剧实验室 Word 小说导入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在短剧实验室导入小说链路中支持 TXT/MD/Markdown/DOCX/DOC 的点击与拖拽上传解析。

**Architecture:** 前端把二进制文件以 multipart 上传到现有导入 Route；Route 通过专用服务端解析器把文件统一转换为纯文本，再复用现有 `importDramaLabNovelForUser` 分集预览/提交逻辑。JSON `sourceText` 兼容路径保持不变。

**Tech Stack:** Next.js App Router、TypeScript、React、Vitest、`fflate`、Node `child_process`/临时文件。

## Global Constraints

- 只修改短剧实验室小说导入链路。
- 不修改普通短剧、Canvas、Agent、资产服务、通用任务服务。
- 保持现有 `POST /api/drama-lab/projects/:id/import-novel` 路径和预览/确认语义。
- `.doc` 无系统转换工具时必须返回明确转 `.docx` 的错误。

### Task 1: 服务端上传文件解析器

**Files:**
- Create: `web/src/lib/server/drama-lab-novel-file-parser.ts`
- Create: `web/src/lib/server/drama-lab-novel-file-parser.test.ts`
- Modify: `web/src/app/api/drama-lab/projects/[id]/import-novel/route.ts`
- Modify: `web/src/app/api/drama-lab/projects/[id]/import-novel/route.test.ts`

- [ ] Write failing tests for DOCX XML extraction, unsupported extension, and multipart DOCX forwarding.
- [ ] Implement `extractUploadedText` with `fflate.unzipSync` for DOCX and Node converter fallback for DOC.
- [ ] Route multipart files through the parser while retaining JSON decoding.
- [ ] Run focused Vitest and confirm pass.

### Task 2: 前端点击与拖拽上传

**Files:**
- Modify: `web/src/app/(user)/drama-lab/[id]/drama-lab-novel-import.tsx`
- Modify: `web/src/app/(user)/drama-lab/[id]/drama-lab-novel-import.test.tsx`

- [ ] Update accepted extensions and drop copy to include Word formats.
- [ ] Send selected/dropped files as multipart instead of browser-decoding Word files.
- [ ] Keep text files on existing local decoding path or multipart path without changing preview behavior.
- [ ] Add tests for accept attribute, drop copy, and file upload request shape.

### Task 3: Verification and commit

**Files:**
- No additional production files.

- [ ] Run focused Vitest for parser, route, and component.
- [ ] Run `pnpm run typecheck`, targeted ESLint, and targeted Prettier check.
- [ ] Run `git diff --check`.
- [ ] Commit only this feature's files; do not include unrelated worktree documents/screenshots.
