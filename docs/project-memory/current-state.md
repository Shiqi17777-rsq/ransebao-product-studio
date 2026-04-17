# 当前项目状态

## Windows v0.1.1 基线

- 主项目仓库：`ransebao-product-studio`
- Windows 第一版本地化打包链已跑通。
- 已验证主链路：依赖安装、Dreamina 登录、patchright Chromium、sau、小红书私密发布、抖音私密发布、上游刷新、三图生成、三图发布、完整工作流。
- 冻结交付 tag：`windows-v0.1.1`
- Windows 侧维护重点仍是 `desktop-app/app/platform/**` 和 Windows 打包链。

## 当前新增方向

- 在 v0.1.1 基线上新增媒体生成扩展。
- 生图新增 Nano Banana Pro provider。
- 视频新增 Dreamina CLI `multimodal2video` 生成能力，并作为独立模块演进。
- 视频第一版只生成和本地展示，不进入发布链。
- API 接入第一阶段采用个人本地版 BYOK，不启用服务器托管密钥。

## 2026-04-16 媒体扩展接入状态

- CLI 计划层已能同时产出 image / video / publish 信息。
- `execute-adapters --scope video` 是视频真实执行入口；`scope all` 暂不自动执行视频，避免影响原每日工作流。
- 客户端设置页已加入图片 provider、Gemini API Key、Dreamina 视频参数和参考图检测。
- 工作台已加入独立“视频生成”模块，视频成功必须有真实 mp4 落盘。
- 真实 Nano Banana Pro / Dreamina 视频生成需要外部服务与账号额度，交付前需人工点按钮验收。
- 初始化向导现已包含 `发色图库目录` 和 `视频输出目录` 两个视频必需配置项。
- 当前视频模板基线为 `beauty-hair-transformation`：15s、16:9、720p、`seedance2.0_vip`。
- 当前视频生成语义已切换为“模板视频控节奏 + 3 张设备图 + 1 张发色图 + 发色名变量替换”。
