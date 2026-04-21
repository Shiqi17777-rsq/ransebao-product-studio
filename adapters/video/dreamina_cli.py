from __future__ import annotations

import json
import os
import random
import re
import struct
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
VIDEO_TEMPLATE_ROOT = REPO_ROOT / "products" / "ransebao" / "assets" / "video-templates"
VIDEO_TEMPLATE_CATALOG = VIDEO_TEMPLATE_ROOT / "catalog.json"
DEFAULT_TEMPLATE_ID = "beauty-hair-transformation"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
VIDEO_SUFFIXES = {".mp4"}


def _configured_string(value: Any) -> str:
    return str(value or "").strip()


def _safe_int(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _iter_mp4_atoms(handle: Any, start: int, end: int):
    offset = start
    while offset + 8 <= end:
        handle.seek(offset)
        header = handle.read(8)
        if len(header) < 8:
            return
        size, atom_type = struct.unpack(">I4s", header)
        header_size = 8
        if size == 1:
            extended = handle.read(8)
            if len(extended) < 8:
                return
            size = struct.unpack(">Q", extended)[0]
            header_size = 16
        elif size == 0:
            size = end - offset
        if size < header_size:
            return
        yield atom_type.decode("ascii", errors="replace"), offset, size, header_size
        offset += size


def _read_mp4_duration_seconds(video_path: str) -> float | None:
    target = Path(video_path)
    if not target.is_file():
        return None
    try:
        file_size = target.stat().st_size
        with target.open("rb") as handle:
            for atom_type, offset, size, header_size in _iter_mp4_atoms(handle, 0, file_size):
                if atom_type != "moov":
                    continue
                moov_start = offset + header_size
                moov_end = offset + size
                for child_type, child_offset, _child_size, child_header_size in _iter_mp4_atoms(handle, moov_start, moov_end):
                    if child_type != "mvhd":
                        continue
                    handle.seek(child_offset + child_header_size)
                    version_bytes = handle.read(1)
                    if not version_bytes:
                        return None
                    version = version_bytes[0]
                    handle.read(3)
                    if version == 1:
                        handle.read(8)
                        handle.read(8)
                        timescale_bytes = handle.read(4)
                        duration_bytes = handle.read(8)
                        if len(timescale_bytes) < 4 or len(duration_bytes) < 8:
                            return None
                        timescale = struct.unpack(">I", timescale_bytes)[0]
                        duration = struct.unpack(">Q", duration_bytes)[0]
                    else:
                        handle.read(4)
                        handle.read(4)
                        timescale_bytes = handle.read(4)
                        duration_bytes = handle.read(4)
                        if len(timescale_bytes) < 4 or len(duration_bytes) < 4:
                            return None
                        timescale = struct.unpack(">I", timescale_bytes)[0]
                        duration = struct.unpack(">I", duration_bytes)[0]
                    if timescale <= 0:
                        return None
                    return duration / timescale
    except Exception:
        return None
    return None


def _collect_files(root_value: str, allowed_suffixes: set[str]) -> list[str]:
    root = Path(root_value).expanduser()
    if not root.is_dir():
        return []
    return [
        str(path)
        for path in sorted(root.iterdir(), key=lambda item: item.name.lower())
        if path.is_file() and path.suffix.lower() in allowed_suffixes
    ]


def _collect_device_images(image_dir: str, limit: int = 3) -> list[str]:
    return _collect_files(image_dir, IMAGE_SUFFIXES)[:limit]


def _collect_hair_color_images(image_dir: str) -> list[str]:
    return _collect_files(image_dir, IMAGE_SUFFIXES)


def _resolve_existing_file(value: str) -> str:
    raw = _configured_string(value)
    if not raw:
        return ""
    target = Path(raw).expanduser()
    return str(target) if target.is_file() else ""


def _resolve_dreamina_bin(cli_value: str) -> str:
    return _resolve_existing_file(cli_value)


def _runtime_product_dir(prompt_env: dict[str, Any]) -> Path | None:
    artifact_prompt = _configured_string((prompt_env.get("artifacts") or {}).get("prompt_txt"))
    product_id = _configured_string(prompt_env.get("product_id")) or "ransebao"
    if artifact_prompt:
        prompt_path = Path(artifact_prompt).expanduser()
        try:
            product_dir = prompt_path.parent.parent.parent
            if product_dir.name == product_id:
                return product_dir
        except Exception:
            pass
    runtime_root = _configured_string(os.getenv("PRODUCT_STUDIO_RUNTIME_ROOT"))
    if runtime_root:
        return Path(runtime_root).expanduser() / product_id
    return REPO_ROOT / "runtime" / product_id


def _resolve_imported_template_file(template_dir: Path, value: Any, fallback_name: str) -> Path | None:
    candidates = [
        Path(_configured_string(value)).expanduser() if _configured_string(value) else None,
        template_dir / fallback_name,
    ]
    for candidate in candidates:
        if candidate and candidate.is_file():
            return candidate
    return None


def _load_runtime_video_templates(prompt_env: dict[str, Any]) -> list[dict[str, Any]]:
    product_dir = _runtime_product_dir(prompt_env)
    if not product_dir:
        return []
    root = product_dir / "assets" / "video-templates"
    if not root.is_dir():
        return []
    templates: list[dict[str, Any]] = []
    for template_json in sorted(root.glob("*/template.json")):
        try:
            payload = json.loads(template_json.read_text(encoding="utf-8"))
        except Exception:
            continue
        template_dir = template_json.parent
        template_id = _configured_string(payload.get("id") or template_dir.name)
        if not template_id or not template_id.startswith("local-"):
            continue
        template_video = _resolve_imported_template_file(
            template_dir,
            payload.get("templateVideoPath") or payload.get("template_video_path") or payload.get("template_video"),
            "template.mp4",
        )
        prompt_template = _resolve_imported_template_file(
            template_dir,
            payload.get("promptTemplatePath") or payload.get("prompt_template_path") or payload.get("prompt_template"),
            "prompt_template.txt",
        )
        if not template_video or template_video.suffix.lower() not in VIDEO_SUFFIXES or not prompt_template:
            continue
        douyin_note_template = _resolve_imported_template_file(
            template_dir,
            payload.get("douyinNoteTemplatePath")
            or payload.get("douyin_note_template_path")
            or payload.get("douyin_note_template"),
            "douyin_note_template.txt",
        )
        xiaohongshu_body_template = _resolve_imported_template_file(
            template_dir,
            payload.get("xiaohongshuBodyTemplatePath")
            or payload.get("xiaohongshu_body_template_path")
            or payload.get("xiaohongshu_body_template"),
            "xiaohongshu_body_template.txt",
        )
        templates.append(
            {
                "id": template_id,
                "source": "local_import",
                "name": _configured_string(payload.get("name")) or template_id,
                "description": _configured_string(payload.get("description")),
                "template_video": str(template_video),
                "prompt_template": str(prompt_template),
                "douyin_note_template": str(douyin_note_template) if douyin_note_template else "",
                "xiaohongshu_body_template": str(xiaohongshu_body_template) if xiaohongshu_body_template else "",
                "model_version": _configured_string(payload.get("modelVersion") or payload.get("model_version"))
                or "seedance2.0_vip",
                "duration": _safe_int(payload.get("duration"), 15),
                "ratio": _configured_string(payload.get("ratio")) or "16:9",
                "video_resolution": _configured_string(
                    payload.get("videoResolution") or payload.get("video_resolution")
                )
                or "720p",
                "_template_dir": str(template_dir),
            }
        )
    return templates


def _load_template_catalog(prompt_env: dict[str, Any] | None = None) -> dict[str, Any]:
    try:
        catalog = json.loads(VIDEO_TEMPLATE_CATALOG.read_text(encoding="utf-8"))
    except Exception:
        catalog = {"default_template": DEFAULT_TEMPLATE_ID, "templates": []}
    templates = catalog.get("templates") if isinstance(catalog.get("templates"), list) else []
    imported_templates = _load_runtime_video_templates(prompt_env or {})
    existing_ids = {item.get("id") for item in templates if isinstance(item, dict)}
    return {
        **catalog,
        "templates": [
            *templates,
            *[template for template in imported_templates if template.get("id") not in existing_ids],
        ],
    }


def _load_template(template_id: str, prompt_env: dict[str, Any]) -> dict[str, Any]:
    catalog = _load_template_catalog(prompt_env)
    requested = _configured_string(template_id) or _configured_string(catalog.get("default_template")) or DEFAULT_TEMPLATE_ID
    templates = catalog.get("templates") if isinstance(catalog.get("templates"), list) else []
    matched = next((item for item in templates if item.get("id") == requested), None)
    if not matched:
        matched = next((item for item in templates if item.get("id") == DEFAULT_TEMPLATE_ID), None)
    return matched or {
        "id": DEFAULT_TEMPLATE_ID,
        "name": "High-impact beauty transformation video",
        "description": "",
        "template_video": "beauty-hair-transformation/template.mp4",
        "prompt_template": "beauty-hair-transformation/prompt_template.txt",
        "douyin_note_template": "beauty-hair-transformation/douyin_note_template.txt",
        "xiaohongshu_body_template": "beauty-hair-transformation/xiaohongshu_body_template.txt",
        "model_version": "seedance2.0_vip",
        "duration": 15,
        "ratio": "16:9",
        "video_resolution": "720p",
    }


def _resolve_template_file(template: dict[str, Any], key: str) -> str:
    aliases = {
        "template_video": ["templateVideoPath", "template_video_path"],
        "prompt_template": ["promptTemplatePath", "prompt_template_path"],
        "douyin_note_template": ["douyinNoteTemplatePath", "douyin_note_template_path"],
        "xiaohongshu_body_template": ["xiaohongshuBodyTemplatePath", "xiaohongshu_body_template_path"],
    }
    raw_value = template.get(key)
    for alias in aliases.get(key, []):
        raw_value = raw_value or template.get(alias)
    configured = _configured_string(raw_value)
    if not configured:
        return ""
    candidate = Path(configured).expanduser()
    if not candidate.is_absolute():
        template_dir = _configured_string(template.get("_template_dir") or template.get("template_dir"))
        candidate = (Path(template_dir) if template_dir else VIDEO_TEMPLATE_ROOT) / configured
    return str(candidate) if candidate.is_file() else ""


def _hair_color_name_from_path(image_path: str) -> str:
    name = Path(image_path).stem.strip()
    return name or "target-hair-color"


def _slug_text(value: str) -> str:
    text = re.sub(r"\s+", "-", value.strip())
    text = re.sub(r'[\\/:*?"<>|]+', "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text[:60] or "hair-color"


def _select_hair_color_image(hair_color_dir: str, selected_image: str) -> tuple[str, list[str], bool]:
    candidates = _collect_hair_color_images(hair_color_dir)
    selected = _resolve_existing_file(selected_image)
    if selected:
        return selected, candidates, False
    if not candidates:
        return "", candidates, False
    return random.choice(candidates), candidates, True


def _render_prompt(template_prompt_path: str, hair_color_name: str) -> str:
    if not template_prompt_path:
        return ""
    prompt = Path(template_prompt_path).read_text(encoding="utf-8")
    return prompt.replace("{hair_color_name}", hair_color_name)


def _render_text_template(template_path: str, variables: dict[str, str]) -> str:
    if not template_path:
        return ""
    text = Path(template_path).read_text(encoding="utf-8")
    rendered = text
    for key, value in variables.items():
        rendered = rendered.replace(f"{{{key}}}", value)
    return rendered


def _write_video_prompt(prompt_env: dict[str, Any], template_id: str, hair_color_name: str, prompt_text: str) -> str:
    artifact_prompt = _configured_string((prompt_env.get("artifacts") or {}).get("prompt_txt"))
    if artifact_prompt:
        output_dir = Path(artifact_prompt).parent.parent / "video_prompts"
    else:
        output_dir = REPO_ROOT / "runtime" / "outputs" / "video_prompts"
    output_dir.mkdir(parents=True, exist_ok=True)
    date_text = _configured_string(prompt_env.get("date")) or "current"
    prompt_path = output_dir / f"{date_text}_{template_id}_{_slug_text(hair_color_name)}.txt"
    prompt_path.write_text(prompt_text, encoding="utf-8")
    return str(prompt_path)


def _write_video_publish_text(
    prompt_env: dict[str, Any],
    template_id: str,
    hair_color_name: str,
    platform: str,
    text: str,
) -> str:
    artifact_prompt = _configured_string((prompt_env.get("artifacts") or {}).get("prompt_txt"))
    if artifact_prompt:
        output_dir = Path(artifact_prompt).parent.parent / "video_publish"
    else:
        output_dir = REPO_ROOT / "runtime" / "outputs" / "video_publish"
    output_dir.mkdir(parents=True, exist_ok=True)
    date_text = _configured_string(prompt_env.get("date")) or "current"
    target_path = output_dir / f"{date_text}_{template_id}_{_slug_text(hair_color_name)}_{platform}.txt"
    target_path.write_text(text, encoding="utf-8")
    return str(target_path)


def _default_video_downloads_dir() -> str:
    return str(Path.home() / "Desktop" / "output-videos")


def _build_missing_requirements(
    *,
    dreamina_bin: str,
    device_images: list[str],
    hair_color_dir: str,
    hair_color_image: str,
    prompt_text: str,
    downloads_dir: str,
) -> list[str]:
    missing: list[str] = []
    if not dreamina_bin:
        missing.append("Dreamina CLI is not available.")
    if len(device_images) < 3:
        missing.append("Fewer than 3 device/logo reference images were found.")
    if not hair_color_dir:
        missing.append("Hair color reference directory is not configured.")
    elif not hair_color_image:
        missing.append("Hair color reference directory has no usable images.")
    if not prompt_text:
        missing.append("Video prompt template is empty.")
    if not downloads_dir:
        missing.append("Video output directory is not configured.")
    return missing


def plan_generation(prompt_env: dict[str, Any], local_config: dict[str, Any]) -> dict[str, Any]:
    image_cfg = local_config.get("image", {}) if isinstance(local_config, dict) else {}
    video_cfg = local_config.get("video", {}) if isinstance(local_config, dict) else {}
    template = _load_template(_configured_string(video_cfg.get("template_id")), prompt_env)
    template_id = _configured_string(template.get("id")) or DEFAULT_TEMPLATE_ID
    template_name = _configured_string(template.get("name")) or "High-impact beauty transformation video"
    template_video_path = _resolve_template_file(template, "template_video")
    template_prompt_path = _resolve_template_file(template, "prompt_template")
    douyin_note_template_path = _resolve_template_file(template, "douyin_note_template")
    xiaohongshu_body_template_path = _resolve_template_file(template, "xiaohongshu_body_template")
    template_video_duration_seconds = _read_mp4_duration_seconds(template_video_path) if template_video_path else None

    dreamina_bin = _resolve_dreamina_bin(
        _configured_string(video_cfg.get("dreamina_cli_root"))
        or _configured_string(image_cfg.get("dreamina_cli_root"))
    )
    device_image_dir = _configured_string(image_cfg.get("device_image_dir"))
    hair_color_dir = _configured_string(video_cfg.get("hair_color_reference_dir"))
    downloads_dir = _configured_string(video_cfg.get("downloads_dir")) or _default_video_downloads_dir()
    device_images = _collect_device_images(device_image_dir, limit=3)
    hair_color_image, hair_color_candidates, random_hair_color = _select_hair_color_image(
        hair_color_dir,
        _configured_string(video_cfg.get("selected_hair_color_image")),
    )
    hair_color_name = _hair_color_name_from_path(hair_color_image) if hair_color_image else ""
    prompt_text = _render_prompt(template_prompt_path, hair_color_name)
    template_variables = {
        "hair_color_name": hair_color_name,
    }
    douyin_note_text = _render_text_template(douyin_note_template_path, template_variables) if hair_color_name else ""
    xiaohongshu_body = (
        _render_text_template(xiaohongshu_body_template_path, template_variables)
        if hair_color_name
        else ""
    )
    rendered_prompt_path = (
        _write_video_prompt(prompt_env, template_id, hair_color_name, prompt_text)
        if prompt_text and hair_color_name
        else ""
    )
    douyin_note_path = (
        _write_video_publish_text(prompt_env, template_id, hair_color_name, "douyin", douyin_note_text)
        if douyin_note_text and hair_color_name
        else ""
    )
    xiaohongshu_body_path = (
        _write_video_publish_text(prompt_env, template_id, hair_color_name, "xiaohongshu", xiaohongshu_body)
        if xiaohongshu_body and hair_color_name
        else ""
    )

    model_version = _configured_string(video_cfg.get("model_version")) or _configured_string(template.get("model_version")) or "seedance2.0_vip"
    duration = _safe_int(video_cfg.get("duration"), _safe_int(template.get("duration"), 15))
    ratio = _configured_string(video_cfg.get("ratio")) or _configured_string(template.get("ratio")) or "16:9"
    video_resolution = _configured_string(video_cfg.get("video_resolution")) or _configured_string(template.get("video_resolution")) or "720p"
    poll_attempts = _safe_int(video_cfg.get("poll_attempts", image_cfg.get("poll_attempts", 12)), 12)
    poll_interval_seconds = _safe_int(
        video_cfg.get("poll_interval_seconds", image_cfg.get("poll_interval_seconds", 15)),
        15,
    )
    poll_timeout_seconds = _safe_int(video_cfg.get("poll_timeout_seconds"), 0)
    if poll_timeout_seconds <= 0:
        poll_timeout_seconds = max(poll_attempts * poll_interval_seconds, 1800)
    reference_images = [*device_images, *([hair_color_image] if hair_color_image else [])]
    reference_videos: list[str] = []
    missing_requirements = _build_missing_requirements(
        dreamina_bin=dreamina_bin,
        device_images=device_images,
        hair_color_dir=hair_color_dir,
        hair_color_image=hair_color_image,
        prompt_text=prompt_text,
        downloads_dir=downloads_dir,
    )

    argv = None
    command = None
    if not missing_requirements:
        argv = [dreamina_bin, "multimodal2video"]
        for image_path in reference_images:
            argv.extend(["--image", image_path])
        argv.extend(
            [
                "--prompt",
                prompt_text,
                "--duration",
                str(duration),
                "--ratio",
                ratio,
                "--video_resolution",
                video_resolution,
                "--model_version",
                model_version,
            ]
        )
        command = (
            f"{dreamina_bin} multimodal2video "
            + " ".join(f"--image '{image_path}'" for image_path in reference_images)
            + f" --prompt \"$(cat '{rendered_prompt_path}')\""
            + f" --duration {duration} --ratio {ratio}"
            + f" --video_resolution {video_resolution} --model_version {model_version}"
        )

    return {
        "adapter": "dreamina-multimodal2video",
        "executor": "dreamina-video-cli",
        "ready": not missing_requirements,
        "cli_bin": dreamina_bin,
        "template_id": template_id,
        "template_name": template_name,
        "template_description": _configured_string(template.get("description")),
        "template_video_path": template_video_path,
        "template_video_duration_seconds": template_video_duration_seconds,
        "douyin_note_template_path": douyin_note_template_path,
        "xiaohongshu_body_template_path": xiaohongshu_body_template_path,
        "reference_videos": reference_videos,
        "device_image_dir": device_image_dir,
        "device_reference_images": device_images,
        "hair_color_reference_dir": hair_color_dir,
        "hair_color_candidates": hair_color_candidates,
        "hair_color_reference_image": hair_color_image,
        "hair_color_name": hair_color_name,
        "hair_color_random": random_hair_color,
        "reference_image_dir": device_image_dir,
        "reference_images": reference_images,
        "downloads_dir": downloads_dir,
        "video_output_dir": downloads_dir,
        "model_version": model_version,
        "duration": duration,
        "ratio": ratio,
        "video_resolution": video_resolution,
        "poll_attempts": poll_attempts,
        "poll_interval_seconds": poll_interval_seconds,
        "poll_timeout_seconds": poll_timeout_seconds,
        "prompt_path": rendered_prompt_path,
        "douyin_note_text": douyin_note_text,
        "douyin_note_path": douyin_note_path,
        "xiaohongshu_body": xiaohongshu_body,
        "xiaohongshu_body_path": xiaohongshu_body_path,
        "cwd": str(Path(dreamina_bin).parent) if dreamina_bin else "",
        "argv": argv,
        "query_argv": [dreamina_bin, "query_result", "--download_dir", downloads_dir] if dreamina_bin else [],
        "planned_command": command,
        "missing_requirements": missing_requirements,
        "notes": [
            "Video generation is generation-only in v1 and is not wired into publishing.",
            "Uses Dreamina multimodal2video because it maps to Dreamina's multimodal video flow.",
            "Template video is UI-only preview metadata and is not uploaded with the task.",
            "Reference order: three device/logo images, one hair color image.",
        ],
    }
