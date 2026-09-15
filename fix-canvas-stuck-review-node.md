# 修复：画布节点「检查状态」死循环

**修复时间：** 2026-09-15  
**严重程度：** P1 HIGH  
**状态：** ✅ 已完成

---

## 问题描述

画布生成节点在特定情况下会进入无法自行退出的橙色「等待状态确认」状态，用户点「检查状态」后反复看到同样的错误，节点永远卡死。

**错误文本：**
```
等待状态确认
原任务没有保存上游任务 ID，无法安全追回结果
```

---

## 根本原因

任务提交到上游图像服务（如 gpt-image-2-all）后，若保存上游任务 ID 的步骤中途失败（网络抖动、服务崩溃、页面刷新），数据库中就没有该 ID 的记录。

用户点「检查状态」时，后端返回 HTTP 409，提示无 ID 可查。但前端错误处理没有识别这种情况，默认将节点重新挂回「等待确认」状态，导致死循环：

```
点击 → 报 409 → 挂回原状 → 点击 → 报 409 → …（无限循环）
```

---

## 改动内容

**改动文件（共 2 处，逻辑完全对称）：**

- `web/src/app/(user)/canvas/[id]/use-canvas-generation-actions.tsx`
- `web/src/features/drama-canvas-runtime/[id]/use-canvas-generation-actions.tsx`

**每个文件两行改动：**

新增 import：
```ts
import { isDefinitiveGenerationTaskRequestFailure } from "@/services/api/generation-task-request-error";
```

在 `recoverReviewedNode` 的 catch 块，把 409 类错误纳入「终态失败」判断：
```ts
// 改前
const terminalFailure =
  error instanceof ImageGenerationTaskTerminalError ||
  isGenerationTaskTerminalError(error) ||
  (metadata.videoTask ? classifyCanvasVideoTaskFailure(error) === "upstream_failed" : false);

// 改后
const terminalFailure =
  error instanceof ImageGenerationTaskTerminalError ||
  isGenerationTaskTerminalError(error) ||
  isDefinitiveGenerationTaskRequestFailure(error) ||   // ← 新增
  (metadata.videoTask ? classifyCanvasVideoTaskFailure(error) === "upstream_failed" : false);
```

`isDefinitiveGenerationTaskRequestFailure` 是已有工具函数，覆盖所有 4xx 确定性失败（400/401/403/404/409/422 等），排除可重试的 408/429。

---

## 用户侧变化

| | 修复前 | 修复后 |
|---|---|---|
| 点「检查状态」后 | 节点还是橙色，同样错误，永远卡死 | 节点变红色报错，出现「重新生成」按钮 |
| 后续操作 | 只能手动删节点、重新配置 | 直接点「重新生成」，用原始 prompt 重跑 |
| 影响范围 | — | 仅影响「检查状态」按钮的错误路径，不影响正常生成流程 |

---

## 验证

```
npx tsc --noEmit → 无报错
```

*对应测试报告：[test-report-2026-09-15.md](./test-report-2026-09-15.md) BUG-05*
