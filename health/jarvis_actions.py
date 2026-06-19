"""Dr. Melani auto-log — voice/text → writes to all health systems."""

from __future__ import annotations

import json
import re
from datetime import datetime

from openai import OpenAI

from . import cycle, grocery, symptoms, supplements
from . import meal_presets
from . import meal_planner
from . import journal as journal_mod
from . import sleep as sleep_mod
from . import vitals
from . import workouts
from .db import today, water_total_ml
from .food_scanner import estimate_meal_from_text
from .nutrition import MEAL_SLOTS, add_water, save_meal, slot_label, macro_dashboard

ollama = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama", timeout=45.0)

LOG_HINTS = (
    "log ", "i ate", "i had", "i drank", "i drink", "drank ", "had ",
    "slept", "sleep ", "woke", "wake ", "bed at", "bedtime",
    "brain fog", "foggy", "fog yes", "fog no",
    "weigh", "weight ", " lbs", " pounds",
    "breakfast", "lunch", "dinner", "snack",
    "meals", "what i ate", "what i had", "my meals",
    "water", "ml", "liter", "litre",
    "workout", "gym ", "trained", "exercise",
    "period started", "my period", "flow ",
    "spotting", "add ", "grocery", "ran out", "running low", "out of", "need ",
    "bought", "shopped", "picked up", "fridge", "pantry",
    "tomorrow", "plan lunch", "plan dinner",
    "track ", "record ",
    "vitamin", "supplement", "ashwagandha", "immunogrid", "took my",
    "felt ", "feeling ", "i feel", "so sick", "really sick", "fatigue", "fatigued",
    "exhausted", "nauseous", "nausea", "cramp", "cramps", "migraine", "headache",
    "not feeling", "felt awful", "felt terrible",
)

NOTE_HINTS = (
    "felt", "feeling", "i feel", "so sick", "really sick", "fatigue", "fatigued",
    "exhausted", "nauseous", "cramp", "migraine", "headache", "not feeling well",
    "felt awful", "felt terrible", "threw up", "vomit",
)

QUESTION_MARKERS = (
    "should i", "is it ok", "is this", "good for me", "why am", "why do",
    "what about", "tell me about", "explain", "how many calories", "what should i eat",
    "can i eat", "what should i", "what workout", "what exercise",
    "write up", "write me", "write a", "plan my", "plan a", "plan the",
    "create a", "design a", "build me", "give me a", "give me the",
    "best workout", "workout plan", "workout for", "routine for",
    "?",
)

PLANNING_MARKERS = (
    "write up", "write me", "write a", "plan my", "plan a", "plan the",
    "create a", "design a", "build me", "give me a", "give me the",
    "what should i", "what's the best", "whats the best", "best workout",
    "workout plan", "program for", "routine for",
    "how should i train", "how should i workout",
)


def is_planning_request(text: str) -> bool:
    """User wants advice or a plan — not logging something that already happened."""
    q = (text or "").lower().strip()
    if not q:
        return False
    if any(m in q for m in PLANNING_MARKERS):
        return True
    if re.search(
        r"\b(write|plan|create|design|build|give me|suggest|recommend)\b.+\b("
        r"workout|routine|program|split|session|leg day|glute day|cardio)\b",
        q,
    ):
        return True
    if re.search(r"\bbest\b.+\b(workout|routine|program)\b", q):
        return True
    if re.search(
        r"\bworkout\s+for\s+(?:today|tomorrow|me|my|this|sunday|monday|tuesday|"
        r"wednesday|thursday|friday|saturday)\b",
        q,
    ):
        return True
    return False


def looks_like_logging(text: str) -> bool:
    q = (text or "").lower().strip()
    if len(q) < 3:
        return False
    if is_planning_request(text):
        return False
    if _wants_meal_log(text):
        return True
    if any(h in q for h in LOG_HINTS):
        return True
    if any(h in q for h in NOTE_HINTS):
        return True
    if re.search(r"\d+\s*(ml|oz|lb|lbs|cal|g protein|hours?|h sleep)", q):
        return True
    return False


