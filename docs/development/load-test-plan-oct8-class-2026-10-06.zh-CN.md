# 10-08 课堂压测实施方案（给 Codex 执行）

- 编写日期：2026-10-06
- 执行窗口：10-06 晚 ~ 10-07 18:00。10-07 18:00 后冻结部署，课堂期间禁止重启。
- 目标环境：staging（`reddetail.gammablue-x.com`，主机 `8.163.37.148:22222`）。**禁止对生产压测。**
- 课堂场景：80 名学生同时用画布做生图、生文、生视频，同一教室，大概率共用一个出口 IP。

## 0. 执行规则（必须遵守）

1. 只在 staging 执行。任何生产操作，包括改配置和查库写操作，都要先问负责人。
2. 默认使用 mock 上游（第 3.3 节）。真实上游只在第 5 节 S8 使用，并且发起前必须把预估费用报给负责人，拿到书面确认。
3. 改 staging 配置前，先导出原值并记录到报告"变更记录"表，压测结束后按第 9 节恢复。
4. 每个场景跑完都要按第 6 节采集数据。没有数据的结论不算数。
5. 任何场景触发第 7 节的"中止条件"时，立即停止施压，先保留现场（日志、SQL 快照），再排查。
6. 不得把 API Key、Cookie、Session token 写进报告或提交到仓库。
7. 压测脚本放在 `web/scripts/load/`，只用 Node 内置 `fetch`/`undici`，不新增依赖。结果文件放 `.scratch/load-20261007/`，不提交。

## 1. 要回答的问题和通过标准

| # | 问题 | 通过标准 |
|---|---|---|
| Q1 | 80 人同时登录、打开画布，页面能否正常加载？ | 登录成功率 100%；`/api/auth/session` p95 < 1.5 s，无超时；画布首屏接口 p95 < 3 s |
| Q2 | 80 人混合生成持续 30 分钟，平台本身（app/worker/DB）是否稳定？ | 平台 5xx < 0.5%；无 OOM，无容器重启；`/api/health/ready` 始终 200；DB 连接池无长时间排队 |
| Q3 | 渠道打满后能否自动切到同一逻辑模型下的其他渠道？ | 渠道占用数 ≤ 各自上限；溢出请求进入下一渠道；所有渠道都满时 1 s 内返回"当前使用人数较多" |
| Q4 | 名额会不会泄漏（"假满"）？ | 负载结束后 2 分钟内 `channel_concurrency_reservations` 中活跃行归零；worker 重启后泄漏行在 TTL 内回收，且有手动清理手段 |
| Q5 | 课堂共用出口 IP 时，限流会不会先卡住全班？ | 给出实测数据：在当前限流配置下，80 人正常节奏是否触发 429；给出建议值，由负责人决定 |
| Q6 | 真实上游的实际可用并发是多少？后台填写的上限对不对？ | 每个课堂用到的真实渠道都有实测并发上限，并和后台配置核对一致 |
| Q7 | 上游变慢或报错时，学生会不会长时间干等？ | 上游异常时任务在可接受时间内失败并给出可理解提示；不出现 600 s 排队 |

## 2. 前置检查（任一项不满足，先修再压）

依次执行，并把结果写进报告第 1 节。

