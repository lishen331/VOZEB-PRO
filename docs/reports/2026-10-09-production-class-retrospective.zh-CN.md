# 2026-10-09 生产课堂与当日生图链路复盘总报告

> 文档用途：内部复盘、问题派单及供应商协调。另三份供应商专项报告可分别发送给对应上游；本总报告含跨渠道数据和内部维护信息，不作为供应商外发件。
> 报告日期：2026-10-09；所有人工可读时间均为北京时间（Asia/Shanghai，UTC+8）。
> 生产平台：https://gammatv.gammablue-x.com/ 。不涉及测试环境结论替代生产验收。

## 1. 总结先行

1. **下午课堂的图片交付并不理想，不能仅凭服务健康认定生图正常。** 15:00:00—18:11:15 创建的 347 个图片任务，最终查询时成功 245 个（70.61%），平台系统自行失败 25 个，经人工收尾后失败 76 个，另有 1 个待人工确认。人工收尾不是新增一轮上游故障，也不是把成功任务改失败。
2. 三个渠道的问题不同：兔子有自身 CPU 过载、内容拒绝及少量缺原图/超时；ModelBay 有编辑端点参数不兼容、异步专用模型走同步端点被拒绝，以及拿到 HTTP 200 后大响应体下载过慢、被平台总时限中止；模汇有连接建立失败、504/408/600 秒超时和明确的账户额度不足 403。**没有一个统一的“ID不匹配”或“服务器重启”结论能解释全部案例。**
3. 08:59 后当前 App、Worker 容器到收尾核查均 restart=0、OOM=false；下午没有观察到新的堆溢出或栈溢出。上午有另一版本容器重启记录，必须与午后分开。增加 Node 堆上限是运行时缓解，不解决上游超时、OSS 上传、状态恢复和额度问题。
4. 76 项人工收尾的修改前备份均验证为 running / needs_review；全部有人工审计。76 项均找到平台积分 consume 与源记录关联 refund，净扣费 0。**平台积分退回不代表供应商扣费退回。**
5. 全日任务表仍有 357 个待确认，其中 356 个创建于中午以前，1 个属于下午课堂。未将上午历史/压测任务混入下午成功率，也未在用户质疑处理范围后扩大人工修改。
6. 仍需修复平台侧 OSS 批量删除、异常状态分类、不可追回时反复 409、超时分层、入口渠道冷却诊断、日志观测时标及持久化/回写一致性。故障记录与建议不等于这些修复已经开发、推送或部署。

## 2. 统计范围与证据等级

### 2.1 时间和统计口径

- 今日任务表口径：创建时间 2026-10-09 00:00:00—18:11:15，北京时间。
- 下午课堂主口径：创建时间 15:00:00—18:11:15。
- 持续监控主证据从 14:44:39 开始，任务监控最后样本 18:11:10，系统监控最后样本 18:10:51；历史日志和上午试验单独引用。
- 用户宣布下课后写入 STOP。任务监控确认退出于 18:11:58；系统监控停止后 latest 不再更新。只停止本地观测脚本，**没有停止服务端 Worker 或学生任务**。
- 最终任务统计为 **18:14:24 查询数据库时的状态**，所选任务创建时间截止 18:11:15；不是严格的“18:11:15 历史状态回放”。最终服务配置核查为 18:19:10。
- 分母是平台持久化任务，不是学生人数、网页点击数、参考图片数、全部 HTTP 请求数或全部上游计费笔数。创建接口返回错误而未建任务的点击不在任务成功率分母。
- 未按姓名账号鉴别正式课堂与压测身份，所以全日数据包含已知上午压测，不将其宣称为纯学生课堂成功率。

### 2.2 证据分级

| 等级 | 含义 | 本报告使用方式 |
|---|---|---|
| A：直接证据 | 数据库终态、原始诊断事件、上游响应原文、修改前备份、积分消费退款关联 | 可以确认状态、响应、耗时、参数和具体维护范围 |
| B：日志与代码一致 | 日志症状与已部署版本的条件分支相符 | 给出有依据的机制判断，明确缺少哪条请求级证据 |
| C：待确认假设 | 上游内部排队、网络限速位置、网页当时操作、无查询 ID 的最终生成结果 | 仅列为核查事项，不写成根因 |

