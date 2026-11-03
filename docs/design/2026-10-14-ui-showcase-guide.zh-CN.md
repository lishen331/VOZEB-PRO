# VOZEB UI Showcase 使用与验收说明

日期：2026-10-14。阶段：独立视觉样板，等待用户确认；尚未替换正式页面、提交发布或部署。

## 1. 访问

- 页面路由：`/ui-showcase`。
- 本次本地验收地址：`http://127.0.0.1:64389/ui-showcase`。
- 桌面和移动端截图：`C:/Users/admin/.codex/visualizations/2026/10/14/vozeb-ui-showcase/`。
- 左侧导航定位工作流、Token、控件、媒体、浮层与响应式区；右上角切换深浅主题；搜索可定位本页组件。

本地预览不启动 Generation Worker。若需要重启，从 `web` 目录直接启动 Next，而非会启动业务 Worker 的 `pnpm dev`：

```powershell
$env:NEXT_DIST_DIR = '.next-ui-showcase'
$env:VOZEB_PRO_DATABASE_PROVIDER = 'postgres'
# 临时进程变量，让根 Layout 使用已有默认站点设置，不连接真实数据库。
# 空白字符串用于避免 Next 从 .env.local 重新填入真实连接配置。
$env:DATABASE_URL = ' '
$env:POSTGRES_URL = ' '
node node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p 64389
```

先确认端口空闲；实际可换其他空闲端口。这些是当前终端的临时变量，不要改写服务器或项目 `.env`。

## 2. 文件与组件

### 新增路由与页面组合

`web/src/app/ui-showcase/`：

- `layout.tsx`：仅该路由载入新样式，设置 noindex。
- `page.tsx`：独立入口，不挂正式业务 Shell。
- `_components/showcase-client.tsx` / `showcase-context.ts`：局部主题、门户容器与消息、导航。
- `_components/section-workflow.tsx`：本地可交互创作演示。
- `_components/section-foundation.tsx`：色板、排版、圆角、间距、阴影。
- `_components/section-controls.tsx`：按钮状态与 AntD 控件组合。
- `_components/section-cards.tsx`：普通卡片、媒体与结果、空态、错误与加载。
- `_components/section-overlays.tsx`：弹窗、抽屉、Popover、Tooltip、Toast、进度和确认。
- `_components/section-responsive.tsx`：同页容器响应式尺寸示意。
- `_components/mock-data.ts` / `demo-generation.ts`：前端样例数据与可清理的本地生成动画。

### 可复用 UI

`web/src/components/vozeb-ds/`：

| 文件 | 组件 |
| --- | --- |
| `primitives.tsx` | VzButton、VzIconButton、VzTag、VzStatusBadge、VzModelTag、VzCard、VzSectionTitle |
| `fields.tsx` | VzInput、VzSearch、VzTextarea、字段说明与校验状态 |
| `generate-button.tsx` | VzGenerateButton：idle / running / success / error |
| `upload-zone.tsx` | VzUploadZone：选择/拖放、缩略图、图片/视频放大、移除 |
| `model-picker.tsx` | VzModelPicker：模型列表、选中、禁用、键盘导航与回焦 |
| `param-picker.tsx` | VzParamPicker：比例、画质、数量、参考强度、细节增强 |
| `prompt-editor.tsx` | VzPromptEditor：提示词、建议词、本地模板/英文样例与显式润色演示 |
| `feedback.tsx` | VzProgress、VzSkeleton、VzStateBlock、VzAlert |
| `media.tsx` | VzMediaCard、VzResultCard、VzVideoPreview、VzAudioPreview |
| `index.ts` | 组件出口，不由业务页面导入 |

### 样式与主题

- `web/src/app/styles/vozeb-ds/index.css`：私有样式入口。
- 同目录 `tokens.css`、`controls.css`、`fields.css`、`generate.css`、`surfaces.css`、`feedback.css`、`workbench.css`、`shell.css`、`antd.css`：Token、基础组件与壳层。
- 同目录 `controls-enhancements.css`、`media-enhancements.css`、`page-enhancements.css`、`workflow-enhancements.css`：分组状态、媒体、尺寸示意和工作台补充样式。
- `web/src/lib/vozeb-ds-theme.ts`：与 CSS 一致的独立 AntD theme，不改旧 `app-theme`。

### 测试与定位文档

- `web/src/components/vozeb-ds/controls-interactions.test.tsx`、`media.test.tsx`、`showcase-behavior.test.tsx`。
- `web/src/app/ui-showcase/_components/demo-generation.test.ts`、`page-interactions.test.tsx`。
- `web/src/lib/vozeb-ds-contrast.test.ts`。
- `web/playwright.ui-showcase.config.ts`、`web/e2e/ui-showcase.spec.ts`：独立 Chromium 测试，无业务初始化或数据库 fixture。
- `VOZEB-PRO-开发地图.md`：新增独立样板定位并更新页面数量；`VOZEB-PRO-接口索引.md`：仅更新生成基线，无新增接口。

