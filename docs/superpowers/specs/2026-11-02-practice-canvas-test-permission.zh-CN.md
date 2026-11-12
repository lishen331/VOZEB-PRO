# 无限练习画布：测试权限（可选模型）

- 日期：2026-11-02
- 状态：已确认，实施中（2026-11-02 用户确认：方案同意；渠道按部署目标配置，推生产配生产、推测试配测试）
- 前置：`docs/superpowers/specs/2026-10-29-practice-canvas.zh-CN.md`（练习画布基础，已部分落地）

## 背景

练习画布（`execution_profile='open-source-practice'`）对普通用户只暴露三个固定虚拟模型名：
`gamaimage` / `gamavideo` / `gamatext`，下拉不可切换，后端从
`purpose='open-source-practice'` 的渠道池里随机选一个上游模型。

测试阶段需要让**部分指定用户**直接看到并选择练习池里的真实上游模型，用于验证各渠道。
正式画布 `/canvas/[id]` 与正式模型路由**不得受任何影响**。

## 一、权限设计：复用现有前台角色菜单权限

前台用户（`teacher` / `student` / `normal-user`）的权限已经是"角色 → 菜单权限"模式：

- 权限清单：`USER_NAVIGATION_MENU_PERMISSION_GROUPS`（`web/src/lib/feature-modules.ts`）
- 角色存储：`rbac_roles.permissions`（jsonb），由 `normalizeUserNavigationMenuPermissions` 归一化
- 读取：`getUserNavigationMenuPermissions(userId, activeSchoolId)`（`web/src/lib/server/user-navigation-permissions.ts`）
- 管理界面：后台"角色管理"里编辑前台角色时渲染的"前台菜单权限"树（`admin-rbac-sections.tsx` 的 `userMenuPermissionTree`）

因此新增一个权限项即可在现有界面里给任意前台角色勾选，管理员、教师、学生、普通用户都能获得，
无需新表、新接口、新管理页面。

### 1.1 新增权限项

`practice-model-test` **不是功能模块**。做成功能模块会有两个副作用：它会出现在后台"功能模块"开关里，
一旦关闭就对全站生效；而且它没有页面路径，放进 `FEATURE_MODULES` 没有对应路由。

它只是一个菜单权限，声明在 `OPT_IN_USER_NAVIGATION_MENU_PERMISSIONS`（`feature-modules.ts`），
并挂进 `practice` 分组：

```ts
export const OPT_IN_USER_NAVIGATION_MENU_PERMISSIONS = [{ id: "practice-model-test", name: "练习模型测试" }] as const;
{ key: "practice", label: "无限练习", moduleIds: ["practice", "practice-model-test"] }
```

`userMenuPermissionTree` 渲染子项标题时先查这张表，命中就用"练习模型测试"，
不再调用 `featureModuleDefinition`（该函数对非功能模块 ID 会取空崩溃）。

### 1.2 默认不授予

`DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS` 从全量 ID 改为**去掉 opt-in 项**。
这个常量有三处消费，行为都符合"默认没有"：

- `schema-school-domain.ts` 的角色种子：`ON CONFLICT` 只在角色权限是空数组时回填，
  回填结果不含本权限；已有权限的角色完全不动。
- `getUserNavigationMenuPermissions`：无角色绑定的用户返回空数组（fail closed）；
  管理员无绑定才回退该默认集，默认集不含本权限。
- `normalizeUserNavigationMenuPermissions`：入参不是数组时回退该默认集，同样不含本权限。
  白名单仍是全量 ID，角色管理里显式勾选的值能正常落库。

### 1.3 平台管理员

平台管理员的菜单权限存在独立的平台角色上（`admin.menu.*`），不在前台菜单权限里。
按"管理员也能测"的需求，`role === "admin"` 的用户视为拥有本权限，不需要再勾选。

## 二、后端：练习画布的模型解析

先说清现状，避免改错路径：`resolvePracticeGenerationCandidates`
（`runninghub-workflow-runtime.ts`）在练习模式下，图片/视频/音频**只走 RunningHub 工作流**，
文本走 `purpose` 过滤后的逻辑模型。这条路径服务于短剧练习的七条工作流，**保持不动**。

练习画布是另一条路径，用虚拟模型名区分：`gamaimage` / `gamavideo` / `gamatext`。
这三个名字不是逻辑模型，现有解析会返回空。因此只在练习分支内、且请求模型是这三个虚拟名
（或测试用户指定的真实模型）时走新路径，其余请求原样返回。

### 2.1 虚拟名：随机选练习池渠道

`executionProfile === "open-source-practice"` 且请求模型是 `gamaimage` / `gamavideo` /
`gamatext` 时：

1. 取 `purpose='open-source-practice'`、已启用、连接就绪、且 `channelModelCapability` 与虚拟名
   能力匹配（图片/视频/文本）的渠道，展开其 `models`。
