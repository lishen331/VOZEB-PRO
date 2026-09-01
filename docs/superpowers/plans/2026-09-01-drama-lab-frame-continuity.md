# 短剧实验室首尾帧连续性实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在短剧实验室中实现视频真实末帧提取、下一镜首帧候选确认、首尾帧来源/锁定持久化和模型角色化引用。

**Architecture:** 复用平台 `generation_tasks`、`downloadMediaToFile`、`runFfmpeg` 和参考素材登记；短剧项目 JSON 仅保存帧状态、候选和任务快照。提取服务只接受当前用户已完成的视频任务，候选先保存到下一镜，显式确认后才写入 `frames.first`。普通 Canvas 与其他业务域不变。

**Tech Stack:** Next.js App Router、TypeScript、Vitest、平台参考媒体存储、FFmpeg/ffprobe。

## Global Constraints

- 范围严格限定在 `/drama-lab`、`/api/drama-lab/*` 和短剧专属 Service/契约。
- 不修改普通 Canvas、教师/学生管理、学校算力、商单算力和平台通用生成链路。
- 生产代码必须先有失败测试；验证使用 `web/node_modules/.bin/vitest.cmd`、`npm run typecheck`、`npm run lint` 和 `git diff --check`。
- 不提交 `.playwright-cli/`、PNG/YAML 运行产物、`docs/architecture/.obsidian/`、`docs/incidents/`、`EXPORT_FEATURE_SUMMARY.md`、`web/next-env.d.ts`。
- 每个阶段以短剧项目 `updatedAt` 做乐观并发校验；任务 ID 和媒体归属必须按当前用户校验。

---

### Task 1: 帧契约与末帧提取服务

**Files:**
- Modify: `web/src/lib/drama-project-contract.ts`
- Create: `web/src/lib/server/drama-lab-tail-frame-service.ts`
- Modify: `web/src/lib/server/reference-asset-store.ts`
- Test: `web/src/lib/server/drama-lab-tail-frame-service.test.ts`

**Interfaces:**
- `DramaShotFrameState` 增加 `source`、`storageKey`、来源视频任务/镜头、来源历史 ID 和 `locked` 可选字段。
- `DramaShot` 增加 `firstFrameCandidate?: DramaShotFrameCandidate`。
- `extractDramaLabTailFrame(input)` 返回持久化尾帧和下一镜候选；相同项目/源视频任务重复调用幂等。

- [ ] **Step 1: Write the failing test**：覆盖完成视频下载、FFmpeg 末帧输出、参考素材登记、下一镜候选和重复任务幂等；覆盖无视频、无下一镜、FFmpeg 失败。
- [ ] **Step 2: Run test to verify it fails**：`web/node_modules/.bin/vitest.cmd run web/src/lib/server/drama-lab-tail-frame-service.test.ts`，预期因服务和契约缺失失败。
- [ ] **Step 3: Write minimal implementation**：使用临时目录、`downloadMediaToFile`、`runFfmpeg`、`runFfprobe` 和持久化图片文件；依据 `generationTaskId`/`videoUrl` 校验源任务，构造稳定候选 ID，返回 `/api/reference-assets/<token>`。
- [ ] **Step 4: Run test to verify it passes**：同一命令，预期全部通过。
- [ ] **Step 5: Commit**：`git add` 仅列出契约、服务、存储和测试，提交 `feat(drama-lab): add persisted tail frame extraction`。

### Task 2: 提取、候选确认、上传和锁定路由

**Files:**
- Create: `web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/extract-tail-frame/route.ts`
- Create: `web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/accept-first-frame-candidate/route.ts`
- Create: `web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/frames/upload/route.ts`
- Create: `web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/frames/[frameType]/lock/route.ts`
- Test: 对应四个 Route 测试文件

**Interfaces:**
- 提取 Route：`POST .../extract-tail-frame?episodeId=`。
- 确认 Route：`POST .../accept-first-frame-candidate?episodeId=&candidateId=&replaceExisting=`。
- 上传 Route：`POST .../frames/upload?episodeId=&frameType=first|key|last`，multipart `file`，可选 `prompt`/`description`。
- 锁定 Route：`POST .../frames/:frameType/lock?episodeId=`，JSON `{ locked: boolean }`。

