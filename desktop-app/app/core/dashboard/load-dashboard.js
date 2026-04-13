const path = require("path");

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

function createDashboardLoader(deps) {
  return async function loadDashboard() {
    const date = deps.formatDate();
    const artifacts = deps.currentArtifacts(date);
    const inspect = deps.readJsonSafe(path.join(deps.productStudioRoot, "products", "ransebao", "product.json"));
    const localConfigSummary = deps.summarizeLocalRuntimeConfig();
    const dependencyReport = await deps.inspectDependencyReport(deps.readLocalRuntimeConfig());
    deps.writeJsonSafe(artifacts.dependencyReport, dependencyReport);
    const templateCatalog = deps.loadTemplateCatalog();
    const bestBrief = deps.readJsonSafe(artifacts.bestBrief);
    const brandPool = deps.readJsonSafe(artifacts.brandPool);
    const briefs = deps.readJsonSafe(artifacts.briefs);
    const hotPool = deps.readJsonSafe(artifacts.hotPool);
    const prompt = deps.readJsonSafe(artifacts.prompt);
    const execution = deps.readJsonSafe(artifacts.execution);
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
    const accountsState = deps.readPublishAccountsState();
    const environmentReport = deps.readJsonSafe(artifacts.environmentReport);
    const onboarding = deps.deriveOnboardingState({
      localConfig: localConfigSummary,
      dependencyReport,
      environmentReport,
      accountsState,
      desktopAutomation
    });
    const imageDownloadsDir =
      localConfigSummary.image.downloadsDir ||
      localConfigSummary.publish.imageDir ||
      path.join(process.env.HOME || "", "Desktop", "jimeng-downloads");

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
      briefDraft,
      templateCatalog,
      templateSelection,
      templateGallery,
      publishImages,
      desktopAutomation,
      accounts: accountsState,
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
        imageDownloadsDir
      }
    };
  };
}

module.exports = {
  createDashboardLoader
};
