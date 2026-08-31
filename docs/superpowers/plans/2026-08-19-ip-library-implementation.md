# IP 库第一期增量改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在保留现有 IP 库页面、权限和版本骨架的基础上，把 IP 内容从个人素材引用改为平台独立文件上传，补齐后台真实预览、学校整套开放和原文件下载，并删除第一期不再需要的 Canvas、短剧、无限练习引用能力。

**Architecture:** `ip_packages` 保存稳定 IP 身份，`ip_versions` 保存不可变发布快照，`ip_content_files` 保存不属于个人的原文件与存储信息，`ip_items` 通过 `fileId` 组织版本内容。平台授权与学校开放共同决定本校访问，用户每次预览和下载都重新经过统一 access service。文件落盘复用现有数据目录、对象存储配置、S3 客户端、媒体检测和签名能力，但不写入 `library_assets` 或强制个人归属的 `local_media_assets`。

**Tech Stack:** Next.js App Router、TypeScript、Ant Design、Tailwind、PostgreSQL/File Provider、Vitest、Playwright、`file-type`、`sharp`、`fflate`、现有对象存储客户端。

**Design source:** `docs/superpowers/specs/2026-08-19-ip-library-design.md`

## 现状与改造边界

当前仓库已经有 IP 主体、版本、学校授权、用户列表/详情、后台管理、下载和 Canvas/短剧/无限练习引用能力。本计划不是从零开发，必须在现有实现上增量修改。

本期必须完成：

- 平台管理员本地上传 TXT、MD、图片、音频和视频。
- 文本在线阅读、图片缩略图、音频试听、视频播放和后台草稿预览。
- IP 文件独立于个人资产，上传管理员只作为审计操作者。
- 多校/独家授权继续存在，新授权的校内开放默认关闭。
- 学校管理员在现有学校管理页整套开放或关闭 IP。
- 用户只查看和下载公共 IP 或当前学校已开放 IP。
- 单项下载保持原始文件名和格式，完整 ZIP 包含封面、目录、版本、来源和 manifest。
- 发布新版本后自动成为最新版本，旧版本、旧文件和下载记录保持可追溯。

本期明确删除：

- “一键使用”和导入 Canvas、短剧、无限练习。
- 项目、生成任务和练习会话中的 `IpReference`、`ipReferences` 与引用使用记录。
- IP 内容对个人 `library_assets.assetId` 的依赖。

## 最终数据契约

```ts
type IpContentFileRecord = {
    id: string;
    ipId: string;
    kind: "text" | "image" | "audio" | "video";
    originalName: string;
    extension: string;
    mimeType: string;
    byteSize: number;
    sha256: string;
    storageProvider: "local" | "object";
    storageKey: string;
    externalStorageId?: string;
    externalObjectKey?: string;
    extractedText?: string;
    metadata: { width?: number; height?: number; durationSeconds?: number };
    status: "processing" | "ready" | "failed";
    errorMessage?: string;
    uploadedByUserId?: string;
    createdAt: string;
};

type IpVersionRecord = {
    id: string;
    ipId: string;
    versionNumber: number;
    title: string;
    summary: string;
    coverFileId?: string;
    tags: string[];
    sourceNote: string;
    changeNote: string;
    status: "draft" | "published" | "disabled";
    items: IpItemRecord[];
    publishedAt?: string;
};

type IpItemRecord = {
    id: string;
    versionId: string;
    fileId: string;
    kind: "text" | "image" | "audio" | "video";
    category: IpItemCategory;
    title: string;
    summary: string;
    sortOrder: number;
};

type IpSchoolGrantRecord = {
    id: string;
    ipId: string;
    schoolId: string;
    mode: "multi_school" | "exclusive";
    status: "active" | "suspended" | "revoked" | "expired";
    startsAt: string;
    endsAt?: string;
    memberAccessEnabled: boolean;
    memberAccessUpdatedByUserId?: string;
    memberAccessUpdatedAt?: string;
};

type IpDownloadRecord = {
    id: string;
    ipId: string;
    versionId: string;
    itemId?: string;
    schoolId?: string;
    userId: string;
    downloadType: "item" | "package";
    result: "succeeded" | "failed";
    createdAt: string;
};
```

