# Canvas 图片/视频诊断记录（2026-09-18）

## 范围与约束
只记录 `surface=canvas` 的 image/video 任务。节点关联使用已有 clientRequestId 中的节点 ID、projectId 和平台任务 ID，不改变请求幂等键、扣费、自动重试、模型路由或公开任务响应格式。没有任务 ID 的历史失败不会重新提交。

## 存储
`generation_tasks` 新增 `diagnostic_events` (jsonb) 与 `diagnostic_expires_at` (timestamptz)，均通过幂等 ALTER TABLE 升级。日志独立于 payload，避免任务更新覆盖日志。追加使用行锁，SQL 只写诊断列，不写 status、updated_at、lease_until 或 expires_at。异常被隔离，不能令生成失败。

每任务 JSON UTF-8 预算 20 KB，保留首事件和最近事件。成功诊断最多3天，其余最多7天。Worker 已有维护入口和 data-lifecycle 入口分批清理诊断列，不删除任务、素材、扣费记录。`CANVAS_MEDIA_DIAGNOSTICS=0` 可关闭新增记录；清理继续执行。当前实现针对部署使用的 PostgreSQL；非 PostgreSQL 不写诊断。

## 记录阶段
- task_created：平台任务身份及已有 clientRequestId/节点关联。
- provider/submit_start、provider/submit_end：图片/视频执行开始和返回。
- transport_request/response/exception：平台内部代理响应和原始网络异常。
- upstream_request/response/exception：代理通过原有授权后、真实上游 URL、HTTP 状态、响应请求 ID、脱敏错误摘要。
- state/poll：提交、上游任务 ID、轮询状态、result_ready、persisting、completed、needs_review 等状态变化。
- recovery_exception/response_parse_exception：解析、下载/存储、恢复时出现的具体异常（name/code/cause）。
- api_response 状态：平台任务查询返回状态，不冒充浏览器已完成图片解码或视频播放。

上游关联头只传给平台内部 system proxy；代理核对任务所有者、类型、surface 和实际渠道，不改变原有访问授权。日志不证明同步模型必须返回上游任务 ID。

## 脱敏和限额
不记录 Authorization/Cookie/API Key、完整提示词、媒体 Base64、签名查询参数。请求仅留白名单参数、提示词 SHA256 和文件数量/类型/大小；参考素材按顺序记录 ID/类型。HTTP 错误体 clone 限读4KB、采样最长1秒，保留脱敏限长的 error/message/msg，不消费原始 Response。成功大图响应体不复制。

## 排查方法
从现有节点 JSON 取 imageTask.id/videoTask.id，或按项目+client_request_id 包含的节点 ID 查任务，然后查询诊断列。外部上游 request ID 与平台 task ID 分开。首次发布前的历史异常无法补回缺失的响应原文。

最新历史样本：节点 `image-OMiyrgZhJmYADU5o4b-aL` → task `03d04ef2-0f6d-4b28-b11d-5c563036390c`。2026-09-18 16:47:28 北京时间，模汇渠道 gemini-3-pro-image-preview，3参考图，needs_review。未重新提交，未根据通用提示推断根因。

## 验收
专项测试覆盖脱敏、20KB、轮询去重、过期过滤、图片/视频403、timeout cause、Response 原样返回、并行 task 隔离、非canvas不记录、DB失败不抛出和清理不删除业务数据。发布只允许 develop，不动 main。部署后确认任务诊断能通过数据库查询、容器重建不会丢失数据库字段。
