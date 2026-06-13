"""Period flow tracker — log flow, predict next cycle, phase education."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta

from .db import get_conn, today
from .paths import HEALTH_DATA

CYCLE_DIR = HEALTH_DATA / "cycle"
SETTINGS_FILE = CYCLE_DIR / "settings.json"

FLOW_LEVELS = ("none", "spotting", "light", "medium", "heavy")
DEFAULT_CYCLE_LENGTH = 28
DEFAULT_PERIOD_LENGTH = 3
# Estimated short period early May — user said she doesn't know exact dates.
SEED_PERIOD_START = "2026-05-02"
SEED_FLOW = (
    ("2026-05-02", "medium", 1),
    ("2026-05-03", "medium", 2),
    ("2026-05-04", "light", 3),
)

PHASE_CONTENT = {
    "period": {
        "label": "Period",
        "title": "Period (menstrual phase)",
        "body": (
            "Your uterus sheds its lining. Blood and tissue leave through the vagina — "
            "this is your period. A short period (2–4 days) is common, especially when you're young."
        ),
        "symptoms": [
            "Cramps or achy lower belly",
            "Tiredness, headaches, or back ache",
            "Mood shifts — irritable or emotional",
            "Breast tenderness",
            "Heavier or lighter flow on different days",
        ],
        "tip": "Rest, hydrate, and use heat for cramps. Tell Dr. Ververis if pain is severe or flow is very heavy.",
        "eat": "Iron-rich foods (spinach, lentils, lean beef), warm easy meals, ginger tea. Don't skip meals — blood sugar swings feel worse on your period.",
    },
    "follicular": {
        "label": "Follicular",
        "title": "Follicular phase",
        "body": (
            "After your period, estrogen rises and an egg matures in your ovary. "
            "Your body is building energy for a possible pregnancy — many people feel clearer and more upbeat here."
        ),
        "symptoms": [
            "Energy often comes back after your period",
            "Skin may look clearer",
            "Increased interest in exercise or social stuff",
            "Cervical mucus may become clearer or stretchy later in this phase",
            "Libido can increase as ovulation approaches",
        ],
        "tip": "Good time for harder workouts if you feel up to it — listen to your body.",
        "eat": "Lean protein (eggs, chicken, Greek yogurt), oats, colorful veggies. Your protein goal (125g) matters most — this phase is often when energy is best for hitting it.",
    },
    "ovulation": {
        "label": "Ovulation",
        "title": "Ovulation window",
        "body": (
            "An ovary releases an egg — this is ovulation. It usually happens once per cycle, "
            "about 2 weeks before your next period. The fertile window is roughly 5 days "
            "(sperm can live a few days). This app estimates timing from your last period — not exact."
        ),
        "symptoms": [
            "Mild one-sided pelvic twinge (mittelschmerz) for some people",
            "Clear, stretchy discharge (like egg white)",
            "Slight rise in body temperature after ovulation",
            "Some feel extra energy or libido",
            "Breast tenderness for a day or two",
        ],
        "tip": "If you're tracking for health (not birth control), note how you feel — patterns help you learn your body.",
        "eat": "Protein + fiber at each meal, salmon or walnuts for omega-3s (your TG was flagged), berries and leafy greens. Stay hydrated.",
    },
    "luteal": {
        "label": "Luteal",
        "title": "Luteal phase",
        "body": (
            "After ovulation, progesterone rises to prepare the uterus. If the egg isn't fertilized, "
            "hormones drop later and your next period starts. PMS-like symptoms often show up here."
        ),
        "symptoms": [
            "Bloating or water retention",
            "Mood changes, anxiety, or sadness",
            "Food cravings (especially carbs or chocolate)",
            "Sore breasts",
            "Trouble sleeping or lower energy",
            "Brain fog can overlap — you already track this on Today",
        ],
        "tip": "Extra protein, sleep, and gentle movement can help. Your brain fog log helps spot cycle-linked patterns.",
        "eat": "Complex carbs (sweet potato, oats), magnesium-rich foods (almonds, pumpkin seeds), steady protein. Limit extra salt if you're bloated. Small chocolate is OK — watch sugar if cravings spike.",
    },
    "pre_period": {
        "label": "Pre-period",
        "title": "Pre-period (late luteal)",
        "body": (
            "Your body is about to start a new cycle. Hormones fall, and period symptoms often ramp up. "
            "Your next period may start within a few days."
        ),
        "symptoms": [
            "Cramps starting before bleeding",
            "Spotting for some people",
            "Strong PMS — mood swings, fatigue",
            "Acne flare for some",
            "Feeling 'off' or foggy without a clear reason",
        ],
        "tip": "If you're due soon, keep pads/tampons handy and log when bleeding actually starts.",
        "eat": "Easy-to-digest meals, hydration, iron if flow is coming. Ginger or peppermint tea for nausea. Keep protein up even if appetite is weird.",
    },
}

PHASE_ORDER = ("period", "follicular", "ovulation", "luteal", "pre_period")


def _load_settings() -> dict:
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {
        "last_period_start": SEED_PERIOD_START,
        "cycle_length_days": DEFAULT_CYCLE_LENGTH,
        "period_length_days": DEFAULT_PERIOD_LENGTH,
        "estimated": True,
        "note": "Estimated short period early May — tap when yours starts to improve predictions.",
    }


def _save_settings(data: dict):
    CYCLE_DIR.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(data, indent=2))


def ensure_seed():
    """Seed estimated May period if no cycle data yet."""
    with get_conn() as conn:
        row = conn.execute("SELECT COUNT(*) AS c FROM cycle_logs").fetchone()
        if row["c"] > 0:
            return
    settings = _load_settings()
    _save_settings(settings)
    with get_conn() as conn:
        for day, flow, cycle_day in SEED_FLOW:
            conn.execute(
                """INSERT INTO cycle_logs (day, event, flow, cycle_day, notes)
                   VALUES (?, 'flow', ?, ?, ?)""",
                (day, flow, cycle_day, "estimated seed"),
            )
        conn.execute(
            """INSERT INTO cycle_logs (day, event, flow, cycle_day, notes)
               VALUES (?, 'period_start', NULL, 1, ?)""",
            (SEED_PERIOD_START, "estimated start"),
        )
    _sync_day(SEED_PERIOD_START)


def get_settings() -> dict:
    ensure_seed()
    return _load_settings()


def save_settings(**updates) -> dict:
    data = get_settings()
    data.update(updates)
    if updates.get("last_period_start"):
        data["estimated"] = False
    _save_settings(data)
    return data


def log_flow(flow: str, day: str | None = None, notes: str = "") -> dict:
    day = day or today()
    flow = flow.lower().strip()
    if flow not in FLOW_LEVELS:
        flow = "none"
    settings = get_settings()
    start = date.fromisoformat(settings["last_period_start"])
    d = date.fromisoformat(day)
    cycle_day = max(1, (d - start).days + 1) if d >= start else 1
    with get_conn() as conn:
        conn.execute("DELETE FROM cycle_logs WHERE day = ? AND event = 'flow'", (day,))
        conn.execute(
            """INSERT INTO cycle_logs (day, event, flow, cycle_day, notes)
               VALUES (?, 'flow', ?, ?, ?)""",
            (day, flow, cycle_day, notes),
        )
    entry = get_flow(day)
    _sync_day(day, entry)
    return entry


def start_period(day: str | None = None) -> dict:
    """Mark a new period start and log medium flow for that day."""
    day = day or today()
    settings = save_settings(last_period_start=day, estimated=False)
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO cycle_logs (day, event, flow, cycle_day, notes)
               VALUES (?, 'period_start', NULL, 1, 'logged')""",
            (day,),
        )
    log_flow("medium", day)
    overview = cycle_overview()
    overview["settings"] = settings
    return overview


