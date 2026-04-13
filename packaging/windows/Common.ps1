Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RansebaoUserDataRoot {
    param(
        [string]$AppDataName = "ransebao-desktop-app"
    )

    if (-not $env:APPDATA) {
        throw "APPDATA is not set."
    }

    return (Join-Path $env:APPDATA $AppDataName)
}

function Get-RansebaoRuntimeBase {
    param(
        [string]$AppDataName = "ransebao-desktop-app"
    )

    return (Join-Path (Get-RansebaoUserDataRoot -AppDataName $AppDataName) "runtime")
}

function Get-RansebaoStateRoot {
    param(
        [string]$AppDataName = "ransebao-desktop-app"
    )

    return (Join-Path (Join-Path (Get-RansebaoRuntimeBase -AppDataName $AppDataName) "ransebao") "state")
}

function Get-RansebaoConfigRoot {
    param(
        [string]$AppDataName = "ransebao-desktop-app"
    )

    return (Join-Path (Get-RansebaoRuntimeBase -AppDataName $AppDataName) "config")
}

function Resolve-RansebaoAppPath {
    param(
        [string]$AppPath = ""
    )

    $candidates = New-Object System.Collections.Generic.List[string]

    if ($AppPath) {
        $candidates.Add($AppPath)
    }

    if ($PSScriptRoot) {
        $candidates.Add((Join-Path $PSScriptRoot "Ransebao Product Studio.exe"))
        $candidates.Add((Join-Path (Split-Path $PSScriptRoot -Parent) "Ransebao Product Studio.exe"))
    }

    if ($env:LOCALAPPDATA) {
        $candidates.Add((Join-Path $env:LOCALAPPDATA "Programs\Ransebao Product Studio\Ransebao Product Studio.exe"))
    }

    $desktopPath = [Environment]::GetFolderPath("Desktop")
    if ($desktopPath) {
        $candidates.Add((Join-Path $desktopPath "Ransebao Product Studio.exe"))
        $candidates.Add((Join-Path $desktopPath "Ransebao Product Studio\Ransebao Product Studio.exe"))
    }

    foreach ($candidate in $candidates) {
        if (-not $candidate) { continue }
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    return $null
}

function Stop-RansebaoProcesses {
    param(
        [switch]$Quiet
    )

    $targets = Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessName -like "Ransebao*"
    }

    $stopped = @()
    foreach ($target in $targets) {
        try {
            Stop-Process -Id $target.Id -Force -ErrorAction Stop
            $stopped += [PSCustomObject]@{
                Name = $target.ProcessName
                Id   = $target.Id
            }
        } catch {
            if (-not $Quiet) {
                Write-Warning ("Failed to stop process {0} ({1}): {2}" -f $target.ProcessName, $target.Id, $_.Exception.Message)
            }
        }
    }

    return $stopped
}

function New-RansebaoTempDirectory {
    param(
        [string]$Prefix = "ransebao"
    )

    $root = if ($env:TEMP) { $env:TEMP } else { [System.IO.Path]::GetTempPath() }
    $name = "{0}-{1}" -f $Prefix, [Guid]::NewGuid().ToString("N")
    $target = Join-Path $root $name
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    return $target
}

function Write-JsonFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][object]$Value
    )

    $dir = Split-Path -Path $Path -Parent
    if ($dir) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $Value | ConvertTo-Json -Depth 12 | Set-Content -Path $Path -Encoding UTF8
}

function Copy-PathIfExists {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    if (-not (Test-Path -LiteralPath $Source)) {
        return $false
    }

    $destinationParent = Split-Path -Path $Destination -Parent
    if ($destinationParent) {
        New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
    }

    $item = Get-Item -LiteralPath $Source
    if ($item.PSIsContainer) {
        Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
    } else {
        Copy-Item -LiteralPath $Source -Destination $Destination -Force
    }

    return $true
}

function New-CheckResult {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Ok,
        [Parameter(Mandatory = $true)][string]$Details,
        [bool]$Critical = $false
    )

    return [PSCustomObject]@{
        Name     = $Name
        Ok       = $Ok
        Critical = $Critical
        Details  = $Details
    }
}
