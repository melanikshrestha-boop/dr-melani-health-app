"""Repurpose.io-style workflows — upload once, auto-publish everywhere on your schedule."""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

from .db import _now, get_conn, row_to_dict

DAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
DAY_MAP = {0: "mon", 1: "tue", 2: "wed", 3: "thu", 4: "fri", 5: "sat", 6: "sun"}

DEFAULT_WORKFLOWS = [
    {
        "slug": "short-repurpose",
        "name": "Short video → IG + TikTok + YouTube Shorts",
        "kind": "short_bundle",
        "publish_mode": "schedule",
        "destinations": ["instagram", "tiktok", "youtube"],
        "schedule_slots": [
            {"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "time": "11:00"},
            {"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "time": "18:00"},
        ],
        "max_per_day": 2,
    },
    {
        "slug": "linkedin-daily",
        "name": "LinkedIn daily text (you write it)",
        "kind": "linkedin",
        "publish_mode": "schedule",
        "destinations": ["linkedin"],
        "schedule_slots": [{"days": DAY_KEYS, "time": "09:00"}],
        "max_per_day": 1,
    },
    {
        "slug": "youtube-weekly",
        "name": "YouTube long-form weekly",
        "kind": "youtube_long",
        "publish_mode": "schedule",
        "destinations": ["youtube"],
        "schedule_slots": [{"days": ["sun"], "time": "10:00"}],
        "max_per_day": 1,
    },
]


def ensure_defaults() -> None:
    now = _now()
    with get_conn() as conn:
        for wf in DEFAULT_WORKFLOWS:
            exists = conn.execute(
                "SELECT 1 FROM workflows WHERE slug = ?", (wf["slug"],)
            ).fetchone()
            if exists:
                continue
            conn.execute(
                """
                INSERT INTO workflows
                (slug, name, kind, enabled, publish_mode, destinations, schedule_slots,
                 max_per_day, runs_today, created_at, updated_at)
                VALUES (?, ?, ?, 1, ?, ?, ?, ?, 0, ?, ?)
                """,
                (
                    wf["slug"],
                    wf["name"],
                    wf["kind"],
                    wf["publish_mode"],
                    json.dumps(wf["destinations"]),
                    json.dumps(wf["schedule_slots"]),
                    wf["max_per_day"],
                    now,
                    now,
                ),
            )


def list_workflows() -> list[dict[str, Any]]:
    ensure_defaults()
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM workflows ORDER BY id"
        ).fetchall()
    out = []
    for r in rows:
        item = dict(r)
        item["destinations_list"] = json.loads(item.get("destinations") or "[]")
        item["schedule_slots_list"] = json.loads(item.get("schedule_slots") or "[]")
        item["queue_count"] = queue_count(item["id"])
        out.append(item)
    return out


def get_workflow(workflow_id: int) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM workflows WHERE id = ?", (workflow_id,)
        ).fetchone()
    if not row:
        return None
    item = dict(row)
    item["destinations_list"] = json.loads(item.get("destinations") or "[]")
    item["schedule_slots_list"] = json.loads(item.get("schedule_slots") or "[]")
    return item


def get_workflow_by_slug(slug: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM workflows WHERE slug = ?", (slug,)
        ).fetchone()
    if not row:
        return None
    item = dict(row)
    item["destinations_list"] = json.loads(item.get("destinations") or "[]")
    item["schedule_slots_list"] = json.loads(item.get("schedule_slots") or "[]")
    return item


def toggle_workflow(workflow_id: int, enabled: bool) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE workflows SET enabled = ?, updated_at = ? WHERE id = ?",
            (int(enabled), _now(), workflow_id),
        )


