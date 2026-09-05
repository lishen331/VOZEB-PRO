# RunningHub 工作流调通与后台简化经验

本文记录一次真实 RunningHub 工作流从“后台配置不通”到“成功生成图片”的完整过程，并把后续工作流接入和后台简化要求固定下来。目标读者是不会编写上游请求、也不熟悉数据库配置的运维人员。

## 1. 本次已验证结果

本次使用本地 Docker 环境和已经保存的 RunningHub 渠道密钥完成了真实调用。

| 项目 | 已验证值 |
| --- | --- |
| 本地入口 | `http://localhost:3000` |
| RunningHub 渠道 | `RunningHub 渠道` |
| 渠道用途 | `open-source-practice`（无限练习） |
| RunningHub 地址 | `https://www.runninghub.cn/` |
| Boogu 工作流 ID | `2087498214948823042` |
| 提示词节点 | `62.prompt`（`TextEncodeBooguEdit`） |
| 输出节点 | `44`（`SaveImage`） |
| 创建接口 | `POST /task/openapi/create` |
| 查询接口 | `POST /openapi/v2/query` |
| 创建响应任务 ID | `data.taskId` |
| 查询响应状态 | `status` |
| 查询响应结果 | `results[].url` |

真实任务返回了 `code: 0`、`taskId` 和 PNG 地址，图片已保存为：

`C:\CODE\blue-oem\output\runninghub-2094824859682177026-1.png`

这证明以下链路已经成立：

```text
VOZEB PRO → RunningHub 创建任务 → taskId → RunningHub 查询 → results[].url → 下载 PNG
```

本次生成使用的是 Boogu 工作流的默认图片输入，因此没有上传参考图。要支持真正的图像编辑，还需要在后台配置参考图节点映射，见第 6 节。

## 2. 最小可用配置

后台不应要求运维人员同时理解“渠道、逻辑模型、工作流、节点、请求模板、响应字段”六层概念。当前真实可用配置的最小集合如下：

### 渠道级配置

- 渠道名称：`RunningHub 渠道`
- 协议：`RunningHub`
- Base URL：`https://www.runninghub.cn/`
- 用途：`无限练习`
- API Key：只在服务端渠道密钥字段保存，服务端加密；不要写进前端、Markdown、日志或截图

### 工作流级配置

- 工作流名称：`Boogu 分镜图编辑`
- 业务 code：`storyboard-image`
- 能力：`image`
- Workflow ID：`2087498214948823042`
- 版本：`1`
- 状态：启用
- 创建路径：`/task/openapi/create`
- 查询路径：`/openapi/v2/query`
- 任务 ID 字段：`data.taskId`
- 状态字段：`status`
- 结果字段：`results`
- 请求模板：

```json
{
  "workflowId": "{{workflowId}}",
  "nodeInfoList": []
}
```

如果工作流没有动态节点，`nodeInfoList` 可以为空数组。提示词节点映射配置好以后，再把提示词写入数组。

## 3. 官方接口契约

RunningHub 当前官方工作流接口采用任务模式。创建和查询不是同一种 HTTP 形态，不能把旧 V2 路径和新工作流路径混用。

### 3.1 获取工作流 JSON

用于确认 Workflow ID 有效，并取得节点编号、节点类型和输入字段：

```text
POST https://www.runninghub.cn/api/openapi/getJsonApiFormat
```

请求体：

```json
{
  "apiKey": "由服务端注入，不要写到前端",
  "workflowId": "2087498214948823042"
}
```

本次返回的关键节点：

| 节点 | 类型 | 作用 |
| --- | --- | --- |
| `32` | `LoadImage` | 图 1 |
| `68` | `LoadImage` | 图 2 |
| `62` | `TextEncodeBooguEdit` | 提示词和两张参考图的编码 |
| `44` | `SaveImage` | 最终图片输出 |

### 3.2 创建任务

```text
POST https://www.runninghub.cn/task/openapi/create
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

最小请求体：

```json
{
  "workflowId": "2087498214948823042",
  "nodeInfoList": [],
  "apiKey": "由服务端注入"
}
```

带提示词节点覆盖的请求体：

```json
{
  "workflowId": "2087498214948823042",
  "nodeInfoList": [
    {
      "nodeId": "62",
      "fieldName": "prompt",
      "fieldValue": "电影感分镜：夜晚的城市街道，一位年轻创作者站在霓虹灯下，写实摄影，光影细腻"
    }
  ],
  "apiKey": "由服务端注入"
}
```

成功响应的关键字段：

```json
{
  "code": 0,
  "data": {
    "taskId": "2094824859682177026",
    "taskStatus": "RUNNING"
  }
}
```

### 3.3 查询任务

```text
POST https://www.runninghub.cn/openapi/v2/query
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

