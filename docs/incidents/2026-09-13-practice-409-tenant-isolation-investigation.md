# 无限练习 409 与租户隔离深层调查记录（2026-09-13）

## 1. 调查目标

本记录用于定位无限练习进入或操作时出现：

```text
{ code: 409, data: null, msg: "练习会话租户范围缺失" }
```

需要回答：

1. 409 的直接根因和完整调用链是什么；
2. 无限练习租户隔离是否确实没有做完，还是已经做了但某个数据契约没有闭环；
3. 为什么前几次检查和推送没有发现问题；
4. 是否存在会让单条会话异常放大成“所有模块不可用”的其他问题；
5. 当前代码是否还有 Session、Project、Generation Task、Result、Script、普通素材或前端初始化方面的未完成隔离。

## 2. 本轮边界

- 本轮先调查和记录，不修改业务代码；
- 不清理、不迁移、不回填历史无限练习数据；
- 不放宽无限练习的学校权限规则；
- 不改变积分规则；
- 不覆盖当前工作区已有未提交修改；
- 不进入下一阶段实现；
- 所有结论区分为“已证实”“高风险待修复”“暂不能认定”。

## 3. 当前工作区事实

- 调查时分支：`develop`；
- 当前工作区已有未提交修改，涉及音频任务、图片任务、文本任务、Practice Session API 和 Practice Session Service；这些修改不属于本调查的初始文档变更，必须保留并单独审查；
- 当前分支与 `origin/develop` 存在分叉，调查时不执行合并或回滚；
- 当前检查以本地工作区代码、提交历史、测试和 Schema 为证据；
- 不把历史测试结果直接当作当前提交的有效证据。

## 4. 已知现象与初步假设

### 4.1 已知 409 触发点

`practice-session-service.ts` 的 `sessionScope()` 在会话对象缺少 `schoolId` 时抛出 409：

```text
练习会话租户范围缺失
```

初步发现：PostgreSQL `practice_sessions` 已经有 `school_id`，创建和 SQL 过滤也已使用该字段，但数据库行映射为 `PracticeSessionRecord` 时曾漏掉 `school_id -> schoolId`，导致后续生命周期同步、任务结果读取或状态写回拿到没有学校范围的会话对象。

### 4.2 初步判断

当前更像是“租户隔离改造的跨层契约没有闭环”，而不是“无限练习完全没有租户隔离”。已完成的部分可能包括：

- 创建时从当前 Session 推导学校和用户；
- PostgreSQL 查询按学校和用户过滤；
- 任务信封携带学校范围；
- 普通素材创建前授权；

但仍需验证：

- 所有数据库读回映射是否都保留学校范围；
- JSON fallback 与 PostgreSQL 是否一致；
- Task/Result/Media/Project/Script 链路是否每一步都带双重条件；
- 前端是否把单个历史请求失败放大成整体模块不可用；
- 真实部署的 Schema 和代码是否处于同一版本。

## 5. 调查清单

### A. 409 直接调用链

- 数据库写入 `practice_sessions.school_id`；
- Repository 查询和映射；
- Service 生命周期同步；
- Task 结果读取和状态写回；
- API 响应；
- 首页/工作台初始化行为。

### B. 租户隔离完整度

- Practice Session：创建、列表、详情、删除、重试、幂等、状态写回；
- Practice Project：Canvas/Drama 创建、列表、详情、编辑、删除、恢复；
- Generation Task：创建、幂等、查询、取消、恢复、重试、结果；
- Script Practice：项目、版本、实体、阶段、Agent 操作；
- 普通素材：注册、所有权、课程资料授权、过期、媒体类型；
- 任务结果和媒体 URL：学校范围、用户范围、来源校验。

### C. 其他可能造成“所有模块不可用”的问题

- `Promise.all` 把历史会话失败与模块配置绑定；
- 模块配置接口与模块实际注册表不一致；
- 数据库 Schema 升级只更新新表，不处理已部署旧表；
- PostgreSQL 集成测试默认跳过；
- 测试 fixture 没有要求 `school_id`；
- 分支同步、合并、Cherry-pick 造成代码和部署版本不一致；
- 旧会话没有学校归属时的预期行为没有在用户界面上定义。

## 6. 证据记录

本节在只读排查完成后补充：

- 已证实的根因；
- 复现路径；
- 涉及文件和提交；
- 发现的其他问题；
- 不属于本问题的改动；
- 建议的分阶段修复范围。

