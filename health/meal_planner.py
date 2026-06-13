"""Tomorrow lunch/dinner plan — set at night via Dr. Melani, no extra UI."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta

from .db import today
from .paths import HEALTH_DATA

PLAN_FILE = HEALTH_DATA / "nutrition" / "tomorrow_plan.json"


def _tomorrow_iso() -> str:
    return (date.fromisoformat(today()) + timedelta(days=1)).isoformat()


def _load() -> dict:
    PLAN_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not PLAN_FILE.exists():
        return {}
    try:
        return json.loads(PLAN_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def save_plan(lunch: str = "", dinner: str = "", *, source: str = "dr_melani") -> dict:
    target = _tomorrow_iso()
    lunch = (lunch or "").strip()
    dinner = (dinner or "").strip()
    plan = {
        "for_day": target,
        "lunch": lunch,
        "dinner": dinner,
        "updated_at": datetime.now().isoformat(),
        "source": source,
    }
    PLAN_FILE.write_text(json.dumps(plan, indent=2))
    return plan


def get_plan() -> dict | None:
    plan = _load()
    if not plan or plan.get("for_day") != _tomorrow_iso():
        return None
    if not plan.get("lunch") and not plan.get("dinner"):
        return None
    return plan


def context_block() -> str:
    plan = get_plan()
    if not plan:
        return "=== TOMORROW MEAL PLAN ===\nNone set yet."
    lines = [f"=== TOMORROW MEAL PLAN ({plan['for_day']}) ==="]
    if plan.get("lunch"):
        lines.append(f"  Lunch: {plan['lunch']}")
    if plan.get("dinner"):
        lines.append(f"  Dinner: {plan['dinner']}")
    lines.append("She can update this the night before via chat.")
    return "\n".join(lines)


def display_line() -> str | None:
    plan = get_plan()
    if not plan:
        return None
    parts = []
    if plan.get("lunch"):
        parts.append(f"Lunch: {plan['lunch']}")
    if plan.get("dinner"):
        parts.append(f"Dinner: {plan['dinner']}")
    if not parts:
        return None
    d = date.fromisoformat(plan["for_day"])
    return f"Tomorrow ({d.strftime('%a %b %d')}) · " + " · ".join(parts)
