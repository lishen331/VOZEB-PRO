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

## 正式发布门禁复核（2026-11-09）

- PR #71 首轮 Quality 的 Web/Docs 依赖审计失败。提交 `43c03909` 修复依赖告警后，Quality [42545704264](https://github.com/lishen331/VOZEB-PRO/actions/runs/42545704264) 全部成功。Web 审计仅余 1 项低危，Docs 无已知漏洞；未跳过审计。
- 同一生产候选经 workflow_dispatch 运行 Staging image [42545751162](https://github.com/lishen331/VOZEB-PRO/actions/runs/42545751162)。已在服务器确认 app/worker 均运行 `sha-43c03909438021c034884b76712d17870533c3f2`，readiness 为 true，数据库/Worker 健康。未将整个 develop 合并到生产候选。
- 更新过时的安装/首页浏览器测试，验证匿名首页跳登录并保留 next、管理员登录态安装页跳首页、真实公开案例详情、课程入口导航及既有学校权限保护、分类空态、服务错误隐藏和恢复、桌面/390px/430px 布局；专项 18 项通过。
- 扩大全量 Chromium 回归共发现 191 项测试，按 3 项失败上限提前停止：5 项通过、1 项跳过、3 项失败、182 项未运行，不能记为全量通过。失败分别为后台作品管理标题的严格定位匹配到 h1/h2、RunningHub 发现流程测试在启用时缺少 API JSON、学校积分测试仍通过普通用户 API 创建管理员而被拒绝。后两项必须先核对现有工作流与 RBAC 契约，不得为让测试变绿放松服务端校验。当前本机无 PostgreSQL/Docker 可执行程序；完整 PostgreSQL 回归应在隔离 CI 数据库中执行。
- 永久生产镜像尚未发布，PR 尚未合并；原生产临时热补丁继续保留。上述失败未被跳过或伪装成通过。

### 回归夹具修正（不修改业务代码）

- 后台标题定位显式指定 h1；抽屉尺寸检查通过条件轮询等待现有入场动画完成，不新增固定延时、不放宽实际溢出标准。
- RunningHub 测试从本地 fixture 获取真实 API 格式 JSON，并在创建工作流时一并提交；保留服务端启用时的 JSON/指纹/成功测试证据校验。安装、官方作品与 RunningHub 专项共 6 项通过。
- 学校积分测试的受限管理员改用现有 RBAC 角色/管理员 API 创建。用户运营角色不包含产教运营权限，读取学校成员期望 403，并验证对应学校管理控件不出现；未修改生产权限代码。该夹具需要 PostgreSQL，等待隔离 CI 数据库验证。
- 后续用 `VOZEB-PRO-v*` 质量验证标签运行完整 CI（不匹配生产镜像的 `v*` 触发器），验证通过前不发布生产版本标签。

### 完整质量验证结论

`VOZEB-PRO-v0.8.28-rc.1` 的完整 Quality 运行未通过：Browser E2E 大量失败/超时后为诊断主动取消，PostgreSQL integration tests 未运行。未发布新的生产版本标签、未合并 PR。失败分组、隔离边界与证据见 [正式发布未放行记录](./2026-11-09-page-defects-release-gate.zh-CN.md)。不要沿用前文轻量 PR Quality 成功，将本次发布记为完成。


## 已热更新内容清单与当前状态（2026-11-09 16:08 复核）

本表区分“热补丁中已包含页面代码”和“登录态业务验收已通过”，不得混为完整永久发布。

| 编号 | 热补丁包含的页面修改 |
| --- | --- |
| UI-001 | 首页增加直接进入课程大厅的入口。 |
| UI-002 | 首页专业方向占位改为平台真实画布创作案例，不伪装为已上线独立功能。 |
| UI-003 | 公开作品列表过滤异常媒体卡片，视频/短剧无内容时展示空态；媒体错误与加载反馈。 |
| UI-004 | 作品广场统一为 `/community`，旧 `/gallery` 重定向，站内入口同步。 |
| UI-005 | 提示词与素材各合并为页面内“我的/公共”Tabs，保留既有数据与服务。 |
| UI-006 | IP 详情返回列表入口及布局、导航点击区域修正。 |
| UI-007 | 隐藏侧栏帮助入口，保留通知、主题和账户操作。 |
| UI-008 | 按需求隐藏账户菜单及个人中心指定入口，保留账户概览和个人资料。 |
| UI-009 | 教学中心调整为“课程中心、备课、我的班级”，隐藏指定 Tabs。 |
| UI-010 | 学校管理隐藏商单、制作小组与算力、IP 开放 Tabs，不删除服务与记录。 |
| UI-011 | 剧本练习显隐保留无限练习唯一配置入口，去掉重复开关；后续发现的缺失 Form 父级另行修复，不能声称原热补丁中已具备该后续修复。 |
| UI-012 | 用户侧隐藏充值套餐/购买入口，“免费版”改为“体验版”，保留余额。 |
| UI-013 | 作品详情主图/缩略图完整展示、加载与错误反馈；缓存图片 hydration 状态的进一步根因修复仍在本地候选，未计入原热补丁。 |

- 16:08 生产服务器只读复核：镜像仍为 `sha-d29e71ac70dc3ce2ed7847b0fc1252d82b3ed91f`，实际 Next build 为 `vyQcRypwunGhd4-IMN7kR`，readiness/database/Worker 全部正常。
- 原备份和 `rollback.sh` 均仍存在；本次复核没有重启容器或修改生产数据库。
- 测试服务器同日只读复核已变为 `sha-768685db57f0a5faf48ce5d757269cc5af685fbf`（app/worker 一致），不是本地未提交候选。本记录此前 `e1a02150` 等是历史部署，不应当作现在运行的版本。
- 当前发布仍被完整回归门禁挡住。PR #71 尚未合并；不把热更新、单元测试或旧测试镜像混同为正式生产镜像已完成发布。
