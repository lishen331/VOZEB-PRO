# 生产课堂持续监控：问题与证据

监控开始：2026-10-09 14:43（Asia/Shanghai）。仅做读取、日志核查和本地证据留存，不自动重启、部署、修改配置或重提生成任务。

## F001 后台配置事件 SSE 空闲超时（历史异常）
- 证据：生产 Nginx error.log 中 `/api/admin/settings/events` 多次 `upstream timed out (110: Connection timed out) while reading upstream`。
- 发生时间：2026-10-09 10:01:21、10:04:35、10:21:31、11:36:07、12:36:10、13:36:14、14:07:28。
- 生产镜像：sha-da37fcb5825ec0280d1641cf06d73190ced2c699。
- 对应版本 route.ts：首次发送 `: connected`，后续仅订阅 settings-updated，没有定时保活。
- Nginx：proxy_read_timeout 3600s，proxy_buffering off。
- 判断：长连接空闲超时有直接日志证据；缺少周期心跳与超时相符。客户端通知是否永久失效尚未实测，不扩展成所有业务异常。
- 建议：SSE 每15～30秒发注释心跳；断开清理timer/subscription；核验浏览器自动重连及revision补查。需独立测试后再部署。

## 排除：监控命令自身错误
- 14:43:13 UTC+8 左右只读 psql 命令因 PowerShell CRLF here-doc 结束符处理出现 `syntax error at or near SQL`。
- 属于监控命令问题，不是平台保存/生成业务错误；后续改用直接 stdin SQL，查询成功。

## 基线（14:47）
- App、Worker running，App healthy，ready=200。
- App/Worker 从08:59紧急堆配置调整后RestartCount=0。
- App容器约1015MiB，服务器可用内存约5425MiB。
- 磁盘44%，inode19%。
- 最近5分钟Nginx访问32次均200，无新代理错误；数据库连接3，锁等待0，长查询0。
- 最近15分钟没有新增生成任务，低负载不能证明高并发稳定。

## 持续证据
- samples.jsonl：资源、生成任务、上游和存储异常。
- alerts.jsonl：新增任务异常。
- system-samples.jsonl：全站HTTP、代理、运行时、Worker、数据库、内核、inode和socket状态。
- system-alerts.jsonl：新增系统异常。
- latest.json / system-latest.json：最近观测状态。

## F002 画布删除接口500：OSS批量删除缺少Content-MD5（确认故障）
- 发生时间：2026-10-09 15:08:32、15:08:41、15:08:53，15:11:37再次出现。
- HTTP证据：DELETE /api/canvas/projects 在15:08:41、15:08:53返回500。
- 应用证据：`MissingArgument: Missing Some Required Arguments`；httpStatusCode 400；ArgumentName Content-MD5；EC 0016-00000606。
- OSS request IDs：6AC892F02836363338DFEF07、6AC892F921D3443231A89469、6AC8930554FAD73339590646、6AC893A921D3443832D3716A。
- 生产代码证据：da37fcb版本的object-storage-client.ts中deleteObjectBatch使用DeleteObjectsCommand，未显式设置OSS所需Content-MD5；deleteExternalMediaObject调用deleteObjects删除原图和预览变体；canvas项目DELETE路由未知错误直接throw。
- 结论：OSS拒绝删除请求导致删除接口500；不是生成失败或App重启。
- 建议：在实际序列化的批量删除请求上正确补Content-MD5（或小并发逐对象删除作为经验证的替代），测试原图+预览清理；检查数据库/项目删除顺序以避免部分删除；提供用户可理解的错误和可恢复清理任务。
- 未执行任何删除复现或生产代码修改，避免破坏学生数据。

## F003 登录频繁：同账号连续凭证失败后触发限流（当前证据不支持全班误限流）
- 账号25990163，同一移动网络出口112.96.82.219。
- 15:08:26～15:08:56先8次用户名/密码不正确，随后15:08:56～15:10:17共50次rate_limited。
- 15:10:53同账号已登录成功。
- 同期其他学生账号成功，不把本次判断为共用IP导致全班无法登录。
- 建议：前端登录进行中的按钮禁用、限流Retry-After倒计时、明确凭证错误提示；继续观察其它账号是否误限流。