| # | 检查项 | 方法 | 不满足时 |
|---|---|---|---|
| P1 | staging 镜像包含渠道并发改动（`channel_concurrency_reservations` 表、按渠道+上游模型计数）和 10-06 绑定验证修复 | 对比 `docker inspect` 镜像 SHA 与 `develop` HEAD；在库里 `\dt *channel_concurrency*` | 先合并、构建、部署 staging |
| P2 | 修改绑定的"并发上限"不会被验证门禁拒绝 | 后台改一个测试绑定的并发上限并保存 | 返回 400 就停止压测，报给负责人：这是压测的前置阻断项（见 `docs/reports/2026-10-06-staging-channel-concurrency-test.zh-CN.md`）。当前代码 `binding-verification-policy.ts` 已改为只警告，但必须在 staging 上实测确认 |
| P3 | `VOZEB_PRO_TRUSTED_PROXY_HOPS` 的线上值 | 查 staging 和生产 app 容器环境变量（只读） | 只记录。为 0 时 IP 限流不生效，所有来源 IP 视为 unknown |
| P4 | nginx `client_max_body_size` | 查 staging/生产实际 nginx 配置（只读） | 未配置时默认 1 MB，参考图上传会 413。记录，在 S7 验证 |
| P5 | 容器资源：app 堆上限（Dockerfile 默认 `--max-old-space-size=384`）、`VOZEB_PRO_DATABASE_POOL_MAX`（默认 10）、`VOZEB_PRO_GENERATION_WORKER_LANES`（默认 2）、主机 CPU/内存 | `docker inspect`、`free -m`、`nproc` | 只记录，调优放第 8 节 |
| P6 | 对象存储：staging 生成产物写 OSS 还是本地磁盘？磁盘剩余空间 | 后台对象存储设置 + `df -h` | 剩余 < 20 GB 时报告 |
| P7 | 生产上课要用的逻辑模型清单：每个模型下有哪些渠道绑定、各自并发上限 | 后台只读导出；由负责人确认清单 | 清单不确认，S8 无法执行 |
| P8 | staging 和生产是否共用真实上游 Key | 对比渠道配置的凭据摘要，不要输出 Key 原文 | 共用时，S8 会占用生产额度，必须避开生产业务时段 |

## 3. 环境准备

### 3.1 测试账号

- 先查 staging 上 `load_20260919_001…120` 是否还在、状态正常、积分够用。能复用就复用。
- 不够就用 `POST /api/school/members/import` 批量补齐到 **100 个**（80 个学生 + 20 个余量），命名 `load_20261007_###`，每人 1000 积分，归属同一测试学校。
- 用户在途并发设成和**生产课堂计划值一致**（先读生产配置，只读）。生产未单独配置时用代码默认值：image 4、video 1、text 4（`web/src/lib/auth/store-foundation.ts` L173）。不要沿用 09-19 的 image 10 / video 4，否则结果和课堂不一致。
- 账号密码只存在 `.scratch/load-20261007/accounts.local.json`，不进报告。

### 3.2 登录与会话

- S1 必须走真实登录接口，测的就是登录本身。登录限流是 8 次/2 分钟，按设备指纹和账号计（`web/src/lib/server/security.ts` L25、L66-80）。脚本给每个虚拟用户生成不同的 UA 和 `accept-language`，模拟不同设备。
- S2 及以后的场景复用 S1 拿到的 Cookie，不重复登录。

### 3.3 Mock 上游

1. 在 staging 主机上用 `web/scripts/protocol-fixture-server.mjs` 起 fixture 服务，只监听内网或 docker 网络。参数：`VOZEB_PRO_PROTOCOL_FIXTURE_PORT=4010`，`VOZEB_PRO_PROTOCOL_FIXTURE_DELAY_MS` 按场景设置。
2. 后台新建 3 个 mock 渠道 `LT-mock-A/B/C`，都指向 fixture，分别开 `mock-text`、`mock-image`、`mock-video`。
3. 新建 3 个**压测专用**逻辑模型：`LT-text`、`LT-image`、`LT-video`。每个模型下绑定 A、B、C 三个渠道，并发上限分别填 **10 / 10 / 5**（总 25），优先级 A > B > C。
4. **不要改课堂真实使用的逻辑模型。**
5. 第一步就要确认 fixture 支持可控延迟和可控错误率（HTTP 429/500、超时）。不支持的话，在 `web/scripts/load/` 下写一个最小 mock，补齐这些能力。
6. 视频 mock 必须模拟"提交 → 轮询 → 完成"的异步流程，完成时间设成 60–120 s 随机，接近真实视频耗时。

