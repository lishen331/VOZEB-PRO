# VOZEB 统一画布功能、API 与上游传参清单

对应可视化版本：`2026-09-15-canvas-generation-pipeline.zh-CN.html`

## 结论先说

- 文本节点 → 文本节点：下游收到上游文本和自身提示词；普通文生文不注入平台创作提示词。
- 文本节点 → 视频节点：下游收到上游文本和自身提示词；普通文生视频不注入平台创作提示词。
- 图片节点 + 文本节点 → 视频节点：下游收到图片真实参考和文字；不会凭空注入角色、服装、风格、构图等创作规则。
- 连接上游节点时，画布会把上游文本拼入当前 prompt；这是数据流，不是隐藏提示词。
- 开启全景、镜头控制、蒙版/分层等功能时，会加入对应的技术约束或结构化参数。
- 只有显式进入 Agent，才走 Agent 规划和技能路径；普通画布生成不自动走 Agent。

## 节点清单

| 节点 | 可执行能力 | 输入 | 输出 |
|---|---|---|---|
| 文本节点 | 文生文、作为图片/视频/音频上游 | 文本内容、连接的上游文本 | 文本结果 |
| 图片节点 | 文生图、图生图、图文生图、批量图片 | prompt、上游图片/文本、尺寸、质量、参考用途、蒙版 | 图片节点/图片任务 |
| 视频节点 | 文生视频、图生视频、视频参考、多模态视频 | prompt、图片/视频/音频参考、时长、比例、质量、首尾帧模式 | 视频节点/视频任务 |
| 音频节点 | 文生音频/TTS | prompt、音色、格式、速度、指令 | 音频节点/音频任务 |
| 配置节点 | Composer 组装、指定上游节点 | `@[node:节点ID]`、配置内容、生成模式 | 按模式生成对应任务 |
| 全景节点 | 全景图 | 文本和可选参考图 | 2:1 全景图片 |
| Brief 节点 | 创作简报/约束输入 | 目标、受众、交付物、约束 | 提供给下游/Agent |
| Task 节点 | 任务状态/执行承载 | 任务上下文 | 状态、结果、错误 |
| Brand Kit 节点 | 品牌风格、色彩、字体等上下文 | 品牌配置 | 下游上下文/Agent |
| 分层 | 图片理解与图层识别 | 源图片 | 图层 JSON、bbox、z-index、图层任务 |
| 蒙版编辑 | 局部图像编辑 | 原图、蒙版、prompt | 编辑图片 |
| 相机控制 | 技术摄影参数追加 | 相机、镜头、焦段、光圈 | 修改后的 prompt |

## API 接口清单

| 能力 | 前端函数 | 服务端接口 |
|---|---|---|
| 图片生成 | `createImageGenerationTask` | `POST /api/image-tasks` |
| 图片查询/恢复 | `recoverImageGenerationTask` | `POST /api/image-tasks/:id` |
| 视频生成 | `createServerVideoGenerationTask` | `POST /api/video-generation-tasks` |
| 视频查询/恢复/取消 | `pollServerVideoTask`、`recoverVideoGenerationTask`、`cancelServerVideoGenerationTask` | `/api/video-tasks/:id` |
| 文本生成 | `createTextGenerationTask` | `POST /api/text-tasks` |
| 音频生成 | `createAudioGenerationTask` | `POST /api/audio-tasks` |
| 画布项目 | Canvas project API | `/api/canvas/projects/:id` |
| 短剧集画布 | Drama Canvas API | `/api/drama-lab/canvas-projects/:id` |
| 图片分层 | Canvas decomposition service | `POST /api/canvas/image-decomposition` |
| 参考媒体 | `uploadCanvasImage`/媒体存储 | `POST /api/reference-assets`、`/api/media-assets` |

## 文本节点出参/入参

```text
文本节点 A
  输入：content = 用户文字
  ↓ 连接
文本节点 B
  输入：prompt = B 自己的提示词
  上游文本：A.content
  最终文本 prompt = B.prompt + A.content
  ↓
POST /api/text-tasks
{
  config: { model, ... },
  messages: [
    { role: "user", content: "最终文本 prompt" }
  ],
  context: { surface: "canvas", projectId, clientRequestId }
}
```

普通文生文没有额外平台创作提示词。文本任务公共层仍会处理模型、计费、幂等、超时、审核和任务状态。

## 图片节点出参/入参

### 文生图

```text
只有文字
  ↓
referenceImages = []
generationType = "generation"
  ↓
POST /api/image-tasks
```

```json
{
  "kind": "generation",
  "config": { "model": "逻辑图片模型", "size": "16:9", "quality": "..." },
  "prompt": "用户 prompt + 上游文本（如有）",
  "references": [],
  "context": { "surface": "canvas", "projectId": "..." }
}
```

