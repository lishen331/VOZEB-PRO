# develop完整集成恢复：发布记录

## 授权与环境边界

用户2026-11-10明确授权开始解决版本回退并要求总结教训、测试先行、再生产。当前先保留本地工作，以e44c0ea7的develop为集成基线合并main及本地热修复；不回滚数据库，不改动其它实例。生产候选不得再直接部署共享测试服。

## 集成证据

- 本地merge父基线：origin/develop e44c0ea759df2b02a10c8f8614882a90348cf1ac；合入main69e2及后续本地热修复/画布子开关，预保全分支recovery/canvas-work-preserved-20261110。
- 全部27个冲突文件逐hunk处理；重点保留五能力模型池、practiceEnabled/学校上下文、Agnes、IP PreviewGroup稳定性及signed图片直返；main侧稳定Modal业务子树、媒体hydration、学校SQL、管理员入口及4K参数修复均保留。
- PDF.js保留5.4.624浏览器兼容性，Sharp保留0.35.5与其安全审计覆盖；pnpm锁文件由合并清单重新生成，不整体用旧锁覆盖需求。
- 本机全量unit：1143files passed /9 skipped，6309tests passed /41 skipped，16分钟；环境跳过不冒充真实上游验收。
- 全量typecheck、ESLint、Prettier、生产build通过。Web audit仅1low，无moderate/high/critical。
- 实际Chromium canvas整份13项通过，含后台两个子开关保存/刷新与独立控制，4K/首尾帧/10001节点/9类节点恢复。
- 独立Modal/Form/App专项3files/36tests及真实DOM保留/销毁/滚动锁/焦点/嵌套回归通过。
- 开发地图与接口索引验证：444 API routes、72 pages、147 tables。

## 防复发

- AGENTS增加环境保留和测试→生产顺序；全局vozeb-hotpatch-release技能同步加入现行版本祖先检查和共享测试只走develop。
- Staging workflow在构建前限制refs/heads/develop及最新远端SHA；部署前再检查当前运行镜像SHA是候选祖先。未知镜像、旧develop、非develop分支或不保留现运行历史一律拒绝。
- guard离线测试先RED再GREEN：拒绝生产候选分支、过期候选、浮动/未知镜像、回退历史；允许正确最新develop升级。

## 未完成阶段

本文件首次提交时仅本地集成验证完成。完整隔离QA E2E、远端Quality、测试恢复及生产晋级尚待；不得据本记录标题宣称已经恢复环境。

## 复制画布与模型池补充验收（本地）

同步脚本原先固定匹配useCanvasPageController()，develop练习画布增加executionProfile参数后该精确锚点不再存在。更新锚点后按原适配规则同步107文件，保留短剧深链定位、分集持久化和返回工坊/一键成片来源分流，未直接手改复制业务。

复制同步后再次生产build（含完整typecheck）通过；短剧画布分镜handoff与跨剧集切换2项desktop通过，手机专属项在desktop按矩阵跳过，不计为通过。模型池新增真实UI专项：先发现fixture错误把生产渠道同时设置practiceEnabled=true而派生为shared，按现有协议改正fixture而不放宽断言；修正后1项通过，涵盖五池/视觉输入、生产用途及练习关闭候选排除、图片视频独立勾选和刷新保留、生产默认值不串改。仅本机localhost与专属QA库，无真实付费生成。

防回退guard测试拆分7个独立场景消除一个同步大测试的总时限累加，无延长测试时限。当前尚未触发远端完整Quality或部署；生产保持原状。

## 远端完整门禁与发布前保全（2026-11-10 上午）

- 候选 `bd8c19eb392d13acf4542c288544dc0faa49e44c` 已推独立恢复分支，Quality run `42746640676`：Docs、安全、全量unit、格式、ESLint、类型和production build通过；完整浏览器199项中163通过、9失败、1重试通过、26跳过，因此未推进develop、未部署生产，PostgreSQL后置门禁尚未执行。
- 失败分组取自CI下载的真实trace/截图：RunningHub旧nth(1)点击了新增练习开关而非“查看”；Next.js文档明确流式notFound可返回200，改为同时断言200/404、真实拒绝页面与noindex，API权限断言保持；手机端等待可见composer排除流式隐藏占位；颜色基线在移开鼠标后读取，不把hover当默认态。没有修改业务代码、延长超时或跳过原权限断言。
- RunningHub本机隔离QA Chromium专项1项通过；其余失败分组正在按desktop/390/430三矩阵重跑，尚不记整体验收通过。
- 测试服发布前新备份：`/opt/vozeb-pro/staging/backups/develop-recovery-20261110-111200`。受限env、app/worker镜像身份、约21MB PostgreSQL custom dump及SHA256已保存，pg_restore目录可读；模型池JSON摘要单独保存，用于发布后比较。本次没有恢复旧库、改动业务配置或触及生产。
- 全局技能主文与reference统一禁止candidate dispatch到共享测试服；记录校验器36项测试通过。浏览器扩展导航持续报timeoutMs初始化错误，仅隔离QA真实Chromium证据有效，不冒充已完成线上点击。

