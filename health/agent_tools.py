"""Health query helpers for agent tools."""

from .db import get_conn
from .screening import list_screening, due_reminders
from .nutrition import today_summary, MEAL_SLOTS


def all_lab_draws() -> list:
    with get_conn() as conn:
        draws = conn.execute("SELECT * FROM lab_draws ORDER BY collected DESC").fetchall()
        out = []
        for d in draws:
            vals = conn.execute(
                "SELECT * FROM lab_values WHERE draw_id = ? ORDER BY test", (d["id"],)
            ).fetchall()
            out.append({**dict(d), "values": [dict(v) for v in vals]})
        return out


def lab_summary_text() -> str:
    draws = all_lab_draws()
    if not draws:
        return "No labs in database."
    lines = []
    for d in draws[:4]:
        lines.append(f"\n{d['collected'][:10]} — {d['lab']} ({d['id']})")
        for v in d["values"]:
            flag = f" [{v['flag']}]" if v.get("flag") else ""
            unit = v.get("unit") or ""
            lines.append(f"  {v['test']}: {v['result'] or v['result_text']} {unit}{flag}")
    return "\n".join(lines)


def health_status_text() -> str:
    s = today_summary()
    sleep = s.get("sleep") or {}
    lines = [
        f"Today {s['day']}:",
        f"  Water: {s['water_ml']}/{s['water_goal_ml']} ml",
        f"  Meals logged: {s['macros']['meals_logged']}/{len(MEAL_SLOTS)}",
        f"  Macros: {s['macros']['calories']:.0f} cal, {s['macros']['protein_g']:.0f}g protein",
    ]
    if sleep.get("sleep_hours"):
        lines.append(f"  Sleep: {sleep['sleep_hours']}h ({sleep.get('bedtime')} → {sleep.get('wake_time')})")
    reminders = due_reminders(30)
    if reminders:
        lines.append("Upcoming tests:")
        lines.extend(f"  {r}" for r in reminders[:5])
    return "\n".join(lines)


def run_health_tool(name: str, args: dict) -> str:
    from .grocery import add_item, suggest_groceries, list_items
    from .nutrition import add_water, save_meal, save_checkin
    from .workouts import log_workout

    if name == "health_query":
        q = args.get("query", "").lower()
        if "lab" in q or "ldl" in q or "cholesterol" in q:
            return lab_summary_text()
        if "due" in q or "test" in q or "screen" in q:
            return "\n".join(due_reminders(60)) or "No tests due in next 60 days."
        return health_status_text()

    if name == "health_screening_due":
        items = list_screening()
        return "\n".join(
            f"{i['status'].upper()}: {i['test_name']} due {i['next_due']} ({i['days_until']}d) — {i['reason']}"
            for i in items
        )

    if name == "health_lab_summary":
        return lab_summary_text()

    if name == "water_log":
        ml = int(args.get("amount_ml", 250))
        r = add_water(ml)
        return f"Water: {r['total_ml']}/{r['goal_ml']} ml"

    if name == "grocery_add":
        return str(add_item(args.get("name", "item"), added_by="telegram"))

    if name == "grocery_suggest":
        snap = suggest_groceries()
        names = [a.get("name") for a in snap.get("added", [])]
        return f"Added to list: {', '.join(names)}. Not medical advice."

    if name == "health_checkin":
        from .sleep import save_sleep
        save_sleep(
            bedtime=args.get("bedtime", ""),
            wake_time=args.get("wake_time", ""),
            notes=args.get("notes"),
        )
        return health_status_text()

    if name == "workout_log":
        log_workout(args.get("type", "workout"), args.get("duration_min"), args.get("notes", ""))
        return "Workout logged."

    if name == "health_auto_log":
        from .jarvis_actions import process_log_message
        msg = args.get("message") or args.get("text") or ""
        r = process_log_message(msg)
        if r.get("has_logs"):
            return r["summary"]
        return "I didn't find anything to log in that message."

    return f"Unknown health tool: {name}"