`ip_packages.title/summary` 只作为后台草稿识别信息；用户列表和详情必须从最新已发布 `ip_versions` 读取标题、简介、封面、标签和来源快照。授权模式只属于 `ip_school_grants`，不再保存在 `ip_packages`。

## Task 1: 删除第一期之外的 IP 项目引用链路

**Files:**

- Delete: `web/src/components/ip-library/ip-reference-picker.tsx`
- Delete: `web/src/components/ip-library/ip-reference-picker.test.tsx`
- Delete: `web/src/lib/server/ip-library-reference-service.ts`
- Delete: `web/src/lib/server/ip-library-reference-service.test.ts`
- Modify: `web/src/lib/ip-library-domain.ts`
- Modify: `web/src/lib/ip-library-domain.test.ts`
- Modify: `web/src/lib/canvas-project-contract.ts`
- Modify: `web/src/lib/canvas-project-mutation.ts`
- Modify: `web/src/lib/drama-project-contract.ts`
- Modify: `web/src/lib/school-domain.ts`
- Modify: `web/src/lib/school-domain.test.ts`
- Modify: `web/src/lib/server/canvas-project-service.ts`
- Modify: `web/src/lib/server/canvas-project-service.test.ts`
- Modify: `web/src/lib/server/canvas-project-store.ts`
- Modify: `web/src/lib/server/drama-project-service.ts`
- Modify: `web/src/lib/server/drama-project-service.test.ts`
- Modify: `web/src/lib/server/practice-project-service.ts`
- Modify: `web/src/lib/server/practice-project-service.test.ts`
- Modify: `web/src/lib/server/practice-session-service.ts`
- Modify: `web/src/lib/server/practice-session-service.test.ts`
- Modify: `web/src/lib/server/school-content-reference-service.ts`
- Modify: `web/src/lib/server/generation-task-types.ts`
- Modify: `web/src/lib/server/generation-task-store.ts`
- Modify: `web/src/lib/server/generation-task-store.test.ts`
- Modify: `web/src/lib/server/generation-task-recovery-service.ts`
- Modify: `web/src/lib/server/generation-task-recovery-service.test.ts`
- Modify: `web/src/app/api/agent/runs/route.ts`
- Modify: `web/src/app/api/agent/runs/route.test.ts`
- Modify: `web/src/app/api/text-tasks/route.ts`
- Modify: `web/src/app/api/image-tasks/route.ts`
- Modify: `web/src/app/api/image-tasks/route.test.ts`
- Modify: `web/src/app/api/audio-tasks/route.ts`
- Modify: `web/src/app/api/audio-tasks/route.test.ts`
- Modify: `web/src/app/api/video-generation-tasks/video-generation-route.ts`
- Modify: `web/src/app/api/video-generation-tasks/route.test.ts`
- Modify: `web/src/app/api/practice/sessions/route.ts`
- Modify: `web/src/app/api/practice/sessions/route.test.ts`
- Modify: `web/src/services/api/practice.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-assets-panel.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-assets-panel.test.ts`
- Modify: `web/src/app/(user)/canvas/stores/use-canvas-store.ts`
- Modify: `web/src/app/(user)/canvas/page.tsx`
- Modify: `web/src/app/(user)/drama/[id]/drama-assets-panel.tsx`
- Modify: `web/src/app/(user)/drama/[id]/drama-assets-panel.test.ts`
- Modify: `web/src/app/(user)/drama/stores/use-drama-store.ts`
- Modify: `web/src/app/(user)/drama/page.tsx`
- Modify: `web/src/app/(user)/practice/components/practice-home.tsx`
- Modify: `web/src/app/(user)/practice/components/practice-home.test.tsx`
- Modify: `web/src/app/(user)/practice/components/practice-module-workbench.tsx`
- Modify: `web/src/app/(user)/practice/components/practice-module-workbench.test.tsx`

- [ ] **Step 1: 先把现有引用行为改成失败测试**

  页面测试断言 Canvas、短剧和无限练习不存在“引用 IP”选择器；项目与任务测试断言请求、持久化快照和生成 context 不再接受或转发 `ipReferences`。

- [ ] **Step 2: 删除引用类型、服务、UI 和持久化字段**

  删除 `IpReference`、`normalizeIpReference`、项目创建/更新引用校验、生成任务恢复校验和 `reference` 使用记录入口。普通素材引用继续保持现有 `asset` 语义，不影响 Canvas、短剧和无限练习本身。

