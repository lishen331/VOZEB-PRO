# 2026-10-22 课堂全链路诊断缺口：证据及最小补齐方案（未实施）

## 概述

当前日志不是完全没有，而是存在**错误对象被截断、关键参数没落库、长期轮询淘汰提交锚点、异常缺堆栈**四种独立缺口。不能靠无限增加日志量或每次重试来替代。以下是只读查询、部署SHA源码和离线fixture的证据，不是已经修改生产。

## 1. 证据分层

| 缺口 | 证据 | 能确认 | 不能确认 |
| --- | --- | --- | --- |
| ModelBay素材错误详情丢失 | service错误带details，route重新包装只留message；真实源码离线复现 | details/cause丢失机制 | 当天HTTP403一定是余额/权限/策略中的哪项 |
| mini/R2V实际分辨率缺失 | 两个失败task config.vquality/resolution均空，generation log request_snapshot空；出站摘要白名单缺resolution | 当前留存证据不足以还原实际值 | 不能猜是480p/720p/1080p，更不能改一个猜测值当修复 |
| 提交诊断被轮询挤掉 | appendDiagnosticEvent预算20KB，超限删除index1；300个合成body事件后保留task_created、丢失upstream_request/submit_end | 淘汰机制可丢请求锚点 | 不能把每个历史缺事件都唯一归因此机制；也可能未采集/落库失败 |
| RangeError缺调用栈 | traceMediaException仅记录name/message/code/cause，数据库无stack | 尚无法函数级定位；新旧镜像均有HTTP200后异常 | 不能仅凭大小阈值或可疑正则宣称具体根因 |

## 2. mini分辨率留存证据

只读冻结`2026-10-22-classroom-evidence/success-idle-assets-and-mini-parameters-20261022-174351.json`：

- `1f46c273-f94b-471c-8c49-0656a83e7575`、`13426261-5f1d-4184-a007-5123bb0688bc`均实际上游拒绝mini/R2V分辨率。
- 两笔`payload.config.vquality`、`payload.config.resolution`均null；generation log `request_snapshot`无键，参数resolution/vquality/size均null。
- `media-task-trace.ts:requestSummary`白名单为model/size/quality/n/seconds/duration/response_format/output_format，没有resolution、ratio、参考角色等视频必需字段。
- route实际构造`resolution(raw.vquality)`后送模型，但创建task只保存channel config，未将本次effective parameters独立持久化。源码推导能解释为何字段可能缺失，不能代替当时的实际上游请求记录。

## 3. 长轮询的预算淘汰机制

生产SHA `bc2643a5d2c8ddc51173f4a74d45da3c6ee52859`的`media-task-diagnostics.ts`：

```ts
while (events.length && Buffer.byteLength(JSON.stringify(events), "utf8") > MEDIA_DIAGNOSTIC_MAX_BYTES)
  events.splice(events.length > 1 ? 1 : 0, 1);
```

这不是“全部关键事件固定保留”，而是保首条、删第二条直到满足预算。`poll`有部分去重，但`upstream_body_complete`不受该去重规则保护。

本机离线合成300次body事件、每5秒一条（仅模拟时钟、未等待25分钟或调用真实上游）：最终20357 bytes、139事件，保留task_created，丢upstream_request和submit_end，剩138条body事件。脚本和结果：`offline-diagnostic-budget-probe-20261022.cjs/.json`。不修改线上预算或保留策略。

## 4. 建议的最小补齐方案

1. **保留身份语义**：taskId、attemptNo、user别名、surface、project/node、原始logicalModel、routeLogicalModel、实际channel/model分别记录，不互相覆盖。
2. **请求快照**：保存本次requested与effective参数的白名单（resolution、ratio、duration、size、reference数量/角色/类型、参考资产ID哈希、宽高/字节数）。不保存prompt正文、完整URL、token、base64。
3. **关键锚点保留**：task_created、每attempt创建请求/响应、上游request/task ID、首次业务失败、终态固定预算；轮询状态转变保留，重复body/poll汇总成计数、最近时刻和最大耗时。总量仍受限，不无限放大20KB。
4. **异常分层**：submit/parse/discover_result/download_authorization/download/store/persist_node分阶段；异常stack最多有限帧、脱敏限长，诊断失败不得遮盖业务原错。
5. **素材子请求**：保留ModelBayAssetError的cause，按白名单提取status/code/脱敏message、asset子阶段与父task/attempt关联，禁止整个response入库。
6. **计费**：平台扣/退积分幂等键与上游计费凭据分开；未知结果不盲重放，多attempt不增加用户任务分母。
7. **监控器**：部署变化比较image/StartedAt，不只RestartCount；告警区分采样失效、应用健康、任务业务失败；截断tail不能冒称全量日志。

## 5. 验收

- 模拟长轮询后仍可回溯所有attempt创建与首失败；预算仍<=限额；不丢关键request/task ID。
- 同一用户原始模型≠实际模型、同渠道切模型、跨渠道切模型均能追踪；图片媒体授权的修复另行验收，不能放宽跨用户保护。
- 视频mini/fast普通版分别保存实际resolution和参考模式；查询能明确“requested值→effective值→上游返回”。
- 敏感信息检查覆盖错误正文/stack/cause/参数/URL，异常详情不泄漏key或学生内容。
- 原有积分/重试/取消/权限行为无变化；不用日志改动顺带重写路由。
- 对仍缺历史参数的任务，标“证据不足”，不反向补造请求内容。

## 6. 额外核实：一笔后台成功但当前画布未匹配的图

`241e815d-d927-4ddb-85a9-1f0407d0c587`任务/完成日志成功、1个日志资产；媒体注册表有3,496,353 bytes的image/png、provider=object、externalObjectKey存在、expiresAt=null。说明服务端有持久化资产登记，不是仅HTTP200。

**未对OSS对象做读取验证，不能据登记直接保证文件仍可下载。** 当前项目原节点idle且无匹配URL，但项目任务结束后又更新过，缺历史保存与浏览器证据；不确定是从未回写还是后续重置/删除，不擅自恢复学生项目。
