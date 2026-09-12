# 无限练习模块问题记录

> 审查日期：2026 年 9 月 12 日  
> 审查范围：无限练习、老师/学生/学校管理员/平台管理员权限、学校租户边界  
> 审查方式：只读检查源码和已有测试，不修改业务代码  
> 说明：本文件记录的是当前版本已经发现的问题，以及下一次要检查的学校课程、IP 库和学校管理部分。

---

## 1. 先说结论

当前无限练习有两类问题：

1. **有些人本来已经没有权限了，但仍然可以通过另一条地址或接口继续使用。**
2. **管理员已经关闭的功能，页面不让用，但直接请求接口仍然可以用。**
3. **部分输入和结果会被系统悄悄丢掉，用户不容易发现。**
4. **部分数据没有和项目、学校绑定好，可能造成记录挂错地方。**

目前没有发现“普通学生直接读取其他学生剧本”的确定证据。剧本项目、版本、阶段和练习会话大部分查询都带有当前用户 ID，基础的用户之间隔离是存在的。

但是，**权限检查没有在所有入口统一执行**，这是当前最需要重视的问题。

---

## 2. 已经确认的问题

### BUG-01：学校身份被停用后，仍可以从普通画布/短剧入口打开练习项目

**严重程度：高**

#### 证据

无限练习自己的项目接口会检查当前用户是否仍然是学校里的有效老师或学生：

- `web/src/lib/server/practice-project-service.ts:12-37`
- `web/src/lib/server/practice-access-service.ts:6-9`

但普通画布接口只检查登录和项目属于当前用户：

- `web/src/app/api/canvas/projects/[id]/route.ts:9-18`
- `web/src/app/api/canvas/projects/[id]/route.ts:22-33`
- `web/src/lib/server/canvas-project-store.ts:206-222`

普通短剧接口也是同样的情况：

- `web/src/app/api/drama/projects/[id]/route.ts:27-35`
- `web/src/lib/server/drama-project-store.ts:84-95`

无限练习项目创建时会保存：

```text
executionProfile = open-source-practice
```

但普通画布和普通短剧接口没有再次检查这个项目是不是练习项目，也没有再次检查用户的学校身份。

#### 怎么证明这是 Bug

按照产品规则，下面这些用户不能继续使用无限练习：

- 没有学校身份的用户；
- 已被学校停用的老师或学生；
- 学校本身已被停用的用户。

复现步骤：

1. 学生 A 创建一个无限练习画布或短剧项目。
2. 学校管理员停用学生 A，或者删除学生 A 的学校身份。
3. 直接访问 `/practice`，应该被拒绝。
4. 但继续访问原来的 `/canvas/{项目ID}` 或 `/drama/{项目ID}` 地址。
5. 普通项目接口仍然可能找到这个项目并允许读取或修改。

#### 会造成什么错误

- 已经被学校移除的人仍然可以继续修改自己的练习项目。
- 无限练习入口和实际项目权限不一致。
- 如果普通工作台还能继续发起生成，用户可能继续使用学校提供的免费练习资源。

产品依据：

- `docs/superpowers/specs/2026-08-18-infinite-practice-pull-film-design.md:23-31`
- `docs/superpowers/specs/2026-08-18-infinite-practice-pull-film-design.md:248-253`

---

### BUG-02：生成接口可能把请求当成免费练习，但没有先确认用户仍有学校练习权限

**严重程度：高**

#### 证据

生成接口会根据项目保存的档案判断这是正式项目还是无限练习项目：

- `web/src/lib/server/generation-project-context.ts:6-11`
- `web/src/app/api/image-tasks/route.ts:184-200`
- `web/src/app/api/text-tasks/route.ts:60-81`
- `web/src/app/api/audio-tasks/route.ts:61-79`
- `web/src/app/api/video-generation-tasks/video-generation-route.ts:98-113`

它们的核心判断类似：

```ts
const practiceRequest = trustedPractice || projectProfile === "open-source-practice";
const executionProfile = practiceRequest ? "open-source-practice" : "production";
```

而无限练习档案不扣普通积分：

- `web/src/lib/server/generation-execution-policy.ts:24-25`

```ts
open-source-practice => 不扣普通积分
```

项目档案查询只按当前用户 ID 和项目 ID 找项目，没有调用 `requirePracticeAccess()` 检查学校身份：

- `web/src/lib/server/generation-project-context.ts:6-11`
- `web/src/lib/server/canvas-project-store.ts:206-222`
- `web/src/lib/server/drama-project-store.ts:84-95`

#### 为什么这是 Bug

一个人能不能使用无限练习，不应该只由“这个项目以前是不是练习项目”决定，还应该由“这个人现在是否仍然有学校练习资格”决定。

现在的代码更像是：

```text
只要项目以前是无限练习项目，就可能继续按免费练习处理
```

而正确的权限逻辑应该同时检查：

```text
项目是无限练习项目 + 当前用户仍有有效学校身份
```

#### 会造成什么错误

- 被停用的用户可能继续消耗无限练习渠道的算力。
- 免费生成资源可能被没有资格的人继续使用。
- 学校管理员以为已经停用了用户，但实际上没有完全停掉其生成能力。

这里已经可以确定“缺少权限检查”是问题；是否能在当前部署中成功提交到上游，需要下一步用测试账号和本地接口继续验证。

---

### BUG-03：管理员隐藏某个练习模块后，仍然可以直接通过会话接口提交任务

**严重程度：高**

#### 证据

模块页面会检查管理员设置：

- `web/src/app/(user)/practice/[module]/page.tsx:19-23`

如果模块被关闭，页面会返回 404。

但是会话接口只接收用户传入的 `module`，然后直接创建练习会话：

- `web/src/app/api/practice/sessions/route.ts:28-44`
- `web/src/lib/server/practice-session-service.ts:97-114`
- `web/src/lib/server/practice-session-service.ts:391-413`

服务端没有检查：

```ts
settings.practiceModuleVisibility[module] !== false
```

#### 怎么证明这是 Bug

假设管理员关闭 `storyboard-image`：

1. 用户访问 `/practice/storyboard-image`，页面被拒绝。
2. 首页也不再显示这个入口。
3. 用户直接发送 `POST /api/practice/sessions`，把 `module` 写成 `storyboard-image`。
4. 服务端仍可能继续创建和调度任务。

#### 会造成什么错误

- 管理员关闭模块的设置不能真正阻止新任务。
- 页面权限和接口权限不一致。
- 用户可以绕过页面直接使用被关闭的功能。

产品停用规则要求：关闭后不仅要隐藏入口，还要拒绝新的创建、修改、生成和任务提交：

- `docs/incidents/2026-09-07-plugin-market-alignment.zh-CN.md:45-49`

---

### BUG-04：关闭剧本练习后，剧本接口仍然可以使用

**严重程度：高**

#### 证据

剧本页面会检查：

- `web/src/app/(user)/practice/scripts/page.tsx:15-16`

```ts
if (settings.practiceScriptSettings.enabled === false) redirect("/practice");
```

但是以下接口没有检查这个开关：

- `web/src/app/api/practice/scripts/route.ts:29-45`
- `web/src/app/api/practice/scripts/import/route.ts:10-23`
- `web/src/app/api/practice/scripts/[id]/route.ts:13-33`
- `web/src/app/api/practice/scripts/[id]/versions/route.ts:25-53`
- `web/src/app/api/practice/scripts/[id]/stages/route.ts:15-30`
- `web/src/app/api/practice/scripts/[id]/agent/route.ts:11-30`
- `web/src/app/api/practice/scripts/[id]/agent/[operation]/apply/route.ts:11-43`

