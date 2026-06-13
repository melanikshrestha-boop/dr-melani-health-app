from __future__ import annotations

"""In-app Jarvis chat — nudges, grocery help, health Q&A (no Telegram)."""

import json
import re
import threading
import uuid
from datetime import datetime, timedelta
from urllib.parse import quote_plus

from .jarvis_brain import answer_health_question, answer_supplement_question, build_ai_context, classify_intent, classify_intent_with_history
from .jarvis_actions import process_log_message, looks_like_logging, has_explicit_question, _wants_meal_log
from .jarvis_vision import analyze_image, MAX_IMAGE_BYTES
from .db import get_conn, today
from .paths import HEALTH_DATA
from . import grocery, symptoms

NUDGES_FILE = HEALTH_DATA / "jarvis" / "nudges.json"
CHAT_FILE = HEALTH_DATA / "jarvis" / "chat_history.json"
PENDING_FILE = HEALTH_DATA / "jarvis" / "chat_pending.json"
RESULT_FILE = HEALTH_DATA / "jarvis" / "chat_last_result.json"
SHOPS = ("Trader Joe's", "Target")

KNOWN_PRODUCTS = (
    "olive oil", "oats", "salmon", "walnuts", "spinach", "eggs", "yogurt",
    "bread", "chicken", "avocado", "almonds", "berries", "beans",
)

DR_MELANI_WELCOME = "Hi Melani, let's get to work."

DR_MELANI_GREETING = "Hi Melani, let's get to work."

CURATED_PICKS: dict[str, str] = {
    "olive oil": (
        "For extra virgin olive oil:\n\n"
        "**Trader Joe's** — Tunisian Organic EVOO or Spanish Extra Virgin Olive Oil "
        "(usually ~$5–9). Good everyday pick — dark bottle, extra virgin on the label.\n\n"
        "**Target** — Good & Gather Extra Virgin Olive Oil, or California Olive Ranch if they have it.\n\n"
        "What to look for: \"extra virgin,\" a dark glass bottle, and ideally a harvest date. "
        "With your LDL flagged, swapping to EVOO for cooking/dressing is a solid heart-health move."
    ),
    "oats": (
        "**Trader Joe's** — Steel Cut Oats or Organic Old Fashioned Rolled Oats.\n\n"
        "**Target** — Good & Gather Old Fashioned Oats or Quaker Old Fashioned (plain, no sugar).\n\n"
        "Soluble fiber helps with LDL — plain oats, not the sugary packets."
    ),
    "salmon": (
        "**Trader Joe's** — Atlantic Salmon fillets (fresh or frozen) or Wild Alaskan Sockeye if in stock.\n\n"
        "**Target** — Good & Gather frozen salmon fillets or Wild Caught Alaskan salmon.\n\n"
        "Omega-3s support heart health — your triglycerides were flagged."
    ),
}


def _load_json(path, default):
    if path.exists():
        return json.loads(path.read_text())
    return default


def _save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))


def shop_links(query: str) -> list[dict]:
    q = quote_plus(query.strip())
    return [
        {"store": "Target", "url": f"https://www.target.com/s?searchTerm={q}"},
        {"store": "Trader Joe's", "url": f"https://www.traderjoes.com/home/search?q={q}"},
    ]


def _profile_blurb() -> str:
    from .profile import jarvis_context

    with get_conn() as conn:
        rows = conn.execute("SELECT key, value FROM profile").fetchall()
    p = {r["key"]: r["value"] for r in rows}
    return (
        f"Patient: {p.get('name', 'Melani')}. {jarvis_context()} "
        f"Conditions: {p.get('conditions', 'migraines, lipid monitoring')}. "
        f"Shops ONLY at: {', '.join(SHOPS)}. "
        "Give advice based on HER data (labs, weight, age, height). "
        "Tone: warm, concise, like a helpful friend — not robotic."
    )


