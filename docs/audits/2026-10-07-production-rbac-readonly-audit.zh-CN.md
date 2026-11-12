---
title: 生产环境 RBAC 只读审计报告
date: 2026-10-07
status: completed
scope: production-read-only
---

# 生产环境 RBAC 只读审计报告

## 1. 审计结论

本次审计已通过生产服务器执行只读 SQL，未执行任何数据库写操作、迁移、初始化或修复。

生产环境共发现 **2 个自动可确认异常账号**：

- `001`：符合普通用户条件，但缺少 `normal-user` 角色绑定；
- `123`：符合普通用户条件，但缺少 `normal-user` 角色绑定。

除此之外，未发现平台管理员、学校管理员、老师、学生、过期绑定、错误角色或 `school-admin` 历史角色异常。

本次审计没有自动修复任何问题。

## 2. 安全边界与执行限制

本次严格遵守以下限制：

- 仅执行只读查询；
- 未执行 `INSERT`、`UPDATE`、`DELETE`、`ALTER`、`DROP`、`CREATE`、`TRUNCATE`；
- 未执行数据库迁移；
- 未调用 schema 初始化；
- 未读取或输出 `.env`；
- 未读取或输出数据库密码、OSS 密钥、Worker Token、password、password_hash、secret 等字段；
- 未提交或推送 Git；
- 使用生产 PostgreSQL 容器内部连接执行 SQL；
- 生产服务器连接通过 SSH 完成，私钥内容未输出。

## 3. 生产数据库实际表名

用户要求的逻辑表名在生产数据库中统一带有 `vozeb_pro_` 前缀：

| 逻辑表 | 生产实际表 |
|---|---|
| users | `vozeb_pro_users` |
| schools | `vozeb_pro_schools` |
| school_memberships | `vozeb_pro_school_memberships` |
| rbac_roles | `vozeb_pro_rbac_roles` |
| rbac_user_role_bindings | `vozeb_pro_rbac_user_role_bindings` |

数据库连接核验结果：

- database：`vozeb_pro`
- schema：`public`
- 数据库用户名称未写入本报告；
- 目标五张实际表均存在。

## 4. 有效角色定义

生产环境当前存在以下有效角色：

| role_key | scope | status | builtin |
|---|---|---|---|
| `platform-superadmin` | platform | active | true |
| `platform-admin` | platform | active | false |
| `school-superadmin` | school | active | true |
| `teacher` | school | active | true |
| `student` | school | active | true |
| `normal-user` | user | active | true |

历史角色检查：

- `school-admin` 角色定义：未发现；
- `school-admin` 角色绑定：未发现；
- 缺失内置角色：未发现；
- 已禁用角色仍被绑定：未发现；
- 绑定引用不存在角色：未发现。

## 5. 统计汇总

| 项目 | 数量/结果 |
|---|---:|
| 平台管理员 | 1 |
| 学校管理员 | 8 |
| 老师 | 17 |
| 学生 | 100 |
| 普通用户候选 | 2 |
| 自动可确认异常 | 2 |
| 需要人工确认账号 | 0 |
| 生产学校 | 6 |
| active 学校成员 | 117 |
| disabled 学校成员 | 0 |
| disabled 学校 | 0 |
| `school-admin` 历史角色 | 否 |
| `normal-user` 与平台角色冲突 | 否 |
| 学校角色与 membership 不一致 | 否 |

## 6. A. 平台管理员异常

### 自动异常

无。

### 实际核验账号

| username | user_id | users.role | actual_role | actual_scope | school_id | expected_role | problem |
|---|---|---|---|---|---|---|---|
| `admin` | `ed5bbb31-5a9f-438f-81ea-4412bb275970` | admin | platform-superadmin | platform | NULL | platform-superadmin | 无异常 |

核验规则结果：

- `admin` 存在且只有一个平台范围角色；
- 绑定为 `platform-superadmin`；
- 没有绑定 `normal-user`；
- 没有 teacher/student 的 NULL 学校范围绑定；
- 未发现非 admin 用户拥有平台范围角色；
- 未发现自定义平台角色。

## 7. B. 学校管理员异常

自动异常：无。

生产环境 8 名学校管理员均满足：

```text
school_memberships.role = teacher
permissions 包含 school.manage
存在同 school_id 的 school-superadmin 绑定
同时存在 teacher 绑定
```

因此 `teacher + school-superadmin` 是当前业务规则下的正常双角色，不列为异常。

## 8. C. 老师/学生异常

自动异常：无。

核验结果：

- 每个 active teacher 成员都有对应 `teacher + school_id`；
- 每个 active student 成员都有对应 `student + school_id`；
- 学生没有 `school-superadmin`；
- school_id 与 `school_memberships.school_id` 一致；
- 没有对应用户的学校成员关系：未发现；
- 没有对应学校的绑定：未发现；
- disabled 成员仍被当作 active 身份使用：未发现。

## 9. D. 普通用户异常

以下账号同时满足：

1. `users.role <> 'admin'`；
2. 没有任何 `school_memberships`；
3. 没有 NULL school_id 的其他角色绑定；
4. 但缺少 `normal-user` 绑定。

### 账号 1：001

| 字段 | 值 |
|---|---|
| username | `001` |
| user_id | `290a32ad-86ce-46c1-9830-634e362d8f9c` |
| users.role | user |
| school_membership_count | 0 |
| null_scope_bindings | 无 |
| actual_role | 无 |
| problem | 符合普通用户条件但缺少 normal-user |

### 账号 2：123

| 字段 | 值 |
|---|---|
| username | `123` |
| user_id | `26373d81-5cc4-4cb0-9dcf-b75dfe0d617a` |
| users.role | user |
| school_membership_count | 0 |
| null_scope_bindings | 无 |
| actual_role | 无 |
| problem | 符合普通用户条件但缺少 normal-user |

## 10. E. 过期或错误绑定

自动异常：无。

未发现：

- `school-admin` 绑定；
- 不存在用户的绑定；
- 不存在学校的绑定；
- 不存在角色定义的绑定；
- 没有对应 active school_membership 的 teacher/student 绑定；
- 没有对应学校成员关系的 school-superadmin 绑定；
- 已禁用角色绑定；
- 已禁用成员仍被使用。

## 11. F. 需要人工确认

当前没有必须人工确认的账号。

以下情况本次未发现：

- 自定义平台角色；
- 普通用户与学校身份并存；
- 多学校身份并存；
- 不符合 `teacher + school.manage` 条件的 school-superadmin；
- 多种学校角色并存造成的未解释冲突；
- 已禁用账号或学校成员继续使用角色。

## 12. 后续建议

本报告只负责审计，不执行修复。后续由管理员确认以下两项是否应补绑定 `normal-user`：

- `001` / `290a32ad-86ce-46c1-9830-634e362d8f9c`
- `123` / `26373d81-5cc4-4cb0-9dcf-b75dfe0d617a`

确认前不要直接修改生产数据库。若需要修复，应另行生成修复方案，先在测试环境验证，再按生产变更审批流程执行。

## 13. 证据与可复核信息

- 审计环境：生产服务器 PostgreSQL 容器 `vozeb-pro-postgres`；
- 审计方式：容器内 `psql`，仅执行 `SELECT` 与 `information_schema` 查询；
- 审计日期：2026-10-07；
- 未保存数据库密码、SSH 私钥或其他 Secret；
- 本报告不包含 `password_hash`、Token、Secret、OSS 凭据或 Worker 凭据。
