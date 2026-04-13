[CmdletBinding()]
param(
    [string]$AppDataName = "ransebao-desktop-app",
    [string]$AppPath = "",
    [int]$LaunchWaitSeconds = 20,
    [switch]$NoLaunch,
    [switch]$LeaveRunning,
    [string]$OutputDir = ""
)

. (Join-Path $PSScriptRoot "Common.ps1")

if (-not $OutputDir) {
    $OutputDir = [Environment]::GetFolderPath("Desktop")
}

$resolvedAppPath = Resolve-RansebaoAppPath -AppPath $AppPath
$userDataRoot = Get-RansebaoUserDataRoot -AppDataName $AppDataName
$runtimeBase = Get-RansebaoRuntimeBase -AppDataName $AppDataName
$stateRoot = Get-RansebaoStateRoot -AppDataName $AppDataName

$checks = New-Object System.Collections.Generic.List[object]
$processSummary = $null

$checks.Add((New-CheckResult -Name "app_executable" -Ok ([bool]$resolvedAppPath) -Critical $true -Details ($(if ($resolvedAppPath) { $resolvedAppPath } else { "App executable not found. Pass -AppPath or install the app first." }))))

if ((-not $NoLaunch) -and $resolvedAppPath) {
    try {
        $process = Start-Process -FilePath $resolvedAppPath -PassThru
        Start-Sleep -Seconds $LaunchWaitSeconds

        $hasExited = $false
        try {
            $hasExited = $process.HasExited
        } catch {
            $hasExited = $false
        }

        $processSummary = [PSCustomObject]@{
            Id        = $process.Id
            HasExited = $hasExited
            ExitCode  = $(if ($hasExited) { $process.ExitCode } else { $null })
        }

        $checks.Add((New-CheckResult -Name "app_launch" -Ok $true -Critical $true -Details ("Launched app process {0}" -f $process.Id)))

        if (-not $LeaveRunning -and -not $hasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    } catch {
        $checks.Add((New-CheckResult -Name "app_launch" -Ok $false -Critical $true -Details $_.Exception.Message))
    }
} elseif ($NoLaunch) {
    $checks.Add((New-CheckResult -Name "app_launch" -Ok $true -Details "Skipped app launch because -NoLaunch was provided."))
}

$checks.Add((New-CheckResult -Name "user_data_root" -Ok (Test-Path -LiteralPath $userDataRoot) -Critical $true -Details $userDataRoot))
$checks.Add((New-CheckResult -Name "runtime_base" -Ok (Test-Path -LiteralPath $runtimeBase) -Critical $true -Details $runtimeBase))
$checks.Add((New-CheckResult -Name "state_root" -Ok (Test-Path -LiteralPath $stateRoot) -Details $stateRoot))

$dependencyReportPath = Join-Path $stateRoot "current_dependency_report.json"
$environmentReportPath = Join-Path $stateRoot "current_environment_report.json"
$dependencyInstallStatePath = Join-Path $stateRoot "current_dependency_install_state.json"

$checks.Add((New-CheckResult -Name "dependency_report" -Ok (Test-Path -LiteralPath $dependencyReportPath) -Critical $true -Details $dependencyReportPath))
$checks.Add((New-CheckResult -Name "environment_report" -Ok (Test-Path -LiteralPath $environmentReportPath) -Details $environmentReportPath))
$checks.Add((New-CheckResult -Name "dependency_install_state" -Ok (Test-Path -LiteralPath $dependencyInstallStatePath) -Details $dependencyInstallStatePath))

$dependencyItems = @{}
if (Test-Path -LiteralPath $dependencyReportPath) {
    try {
        $dependencyReport = Get-Content -LiteralPath $dependencyReportPath -Raw | ConvertFrom-Json
        if ($dependencyReport.items) {
            foreach ($item in $dependencyReport.items.PSObject.Properties) {
                $dependencyItems[$item.Name] = [PSCustomObject]@{
                    detected = $item.Value.detected
                    ready    = $item.Value.ready
                    status   = $item.Value.status
                    message  = $item.Value.message
                }
            }
        }
    } catch {
        $checks.Add((New-CheckResult -Name "dependency_report_parse" -Ok $false -Details $_.Exception.Message))
    }
}

$report = [PSCustomObject]@{
    GeneratedAt         = (Get-Date).ToString("s")
    AppDataName         = $AppDataName
    ResolvedAppPath     = $resolvedAppPath
    UserDataRoot        = $userDataRoot
    RuntimeBase         = $runtimeBase
    ProcessSummary      = $processSummary
    Checks              = @($checks)
    DependencyItems     = $dependencyItems
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportPath = Join-Path $OutputDir ("Ransebao-Smoke-Test-{0}.json" -f $stamp)
Write-JsonFile -Path $reportPath -Value $report

Write-Host ""
Write-Host "Ransebao smoke test summary" -ForegroundColor Green
$checks | Format-Table -AutoSize | Out-String | Write-Host

if ($dependencyItems.Count -gt 0) {
    Write-Host "Dependency snapshot:"
    foreach ($entry in $dependencyItems.GetEnumerator()) {
        $value = $entry.Value
        Write-Host ("  - {0}: detected={1}, ready={2}, status={3}" -f $entry.Key, $value.detected, $value.ready, $value.status)
    }
}

Write-Host ""
Write-Host ("Saved report: {0}" -f $reportPath)

$hasCriticalFailure = $checks | Where-Object { $_.Critical -and -not $_.Ok }
if ($hasCriticalFailure) {
    exit 1
}
