# VOZEB PRO 接口索引

> 生成日期：2026-08-18。枚举来源仅为 `web/src/app/api/**/route.ts`；当前共 **203** 个 Route 文件。每个文件一行，多种 HTTP 方法合并显示。

## 使用说明

- 本索引用于定位入口，不替代请求/响应类型定义；修改接口时必须继续阅读 Handler 和所列 Service。
- 动态路径保留源码写法，例如 `[id]`、`[...path]`。Handler 列链接是覆盖校验的唯一标识。
- `主要服务/Store` 只列最直接的领域入口；通用安全、响应和审计 Helper 不重复展开。
- `混合` 接口必须查看用途说明和实现：可能同时接受用户 Session 与 Worker/签名，也可能按请求分支要求不同身份；`/api/install/initialize` 使用一次性安装令牌。
- 新增学校域接口统一返回 `{ code, data, msg }`：成功时 `code=0`、`msg="ok"`，失败时 `code` 为 HTTP 状态、`data=null`；表中所列类型均指成功响应的 `data`。

## 权限标记

| 标记 | 实现边界 |
| --- | --- |
| 公开 | 操作前不要求 Session 或运行 Token；仍可能有来源、限流、所有权可见性或安装状态限制 |
| 用户 | 必须取得当前 Session 用户，并拒绝匿名请求 |
| 管理员 | 必须通过管理员角色和细粒度职责权限检查 |
| Worker | 仅接受独立 Worker Bearer Token |
| 维护 | 仅接受独立维护 Bearer Token |
| Webhook | 使用支付商或模型渠道的回调签名/密钥校验 |
| 混合 | 同时支持多种实现边界或分支策略；以 Handler 为准 |

## 接口总览

- Route 文件：**203**
- 方法出现次数：DELETE 28、GET 113、HEAD 6、PATCH 37、POST 104、PUT 1
- 一级域：`admin` 63、`agent` 8、`ai` 1、`announcements` 1、`audio-tasks` 2、`auth` 13、`billing` 11、`canvas` 3、`cdk` 1、`check-in` 1、`community` 1、`create` 1、`creative` 6、`drama` 12、`generation-log-assets` 1、`generation-logs` 1、`generation-webhooks` 1、`health` 2、`image-tasks` 2、`install` 2、`library-assets` 2、`maintenance` 6、`media-assets` 1、`media-proxy` 1、`my-prompts` 2、`notifications` 3、`points` 1、`prompts` 1、`public` 14、`reference-assets` 2、`referrals` 1、`school` 13、`site-icon` 1、`teaching` 10、`text-tasks` 2、`video-generation-tasks` 1、`video-tasks` 2、`works` 7

## 按业务域索引

