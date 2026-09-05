# 测试服务器登录失败：课程表结构升级不兼容

## 1. 交接摘要

- 故障地址：`https://reddetail.gammablue-x.com`
- 故障时间：2026-08-31
- 用户现象：输入管理员账号密码后提示“登录失败，请稍后重试”
- 实际故障：登录接口返回 HTTP 500，不是用户名或密码校验失败
- PostgreSQL 错误：`42703: column "chapter_id" does not exist`
- 当前部署镜像对应提交：`6b4d9e0a6178a9e379e9906d1174d48e377457f5`
- 提交说明：`sync: deliver school course structure and materials (#20)`
- 影响范围：所有需要执行 PostgreSQL Schema 初始化的接口，不仅是登录
- 当前状态：只完成定位，尚未修改生产数据库，也未重置管理员账号

## 2. 已确认的线上证据

### 2.1 接口复现

浏览器实际请求结果：

| 请求 | 结果 |
| --- | --- |
| `POST /api/auth/login` | HTTP 500 |
| `GET /api/auth/session` | HTTP 500 |
| `GET /api/announcements` | HTTP 500 |
| `GET /api/public/gallery?limit=18&sort=random` | HTTP 500 |

登录接口最终返回的前端文案来自：

```ts
return NextResponse.json({ error: "登录失败，请稍后重试" }, { status: 500 });
```

该文案是未处理异常的统一兜底，不代表密码错误。

### 2.2 应用日志

应用容器在登录请求发生时记录：

```text
Login failed error: column "chapter_id" does not exist
code: '42703'
file: 'indexcmds.c'
routine: 'ComputeIndexAttrs'
```

后台任务和其他接口也持续出现相同错误，例如：

```text
Generation task recovery batch failed error: column "chapter_id" does not exist
Billing refund reconciliation batch failed ... column "chapter_id" does not exist
Audit log write failed error: column "chapter_id" does not exist
```

### 2.3 容器与部署版本

服务器应用容器处于 `healthy` 状态，但运行镜像为：

```text
ghcr.io/lishen331/vozeb-pro:sha-6b4d9e0a6178a9e379e9906d1174d48e377457f5
```

该 SHA 与 GitHub `develop` 当前最新提交一致。因此不是服务器没有拉到最新镜像，而是最新代码升级旧数据库时失败。

### 2.4 服务器数据库实际结构

数据库仍保留旧版课程模型：

```text
vozeb_pro_platform_courses.chapters     jsonb
vozeb_pro_platform_courses.attachments  jsonb
```

服务器不存在以下新版表：

```text
vozeb_pro_platform_course_chapters
vozeb_pro_platform_course_lessons
vozeb_pro_course_materials
```

服务器也不存在以下新版字段：

```text
vozeb_pro_platform_courses.deleted_at
vozeb_pro_platform_courses.deleted_by_user_id
vozeb_pro_teaching_assignments.chapter_id
vozeb_pro_teaching_assignments.lesson_id
```

现有数据量：

| 实体 | 数量 |
| --- | ---: |
| 课程 | 3 |
| 学校课程分配 | 1 |
| 开课记录 | 1 |
| 教学任务 | 1 |

3 个现有课程的旧 `chapters` 和 `attachments` 均为空数组。当前服务器没有需要转换的旧章节或课程附件数据，但迁移仍应保留旧字段，避免其他环境存在旧数据时被破坏。

## 3. 根因分析

### 3.1 数据模型发生了什么变化

提交 `6b4d9e0` 将课程的章节和附件从 `platform_courses` 内的 JSON 字段，改为规范化关系表：

```text
platform_courses
  -> platform_course_chapters
      -> platform_course_lessons
          -> course_materials
```

同时新增软删除字段和教学任务目标字段。

### 3.2 为什么现有 Schema SQL 无法升级旧数据库

新代码主要依赖：

```sql
CREATE TABLE IF NOT EXISTS ...
```

