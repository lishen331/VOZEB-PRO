# 2026-10-21 生产真实画布逐模型样本报告

**状态：31行逐模型配额已满足，所有已建任务均已终态；不代表所有模型通过课堂准入。**

- 原生产SHA：**2b99976ffff6f6060fd06c07767e56d62eb5a402**；settings revision **93**。主任务A/B/C本地修复与新日志代码尚未部署，本轮不是它们的线上验收。
- 本轮原生提交时间：**2026-10-21 10:22:49 +08:00 至 2026-10-21 10:53:49 +08:00**；本报告生成：2026-10-21 11:13:30 +08:00。正文时间均为北京时间；JSON同时保留UTC便于审计。
- 15份storage已逐一调用真实auth/session并核对登记userId，15/15匹配；按alias映射，不按SQL用户返回顺序。私有映射/凭据未外发。

## 1. 分母、终态和费用

- 原生唯一提交 **387**：文本240、图片99、视频48；按 **payload.config.model + clientRequestId** 去重，文本无clientRequestId时按独立projectId。重复identity **0**；显示label和SQL最终model不作为原始请求模型分母。
- 关联DB任务 **331**：成功252、失败79、运行0。另有 **56** 笔原生HTTP503服务器拒绝且无DB任务：文本49、视频7。总端到端结果=成功252、失败135。
- 61笔原生POST响应没返回task ID：其中5笔按clientRequestId/唯一账号+项目+类型找回已有DB任务；其余56笔明确无task，不编造任务ID，也不重新创建重复请求。
- 实际attempt **336**：成功252、失败84。5个多attempt任务的首/后attempt都单独保留，不能用最终结果覆盖原始渠道表现。
- 本地积分消费331、失败退款79、净消费252；余额合计1402→1150。逐账号前后余额与流水全部对账一致；没有人工加减积分。
- 对全部387个样本独立重新打开并刷新真实画布，检查目标原节点；252成功媒体/文本刷新均可见，135失败节点均显示错误/重试；复查没有发出任何新生成POST。

## 2. 耗时口径（不将attempt完成冒充完整生成完成）

- 完整成功/失败任务耗时：**generation_logs.completed_at - generation_task.created_at**，不是最后一个attempt的completedAt。
- 329任务找到匹配generation log，其中250成功、79失败。另2个成功任务缺少匹配generation log：其完整生成耗时留空，仅保留明确标为代理值的attemptTerminalProxySeconds；不混入完整成功耗时统计。
- 无task拒绝只有原生POST→HTTP错误响应延迟，单独统计，不称生成完成耗时。
- 渠道表的attempt耗时仅为持久化attempt.startedAt→completedAt，明确属于attempt口径。没有设95%或其他未经批准的业务准入阈值。uiElapsedSeconds仅为含建画布、选模型、等待和刷新的脚本总观察耗时，不称点击到图片显示时间。完整331任务的left-join时间附件见generation-task-completion-times.json/.csv；其中缺日志的2项留空。

缺日志的成功任务：
| 模型 | taskId | attempt代理秒 |
| --- | --- | --- |
| gpt-image-2-text-to-image | a33ec1d2-cadb-4c7d-bf24-8905fa56ed17 | 116.829 |
| gpt-image-2-text-to-image | ea7aeb8a-161c-4c6d-9252-1f31d5a945f8 | 104.091 |

## 3. 31行逐模型定量结果

配额为文本各>=16、图片各>=11、视频各>=6。image-to-image额外补11笔图+文，所以该模型共22笔；原先11笔references=[]只计文生图。成功耗时“日志数/成功数”明确标示完整耗时覆盖；无task拒绝不混入失败任务耗时。

