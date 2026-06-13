from __future__ import annotations

"""Nutrition: water, meals, macro totals."""

import json
import re
from datetime import date, datetime, timedelta

from .db import get_conn, today, water_total_ml
from .paths import HEALTH_DATA
from .nutrition_goals import get_goals
from .sleep import _week_start, week_key, week_start_from_key, week_range_label

MEAL_BEFORE_7PM_TYPE = "meal_before_7pm"
MEAL_7PM_DIR = HEALTH_DATA / "nutrition" / "meal_before_7pm"
MEAL_7PM_ROLLOVER_FILE = MEAL_7PM_DIR / "rollover_state.json"
MEAL_7PM_WEEKS_FILE = MEAL_7PM_DIR / "week_summaries.json"

WATER_GOAL_ML = 4000
MEAL_SLOTS = ("breakfast", "snack_am", "lunch", "snack_pm", "dinner")
MEAL_SLOT_LABELS = {
    "breakfast": "Breakfast",
    "snack_am": "Snack",
    "lunch": "Lunch",
    "snack_pm": "Snack",
    "dinner": "Dinner",
}
MEAL_BASE_LABELS = {
    "breakfast": "Breakfast",
    "snack": "Snack",
    "lunch": "Lunch",
    "dinner": "Dinner",
}
MEAL_SLOT_BASE = {
    "breakfast": "breakfast",
    "snack_am": "snack",
    "snack_pm": "snack",
    "snack": "snack",
    "lunch": "lunch",
    "dinner": "dinner",
}
_INDEXED_SLOT_RE = re.compile(r"^(breakfast|snack_am|snack_pm|snack|lunch|dinner)_(\d+)$")


def _slot_from_text(text: str = "") -> str:
    q = (text or "").lower()
    if "breakfast" in q:
        return "breakfast"
    if "lunch" in q or "brunch" in q:
        return "lunch"
    if "dinner" in q or "supper" in q:
        return "dinner"
    if "snack" in q:
        return "snack_am" if datetime.now().hour < 14 else "snack_pm"

    snack_hints = (
        "protein bar", "bar", "apple", "kiwi", "banana", "berries",
        "fruit", "yogurt", "shake", "smoothie",
    )
    if any(h in q for h in snack_hints):
        return "snack_am" if datetime.now().hour < 14 else "snack_pm"

    hour = datetime.now().hour
    if hour < 11:
        return "breakfast"
    if hour < 15:
        return "lunch"
    if hour < 18:
        return "snack_pm"
    return "dinner"


def infer_meal_slot(text: str = "", preferred_slot: str = "") -> str:
    preferred = (preferred_slot or "").strip().lower().replace(" ", "_")
    if preferred in MEAL_SLOTS:
        return preferred
    if preferred in ("snack", "snacks"):
        return "snack_am" if datetime.now().hour < 14 else "snack_pm"
    if preferred == "brunch":
        return "lunch"
    return _slot_from_text(text)


def _normalize_slot(slot: str = "", text: str = "") -> str:
    raw = (slot or "").strip().lower().replace(" ", "_")
    m = _INDEXED_SLOT_RE.match(raw)
    if m:
        base = infer_meal_slot("", m.group(1))
        idx = max(1, int(m.group(2)))
        return base if idx <= 1 else f"{base}_{idx}"
    return infer_meal_slot(text=text, preferred_slot=raw)


def _slot_base(slot: str) -> str:
    raw = (slot or "").strip().lower().replace(" ", "_")
    m = _INDEXED_SLOT_RE.match(raw)
    if m:
        raw = m.group(1)
    return MEAL_SLOT_BASE.get(raw, raw)


def _slot_index(slot: str) -> int:
    m = _INDEXED_SLOT_RE.match((slot or "").strip().lower().replace(" ", "_"))
    if not m:
        return 1
    return max(1, int(m.group(2)))


def _next_slot_key(conn, day: str, base_slot: str) -> str:
    rows = conn.execute(
        "SELECT slot FROM meals WHERE day = ? AND (slot = ? OR slot LIKE ?)",
        (day, base_slot, f"{base_slot}_%"),
    ).fetchall()
    if not rows:
        return base_slot
    indices = [1]
    for r in rows:
        slot = (r["slot"] or "").lower()
        if slot == base_slot:
            indices.append(1)
            continue
        m = re.match(rf"^{re.escape(base_slot)}_(\d+)$", slot)
        if m:
            indices.append(max(1, int(m.group(1))))
    next_idx = max(indices) + 1
    return f"{base_slot}_{next_idx}"