def get_flow(day: str | None = None) -> dict | None:
    day = day or today()
    with get_conn() as conn:
        row = conn.execute(
            """SELECT day, flow, cycle_day, notes FROM cycle_logs
               WHERE day = ? AND event = 'flow' ORDER BY id DESC LIMIT 1""",
            (day,),
        ).fetchone()
    if not row:
        return None
    return {
        "day": row["day"],
        "flow": row["flow"],
        "cycle_day": row["cycle_day"],
        "notes": row["notes"],
    }


def _sync_day(day: str, entry: dict | None = None):
    CYCLE_DIR.mkdir(parents=True, exist_ok=True)
    entry = entry if entry is not None else get_flow(day)
    path = CYCLE_DIR / f"{day}.json"
    if entry:
        path.write_text(json.dumps(entry, indent=2))
    elif path.exists():
        path.unlink()


def _predicted_next_start(settings: dict) -> date:
    start = date.fromisoformat(settings["last_period_start"])
    return start + timedelta(days=int(settings.get("cycle_length_days", DEFAULT_CYCLE_LENGTH)))


def _ovulation_cycle_day(cycle_len: int, period_len: int) -> int:
    """Estimated peak ovulation (cycle day number). Luteal phase ~14 days."""
    return max(period_len + 2, cycle_len - 14)