它们基本只检查：

```ts
requirePracticeAccess(user)
```

没有检查：

```ts
settings.practiceScriptSettings.enabled
```

#### 会造成什么错误

管理员关闭剧本练习后，用户仍可能通过直接请求：

- 创建剧本；
- 导入剧本；
- 保存新版本；
- 生成剧本阶段；
- 使用剧本 Agent；
- 应用 AI 修改。

这属于“页面关了，但后门接口还开着”。

---

### BUG-05：练习会话可以绑定任意项目 ID

**严重程度：中高**

#### 证据

会话接口直接接受客户端传来的项目 ID 和项目类型：

- `web/src/app/api/practice/sessions/route.ts:35-43`

```ts
projectId: body.projectId
projectKind: body.projectKind
```

创建服务直接把它保存下来：

- `web/src/lib/server/practice-session-service.ts:124-146`

数据库中的 `project_id` 只是普通文本，没有外键，也没有自动检查这个项目：

- `web/src/lib/server/database/schema.ts:639-687`

#### 怎么证明这是 Bug

一个有学校练习权限的用户可以提交：

```json
{
  "module": "script",
  "mode": "manual",
  "title": "测试剧本",
  "projectId": "别人的项目ID",
  "projectKind": "canvas",
  "input": {
    "title": "测试",
    "content": "正文"
  },
  "clientRequestId": "unique-request-id"
}
```

当前会话服务不会确认这个项目：

- 是否存在；
- 是否属于当前用户；
- 是否是无限练习项目；
- 类型是否正确；
- 是否属于当前学校。

#### 会造成什么错误

会话记录可能被挂到：

- 其他用户的项目 ID；
- 正式生产项目 ID；
- 不存在的项目 ID；
- 类型不匹配的项目 ID。

这可能污染项目历史、统计、恢复和前端展示。当前没有证据证明它会直接返回别人的项目内容，但它已经破坏了数据归属关系。

---

### BUG-06：删除练习会话不检查当前用户是否仍有练习权限

**严重程度：中**

#### 证据

读取和重试会检查练习权限：

- `web/src/lib/server/practice-session-service.ts:219-220`
- `web/src/lib/server/practice-session-service.ts:237-243`

但是删除接口直接调用删除服务：

- `web/src/app/api/practice/sessions/[id]/route.ts:39-49`
- `web/src/lib/server/practice-session-service.ts:269-274`

删除服务只按：

```text
userId + sessionId
```

查询和删除，没有调用 `requirePracticeAccess()`。

#### 会造成什么错误

如果用户已经被学校停用：

- 访问练习页面可能被拒绝；
- 读取会话可能被拒绝；
- 重试可能被拒绝；
- 但仍可以直接删除自己的练习记录。

这会造成同一个功能的不同操作使用了不同权限规则。

当前没有证据表明它能删除别人的会话，因为数据库删除仍带有当前用户 ID。

---

### BUG-07：分镜图会丢掉第三个角色或道具素材

**严重程度：中**

#### 证据

前端构造分镜图引用时只取前两个素材：

- `web/src/app/(user)/practice/components/practice-storyboard-image-panel.tsx:14-17`

```ts
assetIds.slice(0, 2)
```

界面也只显示两个角色/道具槽位：

- `web/src/app/(user)/practice/components/practice-storyboard-image-panel.tsx:78-90`

```tsx
[0, 1].map(...)
```

但服务端已经支持：

```text
characterPropImage1
characterPropImage2
characterPropImage3
```

- `web/src/lib/server/practice-session-service.ts:622-625`

#### 测试证据

运行练习工作台测试：

```text
pnpm vitest run src/app/(user)/practice/components/practice-module-workbench.test.tsx src/app/(user)/practice/components/practice-home.test.tsx src/app/(user)/practice/page.test.tsx src/app/(user)/practice/scripts/page.test.tsx --reporter=verbose
```

结果：

```text
4 个测试文件
21 个测试通过
1 个测试失败
```

失败测试：

```text
practice-module-workbench.test.tsx
maps storyboard assets to the Demo input slots
```

测试期望有：

```text
characterPropImage3
```

实际没有第三个引用。

#### 会造成什么错误

用户提供第三个角色或道具时：

- 界面没有第三个输入位置；
- 第三份素材不会进入会话；
- 上游工作流收不到第三个主体；
- 生成的分镜图可能缺少关键角色或道具。

这是当前最明确的前端功能回归之一。

---

### BUG-08：音乐练习在设计中存在，但当前入口和模块列表中没有

**严重程度：中，需确认当前版本是否应该上线**

#### 证据

领域类型和部分服务代码支持 `music`：

- `web/src/lib/practice-domain.ts:1-4`
- `web/src/lib/server/practice-module-service.ts:86-109`

但是模块注册表没有把音乐列出来：

- `web/src/lib/server/practice-module-service.ts:8`

前端首页也没有音乐入口：

- `web/src/app/(user)/practice/components/practice-home.tsx:21-28`

设计文件却把音乐制作列为无限练习的一部分：

- `docs/superpowers/specs/2026-08-18-infinite-practice-pull-film-design.md:35-44`

#### 会造成什么错误

- 管理员不能正常配置音乐模块显隐；
- 首页没有音乐入口；
- 模块能力接口不返回音乐；
- 用户不能从正常产品路径进入音乐练习。

如果音乐是当前版本必须提供的功能，这是功能缺失；如果音乐还没有计划上线，则应把它明确标成“未上线”，避免代码和产品文档互相矛盾。

---

### BUG-09：关闭剧本练习后，首页仍显示“剧本”入口

**严重程度：低到中**

#### 证据

首页已经读取了剧本开关：

- `web/src/app/(user)/practice/components/practice-home.tsx:53-55`
- `web/src/app/(user)/practice/components/practice-home.tsx:74-76`

但渲染入口时没有使用 `scriptEnabled`：

- `web/src/app/(user)/practice/components/practice-home.tsx:168-188`

入口始终显示，并且始终可以点击：

```tsx
router.push("/practice/scripts")
```

真正进入剧本页面后才被跳回：

- `web/src/app/(user)/practice/scripts/page.tsx:15-16`

#### 会造成什么错误

管理员关闭剧本练习后：

1. 首页仍显示剧本入口；
2. 用户点击后才被跳转；
3. 用户会认为系统出错或功能没有关闭成功；
4. 已经读取的配置没有真正控制页面显示。

---

### BUG-10：删除会话时，查询和删除使用了两种不同的 ID

**严重程度：低，属于边界输入问题**

#### 证据

删除前查询时会先去掉首尾空格：

- `web/src/lib/server/practice-session-service.ts:269-272`

但真正删除时使用的是原始 ID：

- `web/src/lib/server/practice-session-service.ts:273`

因此当 ID 前后有空格时，可能出现：

1. 查询使用去空格后的 ID，找到会话；
2. 删除使用带空格的原始 ID；
3. 数据库实际删除 0 行；
4. 接口仍返回删除成功。

#### 会造成什么错误

用户看到“删除成功”，刷新页面后记录又出现。

---

## 3. 角色和学校租户检查结果

### 3.1 普通用户

当前普通用户没有学校身份时，不能进入无限练习。

证据：

- `web/src/lib/server/practice-access-service.ts:6-9`
- `web/src/app/(user)/practice/page.tsx:7-15`

