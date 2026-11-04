# 作品广场官方图片分类修复 Implementation Plan

> **Execution:** Inline in the current session; no delegation.

**Goal:** 保留现有作品分类入口，修复官方作品分类规范化，并按配套提示词 TXT 的原始分类把正式库图片归入匹配分类。

**Architecture:** 前端继续使用现有 `WORK_CATEGORIES`。服务端规范化函数先保留已经是标准分类的值，再处理导入时的原始编号分类；作品广场 SQL 不再把标准分类误判为“其他”。生产数据通过 source_id 稳定映射、单事务、数量断言回写。

**Tech Stack:** Next.js/TypeScript、Vitest、PostgreSQL、Python zipfile、SSH Docker psql、Playwright。

## Global Constraints

- 只处理 `publication_origin='official' AND source_id LIKE 'image-import-20261030-%'` 的图片记录。
- 不修改媒体路径、提示词、标题、浏览量或点赞量。
- 分类必须来自 TXT 的 `分类` 字段或已有标准分类；不能根据文件名臆测。
- 所有文本严格 UTF-8 解码并检查替换字符和常见乱码。
- 推送前运行开发地图更新和验证脚本。

---

### Task 1: 修复标准分类规范化

**Files:**
- Modify: `web/src/lib/work-publication-import.ts`
- Test: `web/src/lib/work-publication-import.test.ts`
- Modify: `web/src/lib/server/database/work-governance-repository.ts`

- [x] 先补测试：`normalizeOfficialCategory("插画")`、`normalizeOfficialCategory("摄影")`、`normalizeOfficialCategory("视频")` 应返回自身；作品广场查询的分类 CASE 对标准分类不应落入“其他”。
- [x] 运行目标 Vitest，确认新增断言在修复前失败。
- [x] 用最小改动让标准分类直接返回，并在 SQL CASE 开头保留 `version.category` 已是标准分类的分支。
- [x] 运行目标 Vitest、TypeScript 检查和格式检查。

### Task 2: 生成并审阅正式库分类映射

**Files:**
- Local audit: `category-mapping.json`, `output-official-categories.csv`, `apply-category-repair.sql`, `rollback-category-repair.sql`（不提交）

- [x] 严格读取正式库保存的配套提示词 `public_prompt` 的 `分类` 行，统计原始分类和目标分类。
- [x] 映射规则：标准分类原样保留；01/04/06/08/11/13→视觉设计，02/05→摄影，03/14/15→品牌内容，07/09/10/12→插画。图片素材不归入视频或短剧。
- [x] 对所有 14,098 行检查 source_id 和 version_id 唯一、原始分类和目标分类非空、无乱码，并输出每类数量。
- [x] 生成回滚 SQL 和带旧分类前置条件的更新 SQL；两份 SQL 均仅作为本地审计文件。

### Task 3: 正式库更新与回归

**Files:**
- No application files beyond Task 1.
- Output artifacts remain untracked.

- [x] 先导出目标记录当前分类、版本 ID 和配套提示词。
- [x] 将 `published_work_versions.category` 与 `public_prompt` 中的原始分类按 source_id 对齐，在单事务中更新；只允许目标 source_id，预期 14,098 条。
- [x] 回读数据库，确认分类计数、原始媒体类型未改变，并抽查图片媒体接口返回 200。
- [ ] 公开 gallery API 的代码已修复，但线上旧镜像仍返回空；浏览器检查需在部署修复代码后进行。

### Task 4: 质量门禁

- [x] 运行 `pnpm exec vitest run src/lib/work-publication-import.test.ts src/lib/server/work-governance-service.test.ts --no-file-parallelism`。
- [x] 运行 `pnpm run typecheck`、`pnpm run lint`、`pnpm test` 和 `pnpm run format:check`。
- [x] 运行开发地图更新与验证脚本，检查 UTF-8 和 `git diff --check`。
