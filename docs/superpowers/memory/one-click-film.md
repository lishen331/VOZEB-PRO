# 记忆：一键成片（one-click-film）

> 每次接手本任务前**必须先读本文**。上下文丢失曾导致把创作工坊当基线，返工一整天。

## 硬边界（不可协商）

1. **基线是 LocalMiniDrama（L）**，路径 `D:\Claude code programe\VOZEB-PRO\LocalMiniDrama`（backend-node/src）。
2. **创作工坊（drama-lab）与本任务无关**：不改它的代码，**也不把它当参考基准**。它是教学版；一键成片是商单生产版，两者同级独立。规范 §9.3 明确禁止"把教学版现有功能当作商单版已迁移"。
3. **V 只替换承载层**：React/Next UI、V 画布、登录权限、模型渠道、任务基础设施、OSS、计费、数据访问适配器。不得删字段、简化状态机、改写请求语义、用假任务替代。
4. **画布**用 V 平台现有画布，不复制 L 的画布，不建第二套。
5. 插件开关**只控前端显示**（`requireFeatureModuleEnabled` 是空实现），不撤业务权限。
6. 未完成差异矩阵 / 请求载荷对比 / 回写对比 / 状态对比 / 同输入回归，**不得宣称完成**。

## 关键文档

- 需求规范：`docs/superpowers/specs/2026-09-15-one-click-video-production-requirements.zh-CN.md`
- 实施计划：`docs/superpowers/plans/2026-09-15-one-click-video-production.md`（40 个 checkbox）
- **差异矩阵（基线）**：`docs/superpowers/specs/2026-09-15-one-click-video-production-l-v-matrix.zh-CN.md`
- 守卫测试：`web/src/lib/one-click/migration-matrix.test.ts`

## 当前状态（2026-09-17）

L 后端 161 个接口 → V 平台承载 34、素材库适配 15、**必须迁移的业务逻辑 112，已覆盖 10（约 9%）**。

**不具备可测条件。** UI 侧尤其空：工作台 329 行，只调 6 个接口，仅有"重新加载/重试/生产流程/项目数据"。分镜卡、三模式切换、提示词弹窗、资产编辑弹窗、素材库、配音设置全部没有前端。

### 已完成（结论成立，保留）
一级入口与导航、独立配置页、项目隔离（`sourceHandoffId` 前缀 `one-click-film:`）、父任务编排+调度入队+worker识别+取消/重试/恢复、配音真实 TTS 子任务、按音频拆镜接口、导出接口、画布往返按 `source` 分流、全能提示词字段合同。

### 覆盖现状（2026-09-17 收尾）
**storyboards 域 17/21 已迁移 + 1 结构覆盖，剩 3 条全是 P2**（仅剩 3 条 stream 版本，非流式等价物均已迁移）。

`GET /storyboards/episode/:id/generate` 已于 2026-09-17 迁移为 `POST .../episodes/:episodeId/storyboards/generate`。动机：V 原先只能跑完整 7 步工作流，`currentStepIndex` 恒从 0 起，改完剧本没法只重拆本集分镜。实现复用 executor 的 `storyboard_extract` 子工作流（scope=current），因此提示词契约与落库字段不分叉。用 POST 而非 L 的 GET —— 有副作用的操作不能让浏览器/代理预取。

`POST /storyboards/:id/props` 已于 2026-09-17 打通：服务端白名单本来就收 `characterIds`/`propIds`/`sceneId`，但**没有任何 UI 发过这三个字段**，所以能力实际不可达。这是典型的「后端有、前端没接 = 等于没做」，教训同死代码守卫那条。现由分镜编辑弹窗「资产绑定」页签承载，整组覆盖语义与 L 一致。

`upscale` 已于 2026-09-17 迁移：sharp 固定 2 倍 lanczos3，不调模型不计费。承载差异是 L 直接读写本地 storage 目录并改写 `local_path`，V 下载源图到临时目录、放大、写回 reference 媒体库，再改写 `storyboardImageUrl/Width/Height`。UI 入口是分镜卡上的「放大分镜图」（仅在已有分镜图时出现）。

`batch-infer-params` 已于 2026-09-17 迁移：纯本地规则推断（不调模型、不计费），契约文件 `photography-inference-l-contract.json` 用 113 个样本与 L 真实输出零不一致校验过。UI 入口是分镜列表头部的「补全摄影参数」按钮。

**资产三域（characters 19 / scenes 11 / props 9 = 39 条）**：已迁移专用路由 15、项目聚合承载 12、素材库待适配 7、SD2 第三方 4（不复制）、真正未迁移 1（`batch-generate-images`）。

三条 kind 参数化路由覆盖 15 个 L 端点：`assets/:id/ai`（describe/prompt/anchor/stages）、`assets/:id/generate-image`（含 four_view）、`assets/:id/references`（upload/primary/remove）。

**资产域已知缺口**：仅剩 SD2 第三方 4 条（L 特有的声音认证，V 用自身音色体系，不复制）。素材库 7 条已适配。

字段编辑、手动增删、批量生成均已补齐。批量走 `POST assets/batch-generate-images`（L 上限 10 个、逐个派发不连坐）；上游派发统一在 `asset-image-dispatch.ts`，单个与批量共用，防止漏写 `featureModule`。

