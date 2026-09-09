# Agent 生产验收与缺陷汇总（2026-09-09）

状态：执行中
环境：http://8.163.37.148:3001
账号：laoshi1（普通测试账号）

## 执行原则
一次性按完整矩阵执行；每条记录真实页面结果、runId、任务状态和上游证据。自动化测试不能替代线上真实验收。

## 已知基线
P0-01 参数页签污染：已修复并线上通过。
P0-02 多模态图片盲测：已修复并线上通过（gemini-3.1-flash-image-preview）；gpt-5.5 当前路由曾不可用，属于配置阻断。

## 本轮矩阵
- [ ] 文字上下文
- [ ] 文生图/图生图/双参考图
- [ ] 文生视频/图生视频/首尾帧
- [ ] 音频入口与阻断边界
- [ ] 五个 Skill 正向/逆向/冲突
- [ ] 多模型与多任务
- [ ] 文案→图→视频
- [ ] 刷新/离开/恢复
- [ ] 取消/重试/重新检查/部分成功
- [ ] 上传拖拽/粘贴/重复素材
- [ ] 提示词库/历史/灵感复用
- [ ] 会话切换与分页
- [ ] 390/430px、深色、弹窗、滚动
- [ ] 普通账号权限/积分/幂等

## 发现问题
（执行中追加）
- 2026-09-09 全量自动化回归重新执行：837 个测试文件通过、6 个跳过；4121 个测试通过、31 个跳过；0 失败。
- 线上本轮已完成：参数页签污染 P0-01 通过；多模态盲测 P0-02 通过；测试证据详见 `agent-create-live-adversarial-review.zh-CN.md`。
- 本轮生产矩阵尚未全部完成，原因是完整媒体矩阵需要逐项真实上游调用，且当前正式音频模型未配置；不能用自动化测试替代。
- 下一步统一收集浏览器线上矩阵：文生图/图生图/视频/首尾帧/五 Skill/文案→图→视频/历史与提示词/上传竞态/430px/普通账号计费。完成后再一次性列出产品 Bug、根因和修复方案。
- 2026-09-09 统一真实验收已启动：
  - 全量自动化：837 文件通过/6 跳过，4121 测试通过/31 跳过。
  - 线上文生图：新会话输入红色陶瓷杯产品主图请求；run `agent-nBrl3O-Mch6JuOdLSl9c0` completed，任务 type=image、model=gpt-image-2-all、任务 completed，生成结果回写。
  - 线上 P0-01/P0-02 已在此前新会话中通过；不重复执行。
  - 本文档后续将统一追加剩余线上矩阵的真实证据、产品 Bug、根因及修复建议。
- 2026-09-09 一次性线上批次执行（首批）
  - 文字对话：run `agent-cIRbnbkUG41fOqwu-u-ML` completed，tasks=[]，通过。
  - 文生图：run `agent-tnoPdxv8NBhgWQlcaEQ0x` completed，image/gpt-image-2-all，资产 `asset-STEOm3FaeJHCYDTKI6P2Z`，通过。
  - 文生视频：run `agent-Q7d0qXbSJxCFGJpa-WJl2`，video/doubao-seedance-2-0，当前仍 running（上游处理中），暂不判定失败；需继续查询最终状态。
- 执行方式：每轮批量启动多个独立新会话，不再逐项汇报；最终统一整理产品缺陷、根因、修复方案。
- 2026-09-09 首批批量真实线上矩阵最终状态：
  - 文字-only `agent-cIRbnbkUG41fOqwu-u-ML`：completed，tasks=[]。
  - 文生图 `agent-tnoPdxv8NBhgWQlcaEQ0x`：completed，image/gpt-image-2-all，asset `asset-STEOm3FaeJHCYDTKI6P2Z`。
  - 文生视频 `agent-Q7d0qXbSJxCFGJpa-WJl2`：先经历 running/上游处理中，最终 completed，video/doubao-seedance-2-0，asset `asset-4VTZsHQpBKXajHZKtzyAE`。
- 该批次证明文本、图片、视频三条基础正向链路可以在真实线上环境完成；视频异步等待期间任务状态保持 running，最终正确回写 completed。
- 全量矩阵仍在继续，尚未对上传竞态、图生图/首尾帧、五 Skill 冲突、提示词/历史复用、移动 430px、普通账号计费等未执行项做最终结论。
- 2026-09-09 批次继续执行：
  - 文字-only：completed，成功。
  - 文生图：completed，gpt-image-2-all，成功。
  - 文生视频：completed，doubao-seedance-2-0，成功。
  - 电商生图 Skill：规划正确为 image，但实际模型 `gemini-3-pro-image` 长时间处理中，最终进入 needs_review/paused，错误为“上游提交结果不确定，未取得可查询的任务 ID”；没有资产回写。判定：上游任务状态不可查询/模型协议阻断，不判为前端错误。
  - 连续文字上下文：completed，成功。
  - 430px 页面：scrollWidth=430、innerWidth=430，无横向溢出。
- 这次批量测试发现一个需后续确认的配置/上游问题：智能规划选择 `gemini-3-pro-image` 后，提交响应缺少可查询上游任务 ID。按系统安全契约保持 needs_review，不自动重试、不伪造成功、不重复扣费。
- 2026-09-09 最终批次线上回归（渠道替换后）：
  - 电商生图 Skill：任务进入新会话，但助手返回“生成渠道暂时无法连接，请稍后重试或联系管理员”，未取得媒体任务结果。
  - 图片动效 Skill：同样返回“生成渠道暂时无法连接”。本次无参考图，属于输入不完整+渠道失败组合，不能判为 Skill 正向通过。
  - 短剧策划 Skill 文字-only：同样返回“生成渠道暂时无法连接”，说明当前默认文本/规划渠道整体不可用；不是 Skill 逻辑拦截。
  - 430px：scrollWidth=430、innerWidth=430，无横向溢出。
- 与此前成功批次对比，渠道替换后文本、图片、视频和 Skill 请求均无法连接；这更像部署环境的模型渠道/分组路由配置未同步或上游不可达，而不是三个 Skill 同时回归。已保留真实 run 与错误消息，不修改业务代码或擅自切换配置。
