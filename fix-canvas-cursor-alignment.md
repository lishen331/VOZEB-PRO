# 修复：画布光标坐标偏移 + 输入框光标不可见

**修复时间：** 2026-09-15  
**严重程度：** P1 HIGH  
**状态：** ✅ 已完成

---

## 问题一：输入框光标（caret）不可见

### 现象
prompt 输入框在有 @ 引用（mention）时，无论浅色还是深色背景，打字光标完全看不见。

### 根因
`CanvasResourceMentionTextarea` 显示 mention 时把文字色设为 `transparent`（让下层高亮 overlay 透出来），但 caret 颜色逻辑是：
```ts
caretColor: style?.color || theme.node.text   // ← bug
```
`style?.color` 不为空时短路，caret 用了父组件传入的颜色——该颜色可能与背景相近，caret 消失。

### 改动（2 文件）
- `web/src/app/(user)/canvas/components/canvas-resource-mention-textarea.tsx`
- `web/src/features/drama-canvas-runtime/components/canvas-resource-mention-textarea.tsx`

```ts
// 改前
caretColor: style?.color || theme.node.text,
// 改后
caretColor: theme.node.text,
```

---

## 问题二：画布坐标偏移（节点落点/拖放位置不准）

### 现象
在 zoom/pan 动画进行中，点击或拖放节点的落点与肉眼所见位置有偏移。

### 根因
`screenToCanvas` 使用 `viewportRef.current`（已提交的 viewport），而画布每帧通过 `previewViewport()` 更新的是 `displayViewportRef`（实时帧 viewport）。两者在动画期间脱节，导致坐标计算偏差。

### 改动（8 文件，app 和 drama-canvas-runtime 各 4 个）

**canvas-surface.tsx（2 个）**
- `CanvasSurfaceProps` 新增可选 `onDisplayViewportChange?(viewport): void`
- 函数签名解构新增该参数
- `previewViewport` 回调内调用 `onDisplayViewportChange?.(next)`

**use-canvas-page-state.tsx（2 个）**
- 新增 `displayViewportRef = useRef(viewport)`
- 加入 hook 返回对象

**use-canvas-interaction-core.tsx（2 个）**
- state 解构新增 `displayViewportRef`
- `screenToCanvas` 改用 `displayViewportRef.current` 替换 `viewportRef.current`

**canvas-client-page.tsx（2 个）**
- state 解构新增 `displayViewportRef`
- `<CanvasSurface>` 新增 `onDisplayViewportChange={(next) => { displayViewportRef.current = next; }}`

### 数据流
```
previewViewport(next)
  → displayViewportRef.current = next    (canvas-surface 内部)
  → onDisplayViewportChange?.(next)      (回调通知外部)
    → displayViewportRef.current = next  (page-state ref 同步)
      → screenToCanvas 使用此 ref       (坐标始终与渲染帧一致)
```

---

## 验证

```
npx tsc --noEmit → EXIT: 0（无新增类型错误）
```

注：line 338 `onRetrySave` 报错为改动前已存在的无关 bug。