- [ ] **Step 3: 运行定向测试与类型检查**

  ```powershell
  cd web
  pnpm exec vitest run src/lib/ip-library-domain.test.ts src/lib/server/canvas-project-service.test.ts src/lib/server/drama-project-service.test.ts src/lib/server/practice-project-service.test.ts src/lib/server/practice-session-service.test.ts src/app/api/image-tasks/route.test.ts src/app/api/audio-tasks/route.test.ts src/app/api/video-generation-tasks/route.test.ts src/app/api/practice/sessions/route.test.ts
  pnpm typecheck
  ```

- [ ] **Step 4: 提交**

  ```powershell
  git status --short
  # 逐项暂存本 Task 的 Files 清单，不能使用覆盖整个工作区的宽泛路径。
  git commit -m "refactor: remove IP project references"
  ```

## Task 2: 直接切换 IP 数据结构和 Repository

**Files:**

- Modify: `web/src/lib/server/database/schema-ip-library.ts`
- Modify: `web/src/lib/server/database/postgres.ts`
- Modify: `web/src/lib/server/database/postgres.test.ts`
- Modify: `web/src/lib/server/database/repository-types.ts`
- Modify: `web/src/lib/server/database/ip-library-repository.ts`
- Modify: `web/src/lib/server/database/ip-library-repository.test.ts`
- Modify: `web/src/lib/server/database/repositories.ts`
- Modify: `web/src/lib/server/ip-library-file-repository.ts`
- Modify: `web/src/lib/server/ip-library-service.ts`
- Modify: `web/src/lib/server/ip-library-service.test.ts`

- [ ] **Step 1: 写新结构失败测试**

  覆盖 `ip_content_files`、`fileId` 内容项、版本封面/标签/来源快照、默认关闭的 `memberAccessEnabled`、授权级模式、`ip_download_records` 和已发布文件不可变。测试明确断言 DDL 不再出现 `cover_asset_id`、`asset_id`、`text_content`、包级 `authorization_mode`、`ip_usage_records` 或 `reference` action。

- [ ] **Step 2: 替换 Schema**

  直接按最终结构修改建表 SQL，不写旧字段兼容或旧数据迁移逻辑。新增已发布版本、内容项和已发布内容文件不可变约束；独家/同校重叠授权由事务内校验和数据库触发器共同拒绝。同步更新 `postgres.ts` 的表、索引、函数和触发器注册清单。

- [ ] **Step 3: 替换 Repository 契约**

  PostgreSQL 查询必须按 IP、版本、学校、状态、时间窗和分页定向读取。File Provider 直接使用新版本快照，状态结构改为 `packages/versions/files/grants/downloads`，不为旧 JSON 做兼容。`publishIpVersion` 在同一事务中校验所有文件 `ready`、冻结 manifest 并更新 `currentVersionId`。

- [ ] **Step 4: 运行测试与类型检查**

  ```powershell
  cd web
  pnpm exec vitest run src/lib/server/database/ip-library-repository.test.ts src/lib/server/database/postgres.test.ts src/lib/server/ip-library-service.test.ts --no-file-parallelism
  pnpm typecheck
  ```

- [ ] **Step 5: 提交**

  ```powershell
  git add web/src/lib/server/database/schema-ip-library.ts web/src/lib/server/database/postgres.ts web/src/lib/server/database/postgres.test.ts web/src/lib/server/database/repository-types.ts web/src/lib/server/database/ip-library-repository.ts web/src/lib/server/database/ip-library-repository.test.ts web/src/lib/server/database/repositories.ts web/src/lib/server/ip-library-file-repository.ts web/src/lib/server/ip-library-service.ts web/src/lib/server/ip-library-service.test.ts
  git commit -m "refactor: store IP content in independent files"
  ```

## Task 3: 实现 IP 原文件存储、检测和受控读取

**Files:**

- Create: `web/src/lib/server/ip-library-file-storage.ts`
- Create: `web/src/lib/server/ip-library-file-storage.test.ts`
- Create: `web/src/app/api/admin/ip-library/[id]/files/route.ts`
- Create: `web/src/app/api/admin/ip-library/[id]/files/route.test.ts`
- Create: `web/src/app/api/admin/ip-library/[id]/files/[fileId]/route.ts`
- Create: `web/src/app/api/admin/ip-library/[id]/files/[fileId]/route.test.ts`
- Modify: `web/src/lib/server/data-dir.ts`
- Modify: `web/src/lib/server/ip-library-admin-service.ts`
- Modify: `web/src/lib/server/ip-library-admin-service.test.ts`

