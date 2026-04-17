const fs = require("fs");

function buildUpstreamCommands() {
  return [
    { command: "refresh-news", label: "刷新热点资讯池" },
    { command: "build-brand-pool", label: "整理品牌常规池" },
    { command: "route-topics", label: "重新路由上游内容" },
    { command: "build-briefs", label: "生成候选 brief" },
    { command: "select-best-brief", label: "选择今日最佳 brief" },
    { command: "build-image-prompt", label: "更新图片与发布资产" },
    { command: "plan-execution", label: "检查执行条件" }
  ];
}

function scopedExecutionResults(parsedResults, scope = null) {
  if (!parsedResults || typeof parsedResults !== "object") return [];
  if (!scope) return Object.values(parsedResults).filter(Boolean);
  if (scope === "publish") {
    return ["xiaohongshu", "douyin"].map((key) => parsedResults[key]).filter(Boolean);
  }
  if (scope === "video_publish") {
    return ["video_xiaohongshu", "video_douyin"].map((key) => parsedResults[key]).filter(Boolean);
  }
  return [parsedResults[scope]].filter(Boolean);
}

function collectExecutionModes(result, scope = null) {
  const parsed = result?.parsed || {};
  if (!parsed || typeof parsed !== "object") return [];

  const nestedResults = scopedExecutionResults(parsed?.results, scope);

  return [parsed.mode, ...nestedResults.map((entry) => entry?.mode).filter(Boolean)].filter(Boolean);
}

function resolveImageExecution(result) {
  const imageResult = result?.parsed?.results?.image || {};
  const promptResult = result?.parsed?.prompt_result || {};
  const downloadPaths = Array.isArray(imageResult?.download_paths)
    ? imageResult.download_paths.filter(Boolean)
    : [];
  const downloadPath = downloadPaths.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  }) || null;
  const modes = collectExecutionModes(result, "image");
  const error = !result?.ok
    ? (imageResult?.stderr_tail || result?.stderr || "Image generation failed.")
    : !modes.length
      ? "Image task finished without execution status."
      : modes.every((mode) => mode === "plan")
        ? "Image task only produced a plan and did not execute."
        : !downloadPath
          ? "Image task completed without a downloaded image."
          : "";

  return {
    ok: !error,
    error,
    imageResult,
    promptResult,
    downloadPath
  };
}

function resolveVideoExecution(result) {
  const videoResult = result?.parsed?.results?.video || {};
  const promptResult = result?.parsed?.prompt_result || {};
  const downloadPaths = Array.isArray(videoResult?.download_paths)
    ? videoResult.download_paths.filter(Boolean)
    : [];
  const downloadPath = downloadPaths.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  }) || null;
  const modes = collectExecutionModes(result, "video");
  const error = !result?.ok
    ? (videoResult?.stderr_tail || result?.stderr || "Video generation failed.")
    : !modes.length
      ? "Video task finished without execution status."
      : modes.every((mode) => mode === "plan")
        ? "Video task only produced a plan and did not execute."
        : !downloadPath
          ? "Video task completed without a downloaded video."
          : "";

  return {
    ok: !error,
    error,
    videoResult,
    promptResult,
    downloadPath
  };
}

function resolvePublishExecutionError(result, scope) {
  const modes = collectExecutionModes(result, scope);
  const scopedResults = scopedExecutionResults(result?.parsed?.results, scope);
  const failedResult = scopedResults.find((entry) => {
    const status = String(entry?.status || "").trim();
    return status && status !== "succeeded";
  });
  const failedAccount = (failedResult?.account_results || []).find((entry) => {
    const status = String(entry?.status || "").trim();
    return status && status !== "succeeded";
  });
  const scopedError = scopedResults
    .map((entry) => entry?.stderr_tail || entry?.error || "")
    .find(Boolean);
  const failedStatusLabel = failedResult
    ? `${failedResult.platform || failedResult.adapter || "publish"} status=${failedResult.status}`
    : "";

  if (!result?.ok) return scopedError || result?.stderr || "Publish execution failed.";
  if (!modes.length) return "Publish task finished without execution status.";
  if (modes.every((mode) => mode === "plan")) return "Publish task only produced a plan and did not execute.";
  if (failedResult) {
    return failedAccount?.stderr_tail || scopedError || failedStatusLabel || "Publish task finished with a failed platform result.";
  }
  return "";
}

function defaultVideoPublishState(date, dashboard, existingState = {}) {
  const videoItem = dashboard?.videoGallery?.item || {};
  const existingPlatforms = existingState?.platforms || {};
  return {
    date,
    updatedAt: existingState?.updatedAt || null,
    videoPath: videoItem.videoPath || existingState?.videoPath || null,
    templateId: videoItem.templateId || existingState?.templateId || null,
    templateName: videoItem.templateName || existingState?.templateName || null,
    hairColorName: videoItem.hairColorName || existingState?.hairColorName || null,
    platforms: {
      xiaohongshu: { ...(existingPlatforms.xiaohongshu || {}) },
      douyin: { ...(existingPlatforms.douyin || {}) },
    },
  };
}

function platformStateFromExecution(platformResult, fallbackError, fallbackVideoPath) {
  const accountResults = Array.isArray(platformResult?.account_results) ? platformResult.account_results : [];
  const successCount = accountResults.filter((entry) => entry?.status === "succeeded").length;
  const normalizedStatus = String(platformResult?.status || "").trim() || "failed_returncode";
  return {
    status: normalizedStatus,
    updatedAt: new Date().toISOString(),
    error: normalizedStatus === "succeeded" ? null : (fallbackError || platformResult?.stderr_tail || null),
    title: platformResult?.title || null,
    desc: platformResult?.desc || null,
    tags: platformResult?.tags || null,
    file: platformResult?.published_file || platformResult?.file || platformResult?.video_path || fallbackVideoPath || null,
    accountResults,
    successCount,
    accountCount: accountResults.length || (Array.isArray(platformResult?.accounts) ? platformResult.accounts.length : 0),
  };
}

function automationBusyStderr(activeRun = null) {
  return activeRun?.kind === "video"
    ? "视频自动化正在运行中。"
    : "图文自动化正在运行中。";
}

function resetVideoPublishState(deps, date, dashboard = null) {
  const nextState = defaultVideoPublishState(date, dashboard || {}, {});
  nextState.updatedAt = new Date().toISOString();
  deps.writeJsonSafe(deps.currentArtifacts(date).videoPublishState, nextState);
  return nextState;
}

