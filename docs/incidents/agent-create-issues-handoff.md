# 创作 Agent 问题分析与需求对齐（交接 Codex）

> 分析范围：`web/src/app/(user)/create/**`、`web/src/lib/server/agent-run-*`、`web/src/services/api/creative.ts`、`web/src/lib/server/agent-skills/**`。
> 日期：2026-09-05。作者：Claude（分析），落地：Codex。

## 0. 快速结论

你截图里遇到的现象，绝大多数**不是 bug，而是"智能模式（smartPlanning）下由 LLM 规划器自由决定产物类型"的预期行为 + UI 没有把"规划器实际决定了什么"透明地展示给你**，导致体感上"我要图片你给我视频"。

三个真正需要改的点：

1. **透明度（P0，体验问题）**：把规划器"选了哪个 Skill / 决定生成图片还是视频 / 为什么"展示出来，而不是笼统一句"正在挑选更合适的创作方式…"。这是你所有困惑的根源。
2. **重试/重新检查按钮缺失（P1，功能缺陷）**：图12 drama-lab 分镜工作台失败态没有重试入口。
3. **智能模式产物类型约束（P1，产品决策）**：需要产品决定"选了电商 Skill（image-only）时，智能模式是否还允许规划成视频"。当前允许，且没有任何约束。

---

## 1. Skill 到底有没有传上去？（图2/图3）

**结论：传上去了，链路完整，没有丢。** 你截图"发出去好像没带 skill"是错觉——Skill 被正确传递，只是 UI 没回显。

### 数据链路（已逐行核对）

| 阶段 | 文件:行 | 关键代码 |
|---|---|---|
| UI 选中 | `create/page.tsx:216` | `skillIds: selectedSkillId ? [selectedSkillId] : []` |
| 提交 hook | `create/use-create-agent.ts:506` | `skillIds: options?.skillIds \|\| []` |
| 请求归一化 | `lib/creative-runtime-contract.ts:182,195` | `skillIds` 去重、限长后进入 run request |
| 落库 | `lib/server/agent-run-store.ts:164` | `selectedSkillIds: input.skillIds` |
| 执行器读取 | `lib/server/agent-run-executor.ts:68` | `selectAgentSkills(settings, surface, claimed.selectedSkillIds)` |
| 注入规划器 | `lib/server/agent-run-surface-policy.ts:87` | `requestedSkillIds: run.selectedSkillIds \|\| []` |
| 注入产物提示词 | `lib/server/agent-run-execution.ts:228` | `执行以下已选 Skill 约束：\n${skillInstructions}` |

### 规划器系统提示词里的强约束（`agent-run-surface-policy.ts:47`）

> `requestedSkillIds 非空时必须使用且只使用这些技能；requestedSkillIds 为空时 skillIds 必须为空，不得自动选择任何普通 Skill。`

所以 Skill **确实生效**——图5 你能看到电商 Skill 的提示词，就是它生效的证据。

### 那"发出去没带"的错觉从哪来？

- 提交后 `create/page.tsx:222` 立刻 `setSelectedSkillId(undefined)` 清空了选中态，气泡里也不显示用过哪个 Skill。
- 进度条只有一句笼统的"正在挑选更合适的创作方式…"（`creative.ts:222`），没告诉你选了电商 Skill。

→ **这属于第 4 节的透明度问题，不是链路 bug。**

---

## 2. 为什么"我要图片，它生成了视频"？（图1/图4/图8/图9）

**结论：智能模式（smartPlanning=on）下，产物类型完全由 LLM 规划器决定，不受你选的 Skill 是"图片技能"约束。**

### 机制

- 智能模式走 LLM 规划路径（`agent-run-executor.ts:99` 起），规划器输出 `deliverables[].type ∈ {image, video, audio, text}`，**自由决定**。
- 电商 Skill 是 image-only（`agent-skills/ecommerce-image.ts:9` `workspaces: ["image","canvas"]`、`action: "generate"`），但 `workspaces` 只是"可在哪些工作台出现"的过滤器（`agent-run-surface-policy.ts:11-13`），**不是"该 Skill 只能产图片"的强约束**。
- `normalizeTasks`（`agent-run-execution.ts:156`）不校验 Skill 能力与产物类型是否一致；`capability-constraints.ts` 只做**模型级**校验（比例/时长/批量），不做 Skill→类型 约束。

### 你的 prompt 本身诱导了视频

