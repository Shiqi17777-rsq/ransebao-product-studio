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
      trigger: options.trigger || "manual"
    };

    if (deps.getActiveAutomationRun() || deps.getActiveImageTask()) {
      return {
        ok: false,
        action: "run-desktop-automation",
        stdout: "",
        stderr: deps.getActiveAutomationRun()
          ? "Desktop automation is already running."
          : "An image generation task is still running.",
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

        const result = await deps.runCli("execute-adapters", {
          ...normalized,
          scope: "image",
          slot: slotEntry.slot,
          templateId: slotEntry.templateId
        });
        imageSteps.push({ slot: slotEntry.slot, templateId: slotEntry.templateId, ...result });

        const imageResult = result?.parsed?.results?.image || {};
        const promptResult = result?.parsed?.prompt_result || {};
        const downloadPath = imageResult?.download_paths?.[0] || null;
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

      const publishResult = await deps.runCli("execute-adapters", {
        ...normalized,
        scope: "publish"
      });
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
          stderr: "Desktop automation is currently running.",
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
      const result = {
        action,
        ...(await deps.runCli("execute-adapters", {
          ...normalized,
          scope: scopeByAction[action]
        }))
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
          stderr: "Desktop automation is currently running.",
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

            const result = await deps.runCli("execute-adapters", {
              ...normalized,
              scope: "image",
              slot: slotEntry.slot,
              templateId: slotEntry.templateId
            });
            taskResults.push({ slot: slotEntry.slot, templateId: slotEntry.templateId, ...result });
            const imageResult = result?.parsed?.results?.image || {};
            const promptResult = result?.parsed?.prompt_result || {};
            const downloadPath = imageResult?.download_paths?.[0] || null;

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
    runWorkflowAction
  };
}

module.exports = {
  createWorkflowOrchestrator
};
