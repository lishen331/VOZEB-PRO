# VOZEB PRO 推送 Agent 黑盒交接

更新时间：2026-09-06

这份文档供没有历史上下文的新窗口使用。内容只记录已通过仓库、GitHub Actions、SSH、Docker 和测试证据确认的事实。

## 1. 推送 Agent 职责

后续本 Agent 只负责：

1. 检查工作区、分支和远端状态。
2. 执行相关测试、类型检查、Lint、构建和浏览器回归。
3. 做最终差异检查和风险审核。
4. 修复或阻止推送前的门禁问题。
5. 提交代码并推送 `develop`。
6. 推送后核对 GitHub Actions 和测试服务器部署结果。

不负责自行扩大业务需求，不负责正式环境发布，不负责 Docker 镜像清理，不把未经确认的服务器操作写进仓库。

## 2. 仓库和分支

- 本地仓库：`C:\CODE\VOZEB-PRO`
- 远端：`origin`
- 仓库：`https://github.com/lishen331/VOZEB-PRO.git`
- 主线：`develop` / `origin/develop`
- `develop` 允许直接推送。
- 不使用旧文档中的 `origin/main`、`delivery/develop` 或 `HEAD:main` 流程。
- 禁止用 `git reset --hard` 覆盖用户改动。
- 禁止提交 `.env`、SSH 私钥、管理员凭据、数据库、媒体数据、`output/` 和测试产物。

## 3. 更新、合并和推送

开始任务：

```powershell
git status --short --branch
git fetch origin develop
git log --oneline --decorate --graph --max-count=20 HEAD origin/develop
git diff --check
```

整合远端：

```powershell
git merge origin/develop
```

发生冲突时，先保留用户改动，按源码和测试解决冲突，再继续门禁检查。

每次整合远端后，以及每次推送前，从仓库根目录执行：

```powershell
pwsh -NoProfile -File .\过程文件\更新开发地图.ps1
pwsh -NoProfile -File .\过程文件\验证开发文档.ps1
```

当前源码基线：332 个 API Route、51 个 `page.tsx` 页面入口、116 张 PostgreSQL 表。验证脚本还会检查 Handler 链接、重复路径、数量一致性和 UTF-8/乱码。

提交前：

```powershell
git diff --check
git status --short
git diff --stat
git diff --cached --stat
```

确认只包含本次任务相关文件后提交并推送：

```powershell
git push origin develop
```

## 4. 质量检查

收尾至少执行：

```powershell
cd web
pnpm typecheck
pnpm lint
pnpm test -- --no-file-parallelism
pnpm check:release
pnpm build
pnpm pree2e
pnpm exec playwright test
```

最终报告必须区分通过、跳过、无关失败，以及被环境阻断而未执行的测试。不能因为代码看起来正确就写“已完成”。

## 5. `develop` 推送后的自动部署

工作流是 `.github/workflows/staging-image.yml`，触发条件是推送 `develop`。

流程为：

1. 安装 Node.js 22、pnpm 和依赖。
2. 运行 Lint、TypeScript、Vitest、格式检查和生产构建。
3. 构建 `linux/amd64` 镜像。
4. 推送到 `ghcr.io/lishen331/vozeb-pro`，标签包括 `develop` 和 `sha-<commit>`。
5. 使用 GitHub Secrets 中的 SSH 参数连接测试服务器。
6. 在 `/opt/vozeb-pro/staging` 执行 `docker compose pull app generation-worker` 和 `docker compose up -d`。
7. 检查 `http://127.0.0.1:3001/api/health/ready`。

## 6. 测试服务器

SSH 只使用本机安全目录中的私钥，不把私钥路径、内容或服务器 `.env` 写入 Git：

```powershell
ssh -p 22222 -i "$env:USERPROFILE\.ssh\id_ed25519_lsgmadminuser_8_163_37_148_secondary_20260804" lsgmadminuser@8.163.37.148
```