看图7/图8，你复制出来的最终提示词里带了**"动态视频/轻微动作/毛发飘动"**这类描述（图5 电商 Skill 文案末尾也确实包含"基于参考图生成电商产品展示风格的猫咪**动态视频**"这段）。规划器读到"动态/视频"语义 → 合理地规划成 video。**这是规划器按语义做的正确决策，不是乱来。**

### 智能模式会改写提示词吗？（图8/图9）

- **规划阶段**（智能模式）：会。规划器基于 `foundation`（brief+direction）为每个产物重写 `optimizedPrompt`（`agent-run-execution.ts:184,228`），这是"优化提示词"的正常职责。
- **手动优化按钮**：`optimizeCreativePrompt`（`prompt-optimization-service.ts`）是另一条独立链路，只优化输入框文本，不改产物类型。

### 如何稳定拿到图片（现有手段，无需改代码）

1. 关掉智能规划，手动选图片模型 → 走 `directAgentPlan`（`agent-run-execution.ts:281`），强制 `type: "image"`，规划器无权改类型。
2. 或在 composer 顶部把创作类型从 "agent" 切成 "image"（`page.tsx:344` `changeCreationMode`）→ `generationPreferences.mode="image"`，系统提示词强制"deliverables 只能用该媒体类型"（`agent-run-surface-policy.ts:47`）。

### 需要产品决策（P1）

> 当用户显式选了一个 image-only 的 Skill，智能模式是否应禁止规划成 video？

- **方案 A（推荐）**：Skill 增加可选字段 `allowedDeliverableTypes`，规划器系统提示词里注入"本 Skill 仅允许生成 X"，并在 `normalizeTasks` 兜底过滤/降级不匹配的产物类型。
- **方案 B**：不加约束，仅靠第 4 节透明度让用户看清"规划器决定生成视频"，用户不满意可切手动模式。

---

## 3. 参考图风格没被遵循？（图10）

**结论：需要更多信息，倾向于"参考图作为 reference 传了，但智能模式重写 prompt 时稀释了风格"。**

- 参考图链路本身是通的：`normalizeTasks`（`agent-run-execution.ts:196-213`）把 `assetIds` 解析成 `references[]`，`referenceContext` 也拼进了最终 prompt（:228）。
- 系统提示词要求"使用参考图时明确要求商品轮廓、颜色、材质、Logo 一致"（电商 Skill :17）。
- 但**智能模式下规划器可能生成一段全新的 `optimizedPrompt`，弱化了"严格贴合参考图"的指令**；且参考图是否真正下发到底层生图模型，取决于所选模型是否支持 image-to-image（`resolveTaskReferences` 里 `taskType==="image"` 只保留 image 类型且有可访问 URL 的资产）。

**给 Codex 的待办**：需要一次带参考图的实测，抓取 `run.tasks[].prompt` 和 `references[]`，确认参考图 URL 是否进入底层生成请求。建议在失败样本上加 run 级日志。**此项证据不足，先不改，先复现。**

---

## 4. 【P0 核心】透明度：展示 Skill 调用与规划思考过程（图5/图6）

这是你最重要的诉求，也是所有困惑的根因。**后端已经把数据算出来了，只是前端没展示。**

### 后端已有、但被前端丢弃的数据

1. `skills.selected` 事件**带了 skill 列表**：
   `agent-run-executor.ts:100` → `{ type: "skills.selected", data: { skills: [{id, name}] } }`
   但 `creative.ts:222` 的监听器**忽略了 `data`**，只 `onProgress("正在挑选更合适的创作方式…")`。
2. `run.planned` 事件带 `reply`（规划器自然语言总结）和 `tasks`（每个产物的 type/model/title）：
   `agent-run-executor.ts:82`。`reply` 有展示（`creative.ts:225`），但**没展示"要生成几个什么类型的产物"**。
3. `foundation`（brief + direction，即规划思路）已落库到 run，也有 `decisions[]`（"选了什么、为什么"），但聊天流没展示。

### 建议改法（前端为主，后端小改）

**最小改动（P0）**：在图6 位置（气泡内、生成结果之前）加一段"规划卡片"：
- `skills.selected` → 显示 **"已调用技能：电商生图"**（用事件里的 `data.skills[].name`）。
- `run.planned` → 显示 **"计划生成：1 张图片（模型 X）"**（用 `data.tasks[].type/model`）。
- 可折叠显示 `decisions[]`（"为什么这么做"）。

