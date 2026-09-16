# 画布写剧本可行性调研报告（画布 / 画布 Agent 能力盘点）

日期：2026-09-14。类型：代码架构可行性调研（**非**测试实证）。

调研方式：4 路并行只读代码审查（画布能力 / 画布 Agent / 文本模型链路 / 文本回写画布），关键结论逐条复核原始代码。未修改任何文件、未执行 git 操作。

与既有文档的区别：`docs/audits/2026-09-08-canvas-agent-capability-audit.zh-CN.md` 是**测试实证能力矩阵**（逐项标注"线上通过/线上失败"）；本报告是**代码链路可行性分析**，回答"用画布写剧本这条路，代码上通不通、断在哪一节"，不包含线上实测结论。

---

## 一、结论摘要

**「对话式自由写剧本 → 结果落到画布上」当前是支持的，且不需要封装 skill。**

支撑它的是一条已存在、已接入生产路径的通路：

1. 在画布右侧 Agent 面板自由对话（连问候、能力咨询都走 `intent=conversation`，可纯聊天不生成任何产物）
2. 表达"写下来 / 出稿"后，Agent 转为 `intent=generation`，产出 `type: "text"` 的 deliverable
3. 服务端把结果写入画布文本节点：输入框 `@` 选中了文本节点则**原位覆盖**，未选则**新建文本节点**并自动选中
4. 节点可编辑、自动保存、刷新不丢

**闭环是通的**：对话调 → 出稿 → 图上可见 → 可手改 → 可持久化。

**但不是"像调豆包那样"的体验**，差距集中在五处硬约束（见第六节）。

---

## 二、画布本身的能力

### 2.1 节点类型（9 种）

枚举定义：`src/app/(user)/canvas/types.ts:15-25`

| 节点 | type | 可手动新建 | 输入 | 输出 |
|---|---|---|---|---|
| 图片生成 | `image` | ✅ | 上游 image / text | 图片（可多张，父+子节点） |
| 全景图 | `panorama` | ✅ | 上游 image / text | 2:1 等距柱状全景图 |
| 文本 | `text` | ✅ | 上游 text（可多路） | 文本 |
| 生成配置 | `config` | ✅ | 上游 image/video/audio/text | 按 `generationMode` 产出文本/图片/视频/音频 |
| 视频 | `video` | ✅ | 上游 image（首/尾帧）、video、audio | 视频 |
| 音频 | `audio` | ✅ | 仅 prompt 文本 | 音频 |
| 创作简报 | `brief` | ❌ 仅 Agent 创建 | — | 展示用 |
| Agent 任务 | `task` | ❌ 仅 Agent 创建 | 上游 brief/brand-kit/依赖任务 | 展示用 |
| 品牌规范 | `brand-kit` | ❌ 仅 Agent 创建 | — | 展示用 |

可手动新建的类型被显式收窄为 6 种：`src/app/(user)/canvas/[id]/canvas-page-elements.tsx:27`

补充说明：

- **没有独立的"素材/参考图"节点类型**——任何有内容的节点被连线后自动成为上游参考（`utils/canvas-resource-references.ts:130-136`）
- **没有"合成分镜"节点**：画布只有「切图」（网格切分）与「智能分层」（AI 分解透明图层），均为单图拆解，非多节点合成

### 2.2 执行模型：手动逐节点触发，**不是 DAG**

这是最容易被误解的一点。

- 唯一入口 `handleGenerateNode`（`[id]/use-canvas-generation-actions.tsx:103`），由节点提示词面板提交或悬浮工具栏触发
- **没有任何「运行整个画布」按钮**：全画布无 runAll/executeCanvas 语义
- **连线只是数据依赖，不是调度依赖**：建立连线不触发任何生成（`[id]/use-canvas-interaction-core.tsx:98-110` 仅 `setConnections`）；A→B→C 触发 C **不会**先跑 B
- **上游解析是扁平的、非递归的**：只收集直接一层连接（`utils/canvas-resource-references.ts:42-52,63`）
- 唯一的真调度在 Agent 内部：有 `dependencies` 拓扑判断与前置未完成判定（`src/lib/server/agent-run-execution.ts:455,496-497`）

