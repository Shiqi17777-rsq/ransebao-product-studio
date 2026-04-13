# Desktop App

`desktop-app/` 是 Product Studio 的 Electron 桌面壳。

当前它已经不是单纯的原型页面，而是承接这些真实能力：

- 上游状态查看与刷新
- 今日 brief 选择与编辑
- 三模板三图片生成
- 多账号发布与本地自动化
- 首次启动向导
- 运行状态、账号状态、模板状态可视化

## 运行方式

在 `/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app` 下：

```bash
npm install
npm start
```

如果默认 `npm install` 下载 Electron 超时，可以改用：

```bash
npm run install:mirror
```

## 运行时目录

桌面壳现在支持把运行时目录放到源码树之外。

- 开发态默认读取：`product-studio/runtime/`
- 打包态默认读取：`app.getPath("userData")/runtime/`
- 也可以显式指定：

```bash
PRODUCT_STUDIO_RUNTIME_ROOT=/path/to/runtime npm start
```

Electron 调用 Python CLI 时，也会把这个 runtime 根目录显式传下去。

## 当前打包状态

目前仍以开发态启动为主，正式安装包链路还没收完。

当前已经完成的基础工作是：

- 统一运行时目录抽象
- 运行时目录自举
- 首次启动向导的安装初始化流程（程序自检 / sau / Chromium / Dreamina / 本地目录 / 账号 / 自动化）
- 首次启动向导的常见依赖自动识别与安装日志
- 账号、自动化、brief、模板状态不再必须写死在源码树里
- 最小 `electron-builder` 打包配置
- `bundle-staging/` 资源准备脚本与产物校验脚本

当前可用的打包命令：

```bash
npm run prepare:bundle
npm run build:mac
npm run verify:dist
```

下一阶段再继续补：

- DMG 冷启动真机验证
- 签名 / 公证

## 当前重构方向

为了避免 Mac 和 Windows 持续各修一遍，桌面壳已经开始进入：

- **共享 core**
- **分平台 adapter**

第一步已经开始落地：

- 目录骨架：
  - [app/README.md](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/README.md)
- 重构蓝图：
  - [core-split-v1.md](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/docs/core-split-v1.md)
- 第一份共享状态协议模块：
  - [dependency-status.js](/Users/leo-jaeger/Documents/Playground/product-studio/desktop-app/app/core/state/dependency-status.js)

当前原则是：

- 业务逻辑和状态协议只保留一份
- Windows / macOS 只保留平台适配层
- UI 不再自己猜成功与失败，只读统一状态协议
