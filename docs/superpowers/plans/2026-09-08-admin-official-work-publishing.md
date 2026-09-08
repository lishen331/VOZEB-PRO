# 平台管理员直接发布官方作品实施计划

> **执行人员要求：** 本文仅是实施文档。执行时按任务顺序逐项完成，采用测试驱动开发；不得覆盖工作区现有 RunningHub 无限练习改动。

**目标：** 在管理后台“内容运营 → 作品管理”中新增“发布官方作品”，允许拥有 `content.manage` 权限的平台管理员上传图片、视频、音频并填写作品信息，确认后不经人工审核直接发布到作品广场。

**架构：** 复用现有 `published_works`、`published_work_versions`、`published_work_assets`、公开广场、媒体注册表和对象存储能力，不另建第二套作品系统。用独立的 `publication_origin` 区分“用户投稿”和“官方发布”，用新的后台服务完成“校验媒体 → 创建作品和版本 → 标记已通过 → 设置公开版本”的单事务发布；普通用户原有“草稿 → 提交 → 审核”链路不变。

**技术栈：** Next.js App Router、React、TypeScript、Ant Design、Tailwind、PostgreSQL Repository、Vitest、Playwright。

## 一、已确认的产品边界

1. 只有拥有 `content.manage` 权限的平台管理员可以创建、编辑和直接发布官方作品。
2. 官方作品不进入“待审核”，管理员在发布确认后立即进入作品广场。
3. 普通用户投稿流程保持不变：`创建草稿 → 提交审核 → 管理员审核 → 进入广场`。
4. 第一版支持：
   - 上传图片、视频、音频；
   - 从管理员本人有权使用的永久媒体中选择已有媒体；
   - 设置标题、作品说明、公开提示词、分类、标签、封面和媒体顺序；
   - 作者显示为“平台官方”、自定义官方作者名或不显示作者；
   - 保存草稿、预览、发布、编辑、精选、下架、重新上架和删除。
5. 官方作品默认作者名为“平台官方”，默认公开范围为“作品广场”。
6. 每个官方作品至少有一个内容媒体。封面必须是图片；内容里有图片时默认取第一张图片为封面，只有视频或音频时必须另行上传或选择图片封面。
7. 图片、视频、音频沿用平台现有真实格式检查、对象存储和文件大小限制：图片 20MB、视频 200MB、音频 30MB；不新增拍脑袋数量上限。
8. 发布、编辑、精选、下架、重新上架和删除均记录管理员审计日志。
9. 广场卡片和作品详情显示“官方”标识；后台列表可按“全部 / 用户投稿 / 官方作品”筛选。
10. 第一版不做复杂作品编辑器、不从外部 URL 抓取媒体、不把官方作品自动同步到 IP 库或提示词库。

## 二、状态与规则

### 2.1 数据标识

在 `published_works` 增加：

```ts
export type PublishedWorkOrigin = "user_submission" | "official";
```

数据库字段：

```sql
publication_origin text NOT NULL DEFAULT 'user_submission'
```

约束仅允许 `user_submission`、`official`。现有数据通过默认值自动归类为用户投稿。`source_type` 继续表示媒体、画布或短剧，不承担“是否官方”的职责。

官方直接上传作品使用：

```text
publication_origin = official
source_type = media
source_id = official:<workId>
owner_user_id = 执行创建的管理员 ID
```

`owner_user_id` 继续承担权限归属、媒体归属和审计关联，但前端不得把管理员个人账号显示成官方作者主页。官方作品默认使用 `author_display=custom`、`author_name=平台官方`，因此不生成创作者主页链接和关注入口。

### 2.2 官方作品状态

```text
后台新建
  └─ 保存草稿：draft，广场不可见
       └─ 确认发布：approved + published_version_id，广场立即可见
            ├─ 编辑后保存：生成新 draft 版本，旧公开版本继续展示
            │    └─ 确认更新：新版本 approved，并原子切换 published_version_id
            └─ 下架：taken_down，清空 published_version_id，广场立即不可见
                  ├─ 编辑并重新发布：新版本 approved，恢复公开
                  └─ 删除：删除作品记录；媒体仅在确认无其他引用时清理
```

明确规则：

