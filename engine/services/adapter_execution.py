from __future__ import annotations

import json
import locale
import base64
import mimetypes
import os
import shutil
import subprocess
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from ..core.paths import AppPaths


NANO_BANANA_STANDARD_MODEL = "gemini-3-pro-image-preview"
NANO_BANANA_STABLE_MODEL = "gemini-3-pro-image-preview-high"


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


def _coerce_json_value(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


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


def _media_suffix_from_mime(mime_type: str, fallback: str) -> str:
    if mime_type == "image/jpeg":
        return ".jpg"
    if mime_type == "image/png":
        return ".png"
    if mime_type == "image/webp":
        return ".webp"
    if mime_type == "video/mp4":
        return ".mp4"
    return mimetypes.guess_extension(mime_type) or fallback


def _collect_existing_media_paths(value: Any, allowed_suffixes: set[str]) -> list[str]:
    paths: list[str] = []
    if isinstance(value, str):
        candidate = Path(value)
        if candidate.suffix.lower() in allowed_suffixes and candidate.is_file():
            paths.append(str(candidate))
    elif isinstance(value, dict):
        for nested in value.values():
            paths.extend(_collect_existing_media_paths(nested, allowed_suffixes))
    elif isinstance(value, list):
        for nested in value:
            paths.extend(_collect_existing_media_paths(nested, allowed_suffixes))
    return paths


def _collect_media_url_items(value: Any, url_keys: set[str]) -> list[str]:
    urls: list[str] = []
    if isinstance(value, dict):
        for key, nested in value.items():
            if key in url_keys and isinstance(nested, str) and nested.strip():
                urls.append(nested.strip())
            else:
                urls.extend(_collect_media_url_items(nested, url_keys))
    elif isinstance(value, list):
        for nested in value:
            urls.extend(_collect_media_url_items(nested, url_keys))
    return urls


def _find_downloaded_media_files(
    submit_id: str,
    downloads_dir: str,
    allowed_suffixes: set[str],
    *,
    started_timestamp: float,
) -> list[str]:
    root = Path(downloads_dir)
    if not root.is_dir():
        return []
    matches = [
        path
        for path in root.iterdir()
        if path.is_file()
        and path.suffix.lower() in allowed_suffixes
        and (submit_id in path.name or path.stat().st_mtime >= started_timestamp)
    ]
    matches.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    return [str(path) for path in matches]


def _dreamina_log_root() -> Path:
    return Path.home() / ".dreamina_cli" / "logs"


def _recent_dreamina_log_files(started_timestamp: float) -> list[Path]:
    root = _dreamina_log_root()
    if not root.is_dir():
        return []
    cutoff = started_timestamp - 300
    matches: list[tuple[float, Path]] = []
    for path in root.rglob("*.log"):
        try:
            if not path.is_file():
                continue
            modified = path.stat().st_mtime
        except OSError:
            continue
        if modified >= cutoff:
            matches.append((modified, path))
    matches.sort(key=lambda item: item[0], reverse=True)
    return [path for _modified, path in matches]


def _read_text_file(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _find_dreamina_submit_failure(submit_id: str, started_timestamp: float) -> str:
    for path in _recent_dreamina_log_files(started_timestamp):
        recent_context = ""
        for raw_line in _read_text_file(path).splitlines():
            line = raw_line.strip()
            lower = line.lower()
            if "upload file failed" in lower or ("duration" in lower and "allowed range" in lower):
                recent_context = line
            if submit_id in line and "submit failed" in lower:
                if recent_context and recent_context not in line:
                    return f"{recent_context}\n{line}"
                return line
    return ""


def _count_dreamina_no_history(submit_id: str, started_timestamp: float) -> int:
    total = 0
    for path in _recent_dreamina_log_files(started_timestamp):
        for raw_line in _read_text_file(path).splitlines():
            line = raw_line.strip()
            if submit_id in line and "no history found in response" in line.lower():
                total += 1
    return total


def _download_result_videos(result_payload: dict[str, Any], submit_id: str, downloads_dir: str) -> list[str]:
    allowed = {".mp4", ".mov", ".webm", ".m4v"}
    existing = _collect_existing_media_paths(result_payload, allowed)
    if existing:
        return existing

    normalized_paths: list[str] = []
    for index, video_url in enumerate(
        _collect_media_url_items(result_payload, {"video_url", "download_url", "url"}),
        start=1,
    ):
        parsed = urlparse(video_url)
        suffix = Path(parsed.path).suffix or ".mp4"
        target_path = Path(downloads_dir) / f"{submit_id}_video_{index}{suffix}"
        _download_file(video_url, target_path)
        normalized_paths.append(str(target_path))
    return normalized_paths


def _auth_header_variants(url: str, api_key: str, auth_mode: str = "auto") -> list[dict[str, str]]:
    normalized_mode = str(auth_mode or "auto").strip().lower()
    host = urlparse(url).netloc.lower()
    if normalized_mode == "x-goog-api-key":
        return [{"x-goog-api-key": api_key}]
    if normalized_mode == "authorization":
        return [{"Authorization": api_key}]
    if normalized_mode == "authorization_bearer":
        return [{"Authorization": f"Bearer {api_key}"}]
    if "googleapis.com" in host:
        return [{"x-goog-api-key": api_key}]
    variants: list[dict[str, str]] = []
    if api_key.startswith("sk-"):
        variants.append({"Authorization": api_key})
        variants.append({"Authorization": f"Bearer {api_key}"})
    else:
        variants.append({"Authorization": f"Bearer {api_key}"})
        variants.append({"Authorization": api_key})
    variants.append({"x-goog-api-key": api_key})
    return variants


def _post_json(url: str, payload: dict[str, Any], *, api_key: str, auth_mode: str = "auto", timeout: int = 180) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    last_error: Exception | None = None
    for auth_headers in _auth_header_variants(url, api_key, auth_mode=auth_mode):
        request = Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                **auth_headers,
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            last_error = exc
            if exc.code not in {400, 401, 403}:
                raise
            continue
    if last_error:
        raise last_error
    raise RuntimeError("Nano Banana request failed before any response was returned.")


def _replace_model_in_endpoint(endpoint: str, current_model: str, next_model: str) -> str:
    marker = f"/models/{current_model}:generateContent"
    replacement = f"/models/{next_model}:generateContent"
    if marker in endpoint:
        return endpoint.replace(marker, replacement, 1)
    return endpoint


def _describe_exception(exc: Exception) -> str:
    if isinstance(exc, HTTPError):
        details = ""
        try:
            details = exc.read().decode("utf-8", errors="replace").strip()
        except Exception:
            details = ""
        if details:
            return f"HTTP Error {exc.code}: {exc.reason} | {details}"
    return str(exc)


def _inline_image_part(image_path: str) -> dict[str, Any]:
    mime_type = mimetypes.guess_type(image_path)[0] or "image/png"
    data = base64.b64encode(Path(image_path).read_bytes()).decode("ascii")
    return {
        "inlineData": {
            "mimeType": mime_type,
            "data": data,
        }
    }


def _extract_gemini_image(response_payload: dict[str, Any]) -> tuple[bytes | None, str, str]:
    text_parts: list[str] = []
    for candidate in response_payload.get("candidates", []):
        content = candidate.get("content") or {}
        for part in content.get("parts", []):
            if isinstance(part.get("text"), str):
                text_parts.append(part["text"])
            inline = part.get("inlineData") or part.get("inline_data") or {}
            encoded = inline.get("data")
            if encoded:
                mime_type = inline.get("mimeType") or inline.get("mime_type") or "image/png"
                return base64.b64decode(encoded), mime_type, "\n".join(text_parts)
    return None, "", "\n".join(text_parts)


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
    if plan.get("executor") == "gemini-image-api":
        return execute_gemini_image_plan(plan, execute=execute)

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
                download_paths = _download_result_images(
                    _coerce_json_value(data.get("result_json", {})),
                    str(submit_id),
                    downloads_dir,
                )
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


def execute_gemini_image_plan(plan: dict[str, Any], *, execute: bool) -> dict[str, Any]:
    base = {
        "adapter": plan.get("adapter"),
        "ready": plan.get("ready", False),
        "cwd": plan.get("cwd"),
        "planned_command": plan.get("planned_command"),
        "notes": list(plan.get("notes", [])),
        "model": plan.get("model"),
        "api_base": plan.get("api_base"),
        "auth_mode": plan.get("auth_mode"),
        "aspect_ratio": plan.get("aspect_ratio"),
        "image_size": plan.get("image_size"),
        "reference_images": list(plan.get("reference_images", [])),
        "downloads_dir": plan.get("downloads_dir"),
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

    started_at = _now_iso()
    prompt_text = str(plan.get("prompt_text") or "").strip()
    reference_images = [str(item) for item in plan.get("reference_images", []) if str(item).strip()]
    downloads_dir = str(plan.get("downloads_dir") or "").strip()
    api_key = str(plan.get("api_key") or "").strip()
    endpoint = str(plan.get("endpoint") or "").strip()
    requested_model = str(plan.get("model") or "").strip()
    auth_mode = str(plan.get("auth_mode") or "auto").strip()
    aspect_ratio = str(plan.get("aspect_ratio") or "9:16").strip()
    image_size = str(plan.get("image_size") or "4K").strip()
    if not prompt_text or not reference_images or not downloads_dir or not api_key or not endpoint:
        return {
            **base,
            "mode": "execute",
            "status": "skipped_invalid_plan",
            "started_at": started_at,
            "finished_at": _now_iso(),
            "returncode": None,
            "stdout_tail": "",
            "stderr_tail": "Nano Banana Pro plan is missing prompt, references, API key, endpoint, or downloads_dir.",
        }

    notes = list(base.get("notes", []))
    attempted_models: list[str] = []
    fallback_triggered = False
    fallback_model: str | None = None
    response_text = ""
    final_error: Exception | None = None
    final_error_status = "failed_exception"

    attempt_specs = [(requested_model, endpoint)]
    if requested_model == NANO_BANANA_STANDARD_MODEL:
        fallback_endpoint = _replace_model_in_endpoint(
            endpoint,
            NANO_BANANA_STANDARD_MODEL,
            NANO_BANANA_STABLE_MODEL,
        )
        attempt_specs.append((NANO_BANANA_STABLE_MODEL, fallback_endpoint))

    try:
        parts = [_inline_image_part(image_path) for image_path in reference_images]
        parts.append({"text": prompt_text})

        for index, (attempt_model, attempt_endpoint) in enumerate(attempt_specs):
            attempted_models.append(attempt_model)
            try:
                response_payload = _post_json(
                    attempt_endpoint,
                    {
                        "contents": [{"parts": parts}],
                        "generationConfig": {
                            "responseModalities": ["IMAGE"],
                            "imageConfig": {
                                "aspectRatio": aspect_ratio,
                                "imageSize": image_size,
                            },
                        },
                    },
                    api_key=api_key,
                    auth_mode=auth_mode,
                )
                image_bytes, mime_type, response_text = _extract_gemini_image(response_payload)
                if image_bytes:
                    Path(downloads_dir).mkdir(parents=True, exist_ok=True)
                    suffix = _media_suffix_from_mime(mime_type, ".png")
                    output_path = Path(downloads_dir) / f"nanobanana_{uuid.uuid4().hex[:12]}{suffix}"
                    output_path.write_bytes(image_bytes)
                    finished_at = _now_iso()
                    return {
                        **base,
                        "notes": notes,
                        "mode": "execute",
                        "status": "succeeded",
                        "model": attempt_model,
                        "requested_model": requested_model,
                        "attempted_models": attempted_models,
                        "fallback_model": fallback_model,
                        "fallback_triggered": fallback_triggered,
                        "started_at": started_at,
                        "finished_at": finished_at,
                        "returncode": 0,
                        "submit_id": f"nanobanana-{output_path.stem}",
                        "download_paths": [str(output_path)],
                        "stdout_tail": _tail(response_text or f"Saved generated image to {output_path}", limit=4000),
                        "stderr_tail": "",
                    }

                final_error_status = "failed_no_image"
                final_error = RuntimeError("Nano Banana Pro response did not include generated image data.")
            except Exception as exc:  # noqa: BLE001
                final_error_status = "failed_exception"
                final_error = exc

            if index < len(attempt_specs) - 1:
                fallback_triggered = True
                fallback_model = attempt_specs[index + 1][0]
                reason = _describe_exception(final_error) if final_error else "unknown error"
                notes.append(
                    f"Selected Nano Banana Pro standard model failed and automatically retried with {fallback_model}: {reason}"
                )

        error_text = _describe_exception(final_error) if final_error else "Nano Banana Pro generation failed."
        if final_error_status == "failed_no_image":
            return {
                **base,
                "notes": notes,
                "mode": "execute",
                "status": "failed_no_image",
                "model": attempted_models[-1] if attempted_models else requested_model,
                "requested_model": requested_model,
                "attempted_models": attempted_models,
                "fallback_model": fallback_model,
                "fallback_triggered": fallback_triggered,
                "started_at": started_at,
                "finished_at": _now_iso(),
                "returncode": 1,
                "stdout_tail": _tail(response_text, limit=4000),
                "stderr_tail": error_text,
            }

        return {
            **base,
            "notes": notes,
            "mode": "execute",
            "status": "failed_exception",
            "model": attempted_models[-1] if attempted_models else requested_model,
            "requested_model": requested_model,
            "attempted_models": attempted_models,
            "fallback_model": fallback_model,
            "fallback_triggered": fallback_triggered,
            "started_at": started_at,
            "finished_at": _now_iso(),
            "returncode": 1,
            "stdout_tail": "",
            "stderr_tail": error_text,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            **base,
            "notes": notes,
            "mode": "execute",
            "status": "failed_exception",
            "model": attempted_models[-1] if attempted_models else requested_model,
            "requested_model": requested_model,
            "attempted_models": attempted_models,
            "fallback_model": fallback_model,
            "fallback_triggered": fallback_triggered,
            "started_at": started_at,
            "finished_at": _now_iso(),
            "returncode": 1,
            "stdout_tail": "",
            "stderr_tail": _describe_exception(exc),
        }


def execute_video_plan(plan: dict[str, Any], *, execute: bool) -> dict[str, Any]:
    base = {
        "adapter": plan.get("adapter"),
        "ready": plan.get("ready", False),
        "cwd": plan.get("cwd"),
        "planned_command": plan.get("planned_command"),
        "notes": list(plan.get("notes", [])),
        "missing_requirements": list(plan.get("missing_requirements", [])),
        "template_id": plan.get("template_id"),
        "template_name": plan.get("template_name"),
        "template_video_path": plan.get("template_video_path"),
        "reference_videos": list(plan.get("reference_videos", [])),
        "model_version": plan.get("model_version"),
        "duration": plan.get("duration"),
        "ratio": plan.get("ratio"),
        "video_resolution": plan.get("video_resolution"),
        "poll_timeout_seconds": plan.get("poll_timeout_seconds"),
        "device_reference_images": list(plan.get("device_reference_images", [])),
        "hair_color_reference_dir": plan.get("hair_color_reference_dir"),
        "hair_color_reference_image": plan.get("hair_color_reference_image"),
        "hair_color_name": plan.get("hair_color_name"),
        "hair_color_random": plan.get("hair_color_random"),
        "reference_images": list(plan.get("reference_images", [])),
        "downloads_dir": plan.get("downloads_dir"),
        "video_output_dir": plan.get("video_output_dir") or plan.get("downloads_dir"),
        "prompt_path": plan.get("prompt_path"),
        "douyin_note_template_path": plan.get("douyin_note_template_path"),
        "douyin_note_text": plan.get("douyin_note_text"),
        "douyin_note_path": plan.get("douyin_note_path"),
        "xiaohongshu_body_template_path": plan.get("xiaohongshu_body_template_path"),
        "xiaohongshu_body": plan.get("xiaohongshu_body"),
        "xiaohongshu_body_path": plan.get("xiaohongshu_body_path"),
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
            "download_paths": [],
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
            "stderr_tail": "; ".join(base["missing_requirements"]),
            "download_paths": [],
        }

    argv = plan.get("argv")
    cwd = plan.get("cwd")
    downloads_dir = str(plan.get("downloads_dir") or "").strip()
    query_argv = list(plan.get("query_argv") or [])
    if not argv or not cwd or not downloads_dir or not query_argv:
        return {
            **base,
            "mode": "execute",
            "status": "skipped_invalid_plan",
            "started_at": None,
            "finished_at": None,
            "returncode": None,
            "stdout_tail": "",
            "stderr_tail": "",
            "download_paths": [],
        }

    started_at = _now_iso()
    started_timestamp = time.time()
    try:
        Path(downloads_dir).mkdir(parents=True, exist_ok=True)
        submit, submit_stdout, submit_stderr = _run_process(argv, cwd=cwd)
    except FileNotFoundError as exc:
        return {
            **base,
            "mode": "execute",
            "status": "failed_missing_binary",
            "started_at": started_at,
            "finished_at": _now_iso(),
            "returncode": None,
            "stdout_tail": "",
            "stderr_tail": str(exc),
            "download_paths": [],
        }

    submit_payload = _load_json_text(submit_stdout)
    submit_id = None
    if submit_payload:
        submit_id = submit_payload.get("data", {}).get("submit_id") or submit_payload.get("submit_id")

    if submit.returncode != 0 or not submit_id:
        return {
            **base,
            "mode": "execute",
            "status": "failed_submit",
            "started_at": started_at,
            "finished_at": _now_iso(),
            "returncode": submit.returncode,
            "stdout_tail": _tail(submit_stdout, limit=4000),
            "stderr_tail": _tail(submit_stderr, limit=4000),
            "download_paths": [],
        }

    stdout_parts = [submit_stdout]
    stderr_parts = [submit_stderr]
    submit_failure = _find_dreamina_submit_failure(str(submit_id), started_timestamp)
    if submit_failure:
        stderr_parts.append(submit_failure)
        return {
            **base,
            "mode": "execute",
            "status": "failed_submit_remote",
            "started_at": started_at,
            "finished_at": _now_iso(),
            "returncode": 1,
            "submit_id": submit_id,
            "download_paths": [],
            "stdout_tail": _tail("".join(part for part in stdout_parts if part), limit=4000),
            "stderr_tail": _tail("".join(part for part in stderr_parts if part), limit=4000),
        }

    poll_attempts = int(plan.get("poll_attempts", 12))
    poll_interval_seconds = int(plan.get("poll_interval_seconds", 15))
    configured_timeout_seconds = int(plan.get("poll_timeout_seconds", 0) or 0)
    max_wait_seconds = max(configured_timeout_seconds, poll_attempts * poll_interval_seconds, 1800)
    download_paths: list[str] = []
    final_status = "submitted_waiting"
    attempts_used = 0

    while True:
        attempts_used += 1
        query_cmd = list(query_argv) + ["--submit_id", str(submit_id)]
        query, query_stdout, query_stderr = _run_process(query_cmd, cwd=cwd)
        stdout_parts.append(query_stdout)
        stderr_parts.append(query_stderr)
        query_submit_failure = _find_dreamina_submit_failure(str(submit_id), started_timestamp)
        if query_submit_failure:
            final_status = "failed_submit_remote"
            stderr_parts.append(query_submit_failure)
            break
        no_history_count = _count_dreamina_no_history(str(submit_id), started_timestamp)
        if no_history_count >= 2:
            final_status = "failed_not_found"
            stderr_parts.append(
                f"Dreamina CLI reported 'no history found' {no_history_count} times for submit_id {submit_id}."
            )
            break
        payload = _load_json_text(query_stdout) or {}
        data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
        gen_status = data.get("gen_status")
        if gen_status == "success":
            result_json = _coerce_json_value(data.get("result_json", {})) if isinstance(data, dict) else {}
            download_paths = _download_result_videos(result_json, str(submit_id), downloads_dir)
            if not download_paths:
                download_paths = _collect_existing_media_paths(data, {".mp4", ".mov", ".webm", ".m4v"})
            if not download_paths:
                download_paths = _find_downloaded_media_files(
                    str(submit_id),
                    downloads_dir,
                    {".mp4", ".mov", ".webm", ".m4v"},
                    started_timestamp=started_timestamp,
                )
            final_status = "succeeded" if download_paths else "failed_download"
            if final_status == "failed_download":
                stderr_parts.append("Video task succeeded remotely but no video was downloaded.")
            break
        if gen_status == "fail":
            final_status = "failed_generation"
            break
        if query.returncode != 0:
            final_status = "failed_query"
            break
        elapsed_seconds = max(0, int(time.time() - started_timestamp))
        if elapsed_seconds >= max_wait_seconds:
            final_status = "failed_timeout"
            stderr_parts.append(
                f"Video task was still querying after waiting {elapsed_seconds} seconds for completion."
            )
            break
        time.sleep(poll_interval_seconds)

    return {
        **base,
        "mode": "execute",
        "status": final_status,
        "started_at": started_at,
        "finished_at": _now_iso(),
        "returncode": 0 if final_status == "succeeded" else 1,
        "submit_id": submit_id,
        "poll_attempts": poll_attempts,
        "poll_interval_seconds": poll_interval_seconds,
        "poll_timeout_seconds": max_wait_seconds,
        "attempts_used": attempts_used,
        "download_paths": download_paths,
        "stdout_tail": _tail("".join(part for part in stdout_parts if part), limit=4000),
        "stderr_tail": _tail("".join(part for part in stderr_parts if part), limit=4000),
    }


def execute_multi_account_plan(plan: dict[str, Any], *, execute: bool) -> dict[str, Any]:
    base = {
        "adapter": plan.get("adapter"),
        "platform": plan.get("platform"),
        "publish_type": plan.get("publish_type", "image"),
        "ready": plan.get("ready", False),
        "cwd": plan.get("cwd"),
        "planned_command": plan.get("planned_command"),
        "notes": list(plan.get("notes", [])),
        "images": list(plan.get("images", [])),
        "file": plan.get("file"),
        "video_path": plan.get("video_path"),
        "title": plan.get("title"),
        "desc": plan.get("desc"),
        "tags": plan.get("tags"),
        "template_name": plan.get("template_name"),
        "hair_color_name": plan.get("hair_color_name"),
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
    publish_file = str(plan.get("file") or plan.get("video_path") or "").strip()
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
        "published_file": publish_file,
        "account_results": account_results,
    }


def execute_named_plan(name: str, plan: dict[str, Any], *, execute: bool) -> dict[str, Any]:
    if name == "image":
        return execute_image_plan(plan, execute=execute)
    if name == "video":
        return execute_video_plan(plan, execute=execute)
    if name in {"xiaohongshu", "douyin", "video_xiaohongshu", "video_douyin"}:
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
        f"- 已执行 video：{payload.get('execute_video')}",
        f"- 已执行 publish：{payload['execute_publish']}",
        f"- 已执行 video_publish：{payload.get('execute_video_publish')}",
        "",
        "## 适配器结果",
        "",
    ]
    ordered_names = (
        "image",
        "video",
        "xiaohongshu",
        "douyin",
        "video_xiaohongshu",
        "video_douyin",
    )
    for name in ordered_names:
        if name not in payload.get("results", {}):
            continue
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
        if result.get("file"):
            lines.append(f"- file：{result.get('file')}")
        if result.get("video_path"):
            lines.append(f"- video_path：{result.get('video_path')}")
        if result.get("submit_id"):
            lines.append(f"- submit_id：{result.get('submit_id')}")
        download_paths = result.get("download_paths") or []
        if download_paths:
            lines.append(f"- downloads：{', '.join(download_paths)}")
        reference_images = result.get("reference_images") or []
        if reference_images:
            lines.append(f"- reference_images：{', '.join(reference_images)}")
        reference_videos = result.get("reference_videos") or []
        if reference_videos:
            lines.append(f"- reference_videos：{', '.join(reference_videos)}")
        if result.get("template_name"):
            lines.append(f"- template：{result.get('template_name')}")
        if result.get("hair_color_name"):
            lines.append(f"- hair_color：{result.get('hair_color_name')}")
        if result.get("title"):
            lines.append(f"- title：{result.get('title')}")
        if result.get("tags"):
            lines.append(f"- tags：{result.get('tags')}")
        if result.get("douyin_note_path"):
            lines.append(f"- douyin_note_path：{result.get('douyin_note_path')}")
        if result.get("xiaohongshu_body_path"):
            lines.append(f"- xiaohongshu_body_path：{result.get('xiaohongshu_body_path')}")
        if result.get("published_file"):
            lines.append(f"- published_file：{result.get('published_file')}")
        account_results = result.get("account_results") or []
        if account_results:
            lines.append(
                "- account_results："
                + ", ".join(
                    f"{item.get('accountName') or item.get('displayName')}={item.get('status')}"
                    for item in account_results
                )
            )
        stdout_tail = result.get("stdout_tail", "")
        stderr_tail = result.get("stderr_tail", "")
        douyin_note_text = result.get("douyin_note_text", "")
        xiaohongshu_body = result.get("xiaohongshu_body", "")
        if douyin_note_text:
            lines.extend(["", "douyin_note_text:", "", "```text", douyin_note_text, "```"])
        if xiaohongshu_body:
            lines.extend(["", "xiaohongshu_body:", "", "```text", xiaohongshu_body, "```"])
        desc_text = result.get("desc", "")
        if desc_text and not douyin_note_text and not xiaohongshu_body:
            lines.extend(["", "desc:", "", "```text", desc_text, "```"])
        if stdout_tail:
            lines.extend(["", "stdout:", "", "```text", stdout_tail, "```"])
        if stderr_tail:
            lines.extend(["", "stderr:", "", "```text", stderr_tail, "```"])
        lines.append("")
    return "\n".join(lines)
