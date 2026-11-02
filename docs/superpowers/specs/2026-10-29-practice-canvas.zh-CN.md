# 无限练习：无限画布模块

- 日期：2026-10-29
- 状态：已确认并实施（2026-11-02 用户确认，随测试权限一并落地）

## 背景

无限练习首页已有"无限画布"练习项目卡片（`PRACTICE_PROJECT_CARDS[0]`），后端路由、
`canvas_projects.execution_profile` 字段、`listPracticeProjects` / `createPracticeProject`
API 均已到位，但点击「新建」后会跳转到正式画布编辑器（`/canvas/[id]`）。正式画布使用全部
付费模型，计费入口相同，与"免费练习"定位不符。

本文目标：完成无限练习画布模块，让用户在 `/practice/canvas/[id]` 内进行**完全免费**的画布
练习，模型下拉按类型显示专用模型名（图片 `gamaimage`、视频 `gamavideo`、文本 `gamatext`，
内部路由到 `purpose='open-source-practice'` 的渠道，具体上游模型对用户不可见），生成结果
节点显示"免费"标签。测试阶段绑定 Agnes 模型。

## 一、现有基础（不用改）

| 功能 | 位置 | 说明 |
|---|---|---|
| 数据存储 | `canvas_projects.execution_profile` | 已支持 `'open-source-practice'` |
| 模型路由 | `logical-model-router.ts:46` | `resolvePracticeModelAccess` 按 `purpose` 过滤 |
| 项目 API | `/api/practice/projects` | GET/POST 均已实现 |
| 计费 | `resolveSchoolComputeBillingContext` | 已按 `executionProfile` 区分 |
| 权限 | `requireCurrentPracticeAccess` | 已对 canvas 项目校验学校练习权限 |

## 二、问题所在（需要改）

### 2.1 入口：跳转地址错误

`practice-home.tsx:46`：
```ts
export function practiceProjectPath(kind, id) {
    return `/${kind}/${encodeURIComponent(id)}`; // 返回 /canvas/[id]
}
```
应改为 `/practice/canvas/[id]`。

### 2.2 页面：缺少 `/practice/canvas/[id]` 路由

画布编辑器只有 `/canvas/[id]`，它直接读正式 `canvas_projects`（不按
`execution_profile` 过滤），使用全量模型，不显示练习标识。

### 2.3 前端模型选择：正式画布暴露全部逻辑模型

配置面板模型下拉从全局设置读取，与 `execution_profile` 无关。练习画布需要：
- **按类型显示专用模型选项**：
  - 图片模型下拉只显示：`{ id: "gamaimage", name: "gamaimage" }`
  - 视频模型下拉只显示：`{ id: "gamavideo", name: "gamavideo" }`
  - 文本模型下拉只显示：`{ id: "gamatext", name: "gamatext" }`
- 具体路由到哪个上游模型由后端决定，前端无感知

### 2.4 生成结果：无"免费"标签

## 三、改动范围

### 3.1 修改：入口路径

**文件**：`web/src/app/(user)/practice/components/practice-home.tsx`

`practiceProjectPath` 对 `canvas` 返回 `/practice/canvas/[id]`，对 `drama` 保持原样。

```ts
export function practiceProjectPath(kind: PracticeProjectKind, id: string) {
    return kind === "canvas" ? `/practice/canvas/${encodeURIComponent(id)}` : `/${kind}/${encodeURIComponent(id)}`;
}
```

### 3.2 新建：`/practice/canvas/[id]` 编辑器页面

**文件**：`web/src/app/(user)/practice/canvas/[id]/page.tsx`（Server Component）

职责：
1. 读取 `canvas_projects` 并验证 `execution_profile === 'open-source-practice'`（复用
   `getCanvasProjectForUser`）；不符合则 404。
2. 将 `executionProfile="open-source-practice"` 传给编辑器。

