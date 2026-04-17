# Image Adapter

负责生图平台对接。

当前支持两条路线：

- `dreamina`：默认路线，继续使用 Dreamina CLI。
- `nano_banana_pro`：使用 Google Gemini API 的 Nano Banana Pro，默认模型为 `gemini-3-pro-image-preview`。

选择入口在 `runtime/config/local.json`：

```json
{
  "image": {
    "provider": "dreamina"
  }
}
```

Nano Banana Pro 当前采用个人本地版 BYOK：

- 用户自备 Gemini API Key。
- API Key 只允许写入本机 `local.json` 的 `api_keys.gemini` 或 `api_keys.nano_banana_pro`。
- 不上传服务器，不提交到 GitHub，不写入项目记忆库或诊断包。