## 7. 暂不下结论的事项

在完成数据库、任务、项目、脚本和前端初始化的逐层核对前，不能直接宣称：

- 无限练习租户隔离已经完整完成；
- 当前线上部署已经包含最新修复；
- 所有模块不可用都由同一个 409 根因造成；
- 当前分支相对生产基线的全部变更都属于本次 Bug。
## 8. 深层调查结论

### 8.1 总结判断

结论：**无限练习租户隔离不是完全没有实现，而是只完成了部分边界，尚未形成全链路闭环。**

已完成的核心部分：

- `requirePracticeTenant()` 从当前服务端 Session 推导 `schoolId + ownerUserId`；
- 新 Practice Session 创建时写入 `school_id`；
- Practice Session 的 PostgreSQL 创建、幂等、详情、列表、更新、删除和重试 SQL 已按学校与用户过滤；
- 受信任练习任务上下文和签名携带学校范围；
- 普通素材创建前已校验注册、过期、所有权/课程可读性及图片/音频类型；
- 新 Screenwriter Agent 的 Run、Artifact、Chat、Confirmation Repository 使用 `PracticeTenantScope`。

确定未完成的部分：

- Canvas/Drama 练习项目详情与后续写操作没有按当前学校过滤；
- Canvas/Drama 练习项目列表仍将 `school_id IS NULL` 的旧数据视为当前学校可见；
- 旧 Script Practice 项目、版本、实体、阶段、Agent 操作仍大量只按 `owner_user_id`；
- Script 导入创建没有把当前 `schoolId` 传入；
- 通用 Generation Task 详情、恢复、取消接口对练习任务只校验用户，没有复核当前学校；
- Session 读取任务结果时只校验任务用户，没有校验任务学校与会话学校一致；
- 前端把模块能力、项目和历史会话请求绑定在同一个 `Promise.all`，单个历史错误会放大为全部模块不可用；
- Schema 中存在旧剧本项目自动回填学校的 SQL，与“不迁移、不回填旧练习数据”的最终规则冲突。

因此，409 是已修复的一个显性症状，但不是租户隔离尚未闭环的唯一问题。

## 9. 已证实问题

### P0-1：PostgreSQL Session 行映射曾丢失 `schoolId`，直接触发 409

**状态：直接根因已定位，修复提交已存在。**

调用链：

```text
practice_sessions.school_id 已写入
→ SELECT * 查询得到 school_id
→ mapPracticeSession() 曾未映射 school_id
→ PracticeSessionRecord.schoolId 为空
→ synchronizePracticeSessionLifecycle()
→ sessionScope()
→ 409 练习会话租户范围缺失
```

涉及文件：

- `web/src/lib/server/database/practice-repository.ts`
- `web/src/lib/server/practice-session-service.ts`

修复提交：

```text
6007fc22 fix(practice): preserve session tenant scope
```

修复内容只有数据库行映射和对应断言，不代表其他租户链路已经完成。

### P0-2：前端把历史会话失败放大成全部模块不可用

**状态：已证实，尚未修复。**

首页：

```text
web/src/app/(user)/practice/components/practice-home.tsx:65-81
```

先获取模块配置，然后把 Canvas 项目、Drama 项目和最近会话放进同一个 `Promise.all`。只有全部成功后才执行 `setVisibleModules()`。因此：

```text
listModules 成功
+ listSessions 返回 409
→ Promise.all 整体 reject
→ visibleModules 保持空数组
→ 角色、场景、道具、分镜、配音入口全部消失
```

模块工作台：

```text
web/src/app/(user)/practice/components/practice-module-workbench.tsx:94-112
```

`listModules()` 与 `listSessions()` 同样使用一个 `Promise.all`。历史失败会让 capability 不赋值，表现为模块不可用。

这解释了用户看到的“一个 409 导致任何功能模块都不可用”。

### P1-1：Canvas/Drama 练习项目详情只按用户读取，没有校验当前学校

**状态：已证实，属于原分阶段计划的阶段 3/4 未完成项。**

入口：

```text
web/src/lib/server/practice-project-service.ts:33-37
```

当前逻辑只调用 `requirePracticeAccess(actor)`，随后：

```text
getCanvasProjectForUser(actor.id, id)
getDramaProjectForUser(actor.id, id)
```

底层详情 SQL 只按 `id + user_id`；服务层只再次检查用户当前仍有某个 active school 身份，没有比较：

