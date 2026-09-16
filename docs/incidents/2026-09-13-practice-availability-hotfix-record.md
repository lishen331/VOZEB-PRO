# 无限练习前端可用性失败隔离热修记录（2026-09-13）

## 修复目标

在不修改学校权限和后端租户数据契约的情况下，避免项目列表、历史会话或指定旧会话错误导致全部无限练习模块不可用。

## 实际修改

### 首页

文件：

```text
web/src/app/(user)/practice/components/practice-home.tsx
```

- `listModules()` 成功后立即写入模块、项目开关和剧本开关；
- Canvas 项目、Drama 项目和最近会话改为 `Promise.allSettled()`；
- 任一辅助请求失败只保留对应区域空数据；
- 失败提示明确“不影响新建练习”；
- 不再因历史 409/404/500 清空所有模块入口。

### 模块工作台

文件：

```text
web/src/app/(user)/practice/components/practice-module-workbench.tsx
```

- 模块能力和历史会话改为完全独立请求；
- 模块能力不再等待历史请求完成；
- 历史请求长时间 pending 或失败时，创作输入仍可使用；
- 指定旧 `sessionId` 明确返回“会话不存在、租户范围缺失、无权访问”时，移除 `sessionId` 并回到当前模块新建状态；
- 保留 `ipId`、`subIpId` 等其他查询参数；
- 网络错误、500 等临时错误不会清空当前会话或移除 URL。

## 测试证据

TDD 红灯：

```text
2 个新增测试失败
原因：当前首页仍用整体 Promise.all；工作台 capability 仍与历史绑定且没有 reset helper。
```

实现后的定向结果：

```text
Test Files  6 passed
Tests       66 passed
```

覆盖文件：

- Practice Home；
- Practice Module Workbench；
- Practice API client；
- Practice Session Service；
- Session collection route；
- Session detail/retry route。

代码质量：

- 4 个热修文件 ESLint 通过；
- 4 个热修文件 Prettier 通过；
- `git diff --check` 通过。

全局 TypeScript 检查在首次执行时曾被并行修改中的 `script-agent-profiles.ts` 阻断；并行任务随后修正该文件。最终重新执行：

```text
pnpm exec tsc --noEmit --pretty false
退出码 0
```

本次热修没有修改该并行文件。

## 代码审查修正

首版实现经独立审查发现：

1. `Promise.allSettled()` 仍等待历史完成后才写 capability；
2. 所有 `getSession()` 错误都会移除 `sessionId`，临时错误可能让有效会话看似丢失。

最终实现已改为：

- 模块和历史完全独立；
- 只有明确不可恢复错误才退出旧会话；
- 临时错误保留当前会话。

## 明确未处理的技术债

以下问题不是本次热修范围，仍需按阶段处理：

1. Canvas/Drama 练习项目详情、更新、删除和恢复未全部按 `school_id + owner_user_id`；
2. 项目列表仍允许 `school_id IS NULL` 旧项目自动可见；
3. 通用 Generation Task 详情、恢复、取消只校验用户；
4. Session 结果关联只校验任务用户，未校验任务学校；
5. 旧 Script Practice Repository 多数操作只按 `owner_user_id`；
6. Script 导入创建未传当前 `schoolId`；
7. Schema 自动回填旧剧本项目学校，与“不迁移、不回填”规则冲突；
8. 当前并行的练习任务排队实现仍需独立验证；
9. 需要真实 PostgreSQL 跨校、转校和结果恢复 E2E。

详细证据见：

```text
docs/incidents/2026-09-13-practice-409-tenant-isolation-investigation.md
```

## 交付边界

本次热修只保证：

> 辅助历史数据报错时，用户仍能看到并使用已启用的无限练习模块；明确失效的旧会话回到新建状态，临时错误不丢失当前会话。

本记录不声明租户隔离全链路已完成。