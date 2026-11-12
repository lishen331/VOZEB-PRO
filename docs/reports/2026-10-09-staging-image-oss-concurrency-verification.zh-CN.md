# 2026-10-09 测试环境兔子 / ModelBay 生图与 OSS 路径验证

> 环境：`https://reddetail.gammablue-x.com/`、`8.163.37.148:22222`、`vozeb-staging-*`。镜像：`sha-ba0ea742709f8f8f46dcd250a2f3437ab59e6568`。仅测试环境；未修改配置/数据库，未推送部署，未自动重试失败任务。

## 结论

1. 用户重新在测试环境生成的两张图确实在测试库：兔子任务 `2decd598-8101-4a3b-a76a-2131b4afe82b`，ModelBay任务 `b04f9438-38a0-4068-98f0-5e3a63ddc127`，均 `success/completed`。先前未找到是因为检查时生成尚未发生，并非生产数据。
2. **实际数据流不是“上游先写 OSS 再到服务器”**：平台服务器请求兔子/ModelBay → 服务器收到并读完上游 JSON/base64 图片响应 → 平台写 OSS 并登记 `storage_provider=object`、对象键、同步时间 → 用户访问平台媒体接口 → 平台授权后307跳转带签名的 OSS URL → 浏览器直接从 OSS 读取。仅 `render=canvas` 像素读取按代码由服务器从 OSS 取字节回传，避免跨域污染。
3. 两笔单图与16账号并发验证均没有 `Maximum call stack size exceeded`、`upstream_body_exception` 或 `needs_review`。**在本次测试负载和图片大小下未复现堆栈溢出**，不能外推到所有并发/所有响应大小。
4. ModelBay的**上游响应体传输仍比兔子慢**；OSS已存图片的终端读取很快。ModelBay 8笔并发上游响应体读取平均约14.1秒（最慢19.8秒），兔子约0.36秒（最慢1.09秒）；OSS直取16笔都HTTP 200，约0.14–0.67秒。不能将“OSS读取已恢复”描述为“ModelBay上游下载速率已和兔子一致”。

## 两笔用户单图证据（数据库时间为UTC）

| 渠道 | 任务 | 上游HTTP/响应体 | 最终OSS |
|---|---|---|---|
| 兔子 `gpt-image-2.5-sunburst` | `2decd598-8101-4a3b-a76a-2131b4afe82b` | 上游200，991,137字节完整；`provider_end` 37.2秒，无异常 | `storage_provider=object`，PNG 742,876字节，`external_synced_at=2026-10-08 20:19:59.821+00` |
| ModelBay `gpt-image-2-5-sunburst` | `b04f9438-38a0-4068-98f0-5e3a63ddc127` | 上游200，1,466,930字节完整；body读取3.83秒、`provider_end` 24.5秒，无异常 | `storage_provider=object`，PNG 1,099,894字节，`external_synced_at=2026-10-08 20:20:21.815+00` |

两笔 `result_payload.url` 均为 `/api/generation-log-assets/permanent/...png`；`vozeb_pro_local_media_assets.external_object_key` 分别是 `vozeb-pro/media/generation/permanent/...png`，不是本地磁盘交付标识。

## 受控并发验证

- 运行ID：`staging-oss-regression-1791491385854`；测试环境原有 `test_student_01`～`test_student_16`，各有积分。两份签到表共91个姓名，但与测试库账号姓名无一匹配，签到表也不含账号密码；因此没有冒用签到表身份，使用既有授权测试学生账号。登录16/16、独立Canvas创建16/16。
- 同一波次16次图片提交：兔子 `gpt-image-2.5-sunburst` 8笔，ModelBay `gpt-image-2-5-sunburst` 8笔。每账号一张相同的无人物风景提示词，无参考图、无重试，均 HTTP 200 获得任务ID。
- 任务终态：兔子8/8、ModelBay8/8 `success/completed`；0 `needs_review`、0 `error`、0 客户端超时。
- 服务端 `diagnostic_events`：两渠道各8次 `upstream_response` + `upstream_body_complete`，没有 `upstream_body_exception`/`provider_exception`；`vozeb_pro_local_media_assets` 各8条有效OSS对象登记。
- 媒体路径：16/16 平台媒体接口HTTP 307且带OSS跳转；16/16直接OSS取图HTTP 200。兔子图片4,478,832～5,487,610字节，ModelBay 6,073,303～7,138,921字节；客户端OSS下载耗时兔子0.14～0.55秒、ModelBay0.19～0.67秒。

| 阶段（服务端诊断事件） | 兔子8笔 | ModelBay8笔 |
|---|---:|---:|
| 上游响应头等待 `upstream_response.durationMs` 平均 / 最慢 | 34.7 / 37.1秒 | 26.7 / 34.8秒 |
| 上游响应体读取 `upstream_body_complete.durationMs` 平均 / 最慢 | 0.36 / 1.09秒 | 14.1 / 19.8秒 |
| 完整Provider耗时 `provider_end.durationMs` 平均 / 最慢 | 35.4 / 38.5秒 | 41.1 / 52.8秒 |

解释：OSS改变的是**持久化和客户端读取**路径，并不绕过服务器接收上游大响应。ModelBay上游传输阶段仍是明显慢点；但本轮16并发下没有超过当前超时阈值，也没有响应体中断。

## 范围与下一步

- 这是16账号同波次、各一张、无参考图的测试环境验证，不等同于80人持续课堂负载、带多张参考图、生产真实Key/网络和更大响应的全面证明。
- 若要证明“堆栈溢出完整解决”和“ModelBay大图不再超时”，应补带参考图、不同输出分辨率、80人阶段负载与长时间观测；逐阶段记录响应大小、body读取、OSS上传、账务与未决任务。保持唯一`clientRequestId`，失败不自动重提。
- 本轮没有修改生产环境，不代表昨日生产待审核任务已经恢复；旧任务仍需逐任务对账和处理。

原始客户端证据：`C:/Users/admin/Downloads/VOZEB-capacity-20260919/staging-oss-regression-20261009/results.jsonl`；测试脚本在同目录 `run.mjs`。服务端证据：测试数据库 `vozeb_pro_generation_tasks.diagnostic_events`、`vozeb_pro_local_media_assets`、`vozeb_pro_generation_logs`，运行ID可精确筛选。
