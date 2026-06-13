"""Aggregate all Melani Health sections for Dr. Melani context."""

from __future__ import annotations

from datetime import date, timedelta

from .agent_tools import health_status_text, lab_summary_text, all_lab_draws
from . import symptoms
from . import screening
from . import grocery
from . import meal_presets
from . import vitals
from . import sleep as sleep_mod
from . import gym_plans
from . import workouts
from .db import get_conn, today
from .profile import jarvis_context, data_stats
from . import meal_presets
from .nutrition_goals import get_goals
from . import nutrition
from . import meal_planner
from . import supplements
from . import derm_hygiene
from .lab_glossary import normalize_lab_value, compute_status_badge, GLOSSARY


def flagged_labs_summary() -> str:
    """Latest draw — flagged tests with OK/HIGH/LOW and plain English."""
    draws = all_lab_draws()
    if not draws:
        return "No labs on file."
    latest = draws[0]
    collected = (latest.get("collected") or "")[:10]
    lines = [f"Latest draw: {collected} ({latest.get('lab', 'lab')})"]
    flagged = []
    ok_count = 0
    for v in latest.get("values", []):
        nv = normalize_lab_value(dict(v))
        badge = compute_status_badge(nv)
        test = nv.get("test", "?")
        result = nv.get("result") or nv.get("result_text") or "?"
        unit = nv.get("unit") or ""
        if badge in ("HIGH", "LOW"):
            info = GLOSSARY.get(test, {})
            why = info.get("high_means" if badge == "HIGH" else "low_means", "")
            flagged.append(
                f"  {test}: {result} {unit} [{badge}] — {why[:100]}" if why
                else f"  {test}: {result} {unit} [{badge}]"
            )
        else:
            ok_count += 1
    if flagged:
        lines.append("Flagged (watch these):")
        lines.extend(flagged)
    else:
        lines.append("No flagged values on latest draw.")
    lines.append(f"Other tests on this draw: {ok_count} within range.")
    return "\n".join(lines)


def recent_meals_block(day: str | None = None) -> str:
    day = day or today()
    meals = nutrition.get_meals(day)
    if not meals:
        return f"=== MEALS ({day}) ===\nNone logged yet today."
    lines = [f"=== MEALS ({day}) ==="]
    for m in meals:
        slot = m.get("slot", "?")
        name = m.get("name") or "meal"
        cal = m.get("calories")
        prot = m.get("protein_g")
        extra = []
        if cal:
            extra.append(f"{cal:.0f} cal")
        if prot:
            extra.append(f"{prot:.0f}g protein")
        detail = f" ({', '.join(extra)})" if extra else ""
        lines.append(f"  {nutrition.slot_label(slot)}: {name}{detail}")
    return "\n".join(lines)


def sleep_week_block() -> str:
    chart = sleep_mod.week_chart_data()
    lines = [f"=== SLEEP ({chart['week_label']}) ==="]
    for label, day, val in zip(chart["labels"], chart["days"], chart["values"]):
        if val is not None:
            lines.append(f"  {day} ({label}): {val} h")
        else:
            lines.append(f"  {day} ({label}): not logged")
    return "\n".join(lines)


def gym_today_block() -> str:
    key = gym_plans.today_day_key()
    display = gym_plans.day_workout_display(key)
    plan = gym_plans.get_plan(key)
    done = sum(1 for s in plan.get("sections", []) for i in s.get("items", []) if i.get("checked"))
    total = sum(len(s.get("items", [])) for s in plan.get("sections", []))
    lines = ["=== GYM TODAY ==="]
    if display.get("workout_type"):
        lines.append(f"Assigned today: {display['emoji']} {display['label']}")
    else:
        lines.append(f"Plan file: {plan.get('title', key)}")
    lines.append(f"Progress: {done}/{total} exercises checked")
    lines.append(gym_plans.week_plan_summary())
    return "\n".join(lines)


def workout_recent_block(limit: int = 5) -> str:
    sessions = workouts.list_workouts(limit=limit)
    if not sessions:
        return "=== RECENT WORKOUTS ===\nNone logged in SQLite."
    lines = ["=== RECENT WORKOUTS ==="]
    for s in sessions[:limit]:
        dur = f", {s['duration_min']} min" if s.get("duration_min") else ""
        lines.append(f"  {s.get('day', '?')}: {s.get('type', 'workout')}{dur}")
    return "\n".join(lines)


