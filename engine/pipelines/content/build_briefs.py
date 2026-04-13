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


def infer_angle(candidate: dict[str, Any]) -> str:
    explicit = candidate.get("core_angle")
    if explicit:
        return explicit
    content_type = candidate.get("content_type", "")
    topic_name = candidate.get("topic_name", "")
    source_mode = candidate.get("source_mode", "")

    if source_mode == "热点关联":
        return f"借{topic_name}这个热点，转化为{content_type}视角下的染色宝价值表达。"
    if content_type == "门店经营":
        return "从门店经营效率、利润结构或标准化复制切入，建立经营认知。"
    if content_type == "顾客认知":
        return "从顾客顾虑、决策犹豫和体验感切入，建立安心感与信任感。"
    if content_type == "产品价值":
        return "从设备、流程和结果稳定性切入，建立专业背书。"
    if content_type == "AI 美业":
        return "从AI辅助、数字化和智能决策切入，建立先进性和落地感。"
    if content_type == "招商合作":
        return "从合作模式、持续经营和长期复购切入，建立招商价值。"
    return "从趋势或场景洞察切入，把选题自然拉回染色宝的解决方案定位。"


def infer_sell_points(candidate: dict[str, Any]) -> list[str]:
    explicit = candidate.get("sell_points")
    if isinstance(explicit, list) and explicit:
        return explicit
    content_type = candidate.get("content_type", "")
    if content_type == "门店经营":
        return ["降本增效", "标准化复制", "结果更稳"]
    if content_type == "顾客认知":
        return ["结果更稳", "顾客更放心", "选色更明确"]
    if content_type == "产品价值":
        return ["上手更快", "配比更稳", "服务更标准"]
    if content_type == "AI 美业":
        return ["AI辅助建议", "数字化流程", "门店动作可执行"]
    if content_type == "招商合作":
        return ["持续经营", "按次收费", "合作可复制"]
    return ["门店价值", "顾客体验", "长期经营"]


def infer_visual_keywords(candidate: dict[str, Any]) -> list[str]:
    explicit = candidate.get("visual_keywords")
    if isinstance(explicit, list) and explicit:
        return explicit
    content_type = candidate.get("content_type", "")
    platform = candidate.get("platform", "")
    base = ["染色宝", "门店场景", "专业感"]
    if content_type == "门店经营":
        base.extend(["经营洞察", "流程标准化", "效率提升"])
    elif content_type == "顾客认知":
        base.extend(["顾客视角", "安心感", "选色沟通"])
    elif content_type == "产品价值":
        base.extend(["设备特写", "上手流程", "稳定结果"])
    elif content_type == "AI 美业":
        base.extend(["智能辅助", "数字化", "科技感"])
    elif content_type == "招商合作":
        base.extend(["合作模型", "长期经营", "收益结构"])
    base.append("强对比画面" if platform == "抖音" else "信息清晰排版")
    return base


def infer_boundaries(candidate: dict[str, Any]) -> list[str]:
    explicit = candidate.get("boundaries")
    if isinstance(explicit, list) and explicit:
        return explicit
    boundaries = [
        "不要使用绝对化效果承诺。",
        "不要写医疗化或治疗性表述。",
        "不要编造行业数据或顾客结果。",
        "不要把品牌价值写成空泛自夸。",
    ]
    if candidate.get("source_mode") == "热点关联":
        boundaries.append("不要硬蹭热点，必须明确热点与染色宝的真实关联。")
    return boundaries


def infer_cta(candidate: dict[str, Any]) -> str:
    explicit = candidate.get("cta")
    if explicit:
        return explicit
    goal = candidate.get("content_goal", "")
    if goal == "招商":
        return "引导进一步了解合作模式、门店落地方式或联系咨询。"
    if goal == "咨询":
        return "引导评论区提问、咨询选色或了解门店服务方案。"
    if goal == "专业背书":
        return "引导进一步了解设备、流程或实际落地方式。"
    return "引导继续了解染色宝如何帮助门店或顾客解决实际问题。"