这部分目前没有发现明显问题。

### 3.2 学生

学生需要同时满足：

- 学校是启用状态；
- 学生 membership 是启用状态；
- 角色是 `student`。

基础权限测试通过。

但学生被停用后，仍会受到 BUG-01、BUG-02、BUG-06 的影响：专用入口会拒绝，但普通工作台和删除入口没有统一拒绝。

### 3.3 老师

老师可以使用无限练习。

当前没有发现普通老师直接读取其他用户剧本、版本或会话的确定性 IDOR。剧本和会话查询通常都带当前用户 ID。

### 3.4 学校管理员

当前系统没有单独的“学校管理员”全局角色。

学校管理员的实际身份是：

```text
teacher + school.manage
```

证据：

- `web/src/lib/server/school-access-service.ts:37-40`
- `web/src/lib/server/database/school-domain-repository.ts:101-125`

因此学校管理员可以像老师一样使用自己的无限练习。

目前没有发现学校管理员可以通过无限练习接口读取其他学校数据。

但是也没有发现学校管理员可以按学校查看或管理学生的无限练习记录。是否属于 Bug，要看产品是否要求学校管理员管理学生练习。

### 3.5 平台管理员

平台管理员不会只因为 `role = admin` 就自动获得无限练习权限。

平台管理员如果没有 active 学校 membership，会被拒绝进入无限练习。

证据：

- `web/src/lib/server/practice-access-service.ts:6-9`
- `web/src/lib/server/practice-access-service.test.ts:20-31`
- `docs/superpowers/specs/2026-08-18-infinite-practice-pull-film-design.md:248-253`

这符合当前产品设计：平台管理员身份和学校成员身份是两套不同的权限，不能互相替代。

---

## 4. 当前没有确认的跨用户泄露

目前审查到的以下数据查询，基本都限制了当前用户：

- 剧本项目：`owner_user_id`；
- 剧本版本：`owner_user_id`；
- 剧本实体和阶段：`owner_user_id`；
- 练习会话：`user_id`；
- 普通 Canvas/Drama 项目：`user_id`。

相关源码：

- `web/src/lib/server/database/script-practice-repository.ts:45-60`
- `web/src/lib/server/database/script-practice-repository.ts:63-175`
- `web/src/lib/server/database/practice-repository.ts:41-129`
- `web/src/lib/server/practice-session-service.ts:219-235`

因此当前最明确的问题不是“所有人都能读取别人数据”，而是：

1. 权限检查没有覆盖所有入口；
2. 会话和项目之间没有建立完整的归属关系；
3. 功能关闭后，部分 API 仍然可以使用；
4. 部分素材和结果在前端被丢失。

---

## 5. 下一次重点检查：学校课程、IP 库、学校管理

下面是下一次审查的重点。这里先记录检查目标，**不把还没有验证的事情直接写成已确认 Bug**。

### 5.1 用户提出的第一优先问题：导入学生时没有清楚的导入格式

用户已经发现：学校管理员有一个“导入学生”的功能，但目前看不到清楚的表格或导入格式说明。

下一次必须重点检查：

#### 页面方面

- 是否有下载导入模板按钮；
- 页面是否明确说明每一列的名称；
- 是否说明哪些列必填；
- 是否说明姓名、账号、邮箱、学号、角色分别如何填写；
- 是否说明老师和学生是否使用同一个模板；
- 是否说明 CSV、Excel 或其他格式；
- 是否说明中文文件编码；
- 是否说明重复账号怎么处理；
- 是否说明已经存在的学生会被更新还是报错。

#### 接口方面

- 上传的文件是否真的被解析；
- 解析失败时是否告诉用户第几行错误；
- “学生姓名”是否是必填字段；
- 如果只有账号没有姓名，系统是否会把空姓名导入；
- 角色是否可能被用户随意写成管理员；
- 导入时是否会把学生加入错误学校；
- 导入结果是否有成功数、失败数和失败原因。

#### 数据库方面

- 是否有明确的导入记录表；
- 是否能查到谁在什么时候导入了哪些学生；
- 是否保留原始文件、导入批次和错误明细；
- 导入失败后是否会留下半成品成员；
- 同一学生重复导入是否会创建重复 membership。

#### 暂定 Bug 判断标准

如果出现以下任一情况，可以确认是 Bug：

1. 页面提供了“导入学生”，但没有任何可执行的格式说明或模板；
2. 系统要求记录学生姓名，但导入文件没有姓名字段，也没有补充姓名的步骤；
3. 导入失败只提示“导入失败”，不说明哪一行、哪一列有问题；
4. 导入成功后没有批次记录，管理员无法知道本次到底导入了谁；
5. 导入数据可以把学生写入其他学校；
6. 重复导入会创建重复学生 membership；
7. 上传部分成功、部分失败时没有明确结果，导致管理员以为所有人都已导入。

当前结论：**这是下一次必须优先验证的高风险问题，暂不在本文件中直接认定为已确认 Bug。**

---

### 5.2 用户提出的第二优先问题：学校管理员可以删除自己

用户反馈：学校管理员可能可以删除自己的学校管理员身份，而且没有明显提示；如果这是学校唯一管理员，学校可能失去管理入口。

下一次必须重点检查以下操作：

- 学校管理员修改自己的角色；
- 学校管理员停用自己；
- 学校管理员删除自己的 membership；
- 学校管理员删除自己所在的学校；
- 学校唯一管理员删除自己；
- 学校管理员把自己从老师改成学生；
- 学校管理员取消自己的 `school.manage` 权限；
- 删除或降权后，当前登录 Session 是否立即失效；
- 页面是否有明确警告；
- 是否要求确认“这会导致学校失去管理员”；
- 是否保留至少一名可用学校管理员。

#### 暂定 Bug 判断标准

如果出现以下任一情况，可以确认是 Bug：

1. 唯一学校管理员可以无提示删除自己；
2. 删除自己后，学校没有任何可用管理员；
3. 删除操作成功返回，但学校管理页面仍显示旧状态；
4. 删除后仍然可以继续使用学校管理接口；
5. 删除自己不会要求二次确认；
6. 删除最后一个管理员后，学校只能依赖平台管理员手工修复；
7. 删除自己时没有审计记录；
8. 失败或并发情况下，管理员数量检查失效。

已有代码中已经看到一部分保护逻辑：

- `web/src/lib/server/school-tenant-service.ts:67-86`
- `web/src/lib/server/school-tenant-service.ts:89-102`

其中代码试图保证学校至少保留一位可用管理员，但下一次必须用真实接口操作验证：

- 是否拦截“管理员删除自己”；
- 是否只保护删除别人，不保护删除自己；
- 是否同时保护降权、停用和角色修改；
- 页面和接口是否一致；
- 错误提示是否足够让普通管理员理解后果。

当前结论：**用户发现的现象非常严重，下一次将作为学校管理权限审查的第一条真实复现用例。**

---

### 5.3 学校课程权限检查清单

下一次要按角色逐项检查：