**HTTP 200 响应头 ≠ 完整图片 ≠ OSS 持久化成功 ≠ 节点已显示。** 必须分层核对。

## 3. 下午课堂结果

### 3.1 总体

| 图片任务状态 | 数量 | 占 347 项比例 | 解释 |
|---|---:|---:|---|
| success / completed | 245 | 70.61% | 平台任务成功；本次未对全部 245 项逐一做浏览器显示回归 |
| 系统自行 error / completed | 25 | 7.20% | 未由本次人工收尾动作转失败；不等同全部是上游故障 |
| 人工收尾 error / completed | 76 | 21.90% | 原本待确认，核查后通过既有人工失败流程结束 |
| running / needs_review | 1 | 0.29% | 上游结果仍不明，留待核查，不算成功或确定上游失败 |
| 正常 pending / submitting / result_ready | 0 | 0% | 最终所选任务中无正常进行中项 |
| 合计 | **347** | **100%** | 不将历史压测混入本表 |

### 3.2 渠道与模型

| 渠道 | 实际模型 ID | 总数 | 成功 | 系统失败 | 人工收尾失败 | 待确认 | 成功/总数 |
|---|---|---:|---:|---:|---:|---:|---:|
| 兔子 | gpt-image-2 | 50 | 43 | 4 | 3 | 0 | 86.00% |
| 兔子 | gpt-image-2.5-sunburst | 50 | 43 | 0 | 7 | 0 | 86.00% |
| ModelBay | gpt-image-2-5-sunburst | 14 | 4 | 1 | 8 | 1 | 28.57% |
| ModelBay | gpt-image-2-5-flare | 5 | 3 | 0 | 2 | 0 | 60.00% |
| ModelBay | gpt-image-2-image-to-image | 1 | 0 | 1 | 0 | 0 | 0.00% |
| ModelBay | gpt-image-2-text-to-image | 2 | 0 | 2 | 0 | 0 | 0.00% |
| 模汇 | gpt-image-2-all | 223 | 150 | 17 | 56 | 0 | 67.26% |
| 模汇 | gpt-image-2-c | 2 | 2 | 0 | 0 | 0 | 100.00% |
| **合计** | | **347** | **245** | **25** | **76** | **1** | **70.61%** |

渠道合计：兔子 100/成功86（86%）；ModelBay 22/成功7（31.82%）；模汇 225/成功152（67.56%）。不同模型负载、尺寸和参考图条件不同，**不是同参数的质量或性能排行榜**。小样本 2/2 不能证明该模型可承受课堂并发。

### 3.3 全日任务表与上午历史积压

| 图片任务创建时间 | 成功 | 平台失败（含人工） | 待确认 | 合计 |
|---|---:|---:|---:|---:|
| 00:00—12:00 | 180 | 102 | 356 | 638 |
| 12:00—15:00 | 100 | 0 | 0 | 100 |
| 15:00—18:11:15 | 245 | 101 | 1 | 347 |
| **今日合计** | **525** | **203** | **357** | **1085** |

全日 203 个平台失败中，127 个未由本次人工收尾，76 个是本次人工收尾。全日还有视频成功2/失败2、任务表文本成功1；下午视频成功1。文本直连/流式接口未必写入统一任务表，**不能用文本任务表只有1条推断今天只调用1次文本模型**。视频样本不足，不能据此给视频并发验收结论。

## 4. 上午试验与应急处理（独立口径）

### 4.1 91 账号、两个模型同时提交

上午两模型首轮留存 182 个提交事件。08:26:28 出现 health=0，08:26:35 观测 App Up 2 seconds，server-monitor 中出现 restart=1，证明该轮 App 确实重启过；当时镜像 sha-20cc8df4c14ec5de5163e96ca999364a740895fb。随后重新部署并重跑，版本变为 sha-da37fcb5825ec0280d1641cf06d73190ced2c699。