**一次生成会"扇出"新节点**（隐性执行语义）：

- 图片 `count > 1` 时创建 batch root + N 个子节点并自动补连线，`Promise.all` 并发提交
- 视频/音频在源节点右侧 96px 自动新建节点并连线
- 文本按 count 生成 N 个文本子节点，同样并发

**状态呈现**：idle / loading / success / error / needs_review（`[id]/canvas-page-elements.tsx:48-52`）。

- **没有"排队"状态**：并发超限时抛 `ImageGenerationTaskDeferredError`，节点回 loading 并提示，靠轮询续查
- `CanvasNodeStatus` 含 `cancelled`，但常量表无对应项，仅 Agent 事件流会写入
- `runningNodeId` 是**单值**（`[id]/use-canvas-page-state.tsx:66`），并发扇出时 UI 只显示最后一个

### 2.3 保存 / 加载 / 复用

| 能力 | 状态 | 证据 |
|---|---|---|
| 防抖自动保存（250ms → 增量 → 3 档重试 → 409 自动 rebase） | ✅ | `stores/use-canvas-store.ts:230-242,338-349,406-407` |
| 增量协议 `nodeUpserts/nodeDeletes/...` + 乐观并发 | ✅ | `src/lib/canvas-project-contract.ts:34-50` |
| 多项目 / 重命名 / 批量删除 / 分页 | ✅ | `stores/use-canvas-store.ts:55-56` |
| ZIP 导入导出（含真实媒体，导入重传并 remap storageKey） | ✅ | `utils/canvas-export.ts:12-33` |
| 发布为作品 | ✅ | `components/canvas-project-card.tsx:100` |
| **模板 / 预设工作流** | ❌ 完全没有 | 全仓零命中，无模板表/API/UI |

### 2.4 交互能力

| 能力 | 状态 | 证据 |
|---|---|---|
| 缩放平移 / 小地图 / 缩放条 5%–500% | ✅ | `components/canvas-surface.tsx:517-518,864,875` |
| 框选 / Shift 追加选择 | ✅ | `utils/canvas-surface-geometry.ts:86-96` |
| 全选 / 删除 / Esc | ✅ | `[id]/use-canvas-file-actions.tsx:173-213` |
| 连线（config 之间禁止）/ 删除连线 | ✅ | `[id]/use-canvas-interaction-core.tsx:98-110`、`[id]/use-canvas-node-actions.tsx:112-116` |
| 复制粘贴（含连线重映射 + 系统剪贴板图片/文本落地建节点） | ✅ | `[id]/use-canvas-node-actions.tsx:175-258`、`[id]/use-canvas-file-actions.tsx:126-150` |
| 右键菜单 | ⚠️ **仅"复制/删除"两项** | `components/canvas-context-menu.tsx:43-44` |
| 撤销 / 重做 | ✅ | `[id]/use-canvas-navigation-actions.tsx:103-117` |
| 一键整理（连通分量 + 分层 + 行排布） | ✅ | `utils/canvas-auto-layout.ts:25-48` |
| 拖拽上传 / 多选批量下载 | ✅ | `[id]/use-canvas-media-session-actions.tsx:166` |
| 节点内图片编辑工具（14 项） | ✅ | `components/canvas-image-toolbar-tools.tsx` |
| **节点分组 / 成组** | ❌ 完全没有 | 唯一 `groupId` 属 `imageLayer`（AI 分层图层归组），与节点成组无关 |

### 2.5 与 practice / 素材库 / 生成日志的交互

