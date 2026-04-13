[CmdletBinding()]
param(
    [string]$AppDataName = "ransebao-desktop-app",
    [string]$InstallDir = "",
    [string]$PortableDir = "",
    [switch]$NoProcessKill
)

. (Join-Path $PSScriptRoot "Common.ps1")

$userDataRoot = Get-RansebaoUserDataRoot -AppDataName $AppDataName
$removedPaths = New-Object System.Collections.Generic.List[string]
$stoppedProcesses = @()

if (-not $NoProcessKill) {
    $stoppedProcesses = @(Stop-RansebaoProcesses -Quiet)
}

foreach ($targetPath in @($userDataRoot, $InstallDir, $PortableDir)) {
    if (-not $targetPath) { continue }
    if (Test-Path -LiteralPath $targetPath) {
        Remove-Item -LiteralPath $targetPath -Recurse -Force
        $removedPaths.Add($targetPath)
    }
}

$summary = [PSCustomObject]@{
    ResetAt          = (Get-Date).ToString("s")
    AppDataName      = $AppDataName
    UserDataRoot     = $userDataRoot
    RemovedPaths     = @($removedPaths)
    StoppedProcesses = @($stoppedProcesses)
}

Write-Host ""
Write-Host "Ransebao beta environment reset complete." -ForegroundColor Green
Write-Host ("User data root: {0}" -f $userDataRoot)
if ($removedPaths.Count -gt 0) {
    Write-Host "Removed paths:"
    $removedPaths | ForEach-Object { Write-Host ("  - {0}" -f $_) }
} else {
    Write-Host "No existing paths needed removal."
}

if (@($stoppedProcesses).Count -gt 0) {
    Write-Host "Stopped processes:"
    $stoppedProcesses | ForEach-Object { Write-Host ("  - {0} ({1})" -f $_.Name, $_.Id) }
}

Write-Host ""
$summary | ConvertTo-Json -Depth 6
