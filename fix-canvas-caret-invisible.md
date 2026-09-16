# 修复：画布输入框光标不可见

**修复时间：** 2026-09-15  
**严重程度：** P1 HIGH  
**状态：** ✅ 已完成

---

## 问题描述

画布底部 prompt 输入框，在有 @ 引用（素材 mention）时，无论背景浅色还是深色，打字光标（caret）完全不可见，用户无法判断光标位置。

---

## 根本原因

`CanvasResourceMentionTextarea` 组件在有 mention 时，将文字颜色改为透明（让下层高亮 overlay 显示）：

```ts
color: showOverlay ? "transparent" : style?.color
```

但 caret 颜色逻辑是：

```ts
caretColor: style?.color || theme.node.text   // ← bug
```

`style?.color` 是 truthy 值时，`||` 短路，caret 直接用父组件传入的颜色——若该颜色与背景相近或被设为透明，caret 就消失了。两条逻辑互相独立，结果任何背景都可能看不见。

---

## 改动内容

**改动文件（2 处，完全对称）：**

- `web/src/app/(user)/canvas/components/canvas-resource-mention-textarea.tsx`
- `web/src/features/drama-canvas-runtime/components/canvas-resource-mention-textarea.tsx`

```ts
// 改前
caretColor: style?.color || theme.node.text,

// 改后
caretColor: theme.node.text,
```

caret 颜色始终跟随主题文字颜色（浅色 `#1e293b`，深色 `#f8fafc`），不受 `color: transparent` 干扰。

---

## 效果

| 场景 | 修复前 | 修复后 |
|---|---|---|
| 有 mention 引用时输入 | 看不到光标 | 光标始终可见 |
| 浅色背景 | 不可见 | 深色光标 |
| 深色背景 | 不可见 | 浅色光标 |
| 无 mention 时 | 正常 | 不受影响 |

---

## 遗留问题（独立跟进）

画布节点拖放/插入时的坐标偏移：`screenToCanvas` 读取的是滞后的 `viewportRef`，而非 canvas-surface 每帧更新的 `displayViewportRef`，导致 pan/zoom 动画进行中落点偏差。需在 `CanvasSurface` 与 `use-canvas-interaction-core` 之间共享实时 viewport ref，涉及多文件，建议单独 PR。

---

## 验证

```
npx tsc --noEmit → 无报错
```