def _macro_blurb() -> str:
    from .nutrition_goals import get_goals
    from . import nutrition

    goals = get_goals()
    m = nutrition.macro_dashboard()
    cur = m["current"]
    return (
        f"Nutrition goals: {goals['protein_goal_g']}g protein/day (priority), ~{goals['calorie_goal']} cal/day. "
        f"Logged today: {cur['protein_g']:.0f}g protein, {cur['calories']:.0f} cal "
        f"({cur['meals_logged']} meals). Adjust calorie target based on labs, training, and weight trends."
    )


def refresh_nudges():
    from .autopilot import refresh_web_nudges

    refresh_web_nudges()


def pending_nudges() -> list:
    refresh_nudges()
    nudges = _load_json(NUDGES_FILE, [])
    return [n for n in nudges if not n.get("answered")][-5:]


def answer_nudge(nudge_id: str, answer: str) -> dict | None:
    nudges = _load_json(NUDGES_FILE, [])
    nudge = None
    for n in nudges:
        if n.get("id") == nudge_id:
            n["answered"] = True
            n["answer"] = answer
            nudge = n
            break
    _save_json(NUDGES_FILE, nudges)
    if not nudge:
        return None
    if nudge.get("yes_no"):
        yes = answer.lower() in ("yes", "y", "true", "1")
        from .db import today as today_fn
        symptoms.log_brain_fog(yes, today_fn())
        return {"ok": True, "logged_brain_fog": yes}
    return {"ok": True}


def chat_history() -> list:
    return _load_json(CHAT_FILE, [])[-30:]


def get_chat_messages() -> list:
    """Messages for restoring the in-app chat UI."""
    return chat_history()


def clear_chat_history() -> dict:
    _save_json(CHAT_FILE, [])
    _clear_pending()
    try:
        if RESULT_FILE.exists():
            RESULT_FILE.unlink()
    except OSError:
        pass
    return {"ok": True}


def _append_history(role: str, content: str):
    hist = chat_history()
    hist.append({"role": role, "content": content, "at": datetime.now().isoformat()})
    _save_json(CHAT_FILE, hist[-30:])


def _detect_product(question: str) -> str | None:
    q = question.lower()
    for item in KNOWN_PRODUCTS:
        if item in q:
            return item
    if "evoo" in q or "extra virgin" in q:
        return "olive oil"
    return None


def _link_block(product: str) -> str:
    lines = ["", "Shop links:"]
    for link in shop_links(product):
        lines.append(f"• {link['store']}: {link['url']}")
    return "\n".join(lines)


def _curated_answer(product: str) -> str | None:
    return CURATED_PICKS.get(product)


def _normalize_simple(question: str) -> str:
    q = question.strip().lower()
    q = re.sub(r"\b(dr\.?\s*melani|jarvis)\b", "", q, flags=re.I).strip()
    q = re.sub(r"[^\w\s']", " ", q)
    return re.sub(r"\s+", " ", q).strip()


def _fast_answer(question: str) -> str | None:
    """Instant replies — no AI, no research, no full context load."""
    norm = _normalize_simple(question)
    if not norm:
        return None

    greetings = {
        "hi", "hello", "hey", "yo", "sup", "hiya", "howdy", "heya", "hii", "hiii",
    }
    if norm in greetings or norm.startswith(("good morning", "good afternoon", "good evening")):
        return DR_MELANI_GREETING

    if norm in ("thanks", "thank you", "thx", "ty", "thank u"):
        return "Anytime."

    if norm in ("ok", "okay", "k", "cool", "got it", "sure", "yep", "yeah", "yes"):
        return "Got it."

    if norm in ("bye", "goodbye", "see ya", "later", "cya"):
        return "Talk soon."

    if "how are you" in norm or norm in ("whats up", "what s up", "wassup", "sup"):
        return "Locked in — your entire health file is loaded and cross-checked. What's the question?"

    if norm in ("help", "what can you do", "what do you do", "commands"):
        return (
            "**Meals:**\n"
            "• **Breakfast** — tap *Log my breakfast* on Meals.\n"
            "• **Scan a meal** — attach a photo in chat (📎). I estimate portions + macros like Cal AI and log it.\n"
            "  Say *\"scan lunch\"* or just send the plate photo.\n"
            "• **When you eat** — *\"had salmon and rice for lunch\"* (no photo needed).\n"
            "• **Plan tomorrow** — *\"Tomorrow lunch: salmon bowl, dinner: chicken and broccoli\"*\n\n"
            "**Also:** sleep, water, brain fog, cycle, grocery — just talk.\n\n"
            "**Supplements:** pick from the dropdown (Vitamin D, Patanjali stack, creatine…) "
            "for a blunt critique + brand check. Photo the label (📎) — set mode to *Supplement* "
            "or ask *is this sketchy?*\n\n"
            "**Gym GIFs:** only when you ask — e.g. *gif of person running on treadmill* or *show hip thrust form gif*."
        )

    return None


