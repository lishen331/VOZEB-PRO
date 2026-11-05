# Image Contain Production Preview Implementation Plan

Goal: 完整保存上游图，固定用户比例的等比留边预览；仅生产临时验证，不push。

1. 为normalizer添加原字节保留的失败测试；更新旧尺寸强制契约测试。
2. 为画布结果安装（主图+多结果）及刷新尺寸恢复添加失败测试，包含auto/上传/分层排除。
3. 最小实现normalizer与画布尺寸函数，保持true自然尺寸及object-contain。同步画布复制运行时。
4. 专项Vitest、typecheck、ESLint、Prettier；真实Chromium加载构造长宽图验证16:9外框/contain/原图大预览。
5. 核对生产真实bundle和SHA，构造受限临时补丁副本。每个函数匹配数量与内容哈希严格校验、node --check，执行真实bundle函数验证。
6. 生产文件及引用备份、新chunk缓存隔离、只重启app并检查ready与实际公开资源；失败恢复。不生成付费图、不改历史数据，记录回退方式。