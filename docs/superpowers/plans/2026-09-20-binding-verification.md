---
title: 模型绑定启用前真实验证
status: in-progress
created: 2026-09-20
baseline_commit: e77afcc3
---
# 已批准目标
仅模型路由中的单条渠道绑定受验证门禁，渠道总开关、逻辑模型总开关和 RunningHub 保持原行为。当前线上允许名单已按用户授权保存 revision 114，不新增确认标签。

# 方案与边界
- 新绑定默认关闭，已有绑定状态原样保存。
- Modal 使用 V Ant Design 组件与已有主题，输入/结果同屏，文本正文、可放大图片、原生视频播放器。
- 管理员针对保存后的精确绑定执行测试：文本1图、图片1图、视频3图480p5秒。真实请求有费用，不能默默降级/切换渠道。
- 服务端测试记录绑定模型、渠道、凭据摘要、协议、能力及契约版本。客户端不能伪造passed或启用证明。
- settings PATCH在规范化之后检查 false→true、新增enabled和已开启绑定的执行配置变化；只有当前配置一致的服务端成功记录可启用。RunningHub不在该门禁范围。
- 普通业务流量不能借测试执行关闭绑定。独立管理员测试上下文不修改全局开关，保留SSRF、权限及凭据保护。
- 测试必须实际完成并保存结果；视频检查时长、分辨率及可解码性。200/上游ID非通过凭证。未知结果不自动重交。
- AI协议助手复用后台默认文本模型的现有协议分析接口，仅输出脱敏草稿；修改后重测。保留明确上游错误、平台与上游ID和安全请求摘要。
- 不推送、部署、修改生产，不扩大到其他业务链路。

# 代码与验收
- [x] web/src/lib/model-routing-config.ts：新绑定关闭；测试现有开关保持、同步不能重新开启。
- [x] web/src/lib/server/binding-verification-policy.ts：指纹与启用门禁，测试伪造/变更/跨绑定复用。
- [x] web/src/lib/server/binding-verification-store.ts：持久化测试和成功证明，升级幂等。
- [x] web/src/lib/server/binding-verification-runner.ts 与 admin/binding-verifications routes：精确绑定真实生成/查询/结果验证，不回退。
- [x] web/src/app/api/admin/settings/route.ts：保存门禁。
- [x] web/src/components/admin/binding-verification-modal.tsx 与 manager：绑定开关→真实测试→查看结果→启用，错误/待确认禁止开启。
- [x] 专项vitest、typecheck、eslint/prettier、浏览器1280/390布局命中与真实fixture链路；更新开发地图索引。

# 操作证据
现有渠道总开关全true，逻辑模型总开关未变。模汇18+32开启；兔子47开启590关闭；红框四渠道79绑定关闭。服务端自动迁移默认video到doubao-seedance-2-0，audio清空。

# 验证结果
- 全量vitest：1035文件通过、6跳过；5366测试通过、32跳过。
- TypeScript、相关ESLint/Prettier、git diff --check通过。
- 真实Next HTTP隔离fixture完成文本/图片/三图视频测试、禁止普通disabled调用、关闭绑定不被测试自动打开、并发POST复用及配置指纹门禁。
- AntD真实浏览器1280x900/390x844：无横溢出，失败禁止开启，A→B→A/刷新恢复不重复POST。
- 地图/接口索引验证：420路由、58页面、140表。
- 未push、未部署新功能。

- npm run build -- --webpack：通过（先执行 TypeScript，再生产构建，105静态页生成完成）。