手动增删已补：`POST assets` / `PUT assets/:assetId` / `DELETE assets/:assetId`。**删除时必须同步清掉分镜绑定**（characterIds/propIds/sceneId），否则留下幽灵资产引用；资产名项目内唯一，同名 409。

**episodes 域 7 条已全部覆盖**：5 条自有路由（storyboards 拆解、characters/props 提取、finalize、download）+ 2 条聚合承载（分镜列表与状态随项目返回）。

**媒体域（images 9 / videos 7 / video-merges 4 / audio 2 = 22 条）**：已迁移 15、聚合承载 5、缺口 2（L 特有的分集背景列表与提取，均 P2）。

3 条 DELETE 已于 2026-09-17 迁移（`generation-cleanup.ts`）：纯数据清理，不调模型不计费。要点是 L 的 `imageService.deleteById` 不只软删那一行，还会解除分镜首/尾帧绑定，V 侧对应清 `storyboardImageUrl`、`frames.first/last`（含解锁 `locked`）与 `firstFrameCandidate`。L 的 video_merges 是独立多行表，V 每集只有一个 `renderTask`，故按 `renderTask.id` 匹配删除。UI 入口：分镜编辑弹窗新增「生成记录」页签，工作区新增「删除成片记录」。

注意一处等价判定的边界：`POST /videos/image/:image_gen_id`（L 用任意已生成图生视频）在 V 里没有独立端点，`generate-video` 只能用绑定在分镜 frames 上的帧。请求载荷等价但入口形态不同，"从历史候选图直接生视频"要单独补。

其余：dramas 6/19（项目/剧本/大纲/分集/进度，多数由项目聚合 PUT 承载）。**下一步：只剩 3 条 stream 版本（P2）。它们的非流式等价物都已迁移，差别仅在响应传输方式，不影响最终提示词内容与落库结果；要做的是 SSE/NDJSON 增量输出体验。媒体域两条 backgrounds 经复核不是能力缺口（见下）。**

### 项目 id 含冒号 → 路由双重编码（2026-09-17 修复）
现象：一键成片工作区报「短剧项目不存在」，但项目**确实在库里**、owner 就是当前登录用户。

根因：`useParams()` 返回的是**未解码**的路径段。一键成片的项目 id 形如
`drama-one-click-film:<uuid>`，冒号在 URL 里是 `%3A`，所以客户端拿到
`drama-one-click-film%3A<uuid>`，再 `encodeURIComponent` 一次就成了 `%253A`；
服务端解码一次得到字面量 `%3A`，按 id 查库必然落空。

**只有一键成片会中招**：其他项目 id（`drama-lab-...`、`drama-xxx`）不含冒号，
编码前后完全一样，所以同样的写法在创作工坊/普通短剧那边看不出任何问题。
这也是为什么之前 188→234 项测试全绿却没抓到它 —— 测试断言的是"源码里有没有调对路由"，
而这个 bug 出在**运行时的 id 取值**上。

定位方法（三条证据，缺一条都不该下结论）：
1. 直接查库：`vozeb_pro_drama_projects` 里 id 完全匹配，owner 是登录用户 → 排除"真的不存在"；
2. 临时探针 API 路由：URL 里的 `%3A` 到达服务端时是明文冒号 → 证明 Next 只解码一次，服务端无罪；
3. 临时探针客户端页：`useParams()` 返回 `%3A`，再编码得到 `%253A` → 锁定客户端。

修复：`src/lib/one-click/route-id.ts` 的 `decodeOneClickRouteId`（幂等解码），
接在工作区页与画布跳转页两处。守卫测试 `route-id.test.ts` 同时断言"helper 行为"与
"两个入口真的用了它"，否则光有 helper 不算修好。

**注意表名**：库里的表带 `vozeb_pro_` 前缀（`vozeb_pro_drama_projects`），
不是代码里看到的 `drama_projects`；直接写 SQL 排查时别查错表。

**方法论教训**：报错文案要看准是哪一层抛的。这次是 `getDramaProjectForUser` 的
「短剧项目不存在」，而不是路由自己的「一键成片项目不存在」——前者说明"按 id 查不到"，
后者才是"前缀校验没过"。分清这两个，能少走一半弯路。

### 计费归属曾被静默丢弃（2026-09-17 修复，最高优先级教训）
之前记的是「上游请求 context 必须写 `featureModule: "one-click-film"`」，路由确实写了，**但服务端把它丢了**：
- `generation-task-types.ts` 里 `featureModule?: "drama-lab"` 只允许一个取值；
- `generation-task-store.ts` 落库与回读两处都写成 `=== "drama-lab" ? "drama-lab" : undefined`，于是 "one-click-film" 被抹成 undefined；
- `featureModuleForGenerationContext` 也只认 drama-lab，归属回落到通用 `drama`。

结果就是商单的钱记到教学版账上 —— 正是之前一直想避免的那件事，只是当时只检查了「路由有没有写」，没检查「服务端有没有留」。
修复：类型放宽为 `"drama-lab" | "one-click-film"`、新增 `normalizeFeatureModule` 白名单（两处共用）、解析函数把 one-click-film 排在 drama-lab 之前（含 projectId 前缀兜底）。守卫见 `one-click-film/billing-attribution.test.ts`。

