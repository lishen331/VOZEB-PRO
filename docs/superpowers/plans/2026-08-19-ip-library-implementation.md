# IP 库实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 每个任务先写失败测试，再写最小实现；任务完成后运行定向测试、`pnpm typecheck`，并单独提交。

**Goal:** 在现有社区、素材、媒体、学校租户、Canvas、短剧和无限练习能力上增加平台 IP 库，让平台管理员录入并发布 IP、授权学校，师生按授权查看、引用、下载和线下创作。

**Architecture:** IP 库作为独立内容域，复用现有素材和媒体存储，不把 IP 降级为普通素材。`ip_packages` 管理 IP 范围和授权策略，`ip_versions` 管理不可变发布版本，`ip_items` 引用文本或现有媒体，学校授权和下载/引用记录单独持久化。用户端通过 `/ip-library` 进入社区分组，服务端从 Session 和 school context 派生学校，不信任客户端 `schoolId`；Canvas、短剧和无限练习只保存 IP 版本引用。

**Tech Stack:** Next.js App Router、React、TypeScript、Ant Design、Tailwind CSS、PostgreSQL、现有文件 Provider 回退、Vitest、Playwright、现有媒体签名下载和学校访问服务。

## Global Constraints

- 以 `docs/superpowers/specs/2026-08-19-ip-library-design.md` 为产品基线；实现发现冲突时先更新规格和本计划。
- IP 前端只有“公共 IP”和“本校 IP”；独家授权只显示标签，多校授权只在后台展示。
- 公共 IP 对所有已登录用户开放查看、使用和下载；本校 IP 只对当前学校 active teacher、active student 和学校管理员开放。
- 平台管理员 `admin` 身份不绕过学校授权；后台 IP 管理和用户端 IP 使用是两套鉴权。
- 只有平台管理员在后台录入、编辑和发布 IP；不建设线上投稿、版权方审核或学校投稿流程。
- 发布版本不可变；新编辑创建草稿并发布新版本，项目、使用和下载记录绑定具体 `ipVersionId`。
- 图片、音频和视频复用现有资产/媒体存储，展示使用限宽变体，下载返回原始文件或完整 ZIP 包。
- 线上第一期不校验作品公开发布和商单使用权限，不做学校结算；只记录引用和下载。
- 所有学校接口从当前 Session 派生 `schoolId`；跨校实体按 404 处理，下载和引用前重新校验授权。
- PostgreSQL 在线查询必须按范围、学校、版本、状态和分页定向执行；禁止读取全量 IP 或全量素材后在 Node.js 筛选。
- 管理后台 IP 内容使用 `content.manage`，学校授权使用 `education.manage`；同一后台分区按 Tab 对权限做细分，不新增管理员权限类型。
- 中文源码、配置、测试和文档使用 UTF-8；收尾执行严格解码、乱码扫描、`git diff --check`、类型检查和浏览器回归。

---

## Task 1: 固定 IP 领域契约与权限规则

**Files:**

- Create: `web/src/lib/ip-library-domain.ts`
- Create: `web/src/lib/ip-library-domain.test.ts`
- Modify: `web/src/lib/school-domain.ts`
- Modify: `web/src/lib/school-domain.test.ts`

**Interfaces:**

```ts
export type IpVisibility = "public" | "school";
export type IpAuthorizationMode = "multi_school" | "exclusive";
export type IpStatus = "draft" | "published" | "disabled";
export type IpVersionStatus = "draft" | "published" | "disabled";
export type IpAssetKind = "text" | "image" | "audio" | "video";
export type IpUsageAction = "reference" | "download_item" | "download_package";
export type IpReference = { type: "ip"; id: string; versionId: string; itemIds: string[] };
```

`normalizeIpReference` 必须去除空 ID、拒绝重复 item ID、拒绝未知 type，并保留 IP 与版本的稳定 ID。`normalizeIpItemCategory` 只接受第一期文本、图片、音频和视频类别；图片类别至少包含 `character`、`scene`、`prop`、`effect`、`style`，视频类别至少包含 `trailer`、`action`、`performance`、`shot`、`clip`。

