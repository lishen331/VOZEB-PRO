# 2026-10-22 课堂遗漏场景与回归验收清单（证据版）

## 1. 为什么此前通过仍遗漏课堂故障

本次按生产SHA `bc2643a5d2c8ddc51173f4a74d45da3c6ee52859`静态核对测试源码，不宣称重新执行全部测试。结论是**已有测试在若干关键组件交界处使用mock，未覆盖课堂实际身份/返回形态/发布时序**；不是以“测试通过”证明这些交界场景通过。

| 已有测试/样本 | 已覆盖 | 本次明确遗漏 | 应补验收 |
| --- | --- | --- | --- |
| image-task-runtime.test.ts媒体下载测试 | 使用固定`x-media-auth:signed` mock、模拟图片下载成功，断言调用签名函数 | 原始logicalModel与实际fallback model不同且真实签名/真实授权结合 | 同渠道不同模型、跨渠道不同模型、两个attempt完整进入结果落库与原节点刷新 |
| generation-media-access.test.ts | video的同模型签名、无签名/跨用户/cancelled拒绝 | image结果生产端签名字段来源与消费端模型校验的组合 | 使用真实image result service+真实签名/授权，验证错误字段失败、实际模型成功，禁止放宽权限 |
| modelbay-asset-service.test.ts | service独立抛出带details的失败对象 | video route把details/cause丢失后，最终diagnostic是否还能归因 | service→route→trace完整403、2xx业务错、非JSON、超时、脱敏和限长 |
| image-task-support.test.ts raw JPEG | `/9j/`加96字符的小base64 | 大真实响应、不同provider返回结构、JSON解码之后的全部路径与实际stack | 多MB固定脱敏fixture、畸形/嵌套/URL/base64、真实运行时、失败保留stack与阶段 |
| 新镜像首批8/13图片成功 | 证明部分任务确实成功持久化 | 后续新镜像出现4.59MB RangeError，不能从小批成功推导全部修复 | 按SHA/模型/能力/返回形式持续分层，遇反例撤销“已修复”结论 |
| 生成创建HTTP200 | 请求与创建契约通过 | 后续poll、媒体授权、下载、持久化、前端保存仍可失败 | 明确生成完成→结果可读→服务器落库→画布节点保存→刷新可见各阶段 |
| health/CPU/内存正常 | 资源与可用性采样 | 不代表单任务业务成功；无request ID提交在发布切换时仍可丢上下文 | 发布前在途排空/可靠交接、未知结果不盲重放、可关联request ID/扣费 |

静态锚点和源码SHA256：`2026-10-22-classroom-evidence/test-coverage-source-audit-20261022-1728.json`。上述仅评估本轮实际检查的文件/场景，不声称整个仓库完全没有任何相关测试。

## 2. 当前有完整机制证据的两个问题

### A. 图片备用结果授权字段错用

- 生产两笔关联task/实际模型/内部403齐全。
- 生产SHA真实源码离线复现`generationModelId`取原始ID、授权对比实际ID的拒绝。
- 最小修复方向是签名使用实际执行model，不改变用户原始逻辑模型、积分计价和跨用户/URL/channel检查。
- 详见`2026-10-22-image-fallback-media-auth-evidence.zh-CN.md`。

### B. ModelBay素材403详情丢失

- service错误details有status/response，route只拷贝message生成新的SafeCandidateFailure。
- 真实源码离线fixture复现详情和cause丢失，解释日志不足，不能替代真实上游403的根因。
- 最小修复应保留cause并按白名单脱敏落子阶段诊断，不能把整个原始response落日志。
- 详见`2026-10-22-modelbay-asset-diagnostic-loss-evidence.zh-CN.md`。

## 3. 仍未定位到具体函数的问题

### 图片HTTP200之后RangeError

- 多渠道、多attempt、新旧镜像均重复，不能只归因某一家上游。
- Node24本机24个合成fixture通过；生产Node22独立纯内存4个fixture也通过，只证明这些构造输入未触发，不能声称排除解析路径或证明修复。
- 尚缺生产实际stack和每个处理子阶段；下一步应补小预算stack frame/阶段诊断，测试不得泄漏提示词、签名URL和base64。
- 不建议凭猜测提高堆上限、调重试、改全局协议/关闭授权来“试修”。

## 4. 回写验证边界与勘误

17:13只读抽查35笔新镜像终态：21成功中19原节点成功且有URL、1原节点不在项目、1原节点idle。14失败的原节点当时已换绑其它任务，不能按旧任务直接改失败。

17:26进一步核实idle样本`241e815d-d927-4ddb-85a9-1f0407d0c587`：`isBatchRoot=false`，无batch children/snapshots，无content，当前项目没有节点URL与该任务result URL精确匹配。**之前仅依据metadata存在isBatchRoot键写成idle/isBatchRoot，不足以判定实际batch根；本次纠正。**

这是一条“后台成功、当前项目未匹配结果”的待核验交付缺口，但项目在任务完成后又有更新，缺少当时浏览器和保存历史，因此不能确定是从未回写、用户后续重置/删除，还是其他变更。未恢复或重写学生项目。

## 5. 执行边界

本轮只写本机脚本、脱敏证据及MD；没有生产代码/配置/数据库写入，没有额外付费请求、重放或GitHub推送。上述是给后续获批修复的验收清单，不代表已实施。
