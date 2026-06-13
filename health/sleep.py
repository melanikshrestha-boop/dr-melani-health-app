from __future__ import annotations

"""Sleep tracking — hours calc, storage, weekly analytics."""

import json
import uuid
from datetime import date, datetime, timedelta

from .db import get_conn, today
from .paths import HEALTH_DATA


def _parse_time_24h(value: str) -> tuple[int, int] | None:
    """Parse HH:MM from HTML time input or 24h string."""
    if not value or not value.strip():
        return None
    value = value.strip().upper()
    # HTML time: 23:30
    for fmt in ("%H:%M", "%I:%M %p", "%I:%M%p"):
        try:
            t = datetime.strptime(value.replace("  ", " "), fmt)
            return t.hour, t.minute
        except ValueError:
            continue
    return None


def format_time_12h(value: str) -> str:
    """Convert time input to HH:MM AM/PM for storage."""
    parsed = _parse_time_24h(value)
    if not parsed:
        return value.strip() if value else ""
    h, m = parsed
    dt = datetime(2000, 1, 1, h, m)
    return dt.strftime("%I:%M %p").lstrip("0")


def compute_sleep_hours(bedtime: str, wake_time: str) -> float:
    """Total sleep hours; handles overnight (e.g. 11:30 PM → 7:30 AM = 8.0)."""
    bt = _parse_time_24h(bedtime)
    wt = _parse_time_24h(wake_time)
    if bt is None or wt is None:
        return 0.0
    bt_min = bt[0] * 60 + bt[1]
    wt_min = wt[0] * 60 + wt[1]
    diff = wt_min - bt_min
    if diff <= 0:
        diff += 24 * 60
    return round(diff / 60.0, 1)


def save_sleep(
    bedtime: str,
    wake_time: str,
    notes: str | None = None,
    log_date: str | None = None,
) -> dict:
    log_date = log_date or today()
    notes_clean = (notes or "").strip() or None
    sleep_hours = compute_sleep_hours(bedtime, wake_time)
    bedtime_fmt = format_time_12h(bedtime) if bedtime.strip() else ""
    wake_fmt = format_time_12h(wake_time) if wake_time.strip() else ""

    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM sleep_logs WHERE date = ?", (log_date,)
        ).fetchone()
        record_id = existing["id"] if existing else str(uuid.uuid4())
        conn.execute(
            """INSERT INTO sleep_logs (id, date, bedtime, wake_time, sleep_hours, notes, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(date) DO UPDATE SET
                 bedtime=excluded.bedtime, wake_time=excluded.wake_time,
                 sleep_hours=excluded.sleep_hours, notes=excluded.notes,
                 updated_at=excluded.updated_at""",
            (
                record_id,
                log_date,
                bedtime_fmt,
                wake_fmt,
                sleep_hours,
                notes_clean,
                datetime.now().isoformat(),
            ),
        )

    payload = get_sleep(log_date)
    _sync_file(payload)
    return payload


def get_sleep(log_date: str | None = None) -> dict:
    log_date = log_date or today()
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM sleep_logs WHERE date = ?", (log_date,)).fetchone()
    if not row:
        return {
            "id": None,
            "date": log_date,
            "bedtime": "",
            "wake_time": "",
            "sleep_hours": None,
            "notes": None,
        }
    return {
        "id": row["id"],
        "date": row["date"],
        "bedtime": row["bedtime"] or "",
        "wake_time": row["wake_time"] or "",
        "sleep_hours": row["sleep_hours"],
        "notes": row["notes"],
    }


def _sync_file(payload: dict):
    path = HEALTH_DATA / "daily" / f"sleep_{payload['date']}.json"
    path.write_text(json.dumps(payload, indent=2))


WEEK_RESET_ANCHOR = date(2026, 6, 6)  # Saturday — first week of the new Sat→Fri cycle
WEEK_META_FILE = HEALTH_DATA / "week_system.json"


def _week_start(d: date) -> date:
    """Saturday that starts the week containing d (never before WEEK_RESET_ANCHOR)."""
    days_since_sat = (d.weekday() + 2) % 7
    sat = d - timedelta(days=days_since_sat)
    if sat < WEEK_RESET_ANCHOR:
        return WEEK_RESET_ANCHOR
    return sat


def week_key(d: date | None = None) -> str:
    return _week_start(d or date.today()).isoformat()


def week_start_from_key(week: str | None) -> date:
    week = (week or "").strip()
    if not week:
        return _week_start(date.today())
    if "-W" in week:
        year_s, wnum_s = week.split("-W", 1)
        iso_monday = date.fromisocalendar(int(year_s), int(wnum_s), 1)
        return _week_start(iso_monday)
    try:
        start = date.fromisoformat(week)
    except ValueError:
        return _week_start(date.today())
    if start < WEEK_RESET_ANCHOR:
        return WEEK_RESET_ANCHOR
    return start


