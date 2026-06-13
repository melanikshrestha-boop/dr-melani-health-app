"""Unified autopilot — one rules engine for gaps, nudges, and reminders."""

from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from typing import Any

from . import nutrition, screening, symptoms, supplements
from . import sleep as sleep_mod
from .db import get_conn, today, water_total_ml
from .nutrition_goals import get_goals
from .paths import CONFIG_DIR, HEALTH_DATA

NUDGES_FILE = HEALTH_DATA / "jarvis" / "nudges.json"
STATE_FILE = CONFIG_DIR / "nudge_state.json"
WATER_GOAL_ML = 4000

MEAL_WINDOWS = (
    ("breakfast", 8, 11, "Log breakfast"),
    ("snack_am", 10, 12, "Log morning snack"),
    ("lunch", 12, 16, "Log lunch"),
    ("snack_pm", 15, 18, "Log afternoon snack"),
    ("dinner", 17, 22, "Log dinner"),
)


@dataclass
class GapItem:
    kind: str
    label: str
    detail: str
    action: str
    priority: int


def _meal_slots_logged(day: str | None = None) -> set[str]:
    day = day or today()
    return {m["slot"] for m in nutrition.get_meals(day)}


def collect_gaps(now: datetime | None = None) -> list[GapItem]:
    """Open tracking items for today — single source of truth."""
    now = now or datetime.now()
    day = today()
    hour = now.hour
    gaps: list[GapItem] = []

    sleep = sleep_mod.get_sleep(day)
    if not sleep or not sleep.get("sleep_hours"):
        gaps.append(GapItem("sleep", "Log sleep", "Bedtime + wake below", "/", 1))

    bf = symptoms.get_brain_fog(day)
    if not bf:
        gaps.append(GapItem("brain_fog", "Log brain fog", "Yes or no with sleep form", "/", 2))

    bm = symptoms.get_bowel_movement(day)
    if not bm:
        gaps.append(GapItem("bowel", "Log 💩?", "Yes or no under water on Today", "/", 2))

    sup = supplements.today_status(day)
    if sup["total"] and not sup["all_taken"]:
        missing = [i["name"] for i in sup["items"] if not i["taken"]]
        gaps.append(
            GapItem(
                "supplements",
                "Log vitamins",
                ", ".join(missing[:3]),
                "/",
                2,
            )
        )

    logged_meals = _meal_slots_logged(day)
    for slot, start_h, end_h, label in MEAL_WINDOWS:
        if slot in logged_meals:
            continue
        if hour >= start_h:
            gaps.append(GapItem(slot, label, f"No {slot} logged yet", "/meals", 3))

    water_ml = water_total_ml(day)
    goals = get_goals()
    macros = nutrition.macro_dashboard(day)["current"]
    if water_ml < 2000:
        gaps.append(
            GapItem(
                "water",
                "Drink more water",
                f"{water_ml}/{WATER_GOAL_ML} ml logged",
                "/",
                4,
            )
        )
    if macros["protein_g"] < goals["protein_goal_g"] * 0.5 and macros["meals_logged"] < 2:
        gaps.append(
            GapItem(
                "protein",
                "Protein behind",
                f"{macros['protein_g']:.0f}g / {goals['protein_goal_g']}g goal",
                "/meals",
                5,
            )
        )

    gaps.sort(key=lambda g: g.priority)
    return gaps


def gaps_summary() -> list[str]:
    """Plain strings for Dr. Melani briefing."""
    return [f"{g.label.lower()} ({g.detail})" if g.detail else g.label.lower() for g in collect_gaps()]


def today_status() -> dict[str, Any]:
    """Structured status for Today tab banner."""
    gaps = collect_gaps()
    count = len(gaps)
    if count == 0:
        summary = "All caught up for today."
    elif count == 1:
        summary = f"1 thing left: {gaps[0].label.lower()}"
    else:
        summary = f"{count} things left today"
    return {
        "complete": count == 0,
        "count": count,
        "summary": summary,
        "gaps": [asdict(g) for g in gaps],
    }


def _load_json(path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return default


def _save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))


def _load_state() -> dict:
    return _load_json(STATE_FILE, {})


def _save_state(state: dict):
    _save_json(STATE_FILE, state)


def _telegram_sent_today(state: dict, kind: str) -> bool:
    day = today()
    sent = state.setdefault("telegram", {}).setdefault(day, [])
    return kind in sent


def _mark_telegram_sent(state: dict, kind: str):
    day = today()
    sent = state.setdefault("telegram", {}).setdefault(day, [])
    if kind not in sent:
        sent.append(kind)
    _save_state(state)


def _telegram_count_today(state: dict) -> int:
    return len(state.get("telegram", {}).get(today(), []))


