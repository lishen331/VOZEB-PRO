# 一键成片 第三轮对抗性审查

日期：2026-09-17
基线：LocalMiniDrama（`backend-node/src`）
范围：`one-click-film`。创作工坊代码未改动。

## 一、本轮最重要的发现：我新建的路由是死代码

我这轮建了 8 条一键成片自有路由（shot CRUD、frame-prompts、generate-image、generate-video），
其中 `generate-image` / `generate-video` 的目的是修正计费归属。但全仓库搜索确认：

```
Get-ChildItem -Recurse src | Select-String "one-click-film/projects/.*generate-(image|video)"
→ 除路由自身外，零命中
```

**这两条路由没有任何调用方。** 一键成片实际执行时，`executor.ts` 仍然走：

```
executor.ts  step=images / step=videos
  └→ startDramaLabWorkflow({ mode: "storyboard" | "video" })
       └→ internalJson("/api/drama-lab/projects/.../generate-image")
       └→ internalJson("/api/drama-lab/projects/.../generate-video")
            └→ featureModule: "drama-lab"     ← 计费仍记教学版
```

**结论：计费归属缺陷尚未真正修复。** 路由建好了、测试也过了（6+6 项），但没接上编排层，
等于只做了一半。这正是我前两轮反复犯的同一类错误 —— 后端造好、无人调用，从用户视角
看不出任何变化。测试全绿再次没能抓到，因为测试直接调 `POST` 函数，不检查是否有调用方。

## 二、协作闸门耦合（比先前判断严重）

`POST /api/one-click-film/projects` 会调 `ensureDramaLabProjectGroup`，
**每个一键成片项目在创建时就被写入创作工坊协作组表**。因此：

1. `assertDramaLabStageAllowed` 里的 `getDramaLabProjectGroup` 一定查得到组，不会早退；
2. `requireActiveMember` 会执行，非成员访问 403；
3. 若该组有 `enabled && strictMode` 阶段配置，前序阶段未审批会拦住商单链路。

我先前"未建组时是空操作"的判断是错的，已在矩阵 §10 更正。

本轮已做的处置：新建的一键成片自有路由不调 `assertDramaLabStageAllowed`，只做项目归属校验。
未做：移除 `ensureDramaLabProjectGroup` 调用（需先确认现有项目读取路径是否已依赖该组存在，
否则会把已建项目锁在外面）。

## 三、sync-generation 复用性评估

创作工坊那份 439 行，含冲突重试、历史幂等、上下文错配检测。逐项核查其耦合面：

| 检查项 | 结果 |
|---|---|
| 是否写 `featureModule` | 否 |
| 是否发起上游请求 / 产生计费 | 否，纯回写 |
| 是否调阶段闸门 | 否 |
| 模块耦合 | 仅 `getDramaLabCollaborationForUser`（取 allowedUserIds）与 `resolveDramaLabProjectForRequest` |

**结论：它是纯回写逻辑，不含计费与闸门语义。** 一键成片自建时只需把
"允许回写的用户集合"从协作成员改为项目所有者，其余状态机语义必须逐条照抄
（尤其冲突重试与 `appendGenerationHistoryIdempotently` 的 createdAt 保持）。
**未实现**，保持"未迁移"。

## 四、本轮修掉的真实缺陷

| # | 缺陷 | 修复 |
|---|---|---|
| 1 | 分镜 CRUD 缺失（L 有 create/insertBefore/update/delete） | 按 L `storyboardService` 语义实现：白名单字段、insertBefore 序号 +1 并继承 segment、删除后重排连续序号、拒绝幽灵资产 ID |
| 2 | `DramaShotFrameState` 缺 `layout` 列 | L `frame_prompts.layout` 存在，V 合同缺失会静默丢布局信息。补为可选字段，旧数据不受影响 |
| 3 | frame_prompts 读写缺失 | 按 L DELETE+INSERT 覆盖语义实现：prompt/description/layout 整条覆盖，但保留已生成帧图状态（不在该表内） |
| 4 | `readJsonBody` 泛型缺失导致 12 处 TS18046 | episode-canvas 与 tasks 路由补类型参数 |

## 五、字段层结论（重要）

L `storyboards` 表 31 列逐列比对 V `DramaShot`：**27 列已对齐，4 列属结构差异，无映射缺口 0 项。**

这说明缺口的性质：**数据合同不缺，缺的是接口面与 UI 面。** 字段都在，但没有接口读写、
没有前端暴露，所以表现为"只有壳子"。

## 六、当前完成度

L 必须迁移的业务接口 112 条：

| 域 | 覆盖 |
|---|---|
| storyboards | 约 10/21 |
| dramas | 6/19 |
| tasks | 2/3 |
| characters / scenes / props / images / episodes / videos / audio | 0 |

UI 侧：工作台 329 行 vs 创作工坊 6964 行；只调 6 个接口；分镜卡、三模式切换、
提示词弹窗、资产编辑弹窗、素材库、配音设置全部没有前端。

**仍不具备可测条件。**

## 七、下一步（按依赖顺序）

1. **把 executor 的 images/videos 步接到一键成片自有路由**，让计费修复真正生效 —— 这是本轮欠下的最紧要一项。
2. 自建 `sync-generation`（回写链路），allowedUserIds 改为项目所有者。
3. 移除 `ensureDramaLabProjectGroup`（需先验证兼容性）。
4. 补一条**死代码守卫测试**：一键成片新增的每条路由都必须有调用方，否则判红。这条能防住我这轮犯的错。
5. UI 移植（最大工作量）。

## 八、提交

本地提交，未推送：`5bfdf807` `eb81feb6` `28e0b7d1` `4dc387ef` `b92c46d7` `235661dd` `dc61cb75` `13f0cc79`
