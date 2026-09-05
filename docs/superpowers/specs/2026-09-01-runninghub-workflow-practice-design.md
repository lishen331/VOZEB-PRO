# 无限练习 RunningHub 工作流接入设计

> **当前基线说明（2026-09-02）：** 工作流后台现以《RunningHub 工作流自动发现与轻量测试设计》为准。该补充设计将本文件中面向运维的手填协议/节点 JSON 收敛为“拉取 JSON、自动分析、确认候选、真实样例测试”，并取消一期面向运维的正式版本管理；本文件仍保留运行链路、权限隔离和无限练习边界等未冲突内容。

## 1. 文档定位

本文档是对既有《无限练习与灵感发现制作流程设计》的补充，专门约束无限练习一期的 RunningHub 自定义工作流接入。

既有设计已经确认：无限练习绑定学校租户，使用独立项目身份，前端复用 Canvas、短剧项目和现有生成结果组件；RunningHub 是首期练习上游。这里的“短剧项目”是无限练习中的独立练习项目类型，不等同于“短剧实验室”。短剧实验室是替换当前短剧生产模块的独立项目，使用正式生产执行档案，不属于无限练习。本文档进一步收敛工作流后台的配置范围和运行链路。

## 2. 一期目标与边界

### 2.1 必须完成

- 平台管理员可以配置 RunningHub 渠道和自定义工作流。
- 工作流可以绑定无限练习的业务能力。
- 运维人员可以配置 Workflow ID、请求模板、入参、节点映射和出参映射。
- 运维人员可以在后台测试工作流提交、查询和结果读取。
- 无限练习可以通过业务 code 调用当前启用的工作流。
- 图片、视频、音频和文本结果复用现有任务状态、媒体落盘和结果组件。
- 失败原因可以在后台和用户任务结果中按现有机制显示。
- 新配置不会影响正式生产渠道、积分和现有 C 端创作流程。

### 2.2 明确不做

- 不设计本地模型中台或机房 GPU 调度。
- 不在 VOZEB 后台编辑节点图。
- 不增加“待测试”工作流状态。
- 不在无限练习前端增加测试模式或调试开关。
- 不把短剧实验室的生产流程、页面、路由或配置绑定到无限练习；短剧实验室替换当前短剧模块另立生产实施计划。
- 不做 Git 集成、自动安装依赖、复杂节点差异分析。
- 不做完整可视化工作流编辑器。
- 不要求第一期自动解析所有 RunningHub 节点并生成前端表单。

## 3. 现有系统复用结论

当前系统已经具备 RunningHub 的通用异步调用基础：

- `system_model_channels` 保存渠道地址、密钥、模型列表、协议和用途。
- `modelConfigs` 保存每个模型的创建路径、查询路径、任务 ID、状态、结果字段和请求模板。
- `runninghub-provider.ts` 负责提交任务、查询任务和上传媒体。
- `provider-task-config.ts` 负责模板渲染、字段读取和任务路径替换。
- 生成任务系统负责任务持久化、轮询、失败、恢复和重试。
- `open-source-practice` 执行档案已经可以把练习路由与正式生产路由隔离。

因此一期不重写生成链路。新增后台主要是对现有配置能力做轻量的工作流管理封装；运行时仍然调用现有 provider 和任务系统。

现有入口和实现：

- [channel-protocol-registry.ts](../../../web/src/lib/channel-protocol-registry.ts)
- [runninghub-channel-fields.tsx](../../../web/src/components/admin/channels/runninghub-channel-fields.tsx)
- [runninghub-provider.ts](../../../web/src/lib/server/runninghub-provider.ts)
- [provider-task-config.ts](../../../web/src/lib/server/provider-task-config.ts)
- [2026-08-18-infinite-practice-pull-film-design.md](./2026-08-18-infinite-practice-pull-film-design.md)

## 4. 核心概念

### 4.1 渠道

渠道表示“如何连接上游”，一期只有 RunningHub：

- Base URL
- API Key
- 鉴权方式
- 媒体上传方式
- 创建任务路径
- 查询任务路径
- 启用状态
- 渠道用途：无限练习或共享

API Key 只保存于渠道，不重复写入工作流配置。

### 4.2 业务能力

业务能力表示“无限练习前端要调用什么”，使用稳定 code：

```text
script
storyboard-image
storyboard-video
dubbing
music
canvas
drama
```

这里的 `drama` 仅表示无限练习中的短剧项目类型，不等同于短剧实验室。前端和业务服务只传业务 code，不传 RunningHub、Workflow ID 或节点 ID。

### 4.3 工作流配置

工作流配置表示“某个业务能力如何在 RunningHub 上执行”，一期复用 `modelConfigs` 的存储形态，保留未来迁移到独立工作流表的可能。

概念字段：

```text
workflowName
businessCode
capability
providerType = runninghub
channelId
workflowId
enabled
version
createPath
queryPath
taskIdField
statusField
resultField
requestTemplate
inputSchema
nodeMappings
outputMappings
lastTestAt
lastTestResult
lastTestError
```

