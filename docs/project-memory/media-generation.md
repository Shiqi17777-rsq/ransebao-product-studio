# Media Generation Decisions

## Image generation

- The default image provider remains `dreamina`.
- The repo also supports `nano_banana_pro` as a second image provider.
- Banana runs in local BYOK mode. API keys live only in local runtime config and must never be committed.
- The current mirror setup is more reliable with `gemini-3-pro-image-preview-high`, and the runtime can fall back from the standard model when needed.
- Banana requests use reference images from the configured device image directory.

## Video generation

- Video generation uses Dreamina CLI `multimodal2video`.
- Video v1 is generation-only. It downloads a local mp4 and shows it in the desktop client; it does not automatically enter the publish chain yet.
- The current built-in video template is `beauty-hair-transformation`.
- Video inputs are: 3 device/logo images + 1 hair color image + a rendered prompt.
- The hair color name is derived from the selected hair color file name stem.
- Video output uses `video.downloads_dir` so video files do not have to share the image output folder.

## Success semantics

- Image generation is only successful when a real image file exists on disk.
- Video generation is only successful when a real video file exists on disk.
- A submitted command is not the same as a completed task.
- The UI must never report final success before the output file is actually present.

## Code entry points

- Image adapter planning starts in `engine/cli.py`.
- Banana image adapter: `adapters/image/nano_banana_pro.py`
- Dreamina image adapter: `adapters/image/dreamina_cli.py`
- Dreamina video adapter: `adapters/video/dreamina_cli.py`
- Real adapter execution: `engine/services/adapter_execution.py`
- Desktop video workflow action: `desktop-app/app/core/workflow/orchestrator.js`

## 2026-04-16 additions

- Video template metadata lives in `products/ransebao/assets/video-templates/`.
- Each video template may define `douyin_note_template` and `xiaohongshu_body_template`.
- Runtime renders both publish texts with `{hair_color_name}` and writes them into:
  - the video plan
  - the execution report
  - `current_video_generation_state.json`
  - `current_video_gallery.json`
  - the desktop video preview panel
- The current desktop video page shows template-specific Douyin and Xiaohongshu preview copy for the active hair color.
