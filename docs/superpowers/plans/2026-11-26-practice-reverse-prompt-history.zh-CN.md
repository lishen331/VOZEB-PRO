# 反推提示词：历史记录与恢复工作台实施计划

> **实施方式：** 使用 superpowers:executing-plans（或经授权后使用 subagent-driven-development）逐项实现和验收。2026-11-26 用户确认 HTML Demo 中的入口和恢复方式；本文不是上线授权。

**目标：** 给无限练习「反推提示词」增加可跨刷新、重登和设备恢复的个人练习历史，不改现有三栏尺寸和生成流程。

**架构：** 用独立的反推练习快照记录关联现有视觉分析、试生成任务；任务仍由当前任务系统执行和计费。历史列表及恢复接口只读取快照、受管素材和已经关联的任务结果，不创建生成任务。

**技术栈：** Next.js App Router、React、项目现有 PostgreSQL DDL / 素材访问机制、Vitest、Playwright。

**基线：** 生产实测应用/Worker 均为 `a9cd200b`；本地追踪到的 `origin/main` 为 `dc2fec4c`，已有独立的局部编辑历史实现，可参照布局及权限约束，但不要复用其「成功图片编辑任务反查原图和蒙版」的数据结构。开工前核对目标发布分支，保留其他未提交改动。

## 全局约束

- 左栏提交说明下方只放「历史记录」入口，不常驻历史列表，不加第四栏，不改变桌面三栏外框尺寸、上下对齐、卡片内滚动；移动端用可关闭的抽屉。
- 账号与有效学校范围双重隔离；详情、任务和素材都做服务端归属校验。客户端不能指定归属、写入生成结果或传入任意远程地址作为历史资产。
- 恢复必须是纯读取：不重新分析、不生图、不扣积分；右栏主动试生成仍只发送文字，不传原图，不改变现有模型池和计费。生产尺寸报错单独处理，不混进本功能。
- 首期不回填发布前未形成的历史，不做历史删除、跨账号分享和草稿云同步；不伪造旧记录。历史里不保存 Base64、短效签名、原始上游响应或密钥。

## 交互与记录口径

| 操作或状态 | 页面与持久化规则 |
| --- | --- |
| 点击左栏「历史记录」 | 打开右侧抽屉；按最新更新时间倒序，首屏 20 条、游标翻页；展示原图缩略图、时间、分析重点、试生成状态。空态提示完成分析后自动保存；读取失败可重试，不能当作空列表。 |
| 成功分析 | 形成一条练习记录，包含原图、分析重点、额外要求、分析任务和拆解结果。同一请求重放仍为一条，再次主动分析产生新记录；旧试生成结果不串入新记录。 |
| 同一记录上试生成 | 记录试生成任务与提交时的确切提示词。新的成功结果成对替换旧的成功图和提示词；失败或待确认不把失败提示词与旧图拼成一组。页面允许编辑草稿，但历史不把未提交草稿当成已生成结果。 |
| 恢复 | 三栏一次性更新：左栏原图及设置，中栏拆解卡及完整提示词，右栏最近一次成功试生成的确切提示词及成图；从未成功试生成时，右栏回到完整提示词，图片留空并显示状态，清除上一条的图与错误。恢复时翻页指针回第一张。 |
| 未提交改动 / 任务正在运行 | 草稿会被替换时先确认；取消保持原样。上传、分析提交或试生成尚在工作台运行时禁止恢复；失败重试或已有后台任务继续查询沿用现有请求 ID / 任务 ID，不因切换或刷新重复提交。 |
| 原图或成图已失效 | 明示素材不可用，保留仍能读取的提示词及其他区块，不串用当前图；不能把已失效的地址继续送给模型。 |

## 实施任务

### 1. 持久化练习与任务关联

文件：`web/src/lib/server/database/schema.ts`、新增 `schema-practice-reverse-prompt-history.ts`、`web/src/lib/server/practice-reverse-prompt-history-store.ts` 及对应测试；关联后读取使用 `generation-task-store.ts`，不把带 TTL 的任务表当唯一历史数据源。

- [x] 定义 `ReversePromptHistorySnapshot`：`id`、`schoolId`、`ownerUserId`、`createdAt`、`updatedAt`、`revision`、`sourceAssetKey`、`analysisMode`、`extraRequirement`、`analysisTaskId`、`analysisText`、`trialTaskId/status`、`lastSuccessfulTrial`（`taskId`、`submittedPrompt`、`imageAssetKey`），公开 DTO 不返回账户与内部存储配置。以分析任务 ID 幂等；为账号、学校及分页顺序建索引。试生成提交顺序用版本或序号约束，迟到回调不得覆盖更新版本。
- [x] 先加测试并验证失败：同一请求重放不插重复记录、晚返回不会串图、跨学校/账号不可读、生成任务过期后仍能读取持久化的成功结果；再实现存储、只改本功能所需 DDL，并使文件后备模式不宣称能跨设备保存。
- [ ] 原图与成图只引用受管的持久素材，临时素材在形成历史前提升/复制到受管持久存储，沿用 `reference-asset-store.ts` / 生成日志资产授权。记录成图时须先确认资产可读；复用已有持久素材，不无条件复制。快照未保存成功可重试保存，不要求用户重新付费生成。
- [x] 验证分析/试生成终态同步与崩溃重跑：提交挂接已入库任务，完成时幂等更新；完成回调与挂接竞态通过读现有任务终态补齐；无论是否关页，任务完成后应可恢复，不依赖前端轮询回调。失败和待确认保持原账务语义。

