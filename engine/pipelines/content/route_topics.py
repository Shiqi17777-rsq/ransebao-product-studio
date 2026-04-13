from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from ...core.paths import AppPaths


def today_str() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def infer_content_type(axes: list[str]) -> str:
    if "招商合作" in axes:
        return "招商合作"
    if "AI美业" in axes or "标准化智能化" in axes:
        return "AI 美业"
    if "门店经营" in axes:
        return "门店经营"
    if "顾客痛点" in axes or "染发需求" in axes:
        return "顾客认知"
    return "趋势洞察"


def infer_platform(axes: list[str], audience: list[str]) -> str:
    if "AI美业" in axes or "标准化智能化" in axes:
        return "抖音"
    if "门店经营" in axes or "招商合作" in axes:
        return "小红书"
    if "染发顾客" in audience:
        return "小红书"
    return "小红书"


def infer_goal(axes: list[str]) -> str:
    if "招商合作" in axes:
        return "招商"
    if "门店经营" in axes:
        return "认知"
    if "顾客痛点" in axes or "染发需求" in axes:
        return "咨询"
    if "AI美业" in axes or "标准化智能化" in axes:
        return "专业背书"
    return "认知"


def infer_visual_direction(axes: list[str]) -> str:
    if "招商合作" in axes:
        return "经营模型和合作结构表达"
    if "门店经营" in axes:
        return "门店经营洞察海报"
    if "顾客痛点" in axes or "染发需求" in axes:
        return "顾客决策与染发顾虑场景"
    if "AI美业" in axes or "标准化智能化" in axes:
        return "设备、流程与智能辅助结合"
    return "趋势洞察型内容海报"


def map_hot_item(row: dict[str, Any]) -> dict[str, Any]:
    axes = row.get("association_axes", [])
    audience = row.get("audience", [])
    content_type = infer_content_type(axes)
    platform = infer_platform(axes, audience)
    content_goal = infer_goal(axes)
    summary = row.get("summary", "")
    title = row.get("title", "")
    source = row.get("source_name", "")

    return {
        "topic_id": row.get("topic_id") or row.get("id"),
        "theme_id": "hot-topic",
        "topic_name": title,
        "source_mode": "热点关联",
        "platform": platform,
        "audience": " / ".join(audience) if audience else "待判断",
        "content_goal": content_goal,
        "content_type": content_type,
        "hook": f"这条热点可以作为“{content_type}”切口，连接到染色宝的解决方案表达。",
        "title_options": [
            f"从“{title}”看门店升级背后的机会",
            f"{title}，对染色宝这类门店解决方案意味着什么",
        ],
        "copy_outline": [
            f"用一句话交代热点：{summary or title}",
            f"说明它和染色宝的关联：{row.get('relevance_reason', '')}",
            "落到门店、顾客或经营价值，而不是停留在新闻复述",
        ],
        "visual_direction": infer_visual_direction(axes),
        "why_it_fits_ransebao": row.get("relevance_reason", ""),
        "duplicate_risk": "low",
        "keywords": axes,
        "score": row.get("relevance_score", 0),
        "source_title": title,
        "source_name": source,
        "source_link": row.get("link", ""),
        "route_reason": "高相关热点，优先进入当天上游候选。",
    }


def load_hot_candidates(paths: AppPaths, product_id: str, date_str: str) -> list[dict[str, Any]]:
    path = paths.runtime_product_state_dir(product_id) / "news" / "daily" / f"{date_str}.jsonl"
    rows = read_jsonl(path)
    return [map_hot_item(row) for row in rows if row.get("relevance_bucket") == "hot"]


def load_brand_candidates(paths: AppPaths, product_id: str) -> list[dict[str, Any]]:
    path = paths.runtime_product_state_dir(product_id) / "current_brand_pool.json"
    payload = load_json(path)
    items = payload.get("items", [])
    normalized: list[dict[str, Any]] = []
    for item in items:
        row = dict(item)
        row["route_reason"] = "无强热点时作为品牌常规引擎候选；若热点数量不足，也可用于补位。"
        normalized.append(row)
    return normalized


def select_candidates(hot_items: list[dict[str, Any]], brand_items: list[dict[str, Any]], candidate_limit: int) -> tuple[str, list[dict[str, Any]]]:
    if hot_items:
        selected = hot_items[:candidate_limit]
        mode = "hot_priority"
        if len(selected) < candidate_limit:
            selected.extend(brand_items[: candidate_limit - len(selected)])
            mode = "hot_plus_brand_fill"
        return mode, selected
    return "brand_fallback", brand_items[:candidate_limit]


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def to_markdown(date_str: str, route_mode: str, hot_count: int, brand_count: int, items: list[dict[str, Any]]) -> str:
    lines = [
        f"# 染色宝上游路由结果 - {date_str}",
        "",
        "## 路由概览",
        "",
        f"- 路由模式：{route_mode}",
        f"- 可用热点候选：{hot_count}",
        f"- 可用品牌候选：{brand_count}",
        f"- 最终输出数：{len(items)}",
        "",
    ]
    for idx, item in enumerate(items, start=1):
        lines.extend(
            [
                f"## 候选 {idx}",
                "",
                f"- 选题名：{item['topic_name']}",
                f"- 来源模式：{item['source_mode']}",
                f"- 内容类型：{item['content_type']}",
                f"- 目标平台：{item['platform']}",
                f"- 目标受众：{item['audience']}",
                f"- 内容目标：{item['content_goal']}",
                f"- 推荐分数：{item['score']}",
                f"- 重复风险：{item['duplicate_risk']}",
                f"- 路由理由：{item['route_reason']}",
                f"- 钩子：{item['hook']}",
            ]
        )
        if item.get("source_name"):
            lines.append(f"- 来源媒体：{item['source_name']}")
        if item.get("source_link"):
            lines.append(f"- 来源链接：{item['source_link']}")
        lines.append("- 标题方向：")
        for title in item.get("title_options", []):
            lines.append(f"  - {title}")
        lines.append("- 文案骨架：")
        for bullet in item.get("copy_outline", []):
            lines.append(f"  - {bullet}")
        lines.extend([f"- 视觉建议：{item['visual_direction']}", ""])
    return "\n".join(lines)


def run(paths: AppPaths, product_id: str, date_str: str | None = None, candidate_limit: int = 5) -> dict[str, Any]:
    target_date = date_str or today_str()
    hot_items = load_hot_candidates(paths, product_id, target_date)
    brand_items = load_brand_candidates(paths, product_id)
    route_mode, selected = select_candidates(hot_items, brand_items, candidate_limit)

    payload = {
        "date": target_date,
        "route_mode": route_mode,
        "hot_candidate_count": len(hot_items),
        "brand_candidate_count": len(brand_items),
        "selected_count": len(selected),
        "items": selected,
    }

    json_path = paths.runtime_product_state_dir(product_id) / "current_upstream_router.json"
    md_path = paths.runtime_product_outputs_dir(product_id) / "daily_upstream_router" / f"{target_date}.md"
    write_json(json_path, payload)
    md_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.write_text(to_markdown(target_date, route_mode, len(hot_items), len(brand_items), selected), encoding="utf-8")

    return {
        "date": target_date,
        "route_mode": route_mode,
        "selected_count": len(selected),
        "json_path": str(json_path),
        "markdown_path": str(md_path),
    }
