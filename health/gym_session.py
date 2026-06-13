from __future__ import annotations

"""Parse workout items into set rows + exercise help links."""

import re
from datetime import datetime
from urllib.parse import quote_plus

ROMAN = ("I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X")

from .gym_plans import DAYS
from .gym_gifs import get_demo_gif, google_gif_search_url

DAY_KEYS = [d[0] for d in DAYS]

FORM_TIPS: dict[str, str] = {
    "hip thrust": "Feet flat, chin tucked, drive through heels. Pause 1–2 sec at top. Don't hyperextend lower back.",
    "bulgarian split squat": "Front knee tracks over toes, torso slightly forward, slow on the way down.",
    "rdl": "Soft knees, hinge at hips, bar close to legs. Feel stretch in hamstrings — not lower back.",
    "sumo squat": "Wide stance, toes out, knees push over toes. Keep chest up.",
    "lat pulldown": "Pull to upper chest, squeeze shoulder blades, control the return.",
    "hanging leg raise": "Minimize swinging, exhale as legs rise, slow eccentric.",
    "plank": "Ribs down, glutes engaged, neutral neck. Breathe steady.",
    "barbell bench": "Retract shoulder blades, feet planted, bar path to lower chest.",
    "barbell row": "Hinge ~45°, pull to lower ribs, don't jerk the weight.",
}

DIRECT_VIDEOS: list[tuple[str, str, str]] = [
    ("hip thrust", "https://www.youtube.com/watch?v=SEd7xn17DtM", "Hip thrust form"),
    ("bulgarian", "https://www.youtube.com/watch?v=2C-uNgKwPLE", "Bulgarian split squat"),
    ("rdl", "https://www.youtube.com/watch?v=jEy_czb3RHs", "Romanian deadlift"),
    ("sumo squat", "https://www.youtube.com/watch?v=9Hxu1KD7_uE", "Sumo squat"),
    ("lat pulldown", "https://www.youtube.com/watch?v=CAwf7n6Luuc", "Lat pulldown"),
    ("bench", "https://www.youtube.com/watch?v=rT7DgCr-3pg", "Barbell bench press"),
    ("barbell row", "https://www.youtube.com/watch?v=FWJR5Ve8bnQ", "Barbell row"),
    ("plank", "https://www.youtube.com/watch?v=ASdvN_XEl_c", "Plank form"),
    ("leg raise", "https://www.youtube.com/watch?v=JB2oyawG9KI", "Hanging leg raise"),
    ("squat", "https://www.youtube.com/watch?v=ultWZbUMPL8", "Barbell squat"),
]


def help_links_for(name: str) -> list[dict]:
    q_form = quote_plus(f"{name} form how to")
    q_tiktok = quote_plus(f"{name} form gym")
    links: list[dict] = []
    low = name.lower()
    for key, url, label in DIRECT_VIDEOS:
        if key in low:
            links.append({"label": f"YouTube · {label}", "url": url})
            break
    links.append({"label": "YouTube search", "url": f"https://www.youtube.com/results?search_query={q_form}"})
    links.append({"label": "TikTok form clips", "url": f"https://www.tiktok.com/search/video?q={q_tiktok}"})
    return links


def day_number(day_key: str) -> int:
    try:
        return DAY_KEYS.index(day_key) + 1
    except ValueError:
        return 1


def _roman(n: int) -> str:
    return ROMAN[n] if 0 <= n < len(ROMAN) else str(n + 1)


def human_reps_label(reps: str, exercise_name: str = "") -> str:
    raw = (reps or "").strip()
    low = raw.lower()
    name = exercise_name.strip()
    name_low = name.lower()

    if not raw or low == "complete":
        dur = re.search(r"(\d+)\s*mins?", name, re.I)
        if dur:
            return f"{dur.group(1)} min"
        if "stretch" in name_low:
            return "1 round"
        if re.search(r"treadmill|stair|cardio|incline", name_low):
            return name if len(name) <= 28 else "Finish cardio"
        return "Finish"

    if "failure" in low:
        hold = re.search(r"(\d+)\s*sec\s*hold", low)
        if hold:
            return f"To failure · {hold.group(1)}s hold"
        return "To failure"

    if re.fullmatch(r"\d+", raw):
        return f"{raw} reps"

    short = re.split(r"\s*[;(]", raw)[0].strip()
    if short.lower() == "failure":
        return "To failure"
    return short if len(short) <= 36 else short[:33] + "..."


