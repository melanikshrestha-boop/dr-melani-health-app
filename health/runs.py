from __future__ import annotations

"""Running log — miles, time, pace, weekly distance targets, progress charts."""

import json
from datetime import date, datetime, timedelta

from .db import get_conn, today
from .paths import HEALTH_DATA
from .sleep import _week_start, week_key, week_range_label, week_start_from_key

RUN_PROGRAM_FILE = HEALTH_DATA / "workouts" / "run_program.json"
RUNS_DIR = HEALTH_DATA / "workouts" / "runs"

BASE_TARGET_MI = 5.0
WEEKLY_INCREMENT_MI = 0.5


def ensure():
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    _ensure_table()
    _ensure_program()
    _seed_baseline_if_empty()


def _ensure_table():
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS run_logs (
                day TEXT PRIMARY KEY,
                distance_mi REAL NOT NULL,
                duration_sec INTEGER NOT NULL,
                pace_sec_per_mi REAL NOT NULL,
                week_key TEXT NOT NULL,
                target_mi REAL NOT NULL,
                notes TEXT,
                logged_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_run_logs_week ON run_logs(week_key)"
        )


def _ensure_program():
    if RUN_PROGRAM_FILE.exists():
        return
    start = _week_start(date.today())
    RUN_PROGRAM_FILE.write_text(
        json.dumps(
            {
                "start_week": week_key(start),
                "base_mi": BASE_TARGET_MI,
                "increment_mi": WEEKLY_INCREMENT_MI,
            },
            indent=2,
        )
    )


def _load_program() -> dict:
    _ensure_program()
    return json.loads(RUN_PROGRAM_FILE.read_text())


