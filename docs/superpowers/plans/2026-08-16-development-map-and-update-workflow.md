# VOZEB PRO Development Map and Update Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a maintainable Chinese development map, a complete index of every Next.js API Route file, and an update/deployment runbook grounded in the current local, GitHub, and remote Docker environments.

**Architecture:** Use the repository as the only source of truth. Generate temporary route/page/schema inventories under `过程文件`, manually review the security and service boundaries, then publish three focused Markdown documents in the repository root. Keep Mermaid source inline, validate every diagram with Mermaid CLI, and treat documentation-only deployment as Git synchronization without a Docker restart.

**Tech Stack:** PowerShell 7, Git, Next.js App Router source, Markdown, Mermaid, Node.js/npx, Docker Compose, GitHub, SSH.

## Global Constraints

- Create exactly these final documents: `VOZEB-PRO-开发地图.md`, `VOZEB-PRO-接口索引.md`, and `VOZEB-PRO-更新部署流程.md`.
- Do not modify business logic, API behavior, database schema, Docker configuration, or `.env`.
- Use `web/src/app/api/**/route.ts` as the sole enumeration source for the API index.
- One Route file maps to one index row; combine multiple HTTP methods in that row.
- Classify access as `公开`, `用户`, `管理员`, `Worker`, `维护`, `Webhook`, or `混合` only from implementation evidence.
- Preserve Mermaid source inline and validate all six diagrams before delivery.
- Do not include real tokens, passwords, access keys, SSH private-key contents, or `.env` values.
- Store all generated inventories, validation extracts, and process scripts under `过程文件`.
- A documentation-only release is pushed to GitHub and pulled on the remote server without rebuilding or restarting Docker.
- Never run `docker compose down -v` or remove the PostgreSQL/media volumes.

---

### Task 1: Build the codebase inventories

**Files:**
- Create: `过程文件/生成开发地图清单.ps1`
- Produces: `过程文件/api-route-inventory.json`
- Produces: `过程文件/page-route-inventory.json`
- Produces: `过程文件/database-table-inventory.txt`
- Read: `web/src/app/api/**/route.ts`
- Read: `web/src/app/**/page.tsx`
- Read: `web/src/lib/server/database/schema*.ts`

**Interfaces:**
- Consumes: the current working tree at commit `2987a56` or later.
- Produces: deterministic inventories used by Tasks 2 and 3; `api-route-inventory.json` contains `domain`, `path`, `methods`, `file`, `imports`, and `authEvidence` fields.

- [ ] **Step 1: Create the inventory script**

Use `apply_patch` to create `过程文件/生成开发地图清单.ps1` with this behavior:

```powershell
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$apiRoot = Join-Path $repoRoot "web/src/app/api"
$appRoot = Join-Path $repoRoot "web/src/app"

$routeRows = foreach ($file in Get-ChildItem $apiRoot -Recurse -Filter route.ts | Sort-Object FullName) {
    $source = Get-Content -Raw $file.FullName
    $relative = $file.FullName.Substring($apiRoot.Length + 1).Replace("\", "/")
    $routePart = $relative -replace "/route\.ts$", ""
    $methods = [regex]::Matches($source, "export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)") |
        ForEach-Object { $_.Groups[1].Value } |
        Sort-Object -Unique
    $imports = [regex]::Matches($source, 'from\s+["''](@/lib/(?:server|auth)/[^"'']+)["'']') |
        ForEach-Object { $_.Groups[1].Value } |
        Sort-Object -Unique
    $authEvidence = @(
        "getCurrentUser", "getCurrentAdmin", "hasAdminPermission", "assertWorkerToken",
        "assertMaintenanceToken", "verifyWebhook", "checkAuthRateLimit", "requireAdmin"
    ) | Where-Object { $source.Contains($_) }
    [pscustomobject]@{
        domain = ($routePart -split "/")[0]
        path = "/api/$routePart"
        methods = @($methods)
        file = "web/src/app/api/$relative"
        imports = @($imports)
        authEvidence = @($authEvidence)
    }
}
$routeRows | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 (Join-Path $PSScriptRoot "api-route-inventory.json")

$pageRows = foreach ($file in Get-ChildItem $appRoot -Recurse -Filter page.tsx | Where-Object FullName -NotMatch "[\\/]api[\\/]" | Sort-Object FullName) {
    $relative = $file.FullName.Substring($appRoot.Length + 1).Replace("\", "/")
    [pscustomobject]@{
        route = "/" + (($relative -replace "/page\.tsx$", "") -replace "^page\.tsx$", "")
        file = "web/src/app/$relative"
    }
}
$pageRows | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 (Join-Path $PSScriptRoot "page-route-inventory.json")

$schemaSource = (Get-Content -Raw (Join-Path $repoRoot "web/src/lib/server/database/schema.ts")) + "`n" +
    (Get-Content -Raw (Join-Path $repoRoot "web/src/lib/server/database/schema-commercial-features.ts"))
