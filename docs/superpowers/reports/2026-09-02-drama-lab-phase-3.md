# 短剧实验室 Phase 3 交付报告

**日期：2026-09-02**
**范围：仅短剧实验室（Drama Lab）**
**验收原则：只有服务端真实编排、持久化、权限校验和自动化测试覆盖的行为才计为已实现。**

## 1. 范围边界

本阶段收口四条业务主线：

1. 一键全流程（服务端可恢复工作流）；
2. 团队协作与真实审批；
3. Canvas 显式回写边界；
4. 完整项目导入/导出。

本阶段不修改普通 Canvas 的业务规则、教师/学生管理、商单算力、平台账户体系或通用生成任务协议。短剧仍复用 VOZEB PRO 的 Session、项目所有权、`generation_tasks`、媒体登记、计费/退款和 Worker。

## 2. 实现矩阵

| 主线 | 服务端事实 | 持久化/权限 | 状态 |
| --- | --- | --- | --- |
| 一键全流程 | `drama-lab-workflow-task-service.ts` 创建父任务和子任务，支持 assets/storyboard/video 模式、当前集/全部剧集、游标推进、外部图片/视频任务同步 | 父子任务继续落在平台 `generation_tasks`；请求幂等、项目级运行中去重、取消、恢复、Worker 唤醒、刷新后发现 | 已实现基础闭环 |
| 真实团队协作与审批 | `drama-lab-collaboration-service.ts` 处理项目组、邀请 token、加入申请、成员退出/移除、管理员转交、审批配置、提交、通过、驳回和历史 | `drama_lab_project_groups`、`drama_lab_project_members`、`drama_lab_project_invites`、`drama_lab_join_requests`、`drama_lab_approval_configs`、`drama_lab_approvals`；每次请求按项目成员关系授权 | 已实现 |
| Canvas 显式回写 | `drama-lab-canvas-writeback-service.ts` 只接受显式目标和 `sourceHandoffId`，支持资产参考图、镜头帧、镜头视频、镜头字段四类回写 | 校验项目/剧集/镜头/资产真实 ID、节点绑定、媒体所有权和项目/Canvas 乐观版本；冲突返回 409，不静默覆盖 | 已实现 |
| 完整项目导入/导出 | `drama-lab-project-archive.ts` 生成项目 JSON 与 ZIP 媒体清单，导入时重映射实体 ID、恢复媒体并清理运行中任务引用 | 路径遍历、单文件/总大小和媒体归属校验；失败回滚并删除已写媒体/新项目；导入项目自动创建协作组 | 已实现基础闭环 |

### 2.1 工作流边界

当前工作流的 `script` 步骤主要校验并登记选定剧集已有剧本，随后推进资产、分镜、图片、视频、审核和导出步骤；它不是一次性同步重新生成故事文本的替代入口。需要重新生成多集故事时，使用独立的故事生成任务链。

审核步骤通过 `drama-lab-workflow-review-service.ts` 调用真实内容审核服务，保存审核结果、评分、问题和任务引用。`passed` 才能继续导出；`needs_revision`、`unavailable` 会保留结构化结果并进入可恢复失败状态。

Canvas 默认是短剧项目的一集一个 staging 画布。只有调用 `POST /api/drama-lab/canvas-projects/[id]/writeback` 并提供目标字段，结果才会写回短剧项目；普通 Canvas 与短剧项目不会因打开或同步而互相覆盖。

导出包含项目元数据、剧集、资产、分镜、任务引用和媒体清单。媒体缺失会明确记录 warning；导入后的项目、剧集、资产和分镜 ID 会重新生成，旧任务不会继续运行或复用。

## 3. 主要接口

### 协作与审批

- `GET/PUT /api/drama-lab/projects/[id]/collaboration`
- `GET/POST /api/drama-lab/projects/[id]/collaboration/approvals`
- `GET/POST /api/drama-lab/projects/[id]/collaboration/approvals/[approvalId]`
- `GET/POST/DELETE /api/drama-lab/projects/[id]/collaboration/invite(s)`
- `POST /api/drama-lab/projects/[id]/collaboration/join`
- `GET/DELETE /api/drama-lab/projects/[id]/collaboration/members`
- `PATCH/DELETE /api/drama-lab/projects/[id]/collaboration/members/[userId]`
- `GET /api/drama-lab/projects/[id]/collaboration/requests*`

