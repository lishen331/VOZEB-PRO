# VOZEB PRO 更新与部署流程

## 仓库主线

- 远端仓库是 `origin`，协作主线是 `origin/develop`。
- `develop` 允许直接推送，不要求额外建立交付分支或先推送 `main`。
- 开始工作前检查本地改动和远端提交；本地有未提交改动时不得用拉取操作覆盖它们。
- `.env`、SSH 私钥、管理员凭据、数据库和媒体数据不得提交到 GitHub。

## 更新与合并

从远端同步 `develop`：

```powershell
git status --short --branch
git fetch origin develop
git log --oneline --decorate --graph --max-count=20 HEAD origin/develop
git diff --check
git merge origin/develop
```

如果出现冲突，先按源码和测试解决冲突，再运行开发地图门禁。不得使用 `git reset --hard` 覆盖用户改动。

每次整合远端提交后，从仓库根目录执行：

```powershell
pwsh -NoProfile -File .\过程文件\更新开发地图.ps1
pwsh -NoProfile -File .\过程文件\验证开发文档.ps1
```

更新脚本会根据当前源码刷新 Route、页面、PostgreSQL 表清单和开发地图基线；验证脚本会检查数量、Handler 链接、重复路径和 UTF-8 乱码。发现漂移时必须修复脚本或文档，不得跳过验证。

## 提交前检查

在提交前确认：

```powershell
git diff --check
git status --short
git diff --stat
git diff --cached --stat
```

只提交本次任务相关文件，排除 `.env`、凭据、`output/`、`.e2e-data/`、`.e2e-artifacts/` 和其他测试产物。

## 测试环境自动部署

向 `develop` 推送后，GitHub Actions 工作流 `.github/workflows/staging-image.yml` 自动执行：

1. 安装依赖并运行 Lint、TypeScript 检查、Vitest、格式检查和生产构建。
2. 构建 `linux/amd64` 镜像并推送到 `ghcr.io/lishen331/vozeb-pro`，同时写入 `develop` 和 `sha-<commit>` 标签。
3. 通过 GitHub Secrets 使用 SSH 连接测试服务器，在 `/opt/vozeb-pro/staging` 执行 `docker compose pull app generation-worker` 和 `docker compose up -d`。
4. 检查 `http://127.0.0.1:3001/api/health/ready`，并在失败时输出 Compose 状态和应用/Worker 日志。

推送命令：

```powershell
pwsh -NoProfile -File .\过程文件\更新开发地图.ps1
pwsh -NoProfile -File .\过程文件\验证开发文档.ps1
git push origin develop
```

文档门禁失败、质量检查失败或推送失败时停止后续部署判断，保留错误输出并先修复原因。

## 测试服务器只读核查

测试服务器实际使用 Docker Compose，当前已核对的服务为：

- 应用容器：`vozeb-staging-app-1`，宿主机端口 `3001 -> 3000`
- 生成 Worker：`vozeb-staging-generation-worker-1`
- PostgreSQL：`vozeb-staging-postgres-1`
- 应用和 Worker 使用同一个 GHCR 提交 SHA 镜像；PostgreSQL 使用独立持久化容器/卷。

服务器检查只使用本机安全目录中的私钥，不在命令、日志或仓库中打印私钥内容。部署后至少检查：

```bash
docker compose ps
curl --fail http://127.0.0.1:3001/api/health/live
curl --fail http://127.0.0.1:3001/api/health/ready
```

## 正式环境

当前任务只覆盖 `develop` 的测试环境自动部署。正式环境的标签发布、数据库迁移、备份和回滚必须在确认正式服务器拓扑、镜像来源、持久化卷和人工审批规则后另行补充，不能从测试环境流程推断。
