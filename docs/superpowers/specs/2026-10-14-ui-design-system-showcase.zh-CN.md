# VOZEB-PRO 新视觉语言 · 第一阶段

日期：2026-10-14。状态：本地样板已实现，待用户视觉验收。完整使用与验收记录见 `docs/design/2026-10-14-ui-showcase-guide.zh-CN.md`。

## 1. 目标与边界

从黑白工具站升级为克制、有色彩层次的高端 AI 创作工作台。仅交付视觉语言、Design Token、可复用 UI 组件及独立 Showcase。

不替换业务页面，不更改 API、数据库、业务流程、生成契约或旧组件，不引入大型 UI 框架，不自动发布。

## 2. 隔离契约

- 路由 `/ui-showcase` 位于 `(user)` 之外，不挂业务 Shell；标记 noindex。
- 组件：`web/src/components/vozeb-ds/`；样式：`web/src/app/styles/vozeb-ds/`，仅由该路由 layout 导入。
- CSS 根为 `.vz-ds`，Token 为 `--vz-*`，主题为该根的 `data-vz-theme`；不改 `:root`、全局主题 Store 或旧全局样式。
- 独立嵌套 AntD ConfigProvider；Select、Popover、Tooltip、Modal、Drawer、Toast 均挂到样板根。
- 样板自身不调用 API；继续继承现有根 Layout 的站点元数据及只读会话/目录初始化。不能将这一点描述为整个路由“零请求”。
- 模型、积分、媒体卡与生成结果均明确为样例。上传只产生浏览器 Object URL；音频为本地合成 WAV；历史仅为本页内存；导出为本地 JSON。无真实生成、扣费或数据库写入。

## 3. 视觉语言

深空石墨背景、靛紫品牌色、冰青辅助强调；主要内容面板使用实色，导航、工具栏和浮层使用适度毛玻璃。渐变集中于主操作、生成状态、选中与进度，不用大量装饰光球。

控件 10–14px、卡片 18px、面板 24–28px 圆角；间距为 4/8px 系统；使用系统/苹果风格字体栈与既有 Lucide 图标。

按钮按压、卡片轻微上浮、运行态流光边框与 shimmer 服务于状态；尊重 `prefers-reduced-motion`。弹层沿用 AntD 的焦点和入场机制，不复制外部组件源码，不新增动画引擎。

## 4. Token 与可读性

- 页面 `#0a0c11`；容器 `#11141b / #171b24 / #1f242f`。
- 文本 `#f3f5f9 / #aab2c2 / #8792a5`；品牌 `#7c6cff`；强调 `#34d3ff`。
- 主渐变 `#6d48e5 → #4d55d9 → #2d60c7`，保证白字可读。
- 装饰轻边框与交互边框分离；焦点使用实色 outline/ring；语义填充与小字颜色分离。
- 深浅主题的普通文字与各自语义 soft 背景 ≥4.5:1，交互边界/焦点 ≥3:1，使用数值测试覆盖。
- 间距、字号、行高、圆角、阴影、动效均可在 Foundation 区查看；实际值以 `tokens.css` 为准。

## 5. 组件与交互

包含顶栏、侧栏、标题操作区；Button/IconButton；Input/Search/Textarea；Select/Segmented/Tabs/Checkbox/Switch；Tag/StatusBadge/ModelTag；普通/媒体/结果卡；上传、模型、参数、Prompt、生成按钮；Loading/Skeleton/Empty/Error；Modal/Drawer/Popover/Tooltip；Toast/Progress/确认；图片/视频/音频预览。

状态覆盖默认、Hover、Active、Focus、Disabled、Loading、Success、Warning、Error、Selected。状态卡按按钮类型分组，窄屏不拆散标签与示例的对应关系。

关键操作必须真正产生本地效果：选择、上传预览、移除、放大、下载、收藏、复制、参数修改、模拟生成、取消、单次失败与重试；不能出现静默 no-op。无重试回调的错误卡明确作为禁用状态样例。

模型列表支持方向键、Home/End、Enter/Space、Escape 与回焦；比例使用原生 radio。所有 timer 与 Object URL 都在结束/移除/卸载清理。

## 6. 响应式与验证

- ≥1280：248px 完整侧栏、双栏工作区。
- 1101–1279：76px 图标侧栏、双栏工作区。
- 768–1100：76px 图标侧栏、单栏工作区。
- <768：抽屉导航、精简顶栏、单栏内容与大触控区。
- 响应式示意使用同页 Container Query，不使用被全站安全头禁止的 iframe；不放宽 CSP 或 X-Frame-Options。
- 实际 Chromium 验收 1440、1280、834、430、390px；同时检查根与各面板/浮层，不用 overflow 裁切伪装无溢出，不用 force 点击。
- 跑专项及全仓 Vitest、TypeScript、ESLint、Prettier、严格 UTF-8 检查和开发文档验证。未执行的范围必须如实列出。

## 7. 下一阶段

用户确认视觉方向后，再逐页、逐组件迁移。先基础控件与低风险列表，再创作表单和工作台、App Shell；Canvas 与后台最后单独验收。禁止先直接全局替换主题造成全站影响。
