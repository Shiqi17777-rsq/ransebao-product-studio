from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from ...core.paths import AppPaths


def today_str() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_history(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and obj.get("topic_name"):
            rows.append(obj)
    return rows


def parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def recent_history(rows: list[dict[str, Any]], days: int, today: datetime) -> list[dict[str, Any]]:
    cutoff = today - timedelta(days=days)
    recent: list[dict[str, Any]] = []
    for row in rows:
        dt = parse_date(row.get("date"))
        if dt is not None and cutoff <= dt < today:
            recent.append(row)
    return recent


def overlap_count(left: list[str], right: list[str]) -> int:
    return len(set(left) & set(right))


def duplicate_risk(theme_id: str, content_type: str, keywords: list[str], recent: list[dict[str, Any]]) -> tuple[str, int]:
    penalty = 0
    theme_hits = 0
    type_hits = 0
    keyword_hits = 0
    for row in recent:
        if row.get("theme_id") == theme_id:
            theme_hits += 1
        if row.get("content_type") == content_type:
            type_hits += 1
        keyword_hits = max(keyword_hits, overlap_count(keywords, row.get("keywords", [])))

    penalty += theme_hits * 18
    penalty += max(type_hits - 1, 0) * 10
    penalty += keyword_hits * 6

    if theme_hits >= 1 or keyword_hits >= 3:
        return "high", penalty
    if type_hits >= 2 or keyword_hits >= 2:
        return "medium", penalty
    return "low", penalty


def rotation_bonus(seed_index: int, theme_index: int, date_str: str) -> int:
    ordinal = sum(ord(ch) for ch in date_str)
    return (ordinal + seed_index * 7 + theme_index * 5) % 11


def build_candidates(config: dict[str, Any], history_rows: list[dict[str, Any]], date_str: str) -> list[dict[str, Any]]:
    recent = recent_history(
        history_rows,
        days=config["selection"]["recent_window_days"],
        today=datetime.strptime(date_str, "%Y-%m-%d"),
    )
    candidates: list[dict[str, Any]] = []

    for theme_index, theme in enumerate(config["themes"]):
        for seed_index, seed in enumerate(theme["seed_topics"]):
            risk, penalty = duplicate_risk(theme["id"], theme["content_type"], theme["keywords"], recent)
            score = theme["priority"] + rotation_bonus(seed_index, theme_index, date_str) - penalty
            candidates.append(
                {
                    "topic_id": f"{theme['id']}-{seed_index + 1}",
                    "theme_id": theme["id"],
                    "topic_name": seed["topic_name"],
                    "source_mode": "品牌常规",
                    "platform": theme["platform"],
                    "audience": theme["audience"],
                    "content_goal": theme["content_goal"],
                    "content_type": theme["content_type"],
                    "hook": seed["hook"],
                    "title_options": seed["title_options"],
                    "copy_outline": seed["copy_outline"],
                    "visual_direction": seed["visual_direction"],
                    "core_angle": seed.get("core_angle", ""),
                    "brief_tone": seed.get("brief_tone", ""),
                    "body_pattern": seed.get("body_pattern", ""),
                    "sell_points": seed.get("sell_points", []),
                    "visual_keywords": seed.get("visual_keywords", []),
                    "cta": seed.get("cta", ""),
                    "boundaries": seed.get("boundaries", []),
                    "why_it_fits_ransebao": "来自染色宝品牌常规主题池，围绕门店痛点、顾客顾虑、产品价值、AI美业或招商合作展开。",
                    "duplicate_risk": risk,
                    "keywords": theme["keywords"],
                    "score": score,
                }
            )

    candidates.sort(key=lambda item: ({"low": 0, "medium": 1, "high": 2}[item["duplicate_risk"]], -item["score"]))

    limit = config["selection"]["candidate_limit"]
    diversified: list[dict[str, Any]] = []
    used_themes: set[str] = set()

    for item in candidates:
        theme_id = item.get("theme_id", "")
        if theme_id and theme_id not in used_themes:
            diversified.append(item)
            used_themes.add(theme_id)
        if len(diversified) >= limit:
            return diversified

    for item in candidates:
        if item not in diversified:
            diversified.append(item)
        if len(diversified) >= limit:
            break

    return diversified


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def to_markdown(date_str: str, items: list[dict[str, Any]]) -> str:
    lines = [
        f"# 染色宝品牌常规候选池 - {date_str}",
        "",
        "## 概览",
        "",
        f"- 候选数：{len(items)}",
        "- 使用场景：当日没有高相关热点时，作为品牌常规引擎输入",
        "",
    ]
    for idx, item in enumerate(items, start=1):
        lines.extend(
            [
                f"## 候选 {idx}",
                "",
                f"- 选题名：{item['topic_name']}",
                f"- 内容类型：{item['content_type']}",
                f"- 目标平台：{item['platform']}",
                f"- 目标受众：{item['audience']}",
                f"- 内容目标：{item['content_goal']}",
                f"- 重复风险：{item['duplicate_risk']}",
                f"- 推荐分数：{item['score']}",
                f"- 钩子：{item['hook']}",
                "- 标题方向：",
            ]
        )
        for title in item["title_options"]:
            lines.append(f"  - {title}")
        lines.append("- 文案骨架：")
        for bullet in item["copy_outline"]:
            lines.append(f"  - {bullet}")
        lines.extend([f"- 视觉建议：{item['visual_direction']}", ""])
    return "\n".join(lines)


def run(paths: AppPaths, product_id: str, date_str: str | None = None) -> dict[str, Any]:
    target_date = date_str or today_str()
    config = load_json(paths.product_themes_dir(product_id) / "brand_theme_pool.json")
    history_path = paths.runtime_product_state_dir(product_id) / "topic_history.jsonl"
    items = build_candidates(config, read_history(history_path), target_date)

    current_path = paths.runtime_product_state_dir(product_id) / "current_brand_pool.json"
    markdown_path = paths.runtime_product_outputs_dir(product_id) / "daily_brand_pool" / f"{target_date}.md"

    payload = {"date": target_date, "brand_name": config["brand_name"], "count": len(items), "items": items}
    write_json(current_path, payload)
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.write_text(to_markdown(target_date, items), encoding="utf-8")

    return {
        "date": target_date,
        "count": len(items),
        "current_path": str(current_path),
        "markdown_path": str(markdown_path),
        "history_path": str(history_path),
    }
