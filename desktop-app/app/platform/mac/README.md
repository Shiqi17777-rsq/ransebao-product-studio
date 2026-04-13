# macOS Adapter

macOS 层只处理这些事：

- `.app/.dmg`
- shell 命令执行
- macOS 路径
- 用户目录与首启行为
- 系统弹窗 / 文件选择

不要在这里复制一套核心业务逻辑。
