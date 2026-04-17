from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import urlparse


NANO_BANANA_PRO_MODEL = "gemini-3-pro-image-preview"
NANO_BANANA_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
NANO_BANANA_AUTH_MODE = "authorization"
NANO_BANANA_ASPECT_RATIO = "9:16"
NANO_BANANA_IMAGE_SIZE = "4K"


def _configured_string(value: Any) -> str:
    return str(value or "").strip()


def _collect_reference_images(device_image_dir: str, limit: int = 4) -> list[str]:
    root = Path(device_image_dir)
    if not root.is_dir():
        return []
    allowed = {".png", ".jpg", ".jpeg", ".webp"}
    return [
        str(path)
        for path in sorted(root.iterdir())
        if path.is_file() and path.suffix.lower() in allowed
    ][:limit]


def _resolve_api_key(local_config: dict[str, Any]) -> str:
    api_keys = local_config.get("api_keys", {}) if isinstance(local_config, dict) else {}
    return (
        _configured_string(api_keys.get("gemini"))
        or _configured_string(api_keys.get("nano_banana_pro"))
        or _configured_string(api_keys.get("google"))
    )


def _resolve_api_base(local_config: dict[str, Any]) -> str:
    image_cfg = local_config.get("image", {}) if isinstance(local_config, dict) else {}
    configured = _configured_string(image_cfg.get("nano_banana_api_base"))
    if not configured:
        return NANO_BANANA_API_BASE
    normalized = configured.rstrip("/")
    parsed = urlparse(normalized)
    if parsed.scheme and parsed.netloc and not parsed.path:
        return f"{normalized}/v1beta"
    if normalized.endswith("/v1"):
        return normalized
    if normalized.endswith("/v1beta"):
        return normalized
    return normalized


def _resolve_auth_mode(local_config: dict[str, Any]) -> str:
    image_cfg = local_config.get("image", {}) if isinstance(local_config, dict) else {}
    configured = _configured_string(image_cfg.get("nano_banana_auth_mode")).lower()
    if configured in {"auto", "x-goog-api-key", "authorization", "authorization_bearer"}:
        return configured
    return NANO_BANANA_AUTH_MODE


def _resolve_aspect_ratio(local_config: dict[str, Any]) -> str:
    image_cfg = local_config.get("image", {}) if isinstance(local_config, dict) else {}
    configured = _configured_string(image_cfg.get("nano_banana_aspect_ratio"))
    return configured or NANO_BANANA_ASPECT_RATIO


def _resolve_image_size(local_config: dict[str, Any]) -> str:
    image_cfg = local_config.get("image", {}) if isinstance(local_config, dict) else {}
    configured = _configured_string(image_cfg.get("nano_banana_image_size"))
    return configured or NANO_BANANA_IMAGE_SIZE


def plan_generation(prompt_env: dict[str, Any], local_config: dict[str, Any]) -> dict[str, Any]:
    image_cfg = local_config.get("image", {}) if isinstance(local_config, dict) else {}
    prompt_path = prompt_env["artifacts"]["prompt_txt"]
    prompt_text = Path(prompt_path).read_text(encoding="utf-8").strip() if prompt_path else ""
    device_image_dir = _configured_string(image_cfg.get("device_image_dir"))
    downloads_dir = _configured_string(image_cfg.get("downloads_dir"))
    reference_images = _collect_reference_images(device_image_dir)
    api_key = _resolve_api_key(local_config)
    model = _configured_string(image_cfg.get("nano_banana_model")) or NANO_BANANA_PRO_MODEL
    api_base = _resolve_api_base(local_config)
    auth_mode = _resolve_auth_mode(local_config)
    aspect_ratio = _resolve_aspect_ratio(local_config)
    image_size = _resolve_image_size(local_config)
    endpoint = f"{api_base}/models/{model}:generateContent"

    return {
        "adapter": "nano-banana-pro",
        "executor": "gemini-image-api",
        "ready": bool(api_key and prompt_text and reference_images and downloads_dir),
        "model": model,
        "api_base": api_base,
        "endpoint": endpoint,
        "auth_mode": auth_mode,
        "aspect_ratio": aspect_ratio,
        "image_size": image_size,
        "api_key": api_key,
        "device_image_dir": device_image_dir,
        "reference_images": reference_images,
        "downloads_dir": downloads_dir,
        "prompt_path": prompt_path,
        "prompt_text": prompt_text,
        "cwd": "",
        "argv": [],
        "planned_command": (
            f"POST {endpoint} with {len(reference_images)} reference image(s)"
            if api_key
            else "Set api_keys.nano_banana_pro (or api_keys.gemini) before calling Nano Banana Pro."
        ),
        "notes": [
            "Nano Banana Pro supports the official Gemini endpoint or a configured mirror endpoint.",
            "Requests follow the mirror docs shape: Authorization header, IMAGE-only response, and imageConfig.",
            "API keys stay in local runtime config and must never be committed.",
        ],
    }