def full_data_context() -> str:
    """Everything Dr. Melani can read from the app."""
    parts = [
        "=== HER PROFILE ===",
        jarvis_context(),
        "",
        f"=== TODAY ({today()}) ===",
        health_status_text(),
        "",
        "=== FLAGGED LABS (interpreted) ===",
        flagged_labs_summary(),
        "",
        "=== LABS (full history) ===",
        lab_summary_text(),
        "",
        _brain_fog_block(),
        "",
        _bowel_block(),
        "",
        _sleep_block(),
        "",
        sleep_week_block(),
        "",
        _weight_block(),
        "",
        _nutrition_goals_block(),
        "",
        meal_presets.context_block(),
        "",
        meal_planner.context_block(),
        "",
        nutrition.meal_before_7pm_context_block(),
        "",
        supplements.context_block(),
        derm_hygiene.context_block(),
        "",
        recent_meals_block(),
        "",
        gym_today_block(),
        "",
        workout_recent_block(),
        "",
        "=== SCREENING / UPCOMING TESTS ===",
        _screening_block(),
        "",
        "=== GROCERY LIST ===",
        _grocery_block(),
    ]
    return "\n".join(parts)


def _brain_fog_block() -> str:
    bf = symptoms.get_brain_fog()
    week = symptoms.week_brain_fog_data()
    verdict = symptoms.last_week_verdict()
    lines = ["=== BRAIN FOG ==="]
    if verdict:
        lines.append(f"Last week summary: {verdict.get('display', '')}")
    lines.append(
        f"Today: {'yes' if bf and bf['yes'] else 'no' if bf else 'not logged yet'}"
    )
    lines.append(f"This week yes-days: {week['yes_count']} of 7")
    streak = symptoms.consecutive_brain_fog_days()
    if streak:
        lines.append(f"Current yes streak this week: {streak} day(s)")
    return "\n".join(lines)


def _bowel_block() -> str:
    bm = symptoms.get_bowel_movement()
    week = symptoms.week_bowel_data()
    lines = ["=== BOWEL MOVEMENT (daily) ==="]
    lines.append(
        f"Today: {'yes — went' if bm and bm['yes'] else 'no — did not go' if bm and bm['yes'] is False else 'not logged yet'}"
    )
    if bm and bm.get("has_note"):
        lines.append("Today: private note on file (text withheld from app UI — see private notes below).")
    lines.append(f"This week went: {week['yes_count']} of 7 days")
    missed = 7 - week["yes_count"]
    if week["logged_count"] >= 3 and week["yes_count"] <= 2:
        lines.append("Pattern: several no-go days this week — note for GI/fiber/hydration context.")
    private = symptoms.bowel_private_context_for_week()
    if private:
        lines.append("")
        lines.append(private)
    memory = symptoms.bowel_memory_context(max_weeks=6)
    if memory:
        lines.append("")
        lines.append(memory)
    return "\n".join(lines)


def _sleep_block() -> str:
    s = sleep_mod.get_sleep()
    if not s or not s.get("sleep_hours"):
        return "=== SLEEP (last night) ===\nNot logged today yet."
    return (
        f"=== SLEEP (last night) ===\n"
        f"{s.get('sleep_hours')} h ({s.get('bedtime', '?')} → {s.get('wake_time', '?')})"
    )


def _weight_block() -> str:
    w = vitals.get_latest_weight()
    delta = vitals.weight_change()
    if not w:
        return "=== WEIGHT ===\nNot logged recently."
    line = f"Latest: {w['value']} {w['unit']} on {w.get('day', '?')}"
    if delta is not None:
        line += f" ({delta:+.1f} vs prior log)"
    return f"=== WEIGHT ===\n{line}"


def _nutrition_goals_block() -> str:
    goals = get_goals()
    m = nutrition.macro_dashboard()["current"]
    return (
        f"=== NUTRITION GOALS ===\n"
        f"Target: ~{goals['calorie_goal']} cal/day, {goals['protein_goal_g']}g protein/day.\n"
        f"Logged today: {m['calories']:.0f} cal, {m['protein_g']:.0f}g protein, "
        f"{m['meals_logged']} meals."
    )


def _screening_block() -> str:
    items = screening.list_screening()
    if not items:
        return "No screening schedule loaded."
    lines = []
    for i in items[:8]:
        lines.append(
            f"  {i['test_name']}: due {i['next_due']} ({i['status']}) — {i.get('reason', '')[:80]}"
        )
    return "\n".join(lines)


def _grocery_block() -> str:
    items = grocery.list_items(checked_only=False)
    unchecked = [i["name"] for i in items if not i.get("checked")][:12]
    lines = [grocery.pantry_context_block()]
    if unchecked:
        lines.append("Shopping list (to buy): " + ", ".join(unchecked))
    return "\n".join(lines)


def today_gaps() -> list[str]:
    """What's missing from today's log — for briefing."""
    from .autopilot import gaps_summary

    return gaps_summary()