**文件**：`web/src/app/(user)/practice/canvas/[id]/practice-canvas-client-page.tsx`（Client Component）

直接引用现有 `VozebProCanvasPage` 的所有 UI 组件，传入 `executionProfile` prop：

```ts
<VozebProCanvasPage
    executionProfile="open-source-practice"
/>
```

模型名称由编辑器内部根据模型类型自动使用 `gamaimage`、`gamavideo`、`gamatext`。

### 3.3 修改：画布编辑器接受 `executionProfile` prop

**文件**：`web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

- `VozebProCanvasPage` 接受可选 prop `executionProfile`。
- 把 `executionProfile` 透传给：
  - `useCanvasPageController`（通过 state 进入生成动作）
  - 配置面板的模型列表筛选逻辑（见 3.4）

### 3.4 修改：配置面板模型下拉——练习模式显示专用模型名

**文件**：`web/src/app/(user)/canvas/[id]/canvas-config-node-panel.tsx`（或对应的模型选择组件）

当 `executionProfile === "open-source-practice"` 时：
- 图片模型下拉只显示：`{ id: "gamaimage", name: "gamaimage" }`
- 视频模型下拉只显示：`{ id: "gamavideo", name: "gamavideo" }`
- 文本模型下拉只显示：`{ id: "gamatext", name: "gamatext" }`
- 下拉禁止切换（`disabled` 或只读）
- 内部 `effectiveConfig.imageModel / videoModel / textModel` 分别写入对应的模型 ID

### 3.5 修改：实现随机渠道选择（公共池子）

**架构差异**（重要）：

| 维度 | 正式生产 | 无限练习 |
|------|---------|---------|
| **用户看到的模型** | 具体逻辑模型列表（如 gpt-5-mini） | 三个固定名称：gamaimage / gamavideo / gamatext |
| **后端路由策略** | 按权重**轮询**多个渠道 | **随机选择**公共池子里的渠道（`Math.random()`） |
| **渠道来源** | 模型专属配置 | 从正式渠道中挑选便宜/免费的，标记 `purpose='open-source-practice'` |

**实现位置**：`web/src/lib/server/logical-model-router.ts`

在 `resolveLogicalModel()` 中检测到 `gamaimage` / `gamavideo` / `gamatext` 时：

```typescript
if (['gamaimage', 'gamavideo', 'gamatext'].includes(logicalModelId)) {
    // 1. 查询所有标记了 purpose='open-source-practice' 的渠道
    const practiceChannels = await getChannelsForPracticeModel(
        logicalModelId, 
        'open-source-practice'
    );
    
    if (practiceChannels.length === 0) {
        throw new Error(`No practice channels available for ${logicalModelId}`);
    }
    
    // 2. 🎲 真随机选择（不是轮询！）
    const randomIndex = Math.floor(Math.random() * practiceChannels.length);
    const selectedChannel = practiceChannels[randomIndex];
    
    // 3. 返回选中渠道的实际上游模型配置
    return selectedChannel;
}
```

**后台配置**（管理员操作，不是代码）：

1. 在现有逻辑模型（如 `agnes-image-2.5-flash`）的渠道配置中：
   - 新建或编辑渠道
   - 设置 `purpose = 'open-source-practice'`
   - 测试阶段使用 Agnes API：
     - 图片：`agnes-image-2.5-flash`
     - 视频：`agnes-video-2.5-flash`
     - 文本：`agnes-3.0-flash`
   - API Key 与 Base URL 不写入代码库，部署时在对应环境的后台渠道配置里填写。

2. **不需要创建新的逻辑模型**。`gamaimage` 等是前端显示的虚拟名称，后端直接解析到公共池子里的实际渠道。

3. 公共池子里可以包含多个不同的上游模型（只要都是 `purpose='open-source-practice'`），系统会随机选一个。

### 3.6 修改：顶栏显示练习徽章

**文件**：`web/src/app/(user)/canvas/[id]/components/canvas-top-bar.tsx`

当 `executionProfile === "open-source-practice"` 时，标题左侧显示
`<Badge color="cyan">🎓 练习模式</Badge>`。

### 3.7 修改：生成结果节点显示"免费"标签

**文件**：`web/src/app/(user)/canvas/components/canvas-node-content.tsx`（或 canvas-node-hover-toolbar.tsx）

当节点所在画布的 `executionProfile === "open-source-practice"` 时，节点右上角
内容角标显示"免费"文字（小号灰色/绿色文本，不影响节点尺寸）。

实现：通过 zustand store 或 context 把 `executionProfile` 传到节点组件。

## 四、不改什么

- 不新建数据库表，不改 API 路径，不改计费逻辑（已正确）。
- `/canvas/[id]` 正式画布路由**不改**，练习和正式完全独立。
- 其他练习模块（角色/场景/剧本）不受影响。
- 不向用户暴露渠道名、上游模型 ID 或任何后台配置。

## 五、数据流梳理

```
用户点「新建」
  → POST /api/practice/projects { kind: "canvas" }
  → createPracticeProject → createCanvasProject(execution_profile='open-source-practice')
  → 跳转 /practice/canvas/[id]              ← 练习专属路由
  → page.tsx 读 canvas_project，校验 execution_profile
  → PracticeCanvasClientPage（executionProfile="open-source-practice"）
  → 模型下拉只显示"伽马画布"
  → 用户生成 → 请求带 execution_profile='open-source-practice'
  → 后端 resolveLogicalModel(... "open-source-practice") → 只用 purpose='open-source-practice' 渠道
  → 计费 = 0（已有逻辑）
  → 结果节点右上角显示"免费"