def has_explicit_question(text: str) -> bool:
    q = (text or "").lower().strip()
    if is_planning_request(text):
        return True
    if "?" in q:
        return True
    return any(m in q for m in QUESTION_MARKERS if m != "?")


def _infer_note_tags(text: str) -> list[str]:
    q = text.lower()
    tags = []
    if any(w in q for w in ("sick", "nausea", "nauseous", "vomit", "threw up")):
        tags.append("sick")
    if any(w in q for w in ("fatigue", "fatigued", "exhausted", "tired", "no energy")):
        tags.append("fatigue")
    if any(w in q for w in ("cramp", "cramps", "period pain")):
        tags.append("cramps")
    if any(w in q for w in ("migraine", "headache")):
        tags.append("migraine")
    if any(w in q for w in ("fog", "foggy", "brain fog")):
        tags.append("brain_fog")
    return tags


def _wants_meal_log(text: str) -> bool:
    """User is describing food they already ate — not asking where to buy it."""
    q = (text or "").lower().strip()
    if not q or is_planning_request(text):
        return False
    if re.search(
        r"\blog(?:ged|ging| in)?(?:\s+my)?(?:\s+meals?)?(?:\s+today)?\b",
        q,
    ):
        return True
    if re.search(r"\b(?:what|everything)\s+i\s+(?:ate|had)\b", q):
        return True
    if re.search(r"\bmeals?\s+today\b", q):
        return True
    if re.search(r"\b(?:i|that i)\s+(?:ate|had)\b", q):
        return True
    if re.search(r"\bfor\s+(?:breakfast|lunch|dinner|brunch|snack)\b", q):
        return True
    food_words = (
        "salmon", "chicken", "rice", "eggs", "asparagus", "broccoli", "steak",
        "yogurt", "oats", "salad", "pasta", "tofu", "fish", "turkey", "snack",
    )
    if any(w in q for w in (" ate ", " had ", "eating", "finished")) and any(
        f in q for f in food_words
    ):
        return True
    return False


def _extract_meal_description(text: str) -> str:
    """Pull food description from a rambling log message."""
    chunk = (text or "").strip()
    chunk = re.sub(
        r"^(?:please\s+)?(?:can you\s+)?(?:log(?:ged|ging)?(?:\s+in)?(?:\s+my)?(?:\s+meals?)?(?:\s+today)?(?:\s+that)?(?:\s+i)?(?:\s+ate)?)\s*:?\s*",
        "",
        chunk,
        flags=re.I,
    )
    chunk = re.sub(
        r"^(?:today\s+)?(?:i|that i)\s+(?:ate|had)\s*:?\s*",
        "",
        chunk,
        flags=re.I,
    )
    chunk = re.sub(r"^\s*[-•*]\s*", "", chunk, flags=re.I | re.M)
    chunk = re.sub(r"\s*[-•*]\s*", "; ", chunk)
    chunk = re.sub(r"\s+", " ", chunk).strip(" ;,.")
    return chunk[:600]


def _infer_meal_slot(text: str, default: str = "lunch") -> str:
    q = text.lower()
    for slot in MEAL_SLOTS:
        if slot.replace("_", " ") in q or slot in q:
            return slot
    if "snack" in q:
        hour = datetime.now().hour
        return "snack_am" if hour < 14 else "snack_pm"
    hour = datetime.now().hour
    if hour < 11:
        return "breakfast"
    if hour < 15:
        return "lunch"
    if hour < 18:
        return "snack_pm"
    return "dinner"


def _wants_preset_breakfast(text: str) -> bool:
    q = (text or "").lower().strip()
    if has_explicit_question(q) and re.search(
        r"what|how|why|tell me|explain|calories|good for", q
    ):
        return False
    return bool(
        re.search(
            r"(?:log(?:ged)?|had|ate|eating|finished|starting|done with)\s+(?:my\s+)?(?:usual\s+)?breakfast"
            r"|log my (?:usual )?breakfast"
            r"|(?:my\s+)?usual breakfast(?: today)?\s*$"
            r"|same breakfast(?: as usual)?",
            q,
        )
    )


