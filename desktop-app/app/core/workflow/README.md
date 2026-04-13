# Workflow Core

这里放平台无关的桌面工作流编排。

当前已经开始收进来的内容：

- `runCli`
- `spawnCliTask`
- `runWorkflowAction`
- `runDesktopAutomationSequence`
- `rebuildDownstreamAssetsForBrief`

这一层只负责：

- 决定下一步做什么
- 如何串起上游 / brief / 图片 / 发布
- 如何发出统一的执行状态

这一层不应该直接负责：

- Windows PowerShell
- macOS shell
- 下载实现细节
- 安装器行为
- 系统文件选择器

平台差异应该通过依赖注入或 adapter 下沉到：

- `/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/win/`
- `/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/mac/`
