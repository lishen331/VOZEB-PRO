# 短剧实验室剧本资产提取请求与 L 对齐

## 范围

仅修改短剧实验室“从剧本提取角色、场景、道具”的服务端模型请求和返回解析。模型配置、故事生成、分镜拆解、资产图片生成、四视图、`polishedPrompt`、参考图、Canvas、Agent 均不调整。

## 对齐约束

1. V 的角色、场景、道具中文默认正文直接复制当前 LocalMiniDrama 默认正文；以 SHA-256 专项测试防止后续漂移。
2. `system prompt` 只发送渲染变量后的 L 正文，不追加 V 的资产判断、命名或字段解释。
3. `user prompt` 与 L 保持一致：
   - 角色：`剧本内容：\n{完整剧本}\n\n请提取剧本中所有有名字角色的设定。`
   - 场景、道具：`【剧本内容】\n{完整剧本}`
4. V 可优先使用 Tool Calling，但 Tool Schema 必须分别等于 L 原文要求的字段，不得额外改变资产数量、命名或粒度：
   - 角色：`name / role / appearance / description`
   - 场景：`location / time / prompt`
   - 道具：`name / type / description / image_prompt`
5. 渠道不支持 Tool Calling 时回退普通 JSON 请求；关闭额外 repair 提示词，避免第二套语义注入。
6. 解析兼容 L 顶层数组与 Tool `{ items: [] }`，只做字段映射、空项过滤和项目内已有资产去重。
7. V 的鉴权、计费、退款、幂等、渠道切换和生成日志保留，它们不进入模型业务提示词。

## 验收

- 三套默认正文 SHA-256 与当前 L 完全一致；
- 三类实际 `system/user messages` 与 L 的文本组织一致；
- Tool Schema 与 L 对应类型的字段逐项一致；
- L 顶层数组和 V Tool 对象均可解析；
- 不修改短剧实验室其他 AI 操作和已完成的图片一致性闭环。