`providerType` 和 `businessCode` 必须与 RunningHub 的远端标识分开，避免未来更换执行渠道时修改前端和业务数据。

## 5. 后台页面设计

### 5.1 工作流列表

工作流列表放在现有“上游配置”分组下，第一期可以作为 RunningHub 渠道页面的工作流管理区，不强制新增复杂后台分区。

列表字段：

| 字段 | 说明 |
| --- | --- |
| 工作流名称 | 运维识别名称 |
| 业务 code | 绑定无限练习能力 |
| 能力类型 | 文本、图片、视频、音频 |
| 所属渠道 | RunningHub 渠道名称 |
| Workflow ID | 远端工作流标识 |
| 版本 | 当前配置版本 |
| 状态 | 启用或停用 |
| 最近测试 | 成功时间或失败信息 |
| 操作 | 编辑、测试运行、启用、停用、复制版本 |

列表支持按工作流名称、业务 code、能力类型、状态搜索和筛选。工作流数量增加后，仍可以平移到独立工作流页面，运行接口保持不变。

### 5.2 编辑页面

编辑采用截图中的分步 Tab：

```text
基础配置
平台对接
参数契约
节点映射
出参映射
测试运行
```

普通运维人员使用字段表单和 JSON 编辑框；不提供节点图编辑器。

#### 基础配置

- 工作流名称
- 工作流 code
- 业务能力
- 所属 RunningHub 渠道
- 执行池固定为“无限练习”
- 启用/停用
- 备注

新建或复制后的工作流默认停用。测试不会自动改变启用状态。

#### 平台对接

- RunningHub 工作流名称
- Workflow ID
- 创建路径
- 查询路径
- 任务 ID 字段
- 状态字段
- 结果字段
- 超时时间
- 运行选项
- 请求模板

RunningHub 自定义工作流使用 `workflowId`、`nodeInfoList` 或完整工作流 JSON 提交任务，再通过任务 ID 查询结果。[RunningHub 高级工作流接口](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749013)

#### 参数契约

第一期支持手工填写或粘贴 JSON，字段用于后台测试和后续无限练习输入适配：

```json
[
  {
    "key": "prompt",
    "label": "提示词",
    "type": "textarea",
    "required": true
  },
  {
    "key": "referenceImage",
    "label": "参考图",
    "type": "image",
    "required": false
  }
]
```

支持的基础类型：`text`、`textarea`、`image`、`images`、`video`、`audio`、`number`、`enum`、`boolean`。

公开参数使用业务名称，不使用节点编号。参数校验在 service 层完成，模板和 JSON 解析错误在保存或测试前返回明确错误。

#### 节点映射

```json
[
  {
    "paramKey": "prompt",
    "nodeId": "87",
    "fieldName": "text",
    "valueType": "STRING",
    "source": "INPUT",
    "inputKey": "prompt"
  }
]
```

节点映射负责把平台统一参数转换为 RunningHub 的节点字段。第一期允许人工维护；以后可以从工作流 JSON 自动生成候选映射，但仍需管理员确认后才能使用。

#### 出参映射

```json
[
  {
    "key": "image",
    "label": "生成图片",
    "nodeId": "90",
    "assetType": "IMAGE",
    "required": true,
    "primary": true
  }
]
```

第一期至少支持图片、视频、音频和文本结果。多结果可以沿用现有任务结果记录；不能把单个失败结果误判为整批没有成功结果。

### 5.3 工作流状态

状态只保留：

```text
启用
停用
```

测试信息单独保存：

```text
最近测试时间
最近测试结果：成功/失败
最近错误信息
```

测试失败不新增状态，也不自动停用正在使用的版本。新建或复制版本默认停用，管理员测试确认后手动启用。

## 6. 后台测试运行

测试入口只放在后台工作流详情或编辑页，前端无限练习不显示测试模式。

测试链路：

```text
填写测试参数
→ 参数和模板校验
→ 上传测试媒体
→ 提交 RunningHub
→ 读取 taskId
→ 查询任务状态
→ 读取出参
→ 使用现有媒体预览组件展示结果
```

测试面板显示：

- 工作流名称、业务 code 和版本。
- RunningHub Workflow ID。
- 脱敏后的请求摘要。
- 上游 taskId。
- 当前状态。
- 图片、视频、音频或文本结果。
- 错误信息和耗时。

测试运行必须满足：

- 不创建学校项目。
- 不写入学生作品。
- 不进入正式作品历史。
- 不扣正式生产积分。
- 不改变当前启用版本。
- API Key、内部密钥和完整隐私请求不展示给页面。

测试结果可只保存摘要；详细上游响应按现有日志脱敏策略处理。

## 7. 无限练习运行链路

```text
无限练习前端
    ↓ businessCode
练习服务选择 open-source-practice 渠道
    ↓ 当前启用工作流配置
按参数契约和节点映射组装请求
    ↓
RunningHub submit
    ↓ taskId
现有任务查询/轮询/恢复机制
    ↓
现有结果落盘和结果组件
```