**Interfaces:**

```text
POST   /api/admin/ip-library/:id/files              multipart/form-data { file, kind }
GET    /api/admin/ip-library/:id/files/:fileId      inline draft preview or original download
DELETE /api/admin/ip-library/:id/files/:fileId      only when no version/item/download references it
```

- [ ] **Step 1: 写上传与读取失败测试**

  覆盖 TXT/MD 严格 UTF-8、手工正文生成 TXT、真实 MIME 与扩展名不匹配、空文件、SVG/伪媒体拒绝、图片尺寸提取、对象存储和本地存储、跨 IP fileId、非 `content.manage` 管理员、孤立文件清理和已引用文件禁止删除。

- [ ] **Step 2: 实现独立文件存储**

  新增 `ip-library-files` 数据目录。本地模式写入 `ipId/fileId/original.ext`；对象存储启用时使用现有配置和 `putObjectBytes/getObjectBytes/signObjectRead`，对象 key 使用独立 `ip-library/` 前缀。不要写入 `library_assets` 或 `local_media_assets`，避免个人删除流程拥有 IP 文件。

- [ ] **Step 3: 实现格式检测和处理状态**

  媒体使用 `file-type` 与现有白名单确认真实类型，图片使用 `sharp.metadata()` 提取尺寸；TXT/MD 使用严格 UTF-8 解码并保存 `extractedText`。图片缩略图不另造固定尺寸，复用 `createLocalMediaResponse`、`createExternalStorageImagePreviewUrl` 和现有 `normalizeImagePreviewWidth` 按请求生成并缓存限宽 WebP 变体。音视频保留浏览器播放所需 MIME，已有 ffprobe 可用时写入时长，本机缺少时长探测器不能被误判为上传失败。上传成功后写 `ready`，失败写公开错误状态且不得进入可发布版本。

- [ ] **Step 4: 实现后台受控预览**

  Route Handler 每次校验 `content.manage`。本地图片、音频和视频使用 `createLocalMediaResponse`，保留 Range、缩略图变体、`Content-Disposition: inline`、`nosniff` 和私有缓存；对象文件返回短期签名或现有图片预览变体地址。下载原文件时保留经过清理的原始文件名。

- [ ] **Step 5: 运行测试与提交**

  ```powershell
  cd web
  pnpm exec vitest run src/lib/server/ip-library-file-storage.test.ts src/lib/server/ip-library-admin-service.test.ts 'src/app/api/admin/ip-library/[id]/files'
  pnpm typecheck
  git add web/src/lib/server/ip-library-file-storage.ts web/src/lib/server/ip-library-file-storage.test.ts web/src/lib/server/data-dir.ts web/src/lib/server/ip-library-admin-service.ts web/src/lib/server/ip-library-admin-service.test.ts web/src/app/api/admin/ip-library
  git commit -m "feat: upload and preview IP source files"
  ```

## Task 4: 补齐草稿编辑、发布快照和后台 API

**Files:**

- Create: `web/src/app/api/admin/ip-library/[id]/versions/[versionId]/route.ts`
- Create: `web/src/app/api/admin/ip-library/[id]/versions/[versionId]/route.test.ts`
- Modify: `web/src/app/api/admin/ip-library/[id]/versions/route.ts`
- Modify: `web/src/app/api/admin/ip-library/[id]/versions/route.test.ts`
- Modify: `web/src/app/api/admin/ip-library/[id]/route.ts`
- Modify: `web/src/services/api/admin-ip-library.ts`
- Modify: `web/src/services/api/admin-ip-library.test.ts`
- Modify: `web/src/lib/server/ip-library-admin-service.ts`
- Modify: `web/src/lib/server/ip-library-admin-service.test.ts`

**Interfaces:**

```text
POST  /api/admin/ip-library/:id/versions                   create draft from latest or empty
PATCH /api/admin/ip-library/:id/versions/:versionId        replace draft metadata/items atomically
POST  /api/admin/ip-library/:id/versions                   { action: "publish", versionId }
```