def _build_ai_context(question: str) -> str:
    ctx, _ = build_ai_context(question)
    return ctx


def ask_jarvis(
    question: str,
    *,
    image_bytes: bytes | None = None,
    supplement_id: int | None = None,
    photo_mode: str = "auto",
) -> dict:
    question = (question or "").strip()
    has_image = bool(image_bytes)
    photo_mode = (photo_mode or "auto").lower()
    sup_intent = supplement_id or classify_intent_with_history(question, chat_history()) == "supplement"

    if not question and not has_image:
        return {"answer": DR_MELANI_WELCOME, "links": []}

    if has_image and len(image_bytes or b"") > MAX_IMAGE_BYTES:
        return {"answer": "That image is too large — keep it under 10 MB.", "links": []}

    if not has_image:
        instant = _fast_answer(question)
        if instant:
            _append_history("user", question)
            _append_history("assistant", instant)
            return {"answer": instant, "links": [], "instant": True}

        if looks_like_logging(question):
            log_result = process_log_message(question)
            if log_result.get("has_logs"):
                answer = log_result["summary"]
                if not log_result.get("log_only"):
                    q2 = log_result.get("follow_up_question") or question
                    try:
                        extra = answer_health_question(q2, chat_history())
                        if extra and extra.strip() not in answer:
                            answer += "\n\n" + extra
                    except Exception:
                        pass
                _append_history("user", question)
                _append_history("assistant", answer)
                return {
                    "answer": answer,
                    "links": [],
                    "logged": log_result.get("logged", []),
                    "auto_log": True,
                    "log_only": log_result.get("log_only", True),
                }

        from .gym_gifs import find_gif_for_request, wants_gif

        if wants_gif(question):
            gif = find_gif_for_request(question)
            if gif.get("url"):
                label = gif.get("label") or gif.get("query") or "that"
                answer = f"Here's {label}:"
                _append_history("user", question)
                _append_history("assistant", answer)
                return {"answer": answer, "links": [], "gif_url": gif["url"]}
            answer = (
                "I couldn't find a clean demo GIF for that. "
                "Try being specific — e.g. *gif of barbell hip thrust* or "
                "*person running on treadmill*."
            )
            _append_history("user", question)
            _append_history("assistant", answer)
            return {"answer": answer, "links": []}

    product = _detect_product(question) if question else None
    if product and _wants_meal_log(question):
        product = None
    links = shop_links(product) if product else []

    add_match = re.search(r"add\s+(.+?)(?:\s+to|\s*$)", question.lower()) if question else None
    added = None
    if add_match:
        item = add_match.group(1).strip().title()
        if len(item) > 1:
            added = grocery.add_item(item, added_by="dr_melani", reason="Added via Dr. Melani chat")

    curated = _curated_answer(product) if product and not has_image else None
    answer = curated

    if has_image:
        from .jarvis_meal_scan import handle_meal_photo

        meal_resp = handle_meal_photo(question, image_bytes or b"", photo_mode)
        if meal_resp:
            hist_label = question or "[meal photo]"
            if question:
                hist_label = f"{question} [meal photo]"
            _append_history("user", hist_label)
            _append_history("assistant", meal_resp["answer"])
            return meal_resp

    if not answer and has_image:
        ctx = _build_ai_context(question or "supplement product image")
        hist = chat_history()
        try:
            force_sup = photo_mode == "supplement" or sup_intent
            answer = analyze_image(
                question,
                image_bytes,
                ctx,
                history=hist,
                supplement_id=supplement_id,
                force_supplement=force_sup,
            )
        except Exception:
            answer = None

    if not answer and not has_image and sup_intent:
        hist = chat_history()
        try:
            answer = answer_supplement_question(
                question or "Review my supplement",
                hist,
                supplement_id=supplement_id,
            )
        except Exception:
            answer = None

    if not answer and not has_image and not sup_intent:
        hist = chat_history()
        try:
            answer = answer_health_question(question, hist)
        except Exception:
            answer = None

    if not answer and product:
        answer = (
            f"I couldn't reach AI right now, but search \"{product}\" at your stores below. "
            "Pick extra virgin / plain / wild-caught when it applies."
        )
    elif not answer:
        if has_image:
            answer = (
                "I couldn't read that image right now. Try a clearer screenshot, "
                "or restart from your Melani Health start file."
            )
        else:
            answer = "I couldn't get an answer right now. Try again in a moment, or ask about olive oil, oats, or salmon — I have instant picks for those."

    if product and links and "Shop links:" not in answer:
        answer += _link_block(product if product != "olive oil" else "extra virgin olive oil")

    if added:
        answer += f"\n\n✓ Added {added['name']} to your grocery list."

    hist_label = question or "[image]"
    if has_image and question:
        hist_label = f"{question} [image attached]"
    elif has_image:
        hist_label = "[image attached]"

    _append_history("user", hist_label)
    _append_history("assistant", answer)

    return {"answer": answer, "links": links, "added": added, "had_image": has_image}


