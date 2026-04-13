from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from ...core.paths import AppPaths
from adapters.news.google_news import fetch_sources


def today_str() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_text(*parts: str) -> str:
    return re.sub(r"\s+", " ", " ".join(parts)).lower()


def unique_keep_latest(rows: list[dict]) -> list[dict]:
    keep: dict[str, dict] = {}
    for row in rows:
        key = row.get("link") or row.get("title") or row.get("id")
        current = keep.get(key)
        if current is None or row.get("captured_at", "") > current.get("captured_at", ""):
            keep[key] = row
    return list(keep.values())


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def score_row(row: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    haystack = normalize_text(row.get("title", ""), row.get("summary", ""))
    groups: dict[str, list[str]] = config["keyword_groups"]
    matched_groups: list[str] = []
    keyword_hits = 0
    vertical_keywords: list[str] = config.get("vertical_keywords", [])
    vertical_hits = [kw for kw in vertical_keywords if kw.lower() in haystack]
    has_vertical_signal = bool(vertical_hits)

    for group_name, keywords in groups.items():
        group_hit = False
        for kw in keywords:
            if kw.lower() in haystack:
                keyword_hits += 1
                group_hit = True
        if group_hit:
            matched_groups.append(group_name)

    score = min(100, len(matched_groups) * 22 + min(keyword_hits, 8) * 4)
    thresholds = config["thresholds"]
    gates = config.get("gates", {})

    if gates.get("require_vertical_signal_for_hot", False) and not has_vertical_signal and score >= thresholds["hot"]:
        score = min(score, thresholds["backup"] - 1)

    if score >= thresholds["hot"]:
        bucket = "hot"
    elif score >= thresholds["backup"]:
        if gates.get("require_vertical_signal_for_backup", False) and not has_vertical_signal:
            bucket = "archive"
        else:
            bucket = "backup"
    else:
        bucket = "archive"

    if not has_vertical_signal and bucket != "archive":
        bucket = "archive"

    audiences: list[str] = []
    for group_name in matched_groups:
        audiences.extend(config["audience_map"].get(group_name, []))
    audiences = list(dict.fromkeys(audiences))

    scored = dict(row)
    scored["association_axes"] = matched_groups
    scored["vertical_signal"] = has_vertical_signal
    scored["vertical_keywords_matched"] = vertical_hits
    scored["relevance_score"] = score
    scored["relevance_bucket"] = bucket
    scored["audience"] = audiences
    scored["relevance_reason"] = (
        "Matched groups: "
        + ", ".join(matched_groups)
        + (" | vertical signal: " + ", ".join(vertical_hits) if vertical_hits else " | vertical signal: none")
        if matched_groups or vertical_hits
        else "No strong product association detected."
    )
    scored["topic_id"] = hashlib.sha1(
        f"{row.get('title','')}|{row.get('link','')}".encode("utf-8")
    ).hexdigest()[:16]
    return scored


def to_markdown(date_str: str, rows: list[dict[str, Any]], config: dict[str, Any]) -> str:
    hot = [r for r in rows if r["relevance_bucket"] == "hot"]
    backup = [r for r in rows if r["relevance_bucket"] == "backup"]
    lines = [
        f"# 染色宝每日热点池 - {date_str}",
        "",
        "## 概览",
        "",
        f"- 品牌：{config['brand_name']}",
        f"- 总候选数：{len(rows)}",
        f"- 高相关热点：{len(hot)}",
        f"- 中相关备选：{len(backup)}",
        "",
    ]

    if hot:
        lines.extend(["## 高相关热点", ""])
        for idx, row in enumerate(hot, start=1):
            lines.extend(
                [
                    f"### 热点 {idx}",
                    "",
                    f"- 标题：{row.get('title', '')}",
                    f"- 来源：{row.get('source_name', '')}",
                    f"- 抓取主题：{row.get('source_query', row.get('source_id', ''))}",
                    f"- 时间：{row.get('published_at', '')}",
                    f"- 链接：{row.get('link', '')}",
                    f"- 相关度：{row.get('relevance_score', 0)}",
                    f"- 关联方向：{', '.join(row.get('association_axes', [])) or '无'}",
                    f"- 适合受众：{', '.join(row.get('audience', [])) or '待判断'}",
                    f"- 核心摘要：{row.get('summary', '')}",
                    f"- 关联理由：{row.get('relevance_reason', '')}",
                    "",
                ]
            )
    else:
        lines.extend(["## 高相关热点", "", "- 今日没有达到高相关阈值的热点，建议回退到品牌常规引擎。", ""])

    if backup:
        lines.extend(["## 中相关备选", ""])
        for idx, row in enumerate(backup, start=1):
            lines.append(f"- {idx}. {row.get('title', '')} | 相关度 {row.get('relevance_score', 0)} | {row.get('source_name', '')}")
        lines.append("")

    return "\n".join(lines)


def run(paths: AppPaths, product_id: str, date_str: str | None = None) -> dict[str, Any]:
    target_date = date_str or today_str()
    config = load_json(paths.product_sources_dir(product_id) / "news_sources.json")
    raw_rows = unique_keep_latest(fetch_sources(config))
    scored_rows = sorted((score_row(row, config) for row in raw_rows), key=lambda row: row.get("relevance_score", 0), reverse=True)

    runtime_cache = paths.runtime_product_cache_dir(product_id) / "news" / "raw" / target_date
    runtime_state = paths.runtime_product_state_dir(product_id) / "news"
    runtime_outputs = paths.runtime_product_outputs_dir(product_id) / "news"

    raw_path = runtime_cache / "rss_fetch.jsonl"
    daily_path = runtime_state / "daily" / f"{target_date}.jsonl"
    current_path = runtime_state / "current_hot_pool.json"
    markdown_path = runtime_outputs / "daily_hot_pool" / f"{target_date}.md"

    write_jsonl(raw_path, raw_rows)
    write_jsonl(daily_path, scored_rows)

    current_payload = {
        "date": target_date,
        "brand_name": config["brand_name"],
        "hot_count": sum(1 for row in scored_rows if row["relevance_bucket"] == "hot"),
        "backup_count": sum(1 for row in scored_rows if row["relevance_bucket"] == "backup"),
        "items": scored_rows[:10],
    }
    write_json(current_path, current_payload)

    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.write_text(to_markdown(target_date, scored_rows, config), encoding="utf-8")

    return {
        "date": target_date,
        "raw_count": len(raw_rows),
        "scored_count": len(scored_rows),
        "hot_count": current_payload["hot_count"],
        "backup_count": current_payload["backup_count"],
        "raw_path": str(raw_path),
        "daily_path": str(daily_path),
        "current_path": str(current_path),
        "markdown_path": str(markdown_path),
    }
