# 一键成片 第六轮对抗性审查（收尾）

日期：2026-09-17
基线：LocalMiniDrama（`backend-node/src`）
范围：`one-click-film`。创作工坊代码未改动。

## 一、覆盖率（逐条核算，非估算）

L 必须迁移的业务接口 **108** 条：

| 分类 | 数量 |
|---|---|
| 自有路由已迁移 | 51 |
| V 项目聚合承载 | 33 |
| 素材库映射 | 8 |
| **已覆盖合计** | **92（85.2%）** |
| 刻意不复制（L 特有 SD2 声音认证） | 4 |
| 仍为缺口（全部 P2） | 12 |

按域：storyboards 14/21、characters 15/19、scenes 11/11、props 9/9、episodes 7/7、
images 6/9、videos 6/7、video-merges 3/4、audio 2/2、dramas 19/19。

一键成片自有 API 路由 **33 个文件**。

## 二、本轮修掉的缺陷

| # | 缺陷 | 性质 |
|---|---|---|
| 1 | 死代码守卫自身会因关键字假通过 | `needle` 为 `export` 时任何 TS 文件都命中，`GET /export` 白当了三轮死代码。改为只在真实请求路径字面量里匹配 |
| 2 | 资产 UI 无手动增删入口 | 只能靠 executor 自动提取，用户无法自己加角色 |
| 3 | 资产字段只读，`PUT assets/:assetId` 无调用方 | 服务端能存、UI 没入口 |
| 4 | `voiceProfile` 不在资产白名单 | 配音只能用平台默认音色 |
| 5 | 配音结果 UI 完全不可见 | `audio-runner` 一直在回写 `dialogueAudio`/`narrationAudio`，UI 从未读取，"配音"只是步骤条文字 |
| 6 | `batch-generate-images` 未迁移 | 只能逐个点 |
| 7 | 素材库 7 条未适配 | 资产无法存入/取用 |
| 8 | 空资产也能提交生图 | `buildDramaLabAssetFinalPrompt` 总会拼画风块，返回值永远非空，我原先的 `if (!prompt.trim()) throw` 是死代码 |
| 9 | 矩阵 §2/§3 数字停留在首轮的 9% | 与实测 85.2% 矛盾，已更新并保留历史说明 |

## 三、过程中我自己引入并修掉的错误

诚实记录，避免下次重犯：

| 错误 | 暴露方式 |
|---|---|
| 从 `toPromptFragment` 输出反推 angle 描述表，因 `left` 描述含逗号切错 | **96 组合校验报出 36 处不一致** |
| 读 `ImageTask.result.url`（该类型没有此字段） | typecheck |
| 对象字面量 `name` 写两次 | typecheck TS1117 |
| 渲染 hooks 放在提前 return 之后 | ESLint react-hooks/rules-of-hooks |
| 替换锚点未命中导致轮询块重复、函数体缺失 | typecheck TS2448 + 手动核查 |
| `voiceProfile` 只在 `DramaCharacter` 上，按 kind 统一处理时 TS2339 | typecheck |

**这些都是自动化检查抓到的，不是我"看起来对"就放过的。** 校验的价值在此：
angle 契约那 36 处不一致若靠手抄+目视，会静默进生产。

## 四、守卫测试清单（9 项，防我重犯）

| 测试 | 防什么 |
|---|---|
| `migration-matrix.test.ts`（5） | 基线被换成创作工坊；无证据宣称完成；P0 缺口被悄悄划掉 |
| `dead-route-guard.test.ts` | 路由无调用方；**本轮修掉了它自己的关键字假通过**；欠账清单过期不收紧也判红 |
| `project-isolation.test.ts`（2） | 商单路由调教学版协作/闸门；读项目不校验归属 |
| `one-click-film-shot-ui.test.ts`（16） | UI 回落 drama-lab；setTimeout 假异步；UI 能改但服务端白名单不收；配音状态不可见 |
| `one-click-film-asset-ui.test.ts`（18） | 资产域同上，含音色、素材库、批量、提取 |
| `one-click-film-render-ui.test.ts`（5） | 成片 hooks 顺序、轮询而非假进度、产物存在才给下载 |
| `video-prompt-rebuild.test.ts` | angle 契约 96 组合；段落顺序与标签 |
| `image-polish-service.test.ts` / `layout-regenerate-service.test.ts` | 系统提示词被改写；载荷字段顺序偏离 L |
| `media-runner.test.ts` / `sync-runner.test.ts` | 切提交链路忘了回写链路 |

