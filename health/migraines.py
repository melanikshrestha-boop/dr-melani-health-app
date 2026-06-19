from __future__ import annotations

"""Migraine logging — severity, triggers, cycle context."""

import json
from datetime import date, datetime, timedelta

from .cycle import cycle_overview
from .db import get_conn, today
from .paths import HEALTH_DATA
from .sleep import _week_start, week_key, week_range_label, week_start_from_key

MIGRAINE_DIR = HEALTH_DATA / "symptoms"

TRIGGER_OPTIONS = [
    ("skipped_meal", "Skipped meal"),
    ("dehydration", "Dehydration"),
    ("poor_sleep", "Poor sleep"),
    ("stress", "Stress"),
    ("cycle", "Cycle / hormones"),
    ("food", "Food trigger"),
    ("screen", "Screen / light"),
    ("weather", "Weather"),
    ("other", "Other"),
]


def _cycle_day_for(day: str) -> int | None:
    try:
        return cycle_overview(day).get("cycle_day")
    except (ValueError, TypeError):
        return None


def log_migraine(
    severity: int,
    *,
    day: str | None = None,
    triggers: list[str] | None = None,
    relief: str = "",
    notes: str = "",
) -> dict:
    """severity 0 = none today, 1-10 = headache intensity."""
    day = day or today()
    severity = max(0, min(10, int(severity)))
    clean_triggers = [t for t in (triggers or []) if t in {x[0] for x in TRIGGER_OPTIONS}]
    cycle_day = _cycle_day_for(day)
    payload = json.dumps(clean_triggers)
    with get_conn() as conn:
        conn.execute("DELETE FROM migraine_logs WHERE day = ?", (day,))
        conn.execute(
            """INSERT INTO migraine_logs
               (day, severity, triggers, relief, cycle_day, notes, logged_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                day,
                severity,
                payload,
                (relief or "").strip()[:200],
                cycle_day,
                (notes or "").strip()[:500],
                datetime.now().isoformat(),
            ),
        )
    entry = get_migraine(day)
    _sync(day, entry)
    return entry


def get_migraine(day: str | None = None) -> dict | None:
    day = day or today()
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM migraine_logs WHERE day = ?", (day,)).fetchone()
    if not row:
        return None
    triggers_raw = row["triggers"] or "[]"
    try:
        triggers = json.loads(triggers_raw)
    except (json.JSONDecodeError, TypeError):
        triggers = []
    return {
        "day": row["day"],
        "severity": row["severity"],
        "had_migraine": row["severity"] > 0,
        "triggers": triggers,
        "relief": row["relief"] or "",
        "cycle_day": row["cycle_day"],
        "notes": row["notes"] or "",
        "logged_at": row["logged_at"],
    }


def week_migraine_data(week: str | None = None) -> dict:
    if week:
        start = week_start_from_key(week)
        wk = week_key(start)
    else:
        start = _week_start(date.today())
        wk = week_key(start)

    days = []
    migraine_days = 0
    for i in range(7):
        d = start + timedelta(days=i)
        iso = d.isoformat()
        entry = get_migraine(iso)
        sev = entry["severity"] if entry else None
        if sev and sev > 0:
            migraine_days += 1
        days.append(
            {
                "day": iso,
                "label": d.strftime("%a"),
                "severity": sev,
                "had_migraine": bool(sev and sev > 0),
            }
        )

    return {
        "week": wk,
        "week_label": week_range_label(start),
        "days": days,
        "migraine_days": migraine_days,
        "logged_count": sum(1 for x in days if x["severity"] is not None),
    }


def recent_migraines(days: int = 14) -> list[dict]:
    end = date.fromisoformat(today())
    out = []
    for i in range(days):
        d = (end - timedelta(days=i)).isoformat()
        entry = get_migraine(d)
        if entry and entry["severity"] > 0:
            out.append(entry)
    return out


def context_block() -> str:
    today_entry = get_migraine()
    week = week_migraine_data()
    lines = ["=== MIGRAINES ==="]
    if today_entry:
        if today_entry["severity"] > 0:
            trig = ", ".join(today_entry["triggers"]) or "none logged"
            lines.append(
                f"Today: severity {today_entry['severity']}/10 · triggers: {trig}"
            )
            if today_entry.get("cycle_day"):
                lines.append(f"Cycle day {today_entry['cycle_day']}")
            if today_entry.get("relief"):
                lines.append(f"Relief: {today_entry['relief'][:120]}")
        else:
            lines.append("Today: no migraine logged")
    else:
        lines.append("Today: not logged yet")
    lines.append(f"This week: {week['migraine_days']} migraine day(s)")
    recent = recent_migraines(7)
    if recent:
        for e in recent[:5]:
            trig = ", ".join(e.get("triggers") or []) or "?"
            lines.append(f"  {e['day']}: {e['severity']}/10 ({trig})")
    return "\n".join(lines)


def _sync(day: str, entry: dict | None):
    MIGRAINE_DIR.mkdir(parents=True, exist_ok=True)
    path = MIGRAINE_DIR / f"migraine_{day}.json"
    if entry:
        path.write_text(json.dumps(entry, indent=2))
    elif path.exists():
        path.unlink()
