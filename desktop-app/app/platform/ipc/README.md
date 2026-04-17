# IPC Adapter

这里放 Electron 主进程里的 IPC 注册层。

职责：

- 注册 `ipcMain.handle(...)`
- 把 preload / renderer 使用的 channel 和共享 core 接起来
- 只做桥接和少量参数整理

不应该放在这里的：

- 工作流业务规则
- 依赖状态机
- UI 成功 / 失败判定
- Windows / macOS 下载实现细节

当前已经抽出来的：

- `register-core-handlers.js`
  - dashboard
  - 依赖检测与安装
  - 路径选择
  - 环境检查
  - 本地配置保存
  - `shell.openPath`
- `register-workbench-handlers.js`
  - 账号管理
  - brief 选择与保存
  - 模板选择保存
  - 自动化默认值保存

配合的平台层窗口 bridge：

- `../window-bridge.js`
  - `createWindow`
  - `activeWindow`
  - workflow/dependency 进度事件发送
- `../lifecycle-bridge.js`
  - app `activate`
  - `window-all-closed`
  - 自动化定时调度
- `../runtime-state-bridge.js`
  - `activeAutomationRun`
  - `activeImageTask`
  - `activeVideoTask`