这份上午证据能够证明重启和瞬时不可达；本复盘未重新找到同窗口的完整致命运行时堆栈，因此不把这一个重启直接断定为“兔子导致栈溢出”。先前观察到的堆限制应急调整记录与当前设置一致：App 和 Worker 当前 NODE_OPTIONS=--max-old-space-size=1024，启动时间分别为08:59:18、08:59:34。Node 堆上限不等于容器总 RSS 上限，二者应分别监控。

### 4.2 兔子限速 91 张复测

- 模型 gpt-image-2.5-sunburst，91 账号，每人1张。
- 实际为 **11 批：10批每批9张，最后1张**，不是旧报告首句的“10批”。
- 前端1秒滚动窗口峰值9，Worker上游出口实际峰值11；入口限速不自动约束出口。
- 当时终态39成功/50失败/2待确认；该阶段快照不与下午100项重复计数。
- 上游88个200，1个429，1个502，1个503；0次 Maximum call stack size exceeded，0次 upstream_body_exception。
- 50个失败中，44个外部存储 ECONNRESET、5个 RequestTimeout/400、1个上游429。**49个OSS写入错误属于平台到存储链路，不应归责兔子未生成。**
- 当时39个成功任务已回写测试画布、核查媒体/OSS记录及URL200；这只证明该轮39个，不代表今日525个均经显示验收。
- 上游响应与平台落库分层失败需要保留图片结果、异步补存和幂等回写，避免重新生成重复收费。

细节依据同日既有报告及其 manifest/events/task-snapshot，不为写报告重新发起付费试验。

## 5. 主要问题、关键证据、责任边界与建议

| 编号 | 问题与关键证据 | 可确认结论及未知 | 处理建议/责任边界 |
|---|---|---|---|
| F001 | /api/admin/settings/events 多次 upstream timed out；已部署SSE缺周期保活，Nginx读取超时3600s | 长连接空闲超时确认；未证明所有通知永久丢失 | 平台按连接超时契约保活，正确清理订阅，并验证自动重连及revision补查 |
| F002 | DELETE /api/canvas/projects 500；OSS MissingArgument，ArgumentName=Content-MD5，EC=0016-00000606 | 批量删除请求缺兼容校验，非生图/OOM | 修实际序列化请求的OSS/S3校验；核查项目与媒体删除顺序、幂等清理；不在学生画布破坏性复现 |
| F003 | 同账号先8次凭证错误、后50次rate_limited，15:10:53成功；其它账号同期成功 | 本案例不足以证明全班共享IP误限流 | 前端防重复提交、展示凭证错误与Retry-After；保留防护，不无证据取消限流 |
| F004 | ModelBay edits 400：Unknown parameter: 'response_format'.；另3个image-to-image/text-to-image请求400明确要求异步任务端点 | 端点/模型契约不兼容，异步专用模型被同步调用是平台路由问题 | 按供应商公开契约接入对应模型的创建/查询流程；不能猜路径、全局删参数或重复已可能计费请求 |
| F005 | 模汇 UND_ERR_CONNECT_TIMEOUT，连接等待约10秒，平台返回502 | 连接建立失败确认；这不是上游发回的HTTP502 | 分析连接/DNS/TLS出口与上游监听，记录各阶段耗时；是否上游拥塞仍需对方网络日志 |
| F006 | 兔子503：system cpu overloaded current92.1%/92.6%,threshold90% | **上游CPU**拒绝，不是本平台CPU过载 | 上游给配额/并发与Retry-After契约；平台出口按真实契约调度 |
| F007 | 兔子451或内容政策400 | 正常业务拒绝，不自动认定为供应商故障；进入长期needs_review是平台分类问题 | 显示原始拒绝原因并正确终止；不自动改写提示词重试、不要混入网络重试 |
| F008 | 前端反复调用 recover，缺可查询ID时409；不可恢复项仍在等待 | 查询契约不足与UI恢复策略不匹配 | 明确不可追回/临时查询失败；不自动新建生成，不重复扣费 |
| F009 | 历史成功任务节点仍显示loading的持久化线索 | 不能只凭数据库旧节点认定活动页面仍有bug；部分来自测试脚本未回写 | 补成功任务—媒体—当前task绑定—节点显示的逐层回归；替换任务不被旧结果覆盖 |
| F010 | 模汇上游504，text/html、nginx/1.31.1，约300—512秒 | 上游网关超时直接证据；最终生成是否继续未知 | 上游给异步创建/查询ID、结果保留和计费说明；平台不要盲目重提 |
| F011 | needs_review诊断变化并不总更新任务updated_at | 仅按updated_at的监控会漏报 | 已补观测脚本按诊断at查询；业务表时标契约需另行修复及测试 |
| F012 | 模汇408：adobe throttled / timeout_error / system under load | 该案例明确负载相关；不能替所有504做同因解释 | 对方关联requestId核查排队及下游Adobe状态；分类记录，不笼统报“未知ID” |
| F013 | 客户端499，后端却已创建任务并发上游 | 客户端断开不等于未提交 | 稳定clientRequestId幂等，重连先查原任务，禁止因499直接重生成 |
| F014 | 兔子400“请上传原图”，provider_start referenceCount=0 | 此请求没有参考图；不能证明传输丢图 | 核查节点连线、模型与生成/编辑路由；若模型必须原图，应在计费前校验 |
| F015/F016 | ModelBay部分请求总600秒中止；76699c0d已收到200，但声明3747066字节只读2100452 | 已证实“200后下载未完”；是平台截止触发，慢速发生于上游响应读取段，具体瓶颈归属待上游协查 | 分层记录生成等待/头/首字节/体读取；验证URL或异步契约；已有结果补存，不重复生成 |
| F017 | 10项17:30待确认任务人工收尾 | 是维护状态转换，不是同一时刻10个新上游故障 | 以逐项diagnostic为准；旧流水分类曾混写供应商，不直接复制旧说明 |
| F018 | 模汇403：token quota is not enough；remain ¥0.034754，need ¥0.152000；首次17:35:19；最终选定任务有17笔403，最后一笔截止前创建、18:11:24收到响应 | 明确渠道账户额度不足，不是OSS/OOM/CPU | 渠道负责人补额度；平台明确提示且不长期待确认；不擅自切渠道 |
| F019 | POST /api/image-tasks多次503，App ready200；部署代码显式503分支为候选全部冷却 | 渠道冷却是代码一致的解释；缺每次响应体/模型，不能逐条断言 | 入口日志补logicalModel、候选channel、cooldownUntil及原因；审核拒绝/额度不足不应混为瞬时健康失败 |

