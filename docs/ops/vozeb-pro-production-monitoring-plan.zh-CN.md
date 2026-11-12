# VOZEB PRO 生产环境培训期监控计划

适用：2026-10-09 至 2026-10-11 三天培训，生产环境 v0.8.5（`sha-f7da1928`）。
用法：每天开课前把本文件发给 Claude，Claude 按第 7 节节奏巡检，按第 9 节格式汇报。好用后再整理成 skill（第 11 节）。

## 1. 原则

- 只读巡检。重启容器、清理磁盘、改配置、改数据库、重新提交任务，一律先报告、等你确认再做。
- 每次巡检都给数字，不给"看起来正常"。查不到的项写"未能检查 + 原因"。
- 重点放在第 3 节的上游任务 ID 链路：要能从一个失败任务追到用户、渠道、模型、上游请求 ID 和失败阶段。
- 不在报告里贴密钥、Cookie、完整提示词、学生密码。用户只写用户 ID 或脱敏用户名。

## 2. 环境与访问

| 项 | 值 | 状态 |
| --- | --- | --- |
| 部署目录 | `/opt/vozeb-pro/production`（`compose.production.yml` + `.env`） | 来自部署 workflow |
| 容器 | `vozeb-pro`（应用）、`vozeb-pro-generation-worker`（生成 worker）、`vozeb-pro-postgres`（数据库） | 来自 compose |
| 数据卷 | `vozeb-pro-data` → `/app/web/.data`；`vozeb-pro-postgres` | 来自 compose |
| 健康检查 | 服务器内 `curl http://127.0.0.1:3000/api/health/ready`；外部 `https://reddetail.gammablue-x.com/api/health/ready` | 已用过 |
| SSH | `ssh -i C:\Users\admin\Downloads\id_ed25519_8_163_33_161_root_pc2_20260907 -o IdentitiesOnly=yes -p 22222 root@8.163.33.161` | 已验证 2026-10-08 |
| 数据库 | 库 `vozeb_pro`，表名带前缀：`vozeb_pro_generation_tasks`、`vozeb_pro_generation_logs`、`vozeb_pro_generation_worker_heartbeats` | 已验证 |
| 反向代理 | 宿主机 nginx 监听 80/443，日志 `/var/log/nginx/access.log`、`error.log`，按天轮转压缩 | 已验证 |
| 巡检脚本 | 本机 `D:\tmp\vz-mon\`：`ssh.sh <脚本>` 远程执行；`quick.sh`（15 分钟例行，一行输出）、`resources.sh`、`db.sh`、`upstream.sh`、`sample.sh`（全量） | 已跑通 |

下文命令里 `$SSH` 指上面那条 ssh 命令。下文 SQL 里的 `generation_tasks` 一律指 `vozeb_pro_generation_tasks`。

## 2.1 基线与实测发现（2026-10-08 14:00）

资源：4 核 / 7.4GB，load 0.0，可用内存 78%，磁盘 38%（49G），DB 7/100 连接、40MB，worker 心跳正常，三个容器 0 重启 0 OOM，镜像 `sha-f7da1928`。

**上游任务 ID 获取不到，根因已定位**：

- 图片是同步接口：提交后要等上游把图片直接返回，不是先拿任务 ID 再轮询。所以成功的图片任务 `upstream_task_id` 本来就是空的（24h 277 条里 276 条为空）。原第 3.3 节"按 upstream_task_id 为空计数"的口径是错的，已改为按 `last_upstream_status`。
- 失败链路（样本 `15ccc145`、`5398aca9`）：`upstream_request` 发出后 10 分钟没有任何响应，`transport_exception`（600001ms）→ `submission_result_unknown` → `needs_review`。系统不知道上游是否已经生成并扣费，所以停止自动重试，前端不报错。
- 上游没回 `upstream_request_id`（积压 77 条全部为空），`recovered_by_request_id` 追回机制用不上。
- 成功图片的上游耗时 p50 约 103s、p95 约 450～480s、最大 576s，已经贴近 600s 的超时线。高并发时上游排队变长，会有更多请求超过 600s，培训期间预计明显增多。
- 24h：图片 277 条，40 条进 needs_review（14%）。按渠道：`hr5VKuKJ…` 为 gpt-image-2 / 2.5-sunburst，`_-eQ3Snt…` 为 gpt-image-2-all。

**历史积压**：77 条任务卡在 `running/needs_review`，最早 09-11，涉及 28 个用户，18 条已过期。另有 2 条图片任务卡在 `created`（09-08、09-10）。这些任务的积分是否已退，还没查。清理需要你决定，我不动。

**其它**：
- nginx：4 次 `/api/admin/settings/events` 上游读超时（像是长连接）。85 条"请求体写入临时文件"告警，说明上传较大，不影响功能。
- 应用日志：2 次 `operation was aborted due to timeout`，1 次 Server Reference ID 格式错误（像扫描器请求）。
- 可回收镜像 10.65GB。容器日志目前很小（9.5KB），docker 也没配日志轮转，培训期风险低。

## 3. 重点：上游任务 ID 获取不到

### 3.1 现状（来自代码，未在生产核对）

你说的"上游渠道 ID 获取不到"，在代码里对应的是"提交给上游后拿不到上游任务 ID"。相关信号：

| 信号 | 位置 | 含义 |
| --- | --- | --- |
| `图片任务缺少上游任务 ID`，status `missing_upstream_id` | [image-task-runtime.ts:119](../../web/src/lib/server/image-task-runtime.ts#L119) | 查询时没有上游任务 ID，直接判失败 |
| `音频任务缺少上游任务 ID`，`missing_upstream_id` | [audio-task-runtime.ts:148](../../web/src/lib/server/audio-task-runtime.ts#L148) | 同上，音频 |
| `文本任务缺少上游任务 ID` → `needs_review` | [text-task-runtime.ts:220](../../web/src/lib/server/text-task-runtime.ts#L220) | 文本进人工复核 |
| `last_upstream_status = submission_result_unknown`，`execution_phase = needs_review` | [image-task-runtime.ts:100-105](../../web/src/lib/server/image-task-runtime.ts#L100-L105) | 提交结果不确定，没敢退款重试 |
| `last_upstream_status = recovered_by_request_id` | [image-tasks/[id]/route.ts:89](../../web/src/app/api/image-tasks/[id]/route.ts#L89) | 缺任务 ID，但靠上游请求 ID 追回了（好事，要计数） |
| `query_contract_invalid` → `needs_review` | [image-task-runtime.ts:128](../../web/src/lib/server/image-task-runtime.ts#L128) | 上游返回格式不符合约定 |
| 容器日志 `[image-upstream-debug] submit/request/response-error/fetch-throw/poll-terminal` | `image-task-openai.ts`（提交 `32717aa3`） | 图片全链路调试日志，带 taskId、channelId、HTTP 状态 |
| `generation_tasks.diagnostic_events`（jsonb） | [2026-09-18 诊断记录](../incidents/2026-09-18-canvas-media-diagnostics.md) | 只记画布 image/video，每任务 ≤20KB，成功保留 3 天、其它 7 天 |
| 日志 `Media diagnostic persistence unavailable` | [media-task-diagnostic-store.ts:33](../../web/src/lib/server/media-task-diagnostic-store.ts#L33) | 诊断写库失败，诊断链路断了 |

**待你确认**：你说的"之前做的会生成对应日志的功能"是不是上面这套（`[image-upstream-debug]` + `diagnostic_events` + `upstream_request_id`）。如果是另一套落在服务器文件里的日志，告诉我路径。

### 3.2 巡检时要回答的问题

1. 过去 1 小时，缺上游任务 ID 的任务有多少，占同类型生成的百分比。
2. 按渠道（`channel_id`）和模型分布，是不是集中在某一个渠道。
3. 其中多少被 `recovered_by_request_id` 追回，多少最终 `error`，多少卡在 `needs_review`。
4. 抽 1～3 个样本，用 `diagnostic_events` 走一遍链路：提交 → 上游响应（HTTP 状态、上游请求 ID）→ 在哪一步丢了任务 ID。
5. 用户侧影响：这些任务对应多少个不同用户，是否退了积分。

### 3.3 查询（只读）

数据库连接用 postgres 容器自带的环境变量，不读 `.env`、不回显密码：

```bash
PSQL='docker exec -i vozeb-pro-postgres sh -c "psql -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -X -A -F \"|\" -v ON_ERROR_STOP=1"'
$SSH "$PSQL" <<'SQL'
-- 过去 1 小时，各类型生成总量与缺上游 ID 情况
SELECT task_type,
       count(*)                                                          AS total,
       count(*) FILTER (WHERE status = 'success')                        AS ok,
       count(*) FILTER (WHERE status = 'error')                          AS err,
       count(*) FILTER (WHERE execution_phase = 'needs_review')          AS review,
       count(*) FILTER (WHERE coalesce(upstream_task_id,'') = ''
                          AND execution_phase NOT IN ('queued','created','submitting')) AS no_upstream_id,
       count(*) FILTER (WHERE last_upstream_status = 'recovered_by_request_id')  AS recovered,
       count(*) FILTER (WHERE last_upstream_status = 'submission_result_unknown') AS submit_unknown
