# Canvas Agent 下一阶段测试证据与最终报告方案

> 范围：仅普通 Canvas Agent（`/canvas/[id]`），不覆盖主 Agent（`/create`）及短剧实验室。本文件只规划测试、证据采集和报告审查，不修改业务代码。

## 1. 目标

把下一阶段黑盒测试升级为可复核证据链：每个结论都能由环境、请求、SSE、上游、持久化状态和截图相互对齐；成功、失败、取消、部分成功和恢复均可重放与审计。

## 2. 统一测试编号

每次独立业务尝试使用唯一 `CASE-ID`：

```text
CA-<YYYYMMDD>-<序号>
例如 CA-20260910-001
```

重试不覆盖原记录，使用 `attempt-01`、`attempt-02`。一个 CASE 只对应一次用户意图和一次最终结论。

## 3. 必采证据

### 3.1 基础元数据

记录 `caseId`、`attempt`、staging 地址、准确开始/结束时间、浏览器及版本、视口、projectId、canvasId、selectedNodeIds、输入节点类型、操作类型、预期结果和实际结果。测试账号只写别名，不写密码。

### 3.2 运行与任务 ID

必须建立以下关联：

```yaml
agentRunId: ...
conversationId: ...
assistantMessageId: ...
providerTasks:
  - provider: ...
    taskId: ...
    logicalModel: ...
    upstreamModel: ...
```

没有发出某层 ID 时写 `not-emitted`，不得用时间或名称猜测替代。

### 3.3 SSE 事件

保存脱敏后的原始事件流和摘要。每条事件记录接收时间、event、runId、stage、status、sequence、startedAt、completedAt、durationMs。重点核验顺序、重复事件幂等、断线恢复、刷新/离页/重新进入补齐最终状态、阶段秒数与最终耗时一致性。

### 3.4 截图

每个 CASE 至少保留：

```text
<caseId>-01-before.png
<caseId>-02-running.png
<caseId>-03-result.png
<caseId>-04-error.png       # 失败时
<caseId>-05-reloaded.png
```

截图必须包含关键上下文；媒体测试同时记录可见节点 ID 或结果卡信息。

### 3.5 上游记录

记录 provider、requestId、logicalModel、upstreamModel、输入类型、参考数量、提交时间、上游状态、上游耗时和扣费状态。请求 ID 可截图或脱敏保存；禁止保存 API Key、Cookie、Authorization 或完整签名 URL。

### 3.6 数据库/服务端状态

只读记录 Agent Run 状态、阶段历史是否存在、结果引用、provider task 状态、canvas 节点（id/type/content hash/media reference）、资产绑定关系和保存时间。无法访问数据库时明确写“未核验”，不得从 UI 推断持久化成功。

## 4. 并行会话任务分工

### 会话 A：正向流程

单文本、单图片、单视频、混合多选；图片/视频/文本生成；如 Canvas 暴露音频入口再测；核验结果与节点/资产引用关系。交付 CASE 证据包和正向通过率。

### 会话 B：生命周期与恢复

取消、暂停/继续（若暴露）、SSE 断开、刷新、离页后重新进入、重复进入、重复点击、重复 SSE、上游迟到结果。交付状态转移表，重点检查重复写入、空结果、旧结果覆盖。

### 会话 C：破坏性与边界

生成期间删除/修改目标节点或类型、删除/修改引用媒体、空选择、无连接、无效/超大媒体、布局期间移动节点、删除/断开连线确认和撤销。交付预期保护、实际保护和残留风险。

### 会话 D：证据与报告审查

对照 A/B/C 结果检查 Run、任务、SSE、数据库是否同链路；区分 UI 成功、上游接受、任务成功、持久化和最终展示；审查证据缺口及矛盾；汇总最终报告，不把测试计划写成测试结果。

## 5. 结果评级

| 等级 | 证据标准 |
|---|---|
| A | UI、网络/SSE、上游、持久化四类证据齐全，时间和 ID 可对齐 |
| B | UI 加网络或服务端证据，缺一类关键证据 |
| C | 只有 UI 现象或隔离/单元测试，不能证明线上链路 |
| D | 推测、未复现或证据互相矛盾 |

审查每条结论：是否 staging、是否有准确时间和 Run/task ID、截图/SSE/上游/数据库能否串联、是否把“未观察到”误写成“不存在”、重试是否新 attempt、是否泄露敏感信息。

## 6. 最终报告结构

```text
1. 执行摘要
2. 范围与不包含项
3. 环境、版本、浏览器、账号别名
4. 测试矩阵与覆盖率
5. 通过项（CASE-ID）
6. 失败项（现象、复现、影响、证据）
7. 生命周期与恢复
8. 媒体和资产引用
9. 上游与本地状态一致性
10. SSE 阶段与耗时准确性
11. 持久化与幂等性
12. 跨会话证据审查与矛盾处理
13. 阻断问题与优先级
14. 未验证项和下一步
15. CASE/证据索引及脱敏日志
```

结论只使用：`已验证通过`、`代码/隔离测试通过，线上未验证`、`线上观察到，但持久化未核验`、`失败，已复现`、`未复现`、`阻塞，缺少条件`。禁止以“应该可以”“基本完成”作为验收结论。

## 7. 结束条件

正向矩阵全部执行或标记阻塞；取消、刷新、离页恢复、重复进入各至少一次；每类真实媒体至少有一个可对齐上游记录；失败/部分成功/迟到结果各覆盖一次或明确无法制造；所有 CASE 有唯一编号和证据索引；其他会话结果完成 A/B/C/D 分级；报告严格区分事实、未核验项和推断。

## 8. 交付目录

```text
测试证据/<caseId>/
  metadata.yaml
  sse-redacted.ndjson
  upstream-redacted.yaml
  database-snapshot.json
  01-before.png  02-running.png  03-result.png  04-error.png  05-reloaded.png
  notes.md

docs/audits/<日期>-canvas-agent-phase-next-test-report.zh-CN.md
```
