# 自建生成网关接入 + 渠道灰度分流

日期：2026-11-19
范围：`VOZEB-PRO`（Next.js，`web/`）
状态：**方案已确认，待实施**
关联：自建网关 `https://api.test.gammablue-x.com`（blue-cloud）

---

## 1. 背景与目标

公司自建的生成网关已可用，需要接入并逐步替代第三方渠道。本次只接四个模型：

| 能力 | 模型 | 生产启用 |
|---|---|---|
| 图片 | `gpt-image-2` | 是 |
| 视频 | `cdance2.0-0807` | 是 |
| 视频 | `cdance2.0-fast-0807` | **否**（本次不启用） |
| 视频 | `cdance2.0-mini-0807` | **否**（本次不启用） |

三个目标：

1. 让自建渠道能被现有代码正确调用（当前接不上，见第 2 节）。
2. 加**真百分比灰度**能力，以后所有渠道替换都要用它。
3. 自建渠道与第三方**并存**，通过权重逐步放量 10%→20%→30%→50%→100%。

生产暂用测试地址 `api.test.gammablue-x.com`（生产可访问，已验证），正式地址上线后只改渠道 `baseUrl`，不动代码。

---

## 2. 现状：两个阻断问题（已实测）

### 2.1 查询接口必须 POST，代码只会发 GET

网关的 `tasks/detail` 只接受 POST body：

| 请求 | 实测结果 |
|---|---|
| `GET /aiservice/images/tasks/detail?taskId=xxx` | HTTP 500 `{"code":0,"msg":"unknown error"}` |
| `POST /aiservice/images/tasks/detail` body `{"taskId":"xxx"}` | HTTP 200，正常返回 |

现有代码两处轮询都只发 GET：

- 图片：`web/src/app/api/image-tasks/image-task-custom.ts:204` — `taskFetch(config, url, { headers, cache, signal })`，无 method，即 GET
- 视频：`web/src/lib/server/video-task-runtime.ts:339` — `fetchInternalApi(url, { headers, cache, signal })`，同样 GET

结论：无论 DB 怎么配，轮询阶段必然失败。

### 2.2 成功码 `code:1` 被判为业务失败

`isProviderBusinessError`（`web/src/lib/server/provider-task-config.ts:134`）对 `code` 的白名单为：

```ts
["0", "200", "201", "202", "ok", "success"]
```

**不含 `1`**。网关成功响应正是 `{"code":1,"msg":"ok","result":{...}}`。

真实代码验证结果：

```
readProviderError({code:1,msg:"ok",result:{taskId:"abc"}}) → "ok"
isProviderBusinessError({code:1,msg:"ok",result:{taskId:"abc"}}) → true   ← 成功被判失败
```

该函数被 9 个模块共用，非测试调用点：

| 模块 | 调用点 |
|---|---|
| `admin/models/route.ts` | :204 |
| `image-tasks/image-task-custom.ts` | :163, :214 |
| `video-generation-tasks/video-generation-route.ts` | :746, :888 |
| `audio-task-runtime.ts` | :164, :462 |
| `runninghub-provider.ts` | :158 |
| `text-planning-runtime.ts` | :403 |
| `text-task-runtime.ts` | :216, :246, :269 |

改动必须保持**默认行为零变化**，否则会波及全部存量渠道。

### 2.3 结果地址无需二次转存

网关已把结果写入我们自己的 OSS。实测返回：

```
图片：https://vozebpro.oss-cn-guangzhou.aliyuncs.com/vozeb-pro/aiservice/images/20261119/<taskId>.png?Expires=...&Signature=...
视频：https://vozebpro.oss-cn-guangzhou.aliyuncs.com/vozeb-pro/aiservice/videos/20261119/<taskId>.mp4?Expires=...&Signature=...
```

实现时需确认 `registerGenerationTaskAssets` 是否触发下载再上传；若触发，对该渠道跳过。

---

## 3. 方案

### 3.1 新增两个协议字段（不新增协议类型）

在 `SystemChannelAdvancedConfig`（`web/src/lib/auth/store-types.ts:205`）增加：

```ts
/** 任务查询的 HTTP 方法。不声明 = GET，存量渠道行为不变。 */
queryMethod?: "GET" | "POST";
/** POST 查询时的请求体模板，支持 {{taskId}} 占位。不声明 = {"taskId":"{{taskId}}"} */
queryBodyTemplate?: string;
/** 渠道声明的成功码。命中即视为成功，不走默认白名单。不声明 = 现有白名单。 */
successCodes?: string[];
```

**为什么加字段而不是加协议**：两个缺口是通用能力缺失，任何用 POST 查任务、或用非标准成功码的网关都会遇到。新增 `bluecloud` 协议意味着把提交+轮询逻辑在图片、视频各写一遍，后续第三个网关还得再抄一遍。