def _parse_food_item_list(text: str) -> list[str]:
    """Pull food names from a comma/and-separated voice dump."""
    chunk = text.strip()
    chunk = re.split(
        r"\?|\bwhat should i\b|\bgive me\b|\bsuggest\b|\bideas for\b|\bfor lunch\b|\bfor dinner\b",
        chunk,
        maxsplit=1,
        flags=re.I,
    )[0]
    for prefix in (
        r"just (?:bought|got|picked up|shopped for|came back with)\s+",
        r"(?:i )?(?:bought|got|picked up|grabbed)\s+",
        r"(?:in (?:my )?(?:fridge|kitchen|pantry)|(?:my )?(?:fridge|kitchen|pantry) has)\s+",
        r"grocery haul:?\s*",
        r"from (?:trader joe'?s?|target|the store)[:\s,]*",
        r"stocked up on\s+",
    ):
        chunk = re.sub(prefix, "", chunk, flags=re.I)
    parts = re.split(r",|\band\b|\n|;", chunk)
    items: list[str] = []
    skip = {"etc", "stuff", "things", "food", "groceries", "some"}
    for part in parts:
        name = part.strip().strip(".")
        name = re.sub(r"^(some|a few|a couple of|a bunch of|also|plus|the)\s+", "", name, flags=re.I)
        name = name.strip()
        if len(name) > 2 and name.lower() not in skip:
            items.append(name.title())
    return items[:30]


def _wants_tomorrow_plan(text: str) -> bool:
    q = (text or "").lower()
    if not re.search(r"\btomorrow\b", q):
        return False
    if has_explicit_question(q) and re.search(
        r"what should|what can|ideas|suggest|how many|tell me", q
    ):
        return False
    return bool(re.search(r"plan|lunch|dinner|eating|having|make|meal", q))


def _parse_tomorrow_meals(text: str) -> tuple[str, str]:
    def clean(s: str) -> str:
        return s.strip().strip(".").strip(",").strip()

    chunk = text.strip()
    lunch = dinner = ""
    lunch_m = re.search(
        r"lunch[:\s-]+(.+?)(?=\s+dinner[:\s-]|$)",
        chunk,
        re.I | re.S,
    )
    dinner_m = re.search(r"dinner[:\s-]+(.+)$", chunk, re.I | re.S)
    if lunch_m:
        lunch = clean(lunch_m.group(1))
    if dinner_m:
        dinner = clean(dinner_m.group(1))
    if not lunch and not dinner:
        m = re.search(
            r"tomorrow[,\s]+(.+?)(?:for\s+(?:lunch|dinner)|$)",
            chunk,
            re.I,
        )
        if m:
            lunch = clean(m.group(1))[:160]
    return lunch, dinner


def _wants_grocery_add(text: str) -> bool:
    q = (text or "").lower()
    if re.search(r"\b(?:ran|run)\s+out\s+of\b", q):
        return True
    if re.search(r"\b(?:out\s+of|running\s+low|low\s+on|need(?:ing)?|restock)\b", q) and any(
        w in q for w in ("grocery", "list", "shop", "buy", "get", "walmart")
    ):
        return True
    if re.search(r"\badd\b", q) and any(w in q for w in ("grocery", "list", "shop")):
        return True
    return False


def _parse_grocery_request(text: str) -> list[str]:
    if not _wants_grocery_add(text):
        return []
    return grocery.parse_item_names(text)


def _wants_pantry_update(text: str) -> bool:
    q = (text or "").lower()
    return bool(
        re.search(
            r"\b(?:bought|shopped|picked up|grocery haul|in (?:my )?(?:fridge|kitchen|pantry)|"
            r"from trader|from target|stocked up|came back with)\b",
            q,
        )
    )


def _parse_water_ml(text: str) -> int | None:
    q = text.lower()
    m = re.search(r"(\d+)\s*(?:ml|milliliters?)", q)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:l|liter|litre|liters?)\b", q)
    if m:
        return int(float(m.group(1)) * 1000)
    if "liter" in q or "litre" in q or "1l" in q.replace(" ", ""):
        return 1000
    m = re.search(r"(\d+)\s*(?:oz|ounce)", q)
    if m:
        return int(float(m.group(1)) * 29.5735)
    if "bottle" in q:
        return 500
    if "+500" in q or "500 ml" in q:
        return 500
    if "+250" in q or "250 ml" in q:
        return 250
    if "glass" in q:
        return 250
    return None


