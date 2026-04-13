from __future__ import annotations

import json
import re
import shlex
from datetime import datetime
from pathlib import Path
from typing import Any

from ...core.paths import AppPaths


def today_str() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_active_brief(paths: AppPaths, product_id: str, target_date: str) -> tuple[dict[str, Any] | None, str | None]:
    active_path = paths.runtime_product_state_dir(product_id) / "current_active_brief.json"
    if not active_path.exists():
        return None, None
    payload = load_json(active_path)
    brief = payload.get("brief")
    if payload.get("date") != target_date or not isinstance(brief, dict):
        return None, None
    return brief, payload.get("source")


def compact(text: str, fallback: str) -> str:
    normalized = " ".join(text.strip().split()) if text else ""
    return normalized or fallback


def take_first(items: list[str], size: int, fallback: str) -> list[str]:
    cleaned = []
    for item in items:
        normalized = compact(item, "")
        if normalized:
            cleaned.append(normalized)
    while len(cleaned) < size:
        cleaned.append(fallback)
    return cleaned[:size]


def base_hashtags_for(brief: dict[str, Any], config: dict[str, Any]) -> list[str]:
    tags = list(config.get("base_tags", []))
    tags.extend(config.get("content_type_tags", {}).get(brief.get("content_type", ""), []))
    deduped: list[str] = []
    for tag in tags:
        if tag not in deduped:
            deduped.append(tag)
    return deduped


def derive_subtitle(brief: dict[str, Any], config: dict[str, Any]) -> str:
    content_type = brief.get("content_type", "")
    mapped = config.get("subtitle_by_content_type", {}).get(content_type, "")
    if mapped:
        return mapped
    paragraph = brief.get("copy_outline", {}).get("paragraph_1", "")
    return compact(paragraph, "把染色宝的门店价值和结果稳定性讲得更清楚。")


def split_short_phrases(text: str) -> list[str]:
    normalized = compact(text, "")
    if not normalized:
        return []
    return [chunk.strip() for chunk in re.split(r"[，。；：！？、\-\s]+", normalized) if chunk.strip()]


def clamp_chars(text: str, max_chars: int) -> str:
    normalized = compact(text, "")
    if not normalized or max_chars <= 0:
        return ""
    return normalized[:max_chars]


def wrap_chars(text: str, max_chars_per_line: int, max_lines: int) -> str:
    normalized = compact(text, "")
    if not normalized or max_chars_per_line <= 0 or max_lines <= 0:
        return ""
    lines = []
    for index in range(0, len(normalized), max_chars_per_line):
        if len(lines) >= max_lines:
            break
        lines.append(normalized[index : index + max_chars_per_line])
    return "\n".join(lines)


def derive_poster_headline(brief: dict[str, Any], limits: dict[str, Any], fallback: str) -> str:
    max_lines = int(limits.get("headline_max_lines", 2))
    max_chars_per_line = int(limits.get("headline_max_chars_per_line", 12))
    raw = compact((brief.get("title_options") or [fallback])[0], fallback)
    phrases = split_short_phrases(raw)
    selected = [clamp_chars(phrase, max_chars_per_line) for phrase in phrases[:max_lines] if clamp_chars(phrase, max_chars_per_line)]
    if selected:
        return "\n".join(selected[:max_lines])
    return wrap_chars(raw, max_chars_per_line, max_lines)


def derive_poster_subtitle(brief: dict[str, Any], limits: dict[str, Any], fallback: str) -> str:
    max_chars = int(limits.get("subtitle_max_chars", 10))
    title_options = brief.get("title_options") or []
    candidate = ""
    if len(title_options) > 1:
        candidate = title_options[1]
    if not compact(candidate, ""):
        candidate = brief.get("core_angle", "")
    if not compact(candidate, ""):
        candidate = fallback
    phrases = split_short_phrases(candidate)
    chosen = phrases[0] if phrases else candidate
    return clamp_chars(chosen, max_chars)