这个语句只会创建不存在的表。旧表已经存在时，它不会按照新的 `CREATE TABLE` 定义补充字段。

随后 SQL 直接创建新索引：

```sql
CREATE INDEX IF NOT EXISTS teaching_assignments_school_chapter_idx
ON teaching_assignments (school_id, chapter_id, updated_at DESC);
```

旧 `teaching_assignments` 表没有 `chapter_id`，因此 PostgreSQL 在创建索引时抛出 `42703`。

### 3.3 为什么课程升级错误会导致登录失败

数据库访问前会调用 `ensurePostgresSchema()`。该函数会在一个事务中执行完整的 `POSTGRESQL_SCHEMA_SQL`：

```text
任意数据库接口
  -> ensurePostgresSchema()
  -> initializePostgresSchema()
  -> 执行完整 Schema SQL
  -> 创建 chapter_id 索引失败
  -> 整个事务回滚
  -> 原始业务查询没有机会执行
  -> 接口返回 500
```

初始化失败后，全局 Schema Ready Promise 会被清除。后续请求会再次执行同一段错误 SQL，因此登录、会话、公告、作品广场和后台任务都会重复失败。

## 4. 建议修复方案

### 4.1 第一阶段：永久修复旧库升级路径

修改 `web/src/lib/server/database/schema-school-domain.ts`，严格按照以下顺序执行兼容升级：

1. 为已有 `platform_courses` 补充软删除字段。
2. 创建 `platform_course_chapters`。
3. 创建 `platform_course_lessons`。
4. 为 `school_course_assignments (course_id, id)` 创建唯一索引。
5. 创建 `course_materials`。
6. 为已有 `teaching_assignments` 补充 `chapter_id`、`lesson_id`。
7. 补充教学任务目标约束。
8. 最后创建依赖新字段的索引。

关键兼容 SQL 形态：

```sql
ALTER TABLE platform_courses
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE platform_courses
    ADD COLUMN IF NOT EXISTS deleted_by_user_id text REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE teaching_assignments
    ADD COLUMN IF NOT EXISTS chapter_id text;

ALTER TABLE teaching_assignments
    ADD COLUMN IF NOT EXISTS lesson_id text;
```

约束应通过可重复执行的 `DO $$ ... $$` 块添加，避免第二次初始化时报“约束已存在”。索引必须放在字段创建之后。

### 4.2 旧字段处理原则

本次修复不要立即删除：

```text
platform_courses.chapters
platform_courses.attachments
school_course_offerings.supplemental_resources
```

原因：

- 当前服务器字段为空，保留没有业务副作用。
- 其他开发或部署环境可能存在旧 JSON 数据。
- 删除字段属于不可逆操作，应在数据转换、核对和备份完成后单独实施。

### 4.3 迁移版本记录

建议增加独立迁移版本，例如：

```text
20260831_school_course_structure_upgrade
```

当前 `schema_migrations` 只记录版本，但 Schema 初始化仍会整段重复执行。短期可以继续采用幂等 `ALTER` 修复；中长期应把结构升级改为按版本顺序执行的真实 migration，避免单个功能的 DDL 阻断整个系统。

## 5. 测试要求

### 5.1 必须新增的回归测试

不能只在空数据库上测试。应增加“从上一版本升级”的 PostgreSQL 集成测试：

1. 创建旧版 `platform_courses` 和 `teaching_assignments` 结构。
2. 插入旧版课程、开课和教学任务数据。
3. 执行新版 `initializePostgresSchema()`。
4. 验证新增表全部存在。
5. 验证新增字段全部存在。
6. 验证旧数据仍然存在。
7. 再执行一次初始化，验证幂等性。
8. 初始化后执行用户查询或登录链路，验证课程迁移不会阻断认证。

建议至少覆盖：

```text
旧表存在但没有 chapter_id 时可以升级
旧表存在但没有 deleted_at 时可以升级
新 Schema 可重复执行两次
旧 JSON 字段和数据不会被删除
课程树相关新表和外键可正常写入
```