前端只看到业务能力和结果，不看到 RunningHub、Workflow ID、节点映射和内部请求模板。

无限练习中的 Canvas 项目、短剧项目和单项练习均复用现有结果组件；短剧实验室不走本节的练习执行链路：

- 图片结果卡。
- 视频播放器。
- 音频结果卡。
- 文本结果展示。
- 生成中、失败、查询和重试状态。
- 历史生成记录。

## 8. 轻量版本兼容

第一期不建设完整版本中心，但必须保留版本边界：

- 工作流保存时产生版本号。
- 当前启用版本只能有一个。
- 修改已启用配置时保存为新版本，不直接覆盖线上配置。
- 新版本默认停用。
- 测试成功后由管理员启用。
- 可以停用新版本并恢复上一版本。
- 每次任务保存实际使用的工作流版本和 Workflow ID。

一期不做自动节点 diff，但工作流 JSON、入参、节点映射和出参映射应作为版本快照保存。以后增加结构指纹和差异提示时，不需要改变前端业务 code。

## 9. 工作流变化处理

| 变化 | 一期处理 | 后续增强 |
| --- | --- | --- |
| 中间流程变化，输入输出不变 | 保存新版本，后台重新测试 | 结构指纹和差异提示 |
| 增加动态开关 | 增加入参和节点映射，保存新版本 | 自动生成参数候选 |
| 输入或输出变化 | 修改参数/出参契约后保存新版本 | 兼容性检查和阻断发布 |
| 复制工作流导致 Workflow ID 变化 | 新版本替换远端 ID | 自动拉取和对比 JSON |
| 业务能力完全变化 | 新建业务工作流，不复用原 code | 独立工作流定义和迁移工具 |

远端同一个 Workflow ID 也可能被修改，所以不能只保存 ID。后续“拉取最新 JSON”应生成候选配置，不直接覆盖当前启用版本：

```text
拉取远端 JSON
→ 保存候选快照
→ 运维确认参数和映射
→ 测试运行
→ 手动启用
```

## 10. 兼容性约束

为后续升级保留以下边界：

1. 业务 code 是平台稳定标识，不能使用 RunningHub Workflow ID 代替。
2. `requestTemplate` 保留为高级兼容入口，普通配置优先使用结构化字段。
3. RunningHub 特有的 `nodeInfoList` 只在 RunningHub provider 适配层处理。
4. 任务运行继续采用统一的提交、查询、结果读取接口。
5. 上传方式属于渠道能力，不在业务模块中写死 RunningHub URL。
6. 不在平台业务表中增加 GPU、机器、显卡和队列优先级字段。
7. 练习和正式生产继续使用不同的执行档案，不能由前端请求体切换。
8. 测试请求与真实学校练习任务使用不同的业务身份和审计类型。

以后增加本地模型中台时，只需新增 provider adapter 和渠道配置，前端业务 code、学校绑定、练习项目和结果组件不需要重写。

## 11. 借鉴项目与采用范围

- [Runninghub Workflow Manager](https://github.com/zzzhengqi/Runninghub-workflow-manager)：采用分类、文件夹和快速搜索思路，不采用浏览器扩展实现。
- [ComfyUI Workflow Studio](https://github.com/ketle-man/ComfyUI-Workflow-Studio)：采用 JSON 预览、参数查看、工作流测试思路。
- [Comfizen](https://github.com/bananasss00/Comfizen)：采用从 API Workflow 识别参数候选、生成简化输入界面的思路。
- [Bone-Studio Workflow Manager](https://github.com/juangea/bs-comfyui-workflow-manager)：后续借鉴项目、复制、导出和版本思想；该项目为 GPL-3.0，只借鉴产品设计，不复制代码。
- [Visionatrix](https://github.com/Visionatrix/Visionatrix)：后续借鉴将复杂 ComfyUI 流程包装成稳定业务能力的思路；不作为一期运行依赖。
- [comfyui-json](https://github.com/comfy-deploy/comfyui-json)：后续借鉴工作流依赖分析；一期不阻塞工作流调用。

## 12. 验收条件

- 后台可以创建或编辑 RunningHub 自定义工作流。
- 工作流可以配置业务 code、Workflow ID、创建/查询路径和响应字段。
- 工作流可以配置入参、节点映射和出参映射。
- 工作流只有启用、停用两种状态。
- 测试入口只在后台出现。
- 测试可以真实完成提交、查询和结果读取。
- 测试失败显示明确错误，不引入“待测试”状态。
- 无限练习可以按业务 code 调用当前启用工作流。
- 无限练习结果使用现有图片、视频、音频和文本结果组件。
- 正式生产流程、积分和现有 C 端创作能力不受影响。
- 短剧实验室替换当前短剧生产模块的页面和生产工作流不在本期范围内，不能被本期练习配置或 `open-source-practice` 执行档案接管。
- 修改工作流可以保存为新版本并手动启用或停用。
- 任务记录可以追溯使用的工作流版本和远端 Workflow ID。
- 配置结构保留未来接入其他执行 provider 的扩展空间。