其他观察：Nginx client request body buffered to temporary file 是上传落盘警告，磁盘/inode正常，不能直接当上传失败。只读维护 SQL 的CRLF/行锁语法错误属于操作脚本错误，单列，不归为学生业务接口故障。

## 6. 关键案例：ModelBay“200了为什么还没图片”

### 案例 A：76699c0d-9314-4514-9850-491ac75d5036

- 上游 /v1/images/edits，gpt-image-2-5-sunburst。
- 428762ms取得HTTP200响应头。
- Content-Length=3747066，读取2100452字节（约56.05%）。
- 响应体读取170973ms，总请求约600秒，upstream_body_exception 为 request_signal_aborted / ResponseAborted。
- 未取得完整图片、有效可查询上游身份或对应媒体。平台人工收尾失败不证明供应商后台没有产物。

### 案例 B：59b6cc28-05ca-4d63-8b91-2bf2df3154ed（收尾时仍待确认）

- 创建17:53:25，约18:03:25总时限触发。
- 已收到上游HTTP200；Content-Length=3805199，仅读1314020（约34.53%），体阶段403510ms，首字节5712ms。
- result_payload只有reviewReason，不是完整结果；无resultURL、无payload.result、媒体记录0、上游任务/请求身份字段为空。
- 在最终报告收集阶段**没有再次修改这个节点**。按原有恢复流程结合供应商台账核查；确定无法补回再在授权范围内收尾，避免继续扩大本次人工改动。

两个案例都不能解释为“图片已经到OSS但是前端没显示”。日志中的失败阶段发生在上游响应读取、完整结果解析之前。

## 7. 人工操作审计：对“是不是你把它们都改失败了”的直接回答

