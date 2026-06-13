"""Caption + hashtag parsing — paste any format, publish the same everywhere."""

from __future__ import annotations

import json
import re
from typing import Any

HASHTAG_RE = re.compile(r"#([\w\u0080-\uFFFF]+)", re.UNICODE)


def parse_hashtags(raw: str) -> list[str]:
    """Pull unique hashtags from pasted text (newlines, commas, spaces, all fine)."""
    if not raw or not raw.strip():
        return []
    tags: list[str] = []
    seen: set[str] = set()
    for match in HASHTAG_RE.finditer(raw):
        tag = match.group(1).strip().rstrip(".,;")
        if not tag:
            continue
        key = tag.lower()
        if key in seen:
            continue
        seen.add(key)
        tags.append(tag)
    return tags


def hashtags_to_json(tags: list[str]) -> str:
    return json.dumps(tags)


def hashtags_from_json(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(t).lstrip("#") for t in data if str(t).strip()]
    except (json.JSONDecodeError, TypeError):
        pass
    return parse_hashtags(raw)


def hashtag_line(tags: list[str]) -> str:
    if not tags:
        return ""
    return " ".join(f"#{t.lstrip('#')}" for t in tags)


def full_caption(caption: str, tags: list[str]) -> str:
    caption = (caption or "").strip()
    tags_line = hashtag_line(tags)
    if caption and tags_line:
        return f"{caption}\n\n{tags_line}"
    return caption or tags_line


def youtube_title(caption: str, tags: list[str]) -> str:
    text = (caption or "").strip()
    if not text:
        return "Short"
    first = text.splitlines()[0].strip()
    first = HASHTAG_RE.sub("", first).strip()
    if len(first) > 100:
        first = first[:97].rstrip() + "…"
    return first or "Short"


def prepare_bundle_fields(
    caption: str,
    hashtags_raw: str = "",
) -> dict[str, Any]:
    caption = (caption or "").strip()
    tags = parse_hashtags(hashtags_raw)
    if not tags:
        tags = parse_hashtags(caption)
        if tags:
            caption = HASHTAG_RE.sub("", caption)
            caption = re.sub(r"\n{3,}", "\n\n", caption).strip()
    full = full_caption(caption, tags)
    title = youtube_title(caption, tags)
    return {
        "base_caption": caption,
        "hashtags": hashtags_to_json(tags),
        "ig_caption": full,
        "tt_caption": full,
        "yt_title": title,
        "yt_description": full,
        "hashtags_list": tags,
        "full_caption": full,
    }


def publish_text(bundle: dict[str, Any]) -> str:
    caption = (bundle.get("base_caption") or "").strip()
    tags = hashtags_from_json(bundle.get("hashtags"))
    if bundle.get("ig_caption") and not tags:
        return bundle["ig_caption"]
    return full_caption(caption, tags)
