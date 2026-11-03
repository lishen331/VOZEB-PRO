# 图生图大图返回后本地栈溢出（Maximum call stack size exceeded）

- 发现：2026-10-22 09:28，用户截图（彭梓瑜，gpt-image-2-c，画布）
- 级别：严重。上游已出图、大概率已扣费，用户拿不到图，任务失败
- 状态：原因未定位到具体代码行；生产已回滚到 v0.8.14 观察
- 前情：[2026-10-08 同名报错](2026-10-08-1545-image-rangeerror-after-200.zh-CN.md)，当时修了诊断脱敏（`ba0ea742`），这次不是那一处

## 现象

带参考图的图生图（`kind=edit`，`/images/edits`，`response_format=b64_json`），上游返回 200，响应体 4.5MB 以上时，本地处理报 `RangeError: Maximum call stack size exceeded`，任务失败。自动重试一次，重试再拿到大图也失败。

- 只影响 edit。文生图（generation）同期没有出现
- 渠道不限：EasyArt（`_-eQ3SntRYtuDZz9mJ_OK`）、兔子（`hr5VKuKJKirZ1-sdRZPY5`）、ModelBay（`X9te4qOV0ZaPsJpErRRWS`）都有
- 模型：gpt-image-2-c、gpt-image-2、gpt-image-2-all、gpt-image-2-text-to-image、gpt-image-2-image-to-image

## 证据

单条链路（task `00bc0720`，09:47）：

| 阶段 | 说明 |
|---|---|
| upstream_request | POST `api.easyart.cc/v1/images/edits`，`size=1824x1024`、`response_format=b64_json` |
| upstream_response | 200，耗时 130s |
| upstream_body_complete | 完整读完，`responseBytes=4219317`（等于 content-length） |
| transport_response | 内部代理回 200 |
| provider_exception（+61ms） | `RangeError: Maximum call stack size exceeded` |

按"每次上游返回 >4.5MB 的 edit 响应"统计（不是按任务）：

| 时段（北京时间） | 运行版本 | 大图次数 | 栈溢出 |
|---|---|---|---|
| 10-21 14:47 ~ 10-22 02:29 | v0.8.14 | 41 | 0 |
| 10-22 02:36 ~ 04:58 | v0.8.15 | 0 | — |
| 10-22 04:58 ~ 11:06 | v0.8.16 | 24 | 24 |
| 10-22 11:06 ~ 11:41 | v0.8.15（回滚） | 5 | 4 |
| 10-22 11:41 ~ 16:38 | v0.8.14（回滚） | 43 | 28 |
| 10-22 16:38 起 | v0.8.15（按用户要求恢复，带溢出 403 修复） | 17（截至 18:52） | 11 |

18:47 热更新（只加日志）：在 `traceMediaException` 里，遇到 RangeError 时把调用栈前 60 帧打到 `console.error("[vz-stack]", …)`，并把 `Error.stackTraceLimit` 提到 60。改了 4 个编译后的 chunk（两个容器都改了），语法检查通过，app 重启后 healthy。备份后缀 `.bak-20261022-184721`。不改业务逻辑。

v0.8.14 期间溢出任务 53 个全部失败（溢出 403 未修），16:38 按用户要求恢复到 v0.8.15。

v0.8.14 期间同参数（`gpt-image-2-c`、`1824x1024`、无 quality、多张参考图）、同大小（6～8MB）都成功，最大一次 13.9MB 也成功。

## 已排除

- **不是 Node 版本**：v0.8.14 镜像是 Node 22.23.3，v0.8.15/16 是 22.23.4。两个镜像里跑同一个探针，结果一致
- **不是 10-08 那处脱敏**：`redactDiagnosticText` 已截断到 16KB 才跑正则，生产 bundle 里确认存在截断
- **不是 JSON 解析和取图**：在生产容器里用 7MB b64 JSON 测 `JSON.parse`、`fetch().json()`、`new URL(dataUrl)`、`Buffer.from`、`image-task-support.ts` 里的取图正则，都不溢出
- **本地复现失败**：用 Node 22.23.4 + 9 种响应形态（b64_json / url 放 b64 / data URL / jpg / png）走 `findImageResults` + `parseImagePayloadOrPoll`，以及完整走 `runOpenAiImageTask`（edit + 本地假上游返回 7MB），都成功

## 已确认的线索

- 生产容器里，正则 `/[A-Za-z0-9+/=]{256,}/g` 对 7MB 的 base64 串会栈溢出（两个 Node 版本都会）。源码里只有诊断脱敏用到它，且已截断。不能排除还有别的调用方把整段大字符串传进类似的正则
- 异常在 `withMediaDiagnosticScope("image", task, "provider", …)` 内抛出，`response.json()` 已成功（否则会记 `response_parse_exception`）
- 日志只记了 `errorName` / `errorMessage`，没有栈，所以定位不到具体行