def _phase_bounds(period_len: int, cycle_len: int) -> dict[str, tuple[int, int]]:
    ov = _ovulation_cycle_day(cycle_len, period_len)
    ov_start = max(period_len + 1, ov - 1)
    ov_end = min(cycle_len, ov + 1)
    pre_start = max(ov_end + 1, cycle_len - 4)
    return {
        "period": (1, period_len),
        "follicular": (period_len + 1, max(period_len + 1, ov_start - 1)),
        "ovulation": (ov_start, ov_end),
        "luteal": (ov_end + 1, max(ov_end, pre_start - 1)),
        "pre_period": (pre_start, cycle_len),
    }


def _phase_id(cycle_day: int, period_len: int, cycle_len: int) -> str:
    bounds = _phase_bounds(period_len, cycle_len)
    if cycle_day <= bounds["period"][1]:
        return "period"
    if cycle_day >= bounds["pre_period"][0]:
        return "pre_period"
    if bounds["ovulation"][0] <= cycle_day <= bounds["ovulation"][1]:
        return "ovulation"
    if cycle_day <= bounds["follicular"][1]:
        return "follicular"
    return "luteal"


def _phase_label(cycle_day: int, period_len: int, cycle_len: int) -> str:
    return PHASE_CONTENT[_phase_id(cycle_day, period_len, cycle_len)]["label"]


def _phase_when_text(phase_id: str, period_len: int, cycle_len: int) -> str:
    start, end = _phase_bounds(period_len, cycle_len)[phase_id]
    if start == end:
        return f"Usually around cycle day {start} (of ~{cycle_len})"
    return f"Usually cycle days {start}–{end} (of ~{cycle_len})"


def build_phase_guide(period_len: int, cycle_len: int, current_id: str) -> dict:
    ov_day = _ovulation_cycle_day(cycle_len, period_len)
    bounds = _phase_bounds(period_len, cycle_len)
    phases = []
    guide = {}
    for pid in PHASE_ORDER:
        start, end = bounds[pid]
        if start > cycle_len:
            continue
        end = min(end, cycle_len)
        content = PHASE_CONTENT[pid]
        when = _phase_when_text(pid, period_len, cycle_len)
        entry = {
            "id": pid,
            "label": content["label"],
            "title": content["title"],
            "when": when,
            "body": content["body"],
            "symptoms": content["symptoms"],
            "tip": content["tip"],
            "eat": content.get("eat", ""),
            "day_start": start,
            "day_end": end,
            "current": pid == current_id,
        }
        phases.append({"id": pid, "label": content["label"], "current": pid == current_id})
        guide[pid] = entry
    return {
        "phases": phases,
        "guide": guide,
        "ovulation_cycle_day": ov_day,
    }


def _predicted_ovulation_date(settings: dict) -> date:
    start = date.fromisoformat(settings["last_period_start"])
    cycle_len = int(settings.get("cycle_length_days", DEFAULT_CYCLE_LENGTH))
    period_len = int(settings.get("period_length_days", DEFAULT_PERIOD_LENGTH))
    ov_day = _ovulation_cycle_day(cycle_len, period_len)
    return start + timedelta(days=ov_day - 1)


