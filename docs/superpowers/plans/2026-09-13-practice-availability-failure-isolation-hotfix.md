# 无限练习前端可用性失败隔离热修实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不扩大租户隔离改动面的前提下，让模块配置、创作入口与历史会话/项目读取失败相互隔离，避免单条 409/404/500 使全部无限练习模块不可用。

**Architecture:** 保留后端现有权限和错误响应，不吞掉创建、提交和当前操作错误。前端先独立取得并落盘模块能力，再以可降级请求读取项目和历史；指定的失效 `sessionId` 只退出该会话并返回当前模块的新建状态，不清空 capability、不继续轮询。

**Tech Stack:** React 19、Next.js App Router、Ant Design、Vitest、现有 `practiceApi`。

## Global Constraints

- 本次只修用户侧失败隔离，不修改学校权限、租户 Schema、Repository、Generation Task、Canvas、Drama 或 Script 数据契约。
- 不清理、不迁移、不回填历史练习数据。
- 不隐藏创建/提交错误；只有项目列表、历史列表和指定旧会话读取属于可降级辅助数据。
- 保留当前工作区所有并行修改，不回滚、不覆盖。
- 只修改本计划白名单文件。
- 修复后在调查记录中登记未处理技术债，禁止宣称租户隔离全链路完成。

## 白名单文件

- `web/src/app/(user)/practice/components/practice-home.tsx`
- `web/src/app/(user)/practice/components/practice-home.test.tsx`
- `web/src/app/(user)/practice/components/practice-module-workbench.tsx`
- `web/src/app/(user)/practice/components/practice-module-workbench.test.tsx`
- `docs/incidents/2026-09-13-practice-409-tenant-isolation-investigation.md`
- `docs/incidents/2026-09-13-practice-availability-hotfix-record.md`

---

### Task 1: 首页模块能力与辅助数据解耦

**Files:**
- Modify: `web/src/app/(user)/practice/components/practice-home.tsx`
- Test: `web/src/app/(user)/practice/components/practice-home.test.tsx`

**Interfaces:**
- Consumes: `practiceApi.listModules()`、`listProjects()`、`listSessions()`。
- Produces: 模块配置成功后立即显示入口；项目或历史失败只降级对应区域。

- [ ] **Step 1: 写失败测试**

测试源码契约必须证明 `setVisibleModules(configuration.modules...)` 发生在项目/历史等待之前，并且辅助请求采用独立 settled 结果，不能继续使用会阻断模块赋值的整体 `Promise.all`。

- [ ] **Step 2: 运行测试确认失败**

```powershell
cd C:\CODE\VOZEB-PRO\web
pnpm exec vitest run "src/app/(user)/practice/components/practice-home.test.tsx"
```

- [ ] **Step 3: 最小实现**

先落模块、项目开关和剧本开关，再以 `Promise.allSettled` 读取 Canvas、Drama 和最近会话。成功项更新对应状态；失败项保持空数据并只给一条辅助数据错误提示。

- [ ] **Step 4: 运行测试确认通过**

执行 Task 1 测试命令。

### Task 2: 工作台 capability 与历史、指定会话解耦

**Files:**
- Modify: `web/src/app/(user)/practice/components/practice-module-workbench.tsx`
- Test: `web/src/app/(user)/practice/components/practice-module-workbench.test.tsx`

**Interfaces:**
- Consumes: `practiceApi.listModules()`、`listSessions()`、`getSession()`。
- Produces: capability 成功即保持创作表单可用；历史失败不清空 capability；指定会话明确返回“会话不存在、租户范围缺失、无权访问”等不可恢复错误时移除 `sessionId` 并回到新建状态；网络错误和普通 500 保留当前会话。

- [ ] **Step 1: 写失败测试**

测试源码契约必须证明模块与历史使用完全独立的请求；明确不可恢复的指定会话错误执行 `setCurrent(undefined)` 并调用稳定 helper 移除 `sessionId`，普通 500 与网络错误不得移除。

- [ ] **Step 2: 运行测试确认失败**

```powershell
cd C:\CODE\VOZEB-PRO\web
pnpm exec vitest run "src/app/(user)/practice/components/practice-module-workbench.test.tsx"
```

- [ ] **Step 3: 最小实现**

模块与历史使用独立请求分别落状态；增加只删除 `sessionId`、保留 IP 查询参数的路径 helper。明确不可恢复的指定会话错误清空当前会话并替换 URL；普通 500 与网络错误保留当前会话。

- [ ] **Step 4: 运行测试确认通过**

执行 Task 2 测试命令。

### Task 3: 回归、技术债记录和交付边界核对

**Files:**
- Create: `docs/incidents/2026-09-13-practice-availability-hotfix-record.md`
- Modify: `docs/incidents/2026-09-13-practice-409-tenant-isolation-investigation.md`

**Interfaces:**
- Produces: 实际修复、测试结果、未处理技术债、后续阶段边界的可追踪记录。

- [ ] **Step 1: 运行定向测试**

```powershell
cd C:\CODE\VOZEB-PRO\web
pnpm exec vitest run --no-file-parallelism `
  "src/app/(user)/practice/components/practice-home.test.tsx" `
  "src/app/(user)/practice/components/practice-module-workbench.test.tsx" `
  "src/services/api/practice.test.ts" `
  "src/lib/server/practice-session-service.test.ts" `
  "src/app/api/practice/sessions/route.test.ts" `
  "src/app/api/practice/sessions/[id]/route.test.ts"
```

- [ ] **Step 2: 运行类型、Lint、格式和差异检查**

```powershell
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint "src/app/(user)/practice/components/practice-home.tsx" "src/app/(user)/practice/components/practice-module-workbench.tsx" --quiet
pnpm exec prettier --check "src/app/(user)/practice/components/practice-home.tsx" "src/app/(user)/practice/components/practice-home.test.tsx" "src/app/(user)/practice/components/practice-module-workbench.tsx" "src/app/(user)/practice/components/practice-module-workbench.test.tsx"
cd ..
git diff --check
```

- [ ] **Step 3: 浏览器回归**

验证桌面与 390px：模块入口存在；历史辅助区失败不遮挡创作输入；失效 `sessionId` 返回新建状态；页面无横向溢出。

- [ ] **Step 4: 写热修记录和技术债**

记录：409 数据映射直接根因、前端失败隔离改动、验证证据，以及本次明确未处理的 Project、Task/Result、Script、Schema 历史归属等技术债。

- [ ] **Step 5: 停止并汇报**

本次不自动扩大到后续租户隔离阶段；是否提交/推送按用户后续指令执行。