## 原因（未确认）

两种可能，现在的数据分不开：

1. **v0.8.15 / v0.8.16 引入**：v0.8.14 期间 41 次全成功，之后 28 次有 28 次失败（11:06 后 v0.8.15 也 4/5 失败）。v0.8.15 在这条路径上只多了两个溢出用请求头；v0.8.16 动了结果读取、诊断记录、内部代理
2. **今天上游返回内容变了**：今天的大图大多来自同几张参考图（如 5238265 字节的 png 被反复使用），如果上游返回体里多了某个超长字段（例如 `revised_prompt` 或 `usage` 里带了整段 base64），可能触发其它处理逻辑。我们没有保存响应体，无法核对

11:41 起回滚到 v0.8.14，用来区分这两种可能：v0.8.14 下如果大图恢复成功，就是 1；仍失败，就是 2。

## 修复方向

1. **先拿到栈（下课后做）**：在 `traceMediaException` 和 `provider_exception` 的诊断里加上 `error.stack` 前 30 帧（只存函数名和文件行号，不存数据）。发到测试环境，用约 7MB 的 b64 响应复现一次，或等生产下一次出错
2. **定位后修根因**：把对大字符串跑的正则改成先截断或分块；补一个约 7MB b64 响应的单测
3. **分类修正**（与 10-08 结论相同）：上游已 200 且 body 完整时，本地处理异常不该按"上游失败"自动重试。重试会再扣一次费，大概率再失败
4. **核对扣费**：今天失败的这批任务，上游已出图，需要按请求 ID 和渠道账单核对，确认是否退款

## 验证

```sql
-- 回滚到 v0.8.14（2026-10-22 03:41:44 UTC）之后，大图 edit 是否还有栈溢出
with resp as (
  select exists (select 1 from jsonb_array_elements(t.diagnostic_events) e2
                 where e2->>'phase'='provider_exception' and e2->>'errorName'='RangeError'
                   and (e2->>'at')::bigint between (e->>'at')::bigint and (e->>'at')::bigint + 5000) as overflow
  from vozeb_pro_generation_tasks t, jsonb_array_elements(coalesce(t.diagnostic_events,'[]'::jsonb)) e
  where t.task_type='image' and t.created_at > '2026-10-22 03:41:44+00'
    and e->>'phase'='upstream_body_complete' and (e->>'responseBytes')::bigint > 4500000)
select count(*), count(*) filter (where overflow) from resp;
```

修复后：同一张 5MB 参考图做 16:9 图生图 3 次，都成功；上面的 SQL 栈溢出为 0。

## 观察记录

- 11:41 回滚到 v0.8.14 后，前 5 次大图 edit 全部成功（兔子 4 次 7.2～7.8MB，EasyArt 1 次 6.5MB）
- **12:02 v0.8.14 下也出现 1 次**：task `0cade6ac`，第一家兔子 `gpt-image-2` 返回 7.0MB 后栈溢出；自动重试溢出到 ModelBay，报 403（这是 v0.8.14 里还没修的溢出 403，预期内）
- **13:39 v0.8.14 下第 2 次**：task `9473bd51`，EasyArt `gpt-image-2-all` 大图后栈溢出；重试溢出到 ModelBay，报 403
- 13:56 第 3、4 次：task `8c73034a`，EasyArt `gpt-image-2-c` 栈溢出，重试溢出到兔子报 403
- 回滚到 v0.8.14 后的溢出任务 10 个，10 个全部失败（溢出 403 没修）。栈溢出失败后的自动重试经常走溢出，所以两个问题叠在一起，用户拿不到图
- 所以"v0.8.15 引入"的结论不成立，v0.8.14 也会触发，只是概率低得多：v0.8.14 昨天 0/41、今天 1/6；v0.8.15 4/5；v0.8.16 24/24。触发条件除了响应体大小，还有别的因素（负载、并发、同进程里的其它状态等），目前未知

### 版本差异（仍可能是加重因素）

v0.8.14 镜像（`sha-2b99976f`）和 v0.8.15 镜像（`sha-bc2643a5`）的差别只有两项：

1. **代码**：溢出 403 修复的两个提交（`3f317ca1` 签名路由头 + 溢出被拒换一次，`13030fb9` 格式化）。改动在 `system-ai-billing.ts`、`system-ai-proxy-policy.ts`、内部代理 `route.ts`、`image-task-support.ts` 的 `taskHeaders`、`image-task-runtime.ts`。表面上都不处理大字符串，非溢出任务不带新请求头
2. **运行环境**：镜像重新构建时基础镜像 `node:22-bookworm-slim` 从 Node 22.23.3 升到 22.23.4。依赖由 lockfile 固定，不变

