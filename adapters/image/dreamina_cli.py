from __future__ import annotations

from pathlib import Path
from typing import Any


def _resolve_python_bin(local_config: dict[str, Any]) -> str:
    runtime_cfg = local_config.get("runtime", {})
    python_bin = str(runtime_cfg.get("python_bin") or "").strip()
    return python_bin or "python3"


def _collect_reference_images(device_image_dir: str, limit: int = 3) -> list[str]:
    root = Path(device_image_dir)
    if not root.is_dir():
        return []
    allowed = {".png", ".jpg", ".jpeg", ".webp"}
    files = [
        str(path)
        for path in sorted(root.iterdir())
        if path.is_file() and path.suffix.lower() in allowed
    ]
    return files[:limit]


def _resolve_dreamina_targets(cli_value: str) -> tuple[str, str]:
    raw = str(cli_value or "").strip()
    if not raw:
        return "", ""
    target = Path(raw).expanduser()
    if target.is_file():
        return str(target), ""
    if target.is_dir():
        legacy_script = target / "scripts" / "image2image.py"
        if legacy_script.exists():
            return "", str(target)
    return "", ""


def plan_generation(prompt_env: dict[str, Any], local_config: dict[str, Any]) -> dict[str, Any]:
    image_cfg = local_config.get("image", {})
    python_bin = _resolve_python_bin(local_config)
    cli_root = image_cfg.get("dreamina_cli_root", "").strip()
    device_image_dir = image_cfg.get("device_image_dir", "").strip()
    downloads_dir = image_cfg.get("downloads_dir", "").strip()
    poll_attempts = int(image_cfg.get("poll_attempts", 8))
    poll_interval_seconds = int(image_cfg.get("poll_interval_seconds", 15))

    prompt_path = prompt_env["artifacts"]["prompt_txt"]
    prompt_text = Path(prompt_path).read_text(encoding="utf-8").strip() if prompt_path else ""
    reference_images = _collect_reference_images(device_image_dir)
    official_bin, legacy_root = _resolve_dreamina_targets(cli_root)
    argv = None
    query_argv = None
    command = None
    if official_bin and reference_images:
        argv = [official_bin, "image2image"]
        for image_path in reference_images:
            argv.extend(["--images", image_path])
        argv.extend(
            [
                "--prompt",
                prompt_text,
                "--ratio",
                "9:16",
                "--resolution_type",
                "2k",
                "--model_version",
                "5.0",
            ]
        )
        query_argv = [official_bin, "query_result"]
        command = (
            f"{official_bin} image2image "
            + " ".join(f"--images '{image_path}'" for image_path in reference_images)
            + f" --prompt \"$(cat '{prompt_path}')\""
            + " --ratio 9:16 --resolution_type 2k --model_version 5.0"
        )
    elif legacy_root and reference_images:
        argv = [python_bin, "scripts/image2image.py"]
        for image_path in reference_images:
            argv.extend(["--images", image_path])
        argv.extend(
            [
                "--prompt",
                prompt_text,
                "--ratio",
                "9:16",
                "--resolution-type",
                "2k",
                "--model-version",
                "5.0",
            ]
        )
        query_argv = [python_bin, "scripts/query_result.py"]
        command = (
            f"cd {legacy_root} && "
            f"{python_bin} scripts/image2image.py "
            + " ".join(f"--images '{image_path}'" for image_path in reference_images)
            + " "
            f"--prompt \"$(cat '{prompt_path}')\" "
            f"--ratio 9:16 --resolution-type 2k --model-version 5.0"
        )

    return {
        "adapter": "dreamina-cli",
        "ready": bool((official_bin or legacy_root) and reference_images and downloads_dir),
        "cli_root": legacy_root or "",
        "cli_bin": official_bin or "",
        "device_image_dir": device_image_dir,
        "reference_images": reference_images,
        "downloads_dir": downloads_dir,
        "python_bin": python_bin,
        "poll_attempts": poll_attempts,
        "poll_interval_seconds": poll_interval_seconds,
        "prompt_path": prompt_path,
        "cwd": legacy_root or str(Path(official_bin).parent) or None,
        "argv": argv,
        "query_argv": query_argv,
        "planned_command": command,
        "notes": [
            "Default mode keeps image generation in plan mode during migration.",
            "Use execute-adapters or run-daily --execute to trigger the real CLI call."
        ],
    }
