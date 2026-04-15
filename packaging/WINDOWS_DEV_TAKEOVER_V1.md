# 染色宝 Windows 客户端开发接手说明 v1

## 1. 完整项目源码

当前没有共同的 Git 远程仓库，也没有可直接拉取的仓库地址。

因此当前开发基线以 **源码交接包** 为准：

- 建议交接包名：
  - `Ransebao-Product-Studio-Source-20260413.zip`

源码包应包含这些目录：

- `desktop-app/`
- `desktop-app/app/core/`
- `desktop-app/app/platform/`
- `desktop-app/app/contracts/`
- `desktop-app/src/`
- `desktop-app/docs/`
- `products/`
- `engine/`
- `adapters/`
- `packaging/`
- `scripts/`
- `shared/`
- `runtime/` 的最小骨架

源码包刻意排除：

- `desktop-app/node_modules`
- `desktop-app/release`
- `packaging/bundle-staging`
- 当前机器的运行时数据
- 当前机器的账号配置、日志、图片、缓存

## 2. 当前开发基线

### Git 状态

- 当前本地仓库分支：`main`
- 当前状态：**本地 Git 仓库还没有第一笔 commit**
- 因此：
  - **没有可用 commit hash**
  - 当前基线只能以“时间戳源码包 + 交接文档”来对齐

### 当前协作边界

#### Mac 侧继续负责共享 core

- `desktop-app/app/core/state/`
- `desktop-app/app/core/workflow/`
- `desktop-app/app/core/dashboard/`
- `desktop-app/app/contracts/`

#### Windows 侧优先负责平台层

- `desktop-app/app/platform/`
- `desktop-app/app/platform/ipc/`
- Windows 打包、安装器、下载、PowerShell、路径、系统弹窗

### 当前明确原则

- 平台问题归 `platform`
- 流程和状态问题归 `core`
- 不要在 Windows 侧单独补一套 workflow 判定
- 不要在 UI 里自己猜 success

## 3. 本地开发和打包命令

### 安装前端依赖

在 `product-studio/desktop-app/` 下执行：

```bash
npm install
```

如果 Electron 下载慢，优先用镜像脚本：

```bash
npm run install:mirror
```

### 本地启动桌面客户端

```bash
cd product-studio/desktop-app
npm start
```

### 本地开发模式（Windows）

当前没有单独的 Windows-only dev server，开发模式和 Mac 一样，直接：

```bash
cd product-studio/desktop-app
npm start
```

### 生成 Windows 安装包

```bash
cd product-studio/desktop-app
npm run build:win
```

### 生成 Windows 便携版

```bash
cd product-studio/desktop-app
npm run build:win-portable
```

说明：

- 当前第一版 Windows 本地化打包默认走**无签名测试构建**。
- `desktop-app/package.json` 已显式设置 `build.win.signAndEditExecutable = false`。
- 这样做是为了先避开 `electron-builder` 在 Windows 上解压 `winCodeSign` 时的符号链接权限问题，优先保证 `portable.exe` 和安装版 `exe` 能稳定产出。
- 这意味着当前 Windows 产物不会做可执行文件资源编辑和代码签名；等第一版本地化打包完全打通后，再单独恢复正式签名链。

### 打包前准备 bundle 资源

```bash
cd product-studio/desktop-app
npm run prepare:bundle
```

### 检查打包产物结构

```bash
cd product-studio/desktop-app
npm run verify:dist
```

### Python 侧（如果需要直接跑 engine CLI）

从 `product-studio/` 根目录执行：

```bash
python -m pip install -e .
python -m engine.cli inspect --product ransebao
```

## 4. 开发环境要求

### 当前开发机实际版本

- Node：`v25.8.1`
- npm：`11.11.0`

### Python 要求

- `pyproject.toml` 声明：`>=3.11`
- 如果只是跑桌面打包链，客户端会内置 Python
- 如果 Windows 侧要直接本地运行 `engine.cli`，建议准备 **Python 3.11+**

### Windows 端本机前置条件