请求体只有任务 ID：

```json
{
  "taskId": "2094824859682177026"
}
```

成功响应：

```json
{
  "taskId": "2094824859682177026",
  "status": "SUCCESS",
  "results": [
    {
      "url": "https://.../output/Boogu_image_edit.png",
      "outputType": "png",
      "nodeId": "44"
    }
  ]
}
```

### 3.4 参考媒体上传

如果节点需要图片、视频或音频，先调用官方上传接口，使用返回的短期 `download_url`：

```text
POST https://www.runninghub.cn/openapi/v2/media/upload/binary
```

短期 URL 只用于当前任务，不写入本地素材库作为永久文件。

## 4. 这次为什么一开始失败

### 4.1 把平台内部别名当成 Workflow ID

错误配置：

```json
{
  "workflow": "workflow-boogu-image-edit",
  "prompt": "..."
}
```

RunningHub 返回：`errorCode=1001 Invalid URL`。

`workflow-boogu-image-edit` 是 VOZEB PRO 的逻辑模型/工作流 key，不是 RunningHub 的远端 Workflow ID。两者必须分开保存：

- VOZEB PRO：`workflowKey=workflow-boogu-image-edit`
- RunningHub：`workflowId=2087498214948823042`

### 4.2 把旧 V2 创建路径当成官方工作流路径

旧配置使用：

```text
/openapi/v2/task/create
/openapi/v2/task/status/:task_id
```

这套路径与本次官方工作流接口不匹配。当前工作流必须使用：

```text
/task/openapi/create
/openapi/v2/query
```

### 4.3 创建体缺少 apiKey

官方文档同时要求 Bearer 鉴权和请求体中的 `apiKey`。只带 Bearer 头时返回：`must not be null`。

因此服务端 provider 必须在发往 `/task/openapi/create` 时注入 `apiKey`，而不是让运维人员把密钥复制到请求模板中。

### 4.4 查询方法和参数错误

`/openapi/v2/query` 是 `POST`，请求体传 `{ "taskId": "..." }`。不能发送：

```text
GET /openapi/v2/query/<taskId>
```

本次已在 provider 中增加官方查询兼容：只有识别到官方路径时使用 POST；其他旧的声明式路径仍按原有 GET + 路径替换逻辑运行。

## 5. 运维人员的推荐操作流程

后续接入其他工作流时，按以下顺序操作，不要先填一大堆路径：

1. 在 RunningHub 工作流页面复制真实 Workflow ID。通常是工作流地址末尾的数字，不是页面显示名称，也不是 VOZEB PRO 的逻辑模型名。
2. 在后台渠道中确认 Base URL、协议和 API Key 已保存。API Key 只保存一次，后续工作流不重复填写。
3. 新建工作流，先只填名称、业务 code、能力和 Workflow ID。
4. 点击“读取工作流信息”或“连接检查”。服务端调用 `getJsonApiFormat`，确认 ID 存在并展示节点摘要。
5. 选择提示词节点和输出节点。运维人员只需从下拉列表选择节点，不手写节点 JSON。
6. 保存为停用版本。
7. 点击“提交测试”，再点击“查询状态”。确认状态为 `SUCCESS` 且结果 URL 可打开。
8. 测试成功后再启用版本。启用新版本时，旧版本自动停用；不要覆盖已经启用的版本。
9. 在无限练习页面用对应业务入口验证一次，不要直接把 Workflow ID 暴露给学生或老师。

## 6. Boogu 参考图映射注意事项

本次默认运行已经成功，但 Boogu 编辑工作流实际包含两张输入图：

- 节点 `32.image` → 经过节点 `66` → `62.images.image_1`
- 节点 `68.image` → 经过节点 `69` → `62.images.image_2`

因此后续要做完整图像编辑时，后台应提供两个清晰的业务字段，例如“主体图”和“参考图”，分别映射到节点 `32.image` 和 `68.image`。不要让运维人员直接填写 `images.image_1` 这类内部节点路径，也不要把同一张图片默认为两个角色。

建议的公开参数形态：

```json
[
  {
    "key": "prompt",
    "label": "编辑提示词",
    "type": "textarea",
    "required": true
  },
  {
    "key": "subjectImage",
    "label": "主体图",
    "type": "image",
    "required": true
  },
  {
    "key": "referenceImage",
    "label": "参考图",
    "type": "image",
    "required": true
  }
]
```