## 覆盖边界
- 服务端监控覆盖HTTP/代理、任务/上游/OSS、App/Worker/Postgres、内核、CPU/内存/磁盘/inode、数据库连接/锁。
- 未上传到服务端的纯浏览器JS异常不能仅凭服务器日志完整观察。当前app-providers.tsx对chunk错误主要做reload，没有在该位置看到服务端错误上报。此项为观测缺口，不声称已发现浏览器bug。

## F004 ModelBay参考图编辑拒绝response_format（确认参数兼容故障）
- 时间：15:18:26。
- taskId：839b28f3-98a7-4e8c-8052-4ad8e8842aa6。
- 模型gpt-image-2-5-sunburst，渠道X9te4qOV0ZaPsJpErRRWS；与兔子gpt-image-2.5-sunburst不可混同。
- upstream URL：https://api.modelbay.io/v1/images/edits。
- 实际请求：multipart 1张1,687,653字节PNG，size1024x1024，n1，response_format=b64_json，output_format=png。
- 上游400，Unknown parameter: response_format；request id 2026100907180635810734996e93ae3kLC264Nr。
- 建议：为该渠道/模型/编辑端点配置参数白名单；去除不支持字段后验证结果解析；不要全局改其它渠道。

## F005 模汇上游连接超时，不是上游HTTP502（确认网络/连接失败）
- 时间15:19:09，taskId c31ecf2c-187a-496b-85e6-b9bc5808c33b。
- upstream https://api.easyart.cc/v1/images/edits，gpt-image-2-all，1张1,797,277字节PNG参考。
- upstream_exception：UND_ERR_CONNECT_TIMEOUT，api.easyart.cc:443，timeout10000ms，duration10407ms。
- 平台代理将错误转为502，用户任务进入needs_review，没有upstream ID；没有证据证明上游收到提交。
- 建议：检查DNS/TLS/TCP出站与连接池；区分连接前失败与提交后结果不确定，只有能够证明未提交时才安全重试；保留错误cause给用户运维。

## F006 兔子自身CPU过载503（确认上游拒绝）
- 时间15:19:48，taskId 7d271a43-9ed4-4537-93d3-ed50d6536173。
- upstream https://api.tu-zi.com/v1/images/generations，模型gpt-image-2。
- status503，duration297ms，errorMessage：system cpu overloaded (current:92.1%, threshold:90%)。
- upstream requestId：202610090719484330082578268d9d6DQyVSbT8。
- 这是上游CPU报告，不是生产服务器CPU。
- 任务needs_review，未自动重提。
- 建议：上游调整资源/容量与准入阈值；平台渠道级排队/退避/熔断及备用渠道策略；根据上游明确的是否接单语义区分可安全重试与结果未知。

## F007 兔子内容审核拒绝（业务拒绝，不直接认定平台bug）
- 时间15:19:43，taskId f786abb9-13f1-46c6-83dd-a0d687289fd4，模型gpt-image-2。
- upstream_response status400；上游明确返回提示可能违反内容政策。
- upstream requestId 202610090719265650786038268d9d6ZyczHNQk。
- 不自动改写提示词，不绕过审核，不自动重提；只记录拒绝并核对平台错误展示/账务（当前还没有退款结论）。

## 15:21持续监控快照
- 最近15分钟新生成任务8个：4个success，2个error（ModelBay参数不支持/兔子审核拒绝），2个needs_review（模汇连接超时/兔子过载）。
- App/Worker从08:59以来未重启；ready=200，可用内存约5373MiB，磁盘44%。
- 未收到用户“下课了”，监控保持运行，不代表任务结束。

