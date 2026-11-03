# 交接：2026-10-22 课堂故障今晚修复

> 给接手的 Claude 会话。读完本文就能开工，不依赖之前的对话。
> 写于 2026-10-22 晚。数字均来自下方两份报告，没有重新查询生产库。

## 0. 先读这些

1. 运行手册：[codex-claude-linkage-runbook.zh-CN.md](../codex-claude-linkage-runbook.zh-CN.md)。里面有分工、怎么调用 Codex、服务器脚本、发布流程。
2. 当天最终报告：`docs/reports/2026-10-22-production-classroom-final/production-classroom-final-report.zh-CN.md`
   - 证据在同目录 `evidence/`，包括 `tasks.csv`、`attempts.csv`、`failures.csv`、`metrics.json`。
   - 微信原件：`D:\Tencent\WeChat\...\2026-10\2026-10-22-生产课堂全天最终报告.md`，以及同名 zip，已解压到 `D:\tmp\vz-1022-zip\`。
3. 两天复盘：`D:\Tencent\WeChat\...\2026-10\2026-10-22-two-day-generation-retrospective.zh-CN.md`，第 4 节逐类写了机制和方案。
4. 分项证据（在 `docs/reports/`）：
   - `2026-10-22-image-fallback-media-auth-evidence.zh-CN.md`
   - `2026-10-22-modelbay-asset-diagnostic-loss-evidence.zh-CN.md`
   - `2026-10-22-classroom-first-final-errors.zh-CN.md`

## 1. 规则（用户定的，不能跳）

1. **每个修复先写开发文档，等用户同意后才写代码。** 文档放在 `docs/superpowers/specs/2026-10-22-<topic>.zh-CN.md`。可以多个 bug 合成一份文档，一次审批。
2. 改完代码推 `develop`，测试环境会自动部署。
3. **每次发生产都要用户单独授权**，之前的授权不能沿用。
4. Codex 只测试、只取证，不改代码，不 push，不改生产配置、开关、数据库。
5. **Codex 的测试是生产环境真人测试**：用真实账号在生产画布上操作，生成真实的图片和视频，看最终交付。不是本地 PR fixture，也不是单元测试。会消耗上游额度，开测前向用户报一下预计会跑多少任务。
6. Codex 的结论只当线索。Claude 先在代码里核实，再动手。
7. **动手修之前，先查 GitHub 上是不是已经有别的会话修了。** 已经修过的，先测试；测试还有问题才继续修，不要重复写一遍。具体做法见第 2.1 节。
7. 只提交本次改动的文件。工作区里常有其他会话没提交的改动，不要带进来。

## 2. 当前版本状态（接手先核实）

2026-10-22 晚已核实（接手时用 `bash D:\tmp\vz-mon\ssh.sh D:\tmp\vz-mon\prod-ver.sh` 和 `ssh-stg.sh stg-ver.sh` 再确认一次）：

- **生产**：`bc2643a5`，标签 v0.8.15，对应「Merge pull request #60: fix image overflow 403」。app 18:47、worker 16:38（北京时间）启动。
  - 它**不是** `origin/main` 的最新提交。`origin/main` 已经是 `0127c014`（PR #61，canvas media delivery A/C），比生产更新。当天生产在 0127c014 和 bc2643a5 之间切换过几次，最后停在 bc2643a5。
  - 生产里包含 `c0c04299`（溢出路由签名）。
- **测试**：`c01b4ef7`，即 `origin/develop` 最新提交，13 小时前部署。
- **分支是分叉的**：
  - `bc2643a5..origin/develop` 有 52 个提交，大部分是 BlueGamma 改版，另外还有 `086cb44b`。
  - `origin/develop..bc2643a5` 也有 `c0c04299`、`b5373ce6`、`2b99976f` 这几条只在 main 线上的提交。develop 上对应的提交是 `3f317ca1`，内容相同、sha 不同。
  - 发生产前，要先确认这个分叉合并干净，**不能把 main 线上的修复丢掉**。
- **生产缺的修复**：`086cb44b`（图片结果媒体授权改用实际模型，对应下面的 P0-2）只在 develop 上，生产还没有。
- 发生产时，develop 那 52 个提交会一起上线，测试环境必须整体验收过。如果用户只想上修复、不想带上改版，需要另开 hotfix 分支，在 `bc2643a5` 上 cherry-pick 修复。这一点要问用户。
- 今天整体：917 个任务，成功率 64.01%；08:30 之后 50.31%。图片 08:30 后 143/286，视频 179/354。

### 2.1 每个 bug 动手前先查有没有人修过

经常有多个会话同时在修。比如今天 `c0c04299` / `3f317ca1` 就是同一个溢出修复，在两条分支上各提交了一次。每个 bug 都按下面顺序查：

1. 先同步远程：`git fetch origin --prune`。
2. 搜远程所有分支的提交：`git log --all --oneline --since=3.days -i --grep="<关键词>"`。关键词用错误原文或模块名，比如 `response_format`、`RangeError`、`call stack`、`media auth`、`300`、`6000`、`ModelBay`、`asset`。
3. 搜代码当前状态：`git grep -n "<关键代码>" origin/develop` 和 `origin/main`，对照第 3 节写的代码位置看是不是已经改了。
4. 看开着的 PR 和分支：`gh pr list -R lishen331/VOZEB-PRO --state all --limit 30`，以及 `git branch -r --sort=-committerdate | head -20`。`codex/*` 分支要特别留意。
5. 看文档：`docs/superpowers/specs/` 和 `docs/reports/` 里当天新增的文件。

查到之后分三种情况：

| 情况 | 处理 |
|---|---|
| 已修，并且在测试或生产镜像里 | 不改代码，直接让 Codex 在对应环境真人测试。通过就记为"已修，已验证"；还有问题再针对剩下的问题修 |
| 已修，但只在某个分支或 PR 里，没进 develop | 先读 diff，判断是否完整正确。完整的就合进 develop，推测试环境后测试；不完整的在它基础上补，不要另起炉灶 |
| 没人修 | 按本文写开发文档，等用户同意后修 |

开发文档里，每个 bug 都要写明查的结果：查了什么、找到了哪个 sha 或 PR，或者没找到。

## 3. Bug 清单（按优先级）

数字取自最终报告第 8、9 节，"首错/最终"表示该类错误作为第一次失败、最后一次失败各出现多少个任务。代码位置基于 `origin/develop`，动手前再确认一遍。

### P0-1 RangeError: Maximum call stack size exceeded（图片）
- **规模**：首错 69，最终 19；两天共 76 个任务受影响。
- **证据**：上游已返回 HTTP 200，并且完整响应体已读完（4.2–9MB 的 b64 JSON），之后平台抛出栈溢出。代表任务：`c98de1dc-b1d8-4493-8935-f29a09c7a6da`、`00e16ac7-36c2-4a6a-a835-4fbd04242ca5`、`8b45412c-dede-4651-b906-b7405baac67f`。
- **未知**：没有堆栈，具体是哪个函数还没定位。离线用 Node22 跑 4.5MB/9MB 合成数据没有复现。
- **做法**：
  1. 先补诊断：在异常里保留脱敏后的限帧 stack，并标出阶段（解析 / 规范化 / 下载 / 持久化 / 计费）。
  2. 用生产同版本、同大小量级的响应在本地复现，找出具体函数。
  3. 重点怀疑对整段 base64 用正则、展开参数、递归遍历的地方，例如 `String.fromCharCode(...bytes)`、`JSON` 深度递归、错误脱敏正则。
  4. 上游已成功但解析失败时，不能再发起一次付费生成。
  - 不要靠调大栈上限或加延时来掩盖。

### P0-2 备用渠道图片结果媒体授权 403（平台内部 `/_media`）
- **代表任务**：`0ddccffb-02a8-4cd5-b519-df6900aebf16`、`d311a845-f23b-45a4-aaca-3152a9f67580`。
- **原因（机制已确认）**：签名时用的是原选逻辑模型，校验时比的是实际 `config.model`，两者不一致就拒绝。
- **状态**：`086cb44b` 已在 develop 修复（`web/src/lib/server/image-task-result-service.ts:99` 改用 `task.config.model`），**还没上生产**。
- **做法**：核对修复覆盖了 URL、base64、异步三种结果，以及跨用户、取消、过期都仍会被拒，然后随这次发布上线。

### P0-3 图片溢出路由 403「该上游模型未绑定可用逻辑模型」
- **规模**：两天 96 个终态失败；最后一次出现在 22 日 16:37:39。
- **状态**：`3f317ca1` 已修。当前生产镜像的祖先里有 `c0c04299`，但要核实候选切换、持久化、重试、Worker 恢复每条路径都带上了 `routeLogicalModel`。
- **做法**：以核实为主，补测试，不需要新写逻辑。

### P1-1 `response_format` 参数不兼容（图片）
- **规模**：最终 39；两天共 169。
- **两种报错要分开处理**：
  - `Unknown parameter: 'response_format'.`：这个接口根本不接受该字段，要省略。
  - `image async only supports response_format=url`：异步接口只能传 `url`。
- **出错位置**：主要是 ModelBay 的 `gpt-image-2-5-flare` / `gpt-image-2-5-sunburst` 走 newapi 编辑接口时。
- **代码**：`preferredImageResponseFormat()`（`web/src/app/api/image-tasks/image-task-support.ts:127`）对 newapi 默认选 b64_json，`runOpenAiImageTask()` 会自动加这个字段。
- **做法**：按「渠道 + 实际上游模型 + 生成/编辑」分别配置允许的字段，不要全局删除这个字段。

### P1-2 视频参考素材宽高 300–6000px（课堂里最显眼的报错）
- **规模**：66 个，全是视频。用户截图里的报错是 `Height must be between 300px and 6000px.`。
- **用户提出的现象**：这些图都是平台自己生成的，却接不上视频，说明生图时比例或尺寸就已经超出视频的要求了。
- **现状**：
  - `web/src/lib/seedance-video.ts:163` 只校验**参考视频**的宽高：300–6000、宽高比 0.4–2.5、像素总量。**参考图片没有在提交前校验。**
  - 视频任务的 payload 里没有保存 references，所以没法追查每张被拒的图实际是多少像素。
- **用户要的方案（今晚优先给出，要写进开发文档）**：
  1. **前端校验并用黄框提示**：在画布上把图片连到视频节点、或者选作首尾帧时，读取图片真实宽高。超出 300–6000px、宽高比 0.4–2.5 的，用黄色警示框提示「比例/尺寸不符合视频模型要求」，并阻止提交。规则按目标视频模型的能力档案走，不写死给所有模型。
  2. **生图阶段兜底**：这一点要先问用户再定。方案 A：生图时就限制输出尺寸不超出视频可用范围，可能影响不接视频的用户。方案 B：生图不限制，在送进视频前，服务端按真实字节读取宽高，不合规的做保真缩放或填充，生成一个转换后的副本，原图保留。AGENTS.md 规定不得给生图叠加平台统一尺寸上限，所以**倾向方案 B**，而且必须明示给用户，不能偷偷替换。
  3. 服务端在提交前按真实文件再校验一次；参考素材的宽高、MIME、字节数要写进诊断。
- **验收**：用课堂里失败过的那类图（极窄、极宽、过小）连到视频节点，前端出黄框；合规的图正常生成。

### P1-3 ModelBay 素材接口 HTTP 400/403，细节丢失（视频）
- **规模**：400 有 20 个，403 有 12 个。
- **原因（机制已确认）**：`web/src/app/api/video-generation-tasks/video-generation-route.ts:924` 用 `new SafeCandidateFailure(error.message)` 重新包装，把 `ModelBayAssetError` 里的 status、code、details 丢了。
- **做法**：包装时保留 cause。把白名单内的 status、code、message、request ID、阶段写进管理员诊断，做脱敏和限长，不能把整个 response 或签名 URL 写进去。有了真实细节之后，再判断是鉴权、额度还是策略问题。

### P1-4 视频能力配置
- 参考视频：有 11 个任务报 `official/seedance-2 does not accept reference video input`，说明能力档案错误地允许了参考视频。要修正能力声明，并在前端阻止。
- r2v 分辨率不合法：6 个。参考视频时长超过 15.2 秒：9 个。这两类都要在提交前校验。

### P1-5 提交中断，没有上游任务 ID
- 共 12 个，和 16:37、11:41 两次换容器的时间重合。根治需要发布排空和 worker 平滑退出，这属于基础设施，单独写一份文档，今晚不一定做。

### P2（今晚可以不做）
- 诊断事件的 20KB 预算会挤掉关键事件。
- 7–9 个成功任务缺少生成日志。
- 上游额度不足（约 30 个）、token 或权限问题：这些是**运营问题**，在开发文档里列出来提醒用户就行，不改代码。

## 4. 今晚的执行顺序

1. 核实生产和测试的镜像版本，看第 2 节。
2. 先问用户：这次发生产是带上 develop 的全部 52 个提交，还是只在 `bc2643a5` 上开 hotfix 分支上修复？
2.5 **按 2.1 节逐个查每个 bug 是否已有修复。** 已经修过的，先让 Codex 测试；测试通过的从修复范围里去掉，只把还有问题的写进开发文档。
3. **写一份合并开发文档** `docs/superpowers/specs/2026-10-22-classroom-fixes.zh-CN.md`，覆盖 P0-1、P0-2、P0-3、P1-1、P1-2、P1-3、P1-4。每项写清楚：根因、改什么、不改什么、怎么验证。P1-2 的方案 A / B 让用户选。
4. **交给用户审批**，同意后再写代码。
5. 写代码时按 runbook 第 4 步跑测试、类型检查、lint、prettier，以及画布隔离测试。
6. 推 `develop`，用 `bash D:\tmp\vz-mon\ssh-stg.sh D:\tmp\vz-mon\stg-ver.sh` 确认测试环境的镜像 sha 已更新。
7. **让 Codex 在测试环境做真人回归**，提示词见第 5 节。
8. 把结果汇报给用户，**等用户授权**后发生产，流程见 runbook 的「发生产」一节。
9. 发生产后，**让 Codex 在生产做真人测试**，确认每个 bug 都不再复现。

## 5. 给 Codex 的测试任务模板

调用 `codex` 工具时传 `sandbox: "read-only"`，同一个任务用 `codex-reply` 接着追问。

```
你是 VOZEB PRO 的测试员，只做测试和取证。禁止修改代码、禁止 git push、禁止改生产配置/模型开关/数据库、禁止重启容器。
环境：<生产 https://gammatv.gammablue-x.com | 测试 https://reddetail.gammablue-x.com>
方式：用真实账号在浏览器画布里真人操作并生成，不要写单元测试或本地 fixture。
账号：<用户提供的测试账号>（不要把账号密码写进报告）。
任务：
1. 图片编辑（多参考图）用 gpt-image-2-c、gpt-image-2-all、gpt-image-2-5-flare、gpt-image-2-5-sunburst 各跑 3 次，记录成功/失败、耗时、错误原文。
2. 制造溢出（所选模型满载时），确认不再出现"未绑定可用逻辑模型"403 和 /_media 403。
3. 视频：把极窄/极宽/小于 300px 的图片连到视频节点，确认前端出现黄色提示并阻止提交；合规图片正常出视频。
4. 视频带参考视频用 official/seedance-2，确认前端提前阻止而不是上游报错。
5. 每个任务在服务器上核对：bash D:\tmp\vz-mon\ssh.sh <只读查询脚本>，按 task ID 查 vozeb_pro_generation_tasks 的 status、attempts、error。
返回：每项通过/不通过、task ID、错误原文、截图路径、你对剩余失败的根因判断和把握程度。
预计任务数：<填>，开测前我会先告知用户额度消耗。
```

## 6. 交付完成的标准

- 写一份修复报告，放在 `docs/reports/2026-10-22-classroom-fixes-result.zh-CN.md`，逐个 bug 写明：
  - 修复提交 sha；
  - 测试环境 Codex 真人测试的 task ID 和结果；
  - 生产环境真人测试的 task ID 和结果。
- 写不了或没验证到的，要明确列出来，不能说"全部修好"。
- 生产成功率要用同样的分母口径和课堂数据对比，不能换个口径宣布达标。
