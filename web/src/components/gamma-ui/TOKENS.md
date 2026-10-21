# Gamma UI · 设计令牌使用规则

> 值写在 `gamma-tokens.css`；这里只写**什么时候用哪个**。所有颜色都走变量，深浅两套主题自动切换。

## 文字

| 令牌 | 用途 | 对比度（深 / 浅） |
| --- | --- | --- |
| `--gm-text` | 标题、正文、按钮文字 | ≥ 15 : 1 |
| `--gm-text-2` | 说明文字、表格内容、次级按钮 | ≥ 7 : 1 |
| `--gm-text-3` | 时间、计数、占位提示、页脚 | ≥ 4.5 : 1（2026-10-16 调亮后达标） |
| `--gm-accent` | 链接、选中态、强调数字 | 深色为青、浅色为蓝，均 ≥ 4.5 : 1 |

不要用 `opacity` 调文字深浅，透明度叠在不同底色上会掉到 AA 以下；要浅一档就换下一级令牌。

## 状态色

| 令牌 | 用途 |
| --- | --- |
| `--gm-success` | 已完成、上涨、通过 |
| `--gm-warning` | 卡点、即将到期、已退款 |
| `--gm-danger` | 失败、删除、超限 |

作为**文字**直接用；作为**底色**只用 `color-mix(… 8–10%, transparent)` 的浅洗色，文字仍用原色。
实心危险按钮用 `GammaButton variant="danger"`（内部是更深的 `#dc2847`，白字 ≥ 4.5 : 1），不要自己拼 `bg-[var(--gm-danger)] text-white`。

## 面与边

| 令牌 | 用途 |
| --- | --- |
| `--gm-bg` | 页面底 |
| `--gm-bg-elevated` | 侧栏、抽屉、顶栏 |
| `--gm-surface` | 卡片、面板、输入框 |
| `--gm-wash` / `-strong` / `-heavy` | 悬停底、标签底、骨架屏；数字越大越深 |
| `--gm-border` / `-strong` | 分割线 / 输入框描边、悬停描边 |

## 品牌色：accent 还是 blue

- `--gm-accent`：**交互反馈**（焦点环、选中、链接）。会随主题变色。
- `--gm-blue` / `--gm-gradient`：**品牌块面**（主按钮、进度条、徽标底）。两套主题不变。
- 青色 `--gm-cyan` 只用于深色背景上的强调和发光；浅色背景上不可读，不要直接当文字。

## 动效

- 时长：微交互 150–200ms，面板进出 300–400ms，图表入场 700–1200ms。
- 弹簧：`stiffness 420–520 / damping 26–38`；缓动用 `GM_EASE`。
- 所有动画都要在「减少动态效果」下关闭：CSS 写进 `@media (prefers-reduced-motion: reduce)`，motion 组件用 `useReducedMotion()`。

## 断点（只保证桌面与平板）

| 宽度 | 布局 |
| --- | --- |
| ≥ 1280 | 完整三栏（备课页 248 / 内容 / 360） |
| 1024–1279 | 侧栏默认收起为图标；备课页右栏收窄到 300 |
| 768–1023 | 备课页教案栏移到课件下方；筛选条横向滚动 |
| < 768 | 本期不适配 |

## 质量检查（改动前后都跑）

```bash
cd web
npx vitest run src/components/gamma-ui src/app/bluegamma   # 单测（含导航图标几何、图表几何、表单 / 上传校验）
node ../过程文件/bluegamma/visual-regression.mjs check        # 视觉回归：12 张页面截图逐像素比对
node ../过程文件/bluegamma/check-a11y.mjs                     # 无名控件 / 缺 label / 键盘焦点
node ../过程文件/bluegamma/check-contrast.mjs                 # 文字对比度（深浅两套）
node ../过程文件/bluegamma/check-responsive.mjs ../过程文件/bluegamma/shots17   # 1440 / 1024 / 768 截图
```

改了样式且确认是**有意为之**，用 `visual-regression.mjs baseline` 更新基准。