- 随后本机三矩阵失败分组重跑完成：desktop/390/430共12项全部通过（5.3分钟），加RunningHub专项1项通过；测试修改的ESLint、Prettier、全量TypeScript通过。后续候选仍需重新跑完整远端Quality，不能拿这13项替代全量。

## 第二轮完整CI通过与远端新增修复保留

- 第二轮候选 `fa32797d586b185731d97b21009186035a07b9cb` 的完整Quality `42751130882` 已成功，Docs/Web/Security及Browser/PostgreSQL后置门禁均为success。
- 正式推进develop前重新fetch发现新提交 `82acc5e0`、`c0eb7a94`（千问/MiniMax音色适配、删除上游音色、幂等补列与索引）；测试服务器app/worker实际已更新至 `c0eb7a94`，readiness健康。因此没有把旧候选直接覆盖远端，而合并最新develop为 `fa07298f`，无冲突，完整保留新修复。
- 最新合并的音色请求契约与发布guard共15项专项通过，TypeScript、ESLint、Prettier通过；集成树变化后仍重新跑完整CI，旧候选绿色不替代新候选证据。
- 生产只读复核仍为 `69e2dec6`，app/worker及数据库健康。本轮恢复至今未修改生产。

## 并发develop发布复核（2026-11-10 下午）

- 新音色计费提交 `c6992f63` 出现时，其develop Staging workflow `42776639388` 正在构建。避免共享测试并发部署相互覆盖，工作流被develop更新触发取消，最新develop workflow `42777915932` 正在部署 `1b5465af`。没有手动部署候选镜像。
- 最新develop新增 `a00c22d8`（千问设计试听格式）、`1b5465af`（MiniMax空音色删除语义），再次合入候选，无冲突；音色上游、计费和删音色专项共69项通过，TypeScript通过。
- 最终整合候选为 `c4617b791dc2b25848d66e2ba785c26bf3969722`（未含发布记录后续新commit）。目标独立分支必须再次跑完整Quality；期间继续在测试服部署develop。必须等develop部署结束、核对实际app/worker SHA后，再以候选祖先检查发布恢复集成版本。

## 当前暂停交接：三个画布交互热修复（2026-11-10 晚）

### 最新授权与停止边界

用户要求先处理并热更新生产三个问题，修复/推送；随后等待Claude完成音频节点改动，再继续之前“生产热补丁固化→最新develop集成→测试验收→生产发布”的整批工作。用户特别要求先记录进度，避免协作者正在编辑的音频节点遭覆盖。

**当前仅调查、尚未修改任何业务源码、尚未热更新、尚未推送本组三个修复。应先等待用户/协作者确认Claude音频节点工作已结束再继续实现。** 不从这里发起候选Staging dispatch，不更改测试/生产镜像，生产仍保持已核实的 `sha-69e2dec6d52e1d6fd4ce1956d8c128ea6445e447`（app与worker相同）。

### 需求映射（新一轮）

1. 音频节点使用千问/MiniMax音色试听：播放后再点暂停必须真正停止。初步源码证据：`web/src/components/voice-selector.tsx` 的 `VoicePreviewButton` 只切本地 `playing` React state，既未保存 `new Audio(url)` 实例也未调用 `audio.pause()`；这是明确的前端交互缺陷，恰属Claude正在改的音频范围，暂不触碰。`audio-settings-panel.tsx` 另有Audio对象引用并调用pause的实现，需区分这两种入口，不能误改无关预览。
2. 图片/视频开始生成后禁用/移除用户停止生成入口，避免只abort客户端等待而上游仍运行、用户损失费用。初步证据：普通/短剧画布共享 `canvas-node-prompt-panel.tsx` 当前只要 `isRunning` 就提供“停止生成”；`use-canvas-task-runtime.tsx` 的停止只abort本地 `AbortController` 并清理loading元数据，未保证上游任务取消。需覆盖Image/Panorama/Video（含文本节点进入图片生成的实际模式）；Audio与Text是否仍可停止保留。复制画布只能使用现有sync脚本同步普通画布源码。
3. 只隐藏画布图片参数的 `4K` 清晰度档位和视频的 `1080P` 清晰度档位；不隐藏图片4K尺寸比例、不改全局Agent工作台、不回写/抹除节点已有参数/历史快照。初步落点是共享 `creative-generation-preferences.tsx` 的清晰度组选项，由普通Canvas与Drama Canvas props明确控制；过滤只影响Canvas显示选项，原配置读值、提交参数与其他工作台保持。