## 3. Design Token

所有 Token 都限制在 `.vz-ds`，切换 `data-vz-theme` 不写全局主题 Store 或 `html.dark`。

| 层次 | 深色 | 浅色 |
| --- | --- | --- |
| 页面 `bg` | `#0a0c11` | `#f3f4f8` |
| 容器 `surface-1/2/3` | `#11141b / #171b24 / #1f242f` | `#ffffff / #f7f8fb / #eef0f5` |
| 文本 `text-1/2/3` | `#f3f5f9 / #aab2c2 / #8792a5` | `#141824 / #4d5566 / #5c6779` |
| 品牌 `brand` | `#7c6cff` | `#5f4bff` |
| 辅助 `accent` | `#34d3ff` | `#0596c7` |
| 交互边界 `control-border` | `#737f93` | `#737d8e` |
| 焦点 `focus-color` | `#7c6cff` | `#5f4bff` |

- 语义状态：`success / warning / danger / info`，各自有 `*-soft` 背景和独立 `*-text`，浅色小字不直接使用过亮填充色。
- 主按钮渐变：`#6d48e5 → #4d55d9 → #2d60c7`。成功/错误按钮有独立可读渐变；彩色只用于高价值反馈，不铺满整页。
- 装饰边框使用低透明度 `border / border-strong / divider`；输入等交互控件单独使用可辨识边界。
- `glass / glass-strong` 配合 20px blur；主要实色面板不透明，玻璃只集中在导航和浮层。
- `shadow-1/2/3` 用于卡片、浮层、弹窗；内高光与低对比阴影形成分层。
- 间距 `space-1/2/3/4/5/6/8/10/12/16` 对应 4/8/12/16/20/24/32/40/48/64px。
- 字号 `text-size-xs/sm/md/lg/xl/2xl/3xl` 对应 12/13/14/16/20/24/32px；独立行高 token；数字启用 tabular-nums。
- 圆角 `r-xs/sm/md/lg/xl/2xl` 为 8/10/14/18/24/28px。
- 动效 `dur-1/2/3` 为 120/200/320ms；运行态边框和 shimmer、hover/active/focus 与 AntD 弹层遵守 reduced-motion。

对比度测试覆盖深浅主题、三层 surface、soft 状态背景、主按钮渐变与 hover。普通文字最低 4.5:1；交互边界与焦点最低 3:1。禁用态与图片上的装饰不等同于普通正文的数值契约。

## 4. 真实可用的本地交互

1. 文件选择与拖放显示所选图片 Object URL，而不是拿同一张样图冒充；可放大、删除、重复选择同一文件，移除/卸载回收 URL。
2. 模型支持鼠标与完整键盘选择；禁用项不能选；参数会更新本页状态。模型目录是明确标记的 Mock，不冒充后台实时目录。
3. 提示词库、建议词和显式本地润色会修改输入；英文预览明确为样例，不宣称实时翻译。
4. 生成只播放确定性的本地进度，支持忙态防重复、取消、成功后再次生成、单次失败及主按钮/结果卡重试；无真实队列或计费。
5. 历史只记录本次页面的模拟成功项；分享仅复制样板 URL；导出下载本地 JSON，不包含原始文件。
6. 媒体卡可选择、收藏、放大和实际下载；视频使用项目已有本地媒体；音频为浏览器本地生成的非静音 WAV，真实播放/暂停/seek，不是假进度。
7. 弹窗、抽屉、Popover、Tooltip、Toast 与确认反馈均作用于本页，timer 在取消或卸载清理。

## 5. 响应式

| 宽度 | 布局 |
| --- | --- |
| ≥1280 | 248px 完整侧栏，双栏工作区 |
| 1101–1279 | 76px 图标侧栏，双栏工作区 |
| 768–1100 | 76px 图标侧栏，单栏工作区 |
| <768 | 抽屉导航，精简顶栏，单栏内容，大触控操作 |

状态矩阵窄屏改成分组卡片，标签不与按钮错位。主要网格使用 `minmax(0,...)`、容器 `min-width:0`，长文本按需换行。样板根独立纵向滚动且建立浮层坐标系；不改全站的 body 滚动策略。

响应式区的 390/430/834 是同页 Container Query 尺寸示意，不冒充真机。实际断点以独立 Chromium 视口测试为准，不使用 iframe，也没有放宽 CSP / X-Frame-Options。

## 6. 验证记录

Playwright 测试 Mock 根 Layout 的只读 session/catalog 请求，并拒绝业务写操作；没有调用真实上游。浏览器使用独立 Chromium，不接管用户已登录的 Chrome。