def build_brief(candidate: dict[str, Any], date_str: str) -> dict[str, Any]:
    titles = candidate.get("title_options", [])
    outline = candidate.get("copy_outline", [])
    paragraphs = outline[:3] + ["围绕染色宝的解决方案做收束，并给出清晰下一步动作。"]
    while len(paragraphs) < 4:
        paragraphs.append("补充一个围绕染色宝价值的支持段落。")

    brief_tone = candidate.get("brief_tone", "")
    body_pattern = candidate.get("body_pattern", "")
    source_context = {
        "source_name": candidate.get("source_name", ""),
        "source_link": candidate.get("source_link", ""),
    }

    return {
        "brief_id": f"{date_str}-{candidate.get('topic_id')}",
        "date": date_str,
        "topic_id": candidate.get("topic_id"),
        "theme_id": candidate.get("theme_id"),
        "topic_name": candidate.get("topic_name"),
        "source_mode": candidate.get("source_mode"),
        "platform": candidate.get("platform"),
        "audience": candidate.get("audience"),
        "content_goal": candidate.get("content_goal"),
        "content_type": candidate.get("content_type"),
        "keywords": candidate.get("keywords", []),
        "score": candidate.get("score"),
        "duplicate_risk": candidate.get("duplicate_risk"),
        "why_it_fits_ransebao": candidate.get("why_it_fits_ransebao"),
        "route_reason": candidate.get("route_reason"),
        "core_angle": infer_angle(candidate),
        "brief_tone": brief_tone,
        "body_pattern": body_pattern,
        "hook": candidate.get("hook"),
        "title_options": titles,
        "copy_outline": {
            "hook": candidate.get("hook"),
            "paragraph_1": paragraphs[0],
            "paragraph_2": paragraphs[1],
            "paragraph_3": paragraphs[2],
            "cta": infer_cta(candidate),
        },
        "visual_direction": {
            "direction": candidate.get("visual_direction"),
            "sell_points": infer_sell_points(candidate),
            "keywords": infer_visual_keywords(candidate),
        },
        "boundaries": infer_boundaries(candidate),
        "source_context": source_context,
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def to_markdown(date_str: str, route_mode: str, briefs: list[dict[str, Any]]) -> str:
    lines = [
        f"# 染色宝 Brief 候选 - {date_str}",
        "",
        "## 概览",
        "",
        f"- 路由模式：{route_mode}",
        f"- Brief 数量：{len(briefs)}",
        "",
    ]
    for idx, brief in enumerate(briefs, start=1):
        lines.extend(
            [
                f"## Brief {idx}",
                "",
                f"- 选题名：{brief['topic_name']}",
                f"- 来源类型：{brief['source_mode']}",
                f"- 目标平台：{brief['platform']}",
                f"- 目标受众：{brief['audience']}",
                f"- 内容目标：{brief['content_goal']}",
                f"- 内容类型：{brief['content_type']}",
                f"- 推荐分数：{brief['score']}",
                f"- 重复风险：{brief['duplicate_risk']}",
                f"- 为什么和染色宝有关：{brief['why_it_fits_ransebao']}",
                f"- 核心切口：{brief['core_angle']}",
                f"- 路由理由：{brief['route_reason']}",
                f"- 建议语气：{brief['brief_tone'] or '自然、克制、像真实账号分享'}",
                "",
                "### 标题方向",
                "",
            ]
        )
        for title in brief["title_options"]:
            lines.append(f"- {title}")
        lines.extend(
            [
                "",
                "### 文案骨架",
                "",
                f"- 钩子：{brief['copy_outline']['hook']}",
                f"- 第一段：{brief['copy_outline']['paragraph_1']}",
                f"- 第二段：{brief['copy_outline']['paragraph_2']}",
                f"- 第三段：{brief['copy_outline']['paragraph_3']}",
                f"- 收束 / CTA：{brief['copy_outline']['cta']}",
                "",
                "### 视觉建议",
                "",
                f"- 画面方向：{brief['visual_direction']['direction']}",
                f"- 卖点文案：{', '.join(brief['visual_direction']['sell_points'])}",
                f"- 视觉关键词：{', '.join(brief['visual_direction']['keywords'])}",
                "",
                "### 备注",
                "",
            ]
        )
        for boundary in brief["boundaries"]:
            lines.append(f"- 不可讲边界：{boundary}")
        if brief["source_context"]["source_name"]:
            lines.append(f"- 来源媒体：{brief['source_context']['source_name']}")
        if brief["source_context"]["source_link"]:
            lines.append(f"- 来源链接：{brief['source_context']['source_link']}")
        lines.extend(["- 是否建议进入生图：是", "- 是否建议当天发布：待人工或 agent 选择", ""])
    return "\n".join(lines)


def run(paths: AppPaths, product_id: str, date_str: str | None = None) -> dict[str, Any]:
    target_date = date_str or today_str()
    upstream = load_json(paths.runtime_product_state_dir(product_id) / "current_upstream_router.json")
    briefs = [build_brief(item, target_date) for item in upstream.get("items", [])]
    payload = {"date": target_date, "route_mode": upstream.get("route_mode"), "count": len(briefs), "items": briefs}

    json_path = paths.runtime_product_state_dir(product_id) / "current_briefs.json"
    md_path = paths.runtime_product_outputs_dir(product_id) / "briefs" / f"{target_date}.md"
    write_json(json_path, payload)
    md_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.write_text(to_markdown(target_date, upstream.get("route_mode", "unknown"), briefs), encoding="utf-8")

    return {"date": target_date, "count": len(briefs), "json_path": str(json_path), "markdown_path": str(md_path)}
