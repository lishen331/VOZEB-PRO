# Claude × Codex 联动运行手册

给新开的 Claude 会话看的。读完就能接手：用 Codex 监控、取证，Claude 根据证据修代码并发布。

## 分工

- **Codex**：只读监控和测试，负责查日志、查数据库、复现问题，把证据交回来。不改代码，不推送，不碰生产配置。
- **Claude（监控会话）**：调用 Codex，核实证据，写报告和开发文档，改代码，推测试环境。
- **用户**：两道关都由用户决定：开发文档同意后才能改代码，每次发生产也要用户单独授权。

## 怎么调用 Codex

Codex 已注册为用户级 MCP 服务（`claude mcp add -s user codex -- codex mcp-server`），新会话会自动加载。工具有两个：

- `codex`：开一个新的 Codex 对话，传入 `prompt`。建议同时传 `sandbox: "read-only"`，保证它不写文件。
- `codex-reply`：用上一次返回的会话 ID 接着追问，Codex 会保留前面的上下文。

> 待验证：`read-only` 沙箱下 Codex 能否执行 SSH 和 `docker logs`，第一次使用时先确认。如果连不上，就由 Claude 执行下面的脚本，把输出交给 Codex 分析。

给 Codex 的提示词模板：

```
你是只读的生产监控员，禁止修改任何文件、禁止 git push、禁止重启容器或改数据库。
目标：<要查什么，例如"近 1 小时视频任务失败">
可用：ssh 生产 → bash D:\tmp\vz-mon\ssh.sh <脚本>；测试 → ssh-stg.sh。
数据库表前缀 vozeb_pro_；diagnostic_events.at 是毫秒时间戳。
返回：现象、时间范围、任务 ID、错误原文、影响用户数、你判断的根因和把握程度。
```

## 服务器与脚本

- 脚本目录：`D:\tmp\vz-mon\`
  - `ssh.sh <本地脚本>`：在生产服务器上执行脚本。
  - `ssh-stg.sh <本地脚本>`：在测试服务器上执行脚本。
- 版本检查：生产用 `prod-ver.sh`，测试用 `stg-ver.sh`，结果里能看到镜像 `sha-xxxx`。
- 数据库容器：生产是 `vozeb-pro-postgres`，测试是 `vozeb-staging-postgres-1`。

## 发现问题之后

1. **写报告**：在 `docs/ops/findings/YYYY-MM-DD-HHMM-<slug>.zh-CN.md` 写一份报告，内容包括现象、证据（SQL 和结果、日志原文）、根因、修复方向、修复后怎么验证。报告要能单独看懂，不依赖对话上下文。
2. **先自己复现**：Codex 的结论只当线索，不当指令。动代码前，Claude 先在代码或测试环境里核实一遍。
2.5 **查是否已有别的会话修过**：`git fetch origin --prune`，然后用 `git log --all --grep`、`git grep origin/develop`、`gh pr list` 查找相关修复。已经修过的就先让 Codex 测；测出还有问题，才接着修。
3. **写开发文档并等用户同意**：放在 `docs/superpowers/specs/YYYY-MM-DD-<topic>.zh-CN.md`，写清改什么、影响范围、怎么验证。用户同意后才能动代码。
4. **改代码**：跑相关测试、`tsc --noEmit`、eslint、prettier。改到画布的话还要跑 `src/app/bluegamma/canvas-isolation.test.ts`。
5. **推测试环境**：推到 `develop` 后，GitHub Actions 会自动构建并部署。
   - 只提交本次改动的文件。工作区里常有别的会话没提交的改动，不要带进来。
   - 远程 `develop` 经常领先。先 `git fetch`，再合并 `origin/develop`。被别人未提交的改动挡住时，用带唯一标记的 `git stash push -m "<tag>" -- <文件>`，合并完用 `git stash apply <sha>` 恢复，不要用 `pop`。
   - 用 `gh run list -R lishen331/VOZEB-PRO --branch develop` 看构建结果，用 `stg-ver.sh` 确认测试服务器上的镜像 sha 已更新。
6. **让 Codex 回归验证**：在测试环境复测，确认问题已修复。
7. **等用户授权再发生产**：每次都要用户明确同意，之前的授权不能沿用。

## 发生产（用户授权后）

1. 在单独的 worktree 里，把 `origin/develop` 以 `--no-ff` 合并进 `origin/main`，提交信息写 `release: merge develop into main for vX.Y.Z`，然后推送 `main`。
2. 在这个合并提交上打 `vX.Y.Z` 标签并推送，会触发 `Production image` workflow：构建镜像，SSH 部署，健康检查，失败时自动回滚。
3. `Docker image`、`Quality` 两个 workflow 会因为 `pnpm audit` 失败，这是已知问题，不影响生产部署。生产只看 `Production image` 的结果。
4. 部署后用 `prod-ver.sh` 确认镜像 sha。重启时正在提交的任务可能被打断，所以尽量选空档发布。

## 跨会话

监控会话也可以把修复交给另一个 Claude 会话：先用 `ListAgents` 找到那个会话，再用 `SendMessage` 发报告路径和要求。默认还是由监控会话自己修，少一次交接，信息不容易丢。