- [ ] **Step 1: 写失败测试**

  测试公共/本校可见性、`multi_school`/`exclusive` 授权模式、版本状态、媒体分类、重复 IP 引用和未知 IP 引用均按契约处理。

- [ ] **Step 2: 运行失败测试**

  Run: `cd web; pnpm exec vitest run src/lib/ip-library-domain.test.ts src/lib/school-domain.test.ts`

  Expected: FAIL，因为新类型和归一化函数尚不存在。

- [ ] **Step 3: 实现最小领域契约**

  在 `ip-library-domain.ts` 导出上述类型、分类常量、`normalizeIpReference(value: unknown): IpReference | null` 和 `ipAuthorizationLabel(mode)`。在 `school-domain.ts` 扩展内容引用的类型归一化，使后续学校成果引用可以保存 IP 引用，但不改变已有 `work/canvas/drama/asset/generation` 语义。

- [ ] **Step 4: 运行测试与类型检查**

  Run: `cd web; pnpm exec vitest run src/lib/ip-library-domain.test.ts src/lib/school-domain.test.ts; pnpm typecheck`

- [ ] **Step 5: 提交**

  ```bash
  git add web/src/lib/ip-library-domain.ts web/src/lib/ip-library-domain.test.ts web/src/lib/school-domain.ts web/src/lib/school-domain.test.ts
  git commit -m "feat: define IP library domain contracts"
  ```

## Task 2: 建立 IP、版本、内容项、学校授权和使用记录数据层

**Files:**

- Create: `web/src/lib/server/database/schema-ip-library.ts`
- Create: `web/src/lib/server/database/ip-library-repository.ts`
- Create: `web/src/lib/server/database/ip-library-repository.test.ts`
- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `web/src/lib/server/database/repository-types.ts`
- Modify: `web/src/lib/server/database/repositories.ts`
- Modify: `web/src/lib/server/database/repositories.test.ts`

**Interfaces:**

新增表和关键约束：

```text
ip_packages
  id, title, slug, summary, cover_asset_id, visibility, authorization_mode,
  status, current_version_id, created_by_user_id, created_at, updated_at

ip_versions
  id, ip_id, version_number, title, summary, status, manifest_json,
  published_at, created_by_user_id, created_at

ip_items
  id, version_id, kind, category, title, summary, text_content,
  asset_id, sort_order, created_at

ip_school_grants
  id, ip_id, school_id, mode, status, starts_at, ends_at,
  created_by_user_id, created_at, updated_at

ip_usage_records
  id, ip_id, version_id, item_ids_json, school_id, user_id,
  action, target_type, target_id, created_at
```

`ip_school_grants` 必须有 `(ip_id, school_id)` 的历史查询索引和“同一 IP 同时只能存在一个有效 exclusive grant”的唯一约束；`ip_items.asset_id` 只保存稳定 ID，不把源文件或签名 URL 写入 JSON。`manifest_json` 只能由服务端 sanitizer 生成，禁止接受任意客户端 JSON。

- [ ] **Step 1: 写 PostgreSQL 失败测试**

  测试 IP/版本/内容项 round-trip，发布版本不可覆盖，公共 IP 无需授权即可读取，本校 IP 需要有效 grant，独家授权冲突被拒绝，多校授权可以绑定多个学校，使用/下载记录按学校和用户定向查询。

- [ ] **Step 2: 运行失败测试**

  Run: `cd web; $env:VOZEB_PRO_RUN_POSTGRES_INTEGRATION="1"; pnpm exec vitest run src/lib/server/database/ip-library-repository.test.ts --no-file-parallelism`

  Expected: FAIL，因为表、repository 和约束尚不存在。

- [ ] **Step 3: 实现 Schema 和 repository**

  在 `schema-ip-library.ts` 定义建表 SQL，并从 `schema.ts` 的统一初始化入口导入。repository 至少导出：

  ```ts
  createIpPackage(input): Promise<IpPackageRecord>;
  createIpDraftVersion(ipId, input): Promise<IpVersionRecord>;
  publishIpVersion(ipId, versionId): Promise<IpVersionRecord>;
  listVisibleIps(scope, page): Promise<PageResult<IpSummary>>;
  getVisibleIp(userId, ipId, versionId?): Promise<IpDetail | null>;
  createSchoolGrant(input): Promise<IpSchoolGrantRecord>;
  recordIpUsage(input): Promise<IpUsageRecord>;
  listIpUsage(input): Promise<PageResult<IpUsageRecord>>;
  ```

  所有用户端读取使用 `(user_id, school_id, ip_id, version_id, status)` 定向条件；管理员查询使用分页和显式状态条件。