先例：`videoRatioMode`、`promptExpansionModes`、`keyframeReferenceExclusive` 都是这样以可选字段形式加入 `capabilityProfile` 的，未声明即保持原行为。

### 3.2 改动 A：支持 POST 查询

**图片**（`image-task-custom.ts:201-208`）：按 `config.advancedConfig.queryMethod` 决定方法，POST 时带 `queryBodyTemplate` 渲染后的 body。

注意 `imageTaskPollUrls` 生成的是 URL 列表，POST 时 URL 不变（`queryPath` 本身即是 `/aiservice/images/tasks/detail`），taskId 走 body。

**视频**（`video-task-runtime.ts:323-343`）：`queryVideoUpstream` 同样按配置发 POST。

统一抽一个 helper 放在 `provider-task-config.ts`：

```ts
export function buildProviderQueryRequest(
    config: SystemChannelAdvancedConfig | undefined,
    taskId: string,
): { method: "GET" | "POST"; body?: string; headers?: Record<string, string> }
```

未声明 `queryMethod` 时返回 `{ method: "GET" }`，与现状完全一致。

### 3.3 改动 B：渠道可声明成功码

新增 helper：

```ts
export function isProviderResponseFailure(
    value: unknown,
    successCodes?: readonly string[],
): boolean
```

逻辑：

1. 若 `successCodes` 非空且响应 `code` 命中其中任一值 → **直接判定成功，返回 false**（短路，不再做后续关键词匹配）。
2. 否则回落到 `isProviderBusinessError(value)`，行为与现在逐字节一致。

`isProviderBusinessError` 本身**不改签名、不改逻辑**，避免波及 9 个共用模块。新增函数在图片/视频的调用点替换，其它模块继续用原函数。

**关键点**：短路必须在最前面。网关成功响应带 `msg:"ok"`，而现有逻辑会把 `msg` 当 `errorMessage` 去匹配关键词，必须先判成功码。

### 3.4 改动 C：真百分比灰度分流

现状（`logical-model-router.ts:42`）：

```ts
.sort((a, b) => a.priority - b.priority || (b.weight||100) - (a.weight||100) || ...)
```

权重只是**排序**的次级条件 → 排前面的优先用，失败才降级。这是故障转移顺序，不是流量比例。

改为：**同优先级组内按权重加权随机抽取，其余同组项作为故障转移后备**。

```ts
// 伪代码
const groups = groupBy(bindings, b => b.priority);
const ordered: Binding[] = [];
for (const group of sortedByPriority(groups)) {
    if (group.length === 1) { ordered.push(group[0]); continue; }
    const picked = weightedRandomPick(group);          // 按 weight 概率
    ordered.push(picked, ...group.filter(b => b !== picked));
}
```

规则：

- 不同 `priority` 仍然严格按优先级排序（保留现有语义）。
- 同 `priority` 组内按 `weight` 概率抽取首个候选，组内其余按权重降序作为后备。
- 组内所有 binding 显式 `weight === undefined` 时，退化为现有行为（按 weight 100 排序），保证存量渠道不变。
- 随机源可注入，便于测试（`random?: () => number`）。默认 `Math.random`。

灰度操作方式：自建渠道与第三方设**相同 priority**，通过 `weight` 配比控制比例。

| 阶段 | 自建 weight | 第三方 weight | 实际比例 |
|---|---|---|---|
| 10% | 10 | 90 | 10% |
| 20% | 20 | 80 | 20% |
| 30% | 30 | 70 | 30% |
| 50% | 50 | 50 | 50% |
| 100% | 100 | 0（或禁用） | 100% |

> 注意 `clampWeight` 当前要求 `> 0`（`model-routing-config.ts:447`）。100% 阶段用「禁用第三方 binding」实现，不要用 weight 0。

### 3.5 改动 D：不二次转存

确认结果入库路径不下载再上传。网关返回的 OSS URL 直接作为结果地址。

若 `registerGenerationTaskAssets` 存在转存逻辑，加渠道级跳过标记（渠道 `advancedConfig` 里一个布尔字段），默认不跳过。

### 3.6 改动 E：渠道与绑定配置

新建渠道（生产）：

| 字段 | 值 |
|---|---|
| name | 自建网关 blue-cloud |
| baseUrl | `https://api.test.gammablue-x.com` |
| apiFormat | `openai` |
| protocol | `custom` |
| authMode | `bearer` |
| enabled | true |
| practiceEnabled | false（先只上生产） |
| purpose | `production` |
| models | `gpt-image-2`、`cdance2.0-0807` |

**图片 modelConfig**（`gpt-image-2`）：