### 3.4 压测客户端位置

| 场景类型 | 客户端位置 | 原因 |
|---|---|---|
| 平台容量场景 | staging 主机外的另一台机器 | 避免抢 staging 的 CPU |
| 限流场景（S6） | 同一出口 IP | 复现教室共用 NAT |

客户端统一请求公网域名 `reddetail.gammablue-x.com`，必须经过 nginx。记录客户端出口 IP。

### 3.5 监控采集（压测期间常驻）

在 staging 主机上用一个脚本每 5 s 采样一次，写入 `.scratch/load-20261007/metrics-<场景>.csv`。

主机和容器：
- `docker stats --no-stream`：各容器 CPU、内存
- `uptime`：load average
- 容器重启次数：`docker inspect -f '{{.RestartCount}}'`

Postgres：
```sql
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;
SELECT task_type, status, count(*) FROM generation_tasks
  WHERE created_at > now() - interval '1 hour' GROUP BY 1, 2;
SELECT channel_id, upstream_model, count(*) FROM channel_concurrency_reservations
  WHERE expires_at > now() GROUP BY 1, 2;
SELECT count(*) FROM channel_concurrency_reservations WHERE expires_at <= now();
SELECT worker_id, now() - last_seen_at AS lag FROM generation_worker_heartbeats;
```
如果 `generation_tasks` 实际表名带前缀，以 `web/src/lib/server/database/schema.ts` 为准。

应用：
- `GET /api/health/ready`：状态码和耗时
- app 和 worker 日志：只过滤 `error|ECONN|timeout|heap|OOM|429|503|当前使用人数较多`，不拉全量

## 4. 学生行为模型

压测脚本中，每个虚拟学生（VU）都按以下循环执行：

1. 登录或复用 Cookie，然后 `GET /api/auth/session`。
2. 打开画布：加载项目列表，再加载或创建一个画布项目（具体接口以浏览器 Network 面板实际请求为准，先手动录一遍并列入报告）。
3. 循环，直到场景时间结束：
   - 按权重选动作：**文本 40% / 图片 45% / 视频 15%**。
   - 提交生成任务，接口为 `/api/text-tasks`、`/api/image-tasks`、`/api/video-generation-tasks`，请求体以画布真实请求为准。
   - 按客户端真实间隔轮询，直到任务进入终态：文本 0.8 s，图片 1.8 s，视频 2.5 s（seedance 为 5 s）。这些间隔来自 `services/api/text.ts`、`image.ts`、`video-core.ts`。
   - 期间每 30 s 保存一次画布，模拟自动保存。
   - 思考时间随机 20–60 s，再进行下一次。
   - 收到 429 或"当前使用人数较多"时，**按学生习惯 3–5 s 后重试**，最多 3 次。这一条用来复现重试风暴。
4. 约 20% 的图片和视频请求带 1 张参考图：先上传，再引用。参考图用真实 PNG/JPG，大小 0.5–3 MB。

**节奏说明：** 课堂通常是老师讲完后"同时开始"，所以每个场景都要包含一次 **10 秒内 80 人同时提交** 的突发。

## 5. 场景

除 S8 外，所有场景都使用 mock 上游和 `LT-*` 逻辑模型。