- [ ] **Step 4: 运行真实 PostgreSQL 回归和类型检查**

  Run: `cd web; $env:VOZEB_PRO_RUN_POSTGRES_INTEGRATION="1"; pnpm exec vitest run src/lib/server/database/ip-library-repository.test.ts src/lib/server/database/repositories.test.ts --no-file-parallelism; pnpm typecheck`

- [ ] **Step 5: 更新数据库文档并提交**

  在 `docs/content/docs/backend/backend-database.mdx` 增加五张 IP 表、索引、唯一约束、版本不可变规则和下载记录字段。

  ```bash
  git add web/src/lib/server/database/schema-ip-library.ts web/src/lib/server/database/ip-library-repository.ts web/src/lib/server/database/ip-library-repository.test.ts web/src/lib/server/database/schema.ts web/src/lib/server/database/repository-types.ts web/src/lib/server/database/repositories.ts web/src/lib/server/database/repositories.test.ts docs/content/docs/backend/backend-database.mdx
  git commit -m "feat: persist IP library versions and grants"
  ```

## Task 3: 实现 IP 可见性、学校授权和版本服务

**Files:**

- Create: `web/src/lib/server/ip-library-access-service.ts`
- Create: `web/src/lib/server/ip-library-service.ts`
- Create: `web/src/lib/server/ip-library-service.test.ts`
- Modify: `web/src/lib/server/school-content-reference-service.ts`
- Modify: `web/src/lib/server/school-content-reference-service.test.ts`

**Interfaces:**

```ts
requireVisibleIp(userId: string, ipId: string, versionId?: string): Promise<IpAccessContext>;
listIpLibraryForUser(userId: string, input: IpListInput): Promise<PageResult<IpSummary>>;
getIpDetailForUser(userId: string, ipId: string, versionId?: string): Promise<IpDetail>;
createIpUsageForUser(userId: string, input: IpUsageInput): Promise<IpUsageRecord>;
```

`requireVisibleIp` 的顺序固定为：Session/账号状态、公共 IP 判断、`requireActiveSchoolContext`、当前学校有效 grant、版本状态和 item 白名单。服务端从 context 派生 `schoolId`，不接受客户端授权用 `schoolId`。管理员后台使用独立的 `requireAdminPermission`，不调用用户端学校授权作为后台权限。

- [ ] **Step 1: 写失败测试**

  覆盖公共 IP 登录用户可读、普通用户读不到本校 IP、学校 A 读不到学校 B、停用/到期/撤销 grant 被拒绝、历史版本可按记录读取、管理员不借用学校 context、IP 引用重复和跨版本 item 被拒绝。

- [ ] **Step 2: 实现 access/service**

  `listIpLibraryForUser` 的 `scope=school` 在无 active school context 时返回空列表或 403，页面入口与 API 保持一致；`getIpDetailForUser` 只返回当前用户有权访问的公开版本；`createIpUsageForUser` 校验目标类型为 `canvas|drama|practice|download` 并写入版本、学校、用户和内容项。

- [ ] **Step 3: 接入现有内容引用校验**

  `school-content-reference-service.ts` 在处理 IP 引用时调用 `requireVisibleIp`，只返回标题和安全预览信息；不把原始文本、storage key、签名 URL 或完整 IP manifest 写入学校提交记录。

- [ ] **Step 4: 运行测试、类型检查和提交**

  Run: `cd web; pnpm exec vitest run src/lib/server/ip-library-service.test.ts src/lib/server/school-content-reference-service.test.ts; pnpm typecheck`

  ```bash
  git add web/src/lib/server/ip-library-access-service.ts web/src/lib/server/ip-library-service.ts web/src/lib/server/ip-library-service.test.ts web/src/lib/server/school-content-reference-service.ts web/src/lib/server/school-content-reference-service.test.ts
  git commit -m "feat: enforce IP visibility and school grants"
  ```