FROM generation_tasks
WHERE created_at > now() - interval '1 hour'
GROUP BY task_type ORDER BY total DESC;
SQL
```

```sql
-- 缺上游 ID 按渠道分布（过去 1 小时）
SELECT task_type, channel_id, provider, last_upstream_status, execution_phase, status, count(*)
FROM generation_tasks
WHERE created_at > now() - interval '1 hour'
  AND coalesce(upstream_task_id,'') = ''
  AND execution_phase NOT IN ('queued','created','submitting')
GROUP BY 1,2,3,4,5,6 ORDER BY count(*) DESC LIMIT 20;
```

```sql
-- 抽样：最近 3 个缺上游 ID 的任务及其诊断事件阶段
SELECT id, task_type, user_id, channel_id, upstream_request_id, last_upstream_status,
       execution_phase, status, created_at,
       jsonb_array_length(diagnostic_events) AS events,
       (SELECT string_agg(e->>'stage', ' > ') FROM jsonb_array_elements(diagnostic_events) e) AS stages
FROM generation_tasks
WHERE created_at > now() - interval '1 hour'
  AND coalesce(upstream_task_id,'') = ''
  AND execution_phase NOT IN ('queued','created','submitting')
ORDER BY created_at DESC LIMIT 3;
```

```bash
# 容器日志：图片上游调试日志，过去 1 小时按事件计数
$SSH "docker logs --since 1h vozeb-pro 2>&1; docker logs --since 1h vozeb-pro-generation-worker 2>&1" \
  | grep -oE '\[image-upstream-debug\] [a-z-]+' | sort | uniq -c
