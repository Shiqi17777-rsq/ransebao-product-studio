# Video Adapter

负责视频生成平台对接。

第一版只做本地生成和展示，不接入小红书 / 抖音发布链。

当前 canonical 路线：

- 使用 Dreamina CLI 的 `multimodal2video`
- 对应即梦 Web 的「全能参考」
- 默认取设备图目录排序后的前 4 张作为参考图
- 默认参数：`seedance2.0fast`、`5s`、`9:16`、`720p`
