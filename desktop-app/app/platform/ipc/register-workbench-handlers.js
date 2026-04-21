const { IPC_CHANNELS } = require("../../contracts/event-channels");

function buildAccountRecord(platform, payload = {}, existing = null) {
  const accountName = payload.normalizeAccountName(payload.accountName || existing?.accountName || "");
  const displayName = String(payload.displayName || existing?.displayName || accountName).trim() || accountName;
  return {
    id: String(existing?.id || `${platform}:${accountName}`),
    platform,
    accountName,
    displayName,
    enabled: existing?.enabled ?? true,
    status: String(existing?.status || "unknown"),
    lastCheckedAt: existing?.lastCheckedAt || null,
    lastLoginAt: existing?.lastLoginAt || null,
    sourceType: "sau_account",
    sourceValue: accountName,
    legacyHint: false
  };
}

function upsertAccount(platform, nextRecord, { replaceId = null } = {}, patchAccounts) {
  return patchAccounts((accounts) => {
    const currentItems = Array.isArray(accounts[platform]) ? accounts[platform] : [];
    const filtered = currentItems.filter((item) => {
      if (replaceId && item.id === replaceId) return false;
      return item.accountName !== nextRecord.accountName;
    });
    filtered.push(nextRecord);
    accounts[platform] = filtered;
  });
}

