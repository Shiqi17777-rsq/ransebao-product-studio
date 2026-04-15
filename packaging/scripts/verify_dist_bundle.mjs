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

function assertExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    fail(`Missing ${label}: ${targetPath}`);
  }
}

function assertMissing(targetPath, label) {
  if (fs.existsSync(targetPath)) {
    fail(`Found unexpected ${label}: ${targetPath}`);
  }
}

function locateMacBundle(inputPath = "") {
  if (inputPath && fs.existsSync(inputPath) && inputPath.endsWith(".app")) return inputPath;
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

function locateWindowsUnpacked(inputPath = "") {
  if (inputPath && fs.existsSync(inputPath)) {
    const stat = fs.statSync(inputPath);
    if (stat.isDirectory() && path.basename(inputPath) === "win-unpacked") {
      return inputPath;
    }
    if (stat.isFile() && inputPath.toLowerCase().endsWith(".exe")) {
      const sibling = path.join(path.dirname(inputPath), "win-unpacked");
      if (fs.existsSync(sibling)) return sibling;
    }
  }
  const candidate = path.join(releaseRoot, "win-unpacked");
  return fs.existsSync(candidate) ? candidate : "";
}

function resolveBundleTarget(inputPath = "") {
  const macBundlePath = locateMacBundle(inputPath);
  if (macBundlePath) {
    return {
      platform: "mac",
      label: macBundlePath,
      resourcesPath: path.join(macBundlePath, "Contents", "Resources"),
      bundledPythonCandidates: [
        path.join(macBundlePath, "Contents", "Resources", "vendor", "python-runtime", "bin", "python3"),
        path.join(macBundlePath, "Contents", "Resources", "vendor", "python-runtime", "bin", "python")
      ]
    };
  }

  const windowsUnpackedPath = locateWindowsUnpacked(inputPath);
  if (windowsUnpackedPath) {
    return {
      platform: "win",
      label: windowsUnpackedPath,
      resourcesPath: path.join(windowsUnpackedPath, "resources"),
      bundledPythonCandidates: [
        path.join(windowsUnpackedPath, "resources", "vendor", "python-runtime", "python.exe"),
        path.join(windowsUnpackedPath, "resources", "vendor", "python-runtime", "python3.exe")
      ]
    };
  }

  return null;
}

const requestedPath = process.argv[2] ? path.resolve(process.argv[2]) : "";
const target = resolveBundleTarget(requestedPath);
if (!target) {
  fail("No macOS .app or Windows win-unpacked bundle found. Run build:mac/build:mac-dir or build:win/build:win-portable first.");
}

const bundledProductStudioRoot = path.join(target.resourcesPath, "product-studio");
const bundledVendorRoot = path.join(target.resourcesPath, "vendor");
const bundledPythonBin = firstExisting(target.bundledPythonCandidates);

info(`Checking ${target.platform} bundle: ${target.label}`);
assertExists(target.resourcesPath, "resources directory");
assertExists(path.join(bundledProductStudioRoot, "engine", "cli.py"), "product-studio engine.cli");
assertExists(path.join(bundledProductStudioRoot, "products", "ransebao", "product.json"), "ransebao product config");
assertExists(path.join(bundledProductStudioRoot, "runtime", "config", "local.example.json"), "local.example.json");
assertExists(path.join(bundledProductStudioRoot, "packaging", "dependency_profiles.json"), "dependency_profiles.json");
if (!bundledPythonBin) {
  fail("Bundled Python binary not found.");
}
assertExists(path.join(bundledVendorRoot, "sau-bundle"), "sau bundle directory");

assertMissing(path.join(bundledProductStudioRoot, "runtime", "config", "local.json"), "local.json");
assertMissing(path.join(bundledProductStudioRoot, "runtime", "config", "publish_accounts.json"), "publish_accounts.json");
assertMissing(path.join(bundledProductStudioRoot, "runtime", "ransebao", "state"), "runtime/ransebao/state");
assertMissing(path.join(bundledProductStudioRoot, "runtime", "ransebao", "outputs"), "runtime/ransebao/outputs");
assertMissing(path.join(bundledProductStudioRoot, "runtime", "ransebao", "logs"), "runtime/ransebao/logs");

info(`Bundled Python: ${bundledPythonBin}`);
info("Bundle verification passed.");