def derive_poster_mid_title(brief: dict[str, Any], limits: dict[str, Any], fallback: str) -> str:
    max_chars = int(limits.get("mid_title_max_chars", 10))
    title_options = brief.get("title_options") or []
    candidate = title_options[-1] if title_options else fallback
    phrases = split_short_phrases(candidate)
    chosen = phrases[0] if phrases else candidate
    return clamp_chars(chosen, max_chars)


def derive_poster_mid_description(brief: dict[str, Any], limits: dict[str, Any], fallback: str) -> str:
    max_chars = int(limits.get("mid_description_max_chars", 14))
    candidate = compact(brief.get("copy_outline", {}).get("paragraph_3", ""), "")
    if not candidate:
        candidate = brief.get("core_angle", "")
    if not compact(candidate, ""):
        candidate = fallback
    phrases = split_short_phrases(candidate)
    chosen = phrases[0] if phrases else candidate
    return clamp_chars(chosen, max_chars)


def derive_poster_grid_points(brief: dict[str, Any], limits: dict[str, Any], fallback_points: list[str]) -> list[str]:
    count = int(limits.get("grid_point_count", 4))
    max_chars = int(limits.get("grid_point_max_chars", 6))
    source_points = brief.get("visual_direction", {}).get("sell_points", [])
    cleaned: list[str] = []
    for point in source_points:
        phrases = split_short_phrases(point) or [point]
        short_point = clamp_chars(phrases[0], max_chars)
        if short_point and short_point not in cleaned:
            cleaned.append(short_point)
        if len(cleaned) >= count:
            break
    for point in fallback_points:
        short_point = clamp_chars(point, max_chars)
        if short_point and short_point not in cleaned:
            cleaned.append(short_point)
        if len(cleaned) >= count:
            break
    return cleaned[:count]


def derive_poster_copy(
    brief: dict[str, Any],
    config: dict[str, Any],
    template: dict[str, Any],
    main_title: str,
    sub_title: str,
    sell_points: list[str],
) -> dict[str, Any]:
    composition = template.get("composition", {})
    limits = composition.get("copy_limits", {})
    fallback_points = ["专业判断", "沟通更顺", "体验更稳", "结果更清楚"]
    return {
        "headline": derive_poster_headline(brief, limits, main_title),
        "subtitle": derive_poster_subtitle(brief, limits, sub_title),
        "mid_title": derive_poster_mid_title(brief, limits, main_title),
        "mid_description": derive_poster_mid_description(
            brief,
            limits,
            compact(transition_for(brief), sub_title),
        ),
        "grid_points": derive_poster_grid_points(brief, limits, fallback_points) or take_first(sell_points, 4, "专业价值"),
        "year_text": str(datetime.now().year),
        "company_name": compact(config.get("company_name", ""), "东莞市染色宝数字科技有限公司"),
    }


def load_template_selection(paths: AppPaths, product_id: str) -> dict[str, Any]:
    selection_path = paths.runtime_product_state_dir(product_id) / "current_template_selection.json"
    if not selection_path.exists():
        return {}
    return load_json(selection_path)


def resolve_template(
    config: dict[str, Any],
    selection: dict[str, Any],
    *,
    template_id_override: str | None = None,
    slot: int | None = None,
) -> tuple[str, dict[str, Any]]:
    templates = config.get("templates", {})
    default_template_id = config.get("default_template", "standard")
    legacy_aliases = config.get("legacy_template_aliases", {})
    selected_templates = selection.get("selectedTemplates") if isinstance(selection.get("selectedTemplates"), list) else []

    selected_id = template_id_override
    if not selected_id and slot is not None:
        matched = next((item for item in selected_templates if int(item.get("slot", 0)) == int(slot)), None)
        selected_id = matched.get("templateId") if matched else None
    if not selected_id:
        selected_id = selection.get("templateId")
    if not selected_id and selected_templates:
        selected_id = selected_templates[0].get("templateId")
    selected_id = selected_id or default_template_id
    selected_id = legacy_aliases.get(selected_id, selected_id)
    template = templates.get(selected_id) or templates.get(default_template_id) or {}
    template_id = selected_id if selected_id in templates else default_template_id
    return template_id, template


def sentence(text: str) -> str:
    normalized = compact(text, "")
    if not normalized:
        return ""
    if normalized[-1] in "。！？!?":
        return normalized
    return normalized + "。"