**是，本次确实把76个原本待人工确认的任务结束为平台失败；这是用户授权的收尾动作，不是上游新发生76个失败。不是把成功任务改成失败。**

### 7.1 范围与依据

- 12批，共76项；批次时间16:05、16:26、16:33、16:51、16:56、17:02、17:08、17:18、17:21、17:30、17:55、18:03。
- 按 task_type=image、status=running、execution_phase=needs_review 选择；当前上游异常已结束，未发现完整结果、已注册媒体、成功生成日志或已配置可用的上游查询身份。
- 没有修改 success、正常submitting、result_ready，也未自动重提生成、重复扣费或切渠道。
- **备份范围重新全量核查：76/76项在修改前均running / needs_review，12个备份批次，无失配。**
- “未发现”限于已核对数据库、事件和媒体注册证据，不声称查尽供应商后台、原始缓存或所有临时文件。

### 7.2 操作方法与节点回写

通过平台既有 generation-operations image review 的 confirm_failed 路径做任务收尾、日志和退款流程；画布回写只匹配当前node.metadata.imageTask.id等于被关闭task.id。新任务或已替换节点不覆盖，原图片内容保留。

维护使用5分钟临时管理员Session，finally删除；没有改账号密码或角色。服务器修改前/后备份位于 /root/vozeb-classroom-maintenance/manual-class-close-<UTC时间>/ ，权限目录700/文件600。本报告不包含凭据、Session token或私钥。

保留 diagnostic manual_resolution、generation.manual_resolution 审计和 upstreamOutcome=unknown。对于451，原始拒绝日志保留，但通用“上游最终未知/切换渠道”文案不够准确，需要改为明确审核原因；**不把通用文案当原始供应商解释**。

### 7.3 平台积分精确对账

- 依据部署版本 system-ai-billing 的 NUL分隔SHA256键：userId、image-task:<taskId>:attempt:<n>、logicalModel、channelId、upstreamModel、image:create:<endpoint>。
- 不能用taskId LIKE搜索哈希键，也不能用payload.billing=null认定未扣费。
- 原17:13检查仅39项；本次扩展到**全部76项**，76笔消费匹配76项，退款通过source_record_id关联，全部净额0，无匹配遗漏、无净额非零项。
- 核查只读取账本，没有直接改余额。退款是平台积分，不宣称上游供应商收费被撤销。

## 8. 服务、资源与健康状态

| 项目 | 结束时状态/样本 | 含义 |
|---|---|---|
| 当前生产镜像 | sha-da37fcb5825ec0280d1641cf06d73190ced2c699 | App与Worker一致；仅报告，不部署 |
| Node堆配置 | --max-old-space-size=1024（App与Worker） | 不是总RSS硬上限，不可承诺无限并发 |
| 当前App/Worker | restart=0，OOM=false | 仅覆盖08:59启动后的当前实例，不否认上午旧实例重启 |
| 健康接口 | ready=200 | 表示平台健康，不保证所有渠道有额度/可用 |
| 午后App样本内存 | 约1015—1634MiB，结束约1.191GiB | 采样峰值，不是高频探针捕获的绝对峰值 |
| 午后服务器可用内存 | 样本最低4771MiB，结束5225MiB | 结束时无内存耗尽迹象 |
| 午后App CPU | 样本最高119.87%，结束0% | Docker多核百分比，不与兔子CPU92%混淆；最后低负载不能证明并发稳定 |
| 磁盘/inode | 44% / 19%，根卷剩余约27G | 没有观测到容量/inode瓶颈 |
| 数据库 | 结束连接2，lockWaits=0，无长查询/idle事务 | 没有观测到数据库锁阻塞；不证明瞬时从未出现 |
| 网络/IO | 任务与系统samples保留Docker累计NET I/O和Block I/O | 累计字节不是即时带宽；不能据此定位ModelBay慢速是哪端限速 |
| 系统结束前5分钟 | 无Nginx/App/Worker/Postgres/内核新错误 | 观察窗口结论；不是宣告所有已发生问题修好 |

