# 生产事故排查：反推提示词试生成被百炼拒绝（尺寸格式）

日期：2026-11-26（北京时间 UTC+8）。范围：无限练习 → 反推提示词 → 右栏「生成一张」。生产应用及 Worker 经只读核对运行 `a9cd200b6033c9b9d640e979a061d52d604acc58`；不以本地 `origin/main` 代替运行版本。

## 结论

右栏请求已发到阿里云百炼 DashScope，API 以 HTTP 400 拒绝尺寸参数。截图账号近期两条匹配的失败使用的模板要求 `parameters.size` 含 `{{size_star}}`，但试生成提交 `size: auto` 且无具体分辨率；生产代码把该占位符展开成空字符串并保留字段。和图片本身、人像提示词、反推分析、OSS 下载、上游并发无直接关系：请求在上游尺寸校验直接失败，不到返回图片或下载阶段。

## 生产证据

| 北京时间 | 本地任务 ID | 模型 | 上游结果 |
| --- | --- | --- | --- |
| 20:12:45 | `407a8cbc-940f-4fa1-a3aa-e39cfd112730` | `MiniMax-H3-Image-Highspeed` | 同一账号同一入口 `size=auto`，上游 200；媒体读取 200，任务成功（20:13:02）。 |
| 20:26:21 | `3501e9a6-ad48-49a4-a89b-b8a0b55c7268` | `qwen-image-2.1-pro` | `upstream_request` 发到 `dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`；`upstream_response` 为 400，`Expected format: '<width>*<height>'`。 |
| 20:26:36 | `d11f9438-598b-4d6a-8628-26a3273a0a71` | `qwen-image-2.1-turbo` | 同一百炼渠道（`IlGYkymWzx8Tx7JAdC3Wg`）和路径，400，报错同上。 |

- 数据来源：生产 `generation_logs` 与 `generation_tasks.diagnostic_events`。两条千问记录均为 `generation`，`references` 长度为 0，任务 `config.size=auto`、`quality=auto`、无 `resolution`；任务保存的请求模板 `parameters.size` 均为 `{{size_star}}`。容器 stdout 未匹配该错误，具体上游响应在持久化诊断事件中。
- 证据边界：诊断事件记录了上游状态和响应错误，未存完整出站 JSON。用生产 commit 的 `resolveRequestSize`、`resolveDeclarativeImageSize` 与 `buildProviderRequest`，按从任务读到的参数和模板中的 `parameters.size` 做本地离线复算，结果为 `{"parameters":{"n":1,"size":""}}`；这是对该字段的复算，不冒充原始抓包。
- 代码定位（`a9cd200b`）：`web/src/app/api/practice/image-tools/route.ts:91–93` 设 `size: "auto"` 和试生成无参考图；`web/src/app/api/image-tasks/image-task-custom.ts:76–86,105–123,175–177` 解析尺寸、填 `size_star` 和发送 JSON；`web/src/lib/server/provider-task-config.ts:95–106,229–235,278–292` 模板保留非参考类空字段。现有 `image-task-custom.test.ts` 覆盖了显式尺寸变成 `1024*1024`，没覆盖百炼模板的自动尺寸。

## 修复建议与验收

1. **优先修百炼适配，不要求学生改提示词。** 在百炼图片协议/模型绑定适配中，区分「自动」与显式尺寸：若对应上游型号验证允许省略，就在自动时省略 `parameters.size`；若必填，使用该具体型号验收过且与练习计费一致的默认像素尺寸，按 `宽*高` 发送。显式尺寸保留原宽高和校验。不要全局强制改为固定正方形，也不要全局删除所有空字段。
2. **课堂临时止血：** 若必须先恢复可用，可经批准在无限练习图片模型池暂时避开这两个千问绑定并保留已验证可用的 MiniMax；不擅自更改共享生产渠道或画布配置。
3. **测试：** 在 `image-task-custom.test.ts` 增加 `auto` 回归，断言不再发 `parameters.size=""`，以及显式横/竖尺寸正确。测试环境真实走反推右栏，逐个验证两个千问模型，再用 MiniMax 对照；同时验通其它使用同一路由的图片入口、最终图片展示、积分流水。上游拒绝时给学生可理解提示，日志保留原始错误和请求追踪；增加安全的出站诊断（只记 `size` 字段是否存在及合法尺寸值，不记提示词/图片/凭据）。

本次仅查询生产日志和任务记录、做离线复算；未触发真实请求，未改数据库、主机配置、模型绑定或部署。修复尚未实施，未声称已恢复。
