# VOZEB PRO 底层重构评估

2026-10-08 · 基于 `develop`（`1f33d06b`）源码与 2026-10-08 生产巡检数据 · 本文只做评估，不改代码

## 结论

- **要重构，但只重构底层的生成链路，不整体重写。** 调度租约、渠道并发名额、积分账本、发布回滚这几块是稳的，可以保留。
- **最大的风险是生成链路**：上游调用跑在 Web 进程里，每种媒体各写一套提交、轮询、退款，needs_review 实际上是终态。生产上 14% 的图片进待核查、77 条积压，根源都在这里。
- **第二大风险是安全网不够**：PR 不跑 PG 集成测试和 E2E，备份没有定时任务，没有可复现的压测，没有功能开关。这几样要在动核心代码之前补上。
- **工期**：阶段 0～4 约 9～11 周。只做最关键的阶段 0～2 约 7 周。工期主要花在验证和观察上，写代码本身不是瓶颈。
- **有一件事现在就能做、不用改代码**：在后台把图片模型的 `timeoutMs` 调高（第 4 节阶段 0），能直接减少超时进待核查的数量。培训期间要不要调由你决定。

## 1. 项目现状

| 项 | 数值 | 说明 |
| --- | --- | --- |
| 源码规模 | `web/src` 约 35.7 万行 TS/TSX，2722 个文件 | 含测试 |
| 测试 | 1053 个测试文件 | 10/05 全量 5459 个用例通过 |
| 接口与表 | 426 个 API Route，59 个页面，143 张 PostgreSQL 表 | 见开发地图 |
| 服务端 | `lib/server/` 根目录平铺 330 个文件，约 6.4 万行 | 只有 4 个子目录 |
| 提交历史 | 2026-07-26 建仓，共 1226 次提交；近 30 天 785 次 | 近 30 天 fix 347 次、feat 189 次 |
| 版本 | 生产 v0.8.5（`sha-f7da1928`）；仓库 `VERSION` 与 `package.json` 仍是 0.0.7 | 版本号不同步 |

技术栈：Next.js 16 App Router + React 19 + Ant Design 6 + Tailwind 4 + Zustand + TanStack Query；后端是 Next.js Route Handler + `lib/server`；PostgreSQL 16；独立的 generation-worker 容器。生产是单台 4 核 / 7.4GB 服务器，跑 app、worker、postgres 三个容器。

近 30 天修复提交数是功能提交的 1.8 倍。同一类问题（超时、轮询、待核查、渠道并发）在多个产品线里各修一遍，这是本次评估最主要的信号。

## 2. 风险清单

标注：✅ 已对照源码核实；◐ 子任务审计得出、未逐行复核。

### 2.1 生成链路（影响最大，生产已在出问题）

