const path = require("path");
const fs = require("fs");

function deriveUpstreamState(hotPool, router, brandPool, briefs) {
  const routerItems = Array.isArray(router?.items) ? router.items : [];
  const brandItems = Array.isArray(brandPool?.items) ? brandPool.items : [];
  const hotItems = Array.isArray(hotPool?.items) ? hotPool.items : [];
  const hotCandidates = routerItems.filter((item) => item?.source_mode !== "品牌常规");
  const fallbackBrandItems = routerItems.filter((item) => item?.source_mode === "品牌常规");

  return {
    routeMode: router?.route_mode || null,
    hotCandidateCount: hotPool?.hot_count ?? router?.hot_candidate_count ?? hotCandidates.length,
    brandCandidateCount: brandPool?.count ?? router?.brand_candidate_count ?? brandItems.length,
    briefCount: briefs?.count ?? 0,
    hotCandidates: (hotItems.length ? hotItems : hotCandidates).slice(0, 5),
    brandCandidates: (brandItems.length ? brandItems : fallbackBrandItems).slice(0, 5)
  };
}

function existingFilePath(value = "") {
  const candidate = String(value || "").trim();
  if (!candidate) return null;
  try {
    return fs.statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

function collectReferenceImages(imageDir, limit = 4) {
  const root = String(imageDir || "").trim();
  if (!root) return [];
  try {
    const allowed = new Set([".png", ".jpg", ".jpeg", ".webp"]);
    return fs.readdirSync(root)
      .sort()
      .map((name) => path.join(root, name))
      .filter((candidate) => {
        try {
          return fs.statSync(candidate).isFile() && allowed.has(path.extname(candidate).toLowerCase());
        } catch {
          return false;
        }
      })
      .slice(0, limit);
  } catch {
    return [];
  }
}

function existingImagePath(value = "") {
  const candidate = existingFilePath(value);
  if (!candidate) return null;
  return [".png", ".jpg", ".jpeg", ".webp"].includes(path.extname(candidate).toLowerCase()) ? candidate : null;
}

function normalizeVideoTemplateDuration(value, fallback = 15) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : fallback;
}

function resolveImportedTemplateFile(templateDir, value, fallbackName) {
  const configured = String(value || "").trim();
  const candidates = [
    configured,
    fallbackName ? path.join(templateDir, fallbackName) : ""
  ].filter(Boolean);
  for (const candidate of candidates) {
    const resolved = existingFilePath(candidate);
    if (resolved) return resolved;
  }
  return null;
}

function normalizeImportedVideoTemplate(templateDir, payload = {}) {
  const id = String(payload?.id || path.basename(templateDir) || "").trim();
  if (!/^local-[a-z0-9-]+$/.test(id)) return null;
  const templateVideoPath = resolveImportedTemplateFile(
    templateDir,
    payload.templateVideoPath || payload.template_video_path || payload.template_video,
    "template.mp4"
  );
  const promptTemplatePath = resolveImportedTemplateFile(
    templateDir,
    payload.promptTemplatePath || payload.prompt_template_path || payload.prompt_template,
    "prompt_template.txt"
  );
  if (!templateVideoPath || !promptTemplatePath) return null;
  if (path.extname(templateVideoPath).toLowerCase() !== ".mp4") return null;

  return {
    id,
    source: "local_import",
    name: String(payload?.name || id),
    description: String(payload?.description || ""),
    templateVideoPath,
    promptTemplatePath,
    douyinNoteTemplatePath: resolveImportedTemplateFile(
      templateDir,
      payload.douyinNoteTemplatePath || payload.douyin_note_template_path || payload.douyin_note_template,
      "douyin_note_template.txt"
    ),
    xiaohongshuBodyTemplatePath: resolveImportedTemplateFile(
      templateDir,
      payload.xiaohongshuBodyTemplatePath ||
        payload.xiaohongshu_body_template_path ||
        payload.xiaohongshu_body_template,
      "xiaohongshu_body_template.txt"
    ),
    modelVersion: String(payload?.modelVersion || payload?.model_version || "seedance2.0_vip"),
    duration: normalizeVideoTemplateDuration(payload?.duration, 15),
    ratio: String(payload?.ratio || "16:9"),
    videoResolution: String(payload?.videoResolution || payload?.video_resolution || "720p")
  };
}

function loadImportedVideoTemplates(runtimeRoot) {
  const root = path.join(String(runtimeRoot || ""), "assets", "video-templates");
  try {
    if (!fs.statSync(root).isDirectory()) return [];
  } catch {
    return [];
  }
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const templateDir = path.join(root, entry.name);
        const templateJsonPath = path.join(templateDir, "template.json");
        try {
          const payload = JSON.parse(fs.readFileSync(templateJsonPath, "utf8"));
          return normalizeImportedVideoTemplate(templateDir, payload);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function loadVideoTemplateCatalog(productStudioRoot, runtimeRoot) {
  const catalogPath = path.join(productStudioRoot, "products", "ransebao", "assets", "video-templates", "catalog.json");
  try {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    const root = path.dirname(catalogPath);
    const templates = Array.isArray(catalog?.templates) ? catalog.templates : [];
    const builtInTemplates = templates.map((template) => {
      const templateVideoPath = existingFilePath(path.join(root, String(template?.template_video || "")));
      return {
        id: String(template?.id || ""),
        source: "built_in",
        name: String(template?.name || template?.id || ""),
        description: String(template?.description || ""),
        templateVideoPath,
        modelVersion: String(template?.model_version || "seedance2.0_vip"),
        duration: normalizeVideoTemplateDuration(template?.duration, 15),
        ratio: String(template?.ratio || "16:9"),
        videoResolution: String(template?.video_resolution || "720p")
      };
    }).filter((template) => template.id);
    const importedTemplates = loadImportedVideoTemplates(runtimeRoot).filter(
      (template) => !builtInTemplates.some((entry) => entry.id === template.id)
    );
    return {
      defaultTemplateId: String(catalog?.default_template || templates[0]?.id || "beauty-hair-transformation"),
      templates: [...builtInTemplates, ...importedTemplates]
    };
  } catch {
    const importedTemplates = loadImportedVideoTemplates(runtimeRoot);
    return {
      defaultTemplateId: importedTemplates[0]?.id || "beauty-hair-transformation",
      templates: importedTemplates
    };
  }
}

function normalizeVideoGallery(gallery, generationState, localConfigSummary) {
  const item = gallery?.item || {};
  const videoPath = existingFilePath(item.videoPath || generationState?.videoPath);
  const status = item.status || generationState?.status || "pending";
  return {
    date: gallery?.date || generationState?.date || null,
    status: videoPath && status === "completed" ? "completed" : status,
    updatedAt: gallery?.updatedAt || generationState?.updatedAt || null,
    item: {
      status: videoPath ? "completed" : status,
      videoPath,
      generatedAt: item.generatedAt || generationState?.generatedAt || null,
      submitId: item.submitId || generationState?.submitId || null,
      promptPath: item.promptPath || generationState?.promptPath || null,
      error: item.error || generationState?.error || null,
      provider: item.provider || generationState?.provider || "dreamina-multimodal2video",
      templateId: item.templateId || generationState?.templateId || null,
      templateName: item.templateName || generationState?.templateName || null,
      templateVideoPath: existingFilePath(item.templateVideoPath || generationState?.templateVideoPath),
      referenceVideos: item.referenceVideos || generationState?.referenceVideos || [],
      deviceReferenceImages: item.deviceReferenceImages || generationState?.deviceReferenceImages || [],
      hairColorReferenceImage: existingImagePath(item.hairColorReferenceImage || generationState?.hairColorReferenceImage),
      hairColorName: item.hairColorName || generationState?.hairColorName || null,
      douyinNoteText: item.douyinNoteText || generationState?.douyinNoteText || null,
      douyinNotePath: existingFilePath(item.douyinNotePath || generationState?.douyinNotePath),
      xiaohongshuBody: item.xiaohongshuBody || generationState?.xiaohongshuBody || null,
      xiaohongshuBodyPath: existingFilePath(item.xiaohongshuBodyPath || generationState?.xiaohongshuBodyPath),
      videoOutputDir: item.videoOutputDir || generationState?.videoOutputDir || localConfigSummary?.video?.downloadsDir || null,
      modelVersion: item.modelVersion || localConfigSummary?.video?.modelVersion || "seedance2.0_vip",
      duration: item.duration || localConfigSummary?.video?.duration || 15,
      ratio: item.ratio || localConfigSummary?.video?.ratio || "16:9",
      videoResolution: item.videoResolution || localConfigSummary?.video?.videoResolution || "720p",
      referenceImages: item.referenceImages || generationState?.referenceImages || []
    }
  };
}

function normalizeVideoPublishPlatformState(platformState, videoItem) {
  const source = platformState && typeof platformState === "object" ? platformState : {};
  return {
    status: String(source.status || "idle"),
    updatedAt: source.updatedAt || null,
    error: source.error || null,
    title: source.title || null,
    desc: source.desc || null,
    tags: source.tags || null,
    file: existingFilePath(source.file || source.videoPath || videoItem?.videoPath),
    accountResults: Array.isArray(source.accountResults) ? source.accountResults : [],
    successCount: Number(source.successCount || 0),
    accountCount: Number(source.accountCount || 0),
  };
}

function normalizeVideoPublishState(state, videoGallery) {
  const payload = state && typeof state === "object" ? state : {};
  const videoItem = videoGallery?.item || {};
  return {
    date: payload.date || videoGallery?.date || null,
    updatedAt: payload.updatedAt || null,
    videoPath: existingFilePath(payload.videoPath || videoItem.videoPath),
    templateId: payload.templateId || videoItem.templateId || null,
    templateName: payload.templateName || videoItem.templateName || null,
    hairColorName: payload.hairColorName || videoItem.hairColorName || null,
    platforms: {
      xiaohongshu: normalizeVideoPublishPlatformState(payload.platforms?.xiaohongshu, videoItem),
      douyin: normalizeVideoPublishPlatformState(payload.platforms?.douyin, videoItem),
    },
  };
}

function createDashboardLoader(deps) {
  return async function loadDashboard() {
    const date = deps.formatDate();
    const artifacts = deps.currentArtifacts(date);
    const inspect = deps.readJsonSafe(path.join(deps.productStudioRoot, "products", "ransebao", "product.json"));
    const localConfigSummary = deps.summarizeLocalRuntimeConfig();
    const dependencyReport = await deps.inspectDependencyReport(deps.readLocalRuntimeConfig());
    deps.writeJsonSafe(artifacts.dependencyReport, dependencyReport);
    const templateCatalog = deps.loadTemplateCatalog();
    const videoTemplateCatalog = loadVideoTemplateCatalog(deps.productStudioRoot, deps.runtimeRoot);
    const bestBrief = deps.readJsonSafe(artifacts.bestBrief);
    const brandPool = deps.readJsonSafe(artifacts.brandPool);
    const briefs = deps.readJsonSafe(artifacts.briefs);
    const hotPool = deps.readJsonSafe(artifacts.hotPool);
    const prompt = deps.readJsonSafe(artifacts.prompt);
    const execution = deps.readJsonSafe(artifacts.execution);
    const videoGenerationState = deps.readJsonSafe(artifacts.videoGenerationState);
    const videoGallery = normalizeVideoGallery(
      deps.readJsonSafe(artifacts.videoGallery),
      videoGenerationState,
      localConfigSummary
    );
    const videoPublishState = normalizeVideoPublishState(
      deps.readJsonSafe(artifacts.videoPublishState),
      videoGallery
    );
    const upstreamRouter = deps.readJsonSafe(artifacts.upstreamRouter);
    const briefDraft = deps.readJsonSafe(artifacts.briefDraft);
    const activeBrief = deps.readResolvedActiveBrief(date);
    const templateSelection = deps.normalizeTemplateSelection(deps.readJsonSafe(artifacts.templateSelection), templateCatalog);
    const templateGallery = deps.normalizeTemplateGallery(
      deps.readJsonSafe(artifacts.templateGallery),
      templateSelection,
      templateCatalog,
      prompt,
      execution
    );
    const publishImages = deps.collectPublishImages(templateGallery);
    const latestImage = publishImages[0] || null;
    const desktopAutomation = deps.readDesktopAutomationSettings();
    const videoAutomation = deps.readVideoAutomationSettings();
    const accountsState = deps.readPublishAccountsState();
    const environmentReport = deps.readJsonSafe(artifacts.environmentReport);
    const onboarding = deps.deriveOnboardingState({
      localConfig: localConfigSummary,
      dependencyReport,
      environmentReport,
      accountsState,
      desktopAutomation
    });
    const userHome = process.env.USERPROFILE || process.env.HOME || "";
    const imageDownloadsDir =
      localConfigSummary.image.downloadsDir ||
      localConfigSummary.publish.imageDir ||
      path.join(userHome, "Desktop", "输出图片");
    const videoDeviceReferenceImages = collectReferenceImages(localConfigSummary.image.deviceImageDir, 3);
    const videoHairColorImages = collectReferenceImages(localConfigSummary.video.hairColorReferenceDir, 200);
    const selectedHairColorImage = existingImagePath(localConfigSummary.video.selectedHairColorImage);
    const previewHairColorImage = selectedHairColorImage || null;
    const videoReferenceImages = [
      ...videoDeviceReferenceImages,
      ...(previewHairColorImage ? [previewHairColorImage] : [])
    ];

    return {
      meta: {
        productName: inspect?.name || "染色宝",
        date,
        root: deps.productStudioRoot
      },
      stateDates: {
        hotPool: hotPool?.date || null,
        brandPool: brandPool?.date || null,
        briefs: briefs?.date || null,
        bestBrief: bestBrief?.date || null,
        prompt: prompt?.date || null,
        execution: execution?.date || null
      },
      upstream: deriveUpstreamState(hotPool, upstreamRouter, brandPool, briefs),
      hotPool,
      bestBrief,
      activeBrief,
      brandPool,
      briefs,
      prompt,
      execution,
      videoGenerationState,
      videoGallery,
      videoPublishState,
      briefDraft,
      templateCatalog,
      videoTemplateCatalog,
      templateSelection,
      templateGallery,
      publishImages,
      desktopAutomation,
      videoAutomation,
      accounts: accountsState,
      mediaGeneration: {
        videoReferenceImages,
        videoDeviceReferenceImages,
        videoHairColorImages,
        selectedHairColorImage
      },
      localConfig: localConfigSummary,
      dependencyReport,
      dependencyInstallState: deps.readDependencyInstallState(),
      environmentReport,
      onboarding,
      latestImage,
      texts: {
        executionMarkdown: deps.readTextSafe(artifacts.executionMarkdown),
        briefMarkdown: deps.readTextSafe(artifacts.briefMarkdown),
        promptMarkdown: deps.readTextSafe(artifacts.imagePromptMarkdown)
      },
      paths: {
        productStudioRoot: deps.productStudioRoot,
        runtimeRoot: deps.runtimeRoot,
        runtimeConfigDir: deps.runtimeConfigDir,
        outputsDir: path.join(deps.runtimeRoot, "outputs"),
        imageDownloadsDir,
        videoDownloadsDir: localConfigSummary.video.downloadsDir || path.join(userHome, "Desktop", "输出视频")
      }
    };
  };
}

module.exports = {
  createDashboardLoader
};