- **无限练习（practice）**：是同构复用而非集成。practice 首页「无限画布」直接跳 `/canvas/<id>`；服务端靠 `executionProfile === "open-source-practice"` 区分；顶栏显示"练习"徽标。⚠️ 半接通：practice 创建时传的 `ipReferences` **不会**转发到画布侧
- **素材库**：双向已实现。画布→库有节点悬浮工具栏「存素材」（文本/视频/音频/图片四类齐全）；库→画布有资产面板 5 个页签与分派插入
- **生成日志**：半接通。来源标记已接（`logSource/surface: "canvas"`），但**消费端只有管理员后台，没有面向用户的生成日志页面**

### 2.6 与短剧画布的关系

`src/features/drama-canvas-runtime/` 是 `src/app/(user)/canvas/` 的**自动同步副本**（`sync-manifest.json` 记录 92 个文件，syncedAt 2026-08-25）。差异仅 4 处 adapter patch，其中导航目标 `/canvas` → `/drama-lab`。

**结论：两个目录是同一套代码，本节所有结论对二者同时成立**，仅在持久化 API 与导航目标上不同。

---

## 三、画布 Agent 是什么

### 3.1 定位

**服务端"规划型 Agent"**，不是"对话框 + 工具循环"的通用智能体。机制是**原生 function calling + 服务端计划→ops 翻译**，对画布是**间接读写**。

- 入口：顶栏右侧 `Bot` 按钮，`aria-label="打开 Agent"`（`components/canvas-top-bar.tsx:157-168`）
- 形态：右侧可拖拽侧边栏（348–640px），含 `chat` / `history` 两个 Tab
- 输入框支持 `@` 引用画布节点（`components/canvas-agent-mention.ts:24-31`）
- 另有一条**独立**的实验性本地通道（Local Codex Bridge），需手动在 URL 带 `agentUrl`/`agentToken` 才启用，且仅允许 `localhost/127.0.0.1/::1`

### 3.2 模型侧只有 1 个工具

`create_agent_plan`（`src/lib/server/agent-run-execution.ts:48-154`）；画布入口用的是扩展版，多出 `intent: "canvas_operation"` 与 `canvasOperation`、`literalContent`（`src/lib/server/agent-run-executor.ts:32-57`）。

**一轮请求只做一次 function call，没有 tool→result→tool 循环**（`agent-run-executor.ts:180-212`）。所谓"多轮"是靠会话历史重新规划实现的。

### 3.3 三种 intent

| intent | 含义 | 约束 |
|---|---|---|
| `conversation` | 纯对话 | 必须有 `reply`，`deliverables=[]`，`projectHandoff` 省略（`agent-run-validation.ts:54-56`） |
| `generation` | 创建节点 / 生成媒体 | `deliverables[]`，含 `id/targetNodeId/literalContent/title/type/model/prompt/count/ratio/quality/seconds/voice/format/dependencies/assetIds` |
| `canvas_operation` | 布局 / 待确认删除断连 | `deliverables` 必须为空（`agent-run-validation.ts:43-52`） |

判定规则写在 system prompt（`agent-run-surface-policy.ts:36,48`）：问候/闲聊/能力咨询/知识问答 → `conversation`；整理排版 → `canvas_operation{type:layout}`；删除节点/断开连线 → 只产出**待确认方案**；创建节点或生成媒体 → `generation`。

### 3.4 服务端实际写入画布的 op

由 `src/lib/server/agent-run-canvas-ops.ts` 产出：

- `planToOps`（`:13-81`）：`add_node`（brief / brand-kit / task / 输出媒体节点）+ `connect_nodes`
- `taskCanvasEventOps`（`:83-117`）：`update_node` 改 `agentTaskStatus`
- `taskResultOps`（`:168-219`）：**文本结果的落地逻辑**
  - 有 `targetNodeId`（改写选中节点）→ `update_node` + `select_nodes`（`:171-180`）
  - 无 target → `add_node`（新建 text 节点）+ `connect_nodes` + `select_nodes`（`:186-217`）