- [ ] **Step 1: Write the failing tests**：覆盖登录/权限、参数、提取成功与错误映射、已有首帧不覆盖、显式替换保留历史、上传格式限制、锁定帧拒绝后台修改和项目版本冲突。
- [ ] **Step 2: Run tests to verify they fail**：运行四个新增 Route 测试，预期 Route 文件不存在或行为缺失。
- [ ] **Step 3: Write minimal implementation**：统一使用 `getDramaProject`、`persistDramaLabShotUpdate`、用户归属任务校验；上传通过 `writePersistentMediaDataUrl`；确认只接受项目内候选 ID，默认 `replaceExisting=false`。
- [ ] **Step 4: Run tests to verify they pass**：运行四个测试文件，预期全部通过。
- [ ] **Step 5: Commit**：`feat(drama-lab): expose tail frame candidate workflow`。

### Task 3: 视频引用角色与任务快照

**Files:**
- Modify: `web/src/lib/server/drama-lab-shot-generation-service.ts`
- Modify: `web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/generate-video/route.ts`
- Modify: `web/src/lib/server/video-task-config.ts`（仅在短剧引用契约需要的平台兼容处）
- Test: `web/src/lib/server/drama-lab-shot-generation-service.test.ts`
- Test: `web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/generate-video/route.test.ts`

**Interfaces:**
- `prepareDramaLabStoryboardVideo` 返回带 `role: "first_frame" | "last_frame" | "reference"` 的引用和 `frameSnapshot`。
- 首帧/尾帧按模型能力传递；不支持尾帧时只降级为首帧并记录原因，不静默当普通参考图。

- [ ] **Step 1: Write failing tests**：覆盖首尾帧角色、当前镜头资产白名单、首尾帧来源和任务 ID 快照、尾帧不支持时的明确降级。
- [ ] **Step 2: Run tests to verify failure**：运行两个定向测试文件，预期现有返回值不含角色和快照。
- [ ] **Step 3: Implement minimal changes**：从当前 `frames` 构造角色化引用和不可变快照，保留现有唯一参考图兼容逻辑；路由将快照写入 `context`。
- [ ] **Step 4: Run tests to verify pass**：运行两个定向测试文件。
- [ ] **Step 5: Commit**：`feat(drama-lab): preserve frame roles in video tasks`。

### Task 4: 同步保护和工作台交互

**Files:**
- Modify: `web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/sync-generation/route.ts`
- Modify: `web/src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx`
- Test: `web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/sync-generation/route.test.ts`
- Test: `web/src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.test.tsx`（如现有页面测试基础允许）

**Interfaces:**
- 已锁定帧不能被任务同步覆盖；任务状态同步保留来源字段、候选和历史。
- UI 提供提取末帧、候选预览/确认/保留、来源/锁定标识和明确错误提示；刷新后完全由服务端状态恢复。

- [ ] **Step 1: Write failing tests**：覆盖锁定帧同步保护、候选状态渲染/动作调用、无下一镜和任务失败提示。
- [ ] **Step 2: Run tests to verify failure**：运行同步 Route 和页面测试，预期缺少锁定保护/UI 行为。
- [ ] **Step 3: Implement minimal changes**：在 `generationPatch` 中只更新任务拥有字段；增加候选动作和逐镜头 busy key，所有请求失败显示可读提示。
- [ ] **Step 4: Run tests to verify pass**：运行定向测试并手动检查桌面/390px 布局。
- [ ] **Step 5: Commit**：`feat(drama-lab): add frame continuity controls`。

### Task 5: 集成验证与阶段交付

**Files:**
- Modify: `docs/superpowers/plans/2026-09-01-drama-lab-complete-migration.md`
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Create: `docs/superpowers/reports/2026-09-01-drama-lab-frame-continuity.md`

- [ ] **Step 1: Run targeted tests**：服务、四个 Route、同步、视频引用相关测试全部通过。
- [ ] **Step 2: Run project checks**：`npm run typecheck`、`npm run lint`、`git diff --check`。
- [ ] **Step 3: Review scope**：确认 `git diff --name-only` 只包含短剧契约/服务/Route/UI/文档，不包含普通 Canvas 和用户运行产物。
- [ ] **Step 4: Write delivery report**：列出已实现、未实现、测试命令、FFmpeg/真实供应商人工验收步骤。
- [ ] **Step 5: Commit**：`git add` 显式列出 Phase 2A 文件，提交 `feat(drama-lab): complete phase 2a frame continuity`。
