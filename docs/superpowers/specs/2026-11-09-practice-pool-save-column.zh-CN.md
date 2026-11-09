# 练习模型池勾选保存失败

日期：2026-11-09
范围：只补一列迁移。只推 `develop`，先上测试服。生产不受影响（练习模型池还没进 main）。

## 现象

后台「模型渠道 → 逻辑模型 → 默认模型 → 无限练习」里，练习模型池的勾选框点了没反应，勾选状态弹回原样。

## 原因

测试服上实测：点击后 `PATCH /api/admin/practice-model-pool` 返回 500，服务端日志：

```
column "practice_model_pool" of relation "vozeb_pro_app_settings" does not exist
```

`59af0277`（练习模型池精细化管理）只把 `practice_model_pool` 写进了 `CREATE TABLE IF NOT EXISTS app_settings`。已存在的库不会重跑建表，所以这列从没加上。读取时走兜底值，全部显示为「已勾选」；一保存就写不进去，前端提示失败并保持原状态。

## 改什么

`schema.ts` 补一行 `ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS practice_model_pool jsonb DEFAULT NULL;`，与建表定义一致。应用启动时会自动执行。

## 不改什么

- 不改勾选组件、保存接口、练习路由。
- 列默认 NULL，含义与现在一致：未配置时池内模型全部可用，不改变练习画布当前的选模型结果。

## 验证

1. 单测：schema DDL 包含这条 ALTER。
2. 测试服部署后：勾选框可以取消、再勾回，刷新后状态保持。
