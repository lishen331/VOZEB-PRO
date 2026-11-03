# 发布依赖处置范围提案（待用户确认，未实施）

## 当前状态

课堂复盘已冻结，A/C代码已备份到两条独立远端修复分支，未合入main/develop，未替换测试或生产镜像。模汇强制URL的B项未进入本轮提交。以下是新增依赖处置范围的提案，不是部署记录或授权凭据。

生产补丁：f4e8f261ef0321f9329a462f927800ca0f1648b6，父版本为当前生产2b99976ffff6f6060fd06c07767e56d62eb5a402。
测试补丁：221e28b70551388af4785e4c40a2f1d0951656bf，父版本为origin/develop的1ecb51aca15ba02a6b529aa43afc583789991c92；包含单独的onSearch无效prop删除，未进入生产补丁。

## 审计口径

本次web pnpm audit的元数据为68项（2 critical、27 high、32 moderate、7 low），退出1；它不等于68个互不重复的CVE或68个已证实可远程利用的生产漏洞。docs独立审计9项，亦退出1。GitHub推送时的默认分支Dependabot统计为56项，数据范围与更新时点不同，不能混为同一指标。

生产和测试的package.json、workspace及锁文件均未因本提案升级。package.json本轮仅新增本地媒体E2E脚本；旧依赖审计失败不是A/C新加包造成的。

## 对较早版本候选的更正

独立审计报告中Next 16.3.8属于较早审计条目的最低候选，不可用它声称覆盖截至今日的全部安全更新。Next官方2026-10-14公告给出的16.x修复版本为16.4.1，公开注册表已单独确认该版本存在。后续若获准升级，必须以更新后的官方公告、当前审计和实际锁依赖复核，而不是机械复制16.3.8候选；eslint-config-next等配套版本也应核对兼容。

原始audit JSON、当时的注册表元数据保持原样作为历史证据，不伪改其时间或候选内容。

## 受控实施边界（待批准）

- 只改解决已证实审计项所需的依赖声明、既有workspace overrides和锁，不运行全库update --latest，不合入同事develop功能。
- 候选涉及Next、Sharp、Undici、Axios及现有传递依赖约束；独立审计清单是起点，不是未经复核即可安装的固定处方。
- 至少需核对web/package.json、web/pnpm-workspace.yaml、web/pnpm-lock.yaml；docs有自己的三份文件，不因主应用更新自动解决。
- braces@3.0.3在审计时点没有已确认官方发行修复版。不能编造3.0.4、只换版本标签伪装修复、删除审计步骤或隐蔽添加豁免。维护方对该公告有争议；实际威胁模型、修复来源和运行镜像暴露仍需核验，不把dev标记等同于无风险。
- 如采用受控补丁/维护fork，先独立评审真实源差异、许可证、适用版本、可重复的安全回归及锁定的内容哈希；保留原始审计告警。任何例外处置均另需明确批准，不能把“允许继续”推断成批准关闭安全门禁。
- CI和Docker镜像按所选包engines核对实际Node版本，不只看配置中的major。
- 先在隔离依赖环境冻结安装，再跑审计、标准类型、全量测试、媒体专项、原生Canvas浏览器、构建及Sharp/native启动。不得以当前旧依赖的本地结果替代新依赖验证。
- 只有最终SHA的门禁和实际镜像验证通过后才部署，先确认生产现有生成任务已排空，固定不可变镜像并保留回滚目标。普通浏览器、图片、签名视频与Range边界分别验收，不额外重发付费生成。

## 本提案不声称

不声称现有生产已被攻击，不声称所有公告都有官方补丁，不声称目前已修复全部审计项，不声称本地next start浏览器成功等于Linux standalone镜像通过。

## 一手来源与本地证据

- Next官方2026-10-14安全公告：https://nextjs.org/blog/nextjs-security-update-october-14-2026
- braces公告：https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- 本机release-verification/prod-dependency-audit.json、prod-dependency-audit-review.zh-CN.md、audit-target-package-metadata.json、docs-dependency-audit.json。
- 两条分支的实际镜像均未部署；现有健康状态需以release-state和只读采样时点核对。
