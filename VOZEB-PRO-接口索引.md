# VOZEB PRO 接口索引

> 生成日期：2026-09-07。枚举来源仅为 `web/src/app/api/**/route.ts`；当前共 **337** 个 Route 文件。每个文件一行，多种 HTTP 方法合并显示。

## 使用说明

- 本索引用于定位入口，不替代请求/响应类型定义；修改接口时必须继续阅读 Handler 和所列 Service。
- 动态路径保留源码写法，例如 `[id]`、`[...path]`。Handler 列链接是覆盖校验的唯一标识。
- `主要服务/Store` 只列最直接的领域入口；通用安全、响应和审计 Helper 不重复展开。
- `混合` 接口必须查看用途说明和实现：可能同时接受用户 Session 与 Worker/签名，也可能按请求分支要求不同身份；`/api/install/initialize` 使用一次性安装令牌。

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

- Route 文件：**337**
- 方法出现次数：DELETE 54、GET 182、HEAD 6、PATCH 53、POST 182、PUT 11
- 一级域：`admin` 117、`agent` 8、`ai` 1、`announcements` 1、`audio-tasks` 2、`auth` 13、`billing` 11、`canvas` 4、`cdk` 1、`check-in` 1、`community` 1、`create` 1、`creative` 6、`debug` 1、`drama` 12、`drama-lab` 45、`generation-log-assets` 1、`generation-logs` 1、`generation-webhooks` 1、`health` 2、`image-tasks` 2、`install` 2、`ip-library` 5、`library-assets` 2、`login-page-media` 1、`maintenance` 6、`media-assets` 1、`media-proxy` 1、`my-prompts` 2、`notifications` 3、`points` 1、`practice` 5、`prompts` 1、`public` 16、`reference-assets` 2、`referrals` 1、`school` 27、`site-icon` 1、`teaching` 15、`text-tasks` 2、`video-generation-tasks` 2、`video-tasks` 2、`works` 7

## 按业务域索引

