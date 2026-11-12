# 2026-10-22 生产环境 15 账号画布复测报告（A/C 部署后阶段完整统计）

> **报告状态：课堂开始时按要求暂停后的完整阶段报告，不是全量验收报告。**本报告覆盖本轮已发起并能用任务 ID 对账的生产任务；所有未测能力、低样本模型、尚未核清的节点关联和账务都明确列出，不把它们写成通过。  
> 时区：Asia/Shanghai。账号统一用 U01–U15 脱敏；登录态、密码、token 均未写入本报告或仓库。

## 1. 结算边界与结论

### 1.1 结论摘要

- 本轮在生产版本 **v0.8.16**（PR #61 合入 `main`，merge `0127c014bae1dc13c2ee1365dda698ca2e55ec12`）上使用 15 个真实普通用户账号、真实 Canvas 节点发起生成。生产 readiness 曾返回 HTTP 200，数据库和 generation worker 健康。
- 按已取得任务 ID、服务端终态和逐任务目标清单统计：**307 个任务，成功 295，失败 12，任务终态成功率 96.09%**。其中 269 个任务有只读数据库/Canvas 项目快照审计；再加本轮视频文生视频 37 个已完成任务和先行 smoke 1 个。
- 这不是“所有画布能力通过”：**ModelBay 图像结果媒体 403 在 PR #61 生产部署后仍重现**；`gpt-image-2.5-sunburst` 有 5/13 任务失败。这个模型建议先关闭或隐藏，直到修复在测试环境验证、且生产回归通过。
- 12 个服务端任务失败由两类构成：图片媒体交付 5 个；文本服务/权限错误 7 个。没有视频文生视频任务失败，但 `cdance2.0-fast-0807` 只有 2 个样本、`cdance2.0-mini-0807` 0 个样本；图生视频和视频参考各只有 1 条 smoke，不能给出能力稳定性结论。
- 任务成功不等于刷新后节点可见。269 个任务的快照审计中，257 个服务端成功，但只找到 **246 个成功状态且有内容的对应 Canvas 节点**；其中部分文本/图像批次在同账号项目上有重叠并发写入，故这是“项目快照关联未完全证明”，不能直接全部归因为产品丢写，也不能宣称 100% UI 交付。新增 38 个视频文生视频任务是独立画布逐个核验，38/38 刷新后成功且视频可播放。
- 没有改生产配置、没有在本轮修代码、没有新增 GitHub 推送；`develop`/测试环境没有因本轮报告而部署新改动。

### 1.2 任务范围与分母

| 能力/证据来源 | 任务数 | 成功 | 失败 | 任务成功率 | 说明 |
| --- | ---: | ---: | ---: | ---: | --- |
| 文本（数据库逐任务目标清单） | 176 | 169 | 7 | 96.02% | 15 个文本模型目录项中，常规模型达到每模型 16–17 个任务；权限/服务异常型号样本不足 |
| 图片（数据库逐任务目标清单） | 91 | 86 | 5 | 94.51% | 7 个用户选择模型各 13 个任务；另一个图片目录项没有独立选型样本 |
| 视频（先前图生/参考 smoke + 本轮 T2V） | 40 | 40 | 0 | 100.00% | 38 个 T2V（含先行 smoke），另有图生视频 1、视频参考 1；参考能力样本不够 |
| **合计** | **307** | **295** | **12** | **96.09%** | 仅统计已创建且纳入任务 ID 对账的生成任务，不含没有创建 task ID 的 HTTP 拒绝 |

口径说明：269 条快照 SQL 目标记录终态为 257 success/12 error/0 pending/0 running；视频 runner 另记录 37 条完成结果；先行 T2V smoke 另 1 条。上一阶段 10/20、10/21 报告各自冻结的分母未合并进来。重复提交尝试、无 task ID 的请求拒绝不伪造为服务端任务，单独记录在失败说明中。

### 1.3 操作节奏和并发边界

- 15/15 账号登录态最终核验通过，均为普通用户且 `/api/auth/session`、模型目录和 Canvas 项目接口可读；15 个视频测试画布为独立项目/节点。
- 最初的并行登录浏览器批次中只有 7 个上下文真正发送登录 POST，其余在按钮可用/导航等待阶段未完成；之后逐个补齐，15 个账号都成功建立并验证。**不能把它描述成 15 人同时登录压力通过。**
- 文本可靠性重复波次并发 4；图片重复波次并发 4；视频文生视频 runner 并发 2，并避免同一账号同时生成。第一轮文本另有 14 个账号近同时发起波次。它覆盖 15 个账号，但不等于 15 人持续高并发课堂压测。
- 文本、图片在 10/22 06:19–06:39 有重叠的并发波次，且部分账号在相同项目中累积多个节点。此并发会污染“任务 ID ↔ 最新项目快照节点”的逐项关联；需在课堂后以账号串行/独立画布补核，不把不确定的 11 条关联空缺都算成产品故障。

## 2. 整体成功率、耗时和节点交付

### 2.1 任务终态

| 能力 | 任务 | 成功 | 失败 | pending/running | 终态成功率 |
| --- | ---: | ---: | ---: | ---: | ---: |
| text | 176 | 169 | 7 | 0 | 96.02% |
| image | 91 | 86 | 5 | 0 | 94.51% |
| video | 40 | 40 | 0 | 0 | 100.00% |
| **总计** | **307** | **295** | **12** | **0** | **96.09%** |

### 2.2 浏览器操作到验收结束耗时（不是纯上游耗时）

| 能力 | 完整计时样本 | 平均秒 | P50 秒 | P95 秒 | 最慢秒 | 口径 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| text | 176/176 | 8.08 | 5.99 | 16.00 | 44.62 | 浏览器操作开始至任务终态/刷新记录结束 |
| image | 90/91 | 42.29 | 27.83 | 104.09 | 134.45 | 90 条有自动化起止时间；另 1 条 A/C 独立诊断任务没有同口径 UI 起止时间 |
| video 文生视频 | 37/38 | 221.89 | 202.22 | 400.14 | 408.34 | runner 启动至刷新/视频媒体检查结束；不等同于上游纯生成耗时 |

上表受 UI 导航、模型选择、轮询间隔、刷新和媒体加载影响。视频先行 smoke 和图生/视频参考 smoke 未提供相同口径起止时间，因此不混入 P50/P95。不要拿此表与 10/21 的完整服务端 task duration 表做同口径性能比较。

### 2.3 任务成功与项目节点的区别

269 条文本/图像/先前视频任务的服务端终态审计：**257 success / 12 error**。其中成功状态且在项目快照中找到成功节点及非空内容为 246 条（文本 161、图片 83、先前两个视频 2）。另 11 条成功任务未在该次快照中同时满足“可关联成功节点且有内容”：8 条文本无匹配节点；图片 `gpt-image-2-5-sunburst` 1 条及 `gpt-image-2-text-to-image` 2 条虽任务成功，但快照节点未同时表现为成功/有内容。因文本/图片波次存在同项目并发写入，这 11 条需串行独立复核，当前证据不足以断定是生产持久化缺陷。

本轮随后单独建视频 Canvas，37 条 runner 结果虽在脚本里因成功后 `metadata.videoTask.id` 被清理而误标 `success:false`，但服务端 task terminal、刷新后节点 `status=success`/内容非空、视频 `readyState=4` 三项证据均通过；加先行 smoke 为 38/38。**脚本标志是假阴性，不是 38 个产品失败。**运行脚本缺陷已记入改进项，不通过改产品代码处理。

## 3. 逐账号成功率（脱敏）

按 269 条 SQL 目标任务的真实 DB 状态，叠加本轮 38 条独立视频 T2V 任务结果计算。表格不包含未创建服务端 task ID 的请求拒绝；每个账号的任务组合不同，账号成功率不能替代模型成功率。

| 账号 | text 成功/任务 | image 成功/任务 | video 成功/任务 | 总任务 | 成功 | 失败 | 账号任务成功率 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| U01 | 11/11 | 6/7 | 3/3 | 21 | 20 | 1 | 95.24% |
| U02 | 12/12 | 6/7 | 5/5 | 24 | 23 | 1 | 95.83% |
| U03 | 12/12 | 6/7 | 3/3 | 22 | 21 | 1 | 95.45% |
| U04 | 11/13 | 7/7 | 3/3 | 23 | 21 | 2 | 91.30% |
| U05 | 12/12 | 7/7 | 3/3 | 22 | 22 | 0 | 100.00% |
| U06 | 12/12 | 7/7 | 3/3 | 22 | 22 | 0 | 100.00% |
| U07 | 12/12 | 7/7 | 3/3 | 22 | 22 | 0 | 100.00% |
| U08 | 12/12 | 6/6 | 3/3 | 21 | 21 | 0 | 100.00% |
| U09 | 11/13 | 6/6 | 2/2 | 21 | 19 | 2 | 90.48% |
| U10 | 12/12 | 5/5 | 2/2 | 19 | 19 | 0 | 100.00% |
| U11 | 10/11 | 5/5 | 2/2 | 18 | 17 | 1 | 94.44% |
| U12 | 11/11 | 5/5 | 2/2 | 18 | 18 | 0 | 100.00% |
| U13 | 11/11 | 4/5 | 2/2 | 18 | 17 | 1 | 94.44% |
| U14 | 10/11 | 5/5 | 2/2 | 18 | 17 | 1 | 94.44% |
| U15 | 10/11 | 4/5 | 2/2 | 18 | 16 | 2 | 88.89% |
| **合计** | **169/176** | **86/91** | **40/40** | **307** | **295** | **12** | **96.09%** |

账号别名与学生名单没有在此文档建立映射；不公开账号、手机号、密码、积分凭据。

## 4. 各模型任务成功率与节点状态

### 4.1 文本模型

DB 任务成功是“服务端生成任务终态”，项目节点列是本次只读快照中的对应状态/内容。映射未全通过时，不能将任务成功率直接写成画布端到端成功率。

| 用户选择模型 | DB 任务 | 成功 | 失败 | 任务成功率 | 快照成功节点/有内容 | 观测到的主要渠道/结果 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `gpt-5` | 17 | 17 | 0 | 100% | 16/17 | 模汇 gpt 文本；1 条未匹配到成功内容节点，需串行复核 |
| `gpt-5-mini` | 17 | 17 | 0 | 100% | 16/17 | 模汇 gpt 文本；1 条未匹配到成功内容节点，需串行复核 |
| `gpt-5-pro` | 2 | 0 | 2 | 0% | 0/2 | 上游返回 request rate limit 429；样本低但连续失败，建议暂时关闭/隐藏 |
| `gpt-5.1` | 17 | 17 | 0 | 100% | 17/17 | 模汇 gpt 文本 |
| `gpt-5.2` | 17 | 17 | 0 | 100% | 17/17 | 模汇 gpt 文本 |
| `gpt-5.4` | 17 | 17 | 0 | 100% | 16/17 | 模汇 gpt 文本；1 条节点关联待复核 |
| `gpt-5.4-mini` | 17 | 17 | 0 | 100% | 17/17 | 模汇 gpt 文本 |
| `gpt-5.4-pro` | 2 | 0 | 2 | 0% | 0/2 | 上游返回 503 model service temporarily unavailable；暂时关闭/隐藏，向上游核实 |
| `gpt-5.5` | 17 | 17 | 0 | 100% | 15/17 | 模汇 gpt 文本；2 条成功任务未能匹配到成功内容节点 |
| `gpt-5.5-pro` | 1 | 0 | 1 | 0% | 0/1 | DB 任务失败为 503；请求日志另有一次未建任务的 503，低样本，暂时关闭/隐藏 |
| `gpt-5.6-luna` | 16 | 16 | 0 | 100% | 15/16 | 模汇 gpt 文本；1 条未匹配到成功内容节点 |
| `gpt-5.6-sol` | 17 | 17 | 0 | 100% | 16/17 | 模汇 gpt 文本；1 条节点关联待复核 |
| `gpt-5.6-terra` | 17 | 17 | 0 | 100% | 16/17 | 模汇 gpt 文本；1 条节点关联待复核 |
| `codex-auto-review` | 1 | 0 | 1 | 0% | 0/1 | 昱梦 gpt 组；403 enterprise OAI group permission，先修权限/绑定再开放 |
| `gpt-6-astra` | 1 | 0 | 1 | 0% | 0/1 | 昱梦 gpt 组；403 enterprise OAI group permission，先核实授权 |
| **合计** | **176** | **169** | **7** | **96.02%** | **161/176** | 9 个常规模型达到≥15任务；6 个受限/异常模型样本不足，不能认定可用 |

文本有 7 个 DB 失败：Pro 型号共 5（rate-limit/503），企业组权限型号 2（403）。未创建 task ID 的额外 503 是 HTTP 请求层拒绝，未加进上表任务分母。出现 “HTTP 200” 的创建响应只说明平台接受并创建 task，不代表模型结果成功。

### 4.2 图片模型

| 用户选择模型 | DB 任务 | 成功 | 失败 | 任务成功率 | 快照成功节点/有内容 | 实际执行证据/判定 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `gpt-image-2` | 13 | 13 | 0 | 100% | 13/13 | 兔子渠道；样本达到 10 条门槛 |
| `gpt-image-2-all` | 13 | 13 | 0 | 100% | 13/13 | 模汇 X 中漫；样本达到门槛 |
| `gpt-image-2-c` | 13 | 13 | 0 | 100% | 13/13 | 模汇 X 中漫；其中独立 A/C 媒体链路诊断有 1 条完整媒体读取正例 |
| `gpt-image-2.5-sunburst` | 13 | 8 | 5 | 61.54% | 8/13 | ModelBay `modelbay-image-task`；上游执行名 `gpt-image-2-image-to-image`。3 条详细 trace 明确媒体 HTTP 403/0 bytes，另 2 条有 DB 失败但本地详细 trace 未覆盖。**建议先关闭/隐藏；A/C 修复在生产尚未通过验收** |
| `gpt-image-2-5-flare` | 13 | 13 | 0 | 100% | 13/13 | ModelBay；样本达到门槛 |
| `gpt-image-2-5-sunburst` | 13 | 13 | 0 | 100% | 12/13 | ModelBay；任务成功，但 1 条快照没有成功状态+内容，需串行确认节点，不要与带点号模型混淆 |
| `gpt-image-2-text-to-image` | 13 | 13 | 0 | 100% | 11/13 | ModelBay；2 条任务成功但快照未能证明节点成功有内容，暂不建议无条件开放 |
| `gpt-image-2-image-to-image` | 0 个独立用户选择 task | — | — | — | — | 配置目录中有此执行模型；它作为 `gpt-image-2.5-sunburst` 的真实上游执行名出现，未作为单独模型做独立样本 |
| **汇总** | **91** | **86** | **5** | **94.51%** | **83/91** | 7 个选择模型都有 13 条 DB 样本；8 个图片目录项中，`gpt-image-2-image-to-image` 没有独立选型覆盖 |

### 4.3 视频模型与能力分开统计

| 用户选择模型 | 文生视频（T2V）样本/成功 | 图生视频（I2V）样本/成功 | 视频参考（V2V）样本/成功 | 当前结论 |
| --- | ---: | ---: | ---: | --- |
| `doubao-seedance-2-0` | 6/6 | 1/1 | 0/0 | T2V 达到最小样本；I2V 仅 smoke，不足以判稳定 |
| `doubao-seedance-2-0-260128` | 6/6 | 0/0 | 1/1 | T2V 达标；V2V 仅 smoke，不足以判稳定 |
| `doubao-seedance-2-5-260628` | 6/6 | 0/0 | 0/0 | T2V 达到最小样本 |
| `official/seedance-2` | 6/6 | 0/0 | 0/0 | T2V 达到最小样本 |
| `official/seedance-2-5` | 6/6 | 0/0 | 0/0 | T2V 达到最小样本 |
| `cdance2.0-0807` | 6/6 | 0/0 | 0/0 | T2V 达到最小样本 |
| `cdance2.0-fast-0807` | 2/2 | 0/0 | 0/0 | 小于目标 6，不能据此建议全面开放 |
| `cdance2.0-mini-0807` | 0/0 | 0/0 | 0/0 | 未测，不得写可用 |
| **合计** | **38/38** | **1/1** | **1/1** | **40 个视频任务终态均成功；只有 T2V 六个模型达到每模型≥6** |

视频参考能力按供应商/模型支持契约确认后再扩大测试；没有契约证据的路径应标“待确认”，不能将 T2V 结果当 V2V/I2V 结果。

## 5. 实际渠道与路由证据

| 能力/模型 | 本轮证实的渠道信息 | 证据/边界 |
| --- | --- | --- |
| 文本常规 GPT 型号 | 模汇 gpt 文本；`gpt-5.5`/`gpt-5.6-sol`/`gpt-5.6-terra` 目录还存在昱梦绑定候选 | 本轮被任务证据确认的渠道依照生产模型清单与 `text-first-wave-db-evidence.jsonl`；不把备用绑定当成实际请求发生了溢出 |
| `codex-auto-review`、`gpt-6-astra` | 昱梦 gpt 组 | 任务日志明确失败在企业专供 OAI 分组权限 403，不是前端按钮或 Canvas 节点故障 |
| `gpt-image-2.5-sunburst` | ModelBay `modelbay-image-task`，channel ID `X9te4qOV0ZaPsJpErRRWS` | failure trace 的实际上游模型为 `gpt-image-2-image-to-image`；失败发生在生成结果媒体读取阶段 |
| `gpt-image-2-c` | 模汇 X 中漫 API | 一条 A/C 正样本在上游 JSON 2,570,462 bytes 后读取 PNG 1,927,416 bytes、1374×1145，最后 `persisted`，刷新后可见；仅作为该具体路由的一条正样本 |
| 视频 T2V 其他型号 | 兔子、ModelBay、天翼云 TokenHub 等按当前只读绑定执行 | 实际每模型 T2V 样本见第4.3节；没有把绑定表所有备用渠道说成被请求过 |

## 6. 失败结构与关键问题：事实—原因—解决方向

| 互斥任务失败组 | 任务数 | 占12条失败 | 当前证据强度 | 对应处理 |
| --- | ---: | ---: | --- | --- |
| ModelBay 图像结果媒体授权读取 HTTP 403 | 5 | 41.67% | 5 条同模型 DB 失败；其中3条详细诊断 trace 可直接见 403/0 bytes；其余2条缺同级阶段证据 | 不要将 PR #61 视为已解决；先关闭故障模型，修复并在测试环境端到端复现/回归后再谈发布 |
| 文本 Pro 型号服务错误 | 5 | 41.67% | task error 与上游 429/503 信息明确；不同模型/错误类型分开 | 向对应渠道确认 rate limit 和服务可用性；短期隐藏无法稳定提供的 Pro 型号 |
| 企业权限/模型分组拒绝 | 2 | 16.67% | 任务错误 403，明确 enterprise group permission | 修正渠道授权/逻辑模型绑定；不应通过代码绕过权限 |
| **合计** | **12** | **100%** | 全部终态 error | — |

### 6.1 A/C 媒体交付：生产部署后仍复现，不能结案

PR #61 “fix(canvas): A/C 媒体结果投递修复”在 2026-10-22 04:43（北京时间）合入 `main`；生产构建、部署工作流成功，部署 health check 通过。但生产真实画布随后仍出现 5 条 `gpt-image-2.5-sunburst` 任务失败，DB 统计为 8 success/5 error（13 条）。在 3 条详细 trace 中，时序均为：

1. ModelBay image task 创建/轮询阶段成功，上游 task 已提交并返回正常 JSON；
2. 我方开始读取结果媒体（diagnostic `result_media_start`，逻辑模型 `gpt-image-2.5-sunburst`）；
3. 平台媒体读取请求收到 **HTTP 403、`application/json`、0 bytes**；
4. 任务进入 `error`/`failed`，没有完成图像资产持久化。

| 任务 ID | 北京时间媒体 403 | 诊断中的上游模型 | provider/channel |
| --- | --- | --- | --- |
| `3281dccb-6054-49ea-b959-1f47d3eb497c` | 2026-10-22 06:29:01 | `gpt-image-2-image-to-image` | `modelbay-image-task` / `X9te4qOV0ZaPsJpErRRWS` |
| `d4289417-63ef-4e78-bb12-29d0623d1611` | 2026-10-22 06:30:31 | `gpt-image-2-image-to-image` | 同上 |
| `d70f11c9-7df8-4165-8d01-8d7bb720fee8` | 2026-10-22 06:30:31 | `gpt-image-2-image-to-image` | 同上 |

另两条服务端任务同模型终态 error，但本机逐任务阶段 trace 未完整覆盖；此处不把 3 条 trace 的细节伪称为 5 条都有完整链路。  
**当前根因边界：**直接失败点确定是结果媒体授权读取 403，而非前端没有提交、也不是上游没有生成 task。历史“签名模型名与路由上游名不一致”是合理修复假设，但此轮在生产部署后仍有同路径 403，说明修复没有被真实数据证明解决该绑定，或者还有另一个签名/代理/上游 URL 授权条件；当前日志没有记录完整签名前后输入和上游响应主体，不能再把具体子根因写成已证实。  
**建议：**立即在管理后台暂停/隐藏这个确切选择项 `gpt-image-2.5-sunburst`（不要误关另一个 `gpt-image-2-5-sunburst`）；在测试环境复现并补充脱敏签名模型名、媒体 URL host/path hash、上游媒体响应 HTTP/content-type、渠道 ID/实际执行模型的阶段日志；确认正确签名逻辑后用真实 Canvas 多次验证“上游生成→媒体读取→OSS/资产登记→刷新显示”。这一步不能在生产直接热改或把上游模型名硬编码到全渠道。

### 6.2 文本模型错误：上游限制与授权问题分开处理

- `gpt-5-pro`：2 个已创建任务收到 429 request rate limit。它不是登录失败；目前每模型 2 条且均失败，临时隐藏比继续让用户撞限流更合适。
- `gpt-5.4-pro`：2 个任务返回 503 model service temporarily unavailable；不能与 429 合并为“并发限流”。
- `gpt-5.5-pro`：数据库有 1 个任务错误 503，另有客户端记录到一次无 task ID 的 503 请求拒绝。样本量不足，当前不可标稳定可用。
- `codex-auto-review` 与 `gpt-6-astra`：各 1 条任务，403 enterprise OAI group permission。需要确认上游账号套餐/分组授权与渠道配置，不应尝试绕过企业权限。
- 对 503、429 进行后续验证前需确认渠道恢复及限流额度，不要在生产课堂中盲目自动重试造成额外费用或重复任务。

### 6.3 任务成功但节点关联不完整

269 条数据库任务审计中，有 11 条 success 未同时匹配到成功状态且有内容的 Canvas 节点（8 text + 3 image）。本轮 text/image 重复波次分别并发 4 且时间重叠；同账号多节点写相同项目可能令快照关联失真。此前两会话重叠节点误点问题也证明自动化可能选错节点。因此现阶段根因**未定**：既可能是测试写入覆盖/关联方式不稳，也可能存在节点持久化或刷新问题。

**下一步：**不在生产课堂进行写入；课堂后使用一个模型/一个账号/独立画布/一个目标节点逐个执行，保存 POST taskId、服务端终态、节点 ID/项目 revision、刷新前后 snapshot 和 UI 截图。只有同一任务唯一对应节点仍缺内容，才立项修复产品持久化。

### 6.4 测试自动化误判（不是产品任务错误）

视频 runner 设置 `r.success` 时要求成功后仍能从 `metadata.videoTask.id` 读回 task ID；正常完成后生产代码清除这个临时 task ID，故保存 JSON 每条 `success:false`。经 task endpoint 和项目刷新证据重算，本轮 37 条全部是服务端 success、Canvas success/内容非空、视频 `readyState=4`。新增用例应以 task terminal、最终节点状态/内容、媒体 readyState 组合判定，不依赖运行时 taskId 留存。

### 6.5 未建 task 的请求拒绝与客户端登录现象

任务成功率分母仅含服务器端已建 task ID。客户端日志出现但无 task ID 的 HTTP 503 不塞进模型 task 表，报告中单列。并行登录只有7个上下文真实发 POST，其余由 UI 控件/等待造成未提交；序列补齐后的 15 个 session 通过，但这不构成 15 同时登录的负载结论。

## 7. 视频任务终态、真实节点播放与能力覆盖

- 先行 I2V 任务 `6265a9f2-d386-4826-85de-f287f45bb3c0`（`doubao-seedance-2-0` / 模汇）成功，刷新后视频 `readyState=4`、时长约 5.06 秒、640×640。
- 先行 V2V 任务 `2a4a530e-8eb0-4754-bea4-38ba3f98222d`（`doubao-seedance-2-0-260128` / 兔子）成功；父视频连接到子视频输入，服务端 `persisted`，媒体请求 HTTP 200 `video/mp4`、1,537,602 bytes，刷新后可播放。
- 本轮 T2V 38/38 (含 smoke) 各在真实 Canvas 节点生成，已做刷新与播放检查；38 个样本中六个模型达到 6 条阈值，fast 有2条，mini没有。
- I2V/V2V 只有各1条；即便这一条成功，也不足以外推模型稳定性。当前未覆盖每个声明支持的参考能力样本，也未做音频、真人/角色一致性等高阶视频能力。

## 8. 资源、账务和可观测性

### 8.1 服务器资源

资源采样间隔约30秒，首末分别为北京时间 05:53:41、09:49:39，共430个有效样本。停止标记已写入，本轮生产生成 runner 和资源 sampler 已停止。

| 指标 | 采样结果 | 结论边界 |
| --- | --- | --- |
| 根分区 `/` 使用率 | 全窗口 56%–56% | 未观察到磁盘增长逼近满盘 |
| MemAvailable | 5,773–6,324 MiB（约5.64–6.18 GiB） | 采样范围内有余量 |
| `vozeb-pro` CPU / 内存峰值 | 113.18% / 731.8 MiB | 瞬时 Docker CPU 可超过100%，不是持续饱和证明 |
| generation-worker CPU / 内存峰值 | 2.08% / 42.77 MiB | 没有观察到 worker 资源异常峰值 |
| postgres CPU / 内存峰值 | 115.74% / 283.4 MiB | 有短时 DB CPU 峰值，采样不能说明峰值持续时间 |
| DB active connection 最大值 | 11 | 采样点内未见连接池耗尽 |
| 三容器重启/OOM | 430/430 个点均 RestartCount=0、OOM=false、状态 running | 未观察到容器重启或 OOM |

