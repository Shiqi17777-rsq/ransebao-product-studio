function createLifecycleBridge({
  app,
  BrowserWindow,
  normalizeDesktopAutomationSettings,
  readDesktopAutomationSettings,
  writeDesktopAutomationSettings,
  normalizeVideoAutomationSettings,
  readVideoAutomationSettings,
  writeVideoAutomationSettings,
  computeNextRunAt,
  formatDate,
  defaultProduct = "ransebao"
}) {
  let desktopAutomationTimer = null;
  let videoAutomationTimer = null;
  let scheduledAutomationRunner = async () => {};
  let scheduledVideoAutomationRunner = async () => {};

  function setScheduledAutomationRunner(nextRunner) {
    scheduledAutomationRunner = typeof nextRunner === "function" ? nextRunner : async () => {};
  }

  function setScheduledVideoAutomationRunner(nextRunner) {
    scheduledVideoAutomationRunner = typeof nextRunner === "function" ? nextRunner : async () => {};
  }

  function syncAutomationSchedule(options = {}) {
    const {
      timerKey,
      nextState,
      normalizeSettings,
      readSettings,
      writeSettings,
      scheduledRunner
    } = options;

    if (timerKey === "desktop" && desktopAutomationTimer) {
      clearTimeout(desktopAutomationTimer);
      desktopAutomationTimer = null;
    }
    if (timerKey === "video" && videoAutomationTimer) {
      clearTimeout(videoAutomationTimer);
      videoAutomationTimer = null;
    }

    const settings = normalizeSettings(nextState || readSettings());
    if (!settings.enabled) {
      writeSettings({ ...settings, nextRunAt: null });
      return settings;
    }

    const scheduledState = writeSettings({
      ...settings,
      nextRunAt: computeNextRunAt(settings.dailyTime)
    });
    const delay = Math.max(1000, new Date(scheduledState.nextRunAt).getTime() - Date.now());
    const timer = setTimeout(async () => {
      try {
        await scheduledRunner({
          product: defaultProduct,
          date: formatDate(),
          trigger: "scheduled"
        });
      } finally {
        if (timerKey === "desktop") {
          syncDesktopAutomationSchedule(readDesktopAutomationSettings());
        } else {
          syncVideoAutomationSchedule(readVideoAutomationSettings());
        }
      }
    }, delay);
    if (timerKey === "desktop") {
      desktopAutomationTimer = timer;
    } else {
      videoAutomationTimer = timer;
    }
    return scheduledState;
  }

  function syncDesktopAutomationSchedule(nextState = null) {
    return syncAutomationSchedule({
      timerKey: "desktop",
      nextState,
      normalizeSettings: normalizeDesktopAutomationSettings,
      readSettings: readDesktopAutomationSettings,
      writeSettings: writeDesktopAutomationSettings,
      scheduledRunner: scheduledAutomationRunner
    });
  }

  function syncVideoAutomationSchedule(nextState = null) {
    return syncAutomationSchedule({
      timerKey: "video",
      nextState,
      normalizeSettings: normalizeVideoAutomationSettings,
      readSettings: readVideoAutomationSettings,
      writeSettings: writeVideoAutomationSettings,
      scheduledRunner: scheduledVideoAutomationRunner
    });
  }

  function registerAppLifecycle({ createWindow }) {
    createWindow();
    syncDesktopAutomationSchedule(readDesktopAutomationSettings());
    syncVideoAutomationSchedule(readVideoAutomationSettings());

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });
  }

  return {
    setScheduledAutomationRunner,
    setScheduledVideoAutomationRunner,
    syncDesktopAutomationSchedule,
    syncVideoAutomationSchedule,
    registerAppLifecycle
  };
}

module.exports = {
  createLifecycleBridge
};
