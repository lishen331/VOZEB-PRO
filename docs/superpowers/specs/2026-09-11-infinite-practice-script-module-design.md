# 无限练习独立剧本模块设计

> **已取代：** 本设计已被 `docs/superpowers/specs/2026-09-13-infinite-practice-screenwriter-agent-redesign.md` 取代。后续开发不得继续以本文作为实现依据。

> 日期：2026-09-11
> 状态：已确认设计，待用户审阅
> 范围：仅限 VOZEB-PRO 无限练习，不涉及商业闭源生成模块

## 1. 目标

在 VOZEB-PRO 的“无限练习”中增加一个独立的“剧本练习”模块。模块借鉴 `kenshinshen1314-sudo/script-gen-ai` 的专业剧本编辑、结构化剧本文档和 AI 工具化编辑思路，但使用 VOZEB-PRO 自己的用户、权限、PostgreSQL、API、版本和无限练习执行档案。

用户可以：

- 从一个创意开始，分阶段生成和完善剧本；
- 导入已有 Fountain、FDX、纯文本或 Markdown 剧本；
- 在专业剧本格式编辑器中继续修改；
- 使用本地开源文本模型进行大纲生成、扩写、重写、润色和结构检查；
- 保存剧本版本并恢复历史版本。

本模块第一期只产出剧本文本和剧本结构，不自动调用角色、场景、道具、分镜图、分镜视频或配音工作流。

## 2. 范围边界

### 2.1 包含

- 无限练习首页的独立“剧本”入口；
- 单人剧本项目；
- 从创意创建剧本；
- 导入已有剧本；
- 专业剧本格式编辑；
- Episode、Scene、Beat、Character、Location 等剧本实体；
- 本地开源文本模型调用；
- Script Skill、Script Tool 和受控 Agent Workflow；
- AI 修改建议、用户确认、局部写入；
- 剧本版本和操作记录；
- Fountain、FDX、纯文本和 Markdown 导入；
- Fountain、FDX、PDF 和纯文本导出。

### 2.2 不包含

- 商业闭源模块、生产渠道、商业积分或商业模型配置；
- 角色生图、人物三视图、妆造图、场景图、道具图；
- 分镜图、分镜视频、配音、音乐或最终合成；
- 剧本生成后自动创建任何媒体任务；
- 漫剧项目自动编排；
- 多人协作、协同光标、评论协作或共享编辑；
- Loro Sync、独立 WebSocket 协作服务或独立 Supabase；
- Laper 社区、订阅、独立鉴权和独立项目后台；
- 完整插件市场或系统级模型中台。

未来如果把剧本交给漫剧生产链，必须通过明确的“导入到漫剧项目”动作完成，不在本模块内隐式触发下游工作流。

## 3. 迁移原则

### 3.1 借鉴并重做，不整体复制

从 `script-gen-ai` 借鉴：

- 专业剧本块类型；
- Plate/Slate 风格的结构化编辑方式；
- Fountain 与 FDX 解析和序列化；
- Project、Episode、Scene、Beat、Character、Location、Shot 等实体分层；
- `read_script`、`read_entities`、`edit_script`、`edit_entities` 等工具的职责边界；
- AI 只修改明确范围并产生版本的工作方式。

不直接迁移：

- Laper 的 Supabase 用户和项目服务；
- Loro CRDT 主存储和 Loro Sync；
- 多人协作协议；
- 独立 Agent/Chat 服务；
- Laper API、社区、订阅和商业后台。

### 3.2 VOZEB-PRO 作为唯一宿主

剧本模块必须复用：

- 当前登录用户和既有权限；
- 无限练习执行档案 `open-source-practice`；
- VOZEB-PRO PostgreSQL 与 Repository；
- 现有 API `{ code, data, msg }` 响应结构；
- 现有审计和任务日志；
- 现有本地模型/渠道配置能力，但仅在无限练习范围内解析。

## 4. 用户入口和阶段流程

### 4.1 新建剧本

```text
新建剧本
├── 从一个想法开始
└── 从已有剧本导入
```

### 4.2 从想法开始

```text
阶段 1：创意输入
  → 阶段 2：故事梗概
  → 阶段 3：故事大纲
  → 阶段 4：人物与地点
  → 阶段 5：分集与场景
  → 阶段 6：剧本文本
  → 阶段 7：编辑、检查与局部修改
```