- `cancelledRunCanvasOps`（`:149-166`）：标记取消

前端可执行的完整 op 联合类型：`src/app/(user)/canvas/utils/canvas-agent-ops.ts:9-21`。

### 3.5 读画布的方式

服务端接收前端提交的**快照**并归一化（`agent-run-canvas-snapshot.ts:40-94`），喂给模型时含 `layout`（完整几何）、`nodes`、`connections`、`selectedNodeIds`、`imageSize`。快照**只保留授权媒体 URL**（`:172-175`）。

### 3.6 模型与协议

- 规划模型是**后台配置的默认模型**，用户不可直接选：有图/视频附件 → `defaultModels.visionModel`，否则 `defaultModels.textModel`（`agent-run-executor.ts:141-145`）
- 用户侧的"模型选择"实为**绕过 LLM 规划**：`requestedModelIds` 非空即走 `directAgentPlan`，**完全不调用大模型**（`agent-run-executor.ts:91,105-131`）；前端仅当关闭 `smartPlanning` 时才走这条（`canvas-assistant-panel.tsx:279`）
- 走**内部 AI 代理**而非直连厂商：`POST {origin}/api/ai/system/{channelId}/{path}`（`text-planning-runtime.ts:299`）
- 按协议分四类请求体：`chat` / `responses` / `gemini` / `custom`（`text-planning-runtime.ts:146-164`）
- 工具不支持时三级降级：native tool → JSON 模式 → repair 重试
- **真正的生成任务不由 Agent 模型执行**，而是转派 `/api/image-tasks`、`/api/video-generation-tasks`、`/api/audio-tasks`、`/api/text-tasks`

### 3.7 多轮对话与上下文

- 会话 ID 贯穿（`agent-run-store.ts:150-158`）
- 服务端取"长期摘要 + 最近消息"，**最近消息上限 12 条**（`creative-runtime-repository.ts:67`）
- 存储：数据库 `creative_conversations` / `creative_messages`；项目内另有 `CanvasProject.chatSessions` / `activeChatId`
- **画布状态确实进了 prompt**：`buildAgentPlannerInput` 组装 `requirement` + `conversationContext` + `canvasSnapshot` + 本轮选中节点 + `referencedAssets` + 可用 skill/模型 + `generationDefaults`（`agent-run-surface-policy.ts:63-104`）；system = `agentPlannerSystemPrompt`，user = 整个 request JSON 序列化
- 图片/视频以 dataURL 内联附加到最后一条 user 消息

### 3.8 是否依赖 skill

**不依赖。** skill 是可选增强：`selectAgentSkills` 只按 `selectedSkillIds` 白名单过滤；system prompt 明令 **"requestedSkillIds 为空时 skillIds 必须为空，不得自动选择任何普通 Skill"**（`agent-run-surface-policy.ts:48`）。未选 skill 时仍执行提示词优化、视觉方向、模型选择与参数规划。

### 3.9 边界与限制

| 维度 | 值 |
|---|---|
| 鉴权 | 全部 Agent 路由强制登录 |
| 归属校验 | 非本人（非 admin）返回 404 |
| 限流 | 10 次/分钟/用户 |
| Agent 并发 | 默认 2（`generationConcurrency.agent`） |
| 单请求时长 | `maxDuration = 2400`（40 分钟） |
| 规划模型超时 | 文本 3 分钟 |
| SSE 上限 | 1 小时 |
| prompt 长度 | 4000 字符 |
| 模型数 / skill 数 | ≤6 / ≤6 |
| 快照大小 | 512KB |
| 画布作用域 | canvas surface **必须带 projectId**；`canvas_operation` 前重新校验归属 |
| 删除/断连 | 只产出 proposal，前端弹窗确认才执行；有选中节点时不得越过该范围 |
| 未授权媒体 | 快照只保留 `/api/reference-assets/`、`/api/generation-log-assets/` 两种前缀 |

