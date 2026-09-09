# Agent 上游恢复后续测

## 环境与结论

2026-09-08，线上测试环境8.163.37.148:3001，账号laoshi1；app/Worker镜像70b2fabfb30bcf5b24a2e2b7caac94b5e7839494。只读日志/任务查询配合Playwright实际点击；未修改渠道、账号或业务代码。截图域名未在本轮重新验收。

本轮证明截图识别修复有效，图片动效完成且可播放，双参考图电商生成有实际成果；但重试、Skill校验、待确认任务和多模型恢复存在缺口，不是完整验收通过。

## 通过及部分通过

| 用例 | 证据 | 判定 |
|---|---|---|
| 截图盲测 | agent-iJY2cnrSFU8j3xE96tqNQ，正确读出HTTP 403、TEST_PERMISSION_DENIED、QA-7429并解释权限问题；无媒体任务 | 通过 |
| 图片动效Skill | agent-LFwrTw1CPrPxfM71iz7z4，image-motion；真实视频子任务21c9421a-b609-45ed-a484-bb03a9f8cfbd，上游task_evCCRylb2H8kEsFHzJsTpLV7WKGzfIZd；完成资产asset-M6AmLuVLxEc96CD7lxxVj | 生成/回写通过 |
| 视频播放与恢复 | 页面播放时间前进到1.143916s，duration=5.06195，960×960，readyState=4，无播放器错误；生成中刷新、离页后再回到原会话有结果 | 有限恢复与播放通过；未做逐帧全片质量验收 |
| 双参考图电商Skill（指定图片模型路径） | agent-u-la7vMD2lYoypcxuU64r，gpt-image-2-all，ecommerce-image，两张真实参考；completed，资产asset-0GsXCqbUd_eYFlDR1UrqZ，960×960 | 传参/生成/显示通过；白色猫耳杯、蓝点、薄荷绿背景符合，奶油黄配色不明显，视觉要求部分通过 |
| 停止 | agent-wr2gx0Ito-XhSgflsDVPo和agent-_MqZFT-gn05fgD_LSlKdW经UI停止后run与子任务均为cancelled | 本地取消状态通过；不代表供应商停止或退款到账已验证 |

## 未通过及阻断

1. **旧规划任务直接重试计费冲突**：原截图失败任务agent-Q1PEH-MQ_q3tme3RSrv9O点击“直接重试”后提示“积分幂等键对应的消费参数不一致”。新建同图请求可正确识别，不代表旧任务重试正常。代码仍按run.id生成agent-plan计费身份，而重试可重新读取上下文/配置；需区分新尝试与重复投递，不能用随机键绕过扣费保护。
2. **短剧策划只写文字被Skill限制拦截**：agent-3q6m4XGKNhRGavnrwBTs3选择drama-planning，只要3镜头文字脚本，返回“Skill 不支持当前输入与输出组合”。服务端defaultSkillCapabilities从workspaces推导输出只包含image/video/audio，遗漏文字策划产物。
3. **美颜缺少图片仍提交生成**：agent-wr2gx0Ito-XhSgflsDVPo未上传图片，选择yanai-natural-beauty，规划出image任务且references为空；提示词虽写“必须等待原图”，服务端仍执行。已UI停止。服务端能力校验使用实际输入是否为声明集合子集，并未强制requiresReference；应在执行前校验真实参考存在。此为逆向验证，不是自然精修正向质量通过。
4. **角色设定进入待确认而无明确处理入口**：agent-XjlfMW2ISVY8afNTIGZys，character-design，指定gpt-image-2-all；子任务1dfd6eb8-3d63-4783-bfde-0eec1dadd41f为needs_review、submission_outcome_unknown，无上游ID。父run暂停，UI只说“任务已经暂停”，没有充分解释提交状态不确定。保留待确认，未重试或退款。
5. **双模型部分结果需要刷新、父子状态不一致**：agent-2xusKvTDsiV5HuJugGkv9确认requestedModelIds有gpt-image-2-all和gemini-3.1-flash-image，各1张。前者子任务0c3dcae4-4d09-40c3-b765-0b1106f10a9c已success；后者37fb824c-0687-4f9e-9ae5-ab383a1e85f2为needs_review、无上游ID；父run paused、前者父级task仍running。刷新后出现成功图片，但整体仍暂停。不能标多模型完整通过。保留未确认请求，不重复提交。
6. **智能电商规划HTTP 502**：agent-wgJ-fAilnpNE1KVEtb6iW，两图/ecommerce-image均正确选择，规划阶段约160秒后HTTP 502，无媒体子任务。指定图片模型可生成，不代表智能规划路径通过。
7. **音频仍无正式可用渠道**：只读确认唯一音频绑定RunningHub渠道purpose=open-source-practice，默认audioModel为空；与前轮相同阻断，未重复付费提交。未擅自将练习渠道改正式。