| 类型 | 原始模型/显示名 | 提交/DB任务 | 无task拒绝 | 成功/失败 | 成功率 | 完整成功耗时N/成功数 | 成功均值/P95秒 | 失败任务均值/P95秒 | 拒绝均值秒 | 成功刷新 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| text | gpt-5.6-luna | 16/14 | 2 | 14/2 | 87.5% | 14/14 | 3.134 / 8.607 | — / — | 0.216 | 14/14 |
| text | gpt-5 | 16/14 | 2 | 14/2 | 87.5% | 14/14 | 20.57 / 50.001 | — / — | 0.166 | 14/14 |
| text | gpt-5-mini | 16/14 | 2 | 14/2 | 87.5% | 14/14 | 14.472 / 44.026 | — / — | 0.204 | 14/14 |
| text | gpt-5-pro | 16/14 | 2 | 0/16 | 0% | 0/0 | — / — | 2.994 / 9.181 | 0.135 | 0/0 |
| text | gpt-5.1 | 16/14 | 2 | 14/2 | 87.5% | 14/14 | 2.408 / 6.052 | — / — | 0.07 | 14/14 |
| text | gpt-5.2 | 16/13 | 3 | 13/3 | 81.25% | 13/13 | 5.747 / 31.323 | — / — | 0.121 | 13/13 |
| text | gpt-5.4 | 16/13 | 3 | 13/3 | 81.25% | 13/13 | 2.483 / 5.227 | — / — | 0.153 | 13/13 |
| text | gpt-5.4-mini | 16/14 | 2 | 14/2 | 87.5% | 14/14 | 2.593 / 5.506 | — / — | 0.163 | 14/14 |
| text | gpt-5.4-pro | 16/15 | 1 | 0/16 | 0% | 0/0 | — / — | 6.771 / 18.787 | 0.138 | 0/0 |
| text | gpt-5.5 | 16/15 | 1 | 15/1 | 93.75% | 15/15 | 3.53 / 6.763 | — / — | 0.067 | 15/15 |
| text | gpt-5.5-pro | 16/15 | 1 | 0/16 | 0% | 0/0 | — / — | 1.412 / 4.073 | 0.084 | 0/0 |
| text | gpt-5.6-sol | 16/14 | 2 | 14/2 | 87.5% | 14/14 | 4.715 / 11.819 | — / — | 0.108 | 14/14 |
| text | gpt-5.6-terra | 16/14 | 2 | 14/2 | 87.5% | 14/14 | 2.877 / 6.589 | — / — | 0.072 | 14/14 |
| text | codex-auto-review | 16/5 | 11 | 0/16 | 0% | 0/0 | — / — | 3.152 / 10.653 | 0.271 | 0/0 |
| text | gpt-6-astra | 16/3 | 13 | 0/16 | 0% | 0/0 | — / — | 2.183 / 3.578 | 0.331 | 0/0 |
| image | gpt-image-2-all | 11/11 | 0 | 9/2 | 81.82% | 9/9 | 60.513 / 102.363 | 300.571 / 300.669 | — | 9/9 |
| image | gpt-image-2 | 11/11 | 0 | 9/2 | 81.82% | 9/9 | 35.604 / 86.232 | 0.788 / 0.85 | — | 9/9 |
| image | gpt-image-2-c | 11/11 | 0 | 11/0 | 100% | 11/11 | 111.184 / 298.155 | — / — | — | 11/11 |
| image | gpt-image-2.5-sunburst | 11/11 | 0 | 4/7 | 36.36% | 4/4 | 29.872 / 33.661 | 3.853 / 9.62 | — | 4/4 |
| image | gpt-image-2-5-flare | 11/11 | 0 | 11/0 | 100% | 11/11 | 35.447 / 63.214 | — / — | — | 11/11 |
| image | gpt-image-2-5-sunburst | 11/11 | 0 | 11/0 | 100% | 11/11 | 31.166 / 57.696 | — / — | — | 11/11 |
| image | gpt-image-2-image-to-image | 22/22 | 0 | 16/6 | 72.73% | 16/16 | 92.056 / 127.411 | 125.561 / 151.597 | — | 16/16 |
| image | gpt-image-2-text-to-image | 11/11 | 0 | 7/4 | 63.64% | 5/7 | 86.131 / 95.328 | 114.766 / 126.798 | — | 7/7 |
| video | doubao-seedance-2-0-260128 | 6/4 | 2 | 0/6 | 0% | 0/0 | — / — | 1.255 / 1.966 | 0.23 | 0/0 |
| video | doubao-seedance-2-0 | 6/6 | 0 | 6/0 | 100% | 6/6 | 272.062 / 300.673 | — / — | — | 6/6 |
| video | doubao-seedance-2-5-260628 | 6/1 | 5 | 0/6 | 0% | 0/0 | — / — | 0.781 / 0.781 | 0.374 | 0/0 |
| video | official/seedance-2 | 6/6 | 0 | 6/0 | 100% | 6/6 | 203.905 / 263.459 | — / — | — | 6/6 |
| video | official/seedance-2-5 | 6/6 | 0 | 6/0 | 100% | 6/6 | 159.917 / 181.654 | — / — | — | 6/6 |
| video | 天翼云 Seedance 2.0 | 6/6 | 0 | 6/0 | 100% | 6/6 | 240.864 / 277.301 | — / — | — | 6/6 |
| video | 天翼云 Seedance 2.0 Fast | 6/6 | 0 | 6/0 | 100% | 6/6 | 104.953 / 122.089 | — / — | — | 6/6 |
| video | 天翼云 Seedance 2.0 Mini | 6/6 | 0 | 5/1 | 83.33% | 5/5 | 88.661 / 96.512 | 7.02 / 7.02 | — | 5/5 |

## 4. 模型/上游可用性 与 平台端到端课堂可靠性分开判断

健康上游的成功证据予以保留；平台无task拒绝不算上游实际attempt失败。安全文案“当前文本模型暂不可用”不足以定位准入/候选/冷却根因，不能全归因为429。本表是建议，不自动修改配置，也不永久禁用整渠道。

