#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productStudioRoot = path.resolve(__dirname, "..", "..");
const playgroundRoot = path.resolve(productStudioRoot, "..");
const stagingRoot = path.join(productStudioRoot, "packaging", "bundle-staging");
const productStudioStage = path.join(stagingRoot, "product-studio");
const vendorStage = path.join(stagingRoot, "vendor");
const tempStage = path.join(stagingRoot, ".tmp");
const pythonStage = path.join(vendorStage, "python-runtime");
const sauBundleStage = path.join(vendorStage, "sau-bundle");
const sauSourceStage = path.join(sauBundleStage, "source", "social-auto-upload");
const sauDistStage = path.join(sauBundleStage, "dist");
const sauWheelhouseStage = path.join(sauBundleStage, "wheelhouse");
const sauBuildVenvStage = path.join(tempStage, "sau-build-venv");
const manifestPath = path.join(stagingRoot, "bundle-manifest.json");

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const dryRun = args.has("--dry-run");
const skipWheelhouse = args.has("--skip-wheelhouse");
const skipPython = args.has("--skip-python");
const supportedPythonMin = [3, 10, 0];
const supportedPythonMaxExclusive = [3, 13, 0];

function readOption(name) {
  const directIndex = rawArgs.indexOf(name);
  if (directIndex >= 0) {
    return rawArgs[directIndex + 1] || "";
  }
  const inline = rawArgs.find((candidate) => candidate.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : "";
}

const bundleTarget =
  readOption("--target") ||
  process.env.PRODUCT_STUDIO_BUNDLE_TARGET ||
  (process.platform === "win32" ? "win-x64" : "mac-arm64");
const isWindowsBundleTarget = bundleTarget.startsWith("win");
const windowsPythonVersion = process.env.PRODUCT_STUDIO_WINDOWS_PYTHON_VERSION || "3.12.10";
const windowsPythonNugetUrl =
  process.env.PRODUCT_STUDIO_WINDOWS_PYTHON_NUGET_URL ||
  `https://api.nuget.org/v3-flatcontainer/python/${windowsPythonVersion}/python.${windowsPythonVersion}.nupkg`;
const includeSauSource = process.env.PRODUCT_STUDIO_INCLUDE_SAU_SOURCE === "1";
const windowsSauExtraWheelSpecs = [
  "colorama==0.4.6",
  "win32-setctime==1.2.0"
];

function log(message) {
  console.log(`[prepare_bundle_assets] ${message}`);
}

function ensureDir(targetPath) {
  if (!dryRun) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
}

function resetDir(targetPath) {
  if (dryRun) return;
  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.mkdirSync(targetPath, { recursive: true });
}

function normalizeRelative(root, candidate) {
  const relative = path.relative(root, candidate).replace(/\\/g, "/");
  return relative || ".";
}

function anyPrefix(relative, prefixes) {
  return prefixes.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`));
}

function copyTree(source, destination, include, { dereference = false } = {}) {
  if (!fs.existsSync(source)) {
    throw new Error(`Source not found: ${source}`);
  }
  if (dryRun) {
    log(`DRY RUN copy ${source} -> ${destination}`);
    return;
  }
  fs.cpSync(source, destination, {
    recursive: true,
    dereference,
    filter: (src) => include(src)
  });
}

function downloadFile(url, destinationPath) {
  ensureDir(path.dirname(destinationPath));
  run("curl", [
    "-L",
    "--fail",
    "--retry",
    "10",
    "--retry-delay",
    "2",
    "--retry-all-errors",
    "-C",
    "-",
    "-o",
    destinationPath,
    url
  ], {
    cwd: productStudioRoot
  });
}

function extractZipSubdir(pythonBin, archivePath, destinationRoot, prefix = "") {
  ensureDir(destinationRoot);
  const script = `
import pathlib
import sys
import zipfile

archive = pathlib.Path(sys.argv[1])
destination = pathlib.Path(sys.argv[2])
prefix = sys.argv[3].strip("/")

with zipfile.ZipFile(archive) as zip_file:
    for member in zip_file.infolist():
        name = member.filename.rstrip("/")
        if prefix:
            if not name.startswith(prefix + "/"):
                continue
            relative = name[len(prefix) + 1:]
        else:
            relative = name
        if not relative:
            continue
        target = destination / relative
        if member.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with zip_file.open(member, "r") as source, open(target, "wb") as output:
            output.write(source.read())
`;
  run(pythonBin, ["-c", script, archivePath, destinationRoot, prefix], {
    cwd: productStudioRoot
  });
}

function stageProductStudioSnapshot(sourceRoot, destinationRoot) {
  ensureDir(destinationRoot);
  const include = buildProductStudioFilter(sourceRoot);
  const topLevelEntries = fs.readdirSync(sourceRoot);
  for (const entry of topLevelEntries) {
    const sourcePath = path.join(sourceRoot, entry);
    if (!include(sourcePath)) continue;
    const destinationPath = path.join(destinationRoot, entry);
    if (entry === "packaging") {
      ensureDir(destinationPath);
      for (const child of fs.readdirSync(sourcePath)) {
        const childSource = path.join(sourcePath, child);
        if (!include(childSource)) continue;
        copyTree(childSource, path.join(destinationPath, child), include);
      }
      continue;
    }
    copyTree(sourcePath, destinationPath, include);
  }
}

function run(command, commandArgs, { cwd } = {}) {
  log(`${command} ${commandArgs.join(" ")}`);
  if (dryRun) return;
  const completed = spawnSync(command, commandArgs, {
    cwd,
    stdio: "inherit"
  });
  if (completed.status !== 0) {
    throw new Error(`Command failed (${completed.status}): ${command} ${commandArgs.join(" ")}`);
  }
}

function capture(command, commandArgs, { cwd } = {}) {
  const completed = spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8"
  });
  if (completed.status !== 0) {
    throw new Error((completed.stderr || completed.stdout || "").trim() || `Command failed: ${command}`);
  }
  return (completed.stdout || "").trim();
}

function parseVersion(versionText) {
  const match = String(versionText || "").trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return match.slice(1).map((segment) => Number(segment));
}

function compareVersions(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }
  return 0;
}

function isSupportedPythonVersion(versionTuple) {
  if (!versionTuple) return false;
  return (
    compareVersions(versionTuple, supportedPythonMin) >= 0 &&
    compareVersions(versionTuple, supportedPythonMaxExclusive) < 0
  );
}

function readPythonVersion(pythonBin) {
  const versionText = capture(
    pythonBin,
    ["-c", "import sys; print('.'.join(map(str, sys.version_info[:3])))"],
    { cwd: productStudioRoot }
  );
  const parsed = parseVersion(versionText);
  if (!parsed) {
    throw new Error(`Unable to parse Python version from ${pythonBin}: ${versionText}`);
  }
  return parsed;
}

function formatVersion(versionTuple) {
  return versionTuple.join(".");
}

function detectUvBin() {
  try {
    return capture("/bin/zsh", ["-lc", "command -v uv || true"], { cwd: productStudioRoot });
  } catch {
    return "";
  }
}

function detectUvManagedPythonCandidates(uvBin) {
  if (!uvBin) return [];
  let stdout = "";
  try {
    stdout = capture(uvBin, ["python", "list"], { cwd: productStudioRoot });
  } catch {
    return [];
  }

  const candidates = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.includes("<download available>")) continue;
    if (!trimmed.startsWith("cpython-")) continue;

    const versionMatch = trimmed.match(/^cpython-(\d+\.\d+\.\d+)/);
    const pathMatch = trimmed.match(/(\S+)$/);
    if (!versionMatch || !pathMatch) continue;

    const versionTuple = parseVersion(versionMatch[1]);
    if (!isSupportedPythonVersion(versionTuple)) continue;

    const candidatePath = pathMatch[1];
    if (!candidatePath.startsWith("/")) continue;
    if (!fs.existsSync(candidatePath)) continue;

    candidates.push({
      pythonBin: candidatePath,
      versionTuple
    });
  }

  candidates.sort((left, right) => compareVersions(right.versionTuple, left.versionTuple));
  return candidates;
}

function detectPythonBin() {
  if (process.env.PRODUCT_STUDIO_BUNDLED_PYTHON_BIN) {
    const candidate = process.env.PRODUCT_STUDIO_BUNDLED_PYTHON_BIN;
    const versionTuple = readPythonVersion(candidate);
    if (!isSupportedPythonVersion(versionTuple)) {
      throw new Error(
        `PRODUCT_STUDIO_BUNDLED_PYTHON_BIN 指向的 Python 版本不兼容：${candidate} (${formatVersion(versionTuple)})，需要 >=3.10 且 <3.13。`
      );
    }
    return candidate;
  }

  const uvBin = detectUvBin();
  const uvCandidates = detectUvManagedPythonCandidates(uvBin);
  if (uvCandidates.length) {
    const selected = uvCandidates[0];
    log(`Using uv-managed Python ${formatVersion(selected.versionTuple)} from ${selected.pythonBin}`);
    return selected.pythonBin;
  }

  try {
    const detected = capture("/bin/zsh", ["-lc", "command -v python3 || command -v python"], {
      cwd: productStudioRoot
    });
    if (detected) {
      const versionTuple = readPythonVersion(detected);
      if (isSupportedPythonVersion(versionTuple)) {
        log(`Using system Python ${formatVersion(versionTuple)} from ${detected}`);
        return detected;
      }
      log(`Ignoring incompatible system Python ${formatVersion(versionTuple)} from ${detected}`);
    }
  } catch {
    // fall through to uv install path below
  }

  if (uvBin) {
    const requestedVersion = process.env.PRODUCT_STUDIO_BUNDLED_PYTHON_VERSION || "3.12";
    log(`No compatible Python detected, installing ${requestedVersion} via uv for bundle preparation`);
    run(uvBin, ["python", "install", requestedVersion], {
      cwd: productStudioRoot
    });
    const installedCandidates = detectUvManagedPythonCandidates(uvBin);
    if (installedCandidates.length) {
      const selected = installedCandidates[0];
      log(`Using freshly installed uv Python ${formatVersion(selected.versionTuple)} from ${selected.pythonBin}`);
      return selected.pythonBin;
    }
  }

  throw new Error(
    "Unable to detect a compatible Python binary for bundle preparation. 需要 >=3.10 且 <3.13，可通过设置 PRODUCT_STUDIO_BUNDLED_PYTHON_BIN 指向兼容解释器，或安装 uv 后重试。"
  );
}

function buildProductStudioFilter(sourceRoot) {
  const excludedPrefixes = [
    "desktop-app/node_modules",
    "desktop-app/release",
    "desktop-app/dist",
    "packaging/bundle-staging",
    "runtime/cache",
    "runtime/logs",
    "runtime/outputs",
    "runtime/state",
    "runtime/ransebao",
    "runtime/ransebao/state",
    "runtime/ransebao/outputs",
    "runtime/ransebao/logs",
    "runtime/ransebao/cache",
    ".git"
  ];
  const excludedFiles = new Set([
    "runtime/config/local.json",
    "runtime/config/publish_accounts.json"
  ]);

  return (candidate) => {
    const relative = normalizeRelative(sourceRoot, candidate);
    const name = path.basename(candidate);
    if (name === ".DS_Store" || name === "__pycache__") return false;
    if (excludedFiles.has(relative)) return false;
    if (anyPrefix(relative, excludedPrefixes)) return false;
    return true;
  };
}

function buildSauFilter(sourceRoot) {
  const excludedPrefixes = [
    ".git",
    ".venv",
    "node_modules",
    "cookies",
    "output",
    "uploads"
  ];
  return (candidate) => {
    const relative = normalizeRelative(sourceRoot, candidate);
    const name = path.basename(candidate);
    if (name === ".DS_Store" || name === "__pycache__") return false;
    if (anyPrefix(relative, excludedPrefixes)) return false;
    return true;
  };
}

function latestWheel(distRoot) {
  if (!fs.existsSync(distRoot)) return "";
  const wheelNames = fs.readdirSync(distRoot).filter((name) => name.endsWith(".whl")).sort();
  return wheelNames.length ? path.join(distRoot, wheelNames[wheelNames.length - 1]) : "";
}

function preparePythonRuntime(pythonBin) {
  if (isWindowsBundleTarget) {
    if (skipPython) {
      return {
        pythonBin: path.join(pythonStage, "python.exe"),
        pythonPrefix: pythonStage,
        sourceUrl: windowsPythonNugetUrl,
        sourceVersion: windowsPythonVersion
      };
    }

    const windowsArchivePath = path.join(tempStage, `python-${windowsPythonVersion}.nupkg`);
    resetDir(pythonStage);
    downloadFile(windowsPythonNugetUrl, windowsArchivePath);
    extractZipSubdir(pythonBin, windowsArchivePath, pythonStage, "tools");
    return {
      pythonBin: path.join(pythonStage, "python.exe"),
      pythonPrefix: pythonStage,
      sourceUrl: windowsPythonNugetUrl,
      sourceVersion: windowsPythonVersion
    };
  }

  const pythonPrefix = capture(pythonBin, ["-c", "import sys; print(sys.prefix)"], {
    cwd: productStudioRoot
  });
  if (!pythonPrefix) {
    throw new Error("Python prefix is empty, cannot stage runtime.");
  }
  if (!skipPython) {
    copyTree(pythonPrefix, pythonStage, () => true, { dereference: true });
  }
  return {
    pythonBin,
    pythonPrefix
  };
}

function prepareSauBundle(pythonBin) {
  const sauRoot = process.env.PRODUCT_STUDIO_SAU_SOURCE || path.join(playgroundRoot, "social-auto-upload");
  if (includeSauSource) {
    copyTree(sauRoot, sauSourceStage, buildSauFilter(sauRoot));
  }
  ensureDir(sauDistStage);
  ensureDir(sauWheelhouseStage);
  resetDir(sauBuildVenvStage);

  const sauBuildPython = path.join(sauBuildVenvStage, "bin", "python");

  if (!skipWheelhouse) {
    run(pythonBin, ["-m", "venv", sauBuildVenvStage], {
      cwd: productStudioRoot
    });
    run(sauBuildPython, ["-m", "pip", "install", "--upgrade", "pip", "build"], {
      cwd: productStudioRoot
    });
    run(sauBuildPython, ["-m", "build", "--wheel", "--outdir", sauDistStage, sauRoot], {
      cwd: productStudioRoot
    });

    const wheelPath = latestWheel(sauDistStage);
    if (!wheelPath) {
      throw new Error("Failed to build social-auto-upload wheel.");
    }

    const downloadArgs = ["-m", "pip", "download", "--dest", sauWheelhouseStage];
    if (isWindowsBundleTarget) {
      downloadArgs.push(
        "--only-binary=:all:",
        "--platform",
        "win_amd64",
        "--implementation",
        "cp",
        "--python-version",
        "3.12",
        "--abi",
        "cp312"
      );
    }
    downloadArgs.push(wheelPath);
    run(sauBuildPython, downloadArgs, {
      cwd: productStudioRoot
    });

    if (isWindowsBundleTarget && windowsSauExtraWheelSpecs.length) {
      const extraWheelArgs = [
        "-m",
        "pip",
        "download",
        "--dest",
        sauWheelhouseStage,
        "--only-binary=:all:",
        "--platform",
        "win_amd64",
        "--implementation",
        "cp",
        "--python-version",
        "3.12",
        "--abi",
        "cp312",
        ...windowsSauExtraWheelSpecs
      ];
      run(sauBuildPython, extraWheelArgs, {
        cwd: productStudioRoot
      });
    }
  }

  return {
    sourceRoot: includeSauSource ? sauRoot : "",
    wheelPath: latestWheel(sauDistStage),
    wheelhouseRoot: sauWheelhouseStage
  };
}

function writeManifest(payload) {
  if (dryRun) {
    log(`DRY RUN write manifest ${manifestPath}`);
    return;
  }
  fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2), "utf8");
}

function main() {
  log(`Staging bundle assets into ${stagingRoot}`);
  resetDir(stagingRoot);
  ensureDir(vendorStage);

  stageProductStudioSnapshot(productStudioRoot, productStudioStage);

  const pythonBin = detectPythonBin();
  const pythonInfo = preparePythonRuntime(pythonBin);
  const sauInfo = prepareSauBundle(pythonBin);

  writeManifest({
    createdAt: new Date().toISOString(),
    dryRun,
    bundleTarget,
    productStudioRoot,
    stagedProductStudio: productStudioStage,
    stagedVendorRoot: vendorStage,
    stagedPythonRoot: pythonStage,
    stagedSauBundleRoot: sauBundleStage,
    python: pythonInfo,
    sau: sauInfo
  });

  log("Bundle staging completed.");
}

main();
