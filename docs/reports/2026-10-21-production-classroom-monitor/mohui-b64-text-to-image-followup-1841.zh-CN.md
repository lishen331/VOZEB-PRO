# 2026-10-21 18:41 模汇无参考图文生图成功补充证据

## 真实课堂请求

任务`7ddedb9e-4a31-40cc-856f-48d8a39df316`，原始逻辑模型`gpt-image-2-c`，模汇渠道，仅一次attempt。不是监控方发起的测试或重试。

| 项目 | 证据 |
| --- | --- |
| 提交时间 | 18:40:20.088（北京时间） |
| 完成时间 | 18:41:52.367 |
| 完整耗时 | 92.279秒 |
| 输入类型 | kind=generation，referenceCount=0 |
| 实际出站 | response_format=b64_json，size=1024x1024，n=1，output_format=png |
| 上游响应 | HTTP200，到响应约91.350秒 |
| 完整正文 | upstream_body_complete，2577780字节，读取约23毫秒 |
| 上游requestId | ecb4ef83-13f5-42da-991d-7b3a77394d2f |
| 任务终态/日志 | success/success |
| 结果持久化 | 18:43:41只读核查任务结果字段非空，并匹配当前画布图片节点 |

## 对范围判断的补充

此前17:48:25复核的33笔是带1–5张参考图的b64请求；这次补充了一笔**无参考图文生图**完整成功实例，不能把33笔历史统计当成这笔已包含在内，也不能把单样本外推为所有分辨率/并发的普遍保证。仍无需为了旧的模汇格式拒绝强制切换URL；其他渠道的参数契约和正文慢读问题独立。

## 前端可见性边界

匹配到当前图片节点`image-I9QmOHqrfS-TYqQamdaui`，当时metadata.status=idle。这里仅记录字段事实，不凭idle断言失败，也不声称已逐浏览器验图。任务和结果已持久化、有当前节点匹配；若用户反映该节点显示异常，再关联其实际浏览器/媒体请求。未修改该节点或将其强行标为success。

证据：`mohui-generate-task-7dde-evidence.json`及`mohui-generate-task-7dde-persistence.json`。未记录用户提示词正文、图片正文或完整媒体URL。