## Task 4: 增加用户端 IP API、下载和 ZIP 资源包

**Files:**

- Create: `web/src/app/api/ip-library/route.ts`
- Create: `web/src/app/api/ip-library/[id]/route.ts`
- Create: `web/src/app/api/ip-library/[id]/download/route.ts`
- Create: `web/src/app/api/ip-library/route.test.ts`
- Create: `web/src/app/api/ip-library/[id]/route.test.ts`
- Create: `web/src/app/api/ip-library/[id]/download/route.test.ts`
- Create: `web/src/services/api/ip-library.ts`
- Create: `web/src/services/api/ip-library.test.ts`
- Create: `web/src/lib/server/ip-library-download-service.ts`
- Create: `web/src/lib/server/ip-library-download-service.test.ts`

**Interfaces:**

```text
GET  /api/ip-library?scope=public|school&page&pageSize&keyword&kind&category
GET  /api/ip-library/:id?versionId=...
POST /api/ip-library/:id/download
     { versionId, itemIds?: string[], package: boolean }
```

下载响应只能返回短期签名 URL 或当前请求生成的 ZIP 结果，不返回长期对象存储地址。`package=true` 的 ZIP 必须包含服务端生成的 `README.md` 和 `manifest.json`，manifest 只包含 IP 名称、版本、目录、来源/署名说明和允许的公共元数据。

- [ ] **Step 1: 写 Route Handler 和下载失败测试**

  覆盖 401、普通用户访问 school scope 403/空列表、跨校 404、未发布版本 404、无权 item 403、单项原文件下载、完整 ZIP 结构、重复下载记录和签名 URL 不持久化。

- [ ] **Step 2: 实现 API 与下载服务**

  Route Handler 只做 Session、schema、service 调用和 `{ code, data, msg }` 映射；`ip-library-download-service.ts` 复用现有媒体签名/下载能力，在生成 ZIP 前按 item 顺序读取已授权的原始文件。

- [ ] **Step 3: 运行定向测试和提交**

  Run: `cd web; pnpm exec vitest run src/app/api/ip-library src/services/api/ip-library.test.ts src/lib/server/ip-library-download-service.test.ts; pnpm typecheck`

  ```bash
  git add web/src/app/api/ip-library web/src/services/api/ip-library.ts web/src/services/api/ip-library.test.ts web/src/lib/server/ip-library-download-service.ts web/src/lib/server/ip-library-download-service.test.ts
  git commit -m "feat: expose IP library and downloads"
  ```

## Task 5: 增加平台管理员 IP 内容和学校授权后台

**Files:**

- Create: `web/src/app/api/admin/ip-library/route.ts`
- Create: `web/src/app/api/admin/ip-library/[id]/route.ts`
- Create: `web/src/app/api/admin/ip-library/[id]/versions/route.ts`
- Create: `web/src/app/api/admin/ip-library/[id]/schools/route.ts`
- Create: `web/src/app/api/admin/ip-library/[id]/schools/[grantId]/route.ts`
- Create: `web/src/app/api/admin/ip-library/usage/route.ts`
- Create: `web/src/app/api/admin/ip-library/route.test.ts`
- Create: `web/src/app/api/admin/ip-library/[id]/route.test.ts`
- Create: `web/src/app/api/admin/ip-library/[id]/versions/route.test.ts`
- Create: `web/src/app/api/admin/ip-library/[id]/schools/route.test.ts`
- Create: `web/src/app/api/admin/ip-library/usage/route.test.ts`
- Create: `web/src/services/api/admin-ip-library.ts`
- Create: `web/src/services/api/admin-ip-library.test.ts`
- Create: `web/src/app/admin/ip-library/components/admin-ip-library-section.tsx`
- Create: `web/src/app/admin/ip-library/components/admin-ip-library-section.test.tsx`
- Modify: `web/src/components/admin/admin-sections.ts`
- Modify: `web/src/components/admin/admin-section-nav.tsx`
- Modify: `web/src/components/admin/admin-dashboard.tsx`
- Modify: `web/src/components/admin/admin-section-preload.test.ts`
- Modify: `web/src/components/admin/admin-sections.test.ts`

