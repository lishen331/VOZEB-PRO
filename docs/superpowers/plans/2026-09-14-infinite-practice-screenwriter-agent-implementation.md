# 无限练习剧本 Agent 改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不实现个人长期记忆、不触发媒体任务的前提下，把无限练习剧本模块改造成持续对话、严格推进、真实流式、可编辑、可恢复和可导出的剧本 Agent。

**Architecture:** 保留 Next.js Route Handler + TypeScript + PostgreSQL + 现有 `open-source-practice` 执行档案。以项目唯一主 Chat Session、稳定 Run、公开 SSE 事件、结构化 Artifact 和版本化正式成果为边界；用户只面对剧本 Agent，内部使用统筹/执行/监督配置。

**Tech Stack:** Next.js App Router、React、TypeScript、Ant Design、Tailwind、Vitest、Playwright、PostgreSQL、现有文本模型运行时和 SSE。

## Global Constraints

- 只改无限练习/剧本模块，不改商业闭源模块和 RunningHub 媒体工作流。
- 执行档案固定为 `open-source-practice`，不得创建图片、视频、音频、配音或成片任务。
- 用户不选择 Skill；服务端按项目参数和自然语言自动组合。
- 本期不实现跨项目/跨会话个人长期记忆。
- 重要节点人工确认，节点内部自动执行；服务端状态机阻止跳步。
- 批量失败只重试失败章、集、场景或镜头。
- 不展示私有思维链、内部提示词、Skill 原文、模型选择理由或原始 JSON。
- 430px 不属于本期验收范围。
- 每个任务先写失败测试，再实现最小代码；每次修改运行相关测试、类型检查和格式检查。
- 保留工作区其他 Agent 的未提交修改，不回滚、不覆盖、不混入无关提交。

## 文件边界

- `web/src/lib/server/script-agent-domain.ts`：阶段、Run、事件和运行时约束。
- `web/src/lib/server/script-agent-skills.ts`：Skill 定义、自动识别、组合，不暴露给用户。
- `web/src/lib/server/script-agent-profiles.ts`：Agent 配置、模型绑定和后台解析。
- `web/src/lib/server/script-agent-executor.ts`：模型调用、公开增量、结构化校验和成果物化。
- `web/src/lib/server/script-agent-run-service.ts`：幂等、顺序、停止、恢复和失败项重试。
- `web/src/lib/server/database/script-agent-repository.ts`：项目级 Artifact、Session、消息、Run、事件、确认。
- `web/src/lib/server/database/script-practice-repository.ts`：剧本文档、项目和版本。
- `web/src/lib/server/script-practice-format.ts`：剧本块、Fountain/FDX/文本格式。
- `web/src/lib/server/script-agent-tools-v2.ts`：受控读写工具和 schema 校验。
- `web/src/app/api/practice/scripts/`：项目、会话、Run、Tree、成果、确认、编辑、导入导出接口。
- `web/src/services/api/practice-scripts.ts`：类型化 API/SSE 客户端。
- `web/src/app/(user)/practice/scripts/`：三栏工作台及页面私有组件。
- `web/src/app/api/admin/practice-script/`：剧本 Agent 后台配置和联调。
- `VOZEB-PRO-接口索引.md`、`VOZEB-PRO-开发地图.md`、`docs/backend-database.md`：结构变化时同步更新。

---

## Task 1：项目级剧本与主对话 CRUD

**Files:** `script-practice-service.ts`、两个 repository、项目/Session API、`script-practice-workspace.tsx`、对应测试。

**Produces:** 新建剧本=项目+唯一主 Session+首 Run；删除真实级联；项目切换不串对话。

- [ ] 写失败测试：新建剧本建立唯一主 Session，首 Run 绑定该 Session。
- [ ] 写失败测试：同项目发送消息复用主 Session；无 Session 时只创建一次。
- [ ] 写失败测试：跨用户/学校不能读、删、导出项目和会话。
- [ ] 写失败测试：删除后消息、Run、事件、Artifact、版本和章节成果均不可查询。
- [ ] 将所有“新建项目”文案改为“新建剧本”；删除采用二次确认和删除中状态。
- [ ] 删除后清空当前状态，有其他项目则安全切换。
- [ ] 暂不实现重命名和多 Session 方案。
- [ ] 跑 project/session/delete/workspace 定向测试并提交独立 commit。

