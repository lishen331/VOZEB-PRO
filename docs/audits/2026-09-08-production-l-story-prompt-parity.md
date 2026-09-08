# 生产 L 故事与分镜模板迁移记录

日期：2026-09-08；状态：本地实现与自动化验证，未上线验收。

## 取源

从 `.superpowers/l-production-reference-20260908/backend-node/src/services/promptI18n.js` 的实际中文 getter 导出，来源为生产基线 34739d3d4c3de8e892941facb11fb405fac7f773 加生产未提交定制。不是仅复制 L 后台显示的简版正文。

- story_expansion_system：getStoryExpansionSystemPrompt，原文中的集数值换成 `{{episodeCount}}`。
- storyboard_system：getStoryboardSystemPrompt，保持生产叙事节拍、内部切镜、动态运镜、摄影字段等正文。
- storyboard_user_suffix：getStoryboardUserPromptSuffix 在未指定镜头时长时的默认返回值。指定时长和其他模式的分支尚不属于此次完成项。

原文存于 `web/src/lib/drama-lab-production-story-defaults.json`；对应测试固定 SHA256，原项目 MIT 许可沿用 docs/third-party/LocalMiniDrama-LICENSE.txt。

## 修复的实际缺口

1. 多集故事任务原先发出互相矛盾的要求：默认正文写“创作 1 集”，末尾契约却要求 3 集。现于任务创建前，将同一 episodeCount 注入完整默认正文；同时支持 L 管理员正文中的 `${n}` 标记。
2. 当前单集兼容服务仍只请求一集，不因项目计划为十二集而生成十二集。测试区分单集服务与多集异步任务。
3. L 分镜正文使用 snake_case/数字 ID 示例，V 使用 camelCase/项目实际字符串 ID；不可直接把两种契约混用。固定输出契约明确字段映射和顶层 shots 形状，保留原文的创作规则。
4. L 的声音设计要求不丢弃：sound_effect 与禁 BGM 说明要求写入当前可保存的 videoPrompt，而不是让模型额外输出工具禁止字段。此为 V 适配说明，尚不代表独立音效字段已完成迁移。
5. 上批保存的 appearance、场景 time、场景/道具 imagePrompt 进入 availableAssets，供拆镜时判断身份和空间；ID 白名单验证仍照旧执行。

## 测试证据

- 三套正文哈希测试先失败，迁入后通过。
- 故事任务创建测试先复现“请求三集，正文一集”，修改后验证创建任务的 messages 与 storyBatch 同为三集。
- 单集服务验证仍为一集，且没有残留变量。
- 生产分镜请求回归验证动态运镜、空间合同、字段映射、角色外貌与资产提示词，原 ID 拒绝/流式提取回归保留。
- 相关 6 文件 63 用例通过；随后新增单集回归纳入全量：825 文件通过、6 跳过，4044 用例通过、31 跳过；TypeScript 通过。

## 边界

- 九套默认模板现已都有生产运行原文来源，但不能据此称完整 L 业务迁移完成。
- 管理员覆盖不自动删除或替换，服务器 V 的有效模板仍需要逐项核验。
- classic/universal 选择、指定镜头时长/数量、旁白开关、序列图模式及其额外动态后缀，需要下一阶段从配置保存到请求全链路接入。
- 本批无浏览器真实生成、PostgreSQL 实际保存回归、真实上游输出质量对照或部署。
- 不修改 V 原生画布、团队审批和普通短剧 UI；后续继续按主计划补齐镜头工作台布局与画布往返。
全量 ESLint 与 Prettier 检查均退出码 0。开发地图更新/验证仍未通过环境门禁，不宣称可推送。
