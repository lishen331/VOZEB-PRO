# 画布全景与视频参考排查（2026-09-08）

## 范围和验收
- 原画布：canvas-nocHKI8mt4IzNtvGYV9O-（BLUEGAMMA 画布 7）。
- 单节点文生全景无需前置图片；生成后应可进入交互式全景。
- 视频应携带绑定图片、完整文字、所选时长和比例；普通参考不能被强制当作首帧。
- 不混入管理员连接测试和其他同事的短剧大纲修改。

## 实际证据
### 全景
原节点 panorama-Fb864k7Z70eMHLF4Oe0mR 的 generationType 为 generation，references 为 []，status 为 success，尺寸 2048×1024。图片已生成，无需前置图片。
Playwright 对原图实际请求复现：站内 generation-log-assets 返回 307 到 OSS，随后浏览器报 No Access-Control-Allow-Origin / Failed to fetch。图片标签可以展示不代表 WebGL 或 Canvas 像素读取可用。

### 视频
原节点 video-4lsHB8xskwEbJMpN0J-yn 保存完整篮球故事和四宫格图片引用，普通参考角色为 reference。
任务 81438498-6c54-435e-9919-be79f1f63236 对应上游 task_9iMytUHvK70bYWuWb9vTychDkXhBbqjV。
只读查询该上游任务确认：完整中文故事进入上游 properties.input；上游原始结果声明 ratio=9:16、duration=5，节点请求为 16:9、10 秒。
服务端原提示词给普通参考强加“作为首帧”和固定构图/视角，与故事板多镜头需求冲突。该追加文字也出现在上游任务详情中。
当前请求构造测试确认参考图 URL、prompt、seconds=10、metadata.ratio=16:9 均发送到中转。上游详情没有暴露实际图片输入，不能仅凭本地节点快照证明中转最终向模型转发了图片，也不能断言图片完全没传。

## 修改
1. 两个受鉴权保护的媒体读取接口增加 render=canvas：对象存储图片按现有上传尺寸上限读取，通过同源返回字节，保留原鉴权与并发保护。普通展示仍重定向 OSS，不把全部媒体流量改为应用服务器转发。
2. 全景查看器和画布图片像素处理使用 canvasReadableImageUrl；远程图片使用现有媒体代理。局部像素读取显式使用 anonymous CORS。
3. 普通视频参考只约束主体/外观，不强制首帧和固定镜位；保留用户剧情动作，支持故事板理解；显式首尾帧约束保持不变。

## 验证
- 独立工作树使用可用依赖执行相关测试：9 文件、94 测试通过。
- 修改文件 ESLint 通过，已格式化。
- Playwright：线上原图跨域失败已复现；修复组件用同一张原图及模拟同源媒体响应回归，桌面全景加载成功、可拖动、无控制台错误；390×844 移动视口 ready=1，无水平溢出。截图：2026-09-08-panorama-regression.png。
- 全量测试快照：806 文件通过、3 文件失败；3914 测试通过、1 断言失败、31 跳过。失败包括学校模块缺 papaparse，以及当时主线管理员连接测试接口未使用有界请求读取（同事随后已有修复提交，未算成本任务通过）。
- 类型检查：本次文件错误已修正；剩余学校 school-csv.ts 的 papaparse 缺依赖及其两个关联隐式 any。未宣称全量类型检查通过。
- 当前环境没有 pwsh；用 Windows PowerShell 执行文档验证脚本因 UTF-8 无 BOM 解码失败，接口索引/开发地图验证尚未通过。没有跳过门禁推送。

## 尚未完成的线上验收
- 本次修改未推送部署，线上完整页面尚未验证修复版；组件回归不能替代线上验收。
- 尚未使用修复版重新付费生成视频，不宣称新视频视觉一致性已验证。
- 已进一步核对所用 New API Doubao 适配契约：历史模板只发送 `seconds + metadata.ratio + images`，不同中转版本可能按 OpenAI 视频兼容字段读取 `duration / aspect_ratio / input_reference / content`，缺失时会回退默认时长、比例或文本生成路径。
- 运行时现会将旧的 Doubao 模板识别为过期配置并自动替换为兼容模板；同一真实参数同时映射为 `duration/seconds`、`ratio/aspect_ratio`、`image/input_reference/images/content`，不是伪造或拍脑袋参数。
- 模板与请求构造回归确认：10 秒、16:9、参考图 URL 和带故事板约束的完整文字同时进入请求。线上付费生成验收需等待本提交部署。
- 短剧专属复制画布未自动同步本次组件修改；按已有独立发布边界后续同步。