function registerWorkbenchIpcHandlers(deps) {
  const {
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
    importImageTemplate,
    importVideoTemplate,
    persistTemplateSelection,
    syncDesktopAutomationSchedule,
    readDesktopAutomationSettings,
    syncVideoAutomationSchedule,
    readVideoAutomationSettings,
    normalizeDailyTime,
    normalizeAccountName,
    patchAccounts,
    runSauAccountCommand
  } = deps;

  ipcMain.handle(IPC_CHANNELS.accountsLoad, async () => readPublishAccountsState());

  ipcMain.handle(IPC_CHANNELS.briefSaveDraft, async (_event, payload) => {
    const date = payload?.date || formatDate();
    writeBriefActionTrace(date, {
      action: "saveDraft:received",
      briefId: payload?.briefId || null,
      topicName: payload?.topicName || null
    });
    const saved = saveDraftAndActivateBrief(date, payload);
    if (!saved.ok) {
      writeBriefActionTrace(date, {
        action: "saveDraft:failed",
        error: saved.error || "unknown"
      });
      return saved;
    }
    const gallery = invalidateTemplateGallery(date, "brief 已修改，需要重新生成 3 张图片。");
    const downstream = await rebuildDownstreamAssetsForBrief(date, "ransebao");
    writeBriefActionTrace(date, {
      action: "saveDraft:completed",
      briefId: saved.activeBrief?.briefId || saved.activeBrief?.brief?.brief_id || null,
      downstreamOk: downstream.ok
    });
    return {
      ok: saved.ok && downstream.ok,
      path: currentArtifacts(date).briefDraft,
      draft: saved.draft,
      activeBrief: saved.activeBrief,
      gallery,
      downstream
    };
  });

  ipcMain.handle(IPC_CHANNELS.briefSelect, async (_event, payload) => {
    const date = payload?.date || formatDate();
    const briefId = String(payload?.briefId || "");
    writeBriefActionTrace(date, {
      action: "selectBrief:received",
      briefId
    });
    const activeBrief = setActiveBriefFromCandidate(date, briefId);
    if (!activeBrief) {
      writeBriefActionTrace(date, {
        action: "selectBrief:not-found",
        briefId
      });
      return { ok: false, error: "未找到要切换的候选 brief。" };
    }
    const gallery = invalidateTemplateGallery(date, "已切换新的 brief，需要重新生成 3 张图片。");
    const downstream = await rebuildDownstreamAssetsForBrief(date, "ransebao");
    writeBriefActionTrace(date, {
      action: "selectBrief:completed",
      briefId: activeBrief?.briefId || activeBrief?.brief?.brief_id || briefId,
      topicName: activeBrief?.topicName || activeBrief?.brief?.topic_name || null,
      downstreamOk: downstream.ok
    });
    return {
      ok: downstream.ok,
      activeBrief,
      gallery,
      downstream
    };
  });

  ipcMain.handle(IPC_CHANNELS.templateSaveSelection, async (_event, payload) => {
    const date = payload?.date || formatDate();
    const existing = normalizeTemplateSelection(readJsonSafe(currentArtifacts(date).templateSelection), loadTemplateCatalog());
    const result = persistTemplateSelection(
      date,
      Array.isArray(payload?.selectedTemplates) ? payload.selectedTemplates : existing.selectedTemplates
    );
    return { ok: true, path: result.path, selection: result.selection, gallery: result.gallery };
  });

  ipcMain.handle(IPC_CHANNELS.imageTemplateImport, async (_event, payload) => {
    if (typeof importImageTemplate !== "function") {
      return { ok: false, error: "Image template import is not available." };
    }
    return importImageTemplate(payload || {});
  });

  ipcMain.handle(IPC_CHANNELS.videoTemplateImport, async (_event, payload) => {
    if (typeof importVideoTemplate !== "function") {
      return { ok: false, error: "Video template import is not available." };
    }
    return importVideoTemplate(payload || {});
  });

  ipcMain.handle(IPC_CHANNELS.automationSaveSettings, async (_event, payload) => {
    const kind = payload?.kind === "video" ? "video" : "desktop";
    const readSettings = kind === "video" ? readVideoAutomationSettings : readDesktopAutomationSettings;
    const syncSettings = kind === "video" ? syncVideoAutomationSchedule : syncDesktopAutomationSchedule;
    const currentSettings = readSettings();
    const nextState = syncSettings({
      ...currentSettings,
      enabled: Boolean(payload?.enabled),
      dailyTime: normalizeDailyTime(
        payload?.dailyTime || (kind === "video" ? "09:30" : "09:00")
      ),
      lastResultSummary: currentSettings.lastResultSummary,
      lastRunAt: currentSettings.lastRunAt,
      lastRunStatus: currentSettings.lastRunStatus,
      lastError: currentSettings.lastError,
      lastTrigger: currentSettings.lastTrigger
    });
    return {
      ok: true,
      kind,
      state: nextState,
      path: kind === "video" ? currentArtifacts().videoAutomation : currentArtifacts().desktopAutomation
    };
  });

  ipcMain.handle(IPC_CHANNELS.accountsLogin, async (_event, payload) => {
    const platform = payload?.platform;
    if (!["xiaohongshu", "douyin"].includes(platform)) {
      return { ok: false, error: "Unsupported platform." };
    }
    const accountName = normalizeAccountName(payload?.accountName || "");
    const displayName = String(payload?.displayName || "").trim() || accountName;
    if (!accountName) {
      return { ok: false, error: "账号名不能为空。" };
    }

    const accountsState = readPublishAccountsState();
    const currentItems = accountsState.accounts[platform] || [];
    const existing = currentItems.find(
      (item) => item.id === payload?.accountId || item.accountName === accountName
    );
    if (!existing && currentItems.some((item) => item.accountName === accountName)) {
      return { ok: false, error: "同平台内账号名不能重复。" };
    }

    const runningRecord = buildAccountRecord(
      platform,
      { accountName, displayName, normalizeAccountName },
      existing || null
    );
    runningRecord.status = "logging_in";
    if (existing) {
      upsertAccount(platform, runningRecord, { replaceId: existing.id }, patchAccounts);
    }

    const commandResult = await runSauAccountCommand(platform, "login", accountName, { headed: true });
    if (!commandResult.ok) {
      if (existing) {
        const failedRecord = {
          ...runningRecord,
          status: "failed"
        };
        upsertAccount(platform, failedRecord, { replaceId: existing.id }, patchAccounts);
      }
      return {
        ok: false,
        error: commandResult.stderr || commandResult.stdout || "登录失败。",
        result: commandResult,
        accounts: readPublishAccountsState()
      };
    }

    const nextRecord = {
      ...runningRecord,
      status: "ready",
      enabled: true,
      lastLoginAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString()
    };
    const saved = upsertAccount(platform, nextRecord, { replaceId: existing?.id || null }, patchAccounts);
    return {
      ok: true,
      account: nextRecord,
      accounts: saved,
      result: commandResult
    };
  });

  ipcMain.handle(IPC_CHANNELS.accountsCheck, async (_event, payload) => {
    const accountId = String(payload?.accountId || "");
    const accountsState = readPublishAccountsState();
    const allAccounts = [...accountsState.accounts.xiaohongshu, ...accountsState.accounts.douyin];
    const target = allAccounts.find((item) => item.id === accountId);
    if (!target) {
      return { ok: false, error: "账号不存在。" };
    }
    const commandResult = await runSauAccountCommand(target.platform, "check", target.accountName);
    const nextRecord = {
      ...target,
      status: commandResult.ok ? "ready" : "failed",
      lastCheckedAt: new Date().toISOString()
    };
    const saved = upsertAccount(target.platform, nextRecord, { replaceId: target.id }, patchAccounts);
    return {
      ok: commandResult.ok,
      account: nextRecord,
      accounts: saved,
      result: commandResult
    };
  });

  ipcMain.handle(IPC_CHANNELS.accountsToggle, async (_event, payload) => {
    const accountId = String(payload?.accountId || "");
    const enabled = Boolean(payload?.enabled);
    const saved = patchAccounts((accounts) => {
      ["xiaohongshu", "douyin"].forEach((platform) => {
        accounts[platform] = (accounts[platform] || []).map((item) =>
          item.id === accountId ? { ...item, enabled } : item
        );
      });
    });
    return { ok: true, accounts: saved };
  });

  ipcMain.handle(IPC_CHANNELS.accountsRemove, async (_event, payload) => {
    const accountId = String(payload?.accountId || "");
    const saved = patchAccounts((accounts) => {
      ["xiaohongshu", "douyin"].forEach((platform) => {
        accounts[platform] = (accounts[platform] || []).filter((item) => item.id !== accountId);
      });
    });
    return { ok: true, accounts: saved };
  });
}

module.exports = {
  registerWorkbenchIpcHandlers
};
