# 生产环境压测计划完成审计（2026-10-07）

计划：`docs/development/production-load-test-plan-2026-10-07.zh-CN.md`
最终报告：`C:/Users/admin/Downloads/VOZEB-capacity-20260919/production-20261007/production-final-report-2026-10-07.md`

## 逐项状态

| 计划项目 | 证据 | 状态/差距 |
|---|---|---|
| P0健康与账号核验 | health.json、account-summary.json；live/ready 200，91唯一账号 | 完成（生产资源采集见 prod-resource-10m.jsonl） |
| S1登录限流专项 | login-80、login-91-sequential、login-after-fix | 修复前复现5/80成功；修复后80/80并发复测成功，429=0 |
| S0单人画布冒烟 | canvas-contracts.jsonl、recovery.jsonl | 画布创建/保存/刷新通过；同批单人完整列表/节点全流程记录分散 |
| C1/S2 80人画布接口 | c1-80.jsonl：80账号、2480请求、0错误 | 完成接口波次；时长/账号分布以原始日志为准 |
| 画布保存冲突/权限隔离 | canvas-contracts.jsonl | 一200一409，跨账号GET/PATCH 404，通过 |
| C4刷新恢复 | recovery.jsonl | 5个账号专项及新增20账号保存/刷新恢复均成功 |
| 真实图文1/5/10/20 | tier-wave.jsonl、points-audit-readonly.jsonl | 客户端任务终态全部成功；积分接口20/20可读，但旧记录不含本轮run标识，仍不能精确逐run归因 |
| C3 80人第二图 | second-image-80.jsonl，160提交、无429；DB无持久未决项、reservation=0 | 限流目标达成；客户端2个needs_review观测与数据库最终无非终态的差异已记录，仍需客户端/DB映射复核 |
| S5登录失败/刷新对照 | login-80、login-after-fix-80、recovery-20 | 修复前429已复现；修复后80/80登录成功；刷新/恢复20/20成功；未做失败登录后自动重试压测 |
| S6资源与账务收尾 | final-resource-summary.txt | 正确生产SSH `8.163.33.161:22222` 已完成约10分钟只读资源监控；CPU/内存/磁盘/容器/DB连接均有证据。逐run账务仍受同时间其它操作污染，不能完全精确归因 |
| S7生产上传/媒体 | upload-valid-20.jsonl + upload-valid-20-retry.jsonl：20个账号均有HTTP200上传和媒体200读取；首轮进程中断、后续6账号受控补测完成，标记“通过但非单波次闭环” |
| S8真实上游容量 | 未执行 | 按生产费用/Key隔离门禁跳过；不得声称真实上游并发通过 |
| S9课堂彩排 | classroom-10m-monitored.jsonl + prod-resource-10m.jsonl：80账号、55轮、26,560请求、全200、约10分钟；正确生产资源同步监控 | 完成10分钟计划彩排；未执行20分钟扩展彩排 |
| 真实视频 | 未执行 | 符合视频真实出站为0约束；仅fixture覆盖 |

## 结论

计划中的核心课堂链路已完成：修复后80账号登录、80人Canvas接口、20账号刷新恢复、真实图文1/5/10/20、80人第二图、生产合法3MB上传/媒体读取，以及约10分钟80人Canvas课堂彩排均有生产原始证据。结论为：**核心课堂链路通过，但不是无条件全部通过**。

仍明确受边界限制的项目：逐run精确账务归因、真实上游S8容量阶梯、真实视频供应商调用。积分接口只读核查已完成，但生产账务记录当前缺少本轮 run/clientRequestId 可直接筛选的公开关联字段。生产主机资源监控已使用正确生产SSH完成；此前连接到staging的SSH结果不纳入生产结论。真实视频保持0符合计划，不应把fixture当真实视频容量证据。上传专项首轮进程中断，剩余6账号随后受控补测成功，因此只能标记为“20个账号均成功观测、非单波次闭环”。第二图客户端2个needs_review观测与数据库最终态不一致，已保留为需后续观测项，未静默当作成功。
