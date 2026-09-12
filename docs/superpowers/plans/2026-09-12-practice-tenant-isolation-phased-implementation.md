# 无限练习租户隔离分阶段实施计划

> **For agentic workers:** 每个阶段必须独立完成失败测试、最小实现、定向测试、类型检查和差异审查后才能提交；禁止把未完成的跨模块接口一起推送。旧无限练习数据本期不清理、不迁移、不回填学校。

**Goal:** 将 TENANT-01/TENANT-02 拆成可每日独立交付的安全阶段，先封住无限练习创建入口，再逐步补齐项目、任务、日志和结果链路。

**Architecture:** 每个阶段只修改一个明确边界，并保持对 production 创作模块的原有调用契约兼容。第一阶段只处理“当前 active school + 当前用户 → Practice Session → 普通素材授权 → 受信任任务派发信封”，不修改 Canvas/Drama/Script 的存储结构，也不执行历史数据清理。

**Tech Stack:** Next.js Route Handler、TypeScript、PostgreSQL Repository、JSON file fallback、Vitest、参数化 SQL、现有 school access / local media registry / course material authorization / IP authorization。

## Global Constraints

- 不清理、不迁移、不回填现有无限练习历史数据；没有明确学校归属的旧记录不被新代码自动归属当前学校。
- 普通正式创作项目、个人素材、作品、课程和学校数据不得删除或改写。
- `schoolId` 和 `ownerUserId` 只能从当前服务端 Session 推导；客户端同名字段只能忽略或拒绝。
- 每个阶段提交前必须运行该阶段定向测试、`pnpm exec tsc --noEmit --pretty false`、`git diff --check`，并检查只提交本阶段文件。
- 第一阶段不修改 Canvas、Drama、Script、Generation Log、媒体清理和 Worker 恢复业务；这些内容在后续阶段单独交付。
- production 执行档案、普通创作入口、积分扣费和其他模块的现有行为保持不变。
- JSON fallback 与 PostgreSQL 必须保持同一租户过滤语义；SQL 必须是参数化查询。
- 中文源码、测试、计划和文档全部保存为 UTF-8。

## 阶段拆分与每日交付边界

### 阶段 0：计划与边界冻结（本次）

**交付内容：**

- 本计划文件；
- 明确每阶段修改文件、提交边界、测试命令和不在范围；
- 不执行旧数据清理。

**独立门禁：** 计划自检无占位符、无跨阶段矛盾，且工作区差异中不夹带本阶段以外文件。

### 阶段 1：Practice 创建入口安全边界（先完成）

**目标：** 让一次新的无限练习请求在创建 Session 之前完成租户 Scope 和普通素材授权，且不影响 production 模块。

**包含：**

- `PracticeTenantScope { schoolId, ownerUserId }` 从当前 active school Session 推导；
- Practice Session 创建、幂等查询、详情、列表、重试、删除和状态写回同时使用学校 + 用户；
- 客户端提交的 `schoolId` / `ownerUserId` 不参与持久化；
- 普通 asset 校验注册记录、reference/generation 作用域、过期、所有权/课程资料可读性和图片/音频类型；
- IP 仍使用现有授权服务，IP 使用记录只在 Session 成功创建后写入；
- 练习任务派发上下文和 HMAC 信封包含学校范围；
- 为第一阶段所需的 Session 幂等索引提供幂等 Schema 升级；不改历史行归属；
- 失败请求不创建 Session、不派发任务、不写 IP 使用记录。

**明确不包含：**

- Canvas/Drama project scope；
- Script practice 表和路由 scope；
- 普通 generation task 的所有读取/取消/恢复 API；
- generation log、result media 全链路隔离；
- cleanup、历史迁移、E2E 跨校全矩阵。

**第一阶段提交文件白名单：**

- `web/src/lib/server/practice-tenant-scope.ts`
- `web/src/lib/server/practice-tenant-scope.test.ts`
- `web/src/lib/server/practice-session-service.ts`
- `web/src/lib/server/practice-session-service.test.ts`
- `web/src/lib/server/database/practice-repository.ts`
- `web/src/lib/server/database/practice-repository.test.ts`
- `web/src/lib/server/practice-reference-authorization.ts`
- `web/src/lib/server/practice-reference-authorization.test.ts`
- `web/src/app/api/practice/sessions/route.ts`
- `web/src/app/api/practice/sessions/route.test.ts`
- `web/src/app/api/practice/sessions/[id]/route.ts`
- `web/src/app/api/practice/sessions/[id]/route.test.ts`
- `web/src/lib/server/generation-execution-policy.ts`
- `web/src/lib/server/generation-execution-policy.test.ts`
- `web/src/lib/server/generation-task-store.ts`
- `web/src/lib/server/generation-task-store.test.ts`
- `web/src/lib/server/database/schema.ts`