- “保存草稿”和“发布”是两个独立按钮；上传文件不等于发布。
- 发布确认框展示标题、作者名、媒体数量和“发布后将立即进入作品广场”。
- 官方作品编辑时，线上已发布版本继续可见；只有管理员再次点击“发布更新”才切换版本。
- 官方作品不能调用普通用户的 `/submit` 接口；普通用户作品不能调用官方直接发布接口。
- 官方作品仍可被举报并由现有内容治理处理。

### 2.3 提示词

为兼容广场“使用提示词 / 做同款”能力，公开提示词保留为可选：

- 填写时：作品详情显示，允许复制和做同款。
- 未填写时：详情显示“该作品暂无可公开提示词”，隐藏复制、引用提示词和做同款入口。
- 普通用户投稿现有“公开提示词必填”规则不变。

## 三、接口契约

### 3.1 官方媒体上传

```http
POST /api/admin/works/media
Content-Type: multipart/form-data
file: File
```

成功：

```json
{
  "code": 0,
  "data": {
    "storageKey": "permanent/2026/09/08/images/...png",
    "mediaType": "image",
    "mimeType": "image/png",
    "originalName": "cover.png",
    "bytes": 1024,
    "previewUrl": "/api/reference-assets/permanent/...png"
  },
  "msg": "媒体已上传"
}
```

要求：当前 Session 必须有 `content.manage`；服务端检测真实文件类型，媒体登记的 `ownerUserId` 为当前管理员，`source` 固定为 `admin-official-work-upload`。

取消编辑时，对本次新上传且尚未被作品引用的媒体调用：

```http
DELETE /api/admin/works/media
Content-Type: application/json
{ "storageKeys": ["permanent/..."] }
```

删除必须复用媒体引用计数：有 `published_work_assets` 引用时返回 blocked，不得级联删除线上作品资产。

### 3.2 查询可选媒体

```http
GET /api/admin/works/media?page=1&pageSize=20&type=image&keyword=cover
```

只返回当前管理员拥有、`storageClass=permanent`、类型为图片/视频/音频的媒体；不允许从其他用户私有媒体中直接选取。第一版不跨账号授权媒体。

### 3.3 创建官方作品草稿

```http
POST /api/admin/works
Content-Type: application/json
```

```json
{
  "title": "官方案例",
  "description": "作品说明",
  "publicPrompt": "可为空",
  "category": "视觉设计",
  "tags": ["官方", "案例"],
  "authorDisplay": "custom",
  "authorName": "平台官方",
  "coverStorageKey": "permanent/.../cover.png",
  "assetStorageKeys": ["permanent/.../01.png", "permanent/.../demo.mp4"]
}
```

返回 `201` 和官方作品详情。服务端强制 `publicationOrigin=official`、`sourceType=media`、`visibility=public`，忽略客户端伪造的 owner、审核状态和来源字段。

### 3.4 编辑草稿或生成待发布新版本

```http
PATCH /api/admin/works/:id
```

请求体与创建一致。仅允许编辑 `publication_origin=official` 的作品。未发布草稿原地更新；已发布作品生成新的 draft 版本，旧版本继续公开。

### 3.5 直接发布

```http
POST /api/admin/works/:id/publish
Content-Type: application/json
{ "versionId": "当前版本 ID" }
```

事务内完成：

1. 锁定作品和版本；
2. 断言为官方作品、当前版本、公开可见、至少一个内容媒体且封面有效；
3. 运行现有文本内容风险检测并保存 `moderation_provider/moderation_signal`，仅作为审计信号，不进入人工审核队列；
4. 将当前版本设置为 `approved`，写入 `submitted_at`、`reviewed_at`、`reviewed_by_user_id=当前管理员`；
5. 原子设置 `published_version_id` 并恢复 `lifecycle_status=active`；
6. 返回公开路径 `/share/:slug`。

管理员直接发布不等待第二名管理员审核。外部内容检测不可用时记录 `review` 信号，但不阻断已授权管理员发布；明确返回 `block` 时阻止发布并提示风险摘要。

### 3.6 列表和重新上架

`GET /api/admin/works` 新增查询参数：

```text
origin=all | user_submission | official
```

新增：

```http
POST /api/admin/works/:id/relist
```