## F008 needs_review不可恢复时前端持续自动追回409（确认状态呈现/恢复策略问题）
- 15:22:13起，任务c31ecf2c-187a-496b-85e6-b9bc5808c33b的POST /api/image-tasks/{id}约30秒一次409；另一个7d271a43-9ed4-4537-93d3-ed50d6536173亦同。
- 数据库：两者execution_phase=needs_review，upstream_task_id/upstream_request_id列为空；画布目标节点status=loading，仍有imageTask绑定。
- API POST action=recover：没有上游ID且无法requestId查回时返回409“原任务没有保存上游任务ID，无法安全追回结果”。
- 生产版canvas-generation-feedback.ts：isCanvasGenerationRetryable在options.review为true时，对非terminal错误无条件return true；前端10分钟图片等待兜底，不是无限永远等待，但期间会无效恢复。
- 建议：返回结构化recoverability/errorCode，明确区分无ID永久不可自动追回与暂时查询失败；停止无意义恢复循环，UI显示待核查及原任务信息，不能将未知任务直接改失败/自动新建扣费。
- 非本监控发起的业务POST，监控只读。

## F009 已成功任务节点仍loading（不一致线索，尚不能判定活动页面bug）
- 查询发现13:49创建、13:50成功的两个正常编辑任务8f0b7812-8196-43a6-984d-3b1c6eed470b和c5cca58f-a709-495c-a717-71617e83c8fe。
- 所在canvas-dXzPUiUf_74VljFc0zM4o的节点仍loading且绑定同一任务，项目最后保存13:49:08。
- 因页面可能已关闭、前端未回写，当前无浏览器证据，不认定用户现在仍看不到，也不手动改学生数据。
- 建议：确认页面重新打开恢复机制；仅在确认为恢复失败后修复。与本次脚本创建节点遗漏关联的已知问题区别对待。

## F002重复发生
- 15:22:14 DELETE /api/canvas/projects再500；同一时间App MissingArgument/Content-MD5，表明尚未在当前生产版修复。

## F010 模汇同步请求约300秒后上游网关返回504（确认上游网关超时）
- 15:32:41 task b30197c0-4dfa-413f-828f-3e7f80eeca7c：/v1/images/edits，303858ms。
- 15:32:53 task a48ffea4-6fe0-451b-8cb8-2bd6e7516120：/v1/images/generations，300442ms。
- 共同模型gpt-image-2-all，upstream host api.easyart.cc，response504 text/html，正文504 Gateway Time-out / nginx1.31.1。
- 与F005区别：这次有上游HTTP响应，不是客户端连接前失败；不能说生产Nginx300秒超时（生产配置3600秒），证据来自上游响应。
- 状态needs_review，无可查询上游task ID；不自动重提。
- 建议：联系上游定位网关300秒截止/长时生成服务，优先使用该渠道实际支持的异步submit+taskId+poll；增加requestId结果追查；不要仅拉长平台等待时间，因为上游已经返回504。

## F010影响范围更新（15:39核查）
- 自15:00以来模汇HTTP504已确认5个：b30197c0、a48ffea4、2e4328d5、3be6725b、514b1d77（完整ID见20261009-1539-504-range.txt）。
- 其中images/edits4次、images/generations1次，response发生15:32:41～15:35:35。
- duration分别303858、300442、367753、380943、365276ms；仅前2例接近300s，不声称所有上游均固定300s截止。
- 截至15:39模汇任务：10成功、6needs_review（其中5例504+1例连接超时）、2提交中；兔子gpt-image-2已有5成功，不能泛化所有渠道不可用。

## F011 任务updated_at不能完整反映异步诊断变化（确认观测字段不一致）
- b30197c0任务updated_at仍15:27:37，但诊断明确15:32:41已上游504并needs_review。
- a48ffea4updated_at仍15:27:53，但诊断15:32:53已504。
- 仅按任务updated_at增量读取会漏异步阶段变化；当前监控已修订为读取诊断事件at，而不是仅按updated_at过滤，并补查最近15分钟事件。
- 只修改本地监控脚本；没有改生产库记录/服务代码。
- 建议：正式状态转换同步维护updated_at或独立state_changed_at/event游标，并覆盖终态/needs_review/轮询更新时间；排查依赖updated_at的运维排序与增量查询。

