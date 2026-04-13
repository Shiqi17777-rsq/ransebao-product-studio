# Dashboard Core

这里放“工作台状态快照”的共享组装逻辑。

当前已经开始收进来的内容：

- `loadDashboard`

这一层负责：

- 从 runtime / state / outputs 读取当前真实状态
- 组装页面所需的只读快照
- 保证 Mac / Windows 看到同一套 dashboard 语义

这一层不应该负责：

- 平台下载
- 安装器
- PowerShell / shell
- 文件选择器
- 系统弹窗