- [ ] **Step 1: 写草稿和发布失败测试**

  覆盖新草稿复用旧 `fileId`、替换内容使用新 `fileId`、草稿增删/排序、封面类型校验、文件跨 IP、文件未 ready、发布后版本/内容项/文件只读、重复发布 409、新版本自动成为最新版本且授权/学校开放不重置。

- [ ] **Step 2: 实现版本写服务**

  `AdminIpVersionInput` 使用 `coverFileId/tags/sourceNote/changeNote/items[].fileId`。创建“基于最新版本”的草稿时复制内容项结构并保留稳定文件引用；PATCH 使用事务整体替换草稿快照，避免部分保存。发布时生成 manifest，用户侧以后只读版本快照。

- [ ] **Step 3: 保持职责权限与审计**

  创建、编辑、上传、发布和下架均要求 `content.manage`；审计只记录 IP、版本、fileId、状态和操作者，不记录正文、storage key、签名 URL 或完整 manifest。

- [ ] **Step 4: 运行测试与提交**

  ```powershell
  cd web
  pnpm exec vitest run src/lib/server/ip-library-admin-service.test.ts 'src/app/api/admin/ip-library/[id]/versions' src/services/api/admin-ip-library.test.ts
  pnpm typecheck
  git add web/src/lib/server/ip-library-admin-service.ts web/src/lib/server/ip-library-admin-service.test.ts web/src/app/api/admin/ip-library web/src/services/api/admin-ip-library.ts web/src/services/api/admin-ip-library.test.ts
  git commit -m "feat: edit and publish versioned IP packages"
  ```

## Task 5: 改造后台内容编辑器和真实草稿预览

**Files:**

- Create: `web/src/app/admin/ip-library/components/ip-content-upload.tsx`
- Create: `web/src/app/admin/ip-library/components/ip-content-upload.test.tsx`
- Create: `web/src/app/admin/ip-library/components/ip-content-preview.tsx`
- Create: `web/src/app/admin/ip-library/components/ip-content-preview.test.tsx`
- Modify: `web/src/app/admin/ip-library/components/admin-ip-library-section.tsx`
- Modify: `web/src/app/admin/ip-library/components/admin-ip-library-section.test.tsx`

- [ ] **Step 1: 写后台交互失败测试**

  断言不再出现素材库选择器；文本支持 TXT/MD 上传和手工录入；图片显示缩略图；音频显示可试听播放器；视频显示可播放播放器；文件处理失败明确展示；只有所有引用文件 ready 时发布按钮可用。

- [ ] **Step 2: 实现紧凑上传与预览组件**

  组件放在当前页面私有 `components/` 下。上传按钮按内容类型过滤文件，手工正文由前端生成 `.txt` File 后走同一上传接口；服务端仍重新检测。内容项表单只保存 `fileId`、分类、标题、摘要和排序。

- [ ] **Step 3: 调整后台三个职责区**

  `IP 内容`显示草稿/历史版本和真实预览；`学校授权`显示授权级多校/独家状态；`下载记录`只显示单项/整包下载，不再显示项目引用。维持 `content.manage` 与 `education.manage` 的按钮级和服务端双重校验。

- [ ] **Step 4: 运行组件测试与浏览器窄屏检查**

  ```powershell
  cd web
  pnpm exec vitest run src/app/admin/ip-library/components src/services/api/admin-ip-library.test.ts
  pnpm typecheck
  ```

  使用 Playwright 检查后台桌面、390px、430px：Drawer/Modal 不超出视口，图片、音频、视频预览不撑破内容区，深浅主题按钮与媒体控件可读。

- [ ] **Step 5: 提交**

  ```powershell
  git add web/src/app/admin/ip-library/components
  git commit -m "feat: preview uploaded IP content in admin"
  ```

## Task 6: 增加学校整套开放开关并收紧访问判断

**Files:**

