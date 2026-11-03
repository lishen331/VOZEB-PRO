# 生产课堂只读监控补充（2026-10-22 16:45，北京时间）

本文件是当日持续报告的阶段性补充，不是最终关闭或修复验收。


### 13.74 16:41 北京时间：新增33笔失败的只读冻结；14笔栈溢出、8笔ModelBay素材403以及部署交界提交中断

**冻结依据**：`2026-10-22-classroom-evidence/readonly-delta-20261022-164145.json`，事务隔离为`REPEATABLE READ READ ONLY`，数据库事务时刻 **2026-10-22 16:41:45+08**。当天08:30起Canvas窗口为 **272 success / 298 error / 10 running**；已终态成功率 **47.72%**。仍可能包含该窗口的测试，不能宣称纯学生成功率或纯平台故障率。相对16:15:19基线**新增25成功、33失败**；任务按task ID去重，不把fallback attempt累计成新任务。

| 类型 | 成功 | 失败 | 在途 | 已终态成功率 |
| --- | ---: | ---: | ---: | ---: |
| 图片 | 122 | 129 | 6 | 48.61% |
| 视频 | 150 | 169 | 4 | 47.02% |
| 合计 | 272 | 298 | 10 | 47.72% |

#### A. 本窗口的33笔失败分组

- **14笔图片**：收到上游HTTP200并完整读完正文后，平台`RangeError: Maximum call stack size exceeded`，随后fallback的逻辑模型绑定403覆盖顶层错误。
- **1笔图片**：ModelBay拒绝`response_format`参数（`5b646668-62e6-4e2f-9f99-881c7e97d5a1`）。
- **2笔图片**：提交阶段中断，无上游任务ID；见C。
- **8笔视频**：ModelBay素材接口HTTP403；错误日志只保留通用消息，未提供足以区分余额、权限、策略等原因的上游正文/code，不猜成密钥错误或用户积分不足。
- **7笔视频**：模汇或TokenHub素材高度范围校验失败；没有具体像素值时不能断言一定小于300。
- **1笔视频**：兔子拒绝含真人的输入，`263d1853-a1bf-4322-b849-a8d3f45d541c`，input `content[1]` / `content[2]`。

#### B. 14笔图片HTTP200后RangeError的关联证据

| task ID | 用户所选逻辑模型 | 完整响应字节数 | 首attempt上游request ID |
| --- | --- | ---: | --- |
| `685fca7c-bc66-4459-a918-42acc20c8e02` | `gpt-image-2-c` | 4,635,972 | `20261022083523907575008RI2ypSq2Nkypg0Ou` |
| `f41da877-a2ef-4c2e-b968-4e76dfbba8d3` | `gpt-image-2` | 11,015,283 | `202610220833581278879738268d9d6kCp4Ef0m` |
| `5dd09f0a-f74c-410b-befe-ab5c890ee5a1` | `gpt-image-2-all` | 4,759,094 | `202610220830191397120342l2yefu6sx9eXqKm` |
| `641dd96b-049d-4761-9518-58e3ca253020` | `gpt-image-2` | 4,880,035 | `202610220827326371370198268d9d6UKGMFktH` |
| `7141b4ea-ebb1-4c46-8cc1-18aa63ee6f02` | `gpt-image-2` | 9,020,708 | `b2b3d9c0` |
| `8c1a128c-216a-4287-ac64-e2f609b90907` | `gpt-image-2` | 4,667,955 | `202610220824543750060638268d9d6yV2K46jn` |
| `1eb652cc-4d5f-4809-84ff-a8583575738d` | `gpt-image-2-c` | 8,509,442 | `20261022082215435697351RI2ypSq2j9fvnJky` |
| `35e2aafb-b1ff-4311-9f84-00578eafa809` | `gpt-image-2-c` | 6,158,062 | `20261022082015169915980RI2ypSq2CRDvC43h` |
| `0d60e672-7d03-4837-863c-3597d51d98c7` | `gpt-image-2-all` | 4,490,500 | `202610220821363924612412l2yefu6lQ5Pv8x4` |
| `da4e8820-35cc-4579-9975-f9d92b39ca19` | `gpt-image-2-c` | 8,146,195 | `20261022082001360225505RI2ypSq2GnKsjJqg` |
| `e2307a7a-c59b-45cd-a00b-7a5bd58c4b1b` | `gpt-image-2-c` | 6,479,745 | `20261022081734094497441RI2ypSq2vLheg7S0` |
| `f0bbc560-0acf-4cea-a564-bb84cde045f8` | `gpt-image-2-c` | 4,542,176 | `20261022081703596707166RI2ypSq2ctlWqVJa` |
| `49cd0560-8c62-4074-93c0-9f420e07dd0f` | `gpt-image-2-all` | 7,702,346 | `20261022081351950265652RI2ypSq2sH9bindU` |
| `91d825ee-3793-463e-a9b1-807c9dda90d6` | `gpt-image-2-all` | 6,270,209 | `202610220812207332783652l2yefu6gXyB98tX` |

这14笔逐task核验均有generation log `failed / successCount=0 / failCount=1`，各有按task幂等键关联的**1积分退款**；平台退款不证明上游未收费。不存在生产stack frame，因此边界是**收到完整成功HTTP响应后的平台provider路径**，尚不能定位某个具体函数；也不能把HTTP200等同可用图片生成成功。

