# 页面缺陷修复：生产临时热更新记录

## 时间与基线

- 日期：2026-11-09
- 生产容器：`vozeb-pro`（域名 `gammatv.gammablue-x.com`）
- 原生产镜像：`ghcr.io/lishen331/vozeb-pro:sha-d29e71ac70dc3ce2ed7847b0fc1252d82b3ed91f`
- 原 Next build ID：`FDwtH1_5Z2TJOtjhX8gkO`
- 热更新候选：基于 `origin/main` 的页面缺陷修复分支 `fix/page-defects-prod-20261109`
- 新 Next build ID：`vyQcRypwunGhd4-IMN7kR`
- 候选包 SHA-256：`e7abaf6c1d755b491dfc9222c787483e476d757d10bc0ac459992d5e1928f3d8`
- 生产镜像 tag/digest 未改变；本次是容器内 Next 构建产物热更新，容器重建或正式镜像部署会替换此临时状态。

## 保护与回滚

- 更新前将原 `/app/web/.next` 复制到服务器热补丁目录 `.../production/hotpatches/page-defects-20261109/original-next/.next`，并生成 `original-next.sha256`（5860 个文件）。
- 原 `.next` 也在容器内保留为 `/app/web/.next.rollback-page-defects-20261109`。
- 回滚脚本：`/opt/vozeb-pro/production/hotpatches/page-defects-20261109/rollback.sh`。脚本会检查运行镜像仍为本次基线镜像后才恢复；不会在后续镜像已变更时盲目覆盖。
- 候选由 Windows 构建，发布前检查并将 `.next/required-server-files.json` 中的 appDir、repoRoot、turbopack root 及文件分隔符改为容器 Linux 路径 `/app/web`；校验无 Windows 盘符路径，JSON manifests 均可解析。保留原 `.next/node_modules` 与 cache，并将旧静态 hash 资源合并到候选目录，支持旧标签页仍请求旧 chunk。

## 执行与检查

- 新候选目录验证：7483 个 server 文件、420 个 static 文件、515 个 app path entries；7 个关键 JSON manifest 可解析，server chunk 中没有 `.node`/`.so` 原生文件。
- 生产 `.next` 目录切换后重启 app；初次 readiness 探测遇到一次重启连接重置，随后第 2 次探测 HTTP 200。数据库 schema、加密状态、Worker 健康均为 ready；运行镜像仍为原 `sha-d29e71a`。
- Chromium 未登录生产页面检查：`/login` HTTP 200；Next 静态 JS/CSS 请求均 200；匿名 `/api/model-catalog` 返回 401（登录态保护的预期结果）。
- 用生产公开作品 API 选取公开作品 `image-20261030-a5fd2a62d03cc639320f82b9b10cca22` 访问 `/share/...`：页面标题正确，主媒体与缩略图加载完成（天然尺寸 537×537、256×362），`document.images` 无失败图，1280px 下无横向溢出。
- 未使用生产用户凭据登录；因此生产私有导航、账户菜单、教学/学校管理和后台开关尚未由人工登录态验收。测试环境 `reddetail.gammablue-x.com` 已部署 `sha-70017872`，自动部署和 readiness 通过，并在登录态复核了首页、作品广场、提示词/素材 Tabs、教学 Tab 与 390px/1280px 响应式；用户仍可继续进行业务验收。

## 正式发布

临时热补丁只用于生产页面先行验证，不等同于永久发布。正式候选从当前生产 `main` 基线构建，待质量门禁和 main/tag 发布流程完成后，部署新的不可变生产镜像；随后再确认热补丁是否被正式镜像取代、readiness 与关键页面保持正常。上线后保留原 `v0.8.27` 镜像回滚能力。
