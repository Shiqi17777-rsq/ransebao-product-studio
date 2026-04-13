from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


FONT_PATH = "/System/Library/Fonts/Hiragino Sans GB.ttc"


def load_brief(brief_path: Path) -> dict:
    data = json.loads(brief_path.read_text())
    winner = data.get("winner", {})
    return winner.get("brief", {})


def load_image_prompt(prompt_path: Path) -> dict:
    return json.loads(prompt_path.read_text())


def fit_logo(logo: Image.Image, max_width: int) -> Image.Image:
    ratio = max_width / logo.width
    new_size = (int(logo.width * ratio), int(logo.height * ratio))
    return logo.resize(new_size, Image.LANCZOS)


def silver_logo(logo: Image.Image) -> Image.Image:
    alpha = logo.getchannel("A")
    light = Image.new("RGBA", logo.size, (232, 236, 243, 235))
    light.putalpha(alpha)
    return light


def glow_shadow(alpha: Image.Image, color: tuple[int, int, int, int], blur: int) -> Image.Image:
    shadow = Image.new("RGBA", alpha.size, (0, 0, 0, 0))
    shadow.putalpha(alpha)
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    tinted = Image.new("RGBA", alpha.size, color)
    out = Image.new("RGBA", alpha.size, (0, 0, 0, 0))
    out.paste(tinted, mask=shadow.getchannel("A"))
    return out


def cover_ai_icon(canvas: Image.Image, center: tuple[int, int], radius: int = 98) -> None:
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    x, y = center
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(8, 10, 14, 225))
    overlay = overlay.filter(ImageFilter.GaussianBlur(24))
    canvas.alpha_composite(overlay)


def draw_centered_text(
    draw: ImageDraw.ImageDraw,
    center: tuple[int, int],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int, int],
    shadow_fill: tuple[int, int, int, int] | None = None,
    shadow_offset: tuple[int, int] = (0, 4),
    line_spacing: int = 10,
) -> None:
    x, y = center
    if shadow_fill:
        sx, sy = shadow_offset
        draw.multiline_text(
            (x + sx, y + sy),
            text,
            font=font,
            fill=shadow_fill,
            anchor="mm",
            align="center",
            spacing=line_spacing,
        )
    draw.multiline_text(
        (x, y),
        text,
        font=font,
        fill=fill,
        anchor="mm",
        align="center",
        spacing=line_spacing,
    )


def draw_box_center_text(
    draw: ImageDraw.ImageDraw,
    center: tuple[int, int],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int, int],
    shadow_fill: tuple[int, int, int, int] | None = None,
    shadow_offset: tuple[int, int] = (0, 2),
) -> None:
    bbox = draw.textbbox((0, 0), text, font=font)
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    x = center[0] - width / 2
    y = center[1] - height / 2
    if shadow_fill:
        sx, sy = shadow_offset
        draw.text((x + sx, y + sy), text, font=font, fill=shadow_fill)
    draw.text((x, y), text, font=font, fill=fill)


def derive_default_title(brief: dict) -> tuple[str, str]:
    title_options = brief.get("title_options") or []
    topic_name = brief.get("topic_name", "")

    if title_options:
        first = title_options[0]
        if "，" in first:
            left, right = first.split("，", 1)
            return left.strip(), right.strip()
        return first.strip(), ""

    if "，" in topic_name:
        left, right = topic_name.split("，", 1)
        return left.strip(), right.strip()

    return topic_name.strip(), ""


def main() -> None:
    parser = argparse.ArgumentParser(description="Compose a poster preview by overlaying logo and text onto an AI base image.")
    parser.add_argument("--base-image", required=True)
    parser.add_argument("--logo-image", required=True)
    parser.add_argument("--brief-json", required=True)
    parser.add_argument("--image-prompt-json", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--title", default="")
    parser.add_argument("--subtitle", default="")
    parser.add_argument("--point", action="append", default=[])
    parser.add_argument("--skip-logo", action="store_true")
    parser.add_argument("--skip-title", action="store_true")
    parser.add_argument("--skip-subtitle", action="store_true")
    args = parser.parse_args()

    base = Image.open(args.base_image).convert("RGBA")
    logo = Image.open(args.logo_image).convert("RGBA")
    brief = load_brief(Path(args.brief_json))
    prompt = load_image_prompt(Path(args.image_prompt_json))

    title_top, title_bottom = derive_default_title(brief)
    if args.title:
        title_top = args.title
    subtitle = args.subtitle or brief.get("core_angle", "")
    if not args.subtitle and title_bottom:
        subtitle = title_bottom

    sell_points = args.point or prompt.get("sell_points") or []
    if len(sell_points) < 4:
        extras = ["信任更容易建立", "判断更明确", "体验更安心"]
        for item in extras:
            if len(sell_points) >= 4:
                break
            if item not in sell_points:
                sell_points.append(item)
    sell_points = sell_points[:4]

    logo = fit_logo(logo, 330)
    logo_light = silver_logo(logo)
    logo_shadow = glow_shadow(logo_light.getchannel("A"), (8, 10, 14, 110), 8)

    poster = base.copy()
    if not args.skip_logo:
        poster.alpha_composite(logo_shadow, (54, 62))
        poster.alpha_composite(logo_light, (52, 58))

    cover_ai_icon(poster, center=(1315, 127))

    draw = ImageDraw.Draw(poster)
    title_font = ImageFont.truetype(FONT_PATH, 84)
    subtitle_font = ImageFont.truetype(FONT_PATH, 34)
    point_font = ImageFont.truetype(FONT_PATH, 40)

    title_text = title_top if not title_bottom else f"{title_top}\n{title_bottom}"
    if not args.skip_title:
        draw_centered_text(
            draw,
            center=(720, 610),
            text=title_text,
            font=title_font,
            fill=(241, 245, 249, 245),
            shadow_fill=(10, 12, 16, 120),
            shadow_offset=(0, 5),
            line_spacing=12,
        )

    if subtitle and not args.skip_subtitle:
        draw_centered_text(
            draw,
            center=(720, 780),
            text=subtitle,
            font=subtitle_font,
            fill=(198, 205, 214, 225),
            shadow_fill=(10, 12, 16, 110),
            shadow_offset=(0, 3),
            line_spacing=8,
        )

    centers = [(360, 2038), (1080, 2038), (360, 2256), (1080, 2256)]
    for center, point in zip(centers, sell_points):
        draw_box_center_text(
            draw,
            center=center,
            text=point,
            font=point_font,
            fill=(230, 234, 241, 238),
            shadow_fill=(8, 10, 14, 100),
            shadow_offset=(0, 2),
        )

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    poster.save(out_path)
    print(out_path)


if __name__ == "__main__":
    main()