## 自动化操作污染，不能当产品通过证据

- agent-pSeZiBYO0XltBlKPgsaC2双参考图任务：测试中打开新标签被恢复到活跃会话，随后自动化点击“发送”实际落到任务操作，任务取消；不计成品验收。该页面出现“已为你生成图片”与取消状态同时存在，单独保留截图，不声称供应商生成成功。
- agent-_MqZFT-gn05fgD_LSlKdW原计划双模型，第二个模型定位失败（线上目录已变化），实际上只选了gpt-image-2-all。发现后取消，不计多模型验收。随后在弹层确认两个模型真实选中，另执行agent-2xusKvTDsiV5HuJugGkv9。
- 新标签访问/create可能恢复已有活跃/暂停会话；后续应以新建对话按钮、页面URL、主按钮含义和实际请求参数共同校验，任何前置操作失败都不得继续付费发送。

## 当前仍保留的待确认任务

- 角色设定：agent-XjlfMW2ISVY8afNTIGZys / 1dfd6eb8-3d63-4783-bfde-0eec1dadd41f。
- 多模型：agent-2xusKvTDsiV5HuJugGkv9 / 37fb824c-0687-4f9e-9ae5-ab383a1e85f2。
- 本轮末只读active列表是以上两个paused任务，无正在主动生成的run。供应商提交结果不确定，不将其声明为不存在、失败退款或已取消。

## 下一步

先修复新发现的重试尝试身份、Skill文字与必需参考校验、needs_review操作与部分结果同步；用同一失败用例回归。再补自然美颜/角色设定正向成品、全成功双模型、音频、首尾帧、成功重试、混合流程。上游间歇502与未知提交需结合中转日志，不能把所有问题都归为额度。

证据：本目录agent-resumed-*.png；本轮没有改业务代码、没有推送或部署。结果按样例成立，不承诺所有正向组合无问题。
# Online regression evidence — 2026-09-08 deployment ff24046e

- GitHub Actions `34187120450`: success.
- Staging app and generation worker both run `sha-ff24046e327942841e1297e4efd10fd1d9433a12`.
- `/api/health/ready`: ready=true, database healthy/schemaReady=true, generationWorker healthy.
- Multi-model paused run `agent-2xusKvTDsiV5HuJugGkv9`: after clicking `重新检查原任务`, completed sibling changed from running to completed and remained visible; unknown sibling stayed needs_review; no duplicate task was created. UI displayed explicit warning and safe recheck/cancel controls.
- Old retry run `agent-Q1PEH-MQ_q3tme3RSrv9O`: POST retry returned 200 and did not reproduce the former billing idempotency conflict. The run subsequently failed with `当前模型暂不可用`, which is an upstream/model availability result, not the former billing fingerprint mismatch.

## Current acceptance boundary

The approved defect fixes are deployed and the two highest-risk flows have online evidence. The retry flow still requires a currently available vision model for a successful final answer; this run cannot be declared content-successful solely because the old billing conflict disappeared. Drama planning text-only, beauty-without-reference, mobile layout, audio, and full five-Skill matrix remain separate acceptance cases.

## 2026-09-09 线上继续验收

- 短剧策划 Skill 文字-only 正向流程：通过。输入“只输出文字脚本，不生图、不生视频、不创建项目”，服务端生成并持久化完整 3 镜头文字脚本；消息状态为 completed，产生 1 个文本任务，无图片/视频/音频任务。
- 页面流程：发送后自动进入新会话，助手消息在约 40 秒内回写；未出现“Skill 不支持当前输入与输出组合”。
- 目前仍未执行自然美颜无参考图、角色设定正向、全成功双模型、音频和移动端矩阵；这些作为下一批验收项，不能以本次文字 Skill 结果替代。

