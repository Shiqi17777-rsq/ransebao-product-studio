function buildCliArgs(runtimeRoot, command, options = {}) {
  const args = ["-m", "engine.cli", "--runtime-root", runtimeRoot, command, "--product", options.product || "ransebao"];
  if (options.date) args.push("--date", options.date);
  if (options.scope) args.push("--scope", options.scope);
  if (options.templateId) args.push("--template-id", options.templateId);
  if (options.slot) args.push("--slot", String(options.slot));
  if (options.execute) args.push("--execute");
  return args;
}

function parseCliStdout(stdout = "") {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function buildCliEnv() {
  return {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
    PYTHONUNBUFFERED: "1"
  };
}

function formatSpawnError(pythonBin, args, error) {
  return [
    `Failed to start Python workflow runner: ${pythonBin}`,
    error?.message || String(error || ""),
    `Args: ${args.join(" ")}`
  ].filter(Boolean).join("\n");
}

function createCliRunner(deps) {
  function runCli(command, options = {}) {
    const args = buildCliArgs(deps.runtimeBaseDir, command, options);
    const pythonBin = deps.resolvePythonBin(deps.readLocalRuntimeConfig(), options.dependencyReport);

    return new Promise((resolve) => {
      let child = null;
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finalize = (payload) => {
        if (settled) return;
        settled = true;
        resolve(payload);
      };

      try {
        child = deps.spawn(pythonBin, args, {
          cwd: deps.productStudioRoot,
          env: buildCliEnv()
        });
      } catch (error) {
        finalize({
          ok: false,
          code: null,
          stdout,
          stderr: formatSpawnError(pythonBin, args, error),
          parsed: null
        });
        return;
      }

      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        finalize({
          ok: false,
          code: null,
          stdout,
          stderr: stderr || formatSpawnError(pythonBin, args, error),
          parsed: null
        });
      });
      child.on("close", (code) => {
        finalize({
          ok: code === 0,
          code,
          stdout,
          stderr,
          parsed: parseCliStdout(stdout)
        });
      });
    });
  }

  function spawnCliTask(command, options = {}, handlers = {}) {
    const args = buildCliArgs(deps.runtimeBaseDir, command, options);
    const pythonBin = deps.resolvePythonBin(deps.readLocalRuntimeConfig(), options.dependencyReport);
    let child = null;
    let stdout = "";
    let stderr = "";

    try {
      child = deps.spawn(pythonBin, args, {
        cwd: deps.productStudioRoot,
        env: buildCliEnv()
      });
    } catch (error) {
      const formatted = formatSpawnError(pythonBin, args, error);
      handlers.onStderr?.(formatted);
      handlers.onClose?.({
        ok: false,
        code: null,
        stdout,
        stderr: formatted,
        parsed: null
      });
      return null;
    }

    handlers.onStart?.({ command, pid: child.pid, args });

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      handlers.onStdout?.(text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      handlers.onStderr?.(text);
    });
    child.on("error", (error) => {
      stderr ||= formatSpawnError(pythonBin, args, error);
      handlers.onStderr?.(stderr);
      handlers.onClose?.({
        ok: false,
        code: null,
        stdout,
        stderr,
        parsed: null
      });
    });
    child.on("close", (code) => {
      handlers.onClose?.({
        ok: code === 0,
        code,
        stdout,
        stderr,
        parsed: parseCliStdout(stdout)
      });
    });

    return child;
  }

  return {
    runCli,
    spawnCliTask
  };
}

module.exports = {
  buildCliArgs,
  createCliRunner
};
