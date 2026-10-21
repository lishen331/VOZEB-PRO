# 测试环境发布依赖安全修复（2026-10-22）

## 目的与范围

修复 `codex/release-media-delivery-staging-20261021` 测试部署工作流在 `pnpm audit --audit-level moderate` 阶段阻断的问题。仅针对测试发布分支；本次不合并 `develop`，不部署生产。

## 根因证据

- GitHub Actions 运行 `39616122585`（提交 `d2a4b595`）在依赖审计阶段失败，尚未进入构建或 SSH 部署。
- 复现初始依赖树：Critical 2、High 27、Moderate 33、Low 8。
- 生产依赖与开发依赖的漏洞混在同一审计门禁中；Docker 最终镜像由 Next standalone 输出构成，构建工具依赖不应被误认为运行时依赖。

## 修复

- 升级受影响的直接运行依赖：`next`、`axios`、`undici`、`sharp`；同步 `eslint-config-next` 与 Next 版本。
- 更新已被项目 `pnpm-workspace.yaml` 固定在脆弱版本的传递依赖覆盖：`fast-uri`、`ip-address`、`brace-expansion`、`hono`、`sharp`、`undici`、`vite`。
- `proxy-addr`、MCP SDK、`follow-redirects` 等其余可修复依赖由 lockfile 更新至公告修复版本。
- 对运行时依赖执行严格审计；全依赖图审计仅忽略一个目前没有已发布修复版本的公告：`GHSA-vfj7-8cjw-p6xm`（`braces@3.0.3`）。`pnpm why braces` 证明它只经 `eslint-config-next` 与 `shadcn` 到达，均为 `devDependencies`；该例外不扩大到其它 advisory。

## 部署前发现的 CI 基线阻断

- 全量测试首次运行时，1 个设计系统图标测试仍按旧实现读取每个图标的硬编码名称；当前页面已改为遍历 `GAMMA_NAV_ICON_NAMES`，测试已改为验证规范列表被动态渲染。
- 一键成片死路由守卫递归扫描整个源码树，单测实测约 9.5 秒，原 5 秒 timeout 不适合当前仓库规模；只提高该测试 timeout 到 20 秒，不改变判定逻辑。
- 全仓 Prettier 检查发现 15 个已有格式差异文件；统一格式化，未改变业务行为。
- 修正上述测试/格式门禁后，全量测试结果为 1083 个测试文件通过、7 个跳过；5841 个测试通过、33 个跳过。构建仍需由 GitHub Actions 的干净 runner 完成验证，本地 worktree 的 `node_modules` 是指向主工作区的 junction，Next/Turbopack 会拒绝从 worktree 外解析依赖，因此不把本地构建失败冒充代码构建失败或成功。

## 验证门槛

1. `pnpm install --frozen-lockfile` 成功。
2. `pnpm audit --prod --audit-level moderate` 为 0 个漏洞。
3. `pnpm audit --audit-level moderate` 由 `auditConfig.ignoreGhsas` 精确忽略该 GHSA 后，不再报告其它 Moderate/High/Critical。
4. 按 workflow 执行 lint、typecheck、tests、format check、production build。
5. 部署后验证测试环境 readiness 与实际镜像 SHA。

## 风险与后续

- `braces` 的 `GHSA-vfj7-8cjw-p6xm` 是单项、显式的开发依赖例外；不宣称全依赖图零漏洞。发现官方修复版本后应立即移除此 ignore 并升级。
- 此文件记录的是测试环境发布审计，不构成生产发布授权；生产仍需单独审查安全例外和验证结果。