| 模型 | 模型/上游可用性 | 平台端到端课堂可靠性 | 建议 |
| --- | --- | --- | --- |
| gpt-5.6-luna | 实际执行attempt 14/14成功；模型/上游可用候选 | 端到端 14/16；服务器无task拒绝 2；任务失败 0；成功刷新 14/14 | 保留模型候选；先定位并修复/复测平台准入拒绝，再确认课堂开放 |
| gpt-5 | 实际执行attempt 14/14成功；模型/上游可用候选 | 端到端 14/16；服务器无task拒绝 2；任务失败 0；成功刷新 14/14 | 保留模型候选；先定位并修复/复测平台准入拒绝，再确认课堂开放 |
| gpt-5-mini | 实际执行attempt 14/14成功；模型/上游可用候选 | 端到端 14/16；服务器无task拒绝 2；任务失败 0；成功刷新 14/14 | 保留模型候选；先定位并修复/复测平台准入拒绝，再确认课堂开放 |
| gpt-5-pro | 当前配置未取得成功；已建任务的明确错误：The request rate limit has been reached. Please try again later.；Current group upstream load is saturated, please try again later；The model service is temporarily unavailable. Please try again later. | 端到端 0/16；服务器无task拒绝 2；任务失败 14；成功刷新 0/0 | 当前暂不开放该模型的失败绑定；修复明确原因后重测，不永久禁用整渠道 |
| gpt-5.1 | 实际执行attempt 14/14成功；模型/上游可用候选 | 端到端 14/16；服务器无task拒绝 2；任务失败 0；成功刷新 14/14 | 保留模型候选；先定位并修复/复测平台准入拒绝，再确认课堂开放 |
| gpt-5.2 | 实际执行attempt 13/13成功；模型/上游可用候选 | 端到端 13/16；服务器无task拒绝 3；任务失败 0；成功刷新 13/13 | 保留模型候选；先定位并修复/复测平台准入拒绝，再确认课堂开放 |
| gpt-5.4 | 实际执行attempt 13/13成功；模型/上游可用候选 | 端到端 13/16；服务器无task拒绝 3；任务失败 0；成功刷新 13/13 | 保留模型候选；先定位并修复/复测平台准入拒绝，再确认课堂开放 |
| gpt-5.4-mini | 实际执行attempt 14/14成功；模型/上游可用候选 | 端到端 14/16；服务器无task拒绝 2；任务失败 0；成功刷新 14/14 | 保留模型候选；先定位并修复/复测平台准入拒绝，再确认课堂开放 |
| gpt-5.4-pro | 当前配置未取得成功；已建任务的明确错误：The model service is temporarily unavailable. Please try again later. | 端到端 0/16；服务器无task拒绝 1；任务失败 15；成功刷新 0/0 | 当前暂不开放该模型的失败绑定；修复明确原因后重测，不永久禁用整渠道 |
| gpt-5.5 | 实际执行attempt 15/15成功；模型/上游可用候选 | 端到端 15/16；服务器无task拒绝 1；任务失败 0；成功刷新 15/15 | 保留模型候选；先定位并修复/复测平台准入拒绝，再确认课堂开放 |
| gpt-5.5-pro | 当前配置未取得成功；已建任务的明确错误：The model service is temporarily unavailable. Please try again later.；Current group upstream load is saturated, please try again later | 端到端 0/16；服务器无task拒绝 1；任务失败 15；成功刷新 0/0 | 当前暂不开放该模型的失败绑定；修复明确原因后重测，不永久禁用整渠道 |
| gpt-5.6-sol | 实际执行attempt 14/14成功；模型/上游可用候选 | 端到端 14/16；服务器无task拒绝 2；任务失败 0；成功刷新 14/14 | 保留模型候选；先定位并修复/复测平台准入拒绝，再确认课堂开放 |
| gpt-5.6-terra | 实际执行attempt 14/14成功；模型/上游可用候选 | 端到端 14/16；服务器无task拒绝 2；任务失败 0；成功刷新 14/14 | 保留模型候选；先定位并修复/复测平台准入拒绝，再确认课堂开放 |
| codex-auto-review | 当前配置未取得成功；已建任务的明确错误：无权访问 企业专供oai 分组；文本生成失败，状态码 502 | 端到端 0/16；服务器无task拒绝 11；任务失败 5；成功刷新 0/0 | 当前暂不开放该模型的失败绑定；修复明确原因后重测，不永久禁用整渠道 |
| gpt-6-astra | 当前配置未取得成功；已建任务的明确错误：无权访问 企业专供oai 分组 | 端到端 0/16；服务器无task拒绝 13；任务失败 3；成功刷新 0/0 | 当前暂不开放该模型的失败绑定；修复明确原因后重测，不永久禁用整渠道 |
| gpt-image-2-all | 已有成功输出，失败来自具体绑定/上游余额/服务/超时等；不据此永久否定模型或整渠道 | 端到端 9/11；服务器无task拒绝 0；任务失败 2；成功刷新 9/9 | 保留成功绑定候选；对失败绑定/余额/服务定向处理并复测后再确定课堂开放 |
| gpt-image-2 | 已有成功输出，失败来自具体绑定/上游余额/服务/超时等；不据此永久否定模型或整渠道 | 端到端 9/11；服务器无task拒绝 0；任务失败 2；成功刷新 9/9 | 保留成功绑定候选；对失败绑定/余额/服务定向处理并复测后再确定课堂开放 |
| gpt-image-2-c | 实际执行attempt 11/11成功；模型/上游可用候选 | 端到端 11/11；服务器无task拒绝 0；任务失败 0；成功刷新 11/11 | 可有限开放本轮已测输入模式；继续观察，不外推全部能力 |
| gpt-image-2.5-sunburst | 已有成功输出，失败来自具体绑定/上游余额/服务/超时等；不据此永久否定模型或整渠道 | 端到端 4/11；服务器无task拒绝 0；任务失败 7；成功刷新 4/4 | 保留成功绑定候选；对失败绑定/余额/服务定向处理并复测后再确定课堂开放 |
| gpt-image-2-5-flare | 实际执行attempt 11/11成功；模型/上游可用候选 | 端到端 11/11；服务器无task拒绝 0；任务失败 0；成功刷新 11/11 | 可有限开放本轮已测输入模式；继续观察，不外推全部能力 |
| gpt-image-2-5-sunburst | 实际执行attempt 11/11成功；模型/上游可用候选 | 端到端 11/11；服务器无task拒绝 0；任务失败 0；成功刷新 11/11 | 可有限开放本轮已测输入模式；继续观察，不外推全部能力 |
| gpt-image-2-image-to-image | 已证实可产生可读输出；部分任务失败在结果媒体读取，不能据此判模型不支持该输入 | 端到端 16/22；服务器无task拒绝 0；任务失败 6；成功刷新 16/16 | 保留模型候选；授权媒体读取链路需修复/复测，暂不承诺课堂稳定 |
| gpt-image-2-text-to-image | 已证实可产生可读输出；部分任务失败在结果媒体读取，不能据此判模型不支持该输入 | 端到端 7/11；服务器无task拒绝 0；任务失败 4；成功刷新 7/7 | 保留模型候选；授权媒体读取链路需修复/复测，暂不承诺课堂稳定 |
| doubao-seedance-2-0-260128 | 当前配置未取得成功；已建任务的明确错误：预扣费额度失败, 用户剩余额度: ＄0.856484, 需要预扣费额度: ＄3.146400；预扣费额度失败, 用户剩余额度: ＄0.645056, 需要预扣费额度: ＄3.146400；预扣费额度失败, 用户剩余额度: ＄0.565056, 需要预扣费额度: ＄3.146400 | 端到端 0/6；服务器无task拒绝 2；任务失败 4；成功刷新 0/0 | 当前暂不开放该模型的失败绑定；修复明确原因后重测，不永久禁用整渠道 |
| doubao-seedance-2-0 | 实际执行attempt 6/6成功；模型/上游可用候选 | 端到端 6/6；服务器无task拒绝 0；任务失败 0；成功刷新 6/6 | 可有限开放本轮已测输入模式；继续观察，不外推全部能力 |
| doubao-seedance-2-5-260628 | 当前配置未取得成功；已建任务的明确错误：预扣费额度失败, 用户剩余额度: ＄0.856484, 需要预扣费额度: ＄5.040000 | 端到端 0/6；服务器无task拒绝 5；任务失败 1；成功刷新 0/0 | 当前暂不开放该模型的失败绑定；修复明确原因后重测，不永久禁用整渠道 |
| official/seedance-2 | 实际执行attempt 6/6成功；模型/上游可用候选 | 端到端 6/6；服务器无task拒绝 0；任务失败 0；成功刷新 6/6 | 可有限开放本轮已测输入模式；继续观察，不外推全部能力 |
| official/seedance-2-5 | 实际执行attempt 6/6成功；模型/上游可用候选 | 端到端 6/6；服务器无task拒绝 0；任务失败 0；成功刷新 6/6 | 可有限开放本轮已测输入模式；继续观察，不外推全部能力 |
| 天翼云 Seedance 2.0 | 实际执行attempt 6/6成功；模型/上游可用候选 | 端到端 6/6；服务器无task拒绝 0；任务失败 0；成功刷新 6/6 | 可有限开放本轮已测输入模式；继续观察，不外推全部能力 |
| 天翼云 Seedance 2.0 Fast | 实际执行attempt 6/6成功；模型/上游可用候选 | 端到端 6/6；服务器无task拒绝 0；任务失败 0；成功刷新 6/6 | 可有限开放本轮已测输入模式；继续观察，不外推全部能力 |
| 天翼云 Seedance 2.0 Mini | 已有成功输出，失败来自具体绑定/上游余额/服务/超时等；不据此永久否定模型或整渠道 | 端到端 5/6；服务器无task拒绝 0；任务失败 1；成功刷新 5/5 | 保留成功绑定候选；对失败绑定/余额/服务定向处理并复测后再确定课堂开放 |

