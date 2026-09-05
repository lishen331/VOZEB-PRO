# Agent 测试问题修复计划（2026-09-04）

## 概述

本文档是针对 `AGENT_TEST_HANDOFF_2026-09-04.md` 中发现的 7 个问题的详细修复计划。

## 修复优先级和顺序

### Phase 1: P0 关键问题修复
1. P0-1: 父 Run 部分失败仍显示成功
2. P0-2: 上游提交结果不确定时缺少可恢复身份

### Phase 2: P1 高优先级修复
3. P1-1: HTTP 部署下优化提示词按钮失效
4. P1-2: 图片生成长尾和日志不可观测
5. P1-3: 历史会话可能卡在读取状态
6. P1-4: 视频重试覆盖原始错误
7. P1-5: 音频默认模型缺失

---

## Phase 1: P0 关键问题修复

### P0-1: 父 Run 部分失败仍显示成功

#### 问题描述
- 复现 Run: `agent--SaaZbiapgVx2iej4_jl0`
- 部分子任务成功，部分失败，但父 Run 最终状态为 `completed`
- 用户无法区分完全成功和部分成功

#### 影响范围
- `web/src/lib/server/agent-run-store.ts` - 类型定义
- `web/src/lib/server/agent-run-execution.ts` - 状态聚合逻辑
- `web/src/app/(user)/create/components/creative-run-presentation.ts` - UI 显示
- 相关测试文件

#### 修复步骤

**1. 扩展类型定义**
```typescript
// web/src/lib/server/agent-run-store.ts:17
export type AgentRunStatus = 
  | "planning" 
  | "running" 
  | "paused" 
  | "completed" 
  | "partial_success"  // 新增
  | "failed" 
  | "cancelled";
```

**2. 修改状态聚合逻辑**
```typescript
// web/src/lib/server/agent-run-execution.ts:470-484
const partialSuccess = Boolean(run.assetIds.length) 
  && terminalTasks.some((task) => task.status === "failed") 
  && terminalTasks.some((task) => task.status === "completed");

if (partialSuccess) {
  const completedCount = terminalTasks.filter((task) => task.status === "completed").length;
  const failedCount = terminalTasks.filter((task) => task.status === "failed").length;
  
  await updateAgentRunById(
    runId,
    {
      status: "partial_success",  // 改为 partial_success
      executionId: undefined,
      tasks: terminalTasks,
      timings: { 
        ...(run.timings || { requestAcceptedAt: run.createdAt }), 
        allResultsReadyAt: run.timings?.allResultsReadyAt || Date.now(), 
        runCompletedAt: Date.now() 
      },
    },
    { 
      type: "run.partial_success",  // 新事件类型
      data: { 
        completed: completedCount,
        failed: failedCount,
        assetIds: run.assetIds, 
        reply: `已完成 ${completedCount} 个任务，${failedCount} 个任务失败。${agentRunFailureMessage(terminalTasks)}` 
      } 
    },
    ["running"],
    executionId,
  );
  return;
}
```

**3. 更新前端 UI**
- 在 `creative-run-presentation.ts` 中添加 `partial_success` 状态的显示
- 显示成功/失败任务数量
- 提供失败原因查看入口

**4. 添加测试**
```typescript
// web/src/lib/server/agent-run-executor.test.ts
describe("partial success handling", () => {
  it("should set status to partial_success when some tasks succeed and some fail", async () => {
    // 测试一个成功、两个失败的场景
  });
  
  it("should include success and failure counts in partial_success event", async () => {
    // 验证事件数据包含正确的计数
  });
});
```

#### 验收标准
- [ ] 部分失败的 Run 状态为 `partial_success` 而非 `completed`
- [ ] UI 显示成功和失败的任务数量
- [ ] 可以查看每个失败任务的错误原因
- [ ] 单元测试覆盖部分成功场景
- [ ] API 测试验证状态转换正确

---

### P0-2: 上游提交结果不确定时缺少可恢复身份

