const { app, BrowserWindow, ipcMain, shell, dialog, net } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Readable, Transform } = require("stream");
const { pipeline } = require("stream/promises");
const {
  dependencyActionLabel,
  dependencyMessage,
  dreaminaActionLabel,
  installStatusFor,
  isManagedRuntimePath,
  reconcileDependencyInstallStateWithReport
} = require("./app/core/state/dependency-status");
const {
  IPC_CHANNELS,
  EVENT_CHANNELS,
  buildWorkflowProgressEvent,
  buildDependencyProgressEvent
} = require("./app/contracts/event-channels");
const { createDependencyStateCore } = require("./app/core/state/dependency-artifacts");
const { createDashboardLoader } = require("./app/core/dashboard/load-dashboard");
const { createCliRunner } = require("./app/core/workflow/cli-runner");
const { createWorkflowOrchestrator } = require("./app/core/workflow/orchestrator");
const { createDependencyInstaller } = require("./app/platform/dependency-installer");
const { createLifecycleBridge } = require("./app/platform/lifecycle-bridge");
const { createRuntimeStateBridge } = require("./app/platform/runtime-state-bridge");
const { createWindowBridge } = require("./app/platform/window-bridge");
const { registerCoreIpcHandlers } = require("./app/platform/ipc/register-core-handlers");
const { registerWorkbenchIpcHandlers } = require("./app/platform/ipc/register-workbench-handlers");

const desktopAppRoot = __dirname;
const productStudioRoot = app.isPackaged
  ? path.join(process.resourcesPath, "product-studio")
  : path.resolve(__dirname, "..");
const bundledVendorRoot = app.isPackaged
  ? path.join(process.resourcesPath, "vendor")
  : path.join(productStudioRoot, "packaging", "bundle-staging", "vendor");
const bundledPythonRoot = path.join(bundledVendorRoot, "python-runtime");
const bundledSauBundleRoot = path.join(bundledVendorRoot, "sau-bundle");
const bundledRuntimeBaseDir = path.join(productStudioRoot, "runtime");
const runtimeBaseDir =
  process.env.PRODUCT_STUDIO_RUNTIME_ROOT ||
  (app.isPackaged
    ? path.join(app.getPath("userData"), "runtime")
    : bundledRuntimeBaseDir);
const runtimeRoot = path.join(runtimeBaseDir, "ransebao");
const runtimeConfigDir = path.join(runtimeBaseDir, "config");
const localConfigPath = path.join(runtimeConfigDir, "local.json");
const localExampleConfigPath = path.join(runtimeConfigDir, "local.example.json");
const publishAccountsPath = path.join(runtimeConfigDir, "publish_accounts.json");
const dependencyProfilesPath = path.join(productStudioRoot, "packaging", "dependency_profiles.json");
const templateConfigPath = path.join(productStudioRoot, "products", "ransebao", "prompts", "image_prompt_defaults.json");
const templatePreviewDir = path.join(__dirname, "src", "assets", "template-previews");
const DEFAULT_TEMPLATE_IDS = ["portrait-hero", "product-hero", "black-prismatic", "blue-minimal"];
const TEMPLATE_PREVIEW_FILES = {
  "portrait-hero": "portrait-hero-preview.png",
  "product-hero": "product-hero-preview.png",
  "black-prismatic": "black-prismatic-preview.png",
  "blue-minimal": "blue-minimal-preview.png"
};

function resolvedHomeDir() {
  const override = String(process.env.PRODUCT_STUDIO_HOME_OVERRIDE || "").trim();
  if (override) return path.resolve(override);
  return app.getPath("home");
}

function ensureRuntimeBootstrap() {
  [
    runtimeBaseDir,
    runtimeConfigDir,
    path.join(runtimeBaseDir, "vendor"),
    path.join(runtimeRoot, "state"),
    path.join(runtimeRoot, "outputs"),
    path.join(runtimeRoot, "cache"),
    path.join(runtimeRoot, "logs"),
    path.join(runtimeRoot, "logs", "dependencies")
  ].forEach((targetPath) => {
    fs.mkdirSync(targetPath, { recursive: true });
  });

  const bundledLocalExamplePath = path.join(bundledRuntimeBaseDir, "config", "local.example.json");
  if (!fs.existsSync(localExampleConfigPath) && fs.existsSync(bundledLocalExamplePath)) {
    fs.copyFileSync(bundledLocalExamplePath, localExampleConfigPath);
  }
}

ensureRuntimeBootstrap();

const {
  activeWindow,
  emitWorkflowProgress,
  emitDependencyProgress,
  createWindow
} = createWindowBridge({
  BrowserWindow,
  path,
  desktopAppRoot,
  eventChannels: EVENT_CHANNELS,
  buildWorkflowProgressEvent,
  buildDependencyProgressEvent
});

const {
  setScheduledAutomationRunner,
  syncDesktopAutomationSchedule,
  registerAppLifecycle
} = createLifecycleBridge({
  app,
  BrowserWindow,
  normalizeDesktopAutomationSettings,
  readDesktopAutomationSettings,
  writeDesktopAutomationSettings,
  computeNextRunAt,
  formatDate,
  defaultProduct: "ransebao"
});

const runtimeState = createRuntimeStateBridge();

function firstExistingPath(candidates = []) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // Skip invalid candidates and keep probing.
    }
  }
  return "";
}

function textTail(value = "", maxChars = 4000) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  return text.slice(text.length - maxChars);
}

function hasPathSeparator(value = "") {
  const text = String(value || "").trim();
  return Boolean(text && (path.isAbsolute(text) || /[\\/]/.test(text)));
}

function bundledPythonCandidates(root) {
  return [
    path.join(root, "python.exe"),
    path.join(root, "python3.exe"),
    path.join(root, "bin", "python3"),
    path.join(root, "bin", "python")
  ];
}

function managedSauBinCandidates(root) {
  return [
    path.join(root, "Scripts", "sau.exe"),
    path.join(root, "Scripts", "sau"),
    path.join(root, "bin", "sau"),
    path.join(root, ".venv", "Scripts", "sau.exe"),
    path.join(root, ".venv", "Scripts", "sau"),
    path.join(root, ".venv", "bin", "sau")
  ];
}

function managedSauPythonCandidates(root) {
  return [
    path.join(root, "Scripts", "python.exe"),
    path.join(root, "Scripts", "python"),
    path.join(root, "bin", "python"),
    path.join(root, "bin", "python3"),
    path.join(root, ".venv", "Scripts", "python.exe"),
    path.join(root, ".venv", "Scripts", "python"),
    path.join(root, ".venv", "bin", "python"),
    path.join(root, ".venv", "bin", "python3")
  ];
}

function expectedManagedSauPythonPath(root) {
  return process.platform === "win32"
    ? path.join(root, "Scripts", "python.exe")
    : path.join(root, "bin", "python");
}

function bundledPythonBinPath() {
  return firstExistingPath(bundledPythonCandidates(bundledPythonRoot));
}

function managedSauVenvRoot() {
  return path.join(runtimeBaseDir, "vendor", "sau-venv");
}

function managedBundledPythonRoot() {
  return path.join(runtimeBaseDir, "vendor", "python-runtime");
}

function managedBundledPythonBinPath() {
  return firstExistingPath(bundledPythonCandidates(managedBundledPythonRoot()));
}

