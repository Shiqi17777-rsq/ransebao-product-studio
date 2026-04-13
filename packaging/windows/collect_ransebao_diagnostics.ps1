[CmdletBinding()]
param(
    [string]$AppDataName = "ransebao-desktop-app",
    [string]$AppPath = "",
    [string]$OutputDir = ""
)

. (Join-Path $PSScriptRoot "Common.ps1")

if (-not $OutputDir) {
    $OutputDir = [Environment]::GetFolderPath("Desktop")
}

$userDataRoot = Get-RansebaoUserDataRoot -AppDataName $AppDataName
$runtimeBase = Get-RansebaoRuntimeBase -AppDataName $AppDataName
$stateRoot = Get-RansebaoStateRoot -AppDataName $AppDataName
$configRoot = Get-RansebaoConfigRoot -AppDataName $AppDataName
$resolvedAppPath = Resolve-RansebaoAppPath -AppPath $AppPath

$stagingRoot = New-RansebaoTempDirectory -Prefix "ransebao-diagnostics"
$bundleRoot = Join-Path $stagingRoot "Ransebao-Diagnostics"
New-Item -ItemType Directory -Path $bundleRoot -Force | Out-Null

$copied = New-Object System.Collections.Generic.List[string]

if (Copy-PathIfExists -Source $configRoot -Destination (Join-Path $bundleRoot "runtime\config")) {
    $copied.Add("runtime/config")
}

if (Test-Path -LiteralPath $stateRoot) {
    $stateTarget = Join-Path $bundleRoot "runtime\ransebao\state"
    New-Item -ItemType Directory -Path $stateTarget -Force | Out-Null
    Get-ChildItem -LiteralPath $stateRoot -Filter "*.json" -File -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $stateTarget $_.Name) -Force
        $copied.Add(("runtime/ransebao/state/{0}" -f $_.Name))
    }
}

foreach ($logSource in @(
    (Join-Path $runtimeBase "logs"),
    (Join-Path (Join-Path $runtimeBase "ransebao") "logs")
)) {
    if (-not (Test-Path -LiteralPath $logSource)) { continue }
    $name = Split-Path -Path $logSource -Leaf
    $relativeTarget = if ($logSource -like "*\ransebao\logs") { "runtime\ransebao\logs" } else { "runtime\logs" }
    Copy-PathIfExists -Source $logSource -Destination (Join-Path $bundleRoot $relativeTarget) | Out-Null
    $copied.Add($relativeTarget)
}

$dependencyLogDir = Join-Path $runtimeBase "logs\dependencies"
if (Test-Path -LiteralPath $dependencyLogDir) {
    $inventory = Get-ChildItem -LiteralPath $dependencyLogDir -File -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime
    Write-JsonFile -Path (Join-Path $bundleRoot "runtime\logs\dependency-log-inventory.json") -Value $inventory
}

$vendorSnapshot = [PSCustomObject]@{
    PythonRuntime = Test-Path -LiteralPath (Join-Path $runtimeBase "vendor\python-runtime\python.exe")
    SauPython     = Test-Path -LiteralPath (Join-Path $runtimeBase "vendor\sau-venv\Scripts\python.exe")
    ChromiumDir   = Test-Path -LiteralPath (Join-Path $runtimeBase "vendor\ms-playwright")
    DreaminaExe   = Test-Path -LiteralPath (Join-Path $runtimeBase "vendor\dreamina\bin\dreamina.exe")
}

$systemInfo = [PSCustomObject]@{
    GeneratedAt       = (Get-Date).ToString("s")
    ComputerName      = $env:COMPUTERNAME
    UserName          = $env:USERNAME
    AppDataName       = $AppDataName
    UserDataRoot      = $userDataRoot
    RuntimeBase       = $runtimeBase
    ResolvedAppPath   = $resolvedAppPath
    PowerShellVersion = $PSVersionTable.PSVersion.ToString()
    OsVersion         = [System.Environment]::OSVersion.VersionString
    CopiedPaths       = @($copied)
    VendorSnapshot    = $vendorSnapshot
}

Write-JsonFile -Path (Join-Path $bundleRoot "system-info.json") -Value $systemInfo

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$zipPath = Join-Path $OutputDir ("Ransebao-Diagnostics-{0}.zip" -f $stamp)
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path $bundleRoot -DestinationPath $zipPath -Force
Remove-Item -LiteralPath $stagingRoot -Recurse -Force

Write-Host ""
Write-Host "Diagnostics package created." -ForegroundColor Green
Write-Host ("Zip: {0}" -f $zipPath)
Write-Host ""
$systemInfo | ConvertTo-Json -Depth 8
