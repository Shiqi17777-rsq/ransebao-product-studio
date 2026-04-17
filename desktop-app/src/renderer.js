const state = {
  dashboard: null,
  environmentReport: null,
  currentPage: "upstream",
  selectedBriefId: null,
  selectedTemplates: [],
  selectedVideoTemplateId: null,
  activeTemplateSlot: null,
  activePreviewImage: null,
  accountModal: null,
  onboardingDismissed: false,
  onboardingManual: false
};

const PAGE_META = {
  upstream: {
    label: "上游",
    title: "先看今天有没有热点，再决定今天讲什么",
    description: "这里先看两个资讯池和路由结果，再决定今天走热点还是品牌兜底。"
  },
  brief: {
    label: "今日 brief",
    title: "先确认今天要讲什么，再人工调整一下",
    description: "这一页不只是看 brief，而是保留一个人工修改和确认的节点。"
  },
  template: {
    label: "图片模板",
    title: "先选模板，再让系统根据 brief 去生成图片",
    description: "不把 prompt 暴露给用户，只让用户控制模板、结果和重生成。"
  },
  video: {
    label: "视频生成",
    title: "用设备图生成本地短视频",
    description: "视频是独立模块，第一版只生成和本地展示，不进入发布链。"
  },
  publish: {
    label: "发布确认",
    title: "标题、文案和配图在这里做发布前确认",
    description: "这一步只确认成品和平台，不把复杂过程塞进来。"
  },
  accounts: {
    label: "账号管理",
    title: "把登录、启停、检测和多账号发布都统一到这里",
    description: "这里维护小红书和抖音的账号列表，手动发布和自动化都会只使用已启用账号。"
  },
  settings: {
    label: "运行与设置",
    title: "最后再看环境、路径和本机执行状态",
    description: "系统信息和本地运行支持集中在这里，不打扰主工作流。"
  }
};

const TEMPLATE_META = {
  "portrait-hero": {
    name: "人物主视觉版",
    description: "人物大图 + 中下部文案 + 左下产品 + 右下 logo"
  },
  "product-hero": {
    name: "产品主视觉版",
    description: "顶部标题区 + 中部设备主图 + 中下部效果图 + 底部说明"
  },
  "black-prismatic": {
    name: "黑底炫彩版",
    description: "纯黑背景 + 彩虹折射光 + 霓虹反射 + 金属液体流光"
  },
  "blue-minimal": {
    name: "蓝调极简产品版",
    description: "深蓝渐变 + 冷色光束 + 柔和雾感 + 镜面反光"
  }
};

const ACTION_META = {
  "check-environment": {
    label: "执行状态",
    title: "正在检查环境",
    detail: "读取产品配置并检查图片、发布适配器。",
    stepLabel: "检查执行条件"
  },
  "refresh-news": {
    label: "资讯刷新",
    title: "正在刷新资讯",
    detail: "只更新热点资讯池，不重跑 brief 和后续链路。",
    stepLabel: "刷新热点资讯池"
  },
  "refresh-upstream": {
    label: "上游刷新",
    title: "正在刷新上游",
    detail: "重新更新热点池、候选 brief 和下游资产。",
    stepLabel: "刷新上游链路"
  },
  "run-daily": {
    label: "今日流程",
    title: "正在运行今日流程",
    detail: "整条内容工作流正在执行。",
    stepLabel: "运行今日流程"
  },
  "execute-image": {
    label: "图片生成",
    title: "正在生成图片",
    detail: "图片任务已经提交，等待结果返回。",
    stepLabel: "生成图片"
  },
  "execute-video": {
    label: "视频生成",
    title: "正在生成视频",
    detail: "即梦全能参考视频任务已经提交，等待结果返回。",
    stepLabel: "生成视频"
  },
  "execute-video-regenerate": {
    label: "视频生成",
    title: "正在重新生成视频",
    detail: "会按当前模板、参考图和参数重新跑一轮视频生成。",
    stepLabel: "重新生成视频"
  },
  "execute-video-xiaohongshu": {
    label: "视频发布",
    title: "正在发布视频到小红书",
    detail: "会使用当前生成的视频和模板文案继续发布到小红书。",
    stepLabel: "发布视频到小红书"
  },
  "execute-video-douyin": {
    label: "视频发布",
    title: "正在发布视频到抖音",
    detail: "会使用当前生成的视频和模板文案继续发布到抖音。",
    stepLabel: "发布视频到抖音"
  },
  "execute-video-publish": {
    label: "视频发布",
    title: "正在双平台发布视频",
    detail: "会使用当前生成的视频和模板文案同步发布到两个平台。",
    stepLabel: "双平台视频发布"
  },
  "execute-xiaohongshu": {
    label: "发布确认",
    title: "正在发布到小红书",
    detail: "会使用模板页生成的 3 张图片一起发布。",
    stepLabel: "发布到小红书"
  },
  "execute-douyin": {
    label: "发布确认",
    title: "正在发布到抖音",
    detail: "会使用模板页生成的 3 张图片一起发布。",
    stepLabel: "发布到抖音"
  },
  "execute-publish": {
    label: "发布确认",
    title: "正在双平台发布",
    detail: "会使用模板页生成的 3 张图片同时发布到两个平台。",
    stepLabel: "双平台发布"
  },
  "save-desktop-automation": {
    label: "本地自动化",
    title: "正在保存自动化设置",
    detail: "会把每日定时和自动执行开关写入本地客户端。",
    stepLabel: "保存自动化"
  },
  "run-desktop-automation": {
    label: "本地自动化",
    title: "正在运行本地自动化",
    detail: "会使用当前已选的 3 套模板，并执行今天的完整流程。",
    stepLabel: "自动化执行"
  },
  "save-video-automation": {
    label: "视频自动化",
    title: "正在保存视频自动化",
    detail: "会把视频生成和视频发布的每日定时写入本地客户端。",
    stepLabel: "保存视频自动化"
  },
  "run-video-automation": {
    label: "视频自动化",
    title: "正在运行视频自动化",
    detail: "会先生成当前视频，等 mp4 下载完成后再继续发布。",
    stepLabel: "运行视频自动化"
  },
  "save-brief-draft": {
    label: "今日 brief",
    title: "正在保存 brief 修改",
    detail: "把你刚刚的人工修改写入本地工作区。",
    stepLabel: "保存 brief"
  },
  "reselect-brief": {
    label: "今日 brief",
    title: "正在切换候选 brief",
    detail: "从今天的候选里切换到下一条内容方向。",
    stepLabel: "切换候选 brief"
  },
  "save-template-selection": {
    label: "图片模板",
    title: "正在保存图片模板",
    detail: "把当前模板选择写入本地状态。",
    stepLabel: "保存模板"
  },
  "login-account": {
    label: "账号管理",
    title: "正在登录账号",
    detail: "会拉起平台登录流程并保存新的登录态。",
    stepLabel: "等待登录完成"
  },
  "check-account": {
    label: "账号管理",
    title: "正在检测账号",
    detail: "会检查当前账号登录态是否可用。",
    stepLabel: "检测账号连通性"
  },
  "toggle-account": {
    label: "账号管理",
    title: "正在更新账号状态",
    detail: "会立即影响手动发布和自动化的目标账号范围。",
    stepLabel: "更新启用状态"
  },
  "remove-account": {
    label: "账号管理",
    title: "正在移除账号",
    detail: "移除后这个账号将不再参与手动发布和自动化。",
    stepLabel: "移除账号"
  },
  "save-local-config": {
    label: "首次启动向导",
    title: "正在保存本地路径",
    detail: "把 Dreamina、设备图、下载目录和发布工具根目录写入本地配置。",
    stepLabel: "保存本地路径"
  },
  "save-media-config": {
    label: "媒体生成",
    title: "正在保存媒体配置",
    detail: "把图片 provider、用户自备 Gemini API Key 和视频默认参数写入本地配置。",
    stepLabel: "保存媒体配置"
  },
  "inspect-dependencies": {
    label: "首次启动向导",
    title: "正在识别本机依赖",
    detail: "扫描 Python、Dreamina、发布工具和常用素材目录。",
    stepLabel: "识别依赖"
  },
  "inspect-bundled-dependencies": {
    label: "首次启动向导",
    title: "正在刷新安装状态",
    detail: "重新检查安装包资源、内置依赖和外部工具的当前状态。",
    stepLabel: "刷新安装状态"
  },
  "install-sau": {
    label: "首次启动向导",
    title: "正在安装 sau",
    detail: "会在用户目录里创建内部虚拟环境并安装发布工具。",
    stepLabel: "安装 sau"
  },
  "install-patchright-chromium": {
    label: "首次启动向导",
    title: "正在准备 Chromium",
    detail: "会为 sau 下载并准备 patchright Chromium 浏览器运行时。",
    stepLabel: "准备 Chromium"
  },
  "install-dreamina": {
    label: "首次启动向导",
    title: "正在安装 Dreamina",
    detail: "会执行 Dreamina 官方安装命令，完成后自动重新检测。",
    stepLabel: "安装 Dreamina"
  },
  "save-onboarding-automation": {
    label: "首次启动向导",
    title: "正在保存自动化默认值",
    detail: "把首次启动里设置的自动化开关和时间写入客户端。",
    stepLabel: "保存自动化默认值"
  },
  "open-onboarding": {
    label: "首次启动向导",
    title: "正在打开初始化向导",
    detail: "回到首次启动流程，继续检查本地客户端准备状态。",
    stepLabel: "打开初始化向导"
  },
  "complete-onboarding": {
    label: "首次启动向导",
    title: "准备进入工作台",
    detail: "当前初始化向导已收起，你可以继续进入日常工作流。",
    stepLabel: "进入工作台"
  }
};

const MOTION_SELECTORS = [
  ".overview-grid > *",
  ".page-grid > .panel-card",
  ".simple-list > *",
  ".brief-stack > *",
  ".quick-grid > *",
  ".template-slot-grid > *",
  ".template-result-grid > *",
  ".video-template-grid > *",
  ".template-modal-grid > *",
  ".account-list > *",
  ".env-status-list > *",
  ".settings-list > *",
  ".content-summary > *",
  ".publish-checks > *",
  ".asset-meta > div"
];

const POINTER_SURFACE_SELECTORS = [
  ".metric-card",
  ".panel-card",
  ".simple-item",
  ".activity-item",
  ".assist-item",
  ".env-status-item",
  ".editable-card",
  ".template-card",
  ".template-slot-card",
  ".template-result-card",
  ".video-template-card",
  ".template-result-meta > div",
  ".content-title-box",
  ".content-preview-block",
  ".content-status-row",
  ".asset-meta > div",
  ".settings-row",
  ".quick-action",
  ".account-card",
  ".migration-banner"
];

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function setValue(id, value) {
  const el = $(id);
  if (el) el.value = value;
}

function firstInputValue(ids, fallback = "") {
  for (const id of ids) {
    const el = $(id);
    if (el && el.value !== undefined && el.value !== "") return el.value;
  }
  return fallback;
}

function mediaConfigInputValue(videoId, settingsId, fallback = "") {
  const ids = state.currentPage === "settings"
    ? [settingsId, videoId]
    : [videoId, settingsId];
  return firstInputValue(ids, fallback);
}

function fileNameFromPath(value = "") {
  const normalized = String(value || "").replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() || "";
}

function fileStemFromPath(value = "") {
  return fileNameFromPath(value).replace(/\.[^.]+$/, "");
}

function firstNonEmptyArray(...values) {
  return values.find((value) => Array.isArray(value) && value.length) || [];
}