function createWorkflowOrchestrator(deps) {
  async function rebuildDownstreamAssetsForBrief(date, product = "ransebao") {
    const promptResult = await deps.runCli("build-image-prompt", { product, date });
    const planResult = await deps.runCli("plan-execution", { product, date });
    return {
      ok: promptResult.ok && planResult.ok,
      promptResult,
      planResult
    };
  }

  async function runDesktopAutomationSequence(options = {}) {
    const normalized = {
      product: options.product || "ransebao",
      date: options.date || deps.formatDate(),
      trigger: options.trigger || "manual",
      kind: "desktop"
    };

    if (deps.getActiveAutomationRun() || deps.getActiveImageTask() || deps.getActiveVideoTask()) {
      return {
        ok: false,
        action: "run-desktop-automation",
        stdout: "",
        stderr: deps.getActiveAutomationRun()
          ? automationBusyStderr(deps.getActiveAutomationRun())
          : deps.getActiveImageTask()
            ? "图片生成任务仍在运行中。"
            : "视频生成任务仍在运行中。",
        parsed: null
      };
    }

    deps.setActiveAutomationRun({
      startedAt: Date.now(),
      ...normalized
    });

    const commands = buildUpstreamCommands();
    const automationState = deps.readDesktopAutomationSettings();
    const templateCatalog = deps.loadTemplateCatalog();
    const selectedTemplates = deps.buildAutomatedTemplateSelection(normalized.date, templateCatalog);
    const upstreamSteps = [];
    const imageSteps = [];
    const imageFailures = [];

    try {
      deps.emitWorkflowProgress({
        action: "run-desktop-automation",
        state: "running",
        title: "正在运行本地自动化",
        detail: "开始使用当前已选的 3 套模板，并执行今天的完整流程。",
        progress: 0.06,
        currentStep: 1,
        totalSteps: 4,
        stepLabel: "读取当前模板选择"
      });

      const persistedSelection = deps.persistTemplateSelection(normalized.date, selectedTemplates);
      deps.emitWorkflowProgress({
        action: "run-desktop-automation",
        state: "running",
        title: "正在运行本地自动化",
        detail: `今天会使用 ${selectedTemplates.map((item) => item.templateId).join(" / ")}。`,
        progress: 0.16,
        currentStep: 1,
        totalSteps: 4,
        stepLabel: "模板已确认"
      });

      for (const [index, step] of commands.entries()) {
        deps.emitWorkflowProgress({
          action: "run-desktop-automation",
          state: "running",
          title: "正在运行本地自动化",
          detail: step.label,
          progress: Math.min(0.2 + (index / commands.length) * 0.24, 0.42),
          currentStep: 2,
          totalSteps: 4,
          stepLabel: step.label
        });
        const result = await deps.runCli(step.command, normalized);
        upstreamSteps.push({ command: step.command, label: step.label, ...result });
        if (!result.ok) {
          throw {
            stage: "upstream",
            result: {
              ok: false,
              action: "run-desktop-automation",
              steps: upstreamSteps
            }
          };
        }
        if (step.command === "select-best-brief") {
          deps.syncActiveBriefFromBest(normalized.date, { clearDraft: true });
          deps.invalidateTemplateGallery(normalized.date, "今日最佳 brief 已更新，需要重新生成 3 张图片。");
        }
      }

      let galleryState = persistedSelection.gallery;
      for (const [index, slotEntry] of selectedTemplates.entries()) {
        deps.emitWorkflowProgress({
          action: "run-desktop-automation",
          state: "running",
          title: "正在运行本地自动化",
          detail: `正在生成模板 ${slotEntry.slot}：${slotEntry.templateId}。`,
          progress: Math.min(0.48 + (index / selectedTemplates.length) * 0.24, 0.72),
          currentStep: 3,
          totalSteps: 4,
          stepLabel: `生成模板 ${slotEntry.slot}`
        });

        const rawResult = await deps.runCli("execute-adapters", {
          ...normalized,
          scope: "image",
          slot: slotEntry.slot,
          templateId: slotEntry.templateId
        });
        const resolvedImage = resolveImageExecution(rawResult);
        const result = {
          ...rawResult,
          ok: resolvedImage.ok,
          stderr: resolvedImage.ok ? rawResult.stderr : (resolvedImage.error || rawResult.stderr)
        };
        imageSteps.push({ slot: slotEntry.slot, templateId: slotEntry.templateId, ...result });
        const imageResult = resolvedImage.imageResult;
        const promptResult = resolvedImage.promptResult;
        const downloadPath = resolvedImage.downloadPath;

        galleryState = {
          ...galleryState,
          items: galleryState.items.map((item) => {
            if (Number(item.slot) !== Number(slotEntry.slot)) return item;
            return {
              ...item,
              status: resolvedImage.ok ? "completed" : "error",
              imagePath: resolvedImage.ok ? resolvedImage.downloadPath : null,
              generatedAt: resolvedImage.ok ? (resolvedImage.imageResult?.finished_at || new Date().toISOString()) : null,
              submitId: resolvedImage.ok ? (resolvedImage.imageResult?.submit_id || null) : null,
              promptPath: resolvedImage.promptResult?.prompt_path || null,
              error: result.ok ? null : (imageResult?.stderr_tail || result.stderr || "生成失败")
            };
          })
        };
        deps.writeTemplateGallery(normalized.date, galleryState);

        if (!result.ok) {
          imageFailures.push({
            slot: slotEntry.slot,
            templateId: slotEntry.templateId,
            error: imageResult?.stderr_tail || result.stderr || "生成失败"
          });
        }
      }

      if (imageFailures.length) {
        throw {
          stage: "image",
          result: {
            ok: false,
            action: "run-desktop-automation",
            steps: [...upstreamSteps, ...imageSteps],
            failures: imageFailures
          }
        };
      }

      deps.emitWorkflowProgress({
        action: "run-desktop-automation",
        state: "running",
        title: "正在运行本地自动化",
        detail: "3 张模板图已完成，开始双平台发布。",
        progress: 0.84,
        currentStep: 4,
        totalSteps: 4,
        stepLabel: "开始发布"
      });

      const accountsState = deps.readPublishAccountsState();
      if (accountsState.summary.xiaohongshu.enabled === 0 && accountsState.summary.douyin.enabled === 0) {
        throw {
          stage: "publish",
          result: {
            ok: false,
            action: "run-desktop-automation",
            stdout: "",
            stderr: "当前没有已启用的发布账号。",
            parsed: null,
            steps: [...upstreamSteps, ...imageSteps]
          }
        };
      }

      const rawPublishResult = await deps.runCli("execute-adapters", {
        ...normalized,
        scope: "publish"
      });
      const publishError = resolvePublishExecutionError(rawPublishResult, "publish");
      const publishResult = {
        ...rawPublishResult,
        ok: rawPublishResult.ok && !publishError,
        stderr: publishError || rawPublishResult.stderr
      };
      if (!publishResult.ok) {
        throw {
          stage: "publish",
          result: {
            ok: false,
            action: "run-desktop-automation",
            steps: [...upstreamSteps, ...imageSteps, publishResult]
          }
        };
      }

      const finishedState = deps.writeDesktopAutomationSettings({
        ...automationState,
        enabled: automationState.enabled,
        dailyTime: automationState.dailyTime,
        lastRunAt: new Date().toISOString(),
        lastRunStatus: "success",
        lastResultSummary: `已完成 ${normalized.date} 自动流程：3 图生成并双平台发布。`,
        lastError: null,
        lastTrigger: normalized.trigger
      });
      deps.syncDesktopAutomationSchedule(finishedState);
      const successResult = {
        ok: true,
        action: "run-desktop-automation",
        steps: [...upstreamSteps, ...imageSteps, publishResult],
        selection: selectedTemplates
      };
      deps.emitWorkflowProgress({
        action: "run-desktop-automation",
        state: "success",
        title: "本地自动化已完成",
        detail: "今天的上游、三图生成和三图发布都已完成。",
        progress: 1,
        currentStep: 4,
        totalSteps: 4,
        stepLabel: "全部完成",
        result: successResult
      });
      return successResult;
    } catch (error) {
      const failedState = deps.writeDesktopAutomationSettings({
        ...automationState,
        enabled: automationState.enabled,
        dailyTime: automationState.dailyTime,
        lastRunAt: new Date().toISOString(),
        lastRunStatus: "error",
        lastResultSummary: `自动流程失败：${error?.stage || "unknown"}`,
        lastError: error?.result?.stderr || error?.message || "自动流程失败",
        lastTrigger: normalized.trigger
      });
      deps.syncDesktopAutomationSchedule(failedState);
      const failedResult = error?.result || {
        ok: false,
        action: "run-desktop-automation",
        stdout: "",
        stderr: error?.message || "Desktop automation failed.",
        parsed: null
      };
      deps.emitWorkflowProgress({
        action: "run-desktop-automation",
        state: "error",
        title: "本地自动化失败",
        detail: "本轮没有继续往后发布，请检查日志后重试。",
        progress: 0.94,
        currentStep: 4,
        totalSteps: 4,
        stepLabel: "执行失败",
        result: failedResult
      });
      return failedResult;
    } finally {
      deps.setActiveAutomationRun(null);
    }
  }

  async function runVideoAutomationSequence(options = {}) {
    const action = "run-video-automation";
    const normalized = {
      product: options.product || "ransebao",
      date: options.date || deps.formatDate(),
      trigger: options.trigger || "manual",
      kind: "video"
    };

    if (deps.getActiveAutomationRun() || deps.getActiveVideoTask() || deps.getActiveImageTask()) {
      return {
        ok: false,
        action,
        stdout: "",
        stderr: deps.getActiveAutomationRun()
          ? automationBusyStderr(deps.getActiveAutomationRun())
          : deps.getActiveVideoTask()
            ? "视频生成任务仍在运行中。"
            : "图片生成任务仍在运行中。",
        parsed: null
      };
    }

    deps.setActiveAutomationRun({
      startedAt: Date.now(),
      ...normalized
    });

    const automationState = deps.readVideoAutomationSettings();
    const steps = [];
    let videoHeartbeat = null;

    try {
      const dashboard = await deps.loadDashboard();
      const accountSummary = dashboard.accounts?.summary || {
        xiaohongshu: { enabled: 0 },
        douyin: { enabled: 0 }
      };
      if (accountSummary.xiaohongshu.enabled === 0 && accountSummary.douyin.enabled === 0) {
        throw {
          stage: "publish",
          result: {
            ok: false,
            action,
            stdout: "",
            stderr: "当前没有已启用的视频发布账号。",
            parsed: null
          }
        };
      }

      const artifacts = deps.currentArtifacts(normalized.date);
      const runningAt = new Date().toISOString();
      resetVideoPublishState(deps, normalized.date, dashboard);
      deps.writeJsonSafe(artifacts.videoGenerationState, {
        date: normalized.date,
        status: "running",
        provider: "dreamina-multimodal2video",
        startedAt: runningAt,
        updatedAt: runningAt,
        videoPath: null,
        error: null,
        douyinNoteText: null,
        douyinNotePath: null,
        xiaohongshuBody: null,
        xiaohongshuBodyPath: null
      });
      deps.writeJsonSafe(artifacts.videoGallery, {
        date: normalized.date,
        status: "running",
        updatedAt: runningAt,
        item: {
          status: "running",
          provider: "dreamina-multimodal2video",
          videoPath: null,
          generatedAt: null,
          submitId: null,
          promptPath: null,
          referenceImages: [],
          error: null,
          douyinNoteText: null,
          douyinNotePath: null,
          xiaohongshuBody: null,
          xiaohongshuBodyPath: null
        }
      });

      deps.emitWorkflowProgress({
        action,
        state: "running",
        title: "视频自动化已启动",
        detail: "会先生成当前视频，再继续发布到已启用平台。",
        progress: 0.12,
        currentStep: 1,
        totalSteps: 2,
        stepLabel: "生成视频"
      });

      const videoStartedAt = Date.now();
      videoHeartbeat = setInterval(() => {
        const elapsed = deps.formatElapsed(Date.now() - videoStartedAt);
        deps.emitWorkflowProgress({
          action,
          state: "running",
          title: "正在生成定时视频",
          detail: `正在等待 Dreamina 完成并下载 mp4，已等待 ${elapsed}。`,
          progress: 0.42,
          indeterminate: true,
          currentStep: 1,
          totalSteps: 2,
          stepLabel: "等待视频下载"
        });
      }, 3000);

      const rawVideoResult = await deps.runCli("execute-adapters", {
        ...normalized,
        scope: "video"
      });
      if (videoHeartbeat) {
        clearInterval(videoHeartbeat);
        videoHeartbeat = null;
      }

      const resolvedVideo = resolveVideoExecution(rawVideoResult);
      const videoResult = resolvedVideo.videoResult;
      const videoExecutionResult = {
        action: "execute-video",
        ...rawVideoResult,
        ok: resolvedVideo.ok,
        stderr: resolvedVideo.ok ? rawVideoResult.stderr : (resolvedVideo.error || rawVideoResult.stderr)
      };
      steps.push(videoExecutionResult);

      const nextStatus = resolvedVideo.ok ? "completed" : "failed";
      const generatedAt = resolvedVideo.ok ? (videoResult?.finished_at || new Date().toISOString()) : null;
      const videoPayload = {
        date: normalized.date,
        status: nextStatus,
        provider: videoResult?.adapter || "dreamina-multimodal2video",
        updatedAt: new Date().toISOString(),
        generatedAt,
        submitId: videoResult?.submit_id || null,
        videoPath: resolvedVideo.downloadPath,
        promptPath: videoResult?.prompt_path || resolvedVideo.promptResult?.prompt_path || null,
        templateId: videoResult?.template_id || null,
        templateName: videoResult?.template_name || null,
        templateVideoPath: videoResult?.template_video_path || null,
        referenceVideos: Array.isArray(videoResult?.reference_videos) ? videoResult.reference_videos : [],
        deviceReferenceImages: Array.isArray(videoResult?.device_reference_images) ? videoResult.device_reference_images : [],
        hairColorReferenceImage: videoResult?.hair_color_reference_image || null,
        hairColorName: videoResult?.hair_color_name || null,
        douyinNoteText: videoResult?.douyin_note_text || null,
        douyinNotePath: videoResult?.douyin_note_path || null,
        xiaohongshuBody: videoResult?.xiaohongshu_body || null,
        xiaohongshuBodyPath: videoResult?.xiaohongshu_body_path || null,
        videoOutputDir: videoResult?.video_output_dir || videoResult?.downloads_dir || null,
        referenceImages: Array.isArray(videoResult?.reference_images) ? videoResult.reference_images : [],
        modelVersion: videoResult?.model_version || null,
        duration: videoResult?.duration || null,
        ratio: videoResult?.ratio || null,
        videoResolution: videoResult?.video_resolution || null,
        error: resolvedVideo.ok ? null : (videoResult?.stderr_tail || videoExecutionResult.stderr || "Video generation failed.")
      };
      deps.writeJsonSafe(artifacts.videoGenerationState, videoPayload);
      deps.writeJsonSafe(artifacts.videoGallery, {
        date: normalized.date,
        status: nextStatus,
        updatedAt: videoPayload.updatedAt,
        item: {
          status: nextStatus,
          provider: videoPayload.provider,
          videoPath: videoPayload.videoPath,
          generatedAt: videoPayload.generatedAt,
          submitId: videoPayload.submitId,
          promptPath: videoPayload.promptPath,
          templateId: videoPayload.templateId,
          templateName: videoPayload.templateName,
          templateVideoPath: videoPayload.templateVideoPath,
          referenceVideos: videoPayload.referenceVideos,
          deviceReferenceImages: videoPayload.deviceReferenceImages,
          hairColorReferenceImage: videoPayload.hairColorReferenceImage,
          hairColorName: videoPayload.hairColorName,
          douyinNoteText: videoPayload.douyinNoteText,
          douyinNotePath: videoPayload.douyinNotePath,
          xiaohongshuBody: videoPayload.xiaohongshuBody,
          xiaohongshuBodyPath: videoPayload.xiaohongshuBodyPath,
          videoOutputDir: videoPayload.videoOutputDir,
          referenceImages: videoPayload.referenceImages,
          modelVersion: videoPayload.modelVersion,
          duration: videoPayload.duration,
          ratio: videoPayload.ratio,
          videoResolution: videoPayload.videoResolution,
          error: videoPayload.error
        }
      });

      if (!resolvedVideo.ok) {
        throw {
          stage: "video",
          result: {
            ok: false,
            action,
            stdout: rawVideoResult.stdout || "",
            stderr: videoPayload.error,
            parsed: rawVideoResult.parsed || null,
            steps
          }
        };
      }

      deps.emitWorkflowProgress({
        action,
        state: "running",
        title: "正在发布定时视频",
        detail: "mp4 已准备完成，继续执行模板化视频发布。",
        progress: 0.68,
        currentStep: 2,
        totalSteps: 2,
        stepLabel: "发布视频"
      });

      const rawPublishResult = await deps.runCli("execute-adapters", {
        ...normalized,
        scope: "video_publish"
      });
      const publishError = resolvePublishExecutionError(rawPublishResult, "video_publish");
      const publishResult = {
        action: "execute-video-publish",
        ...rawPublishResult,
        ok: rawPublishResult.ok && !publishError,
        stderr: publishError || rawPublishResult.stderr
      };
      steps.push(publishResult);

      const currentPublishState = deps.readJsonSafe(artifacts.videoPublishState) || {};
      const nextPublishState = defaultVideoPublishState(normalized.date, {
        videoGallery: {
          item: {
            videoPath: videoPayload.videoPath,
            templateId: videoPayload.templateId,
            templateName: videoPayload.templateName,
            hairColorName: videoPayload.hairColorName
          }
        }
      }, currentPublishState);
      for (const resultKey of ["video_xiaohongshu", "video_douyin"]) {
        const platformKey = resultKey.includes("xiaohongshu") ? "xiaohongshu" : "douyin";
        const platformResult = rawPublishResult?.parsed?.results?.[resultKey];
        if (!platformResult) continue;
        nextPublishState.platforms[platformKey] = platformStateFromExecution(
          platformResult,
          publishResult.stderr,
          videoPayload.videoPath
        );
      }
      nextPublishState.updatedAt = new Date().toISOString();
      deps.writeJsonSafe(artifacts.videoPublishState, nextPublishState);

      if (!publishResult.ok) {
        throw {
          stage: "publish",
          result: {
            ok: false,
            action,
            stdout: publishResult.stdout || "",
            stderr: publishResult.stderr,
            parsed: publishResult.parsed || null,
            steps
          }
        };
      }

      const finishedState = deps.writeVideoAutomationSettings({
        ...automationState,
        enabled: automationState.enabled,
        dailyTime: automationState.dailyTime,
        lastRunAt: new Date().toISOString(),
        lastRunStatus: "success",
        lastResultSummary: `已完成 ${normalized.date} 视频自动化：生成并发布了当前视频。`,
        lastError: null,
        lastTrigger: normalized.trigger
      });
      deps.syncVideoAutomationSchedule(finishedState);

      const successResult = {
        ok: true,
        action,
        steps,
        parsed: {
          video: videoPayload,
          publish: deps.readJsonSafe(artifacts.videoPublishState)
        }
      };
      deps.emitWorkflowProgress({
        action,
        state: "success",
        title: "视频自动化已完成",
        detail: "本轮定时任务已完成，视频已经生成、下载并发布。",
        progress: 1,
        currentStep: 2,
        totalSteps: 2,
        stepLabel: "全部完成",
        result: successResult
      });
      return successResult;
    } catch (error) {
      if (videoHeartbeat) {
        clearInterval(videoHeartbeat);
        videoHeartbeat = null;
      }
      const failedState = deps.writeVideoAutomationSettings({
        ...automationState,
        enabled: automationState.enabled,
        dailyTime: automationState.dailyTime,
        lastRunAt: new Date().toISOString(),
        lastRunStatus: "error",
        lastResultSummary: `视频自动化失败：${error?.stage || "未知阶段"}`,
        lastError: error?.result?.stderr || error?.message || "视频自动化失败。",
        lastTrigger: normalized.trigger
      });
      deps.syncVideoAutomationSchedule(failedState);
      const failedResult = error?.result || {
        ok: false,
        action,
        stdout: "",
        stderr: error?.message || "视频自动化失败。",
        parsed: null
      };
      deps.emitWorkflowProgress({
        action,
        state: "error",
        title: "视频自动化失败",
        detail: failedResult.stderr || "请检查最新日志后重试。",
        progress: 0.94,
        currentStep: 2,
        totalSteps: 2,
        stepLabel: "自动化失败",
        result: failedResult
      });
      return failedResult;
    } finally {
      if (videoHeartbeat) clearInterval(videoHeartbeat);
      deps.setActiveAutomationRun(null);
    }
  }

  async function runWorkflowAction(action, options = {}) {
    const normalized = {
      product: options.product || "ransebao",
      date: options.date || deps.formatDate()
    };
    const templateCatalog = deps.loadTemplateCatalog();

    if (action === "refresh-upstream") {
      const commands = buildUpstreamCommands();
      const steps = [];
      deps.emitWorkflowProgress({
        action,
        state: "running",
        title: "正在刷新上游",
        detail: "开始更新热点池、brief 和下游资产。",
        progress: 0.08,
        currentStep: 0,
        totalSteps: commands.length,
        stepLabel: "准备开始"
      });

      for (const [index, step] of commands.entries()) {
        deps.emitWorkflowProgress({
          action,
          state: "running",
          title: "正在刷新上游",
          detail: step.label,
          progress: Math.min(0.12 + (index / commands.length) * 0.72, 0.88),
          currentStep: index + 1,
          totalSteps: commands.length,
          stepLabel: step.label
        });

        const result = await deps.runCli(step.command, normalized);
        steps.push({ command: step.command, label: step.label, ...result });
        if (!result.ok) {
          deps.emitWorkflowProgress({
            action,
            state: "error",
            title: "上游刷新失败",
            detail: step.label,
            progress: Math.min(0.12 + ((index + 1) / commands.length) * 0.72, 0.9),
            currentStep: index + 1,
            totalSteps: commands.length,
            stepLabel: step.label
          });
          return { ok: false, action, steps };
        }
        if (step.command === "select-best-brief") {
          deps.syncActiveBriefFromBest(normalized.date, { clearDraft: true });
          deps.invalidateTemplateGallery(normalized.date, "今日最佳 brief 已更新，需要重新生成 3 张图片。");
        }
      }

      deps.emitWorkflowProgress({
        action,
        state: "success",
        title: "上游已刷新",
        detail: "热点、brief 和图片资产都已经更新。",
        progress: 1,
        currentStep: commands.length,
        totalSteps: commands.length,
        stepLabel: "全部完成"
      });
      return { ok: true, action, steps };
    }

    if (action === "run-desktop-automation") {
      return runDesktopAutomationSequence({
        product: normalized.product,
        date: normalized.date,
        trigger: options.trigger || "manual"
      });
    }

    if (action === "run-video-automation") {
      return runVideoAutomationSequence({
        product: normalized.product,
        date: normalized.date,
        trigger: options.trigger || "manual"
      });
    }

    if (action === "run-daily") {
      deps.emitWorkflowProgress({
        action,
        state: "running",
        title: "正在运行今日流程",
        detail: "整条内容工作流正在执行。",
        progress: 0.24,
        indeterminate: true,
        currentStep: 1,
        totalSteps: 1,
        stepLabel: "运行今日流程"
      });
      const result = {
        action,
        ...(await deps.runCli("run-daily", normalized))
      };
      if (result.ok) {
        deps.syncActiveBriefFromBest(normalized.date, { clearDraft: true });
        deps.invalidateTemplateGallery(normalized.date, "今日流程已更新，需要重新生成 3 张图片。");
        const downstreamResult = await rebuildDownstreamAssetsForBrief(normalized.date, normalized.product);
        result.downstream = downstreamResult;
        result.ok = result.ok && downstreamResult.ok;
      }
      deps.emitWorkflowProgress({
        action,
        state: result.ok ? "success" : "error",
        title: result.ok ? "今日流程已完成" : "今日流程执行失败",
        detail: result.ok ? "可以继续查看产物或进入下一步。" : "请检查日志输出。",
        progress: result.ok ? 1 : 0.92,
        indeterminate: false,
        currentStep: 1,
        totalSteps: 1,
        stepLabel: result.ok ? "已完成" : "执行失败"
      });
      return result;
    }

    if (action === "execute-publish" || action === "execute-xiaohongshu" || action === "execute-douyin") {
      if (deps.getActiveAutomationRun()) {
        return {
          ok: false,
          action,
          stdout: "",
          stderr: automationBusyStderr(deps.getActiveAutomationRun()),
          parsed: null
        };
      }
      const dashboard = await deps.loadDashboard();
      const publishImages = deps.collectPublishImages(dashboard.templateGallery);
      const accountSummary = dashboard.accounts?.summary || {
        xiaohongshu: { enabled: 0 },
        douyin: { enabled: 0 }
      };
      if (publishImages.length < 3) {
        deps.emitWorkflowProgress({
          action,
          state: "error",
          title: "发布条件不足",
          detail: "当前还没有 3 张已生成图片，先完成模板页三图生成再发布。",
          progress: 1,
          currentStep: 1,
          totalSteps: 1,
          stepLabel: "缺少发布图片"
        });
        return {
          ok: false,
          action,
          stdout: "",
          stderr: "Need 3 generated template images before publishing.",
          parsed: null
        };
      }
      if (action === "execute-xiaohongshu" && accountSummary.xiaohongshu.enabled === 0) {
        deps.emitWorkflowProgress({
          action,
          state: "error",
          title: "小红书账号未配置",
          detail: "先到账号管理里登录并启用至少一个小红书账号。",
          progress: 1,
          currentStep: 1,
          totalSteps: 1,
          stepLabel: "缺少已启用账号"
        });
        return {
          ok: false,
          action,
          stdout: "",
          stderr: "No enabled Xiaohongshu accounts.",
          parsed: null
        };
      }
      if (action === "execute-douyin" && accountSummary.douyin.enabled === 0) {
        deps.emitWorkflowProgress({
          action,
          state: "error",
          title: "抖音账号未配置",
          detail: "先到账号管理里登录并启用至少一个抖音账号。",
          progress: 1,
          currentStep: 1,
          totalSteps: 1,
          stepLabel: "缺少已启用账号"
        });
        return {
          ok: false,
          action,
          stdout: "",
          stderr: "No enabled Douyin accounts.",
          parsed: null
        };
      }
      if (action === "execute-publish" && accountSummary.xiaohongshu.enabled === 0 && accountSummary.douyin.enabled === 0) {
        deps.emitWorkflowProgress({
          action,
          state: "error",
          title: "发布账号未配置",
          detail: "当前两个平台都没有已启用账号，先到账号管理里完成登录。",
          progress: 1,
          currentStep: 1,
          totalSteps: 1,
          stepLabel: "缺少已启用账号"
        });
        return {
          ok: false,
          action,
          stdout: "",
          stderr: "No enabled publish accounts.",
          parsed: null
        };
      }

      const scopeByAction = {
        "execute-publish": "publish",
        "execute-xiaohongshu": "xiaohongshu",
        "execute-douyin": "douyin"
      };
      const titleByAction = {
        "execute-publish": "正在双平台发布",
        "execute-xiaohongshu": "正在发布到小红书",
        "execute-douyin": "正在发布到抖音"
      };
      deps.emitWorkflowProgress({
        action,
        state: "running",
        title: titleByAction[action],
        detail: "会使用模板页生成的 3 张图片一起发布。",
        progress: 0.28,
        indeterminate: true,
        currentStep: 1,
        totalSteps: 1,
        stepLabel: "提交发布任务"
      });
      const rawResult = await deps.runCli("execute-adapters", {
        ...normalized,
        scope: scopeByAction[action]
      });
      const publishError = resolvePublishExecutionError(rawResult, scopeByAction[action]);
      const result = {
        action,
        ...rawResult,
        ok: rawResult.ok && !publishError,
        stderr: publishError || rawResult.stderr
      };
      deps.emitWorkflowProgress({
        action,
        state: result.ok ? "success" : "error",
        title: result.ok ? "发布任务已完成" : "发布任务失败",
        detail: result.ok ? "已按模板页 3 张图片完成本轮发布。" : "请检查执行日志和平台状态。",
        progress: result.ok ? 1 : 0.92,
        indeterminate: false,
        currentStep: 1,
        totalSteps: 1,
        stepLabel: result.ok ? "发布完成" : "发布失败",
        result
      });
      return result;
    }

    if (action === "execute-video-publish" || action === "execute-video-xiaohongshu" || action === "execute-video-douyin") {
      if (deps.getActiveAutomationRun()) {
        return {
          ok: false,
          action,
          stdout: "",
          stderr: automationBusyStderr(deps.getActiveAutomationRun()),
          parsed: null
        };
      }
      if (deps.getActiveVideoTask()) {
        return {
          ok: false,
          action,
          stdout: "",
          stderr: "视频生成任务仍在运行中。",
          parsed: null
        };
      }

      const dashboard = await deps.loadDashboard();
      const videoItem = dashboard.videoGallery?.item || {};
      const videoPath = String(videoItem.videoPath || "").trim();
      const accountSummary = dashboard.accounts?.summary || {
        xiaohongshu: { enabled: 0 },
        douyin: { enabled: 0 }
      };
      if (!videoPath || videoItem.status !== "completed") {
        deps.emitWorkflowProgress({
          action,
          state: "error",
          title: "视频发布条件不足",
          detail: "先完成视频生成并确认 mp4 已经落盘，再继续发布。",
          progress: 1,
          currentStep: 1,
          totalSteps: 1,
          stepLabel: "缺少可发布视频"
        });
        return {
          ok: false,
          action,
          stdout: "",
          stderr: "Need a completed generated video before publishing.",
          parsed: null
        };
      }
      if (action === "execute-video-xiaohongshu" && accountSummary.xiaohongshu.enabled === 0) {
        deps.emitWorkflowProgress({
          action,
          state: "error",
          title: "小红书账号未配置",
          detail: "先到账号管理里启用至少一个小红书账号，再发布视频。",
          progress: 1,
          currentStep: 1,
          totalSteps: 1,
          stepLabel: "缺少已启用账号"
        });
        return {
          ok: false,
          action,
          stdout: "",
          stderr: "No enabled Xiaohongshu accounts for video publishing.",
          parsed: null
        };
      }
      if (action === "execute-video-douyin" && accountSummary.douyin.enabled === 0) {
        deps.emitWorkflowProgress({
          action,
          state: "error",
          title: "抖音账号未配置",
          detail: "先到账号管理里启用至少一个抖音账号，再发布视频。",
          progress: 1,
          currentStep: 1,
          totalSteps: 1,
          stepLabel: "缺少已启用账号"
        });
        return {
          ok: false,
          action,
          stdout: "",
          stderr: "No enabled Douyin accounts for video publishing.",
          parsed: null
        };
      }
      if (action === "execute-video-publish" && accountSummary.xiaohongshu.enabled === 0 && accountSummary.douyin.enabled === 0) {
        deps.emitWorkflowProgress({
          action,
          state: "error",
          title: "视频发布账号未配置",
          detail: "当前没有可用的视频发布账号，先完成账号登录与启用。",
          progress: 1,
          currentStep: 1,
          totalSteps: 1,
          stepLabel: "缺少已启用账号"
        });
        return {
          ok: false,
          action,
          stdout: "",
          stderr: "当前没有已启用的视频发布账号。",
          parsed: null
        };
      }

      const scopeByAction = {
        "execute-video-publish": "video_publish",
        "execute-video-xiaohongshu": "video_xiaohongshu",
        "execute-video-douyin": "video_douyin"
      };
      const titleByAction = {
        "execute-video-publish": "正在双平台发布视频",
        "execute-video-xiaohongshu": "正在发布视频到小红书",
        "execute-video-douyin": "正在发布视频到抖音"
      };
      deps.emitWorkflowProgress({
        action,
        state: "running",
        title: titleByAction[action],
        detail: "会使用当前已生成的 mp4 和模板文案继续执行视频发布。",
        progress: 0.28,
        indeterminate: true,
        currentStep: 1,
        totalSteps: 1,
        stepLabel: "提交视频发布任务"
      });
      const rawResult = await deps.runCli("execute-adapters", {
        ...normalized,
        scope: scopeByAction[action]
      });
      const publishError = resolvePublishExecutionError(rawResult, scopeByAction[action]);
      const result = {
        action,
        ...rawResult,
        ok: rawResult.ok && !publishError,
        stderr: publishError || rawResult.stderr
      };

      const artifacts = deps.currentArtifacts(normalized.date);
      const currentState = deps.readJsonSafe(artifacts.videoPublishState) || {};
      const nextState = defaultVideoPublishState(normalized.date, dashboard, currentState);
      const scopeKeys = {
        video_publish: ["video_xiaohongshu", "video_douyin"],
        video_xiaohongshu: ["video_xiaohongshu"],
        video_douyin: ["video_douyin"]
      };
      for (const resultKey of scopeKeys[scopeByAction[action]] || []) {
        const platformKey = resultKey.includes("xiaohongshu") ? "xiaohongshu" : "douyin";
        const platformResult = rawResult?.parsed?.results?.[resultKey];
        if (!platformResult) continue;
        nextState.platforms[platformKey] = platformStateFromExecution(platformResult, result.stderr, videoPath);
      }
      nextState.updatedAt = new Date().toISOString();
      deps.writeJsonSafe(artifacts.videoPublishState, nextState);

      deps.emitWorkflowProgress({
        action,
        state: result.ok ? "success" : "error",
        title: result.ok ? "视频发布任务已完成" : "视频发布任务失败",
        detail: result.ok ? "当前视频已按模板文案完成本轮发布。" : "请检查执行日志和平台状态。",
        progress: result.ok ? 1 : 0.92,
        indeterminate: false,
        currentStep: 1,
        totalSteps: 1,
        stepLabel: result.ok ? "发布完成" : "发布失败",
        result
      });
      return result;
    }

    if (action === "execute-video" || action === "execute-video-regenerate") {
      if (deps.getActiveAutomationRun()) {
        return {
          ok: false,
          action,
          stdout: "",
          stderr: automationBusyStderr(deps.getActiveAutomationRun()),
          parsed: null
        };
      }
      if (deps.getActiveVideoTask()) {
        const activeVideoTask = deps.getActiveVideoTask();
        const elapsed = deps.formatElapsed(Date.now() - activeVideoTask.startedAt);
        deps.emitWorkflowProgress({
          action,
          state: "running",
          title: "视频任务仍在执行",
          detail: `上一轮视频生成还没结束，已等待 ${elapsed}。`,
          progress: 0.42,
          indeterminate: true,
          currentStep: 1,
          totalSteps: 1,
          stepLabel: "等待当前视频任务"
        });
        return {
          ok: true,
          busy: true,
          background: true,
          action,
          stdout: `视频任务仍在后台执行，已等待 ${elapsed}。`,
          stderr: "",
          parsed: null
        };
      }

      const artifacts = deps.currentArtifacts(normalized.date);
      resetVideoPublishState(deps, normalized.date);
      const runningState = {
        date: normalized.date,
        status: "running",
        provider: "dreamina-multimodal2video",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        videoPath: null,
        error: null,
        douyinNoteText: null,
        douyinNotePath: null,
        xiaohongshuBody: null,
        xiaohongshuBodyPath: null
      };
      deps.writeJsonSafe(artifacts.videoGenerationState, runningState);
      deps.writeJsonSafe(artifacts.videoGallery, {
        date: normalized.date,
        status: "running",
        updatedAt: new Date().toISOString(),
          item: {
            status: "running",
            provider: "dreamina-multimodal2video",
            videoPath: null,
            generatedAt: null,
            submitId: null,
            promptPath: null,
            referenceImages: [],
            error: null,
            douyinNoteText: null,
            douyinNotePath: null,
            xiaohongshuBody: null,
            xiaohongshuBodyPath: null
          }
        });

      const taskMeta = {
        startedAt: Date.now(),
        heartbeat: null
      };
      deps.setActiveVideoTask(taskMeta);
      deps.emitWorkflowProgress({
        action,
        state: "running",
        title: "正在提交视频任务",
        detail: "即梦全能参考视频任务已开始，会用设备图前 4 张作为参考。",
        progress: 0.16,
        indeterminate: true,
        currentStep: 1,
        totalSteps: 1,
        stepLabel: "提交视频任务"
      });

      taskMeta.heartbeat = setInterval(() => {
        if (deps.getActiveVideoTask() !== taskMeta) return;
        const elapsed = deps.formatElapsed(Date.now() - taskMeta.startedAt);
        deps.emitWorkflowProgress({
          action,
          state: "running",
          title: "视频生成中",
          detail: `正在等待 Dreamina 生成并下载视频，已等待 ${elapsed}。`,
          progress: 0.56,
          indeterminate: true,
          currentStep: 1,
          totalSteps: 1,
          stepLabel: "轮询视频结果"
        });
      }, 3000);

      void (async () => {
        try {
          const rawResult = await deps.runCli("execute-adapters", {
            ...normalized,
            scope: "video"
          });
          const resolvedVideo = resolveVideoExecution(rawResult);
          const result = {
            ...rawResult,
            ok: resolvedVideo.ok,
            stderr: resolvedVideo.ok ? rawResult.stderr : (resolvedVideo.error || rawResult.stderr)
          };
          const videoResult = resolvedVideo.videoResult;
          const nextStatus = resolvedVideo.ok ? "completed" : "failed";
          const generatedAt = resolvedVideo.ok ? (videoResult?.finished_at || new Date().toISOString()) : null;
          const payload = {
            date: normalized.date,
            status: nextStatus,
            provider: videoResult?.adapter || "dreamina-multimodal2video",
            updatedAt: new Date().toISOString(),
            generatedAt,
            submitId: videoResult?.submit_id || null,
            videoPath: resolvedVideo.downloadPath,
            promptPath: videoResult?.prompt_path || resolvedVideo.promptResult?.prompt_path || null,
            templateId: videoResult?.template_id || null,
            templateName: videoResult?.template_name || null,
            templateVideoPath: videoResult?.template_video_path || null,
            referenceVideos: Array.isArray(videoResult?.reference_videos) ? videoResult.reference_videos : [],
            deviceReferenceImages: Array.isArray(videoResult?.device_reference_images) ? videoResult.device_reference_images : [],
            hairColorReferenceImage: videoResult?.hair_color_reference_image || null,
            hairColorName: videoResult?.hair_color_name || null,
            douyinNoteText: videoResult?.douyin_note_text || null,
            douyinNotePath: videoResult?.douyin_note_path || null,
            xiaohongshuBody: videoResult?.xiaohongshu_body || null,
            xiaohongshuBodyPath: videoResult?.xiaohongshu_body_path || null,
            videoOutputDir: videoResult?.video_output_dir || videoResult?.downloads_dir || null,
            referenceImages: Array.isArray(videoResult?.reference_images) ? videoResult.reference_images : [],
            modelVersion: videoResult?.model_version || null,
            duration: videoResult?.duration || null,
            ratio: videoResult?.ratio || null,
            videoResolution: videoResult?.video_resolution || null,
            error: resolvedVideo.ok ? null : (videoResult?.stderr_tail || result.stderr || "视频生成失败")
          };
          deps.writeJsonSafe(artifacts.videoGenerationState, payload);
          deps.writeJsonSafe(artifacts.videoGallery, {
            date: normalized.date,
            status: nextStatus,
            updatedAt: payload.updatedAt,
            item: {
              status: nextStatus,
              provider: payload.provider,
              videoPath: payload.videoPath,
              generatedAt: payload.generatedAt,
              submitId: payload.submitId,
              promptPath: payload.promptPath,
              templateId: payload.templateId,
              templateName: payload.templateName,
              templateVideoPath: payload.templateVideoPath,
              referenceVideos: payload.referenceVideos,
              deviceReferenceImages: payload.deviceReferenceImages,
              hairColorReferenceImage: payload.hairColorReferenceImage,
              hairColorName: payload.hairColorName,
              douyinNoteText: payload.douyinNoteText,
              douyinNotePath: payload.douyinNotePath,
              xiaohongshuBody: payload.xiaohongshuBody,
              xiaohongshuBodyPath: payload.xiaohongshuBodyPath,
              videoOutputDir: payload.videoOutputDir,
              referenceImages: payload.referenceImages,
              modelVersion: payload.modelVersion,
              duration: payload.duration,
              ratio: payload.ratio,
              videoResolution: payload.videoResolution,
              error: payload.error
            }
          });
          deps.emitWorkflowProgress({
            action,
            state: resolvedVideo.ok ? "success" : "error",
            title: resolvedVideo.ok ? "视频生成已完成" : "视频生成失败",
            detail: resolvedVideo.ok ? "视频已下载到本地，可以在视频卡片里打开。" : payload.error,
            progress: 1,
            indeterminate: false,
            currentStep: 1,
            totalSteps: 1,
            stepLabel: resolvedVideo.ok ? "视频完成" : "视频失败",
            result
          });
        } catch (error) {
          const failedPayload = {
            date: normalized.date,
            status: "failed",
            provider: "dreamina-multimodal2video",
            updatedAt: new Date().toISOString(),
            videoPath: null,
            error: error?.message || "Video generation failed."
          };
          deps.writeJsonSafe(artifacts.videoGenerationState, failedPayload);
          deps.writeJsonSafe(artifacts.videoGallery, {
            date: normalized.date,
            status: "failed",
            updatedAt: failedPayload.updatedAt,
            item: {
              status: "failed",
              provider: failedPayload.provider,
              videoPath: null,
              generatedAt: null,
              submitId: null,
              promptPath: null,
              referenceImages: [],
              error: failedPayload.error
            }
          });
          deps.emitWorkflowProgress({
            action,
            state: "error",
            title: "视频生成失败",
            detail: failedPayload.error,
            progress: 0.92,
            indeterminate: false,
            currentStep: 1,
            totalSteps: 1,
            stepLabel: "执行失败",
            result: {
              ok: false,
              action,
              stdout: "",
              stderr: failedPayload.error,
              parsed: null
            }
          });
        } finally {
          if (taskMeta.heartbeat) clearInterval(taskMeta.heartbeat);
          deps.setActiveVideoTask(null);
        }
      })();

      return {
        ok: true,
        action,
        background: true,
        stdout: "Video generation started in background.",
        stderr: "",
        parsed: null
      };
    }

    if (action === "execute-image") {
      if (deps.getActiveAutomationRun()) {
        deps.emitWorkflowProgress({
          action,
          state: "error",
          title: "自动化正在执行",
          detail: "本地自动化还没结束，先不要手动启动新的图片任务。",
          progress: 1,
          currentStep: 1,
          totalSteps: 1,
          stepLabel: "等待自动化完成"
        });
        return {
          ok: false,
          action,
          stdout: "",
          stderr: automationBusyStderr(deps.getActiveAutomationRun()),
          parsed: null
        };
      }
      if (deps.getActiveImageTask()) {
        const activeImageTask = deps.getActiveImageTask();
        const elapsed = deps.formatElapsed(Date.now() - activeImageTask.startedAt);
        deps.emitWorkflowProgress({
          action,
          state: "running",
          title: "图片任务仍在执行",
          detail: `上一轮图片生成还没结束，已等待 ${elapsed}。`,
          progress: 0.34,
          indeterminate: true,
          currentStep: 1,
          totalSteps: 1,
          stepLabel: "等待当前任务"
        });
        return {
          ok: true,
          busy: true,
          background: true,
          action,
          stdout: `图片任务仍在后台执行，已等待 ${elapsed}。`,
          stderr: "",
          parsed: null
        };
      }

      const selectionPath = deps.currentArtifacts(normalized.date).templateSelection;
      const galleryPath = deps.currentArtifacts(normalized.date).templateGallery;
      const selection = deps.normalizeTemplateSelection(deps.readJsonSafe(selectionPath), templateCatalog);
      const existingGallery = deps.normalizeTemplateGallery(
        deps.readJsonSafe(galleryPath),
        selection,
        templateCatalog,
        deps.readJsonSafe(deps.currentArtifacts(normalized.date).prompt),
        deps.readJsonSafe(deps.currentArtifacts(normalized.date).execution)
      );
      const targetSlots = options.slot
        ? selection.selectedTemplates.filter((item) => Number(item.slot) === Number(options.slot))
        : selection.selectedTemplates;

      if (!targetSlots.length) {
        deps.emitWorkflowProgress({
          action,
          state: "error",
          title: "图片生成失败",
          detail: "当前没有可生成的模板槽位。",
          progress: 1,
          currentStep: 1,
          totalSteps: 1,
          stepLabel: "无可用模板"
        });
        return {
          ok: false,
          action,
          stdout: "",
          stderr: "No template slots available for image generation.",
          parsed: null
        };
      }

      const taskMeta = {
        startedAt: Date.now(),
        heartbeat: null,
        selection,
        targetSlots
      };

      deps.emitWorkflowProgress({
        action,
        state: "running",
        title: "正在提交图片任务",
        detail: "任务提交后会在后台继续执行，并自动更新结果。",
        progress: 0.16,
        indeterminate: true,
        currentStep: 1,
        totalSteps: 1,
        stepLabel: "提交图片任务"
      });
      deps.setActiveImageTask(taskMeta);
      const pendingGallery = {
        ...existingGallery,
        date: normalized.date,
        items: existingGallery.items.map((item) => {
          const target = targetSlots.find((entry) => Number(entry.slot) === Number(item.slot));
          if (!target) return item;
          return {
            ...item,
            status: "running",
            imagePath: null,
            generatedAt: null,
            submitId: null,
            promptPath: null,
            error: null
          };
        })
      };
      deps.writeTemplateGallery(normalized.date, pendingGallery);

      taskMeta.heartbeat = setInterval(() => {
        if (deps.getActiveImageTask() !== taskMeta) return;
        const elapsed = deps.formatElapsed(Date.now() - taskMeta.startedAt);
        const runningSlot = taskMeta.currentSlot;
        const runningLabel = runningSlot ? `模板 ${runningSlot.slot} · ${runningSlot.templateId}` : "模板队列";
        deps.emitWorkflowProgress({
          action,
          state: "running",
          title: "图片生成中",
          detail: `正在等待 ${runningLabel} 生成和下载完成，已等待 ${elapsed}。`,
          progress: 0.52,
          indeterminate: true,
          currentStep: taskMeta.currentIndex || 1,
          totalSteps: targetSlots.length,
          stepLabel: runningSlot ? `处理模板 ${runningSlot.slot}` : "后台轮询生成结果"
        });
      }, 3000);

      void (async () => {
        const taskResults = [];
        try {
          deps.emitWorkflowProgress({
            action,
            state: "running",
            title: "图片生成中",
            detail: `已提交 ${targetSlots.length} 个模板槽位，后台会依次完成生成和下载。`,
            progress: 0.18,
            indeterminate: false,
            currentStep: 1,
            totalSteps: targetSlots.length,
            stepLabel: "准备开始"
          });

          let galleryState = pendingGallery;
          const failedSlots = [];
          for (const [index, slotEntry] of targetSlots.entries()) {
            taskMeta.currentSlot = slotEntry;
            taskMeta.currentIndex = index + 1;
            deps.emitWorkflowProgress({
              action,
              state: "running",
              title: "图片生成中",
              detail: `正在生成模板 ${slotEntry.slot}：${slotEntry.templateId}。`,
              progress: Math.min(0.2 + (index / Math.max(targetSlots.length, 1)) * 0.6, 0.82),
              indeterminate: false,
              currentStep: index + 1,
              totalSteps: targetSlots.length,
              stepLabel: `模板 ${slotEntry.slot} 开始生成`
            });

            const rawResult = await deps.runCli("execute-adapters", {
              ...normalized,
              scope: "image",
              slot: slotEntry.slot,
              templateId: slotEntry.templateId
            });
            const resolvedImage = resolveImageExecution(rawResult);
            const result = {
              ...rawResult,
              ok: resolvedImage.ok,
              stderr: resolvedImage.ok ? rawResult.stderr : (resolvedImage.error || rawResult.stderr)
            };
            taskResults.push({ slot: slotEntry.slot, templateId: slotEntry.templateId, ...result });
            const imageResult = resolvedImage.imageResult;
            const promptResult = resolvedImage.promptResult;
            const downloadPath = resolvedImage.downloadPath;

            galleryState = {
              ...galleryState,
              items: galleryState.items.map((item) => {
                if (Number(item.slot) !== Number(slotEntry.slot)) return item;
                return {
                  ...item,
                  status: result.ok ? "completed" : "error",
                  imagePath: downloadPath,
                  generatedAt: result.ok ? (imageResult?.finished_at || new Date().toISOString()) : item.generatedAt,
                  submitId: imageResult?.submit_id || null,
                  promptPath: promptResult?.prompt_path || null,
                  error: result.ok ? null : (imageResult?.stderr_tail || result.stderr || "生成失败")
                };
              })
            };
            deps.writeTemplateGallery(normalized.date, galleryState);

            if (!result.ok) {
              failedSlots.push({
                slot: slotEntry.slot,
                templateId: slotEntry.templateId,
                error: imageResult?.stderr_tail || result.stderr || "生成失败"
              });
              deps.emitWorkflowProgress({
                action,
                state: "running",
                title: "图片生成中",
                detail: `模板 ${slotEntry.slot} 生成失败，继续处理剩余图片。`,
                progress: Math.min(0.24 + ((index + 1) / Math.max(targetSlots.length, 1)) * 0.58, 0.9),
                indeterminate: false,
                currentStep: index + 1,
                totalSteps: targetSlots.length,
                stepLabel: `模板 ${slotEntry.slot} 失败，继续下一张`
              });
              continue;
            }
          }

          const completedCount = targetSlots.length - failedSlots.length;
          const allFailed = failedSlots.length === targetSlots.length;
          const detail = allFailed
            ? "本轮 3 张图片都失败了，请检查日志后重试。"
            : failedSlots.length
              ? `已完成 ${completedCount}/${targetSlots.length}，其余失败项可以单独重生成。`
              : options.slot
                ? `模板 ${options.slot} 的图片已经生成并下载完成。`
                : `${targetSlots.length} 张模板图已经全部生成并下载完成。`;

          deps.emitWorkflowProgress({
            action,
            state: allFailed ? "error" : "success",
            title: allFailed ? "图片生成失败" : (failedSlots.length ? "图片已部分完成" : "图片生成已完成"),
            detail,
            progress: 1,
            indeterminate: false,
            currentStep: targetSlots.length,
            totalSteps: targetSlots.length,
            stepLabel: "全部完成",
            result: {
              ok: !allFailed,
              action,
              partial: failedSlots.length > 0 && !allFailed,
              failures: failedSlots,
              steps: taskResults,
              parsed: { gallery: galleryState }
            }
          });
        } catch (error) {
          const failedSlot = error?.slotEntry;
          const failedResult = error?.result;
          deps.emitWorkflowProgress({
            action,
            state: "error",
            title: "图片生成失败",
            detail: failedSlot
              ? `模板 ${failedSlot.slot} 生成失败，请检查日志后重试。`
              : "图片生成过程中出现错误。",
            progress: 0.92,
            indeterminate: false,
            currentStep: taskMeta.currentIndex || 1,
            totalSteps: targetSlots.length,
            stepLabel: failedSlot ? `模板 ${failedSlot.slot} 失败` : "执行失败",
            result: failedResult || {
              ok: false,
              action,
              stdout: "",
              stderr: error?.message || "Image generation failed.",
              parsed: null
            }
          });
        } finally {
          if (taskMeta.heartbeat) clearInterval(taskMeta.heartbeat);
          deps.setActiveImageTask(null);
        }
      })();

      return {
        ok: true,
        action,
        background: true,
        stdout: "Image generation started in background.",
        stderr: "",
        parsed: null
      };
    }

    return {
      ok: false,
      action,
      code: -1,
      stdout: "",
      stderr: `Unsupported workflow action: ${action}`,
      parsed: null
    };
  }

  return {
    rebuildDownstreamAssetsForBrief,
    runDesktopAutomationSequence,
    runVideoAutomationSequence,
    runWorkflowAction
  };
}

module.exports = {
  createWorkflowOrchestrator
};
