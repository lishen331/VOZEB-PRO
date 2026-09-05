$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$inventoryPath = Join-Path $PSScriptRoot "api-route-inventory.json"
$outputPath = Join-Path $repoRoot "VOZEB-PRO-接口索引.md"
$routes = @(Get-Content -Raw -LiteralPath $inventoryPath | ConvertFrom-Json)
$generatedDate = (Get-Date).ToString("yyyy-MM-dd")

$segmentLabels = @{
    "account-deletion" = "账号注销"
    "account-deletion-requests" = "账号注销申请"
    "activity" = "互动记录"
    "admin" = "管理后台"
    "agent" = "Agent"
    "agent-conversations" = "Agent 对话"
    "agent-readiness" = "Agent 就绪状态"
    "agent-skills" = "Agent 技能"
    "ai" = "模型代理"
    "analyze" = "分析"
    "announcements" = "公告"
    "appeal" = "申诉"
    "api-key" = "API Key"
    "assets" = "资产"
    "assistant-conversations" = "助手对话"
    "audio-tasks" = "音频任务"
    "auth" = "认证"
    "audit-logs" = "审计日志"
    "avatar" = "头像"
    "backup" = "业务备份"
    "billing" = "计费"
    "billing-orders" = "计费订单"
    "billing-refunds" = "计费退款"
    "block" = "屏蔽"
    "cancel" = "取消"
    "canvas" = "画布"
    "cdk" = "兑换码"
    "channels" = "模型渠道"
    "channel-protocol-draft" = "渠道协议草案"
    "check-in" = "签到"
    "checkout" = "结算"
    "claim" = "领取"
    "close" = "关闭"
    "community" = "社区互动"
    "complete" = "完成"
    "conversations" = "创作对话"
    "coupon-templates" = "优惠券模板"
    "coupons" = "优惠券"
    "costs" = "成本"
    "create" = "创建工作台"
    "creative" = "创作运行时"
    "data-export" = "用户数据导出"
    "data-lifecycle" = "数据生命周期"
    "drama" = "短剧"
    "email-code" = "邮件验证码"
    "events" = "事件"
    "expire" = "过期处理"
    "export" = "导出"
    "export-jianying" = "剪映导出"
    "feature" = "精选"
    "files" = "文件"
    "follow" = "关注"
    "gallery" = "作品广场"
    "generation-assets" = "生成资产"
    "generation-log-assets" = "生成日志媒体"
    "generation-logs" = "生成日志"
    "generation-operations" = "生成运维"
    "generation-overview" = "生成概览"
    "generation-tasks" = "生成任务"
    "generation-webhooks" = "生成回调"
    "grant" = "发放"
    "health" = "健康检查"
    "heartbeat" = "心跳"
    "image-tasks" = "图像任务"
    "import" = "导入"
    "initialize" = "初始化"
    "install" = "安装"
    "interactions" = "互动通知"
    "library-assets" = "素材库"
    "live" = "存活状态"
    "like" = "点赞"
    "login" = "登录"
    "login-events" = "登录事件"
    "logout" = "退出登录"
    "mail" = "邮件"
    "maintenance" = "后台维护"
    "media" = "媒体"
    "media-assets" = "媒体资产"
    "media-proxy" = "媒体代理"
    "messages" = "消息"
    "mfa" = "多因素认证"
    "models" = "模型目录"
    "my-prompts" = "个人提示词"
    "notifications" = "通知"
    "object-storage" = "对象存储"
    "orders" = "订单"
    "overview" = "概览"
    "password" = "密码"
    "payment-config" = "支付配置"
    "payment-form" = "支付表单"
    "points" = "积分"
    "preview" = "预览"
    "products" = "商品"
    "profile" = "个人资料"
    "projects" = "项目"
    "prompt-images" = "提示词图片"
    "prompt-optimization" = "提示词优化"
    "promotions" = "促销"
    "prompts" = "提示词"
    "public" = "公开访问"
    "quotes" = "报价"
    "ranking" = "排行"
    "read" = "已读"
    "read-all" = "全部已读"
    "reconciliation" = "对账"
    "redeem" = "兑换"
    "reference-assets" = "参考素材"
    "referrals" = "邀请返利"
    "relationships" = "邀请关系"
    "relist" = "重新上架"
    "render" = "渲染"
    "render-capability" = "渲染能力"
    "report" = "举报"
    "refund" = "退款"
    "register" = "注册"
    "reset" = "重置"
    "resolve" = "处理"
    "retry" = "重试"
    "review" = "审核"
    "revoke" = "撤回"
    "rewards" = "奖励"
    "ready" = "就绪状态"
    "run" = "执行"
    "runs" = "运行"
    "session" = "会话与公开配置"
    "settle" = "结算"
    "settings" = "系统设置"
    "site-icon" = "站点图标"
    "skills" = "技能"
    "sources" = "发布来源"
    "status" = "状态"
    "submit" = "提交审核"
    "summary" = "汇总"
    "sync" = "迁移同步"
    "system" = "系统渠道"
    "take-down" = "下架"
    "tasks" = "任务"
    "test" = "测试"
    "text-tasks" = "文本任务"
    "users" = "用户"
    "versions" = "版本"
    "video-generation-tasks" = "视频生成任务"
    "video-tasks" = "视频任务"
    "view" = "访问计数"
    "webhooks" = "支付回调"
    "work-cases" = "作品治理案件"
    "works" = "作品"
}