def parse_exercise(text: str) -> dict:
    raw = (text or "").strip()
    name = raw
    set_count = 1
    reps_label = ""
    tier = "WORK"
    notes = ""

    paren = re.search(r"\(([^)]+)\)", raw)
    if paren:
        inner = paren.group(1)
        name = raw[: paren.start()].strip(" —-\t")
        notes = raw[paren.end() :].strip(" —")
        xm = re.search(r"(\d+)\s*x\s*(.+)", inner, re.I)
        xmr = re.search(r"(.+?)\s*x\s*(\d+)\s*$", inner, re.I)
        if xm:
            set_count = int(xm.group(1))
            reps_label = xm.group(2).strip()
        elif xmr:
            set_count = int(xmr.group(2))
            reps_label = xmr.group(1).strip()

    dash = re.search(r"—\s*(\d+)\s*x\s*(.+?)(?:\s*\(|$)", raw)
    if dash and set_count == 1:
        set_count = int(dash.group(1))
        reps_label = dash.group(2).strip()
        name = raw.split("—")[0].strip()

    if re.search(r"\b(min|mins|sec|secs|failure)\b", reps_label, re.I):
        tier = "TIME" if "min" in reps_label.lower() or "sec" in reps_label.lower() else "HEAVY"
    if "failure" in reps_label.lower() or "failure" in raw.lower():
        tier = "HEAVY"

    cardio = re.search(r"\b(treadmill|stair|cardio|stretch)\b", raw, re.I)
    if cardio and set_count == 1 and not paren:
        tier = "WARMUP" if "stretch" in raw.lower() else "CARDIO"

    name = name.strip() or raw
    if not reps_label:
        reps_label = human_reps_label("", name)
    return {
        "name": name,
        "set_count": max(1, min(set_count, 10)),
        "reps_label": reps_label,
        "reps_human": human_reps_label(reps_label, name),
        "tier": tier,
        "notes": notes,
        "raw": raw,
        "uses_weight": tier in ("WORK", "HEAVY") and not re.search(r"\b(plank|crunch|raise|twist|min)\b", reps_label, re.I),
    }


def ensure_sets(item: dict) -> dict:
    parsed = parse_exercise(item.get("text", ""))
    if item.get("sets_target"):
        parsed["set_count"] = int(item["sets_target"])
        if item.get("reps_label"):
            parsed["reps_label"] = item["reps_label"]
            parsed["reps_human"] = human_reps_label(item["reps_label"], parsed["name"])
    n = parsed["set_count"]
    existing = item.get("sets") or []
    set_cues = item.get("set_cues") or {}
    set_specs = item.get("set_specs") or {}
    if len(existing) != n:
        last_w = item.get("last_weight_lb")
        existing = [
            {
                "done": False,
                "weight_lb": last_w,
                "reps": parsed["reps_label"],
            }
            for _ in range(n)
        ]
    else:
        for s in existing:
            s.setdefault("reps", parsed["reps_label"])
            s.setdefault("done", False)
    for i, s in enumerate(existing):
        spec = set_specs.get(str(i + 1)) or {}
        if spec.get("label"):
            s["display"] = spec["label"]
        else:
            s["display"] = set_display(s, parsed)
        if spec.get("failure"):
            s["failure"] = True
        cue = spec.get("cue") or set_cues.get(str(i + 1)) or set_cues.get(str(i))
        if cue:
            s["cue"] = cue
    item["sets"] = existing
    item["parsed"] = parsed
    item["help_links"] = help_links_for(parsed["name"])
    item["form_tip"] = _match_tip(parsed["name"])
    if item.get("last_weight_lb") is None:
        for s in reversed(existing):
            if s.get("weight_lb"):
                item["last_weight_lb"] = s["weight_lb"]
                break
    return item