```text
project.schoolId === currentAccess.schoolId
```

影响：同一用户从学校 A 转到学校 B 后，只要知道旧项目 ID，仍可能访问、编辑或删除学校 A 的练习项目。

### P1-2：Canvas/Drama 项目列表把无学校归属的旧数据自动暴露给当前学校

**状态：已证实，与已确认存量策略冲突。**

Canvas：

```text
web/src/lib/server/canvas-project-store.ts:69
```

条件为：

```sql
school_id = 当前学校 OR school_id IS NULL
```

JSON fallback 同样允许项目没有 `schoolId` 时通过。

Drama：

```text
web/src/lib/server/drama-project-store.ts:18
```

同样使用：

```sql
project.school_id = 当前学校 OR project.school_id IS NULL
```

已确认的最终规则是旧数据不迁移、不回填、也不自动归到当前学校。因此 `OR school_id IS NULL` 不应继续存在于新的学校隔离读取路径。

### P1-3：旧 Script Practice Repository 仍主要只按用户隔离

**状态：已证实，属于原分阶段计划的阶段 5 未完成项。**

文件：

```text
web/src/lib/server/database/script-practice-repository.ts
```

下列操作只按 `owner_user_id`，没有同时按 `school_id`：

- `getScriptProject()`；
- `listScriptProjects()`；
- `updateScriptProject()`；
- `deleteScriptProject()`；
- `nextScriptVersionNumber()`；
- `createScriptVersion()` 的父项目检查；
- `listScriptVersions()`；
- `getScriptVersion()`；
- `compareAndSetCurrentVersion()`；
- `getCurrentScriptDocument()`；
- `upsert/listScriptEntities()`；
- `set/get/listScriptStages()`；
- `recordScriptAgentOperation()`。

并且版本、实体、阶段和 Agent 操作的 INSERT 没有写入已经存在于 Schema 中的 `school_id` 列。

影响：用户转校后仍可通过旧接口访问、修改、删除和导出旧学校剧本数据。

### P1-4：Script 导入创建没有写入当前学校

**状态：已证实。**

文件：

```text
web/src/app/api/practice/scripts/import/route.ts
```

该路由调用 `requirePracticeAccess(user, "script")`，但丢弃了返回的 `access.schoolId`，随后调用：

```text
importScriptProject(user.id, ...)
```

`importScriptProject()` 内部创建项目时没有 `schoolId`，因此导入项目可能产生 `school_id = NULL`。

普通 `/api/practice/scripts` POST 已传 `access.schoolId`，两条创建路径契约不一致。

### P1-5：通用 Generation Task API 对练习任务只按用户鉴权

**状态：已证实，属于原分阶段计划的阶段 2 未完成项。**

以下任务详情/恢复/取消路由目前只检查：

```text
task.userId === currentUser.id
```

没有在 `task.executionProfile === "open-source-practice"` 时重新推导当前学校并校验 `task.schoolId`：

- `web/src/app/api/text-tasks/[id]/route.ts`
- `web/src/app/api/image-tasks/[id]/route.ts`
- `web/src/app/api/audio-tasks/[id]/route.ts`
- `web/src/app/api/video-generation-tasks/[id]/route.ts`

影响：同一用户从学校 A 转入学校 B 后，只要保留旧任务 ID，仍可能读取、恢复或取消学校 A 的练习任务。

### P1-6：Session 结果关联只校验任务用户，没有校验学校一致

**状态：已证实，高风险数据契约缺口。**

`practice-session-service.ts` 的 `publicTaskResult()` 获取任务后只检查：

```text
task.userId === session.userId
```

没有检查：

```text
task.schoolId === session.schoolId
```

正常路径中的 `taskRefs` 由服务端生成，直接利用难度较高；但该缺口违反了“任务和结果查询同时按 school_id + owner_user_id”的最终规则，也使错误关联或历史异常数据无法被安全隔离。

### P1-7：Schema 自动回填旧剧本项目学校，与最终规则冲突

**状态：已证实。**

文件：

```text
web/src/lib/server/database/schema.ts:1232-1237
```

当前 Schema 初始化包含：

```sql
UPDATE practice_script_projects AS project
SET school_id = membership.school_id
FROM school_memberships AS membership
WHERE project.school_id IS NULL
  AND membership.user_id = project.owner_user_id
  AND membership.status = 'active';
```

这会在 Schema 初始化时把无学校归属的旧剧本项目归到用户当前 active membership。若用户已转校，旧项目可能被错误归入新学校。