只允许官方作品使用，重新上架最近一个有效 `approved + public` 版本，并写审计日志。用户投稿继续走现有用户侧重新上架规则。

## 四、文件变更总览

### 数据和类型

- 修改 `web/src/lib/server/database/schema-commercial-features.ts`
  - 为已有 `published_works` 先执行 `ADD COLUMN IF NOT EXISTS publication_origin`，再补约束和索引。
- 修改 `web/src/lib/server/database/schema.ts`
  - 增加本次迁移版本记录。
- 修改 `web/src/lib/server/database/repository-types.ts`
  - 增加 `PublishedWorkOrigin` 和 `publicationOrigin`。
- 修改 `web/src/lib/server/database/repository-work-publication-mappers.ts`
  - 映射来源字段，旧值安全回退为 `user_submission`。
- 修改 `web/src/lib/server/database/work-publication-repository.ts`
  - 写入来源字段；列表增加来源过滤；增加官方发布所需的原子状态方法。
- 修改 `docs/content/docs/backend/backend-database.mdx`
  - 记录字段、约束、索引和升级顺序。

### 服务和接口

- 修改 `web/src/lib/server/work-publication-service.ts`
  - 增加官方草稿创建、编辑、发布、重新上架服务；提取并复用作品字段与媒体校验；不改变用户投稿必填提示词规则。
- 新建 `web/src/lib/server/official-work-media-service.ts`
  - 只负责官方媒体上传、当前管理员永久媒体查询和安全清理。
- 修改 `web/src/app/api/admin/works/route.ts`
  - 保留 GET，新增 POST。
- 新建 `web/src/app/api/admin/works/media/route.ts`
  - GET/POST/DELETE 官方媒体。
- 修改 `web/src/app/api/admin/works/[id]/route.ts`
  - 保留 DELETE，新增 PATCH。
- 新建 `web/src/app/api/admin/works/[id]/publish/route.ts`
- 新建 `web/src/app/api/admin/works/[id]/relist/route.ts`
- 修改 `web/src/services/api/work-publications.ts`
  - 增加来源类型、官方作品输入和后台请求函数。

### 管理后台

- 修改 `web/src/app/admin/works/components/admin-works-section.tsx`
  - 页面标题改为“作品管理”；保留审核和治理能力；增加“发布官方作品”、来源筛选、官方标签及编辑/重新上架动作。
- 新建 `web/src/app/admin/works/components/admin-official-work-editor.tsx`
  - 响应式 Drawer 表单、媒体上传/选择、排序、封面、保存草稿、预览和发布确认。
- 新建 `web/src/app/admin/works/components/admin-official-work-media-picker.tsx`
  - 当前管理员永久媒体分页选择器，不读取全量媒体后在浏览器筛选。

### 广场

- 修改 `web/src/lib/server/public-work-view.ts`
- 修改 `web/src/services/api/work-governance.ts`
- 修改 `web/src/services/api/work-publications.ts`
  - 公开响应增加 `publicationOrigin`。
- 修改 `web/src/components/works/public-work-gallery-card.tsx`
  - 官方作品显示“官方”角标，不展示管理员个人主页入口。
- 修改 `web/src/components/works/public-work-preview-modal.tsx`
  - 详情显示“官方作品”；隐藏不存在提示词时的做同款入口。
- 修改 `web/src/components/works/public-work-media-browser.tsx`
  - 支持音频内容播放器；图片/视频行为不变。
- 检查并按真实查询结果修改 `web/src/lib/server/database/work-community-repository.ts`
  - 广场预览优先封面图片，其次内容图片/视频；音频内容不应替代卡片封面。

## 五、执行任务

### Task 1：数据迁移和来源字段

**测试文件：**
- 修改 `web/src/lib/server/database/postgres.test.ts`
- 修改 `web/src/lib/server/database/work-publication-repository.test.ts`

- [ ] 先写失败测试：旧 `published_works` 表升级后存在 `publication_origin`，默认值为 `user_submission`，约束拒绝未知值，来源索引位于补列语句之后。
- [ ] 运行：

```powershell
cd web
pnpm vitest run src/lib/server/database/postgres.test.ts src/lib/server/database/work-publication-repository.test.ts
```

预期：新增断言失败。

