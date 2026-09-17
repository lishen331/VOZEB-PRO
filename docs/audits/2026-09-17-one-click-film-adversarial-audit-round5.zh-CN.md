# 一键成片 第五轮对抗性审查（收尾）

日期：2026-09-17
基线：LocalMiniDrama（`backend-node/src`）
范围：`one-click-film`。创作工坊代码未改动，回归 380 项全绿。

## 一、本轮最重要的发现：我的死代码守卫自己有缺陷

第三轮我加了 `dead-route-guard.test.ts`，本意是防住"建好路由但没人调用"。本轮收尾核查时发现**这个守卫本身会假通过**：

```ts
// 缺陷判定
return text.includes("one-click-film") && text.includes(needle) && /fetch/.test(text);
```

`needle` 取路由路径的最后一个静态段。当它是 `export` 时，**任何 TS 文件都含 "export" 关键字**，于是判定永远为真。结果：

- `GET /projects/[id]/export` 实际**没有任何调用方**，但守卫一直报绿。
- 这条路由是我第二轮建的，白白当了三轮死代码。

已修：改为先提取文件里真正的请求路径字面量（`/api/one-click-film...` 与 `\${base}...` 拼接），再在其中查段名。修完守卫立刻抓出 `export`，随后补上工作台的「导出项目」入口，守卫恢复真绿。

**教训**：守卫测试本身也要被验证。我当时只确认了"守卫能抓出已知的 4 条死路由"，没验证"守卫不会对未知情况假通过"。

## 二、本轮迁移完成的 L 能力

| L 接口 | 一键成片实现 | 关键点 |
|---|---|---|
| `POST /storyboards/:id/frame-prompt` | `generate-frame` | AI 规划帧提示词并提交帧图任务；锁定帧拒绝覆盖；旧帧图进历史 |
| `POST /storyboards/:id/link-tail-frame` | `extract-tail-frame` + `accept-first-frame-candidate` | 复用 V 已有的 `drama-lab-tail-frame-service`（已核实无模块耦合） |
| `POST /storyboards/:id/polish-prompt` | `polish-prompt` | 系统提示词逐字抄录；载荷字段顺序与 L `userPromptLines` 完全一致 |
| `POST /storyboards/:id/rebuild-video-prompt` | `rebuild-video-prompt` | 纯本地模板重组（已核实无 AI 调用）；angle 契约经 **96 组合逐一校验** |
| `.../regenerate-layout-description` | `regenerate-layout-description` | 系统提示词逐字抄录；清洗规则（代码块围栏/引号/前缀）与 L 一致 |

## 三、提示词契约的抄录方式

不是手抄，全部有校验：

| 文件 | 来源 | 校验 |
|---|---|---|
| `image-polish-l-system.json` | `promptI18n.getImagePolishPrompt` 中文分支 | 断言含"角色外貌描述铁律"等关键条款 |
| `layout-regenerate-l-system.json` | `getRegenerateLayoutDescriptionPrompt` 中文分支 | 断言含"真实尺度锚点""必须用中文输出" |
| `angle-l-contract.json` | `angleService` 三张描述表 | **用 createRequire 加载 L 真实模块，对全部 96 种 (h,v,s) 组合比对 `toPromptFragment` 与 `toChineseLabel`，0 处不一致** |

中途出过一次错：我最初用字符串切片从 `toPromptFragment` 输出里反推描述表，因为 `left` 的描述本身含逗号（`shooting from the left side, profile view`），96 组合校验报出 36 处不一致。改为直接解析源码字面量后归零。**这正是校验的价值 —— 如果只是手抄然后"看起来对"，这 36 处会静默进生产。**

## 四、storyboards 域覆盖

**已迁移 13 / 结构覆盖 1 / 未迁移 7（共 21 条）。**

未迁移的 7 条全是 P2：

| L 接口 | 说明 |
|---|---|
| `GET /storyboards/episode/:id/generate` | 独立拆解端点；executor storyboard 步已复用等价提取服务 |
| `POST /storyboards/:id/props` | 道具关联独立端点；`PUT shots/:id` 已支持 propIds |
| `universal-segment-polish-stream` | 流式；非流式已迁移 |
| `classic-video-prompt-polish-stream` | 流式 |
| `universal-segment-prompt-stream` | 流式；非流式已迁移 |
| `batch-infer-params` | 批量推断参数 |
| `upscale` | 放大 |

三条 stream 端点的非流式等价物都已迁移，差别只是响应传输方式，不影响最终提示词内容。

## 五、其余域仍未开始

`characters` 0/19、`scenes` 0/11、`props` 0/9、`images` 0/9、`episodes` 0/7、`videos` 0/7、`audio` 0/2、`dramas` 6/19。

## 六、守卫测试清单

| 测试 | 防什么 |
|---|---|
| `migration-matrix.test.ts` | 基线被换成创作工坊；无证据宣称完成 |
| `dead-route-guard.test.ts` | 路由无调用方；**本轮修掉了它自己的关键字假通过缺陷**；欠账清单过期不收紧也判红 |
| `project-isolation.test.ts` | 商单路由调教学版协作/闸门；读项目不校验归属 |
| `media-runner.test.ts` 回写用例 | 切提交链路忘了回写链路 |
| `one-click-film-shot-ui.test.ts`（15 项） | UI 回落 `/api/drama-lab`；setTimeout 假异步；UI 能改但服务端白名单不收 |
| `video-prompt-rebuild.test.ts` | angle 契约 96 组合；段落顺序与标签 |
| `image-polish-service.test.ts` / `layout-regenerate-service.test.ts` | 系统提示词被改写；载荷字段顺序偏离 L |

## 七、验证

- 一键成片专项：**24 个文件 / 130 项通过**
- 创作工坊回归：**380 项通过**（未受影响）
- `tsc --noEmit` 通过；相关 ESLint **0 error**；Prettier 全部符合
- 真实浏览器：`/one-click-film`、`/create`、`/admin/one-click-film-features` 均 200

## 八、现在可以真机测什么

进入一键成片项目 → 导入剧本/编辑分集 → 新增/前插/删除分镜 → 编辑分镜（基础字段、图片/视频提示词、首尾帧提示词含 layout、空间布局锚点）→ 切换经典/首尾帧/全能 → 单镜生成分镜图/视频（计费归属 one-click-film）→ AI 生成帧提示词 / AI 润色图片提示词 / 重建视频提示词 / AI 重算空间布局 → 提取视频尾帧并应用为下一镜首帧 → 按音频拆镜（预览+追加应用）→ 跑一键成片父任务并取消/重试 → 打开平台画布并返回定位 → 导出项目。

**仍不可用**：角色/场景/道具资产编辑与四视图、素材库、配音设置面板、批量参数推断、放大、流式提示词输出。

## 九、结论

storyboards 域（规范 §5 的主体）已基本迁移完，分镜链路可以真机验证。但资产域（characters/scenes/props 共 39 条）完全未动，按 §9.2 的 1:1 标准仍不能验收完整商单流程。

## 十、下一步

1. `characters` 域（19 条，体量最大，含四视图、锚点提取、阶段造型）
2. `scenes` 11 条 / `props` 9 条
3. `episodes` 7 条（分集级拆解与合成）