$dynamicLabels = @{
    "[id]" = "单项"
    "[userId]" = "指定用户"
    "[slug]" = "指定作品"
    "[assetId]" = "指定媒体"
    "[channelId]" = "指定渠道"
    "[provider]" = "指定支付渠道"
    "[type]" = "指定任务类型"
    "[action]" = "指定动作"
    "[conversationId]" = "指定对话"
    "[taskId]" = "指定任务"
    "[versionId]" = "指定版本"
    "[...path]" = "指定路径"
}

$commonImports = @(
    "@/lib/account-deletion-contract",
    "@/lib/admin-permissions",
    "@/lib/auth/request",
    "@/lib/auth/session",
    "@/lib/server/audit-log-store",
    "@/lib/server/database",
    "@/lib/server/database/repository-shared",
    "@/lib/server/internal-origin",
    "@/lib/server/proxy-dispatcher",
    "@/lib/server/public-request-origin",
    "@/lib/server/request-body-limit",
    "@/lib/server/security"
)

function Read-RouteSource($route) {
    $source = Get-Content -Raw -LiteralPath (Join-Path $repoRoot $route.file)
    if ($route.path -eq "/api/video-generation-tasks") {
        $source += "`n" + (Get-Content -Raw -LiteralPath (Join-Path $repoRoot "web/src/app/api/video-generation-tasks/video-generation-route.ts"))
    }
    return $source
}

function Get-Access($route, [string]$source) {
    if ($route.domain -eq "admin") { return "管理员" }
    if ($route.path -in @("/api/maintenance/billing-refunds/run", "/api/maintenance/generation-tasks/heartbeat", "/api/maintenance/generation-tasks/run")) { return "Worker" }
    if ($route.domain -eq "maintenance") { return "维护" }
    if ($route.path -in @("/api/billing/webhooks/[provider]", "/api/generation-webhooks/[channelId]")) { return "Webhook" }
    if ($route.path -eq "/api/install/initialize") { return "混合" }
    if ($route.path -in @("/api/auth/session", "/api/auth/logout", "/api/public/users/[userId]", "/api/public/works/[slug]/community")) { return "公开" }
    if ($route.path -in @("/api/auth/email-code", "/api/ai/system/[channelId]/[...path]", "/api/reference-assets/[...path]")) { return "混合" }
    if ($source -match "getCurrentUser\(request\)" -or $route.path -eq "/api/video-generation-tasks") { return "混合" }
    if ($source -match "getCurrentUser\(") { return "用户" }
    return "公开"
}

function Resolve-ImportPath([string]$import) {
    if (-not $import.StartsWith("@/")) { return $null }
    $path = "web/src/" + $import.Substring(2) + ".ts"
    if (Test-Path -LiteralPath (Join-Path $repoRoot $path)) { return $path }
    $indexPath = "web/src/" + $import.Substring(2) + "/index.ts"
    if (Test-Path -LiteralPath (Join-Path $repoRoot $indexPath)) { return $indexPath }
    return $null
}

