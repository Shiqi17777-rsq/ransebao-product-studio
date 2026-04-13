from __future__ import annotations

from typing import Any


def score_brief(brief: dict[str, Any], route_mode: str, config: dict[str, Any]) -> tuple[int, list[str]]:
    score = int(brief.get("score", 0))
    reasons = [f"基础分 {score}"]

    duplicate_penalty = config.get("duplicate_risk_penalty", {}).get(brief.get("duplicate_risk", "low"), 0)
    score += duplicate_penalty
    if duplicate_penalty:
        reasons.append(f"重复风险调整 {duplicate_penalty}")

    route_prefs = config.get("route_mode_preferences", {}).get(route_mode, {})

    source_bonus = route_prefs.get("source_mode_bonus", {}).get(brief.get("source_mode", ""), 0)
    if source_bonus:
        score += source_bonus
        reasons.append(f"来源模式加分 {source_bonus}")

    type_bonus = route_prefs.get("content_type_bonus", {}).get(brief.get("content_type", ""), 0)
    if type_bonus:
        score += type_bonus
        reasons.append(f"内容类型加分 {type_bonus}")

    audience_bonus = route_prefs.get("audience_bonus", {}).get(brief.get("audience", ""), 0)
    if audience_bonus:
        score += audience_bonus
        reasons.append(f"受众加分 {audience_bonus}")

    platform_bonus = route_prefs.get("platform_bonus", {}).get(brief.get("platform", ""), 0)
    if platform_bonus:
        score += platform_bonus
        reasons.append(f"平台加分 {platform_bonus}")

    return score, reasons


def select_best(briefs: list[dict[str, Any]], route_mode: str, config: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    ranked: list[dict[str, Any]] = []
    for brief in briefs:
        final_score, reasons = score_brief(brief, route_mode, config)
        ranked.append({"brief": brief, "selection_score": final_score, "selection_reasons": reasons})

    ranked.sort(key=lambda item: (-item["selection_score"], -int(item["brief"].get("score", 0)), item["brief"].get("topic_name", "")))
    return ranked[0], ranked
