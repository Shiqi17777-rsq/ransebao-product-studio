# Product Studio

本地版产品骨架，用于承载后续可安装、可迁移、可卖给客户的工作流产品。

当前阶段目标：

- 固定目录结构
- 固定产品包位置
- 固定运行时目录
- 固定 CLI 入口
- 为后续 Electron 桌面壳预留接口

## 当前结构

```text
product-studio/
├── desktop-app/
├── engine/
├── adapters/
├── products/
│   └── ransebao/
├── runtime/
├── shared/
└── packaging/
```

## 当前可用命令

在目录 `/Users/leo-jaeger/Documents/Playground/product-studio` 下运行：

```bash
python3 -m engine.cli inspect --product ransebao
python3 -m engine.cli refresh-news --product ransebao
python3 -m engine.cli build-brand-pool --product ransebao
python3 -m engine.cli route-topics --product ransebao
python3 -m engine.cli build-briefs --product ransebao
python3 -m engine.cli select-best-brief --product ransebao
python3 -m engine.cli build-image-prompt --product ransebao
python3 -m engine.cli plan-execution --product ransebao
python3 -m engine.cli execute-adapters --product ransebao --scope image
python3 -m engine.cli execute-adapters --product ransebao --scope publish
python3 -m engine.cli run-daily --product ransebao
python3 -m engine.cli run-daily --product ransebao --execute
```

## 当前已迁移的真实能力

第一批已经迁进 `product-studio/` 并可实际执行：

- 动态资讯抓取与热点池评分
- 品牌常规候选池构建
- 上游路由器
- brief 生成
- 今日最佳 brief 选择
- 生图 prompt 资产生成
- Dreamina 图片链闭环执行（提交、轮询、下载）
- 适配器执行计划与执行报告写入

当前产物默认会写到：

- 开发态：`product-studio/runtime/ransebao/cache/`
- 开发态：`product-studio/runtime/ransebao/state/`
- 开发态：`product-studio/runtime/ransebao/outputs/`

桌面客户端现在已经支持把运行时目录迁到源码树之外：

- Electron 打包态默认写到用户目录下的 `userData/runtime/`
- 也可以通过环境变量 `PRODUCT_STUDIO_RUNTIME_ROOT` 或 CLI 参数 `--runtime-root` 显式指定运行时根目录

其中当前执行层已经会产出：

- `runtime/ransebao/state/current_execution_report.json`
- `runtime/ransebao/outputs/execution/YYYY-MM-DD.md`

本机真实路径配置默认放在：

- `product-studio/runtime/config/local.json`
- `product-studio/runtime/ransebao/state/current_dependency_report.json`

如果使用外部运行时目录，对应路径会变成：

- `<runtime-root>/config/local.json`
- `<runtime-root>/config/publish_accounts.json`
- `<runtime-root>/ransebao/state/current_dependency_report.json`

迁移到别的机器时，只需要按 `local.example.json` 补一份新的 `local.json`。
当前客户端也已经支持自动识别常见依赖，并把识别结果写入依赖报告：

- `Python 解释器`
- `Dreamina CLI 根目录`
- `social-auto-upload 根目录`
- `设备图目录`
- `生成图片目录`

依赖封装说明见：

- `packaging/DEPENDENCIES.md`

## 当前阶段说明

这还是第一阶段的本地产品引擎，不是完整成品界面。
现在的重点是把未来长期开发的目录、职责和入口固定下来，并把现有链路逐步迁进来。

当前执行策略：

- 默认保守：`plan-execution` 和 `run-daily` 默认只生成执行计划
- 显式执行：只有 `execute-adapters` 或 `run-daily --execute` 才会真实调用外部 CLI
- 这样可以先把本地产品骨架跑顺，再逐个验证 Dreamina / 小红书 / 抖音适配器
- 当前这台机器已经接好了真实本地路径，所以 plan 模式会显示 `ready=true` 的真实执行计划
- 当前图片链已经闭环：`execute-adapters --scope image` 会自动提交 Dreamina、轮询完成并下载到本地目录
- 当前 Electron 客户端已经具备首次启动向导，可完成本地路径保存、环境检查、账号登录和自动化默认值设置
