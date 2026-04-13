# Desktop App 共享 Core / 平台 Adapter 拆分方案 v1

## 背景

协作边界清单见：

- [mac-win-collaboration-v1.md](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/docs/mac-win-collaboration-v1.md)

当前 `desktop-app/main.js` 已经同时承担了：

- 依赖状态协议
- 首启安装流程
- 工作流编排
- 平台进程拉起
- 路径处理
- 打包态 / 开发态差异
- IPC 入口

这会直接带来两个问题：

1. Mac 和 Windows 很难真正共享稳定逻辑
2. UI 很容易读到“拼接后的状态”，而不是统一状态机

## 当前文件热点

### 共享 core 候选

来自 [main.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/main.js)：

- `inspectDependencyReport`
- `refreshDependencyArtifacts`
- `loadDashboard`
- `runCli`
- `rebuildDownstreamAssetsForBrief`
- `runDesktopAutomationSequence`
- `runWorkflowAction`

这些逻辑本质上都不该是 Windows 专属，也不该是 macOS 专属。

### 平台层候选

同样来自 [main.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/main.js)：

- `installBundledDependency`
- `installExternalDependency`
- Python / Dreamina / sau 路径解析
- 下载落盘
- `spawn(...)`
- 文件选择器
- `shell.openPath`

这些属于平台 adapter。

### 纯协议层候选

第一批已经开始拆：

- [dependency-status.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/core/state/dependency-status.js)
- [status-machine.md](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/contracts/status-machine.md)

## 目标拆分

### 1. `app/core/state/`

职责：

- 依赖状态协议
- 执行状态协议
- 图片生成状态协议
- 发布状态协议
- 状态归一化

### 2. `app/core/workflow/`

职责：

- 上游刷新编排
- brief 选择与生效
- 图片生成编排
- 发布编排
- 自动化流程编排

### 3. `app/platform/win/`

职责：

- Windows 下载
- Windows 进程拉起
- Windows 路径
- Windows 打包/安装器
- PowerShell 和系统行为

### 4. `app/platform/mac/`

职责：

- macOS shell
- `.app/.dmg`
- macOS 路径
- 首启差异

### 5. `preload.js` / IPC

最终职责：

- 只做桥接
- 不包含业务判断
- 不复制状态定义

## 迁移顺序

### Phase 1：协议先抽

先抽：

- 依赖状态协议
- 执行状态协议
- UI 只读状态规则

目标：

- 先解决“同一个事实，主进程 / UI / 文件各说各话”的问题

### Phase 2：工作流编排抽离

把这些从 `main.js` 拆到 `core/workflow/`：

- 上游刷新
- run-daily
- 图片生成
- 发布
- 自动化

目标：

- Windows 和 Mac 共享一套工作流编排

### Phase 3：平台 adapter 下沉

把这些移到 `platform/win` / `platform/mac`：

- 下载
- 安装
- 路径
- 进程
- 打包差异

目标：

- 平台差异不再污染业务层

## 第一刀完成标准

这一轮不要求完成全部拆分，只要求：

1. 有明确目录骨架
2. 有状态协议文档
3. 至少有一部分协议逻辑已经从 `main.js` 抽出
4. 后续 Windows 同事可以按目录直接接手平台层

## 当前状态

这一步已经完成：

- 新建了 `app/` 模块化目录
- 抽出了第一份共享状态协议模块：
  - [dependency-status.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/core/state/dependency-status.js)
- 把依赖检测 / onboarding 判定正式接进了共享状态核心：
  - [dependency-artifacts.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/core/state/dependency-artifacts.js)
- 抽出了共享 dashboard 组装模块：
  - [load-dashboard.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/core/dashboard/load-dashboard.js)
- 抽出了第一份共享工作流编排模块：
  - [orchestrator.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/core/workflow/orchestrator.js)
- 抽出了共享 CLI runner：
  - [cli-runner.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/core/workflow/cli-runner.js)
- 抽出了平台依赖安装 adapter：
  - [dependency-installer.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/dependency-installer.js)
- 抽出了初始化/依赖相关的 IPC 注册 adapter：
  - [register-core-handlers.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/ipc/register-core-handlers.js)
- 抽出了工作台动作的 IPC 注册 adapter：
  - [register-workbench-handlers.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/ipc/register-workbench-handlers.js)
- 抽出了窗口/UI bridge adapter：
  - [window-bridge.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/window-bridge.js)
- 抽出了 app lifecycle / 自动化调度 bridge：
  - [lifecycle-bridge.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/lifecycle-bridge.js)
- 抽出了运行态持有 bridge：
  - [runtime-state-bridge.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/runtime-state-bridge.js)
- 把主进程 / preload 共用的通道名收成了 contract：
  - [event-channels.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/contracts/event-channels.js)
- 把“状态不能乱猜”的规则写成了正式 contract：
  - [status-machine.md](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/contracts/status-machine.md)

下一步最适合继续拆的是：

- 事件与进度通知桥接继续收口
- template / automation handlers 再细分为更薄的 action adapter（如果有必要）
- 主进程 wiring 层继续减负
- orchestrator 相关 action context 再收紧