## 五、从 L 逐字抄录的契约（均有校验）

| 文件 | 来源 | 校验方式 |
|---|---|---|
| `universal-prompt-l-system.json` | `getUniversalOmniSegmentPrompt` + 润色后缀 | 快照测试 |
| `image-polish-l-system.json` | `getImagePolishPrompt` 中文分支 | 关键铁律断言 |
| `layout-regenerate-l-system.json` | `getRegenerateLayoutDescriptionPrompt` 中文分支 | 关键要求断言 |
| `angle-l-contract.json` | `angleService` 三张描述表 + 中文标签 | **96 组合与 L 输出逐一比对，0 不一致** |

## 六、验证

- 一键成片专项：**30 文件 / 188 项通过**
- 创作工坊回归：**102 文件 / 531 项通过**（未受影响）
- `tsc --noEmit` 通过；一键成片全域 ESLint **0 error 0 warning**；Prettier 全部符合
- 真实浏览器：`/one-click-film`、`/create`、`/admin/one-click-film-features` 均 200

## 七、现在可以真机测什么

**剧本** → 导入/编辑分集剧本
**资产** → 三域切换、从剧本提取、手动增删、字段编辑、AI 生成提示词/提取特征/提炼锚点/生成阶段造型、生成四视图或设定图、批量生成（10 个上限）、参考图上传/设为主图/移除、存入素材库、取用素材库图片、角色音色配置
**分镜** → 新增/前插/删除、编辑（基础字段/图片视频提示词/首尾帧提示词含 layout/空间布局锚点）、切换经典·首尾帧·全能、单镜生成图或视频、AI 生成帧提示词、AI 润色图片提示词、重建视频提示词、AI 重算空间布局、提取视频尾帧并应用为下一镜首帧、按音频拆镜
**配音** → 对白/旁白状态、说话人、音色、错误原因、内嵌播放
**成片** → 合成本集成片（服务端持久化 + 3 秒轮询）、下载成片、导出项目
**编排** → 一键成片父任务、取消、重试、打开平台画布并返回定位

**仍不可用**：3 条流式提示词输出（非流式已可用）、批量参数推断、放大、生成记录删除、L 特有的分集背景流、SD2 声音认证。

## 八、结论

主链路已覆盖 92/108（85.2%），分镜与资产链路具备真机验证条件。
剩余 12 条缺口全部为 P2（清理类与流式版本），4 条为 L 特有第三方能力刻意不复制。

**不宣称 1:1 完成。** 建议按 §七 的清单做真机验证，把实际卡住的地方反馈回来，比我继续补 P2 更有价值。

## 九、迁移原则的落实

| 规范要求 | 落实情况 |
|---|---|
| L 决定"一键成片"怎么工作 | 提示词逐字抄录并校验；CRUD/覆盖/去重/上限语义照抄 |
| V 决定怎么承载和展示 | 全部用 V 的 React/antd 组件、平台画布、模型渠道、任务队列、OSS、素材库 |
| 不复制 L 的画布 | 用 `episode-canvas` 接 V 平台画布 |
| 不照搬 L 的 Vue 页面 | UI 全部新写 |
| 两者不互相影响 | 移除协作组耦合；隔离守卫测试；创作工坊 531 项回归全绿 |
| 计费归属 | 所有生成类走自有路由并显式写 `featureModule: "one-click-film"`；上游派发收敛到单一处避免分叉漏写 |
