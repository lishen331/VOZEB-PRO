# VOZEB PRO 更新与部署流程

## 仓库主线

- `origin/main`（`tjfeng741963/blue-oem`）是唯一主线和版本基线。
- `delivery/develop` 只用于读取同事交付，不设置为本地分支的 upstream。
- 两个仓库的提交历史不相同，禁止直接合并整条 `delivery/develop`；先查看提交和文件差异，再同步确认过的源码。
- `.env`、SSH 私钥、管理员凭据、数据库和媒体数据不得提交到 GitHub。

## 接口索引与开发地图同步门禁

`VOZEB-PRO-接口索引.md` 和 `VOZEB-PRO-开发地图.md` 是每次开发定位接口、页面、Service、Repository、Schema、Worker 和部署入口的基线文档。每次拉取整合完成后、每次推送开始前，都必须在仓库根目录执行：

```powershell
pwsh -NoProfile -File .\过程文件\更新开发地图.ps1
pwsh -NoProfile -File .\过程文件\验证开发文档.ps1
```

更新脚本会刷新 Route、页面和 PostgreSQL 表清单，并同步两份 Markdown 的真实基线；验证脚本会检查数量、Handler 链接、重复路径和 UTF-8 乱码。验证失败不得推送。接口、页面、Service、Repository、Schema、Worker 或部署拓扑有变化时，两份文档必须与代码放在同一个提交中；没有相关结构变化时不为了制造噪声修改业务文档。执行前后都要保留用户未提交修改，并用 `git status` 和 `git diff` 排除 `output/`、`.env`、凭据及其他无关文件。

## 拉取同事代码

```powershell
git fetch delivery develop
git log delivery/develop --oneline -20
git show --stat delivery/develop
git diff --check
```

同步完成后运行开发地图门禁：

```powershell
pwsh -NoProfile -File .\过程文件\更新开发地图.ps1
pwsh -NoProfile -File .\过程文件\验证开发文档.ps1
git diff --check
```

只把确认过的变更应用到当前开发分支，保留本地未提交内容。完成后检查 `git status` 和 `git diff --cached`，提交到当前分支，再将确认后的提交推送到私有 `origin/main`。

## 测试环境

测试环境以快速合并和验证镜像可运行性为目标，不执行单元测试、PostgreSQL 集成测试或 E2E。GitHub 主线普通提交保留依赖审计、Lint、类型检查、格式检查和生产构建；测试与 E2E 只在正式发布标签触发。

本地测试环境更新：

```powershell
git diff --check
docker compose -f docker-compose.local.yml config --quiet
docker compose -f docker-compose.local.yml build app generation-worker
docker compose -f docker-compose.local.yml up -d
Invoke-WebRequest http://127.0.0.1:3000/api/health/live
docker compose -f docker-compose.local.yml ps
```

健康检查通过后再执行：

```powershell
git push origin HEAD:main
```

## 正式环境

正式发布使用 `v*` 或 `VOZEB-PRO-v*` 标签触发完整门禁，包括单元测试、PostgreSQL 集成测试、生产构建和浏览器 E2E。发布镜像使用明确的版本标签或提交 SHA，不使用浮动标签覆盖既有正式版本。

上线前记录当前提交、镜像 SHA 和数据库状态。部署后检查 `/api/health/live`、`/api/health/ready`、应用容器和生成 Worker；失败时切回上一版本镜像，不删除 PostgreSQL 或媒体卷。