function Get-Services($route) {
    if ($route.path -eq "/api/video-generation-tasks") {
        return "[video-generation-route](web/src/app/api/video-generation-tasks/video-generation-route.ts)<br>[generation-task-scheduler](web/src/lib/server/generation-task-scheduler.ts)"
    }
    $preferred = @($route.imports |
        Where-Object { $_ -notin $commonImports } |
        Sort-Object -Property @{ Expression = {
            if ($_ -match '^@/lib/server/.+(?:service|store)$') { 0 }
            elseif ($_ -match '^@/lib/server/') { 1 }
            elseif ($_ -match '^@/lib/auth/store$|^@/lib/prompts/store$') { 2 }
            else { 3 }
        } }, @{ Expression = { $_ } })
    if (-not $preferred.Count) { $preferred = @($route.imports) }
    $links = [System.Collections.Generic.List[string]]::new()
    foreach ($import in $preferred) {
        $path = Resolve-ImportPath $import
        if (-not $path) { continue }
        $label = [IO.Path]::GetFileNameWithoutExtension($path)
        if (-not $links.Contains("[$label]($path)")) { $links.Add("[$label]($path)") }
        if ($links.Count -ge 3) { break }
    }
    return $(if ($links.Count) { $links -join "<br>" } else { "Route 内部实现" })
}

function Get-Boundary($route) {
    $path = $route.path
    if ($path -like "/api/health/live*") { return "应用进程" }
    if ($path -like "/api/health/ready*") { return "PostgreSQL、Worker 心跳" }
    if ($path -like "/api/install/*") { return "PostgreSQL、安装令牌、加密配置" }
    if ($path -like "*/webhooks/*" -or $path -like "/api/generation-webhooks/*") { return "外部回调、签名校验、PostgreSQL 幂等记录" }
    if ($path -like "/api/maintenance/generation-tasks/*") { return "Worker Token、PostgreSQL、模型上游" }
    if ($path -like "/api/maintenance/billing-refunds/*") { return "Worker Token、PostgreSQL、支付退款" }
    if ($path -like "/api/maintenance/*") { return "维护 Token、PostgreSQL" }
    if ($path -match "object-storage|generation-assets|generation-log-assets|reference-assets|media-assets|media-proxy|prompt-images|/avatar$|/media/") { return "PostgreSQL、本地媒体、S3 兼容存储" }
    if ($path -like "/api/admin/mail/test") { return "PostgreSQL、SMTP" }
    if ($path -match "^/api/admin/(settings|models|channel-protocol-draft)") { return "PostgreSQL、加密渠道配置、模型上游" }
    if ($path -like "/api/ai/*") { return "模型上游、积分、媒体代理" }
    if ($path -match "image-tasks|video-tasks|video-generation-tasks|audio-tasks|text-tasks") { return "PostgreSQL、积分、模型上游、媒体" }
    if ($path -like "/api/agent/*") { return "PostgreSQL、生成任务、模型上游" }
    if ($path -like "/api/drama/*") { return "PostgreSQL、生成任务、FFmpeg、媒体" }
    if ($path -like "/api/auth/email-code*") { return "PostgreSQL、SMTP、限流" }
    if ($path -like "/api/auth/avatar*") { return "PostgreSQL、本地媒体或 S3" }
    if ($path -like "/api/auth/*") { return "PostgreSQL、Session Cookie、审计" }
    if ($path -match "billing|/cdk|referrals|check-in|points") { return "PostgreSQL、积分/商业事务" }
    if ($path -match "works|community|notifications|public") { return "PostgreSQL、作品与社区数据" }
    if ($path -match "creative|canvas|library-assets") { return "PostgreSQL、创作数据" }
    if ($path -match "prompts|announcements|site-icon") { return "PostgreSQL、公开内容/站点设置" }
    if ($path -like "/api/admin/*") { return "PostgreSQL、管理配置、审计日志" }
    return "PostgreSQL"
}

function Get-Purpose($route) {
    if ($route.path -eq "/api/video-tasks") { return "已停用旧视频任务入口：固定返回 410" }
    if ($route.path -eq "/api/install/initialize") { return "使用一次性安装令牌初始化 PostgreSQL 表结构" }
    $segments = @($route.path.Substring(5).Split("/"))
    $labels = foreach ($segment in $segments) {
        if ($dynamicLabels.ContainsKey($segment)) { $dynamicLabels[$segment] }
        elseif ($segmentLabels.ContainsKey($segment)) { $segmentLabels[$segment] }
        else { $segment }
    }
    $methodActions = @{
        "GET" = "查询"
        "HEAD" = "读取元数据"
        "POST" = "提交/执行"
        "PUT" = "替换"
        "PATCH" = "更新"
        "DELETE" = "删除"
    }
    $actions = @($route.methods | ForEach-Object { $methodActions[$_] } | Sort-Object -Unique)
    return "$($labels -join ' / ')：$($actions -join '、')"
}