每个阶段都支持：

- 生成；
- 查看；
- 用户编辑；
- 重新生成；
- 确认；
- 返回上一步；
- 保存阶段版本。

阶段推进规则：

- 未确认前一阶段时，不能自动执行下一阶段；
- AI 生成结果先进入草稿或待审核状态；
- 用户确认后才成为下一阶段的输入；
- 上游阶段修改后，下游结果保留但标记为需要复核，不直接删除；
- 用户可以选择重新生成受影响内容，也可以继续使用旧结果。

### 4.3 从已有剧本导入

```text
导入文件
  → 识别格式
  → 解析剧本结构
  → 提取人物、地点、场景和 Beat
  → 展示解析预览
  → 用户确认
  → 进入剧本编辑
```

支持：

- Fountain；
- FDX；
- 纯文本；
- Markdown。

普通文本或 Markdown 导入后，系统可以生成结构化剧本草稿，但必须先展示解析结果并等待用户确认。

## 5. 单人工作区

```text
┌──────────────────────────────────────────────┐
│ 标题 │ 当前版本 │ 导入 │ 导出 │ 保存状态       │
├──────────┬───────────────────────┬───────────┤
│ 项目结构 │      专业剧本编辑器     │ AI 编剧助手 │
│ Episode  │      剧本正文           │ 对话      │
│ Scene    │                       │ Skill     │
│ Character│                       │ 修改建议   │
│ Location │                       │ 应用修改   │
│ Beat     │                       │           │
└──────────┴───────────────────────┴───────────┘
```

### 左侧：项目结构

第一期展示：

- Episode；
- Scene；
- Character；
- Location；
- Beat。

### 中间：专业剧本编辑器

第一期直接支持：

- 场景标题 `scene-heading`；
- 动作 `action`；
- 角色名 `character`；
- 括号说明 `parenthetical`；
- 对白 `dialogue`；
- 转场 `transition`；
- 编辑备注 `note`。

### 右侧：AI 编剧助手

支持：

- 生成故事梗概；
- 生成故事大纲；
- 生成角色和地点；
- 生成场景；
- 扩写选中内容；
- 重写选中内容；
- 增强冲突；
- 调整对白；
- 润色；
- 检查人物一致性；
- 检查场景连续性；
- 检查剧本格式。

## 6. 领域数据模型

### 6.1 Script Practice Project

```ts
 type ScriptPracticeProject = {
    id: string;
    userId: string;
    title: string;
    genre?: string;
    logline?: string;
    synopsis?: string;
    status: "draft" | "writing" | "completed";
    sourceType: "idea" | "fountain" | "fdx" | "text" | "markdown";
    currentVersionId?: string;
    createdAt: number;
    updatedAt: number;
};
```

### 6.2 Script Block

```ts
 type ScriptBlock =
    | { id: string; type: "scene-heading"; text: string }
    | { id: string; type: "action"; text: string }
    | { id: string; type: "character"; text: string }
    | { id: string; type: "parenthetical"; text: string }
    | { id: string; type: "dialogue"; text: string }
    | { id: string; type: "transition"; text: string }
    | { id: string; type: "note"; text: string };
```

### 6.3 Script Document

```ts
 type ScriptDocument = {
    id: string;
    projectId: string;
    format: "structured";
    blocks: ScriptBlock[];
    version: number;
    createdAt: number;
    updatedAt: number;
};
```

### 6.4 Script Entity

```ts
 type ScriptEntity = {
    id: string;
    projectId: string;
    type: "character" | "location" | "episode" | "scene" | "beat";
    name: string;
    description?: string;
    metadata?: Record<string, unknown>;
};
```

### 6.5 Script Version

```ts
 type ScriptVersion = {
    id: string;
    projectId: string;
    documentSnapshot: ScriptDocument;
    source: "user" | "ai" | "import" | "restore";
    operation?: string;
    parentVersionId?: string;
    createdAt: number;
};
```