## Task 2：统一 Agent 首轮理解与自动 Skill

**Files:** `script-agent-skills.ts`、`script-agent-executor.ts`、`script-agent-profiles.ts`、chat Run route/service、对应测试。

**Produces:** 用户只对话；Agent 识别载体、目的、视角、同行、时长并必要时追问；确认后保存项目参数。

- [ ] 写失败测试：游乐园 Vlog 输入识别 Vlog、地点种草、第一人称、朋友和 180 秒。
- [ ] 写失败测试：已确认 TVC 不被本轮缺省文本改成 Vlog。
- [ ] 写失败测试：明确改第三人称后下次 Run 使用第三人称。
- [ ] 写失败测试：用户传入 skillIds 不会越权启用普通 Skill。
- [ ] 写失败测试：缺少方向性信息时返回公开追问而不是残缺剧本。
- [ ] 实现内部 `CreativeBrief` 与公开摘要分离；确认后才落项目配置。
- [ ] 将项目参数、本轮明确输入、推断和默认值按固定优先级合并。
- [ ] 补齐 Vlog/TVC/种草/视角/同行/三分钟 Skill 规则和版本快照。
- [ ] 跑 Skill/executor/chat 定向测试并提交独立 commit。

## Task 3：公开 SSE 与可读增量

**Files:** executor、run service、events route、API client、workspace、SSE 测试。

**Produces:** 首字节反馈、公开进度、正文逐段展示、JSON 清洗、断线重放。

- [ ] 写失败测试：创建 Run 后先收到 `run_started`、`progress` 和公开状态。
- [ ] 写失败测试：assistant_delta 只进入右栏，artifact_delta 只进入中栏。
- [ ] 写失败测试：半截 JSON、Markdown JSON 代码块不直接显示。
- [ ] 写失败测试：按 `runId:sequence` 去重并从 afterSequence 恢复。
- [ ] 写失败测试：刷新只恢复 planning/running/paused Run。
- [ ] 将模型原始结构化输出解析为公开对话/公开成果/结构化快照三层。
- [ ] 只有保存成功后发送 artifact_saved；不增加拍脑袋延迟、次数或输出上限。
- [ ] 跑 SSE/executor/workspace 测试并提交独立 commit。

## Task 4：短片质量和剧本/分镜格式

**Files:** Skill、executor、format、storyboard formatter、export route、质量测试。

**Produces:** 可拍摄、格式明确、≤180 秒的 Vlog/TVC 文字剧本和分镜。

- [ ] 写失败测试：缺钩子、目标、转折或结尾回收的结果被监督标记。
- [ ] 写失败测试：累计分镜时长超过项目目标拒绝保存。
- [ ] 写失败测试：Vlog 有场景标题、动作、角色、对白、V.O.、SFX 和转场。
- [ ] 写失败测试：TVC 有受众、卖点、行动号召和片尾信息。
- [ ] 细化起承转合规则和自然修辞规则，禁止空泛旁白、空镜堆叠和 JSON 正文。
- [ ] 标准化一镜一行字段和资产引用，导出不包含内部信息。
- [ ] 跑质量/格式/导出测试并提交独立 commit。

## Task 5：选区编辑建议和版本保护

**Files:** agent API、service、tools、workspace 私有组件、版本测试。

**Produces:** 重写/扩写/润色/冲突/连续性/格式检查均先提议，接受后新版本。

- [ ] 写失败测试：编辑操作只返回 proposal，不直接覆盖。
- [ ] 写失败测试：接受 proposal 产生新版本并记录 before/after。
- [ ] 写失败测试：过期 baseVersionId 返回冲突，不覆盖最新版本。
- [ ] 写失败测试：拒绝 proposal 不产生版本。
- [ ] 前端支持选中剧本块/分镜行、查看差异、接受/拒绝。
- [ ] 写入只接受稳定 block/shot ID，不按文本匹配。
- [ ] 后续镜头拆分/合并和锁定设定另列任务。
- [ ] 跑编辑/版本/并发测试并提交独立 commit。