```

**首次巡检要先核对**：`diagnostic_events` 里阶段字段的实际键名（上面写的是 `stage`），以及模型名在 `payload` 里的路径。键名不对时 SQL 返回空，不是"没问题"。

### 3.4 判定

| 级别 | 条件 |
| --- | --- |
口径（2026-10-08 修正）：图片的"缺上游 ID"= `last_upstream_status IN ('submission_outcome_unknown','submission_result_unknown')`，不看 `upstream_task_id` 是否为空。基线 14%（24h 40/277）。

| 级别 | 条件 |
| --- | --- |
| 正常 | 窗口内 submit_unknown < 10% |
| 关注 | 10%～20%，或某渠道占一半以上 |
| 告警 | > 20%，或 15 分钟内同一渠道 ≥ 10 条，或积压比基线 77 条增加 > 20 |

告警时：报给你渠道、模型、样本任务 ID、上游请求 ID、失败阶段，建议是否在后台临时下线该渠道。**不由我直接改渠道配置。**

## 4. 服务器资源

```bash
$SSH 'bash -s' <<'REMOTE'
echo "== 负载/内存"; uptime; free -m | sed -n 1,3p; nproc
echo "== 磁盘"; df -hT -x tmpfs -x overlay; df -i / | tail -1
echo "== docker 占用"; docker system df
echo "== 数据卷"; for v in vozeb-pro-data vozeb-pro-postgres; do du -sh "$(docker volume inspect -f '{{.Mountpoint}}' $v 2>/dev/null || docker volume inspect -f '{{.Mountpoint}}' production_$v)" 2>/dev/null | sed "s#^#$v #"; done
echo "== 容器"; docker ps -a --filter name=vozeb-pro --format '{{.Names}} {{.Status}} {{.Image}}'
for c in vozeb-pro vozeb-pro-generation-worker vozeb-pro-postgres; do docker inspect -f '{{.Name}} restarts={{.RestartCount}} oom={{.State.OOMKilled}} started={{.State.StartedAt}}' $c; done
docker stats --no-stream --format '{{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}} net={{.NetIO}} blk={{.BlockIO}}' | grep vozeb
echo "== 网络连接"; ss -s | head -3
ss -Htan state established '( sport = :3000 or sport = :443 or sport = :80 )' | wc -l | sed 's/^/established(80,443,3000)=/'
ss -Htan state time-wait | wc -l | sed 's/^/time_wait=/'
ss -Htan state established | awk '{print $5}' | sed 's/:[0-9]*$//' | sort | uniq -c | sort -rn | head -5
echo "== 网卡 10 秒流量"; i=$(ip route | awk '/default/{print $5; exit}'); a=$(awk -v i="$i:" '$1==i{print $2,$10}' /proc/net/dev); sleep 10; b=$(awk -v i="$i:" '$1==i{print $2,$10}' /proc/net/dev); echo "$a $b" | awk -v i=$i '{printf "%s rx=%.1fMbps tx=%.1fMbps\n", i, ($3-$1)*8/10/1e6, ($4-$2)*8/10/1e6}'
echo "== 健康"; curl -s -o /dev/null -w 'ready=%{http_code} %{time_total}s\n' --max-time 10 http://127.0.0.1:3000/api/health/ready
REMOTE
```

外部再测一次：`curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' https://reddetail.gammablue-x.com/api/health/ready`，和服务器内的结果对比，能区分是应用慢还是网络/代理慢。

