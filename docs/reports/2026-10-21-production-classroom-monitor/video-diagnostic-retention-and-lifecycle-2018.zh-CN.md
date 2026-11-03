# 2026-10-21 课堂视频链路与诊断保留盲区

## 摘要

截至 20:18:22（北京时间）的只读数据库核查，19:59 创建的两笔模汇视频已完成并持久化可用结果字段；另有一笔模汇与一笔 ModelBay 视频仍在 polling，不能把轮询 HTTP 200 或小 JSON 读完当成视频成功。后台成功不等于已经逐浏览器播放验证。

同时确认一个可观测性缺口：生产诊断实行 **20 KiB JSON 序列化预算**，超限时保留首条并删除第二条。频繁轮询产生的 body 事件会挤掉早期提交请求/响应证据。本机已从早期只读快照救回四笔视频的初始链路，不需再发付费生成；线上保留策略尚未修改。

## 任务核查（时间均为北京时间）

| 平台任务 ID | 渠道 / 模型 | 创建 | 核查时状态 | 规范日志完整耗时 | 结果字段 |
| --- | --- | --- | --- | ---: | --- |
| 35a66748-eabf-45f3-825f-a9e93e5404b2 | 模汇 / doubao-seedance-2-0 | 19:59:34.595 | success / completed | 281.164 秒 | url非空、video/mp4、durationMs=7000 |
| 0d832b43-a32c-40e2-9e9f-4190ce3ea0e3 | 模汇 / doubao-seedance-2-0 | 19:59:59.376 | success / completed | 251.833 秒 | url非空、video/mp4、durationMs=5000 |
| 67d370de-324d-4ba8-9b47-dcc3c3d7af2e | 模汇 / doubao-seedance-2-0 | 20:03:26.065 | running / polling | 未完成，留空 | 暂无 |
| 5d7717b0-4b08-40ae-b27e-bed51f8e7760 | ModelBay / official/seedance-2 | 20:15:58.096 | running / polling | 未完成，留空 | 暂无 |

前两笔 generation_log 均为 success，完成时间分别为 20:04:15.759、20:04:11.209。每笔 attemptCount=1，未以备用成功冒充。后两笔均已有真实上游任务 ID；现状另存 `video-classroom-lifecycle-latest.json`，请同时看该文件的 at，避免将此历史核查表当成未来终态。

四笔保存的 payload 未提供 references 字段；这只说明该字段未提供，不能仅凭此断言其协议工作流全部输入均无参考媒体。ModelBay 的 submit_start 到 submit_end 约73.070秒，上游请求响应阶段约7.267秒；差额属于需进一步查看输入准备的时间，现有证据不足以指定为上传、下载或网络故障。

## 初始链路保全

- 本机归档 `video-initial-events-from-snapshots-2000.json` 保存前两笔初始关键事件。
- `video-initial-events-from-snapshots-2018.json` 于20:18:57重新从本机 snapshots.jsonl 末尾64 MiB取证，包含四笔视频40个去重锚点事件。
- 四笔均救回初始 transport_response；初始事件与终态结果分别核对，不由“曾收到200”直接推出成功。
- 读取仅发生在本机已采样文件；没有直接请求上游任务查询接口，也没有重试生成。

## 盲区的部署源码证据

生产镜像 SHA `2b99976ffff6f6060fd06c07767e56d62eb5a402`：

- `web/src/lib/server/media-task-diagnostics.ts`：`MEDIA_DIAGNOSTIC_MAX_BYTES = 20 * 1024`。
- 普通 poll 对同状态重复事件去重，但 `upstream_body_first_byte` / `upstream_body_complete` 不由该 poll 去重覆盖。
- 超预算执行 `events.splice(events.length > 1 ? 1 : 0, 1)`，因此第一个 task_created 可保留，而初始 request/response 先被挤掉。
- 本案数据库快照中两笔成功视频分别有56、57条诊断；条数随事件体积变化，**不是固定56条上限**。
- 取证 JSON 的 diagnosticBytes 来自 PostgreSQL `jsonb::text`，其空格排版与代码的紧凑 JSON.stringify 不同；不能拿该数值直接声称突破20KiB应用预算。
- 诊断存储另有成功3天、其余7天的保留逻辑；与单任务预算淘汰不是同一种机制。

## 建议（未实施）

保留有界容量与脱敏原则，但按重要性保全 task_created、初始 request/response、上游任务 ID、结果持久化及最终异常锚点；轮询正文事件可以按状态变化采样/聚合，并保留最近一次异常。验收应覆盖长轮询、终态错误和多attempt，在预算触发后仍能还原初始提交，不能只提高无界日志量。

监控期间继续跟踪运行中任务，不因等待时间长直接改失败，不重发付费任务，不修改学生节点。当前报告并不声称已完成视频播放/前端可见性验收。

## 20:22终态与画布节点复核

20:21:58数据库复核已确认上述四笔全部成功；20:22:20进一步按原始节点ID核对当前画布。此节更新前面的20:18历史运行中状态，不改写其当时事实。

| 任务 ID | 完成时间（北京时间） | 完整耗时秒 | 当前原节点 | 结果与节点serverUrl一致 |
| --- | --- | ---: | --- | --- |
| 67d370de-324d-4ba8-9b47-dcc3c3d7af2e | 20:18:32 | 906.078 | video-fZOtsyqvr0rG1ESHULBH2 / success | true |
| 5d7717b0-4b08-40ae-b27e-bed51f8e7760 | 20:21:33 | 335.861 | video-Kg28vwev5jeWi8UULEccV / success | true |
| 35a66748-eabf-45f3-825f-a9e93e5404b2 | 20:04:15 | 281.164 | 当前不存在 | 不适用 |
| 0d832b43-a32c-40e2-9e9f-4190ce3ea0e3 | 20:04:11 | 251.833 | 当前不存在 | 不适用 |

模汇第三笔从20:03:26.065到20:18:32.143，完整906.078秒（约15分06秒），初始submit_end耗时仅248毫秒；约903.438秒后才观察到result_ready，随后持久化约2秒。可定位主要等待发生在异步结果轮询阶段，不是最初请求未发出或本地持久化占满15分钟；仅凭这些记录仍不能拆分上游内部排队与实际模型运算时长。ModelBay视频完整335.861秒（约5分36秒），一次attempt完成。慢成功仍记性能问题，不改记失败。

最新两笔原节点仍存在，status=success、generationPendingTaskId及serverUrl与任务吻合。前两笔历史视频任务结果仍成功，但原节点当前不存在；没有历史删除/变更事件足以判断谁删除或替换，不据此称前端回写失败，也不擅自恢复。该检查是服务器持久化关系检查，不是媒体请求/真实浏览器播放验收。

补充证据：同目录video-classroom-lifecycle-latest.json、video-canvas-persistence-2022.json、video-original-node-followup-2022.json。