- [ ] 按“补列 → 回填/默认值 → 约束 → 索引”顺序实现幂等迁移；不得依赖 `CREATE TABLE IF NOT EXISTS` 修改旧表。
- [ ] 更新 record、mapper、insert、list filter，并用 repository 测试验证 `official` 与 `user_submission` 查询隔离。
- [ ] 更新数据库文档和迁移版本。
- [ ] 重跑上述测试，预期全部通过。

建议提交：

```powershell
git add web/src/lib/server/database docs/content/docs/backend/backend-database.mdx
git commit -m "feat(works): distinguish official publications"
```

### Task 2：官方媒体边界

**测试文件：**
- 新建 `web/src/lib/server/official-work-media-service.test.ts`
- 新建 `web/src/app/api/admin/works/media/route.test.ts`

- [ ] 先写失败测试，覆盖：未登录 401、无 `content.manage` 403、真实格式不匹配 415、图片/视频/音频大小限制、媒体归属当前管理员、只查询永久媒体、删除被作品引用媒体时 blocked。
- [ ] 运行：

```powershell
cd web
pnpm vitest run src/lib/server/official-work-media-service.test.ts src/app/api/admin/works/media/route.test.ts
```

预期：模块或路由不存在而失败。

- [ ] 实现 `official-work-media-service.ts`，复用 `reference-asset-store`、媒体注册表、对象存储和引用计数，不手写文件格式解析。
- [ ] 实现后台媒体 GET/POST/DELETE 路由，全部返回 `{ code, data, msg }`，上传和清理写审计日志。
- [ ] 重跑测试，预期全部通过。

建议提交：

```powershell
git add web/src/lib/server/official-work-media-service* web/src/app/api/admin/works/media
git commit -m "feat(works): add official media management"
```

### Task 3：官方草稿、编辑和直接发布服务

**测试文件：**
- 修改 `web/src/lib/server/work-publication-service.test.ts`
- 修改 `web/src/lib/server/database/work-publication-repository.test.ts`

- [ ] 先写失败测试，覆盖：
  - 创建草稿强制 `official + media + public`；
  - 媒体必须永久且归当前管理员；
  - 至少一个内容媒体；
  - 封面必须是图片；视频/音频作品没有图片封面时拒绝发布；
  - 官方提示词允许为空，用户投稿仍必须填写；
  - 首次发布直接变为 approved 并进入广场；
  - 已发布作品编辑生成新 draft，旧公开版本不变；
  - 只允许发布当前版本，重复请求幂等；
  - 风险等级 block 阻止发布，manual/review 信号不进入待审核；
  - 用户投稿不能调用官方发布服务。
- [ ] 运行：

```powershell
cd web
pnpm vitest run src/lib/server/work-publication-service.test.ts src/lib/server/database/work-publication-repository.test.ts
```

预期：新增服务不存在或行为不符而失败。

- [ ] 增加以下明确接口：

```ts
export type OfficialWorkDraftInput = {
  title?: unknown;
  description?: unknown;
  publicPrompt?: unknown;
  category?: unknown;
  tags?: unknown;
  authorDisplay?: unknown;
  authorName?: unknown;
  assetStorageKeys?: unknown;
  coverStorageKey?: unknown;
};

export function createOfficialWorkDraft(adminUserId: unknown, input: OfficialWorkDraftInput): Promise<PublishedWorkDetail>;
export function updateOfficialWorkDraft(adminUserId: unknown, workId: unknown, input: OfficialWorkDraftInput): Promise<PublishedWorkDetail>;
export function publishOfficialWork(input: { adminUserId: unknown; workId: unknown; versionId: unknown }): Promise<PublishedWorkDetail>;
export function relistOfficialWork(adminUserId: unknown, workId: unknown): Promise<PublishedWorkDetail>;
```

- [ ] 服务只接收管理员 ID，不在 service 内相信客户端 owner/origin/status；Route Handler 负责职责权限，service 负责官方作品不变量和事务。
- [ ] 重跑测试，预期全部通过。

建议提交：

```powershell
git add web/src/lib/server/work-publication-service* web/src/lib/server/database/work-publication-repository*
git commit -m "feat(works): publish official works directly"
```

### Task 4：后台官方作品 API 和审计

