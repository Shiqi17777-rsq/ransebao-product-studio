function createWindowBridge({
  BrowserWindow,
  path,
  desktopAppRoot,
  eventChannels,
  buildWorkflowProgressEvent,
  buildDependencyProgressEvent
}) {
  let mainWindow = null;

  function activeWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
    return BrowserWindow.getAllWindows().find((win) => !win.isDestroyed()) || null;
  }

  function emitWorkflowProgress(payload) {
    const win = activeWindow();
    if (!win) return;
    win.webContents.send(
      eventChannels.workflowProgress,
      buildWorkflowProgressEvent(payload)
    );
  }

  function emitDependencyProgress(id, payload = {}) {
    const win = activeWindow();
    if (!win) return;
    win.webContents.send(
      eventChannels.dependencyProgress,
      buildDependencyProgressEvent(id, payload)
    );
  }

  function createWindow() {
    const isMac = process.platform === "darwin";
    const win = new BrowserWindow({
      width: 1460,
      height: 960,
      minWidth: 1280,
      minHeight: 840,
      title: "染色宝 Product Studio",
      titleBarStyle: "hiddenInset",
      backgroundColor: isMac ? "#00000000" : "#eef2f6",
      transparent: isMac,
      vibrancy: isMac ? "under-window" : undefined,
      visualEffectState: isMac ? "active" : undefined,
      webPreferences: {
        preload: path.join(desktopAppRoot, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    win.loadFile(path.join(desktopAppRoot, "src", "index.html"));
    mainWindow = win;
    win.on("closed", () => {
      if (mainWindow === win) mainWindow = null;
    });
    return win;
  }

  return {
    activeWindow,
    emitWorkflowProgress,
    emitDependencyProgress,
    createWindow
  };
}

module.exports = {
  createWindowBridge
};