def evening_summary_message() -> str:
    gaps = collect_gaps()
    if not gaps:
        return "Daily check-in: you're all caught up today. Nice work."
    lines = ["Daily check-in — still open:"]
    for g in gaps[:5]:
        lines.append(f"• {g.label}" + (f" ({g.detail})" if g.detail else ""))
    lines.append("Open Melani Health on your phone to finish.")
    return "\n".join(lines)


def pending_telegram_messages(cfg: dict, now: datetime | None = None) -> list[tuple[str, str]]:
    """Return (kind, message) pairs to send. Max 2 gap pings per day (screening is extra)."""
    now = now or datetime.now()
    hour = now.hour
    state = _load_state()
    out: list[tuple[str, str]] = []

    if state.get("screening_date") != today() and hour >= 9:
        msgs = screening.due_reminders(14)
        if msgs:
            out.append(("screening", "Screening reminders:\n" + "\n".join(msgs[:3])))
        state["screening_date"] = today()
        _save_state(state)
        if out:
            return out

    gap_pings = _telegram_count_today(state)
    if gap_pings >= 2:
        return out

    gaps = collect_gaps(now)
    gap_kinds = {g.kind for g in gaps}
    nudge_hour = int(cfg.get("nudge_hour", 20))

    if hour >= nudge_hour and not _telegram_sent_today(state, "evening"):
        out.append(("evening", evening_summary_message()))
    elif 8 <= hour < 10 and "sleep" in gap_kinds and not _telegram_sent_today(state, "morning"):
        out.append(("morning", "Good morning — log last night's sleep + brain fog when you can (30 sec on Today tab)."))
    elif hour >= 15 and "water" in gap_kinds and not _telegram_sent_today(state, "water"):
        w = water_total_ml()
        out.append(("water", f"Water check: {w}/{WATER_GOAL_ML} ml logged. Tap +500 ml on Today when you drink."))
    else:
        for slot, start_h, _end_h, label in MEAL_WINDOWS:
            if hour >= start_h + 1 and slot in gap_kinds and not _telegram_sent_today(state, f"meal_{slot}"):
                out.append((f"meal_{slot}", f"{label} — quick log on Meals tab keeps your macros accurate."))
                break

    return out


def mark_telegram_sent(kind: str):
    state = _load_state()
    _mark_telegram_sent(state, kind)
    _save_state(state)


def refresh_web_nudges(now: datetime | None = None):
    """In-app Dr. Melani nudges — brain fog, gaps, grocery tip."""
    now = now or datetime.now()
    today_str = today()
    nudges = _load_json(NUDGES_FILE, [])

    def kind_used_today(kind: str) -> bool:
        for n in nudges:
            if n.get("kind") == kind and (
                not n.get("answered") or n.get("created_at", "")[:10] == today_str
            ):
                return True
        return False

    bf = symptoms.get_brain_fog()
    streak = symptoms.consecutive_brain_fog_days()

    if streak >= 7 and not kind_used_today("brain_fog_week"):
        nudges.append({
            "id": str(uuid.uuid4())[:8],
            "kind": "brain_fog_week",
            "message": f"You've logged brain fog {streak} days in a row. Still feeling foggy today?",
            "yes_no": True,
            "created_at": now.isoformat(),
            "answered": False,
        })

    yesterday = (datetime.strptime(today_str, "%Y-%m-%d").date() - timedelta(days=1)).isoformat()
    y_bf = symptoms.get_brain_fog(yesterday)
    if y_bf and y_bf["yes"] and not bf and not kind_used_today("brain_fog_followup"):
        nudges.append({
            "id": str(uuid.uuid4())[:8],
            "kind": "brain_fog_followup",
            "message": "You had brain fog yesterday. How about today?",
            "yes_no": True,
            "created_at": now.isoformat(),
            "answered": False,
        })

    gaps = collect_gaps(now)
    if gaps and now.hour >= 12 and not kind_used_today("today_gaps"):
        labels = ", ".join(g.label.lower() for g in gaps[:4])
        nudges.append({
            "id": str(uuid.uuid4())[:8],
            "kind": "today_gaps",
            "message": f"Still open today: {labels}. Want help prioritizing?",
            "yes_no": False,
            "created_at": now.isoformat(),
            "answered": False,
        })

    if not kind_used_today("grocery_tip"):
        with get_conn() as conn:
            rows = conn.execute(
                "SELECT test FROM lab_values WHERE flag IS NOT NULL LIMIT 1"
            ).fetchall()
        if rows and now.hour >= 10:
            nudges.append({
                "id": str(uuid.uuid4())[:8],
                "kind": "grocery_tip",
                "message": (
                    f"Quick tip: your {rows[0]['test']} was flagged. "
                    "Ask me here for a Trader Joe's / Target pick."
                ),
                "yes_no": False,
                "created_at": now.isoformat(),
                "answered": False,
            })

    _save_json(NUDGES_FILE, nudges[-20:])