def _rule_parse(text: str) -> list[dict]:
    """Fast single-action parsing — no LLM."""
    q = text.lower().strip()
    actions: list[dict] = []

    if re.search(r"period\s+(?:started|start)|started\s+(?:my\s+)?period", q):
        actions.append({"type": "period_start"})

    for flow in cycle.FLOW_LEVELS:
        if flow == "none":
            continue
        if re.search(rf"\b{flow}\s+flow\b|\bflow\s+{flow}\b", q):
            actions.append({"type": "cycle_flow", "flow": flow})
            break

    m = re.search(r"brain\s*fog\s*(?:was\s+)?(yes|yeah|yep|true|no|nope|nah|false)", q)
    if m:
        actions.append({"type": "brain_fog", "yes": m.group(1) in ("yes", "yeah", "yep", "true")})

    bm_m = re.search(
        r"(?:bowel|poop|pooped|number\s*2|#2|bm)\s*(?:movement)?\s*(?:today\s*)?(?:was\s*)?(yes|no|yeah|nope|nah)",
        q,
    )
    if bm_m:
        actions.append({
            "type": "bowel_movement",
            "yes": bm_m.group(1) in ("yes", "yeah", "yep"),
        })
    elif re.search(r"\b(constipated|didn'?t go|no bowel|haven'?t gone)\b", q):
        actions.append({"type": "bowel_movement", "yes": False})
    elif re.search(r"\b(went to the bathroom|had a bm|pooped today|regular today)\b", q):
        actions.append({"type": "bowel_movement", "yes": True})

    if re.search(
        r"\b(?:took|had|finished|done with)\s+(?:all\s+(?:my\s+)?(?:vitamins?|supplements?)|(?:my\s+)?(?:vitamins?|supplements?)\s+all)\b",
        q,
    ) or re.search(r"\b(?:vitamins?|supplements?)\s+(?:done|taken|logged)\b", q):
        actions.append({"type": "supplements_all"})
    elif any(
        w in q for w in ("vitamin d", "vit d", "vitamin d3", "ashwagandha", "immunogrid", "creatine")
    ) and re.search(r"\b(?:took|had|finished|took my)\b", q):
        item = supplements.find_by_name(q)
        if item:
            actions.append({"type": "supplement", "supplement_id": item["id"], "name": item["name"]})

    ml = _parse_water_ml(q)
    if ml and any(w in q for w in ("water", "drank", "drink", "hydrate", "ml", "liter", "litre", "bottle", "glass")):
        actions.append({"type": "water", "amount_ml": ml})

    m = re.search(r"(?:weigh(?:ed)?|weight)\s*(?:is|was|at)?\s*(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)?", q)
    if not m:
        m = re.search(r"\b(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b", q)
    if m and ("weigh" in q or "weight" in q or "lb" in q):
        actions.append({"type": "weight", "value_lb": float(m.group(1))})

    m = re.search(
        r"slept\s+(?:about|around|like)?\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b",
        q,
    )
    if m:
        hours = float(m.group(1))
        actions.append({"type": "sleep_hours", "hours": hours})
    else:
        wt = re.search(
            r"(?:wake|woke)(?:\s+up)?\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)",
            q,
            re.I,
        )
        bt = re.search(
            r"(?:bed(?:time)?|slept)\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)",
            q,
            re.I,
        )
        if bt or wt:
            actions.append({
                "type": "sleep",
                "bedtime": bt.group(1) if bt else "",
                "wake_time": wt.group(1) if wt else "",
            })

    grocery_items = _parse_grocery_request(text)
    if grocery_items:
        for name in grocery_items:
            actions.append({"type": "grocery", "name": name})

    if _wants_preset_breakfast(q):
        actions.append({"type": "preset_breakfast"})
        return actions

    if _wants_pantry_update(text):
        items = _parse_food_item_list(text)
        if items:
            replace = bool(re.search(r"\b(?:just|only|fresh|new haul|replaced)\b", q))
            actions.append({"type": "pantry", "items": items, "replace": replace})

    if _wants_tomorrow_plan(text):
        lunch, dinner = _parse_tomorrow_meals(text)
        if lunch or dinner:
            actions.append({"type": "tomorrow_plan", "lunch": lunch, "dinner": dinner})

    if _wants_meal_log(text):
        desc = _extract_meal_description(text)
        if len(desc) > 3:
            actions.append({
                "type": "meal",
                "slot": _infer_meal_slot(q),
                "description": desc,
            })
    elif any(w in q for w in ("ate", "had", "breakfast", "lunch", "dinner", "meal", "food")):
        meal_m = re.search(
            r"(?:ate|had)\s+(.+?)(?:\s+for\s+(?:breakfast|lunch|dinner|brunch))?(?:[,.]|$|\s+and\s+(?:drank|brain|water|slept|weigh))",
            q,
        )
        if meal_m:
            desc = meal_m.group(1).strip()
            desc = re.sub(r"\s+for\s*$", "", desc)
            if len(desc) > 2 and desc not in ("yes", "no", "water"):
                actions.append({
                    "type": "meal",
                    "slot": _infer_meal_slot(q),
                    "description": desc[:200],
                })

    if re.search(r"(?:did|finished|completed)\s+(?:my\s+)?(?:workout|gym|leg day|glute)", q):
        dur = re.search(r"(\d+)\s*(?:min|minutes?)", q)
        actions.append({
            "type": "workout",
            "workout_type": "gym",
            "duration_min": int(dur.group(1)) if dur else None,
            "notes": text[:120],
        })

    has_journal = any(a.get("type") == "journal" for a in actions)
    if not has_journal and any(h in q for h in NOTE_HINTS) and len(text) > 8:
        actions.append({
            "type": "journal",
            "text": text.strip(),
            "tags": _infer_note_tags(text),
        })
        if "fatigue" in _infer_note_tags(text) or "brain_fog" in _infer_note_tags(text):
            if not any(a.get("type") == "brain_fog" for a in actions):
                actions.append({"type": "brain_fog", "yes": True})

    return actions


