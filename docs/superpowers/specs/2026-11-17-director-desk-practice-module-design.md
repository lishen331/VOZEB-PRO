# 3D 导演台接入练习模块设计

**日期**：2026-11-17  
**状态**：待确认  
**来源仓库**：https://github.com/jiguang132/storyai-3d-director-desk（MIT）

---

## 目标

将 storyai-3d-director-desk（React 18 + Vite + Three.js 的浏览器端 3D 场景调度工具）接入 VOZEB-PRO 无限练习页，作为独立的"单项创作工具"入口，不走现有 AI Session 生成流程。

---

## 技术分析

### 依赖版本

| 包 | 外部仓库版本 | 可用版本 | React 19 兼容 |
|---|---|---|---|
| `@react-three/fiber` | v8 | **v9.8.2** | ✅ `>=19 <19.4` |
| `@react-three/drei` | v9 | **v10.7.9** | ✅ `^19` |
| `three` | ^0.184.0 | **0.187.0** | n/a |
| `camera-controls` | ^2.9.0 | **v3.1.2** | ✅ 只需 three >=0.126 |
| `zustand` | ^5.0.3 | 项目已有 ^5.0.14 | ✅ 共用 |

**结论**：直接源码集成，升级到 R3F v9 + drei v10 + camera-controls v3，不需要 iframe。

### hostBridge.ts 适配

原始 `hostBridge.ts` 使用 `window.parent.postMessage` 和 `window.addEventListener`，在直接集成时不需要这套机制。适配方式：
- 丢弃 `initDirectorDeskHostBridge()` 调用
- 主题由主应用 `useThemeStore` 直接传 prop 控制，调用 `applyDirectorDeskTheme()`
- "截图保存"由主应用直接调用 `captureBridge` 中的 `triggerViewportCapture()`，拿到 base64 后上传到素材库

### CSS 隔离

外部仓库 `src/styles/index.css` 有大量 `:root`、`html`、`body` 重置，直接全局导入会污染主应用。
**处理方式**：把 CSS 文件的 `:root`/`html`/`body` 规则改写为 `.director-desk-root` 作用域，以 CSS Module 或 scoped wrapper 形式导入。

---

## 方案

### 1. 安装依赖

```bash
npm install @react-three/fiber@^9 @react-three/drei@^10 three@^0.187.0 camera-controls@^3
npm install -D @types/three@^0.187.0
```

### 2. 路由

新增独立 Server Component 页面（不复用 `[module]/page.tsx`，因为 director-desk 不走 AI Session 流程）：

```
web/src/app/(user)/practice/director-desk/page.tsx             ← Server Component，鉴权
web/src/app/(user)/practice/director-desk/director-desk-editor.tsx  ← Client Component，渲染编辑器
```

路由路径：`/practice/director-desk`

### 3. 源码复制位置

把外部仓库 `src/` 下的编辑器代码复制到：

```
web/src/app/(user)/practice/director-desk/editor/   ← 对应外部 src/editor/
web/src/app/(user)/practice/director-desk/app/      ← 对应外部 src/app/
web/src/app/(user)/practice/director-desk/director-desk.css   ← 改写作用域后的 CSS
```

修改内容：
- 丢弃 `main.tsx`（Next.js 管 root）
- `App.tsx` 重写为 `director-desk-editor.tsx`，去掉 `hostBridge` 调用，接受 `theme` prop
- CSS 中 `:root`/`html`/`body`/`#root` 改为 `.director-desk-root`，所有全局变量改为 scoped
- R3F v8→v9 breaking changes：`<Canvas>` import 路径不变，审查 `drei` hooks 变化（`OrbitControls`、`PerspectiveCamera`、`Grid`、`GizmoHelper`）
- camera-controls v2→v3：检查 `OrbitControls` 相关 API 变化

### 4. 练习首页入口

在 `practice-home.tsx` 的"练习模块"网格内追加一个卡片（放在现有 6 张模块卡后面），复用 `ModuleCard` 组件：

```ts
// 加入 PRACTICE_MODULES 数组末尾，或在渲染时拼接
{ module: "director-desk" as PracticeModuleKind, title: "3D 导演台", description: "用三维视角调度场景、角色和镜头，截图保存到素材库。", icon: Box, accent: "violet" }
```

由于不走 AI Session，点击后直接 `router.push("/practice/director-desk")`，不走 `practiceModulePath`。

### 5. 不修改的部分

- `PracticeModuleKind` 不新增（director-desk 不走 Session API）
- `[module]/page.tsx` 的 `MODULES` 数组不变
- 后端无需新增任何 API

---

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `web/package.json` | 新增 R3F v9、drei v10、three、camera-controls v3 |
| `web/src/app/(user)/practice/director-desk/page.tsx` | 新增（Server Component） |
| `web/src/app/(user)/practice/director-desk/director-desk-editor.tsx` | 新增（Client Component，原 App.tsx 适配） |
| `web/src/app/(user)/practice/director-desk/director-desk.css` | 新增（作用域改写后的 CSS） |
| `web/src/app/(user)/practice/director-desk/editor/` | 新增（复制外部仓库 src/editor/） |
| `web/src/app/(user)/practice/director-desk/app/` | 新增（复制外部仓库 src/app/layout/） |
| `web/src/app/(user)/practice/components/practice-home.tsx` | 在练习模块网格末尾追加 3D 导演台卡片 |

---

## 验收条件

1. `/practice` 首页出现"创作工具"节，含"3D 导演台"卡片。
2. 点击后跳转 `/practice/director-desk`，iframe 正确加载 3D 编辑器，无白屏或 CSP 报错。
3. 主题切换时 iframe 内颜色同步。
4. 点击"截图保存"后素材库出现对应图片，toast 提示成功张数。
5. 390px / 430px 宽度下返回条与截图按钮可见，iframe 无横向溢出。
