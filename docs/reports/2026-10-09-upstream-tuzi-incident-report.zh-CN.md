# 2026-10-09 兔子上游图片服务课堂故障报告（脱敏对外版）

## 1. 简要概述

本报告用于向兔子上游核查 **2026-10-09 下午课堂**的图片调用异常。课堂于北京时间约 **18:11** 结束；任务纳入范围以本地最终快照中的截止时间 **18:11:15** 为准，快照查询时间为 **18:14:24.210765**。全文时间统一为北京时间（UTC+8），毫秒级 Unix 时间戳保留原值，不把 request ID 内部的日期串当成请求时间。

已确认两次上游 HTTP 503 明确报告 CPU 过载：`92.1%`、`92.6%`，两次声明阈值均为 `90%`。这描述的是**上游返回的 CPU 信息**，不是 VOZEB 服务器 CPU。另有内容政策拒绝、缺少原图的 400，以及一笔平台等待约 600 秒后中止的请求。错误类型必须分开处理，不能全部称为“上游宕机”。

### 下午课堂平台终态（最终快照 E1）

| 兔子模型 | 平台任务数 | 成功 | 自然失败 | 人工结束为失败 | 待确认 | 进行中 |
|---|---:|---:|---:|---:|---:|---:|
| `gpt-image-2` | 50 | 43 | 4 | 3 | 0 | 0 |
| `gpt-image-2.5-sunburst` | 50 | 43 | 0 | 7 | 0 | 0 |
| **合计** | **100** | **86** | **4** | **10** | **0** | **0** |

定位：E1 `$.afternoonByModel[6]`、`$.afternoonByModel[7]`，并逐笔核对 `$.afternoonTasks` 中兔子渠道任务。**86/100=86% 是平台成功交付比例，不是上游生成成功率；10 笔人工失败是平台收尾方式，不代表上游最终未生成。** 本报告对 14 笔平台失败任务逐笔核对诊断：2 笔 503 CPU 过载、7 笔 451 内容拒绝、2 笔内容政策 400、2 笔要求原图 400、1 笔超时中止。此分类限定上述平台任务与本地记录，不替代上游接单、生成及计费台账。

### 与同日上午限速复测严格分离（E7）

上午另有独立 `gpt-image-2.5-sunburst` 限速复测：91 个测试任务，9 张×10批＋1张，共 **11 批**；原报告首句“10批”与其批次明细矛盾，本报告以明细为准。前端滚动 1 秒峰值 9，Worker 上游实际峰值 11。该报告记录上游响应 88×200、1×429、1×502、1×503，无栈溢出和 `upstream_body_exception`；平台终态为 39 成功、50 失败、2 待确认，其中 **49 笔是平台 OSS 上传链路错误**，不得归责为兔子生成失败。上午 503 原文为 `No available compatible accounts`，也不得与下午 CPU 过载混为同一原因。本段来自已有复测报告，未重新调用上游、未将上午数字加入下午 100 笔。

## 2. 范围、协议与模型

- 供应商域名：`api.tu-zi.com`；本地渠道 ID：`hr5VKuKJKirZ1-sdRZPY5`。
- 本报告仅涉及 `gpt-image-2`、`gpt-image-2.5-sunburst`；不外披其他供应商渠道、价格或额度。
- 请求端点：`POST /v1/images/generations` 与 `POST /v1/images/edits`。14 笔异常的诊断均指向兔子域名。
- `provider_start.protocol` 为 `newapi`，记录中的 `transport_policy` 为 `http/1.1`。这是实际采样配置，不是故障原因证明；本地证据不支持“HTTP/1.1 导致过载、拒绝或超时”的确定性结论。
- 首笔 CPU 过载案例请求为 `gpt-image-2`、`2720x1536`、`quality=medium`、`n=1`、`response_format=b64_json`、`output_format=png`、`referenceCount=0`（E2 `$.events[4]`、`$.events[8]`）。不能据此泛化所有请求的尺寸、质量或参考图数量。
- 平台 `taskId` 是本地任务身份；响应 `requestId` 是上游诊断关联 ID。二者均不自动等于可查询上游生成任务 ID。本报告不包含提示词、参考图、账号、密钥或完整签名 URL。

## 3. 逐笔案例表与错误原文