**Interfaces:**

```text
GET/POST   /api/admin/ip-library
GET/PATCH  /api/admin/ip-library/:id
POST       /api/admin/ip-library/:id/versions
POST       /api/admin/ip-library/:id/schools
PATCH      /api/admin/ip-library/:id/schools/:grantId
GET        /api/admin/ip-library/usage
```

`content.manage` 负责 IP 草稿、内容项、版本和发布；`education.manage` 负责学校授权；后台分区可以对拥有任一权限的管理员可见，但每个 Tab 和按钮由服务端再次校验对应职责。审计 action 使用 `admin.ip.*`，metadata 只记录稳定 ID、版本、学校 ID、授权模式和状态，不记录原始文本、签名 URL 或完整 manifest。

- [ ] **Step 1: 写后台 API 和权限失败测试**

  覆盖内容管理员不能授权学校，教育管理员不能编辑 IP 内容，完整管理员可完成全部操作；独家授权冲突、无效时间窗、停用 IP、未发布版本授权和跨校 grant 修改均被拒绝。

- [ ] **Step 2: 实现后台 service、route 和页面**

  后台页面采用现有“列表/卡片 + 创建按钮 + Modal/Drawer”模式：IP 内容列表、版本 Drawer、学校授权表格、使用记录分页表。创建和编辑只在 Modal/Drawer 里发生，发布新版本保留旧版本只读。

- [ ] **Step 3: 注册后台分区和动态加载**

  在 `admin-sections.ts` 增加 `ipLibrary`，权限为 `content.manage` 或 `education.manage`；在 `admin-section-nav.tsx` 放入“内容运营”分组；在 `admin-dashboard.tsx` 用已有 pointer/focus 意图预加载，不把 IP 管理页面带入首屏包。

- [ ] **Step 4: 运行测试、类型检查和提交**

  Run: `cd web; pnpm exec vitest run src/app/api/admin/ip-library src/services/api/admin-ip-library.test.ts src/app/admin/ip-library/components/admin-ip-library-section.test.tsx src/components/admin/admin-sections.test.ts src/components/admin/admin-section-preload.test.ts; pnpm typecheck`

  ```bash
  git add web/src/app/api/admin/ip-library web/src/services/api/admin-ip-library.ts web/src/services/api/admin-ip-library.test.ts web/src/app/admin/ip-library web/src/components/admin/admin-sections.ts web/src/components/admin/admin-section-nav.tsx web/src/components/admin/admin-dashboard.tsx web/src/components/admin/admin-section-preload.test.ts web/src/components/admin/admin-sections.test.ts
  git commit -m "feat: add IP library administration"
  ```

## Task 6: 实现社区 IP 库列表、详情和分区展示

**Files:**

- Create: `web/src/app/(user)/ip-library/page.tsx`
- Create: `web/src/app/(user)/ip-library/[id]/page.tsx`
- Create: `web/src/app/(user)/ip-library/components/ip-library-page.tsx`
- Create: `web/src/app/(user)/ip-library/components/ip-library-detail.tsx`
- Create: `web/src/app/(user)/ip-library/components/ip-library-section.tsx`
- Create: `web/src/app/(user)/ip-library/components/ip-library-page.test.tsx`
- Create: `web/src/app/(user)/ip-library/components/ip-library-detail.test.tsx`
- Modify: `web/src/constant/navigation-tools.ts`
- Modify: `web/src/constant/navigation-tools.test.ts`

**Interfaces:**

用户端页面必须调用 `ipLibraryApi`，不得直接 `fetch` 或把业务列表放入 localStorage/IndexedDB。页面使用四个内容大区：文本、图片素材、音乐与声音、视频参考；图片区再按角色、场景、道具、特效和风格参考分组。每个大区使用现有卡片、预览和分页模式，提供“查看全部”。

- [ ] **Step 1: 写页面失败测试**

  测试导航在“社区”分组显示 `IP库`；公共/本校切换；普通用户不出现本校 IP；本校成员看到本校 IP；独家授权显示标签，多校授权不出现多校文案；详情四个大区和图片子分类都存在；无权详情不渲染文件 URL。