- Create: `web/src/lib/server/school-ip-library-service.ts`
- Create: `web/src/lib/server/school-ip-library-service.test.ts`
- Create: `web/src/app/api/school/ip-library/route.ts`
- Create: `web/src/app/api/school/ip-library/route.test.ts`
- Create: `web/src/app/api/school/ip-library/[grantId]/access/route.ts`
- Create: `web/src/app/api/school/ip-library/[grantId]/access/route.test.ts`
- Create: `web/src/services/api/school-ip-library.ts`
- Create: `web/src/services/api/school-ip-library.test.ts`
- Create: `web/src/app/(user)/school/components/school-ip-access-panel.tsx`
- Create: `web/src/app/(user)/school/components/school-ip-access-panel.test.tsx`
- Modify: `web/src/lib/server/ip-library-access-service.ts`
- Modify: `web/src/lib/server/ip-library-service.ts`
- Modify: `web/src/lib/server/ip-library-service.test.ts`
- Modify: `web/src/lib/server/database/ip-library-repository.ts`
- Modify: `web/src/lib/server/ip-library-file-repository.ts`
- Modify: `web/src/app/(user)/school/school-administration.tsx`
- Modify: `web/src/app/(user)/school/school-administration.test.tsx`

**Interfaces:**

```text
GET   /api/school/ip-library
PATCH /api/school/ip-library/:grantId/access   { enabled: boolean }
```

- [ ] **Step 1: 写授权与开放矩阵失败测试**

  覆盖新授权默认关闭、学校管理员开启/关闭、普通老师/学生不能修改、当前学校从 Session 派生、跨校 grantId 404、暂停后恢复原开放状态、撤销后新授权重新关闭、到期/停用时开关不生效、公共 IP 不经过开关。

- [ ] **Step 2: 实现学校服务和 API**

  `school-ip-library-service` 使用 `requireActiveSchoolContext` 和 `school.manage`。PATCH 只允许修改当前学校授权的 `memberAccessEnabled` 与操作者/时间，并记录 `school.ip.member_access.update` 审计。

- [ ] **Step 3: 统一有效访问条件**

  本校 IP 必须同时满足：IP 已发布、版本已发布、学校和成员 active、grant active、处于时间窗内、`memberAccessEnabled=true`。列表、详情、媒体预览和下载共用同一判断，不允许客户端传 schoolId 决定权限。

- [ ] **Step 4: 接入现有学校管理页**

  增加“IP 开放”区域，显示名称、授权状态、有效期、后台授权类型和校内开关。这里允许学校管理员看到“多校授权/独家授权”，用户端 IP 库仍只对独家显示标签。

- [ ] **Step 5: 运行测试与提交**

  ```powershell
  cd web
  pnpm exec vitest run src/lib/server/school-ip-library-service.test.ts src/lib/server/ip-library-service.test.ts src/app/api/school/ip-library src/services/api/school-ip-library.test.ts src/app/'(user)'/school/components/school-ip-access-panel.test.tsx src/app/'(user)'/school/school-administration.test.tsx
  pnpm typecheck
  git add web/src/lib/server/school-ip-library-service.ts web/src/lib/server/school-ip-library-service.test.ts web/src/lib/server/ip-library-access-service.ts web/src/lib/server/ip-library-service.ts web/src/lib/server/ip-library-service.test.ts web/src/lib/server/database/ip-library-repository.ts web/src/lib/server/ip-library-file-repository.ts web/src/app/api/school/ip-library web/src/services/api/school-ip-library.ts web/src/services/api/school-ip-library.test.ts web/src/app/'(user)'/school
  git commit -m "feat: let schools open authorized IP packages"
  ```

## Task 7: 改造用户预览、原文件下载和 ZIP

**Files:**

- Modify: `web/src/lib/server/ip-library-download-service.ts`
- Modify: `web/src/lib/server/ip-library-download-service.test.ts`
- Modify: `web/src/app/api/ip-library/[id]/cover/route.ts`
- Modify: `web/src/app/api/ip-library/[id]/items/[itemId]/media/route.ts`
- Modify: `web/src/app/api/ip-library/[id]/items/[itemId]/media/route.test.ts`
- Modify: `web/src/app/api/ip-library/[id]/download/route.ts`
- Modify: `web/src/app/api/ip-library/[id]/download/route.test.ts`
- Modify: `web/src/app/api/admin/ip-library/usage/route.ts`
- Modify: `web/src/services/api/ip-library.ts`
- Modify: `web/src/services/api/ip-library.test.ts`