该轮是有限批次的真实 Canvas 生成，不是 80 用户/120 并发压力测试；CPU峰值不可外推为高负载容量结论。

### 8.2 费用和积分

- 启动前只读基线：15账号积分合计 1,150，时间北京时间 05:24:45；本轮数据库任务审计包含 attempt receipt 数，但不能单凭 receipt 数推导净扣分/退款。
- 后续曾于 10:05（课堂开始后）只读查看到积分合计 848；此时课堂已开始，无法排除学生/其他正常用户同期消费，因此 **不计算 1,150−848 作为本轮测试成本**。
- 目前没有把每个 taskId 的扣分流水、退款流水逐条 join 的完整账务对账证据；本报告不声称扣费/退款全部正确。课堂期间不再读取或修改积分。

### 8.3 日志保留与隐私

- DB audit 汇总、脱敏任务诊断、Canvas 快照审计及资源指标均保留在用户本地 Downloads 运行目录，报告只引用脱敏路径/任务 ID。
- 账号 session 文件仅在本机 `private/`，不得拷入仓库。日志不保留密码、Cookie、API Key、完整签名媒体 URL。
- 目前的敏感 URL 主体/签名值被脱敏，正是本轮未能完全解释媒体 403 的证据盲点；后续应保留 URL host 和 path hash、上游模型、签名使用的逻辑模型名/路由模型名（只存字段，不记录密钥/完整签名）。

## 9. 资源与报告的边界、异常分类

1. 本报告不会把 10/20、10/21 冻结报告的任务并进本轮 307 分母，也不会用历史的成功/失败修饰今天模型状态。
2. 12 个失败都是已建 task 的 DB 终态；无 task ID 的 503/HTTP拒绝单列，未伪造模型归属。
3. 图片一任务可能有多个 attempt/回源读取；统计按一个 logical task 计数，不按 request 重试数放大失败数。
4. 当上游 task success 但平台媒体读取失败时，按用户端可用结果计为任务失败；上游已接单并不等于用户拿到图片。
5. DB 项目快照的节点匹配不等于每个浏览器视觉验收；视频 38 条额外做了真实浏览器刷新和播放。文本/图片 11 条节点关联缺口需排除并发测试污染后再下最终结论。
6. 没有对所有视频参考能力做契约核对，未测模型/能力标为未测，不标“失败”也不标“可用”。

## 10. 明日模型管理建议（按当前证据，不是自动改配置）

| 决策 | 模型/范围 | 依据 | 建议 |
| --- | --- | --- | --- |
| **建议暂时关闭/隐藏** | `gpt-image-2.5-sunburst`（带点号） | 13条中8成功5失败；至少3条明确 ModelBay result media 403/0 bytes，且发生在 PR #61 生产部署后 | 先停用这一个逻辑选择项；不要误关 `gpt-image-2-5-sunburst` |
| **建议暂时关闭/隐藏** | `gpt-5-pro`、`gpt-5.4-pro`、`gpt-5.5-pro` | DB 任务仅5条且全失败，429/503 上游明确错误 | 上游确认恢复、逐模型真实 Canvas 验收≥15再开放 |
| **建议暂时关闭/隐藏** | `codex-auto-review`、`gpt-6-astra` | 各1条，均 enterprise group permission 403 | 先核实渠道分组/授权，非代码绕过；授权后重测≥15 |
| **保持可用但加待复核标记** | `gpt-image-2-5-sunburst`、`gpt-image-2-text-to-image` | task 成功 13/13，但 Canvas 项目快照分别只有12/13、11/13成功且有内容 | 因批次重叠，课堂后独立串行复核；如果明早无法核实而结果持久化是硬要求，应暂时隐藏 |
| **保持谨慎开放** | 其余 5 个已达标 T2V 模型 | 各6/6成功并可播放 | 属有限样本，不代表15人持续并发或参考能力通过 |
| **不作开放结论** | `cdance2.0-fast-0807`、`cdance2.0-mini-0807` | 分别2条和0条 | 继续补样本前，不应宣传为本轮验证可用；mini若明早前不能补测，按未验证模型处理 |
| **常规文本/图片项** | 表4.1/4.2 中常规模型 | 多数分别17/17、13/13 task success | 模型任务层表现好，但节点快照关联有空缺；对严格“生成后刷新仍可见”要求，先复核明确列出的型号 |

关闭建议是给管理员的审阅意见。本轮没有代替管理员在生产修改模型启用状态。

## 11. 部署、代码修改及完成状态

### 已确认

- PR #61 A/C 媒体结果投递修复已合并到 `main`；生产镜像 build、deploy 工作流及部署 health check 成功。
- 外部 production `/api/health/ready` 返回过 HTTP 200，ready、数据库 schema、generation worker healthy。
- 生产 Quality 的 web/docs 工作流在 Dependency audit 阶段失败；源码门禁步骤被跳过。Production image/build/deploy 成功不等于所有 CI 检查通过。
- 生产 A/C 修复已被本轮真实 ModelBay case 复测；但 5 个任务错误，故**不能说修复已彻底完成或已经解决**。`gpt-image-2-c` 另有一条正例是不同模型/渠道，不足以替代 ModelBay 失败路由验证。

### 本轮未做

- 没有生产代码/配置/积分/任务数据修改；没有本轮新 commit、push 或 staging deploy。
- 没有因 Quality dependency audit 的红灯而关闭安全检查，也没有通过改报告把部署描述为 CI 全绿。
- 课堂开始后按用户要求停止付费生成，15个视频测试画布只读核查为终态 success、内容存在、taskId 已清理；没有待处理 pending/generating 任务。

### 未完成事项

- ModelBay媒体403根因/修复及测试环境端到端回归仍未完成；应作为最高优先级，不应让该模型带病接受课堂请求。
- text/image 异常节点需串行去除测试脚本并发污染后核验。
- 两个 Pro 请求失败 + 企业分组403需渠道管理员处理；不是平台单方面改UI能解决。
- 模型适用能力矩阵里视频 I2V/V2V、未独立测试的图片选择项以及所有低样本项尚未覆盖。
- 全面按 taskId 对账的积分扣费/退款审计缺失。
- 15账号开课前实时生产监控/课堂故障处理不属于本报告的终态负载承诺；本轮没有持续15用户活动负载。

## 12. 主要证据索引

