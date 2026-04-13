# State Core

这里放桌面客户端共享的状态协议和状态快照逻辑。

当前已经收进来的内容：

- `dependency-status.js`
  - 依赖状态标签
  - install state / dependency report 归一化
  - Dreamina `ready / needs_login / failed` 口径
- `dependency-artifacts.js`
  - 依赖检测快照
  - 本地配置摘要
  - onboarding 完成度判定
  - `current_dependency_report.json` 写回规则

这一层应该只关心：

- 同一个事实在文件、主进程、UI 里如何保持一致
- 哪个状态算 `missing / installing / needs_login / ready / failed`
- 哪些步骤属于首启阻塞项

这一层不应该直接处理：

- PowerShell / zsh
- 下载实现
- 安装器细节
- 文件选择器和系统弹窗
