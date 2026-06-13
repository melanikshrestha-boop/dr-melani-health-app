"""Dr. Melani brain — briefing, intent routing, two-step answers."""

from __future__ import annotations

import json
import re
from typing import Any

from openai import OpenAI

from .clinical_knowledge import jarvis_context_block
from .jarvis_data import (
    flagged_labs_summary,
    recent_meals_block,
    sleep_week_block,
    workout_recent_block,
    gym_today_block,
    today_gaps,
    _brain_fog_block,
    _nutrition_goals_block,
    _sleep_block,
    _weight_block,
)
from .agent_tools import lab_summary_text, health_status_text
from .jarvis_research import search_evidence, personalized_research_query, search_supplement_bundle
from . import supplements
from . import supplement_advisor
from .profile import data_stats
from . import gym_plans
from . import symptoms
from . import cycle
from . import journal as journal_mod
from . import grocery
from . import meal_presets
from . import nutrition
from . import meal_planner
from .db import today
from .paths import CONFIG_DIR

ollama = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama", timeout=90.0)

# Prefer a small/fast local model; fall back to llama3 (8B) if nothing faster is installed.
_FAST_MODEL_PREFS = (
    "llama3.2:3b", "llama3.2:3b-instruct-q4_K_M", "llama3.2:1b",
    "qwen2.5:3b", "phi3:mini", "gemma2:2b",
)
# When she wants smart over fast, prefer the largest/most capable installed model.
_SMART_MODEL_PREFS = (
    "llama3.1:70b", "qwen2.5:72b", "qwen2.5:32b", "qwen2.5:14b",
    "llama3.1:8b", "llama3:latest", "llama3:8b", "llama3", "llama3.2:3b",
)
_CHAT_MODEL_CACHE: dict[str, float | str] = {}


# ── Claude (Opus) — used automatically when an Anthropic key is on file ──────────
_CONFIG_FILE = CONFIG_DIR / "config.json"
# Order: best reasoning first, then cheaper/faster fallbacks if the model name 404s.
_CLAUDE_MODELS = (
    "claude-opus-4-20250514",
    "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-latest",
)


def _anthropic_key() -> str:
    import os

    env = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if env:
        return env
    try:
        cfg = json.loads(_CONFIG_FILE.read_text())
        return str(cfg.get("anthropic_api_key") or "").strip()
    except Exception:
        return ""


def _claude_chat(messages: list, *, temperature: float = 0.3, max_tokens: int = 1200) -> str:
    """Call Claude (Opus) directly via HTTP. Returns '' if unavailable so we fall back."""
    key = _anthropic_key()
    if not key:
        return ""
    import requests as _rq

    system_parts = [m["content"] for m in messages if m.get("role") == "system"]
    convo = [
        {"role": ("assistant" if m["role"] == "assistant" else "user"), "content": m["content"]}
        for m in messages
        if m.get("role") in ("user", "assistant")
    ]
    if not convo:
        convo = [{"role": "user", "content": "\n\n".join(system_parts) or "Hi"}]

    for model in _CLAUDE_MODELS:
        try:
            resp = _rq.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "system": "\n\n".join(system_parts),
                    "messages": convo,
                },
                timeout=60,
            )
            if resp.status_code == 404:
                continue  # model name not available on this account — try next
            resp.raise_for_status()
            data = resp.json()
            blocks = data.get("content") or []
            text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
            if text.strip():
                return text.strip()
        except Exception:
            continue
    return ""


def _chat_model(*, smart: bool = False) -> str:
    """Pick an installed Ollama model. smart=True prefers the most capable model
    available; otherwise prefers the fastest small model."""
    import time as _t

    cache_key = "smart_model" if smart else "model"
    prefs = _SMART_MODEL_PREFS if smart else _FAST_MODEL_PREFS
    cached = _CHAT_MODEL_CACHE.get(cache_key)
    if cached and cached != "llama3":
        return str(cached)
    if cached == "llama3" and _t.time() - float(_CHAT_MODEL_CACHE.get("checked_at", 0)) < 60:
        return "llama3"

    model = "llama3"
    try:
        import requests as _rq

        tags = _rq.get("http://localhost:11434/api/tags", timeout=2).json()
        installed = {m.get("name", "") for m in tags.get("models", [])}
        installed |= {n.split(":")[0] for n in list(installed)}
        for pref in prefs:
            if pref in installed or pref.split(":")[0] in installed:
                model = pref
                break
    except Exception:
        pass
    _CHAT_MODEL_CACHE[cache_key] = model
    _CHAT_MODEL_CACHE["checked_at"] = _t.time()
    return model