## 16:05人工收尾（用户明确授权，非上游新失败）
- Run manual-class-close-20261009T080518Z；仅处理12:00后created、当前needs_review的14个image任务。
- 修改前备份证明14/14 running+needs_review；没有success/正常submitting任务被收尾。
- 每项查无upstream任务/请求ID、结果URL、payload.result、task对应媒体注册、成功generation日志；无法用现有信息安全追回，未调用上游新生成。
- 通过现有POST /api/admin/generation-operations/image/{id}/review confirm_failed完成14/14；调用正式failure/refund/log/attempt流程，不直接伪造成功或上游结论。
- 仅表示“平台未取得结果，本次结束”；upstreamOutcome明确unknown，保留原诊断。
- 临时后台维护session已删除；没有更改任何用户权限/密码。
- 项目行加锁，仅更新仍imageTask.id匹配旧任务的node；实际只有1个节点仍绑定，其他13个已无旧绑定（可能超时清除或用户重新生成），不覆盖新任务。
- 14/14 error/completed/manually_failed；已清除所有旧节点绑定；插入14条generation.manual_resolution审计。
- 这14个payload.billing均为空；未凭空增加/扣除积分，也不声称已退款（无receipt需要进一步对账时再查流水）。
- 服务器备份 /root/vozeb-classroom-maintenance/manual-class-close-20261009T080518Z 权限700，文件600；本地manual-resolution-verification.txt留存结果。
- 数据库FOR UPDATE聚合语法错误来自本次维护脚本，事务整体回滚，随后改为锁具体项目id并成功提交；不归类为业务数据库bug。
- 用户16:08截图中的失败条目为本批人工状态变更，不是一批新的上游故障。

## F012 模汇返回更底层408负载错误（新证据）
- 16:24:46，上游task dd4d4afb-8de2-4e67-b036-cf7f09772d41 / gpt-image-2-all / images/edits。
- upstream_response 408，duration136525ms；requestId20261009082230191783892UZP2gonEonim4mVq。
- 明确消息：adobe throttled: status408 retry-after=none envoy=false {error_code:timeout_error,message:system under load}。
- 这是上游返回文本，不扩大推断为所有504一定相同内部原因；说明当前至少一个上游下游负载异常。
- 任务列upstream_request_id为空而诊断含requestId；先检查查询契约，不盲目重提，不修改成功任务。

## 16:26第二批人工收尾
- Run manual-class-close-20261009T082608Z。
- 17个eligible，17个现有review API成功，17/17 error/completed；无剩余旧节点绑定，5个当前旧节点更新error。
- 仅处理needs_review+已证实网关/连接失败+无上游身份/结果/媒体/成功日志的任务；408这一条初步不在已审查故障类别中，明确跳过单独调查。
- 原始快照与审计留存；不将成功生成或正在正常运行任务标失败，不自动修改渠道/部署/重启。
- 16:27课堂15:00后总100：64成功，35失败（含14+17人工收尾），1待确认，0正常进行中。此时交付率64%，不是按模型上游“可能生成”算成功。

## F012收尾（16:33）
- 渠道advancedConfig.queryPath、taskIdField、requestIdQueryPath没有可用追查契约；无upstreamTask ID、结果URL、本地媒体。
- 请求ID本身不是结果地址/生成任务ID，不猜接口，不以新生成替代追回。
- Run manual-class-close-20261009T083324Z，1个dd4d4afb通过现有review API人工结束，error/completed；旧node binding0，未覆盖当前节点；session删除。
- 保留原有408与requestId，upstreamOutcome=unknown；不声称上游未生成。
- 当前累计人工收尾14+17+1=32，不与自然失败混淆，统计报告应分别列出。

## F013 客户端499与已提交任务并存（确认连接中断，不能推断为未提交）
- 16:47:43、16:47:52 /api/image-tasks 499，canvas-IGemprQl7VrZOS3Txe6qm。
- 其中16:47:43已创建aa97e14c-c352-445b-a59c-66781b9a73bd，diagnostic upstream_request=1791535663771，仍submitting；未人工改失败。
- 同node此前f49c0cd5-c605-46ee-bcbe-4364fb3c9efa已成功。有两个不同clientRequestId，不直接认定重复点击原因，提示返回中断不能当未提交。
- 16:49:06 canvas-jq3wJvUgQPdpuoN9swJRk /api/reference-assets多次499；需浏览器网络/取消原因进一步核查，不能凭499判断服务器Bug。
- 建议：客户端提交结果未知时沿用clientRequestId查找已有任务，避免盲重新创建；上传连接中断可恢复提示，取消与超时区分。