def title_for_publish(brief: dict[str, Any]) -> str:
    return compact((brief.get("title_options") or [brief.get("topic_name", "染色宝内容")])[0], "染色宝内容")


def xhs_opening_for(brief: dict[str, Any]) -> str:
    audience = brief.get("audience", "")
    content_type = brief.get("content_type", "")
    if audience == "门店老板":
        return sentence("染发项目最怕的不是今天忙不忙，而是每次都要靠人临场兜结果")
    if audience == "染发顾客":
        return sentence("很多人不是不想染，而是总觉得这件事还差一点把握")
    if content_type == "招商合作":
        return sentence("看一个项目值不值得长期合作，最后看的还是它能不能一直跑下去")
    return sentence(compact(brief.get("hook", ""), brief.get("topic_name", "染色宝内容")))


def douyin_opening_for(brief: dict[str, Any]) -> str:
    content_type = brief.get("content_type", "")
    if content_type == "门店经营":
        return sentence("很多门店做染发，最后不是忙不过来，而是越做越不稳")
    if content_type == "顾客认知":
        return sentence("很多顾客迟迟不做决定，不是没需求，而是对结果没把握")
    return sentence(compact(brief.get("hook", ""), brief.get("topic_name", "染色宝主题")))


def transition_for(brief: dict[str, Any]) -> str:
    content_type = brief.get("content_type", "")
    if content_type == "门店经营":
        return "问题不在于没有需求，而在于门店能不能把这件事稳定接住。"
    if content_type == "顾客认知":
        return "真正能让人放心的，不是说服，而是让过程和结果都更有把握。"
    if content_type == "产品价值":
        return "设备价值只有真正进入流程，才会被门店长期感知到。"
    if content_type == "AI 美业":
        return "所以 AI 真正落地的时候，通常不是更花哨，而是更能帮门店减轻判断压力。"
    if content_type == "招商合作":
        return "合作为什么能走久，最后还是回到门店能不能长期使用和经营。"
    return "最后还是要回到真实场景，看看这件事能不能帮门店把问题解决得更稳。"


def xhs_tail_for(brief: dict[str, Any], sell_points: list[str]) -> str:
    audience = brief.get("audience", "")
    if audience == "门店老板":
        return sentence("很多店最后不是卡在没顾客，而是卡在接不住")
    if audience == "染发顾客":
        return sentence("很多人最后在意的，也不是说了多少，而是这次到底稳不稳")
    if brief.get("content_type") == "招商合作":
        return sentence("能不能做成长久合作，最后还是看门店会不会一直用下去")
    return sentence("把问题讲清楚之后，很多价值其实自己就出来了")


def douyin_tail_for(brief: dict[str, Any]) -> str:
    content_type = brief.get("content_type", "")
    if content_type == "门店经营":
        return sentence("接不稳，后面就很难做成稳定项目")
    if content_type == "顾客认知":
        return sentence("顾客真正需要的不是被催着决定，而是先看到这件事稳不稳")
    if content_type == "产品价值":
        return sentence("设备值不值钱，最后还是看它有没有真的把流程接住")
    if content_type == "AI 美业":
        return sentence("AI 真正进门店的时候，往往不是更花哨，而是更能减轻每天的判断压力")
    if content_type == "招商合作":
        return sentence("合作能不能走久，最后还是看这个项目能不能持续落地")
    return sentence("最后还是得回到真实场景里看它能不能长期成立")


def derive_xhs_body(brief: dict[str, Any], hashtags: list[str]) -> str:
    outline = brief.get("copy_outline", {})
    lines = [
        title_for_publish(brief),
        "",
        xhs_opening_for(brief),
        sentence(compact(outline.get("hook", ""), "把这个主题讲清楚")),
        sentence(compact(outline.get("paragraph_1", ""), "说明真实问题")),
        sentence(compact(outline.get("paragraph_2", ""), "说明为什么会发生")),
        sentence(compact(outline.get("paragraph_3", ""), "引出染色宝的解决价值")),
        sentence(transition_for(brief)),
        "",
        xhs_tail_for(brief, take_first(brief.get("visual_direction", {}).get("sell_points", []), 3, "专业价值")),
        "",
        " ".join(hashtags),
    ]
    return "\n".join(lines)