| 操作 | 平台管理员 | 学校管理员 | 老师 | 学生 |
|---|---:|---:|---:|---:|
| 查看平台课程 | 应允许 | 仅看分配给本校的 | 仅看有权限的课程 | 仅看自己可见课程 |
| 创建课程 | 应允许 | 不应创建平台课程 | 不应创建平台课程 | 不允许 |
| 修改课程内容 | 应允许 | 仅限本校补充资料 | 仅限负责课程范围 | 不允许 |
| 上传课程资料 | 应允许 | 应允许本校资料 | 按负责课程允许 | 不允许 |
| 删除课程资料 | 应允许 | 仅限本校资料 | 仅限负责范围 | 不允许 |
| 查看其他学校课程 | 应允许 | 不允许 | 不允许 | 不允许 |
| 查看学生提交 | 应允许 | 本校范围 | 自己负责的教学任务 | 只能看自己的提交 |
| 修改学生提交状态 | 应允许 | 按学校职责允许 | 仅限负责任务 | 不允许随意修改 |

重点看：

- URL 中换一个学校 ID、课程 ID、班级 ID 是否能读到别校数据；
- 老师是否能操作不是自己负责的课程；
- 学生是否能看到别的学生提交；
- 学校管理员是否能操作其他学校的课程；
- 学校停用或 membership 停用后，旧页面和旧接口是否仍能操作。

---

### 5.4 IP 库权限检查清单

下一次要检查：

- 平台管理员可以管理哪些 IP 内容；
- 学校管理员能否看到平台未授权给本校的 IP；
- 老师能否使用本校授权的 IP；
- 学生能否使用老师未授权的 IP；
- 一个学校的授权是否会出现在另一个学校；
- IP 被撤销后，旧的练习项目还能不能继续引用；
- IP 子项目、内容文件和素材下载是否分别检查权限；
- 学生是否可以修改、删除或重新授权 IP；
- 导入或批量操作是否会把 IP 绑定到错误学校；
- 练习引用 IP 时，是否记录了使用人、学校和目标项目。

重点验证“看得到”和“用得了”是不是同一套权限：

```text
页面隐藏 ≠ 接口真的禁止
```

---

### 5.5 学校管理权限检查清单

下一次会重点审查：

- 创建学校；
- 停用学校；
- 学校管理员创建和删除成员；
- 学校管理员修改成员角色；
- 学校管理员授予和收回 `school.manage`；
- 删除最后一个管理员；
- 管理员自己退出学校；
- 班级创建、删除、停用；
- 学生加入错误班级；
- 老师被加入错误学校；
- 邀请码跨学校使用；
- 批量导入成员；
- 并发修改成员时是否会覆盖别人刚做的修改；
- 重要操作是否有审计记录；
- 错误提示是否说明真正原因。

---

## 6. 当前验证结果

### 后端和权限相关测试

执行了无限练习相关测试：

```text
18 个测试文件通过
83 个测试通过
5 个测试跳过
```

这些测试证明了：

- 学生和老师的基础练习权限存在；
- 没有学校身份的普通用户会被拒绝；
- 没有学校 membership 的平台管理员不会自动获得练习权限；
- 剧本项目和练习会话的基本用户隔离存在；
- 会话幂等和重试的基础流程存在。

但是，当前测试没有覆盖：

- 停用学校身份后从普通 Canvas/Drama 入口访问；
- 停用用户后继续使用免费生成；
- 关闭模块后直接调用会话 API；
- 关闭剧本后直接调用剧本写入 API；
- 学校管理员删除自己；
- 学生导入格式和导入批次记录。

### 前端工作台测试

执行结果：

```text
4 个测试文件
21 个测试通过
1 个测试失败
```

失败原因是分镜图第三个角色/道具引用丢失，见 BUG-07。

### 类型检查和文件检查

```text
pnpm typecheck   通过
git diff --check  通过
```

---

## 7. 工作区说明

审查期间没有修改业务代码。

当前工作区本来就有很多未提交修改，尤其是：

```text
web/src/app/(user)/practice/scripts/script-practice-workspace.tsx
```

在第 `254-295` 行可以看到两份重复的“阶段生成操作”区域。这个现象来自审查开始前已有的工作区改动，因此本文件只记录为工作区风险，不把它直接当成当前 HEAD 提交中的问题。

---

## 8. 下一步审查顺序

下一次按以下顺序进行：

1. **学校管理员删除自己，以及删除最后一个管理员**；
2. **学生批量导入：姓名字段、模板、格式、错误提示、导入记录和重复数据**；
3. **学校课程：平台管理员、学校管理员、老师、学生的查看和修改范围**；
4. **IP 库：学校授权、老师/学生使用范围、撤销后的旧引用**；
5. **学校管理：成员、班级、邀请码、角色修改和跨学校 ID**；
6. 最后运行接口测试、类型检查和必要的浏览器复现。

每一个问题都必须记录：

- 复现步骤；
- 源码文件和行号；
- 为什么和产品规则冲突；
- 实际会造成什么损失或错误；
- 当前是“已确认 Bug”还是“需要继续验证”。
---

# 9. 2026 年 9 月 12 日追加审查：学校课程、IP 库、学校管理

本次追加审查重点检查：

- 学校管理员、老师、学生的权限；
- 学校课程；
- IP 库；
- 学校成员导入；
- 学校管理员自己删除、自己禁用、自己取消管理员权限；
- 两所学校之间的数据隔离。

本节只记录当前源码已经能够证明的问题。没有实际运行证据的部分会标记为“需要继续验证”。

## 9.1 已确认问题：成员导入没有模板下载、没有清楚的操作说明，也没有导入记录

**严重程度：中高**

### 证据

学校管理页面只有一个“批量导入”按钮：

- `web/src/app/(user)/school/school-administration.tsx:314-326`

点击后只接受 CSV 文件，没有下载模板、查看示例、说明编码或说明字段的按钮。

CSV 解析代码把格式写死为四列：

- `web/src/app/(user)/school/school-csv.ts:5-20`

```text
username,displayName,password,role
```

预览弹窗只显示一句：

- `web/src/app/(user)/school/school-administration.tsx:389-414`

```text
固定列：username、displayName、password、role。此处只预览格式，完整校验在提交时由服务端执行。
```

导入接口接受的也只是一个 `rows` 数组：

- `web/src/app/api/school/members/import/route.ts:9-18`

导入服务直接把 rows 交给账号创建逻辑：

- `web/src/lib/server/school-member-provisioning-service.ts:13-20`

当前没有看到：

- 导入模板下载；
- 导入批次 ID；
- 原始文件名或文件哈希；
- 谁在什么时候导入；
- 每一行的成功/失败原因；
- 导入结果表；
- 导入历史查询；
- 部分成功、部分失败的清晰结果说明。

数据库设计中也没有看到专门的学校成员导入批次表或成员导入错误明细表；当前成员结构只有 `joinSource = import` 这一类来源标记。

### 为什么这是 Bug

产品设计明确要求学校成员支持“批量导入”：

- `docs/superpowers/specs/2026-08-17-school-multitenancy-teaching-design.md:77-90`
- `docs/superpowers/specs/2026-08-17-school-multitenancy-teaching-design.md:110-116`

但现在管理员只能自己猜 CSV 的列名和顺序。系统没有提供一个让管理员可以直接下载、填写、再上传的标准模板。

另外，管理员要求“记录学生名字”，当前字段虽然存在 `displayName`，但系统没有在导入入口清楚地说明：

- 这一列就是学生姓名；
- 是否必填；
- 姓名为空会发生什么；
- 用户名和姓名有什么区别。

服务端最终会把空的 displayName 默认成用户名：

- `web/src/lib/server/school-member-provisioning-service.ts:92-110`
- `web/src/lib/auth/store-user-access.ts:275-295`

这会导致“学生姓名没有记录”时，系统仍可能创建成功，只是把用户名当成显示姓名。

