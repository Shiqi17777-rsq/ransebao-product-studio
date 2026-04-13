const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function deriveData({ baseImage, logoImage, briefJson, promptJson }) {
  const brief = readJson(briefJson)?.winner?.brief || {};
  const prompt = readJson(promptJson);
  const title = prompt.main_title || brief.title_options?.[0] || brief.topic_name || "";
  const subtitle = prompt.sub_title || brief.core_angle || "";
  const points = Array.isArray(prompt.sell_points) ? prompt.sell_points.slice(0, 4) : [];
  const fallback = ["结果更稳", "沟通更清楚", "体验更安心", "信任更容易建立"];
  while (points.length < 4) {
    points.push(fallback[points.length]);
  }

  return {
    kicker: prompt.template?.name || "黑底炫彩版",
    title,
    subtitle,
    points,
    baseImageUrl: pathToFileURL(baseImage).href,
    logoImageUrl: pathToFileURL(logoImage).href
  };
}

async function exportPoster() {
  const productStudioRoot = path.resolve(__dirname, "..", "..");
  const templateDir = path.join(productStudioRoot, "poster-templates", "black-prismatic");
  const templateHtml = path.join(templateDir, "index.html");

  const baseImage = argValue("--base-image");
  const logoImage = argValue("--logo-image");
  const briefJson = argValue("--brief-json");
  const promptJson = argValue("--prompt-json");
  const output = argValue("--output");

  if (!baseImage || !logoImage || !briefJson || !promptJson || !output) {
    console.error("Missing required args.");
    process.exit(1);
  }

  const data = deriveData({ baseImage, logoImage, briefJson, promptJson });
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 2560,
    useContentSize: true,
    backgroundColor: "#00000000",
    webPreferences: {
      backgroundThrottling: false
    }
  });

  await win.loadURL(pathToFileURL(templateHtml).href);
  await win.webContents.executeJavaScript(`window.renderPoster(${JSON.stringify(data)})`, true);
  await new Promise((resolve) => setTimeout(resolve, 120));
  const image = await win.webContents.capturePage();
  ensureDir(output);
  fs.writeFileSync(output, image.toPNG());
  console.log(output);
  win.destroy();
}

app.whenReady().then(async () => {
  try {
    await exportPoster();
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