这与已确认规则冲突：

```text
不迁移、不回填、不自动归到当前学校
```

### P1-8：当前未提交的练习排队改动存在控制流错误

**状态：已证实，属于已有工作区修改，本调查未改动。**

当前未提交文件包括：

- `web/src/app/api/text-tasks/route.ts`
- `web/src/app/api/image-tasks/route.ts`
- `web/src/app/api/audio-tasks/route.ts`
- `web/src/app/api/practice/sessions/route.ts`
- `web/src/lib/server/practice-session-service.ts`

其中 Text/Image/Audio Route 的结构类似：

```ts
let queuePractice = false;
const createTask = async () => {
    queuePractice = practiceRequest;
    // ...
};
const response = queuePractice
    ? await createTask()
    : await withGenerationConcurrencyLimit(..., createTask);
```

判断 `queuePractice` 时 `createTask()` 尚未执行，所以它必然仍是 `false`。因此预期的“练习任务走免费排队、不占普通生成并发”的外层分支不会生效。

这不是 409 的直接根因，但会继续造成无限练习任务并发、排队或“全部不可用”的异常表现。该改动尚未提交，不能视为已完成。

## 10. 已完成但仍需回归确认的部分

### 10.1 Session PostgreSQL Scope

当前 `PracticeRepository` 的新 Session 创建、幂等、详情、列表、更新、删除、重试和 dispatch claim 已使用：

```sql
WHERE school_id = 当前学校
  AND user_id = 当前用户
```

`mapPracticeSession()` 当前也已映射 `school_id -> schoolId`。

仍需真实 PostgreSQL 集成测试验证，而不仅是 mock row 测试。

### 10.2 新 Screenwriter Agent Repository

`web/src/lib/server/database/script-agent-repository.ts` 的 Run、Artifact、Chat、Confirmation 等新表路径已使用 `PracticeTenantScope`，查询和写入大多同时带：

```text
school_id + owner_user_id + project_id
```

但它与旧 `ScriptPracticeRepository` 并存，形成两套权限标准：新 Agent 数据是学校隔离的，旧项目/版本/实体/阶段接口仍只按用户隔离。不能因为新 Repository 正确就宣称整个剧本练习已完成隔离。

### 10.3 普通素材授权

`practice-reference-authorization.ts` 已验证：

- 注册记录存在；
- 未过期；
- scope 为 reference/generation；
- 当前用户所有或课程资料可读；
- 显式 schoolId 不得跨校；
- 图片/音频角色类型匹配；
- 伪造非 `temporary/`、`permanent/` storage key 被拒绝。

暂未发现确定的直接越权，但仍需真实 PostgreSQL 课程资料授权测试和 Session 失败无副作用测试。

## 11. 为什么之前多次检查仍没有发现

### 11.1 类型允许缺少学校字段

`PracticeSessionRecord.schoolId` 为可选字段。Repository 漏映射时 TypeScript 不会报错。

### 11.2 PostgreSQL 集成测试默认跳过

`practice-repository.test.ts` 只有在：

```text
VOZEB_PRO_RUN_POSTGRES_INTEGRATION=1
```

时才运行真实数据库测试。普通全量 Vitest 会跳过这些用例，无法证明真实数据库 round-trip 正确。

### 11.3 Mock fixture 没有断言 school_id round-trip

此前 mock row 和断言没有要求 `school_id -> schoolId`，导致映射缺失仍能通过。

### 11.4 一次改动跨越太多层和并行模块

租户隔离期间同时修改了 Session、Project、Task、Canvas、Drama、Script、素材授权、Schema、CI 和前端；并且 `develop` 持续合并其他 Drama/Screenwriter 工作。跨层字段容易出现“写入完成、过滤完成、映射遗漏”的半闭环状态。

### 11.5 分阶段计划没有被严格执行到底

现有计划明确把 Task/Result、Canvas、Drama、Script 分为阶段 2–5，但后续提交和汇报曾把局部测试通过描述成整体租户隔离完成。实际代码仍保留上述未完成项。

## 12. 其他风险与暂不能认定的问题

### 12.1 管理员读取练习任务

通用任务 Route 允许平台管理员按任务 ID 读取部分任务。这是既有通用任务行为，是否应对练习任务禁止管理员直接读取，需要产品确认，当前不单独认定为漏洞。

### 12.2 无 schoolId 的个人素材