- [ ] **Step 1: 写原文件与权限失败测试**

  覆盖 TXT 下载仍为 `.txt`、MD 仍为 `.md`、手工正文为 `.txt`、图片/音频/视频原文件名不变、对象存储短签名、本地 inline 预览、学校关闭后旧预览 URL 不再经站内接口读取、ZIP 任一文件缺失则整体失败。

- [ ] **Step 2: 改为读取 `ip_content_files`**

  删除 `getLibraryAssetById`、data URL 和 `assetId` 分支。单项预览/下载先由 access service 校验 IP/版本/item，再按 `fileId` 读取。文本预览返回提取正文，原文件下载返回真实上传 bytes。

- [ ] **Step 3: 生成完整 ZIP**

  ZIP 包含原文件、封面、按四大区和图片子分类组织的目录、`README.md`、版本信息、来源/署名说明和 `manifest.json`。使用 `fflate`，保持原文件扩展名；同名文件做稳定去重。任何源文件失败都返回失败，不生成残缺成功包。

- [ ] **Step 4: 只记录下载**

  单项和整包分别写 `ip_download_records`，记录用户、当前学校、IP、版本、item、结果和时间。后台查询按 IP、版本、学校、公开账号 ID、下载类型和时间分页，不保存长期 URL 或正文。

- [ ] **Step 5: 运行测试与提交**

  ```powershell
  cd web
  pnpm exec vitest run src/lib/server/ip-library-download-service.test.ts 'src/app/api/ip-library/[id]/items/[itemId]/media/route.test.ts' 'src/app/api/ip-library/[id]/download/route.test.ts' src/services/api/ip-library.test.ts
  pnpm typecheck
  git add web/src/lib/server/ip-library-download-service.ts web/src/lib/server/ip-library-download-service.test.ts web/src/app/api/ip-library web/src/app/api/admin/ip-library/usage/route.ts web/src/services/api/ip-library.ts web/src/services/api/ip-library.test.ts
  git commit -m "feat: download original IP files and packages"
  ```

## Task 8: 收敛用户端为纯展示与下载

**Files:**

- Modify: `web/src/app/(user)/ip-library/components/ip-library-page.tsx`
- Modify: `web/src/app/(user)/ip-library/components/ip-library-page.test.tsx`
- Modify: `web/src/app/(user)/ip-library/components/ip-library-detail.tsx`
- Modify: `web/src/app/(user)/ip-library/components/ip-library-detail.test.tsx`
- Modify: `web/src/app/(user)/ip-library/components/ip-library-section.tsx`
- Modify: `web/src/app/(user)/ip-library/[id]/page.tsx`

- [ ] **Step 1: 写展示行为失败测试**

  断言页面只有“公共 IP/本校 IP”；普通 C 端不显示本校 Tab；用户侧仅独家授权显示标签；详情不存在“一键使用”、目标选择、Canvas、短剧或无限练习入口；四个内容区都使用真实预览 URL。

- [ ] **Step 2: 实现资源全集详情**

  顶部只保留封面、标题、版本、更新时间、简介、范围标签和“下载资源包”。文本集中只读展示；图片按角色/场景/道具/特效/风格分组并支持缩略图与放大；音乐集中试听；视频集中播放；每项提供原文件下载。

- [ ] **Step 3: 完成响应式和媒体回归**

  在桌面、390px、430px 和深浅主题检查无横向溢出，长文本可读，图片不拉伸，音视频控件不被裁切。使用正常语义点击验证 Tab、预览和下载按钮，不使用 `force` 或固定延时。

- [ ] **Step 4: 运行测试与提交**

  ```powershell
  cd web
  pnpm exec vitest run src/app/'(user)'/ip-library/components
  pnpm typecheck
  git add web/src/app/'(user)'/ip-library
  git commit -m "feat: present IP packages for viewing and download"
  ```

## Task 9: 更新文档并完成端到端质量门禁

**Files:**

- Modify: `web/e2e/ip-library.spec.ts`
- Modify: `web/e2e/all-pages.spec.ts`
- Modify: `web/e2e/support.ts`
- Modify: `docs/content/docs/backend/backend-database.mdx`
- Modify: `docs/progress/page-api-evidence.md`
- Modify: `VOZEB-PRO-接口索引.md`
- Modify: `VOZEB-PRO-开发地图.md`

