# 依赖封装 V2

这一步把交付依赖从“只会识别”推进到“分层封装 + 首启安装”。

## 分层策略

### 安装包内置

- `product-studio` 引擎代码
- 产品包与模板资产
- 首启向导
- 内置 Python 运行时
- `social-auto-upload` 安装材料

### 首启一键安装

- `sau`
- `patchright chromium`

### 外部保留

- Dreamina

## 当前依赖状态模型

客户端现在会同时维护：

- 检测报告：
  - `runtime/ransebao/state/current_dependency_report.json`
- 安装状态：
  - `runtime/ransebao/state/current_dependency_install_state.json`
- 安装日志：
  - `runtime/ransebao/logs/dependencies/<id>.log`

## 关键依赖项

### 程序资源

- 随安装包一起分发
- 打包态从 `Resources/product-studio` 读取

### 内置 Python

- 随安装包一起分发
- 打包态优先使用：
  - macOS：`Resources/vendor/python-runtime/bin/python3`
  - Windows：`Resources/vendor/python-runtime/python.exe`

### sau

- 首次启动时安装到：
  - `userData/runtime/vendor/sau-venv/`
- 安装完成后，发布和账号登录统一复用这个内部环境

### patchright chromium

- 首次启动时一键准备
- 默认写到：
  - `userData/runtime/vendor/ms-playwright/`
- 客户端会把路径写回本地配置，用于后续账号登录/发布

### Dreamina

- 不随包分发
- 客户端提供一键执行官方安装命令
- 也允许手动指定已有目录

## 打包准备脚本

`scripts/prepare_bundle_assets.mjs` 会准备：

- `bundle-staging/product-studio`
  - 不包含任何当前机器的运行时数据
- `bundle-staging/vendor/python-runtime`
- `bundle-staging/vendor/sau-bundle`
  - `dist/`
  - `wheelhouse/`

说明：

- 默认不会再把 `social-auto-upload` 源码目录打进安装包
- `sau` 运行时安装优先使用内置 wheel + wheelhouse
- Windows 打包会准备 Windows 专用 Python 运行时和 Windows wheels，避免把 macOS 运行时误塞进 `exe`

## 当前原则

- 程序与用户数据分离
- 客户安装包里不带任何账号和历史结果
- 首启向导负责把机器初始化到可运行状态
