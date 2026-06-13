"""CRUD for content calendar — bundles, LinkedIn posts, YouTube videos."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from .db import _now, get_conn, row_to_dict
from .caption import hashtags_from_json, prepare_bundle_fields, publish_text

STATUSES = ("draft", "scheduled", "publishing", "published", "partial", "failed")


def create_bundle(
    video_path: str,
    caption: str = "",
    hashtags_raw: str = "",
    scheduled_at: str | None = None,
    status: str = "draft",
) -> dict[str, Any]:
    fields = prepare_bundle_fields(caption, hashtags_raw)
    now = _now()
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO content_bundles
            (video_path, base_caption, hashtags, ig_caption, tt_caption, yt_title, yt_description,
             scheduled_at, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                video_path,
                fields["base_caption"],
                fields["hashtags"],
                fields["ig_caption"],
                fields["tt_caption"],
                fields["yt_title"],
                fields["yt_description"],
                scheduled_at,
                status,
                now,
                now,
            ),
        )
        bundle_id = cur.lastrowid
    return get_bundle(bundle_id)


def get_bundle(bundle_id: int) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM content_bundles WHERE id = ?", (bundle_id,)
        ).fetchone()
    item = row_to_dict(row)
    if item:
        item["hashtags_list"] = hashtags_from_json(item.get("hashtags"))
        item["display_caption"] = publish_text(item)
    return item


def list_bundles(status: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    with get_conn() as conn:
        if status:
            rows = conn.execute(
                """
                SELECT * FROM content_bundles WHERE status = ?
                ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT ?
                """,
                (status, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM content_bundles
                ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
    return [dict(r) for r in rows]


def update_bundle(bundle_id: int, **fields) -> dict[str, Any] | None:
    allowed = {
        "video_path",
        "base_caption",
        "hashtags",
        "ig_caption",
        "tt_caption",
        "yt_title",
        "yt_description",
        "scheduled_at",
        "status",
    }
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_bundle(bundle_id)
    updates["updated_at"] = _now()
    cols = ", ".join(f"{k} = ?" for k in updates)
    vals = list(updates.values()) + [bundle_id]
    with get_conn() as conn:
        conn.execute(f"UPDATE content_bundles SET {cols} WHERE id = ?", vals)
    return get_bundle(bundle_id)


def create_linkedin_post(
    body: str,
    image_path: str | None = None,
    scheduled_at: str | None = None,
    recurring: bool = False,
    status: str = "draft",
) -> dict[str, Any]:
    now = _now()
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO linkedin_posts
            (body, image_path, scheduled_at, status, recurring, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (body, image_path, scheduled_at, status, int(recurring), now, now),
        )
        post_id = cur.lastrowid
    return get_linkedin_post(post_id)


def get_linkedin_post(post_id: int) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM linkedin_posts WHERE id = ?", (post_id,)
        ).fetchone()
    return row_to_dict(row)


def list_linkedin_posts(limit: int = 50) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT * FROM linkedin_posts
            ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def update_linkedin_post(post_id: int, **fields) -> dict[str, Any] | None:
    allowed = {"body", "image_path", "scheduled_at", "status", "post_url", "recurring"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if "recurring" in updates:
        updates["recurring"] = int(bool(updates["recurring"]))
    if not updates:
        return get_linkedin_post(post_id)
    updates["updated_at"] = _now()
    cols = ", ".join(f"{k} = ?" for k in updates)
    vals = list(updates.values()) + [post_id]
    with get_conn() as conn:
        conn.execute(f"UPDATE linkedin_posts SET {cols} WHERE id = ?", vals)
    return get_linkedin_post(post_id)


def create_youtube_video(
    video_path: str,
    title: str,
    description: str = "",
    tags: list[str] | None = None,
    thumbnail_path: str | None = None,
    scheduled_at: str | None = None,
    is_short: bool = False,
    bundle_id: int | None = None,
    status: str = "draft",
) -> dict[str, Any]:
    now = _now()
    tags_json = json.dumps(tags or [])
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO youtube_videos
            (video_path, title, description, tags, thumbnail_path, scheduled_at,
             status, is_short, bundle_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                video_path,
                title,
                description,
                tags_json,
                thumbnail_path,
                scheduled_at,
                status,
                int(is_short),
                bundle_id,
                now,
                now,
            ),
        )
        vid_id = cur.lastrowid
    return get_youtube_video(vid_id)


def get_youtube_video(video_id: int) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM youtube_videos WHERE id = ?", (video_id,)
        ).fetchone()
    item = row_to_dict(row)
    if item and item.get("tags"):
        try:
            item["tags_list"] = json.loads(item["tags"])
        except (json.JSONDecodeError, TypeError):
            item["tags_list"] = []
    return item


def list_youtube_videos(short_only: bool | None = None, limit: int = 50) -> list[dict[str, Any]]:
    with get_conn() as conn:
        if short_only is True:
            rows = conn.execute(
                """
                SELECT * FROM youtube_videos WHERE is_short = 1
                ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        elif short_only is False:
            rows = conn.execute(
                """
                SELECT * FROM youtube_videos WHERE is_short = 0
                ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM youtube_videos
                ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
    out = []
    for r in rows:
        item = dict(r)
        try:
            item["tags_list"] = json.loads(item.get("tags") or "[]")
        except (json.JSONDecodeError, TypeError):
            item["tags_list"] = []
        out.append(item)
    return out


def update_youtube_video(video_id: int, **fields) -> dict[str, Any] | None:
    allowed = {
        "video_path",
        "title",
        "description",
        "tags",
        "thumbnail_path",
        "scheduled_at",
        "status",
        "post_url",
        "is_short",
        "bundle_id",
    }
    updates = {k: v for k, v in fields.items() if k in allowed}
    if "tags" in updates and isinstance(updates["tags"], list):
        updates["tags"] = json.dumps(updates["tags"])
    if "is_short" in updates:
        updates["is_short"] = int(bool(updates["is_short"]))
    if not updates:
        return get_youtube_video(video_id)
    updates["updated_at"] = _now()
    cols = ", ".join(f"{k} = ?" for k in updates)
    vals = list(updates.values()) + [video_id]
    with get_conn() as conn:
        conn.execute(f"UPDATE youtube_videos SET {cols} WHERE id = ?", vals)
    return get_youtube_video(video_id)


def save_publish_result(
    platform: str,
    status: str,
    post_type: str,
    post_id: int | None = None,
    bundle_id: int | None = None,
    post_url: str | None = None,
    error: str | None = None,
) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO publish_results
            (bundle_id, post_type, post_id, platform, status, post_url, error, published_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                bundle_id,
                post_type,
                post_id,
                platform,
                status,
                post_url,
                error,
                _now() if status == "published" else None,
            ),
        )


def publish_results_for_bundle(bundle_id: int) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT * FROM publish_results WHERE bundle_id = ?
            ORDER BY id DESC
            """,
            (bundle_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def publish_results_for_post(post_type: str, post_id: int) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT * FROM publish_results WHERE post_type = ? AND post_id = ?
            ORDER BY id DESC
            """,
            (post_type, post_id),
        ).fetchall()
    return [dict(r) for r in rows]


def due_items(now: datetime | None = None) -> dict[str, list[dict[str, Any]]]:
    now = now or datetime.now()
    cutoff = now.isoformat(timespec="seconds")
    with get_conn() as conn:
        bundles = conn.execute(
            """
            SELECT * FROM content_bundles
            WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ?
            ORDER BY scheduled_at
            """,
            (cutoff,),
        ).fetchall()
        linkedin = conn.execute(
            """
            SELECT * FROM linkedin_posts
            WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ?
            ORDER BY scheduled_at
            """,
            (cutoff,),
        ).fetchall()
        youtube = conn.execute(
            """
            SELECT * FROM youtube_videos
            WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ?
            ORDER BY scheduled_at
            """,
            (cutoff,),
        ).fetchall()
    return {
        "bundles": [dict(r) for r in bundles],
        "linkedin": [dict(r) for r in linkedin],
        "youtube": [dict(r) for r in youtube],
    }


def today_items(day: date | None = None) -> dict[str, list[dict[str, Any]]]:
    day = day or date.today()
    day_str = day.isoformat()
    next_day = (day + timedelta(days=1)).isoformat()
    with get_conn() as conn:
        bundles = conn.execute(
            """
            SELECT * FROM content_bundles
            WHERE scheduled_at >= ? AND scheduled_at < ?
            ORDER BY scheduled_at
            """,
            (day_str, next_day),
        ).fetchall()
        linkedin = conn.execute(
            """
            SELECT * FROM linkedin_posts
            WHERE scheduled_at >= ? AND scheduled_at < ?
            ORDER BY scheduled_at
            """,
            (day_str, next_day),
        ).fetchall()
        youtube = conn.execute(
            """
            SELECT * FROM youtube_videos
            WHERE scheduled_at >= ? AND scheduled_at < ?
            ORDER BY scheduled_at
            """,
            (day_str, next_day),
        ).fetchall()
    return {
        "bundles": [dict(r) for r in bundles],
        "linkedin": [dict(r) for r in linkedin],
        "youtube": [dict(r) for r in youtube],
    }


def week_items(start: date | None = None) -> list[dict[str, Any]]:
    start = start or date.today()
    end = start + timedelta(days=7)
    items: list[dict[str, Any]] = []
    with get_conn() as conn:
        for row in conn.execute(
            """
            SELECT id, 'bundle' AS kind, scheduled_at, status, base_caption AS label
            FROM content_bundles
            WHERE scheduled_at >= ? AND scheduled_at < ?
            """,
            (start.isoformat(), end.isoformat()),
        ):
            items.append(dict(row))
        for row in conn.execute(
            """
            SELECT id, 'linkedin' AS kind, scheduled_at, status,
                   substr(body, 1, 60) AS label
            FROM linkedin_posts
            WHERE scheduled_at >= ? AND scheduled_at < ?
            """,
            (start.isoformat(), end.isoformat()),
        ):
            items.append(dict(row))
        for row in conn.execute(
            """
            SELECT id, 'youtube' AS kind, scheduled_at, status, title AS label
            FROM youtube_videos
            WHERE scheduled_at >= ? AND scheduled_at < ?
            """,
            (start.isoformat(), end.isoformat()),
        ):
            items.append(dict(row))
    items.sort(key=lambda x: x.get("scheduled_at") or "")
    return items


def library_items() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for b in list_bundles(limit=100):
        b["kind"] = "bundle"
        items.append(b)
    for p in list_linkedin_posts(limit=100):
        if p.get("status") == "draft":
            p["kind"] = "linkedin"
            items.append(p)
    for v in list_youtube_videos(limit=100):
        if v.get("status") == "draft":
            v["kind"] = "youtube"
            items.append(v)
    items.sort(key=lambda x: x.get("updated_at") or x.get("created_at") or "", reverse=True)
    return items


def log_scheduler(job_type: str, ref_id: int | None, message: str) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO scheduler_log (job_type, ref_id, message, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (job_type, ref_id, message, _now()),
        )