- PowerShell 可用
- 可以联网下载：
  - Dreamina
  - patchright Chromium
- 可以打开浏览器完成登录：
  - Dreamina
  - 小红书
  - 抖音

### 当前环境变量

当前没有要求必须手工设置的全局环境变量。

这些路径由应用运行时自己管理：

- `PLAYWRIGHT_BROWSERS_PATH`
- `userData/runtime/vendor/python-runtime`
- `userData/runtime/vendor/sau-venv`

## 5. 本地配置和示例配置

示例配置文件：

- `product-studio/runtime/config/local.example.json`

当前配置结构主要包含：

- `selected_product`
- `workspace_root`
- `api_keys`
- `runtime.python_bin`
- `image.dreamina_cli_root`
- `image.device_image_dir`
- `image.downloads_dir`
- `publish.image_dir`
- `publish.sau_root`
- `publish.patchright_browsers_path`
- `publish.xiaohongshu`
- `publish.douyin`

### 当前真实运行时说明

- 客户端会优先把真实配置写到：
  - `userData/runtime/config/local.json`
- 账号配置会写到：
  - `userData/runtime/config/publish_accounts.json`

### 跑完整链路至少需要什么

#### 必需

- 设备图目录
- 生成图片目录
- Dreamina 安装并登录
- 至少一个已启用小红书或抖音账号

#### API / token 情况

- `local.example.json` 里保留了：
  - `api_keys.dreamina`
  - `api_keys.openai`
- **但当前桌面客户端主链并不是通过这里直接驱动安装/登录**
- 当前更关键的是：
  - Dreamina CLI 登录态
  - 平台账号登录态

也就是说：

- 目前**不要把 API key 看成首要卡点**
- 首要卡点是本地依赖和登录态

## 6. 依赖安装链说明

### sau

#### 安装入口

- UI：首次启动向导 / 设置页里的安装按钮
- IPC：
  - `dependencies:installBundled`
- 代码入口：
  - `desktop-app/app/platform/dependency-installer.js`
  - `installBundledDependency("sau")`

#### 预期生成路径

- `userData/runtime/vendor/sau-venv/`
- Windows Python：
  - `userData/runtime/vendor/sau-venv/Scripts/python.exe`
- Windows sau：
  - `userData/runtime/vendor/sau-venv/Scripts/sau.exe`

#### 打包时的源码来源

Windows 打包脚本当前会在准备 bundle 时构建 `social-auto-upload` wheel。

默认查找位置：

- `Playground/ransebao-social-auto-upload`
- `Playground/social-auto-upload`（兼容旧目录）

当前开发机真实路径：

- macOS：
  - `/Users/leo-jaeger/Documents/Playground/ransebao-social-auto-upload`
- Windows 建议路径：
  - `C:\\Users\\81361\\Documents\\Playground\\ransebao-social-auto-upload`

源码仓库地址：

- `https://github.com/Shiqi17777-rsq/ransebao-social-auto-upload.git`
- 上游参考：`https://github.com/dreammis/social-auto-upload.git`

如果 Windows 本机不放在默认同级目录，也可以显式指定：

```powershell
$env:PRODUCT_STUDIO_SAU_SOURCE="D:\\your-path\\ransebao-social-auto-upload"
cd desktop-app
npm run build:win-portable
```

### patchright Chromium

#### 安装入口

- UI：首次启动向导 / 设置页里的“准备 patchright Chromium”
- IPC：
  - `dependencies:installBundled`
- 代码入口：
  - `installBundledDependency("patchrightChromium")`

#### 预期生成路径

- `userData/runtime/vendor/ms-playwright/`

### Dreamina

#### 安装入口

- UI：首次启动向导 / 设置页里的 Dreamina 安装/登录按钮
- IPC：
  - `dependencies:installExternal`
- 代码入口：
  - `installExternalDependency("dreamina")`

#### Windows 预期生成路径

- 二进制：
  - `userData/runtime/vendor/dreamina/bin/dreamina.exe`
- 登录/附加资源：
  - `%USERPROFILE%\\.dreamina_cli\\dreamina\\SKILL.md`
  - `%USERPROFILE%\\.dreamina_cli\\version.json`