## 5. 按真实输入模式分层

图+文参考图来自本轮自己生成的非个人静物，实际“上传素材→真实连线→图片生成”。原生reference未显式给role时记录implicit-default，不补造显式角色。图+文的11笔为8成功、3媒体读取失败；不能将同名纯文本路径的成功混作图生图通过。普通视频均为文生视频；未测试参考视频/音频、首尾帧等，不做通过结论。

| 模型 | 实际输入模式 | 提交/DB任务 | 成功/失败 | 成功率 |
| --- | --- | --- | --- | --- |
| gpt-image-2-c | text-to-image | 11/11 | 11/0 | 100% |
| gpt-5.6-luna | text-to-text | 16/14 | 14/2 | 87.5% |
| 天翼云 Seedance 2.0 Mini | text-to-video | 6/6 | 5/1 | 83.33% |
| gpt-5 | text-to-text | 16/14 | 14/2 | 87.5% |
| gpt-5.2 | text-to-text | 16/13 | 13/3 | 81.25% |
| gpt-5-mini | text-to-text | 16/14 | 14/2 | 87.5% |
| gpt-5.1 | text-to-text | 16/14 | 14/2 | 87.5% |
| gpt-5-pro | text-to-text | 16/14 | 0/16 | 0% |
| gpt-5.4 | text-to-text | 16/13 | 13/3 | 81.25% |
| gpt-5.5-pro | text-to-text | 16/15 | 0/16 | 0% |
| gpt-5.4-pro | text-to-text | 16/15 | 0/16 | 0% |
| gpt-5.4-mini | text-to-text | 16/14 | 14/2 | 87.5% |
| gpt-5.5 | text-to-text | 16/15 | 15/1 | 93.75% |
| gpt-5.6-sol | text-to-text | 16/14 | 14/2 | 87.5% |
| gpt-5.6-terra | text-to-text | 16/14 | 14/2 | 87.5% |
| codex-auto-review | text-to-text | 16/5 | 0/16 | 0% |
| gpt-6-astra | text-to-text | 16/3 | 0/16 | 0% |
| gpt-image-2 | text-to-image | 11/11 | 9/2 | 81.82% |
| gpt-image-2-all | text-to-image | 11/11 | 9/2 | 81.82% |
| gpt-image-2-image-to-image | text-to-image | 11/11 | 8/3 | 72.73% |
| gpt-image-2.5-sunburst | text-to-image | 11/11 | 4/7 | 36.36% |
| gpt-image-2-5-flare | text-to-image | 11/11 | 11/0 | 100% |
| gpt-image-2-5-sunburst | text-to-image | 11/11 | 11/0 | 100% |
| gpt-image-2-text-to-image | text-to-image | 11/11 | 7/4 | 63.64% |
| 天翼云 Seedance 2.0 Fast | text-to-video | 6/6 | 6/0 | 100% |
| official/seedance-2-5 | text-to-video | 6/6 | 6/0 | 100% |
| doubao-seedance-2-0-260128 | text-to-video | 6/4 | 0/6 | 0% |
| official/seedance-2 | text-to-video | 6/6 | 6/0 | 100% |
| doubao-seedance-2-0 | text-to-video | 6/6 | 6/0 | 100% |
| doubao-seedance-2-5-260628 | text-to-video | 6/1 | 0/6 | 0% |
| 天翼云 Seedance 2.0 | text-to-video | 6/6 | 6/0 | 100% |
| gpt-image-2-image-to-image | image+text-to-image | 11/11 | 8/3 | 72.73% |

