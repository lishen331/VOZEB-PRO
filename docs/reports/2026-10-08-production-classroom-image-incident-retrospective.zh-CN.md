# 2026-10-08 生产课堂生图故障复盘

> 状态：课堂已结束，监控最后一条采样为 2026-10-08 20:57:36（北京时间），课堂结束后已停止采样；21:02完成收尾只读核查。本文为只读调查与复盘，未修改生产配置/数据库、未重提任务、未推送或部署代码。所有时间均为北京时间（UTC+8），除非明确标注 UTC。

## 一、结论摘要

课堂期间生产站点可用（App `ready=200`、容器运行、主机资源正常），但**图片业务并不健康**。图像请求多数确实转发到上游，部分上游已返回 HTTP 200 和图片数据，平台却未交付。故障不是一个单一原因：

1. **完整响应后的本地处理异常**：兔子渠道及另一个图片渠道的任务收到上游 HTTP 200、完整响应体后，平台抛 `RangeError: Maximum call stack size exceeded`，任务转为 `needs_review`。具体触发函数/代码行尚未取得堆栈，不应宣称已定位到某行。
2. **ModelBay 大响应体中断/超时**：ModelBay 多笔任务收到 HTTP 200，开始传输约 2–8 MB 响应，随后 `upstream_body_exception: ResponseAborted` 或响应停在约 3.3 KB；平台拿不到完整结果，进入 `needs_review`。截图中的部分在途请求又跨越了 16:26–16:27 的部署重启，旧 Worker 租约过期后被保护性停下。重启是这批请求的直接中断因素之一，但不能解释部署前已经发生的全部响应体异常。
3. **上游内容安全拒绝**：兔子渠道返回 HTTP 451/内容策略错误。部分任务正确记为 `error`，另有明确 451 被平台归为 `needs_review / submission_outcome_unknown`，属于状态归类不一致。
4. **公开参考图读取异常**：App 日志反复出现 `Public prompt image unavailable fetch failed/timeout`；其与上述具体任务的因果关系尚未建立，应单独调查。

**不能把 HTTP 200 健康检查或上游消费日志等同于图片已经交付。**上游账单截图证明相应时间段有调用和费用，但单凭时间/模型不能一一对应每个本地任务及结果文件。

## 二、范围与量化

- 目标：`https://gammatv.gammablue-x.com/`；生产主机 `8.163.33.161:22222`，容器 `vozeb-pro`、`vozeb-pro-generation-worker`、`vozeb-pro-postgres`。
- 统计窗口：15:00–18:59 的图片任务（数据库 UTC 07:00–10:00）；共 **226** 笔：成功 **64**、明确失败 **17**、`needs_review` **145**、最终 `submitting` **0**。这不是“145 笔已确认上游成功”的意思。
- 按渠道/模型最终状态：

| 渠道 ID / 模型 | 成功 | 明确失败 | needs_review |
|---|---:|---:|---:|
| `hr5VKuKJKirZ1-sdRZPY5` / `gpt-image-2.5-sunburst`（兔子） | 51 | 0 | 69 |
| 同渠道 / `gpt-image-2` | 3 | 17 | 9 |
| `X9te4qOV0ZaPsJpErRRWS` / `gpt-image-2-5-sunburst`（ModelBay） | 7 | 0 | 65 |
| `_-eQ3SntRYtuDZz9mJ_OK` / `gpt-image-2-all` | 3 | 0 | 2 |

- 诊断事件按**任务去重**：66笔含 `Maximum call stack size exceeded`；39笔含 `upstream_body_exception`；13笔含上游 HTTP 451。事件分类可能重叠，不能相加当成不重复任务数。另有任务因租约中断转待审核，故145笔待审核不全属于上述三类。
- 本地积分流水在同一窗口：`system-ai` 消费234条、合计扣234积分；`generation-refund` 141条、合计退141积分。**这些是整个平台时间窗汇总，不是本次226笔逐任务对账，也不能推断净93积分全部应由用户承担。**例如 ModelBay 两笔待审核任务在09:37 UTC有 `response-refund` 记录，但仍需逐任务比对上游消费与平台扣退。

## 三、时间线与证据链

