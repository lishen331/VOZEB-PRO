# ModelBay素材403诊断信息丢失：源码证据与建议（未实施）

## 结论

已定位并离线复现**平台诊断详情丢失**，不是已定位ModelBay实际返回403的上游根因。生产新镜像`bc2643a5d2c8ddc51173f4a74d45da3c6ee52859`仍包含该包装逻辑。所有验证为只读查询与本机合成fixture，无真实外呼或付费生成。

## 生产证据

- 新镜像后`6d59c8bb-7d50-486d-93df-76e59a0256d0`（16:55:49终态）和`5d500728-b9b1-432f-8a4a-631037e1a958`（16:57:20终态）仍为`ModelBay 素材接口返回 HTTP 403`，`submit_exception.errorName=Error`。
- 之前16:15—16:41冻结有8笔同类素材403。不能据此断言它们具体是余额、鉴权或策略错误。
- 数据库现有相关事件没有素材子请求的完整HTTP事件或可用脱敏上游code/正文。
- 冻结证据：`2026-10-22-classroom-evidence/readonly-delta-20261022-165954.json`。

## 源码链路（不可变提交核对）

1. `web/src/lib/server/modelbay-asset-service.ts:139–147`：`modelBayRequest`对非2xx先读取JSON，再构造`ModelBayAssetError(message, {status, code, response})`，所以错误对象在此仍持有上游响应。
2. `web/src/app/api/video-generation-tasks/video-generation-route.ts:902–924`：`prepareModelBayReferences`使用直接`fetchSafeOutbound`作为素材fetcher，而不是外呼诊断包装。其catch将错误重新创建为：

   ```ts
   if (error instanceof ModelBayAssetError) throw new SafeCandidateFailure(error.message);
   ```

   `SafeCandidateFailure`在987行只定义为`extends Error {}`；未传`cause`，未复制`details/status/code/response`。因此原始详情确实在此丢失。
3. `web/src/lib/server/media-task-trace.ts:53–58`：`traceMediaException`只采集name/message/code/cause，不读ModelBay.details，更不记录stack。在第2步丢掉cause后，诊断无法追溯到原错误。
4. 额外边界：素材403分支调用`readErrorCode(responseBody)`，该函数只读顶层字符串code。合成嵌套`error.code`不会被提取；这只是已复现的兼容缺口，不代表当天上游实际采用此形状。

## 本机离线复现

脚本：`2026-10-22-classroom-evidence/offline-modelbay-diagnostic-loss-20261022.cjs`；结果：同名JSON。

从部署SHA提取真实service代码、真实`prepareModelBayReferences`函数及`SafeCandidateFailure`声明，只将网络替换为内存`Response(403)`。使用明显标记的`SYNTHETIC_ONLY_CODE/MESSAGE`，无真实key、用户素材、请求或上游余额推断。

| 阶段 | error.name | HTTP status详情 | 原response | cause |
| --- | --- | --- | --- | --- |
| 素材service抛出 | ModelBayAssetError | 403 | 存在 | 未使用 |
| 视频route再包装后 | Error | 丢失 | 丢失 | 不存在 |

运行结果`verified=true`。这是**信息丢失机制的实证**，不是当天素材403根因的复现。

## 建议的最小修复（本轮未执行）

1. 保持`SafeCandidateFailure`现有候选切换语义，包装时保留cause；不要为补日志改变重试/扣费/路由策略。
2. 在素材调用边界加现有诊断上下文包装，显式标记`asset_create/asset_poll`子阶段及父task/attempt/channel；保留HTTP状态、耗时、有限长度request ID。
3. 将上游code/message按白名单提取、脱敏并限长后落诊断。不要保存原始response、API key、Authorization、签名素材URL、完整prompt或base64；不能简单把details整个JSON.stringify入库。
4. 支持顶层和嵌套`error.code`形状；提取失败保留“未提供”而非猜原因。
5. 对RangeError另补有限帧stack和处理子阶段（JSON解码、图片结果发现、退款、持久化），与ModelBay素材403修复分开。

## 验收条件

- 合成403的status/code/脱敏message在诊断可查，父task/attempt可关联；原始敏感字段缺席。
- 既有candidate fallback和平台扣退积分行为不改变；不把每个asset poll计为新的生成任务。
- 2xx返回业务错误、403带嵌套error、非JSON、超时、素材轮询失败分别覆盖；诊断失败不遮盖原业务错误。
- 默认日志量受控；长视频poll不无限增长，关键提交/失败锚点不被淘汰。
- 部署后只观察真实课堂/受控验收事件，不能用离线通过宣称实际上游问题解决。
