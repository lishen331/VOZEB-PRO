# 短剧实验室 Phase 4 跨模块回归证据

## 范围

本记录对应原 Phase 4 的“回归矩阵 / API 契约”工作，范围限定为短剧实验室与平台既有边界的组合验证。没有修改普通 Canvas、教师/学生管理、商单算力或个人积分业务实现；测试只验证这些模块之间的身份、权限和计费上下文不会被短剧入口越权重用。

## 自动化覆盖

新增测试文件：

- `web/src/lib/drama-lab-phase4-cross-module-contract.test.ts`
  - 一集一个专属 Canvas，项目/剧集 handoff ID 稳定且不同集不碰撞；普通 Canvas 来源不被识别为短剧 Canvas。
  - 投影只保留项目内真实角色、场景、道具 ID，幽灵引用不产生节点或连线。
  - 刷新投影只替换当前剧集的系统节点，保留用户自由节点、用户连线、其他项目节点和用户视口。
  - 学校商单计费上下文写入系统 AI 签名；篡改项目/学校后验签失败，练习执行档案不会携带商单计费上下文。

- `web/src/lib/server/drama-lab-phase4-task-boundary.test.ts`
  - 任务查询同时限定 `userId + surface=drama + projectId`，普通 Canvas、其他短剧项目、其他用户和过期任务不会进入结果。
  - PostgreSQL 查询把用户、任务类型、项目、表面、状态和分页限制下推到 SQL。
  - 短剧恢复在缺少完整项目/剧集/镜头范围时直接返回空集，不触发数据库查询。

已有基线测试继续作为矩阵组成部分：

- `canvas-project-service.test.ts`、`drama-lab-episode-canvas-service.test.ts`：普通/短剧 Canvas 隔离、每集绑定、删除清理、成员访问和任务引用。
- `drama-lab-canvas-writeback-service.test.ts`：显式回写、节点/资产/镜头绑定、媒体归属、锁帧和乐观版本冲突。
- `school-compute-billing-context.test.ts`：普通 Canvas 与短剧 Canvas 的商单关联、学校成员/订单门禁、练习档案排除。
- `system-ai-billing.test.ts`、`generation-task-drama-scope.test.ts`：个人积分签名/幂等和短剧任务坐标恢复。
- `web/src/app/api/canvas/projects/[id]/route.test.ts`、短剧 Canvas/writeback Route 测试：HTTP 鉴权、响应状态和普通入口不接管短剧资源。

## 验证命令

```text
corepack pnpm exec vitest run \
  src/lib/drama-lab-phase4-cross-module-contract.test.ts \
  src/lib/server/drama-lab-phase4-task-boundary.test.ts \
  src/lib/server/drama-lab-episode-canvas-service.test.ts \
  src/lib/server/drama-lab-canvas-writeback-service.test.ts \
  src/lib/server/canvas-project-service.test.ts \
  src/lib/server/school-compute-billing-context.test.ts \
  src/lib/server/generation-task-drama-scope.test.ts \
  --reporter=dot
```

结果：**7 个测试文件，83 项通过，0 失败**（新增文件 2 个，7 项通过；其余为既有基线）。

## 与非短剧模块的边界结论

| 边界 | 自动化结论 |
| --- | --- |
| 普通 Canvas ↔ 短剧 Canvas | handoff 命名空间、服务 scope 和删除入口分离；普通入口不会读取或删除短剧 Canvas。 |
| 剧集 ↔ 项目 | Canvas、任务和回写均要求项目/剧集坐标；不同剧集的节点和任务不可复用。 |
| 教师/学生管理 | 本轮不改角色模型；短剧只使用既有登录身份和项目内成员授权，未引入平台用户目录搜索。 |
| 商单算力 | 只有服务端解析出的有效学校/小组/订单关联才产生 billing context；客户端伪造或练习档案不能切换到商单计费。 |
| 个人积分 | 系统 AI 请求使用签名的业务幂等身份；项目/学校/执行档案被篡改时验签失败，不会静默改账。 |

## 仍需真实环境验收

自动化契约不等于生产验收。以下项目仍需在真实登录态、生产等价 PostgreSQL、Generation Worker、配置好的模型渠道和媒体存储上执行：

1. 普通 Canvas 与短剧 Canvas 的浏览器入口、剧集切换、分镜定位和 390px/430px 布局。
2. Canvas 生成结果未显式回写时不改变短剧项目；显式回写的真实媒体归属、锁帧和并发 409。
3. 短剧项目/剧集删除后的 Canvas、任务、日志和媒体引用清理，以及 Worker 重启后的任务恢复。
4. 学校商单实际扣费流水、个人积分扣费/失败退款和重复请求幂等；不使用真实生产密钥提交测试数据。
5. 教师/学生管理、商单订单和普通 Canvas 的原有页面与 API 回归，确认没有跨模块数据泄漏。

本记录只作为 Phase 4 的自动化回归证据，不把上述人工验收缺口标记为已完成。
