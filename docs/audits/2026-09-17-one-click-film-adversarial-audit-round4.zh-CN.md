# 一键成片 第四轮对抗性审查

日期：2026-09-17
基线：LocalMiniDrama（`backend-node/src`）
范围：`one-click-film`。创作工坊代码未改动（回归 380 项全绿，含 UI 共 531 项全绿）。

## 一、本轮修掉的真实缺陷

| # | 缺陷 | 性质 | 修复 |
|---|---|---|---|
| 1 | `generate-image` / `generate-video` 无调用方 | **死代码，计费修复实际未生效** | executor 的 images/videos 步改走 `media-runner` → 一键成片自有路由 |
| 2 | 切换提交链路后**无人回写结果** | **我引入的回归**：两步会永久 pending | 自建 `sync-runner`，由 media-runner 主动触发回写 |
| 3 | 商单项目被写入创作工坊协作组表 | 教学版审批闸门会拦住商单链路 | 移除 `ensureDramaLabProjectGroup`，并加隔离守卫测试 |
| 4 | `storyboardFrameMode` 不在白名单 | 三模式切换存不下来 | 补入白名单，UI 与服务端由测试绑定 |
| 5 | UI 只有壳子（329 行，4 个按钮） | P0 验收门槛"不得只有壳子" | 新增分镜卡片列表 + 编辑弹窗 + 三模式切换 + 单镜生成 |
| 6 | `ImageTask.result` 无 `url` 字段却被我读取 | 图片回写会永远取空 | 改为 `serverUrl → remoteUrl → dataUrl`，与 L 一致 |

## 二、storyboards 域覆盖（重算）

L `/storyboards` 共 21 条：

- **已迁移 8 条**：`POST /storyboards`、`insert-before`、`PUT`、`DELETE`、`GET frame-prompts`、`PUT frame-prompts/:frame_type`、`universal-segment-prompt`、`split-by-audio`
- **结构覆盖 1 条**：`GET /storyboards/:id`（V 用 `project.episodes[].shots` 内联，随项目聚合返回）
- **未迁移 12 条**（保持"未迁移"，不假装等价）：

| L 接口 | 性质 | 优先级 |
|---|---|---|
| `GET /storyboards/episode/:id/generate` | 分镜拆解（现由 executor storyboard 步复用等价提取服务） | P1 |
| `POST /storyboards/:id/props` | 道具关联（`PUT` 已支持 propIds，此为独立端点） | P2 |
| `POST /storyboards/:id/frame-prompt` | AI 生成帧提示词（当前只做了读写，没做 AI 生成） | **P0** |
| `POST /storyboards/:id/link-tail-frame` | 首尾帧连续性串联 | **P0** |
| `POST /storyboards/:id/polish-prompt` | 图片提示词润色 | P1 |
| `universal-segment-polish-stream` | 全能润色流式 | P1 |
| `classic-video-prompt-polish-stream` | 经典视频提示词润色流式 | P1 |
| `universal-segment-prompt-stream` | 全能生成流式 | P1 |
| `POST /storyboards/batch-infer-params` | 批量推断参数 | P2 |
| `POST /storyboards/:id/upscale` | 放大 | P2 |
| `regenerate-layout-description` | AI 重生成空间布局 | P1 |
| `rebuild-video-prompt` | **纯本地模板重组，无 AI 调用**（已核实） | P1 |

另已自建（对应 L images/videos 域）：`generate-image`、`generate-video`、结果回写 `sync-runner`。

## 三、仍未开始的域

`characters` 0/19、`scenes` 0/11、`props` 0/9、`images` 0/9、`episodes` 0/7、`videos` 0/7、`audio` 0/2。

## 四、守卫测试清单

这些是为了防住我反复犯的同类错误：

| 测试 | 防什么 |
|---|---|
| `migration-matrix.test.ts` | 基线被换成创作工坊；无证据宣称完成 |
| `dead-route-guard.test.ts` | 建好路由却无调用方（已犯两次）；欠账清单过期不收紧也判红 |
| `project-isolation.test.ts` | 商单路由调教学版协作/闸门；读项目不校验归属 |
| `media-runner.test.ts` 回写用例 | 切提交链路忘了回写链路 |
| `one-click-film-shot-ui.test.ts` | UI 回落到 `/api/drama-lab`；用 setTimeout 假装异步；UI 能改但服务端白名单不收 |

## 五、验证

- 一键成片专项：**21 个文件 / 107 项通过**
- 创作工坊回归：**380 项通过**（含 UI 共 **531 项**）
- `tsc --noEmit` 通过；相关 ESLint **0 error**；Prettier 全部符合
- 真实浏览器：`/one-click-film`、`/create`、`/admin/one-click-film-features` 均 200

## 六、可测与不可测

**现在可以真机点的**：进入一键成片项目 → 新增/前插/删除分镜 → 编辑分镜（基础字段、图片/视频提示词、首尾帧提示词含 layout）→ 切换经典/首尾帧/全能 → 单镜生成分镜图/视频（计费归属 one-click-film）→ 按音频拆镜（预览+追加应用）→ 跑一键成片父任务并取消/重试 → 打开本集画布并返回定位 → 导出。

**仍不可用**：AI 生成/润色提示词（frame-prompt、polish 系列、layout 重生成）、首尾帧连续性串联、角色/场景/道具资产编辑与四视图、素材库、配音设置面板、批量参数推断、放大。

**结论：不再是"只有壳子"，但距离 §9.2 的 1:1 仍有明确距离。可以开始局部真机验证分镜链路，不宜按完整商单流程验收。**

## 七、下一步

1. `frame-prompt` AI 生成与 `link-tail-frame`（P0，首尾帧闭环缺这两块就不完整）
2. polish 系列 4 条（P1，用户可感知的提示词优化能力）
3. characters/scenes/props 资产域（P0 体量最大）
