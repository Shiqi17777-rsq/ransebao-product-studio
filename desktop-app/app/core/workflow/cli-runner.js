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

function createCliRunner(deps) {
  function runCli(command, options = {}) {
    const args = buildCliArgs(deps.runtimeBaseDir, command, options);
    const pythonBin = deps.resolvePythonBin(deps.readLocalRuntimeConfig(), options.dependencyReport);

    return new Promise((resolve) => {
      const child = deps.spawn(pythonBin, args, { cwd: deps.productStudioRoot });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("close", (code) => {
        resolve({
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
    const child = deps.spawn(pythonBin, args, { cwd: deps.productStudioRoot });
    let stdout = "";
    let stderr = "";

    handlers.onStart?.({ command, pid: child.pid, args });

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      handlers.onStdout?.(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      handlers.onStderr?.(text);
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
