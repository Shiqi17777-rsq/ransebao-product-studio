# UI 风格规则

## 原始风格定位

- 染色宝桌面端是“桌面工作流舱 / 内容生产 cockpit”，不是后台管理系统。
- 新功能应像工作流中自然长出的模块，而不是外挂配置面板。
- 视觉基调保持冷灰、银白、低饱和、玻璃感、轻阴影和细边框。

## 组件复用优先级

- 页面骨架优先复用 `workspace-header`、`action-status`、`page-grid`、`panel-card`。
- 状态和摘要优先复用 `settings-list`、`settings-row`、`mini-badge`。
- 动作入口优先复用 `quick-grid`、`quick-action`、`text-button`、`secondary-action`。
- 生成结果优先复用 `template-result-card`、`template-result-preview-frame`、`template-result-placeholder`。

## 新增模块规则

- 不轻易新增独立视觉体系，例如新的大表单网格、新卡片系统或高对比播放器容器。
- 表单控件要克制，尽量包在 `settings-row` 内，作为本地设置的一部分。
- 文案保持流程动作口吻，短句、明确、少解释性长文。
- 视频生成是独立模块，导航位置在“图片模板”之后、“发布确认”之前。
- 初始化向导应覆盖第一轮会阻塞用户的关键配置，包括 Nano Banana Pro 的用户自备 Gemini API Key。
- 视频模型和参数必须用明确选择项，不让用户手填模型名称。
- 视频第一版只生成和本地展示，不接入发布链。

## 已修正的问题

- `media-config-grid` / `media-config-row` 风格偏后台表单，不再作为新增功能的默认 UI 语言。
- 视频结果不再放在图片模板页里，避免图片生成和视频生成职责混在一起。