以下为下午 14 笔平台失败任务的完整脱敏清单。“人工”与“自然”指平台结束方式。事件时间为 `upstream_response.at`；无响应的一笔为 `upstream_exception.at`，不能当作已收到 HTTP 状态。

| 北京时间 / 原始 at（ms） | 模型 / 端点 | 平台 taskId | HTTP或异常 / durationMs | 上游 requestId | 平台收尾 / E1 精确定位 |
|---|---|---|---|---|---|
| 15:19:43.765<br>`1791530383765` | `gpt-image-2`<br>`images/generations` | `f786abb9-13f1-46c6-83dd-a0d687289fd4` | `400` / `19764` ms | `202610090719265650786038268d9d6ZyczHNQk` | 自然 → `error/completed`<br>`$.afternoonTasks[5].diagnostic_events[9]` |
| 15:19:48.560<br>`1791530388560` | `gpt-image-2`<br>`images/generations` | `7d271a43-9ed4-4537-93d3-ed50d6536173` | `503` / `297` ms | `202610090719484330082578268d9d6DQyVSbT8` | 人工 → `error/completed`<br>`$.afternoonTasks[7].diagnostic_events[9]` |
| 16:03:44.802<br>`1791533024802` | `gpt-image-2`<br>`images/edits` | `8524455e-25bc-426d-948f-b5632ecc07bc` | `400` / `28006` ms | `202610090803187571774608268d9d6ZqqD0hln` | 自然 → `error/completed`<br>`$.afternoonTasks[63].diagnostic_events[9]` |
| 16:51:27.742<br>`1791535887742` | `gpt-image-2`<br>`images/edits` | `ddc12752-f054-43de-bc24-f3cb4ee64a07` | `503` / `98377` ms | `202610090851276234613868268d9d6udBmUPtn` | 人工 → `error/completed`<br>`$.afternoonTasks[134].diagnostic_events[9]` |
| 17:01:50.135<br>`1791536510135` | `gpt-image-2`<br>`images/edits` | `7c5aeb6f-5a30-4d58-8ad9-0f7bfb39bef9` | `ResponseAborted` / `599938` ms | `未取得` | 人工 → `error/completed`<br>`$.afternoonTasks[148].diagnostic_events[10]` |
| 16:55:30.988<br>`1791536130988` | `gpt-image-2`<br>`images/generations` | `b6e86177-341c-4a3d-ba5d-60e1daace0be` | `400` / `13653` ms | `202610090855192546487378268d9d6nU2AA7dn` | 自然 → `error/completed`<br>`$.afternoonTasks[160].diagnostic_events[9]` |
| 16:56:45.479<br>`1791536205479` | `gpt-image-2`<br>`images/generations` | `de804300-645e-4f9c-a587-632dd8774194` | `400` / `18909` ms | `202610090856275085874778268d9d63NPKZoIr` | 自然 → `error/completed`<br>`$.afternoonTasks[162].diagnostic_events[9]` |
| 17:08:47.704<br>`1791536927704` | `gpt-image-2.5-sunburst`<br>`images/edits` | `98adc0e9-d2a0-4092-9bd0-4839c209f556` | `451` / `273878` ms | `202610090907355827663458268d9d6d4eF7N4B` | 人工 → `error/completed`<br>`$.afternoonTasks[193].diagnostic_events[9]` |
| 17:21:39.306<br>`1791537699306` | `gpt-image-2.5-sunburst`<br>`images/edits` | `6cbb68ce-7564-43d8-b0b4-ba830c250867` | `451` / `220151` ms | `202610090921177192126118268d9d6JBgI7OxY` | 人工 → `error/completed`<br>`$.afternoonTasks[236].diagnostic_events[9]` |
| 17:26:23.030<br>`1791537983030` | `gpt-image-2.5-sunburst`<br>`images/edits` | `c0b741ae-0cbe-495e-a3e0-3a0da897b374` | `451` / `25728` ms | `202610090926058105496278268d9d6fiaE8n5c` | 人工 → `error/completed`<br>`$.afternoonTasks[263].diagnostic_events[9]` |
| 17:29:35.034<br>`1791538175034` | `gpt-image-2.5-sunburst`<br>`images/edits` | `d1a03dbe-73a8-42bb-81ed-d900e2edcd2b` | `451` / `63468` ms | `202610090929134457289818268d9d6M3KYkRq4` | 人工 → `error/completed`<br>`$.afternoonTasks[272].diagnostic_events[9]` |
| 17:32:35.242<br>`1791538355242` | `gpt-image-2.5-sunburst`<br>`images/edits` | `cdadaee0-30c1-4943-b571-05ec2a8408b5` | `451` / `54371` ms | `202610090932202978111618268d9d60VPZZNJd` | 人工 → `error/completed`<br>`$.afternoonTasks[284].diagnostic_events[9]` |
| 17:45:06.237<br>`1791539106237` | `gpt-image-2.5-sunburst`<br>`images/edits` | `ae5d18fc-5bef-4447-b4fe-9c937df9089c` | `451` / `100064` ms | `202610090944293562843238268d9d6hdLQCiPL` | 人工 → `error/completed`<br>`$.afternoonTasks[325].diagnostic_events[9]` |
| 17:52:24.633<br>`1791539544633` | `gpt-image-2.5-sunburst`<br>`images/edits` | `031366a0-64ef-42e0-bf69-f8d20b86c6e3` | `451` / `26026` ms | `202610090952058489213288268d9d6ZBqQn9WB` | 人工 → `error/completed`<br>`$.afternoonTasks[340].diagnostic_events[9]` |


