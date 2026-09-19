# 一键成片对抗性复核（2026-09-18）

结论：不通过。撤销此前“L迁移所有缺口已补齐”的声明。只读源码核验，无业务代码修改，无push。

## 已确认阻断项
1. 布局：one-click-film-shot-cards.tsx 的实际卡片无 img/video 预览，无 L FilmCreate.vue:1013/1188/1451 的脚本/参考图/视频三栏。HTML demo不能作为实际页面已实现的证据。
2. 分集：one-click-film-project.tsx:454 下拉只显示“固定处理第1集”提示；:284、:648使用episodes[0]。
3. 手动生成闭环：syncOneClickShotGeneration只有media-runner.ts:61调用；卡片手动和批量提交后仅GET项目，GET无同步副作用；首关键尾帧结果也未被sync-runner处理。
4. 暂停/取消：orchestration.ts:33-48长调用后的旧快照写回，与:52-64独立控制状态写入竞态；engine.ts:88-106仅入循环前检查暂停，可能继续启动付费步骤。
5. 网格提示词：generate-image/route.ts:51重复同一prepared.prompt，L imageService.js:203-214独立规划first/key/key/last，:233-238含不同动作阶段。此前“同一瞬间且语义等价”说法错误。仅“不烧角标”为用户批准差异。
6. 提示词编辑：one-click-film-shot-editor.tsx:331-540六页签通用编辑器；:374 polishedPrompt只读；不是已要求的L模式分区弹窗。
7. 成片设置：executor.ts:64完整工作流合成不传composeOptions；仅手动合成传入，不能宣称全链路生效。
8. 后续风险：选历史主图不调整旧storyboardTaskId，而sync-runner.ts:118-120按URL差异覆盖主图；接通手动同步时必须一并修复。

## 组件来源
已检查入口和分镜/编辑器为React/Next、antd、lucide、Tailwind；未发现该实现嵌入L Vue页面。组件来源正确不代表布局业务对齐。

## 证据边界
Playwright独立浏览器访问localhost:3000/one-click-film被重定向登录，未完成登录后视觉验收；未调用付费模型；没有声称浏览器全流程通过。现有字符串包含测试只能证明符号存在，不能证明完整业务或像素布局一致。
