# 练习画布生图走练习池，不再误入 RunningHub 工作流

日期：2026-11-04
状态：待确认

## 现象

测试环境练习画布（`reddetail.gammablue-x.com/practice/canvas`）用 `gamaimage` 生成图片，
节点立刻报「网络异常，请点击重试」。任务表里没有新任务，请求在建任务前就被拒绝。

测试服 app 日志的真实报错是：

```
Error: 练习工作流渠道不可用
    at attachPracticeWorkflowToChannel
```

## 原因

`/api/image-tasks` 对所有练习请求都补一个 businessCode：

```
if (executionProfile === "open-source-practice" && !clientContext.businessCode)
    clientContext.businessCode = generationBusinessCode(surface, "image");
```

画布 surface 会被补成 `"canvas"`，而 `"canvas"` 在 `RUNNINGHUB_WORKFLOW_BUSINESS_CODES` 里。
于是 `resolvePracticeGenerationCandidates` 在「虚拟模型名」判断之前就落到
`resolvePracticeWorkflowCandidates`，只返回 RunningHub 工作流渠道；
随后 `sanitizeConfigs` 对每个候选都调 `attachPracticeWorkflowToChannel`，
普通渠道（OpenAI / 模汇 / 向量引擎）的协议不是 runninghub，直接抛错。

同样的补码出现在 `/api/audio-tasks` 和 `/api/video-generation-tasks`，
视频和音频的练习画布请求会以同样的方式失败。

## 既定设计（已有规格，本次不改）

- `2026-10-29-practice-canvas.zh-CN.md`：`gamaimage` 是前端虚拟名，后端从公共池随机选渠道。
- `2026-11-02-practice-canvas-test-permission.zh-CN.md`：虚拟名从练习池随机选；
  持有测试权限时可指定池内真实模型。
- `2026-11-03-practice-pool-five-kinds.zh-CN.md`：RunningHub 工作流池保持现状，
  走 workflow 而不是模型，两者互不替代。

## 改动

只改练习请求的路由分派，不动正式生产路径。

1. `resolvePracticeGenerationCandidates`：练习请求先判断是不是画布池请求
   （虚拟模型名，或持有测试权限的显式模型名）。是，则从练习池选渠道并返回，
   不再看 businessCode。短剧练习（`storyboard-image` 等工作流请求）保持走
   RunningHub 工作流。
2. `generationBusinessCode`：画布 surface 默认不再返回 `"canvas"`。
   只有请求明确点名一个工作流模型（不是 `gamaimage` 这类虚拟名）时才补，
   保留 RunningHub 画布工作流的既有路径。短剧练习的业务码不受影响。
3. 图片 / 视频 / 音频三个任务路由：只有候选渠道本身是 runninghub 协议时，
   才调用 `attachPracticeWorkflowToChannel`。练习池选出的普通渠道原样返回。
   文本路由已经是这个写法，照齐。

## 不在本次范围

- 练习池为什么是空的（渠道用途仍是「正式生产」）是运营配置问题，不改代码。
  本次修完后，池子为空时画布会得到「任务参数不完整」的 400，而不是直接 500。
- 不改生产环境，不部署生产。

## 验证

1. 单测：练习画布请求 `gamaimage` 且带 `businessCode: "canvas"`，
   返回练习池渠道，不进 RunningHub。
2. 单测：短剧练习请求 `storyboard-image` 仍走 RunningHub 工作流。
3. `tsc` 与 `vitest src/lib src/app/api`。
4. 推 `develop`，等 Staging image CI，在测试环境复现一次生图。
