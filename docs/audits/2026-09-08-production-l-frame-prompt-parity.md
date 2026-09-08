# 生产 L 三类帧提示词迁移记录

日期：2026-09-08。范围：短剧实验室首帧/关键帧/尾帧默认正文及实际文本请求。

## 来源与可复核性

来源为仓库外只读快照 `.superpowers/l-production-reference-20260908` 中 `backend-node/src/services/promptI18n.js` 的 getFirstFramePrompt/getKeyFramePrompt/getLastFramePrompt 实际返回值。生产基线为 34739d3d4c3de8e892941facb11fb405fac7f773 加未提交生产修改；不能仅凭该 Git SHA 重建生产行为。当前覆盖表为空，语言 zh。

迁入位置：`web/src/lib/drama-lab-production-frame-defaults.json`。将原函数中的动态风格与画幅替换为显式占位符，其他正文保持原样。原项目 MIT 许可保留在 `docs/third-party/LocalMiniDrama-LICENSE.txt`。本批不依赖 L 服务运行，不读写 L 数据库。

| 模板 | L 后台简版正文字符数 | L 实际运行模板字符数（含变量标记） | 实际正文 SHA256 |
|---|---:|---:|---|
| first_frame_prompt | 584 | 2163 | eec72602dbf9940750bfbdbbf2316858bf443ac356fd6d28739b4c8508df6c41 |
| key_frame_prompt | 525 | 1146 | 568e13df487fbe5f7e936f36450999fddf71dbcc68ee06a354814cbf25e7172e |
| last_frame_prompt | 512 | 2008 | 6d2decce4b414b52bd3572af3df5b341e6d9cc8e161b26833f70d6c914310001 |

字符数只用于复核来源，绝不作为质量评分或完成率。

## 实现

- 三类帧默认定义使用实际运行正文，后台查看/恢复默认复用同一定义。
- 服务端只替换 stylePromptZh/stylePromptEn/aspectRatio 三个声明变量，单次替换，不执行表达式、不递归解释自定义内容，包含 `$&` 的文本原样保留。
- resolveDramaLabPrompt 的管理员覆盖优先级不变，不删除或覆盖 V 数据库已保存模板。已有覆盖不会自动升级为新正文；上线前须核对有效模板来源。
- prepareDramaLabFrame 和 prepareDramaLabStoryboardImage 的模板使用点均接入变量替换。
- V 的固定结构化输出契约、资产 ID 校验、主参考图读取、首帧连续性、清洗和计费链路保留。

## 验证

先红后绿：三类默认正文哈希测试先失败；本地随机端口 TCP fixture 中三类帧和自定义模板的变量替换测试先失败，接入后通过。

fixture 使用真实 prepareDramaLabFrame、模板解析、text-planning-runtime、HTTP 编码、结果解析和清洗；只替代数据库、渠道配置和计费/日志外部依赖，不调用付费渠道。

覆盖：
- 三类帧正确选择模板，提交真实 HTTP 请求及中文风格/画幅。
- 管理员自定义正文优先，固定契约继续生效。
- 第一帧引用在尾帧请求中保持；模板含 declared movement 约束。
- 出场白名单清洗；空模型结果不得记录成功。
- 项目外资产和缺少主参考图在请求前拦截。
- 原镜头图片/视频参考顺序回归。

相关 7 个测试文件 71 个用例通过；全量 Vitest：822 个文件通过、6 个跳过，4024 用例通过、31 个跳过；TypeScript 检查通过。

## 仍未完成（不能宣称全量等价）

- 其余六套模板及完整动态合同尚未迁入：故事扩写、角色/场景/道具提取、分镜 system/user suffix。
- 资产提取工具当前仅允许 name/description/time，需连同 appearance、image_prompt、profile 的保存与后续生图一起适配，不能直接复制原文后让工具把字段丢掉。
- L 模板正文与 V 固定契约之间的中文语言、帧持续时长等约束须在同输入生成验收中进一步核对；本次保留原文，不擅自改 L 的生产规则。
- 未做本批真实上游生成、浏览器生图或上线部署；HTTP fixture 通过不代表图像质量验收通过。
- 本次未修改工作台布局、批量勾选、原生画布切换或团队协作。
## 本批质量门禁与交付边界

- 全量 ESLint：退出码 0。
- 全量 Prettier 检查：退出码 0。
- 全量 TypeScript：无错误；相关 71 用例与全量 4024 用例通过。
- 开发地图脚本：本机 `pwsh` 不在 PATH，常用 PowerShell 7 安装路径亦不存在；使用 Windows PowerShell 5.1 直接执行时，UTF-8 无 BOM 的脚本被按旧编码解析导致语法错误。没有据此修改脚本或宣称文件内容损坏。本批开发地图更新/验证尚未通过，因此不推送。
- 未执行本批浏览器生成回归、生产构建、真实上游调用或部署。保留本地提交，后续完成环境与浏览器门禁后交付。