def enrich_plan(plan: dict) -> dict:
    from . import gym_plans

    out = {**plan, "sections": []}
    for sec in plan.get("sections", []):
        new_sec = {**sec, "items": []}
        for item in sec.get("items", []):
            enriched = ensure_sets(dict(item))
            if item.get("name"):
                enriched["display_name"] = item["name"]
            else:
                enriched["display_name"] = enriched.get("parsed", {}).get("name", item.get("text", ""))
            new_sec["items"].append(enriched)
        out["sections"].append(new_sec)
    day_key = plan.get("day_key", "monday")
    if day_key in gym_plans.LOWER_PLAN_KEYS:
        out["day_number"] = gym_plans.LOWER_PLAN_KEYS.index(day_key) + 1
    elif day_key in gym_plans.UPPER_ABS_PLAN_KEYS:
        out["day_number"] = gym_plans.UPPER_ABS_PLAN_KEYS.index(day_key) + 1
    elif day_key in gym_plans.CARDIO_PLAN_KEYS:
        out["day_number"] = gym_plans.CARDIO_PLAN_KEYS.index(day_key) + 1
    else:
        out["day_number"] = day_number(day_key)
    out["session_label"] = plan.get("title", "Workout").split("(", 1)[-1].rstrip(")").strip() or plan.get("title")
    return out


def toggle_set(
    day_key: str,
    item_id: str,
    set_index: int,
    done: bool = True,
    weight_lb: float | None = None,
) -> tuple[dict, dict | None]:
    """Mark a set done/undone. Returns (plan, item_meta for timer)."""
    from . import gym_plans

    plan = gym_plans.get_plan(day_key)
    item_meta = None
    for sec in plan["sections"]:
        for item in sec["items"]:
            if item["id"] != item_id:
                continue
            ensure_sets(item)
            if set_index < 0 or set_index >= len(item["sets"]):
                continue
            s = item["sets"][set_index]
            s["done"] = bool(done)
            if weight_lb is not None:
                s["weight_lb"] = round(weight_lb, 1)
                item["last_weight_lb"] = s["weight_lb"]
            if all(x.get("done") for x in item["sets"]):
                item["checked"] = True
                item["checked_at"] = datetime.now().isoformat()
            else:
                item["checked"] = False
                item.pop("checked_at", None)
            parsed = item.get("parsed") or parse_exercise(item.get("text", ""))
            for i, row in enumerate(item["sets"]):
                row["display"] = set_display(row, parsed)
            item_meta = {
                "rest_sec": item.get("rest_sec"),
                "rest_label": item.get("rest_label", ""),
                "name": item.get("name") or parsed.get("name", "Exercise"),
                "set_number": set_index + 1,
                "is_failure": bool(item["sets"][set_index].get("failure")),
            }
            gym_plans.save_plan(plan)
            return plan, item_meta if done else None
    return plan, None


def hit_set(day_key: str, item_id: str, set_index: int, weight_lb: float | None = None) -> dict:
    plan, _ = toggle_set(day_key, item_id, set_index, done=True, weight_lb=weight_lb)
    return plan


def reset_item_sets(day_key: str, item_id: str) -> dict:
    from . import gym_plans

    plan = gym_plans.get_plan(day_key)
    for sec in plan["sections"]:
        for item in sec["items"]:
            if item["id"] == item_id:
                item.pop("sets", None)
                item["checked"] = False
                ensure_sets(item)
                for s in item["sets"]:
                    s["done"] = False
    gym_plans.save_plan(plan)
    return plan


def _match_tip(name: str) -> str:
    low = name.lower()
    for key, tip in FORM_TIPS.items():
        if key in low:
            return tip
    return ""


def exercise_help(day_key: str, exercise_name: str) -> dict:
    from . import gym_plans

    name = exercise_name.strip()
    tips = _match_tip(name)
    if not tips:
        try:
            tips = gym_plans.ask_gym_ai(
                day_key,
                f"In 3 short bullets, how to do {name} with safe form. No intro.",
            )
        except Exception:
            tips = "Tap a link below to watch form tutorials."
    return {
        "name": name,
        "tips": tips,
        "links": help_links_for(name),
        "google_gif_url": google_gif_search_url(name),
    }


def set_display(set_data: dict, parsed: dict) -> str:
    w = set_data.get("weight_lb")
    reps = human_reps_label(set_data.get("reps") or parsed.get("reps_label", ""), parsed.get("name", ""))
    if w and parsed.get("uses_weight"):
        return f"{w} lb × {reps}"
    return reps
