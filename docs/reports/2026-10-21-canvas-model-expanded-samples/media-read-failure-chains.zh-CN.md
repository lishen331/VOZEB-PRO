# 当前生产媒体读取失败的后端链路

生产SHA 2b99976ffff6f6060fd06c07767e56d62eb5a402，不是未部署的新日志/修复验收。

### gpt-image-2-text-to-image：3e9c6c89-24b8-4432-aced-6d3c92b01353

- references=0；渠道 X9te4qOV0ZaPsJpErRRWS；最终 task status=error / phase=completed。
- 最终错误：上游图片无法通过授权媒体路径读取。
- generation_log completed_at：2026-10-21 10:45:06 +08:00，日志状态 failed。

| 北京时间 | phase | state/status | errorCode | 去查询串URL |
| --- | --- | --- | --- | --- |
| 2026-10-21 10:43:14 +08:00 | task_created | — | — | — |
| 2026-10-21 10:43:14 +08:00 | state | submitting | submitting | — |
| 2026-10-21 10:43:14 +08:00 | transport_request | — | — | http://127.0.0.1:3000/api/ai/system/X9te4qOV0ZaPsJpErRRWS/image/submit |
| 2026-10-21 10:43:14 +08:00 | upstream_request | — | — | https://api.modelbay.io/image/submit |
| 2026-10-21 10:43:19 +08:00 | upstream_response | 200 | — | https://api.modelbay.io/image/submit |
| 2026-10-21 10:45:06 +08:00 | state | error | — | — |
| 2026-10-21 10:45:06 +08:00 | state | completed | failed | — |

- 可证事实：上游/image/submit返回HTTP200，随后已有submitted状态，最后进入授权媒体读取错误并保存失败日志。现有旧版本事件未完整保留失败媒体URL及读取HTTP状态，不能仅据安全错误文案断言是401/403、输入不支持或上游最终生成成功。此处只读已有任务，没有新付费请求。

### gpt-image-2-image-to-image：47cd8c45-389c-4017-a584-b915251f4985

- references=1；渠道 X9te4qOV0ZaPsJpErRRWS；最终 task status=error / phase=completed。
- 最终错误：上游图片无法通过授权媒体路径读取。
- generation_log completed_at：2026-10-21 10:52:32 +08:00，日志状态 failed。

| 北京时间 | phase | state/status | errorCode | 去查询串URL |
| --- | --- | --- | --- | --- |
| 2026-10-21 10:50:21 +08:00 | task_created | — | — | — |
| 2026-10-21 10:50:21 +08:00 | state | submitting | submitting | — |
| 2026-10-21 10:50:21 +08:00 | transport_request | — | — | http://127.0.0.1:3000/api/ai/system/X9te4qOV0ZaPsJpErRRWS/image/submit |
| 2026-10-21 10:50:21 +08:00 | upstream_request | — | — | https://api.modelbay.io/image/submit |
| 2026-10-21 10:50:28 +08:00 | upstream_response | 200 | — | https://api.modelbay.io/image/submit |
| 2026-10-21 10:52:32 +08:00 | state | error | — | — |
| 2026-10-21 10:52:32 +08:00 | state | completed | failed | — |

- 可证事实：上游/image/submit返回HTTP200，随后已有submitted状态，最后进入授权媒体读取错误并保存失败日志。现有旧版本事件未完整保留失败媒体URL及读取HTTP状态，不能仅据安全错误文案断言是401/403、输入不支持或上游最终生成成功。此处只读已有任务，没有新付费请求。