#### 登录态 / 缓存目录

- 当前需要特别关注：
  - `%USERPROFILE%\\.dreamina_cli`

如果要验证真正从零登录，reset 时这目录也要一起考虑。

### 当前依赖状态判定规则

#### `missing`
- 还没检测到依赖或二进制

#### `installing`
- 正在安装或正在登录

#### `needs_login`
- 二进制已存在，但还没完成授权，不能真实执行

#### `ready`
- 当前依赖已可真实使用

#### `failed`
- 安装或检测失败，必须有错误线索或日志

## 7. 状态文件和 UI 对应关系

### 当前关键状态文件

#### 依赖检测报告

- `userData/runtime/ransebao/state/current_dependency_report.json`

用途：

- 依赖是否 detected / ready
- 推荐配置路径
- onboarding 步骤完成度

#### 依赖安装状态

- `userData/runtime/ransebao/state/current_dependency_install_state.json`

用途：

- 安装过程进度
- `status`
- `progress`
- `lastError`
- `currentPath`

#### 执行报告

- `userData/runtime/ransebao/state/current_execution_report.json`

用途：

- 记录计划/执行结果
- 当前要重点注意：
  - `planned != success`
  - `execute_image=false` 不能被 UI 当成“图片已成功生成”

#### 上游状态

当前**没有单独的**：

- `current_upstream_report.json`

当前上游相关状态实际上分散在这些文件里：

- `current_best_brief.json`
- `current_brand_pool.json`
- `current_briefs.json`
- `current_upstream_router.json`
- `news/current_hot_pool.json`

### 当前 UI 主要依赖什么字段

#### 安装成功 / 依赖就绪

前端主要吃：

- `dashboard.dependencyReport.installItems[*].status`
- `dashboard.dependencyReport.ready`
- `dashboard.dependencyInstallState`

映射逻辑主要在：

- `desktop-app/src/renderer.js`
- `desktop-app/app/core/state/dependency-status.js`
- `desktop-app/app/core/state/dependency-artifacts.js`

#### 生成成功

当前风险点：

- UI 有一些地方已经在按 action 成功回调显示“成功”
- 但真实是否执行完成，应以：
  - `current_execution_report.json`
  - 图片真实落盘
  - template gallery 状态

为准

#### 发布成功

当前正确口径应是：

- 有 3 张图 + 文案时，最多到 `draft_ready`
- 真正平台发布返回成功后，才能算 `published`

不要让 UI 只因为“点了发布按钮且没抛错”就显示成功。

## 8. 已知问题和当前优先级

### 当前 Windows 端优先级最高的问题

1. Dreamina / 执行状态 / UI 状态三者一致性
2. 图片生成完成与 UI 成功提示的一致性
3. execution report / template gallery / publish state 的口径收紧

### 已确认不只是 Windows 平台层的问题

这些更像共享 core 问题，不应只在 Windows 侧补：

1. 上游第一次刷新没结果，第二次才出来
2. 点“生成图片”后 UI 显示成功，但实际上没真正出图
3. `current_execution_report.json` 仍是 `plan / execute_image=false`，但 UI 已提示成功
4. 依赖安装态、登录态、检测态之间偶发不同步

### 当前暂时不要动的地方

- 不要在 Windows 侧自己补一套 workflow 成功判定
- 不要在 renderer 里继续增加“乐观成功提示”
- 不要随意改状态文件 schema
- 不要把平台问题修进 `app/core/**`

## 当前建议的接手顺序

1. 先解压源码包
2. 先看：
   - `desktop-app/docs/mac-win-collaboration-v1.md`
   - `desktop-app/docs/core-split-v1.md`
3. 再看：
   - `desktop-app/app/platform/`
   - `desktop-app/app/platform/ipc/`
4. 在 Windows 本机完成：
   - `npm install`
   - `npm start`
   - `npm run build:win-portable`
   - `npm run build:win`
5. 先把平台层打通，再和 Mac 侧一起收共享状态机
