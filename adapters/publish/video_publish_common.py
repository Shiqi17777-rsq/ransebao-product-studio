from __future__ import annotations

import re
from pathlib import Path
from typing import Any


def normalize_publish_video(video_path: str | None) -> str:
    candidate = str(video_path or "").strip()
    if not candidate:
        return ""
    target = Path(candidate)
    return str(target) if target.is_file() else ""


def coerce_text(value: Any) -> str:
    return str(value or "").strip()


def extract_hashtags(text: str | None) -> list[str]:
    normalized = coerce_text(text)
    if not normalized:
        return []
    seen: set[str] = set()
    tags: list[str] = []
    for match in re.finditer(r"#([^#\s]+)", normalized):
        tag = match.group(1).strip()
        if not tag or tag in seen:
            continue
        seen.add(tag)
        tags.append(tag)
    return tags


def join_tags(tags: list[str]) -> str:
    normalized: list[str] = []
    for raw in tags:
        tag = coerce_text(raw).lstrip("#").strip()
        if not tag or tag in normalized:
            continue
        normalized.append(tag)
    return ",".join(normalized)


def default_video_title(platform: str, hair_color_name: str, template_name: str) -> str:
    color = coerce_text(hair_color_name)
    template = coerce_text(template_name)
    if platform == "xiaohongshu":
        return f"{color}染后成片" if color else (template or "染色宝视频成片")
    if platform == "douyin":
        return f"染色宝-{color}" if color else (template or "染色宝视频")
    return color or template or "染色宝视频"


def default_video_tags(platform: str, hair_color_name: str, desc_text: str) -> str:
    tags = extract_hashtags(desc_text)
    if tags:
        return join_tags(tags)
    defaults = [coerce_text(hair_color_name), "染色宝", "发色案例"]
    if platform == "xiaohongshu":
        defaults.extend(["多段色改造", "染发效果"])
    return join_tags(defaults)
