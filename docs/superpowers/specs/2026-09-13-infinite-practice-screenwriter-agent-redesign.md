# 无限练习网页版剧本 Agent 重做设计

> 日期：2026-09-13
> 状态：产品范围、交互骨架、Agent/Skill/Tool 方向已由用户确认；本文作为后续实现的唯一设计入口
> 范围：仅 VOZEB-PRO“无限练习—剧本”模块
> 取代：`docs/superpowers/specs/2026-09-11-infinite-practice-script-module-design.md`
> 后续要求：上下文重置、换 Agent 或恢复任务时，必须先阅读本文，再阅读基于本文生成的新实施计划；不得继续按 2026-09-11 旧设计扩展

## 1. 设计目标

将当前不可用的“固定阶段按钮 + 单次 JSON 返回 + 简单 TextArea”剧本练习，重做为一个真正面向创作者和编剧的网页版剧本 Agent。

它必须支持两条完整路径：

1. 从一句话创意生成完整小说体短故事，再改编为分集剧本与文字分镜；
2. 导入或从零生成长篇小说，再选择章节范围改编为分集剧本与文字分镜。

最终交付物截止于：

- 小说或完整故事正文；
- 创作定位、世界观、人物小传和人物关系；
- 故事骨架、改编策略和分集大纲；
- 完整分集剧本及监督审核结果；
- 镜头级文字分镜；
- 项目级人物、场景、道具提示词。

一期明确不调用任何图片、视频或音频生成能力。

## 2. 已确认决策总表

以下决定已经由用户逐项确认，后续不得自行变更：

| 编号 | 已确认决定 |
| --- | --- |
| D-01 | 同时支持短故事与长篇小说两种模式。 |
| D-02 | 短故事模式也必须先生成完整小说体故事正文，不能从大纲直接跳到剧本。 |
| D-03 | 长篇支持导入，也支持从创意生成。 |
| D-04 | 小说总纲、卷纲和全部章纲可以批量生成。 |
| D-05 | 长篇章节正文逐章持久化；用户一次可选择 1–5 章生成。 |
| D-06 | 重要节点人工确认，节点内部由 Agent 自动执行。 |
| D-07 | 大量分集剧本由系统自动分项生成、自动保存，用户不逐集点击保存或确认。 |
| D-08 | 批量生成失败时只重试失败章、失败集、失败场景或失败分镜；成功项不重跑。 |
| D-09 | 监督 Agent 审核全部分集剧本并自动修正明显问题，最后由用户统一确认。 |
| D-10 | 涉及主线、结局、核心人物设定的重大修改不能自动执行，只列为待用户决定项。 |
| D-11 | 人物、场景、道具采用项目级统一资产提示词库，稳定 ID 去重，并记录出现位置。 |
| D-12 | 文字分镜采用“一条镜头一行”的镜头级颗粒度。 |
| D-13 | 页面保持三栏：左侧工作目录，中间正式成果与 SSE 增量内容，右侧 Agent 对话。 |
| D-14 | 后台配置必须真实控制运行时；保存后下一次调用立即生效，前端必须显示真实执行反应。 |
| D-15 | 只做网页版无限练习剧本，不迁移 Electron、SQLite、Supabase、Loro 或独立 Agent 服务。 |
| D-16 | 最终截止于文字分镜和资产文字提示词，不生成图片、视频、音频、配音或成片。 |
| D-17 | 参考 ToonFlow、剧多多和 script-gen-ai 的产品逻辑，但使用 VOZEB-PRO 自有组件、权限、PostgreSQL、模型渠道和视觉调性。 |
| D-18 | 430px 移动端不属于本次工作范围。 |

## 3. 参考系统与本地证据

### 3.1 ToonFlow

官方仓库：

- `https://github.com/HBAI-Ltd/Toonflow-app`
- `https://github.com/HBAI-Ltd/Toonflow-web`

已固定到本地过程文件：

- `C:\CODE\VOZEB-PRO\过程文件\Toonflow-app`
- `C:\CODE\VOZEB-PRO\过程文件\Toonflow-web`

分析时提交：

- Toonflow-app：`e03cf590eb0cab63534a4040db9acb4ec95b42a6`
- Toonflow-web：`9c4cb0ec7d4f6b4067c7768e2df8cdc7f8587214`

主要借鉴：

- 决策层、执行层、监督层三层 Agent；
- 故事骨架、改编策略、分集剧本、导演规划和分镜表流程；
- Agent 子任务流式输出；
- 结构化成果边生成边写入工作区；
- Markdown Skill 文件与运行时激活；
- 每个 Agent 独立模型、温度、思考和输出策略；
- 长篇先提取章节事件，再按需读取原文；
- 剧本批量生产、自动保存和失败项处理。

不照搬：

- Electron；
- SQLite；
- Socket.IO 协议；
- 本地文件路径和 OSS 封装；
- 图片、视频、音频和成片生产；
- 前端品牌、Logo、素材和视觉 Token。

许可证注意：仓库文件头为 Apache-2.0，但 `LICENSE` 末尾附加了商业授权和标识保留条款。因此后续若直接复用其源文件或 Skill 原文，必须保留来源与版权声明并再次核对授权；本文采用的是产品能力和架构思想的独立实现设计。

### 3.2 剧多多

本地安装及可读服务端代码：

- `C:\DATA\juduoduo`
- 核心服务：`C:\DATA\juduoduo\resources\server`

主要借鉴：

- POST 创建任务、GET/流读取的 SSE 实现思路；
- 主 Agent 将专业子 Agent 当作工具调度；
- 故事师、规划师、大纲师、导演等职责拆分；
- 从创意建立项目与小说创作资料；
- 故事线、章节、分集大纲、剧本和分镜的独立持久化；
- `toolCall`、`refresh`、文本增量、停止和历史恢复事件；
- 前端收到保存完成事件后刷新对应成果；
- 每章、每集和每个分镜任务独立状态。

