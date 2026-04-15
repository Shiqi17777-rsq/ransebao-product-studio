from __future__ import annotations

import json
import locale
import os
import shutil
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from ..core.paths import AppPaths


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _tail(text: str | None, limit: int = 2000) -> str:
    if not text:
        return ""
    return text[-limit:]


def _load_json_text(text: str) -> dict[str, Any] | None:
    try:
        return json.loads(text)
    except Exception:
        return None


def _decode_process_output(data: bytes | None) -> str:
    if not data:
        return ""

    encodings = [
        "utf-8",
        "utf-8-sig",
        locale.getpreferredencoding(False) or "",
        "gbk",
    ]
    seen: set[str] = set()
    for encoding in encodings:
        normalized = (encoding or "").strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _run_process(
    argv: list[str],
    *,
    cwd: str,
    env: dict[str, str] | None = None,
) -> tuple[subprocess.CompletedProcess[bytes], str, str]:
    completed = subprocess.run(
        argv,
        cwd=cwd,
        env={**os.environ, **env} if env else None,
        capture_output=True,
        text=False,
        check=False,
    )
    stdout_text = _decode_process_output(completed.stdout)
    stderr_text = _decode_process_output(completed.stderr)
    return completed, stdout_text, stderr_text


def _download_file(url: str, destination: Path, *, attempts: int = 3, timeout: int = 120) -> None:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
        },
    )
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            destination.parent.mkdir(parents=True, exist_ok=True)
            with urlopen(request, timeout=timeout) as response, destination.open("wb") as output:
                shutil.copyfileobj(response, output)
            if destination.is_file() and destination.stat().st_size > 0:
                return
            raise OSError(f"Downloaded empty file from {url}")
        except Exception as exc:  # pragma: no cover - network dependent
            last_error = exc
            try:
                destination.unlink(missing_ok=True)
            except OSError:
                pass
            if attempt < attempts - 1:
                time.sleep(1.5)
    raise OSError(f"Failed to download result media from {url}: {last_error}")


def _download_result_images(result_payload: dict[str, Any], submit_id: str, downloads_dir: str) -> list[str]:
    images = result_payload.get("images", []) if isinstance(result_payload, dict) else []
    normalized_paths: list[str] = []
    target_dir = Path(downloads_dir)

    for index, item in enumerate(images, start=1):
        if not isinstance(item, dict):
            continue
        existing_path = str(item.get("path") or "").strip()
        if existing_path and Path(existing_path).is_file():
            normalized_paths.append(existing_path)
            continue

        image_url = str(item.get("image_url") or "").strip()
        if not image_url:
            continue
        parsed = urlparse(image_url)
        suffix = Path(parsed.path).suffix or ".png"
        target_path = target_dir / f"{submit_id}_image_{index}{suffix}"
        _download_file(image_url, target_path)
        normalized_paths.append(str(target_path))

    return normalized_paths


def execute_plan(plan: dict[str, Any], *, execute: bool) -> dict[str, Any]:
    base = {
        "adapter": plan.get("adapter"),
        "ready": plan.get("ready", False),
        "cwd": plan.get("cwd"),
        "planned_command": plan.get("planned_command"),
        "notes": list(plan.get("notes", [])),
        "images": list(plan.get("images", [])),
    }
    if not execute:
        return {
            **base,
            "mode": "plan",
            "status": "planned",
            "started_at": None,
            "finished_at": None,
            "returncode": None,
            "stdout_tail": "",
            "stderr_tail": "",
        }

    if not plan.get("ready"):
        return {
            **base,
            "mode": "execute",
            "status": "skipped_not_ready",
            "started_at": None,
            "finished_at": None,
            "returncode": None,
            "stdout_tail": "",
            "stderr_tail": "",
        }

    argv = plan.get("argv")
    cwd = plan.get("cwd")
    env = plan.get("env") if isinstance(plan.get("env"), dict) else None
    if not argv or not cwd:
        return {
            **base,
            "mode": "execute",
            "status": "skipped_invalid_plan",
            "started_at": None,
            "finished_at": None,
            "returncode": None,
            "stdout_tail": "",
            "stderr_tail": "",
        }

    started_at = _now_iso()
    try:
        completed, stdout_text, stderr_text = _run_process(argv, cwd=cwd, env=env)
    except FileNotFoundError as exc:
        finished_at = _now_iso()
        return {
            **base,
            "mode": "execute",
            "status": "failed_missing_binary",
            "started_at": started_at,
            "finished_at": finished_at,
            "returncode": None,
            "stdout_tail": "",
            "stderr_tail": str(exc),
        }
    except Exception as exc:  # pragma: no cover - defensive fallback
        finished_at = _now_iso()
        return {
            **base,
            "mode": "execute",
            "status": "failed_exception",
            "started_at": started_at,
            "finished_at": finished_at,
            "returncode": None,
            "stdout_tail": "",
            "stderr_tail": str(exc),
        }

    finished_at = _now_iso()
    return {
        **base,
        "mode": "execute",
        "status": "succeeded" if completed.returncode == 0 else "failed_returncode",
        "started_at": started_at,
        "finished_at": finished_at,
        "returncode": completed.returncode,
        "stdout_tail": _tail(stdout_text),
        "stderr_tail": _tail(stderr_text),
    }