### 3.1 CPU 过载 503 原文及平台误分类链

```text
system cpu overloaded (current: 92.1%, threshold: 90%)
system cpu overloaded (current: 92.6%, threshold: 90%)
```

第一笔独立原始证据 E2：`$.events[9]` 记录 HTTP 503、`durationMs=297`、响应时间 `1791530388560`；`$.events[10..11]` 记录正文完整读取 `143` 字节。随后平台 `1791530388583` 抛出 `GenerationSubmissionUncertainError`，在 `1791530388588` / `1791530388595` 进入 `needs_review`（`submission_result_unknown` / `submission_outcome_unknown`）。**CPU 错误来自上游；把明确过载错误继续挂为待确认属于平台错误分类边界。** 是否允许安全重试仍需上游确认“过载拒绝前/后是否接单、是否计费”的契约，不凭状态码推断。

第二笔 E1 `$.afternoonTasks[134].diagnostic_events[9]` 为 `durationMs=98377`，不是 297 ms；不能将两次拒绝都描述为立即返回。两笔均已平台人工结束，但这不取代上游对接单状态的确认。

### 3.2 451 内容拒绝原文

前六笔 451 的共同错误主句（原文节选，request ID 各不相同且已保留在上表）：

```text
请求因内容安全策略被拒绝，修改提示词或参考图再试
```

最后一笔 `031366a0-64ef-42e0-bf69-f8d20b86c6e3` 的记录原文为：

```text
请求因内容安全策略被拒绝
```

该类是上游明确的业务拒绝；本地没有证据判断审核是否误判，也不将其认定为上游基础设施故障。E4、E5 和 E1 均显示部分 451 曾落入平台 `needs_review`；课堂收尾将其结束为 `error/completed`，并未伪造结果。**应由平台改正拒绝识别与终态呈现，不应让内容拒绝长期等待、盲目重提或自动改写提示词。** 上游需说明稳定错误码、审核阶段、计费语义及正常申诉路径。

### 3.3 内容政策 400 与缺原图 400 分开

内容政策 400，第一笔原文（完整 error 字符串）：

```text
非常抱歉，该提示可能违反了我们的内容政策。如果你认为此判断有误，请重试或修改提示语。 (request id: 202610090719265650786038268d9d6ZyczHNQk)
```

第二笔内容政策 400 的原文开头（节选）：

```text
非常抱歉,生成的图片可能违反了关于轻度性暗示或挑逗性主题的防护限制。
```

缺原图两笔原文首句分别为（节选，保留不同措辞）：

```text
请上传需要去水印的原图。
请上传需要去水印的图片。
```

`b6e86177-341c-4a3d-ba5d-60e1daace0be` 与 `de804300-645e-4f9c-a587-632dd8774194` 的 `provider_start.referenceCount=0`，实际端点均为 `images/generations`（E1 任务索引 160、162 的 `diagnostic_events[4]` 与 `[8..9]`）。记录支持“提交链路未带参考图”，**不支持“参考图在传输途中丢失”**。当时是否连接图片、前端为何使用 generation 路由，仍需平台/用户操作证据核查；当前没有相关浏览器事件或可脱敏复现材料。这两笔是自然失败，不是人工冒充生成结果，也不能单凭上游措辞断言其审核或路由实现错误。