| 北京时间 | 事件 | 原始证据 / 解释 |
|---|---|---|
| 15:18–15:26 | 兔子渠道图片一部分成功、一部分转 `needs_review` | 任务 `3c09f20b-6853-40dd-85cb-978dc971618b`：上游200、完整约3.18 MB、平台成功；任务 `9c9e5466-0369-44d6-a059-58c01715ad48`：上游200、完整约7.26 MB，随后 `RangeError`，平台未交付。证明不是渠道整体断线。 |
| 约15:27–16:25 | 监控持续看到本地堆栈溢出、内容安全拒绝和 ModelBay 响应体超时 | 生产 `diagnostic_events` 与 App `docker logs`；部分窗口新任务 `needs_review` 多于成功。 |
| 16:19–16:22 | 截图中的 ModelBay 任务发起 | 例如 `4ab7bca0-b15f-4094-a2c8-7fdf44460032`、`d846d7e3-f55b-45fa-85df-ee1a86da3c9f`。诊断事件为 ModelBay `/v1/images/generations` 上游请求、HTTP 200、首段约3.3 KB，预期响应体约3.8–7.9 MB；未记录完整读取/平台持久化。 |
| 16:26:55 / 16:27:10 | App / Worker 切换新镜像 | `docker inspect StartedAt`；由 `sha-f7da1928...` 切至 `sha-3bd2bfde...`，容器 `RestartCount=0`，属于镜像切换，不是 OOM 自动重启。 |
| 16:28以后 | 截图任务旧 Worker 租约过期，转 `needs_review` | 所列任务数据库状态为 `running / needs_review / submission_outcome_unknown`，无上游 task ID、无本地结果。保护性停止自动重试以避免重复上游生成/扣费。 |
| 16:28–16:46 | 新镜像继续有 ModelBay 响应体异常 | 任务 `3280b205-c28d-4ea5-a2b9-5478a877a4bb`：上游200、预期3,417,620字节，读取到2,510,052字节后 `ResponseAborted`；`5f8ddad3-bdbe-4faf-a915-011eb9cf2148`：预期2,254,852字节，读到1,445,092字节后中断；均转待审核。 |
| 17:03 / 17:29 | 明确内容策略拒绝被误归为“结果未知” | `d6237a86-305e-4d30-a559-657b46ac27ee`：上游451、完整311字节错误体，最终 `needs_review`；`4aae315e-217c-4b50-9071-d1574eb702a3` 同类。另有明确拒绝正确进入 `error`，说明归类不一致。 |
| 17:15–17:38 | 新镜像仍出现堆栈溢出 | `dd98082e-c14a-44d9-9569-9b74f804aa09`（`gpt-image-2-all`）及两笔17:29 ModelBay任务在日志/诊断中复现。新镜像未彻底修复。 |
| 17:25以后 | 提交量下降，最终连续窗口没有新图片任务 | 每分钟监控JSONL的最近5分钟窗口为0；**零新错误不代表业务修复**。健康检查始终200，内存约5.9GB可用、根盘使用约39%。 |

## 四、故障类型、原因等级和影响

### A. 上游完整返回后堆栈溢出——已证实发生，具体代码行待定位

证据：`upstream_request` → `upstream_response=200` → `upstream_body_complete` → `transport_response=200` → `provider_exception` `RangeError: Maximum call stack size exceeded` → `needs_review`。失败示例响应约7.26 MB，成功对照约3.18 MB。不同渠道/模型均出现，指向平台通用大响应处理路径；“一定是某一处展开运算/递归/JSON处理”仍只是待验证假设。

影响：上游可能已经计算并计费，平台没有结果且停在待审核。需要拿到真正异常堆栈、用真实大小响应做回归，不应只靠小图片单测。

### B. ModelBay 响应体传输超时/中断——已证实发生，责任边界待确认

证据：上游 HTTP 200、`content-length`约2–8 MB，部分读到约3.3 KB，部分读到数MB后 `ResponseAborted`；新镜像日志 `System API proxy response body failed` / `The operation was aborted due to timeout`。无法仅凭日志断言是ModelBay主动断开、网络/代理中间层、平台读取/超时策略中的哪一项，需携带请求ID、连接与响应时间线联查两端。

影响：平台无完整图片、无可查询的上游任务ID时进入 `needs_review`。部署重启时的在途任务也落入该状态。自动重试会有重复生成和扣费风险。

### C. HTTP 451 内容安全拒绝及状态误分类——拒绝已证实，分类问题已证实