def execute_image_plan(plan: dict[str, Any], *, execute: bool) -> dict[str, Any]:
    base = {
        "adapter": plan.get("adapter"),
        "ready": plan.get("ready", False),
        "cwd": plan.get("cwd"),
        "planned_command": plan.get("planned_command"),
        "notes": list(plan.get("notes", [])),
    }
    if not execute:
        return {
            **base,
            "mode": "plan",
            "status": "planned",
            "started_at": None,
            "finished_at": None,
            "returncode": None,
            "stdout_tail": "",
            "stderr_tail": "",
        }
    if not plan.get("ready"):
        return {
            **base,
            "mode": "execute",
            "status": "skipped_not_ready",
            "started_at": None,
            "finished_at": None,
            "returncode": None,
            "stdout_tail": "",
            "stderr_tail": "",
        }

    argv = plan.get("argv")
    cwd = plan.get("cwd")
    downloads_dir = str(plan.get("downloads_dir", "")).strip()
    python_bin = str(plan.get("python_bin") or "python3").strip() or "python3"
    query_argv = list(plan.get("query_argv") or [])
    if not argv or not cwd or not downloads_dir:
        return {
            **base,
            "mode": "execute",
            "status": "skipped_invalid_plan",
            "started_at": None,
            "finished_at": None,
            "returncode": None,
            "stdout_tail": "",
            "stderr_tail": "",
        }

    started_at = _now_iso()
    try:
        submit, submit_stdout, submit_stderr = _run_process(argv, cwd=cwd)
    except FileNotFoundError as exc:
        finished_at = _now_iso()
        return {
            **base,
            "mode": "execute",
            "status": "failed_missing_binary",
            "started_at": started_at,
            "finished_at": finished_at,
            "returncode": None,
            "stdout_tail": "",
            "stderr_tail": str(exc),
        }
    except Exception as exc:  # pragma: no cover
        finished_at = _now_iso()
        return {
            **base,
            "mode": "execute",
            "status": "failed_exception",
            "started_at": started_at,
            "finished_at": finished_at,
            "returncode": None,
            "stdout_tail": "",
            "stderr_tail": str(exc),
        }

    submit_payload = _load_json_text(submit_stdout)
    submit_id = None
    if submit_payload:
        submit_id = submit_payload.get("data", {}).get("submit_id") or submit_payload.get("submit_id")

    if submit.returncode != 0 or not submit_id:
        finished_at = _now_iso()
        return {
            **base,
            "mode": "execute",
            "status": "failed_submit",
            "started_at": started_at,
            "finished_at": finished_at,
            "returncode": submit.returncode,
            "stdout_tail": _tail(submit_stdout, limit=4000),
            "stderr_tail": _tail(submit_stderr, limit=4000),
        }

    poll_attempts = int(plan.get("poll_attempts", 8))
    poll_interval_seconds = int(plan.get("poll_interval_seconds", 15))
    stdout_parts = [submit_stdout]
    stderr_parts = [submit_stderr]
    download_paths: list[str] = []
    final_status = "submitted_waiting"

    for attempt in range(poll_attempts):
        if query_argv:
            query_cmd = list(query_argv) + ["--submit_id", str(submit_id)]
        else:
            query_cmd = [
                python_bin,
                "scripts/query_result.py",
                "--submit-id",
                str(submit_id),
                "--download-dir",
                downloads_dir,
            ]
        query, query_stdout, query_stderr = _run_process(query_cmd, cwd=cwd)
        stdout_parts.append(query_stdout)
        stderr_parts.append(query_stderr)
        payload = _load_json_text(query_stdout) or {}
        data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
        gen_status = data.get("gen_status")
        if gen_status == "success":
            try:
                download_paths = _download_result_images(data.get("result_json", {}), str(submit_id), downloads_dir)
            except Exception as exc:
                final_status = "failed_download"
                stderr_parts.append(str(exc))
                break
            final_status = "succeeded" if download_paths else "failed_download"
            if final_status == "failed_download":
                stderr_parts.append("Image task succeeded remotely but no image was downloaded.")
            break
        if gen_status == "fail":
            final_status = "failed_generation"
            break
        if attempt < poll_attempts - 1:
            time.sleep(poll_interval_seconds)

    finished_at = _now_iso()
    return {
        **base,
        "mode": "execute",
        "status": final_status,
        "started_at": started_at,
        "finished_at": finished_at,
        "returncode": 0 if final_status == "succeeded" else submit.returncode,
        "submit_id": submit_id,
        "download_paths": download_paths,
        "stdout_tail": _tail("".join(part for part in stdout_parts if part), limit=4000),
        "stderr_tail": _tail("".join(part for part in stderr_parts if part), limit=4000),
    }