## 6. 原始渠道与真实attempt

配置首渠道按本轮起始启用绑定优先级保留；任务创建原渠道取task_created事件，文本没有该事件时实际首attempt单列。静态配置不冒充实际执行。

| 模型 | 配置首渠道 | 真实首attempt渠道 | 真实末渠道 | 首attempt成功/总数 |
| --- | --- | --- | --- | --- |
| gpt-5.6-luna | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 14/14 |
| gpt-5 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 14/14 |
| gpt-5-mini | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 14/14 |
| gpt-5-pro | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 0/14 |
| gpt-5.1 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 14/14 |
| gpt-5.2 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 13/13 |
| gpt-5.4 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 13/13 |
| gpt-5.4-mini | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 14/14 |
| gpt-5.4-pro | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 0/15 |
| gpt-5.5 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 15/15 |
| gpt-5.5-pro | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 0/15 |
| gpt-5.6-sol | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 14/14 |
| gpt-5.6-terra | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 模汇x中漫 API gpt文本 | 14/14 |
| codex-auto-review | 昱梦渠道 gpt | 昱梦渠道 gpt | 昱梦渠道 gpt | 0/5 |
| gpt-6-astra | 昱梦渠道 gpt | 昱梦渠道 gpt | 昱梦渠道 gpt | 0/3 |
| gpt-image-2-all | 模汇X中漫 API 渠道 | 模汇X中漫 API 渠道 | 模汇X中漫 API 渠道 / 兔子 API 渠道 | 9/11 |
| gpt-image-2 | 兔子 API 渠道 | 兔子 API 渠道 | 兔子 API 渠道 | 9/11 |
| gpt-image-2-c | 模汇X中漫 API 渠道 | 模汇X中漫 API 渠道 | 模汇X中漫 API 渠道 | 11/11 |
| gpt-image-2.5-sunburst | 兔子 API 渠道 | 兔子 API 渠道 | 兔子 API 渠道 / modelbay API 渠道 / 模汇X中漫 API 渠道 | 4/11 |
| gpt-image-2-5-flare | modelbay API 渠道 | modelbay API 渠道 | modelbay API 渠道 | 11/11 |
| gpt-image-2-5-sunburst | modelbay API 渠道 | modelbay API 渠道 | modelbay API 渠道 | 11/11 |
| gpt-image-2-image-to-image | modelbay API 渠道 | modelbay API 渠道 | modelbay API 渠道 | 16/22 |
| gpt-image-2-text-to-image | modelbay API 渠道 | modelbay API 渠道 | modelbay API 渠道 | 7/11 |
| doubao-seedance-2-0-260128 | 兔子 API 渠道 | 兔子 API 渠道 | 兔子 API 渠道 | 0/4 |
| doubao-seedance-2-0 | 模汇X中漫 API 渠道 | 模汇X中漫 API 渠道 | 模汇X中漫 API 渠道 | 6/6 |
| doubao-seedance-2-5-260628 | 兔子 API 渠道 | 兔子 API 渠道 | 兔子 API 渠道 | 0/1 |
| official/seedance-2 | modelbay API 渠道 | modelbay API 渠道 | modelbay API 渠道 | 6/6 |
| official/seedance-2-5 | modelbay API 渠道 | modelbay API 渠道 | modelbay API 渠道 | 6/6 |
| 天翼云 Seedance 2.0 | 天翼云星辰 TokenHub 视频渠道 | 天翼云星辰 TokenHub 视频渠道 | 天翼云星辰 TokenHub 视频渠道 | 6/6 |
| 天翼云 Seedance 2.0 Fast | 天翼云星辰 TokenHub 视频渠道 | 天翼云星辰 TokenHub 视频渠道 | 天翼云星辰 TokenHub 视频渠道 | 6/6 |
| 天翼云 Seedance 2.0 Mini | 天翼云星辰 TokenHub 视频渠道 | 天翼云星辰 TokenHub 视频渠道 | 天翼云星辰 TokenHub 视频渠道 | 5/6 |

