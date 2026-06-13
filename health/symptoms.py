from __future__ import annotations

"""Daily symptoms — brain fog tracking with weekly rollover."""

import json
from datetime import date, datetime, timedelta

from .db import get_conn, today
from .paths import HEALTH_DATA
from .sleep import _week_start, week_key, week_start_from_key, week_range_label

SYMPTOMS_DIR = HEALTH_DATA / "symptoms"
ROLLOVER_STATE_FILE = SYMPTOMS_DIR / "rollover_state.json"
WEEK_SUMMARIES_FILE = SYMPTOMS_DIR / "brain_fog_weeks.json"
BOWEL_ROLLOVER_STATE_FILE = SYMPTOMS_DIR / "bowel_rollover_state.json"
BOWEL_MEMORY_FILE = HEALTH_DATA / "jarvis" / "bowel_memory.json"


def log_brain_fog(yes: bool, day: str | None = None) -> dict:
    day = day or today()
    with get_conn() as conn:
        conn.execute("DELETE FROM symptoms WHERE day = ? AND type = 'brain_fog'", (day,))
        conn.execute(
            "INSERT INTO symptoms (day, type, severity, notes, logged_at) VALUES (?, 'brain_fog', ?, ?, ?)",
            (day, 1 if yes else 0, "yes" if yes else "no", datetime.now().isoformat()),
        )
    entry = get_brain_fog(day)
    _sync(day, entry)
    return entry


def get_brain_fog(day: str | None = None) -> dict | None:
    day = day or today()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT day, severity, notes, logged_at FROM symptoms WHERE day = ? AND type = 'brain_fog'",
            (day,),
        ).fetchone()
    if not row:
        return None
    return {
        "day": row["day"],
        "yes": bool(row["severity"]),
        "logged_at": row["logged_at"],
    }


def consecutive_brain_fog_days(end_day: str | None = None) -> int:
    """Yes streak within the current calendar week only."""
    end = datetime.strptime(end_day or today(), "%Y-%m-%d").date()
    week_start = _week_start(end)
    streak = 0
    d = end
    while d >= week_start:
        bf = get_brain_fog(d.isoformat())
        if not bf or not bf["yes"]:
            break
        streak += 1
        d -= timedelta(days=1)
    return streak


def brain_fog_week_count(end_day: str | None = None) -> int:
    end = datetime.strptime(end_day or today(), "%Y-%m-%d").date()
    count = 0
    for i in range(7):
        d = (end - timedelta(days=i)).isoformat()
        bf = get_brain_fog(d)
        if bf and bf["yes"]:
            count += 1
    return count


def recent_brain_fog(days: int = 7) -> list:
    end = datetime.strptime(today(), "%Y-%m-%d").date()
    out = []
    for i in range(days):
        d = (end - timedelta(days=i)).isoformat()
        bf = get_brain_fog(d)
        out.append({"day": d, "yes": bf["yes"] if bf else None})
    return list(reversed(out))


def week_brain_fog_data(week: str | None = None) -> dict:
    """Sat→Fri yes/no/missing for the selected week."""
    if week:
        start = week_start_from_key(week)
        wk = week_key(start)
    else:
        start = _week_start(date.today())
        wk = week_key(start)

    days = []
    yes_count = 0
    for i in range(7):
        d = start + timedelta(days=i)
        iso = d.isoformat()
        bf = get_brain_fog(iso)
        yes_val = bf["yes"] if bf else None
        if yes_val:
            yes_count += 1
        days.append({"day": iso, "label": d.strftime("%a"), "yes": yes_val})

    return {
        "week": wk,
        "week_label": week_range_label(start),
        "days": days,
        "yes_count": yes_count,
        "logged_count": sum(1 for x in days if x["yes"] is not None),
    }


def _verdict_label(verdict: str, yes_count: int, logged: int) -> str:
    if verdict == "mostly_yes":
        return f"Last week: mostly yes ({yes_count} of {logged} days)"
    if verdict == "mostly_no":
        no_count = logged - yes_count
        return f"Last week: mostly no ({no_count} of {logged} days)"
    return "Last week: mixed"


def _compute_verdict(yes_count: int, no_count: int) -> str:
    logged = yes_count + no_count
    if logged < 3 or yes_count == no_count:
        return "mixed"
    if yes_count > no_count:
        return "mostly_yes"
    return "mostly_no"


def _summarize_and_wipe_week(week: str) -> dict:
    data = week_brain_fog_data(week)
    yes_count = sum(1 for d in data["days"] if d["yes"] is True)
    no_count = sum(1 for d in data["days"] if d["yes"] is False)
    logged = yes_count + no_count
    verdict = _compute_verdict(yes_count, no_count)

    with get_conn() as conn:
        for d in data["days"]:
            if d["yes"] is not None:
                conn.execute(
                    "DELETE FROM symptoms WHERE day = ? AND type = 'brain_fog'",
                    (d["day"],),
                )
                path = SYMPTOMS_DIR / f"brain_fog_{d['day']}.json"
                if path.exists():
                    path.unlink()

    summary = {
        "week": week,
        "yes_count": yes_count,
        "no_count": no_count,
        "logged_days": logged,
        "verdict": verdict,
        "display": _verdict_label(verdict, yes_count, logged),
        "closed_at": datetime.now().isoformat(),
    }
    return summary