2. 候选为空时返回空数组，由现有 Route 报"参数不完整"（不新造错误文案）。
3. 用 `Math.random()` 打乱后返回全部候选。**返回全部而不是只返回一个**：现有 Route 会按顺序
   做健康检查、能力约束和故障转移，只返回一个会让渠道故障时直接失败。随机体现在顺序上，
   第一个健康候选即本次命中的渠道。

### 2.2 指定真实模型：仅测试权限

请求模型不是虚拟名、且 `practiceModelTest === true` 时：

- 只保留练习池中 `channelSupportsModel` 命中该模型、且能力匹配的渠道。
- 命中则返回这些候选（同样按随机顺序，便于同模型多渠道故障转移）。
- 不命中返回空数组。**不回退随机**：测试用户指定了一个不存在的模型就应该看到失败，
  静默换模型会让测试结果失真。

`practiceModelTest` 不为真时，非虚拟名请求走原有逻辑（工作流/文本逻辑模型），行为与现在一致。

### 2.3 权限只在服务端判定

`PracticeWorkflowContext` 增加可选 `practiceModelTest?: boolean`。它由任务 Route 填入：

- 仅当 `executionProfile === "open-source-practice"` 且 `surface === "canvas"` 时才查权限。
  短剧等其他练习表面不查、不传，因此完全走原路径。
- 判定函数 `userHasPracticeModelTestAccess(user, activeSchoolId)`：`user.role === "admin"` 直接
  放行；否则看 `getUserNavigationMenuPermissions` 是否包含 `practice-model-test`。
- 前端随请求传来的任何同名字段都不采信：`sanitizeGenerationContext` 会丢弃未登记字段，
  且 Route 只用服务端查到的结果覆盖。

涉及 Route：`image-tasks`、`video-generation-tasks`、`text-tasks`。
`audio-tasks` 不在练习画布范围（无虚拟音频名），不改。

## 三、前端：练习画布模型下拉的两种模式

练习画布通过 `PracticeCanvasClientPage` 传 `executionProfile="open-source-practice"`，
正式画布不传（`undefined`），所有新逻辑都包在该判断内。

新增接口：`GET /api/practice/available-models?type=image|video|text`

- 无 `practice-model-test` 权限：返回 `{ mode: "fixed", models: [{ id: "gamaimage", name: "gamaimage" }] }`
  （按 type 返回对应的一个虚拟名）。
- 有权限：返回 `{ mode: "selectable", models: [...] }`，列表来自
  `purpose='open-source-practice'` 渠道上 capability 匹配的上游模型，去重。
- 未登录或无练习权限：401/403。

模型下拉组件（`canvas-config-node-panel.tsx` 及实际承载模型选择的组件，实施时定位）：

- `executionProfile !== "open-source-practice"`：完全走现有逻辑，不请求新接口。
- 练习模式 + `mode: "fixed"`：只显示对应虚拟名，下拉禁用。
- 练习模式 + `mode: "selectable"`：显示接口返回的真实模型列表，可切换，
  选中值写入 `effectiveConfig` 的对应模型字段，随生成请求提交（后端按第二节校验）。

## 四、不改什么（隔离红线）

1. `/canvas/[id]` 正式画布的路由、组件行为不变；`executionProfile` 仅作为可选 prop 向下传递，
   默认 `undefined`，所有新增分支都要求它显式等于 `"open-source-practice"`。
2. `resolveLogicalModel` / `resolveLogicalModelCandidates` 的正式路径不变；
   新分支只写在 `resolvePracticeGenerationCandidates` 的练习分支内部。
3. 现有权限项、归一化语义、菜单渲染不变；只追加一个权限 ID 与一处标题映射。
4. 不新建数据表、不改 `rbac_roles` 结构；已有角色的权限数据不批量改写。
5. 不在任何日志或接口响应里向前台普通用户暴露渠道名与上游错误详情
   （后台调用日志增强另案处理）。

## 五、验证

1. 单测：虚拟名请求从练习池取候选并排除正式渠道；有权限且模型在练习池内，
   只命中练习池里支持该模型的渠道；模型不在池内或没有测试权限，返回空数组，不回退随机。
2. 单测：`GET /api/practice/available-models` 两种模式的返回形状。
3. 单测：正式 profile（默认）下 `resolvePracticeGenerationCandidates` 输出与改动前一致。
4. 角色管理界面出现"练习模型测试"勾选项，勾选后对应用户进入练习画布看到真实模型列表，
   未勾选用户只看到三个虚拟名且下拉禁用。
5. 正式画布模型列表、路由、计费行为不变。

## 六、决议

1. 方案已于 2026-11-02 确认，按本文实施。
2. 权限中文名"练习模型测试"，权限 ID `practice-model-test`，已确认。
3. Agnes 渠道不由代码写入。部署到测试环境时在测试环境配置，部署到生产时在生产配置。
   密钥与 Base URL 不进代码库，见 `2026-10-29-practice-canvas.zh-CN.md` §3.5。
