from __future__ import annotations

import argparse
import json
from pathlib import Path

from adapters.image.dreamina_cli import plan_generation
from adapters.publish.douyin_cli import plan_publish as plan_douyin_publish
from adapters.publish.xiaohongshu_cli import plan_publish as plan_xhs_publish

from .core.config import load_local_runtime_config, load_product_config
from .core.paths import AppPaths, resolve_root, resolve_runtime_root
from .pipelines.content import build_briefs, build_brand_pool, route_topics, select_best_brief
from .pipelines.image import build_prompt_assets
from .pipelines.news import build_hot_pool
from .services import execute_named_plan, write_execution_report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Product Studio local workflow CLI.")
    parser.add_argument("--root", help="Product Studio root path. Defaults to this repo root.")
    parser.add_argument(
        "--runtime-root",
        help="Runtime root path. Defaults to PRODUCT_STUDIO_RUNTIME_ROOT or <root>/runtime.",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    inspect_parser = subparsers.add_parser("inspect", help="Inspect local product package and runtime paths.")
    inspect_parser.add_argument("--product", default="ransebao", help="Product package id.")

    news_parser = subparsers.add_parser("refresh-news", help="Fetch and score the dynamic news pool.")
    news_parser.add_argument("--product", default="ransebao", help="Product package id.")
    news_parser.add_argument("--date", help="Target date in YYYY-MM-DD.")

    brand_parser = subparsers.add_parser("build-brand-pool", help="Build fallback brand topic candidates.")
    brand_parser.add_argument("--product", default="ransebao", help="Product package id.")
    brand_parser.add_argument("--date", help="Target date in YYYY-MM-DD.")

    route_parser = subparsers.add_parser("route-topics", help="Merge hot and brand pools into upstream candidates.")
    route_parser.add_argument("--product", default="ransebao", help="Product package id.")
    route_parser.add_argument("--date", help="Target date in YYYY-MM-DD.")

    briefs_parser = subparsers.add_parser("build-briefs", help="Build structured briefs from current upstream candidates.")
    briefs_parser.add_argument("--product", default="ransebao", help="Product package id.")
    briefs_parser.add_argument("--date", help="Target date in YYYY-MM-DD.")

    best_parser = subparsers.add_parser("select-best-brief", help="Pick the best brief from the current brief pool.")
    best_parser.add_argument("--product", default="ransebao", help="Product package id.")
    best_parser.add_argument("--date", help="Target date in YYYY-MM-DD.")

    prompt_parser = subparsers.add_parser("build-image-prompt", help="Build image prompt assets from the best brief.")
    prompt_parser.add_argument("--product", default="ransebao", help="Product package id.")
    prompt_parser.add_argument("--date", help="Target date in YYYY-MM-DD.")
    prompt_parser.add_argument("--template-id", help="Override template id for prompt generation.")
    prompt_parser.add_argument("--slot", type=int, help="Template slot for prompt generation.")

    plan_parser = subparsers.add_parser("plan-execution", help="Build adapter execution plans for image and publish steps.")
    plan_parser.add_argument("--product", default="ransebao", help="Product package id.")
    plan_parser.add_argument("--date", help="Target date in YYYY-MM-DD.")
    plan_parser.add_argument("--template-id", help="Override template id for image execution planning.")
    plan_parser.add_argument("--slot", type=int, help="Template slot for image execution planning.")

    execute_parser = subparsers.add_parser("execute-adapters", help="Run adapter execution for image and/or publish steps.")
    execute_parser.add_argument("--product", default="ransebao", help="Product package id.")
    execute_parser.add_argument("--date", help="Target date in YYYY-MM-DD.")
    execute_parser.add_argument(
        "--scope",
        choices=["all", "image", "publish", "xiaohongshu", "douyin", "none"],
        default="all",
        help="Which adapters to execute.",
    )
    execute_parser.add_argument("--template-id", help="Override template id for image execution.")
    execute_parser.add_argument("--slot", type=int, help="Template slot for image execution.")

    run_parser = subparsers.add_parser("run-daily", help="Dry-run the daily local workflow chain.")
    run_parser.add_argument("--product", default="ransebao", help="Product package id.")
    run_parser.add_argument("--date", help="Target date in YYYY-MM-DD.")
    run_parser.add_argument("--execute", action="store_true", help="Execute adapters after building assets.")

    return parser


def inspect_command(paths: AppPaths, product_id: str) -> int:
    config = load_product_config(paths.products_dir / product_id / "product.json")
    payload = {
        "app_name": "product-studio",
        "root": str(paths.root),
        "product": config,
        "runtime": {
            "config_dir": str(paths.runtime_config_dir),
            "state_dir": str(paths.runtime_state_dir),
            "logs_dir": str(paths.runtime_logs_dir),
            "outputs_dir": str(paths.runtime_outputs_dir),
            "cache_dir": str(paths.runtime_cache_dir),
        },
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


def build_adapter_plans(
    paths: AppPaths,
    product_id: str,
    date_str: str | None = None,
    *,
    template_id_override: str | None = None,
    slot: int | None = None,
) -> tuple[dict, dict[str, dict]]:
    local_config = load_local_runtime_config(paths.runtime_config_dir)
    try:
        prompt_result = build_prompt_assets.run(
            paths,
            product_id,
            date_str,
            template_id_override=template_id_override,
            slot=slot,
        )
        prompt_payload = prompt_result.get("payload") or load_json_file(prompt_result["json_path"])
        prompt_result = {key: value for key, value in prompt_result.items() if key != "payload"}
        publish_images = load_publish_images(paths, product_id, local_config)
        plans = {
            "image": plan_generation(prompt_payload, local_config),
            "xiaohongshu": plan_xhs_publish(prompt_payload, local_config, publish_images),
            "douyin": plan_douyin_publish(prompt_payload, local_config, publish_images),
        }
        return prompt_result, plans
    except FileNotFoundError as exc:
        if not is_missing_brief_error(exc):
            raise
        target_date = date_str or build_prompt_assets.today_str()
        return build_blocked_adapter_plans(target_date, product_id, str(exc))


def is_missing_brief_error(exc: FileNotFoundError) -> bool:
    missing_path = Path(exc.filename or "")
    return missing_path.name in {"current_best_brief.json", "current_active_brief.json"}


def blocked_plan(adapter: str, reason: str) -> dict:
    return {
        "adapter": adapter,
        "ready": False,
        "cwd": "",
        "argv": [],
        "planned_command": "",
        "notes": [
            "缺少今日 brief，当前只能完成环境检测，无法生成图片或发布计划。",
            reason,
        ],
        "images": [],
    }


def build_blocked_adapter_plans(target_date: str, product_id: str, reason: str) -> tuple[dict, dict[str, dict]]:
    prompt_result = {
        "date": target_date,
        "product_id": product_id,
        "status": "blocked_missing_brief",
        "missing_prerequisite": "current_best_brief.json",
        "reason": reason,
        "json_path": "",
        "markdown_path": "",
    }
    plans = {
        "image": blocked_plan("dreamina", reason),
        "xiaohongshu": blocked_plan("xiaohongshu", reason),
        "douyin": blocked_plan("douyin", reason),
    }
    return prompt_result, plans


def execute_adapters_command(
    paths: AppPaths,
    product_id: str,
    date_str: str | None = None,
    *,
    scope: str = "all",
    include_prompt_build: bool = True,
    template_id_override: str | None = None,
    slot: int | None = None,
) -> dict:
    prompt_result, plans = build_adapter_plans(
        paths,
        product_id,
        date_str,
        template_id_override=template_id_override,
        slot=slot,
    )
    target_date = prompt_result["date"]
    execute_image = scope in {"all", "image"}
    execute_xhs = scope in {"all", "publish", "xiaohongshu"}
    execute_douyin = scope in {"all", "publish", "douyin"}
    execute_publish = execute_xhs or execute_douyin
    results = {
        "image": execute_named_plan("image", plans["image"], execute=execute_image),
        "xiaohongshu": execute_named_plan("xiaohongshu", plans["xiaohongshu"], execute=execute_xhs),
        "douyin": execute_named_plan("douyin", plans["douyin"], execute=execute_douyin),
    }
    payload = {
        "date": target_date,
        "product_id": product_id,
        "mode": "execute" if (execute_image or execute_publish) else "plan",
        "execute_image": execute_image,
        "execute_publish": execute_publish,
        "prompt_result": prompt_result,
        "results": results,
    }
    payload["artifacts"] = write_execution_report(paths, product_id, target_date, payload)
    return payload


def run_daily_command(paths: AppPaths, product_id: str, date_str: str | None = None, *, execute: bool = False) -> int:
    config = load_product_config(paths.products_dir / product_id / "product.json")
    news_notes: list[str] = []
    try:
        news_result = build_hot_pool.run(paths, product_id, date_str)
    except Exception as exc:  # noqa: BLE001
        news_result = {
            "status": "failed",
            "error": str(exc),
            "fallback": "continue-with-brand-pool",
        }
        news_notes.append("News refresh failed, so the daily run continued with the brand fallback path.")
    brand_result = build_brand_pool.run(paths, product_id, date_str)
    router_result = route_topics.run(paths, product_id, date_str)
    briefs_result = build_briefs.run(paths, product_id, date_str)
    best_result = select_best_brief.run(paths, product_id, date_str)
    prompt_result, plans = build_adapter_plans(paths, product_id, date_str)
    execution_payload = execute_adapters_command(
        paths,
        product_id,
        date_str,
        scope="all" if execute else "none",
    )
    steps = [
        "load-product-package",
        "load-local-runtime-config",
        "refresh-news-pool",
        "build-brand-pool",
        "route-upstream-candidates",
        "build-briefs",
        "select-best-brief",
        "build-image-prompt-assets",
        "call-image-adapter",
        "call-publish-adapter",
        "write-runtime-outputs",
    ]
    payload = {
        "mode": "partial-run",
        "product_id": product_id,
        "product_name": config["name"],
        "default_workflow": config["default_workflow"],
        "completed": {
            "refresh_news": news_result,
            "build_brand_pool": brand_result,
            "route_topics": router_result,
            "build_briefs": briefs_result,
            "select_best_brief": best_result,
            "build_image_prompt": prompt_result,
            "adapter_plans": plans,
            "adapter_execution": execution_payload,
        },
        "remaining": [] if execute else [
            "call-image-adapter",
            "call-publish-adapter",
        ],
        "steps": steps,
        "notes": [
            "This local shell now runs the migrated chain through image prompt asset generation.",
            "Adapters default to plan mode. Pass --execute to trigger real adapter calls.",
        ] + news_notes,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


def load_json_file(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _existing_file(value: str | None) -> str | None:
    candidate = str(value or "").strip()
    if not candidate:
        return None
    target = Path(candidate)
    return str(target) if target.is_file() else None


def _gallery_search_directories(items: list[dict], local_config: dict[str, object]) -> list[Path]:
    candidate_dirs: list[Path] = []
    for raw_dir in (
        local_config.get("image", {}).get("downloads_dir", "") if isinstance(local_config.get("image"), dict) else "",
        local_config.get("publish", {}).get("image_dir", "") if isinstance(local_config.get("publish"), dict) else "",
    ):
        directory = str(raw_dir or "").strip()
        if directory:
            candidate_dirs.append(Path(directory))

    for item in items:
        existing_image = _existing_file(item.get("imagePath"))
        if existing_image:
            candidate_dirs.append(Path(existing_image).parent)

    normalized_dirs: list[Path] = []
    seen: set[str] = set()
    for directory in candidate_dirs:
        key = str(directory)
        if key in seen or not directory.is_dir():
            continue
        seen.add(key)
        normalized_dirs.append(directory)
    return normalized_dirs


def _find_downloaded_image_by_submit_id(submit_id: str | None, directories: list[Path]) -> str | None:
    token = str(submit_id or "").strip()
    if not token:
        return None
    expected_prefix = f"{token}_"
    matches: list[Path] = []
    for directory in directories:
        try:
            matches.extend(
                candidate
                for candidate in directory.iterdir()
                if candidate.is_file() and candidate.name.startswith(expected_prefix)
            )
        except OSError:
            continue
    if not matches:
        return None
    matches.sort(key=lambda candidate: candidate.stat().st_mtime, reverse=True)
    return str(matches[0])


def load_publish_images(paths: AppPaths, product_id: str, local_config: dict[str, object]) -> list[str]:
    gallery_path = paths.runtime_product_state_dir(product_id) / "current_template_gallery.json"
    if not gallery_path.exists():
        return []
    payload = load_json_file(str(gallery_path))
    items = payload.get("items", []) if isinstance(payload, dict) else []
    search_dirs = _gallery_search_directories(items, local_config)
    changed = False
    normalized: list[str] = []
    for item in sorted(items, key=lambda entry: int(entry.get("slot", 999))):
        image_path = _existing_file(item.get("imagePath"))
        if not image_path:
            recovered_path = _find_downloaded_image_by_submit_id(item.get("submitId"), search_dirs)
            if recovered_path:
                image_path = recovered_path
                item["imagePath"] = recovered_path
                item["status"] = "completed"
                item["error"] = None
                changed = True
        if item.get("status") != "completed" or not image_path:
            continue
        if not image_path or image_path in normalized:
            continue
        normalized.append(image_path)
    if changed and isinstance(payload, dict):
        payload["items"] = items
        gallery_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return normalized[:3]


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    root = resolve_root(args.root)
    runtime_root = resolve_runtime_root(root, args.runtime_root)
    paths = AppPaths.from_root(root, runtime_root)

    if args.command == "inspect":
        return inspect_command(paths, args.product)
    if args.command == "refresh-news":
        print(json.dumps(build_hot_pool.run(paths, args.product, args.date), ensure_ascii=False, indent=2))
        return 0
    if args.command == "build-brand-pool":
        print(json.dumps(build_brand_pool.run(paths, args.product, args.date), ensure_ascii=False, indent=2))
        return 0
    if args.command == "route-topics":
        print(json.dumps(route_topics.run(paths, args.product, args.date), ensure_ascii=False, indent=2))
        return 0
    if args.command == "build-briefs":
        print(json.dumps(build_briefs.run(paths, args.product, args.date), ensure_ascii=False, indent=2))
        return 0
    if args.command == "select-best-brief":
        print(json.dumps(select_best_brief.run(paths, args.product, args.date), ensure_ascii=False, indent=2))
        return 0
    if args.command == "build-image-prompt":
        result = build_prompt_assets.run(
            paths,
            args.product,
            args.date,
            template_id_override=args.template_id,
            slot=args.slot,
        )
        result = {key: value for key, value in result.items() if key != "payload"}
        print(
            json.dumps(
                result,
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    if args.command == "plan-execution":
        payload = execute_adapters_command(
            paths,
            args.product,
            args.date,
            scope="none",
            template_id_override=args.template_id,
            slot=args.slot,
        )
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0
    if args.command == "execute-adapters":
        payload = execute_adapters_command(
            paths,
            args.product,
            args.date,
            scope=args.scope,
            template_id_override=args.template_id,
            slot=args.slot,
        )
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0
    if args.command == "run-daily":
        return run_daily_command(paths, args.product, args.date, execute=args.execute)

    parser.error(f"Unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