def _llm_parse(text: str) -> dict:
    prompt = f"""You extract health LOG actions from Melani's message (voice-to-text OK).
Today is {today()}. Return JSON only:
{{
  "actions": [
    {{"type":"water","amount_ml":500}},
    {{"type":"brain_fog","yes":true}},
    {{"type":"bowel_movement","yes":true}},
    {{"type":"supplement","supplement_id":1,"name":"Vitamin D"}},
    {{"type":"supplements_all"}},
    {{"type":"sleep","bedtime":"11:00 PM","wake_time":"7:00 AM"}},
    {{"type":"sleep_hours","hours":7.5}},
    {{"type":"meal","slot":"breakfast|snack_am|lunch|snack_pm|dinner","description":"what she ate"}},
    {{"type":"preset_breakfast"}},
    {{"type":"tomorrow_plan","lunch":"salmon bowl","dinner":"chicken and broccoli"}},
    {{"type":"weight","value_lb":125}},
    {{"type":"workout","workout_type":"gym","duration_min":45,"notes":""}},
    {{"type":"cycle_flow","flow":"spotting|light|medium|heavy|none"}},
    {{"type":"period_start"}},
    {{"type":"grocery","name":"item"}},
    {{"type":"journal","text":"how she felt","tags":["fatigue","sick"]}}
  ],
  "follow_up_question": "only if she also asked a health question, else empty string"
}}

Rules:
- Only include actions she clearly stated or implied as something that ALREADY happened.
- "Write up / plan / create a workout" = she wants advice, NOT a log. actions=[] and put her request in follow_up_question.
- Do NOT invent water, meals, brain fog, or journal notes from workout planning messages.
- If she says she had/logged her usual breakfast → preset_breakfast (not a custom meal).
- If she plans tomorrow's lunch/dinner → tomorrow_plan with lunch and/or dinner text.
- If she lists what she bought / has in the fridge → pantry action with item names (replace:true for a full grocery haul).
- If she says "log my meals" / lists what she ate (even rambling, bullets, portions) → ONE meal action with full description; respect portions (1/4 salmon fillet, 7 asparagus spears, etc.).
- Do NOT treat "I ate salmon" as a grocery shopping question.
- Infer meal slot from words or time of day if missing.
- water: 1L=1000, bottle~500, glass~250
- If she took a vitamin/supplement → supplement (match name) or supplements_all for all of them.
- If she describes feeling sick, fatigued, cramps, etc. → journal action (+ brain_fog if foggy/tired).
- If purely a question with nothing to log, actions=[].
- Multiple items in one ramble → multiple actions.

Message: {text}"""

    try:
        resp = ollama.chat.completions.create(
            model="llama3",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )
        return _parse_json(resp.choices[0].message.content or "{}")
    except Exception:
        return {"actions": [], "follow_up_question": ""}


