from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import Any

from .paths import DB_PATH, ensure_dirs

SCHEMA = """
CREATE TABLE IF NOT EXISTS platform_accounts (
    platform TEXT PRIMARY KEY,
    account_name TEXT,
    token_json TEXT,
    connected_at TEXT,
    expires_at TEXT
);

CREATE TABLE IF NOT EXISTS content_bundles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_path TEXT NOT NULL,
    base_caption TEXT,
    hashtags TEXT,
    ig_caption TEXT,
    tt_caption TEXT,
    yt_title TEXT,
    yt_description TEXT,
    scheduled_at TEXT,
    status TEXT DEFAULT 'draft',
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS publish_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bundle_id INTEGER,
    post_type TEXT NOT NULL,
    post_id INTEGER,
    platform TEXT NOT NULL,
    status TEXT NOT NULL,
    post_url TEXT,
    error TEXT,
    published_at TEXT,
    FOREIGN KEY (bundle_id) REFERENCES content_bundles(id)
);

CREATE TABLE IF NOT EXISTS linkedin_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    body TEXT NOT NULL,
    image_path TEXT,
    scheduled_at TEXT,
    status TEXT DEFAULT 'draft',
    post_url TEXT,
    recurring INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS youtube_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_path TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    tags TEXT,
    thumbnail_path TEXT,
    scheduled_at TEXT,
    status TEXT DEFAULT 'draft',
    post_url TEXT,
    is_short INTEGER DEFAULT 0,
    bundle_id INTEGER,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (bundle_id) REFERENCES content_bundles(id)
);

CREATE TABLE IF NOT EXISTS scheduler_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type TEXT,
    ref_id INTEGER,
    message TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS workflows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    publish_mode TEXT DEFAULT 'schedule',
    destinations TEXT,
    schedule_slots TEXT,
    max_per_day INTEGER DEFAULT 1,
    last_run_day TEXT,
    runs_today INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS publish_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id INTEGER NOT NULL,
    bundle_id INTEGER,
    linkedin_id INTEGER,
    youtube_id INTEGER,
    status TEXT DEFAULT 'queued',
    queued_at TEXT,
    published_at TEXT,
    error TEXT,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id),
    FOREIGN KEY (bundle_id) REFERENCES content_bundles(id)
);
"""


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


@contextmanager
def get_conn():
    ensure_dirs()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    ensure_dirs()
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        cols = {r[1] for r in conn.execute("PRAGMA table_info(content_bundles)")}
        if "hashtags" not in cols:
            conn.execute("ALTER TABLE content_bundles ADD COLUMN hashtags TEXT")
    from . import workflows as wf_mod

    wf_mod.ensure_defaults()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)
