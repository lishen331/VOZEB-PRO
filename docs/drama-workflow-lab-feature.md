# 短剧工作流实验室

## 功能入口

本次新增的是独立实验入口，不覆盖现有短剧页面：

- 列表页：`/drama-lab`
- 项目页：`/drama-lab/:projectId`
- 旧流程仍然是：`/drama`、`/drama/:projectId`

实验室当前只读读取已有短剧项目，展示六个阶段：

1. 剧本
2. 内容审核
3. 资产准备
4. 分镜
5. 镜头生成
6. 成片导出

当前阶段不会创建生成任务、修改剧本、修改角色/场景/道具，也不会改变旧短剧的数据保存逻辑。后续可以在这个隔离入口接入 LocalMiniDrama 的编排逻辑、Prompt Pack 和 H3 视频适配器。

## 开关

服务端环境变量：

```env
VOZEB_PRO_DRAMA_WORKFLOW_LAB=1
```

未设置或设置为 `0` 时：

- 桌面端和移动端导航不显示“短剧实验室”；
- 直接访问 `/drama-lab` 或 `/drama-lab/:projectId` 返回 404；
- `/drama` 旧入口不受影响。

本次本地启动只对当前进程临时设置了该变量，没有修改 `.env` 文件。

## 本地验证

本地服务地址：

- 实验室入口：<http://127.0.0.1:3002/drama-lab>
- 项目详情：登录后从实验室项目列表进入
- 健康检查：<http://127.0.0.1:3002/api/health/live>

当前健康检查返回：

```json
{ "code": 0, "data": { "status": "live" } }
```

未登录访问实验室会先跳转到 `/login`，这是现有用户工作区的认证行为。

## 线上验证

测试服务器部署后，先确认 staging 的 `.env` 已开启：

```env
VOZEB_PRO_DRAMA_WORKFLOW_LAB=1
```

然后访问：

- 实验室入口：<http://8.163.37.148:3001/drama-lab>
- 健康检查：<http://8.163.37.148:3001/api/health/live>

GitHub Actions 部署会使用本次构建的 immutable 镜像：

```text
ghcr.io/lishen331/vozeb-pro:sha-${{ github.sha }}
```

不会要求测试服务器执行 `git pull`；服务器通过 Docker Compose 拉取并启动对应 commit 的镜像。

## 验证命令

在 `web` 目录执行：

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm run lint
corepack pnpm run typecheck
corepack pnpm test
corepack pnpm run format:check
corepack pnpm run build
```

本次验证结果：

- `582` 个测试文件通过，`8` 个跳过；
- `2633` 个测试通过，`30` 个跳过；
- typecheck 通过；
- production build 通过；
- format check 和 `git diff --check` 通过；
- lint 无 error，仓库已有 warning 不影响本次功能。