## 16:51第四批人工收尾
- Run manual-class-close-20261009T085129Z；2个needs_review无可恢复结果/ID任务：ca40fad6-82ee-47cb-bd54-d86186cce79d和ddc12752-f054-43de-bc24-f3cb4ee64a07。
- 2/2现有review API成功，error/completed，剩余旧绑定0，1个当前节点写error；其余学生已替换/结束的节点不覆盖。
- 累计人工收尾34；原始快照与审计保留，不改变上游最终未知事实。

## F014 兔子返回“请上传原图”的400（确认缺参考输入，UI原因待核）
- 16:55:30 task b6e86177-341c-4a3d-ba5d-60e1daace0be / gpt-image-2 / images/generations。
- provider_start referenceCount=0、kind=generation，上游返回400“请上传需要去水印的原图”。
- 不认定参考图在传输中丢失：服务器接收和上游请求都没有参考，需核查用户当时是否连接图片及前端编辑模式路由。
- requestId202610090855192546487378268d9d6nU2AA7dn；本项自然error，无人工冒充生成结果。

## 第五批收尾（16:56）
- manual-class-close-20261009T085640Z：b9c6b633-c9ae-43f8-b9cc-b209268a8ea6，上游504无结果/ID，1/1结束error，旧绑定0。
- 累计人工收尾35个（14+17+1+2+1），与自然失败区分。
- 16:51兔子ddc12752已503 CPU92.6%过载，为第四批处理的2个之一，不重复计数。

## F015 ModelBay 600秒请求中止（确认平台请求等待超时）
- aa97e14c-c352-445b-a59c-66781b9a73bd，16:47:43请求ModelBay images/edits，2张JPEG参考合计约4MB，模型gpt-image-2-5-sunburst。
- 16:57:43 upstream_exception ResponseAborted，duration599706ms；provider_exception operation aborted due to timeout。
- 没有upstream_response、无结果/本地登记媒体、无upstream taskId/requestId；不能说ModelBay返回HTTP504，也不能证明上游最终未生成。
- 建议：核实ModelBay异步任务/结果追回契约及连接超时配置；不只无限拉长等待，保留请求ID、阶段及可恢复元数据。

## 17:02第六批人工收尾
- manual-class-close-20261009T090237Z，3/3errorCompleted，旧绑定0，当前旧节点1更新error。
- aa97e14c和两条新needs_review任务7c5aeb6f、1d84d7e6均经同样的无结果/无上游身份核验，原始快照保留。
- 累计人工收尾38个。当前仍正常submitting任务没有被批量修改。
- 17:02统计：15:00后189任务，123success，44error，1needs_review，21进行中。动态数值非最终结论。

## 17:13个人积分精确对账（纠正空billing无法判断扣费）
- payload.billing=null、任务ID LIKE没有结果不能证明未扣费：实际point idempotencyKey为system-ai:<sha256>。
- 使用生产systemAiPointsIdempotencyKey公式SHA256([userId,businessRequestId,logicalModel,channelId,upstreamModel,callType].join(NUL))，businessRequestId=image-task:<taskId>:attempt:<n>，实际transport path确定callType。
- 用153/153成功任务匹配扣费记录验证映射方法覆盖。
- 39/39人工收尾任务找到原consume(-1)与以source_record_id链接的refund(+1)，逐笔net0，无未退余额。
- 退款在system-ai代理层完成，不是仅靠后续manual_failure；后台0积分不代表没有发生过消费。
- 证据20261009-1713-hashed-billing-audit.json含精确记录，未修改任何积分。

## 17:08第七批人工收尾
- manual-class-close-20261009T090832Z，1个f3416406上游504已needs_review，无结果/ID；1/1errorCompleted，旧绑定0，当前旧节点0。
- 累计人工收尾39个，原始备份/审计保留。