```
capability: image
createPath: /aiservice/images/tasks/submit
editPath:   /aiservice/images/tasks/submit
queryPath:  /aiservice/images/tasks/detail
queryMethod: POST
resultField: result.result.images
statusField: result.status
requestTemplate: {"model":"{{model}}","prompt":"{{prompt}}","n":1,"size":"{{size}}"}
editRequestTemplate: {"model":"{{model}}","prompt":"{{prompt}}","n":1,"size":"{{size}}","imageUrls":"{{image_urls}}"}
successCodes: ["1"]
supportsReferenceImage: true
```

**视频 modelConfig**（`cdance2.0-0807`）：

```
capability: video
createPath: /aiservice/videos/tasks/submit
queryPath:  /aiservice/videos/tasks/detail
queryMethod: POST
resultField: result.result.videoUrl
statusField: result.status
requestTemplate: {"model":"{{model}}","prompt":"{{prompt}}","duration":"{{duration}}","ratio":"{{ratio}}","resolution":"{{resolution}}"}
successCodes: ["1"]
supportsReferenceImage: true
supportsReferenceVideo: true
supportsReferenceAudio: true
```

**与现有 Seedance 模板的关键差异**：网关的参考素材是平铺字段 `firstFrameUrl` / `lastFrameUrl` / `referenceImageUrls[]`，不是 `content` 多模态数组。首尾帧与参考素材互斥。需要单独的参考素材渲染分支，不能复用 `{{content}}`。

**绑定**：追加到现有逻辑模型，与第三方同 `priority`：

| 逻辑模型 | 新 binding priority | 初始 weight |
|---|---|---|
| `gpt-image-2` | 与现有第三方相同 | 10（第三方 90） |
| `cdance2.0-0807` | 与现有第三方相同 | 10（第三方 90） |

只启用 `cdance2.0-0807`；`cdance2.0-fast-0807`、`cdance2.0-mini-0807` 保持停用。

---

## 4. 测试计划

### 单元测试

1. `buildProviderQueryRequest`
   - 未声明 `queryMethod` → `{method:"GET"}`，无 body
   - `queryMethod:"POST"` 未给 template → body 为 `{"taskId":"<id>"}`
   - 自定义 `queryBodyTemplate` 正确渲染 `{{taskId}}`

2. `isProviderResponseFailure`
   - `successCodes:["1"]` + `{code:1,msg:"ok"}` → false（成功）
   - `successCodes:["1"]` + `{code:10007,msg:"task not found"}` → true（失败）
   - 不传 `successCodes` + `{code:1,msg:"ok"}` → true（**保持现有行为**，回归保护）
   - 不传 `successCodes` + `{code:0,...}` / `{code:200,...}` → false（现有行为）

3. `isProviderBusinessError` 回归
   - 全部现有测试必须原样通过，函数签名与行为不变

4. 灰度分流
   - 注入确定性随机源，验证同 priority 下 weight 10/90 的分流比例
   - 不同 priority 仍严格按优先级
   - 同组全部无 weight → 退回现有排序
   - 灰度选中的候选失败后，能降级到同组后备

### 集成验证（staging 优先）

1. 用自建渠道单独跑通图片（文生图 + 图生图）与视频（文生视频 + 首帧）
2. 权重 100% 自建，连续 10 次成功率与耗时
3. 权重 10/90 灰度，观察两边都有请求且都成功
4. 确认结果 URL 指向我们自己 OSS，且**没有二次转存**（对比对象存储文件数或 url 是否被改写）

---

## 5. 实施顺序

1. 写字段 + helper + 单测（改动 A、B）
2. 灰度路由 + 单测（改动 C）
3. 图片/视频两处轮询接入 POST 与成功码
4. 核对转存路径（改动 D）
5. staging 部署验证
6. 生产建渠道 + 绑定（初始 10%）
7. 观察无异常后按 10→20→30→50→100 提升

**灰度阶段任何一步出现失败率上升，立即把自建 weight 调回上一档或禁用 binding。**

---

## 6. 风险

| 风险 | 处置 |
|---|---|
| `isProviderBusinessError` 被 9 个模块共用，改动波及面大 | 不改原函数，新增独立函数，只在图片/视频调用点替换 |
| 灰度随机逻辑影响全部渠道的路由 | 同 priority 组内全部无 weight 时退化到现有排序；加回归测试 |
| 生产暂用测试域名 | `baseUrl` 是渠道配置，正式地址上线后改 DB 即可 |
| 网关返回签名 URL 有有效期（2 小时） | 现有结果入库后是否依赖长链？需在验证阶段确认，必要时改用 `key` 字段长期保存 |
| 参考素材字段结构与现有 Seedance 不同 | 单独渲染分支，不复用 `{{content}}` |

---

## 7. 待补充确认

- 结果 URL 的 2 小时过期问题：是否需要落库存 `images[].key` / `videoKey` 以支持重新签名（与 OSS 侧确认签名策略）。