节点映射由服务端保存，前端只传 `prompt`、`subjectImage` 和 `referenceImage`。如果某工作流只有一张图，表单自动隐藏第二个字段。

## 7. 后台配置简化改造清单

### 7.1 快速配置模式：运维人员只填 6 项

新增“快速配置”模式，默认只显示：

1. 工作流名称
2. 业务能力（图片、视频、音频、文本）
3. Workflow ID 或完整工作流链接
4. 提示词输入节点
5. 输出节点
6. 启用开关

以下字段由 RunningHub 官方预置自动填写，不再让运维人员手填：

| 字段 | 默认值 |
| --- | --- |
| 创建路径 | `/task/openapi/create` |
| 查询路径 | `/openapi/v2/query` |
| 任务 ID 字段 | `data.taskId` |
| 状态字段 | `status` |
| 结果字段 | `results` |
| 请求模板 | `{"workflowId":"{{workflowId}}","nodeInfoList":[]}` |

快速配置保存前必须由服务端读取 Workflow JSON 并验证 ID。不能只根据数字格式判断有效。

### 7.2 高级配置折叠，不删除能力

“高级配置”保留现有能力，但默认折叠：

- 自定义创建/查询路径
- 自定义任务 ID、状态和结果字段
- 请求模板
- `inputSchema`
- `nodeMappings`
- `outputMappings`
- 超时和运行选项

只有非官方协议或确实需要自定义响应结构时才展开。这样可以隐藏复杂性，不会删除后续接入其他供应商或特殊工作流的冗余能力。

### 7.3 从完整 JSON 改成节点选择器

当前让运维人员直接粘贴 `nodeMappings` JSON，出错概率很高。建议改为：

- 服务端读取 Workflow JSON；
- 显示节点标题、节点 ID、节点类型和可修改字段；
- 运维人员选择“提示词”“主体图”“参考图”“输出”；
- 服务端生成节点映射 JSON；
- 高级 JSON 编辑器只给排障人员使用。

自动识别只能生成候选，必须让管理员确认后保存，不能静默猜测节点。

### 7.4 连接检查和提交测试分开

后台需要两个按钮，含义要明确：

- “连接检查”：只调用 `getJsonApiFormat` 或账户状态接口，不创建任务，不消耗生成资源。
- “提交测试”：真实创建任务，明确标注可能消耗 RunningHub 额度；提交后显示 taskId 和状态。

“提交测试”不能自动启用版本，也不能创建学校项目、正式作品或积分流水。

### 7.5 错误文案直接告诉运维怎么改

错误信息必须保留上游明确原因，并映射为可执行建议：

| 上游错误 | 后台提示 |
| --- | --- |
| `Invalid URL` | Workflow ID 填成了 VOZEB 模型别名，请复制 RunningHub 工作流地址末尾的数字 |
| `must not be null` | 官方创建请求缺少 apiKey，服务端注入逻辑或渠道密钥配置异常 |
| 无 `taskId` | 任务 ID 字段配置错误，应检查 `data.taskId` |
| 查询无状态/结果 | 查询方法、查询路径或结果字段与官方响应不匹配 |
| `FAILED` + `failedReason` | 展示 RunningHub 的节点失败原因，不要只显示“生成失败” |

## 8. 程序改造时不能简化掉的边界

以下能力必须保留，不能为了减少表单字段而删除：

- API Key 服务端加密和脱敏；
- Workflow ID 与 VOZEB 逻辑模型 ID 分离；
- 工作流版本不可覆盖，启用新版本时停用旧版本；
- `open-source-practice` 与正式生产渠道隔离；
- 任务创建、查询、结果 URL 的真实状态落盘；
- 失败任务可再次检查，不重建任务、不重复计费；
- 参考媒体使用短期上游 URL，不把上传响应直接当永久素材；
- 管理员测试不创建学校项目、学生作品或积分流水；
- 自定义协议字段继续存在于高级模式，供后续非标准工作流使用。

## 9. 剩余工作流接入表

后续每接通一个工作流，补充一行并保留真实测试证据：