实际落库时必须使用现有数据库迁移规范：已有持久化环境补列必须使用幂等 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`，不得依赖 `CREATE TABLE IF NOT EXISTS` 改变旧表结构。是否采用独立表或现有练习会话扩展，需要在实施计划阶段按当前 Repository 结构确定，但不得污染商业生成表。

## 7. 剧本模型运行时

剧本模型属于无限练习本地开源文本模型，不作为商业模型渠道使用。

模型层使用统一的本地服务协议，兼容：

- Ollama；
- vLLM；
- SGLang；
- llama.cpp；
- OpenAI-compatible local endpoint。

产品侧显示“剧本创作能力”，后台负责绑定具体模型和服务。第一期默认候选为 Qwen3，但具体模型版本、量化格式和运行地址由无限练习后台配置，不写死在用户侧。

每次模型调用需要保存最小审计快照：

- execution profile；
- 逻辑模型 ID；
- 实际模型标识；
- Agent Workflow 版本；
- Skill 版本；
- 请求类型；
- 输入文档版本；
- 输出状态；
- 错误摘要。

不得持久化或展示模型隐式思维链。允许保存用户可见的生成结果、结构化输出、工具调用摘要和修改 Patch。

## 8. Skill、Tool 和 Agent Workflow

### 8.1 Skill

Skill 是剧本领域能力，不直接拥有数据库写权限。

第一期候选 Skill：

```text
screenplay-format
story-outline
character-design
scene-design
dialogue-writing
conflict-enhancement
pacing-control
continuity-check
script-polish
script-adaptation
```

建议字段：

```ts
 type ScriptSkill = {
    id: string;
    name: string;
    description: string;
    version: number;
    scope: "script";
    inputSchema: unknown;
    outputSchema: unknown;
    systemInstruction: string;
    allowedTools: string[];
    enabled: boolean;
};
```

Skill 的系统提示词属于内部执行配置，不返回前端，不写入用户可见剧本文本。

### 8.2 Tool

Tool 是 Agent 可以调用的受控动作。

第一期候选工具：

```text
read_script
read_outline
read_entities
read_scene
read_selection
rewrite_selection
expand_selection
create_scene
update_scene
create_character
update_character
create_location
update_location
create_beat
reorder_scenes
validate_script_structure
create_version
```

建议字段：

```ts
 type ScriptTool = {
    id: string;
    name: string;
    description: string;
    inputSchema: unknown;
    outputSchema: unknown;
    action: string;
    readOnly: boolean;
    requiresConfirmation: boolean;
    enabled: boolean;
};
```

工具必须在服务端绑定当前：

```text
userId
practiceProjectId
scriptDocumentId
```

禁止模型直接访问 SQL、任意表、商业模块或媒体任务创建接口。

### 8.3 Agent Workflow

Agent Workflow 描述调用阶段，不保存模型思维链。

典型流程：

```text
识别用户意图
  → 读取目标内容
  → 读取必要人物 / 地点 / 场景上下文
  → 选择 Skill
  → 生成建议或结构化结果
  → 用户确认
  → 写入 Patch
  → 校验剧本结构
  → 创建新版本
```

建议字段：

```ts
 type ScriptAgentWorkflow = {
    id: string;
    name: string;
    version: number;
    trigger: string;
    stages: Array<{
        id: string;
        type: "classify" | "read" | "generate" | "confirm" | "write" | "validate" | "version";
        skillId?: string;
        toolIds?: string[];
        required: boolean;
    }>;
    enabled: boolean;
};
```

高风险写入必须确认：

- 重写整场；
- 删除对白或场景；
- 修改人物动机；
- 改变故事结局；
- 修改时间线；
- 删除实体。

低风险操作可以直接应用，但仍需创建版本：

- 格式化剧本块；
- 修复角色行格式；
- 修复场景标题格式；
- 生成只读检查报告。

## 9. 创作控制项

人物关系、故事线和创作强度可以通过滑块控制，但滑块表示创作约束，不表示模型内部随机参数，也不保证输出达到精确数学比例。

第一期可配置：

```text
人物戏份权重
故事线权重
人物关系强度
信任度
依赖度
冲突强度
情绪强度
悬念保留
对白密度
```

统一保存为结构化控制项：

```json
{
  "characterShare": {
    "character-lin-mo": 0.6,
    "character-hei-yi": 0.25,
    "character-su-wan": 0.15
  },
  "storylineShare": {
    "main": 0.7,
    "romance": 0.2,
    "mystery": 0.1
  },
  "relationshipIntensity": {
    "lin-mo:hei-yi": 0.8
  },
  "conflictIntensity": 0.75,
  "emotionIntensity": 0.6,
  "suspenseRetention": 0.85,
  "dialogueDensity": 0.45
}
```

服务端负责：

1. 校验 ID 属于当前剧本项目；
2. 校验权重为有限数值并归一化展示；
3. 将控制项编译为 Agent 的结构化上下文；
4. 在生成结果中做偏离提示；
5. 不允许模型自行修改用户控制项。

## 10. 版本、草稿和确认

每个阶段至少有：

```text
not_started
 draft
 generating
 awaiting_review
 confirmed
 failed
 stale