| # | 场景 | 负载 | 持续 | 重点验证 |
|---|---|---|---|---|
| S0 | 冒烟 | 1 个 VU，走完一遍行为模型 | 1 轮 | 脚本正确；每类任务都能成功；监控采到数据 |
| S1 | 登录与进入画布 | 80 个 VU 在 60 s 内登录，再在 10 s 内一起打开画布 | 一次 | Q1。重点看 `/api/auth/session`：09-20 测出单次响应约 437 KB，突发时 p95 约 7.2 s。记录响应大小 |
| S2 | 基线混合负载 | 80 个 VU，mock 延迟：文本 5–15 s，图片 20–40 s，视频 60–120 s | 30 min | Q2。稳态资源曲线，任务端到端耗时 |
| S3 | 渠道溢出 | 80 个 VU 同时只提交图片，mock 图片延迟固定 60 s | 一次突发 + 5 min | Q3。A 先占到 10，B 再到 10，C 到 5；第 26 个起应快速收到"当前使用人数较多"。任何时刻占用数都不能超过上限 |
| S4 | 名额释放与泄漏 | S3 结束后静置；再跑一轮 S3，并在负载中 `docker restart` worker 一次 | 15 min | Q4。正常结束后 2 min 内活跃预留数归零；重启后泄漏了多少行、多久回收；按第 9.2 节手动清理并验证有效 |
| S5 | 上游异常 | mock 渠道 A：30% 返回 500，10% 卡住不响应（超过 120 s）；渠道 B 正常 | 15 min | Q7。A 的失败是否转到 B；卡住的请求多久失败；是否产生 needs_review，占用名额多久。不得出现 600 s 级排队 |
| S6 | 共用出口 IP 限流 | 80 个 VU 走同一出口 IP，按第 4 节节奏 + 突发 | 15 min | Q5。统计 429 的来源：用户级、IP 级还是在途并发。分别在 `TRUSTED_PROXY_HOPS` 为当前值和生产值时各跑一次（如果两者不同） |
| S7 | 上传与媒体 | 80 个 VU 在 30 s 内各上传 1 张 3 MB 参考图；再有 80 个 VU 并发加载 20 张产物缩略图 | 一次 | 413/429/5xx；媒体代理限流（per-IP media-proxy 120/min）是否被一屏缩略图打满 |
| S8 | 真实上游并发探测（**需负责人确认费用**） | 对课堂用到的每个真实渠道+模型，用最便宜的参数阶梯式加压：5 → 10 → 20 → 30 个并发 | 每档一次 | Q6。找出每个渠道开始出现 429、排队或耗时陡增的拐点，与后台上限核对。只用文本和图片；视频只在负责人明确要求时测 1 档 |
| S9 | 课堂彩排 | 80 个 VU，S2 节奏；挂课堂真实逻辑模型（前提是 S8 已确认上限），或继续用 mock | 20 min | 全链路最终确认。使用 S8 后修正过的配置和第 8 节的调优结果 |

执行顺序：P1–P8 → S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7 → 调优（第 8 节）→ 复测失败项 → S8 → S9。

每个场景至少间隔 3 分钟。下一个场景开始前，确认活跃预留数为 0，且没有 running 状态的残留任务。

## 6. 每个场景必须记录的数据

客户端侧，按接口和任务类型分别记录：

- 请求数、成功率
- HTTP 状态分布：200、4xx 各码、5xx 各码
- 延迟 p50 / p95 / p99 / max
- 生成任务的端到端耗时（提交到终态），以及终态分布：success、error、cancelled、needs_review
- 错误文案的 Top 10
- 每个 VU 每分钟发出的请求数（含轮询），用来估算课堂真实 RPS

服务端侧，引用第 3.5 节的 CSV：

- CPU、内存峰值，app 堆使用情况
- DB 活跃连接峰值
- 每个渠道的预留数曲线
- worker 心跳延迟最大值
- 容器重启次数
- 错误日志条数

## 7. 中止条件

出现以下任一情况，立即停止施压：

- `/api/health/ready` 连续 3 次非 200
- 任一容器重启或 OOM
- 主机内存可用 < 10%，或磁盘可用 < 5 GB
- 发现请求发到了非 mock 的真实上游（S8 除外）
- S8 实际费用超过负责人确认的预算
- staging 数据库出现锁等待超过 30 s

## 8. 调优候选（只在有数据支持时改）

每一项都要先在报告里给出"数据 → 原因 → 改动 → 复测结果"，再决定是否推到生产。所有改动都要在 10-07 18:00 前完成并复测。