## F016 ModelBay 200但响应体中断与451内容安全收尾
- aa97e14c等ModelBay任务曾收到upstream_response 200，但upstream_body_exception ResponseAborted，声明3.75MB仅读2.10MB，之后超时；无完整结果/任务ID，已于manual-class-close-20261009T092148Z结束error。
- 98adc0e9兔子451内容安全拒绝，已明确结束error；不归为可恢复上游任务，不自动改写提示词。
- 本批新增4个needs_review：2个响应体中断/无结果、2个内容安全或网关无结果；全部通过既有人工失败流程，2个仍绑定旧node已写error。
- 当前统计需将自然失败、人工收尾、上游未知分别展示。

## F017 17:30批量待确认任务处理
- 10个任务均无上游可查询ID和完整结果：7个模汇ResponseAborted（约600秒等待）；1个ModelBay响应体中断；2个兔子451内容安全。
- 通过manual-class-close-20261009T093051Z现有人工失败流程处理10/10，error/completed；保留原始body/请求事件，旧画布绑定0，1个旧节点写error。
- 非正常submitting/成功任务没有被处理。

## F018 模汇渠道Token额度耗尽（17:40确认）
- 生产上游api.easyart.cc持续返回HTTP403。
- 明确错误：token quota is not enough；token remain quota ¥0.034754，need quota ¥0.152000。
- 09:30后至少13个任务收到同样403（generations/edits均有），属于渠道账户额度问题，不是本平台内存/OSS/服务器CPU。
- 处理建议：立即补充上游Token额度或停用该模型绑定/切换渠道；在平台侧应把额度不足识别为确定性失败，阻止继续排队，并展示渠道额度不足，不进入needs_review长等待。
- 17:40动态统计：309 image任务，217 success，80 error，8 needs_review，4 active；未将needs_review当成功。

## F018持续更新
- 17:43又有新任务确认模汇403额度不足，同一剩余额度¥0.034754、单次需要¥0.152000；上游额度未恢复。
- 生产应用继续健康，无重启/OOM；不能继续把模汇gpt-image-2-all作为可用渠道。
- 仍有正常submitting/result_ready任务，监控不修改这些任务。


## 当前动态状态（北京时间 2026-10-09 17:57:00，尚未下课）
- 15:00以后图片任务：343；成功242，失败96，待确认1，正常进行中4。
- 累计人工收尾72个（明确区别于上游新失败），没有修改成功/正常进行中任务。
- 模汇额度不足403累计16；首次北京时间17:35:19（此前09:30为UTC误述，已向用户纠正）。
- goal仍active，两个监控进程持续运行；未收到下课停止指令。


## F019 平台入口503与渠道冷却（日志事实+代码推断）
- 17:53:17、17:55:28、17:56:02/05/10/15 POST /api/image-tasks返回503，App未重启，ready200。
- 生产版本da37fcb的image-tasks/route.ts中唯一显式503分支：所有已配置候选channel处于runtime cooldown，返回“当前模型暂不可用，请切换模型或稍后重试”。
- channel-runtime-health.ts：同channel/capability连续失败3次开始30秒冷却、指数增加上限5分钟。
- 因Nginx访问日志不含响应正文/请求模型，不将每个503直接归因某个具体模型；需响应体或客户端证据进一步确认。
- 建议：入口错误日志明确logicalModel/channel/cooldownUntil，区分quota、审核拒绝、网络超时；审核类拒绝是否应触发整个渠道熔断需专门评估；不擅自清除生产冷却状态。

## 17:55人工维护范围
- Run manual-class-close-20261009T095517Z：14个当前needs_review、无可恢复身份/结果的任务通过review API收尾；14error/completed、旧binding0、2当前旧node更新error。
- 累计人工处理72项，待确认与正常submitting严格区分，不覆盖已替换节点。
- 服务端备份与逐项API/节点验证保留。

## 18:03动态监控与收尾
- manual-class-close-20261009T100323Z：4个新增/未收尾needs_review，均已无完整结果/可查询上游身份，4/4平台error/completed，3当前旧节点更新error。
- 模型响应体超时仍持续，不与正常HTTP200入口混淆；未修改3个正常进行中任务。
- 15:00后346个图片任务：243成功、100失败、0needs_review、3进行中；服务ready200、未重启。
- 未收到“下课了”，保持两套监控及证据留存。
