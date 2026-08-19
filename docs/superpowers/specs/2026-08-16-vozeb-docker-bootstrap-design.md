# VOZEB PRO 本地 Docker 启动设计

## 目标

在本机使用当前源码启动 VOZEB PRO，验证应用、PostgreSQL 和生成 Worker 的基础运行链路，为后续二次开发提供可重复的本地环境。

本阶段不接入 COS/OSS，不写入真实模型、支付、SMTP 或对象存储凭据，也不创建 GitHub 私有仓库。

## 现有架构

- `web/` 是主应用，使用 Next.js App Router、React、TypeScript、Ant Design、Tailwind CSS、Zustand 和 TanStack Query。
- `web/src/app/` 提供公开页面、用户工作台和管理后台；`web/src/app/api/` 提供 Next.js Route Handler。
- Route Handler 负责 HTTP 入参、鉴权和 `{ code, data, msg }` 响应映射；`web/src/lib/server/` 负责业务服务、任务编排、模型 Provider、媒体和持久化。
- 默认数据库是 PostgreSQL 16。Repository 会根据 `VOZEB_PRO_DATABASE_PROVIDER` 选择 PostgreSQL 或文件 Provider；Docker 本地模式使用 PostgreSQL。
- `generation-worker` 独立领取持久化生成任务、发送心跳、轮询上游任务并处理退款维护，Worker 只接收内部 API 地址和 Worker Token。
- `docs/` 是独立文档站，本阶段不启动。

## Docker 拓扑

使用 `docker-compose.local.yml`，从当前源码构建 `vozeb-pro:local`，启动三个服务：

1. `postgres`：PostgreSQL 16，持久化到 `vozeb-pro-postgres`。
2. `app`：Next.js standalone 应用，映射到本机 `3000`，持久化 `/app/web/.data` 到 `vozeb-pro-data`。
3. `generation-worker`：使用同一镜像，通过内部网络访问 `app:3000`。

构建使用仓库 `Dockerfile` 的多阶段流程，包含 Node 22、pnpm、Next standalone、FFmpeg、CJK 字体和 Sharp Linux 运行库。

## 本地配置

- 从 `.env.example` 生成根目录 `.env`，将 `NEXT_PUBLIC_SITE_URL` 设为 `http://localhost:3000`。
- 为 PostgreSQL 密码、加密密钥、安装令牌、维护令牌和 Worker 令牌生成独立的本地随机值。
- `VOZEB_PRO_DATABASE_PROVIDER=postgres`、数据库 Host 使用 Compose 服务名 `postgres`，应用内部 Origin 使用 Compose 网络可达的应用地址。
- `.env` 只保留本机配置并加入 Git 忽略范围，不提交真实密钥。

## 安装与验证

1. 构建并启动 `docker compose -f docker-compose.local.yml up -d --build`。
2. 检查 Compose 状态、应用健康接口 `/api/health/live` 和 PostgreSQL `pg_isready`。
3. 打开 `/install`，使用安装令牌显式初始化表结构并创建首个管理员。
4. 再次检查根页面、登录页和 Worker 日志，确认服务可访问且 Worker 能连接应用。

模型渠道、支付、SMTP、COS/OSS 和真实生成请求留到二次开发或专门联调阶段。

## 对象存储边界

项目通过 AWS SDK S3 客户端实现通用 S3 兼容对象存储。管理后台支持 Endpoint、Region、Bucket、Prefix、Access Key、Secret Key 和 Path-style，可适配 AWS S3、阿里云 OSS、腾讯云 COS、MinIO 等服务。配置保存在 PostgreSQL 的 `object_storage_settings` 中，凭据使用 `VOZEB_PRO_ENCRYPTION_KEY` 加密。关闭时新媒体写本地数据目录；开启时新媒体写对象存储，历史媒体按登记的 Provider 读取。

本地启动阶段保持外部存储关闭并使用 `vozeb-pro-data`，避免误上传或污染云端数据。

## 后续开发流程

后续将把本地副本初始化为与上游无 fork/upstream 关系的独立 Git 仓库，推送到用户的私有 GitHub 仓库。每次变更遵循：本地修改 -> 本地测试/类型检查 -> 本地 Docker 重建验证 -> 推送私有仓库 -> 远程环境拉取对应版本并更新容器。远程服务器地址和仓库名称待用户后续提供。