普通素材 registration 没有 schoolId 时，只要属于当前用户仍允许使用。这可能符合“个人素材随个人可用”的业务规则，也可能与严格学校空间冲突；需要结合素材归属产品规则确认，暂不直接修改。

### 12.3 线上部署版本

源码已包含 409 映射修复，但本轮没有连接服务器核对运行镜像 digest、Schema 版本和数据库行，不能仅凭本地仓库证明当前线上已部署同一版本。

## 13. 建议修复顺序

### 第一批：恢复可用性，控制改动范围

1. 保留并验证 `school_id -> schoolId` 映射修复；
2. 拆开首页/工作台的模块配置与历史请求，历史失败不能隐藏模块；
3. 修正当前未提交排队改动的控制流，并补 Text/Image/Audio/Video 一致测试；
4. 使用真实 PostgreSQL fixture 验证 Session 创建、读回、结果同步和状态写回。

### 第二批：完成 Project 隔离

1. Practice Project 详情传入 `PracticeTenantScope`；
2. Canvas/Drama 详情、更新、删除、恢复按学校+用户；
3. 删除列表中的 `OR school_id IS NULL`；
4. 旧 NULL 项目不显示、不自动归属。

### 第三批：完成 Generation Task/Result 隔离

1. 练习任务 GET、恢复、取消重验当前学校；
2. 任务读取和幂等查询同时带 schoolId + userId；
3. Session taskRef 解析校验任务学校与会话学校一致；
4. Worker 恢复必须保留同一学校范围。

### 第四批：完成旧 Script Practice 隔离

1. 将旧 Repository 方法改为接收 `PracticeTenantScope`；
2. 项目、版本、实体、阶段、Agent 操作全链路写入并过滤 schoolId；
3. Script import 使用当前 Session 的 schoolId；
4. 删除 Schema 中自动回填旧项目学校的 UPDATE；
5. 新 Screenwriter Agent Repository 与旧项目 Repository 使用同一 Scope 契约。

### 第五批：跨校和转校验收

至少覆盖：

```text
学校 A 创建 Session/Project/Task/Script
→ 离开 A
→ 加入 B
→ 列表不可见
→ ID 详情不可读
→ 不可更新/删除/恢复/取消
→ 不可读取结果或媒体
→ B 新建数据正常
```

同时验证 production Canvas、Drama、通用生成任务和个人素材不受影响。

## 14. 当前结论

可以确定：

> **409 的直接根因是 Session 数据库行映射漏掉 schoolId；更深层的根因是无限练习租户隔离只完成了部分创建/Session 边界，Project、Task/Result、旧 Script 和前端失败隔离尚未全部完成。**

因此后续不应继续零散修补单个 409，而应按 Project → Task/Result → Script → E2E 的独立阶段逐步完成，每个阶段只提交自己的文件和测试。
## 15. 2026-09-13 最小可用性热修进展

已按独立执行计划完成前端失败隔离的本地实现：

- 首页模块配置先落状态，项目与历史请求可独立失败；
- 工作台 capability 与历史请求完全解耦；
- 明确失效的 `sessionId` 回到新建状态；
- 网络/500 等临时错误保留当前会话。

本次没有处理本调查记录第 9 节列出的 Project、Task/Result、Script、Schema 租户技术债。实际修改和验证记录见：

```text
docs/incidents/2026-09-13-practice-availability-hotfix-record.md
```
## 16. 独立化迁移时间线与问题来源

### 16.1 不是一级导航迁移直接造成

Git 历史中的两个关键节点：

```text
2026-08-18 e9a613c7 feat: add independent practice project APIs
2026-09-10 7cbdeb1d feat(nav): 练习独立为一级板块
```

`7cbdeb1d` 主要调整导航、模块入口和后台配置，虽然改动了部分练习服务，但并不是 `practice_sessions` 或独立 Practice API 的起点。

真正的架构转折是 `e9a613c7`。该提交一次新增或扩展：

- `/api/practice/projects`；
- `/api/practice/sessions`；
- `practice_sessions`；
- `practice-project-service.ts`；
- `practice-session-service.ts`；
- Canvas/Drama `execution_profile = open-source-practice`；
- Text/Image/Video/Audio 的练习任务路径；
- 独立练习 API client。

因此，当前问题不是“菜单从项目下面移到练习下面”造成，而是更早的“独立 Practice Session + 复用项目 + 复用通用任务”三层架构没有同步完成学校租户契约。