def _weeks_since_start(week: str | None = None) -> int:
    prog = _load_program()
    start = week_start_from_key(prog["start_week"])
    target = week_start_from_key(week or week_key(date.today()))
    return max(0, (target - start).days // 7)


def week_target(week: str | None = None) -> float:
    prog = _load_program()
    offset = _weeks_since_start(week)
    return round(prog["base_mi"] + offset * prog["increment_mi"], 1)


def next_week_target(week: str | None = None) -> float:
    prog = _load_program()
    offset = _weeks_since_start(week) + 1
    return round(prog["base_mi"] + offset * prog["increment_mi"], 1)


def format_pace(pace_sec_per_mi: float | None) -> str:
    if pace_sec_per_mi is None or pace_sec_per_mi <= 0:
        return "—"
    total = int(round(pace_sec_per_mi))
    minutes = total // 60
    seconds = total % 60
    return f"{minutes}:{seconds:02d}/mi"


def format_duration(duration_sec: int | None) -> str:
    if not duration_sec or duration_sec <= 0:
        return "—"
    hours = duration_sec // 3600
    minutes = (duration_sec % 3600) // 60
    seconds = duration_sec % 60
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def format_duration_short(duration_sec: int | None) -> str:
    if not duration_sec or duration_sec <= 0:
        return "—"
    hours = duration_sec // 3600
    minutes = (duration_sec % 3600) // 60
    if hours:
        return f"{hours} hr {minutes} min"
    return f"{minutes} min"


def pace_minutes_decimal(pace_sec_per_mi: float | None) -> float | None:
    if pace_sec_per_mi is None or pace_sec_per_mi <= 0:
        return None
    return round(pace_sec_per_mi / 60.0, 2)


def _row_to_dict(row) -> dict:
    d = dict(row)
    d["miles"] = round(d["distance_mi"], 2)
    d["pace_display"] = format_pace(d["pace_sec_per_mi"])
    d["duration_display"] = format_duration(d["duration_sec"])
    d["duration_short"] = format_duration_short(d["duration_sec"])
    d["hit_target"] = d["distance_mi"] >= d["target_mi"] - 0.01
    return d


def log_run(
    miles: float,
    duration_sec: int,
    *,
    day: str | None = None,
    notes: str = "",
) -> dict:
    day = day or today()
    miles = round(float(miles), 2)
    duration_sec = int(duration_sec)
    if miles <= 0:
        raise ValueError("Distance must be greater than zero.")
    if duration_sec <= 0:
        raise ValueError("Time must be greater than zero.")

    run_day = date.fromisoformat(day)
    wk = week_key(_week_start(run_day))
    target = week_target(wk)
    pace = duration_sec / miles
    logged_at = datetime.now().isoformat()

    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO run_logs
                (day, distance_mi, duration_sec, pace_sec_per_mi, week_key, target_mi, notes, logged_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(day) DO UPDATE SET
                distance_mi = excluded.distance_mi,
                duration_sec = excluded.duration_sec,
                pace_sec_per_mi = excluded.pace_sec_per_mi,
                week_key = excluded.week_key,
                target_mi = excluded.target_mi,
                notes = excluded.notes,
                logged_at = excluded.logged_at
            """,
            (day, miles, duration_sec, pace, wk, target, notes.strip(), logged_at),
        )

    entry = get_run(day)
    _sync_file(day, entry)
    return entry


def get_run(day: str | None = None) -> dict | None:
    day = day or today()
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM run_logs WHERE day = ?", (day,)).fetchone()
    if not row:
        return None
    return _row_to_dict(row)


def latest_run() -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM run_logs ORDER BY day DESC LIMIT 1"
        ).fetchone()
    if not row:
        return None
    return _row_to_dict(row)


def list_runs(limit: int = 52) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM run_logs ORDER BY day DESC LIMIT ?", (limit,)
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def runs_this_week(week: str | None = None) -> list[dict]:
    wk = week or week_key(date.today())
    start = week_start_from_key(wk)
    end = (start + timedelta(days=6)).isoformat()
    start_s = start.isoformat()
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM run_logs WHERE day >= ? AND day <= ? ORDER BY day DESC",
            (start_s, end),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def progress_chart_data() -> dict:
    """All runs for distance + pace trend charts."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM run_logs ORDER BY day ASC"
        ).fetchall()
    runs = [_row_to_dict(r) for r in rows]

    labels = []
    days = []
    distances = []
    paces = []
    pace_labels = []
    targets = []

    for run in runs:
        d = date.fromisoformat(run["day"])
        labels.append(f"{d.strftime('%b')} {d.day}")
        days.append(run["day"])
        distances.append(run["miles"])
        paces.append(pace_minutes_decimal(run["pace_sec_per_mi"]))
        pace_labels.append(run["pace_display"])
        targets.append(run["target_mi"])

    dist_nums = [v for v in distances if v is not None]
    pace_nums = [v for v in paces if v is not None]
    target_nums = [v for v in targets if v is not None]

    if dist_nums:
        y_dist_min = max(0, min(min(dist_nums), min(target_nums or dist_nums)) - 0.5)
        y_dist_max = max(max(dist_nums), max(target_nums or dist_nums)) + 0.5
    else:
        y_dist_min = BASE_TARGET_MI - 0.5
        y_dist_max = BASE_TARGET_MI + 1.0

    if pace_nums:
        y_pace_min = max(0, min(pace_nums) - 1.0)
        y_pace_max = max(pace_nums) + 1.0
    else:
        y_pace_min = 12.0
        y_pace_max = 18.0

    return {
        "labels": labels,
        "days": days,
        "distances": distances,
        "paces": paces,
        "pace_labels": pace_labels,
        "targets": targets,
        "y_dist_min": round(y_dist_min, 1),
        "y_dist_max": round(y_dist_max, 1),
        "y_pace_min": round(y_pace_min, 1),
        "y_pace_max": round(y_pace_max, 1),
    }


def page_context(week: str | None = None) -> dict:
    week = week or week_key(date.today())
    start = week_start_from_key(week)
    today_run = get_run(today())
    week_runs = runs_this_week(week)
    target = week_target(week)
    nxt = next_week_target(week)

    return {
        "week_key": week,
        "week_label": week_range_label(start),
        "week_target_mi": target,
        "next_week_target_mi": nxt,
        "today_date": today(),
        "today_run": today_run,
        "week_runs": week_runs,
        "history": list_runs(),
        "chart": progress_chart_data(),
        "latest_run": latest_run(),
    }


def _sync_file(day: str, entry: dict | None):
    path = RUNS_DIR / f"{day}.json"
    if entry:
        slim = {k: entry[k] for k in entry if k != "notes" or entry.get("notes")}
        path.write_text(json.dumps(slim, indent=2))
    elif path.exists():
        path.unlink()


def _seed_baseline_if_empty():
    """One-time demo seed — never auto-log today."""
    with get_conn() as conn:
        count = conn.execute("SELECT COUNT(*) AS n FROM run_logs").fetchone()["n"]
    if count:
        return
    log_run(5.29, 75 * 60, day="2026-06-05", notes="")


def parse_duration_fields(hours: int = 0, minutes: int = 0, seconds: int = 0) -> int:
    return max(0, int(hours)) * 3600 + max(0, int(minutes)) * 60 + max(0, int(seconds))