# ── Background chat jobs ─────────────────────────────────────────────────────
# So Melani can switch tabs / keep using the app while Dr. Melani is "typing".
# The answer is computed in a background thread and saved to chat history, so it
# survives page reloads and never blocks the UI.

def _set_pending(job_id: str, question: str, kind: str):
    _save_json(PENDING_FILE, {
        "job_id": job_id,
        "question": question,
        "kind": kind,
        "started_at": datetime.now().isoformat(),
    })


def _clear_pending():
    try:
        if PENDING_FILE.exists():
            PENDING_FILE.unlink()
    except OSError:
        pass


def chat_status() -> dict:
    """Is a chat answer currently being generated? If not, return the last result
    (so the client can attach links/gif to the freshly-saved answer)."""
    pend = _load_json(PENDING_FILE, None) if PENDING_FILE.exists() else None
    if pend:
        try:
            started = datetime.fromisoformat(pend.get("started_at", ""))
            if datetime.now() - started > timedelta(seconds=180):
                _clear_pending()  # stale — server likely restarted mid-answer
                pend = None
        except (ValueError, TypeError):
            pend = None
    if pend:
        return {
            "pending": True,
            "job_id": pend.get("job_id"),
            "question": pend.get("question"),
            "kind": pend.get("kind"),
        }
    result = _load_json(RESULT_FILE, None) if RESULT_FILE.exists() else None
    return {"pending": False, "result": result}


def start_chat_job(
    question: str,
    *,
    image_bytes: bytes | None = None,
    supplement_id: int | None = None,
    photo_mode: str = "auto",
) -> dict:
    """Kick off the answer in a background thread; return immediately."""
    job_id = uuid.uuid4().hex
    label = (question or "").strip() or ("📷 Image" if image_bytes else "")
    if question and looks_like_logging(question):
        kind = "log"
    elif image_bytes:
        kind = "image"
    else:
        kind = "chat"
    _set_pending(job_id, label, kind)

    def worker():
        try:
            result = ask_jarvis(
                question,
                image_bytes=image_bytes,
                supplement_id=supplement_id,
                photo_mode=photo_mode,
            )
        except Exception as exc:  # noqa: BLE001
            answer = "I couldn't finish that — try again in a sec."
            _append_history("user", label or "[message]")
            _append_history("assistant", answer)
            result = {"answer": answer, "links": [], "error": str(exc)}
        result = dict(result or {})
        result["job_id"] = job_id
        try:
            _save_json(RESULT_FILE, result)
        finally:
            _clear_pending()

    threading.Thread(target=worker, daemon=True).start()
    return {"pending": True, "job_id": job_id, "question": label, "kind": kind}
