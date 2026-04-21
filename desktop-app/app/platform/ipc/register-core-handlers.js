const { IPC_CHANNELS } = require("../../contracts/event-channels");

function registerCoreIpcHandlers(deps) {
  const {
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
  } = deps;

  ipcMain.handle(IPC_CHANNELS.dashboardLoad, async () => loadDashboard());

  ipcMain.handle(IPC_CHANNELS.dependenciesInspect, async () => {
    return refreshDependencyArtifacts(readLocalRuntimeConfig());
  });

  ipcMain.handle(IPC_CHANNELS.dependenciesInspectBundled, async () => {
    return refreshDependencyArtifacts(readLocalRuntimeConfig());
  });

  ipcMain.handle(IPC_CHANNELS.dependenciesInstallBundled, async (_event, payload = {}) => {
    const result = await installBundledDependency(String(payload?.id || ""));
    return {
      ...result,
      dependencyReport: result.dependencyReport || (await refreshDependencyArtifacts(readLocalRuntimeConfig()))
    };
  });

  ipcMain.handle(IPC_CHANNELS.dependenciesInstallExternal, async (_event, payload = {}) => {
    const result = await installExternalDependency(String(payload?.id || ""));
    return {
      ...result,
      dependencyReport: result.dependencyReport || (await refreshDependencyArtifacts(readLocalRuntimeConfig()))
    };
  });

  ipcMain.handle(IPC_CHANNELS.dependenciesLog, async (_event, payload = {}) => {
    const id = String(payload?.id || "");
    return {
      id,
      logPath: dependencyLogPath(id),
      text: readDependencyLog(id)
    };
  });

  ipcMain.handle(IPC_CHANNELS.dialogPickPath, async (_event, payload = {}) => {
    const type = String(payload?.type || "directory");
    const title = String(payload?.title || "选择路径");
    const defaultPath = configuredString(payload?.defaultPath);
    const filters = Array.isArray(payload?.filters)
      ? payload.filters
          .map((filter) => ({
            name: String(filter?.name || "Files"),
            extensions: Array.isArray(filter?.extensions)
              ? filter.extensions.map((extension) => String(extension).replace(/^\./, "")).filter(Boolean)
              : []
          }))
          .filter((filter) => filter.extensions.length)
      : undefined;
    const options = {
      title,
      defaultPath: defaultPath || undefined,
      properties: type === "file" ? ["openFile"] : ["openDirectory", "createDirectory"],
      filters
    };
    const result = await dialog.showOpenDialog(activeWindow() || undefined, options);
    if (result.canceled || !result.filePaths?.length) {
      return { canceled: true, path: "" };
    }
    return {
      canceled: false,
      path: result.filePaths[0]
    };
  });

  ipcMain.handle(IPC_CHANNELS.cliRun, async (_event, payload) => runCli(payload.command, payload));
  ipcMain.handle(IPC_CHANNELS.workflowRunAction, async (_event, payload) => runWorkflowAction(payload.action, payload));

  ipcMain.handle(IPC_CHANNELS.environmentCheck, async () => {
    emitWorkflowProgress({
      action: "check-environment",
      state: "running",
      title: "正在检查环境",
      detail: "读取产品配置与执行条件。",
      progress: 0.18,
      currentStep: 1,
      totalSteps: 2,
      stepLabel: "检查产品配置"
    });
    const inspect = await runCli("inspect", { product: "ransebao" });
    emitWorkflowProgress({
      action: "check-environment",
      state: "running",
      title: "正在检查环境",
      detail: "验证图片和发布适配器是否就绪。",
      progress: 0.58,
      currentStep: 2,
      totalSteps: 2,
      stepLabel: "检查执行条件"
    });
    const plan = await runCli("plan-execution", { product: "ransebao", date: formatDate() });
    emitWorkflowProgress({
      action: "check-environment",
      state: inspect.ok && plan.ok ? "success" : "error",
      title: inspect.ok && plan.ok ? "环境检查已完成" : "环境检查失败",
      detail: inspect.ok && plan.ok ? "当前本机执行条件已刷新。" : "请检查环境日志。",
      progress: inspect.ok && plan.ok ? 1 : 0.92,
      currentStep: 2,
      totalSteps: 2,
      stepLabel: inspect.ok && plan.ok ? "已完成" : "检查失败"
    });
    const report = {
      inspect: inspect.parsed,
      plan: plan.parsed,
      checkedAt: new Date().toISOString(),
      raw: {
        inspect,
        plan
      }
    };
    writeJsonSafe(currentArtifacts().environmentReport, report);
    return report;
  });

  ipcMain.handle(IPC_CHANNELS.localConfigSave, async (_event, payload) => {
    const localConfig = writeLocalRuntimeConfig(payload || {});
    removeFileSafe(currentArtifacts().environmentReport);
    const dependencyReport = await refreshDependencyArtifacts(readLocalRuntimeConfig());
    return {
      ok: true,
      path: localConfigPath,
      localConfig,
      dependencyReport
    };
  });

  ipcMain.handle(IPC_CHANNELS.shellOpenPath, async (_event, targetPath) => shell.openPath(targetPath));
}

module.exports = {
  registerCoreIpcHandlers
};
