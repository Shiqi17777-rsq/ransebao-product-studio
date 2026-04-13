const { contextBridge, ipcRenderer } = require("electron");
const { IPC_CHANNELS, EVENT_CHANNELS } = require("./app/contracts/event-channels");

contextBridge.exposeInMainWorld("desktopApp", {
  loadDashboard: () => ipcRenderer.invoke(IPC_CHANNELS.dashboardLoad),
  loadAccounts: () => ipcRenderer.invoke(IPC_CHANNELS.accountsLoad),
  runCli: (payload) => ipcRenderer.invoke(IPC_CHANNELS.cliRun, payload),
  runWorkflowAction: (payload) => ipcRenderer.invoke(IPC_CHANNELS.workflowRunAction, payload),
  inspectDependencies: () => ipcRenderer.invoke(IPC_CHANNELS.dependenciesInspect),
  inspectBundledDependencies: () => ipcRenderer.invoke(IPC_CHANNELS.dependenciesInspectBundled),
  installBundledDependency: (payload) => ipcRenderer.invoke(IPC_CHANNELS.dependenciesInstallBundled, payload),
  installExternalDependency: (payload) => ipcRenderer.invoke(IPC_CHANNELS.dependenciesInstallExternal, payload),
  getDependencyInstallLogs: (payload) => ipcRenderer.invoke(IPC_CHANNELS.dependenciesLog, payload),
  refreshDependencyReport: () => ipcRenderer.invoke(IPC_CHANNELS.dependenciesInspectBundled),
  pickPath: (payload) => ipcRenderer.invoke(IPC_CHANNELS.dialogPickPath, payload),
  checkEnvironment: () => ipcRenderer.invoke(IPC_CHANNELS.environmentCheck),
  saveLocalConfig: (payload) => ipcRenderer.invoke(IPC_CHANNELS.localConfigSave, payload),
  loginAccount: (payload) => ipcRenderer.invoke(IPC_CHANNELS.accountsLogin, payload),
  checkAccount: (payload) => ipcRenderer.invoke(IPC_CHANNELS.accountsCheck, payload),
  toggleAccountEnabled: (payload) => ipcRenderer.invoke(IPC_CHANNELS.accountsToggle, payload),
  removeAccount: (payload) => ipcRenderer.invoke(IPC_CHANNELS.accountsRemove, payload),
  saveBriefDraft: (payload) => ipcRenderer.invoke(IPC_CHANNELS.briefSaveDraft, payload),
  selectBrief: (payload) => ipcRenderer.invoke(IPC_CHANNELS.briefSelect, payload),
  saveTemplateSelection: (payload) => ipcRenderer.invoke(IPC_CHANNELS.templateSaveSelection, payload),
  saveAutomationSettings: (payload) => ipcRenderer.invoke(IPC_CHANNELS.automationSaveSettings, payload),
  openPath: (targetPath) => ipcRenderer.invoke(IPC_CHANNELS.shellOpenPath, targetPath),
  onWorkflowProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(EVENT_CHANNELS.workflowProgress, listener);
    return () => ipcRenderer.removeListener(EVENT_CHANNELS.workflowProgress, listener);
  },
  onDependencyProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(EVENT_CHANNELS.dependencyProgress, listener);
    return () => ipcRenderer.removeListener(EVENT_CHANNELS.dependencyProgress, listener);
  }
});
