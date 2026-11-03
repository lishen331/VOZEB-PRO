# 2026-10-21 兔子HTTP200后正文慢读至600秒超时：da3a证据链

## 概述

任务`da3a25fa-ee9b-48c9-b8d3-34c4a0e1677d`原始选择兔子`gpt-image-2`，17:27:58.675提交，17:38:02.167失败，完整耗时603.492秒。先收到上游HTTP200响应头，但正文在约10分钟请求预算内未读完，平台超时取消；随后自动备用被平台内部403拒绝。不能只拿最终403当第一故障，也不能把HTTP200响应头当生成成功。

## 时间线（北京时间）

| 时刻 | 事件 | 关键证据 |
| --- | --- | --- |
| 17:27:58.675 | 创建任务 | 原始逻辑模型gpt-image-2 |
| 17:27:59.555 | 平台内部传输开始 | 兔子渠道；三张参考图，2720x1536，quality=medium，output_format=png，response_format=b64_json |
| 17:27:59.832 | 发出上游请求 | gpt-image-2 |
| 17:28:51.638 | 上游响应头200 | requestId=`4d6f6eac`，到响应头51.805秒 |
| 17:28:51.644 | 正文首字节 | 初次10071字节，Content-Length未知（-1） |
| 17:37:59.555 | 内部传输超时 | `TimeoutError`，`The operation was aborted due to timeout`，599995毫秒 |
| 17:37:59.570 | 正文读取取消 | `request_signal_aborted`，547908毫秒，累计5362317字节，idleMs=4657 |
| 17:38:02.139 | 自动备用内部403 | 模汇gpt-image-2-all；`该上游模型未绑定可用逻辑模型`，本attempt未见上游请求响应 |
| 17:38:02.167 | 任务失败日志落库 | 完整603492毫秒 |

## 重要限定：不是已证明“整个读取过程断流”

- 取消时`idleMs=4657`，说明约4.7秒前仍收到过一块正文数据，不支持“正文首字节后一直完全断流”的说法。
- 已读数据除以读取期间约9.56KiB/s，仅是本笔响应的有效读取平均值，包含等待时间，不是服务器网卡带宽测试，也不足以独立归因上游限速、代理或运营商链路。
- 没有Content-Length总量，不能计算还缺多少正文、完成百分比或预计剩余时间。
- 未记录完整正文完成、有效图片结果URL或上游异步任务ID；没有伪造成功、拼接半截图片或自动再次付费生成。
- 本次和16:07的`299dfb88...`不同：早先是`UND_ERR_SOCKET/other side closed`，本次明确是平台请求信号在600秒附近超时取消。

## 已部署源码交叉核对

基于当前生产镜像SHA `2b99976ffff6f6060fd06c07767e56d62eb5a402`只读查看：

- `web/src/app/api/image-tasks/image-task-support.ts`：taskFetch以`AbortSignal.timeout(imageTaskRequestTimeoutMs(config))`设置预算。
- `web/src/lib/server/model-request-policy.ts`：图片默认10分钟；模型capabilityProfile可覆盖。
- `web/src/app/api/ai/system/[channelId]/[...path]/route.ts`：向上游传递`request.signal`，JSON响应经`readObservedResponseBody`完整读取后才构造返回。
- `web/src/lib/server/media-response-body.ts`：记录首字节、完成或异常；异常记录已读字节及idleMs。
- `generation-http-lifecycle.ts`的全局transport常量是40分钟，不应误写成本次600秒的直接来源。600秒以当次trace和图片请求策略链为证据；任务当前config在备用后已被重写，不能拿当前配置冒充首次原始配置。

## 建议方向（没有执行生产修复）

1. 将兔子requestId `4d6f6eac`、时段、响应字节/耗时交给渠道方核查真实输出速度、代理/流式传输及是否存在返回完整URL/异步结果的可靠契约。
2. 平台完整记录“收到响应头→正文未完成→超时取消”的阶段；前端区分处理中和失败，不能把200当已生成。当前报告已新增“响应正文读取超时”分组，独立案例和全窗口断言通过。
3. 只延长timeout会延长课堂等待并占用执行资源，不能当根因修复；先确认慢读环节。若按渠道改为已证实支持的URL/异步模式，必须核对该渠道模型契约，不能全渠道统一更改。
4. 备用内部绑定403另交现有溢出逻辑负责人处理；本次未改其逻辑。对于可能上游已生成但本地未完整接收的任务，应先对账/查询恢复能力，避免自动重复收费。

## 证据文件

- `body-read-timeout-da3a-evidence.json`：任务、attempt、白名单诊断及终态日志。
- `body-read-timeout-da3a-detail.json`：定向只读补查idleMs、Content-Length、错误类型等。
- `slow-body-task-da3a-timeline.jsonl`：本机持续观察快照。

未修改生产、未重启、未改积分或节点、未发起生成。服务和Worker健康、没有OOM/重启，不能据此宣告整个请求没有性能问题。
