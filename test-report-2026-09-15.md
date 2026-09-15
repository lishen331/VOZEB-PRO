# VOZEB-PRO 测试报告

**项目：** VOZEB-PRO（`reddetail.gammablue-x.com`）  
**测试时间范围：** 2026-09-07 ~ 2026-09-15  
**报告生成时间：** 2026-09-15 15:00  
**监控采样：** 每15秒 × 约16分钟实时监控 + 全量历史日志分析  
**报告人：** Claude Code 自动生成

---

## 一、服务器资源概况

| 指标 | 最小值 | 最大值 | 均值 | 状态 |
|------|--------|--------|------|------|
| 内存总量 | 32,240 MB | 32,240 MB | — | Intel Core Ultra 7 258V 宿主机 |
| 内存使用 | 26,311 MB | 28,126 MB | ~27,000 MB | ⚠️ 占用率约 83-87%，持续偏高 |
| 内存空闲 | 4,114 MB | 5,929 MB | ~5,200 MB | 余量不足 20% |
| 进程数 | 9 | 15 | 9（稳态） | 正常，偶发脉冲 |

**异常点：**
- `14:53:57` 进程数突增至 15，内存使用攀升至 **28,126 MB（87.2%）**，达本次监控峰值，随后回落
- `14:48:36` 内存出现短暂峰值 28,045 MB，约30秒后回落
- 整体内存使用率**长期维持在 83%+**，存在 OOM 风险

---

## 二、错误汇总统计

| 错误类型 | 出现次数 | 涉及时段 |
|---------|---------|---------|
| HTTP 502 Bad Gateway | **4 次** | 09-12 |
| HTTP 500 Internal Server Error | **2 次** | 09-12, 09-12(dev) |
| HTTP 404 Not Found | **3 次** | 09-13(dev), 09-15 × 2 |
| HTTP 401 Unauthorized | **1 次** | 09-12 |
| `ERR_NETWORK_CHANGED` | **2 次** | 09-12 |
| `ERR_CONNECTION_CLOSED` | **2 次** | 09-13 |
| AI 结构校验失败 | **3 次** | 09-12 |
| SQL 字段歧义/缺失 | **2 次** | 09-13 |
| React 崩溃（#441） | **1 次** | 09-12 |
| 数据库连接失败 | **1 次** | 09-15 |
| CI 构建失败 | **1 次** | 09-13 |
| 页面整体崩溃 | **1 次** | 09-12 |
| Promise.all 整体失败 | **1 次** | 09-13 |
| **合计** | **24 次** | |

---

## 三、详细错误记录与 Bug 分析

### BUG-01 ⛔ CRITICAL — `/api/practice/scripts/{id}/stages` 持续 502

**时间：** 09-12 02:30 ~ 07:41（同一脚本 ID `3a3603eb`，跨越约 5 小时）  
**错误日志：**
```
[ERROR] Failed to load resource: the server responded with a status of 502 ()
@ https://reddetail.gammablue-x.com/api/practice/scripts/3a3603eb-b1d7-4471-8778-af3acd781da0/stages
```
**现象：** 同一个 script_id 在不同会话中多次返回 502，间隔达 2 小时+，说明后端服务处于持续不稳定状态而非单次抖动。  
**影响：** 用户无法查看剧本 Agent 执行阶段状态，工作目录步骤卡死。  
**根因猜测：** Worker 服务内存/连接池耗尽，未自动恢复。  
**建议：** 加健康检查 + 自动重启；检查 Worker 进程内存泄漏。

---

### BUG-02 ⛔ CRITICAL — AI 输出结构校验失败

**时间：** 09-12 06:19、06:54、07:41（同日 3 次）  
**错误内容：**
```json
{ "error": "剧本模型返回结果无法通过结构校验" }
```
**触发步骤：** 工作目录「7. 编辑与检查」阶段  
**影响：** 阶段标记「失败」，需用户手动点击「重试失败项」，同一 session 当天复现 3 次。  
**根因猜测：** 大模型输出格式不稳定，JSON schema 校验无自动重试机制。  
**建议：** prompt 加强格式约束；schema 校验失败时自动重试（带修正 prompt）。

---

### BUG-03 ⛔ CRITICAL — SQL 字段错误（两个独立 Bug）

**时间：** 09-13 11:08、11:59

**BUG-03a：**
```
上次执行失败：column reference "started_at" is ambiguous
```
**根因猜测：** JOIN 查询中未加表前缀，PostgreSQL 无法区分多张表中的同名字段。  
**建议：** SQL 审查，所有 JOIN 字段加 `table.` 前缀。

**BUG-03b：**
```
上次执行失败：column "i" of relation "vozeb_pro_practice_script_run_items" does not exist
```
**根因猜测：** batch insert 中循环索引变量 `i` 泄漏到 SQL 列名构造，或参数化 SQL 拼接逻辑错误。  
**建议：** 审查 batch insert 相关代码，检查参数化 SQL 拼接逻辑。

---

### BUG-04 🔴 HIGH — React 崩溃 #441

**时间：** 09-12 02:30，会话持续约 3 小时后（10844s）  
**错误：** `Minified React error #441`（`use()` hook 在非 Suspense 上下文调用）  
**触发时机：** 紧随 `/login?next=...` 接口 HTTP 500 之后，登录接口异常导致前端状态错误进而触发崩溃。  
**影响：** 页面需整体刷新才能恢复。  
**建议：** 登录错误边界处理；用 `Suspense` 包裹异步状态依赖组件。

---