**方法论教训**：验证"参数有没有传对"必须一路跟到持久化，不能只看发送端。发送端写对 + 接收端白名单没放行 = 等于没传，而且不报错。这与「后端有、前端没接 = 等于没做」是同一类错误的两个方向。

### classic-video-prompt-polish-stream 在 L 里本身就是坏的（2026-09-17 运行时核实）
这条要特别记住，因为它同时纠正了我之前写下的一个**错误结论**。

我此前在矩阵里写「3 条 stream 的非流式等价物都已迁移，差别仅在响应传输方式」。逐条核对后发现**对其中一条不成立**：
- `universal-segment-prompt-stream` / `universal-segment-polish-stream` → 确有非流式孪生（`universal-segment-prompt`），V 的 `universal-prompt` 路由已同时覆盖 generate 与 polish 两种 mode，结论成立；
- `classic-video-prompt-polish-stream` → **L 里没有非流式孪生**，它是 L 唯一的「经典模式视频提示词 AI 润色」入口。V 的 `rebuild-video-prompt` 只是本地模板重排（不调模型），**不是**它的等价物。所以这里原本是一个真实能力缺口，不是传输方式差异。

但继续查下去发现更关键的事实：**这条路由在 L 里根本跑不通。**
- `storyboards.js:1024` 调用 `promptI18n.getClassicVideoPromptPolishPrompt()`；
- 该函数在整个 L 仓库里**只有这一处调用，没有任何定义**，也不在 `promptI18n` 的 `module.exports` 里；
- 运行时实测（`require('./src/services/promptI18n')`）：`typeof === "undefined"`、`hasOwnProperty === false`；
- 调用点被 try/catch 包着，所以每次请求都抛 `TypeError: ... is not a function`，然后 `writeNd({type:'error'})` 收尾。

即用户在 L 上点「润色经典视频提示词」只会拿到报错，从未真正产出过内容。

**结论：不迁移，且不该迁移。** 1:1 复刻的基准是「L 已验证的行为」，而这条从未被验证过——照抄只会把一个必然失败的按钮搬到 V 里。要做的话得先自己设计系统提示词，那就属于新功能，需要产品确认，不能挂在「照抄 L」名下。

**方法论教训**：判断"L 有 V 没有"之前，先确认**L 那条真的能跑**。基准的价值来自它被验证过；照抄一个坏功能比不抄更糟。

### compose 的 featureModule 是"drama-lab"但不是计费泄漏（2026-09-17 核实）
`drama-lab-final-video-service.ts` 把 render 任务的 `featureModule` 写死成 `"drama-lab"`，一键成片的 compose 步复用了它。核实结论：**不需要改**，理由是证据而不是感觉：
- 该服务里搜不到 `fetchInternalApi` / `systemAi` / `charge` / `points` / `upstream`，成片只跑本地 ffmpeg concat，不产生上游调用与扣费；
- `featureModule` 在全仓没有任何用量聚合读取（无 `feature_module` 列，也没有 group/sum/report 之类的使用）；
- `requireFeatureModuleEnabled` 是空实现，所以这个标签也不会导致 403。

即它只是任务记录上的一个标签。若将来成片改为调用付费的云端合成，这里必须同时改成按发起模块取值 —— 到那时它就变成真的计费问题。

### backgrounds 两条不是能力缺口（2026-09-17 复核）
此前文档写"V 用场景资产体系承载，未做等价端点"，措辞含糊。复核结论：
- `POST /images/episode/:id/backgrounds/extract` 已由 `POST /extract-assets`（assetType=scene）等价承载。L 走 `promptI18n.getSceneExtractionPrompt`（键 `scene_extraction`），V 的 `drama-lab-production-asset-defaults.json` 中同键提示词与 L 中文分支逐条对应，含"纯背景、不得包含人物"，输出字段同为 location/time/prompt。
- `GET /images/episode/:id/backgrounds` 是 `storyboards JOIN scenes` 的纯读投影，数据已随项目聚合返回（`shots[].sceneId` + `scenes[]`），不需要独立端点。
所以媒体域剩的是"端点形态"问题，不是能力缺失。别再当成待迁移功能重复实现。

### upscale 的 2 倍已实测
不是只靠源码字符串断言：用 37x23（奇数、非整数比例）实跑 sharp `resize(w*2, h*2, { kernel: "lanczos3" })`，输出精确 74x46，确认是精确乘法而非四舍五入。

### L §1「故事风格 / 剧本类型」在一键成片是哑参数，不要加（2026-09-18 核实）
第三次遇到同类问题，判定方法已成型：**字段能持久化 ≠ 会被消费**。

**证据链：**
- `normalizeProject`（drama-project-service.ts:293-294）确实会保存 `storyStyle` / `scriptType`，所以"能存下来"。
- 但一键成片的 `script` 步骤（executor.ts:14-18）**只校验各分集是否有剧本文本**，不生成剧本：
  `missing = episodeIds.filter(id => !episode.script.trim())` → 缺就报错，有就直接 success。