def execute_multi_account_plan(plan: dict[str, Any], *, execute: bool) -> dict[str, Any]:
    base = {
        "adapter": plan.get("adapter"),
        "platform": plan.get("platform"),
        "ready": plan.get("ready", False),
        "cwd": plan.get("cwd"),
        "planned_command": plan.get("planned_command"),
        "notes": list(plan.get("notes", [])),
        "images": list(plan.get("images", [])),
        "accounts": list(plan.get("accounts", [])),
    }
    if not execute:
        return {
            **base,
            "mode": "plan",
            "status": "planned",
            "started_at": None,
            "finished_at": None,
            "returncode": None,
            "stdout_tail": "",
            "stderr_tail": "",
            "account_results": [],
        }
    if not plan.get("ready"):
        return {
            **base,
            "mode": "execute",
            "status": "skipped_not_ready",
            "started_at": None,
            "finished_at": None,
            "returncode": None,
            "stdout_tail": "",
            "stderr_tail": "",
            "account_results": [],
        }

    account_plans = [item for item in plan.get("account_plans", []) if isinstance(item, dict)]
    cwd = plan.get("cwd")
    images = [str(item) for item in plan.get("images", []) if str(item).strip()]
    if not account_plans or not cwd:
        return {
            **base,
            "mode": "execute",
            "status": "skipped_invalid_plan",
            "started_at": None,
            "finished_at": None,
            "returncode": None,
            "stdout_tail": "",
            "stderr_tail": "",
            "account_results": [],
        }

    started_at = _now_iso()
    stdout_parts: list[str] = []
    stderr_parts: list[str] = []
    account_results: list[dict[str, Any]] = []
    success_count = 0

    for index, account_plan in enumerate(account_plans, start=1):
        argv = account_plan.get("argv")
        env = account_plan.get("env") if isinstance(account_plan.get("env"), dict) else None
        account_name = str(account_plan.get("accountName") or f"account-{index}")
        display_name = str(account_plan.get("displayName") or account_name)
        account_started_at = _now_iso()
        if not argv:
            account_result = {
                "accountName": account_name,
                "displayName": display_name,
                "status": "skipped_invalid_plan",
                "started_at": account_started_at,
                "finished_at": _now_iso(),
                "returncode": None,
                "stdout_tail": "",
                "stderr_tail": "",
            }
            account_results.append(account_result)
            continue
        try:
            completed, stdout_text, stderr_text = _run_process(argv, cwd=cwd, env=env)
            account_status = "succeeded" if completed.returncode == 0 else "failed_returncode"
            if account_status == "succeeded":
                success_count += 1
            account_result = {
                "accountName": account_name,
                "displayName": display_name,
                "status": account_status,
                "started_at": account_started_at,
                "finished_at": _now_iso(),
                "returncode": completed.returncode,
                "stdout_tail": _tail(stdout_text),
                "stderr_tail": _tail(stderr_text),
            }
            account_results.append(account_result)
            stdout_parts.append(f"[{account_name}]\n{stdout_text}".strip())
            stderr_parts.append(f"[{account_name}]\n{stderr_text}".strip())
        except FileNotFoundError as exc:
            account_result = {
                "accountName": account_name,
                "displayName": display_name,
                "status": "failed_missing_binary",
                "started_at": account_started_at,
                "finished_at": _now_iso(),
                "returncode": 127,
                "stdout_tail": "",
                "stderr_tail": str(exc),
            }
            account_results.append(account_result)
            stderr_parts.append(f"[{account_name}]\n{exc}".strip())

    finished_at = _now_iso()
    if success_count == len(account_results) and account_results:
        status = "succeeded"
    elif success_count > 0:
        status = "partial_success"
    else:
        status = "failed_returncode"
    return {
        **base,
        "mode": "execute",
        "status": status,
        "started_at": started_at,
        "finished_at": finished_at,
        "returncode": 0 if status in {"succeeded", "partial_success"} else 1,
        "stdout_tail": _tail("\n\n".join(part for part in stdout_parts if part)),
        "stderr_tail": _tail("\n\n".join(part for part in stderr_parts if part)),
        "published_images": images,
        "account_results": account_results,
    }


