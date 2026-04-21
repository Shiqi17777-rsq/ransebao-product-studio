from __future__ import annotations

from pathlib import Path
from typing import Any


def resolve_sau_root(local_config: dict[str, Any]) -> str:
    publish_cfg = local_config.get("publish", {})
    candidates = [
        publish_cfg.get("sau_root"),
        publish_cfg.get("douyin", {}).get("root"),
    ]
    for candidate in candidates:
        value = str(candidate or "").strip()
        if value:
            return value
    return ""


def resolve_sau_bin(root: str) -> str:
    if not root:
        return "sau"
    candidates = [
        Path(root) / "Scripts" / "sau.exe",
        Path(root) / "Scripts" / "sau",
        Path(root) / "bin" / "sau",
        Path(root) / ".venv" / "Scripts" / "sau.exe",
        Path(root) / ".venv" / "Scripts" / "sau",
        Path(root) / ".venv" / "bin" / "sau",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    root_path = Path(root)
    if root_path.exists() and root_path.is_file():
        return str(root_path)
    return "sau"


def resolve_sau_env(local_config: dict[str, Any]) -> dict[str, str]:
    publish_cfg = local_config.get("publish", {})
    browsers_path = str(publish_cfg.get("patchright_browsers_path") or "").strip()
    if not browsers_path:
        return {}
    return {
        "PLAYWRIGHT_BROWSERS_PATH": browsers_path,
    }


def publish_headed(local_config: dict[str, Any], platform: str) -> bool:
    publish_cfg = local_config.get("publish", {})
    platform_cfg = publish_cfg.get(platform, {})
    return bool(platform_cfg.get("headed", True))


def publish_private(local_config: dict[str, Any], platform: str) -> bool:
    publish_cfg = local_config.get("publish", {})
    platform_cfg = publish_cfg.get(platform, {})
    return bool(platform_cfg.get("private", True))


def enabled_accounts(local_config: dict[str, Any], platform: str) -> list[dict[str, Any]]:
    publish_accounts = local_config.get("publish_accounts", {}) or {}
    items = publish_accounts.get(platform, [])
    if not isinstance(items, list):
        return []

    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        account_name = str(item.get("accountName") or "").strip()
        if not account_name or account_name in seen:
            continue
        seen.add(account_name)
        if not bool(item.get("enabled", True)):
            continue
        normalized.append(
            {
                "id": str(item.get("id") or f"{platform}:{account_name}"),
                "platform": platform,
                "accountName": account_name,
                "displayName": str(item.get("displayName") or account_name).strip() or account_name,
                "status": str(item.get("status") or "unknown"),
                "lastCheckedAt": item.get("lastCheckedAt"),
                "lastLoginAt": item.get("lastLoginAt"),
            }
        )
    return normalized
