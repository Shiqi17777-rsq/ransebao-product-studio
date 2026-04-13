# Desktop App Mac / Windows 协作边界清单 v1

## 目标

这份清单不是讲“理想架构”，而是定义**当前这版代码已经可以怎么分工**。

目标只有两个：

1. 避免 Mac 和 Windows 两边继续在同一层反复补洞
2. 让 Windows 同事可以直接按模块接手平台层，而不是只能提截图

---

## 一句话分工

- **Mac 侧主责**：共享 core、状态协议、工作流编排、dashboard 口径、合同层
- **Windows 侧主责**：Windows 打包、下载、路径、PowerShell、安装链、Windows 原生验机

一句话原则：

**共享逻辑只保留一份，平台差异各自承担。**

---

## 当前代码边界

### 1. 共享 core

这层默认由 Mac 侧主责维护，Windows 侧可以提改动，但不要先在平台层绕过去补逻辑。

#### 状态协议

- [dependency-status.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/core/state/dependency-status.js)
- [dependency-artifacts.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/core/state/dependency-artifacts.js)
- [status-machine.md](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/contracts/status-machine.md)

负责：

- `missing / installing / needs_login / ready / failed`
- install state 和 dependency report 的口径
- onboarding 阻塞步骤定义

Windows 同事不要在 UI 或平台层自己加新状态名。

#### workflow core

- [cli-runner.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/core/workflow/cli-runner.js)
- [orchestrator.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/core/workflow/orchestrator.js)

负责：

- 上游刷新
- brief 生效
- 3 图生成编排
- 发布编排
- 自动化流程编排

Windows 同事不要在 Windows adapter 里再拼一套“成功/失败”的业务判定。

#### dashboard core

- [load-dashboard.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/core/dashboard/load-dashboard.js)

负责：

- 工作台状态快照
- 页面读到的统一 dashboard 结构

Windows 同事不要在 renderer 或主进程 IPC 里额外拼 dashboard 字段。

---

### 2. 平台 adapter

这层就是 Windows 同事最应该直接接手的地方。

#### 平台安装 / 下载

- [dependency-installer.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/dependency-installer.js)

适合 Windows 侧修改：

- Dreamina Windows 下载
- sau 安装
- patchright Chromium
- Windows Python / venv 细节

#### 平台窗口 / 生命周期 / 运行态

- [window-bridge.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/window-bridge.js)
- [lifecycle-bridge.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/lifecycle-bridge.js)
- [runtime-state-bridge.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/runtime-state-bridge.js)

适合 Windows 侧修改：

- Windows 窗口行为
- 生命周期差异
- 定时调度平台差异
- 原生运行态桥接

#### IPC adapter

- [register-core-handlers.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/ipc/register-core-handlers.js)
- [register-workbench-handlers.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/ipc/register-workbench-handlers.js)

适合 Windows 侧修改：

- 参数桥接
- 平台相关错误包装
- handler 注册拆分

不适合在这里做：

- 业务状态重新定义
- workflow 成功/失败规则重写

---

### 3. contract 层

- [event-channels.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/contracts/event-channels.js)

这层默认由 Mac 侧主责。

原因：

- `main.js`
- `preload.js`
- `renderer.js`

都会吃它。  
如果 Windows 侧要改这层，应该先同步，不要单独加一个临时 channel。

---

## 谁应该优先改什么

### Windows 同事优先改

这些问题直接去平台层改，不要先碰 core：

1. Windows 打包失败
2. 安装器问题
3. PowerShell / 下载 / 路径问题
4. Windows Python / venv / Chromium 问题
5. Windows 原生弹窗或文件选择器问题

优先入口：

- [dependency-installer.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/dependency-installer.js)
- [register-core-handlers.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/ipc/register-core-handlers.js)
- [window-bridge.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/window-bridge.js)
- [lifecycle-bridge.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/platform/lifecycle-bridge.js)

### Mac 侧优先改

这些问题优先回到共享 core，不要让 Windows 层自己兜：

1. 第一次点刷新没结果，第二次才有
2. UI 提示成功，但 execution report 其实没执行
3. `planned` 被当成 `success`
4. `ready` 被当成 `executed`
5. brief 改了但下游没一起更新
6. dependency report / install state / dashboard 口径不一致

优先入口：

- [dependency-status.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/core/state/dependency-status.js)
- [dependency-artifacts.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/core/state/dependency-artifacts.js)
- [orchestrator.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/core/workflow/orchestrator.js)
- [load-dashboard.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/core/dashboard/load-dashboard.js)

---

## 不要再做的事

下面这些是当前明确要避免的：

1. 不要在 Windows 侧单独补一套 workflow 判定
2. 不要在 UI 里自己猜“这算成功”
3. 不要在 IPC handler 里偷偷扩业务逻辑
4. 不要绕开共享状态协议去补临时字段
5. 不要在 `main.js` 里继续塞新的大块逻辑

---

## 提交流程建议

### Windows 侧改动前

先判断问题属于哪层：

- 平台差异：直接改 `platform/`
- 状态口径：先同步，优先改 `core/state`
- workflow 结果不一致：优先改 `core/workflow`

### Windows 侧提交后

至少说明这 4 件事：

1. 改的是哪一层  
2. 有没有新增 channel / 新状态 / 新字段  
3. 是否影响 Mac  
4. 在 Windows 上怎么验证

### Mac 侧集成时

重点检查：

1. 有没有把平台问题误修成业务逻辑
2. 有没有新增 UI 自猜状态
3. 有没有破坏共享 contract
4. `node --check` 是否都过

---

## 当前最推荐的协作路线

### Mac 侧继续推进

- 把共享 core 收稳
- 继续让 `main.js` 变成 wiring 层
- 统一状态协议

### Windows 侧继续推进

- 直接接手 `platform/`
- 直接做原生验机
- 直接修 Windows 打包和依赖安装链

这样以后沟通方式就应该变成：

- “这个问题属于 `core/state`，我来改”
- “这个问题属于 `platform/win`，你来改”

而不是：

- “我先在这边补一个”
- “你再在那边补一个”

---

## 当前阶段的验收标准

只要下面这条成立，就说明这套分工开始真正有效：

- Windows 同事后续修 Windows 问题时，主要改的是 `app/platform/**`
- Mac 侧继续收 core 时，不需要再来回捞 Windows 特例

一句话说：

**平台问题归平台层，流程问题归共享 core。**