```

AI 结果先保存为草稿或待审核结果。用户点击应用后，服务端使用稳定项目、文档和版本身份写入 Patch，并创建新版本。

一次 AI 修改需要记录：

```text
projectId
scriptDocumentId
baseVersionId
selection / target node IDs
operation
model snapshot
skill snapshot
workflow snapshot
before patch
proposed patch
after patch
createdAt
```

失败重试必须复用原剧本项目和原目标范围，不追加重复文本，不覆盖用户在等待期间的新编辑。

## 11. 后台规划

后台只新增无限练习下的剧本配置，不改变商业后台配置。

建议入口：

```text
无限练习 / 剧本
```

配置项：

- 模块启用状态；
- 默认剧本模型；
- 备用剧本模型；
- 本地模型服务地址和协议；
- 默认上下文长度；
- 默认输出语言；
- 默认剧本格式；
- 可用 Skill；
- 可用 Tool；
- Agent Workflow 版本；
- 写入确认策略；
- 版本保存策略；
- 创作控制项开关。

后台运营人员不配置：

- RunningHub Workflow ID；
- ComfyUI 节点 ID；
- LoRA；
- VAE；
- 图片 / 视频工作流节点映射。

## 12. 权限与隔离

- 只有无限练习授权用户可以访问剧本模块；
- 所有剧本查询和写入必须按 `userId` 和项目 ID 定向查询；
- 不得从完整数据库快照中筛选剧本；
- Skill、Tool、Agent Workflow 的后台管理需要既有上游配置管理职责权限或新增明确的无限练习配置权限；
- 普通用户不能查看系统提示词、完整工具 Schema、模型服务密钥、内部执行日志或节点映射；
- 剧本模块的本地模型调用只能走无限练习执行档案；
- 商业模块的模型、渠道、积分和任务表不被剧本模块写入或改写。

## 13. 成功标准

### 用户侧

- 用户可以从创意或已有剧本开始；
- 用户可以逐阶段生成、确认和返回修改；
- 编辑器直接支持场景标题、角色、对白、动作、括号说明和转场；
- 用户可以局部选择文本让 AI 修改；
- AI 修改有预览、确认和版本记录；
- 用户可以导入和导出主流剧本格式；
- 剧本模块不会创建生图、生视频或配音任务。

### 服务端

- 所有剧本数据归属于无限练习项目和当前用户；
- 本地模型调用可审计、可重试和可恢复；
- Skill、Tool 和 Agent Workflow 可按版本锁定；
- 写入工具无法越权访问其他用户、商业模块或媒体任务；
- 上游阶段修改会正确标记下游草稿为 stale；
- 用户等待 AI 期间继续编辑时，迟到结果不会覆盖新内容。

### 许可证与迁移

- 迁移前逐文件记录 `script-gen-ai` 来源、版本和许可证；
- 对于不适合直接复制的代码，只借鉴行为和数据结构并重新实现；
- Laper 的独立服务和多人协作代码不进入 VOZEB-PRO；
- Fountain、FDX、Plate、Slate、编辑器依赖和模型权重分别核对许可证；
- 不把第三方项目的“复刻实现”描述为 Laper 官方生产代码。

## 14. 后续衔接但不属于本期

未来可以增加明确动作：

```text
导入到漫剧项目
```

导入时只传递用户确认的剧本版本和结构化实体，并由漫剧项目另行决定：

- 是否生成角色资产；
- 是否生成场景和道具；
- 是否拆分分镜；
- 是否调用图片、视频或配音工作流。

本期不实现该动作，也不让剧本模块自动创建任何下游生成记录。
