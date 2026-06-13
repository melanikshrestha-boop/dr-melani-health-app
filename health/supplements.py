"""Daily vitamin & supplement tracking (non-prescription)."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta

from .db import get_conn, today
from .paths import HEALTH_DATA
from .sleep import _week_start, week_key, week_start_from_key, week_range_label

SUPPLEMENTS_DIR = HEALTH_DATA / "supplements"

DEFAULT_SUPPLEMENTS: list[dict] = [
    {
        "name": "Vitamin D",
        "dose": "",
        "schedule": "Daily",
        "timing": "Right after breakfast",
    },
    {
        "name": "Ashwagandha",
        "dose": "Patanjali",
        "schedule": "Daily",
        "timing": "7 p.m.",
    },
    {
        "name": "Creatine",
        "dose": "Monohydrate",
        "schedule": "Daily",
        "timing": "Daily · with water",
    },
]

CATALOG_SYNC: dict[str, dict[str, str]] = {
    "Vitamin D": {
        "dose": "",
        "schedule": "Daily",
        "timing": "Right after breakfast",
    },
    "Ashwagandha": {
        "dose": "Patanjali",
        "schedule": "Daily",
        "timing": "7 p.m.",
    },
    "Creatine": {
        "dose": "Monohydrate",
        "schedule": "Daily",
        "timing": "Daily · with water",
    },
}

REMOVED_SUPPLEMENTS = ("Immunogrid Gold",)


def _ensure_timing_column(conn) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(supplement_catalog)").fetchall()}
    if "timing" not in cols:
        conn.execute("ALTER TABLE supplement_catalog ADD COLUMN timing TEXT DEFAULT ''")


def _sync_catalog(conn) -> None:
    for name in REMOVED_SUPPLEMENTS:
        row = conn.execute(
            "SELECT id FROM supplement_catalog WHERE lower(name) = lower(?)",
            (name,),
        ).fetchone()
        if row:
            conn.execute("DELETE FROM supplement_logs WHERE supplement_id = ?", (row["id"],))
            conn.execute("DELETE FROM supplement_catalog WHERE id = ?", (row["id"],))
    for name, fields in CATALOG_SYNC.items():
        row = conn.execute(
            "SELECT id FROM supplement_catalog WHERE lower(name) = lower(?)",
            (name,),
        ).fetchone()
        if row:
            conn.execute(
                """UPDATE supplement_catalog
                   SET dose = ?, schedule = ?, timing = ?
                   WHERE id = ?""",
                (fields["dose"], fields["schedule"], fields["timing"], row["id"]),
            )
        else:
            conn.execute(
                """INSERT INTO supplement_catalog (name, dose, schedule, timing)
                   VALUES (?, ?, ?, ?)""",
                (name, fields["dose"], fields["schedule"], fields["timing"]),
            )


def _is_daily(item: dict) -> bool:
    return (item.get("schedule") or "Daily").lower() != "considering"


def ensure_catalog() -> None:
    with get_conn() as conn:
        _ensure_timing_column(conn)
        count = conn.execute("SELECT COUNT(*) AS c FROM supplement_catalog").fetchone()["c"]
        if not count:
            for item in DEFAULT_SUPPLEMENTS:
                conn.execute(
                    """INSERT INTO supplement_catalog (name, dose, schedule, timing)
                       VALUES (?, ?, ?, ?)""",
                    (
                        item["name"],
                        item.get("dose") or "",
                        item.get("schedule") or "Daily",
                        item.get("timing") or "",
                    ),
                )
        else:
            existing = {
                r["name"].lower()
                for r in conn.execute("SELECT name FROM supplement_catalog").fetchall()
            }
            for item in DEFAULT_SUPPLEMENTS:
                if item["name"].lower() not in existing:
                    conn.execute(
                        """INSERT INTO supplement_catalog (name, dose, schedule, timing)
                           VALUES (?, ?, ?, ?)""",
                        (
                            item["name"],
                            item.get("dose") or "",
                            item.get("schedule") or "Daily",
                            item.get("timing") or "",
                        ),
                    )
        _sync_catalog(conn)


def list_catalog() -> list[dict]:
    ensure_catalog()
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, name, dose, schedule, timing FROM supplement_catalog ORDER BY id"
        ).fetchall()
    return [dict(r) for r in rows]


def _sync_log(day: str, supplement_id: int, name: str, taken: bool):
    SUPPLEMENTS_DIR.mkdir(parents=True, exist_ok=True)
    path = SUPPLEMENTS_DIR / f"{day}_{supplement_id}.json"
    if taken:
        path.write_text(
            json.dumps(
                {
                    "day": day,
                    "supplement_id": supplement_id,
                    "name": name,
                    "taken": True,
                    "logged_at": datetime.now().isoformat(),
                },
                indent=2,
            )
        )
    elif path.exists():
        path.unlink()


def set_taken(supplement_id: int, taken: bool, day: str | None = None) -> dict:
    day = day or today()
    ensure_catalog()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, name FROM supplement_catalog WHERE id = ?",
            (supplement_id,),
        ).fetchone()
        if not row:
            raise ValueError("Unknown supplement")
        conn.execute(
            "DELETE FROM supplement_logs WHERE day = ? AND supplement_id = ?",
            (day, supplement_id),
        )
        if taken:
            conn.execute(
                """INSERT INTO supplement_logs (day, supplement_id, name, taken, logged_at)
                   VALUES (?, ?, ?, 1, ?)""",
                (day, supplement_id, row["name"], datetime.now().isoformat()),
            )
        _sync_log(day, supplement_id, row["name"], taken)
    return today_status(day)


def log_all_today(day: str | None = None) -> dict:
    day = day or today()
    for item in list_catalog():
        if _is_daily(item):
            set_taken(item["id"], True, day)
    return today_status(day)


def get_by_id(supplement_id: int) -> dict | None:
    ensure_catalog()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, name, dose, schedule, timing FROM supplement_catalog WHERE id = ?",
            (supplement_id,),
        ).fetchone()
    return dict(row) if row else None


def daily_items(catalog: list[dict] | None = None) -> list[dict]:
    catalog = catalog if catalog is not None else list_catalog()
    return [item for item in catalog if _is_daily(item)]


def today_status(day: str | None = None) -> dict:
    day = day or today()
    ensure_catalog()
    items = []
    taken_count = 0
    with get_conn() as conn:
        catalog = list_catalog()
        trackable = daily_items(catalog)
        for item in catalog:
            log = conn.execute(
                """SELECT taken FROM supplement_logs
                   WHERE day = ? AND supplement_id = ?""",
                (day, item["id"]),
            ).fetchone()
            taken = bool(log and log["taken"])
            if taken and _is_daily(item):
                taken_count += 1
            items.append({**item, "taken": taken, "daily_track": _is_daily(item)})
    total = len(trackable)
    return {
        "day": day,
        "items": items,
        "taken_count": taken_count,
        "total": total,
        "summary": f"{taken_count} of {total} taken today" if total else "No supplements listed",
        "all_taken": total > 0 and taken_count == total,
    }


def week_summary(week: str | None = None) -> dict:
    if week:
        start = week_start_from_key(week)
        wk = week_key(start)
    else:
        start = _week_start(date.today())
        wk = week_key(start)

    catalog = list_catalog()
    days = []
    for i in range(7):
        d = start + timedelta(days=i)
        iso = d.isoformat()
        status = today_status(iso)
        days.append(
            {
                "day": iso,
                "label": d.strftime("%a"),
                "taken_count": status["taken_count"],
                "total": status["total"],
                "complete": status["all_taken"],
            }
        )

    return {
        "week": wk,
        "week_label": week_range_label(start),
        "days": days,
        "catalog_count": len(catalog),
    }


def find_by_name(text: str) -> dict | None:
    q = (text or "").lower()
    for item in list_catalog():
        name = item["name"].lower()
        if name in q or q in name:
            return item
        if "vitamin d" in q or "vit d" in q or "vitamin d3" in q:
            if "vitamin" in name:
                return item
        if "ashwagandha" in q and "ashwagandha" in name:
            return item
        if "creatine" in q and "creatine" in name.lower():
            return item
    return None


def context_block(day: str | None = None) -> str:
    status = today_status(day)
    week = week_summary()
    lines = ["=== VITAMINS & SUPPLEMENTS (not prescriptions) ==="]
    if not status["items"]:
        lines.append("None configured.")
        return "\n".join(lines)
    for item in status["items"]:
        if not item.get("daily_track", True):
            continue
        mark = "✓" if item["taken"] else "—"
        extra = f" ({item['dose']})" if item.get("dose") else ""
        when = f" · {item['timing']}" if item.get("timing") else ""
        lines.append(f"  {mark} {item['name']}{extra}{when}")
    lines.append(f"Today: {status['summary']}")
    complete_days = sum(1 for d in week["days"] if d["complete"])
    lines.append(f"This week all taken: {complete_days} of 7 days")
    return "\n".join(lines)
