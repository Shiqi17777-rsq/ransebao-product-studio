# 多 Agent 开发规则

## 项目协作偏好

- 染色宝后续开发默认采用多 agent 分工协作。
- 不同模块应拆给不同上下文的 agent 先做分析或实现，避免一个上下文同时承载 UI、平台、工作流、模型和打包细节。
- 主线程负责最终判断、集成、验证和向用户解释，不把子 agent 结论直接当成最终事实。

## 推荐分工

- UI / 交互 agent：只看原始 UI 风格、页面结构、组件语言和用户体验。
- Windows 平台 agent：只看 `desktop-app/app/platform/**`、路径、下载、PowerShell、打包运行时。
- 工作流 agent：只看 `desktop-app/app/core/workflow/**`、状态机和执行成功 / 失败口径。
- 模型 adapter agent：只看 `adapters/**`、`engine/services/**`、模型 API / CLI 接入。
- 打包测试 agent：只看 `packaging/**`、portable 构建、verify、诊断脚本。

## 使用规则

- 每个 agent 必须有明确边界：读什么、改什么、不碰什么。
- 涉及代码修改时，尽量分配不重叠的写入文件，减少冲突。
- 设计类 agent 优先只读分析；实现类 agent 才允许改文件。
- 子 agent 不记录 API Key、账号、cookie、运行时日志或用户隐私数据。
- 重要功能完成后，把事实和决策同步到 `docs/project-memory/`。