### 会造成什么错误

- 管理员上传错格式，系统才在最后一步报错；
- 学生姓名可能被错误地写成用户名；
- 导入几十或几百人后，管理员无法知道具体哪一行失败；
- 不能追溯是谁导入了哪些学生；
- 发生重复导入或部分失败时，排查非常困难。

### 当前判定

**已确认是管理功能缺陷。**

如果产品要求“导入必须保留导入批次、原文件和逐行结果”，那么它也是数据审计缺陷；这一点应在下一轮产品验收中明确为强制要求。

---

## 9.2 已确认问题：学校管理员可以在页面上直接操作自己的权限和状态，没有后果提示

**严重程度：高**

### 证据

成员操作对所有成员使用同一套按钮：

- `web/src/app/(user)/school/school-administration.tsx:247-265`

其中包括：

- 取消管理；
- 禁用；
- 移出。

这些按钮没有判断：

```text
当前成员是不是当前登录的管理员本人
```

也没有根据“这是最后一个管理员”显示特别警告。

“取消管理”和“禁用”甚至没有弹出确认窗口，直接发请求：

```tsx
onClick={() => void update(member, ...)}
```

只有“移出成员”显示了普通确认弹窗：

- `web/src/app/(user)/school/school-administration.tsx:207-219`

但提示只是普通的“移出后该账号不再属于本校”，没有告诉用户：

- 这是自己；
- 这是学校管理员；
- 这是最后一个管理员时学校会失去管理入口。

### 服务端现状

服务端确实尝试保护最后一个有效管理员：

- `web/src/lib/server/school-tenant-service.ts:67-86`
- `web/src/lib/server/school-tenant-service.ts:89-103`
- `web/src/lib/server/school-tenant-service.ts:236-245`

当目标成员已经拥有 `school.manage`，并且当前有效管理员数量小于等于 1 时，服务端会拒绝：

```text
学校必须保留至少一位可用管理员
```

因此，按照当前已读源码，**“最后一个管理员可以直接删除成功”暂时没有被源码证明**；服务端有拦截条件。

但是，仍然存在确定的问题：

1. 页面允许管理员对自己点击禁用、取消管理和移出；
2. 页面没有任何“这是你自己”或“会导致学校失去管理员”的提示；
3. 前端没有把最后管理员保护状态展示给用户；
4. 服务端没有明确阻止“当前管理员本人主动退出”，只是依赖数量判断；
5. 没有看到“管理员转交后才能退出”的明确流程。

### 为什么这是 Bug

学校管理员是学校管理入口的关键角色。产品设计明确规定学校必须至少保留一位有效管理员：

- `docs/superpowers/specs/2026-08-17-school-multitenancy-teaching-design.md:77-90`
- `docs/superpowers/specs/2026-08-17-school-multitenancy-teaching-design.md:241-249`

即使服务端最终拦截了最后一个管理员，页面也不应该让管理员在没有任何警告的情况下点击一个可能让自己失去权限的操作。

### 会造成什么错误

如果接口保护不完整，可能出现：

- 管理员删除自己；
- 管理员禁用自己；
- 管理员取消自己的 `school.manage`；
- 学校没有任何人可以进入学校管理；
- 学校无法继续管理成员、课程、班级和 IP；
- 只能依赖平台管理员手工修复。

### 当前判定

- **页面层问题：已确认 Bug。**
- **“最后一个管理员一定能删除成功”：当前源码未证明，需要真实接口验证。**
- **“删除后当前登录 Session 是否立即失效”：需要真实浏览器和接口验证。**

下一步必须使用真实测试账号分别测试：

1. 唯一管理员删除自己；
2. 唯一管理员禁用自己；
3. 唯一管理员取消管理权限；
4. 两名管理员时其中一人删除自己；
5. 管理员删除另一个管理员；
6. 操作成功后刷新页面和重新登录。

---

## 9.3 已确认问题：批量导入界面允许预览非法角色，但错误直到提交才出现

**严重程度：中**

### 证据

前端 CSV 解析只检查：

- 列名和顺序；
- CSV 语法；
- 是否有空文件；
- 是否有多余列。

代码位置：

- `web/src/app/(user)/school/school-csv.ts:9-20`

测试还明确写着：

```text
parses the fixed columns without doing semantic role validation
```

- `web/src/app/(user)/school/school-csv.test.ts:5-11`

因此下面这样的文件会进入预览：

```csv
username,displayName,password,role
student_a,张三,password123,校长
```

服务端最后才会拒绝：

- `web/src/lib/server/school-member-provisioning-service.ts:92-110`
- `web/src/lib/auth/store-user-access.ts:275-295`

### 会造成什么错误

- 管理员已经在预览里看到“可以导入”，点击后才失败；
- 错误位置不明确；
- 如果数据量很大，管理员不知道是哪一行角色写错；
- 页面没有逐行错误提示。

### 当前判定

**已确认是用户体验和错误反馈 Bug。**

---

## 9.4 已确认问题：学校成员导入没有记录导入批次和操作审计

**严重程度：中高**

### 证据

导入路由只调用：

- `web/src/app/api/school/members/import/route.ts:15-18`

```ts
importSchoolMembers(user.id, rows)
```

和课程资料、成员操作相比，这个导入接口没有调用 `safeRecordAuditLog()`。

同时，`createOrdinaryUsersForSchool()` 只创建账号和 membership：

- `web/src/lib/auth/store-user-access.ts:156-207`
- `web/src/lib/auth/store-user-access.ts:210-272`

没有导入批次或导入结果记录。

### 会造成什么错误

- 管理员不能追查谁导入了某一批学生；
- 不能查看本次导入失败了哪些行；
- 不能区分单个创建和批量导入之外的具体文件；
- 发生错误时只能从成员当前状态倒推。

### 当前判定

**已确认审计和记录能力缺失。**

---

## 9.5 已发现的课程资料权限风险：普通课程资料读取接口的 SQL 条件过于宽松

**严重程度：高，建议优先真实验证**

### 证据

课程资料读取查询：

- `web/src/lib/server/database/school-domain-repository.ts:562-567`

当前条件大致是：

```text
课程分配有效
课程已发布
当前用户是有效学校成员
并且满足以下之一：
  1. 当前用户是学校管理员
  2. 当前用户是该课程负责老师
  3. 当前用户属于该课程安排的班级
```

其中“当前用户是学校成员”的连接条件是：

```sql
membership.school_id = assignment.school_id
AND membership.user_id = $1
AND membership.status = 'active'
```

但这个条件没有检查：

- `membership.role` 是否为老师或学生；
- 学校本身是否为 active；
- 课程安排的班级是否 active；
- 当前学生是否仍然属于该班级；
- 学校课程分配是否仍然对应当前有效教学安排。

后面的 `LEFT JOIN` 也没有把学生必须处于当前有效班级作为统一前置条件。

### 为什么需要验证

这个查询可能让某些仍然是 active membership、但已经不再属于当前课程班级的学生继续读取资料。

不过，页面正常读取课程树时会使用更严格的 `hasVisibleCourseAssignment()` 条件，所以是否能够通过真实媒体 URL 直接读到资料，要结合完整请求链验证。

### 当前判定

**授权 SQL 存在明显风险，先列为待运行验证，不直接定性为已经成功的数据泄露。**

---

## 9.6 已确认问题：课程资料修改/删除使用了没有学校条件的底层更新和删除

**严重程度：高，待结合路由调用方式验证跨学校影响**

### 证据

