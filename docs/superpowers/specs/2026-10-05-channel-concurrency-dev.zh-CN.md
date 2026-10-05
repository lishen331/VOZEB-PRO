# 渠道并发上限 · 开发文档

日期:2026-10-05 · 截止:2026-10-08 课堂 · 分支:`develop`(已同步 `origin/develop`,改动未提交) · 状态:第 5 节步骤 1–7 已完成,隐患见 `docs/superpowers/plans/2026-10-05-channel-concurrency-risk-report.zh-CN.md`

相关:审查报告 `docs/superpowers/plans/2026-10-05-channel-concurrency-review.zh-CN.md`、容量压测 `docs/superpowers/plans/2026-09-20-capacity-phase1-report.zh-CN.md`

## 1. 为什么要做

10 月 8 日课堂要 80 人同时用**画布**,画布会生图、生文、生视频。单个上游渠道的并发只有 20~30。

改动前的系统没有并发上限,渠道打满后的行为(代码已核实):

- 请求照样发给第一个渠道。上游满了不一定马上报错,9/20 压测里图片渠道的表现是**排队直到超时**(约 600 秒),不是快速返回 429。
- 只有连续失败 3 次才会让渠道冷却 30 秒(`channel-runtime-health.ts`)。超时要等 10 分钟才算一次失败,所以冷却来得很晚。
- 图片失败后只自动重试一次、只换到第二个渠道(`attemptNo >= 2` 就停)。

结论:**改动前,80 人同时用会先把第一个渠道堵死,学生要等十分钟才看到失败,其他渠道基本闲着。** 所以必须在发请求前就知道"这个渠道满没满",满了直接换下一个。

## 2. 目标

- 每个渠道的每个上游模型有独立上限,按后台 `capabilityProfile.concurrencyLimit` 配置。没配置就不限。
- 计数口径是「渠道 + 上游模型」,不区分用户。50 个人各占 1 个,和 1 个人占 50 个,效果一样。
- 满了按候选顺序(优先级 → 权重 → ID)换下一个渠道;全满时快速返回"繁忙,请稍后再试",不排队。
- 覆盖画布实际会走的所有上游调用:生图、生文、生视频、音频、画布助手的规划调用。
- 多进程、多实例下计数准确(Postgres 预留表)。

## 3. 画布的调用链路(已核实)

| 画布操作 | 前端入口 | 服务端链路 | 当前是否受并发上限控制 |
|---|---|---|---|
| 生图节点 | `services/api/image.ts` → `POST /api/image-tasks` | `image-task-runtime.ts` | 是,满了按候选换渠道 |
| 生文节点 | `services/api/text.ts` → `POST /api/text-tasks` | `text-task-runtime.ts` | 是 |
| 生视频节点 | `services/api/video-core.ts` → `POST /api/video-generation-tasks` | `video-generation-route.ts` | 是 |
| 音频节点 | `services/api/audio.ts` → `POST /api/audio-tasks` | `audio-task-runtime.ts` | 是 |
| 画布助手生成的子任务 | `/api/agent/runs` | `agent-run-execution.ts` 内部转发到上面四个任务接口 | 是(走的同一套任务接口) |
| **画布助手的规划/对话调用** | `/api/agent/runs` | `requestFunctionCall` → `requestStructuredText` → 直接请求 `/api/ai/system/{channelId}` | **否,完全不计数** |

最后一行是缺口:每次用画布助手,至少有一次文本模型调用不占位。80 人同时用助手,文本渠道的真实并发会比后台显示的高出一截。

## 4. 现有改动的问题(按优先级)