function copyDirectoryRecursive(sourceRoot, destinationRoot) {
  if (!fs.existsSync(sourceRoot)) return;
  const stat = fs.statSync(sourceRoot);
  if (stat.isDirectory()) {
    fs.mkdirSync(destinationRoot, { recursive: true });
    for (const entry of fs.readdirSync(sourceRoot)) {
      copyDirectoryRecursive(
        path.join(sourceRoot, entry),
        path.join(destinationRoot, entry)
      );
    }
    return;
  }
  fs.mkdirSync(path.dirname(destinationRoot), { recursive: true });
  fs.copyFileSync(sourceRoot, destinationRoot);
}

function ensureManagedBundledPythonRuntime() {
  const managedBin = managedBundledPythonBinPath();
  if (managedBin) return managedBin;
  if (!fs.existsSync(bundledPythonRoot)) return "";
  const managedRoot = managedBundledPythonRoot();
  fs.rmSync(managedRoot, { recursive: true, force: true });
  copyDirectoryRecursive(bundledPythonRoot, managedRoot);
  return managedBundledPythonBinPath();
}

function managedSauBinPath() {
  return firstExistingPath(managedSauBinCandidates(managedSauVenvRoot()));
}

function managedSauPythonPath() {
  return firstExistingPath(managedSauPythonCandidates(managedSauVenvRoot()));
}

function managedSauPyvenvCfgPath() {
  return path.join(managedSauVenvRoot(), "pyvenv.cfg");
}

function ensureManagedSauWindowsPyvenvCfg(basePython = "") {
  if (process.platform !== "win32") return "";
  const targetPath = managedSauPyvenvCfgPath();
  if (fs.existsSync(targetPath)) return targetPath;
  const resolvedBasePython = configuredString(basePython) || managedBundledPythonBinPath() || bundledPythonBinPath();
  if (!resolvedBasePython || !fs.existsSync(resolvedBasePython)) return "";
  const homeDir = path.dirname(resolvedBasePython);
  const content = [
    `home = ${homeDir}`,
    "include-system-site-packages = false",
    "version = 3.12.10",
    `executable = ${resolvedBasePython}`,
    `command = ${resolvedBasePython} -m venv ${managedSauVenvRoot()}`
  ].join("\r\n");
  fs.mkdirSync(managedSauVenvRoot(), { recursive: true });
  fs.writeFileSync(targetPath, `${content}\r\n`, "utf8");
  return targetPath;
}

function managedPatchrightBrowsersPath() {
  return path.join(runtimeBaseDir, "vendor", "ms-playwright");
}

function defaultPatchrightBrowsersPath() {
  return firstExistingPath([
    managedPatchrightBrowsersPath(),
    path.join(resolvedHomeDir(), "Library", "Caches", "ms-playwright"),
    path.join(resolvedHomeDir(), ".cache", "ms-playwright")
  ]);
}

function dependencyLogsDir() {
  return path.join(runtimeRoot, "logs", "dependencies");
}

function dependencyLogPath(id) {
  const safeId = String(id || "dependency")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-");
  return path.join(dependencyLogsDir(), `${safeId}.log`);
}

function readDependencyLog(id) {
  return readTextSafe(dependencyLogPath(id));
}

function writeDependencyLog(id, text = "") {
  fs.mkdirSync(dependencyLogsDir(), { recursive: true });
  fs.writeFileSync(dependencyLogPath(id), String(text || ""), "utf8");
}

function appendDependencyLog(id, text = "") {
  if (!text) return;
  fs.mkdirSync(dependencyLogsDir(), { recursive: true });
  fs.appendFileSync(dependencyLogPath(id), String(text), "utf8");
}

function formatDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatElapsed(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDateTime(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function normalizeDailyTime(value = "09:00") {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "09:00";
  const hours = Math.max(0, Math.min(23, Number(match[1])));
  const minutes = Math.max(0, Math.min(59, Number(match[2])));
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function computeNextRunAt(dailyTime, now = new Date()) {
  const [hours, minutes] = normalizeDailyTime(dailyTime).split(":").map(Number);
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(hours, minutes, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

function readJsonSafe(targetPath) {
  try {
    if (!fs.existsSync(targetPath)) return null;
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch {
    return null;
  }
}

function readTextSafe(targetPath) {
  try {
    if (!fs.existsSync(targetPath)) return "";
    return fs.readFileSync(targetPath, "utf8");
  } catch {
    return "";
  }
}

function writeJsonSafe(targetPath, payload) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), "utf8");
}

function removeFileSafe(targetPath) {
  try {
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
  } catch {
    // Ignore local cleanup failures and let the caller continue.
  }
}

function normalizeTextBlock(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function splitOutlineBlocks(text) {
  return normalizeTextBlock(text)
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function normalizeAccountName(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const normalized = raw
    .replace(/[^a-z0-9._\-\s]/g, "")
    .replace(/[\s.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  return normalized;
}

function defaultPublishAccounts() {
  return {
    xiaohongshu: [],
    douyin: []
  };
}

function readLocalRuntimeConfig() {
  return readJsonSafe(localConfigPath) || readJsonSafe(localExampleConfigPath) || {};
}

function localConfigExists() {
  return fs.existsSync(localConfigPath);
}

function configuredString(value) {
  return String(value || "").trim();
}

function pathExists(targetPath = "") {
  const value = configuredString(targetPath);
  if (!value) return false;
  try {
    return fs.existsSync(value);
  } catch {
    return false;
  }
}

function expandProfileCandidate(candidate) {
  const value = String(candidate || "").trim();
  if (!value) return "";
  const homeDir = resolvedHomeDir();
  return value
    .replace(/^~(?=$|\/)/, homeDir)
    .replace(/<productStudioRoot>/g, productStudioRoot)
    .replace(/<runtimeBaseDir>/g, runtimeBaseDir);
}

function loadDependencyProfiles() {
  return readJsonSafe(dependencyProfilesPath) || {};
}

function probeCommandCandidate(command, args = ["--version"]) {
  const value = configuredString(command);
  if (!value) return { available: false, resolved: "" };
  try {
    const result = spawn(value, args, {
      cwd: productStudioRoot,
      stdio: "ignore",
      env: mergedEnv()
    });
    return new Promise((resolve) => {
      let settled = false;
      const finalize = (payload) => {
        if (settled) return;
        settled = true;
        resolve(payload);
      };
      result.on("error", () => finalize({ available: false, resolved: "" }));
      result.on("close", (code) => finalize({ available: code === 0, resolved: value }));
    });
  } catch {
    return Promise.resolve({ available: false, resolved: "" });
  }
}

async function resolveFirstCommandCandidate(candidates) {
  for (const rawCandidate of candidates) {
    const candidate = expandProfileCandidate(rawCandidate);
    const result = await probeCommandCandidate(candidate);
    if (result.available) {
      return {
        value: candidate,
        detected: true,
        source: "profile"
      };
    }
  }
  return {
    value: "",
    detected: false,
    source: "missing"
  };
}

function dreaminaCommandEnv(commandPath = "") {
  const commandDir = hasPathSeparator(commandPath) ? path.dirname(commandPath) : "";
  return {
    HOME: resolvedHomeDir(),
    PATH: commandDir ? `${commandDir}${path.delimiter}${process.env.PATH || ""}` : process.env.PATH || ""
  };
}

async function inspectDreaminaCandidate(candidate, source = "profile") {
  const value = configuredString(candidate);
  if (!value) {
    return {
      value: "",
      detected: false,
      ready: false,
      requiresLogin: false,
      source
    };
  }

  try {
    if (fs.existsSync(value) && fs.statSync(value).isDirectory()) {
      return {
        value,
        detected: true,
        ready: true,
        requiresLogin: false,
        source,
        mode: "legacy-root"
      };
    }
  } catch {
    // ignore invalid directory candidates
  }

  const commandProbe = await probeCommandCandidate(value, ["--help"]);
  if (!commandProbe.available) {
    return {
      value,
      detected: false,
      ready: false,
      requiresLogin: false,
      source
    };
  }

  const authResult = await runProcess(value, ["user_credit"], {
    cwd: resolvedHomeDir(),
    env: dreaminaCommandEnv(value)
  });
  const authText = `${authResult.stdout || ""}\n${authResult.stderr || ""}`;
  const requiresLogin = /未检测到有效登录态|dreamina login/i.test(authText);

  return {
    value,
    detected: true,
    ready: authResult.ok,
    requiresLogin,
    source,
    mode: "official-bin",
    authMessage: authText.trim()
  };
}

async function resolveDreaminaCandidate(candidates) {
  for (const rawCandidate of candidates) {
    const candidate = expandProfileCandidate(rawCandidate);
    if (!candidate) continue;
    const result = await inspectDreaminaCandidate(candidate, "profile");
    if (result.detected) return result;
  }
  return {
    value: "",
    detected: false,
    ready: false,
    requiresLogin: false,
    source: "missing"
  };
}

function resolveFirstDirectoryCandidate(candidates) {
  for (const rawCandidate of candidates) {
    const candidate = expandProfileCandidate(rawCandidate);
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return {
          value: candidate,
          detected: true,
          source: "profile"
        };
      }
    } catch {
      // Skip invalid directory candidates.
    }
  }
  return {
    value: "",
    detected: false,
    source: "missing"
  };
}

function hasVisibleEntries(targetPath) {
  if (!targetPath) return false;
  try {
    return fs.readdirSync(targetPath).some((name) => !name.startsWith("."));
  } catch {
    return false;
  }
}

function detectBundledAssets() {
  const requiredPaths = [
    path.join(productStudioRoot, "engine", "cli.py"),
    path.join(productStudioRoot, "products", "ransebao", "product.json"),
    path.join(productStudioRoot, "runtime", "config", "local.example.json"),
    path.join(productStudioRoot, "packaging", "dependency_profiles.json")
  ];
  const missing = requiredPaths.filter((targetPath) => !fs.existsSync(targetPath));
  return {
    detected: missing.length === 0,
    value: productStudioRoot,
    missing
  };
}

function resolvePatchrightBrowsersPath(localConfig = readLocalRuntimeConfig()) {
  const configured = configuredString(localConfig?.publish?.patchright_browsers_path);
  if (configured) return configured;
  return defaultPatchrightBrowsersPath();
}

function detectPatchrightBrowsers(localConfig = readLocalRuntimeConfig()) {
  const value = resolvePatchrightBrowsersPath(localConfig);
  return {
    value,
    detected: Boolean(value && hasVisibleEntries(value))
  };
}

function isDirectoryPath(targetPath = "") {
  const value = configuredString(targetPath);
  if (!value) return false;
  try {
    return fs.existsSync(value) && fs.statSync(value).isDirectory();
  } catch {
    return false;
  }
}

function resolvePythonBin(localConfig = readLocalRuntimeConfig(), dependencyReport = null) {
  const managedBundled = managedBundledPythonBinPath();
  if (managedBundled) return managedBundled;
  const bundled = bundledPythonBinPath();
  if (bundled) return bundled;
  const configured = configuredString(localConfig?.runtime?.python_bin || process.env.PRODUCT_STUDIO_PYTHON_BIN);
  if (configured) return configured;
  const detected =
    configuredString(dependencyReport?.recommendedConfig?.pythonBin) ||
    configuredString(readJsonSafe(currentArtifacts().dependencyReport)?.recommendedConfig?.pythonBin);
  if (detected) return detected;
  return process.platform === "win32" ? "python" : "python3";
}

function writeLocalRuntimeConfig(payload = {}) {
  const current = readLocalRuntimeConfig();
  const nextSauRoot = configuredString(
    payload.sauRoot ?? current?.publish?.sau_root ?? current?.publish?.douyin?.root
  );
  const next = {
    ...current,
    selected_product: configuredString(payload.selectedProduct || current?.selected_product || "ransebao"),
    workspace_root: configuredString(payload.workspaceRoot || current?.workspace_root || "./runtime"),
    api_keys: {
      ...(current?.api_keys || {})
    },
    runtime: {
      ...(current?.runtime || {}),
      python_bin: configuredString(payload.pythonBin ?? current?.runtime?.python_bin)
    },
    image: {
      ...(current?.image || {}),
      dreamina_cli_root: configuredString(payload.dreaminaCliRoot ?? current?.image?.dreamina_cli_root),
      device_image_dir: configuredString(payload.deviceImageDir ?? current?.image?.device_image_dir),
      downloads_dir: configuredString(payload.downloadsDir ?? current?.image?.downloads_dir),
      poll_attempts: Number(payload.pollAttempts ?? current?.image?.poll_attempts ?? 8),
      poll_interval_seconds: Number(payload.pollIntervalSeconds ?? current?.image?.poll_interval_seconds ?? 15)
    },
    publish: {
      ...(current?.publish || {}),
      image_dir: configuredString(payload.imageDir ?? payload.downloadsDir ?? current?.publish?.image_dir),
      sau_root: nextSauRoot,
      patchright_browsers_path: configuredString(
        payload.patchrightBrowsersPath ?? current?.publish?.patchright_browsers_path
      ),
      xiaohongshu: {
        ...((current?.publish || {}).xiaohongshu || {})
      },
      douyin: {
        ...((current?.publish || {}).douyin || {}),
        root: nextSauRoot
      }
    }
  };
  writeJsonSafe(localConfigPath, next);
  return summarizeLocalRuntimeConfig(next);
}

function normalizePublishAccounts(payload = {}, legacyLocal = readLocalRuntimeConfig()) {
  const normalized = defaultPublishAccounts();
  ["xiaohongshu", "douyin"].forEach((platform) => {
    const seen = new Set();
    const items = Array.isArray(payload?.[platform]) ? payload[platform] : [];
    items.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const accountName = normalizeAccountName(item.accountName || item.account_name || item.name);
      if (!accountName || seen.has(accountName)) return;
      seen.add(accountName);
      normalized[platform].push({
        id: String(item.id || `${platform}:${accountName}`),
        platform,
        accountName,
        displayName: String(item.displayName || item.display_name || accountName).trim() || accountName,
        enabled: item.enabled !== false,
        status: String(item.status || "unknown"),
        lastCheckedAt: item.lastCheckedAt || null,
        lastLoginAt: item.lastLoginAt || null,
        sourceType: String(item.sourceType || "sau_account"),
        sourceValue: String(item.sourceValue || accountName),
        legacyHint: Boolean(item.legacyHint)
      });
    });
  });

  const legacyDouyinAccount = normalizeAccountName(legacyLocal?.publish?.douyin?.account || "");
  if (legacyDouyinAccount && normalized.douyin.length === 0) {
    normalized.douyin.push({
      id: `douyin:${legacyDouyinAccount}`,
      platform: "douyin",
      accountName: legacyDouyinAccount,
      displayName: legacyDouyinAccount,
      enabled: true,
      status: "unknown",
      lastCheckedAt: null,
      lastLoginAt: null,
      sourceType: "legacy_single_account",
      sourceValue: legacyDouyinAccount,
      legacyHint: true
    });
  }

  return normalized;
}

function resolveSauRoot(localConfig = readLocalRuntimeConfig()) {
  const managedRoot = managedSauBinPath() ? managedSauVenvRoot() : "";
  if (managedRoot) return managedRoot;
  const publishCfg = localConfig?.publish || {};
  return String(
    publishCfg?.sau_root ||
      publishCfg?.douyin?.root ||
      ""
  ).trim();
}

function resolveSauBin(root) {
  const managedBin = managedSauBinPath();
  if (managedBin) return managedBin;
  if (!root) return "sau";
  const directSau = firstExistingPath(managedSauBinCandidates(root));
  if (directSau) return directSau;
  if (fs.existsSync(root) && fs.statSync(root).isFile()) return root;
  return "sau";
}

function summarizePublishAccounts(accounts) {
  const summary = {
    xiaohongshu: { total: 0, enabled: 0, ready: 0 },
    douyin: { total: 0, enabled: 0, ready: 0 }
  };
  ["xiaohongshu", "douyin"].forEach((platform) => {
    const items = Array.isArray(accounts?.[platform]) ? accounts[platform] : [];
    summary[platform].total = items.length;
    summary[platform].enabled = items.filter((item) => item.enabled).length;
    summary[platform].ready = items.filter((item) => item.enabled && item.status === "ready").length;
  });
  return summary;
}

function buildMigrationHints(localConfig, accounts) {
  const hints = [];
  const legacyXhsStates = Array.isArray(localConfig?.publish?.xiaohongshu?.storage_state_files)
    ? localConfig.publish.xiaohongshu.storage_state_files.filter(Boolean)
    : [];
  if (legacyXhsStates.length && (accounts?.xiaohongshu || []).length === 0) {
    hints.push({
      platform: "xiaohongshu",
      level: "warning",
      message: "检测到旧版小红书登录态配置，请在账号管理里重新登录迁移到新账号体系。"
    });
  }
  const legacyDouyinSeeded = (accounts?.douyin || []).some((item) => item.legacyHint);
  if (legacyDouyinSeeded) {
    hints.push({
      platform: "douyin",
      level: "info",
      message: "检测到旧版抖音单账号配置，建议在账号管理里重新登录并逐步迁移到账号列表。"
    });
  }
  return hints;
}

function readPublishAccountsState() {
  const localConfig = readLocalRuntimeConfig();
  const accounts = normalizePublishAccounts(readJsonSafe(publishAccountsPath) || {}, localConfig);
  const sauRoot = resolveSauRoot(localConfig);
  return {
    path: publishAccountsPath,
    accounts,
    summary: summarizePublishAccounts(accounts),
    migrationHints: buildMigrationHints(localConfig, accounts),
    sauRoot,
    sauBin: resolveSauBin(sauRoot),
    legacy: {
      xiaohongshuStorageStateFiles: Array.isArray(localConfig?.publish?.xiaohongshu?.storage_state_files)
        ? localConfig.publish.xiaohongshu.storage_state_files.filter(Boolean)
        : [],
      douyinAccount: String(localConfig?.publish?.douyin?.account || "").trim()
    }
  };
}

function writePublishAccountsState(payload) {
  const localConfig = readLocalRuntimeConfig();
  const accounts = normalizePublishAccounts(payload, localConfig);
  writeJsonSafe(publishAccountsPath, accounts);
  return {
    path: publishAccountsPath,
    accounts,
    summary: summarizePublishAccounts(accounts),
    migrationHints: buildMigrationHints(localConfig, accounts),
    sauRoot: resolveSauRoot(localConfig),
    sauBin: resolveSauBin(resolveSauRoot(localConfig)),
    legacy: {
      xiaohongshuStorageStateFiles: Array.isArray(localConfig?.publish?.xiaohongshu?.storage_state_files)
        ? localConfig.publish.xiaohongshu.storage_state_files.filter(Boolean)
        : [],
      douyinAccount: String(localConfig?.publish?.douyin?.account || "").trim()
    }
  };
}

function patchAccounts(mutator) {
  const current = readPublishAccountsState();
  const next = {
    xiaohongshu: [...current.accounts.xiaohongshu],
    douyin: [...current.accounts.douyin]
  };
  mutator(next);
  return writePublishAccountsState(next);
}

function mergedEnv(overrides = {}) {
  return {
    ...process.env,
    ...Object.fromEntries(
      Object.entries(overrides || {})
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => [key, String(value)])
    )
  };
}

function sauRuntimeEnv(localConfig = readLocalRuntimeConfig()) {
  const browsersPath = resolvePatchrightBrowsersPath(localConfig);
  return browsersPath
    ? {
        PLAYWRIGHT_BROWSERS_PATH: browsersPath
      }
    : {};
}

function runProcess(command, args, { cwd, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: mergedEnv(env)
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finalize = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      finalize({
        ok: false,
        code: 1,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim()
      });
    });
    child.on("close", (code) => {
      finalize({
        ok: code === 0,
        code,
        stdout,
        stderr
      });
    });
  });
}