### 16.2 迁移前没有可直接回滚的完整旧无限练习模块

`e9a613c7` 的父提交中已经存在成熟的普通 Canvas/Drama 项目 Store 和 Service，也存在无限练习设计文档与免费执行档案，但不存在后来完整的：

- Practice Home；
- 模块工作台；
- Practice Session API；
- 独立历史会话；
- 六模块闭环。

所以不能简单找到一个“迁移前完整版本”整体恢复。可以复用的是迁移前成熟的项目所有权、持久化和任务关联能力，而不是直接回滚整个练习功能。

### 16.3 原始设计本来就支持“底层项目、前端练习入口”

2026-08-18 设计明确：

- Canvas 作品复制为新的 Canvas 无限练习项目；
- 短剧作品复制为新的短剧无限练习项目；
- 项目使用 `open-source-practice` 执行策略；
- 正式项目不切换为练习模式；
- 前端只选择练习模块和练习项目类型。

因此用户提出的方向成立：

> 前端继续显示在“练习”板块，底层仍以 Canvas/Drama 练习项目作为稳定业务聚合根。

问题在于后来又增加了独立 Session、独立 Script 和通用 Task 状态，且这些表之间没有统一由一个项目 Scope 驱动。

## 17. 技术债的三条出路

### 方案 A：继续把当前所有独立表补齐租户隔离

做法：

- Session、Project、Task/Result、Script 全部保留；
- 每个 Repository 和 API 都补 `school_id + owner_user_id`；
- 增加跨校 E2E。

优点：现有功能形态变化最小。

缺点：需要长期维护多套项目、会话、任务和剧本权限规则；漏一个映射或查询就会再次出现类似 409。改动面最大、风险最高。

### 方案 B：回退到“项目聚合根”，Session 降为项目内运行记录（推荐）

做法：

- 前端继续保持当前 `/practice` 和六模块入口；
- Canvas/Drama 练习仍写入原项目表，使用 `execution_profile = open-source-practice`；
- 每次模块练习都必须绑定一个服务端创建的练习项目；
- Session 不再独立决定租户，只保存 `project_kind + project_id + task_ref + 展示快照`；
- 所有读写先通过项目 Scope：当前学校 + 当前用户 + practice profile；
- Task/Result 继承项目 Scope，不再分别猜测学校归属；
- Script 作为独立项目类型或项目资产，但必须使用同一个 Scope 契约。

优点：符合原设计和用户理解；租户校验集中在项目层；前端无需搬回旧菜单；后续更不容易遗漏。

缺点：不能直接删除当前 Session/Script 表，需要分阶段收敛；短期需要新旧接口适配，但不能长期双写。

### 方案 C：只做前端容错，后端技术债长期保留

做法：只让错误不影响页面使用，不继续完成租户隔离。

优点：短期改动最小。

缺点：只能解决“看起来全部不可用”，不能解决转校后读取旧项目、旧任务、旧剧本的问题，不适合作为最终架构。

## 18. 推荐收敛路径

推荐采用“短期热修 + 中期项目聚合根”的组合：

1. 先交付当前最小前端失败隔离，让历史错误不阻断新建练习；
2. 不再继续给每张表零散打补丁；
3. 定义统一 `PracticeProjectScope`，由项目详情入口一次完成学校、用户和 execution profile 校验；
4. Canvas/Drama 项目详情、更新、删除先改为统一 Scope；
5. Session 查询改为必须绑定并验证项目 Scope；
6. Task/Result 从项目 Scope 派生，不允许仅凭 userId；
7. Script 逐步迁移到同一项目 Scope；
8. 验证完成后移除 `OR school_id IS NULL` 和错误历史回填，不保留长期双读双写。

这条路径不要求把前端重新放回“项目”菜单。产品展示和底层聚合可以分离：

```text
前端：/practice 独立一级板块
底层：Canvas / Drama / Script Practice Project 聚合根
运行：Session 只是项目内一次练习记录
任务：Task / Result 继承项目 Scope
```

## 19. 迁移问题最终判断

可以确定：

> 不是前端导航迁移导致问题，而是 8 月 18 日开始的底层独立化同时引入 Project、Session 和通用 Task 三套状态，后续学校租户隔离只逐步补到了部分层级。

最安全的长期出路不是整体回滚，也不是继续无限补丁，而是保留现在的前端练习入口，把底层权限和数据归属重新收敛到练习项目聚合根。