不照搬：

- EggJS；
- MySQL/SQLite 模型；
- 本地 JWT 和用户体系；
- Nuxt 编译产物；
- 会员、支付和商业额度；
- 图片与视频分镜生成。

### 3.3 script-gen-ai

仓库：`https://github.com/kenshinshen1314-sudo/script-gen-ai`
分析时提交：`6f56f0cb942a65d2b752bafadb82bb363efa0d24`

主要借鉴：

- 持续多轮编剧对话；
- 会话创建、重命名、删除与历史恢复；
- `read_script`、`find_node`、`grep_script`、`edit_script`、`read_entities`、`edit_entities` 的工具颗粒度；
- 专业剧本块编辑器；
- Agent 分批写入少量完整语义单元，让用户看到正文逐步出现；
- 人物和地点用稳定 ID 与剧本节点关联。

不照搬：

- Supabase；
- Loro CRDT；
- IndexedDB 主存储；
- lorosync WebSocket；
- 多人协作；
- 独立 Hono/Mastra Chat 服务。

该仓库未声明许可证，禁止直接复制其源文件、系统提示词、品牌或素材；只借鉴公开可观察的功能与交互思想。

## 4. 一期范围边界

### 4.1 包含

- 无限练习中的独立剧本项目；
- 从创意创建短故事或长篇小说；
- 导入已有长篇小说或已有剧本；
- 创作定位、世界观、人物小传和人物关系；
- 短故事大纲与完整小说体正文；
- 长篇总纲、卷纲、章纲、章节正文和事件索引；
- 改编章节范围；
- 故事骨架、改编策略、分集大纲；
- 分集剧本批量生成、自动保存和失败重试；
- 监督审核、自动修正、统一报告与用户确认；
- 导演文字规划；
- 镜头级文字分镜；
- 人物、场景、道具文字提示词及项目级去重；
- 多轮 Agent 对话、历史、停止和恢复；
- 后台 Agent、Skill、Tool、模型和联调测试配置；
- Fountain、FDX、纯文本和 Markdown 导入导出能力的保留与升级；
- 全部数据使用 PostgreSQL 与现有 Session/学校权限。

### 4.2 不包含

- 图片生成或图片工作流；
- 分镜图生成；
- 视频生成；
- 配音、音效、音乐或音频生成；
- 角色、场景、道具图片资产生产；
- 成片合成、字幕烧录或剪辑；
- RunningHub 七个媒体工作流的修改；
- 商业闭源短剧模块；
- 商业积分扣除或生产渠道；
- 多人协作、评论、协同光标；
- Loro、Supabase、独立 WebSocket 服务；
- ToonFlow/剧多多品牌、Logo、文案和视觉素材；
- 390px/430px 移动端专项改造，尤其 430px 不作为本次验收项。

### 4.3 执行档案

所有模型调用必须使用：

```text
executionProfile = open-source-practice
```

要求：

- 不回退到 `production` 渠道；
- 不触发商业生成积分扣除；
- 仍记录模型、渠道、调用次数、Token、耗时和错误审计；
- 任何媒体任务表都不得因本模块被写入。

## 5. 产品信息架构

### 5.1 三栏布局

```text
┌────────────工作目录────────────┬────────────正式成果区────────────┬────────────Agent 对话────────────┐
│ 项目资料与阶段树               │ 当前目录对应的真实作品内容       │ 用户与统筹 Agent 持续对话        │
│ 章、集、场景和失败状态         │ SSE 增量写入、编辑、自动保存      │ 多 Agent 身份、工具状态、停止     │
│ 确认门、运行进度               │ 版本、审核差异、结构化分镜        │ 历史会话、恢复、应用建议          │
└───────────────────────────────┴───────────────────────────────────┴──────────────────────────────────┘
```

#### 左侧：工作目录

长篇模式目录：

```text
项目资料
├─ 创作参数
├─ 创作定位
├─ 世界观
├─ 人物小传
└─ 人物关系
小说
├─ 小说总纲
├─ 第一卷
│  ├─ 卷纲
│  ├─ 第 1 章章纲
│  ├─ 第 1 章正文
│  └─ ...
├─ 第二卷
└─ 章节事件索引
改编策划
├─ 改编范围
├─ 故事骨架
├─ 改编策略
└─ 分集大纲
分集剧本
├─ 第 1 集
├─ 第 2 集
└─ ...
剧本审核
├─ 审核进度
├─ 自动修正
└─ 待用户决定
文字分镜
├─ 导演规划
├─ 第 1 集分镜
└─ ...
资产提示词
├─ 人物
├─ 场景
└─ 道具
```

短故事模式不显示卷与多章树，改为：

```text
项目资料
故事大纲
完整短故事
改编策划
分集剧本
剧本审核
文字分镜
资产提示词
```

左侧节点必须展示真实状态：

- 未开始；
- 生成中；
- 待确认；
- 已确认；
- 部分完成；
- 失败；
- 已过期待复核。

#### 中间：正式成果区

中间只显示作品和可操作状态，不显示模型原始 JSON。

按节点使用不同渲染器：

- 创作定位：参数摘要和定位文档；
- 世界观：规则、时代、社会、地理、力量/技术体系等分区；
- 人物小传：人物卡与关系视图；
- 总纲、卷纲、章纲：层级大纲；
- 小说正文：章节编辑器；
- 故事骨架和改编策略：Markdown 文档与结构化表；
- 分集大纲：每集一行/一卡，支持大批量查看；
- 分集剧本：专业剧本块编辑器；
- 审核：差异、自动修正项和待用户决定项；
- 分镜：镜头级高密度表格；
- 资产提示词：人物、场景、道具统一卡片库。