async function runSauAccountCommand(platform, action, accountName, options = {}) {
  const accountsState = readPublishAccountsState();
  if (!accountsState.sauRoot) {
    return {
      ok: false,
      code: 1,
      stdout: "",
      stderr: "未找到 social-auto-upload 根目录，请先检查本机发布配置。"
    };
  }
  const args = [platform, action, "--account", accountName];
  if (action === "login") {
    args.push(options.headed === false ? "--headless" : "--headed");
  }
  return runProcess(accountsState.sauBin, args, {
    cwd: accountsState.sauRoot,
    env: sauRuntimeEnv()
  });
}

function bundledSauSourceRoot() {
  const bundled = path.join(bundledSauBundleRoot, "source", "social-auto-upload");
  if (fs.existsSync(bundled)) return bundled;
  const devSource = path.resolve(productStudioRoot, "..", "social-auto-upload");
  return fs.existsSync(devSource) ? devSource : "";
}

function bundledSauWheelhouseRoot() {
  const target = path.join(bundledSauBundleRoot, "wheelhouse");
  return fs.existsSync(target) ? target : "";
}

function bundledSauWheelPath() {
  const distRoot = path.join(bundledSauBundleRoot, "dist");
  if (!fs.existsSync(distRoot)) return "";
  const candidates = fs
    .readdirSync(distRoot)
    .filter((name) => name.endsWith(".whl"))
    .sort();
  return candidates.length ? path.join(distRoot, candidates[candidates.length - 1]) : "";
}

function dependencyResult(ok, id, extra = {}) {
  return {
    ok,
    id,
    logPath: dependencyLogPath(id),
    installStatePath: currentArtifacts().dependencyInstallState,
    ...extra
  };
}

function setDependencyInstallState(id, patch = {}) {
  updateDependencyInstallRecord(id, patch);
  emitDependencyProgress(id, patch);
}