### 2. API 和请求校验

文件：`web/src/app/api/practice/image-tools/route.ts`、新增 `web/src/app/api/practice/reverse-prompt/history/route.ts`、`history/[id]/route.ts` 及各自测试；共用 `history-response.ts` 收口认证与响应，由 `practice-reverse-prompt-history-store.ts` 按学校和账号读写。

- [x] 新增 `GET /api/practice/reverse-prompt/history?cursor=...` 返回 `{ records, nextCursor }`；`GET /api/practice/reverse-prompt/history/:id` 返回快照，均 `private, no-store`。未登录 401、无练习权限 403、非本人/非当前学校记录 404，服务异常不返回空列表伪装成功。
- [x] 先加失败用例：试生成不发原图；仅绑定同账号、同学校的成功分析；不能以历史 ID 换读他人素材；读取历史不会调生成或积分接口。实现后回归 `image-tools/route.test.ts`，保留局部编辑与其它图像工具的原契约。

### 3. 三栏恢复与抽屉

文件：`web/src/app/(user)/practice/components/practice-image-tool-workbench.tsx`、`practice-reverse-prompt-trial.tsx`、新增 `practice-reverse-prompt-history-drawer.tsx` 及测试。

- [x] 主工作台统一持有可恢复状态（或独立 reducer），将拆解初始值、试生成草稿和结果通过明确快照传入，避免仅更新右栏初始提示词而保留旧图。抽屉支持键盘、Esc、焦点归还与加载、空、失败状态。
- [ ] 先做组件/浏览器失败用例：恢复有图、恢复无图、确认/取消覆盖、主动再分析、旧请求晚返回不覆盖新快照。实现后测桌面 1440、1920 和手机 390：抽屉打开前三栏 bounding box 不变，长内容不穿卡片，无横向溢出。

### 4. 测试环境放行检查

- [x] 从 `web` 运行 `pnpm exec vitest run src/app/api/practice/image-tools/route.test.ts src/app/api/practice/reverse-prompt/history/route.test.ts src/lib/server/practice-reverse-prompt-history-store.test.ts`，并运行新版工作台测试及 `pnpm typecheck`。
- [ ] 测试环境用两个专用账号真实跑一次「分析 → 试生成 → 刷新 → 另一设备恢复」，再验证「只有反推」「关页后完成」「素材失效」「跨账号无权」。抓网络请求和同一账号积分流水，证明恢复只读，分别单列真实分析和试生成费用。
- [ ] 测试通过后提交时只带本功能，不带生产故障修复与其他改动；发布生产需按项目流程单独确认。回滚优先撤入口/接口调用，保留已产生快照与素材供后续版本读取，不做逆向删表。

## 独立修复：百炼试生成的自动尺寸（先做，不与历史耦合）

证据见 `docs/incidents/2026-11-26-reverse-prompt-trial-dashscope-size.zh-CN.md`。前端仍可传 `auto`；修复点是自定义图片适配将 `{{size_star}}` 序列化成 `parameters.size: ""`。只对 `qwen-image-2.1-pro`、`qwen-image-2.1-turbo` 调用百炼多模态图片接口且使用该尺寸占位符的模板处理，自动时不发空尺寸；有显式尺寸保留 `宽*高`。不调整其他渠道、平台画布默认宽高、模型池或计费。真实百炼模型验收通过后才可上生产。

- [x] 在 `web/src/app/api/image-tasks/image-task-custom.test.ts` 增加自动尺寸回归：用本地记录的请求契约检查没有空 `parameters.size`；确认原测试在修复前失败。补充显式尺寸、常量尺寸及非百炼回归。
- [x] 在 `web/src/app/api/image-tasks/image-task-custom.ts` 实现最小的协议范围内转换，运行自定义图片适配及练习提交回归。禁止通过重试、静默换渠道或让学生改提示词掩盖参数缺陷。
- [ ] 经单独批准上线前，用测试账号分别从右栏实际验证 `qwen-image-2.1-pro`、`qwen-image-2.1-turbo`，核对出站字段、响应、页面成图、积分；另用 MiniMax 作对照，不把 mock 等同于真实上游成功。

## 本地实施记录

- 独立工作树基于 `af76172a`（已在本地的 `origin/develop`），未推送或部署。数据表通过幂等新增；触发器按对应账号、学校、当前任务 ID 写入终态，并在任务先结束时重放其已有终态，不重新调用模型。历史媒体纳入通用引用检查和用户主动删除流程。
- 历史附加失败保留已受理的任务并在页面给出提醒，不按「提交失败」引导重试。如果服务器在提交后、写入历史关联之前退出，当前版本没有独立的历史补写队列；已有任务不会被重复生成，该条历史可能缺失。正常关联后关页不会影响保存。
- 本地 PostgreSQL 回归已覆盖终态先于关联、关联重放幂等、同校同账号范围、晚到旧图不覆盖新图、失败后的最后成功提示词/成图匹配和任务记录清除后仍可读取。浏览器用实际组件和模拟接口在 1440×900、390×844 验证布局与三栏恢复，未发出生成 POST；正式测试环境真实渠道验收仍待进行。