**改动点**：
- `services/api/creative.ts:222` — 让 `skills.selected` 把 `data.skills` 透传给一个新 handler（如 `onSkillsSelected`）。
- `services/api/creative.ts:223` — `run.planned` 已有 `data.tasks`，透传产物摘要。
- `use-create-agent.ts` — 在 assistant 消息 metadata 上存 `plannedSkills`/`plannedTasks`。
- `create/components/creative-messages.tsx`（渲染层）— 加规划卡片 UI。

> 效果：你一眼就能看到"我选的是电商图片 Skill，但规划器决定生成视频"，不会再被误导。若产品选第 2 节方案 B，这个透明度就是补偿手段，必须做。

---

## 5. 【P1】重试 / 重新检查按钮缺失（图12）

**现象**：drama-lab 分镜工作台任务失败（"可重试/不可自动重试/等待前置节点完成"），**没有重试按钮，也没有重新检查按钮**。

**已知**：`create` 聊天工作台是有重试的——`create/page.tsx:230 retryRound` → `agent.retryTasks / retryRun / retrySubmission`，API 也齐全（`api/agent/runs/[id]/tasks/[taskId]/retry`、`[id]/[action]`）。

**缺口**：drama-lab 的分镜/工作台 UI 没有把这些重试能力接进去。

**给 Codex 的待办**：
1. 定位 drama-lab 分镜工作台组件（`app/drama-lab/**` 或 `features/drama-canvas-runtime/**`），确认失败态节点。
2. 复用现成的 retry API，给失败节点加"重试"按钮；给"等待前置节点"态加"重新检查"（重新拉取 run 状态）。
3. 与 `create` 的 `retryRound` 逻辑对齐（失败任务优先 `retryTasks`，否则 `retryRun`）。

> 需要你确认：图12 具体是哪个页面/组件？路径贴一下能加速定位。

---

## 6. 好奇题：小猫主体为什么能保持一致？（业务逻辑）

**结论：靠"会话记忆候选 + 参考图 id 复用"，不是靠隐式传图。**

- 会话有长期摘要 + 近期消息（`getCreativeConversationContext`），规划器输入里带 `conversationContext`（`agent-run-surface-policy.ts:77-80`）。
- 当没有本轮显式附件时，系统会带上"同会话最近成功的媒体候选"（`referenceSource = "conversation-memory-candidates"`，`agent-run-executor.ts:94`；`listRecentCreativeMediaAssets` 取最近 6 个）。
- 系统提示词规则（`:47`）：**只有语义明确"延续/修改/变体/保持上一轮主体"时**，规划器才把上一轮资产 id 写进 `deliverable.assetIds`，从而把上一张猫图作为参考图下发 → 主体一致。
- 你连续说"小猫的电商图"→"小猫的电商视频"，语义连续，所以它复用了前一张猫作参考。**这是设计好的连续创作能力。**

---

## 7. 交接给 Codex 的任务清单（按优先级）

| P | 任务 | 类型 | 主要文件 |
|---|---|---|---|
| P0 | 规划透明度：展示已调用 Skill + 计划产物类型/数量 + 可折叠 decisions | 前端+后端小改 | `services/api/creative.ts:222-226`、`use-create-agent.ts`、`creative-messages.tsx` |
| P1 | drama-lab 分镜工作台补"重试/重新检查"按钮 | 前端 | `app/drama-lab/**` / `features/drama-canvas-runtime/**`（待确认） |
| P1 | 产品决策：image-only Skill 是否禁止智能模式规划成视频；若禁止，加 `allowedDeliverableTypes` 约束 | 产品+全栈 | `agent-skills/*.ts`、`agent-run-surface-policy.ts:47`、`agent-run-execution.ts normalizeTasks` |
| P2 | 参考图风格不贴合：先复现取证（抓 `run.tasks[].prompt` + `references[]`），确认参考图是否进底层请求 | 调查 | `agent-run-execution.ts:196-228`、`agent-run-surface-policy.ts resolveTaskReferences` |

## 8. 待你确认的 3 个问题

1. **产品方向**：选了电商图片 Skill 时，智能模式还能不能生成视频？（决定第 2/7 节做方案 A 还是 B）
2. **图12 路径**：具体是哪个分镜工作台页面？贴一下 URL 或组件名。
3. **图10 样本**：能否提供那次"没按参考图风格"的对话 id + 参考图，方便复现取证。