### 5.2 现有测试为什么没有发现

现有 `school-domain-schema.postgres.test.ts` 主要验证新建数据库后的约束行为，没有先建立旧版本结构再升级，所以 `CREATE TABLE IF NOT EXISTS` 的兼容缺陷没有被覆盖。

## 6. 线上恢复步骤

建议通过修复代码部署恢复，不建议只在生产库手工补一个 `chapter_id`，否则后续会继续遇到 `lesson_id`、`deleted_at` 或新表缺失。

推荐顺序：

1. 对 PostgreSQL 执行完整备份。
2. 在独立测试数据库中复制旧 Schema，验证升级测试。
3. 合并包含兼容迁移和测试的修复提交。
4. 构建并部署新镜像。
5. 等待应用和 generation worker 启动。
6. 调用 `/api/health/ready`，确认数据库 Schema 和 Worker 均正常。
7. 用浏览器真实登录管理员账号。
8. 验证课程管理、教学页面、公告和作品广场。
9. 检查应用日志不再出现 `chapter_id`、`lesson_id` 或 Schema 初始化异常。

如果业务要求立即恢复，可在备份后执行与代码修复完全一致的、经过评审的幂等迁移脚本，但仍必须随后合并永久代码修复，防止下次新环境部署再次发生。

## 7. 部署流程缺口

当前 staging 工作流部署后的检查地址是：

```text
/api/health/live
```

该接口只证明 Next.js 进程存活，不验证数据库 Schema，所以本次容器显示 healthy，GitHub Actions 部署也可能显示成功，但所有数据库业务接口都已经不可用。

项目已有数据库感知的检查接口：

```text
/api/health/ready
```

建议：

- Docker 容器自身继续使用 `/api/health/live` 作为 liveness，避免依赖短暂异常导致容器反复重启。
- GitHub Actions 部署验收改用 `/api/health/ready`。
- readiness 失败时输出 `docker compose ps` 和应用最近日志，但不得输出 Secret。
- 后续可增加一个不含凭据的认证依赖探针或最小数据库查询。

## 8. 验收标准

修复只有同时满足以下条件才算完成：

- [ ] 旧版数据库可无损升级到新版结构
- [ ] Schema 初始化连续执行两次均成功
- [ ] `/api/health/live` 返回 200
- [ ] `/api/health/ready` 返回 200，且 `database.schemaReady = true`
- [ ] `/api/auth/session` 不再返回 500
- [ ] 正确管理员账号可以登录
- [ ] 错误密码返回明确的 4xx，而不是 500
- [ ] 公告和作品广场接口不再因 Schema 初始化返回 500
- [ ] 课程列表、课程树、资料和教学任务功能可访问
- [ ] 应用及 Worker 日志不再出现 `column "chapter_id" does not exist`
- [ ] 现有课程、学校分配、开课记录和教学任务数量未减少
- [ ] 未删除旧 JSON 字段或其中可能存在的数据

## 9. 涉及文件

主要代码：

```text
web/src/lib/server/database/schema-school-domain.ts
web/src/lib/server/database/schema.ts
web/src/lib/server/database/postgres.ts
web/src/lib/server/database/school-domain-schema.postgres.test.ts
web/src/app/api/health/ready/route.ts
.github/workflows/staging-image.yml
```

其中登录接口本身不是根因，不建议修改：

```text
web/src/app/api/auth/login/route.ts
```

## 10. 明确不应采用的处理方式

- 不要重置管理员密码。请求尚未正常完成数据库认证流程。
- 不要只补 `chapter_id` 一个字段。缺失项不止一个。
- 不要删除或重建整个 PostgreSQL 数据库。
- 不要删除旧 JSON 字段来强行匹配新模型。
- 不要把异常改成前端“密码错误”来掩盖 HTTP 500。
- 不要继续只用 liveness 作为部署成功标准。
