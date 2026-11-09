# 页面缺陷修复：正式发布未放行记录

## 结论

生产页面热补丁已应用；测试镜像已部署。正式生产镜像发布未放行，PR #71 未合并，未创建 v0.8.28 生产标签。不能将 PR 的轻量 Quality 通过等同于完整发布门禁通过。

## 环境与代码

- 生产镜像仍为 `sha-d29e71ac70dc3ce2ed7847b0fc1252d82b3ed91f`，临时 Next build 为 `vyQcRypwunGhd4-IMN7kR`。本轮没有再次更换生产构建、环境变量或数据库。
- 测试 app/worker 均已核实运行 `sha-43c03909438021c034884b76712d17870533c3f2`，数据库与 Worker readiness 正常。[Staging image 42545751162](https://github.com/lishen331/VOZEB-PRO/actions/runs/42545751162) 成功。
- PR：[71](https://github.com/lishen331/VOZEB-PRO/pull/71)，源分支 `fix/page-defects-prod-20261109`，基于生产 main 隔离移植，没有合并整个 develop。
- 后续 `e9cdcfe6`、`6851eeba` 以及本记录所在提交仅修改测试和文档，不改变上述测试镜像的业务运行代码。

## 已验证

- 依赖修复后的本地全量 Vitest 6115 passed / 36 环境跳过；Web 类型、lint、format、构建以及 Docs 类型/构建通过。Web 审计剩余 1 项低危，无中危及以上；Docs 无已知漏洞。
- 新首页专项真实 Chromium：桌面、390px、430px 共 18 项通过，包含登录保护、案例详情、课程入口导航/学校权限保护、分类空态、错误隐藏与恢复、布局。
- 安装/官方作品/RunningHub 专项 6 项通过；进一步补充 settingsRevision 后安装/RunningHub 专项 4 项通过。
- 新测试镜像的公开作品 `/share/6f752b0e0a664dd29052` 经浏览器打开并检查截图：1280px 和 390px 均正常显示主图。截图为本机临时证据，不包含在 Git 仓库。
- 接口索引/开发地图验证：440 routes、69 pages、147 tables，两个文档一致。

## 完整 CI 回归证据

运行：[Quality 42547880955](https://github.com/lishen331/VOZEB-PRO/actions/runs/42547880955)，质量验证标签 `VOZEB-PRO-v0.8.28-rc.1`，SHA `6851eebaef267d35b6e7e635ddb9f069048af7eb`。

- 安全检查、Docs、Web 审计/lint/typecheck/unit tests/format/build 均通过。
- Browser E2E 从 02:01 UTC 运行到 02:57 UTC 左右，出现大量断言失败和超时。为取得诊断日志而主动取消，运行结论是取消，不是通过。
- 截至取消，日志包含至少 39 个不同具名失败测试，部分是同一业务场景的桌面/移动端重复，不能等同于 39 个独立产品缺陷。
- PostgreSQL integration tests 未执行；取消后浏览器 artifact 上传步骤也未执行。完整日志已保存至本机临时文件 `page-defects-rc1-full.log`，未将日志或凭据提交仓库。
- 该验证标签还触发了旧 Docker/Docs 镜像工作流；已取消这两次镜像工作流，避免验证候选写入浮动 latest 标签。未触发 Production image 工作流，没有服务器生产部署。

## 失败分组（不是全部归因于本次 UI 改动）

1. **旧 UI 断言**：all-pages 仍查找旧首页营销标题；commerce/responsive 仍查找本次需求明确隐藏的充值入口；Canvas 断言旧的背景颜色；部分后台测试仍依赖旧表格 DOM。需要按实际产品契约逐项更新，不能直接删测试。
2. **测试夹具契约**：PostgreSQL 配置保存要求 settingsRevision；角色 API 使用 `admin.menu.*` 而非裸菜单名。发现流程测试和学校积分测试的这两处字段已在本记录所在提交修正，类型/lint 通过；学校积分仍需 PostgreSQL 环境复验，不记为已通过。
3. **实际页面异常**：`/admin?section=practice` 抛出 `<Form.Item> 必须放在 <Form> 内使用`，并伴随 React #419。源码确有 Form.Item 无 Form 父级。已逐字节比对该组件与生产 main 基线一致，说明该文件并非本次页面改动；尚未对基线环境单独复现，不能把所有运行时原因归结为历史问题。
4. **实际数据库异常**：学校算力分配返回 500，PostgreSQL 日志显示 `could not determine data type of parameter $2`，对应 UPDATE 使用 $1/$3/$4 而遗漏 $2。该计费/算力服务未在本次页面范围内修改，未擅自修复或放宽保护。
5. **其他待逐项判定**：Agent 控件交互、短剧实验室定位、无限练习音频、IP 授权、教学课程等失败。现有证据不足以全部判定为测试过时或本次回归，需要各自复现。

## 发布边界

保留已生效的生产热补丁与成功测试镜像；不通过取消/跳过测试或绕开标签门禁把候选发布成永久生产版本。若要继续处理上述跨模块问题，需要将完整发布回归修复列为独立范围；原始损坏公开作品 UI-003/UI-013 仍缺可复现作品 ID，不能记为源媒体故障已经修复。

## 页面范围内补充修复：后台无限练习表单

为保留本次需求要求的唯一配置入口，补上剧本模型字段缺失的 Form 上下文，仅将既有字段容器改为 Form；字段 onChange、配置保存请求和生成/计费逻辑均未修改。

- 新增服务端渲染测试先复现 `<Form.Item> 必须放在 <Form> 内使用`，修复后通过。
- 练习配置页桌面/390px/430px Chromium 专项及安装依赖共 6 项通过，无页面异常或横向溢出。该专项明确 mock PostgreSQL 专属的 Agent overview 读取；不代表真实 Agent 持久化或完整 PostgreSQL 回归通过。
- Web typecheck、全量 ESLint、Prettier、生产 build 均通过。全量 Vitest 默认高并发曾出现两处未修改用例超时，专项复核 9 项通过；降低本机测试并发后完整运行 1119 文件通过、8 文件环境跳过，6116 项通过、36 项环境跳过，未增加测试超时或跳过失败用例。
- 本补充修复提交到原 PR 候选分支，并走测试镜像流程；正式生产镜像仍因上述跨模块完整回归问题未放行，不自动修改算力 SQL、权限或生成业务来绕过门禁。