#### 问题描述
- 复现: Run `agent-wfDwFW_jL20vP-H8kJXXW`, 子任务 `5b6402d6-abfb-4b06-89e3-6be8a395665c`
- `lastUpstreamStatus=submission_outcome_unknown`，没有可查询的上游任务 ID
- 系统停止重试以避免重复扣费，但用户无法恢复

#### 影响范围
- `web/src/lib/server/agent-run-execution.ts:619-815, 868-895`
- `web/src/lib/server/generation-task-recovery-service.ts:901-917`

#### 修复步骤

**1. 提交前持久化幂等键**
```typescript
// 在提交请求前保存 lease 和幂等键
await updateGenerationTask(taskId, {
  lease: {
    idempotencyKey: generateIdempotencyKey(),
    submissionAttemptedAt: Date.now(),
  }
});

// 然后再发起提交
const response = await submitToUpstream(/*...*/);
```

**2. 立即保存上游 ID**
```typescript
// 解析到上游 ID 时立即原子保存
if (response.upstreamTaskId) {
  await updateGenerationTask(taskId, {
    upstreamTaskId: response.upstreamTaskId,
    lastUpstreamStatus: "submitted",
  });
}
```

**3. 添加人工恢复入口**
- 在管理界面添加"手动输入上游任务 ID"功能
- 添加超时告警（超过 X 分钟仍为 `submission_outcome_unknown`）
- 保留原始提交错误，不被恢复流程覆盖

**4. 添加测试**
```typescript
describe("upstream submission recovery", () => {
  it("should persist idempotency key before submission", async () => {
    // 验证提交前已保存幂等键
  });
  
  it("should save upstream ID immediately after parsing response", async () => {
    // 验证上游 ID 立即保存
  });
  
  it("should allow manual recovery with upstream ID", async () => {
    // 验证人工恢复流程
  });
});
```

#### 验收标准
- [ ] 提交前已持久化幂等键和 lease
- [ ] 上游 ID 解析后立即保存
- [ ] 提供人工恢复入口
- [ ] 超时有明确告警
- [ ] 原始错误不被覆盖
- [ ] 单元测试覆盖恢复流程

---

## Phase 2: P1 高优先级修复

### P1-1: HTTP 部署下优化提示词按钮失效

#### 问题描述
- HTTP 环境下 `crypto.randomUUID()` 不可用
- 点击"优化提示词"按钮没有发送请求
- 部分会话弹出 `crypto.randomUUID is not a function` 错误

#### 影响范围
- `web/src/app/(user)/create/page.tsx:275-296`
- `web/src/app/(user)/create/components/creative-composer.tsx:589-600`

#### 修复步骤

**1. 使用服务端生成 ID**
```typescript
// web/src/app/api/agent/prompt-optimization/route.ts
export async function POST(request: Request) {
  const body = await request.json();
  const requestId = nanoid(); // 服务端生成
  
  // ... 处理逻辑
  
  return Response.json({ 
    requestId, 
    optimizedPrompt: result 
  });
}
```

**2. 前端移除 crypto.randomUUID 依赖**
```typescript
// web/src/app/(user)/create/components/creative-composer.tsx
const optimizePrompt = async () => {
  const currentPrompt = promptValueRef.current; // 确保 ref 同步
  if (!currentPrompt?.trim()) return;
  
  setOptimizing(true);
  try {
    const response = await fetch("/api/agent/prompt-optimization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: currentPrompt }),
    });
    
    if (!response.ok) throw new Error("优化失败");
    
    const { optimizedPrompt } = await response.json();
    setPromptValue(optimizedPrompt); // 更新文本
  } catch (error) {
    message.error(error.message || "提示词优化失败");
  } finally {
    setOptimizing(false);
  }
};
```

**3. 确保 ref 同步**
```typescript
// 在输入变化时同步 ref
<Input
  value={promptValue}
  onChange={(e) => {
    const newValue = e.target.value;
    setPromptValue(newValue);
    promptValueRef.current = newValue; // 同步 ref
  }}
/>
```

