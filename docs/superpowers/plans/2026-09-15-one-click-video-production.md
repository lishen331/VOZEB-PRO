# 一键成片一级功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 LocalMiniDrama 的完整一键成片/故事板业务等价迁移到 VOZEB-PRO，作为与创作工坊同级的一级功能，并使用 V 平台基础设施和 UI。

**Architecture:** 新增独立 `/one-click`（最终路径以现有导航约定为准）工作区和服务端域边界；业务状态、任务和数据复用 V 的项目/任务/画布/媒体体系。L 作为行为基准，通过适配层把 L 的故事板语义映射到 V 的数据合同，禁止复制 L 的存储实现。

**Tech Stack:** Next.js App Router、React、TypeScript、Ant Design/V 现有组件、V 任务服务、V 画布、PostgreSQL/现有配置存储、OSS 媒体服务、Vitest、Playwright。

## Global Constraints

- 只新增“一键成片”一级功能；创作工坊既有页面和接口不改。
- 插件市场总开关只控制前端显示；细分显示开关关闭时对应元素不渲染。
- 不复制 L 数据库、画布、认证、模型渠道或 Vue UI。
- 长任务必须服务端持久化，支持刷新恢复、取消、重试和去重。
- 每集一个画布上下文；分镜引用只接受项目内真实资产 ID。
- 未配置的新显示键默认开启；不删除历史数据。

---

### Task 1: L/V 行为基线与差异矩阵

**Files:**
- Create: `docs/superpowers/specs/2026-09-15-one-click-video-production-l-v-matrix.zh-CN.md`
- Test: `web/src/lib/one-click/migration-matrix.test.ts`

- [ ] 列出 L 的页面、路由、字段、API、状态机、任务和请求载荷。
- [ ] 为每一项标注 V 复用点、需要新建的适配层、验收证据。
- [ ] 将差异按 P0/P1/P2 排序；任何无证据项保持“未迁移”。
- [ ] 提交：`docs: define one-click l-v migration baseline`。

### Task 2: 一级插件、导航和前端显示开关

**Files:**
- Modify: `web/src/lib/feature-modules.ts`
- Modify: `web/src/components/admin/admin-upstream-sections.tsx`
- Modify: `web/src/constant/navigation-tools.ts`
- Modify: `web/src/components/admin/admin-section-nav.tsx`
- Create: `web/src/app/admin/one-click-features/page.tsx`
- Create: `web/src/app/(user)/one-click/page.tsx`
- Test: 对应插件、导航和页面测试

- [ ] 添加 `one-click` 一级功能定义及默认开启配置。
- [ ] 插件市场增加卡片；卡片主体跳转独立配置页，开关点击不触发跳转。
- [ ] 前台导航把“一键成片”放在“创作工坊”下方；总开关关闭时不渲染。
- [ ] 配置页只控制前端显示，不加入服务端调用权限语义。
- [ ] 用 Playwright 验证卡片跳转、导航位置和开关刷新持久化。
- [ ] 提交：`feat(one-click): add first-class entry and visibility setting`。

### Task 3: V 平台画布和一键成片项目壳

**Files:**
- Create: `web/src/app/(user)/one-click/[id]/page.tsx`
- Create: `web/src/lib/server/one-click-project-service.ts`
- Create: `web/src/lib/server/one-click-project-service.test.ts`
- Modify: 现有 V 画布集成服务和路由

- [ ] 创建一键成片项目与分集，明确“一集一个画布上下文”。
- [ ] 接入 V 画布定位、返回和集切换。
- [ ] 持久化项目/分集/画布引用，不复制 L 数据库。
- [ ] 页面具备真实加载、空状态和错误恢复，不放静态假数据。
- [ ] 提交：`feat(one-click): create project and episode workspace`。

### Task 4: 小说导入、多集剧本与恢复

**Files:**
- Create/Modify: V 剧本导入、分集解析和任务服务
- Test: TXT/MD、多集、截断、重试、恢复测试

- [ ] 迁移 L 的 TXT/MD 导入和章节识别规则，覆盖符号标题、60 集等长文本。
- [ ] 服务端创建多集异步任务；每集原子保存、增量保存、部分结果恢复。
- [ ] 提供取消、重试、刷新恢复、运行中去重。
- [ ] UI 显示当前集、进度、错误、重试和取消。
- [ ] 提交：`feat(one-click): persist multi-episode script workflow`。

### Task 5: 资产提取和参考图链路

**Files:**
- Create/Modify: 一键成片资产适配层和资产组件
- Test: 资产 ID 白名单、参考图顺序、历史主图测试

- [ ] 角色、场景、道具提取结果只接受项目内真实 ID。
- [ ] 迁移 L 的描述格式化、视觉锚点、单图/四视图/四宫格和主参考图逻辑。
- [ ] 资产历史参考图、设置主图、上传和生成均回写 V 资产。
- [ ] 提交：`feat(one-click): migrate asset reference workflow`。

### Task 6: 故事板结构与模式合同

**Files:**
- Create/Modify: 故事板数据适配层、模式组件、请求合同
- Test: 经典/首尾帧/全能字段和请求载荷测试

- [ ] 补齐 L 故事板全部字段及持久化映射。
- [ ] 实现经典、首尾帧、全能模式的 UI 和状态合同。
- [ ] 将场景→角色→道具的真实参考图顺序传入最终请求。
- [ ] 首尾帧、全能提示词与视频提示词按 L 语义分离。
- [ ] 提交：`feat(one-click): implement storyboard behavior contract`。

### Task 7: 分镜图/视频/音频与批量任务

**Files:**
- Create/Modify: 生成请求适配层、TTS/音频拆镜、批量编排
- Test: 请求载荷、任务状态、取消/重试/恢复和媒体回写测试

- [ ] 图片/视频请求严格复用 L 的字段含义，使用 V 模型路由和 OSS。
- [ ] 接入对白/旁白、TTS、音频拆镜和批量任务。
- [ ] 服务端持久化任务状态，前端显示进度、取消、重试和恢复。
- [ ] 禁止前端模拟任务完成。
- [ ] 提交：`feat(one-click): complete media and batch workflow`。

### Task 8: 审核、导出、教学 UI 和最终验收

**Files:**
- Modify: 一键成片工作区及审核/导出组件
- Create: `docs/testing/one-click-video-production-acceptance.zh-CN.md`
- Test: Playwright Chromium 全流程

- [ ] 接入 V 审核/协作状态，保留 L 的阶段语义。
- [ ] 完整项目导入导出、分镜表和字幕导出。
- [ ] 教学引导、空状态、错误恢复和任务历史完整。
- [ ] 使用同一提示词、同一模型与 LocalMiniDrama 对比请求载荷和结果。
- [ ] 运行 lint、typecheck、Vitest、Playwright、build；仅全部通过后提交部署。
- [ ] 提交：`feat(one-click): finish teaching production workspace`。

## 交付门槛

只有当 Task 1-8 都有代码、测试和手工证据，且不存在“静态壳子/假任务/未持久化字段”时，才可报告“一键成片完整迁移”。
