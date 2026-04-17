from __future__ import annotations

from typing import Any

from .account_registry import (
    enabled_accounts,
    publish_headed,
    publish_private,
    resolve_sau_bin,
    resolve_sau_env,
    resolve_sau_root,
)
from .video_publish_common import (
    coerce_text,
    default_video_tags,
    default_video_title,
    normalize_publish_video,
)


def plan_publish(video_payload: dict[str, Any], local_config: dict[str, Any]) -> dict[str, Any]:
    root = resolve_sau_root(local_config)
    sau_bin = resolve_sau_bin(root)
    sau_env = resolve_sau_env(local_config)
    accounts = enabled_accounts(local_config, "xiaohongshu")
    headed = publish_headed(local_config, "xiaohongshu")
    private_publish = publish_private(local_config, "xiaohongshu")

    video_path = normalize_publish_video(video_payload.get("video_path"))
    hair_color_name = coerce_text(video_payload.get("hair_color_name"))
    template_name = coerce_text(video_payload.get("template_name"))
    title = coerce_text(video_payload.get("xiaohongshu_title")) or default_video_title(
        "xiaohongshu",
        hair_color_name,
        template_name,
    )
    desc = coerce_text(video_payload.get("xiaohongshu_desc")) or coerce_text(video_payload.get("xiaohongshu_body"))
    tags = coerce_text(video_payload.get("xiaohongshu_tags")) or default_video_tags(
        "xiaohongshu",
        hair_color_name,
        desc,
    )

    account_plans: list[dict[str, Any]] = []
    for account in accounts:
        argv = [
            sau_bin,
            "xiaohongshu",
            "upload-video",
            "--account",
            account["accountName"],
            "--file",
            video_path,
            "--title",
            title,
        ]
        if desc:
            argv.extend(["--desc", desc])
        if tags:
            argv.extend(["--tags", tags])
        if private_publish:
            argv.append("--private")
        argv.append("--headed" if headed else "--headless")

        command = (
            f"cd {root} && "
            f"{sau_bin} xiaohongshu upload-video --account '{account['accountName']}'"
            f" --file '{video_path}' --title '{title}'"
        )
        if desc:
            command += f" --desc '{desc}'"
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
        "adapter": "xiaohongshu-video-sau",
        "platform": "xiaohongshu",
        "publish_type": "video",
        "ready": bool(root and video_path and title and account_plans),
        "root": root,
        "cwd": root or None,
        "sau_bin": sau_bin,
        "env": sau_env,
        "headed": headed,
        "private": private_publish,
        "file": video_path,
        "video_path": video_path,
        "title": title,
        "desc": desc,
        "tags": tags,
        "template_name": template_name,
        "hair_color_name": hair_color_name,
        "accounts": accounts,
        "account_plans": account_plans,
        "planned_command": "\n".join(
            plan["planned_command"] for plan in account_plans if plan.get("planned_command")
        ),
        "notes": [
            "Uses sau xiaohongshu upload-video with the current generated mp4.",
            "Video publish copy defaults to template-rendered Xiaohongshu text plus a generated title.",
            "Account selection, private mode, and headed/headless settings reuse the existing publish config.",
        ],
    }
