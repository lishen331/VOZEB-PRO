# 修复后回归压测执行计划（2026-10-06）

> 目标：在 2026-10-06 修复版本基础上，按原 10-08 课堂计划复测，并把修复前基线与修复后结果逐项对照。本文是执行门禁和证据合同；未通过前置检查的场景不得开始。默认不调用真实视频上游，不推送 GitHub，不修改生产配置。

## 1. 本轮范围与修复映射

| 修复/风险 | 本轮验证 |
|---|---|
| A1 session 瘦身 + `/api/model-catalog` + ETag/304 | 身份体积、匿名最小响应、目录冷/热/304、配置完整性、突发 p95/读取超时 |
| D6 upstream task/request ID、提交幂等、needs_review | 提交超时、断流、同键同参、同键异参、恢复查询、费用/任务账本关联 |
| A2 上传字节嗅探 | 合法 PNG/JPEG/WebP、伪 PNG、SVG、纯文本、dataUrl 与 multipart、跨账号读取 |
| 原有 C4/C5 限流 | 只测现状并记录；不自行改安全参数。分别区分用户/IP/视频在途拒绝 |
| 原有 B3 Gemini 协议 | 不进入真实付费压测；只做配置/错误状态验证 |
| 视频 | 独立 staging fixture App/DB/Worker/模拟上游；真实视频出站必须为 0 |

## 2. 通过标准

- P1-P8 前置检查全部有证据；任一阻断项标记 `NOT_READY`，只执行不依赖该项的本地 fixture 或只读场景。
- S1：80 个独立会话登录与画布加载；session p95 < 1.5s、响应体读取超时 0；匿名 session 不返回 logicalModels/systemChannels。
- S2：80 VU 混合 mock 图文视频 30 分钟；平台 5xx < 0.5%、无 OOM/重启、ready 持续 200、DB 无长排队。
- S3/S4：渠道溢出与预留释放；结束后 2 分钟活跃 reservation=0，Worker 重启后不泄漏，清理 SQL 只读演练后再执行获批清理。
- S5：上游 500/断流/延迟，任务进入明确失败或 needs_review；不得静默成功、无限 pending 或重复扣费。
- S6：共享出口限流只报告实际拒绝维度和比例；不伪造 IP、不修改安全阈值。
- S7：80 个 3MB 参考图上传+媒体读取，记录 413/429/5xx、p95/p99、OSS/本地存储路径；伪造媒体必须拒绝。
- S8：真实上游本轮默认不执行，除非负责人在本轮明确书面确认预算和渠道清单；不把 mock 结果当真实渠道容量。
- S9：修复后 80 VU 20 分钟课堂彩排，使用已确认逻辑模型或 mock，单独报告真实/fixture。

## 3. 前置门禁 P1-P8

1. P1：staging 镜像 SHA、运行代码与当前 develop 修复提交一致；数据库 schema 已迁移，`model-catalog`、D6 字段、上传校验路由存在。
2. P2：后台测试绑定并发上限可以保存；只改专用 LT mock 绑定，保存后恢复原值。
3. P3：读取 `VOZEB_PRO_TRUSTED_PROXY_HOPS`、nginx真实配置与出口IP策略，不改值。
4. P4：读取 nginx `client_max_body_size`、上传服务限制和实际存储配置。
5. P5：记录 App/Worker/DB pool/max connections/lanes/CPU/RAM/磁盘；应用 pool waitingCount/idleCount若无入口标缺失。
6. P6：确认 staging 媒体写入 OSS 或本地路径，磁盘至少保留 20GB；不足则阻断大文件 S7。
7. P7：导出课堂逻辑模型、绑定、upstreamModel、并发上限；不覆盖全部目录。
8. P8：确认 staging 与生产真实 key 是否隔离；若共用，S8 禁止，其他场景使用 fixture。

## 4. 执行顺序与职责

唯一主控调度：S0→S1→S2→S3→S4→S5→S6→S7→失败项回归→S9。A 负责接口/浏览器与RPS，B 负责服务器/DB/Worker/OSS证据，C 负责视频fixture/任务账本/故障注入；子Agent不得各自叠加压力，所有请求由主控manifest和唯一runId发出。

每个请求贯穿：`runId → accountAlias → operationId → projectId → clientRequestId → platformTaskId → channel/binding → upstreamRequestId/taskId → mediaKey`。日志不得写密码、cookie、key、签名URL、完整prompt或Base64。

## 5. 场景矩阵

| 场景 | 负载 | 关键证据 |
|---|---|---|
| S0 | 1 VU smoke：session/catalog、画布、文本/图片/视频fixture、上传 | 每类链路可完成、监控落盘 |
| S1 | 80 VU 60s 登录；复用会话加载画布；匿名/登录 session 对照；catalog 冷/热/If-None-Match | 体积、304、p95/p99、超时 |
| S2 | 80 VU mock 混合30min：文本/图片/视频各按业务比例，任务排空 | 5xx、任务成功/失败/needs_review、资源曲线 |
| S3 | 80 VU 图片突发，mock A/B/C 并发上限10/10/5 | 溢出、429、reservation、fallback |
| S4 | S3后静置2min、Worker重启一次、重复S3 | reservation释放、孤儿、恢复 |
| S5 | mock A：30% 500、10%断流/延迟，B正常 | failover、needs_review、无重复计费 |
| S6 | 80同出口正常节奏+突发；不改限流 | 429维度与比例，安全参数现状 |
| S7 | 80×3MB multipart + dataUrl；媒体代理缩略图读取 | 上传/读取状态、类型校验、p95/p99、存储 |
| S8 | 默认跳过真实上游；记录未执行原因 | 预算/隔离门禁 |
| S9 | 80 VU 20min课堂彩排；修复后全路径 | 最终健康和课堂SLO |

## 6. 停止条件

真实视频出站、生产域名命中、跨账号泄露、未知任务自动重复、重复扣费、OOM/重启、ready失败、磁盘低于10%或5GB、DB锁等待超过30s、监控中断、S2错误率超过5%持续1分钟、S7上传异常扩大，立即停止新增并排空。单个明确失败不停止其他独立场景；needs_review不重试并进入证据账本。

## 7. 交付物

- 本计划；
- `docs/reports/2026-10-06-fixed-regression-load-test.zh-CN.md`：P1-P8、S0-S9逐项结论和修复前后对照；
- 脱敏 JSONL：请求、任务、reservation、资源、费用/退款、fixture出站计数；
- 视频故障与课堂应急手册；
- 明确列出未执行真实S8、未覆盖项、需负责人决策项。

## 8. 不允许的做法

不推送/合并/部署；不改生产或全局限流；不把本地fixture吞吐冒充真实上游；不使用 force click 或伪造IP绕限流；不因网络抖动重复提交未知任务；不删除原始证据。
