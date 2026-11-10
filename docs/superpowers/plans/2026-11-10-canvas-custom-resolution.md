# Canvas custom-resolution controls Implementation Plan

Goal: 在现有后台画布卡片下保存两个默认关闭的节点自定义清晰度开关，固化当前热补丁并完成测试→生产发布与技能交付。
Architecture: featureModules扩展子键+共享显隐helper；Canvas popover从公开session读取开关传给共享参数面板；复制画布通过sync脚本同步。复用现有settingsRevision/RBAC/持久化。

- [ ] 先新增失败测试：默认关闭/独立启用/归一化持久化，后台两开关行为及节点UI隐藏/恢复。
- [ ] 最小实现helper、后台画布子控件、popover参数与共享面板条件渲染；不清空已有参数，不影响预设和其他工作台。
- [ ] 扩展真实Chromium脚本：1280/390/430默认隐藏、独立切换、关闭已打开编辑器、4K快照/刷新保留；正式Next E2E验证后台保存/刷新。
- [ ] 验证普通画布后本地提交，再运行复制runtime同步，检查差异；全量unit/lint/typecheck/format/build/CI/E2E。
- [ ] 完成全局发布技能脚本、合法/非法记录单元测试、frontmatter/YAML/UTF8校验和技能索引。
- [ ] 盘点有效补丁与main/develop差异，按授权推送测试候选，检查app/worker/digest、域名、原记录与新开关；再生产发布并记录证据/回滚。