# Windows Codex Validation Toolkit

This folder contains three PowerShell helpers for Windows-native testing.

## Files

- `reset_ransebao_beta.ps1`
  - Stops running Ransebao processes and removes the user-data root.
  - Use this before a "first launch" retest.
- `collect_ransebao_diagnostics.ps1`
  - Exports runtime config, state JSON files, and dependency logs into a zip on the desktop.
  - Use this instead of sending screenshots only.
- `run_ransebao_smoke_test.ps1`
  - Launches the app, waits for runtime initialization, then exports a JSON summary to the desktop.

## Recommended usage

Open PowerShell in the repo root or in this folder and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

### 1. Reset test state

```powershell
.\reset_ransebao_beta.ps1
```

If you also want to remove a failed install directory:

```powershell
.\reset_ransebao_beta.ps1 -InstallDir "D:\染色包\Ransebao Product Studio"
```

### 2. Smoke test the app

If the app is installed in the default path:

```powershell
.\run_ransebao_smoke_test.ps1
```

If you want to test a specific portable exe:

```powershell
.\run_ransebao_smoke_test.ps1 -AppPath "D:\Ransebao Product Studio\Ransebao Product Studio.exe"
```

### 3. Export diagnostics

```powershell
.\collect_ransebao_diagnostics.ps1
```

This creates a zip on the desktop:

- `Ransebao-Diagnostics-YYYYMMDD-HHMMSS.zip`

## Notes

- The diagnostics package copies runtime config, runtime state, and dependency logs.
- It does **not** copy vendor binaries or browser caches.
- The smoke test returns exit code `1` when critical checks fail.