### 图生图/图文生图

```text
图片节点 + 可选文字节点
  ↓
references = 图片真实 dataUrl/URL
kind = "edit"
  ↓
POST /api/image-tasks
```

```json
{
  "kind": "edit",
  "prompt": "当前节点提示词 + 上游文本",
  "references": [
    { "id": "node-id", "dataUrl": "...", "url": "...", "storageKey": "..." }
  ],
  "referenceRoles": { "node-id": ["identity", "style", "product"] },
  "mask": { "storageKey": "...", "serverUrl": "..." },
  "context": { "surface": "canvas", "projectId": "..." }
}
```

### 图片平台追加

普通图片生成不会自动追加角色/服装/风格等通用创作提示词。以下属于明确技术参数或能力处理：

- `referenceRoles`：结构化参考图用途，不是 prompt 文本；
- `mask`：蒙版输入；
- `imageOutputBackground`、`imageOutputMode`：透明背景/分层输出；
- 尺寸、比例、质量和模型能力检查；
- 任务幂等、计费、失败重试、审核状态。

## 视频节点出参/入参

### 文生视频

```text
文本节点 → 视频节点
  ↓
videoReferences = []
  ↓
POST /api/video-generation-tasks
```

```json
{
  "config": { "model": "逻辑视频模型", "size": "16:9", "videoSeconds": "5", "vquality": "..." },
  "prompt": "视频节点提示词 + 上游文本",
  "references": [],
  "context": { "surface": "canvas", "projectId": "..." }
}
```

不会自动加入角色一致性、服装、风格或构图提示词。

### 图生视频

```text
图片节点 + 文本节点 → 视频节点
  ↓
images = 图片真实参考
videos = []
  ↓
POST /api/video-generation-tasks
```

```json
{
  "prompt": "视频节点提示词 + 上游文本",
  "references": [
    { "type": "image", "role": "reference", "url": "..." }
  ]
}
```

### 视频/多模态参考

```text
图片 + 视频 + 音频 + 文字
  ↓
references = image/video/audio
```

服务端会按照供应商协议转换参考媒体 URL、角色和格式，并根据模型能力拒绝不支持的组合；不会把参考媒体自动改写成隐藏文字。

## 全景节点

全景节点会调用 `buildPanoramaPrompt`，在原 prompt 后增加全景技术合同：

- 2:1 等距柱状投影；
- 水平 360°；
- 垂直 180°；
- 左右边缘自然无缝；
- 天空/地面完整；
- 禁止普通横幅、鱼眼边框、多图拼接、文字水印。

这不是通用创作风格，而是全景节点的必要技术约束。

## 镜头控制

开启后调用 `applyCameraPrompt`，追加：

- 相机特性；
- 镜头特性；
- 焦段；
- 光圈；
- 景深；
- 保持主体、动作、构图和环境不变。

如果未开启，prompt 会清除历史 Camera direction 标记，不追加镜头文本。

## 蒙版和分层

### 蒙版

蒙版不是 prompt 注入，而是单独的图片输入参数：

```text
原图 + mask + 用户 prompt → 图片 edit 任务
```

平台可能增加：

- 蒙版尺寸校验；
- 未遮罩区域保护；
- 透明背景/分层能力校验；
- 参考图数量和供应商能力校验。

### 分层

分层调用图片理解模型，而不是图片生成模型：

```text
源图片 → visionModel → 结构化图层 JSON
```

输出包括图层类别、边界框、层级、分组和图层图片任务。

## 参考图入参/出参

画布会将节点中的媒体统一转成：

```text
ReferenceImage {
  id,
  name,
  type,
  dataUrl,
  url,
  serverUrl,
  remoteUrl,
  storageKey,
  width,
  height,
  videoRole?
}
```

发送前优先使用受管媒体 URL；必要时把本地图片转成 data URL 或上传到受管参考媒体存储。视频和音频同样转换为供应商可读取的受管 URL。

## 最终审计结论

你的三个示例按普通路径理解是正确的：

1. 文本 → 文本：只传前一个文本节点的文字和当前节点提示词；没有通用平台提示词。
2. 文本 → 视频：只传前一个文本节点的文字和当前节点提示词；没有通用平台提示词。
3. 图片 + 文本 → 视频：只传图片参考和文本内容；没有通用平台提示词。

但不能把所有平台处理都称为“完全原样”：上游文本拼接、Composer 选择、全景技术合同、镜头控制、蒙版/分层参数、模型能力/尺寸/计费/安全/任务字段，都会影响最终请求。要核对一次真实请求，应同时查看：

```text
最终 prompt
参考图 references
referenceRoles
mask
config
context
任务记录中的 upstreamPrompt
```