def slot_label(slot: str) -> str:
    base = _slot_base(slot)
    label = MEAL_BASE_LABELS.get(base, slot.replace("_", " ").title())
    idx = _slot_index(slot)
    return f"{label} #{idx}" if idx > 1 else label


def add_water(amount_ml: int, day: str | None = None) -> dict:
    day = day or today()
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO water_logs (day, amount_ml, logged_at) VALUES (?, ?, ?)",
            (day, amount_ml, datetime.now().isoformat()),
        )
    total = water_total_ml(day)
    _sync_water_file(day, total)
    return {"day": day, "added_ml": amount_ml, "total_ml": total, "goal_ml": WATER_GOAL_ML}


def undo_last_water(day: str | None = None) -> dict:
    day = day or today()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM water_logs WHERE day = ? ORDER BY id DESC LIMIT 1",
            (day,),
        ).fetchone()
        if row:
            conn.execute("DELETE FROM water_logs WHERE id = ?", (row["id"],))
    total = water_total_ml(day)
    _sync_water_file(day, total)
    return {"day": day, "total_ml": total, "goal_ml": WATER_GOAL_ML}


def reset_water(day: str | None = None) -> dict:
    day = day or today()
    with get_conn() as conn:
        conn.execute("DELETE FROM water_logs WHERE day = ?", (day,))
    _sync_water_file(day, 0)
    return {"day": day, "total_ml": 0, "goal_ml": WATER_GOAL_ML}


def _sync_water_file(day: str, total: int):
    path = HEALTH_DATA / "water" / f"{day}.json"
    path.write_text(json.dumps({"day": day, "total_ml": total, "goal_ml": WATER_GOAL_ML}, indent=2))