**测试文件：**
- 新建 `web/src/app/api/admin/works/route.test.ts`
- 扩展 `web/src/app/api/admin/works/[id]/route.test.ts`
- 新建 `web/src/app/api/admin/works/[id]/publish/route.test.ts`
- 新建 `web/src/app/api/admin/works/[id]/relist/route.test.ts`

- [ ] 先写失败测试：权限、Session 管理员 ID 透传、客户端 owner/status 被忽略、201 创建、PATCH 只改官方作品、发布版本 ID 校验、重新上架、成功和失败审计。
- [ ] 审计 action 固定为：

```text
admin.official-work.create
admin.official-work.update
admin.official-work.publish
admin.official-work.relist
admin.official-work.media.upload
admin.official-work.media.delete
```

- [ ] 运行：

```powershell
cd web
pnpm vitest run src/app/api/admin/works/route.test.ts src/app/api/admin/works/[id]/route.test.ts src/app/api/admin/works/[id]/publish/route.test.ts src/app/api/admin/works/[id]/relist/route.test.ts
```

预期：新增接口测试失败。

- [ ] 实现 Route Handler：仅处理鉴权、解析、调用服务、统一响应和审计，不在路由内写业务状态机。
- [ ] 扩展列表 `origin` 参数，并确保缺省为全部。
- [ ] 重跑测试，预期全部通过。

建议提交：

```powershell
git add web/src/app/api/admin/works web/src/services/api/work-publications.ts
git commit -m "feat(works): expose official publishing APIs"
```

### Task 5：后台作品管理界面

**测试文件：**
- 修改 `web/src/app/admin/works/components/admin-works-section.test.tsx`
- 新建 `web/src/app/admin/works/components/admin-official-work-editor.test.tsx`

- [ ] 先写失败测试，断言存在“发布官方作品”、来源筛选、官方标签、响应式 Drawer、媒体排序、图片封面限制、保存草稿和发布确认文案。
- [ ] 运行：

```powershell
cd web
pnpm vitest run src/app/admin/works/components/admin-works-section.test.tsx src/app/admin/works/components/admin-official-work-editor.test.tsx
```

预期：新增界面不存在而失败。

- [ ] 将管理页标题改为“作品管理”，顶部保留“作品审核 / 举报申诉”切换，并在作品页 Header 右侧增加主按钮“发布官方作品”。
- [ ] 在现有筛选区增加“全部来源 / 用户投稿 / 官方作品”；列表来源列显示官方 Tag。
- [ ] 官方作品动作：编辑、预览、精选、下架、重新上架、删除；用户投稿动作保持现状。
- [ ] Drawer 宽度使用响应式值且不超过 `100vw`；短字段使用紧凑网格，说明和提示词通栏，底部固定“取消 / 保存草稿 / 发布”。
- [ ] 上传后立即显示真实缩略图或播放器；支持键盘可操作的上移/下移排序，不只依赖拖拽；封面选择只出现在图片上。
- [ ] 取消时显式清理本次上传且未引用文件；关闭前有未保存变更必须二次确认。
- [ ] 重跑组件测试，预期全部通过。

建议提交：

```powershell
git add web/src/app/admin/works/components web/src/services/api/work-publications.ts
git commit -m "feat(admin): add official work publisher"
```

### Task 6：广场官方标识和音频展示

**测试文件：**
- 新建 `web/src/components/works/public-work-media-browser.test.tsx`
- 修改或新建 `web/src/components/works/public-work-gallery-card.test.tsx`
- 修改 `web/src/lib/server/work-community-service.test.ts`
- 修改 `web/src/lib/server/work-publication-service.test.ts`

- [ ] 先写失败测试：官方来源出现在公开 DTO；官方卡片有“官方”标识且没有管理员主页链接；音频内容进入详情并显示 `<audio controls>`；无提示词时不出现复制/引用/做同款；用户投稿显示不变。
- [ ] 运行：

```powershell
cd web
pnpm vitest run src/components/works/public-work-media-browser.test.tsx src/components/works/public-work-gallery-card.test.tsx src/lib/server/work-community-service.test.ts src/lib/server/work-publication-service.test.ts
```

预期：新增断言失败。