def _fast_chat(
    messages: list,
    *,
    temperature: float = 0.3,
    max_tokens: int = 600,
    smart: bool = False,
) -> str:
    """One chat call. Uses Claude (Opus) if a key is configured, else the best
    installed local model. smart=True favors the most capable local model and a
    larger answer budget for hard reasoning/recall questions."""
    claude = _claude_chat(messages, temperature=temperature, max_tokens=max(max_tokens, 1200) if smart else max_tokens)
    if claude:
        return claude
    try:
        resp = ollama.chat.completions.create(
            model=_chat_model(smart=smart),
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            extra_body={
                "keep_alive": "30m",
                "options": {"top_k": 40 if smart else 20, "top_p": 0.9, "num_predict": max_tokens},
            },
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception:
        return ""


INTENTS = (
    ("supplement", (
        "supplement", "ashwagandha", "vitamin", "capsule", "herb", "probiotic",
        "good for me", "is this ok", "should i take", "creatine", "patanjali",
        "immunogrid", "brand", "sketchy", "safe", "monohydrate", "powder", "tub",
        "scoop", "spoon", "dose", "dosage", "thorne", "how much do i take",
    )),
    ("brain_fog", ("brain fog", "foggy", "fog", "can't focus", "cant focus", "tired", "fatigue", "exhausted")),
    ("nutrition", ("calorie", "protein", "hormone", "macro", "eat", "meal", "food", "diet", "weight loss", "gain")),
    ("gym", ("workout", "gym", "exercise", "lift", "squat", "hip thrust", "cardio", "rest day")),
    ("labs", ("lab", "ldl", "cholesterol", "triglyceride", "a1c", "glucose", "tsh", "blood test", "results")),
    ("cycle", ("period", "ovulation", "luteal", "follicular", "pms", "cycle", "cramp", "flow")),
)


def classify_intent(question: str) -> str:
    q = (question or "").lower()
    for name, keys in INTENTS:
        if any(k in q for k in keys):
            return name
    return "general"


# Reference words that mean "I'm still talking about the last thing" — so a short
# follow-up like "do I use the blue spoon to the top?" should inherit the prior topic.
_FOLLOWUP_MARKERS = (
    " it", "it?", "this", "that", "the blue", "blue spoon", "the spoon", "the scoop",
    "to the top", "how much", "how many", "again", "the same", "instead", "one too",
    " ones", "those", "these", "the powder", "the tub", "the bottle", "the pill",
    "fill", "level", "heaping", "scoop", "spoon",
)


def is_followup(question: str) -> bool:
    """Heuristic: is this a continuation of the previous topic (no full restatement)?"""
    q = (question or "").lower().strip()
    if not q:
        return False
    if any(m in q for m in _FOLLOWUP_MARKERS):
        return True
    # Very short questions are almost always follow-ups.
    return len(q.split()) <= 6 and q.endswith("?")


def recent_intent(history: list[dict] | None) -> str:
    """Most recent non-general topic from the last few chat turns (user + assistant)."""
    if not history:
        return "general"
    for h in reversed(history[-6:]):
        intent = classify_intent(h.get("content", ""))
        if intent != "general":
            return intent
    return "general"


def classify_intent_with_history(question: str, history: list[dict] | None = None) -> str:
    """Like classify_intent, but a follow-up inherits the topic of the prior turns,
    so she doesn't make Melani retype context she already gave."""
    cur = classify_intent(question)
    if cur != "general":
        return cur
    if is_followup(question):
        prev = recent_intent(history)
        if prev != "general":
            return prev
    return "general"


# Questions where she's asking me to recall something SHE logged/said/noted.
# These need her FULL data (notes, bowel, journal, everything) — not a narrow slice.
_RECALL_PATTERNS = (
    r"\bwhat (?:did|note|notes?) ",
    r"\bwhat .*\bnote\b",
    r"\bdid i (?:say|note|log|write|mention|tell you|record)\b",
    r"\bwhat did i (?:say|log|write|note|tell you|track|record|do)\b",
    r"\bremember\b",
    r"\bremind me\b",
    r"\bmy notes?\b",
    r"\bnote .* (?:today|yesterday|this week)\b",
    r"\bwhat .* about my\b",
    r"\bhow (?:hard|bad|was) .*\b",
    r"\bearlier (?:today|i)\b",
    r"\bwhat have i\b",
    r"\bsummar(?:y|ize) .*\b(?:day|today|week|me)\b",
)


def is_recall_question(question: str) -> bool:
    q = (question or "").lower().strip()
    if not q:
        return False
    return any(re.search(p, q) for p in _RECALL_PATTERNS)


def _wants_meal_plan(question: str) -> bool:
    q = (question or "").lower()
    return bool(
        re.search(
            r"what (?:should i|can i) (?:make|eat|cook)|"
            r"(?:lunch|dinner|meal) ideas?|"
            r"suggest (?:some )?(?:lunch|dinner|meals)|"
            r"plan (?:my )?(?:lunch|dinner|meals)|"
            r"what to (?:make|eat) (?:for )?(?:lunch|dinner)",
            q,
        )
    )


def _meal_plan_instructions() -> str:
    return (
        "She wants lunch/dinner ideas from what's in her kitchen (pantry list above).\n"
        "Rules: organic when possible, zero added sugar, Trader Joe's / Target realistic.\n"
        "Breakfast is already a fixed preset — focus on lunch + dinner only.\n"
        "Give 3–4 lunch options and 3–4 dinner options using pantry items.\n"
        "Each option: name, main ingredients, rough protein estimate, one line why it fits her labs/cycle.\n"
        "End with: after she eats, she can voice-log \"had salmon and rice for lunch\" — no photo needed."
    )


def melani_briefing() -> str:
    """Short daily chart review — always about HER."""
    stats = data_stats()
    gaps = today_gaps()
    bf = symptoms.week_brain_fog_data()
    gym_key = gym_plans.today_day_key()
    plan = gym_plans.get_plan(gym_key)

    lines = [
        "=== MELANI BRIEFING ===",
        f"Who: {stats['header_tagline']}, height {stats['height']}, weight {stats['weight_display']}.",
        "Provider: Dr. Megan Ververis (discuss medical decisions with her).",
        "Conditions: migraines, lipid/metabolic monitoring.",
        "",
        flagged_labs_summary(),
        "",
        f"Today ({today()}):",
    ]
    if gaps:
        lines.append("  Gaps: " + "; ".join(gaps) + ".")
    else:
        lines.append("  Today tracking looks complete.")
    lines.append(f"  Brain fog this week: {bf['yes_count']} yes-days of 7.")
    lines.append(f"  Gym plan today: {plan.get('title', gym_key)}.")
    lines.append("")
    lines.append(cycle.context_block())
    return "\n".join(lines)


def context_for_question(question: str, history: list[dict] | None = None) -> str:
    """Return only data slices relevant to this question (history-aware)."""
    intent = classify_intent_with_history(question, history)
    parts = [melani_briefing(), ""]

    # Recall/memory questions ("what note did I make about X today?") need EVERYTHING
    # she's logged — including private bowel notes and journal entries.
    if is_recall_question(question):
        from .jarvis_data import full_data_context

        parts.extend([
            "=== FULL CHART (she is asking me to recall something she logged) ===",
            full_data_context(),
            "",
            "She is asking what she logged/noted. Search ALL sections above — including "
            "BOWEL PRIVATE NOTES, JOURNAL, brain fog, and recent meals — and quote the actual "
            "note text back to her with its date. If a note exists, never say 'you didn't leave a note.'",
        ])
        return "\n".join(parts)

    if intent == "supplement":
        parts.extend([
            _nutrition_goals_block(),
            flagged_labs_summary(),
            "Migraine note: track personal triggers (sleep, skipped meals, dehydration).",
            "",
            supplements.context_block(),
            "",
            "=== HER STACK — QUICK CRITIQUE ===",
            "\n".join(supplement_advisor.catalog_advisor_lines()),
        ])
    elif intent == "brain_fog":
        parts.extend([
            _brain_fog_block(),
            sleep_week_block(),
            _sleep_block(),
            recent_meals_block(),
        ])
    elif intent == "nutrition":
        parts.extend([
            meal_presets.context_block(),
            "",
            meal_planner.context_block(),
            "",
            grocery.pantry_context_block(),
            "",
            nutrition.meal_before_7pm_context_block(),
            "",
            _nutrition_goals_block(),
            cycle.context_block(),
            recent_meals_block(),
            _weight_block(),
            flagged_labs_summary(),
        ])
        if _wants_meal_plan(question):
            parts.extend([
                "",
                "=== MEAL PLAN REQUEST ===",
                _meal_plan_instructions(),
            ])
    elif intent == "gym":
        parts.extend([
            gym_today_block(),
            workout_recent_block(),
            _nutrition_goals_block(),
            cycle.context_block(),
        ])
    elif intent == "labs":
        parts.extend([
            flagged_labs_summary(),
            lab_summary_text(),
        ])
    elif intent == "cycle":
        parts.extend([
            cycle.context_block(),
            journal_mod.context_block(),
            flagged_labs_summary(),
        ])
    else:
        from .jarvis_data import _bowel_block

        parts.extend([
            health_status_text(),
            flagged_labs_summary(),
            cycle.context_block(),
            journal_mod.context_block(),
            _brain_fog_block(),
            _bowel_block(),
            recent_meals_block(),
        ])

    return "\n".join(parts)


def build_supplement_context(
    question: str,
    *,
    supplement_id: int | None = None,
    product_name: str = "",
    brand: str = "",
    ingredients: str = "",
    history: list[dict] | None = None,
) -> tuple[str, str]:
    """Rich context for supplement critique + brand research block."""
    briefing = melani_briefing()
    slices = context_for_question(question or product_name or "supplement", history)
    catalog_item = supplements.get_by_id(supplement_id) if supplement_id else None
    if catalog_item:
        product_name = catalog_item["name"]
        if catalog_item.get("dose") and not brand:
            brand = catalog_item["dose"]

    import concurrent.futures

    brand_research = ""
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            fut = ex.submit(
                search_supplement_bundle,
                product_name or question, brand, briefing, ingredients,
            )
            _, brand_research = fut.result(timeout=6.0)
    except Exception:
        brand_research = ""
    critique = supplement_advisor.critique_block(
        name=product_name,
        brand=brand,
        ingredients=ingredients,
        catalog_id=supplement_id,
        brand_research=brand_research,
    )

    ctx = (
        f"{jarvis_context_block()}\n\n"
        f"{slices}\n\n"
        f"{critique}\n\n"
        "You are reviewing supplements for Melani — be direct and skeptical of weak brands.\n"
        "Required sections:\n"
        "**Your chart:** (her labs, migraines, what she already takes)\n"
        "**This product:** (what it is + honest evidence strength)\n"
        "**Brand check:** (quality, recalls, Patanjali/Ayurvedic risks if relevant — cite web check)\n"
        "**What evidence says:** (PubMed/guidelines)\n"
        "**Verdict:** (Good fit / Proceed with caution / Skip / Ask Dr. Ververis first — one clear line)\n"
        "Never diagnose. Not her doctor."
    )
    research_q = personalized_research_query(product_name or question, briefing)
    research = quick_research(research_q, budget_s=5.0)
    if research and research not in ctx:
        ctx += f"\n\n=== ONLINE RESEARCH ===\n{research}\n"
    return ctx, brand_research or research


def synthesize_supplement_answer(
    question: str,
    context: str,
    chart: dict,
    research: str,
    history: list[dict],
) -> str:
    """Final answer with brand-check section."""
    facts = chart.get("relevant_facts") or []
    concerns = chart.get("concerns") or []
    chart_block = (
        f"Chart read:\n"
        f"Facts: {json.dumps(facts)}\n"
        f"Concerns: {json.dumps(concerns)}\n"
    )
    if research:
        chart_block += f"\nResearch:\n{research}\n"

    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": (
                f"{context}\n\n{chart_block}\n"
                "CONVERSATION CONTINUITY: Use the chat history to resolve vague references "
                "('it', 'the blue spoon', 'the scoop', 'to the top'). If she just named a product "
                "(e.g. Thorne creatine), this question is about THAT product — don't ask her to repeat it. "
                "For a dosing question like 'do I fill the scoop to the top?', answer the actual dose "
                "(e.g. a level Thorne creatine scoop is ~5 g/day) instead of asking for clarification.\n\n"
                "Answer with exactly these sections (skip ones that don't apply):\n"
                "**Your chart:**\n"
                "**This product:**\n"
                "**Brand check:** (call out Patanjali/Ayurvedic quality risks if relevant; mention if web check found nothing)\n"
                "**What evidence says:**\n"
                "**Verdict:** (blunt — good for her / caution / skip / ask Dr. Ververis)\n"
                "Be willing to say a product is weak or sketchy if evidence or brand quality is poor.\n"
                "Never invent lab values."
            ),
        }
    ]
    for h in history[-6:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": question})

    return _fast_chat(messages, temperature=0.35, max_tokens=900, smart=True)


def answer_supplement_question(
    question: str,
    history: list[dict],
    *,
    supplement_id: int | None = None,
    product_name: str = "",
    brand: str = "",
    ingredients: str = "",
) -> str:
    """Supplement critique — single fast pass with time-boxed brand research."""
    ctx, research = build_supplement_context(
        question,
        supplement_id=supplement_id,
        product_name=product_name,
        brand=brand,
        ingredients=ingredients,
        history=history,
    )
    answer = synthesize_supplement_answer(question, ctx, {}, research, history)
    if answer:
        return answer

    # Rule-based fallback if LLM down
    scoring = supplement_advisor.score_supplement(
        product_name or question,
        brand=brand,
        ingredients=ingredients,
        catalog_item=supplements.get_by_id(supplement_id) if supplement_id else None,
    )
    lines = [
        f"**Your chart:** {flagged_labs_summary()[:200]}…",
        f"**This product:** {scoring['name']} — fit score {scoring['score']}/100.",
        "**Brand check:** See web results above if any; verify Patanjali batch and seller.",
        f"**What evidence says:** {scoring['concerns'][0] if scoring['concerns'] else 'Limited data.'}",
        f"**Verdict:** {scoring['verdict']}",
    ]
    return "\n".join(lines)


def quick_research(question: str, *, budget_s: float = 5.0) -> str:
    """Time-boxed evidence lookup so chat never stalls on the network."""
    import concurrent.futures

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            fut = ex.submit(search_evidence, question, 3, force=False)
            return fut.result(timeout=budget_s) or ""
    except Exception:
        return ""


def build_ai_context(question: str, *, force_research: bool = False) -> tuple[str, str]:
    """Return (system_context, research_block)."""
    briefing = melani_briefing()
    slices = context_for_question(question)
    research_q = personalized_research_query(question, briefing)
    research = search_evidence(research_q, force=force_research)

    ctx = (
        f"{jarvis_context_block()}\n\n"
        f"{slices}\n\n"
        "Always tie advice to HER data first, then evidence.\n"
        "Speak as Dr. Melani — confident, precise, warm. No filler.\n"
        "Required sections: **Your chart:** then **What evidence says:** then **For you:**"
    )
    if research:
        ctx += f"\n\n=== ONLINE RESEARCH ===\n{research}\n"
    return ctx, research


def _parse_json(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass
    return {}


def chart_read(question: str, context: str) -> dict:
    """Step A — extract relevant facts from her chart."""
    prompt = f"""You are Dr. Melani's chart reader. Read HER data only.

{context}

Question: {question}

Return JSON only:
{{"relevant_facts": ["fact with date/number", ...], "concerns": ["..."], "research_focus": "short PubMed search topic"}}

Use only numbers from the data above. Max 5 facts, 3 concerns.
NEVER invent body fat, BMI, or any value not explicitly listed above."""

    raw = _fast_chat(
        [{"role": "user", "content": prompt}], temperature=0.2, max_tokens=300
    )
    parsed = _parse_json(raw)
    if parsed:
        return parsed
    return {"relevant_facts": [], "concerns": [], "research_focus": question[:80]}


def synthesize_answer(
    question: str,
    context: str,
    chart: dict,
    research: str,
    history: list[dict],
) -> str:
    """Step B — final personalized answer."""
    facts = chart.get("relevant_facts") or []
    concerns = chart.get("concerns") or []
    chart_block = (
        f"Chart read:\n"
        f"Facts: {json.dumps(facts)}\n"
        f"Concerns: {json.dumps(concerns)}\n"
    )
    if research:
        chart_block += f"\nResearch:\n{research}\n"

    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": (
                f"{context}\n\n{chart_block}\n"
                "Answer with exactly these sections:\n"
                "**Your chart:** (her numbers + dates + cycle phase + recent notes if relevant)\n"
                "**What evidence says:** (cite source type)\n"
                "**For you:** (one clear next step; food advice must match her cycle phase)\n"
                "If CYCLE data is present, tie food/hormone advice to her current phase.\n"
                "If JOURNAL notes mention symptoms, reference them.\n"
                "Never diagnose. Not her doctor.\n"
                "NEVER invent lab values, body fat, BMI, or symptoms not in the data above."
            ),
        }
    ]
    for h in history[-10:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": question})

    try:
        resp = ollama.chat.completions.create(
            model="llama3",
            messages=messages,
            temperature=0.35,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception:
        return ""


def answer_health_question(question: str, history: list[dict]) -> str:
    """Single fast pass: HER context + quick research → one answer.

    Replaces the old two-LLM-call + double-research pipeline (which made the
    chat feel like it was "thinking too much"). Still personalized to Melani
    and still researches — just in one shot with a time budget.
    """
    if classify_intent_with_history(question, history) == "supplement":
        return answer_supplement_question(question, history)

    recall = is_recall_question(question)
    followup = is_followup(question) and bool(history)
    slices = context_for_question(question, history)
    # Recall questions are about HER logged data — skip the web research detour.
    research = "" if recall else quick_research(question)

    system = (
        f"{jarvis_context_block()}\n\n{slices}\n"
    )
    if research:
        system += f"\n=== ONLINE RESEARCH (time-boxed) ===\n{research}\n"

    if followup:
        system += (
            "\nCONVERSATION CONTINUITY: This is a follow-up to what you were just discussing. "
            "Use the chat history below to resolve what she means by vague references like 'it', "
            "'this', 'the blue spoon', 'the scoop', 'to the top'. Do NOT ask her to repeat herself "
            "or restate the product — figure it out from the prior turns. If she just mentioned a "
            "specific product (e.g. Thorne creatine), assume she's still asking about that.\n"
        )

    if recall:
        system += (
            "\nYou are Dr. Melani — Melani's personal health AI with total recall of her chart.\n"
            "She is asking you to recall something SHE logged or noted. The answer is in the data "
            "above. Read every section carefully, find the matching note, and quote it back with its "
            "date. If you genuinely find nothing after checking BOWEL PRIVATE NOTES, JOURNAL, brain "
            "fog, and meals, say exactly what categories you checked. Never falsely claim she left no "
            "note. Be warm and specific, like a sharp doctor who remembers everything she tells her."
        )
    else:
        system += (
            "\nYou are Dr. Melani — Melani's personal health AI. Answer fast and direct, "
            "like a sharp doctor texting her. Always ground advice in HER data above first.\n"
            "Format (keep it tight, skip empty sections):\n"
            "**Your chart:** her real numbers/dates/cycle if relevant (never invent values)\n"
            "**Bottom line:** the answer in 1–2 sentences\n"
            "**For you:** one concrete next step\n"
            "No filler, no disclaimers beyond a brief 'not your doctor' only if she asks for a diagnosis."
        )

    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for h in history[-6:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": question})

    # Smart mode for recall + general reasoning: Claude Opus if a key is set,
    # otherwise the best installed local model with a bigger answer budget.
    answer = _fast_chat(messages, temperature=0.3, max_tokens=900, smart=True)
    if answer:
        return answer

    # Fallback: still personalized, no LLM.
    return (
        f"**Your chart:** {flagged_labs_summary()[:220]}\n"
        "**Bottom line:** I couldn't reach the model just now — try again in a sec.\n"
        "**For you:** ask me again; your data's already loaded."
    )