Agent 生成时，中间通过 SSE `artifact_delta` 展示临时增量；只有数据库提交成功后才通过 `artifact_saved` 切换为已保存状态。

#### 右侧：Agent 对话

必须支持：

- 用户和 Agent 左右消息；
- 统筹、小说策划、小说写作、编剧、编辑/监督、导演、分镜师等身份；
- 自然语言逐字流式输出；
- 工具调用的简洁状态；
- 停止生成；
- 错误与可重试项；
- 多个历史会话；
- 会话重命名和删除；
- 刷新后恢复；
- Agent 建议应用到中间成果；
- 不显示模型思维链、内部系统提示词、Skill 原文或渠道密钥。

## 6. 两条完整创作链路

### 6.1 短故事模式

```text
一句话创意
→ 创作参数确认
→ 创作定位
→ 世界观
→ 人物小传与关系
→ 故事大纲
→【确认门 S1】
→ 完整小说体短故事正文
→【确认门 S2】
→ 故事骨架
→ 改编策略
→ 分集大纲
→【确认门 S3】
→ 全部分集剧本
→ 监督 Agent 审核并自动修正
→【确认门 S4】
→ 导演规划
→ 镜头级文字分镜
→ 项目级人物/场景/道具提示词
→ 完成
```

约束：

- `S1` 前允许 Agent 在定位、世界观、人物和大纲内部连续执行；
- `S1` 未确认，不能生成短故事正文；
- `S2` 未确认，不能进入改编；
- `S3` 未确认，不能批量生成分集剧本；
- `S4` 未确认，不能生成最终文字分镜和资产提示词。

### 6.2 长篇小说模式

来源 A：导入现有小说。
来源 B：从创意生成长篇小说。

```text
创意或导入
→ 创作参数确认
→ 创作定位
→ 世界观
→ 人物小传与关系
→ 小说总纲
→ 卷纲
→ 全部章纲
→【确认门 L1】
→ 用户每次选择 1–5 章生成正文
→ 每章自动生成事件索引
→ 用户选择已完成章节作为改编范围
→ 故事骨架
→ 改编策略
→ 分集大纲
→【确认门 L2】
→ 全部分集剧本
→ 监督 Agent 审核并自动修正
→【确认门 L3】
→ 导演规划
→ 镜头级文字分镜
→ 项目级人物/场景/道具提示词
→ 完成
```

导入小说时：

- 识别章节；
- 展示解析预览；
- 用户确认后写入；
- 按章节提取事件；
- 不要求重写原文才能改编。

生成小说时：

- 总纲、卷纲和章纲允许一次批量生成；
- 正文一次只能选择 1–5 章；
- 每章单独保存与记录状态；
- 非连续的 1–5 章也允许，但每章生成时必须读取其必要前置上下文；
- 缺少必要前章时，Agent 必须提示连续性风险，不得伪造前文事实。

## 7. 项目创作参数

统筹 Agent 在进入正式生成前必须确认缺失参数。项目参数至少包括：

- 模式：短故事/长篇；
- 来源：创意/导入；
- 项目标题；
- 主类型；
- 辅助类型；
- 载体：竖屏微短剧、横屏短剧、漫剧、普通影视剧本等；
- 目标受众；
- 总集数；
- 单集时长；
- 小说目标规模：短故事字数，或长篇卷数/章数/单章目标字数；
- 改编章节范围；
- 风格定位；
- 付费/钩子策略（用户需要时）；
- 内容限制和不可改变项。

缺失关键参数时，统筹 Agent 应自然追问；不得用隐藏默认值替用户做重大创作决定。用户明确要求推荐时，可以读取现有创意或原文后提供推荐配置，再等待确认。

## 8. 多 Agent 设计

### 8.1 Agent 列表

| Agent Key | 前端身份 | 职责 | 可写成果 |
| --- | --- | --- | --- |
| `orchestrator` | 统筹 | 理解意图、追问参数、判断阶段、调度、汇总、等待确认 | 对话、Run 计划，不直接写正文 |
| `novel_planner` | 小说策划 | 定位、世界观、人物、关系、短故事大纲、总纲、卷纲、章纲 | 相应策划成果 |
| `novel_writer` | 小说作者 | 完整短故事或每次 1–5 章小说正文 | 短故事、章节正文 |
| `chapter_analyst` | 故事分析 | 章节事件、人物状态、关系变化、时间线、伏笔与回收 | 章节事件索引 |
| `story_skeleton` | 改编策划 | 故事骨架、幕结构、冲突、反转、爽点、钩子 | 故事骨架 |
| `adaptation_planner` | 改编策划 | 原著取舍、章节映射、节奏、分集规划 | 改编策略、分集大纲 |
| `script_writer` | 编剧 | 生成完整分集剧本 | 分集剧本 |
| `script_supervisor` | 编辑/监督 | 审核、自动修正、复核和报告 | 修订版本、审核报告 |
| `director_planner` | 导演 | 文字视听规划、场面调度、镜头密度和连续性原则 | 导演规划 |
| `storyboard_writer` | 分镜师 | 将确认剧本拆成镜头级文字分镜 | 分镜镜头 |
| `asset_prompt_writer` | 设定师 | 提取并去重人物、场景、道具，形成基准提示词和变体 | 项目级提示词资产 |

### 8.2 三层关系

```text
决策层：orchestrator
    ↓ dispatch_agent
执行层：各专项 Agent
    ↓ 请求审核
监督层：script_supervisor（剧本）或对应阶段质量规则
    ↓ 保存/退回/列出重大问题
决策层汇总给用户
```

统筹 Agent 不读取不必要的完整长篇，也不代替失败的专项 Agent 写作。专项 Agent 失败时，必须记录失败项并由统筹向用户说明，不得静默切换成另一种不受控实现。

### 8.3 上下文装配