| 现象 | 候选调整 |
|---|---|
| app 堆或内存接近上限 | 提高 `NODE_OPTIONS=--max-old-space-size`，容器内存同步上调 |
| DB 连接池排队，或接口在 DB 上等待 | 提高 `VOZEB_PRO_DATABASE_POOL_MAX`，例如 10 → 20，前提是 Postgres `max_connections` 有余量 |
| 任务在 pending 状态堆积，worker 不忙 | 提高 `VOZEB_PRO_GENERATION_WORKER_LANES`，例如 2 → 4 |
| `/api/auth/session` 响应大或慢 | 只记录问题和数据，交给开发评估。课前不做功能性改动，除非负责人同意 |
| IP 限流先于渠道上限触发 | 给出建议值，由负责人决定。这属于安全设置，不得自行修改 |
| 名额泄漏回收慢 | 记录实际泄漏量。课前优先准备第 9.2 节手动清理，而不是缩短 TTL |
| nginx 413 | 调整 `client_max_body_size`，需负责人确认 |

## 9. 收尾与应急

### 9.1 恢复 staging

- 停掉 fixture 服务。
- 禁用或删除 `LT-mock-*` 渠道和 `LT-*` 逻辑模型。
- 按"变更记录"表把所有配置恢复原值。
- 统计压测账号的积分消耗。账号保留，作为课堂当天的应急账号池。
- 确认没有 running 状态的残留任务，活跃预留数为 0。

### 9.2 课堂应急手册

压测中验证有效的步骤，整理成单独一节交给值班人：

1. **判断"假满"：** 后台提示"当前使用人数较多"，但上游实际空闲。用 3.5 节的 SQL 查看活跃预留。如果某渠道的预留数等于上限，但 `generation_tasks` 中对应的 running 任务远少于预留数，就是假满。
2. **清理过期预留：**
   ```sql
   DELETE FROM channel_concurrency_reservations WHERE expires_at <= now();
   ```
3. **清理孤儿预留（需值班负责人确认后执行）：** 删除 request_id 对应的任务已进入终态或不存在的预留行。具体 SQL 在 S4 中写好，并验证过再写进手册。
4. **渠道整体不可用：** 在后台临时禁用该渠道绑定，让流量转到其他渠道。这一步在 S5 中演练过。
5. **课堂期间不部署、不重启。** 只有在服务已经不可用时才重启，重启后立即执行第 2、3 步。

## 10. 交付物

1. **压测报告** `docs/reports/2026-10-07-oct8-class-load-test.zh-CN.md`：
   - 一句话结论：能否支撑 80 人上课，以及前提条件
   - Q1–Q7 逐条回答：通过 / 不通过，附关键数据
   - 前置检查结果（P1–P8）
   - 各场景数据（第 6 节）
   - 发现的问题，按严重度排序，每条附证据和建议
   - 变更记录：改了什么、原值、新值、是否已恢复
   - 推到生产的配置清单，以及需要负责人决策的事项
2. **压测脚本** `web/scripts/load/`：可复用，带 README 说明参数，不含任何凭据。
3. **课堂应急手册**：第 9.2 节验证后的版本，可以作为报告附录。
4. **待负责人决策清单**，至少包括：
   - IP 限流怎么设
   - S8 预算
   - 生产调优项是否上线
   - 并发上限是否按 S8 结果修正

## 11. 时间表

| 时间 | 事项 |
|---|---|
| 10-06 晚 | P1–P8 前置检查；准备脚本、账号、mock；S0、S1 |
| 10-07 上午 | S2 – S7 |
| 10-07 中午 | 调优并复测；向负责人汇报，拿到 S8 预算确认 |
| 10-07 下午 | S8；按结果修正生产并发上限（需确认）；S9 彩排 |
| 10-07 18:00 | 提交报告和应急手册；冻结部署 |
| 10-08 课中 | 值班人按应急手册监控：每分钟查一次预留数和 health |