def save_meal(
    slot: str,
    name: str = "",
    calories: float | None = None,
    protein_g: float | None = None,
    carbs_g: float | None = None,
    fat_g: float | None = None,
    fiber_g: float | None = None,
    source: str = "manual",
    photo_path: str | None = None,
    day: str | None = None,
) -> dict:
    day = day or today()
    normalized_slot = _normalize_slot(slot, name)
    with get_conn() as conn:
        if _INDEXED_SLOT_RE.match(normalized_slot):
            exists = conn.execute(
                "SELECT 1 FROM meals WHERE day = ? AND slot = ?",
                (day, normalized_slot),
            ).fetchone()
            if exists:
                slot_key = _next_slot_key(conn, day, _slot_base(normalized_slot))
            else:
                slot_key = normalized_slot
        else:
            slot_key = _next_slot_key(conn, day, normalized_slot)
        conn.execute(
            """INSERT INTO meals (day, slot, name, calories, protein_g, carbs_g, fat_g, fiber_g, source, photo_path, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                day, slot_key, name, calories, protein_g, carbs_g, fat_g, fiber_g,
                source, photo_path, datetime.now().isoformat(),
            ),
        )
    totals = daily_macro_totals(day)
    _sync_meal_file(day, slot_key, name, calories, protein_g, carbs_g, fat_g, fiber_g, source)
    return {"day": day, "slot": slot_key, "slot_base": _slot_base(slot_key), "totals": totals}


def _sync_meal_file(day, slot, name, cal, prot, carbs, fat, fiber, source):
    path = HEALTH_DATA / "nutrition" / "meals" / f"{day}_{slot}.json"
    path.write_text(json.dumps({
        "day": day, "slot": slot, "name": name,
        "calories": cal, "protein_g": prot, "carbs_g": carbs, "fat_g": fat, "fiber_g": fiber,
        "source": source,
    }, indent=2))


def daily_macro_totals(day: str | None = None) -> dict:
    day = day or today()
    with get_conn() as conn:
        row = conn.execute(
            """SELECT COALESCE(SUM(calories),0) AS cal, COALESCE(SUM(protein_g),0) AS prot,
                      COALESCE(SUM(carbs_g),0) AS carbs, COALESCE(SUM(fat_g),0) AS fat,
                      COALESCE(SUM(fiber_g),0) AS fiber, COUNT(*) AS meals
               FROM meals WHERE day = ?""",
            (day,),
        ).fetchone()
    totals = {
        "day": day,
        "calories": row["cal"],
        "protein_g": row["prot"],
        "carbs_g": row["carbs"],
        "fat_g": row["fat"],
        "fiber_g": row["fiber"],
        "meals_logged": row["meals"],
    }
    path = HEALTH_DATA / "nutrition" / "daily_totals" / f"{day}.json"
    path.write_text(json.dumps(totals, indent=2))
    return totals


def macro_dashboard(day: str | None = None) -> dict:
    """Current intake vs daily goals for the meals ring UI."""
    totals = daily_macro_totals(day)
    goals = get_goals()

    def pct(current: float, goal: float) -> int:
        if not goal:
            return 0
        return min(100, int(round(100 * current / goal)))

    cal_g = float(goals.get("calorie_goal") or 2000)
    prot_g = float(goals.get("protein_goal_g") or 125)
    carb_g = float(goals.get("carbs_goal_g") or 200)
    fat_g = float(goals.get("fat_goal_g") or 65)
    fiber_g = float(goals.get("fiber_goal_g") or 30)

    cal_cur = float(totals.get("calories") or 0)
    prot_cur = float(totals.get("protein_g") or 0)
    carb_cur = float(totals.get("carbs_g") or 0)
    fat_cur = float(totals.get("fat_g") or 0)
    fiber_cur = float(totals.get("fiber_g") or 0)

    return {
        "goals": goals,
        "current": {
            "calories": cal_cur,
            "protein_g": prot_cur,
            "carbs_g": carb_cur,
            "fat_g": fat_cur,
            "fiber_g": fiber_cur,
            "meals_logged": totals.get("meals_logged", 0),
        },
        "remaining": {
            "calories": max(0, cal_g - cal_cur),
            "protein_g": max(0, prot_g - prot_cur),
            "carbs_g": max(0, carb_g - carb_cur),
            "fat_g": max(0, fat_g - fat_cur),
            "fiber_g": max(0, fiber_g - fiber_cur),
        },
        "pct": {
            "calories": pct(cal_cur, cal_g),
            "protein_g": pct(prot_cur, prot_g),
            "carbs_g": pct(carb_cur, carb_g),
            "fat_g": pct(fat_cur, fat_g),
            "fiber_g": pct(fiber_cur, fiber_g),
        },
    }


def get_meals(day: str | None = None) -> list:
    day = day or today()
    with get_conn() as conn:
        rows = [dict(r) for r in conn.execute(
            "SELECT * FROM meals WHERE day = ? ORDER BY created_at, id", (day,)
        ).fetchall()]
    counts: dict[str, int] = {}
    for r in rows:
        base = _slot_base(r.get("slot", ""))
        r["slot_base"] = base
        counts[base] = counts.get(base, 0) + 1

    seen: dict[str, int] = {}
    for r in rows:
        base = r.get("slot_base", "")
        seen[base] = seen.get(base, 0) + 1
        label = MEAL_BASE_LABELS.get(base, slot_label(r.get("slot", "")))
        if counts.get(base, 0) > 1:
            r["slot_label"] = f"{label} #{seen[base]}"
        else:
            r["slot_label"] = label
    return rows


def clear_meal(slot: str, day: str | None = None) -> dict:
    day = day or today()
    slot = (slot or "").lower().strip().replace(" ", "_")
    if not slot:
        return {"day": day, "slot": "", "removed": False, "totals": daily_macro_totals(day)}
    removed_slot = slot
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM meals WHERE day = ? AND slot = ?", (day, slot))
        removed = cur.rowcount > 0
        if not removed:
            base = _slot_base(slot)
            row = conn.execute(
                "SELECT slot FROM meals WHERE day = ? AND (slot = ? OR slot LIKE ?) ORDER BY created_at DESC, id DESC LIMIT 1",
                (day, base, f"{base}_%"),
            ).fetchone()
            if row:
                removed_slot = row["slot"]
                conn.execute("DELETE FROM meals WHERE day = ? AND slot = ?", (day, removed_slot))
                removed = True
    if removed:
        path = HEALTH_DATA / "nutrition" / "meals" / f"{day}_{removed_slot}.json"
        if path.exists():
            path.unlink()
    totals = daily_macro_totals(day)
    return {"day": day, "slot": removed_slot, "removed": removed, "totals": totals}


def undo_last_meal(day: str | None = None) -> dict:
    day = day or today()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT slot FROM meals WHERE day = ? ORDER BY created_at DESC, id DESC LIMIT 1",
            (day,),
        ).fetchone()
    if not row:
        return {
            "day": day,
            "slot": None,
            "removed": False,
            "totals": daily_macro_totals(day),
        }
    return clear_meal(row["slot"], day)


def log_meal_before_7pm(yes: bool, day: str | None = None) -> dict:
    day = day or today()
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM symptoms WHERE day = ? AND type = ?",
            (day, MEAL_BEFORE_7PM_TYPE),
        )
        conn.execute(
            """INSERT INTO symptoms (day, type, severity, notes, logged_at)
               VALUES (?, ?, ?, ?, ?)""",
            (
                day,
                MEAL_BEFORE_7PM_TYPE,
                1 if yes else 0,
                "yes" if yes else "no",
                datetime.now().isoformat(),
            ),
        )
    entry = get_meal_before_7pm(day)
    _sync_meal_before_7pm(day, entry)
    return entry


def get_meal_before_7pm(day: str | None = None) -> dict | None:
    day = day or today()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT day, severity, notes, logged_at FROM symptoms WHERE day = ? AND type = ?",
            (day, MEAL_BEFORE_7PM_TYPE),
        ).fetchone()
    if not row:
        return None
    return {
        "day": row["day"],
        "yes": bool(row["severity"]),
        "logged_at": row["logged_at"],
    }


def _meal_7pm_day_row(iso: str, yes_val: bool | None) -> dict:
    d = date.fromisoformat(iso)
    if yes_val is None:
        answer = "—"
    elif yes_val:
        answer = "Yes"
    else:
        answer = "No"
    date_label = d.strftime("%a · %b %d")
    return {
        "day": iso,
        "label": d.strftime("%a"),
        "date_label": date_label,
        "yes": yes_val,
        "answer": answer,
        "detail": f"{date_label}: {answer}",
    }


def week_meal_before_7pm_data(week: str | None = None) -> dict:
    if week:
        start = week_start_from_key(week)
        wk = week_key(start)
    else:
        start = _week_start(date.today())
        wk = week_key(start)

    days = []
    yes_count = 0
    no_count = 0
    for i in range(7):
        d = start + timedelta(days=i)
        iso = d.isoformat()
        entry = get_meal_before_7pm(iso)
        yes_val = entry["yes"] if entry else None
        if yes_val is True:
            yes_count += 1
        elif yes_val is False:
            no_count += 1
        days.append(_meal_7pm_day_row(iso, yes_val))

    logged = yes_count + no_count
    end = start + timedelta(days=6)
    return {
        "week": wk,
        "week_label": week_range_label(start),
        "date_range": f"{start.strftime('%b %d')} to {end.strftime('%b %d')}",
        "days": days,
        "yes_count": yes_count,
        "no_count": no_count,
        "logged_count": logged,
        "notes": format_meal_before_7pm_notes(days),
    }


def format_meal_before_7pm_notes(days: list[dict]) -> str:
    lines = []
    for d in days:
        if d.get("yes") is not None:
            lines.append(d.get("detail") or f"{d.get('day')}: {d.get('answer')}")
    return "\n".join(lines)


def _load_meal_7pm_rollover_state() -> dict:
    MEAL_7PM_DIR.mkdir(parents=True, exist_ok=True)
    if not MEAL_7PM_ROLLOVER_FILE.exists():
        return {}
    try:
        return json.loads(MEAL_7PM_ROLLOVER_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def _save_meal_7pm_rollover_state(state: dict):
    MEAL_7PM_DIR.mkdir(parents=True, exist_ok=True)
    MEAL_7PM_ROLLOVER_FILE.write_text(json.dumps(state, indent=2))


def _append_meal_7pm_week_summary(summary: dict):
    MEAL_7PM_DIR.mkdir(parents=True, exist_ok=True)
    summaries = list_meal_before_7pm_week_summaries(limit=52)
    summaries = [s for s in summaries if s.get("week") != summary.get("week")]
    summaries.append(summary)
    summaries.sort(key=lambda s: s.get("week") or "")
    MEAL_7PM_WEEKS_FILE.write_text(json.dumps(summaries, indent=2))


def list_meal_before_7pm_week_summaries(limit: int = 12) -> list[dict]:
    if not MEAL_7PM_WEEKS_FILE.exists():
        return []
    try:
        summaries = json.loads(MEAL_7PM_WEEKS_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return []
    return summaries[-limit:]


def _wipe_meal_before_7pm_week(week: str) -> None:
    data = week_meal_before_7pm_data(week)
    with get_conn() as conn:
        for d in data["days"]:
            conn.execute(
                "DELETE FROM symptoms WHERE day = ? AND type = ?",
                (d["day"], MEAL_BEFORE_7PM_TYPE),
            )
            path = HEALTH_DATA / "nutrition" / f"meal_before_7pm_{d['day']}.json"
            if path.exists():
                path.unlink()


def _summarize_meal_before_7pm_week(week: str) -> dict:
    data = week_meal_before_7pm_data(week)
    yes_count = sum(1 for d in data["days"] if d["yes"] is True)
    no_count = sum(1 for d in data["days"] if d["yes"] is False)
    logged = yes_count + no_count
    return {
        "week": week,
        "week_label": data["week_label"],
        "yes_count": yes_count,
        "no_count": no_count,
        "logged_days": logged,
        "days": data["days"],
        "notes": data["notes"],
        "closed_at": datetime.now().isoformat(),
    }


def maybe_rollover_meal_before_7pm_week() -> dict | None:
    """On a new calendar week, archive last week's yes/no log and wipe daily rows."""
    current_wk = week_key(date.today())
    state = _load_meal_7pm_rollover_state()
    last_wk = state.get("last_rollover_week")

    if last_wk == current_wk:
        return state.get("pending_summary")

    summary = None
    if last_wk:
        summary = _summarize_meal_before_7pm_week(last_wk)
        _wipe_meal_before_7pm_week(last_wk)
        _append_meal_7pm_week_summary(summary)

    state["last_rollover_week"] = current_wk
    state["pending_summary"] = summary
    _save_meal_7pm_rollover_state(state)
    return summary


def last_closed_meal_before_7pm_week() -> dict | None:
    state = _load_meal_7pm_rollover_state()
    return state.get("pending_summary")


def meal_before_7pm_context_block() -> str:
    current = week_meal_before_7pm_data()
    lines = [
        "=== LAST MEAL BEFORE 7 P.M. ===",
        f"This week ({current['week_label']}): {current['yes_count']} yes · {current['no_count']} no · "
        f"{current['logged_count']} logged",
    ]
    for d in current["days"]:
        if d["yes"] is not None:
            lines.append(f"  {d['detail']}")

    closed = last_closed_meal_before_7pm_week()
    if closed and closed.get("notes"):
        lines.append(f"Last closed week ({closed.get('week_label', '?')}):")
        for ln in closed["notes"].splitlines():
            lines.append(f"  {ln}")

    older = list_meal_before_7pm_week_summaries(limit=4)
    if older:
        lines.append("Prior weeks on file:")
        for s in reversed(older[-3:]):
            if closed and s.get("week") == closed.get("week"):
                continue
            lines.append(
                f"  {s.get('week_label', s.get('week'))}: {s.get('yes_count', 0)} yes · "
                f"{s.get('no_count', 0)} no"
            )
            if s.get("notes"):
                for ln in s["notes"].splitlines()[:7]:
                    lines.append(f"    {ln}")
    return "\n".join(lines)


def _sync_meal_before_7pm(day: str, entry: dict | None):
    path = HEALTH_DATA / "nutrition" / f"meal_before_7pm_{day}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    if entry:
        path.write_text(json.dumps(entry, indent=2))
    elif path.exists():
        path.unlink()


def save_checkin(
    sleep_hours=None, sleep_quality=None, bedtime=None, wake_time=None,
    mood=None, energy=None, stress=None, notes=None, day: str | None = None,
):
    day = day or today()
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO daily_checkins (day, bedtime, wake_time, sleep_hours, sleep_quality,
               mood, energy, stress, notes, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(day) DO UPDATE SET
                 bedtime=excluded.bedtime, wake_time=excluded.wake_time,
                 sleep_hours=excluded.sleep_hours, sleep_quality=excluded.sleep_quality,
                 mood=excluded.mood, energy=excluded.energy, stress=excluded.stress,
                 notes=excluded.notes, updated_at=excluded.updated_at""",
            (
                day, bedtime, wake_time, sleep_hours, sleep_quality,
                mood, energy, stress, notes, datetime.now().isoformat(),
            ),
        )
    data = get_checkin(day)
    (HEALTH_DATA / "daily" / f"{day}.json").write_text(json.dumps(data, indent=2))
    return data


def get_checkin(day: str | None = None) -> dict:
    day = day or today()
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM daily_checkins WHERE day = ?", (day,)).fetchone()
    return dict(row) if row else {"day": day}


def today_summary(day: str | None = None) -> dict:
    day = day or today()
    from .sleep import get_sleep
    return {
        "day": day,
        "sleep": get_sleep(day),
        "checkin": get_checkin(day),
        "water_ml": water_total_ml(day),
        "water_goal_ml": WATER_GOAL_ML,
        "meals": get_meals(day),
        "macros": daily_macro_totals(day),
    }


def macro_history(days: int = 30) -> dict:
    """Per-day macro totals + the foods eaten each day, over a window of N days.

    Powers the collapsible food/macro history table + trend chart so Melani can
    review longer periods. Reads straight from the meals table (already logged
    every day) — no extra storage needed.
    """
    days = max(1, int(days or 30))
    end = date.fromisoformat(today())
    start = end - timedelta(days=days - 1)
    start_iso = start.isoformat()

    with get_conn() as conn:
        total_rows = conn.execute(
            """SELECT day,
                      COALESCE(SUM(calories),0) AS cal,
                      COALESCE(SUM(protein_g),0) AS prot,
                      COALESCE(SUM(carbs_g),0) AS carbs,
                      COALESCE(SUM(fat_g),0) AS fat,
                      COALESCE(SUM(fiber_g),0) AS fiber,
                      COUNT(*) AS meals
               FROM meals WHERE day >= ? GROUP BY day""",
            (start_iso,),
        ).fetchall()
        meal_rows = conn.execute(
            """SELECT day, slot, name, calories, protein_g
               FROM meals WHERE day >= ? ORDER BY day, created_at, id""",
            (start_iso,),
        ).fetchall()

    totals_by_day = {r["day"]: dict(r) for r in total_rows}
    foods_by_day: dict[str, list] = {}
    for m in meal_rows:
        foods_by_day.setdefault(m["day"], []).append({
            "name": m["name"] or "—",
            "slot": _slot_base(m["slot"] or ""),
            "calories": round(float(m["calories"] or 0)),
            "protein_g": round(float(m["protein_g"] or 0)),
        })

    goals = get_goals()
    out_days: list[dict] = []
    sums = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0, "fiber_g": 0.0}
    logged_days = 0

    d = start
    while d <= end:
        iso = d.isoformat()
        t = totals_by_day.get(iso) or {}
        meals_n = int(t.get("meals") or 0)
        cal = round(float(t.get("cal") or 0))
        prot = round(float(t.get("prot") or 0))
        carbs = round(float(t.get("carbs") or 0))
        fat = round(float(t.get("fat") or 0))
        fiber = round(float(t.get("fiber") or 0))
        if meals_n:
            logged_days += 1
            sums["calories"] += cal
            sums["protein_g"] += prot
            sums["carbs_g"] += carbs
            sums["fat_g"] += fat
            sums["fiber_g"] += fiber
        out_days.append({
            "day": iso,
            "label": d.strftime("%a"),
            "date_label": d.strftime("%b %d"),
            "calories": cal,
            "protein_g": prot,
            "carbs_g": carbs,
            "fat_g": fat,
            "fiber_g": fiber,
            "meals": meals_n,
            "foods": foods_by_day.get(iso, []),
        })
        d += timedelta(days=1)

    averages = {}
    if logged_days:
        averages = {k: round(v / logged_days) for k, v in sums.items()}

    return {
        "range_days": days,
        "start": start_iso,
        "end": end.isoformat(),
        "logged_days": logged_days,
        "days": out_days,
        "averages": averages,
        "goals": {
            "calories": goals.get("calorie_goal"),
            "protein_g": goals.get("protein_goal_g"),
            "carbs_g": goals.get("carbs_goal_g"),
            "fat_g": goals.get("fat_goal_g"),
            "fiber_g": goals.get("fiber_goal_g"),
        },
    }