每次专项调用只装配必要上下文：

```text
Agent 基础指令
+ 当前阶段核心 Script Domain Skill
+ 用户已选题材 Skill
+ 用户已选载体 Skill
+ 用户已选专项 Skill
+ 项目参数
+ 已确认上游成果
+ 当前任务涉及的章/集/场景
+ 必要的相邻摘要或事件索引
+ 可调用 Tool Schema
```

禁止：

- 把整本数百章小说无界塞入单次调用；
- 把其他用户或其他学校内容带入上下文；
- 把内部提示词、模型理由或思维链写入作品；
- 把未确认草稿当作正式事实继续扩散。

## 9. Script Domain Skill 设计

### 9.1 与普通平台 Skill 的边界

本模块的核心流程 Skill 是“Script Domain Skill”，属于剧本运行时的受控内部配置，不等同于用户在通用 Agent 中任意选择的普通 Skill。

规则：

- 核心阶段 Skill 由当前 Agent 固定绑定；
- 题材、载体和专项 Skill 必须由用户在项目配置或本轮对话中明确选择；
- 管理员只控制可用范围、默认推荐和版本，不能替用户偷偷启用普通 Skill；
- 不向剧本 Agent 暴露图片、视频、音频 Skill。

### 9.2 Skill 分类

核心流程：

```text
统筹决策
小说策划
小说章节写作
章节事件提取
故事骨架
改编策略
分集剧本
剧本监督
导演规划
文字分镜
资产提示词
```

题材首批：

```text
都市爽文
重生复仇
甜宠言情
都市职场
悬疑惊悚
古风仙侠
热血动作
科幻末世
家庭伦理
喜剧
成长
历史史诗
恐怖灵异
心理剧情
```

载体：

```text
短篇小说
长篇网文
竖屏微短剧
横屏短剧
漫剧
普通影视剧本
```

专项：

```text
开场黄金 30 秒
单集结尾钩子
爽点设计
高级反转
付费卡点
人物弧光
对白压缩
潜台词
场景可视化
连续性检查
镜头拆分
资产一致性
```

### 9.3 Skill 内容与版本

每个 Skill 版本保存：

- 名称与描述；
- 分类；
- 完整 Markdown 指令；
- 适用 Agent；
- 输入约束；
- 输出契约；
- 质量检查清单；
- 启用状态；
- 版本号；
- 创建人和时间；
- 来源与许可证备注；
- 内容哈希。

运行时记录实际使用的 Skill 版本快照。管理员修改后只影响新 Run，不改变历史 Run 的解释与回放。

## 10. Tool 设计

### 10.1 安全边界

- Tool 只接收业务参数；
- `schoolId`、`ownerUserId`、`projectId`、权限和执行档案由服务端上下文注入；
- 模型不能指定任意用户、学校或数据库表；
- Tool 不接受 SQL、脚本、文件系统绝对路径或任意 URL；
- 所有写 Tool 都检查当前版本和阶段状态；
- 所有写入都创建版本或可审计修订；
- 本模块不存在任何媒体生成 Tool。

### 10.2 只读 Tool

```text
read_project
read_stage_status
read_story_bible
read_characters
read_relationships
read_novel_outline
read_volume_outline
list_chapters
read_chapters
read_chapter_events
read_story_skeleton
read_adaptation_strategy
list_episodes
read_episode_outline
read_episode_script
read_review_report
read_director_plan
read_storyboard
read_asset_prompts
find_script_block
grep_script
```

### 10.3 写入 Tool

```text
save_project_parameters
save_creative_positioning
save_world_building
upsert_character
upsert_relationship
save_short_story_outline
save_short_story
save_novel_outline
save_volume_outline
save_chapter_outlines
save_chapter
save_chapter_events
save_story_skeleton
save_adaptation_strategy
save_episode_outlines
save_episode_script
save_review_revision
save_review_report
save_director_plan
save_storyboard_shots
upsert_asset_prompt
edit_script_blocks
```

### 10.4 流程 Tool

```text
dispatch_agent
report_progress
request_stage_confirmation
mark_item_failed
retry_failed_items
stop_run
```

`dispatch_agent` 只能由统筹 Agent 调用，并且只允许调度后台已启用且当前阶段允许的 Agent。

## 11. 后台真实配置中心

后台“无限练习”新增“剧本 Agent”独立配置区，至少包含五个页签。

### 11.1 运行总览

显示真实数据：

- 模块启用状态；
- 当前默认统筹模型；
- 可用 Agent 数；
- 可用 Skill 数；
- Tool 可用性；
- 最近完整闭环测试；
- 最近失败层级和脱敏原因；
- PostgreSQL 状态；
- SSE 状态；
- 运行中的 Run 数；
- 最近模型、渠道与 Token 使用。

不能仅根据“字段已填写”显示可用。

### 11.2 Agent 配置

每个 Agent 独立配置：

- 是否启用；
- 主逻辑模型；
- 可选指定渠道绑定；
- 备用逻辑模型；
- 温度；
- 思考模式；
- 输出长度策略；
- 核心 Skill；
- 允许的题材/载体/专项 Skill；
- Tool 白名单；
- 自动审核；
- 自动修正；
- 超时；
- 并发；
- 批量调度参数；
- 配置版本。

可选模型必须满足：

```text
enabled
+ capability = text
+ 渠道 purpose = open-source-practice
+ 渠道有效
+ 绑定有效
```

用户前台不需要选择模型，后台 Agent 配置决定真实执行模型。

### 11.3 Skill 管理

采用树形浏览和编辑体验：

- 分类树；
- Markdown 预览；
- 编辑并保存新版本；
- 启用/停用；
- 恢复历史版本；
- 测试；
- 查看绑定 Agent；
- 来源/许可证标记。

