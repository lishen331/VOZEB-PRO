# VOZEB PRO 本地 Docker 启动 Implementation Plan

> **For agentic workers:** This plan is executed inline in the current session. Each checkbox is verified before moving to the next task.

**Goal:** 在本机从 VOZEB PRO 当前源码构建并启动 App、PostgreSQL 和 generation Worker，完成安装向导前的可访问与健康验证。

**Architecture:** 使用仓库已有的 `docker-compose.local.yml` 和 `Dockerfile`，不改业务代码。根目录 `.env` 只包含本地随机密钥和 PostgreSQL Compose 配置；对象存储保持关闭。启动后通过健康接口、PostgreSQL 检查、Worker 日志和 `/install` 页面验证运行链路。

**Tech Stack:** Docker Desktop、Docker Compose v2、Node 22 镜像、pnpm 11.9、Next.js standalone、PostgreSQL 16、FFmpeg、Sharp。

## Global Constraints

- 源码来自 `csyqlz/VOZEB-PRO` 的 `main`，本阶段不创建 fork/upstream 关系。
- 不修改业务源码，不写入真实模型、支付、SMTP、COS/OSS 或 COS/OSS 凭据。
- 本地应用使用 PostgreSQL Provider，媒体使用 Docker volume `vozeb-pro-data`。
- `.env` 只用于本机，不提交 Git；安装令牌、维护令牌和 Worker 令牌必须各自独立且至少 32 个字符。
- 不执行 `docker compose down -v`，避免删除数据库和媒体数据卷。

---

### Task 1: 生成本地工作副本

**Files:**
- Create: `C:\\CODE\\blue-oem\\` 中的源代码副本（来自 `过程文件\\vozeb-source`）
- Preserve: `C:\\CODE\\blue-oem\\过程文件\\` 作为中间审阅目录

**Interfaces:**
- Consumes: 已审阅的 `过程文件\\vozeb-source` Git 工作树。
- Produces: 项目根目录可执行的 Git 工作树，包含 `Dockerfile` 与 `docker-compose.local.yml`。

- [ ] **Step 1: Confirm destination is safe to populate**

Run:

```powershell
Get-ChildItem -Force C:\\CODE\\blue-oem
```

Expected: 只有 `过程文件` 等中间目录，不存在用户源码文件或 `.git`。

- [ ] **Step 2: Copy the reviewed source tree into the project root**

Run:

```powershell
robocopy C:\\CODE\\blue-oem\\过程文件\\vozeb-source C:\\CODE\\blue-oem /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /XD .git
```

Expected: 根目录出现 `web`、`docs`、`Dockerfile` 和 Compose 文件；命令返回码 `0` 到 `7` 均表示 Robocopy 成功或仅有复制差异。

- [ ] **Step 3: Initialize the independent local Git repository**

Run:

```powershell
Set-Location C:\\CODE\\blue-oem
Remove-Item -Recurse -Force .git -ErrorAction SilentlyContinue
git init -b main
git add .
git commit -m "chore: import VOZEB PRO for local development"
git remote -v
```

Expected: 新仓库只有本地 `main` 提交，`git remote -v` 没有输出。

### Task 2: Create a local-only Docker environment file

**Files:**
- Create: `C:\\CODE\\blue-oem\\.env`
- Reference: `C:\\CODE\\blue-oem\\.env.example`
- Verify: `C:\\CODE\\blue-oem\\.gitignore`

**Interfaces:**
- Consumes: Compose variable names in `docker-compose.local.yml`.
- Produces: App 可读取的 PostgreSQL、加密和内部 Worker 配置；对象存储开关保持默认关闭。

- [ ] **Step 1: Copy the example configuration**

Run:

```powershell
Copy-Item .env.example .env -Force
```

- [ ] **Step 2: Generate five independent local secrets**

Run:

```powershell
$localSecrets = 1..5 | ForEach-Object { [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant() }
```

Expected: Five different 64-character hexadecimal values.

- [ ] **Step 3: Write only local values into `.env`**

Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, `VOZEB_PRO_IMAGE=vozeb-pro:local`, `POSTGRES_PASSWORD` to the first secret, and use the next four secrets for `VOZEB_PRO_ENCRYPTION_KEY`, `VOZEB_PRO_INSTALL_TOKEN`, `VOZEB_PRO_MAINTENANCE_TOKEN`, and `VOZEB_PRO_WORKER_TOKEN`. Keep `VOZEB_PRO_DATABASE_PROVIDER=postgres`, `VOZEB_PRO_DATABASE_SSL=0`, and leave external storage fields unset.