证据文件保留周期采样与异常原文。重叠5分钟窗口会重复出现相同错误；本报告不把alerts行数直接当独立失败任务数。入口503、登录429、客户端499与任务错误统计必须分别对账。

## 9. 修复优先级与验收标准（未部署的建议）

### P0：下一次课堂之前

1. **渠道可用性与额度**：核实模汇额度、兔子容量与每模型配额；按已证实的契约配置，不在报告阶段自行改路由。
2. **交付与恢复**：完整图片结果可幂等补存OSS、可重启恢复、可补写当前绑定节点；未知提交不可盲重提，已完整结果不可重新生成扣费。
3. **平台OSS写入**：针对上午49项连接/超时做对象存储请求级诊断；限流/连接池/退避参数以实际供应商约束和测试证据为准，不能凭空固定3—5并发后宣布解决。
4. **明确终态**：额度不足、参数不支持、内容拒绝与提交未知分开；保留原文；待确认用户能看见原因和人工处理入口，不能无限显示生成中。
5. **ModelBay响应策略**：已有测试环境文生图URL返回能力证据，但生产参考图编辑未验证。按绑定/端点验证URL或异步协议；限制外链下载安全、TTL、MIME及字节数，持久化OSS，不把短效上游URL直接当最终交付。

### P1：稳定性与可观测性

6. 生成等待、连接、首字节、响应体读取、持久化分别定时和记账；采用已配置/合同超时，不无限延长600秒掩盖故障。
7. 在Worker出口按实际渠道/模型限额调度；前端每秒9张并未限制出口11张。超限日志保留Retry-After和未接单/可能接单区别。
8. 入口冷却记录逻辑模型、候选、截止时间及原因；复核额度/内容拒绝是否应影响整个channel+capability冷却。
9. 修OSS批量删除Content-MD5契约与删除一致性；设置事件SSE心跳与重连补查。
10. 修恢复409重复轮询和updated_at/diagnostic时间一致性；补跨重启任务恢复、幂等扣费/退款和旧结果不覆盖新任务的回归。

### 回归必须验证的层次

- 同模型文生图、1/多参考编辑、不同尺寸/画质；同时覆盖兔子、ModelBay和模汇，不能用一个渠道通过替代其它渠道。
- 用户发起 → 稳定clientRequestId → 平台taskId → 实际渠道模型/请求参数 → 上游status/requestId → 完整体/结果 → OSS对象 → 媒体记录 → 当前节点 → 刷新/重连可见 → 积分和上游计费对账。
- 429/503/504/403/400/451、体下载中断、OSS写失败、客户端断开、Worker/App重启、重复点击与旧任务被替换分别注入故障。
- 成功路径不出现pending残留；未知路径不重复生成；失败路径原因明确；恢复路径不双扣；供应商未返回查询ID时明确“不可自动追查”，不得伪造ID。
- 修复后必须再做与课堂规模一致的真实图文及持久化验收。**今日报告不构成“80人同时生图已经稳定通过”的结论。**

## 10. 证据索引与另外三份报告

### 10.1 主要证据（内部保管）

共同证据根目录：

    C:\Users\admin\Downloads\VOZEB-capacity-20260919\production-class-monitor-20261009\monitor-1791528279721

- 20261009-class-final-db-snapshot.json：最终任务统计、分模型状态、逐项diagnostic、人工审计。
- 20261009-final-76-backup-scope-audit.json：76项修改前状态及12批备份核查。
- 20261009-final-76-manual-billing-audit.json：76项精确消费与退款对账。
- 20261009-final-review-billing-input.json：最后待确认案例及对账输入。
- 20261009-class-final-server-state.txt：最后容器、堆配置及ready。
- 20261009-class-final-monitor-summary.json：采样资源范围、时标与去重规则。
- samples.jsonl / system-samples.jsonl / alerts.jsonl / system-alerts.jsonl：原始观测；latest.json / system-latest.json：最后样本。
- manual-close-summary.jsonl / manual-resolution-before.txt / manual-resolution-verification.txt：人工批次过程。
- findings.zh-CN.md：课堂实时流水，含旧时区/分类口误；最终判断以原始diagnostic和本报告修正为准。
- 20261009-1515-app-delete-errors.log、1518-response-format-evidence.jsonl、1519-modelall-502-evidence.json、1519-upstream-overloaded.json、1539-504-range.txt、1653-client499-task-correlation.txt、1701-modelbay-timeout.json、1718-modelbay200-uncertain.json、1740-upstream-quota.txt、1756-channel-rate.txt：各问题证据。文件名上述简写均指共同证据目录下完整20261009前缀文件。