Skill 存 PostgreSQL，不依赖服务器本地可变文件。内置 Skill 可由代码种子初始化，但管理员编辑后生成数据库新版本。

### 11.4 Tool 管理

展示：

- Tool 名称；
- 读/写/流程类型；
- 参数摘要；
- 允许 Agent；
- 启用状态；
- 最近调用成功率和错误；
- 影响的数据类型。

管理员只能启停和绑定，不能将 Tool 改造成任意 SQL 或脚本执行器。

### 11.5 联调测试

最小真实闭环：

```text
创建隔离测试项目
→ 输入测试创意
→ 统筹 Agent 流式响应
→ 调度小说策划 Agent
→ 加载真实 Skill 版本
→ 调用真实保存 Tool
→ PostgreSQL 写入测试成果
→ SSE 返回 artifact_saved
→ 测试预览读取同一成果
→ 清理隔离测试数据
```

报告必须显示：

- 实际 Agent；
- 实际逻辑模型和上游模型；
- 实际渠道；
- Skill 版本；
- Tool 调用；
- 首字响应时间；
- 总耗时；
- SSE 事件数量；
- 数据库写入结果；
- 失败层级；
- 脱敏错误摘要。

后台 GET/PATCH 必须使用新鲜配置读取并刷新对应缓存；保存后下一次 Run 立即生效。

## 12. PostgreSQL 数据模型

### 12.1 迁移原则