async function runLoggedProcess(id, command, args, { cwd, env, onChunk } = {}) {
  writeDependencyLog(id, "");
  appendDependencyLog(id, `$ ${[command, ...args].join(" ")}\n\n`);
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: mergedEnv(env)
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finalize = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };
    const handleChunk = (stream) => (chunk) => {
      const text = chunk.toString();
      if (stream === "stdout") {
        stdout += text;
      } else {
        stderr += text;
      }
      appendDependencyLog(id, text);
      emitDependencyProgress(id, {
        stream,
        latestChunk: text,
        stdoutTail: textTail(stdout, 4000),
        stderrTail: textTail(stderr, 4000)
      });
      if (typeof onChunk === "function") {
        try {
          onChunk({
            id,
            stream,
            text,
            stdout,
            stderr
          });
        } catch {
          // Ignore chunk hook failures to avoid interrupting installation.
        }
      }
    };
    child.stdout.on("data", handleChunk("stdout"));
    child.stderr.on("data", handleChunk("stderr"));
    child.on("error", (error) => {
      const message = `${error.message}\n`;
      appendDependencyLog(id, message);
      emitDependencyProgress(id, {
        stream: "stderr",
        latestChunk: message,
        stdoutTail: textTail(stdout, 4000),
        stderrTail: textTail(`${stderr}\n${message}`, 4000)
      });
      finalize({
        ok: false,
        code: 1,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim()
      });
    });
    child.on("close", (code) => {
      finalize({
        ok: code === 0,
        code,
        stdout,
        stderr
      });
    });
  });
}

async function downloadFileWithPython(id, pythonBin, url, outputPath, { cwd, env, progressStart = 0, progressEnd = 0.98, progressLabel = "下载中" } = {}) {
  const downloaderScript = [
    "import pathlib, sys, urllib.request",
    "url = sys.argv[1]",
    "target = pathlib.Path(sys.argv[2])",
    "target.parent.mkdir(parents=True, exist_ok=True)",
    "request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})",
    "with urllib.request.urlopen(request) as response, open(target, 'wb') as output:",
    "    total = response.headers.get('Content-Length')",
    "    total_bytes = int(total) if total and total.isdigit() else 0",
    "    downloaded = 0",
    "    last_percent = -1",
    "    while True:",
    "        chunk = response.read(1024 * 64)",
    "        if not chunk:",
    "            break",
    "        output.write(chunk)",
    "        downloaded += len(chunk)",
    "        if total_bytes > 0:",
    "            percent = int((downloaded * 100) / total_bytes)",
    "            if percent != last_percent:",
    "                last_percent = percent",
    "                print(f'[DOWNLOAD_PROGRESS] {percent}', flush=True)",
    "print('[DOWNLOAD_COMPLETE]', flush=True)"
  ].join("\n");

  return runLoggedProcess(id, pythonBin, ["-c", downloaderScript, url, outputPath], {
    cwd,
    env,
    onChunk: ({ text }) => {
      const matches = [...String(text || "").matchAll(/\[DOWNLOAD_PROGRESS\]\s+(\d{1,3})/g)];
      if (!matches.length) return;
      const percent = Math.max(0, Math.min(100, Number(matches[matches.length - 1][1])));
      const progress = progressStart + ((progressEnd - progressStart) * percent) / 100;
      setDependencyInstallState(id, {
        progress,
        progressLabel,
        indeterminate: false
      });
    }
  });
}

async function downloadFileWithElectronNet(id, url, outputPath, { progressStart = 0, progressEnd = 0.98, progressLabel = "下载中", inactivityTimeoutMs = 120000, totalTimeoutMs = 1200000 } = {}) {
  writeDependencyLog(id, "");
  appendDependencyLog(id, `$ electron-net-download ${url} ${outputPath}\n\n`);

  const targetDir = path.dirname(outputPath);
  const tempPath = `${outputPath}.download`;
  fs.mkdirSync(targetDir, { recursive: true });
  removeFileSafe(tempPath);
  removeFileSafe(outputPath);

  const controller = new AbortController();
  let inactivityTimer = null;
  let totalTimer = null;
  let downloaded = 0;
  let lastPercent = -1;
  let stdout = "";
  let stderr = "";

  const clearTimers = () => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (totalTimer) clearTimeout(totalTimer);
    inactivityTimer = null;
    totalTimer = null;
  };

  const resetInactivityTimer = () => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      controller.abort(new Error("Dreamina 下载超时：长时间没有收到数据。"));
    }, inactivityTimeoutMs);
  };

  const appendStdout = (text = "") => {
    if (!text) return;
    stdout += text;
    appendDependencyLog(id, text);
    emitDependencyProgress(id, {
      stream: "stdout",
      latestChunk: text,
      stdoutTail: textTail(stdout, 4000),
      stderrTail: textTail(stderr, 4000)
    });
  };

  const appendStderr = (text = "") => {
    if (!text) return;
    stderr += text;
    appendDependencyLog(id, text);
    emitDependencyProgress(id, {
      stream: "stderr",
      latestChunk: text,
      stdoutTail: textTail(stdout, 4000),
      stderrTail: textTail(stderr, 4000)
    });
  };

  const reportPercent = (percent) => {
    const normalizedPercent = Math.max(0, Math.min(100, Number(percent)));
    if (normalizedPercent === lastPercent) return;
    lastPercent = normalizedPercent;
    const text = `[DOWNLOAD_PROGRESS] ${normalizedPercent}\n`;
    appendStdout(text);
    const progress = progressStart + ((progressEnd - progressStart) * normalizedPercent) / 100;
    setDependencyInstallState(id, {
      progress,
      progressLabel,
      indeterminate: false
    });
  };

  totalTimer = setTimeout(() => {
    controller.abort(new Error("Dreamina 下载超时：总耗时超过上限。"));
  }, totalTimeoutMs);

  try {
    const response = await net.fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    if (!response.body) {
      throw new Error("下载响应没有可读取的数据流。");
    }

    const totalHeader = response.headers.get("content-length");
    const totalBytes = totalHeader && /^\d+$/.test(totalHeader) ? Number(totalHeader) : 0;
    if (totalBytes > 0) {
      appendStdout(`[DOWNLOAD_TOTAL] ${totalBytes}\n`);
    }

    resetInactivityTimer();
    const writer = fs.createWriteStream(tempPath);
    const counter = new Transform({
      transform(chunk, encoding, callback) {
        downloaded += chunk.length;
        resetInactivityTimer();
        if (totalBytes > 0) {
          const percent = Math.floor((downloaded * 100) / totalBytes);
          reportPercent(percent);
        }
        callback(null, chunk);
      }
    });

    await pipeline(Readable.fromWeb(response.body), counter, writer);
    clearTimers();
    if (totalBytes > 0) {
      reportPercent(100);
    }

    const stats = fs.statSync(tempPath);
    if (!stats.isFile() || stats.size <= 0) {
      throw new Error(`下载完成但目标文件为空: ${tempPath}`);
    }

    fs.renameSync(tempPath, outputPath);
    appendStdout("[DOWNLOAD_COMPLETE]\n");
    return {
      ok: true,
      code: 0,
      stdout,
      stderr
    };
  } catch (error) {
    clearTimers();
    removeFileSafe(tempPath);
    const message = `${error?.message || String(error)}\n`;
    appendStderr(message);
    return {
      ok: false,
      code: 1,
      stdout,
      stderr: `${stderr}${message}`.trim()
    };
  }
}