课程资料更新和删除 service 先按当前用户判断资料属于哪个学校：

- `web/src/lib/server/school-course-service.ts:217-260`

但是底层 repository 的更新和删除只按资料 ID：

- `web/src/lib/server/database/school-domain-repository.ts:490-500`

```sql
UPDATE course_materials SET ... WHERE id = $1
```

以及：

```sql
DELETE FROM course_materials WHERE id = $1
```

当前流程虽然先调用 `assertSchoolMaterialManager()`，通常会阻止越权用户进入后续步骤，但数据库层没有保留学校条件。

### 为什么这是问题

这是一个“先检查、后写入”的权限结构。如果未来任意调用者绕过 service、或者两个请求之间资料归属发生变化，底层写入不会再次确认学校。

对于学校租户数据，更新和删除应该至少带上：

```text
school_id + material_id
```

或者通过课程分配关系在 SQL 内强制校验。

### 当前判定

**底层租户保护不完整，建议作为高风险代码问题记录；是否形成可直接跨学校修改，需要进一步运行验证。**

---

## 9.7 课程和教学部分目前没有发现的内容

当前源码中以下部分的权限链相对清楚：

- 学校管理员查看本校课程，使用 `requireSchoolManager()`；
- 学生和普通老师查看课程，使用 `requireActiveSchoolContext()` 加课程/班级关系；
- 老师创建教学任务前，会检查课程安排负责人、课程状态、班级状态；
- 学生提交作业前，会检查学生身份、班级关系和教学任务状态；
- 老师批改提交前，会检查负责老师关系和学生当前仍属于班级；
- 学校 ID 和 membership ID 普遍出现在查询条件中。

对应位置：

- `web/src/lib/server/school-course-service.ts:101-109`
- `web/src/lib/server/school-course-service.ts:392-427`
- `web/src/lib/server/school-course-service.ts:436-450`
- `web/src/lib/server/school-course-service.ts:513-568`
- `web/src/lib/server/database/school-domain-repository.ts:255-277`
- `web/src/lib/server/database/school-domain-repository.ts:616-628`

---

## 9.8 IP 库检查结果：用户侧基础可见性隔离目前较完整

### 证据

公共 IP 和本校 IP 入口会区分 scope：

- `web/src/lib/server/ip-library-service.ts:15-20`

读取具体 IP 时会先检查用户账号是否有效，再检查：

- IP 是否启用；
- 当前用户是否有 active school context（学校 IP）；
- IP、子 IP 和内容项是否属于当前可见范围。

代码位置：

- `web/src/lib/server/ip-library-access-service.ts:13-35`

学校管理员查看本校授权列表时，使用当前学校 ID：

- `web/src/lib/server/school-ip-library-service.ts:35-38`

数据库 IP grant 查询也使用学校 ID 和生效时间。

### 当前没有发现的内容

- 暂未发现普通学生可以通过 `ipId` 直接读到另一个学校的 IP；
- 暂未发现学生可以修改平台 IP；
- 暂未发现学校管理员可以上传或修改平台 IP；
- 暂未发现跨学校授权记录可以直接混在用户查询中。

---

## 9.9 IP 库待重点验证问题：用户侧“查看本校 IP”与学校管理员“管理本校 IP”边界需要真实复现

当前学校管理员页面只提供查看授权状态：

- `web/src/app/(user)/school/components/school-ip-access-panel.tsx:35-84`

没有看到学校管理员在该页面执行“开放/关闭本校 IP”的按钮。

IP 设计要求学校管理员可以：

```text
向本校成员开放 / 关闭
```

如果这个开关没有被实现，则属于功能缺失；如果开关在其它页面或后端已有但当前页面没有显示，需要继续追踪入口。

当前结论：**待继续验证，不能仅凭本页面认定功能不存在。**

---

## 9.10 IP 库风险：使用记录允许客户端自定义目标 ID，当前没有检查目标属于当前用户或当前学校

### 证据

IP 使用记录接口允许客户端传入：

```ts
targetType
targetId
```

- `web/src/lib/server/ip-library-service.ts:13-53`

服务端只检查 targetType 是以下几种：

```text
canvas / drama / practice / download
```

以及 targetId 不是空字符串：

- `web/src/lib/server/ip-library-service.ts:105-116`

没有检查：

- targetId 对应的项目是否存在；
- 项目是否属于当前用户；
- 项目是否属于练习项目；
- targetType 和真实项目类型是否匹配；
- 下载目标是否真的执行了下载。

### 会造成什么错误

- 用户可以把 IP 使用记录写到别人项目 ID 上；
- 使用记录可能被伪造；
- 管理员看到的 IP 使用统计不可信；
- 未来如果按使用记录做版权或授权统计，会出现错误数据。

### 当前判定

**已确认记录归属校验缺失，实际是否能造成跨学校数据泄露需要继续验证。**

---

## 9.11 当前测试情况

这一轮尚未完成全量学校模块测试，原因是工作区已有较多未提交修改，且当前任务要求只做审查、不修改业务代码。

下一步应运行以下范围：

```text
school-csv.test.ts
school-member-provisioning-service.test.ts
school-tenant-service.test.ts
school-domain-file-repository.test.ts
school-course-service.test.ts
school-ip-library-service.test.ts
school-content-reference-service.test.ts
school 目录下所有 API route.test.ts
```

还必须补充真实复现：

1. 唯一学校管理员删除自己；
2. 唯一学校管理员禁用自己；
3. 唯一学校管理员取消自己的 `school.manage`；
4. 两名管理员时其中一人删除自己；
5. 上传错误格式和缺少姓名的学生 CSV；
6. 导入重复账号；
7. 学生访问不属于自己班级的课程资料；
8. 学校 A 用户读取学校 B 的 IP；
9. IP 授权撤销后继续访问旧 URL；
10. 学校管理员是否能执行 IP 的“开放/关闭”。

---

## 9.12 追加审查阶段性结论

当前最重要的确定问题如下：

1. **学生导入功能没有模板下载、没有导入批次和逐行结果，也没有导入审计记录。**
2. **管理员可以在页面直接操作自己的管理员权限、禁用状态和移出操作，页面没有任何后果提示。**
3. **管理员关闭成员管理操作时，前端没有显示“这是你自己”或“这是最后一个管理员”的明确警告。**
4. **非法角色只能在提交后才发现，导入预览阶段没有逐行校验。**
5. **课程资料底层更新/删除 SQL 没有学校条件，租户保护主要依赖 service 层。**
6. **IP 使用记录接受客户端自定义的目标 ID，没有验证目标项目属于当前用户或当前学校。**

当前还没有证据证明：

- 唯一学校管理员在真实接口中一定能删除成功；
- 学生一定可以通过课程资料 URL 读取不属于自己课程的资料；
- 学校 A 一定可以读取学校 B 的 IP 内容。

这些需要下一步用真实测试账号和接口逐项复现。
---

# 10. 追加审查补充结论（2026 年 9 月 12 日）

本次实际运行了学校相关的 15 个测试文件：

```text
15 个测试文件通过
71 个测试通过
```

这说明当前已有测试覆盖了不少正常流程，但还没有覆盖下面这些关键风险：

- 管理员本人删除自己；
- 管理员本人禁用自己；
- 管理员本人取消自己的管理权限；
- 班级停用后继续上传、修改、删除课程资料；
- IP 包只授权部分子 IP 时的包级封面访问；
- 公共 IP 下载的学校归属记录；
- IP 使用记录中的目标 ID 是否属于当前用户；
- 学校管理员是否能开放或关闭本校 IP；
- 导入批次和逐行失败记录。

