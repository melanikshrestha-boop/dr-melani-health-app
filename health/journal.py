"""Daily journal notes — mood check-ins and free text."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta

from .db import get_conn, today
from .paths import HEALTH_DATA

JOURNAL_DIR = HEALTH_DATA / "journal"

MOODS = [
    {"value": 1, "emoji": "😞", "label": "Rough"},
    {"value": 2, "emoji": "😕", "label": "Low"},
    {"value": 3, "emoji": "😐", "label": "Okay"},
    {"value": 4, "emoji": "🙂", "label": "Good"},
    {"value": 5, "emoji": "😊", "label": "Great"},
]


def mood_meta(value: int | None) -> dict | None:
    if value is None:
        return None
    for m in MOODS:
        if m["value"] == value:
            return m
    return None


def _format_day_heading(day_iso: str, today_iso: str | None = None) -> str:
    today_iso = today_iso or today()
    if day_iso == today_iso:
        return "Today"
    d = date.fromisoformat(day_iso)
    return d.strftime("%b %d").replace(" 0", " ")


def _format_time(logged_at: str | None) -> str:
    if not logged_at:
        return ""
    try:
        dt = datetime.fromisoformat(logged_at.replace("Z", "+00:00"))
    except ValueError:
        return ""
    t = dt.strftime("%I:%M %p")
    return t.lstrip("0") if t.startswith("0") else t


def _entry_from_row(row) -> dict:
    mood = row["severity"]
    meta = mood_meta(mood)
    tags = [t for t in (row["location"] or "").split(",") if t and t not in {m["label"].lower() for m in MOODS}]
    return {
        "id": row["id"],
        "day": row["day"],
        "text": row["notes"] or "",
        "tags": tags,
        "mood": mood,
        "mood_emoji": meta["emoji"] if meta else "",
        "mood_label": meta["label"] if meta else "",
        "logged_at": row["logged_at"],
        "time_display": _format_time(row["logged_at"]),
    }


def log_note(
    text: str,
    day: str | None = None,
    *,
    mood: int | None = None,
    tags: list[str] | None = None,
) -> dict:
    text = (text or "").strip()
    if not text:
        return {"error": "empty"}
    day = day or today()
    mood_val = None
    if mood is not None:
        mood_val = max(1, min(5, int(mood)))
    tag_str = ",".join(tags or [])
    logged_at = datetime.now().isoformat()
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO symptoms (day, type, severity, location, notes, logged_at)
               VALUES (?, 'daily_note', ?, ?, ?, ?)""",
            (day, mood_val, tag_str[:120], text[:2000], logged_at),
        )
        row_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
    entry = {
        "id": row_id,
        "day": day,
        "text": text,
        "tags": tags or [],
        "mood": mood_val,
        "logged_at": logged_at,
    }
    meta = mood_meta(mood_val)
    if meta:
        entry["mood_emoji"] = meta["emoji"]
        entry["mood_label"] = meta["label"]
    entry["time_display"] = _format_time(logged_at)
    _sync_day(day, entry)
    return entry


def notes_for_day(day: str | None = None) -> list[dict]:
    day = day or today()
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT id, day, notes, location, severity, logged_at FROM symptoms
               WHERE type = 'daily_note' AND day = ?
               ORDER BY logged_at ASC""",
            (day,),
        ).fetchall()
    return [_entry_from_row(r) for r in rows]


def get_notes(day: str | None = None, limit: int = 20) -> list[dict]:
    day = day or today()
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT id, day, notes, location, severity, logged_at FROM symptoms
               WHERE type = 'daily_note' AND day = ?
               ORDER BY logged_at DESC LIMIT ?""",
            (day, limit),
        ).fetchall()
    return [_entry_from_row(r) for r in rows]


def past_notes(exclude_day: str | None = None, limit: int = 60) -> list[dict]:
    """Older days grouped newest-first (excludes the day you're editing)."""
    with get_conn() as conn:
        if exclude_day:
            rows = conn.execute(
                """SELECT id, day, notes, location, severity, logged_at FROM symptoms
                   WHERE type = 'daily_note' AND day != ?
                   ORDER BY day DESC, logged_at DESC LIMIT ?""",
                (exclude_day, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT id, day, notes, location, severity, logged_at FROM symptoms
                   WHERE type = 'daily_note'
                   ORDER BY day DESC, logged_at DESC LIMIT ?""",
                (limit,),
            ).fetchall()

    grouped: dict[str, list[dict]] = {}
    order: list[str] = []
    for row in rows:
        d = row["day"]
        if d not in grouped:
            grouped[d] = []
            order.append(d)
        grouped[d].append(_entry_from_row(row))

    today_iso = today()
    out = []
    for d in order:
        entries = sorted(grouped[d], key=lambda e: e["logged_at"])
        out.append({
            "day": d,
            "heading": _format_day_heading(d, today_iso),
            "entries": entries,
        })
    return out


def recent_notes(days: int = 7, limit: int = 15) -> list[dict]:
    end = datetime.strptime(today(), "%Y-%m-%d").date()
    start = (end - timedelta(days=days - 1)).isoformat()
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT id, day, notes, location, severity, logged_at FROM symptoms
               WHERE type = 'daily_note' AND day >= ?
               ORDER BY day DESC, logged_at DESC LIMIT ?""",
            (start, limit),
        ).fetchall()
    return [_entry_from_row(r) for r in rows]


def day_heading_pretty(day_iso: str) -> str:
    d = date.fromisoformat(day_iso)
    return d.strftime("%B %d").replace(" 0", " ")


def mood_log_by_day(limit: int = 30) -> list[dict]:
    """All mood notes grouped by day, newest first."""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT id, day, notes, location, severity, logged_at FROM symptoms
               WHERE type = 'daily_note'
               ORDER BY day DESC, logged_at ASC""",
        ).fetchall()

    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row["day"], []).append(_entry_from_row(row))

    order = sorted(grouped.keys(), reverse=True)[:limit]
    return [
        {"day": d, "heading": day_heading_pretty(d), "entries": grouped[d]}
        for d in order
    ]


def page_context(day: str | None = None) -> dict:
    selected = (day or today()).strip()
    try:
        date.fromisoformat(selected)
    except ValueError:
        selected = today()
    today_iso = today()
    entries = notes_for_day(selected)
    return {
        "selected_day": selected,
        "today_iso": today_iso,
        "day_heading": _format_day_heading(selected, today_iso),
        "day_entries": entries,
        "past": past_notes(exclude_day=selected),
        "moods": MOODS,
    }


def context_block(days: int = 5) -> str:
    notes = recent_notes(days=days, limit=8)
    if not notes:
        return "=== JOURNAL (recent) ===\nNo notes logged yet."
    lines = [f"=== JOURNAL (last {days} days) ==="]
    for n in notes:
        mood = f" {n['mood_emoji']}" if n.get("mood_emoji") else ""
        tags = f" [{', '.join(n['tags'])}]" if n.get("tags") else ""
        lines.append(f"  {n['day']}{mood}: {n['text'][:120]}{tags}")
    return "\n".join(lines)


def _sync_day(day: str, entry: dict):
    JOURNAL_DIR.mkdir(parents=True, exist_ok=True)
    path = JOURNAL_DIR / f"{day}.json"
    items = []
    if path.exists():
        try:
            items = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            items = []
    items.append(entry)
    path.write_text(json.dumps(items[-30:], indent=2))
