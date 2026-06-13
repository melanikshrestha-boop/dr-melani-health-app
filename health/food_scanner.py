"""AI meal scanner — vision model reads macros from photos."""

import base64
import json
import re
from pathlib import Path

from openai import OpenAI

ollama = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
VISION_MODELS = ("llama3.2-vision", "llava:13b", "llava", "moondream")

MEAL_SCAN_PROMPT = """You are a precision meal analyst (like Cal AI). Study this food photo.

1. List every food item you see
2. Estimate realistic portion sizes using plate size, utensils, hands, packaging, or standard servings
3. Sum macros for the ENTIRE meal shown (not per 100g unless single packaged item)

Patient: 18-year-old woman, trains ~5x/week, prefers organic / no added sugar when inferring items.

Return JSON only:
{
  "name": "short meal title",
  "items": ["salmon fillet ~4oz", "broccoli ~1 cup", ...],
  "calories": 0,
  "protein_g": 0,
  "carbs_g": 0,
  "fat_g": 0,
  "fiber_g": 0,
  "portion_notes": "one sentence on how you sized portions",
  "confidence": "low|medium|high",
  "meal_slot_hint": "breakfast|lunch|dinner|snack|null"
}"""


def _encode_image(path: str) -> str:
    return base64.b64encode(Path(path).read_bytes()).decode()


def _parse_meal_scan_response(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}") + 1
    if start < 0:
        return {}
    try:
        return json.loads(text[start:end])
    except json.JSONDecodeError:
        return {}


def scan_meal_from_bytes(image_bytes: bytes) -> dict:
    """Portion-aware macro estimate from meal photo bytes."""
    b64 = base64.b64encode(image_bytes).decode()
    last_err = None
    for model in VISION_MODELS:
        try:
            resp = ollama.chat.completions.create(
                model=model,
                messages=[{
                    "role": "user",
                    "content": MEAL_SCAN_PROMPT,
                    "images": [b64],
                }],
                temperature=0.15,
            )
            text = resp.choices[0].message.content or "{}"
            data = _parse_meal_scan_response(text)
            if data:
                data["model"] = model
                data["source"] = "ai_scan"
                data["name"] = data.get("name") or "Scanned meal"
                return data
        except Exception as e:
            last_err = e
            continue

    return {
        "name": "Unknown meal",
        "calories": None,
        "protein_g": None,
        "carbs_g": None,
        "fat_g": None,
        "fiber_g": None,
        "confidence": "low",
        "error": str(last_err) or "No vision model. Run: ollama pull llama3.2-vision",
        "source": "ai_scan",
    }


def scan_meal_photo(image_path: str) -> dict:
    """Return estimated macros from a meal photo on disk."""
    return scan_meal_from_bytes(Path(image_path).read_bytes())


def estimate_meal_from_text(description: str) -> dict:
    """Estimate macros from a plain-English meal description (no photo)."""
    desc = (description or "").strip()
    if not desc:
        return {"error": "Describe what you ate", "name": ""}

    manual = parse_manual_macros(desc)
    explicit_macro_keys = ("protein_g", "carbs_g", "fat_g", "fiber_g")
    manual_has_macros = any(manual.get(k) is not None for k in explicit_macro_keys)
    calorie_target = manual.get("calories")
    if manual.get("calories") and manual_has_macros:
        manual["source"] = "manual_macros"
        manual["confidence"] = "high"
        manual["name"] = manual.get("name") or desc[:80]
        return manual

    from .brand_nutrition import lookup_branded_food

    branded = lookup_branded_food(desc)
    if branded and branded.get("calories"):
        if calorie_target and branded.get("calories") and branded.get("calories") > 0:
            factor = float(calorie_target) / float(branded["calories"])
            for key in explicit_macro_keys:
                if branded.get(key) is not None:
                    branded[key] = round(float(branded[key]) * factor, 1)
            branded["calories"] = float(calorie_target)
            branded["source"] = f"{branded.get('source', 'brand_lookup')}_calorie_target"
        branded["name"] = branded.get("name") or desc[:80]
        return branded

    prompt = f"""Estimate realistic macros for this meal for an 18-year-old woman who trains 5x/week.
Use the EXACT portions she describes (e.g. 1/4 salmon fillet, 7 asparagus spears, "some broccoli").
Sum everything into one meal total. Return JSON only:
{{"name": "short meal name", "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0, "confidence": "low|medium|high"}}

Meal: {desc}"""

    try:
        resp = ollama.chat.completions.create(
            model="llama3",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        text = resp.choices[0].message.content or "{}"
        start, end = text.find("{"), text.rfind("}") + 1
        if start >= 0:
            data = json.loads(text[start:end])
            if calorie_target and data.get("calories"):
                base_cal = float(data.get("calories") or 0)
                if base_cal > 0:
                    factor = float(calorie_target) / base_cal
                    for key in explicit_macro_keys:
                        if data.get(key) is not None:
                            data[key] = round(float(data[key]) * factor, 1)
                    data["calories"] = float(calorie_target)
                    data["source"] = "ai_text_calorie_target"
                else:
                    data["source"] = "ai_text"
            else:
                data["source"] = "ai_text"
            data["name"] = data.get("name") or desc[:80]
            return data
    except Exception as e:
        fallback = _fallback_meal_estimate(desc)
        if fallback:
            if calorie_target and fallback.get("calories"):
                base_cal = float(fallback["calories"] or 0)
                if base_cal > 0:
                    factor = float(calorie_target) / base_cal
                    for key in explicit_macro_keys:
                        if fallback.get(key) is not None:
                            fallback[key] = round(float(fallback[key]) * factor, 1)
                    fallback["calories"] = float(calorie_target)
                    fallback["source"] = "fallback_calorie_target"
                else:
                    fallback["source"] = "fallback"
            else:
                fallback["source"] = "fallback"
            return fallback
        return {
            "name": desc[:80],
            "calories": None,
            "protein_g": None,
            "carbs_g": None,
            "fat_g": None,
            "fiber_g": None,
            "confidence": "low",
            "error": str(e),
            "source": "ai_text",
        }

    return {"name": desc[:80], "error": "Could not estimate macros", "source": "ai_text"}


def _count_before(q: str, word: str) -> int:
    """Find a leading quantity for a food word, e.g. '2 boiled eggs' -> 2."""
    words = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
        "a": 1, "an": 1, "couple": 2, "few": 3,
    }
    m = re.search(rf"(\d+)\s+(?:\w+\s+){{0,3}}{word}", q)
    if m:
        return max(1, int(m.group(1)))
    m = re.search(rf"\b(one|two|three|four|five|six|a|an|couple|few)\s+(?:\w+\s+){{0,3}}{word}", q)
    if m:
        return words.get(m.group(1), 1)
    return 1