```

## 六、文件清单

### 新建（2 个）

| 文件 | 说明 |
|---|---|
| `web/src/app/(user)/practice/canvas/[id]/page.tsx` | 服务端：读 canvas_project，校验 execution_profile |
| `web/src/app/(user)/practice/canvas/[id]/practice-canvas-client-page.tsx` | 客户端：包装正式编辑器，传入 executionProfile |

### 修改（4 个）

| 文件 | 改动 |
|---|---|
| `web/src/app/(user)/practice/components/practice-home.tsx` | `practiceProjectPath` 对 canvas 返回 `/practice/canvas/[id]` |
| `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx` | 接受 `executionProfile` prop，向下传递 |
| 配置面板模型选择组件（待定位具体文件） | 练习模式下按类型显示 gamaimage/gamavideo/gamatext |
| 节点渲染组件（待定位具体文件） | 练习模式下结果节点显示"免费"标签 |

## 七、验证

1. **单测**：`practiceProjectPath("canvas", "id")` 返回 `/practice/canvas/id`；`("drama", "id")` 返回 `/drama/id`。
2. **测试环境功能测试**：
   - 无限练习首页点「+ 新建」→ 跳转 `/practice/canvas/[id]` ✓
   - 顶栏显示"🎓 练习模式" ✓
   - 模型下拉只有 gamaimage / gamavideo / gamatext，不可切换 ✓
     （持有"练习模型测试"权限的用户例外，见 2026-11-02 规格）
   - 生成图片/视频后，结果节点右上角显示"免费" ✓
   - 不扣用户积分 ✓
   - 正式画布（`/canvas`）行为不变 ✓

## 八、决议

1. 本方案已于 2026-11-02 随测试权限规格一并确认并实施。
2. 后台渠道配置（管理员在对应环境手动完成，不由代码写入）：
   - 不新建逻辑模型。`gamaimage` / `gamavideo` / `gamatext` 是前端显示的虚拟名称。
   - 在现有渠道上设置 `purpose='open-source-practice'`，测试阶段绑定 Agnes 对应类型模型。
   - API Key 与 Base URL 只保存在环境的后台渠道配置里，不进入代码库。