def derive_douyin_note(brief: dict[str, Any], hashtags: list[str]) -> str:
    outline = brief.get("copy_outline", {})
    lines = [
        douyin_opening_for(brief),
        sentence(compact(outline.get("paragraph_1", ""), "把问题讲清楚")),
        sentence(compact(outline.get("paragraph_2", ""), "把原因讲明白")),
        sentence(compact(outline.get("paragraph_3", ""), "把解决价值讲出来")),
        douyin_tail_for(brief),
        "",
        " ".join(hashtags),
    ]
    return "\n".join(lines)


def build_prompt_text(
    brief: dict[str, Any],
    config: dict[str, Any],
    template_id: str,
    template: dict[str, Any],
    main_title: str,
    sub_title: str,
    sell_points: list[str],
    poster_copy: dict[str, Any],
) -> str:
    visual = brief.get("visual_direction", {})
    content_type = brief.get("content_type", "")
    scene = config.get("scene_by_content_type", {}).get(content_type, "高端美业产品宣传海报")
    keywords = "、".join(visual.get("keywords", []))
    boundaries = "；".join(brief.get("boundaries", []))
    product_desc = config.get("product_desc", "染色宝智能染发设备")
    brand_name = config.get("brand_name", "染色宝")
    template_name = template.get("name", template_id)
    template_focus = template.get("layout_focus", "整体版式清楚，图文关系平衡。")
    template_style = template.get("prompt_style", "保持高级、克制、专业的品牌表达。")
    template_modifiers = "、".join(template.get("visual_modifiers", []))
    bottom_title = compact((brief.get("title_options") or [main_title, main_title])[-1], main_title)
    bottom_description = compact(brief.get("copy_outline", {}).get("paragraph_3", ""), transition_for(brief))
    year_text = compact(str(poster_copy.get("year_text", "")), str(datetime.now().year))
    feature_titles = take_first(
        sell_points + [compact(brief.get("content_goal", ""), "稳定经营")],
        4,
        "专业价值",
    )
    feature_descs = take_first(
        [
            compact(brief.get("copy_outline", {}).get("paragraph_1", ""), ""),
            compact(brief.get("copy_outline", {}).get("paragraph_2", ""), ""),
            compact(brief.get("copy_outline", {}).get("paragraph_3", ""), ""),
            compact(transition_for(brief), ""),
        ],
        4,
        "把门店价值和结果稳定性讲清楚。",
    )
    headline_text = str(poster_copy.get("headline", "")).strip() or main_title
    subtitle_text = compact(str(poster_copy.get("subtitle", "")), sub_title)
    mid_title_text = compact(str(poster_copy.get("mid_title", "")), bottom_title)
    mid_description_text = compact(str(poster_copy.get("mid_description", "")), bottom_description)
    grid_points = take_first(poster_copy.get("grid_points", []), 4, "专业价值")
    company_name_text = compact(str(poster_copy.get("company_name", "")), config.get("company_name", "东莞市染色宝数字科技有限公司"))

    if template_id == "portrait-hero":
        return f"""生成一张高端美业产品宣传海报，竖版构图，9:16比例，整体采用时尚美容广告风格，画面高级、干净、精致，具有品牌商业大片质感。

【主体人物】
画面主体为一位华裔年轻女性模特，正脸特写，五官精致，皮肤细腻，黑色头发整齐向后梳起，神态自然高级，位于画面上半部分到中部，占据主要视觉中心。

【背景氛围】
模特周围与背景融合大量奶油色、米白色、香槟色、银色交织的流动膏体纹理，呈现染膏涂抹、流动、旋转包裹的视觉效果，像丝滑染膏和金属光泽液体在空气中流动，体现高端染发、美业科技、质感配方的感觉。背景整体简洁明亮，以柔和米白、奶咖、浅银灰为主，局部加入细腻高光和流动膏体曲线，营造时尚美妆海报氛围。可适当加入少量和产品特征相关的抽象元素，例如染膏丝带、流体轨迹、智能配比光效、轻微科技线条、透明数据感光斑，但不要过度复杂，保持高级感和广告质感。

【文案排版】
画面中下部预留大面积文字排版区域，用于放置以下文本内容：
- 主标题：{main_title}
- 副标题：{sub_title}
- 卖点短语1：{sell_points[0]}
- 卖点短语2：{sell_points[1]}
- 卖点短语3：{sell_points[2]}
文字区域保持干净、清晰、可读性强。

【产品位置】
左下角预留产品展示区域，放置{product_desc}，产品以三分之二视角展示，稳定摆放，不可过大，作为辅助视觉锚点。

【品牌位置】
右下角预留品牌logo位置，区域干净整洁，方便后期放置“{brand_name}”logo与品牌名称。

【版式逻辑】
整体排版参考高端护肤品、彩妆、美业智能设备广告海报，重点突出“人物大图 + 中下部文案 + 左下角产品 + 右下角logo”的布局逻辑。

【风格要求】
高级商业摄影，真实细腻，时尚美妆广告风，柔和布光，细腻肤质，高清，强质感，构图平衡，视觉统一，适合品牌宣传海报，避免低质感、避免杂乱背景、避免过多文字、避免廉价电商风。

【关键约束】
请严格按照我提供的产品来生成，不要对我提供的产品进行修改。不要生成乱码文字、扭曲文字、过小文字、廉价海报风、过度复杂背景、虚假效果承诺。
"""

    if template_id == "product-hero":
        return f"""生成一张高端美业产品宣传海报，竖版9:16，整体采用高级时尚美容广告风格。

【背景风格】
背景延续参考图的视觉效果，以暖棕色、奶咖色、玫瑰金、浅金属色为主，加入柔和流动的丝绸感、膏体感、液体流线感元素，营造顺滑、精致、统一的高端美业广告氛围。

【版式结构】
- 顶部中央：品牌logo“{brand_name}”
- logo下方：主标题“{main_title}”
- 主标题下方：副标题“{sub_title}”
- 副标题下方：3个卖点标签“{sell_points[0]}”“{sell_points[1]}”“{sell_points[2]}”
- 画面中央：{product_desc}，置于圆形高光金属展示台上，作为核心视觉主体
- 中下部：横向排列3张效果展示图，用于展示不同发色、染后效果或质感效果
- 底部左侧到中部：第二组标题“{bottom_title}”与说明文案“{bottom_description}”
- 最底部：可加入淡化品牌字样或品牌水印

【产品与风格要求】
产品为黑色智能染膏设备，圆角机身，科技感工业设计，采用正面略带角度的三分之二视角，清晰突出，不可过大或过小。整体为高级商业摄影，柔和布光，构图平衡，避免杂乱背景、廉价电商风和低质感设计。

【版式约束】
请严格保持“顶部logo、上部标题区、中部产品主图、中下部三张效果图、底部文字说明区”的海报结构，不要改成其他版式。

【关键约束】
请严格按照我提供的产品来生成，不要对我提供的产品进行修改。
"""

    if template_id == "black-prismatic":
        return f"""生成一张高端美业产品宣传海报，竖版构图，9:16比例，整体采用黑底炫彩科技美业广告风格，画面高级、锐利、精致，具有品牌商业大片质感。

【背景氛围】
背景整体保持参考图的视觉逻辑：纯黑或接近纯黑的深色背景，加入彩虹折射光、霓虹反射、金属液体流光、镜面炫彩高光、能量环状波纹等元素。整体氛围偏未来感、科技感、高级感，像黑色空间中浮现出彩色折射光与液态金属能量漩涡，保持强烈视觉冲击但不能杂乱。

【版式结构】
1. 左上角放置品牌logo“{brand_name}”，logo小而清晰，留白充足。
2. 右上角放置年份“{year_text}”，数字细长、半透明、带紫粉蓝炫彩渐变质感，不要替换成图标、圆形镜头或其他抽象符号。
3. 上半部分中央放置大号中文主标题，标题要大、醒目、有冲击力，占据上部核心视觉区域，严格控制在两行以内，直接生成以下文本内容：
{headline_text}
4. 画面中部中央放置{product_desc}，产品采用三分之二视角、略微倾斜展示，作为绝对视觉中心。
5. 产品底部置于黑色高光金属台面或液体金属环形能量底座之上，底座带彩虹反射和流体漩涡感，增强科技与高级质感。
6. 中下部设置一个醒目的标题区，用于放置“{mid_title_text}”，该区域是标题，不是价格标签，不出现充值金额、价格框、货币符号等信息。
7. 在中下部标题区下方放置一行简短说明文字“{mid_description_text}”，保持单行、排版整齐、清晰易读。
8. 底部区域采用左右两列布局，共4组卖点模块，每个模块都保留清晰卡片/信息格结构，并且只放置以下短标题，不生成描述文字：
   - {grid_points[0]}
   - {grid_points[1]}
   - {grid_points[2]}
   - {grid_points[3]}
9. 最底部中央放置公司名称“{company_name_text}”，字体较细，适当拉开字距，形成品牌落款。

【文字生成策略】
这张图继续采用“短字稳定优先”的策略：
- 可以直接生成：左上品牌识别、年份、大主标题、中下部标题、一行短说明、底部四格短标题、最底部公司名。
- 不要生成：任何长说明文字、价格、年份之外的小数字、额外按钮文案、后台 UI 假文字、密集小字。
- 画面里不要出现超出上述结构的额外可读文字。
- 主标题、中下部标题和底部四格短标题必须清晰、完整、可读，宁可少字，也不要挤字、错字、糊字、假字。

【风格要求】
高级商业摄影风格，产品清晰锐利，背景深邃，光效炫彩但有控制，整体构图平衡、信息层级分明，适合招商海报、产品主视觉海报、品牌宣传图。避免廉价电商风，避免拥挤，避免价格促销感，避免过多小字。

【关键约束】
请严格按照我提供的产品来生成，不要对我提供的产品进行修改。不要把中下部说明写成长段文案，不要让底部四宫格出现额外小描述，不要把右上年份改成其他图形，不要额外生成长文案。
"""

    if template_id == "blue-minimal":
        return f"""生成一张高端美业产品宣传海报，竖版构图，9:16比例，整体采用蓝调极简商业广告风格，画面高级、克制、干净、精致，具有国际大牌护肤品或香氛广告的视觉质感。

【背景风格】
深蓝色渐变空间，斜向穿过画面的冷色光束，柔和雾感与轻微空气颗粒感，局部有细腻镜面反光和体积光效果。整体简洁，不要复杂场景，不要人物，不要杂乱道具。

【版式结构】
1. 顶部中央放置品牌logo“{brand_name}”，位置靠上，留白充足。
2. 画面中央略偏上放置产品主图：{product_desc}。产品稳定摆放在一个深蓝色几何展示台顶端，采用正面略带角度的三分之二视角，成为绝对视觉中心。
3. 画面下半部分中央放置主标题“{main_title}”，使用超大字号、厚重字形。
4. 主标题下方放置副标题“{sub_title}”，字号较小，保持低调、精炼、整齐。
5. 整体严格保持“顶部logo + 中央产品 + 底部大标题 + 最底部补充说明”的海报逻辑。

【风格要求】
高级商业摄影，冷色布光，高清质感，构图平衡，留白充足，适合品牌宣传海报。避免低质感、避免电商详情页风格、避免过多装饰、避免杂乱文字区域。

【关键约束】
请严格按照我提供的产品来生成，不要对我提供的产品进行修改。
"""

    return f"""生成一张高端美业产品宣传海报，竖版构图，9:16比例，整体采用高级商业广告风格，画面干净、精致、专业，适合品牌宣传海报与社交平台封面使用。

【核心主题】
主题围绕“{brief.get('topic_name', main_title)}”展开，核心切口是：{brief.get('core_angle', '')}
内容方向：{scene}
目标受众：{brief.get('audience', '门店老板')}
目标平台：{brief.get('platform', '小红书')}
当前图片模板：{template_name}

【版式结构】
整体采用“上半部视觉主体 + 中下部文案排版 + 左下角产品展示 + 右下角品牌位置”的广告海报结构。
画面中下部预留大面积文字排版区域，用于放置以下文本内容：
- 主标题：{main_title}
- 副标题：{sub_title}
- 卖点短语1：{sell_points[0]}
- 卖点短语2：{sell_points[1]}
- 卖点短语3：{sell_points[2]}
文字区域保持清晰、规整、可读。
模板布局要求：{template_focus}

【视觉主体】
围绕染色宝门店场景与高端美业质感展开，可融入专业发型师、门店经营氛围、流程标准化提示元素或抽象流体质感，但不要杂乱。
产品必须出现：{product_desc}
产品以辅助视觉锚点出现，突出专业感、科技感和稳定结果的价值。

【画面氛围】
整体气质要高级、可信、偏品牌商业广告风，不要廉价电商感。
视觉关键词：{keywords}
可以加入轻量的流体、配比、科技线条、门店空间、信息图形感元素，但保持克制。
模板风格要求：{template_style}
模板视觉强调：{template_modifiers}

【品牌与文案】
右下角预留“{brand_name}”品牌名称与logo区域，画面留白充足。
整张图要服务于内容表达，不要只做产品说明书，也不要把文字做得过多过密。

【约束】
{boundaries}
不要生成乱码文字、扭曲文字、过小文字、廉价海报风、过度复杂背景、虚假效果承诺。
"""


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_env(path: Path, values: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(f"export {key}={shlex.quote(value)}" for key, value in values.items()) + "\n", encoding="utf-8")


