# Platform Adapters

这里放平台层差异代码。

原则：

- `core/` 只定义业务规则和状态协议
- `platform/` 只负责把规则接到系统能力上

Windows 负责：

- 路径
- 打包
- 依赖下载
- PowerShell / 进程拉起
- 窗口与系统级 UI bridge
- app lifecycle / 定时调度 bridge
- 运行态持有 bridge
- 安装器与系统提示
- 依赖安装 adapter
- IPC 注册 adapter

macOS 负责：

- `.app/.dmg`
- zsh / shell
- 路径与文件选择
- 窗口与系统级 UI bridge
- app lifecycle / 定时调度 bridge
- 运行态持有 bridge
- 系统级差异
- 依赖安装 adapter
- IPC 注册 adapter