**无 token 级预算控制**（只有 `serializedChars` 统计）；**无重试上限字段**（靠 `errorHistory`）。

---

## 四、底层文本链路（"是不是裸调原模型"）

### 4.1 现有入口

**`POST /api/text-tasks`**（`src/app/api/text-tasks/route.ts:34`）→ `src/lib/server/text-task-runtime.ts:249`（Chat Completions 分支）。

- 接受任意 `messages`：`system` / `user` / `assistant` 三种角色，**最多 20 条**（`route.ts:135-141`）
- 单条文本 ≤20000 字符（`route.ts:143`）
- 返回 `{ task: { result: { content } } }`
- 客户端封装 `createTextGenerationTask`（`src/services/api/text.ts:30`），轮询取结果

### 4.2 好消息：这条链路**没有 schema 约束**

"剧本长什么样"完全由 prompt 决定，不存在被迫输出 JSON 的问题。这与项目里另一套 `text-planning-runtime`（强制 JSON + tool schema）**完全不同**——后者你没有走。

### 4.3 坏消息：五处收紧，不是真正的"裸调"

| 约束 | 现状 | 证据 |
|---|---|---|
| 不能自选上游 / 自带 key | `baseUrl`、`apiKey` 被客户端完全忽略 | `src/services/api/text.ts:35` |
| 模型只能选后台注册的逻辑模型 | 传任意串报 503"当前文本模型暂不可用" | `route.ts:124` |
| `config.systemPrompt` 被写死为空 | 只能把 system 放进 `messages[0]` 绕过（`withSystemMessage` 兜底生效） | `route.ts:129`、`text-task-runtime.ts:416` |
| 必须绑 surface + 登录 + 计费 | surface 可省略但仍走完整鉴权链路 | `route.ts:45,56-95` |
| **不支持流式** | 同步等全文，客户端 1500ms 轮询 | `src/services/api/text.ts:27` |

**超时固定 3 分钟**（服务端上游请求与客户端轮询都是）：`src/lib/server/model-request-policy.ts:5`、`src/services/api/text.ts:28`。超时报"文本模型响应超时，正在切换备用模型"并自动换候选渠道重试。

### 4.4 历史消息的现状

后端能力存在，但**没有任何链路把它接到文本模型上**：

- 所有调用方都只传 1 条消息：画布 `buildNodeResponseMessages` 返回 `[{role:"user", content:prompt}]`，无 history 参数
- 三套会话表：`creative_messages`（喂 Agent 规划器）、`practice_script_chat_messages`（喂剧本 Agent，**唯一真回传 history 的链路**）、`generation_tasks`（存 messages 但**完成后被清空**，保留 7 天）

---

## 五、文本节点细节（写剧本的载体）

**只有 1 种文本节点**：`CanvasNodeType.Text`（默认 340×240，title `"Note"`）。

- 正文字段：`metadata.content`（`types.ts:106`）
- 编辑：单击/双击进入，用 `CanvasResourceMentionTextarea`，支持 `@` 提及上游资源并高亮
- 字号可调 10–32，持久化在 `metadata.fontSize`
- **渲染是纯文本**：`whitespace-pre-wrap` + `overflow-y-auto`，**无 Markdown**（`AgentMarkdown` 只用于右侧对话面板）
- **无截断/折叠/展开**：超出固定节点框即内部滚动
- **无长文专用编辑器**：节点内的「放大输入」Modal 只作用于**提示词**，不作用于文本节点正文

**接收上游的三种路径**：旁路参考、自动拼接进 prompt（`prompt + "\n\n" + 上游文本`）、config 编排器 `@[node:id]` 精确选取。

⚠️ 注意：生成时**不会把上游文本写回文本节点 `content`**——它只进 prompt。

**回写落地的完整 6 段链路**（逐段均已实现）：