**G1. 上游调用跑在 Web 进程里，worker 只是定时器** ◐
[generation-worker.mjs](../../../web/scripts/generation-worker.mjs) 约 119 行，只负责定时请求 `/api/maintenance/generation-tasks/run`。真正的上游 HTTP 调用发生在 app 容器里：图片在路由 `after()` 回调和维护接口里执行，视频直接在 POST 请求里同步提交（[video-generation-route.ts:419](../../../web/src/app/api/video-generation-tasks/video-generation-route.ts#L419)）。部署或重启 app 时，所有进行中的生成都会中断。

**G2. 中断后的任务结果会丢失** ✅
提交阶段中断、拿不到上游任务 ID 的任务，恢复服务会直接转成 `needs_review`（[generation-task-recovery-service.ts:628-649](../../../web/src/lib/server/generation-task-recovery-service.ts#L628-L649)），不会重复提交，这一点是安全的。代价是上游可能已经生成并计费，但结果再也取不回来。

**G3. 600 秒超时线贴着真实耗时分布** ✅
图片默认超时 10 分钟，可以按逻辑模型在能力档案 `timeoutMs` 里调整，上限 30 分钟（[model-request-policy.ts:7-21](../../../web/src/lib/server/model-request-policy.ts#L7-L21)）。生产图片 p95 450～480 秒、最大 576 秒，24 小时内 40/277（14%）进了 needs_review。这一项**不需要重构**，后台把课堂用到的图片模型 `timeoutMs` 调到 15～20 分钟就能马上缓解。但这只是把问题往后推：同步长连接本身的问题（G1）还在。

**G4. needs_review 实际上是终态** ✅
写入 needs_review 时都把 `nextPollAt` 置空（[image-task-runtime.ts:100-105](../../../web/src/lib/server/image-task-runtime.ts#L100-L105)），而领取任务要求 `next_poll_at IS NOT NULL`（[generation-task-scheduler.ts:118](../../../web/src/lib/server/generation-task-scheduler.ts#L118)）。只能等用户点“检查状态”或人工处理。生产积压 77 条就是这么来的，最早一条是 09-11。

**G5. 上游没有幂等句柄** ◐
同步图片接口没有返回上游请求 ID（积压的 77 条全部为空），超时之后无法对账，`recovered_by_request_id` 机制用不上。

**G6. 渠道健康状态只存在进程内存里** ◐
[channel-runtime-health.ts:18](../../../web/src/lib/server/channel-runtime-health.ts#L18) 用的是进程内 `Map`，连续 3 次失败才冷却。并发名额已经存进 PostgreSQL（`channel_concurrency_reservations`），但冷却和故障切换各进程看到的不一样。名额 TTL 是 1 小时，进程崩溃或任务进 needs_review 后，名额最长被占一小时。

**G7. 每种媒体各写了一套提交、轮询、退款** ◐
调度和租约是共用的，提交、轮询、退款却按类型各写一套：image、video、audio、text、agent-run、drama-lab、one-click-film，合计约 2.8 万行。恢复服务是一个 1225 行、有 7 个分支的 switch。短剧和一键成片还通过回环 HTTP 调本站接口。改一次超时策略要动 7 处以上，10/07 的“硬超时图片 10 分钟、视频 30 分钟”就是先改画布、再手动同步到镜像副本（`c517b175`、`1f33d06b`）。

### 2.2 数据层

**D1. 没有真正的迁移系统** ◐
每个进程第一次访问数据库时，把全部建表 SQL 作为一条语句在一个事务里重放（[postgres.ts:675-689](../../../web/src/lib/server/database/postgres.ts#L675-L689)）。`schema_migrations` 表只是记账，版本号在最后统一插入，不控制执行。只有 IP 库模块真的按版本判断。

**D2. 启动时会改写生产数据** ✅
同一批 SQL 里有每次启动都会执行的数据修改：[schema.ts:27](../../../web/src/lib/server/database/schema.ts#L27) 无条件 `DROP TABLE IF EXISTS check_ins`；[schema.ts:1339-1343](../../../web/src/lib/server/database/schema.ts#L1339-L1343) 每次启动全表重算 `practice_script_chat_sessions.is_primary`；另有用户权限、账号 ID 回填等多处 UPDATE。数据量变大后，启动会越来越慢，而且没有版本控制。

**D3. 运行时用手写 SQL 分词器加表前缀** ◐
`prefixPostgresSql`（[postgres.ts:691-743](../../../web/src/lib/server/database/postgres.ts#L691-L743)）在每条查询执行前把表名改写成 `vozeb_pro_*`，依赖两份手工维护的名单（约 160 张表、360 个对象）。新表漏登记就会静默查错表。

**D4. 文件 Provider 已经没有部署在用，但代码还在维护** ◐
所有 compose、render.yaml、`.env.example` 和 CI 都固定为 `postgres`。代码里仍有 32 个文件、94 处 `isPostgresDatabaseEnabled()` 分支、61 处 `readAuthDb/mutateAuthDb`、3 个文件仓库和约 1050 行的 `store-normalizers.ts`。两边的语义已经开始分叉：文件版 `lockOperation()` 是空函数，PG 版是真的咨询锁。单元测试默认走文件模式，所以测试通过不能代表线上行为（10/05 并发改动就是这样，见渠道并发隐患报告 R0）。
注意：AGENTS.md 第 44、141 行和开发地图把文件 Provider 写成了“既有回退实现”，要求保持不破坏。要不要删，得先由你决定并修改 AGENTS.md，不能当成清理死代码直接删。

**D5. 画布和短剧整份 JSON 覆盖写** ✅
`canvas_projects.project_json` 每次保存都整份替换，乐观锁用的是 `updatedAt` 字符串比较，只保留 `__canvasAgentReceipts` 这一个键（[canvas-project-store.ts:306-315](../../../web/src/lib/server/canvas-project-store.ts#L306-L315)）。Agent 和用户同时写同一个画布时，其中一方的修改会被覆盖。

**D6. 学校算力退款缺少操作锁** ✅
扣费路径会先 `lockOperation`（[generation-charge-service.ts:92](../../../web/src/lib/server/generation-charge-service.ts#L92)），退款路径不会。个人垫付退款在 JS 里读改写余额（第 80-82 行）。行锁能挡住一部分并发，但个人积分那边“唯一键 + 账本插入”的做法更稳。

**D7. 连接池没有超时** ✅
连接池只配置了 `max`（默认 10），没有 `connectionTimeoutMillis`、`idleTimeoutMillis`，也没有 `statement_timeout`。一条卡住的查询会一直占着连接。worker 不直连数据库，它的负载最终也落在 app 的这 10 个连接上。

### 2.3 前端

**F1. 画布有一份 2.2 万行的镜像副本** ◐
[sync-drama-canvas-runtime.mjs](../../../web/scripts/sync-drama-canvas-runtime.mjs) 把 `app/(user)/canvas/` 复制到 `features/drama-canvas-runtime/`，再用 12 处精确字符串补丁改成短剧版本。补丁依赖源码空白格式，源码一格式化就会失败（`362df6cb`）。CI 里没有任何检查，修复只改了一边时不会报错（`1f33d06b` 就是手动补同步）。目前两边哈希一致。

**F2. 每种媒体各写一套前端轮询** ◐
`services/api` 下图片、视频、文本、音频各有一个 `waitFor*`，共享的状态模块只有 29 行。各页面又各自叠了一层定时器（短剧 2.5 秒、一键成片两个、创作页 1 秒等），超时常量也各写各的。Agent 用 SSE，媒体生成用轮询，这是按功能分的，不是按需求选的。

**F3. 超大文件集中在短剧实验室** ◐
[drama-workflow-lab-project-complete.tsx](../../../web/src/app/%28user%29/drama-lab/[id]/drama-workflow-lab-project-complete.tsx) 6964 行、122 次提交，是全仓库风险最高的单个文件。`drama-lab-visual-assets-panel.tsx` 1970 行、80 次提交，排第二。超过 1000 行的文件只有 15 个，问题集中，没有扩散。

**F4. 三条分镜产品线能力重叠** ◐
`drama/`（8053 行）、`drama-lab/`（14402 行）、`one-click-film/`（4909 行）。一键成片直接引用 drama-lab 内部文件，画布里还按 `source === "one-click-film"` 写分支。是保留三条线还是合并，这是产品决策。

### 2.4 运维与质量门禁

**O1. PR 和 develop 推送不跑 E2E 与 PG 集成测试** ✅
`quality.yml` 的单测、Playwright 和 PG 集成测试都加了 `if: startsWith(github.ref, 'refs/tags/')`。`staging-image.yml` 会跑 `pnpm test`（文件模式），但不跑 E2E 和 PG 测试。PG 路径要到打 tag 才第一次被测到。

**O2. 备份没有定时任务** ◐
`disaster-backup.mjs` 能用，但必须离线确认才能执行，仓库里没有任何定时任务。生产只有一个 PG 卷，没有 WAL 归档；媒体放在本地卷，没有对象存储副本。服务器整机出问题时，生成的媒体全部丢失。

**O3. 发布链路不稳** ◐
v0.8.x 有两次发布卡在 `docker pull`，重试 8 次后失败（`.tmp-v082-final.log`），健康检查和自动回滚都没走到。docker 日志没配轮转。没有指标采集，也没有前端错误上报。

**O4. 分支和版本号对不上** ◐
develop 领先 main 220 个提交，生产工作流只在 main 上。`VERSION`、`package.json`、`CHANGELOG` 都停在 0.0.7，实际已经发到 v0.8.5。镜像仓库有 `csyqlz` 和 `lishen331` 两个命名空间。

**O5. 重构需要的基础设施缺失** ◐
没有功能开关，也没有灰度：单容器，`up -d` 原地替换。9/19～9/20 的压测脚本没有提交进仓库，80 人场景无法复现。

### 2.5 已核实没问题、重构时应保留的部分

- 调度租约：`FOR UPDATE SKIP LOCKED` 加 90 秒租约和 25 秒心跳，多进程安全，可以作为新引擎的底座直接复用。
- 重启不会重复提交：提交阶段中断的任务会转成 needs_review，不会重新调上游（G2）。
- 渠道并发名额存在 PostgreSQL 里，用咨询锁加 `channel_concurrency_reservations` 表，多进程安全。
- 个人积分账本：幂等键唯一索引、退款唯一索引、咨询锁事务，设计扎实。
- 发布：生产按 tag 和提交 SHA 部署，有人工审批，健康检查失败会自动回滚。

## 3. 重构原则

1. **渐进替换，不重写。** 新旧实现按任务类型并存，用开关切换，每次只切一种类型，随时能切回去。
2. **先补安全网，再动核心。** PG 集成测试、可复现的 80 人压测、功能开关这三样没到位之前，不碰生成引擎。
3. **不双跑生成。** 新旧引擎同时提交同一个任务会重复计费，切换时按任务类型整体切换。
4. **沿用 AGENTS.md 的现有契约。** 不自动重建上游任务，不擅自加常数限制，Schema 变更用有序幂等的升级步骤，每个阶段先写开发文档，你同意后再动手。
5. **培训期（10/09～10/11）冻结。** 这几天只做后台配置调整，不上新代码。

## 4. 分阶段方案

### 阶段 0：不改代码的止血（培训后 1～2 天）

| 事项 | 做法 | 对应风险 |
| --- | --- | --- |
| 调高图片超时 | 后台把课堂用到的图片逻辑模型 `timeoutMs` 调到 15～20 分钟。这是配置调整，培训期间要不要调由你决定 | G3 |
| 清理 77 条积压 | 逐条核对上游和积分是否已退，再决定退款或关闭。你决定怎么处理 | G4 |
| 日志轮转 | compose 里给每个服务加 `logging: max-size/max-file`，需要重启 | O3 |
| 在线备份 | `pg_dump` 本身可以在线执行，加一个宿主机定时任务，每天备份并保留 7 份 | O2 |
| 解决拉镜像卡住 | 改成断点续传拉取，或者在服务器上预拉镜像（参考 10/07 staging 的方案） | O3 |

### 阶段 1：安全网（约 1.5 周）

- develop 推送时也跑 PG 集成测试和关键 E2E 测试，不再只在打 tag 时跑。
- 把 80 人、120 并发的压测脚本提交进仓库：用本地上游 fixture 模拟慢响应（p95 480 秒）和渠道满载，每次改动都能复现 9/20 的场景。
- 功能开关：放在后台系统设置里，按任务类型切换新旧引擎，改了立即生效，不需要重新部署。
- 连接池加 `connectionTimeoutMillis`、`idleTimeoutMillis`，加语句超时。
- CI 增加画布镜像校验：重新计算 `sync-manifest.json` 的哈希，不一致就失败。
- 统一版本号：`VERSION`、`package.json`、CHANGELOG 跟 tag 对齐。
- 给生成任务的结果打结构化日志（类型、渠道、阶段、耗时、终态），按天出统计。

### 阶段 2：统一生成引擎（约 4～5 周，核心阶段）

目标：上游调用不再跑在 Web 进程里；所有媒体类型共用一套提交、轮询、对账和退款流程。

1. **定义适配器接口**：`submit / poll / persist / refund / reconcile`。图片、视频、音频、文本各实现一个适配器，恢复服务里 1225 行的 switch 换成按类型分发。调度租约（`generation-task-scheduler.ts`）保留不动。
2. **上游调用移进 worker**：worker 直接执行引擎，app 只负责建任务、读状态。可选方案见第 6 节决策 2。worker 和 app 用同一个镜像，部署 app 不再打断生成；worker 重启时，靠现有租约过期后由别的 lane 接管。
3. **needs_review 变成可恢复状态**：有上游任务 ID 的任务按退避时间自动重查，不再把 `nextPollAt` 置空。没有 ID 的同步图片任务仍然不重提交（遵守 AGENTS.md 第 197 行），但要有明确的对账期限和退款规则，见决策 3。
4. **渠道健康状态迁到 PostgreSQL**：冷却和失败计数改为多进程共享。名额 TTL 改为跟随任务租约续期，不再固定 1 小时；进 needs_review 时立即释放名额。
5. **短剧和一键成片直接调引擎**：去掉回环 HTTP（`drama-lab/*/generate-*`、`one-click-film/media-runner.ts` 等 9 处）。

切换顺序按风险从低到高：音频（462 行）→ 文本 → 图片 → 视频 → 短剧和一键成片的调用方。每种类型都要经过开关默认关闭、staging 压测、生产低峰期打开、观察 48 小时这几步，旧代码稳定两周后再删。

### 阶段 3：数据层（约 2～3 周，可以和阶段 2 后半段并行）

1. **版本化迁移**：每个迁移一个文件，执行前检查 `schema_migrations`。现有建表 SQL 冻结为基线版本，[schema.ts:27](../../../web/src/lib/server/database/schema.ts#L27)、[schema.ts:1339](../../../web/src/lib/server/database/schema.ts#L1339) 等启动时执行的 DML 改为只执行一次的迁移。迁移只在部署时由单独一步执行，不再由每个进程的第一个请求触发。
2. **画布和短剧加版本号**：增加整数 `version` 列，乐观锁改为比较 `version`。Agent 回执这类会被并发写入的子树，改用 jsonb 路径更新，不再整份覆盖。
3. **学校退款加锁**：退款路径补上 `lockOperation`，改为插入账本加唯一键，跟个人积分的做法对齐。
4. **表前缀改写层（可选，排在最后）**：改用独立 schema 或 `search_path`，删除 `prefixPostgresSql`。影响所有查询，收益是去掉一类静默错误。建议等阶段 2、3 稳定后再单独评估。

### 阶段 4：前端（约 3～4 周，可以和阶段 3 并行）

1. **统一生成客户端**：基于已有的 TanStack Query 写一个 `useGenerationTask`，统一轮询节奏、退避、超时和恢复，替换 4 个 `waitFor*` 和各页面自己写的定时器。服务端已经有 SSE 端点，可以优先用 SSE，轮询作兜底。
2. **画布合并成一个包**：抽到 `features/canvas/`，`/canvas` 和 `/drama-canvas` 都从这里引用。12 处字符串补丁改成适配器 props（持久化、导航、深链定位），然后删掉同步脚本和 manifest。
3. **拆分 `drama-workflow-lab-project-complete.tsx`**：按大纲、分镜、资产、成片阶段拆成几个文件，状态放进页面级 store。以 `drama-lab-visual-assets-panel` 现有的测试为基础，先补测试再拆。

### 阶段 5：需要产品决策的部分（不计入基础工期）

- 三条分镜产品线（drama、drama-lab、one-click-film）是否合并：约 3～5 周，取决于保留哪几条。
- 删除文件 Provider：约 1～1.5 周，前提是先修改 AGENTS.md。
- 媒体迁到对象存储：已经有 [object-storage-service.ts](../../../web/src/lib/server/object-storage-service.ts)，参考素材和课程封面在用，但生成结果仍存本地卷，生产也没配对象存储。主要成本是接入生成结果、迁移历史数据和存储费用。

## 5. 工期估算

假设：我写代码，你负责审核开发文档、确认 staging 验收、批准生产切换。按 AGENTS.md 的要求，每个阶段都先出开发文档。

| 阶段 | 工期 | 能否并行 | 主要瓶颈 |
| --- | --- | --- | --- |
| 0 止血 | 1～2 天 | — | 你确认积压怎么处理 |
| 1 安全网 | 1.5 周 | — | 压测脚本要和 9/20 的结果对上 |
| 2 统一生成引擎 | 4～5 周 | — | 每种类型切换后观察 48 小时，共 4 轮 |
| 3 数据层 | 2～3 周 | 和阶段 2 后半段并行 | 迁移基线要在生产库副本上演练 |
| 4 前端 | 3～4 周 | 和阶段 3 并行 | 画布合并后要做浏览器回归 |
| 5 产品决策项 | 另计 4～7 周 | — | 取决于决策 |

**合计：阶段 0～4 约 9～11 周**，其中关键路径是阶段 1 加阶段 2，约 6.5 周。不带阶段 5。

工期主要花在验证和观察上，不在写代码上。阶段 2 的代码本身 1.5～2 周能写完，剩下的时间都是 staging 压测、生产低峰切换和每种类型 48 小时的观察。想压缩工期，可以只做阶段 0、1、2（约 7 周），解决生产上真正在出问题的部分；阶段 3、4 以后按需再做。

估算误差主要来自两处：一是 9/19～9/20 的压测脚本没有入库，要重写；二是视频链路目前在 POST 请求里同步提交，迁移时改动比图片大。

## 6. 需要你决定的事

1. **做完整重构，还是只做阶段 0～2。** 我建议先做 0～2，生产问题集中在生成链路。
2. **worker 怎么执行上游调用。**
   - A：worker 直接引入 `lib/server` 引擎，需要给 worker 加一步 TS 构建。改动大，但更干净。
   - B（建议）：同一个镜像，另起一个 `role=worker` 的 Next.js 进程，专门处理维护接口；对外的 app 不再执行上游调用。改动小，部署 app 时不会打断生成。
3. **没有上游 ID 的 needs_review 怎么收尾。** 比如超过 N 小时自动退款并标记失败。这条涉及计费，AGENTS.md 也禁止自动重建上游任务，所以由你定规则。
4. **文件 Provider 是否删除。** 需要先改 AGENTS.md 第 44、141 行。
5. **三条分镜产品线是否合并。** 这是产品决策，决定阶段 5 的范围。

## 7. 下一步

培训结束后（10/12 起），先做阶段 0；同时我写阶段 1 的开发文档，放在 `docs/superpowers/specs/`，你确认后再开始写代码。培训期间不改代码。
