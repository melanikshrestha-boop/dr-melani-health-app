from __future__ import annotations

"""Body vitals — daily weight and related metrics."""

import json
from datetime import date, datetime, timedelta

from .db import get_conn, today
from .paths import HEALTH_DATA
from .sleep import week_key, _week_start, week_start_from_key, week_range_label, WEEK_RESET_ANCHOR

METRIC_WEIGHT = "weight"
DEFAULT_UNIT = "lb"
WEIGHT_GOAL_LB = 110.0


def save_weight(value: float, unit: str = DEFAULT_UNIT, day: str | None = None) -> dict:
    day = day or today()
    with get_conn() as conn:
        conn.execute("DELETE FROM vitals WHERE day = ? AND metric = ?", (day, METRIC_WEIGHT))
        conn.execute(
            "INSERT INTO vitals (day, metric, value, unit, logged_at) VALUES (?, ?, ?, ?, ?)",
            (day, METRIC_WEIGHT, round(value, 1), unit, datetime.now().isoformat()),
        )
    entry = get_weight(day)
    _sync_weight_file(day, entry)
    return entry


def get_weight(day: str | None = None) -> dict | None:
    day = day or today()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT day, value, unit, logged_at FROM vitals WHERE day = ? AND metric = ?",
            (day, METRIC_WEIGHT),
        ).fetchone()
    if not row:
        return None
    return dict(row)


def get_latest_weight() -> dict | None:
    """Most recent weight log (any day) — for profile header."""
    with get_conn() as conn:
        row = conn.execute(
            """SELECT day, value, unit, logged_at FROM vitals
               WHERE metric = ? ORDER BY day DESC, logged_at DESC LIMIT 1""",
            (METRIC_WEIGHT,),
        ).fetchone()
    if not row:
        return None
    return dict(row)


def weight_change(day: str | None = None) -> float | None:
    day = day or today()
    today_w = get_weight(day)
    if not today_w:
        return None
    prev_day = (datetime.strptime(day, "%Y-%m-%d").date() - timedelta(days=1)).isoformat()
    prev_w = get_weight(prev_day)
    if not prev_w:
        return None
    return round(today_w["value"] - prev_w["value"], 1)


def recent_weights(limit: int = 7) -> list:
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT day, value, unit FROM vitals
               WHERE metric = ? ORDER BY day DESC LIMIT ?""",
            (METRIC_WEIGHT, limit),
        ).fetchall()
    return [dict(r) for r in reversed(rows)]


def list_weeks(limit: int = 12) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT day, value FROM vitals WHERE metric = ? ORDER BY day DESC",
            (METRIC_WEIGHT,),
        ).fetchall()
    seen = {}
    for r in rows:
        d = date.fromisoformat(r["day"])
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
    return sorted(seen.values(), key=lambda x: x["key"], reverse=True)[:limit]


def week_chart_data(week: str | None = None) -> dict:
    if week:
        start = week_start_from_key(week)
        week = week_key(start)
    else:
        start = _week_start(date.today())
        week = week_key(start)

    labels = []
    values = []
    with get_conn() as conn:
        for i in range(7):
            d = start + timedelta(days=i)
            labels.append(d.strftime("%a"))
            row = conn.execute(
                "SELECT value FROM vitals WHERE day = ? AND metric = ?",
                (d.isoformat(), METRIC_WEIGHT),
            ).fetchone()
            values.append(round(row["value"], 1) if row else None)

    nums = [v for v in values if v is not None]
    if nums:
        y_min = min(min(nums), WEIGHT_GOAL_LB) - 8
        y_max = max(max(nums), WEIGHT_GOAL_LB) + 8
    else:
        y_min = WEIGHT_GOAL_LB - 15
        y_max = WEIGHT_GOAL_LB + 15

    return {
        "week": week,
        "week_label": week_range_label(start),
        "labels": labels,
        "values": values,
        "goal_lb": WEIGHT_GOAL_LB,
        "y_min": round(y_min, 1),
        "y_max": round(y_max, 1),
    }


def _sync_weight_file(day: str, entry: dict | None):
    path = HEALTH_DATA / "vitals" / f"weight_{day}.json"
    if entry:
        path.write_text(json.dumps(entry, indent=2))
    elif path.exists():
        path.unlink()
