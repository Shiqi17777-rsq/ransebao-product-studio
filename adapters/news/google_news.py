from __future__ import annotations

import hashlib
import html
import re
import xml.etree.ElementTree as ET
from datetime import datetime
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


def fetch_xml(url: str, user_agent: str) -> bytes:
    req = Request(url, headers={"User-Agent": user_agent})
    with urlopen(req, timeout=30) as resp:
        return resp.read()


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


def fetch_sources(config: dict, days: int | None = None, limit: int | None = None) -> list[dict]:
    defaults = config["fetch_defaults"]
    lookback_days = days or int(defaults["days"])
    per_source_limit = limit or int(defaults["per_source_limit"])
    user_agent = defaults["user_agent"]

    all_rows: list[dict] = []
    for source in config["sources"]:
        if source["kind"] != "google_news_search":
            continue
        url = build_google_news_url(source["query"], lookback_days)
        payload = fetch_xml(url, user_agent=user_agent)
        rows = parse_rss(payload, source["id"], source["query"], url)[:per_source_limit]
        all_rows.extend(rows)
    return all_rows