- 拆解服务只消费 `project.style` 与 `project.ratio`（extraction-service.ts:115、405），**不读** 这两个字段。
- 资产提取服务两个都不读（零命中）。
- 这两个字段的唯一真实消费方是 `generateDramaLabScript` / `startDramaLabStoryGeneration`，
  而它们只挂在 `/api/drama-lab/projects/[id]/generate-script` 与 `/api/drama-lab/projects` 上，
  一键成片链路不可达（且按计费归属规则也不该直接调教学版路由）。

**结论：** 在一键成片 §1 放这两个下拉，用户选了会存进项目，但对拆解/生图/生视频的提示词毫无影响 —— 典型哑参数。
要让它们生效，前提是先给一键成片做自己的"AI 生成剧本"链路（含 featureModule 归属），那是独立功能，需产品确认。
V 当前 §1 的定位是"粘贴/导入剧本 + 保存"，不含 AI 生成剧本，所以缺这两个下拉是**设计一致的**，不是遗漏。

**三次同类问题的统一判定法：** 给控件做 UI 前，把它的值一路跟到真正生效的终点：
- §5 视频配置 → 终点是 ffmpeg 参数（`-c copy` 无滤镜 → 做不到）
- §4 序列图模式 → 终点是生图请求的栅格参数（V 没有 → 缺能力）
- §1 故事风格/剧本类型 → 终点是提示词（消费方在一键成片不可达 → 哑参数）
跟不到终点就不要摆控件，宁缺勿哑。

### L §4「序列图模式」（四宫格/九宫格）在 V 是真能力缺口（2026-09-18 核实）
做 §4 配置行时逐条核实，这条**不是**文案差异，是真缺功能。先纠正我自己一个错误结论。

**我一开始搜 `quad_grid|nine_grid` 在 L 后端零命中，就写下「L 后端不消费栅格值」——这是错的。**
改用中文词搜索后发现 L 后端有完整实现：
- `imageService.js:187 buildQuadGridPrompt`：用四种相机角度（平视/仰拍/俯拍/侧面）各生成一条帧提示词，拼成一张 2×2 序列图的提示词；
- `imageService.js:1559`：`row.frame_type === 'quad_grid'` → `splitQuadGridToImages` 自动把整图拆成 4 张子图并各建 `image_generations` 记录；
- `imageService.js:1570`：`nine_grid` → `splitNineGridToImages` 同理拆 9 张；
- 前端 `FilmCreate.vue:4404 / 6964`：`frame_type: gridMode !== 'single' ? gridMode : undefined` 把值送上去。
教训：**搜英文键名零命中不等于功能不存在**，实现可能用中文注释/函数名。要换词再搜一遍才能下结论。

**V 侧现状（三处都缺）：**
- `one-click-film/.../generate-image/route.ts` 只发 `config: { model, size: project.ratio }`，没有栅格参数；
- 全 server 端搜 `sequenceMode` **零引用**；
- `DramaLabStoryboardSequenceMode`（single/quad_grid/nine_grid）类型存在，但 `drama-lab-storyboard-constraints.tsx:92` 的 select 是 `{onSequenceModeChange && ...}` 条件渲染，而 `drama-workflow-lab-project-complete.tsx:5760-5769` **没传这个回调** → 连创作工坊里都是不显示的死代码。
- `drama-lab-storyboard-options.test.ts:32` 明确断言 `sequenceMode` 不进拆解 options（`toEqual({ shotCount: 12 })`），即刻意不持久化。

**注意别和资产四视图搞混**：V 的 `four_view`（`asset-image-service.ts:29` 角色硬编码 four_view）是**资产设定图**的机制，靠提示词合同产出 2×2 参考表，**没有服务端拆图**；L 的序列图模式是**分镜图**的机制，有拆图。两者不是同一件事，不能拿前者充当后者。

**处置：§4 配置行先不放「序列图模式」下拉。** 要做需要三件事齐全：生图路由接收栅格参数 → 四/九宫格提示词构造器（多机位）→ 服务端拆图并回写多条记录。属后端工作量，需产品确认。

### L §5「视频配置」在 V 侧目前无法 1:1 复刻（2026-09-18 核实）
做主区 section 对齐时逐条核实了 L 的 §5，结论要记住，否则很容易加出一排点了不生效的控件。

**L 的 §5 实际只有 4 项是活的**：分辨率、字幕、对白烧录、水印。
「配乐 / 音效 / 画质」在 `FilmCreate.vue` 1583–1600 被 `<!-- -->` 整段注释掉 → 死代码，不复刻。

**V 侧这 4 项目前都没有落地能力**，证据：
- `drama-lab-final-video-service.ts:104` 只有一次 ffmpeg 调用：
  `["-y","-f","concat","-safe","0","-i",concatFile,"-c","copy",output]`
  —— `-c copy` 意味着**不转码、无滤镜**，所以分辨率/水印/烧字幕在这条链路上物理上做不到。
- snapshot 里确实带了 `audioUrl` / `dialogueAudioUrl` / `narrationAudioUrl` / `subtitle`（L 243–244 写入），
  但全仓检索后确认**这些字段从未被任何代码消费**，只有 `drama-lab-final-video-service.test.ts:254-255` 断言过它们的值。
  也就是说配音与字幕数据只是躺在快照里，没有混流/压字幕的实现。
