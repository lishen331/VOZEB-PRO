# 积分比例 1:10 改 1:100（生产数据迁移）

日期：2026-11-02
状态：待执行

## 背景

积分价目表已按 **100 积分 = 1 元** 定稿（`docs/reports/video-points-pricing.zh-CN.md`）。
现在生产库里的积分是按 **10 积分 = 1 元** 发放的：用户余额、流水、套餐赠送积分都是旧比例。
只改扣费配置而不改存量数据，老用户余额会缩水到十分之一。

本次只改生产数据库。不改代码、不改前端、不改后端计算逻辑。

## 已核实的现状（2026-11-02 只读查询）

| 表 | 现状 |
|---|---|
| `vozeb_pro_users` | 135 个用户，54 个余额非零，合计 1,106,383 积分，最大 999,899（admin） |
| `vozeb_pro_point_records` | admin-adjust 251 条、consume 5,839 条、refund 1,742 条 |
| `vozeb_pro_daily_plan_point_wallets` | 0 行 |
| `vozeb_pro_cdk_codes` | 0 行 |
| `vozeb_pro_billing_orders` | 只有 1 条 closed，没有待支付 |
| `vozeb_pro_billing_products` | creator-monthly 9.9 元送 500 积分；pro-monthly 29.9 元送 2,000 积分 |
| `vozeb_pro_entitlement_plans` | 三个套餐 daily_points 都是 0 |
| `vozeb_pro_app_settings` | `model_point_costs` 和 `generation_point_multipliers` 都是 `{}`；free_daily_points 是 0 |
| `vozeb_pro_generation_tasks` | status=running 有 575 条，但全部更新于 2026-09，没有真实在途任务 |

金额列（`amount_cents`）是人民币分，和积分比例无关，不动。

## 迁移内容

全部 × 10，保持"余额折合多少元"不变：

1. `vozeb_pro_users.points_balance`
2. `vozeb_pro_point_records` 的 `amount`、`balance_after`、`permanent_amount`、`daily_amount`、`permanent_balance_after`、`daily_balance_after`
3. `vozeb_pro_billing_products` 的 `points_amount`、`daily_points`（当前 daily_points 全是 0）
4. `vozeb_pro_entitlement_plans.daily_points`（当前全是 0，顺手乘，结果不变）
5. `vozeb_pro_app_settings.free_daily_points`（当前是 0，结果不变）

`vozeb_pro_daily_plan_point_wallets` 和 `vozeb_pro_cdk_codes` 是空表，不处理。

扣费配置（`model_point_costs`、`generation_point_multipliers`）**本次不改**，另一步在后台界面填。

## 安全措施

- 先 `pg_dump` 全库到服务器 `/root/backups/`，文件名带时间戳。
- 迁移在一个事务里完成。
- 用 `vozeb_pro_audit_logs` 里有没有 `points-ratio-x10` 记录做幂等判断，重复执行直接退出，不会乘第二次。
- 事务内校验：迁移后用户余额合计必须等于迁移前的 10 倍，对不上就回滚。
- 完成后往 `vozeb_pro_audit_logs` 写一条标记。

## 不做的事

- 不改任何代码。前端"积分 ÷ 10 = 元"的显示要另一次改动处理。
- 不改 `model_point_costs` 和 `generation_point_multipliers`。
- 不动金额列、不动订单、不动生成任务。

## 验证

迁移后只读核对：

- 用户余额合计 = 11,063,830
- admin 余额 = 9,998,990
- point_records 行数不变（7,832）
- creator-monthly 的 points_amount = 5,000，pro-monthly = 20,000
- audit_logs 有且只有一条 `points-ratio-x10`