- [ ] **Step 2: 实现列表和详情页面**

  顶部信息区展示封面、版本、范围、简介和“独家授权”标签；主操作为“一键使用”和“下载资源包”。“一键使用”打开 Canvas、短剧、无限练习目标选择，再复用现有项目创建/打开流程；内容区只读预览，文本不提供平台内编辑。

- [ ] **Step 3: 接入社区导航和响应式布局**

  在 `navigation-tools.ts` 增加 `ip-library` 为 `community` 分组工具，使用现有图标和 `/ip-library` 路由；桌面、390px、430px 下保持卡片不横向溢出，长文本和媒体在内部滚动容器中可读。

- [ ] **Step 4: 运行组件测试和提交**

  Run: `cd web; pnpm exec vitest run src/app/'(user)'/ip-library/components src/constant/navigation-tools.test.ts; pnpm typecheck`

  ```bash
  git add web/src/app/'(user)'/ip-library web/src/constant/navigation-tools.ts web/src/constant/navigation-tools.test.ts
  git commit -m "feat: add community IP library pages"
  ```

## Task 7: 将 IP 引用接入 Canvas、短剧和无限练习

**Files:**

- Create: `web/src/lib/server/ip-library-reference-service.ts`
- Create: `web/src/lib/server/ip-library-reference-service.test.ts`
- Modify: `web/src/lib/server/canvas-project-service.ts`
- Modify: `web/src/lib/server/drama-project-service.ts`
- Modify: `web/src/lib/server/practice-project-service.ts`
- Modify: `web/src/lib/server/practice-session-service.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-assets-panel.tsx`
- Modify: `web/src/app/(user)/drama/[id]/drama-assets-panel.tsx`
- Modify: `web/src/app/(user)/practice/components/practice-module-workbench.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-assets-panel.test.ts`
- Modify: `web/src/app/(user)/drama/[id]/drama-assets-panel.test.ts`
- Modify: `web/src/app/(user)/practice/components/practice-module-workbench.test.tsx`

**Interfaces:**

```ts
validateIpReferences(userId: string, references: IpReference[]): Promise<IpReferencePreview[]>;
recordIpReferenceUsage(userId: string, input: { targetType: "canvas" | "drama" | "practice"; targetId: string; references: IpReference[] }): Promise<void>;
```

所有引用先调用 `validateIpReferences`，确保 IP 版本已发布、内容项属于该版本、当前用户有公共访问或当前学校 grant。Canvas/短剧/练习保存稳定引用，不保存原始文本、对象存储 key 或签名 URL。编辑器内 IP 选择器复用 IP API 和现有素材面板布局。

- [ ] **Step 1: 写跨工作区失败测试**

  覆盖公共 IP 被 Canvas 使用、本校 IP 被授权学校使用、跨校引用 404、撤销授权后新引用 403、引用旧版本可追溯、同一 item 重复引用被拒绝、练习 session 记录正确 IP 版本。

- [ ] **Step 2: 实现引用 service 和持久化字段**

  使用 `ip-library-reference-service.ts` 统一校验和记录；Canvas/Drama 项目和 practice session 只增加 `ipReferences` 稳定数组或关联表，不改变正式/练习 execution profile，也不改变现有积分规则。

- [ ] **Step 3: 接入三个前端工作区**

  Canvas、短剧和无限练习增加“引用 IP”入口；选择 IP 后显示缩略图/标题/版本，删除引用只移除当前项目关联，不删除 IP 素材。生成提交把引用 ID 交给服务端，模型执行提示词仍由现有规划器内部生成。

- [ ] **Step 4: 运行测试、类型检查和提交**

  Run: `cd web; pnpm exec vitest run src/lib/server/ip-library-reference-service.test.ts src/app/'(user)'/canvas/components/canvas-assets-panel.test.ts src/app/'(user)'/drama/[id]/drama-assets-panel.test.ts src/app/'(user)'/practice/components/practice-module-workbench.test.tsx; pnpm typecheck`

  ```bash
  git add web/src/lib/server/ip-library-reference-service.ts web/src/lib/server/ip-library-reference-service.test.ts web/src/lib/server/canvas-project-service.ts web/src/lib/server/drama-project-service.ts web/src/lib/server/practice-project-service.ts web/src/lib/server/practice-session-service.ts web/src/app/'(user)'/canvas/components/canvas-assets-panel.tsx web/src/app/'(user)'/drama/[id]/drama-assets-panel.tsx web/src/app/'(user)'/practice/components/practice-module-workbench.tsx
  git commit -m "feat: reference IP content in creative workspaces"
  ```

