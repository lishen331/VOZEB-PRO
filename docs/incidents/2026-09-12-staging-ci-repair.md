# Staging CI 修复记录（2026-09-12）

- 修复 Session 测试学校字段及 Scope 断言、模块可见性参数传递、资产卡片源码断言。
- 新练习项目把学校标识传入存储，列表在分页前按学校过滤；没有学校标识的旧项目继续按原 owner 可见，不清理不回填。
- canvas_projects / drama_projects 仅新增 nullable school_id，使用 ADD COLUMN IF NOT EXISTS；没有 DROP TABLE、DELETE、TRUNCATE 或存量更新。
- 生成任务保留 schoolId 到记录和 PostgreSQL 列；新建 practice task 必須带学校范围，旧任务更新不加此限制。练习创建与重试接口传入服务端 Session 学校标识。
- 这是本轮 CI 与字段传递修复，不声称完成全部跨校隔离审计。
- 本地全量 Vitest threads：902 passed / 6 skipped，4504 passed / 32 skipped。Windows forks 运行没有完成，未作为通过证据。
- 本地 ESLint 通过；最终格式检查、构建和 GitHub Actions 结果以发布记录为准。