实际渠道+上游模型的每次attempt统计：

| 类型 | 实际渠道 | 实际upstream model | attempt成功/失败/总数 | 成功率 | 成功attempt均值/P95秒 | 失败attempt均值/P95秒 |
| --- | --- | --- | --- | --- | --- | --- |
| image | 模汇X中漫 API 渠道 | gpt-image-2-c | 11/0/11 | 100% | 111.071 / 298.108 | — / — |
| text | 模汇x中漫 API gpt文本 | gpt-5.6-luna | 14/0/14 | 100% | 3.075 / 8.558 | — / — |
| video | 天翼云星辰 TokenHub 视频渠道 | cdance2.0-mini-0807 | 5/1/6 | 83.33% | 88.095 / 96.035 | 6.884 / 6.884 |
| text | 模汇x中漫 API gpt文本 | gpt-5 | 14/0/14 | 100% | 20.518 / 49.95 | — / — |
| text | 模汇x中漫 API gpt文本 | gpt-5.2 | 13/0/13 | 100% | 5.668 / 31.287 | — / — |
| text | 模汇x中漫 API gpt文本 | gpt-5-mini | 14/0/14 | 100% | 14.423 / 44.005 | — / — |
| text | 模汇x中漫 API gpt文本 | gpt-5.1 | 14/0/14 | 100% | 2.369 / 5.955 | — / — |
| text | 模汇x中漫 API gpt文本 | gpt-5-pro | 0/14/14 | 0% | — / — | 2.974 / 9.164 |
| text | 模汇x中漫 API gpt文本 | gpt-5.4 | 13/0/13 | 100% | 2.409 / 5.194 | — / — |
| text | 模汇x中漫 API gpt文本 | gpt-5.5-pro | 0/15/15 | 0% | — / — | 1.346 / 4.052 |
| text | 模汇x中漫 API gpt文本 | gpt-5.4-pro | 0/15/15 | 0% | — / — | 6.751 / 18.755 |
| text | 模汇x中漫 API gpt文本 | gpt-5.4-mini | 14/0/14 | 100% | 2.554 / 5.477 | — / — |
| text | 模汇x中漫 API gpt文本 | gpt-5.5 | 15/0/15 | 100% | 3.487 / 6.617 | — / — |
| text | 模汇x中漫 API gpt文本 | gpt-5.6-sol | 14/0/14 | 100% | 4.67 / 11.796 | — / — |
| text | 模汇x中漫 API gpt文本 | gpt-5.6-terra | 14/0/14 | 100% | 2.835 / 6.566 | — / — |
| text | 昱梦渠道 gpt | codex-auto-review | 0/5/5 | 0% | — / — | 3.131 / 10.635 |
| text | 昱梦渠道 gpt | gpt-6-astra | 0/3/3 | 0% | — / — | 2.153 / 3.56 |
| image | 兔子 API 渠道 | gpt-image-2 | 9/2/11 | 81.82% | 35.518 / 86.172 | 0.761 / 0.824 |
| image | 模汇X中漫 API 渠道 | gpt-image-2-all | 9/3/12 | 75% | 60.482 / 102.342 | 200.095 / 300.088 |
| image | modelbay API 渠道 | gpt-image-2-image-to-image | 16/6/22 | 72.73% | 93.122 / 128.261 | 125.417 / 151.398 |
| image | 兔子 API 渠道 | gpt-image-2.5-sunburst | 4/7/11 | 36.36% | 33.548 / 37.499 | 3.617 / 8.632 |
| image | modelbay API 渠道 | gpt-image-2-5-flare | 11/0/11 | 100% | 35.426 / 63.196 | — / — |
| image | modelbay API 渠道 | gpt-image-2-5-sunburst | 11/0/11 | 100% | 31.121 / 57.679 | — / — |
| image | modelbay API 渠道 | gpt-image-2-text-to-image | 7/4/11 | 63.64% | 94.261 / 116.803 | 114.546 / 126.758 |
| video | 天翼云星辰 TokenHub 视频渠道 | cdance2.0-fast-0807 | 6/0/6 | 100% | 104.341 / 121.452 | — / — |
| video | modelbay API 渠道 | official/seedance-2-5 | 6/0/6 | 100% | 159.251 / 180.988 | — / — |
| video | 兔子 API 渠道 | doubao-seedance-2-0-260128 | 0/4/4 | 0% | — / — | 1.232 / 1.936 |
| video | modelbay API 渠道 | official/seedance-2 | 6/0/6 | 100% | 203.247 / 262.917 | — / — |
| video | 模汇X中漫 API 渠道 | doubao-seedance-2-0 | 6/0/6 | 100% | 271.055 / 299.876 | — / — |
| video | 兔子 API 渠道 | doubao-seedance-2-5-260628 | 0/1/1 | 0% | — / — | 0.756 / 0.756 |
| video | 天翼云星辰 TokenHub 视频渠道 | cdance2.0-0807 | 6/0/6 | 100% | 240.319 / 276.465 | — / — |
| image | modelbay API 渠道 | gpt-image-2.5-sunburst | 0/2/2 | 0% | — / — | 0.025 / 0.026 |
| image | 模汇X中漫 API 渠道 | gpt-image-2.5-sunburst | 0/1/1 | 0% | — / — | 0.027 / 0.027 |
| image | 兔子 API 渠道 | gpt-image-2-all | 0/1/1 | 0% | — / — | 0.154 / 0.154 |

