function createLifecycleBridge({
  app,
  BrowserWindow,
  normalizeDesktopAutomationSettings,
  readDesktopAutomationSettings,
  writeDesktopAutomationSettings,
  computeNextRunAt,
  formatDate,
  defaultProduct = "ransebao"
}) {
  let automationTimer = null;
  let scheduledAutomationRunner = async () => {};

  function setScheduledAutomationRunner(nextRunner) {
    scheduledAutomationRunner = typeof nextRunner === "function" ? nextRunner : async () => {};
  }

  function syncDesktopAutomationSchedule(nextState = null) {
    if (automationTimer) {
      clearTimeout(automationTimer);
      automationTimer = null;
    }
    const settings = normalizeDesktopAutomationSettings(nextState || readDesktopAutomationSettings());
    if (!settings.enabled) {
      writeDesktopAutomationSettings({ ...settings, nextRunAt: null });
      return settings;
    }

    const scheduledState = writeDesktopAutomationSettings({
      ...settings,
      nextRunAt: computeNextRunAt(settings.dailyTime)
    });
    const delay = Math.max(1000, new Date(scheduledState.nextRunAt).getTime() - Date.now());
    automationTimer = setTimeout(async () => {
      await scheduledAutomationRunner({
        product: defaultProduct,
        date: formatDate(),
        trigger: "scheduled"
      });
    }, delay);
    return scheduledState;
  }

  function registerAppLifecycle({ createWindow }) {
    createWindow();
    syncDesktopAutomationSchedule(readDesktopAutomationSettings());

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });
  }

  return {
    setScheduledAutomationRunner,
    syncDesktopAutomationSchedule,
    registerAppLifecycle
  };
}

module.exports = {
  createLifecycleBridge
};