**4. 添加测试**
```typescript
describe("prompt optimization in HTTP context", () => {
  it("should work without crypto.randomUUID", async () => {
    // 模拟 HTTP 环境（crypto.randomUUID undefined）
    // 验证优化功能正常
  });
  
  it("should update prompt value after optimization", async () => {
    // 验证优化后文本更新
  });
});
```

#### 验收标准
- [ ] HTTP 环境下优化按钮正常工作
- [ ] 不依赖 `crypto.randomUUID()`
- [ ] 优化成功后文本正确更新
- [ ] 失败时显示明确错误
- [ ] 单元测试覆盖 HTTP 和 HTTPS 环境
- [ ] E2E 测试验证完整流程

---

### P1-2: 图片生成长尾和日志不可观测

#### 问题描述
- 图片生成耗时约 115 秒（Planner 55秒 + 上游 59秒）
- 服务端日志缺少阶段细节
- 出现 `Maximum call stack size exceeded` 和 `System API proxy request failed`

#### 影响范围
- `web/src/lib/server/agent-run-execution.ts` - Planner 日志
- `generation-worker` - 上游提交和轮询日志

#### 修复步骤

**1. 添加结构化日志**
```typescript
// Planner 阶段
logger.info("Planner started", { runId, taskId, model });
logger.info("Planner first byte received", { runId, taskId, elapsed });
logger.info("Planner completed", { runId, taskId, totalElapsed });

// 提交阶段
logger.info("Upstream submission started", { runId, taskId, upstreamModel });
logger.info("Upstream response received", { runId, taskId, upstreamTaskId, elapsed });

// 轮询阶段
logger.info("Upstream poll started", { runId, taskId, upstreamTaskId, attempt });
logger.info("Upstream poll completed", { runId, taskId, status, elapsed });

// 落盘阶段
logger.info("Result persisting started", { runId, taskId });
logger.info("Result persisted", { runId, taskId, elapsed });
```

**2. 修复 Maximum call stack size exceeded**
- 定位具体调用栈
- 检查递归调用或深层嵌套
- 添加调用深度限制

**3. 增强 proxy 错误日志**
```typescript
logger.error("System API proxy request failed", {
  runId,
  taskId,
  errorType: error.constructor.name,
  statusCode: error.response?.status,
  elapsed,
  retryAttempt,
  // 不记录 API key、Cookie 或完整 Secret
});
```

**4. 添加性能测试**
```typescript
describe("image generation performance", () => {
  it("should log phase timings", async () => {
    // 验证每个阶段都有日志输出
  });
  
  it("should complete within reasonable time", async () => {
    // 集成测试验证总耗时
  });
});
```

#### 验收标准
- [ ] 每个阶段有明确的开始/结束日志
- [ ] 日志包含 runId、taskId、upstreamTaskId
- [ ] 找到并修复 stack overflow 原因
- [ ] proxy 错误有详细分类和状态码
- [ ] 不记录敏感信息
- [ ] 性能测试覆盖各阶段耗时

---

### P1-3: 历史会话可能卡在读取状态

#### 问题描述
- 点击历史会话后长时间显示"正在读取会话…"
- Console 出现 `Transition was aborted because of invalid state`
- 观察到 `unhandled rejection`

#### 影响范围
- `web/src/app/(user)/create/use-create-agent.ts`
- `web/src/app/(user)/create/create-conversation-navigation.ts`

#### 修复步骤

**1. 修复路由跳转逻辑**
```typescript
// 检查组件卸载后的异步状态更新
const isMountedRef = useRef(true);

useEffect(() => {
  return () => { isMountedRef.current = false; };
}, []);

const openConversation = async (conversationId: string) => {
  try {
    // 加载会话数据
    const data = await loadConversation(conversationId);
    
    // 组件已卸载则不更新状态
    if (!isMountedRef.current) return;
    
    setConversation(data);
    router.push(`/create?c=${conversationId}`);
  } catch (error) {
    if (!isMountedRef.current) return;
    message.error("会话加载失败");
  }
};
```

