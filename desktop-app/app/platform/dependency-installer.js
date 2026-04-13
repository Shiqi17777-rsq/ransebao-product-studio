const fs = require("fs");
const path = require("path");

function createDependencyInstaller(deps) {
  async function installBundledDependency(id) {
    if (!["sau", "patchrightChromium"].includes(id)) {
      return deps.dependencyResult(false, id, {
        error: "当前只支持安装 sau 和 patchright Chromium。"
      });
    }

    deps.setDependencyInstallState(id, {
      status: "installing",
      managedByApp: true,
      lastAttemptAt: new Date().toISOString(),
      lastError: "",
      progress: 0.06,
      progressLabel: id === "sau" ? "准备创建内部虚拟环境" : "准备下载浏览器运行时",
      indeterminate: true
    });

    if (id === "sau") {
      const pythonBin = deps.ensureManagedBundledPythonRuntime() || deps.resolvePythonBin(deps.readLocalRuntimeConfig());
      const sourceRoot = deps.bundledSauSourceRoot();
      const wheelPath = deps.bundledSauWheelPath();
      const wheelhouse = deps.bundledSauWheelhouseRoot();
      const venvRoot = deps.managedSauVenvRoot();
      const venvPython = deps.expectedManagedSauPythonPath(venvRoot);

      if (!pythonBin || !fs.existsSync(pythonBin)) {
        const message = "未找到可用的 Python 运行时，无法创建内部 sau 虚拟环境。";
        deps.setDependencyInstallState(id, {
          status: "failed",
          lastError: message,
          progress: 0.94,
          progressLabel: "创建环境失败",
          indeterminate: false
        });
        deps.writeDependencyLog(id, `${message}\n`);
        return deps.dependencyResult(false, id, { error: message });
      }

      if (!sourceRoot && !wheelPath) {
        const message = "未找到打包内置的 sau 安装材料，请先执行打包准备脚本。";
        deps.setDependencyInstallState(id, {
          status: "failed",
          lastError: message,
          progress: 0.94,
          progressLabel: "安装材料缺失",
          indeterminate: false
        });
        deps.writeDependencyLog(id, `${message}\n`);
        return deps.dependencyResult(false, id, { error: message });
      }

      fs.mkdirSync(path.dirname(venvRoot), { recursive: true });
      fs.rmSync(venvRoot, { recursive: true, force: true });
      deps.setDependencyInstallState(id, {
        progress: 0.18,
        progressLabel: "创建 sau 虚拟环境",
        indeterminate: true
      });
      const venvCreate = await deps.runLoggedProcess(id, pythonBin, ["-m", "venv", venvRoot], {
        cwd: deps.productStudioRoot
      });
      if (!venvCreate.ok) {
        deps.setDependencyInstallState(id, {
          status: "failed",
          lastError: "创建 sau 虚拟环境失败。",
          progress: 0.94,
          progressLabel: "创建环境失败",
          indeterminate: false
        });
        return deps.dependencyResult(false, id, {
          error: "创建 sau 虚拟环境失败。",
          stdout: venvCreate.stdout,
          stderr: venvCreate.stderr
        });
      }

      deps.ensureManagedSauWindowsPyvenvCfg(pythonBin);

      const installArgs = ["-m", "pip", "install", "--upgrade", "--force-reinstall"];
      if (wheelhouse) {
        installArgs.push("--no-index");
        installArgs.push("--find-links", wheelhouse);
      }
      if (wheelPath) {
        installArgs.push(wheelPath);
      } else if (sourceRoot) {
        installArgs.push(sourceRoot);
      }
      deps.setDependencyInstallState(id, {
        progress: 0.42,
        progressLabel: "离线安装 sau 依赖",
        indeterminate: true
      });
      const installResult = await deps.runLoggedProcess(id, venvPython, installArgs, {
        cwd: sourceRoot || deps.productStudioRoot
      });
      if (!installResult.ok) {
        deps.setDependencyInstallState(id, {
          status: "failed",
          lastError: "安装 sau 失败。",
          progress: 0.94,
          progressLabel: "安装失败",
          indeterminate: false
        });
        return deps.dependencyResult(false, id, {
          error: "安装 sau 失败。",
          stdout: installResult.stdout,
          stderr: installResult.stderr
        });
      }

      deps.ensureManagedSauWindowsPyvenvCfg(pythonBin);

      deps.writeLocalRuntimeConfig({
        sauRoot: venvRoot
      });
      deps.setDependencyInstallState(id, {
        status: "ready",
        managedByApp: true,
        currentPath: venvRoot,
        installedAt: new Date().toISOString(),
        lastError: "",
        progress: 1,
        progressLabel: "安装完成",
        indeterminate: false
      });
      const dependencyReport = await deps.refreshDependencyArtifacts(deps.readLocalRuntimeConfig());
      return deps.dependencyResult(true, id, {
        installedPath: venvRoot,
        dependencyReport
      });
    }

    const sauPython = deps.managedSauPythonPath();
    if (!sauPython || !fs.existsSync(sauPython)) {
      const message = "请先安装 sau，再准备 patchright Chromium。";
      deps.setDependencyInstallState(id, {
        status: "failed",
        lastError: message,
        progress: 0.94,
        progressLabel: "等待 sau 就绪",
        indeterminate: false
      });
      deps.writeDependencyLog(id, `${message}\n`);
      return deps.dependencyResult(false, id, { error: message });
    }
    deps.ensureManagedSauWindowsPyvenvCfg();

    const browsersPath = deps.managedPatchrightBrowsersPath();
    fs.mkdirSync(browsersPath, { recursive: true });
    let patchrightStage = "prepare";
    let lastPatchrightProgress = 0.08;
    const updatePatchrightProgress = (progress, label) => {
      const normalized = Math.max(0, Math.min(0.98, progress));
      if (Math.abs(normalized - lastPatchrightProgress) >= 0.01 || label) {
        lastPatchrightProgress = normalized;
        deps.setDependencyInstallState(id, {
          progress: normalized,
          progressLabel: label || "准备浏览器运行时",
          indeterminate: false
        });
      }
    };
    deps.setDependencyInstallState(id, {
      progress: 0.08,
      progressLabel: "下载 Chromium 主程序",
      indeterminate: false
    });
    const installResult = await deps.runLoggedProcess(id, sauPython, ["-m", "patchright", "install", "chromium"], {
      cwd: deps.managedSauVenvRoot(),
      env: {
        PLAYWRIGHT_BROWSERS_PATH: browsersPath
      },
      onChunk: ({ text }) => {
        if (text.includes("Downloading Chrome for Testing")) {
          patchrightStage = "chromium";
          updatePatchrightProgress(0.08, "下载 Chromium 主程序");
        } else if (text.includes("Chrome for Testing") && text.includes("downloaded")) {
          patchrightStage = "ffmpeg";
          updatePatchrightProgress(0.72, "准备 FFmpeg");
        } else if (text.includes("Downloading FFmpeg")) {
          patchrightStage = "ffmpeg";
          updatePatchrightProgress(0.74, "下载 FFmpeg");
        } else if (text.includes("FFmpeg") && text.includes("downloaded")) {
          patchrightStage = "headless";
          updatePatchrightProgress(0.82, "准备 Headless Shell");
        } else if (text.includes("Downloading Chrome Headless Shell")) {
          patchrightStage = "headless";
          updatePatchrightProgress(0.84, "下载 Headless Shell");
        }
        const matches = [...text.matchAll(/(\d{1,3})%\s+of/g)];
        const percent = matches.length ? Number(matches[matches.length - 1][1]) : null;
        if (percent === null) return;
        if (patchrightStage === "chromium") {
          updatePatchrightProgress(0.08 + (percent / 100) * 0.62, "下载 Chromium 主程序");
        } else if (patchrightStage === "ffmpeg") {
          updatePatchrightProgress(0.74 + (percent / 100) * 0.08, "下载 FFmpeg");
        } else if (patchrightStage === "headless") {
          updatePatchrightProgress(0.84 + (percent / 100) * 0.14, "下载 Headless Shell");
        }
      }
    });
    if (!installResult.ok) {
      deps.setDependencyInstallState(id, {
        status: "failed",
        lastError: "准备 patchright Chromium 失败。",
        progress: Math.max(lastPatchrightProgress, 0.94),
        progressLabel: "下载失败",
        indeterminate: false
      });
      return deps.dependencyResult(false, id, {
        error: "准备 patchright Chromium 失败。",
        stdout: installResult.stdout,
        stderr: installResult.stderr
      });
    }

    deps.writeLocalRuntimeConfig({
      sauRoot: deps.managedSauVenvRoot(),
      patchrightBrowsersPath: browsersPath
    });
    deps.setDependencyInstallState(id, {
      status: "ready",
      managedByApp: true,
      currentPath: browsersPath,
      installedAt: new Date().toISOString(),
      lastError: "",
      progress: 1,
      progressLabel: "准备完成",
      indeterminate: false
    });
    const dependencyReport = await deps.refreshDependencyArtifacts(deps.readLocalRuntimeConfig());
    return deps.dependencyResult(true, id, {
      installedPath: browsersPath,
      dependencyReport
    });
  }

  async function installExternalDependency(id) {
    if (id !== "dreamina") {
      return deps.dependencyResult(false, id, {
        error: "当前只支持通过客户端安装 Dreamina。"
      });
    }

    const beforeReport = await deps.inspectDependencyReport(deps.readLocalRuntimeConfig());
    const dreaminaItemBefore = beforeReport?.installItems?.dreamina || {};
    const configuredRootBefore =
      deps.configuredString(beforeReport?.recommendedConfig?.dreaminaCliRoot) ||
      deps.configuredString(deps.readLocalRuntimeConfig()?.image?.dreamina_cli_root);
    const canLoginDirectly = Boolean(
      dreaminaItemBefore.detected &&
      configuredRootBefore &&
      !deps.isDirectoryPath(configuredRootBefore)
    );

    deps.setDependencyInstallState(id, {
      status: "installing",
      managedByApp: !canLoginDirectly && process.platform === "win32",
      lastAttemptAt: new Date().toISOString(),
      lastError: "",
      progress: canLoginDirectly ? 0.32 : 0.12,
      progressLabel: canLoginDirectly ? "等待 Dreamina 登录授权" : "执行 Dreamina 官方安装",
      indeterminate: true
    });

    let result;
    if (canLoginDirectly) {
      const command = configuredRootBefore;
      const loginArgs = [dreaminaItemBefore.status === "ready" ? "relogin" : "login"];
      result = await deps.runLoggedProcess(id, command, loginArgs, {
        cwd: deps.resolvedHomeDir(),
        env: deps.dreaminaCommandEnv(command),
        onChunk: ({ text }) => {
          if (text.includes("请在浏览器中完成登录") || text.toLowerCase().includes("open the following url")) {
            deps.setDependencyInstallState(id, {
              progress: 0.54,
              progressLabel: "浏览器已打开，等待完成登录",
              indeterminate: true
            });
          } else if (text.includes("登录成功") || text.includes("login success")) {
            deps.setDependencyInstallState(id, {
              progress: 0.9,
              progressLabel: "登录完成，正在重新检测",
              indeterminate: true
            });
          }
        }
      });
    } else if (process.platform === "win32") {
      const pythonBin = deps.ensureManagedBundledPythonRuntime() || deps.resolvePythonBin(deps.readLocalRuntimeConfig());
      if (!pythonBin || !fs.existsSync(pythonBin)) {
        return deps.dependencyResult(false, id, {
          error: "未找到可用的内置 Python，无法下载 Dreamina。"
        });
      }
      const homeDir = deps.resolvedHomeDir();
      const installDir = path.join(deps.runtimeBaseDir, "vendor", "dreamina", "bin");
      const targetPath = path.join(installDir, "dreamina.exe");
      const skillPath = path.join(homeDir, ".dreamina_cli", "dreamina", "SKILL.md");
      const versionPath = path.join(homeDir, ".dreamina_cli", "version.json");

      const binaryResult = await deps.downloadFileWithElectronNet(
        id,
        "https://lf3-static.bytednsdoc.com/obj/eden-cn/psj_hupthlyk/ljhwZthlaukjlkulzlp/dreamina_cli_beta/dreamina_cli_windows_amd64.exe",
        targetPath,
        {
          progressStart: 0.12,
          progressEnd: 0.72,
          progressLabel: "下载 Dreamina CLI"
        }
      );
      if (!binaryResult.ok) {
        result = binaryResult;
      } else {
        const skillResult = await deps.downloadFileWithElectronNet(
          id,
          "https://lf3-static.bytednsdoc.com/obj/eden-cn/psj_hupthlyk/ljhwZthlaukjlkulzlp/dreamina_cli_beta/SKILL.md",
          skillPath,
          {
            progressStart: 0.72,
            progressEnd: 0.86,
            progressLabel: "同步 Dreamina 附加资源"
          }
        );
        if (!skillResult.ok) {
          result = skillResult;
        } else {
          result = await deps.downloadFileWithElectronNet(
            id,
            "https://lf3-static.bytednsdoc.com/obj/eden-cn/psj_hupthlyk/ljhwZthlaukjlkulzlp/version.json",
            versionPath,
            {
              progressStart: 0.86,
              progressEnd: 0.96,
              progressLabel: "写入版本信息"
            }
          );
        }
      }
    } else {
      let dreaminaInstallProgress = 0.12;
      const updateDreaminaInstallProgress = (progress, label, indeterminate = true) => {
        const normalized = Math.max(0, Math.min(0.98, progress));
        if (Math.abs(normalized - dreaminaInstallProgress) >= 0.01 || label) {
          dreaminaInstallProgress = normalized;
          deps.setDependencyInstallState(id, {
            progress: normalized,
            progressLabel: label,
            indeterminate
          });
        }
      };
      result = await deps.runLoggedProcess(
        id,
        "/bin/zsh",
        ["-lc", "curl -fsSL https://jimeng.jianying.com/cli | bash"],
        {
          cwd: deps.resolvedHomeDir(),
          env: {
            HOME: deps.resolvedHomeDir()
          },
          onChunk: ({ text }) => {
            if (text.includes("下载 ") && text.includes("dreamina_cli_darwin_arm64")) {
              updateDreaminaInstallProgress(0.28, "下载 Dreamina CLI", true);
            } else if (text.includes("下载 ") && text.includes("SKILL.md")) {
              updateDreaminaInstallProgress(0.56, "同步 Dreamina 附加资源", true);
            } else if (text.includes("下载 ") && text.includes("version.json")) {
              updateDreaminaInstallProgress(0.72, "写入版本信息", true);
            } else if (text.includes("已将") && text.includes("PATH")) {
              updateDreaminaInstallProgress(0.84, "写入 PATH", true);
            } else if (text.includes("安装完成")) {
              updateDreaminaInstallProgress(0.94, "安装完成，正在重新检测", true);
            }
          }
        }
      );
    }

    if (!result.ok) {
      deps.setDependencyInstallState(id, {
        status: "failed",
        lastError: canLoginDirectly ? "Dreamina 登录失败。" : "Dreamina 官方安装命令执行失败。",
        progress: 0.94,
        progressLabel: canLoginDirectly ? "登录失败" : "安装失败",
        indeterminate: false
      });
      return deps.dependencyResult(false, id, {
        error: canLoginDirectly ? "Dreamina 登录失败。" : "Dreamina 官方安装命令执行失败。",
        stdout: result.stdout,
        stderr: result.stderr
      });
    }

    const localConfig = deps.readLocalRuntimeConfig();
    const dependencyReport = await deps.refreshDependencyArtifacts(localConfig);
    const recommendedRoot = dependencyReport?.recommendedConfig?.dreaminaCliRoot;
    if (recommendedRoot && !deps.configuredString(localConfig?.image?.dreamina_cli_root)) {
      deps.writeLocalRuntimeConfig({ dreaminaCliRoot: recommendedRoot });
    }

    const nextStatus = dependencyReport?.installItems?.dreamina?.status;
    deps.setDependencyInstallState(id, {
      status: nextStatus === "ready" ? "ready" : nextStatus === "needs_login" ? "needs_login" : "failed",
      managedByApp: Boolean(recommendedRoot && recommendedRoot.startsWith(deps.runtimeBaseDir)),
      currentPath: recommendedRoot || "",
      installedAt: new Date().toISOString(),
      lastError: nextStatus === "ready"
        ? ""
        : nextStatus === "needs_login"
          ? "Dreamina 已安装，但还未完成登录授权。"
          : "安装命令已执行，但尚未检测到可用的 Dreamina 根目录。",
      progress: nextStatus === "ready" ? 1 : nextStatus === "needs_login" ? 0.86 : 0.94,
      progressLabel: nextStatus === "ready" ? "已就绪" : nextStatus === "needs_login" ? "等待登录授权" : "安装失败",
      indeterminate: false
    });

    return deps.dependencyResult(Boolean(dependencyReport?.installItems?.dreamina?.detected), id, {
      installedPath: recommendedRoot || "",
      requiresLogin: nextStatus === "needs_login",
      dependencyReport
    });
  }

  return {
    installBundledDependency,
    installExternalDependency
  };
}

module.exports = {
  createDependencyInstaller
};
