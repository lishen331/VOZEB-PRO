# 渠道HTTP/2并发断流知识索引

- 2026-09-19：兔子gpt-image-2同连接9并发，HTTP/2 6成功/3失败，HTTP/1.1现有8连接池处理9请求全部成功。不是ID映射问题，也不证明所有渠道受影响。
- 证据、请求号、复现条件、绑定级HTTP/1.1勾选项需求、上游排查清单：`docs/incidents/2026-09-19-tuzi-http2-concurrency-compatibility.md`。
- 脱敏原始逐请求记录：`docs/incidents/evidence/2026-09-19-tuzi-http-9x2.jsonl`。
- 状态：知识记录已建立；开关已本地实现并专项测试、浏览器组件验证，尚未推送部署。禁止将记录完成等同于修复完成。