### 4.1 数据库

```sql
SELECT count(*) AS conns, count(*) FILTER (WHERE state='active') AS active,
       count(*) FILTER (WHERE state='idle in transaction') AS idle_in_tx,
       (SELECT setting::int FROM pg_settings WHERE name='max_connections') AS max_conns
FROM pg_stat_activity;
SELECT pid, now()-query_start AS dur, state, left(query,120) FROM pg_stat_activity
WHERE state <> 'idle' AND now()-query_start > interval '30 seconds' ORDER BY dur DESC LIMIT 5;
SELECT count(*) AS waiting_locks FROM pg_locks WHERE NOT granted;
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;
-- 任务积压
SELECT task_type, status, execution_phase, count(*) FROM generation_tasks
WHERE status IN ('pending','running') GROUP BY 1,2,3 ORDER BY count(*) DESC;
SELECT task_type, count(*) AS stuck FROM generation_tasks
WHERE status IN ('pending','running') AND updated_at < now() - interval '35 minutes' GROUP BY 1;
```

`stuck` 用 35 分钟，是因为 v0.8.5 视频硬超时是 30 分钟。超过还在 running，说明超时没生效，要报。

## 5. 日志

```bash
$SSH 'bash -s' <<'REMOTE'
for c in vozeb-pro vozeb-pro-generation-worker; do
  echo "== $c 过去 15 分钟"
  docker logs --since 15m $c 2>&1 > /tmp/.vz_$c.log
  printf 'lines=%s\n' "$(wc -l < /tmp/.vz_$c.log)"
  grep -ciE 'error|exception|unhandled' /tmp/.vz_$c.log | sed 's/^/error_like=/'
  grep -oiE 'ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|socket hang up|UND_ERR_[A-Z_]+|HTTP 429|status: ?5[0-9]{2}|out of memory|JavaScript heap|too many clients|deadlock' /tmp/.vz_$c.log | sort | uniq -c | sort -rn | head -10
  grep -iE 'error|exception' /tmp/.vz_$c.log | sed -E 's/[0-9a-f]{8}-[0-9a-f-]{27}/<uuid>/g; s/[0-9]+/N/g' | cut -c1-160 | sort | uniq -c | sort -rn | head -5
  rm -f /tmp/.vz_$c.log
done
echo "== postgres"; docker logs --since 15m vozeb-pro-postgres 2>&1 | grep -E 'ERROR|FATAL|PANIC' | cut -c1-160 | sort | uniq -c | sort -rn | head -5
echo "== 日志文件大小"; for c in vozeb-pro vozeb-pro-generation-worker vozeb-pro-postgres; do ls -lh "$(docker inspect -f '{{.LogPath}}' $c)" | awk -v c=$c '{print c, $5}'; done
REMOTE
```