| 业务 code | VOZEB 工作流 key | RunningHub Workflow ID | 能力 | 提示词节点 | 输入媒体节点 | 输出节点 | 测试 taskId | 结果文件 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `storyboard-image` | `workflow-boogu-image-edit` | `2087498214948823042` | image | `62.prompt` | `32.image`, `68.image` | `44` | `2094824859682177026` | `runninghub-2094824859682177026-1.png` | 已成功 |
| `storyboard-image` | `workflow-klein-multiview` | 待从 RunningHub 工作流链接确认 | image | 读取 JSON 后填写 | 读取 JSON 后填写 | 读取 JSON 后填写 | 待测试 | 待测试 | 未测试 |
| `storyboard-image` | `workflow-360-panorama` | 待从 RunningHub 工作流链接确认 | image | 读取 JSON 后填写 | 读取 JSON 后填写 | 读取 JSON 后填写 | 待测试 | 待测试 | 未测试 |
| `storyboard-image` | `workflow-character-view` | 待从 RunningHub 工作流链接确认 | image | 读取 JSON 后填写 | 读取 JSON 后填写 | 读取 JSON 后填写 | 待测试 | 待测试 | 未测试 |
| `storyboard-video` | `workflow-minimax-h3-base` | `2090436199843454978` | video | `138.value` | `147.image`, `148.image`, `158.image` | `92` | `2094965662094159873` | `runninghub-minimax-h3-base-2094965662094159873.mp4` | 已成功 |
| `storyboard-video` | `workflow-minimax-h3-full` | 待从 RunningHub 工作流链接确认 | video | 读取 JSON 后填写 | 读取 JSON 后填写 | 读取 JSON 后填写 | 待测试 | 待测试 | 未测试 |
| `dubbing` | `workflow-index-tts` | 待从 RunningHub 工作流链接确认 | audio | 读取 JSON 后填写 | 读取 JSON 后填写 | 读取 JSON 后填写 | 待测试 | 待测试 | 未测试 |

“待测试”不是接口默认值，而是明确表示该工作流还没有真实供应商证据，不能把它显示成可用。

### 9.1 MiniMax H3 基础版真实调通记录

本次使用的 RunningHub 工作流 ID 为 `2090436199843454978`，通过官方接口完成了以下验证：

- `POST /api/openapi/getJsonApiFormat`：返回工作流 JSON，确认工作流类型为 `MiniMaxH3ReferenceToVideo`。
- `POST /task/openapi/create`：首次使用默认节点值，任务 `2094961890416615426` 返回 `FAILED`，明确原因是节点 `147` 找不到默认文件 `分镜_02_侧脸香烟_21x9_1K.png`。
- `POST /openapi/v2/media/upload/binary`：上传临时参考图，获得短期 `download_url`。
- 再次创建时覆盖节点 `147/148/158` 的 `image` 字段，任务 `2094965662094159873` 返回 `SUCCESS`。
- 输出节点 `92` 返回 MP4，已下载到 `output/runninghub-minimax-h3-base-2094965662094159873.mp4`，视频为 H.264/AAC、`864x480`、约 `10.125` 秒、`24fps`。

后台版本配置已固定为：

| 配置项 | 值 |
| --- | --- |
| 工作流 key | `workflow-minimax-h3-base` |
| Workflow ID | `2090436199843454978` |
| 创建路径 | `/task/openapi/create` |
| 查询路径 | `/openapi/v2/query`（POST，body 为 `{ "taskId": "..." }`） |
| 任务 ID 字段 | `data.taskId` |
| 状态字段 | `status` |
| 结果字段 | `results` |
| 动态节点 | `138.value` 提示词；`147/148/158.image` 参考图；`132.value` 时长 |

参考图是此工作流的必需输入。系统代理只在 `runninghub + /task/openapi/create` 时服务端注入渠道 API Key，运维人员和浏览器请求体不再需要填写密钥；其他协议仍按原请求体转发。

## 10. 验收标准

一个工作流只有同时满足以下条件，才能标记为“已接通”：

- 后台保存后刷新仍能读到 Workflow ID 和版本；
- 连接检查能读取官方工作流 JSON；
- 提交测试返回真实 `taskId`；
- 查询接口返回 `SUCCESS` 或明确 `FAILED`；
- 成功结果至少有一个可访问的媒体 URL；
- 结果 URL 能下载并按正确扩展名保存；
- 前端不显示 API Key、请求模板、节点 JSON 或内部错误堆栈；
- 启用版本后无限练习按业务 code 走该版本；
- 正式生产不会误用无限练习工作流；
- 失败后再次查询不会创建第二个任务。

## 11. 官方资料

- [RunningHub 发起 ComfyUI 任务（高级）](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749013)
- [RunningHub 查询任务生成结果 V2](https://www.runninghub.cn/runninghub-api-doc-cn/api-425767306)
- [RunningHub 获取工作流 JSON](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749014)
- [RunningHub 工作流完整接入示例](https://www.runninghub.cn/runninghub-api-doc-cn/doc-8287342)
