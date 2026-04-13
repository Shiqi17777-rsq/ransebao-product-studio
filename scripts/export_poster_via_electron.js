const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function compact(text, fallback = "") {
  const normalized = typeof text === "string" ? text.trim().replace(/\s+/g, " ") : "";
  return normalized || fallback;
}

function deriveData({ briefPath, promptPath, titleOverride, subtitleOverride }) {
  const briefRoot = JSON.parse(fs.readFileSync(briefPath, "utf8"));
  const prompt = JSON.parse(fs.readFileSync(promptPath, "utf8"));
  const brief = briefRoot?.winner?.brief || {};
  const titleOptions = Array.isArray(brief.title_options) ? brief.title_options : [];
  const topicName = brief.topic_name || "";
  const firstTitle = titleOptions[0] || topicName || "染色宝";
  const headline = titleOverride || firstTitle;
  const subtitle = subtitleOverride || brief.core_angle || prompt.sub_title || "";
  const sellPoints = Array.isArray(prompt.sell_points) ? prompt.sell_points.slice(0, 4) : [];
  while (sellPoints.length < 4) {
    sellPoints.push(["信任更容易建立", "判断更明确", "体验更安心", "沟通更轻松"][sellPoints.length] || "专业价值");
  }
  return {
    headline: compact(headline, "染色宝"),
    subtitle: compact(subtitle, ""),
    points: sellPoints.map((item) => compact(item, "专业价值")).slice(0, 4),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const templatePath = args.template;
  const baseImage = args["base-image"];
  const logoImage = args["logo-image"];
  const briefPath = args["brief-json"];
  const promptPath = args["prompt-json"];
  const outputPath = args.output;

  if (!templatePath || !baseImage || !logoImage || !briefPath || !promptPath || !outputPath) {
    throw new Error("Missing required args: --template --base-image --logo-image --brief-json --prompt-json --output");
  }

  const payload = {
    ...deriveData({
      briefPath,
      promptPath,
      titleOverride: args.title,
      subtitleOverride: args.subtitle,
    }),
    baseImageUrl: pathToFileURL(path.resolve(baseImage)).href,
    logoImageUrl: pathToFileURL(path.resolve(logoImage)).href,
  };

  const templateHtml = fs.readFileSync(templatePath, "utf8");
  const injectedHtml = templateHtml.replace(
    "</head>",
    `  <script>window.__POSTER_DATA__ = ${JSON.stringify(payload)};</script>\n</head>`
  );

  const tempHtmlPath = path.join(os.tmpdir(), `ransebao-poster-${Date.now()}.html`);
  fs.writeFileSync(tempHtmlPath, injectedHtml, "utf8");

  await app.whenReady();
  const win = new BrowserWindow({
    width: 1440,
    height: 2560,
    show: false,
    backgroundColor: "#000000",
    webPreferences: {
      sandbox: false,
      contextIsolation: false,
    },
  });

  try {
    await win.loadURL(pathToFileURL(tempHtmlPath).href);
    await win.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const started = Date.now();
        const timer = setInterval(() => {
          if (window.__POSTER_READY__ === true) {
            clearInterval(timer);
            resolve(true);
          } else if (window.__POSTER_READY__ === 'error') {
            clearInterval(timer);
            reject(new Error('poster render failed'));
          } else if (Date.now() - started > 8000) {
            clearInterval(timer);
            reject(new Error('poster render timeout'));
          }
        }, 60);
      });
    `);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const image = await win.webContents.capturePage();
    fs.writeFileSync(outputPath, image.toPNG());
    console.log(outputPath);
  } finally {
    win.destroy();
    try {
      fs.unlinkSync(tempHtmlPath);
    } catch {}
    app.quit();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