def to_markdown(date_str: str, payload: dict[str, Any]) -> str:
    lines = [
        f"# 染色宝生图 Prompt 资产 - {date_str}",
        "",
        "## 概览",
        "",
        f"- 来源 brief：{payload['brief']['topic_name']}",
        f"- 当前模板：{payload['template']['name']}",
        f"- 平台：{payload['brief']['platform']}",
        f"- 受众：{payload['brief']['audience']}",
        f"- 主标题：{payload['main_title']}",
        f"- 副标题：{payload['sub_title']}",
        f"- 卖点：{', '.join(payload['sell_points'])}",
        "",
        "## 资产文件",
        "",
        f"- Prompt 文件：{payload['artifacts']['prompt_txt']}",
        f"- 环境文件：{payload['artifacts']['env_file']}",
        "",
        "## 小红书文案",
        "",
        "```text",
        payload["publish"]["xhs_body"],
        "```",
        "",
        "## 抖音文案",
        "",
        "```text",
        payload["publish"]["douyin_note_text"],
        "```",
        "",
    ]
    return "\n".join(lines)


def slot_suffix(slot: int | None) -> str:
    return f".slot-{slot}" if slot is not None else ""


def run(
    paths: AppPaths,
    product_id: str,
    date_str: str | None = None,
    *,
    template_id_override: str | None = None,
    slot: int | None = None,
) -> dict[str, Any]:
    target_date = date_str or today_str()
    config = load_json(paths.product_dir(product_id) / "prompts" / "image_prompt_defaults.json")
    best = load_json(paths.runtime_product_state_dir(product_id) / "current_best_brief.json")
    active_brief, active_brief_source = load_active_brief(paths, product_id, target_date)
    brief = active_brief or best["winner"]["brief"]
    template_selection = load_template_selection(paths, product_id)
    template_id, template = resolve_template(
        config,
        template_selection,
        template_id_override=template_id_override,
        slot=slot,
    )

    main_title = compact((brief.get("title_options") or [brief.get("topic_name", "染色宝海报")])[0], "染色宝智能染发")
    sub_title = derive_subtitle(brief, config)
    sell_points = take_first(brief.get("visual_direction", {}).get("sell_points", []), 3, "专业价值")
    poster_copy = derive_poster_copy(brief, config, template, main_title, sub_title, sell_points)
    base_hashtags = base_hashtags_for(brief, config)
    xhs_hashtags = base_hashtags + ["#小红书运营"]
    douyin_hashtags = base_hashtags + ["#抖音运营"]
    prompt_text = build_prompt_text(brief, config, template_id, template, main_title, sub_title, sell_points, poster_copy)
    xhs_body = derive_xhs_body(brief, xhs_hashtags)
    douyin_note_text = derive_douyin_note(brief, douyin_hashtags)

    suffix = slot_suffix(slot)
    txt_path = paths.runtime_product_outputs_dir(product_id) / "image_prompts" / f"{target_date}{suffix}.txt"
    md_path = paths.runtime_product_outputs_dir(product_id) / "image_prompts" / f"{target_date}{suffix}.md"
    json_path = paths.runtime_product_state_dir(product_id) / f"current_image_prompt{suffix}.json"
    env_path = paths.runtime_product_state_dir(product_id) / f"current_image_prompt{suffix}.env"

    txt_path.parent.mkdir(parents=True, exist_ok=True)
    txt_path.write_text(prompt_text, encoding="utf-8")

    result = {
        "date": target_date,
        "slot": slot,
        "brief": {
            "brief_id": brief.get("brief_id"),
            "topic_name": brief.get("topic_name"),
            "platform": brief.get("platform"),
            "audience": brief.get("audience"),
            "content_type": brief.get("content_type"),
            "content_goal": brief.get("content_goal"),
            "source": active_brief_source or "best_winner",
        },
        "template": {
            "id": template_id,
            "name": template.get("name", template_id),
            "description": template.get("description", ""),
            "layout_focus": template.get("layout_focus", ""),
            "prompt_style": template.get("prompt_style", ""),
        },
        "main_title": main_title,
        "sub_title": sub_title,
        "sell_points": sell_points,
        "poster_copy": poster_copy,
        "hashtags": {
            "base": base_hashtags,
            "xiaohongshu": xhs_hashtags,
            "douyin": douyin_hashtags,
        },
        "publish": {
            "title": main_title,
            "xhs_body": xhs_body,
            "douyin_note_text": douyin_note_text,
            "tags": " ".join(douyin_hashtags),
        },
        "artifacts": {
            "prompt_txt": str(txt_path),
            "markdown": str(md_path),
            "env_file": str(env_path),
        },
    }

    write_json(json_path, result)
    md_path.write_text(to_markdown(target_date, result), encoding="utf-8")
    write_env(
        env_path,
        {
            "RANSEBAO_PROMPT_TXT": str(txt_path),
            "RANSEBAO_MAIN_TITLE": main_title,
            "RANSEBAO_SUB_TITLE": sub_title,
            "RANSEBAO_SELLING_POINT_1": sell_points[0],
            "RANSEBAO_SELLING_POINT_2": sell_points[1],
            "RANSEBAO_SELLING_POINT_3": sell_points[2],
            "RANSEBAO_POSTER_HEADLINE": poster_copy.get("headline", ""),
            "RANSEBAO_POSTER_SUBTITLE": poster_copy.get("subtitle", ""),
            "RANSEBAO_POSTER_MID_TITLE": poster_copy.get("mid_title", ""),
            "RANSEBAO_POSTER_MID_DESCRIPTION": poster_copy.get("mid_description", ""),
            "RANSEBAO_POSTER_GRID_1": poster_copy.get("grid_points", ["", "", "", ""])[0],
            "RANSEBAO_POSTER_GRID_2": poster_copy.get("grid_points", ["", "", "", ""])[1],
            "RANSEBAO_POSTER_GRID_3": poster_copy.get("grid_points", ["", "", "", ""])[2],
            "RANSEBAO_POSTER_GRID_4": poster_copy.get("grid_points", ["", "", "", ""])[3],
            "RANSEBAO_POSTER_YEAR": poster_copy.get("year_text", ""),
            "RANSEBAO_POSTER_COMPANY": poster_copy.get("company_name", ""),
            "TITLE": main_title,
            "BODY": xhs_body,
            "NOTE_TEXT": douyin_note_text,
            "TAGS": " ".join(douyin_hashtags),
        },
    )

    return {
        "date": target_date,
        "topic_name": brief.get("topic_name"),
        "json_path": str(json_path),
        "prompt_path": str(txt_path),
        "markdown_path": str(md_path),
        "env_path": str(env_path),
        "payload": result,
    }