| 编号 | 问题 | 影响 | 修复工作量 |
|---|---|---|---|
| P0-1 | 占位 key 用了逻辑模型 ID(`generationModelId` 优先返回 `logicalModel`),而上游额度属于「渠道 + 上游模型」 | 两个逻辑模型绑到同一渠道的同一上游模型时,各算各的,实际可超额一倍;路由预筛的 key 也对不上 | 小 |
| P0-2 | 画布助手的规划调用绕过闸门(见第 3 节) | 文本渠道超额 | 中 |
| P0-3 | 取消任务、创建时抛异常、释放失败等路径不释放占位,`.catch(() => {})` 静默吞错 | 占位泄漏,要等 30 分钟 TTL 才回收;极端情况下渠道整体被"假占满" | 中 |
| P1-1 | TTL 固定 30 分钟,不续期 | 视频最长约 30 分钟,占位可能在任务还在跑时过期 | 小 |
| P1-2 | file 模式下 `reserveChannelSlot` 和 `startGenerationAttempt` 各计一次 | 本地测试上限只有一半,本地压测结论不可信 | 小 |
| P1-3 | 全满时报"渠道并发已满",图片还会触发一次无效自动重试 | 学生看到报错 + 多一次无意义重试 | 小 |
| P1-4 | 饱和切换没有专门测试;测试文件里有未使用的 import | 回归风险 | 小 |

## 5. 修复方案

按顺序执行,每步完成后跑相关测试和类型检查。

| 步骤 | 内容 | 涉及文件 |
|---|---|---|
| 0 | 先 `git pull` 同步远端 6 个提交(含登录限流修复、`postgres.ts` 表名登记,无逻辑冲突),再跑 `过程文件\更新开发地图.ps1` 和 `验证开发文档.ps1` | — |
| 1 | P0-1:占位、释放、路由预筛统一用 `config.model`(上游模型名,`toSystemGenerationChannel` 已赋值),不再用 `generationModelId` | `generation-attempt.ts`、四个 runtime、`video-generation-route.ts` |
| 2 | P1-2:`startGenerationAttempt` 不再重复 `acquireChannelSlot`,只由 `reserveChannelSlot` 计数一次 | `generation-attempt.ts`、`channel-concurrency.ts` |
| 3 | P0-3:释放挪到任务终态统一出口(成功 / 失败 / 取消 / 待核查),创建阶段抛异常时在 `finally` 里释放;释放失败打 `console.error`,不再静默 | 四个 runtime、四个任务的取消接口 |
| 4 | P0-2:`requestStructuredText` 在请求上游前占位,`finally` 释放(同步调用,生命周期清楚);占不到就按候选换下一个文本渠道 | `text-planning-runtime.ts` |
| 5 | P1-1:任务轮询时续期 `expires_at`;TTL 改为可配置,默认 60 分钟 | `channel-concurrency.ts`、轮询入口 |
| 6 | P1-3:全满时返回 HTTP 503 + `Retry-After`,文案"当前使用人数较多,请稍后再试";图片不再对饱和触发自动重试 | 四个任务接口 |
| 7 | P1-4:补测试——饱和切换、全满、取消释放、异常释放、规划调用占位;删除未使用的 import | 对应 `*.test.ts` |

## 6. 验收

- 本地:`pnpm run typecheck`、`pnpm run lint`、`pnpm test` 全部通过。
- staging(必须是 Postgres):给同一图片模型绑 3 个渠道、各设上限 2,同时发 8 个画布生图请求。预期 6 个分散到 3 个渠道,2 个快速收到"请稍后再试";任务结束后占位数归零。
- 取消一个进行中的任务,确认占位立即释放,不用等 TTL。
- 课堂前配置检查:每个画布用到的模型,所有渠道上限之和 ≥ 预估峰值并发。

## 7. 范围外,但会影响 10 月 8 日

- **登录限流**:`origin/develop` 已改为按设备 + 账号限流,窗口 2 分钟,不再按 IP。共享出口不会再卡住。本地落后,`pull` 后生效。
- **生成限流**:每人每分钟生图 20、生视频 6、生文 30;按 IP 还有 4 倍上限(生图 80/分钟、生视频 24/分钟)。80 人共用一个出口 IP 时,每分钟最多 80 张图、24 个视频,这会比渠道并发先卡住。是否对学校出口放宽属于安全设置,需要你们决定。
- **渠道数量**:并发控制只负责分流,总容量取决于渠道上限之和。上限加起来不够,学生照样会排不上。