## Task 8: 完成数据库文档、接口证据和端到端验收

**Files:**

- Create: `web/e2e/ip-library.spec.ts`
- Modify: `web/e2e/all-pages.spec.ts`
- Modify: `web/e2e/support.ts`
- Modify: `docs/progress/page-api-evidence.md`
- Modify: `VOZEB-PRO-接口索引.md`

**Interfaces:**

浏览器验收必须覆盖平台管理员录入/发布 IP、设置多校和独家授权、教师/学生查看本校 IP、IP 详情分区、引用到三个工作区、单项下载和完整 ZIP 下载。

- [ ] **Step 1: 写浏览器失败场景**

  使用真实登录 context 准备公共 IP、学校 A 多校授权、学校 B 多校授权和学校 C 独家授权。断言普通用户只能看到公共 IP，学校 A/B 看到各自本校 IP，学校 C 独家授权阻止其他学校读取；多校授权标签不出现在用户端。

- [ ] **Step 2: 实现端到端闭环**

  依次验证：管理员创建草稿、发布 v1、授权学校、发布 v2；学校用户查看 v2、引用到 Canvas/短剧/练习、下载单项和 ZIP；刷新后仍按服务端恢复；撤销授权后新的详情/引用/下载失败，历史 usage record 仍可查询。

- [ ] **Step 3: 更新证据文档**

  `page-api-evidence.md` 记录 `/ip-library`、详情、后台 IP 管理和下载页面到 API/service/repository 的证据链；`VOZEB-PRO-接口索引.md` 记录用户端与管理员端路由、权限、错误码和公开字段范围。

- [ ] **Step 4: 执行全量质量门禁**

  ```powershell
  $strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
  $changed = git diff --name-only --diff-filter=ACMR | Where-Object { $_ -match '\.(ts|tsx|md|mdx|json|yaml|yml)$' }
  foreach ($file in $changed) { [void]$strictUtf8.GetString([System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $file))) }
  foreach ($file in $changed) { $lines = Get-Content -Encoding UTF8 -LiteralPath $file; if ($lines -match '�|锟斤拷') { throw "乱码: $file" } }
  git diff --check
  cd web
  pnpm check:release
  pnpm e2e
  ```

- [ ] **Step 5: 最终验收**

  验收必须证明：公共/本校入口正确、独家标签正确、多校授权只在后台、IP 版本可追溯、学校隔离有效、下载可用、线下下载不被假设为可回收、Canvas/短剧/无限练习原有流程不回归。

- [ ] **Step 6: 提交**

  ```bash
  git add web/e2e/ip-library.spec.ts web/e2e/all-pages.spec.ts web/e2e/support.ts docs/progress/page-api-evidence.md VOZEB-PRO-接口索引.md
  git commit -m "test: verify IP library authorization and download flows"
  ```

## 完成定义

只有以下条件全部满足，才能声明 IP 库第一期完成：

1. Task 1-8 的定向测试、`pnpm typecheck`、`pnpm check:release` 和 Playwright 通过。
2. 平台管理员可以录入、编辑、发布 IP 和新版本，并按多校/独家模式授权学校。
3. 用户端只有公共 IP、本校 IP 两类入口，独家标签显示正确，多校授权不泄露。
4. IP 详情按文本、图片、音乐与声音、视频参考分区展示，图片含角色、场景、道具等分类。
5. Canvas、短剧和无限练习可以引用指定 IP 版本，引用记录和下载记录可追溯。
6. 单项下载和完整 IP 包下载可用；授权撤销后禁止新的访问，但不声称能回收线下文件。
7. 未实现线上投稿、复杂版权规则、公开发布限制、商单限制和线上结算。
