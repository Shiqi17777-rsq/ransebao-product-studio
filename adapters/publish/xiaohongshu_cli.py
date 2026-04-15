from __future__ import annotations

from pathlib import Path
from typing import Any

from .account_registry import (
    enabled_accounts,
    publish_headed,
    publish_private,
    resolve_sau_bin,
    resolve_sau_env,
    resolve_sau_root,
)


def _normalize_publish_images(image_paths: list[str] | None) -> list[str]:
    normalized: list[str] = []
    for raw_path in image_paths or []:
        value = str(raw_path).strip()
        if not value:
            continue
        path = Path(value)
        if not path.is_file():
            continue
        resolved = str(path)
        if resolved in normalized:
            continue
        normalized.append(resolved)
    return normalized


def _derive_topics(prompt_env: dict[str, Any]) -> list[str]:
    topics: list[str] = []
    for tag in prompt_env.get("hashtags", {}).get("xiaohongshu", []):
        normalized = str(tag).strip().lstrip("#").strip()
        if normalized and normalized not in topics:
            topics.append(normalized)
    return topics[:4] or ["染色宝"]


def plan_publish(
    prompt_env: dict[str, Any],
    local_config: dict[str, Any],
    publish_images: list[str] | None = None,
) -> dict[str, Any]:
    publish_cfg = local_config.get("publish", {})
    xhs_cfg = publish_cfg.get("xiaohongshu", {})
    root = resolve_sau_root(local_config)
    sau_bin = resolve_sau_bin(root)
    sau_env = resolve_sau_env(local_config)
    accounts = enabled_accounts(local_config, "xiaohongshu")
    headed = publish_headed(local_config, "xiaohongshu")
    private_publish = publish_private(local_config, "xiaohongshu")
    image_dir = publish_cfg.get("image_dir", "").strip()
    images = _normalize_publish_images(publish_images)

    body = prompt_env["publish"]["xhs_body"]
    title = prompt_env["publish"]["title"]
    topics = _derive_topics(prompt_env)
    tags = ",".join(topics)

    account_plans: list[dict[str, Any]] = []
    for account in accounts:
        argv = [
            sau_bin,
            "xiaohongshu",
            "upload-note",
            "--account",
            account["accountName"],
            "--images",
            *images,
            "--title",
            title,
            "--note",
            body,
        ]
        if tags:
            argv.extend(["--tags", tags])
        if private_publish:
            argv.append("--private")
        argv.append("--headed" if headed else "--headless")

        command = (
            f"cd {root} && "
            f"{sau_bin} xiaohongshu upload-note --account '{account['accountName']}' --images "
            + " ".join(f"'{image_path}'" for image_path in images)
            + f" --title '{title}' --note '{body}'"
        )
        if tags:
            command += f" --tags '{tags}'"
        if private_publish:
            command += " --private"
        command += f" {'--headed' if headed else '--headless'}"

        account_plans.append(
            {
                "accountName": account["accountName"],
                "displayName": account["displayName"],
                "argv": argv,
                "env": sau_env,
                "planned_command": command,
            }
        )

    return {
        "adapter": "xiaohongshu-sau",
        "platform": "xiaohongshu",
        "ready": bool(root and len(images) >= 3 and account_plans),
        "root": root,
        "cwd": root or None,
        "sau_bin": sau_bin,
        "env": sau_env,
        "headed": headed,
        "private": private_publish,
        "image_dir": image_dir,
        "images": images,
        "latest_image": images[0] if images else None,
        "title": title,
        "body": body,
        "topics": topics,
        "tags": tags,
        "accounts": accounts,
        "account_plans": account_plans,
        "planned_command": "\n".join(
            plan["planned_command"] for plan in account_plans if plan.get("planned_command")
        ),
        "notes": [
            "当前会使用 sau 的 xiaohongshu account_name 模型逐个已启用账号发布。",
            "旧版 storage_state_files 路线已不再作为长期主链。",
            "当前发布会优先使用模板页选中的 3 张生成结果。",
        ],
    }