| 检查 | 本次结果 |
| --- | --- |
| 全仓 Vitest（不启用 PostgreSQL 集成环境） | 1070 个测试文件通过；5716 项通过、38 项跳过；8 个测试文件按环境条件跳过 |
| 本次专项 Vitest | 6 个文件、76 项通过 |
| 全项目 TypeScript | 通过，exit 0 |
| 全仓 ESLint `--quiet` | 通过，exit 0 |
| 本次新增/修改组件、样式、测试的 Prettier | 全部通过 |
| 独立 Chromium Playwright | 11/11 通过；覆盖 1440、1280、834、430、390px |
| 开发地图和接口索引验证 | 当前工作区 426 个 Route、61 个页面、144 张表，验证通过；本任务只新增 `/ui-showcase`，另一现有并行样板 `/design-lab` 未改动 |
| 本次源码 UTF-8 | 45 个文件严格解码、替换字符及常见乱码扫描通过 |

### 命令

从 `web` 目录运行已安装的本地入口，无须重新安装依赖：

```powershell
node node_modules/vitest/vitest.mjs run --reporter=dot --maxWorkers=3
node node_modules/vitest/vitest.mjs run src/components/vozeb-ds src/app/ui-showcase src/lib/vozeb-ds-contrast.test.ts --reporter=dot
node node_modules/typescript/bin/tsc --noEmit --pretty false
node node_modules/eslint/bin/eslint.js . --quiet
node node_modules/prettier/bin/prettier.cjs --check src/components/vozeb-ds src/app/ui-showcase src/app/styles/vozeb-ds src/lib/vozeb-ds-theme.ts src/lib/vozeb-ds-contrast.test.ts e2e/ui-showcase.spec.ts playwright.ui-showcase.config.ts
$env:VOZEB_UI_BASE_URL = 'http://127.0.0.1:64389'
node node_modules/@playwright/test/cli.js test -c playwright.ui-showcase.config.ts
```

### 浏览器验收内容

- 深浅主题不修改全站 `html.dark`，浅色 Toast 在全站深色主题中仍可读。
- 根容器可纵向滚动，各 section、卡片、Prompt、状态矩阵和浮层无横向溢出；移动导航抽屉可打开和定位。
- Modal、Drawer、模型与 Prompt Popover 保持私有 scope，使用正常点击，未用 force、z-index 遮挡或放宽安全头。
- 模型键盘选择/回焦、原生 radio 命中、同一文件重选、拖入素材、放大/移除、取消/失败/两种重试/再次生成/历史/JSON 导出。
- 媒体收藏不误选卡片；图片预览和下载实际触发；音频真实播放与暂停。
- 手机提示词库、英文样例、显式润色、清空与空输入禁用；reduced-motion 下浮层和反馈仍可操作。
- AntD 6 的实际 Popover/Toast 容器类名已用计算样式验证，毛玻璃不是仅写在失效选择器上。

### 仍然保留的环境/边界差异

- 全仓格式检查仍有 13 个本任务之外的文件不通过：10 份既有 `.playwright-cli/*.yml` 浏览器快照、`extract-production-accounts-20261010.mjs`、`scripts/local-channel-inspect.mjs` 和已脏改的 `src/components/admin/admin-logical-model-manager.tsx`。未为了全仓格式绿色而覆盖它们；本次样板文件的格式检查全部通过。
- 未执行真实上游、数据库集成、生产镜像构建或部署；这是独立前端视觉阶段，不是业务生成或发布验收。
- 没有批量回归或替换 Canvas、Agent、短剧、计费等原业务页；新样式未从全站入口导入，旧组件和接口保持不变。
- Next dev 自动生成的临时 `next-env.d.ts` / `tsconfig.json` 变动已去掉本次引入的部分，不把本地预览目录带进项目正式配置。

日志位于本地忽略目录 `output/ui-showcase-*`，失败定位 trace 在 `output/ui-showcase/`；截图位于文首的 Codex visualizations 目录。未执行 commit、push、merge 或 deploy。

## 7. 后续迁移顺序（本阶段不实施）

1. 先确认本页深浅主题、品牌色、密度、焦点与状态方向。
2. 逐个迁移按钮、输入、标签和反馈等基础控件，保留原 props 与业务 handler；不先改全局 Token。
3. 迁移作品与素材列表、媒体预览等低风险页面，每个页面单独截图和交互验收。
4. 再迁移图片/视频创作的输入、模型、参数和结果区域，保留既有请求与任务契约。
5. 再迁移主导航及 App Shell，做全站断点和浮层回归。
6. 最后单独评估短剧实验室、Canvas、管理后台和计费；全局主题映射需独立批准及回滚方案。

在用户确认视觉方向之前，不继续执行以上业务页面替换。
