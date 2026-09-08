# 画布 Agent 可靠性 Implementation Plan

> For agentic workers: use superpowers:executing-plans，逐项测试、记录，不改主 Agent 页面。

**Goal:** 完成用户确认的画布 Agent 整理、编辑、理解和持久化闭环，消除假成功与内容丢失。
**Architecture:** 复用现有 Canvas 操作与布局算法，模型规划和执行分开；共享运行层只在 surface=canvas 分支扩展。结果应用与生成完成分别记录，使用版本与幂等校验。
**Tech Stack:** Next.js/React、TypeScript、PostgreSQL、Vitest、Playwright。

## 边界及工作区
- 基线 5f9ebad5；分支 codex/canvas-agent-reliability，隔离工作树 .worktrees/canvas-agent-reliability。
- 共享主工作区其他会话正在改 agent-run-executor / execution / text-planning-runtime，多模态接线整合前必须核对并保留。
- 不改 /create；不覆盖其他会话文件；不自动同步短剧复制画布。
- 审查草案见 docs/audits/2026-09-08-agent-reliability-alignment.zh-CN.md（主工作区）；线上证据以各 Run ID 为准。

## 阶段一：内容与终态保护
Files: agent-run-task-input.ts、agent-run-execution.ts、Canvas canvas-agent-run-client.ts、agent SSE route，以及各自测试。
- [x] 固化多选丢目标、内部目标误提取、partial_success 失败测试。
- [ ] 保留每个选中文本的独立目标与原文；图编辑不得将所有引用误当成待覆盖目标，保持计划选取的编辑目标。
- [x] 禁止内部创作目标触发正文快捷写入；新增 Canvas 专属 literalContent，主 Agent 计划不增加该字段。
- [x] 画布事件/快照/重连和服务端Canvas SSE统一处理部分成功，保留成功结果并停止观察。
- [ ] 相关自动测试、类型检查、格式、隔离浏览器回归，单独提交。

## 阶段二：结果落库与恢复
Files: Canvas result application service（新）、agent-run-store / execution 画布分支、Canvas assistant-panel / run-client、项目存储事务/版本接口。
- [ ] 先证明任务离页完成后的结果缺失。
- [ ] 服务端持久化受权限与版本约束的操作，稳定操作ID与回执；结果不能仅依赖浏览器保存。
- [ ] 重进画布补齐未应用/已完成结果；不覆盖用户新修改，冲突可解释。
- [ ] 重放、双击、旧事件、跨项目及权限测试；真实离页/重进验收。

## 阶段三：结构操作
Files: Canvas 专属计划契约/验证器、现有 canvas-auto-layout.ts、操作执行服务、确认与撤销界面。
- [ ] 增加结构操作类型，不用 text 任务假装整理；只在画布使用。
- [ ] 默认整理只改位置，保留正文和连线；区分全画布/选中。
- [ ] 几何/版本/真实节点ID输入与校验；复用布局和撤销。
- [ ] 破坏性操作展示目标及变化后确认；分组先核对原契约再接入。
- [ ] 空画布、单节点、循环连线、选中范围、重复整理、保存回执验收。

## 阶段四：上下文与多模态
Files: Canvas compact snapshot / assistant-panel、Canvas 专属媒体解析、已有 planner media 接口。
- [ ] 自动定位与明确引用分开，读范围不等于改范围；新对话不受旧选中偷偷限制。
- [ ] 与共享多模态修改对接，不重写主Agent实现；输入实际图片而非文本URL。
- [ ] 文字成品/执行说明分离；盲测图、过期/错误/无权限素材与无视觉能力回归。

## 阶段五：完整验收及发布
- [ ] 画布 UI 正向：问答→编辑/整理/生成→预览→引用→保存→刷新。
- [ ] 逆向：多目标部分失败、取消/暂停/恢复、离页、并发修改、权限、模型不可用/余额不足。
- [ ] 媒体按额度分批；不能把协议模拟成功算真实上游验收。
- [ ] 全量门禁与接口索引/开发地图检查，协作合并后提交；用户要求部署时确认SHA/健康/线上回归。

每阶段独立提交，未完成不标勾；回滚以本分支阶段提交为单位，不重置共享主分支。

## 2026-09-08 阶段一检查点
- 已实现多选文本按目标独立处理及原文隔离；明确只修改一个目标时不扩展到所有选中。多选图片的目标/参考区分仍待后续实现和回归。
- 新增 literalContent 独立字段：只有明确最终正文才能直接写入；原 prompt 正则快捷解析已移除。仅 Canvas 规范化任务会携带该字段，主Agent路径不携带。
- 未解决的正文质量、用户覆盖确认、编辑期间版本冲突仍在后续阶段，不算全部内容安全闭环完成。
- 定向测试 7 文件 / 108 测试通过（含 SSE 服务端和断流状态、请求读取边界）。
- 隔离 Playwright 点击真实 watchCanvasAgentRun 测试入口，模拟 partial_success SSE，返回 settled=true 和回复；仅测试运行时，不是线上新版本回归。
- 全量测试首次运行：814 文件通过、3 失败；3953 测试通过，31 跳过。两项学校测试缺 papaparse；一项仓库扫描在并发测试时超时，独立重跑已通过，未增大超时掩盖问题。
- 类型检查只余已有学校 school-csv 的 papaparse 依赖及两处关联隐式any；本次变更无类型诊断。不能宣称全量类型检查通过。
- 修改文件已格式化且 ESLint通过；未改主工作区业务文件，未合并共享主线、未推送、未部署。
- 下一步：阶段二服务端结果应用与离页恢复，同时核对其他会话共享后端变更再合并；随后接通布局操作。