- [ ] **Step 1: 重写 IP 端到端夹具**

  管理员通过真实 multipart 接口上传 TXT、MD、图片、音频和视频，创建并发布 v1，按多校和独家模式授权学校。学校管理员开启整套 IP 后，老师/学生才能查看和下载；普通用户只能看到公共 IP。

- [ ] **Step 2: 验证完整闭环**

  浏览器依次验证：后台本地上传与草稿真实预览、发布 v1、授权默认关闭、学校开启、用户四区预览、单项原文件下载、完整 ZIP、发布 v2 自动切换、暂停/恢复、关闭、撤销、跨校隔离和历史下载记录。断言任何页面都不存在“一键使用”或 IP 项目引用。

- [ ] **Step 3: 更新项目文档**

  `backend-database.mdx` 记录五张 IP 领域表及约束；`page-api-evidence.md` 记录后台、学校、用户页面到 API/service/repository 的证据链；接口索引和开发地图记录新增文件上传、草稿版本、学校开放、媒体预览和下载路由，并删除项目引用说明。

- [ ] **Step 4: 更新与验证开发地图**

  ```powershell
  pwsh -NoProfile -File .\过程文件\更新开发地图.ps1
  pwsh -NoProfile -File .\过程文件\验证开发文档.ps1
  ```

- [ ] **Step 5: 执行 Mandatory Testing**

  ```powershell
  $strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
  $changed = git diff --name-only --diff-filter=ACMR | Where-Object { $_ -match '\.(ts|tsx|md|mdx|json|yaml|yml)$' }
  foreach ($file in $changed) { [void]$strictUtf8.GetString([System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $file))) }
  $badText = @([string][char]0xFFFD, "$([char]0x951F)$([char]0x65A4)$([char]0x62F7)")
  foreach ($file in $changed) { $text = Get-Content -Raw -Encoding UTF8 -LiteralPath $file; if ($badText | Where-Object { $text.Contains($_) }) { throw "乱码: $file" } }
  git diff --check
  cd web
  pnpm check:release
  pnpm e2e -- ip-library.spec.ts all-pages.spec.ts
  ```

  另外执行全量 `pnpm e2e`；若受已记录的外部服务或环境问题阻塞，保留失败命令、用例和原始错误证据，不跳过检查冒充完成。

- [ ] **Step 6: 检查差异并提交**

  ```powershell
  git status --short
  git diff --check
  git add web/e2e/ip-library.spec.ts web/e2e/all-pages.spec.ts web/e2e/support.ts docs/content/docs/backend/backend-database.mdx docs/progress/page-api-evidence.md VOZEB-PRO-接口索引.md VOZEB-PRO-开发地图.md
  git commit -m "test: verify IP upload authorization and downloads"
  ```

## 完成定义

只有以下条件全部满足，才能声明 IP 库第一期完成：

1. 平台管理员可以本地上传 TXT、MD、图片、音频和视频，并在草稿中真实预览。
2. IP 内容使用独立文件记录；没有个人 `ownerUserId`，不写入个人素材库。
3. 发布版本冻结标题、简介、封面、标签、来源和内容清单，发布后不可修改。
4. 新版本自动成为最新展示/下载版本，旧版本、文件和下载记录可追溯。
5. 新学校授权默认关闭；只有学校管理员整套开放后，本校 active 成员才可访问。
6. 多校和独家授权冲突受 service 与数据库约束保护；用户端只显示独家标签。
7. 单项下载保持原格式，完整 ZIP 不缺文件并含 manifest、版本和来源说明。
8. 用户端不存在“一键使用”，Canvas、短剧和无限练习不存在 IP 引用字段、选择器或任务校验。
9. 跨校详情、媒体和下载地址均不可读取，授权/开放/IP 状态失效后立即阻止新访问。
10. 定向 Vitest、`pnpm typecheck`、`pnpm check:release`、全量 Playwright、UTF-8/乱码检查和开发文档验证全部通过。

## 实施顺序

严格按 Task 1 → 9 执行。Task 1 先删除错误范围，避免继续围绕项目引用扩展旧模型；Task 2 建立最终数据契约；Task 3 → 5 完成平台上传和发布；Task 6 完成学校开放；Task 7 → 8 完成用户预览下载；Task 9 才做全链路验收和文档收口。每个 Task 完成后都必须保留其定向测试与提交，禁止把所有变更堆到最后一次提交。