已经确认：

- Docker 24.0.9。
- Docker Compose 2.26.1。
- 应用容器：`vozeb-staging-app-1`。
- 生成 Worker：`vozeb-staging-generation-worker-1`。
- PostgreSQL：`vozeb-staging-postgres-1`。
- 应用映射：宿主机 `3001` -> 容器 `3000`。
- Compose 目录：`/opt/vozeb-pro/staging`。

部署后核查：

```bash
cd /opt/vozeb-pro/staging
docker compose ps
docker inspect vozeb-staging-app-1 --format '{{.Config.Image}} {{.State.Status}} {{.State.Health.Status}}'
docker inspect vozeb-staging-generation-worker-1 --format '{{.Config.Image}} {{.State.Status}}'
curl --fail http://127.0.0.1:3001/api/health/live
curl --fail http://127.0.0.1:3001/api/health/ready
```

实际运行版本以容器的 `Config.Image` 为准。服务器 `.env` 可能是旧 SHA，因为 Actions 通过 `export VOZEB_PRO_IMAGE=sha-<commit>` 临时覆盖 Compose 命令的环境变量。

## 7. 已确认的部署延迟

Actions 运行 `34009416120` 已成功，build 和 deploy 均通过，app、Worker、PostgreSQL 均健康，新容器镜像为 `sha-bb0a43ffeea630ca56417c907d6bb23f4ed011d5`。

这次 deploy 看起来长时间停住，实际是 GHCR 镜像层下载慢：约 15.19 MB 的层从 `03:48:54 UTC` 下载到 `03:57:45 UTC`。下载完成后 Compose 约 35 秒完成重建，readiness 第 1 次检查通过。不要在 Actions 尚未结束时手动执行 `docker compose up`。

## 8. RunningHub 上下文

目标闭环：填写 Workflow ID -> 读取工作流 -> 勾选提示词/参考图 -> 保存 -> 测试面板显示输入框 -> 填写参数并成功测试。

已完成的关键修复：

- prompt/text 语义判断优先于文件扩展名，避免 `prompt: "example.png"` 被误判为图片。
- 保存时按 `selectedCandidates` 过滤 `inputSchema/nodeMappings/outputMappings`。
- ComfyUI `inputs[] + widgets_values[]` 按可编辑控件顺序配对，连线输入不占用 widget 值。
- 保留只有连线输入的输出节点。
- 保留数字节点 ID，避免顶层 `links` 的同名 ID 隐藏真实节点。
- 成功测试后，即使旧 `testRequired` 仍存在，也允许启用已有成功证据的工作流。

关键文件：

- `web/src/lib/server/runninghub-workflow-discovery.ts`
- `web/src/lib/server/runninghub-workflow-discovery.test.ts`
- `web/src/lib/server/runninghub-workflow-service.ts`
- `web/src/lib/server/runninghub-workflow-service.test.ts`
- `web/src/components/admin/channels/runninghub-workflow-editor.tsx`

已验证本地 ComfyUI 解析、8 个工作流 JSON fixture，以及管理后台读取/保存/测试/查询/启用定向浏览器闭环。尚未使用真实 RunningHub 额度提交外部任务。

## 9. 不要自行猜测

- 正式环境、正式发布、审批、备份、迁移和回滚规则：当前不在范围内。
- Docker 镜像清理策略：当前不在范围内。
- 真实 RunningHub 账号、渠道密钥和上游成功结果：没有证据时不能假设可用。
- Actions deploy 长时间运行时，先查 Actions 日志和服务器进程，不要凭感觉重启或覆盖容器。
- 不要把历史文档中的 `main`、旧仓库或旧服务器信息当成现行流程。

## 10. 最终报告

最终报告至少包含：提交 SHA、`git status`、远端分支状态、测试结果、开发地图脚本结果、Actions build/deploy 结果、服务器运行镜像、容器状态、`live/ready` 结果，以及未验证项和失败项。