### `admin`（117）

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
| GET, POST | `/api/admin/commercial-orders` | 管理员 | [route.ts](web/src/app/api/admin/commercial-orders/route.ts) | [commercial-order-service](web/src/lib/server/commercial-order-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-domain](web/src/lib/school-domain.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / commercial-orders：查询、提交/执行 |
| GET, PATCH | `/api/admin/commercial-orders/[id]` | 管理员 | [route.ts](web/src/app/api/admin/commercial-orders/[id]/route.ts) | [commercial-order-service](web/src/lib/server/commercial-order-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-domain](web/src/lib/school-domain.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / commercial-orders / 单项：查询、更新 |
| POST | `/api/admin/commercial-orders/[id]/review` | 管理员 | [route.ts](web/src/app/api/admin/commercial-orders/[id]/review/route.ts) | [commercial-order-service](web/src/lib/server/commercial-order-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / commercial-orders / 单项 / 审核：提交/执行 |
| DELETE, PUT | `/api/admin/course-attachments` | 管理员 | [route.ts](web/src/app/api/admin/course-attachments/route.ts) | [course-attachment-service](web/src/lib/server/course-attachment-service.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / course-attachments：删除、替换 |
| DELETE, PATCH | `/api/admin/course-chapters/[id]` | 管理员 | [route.ts](web/src/app/api/admin/course-chapters/[id]/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / course-chapters / 单项：更新、删除 |
| POST | `/api/admin/course-chapters/[id]/lessons` | 管理员 | [route.ts](web/src/app/api/admin/course-chapters/[id]/lessons/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / course-chapters / 单项 / lessons：提交/执行 |
| DELETE, PATCH | `/api/admin/course-lessons/[id]` | 管理员 | [route.ts](web/src/app/api/admin/course-lessons/[id]/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / course-lessons / 单项：更新、删除 |
| DELETE, PATCH | `/api/admin/course-materials/[id]` | 管理员 | [route.ts](web/src/app/api/admin/course-materials/[id]/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / course-materials / 单项：更新、删除 |
| GET, POST | `/api/admin/courses` | 管理员 | [route.ts](web/src/app/api/admin/courses/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-domain](web/src/lib/school-domain.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / courses：查询、提交/执行 |
| DELETE, GET, PATCH | `/api/admin/courses/[id]` | 管理员 | [route.ts](web/src/app/api/admin/courses/[id]/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-domain](web/src/lib/school-domain.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / courses / 单项：查询、更新、删除 |
| POST | `/api/admin/courses/[id]/chapters` | 管理员 | [route.ts](web/src/app/api/admin/courses/[id]/chapters/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / courses / 单项 / chapters：提交/执行 |
| GET | `/api/admin/courses/[id]/deletion-impact` | 管理员 | [route.ts](web/src/app/api/admin/courses/[id]/deletion-impact/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / courses / 单项 / deletion-impact：查询 |
| POST | `/api/admin/courses/[id]/materials` | 管理员 | [route.ts](web/src/app/api/admin/courses/[id]/materials/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / courses / 单项 / materials：提交/执行 |
| POST | `/api/admin/courses/[id]/restore` | 管理员 | [route.ts](web/src/app/api/admin/courses/[id]/restore/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / courses / 单项 / restore：提交/执行 |
| POST | `/api/admin/courses/[id]/schools` | 管理员 | [route.ts](web/src/app/api/admin/courses/[id]/schools/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / courses / 单项 / schools：提交/执行 |
| GET | `/api/admin/courses/[id]/tree` | 管理员 | [route.ts](web/src/app/api/admin/courses/[id]/tree/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / courses / 单项 / tree：查询 |
| GET, POST | `/api/admin/drama-lab/ai-configs` | 管理员 | [route.ts](web/src/app/api/admin/drama-lab/ai-configs/route.ts) | [index](web/src/lib/server/database/index.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / drama-lab / ai-configs：查询、提交/执行 |
| DELETE, PUT | `/api/admin/drama-lab/ai-configs/[id]` | 管理员 | [route.ts](web/src/app/api/admin/drama-lab/ai-configs/[id]/route.ts) | [admin-permissions](web/src/lib/admin-permissions.ts)<br>[session](web/src/lib/auth/session.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / drama-lab / ai-configs / 单项：删除、替换 |
| POST | `/api/admin/drama-lab/ai-configs/[id]/test` | 管理员 | [route.ts](web/src/app/api/admin/drama-lab/ai-configs/[id]/test/route.ts) | [admin-permissions](web/src/lib/admin-permissions.ts)<br>[session](web/src/lib/auth/session.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / drama-lab / ai-configs / 单项 / 测试：提交/执行 |
| GET, POST | `/api/admin/drama-lab/business-scenarios` | 管理员 | [route.ts](web/src/app/api/admin/drama-lab/business-scenarios/route.ts) | [index](web/src/lib/server/database/index.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / drama-lab / business-scenarios：查询、提交/执行 |
| DELETE, PUT | `/api/admin/drama-lab/business-scenarios/[id]` | 管理员 | [route.ts](web/src/app/api/admin/drama-lab/business-scenarios/[id]/route.ts) | Route 内部实现 | PostgreSQL、管理配置、审计日志 | 管理后台 / drama-lab / business-scenarios / 单项：删除、替换 |
| DELETE, GET, POST, PUT | `/api/admin/drama-lab/generation-settings` | 管理员 | [route.ts](web/src/app/api/admin/drama-lab/generation-settings/route.ts) | [store](web/src/lib/auth/store.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / drama-lab / generation-settings：查询、删除、提交/执行、替换 |
| GET, POST | `/api/admin/drama-lab/prompt-templates` | 管理员 | [route.ts](web/src/app/api/admin/drama-lab/prompt-templates/route.ts) | [drama-lab-prompt-templates](web/src/lib/drama-lab-prompt-templates.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / drama-lab / prompt-templates：查询、提交/执行 |
| DELETE, PUT | `/api/admin/drama-lab/prompt-templates/[id]` | 管理员 | [route.ts](web/src/app/api/admin/drama-lab/prompt-templates/[id]/route.ts) | [drama-lab-prompt-templates](web/src/lib/drama-lab-prompt-templates.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / drama-lab / prompt-templates / 单项：删除、替换 |
| GET, POST | `/api/admin/drama-lab/sd2-assets` | 管理员 | [route.ts](web/src/app/api/admin/drama-lab/sd2-assets/route.ts) | [index](web/src/lib/server/database/index.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / drama-lab / sd2-assets：查询、提交/执行 |
| DELETE, PUT | `/api/admin/drama-lab/sd2-assets/[id]` | 管理员 | [route.ts](web/src/app/api/admin/drama-lab/sd2-assets/[id]/route.ts) | Route 内部实现 | PostgreSQL、管理配置、审计日志 | 管理后台 / drama-lab / sd2-assets / 单项：删除、替换 |
| GET | `/api/admin/drama-lab/sd2-assets/[id]/download` | 管理员 | [route.ts](web/src/app/api/admin/drama-lab/sd2-assets/[id]/download/route.ts) | [index](web/src/lib/server/database/index.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / drama-lab / sd2-assets / 单项 / download：查询 |
| POST | `/api/admin/drama-lab/sd2-assets/upload` | 管理员 | [route.ts](web/src/app/api/admin/drama-lab/sd2-assets/upload/route.ts) | Route 内部实现 | PostgreSQL、管理配置、审计日志 | 管理后台 / drama-lab / sd2-assets / upload：提交/执行 |
| GET | `/api/admin/drama-projects` | 管理员 | [route.ts](web/src/app/api/admin/drama-projects/route.ts) | [drama-project-store](web/src/lib/server/drama-project-store.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / drama-projects：查询 |
| DELETE, GET | `/api/admin/drama-projects/[id]` | 管理员 | [route.ts](web/src/app/api/admin/drama-projects/[id]/route.ts) | [drama-project-store](web/src/lib/server/drama-project-store.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / drama-projects / 单项：查询、删除 |
| GET | `/api/admin/drama-projects/[id]/characters` | 管理员 | [route.ts](web/src/app/api/admin/drama-projects/[id]/characters/route.ts) | [admin-permissions](web/src/lib/admin-permissions.ts)<br>[session](web/src/lib/auth/session.ts)<br>[index](web/src/lib/server/database/index.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / drama-projects / 单项 / characters：查询 |
| GET | `/api/admin/drama-projects/[id]/episodes` | 管理员 | [route.ts](web/src/app/api/admin/drama-projects/[id]/episodes/route.ts) | [admin-permissions](web/src/lib/admin-permissions.ts)<br>[session](web/src/lib/auth/session.ts)<br>[index](web/src/lib/server/database/index.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / drama-projects / 单项 / episodes：查询 |
| DELETE, GET | `/api/admin/generation-assets` | 管理员 | [route.ts](web/src/app/api/admin/generation-assets/route.ts) | [local-media-storage](web/src/lib/server/local-media-storage.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 管理后台 / 生成资产：查询、删除 |
| DELETE, GET | `/api/admin/generation-logs` | 管理员 | [route.ts](web/src/app/api/admin/generation-logs/route.ts) | [generation-log-store](web/src/lib/server/generation-log-store.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 生成日志：查询、删除 |
| GET | `/api/admin/generation-operations` | 管理员 | [route.ts](web/src/app/api/admin/generation-operations/route.ts) | [generation-operations-service](web/src/lib/server/generation-operations-service.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 生成运维：查询 |
| POST | `/api/admin/generation-operations/[type]/[id]/review` | 管理员 | [route.ts](web/src/app/api/admin/generation-operations/[type]/[id]/review/route.ts) | [generation-task-review-service](web/src/lib/server/generation-task-review-service.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 生成运维 / 指定任务类型 / 单项 / 审核：提交/执行 |
| GET | `/api/admin/generation-overview` | 管理员 | [route.ts](web/src/app/api/admin/generation-overview/route.ts) | [generation-overview-service](web/src/lib/server/generation-overview-service.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 生成概览：查询 |
| GET, POST | `/api/admin/ip-library` | 管理员 | [route.ts](web/src/app/api/admin/ip-library/route.ts) | [ip-library-admin-service](web/src/lib/server/ip-library-admin-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[ip-library-domain](web/src/lib/ip-library-domain.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / ip-library：查询、提交/执行 |
| DELETE, GET, PATCH | `/api/admin/ip-library/[id]` | 管理员 | [route.ts](web/src/app/api/admin/ip-library/[id]/route.ts) | [ip-library-admin-service](web/src/lib/server/ip-library-admin-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / ip-library / 单项：查询、更新、删除 |
| GET, POST | `/api/admin/ip-library/[id]/files` | 管理员 | [route.ts](web/src/app/api/admin/ip-library/[id]/files/route.ts) | [ip-library-admin-service](web/src/lib/server/ip-library-admin-service.ts)<br>[ip-library-file-storage](web/src/lib/server/ip-library-file-storage.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / ip-library / 单项 / 文件：查询、提交/执行 |
| DELETE, GET | `/api/admin/ip-library/[id]/files/[fileId]` | 管理员 | [route.ts](web/src/app/api/admin/ip-library/[id]/files/[fileId]/route.ts) | [ip-library-admin-service](web/src/lib/server/ip-library-admin-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / ip-library / 单项 / 文件 / [fileId]：查询、删除 |
| GET, POST | `/api/admin/ip-library/[id]/schools` | 管理员 | [route.ts](web/src/app/api/admin/ip-library/[id]/schools/route.ts) | [ip-library-admin-service](web/src/lib/server/ip-library-admin-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / ip-library / 单项 / schools：查询、提交/执行 |
| PATCH | `/api/admin/ip-library/[id]/schools/[grantId]` | 管理员 | [route.ts](web/src/app/api/admin/ip-library/[id]/schools/[grantId]/route.ts) | [ip-library-admin-service](web/src/lib/server/ip-library-admin-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / ip-library / 单项 / schools / [grantId]：更新 |
| POST | `/api/admin/ip-library/[id]/sub-ips` | 管理员 | [route.ts](web/src/app/api/admin/ip-library/[id]/sub-ips/route.ts) | [ip-library-admin-service](web/src/lib/server/ip-library-admin-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / ip-library / 单项 / sub-ips：提交/执行 |
| DELETE, PATCH | `/api/admin/ip-library/[id]/sub-ips/[subIpId]` | 管理员 | [route.ts](web/src/app/api/admin/ip-library/[id]/sub-ips/[subIpId]/route.ts) | [ip-library-admin-service](web/src/lib/server/ip-library-admin-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / ip-library / 单项 / sub-ips / [subIpId]：更新、删除 |
| GET | `/api/admin/ip-library/usage` | 管理员 | [route.ts](web/src/app/api/admin/ip-library/usage/route.ts) | [ip-library-admin-service](web/src/lib/server/ip-library-admin-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / ip-library / usage：查询 |
| POST | `/api/admin/login-page-media` | 管理员 | [route.ts](web/src/app/api/admin/login-page-media/route.ts) | [login-page-media](web/src/lib/server/login-page-media.ts)<br>[creative-upload](web/src/lib/creative-upload.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / login-page-media：提交/执行 |
| POST | `/api/admin/mail/test` | 管理员 | [route.ts](web/src/app/api/admin/mail/test/route.ts) | [store](web/src/lib/auth/store.ts)<br>[smtp](web/src/lib/mail/smtp.ts) | PostgreSQL、SMTP | 管理后台 / 邮件 / 测试：提交/执行 |
| POST | `/api/admin/models` | 管理员 | [route.ts](web/src/app/api/admin/models/route.ts) | [admin-channel-config](web/src/lib/server/admin-channel-config.ts)<br>[admin-model-catalog](web/src/lib/server/admin-model-catalog.ts)<br>[provider-task-config](web/src/lib/server/provider-task-config.ts) | PostgreSQL、加密渠道配置、模型上游 | 管理后台 / 模型目录：提交/执行 |
| GET, PATCH, POST | `/api/admin/object-storage` | 管理员 | [route.ts](web/src/app/api/admin/object-storage/route.ts) | [object-storage-service](web/src/lib/server/object-storage-service.ts)<br>[object-storage-config](web/src/lib/server/object-storage-config.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 管理后台 / 对象存储：查询、更新、提交/执行 |
| DELETE, GET | `/api/admin/object-storage/files` | 管理员 | [route.ts](web/src/app/api/admin/object-storage/files/route.ts) | [object-storage-service](web/src/lib/server/object-storage-service.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 管理后台 / 对象存储 / 文件：查询、删除 |
| POST | `/api/admin/object-storage/files/cleanup` | 管理员 | [route.ts](web/src/app/api/admin/object-storage/files/cleanup/route.ts) | [object-storage-service](web/src/lib/server/object-storage-service.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 管理后台 / 对象存储 / 文件 / cleanup：提交/执行 |
| GET | `/api/admin/object-storage/files/preview` | 管理员 | [route.ts](web/src/app/api/admin/object-storage/files/preview/route.ts) | [object-storage-service](web/src/lib/server/object-storage-service.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 管理后台 / 对象存储 / 文件 / 预览：查询 |
| POST | `/api/admin/object-storage/sync` | 管理员 | [route.ts](web/src/app/api/admin/object-storage/sync/route.ts) | [object-storage-service](web/src/lib/server/object-storage-service.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 管理后台 / 对象存储 / 迁移同步：提交/执行 |
| GET, POST | `/api/admin/prompts` | 管理员 | [route.ts](web/src/app/api/admin/prompts/route.ts) | [store](web/src/lib/auth/store.ts)<br>[store](web/src/lib/prompts/store.ts) | PostgreSQL、公开内容/站点设置 | 管理后台 / 提示词：查询、提交/执行 |
| DELETE, PATCH | `/api/admin/prompts/[id]` | 管理员 | [route.ts](web/src/app/api/admin/prompts/[id]/route.ts) | [store](web/src/lib/auth/store.ts)<br>[store](web/src/lib/prompts/store.ts) | PostgreSQL、公开内容/站点设置 | 管理后台 / 提示词 / 单项：更新、删除 |
| GET, PATCH | `/api/admin/referrals` | 管理员 | [route.ts](web/src/app/api/admin/referrals/route.ts) | [referral-service](web/src/lib/server/referral-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 邀请返利：查询、更新 |
| GET | `/api/admin/referrals/relationships` | 管理员 | [route.ts](web/src/app/api/admin/referrals/relationships/route.ts) | [referral-service](web/src/lib/server/referral-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 邀请返利 / 邀请关系：查询 |
| PATCH | `/api/admin/referrals/relationships/[id]` | 管理员 | [route.ts](web/src/app/api/admin/referrals/relationships/[id]/route.ts) | [referral-service](web/src/lib/server/referral-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 邀请返利 / 邀请关系 / 单项：更新 |
| GET | `/api/admin/referrals/rewards` | 管理员 | [route.ts](web/src/app/api/admin/referrals/rewards/route.ts) | [referral-service](web/src/lib/server/referral-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 邀请返利 / 奖励：查询 |
| POST | `/api/admin/referrals/settle` | 管理员 | [route.ts](web/src/app/api/admin/referrals/settle/route.ts) | [referral-service](web/src/lib/server/referral-service.ts) | PostgreSQL、积分/商业事务 | 管理后台 / 邀请返利 / 结算：提交/执行 |
| GET, POST | `/api/admin/runninghub/workflows` | 管理员 | [route.ts](web/src/app/api/admin/runninghub/workflows/route.ts) | [runninghub-workflow-service](web/src/lib/server/runninghub-workflow-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / runninghub / workflows：查询、提交/执行 |
| DELETE, GET, PUT | `/api/admin/runninghub/workflows/[workflowKey]` | 管理员 | [route.ts](web/src/app/api/admin/runninghub/workflows/[workflowKey]/route.ts) | [runninghub-workflow-service](web/src/lib/server/runninghub-workflow-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / runninghub / workflows / [workflowKey]：查询、删除、替换 |
| POST | `/api/admin/runninghub/workflows/[workflowKey]/fetch-json` | 管理员 | [route.ts](web/src/app/api/admin/runninghub/workflows/[workflowKey]/fetch-json/route.ts) | [runninghub-workflow-service](web/src/lib/server/runninghub-workflow-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / runninghub / workflows / [workflowKey] / fetch-json：提交/执行 |
| POST | `/api/admin/runninghub/workflows/[workflowKey]/test` | 管理员 | [route.ts](web/src/app/api/admin/runninghub/workflows/[workflowKey]/test/route.ts) | [runninghub-workflow-service](web/src/lib/server/runninghub-workflow-service.ts)<br>[runninghub-workflow-test-service](web/src/lib/server/runninghub-workflow-test-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / runninghub / workflows / [workflowKey] / 测试：提交/执行 |
| GET | `/api/admin/runninghub/workflows/[workflowKey]/test/[runId]` | 管理员 | [route.ts](web/src/app/api/admin/runninghub/workflows/[workflowKey]/test/[runId]/route.ts) | [runninghub-workflow-service](web/src/lib/server/runninghub-workflow-service.ts)<br>[runninghub-workflow-test-service](web/src/lib/server/runninghub-workflow-test-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / runninghub / workflows / [workflowKey] / 测试 / [runId]：查询 |
| POST | `/api/admin/runninghub/workflows/[workflowKey]/versions` | 管理员 | [route.ts](web/src/app/api/admin/runninghub/workflows/[workflowKey]/versions/route.ts) | [runninghub-workflow-service](web/src/lib/server/runninghub-workflow-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / runninghub / workflows / [workflowKey] / 版本：提交/执行 |
| POST | `/api/admin/runninghub/workflows/bootstrap` | 管理员 | [route.ts](web/src/app/api/admin/runninghub/workflows/bootstrap/route.ts) | [runninghub-workflow-service](web/src/lib/server/runninghub-workflow-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / runninghub / workflows / bootstrap：提交/执行 |
| POST | `/api/admin/runninghub/workflows/debug-discovery` | 管理员 | [route.ts](web/src/app/api/admin/runninghub/workflows/debug-discovery/route.ts) | [runninghub-workflow-service](web/src/lib/server/runninghub-workflow-service.ts)<br>[runninghub-provider](web/src/lib/server/runninghub-provider.ts)<br>[runninghub-workflow-discovery](web/src/lib/server/runninghub-workflow-discovery.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / runninghub / workflows / debug-discovery：提交/执行 |
| POST | `/api/admin/runninghub/workflows/debug-raw` | 管理员 | [route.ts](web/src/app/api/admin/runninghub/workflows/debug-raw/route.ts) | [runninghub-workflow-service](web/src/lib/server/runninghub-workflow-service.ts)<br>[runninghub-provider](web/src/lib/server/runninghub-provider.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / runninghub / workflows / debug-raw：提交/执行 |
| POST | `/api/admin/runninghub/workflows/discover` | 管理员 | [route.ts](web/src/app/api/admin/runninghub/workflows/discover/route.ts) | [runninghub-workflow-service](web/src/lib/server/runninghub-workflow-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / runninghub / workflows / discover：提交/执行 |
| GET | `/api/admin/school-compute` | 管理员 | [route.ts](web/src/app/api/admin/school-compute/route.ts) | [school-compute-service](web/src/lib/server/school-compute-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-compute-domain](web/src/lib/school-compute-domain.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / school-compute：查询 |
| GET, POST | `/api/admin/schools` | 管理员 | [route.ts](web/src/app/api/admin/schools/route.ts) | [school-tenant-service](web/src/lib/server/school-tenant-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-domain](web/src/lib/school-domain.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / schools：查询、提交/执行 |
| GET, PATCH | `/api/admin/schools/[id]` | 管理员 | [route.ts](web/src/app/api/admin/schools/[id]/route.ts) | [school-tenant-service](web/src/lib/server/school-tenant-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-domain](web/src/lib/school-domain.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / schools / 单项：查询、更新 |
| GET, PATCH | `/api/admin/schools/[id]/compute` | 管理员 | [route.ts](web/src/app/api/admin/schools/[id]/compute/route.ts) | [school-compute-service](web/src/lib/server/school-compute-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / schools / 单项 / compute：查询、更新 |
| POST | `/api/admin/schools/[id]/compute/credit` | 管理员 | [route.ts](web/src/app/api/admin/schools/[id]/compute/credit/route.ts) | [school-compute-service](web/src/lib/server/school-compute-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / schools / 单项 / compute / credit：提交/执行 |
| GET | `/api/admin/schools/[id]/compute/ledger` | 管理员 | [route.ts](web/src/app/api/admin/schools/[id]/compute/ledger/route.ts) | [school-compute-service](web/src/lib/server/school-compute-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / schools / 单项 / compute / ledger：查询 |
| GET | `/api/admin/schools/[id]/members` | 管理员 | [route.ts](web/src/app/api/admin/schools/[id]/members/route.ts) | [admin-school-member-points-service](web/src/lib/server/admin-school-member-points-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-domain](web/src/lib/school-domain.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / schools / 单项 / members：查询 |
| POST | `/api/admin/schools/[id]/members/[membershipId]/points-adjustments` | 管理员 | [route.ts](web/src/app/api/admin/schools/[id]/members/[membershipId]/points-adjustments/route.ts) | [admin-school-member-points-service](web/src/lib/server/admin-school-member-points-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-domain](web/src/lib/school-domain.ts) | PostgreSQL、积分/商业事务 | 管理后台 / schools / 单项 / members / [membershipId] / points-adjustments：提交/执行 |
| GET, PATCH | `/api/admin/settings` | 管理员 | [route.ts](web/src/app/api/admin/settings/route.ts) | [admin-channel-config](web/src/lib/server/admin-channel-config.ts)<br>[site-metadata](web/src/lib/server/site-metadata.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、加密渠道配置、模型上游 | 管理后台 / 系统设置：查询、更新 |
| POST | `/api/admin/settings/channels/[id]/api-key` | 管理员 | [route.ts](web/src/app/api/admin/settings/channels/[id]/api-key/route.ts) | [admin-channel-config](web/src/lib/server/admin-channel-config.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、加密渠道配置、模型上游 | 管理后台 / 系统设置 / 模型渠道 / 单项 / API Key：提交/执行 |
| GET, POST | `/api/admin/users` | 管理员 | [route.ts](web/src/app/api/admin/users/route.ts) | [store](web/src/lib/auth/store.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 用户：查询、提交/执行 |
| DELETE, PATCH | `/api/admin/users/[id]` | 管理员 | [route.ts](web/src/app/api/admin/users/[id]/route.ts) | [admin-user-deletion-service](web/src/lib/server/admin-user-deletion-service.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 用户 / 单项：更新、删除 |
| GET | `/api/admin/work-cases` | 管理员 | [route.ts](web/src/app/api/admin/work-cases/route.ts) | [work-governance-service](web/src/lib/server/work-governance-service.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 作品治理案件：查询 |
| POST | `/api/admin/work-cases/[id]/resolve` | 管理员 | [route.ts](web/src/app/api/admin/work-cases/[id]/resolve/route.ts) | [work-governance-service](web/src/lib/server/work-governance-service.ts) | PostgreSQL、管理配置、审计日志 | 管理后台 / 作品治理案件 / 单项 / 处理：提交/执行 |
| GET | `/api/admin/works` | 管理员 | [route.ts](web/src/app/api/admin/works/route.ts) | [work-publication-service](web/src/lib/server/work-publication-service.ts) | PostgreSQL、作品与社区数据 | 管理后台 / 作品：查询 |
| DELETE | `/api/admin/works/[id]` | 管理员 | [route.ts](web/src/app/api/admin/works/[id]/route.ts) | [work-publication-service](web/src/lib/server/work-publication-service.ts) | PostgreSQL、作品与社区数据 | 管理后台 / 作品 / 单项：删除 |
| POST | `/api/admin/works/[id]/feature` | 管理员 | [route.ts](web/src/app/api/admin/works/[id]/feature/route.ts) | [work-governance-service](web/src/lib/server/work-governance-service.ts) | PostgreSQL、作品与社区数据 | 管理后台 / 作品 / 单项 / 精选：提交/执行 |
| PATCH | `/api/admin/works/[id]/pull-film` | 管理员 | [route.ts](web/src/app/api/admin/works/[id]/pull-film/route.ts) | [public-work-process-service](web/src/lib/server/public-work-process-service.ts) | PostgreSQL、作品与社区数据 | 管理后台 / 作品 / 单项 / pull-film：更新 |
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
| GET | `/api/agent/runs/[id]/events` | 用户 | [route.ts](web/src/app/api/agent/runs/[id]/events/route.ts) | [agent-run-store](web/src/lib/server/agent-run-store.ts)<br>[creative-runtime-store](web/src/lib/server/creative-runtime-store.ts)<br>[agent-run-public](web/src/lib/server/agent-run-public.ts) | PostgreSQL、生成任务、模型上游 | Agent / 运行 / 单项 / 事件：查询 |
| POST | `/api/agent/runs/[id]/tasks/[taskId]/retry` | 混合 | [route.ts](web/src/app/api/agent/runs/[id]/tasks/[taskId]/retry/route.ts) | [agent-run-store](web/src/lib/server/agent-run-store.ts)<br>[generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts)<br>[generation-task-store](web/src/lib/server/generation-task-store.ts) | PostgreSQL、生成任务、模型上游 | Agent / 运行 / 单项 / 任务 / 指定任务 / 重试：提交/执行 |
| GET | `/api/agent/skills` | 用户 | [route.ts](web/src/app/api/agent/skills/route.ts) | [store](web/src/lib/auth/store.ts)<br>[store-types](web/src/lib/auth/store-types.ts) | PostgreSQL、生成任务、模型上游 | Agent / 技能：查询 |

### `ai`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| DELETE, GET, HEAD, PATCH, POST, PUT | `/api/ai/system/[channelId]/[...path]` | 混合 | [route.ts](web/src/app/api/ai/system/[channelId]/[...path]/route.ts) | [generation-charge-service](web/src/lib/server/generation-charge-service.ts)<br>[media-proxy-service](web/src/lib/server/media-proxy-service.ts)<br>[generation-errors](web/src/lib/server/generation-errors.ts) | 模型上游、积分、媒体代理 | 模型代理 / 系统渠道 / 指定渠道 / 指定路径：查询、读取元数据、更新、删除、提交/执行、替换 |

### `announcements`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/announcements` | 公开 | [route.ts](web/src/app/api/announcements/route.ts) | [store](web/src/lib/auth/store.ts) | PostgreSQL、公开内容/站点设置 | 公告：查询 |

### `audio-tasks`（2）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/audio-tasks` | 混合 | [route.ts](web/src/app/api/audio-tasks/route.ts) | [audio-task-store](web/src/lib/server/audio-task-store.ts)<br>[generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts)<br>[generation-task-store](web/src/lib/server/generation-task-store.ts) | PostgreSQL、积分、模型上游、媒体 | 音频任务：提交/执行 |
| GET, PATCH, POST | `/api/audio-tasks/[id]` | 混合 | [route.ts](web/src/app/api/audio-tasks/[id]/route.ts) | [audio-task-store](web/src/lib/server/audio-task-store.ts)<br>[generation-task-cancellation-service](web/src/lib/server/generation-task-cancellation-service.ts)<br>[generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts) | PostgreSQL、积分、模型上游、媒体 | 音频任务 / 单项：查询、更新、提交/执行 |

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

### `canvas`（4）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/canvas/image-decomposition` | 混合 | [route.ts](web/src/app/api/canvas/image-decomposition/route.ts) | [canvas-image-decomposition-service](web/src/lib/server/canvas-image-decomposition-service.ts)<br>[canvas-image-layer-grant](web/src/lib/server/canvas-image-layer-grant.ts)<br>[feature-module-access](web/src/lib/server/feature-module-access.ts) | PostgreSQL、创作数据 | 画布 / image-decomposition：提交/执行 |
| DELETE, GET, POST | `/api/canvas/projects` | 用户 | [route.ts](web/src/app/api/canvas/projects/route.ts) | [canvas-project-service](web/src/lib/server/canvas-project-service.ts)<br>[feature-module-access](web/src/lib/server/feature-module-access.ts) | PostgreSQL、创作数据 | 画布 / 项目：查询、删除、提交/执行 |
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
| DELETE, GET, POST | `/api/creative/conversations` | 用户 | [route.ts](web/src/app/api/creative/conversations/route.ts) | [creative-runtime-service](web/src/lib/server/creative-runtime-service.ts)<br>[feature-module-access](web/src/lib/server/feature-module-access.ts) | PostgreSQL、创作数据 | 创作运行时 / 创作对话：查询、删除、提交/执行 |
| DELETE, GET, PATCH | `/api/creative/conversations/[id]` | 用户 | [route.ts](web/src/app/api/creative/conversations/[id]/route.ts) | [creative-runtime-service](web/src/lib/server/creative-runtime-service.ts) | PostgreSQL、创作数据 | 创作运行时 / 创作对话 / 单项：查询、更新、删除 |
| GET | `/api/creative/conversations/[id]/assets` | 用户 | [route.ts](web/src/app/api/creative/conversations/[id]/assets/route.ts) | [creative-runtime-service](web/src/lib/server/creative-runtime-service.ts) | PostgreSQL、创作数据 | 创作运行时 / 创作对话 / 单项 / 资产：查询 |
| GET | `/api/creative/conversations/[id]/messages` | 用户 | [route.ts](web/src/app/api/creative/conversations/[id]/messages/route.ts) | [creative-runtime-service](web/src/lib/server/creative-runtime-service.ts) | PostgreSQL、创作数据 | 创作运行时 / 创作对话 / 单项 / 消息：查询 |

### `debug`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/debug/workflow-config` | 用户 | [route.ts](web/src/app/api/debug/workflow-config/route.ts) | [runninghub-workflow-domain](web/src/lib/server/runninghub-workflow-domain.ts)<br>[store](web/src/lib/auth/store.ts) | PostgreSQL | debug / workflow-config：查询 |

### `drama`（12）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/drama/analyze` | 用户 | [route.ts](web/src/app/api/drama/analyze/route.ts) | [generation-charge-service](web/src/lib/server/generation-charge-service.ts)<br>[drama-analysis](web/src/lib/server/drama-analysis.ts)<br>[drama-analysis-input](web/src/lib/server/drama-analysis-input.ts) | PostgreSQL、生成任务、FFmpeg、媒体 | 短剧 / 分析：提交/执行 |
| GET, POST | `/api/drama/projects` | 用户 | [route.ts](web/src/app/api/drama/projects/route.ts) | [drama-project-service](web/src/lib/server/drama-project-service.ts)<br>[feature-module-access](web/src/lib/server/feature-module-access.ts) | PostgreSQL、生成任务、FFmpeg、媒体 | 短剧 / 项目：查询、提交/执行 |
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

### `drama-lab`（45）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| DELETE, GET, POST | `/api/drama-lab/canvas-projects` | 混合 | [route.ts](web/src/app/api/drama-lab/canvas-projects/route.ts) | [canvas-project-service](web/src/lib/server/canvas-project-service.ts) | PostgreSQL、创作数据 | drama-lab / canvas-projects：查询、删除、提交/执行 |
| GET, PATCH | `/api/drama-lab/canvas-projects/[id]` | 用户 | [route.ts](web/src/app/api/drama-lab/canvas-projects/[id]/route.ts) | [canvas-project-service](web/src/lib/server/canvas-project-service.ts) | PostgreSQL、创作数据 | drama-lab / canvas-projects / 单项：查询、更新 |
| DELETE | `/api/drama-lab/canvas-projects/[id]/assistant-conversations` | 混合 | [route.ts](web/src/app/api/drama-lab/canvas-projects/[id]/assistant-conversations/route.ts) | [canvas-project-service](web/src/lib/server/canvas-project-service.ts) | PostgreSQL、创作数据 | drama-lab / canvas-projects / 单项 / 助手对话：删除 |
| POST | `/api/drama-lab/canvas-projects/[id]/writeback` | 混合 | [route.ts](web/src/app/api/drama-lab/canvas-projects/[id]/writeback/route.ts) | [canvas-project-service](web/src/lib/server/canvas-project-service.ts)<br>[drama-lab-canvas-writeback-service](web/src/lib/server/drama-lab-canvas-writeback-service.ts) | PostgreSQL、创作数据 | drama-lab / canvas-projects / 单项 / writeback：提交/执行 |
| GET, POST | `/api/drama-lab/invites/[token]` | 用户 | [route.ts](web/src/app/api/drama-lab/invites/[token]/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / invites / [token]：查询、提交/执行 |
| GET, POST | `/api/drama-lab/projects` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-project-service](web/src/lib/server/drama-project-service.ts)<br>[drama-project-store](web/src/lib/server/drama-project-store.ts) | PostgreSQL | drama-lab / 项目：查询、提交/执行 |
| DELETE, GET, PUT | `/api/drama-lab/projects/[id]` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/[id]/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-project-service](web/src/lib/server/drama-project-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项：查询、删除、替换 |
| GET, PUT | `/api/drama-lab/projects/[id]/collaboration` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/[id]/collaboration/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / collaboration：查询、替换 |
| GET, POST | `/api/drama-lab/projects/[id]/collaboration/approvals` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/[id]/collaboration/approvals/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / collaboration / approvals：查询、提交/执行 |
| GET, POST | `/api/drama-lab/projects/[id]/collaboration/approvals/[approvalId]` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/[id]/collaboration/approvals/[approvalId]/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / collaboration / approvals / [approvalId]：查询、提交/执行 |
| DELETE, GET, POST | `/api/drama-lab/projects/[id]/collaboration/invite` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/[id]/collaboration/invite/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / collaboration / invite：查询、删除、提交/执行 |
| DELETE, GET, POST | `/api/drama-lab/projects/[id]/collaboration/invites` | 公开 | [route.ts](web/src/app/api/drama-lab/projects/[id]/collaboration/invites/route.ts) | Route 内部实现 | PostgreSQL | drama-lab / 项目 / 单项 / collaboration / invites：查询、删除、提交/执行 |
| POST | `/api/drama-lab/projects/[id]/collaboration/join` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/[id]/collaboration/join/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / collaboration / join：提交/执行 |
| DELETE, GET | `/api/drama-lab/projects/[id]/collaboration/members` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/[id]/collaboration/members/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / collaboration / members：查询、删除 |
| DELETE, PATCH | `/api/drama-lab/projects/[id]/collaboration/members/[userId]` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/[id]/collaboration/members/[userId]/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / collaboration / members / 指定用户：更新、删除 |
| GET | `/api/drama-lab/projects/[id]/collaboration/requests` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/[id]/collaboration/requests/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / collaboration / requests：查询 |
| POST | `/api/drama-lab/projects/[id]/collaboration/requests/[requestId]` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/[id]/collaboration/requests/[requestId]/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / collaboration / requests / [requestId]：提交/执行 |
| GET | `/api/drama-lab/projects/[id]/collaboration/requests/mine` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/[id]/collaboration/requests/mine/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / collaboration / requests / mine：查询 |
| POST | `/api/drama-lab/projects/[id]/episode-canvas` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/[id]/episode-canvas/route.ts) | [canvas-project-service](web/src/lib/server/canvas-project-service.ts)<br>[drama-lab-episode-canvas-service](web/src/lib/server/drama-lab-episode-canvas-service.ts) | PostgreSQL、创作数据 | drama-lab / 项目 / 单项 / episode-canvas：提交/执行 |
| GET, POST | `/api/drama-lab/projects/[id]/episodes/[episodeId]/recover-generation` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/episodes/[episodeId]/recover-generation/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-video-recovery-service](web/src/lib/server/drama-lab-video-recovery-service.ts) | PostgreSQL | drama-lab / 项目 / 单项 / episodes / [episodeId] / recover-generation：查询、提交/执行 |
| GET | `/api/drama-lab/projects/[id]/export` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/[id]/export/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts)<br>[drama-lab-project-archive](web/src/lib/server/drama-lab-project-archive.ts) | PostgreSQL | drama-lab / 项目 / 单项 / 导出：查询 |
| POST | `/api/drama-lab/projects/[id]/export-jianying` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/[id]/export-jianying/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-jianying-export](web/src/lib/server/drama-jianying-export.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / 剪映导出：提交/执行 |
| POST | `/api/drama-lab/projects/[id]/extract-assets` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/[id]/extract-assets/route.ts) | [drama-lab-asset-extraction-service](web/src/lib/server/drama-lab-asset-extraction-service.ts)<br>[drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / extract-assets：提交/执行 |
| POST | `/api/drama-lab/projects/[id]/extract-storyboards` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/[id]/extract-storyboards/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-workflow-task-service](web/src/lib/server/drama-lab-workflow-task-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / extract-storyboards：提交/执行 |
| GET, PATCH, POST | `/api/drama-lab/projects/[id]/generate-script` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/generate-script/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-story-generation-service](web/src/lib/server/drama-lab-story-generation-service.ts)<br>[generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts) | PostgreSQL | drama-lab / 项目 / 单项 / generate-script：查询、更新、提交/执行 |
| POST | `/api/drama-lab/projects/[id]/import-novel` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/[id]/import-novel/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-novel-import-service](web/src/lib/server/drama-lab-novel-import-service.ts)<br>[feature-module-access](web/src/lib/server/feature-module-access.ts) | PostgreSQL | drama-lab / 项目 / 单项 / import-novel：提交/执行 |
| POST | `/api/drama-lab/projects/[id]/shots/[shotId]/accept-first-frame-candidate` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/accept-first-frame-candidate/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-tail-frame-service](web/src/lib/server/drama-lab-tail-frame-service.ts) | PostgreSQL | drama-lab / 项目 / 单项 / shots / [shotId] / accept-first-frame-candidate：提交/执行 |
| POST | `/api/drama-lab/projects/[id]/shots/[shotId]/extract-tail-frame` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/extract-tail-frame/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-tail-frame-service](web/src/lib/server/drama-lab-tail-frame-service.ts)<br>[feature-module-access](web/src/lib/server/feature-module-access.ts) | PostgreSQL | drama-lab / 项目 / 单项 / shots / [shotId] / extract-tail-frame：提交/执行 |
| POST | `/api/drama-lab/projects/[id]/shots/[shotId]/frames/[frameType]/lock` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/frames/[frameType]/lock/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-shot-generation-service](web/src/lib/server/drama-lab-shot-generation-service.ts)<br>[drama-project-contract](web/src/lib/drama-project-contract.ts) | PostgreSQL | drama-lab / 项目 / 单项 / shots / [shotId] / frames / [frameType] / lock：提交/执行 |
| POST | `/api/drama-lab/projects/[id]/shots/[shotId]/frames/upload` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/frames/upload/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-shot-generation-service](web/src/lib/server/drama-lab-shot-generation-service.ts)<br>[reference-asset-store](web/src/lib/server/reference-asset-store.ts) | PostgreSQL | drama-lab / 项目 / 单项 / shots / [shotId] / frames / upload：提交/执行 |
| POST | `/api/drama-lab/projects/[id]/shots/[shotId]/generate-audio` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/generate-audio/route.ts) | [audio-task-store](web/src/lib/server/audio-task-store.ts)<br>[drama-lab-audio-service](web/src/lib/server/drama-lab-audio-service.ts)<br>[drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts) | PostgreSQL | drama-lab / 项目 / 单项 / shots / [shotId] / generate-audio：提交/执行 |
| POST | `/api/drama-lab/projects/[id]/shots/[shotId]/generate-frame` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/generate-frame/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-frame-generation-service](web/src/lib/server/drama-lab-frame-generation-service.ts)<br>[drama-lab-shot-generation-service](web/src/lib/server/drama-lab-shot-generation-service.ts) | PostgreSQL | drama-lab / 项目 / 单项 / shots / [shotId] / generate-frame：提交/执行 |
| POST | `/api/drama-lab/projects/[id]/shots/[shotId]/generate-image` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/generate-image/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-shot-generation-service](web/src/lib/server/drama-lab-shot-generation-service.ts)<br>[drama-project-store](web/src/lib/server/drama-project-store.ts) | PostgreSQL | drama-lab / 项目 / 单项 / shots / [shotId] / generate-image：提交/执行 |
| POST | `/api/drama-lab/projects/[id]/shots/[shotId]/generate-video` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/generate-video/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-shot-generation-service](web/src/lib/server/drama-lab-shot-generation-service.ts)<br>[drama-project-store](web/src/lib/server/drama-project-store.ts) | PostgreSQL | drama-lab / 项目 / 单项 / shots / [shotId] / generate-video：提交/执行 |
| POST | `/api/drama-lab/projects/[id]/shots/[shotId]/recover-audio` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/recover-audio/route.ts) | [audio-task-store](web/src/lib/server/audio-task-store.ts)<br>[drama-lab-audio-service](web/src/lib/server/drama-lab-audio-service.ts)<br>[drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts) | PostgreSQL | drama-lab / 项目 / 单项 / shots / [shotId] / recover-audio：提交/执行 |
| POST | `/api/drama-lab/projects/[id]/shots/[shotId]/split-by-audio` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/split-by-audio/route.ts) | [drama-lab-audio-split-service](web/src/lib/server/drama-lab-audio-split-service.ts)<br>[drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-project-store](web/src/lib/server/drama-project-store.ts) | PostgreSQL | drama-lab / 项目 / 单项 / shots / [shotId] / split-by-audio：提交/执行 |
| POST | `/api/drama-lab/projects/[id]/shots/[shotId]/sync-audio` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/sync-audio/route.ts) | [drama-lab-audio-service](web/src/lib/server/drama-lab-audio-service.ts)<br>[drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-project-store](web/src/lib/server/drama-project-store.ts) | PostgreSQL | drama-lab / 项目 / 单项 / shots / [shotId] / sync-audio：提交/执行 |
| POST | `/api/drama-lab/projects/[id]/shots/[shotId]/sync-generation` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/shots/[shotId]/sync-generation/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-shot-generation-service](web/src/lib/server/drama-lab-shot-generation-service.ts)<br>[drama-project-store](web/src/lib/server/drama-project-store.ts) | PostgreSQL | drama-lab / 项目 / 单项 / shots / [shotId] / sync-generation：提交/执行 |
| GET | `/api/drama-lab/projects/[id]/tasks` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/tasks/route.ts) | [drama-lab-task-service](web/src/lib/server/drama-lab-task-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / 任务：查询 |
| POST | `/api/drama-lab/projects/[id]/tasks/[taskId]/cancel` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/tasks/[taskId]/cancel/route.ts) | [drama-lab-task-service](web/src/lib/server/drama-lab-task-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / 任务 / 指定任务 / 取消：提交/执行 |
| POST | `/api/drama-lab/projects/[id]/tasks/[taskId]/recheck` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/tasks/[taskId]/recheck/route.ts) | [drama-lab-task-service](web/src/lib/server/drama-lab-task-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / 任务 / 指定任务 / recheck：提交/执行 |
| POST | `/api/drama-lab/projects/[id]/tasks/[taskId]/retry` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/tasks/[taskId]/retry/route.ts) | [drama-lab-task-service](web/src/lib/server/drama-lab-task-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / 任务 / 指定任务 / 重试：提交/执行 |
| GET, PATCH, POST | `/api/drama-lab/projects/[id]/workflow` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/workflow/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-workflow-task-service](web/src/lib/server/drama-lab-workflow-task-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / workflow：查询、更新、提交/执行 |
| GET | `/api/drama-lab/projects/[id]/workflow/export/[artifactId]` | 混合 | [route.ts](web/src/app/api/drama-lab/projects/[id]/workflow/export/[artifactId]/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[drama-lab-workflow-task-service](web/src/lib/server/drama-lab-workflow-task-service.ts)<br>[drama-lab-collaboration-error](web/src/lib/server/drama-lab-collaboration-error.ts) | PostgreSQL | drama-lab / 项目 / 单项 / workflow / 导出 / [artifactId]：查询 |
| POST | `/api/drama-lab/projects/import` | 用户 | [route.ts](web/src/app/api/drama-lab/projects/import/route.ts) | [drama-lab-project-archive](web/src/lib/server/drama-lab-project-archive.ts) | PostgreSQL | drama-lab / 项目 / 导入：提交/执行 |

### `generation-log-assets`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET, HEAD | `/api/generation-log-assets/[...path]` | 混合 | [route.ts](web/src/app/api/generation-log-assets/[...path]/route.ts) | [generation-log-store](web/src/lib/server/generation-log-store.ts)<br>[object-storage-service](web/src/lib/server/object-storage-service.ts)<br>[data-dir](web/src/lib/server/data-dir.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 生成日志媒体 / 指定路径：查询、读取元数据 |

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
| GET, PATCH, POST | `/api/image-tasks/[id]` | 混合 | [route.ts](web/src/app/api/image-tasks/[id]/route.ts) | [generation-task-cancellation-service](web/src/lib/server/generation-task-cancellation-service.ts)<br>[generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts)<br>[generation-task-store](web/src/lib/server/generation-task-store.ts) | PostgreSQL、积分、模型上游、媒体 | 图像任务 / 单项：查询、更新、提交/执行 |

### `install`（2）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/install/initialize` | 混合 | [route.ts](web/src/app/api/install/initialize/route.ts) | [install-status](web/src/lib/server/install-status.ts) | PostgreSQL、安装令牌、加密配置 | 使用一次性安装令牌初始化 PostgreSQL 表结构 |
| GET | `/api/install/status` | 公开 | [route.ts](web/src/app/api/install/status/route.ts) | [install-status](web/src/lib/server/install-status.ts) | PostgreSQL、安装令牌、加密配置 | 安装 / 状态：查询 |

### `ip-library`（5）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/ip-library` | 用户 | [route.ts](web/src/app/api/ip-library/route.ts) | [ip-library-service](web/src/lib/server/ip-library-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[ip-library-domain](web/src/lib/ip-library-domain.ts) | PostgreSQL | ip-library：查询 |
| GET | `/api/ip-library/[id]` | 用户 | [route.ts](web/src/app/api/ip-library/[id]/route.ts) | [ip-library-service](web/src/lib/server/ip-library-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | ip-library / 单项：查询 |
| GET | `/api/ip-library/[id]/cover` | 用户 | [route.ts](web/src/app/api/ip-library/[id]/cover/route.ts) | [ip-library-download-service](web/src/lib/server/ip-library-download-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | ip-library / 单项 / cover：查询 |
| POST | `/api/ip-library/[id]/download` | 用户 | [route.ts](web/src/app/api/ip-library/[id]/download/route.ts) | [ip-library-download-service](web/src/lib/server/ip-library-download-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | ip-library / 单项 / download：提交/执行 |
| GET | `/api/ip-library/[id]/items/[itemId]/media` | 用户 | [route.ts](web/src/app/api/ip-library/[id]/items/[itemId]/media/route.ts) | [ip-library-download-service](web/src/lib/server/ip-library-download-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | ip-library / 单项 / items / [itemId] / 媒体：查询 |

### `library-assets`（2）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET, POST | `/api/library-assets` | 用户 | [route.ts](web/src/app/api/library-assets/route.ts) | [library-asset-service](web/src/lib/server/library-asset-service.ts)<br>[feature-module-access](web/src/lib/server/feature-module-access.ts) | PostgreSQL、创作数据 | 素材库：查询、提交/执行 |
| DELETE, PATCH | `/api/library-assets/[id]` | 用户 | [route.ts](web/src/app/api/library-assets/[id]/route.ts) | [library-asset-service](web/src/lib/server/library-asset-service.ts)<br>[feature-module-access](web/src/lib/server/feature-module-access.ts) | PostgreSQL、创作数据 | 素材库 / 单项：更新、删除 |

### `login-page-media`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/login-page-media/[fileName]` | 公开 | [route.ts](web/src/app/api/login-page-media/[fileName]/route.ts) | [local-media-response](web/src/lib/server/local-media-response.ts)<br>[login-page-media](web/src/lib/server/login-page-media.ts) | PostgreSQL | login-page-media / [fileName]：查询 |

### `maintenance`（6）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/maintenance/billing-orders/expire` | 维护 | [route.ts](web/src/app/api/maintenance/billing-orders/expire/route.ts) | [billing-order-expiration-service](web/src/lib/server/billing-order-expiration-service.ts)<br>[maintenance-auth](web/src/lib/server/maintenance-auth.ts) | 维护 Token、PostgreSQL | 后台维护 / 计费订单 / 过期处理：提交/执行 |
| POST | `/api/maintenance/billing-refunds/run` | Worker | [route.ts](web/src/app/api/maintenance/billing-refunds/run/route.ts) | [billing-refund-orchestration-service](web/src/lib/server/billing-refund-orchestration-service.ts)<br>[install-status](web/src/lib/server/install-status.ts)<br>[maintenance-auth](web/src/lib/server/maintenance-auth.ts) | Worker Token、PostgreSQL、支付退款 | 后台维护 / 计费退款 / 执行：提交/执行 |
| POST | `/api/maintenance/data-lifecycle/run` | 维护 | [route.ts](web/src/app/api/maintenance/data-lifecycle/run/route.ts) | [data-lifecycle-service](web/src/lib/server/data-lifecycle-service.ts)<br>[maintenance-auth](web/src/lib/server/maintenance-auth.ts) | 维护 Token、PostgreSQL | 后台维护 / 数据生命周期 / 执行：提交/执行 |
| POST | `/api/maintenance/generation-tasks/heartbeat` | Worker | [route.ts](web/src/app/api/maintenance/generation-tasks/heartbeat/route.ts) | [generation-worker-heartbeat](web/src/lib/server/generation-worker-heartbeat.ts)<br>[install-status](web/src/lib/server/install-status.ts)<br>[maintenance-auth](web/src/lib/server/maintenance-auth.ts) | Worker Token、PostgreSQL、模型上游 | 后台维护 / 生成任务 / 心跳：提交/执行 |
| POST | `/api/maintenance/generation-tasks/run` | Worker | [route.ts](web/src/app/api/maintenance/generation-tasks/run/route.ts) | [generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts)<br>[generation-task-scheduler](web/src/lib/server/generation-task-scheduler.ts)<br>[install-status](web/src/lib/server/install-status.ts) | Worker Token、PostgreSQL、模型上游 | 后台维护 / 生成任务 / 执行：提交/执行 |
| POST | `/api/maintenance/referrals/settle` | 维护 | [route.ts](web/src/app/api/maintenance/referrals/settle/route.ts) | [referral-service](web/src/lib/server/referral-service.ts)<br>[maintenance-auth](web/src/lib/server/maintenance-auth.ts) | 维护 Token、PostgreSQL | 后台维护 / 邀请返利 / 结算：提交/执行 |

### `media-assets`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| DELETE | `/api/media-assets` | 用户 | [route.ts](web/src/app/api/media-assets/route.ts) | [user-media-deletion-service](web/src/lib/server/user-media-deletion-service.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 媒体资产：删除 |

### `media-proxy`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET, HEAD | `/api/media-proxy` | 用户 | [route.ts](web/src/app/api/media-proxy/route.ts) | [media-proxy-service](web/src/lib/server/media-proxy-service.ts)<br>[media-concurrency](web/src/lib/server/media-concurrency.ts)<br>[media-content-validation](web/src/lib/server/media-content-validation.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 媒体代理：查询、读取元数据 |

### `my-prompts`（2）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET, POST | `/api/my-prompts` | 用户 | [route.ts](web/src/app/api/my-prompts/route.ts) | [feature-module-access](web/src/lib/server/feature-module-access.ts)<br>[store](web/src/lib/auth/store.ts)<br>[store](web/src/lib/prompts/store.ts) | PostgreSQL、公开内容/站点设置 | 个人提示词：查询、提交/执行 |
| DELETE, PATCH | `/api/my-prompts/[id]` | 用户 | [route.ts](web/src/app/api/my-prompts/[id]/route.ts) | [feature-module-access](web/src/lib/server/feature-module-access.ts)<br>[store](web/src/lib/auth/store.ts)<br>[store](web/src/lib/prompts/store.ts) | PostgreSQL、公开内容/站点设置 | 个人提示词 / 单项：更新、删除 |

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

### `practice`（5）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/practice/modules` | 混合 | [route.ts](web/src/app/api/practice/modules/route.ts) | [practice-module-service](web/src/lib/server/practice-module-service.ts) | PostgreSQL | practice / modules：查询 |
| GET, POST | `/api/practice/projects` | 混合 | [route.ts](web/src/app/api/practice/projects/route.ts) | [practice-project-service](web/src/lib/server/practice-project-service.ts)<br>[feature-module-access](web/src/lib/server/feature-module-access.ts) | PostgreSQL | practice / 项目：查询、提交/执行 |
| GET | `/api/practice/projects/[id]` | 混合 | [route.ts](web/src/app/api/practice/projects/[id]/route.ts) | [practice-project-service](web/src/lib/server/practice-project-service.ts) | PostgreSQL | practice / 项目 / 单项：查询 |
| GET, POST | `/api/practice/sessions` | 混合 | [route.ts](web/src/app/api/practice/sessions/route.ts) | [practice-session-service](web/src/lib/server/practice-session-service.ts)<br>[generation-execution-policy](web/src/lib/server/generation-execution-policy.ts)<br>[runninghub-workflow-runtime](web/src/lib/server/runninghub-workflow-runtime.ts) | PostgreSQL | practice / sessions：查询、提交/执行 |
| DELETE, GET, POST | `/api/practice/sessions/[id]` | 混合 | [route.ts](web/src/app/api/practice/sessions/[id]/route.ts) | [practice-session-service](web/src/lib/server/practice-session-service.ts)<br>[generation-execution-policy](web/src/lib/server/generation-execution-policy.ts)<br>[runninghub-workflow-runtime](web/src/lib/server/runninghub-workflow-runtime.ts) | PostgreSQL | practice / sessions / 单项：查询、删除、提交/执行 |

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
| POST | `/api/public/works/[slug]/copy-to-practice` | 混合 | [route.ts](web/src/app/api/public/works/[slug]/copy-to-practice/route.ts) | [public-work-process-service](web/src/lib/server/public-work-process-service.ts) | PostgreSQL、作品与社区数据 | 公开访问 / 作品 / 指定作品 / copy-to-practice：提交/执行 |
| GET, HEAD | `/api/public/works/[slug]/media/[assetId]` | 公开 | [route.ts](web/src/app/api/public/works/[slug]/media/[assetId]/route.ts) | [object-storage-service](web/src/lib/server/object-storage-service.ts)<br>[reference-asset-store](web/src/lib/server/reference-asset-store.ts)<br>[work-publication-service](web/src/lib/server/work-publication-service.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 公开访问 / 作品 / 指定作品 / 媒体 / 指定媒体：查询、读取元数据 |
| GET | `/api/public/works/[slug]/process` | 公开 | [route.ts](web/src/app/api/public/works/[slug]/process/route.ts) | [public-work-process-service](web/src/lib/server/public-work-process-service.ts) | PostgreSQL、作品与社区数据 | 公开访问 / 作品 / 指定作品 / process：查询 |
| POST | `/api/public/works/[slug]/report` | 用户 | [route.ts](web/src/app/api/public/works/[slug]/report/route.ts) | [work-governance-service](web/src/lib/server/work-governance-service.ts) | PostgreSQL、作品与社区数据 | 公开访问 / 作品 / 指定作品 / 举报：提交/执行 |
| POST | `/api/public/works/[slug]/view` | 公开 | [route.ts](web/src/app/api/public/works/[slug]/view/route.ts) | [work-publication-service](web/src/lib/server/work-publication-service.ts) | PostgreSQL、作品与社区数据 | 公开访问 / 作品 / 指定作品 / 访问计数：提交/执行 |

### `reference-assets`（2）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/reference-assets` | 混合 | [route.ts](web/src/app/api/reference-assets/route.ts) | [reference-asset-store](web/src/lib/server/reference-asset-store.ts)<br>[reference-asset-access](web/src/lib/server/reference-asset-access.ts)<br>[creative-upload](web/src/lib/creative-upload.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 参考素材：提交/执行 |
| GET, HEAD | `/api/reference-assets/[...path]` | 混合 | [route.ts](web/src/app/api/reference-assets/[...path]/route.ts) | [drama-lab-collaboration-service](web/src/lib/server/drama-lab-collaboration-service.ts)<br>[library-asset-store](web/src/lib/server/library-asset-store.ts)<br>[object-storage-service](web/src/lib/server/object-storage-service.ts) | PostgreSQL、本地媒体、S3 兼容存储 | 参考素材 / 指定路径：查询、读取元数据 |

### `referrals`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/referrals` | 用户 | [route.ts](web/src/app/api/referrals/route.ts) | [referral-service](web/src/lib/server/referral-service.ts) | PostgreSQL、积分/商业事务 | 邀请返利：查询 |

### `school`（27）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET, POST | `/api/school/classes` | 用户 | [route.ts](web/src/app/api/school/classes/route.ts) | [school-tenant-service](web/src/lib/server/school-tenant-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-domain](web/src/lib/school-domain.ts) | PostgreSQL | school / classes：查询、提交/执行 |
| DELETE, GET, PATCH | `/api/school/classes/[id]` | 用户 | [route.ts](web/src/app/api/school/classes/[id]/route.ts) | [school-tenant-service](web/src/lib/server/school-tenant-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-domain](web/src/lib/school-domain.ts) | PostgreSQL | school / classes / 单项：查询、更新、删除 |
| GET | `/api/school/commercial-orders` | 用户 | [route.ts](web/src/app/api/school/commercial-orders/route.ts) | [commercial-order-service](web/src/lib/server/commercial-order-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | school / commercial-orders：查询 |
| GET, PATCH | `/api/school/commercial-orders/[id]` | 用户 | [route.ts](web/src/app/api/school/commercial-orders/[id]/route.ts) | [commercial-order-service](web/src/lib/server/commercial-order-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | school / commercial-orders / 单项：查询、更新 |
| GET | `/api/school/compute` | 用户 | [route.ts](web/src/app/api/school/compute/route.ts) | [school-compute-service](web/src/lib/server/school-compute-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | school / compute：查询 |
| GET | `/api/school/compute/ledger` | 用户 | [route.ts](web/src/app/api/school/compute/ledger/route.ts) | [school-compute-service](web/src/lib/server/school-compute-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | school / compute / ledger：查询 |
| GET | `/api/school/context` | 用户 | [route.ts](web/src/app/api/school/context/route.ts) | [school-access-service](web/src/lib/server/school-access-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | school / context：查询 |
| DELETE, PUT | `/api/school/course-material-uploads` | 混合 | [route.ts](web/src/app/api/school/course-material-uploads/route.ts) | [course-attachment-service](web/src/lib/server/course-attachment-service.ts)<br>[school-access-service](web/src/lib/server/school-access-service.ts) | PostgreSQL | school / course-material-uploads：删除、替换 |
| DELETE, PATCH | `/api/school/course-materials/[id]` | 混合 | [route.ts](web/src/app/api/school/course-materials/[id]/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | school / course-materials / 单项：更新、删除 |
| GET | `/api/school/courses` | 用户 | [route.ts](web/src/app/api/school/courses/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | school / courses：查询 |
| POST | `/api/school/courses/[id]/materials` | 用户 | [route.ts](web/src/app/api/school/courses/[id]/materials/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | school / courses / 单项 / materials：提交/执行 |
| GET, POST | `/api/school/courses/[id]/offerings` | 用户 | [route.ts](web/src/app/api/school/courses/[id]/offerings/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-domain](web/src/lib/school-domain.ts) | PostgreSQL | school / courses / 单项 / offerings：查询、提交/执行 |
| GET | `/api/school/courses/[id]/tree` | 用户 | [route.ts](web/src/app/api/school/courses/[id]/tree/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | school / courses / 单项 / tree：查询 |
| POST | `/api/school/invitations` | 用户 | [route.ts](web/src/app/api/school/invitations/route.ts) | [school-member-provisioning-service](web/src/lib/server/school-member-provisioning-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-domain](web/src/lib/school-domain.ts) | PostgreSQL | school / invitations：提交/执行 |
| GET, POST | `/api/school/invitations/join` | 用户 | [route.ts](web/src/app/api/school/invitations/join/route.ts) | [school-member-provisioning-service](web/src/lib/server/school-member-provisioning-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | school / invitations / join：查询、提交/执行 |
| GET | `/api/school/ip-library` | 混合 | [route.ts](web/src/app/api/school/ip-library/route.ts) | [school-ip-library-service](web/src/lib/server/school-ip-library-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | school / ip-library：查询 |
| GET, POST | `/api/school/members` | 用户 | [route.ts](web/src/app/api/school/members/route.ts) | [school-member-provisioning-service](web/src/lib/server/school-member-provisioning-service.ts)<br>[school-tenant-service](web/src/lib/server/school-tenant-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | school / members：查询、提交/执行 |
| DELETE, PATCH | `/api/school/members/[id]` | 用户 | [route.ts](web/src/app/api/school/members/[id]/route.ts) | [school-tenant-service](web/src/lib/server/school-tenant-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-domain](web/src/lib/school-domain.ts) | PostgreSQL | school / members / 单项：更新、删除 |
| POST | `/api/school/members/import` | 用户 | [route.ts](web/src/app/api/school/members/import/route.ts) | [school-member-provisioning-service](web/src/lib/server/school-member-provisioning-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-domain](web/src/lib/school-domain.ts) | PostgreSQL | school / members / 导入：提交/执行 |
| GET, POST | `/api/school/production-groups` | 用户 | [route.ts](web/src/app/api/school/production-groups/route.ts) | [school-production-group-service](web/src/lib/server/school-production-group-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-compute-domain](web/src/lib/school-compute-domain.ts) | PostgreSQL | school / production-groups：查询、提交/执行 |
| GET, PATCH | `/api/school/production-groups/[id]` | 用户 | [route.ts](web/src/app/api/school/production-groups/[id]/route.ts) | [school-production-group-service](web/src/lib/server/school-production-group-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-compute-domain](web/src/lib/school-compute-domain.ts) | PostgreSQL | school / production-groups / 单项：查询、更新 |
| POST | `/api/school/production-groups/[id]/allocate` | 用户 | [route.ts](web/src/app/api/school/production-groups/[id]/allocate/route.ts) | [school-production-group-service](web/src/lib/server/school-production-group-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | school / production-groups / 单项 / allocate：提交/执行 |
| GET, PATCH | `/api/school/production-groups/[id]/allocation-requests` | 用户 | [route.ts](web/src/app/api/school/production-groups/[id]/allocation-requests/route.ts) | [school-production-group-service](web/src/lib/server/school-production-group-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | school / production-groups / 单项 / allocation-requests：查询、更新 |
| PATCH | `/api/school/production-groups/[id]/members` | 用户 | [route.ts](web/src/app/api/school/production-groups/[id]/members/route.ts) | [school-production-group-service](web/src/lib/server/school-production-group-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | school / production-groups / 单项 / members：更新 |
| GET | `/api/school/production-groups/[id]/settlements` | 用户 | [route.ts](web/src/app/api/school/production-groups/[id]/settlements/route.ts) | [school-compute-settlement-service](web/src/lib/server/school-compute-settlement-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | school / production-groups / 单项 / settlements：查询 |
| POST | `/api/school/production-groups/[id]/settlements/[settlementId]/confirm` | 用户 | [route.ts](web/src/app/api/school/production-groups/[id]/settlements/[settlementId]/confirm/route.ts) | [school-compute-settlement-service](web/src/lib/server/school-compute-settlement-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | school / production-groups / 单项 / settlements / [settlementId] / confirm：提交/执行 |
| GET, PATCH | `/api/school/profile` | 用户 | [route.ts](web/src/app/api/school/profile/route.ts) | [school-tenant-service](web/src/lib/server/school-tenant-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-domain](web/src/lib/school-domain.ts) | PostgreSQL | school / 个人资料：查询、更新 |

### `site-icon`（1）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/site-icon` | 公开 | [route.ts](web/src/app/api/site-icon/route.ts) | [site-metadata](web/src/lib/server/site-metadata.ts) | PostgreSQL、公开内容/站点设置 | 站点图标：查询 |

### `teaching`（15）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET, POST | `/api/teaching/assignments` | 用户 | [route.ts](web/src/app/api/teaching/assignments/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-domain](web/src/lib/school-domain.ts) | PostgreSQL | teaching / assignments：查询、提交/执行 |
| GET, PATCH | `/api/teaching/assignments/[id]` | 用户 | [route.ts](web/src/app/api/teaching/assignments/[id]/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-domain](web/src/lib/school-domain.ts) | PostgreSQL | teaching / assignments / 单项：查询、更新 |
| GET, POST | `/api/teaching/assignments/[id]/submissions` | 用户 | [route.ts](web/src/app/api/teaching/assignments/[id]/submissions/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | teaching / assignments / 单项 / submissions：查询、提交/执行 |
| GET | `/api/teaching/commercial-orders` | 用户 | [route.ts](web/src/app/api/teaching/commercial-orders/route.ts) | [commercial-order-service](web/src/lib/server/commercial-order-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | teaching / commercial-orders：查询 |
| GET | `/api/teaching/commercial-orders/[id]/participants` | 用户 | [route.ts](web/src/app/api/teaching/commercial-orders/[id]/participants/route.ts) | [commercial-order-service](web/src/lib/server/commercial-order-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | teaching / commercial-orders / 单项 / participants：查询 |
| GET, POST | `/api/teaching/commercial-orders/[id]/submissions` | 用户 | [route.ts](web/src/app/api/teaching/commercial-orders/[id]/submissions/route.ts) | [commercial-order-service](web/src/lib/server/commercial-order-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | teaching / commercial-orders / 单项 / submissions：查询、提交/执行 |
| GET | `/api/teaching/courses` | 用户 | [route.ts](web/src/app/api/teaching/courses/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | teaching / courses：查询 |
| GET | `/api/teaching/offerings` | 用户 | [route.ts](web/src/app/api/teaching/offerings/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | teaching / offerings：查询 |
| GET | `/api/teaching/production-groups` | 用户 | [route.ts](web/src/app/api/teaching/production-groups/route.ts) | [school-production-group-service](web/src/lib/server/school-production-group-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | teaching / production-groups：查询 |
| GET, POST | `/api/teaching/production-groups/[id]/allocation-requests` | 用户 | [route.ts](web/src/app/api/teaching/production-groups/[id]/allocation-requests/route.ts) | [school-production-group-service](web/src/lib/server/school-production-group-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | teaching / production-groups / 单项 / allocation-requests：查询、提交/执行 |
| GET, POST | `/api/teaching/production-groups/[id]/personal-advances` | 用户 | [route.ts](web/src/app/api/teaching/production-groups/[id]/personal-advances/route.ts) | [school-compute-advance-service](web/src/lib/server/school-compute-advance-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | teaching / production-groups / 单项 / personal-advances：查询、提交/执行 |
| DELETE, POST | `/api/teaching/production-groups/[id]/projects` | 用户 | [route.ts](web/src/app/api/teaching/production-groups/[id]/projects/route.ts) | [school-production-group-service](web/src/lib/server/school-production-group-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | teaching / production-groups / 单项 / 项目：删除、提交/执行 |
| GET | `/api/teaching/project-billing` | 用户 | [route.ts](web/src/app/api/teaching/project-billing/route.ts) | [school-api-response](web/src/lib/server/school-api-response.ts)<br>[school-compute-billing-context](web/src/lib/server/school-compute-billing-context.ts) | PostgreSQL、积分/商业事务 | teaching / project-billing：查询 |
| GET | `/api/teaching/submissions` | 用户 | [route.ts](web/src/app/api/teaching/submissions/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | teaching / submissions：查询 |
| POST | `/api/teaching/submissions/[id]/review` | 用户 | [route.ts](web/src/app/api/teaching/submissions/[id]/review/route.ts) | [school-course-service](web/src/lib/server/school-course-service.ts)<br>[school-api-response](web/src/lib/server/school-api-response.ts) | PostgreSQL | teaching / submissions / 单项 / 审核：提交/执行 |

### `text-tasks`（2）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/text-tasks` | 混合 | [route.ts](web/src/app/api/text-tasks/route.ts) | [generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts)<br>[generation-task-store](web/src/lib/server/generation-task-store.ts)<br>[ip-library-reference-service](web/src/lib/server/ip-library-reference-service.ts) | PostgreSQL、积分、模型上游、媒体 | 文本任务：提交/执行 |
| GET, PATCH, POST | `/api/text-tasks/[id]` | 混合 | [route.ts](web/src/app/api/text-tasks/[id]/route.ts) | [generation-task-cancellation-service](web/src/lib/server/generation-task-cancellation-service.ts)<br>[generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts)<br>[generation-task-store](web/src/lib/server/generation-task-store.ts) | PostgreSQL、积分、模型上游、媒体 | 文本任务 / 单项：查询、更新、提交/执行 |

### `video-generation-tasks`（2）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/video-generation-tasks` | 混合 | [route.ts](web/src/app/api/video-generation-tasks/route.ts) | [video-generation-route](web/src/app/api/video-generation-tasks/video-generation-route.ts)<br>[generation-task-scheduler](web/src/lib/server/generation-task-scheduler.ts) | PostgreSQL、积分、模型上游、媒体 | 视频生成任务：提交/执行 |
| GET | `/api/video-generation-tasks/[id]` | 用户 | [route.ts](web/src/app/api/video-generation-tasks/[id]/route.ts) | [video-task-store](web/src/lib/server/video-task-store.ts) | PostgreSQL、积分、模型上游、媒体 | 视频生成任务 / 单项：查询 |

### `video-tasks`（2）

| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/video-tasks` | 公开 | [route.ts](web/src/app/api/video-tasks/route.ts) | Route 内部实现 | PostgreSQL、积分、模型上游、媒体 | 已停用旧视频任务入口：固定返回 410 |
| GET, PATCH, POST | `/api/video-tasks/[id]` | 混合 | [route.ts](web/src/app/api/video-tasks/[id]/route.ts) | [generation-task-cancellation-service](web/src/lib/server/generation-task-cancellation-service.ts)<br>[generation-task-recovery-service](web/src/lib/server/generation-task-recovery-service.ts)<br>[generation-task-store](web/src/lib/server/generation-task-store.ts) | PostgreSQL、积分、模型上游、媒体 | 视频任务 / 单项：查询、更新、提交/执行 |

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

1. 每次拉取整合或推送前，从仓库根目录运行 `pwsh -NoProfile -File .\\过程文件\\更新开发地图.ps1`。
2. 更新后运行 `pwsh -NoProfile -File .\\过程文件\\验证开发文档.ps1`；失败时不得推送。
3. 新增、移动或删除 `route.ts`、页面、Service、Repository、Schema 或部署入口时，在同一个代码提交中更新对应说明。
4. 权限必须从代码证据更新；新增 Helper 时同步扩展清单脚本的认证标记。

返回 [VOZEB PRO 开发地图](VOZEB-PRO-开发地图.md)。