const {
  inspectDependencyReport,
  refreshDependencyArtifacts,
  summarizeLocalRuntimeConfig,
  deriveOnboardingState
} = createDependencyStateCore({
  readLocalRuntimeConfig,
  resolveSauRoot,
  configuredString,
  localConfigExists,
  resolvePatchrightBrowsersPath,
  loadDependencyProfiles,
  readDependencyInstallState,
  detectBundledAssets,
  managedBundledPythonBinPath,
  bundledPythonBinPath,
  managedSauBinPath,
  managedSauVenvRoot,
  detectPatchrightBrowsers,
  probeCommandCandidate,
  resolveFirstCommandCandidate,
  inspectDreaminaCandidate,
  resolveDreaminaCandidate,
  pathExists,
  resolveFirstDirectoryCandidate,
  resolveSauBin,
  installStatusFor,
  dependencyActionLabel,
  dreaminaActionLabel,
  dependencyMessage,
  isManagedRuntimePath,
  runtimeBaseDir,
  managedPatchrightBrowsersPath,
  reconcileDependencyInstallStateWithReport,
  writeJsonSafe,
  currentArtifacts
});

const { installBundledDependency, installExternalDependency } = createDependencyInstaller({
  productStudioRoot,
  runtimeBaseDir,
  dependencyResult,
  setDependencyInstallState,
  writeDependencyLog,
  runLoggedProcess,
  ensureManagedBundledPythonRuntime,
  resolvePythonBin,
  readLocalRuntimeConfig,
  bundledSauSourceRoot,
  bundledSauWheelPath,
  bundledSauWheelhouseRoot,
  managedSauVenvRoot,
  expectedManagedSauPythonPath,
  ensureManagedSauWindowsPyvenvCfg,
  managedSauPythonPath,
  managedPatchrightBrowsersPath,
  writeLocalRuntimeConfig,
  refreshDependencyArtifacts,
  inspectDependencyReport,
  configuredString,
  isDirectoryPath,
  resolvedHomeDir,
  dreaminaCommandEnv,
  downloadFileWithElectronNet
});

function loadTemplateCatalog() {
  const config = readJsonSafe(templateConfigPath) || {};
  const templates = config.templates || {};
  const entries = Object.entries(templates).map(([id, template]) => ({
    id,
    name: template?.name || id,
    description: template?.description || "",
    layoutFocus: template?.layout_focus || "",
    promptStyle: template?.prompt_style || "",
    visualModifiers: Array.isArray(template?.visual_modifiers) ? template.visual_modifiers : [],
    previewImagePath: (() => {
      const fileName = TEMPLATE_PREVIEW_FILES[id];
      if (!fileName) return null;
      const targetPath = path.join(templatePreviewDir, fileName);
      return fs.existsSync(targetPath) ? targetPath : null;
    })()
  }));
  return {
    defaultTemplateId: config.default_template || DEFAULT_TEMPLATE_IDS[0],
    legacyTemplateAliases: config.legacy_template_aliases || {},
    templates: entries
  };
}

function fallbackTemplateIds(catalog) {
  const catalogIds = (catalog?.templates || []).map((item) => item.id);
  const source = catalogIds.length ? catalogIds : DEFAULT_TEMPLATE_IDS;
  const unique = [];
  source.forEach((id) => {
    if (id && !unique.includes(id)) unique.push(id);
  });
  while (unique.length < 3) {
    const fallback = DEFAULT_TEMPLATE_IDS[unique.length] || DEFAULT_TEMPLATE_IDS[0];
    if (!unique.includes(fallback)) unique.push(fallback);
    else unique.push(`${fallback}-${unique.length + 1}`);
  }
  return unique.slice(0, 3);
}

function normalizeTemplateSelection(selection, catalog) {
  const fallbackIds = fallbackTemplateIds(catalog);
  const aliases = catalog?.legacyTemplateAliases || {};
  const catalogIds = new Set((catalog?.templates || []).map((item) => item.id));
  const rawSlots = Array.isArray(selection?.selectedTemplates)
    ? selection.selectedTemplates
    : selection?.templateId
      ? [{ slot: 1, templateId: selection.templateId }]
      : [];
  const next = [];
  const used = new Set();

  for (let slot = 1; slot <= 3; slot += 1) {
    const matched = rawSlots.find((item) => Number(item?.slot) === slot);
    let templateId = aliases[matched?.templateId] || matched?.templateId;
    if (!catalogIds.has(templateId) || used.has(templateId)) {
      templateId = fallbackIds.find((id) => catalogIds.has(id) && !used.has(id)) || fallbackIds[slot - 1];
    }
    used.add(templateId);
    next.push({ slot, templateId });
  }

  return {
    date: selection?.date || formatDate(),
    selectedTemplates: next,
    updatedAt: selection?.updatedAt || null
  };
}

function defaultTemplateResultItem(selectionItem, catalog) {
  const templateMeta = (catalog?.templates || []).find((item) => item.id === selectionItem.templateId) || {};
  return {
    slot: selectionItem.slot,
    templateId: selectionItem.templateId,
    templateName: templateMeta.name || selectionItem.templateId,
    templateDescription: templateMeta.description || "",
    status: "idle",
    imagePath: null,
    generatedAt: null,
    submitId: null,
    promptPath: null,
    error: null
  };
}

function normalizeTemplateGallery(gallery, selection, catalog, prompt, execution) {
  const existingItems = Array.isArray(gallery?.items) ? gallery.items : [];
  const normalizedItems = selection.selectedTemplates.map((item) => {
    const existing = existingItems.find((entry) => Number(entry?.slot) === item.slot);
    const base = defaultTemplateResultItem(item, catalog);
    return {
      ...base,
      ...(existing || {}),
      slot: item.slot,
      templateId: item.templateId,
      templateName: base.templateName,
      templateDescription: base.templateDescription
    };
  });

  const promptTemplateId = prompt?.template?.id;
  const imagePathFromExecution = latestImageFromExecution(execution);
  if (imagePathFromExecution && promptTemplateId) {
    const matched = normalizedItems.find((item) => item.templateId === promptTemplateId);
    if (matched && !matched.imagePath) {
      matched.imagePath = imagePathFromExecution;
      matched.generatedAt = execution?.results?.image?.finished_at || execution?.date || null;
      matched.submitId = execution?.results?.image?.submit_id || null;
      matched.promptPath = prompt?.artifacts?.prompt_txt || null;
      matched.status = "completed";
    }
  }

  return {
    date: gallery?.date || selection.date || formatDate(),
    items: normalizedItems,
    updatedAt: gallery?.updatedAt || null
  };
}

function writeTemplateGallery(date, gallery) {
  const targetPath = currentArtifacts(date).templateGallery;
  writeJsonSafe(targetPath, {
    ...gallery,
    date,
    updatedAt: new Date().toISOString()
  });
  return targetPath;
}

