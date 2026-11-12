# 生成任务程序异常记录调用栈（固定版）

日期：2026-10-22
范围：只加日志和诊断字段，不改任何业务逻辑、重试、计费。

## 1. 为什么要固定

今天大图栈溢出（`Maximum call stack size exceeded`）一直定位不到具体代码行，原因是诊断里只记了 `errorName` 和 `errorMessage`，没有调用栈。

18:47 起用热更新补了栈日志，但热更新改的是编译后的文件。每次发版、回滚、容器重建都会丢，今天已经丢过一次（21:41 换 v0.8.16 后要重打）。所以要写进源码，以后长期保留。

## 2. 改动

### 2.1 程序异常时打印调用栈

位置：`web/src/lib/server/media-task-trace.ts` 的 `traceMediaException`。所有生成任务的异常最后都会经过这里，共 20 处调用。

- 只处理**程序异常**：`RangeError`、`TypeError`、`ReferenceError`。上游拒绝、超时这类正常业务错误不打栈，避免日志刷屏
- 打一行 `console.error("[media-stack]", phase, 任务类型, taskId, 栈)`，栈取前 60 层，每层只保留函数名和 `文件:行:列`，并去掉 `/app/web/.next/server/` 前缀
- 放在 `if (!context) return` **之前**。非画布任务没有诊断上下文，同样会打印
- 打日志本身出错不影响原流程（try/catch 包住）

### 2.2 把栈摘要写进任务诊断

日志会滚动，过几天就查不到了，所以同时把栈写进这条任务的 `diagnostic_events`，查库就能看到：

- 新增字段 `stack`：取栈的前 20 层，最多 1500 字符
- `media-task-diagnostics.ts` 的 `stringFields` 加入 `stack`，长度上限 1500。照常走 `redactDiagnosticText` 脱敏。栈里只有函数名和文件位置，不含提示词、图片、密钥
- 每条任务的诊断总量上限仍是 20KB，不变

### 2.3 调大栈深度

V8 默认只保留 10 层栈。递归爆栈时，这 10 层全是同一个函数在重复，看不出是谁调进来的。

- 在服务启动时（`web/src/instrumentation.ts` 的 `register`）设 `Error.stackTraceLimit = 60`
- 代价：每次抛异常时多采集 50 层，只在出错时才有开销，正常请求不受影响

## 3. 不改的

- 重试、退款、计费、报错文案都不变
- 不打印请求体、响应体、提示词

## 4. 可选（另行确认）：栈直接显示源码行号

现在的栈指向的是编译后的 chunk（如 `chunks/src_1nmpcnr._.js:1:34567`），要对着同版本的构建产物才能找到源码位置。如果生产镜像里带了服务端 `.map` 文件，在 `NODE_OPTIONS` 加 `--enable-source-maps`，栈就会直接显示 `image-task-support.ts:470` 这样的源码行号。

- 需要先确认镜像里有没有 `.map` 文件；没有的话要改构建配置，会让镜像变大
- 只在生成栈的时候有开销
- 这一项这次不做，先确认后再说

## 5. 测试

单测（`media-task-trace.test.ts`、`media-task-diagnostics.test.ts`）：

- 抛 `RangeError` 时，`console.error` 收到 `[media-stack]`，栈里能看到调用的函数名
- 普通 `Error`、`GenerationSubmissionSafeFailure` 不打栈
- 没有诊断上下文时，也会打栈
- 诊断事件里有 `stack`，长度不超过 1500
- `stack` 字段经过脱敏：带 `sk-...` 或 `Bearer ...` 的文本会被替换

完整 vitest、tsc、lint、prettier。

## 6. 发布

- 基于其它会话正在推的版本（包含 `086cb44b` / `8797099a`），在它之后提交，避免冲突
- 先推 `develop` 到测试环境，确认日志格式正确后，随下一个生产版本一起发
- 正式版上线前，生产上继续保留热更新；其它会话发版后热更新会丢，我会重打一次