def enqueue_bundle(bundle_id: int, workflow_slug: str = "short-repurpose") -> dict[str, Any]:
    wf = get_workflow_by_slug(workflow_slug)
    if not wf:
        raise ValueError(f"Workflow not found: {workflow_slug}")
    now = _now()
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO publish_queue (workflow_id, bundle_id, status, queued_at)
            VALUES (?, ?, 'queued', ?)
            """,
            (wf["id"], bundle_id, now),
        )
        conn.execute(
            "UPDATE content_bundles SET status = 'queued', updated_at = ? WHERE id = ?",
            (now, bundle_id),
        )
        qid = cur.lastrowid
    return {"queue_id": qid, "workflow": wf["name"]}


def queue_count(workflow_id: int) -> int:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT COUNT(*) AS c FROM publish_queue
            WHERE workflow_id = ? AND status = 'queued'
            """,
            (workflow_id,),
        ).fetchone()
    return int(row["c"]) if row else 0


def next_queued(workflow_id: int) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT * FROM publish_queue
            WHERE workflow_id = ? AND status = 'queued'
            ORDER BY id ASC LIMIT 1
            """,
            (workflow_id,),
        ).fetchone()
    return row_to_dict(row)


def mark_queue_done(queue_id: int, error: str | None = None) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE publish_queue SET status = ?, published_at = ?, error = ?
            WHERE id = ?
            """,
            ("failed" if error else "done", _now(), error, queue_id),
        )


def _reset_daily_runs_if_needed(conn, wf: dict) -> dict:
    today = date.today().isoformat()
    if wf.get("last_run_day") != today:
        conn.execute(
            """
            UPDATE workflows SET last_run_day = ?, runs_today = 0, updated_at = ?
            WHERE id = ?
            """,
            (today, _now(), wf["id"]),
        )
        wf["last_run_day"] = today
        wf["runs_today"] = 0
    return wf


def slot_matches(now: datetime, slots: list[dict], last_run_at: str | None) -> bool:
    day_key = DAY_MAP[now.weekday()]
    current = now.strftime("%H:%M")
    for slot in slots:
        days = slot.get("days") or DAY_KEYS
        time_str = slot.get("time") or "10:00"
        if day_key not in days:
            continue
        if current != time_str:
            continue
        if last_run_at and last_run_at.startswith(now.date().isoformat()):
            if last_run_at.endswith(time_str) or f"T{time_str}" in last_run_at:
                return False
        return True
    return False


def workflows_due_now(now: datetime | None = None) -> list[dict[str, Any]]:
    now = now or datetime.now()
    due = []
    for wf in list_workflows():
        if not wf.get("enabled"):
            continue
        if wf.get("publish_mode") == "asap":
            if queue_count(wf["id"]) > 0:
                due.append(wf)
            continue
        last_marker = f"{wf.get('last_run_day') or ''}T{now.strftime('%H:%M')}"
        if slot_matches(now, wf.get("schedule_slots_list") or [], last_marker):
            if int(wf.get("runs_today") or 0) < int(wf.get("max_per_day") or 1):
                if queue_count(wf["id"]) > 0 or wf["kind"] == "linkedin":
                    due.append(wf)
    return due


def record_workflow_run(workflow_id: int) -> None:
    today = date.today().isoformat()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT runs_today, last_run_day FROM workflows WHERE id = ?",
            (workflow_id,),
        ).fetchone()
        runs = 0
        if row and row["last_run_day"] == today:
            runs = int(row["runs_today"] or 0)
        conn.execute(
            """
            UPDATE workflows SET runs_today = ?, last_run_day = ?, updated_at = ?
            WHERE id = ?
            """,
            (runs + 1, today, _now(), workflow_id),
        )


def queue_summary() -> list[dict[str, Any]]:
    items = []
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT q.*, w.name AS workflow_name, b.base_caption
            FROM publish_queue q
            JOIN workflows w ON w.id = q.workflow_id
            LEFT JOIN content_bundles b ON b.id = q.bundle_id
            WHERE q.status = 'queued'
            ORDER BY q.id ASC LIMIT 20
            """
        ).fetchall()
    for r in rows:
        items.append(dict(r))
    return items
