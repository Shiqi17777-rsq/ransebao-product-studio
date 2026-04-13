#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productStudioRoot = path.resolve(__dirname, "..", "..");
const desktopAppRoot = path.join(productStudioRoot, "desktop-app");
const releaseRoot = path.join(desktopAppRoot, "release");

function fail(message) {
  console.error(`[verify_dist_bundle] ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`[verify_dist_bundle] ${message}`);
}

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function locateAppBundle(inputPath = "") {
  if (inputPath && fs.existsSync(inputPath)) return inputPath;
  const releaseEntries = fs.existsSync(releaseRoot) ? fs.readdirSync(releaseRoot) : [];
  const directApp = releaseEntries
    .filter((entry) => entry.endsWith(".app"))
    .map((entry) => path.join(releaseRoot, entry));
  if (directApp.length) return directApp[0];

  for (const entry of releaseEntries) {
    const candidate = path.join(releaseRoot, entry, "Ransebao Product Studio.app");
    if (fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function assertExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    fail(`缺少 ${label}: ${targetPath}`);
  }
}

function assertMissing(targetPath, label) {
  if (fs.existsSync(targetPath)) {
    fail(`发现不应该打包进去的 ${label}: ${targetPath}`);
  }
}

const requestedPath = process.argv[2] ? path.resolve(process.argv[2]) : "";
const appBundlePath = locateAppBundle(requestedPath);
if (!appBundlePath) {
  fail("未找到 .app 产物，请先运行 build:mac 或 build:mac-dir。");
}

const resourcesPath = path.join(appBundlePath, "Contents", "Resources");
const bundledProductStudioRoot = path.join(resourcesPath, "product-studio");
const bundledVendorRoot = path.join(resourcesPath, "vendor");
const bundledPythonBin = firstExisting([
  path.join(bundledVendorRoot, "python-runtime", "bin", "python3"),
  path.join(bundledVendorRoot, "python-runtime", "bin", "python")
]);

info(`Checking bundle: ${appBundlePath}`);
assertExists(resourcesPath, "Resources 目录");
assertExists(path.join(bundledProductStudioRoot, "engine", "cli.py"), "product-studio engine.cli");
assertExists(path.join(bundledProductStudioRoot, "products", "ransebao", "product.json"), "产品包");
assertExists(path.join(bundledProductStudioRoot, "runtime", "config", "local.example.json"), "local.example.json");
assertExists(path.join(bundledProductStudioRoot, "packaging", "dependency_profiles.json"), "dependency_profiles.json");
if (!bundledPythonBin) {
  fail("未找到内置 Python 二进制。");
}
assertExists(path.join(bundledVendorRoot, "sau-bundle"), "sau 安装材料目录");

assertMissing(path.join(bundledProductStudioRoot, "runtime", "config", "local.json"), "local.json");
assertMissing(path.join(bundledProductStudioRoot, "runtime", "config", "publish_accounts.json"), "publish_accounts.json");
assertMissing(path.join(bundledProductStudioRoot, "runtime", "ransebao", "state"), "runtime/ransebao/state");
assertMissing(path.join(bundledProductStudioRoot, "runtime", "ransebao", "outputs"), "runtime/ransebao/outputs");
assertMissing(path.join(bundledProductStudioRoot, "runtime", "ransebao", "logs"), "runtime/ransebao/logs");

info(`Bundled Python: ${bundledPythonBin}`);
info("Bundle verification passed.");