本机另从当时生产镜像对应的不可变Git提交`2b99976ffff6f6060fd06c07767e56d62eb5a402`抽取源码，以Node **v24.16.0**运行24组离线合成fixture（4种JSON/base64包裹形状，base64长度1KB到12MB），覆盖JSON往返、provider业务错误检查、`findImageResults`、`configuredImageResult`、`parseImagePayloadOrPoll`：**24/24未复现**。这不是修复或完整链路测试；外部依赖被stub，未覆盖真实生产响应、transport、计费、存储及结果规范化，且没有生产堆栈。证据为`offline-image-response-probe-20261022.json`和同名`.cjs`。它只排除了这批合成输入下的解析函数触发，不能反证真实课堂异常。

#### C. 新的镜像切换与两笔已外呼但无响应记录的提交中断

采样器确认生产App于 **16:37:58.124**、worker于 **16:38:13.782**切换到镜像`sha-bc2643a5d2c8ddc51173f4a74d45da3c6ee52859`，之前镜像为`sha-2b99976ffff6f6060fd06c07767e56d62eb5a402`。这是**镜像及StartedAt双重变化的证据**，不是RestartCount推断；本轮操作仅只读观察，未实施该部署。

| task ID | 创建时间（北京） | 失败时间（北京） | generation log耗时 |
| --- | --- | --- | ---: |
| `14878a5f-18ef-44c3-a830-c891414ba556` | 16:36:58.986 | 16:39:59.030 | 180.046 s |
| `60d08e23-f36f-4b94-89af-12b3c68b7b7d` | 16:37:02.881 | 16:40:02.937 | 180.060 s |

两笔**确有`upstream_request`事件**，之后没有记录到相应响应/request ID，最终recovery以`submission_interrupted_without_upstream_id`收敛为error。均`billing=null`，按task直接幂等键未查到扣费/退款记录；这只能说明当前关联证据不足，**不能证明未扣费、上游未收到或退款缺失**。与镜像切换的时间关系明确，但缺少请求完成/取消证据，因果仍需进一步查证。不要自动重放可能已收费请求。

建议（未执行）：正式修复应在发布切换前排空或可靠交接在途提交，核对请求ID和收费证据后再恢复未知任务；补充脱敏、截断的异常stack与关键子阶段，避免仅凭顶层403和无request ID分类。ModelBay素材子调用需保留HTTP状态、上游code、脱敏消息和关联request ID。**没有改生产或推GitHub。**

### 13.75 16:45 北京时间：新镜像后的8笔自然图片成功，不能将旧版本失败混入新版本结论

证据：`2026-10-22-classroom-evidence/post-release-image-verification-20261022-164516.json`；查询窗口为 **16:38:14起创建**的生产Canvas图片任务。该冻结有**8 success / 0 error / 1 running**。8笔均有generation log成功且`result_payload`非空，诊断记录未见`provider_exception`或自动fallback；这证明服务端结果持久化，但不替代每个学生浏览器的显示验收。

| task ID | 逻辑模型 | 服务端总耗时 | 完整响应字节数/说明 | 结果 |
| --- | --- | ---: | --- | --- |
| `c0629ca6-61e9-4ec5-8e81-74e0de94b2b9` | `gpt-image-2` | 96.868 s | 8,354,120 | 已持久化 |
| `8ff4c81b-c7ed-4fb0-8c8a-d8d5187ef212` | `gpt-image-2-all` | 258.358 s | 4,442,522 | 已持久化 |
| `ef643bc2-2314-449b-ba99-f47ebdf40aac` | `gpt-image-2-c` | 230.034 s | 3,388,050 | 已持久化 |
| `65ccada1-0b73-4fc9-a335-01a6b1a8cf05` | `gpt-image-2-c` | 217.924 s | 7,032,117 | 已持久化 |
| `c52d1105-7d22-4c50-a422-8d78373dcdf7` | `gpt-image-2-c` | 177.213 s | 3,561,918 | 已持久化 |
| `48df9792-ad9c-410e-9be7-ccf721fd2408` | `gpt-image-2.5-sunburst` | 211.804 s | 异步轮询响应，非图片字节数 | 已持久化 |
| `5bdd17da-75cc-41fe-b4bd-dd01d9f83e78` | `gpt-image-2-c` | 142.280 s | 2,342,098 | 已持久化 |
| `e61e8bf7-4a3e-4d7a-950c-767f157c85e1` | `gpt-image-2` | 57.180 s | 4,977,427 | 已持久化 |

新样本包括约 **8.35MB**和**7.03MB**的同步响应成功，所以**不能把4MB作为已证实的失败阈值**。但样本量和覆盖仍不足，尚未证明原RangeError已彻底修复。Git提交差异显示本轮新镜像主要增加溢出候选路由身份及内部绑定校验修复；“overflow路由”不等于JS“stack overflow”，不能仅凭提交标题混为同一个问题。继续分别监控两者。

此前四笔长polling视频已全部自然成功：`f88741ae...` **444.627s**、`cc574f05...` **543.424s**、`8a27def2...` **868.784s**、`888d3de5...` **978.571s**。证据同时在16:41冻结文件的`earlier_active_status`；这再次说明持有有效上游ID、有新鲜心跳的长polling不应人工直接标失败。

最新独立资源与容器快照见`resource-release-snapshot-20261022-1647.json`，采样器/watchdog继续在线；资源健康不能代替业务成功。当前仍有自然生成在途，课堂只读监控继续；不发布“全部修复”或“任务完成”结论。