- 2026-09-09 自然美颜 Skill 无参考图逆向流程：通过。真实线上新会话中未上传/引用素材，发送精修请求后助手明确返回“当前 Skill 需要参考素材，请先上传或引用素材后再生成”；消息为 failed，未创建图片任务。
- 2026-09-09 角色设定 Skill 正向流程：通过。线上生成成年女性短发邮差角色设定图，任务类型为 image，模型 gpt-image-2-all，任务与资产均 completed；optimizedPrompt 保留“不要视频”等约束，未携带参考图时仍按该 Skill 的无参考图正向路径生成。
- 2026-09-09 全成功双模型生成：通过。关闭智能规划后手动选择 gpt-image-2-all 与 gemini-3.1-flash-image，提交“两个模型各生成一张”请求；两项任务均完成，助手消息 completed，持久化 2 个 taskId 与 2 个 assetId，未进入待确认。
- 2026-09-09 继续验收：音频外部免费服务注册成本过高，按原计划不引入新的真实渠道；音频能力保留为环境配置阻断，不修改练习渠道。
- 移动端 390×844：旧多模型待确认会话能正常显示“部分上游任务结果待确认”、任务状态列表、“重新检查原任务”和“取消未完成任务”按钮，内容未被横向截断；移动布局验收通过（功能可见性层面）。
- 2026-09-09 取消流程线上验收：通过。移动端 390×844 打开旧待确认多模型运行，点击“取消未完成任务”后页面即时显示“Agent 任务已取消”，未重复生成。
- 2026-09-09 任务恢复/取消/重试矩阵补充：服务端路由测试通过（19 tests），事件流与客户端状态同步测试通过（23 tests）。覆盖 whole-run retry、child retry、并发保护、取消保留已完成子任务、partial_success 终态与事件游标。
- 当前线上可继续证明：暂停运行重新检查不会创建新任务；取消会将未完成子任务置为 cancelled 并保留已完成结果。
- 音频仍为环境阻断：未配置生产音频模型，未执行虚假成功测试。
- 2026-09-09 Agent 混合流程与结果回写补充验证：服务端 planner/media、intent guard、结果项持久化、recheck、direct execution 共 6 个测试文件 38 tests 全部通过。
- 线上 create overview 可读取最近双模型两项图片资产及两个仍暂停的历史任务；任务列表与资产列表数据均可回写，未发现成功资产被任务列表隐藏。
- 线上页面仍有头像 404（/api/public/users/laoshi1/avatar），不影响 Agent 任务链路，未在本轮修改无关头像回退。
- 2026-09-09 五个 Skill / 混合流程集中验收汇总：
  - 电商生图：此前线上双参考图路径已成功生成并回写资产；本轮 Skill 目录与选择入口确认存在。
  - 自然美颜精修：无参考图正确拦截；有参考图的生成路径已具备服务端 requiresReference 校验。
  - 角色设定：线上正向 image 生成通过。
  - 图片动效：此前线上 image-motion 实际生成视频并可播放，视频资产已回写。
  - 短剧策划：线上文字-only 生成通过，未创建媒体任务。
  - Skill 选择与 workspace 策略、输入意图保护、媒体规划、结果回写、恢复与取消相关自动化测试共 105 tests 全部通过。
- 混合任务边界：已覆盖服务端部分成功、待确认、取消、重试、结果保留；无上游任务 ID 的提交继续禁止自动重新生成。
- 音频：仍无正式生产模型配置，按约定不伪造通过结果。
- 本轮未修改业务代码，仅补充验收记录。
- 2026-09-09 P0 线上复测记录补充：测试账号与地址已沿用历史配置，无需用户重新提供。尝试从 `/create` 参数页签进入复测时，页面自动恢复已有会话 `conversation-HHSKmAENRdSJxYw0qXJkz`，未成功建立隔离新会话；因此本次操作未作为 P0 回归证据，避免把旧会话的“蓝宝是我们刚才的ip不是这个”任务误判为本次纯文字请求。
- 当前代码层 P0 修复仍由 986e0c0d 提供，针对性多模态/模式隔离测试已通过；线上复测必须先通过“新建对话”确认 URL、空消息、模型和 Skill，再发送，防止历史会话自动恢复污染测试。