def _load_rollover_state() -> dict:
    SYMPTOMS_DIR.mkdir(parents=True, exist_ok=True)
    if not ROLLOVER_STATE_FILE.exists():
        return {}
    try:
        return json.loads(ROLLOVER_STATE_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def _save_rollover_state(state: dict):
    SYMPTOMS_DIR.mkdir(parents=True, exist_ok=True)
    ROLLOVER_STATE_FILE.write_text(json.dumps(state, indent=2))


def _append_week_summary(summary: dict):
    SYMPTOMS_DIR.mkdir(parents=True, exist_ok=True)
    summaries = []
    if WEEK_SUMMARIES_FILE.exists():
        try:
            summaries = json.loads(WEEK_SUMMARIES_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            summaries = []
    summaries = [s for s in summaries if s.get("week") != summary.get("week")]
    summaries.append(summary)
    summaries.sort(key=lambda s: s.get("week") or "")
    WEEK_SUMMARIES_FILE.write_text(json.dumps(summaries, indent=2))


def maybe_rollover_brain_fog_week() -> dict | None:
    """On a new calendar week, summarize + wipe the prior week. Returns banner dict or None."""
    current_wk = week_key(date.today())
    state = _load_rollover_state()
    last_wk = state.get("last_rollover_week")

    if last_wk == current_wk:
        return state.get("pending_verdict")

    verdict = None
    if last_wk:
        verdict = _summarize_and_wipe_week(last_wk)
        _append_week_summary(verdict)

    state["last_rollover_week"] = current_wk
    state["pending_verdict"] = verdict
    _save_rollover_state(state)
    return verdict


def last_week_verdict() -> dict | None:
    """Banner text for the current week (set at rollover)."""
    state = _load_rollover_state()
    return state.get("pending_verdict")


def _sync(day: str, entry: dict | None):
    SYMPTOMS_DIR.mkdir(parents=True, exist_ok=True)
    path = SYMPTOMS_DIR / f"brain_fog_{day}.json"
    if entry:
        path.write_text(json.dumps(entry, indent=2))
    elif path.exists():
        path.unlink()


def log_bowel_movement(yes: bool, day: str | None = None, description: str | None = None) -> dict:
    day = day or today()
    existing = _get_bowel_row(day)
    note = (description or "").strip()
    if not note and existing:
        note = existing.get("description") or ""
    with get_conn() as conn:
        conn.execute("DELETE FROM symptoms WHERE day = ? AND type = 'bowel_movement'", (day,))
        conn.execute(
            "INSERT INTO symptoms (day, type, severity, notes, logged_at) VALUES (?, 'bowel_movement', ?, ?, ?)",
            (day, 1 if yes else 0, note[:500], datetime.now().isoformat()),
        )
    entry = get_bowel_movement(day)
    _sync_bowel(day, _get_bowel_row(day))
    return entry


def log_bowel_note(description: str, day: str | None = None) -> dict:
    """Private note for Dr. Melani — never shown back in the UI."""
    day = day or today()
    note = (description or "").strip()[:500]
    existing = _get_bowel_row(day)
    with get_conn() as conn:
        if existing:
            conn.execute(
                "UPDATE symptoms SET notes = ?, logged_at = ? WHERE day = ? AND type = 'bowel_movement'",
                (note, datetime.now().isoformat(), day),
            )
        else:
            conn.execute(
                "INSERT INTO symptoms (day, type, severity, notes, logged_at) VALUES (?, 'bowel_movement', ?, ?, ?)",
                (day, -1, note, datetime.now().isoformat()),
            )
    _sync_bowel(day, _get_bowel_row(day))
    return get_bowel_movement(day)


def _clean_bowel_note(raw: str | None) -> str:
    text = (raw or "").strip()
    if text.lower() in ("yes", "no"):
        return ""
    return text


def _get_bowel_row(day: str | None = None) -> dict | None:
    day = day or today()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT day, severity, notes, logged_at FROM symptoms WHERE day = ? AND type = 'bowel_movement'",
            (day,),
        ).fetchone()
    if not row:
        return None
    severity = row["severity"]
    description = _clean_bowel_note(row["notes"])
    yes = None if severity is not None and int(severity) < 0 else bool(severity)
    return {
        "day": row["day"],
        "yes": yes,
        "description": description,
        "has_note": bool(description),
        "logged_at": row["logged_at"],
    }


def get_bowel_movement(day: str | None = None) -> dict | None:
    """Public view — yes/no only; never includes private note text."""
    row = _get_bowel_row(day)
    if not row:
        return None
    return {
        "day": row["day"],
        "yes": row["yes"],
        "has_note": row["has_note"],
        "logged_at": row["logged_at"],
    }


def week_bowel_data(week: str | None = None) -> dict:
    """Sat→Fri yes/no/missing — yes = went today."""
    if week:
        start = week_start_from_key(week)
        wk = week_key(start)
    else:
        start = _week_start(date.today())
        wk = week_key(start)

    days = []
    yes_count = 0
    for i in range(7):
        d = start + timedelta(days=i)
        iso = d.isoformat()
        entry = get_bowel_movement(iso)
        yes_val = entry["yes"] if entry else None
        if yes_val:
            yes_count += 1
        days.append({"day": iso, "label": d.strftime("%a"), "yes": yes_val})

    return {
        "week": wk,
        "week_label": week_range_label(start),
        "days": days,
        "yes_count": yes_count,
        "logged_count": sum(1 for x in days if x["yes"] is not None),
    }


def _sync_bowel(day: str, entry: dict | None):
    SYMPTOMS_DIR.mkdir(parents=True, exist_ok=True)
    path = SYMPTOMS_DIR / f"bowel_movement_{day}.json"
    if entry:
        public = {
            "day": entry["day"],
            "yes": entry.get("yes"),
            "has_note": entry.get("has_note", False),
            "logged_at": entry.get("logged_at"),
        }
        path.write_text(json.dumps(public, indent=2))
    elif path.exists():
        path.unlink()


def _archive_bowel_week(week: str) -> dict:
    data = week_bowel_data(week)
    days_out = []
    for d in data["days"]:
        row = _get_bowel_row(d["day"])
        days_out.append(
            {
                "day": d["day"],
                "label": d["label"],
                "yes": d["yes"],
                "description": (row or {}).get("description") or "",
            }
        )

    with get_conn() as conn:
        for d in data["days"]:
            conn.execute(
                "DELETE FROM symptoms WHERE day = ? AND type = 'bowel_movement'",
                (d["day"],),
            )
            path = SYMPTOMS_DIR / f"bowel_movement_{d['day']}.json"
            if path.exists():
                path.unlink()

    archive = {
        "week": week,
        "week_label": data["week_label"],
        "yes_count": data["yes_count"],
        "logged_count": data["logged_count"],
        "days": days_out,
        "closed_at": datetime.now().isoformat(),
    }
    return archive


def _append_bowel_memory(archive: dict):
    BOWEL_MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    memories = []
    if BOWEL_MEMORY_FILE.exists():
        try:
            memories = json.loads(BOWEL_MEMORY_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            memories = []
    memories = [m for m in memories if m.get("week") != archive.get("week")]
    memories.append(archive)
    memories.sort(key=lambda m: m.get("week") or "")
    if len(memories) > 26:
        memories = memories[-26:]
    BOWEL_MEMORY_FILE.write_text(json.dumps(memories, indent=2))


def maybe_rollover_bowel_week() -> None:
    """New calendar week — archive prior week (incl. private notes) then wipe live rows."""
    current_wk = week_key(date.today())
    state: dict = {}
    if BOWEL_ROLLOVER_STATE_FILE.exists():
        try:
            state = json.loads(BOWEL_ROLLOVER_STATE_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            state = {}

    last_wk = state.get("last_rollover_week")
    if last_wk == current_wk:
        return

    if last_wk:
        archive = _archive_bowel_week(last_wk)
        _append_bowel_memory(archive)

    state["last_rollover_week"] = current_wk
    BOWEL_ROLLOVER_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    BOWEL_ROLLOVER_STATE_FILE.write_text(json.dumps(state, indent=2))


def bowel_memory_context(max_weeks: int = 8) -> str:
    """Archived bowel logs for Dr. Melani — includes private notes."""
    lines = ["=== BOWEL MEMORY (archived weeks — private notes) ==="]
    if not BOWEL_MEMORY_FILE.exists():
        lines.append("No archived weeks yet.")
        return "\n".join(lines)
    try:
        memories = json.loads(BOWEL_MEMORY_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        lines.append("No archived weeks yet.")
        return "\n".join(lines)

    if not memories:
        lines.append("No archived weeks yet.")
        return "\n".join(lines)

    for block in memories[-max_weeks:]:
        lines.append(
            f"{block.get('week_label', block.get('week', '?'))}: "
            f"went {block.get('yes_count', 0)} of 7 days"
        )
        for d in block.get("days") or []:
            if not d.get("description"):
                continue
            yes_txt = "yes" if d.get("yes") else "no" if d.get("yes") is False else "?"
            lines.append(f"  {d.get('day', '?')} ({yes_txt}): {d['description'][:200]}")
    return "\n".join(lines)


def bowel_private_context_for_week(week: str | None = None) -> str:
    """Current-week private notes for Dr. Melani only."""
    start = week_start_from_key(week) if week else _week_start(date.today())

    notes = []
    for i in range(7):
        d = (start + timedelta(days=i)).isoformat()
        row = _get_bowel_row(d)
        if row and row.get("description"):
            yes_txt = "yes" if row.get("yes") else "no" if row.get("yes") is False else "?"
            notes.append(f"  {d} ({yes_txt}): {row['description'][:200]}")
    if not notes:
        return ""
    return "=== BOWEL PRIVATE NOTES (this week — not shown in app UI) ===\n" + "\n".join(notes)
