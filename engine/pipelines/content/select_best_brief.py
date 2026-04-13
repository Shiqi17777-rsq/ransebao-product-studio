from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from ...core.paths import AppPaths
from ...services.brief_selection import select_best


def today_str() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def append_topic_history(paths: AppPaths, product_id: str, winner: dict[str, Any], date_str: str) -> None:
    history_path = paths.runtime_product_state_dir(product_id) / "topic_history.jsonl"
    history_path.parent.mkdir(parents=True, exist_ok=True)

    existing_lines: list[str] = []
    if history_path.exists():
        for raw in history_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                existing_lines.append(line)
                continue
            if payload.get("date") != date_str:
                existing_lines.append(line)

    brief = winner["brief"]
    entry = {
        "date": date_str,
        "brief_id": brief.get("brief_id"),
        "topic_id": brief.get("topic_id"),
        "topic_name": brief.get("topic_name"),
        "theme_id": brief.get("theme_id"),
        "content_type": brief.get("content_type"),
        "platform": brief.get("platform"),
        "audience": brief.get("audience"),
        "keywords": brief.get("keywords", []),
        "selection_score": winner.get("selection_score"),
    }
    existing_lines.append(json.dumps(entry, ensure_ascii=False))
    history_path.write_text("\n".join(existing_lines) + "\n", encoding="utf-8")


def to_markdown(date_str: str, route_mode: str, winner: dict[str, Any], ranked: list[dict[str, Any]]) -> str:
    brief = winner["brief"]
    lines = [
        f"# 染色宝今日最佳 Brief - {date_str}",
        "",
        "## 结果",
        "",
        f"- 路由模式：{route_mode}",
        f"- 选中 brief：{brief['topic_name']}",
        f"- 选择分：{winner['selection_score']}",
        f"- 来源类型：{brief['source_mode']}",
        f"- 内容类型：{brief['content_type']}",
        f"- 目标平台：{brief['platform']}",
        f"- 目标受众：{brief['audience']}",
        f"- 内容目标：{brief['content_goal']}",
        "",
        "## 选择理由",
        "",
    ]
    for reason in winner["selection_reasons"]:
        lines.append(f"- {reason}")
    lines.extend(["", "## 标题方向", ""])
    for title in brief.get("title_options", []):
        lines.append(f"- {title}")
    lines.extend(
        [
            "",
            "## 文案骨架",
            "",
            f"- 钩子：{brief['copy_outline']['hook']}",
            f"- 第一段：{brief['copy_outline']['paragraph_1']}",
            f"- 第二段：{brief['copy_outline']['paragraph_2']}",
            f"- 第三段：{brief['copy_outline']['paragraph_3']}",
            f"- 收束 / CTA：{brief['copy_outline']['cta']}",
            "",
            "## 排名概览",
            "",
        ]
    )
    for idx, item in enumerate(ranked, start=1):
        lines.append(f"- {idx}. {item['brief']['topic_name']} | 选择分 {item['selection_score']} | {item['brief']['content_type']} | {item['brief']['platform']}")
    lines.append("")
    return "\n".join(lines)


def run(paths: AppPaths, product_id: str, date_str: str | None = None) -> dict[str, Any]:
    target_date = date_str or today_str()
    config = load_json(paths.product_dir(product_id) / "prompts" / "brief_selection.json")
    payload = load_json(paths.runtime_product_state_dir(product_id) / "current_briefs.json")
    briefs = payload.get("items", [])
    route_mode = payload.get("route_mode", "unknown")
    winner, ranked = select_best(briefs, route_mode, config)

    result = {
        "date": target_date,
        "route_mode": route_mode,
        "winner": {
            "selection_score": winner["selection_score"],
            "selection_reasons": winner["selection_reasons"],
            "brief": winner["brief"],
        },
        "ranked": [
            {
                "selection_score": item["selection_score"],
                "topic_name": item["brief"]["topic_name"],
                "brief_id": item["brief"]["brief_id"],
                "content_type": item["brief"]["content_type"],
                "platform": item["brief"]["platform"],
            }
            for item in ranked
        ],
    }

    json_path = paths.runtime_product_state_dir(product_id) / "current_best_brief.json"
    md_path = paths.runtime_product_outputs_dir(product_id) / "selected_brief" / f"{target_date}.md"
    write_json(json_path, result)
    append_topic_history(paths, product_id, winner, target_date)
    md_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.write_text(to_markdown(target_date, route_mode, winner, ranked), encoding="utf-8")

    return {
        "date": target_date,
        "winner_topic": winner["brief"]["topic_name"],
        "selection_score": winner["selection_score"],
        "json_path": str(json_path),
        "markdown_path": str(md_path),
    }
