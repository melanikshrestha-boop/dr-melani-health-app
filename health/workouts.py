from __future__ import annotations

"""Workout tracking."""

import json
from datetime import datetime

from .db import get_conn, today
from .paths import HEALTH_DATA


def log_workout(
    workout_type: str,
    duration_min: int | None = None,
    notes: str = "",
    rpe: int | None = None,
    exercises: list | None = None,
    day: str | None = None,
) -> dict:
    day = day or today()
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO workout_sessions (day, type, duration_min, notes, rpe, logged_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (day, workout_type, duration_min, notes, rpe, datetime.now().isoformat()),
        )
        sid = cur.lastrowid
        ex_list = []
        for ex in exercises or []:
            conn.execute(
                """INSERT INTO workout_exercises (session_id, name, sets, reps, weight, distance, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    sid, ex.get("name", ""), ex.get("sets"), ex.get("reps"),
                    ex.get("weight"), ex.get("distance"), ex.get("notes", ""),
                ),
            )
            ex_list.append(ex)
    record = {"id": sid, "day": day, "type": workout_type, "duration_min": duration_min,
              "notes": notes, "rpe": rpe, "exercises": ex_list}
    path = HEALTH_DATA / "workouts" / f"{day}_{sid}.json"
    path.write_text(json.dumps(record, indent=2))
    return record


def list_workouts(limit: int = 30) -> list:
    with get_conn() as conn:
        sessions = conn.execute(
            "SELECT * FROM workout_sessions ORDER BY day DESC, id DESC LIMIT ?", (limit,)
        ).fetchall()
        out = []
        for s in sessions:
            exs = conn.execute(
                "SELECT * FROM workout_exercises WHERE session_id = ?", (s["id"],)
            ).fetchall()
            out.append({**dict(s), "exercises": [dict(e) for e in exs]})
        return out
