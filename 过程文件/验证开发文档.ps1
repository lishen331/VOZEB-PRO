$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$indexPath = Join-Path $repoRoot "VOZEB-PRO-接口索引.md"
$mapPath = Join-Path $repoRoot "VOZEB-PRO-开发地图.md"
$inventoryPath = Join-Path $PSScriptRoot "api-route-inventory.json"
$errors = [System.Collections.Generic.List[string]]::new()

function Read-Utf8([string]$path) {
    try {
        $utf8 = [System.Text.UTF8Encoding]::new($false, $true)
        $content = $utf8.GetString([System.IO.File]::ReadAllBytes($path))
    } catch {
        $errors.Add("不是有效 UTF-8：$path")
        return ""
    }
    if ($content -match "�|锟斤拷") { $errors.Add("发现疑似乱码：$path") }
    return $content
}

$index = Read-Utf8 $indexPath
$map = Read-Utf8 $mapPath
$routes = @(Get-Content -Raw -LiteralPath $inventoryPath | ConvertFrom-Json)
$routesByHandler = @{}
foreach ($route in $routes) {
    $routesByHandler[$route.file] = @($route.methods | Sort-Object)
}
$sourceRoutes = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot "web/src/app/api") -Recurse -Filter "route.ts")
$sourcePages = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot "web/src/app") -Recurse -Filter "page.tsx" | Where-Object FullName -NotMatch "[\\/]api[\\/]")
$schemaFiles = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot "web/src/lib/server/database") -Filter "schema*.ts")
$schemaSource = ($schemaFiles | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n"
$sourceTables = @([regex]::Matches($schemaSource, "CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_]+)") | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)

if ($routes.Count -ne $sourceRoutes.Count) { $errors.Add("接口清单数量 $($routes.Count) 与源码 Route 数量 $($sourceRoutes.Count) 不一致。") }
if ($index -notmatch "Route 文件：\*\*(\d+)\*\*") { $errors.Add("接口索引缺少 Route 文件数量。") } elseif ([int]$Matches[1] -ne $sourceRoutes.Count) { $errors.Add("接口索引数量 $($Matches[1]) 与源码 Route 数量 $($sourceRoutes.Count) 不一致。") }
if ($map -notmatch '当前源码包含 (\d+) 个 `page\.tsx` 页面入口、(\d+) 个 API Route 文件和 (\d+) 张 PostgreSQL 表') {
    $errors.Add("开发地图缺少可解析的源码基线。")
} else {
    $mapPages = [int]$Matches[1]
    $mapRoutes = [int]$Matches[2]
    $mapTables = [int]$Matches[3]
    if ($mapPages -ne $sourcePages.Count) { $errors.Add("开发地图页面数量 $mapPages 与源码数量 $($sourcePages.Count) 不一致。") }
    if ($mapRoutes -ne $sourceRoutes.Count) { $errors.Add("开发地图 Route 数量 $mapRoutes 与源码数量 $($sourceRoutes.Count) 不一致。") }
    if ($mapTables -ne $sourceTables.Count) { $errors.Add("开发地图表数量 $mapTables 与源码数量 $($sourceTables.Count) 不一致。") }
}

$indexedRows = @($index -split "`r?`n" | Where-Object { $_ -match "\[route\.ts\]\(web/src/app/api/" })
$indexedPaths = [System.Collections.Generic.List[string]]::new()
$indexedHandlers = [System.Collections.Generic.List[string]]::new()
foreach ($row in $indexedRows) {
    $pathMatch = [regex]::Match($row, '`(/api/[^`]+)`')
    $handlerMatch = [regex]::Match($row, '\[route\.ts\]\((web/src/app/api/[^)]+/route\.ts)\)')
    if (-not $pathMatch.Success) { $errors.Add("接口索引存在无法解析路径的行：$row"); continue }
    if (-not $handlerMatch.Success) { $errors.Add("接口索引存在无法解析 Handler 的行：$row"); continue }
    $indexedPaths.Add($pathMatch.Groups[1].Value)
    $indexedHandlers.Add($handlerMatch.Groups[1].Value)
    $methodMatch = [regex]::Match($row, '^\|\s*([^|]+?)\s*\|\s*`')
    if (-not $methodMatch.Success) {
        $errors.Add("接口索引存在无法解析方法的行：$row")
    } elseif (-not $routesByHandler.ContainsKey($handlerMatch.Groups[1].Value)) {
        $errors.Add("接口索引 Handler 不在清单中：$($handlerMatch.Groups[1].Value)")
    } else {
        $indexedMethods = @($methodMatch.Groups[1].Value -split ',' | ForEach-Object { $_.Trim() } | Sort-Object)
        $expectedMethods = @($routesByHandler[$handlerMatch.Groups[1].Value])
        if (($indexedMethods -join ',') -ne ($expectedMethods -join ',')) {
            $errors.Add("接口索引方法与清单不一致：$($handlerMatch.Groups[1].Value)（索引：$($indexedMethods -join ', '); 清单：$($expectedMethods -join ', ')）")
        }
    }
}
if ($indexedPaths.Count -ne $routes.Count) { $errors.Add("接口索引行数 $($indexedPaths.Count) 与清单 Route 数量 $($routes.Count) 不一致。") }
if (($indexedPaths | Group-Object | Where-Object Count -gt 1).Count -gt 0) { $errors.Add("接口索引存在重复 API 路径。") }
$sourceHandlerSet = @($sourceRoutes | ForEach-Object { "web/src/app/api/$($_.FullName.Substring((Join-Path $repoRoot 'web/src/app/api').Length + 1).Replace('\', '/'))" })
foreach ($handler in $indexedHandlers) {
    if ($handler -notin $sourceHandlerSet) { $errors.Add("接口索引 Handler 不存在：$handler") }
}

if ($errors.Count) {
    $errors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Output "validated_routes=$($sourceRoutes.Count)"
Write-Output "validated_pages=$($sourcePages.Count)"
Write-Output "validated_tables=$($sourceTables.Count)"
Write-Output "validated_files=$indexPath,$mapPath"
