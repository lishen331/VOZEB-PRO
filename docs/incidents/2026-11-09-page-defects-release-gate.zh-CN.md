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

## 测试候选部署结果（页面表单补充修复后）

- [Staging image 42557028676](https://github.com/lishen331/VOZEB-PRO/actions/runs/42557028676) 已成功，源码 SHA `e1a021505dcafefae9108fcca1f3f80ed2e05a63`。
- 服务器再次核实 app 与 worker 均运行 `ghcr.io/lishen331/vozeb-pro:sha-e1a021505dcafefae9108fcca1f3f80ed2e05a63`，app healthy；readiness 的 database/schema/worker 均正常。
- 该镜像包含后台练习页 Form 容器修复；本记录后续文档提交不会改变业务运行代码。
- 生产复核仍为 `sha-d29e71ac70dc3ce2ed7847b0fc1252d82b3ed91f` 与临时 build `vyQcRypwunGhd4-IMN7kR`，readiness 正常，未被重建替换。PR #71 仍未合并；完整 Browser E2E/算力 SQL 等跨模块问题没有被视为已修复或已通过。

## 完整目标继续推进：已复现并实施的最小修复（尚未正式发布）

用户已要求继续完成全部需求与测试→生产流程。本节更新后，不再把“缺少原作品 ID”或“需要独立确认修复范围”当作停止理由；所有完成结论仍须以新候选部署和逐项验收为准。

### UI-003 / UI-013：已找到原作品与实际根因

- 测试环境原作品为“BLUEGAMMA 画布 1”，slug `bb7a221fa0cd417eaa08`，公开地址 `/share/bb7a221fa0cd417eaa08`。同名画布 2 的 slug 为 `ba4a5035bbe24761a535`。生产公开列表未发现这两条记录，未向生产创建复制业务数据。
- 原图接口 HEAD 200；原作品前两张图片缩略图实际已解码，`complete=true`、尺寸 `256×456`，但 DOM 图片 `opacity=0`，加载 Logo 保持可见。主图实际为 `1024×1824`，可显示。资源并非全部丢失，先前只记录图片天然尺寸正常不足以证明可见性。
- `LazyMediaImage` 原来的 src effect 无条件写回 loading；SSR/缓存图片先于 hydration 或 effect 完成时，丢失/覆盖 ready 状态。新逻辑读取 img ref 的 complete/naturalWidth，恢复 ready/error/loading；不改媒体 URL、文件或存储权限。
- 新增组件状态回归，先复现 2 项失败，修复后 3 项通过。仍须在新构建的真实原作品页面验证全部缩略图及切换，不将单元测试记为部署后验收。

### 其他已定位门禁修复

- 学校算力分配 UPDATE 跳过 $2，PostgreSQL 直接报不能推断参数类型。已把学校池扣款绑定改为连续的 schoolId/amount/timestamp 三参数，小组入账仍带 groupId。临时表 PREPARE 先失败；修复后真实 PostgreSQL 执行 100−2.25=97.75，余额不足更新 0 行且余额不变，最后 ROLLBACK。未改真实学校余额、Schema、权限或计费规则。
- 学校管理不是角色控制前台菜单的条目，却被通用菜单拦截。路由校验改为全局模块开关 + 可用老师身份 + canManageSchool；普通老师、学生、停用学校仍不可进入，加入学校页面仍可访问。先补失败测试，修复后相关权限/仓储专项 19 项通过。
- 公共提示词卡片的操作行在 1280px 下出现按钮右边缘溢出。为操作行增加正常换行，保留按钮和文案；后续完整桌面路由回归已越过该检查，未放宽溢出阈值。
- Canvas 的纯尺寸数学工具误标 use client，导致服务端恢复结果时报 RSC 边界错误。去掉纯工具的客户端标记，新增边界回归及结果恢复专项 36 项通过。普通画布源提交 `cc655a3d` 后按项目脚本同步 106 个短剧画布运行文件；同步还将已有普通画布的独立分辨率/尺寸摘要带回镜像，保持复制语义，没有修改上游参数或原图文件。
- 默认分镜台词音频实际 MIME 为 audio/x-flac，先前在 POST 上传前被白名单拒绝。补充与现有 audio/flac 等价的标准别名，失败测试转绿；限制大小和后端校验保留，等待完整浏览器验证。
- 后台课程章节确认框原先使用独立 GammaModal，而父编辑框使用 Radix 焦点管理 Modal。截图中子框被父编辑框覆盖，输入始终为空。App.confirm 改为复用已有焦点管理 Modal，不加 z-index 常数、不移除焦点保护；弹层/练习 UI 专项 15 项通过，实际章节录入待新构建复验。
- 为唯一的剧本练习显隐开关补充无障碍标签，并新增管理员 UI 保存/刷新、学校用户入口显隐、API 开关访问和其他模块不变的完整 E2E 用例，尚未计为通过。

### 测试与发布边界

- 已创建独立、仅回环可达的临时 QA PostgreSQL 容器与数据库，通过 SSH 隧道运行本地浏览器测试。无正式/测试业务库的假学校、订单或项目写入；临时表验证会回滚。
- 桌面全量诊断发现 92 项，当前这一轮 43 passed、2 skipped、8 failed 后停止，39 未运行，不记为通过。多数剩余失败属于过时的控件标签/参数 Tabs/匿名上下文/缺少初始剧本夹具等；实际媒体加载状态和模块/弹层缺陷另行按代码修复，不混为旧测试。
- 源码仍在本地验证阶段；生产热补丁和已部署测试 e1a02150 未被这批未提交修复替换，PR #71 尚未合并，没有发布生产版本标签。


### 继续执行的新增证据（2026-11-09 下午）

- 音频历史竞争：切换音频来源或关闭音频时失效旧 requestId 却未释放 uploading。最小修复两处释放状态，仍保留过期响应保护。可控 Promise 测试先 4 failed/1 passed，修复后新 5 项与原工作台契约共 24 项通过；Chromium 六模块工作台回归也通过。
- Gamma 弹层关闭后 forceMount 内容仍按 modal=true 执行背景 aria-hidden/指针保护；改为仅打开且有遮罩时使用 modal 模式。重复打开还发现 Portal 直接的兄弟 Overlay 可能被重新插入到内容后，最小修复为将遮罩/内容保持在同一稳定父容器，不使用 force 点击或增加 z-index。
- IP 包下载复现真实 404：JOIN 行中子 IP 的 cover 别名为 null 时，`??` 错误回落到父 IP 的 cover；无封面子 IP 因跨子 IP 文件身份不匹配而无法打包。改为区分别名存在与空值，不放宽文件归属权限。新增失败回归已转绿，仓储/下载/弹层专项共 21 项通过，真实打包仍待新构建复验。
- 最近 production build 及其内置 TypeScript 检查通过；目标 ESLint 通过。全量 Vitest 与构建同时运行期间本机空闲物理内存降至不足 1GB，并出现 worker 终止/超时；该次已中止，不记为通过，最终需要独占资源重跑或 CI 证据。
- Chromium 目标回归仍发现旧 UI 夹具问题：圆角节点角落点击未命中卡片、隐藏 checkbox 需通过真实键盘操作、多选 Select 已由输入框改为按钮加弹层搜索。分别按当前源码修正，原业务/租户隔离断言保持。
- 临时诊断只能存在本地排查阶段；提交前必须移除所有 React fiber 诊断与 console 输出。没有推送、合并或正式生产发布的新结论。

- IP 学校授权接口另有真实 PostgreSQL 500：隔离 QA 数据库日志定位到 `MAX(grant.updated_at)` 的 `grant` 为保留关键字。改为 `school_grant` 别名；失败契约测试已转绿（仓储/下载专项 9 项通过），不改授权范围。修复前旧 mock 查询测试未解析 SQL，故未发现此语法错误。
- 弹窗重新打开后遮罩拦截的实际 Chromium 对话删除/刷新持久化流程已通过；未使用 force 点击、跳过检查或 z-index 叠加。
- 目标回归第 14 轮已通过 Canvas 编辑/框选/连线/缩放/复制持久化与 IP 编辑/授权/打包下载；多学校全流程仍在运行，不把尚未结束的结果记为成功。

- 16:55 最新全量 Vitest 已完成：1123 files passed / 8 skipped，6138 tests passed / 36 skipped，退出码 0；环境专项跳过不记为已执行的 PostgreSQL integration。
- 学校全流程已越过作业提交、批改与两轮商单交付，最终页面检查暴露空封面键仍返回图片地址（404）。目录与详情仅在非空 coverStorageKey 时返回 coverUrl；失败回归转绿 5 项。真实有封面课程的权限和 URL 不变。
- Web 全量 ESLint 通过。格式检查指出两个测试文件格式问题，已使用 Prettier 修正，正在重新核验；不能用首次失败检查记为通过。

- 17:02 新构建的学校完整 Chromium 多角色流程通过（1 passed）：课程创建/章节课时/分配/教学安排、学生作业与老师批改、商单两轮候选及交付、终态409、跨租户隔离、当前可见导航与亮暗主题页面；不再有空封面404。
- 最终 Web 生产构建（包含 TypeScript 检查）、全量 ESLint、全量格式检查均退出码0。两个开发定位文档再次验证：440 routes、69 pages、147 tables，无漂移。全量桌面/390/430 与 PostgreSQL integration 仍需在候选CI执行，完成前不合并或发布生产。


### 候选 CI 与安全/集成夹具复核

- 已推送业务候选 `d0033248` 到修复分支（非 main/develop），完整手动 Quality 为 [42590488763](https://github.com/lishen331/VOZEB-PRO/actions/runs/42590488763)。该运行 Docs/audit/lint/typecheck/unit/format/build 已通过，Browser E2E 尚未结束；security 全历史扫描失败，不记为发布通过。
- Gitleaks 8.24.3 扫描全历史报告 26 条（24 个唯一指纹），逐项检查后均为旧提交重放的确定性测试值、已审计文档示例、源码 SHA256 摘要和 PEM 格式包装字符串。18 项与原 `.gitleaksignore` 已审计内容逐字节相同；两份 Alipay 测试 PEM 与当前明确声明的测试 fixture 字节完全相同。仅补充精确 commit:file:rule:line 指纹，不禁用规则、不豁免整个业务文件或目录。
- 同版本本地 `--all --redact` 复扫 1661 个提交：先 27 条告警，补充逐项审核的精确指纹后 `no leaks found`。额外本地分支文档示例也与既有已审核示例逐字节相同。未把密钥、私钥正文或完整服务器环境写入报告。
- 独立 QA PostgreSQL 集成中，旧课程迁移夹具只创建 id，却遗漏迁移依赖的既有账号列 username/role/admin_permissions/updated_at。补齐测试前置结构，不修改生产 Schema；真实迁移仍连续执行两次并核对旧 JSON 数据和新增列/索引。
- 跨 SSH 网络诊断执行 5 files / 22 tests 全通过，管理员备份测试实测约 6 秒；该次仅诊断命令使用 60 秒测试时限，未修改 CI 默认时限。不能将此证据冒充 CI 默认时限下的 PostgreSQL 集成门禁已通过，仍需最终候选完整 CI 结果。
