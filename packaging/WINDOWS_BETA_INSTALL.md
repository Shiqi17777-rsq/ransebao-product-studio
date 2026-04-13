# 染色宝 Windows 客户测试版安装说明

当前提供的是 **Windows x64 测试安装包**：

- `Ransebao-Product-Studio-<version>-win-x64.exe`
- `Ransebao-Product-Studio-<version>-win-x64-portable.exe`

## 当前测试目标

这轮先只验证一件事：

- **第一版本地化打包是否成立**

也就是优先确认：

1. 安装包 / 便携版能否正常打开
2. 首启向导能否正常走完
3. 依赖安装链是否稳定
   - `sau`
   - `patchright Chromium`
   - `Dreamina`
4. 运行时是否正确写入用户目录
5. 生成和发布主链是否至少能跑通一次

这轮 **先不讨论自动更新、热更新、远程同步**。

## 推荐测试方式

当前阶段更推荐：

1. **优先使用便携版**
   - `Ransebao-Product-Studio-<version>-win-x64-portable.exe`
2. 先验证功能和依赖链
3. 再回头验证安装版

原因是：

- 便携版更适合当前内测
- 能绕开一部分安装器自身问题
- 更适合先确认“程序本体能不能跑”

## 安装步骤

1. 双击 `Ransebao-Product-Studio-<version>-win-x64.exe`
2. 选择安装目录后继续安装
3. 如果 Windows Defender / SmartScreen 提示未知发布者：
   - 点击 `更多信息`
   - 再点击 `仍要运行`

## 如果安装版报错

如果安装过程中出现“不能打开要写入的文件”，尤其是：

- `Uninstall Ransebao Product Studio.exe`
- 或安装目录里的其他 `.exe`

建议按这个顺序处理：

1. 关闭之前安装失败残留的客户端或卸载程序
2. 删除旧安装目录整个文件夹
3. 改装到一个全新的空目录
   - 更推荐：
     - `C:\\Users\\你的用户名\\Desktop\\Ransebao Product Studio`
     - 或直接使用默认目录
4. 如果还是报错，直接改用便携版：
   - `Ransebao-Product-Studio-<version>-win-x64-portable.exe`

便携版不需要安装，双击即可运行，更适合测试阶段先验证功能链路。

## 首次启动会做什么

首次启动向导会引导完成：

1. 程序资源自检
2. 安装 `sau`
3. 准备 `patchright chromium`
4. 安装 / 检测 / 登录 Dreamina
5. 确认设备图目录和生成图片目录
6. 登录小红书 / 抖音账号
7. 保存自动化默认值
8. 做一次环境联调

## 首次启动需要联网的地方

以下动作通常需要联网：

- 安装 `sau`
- 准备 `patchright chromium`
- 安装 Dreamina
- 登录 Dreamina
- 登录小红书 / 抖音

如果网络较慢，客户端会显示当前安装状态、阶段说明和日志，不需要反复点击按钮。

## 数据隔离

安装包 **不会** 带入开发机上的这些数据：

- `local.json`
- `publish_accounts.json`
- 自动化状态
- 账号登录态
- 已生成图片
- 日志和缓存

这些内容都会在客户机器首次启动后，写入系统用户目录。

## Windows 版当前已知限制

- 当前是 **x64 测试版**
- 当前不做代码签名，所以首次打开可能会被 SmartScreen 提示
- Dreamina 不随安装包分发，需要在客户端里执行安装 / 登录
- `patchright chromium` 首次准备需要联网
- 如果某些 Windows 机器对安装器写入 `Uninstall *.exe` 比较敏感，可以直接优先使用便携版
- 这版已经能打包为 `.exe`，但仍建议先做一轮真实 Windows 冷启动测试再正式交付客户

## 本轮建议测试顺序

第一次在 Windows 机器上测试时，建议按这个顺序：

1. 先清旧数据目录
2. 优先启动便携版
3. 跑完首启向导
4. 安装 `sau`
5. 准备 `patchright chromium`
6. 安装并登录 Dreamina
7. 确认依赖状态全部正确同步
8. 再验证：
   - 账号登录
   - 上游
   - 生成 3 张图
   - 一次 3 图发布

其中最优先看的不是 UI，而是：

- 能否启动
- 能否安装依赖
- 能否写 runtime
- 能否完成 3 图生成与发布

## 本轮验收通过标准

如果下面这些都成立，就可以认为 **Windows 第一版本地化打包基本成立**：

1. 便携版可以在全新用户数据目录下正常启动
2. `runtime` 会自动写入：
   - `%AppData%\\ransebao-desktop-app`
3. `sau` 安装成功
4. `patchright Chromium` 准备成功
5. `Dreamina` 安装并登录成功
6. `current_dependency_report.json` 和 `current_dependency_install_state.json` 状态一致
7. 至少能生成 3 张图
8. 至少能完成一次真实发布

满足这些后，再去收安装版、自动更新和后续增强。

## Windows Codex 提效工具

如果 Windows 机器上也有 Codex，建议直接使用仓库里的辅助脚本：

- [/Users/leo-jaeger/Documents/Playground/product-studio/packaging/windows/reset_ransebao_beta.ps1](/Users/leo-jaeger/Documents/Playground/product-studio/packaging/windows/reset_ransebao_beta.ps1)
- [/Users/leo-jaeger/Documents/Playground/product-studio/packaging/windows/run_ransebao_smoke_test.ps1](/Users/leo-jaeger/Documents/Playground/product-studio/packaging/windows/run_ransebao_smoke_test.ps1)
- [/Users/leo-jaeger/Documents/Playground/product-studio/packaging/windows/collect_ransebao_diagnostics.ps1](/Users/leo-jaeger/Documents/Playground/product-studio/packaging/windows/collect_ransebao_diagnostics.ps1)
- [/Users/leo-jaeger/Documents/Playground/product-studio/packaging/windows/README.md](/Users/leo-jaeger/Documents/Playground/product-studio/packaging/windows/README.md)

这样可以把反馈从“截图”为主，升级成：
- 一键重置环境
- 一键跑 smoke test
- 一键导出诊断包