Verify:

```powershell
Select-String -Path .env -Pattern '^(NEXT_PUBLIC_SITE_URL|VOZEB_PRO_IMAGE|POSTGRES_PASSWORD|VOZEB_PRO_ENCRYPTION_KEY|VOZEB_PRO_INSTALL_TOKEN|VOZEB_PRO_MAINTENANCE_TOKEN|VOZEB_PRO_WORKER_TOKEN|VOZEB_PRO_DATABASE_PROVIDER|VOZEB_PRO_DATABASE_SSL)='
git check-ignore .env
```

Expected: All required values are non-empty, no cloud credentials are present, and `.env` is ignored by Git.

### Task 3: Validate and build the local Compose topology

**Files:**
- Read-only: `C:\\CODE\\blue-oem\\docker-compose.local.yml`
- Read-only: `C:\\CODE\\blue-oem\\Dockerfile`

**Interfaces:**
- Consumes: `.env` and local source tree.
- Produces: `vozeb-pro:local` image and three Compose services.

- [ ] **Step 1: Render Compose configuration without starting services**

Run:

```powershell
docker compose -f docker-compose.local.yml config
```

Expected: Services `postgres`, `app`, and `generation-worker` render without missing-variable errors; the app points to `postgres:5432` and the worker points to `http://app:3000`.

- [ ] **Step 2: Build and start in detached mode**

Run:

```powershell
docker compose -f docker-compose.local.yml up -d --build
```

Expected: Image build completes with exit code `0`; all three containers are created.

- [ ] **Step 3: Confirm service state**

Run:

```powershell
docker compose -f docker-compose.local.yml ps
```

Expected: `postgres` is healthy, `app` is healthy after its start period, and `generation-worker` is running.

### Task 4: Verify runtime and installation boundary

**Files:**
- Read-only: `C:\\CODE\\blue-oem\\web\\src\\app\\api\\health\\live\\route.ts`
- Read-only: `C:\\CODE\\blue-oem\\web\\src\\app\\install\\page.tsx`

**Interfaces:**
- Consumes: Running Compose services.
- Produces: Verified local URL and install-ready database state; no administrator account is created automatically.

- [ ] **Step 1: Check application liveness**

Run:

```powershell
Invoke-WebRequest http://localhost:3000/api/health/live -UseBasicParsing
```

Expected: HTTP 200 with JSON containing `"status":"live"`.

- [ ] **Step 2: Check PostgreSQL readiness from the container**

Run:

```powershell
docker compose -f docker-compose.local.yml exec -T postgres pg_isready -U vozeb_pro -d vozeb_pro
```

Expected: `accepting connections`.

- [ ] **Step 3: Check install status**

Run:

```powershell
Invoke-WebRequest http://localhost:3000/api/install/status -UseBasicParsing
```

Expected: JSON reports a healthy PostgreSQL connection, schema not initialized, and first administrator required.

- [ ] **Step 4: Capture worker logs**

Run:

```powershell
docker compose -f docker-compose.local.yml logs --tail=100 generation-worker
```

Expected: Worker starts with a generated worker ID and does not report a missing/short Worker Token.

- [ ] **Step 5: Record the install URL and token handoff**

Open `http://localhost:3000/install` in the browser. The install token is read from the local `.env`; initialization and first-admin creation remain an explicit user action in the UI.

### Task 5: Final local handoff

**Files:**
- Modify: `C:\\CODE\\blue-oem\\过程文件\\` only for temporary inspection output if needed
- Verify: `C:\\CODE\\blue-oem\\.gitignore`, `C:\\CODE\\blue-oem\\git status`

- [ ] **Step 1: Confirm no secret or process artifact is tracked**

Run:

```powershell
git status --short
git ls-files .env
```

Expected: `.env` is not tracked; no generated logs, browser profiles, or temporary scripts appear in the repository root.

- [ ] **Step 2: Record repeatable update commands**

Use the following for each code change:

```powershell
docker compose -f docker-compose.local.yml up -d --build
docker compose -f docker-compose.local.yml ps
Invoke-WebRequest http://localhost:3000/api/health/live -UseBasicParsing
git add <changed-files>
git commit -m "<change description>"
```

Do not use `docker compose down -v`.