function currentArtifacts(date = formatDate()) {
  return {
    activeBrief: path.join(runtimeRoot, "state", "current_active_brief.json"),
    briefTrace: path.join(runtimeRoot, "state", "brief_action_trace.json"),
    bestBrief: path.join(runtimeRoot, "state", "current_best_brief.json"),
    brandPool: path.join(runtimeRoot, "state", "current_brand_pool.json"),
    briefs: path.join(runtimeRoot, "state", "current_briefs.json"),
    hotPool: path.join(runtimeRoot, "state", "news", "current_hot_pool.json"),
    prompt: path.join(runtimeRoot, "state", "current_image_prompt.json"),
    execution: path.join(runtimeRoot, "state", "current_execution_report.json"),
    upstreamRouter: path.join(runtimeRoot, "state", "current_upstream_router.json"),
    briefDraft: path.join(runtimeRoot, "state", "current_brief_draft.json"),
    templateSelection: path.join(runtimeRoot, "state", "current_template_selection.json"),
    templateGallery: path.join(runtimeRoot, "state", "current_template_gallery.json"),
    desktopAutomation: path.join(runtimeRoot, "state", "current_desktop_automation.json"),
    environmentReport: path.join(runtimeRoot, "state", "current_environment_report.json"),
    dependencyReport: path.join(runtimeRoot, "state", "current_dependency_report.json"),
    dependencyInstallState: path.join(runtimeRoot, "state", "current_dependency_install_state.json"),
    executionMarkdown: path.join(runtimeRoot, "outputs", "execution", `${date}.md`),
    briefMarkdown: path.join(runtimeRoot, "outputs", "briefs", `${date}.md`),
    imagePromptMarkdown: path.join(runtimeRoot, "outputs", "image_prompts", `${date}.md`)
  };
}

function defaultDependencyInstallState() {
  return {
    updatedAt: null,
    items: {}
  };
}

function readDependencyInstallState() {
  const payload = readJsonSafe(currentArtifacts().dependencyInstallState);
  return {
    ...defaultDependencyInstallState(),
    ...(payload || {}),
    items: {
      ...(payload?.items || {})
    }
  };
}

function patchDependencyInstallState(mutator) {
  const next = readDependencyInstallState();
  mutator(next);
  next.updatedAt = new Date().toISOString();
  writeJsonSafe(currentArtifacts().dependencyInstallState, next);
  return next;
}

function updateDependencyInstallRecord(id, patch = {}) {
  return patchDependencyInstallState((state) => {
    state.items[id] = {
      ...(state.items[id] || {}),
      id,
      ...patch
    };
  });
}

function writeBriefActionTrace(date, payload = {}) {
  writeJsonSafe(currentArtifacts(date).briefTrace, {
    date,
    updatedAt: new Date().toISOString(),
    ...payload
  });
}