### `admin`（64）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/admin/account-deletion-requests` | 管理员 | [route.ts](web/src/app/api/admin/account-deletion-requests/route.ts) | [account-deletion-request-service](web/src/lib/server/account-deletion-request-service.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 账号注销申请：查询 |
| PATCH | `/api/admin/account-deletion-requests/[id]` | 管理员 | [route.ts](web/src/app/api/admin/account-deletion-requests/[id]/route.ts) | [account-deletion-request-service](web/src/lib/server/account-deletion-request-service.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 账号注销申请 / 单项：更新 |
| GET | `/api/admin/agent-readiness` | 管理员 | [route.ts](web/src/app/api/admin/agent-readiness/route.ts) | [agent-readiness](web/src/lib/server/agent-readiness.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / Agent 就绪状态：查询 |
| POST | `/api/admin/agent-skills/import` | 管理员 | [route.ts](web/src/app/api/admin/agent-skills/import/route.ts) | [agent-skill-import-refiner](web/src/lib/server/agent-skill-import-refiner.ts)<br>[github-agent-skill-import](web/src/lib/server/github-agent-skill-import.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / Agent 技能 / 导入：提交/执行 |
| GET, POST | `/api/admin/announcements` | 管理员 | [route.ts](web/src/app/api/admin/announcements/route.ts) | [store](web/src/lib/auth/store.ts) | PostgreSQL、公开内容/站点设置 | 管理后台 / 公告：查询、提交/执行 |
| DELETE, PATCH | `/api/admin/announcements/[id]` | 管理员 | [route.ts](web/src/app/api/admin/announcements/[id]/route.ts) | [store](web/src/lib/auth/store.ts) | PostgreSQL、公开内容/站点设置 | 管理后台 / 公告 / 单项：更新、删除 |
| GET | `/api/admin/audit-logs` | 管理员 | [route.ts](web/src/app/api/admin/audit-logs/route.ts) | [admin-permissions](web/src/lib/admin-permissions.ts)<br>[session](web/src/lib/auth/session.ts)<br>[audit-log-store](web/src/lib/server/audit-log-store.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 审计日志：查询 |
| POST | `/api/admin/backup` | 管理员 | [route.ts](web/src/app/api/admin/backup/route.ts) | [admin-backup-store](web/src/lib/server/admin-backup-store.ts)<br>[admin-backup-policy](web/src/lib/server/admin-backup-policy.ts)<br>[data-adapter](web/src/lib/server/data-adapter.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 业务备份：提交/执行 |
| POST | `/api/admin/backup/export` | 管理员 | [route.ts](web/src/app/api/admin/backup/export/route.ts) | [admin-backup-store](web/src/lib/server/admin-backup-store.ts)<br>[admin-backup-policy](web/src/lib/server/admin-backup-policy.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 业务备份 / 导出：提交/执行 |
| GET, POST | `/api/admin/billing/coupon-templates` | 管理员 | [route.ts](web/src/app/api/admin/billing/coupon-templates/route.ts) | [coupon-service](web/src/lib/server/coupon-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 计费 / 优惠券模板：查询、提交/执行 |
| DELETE, PATCH | `/api/admin/billing/coupon-templates/[id]` | 管理员 | [route.ts](web/src/app/api/admin/billing/coupon-templates/[id]/route.ts) | [coupon-service](web/src/lib/server/coupon-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 计费 / 优惠券模板 / 单项：更新、删除 |
| POST | `/api/admin/billing/coupons/grant` | 管理员 | [route.ts](web/src/app/api/admin/billing/coupons/grant/route.ts) | [coupon-service](web/src/lib/server/coupon-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 计费 / 优惠券 / 发放：提交/执行 |
| GET | `/api/admin/billing/orders` | 管理员 | [route.ts](web/src/app/api/admin/billing/orders/route.ts) | [billing-service](web/src/lib/server/billing-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 计费 / 订单：查询 |
| POST | `/api/admin/billing/orders/[id]/close` | 管理员 | [route.ts](web/src/app/api/admin/billing/orders/[id]/close/route.ts) | [billing-service](web/src/lib/server/billing-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 计费 / 订单 / 单项 / 关闭：提交/执行 |
| POST | `/api/admin/billing/orders/[id]/complete` | 管理员 | [route.ts](web/src/app/api/admin/billing/orders/[id]/complete/route.ts) | [billing-service](web/src/lib/server/billing-service.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 计费 / 订单 / 单项 / 完成：提交/执行 |
| POST | `/api/admin/billing/orders/[id]/refund` | 管理员 | [route.ts](web/src/app/api/admin/billing/orders/[id]/refund/route.ts) | [billing-service](web/src/lib/server/billing-service.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 计费 / 订单 / 单项 / 退款：提交/执行 |
| GET, PATCH | `/api/admin/billing/payment-config` | 管理员 | [route.ts](web/src/app/api/admin/billing/payment-config/route.ts) | [payment-config-store](web/src/lib/server/payment-config-store.ts)<br>[billing-errors](web/src/lib/server/billing-errors.ts)<br>[payment-config-status](web/src/lib/server/payment-config-status.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 计费 / 支付配置：查询、更新 |
| GET, POST | `/api/admin/billing/products` | 管理员 | [route.ts](web/src/app/api/admin/billing/products/route.ts) | [billing-service](web/src/lib/server/billing-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 计费 / 商品：查询、提交/执行 |
| DELETE, PATCH | `/api/admin/billing/products/[id]` | 管理员 | [route.ts](web/src/app/api/admin/billing/products/[id]/route.ts) | [billing-service](web/src/lib/server/billing-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 计费 / 商品 / 单项：更新、删除 |
| GET, POST | `/api/admin/billing/promotions` | 管理员 | [route.ts](web/src/app/api/admin/billing/promotions/route.ts) | [promotion-service](web/src/lib/server/promotion-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 计费 / 促销：查询、提交/执行 |
| DELETE, PATCH | `/api/admin/billing/promotions/[id]` | 管理员 | [route.ts](web/src/app/api/admin/billing/promotions/[id]/route.ts) | [promotion-service](web/src/lib/server/promotion-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 计费 / 促销 / 单项：更新、删除 |
| GET, POST | `/api/admin/billing/reconciliation` | 管理员 | [route.ts](web/src/app/api/admin/billing/reconciliation/route.ts) | [payment-reconciliation-service](web/src/lib/server/payment-reconciliation-service.ts)<br>[billing-errors](web/src/lib/server/billing-errors.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 计费 / 对账：查询、提交/执行 |
| GET | `/api/admin/billing/summary` | 管理员 | [route.ts](web/src/app/api/admin/billing/summary/route.ts) | [billing-service](web/src/lib/server/billing-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 计费 / 汇总：查询 |
| DELETE, GET, POST | `/api/admin/cdk` | 管理员 | [route.ts](web/src/app/api/admin/cdk/route.ts) | [store](web/src/lib/auth/store.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 兑换码：查询、删除、提交/执行 |
| DELETE, PATCH | `/api/admin/cdk/[id]` | 管理员 | [route.ts](web/src/app/api/admin/cdk/[id]/route.ts) | [store](web/src/lib/auth/store.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 兑换码 / 单项：更新、删除 |
| POST | `/api/admin/channel-protocol-draft` | 管理员 | [route.ts](web/src/app/api/admin/channel-protocol-draft/route.ts) | [channel-protocol-assistant](web/src/lib/server/channel-protocol-assistant.ts) | PostgreSQL、加密渠道配置、模型上游 | 管理后台 / 渠道协议草案：提交/执行 |
| GET, POST | `/api/admin/commercial-orders` | 管理员（`education.manage`） | [route.ts](web/src/app/api/admin/commercial-orders/route.ts) | [commercial-order-service](web/src/lib/server/commercial-order-service.ts) | 学校域 PostgreSQL/文件 Provider、脱敏审计 | 分页查询 `PageResult<AdminCommercialOrder>`；创建并返回含内部金额的 `AdminCommercialOrder` |
| GET, PATCH | `/api/admin/commercial-orders/[id]` | 管理员（`education.manage`） | [route.ts](web/src/app/api/admin/commercial-orders/[id]/route.ts) | [commercial-order-service](web/src/lib/server/commercial-order-service.ts) | 学校域 PostgreSQL/文件 Provider、事务/CAS、脱敏审计 | GET 返回 `{ order: AdminCommercialOrder; deliveries: PageResult<CommercialOrderDelivery> }`；PATCH 更新、分配或取消并返回 `AdminCommercialOrder` |
| POST | `/api/admin/commercial-orders/[id]/review` | 管理员（`education.manage`） | [route.ts](web/src/app/api/admin/commercial-orders/[id]/review/route.ts) | [commercial-order-service](web/src/lib/server/commercial-order-service.ts) | 学校域 PostgreSQL/文件 Provider、事务/CAS、脱敏审计 | 退回修改或验收，返回 `AdminCommercialOrder` |
| GET, POST | `/api/admin/courses` | 管理员（`education.manage`） | [route.ts](web/src/app/api/admin/courses/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts) | 学校域 PostgreSQL/文件 Provider、脱敏审计 | 分页查询 `PageResult<PlatformCourse>`；创建并返回 `PlatformCourse` |
| GET, PATCH | `/api/admin/courses/[id]` | 管理员（`education.manage`） | [route.ts](web/src/app/api/admin/courses/[id]/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts) | 学校域 PostgreSQL/文件 Provider、脱敏审计 | 查询或更新课程，返回 `PlatformCourse` |
| POST | `/api/admin/courses/[id]/schools` | 管理员（`education.manage`） | [route.ts](web/src/app/api/admin/courses/[id]/schools/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts) | 学校域 PostgreSQL/文件 Provider、脱敏审计 | 分配课程到学校，返回 `SchoolCourseAssignment[]` |
| DELETE, GET | `/api/admin/generation-assets` | 管理员 | [route.ts](web/src/app/api/admin/generation-assets/route.ts) | [local-media-storage](web/src/lib/server/local-media-storage.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 管理后台 / 生成资产：查询、删除 |
| DELETE, GET | `/api/admin/generation-logs` | 管理员 | [route.ts](web/src/app/api/admin/generation-logs/route.ts) | [generation-log-store](web/src/lib/server/generation-log-store.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 生成日志：查询、删除 |
| GET | `/api/admin/generation-operations` | 管理员 | [route.ts](web/src/app/api/admin/generation-operations/route.ts) | [generation-operations-service](web/src/lib/server/generation-operations-service.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 生成运维：查询 |
| POST | `/api/admin/generation-operations/[type]/[id]/review` | 管理员 | [route.ts](web/src/app/api/admin/generation-operations/[type]/[id]/review/route.ts) | [generation-task-review-service](web/src/lib/server/generation-task-review-service.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 生成运维 / 指定任务类型 / 单项 / 审核：提交/执行 |
| GET | `/api/admin/generation-overview` | 管理员 | [route.ts](web/src/app/api/admin/generation-overview/route.ts) | [generation-overview-service](web/src/lib/server/generation-overview-service.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 生成概览：查询 |
| POST | `/api/admin/mail/test` | 管理员 | [route.ts](web/src/app/api/admin/mail/test/route.ts) | [store](web/src/lib/auth/store.ts)<br>[smtp](web/src/lib/mail/smtp.ts) | PostgreSQL、SMTP | 管理后台 / 邮件 / 测试：提交/执行 |
| POST | `/api/admin/models` | 管理员 | [route.ts](web/src/app/api/admin/models/route.ts) | [admin-channel-config](web/src/lib/server/admin-channel-config.ts)<br>[admin-model-catalog](web/src/lib/server/admin-model-catalog.ts)<br>[provider-task-config](web/src/lib/server/provider-task-config.ts) | PostgreSQL、加密渠道配置、模型上游 | 管理后台 / 模型目录：提交/执行 |
| GET, PATCH, POST | `/api/admin/object-storage` | 管理员 | [route.ts](web/src/app/api/admin/object-storage/route.ts) | [object-storage-service](web/src/lib/server/object-storage-service.ts)<br>[object-storage-config](web/src/lib/server/object-storage-config.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 管理后台 / 对象存储：查询、更新、提交/执行 |
| DELETE, GET | `/api/admin/object-storage/files` | 管理员 | [route.ts](web/src/app/api/admin/object-storage/files/route.ts) | [object-storage-service](web/src/lib/server/object-storage-service.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 管理后台 / 对象存储 / 文件：查询、删除 |
| GET | `/api/admin/object-storage/files/preview` | 管理员 | [route.ts](web/src/app/api/admin/object-storage/files/preview/route.ts) | [object-storage-service](web/src/lib/server/object-storage-service.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 管理后台 / 对象存储 / 文件 / 预览：查询 |
| POST | `/api/admin/object-storage/sync` | 管理员 | [route.ts](web/src/app/api/admin/object-storage/sync/route.ts) | [object-storage-service](web/src/lib/server/object-storage-service.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 管理后台 / 对象存储 / 迁移同步：提交/执行 |
| GET, POST | `/api/admin/prompts` | 管理员 | [route.ts](web/src/app/api/admin/prompts/route.ts) | [store](web/src/lib/auth/store.ts)<br>[store](web/src/lib/prompts/store.ts) | PostgreSQL、公开内容/站点设置 | 管理后台 / 提示词：查询、提交/执行 |
| DELETE, PATCH | `/api/admin/prompts/[id]` | 管理员 | [route.ts](web/src/app/api/admin/prompts/[id]/route.ts) | [store](web/src/lib/auth/store.ts)<br>[store](web/src/lib/prompts/store.ts) | PostgreSQL、公开内容/站点设置 | 管理后台 / 提示词 / 单项：更新、删除 |
| GET, PATCH | `/api/admin/referrals` | 管理员 | [route.ts](web/src/app/api/admin/referrals/route.ts) | [referral-service](web/src/lib/server/referral-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 邀请返利：查询、更新 |
| GET | `/api/admin/referrals/relationships` | 管理员 | [route.ts](web/src/app/api/admin/referrals/relationships/route.ts) | [referral-service](web/src/lib/server/referral-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 邀请返利 / 邀请关系：查询 |
| PATCH | `/api/admin/referrals/relationships/[id]` | 管理员 | [route.ts](web/src/app/api/admin/referrals/relationships/[id]/route.ts) | [referral-service](web/src/lib/server/referral-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 邀请返利 / 邀请关系 / 单项：更新 |
| GET | `/api/admin/referrals/rewards` | 管理员 | [route.ts](web/src/app/api/admin/referrals/rewards/route.ts) | [referral-service](web/src/lib/server/referral-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 邀请返利 / 奖励：查询 |
| POST | `/api/admin/referrals/settle` | 管理员 | [route.ts](web/src/app/api/admin/referrals/settle/route.ts) | [referral-service](web/src/lib/server/referral-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 邀请返利 / 结算：提交/执行 |
| GET, POST | `/api/admin/schools` | 管理员（`education.manage`） | [route.ts](web/src/app/api/admin/schools/route.ts) | [school-tenant-service](web/src/lib/server/school-tenant-service.ts) | 学校域 PostgreSQL/文件 Provider、脱敏审计 | 分页查询 `PageResult<SchoolSummary>`；创建学校及首位管理员，返回 `SchoolDetail` |
| GET, PATCH | `/api/admin/schools/[id]` | 管理员（`education.manage`） | [route.ts](web/src/app/api/admin/schools/[id]/route.ts) | [school-tenant-service](web/src/lib/server/school-tenant-service.ts) | 学校域 PostgreSQL/文件 Provider、脱敏审计 | 查询或更新学校，返回 `SchoolDetail` |
| GET, PATCH | `/api/admin/settings` | 管理员 | [route.ts](web/src/app/api/admin/settings/route.ts) | [admin-channel-config](web/src/lib/server/admin-channel-config.ts)<br>[site-metadata](web/src/lib/server/site-metadata.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、加密渠道配置、模型上游 | 管理后台 / 系统设置：查询、更新 |
| POST | `/api/admin/settings/channels/[id]/api-key` | 管理员 | [route.ts](web/src/app/api/admin/settings/channels/[id]/api-key/route.ts) | [admin-channel-config](web/src/lib/server/admin-channel-config.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、加密渠道配置、模型上游 | 管理后台 / 系统设置 / 模型渠道 / 单项 / API Key：提交/执行 |
| GET, POST | `/api/admin/users` | 管理员 | [route.ts](web/src/app/api/admin/users/route.ts) | [store](web/src/lib/auth/store.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 用户：查询、提交/执行 |
| DELETE, PATCH | `/api/admin/users/[id]` | 管理员 | [route.ts](web/src/app/api/admin/users/[id]/route.ts) | [admin-user-deletion-service](web/src/lib/server/admin-user-deletion-service.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 用户 / 单项：更新、删除 |
| GET | `/api/admin/work-cases` | 管理员 | [route.ts](web/src/app/api/admin/work-cases/route.ts) | [work-governance-service](web/src/lib/server/work-governance-service.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 作品治理案件：查询 |
| POST | `/api/admin/work-cases/[id]/resolve` | 管理员 | [route.ts](web/src/app/api/admin/work-cases/[id]/resolve/route.ts) | [work-governance-service](web/src/lib/server/work-governance-service.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 作品治理案件 / 单项 / 处理：提交/执行 |
| GET | `/api/admin/works` | 管理员 | [route.ts](web/src/app/api/admin/works/route.ts) | [work-publication-service](web/src/lib/server/work-publication-service.ts) | PostgreSQL、作品与社区数据 | 管理后台 / 作品：查询 |
| DELETE | `/api/admin/works/[id]` | 管理员 | [route.ts](web/src/app/api/admin/works/[id]/route.ts) | [work-publication-service](web/src/lib/server/work-publication-service.ts) | PostgreSQL、作品与社区数据 | 管理后台 / 作品 / 单项：删除 |
| POST | `/api/admin/works/[id]/feature` | 管理员 | [route.ts](web/src/app/api/admin/works/[id]/feature/route.ts) | [work-governance-service](web/src/lib/server/work-governance-service.ts) | PostgreSQL、作品与社区数据 | 管理后台 / 作品 / 单项 / 精选：提交/执行 |
| PATCH | `/api/admin/works/[id]/pull-film` | 管理员（`content.manage`） | [route.ts](web/src/app/api/admin/works/[id]/pull-film/route.ts) | [public-work-process-service](web/src/lib/server/public-work-process-service.ts) | PostgreSQL、版本绑定拉片快照、脱敏审计 | 为当前已审核公开 Canvas/短剧版本启用或关闭拉片；返回状态与版本 ID，不返回完整快照 |
| POST | `/api/admin/works/[id]/review` | 管理员 | [route.ts](web/src/app/api/admin/works/[id]/review/route.ts) | [work-publication-service](web/src/lib/server/work-publication-service.ts) | PostgreSQL、作品与社区数据 | 管理后台 / 作品 / 单项 / 审核：提交/执行 |
| POST | `/api/admin/works/[id]/take-down` | 管理员 | [route.ts](web/src/app/api/admin/works/[id]/take-down/route.ts) | [work-publication-service](web/src/lib/server/work-publication-service.ts) | PostgreSQL、作品与社区数据 | 管理后台 / 作品 / 单项 / 下架：提交/执行 |

### `agent`（8）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/agent/prompt-optimization` | 混合 | [route.ts](web/src/app/api/agent/prompt-optimization/route.ts) | [prompt-optimization-service](web/src/lib/server/prompt-optimization-service.ts)<br>[store](web/src/lib/auth/store.ts)<br>[create-agent-prompt](web/src/lib/create-agent-prompt.ts) | PostgreSQL、生成任务、模型上游 | Agent / 提示词优化：提交/执行 |
| POST | `/api/agent/review` | 用户 | [route.ts](web/src/app/api/agent/review/route.ts) | [creative-review-service](web/src/lib/server/creative-review-service.ts)<br>[store](web/src/lib/auth/store.ts)<br>[creative-agent-contract](web/src/lib/creative-agent-contract.ts) | PostgreSQL、生成任务、模型上游 | Agent / 审核：提交/执行 |
| GET, POST | `/api/agent/runs` | 混合 | [route.ts](web/src/app/api/agent/runs/route.ts) | [agent-run-store](web/src/lib/server/agent-run-store.ts)<br>[creative-runtime-store](web/src/lib/server/creative-runtime-store.ts)<br>[generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts) | PostgreSQL、生成任务、模型上游 | Agent / 运行：查询、提交/执行 |
| GET | `/api/agent/runs/[id]` | 混合 | [route.ts](web/src/app/api/agent/runs/[id]/route.ts) | [agent-run-store](web/src/lib/server/agent-run-store.ts)<br>[agent-run-public](web/src/lib/server/agent-run-public.ts) | PostgreSQL、生成任务、模型上游 | Agent / 运行 / 单项：查询 |
| POST | `/api/agent/runs/[id]/[action]` | 混合 | [route.ts](web/src/app/api/agent/runs/[id]/[action]/route.ts) | [agent-run-store](web/src/lib/server/agent-run-store.ts)<br>[generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts)<br>[generation-task-store](web/src/lib/server/generation-task-store.ts) | PostgreSQL、生成任务、模型上游 | Agent / 运行 / 单项 / 指定动作：提交/执行 |
| GET | `/api/agent/runs/[id]/events` | 用户 | [route.ts](web/src/app/api/agent/runs/[id]/events/route.ts) | [agent-run-store](web/src/lib/server/agent-run-store.ts)<br>[creative-runtime-store](web/src/lib/server/creative-runtime-store.ts)<br>[generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts) | PostgreSQL、生成任务、模型上游 | Agent / 运行 / 单项 / 事件：查询 |
| POST | `/api/agent/runs/[id]/tasks/[taskId]/retry` | 混合 | [route.ts](web/src/app/api/agent/runs/[id]/tasks/[taskId]/retry/route.ts) | [agent-run-store](web/src/lib/server/agent-run-store.ts)<br>[generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts)<br>[generation-task-store](web/src/lib/server/generation-task-store.ts) | PostgreSQL、生成任务、模型上游 | Agent / 运行 / 单项 / 任务 / 指定任务 / 重试：提交/执行 |
| GET | `/api/agent/skills` | 用户 | [route.ts](web/src/app/api/agent/skills/route.ts) | [store](web/src/lib/auth/store.ts)<br>[store-types](web/src/lib/auth/store-types.ts) | PostgreSQL、生成任务、模型上游 | Agent / 技能：查询 |

### `ai`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| DELETE, GET, HEAD, PATCH, POST, PUT | `/api/ai/system/[channelId]/[...path]` | 混合 | [route.ts](web/src/app/api/ai/system/[channelId]/[...path]/route.ts) | [media-proxy-service](web/src/lib/server/media-proxy-service.ts)<br>[generation-errors](web/src/lib/server/generation-errors.ts)<br>[generation-media-access](web/src/lib/server/generation-media-access.ts) | 模型上游、积分、媒体代理 | 模型代理 / 系统渠道 / 指定渠道 / 指定路径：查询、读取元数据、更新、删除、提交/执行、替换 |

### `announcements`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/announcements` | 公开 | [route.ts](web/src/app/api/announcements/route.ts) | [store](web/src/lib/auth/store.ts) | PostgreSQL、公开内容/站点设置 | 公告：查询 |

### `audio-tasks`（2）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/audio-tasks` | 混合 | [route.ts](web/src/app/api/audio-tasks/route.ts) | [audio-task-store](web/src/lib/server/audio-task-store.ts)<br>[generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts)<br>[generation-task-store](web/src/lib/server/generation-task-store.ts) | PostgreSQL、积分、模型上游、媒体 | 音频任务：提交/执行 |
| GET, PATCH | `/api/audio-tasks/[id]` | 混合 | [route.ts](web/src/app/api/audio-tasks/[id]/route.ts) | [audio-task-store](web/src/lib/server/audio-task-store.ts)<br>[generation-task-cancellation-service](web/src/lib/server/generation-task-cancellation-service.ts)<br>[generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts) | PostgreSQL、积分、模型上游、媒体 | 音频任务 / 单项：查询、更新 |

### `auth`（13）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| DELETE, GET, POST | `/api/auth/account-deletion` | 用户 | [route.ts](web/src/app/api/auth/account-deletion/route.ts) | [account-deletion-request-service](web/src/lib/server/account-deletion-request-service.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、Session Cookie、审计 | 认证 / 账号注销：查询、删除、提交/执行 |
| POST | `/api/auth/avatar` | 用户 | [route.ts](web/src/app/api/auth/avatar/route.ts) | [profile-avatar-service](web/src/lib/server/profile-avatar-service.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 认证 / 头像：提交/执行 |
| GET | `/api/auth/data-export` | 用户 | [route.ts](web/src/app/api/auth/data-export/route.ts) | [user-data-export-service](web/src/lib/server/user-data-export-service.ts) | PostgreSQL、Session Cookie、审计 | 认证 / 用户数据导出：查询 |
| POST | `/api/auth/email-code` | 混合 | [route.ts](web/src/app/api/auth/email-code/route.ts) | [store](web/src/lib/auth/store.ts)<br>[smtp](web/src/lib/mail/smtp.ts) | PostgreSQL、SMTP、限流 | 认证 / 邮件验证码：提交/执行 |
| POST | `/api/auth/login` | 公开 | [route.ts](web/src/app/api/auth/login/route.ts) | [admin-mfa-service](web/src/lib/server/admin-mfa-service.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、Session Cookie、审计 | 认证 / 登录：提交/执行 |
| GET | `/api/auth/login-events` | 用户 | [route.ts](web/src/app/api/auth/login-events/route.ts) | [session](web/src/lib/auth/session.ts)<br>[audit-log-store](web/src/lib/server/audit-log-store.ts) | PostgreSQL、Session Cookie、审计 | 认证 / 登录事件：查询 |
| POST | `/api/auth/logout` | 公开 | [route.ts](web/src/app/api/auth/logout/route.ts) | [session](web/src/lib/auth/session.ts)<br>[audit-log-store](web/src/lib/server/audit-log-store.ts) | PostgreSQL、Session Cookie、审计 | 认证 / 退出登录：提交/执行 |
| DELETE, PATCH, POST | `/api/auth/mfa` | 用户 | [route.ts](web/src/app/api/auth/mfa/route.ts) | [admin-mfa-service](web/src/lib/server/admin-mfa-service.ts)<br>[store](web/src/lib/auth/store.ts)<br>[store-types](web/src/lib/auth/store-types.ts) | PostgreSQL、Session Cookie、审计 | 认证 / 多因素认证：更新、删除、提交/执行 |
| PATCH | `/api/auth/password` | 用户 | [route.ts](web/src/app/api/auth/password/route.ts) | [store](web/src/lib/auth/store.ts) | PostgreSQL、Session Cookie、审计 | 认证 / 密码：更新 |
| POST | `/api/auth/password/reset` | 公开 | [route.ts](web/src/app/api/auth/password/reset/route.ts) | [store](web/src/lib/auth/store.ts) | PostgreSQL、Session Cookie、审计 | 认证 / 密码 / 重置：提交/执行 |
| PATCH | `/api/auth/profile` | 用户 | [route.ts](web/src/app/api/auth/profile/route.ts) | [store](web/src/lib/auth/store.ts) | PostgreSQL、Session Cookie、审计 | 认证 / 个人资料：更新 |
| POST | `/api/auth/register` | 公开 | [route.ts](web/src/app/api/auth/register/route.ts) | [referral-service](web/src/lib/server/referral-service.ts)<br>[install-status](web/src/lib/server/install-status.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、Session Cookie、审计 | 认证 / 注册：提交/执行 |
| GET | `/api/auth/session` | 公开 | [route.ts](web/src/app/api/auth/session/route.ts) | [install-status](web/src/lib/server/install-status.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、Session Cookie、审计 | 认证 / 会话与公开配置：查询 |

### `billing`（11）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/billing/coupons` | 用户 | [route.ts](web/src/app/api/billing/coupons/route.ts) | [coupon-service](web/src/lib/server/coupon-service.ts) | PostgreSQL、积分/商业事务 | 计费 / 优惠券：查询 |
| POST | `/api/billing/coupons/claim` | 用户 | [route.ts](web/src/app/api/billing/coupons/claim/route.ts) | [coupon-service](web/src/lib/server/coupon-service.ts) | PostgreSQL、积分/商业事务 | 计费 / 优惠券 / 领取：提交/执行 |
| GET, POST | `/api/billing/orders` | 用户 | [route.ts](web/src/app/api/billing/orders/route.ts) | [billing-service](web/src/lib/server/billing-service.ts) | PostgreSQL、积分/商业事务 | 计费 / 订单：查询、提交/执行 |
| GET | `/api/billing/orders/[id]` | 用户 | [route.ts](web/src/app/api/billing/orders/[id]/route.ts) | [billing-service](web/src/lib/server/billing-service.ts) | PostgreSQL、积分/商业事务 | 计费 / 订单 / 单项：查询 |
| POST | `/api/billing/orders/[id]/cancel` | 用户 | [route.ts](web/src/app/api/billing/orders/[id]/cancel/route.ts) | [billing-service](web/src/lib/server/billing-service.ts) | PostgreSQL、积分/商业事务 | 计费 / 订单 / 单项 / 取消：提交/执行 |
| POST | `/api/billing/orders/[id]/checkout` | 用户 | [route.ts](web/src/app/api/billing/orders/[id]/checkout/route.ts) | [billing-service](web/src/lib/server/billing-service.ts)<br>[payment-checkout-service](web/src/lib/server/payment-checkout-service.ts) | PostgreSQL、积分/商业事务 | 计费 / 订单 / 单项 / 结算：提交/执行 |
| GET | `/api/billing/orders/[id]/events` | 用户 | [route.ts](web/src/app/api/billing/orders/[id]/events/route.ts) | [billing-service](web/src/lib/server/billing-service.ts)<br>[billing-order-event-signal](web/src/lib/server/billing-order-event-signal.ts) | PostgreSQL、积分/商业事务 | 计费 / 订单 / 单项 / 事件：查询 |
| GET | `/api/billing/orders/[id]/payment-form` | 用户 | [route.ts](web/src/app/api/billing/orders/[id]/payment-form/route.ts) | [billing-service](web/src/lib/server/billing-service.ts)<br>[payment-checkout-service](web/src/lib/server/payment-checkout-service.ts)<br>[payment-form-page](web/src/lib/server/payment-form-page.ts) | PostgreSQL、积分/商业事务 | 计费 / 订单 / 单项 / 支付表单：查询 |
| GET | `/api/billing/products` | 公开 | [route.ts](web/src/app/api/billing/products/route.ts) | [billing-service](web/src/lib/server/billing-service.ts)<br>[payment-config-status](web/src/lib/server/payment-config-status.ts) | PostgreSQL、积分/商业事务 | 计费 / 商品：查询 |
| POST | `/api/billing/quotes` | 用户 | [route.ts](web/src/app/api/billing/quotes/route.ts) | [billing-commerce-service](web/src/lib/server/billing-commerce-service.ts) | PostgreSQL、积分/商业事务 | 计费 / 报价：提交/执行 |
| POST | `/api/billing/webhooks/[provider]` | Webhook | [route.ts](web/src/app/api/billing/webhooks/[provider]/route.ts) | [billing-service](web/src/lib/server/billing-service.ts)<br>[payment-webhook-service](web/src/lib/server/payment-webhook-service.ts) | 外部回调、签名校验、PostgreSQL 幂等记录 | 计费 / 支付回调 / 指定支付渠道：提交/执行 |

### `canvas`（3）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| DELETE, GET, POST | `/api/canvas/projects` | 用户 | [route.ts](web/src/app/api/canvas/projects/route.ts) | [canvas-project-service](web/src/lib/server/canvas-project-service.ts) | PostgreSQL、创作数据 | 画布 / 项目：查询、删除、提交/执行 |
| GET, PATCH | `/api/canvas/projects/[id]` | 用户 | [route.ts](web/src/app/api/canvas/projects/[id]/route.ts) | [canvas-project-service](web/src/lib/server/canvas-project-service.ts) | PostgreSQL、创作数据 | 画布 / 项目 / 单项：查询、更新 |
| DELETE | `/api/canvas/projects/[id]/assistant-conversations` | 混合 | [route.ts](web/src/app/api/canvas/projects/[id]/assistant-conversations/route.ts) | [canvas-project-service](web/src/lib/server/canvas-project-service.ts) | PostgreSQL、创作数据 | 画布 / 项目 / 单项 / 助手对话：删除 |

### `cdk`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/cdk/redeem` | 用户 | [route.ts](web/src/app/api/cdk/redeem/route.ts) | [store](web/src/lib/auth/store.ts) | PostgreSQL、积分/商业事务 | 兑换码 / 兑换：提交/执行 |

### `check-in`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/check-in` | 用户 | [route.ts](web/src/app/api/check-in/route.ts) | [session](web/src/lib/auth/session.ts) | PostgreSQL、积分/商业事务 | 签到：提交/执行 |

### `community`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/community/activity` | 用户 | [route.ts](web/src/app/api/community/activity/route.ts) | [work-community-service](web/src/lib/server/work-community-service.ts) | PostgreSQL、作品与社区数据 | 社区互动 / 互动记录：查询 |

### `create`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/create/overview` | 用户 | [route.ts](web/src/app/api/create/overview/route.ts) | [create-workbench-overview-service](web/src/lib/server/create-workbench-overview-service.ts) | PostgreSQL | 创建工作台 / 概览：查询 |

### `creative`（6）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/creative/assets` | 用户 | [route.ts](web/src/app/api/creative/assets/route.ts) | [creative-runtime-service](web/src/lib/server/creative-runtime-service.ts)<br>[creative-upload](web/src/lib/creative-upload.ts) | PostgreSQL、创作数据 | 创作运行时 / 资产：提交/执行 |
| GET | `/api/creative/assets/[id]` | 用户 | [route.ts](web/src/app/api/creative/assets/[id]/route.ts) | [creative-runtime-service](web/src/lib/server/creative-runtime-service.ts) | PostgreSQL、创作数据 | 创作运行时 / 资产 / 单项：查询 |
| DELETE, GET, POST | `/api/creative/conversations` | 用户 | [route.ts](web/src/app/api/creative/conversations/route.ts) | [creative-runtime-service](web/src/lib/server/creative-runtime-service.ts) | PostgreSQL、创作数据 | 创作运行时 / 创作对话：查询、删除、提交/执行 |
| DELETE, GET, PATCH | `/api/creative/conversations/[id]` | 用户 | [route.ts](web/src/app/api/creative/conversations/[id]/route.ts) | [creative-runtime-service](web/src/lib/server/creative-runtime-service.ts) | PostgreSQL、创作数据 | 创作运行时 / 创作对话 / 单项：查询、更新、删除 |
| GET | `/api/creative/conversations/[id]/assets` | 用户 | [route.ts](web/src/app/api/creative/conversations/[id]/assets/route.ts) | [creative-runtime-service](web/src/lib/server/creative-runtime-service.ts) | PostgreSQL、创作数据 | 创作运行时 / 创作对话 / 单项 / 资产：查询 |
| GET | `/api/creative/conversations/[id]/messages` | 用户 | [route.ts](web/src/app/api/creative/conversations/[id]/messages/route.ts) | [creative-runtime-service](web/src/lib/server/creative-runtime-service.ts) | PostgreSQL、创作数据 | 创作运行时 / 创作对话 / 单项 / 消息：查询 |

### `drama`（12）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/drama/analyze` | 用户 | [route.ts](web/src/app/api/drama/analyze/route.ts) | [drama-analysis](web/src/lib/server/drama-analysis.ts)<br>[drama-analysis-input](web/src/lib/server/drama-analysis-input.ts)<br>[logical-model-router](web/src/lib/server/logical-model-router.ts) | PostgreSQL、生成任务、FFmpeg、媒体 | 短剧 / 分析：提交/执行 |
| GET, POST | `/api/drama/projects` | 用户 | [route.ts](web/src/app/api/drama/projects/route.ts) | [drama-project-service](web/src/lib/server/drama-project-service.ts) | PostgreSQL、生成任务、FFmpeg、媒体 | 短剧 / 项目：查询、提交/执行 |
| DELETE, GET, PATCH | `/api/drama/projects/[id]` | 用户 | [route.ts](web/src/app/api/drama/projects/[id]/route.ts) | [drama-project-service](web/src/lib/server/drama-project-service.ts) | PostgreSQL、生成任务、FFmpeg、媒体 | 短剧 / 项目 / 单项：查询、更新、删除 |
| DELETE | `/api/drama/projects/[id]/agent-conversations/[conversationId]` | 混合 | [route.ts](web/src/app/api/drama/projects/[id]/agent-conversations/[conversationId]/route.ts) | [drama-project-service](web/src/lib/server/drama-project-service.ts) | PostgreSQL、生成任务、FFmpeg、媒体 | 短剧 / 项目 / 单项 / Agent 对话 / 指定对话：删除 |
| GET | `/api/drama/projects/[id]/costs` | 用户 | [route.ts](web/src/app/api/drama/projects/[id]/costs/route.ts) | [drama-project-cost-service](web/src/lib/server/drama-project-cost-service.ts)<br>[drama-project-service](web/src/lib/server/drama-project-service.ts) | PostgreSQL、生成任务、FFmpeg、媒体 | 短剧 / 项目 / 单项 / 成本：查询 |
| POST | `/api/drama/projects/[id]/export-jianying` | 用户 | [route.ts](web/src/app/api/drama/projects/[id]/export-jianying/route.ts) | [drama-project-service](web/src/lib/server/drama-project-service.ts)<br>[drama-jianying-export](web/src/lib/server/drama-jianying-export.ts) | PostgreSQL、生成任务、FFmpeg、媒体 | 短剧 / 项目 / 单项 / 剪映导出：提交/执行 |
| GET, POST | `/api/drama/projects/[id]/versions` | 用户 | [route.ts](web/src/app/api/drama/projects/[id]/versions/route.ts) | [drama-project-service](web/src/lib/server/drama-project-service.ts) | PostgreSQL、生成任务、FFmpeg、媒体 | 短剧 / 项目 / 单项 / 版本：查询、提交/执行 |
| POST | `/api/drama/projects/[id]/versions/[versionId]` | 用户 | [route.ts](web/src/app/api/drama/projects/[id]/versions/[versionId]/route.ts) | [drama-project-service](web/src/lib/server/drama-project-service.ts) | PostgreSQL、生成任务、FFmpeg、媒体 | 短剧 / 项目 / 单项 / 版本 / 指定版本：提交/执行 |
| POST | `/api/drama/render` | 用户 | [route.ts](web/src/app/api/drama/render/route.ts) | [creative-runtime-service](web/src/lib/server/creative-runtime-service.ts)<br>[drama-render-store](web/src/lib/server/drama-render-store.ts)<br>[generation-task-store](web/src/lib/server/generation-task-store.ts) | PostgreSQL、生成任务、FFmpeg、媒体 | 短剧 / 渲染：提交/执行 |
| GET | `/api/drama/render-capability` | 用户 | [route.ts](web/src/app/api/drama/render-capability/route.ts) | [ffmpeg](web/src/lib/server/ffmpeg.ts) | PostgreSQL、生成任务、FFmpeg、媒体 | 短剧 / 渲染能力：查询 |
| GET, PATCH | `/api/drama/render/[id]` | 用户 | [route.ts](web/src/app/api/drama/render/[id]/route.ts) | [drama-render-store](web/src/lib/server/drama-render-store.ts) | PostgreSQL、生成任务、FFmpeg、媒体 | 短剧 / 渲染 / 单项：查询、更新 |
| POST | `/api/drama/review` | 用户 | [route.ts](web/src/app/api/drama/review/route.ts) | [creative-review-service](web/src/lib/server/creative-review-service.ts)<br>[drama-visual-review](web/src/lib/server/drama-visual-review.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、生成任务、FFmpeg、媒体 | 短剧 / 审核：提交/执行 |

### `generation-log-assets`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET, HEAD | `/api/generation-log-assets/[...path]` | 用户 | [route.ts](web/src/app/api/generation-log-assets/[...path]/route.ts) | [generation-log-store](web/src/lib/server/generation-log-store.ts)<br>[object-storage-service](web/src/lib/server/object-storage-service.ts)<br>[data-dir](web/src/lib/server/data-dir.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 生成日志媒体 / 指定路径：查询、读取元数据 |

### `generation-logs`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| DELETE, GET, PATCH, POST | `/api/generation-logs` | 用户 | [route.ts](web/src/app/api/generation-logs/route.ts) | [generation-log-store](web/src/lib/server/generation-log-store.ts)<br>[generation-log-task-service](web/src/lib/server/generation-log-task-service.ts)<br>[generation-log-types](web/src/lib/server/generation-log-types.ts) | PostgreSQL | 生成日志：查询、更新、删除、提交/执行 |

### `generation-webhooks`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/generation-webhooks/[channelId]` | Webhook | [route.ts](web/src/app/api/generation-webhooks/[channelId]/route.ts) | [generation-task-webhook](web/src/lib/server/generation-task-webhook.ts)<br>[generation-webhook-provider](web/src/lib/server/generation-webhook-provider.ts)<br>[provider-task-config](web/src/lib/server/provider-task-config.ts) | 外部回调、签名校验、PostgreSQL 幂等记录 | 生成回调 / 指定渠道：提交/执行 |

### `health`（2）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/health/live` | 公开 | [route.ts](web/src/app/api/health/live/route.ts) | Route 内部实现 | 应用进程 | 健康检查 / 存活状态：查询 |
| GET | `/api/health/ready` | 公开 | [route.ts](web/src/app/api/health/ready/route.ts) | [generation-worker-heartbeat](web/src/lib/server/generation-worker-heartbeat.ts)<br>[install-status](web/src/lib/server/install-status.ts) | PostgreSQL、Worker 心跳 | 健康检查 / 就绪状态：查询 |

### `image-tasks`（2）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/image-tasks` | 混合 | [route.ts](web/src/app/api/image-tasks/route.ts) | [creative-runtime-service](web/src/lib/server/creative-runtime-service.ts)<br>[generation-log-store](web/src/lib/server/generation-log-store.ts)<br>[generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts) | PostgreSQL、积分、模型上游、媒体 | 图像任务：提交/执行 |
| GET, PATCH | `/api/image-tasks/[id]` | 混合 | [route.ts](web/src/app/api/image-tasks/[id]/route.ts) | [generation-task-cancellation-service](web/src/lib/server/generation-task-cancellation-service.ts)<br>[generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts)<br>[generation-task-store](web/src/lib/server/generation-task-store.ts) | PostgreSQL、积分、模型上游、媒体 | 图像任务 / 单项：查询、更新 |

### `install`（2）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/install/initialize` | 混合 | [route.ts](web/src/app/api/install/initialize/route.ts) | [install-status](web/src/lib/server/install-status.ts) | PostgreSQL、安装令牌、加密配置 | 使用一次性安装令牌初始化 PostgreSQL 表结构 |
| GET | `/api/install/status` | 公开 | [route.ts](web/src/app/api/install/status/route.ts) | [install-status](web/src/lib/server/install-status.ts) | PostgreSQL、安装令牌、加密配置 | 安装 / 状态：查询 |

### `library-assets`（2）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET, POST | `/api/library-assets` | 用户 | [route.ts](web/src/app/api/library-assets/route.ts) | [library-asset-service](web/src/lib/server/library-asset-service.ts) | PostgreSQL、创作数据 | 素材库：查询、提交/执行 |
| DELETE, PATCH | `/api/library-assets/[id]` | 用户 | [route.ts](web/src/app/api/library-assets/[id]/route.ts) | [library-asset-service](web/src/lib/server/library-asset-service.ts) | PostgreSQL、创作数据 | 素材库 / 单项：更新、删除 |

### `maintenance`（6）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/maintenance/billing-orders/expire` | 维护 | [route.ts](web/src/app/api/maintenance/billing-orders/expire/route.ts) | [billing-order-expiration-service](web/src/lib/server/billing-order-expiration-service.ts)<br>[maintenance-auth](web/src/lib/server/maintenance-auth.ts) | 维护 Token、PostgreSQL | 后台维护 / 计费订单 / 过期处理：提交/执行 |
| POST | `/api/maintenance/billing-refunds/run` | Worker | [route.ts](web/src/app/api/maintenance/billing-refunds/run/route.ts) | [billing-refund-orchestration-service](web/src/lib/server/billing-refund-orchestration-service.ts)<br>[install-status](web/src/lib/server/install-status.ts)<br>[maintenance-auth](web/src/lib/server/maintenance-auth.ts) | Worker Token、PostgreSQL、支付退款 | 后台维护 / 计费退款 / 执行：提交/执行 |
| POST | `/api/maintenance/data-lifecycle/run` | 维护 | [route.ts](web/src/app/api/maintenance/data-lifecycle/run/route.ts) | [data-lifecycle-service](web/src/lib/server/data-lifecycle-service.ts)<br>[maintenance-auth](web/src/lib/server/maintenance-auth.ts) | 维护 Token、PostgreSQL | 后台维护 / 数据生命周期 / 执行：提交/执行 |
| POST | `/api/maintenance/generation-tasks/heartbeat` | Worker | [route.ts](web/src/app/api/maintenance/generation-tasks/heartbeat/route.ts) | [generation-worker-heartbeat](web/src/lib/server/generation-worker-heartbeat.ts)<br>[install-status](web/src/lib/server/install-status.ts)<br>[maintenance-auth](web/src/lib/server/maintenance-auth.ts) | Worker Token、PostgreSQL、模型上游 | 后台维护 / 生成任务 / 心跳：提交/执行 |
| POST | `/api/maintenance/generation-tasks/run` | Worker | [route.ts](web/src/app/api/maintenance/generation-tasks/run/route.ts) | [generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts)<br>[install-status](web/src/lib/server/install-status.ts)<br>[maintenance-auth](web/src/lib/server/maintenance-auth.ts) | Worker Token、PostgreSQL、模型上游 | 后台维护 / 生成任务 / 执行：提交/执行 |
| POST | `/api/maintenance/referrals/settle` | 维护 | [route.ts](web/src/app/api/maintenance/referrals/settle/route.ts) | [referral-service](web/src/lib/server/referral-service.ts)<br>[maintenance-auth](web/src/lib/server/maintenance-auth.ts) | 维护 Token、PostgreSQL | 后台维护 / 邀请返利 / 结算：提交/执行 |

### `media-assets`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| DELETE | `/api/media-assets` | 用户 | [route.ts](web/src/app/api/media-assets/route.ts) | [local-media-storage](web/src/lib/server/local-media-storage.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 媒体资产：删除 |

### `media-proxy`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET, HEAD | `/api/media-proxy` | 用户 | [route.ts](web/src/app/api/media-proxy/route.ts) | [media-proxy-service](web/src/lib/server/media-proxy-service.ts)<br>[media-concurrency](web/src/lib/server/media-concurrency.ts)<br>[media-content-validation](web/src/lib/server/media-content-validation.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 媒体代理：查询、读取元数据 |

### `my-prompts`（2）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET, POST | `/api/my-prompts` | 用户 | [route.ts](web/src/app/api/my-prompts/route.ts) | [store](web/src/lib/auth/store.ts)<br>[store](web/src/lib/prompts/store.ts) | PostgreSQL、公开内容/站点设置 | 个人提示词：查询、提交/执行 |
| DELETE, PATCH | `/api/my-prompts/[id]` | 用户 | [route.ts](web/src/app/api/my-prompts/[id]/route.ts) | [store](web/src/lib/auth/store.ts)<br>[store](web/src/lib/prompts/store.ts) | PostgreSQL、公开内容/站点设置 | 个人提示词 / 单项：更新、删除 |

### `notifications`（3）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/notifications/interactions` | 用户 | [route.ts](web/src/app/api/notifications/interactions/route.ts) | [work-community-service](web/src/lib/server/work-community-service.ts) | PostgreSQL、作品与社区数据 | 通知 / 互动通知：查询 |
| POST | `/api/notifications/interactions/[id]/read` | 用户 | [route.ts](web/src/app/api/notifications/interactions/[id]/read/route.ts) | [work-community-service](web/src/lib/server/work-community-service.ts) | PostgreSQL、作品与社区数据 | 通知 / 互动通知 / 单项 / 已读：提交/执行 |
| POST | `/api/notifications/interactions/read-all` | 用户 | [route.ts](web/src/app/api/notifications/interactions/read-all/route.ts) | [work-community-service](web/src/lib/server/work-community-service.ts) | PostgreSQL、作品与社区数据 | 通知 / 互动通知 / 全部已读：提交/执行 |

### `points`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/points` | 用户 | [route.ts](web/src/app/api/points/route.ts) | [store](web/src/lib/auth/store.ts) | PostgreSQL、积分/商业事务 | 积分：查询 |

### `practice`（4）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET, POST | `/api/practice/projects` | active 学校老师/学生 | [route.ts](web/src/app/api/practice/projects/route.ts) | [practice-project-service](web/src/lib/server/practice-project-service.ts) | 用户定向 Canvas/短剧 Repository；身份固定为 `open-source-practice` | 分页查询或创建独立练习项目；请求不能选择 provider、model 或执行身份 |
| GET | `/api/practice/projects/[id]` | 项目所有者且为 active 学校老师/学生 | [route.ts](web/src/app/api/practice/projects/[id]/route.ts) | [practice-project-service](web/src/lib/server/practice-project-service.ts) | 用户、项目类型与练习身份定向查询 | 返回本人练习项目，跨用户或正式项目均不可见 |
| GET, POST | `/api/practice/sessions` | active 学校老师/学生 | [route.ts](web/src/app/api/practice/sessions/route.ts) | [practice-session-service](web/src/lib/server/practice-session-service.ts) | 用户定向练习会话、生成任务、公开素材引用 | 分页查询或创建五类练习；响应不含 provider、model、渠道、积分和内部任务引用 |
| GET, POST | `/api/practice/sessions/[id]` | 会话所有者且为 active 学校老师/学生 | [route.ts](web/src/app/api/practice/sessions/[id]/route.ts) | [practice-session-service](web/src/lib/server/practice-session-service.ts) | 会话所有者定向读取；POST 仅支持同会话失败重试 | 查询公开结果或复用原输入/引用重试，不创建新会话 |

### `prompts`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/prompts` | 公开 | [route.ts](web/src/app/api/prompts/route.ts) | [store](web/src/lib/prompts/store.ts) | PostgreSQL、公开内容/站点设置 | 提示词：查询 |

### `public`（16）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/public/gallery` | 公开 | [route.ts](web/src/app/api/public/gallery/route.ts) | [work-governance-service](web/src/lib/server/work-governance-service.ts) | PostgreSQL、作品与社区数据 | 公开访问 / 作品广场：查询 |
| GET | `/api/public/gallery/ranking` | 公开 | [route.ts](web/src/app/api/public/gallery/ranking/route.ts) | [work-community-service](web/src/lib/server/work-community-service.ts) | PostgreSQL、作品与社区数据 | 公开访问 / 作品广场 / 排行：查询 |
| GET | `/api/public/prompt-images` | 公开 | [route.ts](web/src/app/api/public/prompt-images/route.ts) | [public-prompt-image](web/src/lib/server/public-prompt-image.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 公开访问 / 提示词图片：查询 |
| GET | `/api/public/users/[userId]` | 公开 | [route.ts](web/src/app/api/public/users/[userId]/route.ts) | [work-community-service](web/src/lib/server/work-community-service.ts) | PostgreSQL、作品与社区数据 | 公开访问 / 用户 / 指定用户：查询 |
| GET, HEAD | `/api/public/users/[userId]/avatar` | 公开 | [route.ts](web/src/app/api/public/users/[userId]/avatar/route.ts) | [object-storage-service](web/src/lib/server/object-storage-service.ts)<br>[reference-asset-store](web/src/lib/server/reference-asset-store.ts)<br>[data-dir](web/src/lib/server/data-dir.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 公开访问 / 用户 / 指定用户 / 头像：查询、读取元数据 |
| POST | `/api/public/users/[userId]/block` | 用户 | [route.ts](web/src/app/api/public/users/[userId]/block/route.ts) | [work-community-service](web/src/lib/server/work-community-service.ts) | PostgreSQL、作品与社区数据 | 公开访问 / 用户 / 指定用户 / 屏蔽：提交/执行 |
| POST | `/api/public/users/[userId]/follow` | 用户 | [route.ts](web/src/app/api/public/users/[userId]/follow/route.ts) | [work-community-service](web/src/lib/server/work-community-service.ts) | PostgreSQL、作品与社区数据 | 公开访问 / 用户 / 指定用户 / 关注：提交/执行 |
| GET | `/api/public/works/[slug]` | 公开 | [route.ts](web/src/app/api/public/works/[slug]/route.ts) | [work-publication-service](web/src/lib/server/work-publication-service.ts) | PostgreSQL、作品与社区数据 | 公开访问 / 作品 / 指定作品：查询 |
| GET | `/api/public/works/[slug]/community` | 公开 | [route.ts](web/src/app/api/public/works/[slug]/community/route.ts) | [work-community-service](web/src/lib/server/work-community-service.ts) | PostgreSQL、作品与社区数据 | 公开访问 / 作品 / 指定作品 / 社区互动：查询 |
| POST | `/api/public/works/[slug]/community/follow` | 用户 | [route.ts](web/src/app/api/public/works/[slug]/community/follow/route.ts) | [work-community-service](web/src/lib/server/work-community-service.ts) | PostgreSQL、作品与社区数据 | 公开访问 / 作品 / 指定作品 / 社区互动 / 关注：提交/执行 |
| POST | `/api/public/works/[slug]/community/like` | 用户 | [route.ts](web/src/app/api/public/works/[slug]/community/like/route.ts) | [work-community-service](web/src/lib/server/work-community-service.ts) | PostgreSQL、作品与社区数据 | 公开访问 / 作品 / 指定作品 / 社区互动 / 点赞：提交/执行 |
| GET, HEAD | `/api/public/works/[slug]/media/[assetId]` | 公开 | [route.ts](web/src/app/api/public/works/[slug]/media/[assetId]/route.ts) | [object-storage-service](web/src/lib/server/object-storage-service.ts)<br>[reference-asset-store](web/src/lib/server/reference-asset-store.ts)<br>[work-publication-service](web/src/lib/server/work-publication-service.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 公开访问 / 作品 / 指定作品 / 媒体 / 指定媒体：查询、读取元数据 |
| GET | `/api/public/works/[slug]/process` | 公开 | [route.ts](web/src/app/api/public/works/[slug]/process/route.ts) | [public-work-process-service](web/src/lib/server/public-work-process-service.ts) | 当前公开版本的白名单制作流程快照 | 仅拉片已启用且版本仍有效时返回只读 Canvas/短剧流程，不返回内部提示词、任务或存储字段 |
| POST | `/api/public/works/[slug]/copy-to-practice` | active 学校老师/学生 | [route.ts](web/src/app/api/public/works/[slug]/copy-to-practice/route.ts) | [public-work-process-service](web/src/lib/server/public-work-process-service.ts) | PostgreSQL 事务、版本复核、用户级幂等声明 | 将当前公开拉片版本复制为新的练习项目；相同 `clientRequestId` 返回原项目 |
| POST | `/api/public/works/[slug]/report` | 用户 | [route.ts](web/src/app/api/public/works/[slug]/report/route.ts) | [work-governance-service](web/src/lib/server/work-governance-service.ts) | PostgreSQL、作品与社区数据 | 公开访问 / 作品 / 指定作品 / 举报：提交/执行 |
| POST | `/api/public/works/[slug]/view` | 公开 | [route.ts](web/src/app/api/public/works/[slug]/view/route.ts) | [work-publication-service](web/src/lib/server/work-publication-service.ts) | PostgreSQL、作品与社区数据 | 公开访问 / 作品 / 指定作品 / 访问计数：提交/执行 |

### `reference-assets`（2）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/reference-assets` | 用户 | [route.ts](web/src/app/api/reference-assets/route.ts) | [reference-asset-store](web/src/lib/server/reference-asset-store.ts)<br>[reference-asset-access](web/src/lib/server/reference-asset-access.ts)<br>[creative-upload](web/src/lib/creative-upload.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 参考素材：提交/执行 |
| GET, HEAD | `/api/reference-assets/[...path]` | 混合 | [route.ts](web/src/app/api/reference-assets/[...path]/route.ts) | [object-storage-service](web/src/lib/server/object-storage-service.ts)<br>[reference-asset-store](web/src/lib/server/reference-asset-store.ts)<br>[local-media-registry](web/src/lib/server/local-media-registry.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 参考素材 / 指定路径：查询、读取元数据 |

### `referrals`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/referrals` | 用户 | [route.ts](web/src/app/api/referrals/route.ts) | [referral-service](web/src/lib/server/referral-service.ts) | PostgreSQL、积分/商业事务 | 邀请返利：查询 |

### `school`（13）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/school/context` | 用户 | [route.ts](web/src/app/api/school/context/route.ts) | [school-access-service](web/src/lib/server/school-access-service.ts) | 学校域 PostgreSQL/文件 Provider | 返回 `SchoolContext \| null`；用于水合当前学校关系，允许读取已停用身份快照 |
| GET, PATCH | `/api/school/profile` | 学校管理员（active teacher + `school.manage`） | [route.ts](web/src/app/api/school/profile/route.ts) | [school-tenant-service](web/src/lib/server/school-tenant-service.ts) | 当前 `school_id` 定向查询与更新 | 查询或更新本校资料，返回 `SchoolDetail` |
| GET, POST | `/api/school/members` | 学校管理员（active teacher + `school.manage`） | [route.ts](web/src/app/api/school/members/route.ts) | [school-tenant-service](web/src/lib/server/school-tenant-service.ts)<br>[school-member-provisioning-service](web/src/lib/server/school-member-provisioning-service.ts) | 当前 `school_id`、角色、状态、关键词和分页 | GET 返回 `PageResult<SchoolMember>`；POST 批量创建并返回 `SchoolMember[]` |
| POST | `/api/school/members/import` | 学校管理员（active teacher + `school.manage`） | [route.ts](web/src/app/api/school/members/import/route.ts) | [school-member-provisioning-service](web/src/lib/server/school-member-provisioning-service.ts) | 当前学校事务创建与账号唯一约束 | 导入成员并返回 `SchoolMember[]` |
| DELETE, PATCH | `/api/school/members/[id]` | 学校管理员（active teacher + `school.manage`） | [route.ts](web/src/app/api/school/members/[id]/route.ts) | [school-tenant-service](web/src/lib/server/school-tenant-service.ts) | 当前 `school_id`、成员实体、引用保护 | PATCH 返回 `SchoolMember`；DELETE 返回 `{ removed: boolean }` |
| POST | `/api/school/invitations` | 学校管理员（active teacher + `school.manage`） | [route.ts](web/src/app/api/school/invitations/route.ts) | [school-member-provisioning-service](web/src/lib/server/school-member-provisioning-service.ts) | 当前学校、身份、摘要存储和事务轮换 | 轮换老师或学生邀请码，返回 `{ code: string }` |
| GET, POST | `/api/school/invitations/join` | 用户（当前尚未入校） | [route.ts](web/src/app/api/school/invitations/join/route.ts) | [school-member-provisioning-service](web/src/lib/server/school-member-provisioning-service.ts) | 邀请摘要、账号唯一学校约束、事务加入 | GET 返回 `SchoolInvitePreview`；POST 加入并返回 `SchoolContext` |
| GET, POST | `/api/school/classes` | 学校管理员（active teacher + `school.manage`） | [route.ts](web/src/app/api/school/classes/route.ts) | [school-tenant-service](web/src/lib/server/school-tenant-service.ts) | 当前 `school_id`、状态、关键词和分页 | GET 返回 `PageResult<SchoolClass>`；POST 创建并返回 `SchoolClass` |
| DELETE, GET, PATCH | `/api/school/classes/[id]` | 学校管理员（active teacher + `school.manage`） | [route.ts](web/src/app/api/school/classes/[id]/route.ts) | [school-tenant-service](web/src/lib/server/school-tenant-service.ts) | 当前 `school_id`、同校成员复合约束、引用保护 | GET 返回 `SchoolClassDetail`；PATCH 返回 `SchoolClass \| SchoolClassDetail`；DELETE 返回 `{ id: string }` |
| GET | `/api/school/courses` | 学校管理员（active teacher + `school.manage`） | [route.ts](web/src/app/api/school/courses/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts) | 当前 `school_id` 课程分配分页 | 返回 `PageResult<SchoolCourseAssignment>` |
| GET, POST | `/api/school/courses/[id]/offerings` | 学校管理员（active teacher + `school.manage`） | [route.ts](web/src/app/api/school/courses/[id]/offerings/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts) | 当前 `school_id`、课程分配、班级和老师复合约束 | GET 返回 `PageResult<SchoolCourseOffering>`；POST 创建并返回 `SchoolCourseOffering` |
| GET | `/api/school/commercial-orders` | 学校管理员（active teacher + `school.manage`） | [route.ts](web/src/app/api/school/commercial-orders/route.ts) | [commercial-order-service](web/src/lib/server/commercial-order-service.ts) | 当前 `assigned_school_id` 定向分页；响应不含内部金额 | 返回 `PageResult<SchoolCommercialOrder>` |
| GET, PATCH | `/api/school/commercial-orders/[id]` | 学校管理员（active teacher + `school.manage`） | [route.ts](web/src/app/api/school/commercial-orders/[id]/route.ts) | [commercial-order-service](web/src/lib/server/commercial-order-service.ts) | 当前学校事务、同校老师/班级/学生校验、CAS；响应不含内部金额 | GET 查询，PATCH 配置团队或开始制作；均返回 `SchoolCommercialOrder` |

### `site-icon`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/site-icon` | 公开 | [route.ts](web/src/app/api/site-icon/route.ts) | [site-metadata](web/src/lib/server/site-metadata.ts) | PostgreSQL、公开内容/站点设置 | 站点图标：查询 |

### `teaching`（10）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/teaching/courses` | active 学校成员（老师/学生按身份可见） | [route.ts](web/src/app/api/teaching/courses/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts) | 当前 `school_id`、成员/班级关系和分页 | 返回 `PageResult<SchoolCourseAssignment>` |
| GET | `/api/teaching/offerings` | active 老师 | [route.ts](web/src/app/api/teaching/offerings/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts) | 当前 `school_id + teacher_membership_id` 定向分页 | 返回 `PageResult<SchoolCourseOffering>` |
| GET, POST | `/api/teaching/assignments` | GET 为 active 学校成员；POST 为负责课程安排的老师 | [route.ts](web/src/app/api/teaching/assignments/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts) | 老师/学生按身份和班级定向查询；老师写入 | GET 返回 `PageResult<TeachingAssignment>`；POST 创建并返回 `TeachingAssignment` |
| GET, PATCH | `/api/teaching/assignments/[id]` | GET 为可见任务的 active 成员；PATCH 为负责老师 | [route.ts](web/src/app/api/teaching/assignments/[id]/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts) | 当前学校、任务、负责老师或学生班级关系 | 查询或更新并返回 `TeachingAssignment` |
| GET, POST | `/api/teaching/assignments/[id]/submissions` | GET 为负责老师或任务学生本人；POST 为目标班级 active 学生 | [route.ts](web/src/app/api/teaching/assignments/[id]/submissions/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-content-reference-service](web/src/lib/server/school-content-reference-service.ts) | 当前学校/任务/学生定向分页，成果引用所有权校验 | GET 返回 `PageResult<TeachingSubmission>`；POST 提交并返回 `TeachingSubmission` |
| GET | `/api/teaching/submissions` | active 学生 | [route.ts](web/src/app/api/teaching/submissions/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts) | 当前 `school_id + student_membership_id` 与可选任务 ID 分页 | 返回本人 `PageResult<TeachingSubmission>` |
| POST | `/api/teaching/submissions/[id]/review` | active 负责老师 | [route.ts](web/src/app/api/teaching/submissions/[id]/review/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts) | 当前学校、负责任务、提交实体和事务更新 | 批改或退回，返回 `TeachingSubmission` |
| GET | `/api/teaching/commercial-orders` | active 学校成员（负责老师/参与学生分别定向） | [route.ts](web/src/app/api/teaching/commercial-orders/route.ts) | [commercial-order-service](web/src/lib/server/commercial-order-service.ts) | 当前学校与老师/参与者关系分页；响应不含内部金额 | 返回 `PageResult<SchoolCommercialOrder>` |
| GET | `/api/teaching/commercial-orders/[id]/participants` | active 负责老师；仅商单 `assigned` 状态 | [route.ts](web/src/app/api/teaching/commercial-orders/[id]/participants/route.ts) | [commercial-order-service](web/src/lib/server/commercial-order-service.ts) | 本校 active 学生、可选班级范围、关键词和分页 | 返回 `CommercialOrderParticipantCandidatePage`，即候选 `PageResult` 加完整 `selectedMembershipIds` |
| GET, POST | `/api/teaching/commercial-orders/[id]/submissions` | GET 为负责老师/学校管理员/已安排学生；POST 按 action 要求负责老师或参与学生 | [route.ts](web/src/app/api/teaching/commercial-orders/[id]/submissions/route.ts) | [commercial-order-service](web/src/lib/server/commercial-order-service.ts)<br>[school-content-reference-service](web/src/lib/server/school-content-reference-service.ts) | 当前学校商单、参与者和交付分页；事务/CAS、成果引用校验；响应不含内部金额 | GET 返回 `{ order; participants: PageResult<CommercialOrderParticipantSubmission>; deliveries: PageResult<CommercialOrderDelivery> }`；POST `participants` 返回参与者页，`candidate` 返回候选提交，`delivery` 返回正式交付 |

### `text-tasks`（2）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/text-tasks` | 混合 | [route.ts](web/src/app/api/text-tasks/route.ts) | [generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts)<br>[generation-task-store](web/src/lib/server/generation-task-store.ts)<br>[text-task-store](web/src/lib/server/text-task-store.ts) | PostgreSQL、积分、模型上游、媒体 | 文本任务：提交/执行 |
| GET, PATCH | `/api/text-tasks/[id]` | 混合 | [route.ts](web/src/app/api/text-tasks/[id]/route.ts) | [generation-task-cancellation-service](web/src/lib/server/generation-task-cancellation-service.ts)<br>[generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts)<br>[generation-task-store](web/src/lib/server/generation-task-store.ts) | PostgreSQL、积分、模型上游、媒体 | 文本任务 / 单项：查询、更新 |

### `video-generation-tasks`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/video-generation-tasks` | 混合 | [route.ts](web/src/app/api/video-generation-tasks/route.ts) | [video-generation-route](web/src/app/api/video-generation-tasks/video-generation-route.ts)<br>[generation-task-scheduler](web/src/lib/server/generation-task-scheduler.ts) | PostgreSQL、积分、模型上游、媒体 | 视频生成任务：提交/执行 |

### `video-tasks`（2）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/video-tasks` | 公开 | [route.ts](web/src/app/api/video-tasks/route.ts) | Route 内部实现 | PostgreSQL、积分、模型上游、媒体 | 已停用旧视频任务入口：固定返回 410 |
| GET, PATCH | `/api/video-tasks/[id]` | 混合 | [route.ts](web/src/app/api/video-tasks/[id]/route.ts) | [generation-task-cancellation-service](web/src/lib/server/generation-task-cancellation-service.ts)<br>[generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts)<br>[generation-task-store](web/src/lib/server/generation-task-store.ts) | PostgreSQL、积分、模型上游、媒体 | 视频任务 / 单项：查询、更新 |

### `works`（7）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET, POST | `/api/works` | 用户 | [route.ts](web/src/app/api/works/route.ts) | [work-publication-service](web/src/lib/server/work-publication-service.ts) | PostgreSQL、作品与社区数据 | 作品：查询、提交/执行 |
| DELETE, GET, PATCH | `/api/works/[id]` | 用户 | [route.ts](web/src/app/api/works/[id]/route.ts) | [work-publication-service](web/src/lib/server/work-publication-service.ts) | PostgreSQL、作品与社区数据 | 作品 / 单项：查询、更新、删除 |
| GET, POST | `/api/works/[id]/appeal` | 用户 | [route.ts](web/src/app/api/works/[id]/appeal/route.ts) | [work-governance-service](web/src/lib/server/work-governance-service.ts) | PostgreSQL、作品与社区数据 | 作品 / 单项 / 申诉：查询、提交/执行 |
| POST | `/api/works/[id]/relist` | 用户 | [route.ts](web/src/app/api/works/[id]/relist/route.ts) | [work-publication-service](web/src/lib/server/work-publication-service.ts) | PostgreSQL、作品与社区数据 | 作品 / 单项 / 重新上架：提交/执行 |
| POST | `/api/works/[id]/revoke` | 用户 | [route.ts](web/src/app/api/works/[id]/revoke/route.ts) | [work-publication-service](web/src/lib/server/work-publication-service.ts) | PostgreSQL、作品与社区数据 | 作品 / 单项 / 撤回：提交/执行 |
| POST | `/api/works/[id]/submit` | 用户 | [route.ts](web/src/app/api/works/[id]/submit/route.ts) | [work-publication-service](web/src/lib/server/work-publication-service.ts) | PostgreSQL、作品与社区数据 | 作品 / 单项 / 提交审核：提交/执行 |
| GET | `/api/works/sources` | 用户 | [route.ts](web/src/app/api/works/sources/route.ts) | [work-publication-service](web/src/lib/server/work-publication-service.ts) | PostgreSQL、作品与社区数据 | 作品 / 发布来源：查询 |

## 维护规则

1. 新增、移动或删除 `route.ts` 后，重新运行 `过程文件/生成开发地图清单.ps1` 和本脚本。
2. 权限必须从代码证据更新；新增 Helper 时同步扩展清单脚本的认证标记。
3. 运行 `过程文件/验证开发文档.ps1`，要求索引 Handler 与源码清单一一对应。
4. 接口行为、状态码或边界发生变化时，在同一个代码提交中更新对应行。

返回 [VOZEB PRO 开发地图](VOZEB-PRO-开发地图.md)。