**2. 防止并发调用**
```typescript
const loadingRef = useRef(false);

const openConversation = async (conversationId: string) => {
  if (loadingRef.current) return; // 防止重复点击
  
  loadingRef.current = true;
  try {
    // ... 加载逻辑
  } finally {
    loadingRef.current = false;
  }
};
```

**3. 添加超时处理**
```typescript
const CONVERSATION_LOAD_TIMEOUT = 10000; // 10秒超时

const openConversation = async (conversationId: string) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONVERSATION_LOAD_TIMEOUT);
  
  try {
    const data = await loadConversation(conversationId, { signal: controller.signal });
    // ...
  } catch (error) {
    if (error.name === "AbortError") {
      message.error("会话加载超时，请重试");
    }
  } finally {
    clearTimeout(timeoutId);
  }
};
```

**4. 添加测试**
```typescript
describe("conversation loading", () => {
  it("should not update state after component unmount", async () => {
    // 验证组件卸载后不更新状态
  });
  
  it("should prevent concurrent loading", async () => {
    // 验证防止重复点击
  });
  
  it("should timeout after 10 seconds", async () => {
    // 验证超时处理
  });
});
```

#### 验收标准
- [ ] 组件卸载后不更新状态
- [ ] 防止并发加载
- [ ] 超时有明确提示
- [ ] 快速切换不会卡死
- [ ] 移动端和桌面端都正常
- [ ] E2E 测试覆盖重复点击和快速切换

---

### P1-4: 视频重试覆盖原始错误

#### 问题描述
- 复现 Run: `agent-wlTaxKSwvCpdsI1wL6gSq`
- 原始错误: `Invalid ratio`
- 重试后被"当前用户视频任务已达到并发上限"覆盖

#### 影响范围
- `web/src/lib/server/generation-task-recovery-service.ts`
- 任务重试逻辑

#### 修复步骤

**1. 保留错误历史**
```typescript
// 扩展任务类型定义
type GenerationTask = {
  // ... 现有字段
  errorHistory?: Array<{
    error: string;
    timestamp: number;
    attempt: number;
    phase: "validation" | "submission" | "polling" | "retry";
  }>;
  originalError?: string; // 首次错误
  latestError?: string;   // 最新错误
};
```

**2. 记录每次错误**
```typescript
const recordError = async (taskId: string, error: string, phase: string, attempt: number) => {
  const task = await getGenerationTask(taskId);
  const errorHistory = task.errorHistory || [];
  
  await updateGenerationTask(taskId, {
    errorHistory: [
      ...errorHistory,
      { error, timestamp: Date.now(), attempt, phase }
    ],
    originalError: task.originalError || error, // 保留首次错误
    latestError: error, // 更新最新错误
  });
};
```

**3. UI 显示错误历史**
```typescript
// 在错误详情中显示完整历史
<div>
  <div>原始错误: {task.originalError}</div>
  <div>最新错误: {task.latestError}</div>
  <details>
    <summary>错误历史</summary>
    {task.errorHistory?.map((e, i) => (
      <div key={i}>
        尝试 {e.attempt} ({e.phase}): {e.error}
      </div>
    ))}
  </details>
</div>
```

**4. 添加测试**
```typescript
describe("error history tracking", () => {
  it("should preserve original error across retries", async () => {
    // 验证原始错误不被覆盖
  });
  
  it("should record all error attempts", async () => {
    // 验证错误历史完整
  });
});
```

#### 验收标准
- [ ] 保留原始错误不被覆盖
- [ ] 记录每次重试的错误
- [ ] UI 显示完整错误历史
- [ ] 排队/并发错误不覆盖参数校验错误
- [ ] 单元测试覆盖错误记录

---

### P1-5: 音频默认模型缺失

#### 问题描述
- 复现 Run: `agent-ZZmrFYmpudaY6Wpd8jhNH` 等
- 错误: "后台尚未配置可用的默认音频模型"
- 应该在提交前快速校验

