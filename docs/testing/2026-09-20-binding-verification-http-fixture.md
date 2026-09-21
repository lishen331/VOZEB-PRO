# 2026-09-20 绑定验证：隔离真实 HTTP 集成验收

## 环境与边界

- 使用当前 worktree 的真实 Next dev（webpack），`127.0.0.1:3217`。
- 上游为仓库已有 `scripts/protocol-fixture-server.mjs`，`127.0.0.1:3218`；未访问线上供应商、未产生付费调用。
- 使用独立临时 `VOZEB_PRO_DATA_DIR`、file backend，HTTP 注册首个管理员并通过管理员 HTTP 接口充值测试积分。
- 配置、会话、运行结果和媒体均存临时目录，未将会话、加密密钥或安装令牌提交到仓库。
- ffmpeg/ffprobe 使用本机已安装 TRAE 工具副本；生成真实 854×480、25fps、5 秒 MP4，741667 字节。
- 验证结束后已核验命令行并停止本轮 Next/fixture 进程；已恢复 Next 自动改写的 `tsconfig.json` 和 `next-env.d.ts`。

## 实际执行结果

| 场景 | 实际结果 |
|---|---|
| 保存 text/image/video 三种 disabled binding | settings PATCH 200 |
| 未携带测试授权访问 disabled 文本 proxy | HTTP 403 |
| disabled 文本 binding，1 张 PNG 输入 | passed；产物为真实 HTTP stub 文本回复 |
| disabled 图片 binding，1 张 PNG 编辑输入 | passed；图片下载、解码、持久化完成 |
| disabled 视频 binding，3 张 PNG、480p、5 秒 | passed；上游创建/查询 HTTP 200；下载、持久化、file-type、ffprobe、ffmpeg 全片解码完成 |
| 上述测试结束后读取共享设置 | 三个 binding 仍 disabled |
| 将三个有当前指纹 proof 的 binding 启用 | settings PATCH 200 |
| 修改已启用 binding 的 endpoint 并尝试复用旧 proof | settings PATCH 400 |
| 将视频绑定停用，模板改为只传1张图 | 保存成功；测试 failed，错误明确为实际报文缺少3张参考图 |
| 同一 in-flight 测试并发 POST 两次 | 都复用同一 runId |
| 掉图测试是否调用供应商 | `/videos` create 次数前后相同，提交前即被门禁阻止 |
| 尝试启用掉图失败的新配置 | settings PATCH 400 |

成功 runId：

- 文本：`fba7207e-c51f-415c-b9fb-965af016c979`
- 图片：`64859a81-8ce9-4ff0-9ef2-ed322160ef0a`
- 视频：`8727d20b-cde1-479e-8c6d-6cb61c6d1cd3`
  - platformTaskId：`03e1de5d-b9ed-4752-8df0-06b83889a8e6`
  - upstreamTaskId：`fixture-video-2`
  - 实际产物：854×480、5 秒、741667 字节
- 掉图失败 run：`36e2c409-018c-4fb9-8a18-40a0a7e24c10`

## 集成测试发现并修复

首次视频运行到持久化后，`file-type@22` 的 `fileTypeFromFile` 动态导入 `node:fs/promises` 在 Next webpack 下抛出 module-not-found。改用 Node `openAsBlob` 加 `fileTypeFromBlob`，避免该依赖的动态 Node import；完整 HTTP 视频链路重跑通过。

## 可重用驱动脚本

- `web/scripts/binding-verification-http-fixture.mjs <isolated-fixture-directory>`：保存 disabled 配置并执行三种能力。
- `web/scripts/binding-verification-http-assertions.mjs <isolated-fixture-directory>`：检查 proof gate、配置变更、掉图拒绝、并发POST复用。
- 两个脚本要求已启动的独立端口3217/3218和临时目录中的 `session.json`；不读取仓库 `.env`，不包含真实账号或供应商凭据。

原始本机证据位于 `%TEMP%/vozeb-binding-http-57e44b70abe74893878bc04336f8beac/http-evidence.json`；相关 Next/provider 日志与原始媒体保留于同一隔离目录，未纳入 git。