- L 侧对应的 `burn_narration_subtitles` / `burn_dialogue_audio` 在 V 全仓 `MISS`。

**处置：不要先把 §5 的 UI 摆上去。** 那会正中「只有壳子」的老问题 —— 用户开了「烧录字幕」但成片里没有字幕，比没有这个开关更糟。
要做就得先改成片链路（转码 + `-vf subtitles/scale/overlay` + 音频混流），这是后端工作量，需要产品先确认是否要投。

**方法论**：给一个开关做 UI 之前，先把它的值一路跟到真正生效的地方（这里是 ffmpeg 参数）。
字段存在 ≠ 功能存在；快照里有 ≠ 被消费。这与之前「后端有、前端没接 = 等于没做」和
「发送端写对、接收端白名单没放行 = 等于没传」是同一类错误的第三个方向。

### 死代码守卫坑：请求路径不要插变量
`dead-route-guard` 靠"请求路径字面量里出现路由的最后一个静态段"来判定有没有调用方。把段名写成 `\`${base}/shots/${id}/${kind}/...\`` 会让它找不到调用方（我写 images/videos 删除时就中了这一枪，videos 直接被判为死代码）。所以按 kind 分支时要把路径写成字面量，别插变量。顺带一提，`images` 当时是"假通过"——因为 `batch-generate-images` 里也含 images 这个子串。

### sharp 依赖差异
L 把 sharp 当可选依赖（`try { require('sharp') }`，缺失时报错），V 的 package.json 里 sharp 是正式依赖，且 `image-layer-output` 等服务都是静态 `import sharp from "sharp"`。所以 V 侧不要再写 optional require 分支 —— 那会触发 TS2349（`typeof import("sharp")` 无调用签名），而且把构建期问题伪装成运行期分支。

### 白名单坑
服务端新推断/新写入的分镜字段必须同时加进 `shot-crud.ts` 的白名单，否则会被静默丢弃。`batch-infer-params` 就因此补了 `lightingStyle` / `depthOfField`。测试要把「UI 能写」与「服务端能收」绑在一条断言里。

### 类型坑
`voiceProfile` 只在 `DramaCharacter` 上，`DramaScene`/`DramaProp` 没有。按 kind 统一处理三类资产时用 `OneClickAsset`（服务端）/ `PanelAsset`（UI）别名，否则 TS2339。

已建的一键成片自有路由（生成类均带 `featureModule: "one-click-film"`，不再经由创作工坊）：
`POST/PUT/DELETE shots`、`insert-before`、`frame-prompts[/:frameType]`、`generate-image`、`generate-video`、`generate-frame`、`extract-tail-frame`、`accept-first-frame-candidate`、`polish-prompt`、`rebuild-video-prompt`、`regenerate-layout-description`、`split-by-audio`、`universal-prompt`、`export`、`tasks*`、`episode-canvas`

### 从 L 逐字抄录的提示词契约（勿改写）
`universal-prompt-l-system.json`、`image-polish-l-system.json`、`layout-regenerate-l-system.json`、`angle-l-contract.json`（后者经全部 96 种视角组合与 L 输出逐一校验一致）。

### 计费归属坑（重要）
客户端助手 `createImageGenerationTask` 的 `taskContext()` **不含 featureModule 字段**。照抄创作工坊资产面板那条客户端生图链路，商单用量会记不到 one-click-film 名下。所有生成类操作必须走服务端路由并显式写 `featureModule: "one-click-film"`。

### 另一个坑：不能用"拼装后的提示词是否为空"做校验
`buildDramaLabAssetFinalPrompt` 总会先拼画风块与版式合同，返回值**永远非空**。我一开始写的 `if (!prompt.trim()) throw` 是死代码，空资产会被放行、只带样板没主体。已改为校验真实描述来源（`hasVisualSubject`）。

### UI 现状
分镜卡片列表 + 编辑弹窗已可用：新增/前插/删除、三模式切换（经典/首尾帧/全能）、单镜生成图/视频、提取尾帧、应用候选首帧、AI 生成帧提示词、AI 润色图片提示词、重建视频提示词、AI 重算空间布局、按音频拆镜（预览+追加应用）。
资产面板已可用：三域切换、生成生图提示词、从参考图提取特征、提炼视觉锚点、AI 生成阶段造型、生成四视图/设定图、参考图上传/设为主图/移除。

资产增删：面板顶部新增输入框 + 卡片删除按钮。

本集成片：工作台「合成本集成片」+「下载成片」（服务端持久化 + 3 秒轮询）。

配音：分镜卡显示对白/旁白状态+说话人+音色+错误+播放器；角色音色在资产编辑弹窗配置（音色/语速/朗读指令），服务端 `normalizeOneClickVoiceProfile` 校验非法音色与语速区间。

素材库：`POST assets/:assetId/library`（`save` 存入 / `apply` 取用）。卡片上「存入素材库」「取用素材」，取用走挑选器弹窗。

**资产域与 storyboards/episodes/audio 主体链路已全部覆盖。**