def _normalize_time(t: str) -> str:
    t = (t or "").strip()
    if not t:
        return ""
    if re.match(r"^\d{1,2}:\d{2}$", t):
        return t
    m = re.match(r"^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$", t, re.I)
    if m:
        h = int(m.group(1))
        mins = m.group(2) or "00"
        ap = (m.group(3) or "").lower()
        if ap == "pm" and h < 12:
            h += 12
        if ap == "am" and h == 12:
            h = 0
        return f"{h:02d}:{mins}"
    return t


def _sleep_from_hours(hours: float) -> tuple[str, str]:
    """Back-calculate reasonable times from total hours (wake ~7 AM)."""
    wake_h, wake_m = 7, 0
    bed_min = wake_h * 60 + wake_m - int(hours * 60)
    if bed_min < 0:
        bed_min += 24 * 60
    bt_h, bt_m = divmod(bed_min, 60)
    return f"{bt_h:02d}:{bt_m:02d}", f"{wake_h:02d}:{wake_m:02d}"


def execute_action(action: dict) -> tuple[str | None, str]:
    """Run one action. Returns (confirmation line, short key)."""
    kind = action.get("type", "")

    if kind == "water":
        ml = int(action.get("amount_ml") or 250)
        r = add_water(ml)
        return f"Water +{ml} ml → {r['total_ml']}/{r['goal_ml']} ml today", "water"

    if kind == "brain_fog":
        yes = bool(action.get("yes"))
        symptoms.log_brain_fog(yes)
        return f"Brain fog: {'Yes' if yes else 'No'}", "brain fog"

    if kind == "bowel_movement":
        yes = bool(action.get("yes"))
        symptoms.log_bowel_movement(yes)
        return f"Bowel movement: {'Yes' if yes else 'No'}", "bowel"

    if kind == "supplement":
        sid = action.get("supplement_id")
        name = (action.get("name") or "").strip()
        if not sid and name:
            found = supplements.find_by_name(name)
            sid = found["id"] if found else None
        if not sid:
            return None, ""
        status = supplements.set_taken(int(sid), True)
        item = next((i for i in status["items"] if i["id"] == int(sid)), None)
        label = item["name"] if item else name or "Supplement"
        return f"{label} ✓", "vitamins"

    if kind == "supplements_all":
        status = supplements.log_all_today()
        return status["summary"], "vitamins"

    if kind == "sleep":
        bt = _normalize_time(str(action.get("bedtime", "")))
        wt = _normalize_time(str(action.get("wake_time", "")))
        if not bt and not wt:
            return None, ""
        if not bt or not wt:
            h = float(action.get("hours") or 7)
            bt, wt = _sleep_from_hours(h)
        r = sleep_mod.save_sleep(bedtime=bt, wake_time=wt, notes=action.get("notes"))
        return f"Sleep {r.get('sleep_hours', '?')} h", "sleep"

    if kind == "sleep_hours":
        h = float(action.get("hours") or 0)
        if h <= 0:
            return None, ""
        bt, wt = _sleep_from_hours(h)
        r = sleep_mod.save_sleep(bedtime=bt, wake_time=wt, notes=f"~{h}h (Dr. Melani log)")
        return f"Sleep ~{r.get('sleep_hours', h)} h", "sleep"

    if kind == "meal":
        slot = (action.get("slot") or "lunch").lower()
        if slot not in MEAL_SLOTS:
            slot = _infer_meal_slot(slot)
        desc = (action.get("description") or action.get("name") or "").strip()
        if not desc:
            return None, ""
        est = estimate_meal_from_text(desc)
        save_meal(
            slot=slot,
            name=est.get("name") or desc[:80],
            calories=est.get("calories"),
            protein_g=est.get("protein_g"),
            carbs_g=est.get("carbs_g"),
            fat_g=est.get("fat_g"),
            fiber_g=est.get("fiber_g"),
            source="dr_melani_log",
        )
        name = est.get("name") or desc[:40]
        cal = int(est.get("calories") or 0)
        prot = int(est.get("protein_g") or 0)
        dash = macro_dashboard()
        cur = dash["current"]
        goals = dash["goals"]
        line = f"{slot_label(slot)}: {name}\n~{cal} cal · {prot}g protein"
        if cur.get("calories") is not None:
            line += (
                f"\nToday: {cur['calories']:.0f} cal · {cur['protein_g']:.0f}g protein"
                f" (goal {goals['protein_goal_g']}g)"
            )
        return line, "meal"

    if kind == "preset_breakfast":
        r = meal_presets.log_preset("breakfast_usual")
        name = r["preset"].get("name", "Usual breakfast")
        cal = r["logged"].get("calories") or r["preset"].get("calories")
        return f"Breakfast: {name} (~{int(cal or 0)} cal)", "breakfast"

    if kind == "weight":
        val = float(action.get("value_lb") or action.get("value") or 0)
        if val <= 0:
            return None, ""
        vitals.save_weight(val)
        return f"Weight {val:.1f} lb", "weight"

    if kind == "workout":
        wtype = action.get("workout_type") or action.get("type_name") or "workout"
        dur = action.get("duration_min")
        workouts.log_workout(
            str(wtype),
            int(dur) if dur else None,
            notes=str(action.get("notes") or "")[:200],
        )
        return f"Workout: {wtype}", "workout"

    if kind == "cycle_flow":
        flow = str(action.get("flow") or "medium").lower()
        cycle.log_flow(flow)
        return f"Flow: {flow}", "cycle"

    if kind == "period_start":
        cycle.start_period()
        return "Period started", "cycle"

    if kind == "grocery":
        name = (action.get("name") or "").strip().title()
        if not name:
            return None, ""
        grocery.add_item(name, added_by="dr_melani", reason="Added via Dr. Melani chat")
        return f"Grocery: {name}", "grocery"

    if kind == "pantry":
        items = action.get("items") or []
        if not items:
            return None, ""
        if action.get("replace"):
            grocery.set_pantry(items)
        else:
            grocery.add_pantry_items(items)
        preview = ", ".join(items[:4])
        extra = f" +{len(items) - 4} more" if len(items) > 4 else ""
        return f"Kitchen: {preview}{extra}", "pantry"

    if kind == "tomorrow_plan":
        plan = meal_planner.save_plan(
            lunch=str(action.get("lunch") or ""),
            dinner=str(action.get("dinner") or ""),
        )
        parts = []
        if plan.get("lunch"):
            parts.append(f"lunch: {plan['lunch'][:50]}")
        if plan.get("dinner"):
            parts.append(f"dinner: {plan['dinner'][:50]}")
        return f"Tomorrow — {' · '.join(parts)}", "plan"

    if kind == "journal":
        note_text = (action.get("text") or "").strip()
        if not note_text:
            return None, ""
        tags = action.get("tags") or _infer_note_tags(note_text)
        journal_mod.log_note(note_text, tags=tags)
        return "Note saved", "note"

    return None, ""