报告对应原始数据只在本机运行目录：  
`C:\Users\admin\Downloads\VOZEB-capacity-20261020\class15-post-ac-20261022-1792617303837\`

| 证据文件 | 用途 |
| --- | --- |
| `task-persistence-audit-summary.json`、`task-persistence-audit-raw.tsv`、`task-persistence-targets.json`、`task-persistence-audit.sql` | 269 个指定任务的 DB 终态、模型、账号、项目节点关联审计 |
| `image-to-image-failures-sanitized.jsonl`、`image2i2-diagnostic-host-only.jsonl` | 3 条可完整重建的 ModelBay 图像媒体 403 链路（脱敏） |
| `image-task-diagnostics-sanitized.jsonl` | `gpt-image-2-c` A/C 图片端到端正向样本 |
| `image-first-wave-20261022.json`、`image-reliability-repeats.json` | 图片真实 Canvas 第一波和重复采样；原始 UI 起止时间 |
| `text-first-wave-20261022.json`、`text-first-wave-db-evidence.jsonl`、`text-reliability-repeats.json`、`text-model-serial-retries.json`、`text-U01-luna-smoke-retry.json` | 文本真实 Canvas 请求、任务终态、刷新内容、模型异常 |
| `video-text-to-video-live-samples.json`、`video-first-live-smoke-refresh-recovery.json` | 视频 T2V逐模型结果、刷新/播放状态；注意 runner 假阴性字段已按服务端+节点证据重算 |
| `video-reference-task-diagnostics-sanitized.jsonl`、`video-test-canvases-with-nodes.json` | 视频参考输入/节点结构及视频测试画布 |
| `production-resource-snapshots.jsonl` | 430 条生产服务器 CPU、内存、磁盘、网络、DB及容器状态样本 |
| `pause-canvas-state-audit.json` | 停测后 15 个视频 Canvas 的只读终态核查 |
| `production-readonly-baseline.json` | 测试前账号/积分/模型目录只读基线（不得从中公开个人身份） |
| `model-manifest-enabled-channels.json` | 当前生产逻辑模型能力及启用绑定快照；按渠道 ID 对证，不能把备用绑定当实际 attempt |

其他历史依据：
- `docs/reports/2026-10-20-canvas-classroom-15-users-test-report-v2.zh-CN.md`
- `docs/reports/2026-10-20-canvas-classroom-15-users-solutions-v2.zh-CN.md`
- `docs/reports/2026-10-21-production-classroom-monitor/production-classroom-live-report.zh-CN.md`
- `docs/reports/2026-10-21-production-classroom-monitor/production-classroom-final-report.zh-CN.md`

---

**最终判定：**本报告比上一版阶段简报补齐了整体、账号、模型、能力、节点状态、部署、失败证据、资源、账务边界与模型建议；但业务测试被上课打断，仍不是全模型全能力最终验收。尤其 A/C 对应的 ModelBay 媒体403在生产部署后复现，现阶段不可向用户保证该模型已修好。下一步需要在不影响课堂的前提下，优先对该明确路由修复/测试环境验证，再按第10节的建议决定生产模型开关。

## 13. 课堂期间实时监控补充（独立窗口，不并入第1节的307条复测分母）

> 本节是课堂开始后的新窗口，来自生产服务器只读监控器，不属于本报告前述“暂停前 307 个测试任务”。课堂活动持续产生任务，因此单独记录，避免污染此前固定分母。

- **观察窗口**：北京时间 2026-10-22 10:21:08 至 10:34:55（UTC 02:21:08–02:34:55）；监控采样持续运行。
- **窗口内已终态且可在最近任务快照中关联的图片任务**：9 条，其中 4 success、5 error；另有 3 条 image 处于 running/polling。该窗口任务选择分布：`gpt-image-2` 3条（3失败）；`gpt-image-2-c` 5条已完成（4成功、1失败）；`gpt-image-2-all` 1条失败。统计仅限已建任务，不等于所有课堂提交的成功率；任务持续更新，后续需以终态快照重算。
- **当前累计运行状态（10:34:55快照）**：全局监控窗口累计 603 success、228 error、3 active；readiness/DB/worker healthy。根盘53.17%，MemAvailable约5.84GiB；3个容器RestartCount均0且OOM=false。全局累计包含旧课堂任务，不能当作本时段分母。

### 13.1 新发现：图像上游返回200后，平台仍报 `Maximum call stack size exceeded`

至少4条课堂失败任务的诊断链显示：渠道上游返回 HTTP 200、JSON 响应正文完成读取（其中可见样本约4.23–7.02MB），之后本平台记录 `provider_exception: Maximum call stack size exceeded` 并将 attempt 置失败。这是平台收到上游成功响应后的本地处理阶段异常，**不是上游HTTP错误**；当前事件没有 JS stack trace/函数名，故只能把根因缩小到“上游响应完成后的平台处理/归一化路径”，还不能确定具体函数。

| 任务 ID | 北京时间 | 用户选择模型 | 实际出站 attempt 与证据 | 最终结果 |
| --- | --- | --- | --- | --- |
| `69a1e4de-396d-4c2e-96b1-c71e486d6741` | 10:21:08 | `gpt-image-2` | Rabbit `hr5VKuKJKirZ1-sdRZPY5` HTTP200，正文约4,229,781 bytes；之后 stack overflow。自动溢出到 ModelBay `X9te4qOV0ZaPsJpErRRWS`，实际模型 `gpt-image-2-5-flare`，返回 HTTP400 `Unknown parameter: 'response_format'`。 | error |
| `81195f5f-2dde-4aa2-8539-15fb9987a96f` | 10:21:55 | `gpt-image-2` | Rabbit HTTP200/正文完成后 stack overflow；再溢出至模汇渠道 `_-eQ3SntRYtuDZz9mJ_OK`，第二 attempt 仍 stack overflow。 | error |
| `fd8a124d-01fa-4a12-80b5-4105cf9bb6f5` | 10:24:42 | `gpt-image-2-c` | 模汇 HTTP200、正文完成后 stack overflow；溢出至 Rabbit，媒体读取返回 HTTP403/0 bytes。 | error |
| `97929196-9298-4fa6-8ff5-70f367222237` | 10:26:36 | `gpt-image-2` | Rabbit 与模汇两个 attempt 均有上游 HTTP200，但在平台处理阶段报 stack overflow；第二 attempt 上游响应正文约4MB。 | error |
| `a5a5501c-afb8-4a0f-8926-892cfd823cfb` | 10:28:07 | `gpt-image-2-c` | 模汇 HTTP200、正文完整读取约7,015,307 bytes后 stack overflow；自动溢出至 ModelBay，实际模型 `gpt-image-2-5-flare`，HTTP400 `Unknown parameter: 'response_format'`。 | error |

**重要区分**：这是课堂窗口新捕获的重复性故障，之前暂停前的 307 任务报告没有覆盖该课堂时段。它与已知的 ModelBay `gpt-image-2.5-sunburst` 媒体403并非同一个失败阶段：本窗口主问题首先是 Rabbit/模汇上游200后的本地 stack overflow；部分任务随后溢出到其他模型/渠道，又发生参数契约400或媒体403，形成“首错 + fallback 次错”的复合失败。

### 13.2 监控分类也有误归因

生产监控器按任务 error、所有 attempt error 和事件错误文本拼接分类。若首 attempt 是 `Maximum call stack size exceeded`，而末 attempt 实际是 ModelBay `Unknown parameter: response_format`，告警分类会优先保留 `stack-overflow`，掩盖末端 400。该分类误差在任务 `69a1...`、`a5a...` 的记录中可见。复盘需按 attemptNo/时间顺序输出每个 attempt 的最终阶段，不能只给一个互斥总类。

### 13.3 对测试覆盖的更正与后续

- 是的，之前的阶段测试没有充分覆盖课堂实际发生的“图片上游返回大 JSON/多 MB 正文 → 本地响应处理 → 失败后跨渠道/跨上游模型溢出”组合，也未达到对课堂并发窗口的覆盖。之前的成功任务不能证明这个组合稳定。
- 当前不在上课期间向生产发送额外测试任务，不改生产代码/渠道配置，不重试这些可能已经在上游生成成功的失败任务，以免重复扣费/污染学生画布。
- 课堂期间继续用已有只读监控跟踪 `9489b3af-3b3f-4951-9202-1cb362859e78`（10:29:43创建）：首个模汇 attempt 在 HTTP200 后 stack overflow，之后已切到 Rabbit并处于 polling；在最终状态明确前不记成功或失败。也持续观察其余 active 图片任务直到终态。
- 课后第一优先级：按上游200→完整正文读取→provider exception的时间线取得 Node.js 堆栈/异常调用点和图像 JSON 大小；分别复现 Rabbit、模汇，不通过付费生产重试定位。再确认溢出队列是否应允许该逻辑模型切到 `gpt-image-2-5-flare`，以及选择模型保持 `response_format` 的方式是否符合 ModelBay 契约；其次单独核对 403 媒体路由。
- 需要修复告警分类，使一个任务的每次 attempt 都保留自己的逻辑模型、实际上游模型、渠道、HTTP状态、解析/媒体阶段和最终错误；仅在各 attempt 均归档后，再给任务级主因/次因。

本补充不修改之前冻结的307任务成功率，也不宣称已经找到 stack overflow 的具体函数或修复完成；它记录的是正在课堂中捕获的新证据和遗漏的测试路径。

### 13.4 10:40 北京时间实时更新：窗口计数更正、溢出修复比对与第六个失败

以下状态**覆盖/更正 13 节较早的 10:34 快照**。截至北京时间 10:42:26 的最近任务窗口（自10:20起）共观察到 **15 个已终态图片任务：9 success、6 error；另有 2 个图片任务仍 active**。按用户选择模型：`gpt-image-2` 为4/7成功，`gpt-image-2-c` 为5/8成功；另外 `gpt-image-2.5-sunburst` 有1个活动任务。它是监控快照内可关联任务数，不外推所有课堂提交，也不并入暂停前307条。

新增失败 `9489b3af-3b3f-4951-9202-1cb362859e78` 于北京时间 10:29:43 创建，用户选择 `gpt-image-2-c`：

1. attempt 1 走模汇 `_-eQ3SntRYtuDZz9mJ_OK`，收到 HTTP 200 / 多 MB JSON，之后出现 `Maximum call stack size exceeded`；
2. 自动溢出到 Rabbit `hr5VKuKJKirZ1-sdRZPY5`，实际执行模型为 `gpt-image-2.5-sunburst`；
3. 轮询数分钟后，上游 HTTP 429，错误体明确为 Azure OpenAI Sweden Central 区域 `AIServices S0 pricing tier` 对该模型触发 `RateLimitReached`；最终 task error。

这是需与平台 stack overflow 区分的上游限流；这条任务先发生本地异常、后发生上游429，任务级末错不应覆盖首错。

#### 已知历史 regex 栈溢出修复与本次复现的关系（更正）

之前报告写“具体函数未知”尚不完整：历史调查已证明过一个明确的 V8 正则回溯根因——`media-task-diagnostics.ts` 的大段 base64 脱敏正则，并在 `ba0ea742` 将待扫描文本先截断至16KiB。只读核对证明生产当前镜像 SHA `0127c014bae1dc13c2ee1365dda698ca2e55ec12` 的源码**确实包含这个保护**。

因此本次同名 `Maximum call stack size exceeded` **不能直接归咎于已修复的同一正则**。当前生产 trace 显示完整上游正文约 4.23–7.02MB 后抛错，但诊断未记录 Node.js stack trace，尚未指出实际函数。严谨结论应为：历史 `redactDiagnosticText` 正则路径已有保护；课堂上出现的是尚未定位到栈帧的同类 RangeError，可能来自另一处对大图片 JSON/base64 的处理调用，也可能是已修复函数未覆盖的另一入口。必须取异常堆栈和复现调用链才能确认。当前只读证据可确认错误发生在 `upstream_body_complete/transport_response=200` 之后的平台处理阶段。

**漏测点确认**：既有测试覆盖过对脱敏函数输入10MB base64不抛错，但本轮前序生产验收没有充分覆盖当前 v0.8.16 镜像下、多渠道实际响应格式的4–7MB完整图片响应端到端路径，也没有完整覆盖 stack overflow 后的跨模型溢出及其 400/403/429 次错链。故“阶段报告中没有捕捉”是测试覆盖缺口，不应仅归因于测试脚本假阴性。

#### 当前监控快照

北京时间 10:42:26：生产 ready/DB/worker healthy；全局自监控窗口累计608 success、229 error、2 active（累计窗口不是本次课堂小窗口）；CPU约2.25%，可用内存约5.85GiB，磁盘53.17%，App/Worker/DB无重启、无OOM。数据仍由现有只读监控器持续更新。

课堂期间不增加生产探测任务、不自动重发、不改渠道、不变更模型开关。当前重要在途任务由监控器继续轮询直到终态；之后需对积分流水进行只读关联，确认上游已生成但平台失败的任务没有重复扣费/错误退款。

截至10:42:26仍在进行的两笔任务：`9ef1c7c8-74d0-48ad-9d08-709495bce197`（`gpt-image-2.5-sunburst`，Rabbit，polling）和`8f5e282c-539d-4fc2-b7aa-cbac972cd969`（`gpt-image-2-c`，提交中）。不对活动任务提前报成功/失败，继续由只读监控追踪。

### 13.5 11:03 北京时间新增视频参考素材拒绝：尺寸下限已找到直接证据

这是本轮新确认、此前视频抽样没有覆盖到的课堂故障。北京时间 10:20–11:03 最近任务快照共关联 **73 个已建任务，70 个终态（26 success、44 error），3 个 running**。统计只限 monitor query 最近任务集，课堂还在持续，不能当成最终课堂总分母。44 个失败任务的错误可能多 attempt 叠加，以下分类按出现的失败签名计，不等于互斥根因：

| 失败签名 | 任务数（本窗口） | 主要证据 |
| --- | ---: | --- |
| 视频参考素材宽/高低于 300px | 12 | 兔子、模汇、天翼云的上游素材处理错误均明确写 `Width/Height must be between 300px and 6000px` 或素材尺寸不符合 |
| 兔子 Seedance 真实人物素材拒绝 | 5 | 上游 HTTP400 明确指出 `content[n] may contain real person`，每笔有 upstream request ID |
| ModelBay 视频素材接口 HTTP400 | 6 | `official/seedance-2` 4条、`official/seedance-2-5` 2条；当前错误只记录“ModelBay 素材接口返回 HTTP400”，尚需上游响应体补证 |
| 模汇 Seedance token 无效/额度不足 | 7 | 其中多个明确为 `Invalid token` 或“token remain quota 不足以支付 need quota”；需渠道管理员处理，不是媒体尺寸错误 |
| 大图响应后 stack overflow attempt | 10 | 图片失败链任一 attempt 出现该错误；其中末次错误可能是其他 fallback 错误，按 attempt 链保留，不将其全部计为最终主因 |
| 其他超时/限流/参数错误 | 4 | 单列在原任务 attempt 错误中；不能把这些与上述素材尺寸/权限问题合并 |

#### 直接复现证据：视频节点 5 张参考图中 3 张小于上游 300px 下限

- 任务：`079c9a8e-cf3d-427a-a97d-334918176685`；创建北京时间 10:44:24；服务端 task `doubao-seedance-2-0`，渠道 `_ -eQ3SntRYtuDZz9mJ_OK`（模汇 Seedance）；创建上游任务 HTTP200，request ID `20261022024424056423097RI2ypSq2EQ6ReLgd`；轮询终态错误为 `Height must be between 300px and 6000px.`。
- 该任务项目的唯一视频节点当前保存设置 `size=16:9`、`vquality=720`、`seconds=5`；它关联 5 张图片参考素材，元数据尺寸分别为 **444×283、1600×898、499×280、511×281、1824×1024**。其中 3 张高度为 280–283px，低于错误明确要求的 300px。
- 视频节点的画布显示框本身为约 419.6×236px，但生成设置为16:9/720p。不得把 UI 卡片显示像素直接当成用户要求的视频输出尺寸；更强的触发线索是被提交的参考图片原始尺寸。
- 数据库任务行记录模型 `doubao-seedance-2-0`，取证时项目节点 `metadata.model` 已是 `doubao-seedance-2-5-260628`。因为节点快照是在任务后读取，不能证明提交瞬间模型错配；需保留为一项待核的项目版本/节点设置并发差异，不把它当成已证根因。

#### 为什么此根因有较强证据

在生产镜像对应源码 `0127c014` 中，`video-generation-route.ts` 对 `mohui-seedance` 调用 `buildMohuiSeedanceVideoRequest`；通用引用预处理只针对 `tuzi-seedance` 或 `modelbay-seedance`，模汇 Seedance 路径没有先把低分辨率图片变成合规素材。`mohui-seedance-video.ts` 把每个 image reference 的 URL 原样写入 `content[].image_url.url`。结合该失败节点恰有三张高度低于300px的引用图和上游明确尺寸下限拒绝，**最可能根因是低分辨率参考图未经预检/转换便发给要求至少300px的 Seedance 素材处理端**。这比“视频模型本身坏了”更具体，并由任务、资产元数据、错误阈值和线上镜像代码路径相互印证；但没有记录最终 multipart/URL素材的实际字节尺寸，故仍不把它写成字节级绝对证明。

此问题说明前一阶段只有6条以上文生视频样本、少数 I2V/V2V smoke 不足以覆盖课堂实际“多张参考图 + 小尺寸图片 + 各上游渠道素材规则”组合，属于实质性测试覆盖遗漏。

#### 课堂期间处置边界

- 立即可用的操作性规避：对视频节点引用图先确认宽、高**都≥300px**；若图来自小缩略图，换用原图，不要把Canvas预览缩略图当作参考源；Tuzi拒绝 real-person 的内容则不能靠重试解决。
- 不在课堂期间改生产渠道、不直接重写学生项目、不批量重试可能已被上游接收/计费的任务。
- 课后修复方向：在发起视频任务前读素材真实字节尺寸并按目标上游能力预检，错误提示标出具体哪张参考图与实际宽高；讨论“保持比例的安全放大/填充到最低尺寸”是否会改变图像语义后再实现。对支持自动变换的渠道需保存原文件哈希、转码后尺寸与上游素材 ID；对不允许改图的路径，阻止请求并退款/不扣费。用 Mohui/Tuzi/天翼云各跑真实 Canvas 多参回归，逐路确认边界。

截至 11:03 全局生产 readiness/DB/worker 仍 healthy；全局累计监控有 618 success、264 error、10 active，App/Worker/Postgres restart=0、OOM=false。该全局计数包含窗口前其他课堂任务；本窗口独立分母维持如上。现有只读监控仍在线，持续追踪 3 条当时在途任务至其终态。

### 13.6 11:05 北京时间继续更新：课堂真实失败远不止栈溢出

根据 11:05:40 北京时间的最新只读快照，10:20 以来最近任务集累计 **75 个任务：72 已终态（27成功、45失败），3 个仍在进行**。这是一段正在变化的最近任务查询窗口，不是课堂最终统计；每 30 秒监控器持续刷新。

| attempt/错误签名（允许一任务重复命中多个签名） | 当前出现次数 | 主要影响范围 |
| --- | ---: | --- |
| 视频参考素材边长不足 300px（width/height拒绝） | 12 | `doubao-seedance-2-0` 6、`cdance2.0-0807` 3、`cdance2.0-mini-0807` 1、`cdance2.0-fast-0807` 1，另1条不同执行/回退路径；证据含上游素材处理 HTTP400与 sharp resize 尺寸异常 |
| Tuzi Seedance 真人识别拒绝（HTTP400） | 5 | 全部 `doubao-seedance-2-0-260128`；上游错误指出具体 `content[n]` 图片可能含真实人物，request ID齐全 |
| ModelBay视频素材入库/处理 HTTP400 | 6 | `official/seedance-2` 4、`official/seedance-2-5` 2；平台错误目前没有保存上游素材API响应体/请求ID，需要加强诊断再找渠道 |
| Mohui TokenHub 无效 Token | 3 | `doubao-seedance-2-0`；上游返回 `Invalid token`，每笔有 request ID |
| Mohui TokenHub 余额不足 | 4 | `doubao-seedance-2-0`；上游明确 remaining quota 约 ¥5.09、该任务需约 ¥5.97，属于渠道余额/额度不足 |
| 图片大响应处理栈溢出 attempt | 10 | 均在 `gpt-image-2-c` 的某个 attempt；其中至少3条详细链路复现 HTTP200+大正文后本地 RangeError，末 attempt 可能又报 invalid token/其他错误 |
| 图片/视频 429、400 response_format、超时及其他 | 5 | 跨兔子、ModelBay、模汇渠道，需逐 attempt 对应，不能合并成一个模型根因 |

任务可以存在多个 attempt 和多个失败签名，因此上表为**诊断签名数，不能相加当成45个互斥任务分类**。截至此快照，各选择模型终态任务观察为：`doubao-seedance-2-0` 10/24成功；`doubao-seedance-2-0-260128` 1/6；`doubao-seedance-2-5-260628` 0/2；`official/seedance-2` 0/4；`official/seedance-2-5` 0/2；`cdance2.0-0807` 0/3；`cdance2.0-fast-0807` 1/2；`cdance2.0-mini-0807` 0/1；`gpt-image-2` 5/11；`gpt-image-2-c` 8/15；`gpt-image-2.5-sunburst` 2/2。样本/窗口随课堂继续增长，非最终可用性评级。

新出现的这个“视频不好用”不能只归纳成一个代码bug：

1. 至少12条是多参视频输入图尺寸低于渠道明确的300px最小边；画布模板在视频节点绑定了多张参考图，平台把图原样交给素材处理服务，未在请求前验证并提示具体图片尺寸。
2. Tuzi 真人拦截是上游安全策略拒绝，不是接口没连通；对未授权真人素材，不应自动换渠道绕过上游政策。对于本课堂素材来源/学生是否有授权，此日志不提供证明。
3. Mohui 模型 Token invalid 和余额不足是配置/渠道可用性故障；余额错误有明确定量证据，和 reference dimension 是独立问题。
4. ModelBay的视频素材端点HTTP400目前缺上游原响应，不能假设一定同样是分辨率，也不能直接让用户反复点生成。
5. 本地图片栈溢出及 fallback 再次请求依然造成复合失败，应按前序 section 13.1–13.4继续追踪。

课堂期间不擅自改生产配置、注资或关闭渠道；也不提交更多压测请求。对真实学生操作继续只读观测。管理员可立即把视频节点的所有参考图检查为宽高均不少于300px，真人照片被Tuzi拒绝时换成经允许且上游接受的素材；Mohui invalid token/额度及 ModelBay asset 400应分别交对应渠道维护人员核查。任何错误任务先按任务 ID核对是否已在上游计费，再决定重试。

截至 11:05:40：production readiness、数据库和 worker healthy；全局统计 626 success/268 error/3 active，CPU约11.81%、可用内存约5.60GiB、磁盘53.2%；App/Worker/Postgres RestartCount=0、OOM=false。此为全局累计/当前资源状态，不要与上述10:20起窗口分母混算。

### 13.7 11:08 北京时间快照：持续复现，计数继续上升

11:08:00 的只读任务快照已更新：10:20以来可见81个任务，77个已终态（28成功、49失败），4个仍在进行。它覆盖13.6的11:05快照；早先数字不再作为最新窗口计数。多错误签名仍可能在一个任务的不同 attempt 上同时发生，签名数量不相加为49。

| 失败签名 | 当前次数 | 模型拆分/表现 |
| --- | ---: | --- |
| 视频参考图尺寸下限（300px） | 14 | `doubao-seedance-2-0` 7、`cdance2.0-0807` 3、`cdance2.0-fast-0807` 3、`cdance2.0-mini-0807` 1 |
| Tuzi真实人物识别拒绝 | 5 | `doubao-seedance-2-0-260128` 全部5 |
| ModelBay视频素材HTTP400 | 8 | `official/seedance-2` 5、`official/seedance-2-5` 3 |
| 上游200后本地stack overflow（任一attempt） | 10 | `gpt-image-2-c` 6、`gpt-image-2` 4 |
| Mohui TokenHub invalid token | 3 | `doubao-seedance-2-0` |
| Mohui TokenHub quota insufficient | 4 | `doubao-seedance-2-0` |
| 兔子图片上游429 | 1 | `gpt-image-2` |
| ModelBay fallback response_format不支持 | 1 | `gpt-image-2-c` 的 fallback attempt |

ModelBay素材接口的详细上游响应尚未在当前诊断记录中，因此8条只能说平台素材准备阶段 HTTP400，不把它们强行归因为低像素。两条在途代表样本和所有新错误继续由只读监控器追踪；没有新生成请求。

11:07:24服务器心跳：ready/worker健康；全局累计626 success、272 error、4 active；CPU约2.75%、可用内存约6.14GiB、磁盘53.2%，App/Worker/Postgres无重启或OOM。该全局累计包括10:20之前的课堂任务。

### 13.8 11:12 北京时间：用完整任务变更日志重算，避免 recentTasks 截断

最近任务快照查询本身限制返回最近200行；随着课堂任务增长，仅筛选 `latest.json.recentTasks` 会漏掉10:20之后较早的任务。已从监控器持续追加的 `task-changes.jsonl` 按 task ID 选取最新状态，对10:20以来完整可见记录重算（观察时刻 11:12:38）：共 **84 个唯一任务，81 个终态（31 success、50 error），3 个 active**。该窗口分母比刚才仅查 recentTasks 得到的数字完整；后续应始终以 task-changes 去重重算，而不能用 recentTasks 直接当窗口总数。

| 用户选择模型 | 终态任务 | 成功 | 失败 | 终态成功率 |
| --- | ---: | ---: | ---: | ---: |
| `gpt-image-2` | 11 | 5 | 6 | 45.45% |
| `gpt-image-2-c` | 15 | 8 | 7 | 53.33% |
| `gpt-image-2.5-sunburst` | 2 | 2 | 0 | 100.00% |
| `doubao-seedance-2-0` | 28 | 13 | 15 | 46.43% |
| `doubao-seedance-2-0-260128` | 6 | 1 | 5 | 16.67% |
| `doubao-seedance-2-5-260628` | 2 | 0 | 2 | 0.00% |
| `official/seedance-2` | 5 | 0 | 5 | 0.00% |
| `official/seedance-2-5` | 3 | 0 | 3 | 0.00% |
| `cdance2.0-0807` | 3 | 0 | 3 | 0.00% |
| `cdance2.0-fast-0807` | 4 | 1 | 3 | 25.00% |
| `cdance2.0-mini-0807` | 1 | 0 | 1 | 0.00% |
| **合计** | **81** | **31** | **50** | **38.27%** |

此窗口不是全模型完整样本，也不是全课堂最终统计；很多使用场景与模型样本数低，不能把短时比例作为稳定SLA，但足以证明当前课堂多参视频链路有系统性阻断风险。上表按 task 最终状态计，失败 attempt 签名（15次低尺寸、10次出现 stack overflow、8次 ModelBay asset 400等）彼此可能重叠，不做互斥加总。

全局服务器/资源最后快照已推进至 11:12，北京时间；生产 readiness/worker健康，无容器重启/OOM。监控器继续在线，剩余3个 active 仅作为待终态跟踪，不提前计入成功或失败。

### 13.9 11:23 北京时间新链路：首次上游504后，fallback因参考素材注册scope错配在平台本地被拒

本节记录一个新捕获的三图任务级联故障，之前的报告没有覆盖“多参考图跨渠道 fallback + 资产 scope 归属验证”。

| 时点（北京时间） | 证据 |
| --- | --- |
| 11:08:55 | 画布为 `gpt-image-2-all` 创建图片任务 `ce79a408-b6fd-444a-8e41-84342cdea732`，含3张参考图。request参数摘要记录三文件分别为 1,218,497、5,264,091、3,356,375 bytes；模型配置请求 `response_format=b64_json`。 |
| 11:08:55–11:14:21 | 首attempt走模汇渠道 `_ -eQ3SntRYtuDZz9mJ_OK`。平台确实向上游发出 POST；上游返回 HTTP504 `text/html`（Nginx `504 Gateway Time-out`），耗时 **325,231ms**。注意：上游可能已处理或收费，但没有正常结果响应，当前证据不能证明其是否完成生成或是否扣费。 |
| 11:14:22 | fallback 开始走 ModelBay 渠道 `X9te4qOV0ZaPsJpErRRWS`，真实执行模型 `gpt-image-2-text-to-image`。fallback 在约 **10ms** 后于平台内部失败，错误“参考素材不存在或无权访问”；该attempt没有 `provider_start`、`upstream_request`、`upstream_response`，因此请求没有到达 ModelBay API，也不是 ModelBay 返回的素材错误。 |

**找到 fallback 的直接失败原因（只读DB证据）：**该任务的三条 reference 中，ref 1 的 URL 指向 `/api/reference-assets/permanent/...` 参考素材路径，owner 与发起用户匹配，registration 存在且为 permanent object；但注册表 `scope=generation`，URL路径所要求的 scope 是 `reference`。`publicImageReferenceRequestUrl` 会按 URL 的 `/api/reference-assets/` 判定为 `reference` scope，再调用 `requireManagedMediaInputOwner(..., "reference")`；注册表实际 scope 是 `generation`，因此抛出平台错误“参考素材不存在或无权访问”。ref 0 和 ref 2 的 registration scope 与 reference path 一致。这里只记录存储 key 的脱敏路径，不暴露签名/查询参数。

这证明是**平台注册 scope 与引用 URL 路径不一致**导致 fallback 前置授权拒绝；同一用户拥有该永久素材，所以不能简单解释成学生没有权限。首attempt的 504 和 fallback 的 scope 错配是同一任务两个不同阶段的故障，修复任一单点都不会自动追回原始上游可能已生成/计费的结果。

**修复建议（只作为课后代码修复方案，本次没有改生产）：**

1. 建立强类型素材引用：带 storageKey、注册 scope、owner、媒体类型；不要只从 URL 路径猜 scope。对 generation scope 的输出图被重新用作 reference 时，须显式创建/更新为合法的 reference registration 或通过同一所有者校验后签出正确 `/api/generation-log-assets/...` URL。避免只把旧URL字符串重写到另一端点。
2. 在媒体授权验证失败时，记录脱敏诊断字段：asset storageKey hash、URL route scope、registration scope、owner-match、storage class、requested purpose；不得记录签名、Cookie或Key。对权限真实不匹配仍拒绝。
3. 加回归：同一用户生成图片节点→将输出作为三张图之一输入画布图生图→首渠道模拟504→ModelBay fallback。要求fallback能通过授权时确实向上游发出请求；不同用户、过期registration、scope/URL不匹配仍 fail-closed。
4. 先对账 primary 504 的上游消费与退款流水；不能因 fallback 没有到上游就把整个业务任务认定为“没有上游扣费”，也不得直接重提付费生成。

#### 11:23窗口统计更新

从完整 `task-changes.jsonl` 按 task ID 取最新状态（避免 `recentTasks` 200行截断）截至北京时间 11:23:06：10:20以来共有 **89 个任务，87 个终态（36 success、51 error），2 个 active**。该窗口截至时模型样本如报告13.8表格所示；新增 `gpt-image-2-all` 1 个任务、失败1个，原因即本节的首attempt 504 + fallback本地scope拒绝。全局生产心跳为635 success、274 error、2 active，ready/worker健康，CPU约4.76%、MemAvailable约5.89GiB、磁盘53.23%，App/Worker/DB均无重启/OOM。所有数字继续随课堂变化，不是最终全天总表。

### 13.10 11:25 北京时间：核实 gpt-image-2-all 三图 fallback 的素材scope错配

对 `ce79a408-b6fd-444a-8e41-84342cdea732` 做了额外只读取证，找到比“素材无权访问”更具体的直接原因：同一任务引用数组里的 **第2张素材** URL 是参考素材路由 `/api/reference-assets/permanent/...`，但 `vozeb_pro_local_media_assets` 对该 storage key 的登记 `scope` 是 **generation**；owner 与当前用户相符、文件是 permanent object。另两张 reference URL 对应 registration scope=`reference`。因此不是用户所有权不匹配，也不是文件过期，而是**引用 URL 路径声明的用途与本地媒体登记scope不一致**。

这与代码校验链完全吻合：`publicImageReferenceRequestUrl` 看到 `/api/reference-assets/` 后选择 `scope=reference`，调用 `requireManagedMediaInputOwner`，登记表却给出 `generation`，遂在 fallback 尝试中抛出“参考素材不存在或无权访问”。错误发生在创建 ModelBay 上游请求前（该 fallback attempt 无 provider/upstream request 事件），故 ModelBay 并没有拒绝这三张图。

**完整链路已明确分成两个问题：**

1. 首选模汇渠道耗时约325秒收到 HTTP504 HTML。它可能已经消费/计费，但平台没有得到可用结果；仍要按 request/积分流水与渠道侧对账。
2. fallback 改走 ModelBay 时，第2张图 URL path scope 与 registration scope 不一致，平台自身的 owner/scope 安全校验拒绝，因此 fallback 没有真正发到 ModelBay。错误消息将“scope不匹配”压成“素材不存在或无权访问”，使课堂端难以区分。

修复必须保留安全约束：不要绕过用户归属验证，也不要把 generation 资源无条件开放。应按 storageKey 读取注册元数据，并在同一 owner 验证后根据**实际注册scope**选择对应签名路由；若业务明确允许生成产物重新作为参考图，则应提供显式“生成素材作为参考输入”的受控映射。对混合scope三图fallback加回归：同一用户reference/reference/generation混合输入时，应该安全地全部转为上游可访问URL；跨用户、未注册key和伪造path仍拒绝。

### 13.11 11:23后实时窗口更新

完整 `task-changes.jsonl` 按任务ID重新计算到北京时间 11:23:06，10:20以来为89任务/87终态（36成功、51失败、2 active）。后续11:26的全量重算见13.12；本节数据只代表11:23:06快照。由于课堂任务仍不断进入，该数会继续变动；后续优先级是保留每个attempt的独立失败原因，不能只展示任务级最后一次错误。


### 13.12 11:26 北京时间最新窗口重算：94任务、54失败，监控仍持续

按 `task-changes.jsonl` 每个 task ID 取最后状态（不受 `recentTasks` 200条限制）截至北京时间11:26:00重算：10:20以来 **94个唯一任务，90个终态：36成功、54失败，4个active**。其中新确认的 `gpt-image-2-all` 三图任务 fallback scope错配依旧包含在这54条失败内。签名按跨attempt命中统计、彼此可重叠：尺寸下限16、Tuzi真人拒绝6、ModelBay素材400共8、栈溢出attempt共11、模汇Token无效3/额度不足4、兔子429共1、response_format400共1，另有若干504/超时/其他。具体任务明细见原始 task-changes 与监控快照。

本窗口终态成功率为 **36/90 = 40.00%**；这是多模型/多能力/多渠道课堂短窗口、带明显渠道配置和素材问题的临时监控值，不能当成最终全班SLA。当前有4个任务仍active，之后终态会改变分母。11:26服务器 ready / generation worker healthy；全局心跳 635 success/277 error/4 active，CPU约2.26%，MemAvailable约5.82GiB，磁盘53.23%，三个容器restart=0/OOM=false。


### 13.13 11:30 北京时间窗口更新：视频超时增加，参考尺寸失败继续扩大

用完整 task changes 按任务 ID 去重，截至北京时间 11:30:04：10:20以来**106个任务，104终态（40成功、64失败），2 active**。相对11:26的94/90（36/54/4）新增12个任务，其中4成功、10失败。失败签名允许同一任务跨 attempt 命中多个类别：尺寸下限22、栈溢出attempt 12、Tuzi真人拒绝6、ModelBay视频素材HTTP400 9、Mohui无效Token 3/额度不足4、兔子图片限流1、fallback不支持response_format 1、其他6。

按用户选择模型最近快照：`doubao-seedance-2-0` 17/39成功、`doubao-seedance-2-0-260128` 1/7、`doubao-seedance-2-5-260628` 0/4、`official/seedance-2` 0/5、`official/seedance-2-5` 0/4、`cdance2.0-0807` 0/3、`cdance2.0-fast-0807` 1/4、`cdance2.0-mini-0807` 0/1、`gpt-image-2` 5/12、`gpt-image-2-c` 13/20、`gpt-image-2.5-sunburst` 3/4、`gpt-image-2-all` 0/1。课堂样本是持续出现的非计划流量，样本数不齐且不同提示词/参考图组合，不能将这些暂态比例直接当成模型独立稳定性结论。

同时本窗口中新有两笔 `doubao-seedance-2-5-260628` upstream timeout terminal；详见任务 `6ac4ef48-493a-49d5-b85a-457bb7355faf` 和 `da83e1ef-bff7-4399-b423-1ea65850df16`，均在兔子渠道返回“生成接口响应超时”。此前低分辨率素材导致的 `doubao-seedance-2-0` 错误累计增加，确认不是单个偶发样本。还有12个 task attempt 出现图片大响应后的 stack overflow（选择模型扩展至 `gpt-image-2.5-sunburst`）；需区分最终 task error 与其内部 attempt error，避免把同一个 task重复计算为独立失败。

截至11:29:29的服务器心跳：全局637 success/286 error/4 active，ready/worker健康；CPU 11.03%，MemAvailable约5.72GiB，磁盘53.23%，三个容器均无restart/OOM。监控还在持续，不能停写课堂证据。

### 13.14 11:35 北京时间课堂新增证据：图片上游 HTTP 200 后本地栈溢出；视频素材校验及超时仍在发生

观察时点：2026-10-22 11:35:52（北京时间）；来源为生产只读监控 `latest.json`、按任务ID追踪的 `task-changes.jsonl`、任务诊断事件及 `alerts.jsonl`。这不是监控方主动付费测试，是课堂真实流量的服务端证据。

**新确认的图片严重故障：**任务 `84dc1d63-b01a-4c1b-84ec-c09105a06ee8`（用户选择 `gpt-image-2-all`，11:30:34创建，11:33:24终态失败）先后尝试两个渠道，两个上游都返回HTTP 200，但应用层均随后抛出 `Maximum call stack size exceeded`：

| attempt | 实际路由模型/渠道 | 上游证据 | 平台结果 |
| --- | --- | --- | --- |
| 1 | `gpt-image-2` / 兔子 | `upstream_response` HTTP 200，耗时75,108ms；上游request ID `202610220330357989777878268d9d6fV8LCbkY` | 紧接着 `provider_exception` 为栈溢出；attempt失败 |
| 2（fallback） | `gpt-image-2-all` / ModelBay | `upstream_response` HTTP 200，耗时81,681ms；上游request ID `81493217-7580-4c25-af66-424d262066e3` | 随后再次 `provider_exception` 栈溢出；任务最终失败 |

因此，这次不是“请求没转发到上游”或上游直接拒绝：两次都已获得HTTP 200，故障发生在收到上游响应之后的平台处理链。两个request ID应交上游核账，平台侧也要核对积分扣退；仅凭HTTP 200不能断言上游已完成可计费图片，也不能断言用户积分已正确退款。现有受限诊断没有堆栈位置/响应正文处理阶段细节，具体触发函数仍未证实；但该任务足以否定“上一轮修复后栈溢出已消失”。这是本轮新捕获、此前未被当前窗口样本覆盖的回归/残余问题。

**同时观察到的视频故障：**11:15–11:35的唯一任务最新态统计中，重复出现参考素材宽或高不在上游300–6000px范围的终态失败（5个高度签名、4个宽度签名；签名任务集可能重叠于其他attempt类别）。任务 `4c40c43a-6cc1-4e62-9eff-fcf0c9cd03f1`、`f652044e-3f97-4bc0-99ca-636251deeb72`明确因Height下限失败；另有 `527448ed-67be-4c8c-8082-b07ca7f2e996`、`9c59fe0c-e097-4d39-9af5-49084afd504c`因Width下限失败。其余不能仅凭简化任务消息判断错误源在平台转换还是上游，应按事件阶段分别核验。

Tuzi `doubao-seedance-2-5-260628`任务 `7a1ffb78-4dd8-4ba1-928a-5b6282dfe0ec`的POST上游耗时90,462ms后返回HTTP 504，request ID `202610220332573250361798268d9d66q7R8TaB`；响应/transport均为504，重试耗尽，未产生upstream_task_id。证据支持“上游请求阶段超时”，不能推断其已接受生成或已扣费。模汇 `official/seedance-2-5`另有HTTP400素材接口失败，且有不同的本地素材尺寸拒绝；需按任务事件分别归因，不能统称为一个bug。

**全局与本机监控状态：**11:35:17生产心跳为641 success、293 error、7 active；ready与generation worker健康，CPU约8.98%、MemAvailable约5.62GiB、磁盘使用53.23%，App/Worker/Postgres均restart=0、OOM=false。该成功/失败为全局历史累计，不是本课堂窗口成功率。

另外发现本机报告更新器自身连续失败：`reporter-alerts.jsonl`在11:25–11:34有8次 `update-status.cjs`失败，错误均为 `spawnSync python ETIMEDOUT`，其调用 `snapshot_summary.py`设置18秒超时。底层 `monitor.cjs`仍持续更新心跳、快照和告警，所以服务端只读采样没有中断；但自动报告渲染会落后，不能把其报告状态视作最新。这是监控报告链路问题，不是生产业务请求故障。当前人工从最新快照及task-changes补核；后续应先优化/修复本机汇总任务，再依赖自动刷新状态。

### 13.15 11:41 北京时间复核：同类栈溢出再次独立复现，并出现已提交上游任务后的媒体403

11:35之后按 task ID 追踪又发现两笔不同的画布图片失败，证明13.14不是孤立单笔：

1. `eef5a3ce-d1c7-41a8-ad8f-fed0c73f5c12`，用户选 `gpt-image-2-c`，共两次attempt。模汇 attempt 上游HTTP200，响应正文完整读取 **6,635,419 bytes** 后 `provider_exception: Maximum call stack size exceeded`；自动fallback兔子 `gpt-image-2` 也HTTP200，正文完整读取 **6,661,931 bytes** 后同样栈溢出。第二次上游request ID `202610220336283452092368268d9d67tge5EhA`，第一次为 `b0ed5e14-d43f-444f-8988-698a05779d6b`。请求参数记录4张PNG参考图（各约1.62–4.79MB）、`response_format=b64_json`。证据进一步收敛到大JSON/B64响应完整收到后的平台响应处理链；但由于没有JS堆栈帧和精确处理子阶段，不能把根因定为某个具体递归函数，也不能仅凭相关性宣称“6.6MB必然触发”。
2. `7f0f4f07-28e0-4acc-8d13-1de97672949f`，用户选 `gpt-image-2`。兔子首attempt在上游HTTP200后发生同样栈溢出；ModelBay fallback则已经获得上游 task ID `task_5QaBI51hSvVztoc2ozZUaJF3t4ksQKxY`，之后轮询阶段HTTP403，平台记录“上游图片无法通过授权媒体路径读取”/“媒体路径未获任务授权”。这与“fallback没有发出请求”不同：fallback确已创建上游任务，失败发生在后续媒体授权/读取路径。需查该task的上游计费状态和平台退款流水；还需对照此任务fallback输入引用及上游生成结果URL的scope/签名映射，定位是请求素材授权还是结果媒体代理授权，当前两者不能混为一谈。

11:41:06生产全局心跳更新为647 success、296 error、2 active；ready/worker健康、CPU 16.62%、MemAvailable约5.67GiB、磁盘53.25%，容器无重启/OOM。此处累计仍为全局数，不当作课堂窗口成功率。`report-watch`已恢复：更新 `snapshot_summary.py` 为基于持久化byte-offset的增量汇总，首次建立缓存扫描1.586GB快照耗时约23秒，之后单轮约0.24秒；手工执行 `update-status.cjs` 成功生成滚动状态。11:38:51以后到11:40:54的watchdog快照持续新鲜且无告警，旧的18秒全文件重扫超时已消除。变更仅限本机 `C:\Users\admin\Downloads\VOZEB-classroom-monitor-20261021-1441\` 监控脚本，不改服务器、生产代码/配置或数据库。

### 13.16 11:44 北京时间新捕获：5分钟提交阶段无上游响应，监控分类需区分“请求已发”与“上游已受理”

新任务 `cfc54db0-5aaf-4a85-a48e-64d6029fa2bc`（课堂画布，用户选择 `gpt-image-2-c`）于11:37:09创建，尝试模汇X中漫渠道。诊断记录显示平台执行了`provider_start`、`transport_request`及`upstream_request` POST，参数含一张5,198,791字节PNG参考图，`response_format=b64_json`。任务直到11:42:24才以“图片任务在提交阶段中断，未取得上游任务ID”失败，attempt耗时315.036秒；可见事件中没有`upstream_response`、HTTP状态、上游request ID或上游task ID。

当前能证明的是**平台确实发起了POST，但约315秒内未取得可关联的上游响应/任务ID**；不能证明上游收到了完整请求、接受生成或扣费，也不能证明其没有扣费。需要按本地trace/request时间与模汇上游查入口日志，并核对用户积分流水；在查明前不得将该类失败简单当作可安全重试。与之前“上游HTTP200后应用栈溢出”和“已拿上游task ID后媒体403”是三个不同生命周期阶段。

11:44生产全局心跳：647 success、297 error、5 active；ready/worker健康，CPU约6.25%，MemAvailable约5.99GiB，磁盘53.25%，三个容器restart=0/OOM=false。只读监控进程继续运行。

### 13.17 11:46 北京时间持续监控：新一轮请求暂未再增加失败，但之前提交超时问题尚未解除

截至11:45:45生产心跳：全局650 success、297 error、6 active；分类型累计为图片401 success/220 error/3 running，视频75 success/70 error/3 running，文本174 success/7 error。该表为服务器全局累计，不能替代10:20后课堂唯一任务窗口的去重成功率。11:42以来task-changes新增/更新10笔，其中6笔成功、4笔仍在运行；暂未发现新的终态失败签名。任务 `cfc54db0-5aaf-4a85-a48e-64d6029fa2bc` 的315秒提交阶段中断仍是最近一次新失败，不能当作已解决。

watchdog最近采样时延28秒、samplerAlive=true、issues=[]；App/Worker/Postgres均无重启/OOM；CPU约2%、MemAvailable约5.91GiB、磁盘53.25%。报告更新器使用增量快照汇总后保持新鲜，监控继续只读，不发测试生成请求、不动生产配置和数据库。

### 13.18 11:49 北京时间二次复查：新增任务均成功，未见新终态失败

11:42后新增的课堂任务更新继续推进：截至11:47之后的最新任务变化共3笔，均为图片成功（`gpt-image-2-c`两笔、`gpt-image-2.5-sunburst`一笔）；从11:42:50最近一次告警至11:48:40心跳，未出现新告警。11:48:40生产累计654 success、297 error、3 active，ready/worker健康；CPU约1.01%，MemAvailable约5.87GiB，磁盘53.26%，无容器重启/OOM。该窗口短期新增成功不表示之前的栈溢出、媒体403、提交超时或视频素材尺寸问题已修复。只读监控继续。

### 13.19 11:52 北京时间新故障：多参图像请求出现本地模型绑定403与上游不支持参数400

11:50:36–11:51:06连续捕获3笔图片失败，均为课堂真实请求；按诊断阶段拆分如下，不能只看前端笼统的403：

| 任务 | 用户选择/实际路由 | 服务端关键证据 | 结论 |
| --- | --- | --- | --- |
| `9c81f350-5ff0-472f-9007-5b5168fee764` | 用户选 `gpt-image-2-all`；先选ModelBay执行 `gpt-image-2-text-to-image`，后fallback模汇执行 `gpt-image-2-all` | attempt1在约10ms内于平台本地报“参考素材不存在或无权访问”，无provider/upstream request；attempt2只有平台`transport_request`，随即HTTP403，错误“该上游模型未绑定可用逻辑模型”，没有`upstream_request/response` | 两个独立平台侧阻断：首选路径参考素材owner/scope校验失败；fallback模型绑定/路由配置缺失。该403不是上游渠道返回。 |
| `eb003aca-8cc5-400e-a28d-3f9b962dbbe7` | 用户选 `gpt-image-2-5-flare`，最后状态显示fallback执行 `gpt-image-2-text-to-image`→`gpt-image-2-5-flare` | attempt1参考素材本地权限检查失败（无上游调用）；attempt2内部HTTP403 “该上游模型未绑定可用逻辑模型”，无上游请求/响应 | 与上一笔同一类模型绑定/参考素材组合问题，非模型上游HTTP403。需检查跨模型fallback候选与可用逻辑模型绑定表。 |
| `c90ab862-8642-4611-a8b3-14a48c3e999c` | `gpt-image-2-5-flare` / ModelBay | 请求真实到达上游；请求含3张参考图、`response_format=b64_json`、`output_format=jpeg`、`quality=medium`、`size=2720x1536`。上游HTTP400，正文139字节：`Unknown parameter: 'response_format'.`，耗时约9.2秒 | 这是上游明确拒绝请求参数，不是平台未发送。需要按该上游模型API能力决定移除/转换response_format，并加渠道+模型粒度能力适配；不能对所有图片模型全局删除该字段。 |

这些样本说明课堂新增问题不只是“模型不稳定”：一部分在平台reference授权/fallback绑定阶段就被拦截，另一部分已到ModelBay但payload协议不兼容。当前生产累计11:51:35为655 success、300 error、3 active，服务ready/worker健康，CPU约2.01%、MemAvailable约5.82GiB、磁盘53.26%，无容器重启/OOM。上述3笔已计入全局失败；窗口成功率另需按课堂起点对唯一任务去重后计算。

证据来源：`latest.json`任务事件详情、`alerts.jsonl`、`task-changes.jsonl`。上游参数拒绝证据任务为`c90ab862-8642-4611-a8b3-14a48c3e999c`；两笔HTTP403任务在事件序列中缺少`upstream_request`，因此报告明示为平台内部路由/绑定拒绝。

### 13.20 11:54 北京时间跟进：三笔新增图片失败已定位；两笔视频仍长时间轮询，尚未终态

截至最新采样11:53:54，两笔视频任务 `8efc7489-20da-4eb3-87d1-16cc573a1293`、`a96ab67b-ac12-4d37-802a-bec78d7caa95`分别处于polling约535秒、518秒；每轮均取得完整的小JSON正文（143 bytes），服务未报告终态错误。由于当前保留事件未提供正文状态字段，暂不能判断上游是在排队还是持续生成；将其标为长等待观察项，不提前计为失败。`official/seedance-2`任务`0c40b511-f0c2-49e7-8abb-feb30c87aa62`也在轮询中约216秒。

11:53:19全局累计655 success、300 error、6 active，ready/worker健康，CPU6.77%、MemAvailable约5.85GiB、磁盘53.26%，无容器重启/OOM。告警最近三笔仍是13.19列出的2笔内部403与1笔ModelBay上游400；11:51:35之后没有更晚的失败告警。监控继续跟踪这些视频轮询是否转为成功/失败/超时，并继续抓取新的图片响应参数错误。

### 13.21 11:56 北京时间持续跟进：一笔长轮询视频成功，另两笔约10分钟仍在处理

截至11:55:39，11:51之后新增终态任务为图片 `gpt-image-2` 成功（`a9e4e8a0-0080-4bbd-9d41-1dfd2029f2ed`）以及视频 `official/seedance-2` 成功（`0c40b511-f0c2-49e7-8abb-feb30c87aa62`）；未出现比11:51:35更晚的新失败告警。此前约3分36秒轮询的official/seedance任务已成功。

仍有两笔 `doubao-seedance-2-0` 任务处于polling：`8efc7489-20da-4eb3-87d1-16cc573a1293`约640秒、`a96ab67b-ac12-4d37-802a-bec78d7caa95`约622秒，均已有上游task ID。历史课堂中视频成功耗时可超过15分钟，因此当前只标记长等待，不单独判失败；继续观测其上游轮询是否终态和用户画布节点是否回写。

11:55:39生产全局累计658 success、300 error、3 active；ready/worker健康，CPU3%、MemAvailable约5.80GiB、磁盘53.26%，容器无重启/OOM。监控进程正常，报告更新器无新增报错；课堂实时只读。

### 13.22 11:59 北京时间持续跟进：最新成功增加；一笔视频轮询超过13分钟仍未终态

截至11:58:34，全局累计660 success、300 error、5 active；相较11:55:39增加2成功、失败数未变。最近一条失败告警仍为11:51:35的 `Unknown parameter: 'response_format'.`，暂未出现新终态失败签名。

视频任务 `8efc7489-20da-4eb3-87d1-16cc573a1293`（`doubao-seedance-2-0`）已polling 815秒，仍有上游task ID；另外3笔视频分别约331秒、103秒、76秒，同处polling且具备上游task ID。当前快照不足以证明第1笔已超出供应商时限或卡死，因此标记为高龄在途观察而非失败；一旦出现终态错误/成功或在途状态异常，将按任务ID补充最终结果。另有一笔图片提交41秒仍无上游ID，继续观察提交阶段是否超过时限。

服务器ready/worker健康；CPU约2.24%、MemAvailable约5.72GiB、磁盘53.26%，App/Worker/Postgres无重启/OOM。监控进程与watchdog持续更新，课堂请求未主动重放。

### 13.23 12:02 北京时间反例校准：同样约6.5MB的图片响应可成功；不能把栈溢出简单归因于响应体积

任务 `22ccab50-ac70-46ba-b8c9-4297f9d64300`（用户选 `gpt-image-2-c`、模汇渠道）于11:57:53创建，带2张PNG参考图（9,616,337与5,847,858字节），请求`response_format=b64_json`。上游HTTP200，request ID `7da035e0-b901-4163-beea-d6d37feb9828`，响应正文完整读取6,507,823字节，随后服务端成功结束；完整任务时长138.659秒。该样本与此前6.6MB左右body后栈溢出的两笔任务构成直接反例：**响应字节数本身不足以解释stack overflow**。现阶段只能确认栈溢出发生在部分HTTP200后的应用处理路径；需对比响应JSON结构、实际data URI/base64层级、资产重写/结果持久化步骤及图像数量/格式，取得堆栈帧或更细阶段日志后才能锁定函数。报告先前“聚焦大响应处理链”仅作排查方向，不是已证实根因。

截至12:00:54生产全局累计662 success、300 error、4 active；最近失败告警仍为11:51:35的`Unknown parameter: response_format`，其后没有新的失败告警。视频`8efc7489-20da-4eb3-87d1-16cc573a1293`已polling 954秒（约15分54秒），仍持有上游task ID，另3笔视频也在polling；目前没有终态错误，列为超长等待待追，不将其判为失败。服务/worker健康、CPU1.25%、MemAvailable约5.79GiB、磁盘53.26%，容器无重启/OOM。监控继续只读。

### 13.24 12:03 北京时间完成长视频追踪：约16分19秒的任务最终成功，属性能长尾而非失败

此前持续监控的 `doubao-seedance-2-0` 任务 `8efc7489-20da-4eb3-87d1-16cc573a1293` 于12:01:19终态success；generation_log完整耗时979,267ms（16分19秒），单attempt成功，已有上游task ID `task_0a2FtFrXUfH4Io9KvsHBCJDrMe1iUgxC`。`doubao-seedance-2-0`另一笔 `abc4f86c-787c-4591-870d-29e4fe548c96` 耗时452,126ms（7分32秒）成功；兔子 `doubao-seedance-2-0-260128`任务`4eb0a6c0-d4eb-40a6-9f4a-987d9e2b9869`耗时285,116ms（4分45秒）成功。三笔均非失败，但16分19秒构成明显用户等待长尾，应在完整报告中单列耗时/体验，不应被成功率掩盖。当前证据只给完整任务时长，没有精确拆分上游生成与平台轮询等待，不能将耗时全部归到上游推理。

12:02:05全局累计664 success、300 error、3 active，ready/worker健康；CPU4.25%、MemAvailable约5.81GiB、磁盘53.26%，容器无重启/OOM。11:51:35之后仍没有新增失败告警；仅剩视频`e7bd26d4-8b84-40ad-a586-776cca7dcaf7`、`8ea59933-7027-4b47-9006-a93c67986594`在途（313秒和113秒），以及新图片提交（69秒）待终态。

### 13.25 12:04 北京时间新增失败复现：大响应后的栈溢出再次出现，自动fallback又撞模型绑定403

新任务 `0cade6ac-5159-4c43-8821-ca62789def72`（用户选`gpt-image-2`）于12:00:56创建，12:02:57终态失败，总耗时121.475秒。

| attempt | 阶段证据 | 结果 |
| --- | --- | --- |
| 1：兔子 `gpt-image-2` | 上游POST确实发出，4张JPEG参考（166,060、1,670,392、78,470、381,455 bytes），尺寸2720x1536、quality=medium、`response_format=b64_json`。上游HTTP200，request ID `202610220400587353488748268d9d6wUI1eCo1`，总耗时115.148秒；正文完整读取 **6,997,343 bytes** 后，平台`provider_exception`报`Maximum call stack size exceeded`。 | 上游已返回200，异常发生在平台收到完整响应后的处理过程；缺堆栈帧，精确函数未知。 |
| 2：ModelBay fallback | 试图映射到 `gpt-image-2-5-flare`，有平台`transport_request`，36ms后内部403，错误“该上游模型未绑定可用逻辑模型”；没有`upstream_request/response`。 | fallback并未真正发到ModelBay上游，属于平台逻辑模型绑定/路由阻断。 |

本例确认栈溢出问题仍在课堂真实链路复现；同时也说明它不等于“响应越大必失败”：此前`gpt-image-2-c`收6,507,823 bytes成功，而本例6,997,343 bytes失败；样本量与响应结构都不足以建立体积阈值。需保留内容结构/解析/结果处理阶段的相关性，等待带堆栈与更细阶段证据，不能硬推根因。fallback绑定403是独立的平台配置缺陷，且发生在上游请求之前。上游请求ID需与渠道核账；平台积分扣退另查流水，不从HTTP200推断已计费。

截至12:03:50生产全局664 success、301 error、3 active；ready/worker健康，CPU1.5%、MemAvailable约5.79GiB、磁盘53.26%，容器无重启/OOM。新增失败仅此任务，纳入全局累计；窗口成功率另按课堂任务去重。

### 13.26 12:09 北京时间：新的多参图片任务成功，但上游响应体读取耗时82秒

先前在提交阶段观察的任务 `7e5ceab6-b6a8-4e0c-bcf1-1f6fe189acbb` 于12:08:00成功，generation_log完整耗时271.780秒，单attempt，用户选择`gpt-image-2-all`，模汇渠道。该任务请求含4张JPEG（166,060、1,670,392、78,470、381,455 bytes），2720x1536、medium、`response_format=b64_json`。上游HTTP200，request ID `2e992f5a-9d32-4ede-92bf-ac1469ab3de2`；从上游request到收到响应头/首段耗时189.078秒，接收响应正文阶段另耗82.001秒，完整响应体13,517,770 bytes，transport完整响应耗时271.137秒。也就是说该任务虽然成功，但绝大多数用户等待时间在上游响应阶段，正文读取本身又占约82秒；只把它标成“成功”会掩盖体验长尾。当前证据能拆出“首响应等待”和“正文读取”两段，但不能独立区分上游生成时间、上游限速、机房链路或本地下载瓶颈；需用同模型同尺寸的后续样本和上游request ID继续对照。

这笔任务在11:03:28（北京时间）已发出POST，11:06:37收到HTTP200及34,869 bytes首段，到11:07:59才完整读取13.5MB正文，随后成功；它不是此前315秒无response事件的中断任务，也不是HTTP200后栈溢出。可作为单独的多参图像长响应性能样本。

截至12:09:04全局心跳为668 success、301 error、0 active；ready/worker健康，CPU约1%、MemAvailable约5.88GiB、磁盘53.26%，容器无重启/OOM。此刻没有进行中的生成任务；课堂监控和告警采样进程仍在线。

### 13.27 12:14 北京时间新视频样本：兔子上游因参考内容真人检测返回400；另有图片提交响应等待中

新任务 `be71f144-863c-41a7-a8a5-d1fb7b956337`（视频，`doubao-seedance-2-0-260128`，兔子渠道）12:12:46创建、12:13:11失败。平台发出上游POST后21.353秒收到HTTP400，正文明确为`content[1]`和`content[2]`可能包含真人；上游request ID `202610220412504752706938268d9d6ilfoiwHi`，安全/内容request ID `02179264238110420cfcaf0410bba00355b4c276f44ffedd4635c`。这是兔子上游内容策略拒绝，不是平台没发送或服务器超时；当前诊断没有保留被标记的参考图实际视觉内容，不能进一步声称是哪张图/为何被判定。与之前的真人素材拒绝属同类新样本，建议产品侧给出明确可行动提示（替换含真人素材/查看上游限制），并按task/上游request ID向渠道核对判定规则。

同一时段图片任务 `083ce6f1-5f63-4cc4-a77b-4f9b57f0167e`（`gpt-image-2-all`）已发出模汇POST，但截至12:13:42仍处于submitting约244秒，没有upstream_response/task ID；这是待观察的提交阶段长等待，尚未到之前315秒的终态失败阈值，未提前计失败。

12:13:42生产全局累计669 success、302 error、2 active；ready/worker健康，CPU约3.01%、MemAvailable约5.87GiB、磁盘53.27%，容器无重启/OOM。课堂只读监控继续。

### 13.28 12:16 北京时间：真人拒绝复现；另一个三参图片超长响应成功但正文读取仍慢

课堂视频真人拒绝再次复现：任务 `a17ea300-c3d2-489a-9c03-9e1d6dbc9e03`（兔子 `doubao-seedance-2-0-260128`）上游request ID `202610220413458419071478268d9d6j6iIHmpj`，21.023秒后HTTP400，明确引用两个输入位置`content[1]`、`content[2]`可能含真人；错误安全关联ID `0217926424370331dd291674643982da436c46312b5f1c9275073`。与12:13:11任务是连续两次同类拒绝；平台已把上游原文透传。需上游解释/误判申诉证据，现有平台日志没有图像内容，不能定具体图片。

此前三参`gpt-image-2-all`任务 `083ce6f1-5f63-4cc4-a77b-4f9b57f0167e`最终于12:14:34成功，完整耗时295.812秒。更新上游request ID `3029d0d9-9a13-45ab-94f7-16ccee5d7c28`，HTTP200；从请求到收到上游响应阶段268.189秒，随后读取14,447,929字节正文又耗25.016秒，transport总耗时293.290秒。再次表明长耗时集中在上游等待而不只是正文读取，本机CPU/内存正常；但尚不能将268秒归因到上游推理或网络的某一个环节。

12:15:27生产全局669 success、303 error、0 active；ready/worker健康，CPU3.51%、MemAvailable约5.88GiB、磁盘53.27%，无容器重启/OOM。之后没有新在途任务；只读监控持续等待课堂流量。

### 13.29 12:18 北京时间巡检：暂无课堂新任务，生产监控与资源状态正常

截至12:17:46，12:15后未观察到新的任务变更、生成失败告警或在途任务；全局累计仍为670 success、303 error、0 active。App readiness与generation worker健康，CPU约0.25%、MemAvailable约5.89GiB、磁盘使用53.27%，App/Worker/Postgres无重启/OOM。watchdog采样新鲜、sampler在线且issues为空。之前13.27–13.28中真人素材策略拒绝、图片长响应、模型fallback/response_format问题仍是本轮需要跟进的未解决项；本次只是短暂无新流量，不代表它们已修复。监控进程继续只读运行。

### 13.30 12:22 北京时间：视频真人拒绝第3次复现，兔子Seedance 2.5提交超时；课堂窗口新增4失败

12:13之后追踪到的课堂任务中（以任务ID去重，取最新状态），6笔：1成功、4失败、1仍在途。失败由三笔兔子真人素材策略HTTP400和一笔兔子Seedance 2.5请求超时组成，不能混为同一个原因。

- 真人素材拒绝第3次：任务 `8c7d72e1-37cd-4abb-afb6-f141cccd704b`，`doubao-seedance-2-0-260128`，12:21:18创建，25.184秒失败。POST确实到达兔子，HTTP400（21.168秒），上游request ID `202610220421225481164698268d9d6Fh1ejGPp`，错误仍指向`content[1]`、`content[2]`可能包含真人，安全关联ID `021792642891052fc70b79e699e1a6fcafbbefdc4fb04122eedfd`。此前两笔同类任务分别有独立request ID；这是重复策略拒绝，不是平台未发送。
- 兔子Seedance 2.5请求超时：任务 `a53f3e52-6975-4aec-9cf3-297f16e9a0a0`，12:18:54创建，完整耗时98.019秒。上游POST已发送，但兔子返回HTTP504，耗时91.012秒，request ID `202610220419018468579328268d9d6ADlW0usl`，重试耗尽且无上游task ID。能确认上游提交阶段超时；不能据此确认上游是否已处理/收费。
- 同窗口有一笔`gpt-image-2-all`图片成功，另有一笔图片仍running；详见任务变化快照，不提前纳入终态比例。

截至12:21:51生产全局累计670 success、305 error、1 active；ready/worker健康，CPU约2.01%、MemAvailable约5.72GiB、磁盘53.27%，无容器重启/OOM。报告明确保留本窗口4失败/1成功/1在途的去重样本量（若后续在途任务完成，统计需重算），不把全局累计冒充课堂窗口指标。监控继续只读。

12:23:01后复核：先前仍在途的`gpt-image-2-all`图片已成功，全局累计更新为671 success、305 error、0 active。故12:13后去重窗口应修正为6笔终态任务：2成功、4失败（3真人拒绝、1上游504）；并非1笔成功/1在途。该修正仅基于task-changes最新任务状态，失败类别和已记录任务证据不变。

### 13.31 12:27 北京时间跟进：官方Seedance轮询视频成功，约3分15秒

任务 `41e80ec3-b6d3-4860-bdbe-a381ec979819`（`official/seedance-2`，ModelBay渠道）于12:23:05创建，12:26:20成功；完整任务耗时195.372秒，持有上游task ID，轮询期间获得多次小JSON响应。12:26:31全局累计672 success、305 error、1 active；此后没有新失败告警。另有新视频任务`34547962-fe28-4d79-9dc8-189637e319e2`（模汇`doubao-seedance-2-0`）已进入轮询35秒，有上游task ID，继续等待终态，不计入已完成统计。生产ready/worker健康、CPU17.84%、MemAvailable约5.81GiB、磁盘53.27%，容器无重启/OOM；只读监控继续。

### 13.32 12:30 北京时间跟进：一笔兔子图片成功；模汇Seedance视频长轮询已超过4分钟

12:30:00生产全局累计673 success、305 error、2 active。兔子`gpt-image-2`图片任务`97245a31-8590-4cc6-a34f-e399e6eca483`于12:28:01创建、12:29:11成功，完整70.289秒；上游HTTP200，request ID `202610220428093147078588268d9d6m31TMK8w`，正文2,546,679 bytes，读取约7.095秒。这是课堂中的真实图片成功样本，没有新增失败告警。

模汇`doubao-seedance-2-0`视频任务`34547962-fe28-4d79-9dc8-189637e319e2`已于12:25:56创建，轮询约244秒，已有上游task ID `task_mCwN2PR1OjKjtr2dX773JGzsfF0S0i5N`；尚未终态，轮询返回143 bytes小JSON，但保留事件没有可解释的status字段。此前同渠道Seedance任务有长尾成功，因此暂列在途/慢任务观察，不判失败。另有新图片任务刚启动25秒仍在提交，继续追踪。

截至本次检查，新失败告警仍停留在12:21:51的真人素材拒绝；服务器ready/worker健康、CPU6.53%、MemAvailable约5.85GiB、磁盘53.27%，无容器重启/OOM。生产环境未改配置或发起测试生成。

### 13.33 12:32 北京时间新增视频失败：上游完成轮询后以“输出疑似版权相关”拒绝结果

任务 `34547962-fe28-4d79-9dc8-189637e319e2`，用户选择 `doubao-seedance-2-0`，模汇渠道，12:25:56创建，12:30:34失败，完整任务耗时277.474秒。该任务已取得上游task ID `task_mCwN2PR1OjKjtr2dX773JGzsfF0S0i5N`，并持续轮询；最后一次上游响应正文401 bytes后，平台收到错误：`The request failed because the output video may be related to copyright restrictions.`，关联ID `02179264315868800000000000000000000ffffac15dcc494ebd9`。因此这是**上游结果阶段的版权/内容策略拒绝**，与先前兔子对输入图判定真人（输入审核）不同；并非平台提交失败或模型绑定403。现有日志没有保留命中版权规则的具体视频帧/文本证据，无法判断触发源、是否误判、上游是否已产出可计费视频；需凭upstream task ID及关联ID向模汇核查，并对照平台积分退款流水。

截至12:31:10生产累计674 success、306 error、3 active；ready/worker健康，CPU约6.53%、MemAvailable约5.70GiB、磁盘53.27%，容器无重启/OOM。另有1张图片和2条视频在途，未计入终态。该版权拒绝已记录为新失败类型并纳入课堂复盘；监控继续只读。

12:31:44采样随后新增了一个刚提交的`official/seedance-2`视频任务`03202946-a071-4cb5-86df-b12e5f55c5e3`，因此最新在途数应为4（2条模汇视频轮询、1条兔子图片提交、1条官方Seedance视频提交），不是上一段心跳时的3条；所有均未计入终态。监控器保持在线。

### 13.34 12:33 北京时间新视频能力错误：official/seedance-2收到参考视频后由上游HTTP400拒绝

任务 `03202946-a071-4cb5-86df-b12e5f55c5e3`（用户选`official/seedance-2`，ModelBay渠道）于12:31:43创建，12:32:06失败，耗时22.757秒。平台已向上游POST，`upstream_request`参数摘要只保留model与duration（媒体字段在当前诊断摘要中未保留）；上游HTTP400，正文106 bytes，明确返回`official/seedance-2 does not accept reference video input`。因此这是**该模型/渠道组合不支持视频参考输入的能力限制**，不是请求未发送，也不是图片格式/媒体授权错误。课堂链路选择了图生视频/视频参考能力，但当前模型本身只接受其它输入类型；需要前端能力矩阵按具体逻辑模型准确禁用/提示“此模型不支持参考视频”，或用户改选明确支持视频参考的模型，并补充能力矩阵回归，不能将所有Seedance模型一概而论。该任务是否触发退款应另查积分流水；HTTP400不能推断扣费。

12:32:19生产心跳为675 success、307 error、3 active；App/Worker/Postgres健康、无重启/OOM。同期两条模汇`doubao-seedance-2-0`视频仍在上游轮询（均已取得task ID），另有一个官方Seedance视频在提交阶段，均继续待终态；服务器资源正常。本节为课堂新增失败，不是监控方主动测试。

### 13.35 12:35 北京时间复核：official/seedance-2参考视频不支持在连续3笔真实任务中复现

同一课堂时段，`official/seedance-2`的参考视频输入错误连续出现在3个独立任务：`03202946-a071-4cb5-86df-b12e5f55c5e3`、`a8b49f03-964d-46fb-8a1e-596a895fa873`、`f10e5b40-7386-46b5-b175-18716d83854f`。三笔均经过真实上游POST并收到ModelBay HTTP400，原文一致为`official/seedance-2 does not accept reference video input`；耗时分别22.757秒、24.437秒、26.022秒。前两次HTTP响应耗时约2.952秒和0.575秒，第三次1.424秒。上游事件参数摘要仅保留模型和duration（不含媒体字段），故错误原文是当前能力限制的关键证据；无法仅从request摘要确认具体是哪一条媒体字段/视频引用触发。

这不是单笔偶发，也不是连接/超时，而是用户连续选择此模型并带参考视频导致可重复的模型能力不匹配。应将`official/seedance-2`参考视频能力设为不支持/生成前提示切换模型；若产品实际意图支持，需先确认ModelBay对应上游型号的真实能力与正确payload，再修复适配。不可通过忽略上游400或对所有Seedance模型统一关闭视频参考处理。

截至12:34:03生产全局675 success、309 error、3 active；两笔模汇Seedance 2.0视频仍在轮询（约3分钟，均有上游task ID），另一个官方Seedance视频还在提交。服务和worker健康，容器无重启/OOM；只读监控继续。

### 13.36 12:36 北京时间更新：official/seedance-2参考视频能力错误第4次复现

新增任务 `d63f31bb-7341-4117-ac44-4c0845ad3b61` 再次选择`official/seedance-2`并提交参考视频；ModelBay上游再次HTTP400 `official/seedance-2 does not accept reference video input`。这使本时段该能力不匹配从3笔增加到**连续4笔**，强烈表明前端能力选择/提示未拦截该组合，用户可以重复触发必然失败的请求。新任务从创建至失败约26.022秒。错误是上游明确返回；请求摘要仍未保留视频附件细节，不能断言具体错误字段，但模型与能力组合被明确拒绝。

12:35:13全局累计675 success、310 error、2 active；两个模汇`doubao-seedance-2-0`任务分别轮询268秒、265秒，均持有上游task ID；尚未终态，当前没有资格判成功或失败。服务ready/worker健康、CPU2.01%、MemAvailable约5.72GiB、磁盘53.29%，容器无重启/OOM。课堂只读监控继续。

### 13.37 12:37 北京时间新视频失败：兔子拒绝输入参考视频中的真人内容

任务 `7e7d5d12-d1b0-4d5a-875f-4ca2de7435de`（兔子`doubao-seedance-2-0-260128`）于12:35:24创建；平台POST确实到达兔子，上游耗时38.942秒后HTTP400。上游request ID `202610220435247780254438268d9d61M9txc7w`，安全关联ID `02179264374761838e0aa7d8d1d953ef9b4c650948c233895d66e`，原文为`The request failed because the input video 'content[1]' may contain real person.` 这是对**输入视频**的真人内容审核，与13.27–13.30中参考图片真人拒绝不同：本次明确拒绝对象是content[1]的视频。当前监控只留了“视频content[1]”索引，没有保存视频帧/素材本体，不能判断哪一帧/人物或是否误判；需拿request ID向兔子查具体审核原因，平台提示可建议换成不含真人的视频素材。是否扣费/退款仍查积分流水，不从HTTP400推断。

12:36:23生产累计675 success、311 error、2 active；两笔模汇Seedance任务仍在轮询，分别约338秒、335秒且持有上游task ID。服务器ready/worker健康，CPU0%、MemAvailable约5.84GiB、磁盘53.29%，无容器重启/OOM。监控仍只读；这是新类别，不能并入图片真人拒绝或`official/seedance-2`不支持参考视频的能力错误。

### 13.38 12:40 北京时间：没有新增终态错误，但三笔模汇视频轮询进入长等待

截至12:39:52，最近一次失败告警仍为12:36:23兔子拒绝参考视频真人，之后无新失败告警。模汇`doubao-seedance-2-0`三笔真实视频任务仍在polling并持有上游task ID：`834d2dbe-79c9-4a33-9ff9-be034c03159f`约547秒、`aa395f16-e167-4b75-8466-f1d45eed0e18`约544秒、`2239c34b-7012-4501-80d8-18323d930822`约195秒。前两笔已超过9分钟；当前状态仍是running，没有终态，因此不记作失败，但作为严重等待长尾持续跟踪上游轮询终态。

12:39:52生产全局累计675 success、311 error、3 active。ready/worker健康、CPU1.25%、MemAvailable约5.83GiB、磁盘53.30%，App/Worker/Postgres无重启/OOM。watchdog sampler在线、issues为空。课堂只读监控继续。

### 13.39 12:43 北京时间：第三笔模汇Seedance视频成功，耗时4分42秒；另两笔已超11分钟

任务`2239c34b-7012-4501-80d8-18323d930822`（模汇`doubao-seedance-2-0`）在polling约281.610秒后成功，generation_log完整耗时281,610ms（4分41.6秒），单attempt。另两笔同模型视频`834d2dbe-79c9-4a33-9ff9-be034c03159f`与`aa395f16-e167-4b75-8466-f1d45eed0e18`仍running，分别polling 685秒、682秒，已有上游task ID，未终态；其中一笔同渠道成功并不能推断这两笔之后必成功，也不能直接定失败。课堂视频耗时呈明显长尾，须单列体验指标并等待终态。

12:42:11生产全局累计676 success、311 error、2 active；ready/worker健康，CPU约2.51%、MemAvailable约5.70GiB、磁盘53.30%，容器无重启/OOM。之后无新增失败告警，监控保持只读。

### 13.40 12:45 北京时间跟进：两笔模汇视频轮询已达13分45秒，仍未终态

12:44:30全局心跳：676 success、311 error、3 active；没有比12:36:23更新的失败告警。任务 `834d2dbe-79c9-4a33-9ff9-be034c03159f` 与 `aa395f16-e167-4b75-8466-f1d45eed0e18` 均为模汇`doubao-seedance-2-0`，已分别polling 825秒和822秒，均存在上游task ID并持续收到143-byte轮询响应，但response body没有保留可读状态字段。此时不能据此宣布“上游卡死/失败”，但13分多钟等待已是严重体验长尾；需等最终态，随后以task ID向渠道查询任务详情/状态。另有`gpt-image-2-c`图片提交75秒无上游ID，继续看是否按提交超时失败或成功。

服务器ready/worker健康、CPU约6.98%、MemAvailable约5.72GiB、磁盘53.30%，容器无重启/OOM。Sampler/watchdog正常；监控仍只读，不主动重发。

### 13.41 12:47 北京时间跟进：gpt-image-2-c图片成功；两笔模汇视频已轮询15分多仍未终态

图片任务`38d82790-bd88-4318-988b-3e73306fcd96`（`gpt-image-2-c`、模汇）12:43:16创建，在submitting约140秒后成功，generation_log完整耗时139.916秒，说明此前12:44观察到提交约109秒仍无上游task ID的这笔图片并非失败。无上游ID的提交阶段超过一分钟属于长等待，但该样本最终成功；需要保留等待时长，不误报。

两笔模汇`doubao-seedance-2-0`视频`834d2dbe-79c9-4a33-9ff9-be034c03159f`和`aa395f16-e167-4b75-8466-f1d45eed0e18`仍polling，分别929秒/926秒（15分29秒/15分26秒），均有上游task ID，服务端最近仍持续轮询。尚无终态，不能判断结果或收费；这是当前最严重长尾，需继续观察结果是否成功、上游审核拒绝或平台超时。

12:46:14心跳676?截至本轮新快照为**677 success、311 error、2 active**；ready/worker健康，CPU7.56%、MemAvailable约5.83GiB、磁盘53.32%，容器无重启/OOM。最新失败告警仍为12:36:23的参考视频真人拒绝，无更晚失败告警。只读监控继续。

### 13.42 12:49 北京时间结论：两笔模汇Seedance超长轮询最终成功，耗时约17分35秒

此前连续观察的两笔模汇`doubao-seedance-2-0`视频最终都成功，而非失败：

| task ID | 创建时间（北京时间） | 最终状态/完整耗时 | 上游任务ID |
| --- | --- | --- | --- |
| `834d2dbe-79c9-4a33-9ff9-be034c03159f` | 12:30:45 | success，1,058,979ms（17分38.979秒） | `task_eXZhXeNnrfvu3BxKMja8UmtVfr0TfRCI` |
| `aa395f16-e167-4b75-8466-f1d45eed0e18` | 12:30:48 | success，1,054,785ms（17分34.785秒） | `task_Q4vd4PHscKteC2us146gIMjuaVBQftcw` |

它们轮询过程曾长时间没有终态，但上游task ID有效、服务持续轮询，最终都回成功；因此不可把长轮询一概标成失败或僵尸任务。另一方面，17分多钟仍是极严重的用户体验长尾，成功率会掩盖等待问题。当前日志提供总耗时与上游task ID，但不能拆出上游推理、队列等待及结果下载各自耗时，需渠道凭task ID查内部排队/运行时间以进一步定位。

12:48:34生产全局心跳为679 success、311 error、0 active；ready/worker健康，CPU约0.25%、MemAvailable约5.85GiB、磁盘53.30%，无容器重启/OOM。当前无在途任务，最近失败告警仍为12:36:23参考视频真人审核拒绝；监控进程在线，继续只读观察。

### 13.43 12:50 北京时间核验：两笔超长模汇视频均成功，当前无在途任务

12:48:34心跳显示全局679 success、311 error、0 active；此前13.42记录的两笔超长`doubao-seedance-2-0`视频均已成功。最新失败告警仍停留在12:36:23参考视频真人拒绝；12:48后没有新的任务失败或告警。ready/worker健康，CPU0.75%、MemAvailable约5.85GiB、磁盘53.30%，三个容器均无重启/OOM。当前暂时没有可继续定位的新失败样本，监控进程在线并继续只读等待；历史能力不匹配、审核拒绝和视频长尾仍未因此修复。

### 13.44 12:52 北京时间巡检：当前无新课堂任务/失败，服务与监控正常

截至12:52:04，没有12:49之后新增任务、失败告警或在途生成。全局累计仍为679 success、311 error、0 active；App ready与generation worker健康，CPU约0.75%、MemAvailable约5.82GiB、磁盘53.30%，App/Worker/Postgres无重启/OOM。watchdog sampler在线、采样新鲜、issues为空。此前已确认的上游拒绝、模型能力不匹配及视频长尾仍待平台/渠道修复，不因当前没有新任务而视为解决；只读课堂监控继续运行。

### 13.45 12:55 北京时间巡检：出现一笔新模汇视频，暂处正常上游轮询

12:52后新增课堂任务`8ce324af-6430-47eb-8c5f-e49c9ae6ec73`（模汇`doubao-seedance-2-0`）于12:52:24创建，当前polling约120秒，已有上游task ID `task_6ExkFOklLvnfg1npAd1jCxwpvGZmIH2e`；轮询接口返回143-byte小JSON，尚无终态状态字段，暂不判断成功/失败。12:54:24心跳全局679 success、311 error、1 active；12:36:23之后无新增失败告警。ready/worker健康，CPU3.77%、MemAvailable约5.83GiB、磁盘53.32%，容器无重启/OOM。监控持续只读。

### 13.46 13:00 北京时间：课堂新模汇视频仍在轮询，暂未产生新失败

截至12:57:19，新增模汇`doubao-seedance-2-0`任务`8ce324af-6430-47eb-8c5f-e49c9ae6ec73`仍running，polling约295秒并持有上游task ID `task_6ExkFOklLvnfg1npAd1jCxwpvGZmIH2e`；当前没有新失败告警。任务ID保留但轮询尚未终态，继续作为长等待观察，不判断成功/失败。

全局累计679 success、311 error、1 active；服务与worker健康，CPU约0.75%、MemAvailable约5.82GiB、磁盘53.32%，容器无重启/OOM。sampler/watchdog在线。只读监控持续。

### 13.47 13:00 北京时间：新模汇视频轮询约7分7秒后成功，无新增异常

任务`8ce324af-6430-47eb-8c5f-e49c9ae6ec73`（模汇`doubao-seedance-2-0`）于12:52:24提交，12:59:30成功，generation_log耗时426.532秒（7分06.532秒），持有上游task ID `task_6ExkFOklLvnfg1npAd1jCxwpvGZmIH2e`。本次属于长等待后成功，不新增失败类型；不能因7分钟时仍polling就提前报失败。

12:59:38心跳全局680 success、311 error、0 active；ready/worker健康，CPU0.5%、MemAvailable约5.83GiB、磁盘53.32%，容器无重启/OOM。最新失败告警仍为12:36:23的参考视频真人审核拒绝，无更晚错误；监控继续只读运行。


### 13.48 13:03 北京时间巡检：新视频最终成功，当前无新失败及在途任务

任务`8ce324af-6430-47eb-8c5f-e49c9ae6ec73`仍为最新任务，已于12:59:30成功；截至13:02:33没有12:59后的新task changes、失败告警或active任务。全局累计680 success、311 error。服务ready/worker健康，CPU采样26.57%（单次瞬时值，不据此判资源异常）、MemAvailable约5.83GiB、磁盘53.32%，容器无重启/OOM。watchdog后续复核保持sampler在线、issues为空。之前的模型参考视频兼容错误、真人/版权审核失败及Seedance长尾仍为待处理风险；本轮无新课堂样本，不能说明问题已解决。监控继续只读运行。

### 13.49 13:08 北京时间新失败：ModelBay Seedance 2上游预扣费额度不足（与平台积分不同）

任务 `d766a7b2-ffb4-47ba-a021-722981c580c4`（用户选`official/seedance-2`，ModelBay渠道）于13:04:31创建，13:07:34失败，任务总耗时183.296秒。平台确实发送上游POST；请求摘要包含`model=official/seedance-2`、`duration=13`。约921ms后上游直接返回HTTP403，原文：`预扣费额度失败, 用户剩余额度: ＄3.493316, 需要预扣费额度: ＄6.822492`。由于这段错误来自渠道upstream_response（不是平台本地预校验），可确认ModelBay/上游在提交生成前拒绝，给出的上游可用额度约$3.493316、该请求预扣需$6.822492，差额约$3.329176。

这不是学生的本平台积分不足证据，也不是模型参考视频能力错误；属于**渠道/上游余额不足或上游账户预扣规则**。需渠道侧充值/检查余额或核对13秒计价规则；平台侧应将该类HTTP403明确映射为“当前渠道额度不足，请联系管理员/切换模型”，避免与权限403混淆。该task是否曾在平台预扣积分/是否回滚，单看上游响应不能证明，需对照用户积分流水。

13:08附近全局累计680 success、312 error、2 active；另一笔模汇`doubao-seedance-2-0`任务仍持有上游task ID轮询中，不计终态。应用ready/worker健康、容器无重启/OOM，课堂监控只读继续。

13:08:56北京时间最终心跳校正：680 success、313 error、1 active（不是上文暂态读数的312 error/2 active）。新增失败共两笔落在本次观察间隔内；唯一在途为模汇Seedance视频 `e2bdaa07-b1e9-47cb-ab1f-7d327eb430be`，已polling266秒、持有上游task ID。其他服务健康指标不变。

### 13.50 13:10 北京时间新视频素材失败：输入参考视频被版权审核拒绝，连续两笔复现

课堂新捕获两笔模汇`doubao-seedance-2-0`视频任务，错误不是前一轮“生成输出视频疑似版权”的同一阶段：这两笔在已有上游task ID之后，错误明确为`素材转换失败: 素材处理失败([URL] The request failed because the input video may be related to copyright restrictions...)`，即**输入参考视频/素材URL在上游素材处理环节触发版权审核拒绝**。

| 平台任务 | 上游任务 | 资产审核request ID | 任务耗时 |
| --- | --- | --- | ---: |
| `8e8ba596-99c4-4f4c-9c2d-e9930911c821` | `task_ZAvpelHCCkGKGrMV5JEybq5QiM29ZoNF` | `202610221308127B53FDDE31F991FD77E6_asset-20261022130812-rjmmq` | 41.797秒 |
| `4b1ad697-2d2b-4dc4-87b6-8a72e2cff644` | `task_W3ixUDP3MgsP2tT1lh8suPrlM0rmBQ04` | `20261022130913485C095BC0749C1C16A6_asset-20261022130913-g5g6m` | 42.788秒 |

两笔原始错误都携带`[URL]`和独立asset request ID，平台task error相同；因此可确认不是平台没发请求或纯前端表现问题，而是已受理任务在处理输入视频素材时被上游内容/版权规则拒绝。不同于此前兔子对输入参考视频真人内容HTTP400、以及模汇对输出生成视频版权拒绝；三种拒绝环节要分开统计。现有诊断未保存具体视频帧或可识别版权命中依据，不能判断具体片段/作品或是否误判。应凭两个上游任务ID和asset request ID向模汇/上游核查命中片段、版权策略及这类素材审核是否计费，并查平台积分是否回滚。

截至13:10:06全局心跳为680 success、314 error、2 active；唯一在途模汇视频`e2bdaa07-b1e9-47cb-ab1f-7d327eb430be`（`doubao-seedance-2-0`）已polling约336秒并持有上游task ID；另一笔新视频随后提交，需继续跟踪终态。服务ready/worker健康，无容器重启/OOM；只读监控持续。

### 13.51 13:14 北京时间集中出现4类新视频素材/能力错误（6笔失败），需按链路阶段拆分

13:08:56之后连续捕获多笔真实课堂视频错误，失败并非单一原因。按任务事件与失败发生阶段归纳：

1. **兔子输入图片真人审核再次出现，且命中4个content索引**：任务`4d371383-8359-420a-bbfc-5022caa57528`，模型`doubao-seedance-2-0-260128`。上游请求已发送，HTTP400；request ID `202610220510007805222518268d9d6ySDJWHwj`，安全关联ID `02179264581634231531f02f4f0092e9c8b48ace140f1c726352f`，错误指向`content[1]`、`content[2]`、`content[3]`、`content[6]`可能包含真人。与此前图片真人拒绝同类，但命中索引数量扩大；平台没有记录参考图视觉内容，不能判定具体素材/误判。
2. **ModelBay官方Seedance资产库/素材校验失败**：任务`66c8480a-9634-40ae-acf0-1e47a2dc8597`，`official/seedance-2`，错误`asset failed library checks (format, size, or face consistency)`，耗时20.081秒。事件序列只到`submit_start`后`submit_exception`，没有`transport_request`或`upstream_request/response`，因此目前证据显示在可观察链路上游请求锚点之前失败，不能归称ModelBay HTTP返回；具体由ModelBay适配器本地素材库预检还是未记录的中间SDK阶段触发，还需代码/更细日志确认。也无法从合并错误判断是格式、尺寸还是人脸一致性。
3. **TokenHub两款参考视频模型均不接受当前R2V分辨率**：
   - `75b7c2e5-4a38-4b2c-a85e-d5f0802273ec`，`cdance2.0-fast-0807`，上游HTTP响应外层200，request ID `040f6ad99b0c0a7a280adf50521c0381`，错误正文明确resolution不适用于`doubao-seedance-2-0-fast in r2v`。
   - `214279ec-58ac-4922-8c33-559d7cd3c01b`，`cdance2.0-mini-0807`，上游HTTP响应外层200，request ID `040d6ad99b500a7ab864f72e0460d429`，错误正文明确resolution不适用于`doubao-seedance-2-0-mini in r2v`。
   这属于模型×能力模式(R2V)×resolution参数组合不兼容，不是HTTP网络失败。需给fast/mini分别配置允许分辨率，且在提交前按能力和所选模式校验；不能一律沿用标准模型的resolution。
4. **TokenHub两笔输入视频内容审核拒绝**：`cdance2.0-0807`任务`5814fa71-3256-40c0-adf6-0234b0650bee`和`61b6fe8c-a465-43fe-baa0-ec2992c5fd3e`，上游初始创建调用均HTTP200且取得上游task ID，之后素材处理状态为`AssetProcessingFailed InputVideoSensitiveContentDetected.PolicyViolation`，产品错误提示输入视频可能含敏感内容。资源ID分别`as_01M5H0AJV5WT4AH5RJKPT2RSQV`、`as_01M5H0BZ4C2QZ733ZBMRVQRD07`。这不是模型能力/resolution问题，而是成功建任务后的异步输入素材审查；还需渠道解释具体命中内容及收费/退款。

以上6笔均已计入新增终态错误；此前13.50的两笔输入视频版权审核和本节新样本分开保留。13:13:00心跳为681 success、320 error、1 active；到13:13:35更新为682 success、320 error、0 active（期间又有1笔视频成功），ready/worker健康，无容器重启/OOM。该窗口未用主动生成复测，结论来自课堂实际请求与服务端任务日志。监控继续只读。

### 13.52 13:15 北京时间后续检查：最新图片任务成功，视频失败集群之后暂无新增错误

任务`c33ae08f-08fb-41fb-83d3-c9b10d9e60bf`（`gpt-image-2.5-sunburst`，canvas）最终success。此前13:12–13:13集中出现的参考视频审核拒绝、模型分辨率不兼容等任务均已计入全局失败。13:13之后未观察到新的失败任务或告警；13:15:20全局为682 success、320 error、0 active。App/worker健康、CPU约1.51%、MemAvailable约5.84GiB、磁盘53.32%，容器无重启/OOM。Sampler/watchdog在线。本次无新增失败样本，之前发现的能力矩阵与上游策略问题仍需单独修复，不能将一笔图片成功视为解决。

### 13.54 13:19 北京时间新增两笔失败：ModelBay资产库校验再次失败；兔子输入图真人审核再现

13:16–13:18又发生两笔课堂视频终态失败，分别属于不同链路：

1. **ModelBay `official/seedance-2`资产库检查重复失败**：`8f856fec-9d23-4308-85f4-36a105e2e875`，13:16:33创建、约31.157秒后失败，错误再次是`asset failed library checks (format, size, or face consistency)`。与13.11任务`66c8480a-9634-40ae-acf0-1e47a2dc8597`相同。两笔都只有ModelBay provider `submit_start`，随后`submit_exception`，没有可见`transport_request`/`upstream_request`/HTTP响应，也没有上游task ID。可重复确认失败发生在当前可观测的外呼锚点之前；究竟是ModelBay SDK本地素材库校验还是漏记的子调用仍不确定。当前统一错误合并了format/size/face consistency三种可能，无法指导用户修哪项；需要分项校验日志或让上游回传具体asset字段。
2. **兔子多参考图真人审核再次出现，命中5个content位置**：`847704e1-eceb-4593-8a58-e06ed632700a`，`doubao-seedance-2-0-260128`。请求真实到达兔子，37.671秒后HTTP400；上游request ID `202610220517268038117368268d9d66XjcEHy6`，安全关联ID`021792646265537cd2cfaf2275915feb63370f28ffb18cb2abdb7`。错误点名`content[1]`、`[2]`、`[3]`、`[5]`、`[6]`可能含真人。这与此前兔子输入图真人审核一致，但一次请求已涉及5个图像content索引；平台未留存图像内容，不能识别具体图片或判断误判。

截至13:18:15生产全局682 success、322 error、1 active；另一笔模汇Seedance视频polling约66秒且有上游task ID。ready/worker健康，CPU1%、MemAvailable约5.82GiB、磁盘53.33%，容器无重启/OOM。新错误继续按上游审核、ModelBay素材检查分开，不并为统一“视频生成失败”。

### 13.55 13:22 北京时间更新：未见新失败告警；新图像提交与视频轮询继续观察

截至13:21:44，13:18后无新增失败/告警；全局累计682 success、322 error、3 active。新增在途包括`gpt-image-2-all`任务`af246261-9d66-4876-9864-b337fdceef50`提交约178秒仍未获得上游task ID；视频`doubao-seedance-2-0`任务`82394923-1d6b-4bc4-bbdb-7928fbfb1be1`轮询约275秒且有task ID；另一笔同模型视频`0209109a-23fd-400b-98d6-239fa37f5f8a`轮询24秒。均未终态，不计成功/失败。服务器ready/worker健康、CPU11.53%、MemAvailable约5.81GiB、磁盘53.34%，容器无重启/OOM。监控保持只读。

### 13.56 13:25 北京时间新图片链路问题：首选渠道504，fallback内部绑定403覆盖原始故障

课堂图片任务`af246261-9d66-4876-9864-b337fdceef50`，用户选择`gpt-image-2-all`，含3张参考图（约1.75MB PNG、1.62MB PNG、0.42MB JPEG），请求`size=1824x1024`、`response_format=b64_json`、`output_format=png`。总耗时301.050秒后失败，链路分两段：

1. 首选模汇实际收到POST。约300.198秒后返回HTTP504 `text/html`，正文为nginx `504 Gateway Time-out`；平台确认首attempt未获得可用图片结果。该POST可能已被上游处理/计费，也可能未处理，仅凭504不能判断，需按上游渠道日志/扣费流水和平台积分流水核对。
2. 自动fallback到ModelBay，平台试图路由实际模型`gpt-image-2-5-sunburst`，44ms后内部403“该上游模型未绑定可用逻辑模型”。该fallback只有`transport_request/transport_response`，没有`upstream_request/response`，说明没有真正到达ModelBay。
3. 最终task顶层报“图片生成失败，状态码403”，把第2段内部配置错误覆盖了第1段5分钟上游网关超时。用户看不到主故障发生在模汇504，也不知道fallback根本未发出。

这是新的**多渠道fallback错误归因/首错丢失**问题，不能只归类为403。应保留attempt级首错和全部渠道链路，在最终错误摘要中说明“首选渠道504，备用渠道未绑定，备用请求未发送”；上游request ID在此5xx记录中缺失，需渠道侧凭任务创建时间/模型/请求体摘要进一步查。不得自动重放该首attempt以免可能重复扣费。

截至13:24:39生产全局683 success、323 error、4 active；当前3笔视频（模汇`doubao-seedance-2-0`）仍轮询且持有上游task ID，另有1笔`gpt-image-2-all`图片在提交阶段47秒。ready/worker健康、CPU2.25%、MemAvailable约5.75GiB、磁盘53.34%，无容器重启/OOM。监控继续只读。

### 13.57 13:31 北京时间：课堂新增两笔链路失败，均已拿到上游证据

截至 **2026-10-22 13:31:03（北京时间）**，从13:24:39的683成功/323失败/4在途，变化为**684成功/325失败/4在途**。增加的两笔失败均来自课堂真实任务，不是我额外发起的付费测试；另有一笔此前在途的模汇视频于13:28:42成功。新问题不是仅凭前端现象判断，服务端任务事件包含了对应渠道及上游响应：

1. **兔子视频输入参考图触发真人审核拒绝**：任务`09d6d0a7-3973-4378-9e6f-3895b4a176c0`，模型`doubao-seedance-2-0-260128`，13:27:22创建，27.381秒后失败。服务端记录已向兔子渠道发出POST；上游HTTP **400**、JSON响应248字节，响应耗时约21.007秒；明确指出`content[1]`、`content[2]`可能包含真人。上游request ID：`202610220527292877572078268d9d6e7NS8OB5`；策略关联ID：`021792646858930c2531bd3ff98f8d456851518a83e67295a7bd2`。**已证实根因是兔子上游安全策略拒绝输入参考图**，不是平台未发请求；平台没有保存/暴露这两个content对应的原图，不能判断是误判或指出具体哪张图，也不应据此自动重试相同素材。

2. **图片主渠道504后，自动fallback再次被模型绑定拒绝**：任务`4f390879-a8e8-4fd7-b024-0ab9028468a2`，用户选择`gpt-image-2-all`，带3张参考图，13:23:52创建，13:28:53失败，总耗时约300.719秒。首选渠道**模汇X中漫 API**实际收到POST（尺寸`1824x1024`、`n=1`、`b64_json`；参考图约1.75MB PNG、1.62MB PNG、0.42MB JPEG），约300.043秒后返回HTTP **504** `text/html`，正文为nginx `504 Gateway Time-out`。随后平台fallback到**兔子 API**的`gpt-image-2.5-sunburst`，请求参数为`quality=low`并带同三张参考图；兔子接口162ms后返回HTTP **403**，业务信息为“该上游模型未绑定可用逻辑模型”，之后任务终态错误。第二attempt有`transport_request/response`，但没有`upstream_request`事件和上游任务ID，因此只能确认兔子API入口返回403，**没有证据表明请求到达兔子实际模型服务**。最终任务错误只暴露“自定义图片接口调用失败403”，再次掩盖首选渠道504；应保留并展示逐attempt结果（首选模汇504、备用兔子绑定403），并对504标注上游是否已处理/计费未知。该任务积分退款及模汇侧计费未由本轮采样证明，勿盲目重发，需对照积分流水和模汇请求日志。

3. **同一时段有长视频正常完成，避免误判**：模汇`doubao-seedance-2-0`任务`38f6fd10-094e-40ba-9a98-f38811d5abd1`于13:22:27创建，13:28:42成功，耗时374.926秒，说明长轮询本身不等于失败。另有2笔模汇`doubao-seedance-2-0`视频继续轮询且具有上游task ID、1笔ModelBay `official/seedance-2`视频已取得上游task ID并处于polling，以及1笔`gpt-image-2-all`图片提交仍在途；按task ID计数，不把attempt数重复算成用户任务数。

**资源与服务旁证（13:31:03采样）**：生产目标主机与域名校验通过；App ready、Postgres和generation worker健康。宿主CPU约0.5%，可用内存约5.79GiB，磁盘已用53.35%；App/Worker/Postgres容器均无重启或OOM。采样日志窗口未见新的平台异常日志信号；这不推翻任务级上游HTTP证据。watchdog采样延迟约9秒、`issues=[]`，监控在线且只读。

**处理建议（未执行任何生产改动）**：兔子真人拒绝应作为明确、可操作的上游审核失败反馈给用户，并确认素材是否为真人/是否有上游白名单或能力限制，不做自动重放；图片任务应修复逐attempt错误归并与模型绑定配置，先确认兔子实际模型绑定及`quality=low`是否预期，再按请求时间核实模汇504后的上游任务/扣费状态。下一轮持续跟踪3笔视频、图像新提交及新告警；在确认潜在重复计费前不重发。

### 13.58 13:33 北京时间跟进：同画布、同规格图片再次成功，504更像间歇性上游超时；视频仍在途

图片任务`c32d1755-3a71-40d1-9bee-34bfe7569f4c`于13:30:20提交，13:33:00成功，总耗时160.133秒。它与13.57失败任务同为`gpt-image-2-all`、同一画布项目`canvas-5QmyNt1tSGz8l0lUgH34M`、同一首选模汇X中漫渠道，服务端记录的参数/三张参考图文件大小与格式相同；此次模汇实际收到请求并返回HTTP 200，耗时159.596秒，上游request ID `0dfb1f79-d3b3-4ed9-9c6e-feec1a0d84ae`。这构成**相同链路随后成功**的直接对照：不支持把上一笔504归因于必然的图片格式/模型配置错误，更符合模汇侧或其前置网关间歇性长耗时/超时；但无法仅凭这两笔判定实际瓶颈在模型排队、推理还是代理网关。上一笔504的上游计费与平台退款仍需另核。

截至13:33:23累计**685成功、325失败、3在途**。在途为2笔模汇`doubao-seedance-2-0`视频（分别约16分14秒、12分03秒，均持有上游task ID）及1笔ModelBay `official/seedance-2`视频（约2分57秒，已收到上游task ID `task_eAgkBkHjrAG9pSLxqU9BAVquszseeQYG`，仍polling）；没有新的错误终态。服务ready、worker健康，CPU约1%、可用内存约5.75GiB、磁盘53.35%，容器无重启/OOM；watchdog仍在线、无issues。继续按task ID只读跟踪，不将仍有上游task ID的polling任务提前判失败。


### 13.59 13:34 北京时间：一笔近17分钟模汇视频成功，剩余两笔视频继续轮询

长视频任务`82394923-1d6b-4bc4-bbdb-7928fbfb1be3`（模汇`doubao-seedance-2-0`）13:17:09创建，13:33:44成功，耗时994.794秒（16分34.794秒），上游task ID `task_wQWK2BXVrbWBU5bXhiXu6V28Hf1KsZKP`。再次证明有有效上游task ID且持续polling的长视频不能按几分钟超时直接判失败。

截至13:34:33全局**686成功、325失败、2在途**；仍在途的是模汇视频`0209109a-23fd-400b-98d6-239fa37f5f8a`（13:21:20提交，约13分13秒，持有上游task ID `task_Kk3EWsIzANXk0K6SvCMqUDykGEhbshNA`）及ModelBay `official/seedance-2`视频`f1cb54cc-4a9c-41bc-88f9-e13f0b50502f`（13:30:26提交，约4分07秒，持有task ID `task_eAgkBkHjrAG9pSLxqU9BAVquszseeQYG`）。图片任务`c32d1755-3a71-40d1-9bee-34bfe7569f4c`已成功，不再在途。App/worker健康，CPU约0%、可用内存约5.81GiB、磁盘53.35%，无容器重启/OOM，watchdog在线且issues为空。持续只读监控。

### 13.60 13:36 北京时间：ModelBay视频轮询后成功，目前仅剩一笔模汇长视频在途

ModelBay `official/seedance-2`视频任务`f1cb54cc-4a9c-41bc-88f9-e13f0b50502f`于13:30:26创建，13:35:10成功，总耗时284.067秒（4分44.067秒），上游task ID `task_eAgkBkHjrAG9pSLxqU9BAVquszseeQYG`。未见失败事件。

截至13:36:17生产全局累计**687成功、325失败、1在途**。唯一在途为模汇`doubao-seedance-2-0`任务`0209109a-23fd-400b-98d6-239fa37f5f8a`，13:21:20创建、当前约14分57秒，仍持有上游task ID `task_Kk3EWsIzANXk0K6SvCMqUDykGEhbshNA`并处于polling；没有新失败告警。watchdog sampler在线、采样延迟约13秒、issues为空；持续监控该任务是否终态。

### 13.61 13:39 北京时间巡检：新的图片请求已到达模汇，168秒仍等待响应，尚未终态

新图片任务`9473bd51-998e-42af-97f3-98e2aab6b62b`于13:36:24创建，用户选择`gpt-image-2-all`，同一画布项目`canvas-5QmyNt1tSGz8l0lUgH34M`，截至13:39:12仍为`submitting`约168秒、未获得终态和上游request ID。关键是事件已经同时记录`transport_request`与`upstream_request`，因此请求**已发到模汇X中漫渠道**；请求使用`1824x1024`、`n=1`、`b64_json`，无参考图片附件，日志只记录prompt hash、不保存提示词正文。当前尚无`upstream_response`，故只能报告“上游响应等待中”，不能推断失败或是否计费。这是第13.57节所见300秒504之后的另一笔真实课堂样本，正在继续观察是否会再次触发超时。

截至13:39:12全局累计687成功、325失败、3在途。除上述图片外，另有模汇`doubao-seedance-2-0`视频`0209109a-23fd-400b-98d6-239fa37f5f8a`（约17分52秒、上游task ID `task_Kk3EWsIzANXk0K6SvCMqUDykGEhbshNA`）和`743ecbc0-31ed-40a1-8c86-c4a7eca8b7b2`（约2分03秒、task ID `task_BIFlFRYY60LjrOZfB5nUTpxhIP0kbknN`）仍在polling；均有上游task ID，不判失败。服务/worker健康，watchdog采样在线。继续只读跟踪这三个任务及新告警。


### 13.62 13:43 北京时间新故障：图片上游200后平台栈溢出再次复现；另有版权审核与ModelBay素材门禁失败

13:39–13:43新出现5笔失败（2图、3视频），不能归并成一个“生成失败”：

1. **图片：上游成功响应后平台再次栈溢出，自动fallback错误覆盖主故障。**任务`9473bd51-998e-42af-97f3-98e2aab6b62b`（13:36:24创建，13:39:46结束）和`00e16ac7-36c2-4a6a-a835-4fbd04242ca5`（13:40:01创建，13:42:58结束）都选`gpt-image-2-all`、同一prompt hash `df782fc4974d1fbce3ddf6cb30f1390021bb28c443f01c90968a88f731d47568`、走模汇X中漫。两笔上游POST均获得HTTP **200**，随后响应正文完整读完（分别 **6,752,427 bytes**、**4,284,936 bytes**），平台紧接着记录`provider_exception: Maximum call stack size exceeded`。上游request ID分别为`de4f46e3-b554-4253-8b57-ce02f511181b`和`f530421c-fe83-4d12-b96f-2623f7a82eb2`。因此已确认图像并非上游生成失败，而是在收到成功响应之后的平台本地处理阶段失败；此异常在生产再次出现，不能声称已修复。历史已有至少4笔同类样本，堆栈帧仍未被日志捕获，具体函数尚未定位。

   两笔随后分别fallback到ModelBay `gpt-image-2-image-to-image`与兔子`gpt-image-2`，但均在约8–14ms得到403“该上游模型未绑定可用逻辑模型”；只有`transport_request/response`、没有`upstream_request`，所以fallback并未到达相应模型上游。最终前端错误变成403，遮蔽了模汇HTTP200后的本地栈溢出。对比同prompt近期任务`c32d1755-3a71-40d1-9bee-34bfe7569f4c`：模汇HTTP200、响应正文3,014,557 bytes后成功。当前样本提示响应体大小或响应形状可能与触发路径相关，但大小阈值并未被证明；不能仅据这些相关性断言大于某字节就必然失败。上游已返回生成结果，是否计费及平台积分是否退款尚未核对；禁止盲目重放。

2. **视频：模汇Seedance输入视频版权/素材处理拒绝。**任务`48e395c6-0386-4ab9-845c-eeefb80fb128`（13:39:49创建，13:40:40失败），上游task ID `task_WM0DakCcGL0vRTWRJzhMFum0aeoGQrfs`已存在，随后轮询取得最终619-byte JSON并结束；错误为输入视频可能涉及版权限制，关联request ID `20261022133950D2152D176E2D7626D5BF_asset-20261022133950-x7qhp`。这属于上游异步素材处理/版权审查拒绝，不是平台没有提交视频任务。素材未留存于监控证据，无法独立判断版权命中是否正确。

3. **视频：ModelBay Seedance资产库预检查重复拒绝。**任务`0db27935-17db-4245-905f-703f795f7fdb`（`official/seedance-2`，13:42:01创建）和`fbf72dc6-08cf-4b8d-b5e6-61390699498d`（`official/seedance-2-5`，13:42:55创建）分别约32秒、37秒后报`asset failed library checks (format, size, or face consistency)`。两条事件都只有`submit_start → submit_exception → failed`，没有可见`transport_request`、`upstream_request/response`或上游task ID。结论只能是失败发生在当前可观测外呼事件之前；具体是本地SDK资产库检查还是未记录的内部子调用仍不能确认，通用报错也不能区分格式、尺寸或人脸一致性条件。它是此前同类门禁问题的新增复现。

截至**13:43:51**生产全局为**687成功、330失败、3在途**；在途均为模汇Seedance视频任务`743ecbc0-31ed-40a1-8c86-c4a7eca8b7b2`、`b5ecce7a-0e27-46ef-99cf-1af83a3cc896`、`694b3e23-68d0-4296-a886-643039e08fea`，都持有上游task ID并处于polling。App/worker ready，CPU约7.27%、可用内存约5.70GiB、磁盘53.37%，无容器重启/OOM；watchdog在线、issues为空。仍只读监控，没有重试或生产变更。

**建议的修复/验证重点**：对图片路径在provider异常捕获处记录受限长度的JS stack frames和处理阶段标记（响应读取、JSON解析、base64解码、日志脱敏/序列化、结果持久化），对上游已200的响应禁止作为普通失败自动转到另一个付费模型，除非具备幂等/结果恢复机制；attempt级错误要同时保留“主渠道HTTP200后平台栈溢出”和“fallback绑定403”。ModelBay要把资产预检拆成可操作的具体原因并记录是否真的对外调用。版权拒绝应向用户明确提示素材替换，而不是让其盲目重试相同视频。

### 13.63 13:51 北京时间：同一图片栈溢出再复现2次；兔子视频504与ModelBay资产门禁也新增失败

在13.62记录的5笔新失败之后，13:43:30–13:49又增加4笔错误终态：

1. **两笔跨渠道图片都由上游HTTP200转为平台栈溢出。**
   - `d0f1810f-9a7a-44dd-bca2-750a2347eaaa`：用户选`gpt-image-2`，13:44:50创建；兔子`gpt-image-2`上游HTTP200，耗时49.266秒，正文 **4,207,945 bytes**，request ID `202610220544519148654978268d9d6EgaOVmd2`。正文读完后平台`Maximum call stack size exceeded`；fallback到模汇X中漫`gpt-image-2-all`，9ms后403“该上游模型未绑定可用逻辑模型”，没有`upstream_request`。
   - `ccf663d1-c7bd-4b30-8bc2-1029c6a88894`：用户选`gpt-image-2`，13:45:58创建；兔子上游HTTP200，耗时100.083秒，正文 **4,713,109 bytes**，request ID `202610220545597189781938268d9d6GjDEhWRM`。随后同样平台栈溢出；fallback到ModelBay `gpt-image-2-5-flare`，12ms后绑定403，没有`upstream_request`。

   这使13:36–13:47同一prompt hash图片的栈溢出增至**4次**，发生在模汇X中漫或兔子的上游HTTP 200之后，响应体约4.2–6.75MB；各次fallback又落到未绑定模型的渠道，导致用户只看到403。证据把共同故障段定位在**平台收到大JSON/base64图片成功响应后的本地处理**，且跨渠道复现；但没有堆栈帧，具体函数还未定位。已直接只读检查生产App与generation-worker最近20分钟Docker日志，`Maximum call stack`/`RangeError`匹配均为0行、任务ID关联行0条、堆栈帧0条；数据库诊断事件只有错误文本，因此服务器当前没有可用的调用栈证据。之前的3.01MB成功响应说明不能据此设置简单字节阈值。上游已返回200而平台丢失结果时可能产生费用，相关扣费/退款未核实；不要自动重放。

2. **兔子Seedance视频生成提交遇到真实上游504。**任务`648562fd-c14f-4576-bb43-fd9b4ab8114c`，`doubao-seedance-2-5-260628`，13:45:05创建；平台发出POST后兔子约91.900秒返回HTTP **504** JSON `model retry timeout exhausted`，request ID `202610220545068727691838268d9d6ncbP7ZqZ`；无上游task ID，任务以“生成接口响应超时”失败。已证实这是兔子接口提交超时，不是任务已经进入异步轮询后慢；是否在兔子内部创建/计费未知。

3. **ModelBay `official/seedance-2`资产库检查再失败一笔。**任务`fd2fba69-a397-49c7-ad05-807e3ae06c6c`，13:43:56创建，37秒后`asset failed library checks (format, size, or face consistency)`。链路只有`submit_start → submit_exception`，没有可见transport/upstream请求或上游task ID；具体检查项及是否存在SDK内部未记账子调用仍未知。连同13.62的两笔，这一generic asset-check错误在约2分钟内连续出现3次。

截至**13:51:25**全局累计**692成功、334失败、2在途**。在途为模汇Seedance视频`b5ecce7a-0e27-46ef-99cf-1af83a3cc896`（约11分57秒、持有上游task ID `task_iMvnDJcV9PHN4D5wsDo0hxDd0N5CzRBO`）和图片任务`8c73034a-b3be-4155-88da-bfb94cd71bd2`（刚提交，尚无上游task ID）；均未判终态。App/worker健康，CPU约1.51%、可用内存约5.79GiB、磁盘53.37%，容器未重启/OOM，watchdog在线且issues为空。仍未向生产额外发送测试请求或改配置。

**测试缺口及建议**：当前失败是在真实课堂流量中抓到的，之前的预检确实未覆盖“不同图片渠道HTTP200 + 多MB JSON/Base64 + 本地归一化失败 + fallback绑定403”这条完整路径。代码修复前，应在测试环境用脱敏/合成的4–7MB图片响应fixture覆盖HTTP200响应解析、输出归一化和失败fallback；同时在provider catch中保存安全的有限长度stack frames与处理阶段标记。还要确保拿到上游200后不把“结果处理失败”当作普通上游失败去调用另一收费渠道；ModelBay要补足素材检查的分项原因和外呼阶段日志。生产课堂期间不做主动重试或配置更改。

### 13.64 13:56 北京时间：今天图片“上游200后栈溢出”再复现一次，现累计5笔；两张兔子2.5图片成功

图片任务`8c73034a-b3be-4155-88da-bfb94cd71bd2`于13:51:09创建，用户选`gpt-image-2-c`，1张JPEG参考图（419,717 bytes）。模汇X中漫实际收到POST，约290.907秒后返回HTTP **200**，request ID `c6454b54-e08e-4fc1-8806-3237d352b747`；正文读取完毕 **6,315,249 bytes** 后平台再次报`Maximum call stack size exceeded`。随后fallback到兔子`gpt-image-2`，12ms后因“该上游模型未绑定可用逻辑模型”返回403、无`upstream_request`。任务13:56:01终态失败。该事件让本次课堂13:36–13:56相同prompt hash的图片栈溢出样本达到**5笔**，覆盖模汇/兔子首渠道，响应体约4.2–6.75MB；根因边界仍在上游200后的平台本地响应处理，具体函数/栈帧依然缺失。已再次只读检查生产App/worker近20分钟Docker日志，overflow与RangeError关键词共0行，未拿到stack trace；所以监控能明确指出故障段，但目前生产日志不足以指出具体调用函数。相同prompt下模汇一笔3,014,557-byte响应成功；容量阈值不能视为已证实。

另有两张兔子`gpt-image-2.5-sunburst`图片任务`af8f5f65-733c-4446-b6b7-477127aef2c3`和`84839a16-7c9c-4860-bb10-abe36cf2d07f`分别于13:48:43、13:48:44创建，13:49:22、13:49:32成功，均取得上游task ID。这说明当天课堂有实际成功样本，不能概括成所有生图模型都不可用。另有兔子Seedance任务`648562fd-c14f-4576-bb43-fd9b4ab8114c`以HTTP504失败，以及ModelBay素材库预检查失败仍按13.63节记载。

截至**13:56:03**全局累计**693成功、335失败、2在途**：1笔模汇Seedance视频`9b5920d1-fbca-4615-8c58-0f607dcda79a`（约2分07秒，持有上游task ID `task_CbFtlMiTFNIkRKc5p7a7Q4SXd8pIbmZD`）和1笔新提交的视频`14e62e32-10b0-4286-b126-871f1911007e`（约10秒，已有上游task ID `task_9IZvV1cAV67aL2hVcxcJtSaSYGsmma7L`）。App/worker健康，CPU约1.26%、可用内存约5.75GiB、磁盘53.37%，容器无重启/OOM，watchdog在线且issues为空；课堂期间只读，无重发和配置修改。

### 13.65 14:00 北京时间：课堂图片栈溢出样本达到6笔，视频输入素材处理问题并存

截至14:00前，新的图片请求`034588d8-f145-4c44-80de-84211dca60d6`仍在模汇`gpt-image-2-c`的`submitting`阶段、尚未取得上游request ID或响应，暂记在途，不预判失败。更早的图片`8c73034a-b3be-4155-88da-bfb94cd71bd2`已在13:56:01失败；连同13.62–13.64记录的5笔，今天同一prompt hash、选择GPT Image系列、模汇/兔子上游200后平台栈溢出，累计**6笔**；失败后自动fallback仍遇逻辑模型未绑定403。堆栈帧仍缺，生产当前没有能精确指向异常函数的日志。新观察不等于重复测试，均为课堂自然流量。

另，模汇Seedance输入视频版权拒绝`48e395c6-0386-4ab9-845c-eeefb80fb128`上游异步任务曾先成功创建、持有上游task ID，约51秒后在素材处理阶段因“input video may be related to copyright restrictions”失败；这进一步说明需区别“提交成功”与“素材预处理最终成功”。兔子`gpt-image-2.5-sunburst`近期已有2笔图像成功作为正向样本。课堂实时统计截至14:00左右为**693成功、335失败**，其余任务继续在途；本次增量内另有模型/渠道请求正在进行，待终态后按ID更新，不把活跃项并入成功率。

### 13.66 14:17 北京时间：核对到任务终态、积分和画布快照；图片重复栈溢出达8笔，另有ModelBay参数不兼容4笔

本节把前面捕获的失败继续对到生产 PostgreSQL 中的`generation_tasks`、`generation_logs`、`point_records`和画布项目JSON，不把“上游HTTP 200”误报为学生生成成功。

#### A. GPT Image响应后处理栈溢出：8/8最终是平台任务失败

从13:36至14:11，发现**8笔**GPT Image课堂图片任务在首渠道已经HTTP 200后发生平台`Maximum call stack size exceeded`；所有这8笔的生成任务最终状态均为`error`，`generation_logs`均为`failed`、`fail_count=1`、`success_count=0`，且数据库`result_payload`为空。因此服务端没有把任何可下载图片作为成功结果持久化；用户所选attempt的上游HTTP 200不等于平台任务成功。8笔ID如下：

`9473bd51-998e-42af-97f3-98e2aab6b62b`、`00e16ac7-36c2-4a6a-a835-4fbd04242ca5`、`d0f1810f-9a7a-44dd-bca2-750a2347eaaa`、`ccf663d1-c7bd-4b30-8bc2-1029c6a88894`、`8c73034a-b3be-4155-88da-bfb94cd71bd2`、`034588d8-f145-4c44-80de-84211dca60d6`、`fc1f3d4e-93c1-4f3c-8635-d8d168365438`、`c017760c-6ae2-4c2f-b5f7-1e22f2a1698a`。

最新复现为`c017760c-6ae2-4c2f-b5f7-1e22f2a1698a`：用户选`gpt-image-2-c`，模汇实际HTTP 200，299.260秒返回响应头，最终完整读取 **6,665,998 bytes**，request ID `0a2261c8-4f1b-4b73-baea-df9e5bf4bc9d`；随后平台抛`Maximum call stack size exceeded`。fallback到兔子后82ms即以“该上游模型未绑定可用逻辑模型”403结束，没有第二次上游请求。生产App/Worker容器近20分钟日志再次没有匹配到stack overflow/RangeError日志行或stack frame；因此证据已稳定定位**成功响应之后的平台处理路径**，但具体函数尚无堆栈证据，不能声称已经修复或已查明某个具体递归函数。

**积分核对**：前7笔可由point ledger中的任务ID幂等键直接关联到各自1积分refund。第8笔`c017...`也有1积分refund（06:11:30.174），同一generation log失败时间06:11:32；其refund键直接含任务ID。故这8笔平台积分均已退回。此证据只证明平台侧退积分；模汇/兔子是否对HTTP 200上游请求收费仍未知，不能混为一谈。

**画布持久化核对**：失败任务的generation log是failed且`result_payload`为空；在相应项目的服务器端画布JSON里，没有找到这8个失败task ID对应的`generationPendingTaskId`节点关联。正向对照任务`c32d1755-3a71-40d1-9bee-34bfe7569f4c`在画布JSON中能对应到节点`image-Mq2DbNpszcCwHVtbyEUFG`，节点status=`success`，并有content、serverUrl、storageKey。这个对照说明“后端结果成功”会落到持久化节点；但对于上述失败任务，数据库只证明后端没有持久化生成成功结果，**不能单凭数据库还原学生浏览器当时是否显示错误弹窗、loading或残留的本地临时图**。监控证据没有保存当时学生浏览器DOM/截图，所以学生端具体视觉状态仍需实际浏览器观察确认，不能替他们猜测。

#### B. 新增ModelBay图像模型参数兼容错误：4笔上游HTTP 400

另发现四笔`gpt-image-2-5-sunburst`任务被实际发送至ModelBay，且同一参数`response_format=b64_json`被ModelBay上游拒绝为HTTP **400 `Unknown parameter: 'response_format'.`**。分别为`90f637bb-4fbd-4639-9ede-bcd25e250293`、`636eac5b-13cf-4fde-b8b7-f4b04e0d9661`、`13429c96-bb1d-4bce-906d-712028b9f78e`、`2f146dd2-1fd2-4a18-8b3b-4d97a263f25b`；上游耗时约20.5–28.5秒，错误体139 bytes。与前述fallback内部403不同：这4笔有真实`upstream_request`及上游HTTP 400，根因类别是**ModelBay模型接口参数契约/请求适配不兼容**，不是未绑定模型，也不是平台没有转发。四笔最终generation log均failed、fail_count=1、success_count=0。积分表在对应用户、模型和失败时间附近有四笔各1积分的consume/refund成对记录（refund使用system-ai哈希幂等键、未直接写task ID，按时间/用户/模型相关联；上游是否计费未知）。建议ModelBay适配器对此模型不发送其不接受的`response_format`，并由测试环境真实请求验证响应格式，而非全渠道统一删除该参数。

截至**2026-10-22 14:17:36（北京时间）**，生产全局累计**706成功、342失败、1在途**（累计窗口从此前监控设定的2026-10-21 14:30开始，不等同本节新增样本成功率）。唯一在途为模汇`doubao-seedance-2-0`任务`08ea0361-ec23-47ba-ad16-a3a647e2bde2`，约9分17秒，仍有上游task ID `task_lVewVaI133DrCrGY5MsSor4uV2jY5NtY`并在polling，不能判失败。生产App与worker健康、CPU约1.25%、可用内存约5.79GiB、磁盘53.40%，容器无重启/OOM；监控采样在线且无watchdog issue。所有调查均为只读；未提交付费测试请求、未改生产数据/配置。

**当前行动重点**：将“响应后栈溢出 + 自动fallback到未绑定模型”列为主要阻断；首要补齐异常stack frames/阶段日志，并防止上游已200的结果处理异常被当成普通上游失败而继续打另一条收费渠道。并行修ModelBay `response_format`契约问题。不要把当日成功的兔子2.5图像、长视频成功或平台退积分误当作以上失败链路已修复；生产课堂继续只读监控。

### 13.67 14:20 北京时间巡检：无新增失败，模汇长视频成功，另一笔TokenHub视频继续轮询

截至14:19:56，13.66之后没有新失败终态；全局累计更新为**707成功、342失败、1在途**。此前模汇`doubao-seedance-2-0`视频`08ea0361-ec23-47ba-ad16-a3a647e2bde2`已从在途列表消失并计入成功（其上游task ID为`task_lVewVaI133DrCrGY5MsSor4uV2jY5NtY`）；当前唯一在途为TokenHub `cdance2.0-0807`视频`4e99d808-7ac6-4ebe-b540-955c0da526a9`，约25秒，已持有上游task ID `task_BEpuqjLcK9OeMhALAaAlefJu5RRe0ODH`，继续等待终态。App/worker健康，watchdog在线、issues为空。13.66记录的8笔图片栈溢出和4笔ModelBay参数拒绝依然是今天已证实的问题；本巡检未发生代码或生产配置变更。

### 13.68 14:31 北京时间：GPT Image同渠道出现一笔真正端到端成功；ModelBay参数400及TokenHub R2V分辨率错误再次复现

14:26–14:31新增情况需分别看待：

1. **GPT Image正向对照已在任务、结果和画布三层确认成功。**任务`866f51f9-e7de-45ca-80b3-ac0e3c528ec7`（模型`gpt-image-2-c`）13:22:09创建，13:26:15成功，总耗时245.607秒；模汇上游HTTP200、request ID `aec1476e-b646-43c1-8d09-df849ba868a2`，完整响应正文 **4,089,826 bytes**。generation log为success、success_count=1、fail_count=0，result_payload含`url`；画布项目`canvas-5KXz2zfdC2PS0VVTCdxzb`中节点`image-39lEZgEvX2AaRqocHXNO9`按该task ID关联，节点status=`success`，有content、serverUrl、storageKey。它证明平台不只是收到HTTP200，而是完成解析、结果保存和节点回写。与8笔4.2–6.75MB栈溢出对比，较小响应成功；这提示但不证明响应体/形状与故障概率有关，不能据此定单一字节阈值。平台无法保存此前失败任务的生成图，学生是否曾看到临时客户端状态仍未由历史DOM证据确认。

2. **ModelBay `gpt-image-2-5-sunburst`同一参数错误又2次。**任务`d5d2290d-b86d-45c1-8fa0-7d9c137c9723`（13:29:51创建）和`4d0850b0-e88f-4830-8043-4995f5d40536`（13:30:29创建）都实际POST到ModelBay；HTTP400 `Unknown parameter: 'response_format'.`，各约24–25秒，错误体139 bytes。输入含4张PNG参考图；平台出站参数仍含`response_format=b64_json`。这使13.66记录的ModelBay同模型参数不兼容从4笔增至**6笔**，明确为上游请求契约拒绝。两次平台生成日志failed、没有图像结果；积分表在对应用户/模型/失败时间有两笔1积分退款，退款键是`system-ai`哈希，不带task ID，按时间与请求关联，精确task外键缺失。上游未建异步任务，渠道是否对400请求另计费未知。

3. **TokenHub `cdance2.0-fast-0807`的R2V分辨率不兼容再出现2次。**任务`150e8efc-fcad-4569-b864-009a699aaef5`和`a688d0ad-fd61-4f09-aa97-6cf3f3208ddb`均视频输入模式R2V。平台POST后TokenHub外层HTTP200并返回上游task ID；随后异步状态JSON（最终427 bytes）报`the parameter resolution specified in the request is not valid for model doubao-seedance-2-0-fast in r2v`，平台翻译为“当前模型不支持所选分辨率”。两任务分别6.189秒和1.597秒失败，均有逐task 1积分退款记录。现有事件只保留`model`和`duration`参数，没有记录实际发送的resolution值，故能够证实模型/模式不支持所选分辨率，**但无法从现有证据指出用户选的是哪一个分辨率**；这仍是诊断日志缺项。R2V视频外层提交200不等于异步任务成功。

4. **运行时实例变化观察**：生产App容器报告`StartedAt=2026-10-22T06:20:28Z`（北京时间14:20:28），同一镜像SHA `2b99976f...`，当前healthy、ExitCode 0、OOMKilled=false、RestartCount=0；generation-worker镜像相同且仍健康。Docker事件历史未取得能解释容器被替换原因的create/die事件，因此仅记录“容器实例在该时刻重新启动/替换过”，不能归因于崩溃或OOM，也不能确定是部署操作。当前资源没有异常信号。

截至**14:31:34**全局累计**711成功、346失败、9在途**。在途主要为模汇Seedance视频（均持有上游task ID）及两笔模汇图片`gpt-image-2-all`在`submitting`、暂未取得上游task ID；逐task继续观测，不判提前失败。App/worker ready，CPU约8.02%、可用内存约5.62GiB、磁盘53.39%，容器无OOM，watchdog在线无issues。课堂期间仍只读。

### 13.69 15:45 北京时间：课堂又出现一批未覆盖问题，并捕获 App 容器被 SIGKILL/exit 137 重启

从 **15:15（UTC 07:15）到15:45（UTC 07:45）**，监控按任务 ID 去重观察到35笔新错误终态；这批不是单一故障，主要类别如下：

1. **生产 App 容器被外部杀死后重启，这是新的基础设施事件。**远端 Docker events 显示`vozeb-pro`在 **2026-10-22 15:15:45–15:15:56（北京时间）**发生`kill → stop → die(exitCode=137) → start → restart`，使用的镜像仍是`ghcr.io/lishen331/vozeb-pro:sha-2b99976ffff6f6060fd06c07767e56d62eb5a402`。当前`docker inspect`显示`OOMKilled=false`、RestartCount仍为0，generation-worker没有同步重启；宿主采样当时可用内存仍约5.5–6.1GiB，不能把这次直接定性为内存OOM。**已证实是App进程被SIGKILL/重启，未证实是何方发起或具体原因**（可能是外部运维/编排动作，也可能是资源/健康策略触发）；需要保留主机/编排审计日志才能最终归因。重启后App恢复healthy、ready=true，监控采样未中断，但重启窗口内请求可能受影响。

2. **图片提交中断/长时间无上游ID**：期间仍出现`图片任务在提交阶段中断，未取得上游任务ID`（例如`ee6346cc-1e57-44ff-bc2d-d1ba62215b05`，约3分钟后终止）以及在15:44仍处于`submitting`且无上游ID的图片任务`0a2c96d7-6a1a-4934-a25d-ec45ee5b38da`（35秒）等。更早的`bb3328f7-3246-428a-b134-fc51df0b8eda`在App重启前后也属于同类。它们不能被归为上游失败：事件缺少`upstream_request/response`和上游task ID，说明请求在平台提交阶段中断或超时；需要把“提交等待阶段”与真正的上游HTTP错误分开展示，并在重启时记录任务恢复/丢失状态。

3. **ModelBay图片参数契约问题持续复现**：`gpt-image-2-5-sunburst/flare`继续收到HTTP400 `Unknown parameter: 'response_format'.`，本窗口5笔（如`50ae51cb-e817-4a83-b03c-bec2661937fa`、`063ab6a3-2250-432d-96bd-eb7ec63c6b43`），此前累计已达14笔以上。它们都有真实ModelBay上游请求，根因仍是适配器发送了该模型不接受的`response_format`，不是未转发。

4. **TokenHub/视频素材尺寸校验大量失败**：本窗口至少5笔明确`Height must be between 300px and 6000px`，涉及`cdance2.0-0807`和模汇Seedance，例如`a6a6b9a0-f022-48bc-9457-af10fb2d449c`（`content[3]`）及此前`740171cc-ecdb-4bf2-a50e-e46342ecaae8`（素材URL重试5次后失败）。这不是模型随机失败，而是输入素材在上游资产处理前已被判定高度小于300px；平台当前没有在发出请求前统一校验/自动转码并把具体content索引、宽高回写给用户。

5. **ModelBay视频素材接口400、TokenHub余额不足和视频502同时存在**：ModelBay `official/seedance-2/2-5`出现4笔“ModelBay 素材接口返回 HTTP 400”（如`21870a37-00cf-4701-9db0-a08d0615b794`）；ModelBay预扣费失败至少1笔新增（剩余$0.594506、需要$1.783782）；TokenHub发生新余额不足（剩余¥0.014428、需¥0.237500/¥24.179690）。模汇Seedance还出现两笔真实上游task已有、最终`502 Bad Gateway`（`15f3d0af-1265-4a85-a723-4588badb8a25`、`b1080db7-3958-4997-b8d7-ae08ce995f2b`）。这些分别属于上游额度/资产接口、上游网关错误，不能合并成平台积分不足；平台积分退款应另查。

6. **兔子视频素材地址和安全策略继续失败**：兔子`doubao-seedance-2-5-260628`/`doubao-seedance-2-0-260128`继续出现“素材地址未返回可下载文件”（本窗口2笔，如`60caad29-74d1-49bc-9fa9-f8151c334dfc`、`3ec45071-22bb-46f4-818d-48fc8e2cfa3a`），另有兔子真人审核拒绝（`1fa5875a-4359-4cff-90a4-7d29aa1284e8`、`063a34a5-343a-4f44-9b73-227279f1709a`），均为已到兔子接口的上游业务拒绝，不是平台没发请求。

7. **图片上游200后栈溢出仍未消失，但本窗口至少有3笔新复现**：`54e25c46-b559-44e8-9ccb-5d6644d937b0`（响应6.848MB）、`03d235f7-6a2e-4d8d-a28d-a5d3dccd79f2`（8.667MB）、`257c3abb-687e-4392-a698-b5ed49ff2235`（8.597MB）均上游HTTP200后平台`Maximum call stack size exceeded`，之后fallback错误覆盖。它再次证明之前预检没有覆盖更大（约6.8–8.7MB）的实际响应路径；具体JS函数仍因生产日志无stack frame而未定位。不能把今天成功的4.09MB样本当成修复证明。

截至**2026-10-22 15:44:40（北京时间）**，生产累计**766成功、440失败、6在途**；在途包括2笔`official/seedance-2`提交阶段（其中`cac3f537-0b6b-419a-bbb2-9e1f3588a139`已提交约15分钟仍无上游ID）、3笔已有上游task ID的视频轮询，以及1笔`gpt-image-2-all`图片提交约35秒。App/worker当前ready、CPU约11.56%降至3.25%、可用内存约5.68GiB、磁盘53.51%，watchdog在线且`issues=[]`。本节所有检查均为只读，未重试、未改生产配置、未人工改数据库。

**本轮新增的修复优先级**：
- 立即查明15:15:56 App `exit 137` 的编排/主机审计原因，建立重启期间任务恢复和幂等保护；
- 图片适配器按模型能力剔除`response_format`，并在提交阶段超时/进程重启时保留明确状态；
- 在视频资产上传前读取真实宽高，低于300px直接前端阻断并指明`content[N]`，必要时自动转码；
- 将渠道额度、上游502、ModelBay资产400、兔子素材/安全拒绝分别分类，不用统一“生成失败”覆盖证据；
- 为上游200后的图片处理增加受限JS stack trace、阶段字段和大响应fixture测试，防止栈溢出后盲目fallback到可能收费的未绑定渠道。

### 13.70 15:48 北京时间巡检：重启后服务恢复，但仍有长期提交无上游ID

15:48:45采样显示生产累计**772成功、442失败、5在途**，App ready、generation worker healthy、watchdog无issues；15:45后的增量没有新增错误终态，新增成功3笔。需要继续关注的异常是：`cac3f537-0b6b-419a-bbb2-9e1f3588a139`（ModelBay `official/seedance-2`）已在`submitting`约20分22秒仍没有上游task ID，`92681295-7e45-4eea-82ba-08987488bedc`同模型提交约3分13秒也没有上游ID；两者不能按“上游慢轮询”解释，而是平台/ModelBay提交阶段未取得外部任务锚点。另有1笔图片提交仍无上游ID、3笔视频已有task ID在polling。重启后的服务目前可用，但提交阶段长尾和重启窗口任务可恢复性仍是未解决风险，继续只读跟踪。

### 13.71 16:02 北京时间：30分钟悬挂任务已核到终态；新增独立证据文件，并纠正前文渠道/统计表述

**本节依据**：2026-10-22 15:59:59（北京时间）的只读PostgreSQL事务审计，证据文件为`D:\Claude code programe\VOZEB-PRO\VOZEB-PRO\docs\reports\2026-10-22-classroom-evidence\readonly-incident-audit-20261022-155959.json`；验证文件`verification-155959.json`。查询只输出任务状态、选定诊断字段、渠道名称、退款记录，不导出账号密码/API key/提示词正文/签名链接。证据中`active_detail`无200条任务截断；统计直接在数据库限定时间窗口聚合，不以最近200条样本推算全量。

#### A. 关键悬挂视频已观察到30分钟恢复检查，不再只是“在途”推测

- ModelBay任务`cac3f537-0b6b-419a-bbb2-9e1f3588a139`：**15:28:23.333创建，15:58:23.358终态error**，日志总耗时1,800,030ms。此前`submitting`状态下`last_heartbeat_at / worker_id / lease_until / last_poll_at / upstream_task_id`均为空，而`next_poll_at`明确为15:58:23.344。
- 到该时刻，诊断新增`state=completed,errorCode=submission_interrupted_without_upstream_id`，随后`recovery_end=failed`，generation log为failed。这证明它并非一直在模型上游排队，而是在**没有可查询上游ID的提交阶段等待30分钟后被恢复流程收敛为失败**。
- 当前工作区视频提交路由确实先设置`nextPollAt = submissionStartedAt + resolveModelRequestTimeoutMs(...)`；恢复服务遇`submitting`且无上游ID会写入上述错误。该源码仅作为行为解释，未把工作区文件未核对的代码当作生产构建证明；本次30分钟及错误终态由生产数据库直接证明。
- App采样`StartedAt=15:28:48.256`，即任务创建约25秒后启动时间发生变化，这与该任务丢失提交上下文在时间上吻合；**没有因果调用栈或运维审计，尚不能宣称该次启动变化就是唯一根因**。诊断仅有`task_created/submit_start`，没有可见外呼事件；不能把“缺事件”当作“绝无外呼/绝无计费”的证明。按任务ID未找到直接退款键，是否预扣/退款仍须查完整账务关联，不能写成未退款或已退款。
- 对照任务`92681295-7e45-4eea-82ba-08987488bedc`并非一直悬挂：15:45:32创建，后来取得上游task ID，**15:55:59成功**，总耗时627,025ms。因此“提交慢后正常获得ID并成功”和“上下文失去后30分钟失败”必须分开追踪。

#### B. 模汇上游令牌额度不足已跨图像、视频证实，纠正此前TokenHub归因

渠道表`_-eQ3SntRYtuDZz9mJ_OK`对应**模汇X中漫 API 渠道**，`wD0cO6S6cyhbyvYIRDE28`才是TokenHub。以下两笔均有模汇`upstream_request → upstream_response HTTP403 → task failed`：

| task ID | 能力/模型 | 上游明确返回 | request ID |
| --- | --- | --- | --- |
| `a7817246-1e72-4dfd-979b-76e518d4135a` | image / `gpt-image-2-c` | 剩余¥0.039132，需要¥0.237500 | `20261022075449674786248RI2ypSq2l7VyZeaj` |
| `91c6da3d-c0ad-4074-b205-9b110ea9bd26` | video / `doubao-seedance-2-0` | 剩余¥0.039132，需要¥8.358410 | `20261022075522223157596RI2ypSq2AGwlhX07` |

**这是平台持有的模汇上游令牌额度问题，不是学生的平台积分不足。**第13.69节把同渠道人民币quota错误写成“TokenHub余额不足”是错误归因，以本节渠道ID核对为准。这里只记录上游当次剩余额度，不把它描述成渠道整个账户当前余额，也不据此擅自充值/改模型开关。

#### C. 当日窗口统计，明确区别跨日累计

冻结于**15:59:59**、`surface=canvas`、任务创建时间从**2026-10-22 08:30（北京时间）**起统计；这是选定的当日画布监控窗口，若窗口内有测试任务亦包含，不冒称已经按学生名单精确剔除测试账号。

| 类型 | success | error | running | 已终态成功率（success / success+error） |
| --- | ---: | ---: | ---: | ---: |
| image | 107 | 108 | 2 | 49.77% |
| video | 125 | 149 | 5 | 45.62% |
| 合计 | **232** | **257** | **7** | **47.44%** |

不将在途算为失败；每个task ID只计一次，不把自动fallback的多attempt重复增加分母。不把10/21起的全局累计成功数作为今天课堂的成功率。该时间窗口查询没有text任务，不据此推断文本功能未使用/不可用：未建任务的接口请求或其他surface不在此分母。

16:01:37全局采样另为782 success / 459 error / 5 active，ready/worker健康，CPU10.28%、MemAvailable约5.47GiB、磁盘53.52%；这些是跨日累计和另一个时刻，**不能拿来替换上表分母**。watchdog在线、无issues。

#### D. 前文的进一步勘误/证据边界

1. 第13.68节`866f51f9...`实际创建/成功时间是**14:22:09 / 14:26:15**（UTC06:22/06:26），不是13点；`d5d2290d...`/`4d0850b0...`实际为14:29/14:30。第13.69节`54e25c46...`、`03d235f7...`、`257c3abb...`创建在14:42/14:50/14:52，不属于15:15–15:45新增窗口，仍是当天真实故障样本但不能算那个窗口的新复现。
2. 15:44:05为766 success / 440 error / 6 active；**15:44:40已变为766 / 441 / 7**。第13.69节把前一采样数挂到后一时间的表述以此纠正。15:48:10至15:48:45确实新增3 success、无新增error；第13.70节不应把这个35秒增量扩写成整个15:45后的增量。
3. 多笔图片失败是“HTTP200 + 多MB正文完整读取 + provider_exception栈溢出”，这证明接收成功后的本地处理失败；尚未逐笔检查业务响应内容，不把HTTP200本身当成生成成功。只有生成任务success、持久化结果、节点关联均被核验的样本才作交付成功证据。
4. 图片编辑任务部分只保留附件大小/类型，没有prompt hash；前文“这些任务同一prompt hash”的泛化不成立。纯文生图中确有hash相同对照，编辑任务不据此认定提示词/素材相同。响应大小相关性不足以证明固定字节阈值。
5. 仅`Height must be between 300px and 6000px`不能区分过小或过大；带`InvalidParameter.HeightTooSmall`的具体样本才直接证明高度过小。`ModelBay 素材接口返回 HTTP400`但没有外呼诊断时，不能因为没有事件断言“请求绝未发出”，仍需补素材服务子调用的阶段/状态/错误码证据。

**继续执行的边界**：仍只读监控，不追加付费生成、不重放结果/扣费未知请求、不改渠道/数据库/生产代码，也不推GitHub。新增监控脚本和脱敏证据仅落本机与报告目录；目标仍为持续识别课堂异常及其证据，而非声称上述问题已修复。


### 13.72 16:07 北京时间跟进：新的在途任务有活跃心跳，区分“正在提交”和“已丢失提交上下文”

16:07:21只读数据库审计（证据`2026-10-22-classroom-evidence/readonly-incident-audit-20261022-160721.json`）：当日08:30起Canvas窗口累计**239 success / 258 error / 7 running**，已终态成功率**48.09%**；该比例混合额度、素材、审核和平台错误，不能直接当作纯平台稳定性指标。与13.71同窗口比较新增7个成功、1个失败。

- 新失败`6259b232-debb-4667-910a-caefc35d48e5`：模汇`doubao-seedance-2-0`，已确认16:04:11终态error，错误`Height must be between 300px and 6000px`；外层HTTP200创建上游任务后，在异步素材处理阶段失败。范围校验报错未带HeightTooSmall，因此不推断到底过小还是过大。
- 当前5笔视频都已获得上游task ID且有新鲜heartbeat，2笔新图片处在submitting但也有新鲜heartbeat。它们与15:28创建、无heartbeat且30分钟后失败的`cac3f537...`不同，不因没有上游ID就提前判为悬挂。
- 最后一次独立采样16:06:53显示ready/worker健康，CPU13.93%、可用内存5566MiB、磁盘53.54%；watchdog在线无issues。App启动时刻仍为15:28:48，本轮未见再次变化；不把RestartCount=0当作当日绝未重启的依据。监控继续只读。


### 13.73 16:15 北京时间：四笔新增图片HTTP200后RangeError；mini视频R2V分辨率不兼容再次出现

证据：`2026-10-22-classroom-evidence/readonly-incident-audit-20261022-161519.json`；校验：`verification-161519.json`。均为生产课堂自然任务的只读查询，没有主动提交生成。

**16:07基线之后到16:15:19的错误终态增量为7笔（4图片、3视频），成功增量8笔**。当天08:30起Canvas窗口冻结为**247 success / 265 error / 10 active**，已终态成功率**48.24%**。与跨日累计分开；不能据此推断所有失败来自平台，也不能用成功增量宣称问题已修复。

#### 四笔图片的上游响应和平台错误完整关联

| task ID | 用户所选模型 | 完整响应字节数 | 上游request ID |
| --- | --- | ---: | --- |
| `c0320ccf-21e4-42cf-9875-2fbb09c7f49b` | `gpt-image-2` | 10,598,917 | `202610220809241149999958268d9d60GMqqB1w` |
| `9768df78-2b43-43ed-98b9-4349fb98ecd1` | `gpt-image-2-c` | 4,607,010 | `202610220808035483557532l2yefu6khZPkkR2` |
| `709a433e-9265-4d0f-80ae-7d2e97cd682e` | `gpt-image-2-c` | 6,473,601 | `202610220807136819746332l2yefu6JTyG2mfR` |
| `e970391e-87a8-4b4a-b8ff-70807aab629d` | `gpt-image-2` | 5,163,223 | `202610220813018878865038268d9d6hJmsXMC2` |

每笔均记录：真实`upstream_response=200`、`upstream_body_complete`，随后`provider_exception`的**errorName=RangeError**、errorMessage=`Maximum call stack size exceeded`；再由fallback的逻辑模型绑定403覆盖顶层错误。其中兔子模型`gpt-image-2`生成的一笔响应达**10,598,917 bytes**；另外两笔模汇响应约4.61MB及6.47MB。现在比此前更进一步：确认异常类型是JS RangeError，而不是仅靠错误字符串分类，但**仍没有生产stack frame，不能定到具体函数**。

`c0320ccf...`、`9768df78...`、`709a433e...`三笔已核对generation log均failed、success_count=0，且逐task幂等键各有1积分退款；第四笔尚未在本轮terminal_verification查询里核对退款，不外推。上游HTTP200是否对应计费或生成结果可追回仍未知，故未重放请求。

#### 三笔视频的独立失败

- `fc86a323-afb5-4bc7-8e8d-15fee1ea330c`：模汇Seedance，16:09:51提交、16:10:33失败，外层HTTP200后取得`task_Se8hvZoDOyRrIQLkUwvcUVwktKdG3PE6`，异步结果报高度需在300–6000px范围；失败日志和逐task 1积分退款已核对。没有具体高度，不能写成必然小于300px。
- `83b4ed43-f4bc-404a-ac39-55a60d8d301f`：模汇Seedance，16:14:23异步终态失败，同为高度范围错误；其提交HTTP200 request ID `202610220813518924259112l2yefu6GCD1V1zD`。
- `13426261-5f1d-4184-a007-5123bb0688bc`：TokenHub `cdance2.0-mini-0807`，16:14:10创建、16:14:23失败。提交外层HTTP200、request ID `080f6ad9c5d20a7a80818220503bcbf5`，随后业务错误为`resolution ... not valid ... doubao-seedance-2-0-mini in r2v`。与fast模型同类，但这是mini型号的新增样本；不能把普通版视频成功作为mini/R2V分辨率支持的验证。实际resolution仍未在当前外呼摘要中记录。

16:15:05独立心跳：ready/worker健康，CPU3.01%、MemAvailable5507MiB、磁盘53.54%；watchdog在线、issues为空。资源正常并不推翻这些任务级错误。保持只读监控，不改生产、不推送GitHub。


### 13.74 16:41 北京时间：新增33笔失败的只读冻结；14笔栈溢出、8笔ModelBay素材403以及部署交界提交中断

**冻结依据**：`2026-10-22-classroom-evidence/readonly-delta-20261022-164145.json`，事务隔离为`REPEATABLE READ READ ONLY`，数据库事务时刻 **2026-10-22 16:41:45+08**。当天08:30起Canvas窗口为 **272 success / 298 error / 10 running**；已终态成功率 **47.72%**。仍可能包含该窗口的测试，不能宣称纯学生成功率或纯平台故障率。相对16:15:19基线**新增25成功、33失败**；任务按task ID去重，不把fallback attempt累计成新任务。

| 类型 | 成功 | 失败 | 在途 | 已终态成功率 |
| --- | ---: | ---: | ---: | ---: |
| 图片 | 122 | 129 | 6 | 48.61% |
| 视频 | 150 | 169 | 4 | 47.02% |
| 合计 | 272 | 298 | 10 | 47.72% |

#### A. 本窗口的33笔失败分组

- **14笔图片**：收到上游HTTP200并完整读完正文后，平台`RangeError: Maximum call stack size exceeded`，随后fallback的逻辑模型绑定403覆盖顶层错误。
- **1笔图片**：ModelBay拒绝`response_format`参数（`5b646668-62e6-4e2f-9f99-881c7e97d5a1`）。
- **2笔图片**：提交阶段中断，无上游任务ID；见C。
- **8笔视频**：ModelBay素材接口HTTP403；错误日志只保留通用消息，未提供足以区分余额、权限、策略等原因的上游正文/code，不猜成密钥错误或用户积分不足。
- **7笔视频**：模汇或TokenHub素材高度范围校验失败；没有具体像素值时不能断言一定小于300。
- **1笔视频**：兔子拒绝含真人的输入，`263d1853-a1bf-4322-b849-a8d3f45d541c`，input `content[1]` / `content[2]`。

#### B. 14笔图片HTTP200后RangeError的关联证据

| task ID | 用户所选逻辑模型 | 完整响应字节数 | 首attempt上游request ID |
| --- | --- | ---: | --- |
| `685fca7c-bc66-4459-a918-42acc20c8e02` | `gpt-image-2-c` | 4,635,972 | `20261022083523907575008RI2ypSq2Nkypg0Ou` |
| `f41da877-a2ef-4c2e-b968-4e76dfbba8d3` | `gpt-image-2` | 11,015,283 | `202610220833581278879738268d9d6kCp4Ef0m` |
| `5dd09f0a-f74c-410b-befe-ab5c890ee5a1` | `gpt-image-2-all` | 4,759,094 | `202610220830191397120342l2yefu6sx9eXqKm` |
| `641dd96b-049d-4761-9518-58e3ca253020` | `gpt-image-2` | 4,880,035 | `202610220827326371370198268d9d6UKGMFktH` |
| `7141b4ea-ebb1-4c46-8cc1-18aa63ee6f02` | `gpt-image-2` | 9,020,708 | `b2b3d9c0` |
| `8c1a128c-216a-4287-ac64-e2f609b90907` | `gpt-image-2` | 4,667,955 | `202610220824543750060638268d9d6yV2K46jn` |
| `1eb652cc-4d5f-4809-84ff-a8583575738d` | `gpt-image-2-c` | 8,509,442 | `20261022082215435697351RI2ypSq2j9fvnJky` |
| `35e2aafb-b1ff-4311-9f84-00578eafa809` | `gpt-image-2-c` | 6,158,062 | `20261022082015169915980RI2ypSq2CRDvC43h` |
| `0d60e672-7d03-4837-863c-3597d51d98c7` | `gpt-image-2-all` | 4,490,500 | `202610220821363924612412l2yefu6lQ5Pv8x4` |
| `da4e8820-35cc-4579-9975-f9d92b39ca19` | `gpt-image-2-c` | 8,146,195 | `20261022082001360225505RI2ypSq2GnKsjJqg` |
| `e2307a7a-c59b-45cd-a00b-7a5bd58c4b1b` | `gpt-image-2-c` | 6,479,745 | `20261022081734094497441RI2ypSq2vLheg7S0` |
| `f0bbc560-0acf-4cea-a564-bb84cde045f8` | `gpt-image-2-c` | 4,542,176 | `20261022081703596707166RI2ypSq2ctlWqVJa` |
| `49cd0560-8c62-4074-93c0-9f420e07dd0f` | `gpt-image-2-all` | 7,702,346 | `20261022081351950265652RI2ypSq2sH9bindU` |
| `91d825ee-3793-463e-a9b1-807c9dda90d6` | `gpt-image-2-all` | 6,270,209 | `202610220812207332783652l2yefu6gXyB98tX` |

这14笔逐task核验均有generation log `failed / successCount=0 / failCount=1`，各有按task幂等键关联的**1积分退款**；平台退款不证明上游未收费。不存在生产stack frame，因此边界是**收到完整成功HTTP响应后的平台provider路径**，尚不能定位某个具体函数；也不能把HTTP200等同可用图片生成成功。

本机另从当时生产镜像对应的不可变Git提交`2b99976ffff6f6060fd06c07767e56d62eb5a402`抽取源码，以Node **v24.16.0**运行24组离线合成fixture（4种JSON/base64包裹形状，base64长度1KB到12MB），覆盖JSON往返、provider业务错误检查、`findImageResults`、`configuredImageResult`、`parseImagePayloadOrPoll`：**24/24未复现**。这不是修复或完整链路测试；外部依赖被stub，未覆盖真实生产响应、transport、计费、存储及结果规范化，且没有生产堆栈。证据为`offline-image-response-probe-20261022.json`和同名`.cjs`。它只排除了这批合成输入下的解析函数触发，不能反证真实课堂异常。

#### C. 新的镜像切换与两笔已外呼但无响应记录的提交中断

采样器确认生产App于 **16:37:58.124**、worker于 **16:38:13.782**切换到镜像`sha-bc2643a5d2c8ddc51173f4a74d45da3c6ee52859`，之前镜像为`sha-2b99976ffff6f6060fd06c07767e56d62eb5a402`。这是**镜像及StartedAt双重变化的证据**，不是RestartCount推断；本轮操作仅只读观察，未实施该部署。

| task ID | 创建时间（北京） | 失败时间（北京） | generation log耗时 |
| --- | --- | --- | ---: |
| `14878a5f-18ef-44c3-a830-c891414ba556` | 16:36:58.986 | 16:39:59.030 | 180.046 s |
| `60d08e23-f36f-4b94-89af-12b3c68b7b7d` | 16:37:02.881 | 16:40:02.937 | 180.060 s |

两笔**确有`upstream_request`事件**，之后没有记录到相应响应/request ID，最终recovery以`submission_interrupted_without_upstream_id`收敛为error。均`billing=null`，按task直接幂等键未查到扣费/退款记录；这只能说明当前关联证据不足，**不能证明未扣费、上游未收到或退款缺失**。与镜像切换的时间关系明确，但缺少请求完成/取消证据，因果仍需进一步查证。不要自动重放可能已收费请求。

建议（未执行）：正式修复应在发布切换前排空或可靠交接在途提交，核对请求ID和收费证据后再恢复未知任务；补充脱敏、截断的异常stack与关键子阶段，避免仅凭顶层403和无request ID分类。ModelBay素材子调用需保留HTTP状态、上游code、脱敏消息和关联request ID。**没有改生产或推GitHub。**

### 13.75 16:45 北京时间：新镜像后的8笔自然图片成功，不能将旧版本失败混入新版本结论

证据：`2026-10-22-classroom-evidence/post-release-image-verification-20261022-164516.json`；查询窗口为 **16:38:14起创建**的生产Canvas图片任务。该冻结有**8 success / 0 error / 1 running**。8笔均有generation log成功且`result_payload`非空，诊断记录未见`provider_exception`或自动fallback；这证明服务端结果持久化，但不替代每个学生浏览器的显示验收。

| task ID | 逻辑模型 | 服务端总耗时 | 完整响应字节数/说明 | 结果 |
| --- | --- | ---: | --- | --- |
| `c0629ca6-61e9-4ec5-8e81-74e0de94b2b9` | `gpt-image-2` | 96.868 s | 8,354,120 | 已持久化 |
| `8ff4c81b-c7ed-4fb0-8c8a-d8d5187ef212` | `gpt-image-2-all` | 258.358 s | 4,442,522 | 已持久化 |
| `ef643bc2-2314-449b-ba99-f47ebdf40aac` | `gpt-image-2-c` | 230.034 s | 3,388,050 | 已持久化 |
| `65ccada1-0b73-4fc9-a335-01a6b1a8cf05` | `gpt-image-2-c` | 217.924 s | 7,032,117 | 已持久化 |
| `c52d1105-7d22-4c50-a422-8d78373dcdf7` | `gpt-image-2-c` | 177.213 s | 3,561,918 | 已持久化 |
| `48df9792-ad9c-410e-9be7-ccf721fd2408` | `gpt-image-2.5-sunburst` | 211.804 s | 异步轮询响应，非图片字节数 | 已持久化 |
| `5bdd17da-75cc-41fe-b4bd-dd01d9f83e78` | `gpt-image-2-c` | 142.280 s | 2,342,098 | 已持久化 |
| `e61e8bf7-4a3e-4d7a-950c-767f157c85e1` | `gpt-image-2` | 57.180 s | 4,977,427 | 已持久化 |

新样本包括约 **8.35MB**和**7.03MB**的同步响应成功，所以**不能把4MB作为已证实的失败阈值**。但样本量和覆盖仍不足，尚未证明原RangeError已彻底修复。Git提交差异显示本轮新镜像主要增加溢出候选路由身份及内部绑定校验修复；“overflow路由”不等于JS“stack overflow”，不能仅凭提交标题混为同一个问题。继续分别监控两者。

此前四笔长polling视频已全部自然成功：`f88741ae...` **444.627s**、`cc574f05...` **543.424s**、`8a27def2...` **868.784s**、`888d3de5...` **978.571s**。证据同时在16:41冻结文件的`earlier_active_status`；这再次说明持有有效上游ID、有新鲜心跳的长polling不应人工直接标失败。

最新独立资源与容器快照见`resource-release-snapshot-20261022-1647.json`，采样器/watchdog继续在线；资源健康不能代替业务成功。当前仍有自然生成在途，课堂只读监控继续；不发布“全部修复”或“任务完成”结论。


### 13.76 16:59 北京时间：新镜像后RangeError再现；备用路由已真实出站，但ModelBay额度不足

**重要更新：13.75的首批8笔成功并不代表栈溢出修复，新镜像下已经观察到反例。**只读冻结`readonly-incident-audit-20261022-165902.json`及重复读事务`readonly-delta-20261022-165954.json`均已归档到`2026-10-22-classroom-evidence/`。

#### A. 兔子HTTP200后平台RangeError，新镜像也发生

- task `c98de1dc-b1d8-4493-8935-f29a09c7a6da`，16:57:10创建、16:58:43终态error，完整日志耗时**93.053s**。
- 用户原选`gpt-image-2`，首attempt走兔子；参考图为1张PNG、5,194,984 bytes，出站`size=1824x1024`、`response_format=b64_json`、`output_format=png`。这些是服务端出站诊断，不是截图猜测。
- 上游HTTP200、request ID **`202610220857158412430178268d9d60p1PotF2`**；响应头耗时88.036s，正文2.835s、**4,592,415 bytes**完整读完，随后平台`provider_exception.errorName=RangeError`、`Maximum call stack size exceeded`。
- fallback这次**确有ModelBay upstream_request**，实际型号`gpt-image-2-image-to-image`；上游403消息为**剩余$0.019762，需预扣$0.104000**。不是之前的内部“未绑定模型”403，也不是学生的平台积分不足。
- generation log `failed / successCount=0 / failCount=1`；按task首attempt键核实**1积分平台退款**。不能据此认定上游兔子未收费，未重放请求。

因此新镜像候选路由在这一分支真实外呼成功，并不等于结果处理栈溢出解决；两个问题必须分开验收。

#### B. 另一笔模汇504后同样落到ModelBay余额不足

`ca32d163-9b19-47b0-b1a7-e35e5fc26838`：原选`gpt-image-2-all`，模汇上游约**314.958s**后返回HTTP504 HTML，随后ModelBay `gpt-image-2-text-to-image`真实出站403，剩余/需求同上；总耗时**319.491s**。这笔首错误是上游504，**不能混入RangeError计数**。直接task退款键为空不证明未扣/未退，未擅自补账。

#### C. 新视频错误及日志丢失的具体机制

- ModelBay `6d59c8bb...`、`5d500728...`在16:55:49、16:57:20仍出现素材接口403，具体上游原因仍缺证据。
- **已从部署SHA源码定位并在本机离线复现详情丢失**：素材service构造的`ModelBayAssetError.details`有status和response，但`prepareModelBayReferences` catch只执行`new SafeCandidateFailure(error.message)`，不保留details/cause；trace也不采集details。完整源码位置、合成fixture和最小补日志建议见`2026-10-22-modelbay-asset-diagnostic-loss-evidence.zh-CN.md`。这证明为何日志不全，不能证明当天403实际原因。
- TokenHub mini任务`c97030e1-2c82-44cf-a9e5-b28de8064880`：上游创建HTTP200（request ID `020d6ad9cffa0a7a982b22999ffbddce`），随后异步失败`Policy control service unavailable`，耗时**65.029s**。属于上游策略服务不可用，不能等同内容审核拒绝；逐task已核1积分退款。
- TokenHub mini任务`1f46c273-f94b-471c-8c49-0656a83e7575`：上游HTTP200（request ID `041b6ad9d03e0a7a002aa4da2dad3762`），异步拒绝R2V分辨率，耗时**17.248s**，1积分退款。实际resolution仍不在当前出站摘要，不能猜值。

16:59:53重复读冻结：当天08:30起Canvas **290 success / 304 error / 5 running**，已终态成功率**48.82%**。相比16:41:45新增18成功、6失败（不是39笔新失败；39是16:15之后的累计失败查询行数）。

另已新增当日清晰分表报告`2026-10-22-production-classroom-live-metrics.zh-CN.md`，包含整体、31个账号、16个逻辑模型、实际渠道attempt成功率和耗时均值/P95/最大值；每次有自己的冻结时刻，不能与本节时刻混用。课堂仍只读监控，未改代码、生产配置或数据库，未推GitHub。

补充运行时边界：只读命令确认当前生产App为Node **v22.23.4 / V8 12.4.254.21-node.57 / Linux x64**，本机24组离线fixture使用Node v24.16.0。因此离线未复现还存在运行时/平台差异，不能排除生产引擎与实际响应触发路径；记录在`runtime-and-exception-phase-verification-20261022-1657.json`。未据此修改Node版本或生产启动参数。


### 13.77 17:05 北京时间：备用已能发出后，两渠道仍可在同一任务上先后栈溢出

新冻结`2026-10-22-classroom-evidence/readonly-delta-20261022-170526.json`（事务时刻2026-10-22T09:05:25.304029+00:00）补充两个新镜像失败样本：

| task ID | 实际模型/attempt | 完整正文bytes | 上游request ID |
| --- | --- | ---: | --- |
| `33a757aa-0aef-4ee1-b768-ca983a64b4e2` | `gpt-image-2` | 5218611 | `202610220902395843214688268d9d6lnRKZx0R` |
| `8b45412c-dede-4651-b906-b7405baac67f` | `gpt-image-2` | 4375639 | `202610220902215360818878268d9d6htGc5kUD` |
| `8b45412c-dede-4651-b906-b7405baac67f` | `gpt-image-2-c` | 4501510 | `202610220858533288861852l2yefu6cvYujH4q` |

`8b45412c-dede-4651-b906-b7405baac67f`先模汇`gpt-image-2-c`、后兔子`gpt-image-2`，两个attempt分别上游HTTP200/body_complete后均`RangeError`；这只是**1个失败任务、2个失败attempt**，不能加成两笔用户任务。`33a757aa-0aef-4ee1-b768-ca983a64b4e2`先模汇504，后兔子HTTP200后RangeError，又是独立1个任务。

这让新镜像的失败不再只有余额/绑定：即便fallback真实外呼并收到200，平台本地结果处理仍可能失败。此前13笔新镜像图片成功不能支持“已修复”，也不能简单把失败归咎兔子单一渠道。两笔generation log均已failed，按task退款记录保留于冻结证据；平台退款与上游费用仍分开。


### 13.78 17:18 北京时间：明确定位图片备用模型结果下载的内部授权字段错用

两笔新图片`0ddccffb-02a8-4cd5-b519-df6900aebf16`、`d311a845-f23b-45a4-aaca-3152a9f67580`切兔子异步`gpt-image-2.5-sunburst`后，创建取得上游任务ID且进入轮询，但结果媒体下载在平台内部`/_media`被403“媒体路径未获任务授权”拒绝。分别完整耗时126.161s、400.741s，最终task/log failed且未持久化结果。

**代码机制已离线复现：**图片`normalizeSafeImageResult`签名时把`generationModelId(task.config)`作为`upstreamModel`（返回原始logicalModel），授权端却对比实际`config.model`。两笔原始型号分别`gpt-image-2`和`gpt-image-2-c`，实际均`gpt-image-2.5-sunburst`，不匹配。生产冻结有实际字段及媒体拒绝事件；没有抓取实际token，未声称取得真实签名内容。以生产SHA真实源码/虚构密钥的离线fixture复现同一错误，使用实际执行型号签名的对照可通过，而跨用户和cancelled仍被拒绝。

完整证据、源码位置、复现与最小建议：`2026-10-22-image-fallback-media-auth-evidence.zh-CN.md`；归档`fallback-media-auth-production-evidence-20261022-171816.json`、`offline-image-fallback-media-auth-20261022.json`。这是**结果交付授权**错误，与生成路由绑定403、上游额度403、RangeError分别记录。建议修签名字段而非放宽授权；未实施生产变更、未重放或人工恢复。

补充：使用生产Node22独立短生命进程做4组纯内存解析fixture（4.5/9MB、b64_json/dataURL）均未复现RangeError，没有实际外呼、应用/文件/DB写入。故不能再仅以本机Node24不同解释离线未复现；仍需真实堆栈/响应形状/子阶段证据。

17:13节点只读抽查35个新镜像终态：21成功中19个原节点仍成功且有URL；1个原节点不在项目、1个为idle/isBatchRoot，二者不能直接算丢图。14个失败任务的原节点已绑定不同生成任务，显示loading不能据旧失败强改；17:14绑定核对有活跃任务与新鲜heartbeat。继续不写学生项目。


### 13.79 17:27 北京时间：补齐测试覆盖缺口清单，继续跟进真实任务而非重复预检

新增`2026-10-22-classroom-regression-coverage-gaps.zh-CN.md`，按生产SHA核对已有测试的组件边界：图片runtime媒体签名与下载均mock，授权测试侧重video同模型，未组合image原始ID≠备用ID的真实签名/校验；ModelBay service独立测试没有覆盖route包装至trace的信息保留。没有重新执行全套测试的宣称，静态源码锚点与哈希已归档。

17:26:53重复读冻结Canvas为**303 success / 316 error / 4 running**；比17:22:22新增2成功、1失败。新增失败`6ac11193-65e7-483b-b412-32f38e1b514a`耗时539.822s，最终RangeError，两个attempt分别查到1积分退款；仍不等于上游未收费。证据`readonly-delta-20261022-172654.json`。

节点抽查勘误：13.78的“idle/isBatchRoot”仅据metadata字段存在，不足以推断bool为真。17:26精确查询确认`241e815d...`的`isBatchRoot=false`、无children/snapshots，当前项目没有节点URL精确匹配任务结果；这是待核验交付缺口，不能用batch根直接解释。项目在任务完成后有更新、缺历史浏览器证据，仍不能断言从未回写，也没有擅自恢复。完整证据与不确定性见覆盖清单第4节。

采样器持续在线，新镜像StartedAt本轮未变；没有生产写入、主动付费生成、重放或GitHub推送。课堂任务仍在继续，目标不标完成。


17:30补强13.78：已只读核对当前容器Next编译静态产物，图片媒体签名依然调用原逻辑模型函数（有限片段包含`rationModelId)(e.config)`），与Git源码和离线复现一致；非仅本机源代码推测。归档`deployed-compiled-parser-snippets-20261022-1730.json`。本轮没有加载应用业务模块或更改文件。


### 13.80 17:38 北京时间：首错误/最终错误分表及3分钟连续观察

新增`2026-10-22-classroom-first-final-errors.zh-CN.md`：17:36:19源快照中316个Canvas失败任务按task ID去重，以持久化首attempt错误和最终顶层错误分别分类。**87笔分类不同**，体现fallback/处理阶段的新错误可能覆盖首问题；不是额外87笔失败。首错误索引中68笔包含RangeError消息、66笔素材尺寸范围、28笔response_format不兼容、25笔HTTP504。此分类是服务端消息检索索引，不是对全部任务均有stack级根因证明，也不是最终错误可替代首错误。所有316笔均有首attempt错误记录，无需用缺失时的顶层回退；原始索引和完整分组已归档。

17:35:18—17:38:13连续六次本机只读观察：跨日累计失败保持518未增加，成功新增4笔；涉及兔子图片114.659s、TokenHub视频409.376s/350.292s、模汇视频300.871s。跨日数量仅用于本短窗口差量，不混为当天累计。新镜像/StartedAt未变，采样器在线；CPU在观察点约0.5%—35.26%，可用内存约5713—5743MiB，磁盘53.62%—53.64%。这是离散采样，不是连续资源峰值证明。

证据`bounded-classroom-watch-20261022-173518.jsonl`及`verification-1738.json`。观察末仍有3笔视频在途，新任务仍可继续提交；短窗口未新增失败不等于上述bug已解决，课堂监控不标完成。


### 13.81 17:46 北京时间：实际参数缺失与长轮询淘汰提交锚点已补实证据

新增`2026-10-22-classroom-diagnostics-completion-plan.zh-CN.md`，将四类日志缺口分开：ModelBay包装丢details/cause、mini/R2V实际resolution未保存、20KB预算淘汰提交锚点、RangeError缺stack。不是无限增加日志量的建议，未改生产。

17:43:51只读查mini两笔任务`1f46c273...`、`13426261...`，任务config的vquality/resolution均空、完成日志request_snapshot无键，出站摘要白名单也缺resolution，因此不能再靠当前数据还原当时实际值。不得猜分辨率再称已定位具体错误值。

本机用生产SHA真实appendDiagnosticEvent做300个合成body轮询事件，最终20357 bytes，保留task_created却丢upstream_request及submit_end；现实现超预算持续删除index1，poll去重不覆盖body_complete。因此关键锚点需要独立保留和重复轮询汇总，但不能声称所有历史缺事件都唯一由淘汰造成。

另`241e815d...`后台成功图有1个日志资产和3,496,353-byte PNG的对象存储登记；未实际读取OSS，不能保证文件仍可下载；当前项目未匹配结果不证明从未回写。没有恢复学生节点。17:42另见ModelBay素材403新样本`a2998b16...`，仍属已知诊断不全类型，不把它写成新根因。采样继续只读。


### 13.82 17:54 北京时间：此前最后一笔在途自然成功，采样不中断，不据零在途宣告课堂结束

17:48:47—17:52:38五次持续观察无新终态/新增失败，采样新鲜、App/worker healthy；17:52:59只读核对`88003573-fbc9-4b55-9300-ddf785a57957`持有有效上游ID，heartbeat到17:52:56、last_poll到17:52:57，不能因约10分钟等待直接判卡死。

17:53:28该模汇Seedance视频自然终态success，完成日志耗时**660.068s（11分00秒）**；17:53:51采样在途降至0。证据`bounded-task-follow-20261022-175418.jsonl`。没有人工改状态或恢复节点。

当日窗口最新报告已刷新为**637任务 / 320成功 / 317失败 / 0在途**，终态成功率**50.24%**；不要与跨日867/519混用。零在途只是当前时点，用户未确认下课，既有采样器继续运行，不将监控目标标完成。已定位问题仍未修复，不由最后视频成功推断全平台通过。


### 13.83 18:05 北京时间：没有新增生成，但画布仍有保存/读取活动，不据此推断下课

18:00:00—18:04:52 Nginx最近8000行的只读归类中，匹配208个请求，包含35次`PATCH /api/canvas/projects/:id` HTTP200、2次同类POST HTTP200、画布页面读取和素材访问。故“0在途/未新增生成”**不等于没有用户操作或已经下课**。该tail窗口无匹配4xx/5xx，仍不是全量请求总数或端到端保存/下载验收。

其中307再次细分到素材路由：截至18:05:20匹配的307均属`/api/generation-log-assets/*`或`/api/reference-assets/*`，没有混写为登录循环或错误。源码具备对象存储签名地址重定向路径；本轮没有抓取/保存签名Location或验证OSS最终响应，因此只确认路由来源，不宣称所有下载已成功。

证据`nginx-quiet-window-20261022-180454.json`、`redirect-route-verification-20261022-1806.json`；两个抓取时刻不同，307计数不相加或与前窗口强对齐。监控继续只读，未重启、改配置、恢复节点或提交生成。


18:12补充非生成入口核验：Nginx18:10:28有单笔`GET /` HTTP404；未留请求Host/来源证据，不能推断是学生入口故障或扫描。18:12:27从生产主机对正式域名`/`、`/login`进行未登录GET，两者均HTTP200（不保存HTML/会话），所以未证实当前正式首页或登录页整体不可用；也不能据当前200否定历史单请求404。证据`http-error-path-classification-20261022-181139.json`和`public-entry-readonly-verification-20261022-181227.json`。不计入生成失败率，未主动登录或发起付费生成。