### 3.4 无 HTTP 响应的超时案例

`7c5aeb6f-5a30-4d58-8ad9-0f7bfb39bef9`（`gpt-image-2` / `images/edits`）：

```text
transport_exception: TimeoutError
errorMessage: The operation was aborted due to timeout
durationMs: 599999
upstream_exception: ResponseAborted
errorMessage: ""
durationMs: 599938
```

原始事件定位 E1 `$.afternoonTasks[148].diagnostic_events[9..10]`，`at=1791536510133`、`1791536510135`。本地诊断没有该笔 `upstream_response` 或可查询上游任务 ID；平台随后进入待确认并人工结束。**确认的是本地等待超时/中止，不是上游返回 HTTP 504，也不是确认上游没有生成。** 需要上游按调用时间、端点与经授权的关联材料查找实际接单和结果。

## 4. 确认事项、未知事项与平台责任边界

| 事项 | 本地已确认 | 仍未知 / 责任边界 |
|---|---|---|
| CPU 过载 | 两笔真实上游 HTTP 503；阈值原文均 90% | 上游资源饱和范围、准入位置、是否接单/计费，以及扩容或容量安排未取得 |
| 内容拒绝 | 七笔 451、两笔内容政策 400；上游明确给出拒绝语义 | 无证据判断审核是否误判；平台把部分明确拒绝送入待确认需改正 |
| 缺原图 | 两笔 400；参考数 0、generation 路由 | 图片是否由用户连接、前端路由原因待核；不归责为已证实的传输丢图 |
| 超时 | 一笔约 600 秒后 TimeoutError / ResponseAborted，未见 HTTP 响应 | 无法确认上游有没有接单、生成、收费或结果可恢复 |
| 平台人工收尾 | 10 笔人工失败、4 笔自然失败；最终待确认/进行中均为 0 | “error/completed”不是上游最终状态，不以人工失败消除上游未知 |
| 下午成功交付 | 平台 86 笔 success | 没有上游逐笔生成/计费对账，不可换算供应商 SLA 或最终生成成功率 |
| 上午 OSS | 已有报告记录 49 笔外部存储上传失败 | 平台存储链路责任，与下午上游 CPU 拒绝严格分离 |
| HTTP/1.1 | 采样有 transport_policy 记录 | 无对照实验，不作因果归责 |

本报告只读取已有本地材料并生成文档，未调用上游、未修改数据库、未部署或修改生产业务代码。历史人工收尾由已有诊断和快照说明，不是本报告新执行的操作。

## 5. 请兔子上游处理事项

1. **按上表 request ID 逐笔回查**：给出接收时间、是否准入/排队、生成状态、拒绝阶段、实际计费及撤销状态。对无 request ID 的超时任务，请确认可用检索字段和安全提交方式；平台另行按授权提供必要关联信息。
2. **CPU 过载与准入**：说明 90% 阈值含义、统计口径、触发节点/时间窗口及拥塞原因；提供容量恢复与资源措施，解释为何第二次 503 已等待 `98377 ms`。无需返回其他客户信息。
3. **可查询身份和结果保留**：明确响应 `requestId` 与可查询 `query ID / task ID` 的关系；提供任务状态查询、断连后找回接口、结果及下载地址 **TTL**、重新签发/恢复方式、过期后的可追溯行为。
4. **限流契约**：以文档给出渠道/模型/账号维度、滚动或固定窗口、QPS/并发/排队容量、超额状态码、错误码、`Retry-After` 和允许重试条件；确认 Worker 出口如何适配。上午测试说明前端 9/s 并不等于上游出口 9/s，不应凭前端节奏猜测实际限流口径。
5. **确定失败与结果未知的机器契约**：分别约定 400、451、503、网络中止的可重试性、接单/计费语义、幂等键有效期、重复提交的结果复用；避免用统一“暂时失败”掩盖明确拒绝。
6. **内容与参考图错误**：提供结构化 `error.code/type`，明确输入审核/输出审核的区别及申诉渠道；给出缺原图可机器识别字段。平台负责参考图输入验证、generation/edit 路由和拒绝终态，不要求上游绕过内容策略。