### 当前环境/分支快照

- 当前恢复worktree `D:\Claude code programe\VOZEB-PRO\VOZEB-PRO\.worktrees\page-defects-main-baseline-20261109`，分支 `fix/develop-recovery-20261110`，HEAD `6292d8f0ed172fff81dc7b5809d52d2bc68d8605`；这是尚未含之后5个develop提交的旧整合候选。不要直接推至develop或部署。
- 最新origin/develop `a4662aa911447baa5b65f6058479c0fb789ca8b3`，包含Claude仍在演进的克隆/设计音频实现；origin/main `69e2dec6d52e1d6fd4ce1956d8c128ea6445e447`。
- Staging当前已部署 `sha-a4662aa9`，app与generation-worker一致，readiness/DB/schema/encryption/worker心跳全部健康。此前临时音频提交触发的旧候选workflow run `42781811633` 已失败：E2E中管理社交地址输入因重复placeholder造成strict-mode失败，移动端Composer中性颜色回归失败；不是恢复基线合并错误的证据，需修正后新候选重跑。
- Production只读实测：app与worker同为 `sha-69e2dec6`，readiness健康，数据库/PostgreSQL schema/encryption及worker心跳正常。现存热补丁目录：`image-contain-20261105`、`canvas-parameter-cache-20261110`、`admin-entry-20261109`、`canvas-4k-video-custom-20261109`。已验证之前4K参数保留与1080P之外的自定义清晰度隐藏已由canvas-4k文件补丁实现，2026-11-10缓存manifest补丁仍在；这轮需求是再隐藏图片清晰度4K和视频1080P预设，不等于回滚旧4K生成参数修复。
- 测试发布保护仍有效：共享staging只允许最新develop并检查当前部署祖先。用户当前授权是生产指定热补丁，不能把临时修复候选dispatch到共享staging。

### 恢复执行清单

待用户再次确认Claude工作结束后：

1. 先读取最新 `origin/develop`、Claude已完成的音频节点实际diff/commit、恢复候选历史以及生产热补丁manifest/after哈希；确认无活动编辑重叠。
2. 先给音频试听暂停加Audio实例引用与停播回归；不要覆盖Claude音频克隆/设计/上游任务链路。再按失败回归修Canvas Image/Video stop UI，并添加显式“只隐藏分辨率选项”的props和不改旧值测试。
3. 按Canvas单元/真实Chromium与desktop/390/430专项验证；跑typecheck、ESLint、Prettier、生产build及完整Quality，检查音频与超管、模型池既有功能。
4. 按用户授权仅对production做三项热补丁：固定baseline image/BUILD_ID；逐文件精确hash匹配并备份；RSC/immutable静态资源使用新地址/manifest，不能同URL覆盖；客户端功能按画布范围，app只在SSR patch需要时重启；Worker、DB、生成配置不变。验证`gammatv`和`edu`两域名真实新bundle hash/readiness。
5. 更新本记录并单独push修复分支后停止；不推develop、不部署测试、不发布正式production image，直到Claude音频完成并用户确认继续整批流程。

## 生产三项Canvas临时热修复已应用（用户追加授权，2026-11-10 晚）

本节更新并取代上一节“当前尚未热更新”的阶段性状态。用户明确要求先热更新这三项到生产，后续再随Claude音频改动一起完成源码/测试/正式发布；因此本次直接补丁生产当前运行bundle，**不推整合分支、不更新测试服、不合并或发布镜像**。

### 生产行为改动

1. 千问/MiniMax的Canvas音色试听按钮改为持有Audio实例；再次点击会调用`pause()`、清除实例并回到播放态；结束/错误只清理当前实例，避免过期回调影响新试听。
2. 普通Canvas和短剧Canvas里，图片/全景/视频生成中不再允许停止本地等待；按钮禁用、aria-label为“生成中”。文本、音频任务仍可停止。配置信息节点同按其generationMode区分。只禁止用户停止客户端请求，不试图声称支持取消上游任务。图像/视频已提交任务不会因为点击而丢失本地回收链。
3. 只在Canvas/短剧Canvas参数面板移除图片清晰度`4K`档与视频`1080P`档；1K/2K、智能/480P/720P和其他模型档位保持。过滤覆盖默认档与能力配置声明档。原Node metadata、全局默认、生成请求映射及其他 `/create` 工作台均未改；节点已存值不会被代码写回/清空，旧值仍能显示摘要但不可再从选项中选取。