function safeString(value, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function translateRouteMode(mode) {
  if (mode === "brand_fallback") return "品牌兜底";
  if (mode === "hot_priority") return "热点优先";
  if (mode === "hybrid") return "热点补位";
  return safeString(mode);
}

function clampText(text, maxLength = 120) {
  const value = safeString(text, "");
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}…`;
}

function nowLabel() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTimeLabel(value, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function logOutput(text) {
  setText("command-log", text || "等待操作…");
}

function setActionStatus({
  action = "idle",
  state: actionState = "idle",
  label,
  title,
  detail,
  progress = 0,
  stepLabel,
  indeterminate = false
}) {
  const panel = $("action-status-panel");
  const fill = $("action-progress-fill");
  const badge = $("action-status-badge");
  if (!panel || !fill || !badge) return;

  const meta = ACTION_META[action] || {};
  const nextLabel = label || meta.label || "执行状态";
  const nextTitle = title || meta.title || "等待操作";
  const nextDetail = detail || meta.detail || "点击按钮后，这里会显示当前动作、阶段和完成状态。";
  const nextStepLabel = stepLabel || meta.stepLabel || "尚未开始";
  const normalizedProgress = Math.max(0, Math.min(progress || 0, 1));

  panel.dataset.state = actionState;
  setText("action-status-label", nextLabel);
  setText("action-status-title", nextTitle);
  setText("action-status-detail", nextDetail);
  setText("action-progress-step", nextStepLabel);
  setText("action-progress-percent", `${Math.round(normalizedProgress * 100)}%`);

  const badgeTextMap = {
    idle: "空闲",
    running: "执行中",
    success: "已完成",
    error: "失败"
  };
  badge.textContent = badgeTextMap[actionState] || "执行中";
  fill.classList.toggle("is-indeterminate", Boolean(indeterminate));
  fill.style.width = indeterminate ? "36%" : `${Math.round(normalizedProgress * 100)}%`;
}

async function handleWorkflowProgress(payload) {
  if (!payload) return;
  setActionStatus({
    action: payload.action,
    state: payload.state || "running",
    title: payload.title,
    detail: payload.detail,
    progress: payload.progress ?? 0,
    stepLabel: payload.stepLabel,
    indeterminate: payload.indeterminate
  });

  if ([
    "execute-image",
    "execute-video",
    "execute-video-regenerate",
    "execute-video-xiaohongshu",
    "execute-video-douyin",
    "execute-video-publish",
    "execute-xiaohongshu",
    "execute-douyin",
    "execute-publish",
    "run-desktop-automation",
    "run-video-automation"
  ].includes(payload.action)) {
    if (payload.state === "running") {
      logOutput(payload.detail || "任务正在后台执行…");
      return;
    }

    if (payload.state === "success" || payload.state === "error") {
      logOutput(formatWorkflowOutput(payload.result || {
        ok: payload.state === "success",
        stdout: payload.detail || "",
        stderr: payload.state === "error" ? payload.detail || "任务执行失败。" : ""
      }));
      await refreshDashboard(state.environmentReport);
    }
  }
}

function dependencyActionForId(id) {
  if (id === "sau") return "install-sau";
  if (id === "patchrightChromium") return "install-patchright-chromium";
  if (id === "dreamina") return "install-dreamina";
  return "";
}

function ensureDependencyReportState() {
  if (!state.dashboard) return null;
  if (!state.dashboard.dependencyReport) state.dashboard.dependencyReport = { installItems: {} };
  if (!state.dashboard.dependencyReport.installItems) state.dashboard.dependencyReport.installItems = {};
  return state.dashboard.dependencyReport;
}

function handleDependencyProgress(payload) {
  if (!payload?.id) return;
  const dependencyReport = ensureDependencyReportState();
  if (!dependencyReport) return;

  const currentItem = dependencyReport.installItems?.[payload.id] || { id: payload.id };
  dependencyReport.installItems[payload.id] = {
    ...currentItem,
    ...payload
  };

  const action = dependencyActionForId(payload.id);
  if (action && (payload.status === "installing" || payload.progressLabel || payload.latestChunk)) {
    setActionStatus({
      action,
      state: "running",
      progress: Number.isFinite(payload.progress) ? Number(payload.progress) : Number(currentItem.progress || 0),
      stepLabel: payload.progressLabel || currentItem.progressLabel || ACTION_META[action]?.stepLabel,
      indeterminate: Boolean(payload.indeterminate)
    });
  }

  const tail = payload.stderrTail || payload.stdoutTail || payload.latestChunk;
  if (tail) {
    logOutput(String(tail).trim() || "正在执行依赖安装…");
  }

  renderOnboarding();
}

function setButtonsBusy(busy) {
  document.querySelectorAll("[data-action], [data-account-open], [data-account-relogin], [data-account-check], [data-account-toggle], [data-account-remove], [data-pick-path], #account-modal-submit").forEach((button) => {
    if (busy) {
      button.classList.add("button-busy");
      button.disabled = true;
    } else {
      button.classList.remove("button-busy");
      button.disabled = false;
    }
  });
}

function setStatusItem(id, value, ready) {
  const label = $(id);
  const container = $(`${id}-item`);
  if (label) label.textContent = value;
  if (!container) return;
  if (ready === true) container.dataset.state = "ready";
  else if (ready === false) container.dataset.state = "missing";
  else container.dataset.state = "idle";
}

function stageSnapshot(dashboard) {
  const bestBrief = dashboard.bestBrief?.winner?.brief;
  const briefCount = dashboard.briefs?.count || 0;
  const upstreamReady = Boolean(
    dashboard.upstream?.routeMode ||
    dashboard.brandPool?.count ||
    dashboard.hotPool?.date
  );
  const execution = dashboard.execution || {};
  const promptReady = Boolean(execution?.prompt_result?.json_path);
  const latestImage = Boolean(dashboard.latestImage);

  if (!upstreamReady) {
    return {
      label: "资讯刷新中",
      value: 18,
      steps: ["current", "pending", "pending", "pending", "pending"]
    };
  }

  if (!bestBrief && !briefCount) {
    return {
      label: "上游已刷新，正在生成 brief",
      value: 34,
      steps: ["complete", "current", "pending", "pending", "pending"]
    };
  }

  if (!bestBrief) {
    return {
      label: "候选 brief 已生成",
      value: 46,
      steps: ["complete", "complete", "current", "pending", "pending"]
    };
  }

  if (!promptReady) {
    return {
      label: "Brief 已生成",
      value: 56,
      steps: ["complete", "complete", "current", "pending", "pending"]
    };
  }

  if (!latestImage) {
    return {
      label: "等待生成配图",
      value: 78,
      steps: ["complete", "complete", "complete", "current", "pending"]
    };
  }

  return {
    label: "配图已就绪，等待发布确认",
    value: 92,
    steps: ["complete", "complete", "complete", "complete", "current"]
  };
}

function updatePipeline(snapshot) {
  const ids = ["step-news", "step-route", "step-brief", "step-image", "step-publish"];
  ids.forEach((id, index) => {
    const node = $(id);
    if (!node) return;
    node.classList.remove("is-complete", "is-current");
    const stage = snapshot.steps[index];
    if (stage === "complete") node.classList.add("is-complete");
    if (stage === "current") node.classList.add("is-current");
  });
}

function renderSimpleList(targetId, items, emptyText) {
  const root = $(targetId);
  if (!root) return;
  if (!items.length) {
    root.innerHTML = `<article class="simple-item"><span>暂无数据</span><strong>${emptyText}</strong></article>`;
    return;
  }
  root.innerHTML = items
    .map(
      (item) => `
        <article class="simple-item">
          <span>${item.label}</span>
          <strong>${item.title}</strong>
          ${item.note ? `<small>${item.note}</small>` : ""}
        </article>
      `
    )
    .join("");
}

function templateCatalog() {
  const items = state.dashboard?.templateCatalog?.templates;
  if (Array.isArray(items) && items.length) return items;
  return Object.entries(TEMPLATE_META).map(([id, meta]) => ({ id, ...meta }));
}

function getTemplateMeta(templateId) {
  return templateCatalog().find((item) => item.id === templateId) || {
    id: templateId,
    name: TEMPLATE_META[templateId]?.name || templateId,
    description: TEMPLATE_META[templateId]?.description || "",
    previewImagePath: null
  };
}

function videoTemplateCatalog() {
  const items = state.dashboard?.videoTemplateCatalog?.templates;
  if (Array.isArray(items) && items.length) return items;
  const fallbackId = safeString(
    state.selectedVideoTemplateId ||
      state.dashboard?.localConfig?.video?.templateId ||
      state.dashboard?.videoGallery?.item?.templateId ||
      state.dashboard?.environmentReport?.plan?.results?.video?.template_id ||
      "beauty-hair-transformation",
    "beauty-hair-transformation"
  );
  return [
    {
      id: fallbackId,
      name: safeString(
        state.dashboard?.videoGallery?.item?.templateName ||
          state.dashboard?.environmentReport?.plan?.results?.video?.template_name ||
          "高颜值染后爆点变美视频"
      ),
      description: "",
      templateVideoPath:
        state.dashboard?.videoGallery?.item?.templateVideoPath ||
        state.dashboard?.environmentReport?.plan?.results?.video?.template_video_path ||
        "",
      modelVersion: safeString(state.dashboard?.localConfig?.video?.modelVersion, "seedance2.0_vip"),
      duration: Number(state.dashboard?.localConfig?.video?.duration || 15),
      ratio: safeString(state.dashboard?.localConfig?.video?.ratio, "16:9"),
      videoResolution: safeString(state.dashboard?.localConfig?.video?.videoResolution, "720p")
    }
  ];
}

function resolveVideoTemplateId(preferredId = "") {
  const catalog = videoTemplateCatalog();
  const preferred = safeString(preferredId, "").trim();
  if (preferred && catalog.some((item) => item.id === preferred)) return preferred;
  const defaultId = safeString(state.dashboard?.videoTemplateCatalog?.defaultTemplateId, "");
  if (defaultId && catalog.some((item) => item.id === defaultId)) return defaultId;
  return catalog[0]?.id || "beauty-hair-transformation";
}

function getVideoTemplateMeta(templateId) {
  const resolvedId = resolveVideoTemplateId(templateId);
  return videoTemplateCatalog().find((item) => item.id === resolvedId) || {
    id: resolvedId,
    name: "高颜值染后爆点变美视频",
    description: "",
    templateVideoPath: "",
    modelVersion: "seedance2.0_vip",
    duration: 15,
    ratio: "16:9",
    videoResolution: "720p"
  };
}

function localPathToAssetUrl(targetPath) {
  const raw = safeString(targetPath, "").trim();
  if (!raw) return "";
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw)) return raw;
  const normalized = raw.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(normalized)) {
    return encodeURI(`file:///${normalized}`);
  }
  if (normalized.startsWith("//")) {
    return encodeURI(`file:${normalized}`);
  }
  if (normalized.startsWith("/")) {
    return encodeURI(`file://${normalized}`);
  }
  return encodeURI(normalized);
}

function renderTemplatePreview(meta) {
  const imagePath = meta?.previewImagePath;
  if (imagePath) {
    return `
      <span class="template-preview is-${meta.id} has-image">
        <img src="${localPathToAssetUrl(imagePath)}" alt="${meta.name}" class="template-preview-image" />
      </span>
    `;
  }
  return `<span class="template-preview is-${meta.id}"></span>`;
}

function openImagePreview(imagePath, title = "生成结果大图") {
  if (!imagePath) return;
  state.activePreviewImage = imagePath;
  const backdrop = $("image-preview-backdrop");
  const image = $("image-preview-image");
  if (image) {
    image.src = localPathToAssetUrl(imagePath);
    image.alt = title;
  }
  setText("image-preview-title", title);
  if (backdrop) backdrop.hidden = false;
}

function closeImagePreview() {
  state.activePreviewImage = null;
  const backdrop = $("image-preview-backdrop");
  const image = $("image-preview-image");
  if (image) image.removeAttribute("src");
  if (backdrop) backdrop.hidden = true;
}

function defaultSelectedTemplates() {
  const catalogIds = templateCatalog().map((item) => item.id);
  const fallback = catalogIds.length ? catalogIds.slice(0, 3) : ["portrait-hero", "product-hero", "black-prismatic"];
  return fallback.slice(0, 3).map((templateId, index) => ({ slot: index + 1, templateId }));
}

function normalizeSelectedTemplates(payload) {
  const raw = Array.isArray(payload?.selectedTemplates) ? payload.selectedTemplates : [];
  const fallback = defaultSelectedTemplates();
  const used = new Set();
  return fallback.map((fallbackEntry, index) => {
    const slot = index + 1;
    const matched = raw.find((item) => Number(item?.slot) === slot);
    let templateId = matched?.templateId || fallbackEntry.templateId;
    if (used.has(templateId)) {
      templateId = fallback.find((item) => !used.has(item.templateId))?.templateId || fallbackEntry.templateId;
    }
    used.add(templateId);
    return { slot, templateId };
  });
}

function currentTemplateResults() {
  const galleryItems = Array.isArray(state.dashboard?.templateGallery?.items) ? state.dashboard.templateGallery.items : [];
  const results = state.selectedTemplates.map((entry) => {
    const templateMeta = getTemplateMeta(entry.templateId);
    const matched = galleryItems.find((item) => Number(item?.slot) === Number(entry.slot));
    return {
      slot: entry.slot,
      templateId: entry.templateId,
      templateName: templateMeta.name,
      templateDescription: templateMeta.description,
      status: matched?.status || "idle",
      imagePath: matched?.imagePath || null,
      generatedAt: matched?.generatedAt || null,
      submitId: matched?.submitId || null,
      promptPath: matched?.promptPath || null,
      error: matched?.error || null
    };
  });
  return results;
}

function templateStatusLabel(status) {
  if (status === "completed") return "已完成";
  if (status === "running") return "生成中";
  if (status === "error") return "失败";
  if (status === "stale") return "需重生成";
  return "未生成";
}

