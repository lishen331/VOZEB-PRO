# 图片 / 视频 / 音频基础矩阵线上验收

- 测试日期：2026-09-10（Asia/Shanghai）
- 环境：`http://8.163.37.148:3001`
- 测试账号：`laoshi1`
- Playwright 会话：`media-matrix`
- 执行人：线上测试子智能体

## 本轮实际执行状态

本轮进入了真实测试环境并完成登录。进入 Agent 后发现浏览器会话自动恢复已有历史会话：

- 会话：`conversation-4OFFTnFBoBH-H0lGiW1GP`
- 页面已恢复历史 `needs_review` 任务：`agent-7e5XmFws7G4YblgStXRdN`
- 当前历史任务为上一次电商图片任务，不属于本轮新建测试。
- 点击页面上的“新建对话”后，URL 仍保持原会话，未得到可确认的空白会话，因此为避免污染已有任务，本轮没有继续发送生成请求。

## 浏览器与网络观察

已确认线上页面可访问，且基础资源接口正常：

| 请求 | 状态 |
|---|---:|
| `/api/auth/session` | 200 |
| `/api/auth/login` | 200 |
| `/api/create/overview` | 200 |
| `/api/agent/skills?workspace=all` | 200 |
| `/api/creative/conversations/{conversationId}` | 200 |
| `/api/creative/conversations/{conversationId}/messages` | 200 |
| `/api/creative/conversations/{conversationId}/assets` | 200 |
| `/api/agent/runs/{runId}` | 200 |

本轮浏览器控制台：

```text
Errors: 0
Warnings: 0
```

已观察到历史 OSS 视频资源可正常返回 `206 Partial Content`，说明当前媒体资源的 OSS 读取链路至少对该历史资源可用。

## 未完成的基础矩阵

由于无法在本轮安全取得空白 Agent 会话，以下用例没有执行，不应判为通过或失败：

- 文生图；
- 图生图；
- 双参考图；
- 文生视频；
- 图生视频；
- 首帧 / 尾帧；
- 音频 TTS 生成；
- 音频播放与下载。

因此本报告不伪造 run/task ID，也没有产生新的上游请求或扣费。

## 当前发现

### 测试可执行性问题：新建对话入口未形成可验证的空白会话

进入 `/create` 会自动恢复历史 Agent 会话。通过 UI 点击“新建对话”后，页面仍然保持原 conversation URL，未能确认是否真的创建了新会话。若直接继续发送，可能把新用例混入旧会话，导致任务、资产、状态和验收结果无法归属。

这不是媒体生成业务 Bug 的结论；它是本轮线上验收的前置条件阻断，需要在下一轮使用：

1. 页面明确提供并确认新的 conversationId；或
2. 通过“新建对话”后确认消息列表为空、run 列表为空，再发送；或
3. 通过后端创建新会话 API 创建独立会话，然后再使用浏览器验证。

## 结论

本轮仅完成环境连通性和浏览器控制台检查，**没有完成图片 / 视频 / 音频基础矩阵验收**。原因是无法安全获得干净的 Agent 会话；继续发送会污染历史任务，故未执行媒体生成请求。

下轮应先解决“新建空白会话可确认”这一前置问题，再一次性执行完整媒体矩阵，并记录每条用例的：`conversationId`、`runId`、taskId、上游请求时间、模型、页面状态、F12 错误和最终资产。