### 发布基线、备份和回滚

- 基线生产app/worker均仍为镜像`sha-69e2dec6d52e1d6fd4ce1956d8c128ea6445e447`，`BUILD_ID=P59sr1hudwDZ_mQsklIIPP`。仅重启`vozeb-pro` app；Worker、数据库、配置、模型渠道未修改。
- 备份：`/opt/vozeb-pro/production/hotpatches/canvas-audio-stop-quality-20261110/`。10个原运行文件逐个SHA256保存于`before.sha256`；`applied.json`记录6个SSR/路由清单覆盖文件与4个immutable新静态别名的before/after SHA；`manifest.json`记目标范围和验收边界；`rollback.sh`已`bash -n`通过，执行前核对镜像/BUILD_ID及6个服务端after哈希，再恢复备份并只重启app。回滚保留新静态别名以兼容已加载页面；尚未运行回滚。
- 新静态资源URL：`3vti2n4hiqwqp.hotfix-fbcafe2089c9.js`、`1gq8apnp2z73f.hotfix-df1643cdb8ac.js`、`2qymhwwjq-8cd.hotfix-e68cf92c7a1e.js`、`3ixbyk-3gnhup.hotfix-ae7822ea28b4.js`。保留旧URL和文件供immutable旧缓存页面使用；普通/短剧画布manifest仅引用对应新地址，创作页`/create`仍使用旧参数选项bundle。

### 验证证据与限制

- 应用客户端与SSR补丁在修改前基于生产原文件内存演练：10个变更路径、14个锚点替换；所有产物经`vm.Script`语法检查和精确基线SHA校验。新URL后缀与内容SHA一致。
- 从生产bundle隔离调用实际编译后的Qwen/MiniMax共用`VoicePreviewButton`函数，用FakeAudio回归：播放调用1次、第二次点击pause调用1次、状态与引用清空。
- 运行态断言确认stop allowlist仅`text/audio`；image/video/panorama禁用。默认及模型声明能力下都过滤image 4K/video 1080P；2K/720P保留，隐藏UI不写入旧配置。
- `gammatv.gammablue-x.com`、`edu.gammablue-x.com`两域名的4个新静态URL全部HTTP成功且SHA256精确匹配；响应为immutable一年缓存，旧地址保留。
- 重启后readiness=ready；PostgreSQL/Schema/encryption和Worker heartbeat健康，app/worker仍同镜像SHA。`bash -n rollback.sh`通过。
- **生产登录态人工点击尚未完成**：当前验收浏览器打开的是生产登录页、没有登录态；本次没有输入或传输凭据。故不把真实项目中的按钮点击/参数组合声称为已浏览器验收。用户需重新加载现有画布页面以获得新manifest/URL。
- 未改源码、未推GitHub、未部署测试环境；整批develop恢复候选仍暂停。本地恢复worktree历史里有一个新的文档提交，最新协作者音频实现未整合；待Claude完成并用户指示后再按现行develop对齐、专项测试、完整CI、测试验收、用户确认后正式生产发布。

### 三项热修复最终运行核验（2026-11-10 21:07 CST）

- app于`2026-11-10T13:07:33.980383812Z`重启；Worker StartedAt仍为`2026-11-09T13:28:07.054147088Z`，容器镜像未变，证明本次没有重启或替换Worker。
- restart后本机readiness仍ready；数据库/Schema/encryption healthy，Worker heartbeat fresh。`gammatv`和`edu`两域名各自下载4个唯一资源URL，响应均HTTP成功、SHA256等于after清单，Cache-Control为`public,max-age=31536000,immutable`。
- 从生产静态bundle抽取并执行实际编译的音色试听按钮函数，用FakeAudio验证play一次后再次点击调用pause一次、清理实例；图片4K/视频1080P默认值与profile能力声明过滤断言通过；Canvas Image/Panorama/Video stop按钮disabled与no-op分支、Text/Audio stop分支均经JS语法/定向条件断言。
- Browser打开生产首页显示登录页，无法看到受保护Canvas页面；没有把静态验证冒充生产真实DOM点击验证，没有发起收费生成，用户重新加载/登录后仍需人工确认交互。
- 操作回滚脚本`rollback.sh`有baseline image/BUILD_ID和SSR/Manifest after-hash guard、`bash -n`通过；不会删掉新静态别名，兼容已加载页面。尚未执行回滚。
