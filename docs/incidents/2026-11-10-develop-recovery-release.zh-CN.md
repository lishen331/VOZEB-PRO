# develop完整集成恢复：发布记录

## 授权与环境边界

用户2026-11-10明确授权开始解决版本回退并要求总结教训、测试先行、再生产。当前先保留本地工作，以e44c0ea7的develop为集成基线合并main及本地热修复；不回滚数据库，不改动其它实例。生产候选不得再直接部署共享测试服。

## 集成证据

- 本地merge父基线：origin/develop e44c0ea759df2b02a10c8f8614882a90348cf1ac；合入main69e2及后续本地热修复/画布子开关，预保全分支recovery/canvas-work-preserved-20261110。
- 全部27个冲突文件逐hunk处理；重点保留五能力模型池、practiceEnabled/学校上下文、Agnes、IP PreviewGroup稳定性及signed图片直返；main侧稳定Modal业务子树、媒体hydration、学校SQL、管理员入口及4K参数修复均保留。
- PDF.js保留5.4.624浏览器兼容性，Sharp保留0.35.5与其安全审计覆盖；pnpm锁文件由合并清单重新生成，不整体用旧锁覆盖需求。
- 本机全量unit：1143files passed /9 skipped，6309tests passed /41 skipped，16分钟；环境跳过不冒充真实上游验收。
- 全量typecheck、ESLint、Prettier、生产build通过。Web audit仅1low，无moderate/high/critical。
- 实际Chromium canvas整份13项通过，含后台两个子开关保存/刷新与独立控制，4K/首尾帧/10001节点/9类节点恢复。
- 独立Modal/Form/App专项3files/36tests及真实DOM保留/销毁/滚动锁/焦点/嵌套回归通过。
- 开发地图与接口索引验证：444 API routes、72 pages、147 tables。

## 防复发

- AGENTS增加环境保留和测试→生产顺序；全局vozeb-hotpatch-release技能同步加入现行版本祖先检查和共享测试只走develop。
- Staging workflow在构建前限制refs/heads/develop及最新远端SHA；部署前再检查当前运行镜像SHA是候选祖先。未知镜像、旧develop、非develop分支或不保留现运行历史一律拒绝。
- guard离线测试先RED再GREEN：拒绝生产候选分支、过期候选、浮动/未知镜像、回退历史；允许正确最新develop升级。

## 未完成阶段

本文件首次提交时仅本地集成验证完成。完整隔离QA E2E、远端Quality、测试恢复及生产晋级尚待；不得据本记录标题宣称已经恢复环境。
## 复制画布与模型池补充验收（本地）

同步脚本原先固定匹配useCanvasPageController()，develop练习画布增加executionProfile参数后该精确锚点不再存在。更新锚点后按原适配规则同步107文件，保留短剧深链定位、分集持久化和返回工坊/一键成片来源分流，未直接手改复制业务。

复制同步后再次生产build（含完整typecheck）通过；短剧画布分镜handoff与跨剧集切换2项desktop通过，手机专属项在desktop按矩阵跳过，不计为通过。模型池新增真实UI专项：先发现fixture错误把生产渠道同时设置practiceEnabled=true而派生为shared，按现有协议改正fixture而不放宽断言；修正后1项通过，涵盖五池/视觉输入、生产用途及练习关闭候选排除、图片视频独立勾选和刷新保留、生产默认值不串改。仅本机localhost与专属QA库，无真实付费生成。

防回退guard测试拆分7个独立场景消除一个同步大测试的总时限累加，无延长测试时限。当前尚未触发远端完整Quality或部署；生产保持原状。