def _fallback_meal_estimate(desc: str):
    """Rough totals when AI is unavailable — better than nothing."""
    q = (desc or "").lower()
    if not q:
        return None
    cal = prot = carbs = fat = fiber = 0
    name_parts = []

    if "egg" in q:
        n = _count_before(q, "eggs?")
        # 1 large egg ≈ 72 cal, 6.3g protein, 0.4g carb, 4.8g fat
        cal += n * 72
        prot += n * 6.3
        carbs += n * 0.4
        fat += n * 4.8
        label = "boiled egg" if "boil" in q else "egg"
        name_parts.append(f"{n} {label}{'s' if n > 1 else ''}")
    if "salmon" in q:
        cal += 120 if any(x in q for x in ("1/4", "fourth", "quarter", "one fourth")) else 280
        prot += 15 if cal < 200 else 35
        fat += 7 if cal < 200 else 16
        name_parts.append("salmon")
    if "asparagus" in q:
        spears = 7 if "seven" in q or "7 " in q else 5
        cal += spears * 4
        prot += 1
        fiber += 2
        name_parts.append("asparagus")
    if "broccoli" in q:
        cal += 55
        prot += 4
        fiber += 5
        name_parts.append("broccoli")
    if "chicken" in q:
        cal += 220
        prot += 35
        name_parts.append("chicken")
    if "rice" in q:
        cal += 200
        carbs += 45
        name_parts.append("rice")

    if not name_parts:
        return None

    return {
        "name": " + ".join(name_parts),
        "calories": cal,
        "protein_g": prot,
        "carbs_g": carbs,
        "fat_g": fat,
        "fiber_g": fiber,
        "confidence": "low",
    }


def scan_product_label(image_path: str) -> dict:
    """Read nutrition label / product front for grocery health score."""
    b64 = _encode_image(image_path)
    prompt = """This is a food product photo (barcode, front label, or nutrition facts panel).
Extract what you can see. Return JSON only:
{
  "name": "product name",
  "barcode": "digits if visible else null",
  "sugars_100g": number or null,
  "saturated_fat_100g": number or null,
  "sodium_100g": number in g per 100g or null,
  "fiber_100g": number or null,
  "proteins_100g": number or null,
  "calories_100g": number or null,
  "nutriscore_grade": "A-E or null",
  "nova_group": 1-4 or null,
  "ingredients_snippet": "first 100 chars if visible"
}
Use per 100g values from the label when possible."""

    last_err = None
    for model in VISION_MODELS:
        try:
            resp = ollama.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt, "images": [b64]}],
                temperature=0.1,
            )
            text = resp.choices[0].message.content or "{}"
            start, end = text.find("{"), text.rfind("}") + 1
            if start >= 0:
                data = json.loads(text[start:end])
                data["model"] = model
                data["source"] = "label_scan"
                return data
        except Exception as e:
            last_err = e
            continue

    return {"error": str(last_err) or "Vision model unavailable. Run: ollama pull llama3.2-vision"}


def parse_manual_macros(text: str) -> dict:
    """Parse '520 cal 38g protein' style text."""
    out = {"name": text[:80]}
    for key, pat in [
        ("calories", r"(\d+)\s*cal"),
        ("protein_g", r"(\d+(?:\.\d+)?)\s*g?\s*protein"),
        ("carbs_g", r"(\d+(?:\.\d+)?)\s*g?\s*carbs?"),
        ("fat_g", r"(\d+(?:\.\d+)?)\s*g?\s*fat"),
        ("fiber_g", r"(\d+(?:\.\d+)?)\s*g?\s*fiber"),
    ]:
        m = re.search(pat, text, re.I)
        if m:
            out[key] = float(m.group(1))
    return out
