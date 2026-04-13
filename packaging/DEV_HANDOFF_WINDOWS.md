# 染色宝桌面客户端 Windows 开发交接说明

这不是应用安装包，而是给 Windows 开发同学继续开发用的源码交接包。

## 这份交接包里有什么

- `adapters/`
- `desktop-app/`
- `engine/`
- `packaging/`
- `poster-lab/`
- `poster-templates/`
- `products/`
- `runtime/` 的最小骨架
- `scripts/`
- `shared/`

## 这份交接包里刻意不带什么

- `desktop-app/node_modules`
- `desktop-app/release`
- `packaging/bundle-staging`
- 本机运行时输出、日志、缓存、账号和状态文件
- 当前机器的 `local.json`
- 当前机器的 `publish_accounts.json`

## Windows 同学优先看的目录

- `desktop-app/docs/mac-win-collaboration-v1.md`
- `desktop-app/app/platform/`
- `desktop-app/app/platform/ipc/`
- `desktop-app/app/contracts/`

## 当前协作边界

- 共享 core 继续由 Mac 侧收敛：
  - `desktop-app/app/core/state/`
  - `desktop-app/app/core/workflow/`
  - `desktop-app/app/core/dashboard/`
  - `desktop-app/app/contracts/`
- Windows 侧优先接手平台相关：
  - 打包
  - 安装器
  - 下载链
  - PowerShell / 进程拉起
  - Windows 路径和系统差异

## 开发前建议

1. 先看 `desktop-app/docs/mac-win-collaboration-v1.md`
2. 再看 `desktop-app/docs/core-split-v1.md`
3. 然后从 `desktop-app/app/platform/**` 开始接 Windows 层

## 原则

- 平台问题归 `platform`
- 流程和状态问题归 `core`
- 不要在 Windows 侧自己补一套 workflow 判定
- 不要在 UI 里自己猜 success