#### 影响范围
- `web/src/lib/server/agent-run-execution.ts` - 任务执行前校验
- `web/src/app/(user)/create/components/creative-composer.tsx` - 前端校验

#### 修复步骤

**1. 添加前置校验**
```typescript
// 在执行任务前校验
const validateAudioTaskRequirements = async (task: AgentRunTask) => {
  if (task.type !== "audio") return;
  
  // 检查是否配置了默认音频模型
  const hasDefaultModel = await checkDefaultAudioModel();
  if (!hasDefaultModel) {
    throw new Error("后台尚未配置可用的默认音频模型，请联系管理员配置");
  }
};
```

**2. 前端提前检查**
```typescript
// 在用户提交前检查
const canGenerateAudio = async () => {
  try {
    const response = await fetch("/api/agent/audio/check-config");
    const { hasDefaultModel } = await response.json();
    return hasDefaultModel;
  } catch {
    return false;
  }
};

// 提交前校验
if (hasAudioTasks && !(await canGenerateAudio())) {
  message.warning("音频生成功能暂不可用，请切换到其他模式或联系管理员");
  return;
}
```

**3. 添加配置入口提示**
```typescript
// 管理员看到错误时显示配置链接
if (isAdmin && error.includes("默认音频模型")) {
  message.error(
    <div>
      后台尚未配置默认音频模型
      <a href="/admin/models/audio">前往配置</a>
    </div>
  );
}
```

**4. 添加测试**
```typescript
describe("audio model validation", () => {
  it("should reject audio tasks when no default model configured", async () => {
    // 验证校验逻辑
  });
  
  it("should check config before submitting audio tasks", async () => {
    // 验证前端预检
  });
});
```

#### 验收标准
- [ ] 提交前快速校验音频模型配置
- [ ] 前端显示明确提示
- [ ] 管理员有配置入口链接
- [ ] 不进入生成流程再失败
- [ ] 单元测试覆盖校验逻辑

---

## 修复流程

### 1. 准备阶段
- [ ] 创建功能分支 `fix/agent-test-issues-2026-09-04`
- [ ] 确保本地环境可以运行测试

### 2. 开发阶段（按顺序）
- [ ] P0-1: 父 Run 状态修复
- [ ] P0-2: 上游提交恢复修复
- [ ] P1-1: HTTP 优化提示词修复
- [ ] P1-2: 日志增强
- [ ] P1-3: 历史会话修复
- [ ] P1-4: 错误历史修复
- [ ] P1-5: 音频校验修复

### 3. 测试阶段
- [ ] 运行所有单元测试
- [ ] 运行 E2E 测试
- [ ] 手动验证每个修复点

### 4. 提交阶段
- [ ] 每个问题一个独立 commit
- [ ] Commit message 格式: `fix(agent): 问题描述 (#issue)`
- [ ] 总共 7 个 commits

### 5. 验收阶段
- [ ] 部署到 staging 环境
- [ ] 按照测试文档回归验证
- [ ] 确认所有验收标准通过

---

## 预计时间

- P0-1: 2-3 小时（类型+逻辑+UI+测试）
- P0-2: 3-4 小时（持久化+恢复+测试）
- P1-1: 1-2 小时（ID生成+测试）
- P1-2: 2-3 小时（日志+调试）
- P1-3: 1-2 小时（状态管理+测试）
- P1-4: 1-2 小时（错误历史+测试）
- P1-5: 1 小时（校验+测试）

**总计**: 约 11-17 小时

---

## 注意事项

1. **不记录敏感信息**: 所有日志不得包含 API key、Cookie、密码等
2. **保持向后兼容**: 新状态不影响现有流程
3. **充分测试**: 每个修复都要有单元测试和集成测试
4. **文档更新**: 修改 API 时更新相关文档
5. **代码审查**: 提交前自我审查代码质量

---

## 后续优化建议

1. 监控 P50/P95 耗时变化
2. 建立告警机制（超时、错误率）
3. 定期审查日志可读性
4. 考虑添加性能追踪（tracing）