[regex]::Matches($schemaSource, "CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_]+)") |
    ForEach-Object { $_.Groups[1].Value } |
    Sort-Object -Unique |
    Set-Content -Encoding utf8 (Join-Path $PSScriptRoot "database-table-inventory.txt")
```

- [ ] **Step 2: Run the inventory script**

Run:

```powershell
pwsh -NoProfile -File "过程文件/生成开发地图清单.ps1"
```

Expected: exit code `0` and three inventory files under `过程文件`.

- [ ] **Step 3: Verify inventory counts and uniqueness**

Run:

```powershell
$routes = Get-Content -Raw "过程文件/api-route-inventory.json" | ConvertFrom-Json
"route_count=$($routes.Count)"
"unique_files=$(($routes.file | Sort-Object -Unique).Count)"
"missing_methods=$(($routes | Where-Object { $_.methods.Count -eq 0 }).Count)"
```

Expected at the current baseline: `route_count=172`, `unique_files=172`. Inspect every `missing_methods` entry; accept only files that re-export handlers or use a supported alternate declaration, and add the discovered pattern to the script if necessary.

- [ ] **Step 4: Review source boundaries that drive the maps**

Read the complete representative implementations before documenting them:

```text
web/src/app/layout.tsx
web/src/components/layout/app-providers.tsx
web/src/components/layout/app-workspace-shell.tsx
web/src/lib/auth/session.ts
web/src/lib/auth/store-user-access.ts
web/src/lib/server/database/postgres.ts
web/src/lib/server/database/repositories.ts
web/src/lib/server/generation-task-scheduler.ts
web/src/lib/server/generation-task-store.ts
web/src/lib/server/object-storage-service.ts
web/src/lib/server/local-media-storage.ts
web/scripts/generation-worker.mjs
Dockerfile
docker-compose.local.yml
docker-compose.yml
```

Expected: notes can trace Browser -> Page/Component -> Route Handler -> Service/Store -> Repository -> PostgreSQL/storage and App -> Worker -> upstream provider.

---

### Task 2: Write the core development map

**Files:**
- Create: `VOZEB-PRO-开发地图.md`
- Read: `过程文件/page-route-inventory.json`
- Read: `过程文件/database-table-inventory.txt`
- Reference: `VOZEB-PRO-接口索引.md`
- Reference: `VOZEB-PRO-更新部署流程.md`

**Interfaces:**
- Consumes: the inventories and reviewed boundaries from Task 1.
- Produces: the primary navigation document and six inline Mermaid blocks consumed by Task 5 validation.

- [ ] **Step 1: Add the document structure**

Create `VOZEB-PRO-开发地图.md` with these exact top-level sections:

```markdown
# VOZEB PRO 开发地图
## 如何使用这份地图
## 技术栈与运行单元
## 目录职责
## 系统总架构
## 前端页面与状态
## API 分层与权限
## 生成任务时序
## 媒体与对象存储
## 数据层边界
## 业务域导航
## 常见二次开发落点
## 修改风险与测试范围
## 相关文档
```

- [ ] **Step 2: Add the architecture and frontend diagrams**

Add high-contrast Mermaid diagrams with these boundaries:

```text
Diagram 1, flowchart: Browser -> Next pages/components -> Route Handlers -> server/auth services -> repositories -> PostgreSQL/local media/S3; Worker connects to internal routes and providers.
Diagram 2, flowchart: public pages, (user) workspace, /admin, providers, TanStack Query, Zustand stores, services/hooks.
Diagram 3, flowchart: request body limits -> session/token/permission checks -> service orchestration -> transaction/repository -> response envelope and error/rate-limit branches.
```

Every `classDef` must specify `fill`, `stroke`, `stroke-width`, and `color`.

- [ ] **Step 3: Add the generation, storage, and deployment diagrams**

Add:

```text
Diagram 4, sequenceDiagram: User -> Route -> Scheduler -> PostgreSQL -> Worker -> Provider -> media registry -> points/refund -> User.
Diagram 5, flowchart: media write decision -> local volume or S3-compatible object storage -> provider registry -> signed/proxied read -> migration branch.
Diagram 6, flowchart: local main -> origin/main -> remote deploy key pull; locally built versioned image -> SCP/load -> remote Compose app/worker/postgres -> persistent volumes.
```

- [ ] **Step 4: Add domain and change-location tables**

For each business domain, list page directories, API prefixes, primary service files, data boundaries, and minimum tests. Include explicit recipes for:

```text
新增普通页面
新增用户 API
新增管理员 API 和权限
新增模型渠道
新增生成任务类型
新增 PostgreSQL Repository 操作
接入 COS/OSS/MinIO
修改套餐、积分或支付逻辑
修改 Worker 调度和恢复
新增远程环境变量
```

- [ ] **Step 5: Validate paths before the map commit**

Run `Test-Path` for every repository-relative Markdown link and `git diff --check`.

Expected: all paths exist and `git diff --check` exits `0`.

- [ ] **Step 6: Commit the development map**

```powershell
git add -- "VOZEB-PRO-开发地图.md"
git commit -m "docs: add VOZEB PRO development map"
```

Expected: one commit containing only the map.

---

### Task 3: Write and audit the 172-route API index

**Files:**
- Create: `VOZEB-PRO-接口索引.md`
- Read: `过程文件/api-route-inventory.json`
- Read: every `web/src/app/api/**/route.ts`

**Interfaces:**
- Consumes: one deterministic inventory object per Route file.
- Produces: one Markdown table row per Route file with path, methods, access, handler, service/data boundary, and purpose.

- [ ] **Step 1: Add the index header and conventions**

Use these sections:

```markdown
# VOZEB PRO 接口索引
## 使用说明
## 权限标记
## 接口总览
## 按业务域索引
## 维护规则
```

Record the generation date, total Route file count, method totals, and domain totals from the inventory instead of hard-coding unverified values.

- [ ] **Step 2: Generate candidate rows grouped by domain**

For each inventory item, write one row with:

```text
方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途
```

Convert filesystem dynamic segments such as `[id]` directly to the URL representation `/api/.../[id]`; do not invent example IDs.

- [ ] **Step 3: Manually audit access classification**

Read every Route Handler and classify from implementation evidence:

```text
公开: no session/token requirement before the operation
用户: current-user/session requirement
管理员: role or hasAdminPermission checks
Worker: worker token verification
维护: maintenance token verification
Webhook: provider signature or webhook policy
混合: method/branch-dependent access
```

If a helper hides the check, follow the imported helper into `web/src/lib/auth` or `web/src/lib/server` before assigning the label. Use `需结合实现确认` only when the boundary cannot be statically proven.

- [ ] **Step 4: Audit services and data boundaries**

Resolve `@/lib/server/*` and `@/lib/auth/*` imports into relative links. Describe PostgreSQL, local files, S3-compatible storage, upstream model providers, payment providers, SMTP, or internal Worker APIs only when the route or called service proves that dependency.

- [ ] **Step 5: Verify exact coverage**

Create a temporary verifier under `过程文件` that extracts all Handler links from `VOZEB-PRO-接口索引.md` and compares them with `api-route-inventory.json`.

Expected:

```text
inventory_routes=172
indexed_routes=172
missing_routes=0
duplicate_routes=0
unknown_routes=0
```

If the current source count differs from 172, update the expected total to the new scan result and document the new value.

- [ ] **Step 6: Commit the API index**

```powershell
git add -- "VOZEB-PRO-接口索引.md"
git commit -m "docs: index VOZEB PRO API routes"
```

Expected: one commit containing only the interface index.

---

### Task 4: Write the update and deployment runbook

**Files:**
- Create: `VOZEB-PRO-更新部署流程.md`
- Read: `Dockerfile`
- Read: `docker-compose.local.yml`
- Read: `docker-compose.yml`
- Read: `.gitignore`
- Read: `.dockerignore`

**Interfaces:**
- Consumes: the current local/private-GitHub/remote-server topology.
- Produces: exact procedures for source, configuration, documentation, database, and rollback changes.

- [ ] **Step 1: Add the runbook structure**

Use these sections:

```markdown
# VOZEB PRO 更新与部署流程
## 当前环境基线
## 总原则
## 开发前同步
## 本地修改与测试矩阵
## 提交和推送 GitHub
## 业务代码的远程 Docker 更新
## 配置变更
## 文档变更
## 数据库变更
## 更新后验证
## 回滚
## 禁止操作与密钥保护
```

- [ ] **Step 2: Document the code-change path**

Document this exact sequence with placeholder values such as `<REMOTE_HOST>` and `<SSH_KEY_PATH>`:

```text
git pull --ff-only
run targeted tests
run pnpm typecheck/build or Docker build
git commit and git push origin main
tag the image as vozeb-pro:<short-sha>
docker save to 过程文件
compute SHA-256
scp the image tar
remote docker load
remote git pull --ff-only
set VOZEB_PRO_IMAGE to the versioned tag without exposing other .env values
docker compose up -d --no-build --pull never --force-recreate app generation-worker
verify health, PostgreSQL, Worker, and logs
```

Explain why PostgreSQL is not force-recreated for ordinary app changes.

- [ ] **Step 3: Document non-code paths and rollback**

Include separate tables for:

```text
docs only -> push + remote git pull, no Docker restart
.env only -> backup .env + change one key + recreate affected service
Compose/Dockerfile -> config check + image validation + controlled update
database schema -> database backup + compatible deployment + migration verification
rollback -> previous Git commit + previous image tag; database restore only from an approved backup
```

Explicitly prohibit credential commits, `.env` display in logs, `git reset --hard` on dirty worktrees, and volume deletion.

- [ ] **Step 4: Add verification commands and expected evidence**

Include `git status`, `git rev-parse`, `docker compose config --quiet`, `docker compose ps`, `/api/health/live`, `pg_isready`, and Worker log checks. Commands must report status without printing secrets.

- [ ] **Step 5: Commit the runbook**

```powershell
git add -- "VOZEB-PRO-更新部署流程.md"
git commit -m "docs: document VOZEB PRO update workflow"
```

Expected: one commit containing only the runbook.

---

### Task 5: Validate diagrams, paths, coverage, and secrets

**Files:**
- Create: `过程文件/验证开发文档.ps1`
- Produces: `过程文件/mermaid/*.mmd`
- Verify: `VOZEB-PRO-开发地图.md`
- Verify: `VOZEB-PRO-接口索引.md`
- Verify: `VOZEB-PRO-更新部署流程.md`

**Interfaces:**
- Consumes: all three final documents and the API inventory.
- Produces: explicit pass/fail evidence without modifying tracked source.

- [ ] **Step 1: Create a validation script**

The script must:

```text
extract every Mermaid code block from VOZEB-PRO-开发地图.md
require exactly six diagrams
write each diagram to 过程文件/mermaid/map-01.mmd through map-06.mmd
collect repository-relative Markdown file links and require Test-Path=true
compare Handler links in the interface index to api-route-inventory.json
load actual .env values in memory and fail if any nontrivial value occurs in a tracked document
fail on private-key headers, password assignments, access-key assignments, or token assignments
print only counts and pass/fail labels, never secret values
```

- [ ] **Step 2: Run structural validation**

```powershell
pwsh -NoProfile -File "过程文件/验证开发文档.ps1"
```

Expected:

```text
mermaid_blocks=6
broken_links=0
missing_routes=0
duplicate_routes=0
unknown_routes=0
secret_hits=0
```

- [ ] **Step 3: Validate every Mermaid diagram**

Check that Node.js and npx are available, then run Mermaid CLI for each extracted file:

```powershell
Get-ChildItem "过程文件/mermaid" -Filter *.mmd | ForEach-Object {
    npx --yes @mermaid-js/mermaid-cli -i $_.FullName -o ($_.FullName + ".svg") -b transparent
    if ($LASTEXITCODE -ne 0) { throw "Mermaid validation failed: $($_.Name)" }
}
```

Expected: six `.svg` files and no Mermaid parse errors. If npm access is unavailable, use an already installed `mmdc`; do not claim diagram validation from visual inspection alone.

- [ ] **Step 4: Run final Git checks**

```powershell
git diff --check
git status --short --branch
git log -5 --oneline --decorate
```

Expected: no uncommitted tracked changes, `main` ahead of `origin/main` only by the new documentation commits.

---

### Task 6: Push GitHub and synchronize remote documentation

**Files:**
- Push: all documentation commits to `origin/main`
- Update remotely: `/opt/blue-oem`
- Do not modify remotely: `/opt/blue-oem/.env`

**Interfaces:**
- Consumes: the verified local commits.
- Produces: matching Git commit IDs locally, on GitHub, and in the remote working tree while preserving running containers.

- [ ] **Step 1: Capture the remote container baseline**

Over SSH, record container names, image IDs, status, and start timestamps for the `blue-oem` Compose project without writing a tracked file.

Expected: App and PostgreSQL are healthy; Worker is running.

- [ ] **Step 2: Push the documentation commits**

```powershell
git push origin main
```

Expected: `origin/main` advances to the local `HEAD`.

- [ ] **Step 3: Pull documentation on the server**

Use the existing read-only deploy key configuration:

```text
ssh <remote>
git -C /opt/blue-oem status --short --branch
git -C /opt/blue-oem pull --ff-only
```

Expected: clean fast-forward; `.env` remains ignored and unchanged.

- [ ] **Step 4: Verify commit identity and no Docker restart**

Compare:

```text
local git rev-parse HEAD
origin/main SHA
remote git -C /opt/blue-oem rev-parse HEAD
```

Then compare container IDs and start timestamps with Step 1.

Expected: all Git SHAs match; container IDs/start timestamps are unchanged; `/api/health/live` remains healthy from inside the server.

- [ ] **Step 5: Final documentation handoff**

Report links to all three root documents, the API count, Mermaid validation count, Git commit, remote synchronization result, and the remaining Tencent Cloud security-group requirement for public port `3000` if it is still blocked.
