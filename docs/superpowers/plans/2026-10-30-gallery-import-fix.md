# 作品广场分类、标题与做同款修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复正式作品广场分类筛选、官方作品标题尾标和媒体作品误显示“做同款”导致 Canvas 白屏的问题。

**Architecture:** 统一把官方导入分类映射到 `WORK_CATEGORY_OPTIONS` 的公开值；批量清洗正式库官方作品标题；前端仅对存在公开制作流程的画布/短剧作品显示流程复制入口，媒体作品通过提示词入口进入 Agent 创作。

**Tech Stack:** Next.js App Router、React、TypeScript、PostgreSQL、Vitest、PowerShell/SSH 运维脚本。

## Global Constraints

- 不修改点赞、浏览量或活跃统计。
- 不删除视频、封面、提示词和作品记录。
- 官方作品公开分类只能使用 `视觉设计`、`插画`、`摄影`、`品牌内容`、`视频`、`短剧`、`其他`。
- 纯媒体作品不调用 Canvas/短剧制作流程复制接口。

---

### Task 1: 公开分类与媒体作品入口回归测试

**Files:**
- Modify: `web/src/lib/server/work-governance-service.test.ts`
- Modify: `web/src/components/works/public-work-preview-layout.test.ts`
- Create: `web/src/lib/work-publication-import.test.ts`

- [ ] 写分类映射测试：五个导入分类分别映射到公开分类值。
- [ ] 写媒体作品预览测试：媒体作品不渲染“复制到练习/制作流程”入口，但仍保留“做同款”提示词入口。
- [ ] 写 Canvas/短剧作品测试：只有 `hasProcess=true` 时才渲染复制到练习入口。
- [ ] 运行相关 Vitest，确认测试先因缺少映射/入口条件而失败。

### Task 2: 实现分类映射和标题清洗

**Files:**
- Modify: `web/src/lib/work-publication-options.ts`
- Create: `web/src/lib/work-publication-import.ts`
- Modify: `web/src/lib/server/work-governance-service.ts`

- [ ] 新增 `normalizeOfficialCategory(value: string): WorkCategory`，按前缀映射：建筑室内→视觉设计、广告营销→品牌内容、电影影视→视频、动漫游戏→插画、生活时尚→视频，未知值→其他。
- [ ] 新增 `cleanOfficialWorkTitle(value: string): string`，移除文件名末尾 `_` 加 6–16 位英数字尾标并裁剪空白。
- [ ] 公开广场查询对历史官方作品分类做同一归一化，避免旧数据筛选失效。
- [ ] 运行 Task 1 测试确认通过。

### Task 3: 修复预览弹窗的“做同款”行为

**Files:**
- Modify: `web/src/components/works/public-work-preview-modal.tsx`
- Modify: `web/src/components/works/public-work-preview-layout.test.ts`

- [ ] 保持 `hasProcess` 仅由公开流程和 canvas/drama 来源决定。
- [ ] 对媒体作品只显示复制提示词和进入 Agent 的入口，不显示复制到练习/制作流程按钮。
- [ ] 将媒体作品的主行动链接指向 `/create` 提示词入口，不跳转 `/canvas` 或 `/practice`。
- [ ] 对流程复制失败保留错误态，不允许空白页跳转。
- [ ] 运行组件测试和 TypeScript 检查。

### Task 4: 正式库数据清洗与线上回归

**Files:**
- Create: `output/official-import-20261030/normalize-official-works.sql`
- Modify: `docs/content/docs/progress/pending-test.mdx`（仅记录本次线上修复证据）

- [ ] 生成幂等 SQL：仅更新 `source_id LIKE 'official-import-20261030-%'` 的官方作品标题和分类，保留提示词、资产、统计字段。
- [ ] 通过 SSH 在 `8.163.33.161:22222` 执行事务 SQL。
- [ ] 回读五个分类数量、标题无尾标、点赞/浏览量仍为 0。
- [ ] 请求 `/api/public/gallery?category=...` 验证每个分类都有结果。
- [ ] 请求媒体作品详情确认不再提供流程复制；确认 `/create` 提示词入口可用。

### Task 5: 质量门禁

- [ ] `pnpm vitest run` 相关测试文件。
- [ ] `pnpm exec tsc --noEmit`。
- [ ] `git diff --check`、`git status --short`。
- [ ] 运行 `pwsh -NoProfile -File .\过程文件\验证开发文档.ps1`，确认无乱码和文档漂移。