上午证据：

- C:/Users/admin/Downloads/VOZEB-capacity-20260919/production-20261009-two-model-image/events.jsonl
- C:/Users/admin/Downloads/VOZEB-capacity-20260919/production-20261009-two-model-image/server-monitor.jsonl
- C:/Users/admin/Downloads/VOZEB-capacity-20260919/production-20261009-two-model-image-rerun/events.jsonl
- C:/Users/admin/Downloads/VOZEB-capacity-20260919/production-20261009-one-model-rerun/prod-one-model-20261009-1791507941997.jsonl
- C:/Users/admin/Downloads/VOZEB-capacity-20260919/production-20261009-one-model-rerun/prod-one-model-20261009-1791508781245.jsonl
- C:/Users/admin/Downloads/VOZEB-capacity-20260919/production-20261009-tuzi-rate9/prod-tuzi-rate9-20261009-1791511805629/task-snapshot.json

报告使用绝对路径便于同事本机查找；原始JSON可能有学生UID/画布身份，不直接发送供应商。提交工单仅取对应渠道的脱敏事件，不附账号名单、密钥、Session或完整签名URL。

### 10.2 本次四份交付

1. 本报告：D:/Claude code programe/VOZEB-PRO/VOZEB-PRO/docs/reports/2026-10-09-production-class-retrospective.zh-CN.md
2. 兔子：D:/Claude code programe/VOZEB-PRO/VOZEB-PRO/docs/reports/2026-10-09-upstream-tuzi-incident-report.zh-CN.md
3. ModelBay：D:/Claude code programe/VOZEB-PRO/VOZEB-PRO/docs/reports/2026-10-09-upstream-modelbay-incident-report.zh-CN.md
4. 模汇：D:/Claude code programe/VOZEB-PRO/VOZEB-PRO/docs/reports/2026-10-09-upstream-mohui-incident-report.zh-CN.md

相关既有能力/阶段验证：D:/Claude code programe/VOZEB-PRO/VOZEB-PRO/docs/reports/2026-10-09-modelbay-url-response-validation.zh-CN.md；D:/Claude code programe/VOZEB-PRO/VOZEB-PRO/docs/reports/2026-10-09-production-tuzi-rate-limited-image-test.zh-CN.md。前者是测试环境能力验证，后者是上午阶段快照；均不替代本次生产课堂终态。

## 11. 本次收尾交付边界

- 已按“下课了”停止持续监控，保存最终任务、资源、维护范围和积分核查证据，形成四份Markdown。
- 仅新增/核查文档和本地证据；本次报告收尾没有改业务代码、部署、重启、切渠道、发送付费重试或推GitHub。
- 存在1个下午及356个上午待确认，不宣称全部异常已恢复、全部图片已回写或所有问题已修复。
- 文档验证将核对UTF-8、敏感信息、任务数字和证据引用；业务接口/开发地图未改变，不因文档交付假称全量业务回归已通过。

### 文档门禁验证结果

2026-10-09 本次收尾执行：`pwsh -NoProfile -File "D:/Claude code programe/VOZEB-PRO/VOZEB-PRO/过程文件/验证开发文档.ps1"`，exit=0；validated_routes=426、validated_pages=59、validated_tables=143。已验证 `D:/Claude code programe/VOZEB-PRO/VOZEB-PRO/VOZEB-PRO-接口索引.md` 与 `D:/Claude code programe/VOZEB-PRO/VOZEB-PRO/VOZEB-PRO-开发地图.md`，本次未改变接口/页面/表结构，无需重生成这两份文档。四份交付另做严格UTF-8、敏感值及数字核验；不将文档门禁通过当作生图业务已修复。
