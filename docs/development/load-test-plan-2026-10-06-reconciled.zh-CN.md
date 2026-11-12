# 80人课堂目标 / 120余量：修复后整轮压测计划（与旧主计划合并版）

日期：2026-10-06（Asia/Shanghai）

> 本文以 `docs/superpowers/plans/2026-09-19-staging-capacity-80-users-120-concurrency.zh-CN.md` 为主计划基线，完整保留其 120 独立账号、接口矩阵、P0-P5、S0-S9、全链路监控、视频零真实出站和停止条件；再叠加 Claude 10-06 修复设计中的 A1/D6/A2 回归项。旧计划不被删减或替代。

## 1. 本轮目标

- 判断测试环境能否支撑 **至少80人同时使用而不出现重大平台故障**；
- 同时测120独立账号余量，但不把120账号自动等同于120个真实浏览器；
- 发现问题优先，真实证据贯穿浏览器/API→平台任务→Worker/DB→mock上游→媒体落盘；
- 默认使用隔离mock上游；真实S8仅在负责人另行明确预算、模型和渠道后执行；视频真实创建与费用恒为0。

## 2. 必须保留的旧计划范围

旧主计划接口矩阵全部保留并按场景取舍：登录/session、school context/compute、canvas项目列表/创建/详情/保存、reference-assets及媒体读取、media-proxy、text/image/video任务及查询/取消/恢复、practice入口（单独分组）、内部代理仅观察、Worker heartbeat/maintenance仅观察。删除/资产、充值、权限、渠道同步等管理接口不作为高频稳态。

并发口径：80人课堂目标；120独立账号余量；图片业务上限10、视频业务上限2作为业务边界，不把它们理解为全局压测总并发。区分VU、HTTP在途、生成任务在途和上游attempt。

## 3. 修复项新增验收

### A1 session/model-catalog

匿名session不得返回 `logicalModels/systemChannels`；登录session身份响应目标≤10KB；model-catalog登录态完整、ETag/304有效，配置字段与V store一致。记录冷缓存、热缓存、条件请求和配置变更后生效时间。

### D6提交幂等与未知结果

提交前先持久化clientRequestId/幂等键；上游返回过的request/task ID必须保存；提交断流进入needs_review而非submitting僵尸；同键同参不重复创建/扣费，同键异参按契约拒绝或明确新操作；不确定结果不自动盲重试。

### A2媒体校验

multipart和dataUrl统一按字节嗅探；合法PNG/JPEG/WebP等通过；伪PNG、SVG/纯文本声明PNG、截断内容拒绝；跨账号/匿名读取必须隔离。

## 4. P0前置检查

P0-A：staging live/ready、镜像SHA、数据库Schema、Worker健康、reservations表与generation_tasks追踪字段。
P0-B：120账号/权限/积分/执行档案核对；会话可复用，登录限流单列不混入生成容量。
P0-C：mock渠道/逻辑模型专用绑定，视频fixture从App、Worker、查询、回调、媒体读取全链路有效，真实出站审计为0。
P0-D：主机CPU/RAM/swap/disk/inode/网络、容器重启/OOM、Postgres连接/锁/WAL、Worker心跳、OSS/本地存储路径；缺失指标显式标记。
P0-E：负载机自身CPU/RAM/带宽/调度延迟校准；所有run使用唯一runId，原始JSONL不覆盖。

如修复版本与staging SHA不一致，仍可先做只读、fixture和旧行为基线，但报告必须分为“当前线上版本结果”和“修复版本结果”，不能混称修复后通过。

## 5. 统一学生行为模型

每个VU独立普通Canvas项目；打开session和项目列表/详情；按节奏循环读取与保存；约70%文本、20%图片、10%视频fixture行为；图片按每次1–3张参考图分档；少量用户刷新/重连/取消。S2/S9稳态运行30/20分钟，S1登录后复用Cookie。

## 6. 场景顺序

| 场景 | 负载与时间 | 主要问题 |
|---|---|---|
| S0 | 1 VU完整冒烟 | 每类接口、任务、媒体、mock fixture可完成 |
| S1 | 80 VU 60秒登录，10秒内加载画布；120只读余量 | session体积/p95/超时、首屏接口 |
| S2 | 80 VU混合30分钟，mock文本/图片/视频 | 5xx、任务终态、资源、DB、Worker、长尾 |
| S3 | 80图片突发；mock渠道A/B/C并发10/10/5 | 溢出、fallback、reservation上限 |
| S4 | S3后静置2分钟+Worker重启+重复S3 | reservation释放/孤儿/恢复 |
| S5 | A渠道30% 500、10%断流/延迟，B正常 | failover、needs_review、无重复扣费 |
| S6 | 80同出口正常节奏+突发 | 用户/IP/在途429实际归因；不改限流/不伪造IP |
| S7 | 80×3MB上传+媒体缩略图读取；类型异常 | 413/429/5xx、媒体读取、A2校验 |
| S8 | 默认跳过真实上游；如无书面预算不执行 | 不将mock结果冒充真实容量 |
| S9 | 80 VU课堂彩排20分钟 | 最终健康、恢复、任务清空、业务SLO |

完成80档后再执行100/120只读和受控mock余量档；不因单个明确失败停止其他独立场景，但未知任务不重试。

## 7. 通过标准

S1 session p95<1.5s且读取超时0；S2/S9平台5xx<0.5%、无OOM/重启、ready持续200、DB无长排队；S3/S4结束后2分钟reservation归零；S5失败任务明确终态或needs_review；S6记录拒绝率而不掩盖；S7合法文件不回归且伪造媒体拒绝；视频真实出站0。所有指标按实际分母报告，HTTP200不替代任务成功。

## 8. 子Agent分工与主控门禁

- A接口/用户行为：只准备脚本、manifest、RPS和任务账本；由主控启动唯一负载。
- B视频/故障：准备独立fixture、429/500/断流/轮询失败/媒体失败/取消/重启恢复；真实视频请求0。
- C资源/证据：P0检查、主机/DB/Worker/OSS/费用/退费和reservation时间线。
- 主控：统一runId、账号、预算、停止条件、分阶段启动和报告；子Agent不得各自跑80/120压力。

## 9. 停止条件

真实视频出站、生产命中、跨账号泄露、重复扣费、未知任务自动重建、OOM/重启、ready失败、磁盘<10%或5GB、锁等待>30秒、监控中断、S2错误率>5%持续1分钟，停止新增并排空。网络波动只停止当前请求，不自动重提交未知任务。

## 10. 交付物

- 本计划；
- `docs/reports/2026-10-06-fixed-regression-load-test.zh-CN.md`最终报告；
- 脱敏JSONL：API、task、reservation、资源、账务、mock出站；
- 80人结论、120余量结论、修复前后对照、问题/证据/方案；
- 未执行真实S8和未覆盖范围单列；不push、不merge、不deploy，除非用户另行明确授权。