| 段 | 环节 | 状态 | 证据 |
|---|---|---|---|
| 1 | 文本任务 API 返回文本 | ✅ | `services/api/text.ts:30,61` |
| 2 | 返回文本写入节点 `metadata.content` | ✅ | `use-canvas-task-runtime.tsx:363-384`（373 行）；`use-canvas-generation-actions.tsx:491-501` |
| 3 | 节点进入 React 状态并显示 | ✅ | `canvas-node-content.tsx:243-295` |
| 4 | 节点序列化并持久化到服务端 | ✅ | `use-canvas-persistence-effects.tsx:395-402`；`stores/use-canvas-store.ts:213,230,244` |
| 5 | 刷新后恢复显示 | ✅ | `use-canvas-persistence-effects.tsx:181-224` |
| 6 | 短剧剧本文本 ↔ 画布文本节点双向同步 | ⚠️ **半通（单向 + 会被覆盖）** | 见 7.4-18 |

---

## 六、是否支持写剧本 —— 逐项对照

| 诉求 | 现状 | 说明 |
|---|---|---|
| 不封装 skill，自由调模型 | ✅ 支持 | skill 可选，留空即自由规划 |
| 像调豆包那样多轮对话慢慢调 | ⚠️ 支持但受限 | 多轮成立（摘要 + 最近 12 条）；但**不流式**、**模型由后台默认决定**、`smartPlanning` 开启时用户选的模型被忽略 |
| 写的东西反馈在画布上 | ✅ 支持 | 文本结果落地成文本节点 / 原位改写选中节点 |
| 剧本要能长、能改 | ⚠️ 勉强 | 340×240 纯 `<textarea>`，无 Markdown、无折叠、无大纲、无字数、无版本对比 |
| 剧本能喂给下游生图/生视频 | ✅ 支持 | 上游文本自动拼进下游 prompt；或 config 节点 `@[node:id]` 精确引用 |
| 多场次/分集结构化组织 | ❌ 没有 | 无层级、无引用语法、无大纲视图 |

---

## 七、断点清单

### 7.1 明确的断路 / 缺口

1. **Agent 不流式** —— 一次 function call 返回整个计划，文本任务再等全文。写长剧本期间界面只有转圈，没有逐字反馈。**这是对话体验最大的落差**
2. **3 分钟硬超时** —— 长剧本一旦超过就报超时并切换备用模型，剧本越长风险越高
3. **没有长文写作 UI** —— 340×240 的 textarea 装着几千字剧本，改一句要滚半天
4. **无版本 / 无 diff** —— `update_node` 直接覆盖 `content`（`agent-run-canvas-ops.ts:177`），Agent 改写选中节点时没有留底。**反复调时，手改的内容可能被下一轮静默盖掉**
5. **无节点分组** —— system prompt 明确要求"分组请求在 reply 说明未支持，不伪造成功"
6. **上游只解析一层** —— 链路深了就断

### 7.2 半成品 / 未接通

7. **无「运行整个画布」** —— 连线不触发执行，只有 Agent 内部有拓扑调度
8. `delete_node` / `delete_connections` / `run_generation` 三种 op **前端会执行但服务端从不产出**
9. 意图守卫 `assertAgentPlanIntent` 是**空实现**，标注 "advisory only"（`agent-intent-guard.ts:12-14`）
10. `isAnalysisIntent` 全仓无调用点；`plannerMessageContent` 是死代码
11. 规划器 tool 描述与实际 schema 不一致：描述仍写"创建创作计划"，enum 里已有 `canvas_operation`
12. `runningNodeId` 单值，并发扇出时只有最后一个节点显示运行中
13. `cancelled` 状态无客户端常量写入点
14. practice 创建时 `ipReferences` 未转发到画布
15. 生成日志有来源标记但**无用户侧查看页**
16. 本地 Agent 桥功能完整但需手动带 URL 参数才启用，非默认开启