def week_range_label(start: date) -> str:
    end = start + timedelta(days=6)
    if start.year == end.year:
        return f"Week of {start.strftime('%b %d')} – {end.strftime('%b %d, %Y')}"
    return f"Week of {start.strftime('%b %d, %Y')} – {end.strftime('%b %d, %Y')}"


def maybe_migrate_week_system() -> bool:
    """One-time switch to Sat→Fri weeks anchored on June 6, 2026."""
    HEALTH_DATA.mkdir(parents=True, exist_ok=True)
    meta = {}
    if WEEK_META_FILE.exists():
        try:
            meta = json.loads(WEEK_META_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            meta = {}
    if meta.get("version", 1) >= 2:
        return False

    cur = week_key(date.today())
    rollover_paths = (
        HEALTH_DATA / "symptoms" / "rollover_state.json",
        HEALTH_DATA / "symptoms" / "bowel_rollover_state.json",
        HEALTH_DATA / "nutrition" / "meal_before_7pm" / "rollover_state.json",
    )
    for path in rollover_paths:
        state = {}
        if path.exists():
            try:
                state = json.loads(path.read_text())
            except (json.JSONDecodeError, OSError):
                state = {}
        state["last_rollover_week"] = cur
        state.pop("pending_verdict", None)
        state.pop("pending_summary", None)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(state, indent=2))

    cardio_path = HEALTH_DATA / "workouts" / "cardio_day.json"
    if cardio_path.exists():
        try:
            cardio = json.loads(cardio_path.read_text())
            remapped = {}
            for old_key, day in cardio.items():
                if "-W" in old_key:
                    remapped[cur] = day
                else:
                    remapped[old_key] = day
            cardio_path.write_text(json.dumps(remapped, indent=2))
        except (json.JSONDecodeError, OSError):
            pass

    WEEK_META_FILE.write_text(
        json.dumps(
            {
                "version": 2,
                "starts_on": "saturday",
                "anchor": WEEK_RESET_ANCHOR.isoformat(),
                "migrated_at": datetime.now().isoformat(),
            },
            indent=2,
        )
    )
    return True


def list_weeks(limit: int = 12) -> list[dict]:
    """Weeks with sleep data + recent empty weeks for selector (Sat→Fri)."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT date, sleep_hours FROM sleep_logs ORDER BY date DESC"
        ).fetchall()

    seen = {}
    for r in rows:
        d = date.fromisoformat(r["date"])
        start = _week_start(d)
        if start < WEEK_RESET_ANCHOR:
            continue
        wk = week_key(start)
        if wk not in seen:
            seen[wk] = {"key": wk, "label": week_range_label(start)}

    cur_start = _week_start(date.today())
    cur = week_key(cur_start)
    if cur not in seen:
        seen[cur] = {"key": cur, "label": f"{week_range_label(cur_start)} (current)"}

    weeks = sorted(seen.values(), key=lambda x: x["key"], reverse=True)
    return weeks[:limit]


def time_input_value(stored: str) -> str:
    """Convert stored time to HH:MM for HTML time input."""
    parsed = _parse_time_24h(stored)
    if not parsed:
        return ""
    return f"{parsed[0]:02d}:{parsed[1]:02d}"


def week_chart_data(week: str | None = None) -> dict:
    """Line chart data: sleep_hours per day Sat→Fri for selected week."""
    if week:
        start = week_start_from_key(week)
        week = week_key(start)
    else:
        start = _week_start(date.today())
        week = week_key(start)

    labels = []
    values = []
    days = []
    with get_conn() as conn:
        for i in range(7):
            d = start + timedelta(days=i)
            labels.append(d.strftime("%a"))
            days.append(d.isoformat())
            row = conn.execute(
                "SELECT sleep_hours FROM sleep_logs WHERE date = ?", (d.isoformat(),)
            ).fetchone()
            val = row["sleep_hours"] if row and row["sleep_hours"] is not None else None
            values.append(val)

    return {
        "week": week,
        "week_label": week_range_label(start),
        "labels": labels,
        "values": values,
        "days": days,
    }


def migrate_from_checkins():
    """One-time copy sleep fields from legacy daily_checkins."""
    with get_conn() as conn:
        if conn.execute("SELECT COUNT(*) AS c FROM sleep_logs").fetchone()["c"] > 0:
            return
        rows = conn.execute(
            """SELECT day, bedtime, wake_time, sleep_hours, notes FROM daily_checkins
               WHERE bedtime IS NOT NULL OR wake_time IS NOT NULL OR sleep_hours IS NOT NULL"""
        ).fetchall()
        for r in rows:
            save_sleep(
                r["bedtime"] or "",
                r["wake_time"] or "",
                r["notes"],
                log_date=r["day"],
            )