$methodTotals = @{}
foreach ($route in $routes) {
    foreach ($method in @($route.methods)) { $methodTotals[$method] = 1 + [int]($methodTotals[$method] ?? 0) }
}
$domainGroups = @($routes | Group-Object domain | Sort-Object Name)
$methodSummary = ($methodTotals.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name) $($_.Value)" }) -join "、"
$domainSummary = ($domainGroups | ForEach-Object { "``$($_.Name)`` $($_.Count)" }) -join "、"

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# VOZEB PRO 接口索引")
$lines.Add("")
$lines.Add("> 生成日期：$generatedDate。枚举来源仅为 ``web/src/app/api/**/route.ts``；当前共 **$($routes.Count)** 个 Route 文件。每个文件一行，多种 HTTP 方法合并显示。")
$lines.Add("")
$lines.Add("## 使用说明")
$lines.Add("")
$lines.Add("- 本索引用于定位入口，不替代请求/响应类型定义；修改接口时必须继续阅读 Handler 和所列 Service。")
$lines.Add("- 动态路径保留源码写法，例如 ``[id]``、``[...path]``。Handler 列链接是覆盖校验的唯一标识。")
$lines.Add("- ``主要服务/Store`` 只列最直接的领域入口；通用安全、响应和审计 Helper 不重复展开。")
$lines.Add("- ``混合`` 接口必须查看用途说明和实现：可能同时接受用户 Session 与 Worker/签名，也可能按请求分支要求不同身份；``/api/install/initialize`` 使用一次性安装令牌。")
$lines.Add("")
$lines.Add("## 权限标记")
$lines.Add("")
$lines.Add("| 标记 | 实现边界 |")
$lines.Add("| --- | --- |")
$lines.Add("| 公开 | 操作前不要求 Session 或运行 Token；仍可能有来源、限流、所有权可见性或安装状态限制 |")
$lines.Add("| 用户 | 必须取得当前 Session 用户，并拒绝匿名请求 |")
$lines.Add("| 管理员 | 必须通过管理员角色和细粒度职责权限检查 |")
$lines.Add("| Worker | 仅接受独立 Worker Bearer Token |")
$lines.Add("| 维护 | 仅接受独立维护 Bearer Token |")
$lines.Add("| Webhook | 使用支付商或模型渠道的回调签名/密钥校验 |")
$lines.Add("| 混合 | 同时支持多种实现边界或分支策略；以 Handler 为准 |")
$lines.Add("")
$lines.Add("## 接口总览")
$lines.Add("")
$lines.Add("- Route 文件：**$($routes.Count)**")
$lines.Add("- 方法出现次数：$methodSummary")
$lines.Add("- 一级域：$domainSummary")
$lines.Add("")
$lines.Add("## 按业务域索引")
$lines.Add("")

foreach ($group in $domainGroups) {
    $lines.Add("### ``$($group.Name)``（$($group.Count)）")
    $lines.Add("")
    $lines.Add("| 方法 | 路径 | 权限 | Handler | 主要服务/Store | 数据/外部边界 | 用途 |")
    $lines.Add("| --- | --- | --- | --- | --- | --- | --- |")
    foreach ($route in $group.Group | Sort-Object path) {
        $source = Read-RouteSource $route
        $methods = @($route.methods) -join ", "
        $access = Get-Access $route $source
        $handler = "[route.ts]($($route.file))"
        $services = Get-Services $route
        $boundary = Get-Boundary $route
        $purpose = Get-Purpose $route
        $lines.Add("| $methods | ``$($route.path)`` | $access | $handler | $services | $boundary | $purpose |")
    }
    $lines.Add("")
}

$lines.Add("## 维护规则")
$lines.Add("")
$lines.Add("1. 每次拉取整合或推送前，从仓库根目录运行 ``pwsh -NoProfile -File .\\过程文件\\更新开发地图.ps1``。")
$lines.Add("2. 更新后运行 ``pwsh -NoProfile -File .\\过程文件\\验证开发文档.ps1``；失败时不得推送。")
$lines.Add("3. 新增、移动或删除 ``route.ts``、页面、Service、Repository、Schema 或部署入口时，在同一个代码提交中更新对应说明。")
$lines.Add("4. 权限必须从代码证据更新；新增 Helper 时同步扩展清单脚本的认证标记。")
$lines.Add("")
$lines.Add("返回 [VOZEB PRO 开发地图](VOZEB-PRO-开发地图.md)。")

$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($outputPath, ($lines -join "`n").TrimEnd("`r", "`n") + "`n", $utf8)
Write-Output "indexed_routes=$($routes.Count)"
Write-Output "output=$outputPath"
