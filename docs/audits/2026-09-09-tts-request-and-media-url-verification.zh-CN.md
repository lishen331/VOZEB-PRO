# TTS 定向核验：实际音频任务与播放故障

时间：2026-09-09，北京时间 18:17:01–18:17:07。
环境：8.163.37.148:3001（用户确认域名为同一测试环境）。
App/Worker 镜像：7df2d5d9dd89576aeac06fa3e74dc6fff1df1b0f。
本次不修改渠道、默认模型或密钥；仅读取密钥是否存在的布尔值，未读取或输出密钥明文。

## 方法和边界

实际浏览器点击新建对话，明确选择音频生成和 tts-1，输入“你好，这是语音连通验收。”后点击发送。指定模型用于隔离文本规划与音频执行，不能由此宣称智能规划也已通过。

## 配置与请求核对

数据库默认音频模型为 tts-1。兔子渠道：production/enabled，api_format=openai，Base URL=https://api.tu-zi.com/，has_key=true。tts-1 覆盖配置：protocol=newapi、createPath=/audio/speech、resultField=binary；请求模板字段 model/input/voice/response_format。

按保存配置、任务快照、audio-task-runtime 和系统代理 targetUrl 组装规则，目标为 POST https://api.tu-zi.com/v1/audio/speech；代理会自动补 /v1，不能把根 Base URL 误判为缺路径。

任务快照中的 prompt 实际为：

```text
你好，这是语音连通验收。

统一创作约束：
目标：你好，这是语音连通验收。
视觉方向：严格执行用户当前描述和所选 Skill 约束
```

请求模板把此内容写入 input，model=tts-1、voice=alloy、response_format=mp3。故路径/模型匹配，但朗读文本被通用创作约束污染。这里是任务快照与代码的重建证据，不声称抓到了独立网络报文。

## 真实结果

- Run：agent-psC1jiEXgL4DSH66yFcTh，completed。
- 音频子任务：eb2ecd3e-6d8d-4525-bb34-c79b93504c0f，success，第一次 attempt succeeded。
- 资产：asset-csWv_7RmDI-P4zFo6LsCT。
- 服务器回存音频：180864 字节，audio/mpeg。
- 使用同登录态 GET 同源媒体路径返回 HTTP 200，首字节为 MP3 帧数据。
- 单独诊断 audio 元素使用同源路径：duration=11.304，readyState=4，error=null。仅验证可加载和解码，未做听感/朗读内容验收。
- 无供应商侧 Request ID；同步二进制响应不要求上游 task ID，不能以 upstream_task_id 为空判断未出站。
- 可用于对账的客户端请求标识：audio-task:eb2ecd3e-6d8d-4525-bb34-c79b93504c0f:attempt:1。它不是供应商生成的 Request ID。

## 确认的故障

1. 内部地址泄漏到前端媒体 URL：音频结果保存为 http://127.0.0.1:3000/api/reference-assets/permanent/2026/09/09/audio/20260909-101704-fe5a15f4-9f72-4a73-9e01-dd2adcbbbab2.mp3。
2. 真实 UI audio.src 为上述地址，readyState=0、error.code=4，控制台明确报 media-src CSP 拦截；下载按钮 disabled。原页面播放/下载没有通过。使用同源地址的诊断不能冒充原页面修复。
3. TTS input 被通用视觉约束拼接污染，须把要朗读的正文与创作说明分离。

## 结论与修复方向

本次指定 tts-1 的真实音频执行取得了可解码 MP3，不能再沿用历史失败笼统断言当前模型不可用。平台的播放/下载交付失败是真实问题；本次证据不涵盖之前请求，也不证明历史密钥从未丢失。

后续应修正媒体地址的持久化/对外序列化为授权同源路径或正确外部 URL，保留 CSP 不放宽；TTS 仅发送需要朗读的文本，防止把视觉约束读入成品。智能音频规划、旧取消任务假成功标题和密钥历史需分别跟踪，不能由本次直达音频任务一并宣布通过。