若工作区已有并行修改，提交时只能从白名单中选择本阶段实际新增的 hunk；不得把 UI、导航、Script runtime 或其他任务文件一并提交。

**第一阶段验收命令：**

```powershell
cd C:\CODE\VOZEB-PRO\web
pnpm exec vitest run --no-file-parallelism `
  src/lib/server/practice-tenant-scope.test.ts `
  src/lib/server/practice-session-service.test.ts `
  src/lib/server/database/practice-repository.test.ts `
  src/lib/server/practice-reference-authorization.test.ts `
  src/lib/server/generation-execution-policy.test.ts `
  src/lib/server/generation-task-store.test.ts `
  src/app/api/practice/sessions/route.test.ts `
  "src/app/api/practice/sessions/[id]/route.test.ts"
pnpm exec tsc --noEmit --pretty false
pnpm exec prettier --check `
  src/lib/server/practice-tenant-scope.ts `
  src/lib/server/practice-session-service.ts `
  src/lib/server/database/practice-repository.ts `
  src/lib/server/practice-reference-authorization.ts `
  src/lib/server/generation-execution-policy.ts `
  src/lib/server/generation-task-store.ts `
  src/lib/server/database/schema.ts
```

**第一阶段独立提交建议：**

```text
feat(practice): secure session tenant and reference boundary
```

提交前必须确认：

- production 相关测试未因第一阶段接口变化而失败；
- Session 的 `school_id` 幂等索引与 Repository `ON CONFLICT` 完全一致；
- 没有执行 cleanup；
- `git diff --cached --name-only` 只包含第一阶段白名单中的实际文件。

### 阶段 2：Generation Task / Result 读取与恢复隔离

**目标：** 只处理 task ID、幂等查询、取消、重试、恢复、结果查询和关联媒体，不修改项目和剧本表。

**验收重点：** 学校 A 创建的 task 在学校 B 不能读取、取消、恢复或重试；同用户转校后旧 task 不可通过 ID 或幂等 key 查询；production task 保持原契约。

### 阶段 3：Canvas 练习项目隔离

**目标：** 只处理 Canvas practice 创建、列表、详情、编辑、删除、恢复和 file/PostgreSQL 双实现；production Canvas 不变。

### 阶段 4：Drama 练习项目隔离

**目标：** 只处理 Drama practice 创建、列表、详情、编辑、删除、恢复和 file/PostgreSQL 双实现；production Drama 不变。

### 阶段 5：Script practice 隔离

**目标：** 只处理剧本项目、版本、实体、阶段、Agent 操作和对应 API 路由；不修改普通创作 Script/Agent 契约。

### 阶段 6：跨校 E2E 与发布门禁

**目标：** 在前述阶段均独立通过后，再运行跨校、转校、伪造素材、失败无副作用和完整质量门禁。不在前面阶段提前宣称全链路完成。

## 每日工作与汇报规则

- 每天只推进一个阶段或一个阶段内的一个可验收切片。
- 每天开始先报告：当前阶段、白名单文件、今天只做什么、明确不做什么。
- 每天结束报告：实际修改文件、定向测试结果、typecheck/format 结果、剩余项和下一阶段入口。
- 任何测试或类型错误涉及非本阶段模块时，先停止提交，定位兼容问题，不通过跳过测试或扩大改动范围掩盖。
- 每次提交前执行 `git status --short`、`git diff --stat`、`git diff --check`，确认其他模块差异未被纳入。

## 本次第一部分的执行顺序

1. 复核当前工作区和第一阶段白名单，保留并行修改；
2. 修正第一阶段现有红灯测试和 Schema 幂等契约；
3. 完成 Practice Session + 普通素材授权 + 受信任派发边界；
4. 运行第一阶段全部定向测试与 typecheck；
5. 停止并汇报，不进入阶段 2。
