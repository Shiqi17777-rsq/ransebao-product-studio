# 染色宝 macOS 客户测试版安装说明

当前提供的是 **macOS arm64 未签名测试版**。

## 安装步骤

1. 双击 `Ransebao-Product-Studio-<version>-mac-arm64.dmg`
2. 将 `Ransebao Product Studio.app` 拖入 `Applications`
3. 第一次打开时：
   - 右键应用，选择“打开”
   - 或在系统设置里允许该应用运行

## 首次启动会做什么

首次启动向导会引导完成：

1. 程序自检
2. 安装 `sau`
3. 准备 `patchright chromium`
4. 安装或检测 Dreamina
5. 确认设备图目录和生成图片目录
6. 登录小红书 / 抖音账号
7. 保存自动化默认值
8. 做一次环境联调

## 数据隔离

安装包 **不会** 带入开发机上的这些数据：

- `local.json`
- `publish_accounts.json`
- 自动化状态
- 账号登录态
- 已生成图片
- 日志和缓存

这些内容都会在客户机器首次启动后写到用户目录。

## 当前已知限制

- 第一版只支持 **macOS arm64**
- 第一版不做签名 / 公证
- Dreamina 不随包分发，需要在客户端里执行安装或手动选择已有目录
- `patchright chromium` 首次准备需要联网