## 10.1 最重要的新确认：学校管理员可以删除自己、禁用自己、取消自己的管理员权限

**严重程度：高**

这一点已经可以由源码直接确认，不只是怀疑。

### 删除自己

成员列表对所有成员都显示“移出”按钮，没有排除当前登录管理员本人：

- `web/src/app/(user)/school/school-administration.tsx:247-264`

删除接口只接收目标 membership ID：

- `web/src/app/api/school/members/[id]/route.ts:21-29`

删除服务只检查“目标成员是不是最后一位可用管理员”：

- `web/src/lib/server/school-tenant-service.ts:89-103`

它没有检查：

```text
目标 membership 的 userId 是否等于当前登录的 managerId
```

因此，只要学校还有第二位可用管理员，管理员 A 就可以删除自己的 membership。

### 禁用自己

前端对所有成员直接显示“禁用/启用”：

- `web/src/app/(user)/school/school-administration.tsx:259-260`

点击后直接提交：

```json
{"status":"disabled"}
```

后端只保护最后一个管理员，没有禁止管理员修改自己的状态：

- `web/src/lib/server/school-tenant-service.ts:67-86`

### 取消自己的管理员权限

前端对所有老师直接显示“取消管理”：

- `web/src/app/(user)/school/school-administration.tsx:249-258`

点击后直接提交：

```json
{"permissions":[]}
```

后端仍然只检查学校是否还剩另一名管理员，不检查“操作者是不是正在修改自己”。

### 影响

管理员可能在没有专门警告的情况下：

- 把自己变成普通老师；
- 禁用自己的学校账号；
- 从学校移除自己；
- 立即失去学校管理入口；
- 无法继续管理课程、成员、班级和 IP。

如果这是学校唯一管理员，当前后端的数量检查会尝试阻止操作；但页面没有把风险告诉用户，也没有“先转交管理员权限再退出”的安全流程。

**判定：**

- 自删路径：**确定 Bug**；存在第二位管理员时可通过；
- 自禁用路径：**确定 Bug**；存在第二位管理员时可通过；
- 自取消管理员权限：**确定 Bug**；存在第二位管理员时可通过；
- 最后一个管理员被删除：当前代码有保护，仍建议用真实接口再复现一次。

## 10.2 学生导入：姓名字段存在，但系统会把空姓名悄悄替换成用户名

**严重程度：中高**

当前导入格式并不是完全没有说明，页面会显示：

- `web/src/app/(user)/school/school-administration.tsx:389-414`

```text
username、displayName、password、role
```

但存在两个确定问题。

### 问题一：没有模板、示例和完整填写说明

页面没有：

- 下载模板；
- 示例 CSV；
- 说明 `role` 必须填写英文 `teacher` 或 `student`；
- 说明姓名字段是否必填；
- 说明密码要求；
- 说明编码和重复账号处理方式。

### 问题二：姓名为空时不会阻止导入

前端只检查 CSV 列名和语法：

- `web/src/app/(user)/school/school-csv.ts:9-20`

例如下面内容可以通过前端预览：

```csv
username,displayName,password,role
student001,,password123,student
```

服务端又会把空的 `displayName` 替换为用户名：

- `web/src/lib/server/school-member-provisioning-service.ts:92-110`
- `web/src/lib/auth/store-user-access.ts:275-295`

```ts
displayName: requiredText(row.displayName || username, "显示名称", 80)
```

所以导入结果可能是：

```text
用户名：student001
学生姓名：student001
```

而不是提示管理员“第 1 行缺少学生姓名”。

### 影响

- 学生姓名记录不可靠；
- 班级、课程、作业和批改页面可能显示用户名而不是真实姓名；
- 管理员很难发现导入数据质量有问题；
- 系统没有按行告诉管理员哪些学生资料错误。

**判定：**

这是确定的数据质量 Bug；“没有任何格式说明”不准确，当前确实有四个固定列名说明，但说明远远不够管理人员直接正确使用。

## 10.3 成员导入没有批次记录或导入审计

**严重程度：中高**

导入路由只调用：

- `web/src/app/api/school/members/import/route.ts:9-18`

```ts
importSchoolMembers(user.id, rows)
```

导入服务只创建用户和 membership：

- `web/src/lib/server/school-member-provisioning-service.ts:13-20`
- `web/src/lib/auth/store-user-access.ts:156-207`

没有看到：

- 导入批次表；
- 原始文件名；
- 导入人；
- 导入时间；
- 每行成功/失败结果；
- 失败原因；
- 导入历史查询。

同时，成员导入接口没有像课程资料接口一样调用 `safeRecordAuditLog()`。

这会导致管理员无法回答：

```text
这批学生是谁导入的？
哪一行失败了？
哪些账号已经成功创建？
```

**判定：已确认审计和记录能力缺失。**

## 10.4 新确认课程 Bug：班级停用后，负责老师仍可上传、修改、删除本校课程资料

**严重程度：高**

学校老师上传本校资料的服务：

- `web/src/lib/server/school-course-service.ts:204-214`

判断负责老师时调用：

- `web/src/lib/server/database/school-domain-repository.ts:570-582`
- `web/src/lib/server/school-domain-file-repository.ts:602-610`
- `web/src/lib/server/school-domain-file-repository.ts:632-634`

这些判断会检查：

- 课程安排 active；
- 学校课程分配 active；
- 平台课程 published；
- 老师是负责老师。

但是没有检查：

```text
对应班级 status 是否仍为 active
```

因此可以出现：

1. 课程安排仍然 active；
2. 老师 T 仍然是该课程负责老师；
3. 班级 C 被停用；
4. 老师 T 仍然可以上传本校资料；
5. 老师 T 仍然可以修改或删除已有本校资料。

修改和删除路径：

- `web/src/lib/server/school-course-service.ts:217-240`
- `web/src/lib/server/school-course-service.ts:243-259`

这和创建教学任务、提交作业时的严格班级停用检查不一致。

**判定：确定 Bug。**

## 10.5 课程停用状态读取规则不统一，待确认

课程列表、课程树和教学任务读取主要检查课程、分配和课程安排状态，但部分查询没有检查班级是否 active：

- `web/src/lib/server/database/school-domain-repository.ts:264-277`
- `web/src/lib/server/database/school-domain-repository.ts:616-628`
- `web/src/lib/server/school-course-service.ts:101-109`
- `web/src/lib/server/school-course-service.ts:436-449`

而提交作业和教师批改会检查班级状态：

- `web/src/lib/server/school-course-service.ts:517-521`
- `web/src/lib/server/school-course-service.ts:579-593`

所以班级停用后可能出现：

- 仍然可以看课程；
- 仍然可以看教学任务；
- 但不能提交或批改。

这是否是 Bug 取决于产品规则：

- 如果停用班级后应该完全不能看，当前是读取权限问题；
- 如果允许历史内容只读，当前行为可能合理，但页面应该明确显示“只读”。

**判定：待产品确认。**

## 10.6 新确认课程 Bug：课程资料底层更新和删除没有带学校条件

**严重程度：高，建议真实验证**

学校资料 service 会先检查当前学校是否拥有该资料：

- `web/src/lib/server/school-course-service.ts:217-231`
- `web/src/lib/server/school-course-service.ts:243-256`

但是底层数据库更新和删除只按材料 ID：