下课后用测试环境分开验证：同一份 v0.8.15 代码分别用 Node 22.23.3 / 22.23.4 构建，各跑一次约 7MB b64 的图生图。哪个失败就是哪个原因。如果是 Node 版本，修复是在 Dockerfile 固定 `node:22.23.3-bookworm-slim`，再查清 22.23.4 下哪段代码爆栈

### 19:30 定位进展

**新规律：问题跟着进程走，不跟着版本走。** 按每次重启分段，列出每次大图返回的结果（`.` 成功，`X` 栈溢出）：

| 重启 | 序列 |
|---|---|
| v0.8.16 @04:58（第一次大图在 09:13，进程已跑了 4 小时） | `XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |
| v0.8.15 @11:06 | `.XXXXX` |
| v0.8.14 @11:41 | `.....X....XXXXXX.XXXXX.....XXXXXXXXXXXXXXXXXX` |
| v0.8.15 @16:37 | `......XXXXXXXXXXX` |
| v0.8.15+日志 @18:47 | `.` |

每次重启后，前几次大图都能成功，之后几乎全部失败，一直持续到下次重启。所以问题不在单次请求本身，而是进程里有东西随请求越积越多，积到一定程度后，同样的处理就会爆栈。这也解释了为什么在新进程里怎么都复现不出来。

**其它特征（11:41～16:37，45 次大图）：**
- 从拿到完整响应到出结果的耗时：成功 30～80ms，失败 100～300ms。失败的那些在爆栈前做了更多工作
- 和渠道、模型、参考图数量和大小、并发都没有关系（同时在处理的大图几乎都是 0）

**已排除：**
- 扫了生产镜像里全部 2774 个服务端 chunk、2062 个正则字面量，用 7MB base64 逐个测。和这条链路相关、会爆栈的只有 `/[A-Za-z0-9+/=]{256,}/g`（诊断脱敏），但 5 份副本都已截断到 16KB，不是它。另外两个会爆栈的（`exceljs` 的函数参数解析、`navigator` 判断）不在这条链路上
- 取图链路上的正则先在小字符串上跑 6000 次预热，再跑 7MB，都不爆栈。排除"V8 正则编译升级后才爆栈"

**还没确定的：** 进程里是什么在累积。等日志抓到 `[vz-stack]` 调用栈后就能确定。18:47 加完日志后只来过 1 次大图（重启后第一次，成功），下课后流量很少，还没触发到。

### 21:41 手动复现（未复现）

- 21:41 按用户要求把生产换到 v0.8.16（`sha-0127c014`），21:44 重新打上栈日志热更新（备份 `.bak-20261022-214403`）
- 21:51～22:15 用管理员账号在同一进程里串行提交 12 次图生图：模汇X中漫 `gpt-image-2-c`、16:9、每次一张不同的 1600×900 参考图（以 data URL 内联提交）
- 结果：**12/12 成功**，上游返回 4.6～7.0MB，栈溢出 0，`[vz-stack]` 没有输出
- 和课堂的差别：课堂的参考图是已上传的站内素材（`serverUrl` 指向 `/api/reference-assets/...`，要经内部接口读取），今晚是内联 data URL；课堂同时有多人、视频任务和溢出重试并发，今晚只有这一路请求。所以单靠"同一进程处理的大图数量"不能触发，触发条件还在这些差别里

### 10-23 09:37 定位到了（v0.8.18 固定日志抓到调用栈）

task `3c30b215`、`12a74e4f`，同一条栈：

```
RegExp.test (<anonymous>)
ee  = rawImageBase64DataUrl   ← /^[a-z0-9+/=_-]+$/i.test(整段 base64)
Z   = resolveImageBase64Like
e   = collectImageResults（递归）
Y   = findImageResults
z   = parseImagePayloadOrPoll
eI  = parseChargedImageResponse
```

**根因**：`image-task-support.ts` 的 `rawImageBase64DataUrl` 用 `/^[a-z0-9+/=_-]+$/i.test(base64)` 校验上游返回的整段 b64（数 MB）。V8 正则在长输入上会爆栈。不是每次都爆，取决于 V8 当时为这个正则选的执行方式（解释器还是编译后），所以表现成"新进程前几次能成功，之后几乎都失败"。前面单独测这个正则没复现，是因为测试进程是新起的。

`resolveImageBase64Like` 里的 `/^[a-z0-9+/=_-]+$/i.test(...)` 也是同一个问题。

**修复方向**：不用正则扫整段，改成逐字符检查（`charCodeAt` 循环），或者只检查前后各几 KB 再交给 `Buffer.from` 解码校验。两处都要改。补一个约 7MB b64 的单测，并在同一进程里先把正则跑热，再跑一次大输入。

<!-- LOG -->
