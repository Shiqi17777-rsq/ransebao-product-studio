function trimString(value) {
  return String(value || "").trim();
}

function normalizeComparablePath(targetPath = "") {
  const value = trimString(targetPath);
  if (!value) return "";
  const normalized = value.replace(/[\\/]+/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isManagedRuntimePath(runtimeBaseDir = "", targetPath = "") {
  const base = normalizeComparablePath(runtimeBaseDir);
  const candidate = normalizeComparablePath(targetPath);
  return Boolean(base && candidate && (candidate === base || candidate.startsWith(`${base}/`)));
}

function dependencyActionLabel(id, detected) {
  if (id === "bundleAssets" || id === "bundledPython") {
    return "随安装包内置";
  }
  if (id === "sau") {
    return detected ? "重新安装 sau" : "安装 sau";
  }
  if (id === "patchrightChromium") {
    return detected ? "重新准备 Chromium" : "准备 Chromium";
  }
  if (id === "dreamina") {
    return detected ? "重新安装 Dreamina" : "安装 Dreamina";
  }
  return detected ? "重新检查" : "安装";
}

function dreaminaActionLabel(item = {}) {
  if (!item.detected) return "安装 Dreamina";
  if (item.requiresLogin) return "登录 Dreamina";
  return "重新登录 Dreamina";
}

function dependencyMessage(id, payload = {}) {
  const detected = Boolean(payload.detected);
  const requiresLogin = Boolean(payload.requiresLogin);
  const currentPath = trimString(payload.currentPath || payload.value);
  if (detected && currentPath) {
    if (id === "bundledPython") return `已检测到内置 Python，打包后会优先使用它：${currentPath}`;
    if (id === "bundleAssets") return "安装包内资源完整，打包态会从 Resources/product-studio 启动工作流。";
    if (id === "sau") return `当前可用的发布工具路径：${currentPath}`;
    if (id === "patchrightChromium") return `浏览器运行时已准备完成：${currentPath}`;
    if (id === "dreamina" && requiresLogin) return `Dreamina 已安装到 ${currentPath}，但还需要完成登录授权后才能生成图片。`;
    if (id === "dreamina") return `当前 Dreamina 已可用：${currentPath}`;
  }
  if (id === "bundledPython") return "打包版会内置 Python 运行时，客户机无需额外安装系统 Python。";
  if (id === "bundleAssets") return "程序资源会和安装包一起分发，缺失时说明打包产物不完整。";
  if (id === "sau") return "首次启动会把 social-auto-upload 安装到用户目录里的内部虚拟环境。";
  if (id === "patchrightChromium") return "这一步会准备 sau 需要的浏览器运行时，首次安装需要联网。";
  if (id === "dreamina") return "Dreamina 不随安装包分发，会在客户端里执行官方安装命令。";
  return "请先完成依赖安装。";
}

function installStatusFor(item, installRecord = {}) {
  if (installRecord.status === "installing") return "installing";
  if (item.requiresLogin) return "needs_login";
  if (item.ready ?? item.detected) return "ready";
  if (item.detected) return "failed";
  if (installRecord.lastError || installRecord.status === "failed") return "failed";
  return "missing";
}

function dependencyProgressSnapshot(id, status) {
  if (status === "ready") {
    if (id === "sau") return { progress: 1, progressLabel: "安装完成" };
    if (id === "patchrightChromium") return { progress: 1, progressLabel: "准备完成" };
    return { progress: 1, progressLabel: "已就绪" };
  }
  if (status === "needs_login") {
    return { progress: 0.86, progressLabel: "等待登录授权" };
  }
  return { progress: 0, progressLabel: "" };
}

function reconcileDependencyInstallStateWithReport(report, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  const installItems = report?.installItems || {};
  const currentInstallState = report?.installState || { updatedAt: null, items: {} };
  const nextInstallState = {
    updatedAt: currentInstallState.updatedAt || null,
    items: {
      ...(currentInstallState.items || {})
    }
  };
  let changed = false;

  for (const item of Object.values(installItems)) {
    if (!item?.id) continue;
    const currentRecord = nextInstallState.items[item.id] || {};
    if (currentRecord.status === "installing") continue;
    if (!["ready", "needs_login"].includes(item.status)) continue;

    const progressSnapshot = dependencyProgressSnapshot(item.id, item.status);
    const desiredRecord = {
      ...currentRecord,
      id: item.id,
      status: item.status,
      managedByApp: Boolean(item.managedByApp),
      currentPath: trimString(item.currentPath),
      lastError: "",
      progress: progressSnapshot.progress,
      progressLabel: progressSnapshot.progressLabel,
      indeterminate: false
    };

    if (item.status === "ready") {
      desiredRecord.installedAt = currentRecord.installedAt || nowIso;
    }

    if (JSON.stringify(currentRecord) !== JSON.stringify(desiredRecord)) {
      nextInstallState.items[item.id] = desiredRecord;
      changed = true;
    }
  }

  if (changed) {
    nextInstallState.updatedAt = nowIso;
  }

  const nextReport = {
    ...report,
    installState: nextInstallState,
    installItems: {}
  };

  for (const [id, item] of Object.entries(installItems)) {
    const record = nextInstallState.items?.[id] || {};
    nextReport.installItems[id] = {
      ...item,
      progress: Number.isFinite(record.progress)
        ? Math.max(0, Math.min(1, Number(record.progress)))
        : item.status === "ready"
          ? 1
          : item.status === "needs_login"
            ? 0.86
            : 0,
      progressLabel: trimString(record.progressLabel || record.stepLabel || ""),
      indeterminate: Boolean(record.indeterminate && item.status === "installing")
    };
  }

  return {
    report: nextReport,
    changed,
    installState: nextInstallState
  };
}

module.exports = {
  dependencyActionLabel,
  dependencyMessage,
  dependencyProgressSnapshot,
  dreaminaActionLabel,
  installStatusFor,
  isManagedRuntimePath,
  normalizeComparablePath,
  reconcileDependencyInstallStateWithReport
};