- `web/src/lib/server/database/school-domain-repository.ts:490-500`

```sql
UPDATE course_materials ... WHERE id = $1
DELETE FROM course_materials WHERE id = $1
```

没有把：

```text
school_id / school_course_assignment_id
```

放进最终更新条件。

当前 service 先做了权限判断，所以还不能直接断言学生可以跨学校修改资料；但这是租户安全设计不完整，建议下一步使用两个学校、同一资料 ID 的真实接口回归。

## 10.7 IP 库新确认问题：部分授权子 IP 时，包级封面可能暴露未授权子 IP内容

**严重程度：中高**

学校 IP 查询会按学校授权和时间筛选可见子 IP：

- `web/src/lib/server/database/ip-library-repository.ts:488-500`

但是包级封面仍然使用整个 IP 的 `cover_file_id`：

- `web/src/lib/server/database/ip-library-repository.ts:484-487`
- `web/src/lib/server/ip-library-download-service.ts:51-56`
- `web/src/lib/server/database/ip-library-repository.ts:228-230`

没有检查这个包级封面是否属于当前学校已经授权的子 IP。

复现思路：

1. IP 有两个子 IP A、B；
2. 学校只被授权 B；
3. 平台把 A 的图片设置成整个 IP 的包级封面；
4. 学校用户访问 `/api/ip-library/{ipId}/cover`；
5. 可能看到 A 的封面。

**判定：已确认授权边界缺口；是否实际形成内容泄露，建议用本地两子 IP fixture 运行确认。**

## 10.8 IP 库新确认问题：公共 IP 下载记录没有学校归属

**严重程度：中**

公共 IP 的访问上下文不会填充学校 ID：

- `web/src/lib/server/ip-library-access-service.ts:18-29`

下载记录直接使用这个 schoolId：

- `web/src/lib/server/ip-library-download-service.ts:22-31`
- `web/src/lib/server/ip-library-download-service.ts:40-45`

所以一个属于学校 A 的用户下载公共 IP 时，下载记录中的学校字段可能为空。

这会造成：

- 学校维度下载统计不完整；
- 无法知道某次公共 IP 下载来自哪所学校；
- 后续做授权审计、学校使用统计时数据不完整。

**判定：已确认审计数据 Bug。**

## 10.9 IP 库新确认问题：IP 使用记录的 targetId 可以伪造

IP 使用记录只检查：

- IP 是否可见；
- 内容项是否属于当前子 IP；
- targetType 是否是允许的枚举；
- targetId 是否非空。

代码：

- `web/src/lib/server/ip-library-service.ts:33-53`
- `web/src/lib/server/ip-library-service.ts:105-116`

没有检查 targetId 对应的 Canvas、短剧或无限练习是否：

- 真实存在；
- 属于当前用户；
- 属于当前学校；
- 与 targetType 匹配。

用户可以把使用记录写到别人的项目 ID 上，虽然目前没有证据证明能直接读取别人的项目。

**判定：已确认审计完整性 Bug，不等于已确认数据读取 IDOR。**

## 10.10 IP 库当前没有发现的部分

当前基本可确认：

- 学生和普通老师不能调用学校授权管理接口；
- 学校管理员只能查看本校授权列表；
- IP 详情和内容项读取会检查学校授权、有效时间和子 IP；
- 其他学校的 IP 不会因为用户只知道 IP ID 就自动显示。

相关代码：

- `web/src/lib/server/school-ip-library-service.ts:35-38`
- `web/src/lib/server/ip-library-access-service.ts:18-35`
- `web/src/lib/server/ip-library-service.ts:15-24`

---

# 11. 本轮实际验证

执行了学校相关的窄范围测试：

```text
pnpm vitest run --no-file-parallelism --reporter=dot \
  school-csv.test.ts \
  school-administration.test.tsx \
  members/import/route.test.ts \
  members/route.test.ts \
  classes/route.test.ts \
  classes/[id]/route.test.ts \
  courses/route.test.ts \
  courses/[id]/offerings/route.test.ts \
  ip-library/route.test.ts \
  school-member-provisioning-service.test.ts \
  school-tenant-service.test.ts \
  school-course-service.test.ts \
  school-ip-library-service.test.ts \
  ip-library-download-service.test.ts \
  school-content-reference-service.test.ts
```

结果：

```text
15 个测试文件通过
71 个测试通过
```

注意：这些测试通过只能证明现有测试覆盖的行为是稳定的，不能证明没有遗漏 Bug。当前测试没有覆盖：

- 管理员自删、自禁用、自降权；
- 导入批次、导入审计和逐行错误；
- 班级停用后资料写操作；
- 部分子 IP 授权时包级封面；
- 公共 IP 下载的学校归属；
- targetId 伪造；
- 撤销授权后的已签发对象存储 URL。

---

# 12. 本轮结论汇总

| 编号 | 模块 | 问题 | 结论 |
|---|---|---|---|
| SCHOOL-01 | 学校管理 | 管理员可以删除自己（有其他管理员时） | 已确认 Bug |
| SCHOOL-02 | 学校管理 | 管理员可以禁用自己 | 已确认 Bug |
| SCHOOL-03 | 学校管理 | 管理员可以取消自己的管理权限 | 已确认 Bug |
| SCHOOL-04 | 学校管理 | 删除/禁用/降权没有自我风险提示 | 已确认 Bug |
| SCHOOL-05 | 学校管理 | 成员导入没有模板、示例、批次和审计记录 | 已确认 Bug |
| SCHOOL-06 | 学校管理 | 空学生姓名会静默变成用户名 | 已确认 Bug |
| SCHOOL-07 | 学校管理 | 非法角色到提交时才报错，预览无逐行错误 | 已确认 Bug |
| COURSE-01 | 学校课程 | 班级停用后，负责老师仍能上传/改/删本校资料 | 已确认 Bug |
| COURSE-02 | 学校课程 | 停用班级后的读取边界不统一 | 待产品确认 |
| COURSE-03 | 学校课程 | 课程资料更新/删除底层 SQL 没有学校条件 | 高风险，待真实验证 |
| IP-01 | IP 库 | 部分子 IP 授权时包级封面可能暴露未授权子 IP | 高风险，待 fixture 验证 |
| IP-02 | IP 库 | 公共 IP 下载记录缺少学校归属 | 已确认 Bug |
| IP-03 | IP 库 | IP 使用 targetId 可伪造，审计记录不可信 | 已确认 Bug |
| IP-04 | IP 库 | 撤销授权后已签发 URL 是否仍可访问 | 待真实验证 |
| IP-05 | IP 库 | 学校管理员是否能开放/关闭本校 IP | 待产品确认 |

---

# 13. 下一步真实复现顺序

1. 创建两个学校、每校两名管理员，实际调用 DELETE/PATCH 成员接口验证自删、自禁用、自降权。
2. 创建学生导入 CSV：
   - 空姓名；
   - 中文角色；
   - 重复用户名；
   - 第二行错误；
   - 其中一行成功、另一行失败。
3. 创建学校 A/B、同一平台课程、班级和负责老师，停用班级后验证课程资料上传/修改/删除。
4. 创建两个子 IP，只授权其中一个学校和其中一个子 IP，验证包级封面是否泄露。
5. 下载公共 IP，检查下载记录的 schoolId。
6. 伪造其他项目的 targetId，检查使用记录是否仍能创建。
7. 撤销 IP 授权后重新访问已生成的对象存储 URL。

所有真实复现结果继续追加到本文件，不修改业务代码。