### 7.3 完全没有

- **模型自主的多轮工具循环**（只做一轮 function call）
- Agent 直接调用 MCP / 直接读写数据库或文件系统
- 画布分组容器、模板/预设工作流、"合成分镜"类合成节点
- 面向用户的生成日志页面
- 跨项目 / 跨画布操作

### 7.4 需要提醒的两个坑

17. **另有一条看起来更"像"多轮写剧本的链路**：`/api/practice/scripts/*`（有 `chatHistory` 回传、SSE 逐字 `assistant_delta`、会话持久化、`conversation` runType）。但它被 `requirePracticeAccess`（学生/教师身份）与强制 `save_conversation` tool schema 双重约束 —— **那是封装 skill 路线，不是裸调**
18. **剧集画布 `/drama-canvas` 有已确认的坑**：文本节点里改的内容会在下次「同步当前集」时被项目侧静默覆盖（`src/lib/server/drama-lab-episode-canvas-service.ts:154-159`，非递归合并会用项目侧 `content` 覆盖画布侧）。**普通画布 `/canvas` 没有这个问题**

补充：短剧项目剧本 → 画布是**单向**的（能投射显示），画布 → 短剧剧本**完全没有回写通道**（writeback 端点不接 `script` 字段且强制要求 `shotId`，前端零调用方）。

---

## 八、总结

**能支持，但现阶段的"能"是：能对话、能出稿、能落图、能改、能存；但看不到逐字输出、模型选择不完全在用户手里、长剧本会撞 3 分钟超时、且反复让 Agent 改写会覆盖手改内容。**

按"多花时间慢慢对话去调"的用法，第 1、2、4 三条最影响体验——它们决定这是"在一个能编辑画布的对话框里跟模型来回磨"，还是"每次提交后等结果、还可能被下一轮盖掉"。第 3 条（长文 UI）决定磨出来的东西好不好读。

---

## 附录：核心文件索引

```
# 画布
src/app/(user)/canvas/types.ts
src/app/(user)/canvas/constants.ts
src/app/(user)/canvas/[id]/use-canvas-generation-actions.tsx
src/app/(user)/canvas/[id]/use-canvas-task-runtime.tsx
src/app/(user)/canvas/[id]/use-canvas-persistence-effects.tsx
src/app/(user)/canvas/[id]/use-canvas-interaction-core.tsx
src/app/(user)/canvas/components/canvas-node-content.tsx
src/app/(user)/canvas/components/canvas-node-generation.ts
src/app/(user)/canvas/utils/canvas-resource-references.ts
src/app/(user)/canvas/utils/canvas-agent-ops.ts
src/stores/use-canvas-store.ts

# 画布 Agent
src/app/(user)/canvas/components/canvas-assistant-panel.tsx
src/app/(user)/canvas/components/canvas-agent-run-client.ts
src/app/(user)/canvas/use-canvas-local-agent-bridge.ts
src/lib/server/agent-run-executor.ts          # 编排 + 画布工具扩展
src/lib/server/agent-run-execution.ts         # 工具 schema + 任务执行
src/lib/server/agent-run-canvas-ops.ts        # 计划 → 画布 op
src/lib/server/agent-run-canvas-snapshot.ts   # 快照归一化
src/lib/server/agent-run-surface-policy.ts    # system prompt + 上下文组装
src/lib/server/agent-run-validation.ts        # 计划校验
src/lib/server/agent-prompt-json.ts           # 请求 schema v1
src/lib/server/agent-run-store.ts             # Run 持久化
src/app/api/agent/runs/route.ts

# 文本链路
src/app/api/text-tasks/route.ts
src/lib/server/text-task-runtime.ts
src/lib/server/text-planning-runtime.ts
src/lib/server/text-task-log.ts
src/services/api/text.ts

# 同步副本
src/features/drama-canvas-runtime/            # src/app/(user)/canvas 的自动同步副本
```
