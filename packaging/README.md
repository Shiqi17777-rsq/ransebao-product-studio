# Packaging

这里维护染色宝的 **可交付安装包链路**。

## 当前目标

第一版锁定为：

- macOS arm64
- Windows x64
- `.dmg` 客户测试包
- `.exe` Windows 安装包（NSIS）
- 未签名 / 未公证
- 客户首次打开时，通过应用内向导完成依赖安装和初始化

## 当前策略

- 安装包内置：
  - Electron 客户端
  - `product-studio` 工作流代码
  - 产品包和模板资产
  - 内置 Python 运行时
  - `social-auto-upload` 安装材料
- 首次启动安装：
  - `sau`
  - `patchright chromium`
- 外部依赖：
  - Dreamina
- 用户数据全部写到：
  - `userData/runtime/`

## 关键文件

- `dependency_profiles.json`
  - 常见依赖和目录的自动识别候选
- `DEPENDENCIES.md`
  - 依赖封装策略说明
- `BETA_INSTALL.md`
  - 给客户的 macOS 测试安装说明
- `WINDOWS_BETA_INSTALL.md`
  - 给客户的 Windows 测试安装说明
- `scripts/prepare_bundle_assets.mjs`
  - 打包前准备 `bundle-staging/`
- `scripts/verify_dist_bundle.mjs`
  - 检查产物里是否包含正确资源，且没有带入本机运行态数据

## 当前打包命令

在 `desktop-app/` 下执行：

```bash
npm run prepare:bundle
npm run build:mac
npm run build:win
npm run verify:dist
```

## `social-auto-upload` 源码前提

当前 `prepare_bundle_assets.mjs` 在打包 Windows / macOS bundle 时，会优先从以下位置构建 `social-auto-upload` wheel：

- 默认：`../social-auto-upload`
- 或显式环境变量：`PRODUCT_STUDIO_SAU_SOURCE`

当前参考仓库：

- [https://github.com/dreammis/social-auto-upload](https://github.com/dreammis/social-auto-upload)

如果开发机上没有放在 Playground 同级目录，请先指定：

```bash
PRODUCT_STUDIO_SAU_SOURCE=/absolute/path/to/social-auto-upload npm run build:win
```

## 当前边界

- 还没有正式签名 / 公证
- Windows 第一版测试包显式关闭了 `signAndEditExecutable`，优先保证 unsigned 本地化打包可用
- Windows 包已经能构建，但还需要真实 Windows 冷启动验收
- 依赖安装仍允许联网，尤其是 Dreamina 和 `patchright chromium`