第二段 `grep` 把 UUID 和数字归一化后计数，用来发现"新出现的报错类型"。每次和上一轮对比，新类型要单独报出来，附 1 条原文（脱敏后）。

**已知风险**：`compose.production.yml` 没配 `logging` 的 `max-size`/`max-file`，docker 默认 json-file 不轮转，三天高并发日志会持续涨。巡检时看日志文件大小，超过 2GB 报给你。是否加轮转配置需要你决定（要改 compose 并重启容器）。

## 6. 前端与用户侧

**现状**：前端没有把错误上报到服务器。[app-providers.tsx:44-63](../../web/src/components/layout/app-providers.tsx#L44-L63) 只监听 `error`/`unhandledrejection` 来处理 chunk 加载失败后自动刷新，不记录、不上报。所以服务器上看不到浏览器里的报错。

培训期能做的（不改代码）：

- **接口错误**：从应用日志统计 4xx/5xx、429、超时，按接口路径归类，作为前端报错的近似。
- **生成失败原因**：用户在前端看到的失败，最终都落在 `generation_tasks`。按失败原因聚合：

```sql
SELECT task_type, left(coalesce(payload->>'error', result_payload->>'reviewReason', last_upstream_status, '-'), 80) AS reason, count(*)
FROM generation_tasks
WHERE created_at > now() - interval '1 hour' AND (status = 'error' OR execution_phase = 'needs_review')
GROUP BY 1,2 ORDER BY count(*) DESC LIMIT 15;
```

- **登录**：`/api/auth/login` 的 429 数量。v0.8.4 后单账号每 2 分钟 8 次，同一设备指纹跨账号 480 次。429 突增说明有人反复重试或脚本在跑。
- **外部探测**：每轮从本机访问首页和 `/api/health/ready`，记录状态码和耗时。
- **现场反馈**：老师/助教报的问题，你转给我时带上用户名和大概时间，我按时间窗口查日志和任务表。

**建议培训后再做**（需要你同意，要改代码、走 develop → 测试 → 生产）：加一个前端错误上报接口，记录页面、错误类型、脱敏后的栈和用户 ID，带限流。培训期间不上新代码，避免引入风险。

## 7. 巡检节奏

| 时间 | 动作 |
| --- | --- |
| 开课前 30 分钟 | 全量巡检（第 3～6 节全部），记录基线：磁盘、日志大小、数据库大小、连接数、积压 |
| 上课期间 | 每 15 分钟：健康、容器重启/OOM、连接数、积压与卡住、缺上游 ID 计数、新报错类型 |
| 上课期间 | 每 60 分钟：全量巡检 + 第 3.3 节抽样追链路 |
| 生成高峰（老师统一布置生成时） | 改为每 5 分钟看第 3 节和积压，持续到高峰结束 |
| 下课后 | 日报（第 9 节），和基线对比，列出遗留问题 |

时间以北京时间为准。你说"开始上课"开始巡检，说"下课"停止，不按固定课表排。

每发现一个异常，就单独写一份 md 报告，放在 `docs/ops/findings/YYYY-MM-DD-HHMM-<主题>.zh-CN.md`。内容包括：现象、证据、原因分析、修复方向、热更新后怎么验证。别的窗口拿这份报告就能判断要不要热更新修复。

## 8. 告警阈值汇总

| 项 | 关注 | 告警（立刻报你） |
| --- | --- | --- |
| 健康检查 | 耗时 > 2s | 非 200，或连续 2 次超时 |
| 容器 | — | 重启次数增加、OOMKilled=true、状态非 Up |
| CPU 负载 | load1 > 核数 × 0.8 | load1 > 核数 × 1.5 持续 10 分钟 |
| 内存 | 可用 < 20% | 可用 < 10%，或开始用 swap |
| 磁盘 | 使用 > 75% | 使用 > 85%，或 inode > 85% |
| 单个容器日志 | > 1GB | > 2GB |
| 数据库连接 | > max_connections × 60% | > 80%，或 idle in transaction > 10 |
| 慢查询 | > 30s 有 1 条 | > 30s 有 3 条以上，或有锁等待 |
| 任务卡住 | 有 1 条超 35 分钟 | ≥ 5 条，或 pending 持续增长 15 分钟 |
| 缺上游任务 ID | 2%～5% | > 5%，或单渠道 15 分钟 ≥ 10 条 |
| 生成失败率（按类型） | > 10% | > 20% |
| 登录 429 | 15 分钟 > 50 | 15 分钟 > 200 |
| 新报错类型 | 出现 | 15 分钟内同类 > 20 次 |

首日开课前的基线出来后，这些数可能要调。调整写进当天日报。

## 9. 汇报格式

**15 分钟例行**（正常时一行）：

```
[10:15] 正常｜ready 200 0.12s｜load 1.2/8｜内存可用 62%｜磁盘 41%｜DB 连接 34/200｜积压 image 3 video 5｜缺上游ID 0.8% (2/240)｜新报错 无
```

**有问题时**：

```
[10:30] 告警｜缺上游任务 ID 7.5% (18/240)
- 集中在：渠道 <channel_id> / 模型 <model>，占 15/18
- 样本：task <id>，上游请求 ID <id>，阶段 submit_start > upstream_response(200) > 无任务 ID
- 已追回 4 条（recovered_by_request_id），error 11 条，needs_review 3 条，涉及 14 个用户
- 建议：在后台临时下线该渠道，路由会自动切到下一个渠道。等你确认，我不动配置。
```

**日报**：当日概况（峰值并发、生成总量和成功率、各渠道表现）、告警时间线、缺上游 ID 的根因分析进展、和基线对比的资源增长、遗留问题和第二天要调整的阈值。

## 10. 开课前要准备

- [ ] 你确认 SSH key、用户，允许我执行本文的只读命令
- [ ] 你确认 3.1 节的日志就是你说的那套功能，或告诉我实际路径
- [ ] 首次巡检核对 `diagnostic_events` 的字段名、`payload` 里模型名的路径，修正第 3.3 节 SQL
- [ ] 确认是否有反向代理（nginx/caddy）以及访问日志位置，有的话把 5xx/499 统计加进第 5 节
- [ ] 决定是否在培训前给容器日志加轮转（改 compose、需要重启，建议今晚非上课时间做）
- [ ] 提供三天课表

## 11. 形成 skill

三天跑下来，好用的部分整理成 skill：

- 命令写成脚本（`check-resources.sh`、`check-upstream-id.sh`、`check-logs.sh`），每次巡检直接跑，输出固定格式
- 环境信息（主机、容器名、阈值）放在单独的配置段，接其它平台时只换配置
- skill 只包含只读巡检和汇报，任何修改动作仍然先问你

这一步等培训结束、你确认好用后再做。

