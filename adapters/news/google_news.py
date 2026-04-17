from __future__ import annotations

import hashlib
import html
import re
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from urllib.error import URLError
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

TAG_RE = re.compile(r"<[^>]+>")


def build_google_news_url(query: str, days: int) -> str:
    q = quote_plus(f"{query} when:{days}d")
    return f"https://news.google.com/rss/search?q={q}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans"


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    value = html.unescape(value)
    value = TAG_RE.sub(" ", value)
    return re.sub(r"\s+", " ", value).strip()


def stable_id(*parts: str) -> str:
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]


def fetch_xml(url: str, user_agent: str, attempts: int = 1, timeout: int = 6) -> bytes:
    req = Request(url, headers={"User-Agent": user_agent})
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            with urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except Exception as exc:
            last_error = exc
            if attempt >= attempts:
                raise
            time.sleep(min(attempt, 3))
    if last_error:
        raise last_error
    raise URLError("Unknown Google News fetch error")


def parse_rss(payload: bytes, source_id: str, source_name: str, source_url: str) -> list[dict]:
    root = ET.fromstring(payload)
    items: list[dict] = []
    for item in root.findall(".//item"):
        raw_title = clean_text(item.findtext("title"))
        link = clean_text(item.findtext("link"))
        pub_date = clean_text(item.findtext("pubDate"))
        description = clean_text(item.findtext("description"))
        guid = clean_text(item.findtext("guid")) or link or raw_title
        title = raw_title
        publisher = ""
        if " - " in raw_title:
            title, publisher = raw_title.rsplit(" - ", 1)
        record = {
            "id": stable_id(source_id, guid, title),
            "source_id": source_id,
            "source_name": publisher or source_name,
            "source_query": source_name,
            "source_url": source_url,
            "title": title,
            "link": link,
            "published_at": pub_date,
            "summary": description,
            "captured_at": datetime.now().isoformat(timespec="seconds"),
            "kind": "rss",
        }
        if record["title"]:
            items.append(record)
    return items


def source_display_name(source: dict) -> str:
    return str(source.get("name") or source.get("query") or source.get("id") or "").strip()


def resolve_source_url(source: dict, lookback_days: int) -> str:
    kind = str(source.get("kind") or "").strip()
    if kind == "google_news_search":
        return build_google_news_url(source["query"], lookback_days)
    if kind == "rss_url":
        return str(source.get("url") or "").strip()
    return ""


def fetch_single_source(
    source: dict,
    *,
    lookback_days: int,
    per_source_limit: int,
    user_agent: str,
    attempts: int,
    timeout: int
) -> list[dict]:
    url = resolve_source_url(source, lookback_days)
    if not url:
        return []
    source_name = source_display_name(source)
    try:
        payload = fetch_xml(url, user_agent=user_agent, attempts=attempts, timeout=timeout)
        return parse_rss(payload, source["id"], source_name, url)[:per_source_limit]
    except Exception:
        return []


def fetch_sources(config: dict, days: int | None = None, limit: int | None = None) -> list[dict]:
    defaults = config["fetch_defaults"]
    lookback_days = days or int(defaults["days"])
    per_source_limit = limit or int(defaults["per_source_limit"])
    user_agent = defaults["user_agent"]
    attempts = int(defaults.get("request_attempts", 1))
    timeout = int(defaults.get("request_timeout_seconds", 6))
    max_workers = max(1, min(int(defaults.get("max_parallel_sources", 8)), len(config.get("sources", [])) or 1))

    all_rows: list[dict] = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(
                fetch_single_source,
                source,
                lookback_days=lookback_days,
                per_source_limit=per_source_limit,
                user_agent=user_agent,
                attempts=attempts,
                timeout=timeout
            )
            for source in config.get("sources", [])
        ]
        for future in as_completed(futures):
            try:
                all_rows.extend(future.result())
            except Exception:
                continue
    return all_rows