## 7. 逐账号与资源

| alias | userId核对 | 提交/DB任务 | 成功/失败 | 模型数 | 消费/退款 | 前/后余额 |
| --- | --- | --- | --- | --- | --- | --- |
| U05 | 匹配 | 28/24 | 17/11 | 25 | 24/7 | 92 / 75 |
| U03 | 匹配 | 31/27 | 21/10 | 28 | 27/6 | 94 / 73 |
| U04 | 匹配 | 29/25 | 18/11 | 26 | 25/7 | 93 / 75 |
| U01 | 匹配 | 29/25 | 20/9 | 27 | 25/5 | 95 / 75 |
| U02 | 匹配 | 32/27 | 20/12 | 28 | 27/7 | 94 / 74 |
| U07 | 匹配 | 25/20 | 16/9 | 22 | 20/4 | 93 / 77 |
| U06 | 匹配 | 27/23 | 18/9 | 24 | 23/5 | 93 / 75 |
| U09 | 匹配 | 22/19 | 15/7 | 21 | 19/4 | 94 / 79 |
| U10 | 匹配 | 21/17 | 14/7 | 20 | 17/3 | 93 / 79 |
| U08 | 匹配 | 24/19 | 15/9 | 21 | 19/4 | 91 / 76 |
| U15 | 匹配 | 27/22 | 17/10 | 26 | 22/5 | 93 / 76 |
| U12 | 匹配 | 22/20 | 15/7 | 21 | 20/5 | 92 / 77 |
| U11 | 匹配 | 22/19 | 14/8 | 21 | 19/5 | 94 / 80 |
| U13 | 匹配 | 23/21 | 15/8 | 22 | 21/6 | 95 / 80 |
| U14 | 匹配 | 25/23 | 17/8 | 24 | 23/6 | 96 / 79 |