function renderTemplateSelection() {
  const slotGrid = $("template-slot-grid");
  if (!slotGrid) return;

  const selectedTemplates = state.selectedTemplates.length ? state.selectedTemplates : defaultSelectedTemplates();
  const slotMarkup = selectedTemplates
    .map((entry) => {
      const meta = getTemplateMeta(entry.templateId);
      return `
        <article class="template-slot-card">
          <div class="template-slot-head">
            <span class="template-slot-tag">模板 ${entry.slot}</span>
            <button class="text-button compact" type="button" data-template-open="${entry.slot}">更换模板</button>
          </div>
          <div class="template-slot-body">
            ${renderTemplatePreview(meta)}
            <div class="template-slot-copy">
              <strong>${meta.name}</strong>
              <small>${meta.description || "已选模板"}</small>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
  slotGrid.innerHTML = slotMarkup;
  setText("template-selection-label", `已选 ${selectedTemplates.length}/3`);

  slotGrid.querySelectorAll("[data-template-open]").forEach((button) => {
    button.addEventListener("click", () => {
      openTemplateModal(Number(button.dataset.templateOpen));
    });
  });

  bindPointerSurfaces(slotGrid);
  refreshMotionDelays(slotGrid);

  renderTemplateResults();
  renderTemplateModal();
}

function renderTemplateResults() {
  const root = $("template-result-grid");
  if (!root) return;

  const items = currentTemplateResults();
  root.innerHTML = items
    .map((item) => `
      <article class="template-result-card">
        <div class="template-result-head">
          <div>
            <p class="section-label">模板 ${item.slot}</p>
            <strong>${item.templateName}</strong>
          </div>
          <div class="mini-badge ${item.status === "running" ? "is-running" : ""} ${item.status === "error" ? "is-error" : ""}">
            ${templateStatusLabel(item.status)}
          </div>
        </div>

        <div class="template-result-preview-frame">
          ${
            item.imagePath
              ? `<img src="${localPathToAssetUrl(item.imagePath)}" alt="${item.templateName}" class="template-result-image" data-image-preview="${encodeURIComponent(item.imagePath)}" data-image-title="${encodeURIComponent(item.templateName)}" />`
              : `<div class="template-result-placeholder">这张模板图生成后会显示在这里</div>`
          }
        </div>

        <div class="template-result-meta">
          <div>
            <span>模板说明</span>
            <strong>${item.templateDescription || "当前模板已选择"}</strong>
          </div>
          <div>
            <span>最近生成时间</span>
            <strong>${safeString(item.generatedAt, "尚未生成")}</strong>
          </div>
        </div>

        <div class="template-result-actions">
          <button class="secondary-action compact" type="button" data-action="execute-image" data-slot="${item.slot}">单张重新生成</button>
        </div>
      </article>
    `)
    .join("");

  root.querySelectorAll("[data-image-preview]").forEach((image) => {
    image.addEventListener("click", () => {
      openImagePreview(
        decodeURIComponent(image.dataset.imagePreview || ""),
        decodeURIComponent(image.dataset.imageTitle || "生成结果大图")
      );
    });
  });

  bindPointerSurfaces(root);
  refreshMotionDelays(root);
}

function syncVideoTemplateInputs(template) {
  if (!template) return;
  const modelVersion = safeString(template.modelVersion, "seedance2.0_vip");
  const duration = String(Number(template.duration || 15));
  const ratio = safeString(template.ratio, "16:9");
  const videoResolution = safeString(template.videoResolution, "720p");
  setValue("video-page-model", modelVersion);
  setValue("media-video-model", modelVersion);
  setValue("video-page-duration", duration);
  setValue("media-video-duration", duration);
  setValue("video-page-ratio", ratio);
  setValue("media-video-ratio", ratio);
  setValue("video-page-resolution", videoResolution);
  setValue("media-video-resolution", videoResolution);
  applyVideoPreviewRatio(ratio);
}

async function handleVideoTemplatePick(templateId) {
  const template = getVideoTemplateMeta(templateId);
  const payload = {
    videoTemplateId: template.id,
    videoModelVersion: safeString(template.modelVersion, "seedance2.0_vip"),
    videoDuration: Number(template.duration || 15),
    videoRatio: safeString(template.ratio, "16:9"),
    videoResolution: safeString(template.videoResolution, "720p")
  };
  const currentVideoConfig = state.dashboard?.localConfig?.video || {};
  const needsSave =
    payload.videoTemplateId !== safeString(currentVideoConfig.templateId, "") ||
    payload.videoModelVersion !== safeString(currentVideoConfig.modelVersion, "seedance2.0_vip") ||
    Number(payload.videoDuration) !== Number(currentVideoConfig.duration || 15) ||
    payload.videoRatio !== safeString(currentVideoConfig.ratio, "16:9") ||
    payload.videoResolution !== safeString(currentVideoConfig.videoResolution, "720p");

  state.selectedVideoTemplateId = template.id;
  syncVideoTemplateInputs(template);
  renderVideoTemplateSelection();
  renderVideoGeneration();

  if (!needsSave) {
    logOutput(`当前视频模板：${template.name}`);
    return;
  }

  setButtonsBusy(true);
  setActionStatus({
    action: "save-media-config",
    state: "running",
    progress: 0.18,
    indeterminate: true,
    detail: `正在切换到视频模板：${template.name}`,
    stepLabel: "同步模板默认参数"
  });
  logOutput(`正在切换视频模板：${template.name}`);
  try {
    const result = await window.desktopApp.saveLocalConfig(payload);
    state.environmentReport = null;
    clearEnvironmentStatus();
    setActionStatus({
      action: "save-media-config",
      state: result?.ok ? "success" : "error",
      progress: result?.ok ? 1 : 0.92,
      detail: result?.ok
        ? `视频模板已切换为 ${template.name}，推荐参数已同步。`
        : (result?.error || "视频模板保存失败。"),
      stepLabel: result?.ok ? "保存完成" : "保存失败"
    });
    if (result?.ok) {
      await refreshDashboard(null);
    } else {
      logOutput(result?.error || "视频模板保存失败。");
    }
  } finally {
    setButtonsBusy(false);
  }
}

function renderVideoTemplateSelection() {
  const grid = $("video-template-grid");
  if (!grid) return;
  const templates = videoTemplateCatalog();
  const selectedTemplateId = resolveVideoTemplateId(state.selectedVideoTemplateId);
  state.selectedVideoTemplateId = selectedTemplateId;
  setText("video-template-selection-label", `${templates.length} 个模板 · 已选 1`);

  grid.innerHTML = templates
    .map((template) => {
      const isSelected = template.id === selectedTemplateId;
      const preview = template.templateVideoPath
        ? `<video src="${localPathToAssetUrl(template.templateVideoPath)}" muted loop playsinline autoplay preload="metadata"></video>`
        : `<div class="video-template-preview-fallback"></div>`;
      return `
        <button
          class="video-template-card ${isSelected ? "is-selected" : ""}"
          type="button"
          data-video-template-pick="${template.id}"
          aria-pressed="${isSelected ? "true" : "false"}"
        >
          <div class="video-template-preview">
            ${preview}
            <div class="video-template-preview-copy">
              <strong>${template.ratio || "16:9"} · ${template.duration || 15}s</strong>
              <span>${isSelected ? "当前模板" : "点击使用"}</span>
            </div>
          </div>
          <div class="video-template-meta">
            <strong>${template.name}</strong>
            <p>${template.description || "视频模板只负责节奏展示，真正提交时只上传 3 张设备图、1 张发色图和提示词。"}</p>
            <small>模板示例仅用于客户端展示，不会作为 Dreamina 上传素材。</small>
          </div>
        </button>
      `;
    })
    .join("");

  grid.querySelectorAll("[data-video-template-pick]").forEach((button) => {
    button.addEventListener("click", () => {
      void handleVideoTemplatePick(button.dataset.videoTemplatePick || "");
    });
  });

  bindPointerSurfaces(grid);
  refreshMotionDelays(grid);
}

function videoStatusLabel(status) {
  if (status === "completed") return "已完成";
  if (status === "running") return "生成中";
  if (status === "failed") return "失败";
  return "未生成";
}

function publishStatusLabel(status) {
  if (status === "succeeded") return "已完成";
  if (status === "partial_success") return "部分成功";
  if (status === "running") return "发布中";
  if (status === "failed_returncode" || status === "failed_missing_binary") return "失败";
  if (status === "planned") return "仅规划";
  return "未发布";
}

function videoRatioSize(ratio = "9:16") {
  const [rawWidth, rawHeight] = String(ratio).split(":").map((part) => Number(part));
  const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 9;
  const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 16;
  return { width, height };
}

function videoPreviewMaxWidth({ width, height }) {
  if (width === height) return 240;
  if (width > height) return width / height >= 2 ? 380 : 340;
  return height / width >= 1.7 ? 180 : 220;
}

function applyVideoPreviewRatio(ratio = "9:16") {
  const preview = $("video-preview-frame");
  if (!preview) return;
  const size = videoRatioSize(ratio);
  preview.style.aspectRatio = `${size.width} / ${size.height}`;
  preview.style.width = `min(100%, ${videoPreviewMaxWidth(size)}px)`;
  preview.dataset.ratio = `${size.width}:${size.height}`;
}

function renderVideoGeneration() {
  const gallery = state.dashboard?.videoGallery || {};
  const item = gallery.item || {};
  const videoPlan = state.dashboard?.environmentReport?.plan?.results?.video || {};
  const selectedTemplate = getVideoTemplateMeta(state.selectedVideoTemplateId);
  const status = item.status || gallery.status || "pending";
  const videoPath = item.videoPath || "";
  const preview = $("video-preview-frame");
  const badge = $("video-status-badge");
  const ratio =
    item.ratio ||
    videoPlan.ratio ||
    state.dashboard?.localConfig?.video?.ratio ||
    selectedTemplate.ratio ||
    $("video-page-ratio")?.value ||
    "16:9";
  applyVideoPreviewRatio(ratio);
  if (badge) {
    badge.textContent = videoStatusLabel(status);
    badge.classList.toggle("is-running", status === "running");
    badge.classList.toggle("is-error", status === "failed");
  }
  if (preview) {
    preview.innerHTML = "";
    if (videoPath) {
      const video = document.createElement("video");
      video.src = localPathToAssetUrl(videoPath);
      video.controls = true;
      preview.appendChild(video);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "template-result-placeholder";
      placeholder.textContent = item.error || "视频生成完成后会显示在这里";
      preview.appendChild(placeholder);
    }
  }
  const modelLabel = [
    item.modelVersion || videoPlan.model_version || state.dashboard?.localConfig?.video?.modelVersion || selectedTemplate.modelVersion || "seedance2.0_vip",
    `${item.duration || videoPlan.duration || state.dashboard?.localConfig?.video?.duration || selectedTemplate.duration || 15}s`,
    ratio,
    item.videoResolution || videoPlan.video_resolution || state.dashboard?.localConfig?.video?.videoResolution || selectedTemplate.videoResolution || "720p"
  ].filter(Boolean).join(" · ");
  const deviceRefs = firstNonEmptyArray(
    item.deviceReferenceImages,
    videoPlan.device_reference_images,
    state.dashboard?.mediaGeneration?.videoDeviceReferenceImages
  );
  const hairColorImage =
    item.hairColorReferenceImage ||
    videoPlan.hair_color_reference_image ||
    state.dashboard?.mediaGeneration?.selectedHairColorImage ||
    state.dashboard?.localConfig?.video?.selectedHairColorImage ||
    "";
  const hairColorName = item.hairColorName || videoPlan.hair_color_name || fileStemFromPath(hairColorImage);
  const templateName = item.templateName || videoPlan.template_name || "高颜值染后爆点变美视频";
  const outputDir = item.videoOutputDir || videoPlan.video_output_dir || state.dashboard?.paths?.videoDownloadsDir || "";
  const resolvedTemplateName = item.templateName || videoPlan.template_name || selectedTemplate.name || templateName;
  const douyinNoteText = item.douyinNoteText || videoPlan.douyin_note_text || "尚未生成当前视频模板的抖音文案。";
  const xiaohongshuBody = item.xiaohongshuBody || videoPlan.xiaohongshu_body || "尚未生成当前视频模板的小红书文案。";
  setText("video-model-label", modelLabel);
  setText("video-state-label", videoStatusLabel(status));
  setText("video-path-label", videoPath || item.error || "尚未生成");
  setText("video-template-label", resolvedTemplateName);
  setText("video-douyin-body", douyinNoteText);
  setText("video-xhs-body", xiaohongshuBody);
  const videoPublishState = state.dashboard?.videoPublishState || {};
  const xhsPublish = videoPublishState.platforms?.xiaohongshu || {};
  const douyinPublish = videoPublishState.platforms?.douyin || {};
  setText("video-publish-file-status", videoPath ? "已就绪" : "未就绪");
  setText("video-publish-xhs-status", publishStatusLabel(xhsPublish.status));
  setText("video-publish-douyin-status", publishStatusLabel(douyinPublish.status));
  setText("video-publish-error", xhsPublish.error || douyinPublish.error || "当前还没有视频发布错误。");
  setText("video-hair-color-label", hairColorName ? `${hairColorName} · ${fileNameFromPath(hairColorImage)}` : "自动从发色图库随机选择");
  setText("video-output-dir-label", outputDir || "默认桌面/输出视频");
  const videoRefs =
    firstNonEmptyArray(videoPlan.reference_images, state.dashboard?.mediaGeneration?.videoReferenceImages, item.referenceImages);
  setText(
    "video-reference-label",
    videoRefs.length
      ? `设备图 ${deviceRefs.length}/3 · 发色图 ${hairColorImage ? "1/1" : "0/1"}`
      : "将使用 3 张设备图 + 1 张发色图"
  );
}

function closeTemplateModal() {
  state.activeTemplateSlot = null;
  const backdrop = $("template-modal-backdrop");
  if (backdrop) backdrop.hidden = true;
}

function openTemplateModal(slot) {
  state.activeTemplateSlot = slot;
  renderTemplateModal();
  const backdrop = $("template-modal-backdrop");
  if (backdrop) backdrop.hidden = false;
}

function renderTemplateModal() {
  const backdrop = $("template-modal-backdrop");
  const grid = $("template-modal-grid");
  if (!backdrop || !grid) return;

  if (!state.activeTemplateSlot) {
    backdrop.hidden = true;
    grid.innerHTML = "";
    return;
  }

  const activeSlot = Number(state.activeTemplateSlot);
  const currentSelection = state.selectedTemplates.find((item) => Number(item.slot) === activeSlot);
  const usedTemplateIds = new Set(
    state.selectedTemplates.filter((item) => Number(item.slot) !== activeSlot).map((item) => item.templateId)
  );

  setText("template-modal-title", `为模板 ${activeSlot} 选择新的图片模板`);
  setText("template-modal-copy", "已被其他槽位占用的模板不能重复选择。");

  grid.innerHTML = templateCatalog()
    .map((template) => {
      const disabled = usedTemplateIds.has(template.id);
      const isCurrent = currentSelection?.templateId === template.id;
      return `
        <button
          class="template-card template-modal-card ${isCurrent ? "is-selected" : ""}"
          type="button"
          data-template-pick="${template.id}"
          ${disabled ? "disabled" : ""}
        >
          ${renderTemplatePreview(template)}
          <strong>${template.name}</strong>
          <small>${disabled ? "已被其他槽位占用" : (template.description || "可用于今日生成")}</small>
        </button>
      `;
    })
    .join("");

  grid.querySelectorAll("[data-template-pick]").forEach((button) => {
    button.addEventListener("click", async () => {
      const templateId = button.dataset.templatePick;
      const nextSelection = state.selectedTemplates.map((item) =>
        Number(item.slot) === activeSlot ? { ...item, templateId } : item
      );
      state.selectedTemplates = nextSelection;
      renderTemplateSelection();
      closeTemplateModal();
      setActionStatus({
        action: "save-template-selection",
        state: "running",
        progress: 0.28,
        stepLabel: `保存模板 ${activeSlot}`
      });
      const result = await window.desktopApp.saveTemplateSelection({
        date: state.dashboard?.meta?.date,
        selectedTemplates: nextSelection
      });
      if (result?.ok) {
        setActionStatus({
          action: "save-template-selection",
          state: "success",
          progress: 1,
          detail: `模板 ${activeSlot} 已更新为 ${getTemplateMeta(templateId).name}。`,
          stepLabel: "保存完成"
        });
        logOutput(`模板 ${activeSlot} 已切换为：${getTemplateMeta(templateId).name}`);
        await refreshDashboard(state.environmentReport);
      } else {
        setActionStatus({
          action: "save-template-selection",
          state: "error",
          progress: 0.92,
          detail: "模板保存失败，请稍后重试。",
          stepLabel: "保存失败"
        });
      }
    });
  });

  bindPointerSurfaces(grid);
  refreshMotionDelays(grid);
  backdrop.hidden = false;
}

function currentAccounts(platform) {
  const payload = state.dashboard?.accounts?.accounts?.[platform];
  return Array.isArray(payload) ? payload : [];
}

function accountStatusLabel(status) {
  if (status === "ready") return "已就绪";
  if (status === "logging_in") return "登录中";
  if (status === "failed") return "失败";
  if (status === "expired") return "已过期";
  return "未检测";
}

function renderAccountList(targetId, platform) {
  const root = $(targetId);
  if (!root) return;
  const accounts = currentAccounts(platform);
  if (!accounts.length) {
    root.innerHTML = `
      <article class="simple-item">
        <span>暂无账号</span>
        <strong>${platform === "xiaohongshu" ? "先添加一个小红书账号" : "先添加一个抖音账号"}</strong>
        <small>登录成功后，这个平台才会进入手动发布和自动化发布范围。</small>
      </article>
    `;
    return;
  }

  root.innerHTML = accounts
    .map((account) => `
      <article class="account-card">
        <div class="account-card-head">
          <div>
            <p class="section-label">${platform === "xiaohongshu" ? "小红书账号" : "抖音账号"}</p>
            <strong>${account.displayName || account.accountName}</strong>
            <small>${account.accountName}</small>
          </div>
          <div class="account-status-pills">
            <span class="account-status-pill ${account.enabled ? "is-enabled" : ""}">
              ${account.enabled ? "已启用" : "已停用"}
            </span>
            <span class="account-status-pill is-state-${account.status}">
              ${accountStatusLabel(account.status)}
            </span>
          </div>
        </div>

        <div class="account-card-meta">
          <div>
            <span>最近检查</span>
            <strong>${formatDateTimeLabel(account.lastCheckedAt, "尚未检测")}</strong>
          </div>
          <div>
            <span>最近登录</span>
            <strong>${formatDateTimeLabel(account.lastLoginAt, "尚未登录")}</strong>
          </div>
        </div>

        <div class="account-card-actions">
          <button class="text-button compact" type="button" data-account-relogin="${account.id}">重新登录</button>
          <button class="text-button compact" type="button" data-account-check="${account.id}">连通性测试</button>
          <button class="text-button compact" type="button" data-account-toggle="${account.id}" data-account-enabled="${account.enabled ? "1" : "0"}">
            ${account.enabled ? "停用" : "启用"}
          </button>
          <button class="text-button compact is-danger" type="button" data-account-remove="${account.id}">移除</button>
        </div>
      </article>
    `)
    .join("");

  bindPointerSurfaces(root);
  refreshMotionDelays(root);
}

function renderAccountsView() {
  if (!state.dashboard?.accounts) return;
  const accountsState = state.dashboard.accounts;
  const summary = accountsState.summary || {
    xiaohongshu: { total: 0, enabled: 0 },
    douyin: { total: 0, enabled: 0 }
  };
  const migrationHints = Array.isArray(accountsState.migrationHints) ? accountsState.migrationHints : [];
  const banner = $("accounts-migration-banner");
  if (banner) {
    if (migrationHints.length) {
      banner.hidden = false;
      banner.innerHTML = migrationHints.map((item) => `<p>${item.message}</p>`).join("");
    } else {
      banner.hidden = true;
      banner.innerHTML = "";
    }
  }

  setText("accounts-summary-badge", `${summary.xiaohongshu.enabled + summary.douyin.enabled} 个已启用`);
  setText("accounts-xhs-summary", `${summary.xiaohongshu.enabled}/${summary.xiaohongshu.total}`);
  setText("accounts-douyin-summary", `${summary.douyin.enabled}/${summary.douyin.total}`);
  setText("accounts-xhs-badge", `${summary.xiaohongshu.total} 个账号`);
  setText("accounts-douyin-badge", `${summary.douyin.total} 个账号`);

  renderAccountList("accounts-xhs-list", "xiaohongshu");
  renderAccountList("accounts-douyin-list", "douyin");
}

function openAccountModal(platform, accountId = null) {
  const accounts = currentAccounts(platform);
  const existing = accountId ? accounts.find((item) => item.id === accountId) : null;
  state.accountModal = { platform, accountId, existing };
  setText("account-modal-label", accountId ? "重新登录账号" : "添加账号");
  setText("account-modal-title", accountId ? `重新登录${platform === "xiaohongshu" ? "小红书" : "抖音"}账号` : `添加${platform === "xiaohongshu" ? "小红书" : "抖音"}账号`);
  setText("account-modal-copy", "这一步会调用登录流程，允许弹浏览器或扫码，直到成功拿到登录态。");
  const displayNameInput = $("account-display-name-input");
  const accountNameInput = $("account-name-input");
  if (displayNameInput) displayNameInput.value = existing?.displayName || "";
  if (accountNameInput) accountNameInput.value = existing?.accountName || "";
  const backdrop = $("account-modal-backdrop");
  if (backdrop) backdrop.hidden = false;
}

function closeAccountModal() {
  state.accountModal = null;
  const backdrop = $("account-modal-backdrop");
  if (backdrop) backdrop.hidden = true;
}

function getCandidateBriefs() {
  return state.dashboard?.briefs?.items || [];
}

function getSelectedBrief() {
  const candidateBriefs = getCandidateBriefs();
  if (!candidateBriefs.length) {
    return state.dashboard?.activeBrief?.brief || state.dashboard?.bestBrief?.winner?.brief || {};
  }

  if (state.selectedBriefId) {
    const matched = candidateBriefs.find((item) => item.brief_id === state.selectedBriefId);
    if (matched) return matched;
  }

  const activeBrief = state.dashboard?.activeBrief?.brief;
  if (activeBrief?.brief_id) {
    const matched = candidateBriefs.find((item) => item.brief_id === activeBrief.brief_id);
    if (matched) return matched;
    return activeBrief;
  }

  return state.dashboard?.bestBrief?.winner?.brief || candidateBriefs[0] || {};
}

function getSelectedBriefIndex() {
  const candidateBriefs = getCandidateBriefs();
  const brief = getSelectedBrief();
  const index = candidateBriefs.findIndex((item) => item.brief_id === brief?.brief_id);
  return index >= 0 ? index : 0;
}

function formatWorkflowOutput(result) {
  if (!result) return "等待操作…";
  if (Array.isArray(result.steps)) {
    return result.steps
      .map((step) => {
        const stepLabel = step.command || (step.slot ? `image-slot-${step.slot} (${step.templateId || "template"})` : "workflow-step");
        const parts = [`$ ${stepLabel}`];
        if (step.stdout?.trim()) parts.push(step.stdout.trim());
        if (step.stderr?.trim()) parts.push(step.stderr.trim());
        return parts.join("\n");
      })
      .join("\n\n");
  }
  return [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n\n") || (result.ok ? "命令已完成。" : "命令执行失败。");
}

function refreshMotionDelays(scope = document) {
  MOTION_SELECTORS.forEach((selector) => {
    scope.querySelectorAll(selector).forEach((node, index) => {
      node.style.setProperty("--motion-delay", `${Math.min(index, 6) * 45}ms`);
    });
  });
}

function replayHeaderMotion() {
  const header = document.querySelector(".workspace-header");
  if (!header) return;
  header.classList.remove("is-transitioning");
  void header.offsetWidth;
  header.classList.add("is-transitioning");
}

function bindPointerSurfaces(root = document) {
  const selector = POINTER_SURFACE_SELECTORS.join(", ");
  root.querySelectorAll(selector).forEach((node) => {
    if (node.dataset.pointerSurfaceBound === "true") return;
    node.dataset.pointerSurfaceBound = "true";

    const resetPointerGlow = () => {
      node.style.setProperty("--card-cursor-x", "50%");
      node.style.setProperty("--card-cursor-y", "32%");
      node.style.setProperty("--card-tilt-x", "0deg");
      node.style.setProperty("--card-tilt-y", "0deg");
    };

    node.addEventListener("pointermove", (event) => {
      const rect = node.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      const offsetX = (x - 50) / 50;
      const offsetY = (y - 50) / 50;

      node.style.setProperty("--card-cursor-x", `${x.toFixed(2)}%`);
      node.style.setProperty("--card-cursor-y", `${y.toFixed(2)}%`);
      node.style.setProperty("--card-tilt-x", `${(-offsetY * 1.4).toFixed(2)}deg`);
      node.style.setProperty("--card-tilt-y", `${(offsetX * 1.9).toFixed(2)}deg`);
    });

    node.addEventListener("pointerleave", resetPointerGlow);
    resetPointerGlow();
  });
}

function setPage(page) {
  state.currentPage = page;
  const meta = PAGE_META[page] || PAGE_META.upstream;
  setText("page-label", meta.label);
  setText("page-title", meta.title);
  setText("page-description", meta.description);

  document.querySelectorAll("[data-page]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.page === page);
  });
  document.querySelectorAll(".page-view").forEach((view) => {
    view.classList.toggle("is-active", view.dataset.view === page);
  });

  refreshMotionDelays(document);
  replayHeaderMotion();
}

function onboardingStatusClass(step) {
  if (step?.complete) return "is-complete";
  if (step?.required === false) return "is-optional";
  return "is-pending";
}

function onboardingStatusText(step) {
  if (step?.complete) return "已完成";
  if (step?.required === false) return "可选";
  return "待完成";
}

function dependencyInstallStatusClass(status) {
  if (status === "ready") return "is-ready";
  if (status === "installing") return "is-installing";
  if (status === "needs_login") return "is-needs-login";
  if (status === "failed") return "is-failed";
  return "is-missing";
}

function dependencyInstallStatusText(status) {
  if (status === "ready") return "已就绪";
  if (status === "installing") return "安装中";
  if (status === "needs_login") return "待登录";
  if (status === "failed") return "失败";
  return "待安装";
}

function closeDependencyLog() {
  const backdrop = $("dependency-log-backdrop");
  if (backdrop) backdrop.hidden = true;
}

function openDependencyLog(title, text) {
  setText("dependency-log-title", title || "依赖日志");
  const body = $("dependency-log-text");
  if (body) body.textContent = text || "还没有日志。";
  const backdrop = $("dependency-log-backdrop");
  if (backdrop) backdrop.hidden = false;
}

function renderDependencyInstallGrid(report = {}) {
  const grid = $("onboarding-install-grid");
  if (!grid) return;
  const installItems = Object.values(report.installItems || {});
  if (!installItems.length) {
    grid.innerHTML = "";
    return;
  }

  grid.innerHTML = installItems
    .map((item) => {
      const installAction =
        item.id === "sau"
          ? "install-sau"
          : item.id === "patchrightChromium"
            ? "install-patchright-chromium"
            : item.id === "dreamina"
              ? "install-dreamina"
              : "";
      const pathLine = item.currentPath
        ? `<div><strong>当前路径</strong><span>${item.currentPath}</span></div>`
        : "";
      const progressValue = Math.max(0, Math.min(1, Number(item.progress || 0)));
      const progressPercent = `${Math.round(progressValue * 100)}%`;
      const progressLabel = safeString(
        item.progressLabel,
        item.status === "ready"
          ? "依赖已就绪"
          : item.status === "needs_login"
            ? "还需完成登录授权"
            : item.status === "failed"
              ? "请查看日志后重试"
              : "等待开始安装"
      );
      const viewLogButton = `<button class="secondary-action compact" type="button" data-action="view-dependency-log" data-dependency-id="${item.id}">查看日志</button>`;
      const primaryButton = item.installable
        ? `<button class="secondary-action compact" type="button" data-action="${installAction}" data-dependency-id="${item.id}">${item.actionLabel || "执行操作"}</button>`
        : `<button class="secondary-action compact" type="button" disabled>${item.actionLabel || "随安装包内置"}</button>`;
      return `
        <article class="onboarding-install-card">
          <div class="onboarding-install-head">
            <div class="onboarding-install-copy">
              <strong>${item.label}</strong>
              <p>${item.message || "等待检查状态。"}</p>
            </div>
            <span class="onboarding-install-status ${dependencyInstallStatusClass(item.status)}">${dependencyInstallStatusText(item.status)}</span>
          </div>
          <div class="onboarding-install-meta">
            ${pathLine}
            <div><strong>托管方式</strong><span>${item.managedByApp ? "由应用管理" : "外部依赖/手动目录"}</span></div>
          </div>
          <div class="dependency-progress-block">
            <div class="dependency-progress-track ${item.indeterminate ? "is-indeterminate" : ""}">
              <div class="dependency-progress-fill" style="width: ${item.indeterminate ? "42%" : progressPercent};"></div>
            </div>
            <div class="dependency-progress-meta">
              <span>${progressLabel}</span>
              <strong>${item.indeterminate ? "进行中" : progressPercent}</strong>
            </div>
          </div>
          <div class="onboarding-install-actions">
            ${primaryButton}
            ${viewLogButton}
          </div>
        </article>
      `;
    })
    .join("");
}

function closeOnboarding() {
  state.onboardingDismissed = true;
  state.onboardingManual = false;
  const backdrop = $("onboarding-backdrop");
  if (backdrop) backdrop.hidden = true;
}

function openOnboarding({ manual = false } = {}) {
  state.onboardingDismissed = false;
  state.onboardingManual = manual;
  const backdrop = $("onboarding-backdrop");
  if (backdrop) backdrop.hidden = false;
}

function syncOnboardingVisibility() {
  const backdrop = $("onboarding-backdrop");
  if (!backdrop) return;
  const onboarding = state.dashboard?.onboarding;
  if (!onboarding) {
    backdrop.hidden = true;
    return;
  }
  const shouldShow = state.onboardingManual || (!onboarding.complete && !state.onboardingDismissed);
  backdrop.hidden = !shouldShow;
}

function renderOnboarding() {
  const onboarding = state.dashboard?.onboarding;
  const localConfig = state.dashboard?.localConfig;
  const dependencyReport = state.dashboard?.dependencyReport || {};
  const desktopAutomation = state.dashboard?.desktopAutomation || {};
  const accountsSummary = state.dashboard?.accounts?.summary || {
    xiaohongshu: { enabled: 0 },
    douyin: { enabled: 0 }
  };

  if (!onboarding || !localConfig) {
    syncOnboardingVisibility();
    return;
  }

  setText("onboarding-summary-badge", onboarding.complete ? "已完成" : `${onboarding.blockingCount} 步待完成`);
  setText("onboarding-summary-text", onboarding.summary || "先完成首次启动基础配置。");
  const installItems = Object.values(dependencyReport?.installItems || {});
  const installReadyCount = installItems.filter((item) => item?.status === "ready").length;
  setText(
    "onboarding-install-summary",
    installItems.length
      ? `核心安装项已就绪 ${installReadyCount}/${installItems.length}，程序资源、Python、sau、Chromium 和 Dreamina 会集中在这里处理。`
      : "先确认程序资源、内置 Python 和外部依赖的安装状态。"
  );
  renderDependencyInstallGrid(dependencyReport);

  const stepGrid = $("onboarding-step-grid");
  if (stepGrid) {
    stepGrid.innerHTML = (onboarding.steps || [])
      .map((step, index) => `
        <article class="onboarding-step-card">
          <div class="onboarding-step-head">
            <strong>步骤 ${index + 1} · ${step.title}</strong>
            <span class="onboarding-step-pill ${onboardingStatusClass(step)}">${onboardingStatusText(step)}</span>
          </div>
          <p>${step.description || ""}</p>
        </article>
      `)
      .join("");
  }

  const pythonInput = $("onboarding-python-bin");
  if (pythonInput) pythonInput.value = safeString(localConfig.runtime?.pythonBin || dependencyReport?.recommendedConfig?.pythonBin, "");
  const dreaminaInput = $("onboarding-dreamina-root");
  if (dreaminaInput) dreaminaInput.value = safeString(localConfig.image?.dreaminaCliRoot || dependencyReport?.recommendedConfig?.dreaminaCliRoot, "");
  const deviceInput = $("onboarding-device-dir");
  if (deviceInput) deviceInput.value = safeString(localConfig.image?.deviceImageDir || dependencyReport?.recommendedConfig?.deviceImageDir, "");
  const downloadsInput = $("onboarding-downloads-dir");
  if (downloadsInput) downloadsInput.value = safeString(localConfig.image?.downloadsDir || dependencyReport?.recommendedConfig?.downloadsDir, "");
  const hairColorInput = $("onboarding-hair-color-dir");
  if (hairColorInput) hairColorInput.value = safeString(localConfig.video?.hairColorReferenceDir, "");
  const videoDownloadsInput = $("onboarding-video-downloads-dir");
  if (videoDownloadsInput) videoDownloadsInput.value = safeString(localConfig.video?.downloadsDir || state.dashboard?.paths?.videoDownloadsDir, "");
  const sauInput = $("onboarding-sau-root");
  if (sauInput) sauInput.value = safeString(localConfig.publish?.sauRoot || dependencyReport?.recommendedConfig?.sauRoot, "");
  setValue("onboarding-image-provider", safeString(localConfig.image?.provider, "dreamina"));
  setValue("onboarding-nano-banana-model", safeString(localConfig.image?.nanoBananaModel, "gemini-3-pro-image-preview-high"));
  setValue("onboarding-nano-banana-api-base", safeString(localConfig.image?.nanoBananaApiBase, ""));
  const onboardingGeminiInput = $("onboarding-gemini-api-key");
  if (onboardingGeminiInput) {
    onboardingGeminiInput.value = "";
    onboardingGeminiInput.placeholder = localConfig.apiKeys?.hasGemini
      ? "已本机保存，留空则不修改"
      : "用户自备 Gemini Key，仅本机保存";
  }

  const automationEnabled = $("onboarding-automation-enabled");
  if (automationEnabled) automationEnabled.checked = Boolean(desktopAutomation.enabled);
  const automationTime = $("onboarding-automation-time");
  if (automationTime) automationTime.value = safeString(desktopAutomation.dailyTime, "09:00");

  const enabledCount = (accountsSummary.xiaohongshu.enabled || 0) + (accountsSummary.douyin.enabled || 0);
  setText(
    "onboarding-accounts-summary",
    enabledCount > 0
      ? `当前已有 ${enabledCount} 个已启用账号`
      : "还没有已启用账号，建议至少先登录一个账号。"
  );
  const detectedCount = Object.values(dependencyReport?.items || {}).filter((item) => item?.detected).length;
  setText(
    "onboarding-dependency-summary",
    detectedCount > 0
      ? `已识别 ${detectedCount}/5 项常用路径或依赖，可以直接套用后再保存。`
      : "还没有识别本机目录和依赖，建议先点一次自动识别。"
  );

  syncOnboardingVisibility();
}

function setEnvironmentStatus(report) {
  const inspect = report?.inspect;
  const plan = report?.plan;
  const checks = [
    Boolean(inspect),
    Boolean(plan?.results?.image?.ready),
    Boolean(plan?.results?.video?.ready),
    Boolean(plan?.results?.xiaohongshu?.ready),
    Boolean(plan?.results?.douyin?.ready)
  ];
  const readyCount = checks.filter(Boolean).length;

  setStatusItem("env-config", inspect ? "已就绪" : "未就绪", Boolean(inspect));
  setStatusItem("env-image", plan?.results?.image?.ready ? "已就绪" : "未就绪", Boolean(plan?.results?.image?.ready));
  setStatusItem("env-video", plan?.results?.video?.ready ? "已就绪" : "未就绪", Boolean(plan?.results?.video?.ready));
  setStatusItem("env-xhs", plan?.results?.xiaohongshu?.ready ? "已就绪" : "未就绪", Boolean(plan?.results?.xiaohongshu?.ready));
  setStatusItem("env-douyin", plan?.results?.douyin?.ready ? "已就绪" : "未就绪", Boolean(plan?.results?.douyin?.ready));

  setText("env-summary", readyCount === 5 ? "全部执行条件已就绪" : `就绪 ${readyCount}/5`);
  setText("env-checked-at", formatDateTimeLabel(report?.checkedAt, nowLabel()));
}

function clearEnvironmentStatus() {
  setStatusItem("env-config", "未检查", null);
  setStatusItem("env-image", "未检查", null);
  setStatusItem("env-video", "未检查", null);
  setStatusItem("env-xhs", "未检查", null);
  setStatusItem("env-douyin", "未检查", null);
  setText("env-summary", "尚未检查");
  setText("env-checked-at", "—");
}

function applyBriefView() {
  if (!state.dashboard) return;

  const bestBriefRoot = state.dashboard.bestBrief || {};
  const activeBrief = getSelectedBrief();
  const briefDraft = state.dashboard.briefDraft || {};
  const activeIndex = getSelectedBriefIndex();
  const candidateBriefs = getCandidateBriefs();
  const isWinner = activeBrief?.brief_id === bestBriefRoot?.winner?.brief?.brief_id;

  const generatedOutline = [
    activeBrief.hook,
    activeBrief.copy_outline?.paragraph_1,
    activeBrief.copy_outline?.paragraph_2,
    activeBrief.copy_outline?.paragraph_3
  ]
    .filter(Boolean)
    .join("\n\n");

  const defaultTitle = activeBrief.title_options?.[0] || activeBrief.topic_name || "等待今日主题";
  const promptMatchesActive = state.dashboard?.prompt?.brief?.brief_id === activeBrief?.brief_id;
  const displayTitle = (isWinner || promptMatchesActive) ? (state.dashboard.prompt?.publish?.title || defaultTitle) : defaultTitle;
  const scoreText = isWinner
    ? (bestBriefRoot?.winner?.selection_score ? `评分 ${bestBriefRoot.winner.selection_score}` : "待选择")
    : `候选 ${activeIndex + 1}/${candidateBriefs.length || 1}`;
  const draftApplies = briefDraft?.briefId && briefDraft.briefId === activeBrief?.brief_id;

  setText("winner-topic", safeString(activeBrief.topic_name, "等待今日主题"));
  setText("brief-score", scoreText);
  setText("main-title", safeString(displayTitle));
  setText("best-platform", safeString(activeBrief.platform));
  setText("best-audience", safeString(activeBrief.audience));
  setText("brief-goal", safeString(activeBrief.content_goal));

  const angleInput = $("brief-angle-input");
  if (angleInput) angleInput.value = draftApplies ? (briefDraft.coreAngle || activeBrief.core_angle || "") : (activeBrief.core_angle || "");
  const outlineInput = $("brief-outline-input");
  if (outlineInput) {
    outlineInput.value = draftApplies ? (briefDraft.outlineText || generatedOutline) : generatedOutline;
  }
}

function applyActiveBriefSnapshot(activeBriefPayload) {
  if (!state.dashboard || !activeBriefPayload?.brief) return;
  state.dashboard.activeBrief = activeBriefPayload;
  state.selectedBriefId = activeBriefPayload.brief.brief_id || null;
  applyBriefView();
}

function applyDashboard(dashboard, environment = null) {
  state.dashboard = dashboard;
  state.environmentReport = environment || dashboard.environmentReport || state.environmentReport;
  state.selectedBriefId =
    dashboard.activeBrief?.brief?.brief_id ||
    dashboard.bestBrief?.winner?.brief?.brief_id ||
    dashboard.briefs?.items?.[0]?.brief_id ||
    null;

  const upstream = dashboard.upstream || {};
  const bestBriefRoot = dashboard.bestBrief || {};
  const resolvedRouteMode = bestBriefRoot.route_mode || upstream.routeMode || null;
  const rankedBriefs = Array.isArray(bestBriefRoot.ranked) && bestBriefRoot.ranked.length
    ? bestBriefRoot.ranked
    : (Array.isArray(dashboard.briefs?.items) ? dashboard.briefs.items : []);
  const selectedOrWinnerBrief =
    dashboard.activeBrief?.brief ||
    dashboard.bestBrief?.winner?.brief ||
    dashboard.briefs?.items?.[0] ||
    null;
  const prompt = dashboard.prompt || {};
  const snapshot = stageSnapshot(dashboard);

  setText("product-name", safeString(dashboard.meta.productName));
  setText("dashboard-date", safeString(dashboard.meta.date));
  setText("route-mode-badge", translateRouteMode(resolvedRouteMode));

  setText("metric-hot-count", String(upstream.hotCandidateCount || 0).padStart(2, "0"));
  setText("metric-brand-count", String(upstream.brandCandidateCount || 0).padStart(2, "0"));
  setText("metric-route", translateRouteMode(resolvedRouteMode));
  setText("metric-briefs", String(bestBriefRoot.ranked?.length || dashboard.briefs?.count || 0).padStart(2, "0"));
  setText("publish-platform", safeString(selectedOrWinnerBrief?.platform));
  const publishImages = Array.isArray(dashboard.publishImages) ? dashboard.publishImages : [];
  const accountsSummary = dashboard.accounts?.summary || {
    xiaohongshu: { enabled: 0, total: 0 },
    douyin: { enabled: 0, total: 0 }
  };
  setText(
    "latest-image-path",
    publishImages.length
      ? `共 ${publishImages.length} 张 · ${publishImages.map((imagePath) => imagePath.split("/").pop()).join(" / ")}`
      : "还没有可发布的 3 张图片"
  );
  setText("publish-xhs-accounts", `${accountsSummary.xiaohongshu.enabled} 个已启用`);
  setText("publish-douyin-accounts", `${accountsSummary.douyin.enabled} 个已启用`);

  setText("xhs-body", prompt.publish?.xhs_body || "尚未生成今日小红书内容。");
  setText("douyin-body", prompt.publish?.douyin_note_text || "尚未生成今日抖音内容。");

  setText("settings-product-name", safeString(dashboard.meta.productName));
  setText("settings-root-path", safeString(dashboard.paths.productStudioRoot));
  setText("settings-runtime-path", safeString(dashboard.paths.runtimeRoot));
  setText("settings-image-path", safeString(dashboard.paths.imageDownloadsDir));
  setText("settings-python-bin", safeString(dashboard.localConfig?.runtime?.pythonBin || dashboard.dependencyReport?.recommendedConfig?.pythonBin));
  setText("settings-dependency-state", dashboard.dependencyReport?.ready ? "核心依赖已识别" : "仍需补齐依赖");
  const imageProvider = dashboard.localConfig?.image?.provider || "dreamina";
  setText("settings-image-provider", imageProvider === "nano_banana_pro" ? "Nano Banana Pro" : "Dreamina CLI");
  setText("settings-gemini-key-state", dashboard.localConfig?.apiKeys?.hasGemini ? "已配置" : "未配置");
  const videoPlan = dashboard.environmentReport?.plan?.results?.video || {};
  const videoRefs =
    videoPlan.reference_images ||
    dashboard.mediaGeneration?.videoReferenceImages ||
    dashboard.videoGallery?.item?.referenceImages ||
    [];
  const deviceRefs =
    videoPlan.device_reference_images ||
    dashboard.mediaGeneration?.videoDeviceReferenceImages ||
    dashboard.videoGallery?.item?.deviceReferenceImages ||
    [];
  const selectedHair =
    videoPlan.hair_color_reference_image ||
    dashboard.mediaGeneration?.selectedHairColorImage ||
    dashboard.videoGallery?.item?.hairColorReferenceImage ||
    dashboard.localConfig?.video?.selectedHairColorImage ||
    "";
  setText(
    "settings-video-reference-state",
    videoRefs.length
      ? `设备图 ${deviceRefs.length}/3 · 发色图 ${selectedHair ? "1/1" : "0/1"}`
      : "将使用 3 张设备图 + 1 张发色图"
  );
  setValue("media-hair-color-dir", safeString(dashboard.localConfig?.video?.hairColorReferenceDir, ""));
  setValue("media-video-downloads-dir", safeString(dashboard.localConfig?.video?.downloadsDir || dashboard.paths?.videoDownloadsDir, ""));
  setValue("video-page-hair-color-image", safeString(dashboard.localConfig?.video?.selectedHairColorImage, ""));
  setValue("media-nano-banana-model", safeString(dashboard.localConfig?.image?.nanoBananaModel, "gemini-3-pro-image-preview-high"));
  setValue("onboarding-nano-banana-model", safeString(dashboard.localConfig?.image?.nanoBananaModel, "gemini-3-pro-image-preview-high"));
  setValue("media-nano-banana-api-base", safeString(dashboard.localConfig?.image?.nanoBananaApiBase, ""));
  setValue("onboarding-nano-banana-api-base", safeString(dashboard.localConfig?.image?.nanoBananaApiBase, ""));
  const providerInput = $("media-image-provider");
  if (providerInput) providerInput.value = imageProvider;
  const geminiInput = $("media-gemini-api-key");
  if (geminiInput) {
    geminiInput.value = "";
    geminiInput.placeholder = dashboard.localConfig?.apiKeys?.hasGemini
      ? "已本机保存，留空则不修改"
      : "用户自备 Key，仅本机保存";
  }
  const videoModelValue = safeString(dashboard.localConfig?.video?.modelVersion, "seedance2.0_vip");
  const videoDurationValue = String(dashboard.localConfig?.video?.duration || 15);
  const videoRatioValue = safeString(dashboard.localConfig?.video?.ratio, "16:9");
  const videoResolutionValue = safeString(dashboard.localConfig?.video?.videoResolution, "720p");
  setValue("media-video-model", videoModelValue);
  setValue("video-page-model", videoModelValue);
  setValue("media-video-duration", videoDurationValue);
  setValue("video-page-duration", videoDurationValue);
  setValue("media-video-ratio", videoRatioValue);
  setValue("video-page-ratio", videoRatioValue);
  setValue("media-video-resolution", videoResolutionValue);
  setValue("video-page-resolution", videoResolutionValue);
  const desktopAutomation = dashboard.desktopAutomation || {};
  setText("automation-status-badge", desktopAutomation.enabled ? "已开启" : "未开启");
  setText("automation-enabled-state", desktopAutomation.enabled ? "开启" : "关闭");
  setText("automation-daily-time", safeString(desktopAutomation.dailyTime, "09:00"));
  setText("automation-next-run", formatDateTimeLabel(desktopAutomation.nextRunAt, "未安排"));
  setText("automation-last-run", formatDateTimeLabel(desktopAutomation.lastRunAt, "尚未执行"));
  setText(
    "automation-template-mode",
    desktopAutomation.templateMode === "selected-3-current"
      ? "使用当前已选 3 套模板"
      : safeString(desktopAutomation.templateMode)
  );
  setText("automation-xhs-enabled", `${accountsSummary.xiaohongshu.enabled} 个`);
  setText("automation-douyin-enabled", `${accountsSummary.douyin.enabled} 个`);
  setText("automation-last-result", safeString(desktopAutomation.lastResultSummary, "尚未执行"));
  const automationEnabledInput = $("automation-enabled-input");
  if (automationEnabledInput) automationEnabledInput.checked = Boolean(desktopAutomation.enabled);
  const automationTimeInput = $("automation-time-input");
  if (automationTimeInput) automationTimeInput.value = safeString(desktopAutomation.dailyTime, "09:00");

  const videoAutomation = dashboard.videoAutomation || {};
  setText("video-automation-status-badge", videoAutomation.enabled ? "已开启" : "未开启");
  setText("video-automation-enabled-state", videoAutomation.enabled ? "开启" : "关闭");
  setText("video-automation-daily-time", safeString(videoAutomation.dailyTime, "09:30"));
  setText("video-automation-next-run", formatDateTimeLabel(videoAutomation.nextRunAt, "未安排"));
  setText("video-automation-last-run", formatDateTimeLabel(videoAutomation.lastRunAt, "尚未执行"));
  setText(
    "video-automation-workflow-mode",
    videoAutomation.workflowMode === "generate-then-publish-current-video"
      ? "先生成当前视频，再发布到已启用平台"
      : safeString(videoAutomation.workflowMode)
  );
  setText("video-automation-xhs-enabled", `${accountsSummary.xiaohongshu.enabled} 个`);
  setText("video-automation-douyin-enabled", `${accountsSummary.douyin.enabled} 个`);
  setText("video-automation-last-result", safeString(videoAutomation.lastResultSummary, "尚未执行"));
  const videoAutomationEnabledInput = $("video-automation-enabled-input");
  if (videoAutomationEnabledInput) videoAutomationEnabledInput.checked = Boolean(videoAutomation.enabled);
  const videoAutomationTimeInput = $("video-automation-time-input");
  if (videoAutomationTimeInput) videoAutomationTimeInput.value = safeString(videoAutomation.dailyTime, "09:30");
  const hotItems = (upstream.hotCandidates || []).slice(0, 3).map((item) => ({
    label: "热点",
    title: item.title || item.topic_name || "未命中强相关热点",
    note: item.source || item.summary || item.route_reason || ""
  }));
  renderSimpleList("hot-pool-list", hotItems, "今天暂时没有强相关热点。");

  const brandItems = rankedBriefs.slice(0, 3).map((item) => ({
    label: "品牌候选",
    title: item.topic_name || "待生成",
    note: `${item.content_type || "主题"} · ${item.platform || "平台待定"}`
  }));
  renderSimpleList("brand-pool-list", brandItems, "品牌兜底候选尚未生成。");

  const imageEl = $("latest-image");
  const placeholder = $("image-placeholder");
  if (imageEl && placeholder) {
    if (dashboard.latestImage) {
      imageEl.src = localPathToAssetUrl(dashboard.latestImage);
      imageEl.classList.add("visible");
      placeholder.style.display = "none";
    } else {
      imageEl.removeAttribute("src");
      imageEl.classList.remove("visible");
      placeholder.style.display = "grid";
    }
  }

  updatePipeline(snapshot);
  if (state.selectedBriefId && !getCandidateBriefs().some((item) => item.brief_id === state.selectedBriefId)) {
    state.selectedBriefId = null;
  }
  applyBriefView();
  state.selectedTemplates = normalizeSelectedTemplates(dashboard.templateSelection);
  state.selectedVideoTemplateId = resolveVideoTemplateId(
    dashboard.localConfig?.video?.templateId ||
      dashboard.videoGallery?.item?.templateId ||
      dashboard.environmentReport?.plan?.results?.video?.template_id ||
      dashboard.videoTemplateCatalog?.defaultTemplateId
  );
  renderTemplateSelection();
  renderVideoTemplateSelection();
  renderVideoGeneration();
  renderAccountsView();
  refreshMotionDelays(document);
  bindPointerSurfaces(document);
  logOutput(dashboard.texts.executionMarkdown || "等待操作…");

  const env = environment || dashboard.environmentReport || state.environmentReport;
  if (env) setEnvironmentStatus(env);
  renderOnboarding();
}

async function refreshDashboard(environment = null) {
  const dashboard = await window.desktopApp.loadDashboard();
  applyDashboard(dashboard, environment || state.environmentReport || null);
}

async function runAction(action, extra = {}) {
  const date = state.dashboard?.meta?.date;
  const resolvedAction = action === "refresh-upstream" && state.currentPage === "upstream"
    ? "refresh-news"
    : action;

  if (action === "check-environment") {
    setButtonsBusy(true);
    setActionStatus({ action, state: "running", progress: 0.08, indeterminate: true });
    logOutput("检查环境中…");
    try {
      const report = await window.desktopApp.checkEnvironment();
      state.environmentReport = report;
      setEnvironmentStatus(report);
      const output = [report.raw.inspect.stdout?.trim(), report.raw.plan.stdout?.trim()].filter(Boolean).join("\n\n");
      logOutput(output || "环境检查已完成。");
      await refreshDashboard(report);
    } finally {
      setButtonsBusy(false);
    }
    return;
  }

  if (action === "open-onboarding") {
    openOnboarding({ manual: true });
    renderOnboarding();
    return;
  }

  if (action === "inspect-dependencies") {
    setButtonsBusy(true);
    setActionStatus({ action, state: "running", progress: 0.22, indeterminate: true });
    logOutput("正在识别本机常见依赖…");
    try {
      const report = await window.desktopApp.inspectDependencies();
      if (state.dashboard) {
        state.dashboard.dependencyReport = report;
      }
      renderOnboarding();
      setText("settings-dependency-state", report?.ready ? "核心依赖已识别" : "仍需补齐依赖");
      setActionStatus({
        action,
        state: "success",
        progress: 1,
        detail: report?.ready ? "常见依赖已识别完成。" : "已识别一部分依赖，请确认路径后保存。",
        stepLabel: "识别完成"
      });
      const lines = Object.values(report?.items || {}).map((item) => `${item.label}：${item.detected ? item.value : "未识别"}`);
      logOutput(lines.length ? lines.join("\n") : "没有识别到可用依赖。");
      await refreshDashboard(state.environmentReport);
    } finally {
      setButtonsBusy(false);
    }
    return;
  }

  if (action === "inspect-bundled-dependencies") {
    setButtonsBusy(true);
    setActionStatus({ action, state: "running", progress: 0.18, indeterminate: true });
    logOutput("正在刷新安装初始化状态…");
    try {
      const report = await window.desktopApp.inspectBundledDependencies();
      if (state.dashboard) {
        state.dashboard.dependencyReport = report;
      }
      renderOnboarding();
      setText("settings-dependency-state", report?.ready ? "核心依赖已就绪" : "仍需补齐依赖");
      setActionStatus({
        action,
        state: "success",
        progress: 1,
        detail: "安装初始化状态已刷新。",
        stepLabel: "刷新完成"
      });
      const lines = Object.values(report?.installItems || {}).map((item) => `${item.label}：${dependencyInstallStatusText(item.status)}`);
      logOutput(lines.length ? lines.join("\n") : "暂时没有安装项状态。");
      await refreshDashboard(state.environmentReport);
    } finally {
      setButtonsBusy(false);
    }
    return;
  }

  if (action === "save-local-config") {
    setButtonsBusy(true);
    setActionStatus({ action, state: "running", progress: 0.22, indeterminate: true });
    logOutput("保存首次启动本地路径中…");
    try {
      const payload = {
        pythonBin: $("onboarding-python-bin")?.value || "",
        dreaminaCliRoot: $("onboarding-dreamina-root")?.value || "",
        deviceImageDir: $("onboarding-device-dir")?.value || "",
        downloadsDir: $("onboarding-downloads-dir")?.value || "",
        imageDir: $("onboarding-downloads-dir")?.value || "",
        videoHairColorReferenceDir: $("onboarding-hair-color-dir")?.value || "",
        videoDownloadsDir: $("onboarding-video-downloads-dir")?.value || "",
        sauRoot: $("onboarding-sau-root")?.value || "",
        imageProvider: $("onboarding-image-provider")?.value || "dreamina",
        nanoBananaModel: $("onboarding-nano-banana-model")?.value || "gemini-3-pro-image-preview-high",
        nanoBananaApiBase: $("onboarding-nano-banana-api-base")?.value || ""
      };
      const onboardingGeminiApiKey = $("onboarding-gemini-api-key")?.value || "";
      if (onboardingGeminiApiKey) {
        payload.geminiApiKey = onboardingGeminiApiKey;
        payload.nanoBananaApiKey = onboardingGeminiApiKey;
      }
      const result = await window.desktopApp.saveLocalConfig(payload);
      state.environmentReport = null;
      clearEnvironmentStatus();
      setActionStatus({
        action,
        state: result?.ok ? "success" : "error",
        progress: result?.ok ? 1 : 0.92,
        detail: result?.ok ? "本地路径已保存到客户端配置。" : "本地路径保存失败。",
        stepLabel: result?.ok ? "保存完成" : "保存失败"
      });
      logOutput(result?.ok ? `本地配置已保存到\n${result.path}` : "本地配置保存失败。");
      await refreshDashboard(null);
    } finally {
      setButtonsBusy(false);
    }
    return;
  }

  if (action === "save-media-config") {
    setButtonsBusy(true);
    setActionStatus({ action, state: "running", progress: 0.22, indeterminate: true });
    logOutput("保存媒体生成配置中…");
    try {
      const geminiApiKey = $("media-gemini-api-key")?.value || "";
      const selectedVideoTemplateId = resolveVideoTemplateId(
        state.selectedVideoTemplateId || state.dashboard?.localConfig?.video?.templateId
      );
      const payload = {
        imageProvider: $("media-image-provider")?.value || "dreamina",
        nanoBananaModel: $("media-nano-banana-model")?.value || state.dashboard?.localConfig?.image?.nanoBananaModel || "gemini-3-pro-image-preview-high",
        nanoBananaApiBase: $("media-nano-banana-api-base")?.value || "",
        videoTemplateId: selectedVideoTemplateId,
        videoHairColorReferenceDir: $("media-hair-color-dir")?.value || "",
        videoDownloadsDir: $("media-video-downloads-dir")?.value || "",
        videoSelectedHairColorImage: $("video-page-hair-color-image")?.value || "",
        videoModelVersion: mediaConfigInputValue("video-page-model", "media-video-model", "seedance2.0_vip"),
        videoDuration: Number(mediaConfigInputValue("video-page-duration", "media-video-duration", 15)),
        videoRatio: mediaConfigInputValue("video-page-ratio", "media-video-ratio", "16:9"),
        videoResolution: mediaConfigInputValue("video-page-resolution", "media-video-resolution", "720p")
      };
      if (geminiApiKey) {
        payload.geminiApiKey = geminiApiKey;
        payload.nanoBananaApiKey = geminiApiKey;
      }
      const result = await window.desktopApp.saveLocalConfig(payload);
      state.environmentReport = null;
      clearEnvironmentStatus();
      setActionStatus({
        action,
        state: result?.ok ? "success" : "error",
        progress: result?.ok ? 1 : 0.92,
        detail: result?.ok ? "媒体生成配置已保存到本机。" : "媒体生成配置保存失败。",
        stepLabel: result?.ok ? "保存完成" : "保存失败"
      });
      logOutput(result?.ok ? `媒体生成配置已保存到本机 local.json\n${result.path}` : "媒体生成配置保存失败。");
      await refreshDashboard(null);
    } finally {
      setButtonsBusy(false);
    }
    return;
  }

  if (action === "clear-video-hair-color") {
    setButtonsBusy(true);
    try {
      setValue("video-page-hair-color-image", "");
      const result = await window.desktopApp.saveLocalConfig({
        videoSelectedHairColorImage: "",
        videoHairColorReferenceDir: $("media-hair-color-dir")?.value || state.dashboard?.localConfig?.video?.hairColorReferenceDir || "",
        videoDownloadsDir: $("media-video-downloads-dir")?.value || state.dashboard?.localConfig?.video?.downloadsDir || ""
      });
      logOutput(result?.ok ? "已切换为随机发色测试：下次生成会从发色图库随机选择 1 张。" : "随机发色设置保存失败。");
      await refreshDashboard(null);
    } finally {
      setButtonsBusy(false);
    }
    return;
  }

  if (action === "save-onboarding-automation") {
    setButtonsBusy(true);
    setActionStatus({ action, state: "running", progress: 0.22, indeterminate: true });
    logOutput("保存首次启动自动化默认值中…");
    try {
      const payload = {
        enabled: Boolean($("onboarding-automation-enabled")?.checked),
        dailyTime: $("onboarding-automation-time")?.value || "09:00"
      };
      const result = await window.desktopApp.saveAutomationSettings(payload);
      setActionStatus({
        action,
        state: result?.ok ? "success" : "error",
        progress: result?.ok ? 1 : 0.92,
        detail: result?.ok ? "自动化默认值已保存。" : "自动化默认值保存失败。",
        stepLabel: result?.ok ? "保存完成" : "保存失败"
      });
      logOutput(result?.ok ? `自动化默认值已保存到\n${result.path}` : "自动化默认值保存失败。");
      await refreshDashboard(state.environmentReport);
    } finally {
      setButtonsBusy(false);
    }
    return;
  }

  if (action === "install-sau" || action === "install-patchright-chromium") {
    const dependencyId = action === "install-sau" ? "sau" : "patchrightChromium";
    setButtonsBusy(true);
    setActionStatus({ action, state: "running", progress: 0.18, indeterminate: true });
    logOutput(action === "install-sau" ? "正在安装 sau…" : "正在准备 patchright Chromium…");
    try {
      const result = await window.desktopApp.installBundledDependency({ id: dependencyId });
      if (state.dashboard && result?.dependencyReport) {
        state.dashboard.dependencyReport = result.dependencyReport;
      }
      renderOnboarding();
      setActionStatus({
        action,
        state: result?.ok ? "success" : "error",
        progress: result?.ok ? 1 : 0.92,
        detail: result?.ok
          ? `${dependencyId === "sau" ? "sau" : "Chromium"} 已准备完成。`
          : (result?.error || "安装失败，请查看日志。"),
        stepLabel: result?.ok ? "安装完成" : "安装失败"
      });
      logOutput(result?.ok
        ? `${dependencyId === "sau" ? "sau" : "patchright Chromium"} 已完成。\n${safeString(result.installedPath, "")}`
        : (result?.stderr || result?.error || "安装失败。"));
      await refreshDashboard(state.environmentReport);
    } finally {
      setButtonsBusy(false);
    }
    return;
  }

  if (action === "install-dreamina") {
    setButtonsBusy(true);
    setActionStatus({ action, state: "running", progress: 0.18, indeterminate: true });
    logOutput("正在准备 Dreamina 安装或登录授权…");
    try {
      const result = await window.desktopApp.installExternalDependency({ id: "dreamina" });
      if (state.dashboard && result?.dependencyReport) {
        state.dashboard.dependencyReport = result.dependencyReport;
      }
      renderOnboarding();
      const requiresLogin = Boolean(result?.requiresLogin);
      setActionStatus({
        action,
        state: result?.ok ? "success" : "error",
        progress: result?.ok ? 1 : 0.92,
        detail: result?.ok
          ? (requiresLogin ? "Dreamina 已安装完成，下一步请完成登录授权。" : "Dreamina 已安装并通过重新检测。")
          : (result?.error || "Dreamina 安装失败。"),
        stepLabel: result?.ok
          ? (requiresLogin ? "等待登录授权" : "安装完成")
          : "安装失败"
      });
      logOutput(result?.ok
        ? `Dreamina ${requiresLogin ? "已安装，等待登录授权" : "已完成"}。\n${safeString(result.installedPath, "")}`
        : (result?.stderr || result?.error || "Dreamina 安装失败。"));
      await refreshDashboard(state.environmentReport);
    } finally {
      setButtonsBusy(false);
    }
    return;
  }

  if (action === "view-dependency-log") {
    const dependencyId = extra?.dependencyId || "";
    const payload = await window.desktopApp.getDependencyInstallLogs({ id: dependencyId });
    const dependencyLabel = state.dashboard?.dependencyReport?.installItems?.[dependencyId]?.label || "依赖日志";
    openDependencyLog(dependencyLabel, payload?.text || "还没有日志。");
    return;
  }

  if (action === "complete-onboarding") {
    closeOnboarding();
    setActionStatus({
      action,
      state: "success",
      progress: 1,
      detail: "初始化向导已收起，你可以继续进入工作台。",
      stepLabel: "已完成"
    });
    setPage(state.dashboard?.onboarding?.nextPage || "upstream");
    return;
  }

  if (action === "open-outputs") {
    await window.desktopApp.openPath(state.dashboard.paths.outputsDir);
    return;
  }

  if (action === "open-images") {
    const firstImage = currentTemplateResults().find((item) => item.imagePath);
    if (firstImage?.imagePath) {
      openImagePreview(firstImage.imagePath, firstImage.templateName || "生成结果大图");
      return;
    }
    await window.desktopApp.openPath(state.dashboard.paths.imageDownloadsDir);
    return;
  }

  if (action === "open-image-folder") {
    await window.desktopApp.openPath(state.dashboard.paths.imageDownloadsDir);
    return;
  }

  if (action === "open-video") {
    const videoPath = state.dashboard?.videoGallery?.item?.videoPath;
    if (videoPath) {
      await window.desktopApp.openPath(videoPath);
      return;
    }
    logOutput("当前还没有可打开的视频。");
    return;
  }

  if (action === "open-video-folder") {
    await window.desktopApp.openPath(state.dashboard?.paths?.videoDownloadsDir || state.dashboard?.paths?.imageDownloadsDir);
    return;
  }

  if (action === "save-brief-draft") {
    setButtonsBusy(true);
    setActionStatus({ action, state: "running", progress: 0.32, stepLabel: "写入 brief 草稿" });
    logOutput("保存 brief 修改中…");
    try {
      const payload = {
        date,
        briefId: getSelectedBrief()?.brief_id || null,
        topicName: getSelectedBrief()?.topic_name || null,
        coreAngle: $("brief-angle-input")?.value || "",
        outlineText: $("brief-outline-input")?.value || ""
      };
      const result = await window.desktopApp.saveBriefDraft(payload);
      if (result?.ok && result?.activeBrief) {
        applyActiveBriefSnapshot(result.activeBrief);
      }
      setActionStatus({
        action,
        state: result?.ok ? "success" : "error",
        progress: result?.ok ? 1 : 0.92,
        detail: result?.ok ? "brief 已更新，下游资产已重建，旧的 3 张图已自动失效。" : (result?.error || "brief 草稿保存失败。"),
        stepLabel: result?.ok ? "保存完成" : "保存失败"
      });
      logOutput(
        result?.ok
          ? `brief 修改已保存到\n${result.path}\n\n旧的 3 张模板图已自动失效，请重新生成图片。`
          : (result?.error || "brief 保存失败。")
      );
      await refreshDashboard(state.environmentReport);
    } finally {
      setButtonsBusy(false);
    }
    return;
  }

  if (action === "save-desktop-automation") {
    setButtonsBusy(true);
    setActionStatus({ action, state: "running", progress: 0.24, stepLabel: "写入自动化设置" });
    logOutput("保存本地自动化设置中…");
    try {
      const payload = {
        kind: "desktop",
        enabled: Boolean($("automation-enabled-input")?.checked),
        dailyTime: $("automation-time-input")?.value || "09:00"
      };
      const result = await window.desktopApp.saveAutomationSettings(payload);
      setActionStatus({
        action,
        state: result?.ok ? "success" : "error",
        progress: result?.ok ? 1 : 0.92,
        detail: result?.ok ? "本地自动化设置已保存。" : "自动化设置保存失败。",
        stepLabel: result?.ok ? "保存完成" : "保存失败"
      });
      logOutput(result?.ok ? `自动化设置已保存到\n${result.path}` : "自动化设置保存失败。");
      await refreshDashboard(state.environmentReport);
    } finally {
      setButtonsBusy(false);
    }
    return;
  }

  if (action === "save-video-automation") {
    setButtonsBusy(true);
    setActionStatus({ action, state: "running", progress: 0.24, stepLabel: "保存视频自动化" });
    logOutput("正在保存视频自动化设置…");
    try {
      const payload = {
        kind: "video",
        enabled: Boolean($("video-automation-enabled-input")?.checked),
        dailyTime: $("video-automation-time-input")?.value || "09:30"
      };
      const result = await window.desktopApp.saveAutomationSettings(payload);
      setActionStatus({
        action: resolvedAction,
        state: result?.ok ? "success" : "error",
        progress: result?.ok ? 1 : 0.92,
        detail: result?.ok ? "视频自动化设置已保存。" : "视频自动化设置保存失败。",
        stepLabel: result?.ok ? "保存完成" : "保存失败"
      });
      logOutput(result?.ok ? `视频自动化设置已保存到\n${result.path}` : "视频自动化设置保存失败。");
      await refreshDashboard(state.environmentReport);
    } finally {
      setButtonsBusy(false);
    }
    return;
  }

  if (action === "reselect-brief") {
    const candidateBriefs = getCandidateBriefs();
    if (!candidateBriefs.length) {
      setActionStatus({
        action,
        state: "error",
        progress: 1,
        detail: "当前没有可切换的候选 brief。",
        stepLabel: "无候选"
      });
      logOutput("当前没有可切换的候选 brief。");
      return;
    }

    const currentIndex = getSelectedBriefIndex();
    const nextIndex = (currentIndex + 1) % candidateBriefs.length;
    const nextBrief = candidateBriefs[nextIndex];
    setButtonsBusy(true);
    setActionStatus({
      action,
      state: "running",
      progress: 0.36,
      stepLabel: `切换到候选 ${nextIndex + 1}`
    });
    logOutput(`正在切换到候选 brief：${nextBrief?.topic_name || "未命名候选"}…`);
    try {
      const result = await window.desktopApp.selectBrief({
        date,
        briefId: nextBrief?.brief_id || null
      });
      if (!result?.ok) {
        setActionStatus({
          action,
          state: "error",
          progress: 0.92,
          detail: result?.error || "候选 brief 切换失败。",
          stepLabel: "切换失败"
        });
        logOutput(result?.error || "候选 brief 切换失败。");
        return;
      }
      if (result?.activeBrief) {
        applyActiveBriefSnapshot(result.activeBrief);
      } else {
        state.selectedBriefId = nextBrief?.brief_id || null;
        applyBriefView();
      }
      setActionStatus({
        action,
        state: "success",
        progress: 1,
        detail: `已切换到候选 ${nextIndex + 1}/${candidateBriefs.length}，下游资产已同步刷新，旧的 3 张图已失效。`,
        stepLabel: "切换完成"
      });
      logOutput(`已切换到候选 brief：${nextBrief?.topic_name || "未命名候选"}\n\n旧的 3 张模板图已自动失效，请重新生成图片。`);
      await refreshDashboard(state.environmentReport);
    } finally {
      setButtonsBusy(false);
    }
    return;
  }

  const workflowActions = new Set([
    "refresh-news",
    "refresh-upstream",
    "run-daily",
    "execute-image",
    "execute-video",
    "execute-video-regenerate",
    "execute-video-xiaohongshu",
    "execute-video-douyin",
    "execute-video-publish",
    "execute-xiaohongshu",
    "execute-douyin",
    "execute-publish",
    "run-desktop-automation",
    "run-video-automation"
  ]);
  if (!workflowActions.has(resolvedAction)) return;

  setButtonsBusy(true);
  setActionStatus({ action: resolvedAction, state: "running", progress: 0.08, indeterminate: true });
  logOutput("运行中…");
  try {
    const result = await window.desktopApp.runWorkflowAction({ action: resolvedAction, product: "ransebao", date, ...extra });
    if (result?.background) {
      logOutput(result.stdout || "任务已提交，正在后台执行。");
      if (resolvedAction === "execute-image" || resolvedAction === "execute-video" || resolvedAction === "execute-video-regenerate") {
        await refreshDashboard(state.environmentReport);
      }
      return;
    }

    if (result?.busy) {
      logOutput(result.stdout || "当前任务仍在后台执行，请稍等。");
      return;
    }

    if (!result?.ok) {
      setActionStatus({
        action,
        state: "error",
        progress: 0.92,
        detail: "执行过程中出现错误，请检查下方日志。",
        stepLabel: "执行失败"
      });
    }
    logOutput(formatWorkflowOutput(result));

    const report = await window.desktopApp.checkEnvironment();
    state.environmentReport = report;
    setEnvironmentStatus(report);
    await refreshDashboard(report);
  } finally {
    setButtonsBusy(false);
  }
}

async function refreshEnvironmentAndDashboard() {
  const report = await window.desktopApp.checkEnvironment();
  state.environmentReport = report;
  setEnvironmentStatus(report);
  await refreshDashboard(report);
}

async function handleAccountLogin(event) {
  event.preventDefault();
  if (!state.accountModal?.platform) return;
  const platform = state.accountModal.platform;
  const displayName = $("account-display-name-input")?.value || "";
  const accountName = $("account-name-input")?.value || "";
  setButtonsBusy(true);
  setActionStatus({
    action: "login-account",
    state: "running",
    progress: 0.24,
    indeterminate: true,
    detail: `正在发起${platform === "xiaohongshu" ? "小红书" : "抖音"}登录流程。`,
    stepLabel: "等待登录完成"
  });
  logOutput("登录流程已启动，等待浏览器完成登录…");
  try {
    const result = await window.desktopApp.loginAccount({
      platform,
      displayName,
      accountName,
      accountId: state.accountModal.accountId || null
    });
    if (result?.ok) {
      setActionStatus({
        action: "login-account",
        state: "success",
        progress: 1,
        detail: `${result.account?.displayName || result.account?.accountName} 已登录成功。`,
        stepLabel: "登录完成"
      });
      logOutput(result?.result?.stdout?.trim() || "账号登录成功。");
      closeAccountModal();
      await refreshEnvironmentAndDashboard();
      return;
    }
    setActionStatus({
      action: "login-account",
      state: "error",
      progress: 0.94,
      detail: result?.error || "登录失败，请检查浏览器流程后重试。",
      stepLabel: "登录失败"
    });
    logOutput(result?.result?.stderr?.trim() || result?.error || "账号登录失败。");
    await refreshDashboard(state.environmentReport);
  } finally {
    setButtonsBusy(false);
  }
}

async function runAccountCheck(accountId) {
  setButtonsBusy(true);
  setActionStatus({
    action: "check-account",
    state: "running",
    progress: 0.28,
    indeterminate: true,
    stepLabel: "检测账号连通性"
  });
  logOutput("正在检测账号连通性…");
  try {
    const result = await window.desktopApp.checkAccount({ accountId });
    setActionStatus({
      action: "check-account",
      state: result?.ok ? "success" : "error",
      progress: result?.ok ? 1 : 0.94,
      detail: result?.ok ? "账号检测通过。" : (result?.error || "账号检测失败。"),
      stepLabel: result?.ok ? "检测完成" : "检测失败"
    });
    logOutput(result?.result?.stdout?.trim() || result?.result?.stderr?.trim() || (result?.ok ? "账号检测通过。" : "账号检测失败。"));
    await refreshEnvironmentAndDashboard();
  } finally {
    setButtonsBusy(false);
  }
}

async function toggleAccountEnabled(accountId, enabled) {
  setButtonsBusy(true);
  setActionStatus({
    action: "toggle-account",
    state: "running",
    progress: 0.4,
    stepLabel: enabled ? "启用账号" : "停用账号"
  });
  try {
    await window.desktopApp.toggleAccountEnabled({ accountId, enabled });
    setActionStatus({
      action: "toggle-account",
      state: "success",
      progress: 1,
      detail: enabled ? "账号已启用，会进入发布范围。" : "账号已停用，不再参与发布。",
      stepLabel: "状态已更新"
    });
    logOutput(enabled ? "账号已启用。" : "账号已停用。");
    await refreshEnvironmentAndDashboard();
  } finally {
    setButtonsBusy(false);
  }
}

async function removeAccount(accountId) {
  setButtonsBusy(true);
  setActionStatus({
    action: "remove-account",
    state: "running",
    progress: 0.36,
    stepLabel: "移除账号"
  });
  try {
    await window.desktopApp.removeAccount({ accountId });
    setActionStatus({
      action: "remove-account",
      state: "success",
      progress: 1,
      detail: "账号已移除。",
      stepLabel: "移除完成"
    });
    logOutput("账号已从当前客户端配置中移除。");
    await refreshEnvironmentAndDashboard();
  } finally {
    setButtonsBusy(false);
  }
}

function bindNavigation() {
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => setPage(button.dataset.page));
  });
  document.querySelectorAll("[data-page-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.closest("#onboarding-backdrop")) closeOnboarding();
      setPage(button.dataset.pageJump);
    });
  });
}

function bindMirroredConfigControls() {
  [
    ["video-page-model", "media-video-model"],
    ["video-page-duration", "media-video-duration"],
    ["video-page-ratio", "media-video-ratio"],
    ["video-page-resolution", "media-video-resolution"]
  ].forEach(([videoId, settingsId]) => {
    const videoControl = $(videoId);
    const settingsControl = $(settingsId);
    if (!videoControl || !settingsControl) return;
    const sync = (source, target) => {
      target.value = source.value;
      if (videoId === "video-page-ratio") applyVideoPreviewRatio(source.value);
    };
    videoControl.addEventListener("change", () => sync(videoControl, settingsControl));
    settingsControl.addEventListener("change", () => sync(settingsControl, videoControl));
  });
}

function bindTemplateExperience() {
  const backdrop = $("template-modal-backdrop");
  const closeButton = $("template-modal-close");
  const imagePreviewBackdrop = $("image-preview-backdrop");
  const imagePreviewClose = $("image-preview-close");
  const dependencyLogBackdrop = $("dependency-log-backdrop");
  const dependencyLogClose = $("dependency-log-close");
  if (closeButton) {
    closeButton.addEventListener("click", closeTemplateModal);
  }
  if (backdrop) {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeTemplateModal();
    });
  }
  if (imagePreviewClose) {
    imagePreviewClose.addEventListener("click", closeImagePreview);
  }
  if (imagePreviewBackdrop) {
    imagePreviewBackdrop.addEventListener("click", (event) => {
      if (event.target === imagePreviewBackdrop) closeImagePreview();
    });
  }
  if (dependencyLogClose) {
    dependencyLogClose.addEventListener("click", closeDependencyLog);
  }
  if (dependencyLogBackdrop) {
    dependencyLogBackdrop.addEventListener("click", (event) => {
      if (event.target === dependencyLogBackdrop) closeDependencyLog();
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!$("image-preview-backdrop")?.hidden) closeImagePreview();
      if (!$("template-modal-backdrop")?.hidden) closeTemplateModal();
      if (!$("account-modal-backdrop")?.hidden) closeAccountModal();
      if (!$("onboarding-backdrop")?.hidden) closeOnboarding();
      if (!$("dependency-log-backdrop")?.hidden) closeDependencyLog();
    }
  });
}

function bindOnboardingExperience() {
  const backdrop = $("onboarding-backdrop");
  const closeButton = $("onboarding-close");
  if (closeButton) {
    closeButton.addEventListener("click", closeOnboarding);
  }
  if (backdrop) {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeOnboarding();
    });
  }
  document.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-pick-path]");
    if (!trigger) return;
    const inputId = trigger.dataset.pickPath;
    const input = $(inputId);
    if (!input) return;
    const result = await window.desktopApp.pickPath({
      type: trigger.dataset.pickKind || "directory",
      title: trigger.dataset.pickTitle || "选择路径",
      defaultPath: input.value || ""
    });
    if (!result?.canceled && result?.path) {
      input.value = result.path;
    }
  });
}

function bindAccountExperience() {
  const backdrop = $("account-modal-backdrop");
  const closeButton = $("account-modal-close");
  const form = $("account-modal-form");
  if (closeButton) {
    closeButton.addEventListener("click", closeAccountModal);
  }
  if (backdrop) {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeAccountModal();
    });
  }
  if (form) {
    form.addEventListener("submit", (event) => {
      void handleAccountLogin(event);
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-account-open], [data-account-relogin], [data-account-check], [data-account-toggle], [data-account-remove]");
    if (!target) return;

    if (target.dataset.accountOpen) {
      openAccountModal(target.dataset.accountOpen);
      return;
    }
    if (target.dataset.accountRelogin) {
      const accountId = target.dataset.accountRelogin;
      const account = [...currentAccounts("xiaohongshu"), ...currentAccounts("douyin")].find((item) => item.id === accountId);
      if (account) openAccountModal(account.platform, account.id);
      return;
    }
    if (target.dataset.accountCheck) {
      void runAccountCheck(target.dataset.accountCheck);
      return;
    }
    if (target.dataset.accountToggle) {
      const enabled = target.dataset.accountEnabled !== "1";
      void toggleAccountEnabled(target.dataset.accountToggle, enabled);
      return;
    }
    if (target.dataset.accountRemove) {
      void removeAccount(target.dataset.accountRemove);
    }
  });
}

function bindSidebarFloat() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;

  const resetSidebarGlow = () => {
    sidebar.style.setProperty("--sidebar-cursor-x", "50%");
    sidebar.style.setProperty("--sidebar-cursor-y", "12%");
  };

  sidebar.addEventListener("pointermove", (event) => {
    const rect = sidebar.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    sidebar.style.setProperty("--sidebar-cursor-x", `${x.toFixed(2)}%`);
    sidebar.style.setProperty("--sidebar-cursor-y", `${y.toFixed(2)}%`);
  });

  sidebar.addEventListener("pointerleave", resetSidebarGlow);
  resetSidebarGlow();
}

async function bootstrap() {
  bindNavigation();
  bindMirroredConfigControls();
  bindTemplateExperience();
  bindAccountExperience();
  bindOnboardingExperience();
  bindSidebarFloat();
  document.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget || actionTarget.disabled) return;
    event.preventDefault();
    const extra = {};
    if (actionTarget.dataset.slot) extra.slot = Number(actionTarget.dataset.slot);
    if (actionTarget.dataset.dependencyId) extra.dependencyId = actionTarget.dataset.dependencyId;
    void runAction(actionTarget.dataset.action, extra);
  });
  if (window.desktopApp.onWorkflowProgress) {
    window.desktopApp.onWorkflowProgress((payload) => {
      void handleWorkflowProgress(payload);
    });
  }
  if (window.desktopApp.onDependencyProgress) {
    window.desktopApp.onDependencyProgress((payload) => {
      handleDependencyProgress(payload);
    });
  }

  setPage(state.currentPage);
  setActionStatus({ action: "idle", state: "idle", progress: 0, stepLabel: "尚未开始" });
  const report = await window.desktopApp.checkEnvironment();
  state.environmentReport = report;
  setEnvironmentStatus(report);
  await refreshDashboard(report);
  refreshMotionDelays(document);
  bindPointerSurfaces(document);
}

bootstrap();