def execute_named_plan(name: str, plan: dict[str, Any], *, execute: bool) -> dict[str, Any]:
    if name == "image":
        return execute_image_plan(plan, execute=execute)
    if name in {"xiaohongshu", "douyin"}:
        return execute_multi_account_plan(plan, execute=execute)
    return execute_plan(plan, execute=execute)


def write_execution_report(
    paths: AppPaths,
    product_id: str,
    date_str: str,
    payload: dict[str, Any],
) -> dict[str, str]:
    state_dir = paths.runtime_product_state_dir(product_id)
    output_dir = paths.runtime_product_outputs_dir(product_id) / "execution"
    state_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    json_path = state_dir / "current_execution_report.json"
    markdown_path = output_dir / f"{date_str}.md"

    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    markdown_path.write_text(to_markdown(payload), encoding="utf-8")
    return {
        "json_path": str(json_path),
        "markdown_path": str(markdown_path),
    }


def to_markdown(payload: dict[str, Any]) -> str:
    lines = [
        f"# 适配器执行报告 - {payload['date']}",
        "",
        "## 概览",
        "",
        f"- 产品：{payload['product_id']}",
        f"- 模式：{payload['mode']}",
        f"- 已执行 image：{payload['execute_image']}",
        f"- 已执行 publish：{payload['execute_publish']}",
        "",
        "## 适配器结果",
        "",
    ]
    for name in ("image", "xiaohongshu", "douyin"):
        result = payload["results"][name]
        lines.extend(
            [
                f"### {name}",
                "",
                f"- adapter：{result.get('adapter')}",
                f"- status：{result.get('status')}",
                f"- ready：{result.get('ready')}",
                f"- cwd：{result.get('cwd') or ''}",
                f"- command：{result.get('planned_command') or ''}",
            ]
        )
        images = result.get("images") or result.get("published_images") or []
        if images:
            lines.append(f"- images：{', '.join(images)}")
        if result.get("submit_id"):
            lines.append(f"- submit_id：{result.get('submit_id')}")
        download_paths = result.get("download_paths") or []
        if download_paths:
            lines.append(f"- downloads：{', '.join(download_paths)}")
        stdout_tail = result.get("stdout_tail", "")
        stderr_tail = result.get("stderr_tail", "")
        if stdout_tail:
            lines.extend(["", "stdout:", "", "```text", stdout_tail, "```"])
        if stderr_tail:
            lines.extend(["", "stderr:", "", "```text", stderr_tail, "```"])
        lines.append("")
    return "\n".join(lines)