| 容器 | 离散资源快照数 | 最大观察CPU | 最大观察内存MiB |
| --- | --- | --- | --- |
| vozeb-pro | 47 | 125.75% | 474.1 |
| vozeb-pro-generation-worker | 47 | 0.64% | 40.92 |
| vozeb-pro-postgres | 47 | 21.85% | 130.3 |

app/worker重启计数均始终0；资源数为离散采样峰值，不宣称连续绝对峰值。版本/revision定时快照未观察到变化；各样本仍归属原SHA/revision93。

## 8. 媒体读取失败的已有后端链路

### gpt-image-2-text-to-image：3e9c6c89-24b8-4432-aced-6d3c92b01353

- references=0；渠道 X9te4qOV0ZaPsJpErRRWS；最终 task status=error / phase=completed。
- 最终错误：上游图片无法通过授权媒体路径读取。
- generation_log completed_at：2026-10-21 10:45:06 +08:00，日志状态 failed。

| 北京时间 | phase | state/status | errorCode | 去查询串URL |
| --- | --- | --- | --- | --- |
| 2026-10-21 10:43:14 +08:00 | task_created | — | — | — |
| 2026-10-21 10:43:14 +08:00 | state | submitting | submitting | — |
| 2026-10-21 10:43:14 +08:00 | transport_request | — | — | http://127.0.0.1:3000/api/ai/system/X9te4qOV0ZaPsJpErRRWS/image/submit |
| 2026-10-21 10:43:14 +08:00 | upstream_request | — | — | https://api.modelbay.io/image/submit |
| 2026-10-21 10:43:19 +08:00 | upstream_response | 200 | — | https://api.modelbay.io/image/submit |
| 2026-10-21 10:45:06 +08:00 | state | error | — | — |
| 2026-10-21 10:45:06 +08:00 | state | completed | failed | — |

- 可证事实：上游/image/submit返回HTTP200，随后已有submitted状态，最后进入授权媒体读取错误并保存失败日志。现有旧版本事件未完整保留失败媒体URL及读取HTTP状态，不能仅据安全错误文案断言是401/403、输入不支持或上游最终生成成功。此处只读已有任务，没有新付费请求。

### gpt-image-2-image-to-image：47cd8c45-389c-4017-a584-b915251f4985

- references=1；渠道 X9te4qOV0ZaPsJpErRRWS；最终 task status=error / phase=completed。
- 最终错误：上游图片无法通过授权媒体路径读取。
- generation_log completed_at：2026-10-21 10:52:32 +08:00，日志状态 failed。

| 北京时间 | phase | state/status | errorCode | 去查询串URL |
| --- | --- | --- | --- | --- |
| 2026-10-21 10:50:21 +08:00 | task_created | — | — | — |
| 2026-10-21 10:50:21 +08:00 | state | submitting | submitting | — |
| 2026-10-21 10:50:21 +08:00 | transport_request | — | — | http://127.0.0.1:3000/api/ai/system/X9te4qOV0ZaPsJpErRRWS/image/submit |
| 2026-10-21 10:50:21 +08:00 | upstream_request | — | — | https://api.modelbay.io/image/submit |
| 2026-10-21 10:50:28 +08:00 | upstream_response | 200 | — | https://api.modelbay.io/image/submit |
| 2026-10-21 10:52:32 +08:00 | state | error | — | — |
| 2026-10-21 10:52:32 +08:00 | state | completed | failed | — |

- 可证事实：上游/image/submit返回HTTP200，随后已有submitted状态，最后进入授权媒体读取错误并保存失败日志。现有旧版本事件未完整保留失败媒体URL及读取HTTP状态，不能仅据安全错误文案断言是401/403、输入不支持或上游最终生成成功。此处只读已有任务，没有新付费请求。

## 9. 可审计文件与局限

- samples.json/.csv：387个去重原生提交，保留原始payload模型、picker最终title、reference数量/角色、clientRequestId/project/node、POST HTTP、task关联方法、各attempt、终态、完整耗时来源/代理值、独立刷新证据。
- model-summary.json/.csv：31行双维判断；input-mode-summary.json/.csv：实际输入模式分层。
- attempts.json/.csv、channel-attempt-summary.json/.csv：336真实attempt的原始/实际渠道和upstream。
- server-rejections-without-task.json/.csv：56个服务器拒绝，不并入上游attempt分母。
- account-summary.json/.csv、validation.json、resource-summary.json、media-read-failure-chains.json/.md；外层原始events/DB/refresh/version/resource证据可复核。
- private目录保留storage/凭据/完整userId映射/受控参考源图，不纳入外发。未改配置、路由、账号密码或积分，未推送/部署；只发生授权的原生生成消费/退款与画布原生保存/恢复。
- 零失败的小样本不是全部能力或所有时段的保证；有部分绑定/时段成功的模型仍保留候选，不用统一数值门槛机械隐藏。暂不开放建议仅针对明确失败状态，问题修复后应复测。