### 已知缺陷
- **协作闸门耦合（P0，未处置）**：`POST /api/one-click-film/projects` 会调 `ensureDramaLabProjectGroup`，把每个一键成片项目写进创作工坊协作组表。所以 `assertDramaLabStageAllowed` 一定查得到组、不会早退，教学版的审批配置会真实拦住商单链路。我先前"未建组时是空操作"的判断是错的。移除该调用前须确认现有项目读取路径是否已依赖该组存在。
- `export` / `split-by-audio` / 新增的 shot CRUD / frame-prompts / generate-image / generate-video 后端已建但**无前端入口**，属死代码，UI 侧仍是最大缺口。
- `sync-generation` 已自建基础版（`sync-runner.ts`）：图片 URL 取 serverUrl→remoteUrl→dataUrl（`ImageTask.result` **没有 `url` 字段**，我一开始写错过）、历史按 taskId+结果幂等、任务丢失则解绑避免锁死。**仍未覆盖**创作工坊那份 439 行里的：写冲突重试、任务上下文错配检测、首尾帧候选与 needs_review 完整分支 —— 保持"未迁移"。

## 血的教训：改链路必须同时改回写

我把 executor 的 images/videos 从创作工坊工作流切到一键成片自有路由后，**引入了"永久 pending"回归**：
调 `sync-generation` 的原本只有创作工坊工作流服务、创作工坊 UI、视频恢复服务（且只经创作工坊路由可达），
通用恢复服务只推进上游任务本身、**不回写分镜**。所以切链路等于把唯一的回写触发点一起摘掉了，
上游成功也没人把 URL 写回分镜。已由 `media-runner` 主动调 `syncOneClickShotGeneration` 补上。

**规律**：在这个仓库里，"提交任务"和"回写结果"是两条独立链路。动其中一条，必须检查另一条还通不通。

## 我犯过的错（勿重复）

| 错误 | 纠正 |
|---|---|
| 复用创作工坊工作流服务，当作对齐 L | 创作工坊不是基线，违反 §9.3 |
| 拿"41 项测试全绿"当迁移达标 | 测试只覆盖服务层/路由层，未覆盖 UI 暴露面与 L 行为等价性 |
| 声称关闭创作工坊会致 403 | 空实现，夸大 |
| 跳过 Task 1 差异矩阵直接写实现 | 基线缺失是一切返工的根因 |
| 建好路由但没有调用方 | 第三轮发现 generate-image/video 是死代码，计费修复其实没生效。已加 `dead-route-guard.test.ts` 守卫，新增死路由会判红 |
| 切换任务提交链路却忘了回写链路 | 导致 images/videos 永久 pending，见上节 |

## L 源码导航

- 路由挂载表：`backend-node/src/routes/index.js`（161 个 `r.get/post/...`）
- 路由写法是 **handler 对象工厂**（`function routes(db, log, cfg) { return { create: (req,res)=>... } }`），不是 Express 装饰器 —— grep `router.post` 会零命中。
- 故事板核心：`services/episodeStoryboardService.js`(75kb)、`framePromptService.js`(33kb)、`promptI18n.js`(133kb)、`universalSegmentPromptBundle.js`(22kb)
- 图片/视频上游：`imageService.js`(86kb)、`videoClient.js`(160kb)、`videoService.js`(24kb)

## 2026-09-18 本轮补齐（6 项缺口，均本地提交未 push）

| commit | 缺口 | 核实要点 |
|---|---|---|
| `8e997446` | 首帧站位（L `lastFrameUseFirstLayoutLock`） | V 原先**无条件**把首帧当尾帧参考：`drama-lab-frame-generation-service.ts` 既加首帧参考图，又注入"首帧布局参考"提示词与"尾帧必须读取首帧布局"契约。三处一起受开关控制才算完整，只关参考图是半截。默认 true，drama-lab 717 项回归不变 |
| `b2facfa4` | 上镜尾帧（L `onUsePrevTailAsFirst`） | 无需新后端：组合上一镜 `extract-tail-frame` + 本镜 `accept-first-frame-candidate`（`replaceExisting=true`）。仅在 first_last 模式且上一镜有视频时出现 |
| `22824a5b` | 继续查询（L `onResumeSbVideoPoll`） | 复用平台共享 `/api/video-tasks/:id` 的 `recoverVideoGenerationTask`（无模块耦合），判定复用 `requiresDramaLabVideoTaskCheck`。只查原任务，绝不再打 generate-video，避免重复扣费。卡上原先完全没有待检查提示，用户会卡死 |
| `72564af6` | 查看提示词 / 手工编辑直达入口 | 给编辑弹窗加 `initialTab`；卡上新增入口按帧模式分流：first_last → frames 页签，其余 → prompts 页签 |
| `d49a90e2` | §2 暂停 / 继续（L `pipelinePaused`） | **L 是客户端标志位，V 不能照抄**：V 父任务由服务端 worker 推进，标志位必须落在 `workflow.paused` 上，否则关页面后 worker 继续启动下一步。语义只挡"启动下一步"，已提交子任务照常跑完、不撤单不退款。继续时重新 `scheduleGenerationTask` 入队 |
| `14371a19` | §1 从剧本库导入（L:333–354） | 新增只读 `GET /api/one-click-film/script-library`；只列 `sourceHandoffId` 前缀为 one-click-film 的项目（教学版剧本不进商单剧本库）。「填入本集」只改编辑框，写库仍复用既有 `PUT /projects/:id`，不建第二套剧本写入语义 |

