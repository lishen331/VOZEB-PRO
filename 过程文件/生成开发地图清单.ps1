$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$apiRoot = Join-Path $repoRoot "web/src/app/api"
$appRoot = Join-Path $repoRoot "web/src/app"

$methodPattern = "(?m)^export\s+(?:(?:async\s+)?function|const)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b"
$reExportPattern = "(?m)^export\s*\{([^}]+)\}\s*from\s*[`"']([^`"']+)[`"']"
$importPattern = "(?m)from\s+[`"'](@/(?:lib|services|stores|hooks)/[^`"']+)[`"']"
$authMarkers = @(
    "getCurrentUser",
    "requireCurrentUser",
    "getOptionalCurrentUser",
    "requireAdmin",
    "requireAdminAccess",
    "hasAdminPermission",
    "assertWorkerToken",
    "requireWorkerToken",
    "assertMaintenanceToken",
    "requireMaintenanceToken",
    "verifyWebhook",
    "verifyPaymentWebhook",
    "verifyGenerationWebhook",
    "checkAuthRateLimit",
    "assertInstallToken",
    "INSTALL_TOKEN",
    "VOZEB_PRO_WORKER_TOKEN",
    "authorization"
)

$routeRows = foreach ($file in Get-ChildItem -LiteralPath $apiRoot -Recurse -Filter "route.ts" | Sort-Object FullName) {
    $source = Get-Content -Raw -LiteralPath $file.FullName
    $relative = $file.FullName.Substring($apiRoot.Length + 1).Replace("\", "/")
    $routePart = $relative -replace "/route\.ts$", ""

    $methods = @([regex]::Matches($source, $methodPattern) | ForEach-Object { $_.Groups[1].Value })
    foreach ($match in [regex]::Matches($source, $reExportPattern)) {
        $methods += @([regex]::Matches($match.Groups[1].Value, "\b(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b") | ForEach-Object { $_.Groups[1].Value })
    }

    $imports = @([regex]::Matches($source, $importPattern) |
        ForEach-Object { $_.Groups[1].Value } |
        Sort-Object -Unique)
    $authEvidence = @($authMarkers | Where-Object { $source.Contains($_) })

    [pscustomobject]@{
        domain = ($routePart -split "/")[0]
        path = "/api/$routePart"
        methods = @($methods | Sort-Object -Unique)
        file = "web/src/app/api/$relative"
        imports = $imports
        authEvidence = $authEvidence
    }
}

$routeRows | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $PSScriptRoot "api-route-inventory.json")

$pageRows = foreach ($file in Get-ChildItem -LiteralPath $appRoot -Recurse -Filter "page.tsx" |
    Where-Object FullName -NotMatch "[\\/]api[\\/]" |
    Sort-Object FullName) {
    $relative = $file.FullName.Substring($appRoot.Length + 1).Replace("\", "/")
    $route = "/" + (($relative -replace "/page\.tsx$", "") -replace "^page\.tsx$", "")
    $route = $route -replace "\([^/]+\)/", ""
    [pscustomobject]@{
        route = $route
        file = "web/src/app/$relative"
    }
}

$pageRows | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $PSScriptRoot "page-route-inventory.json")

$schemaFiles = Get-ChildItem -LiteralPath (Join-Path $repoRoot "web/src/lib/server/database") -Filter "schema*.ts" | Sort-Object FullName
$schemaSource = ($schemaFiles | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n"
[regex]::Matches($schemaSource, "CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_]+)") |
    ForEach-Object { $_.Groups[1].Value } |
    Sort-Object -Unique |
    Set-Content -Encoding utf8 -LiteralPath (Join-Path $PSScriptRoot "database-table-inventory.txt")

Write-Output "api_routes=$($routeRows.Count)"
Write-Output "pages=$($pageRows.Count)"
Write-Output "tables=$((Get-Content -LiteralPath (Join-Path $PSScriptRoot 'database-table-inventory.txt')).Count)"
