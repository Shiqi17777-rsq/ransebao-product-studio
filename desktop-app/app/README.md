# Desktop App Modularization

这个目录是 `desktop-app` 后续拆分的起点。

目标不是马上重写整套 Electron，而是先把下面三层拆清楚：

1. `core/`
   - 共享业务逻辑
   - 状态机
   - 文件协议
   - 平台无关的工作流编排
2. `platform/`
   - Windows / macOS 的平台差异
   - 打包、下载、进程拉起、路径、系统弹窗
3. `contracts/`
   - UI 只能消费的状态定义
   - 不能再出现 “planned 被当成 success” 这类口径漂移

当前第一步已经开始：

- 依赖状态协议从 `main.js` 抽到了：
  - [dependency-status.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/core/state/dependency-status.js)

后续拆分优先级：

1. `core/state`
2. `core/workflow`
3. `platform/win`
4. `platform/mac`
5. `ipc`

当前协作边界说明：

- [mac-win-collaboration-v1.md](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/docs/mac-win-collaboration-v1.md)