验证基线（每项均跑过）：tsc 全绿、eslint 全绿、一键成片专项 352 项全绿（起点 343）、drama-lab 回归 717 项不变、`dead-route-guard` 全绿。

### 本轮踩坑
- 断言"declared movement"不存在来验证首帧锁移除是**误判**：该词也出现在生产模板正文里。改断由开关控制的那句"尾帧必须读取首帧布局"。教训不变：字面匹配检查器容易误报，判据要精确到被改动的那一处。
- 卡片处理函数命名以 `use` 开头会被 `react-hooks/rules-of-hooks` 当成 hook 判红（`usePreviousTailAsFirst` → 改 `applyPreviousTailAsFirst`）。
- 往测试文件写断言时，若断言字符串里含 `${...}`，用 JS 模板字符串生成会被就地求值。改用数组 join 逐行拼。

### 剩余未做（3 项，均已核实原因）
1. **§5 视频配置（分辨率/字幕/烧录/水印）** —— V `ffmpeg -c copy` 无转码无滤镜，字段从未进 ffmpeg 参数；加 UI 就是哑参数。L 侧对应项也是注释掉的死代码。
2. **§1 故事风格 / 剧本类型** —— 只被 drama-lab 的 generate-script 消费；一键成片 script 步骤只校验剧本非空。
3. **序列图模式（四宫格 / 九宫格）** —— L 后端有 `buildQuadGridPrompt` / `splitQuadGridToImages` / `splitNineGridToImages`，靠 `frame_type` 触发；V 类型存在但服务端零消费，生图路由只传 `{ model, size }`。**要做必须先补后端**，是唯一还需服务端新增能力的缺口。

## 2026-09-18 追加：把两项"哑参数"做成真的（我先前判定错误，已纠正）

我此前把 §5 视频配置与 §1 故事风格/剧本类型判为"不可做，做了就是骗人"。**这个判断是错的**，
纠正依据是仓库内已有的现成能力：

- `src/app/api/drama/render/route.ts:171-191` 早就用 `subtitles=...:force_style=...` + libx264 烧过硬字幕，
  证明"成片只能 `-c copy`"不是能力上限，只是那条链路当初没接。
- 仓库根 `Dockerfile:43` 装了 `fonts-noto-cjk`，所以中文文字水印有真实字体可用。
- `drama-lab-script-generation-service.ts:34-35` 本来就把 storyStyle/scriptType 经
  `dramaLabStoryOptionLabel` 翻成中文标签注入模型上下文 —— 缺的只是一键成片侧的调用入口。

| commit | 内容 | 关键设计 |
|---|---|---|
| `1cb25794` | 分辨率 / 烧字幕 / 水印真正进 ffmpeg | 新增纯函数 `final-video-compose-args.ts`（归一化 + SRT + argv）与 `final-video-font.ts`（字体探测）。**默认路径必须零变化**：无配置时仍是单次 `-f concat -c copy`，由 `drama-lab-final-video-service.test.ts` 的 `ffmpeg` 调用次数断言锁死 |
| `77fafe03` | storyStyle / scriptType 真正影响产物 | 新增 `POST /api/one-click-film/projects/:id/generate-script`，复用 `generateDramaLabScript`（无模块耦合），结果写回本集剧本并固化本次风格/类型；§1 加梗概输入 + 两个下拉 + 「AI 生成本集剧本」 |

### 这一轮的真实设计约束（别回退）
1. **不转码是默认，转码是例外**：转码会重编码全片（耗时 + 画质损失）。`finalVideoNeedsTranscode` 只在"分辨率变了 / 有字幕文件 / 水印有字体"时为真。缺字体时**跳过水印而不是让成片失败**（有测试）。
2. **composeOptions 进 inputHash**：换配置就是一次新请求，否则会命中旧成片结果，用户以为配置没生效。
3. **SRT 时间轴对所有分镜累加**，包括没字幕的那些，否则后续字幕整体提前。这是最易错处，已用乱序 fixture（order 2 在前）锁死"按 order 排而非按数组序"。
4. **filter 文本必须转义**：中文水印带 `:` `,` 会让整条 filtergraph 解析失败；Windows 盘符冒号同样要转义。

### 本轮踩坑
- 我最初把 concat 拆成"永远两段 ffmpeg"，立刻被既有测试 `expect(deps.ffmpeg).toHaveBeenCalledTimes(1)` 判红。**这是好事**：它正是防止默认路径变慢的护栏。改成只有需要第二段时才拼 joined.mp4。
- 给字幕测试写断言时忘了 fixture 的 shot 根本没有 subtitle 文案，断言拿到的是 `-y`。说明"配置开了"不等于"功能生效"，测试必须提供真实数据。
- fixture 的 shot 是字面量推断类型，没有可选 `subtitle` 字段，写入前要按契约放宽一层。