function cloneJson(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function createActiveBriefState(date, brief, source = "best_winner") {
  return {
    date,
    source,
    briefId: brief?.brief_id || null,
    topicName: brief?.topic_name || null,
    brief: cloneJson(brief),
    updatedAt: new Date().toISOString()
  };
}

function writeActiveBriefState(date, brief, source = "best_winner") {
  const payload = createActiveBriefState(date, brief, source);
  writeJsonSafe(currentArtifacts(date).activeBrief, payload);
  return payload;
}

function clearBriefDraft(date = formatDate()) {
  removeFileSafe(currentArtifacts(date).briefDraft);
}

function applyDraftToBrief(brief, draft) {
  const next = cloneJson(brief) || {};
  next.copy_outline = {
    ...(next.copy_outline || {})
  };

  const coreAngle = normalizeTextBlock(draft?.coreAngle || "");
  if (coreAngle) {
    next.core_angle = coreAngle;
  }

  const blocks = splitOutlineBlocks(draft?.outlineText || "");
  const [hook, paragraph1, paragraph2, paragraph3] = blocks;
  if (hook) {
    next.hook = hook;
    next.copy_outline.hook = hook;
  }
  if (paragraph1) next.copy_outline.paragraph_1 = paragraph1;
  if (paragraph2) next.copy_outline.paragraph_2 = paragraph2;
  if (paragraph3) next.copy_outline.paragraph_3 = paragraph3;

  return next;
}

function resolveBriefById(date, briefId) {
  if (!briefId) return null;
  const briefsPayload = readJsonSafe(currentArtifacts(date).briefs);
  const items = Array.isArray(briefsPayload?.items) ? briefsPayload.items : [];
  return items.find((item) => item?.brief_id === briefId) || null;
}

function readResolvedActiveBrief(date = formatDate()) {
  const artifacts = currentArtifacts(date);
  const bestPayload = readJsonSafe(artifacts.bestBrief);
  const bestBrief = bestPayload?.winner?.brief || null;
  const briefsPayload = readJsonSafe(artifacts.briefs);
  const candidateBriefIds = new Set(
    (Array.isArray(briefsPayload?.items) ? briefsPayload.items : [])
      .map((item) => item?.brief_id)
      .filter(Boolean)
  );
  const activePayload = readJsonSafe(artifacts.activeBrief);
  const activeBrief = activePayload?.brief;
  const activeDateMatches = activePayload?.date === date;
  const activeBriefId = activeBrief?.brief_id;
  const activeIsValid =
    activeDateMatches &&
    activeBriefId &&
    (candidateBriefIds.has(activeBriefId) || activeBriefId === bestBrief?.brief_id);

  if (activeIsValid) {
    return activePayload;
  }
  if (bestBrief) {
    return writeActiveBriefState(date, bestBrief, "best_winner");
  }
  return null;
}

function syncActiveBriefFromBest(date = formatDate(), { clearDraft = false } = {}) {
  const bestPayload = readJsonSafe(currentArtifacts(date).bestBrief);
  const bestBrief = bestPayload?.winner?.brief || null;
  if (!bestBrief) return null;
  if (clearDraft) clearBriefDraft(date);
  return writeActiveBriefState(date, bestBrief, "best_winner");
}

function setActiveBriefFromCandidate(date, briefId) {
  const brief = resolveBriefById(date, briefId);
  if (!brief) return null;
  clearBriefDraft(date);
  return writeActiveBriefState(date, brief, "manual_selection");
}

function saveDraftAndActivateBrief(date, draftPayload) {
  const artifacts = currentArtifacts(date);
  const targetBriefId = draftPayload?.briefId;
  const baseBrief =
    resolveBriefById(date, targetBriefId) ||
    readResolvedActiveBrief(date)?.brief ||
    readJsonSafe(artifacts.bestBrief)?.winner?.brief ||
    null;
  if (!baseBrief) {
    return { ok: false, error: "当前没有可编辑的 brief。" };
  }

  const nextDraft = {
    date,
    briefId: targetBriefId || baseBrief?.brief_id || null,
    topicName: draftPayload?.topicName || baseBrief?.topic_name || null,
    coreAngle: draftPayload?.coreAngle || "",
    outlineText: draftPayload?.outlineText || "",
    updatedAt: new Date().toISOString()
  };
  writeJsonSafe(artifacts.briefDraft, nextDraft);
  const mergedBrief = applyDraftToBrief(baseBrief, nextDraft);
  const activeBrief = writeActiveBriefState(date, mergedBrief, "manual_edit");
  return { ok: true, draft: nextDraft, activeBrief };
}

function invalidateTemplateGallery(date = formatDate(), reason = "上游或 brief 已更新，需要重新生成 3 张图片。") {
  const artifacts = currentArtifacts(date);
  const catalog = loadTemplateCatalog();
  const selection = normalizeTemplateSelection(readJsonSafe(artifacts.templateSelection), catalog);
  const current = normalizeTemplateGallery(readJsonSafe(artifacts.templateGallery), selection, catalog, null, null);
  const next = {
    ...current,
    date,
    invalidatedAt: new Date().toISOString(),
    invalidationReason: reason,
    items: current.items.map((item) => ({
      ...item,
      status: "stale",
      imagePath: null,
      generatedAt: null,
      submitId: null,
      promptPath: null,
      error: reason
    }))
  };
  writeTemplateGallery(date, next);
  return next;
}

function latestImageFromExecution(executionReport) {
  const imageResult = executionReport?.results?.image;
  if (imageResult?.download_paths?.length) {
    return imageResult.download_paths[0];
  }
  const xhsPlan = executionReport?.results?.xiaohongshu;
  if (xhsPlan?.latest_image) {
    return xhsPlan.latest_image;
  }
  return null;
}

function collectPublishImages(templateGallery) {
  const items = Array.isArray(templateGallery?.items) ? templateGallery.items : [];
  const normalized = [];
  items
    .slice()
    .sort((left, right) => Number(left?.slot || 999) - Number(right?.slot || 999))
    .forEach((item) => {
      const imagePath = String(item?.imagePath || "").trim();
      if (!imagePath || item?.status !== "completed") return;
      if (normalized.includes(imagePath)) return;
      normalized.push(imagePath);
    });
  return normalized.slice(0, 3);
}

function normalizeDesktopAutomationSettings(payload = {}) {
  const enabled = Boolean(payload?.enabled);
  const dailyTime = normalizeDailyTime(payload?.dailyTime || "09:00");
  const nextRunAt = enabled ? (payload?.nextRunAt || computeNextRunAt(dailyTime)) : null;
  return {
    enabled,
    dailyTime,
    templateMode: "selected-3-current",
    nextRunAt,
    lastRunAt: payload?.lastRunAt || null,
    lastRunStatus: payload?.lastRunStatus || "idle",
    lastResultSummary: payload?.lastResultSummary || "尚未执行",
    lastError: payload?.lastError || null,
    lastTrigger: payload?.lastTrigger || null,
    updatedAt: payload?.updatedAt || null
  };
}

function readDesktopAutomationSettings() {
  return normalizeDesktopAutomationSettings(readJsonSafe(currentArtifacts().desktopAutomation) || {});
}

function writeDesktopAutomationSettings(payload = {}) {
  const next = normalizeDesktopAutomationSettings({
    ...readDesktopAutomationSettings(),
    ...payload,
    updatedAt: new Date().toISOString()
  });
  writeJsonSafe(currentArtifacts().desktopAutomation, next);
  return next;
}

function buildAutomatedTemplateSelection(date, catalog = loadTemplateCatalog()) {
  const selection = readJsonSafe(currentArtifacts(date).templateSelection);
  return normalizeTemplateSelection(selection, catalog).selectedTemplates;
}

function persistTemplateSelection(date, selectedTemplates) {
  const artifacts = currentArtifacts(date);
  const catalog = loadTemplateCatalog();
  const previousSelection = normalizeTemplateSelection(readJsonSafe(artifacts.templateSelection), catalog);
  const nextSelection = normalizeTemplateSelection({ date, selectedTemplates }, catalog);
  const nextSelectionPayload = {
    ...nextSelection,
    updatedAt: new Date().toISOString()
  };
  const previousGallery = normalizeTemplateGallery(
    readJsonSafe(artifacts.templateGallery),
    previousSelection,
    catalog,
    readJsonSafe(artifacts.prompt),
    readJsonSafe(artifacts.execution)
  );
  const nextGallery = {
    ...previousGallery,
    date,
    items: nextSelection.selectedTemplates.map((slotEntry) => {
      const previousSlot = previousSelection.selectedTemplates.find((item) => item.slot === slotEntry.slot);
      const existing = previousGallery.items.find((item) => item.slot === slotEntry.slot) || defaultTemplateResultItem(slotEntry, catalog);
      if (previousSlot?.templateId === slotEntry.templateId) {
        return {
          ...existing,
          slot: slotEntry.slot,
          templateId: slotEntry.templateId
        };
      }
      return defaultTemplateResultItem(slotEntry, catalog);
    })
  };
  writeJsonSafe(artifacts.templateSelection, nextSelectionPayload);
  writeTemplateGallery(date, nextGallery);
  return { selection: nextSelectionPayload, gallery: nextGallery, path: artifacts.templateSelection };
}

const loadDashboard = createDashboardLoader({
  productStudioRoot,
  runtimeRoot,
  runtimeConfigDir,
  formatDate,
  currentArtifacts,
  readJsonSafe,
  writeJsonSafe,
  readTextSafe,
  readLocalRuntimeConfig,
  summarizeLocalRuntimeConfig,
  inspectDependencyReport,
  loadTemplateCatalog,
  normalizeTemplateSelection,
  normalizeTemplateGallery,
  readResolvedActiveBrief,
  collectPublishImages,
  readDesktopAutomationSettings,
  readPublishAccountsState,
  deriveOnboardingState,
  readDependencyInstallState
});

const { runCli, spawnCliTask } = createCliRunner({
  runtimeBaseDir,
  productStudioRoot,
  spawn,
  readLocalRuntimeConfig,
  resolvePythonBin
});

const {
  rebuildDownstreamAssetsForBrief,
  runDesktopAutomationSequence,
  runWorkflowAction
} = createWorkflowOrchestrator({
  runCli,
  loadDashboard,
  emitWorkflowProgress,
  syncActiveBriefFromBest,
  invalidateTemplateGallery,
  buildAutomatedTemplateSelection,
  persistTemplateSelection,
  writeTemplateGallery,
  readPublishAccountsState,
  readDesktopAutomationSettings,
  writeDesktopAutomationSettings,
  syncDesktopAutomationSchedule,
  loadTemplateCatalog,
  normalizeTemplateSelection,
  normalizeTemplateGallery,
  currentArtifacts,
  readJsonSafe,
  collectPublishImages,
  formatDate,
  formatElapsed,
  getActiveAutomationRun: runtimeState.getActiveAutomationRun,
  setActiveAutomationRun: runtimeState.setActiveAutomationRun,
  getActiveImageTask: runtimeState.getActiveImageTask,
  setActiveImageTask: runtimeState.setActiveImageTask
});

setScheduledAutomationRunner(runDesktopAutomationSequence);

app.whenReady().then(() => {
  registerCoreIpcHandlers({
    ipcMain,
    dialog,
    shell,
    activeWindow,
    configuredString,
    loadDashboard,
    refreshDependencyArtifacts,
    readLocalRuntimeConfig,
    installBundledDependency,
    installExternalDependency,
    dependencyLogPath,
    readDependencyLog,
    runCli,
    runWorkflowAction,
    emitWorkflowProgress,
    formatDate,
    writeJsonSafe,
    currentArtifacts,
    writeLocalRuntimeConfig,
    removeFileSafe,
    localConfigPath
  });
  registerWorkbenchIpcHandlers({
    ipcMain,
    formatDate,
    readPublishAccountsState,
    writeBriefActionTrace,
    saveDraftAndActivateBrief,
    invalidateTemplateGallery,
    rebuildDownstreamAssetsForBrief,
    currentArtifacts,
    setActiveBriefFromCandidate,
    normalizeTemplateSelection,
    readJsonSafe,
    loadTemplateCatalog,
    persistTemplateSelection,
    syncDesktopAutomationSchedule,
    readDesktopAutomationSettings,
    normalizeDailyTime,
    normalizeAccountName,
    patchAccounts,
    runSauAccountCommand
  });

  registerAppLifecycle({ createWindow });
});
