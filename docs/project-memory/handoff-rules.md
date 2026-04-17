# 后续接手规则

## 必读顺序

1. `docs/project-memory/README.md`
2. `docs/project-memory/current-state.md`
3. `docs/project-memory/media-generation.md`
4. `docs/project-memory/ui-style-rules.md`
5. `docs/project-memory/agent-development-rules.md`
6. `desktop-app/docs/mac-win-collaboration-v1.md`

## 分工原则

- 平台差异、Windows 路径、下载、PowerShell、打包问题优先改 `desktop-app/app/platform/**`。
- 工作流成功 / 失败口径优先改 `desktop-app/app/core/workflow/**`。
- 状态协议优先改 `desktop-app/app/core/state/**` 和 `desktop-app/app/contracts/**`。
- 视频生成是独立模块，后续 UI 不应再作为图片模板页的附属配置块处理。
- UI 新增功能必须复用原有工作流舱风格，优先使用 `panel-card`、`settings-row`、`quick-action`、`mini-badge`。
- 后续开发优先采用多 agent 分工：UI、Windows 平台、工作流、模型 adapter、打包测试分别建立上下文。
- 不要在 UI 里自己猜成功。

## 交付前检查

- 新增 Python 文件必须能通过 `py_compile`。
- 新增 JS 文件必须能通过 `node --check`。
- `local.json`、账号、日志、缓存、API Key 不进入 Git。
- Windows portable 构建前先确认 `ransebao-social-auto-upload` 在同级目录。
