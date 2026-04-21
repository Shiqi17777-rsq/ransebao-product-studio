function isLocalConfigReady(configSummary, configuredString) {
  return Boolean(
    configuredString(configSummary?.image?.deviceImageDir) &&
    configuredString(configSummary?.image?.downloadsDir) &&
    configuredString(configSummary?.video?.hairColorReferenceDir) &&
    configuredString(configSummary?.video?.downloadsDir)
  );
}

function hasPublishCapability(planResult) {
  const root = String(planResult?.cwd || planResult?.root || "").trim();
  const sauBin = String(planResult?.sau_bin || "").trim();
  const accounts = Array.isArray(planResult?.accounts) ? planResult.accounts : [];
  return Boolean(root && sauBin && accounts.length > 0);
}

function isEnvironmentReady(report) {
  const results = report?.plan?.results || {};
  return Boolean(
    report?.inspect &&
    results?.image?.ready &&
    results?.video?.ready &&
    hasPublishCapability(results?.xiaohongshu) &&
    hasPublishCapability(results?.douyin) &&
    hasPublishCapability(results?.video_xiaohongshu) &&
    hasPublishCapability(results?.video_douyin)
  );
}

function createDependencyStateCore(deps) {
  function summarizeLocalRuntimeConfig(localConfig = deps.readLocalRuntimeConfig()) {
    const imageCfg = localConfig?.image || {};
    const videoCfg = localConfig?.video || {};
    const publishCfg = localConfig?.publish || {};
    const xiaohongshuPublishCfg = publishCfg?.xiaohongshu || {};
    const douyinPublishCfg = publishCfg?.douyin || {};
    const sauRoot = deps.resolveSauRoot(localConfig);
    return {
      selectedProduct: deps.configuredString(localConfig?.selected_product || "ransebao"),
      workspaceRoot: deps.configuredString(localConfig?.workspace_root || "./runtime"),
      hasLocalConfig: deps.localConfigExists(),
      runtime: {
        pythonBin: deps.configuredString(localConfig?.runtime?.python_bin)
      },
      apiKeys: {
        hasGemini: Boolean(deps.configuredString(localConfig?.api_keys?.gemini || localConfig?.api_keys?.nano_banana_pro))
      },
      image: {
        provider: deps.configuredString(imageCfg?.provider || "dreamina"),
        nanoBananaModel: deps.configuredString(imageCfg?.nano_banana_model || "gemini-3-pro-image-preview"),
        nanoBananaApiBase: deps.configuredString(imageCfg?.nano_banana_api_base),
        nanoBananaAuthMode: deps.configuredString(imageCfg?.nano_banana_auth_mode || "auto"),
        dreaminaCliRoot: deps.configuredString(imageCfg?.dreamina_cli_root),
        deviceImageDir: deps.configuredString(imageCfg?.device_image_dir),
        downloadsDir: deps.configuredString(imageCfg?.downloads_dir),
        pollAttempts: Number(imageCfg?.poll_attempts || 8),
        pollIntervalSeconds: Number(imageCfg?.poll_interval_seconds || 15)
      },
      video: {
        dreaminaCliRoot: deps.configuredString(videoCfg?.dreamina_cli_root || imageCfg?.dreamina_cli_root),
        referenceImageDir: deps.configuredString(videoCfg?.reference_image_dir || imageCfg?.device_image_dir),
        hairColorReferenceDir: deps.configuredString(videoCfg?.hair_color_reference_dir),
        selectedHairColorImage: deps.configuredString(videoCfg?.selected_hair_color_image),
        downloadsDir: deps.configuredString(videoCfg?.downloads_dir),
        templateId: deps.configuredString(videoCfg?.template_id || "beauty-hair-transformation"),
        modelVersion: deps.configuredString(videoCfg?.model_version || "seedance2.0_vip"),
        duration: Number(videoCfg?.duration || 15),
        ratio: deps.configuredString(videoCfg?.ratio || "16:9"),
        videoResolution: deps.configuredString(videoCfg?.video_resolution || "720p"),
        pollAttempts: Number(videoCfg?.poll_attempts || 12),
        pollIntervalSeconds: Number(videoCfg?.poll_interval_seconds || 15)
      },
      publish: {
        imageDir: deps.configuredString(publishCfg?.image_dir),
        sauRoot,
        patchrightBrowsersPath: deps.resolvePatchrightBrowsersPath(localConfig),
        xiaohongshuRoot: deps.configuredString(publishCfg?.xiaohongshu?.root),
        douyinRoot: deps.configuredString(publishCfg?.douyin?.root),
        xiaohongshu: {
          private: xiaohongshuPublishCfg?.private !== false,
          headed: xiaohongshuPublishCfg?.headed !== false
        },
        douyin: {
          private: douyinPublishCfg?.private !== false,
          headed: douyinPublishCfg?.headed !== false
        }
      }
    };
  }

  function deriveOnboardingState({
    localConfig,
    dependencyReport,
    environmentReport,
    accountsState,
    desktopAutomation
  }) {
    const enabledAccounts = (accountsState?.summary?.xiaohongshu?.enabled || 0) + (accountsState?.summary?.douyin?.enabled || 0);
    const installItems = dependencyReport?.installItems || {};
    const dependencyReady = (id) => installItems?.[id]?.status === "ready";
    const steps = [
      {
        id: "self-check",
        title: "程序自检",
        description: "先确认打包资源和内置 Python 都完整可用。",
        complete: dependencyReady("bundleAssets") && dependencyReady("bundledPython"),
        required: true,
        page: "settings"
      },
      {
        id: "publish-tooling",
        title: "发布工具安装",
        description: "先安装 sau，再准备 patchright Chromium 浏览器运行时。",
        complete: dependencyReady("sau") && dependencyReady("patchrightChromium"),
        required: true,
        page: "settings"
      },
      {
        id: "dreamina",
        title: "Dreamina 安装",
        description: "图片生成链需要 Dreamina，先在客户端里完成检测或安装。",
        complete: dependencyReady("dreamina"),
        required: true,
        page: "settings"
      },
      {
        id: "config",
        title: "本地目录",
        description: "确认设备图目录和生成图片目录，后面生成和发布都会复用它们。",
        complete: isLocalConfigReady(localConfig, deps.configuredString),
        required: true,
        page: "settings"
      },
      {
        id: "accounts",
        title: "账号登录",
        description: "至少准备一个已启用账号，手动发布和自动化都会复用它。",
        complete: enabledAccounts > 0,
        required: true,
        page: "accounts"
      },
      {
        id: "automation",
        title: "自动化默认值",
        description: "设好默认执行时间，后面决定开不开每日自动化都更顺手。",
        complete: Boolean(desktopAutomation?.updatedAt),
        required: false,
        page: "settings"
      },
      {
        id: "environment",
        title: "环境联调",
        description: "最后统一检查图片生成和双平台发布适配器是否 ready。",
        complete: isEnvironmentReady(environmentReport),
        required: true,
        page: "settings"
      }
    ];
    const blocking = steps.filter((step) => step.required && !step.complete);
    return {
      complete: blocking.length === 0,
      blockingCount: blocking.length,
      steps,
      nextPage: blocking[0]?.page || "upstream",
      summary: blocking.length === 0 ? "首次启动基础配置已完成" : `还差 ${blocking.length} 步基础配置`
    };
  }

  async function inspectDependencyReport(localConfig = deps.readLocalRuntimeConfig()) {
    const profiles = deps.loadDependencyProfiles();
    const installState = deps.readDependencyInstallState();
    const bundledAssets = deps.detectBundledAssets();
    const bundledPython = deps.managedBundledPythonBinPath() || deps.bundledPythonBinPath();
    const managedSauRoot = deps.managedSauBinPath() ? deps.managedSauVenvRoot() : "";
    const managedSauBin = deps.managedSauBinPath();
    const patchrightProbe = deps.detectPatchrightBrowsers(localConfig);
    const configured = {
      pythonBin: deps.configuredString(localConfig?.runtime?.python_bin),
      dreaminaCliRoot: deps.configuredString(localConfig?.image?.dreamina_cli_root),
      deviceImageDir: deps.configuredString(localConfig?.image?.device_image_dir),
      downloadsDir: deps.configuredString(localConfig?.image?.downloads_dir),
      sauRoot: deps.configuredString(localConfig?.publish?.sau_root || localConfig?.publish?.douyin?.root),
      patchrightBrowsersPath: deps.configuredString(localConfig?.publish?.patchright_browsers_path)
    };

    const configuredPythonProbe = !bundledPython && configured.pythonBin
      ? await deps.probeCommandCandidate(configured.pythonBin)
      : null;
    const pythonProbe = bundledPython
      ? {
          value: bundledPython,
          detected: true,
          source: "bundled"
        }
      : configured.pythonBin
        ? {
            value: configured.pythonBin,
            detected: Boolean(configuredPythonProbe?.available),
            source: "local_config"
          }
        : await deps.resolveFirstCommandCandidate(deps.loadDependencyProfiles()?.python_bin?.candidates || []);
    const dreaminaProbe = configured.dreaminaCliRoot
      ? await deps.inspectDreaminaCandidate(configured.dreaminaCliRoot, "local_config")
      : await deps.resolveDreaminaCandidate(profiles?.dreamina_cli_root?.candidates || []);
    const dreaminaReady = Boolean(dreaminaProbe.ready ?? dreaminaProbe.detected);
    const deviceProbe = configured.deviceImageDir
      ? {
          value: configured.deviceImageDir,
          detected: deps.pathExists(configured.deviceImageDir),
          source: "local_config"
        }
      : deps.resolveFirstDirectoryCandidate(profiles?.device_image_dir?.candidates || []);
    const downloadsProbe = configured.downloadsDir
      ? {
          value: configured.downloadsDir,
          detected: deps.pathExists(configured.downloadsDir),
          source: "local_config"
        }
      : deps.resolveFirstDirectoryCandidate(profiles?.downloads_dir?.candidates || []);
    const sauProbe = managedSauRoot
      ? {
          value: managedSauRoot,
          detected: Boolean(managedSauBin),
          source: "managed"
        }
      : configured.sauRoot
        ? {
            value: configured.sauRoot,
            detected: deps.pathExists(configured.sauRoot),
            source: "local_config"
          }
        : deps.resolveFirstDirectoryCandidate(profiles?.sau_root?.candidates || []);

    const installItems = {
      bundleAssets: {
        id: "bundleAssets",
        label: "程序资源",
        detected: bundledAssets.detected,
        managedByApp: true,
        installable: false,
        status: deps.installStatusFor(
          { detected: bundledAssets.detected },
          installState.items?.bundleAssets || {}
        ),
        actionLabel: deps.dependencyActionLabel("bundleAssets", bundledAssets.detected),
        currentPath: bundledAssets.value,
        message: deps.dependencyMessage("bundleAssets", { detected: bundledAssets.detected, value: bundledAssets.value }),
        missing: bundledAssets.missing
      },
      bundledPython: {
        id: "bundledPython",
        label: "内置 Python",
        detected: Boolean(bundledPython),
        managedByApp: true,
        installable: false,
        status: deps.installStatusFor(
          { detected: Boolean(bundledPython) },
          installState.items?.bundledPython || {}
        ),
        actionLabel: deps.dependencyActionLabel("bundledPython", Boolean(bundledPython)),
        currentPath: bundledPython,
        message: deps.dependencyMessage("bundledPython", { detected: Boolean(bundledPython), value: bundledPython })
      },
      sau: {
        id: "sau",
        label: "发布工具 sau",
        detected: Boolean(sauProbe.detected && deps.resolveSauBin(sauProbe.value)),
        managedByApp: Boolean(managedSauBin),
        installable: true,
        status: deps.installStatusFor(
          { detected: Boolean(sauProbe.detected && deps.resolveSauBin(sauProbe.value)) },
          installState.items?.sau || {}
        ),
        actionLabel: deps.dependencyActionLabel("sau", Boolean(sauProbe.detected)),
        currentPath: sauProbe.value,
        message: deps.dependencyMessage("sau", { detected: Boolean(sauProbe.detected), value: sauProbe.value })
      },
      patchrightChromium: {
        id: "patchrightChromium",
        label: "patchright Chromium",
        detected: patchrightProbe.detected,
        managedByApp: Boolean(configured.patchrightBrowsersPath || managedSauBin),
        installable: true,
        status: deps.installStatusFor(
          { detected: patchrightProbe.detected },
          installState.items?.patchrightChromium || {}
        ),
        actionLabel: deps.dependencyActionLabel("patchrightChromium", patchrightProbe.detected),
        currentPath: patchrightProbe.value,
        message: deps.dependencyMessage("patchrightChromium", { detected: patchrightProbe.detected, value: patchrightProbe.value })
      },
      dreamina: {
        id: "dreamina",
        label: "Dreamina",
        detected: dreaminaProbe.detected,
        ready: dreaminaReady,
        requiresLogin: Boolean(dreaminaProbe.requiresLogin),
        mode: dreaminaProbe.mode || "",
        managedByApp: deps.isManagedRuntimePath(deps.runtimeBaseDir, dreaminaProbe.value),
        installable: true,
        status: deps.installStatusFor(
          { detected: dreaminaProbe.detected, ready: dreaminaReady, requiresLogin: Boolean(dreaminaProbe.requiresLogin) },
          installState.items?.dreamina || {}
        ),
        actionLabel: deps.dreaminaActionLabel({
          detected: dreaminaProbe.detected,
          requiresLogin: Boolean(dreaminaProbe.requiresLogin)
        }),
        currentPath: dreaminaProbe.value,
        message: deps.dependencyMessage("dreamina", {
          detected: dreaminaProbe.detected,
          requiresLogin: Boolean(dreaminaProbe.requiresLogin),
          value: dreaminaProbe.value
        })
      }
    };

    Object.values(installItems).forEach((item) => {
      const record = installState.items?.[item.id] || {};
      item.progress = Number.isFinite(record.progress)
        ? Math.max(0, Math.min(1, Number(record.progress)))
        : item.status === "ready"
          ? 1
          : item.status === "needs_login"
            ? 0.86
            : 0;
      item.progressLabel = deps.configuredString(record.progressLabel || record.stepLabel || "");
      item.indeterminate = Boolean(record.indeterminate && item.status === "installing");
    });

    return {
      checkedAt: new Date().toISOString(),
      ready: Boolean(
        bundledAssets.detected &&
        pythonProbe.detected &&
        dreaminaReady &&
        deviceProbe.detected &&
        downloadsProbe.detected &&
        sauProbe.detected &&
        patchrightProbe.detected
      ),
      recommendedConfig: {
        pythonBin: pythonProbe.detected ? pythonProbe.value : "",
        dreaminaCliRoot: dreaminaProbe.detected ? dreaminaProbe.value : "",
        deviceImageDir: deviceProbe.detected ? deviceProbe.value : "",
        downloadsDir: downloadsProbe.detected ? downloadsProbe.value : "",
        sauRoot: sauProbe.detected ? sauProbe.value : "",
        patchrightBrowsersPath: patchrightProbe.detected ? patchrightProbe.value : deps.managedPatchrightBrowsersPath()
      },
      items: {
        pythonBin: {
          label: profiles?.python_bin?.label || "Python 解释器",
          value: pythonProbe.value,
          detected: pythonProbe.detected
        },
        dreaminaCliRoot: {
          label: profiles?.dreamina_cli_root?.label || "Dreamina CLI 根目录",
          value: dreaminaProbe.value,
          detected: dreaminaProbe.detected
        },
        deviceImageDir: {
          label: profiles?.device_image_dir?.label || "设备图目录",
          value: deviceProbe.value,
          detected: deviceProbe.detected
        },
        downloadsDir: {
          label: profiles?.downloads_dir?.label || "生成图片目录",
          value: downloadsProbe.value,
          detected: downloadsProbe.detected
        },
        sauRoot: {
          label: profiles?.sau_root?.label || "social-auto-upload 根目录",
          value: sauProbe.value,
          detected: sauProbe.detected
        }
      },
      installItems,
      installState
    };
  }

  async function refreshDependencyArtifacts(localConfig = deps.readLocalRuntimeConfig()) {
    const reconciliation = deps.reconcileDependencyInstallStateWithReport(await inspectDependencyReport(localConfig), {
      nowIso: new Date().toISOString()
    });
    if (reconciliation.changed) {
      deps.writeJsonSafe(deps.currentArtifacts().dependencyInstallState, reconciliation.installState);
    }
    deps.writeJsonSafe(deps.currentArtifacts().dependencyReport, reconciliation.report);
    return reconciliation.report;
  }

  return {
    inspectDependencyReport,
    refreshDependencyArtifacts,
    summarizeLocalRuntimeConfig,
    deriveOnboardingState
  };
}

module.exports = {
  createDependencyStateCore
};