def _dedupe_actions(actions: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for a in actions:
        key = json.dumps(a, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        out.append(a)
    return out


def format_short_summary(keys: list[str], include_cycle_tip: bool = True) -> str:
    """Minimal reply — no essay."""
    if not keys:
        return "✓ Saved."
    seen = []
    for k in keys:
        if k and k not in seen:
            seen.append(k)
    line = "✓ " + " · ".join(seen)
    if include_cycle_tip:
        try:
            overview = cycle.cycle_overview()
            phase = overview.get("phase", "")
            eat = cycle.phase_eat_tip(overview.get("phase_id"))
            cycle_keys = ("meal", "breakfast", "cycle", "plan", "pantry")
            if eat and any(k in cycle_keys for k in seen):
                line += f"\n({phase} — {eat[:100]}{'…' if len(eat) > 100 else ''})"
            elif eat and overview.get("phase_id") in ("period", "luteal", "pre_period"):
                if any(k in cycle_keys for k in seen):
                    line += f"\n({phase} phase — eat: {eat[:90]}…)" if len(eat) > 90 else f"\n({phase} — {eat})"
        except Exception:
            pass
    return line


def process_log_message(text: str) -> dict:
    """
    Parse and execute log actions from natural language.
    Returns {has_logs, logged, keys, summary, log_only, follow_up_question}.
    """
    text = (text or "").strip()
    if not text or not looks_like_logging(text):
        return {
            "has_logs": False, "logged": [], "keys": [], "summary": "",
            "log_only": True, "follow_up_question": "",
        }

    if is_planning_request(text):
        return {
            "has_logs": False, "logged": [], "keys": [], "summary": "",
            "log_only": True, "follow_up_question": text,
        }

    q_lower = text.lower()
    explicit_q = has_explicit_question(text)
    rule_actions = _rule_parse(text)

    log_verbs = (
        r"\b(ate|had|drank|slept|weigh|log|fog|felt|sick|fatigue|water|period started|flow|"
        r"bought|shopped|picked up|fridge|pantry|breakfast)\b"
    )
    if explicit_q and not rule_actions and not re.search(log_verbs, q_lower):
        return {
            "has_logs": False, "logged": [], "keys": [], "summary": "",
            "log_only": True, "follow_up_question": text,
        }

    if explicit_q and not rule_actions:
        return {
            "has_logs": False, "logged": [], "keys": [], "summary": "",
            "log_only": True, "follow_up_question": text,
        }

    strong_rule = any(
        a.get("type") in ("pantry", "preset_breakfast", "period_start", "tomorrow_plan")
        for a in rule_actions
    )
    need_llm = not rule_actions or (len(text) > 100 and not strong_rule)
    llm_data = _llm_parse(text) if need_llm else {"actions": [], "follow_up_question": ""}
    llm_actions = llm_data.get("actions") or []
    follow_up = (llm_data.get("follow_up_question") or "").strip()

    combined = _dedupe_actions(rule_actions + llm_actions)
    if not combined and any(h in q_lower for h in NOTE_HINTS):
        combined = [{
            "type": "journal",
            "text": text,
            "tags": _infer_note_tags(text),
        }]

    logged: list[str] = []
    keys: list[str] = []
    for action in combined:
        line, key = execute_action(action)
        if line:
            logged.append(line)
            if key:
                keys.append(key)

    if not logged:
        if _wants_meal_log(text):
            desc = _extract_meal_description(text)
            if len(desc) > 3:
                line, key = execute_action({
                    "type": "meal",
                    "slot": _infer_meal_slot(text),
                    "description": desc,
                })
                if line:
                    logged.append(line)
                    if key:
                        keys.append(key)
        if not logged:
            return {
                "has_logs": False, "logged": [], "keys": [], "summary": "",
                "log_only": not explicit_q, "follow_up_question": follow_up or (text if explicit_q else ""),
            }

    log_only = not explicit_q and not follow_up
    if log_only and logged:
        summary = "✓ " + "\n".join(logged)
    elif log_only:
        summary = format_short_summary(keys)
    else:
        summary = format_short_summary(keys, include_cycle_tip=False)
        summary = "**Saved:** " + summary.replace("✓ ", "", 1)

    return {
        "has_logs": True,
        "logged": logged,
        "keys": keys,
        "summary": summary,
        "log_only": log_only,
        "follow_up_question": follow_up,
    }
