# 管理员进入管理中心入口：紧急恢复记录

## 根因和范围

页面精简提交 `870f5484` 删除账户菜单的套餐、积分等项时，同时删除了管理员专用的管理入口。后台服务权限没有在本次恢复中改变；这是导航入口缺失，不应让管理员靠手输地址管理平台。

源码恢复：
- `web/src/components/layout/gamma-account-actions.tsx`：仅 `user.role === "admin"` 时显示“进入管理中心”，调用原 `onOpen("/admin")`。展开/收起侧栏共用同一菜单。
- `web/src/components/layout/user-status-actions.tsx`：管理员账户菜单补回 `/admin` 链接，保持退出登录及个人中心原逻辑。
- `web/src/components/layout/gamma-account-admin-entry.test.tsx`：验证管理员展开/收起、真实菜单回调目标、普通用户无此项，以及充值入口仍隐藏。

## 热更新对象

| 环境 | 实例 | 镜像基线 | Next build |
| --- | --- | --- | --- |
| 测试 | vozeb-staging-app-1 | sha-e44c0ea759df2b02a10c8f8614882a90348cf1ac | 3bFTsRP3r0hbdK3zc-_Tq |
| 生产 | vozeb-pro | sha-d29e71ac70dc3ce2ed7847b0fc1252d82b3ed91f | vyQcRypwunGhd4-IMN7kR |

按用户本次明确要求，先恢复测试，再恢复生产。此次不发布候选分支中的其他未完成修复，不更换镜像、环境变量、数据库或 Worker；仅对每环境当前使用的 Gamma 账户菜单两份客户端 chunk 与两份 SSR chunk 各恢复一个条件菜单项，随后重启 app 清除模块缓存。

所有目标经精确匹配、原文件 SHA256、完整 JS 语法检查及隔离执行菜单表达式验证后才写入：管理员得到一项且回调为 `/admin`，普通用户得到空数组。已保留的旧 hash 资源没有被整体覆盖。每环境各4个文件，未修改后端授权。

## 验证

- 失败回归：新增专项先 2 failed / 1 passed，管理员确实没有入口。
- 修复后：账户入口和原账户布局专项 2 files / 5 tests passed；相关 ESLint 与 Web typecheck 通过。
- 测试实际浏览器：账户菜单出现“进入管理中心”，点击后到 `https://reddetail.gammablue-x.com/admin`。
- 生产实际浏览器：账户菜单出现“进入管理中心”，点击后到 `https://edu.gammablue-x.com/admin`，实际经营看板等管理内容成功显示。
- 两环境 readiness 均为 true，数据库、Schema、加密与 generationWorker 健康。
- 浏览器验收禁用缓存以确认新资源；已有标签页可能需要 Ctrl+F5 更新旧缓存。
- 本机截图：`C:/Users/admin/AppData/Local/Temp/vozeb-admin-entry-hotfix-20261109/staging-admin-entry.png`、`production-admin-entry.png`；不把截图或临时运行日志提交仓库。

## 备份与回滚

- 测试：`/opt/vozeb-pro/staging/hotpatches/admin-entry-20261109/`
- 生产：`/opt/vozeb-pro/production/hotpatches/admin-entry-20261109/`

各目录含4个原文件、before/after SHA256 manifest 和 `rollback.sh`。脚本已 `bash -n` 验证，执行前检查镜像仍为指定基线且文件仍为本次补丁 after hash，再恢复对应原文件并重启 app，防止回滚覆盖后续正式版本。没有执行回滚。

源码必须随后进入正式发布；本次热更新不等同于 GitHub 合并或永久镜像发布，也不代表前序全量页面发布门禁已通过。