- 保留现有 `practice_script_*` 表和历史数据；
- 使用有序、幂等迁移升级；
- 已有表补列先 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`；
- 再补约束和索引；
- 不依赖 `CREATE TABLE IF NOT EXISTS` 改变旧表；
- 不在同一次上线删除旧字段；
- 所有用户内容必须同时受 `school_id + owner_user_id + project_id` 约束；
- Repository 使用参数化定向查询，不整表拉取后在 Node.js 过滤。

### 12.2 复用并扩展现有表

现有：

```text
practice_script_projects
practice_script_versions
practice_script_entities
practice_script_stages
practice_script_agent_operations
```

`practice_script_projects` 至少扩展：

```text
school_id
mode                    -- short_story | long_novel
source_type             -- idea | import_novel | import_script
carrier_type
main_genre
secondary_genres jsonb
project_parameters jsonb
current_stage
status
story_revision
```

`practice_script_entities` 继续承载人物和关系，但实体类型扩展为受控枚举语义：

```text
character
character_relation
world_rule
location
prop
```

`practice_script_stages` 保存阶段级当前状态和当前草稿/确认版本指针，不作为长正文或大量镜头的唯一存储。

### 12.3 新增内容表

#### `practice_script_artifacts`

保存中小型版本化成果：

```text
id
school_id
owner_user_id
project_id
artifact_type
artifact_key
status
version
content_json
content_text
parent_artifact_id
source_run_id
created_at
updated_at
```

适用：定位、世界观、总纲、卷纲、故事骨架、改编策略、导演规划、审核报告。

#### `practice_script_chapters`

```text
id
school_id
owner_user_id
project_id
volume_index
chapter_index
chapter_title
outline_json
content_text
summary_text
status
version
source_run_id
error_code
error_message
created_at
updated_at
```

唯一性以项目和章节序号为边界。每章独立状态，支持只重试失败章。

#### `practice_script_chapter_events`

```text
id
school_id
owner_user_id
project_id
chapter_id
event_index
event_type
content
character_ids jsonb
location_ids jsonb
prop_ids jsonb
timeline_key
foreshadow_key
metadata jsonb
source_run_id
```

#### `practice_script_episodes`

```text
id
school_id
owner_user_id
project_id
episode_number
title
source_chapter_ids jsonb
outline_json
script_document_json
status
review_status
version
source_run_id
error_code
error_message
created_at
updated_at
```

每集独立保存，但用户阶段统一确认。

#### `practice_script_shots`

```text
id
school_id
owner_user_id
project_id
episode_id
scene_id
shot_number
visual_description
shot_size
camera_angle
composition
camera_movement
character_ids jsonb
action_text
emotion_text
dialogue_text
narration_text
sound_note
duration_seconds
continuity_note
character_asset_ids jsonb
location_asset_id
prop_asset_ids jsonb
status
version
source_run_id
error_code
error_message
```

#### `practice_script_prompt_assets`

```text
id
school_id
owner_user_id
project_id
asset_type             -- character | location | prop
canonical_name
aliases jsonb
base_description
base_prompt
variants jsonb
status
version
source_run_id
created_at
updated_at
```

#### `practice_script_asset_occurrences`

记录资产出现在哪一章、一集、一场和一个镜头，避免在主表塞无界数组。

```text
asset_id
project_id
chapter_id nullable
episode_id nullable
scene_id nullable
shot_id nullable
context_note nullable
```

### 12.4 Agent 配置和 Skill 表

#### `practice_script_agent_profiles`

```text
agent_key
name
enabled
primary_logical_model_id
fallback_logical_model_id
endpoint_id nullable
temperature nullable
reasoning_mode
output_policy jsonb
timeout_config jsonb
batch_config jsonb
tool_allowlist jsonb
skill_bindings jsonb
version
updated_by
updated_at
```

#### `practice_script_skills`

保存 Skill 稳定身份和分类。

#### `practice_script_skill_versions`

保存不可变 Markdown 内容、版本、哈希、来源和许可证备注。

### 12.5 对话、Run 和事件表

#### `practice_script_chat_sessions`

```text
id
school_id
owner_user_id
project_id
title
status
created_at
updated_at
deleted_at
```

#### `practice_script_chat_messages`

```text
id
session_id
project_id
role                    -- user | assistant
agent_key nullable
public_content
source_run_id nullable
created_at
```

只保存公开对话内容；内部提示词、思维链和密钥不得进入此表。

#### `practice_script_runs`

```text
id
school_id
owner_user_id
project_id
chat_session_id nullable
run_type
stage_key
status                  -- planning | running | waiting_confirmation | partial_failed | success | failed | stopped
client_request_id
config_snapshot jsonb
progress_json jsonb
started_at
completed_at
last_event_sequence
error_code
error_message
```

#### `practice_script_run_items`

```text
id
run_id
item_type               -- chapter | episode | scene | shot_batch | asset
item_key
status                  -- queued | running | success | failed | stopped
attempt_no
artifact_id nullable
error_code
error_message
started_at
completed_at
```

唯一约束保证同一 Run、同一 item、同一尝试不会重复创建。

#### `practice_script_run_events`

```text
id
run_id
sequence
public_event_type
public_payload jsonb
created_at
```

`run_id + sequence` 唯一，用于断线续传和刷新恢复。

#### `practice_script_confirmations`

保存确认门、确认的成果版本、用户和时间。

## 13. SSE 事件协议

### 13.1 连接模式

采用稳定 Run 两步模式：

```text
POST 创建 Run 或发送对话
→ 返回 runId
GET /runs/{runId}/events
→ text/event-stream
```

SSE 支持：

- `Last-Event-ID`；
- `afterSequence`；
- 心跳；
- 从数据库回放缺失事件；
- 切换实例后继续读取；
- 断线不重建模型任务。

### 13.2 通用事件信封

```ts
type ScriptRunEvent = {
  runId: string;
  sequence: number;
  type: ScriptRunEventType;
  occurredAt: string;
  data: Record<string, unknown>;
};
```

公开事件：

```text
run_started
agent_started
assistant_delta
tool_started
tool_progress
tool_completed
artifact_delta
artifact_saved
item_started
item_progress
item_completed
item_failed
agent_completed
stage_waiting_confirmation
run_partial_failed
run_completed
run_stopped
error
heartbeat
```

### 13.3 持久化优先

严格顺序：

```text
Tool 校验权限和版本
→ PostgreSQL 事务写入成果
→ 写入 run_event: artifact_saved
→ 提交事务
→ SSE 推送 artifact_saved
→ 前端按 artifactId 应用增量或重新读取
```

禁止先告诉前端“保存成功”再尝试写数据库。

`artifact_delta` 只表示正在生成的临时公开预览，不表示持久化成功。前端应明确显示“生成中”，刷新后以数据库已保存内容和事件回放为准。

### 13.4 前端事件反应

| 事件 | 右侧对话 | 中间成果 | 左侧目录 |
| --- | --- | --- | --- |
| `agent_started` | 新增对应 Agent 状态 | 显示生成状态 | 节点转生成中 |
| `assistant_delta` | 追加 Agent 公开回复 | 不写作品 | 不变 |
| `artifact_delta` | 显示“正在写入”摘要 | 追加临时预览 | 节点生成中 |
| `artifact_saved` | 显示已保存 | 用真实成果替换预览 | 更新完成数 |
| `item_failed` | 显示具体失败项 | 对应项保留旧版本 | 增加失败数 |
| `stage_waiting_confirmation` | 显示确认说明 | 展示待确认版本 | 节点待确认 |
| `run_completed` | 完成总结 | 固化最终内容 | 更新阶段状态 |

## 14. API 设计

所有普通 API 沿用 `{ code, data, msg }`。SSE 使用第 13 节事件信封。

### 14.1 项目与成果

```text
GET    /api/practice/scripts
POST   /api/practice/scripts
GET    /api/practice/scripts/{projectId}
PATCH  /api/practice/scripts/{projectId}
DELETE /api/practice/scripts/{projectId}
GET    /api/practice/scripts/{projectId}/tree
GET    /api/practice/scripts/{projectId}/artifacts/{artifactType}/{artifactKey}
PATCH  /api/practice/scripts/{projectId}/artifacts/{artifactId}
```

### 14.2 小说、剧本、分镜与提示词

```text
GET  /api/practice/scripts/{projectId}/chapters
GET  /api/practice/scripts/{projectId}/chapters/{chapterId}
PATCH /api/practice/scripts/{projectId}/chapters/{chapterId}
GET  /api/practice/scripts/{projectId}/episodes
GET  /api/practice/scripts/{projectId}/episodes/{episodeId}
PATCH /api/practice/scripts/{projectId}/episodes/{episodeId}
GET  /api/practice/scripts/{projectId}/episodes/{episodeId}/shots
GET  /api/practice/scripts/{projectId}/prompt-assets
PATCH /api/practice/scripts/{projectId}/prompt-assets/{assetId}
```

### 14.3 对话与 Run

```text
GET    /api/practice/scripts/{projectId}/chat-sessions
POST   /api/practice/scripts/{projectId}/chat-sessions
PATCH  /api/practice/scripts/{projectId}/chat-sessions/{sessionId}
DELETE /api/practice/scripts/{projectId}/chat-sessions/{sessionId}
GET    /api/practice/scripts/{projectId}/chat-sessions/{sessionId}/messages
POST   /api/practice/scripts/{projectId}/chat-sessions/{sessionId}/messages
POST   /api/practice/scripts/{projectId}/runs
GET    /api/practice/scripts/{projectId}/runs/{runId}
GET    /api/practice/scripts/{projectId}/runs/{runId}/events
POST   /api/practice/scripts/{projectId}/runs/{runId}/stop
POST   /api/practice/scripts/{projectId}/runs/{runId}/retry-failed
POST   /api/practice/scripts/{projectId}/confirmations
```

发送对话可以在同一事务中创建用户消息与 Run，并返回稳定 `runId`。

### 14.4 管理后台

```text
GET   /api/admin/practice-script/overview
GET   /api/admin/practice-script/agents
PATCH /api/admin/practice-script/agents/{agentKey}
POST  /api/admin/practice-script/agents/{agentKey}/test
GET   /api/admin/practice-script/skills
POST  /api/admin/practice-script/skills
GET   /api/admin/practice-script/skills/{skillId}/versions
POST  /api/admin/practice-script/skills/{skillId}/versions
POST  /api/admin/practice-script/skills/{skillId}/test
GET   /api/admin/practice-script/tools
PATCH /api/admin/practice-script/tools/{toolName}
POST  /api/admin/practice-script/integration-test
```

Route Handler 只做请求、Session、职责权限、Service 调用和响应映射。

## 15. 批量生成与失败重试

### 15.1 章节

- 用户一次提交 1–5 章；
- 每章对应独立 `run_item`；
- 每章写入成功即持久化；
- 事件索引可在该章保存后继续生成；
- 一章失败不回滚其他成功章；
- 重试只创建失败章的新 attempt；
- 用户显式重新生成成功章时，创建新版本而不是覆盖历史。

### 15.2 分集剧本

用户可以一次发起全部分集：

```text
创建一个 episode_scripts Run
→ 为每集创建 run_item
→ 调度器按后台配置和模型能力执行
→ 每集完成立即保存
→ 前端只显示一个总进度
```

用户不逐集保存和确认。系统可以内部逐集持久化，但阶段确认只有一次。

并发、批次大小和上下文限制来自：

- 管理员 Agent 配置；
- 当前模型能力；
- 供应商公开约束；
- 项目已有资源保护契约。

不得在业务代码中新增拍脑袋的固定轮询、重试或输出上限。

### 15.3 监督审核

```text
读取确认的分集大纲和已生成剧本
→ 对每集/关联集批次审核
→ 明显问题生成修订版本
→ 再次复核
→ 重大变更进入待用户决定
→ 汇总审核报告
→ 等待统一确认
```

审核自动修正范围：

- 格式；
- 错别字和明显表达问题；
- 人物称谓；
- 已确认设定下的连续性；
- 台词过长；
- 场景衔接；
- 明显节奏缺口；
- 开头/结尾钩子缺失但不改变主线的补强。

禁止自动修改：

- 核心人物身份；
- 核心人物最终命运；
- 故事主线；
- 最终结局；
- 已确认重大反转；
- 用户标记为不可改变的内容。

自动修正前保留版本，失败只重试失败审核项。

### 15.4 文字分镜

按集、场景或服务端配置的有界项目拆分执行。每条镜头单独保存，但可以按场景批量事务写入。

失败粒度至少到场景；已保存镜头不因其他场景失败而删除。

## 16. 镜头级文字分镜契约

每条镜头包含：

```ts
type PracticeScriptShot = {
  id: string;
  episodeId: string;
  sceneId: string;
  shotNumber: number;
  visualDescription: string;
  shotSize: string;
  cameraAngle: string;
  composition: string;
  cameraMovement: string;
  characterIds: string[];
  action: string;
  emotion: string;
  dialogue?: string;
  narration?: string;
  soundNote?: string;
  durationSeconds: number;
  continuityNote?: string;
  characterAssetIds: string[];
  locationAssetId?: string;
  propAssetIds: string[];
};
```

约束：

- 一条镜头一行；
- 顺序稳定；
- 镜头总时长与单集目标时长可比较；
- 对白与旁白来源可追溯到剧本块；
- 人物、场景、道具必须引用项目稳定 ID；
- 不包含任何生成图片、视频或音频的任务字段；
- `soundNote` 只是文字设计说明。

## 17. 项目级人物、场景、道具提示词

### 17.1 去重和稳定身份

- 同一实体使用稳定 ID；
- 规范名与别名分离；
- 同名不同实体不合并；
- 同一实体跨集只保留一个基准设定；
- 服装、年龄、伤势、季节、损坏状态等变化保存为变体；
- 增量新增剧本时更新出现位置，不重建全部资产。

### 17.2 人物提示词

至少包含：

- 姓名和别名；
- 性别、年龄段、体态；
- 五官、发型、妆容；
- 基准服装和配饰；
- 气质与典型表情；
- 身份与人物小传摘要；
- 不可变化特征；
- 阶段变体；
- 出现章、集、场景和镜头。

### 17.3 场景提示词

至少包含：

- 地点名与内外景；
- 时代、地域和空间结构；
- 陈设、材质、色彩；
- 光线、天气、时间；
- 氛围；
- 不可变化结构；
- 状态变体；
- 出现位置。

### 17.4 道具提示词

至少包含：

- 名称与类型；
- 材质、颜色、形状、尺寸；
- 磨损、特殊标记；
- 剧情作用；
- 所属人物；
- 状态变体；
- 出现位置。

一期到保存这些文字提示词即结束。

## 18. 前后端一致性与恢复

### 18.1 单一事实源

- PostgreSQL 是正式成果、状态和事件的唯一事实源；
- Zustand 只保存页面即时状态；
- SSE 只传输事件，不作为持久化事实；
- 前端不得凭本地计时模拟 Agent 进度；
- 后台配置状态不得凭表单值模拟可用。

### 18.2 刷新与离开恢复

进入项目时：

```text
读取项目树和当前成果
→ 查找最近 planning/running/waiting_confirmation/partial_failed Run
→ 从 lastEventSequence 连接 SSE
→ 回放缺失事件
→ 恢复右侧会话和中间成果
```

离开页面不取消 Run，除非用户点击停止。停止后保留已保存成果，未提交的临时 delta 不冒充成功内容。

### 18.3 幂等

- 每次用户动作生成稳定 `clientRequestId`；
- 同一请求重复提交返回同一 Run；
- SSE 重连不创建新 Run；
- 重试失败项沿用原 Run 语义并创建新 attempt；
- 成功项不重复调用模型；
- Tool 写入使用成果版本和数据库唯一约束防重复。

## 19. 权限、安全与审计

- 仅当前学校有效老师/学生可访问无限练习；
- 所有查询和写入按 `schoolId + ownerUserId + projectId` 定向；
- 撤销学校身份后，项目、对话、Run、事件、章节、剧本、分镜和提示词全部不可再访问；
- 管理后台配置使用当前管理员 Session 和 `upstream.manage` 或明确的新职责权限；
- 不在前端返回 API Key；
- 不记录思维链；
- 日志仅记录公开摘要、配置版本、模型、渠道、Tool、Token、耗时和错误；
- 导入内容执行类型、大小和解析校验；
- Skill 编辑内容不得获得 SQL、文件系统或任意网络执行能力；
- Tool 输入使用 Zod/项目既有 schema 校验；
- 公开错误不能泄露渠道密钥、内部 URL、系统提示词和数据库细节。

## 20. 现有代码迁移策略

当前代码保留价值：

- `practice_script_projects` 等现有表；
- 现有 Script Repository 基础；
- Fountain/FDX/文本格式能力；
- 现有项目列表和版本概念；
- `resolveConfiguredScriptModel` 的 `open-source-practice` 解析方向；
- 现有 Session 和 API 响应规范。

需要替换：

- 固定五个阶段按钮；
- 单次同步 `generateStage`；
- 原始 JSON 结果展示；
- 单块 `TextArea` 剧本编辑器；
- 只能选择一个块的“生成修改建议”；
- 只有 Skill ID、没有真实 Skill 内容装配的实现；
- 只有一个默认模型控制全部剧本工作的配置；
- 没有会话、Run、事件、恢复和批量 item 的执行方式。

迁移期间旧 API 可以短期作为开发过渡，但未上线旧契约不长期双写。新工作区启用后应统一使用新 Run/SSE/成果协议。

## 21. 实施分期建议

后续实施计划应拆成可独立验收的阶段，不一次粗暴改完。

### Phase 0：保护与迁移基础

- 新表和幂等迁移；
- tenant scope；
- 旧剧本数据读取和迁移映射；
- 不改变用户现有数据。

### Phase 1：真实后台配置

- Agent Profile；
- Skill 版本；
- Tool 白名单；
- 模型/渠道真实校验；
- 最小闭环联调测试。

### Phase 2：Run、SSE、对话与恢复

- Run/Item/Event；
- 对话会话；
- 事件回放；
- 停止与幂等；
- 三栏工作区骨架。

### Phase 3：短故事闭环

- 创意到定位、世界观、人物和大纲；
- 确认门；
- 完整小说体短故事；
- 改编策略和分集大纲。

### Phase 4：长篇小说闭环

- 导入；
- 总纲、卷纲和章纲；
- 1–5 章正文；
- 事件索引；
- 章节范围改编。

### Phase 5：分集剧本与专业编辑器

- 批量分集；
- 自动保存；
- 失败项重试；
- 专业剧本块；
- 版本与恢复。

### Phase 6：监督审核

- 审核；
- 自动修正；
- 重大问题确认；
- 统一报告。

### Phase 7：文字分镜和提示词资产

- 导演规划；
- 镜头级分镜；
- 项目级人物/场景/道具提示词；
- 到此终止，不接媒体工作流。

## 22. 验收标准

### 22.1 后台真实可用

1. 管理员给每个 Agent 配置真实文本逻辑模型和 Skill；
2. 点击联调测试；
3. 能看到真实 SSE；
4. 保存 Tool 真实写入隔离测试成果；
5. 预览读取同一成果；
6. 配置修改后下一次调用立即使用新版本；
7. 失败时明确显示模型、渠道、Agent、Skill、Tool 或数据库哪层失败。

### 22.2 短故事端到端

```text
输入创意
→ Agent 追问并确认参数
→ 中间区流式出现定位、世界观、人物和大纲
→ 用户确认
→ 完整小说体短故事生成并保存
→ 用户确认
→ 故事骨架、改编策略、分集大纲
→ 用户确认
→ 分集剧本全部生成
→ 监督审核并自动修正
→ 用户统一确认
→ 文字分镜
→ 人物/场景/道具提示词
```

刷新或离开后全部恢复。

### 22.3 长篇端到端

- 可以导入长篇并正确分章；
- 可以从创意生成总纲、卷纲和全部章纲；
- 一次选择 1–5 章生成；
- 每章独立保存；
- 每章事件索引可读取；
- 选择章节范围后完成改编；
- 大量剧集不要求逐集点击保存；
- 失败项单独重试，成功项不重跑。

### 22.4 前端一致性

- Agent 输出是逐字流式；
- 中间成果是增量预览并在保存后固化；
- 左侧状态来自真实数据；
- 不显示原始 JSON；
- 不模拟进度；
- 停止后已保存成果保留；
- SSE 断开后使用同一 Run 恢复；
- 后台关闭 Agent/Skill/Tool 后，前端下一次执行真实受限并显示可理解原因。

### 22.5 阉割边界

完成全链路后核对：

- 没有创建图片任务；
- 没有创建视频任务；
- 没有创建音频任务；
- 没有调用 RunningHub 媒体工作流；
- 没有写商业积分流水；
- 没有迁移 ToonFlow 的资产生产和成片节点；
- 最终结果只到文字分镜和文字提示词。

## 23. 后续 Agent 开发入口

任何后续 Agent 在开始实现前必须按顺序执行：

```text
1. 阅读本文
2. 阅读新实施计划（尚待基于本文编写）
3. 核对 git status，保护用户未提交改动
4. 只执行当前 Phase
5. 完成相关测试与真实浏览器/SSE 闭环
6. 不重复已经有有效证据的测试
7. 不越过本文媒体阉割边界
```

如果实现与本文冲突，以用户新消息为最高优先级；否则以本文为唯一剧本重做设计依据。