## Task 6：历史、正式成果和导出一致性

**Files:** export route、repository/service、workspace renderers、API client、回归测试。

**Produces:** 页面=持久化=历史恢复=下载。

- [ ] 写失败测试：页面剧本与 text/Fountain/FDX 内容一致。
- [ ] 写失败测试：页面分镜与 Markdown/CSV 内容一致。
- [ ] 写失败测试：刷新恢复主 Session、公开消息、Artifact 和版本。
- [ ] 写失败测试：不存在的成果返回明确 404，不导出空文件。
- [ ] 明确 Artifact 快照与正式 Episode/Shot 的版本关联和事实来源。
- [ ] 导出只读已保存成果，不重新调用模型，不泄露内部 JSON。
- [ ] 跑历史/导出/删除残留测试并提交独立 commit。

## Task 7：后台真实配置隔离

**Files:** admin practice-script routes/components、seed、profiles、后台测试。

**Produces:** 后台模型/Agent/Skill/Tool 配置真实影响下一次 Run，且不影响商业模块。

- [ ] 写失败测试：仅允许 open-source-practice 文本模型。
- [ ] 写失败测试：Skill 禁用或 Agent 配置保存后立即影响下一次 Run。
- [ ] 写失败测试：密钥脱敏；Tool allowlist 真实生效。
- [ ] 写失败测试：联调只写练习成果，不写媒体任务、不扣商业积分。
- [ ] 实现不可变 Skill 版本、Agent 配置快照和真实 read-after-write。
- [ ] 跑后台 API、数据库和本地 fixture 测试并提交独立 commit。

## Task 8：三栏工作台收口

**Files:** workspace、页面私有组件、workflow state、组件和 Playwright 测试。

**Produces:** 一个剧本 Agent、严格目录、公开进度、项目 CRUD 和错误恢复。

- [ ] 写失败组件测试：用户看不到 Skill 选择器和内部 Agent 列表。
- [ ] 写失败组件测试：新建剧本、删除二次确认、空态、切换和历史恢复。
- [ ] 写失败组件测试：跳步被锁定、失败项可单独重试。
- [ ] 写失败组件测试：停止、重连、确认门、版本冲突和 JSON 清洗。
- [ ] 移除会形成第二套工作流的固定阶段按钮，保留当前步骤快捷动作但仍走服务端门禁。
- [ ] 桌面回归覆盖 1366px、1440px、1672px；不增加 430px 专项。
- [ ] 跑组件和桌面 Playwright 测试并提交独立 commit。

## Task 9：端到端验证、文档与交付

**Files:** 相关 e2e、接口索引、开发地图、数据库文档和验证记录。

- [ ] 使用账号 008 通过页面创建三分钟游乐园 Vlog；不直接以 API/数据库/模型调用代替验收。
- [ ] 完成理解→确认→故事→改编→剧本→审核→导演规划→分镜→下载。
- [ ] 验证多个剧本对话隔离、删除二次确认和删除后不可恢复。
- [ ] 验证断线恢复、失败项重试、无模型、非法结构、权限撤销和跨租户拒绝。
- [ ] 验证全流程没有媒体任务和商业积分扣除。
- [ ] 验证长篇导入、总纲/章纲、1–5 章和失败项重试。
- [ ] 运行 `format:check`、`typecheck`、`lint`、相关 `vitest --no-file-parallelism`、`build`、UTF-8 检查和 `git diff --check`。
- [ ] 从根目录运行更新/验证开发地图脚本；检查 status/diff，排除 output、env、凭据和并行改动。
- [ ] fetch/merge 当前 `origin/develop` 后再次更新并验证文档，再提交并推送 develop。
- [ ] 等 GitHub Actions、镜像部署和健康检查完成后再报告线上结论。

## 暂不安排

- 个人长期记忆、用户画像和记忆管理界面；
- 图片/视频/音频/配音/音乐/成片；
- RunningHub 和商业模块；
- 多人协作和实时光标。
