const IPC_CHANNELS = {
  dashboardLoad: "dashboard:load",
  accountsLoad: "accounts:load",
  cliRun: "cli:run",
  workflowRunAction: "workflow:runAction",
  dependenciesInspect: "dependencies:inspect",
  dependenciesInspectBundled: "dependencies:inspectBundled",
  dependenciesInstallBundled: "dependencies:installBundled",
  dependenciesInstallExternal: "dependencies:installExternal",
  dependenciesLog: "dependencies:log",
  dialogPickPath: "dialog:pickPath",
  environmentCheck: "environment:check",
  localConfigSave: "local-config:save",
  accountsLogin: "accounts:login",
  accountsCheck: "accounts:check",
  accountsToggle: "accounts:toggle",
  accountsRemove: "accounts:remove",
  briefSaveDraft: "brief:saveDraft",
  briefSelect: "brief:select",
  templateSaveSelection: "template:saveSelection",
  imageTemplateImport: "image-template:import",
  videoTemplateImport: "video-template:import",
  automationSaveSettings: "automation:saveSettings",
  shellOpenPath: "shell:openPath"
};

const EVENT_CHANNELS = {
  workflowProgress: "workflow:progress",
  dependencyProgress: "dependency:progress"
};

function buildWorkflowProgressEvent(payload = {}) {
  return {
    updatedAt: new Date().toISOString(),
    ...payload
  };
}

function buildDependencyProgressEvent(id, payload = {}) {
  return {
    id,
    updatedAt: new Date().toISOString(),
    ...payload
  };
}

module.exports = {
  IPC_CHANNELS,
  EVENT_CHANNELS,
  buildWorkflowProgressEvent,
  buildDependencyProgressEvent
};