上游明确拒绝的任务应保留明确错误语义；现有一部分却包装为“提交结果未知”，不利于用户正确处理和退款对账。不能把它与未读完图片响应混为一谈。另有部分正常 `error`，修复时应覆盖不同提交路径。

### D. 参考图公开读取——日志已证实，因果未证实

`Public prompt image unavailable fetch failed` 和 `The operation was aborted due to timeout` 多次出现；需按 URL/任务ID/请求链路关联，排查 OSS、签名、代理、CORS/网络及限流。此次复盘不能仅凭并发日志断定它造成上述无参考图的生图失败。

### E. 部署对在途任务影响——这批截图任务有关，非全部故障根因

截图任务大多请求已发、上游有响应开头；镜像切换发生在读取结果过程中，旧 Worker 租约过期，新 Worker为防重复提交将其待审核。上游消费截图是收费线索，不足以证明平台完整收到结果，也不能凭截图手工置成功。

## 五、处理建议（按优先级）

1. **先保护现有任务和账务**：不要批量重提145笔待审核任务、不要直接改数据库终态。按任务ID、用户、项目、`clientRequestId`、渠道、模型、上游请求ID（如有）、消费/退款流水逐条对账。ModelBay截图中的具体任务无上游 task/request ID，但能用时间、令牌、模型、参数哈希和上游使用日志联系渠道支持查原图或退款；匹配前不要直接回填。
2. **修复大响应处理并验证**：为`provider_exception`记录脱敏异常堆栈（函数/行号），对 3/8 MB 及更大 base64 JSON 响应做压力/并发回归；从“响应完整→解析→持久化→Canvas回写”逐段打点，明确大响应内存峰值、超时和错误语义。修复后用生产小阶梯与平台/上游对账验收，不以单个小图通过作为完成。
3. **排查响应体中断**：与ModelBay核对上游 request ID/消费日志和响应体发出字节；检查平台 `AbortSignal`、代理转发、读取空闲/总超时、连接池、反向代理与并发。确保请求头200后能持续读到完整响应；如果不能，明确待审核并保留可恢复标识，不能盲目自动重提。
4. **修复明确拒绝的分类**：HTTP 451及已知内容策略错误应落明确失败，不得包装成未知结果；核查上游费用与平台积分退回。新增不同协议/路径的回归测试。
5. **部署门禁**：课堂在途任务高峰不要切镜像；发布前检查提交中任务数、Worker租约，等待排空或先做无损排水。部署后检查旧租约回收、待审核增量和结果恢复。不得通过强制重跑旧任务掩盖未知上游结果。
6. **参考图独立专项**：按失败URL和任务ID补充可访问性/签名/OSS/代理证据，与图片主体链路分开验收。
7. **业务监控门禁**：除live/ready外，按5分钟窗口监控图片成功率、`needs_review`新增、`upstream_body_exception`、堆栈溢出、451、提交超时、退款/扣费差异、未决任务年龄，并设置阈值通知。没有新任务时不得报告“已恢复”。

## 六、证据来源与局限

- 生产只读查询：`vozeb_pro_generation_tasks`、其 `diagnostic_events`、`vozeb_pro_point_records`；App/Worker `docker logs`、`docker ps`、`docker inspect`、`/api/health/ready`、`free -m`、`df -h /`。
- 分钟级原始监控：`C:/Users/admin/Downloads/VOZEB-capacity-20260919/production-20261007/classroom-live-monitor-20261008.jsonl`。原始文件包含任务汇总及资源状态，不含账号密码和API Key。
- 用户截图：`C:/Users/admin/AppData/Local/Temp/codex-clipboard-10fd2e26-fed5-4fe7-8d96-c8b827bf66d0.png`（ModelBay使用日志）；`C:/Users/admin/AppData/Local/Temp/codex-clipboard-9160bc35-b35a-4096-a771-ccda495efcd6.png`（平台生成运维任务）。截图是辅助证据，任务诊断和数据库是状态依据。
- 未取得上游每笔输出文件/费用的官方关联导出；未取得平台 `RangeError` 的代码堆栈；未修改配置、部署或对待审核任务人工恢复。因此本报告不宣称具体代码行已确认、不宣称所有待审核任务都能追回、也不宣称上游费用已逐笔核清。

