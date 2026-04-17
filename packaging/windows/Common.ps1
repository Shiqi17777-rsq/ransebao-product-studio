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

function Get-RansebaoExecutableCandidatesFromDirectory {
    param(
        [string]$Directory
    )

    $results = New-Object System.Collections.Generic.List[string]
    if (-not $Directory) {
        return $results
    }
    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) {
        return $results
    }

    $patterns = @(
        "Ransebao Product Studio.exe",
        "Ransebao-Product-Studio-*-portable.exe",
        "Ransebao-Product-Studio-*.exe"
    )

    foreach ($pattern in $patterns) {
        $matches = Get-ChildItem -LiteralPath $Directory -Filter $pattern -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending
        foreach ($match in $matches) {
            $results.Add($match.FullName)
        }
    }

    return $results
}

function Get-RansebaoRegistryExecutableCandidates {
    $results = New-Object System.Collections.Generic.List[string]
    $registryRoots = @(
        "Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "Registry::HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "Registry::HKEY_LOCAL_MACHINE\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )

    foreach ($root in $registryRoots) {
        $entries = Get-ItemProperty -Path $root -ErrorAction SilentlyContinue | Where-Object {
            $displayNameProperty = $_.PSObject.Properties["DisplayName"]
            $displayName = if ($displayNameProperty) { [string]$displayNameProperty.Value } else { "" }
            $displayName -like "Ransebao Product Studio*" -or $displayName -like "Ransebao*"
        }
        foreach ($entry in $entries) {
            $displayIconProperty = $entry.PSObject.Properties["DisplayIcon"]
            $displayIcon = if ($displayIconProperty) { [string]$displayIconProperty.Value } else { "" }
            if ($displayIcon) {
                $normalizedIcon = $displayIcon.Trim().Trim('"') -replace ",\d+$", ""
                if (Test-Path -LiteralPath $normalizedIcon -PathType Leaf) {
                    $results.Add($normalizedIcon)
                }
            }

            $installLocationProperty = $entry.PSObject.Properties["InstallLocation"]
            $installLocation = if ($installLocationProperty) { [string]$installLocationProperty.Value } else { "" }
            if ($installLocation) {
                foreach ($candidate in (Get-RansebaoExecutableCandidatesFromDirectory -Directory $installLocation)) {
                    $results.Add($candidate)
                }
            }
        }
    }

    return $results
}

function Resolve-RansebaoAppPath {
    param(
        [string]$AppPath = ""
    )

    $candidates = New-Object System.Collections.Generic.List[string]

    if ($AppPath) {
        if (Test-Path -LiteralPath $AppPath -PathType Container) {
            foreach ($candidate in (Get-RansebaoExecutableCandidatesFromDirectory -Directory $AppPath)) {
                $candidates.Add($candidate)
            }
        } else {
            $candidates.Add($AppPath)
        }
    }

    if ($PSScriptRoot) {
        $candidates.Add((Join-Path $PSScriptRoot "Ransebao Product Studio.exe"))
        $candidates.Add((Join-Path (Split-Path $PSScriptRoot -Parent) "Ransebao Product Studio.exe"))
        foreach ($candidate in (Get-RansebaoExecutableCandidatesFromDirectory -Directory $PSScriptRoot)) {
            $candidates.Add($candidate)
        }
        foreach ($candidate in (Get-RansebaoExecutableCandidatesFromDirectory -Directory (Split-Path $PSScriptRoot -Parent))) {
            $candidates.Add($candidate)
        }
    }

    if ($env:LOCALAPPDATA) {
        $candidates.Add((Join-Path $env:LOCALAPPDATA "Programs\Ransebao Product Studio\Ransebao Product Studio.exe"))
    }
    if ($env:ProgramFiles) {
        $candidates.Add((Join-Path $env:ProgramFiles "Ransebao Product Studio\Ransebao Product Studio.exe"))
    }
    $programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
    if ($programFilesX86) {
        $candidates.Add((Join-Path $programFilesX86 "Ransebao Product Studio\Ransebao Product Studio.exe"))
    }

    $desktopPath = [Environment]::GetFolderPath("Desktop")
    if ($desktopPath) {
        $candidates.Add((Join-Path $desktopPath "Ransebao Product Studio.exe"))
        $candidates.Add((Join-Path $desktopPath "Ransebao Product Studio\Ransebao Product Studio.exe"))
        foreach ($candidate in (Get-RansebaoExecutableCandidatesFromDirectory -Directory $desktopPath)) {
            $candidates.Add($candidate)
        }
        foreach ($candidate in (Get-RansebaoExecutableCandidatesFromDirectory -Directory (Join-Path $desktopPath "Ransebao Product Studio"))) {
            $candidates.Add($candidate)
        }
    }

    foreach ($candidate in (Get-RansebaoRegistryExecutableCandidates)) {
        $candidates.Add($candidate)
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
