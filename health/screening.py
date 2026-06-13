from __future__ import annotations

"""Screening schedule queries and reminders."""

from datetime import date, timedelta

from .db import get_conn


def list_screening():
    today = date.today()
    out = []
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM screening_schedule ORDER BY next_due"
        ).fetchall()
        for r in rows:
            due = date.fromisoformat(r["next_due"])
            days = (due - today).days
            if days < 0:
                status = "overdue"
            elif days <= 14:
                status = "due_soon"
            else:
                status = "ok"
            out.append({
                "test_name": r["test_name"],
                "last_done": r["last_done"],
                "next_due": r["next_due"],
                "interval_months": r["interval_months"],
                "reason": r["reason"],
                "fasting": bool(r["fasting"]),
                "days_until": days,
                "status": status,
            })
    return out


def due_reminders(within_days: int = 14) -> list[str]:
    msgs = []
    for item in list_screening():
        d = item["days_until"]
        if d <= within_days:
            fast = " Fast 8-12h." if item["fasting"] else ""
            if d < 0:
                msgs.append(
                    f"OVERDUE: {item['test_name']} was due {item['next_due']}. "
                    f"Last: {item['last_done']}.{fast}"
                )
            elif d == 0:
                msgs.append(f"DUE TODAY: {item['test_name']}.{fast}")
            else:
                msgs.append(
                    f"Screening: {item['test_name']} due {item['next_due']} ({d} days). "
                    f"Last: {item['last_done']}.{fast}"
                )
    return msgs


def mark_test_done(test_name: str, done_date: str | None = None):
    from .db import _add_months

    done_date = done_date or date.today().isoformat()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT interval_months FROM screening_schedule WHERE test_name = ?",
            (test_name,),
        ).fetchone()
        if not row:
            return False
        last_d = date.fromisoformat(done_date)
        next_d = _add_months(last_d, row["interval_months"])
        conn.execute(
            """UPDATE screening_schedule SET last_done = ?, next_due = ? WHERE test_name = ?""",
            (done_date, next_d.isoformat(), test_name),
        )
    return True