### BUG-05 🔴 HIGH — conversation artifact 404

**时间：** 09-15 00:28（script `bcccfd88`）、09-15 00:58（script `66c8772e`）  
**错误日志：**
```
[ERROR] Failed to load resource: the server responded with a status of 404 ()
@ https://reddetail.gammablue-x.com/api/practice/scripts/{id}/artifacts/conversation/latest
```
**影响：** 剧本 Agent 对话面板无法加载历史内容，用户只看到空白。  
**根因猜测：** Script 创建成功但 conversation artifact 的写入在异步任务中失败，未补偿。  
**建议：** Script 创建时同步初始化 artifact 记录；或改为懒初始化时返回 200 空对象而非 404。

---

### BUG-06 🔴 HIGH — Promise.all 整体失败 + school_id 映射缺失（409）

**时间：** 09-13 03:29 ~ 03:33  
**错误摘要：**
```
数据库有 school_id，但业务对象曾漏掉 schoolId
409 的直接断点：school_id 没有进入 session.schoolId
Promise.all 整体失败 → 历史会话失败使模块配置也无法落到 UI 状态
```
**影响：** 历史会话 API 和模块配置 API 同在一个 `Promise.all`，任一失败导致整个模块配置无法渲染，用户看到空白 UI。  
**根因猜测：** ORM 层 snake_case → camelCase 转换遗漏 `school_id` 字段。  
**建议：** `Promise.allSettled` 替代 `Promise.all`；ORM mapper 加字段覆盖测试。

---

### BUG-07 🟡 MEDIUM — PostgreSQL 连接失败（安装向导）

**时间：** 09-15 11:33  
**现象：** 安装向导页状态栏「数据库 连接失败」，第三步「创建管理员」按钮 disabled。  
**页面提示：**
```
无法连接 PostgreSQL。请检查数据库、账号密码、Host、端口、网络和 SSL 设置。
```
**建议：** 安装向导增加「一键启动测试 DB」按钮；`.env.example` 提供默认可用配置。

---

### BUG-08 🟡 MEDIUM — CI 构建失败

**时间：** 09-13 16:40  
**记录：** commit `a3502c0e` 对应的 `web-a3502c0e` 构建显示「已失败」×2  
**建议：** 查 CI 详细日志定位具体错误文件与行号。

---

### BUG-09 🟢 LOW — 登录表单缺少 username 字段（无障碍警告）

**时间：** 09-07、09-13（测试/预览环境 `8.138.207.180`）  
**错误：** `[VERBOSE][DOM] Password forms should have (optionally hidden) username fields for accessibility`  
**建议：** 增加 `<input type="hidden" autocomplete="username">`。

---

### BUG-10 🟢 LOW — 网络中断无重连机制

**时间：** 09-12 07:41（ERR_NETWORK_CHANGED）、09-13 20:21（ERR_CONNECTION_CLOSED）  
**现象：** 会话长时间运行后网络切换/断开，请求失败，需用户手动刷新。  
**建议：** 实现断线重连 + 用户提示 Toast。

---

## 四、问题时间线

```
09-07  ● BUG-09（无障碍警告）
09-12  ● BUG-01（502 持续 5 小时）
       ● BUG-02（AI 结构校验失败 ×3）
       ● BUG-04（React #441 崩溃）
       ● BUG-10（ERR_NETWORK_CHANGED）
09-13  ● BUG-03a（SQL started_at 歧义）
       ● BUG-03b（SQL column "i" 不存在）
       ● BUG-06（Promise.all 失败 + 409）
       ● BUG-08（CI 构建失败）
       ● BUG-10（ERR_CONNECTION_CLOSED）
09-15  ● BUG-05（artifacts 404 ×2）
       ● BUG-07（PostgreSQL 连接失败）
```

---

## 五、优先级汇总

| # | 优先级 | 问题 | 根因猜测 | 建议动作 |
|---|--------|------|---------|---------|
| BUG-01 | P0 | Worker 502 持续 5 小时 | 连接池/内存耗尽未恢复 | 健康检查 + 自动重启 |
| BUG-02 | P0 | AI 结构校验失败 ×3 | 大模型输出偏离 schema | prompt 约束 + 自动重试 |
| BUG-03a | P1 | SQL started_at 歧义 | JOIN 未加表前缀 | 全局 SQL 字段前缀审查 |
| BUG-03b | P1 | SQL column "i" 不存在 | 循环变量泄漏到列名 | 检查 batch insert 拼接逻辑 |
| BUG-04 | P1 | React #441 崩溃 | 登录失败后状态未清理 | 错误边界 + Suspense |
| BUG-05 | P1 | artifacts 404 | 异步初始化失败无补偿 | 同步初始化或懒初始化返回空对象 |
| BUG-06 | P1 | Promise.all 整体失败 | allSettled 缺失 + ORM 映射漏字段 | allSettled + mapper 字段测试 |
| BUG-07 | P2 | 安装向导 DB 连接失败 | 本地环境配置问题 | .env.example 默认可用配置 |
| BUG-08 | P2 | CI 构建失败 | 待查 CI 日志 | 查 CI 详情 |
| BUG-09 | P3 | 无障碍警告 | 缺 username hidden field | 加 autocomplete 字段 |
| BUG-10 | P3 | 断网无重连 | 前端无重连逻辑 | 断线重连 + Toast 提示 |

---

*本报告由 Claude Code 基于 `.playwright-cli/` 日志自动生成，监控时长约 16 分钟（14:44~15:00），历史日志覆盖 2026-09-07~09-15。*