def cycle_overview(end_day: str | None = None) -> dict:
    settings = get_settings()
    end = date.fromisoformat(end_day or today())
    start = date.fromisoformat(settings["last_period_start"])
    cycle_len = int(settings.get("cycle_length_days", DEFAULT_CYCLE_LENGTH))
    period_len = int(settings.get("period_length_days", DEFAULT_PERIOD_LENGTH))
    predicted = _predicted_next_start(settings)
    predicted_ov = _predicted_ovulation_date(settings)
    cycle_day = max(1, (end - start).days + 1)
    days_until = (predicted - end).days
    phase_id = _phase_id(cycle_day, period_len, cycle_len)
    phase_info = build_phase_guide(period_len, cycle_len, phase_id)
    ov_start = phase_info["guide"]["ovulation"]["day_start"]
    ov_end = phase_info["guide"]["ovulation"]["day_end"]
    days_to_ovulation = (predicted_ov - end).days

    with get_conn() as conn:
        rows = conn.execute(
            """SELECT day, flow FROM cycle_logs
               WHERE event = 'flow' AND day >= ?
               ORDER BY day""",
            ((end - timedelta(days=34)).isoformat(),),
        ).fetchall()
    flow_by_day = {r["day"]: r["flow"] for r in rows}

    calendar = []
    cal_start = start
    cal_end = max(predicted, end)
    span = (cal_end - cal_start).days + 1
    span = max(span, 28)
    for i in range(span):
        d = cal_start + timedelta(days=i)
        if d > end + timedelta(days=7):
            break
        iso = d.isoformat()
        day_num = (d - start).days + 1
        day_phase = _phase_id(day_num, period_len, cycle_len) if day_num >= 1 else "follicular"
        calendar.append({
            "day": iso,
            "label": d.strftime("%d"),
            "weekday": d.strftime("%a")[:1],
            "flow": flow_by_day.get(iso),
            "is_today": iso == end.isoformat(),
            "is_period_start": iso == settings["last_period_start"],
            "is_predicted": iso == predicted.isoformat(),
            "is_ovulation": ov_start <= day_num <= ov_end,
            "phase_id": day_phase,
        })

    today_flow = get_flow(end.isoformat())
    if phase_id == "ovulation":
        status_line = f"Day {cycle_day} · {PHASE_CONTENT['ovulation']['label']} window (~{predicted_ov.strftime('%b %d')})"
    elif days_until < 0:
        status_line = f"Day {cycle_day} · period may start any time (estimated {predicted.strftime('%b %d')})"
    elif days_until == 0:
        status_line = f"Day {cycle_day} of ~{cycle_len} · period expected today"
    elif days_until == 1:
        status_line = f"Day {cycle_day} of ~{cycle_len} · period expected tomorrow"
    elif 0 < days_to_ovulation <= 3 and phase_id == "follicular":
        status_line = (
            f"Day {cycle_day} of ~{cycle_len} · ovulation likely in {days_to_ovulation} day"
            + ("s" if days_to_ovulation != 1 else "")
        )
    else:
        status_line = f"Day {cycle_day} of ~{cycle_len} · next period ~{predicted.strftime('%b %d')} ({days_until} days)"

    return {
        "settings": settings,
        "cycle_day": cycle_day,
        "cycle_length_days": cycle_len,
        "period_length_days": period_len,
        "last_period_start": settings["last_period_start"],
        "last_period_display": date.fromisoformat(settings["last_period_start"]).strftime("%b %d, %Y"),
        "predicted_next": predicted.isoformat(),
        "predicted_next_display": predicted.strftime("%b %d, %Y"),
        "predicted_ovulation": predicted_ov.isoformat(),
        "predicted_ovulation_display": predicted_ov.strftime("%b %d, %Y"),
        "days_until_ovulation": days_to_ovulation,
        "days_until_next": days_until,
        "phase": _phase_label(cycle_day, period_len, cycle_len),
        "phase_id": phase_id,
        "phases": phase_info["phases"],
        "phase_guide": phase_info["guide"],
        "phase_guide_json": json.dumps(phase_info["guide"]),
        "status_line": status_line,
        "estimated": bool(settings.get("estimated")),
        "note": settings.get("note", ""),
        "today_flow": today_flow["flow"] if today_flow else None,
        "calendar": calendar,
        "flow_levels": FLOW_LEVELS,
    }


def phase_eat_tip(phase_id: str | None = None) -> str:
    """One-line nutrition guidance for current or given cycle phase."""
    if not phase_id:
        phase_id = cycle_overview().get("phase_id", "follicular")
    content = PHASE_CONTENT.get(phase_id, {})
    return content.get("eat", "")


def context_block() -> str:
    o = cycle_overview()
    flow = o["today_flow"] or "not logged"
    est = " (estimated)" if o["estimated"] else ""
    ov = o.get("predicted_ovulation_display", "—")
    eat = phase_eat_tip(o.get("phase_id"))
    lines = [
        f"=== CYCLE ===",
        f"Last period start: {o['last_period_display']}{est}",
        f"Cycle day {o['cycle_day']} · phase: {o['phase']} ({o.get('phase_id', '')})",
        f"Predicted ovulation: {ov}",
        f"Next predicted period: {o['predicted_next_display']} ({o['days_until_next']} days)",
        f"Today's flow: {flow}",
    ]
    if eat:
        lines.append(f"Phase eating focus: {eat}")
    return "\n".join(lines)