## 6. 联合验收（待执行，不宣称已修复）

- 先书面确认限流、准入、重试/计费和结果 TTL 契约；以契约配置 Worker 出口控制，不新增拍脑袋延时、重试次数或并发常数。
- 使用双方同意的脱敏测试素材，分别覆盖两个模型及支持的 generation/edit 输入；平台保留本地 taskId、上游 request/query ID、毫秒时间、HTTP 状态、完整读取事件和最终状态。
- 准入拒绝/超载场景应可稳定识别：拒绝前未接单且未计费的证明清楚；已接单则能查询状态/恢复结果。明确失败不长期进入 `needs_review`。
- 内容拒绝和缺原图场景应返回稳定结构化错误；平台展示明确失败、无盲目重提、无自动改写提示词；参考图存在时有接收与提交证据。
- 在双方批准的故障模拟中验证超时/断连后 query ID 可用性、结果 TTL、幂等恢复和计费一致性。没有上游状态证据时平台继续标记未知，不把未收到结果当成没有生成。
- 图片生成成功、完整接收、OSS 持久化、画布回写与计费分项对账；上午 OSS 问题的验收独立列项，不能用上游 200 代替平台交付成功。
- 验收结论逐笔列出成功、自然拒绝、人工收尾与上游仍未知；必须两端对账后才出上游最终成功率。目前以上事项均为待协调和待验收。

## 7. 附件索引与脱敏交付

以下为**本地证据定位索引**，不是将全量原始文件交给供应商的授权。原始材料可能包含其他渠道和个人数据；对外仅交付本报告已筛选的兔子字段或另行生成的脱敏片段，不附原始快照/全量监控。

- **E1**：最终课堂任务/诊断快照；创建窗口15:00～18:11:15、18:14:24.210765查询；本报告仅筛选兔子渠道。绝对路径：`C:\Users\admin\Downloads\VOZEB-capacity-20260919\production-class-monitor-20261009\monitor-1791528279721\20261009-class-final-db-snapshot.json`。
- **E2**：首笔503完整事件链，第1行 `$.events[4]`、`[8..16]`。绝对路径：`C:\Users\admin\Downloads\VOZEB-capacity-20260919\production-class-monitor-20261009\monitor-1791528279721\20261009-1519-upstream-overloaded.json`。
- **E3**：错误警报交叉核验；首笔503 L3 `$.alerts[5]`、第二笔503 L29 `$.alerts[9]`；缺原图 L31 `$.alerts[3]`；451 L37 `$.alerts[4]` 等。绝对路径：`C:\Users\admin\Downloads\VOZEB-capacity-20260919\production-class-monitor-20261009\monitor-1791528279721\alerts.jsonl`。
- **E4**：17:17待确认快照；兔子98adc0e9任务位于第1行 `$[5].cause[0]`，对应451。绝对路径：`C:\Users\admin\Downloads\VOZEB-capacity-20260919\production-class-monitor-20261009\monitor-1791528279721\20261009-1717-current-review-evidence.json`。
- **E5**：17:30待确认快照；第1、2行 `$.events[0]` 为兔子451。绝对路径：`C:\Users\admin\Downloads\VOZEB-capacity-20260919\production-class-monitor-20261009\monitor-1791528279721\20261009-1730-current-review.jsonl`。
- **E6**：课堂期间人工记录说明；仅引用F006、F007、F014、F016、F017及相关兔子内容，不沿用课堂中途的未下课状态。绝对路径：`C:\Users\admin\Downloads\VOZEB-capacity-20260919\production-class-monitor-20261009\monitor-1791528279721\findings.zh-CN.md`。
- **E7**：同日上午独立限速复测报告；仅汇总，未重新执行；11批以正文批次明细校正。绝对路径：`D:\Claude code programe\VOZEB-PRO\VOZEB-PRO\docs\reports\2026-10-09-production-tuzi-rate-limited-image-test.zh-CN.md`。


脱敏保留：兔子模型、渠道 ID、平台 taskId、上游 requestId、端点、HTTP 状态、原始毫秒时间、耗时及错误文本。脱敏不含：API key、密码、私钥、学生姓名/账号/用户 ID、画布/项目身份、参考图、完整签名 URL、内部备份位置及其他供应商商业数据。结果恢复或计费状态仍未知处已显式列出，不以平台终态代替上游证明。