- [ ] 更新公开查询、DTO 和组件。作品详情不再过滤音频；广场预览优先封面图片，音频只在详情播放器出现。
- [ ] 官方作者区域显示平台 Logo/“平台官方”或自定义名，不展示关注按钮和创作者主页链接。
- [ ] 重跑测试，预期全部通过。

建议提交：

```powershell
git add web/src/lib/server/public-work-view.ts web/src/lib/server/work-community* web/src/lib/server/work-publication-service* web/src/components/works web/src/services/api
git commit -m "feat(gallery): present official works"
```

### Task 7：闭环 E2E、质量门禁和开发文档

**测试文件：**
- 新建 `web/e2e/admin-official-work-publishing.spec.ts`

- [ ] 增加 E2E 夹具，完整验证：

```text
content.manage 管理员登录
→ 打开 /admin?section=works
→ 发布官方作品
→ 上传封面与内容
→ 保存草稿（广场不可见）
→ 确认发布（立即进入广场）
→ 广场卡片显示“官方”
→ 打开详情并播放/切换媒体
→ 回后台编辑为新版本（旧版仍可见）
→ 发布更新（新版可见）
→ 下架（公开详情 404）
→ 重新上架（公开详情恢复）
```

- [ ] 权限回归：没有 `content.manage` 的管理员看不到入口，直接调用接口返回 403。
- [ ] 响应式回归：桌面、390px、430px；Drawer、底部操作、媒体列表均无横向溢出，浅色/深色主题均可读。
- [ ] 运行相关测试：

```powershell
cd web
pnpm vitest run src/lib/server/work-publication-service.test.ts src/lib/server/official-work-media-service.test.ts src/lib/server/database/work-publication-repository.test.ts src/app/api/admin/works src/app/admin/works/components src/components/works
pnpm typecheck
pnpm eslint . --quiet
pnpm playwright test e2e/admin-official-work-publishing.spec.ts --project=chromium
```


- [ ] 按项目 Mandatory Testing 再执行全量质量门禁和相关浏览器回归；共享 PostgreSQL 的集成测试使用 `--no-file-parallelism`。
- [ ] 因本功能新增接口、Schema、Service 和页面能力，从仓库根目录更新并验证开发地图：

```powershell
pwsh -NoProfile -File .\过程文件\更新开发地图.ps1
pwsh -NoProfile -File .\过程文件\验证开发文档.ps1
```

- [ ] 严格 UTF-8 解码本次中文文档与源码，检查 `U+FFFD` 及常见乱码组合；检查 `git diff`、`git status`，不得包含 `.env`、凭据、`output/` 或 RunningHub 未完成改动。
- [ ] 最终提交建议：

```powershell
git add web/e2e/admin-official-work-publishing.spec.ts VOZEB-PRO-接口索引.md VOZEB-PRO-开发地图.md
git commit -m "test(works): verify official publishing flow"
```

## 六、验收标准

1. `content.manage` 管理员可在后台完成“上传/选择媒体 → 保存草稿 → 预览 → 确认发布”。
2. 确认发布后无需另一管理员审核，作品立即出现在广场，详情和媒体可正常访问。
3. 后台和前台都能明确识别官方作品，且官方作品不链接到管理员个人主页。
4. 图片、视频、音频均能作为内容；音频作品有图片封面，详情可播放音频。
5. 已发布官方作品编辑时旧版本不中断，新版本仅在“发布更新”后替换。
6. 下架后广场和公开链接立即不可访问；重新上架后恢复；删除前必须先下架。
7. 用户投稿的创建、提交审核、驳回、通过、下架流程没有变化。
8. 无权限管理员无法看到入口，也无法通过直接请求绕过权限。
9. 所有官方作品关键操作可在审计日志按管理员、作品和 action 查询。
10. 数据库可从现有持久化结构幂等升级，不要求删除数据库或重建数据卷。
11. 相关 Vitest、类型检查、Lint、Playwright、开发地图验证全部通过。

## 七、明确不在本期

- 官方账号体系或单独的“官方创作者主页”。
- 第二管理员复审、定时发布、批量导入、批量发布。
- 从第三方 URL 抓取媒体。
- 在线裁剪、视频剪辑、音频波形编辑等复杂编辑器。
- 自动把官方作品拆分同步到 IP 库或提示词库。
- 修改无限练习、RunningHub 或普通用户创作流程。

