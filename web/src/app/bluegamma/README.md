# 布鲁伽马改版 · 范围与边界

> 预览页：`/bluegamma`（新版首页）、`/bluegamma/design`（设计系统）。
> 两页都是**本地模拟数据**，不调接口、不扣真实积分，刷新即重置。

## 目录

| 位置                              | 内容                                       |
| --------------------------------- | ------------------------------------------ |
| `src/components/gamma-ui/`        | 设计系统组件（改版后替换现有组件就用这些） |
| `src/app/bluegamma/`              | 两个预览页及其演示数据                     |
| `public/fonts/`                   | 自托管字体（按 unicode-range 切片）        |
| `public/brand/bluegamma-mark.png` | 品牌标识                                   |

## 改版不动的部分：画布

`/canvas` 与 `/drama-canvas` 的 UI 与交互动效**已定稿**，本次改版不碰。

边界由 [canvas-isolation.test.ts](canvas-isolation.test.ts) 固化，四条约束：

1. 画布代码不引用 `gamma-ui` 或 `app/bluegamma`
2. 画布代码不使用 `.gm` 作用域类或 `--gm-*` 变量
3. 新设计系统不引用画布代码或 `global-canvas-*.css`
4. 画布依赖的 18 个站内共享组件被钉成清单

第 4 条是真正的风险点：这些组件画布在用，**替换它们之前必须先回归画布**。清单见测试文件里的 `CANVAS_SHARED_COMPONENTS`，其中与创作参数相关的几个耦合最深：`model-picker`、`creative-generation-preferences`、`creative-composer-popover`、`compact-agent-generation-settings`、`canvas-image-reference-roles-popover`、`audio-settings-panel`。

画布自身还有 clean-room 测试 `src/app/(user)/canvas/canvas-clean-room.test.ts`，与本测试互补：那个管"不引入第三方画布引擎"，这个管"不被改版波及"。

```bash
cd web
npx vitest run src/app/bluegamma/canvas-isolation.test.ts
```

## 设计系统已覆盖的范围

除布局排版外，前端要用到的部分基本都在设计系统页上，可直接交互：

- **基础**：品牌、色彩（深浅两套）、字体方案（4 套可切换）、字阶、圆角
- **组件**：按钮（7 变体 × 4 尺寸 + 加载/确认/扫光）、导航图标（9 个自绘，含选中动效）、形变图标（11 个）、表单控件（分段/标签/开关/勾选/滑块/输入框/徽标）、卡片（学科/作品/任务/统计）、浮层（提示/对话框/菜单/工具提示/空状态）
- **液态玻璃**：4 个范例（媒体控制条、玻璃卡、吸顶栏、厚玻璃浮层）
- **交互动效**：9 个独立交互（点赞、加入素材库、列表删除、骨架屏、拖拽上传、步骤推进、状态流转、校验抖动、撤销条）
- **动效规范**：统一的弹簧与时长参数表

未覆盖：**布局与排版**（按页面逐个排，不做成通用组件）、移动端适配。

## 主题与字体

- 主题：`.gm`（深色，默认）/ `.gm .gm-light`（浅色），由 `GammaThemeProvider` 输出，选择记在 localStorage
- 浅色下青色改走品牌蓝（青在白底只有 1.35:1，不可读），实色块仍用青
- 颜色全部走 `--gm-*` 变量，不要写死 `white/black` 透明度，否则浅色主题会失效
