# Windows Adapter

Windows 层只处理这些事：

- 安装包 / 便携版
- Windows 路径
- PowerShell / CMD / 进程拉起
- 下载落盘
- `%AppData%` / 用户目录
- 安装器问题

不要在这里重写：

- 上游逻辑
- brief 逻辑
- prompt 逻辑
- 执行状态定义
- UI 成功/失败判定
