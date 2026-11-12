# 2026-10-23 生产课堂画布监控总结

## 1. 总结概述

- 监控窗口：2026-10-23 09:00 至监控结束。
- 口径：按 created_at 去重，窗口内图片/视频任务共 355 个；文本任务未纳入。
- 整体：成功 261，失败 94，成功率 73.52%。
- 图片：成功 91/147，成功率 61.90%；视频：成功 170/208，成功率 81.73%。
- 最终快照：active=0，Ready=True，Worker=True。

## 2. 按模型统计

### 图片

| 模型 | 总数 | 成功 | 失败 | 成功率 |
|---|---:|---:|---:|---:|
| gpt-image-2 | 44 | 39 | 5 | 88.64% |
| gpt-image-2-5-flare | 5 | 2 | 3 | 40.00% |
| gpt-image-2-5-sunburst | 1 | 0 | 1 | 0.00% |
| gpt-image-2-all | 18 | 7 | 11 | 38.89% |
| gpt-image-2-c | 72 | 42 | 30 | 58.33% |
| gpt-image-2-image-to-image | 1 | 0 | 1 | 0.00% |
| gpt-image-2-text-to-image | 2 | 0 | 2 | 0.00% |
| gpt-image-2.5-sunburst | 4 | 1 | 3 | 25.00% |

### 视频

| 模型 | 总数 | 成功 | 失败 | 成功率 |
|---|---:|---:|---:|---:|
| cdance2.0-0807 | 54 | 53 | 1 | 98.15% |
| cdance2.0-mini-0807 | 2 | 2 | 0 | 100.00% |
| doubao-seedance-2-0 | 120 | 97 | 23 | 80.83% |
| doubao-seedance-2-0-260128 | 9 | 0 | 9 | 0.00% |
| doubao-seedance-2-5-260628 | 2 | 1 | 1 | 50.00% |
| official/seedance-2 | 14 | 10 | 4 | 71.43% |
| official/seedance-2-5 | 7 | 7 | 0 | 100.00% |

## 3. 异常统计与原因

| 类别 | 数量 | 结论 |
|---|---:|---|
| 图片结果媒体读取超时 | 30 | 上游生成和媒体响应头常为 HTTP 200，但响应体读取阶段超时；涉及多个结果源站，属于结果媒体下载/读取链路问题。 |
| 真人内容拦截 | 18 | 上游安全策略拒绝输入中的真人内容。 |
| 持久化栈溢出 | 17 | 上游已返回结果，平台结果持久化阶段报 Maximum call stack size exceeded。 |
| 其他后端错误 | 13 | 需按 task ID 继续关联 |
| 提交中断未取得上游任务 ID | 5 | 需按 task ID 继续关联 |
| 视频上游 HTTP 405 | 5 | 兔子视频多次收到 nginx 405 Not Allowed，需核对 endpoint、HTTP method 和协议适配。 |
| 参数不兼容 response_format | 2 | 上游拒绝未知 response_format 参数。 |
| 模型不支持参考视频 | 2 | 模型能力不支持 reference video input。 |
| 媒体读取 HTTP 错误 | 1 | 结果媒体 URL 返回鉴权或其他 HTTP 错误。 |
| 额度不足 | 1 | 上游明确余额不足，不是平台网络故障。 |

## 4. 关键证据

- 图片媒体读取：多条模汇任务上游 HTTP 200，结果 GET HTTP 200，但响应体在约 58—107 秒后中止，报 media_timeout；涉及 img.vakv.cn、img.apimatou.cc。
- 栈溢出：图片上游返回 HTTP 200 后，持久化阶段报 Maximum call stack size exceeded。
- 视频 405：兔子 doubao-seedance-2-0-260128 多次收到 nginx/1.24.0 405 Not Allowed。
- 视频能力/安全：ModelBay official/seedance-2 不接受参考视频；模汇 doubao 输入真人视频被上游拒绝。
- 额度：有视频任务收到上游 HTTP 403 token quota is not enough。

## 5. 资源与服务

- CPU 1.26%；可用内存 5743 MiB；磁盘使用率 59.26%。
- vozeb-pro、generation-worker、postgres 均无重启、无 OOM。
- 监控为只读采样；未修改生产数据、未重放计费任务、未部署代码。

## 6. 建议

1. 对图片结果采用流式/分段落盘、记录首字节/完整体/Content-Length，并区分媒体下载失败与上游生成失败。
2. 修复结果持久化中的递归对象或深层序列化导致的栈溢出。
3. 核对兔子视频 endpoint、HTTP method、模型映射和协议适配。
4. 将额度不足、模型不支持参考视频、真人拦截分别提示用户，不统一显示为渠道无法连接。
5. 继续保留 task ID、逻辑模型、实际渠道、上游模型、Request ID 和各阶段耗时。

## 7. 原始证据

- 监控目录：.classroom-live-monitor-20261023
- heartbeat.json、latest.json、task-changes.jsonl、alerts.jsonl。

报告生成时间：2026-10-23 19:20:17 +0800