### 工作流、回写与归档

- `GET/POST/PATCH /api/drama-lab/projects/[id]/workflow`
- `GET /api/drama-lab/projects/[id]/workflow/export/[artifactId]`
- `POST /api/drama-lab/canvas-projects/[id]/writeback`
- `GET /api/drama-lab/projects/[id]/export`
- `POST /api/drama-lab/projects/import`

完整 Route 清单以 [VOZEB-PRO-接口索引.md](../../../VOZEB-PRO-接口索引.md) 为准（2026-09-02 基线：299 个 Route，短剧实验室 41 个 Route）。

## 4. 自动化验证

已运行（`web` 目录）：

```text
corepack pnpm exec vitest run \
  src/lib/server/drama-lab-collaboration-service.test.ts \
  src/lib/server/drama-lab-workflow-task-service.test.ts \
  src/lib/server/drama-lab-project-archive.test.ts \
  src/lib/server/drama-lab-canvas-writeback-service.test.ts \
  src/app/api/drama-lab/projects/[id]/workflow/route.test.ts \
  src/app/api/drama-lab/projects/[id]/export/route.test.ts \
  --reporter=verbose
```

结果：上述核心命令通过 **6 个测试文件、52 项测试，0 失败**。本轮新增 Canvas 外链归属、空剧集归档和跨剧集重复分镜 ID 回归后，web 全量通过 **725 个测试文件、3566 项测试**（8 个文件、31 项按环境跳过）。测试覆盖幂等、成员权限、邀请与申请状态、审批门禁、父子任务恢复/取消、外部任务上下文隔离、回写失败不误报成功、未登记外链拒绝、视频审核输入、归档媒体安全、空项目导入、重复分镜 ID 校验、导入回滚、Canvas 节点与版本冲突以及 Route 鉴权。

并行对抗审查另运行了工作流专项测试 **1 个文件、16 项通过**；其结论记录在 [Phase 3 并发审查](./2026-09-02-drama-lab-phase-3-concurrency-audit.md)。该报告列出的跨进程 fencing/CAS、原子启动 claim、取消竞态、子任务幂等和导出两阶段一致性仍是生产验收阻断项，本阶段没有擅自改造通用任务调度器。

类型检查：`corepack pnpm typecheck --pretty false` 通过；Lint：`corepack pnpm lint` 通过；`git diff --check` 通过。

## 5. 统一人工验收清单

自动化通过不等于生产环境通过。统一验收时仍需使用真实登录态、生产等价 PostgreSQL、Generation Worker、真实模型渠道和实际媒体存储逐项确认：

- 一键全流程在浏览器关闭、Worker 重启、刷新、取消和恢复后不重复扣费，并等待所有子任务终态；
- 严格审批阶段在真实项目中阻止后续生成/导出，驳回后带意见重新提交，定位信息能打开对应剧集/镜头/阶段；
- 成员通过邀请链接或二维码申请加入，管理员确认后才生效；撤销/过期邀请、成员退出、移除和管理权转交符合预期；
- Canvas 生成结果在未显式回写时不改变短剧项目，回写时正确处理锁定帧、媒体归属和并发 409；
- 完整项目 ZIP 在真实本地/S3 媒体、缺失媒体、较大文件和导入失败场景下可下载、恢复、回滚；
- 桌面及 390px/430px 工作台中的进度、审批状态、冲突和下载错误提示可见且不溢出。

## 6. 本阶段明确不包含

不引入即时通讯、邮件/推送通知、附件审批、平台级用户目录搜索、教师/学生角色改造或普通 Canvas 数据双向自动同步。审批提醒仅通过短剧工作台已有待办/未读状态表达；这些扩展应另立需求和数据边界。
