$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$inventoryScript = Join-Path $PSScriptRoot "生成开发地图清单.ps1"
$indexScript = Join-Path $PSScriptRoot "生成接口索引.ps1"
$mapPath = Join-Path $repoRoot "VOZEB-PRO-开发地图.md"

& $inventoryScript
& $indexScript

$apiCount = @((Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "api-route-inventory.json") | ConvertFrom-Json)).Count
$pageCount = @((Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "page-route-inventory.json") | ConvertFrom-Json)).Count
$tableCount = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot "database-table-inventory.txt") | Where-Object { $_.Trim() }).Count
$generatedDate = (Get-Date).ToString("yyyy-MM-dd")
$map = Get-Content -Raw -LiteralPath $mapPath
$baseline = "> 基线：$generatedDate，``main`` 分支。当前源码包含 $pageCount 个 ``page.tsx`` 页面入口、$apiCount 个 API Route 文件和 $tableCount 张 PostgreSQL 表。接口逐项说明见 [VOZEB-PRO 接口索引](VOZEB-PRO-接口索引.md)，发布操作见 [VOZEB-PRO 更新与部署流程](VOZEB-PRO-更新部署流程.md)。"
$baselineMatch = [regex]::Match($map, "(?m)^> 基线：.*$")
if (-not $baselineMatch.Success) {
    throw "未找到 VOZEB-PRO-开发地图.md 的基线行，拒绝静默写入。"
}
$updated = [regex]::Replace($map, "(?m)^> 基线：.*$", [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $baseline }, 1)

$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($mapPath, $updated.TrimEnd("`r", "`n") + "`n", $utf8)
Write-Output "updated_date=$generatedDate"
Write-Output "api_routes=$apiCount"
Write-Output "pages=$pageCount"
Write-Output "tables=$tableCount"
Write-Output "output=$mapPath"