### 现在只剩 1 项未做
**序列图模式（四宫格 / 九宫格分镜图）** —— 仍需服务端新增拆图能力（L 有 `buildQuadGridPrompt` / `splitQuadGridToImages` / `splitNineGridToImages`，V 的生图路由只传 `{ model, size }`）。这是唯一还需要补上游能力的缺口。

## 2026-09-18 追加：序列图模式（四宫格 / 九宫格）—— 最后一项缺口已补

| commit | 内容 |
|---|---|
| `a0a65f86` | 纯核心：`sequence-grid.ts`（机位表 + 网格提示词 + 切图几何）与 `sequence-grid-split.ts`（sharp 裁剪 + 候选落库），含真实 sharp 集成测试 |
| `cae9f2bc` | 端到端接线：契约字段、生图路由、同步触发、候选选中、卡片模式下拉 |

### 这个模式到底在做什么（别再误解）
上游**只生成一张**图。那一张里是**同一瞬间的 4 或 9 个不同机位**（不是连续剧情）：
L 的机位表 `imageService.js:196` 是 `['平视','仰拍','俯拍','侧面']`，九宫格再加侧面左/右、背面、极端仰/俯、斜侧 45 度。
价值是**一次上游调用换多个候选构图**，且同一次生成的人物长相/画风一致性天然优于分 4 次生成。

**为什么必须拆**：分镜图要当生视频的首帧/参考图。把整张 2x2 拼贴喂给视频模型，它会去动那张拼贴而不是其中一格；
且主参考图/候选挑选逻辑要求每个候选是独立记录。裁剪是纯本地 sharp 操作，**不调模型、不计费**。

### 与 L 的两处故意差异
1. **不烧角标**（用户明确要求）。L 用 SVG composite 在每格左上角烧「左上」「俯拍」（`imageService.js:141-147`），
   但 V 选中的那张会直接作为视频参考图，烧进去的字会出现在成片画面里。V 的机位标签只写进历史记录 prompt 前缀
   （`[俯拍] ...`）供 UI 显示 Tag，像素零文字 —— 有集成测试逐像素断言裁出的格子仍是纯色。
   网格提示词里也额外加了 `Do NOT draw any text, labels or panel numbers inside the image`。
2. **不为每格单独调 AI 生成帧提示词**。L 为 4/9 格各调一次文本模型（`buildQuadGridPrompt` 里 `Promise.all` 4 次）。
   V 复用本镜已备好的关键帧提示词作共同画面描述，只让机位逐格不同 —— 语义等价但省掉 4~9 次文本模型费用。

### 三个非显而易见的坑（都是测试逼出来的）
1. **`appendDramaLabGenerationHistory` 按 taskId 去重**（同 taskId 只留最后一条）。
   逐格调用它会让面板互相挤掉，最后只剩 1 条。改成整批构造后一次性替换。
2. **面板必须带各自的 taskId**（`${gridTaskId}:panel${i}`）。若共用网格图那个 taskId，
   下一次回写（write-back 也调那个助手）会把整组面板连带清空。清理时按 `${taskId}:panel` 前缀过滤，保留网格原图那条。
3. **拆分失败绝不能把已成功的生图判为失败** —— 用户已为那张图付过费。sync 里 try/catch 吞掉错误并保留成功状态，有测试锁死。

### 持久化链路必须三处同改（少一处就静默失效）
`storyboardSequenceMode` 要同时加到：
- `drama-project-contract.ts` 的 `DramaShot`
- `drama-project-service.ts` 的字段归一化（未知值回落 `single`）
- `one-click-film/shot-crud.ts` 的 `EDITABLE_FIELDS` 白名单

漏掉白名单最阴险：前端 PUT 成功、无报错，但字段被丢弃，生图时拿不到模式，拆图链路永不触发。

### 选中候选为什么单开一个动作
`storyboardImageUrl` **故意不在** shot-crud 白名单里（否则调用方能把主图指向任意外部 URL）。
所以在既有 `images/[recordId]` 路由上加 POST：只允许指向**本镜历史里已存在**的记录，
地址由服务端从记录里取，不接受客户端传 URL。主图不自动替换 —— 系统不替用户猜哪个机位更好。

### 剩余
L 迁移的功能缺口至此**全部补完**。序列图的真机效果（模型是否稳定输出无边框等分网格）需要在测试环境实拍验证：
提示词层面的约束已尽力，但模型偶尔画边框是上游行为，必要时再调提示词。

## 2026-09-18 对抗性复审纠正（优先于上文历史结论）
上文“全部补完”“语义等价”结论撤销。实际发现布局未对齐、集数假入口、手动生成未回写、暂停竞态、网格规划擅自简化等，见 docs/audits/2026-09-18-one-click-film-adversarial-recheck.zh-CN.md。
用户授权并行修复，禁止push/deploy。分工：根负责前端布局/弹窗/分集/整合；fix_runtime负责sync/media及独立轮询hook；fix_controls负责engine/orchestration/executor与task路由；layout_audit负责网格L提示词及generate-image。未经行为测试、真实浏览器核验和复审不得宣称完成。唯一已批准L差异：不烧角标，标签只在UI显示。
