from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Config not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_product_config(path: Path) -> dict[str, Any]:
    return load_json(path)


def _normalize_account_name(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    allowed = []
    for char in raw:
        if char.isalnum() or char in {"-", "_"}:
            allowed.append(char.lower())
        elif char in {" ", "."}:
            allowed.append("-")
    normalized = "".join(allowed).strip("-_")
    while "--" in normalized:
        normalized = normalized.replace("--", "-")
    return normalized


def default_publish_accounts() -> dict[str, list[dict[str, Any]]]:
    return {
        "xiaohongshu": [],
        "douyin": [],
    }


def normalize_publish_accounts(
    payload: dict[str, Any] | None,
    *,
    legacy_local: dict[str, Any] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    normalized = default_publish_accounts()
    payload = payload or {}

    for platform in ("xiaohongshu", "douyin"):
        seen: set[str] = set()
        items = payload.get(platform, [])
        if not isinstance(items, list):
            items = []
        for item in items:
            if not isinstance(item, dict):
                continue
            account_name = _normalize_account_name(
                item.get("accountName") or item.get("account_name") or item.get("name")
            )
            if not account_name or account_name in seen:
                continue
            seen.add(account_name)
            display_name = str(item.get("displayName") or item.get("display_name") or account_name).strip() or account_name
            normalized[platform].append(
                {
                    "id": str(item.get("id") or f"{platform}:{account_name}"),
                    "platform": platform,
                    "accountName": account_name,
                    "displayName": display_name,
                    "enabled": bool(item.get("enabled", True)),
                    "status": str(item.get("status") or "unknown"),
                    "lastCheckedAt": item.get("lastCheckedAt"),
                    "lastLoginAt": item.get("lastLoginAt"),
                    "sourceType": str(item.get("sourceType") or "sau_account"),
                    "sourceValue": str(item.get("sourceValue") or account_name),
                    "legacyHint": bool(item.get("legacyHint", False)),
                }
            )

    legacy_publish = (legacy_local or {}).get("publish", {})
    legacy_douyin_account = _normalize_account_name(
        legacy_publish.get("douyin", {}).get("account", "")
    )
    if legacy_douyin_account and not normalized["douyin"]:
        normalized["douyin"].append(
            {
                "id": f"douyin:{legacy_douyin_account}",
                "platform": "douyin",
                "accountName": legacy_douyin_account,
                "displayName": legacy_douyin_account,
                "enabled": bool(legacy_publish.get("douyin", {}).get("enabled", True)),
                "status": "unknown",
                "lastCheckedAt": None,
                "lastLoginAt": None,
                "sourceType": "legacy_single_account",
                "sourceValue": legacy_douyin_account,
                "legacyHint": True,
            }
        )

    return normalized


def load_publish_accounts(
    config_dir: Path,
    *,
    legacy_local: dict[str, Any] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    accounts_path = config_dir / "publish_accounts.json"
    payload = load_json(accounts_path) if accounts_path.exists() else {}
    return normalize_publish_accounts(payload, legacy_local=legacy_local)


def save_publish_accounts(
    config_dir: Path,
    payload: dict[str, Any],
    *,
    legacy_local: dict[str, Any] | None = None,
) -> tuple[dict[str, list[dict[str, Any]]], Path]:
    normalized = normalize_publish_accounts(payload, legacy_local=legacy_local)
    accounts_path = config_dir / "publish_accounts.json"
    accounts_path.parent.mkdir(parents=True, exist_ok=True)
    accounts_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    return normalized, accounts_path


def load_local_runtime_config(config_dir: Path) -> dict[str, Any]:
    local_path = config_dir / "local.json"
    if local_path.exists():
        local = load_json(local_path)
    else:
        local = load_json(config_dir / "local.example.json")
    local["publish_accounts"] = load_publish_accounts(config_dir, legacy_local=local)
    return local
