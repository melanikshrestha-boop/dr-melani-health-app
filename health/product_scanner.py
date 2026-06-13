from __future__ import annotations

"""Barcode + label scanner with evidence-based health scoring (Yuka-style)."""

import json
import re
from datetime import datetime
from difflib import SequenceMatcher
from typing import Any
from urllib.parse import quote_plus
from urllib.request import urlopen
from urllib.error import URLError

from .clinical_knowledge import scoring_rubric
from .db import get_conn
from .paths import HEALTH_DATA

OFF_API = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"


def _num(val: Any) -> float | None:
    try:
        if val is None:
            return None
        return float(val)
    except (TypeError, ValueError):
        return None


def _patient_lipid_flags() -> dict:
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT test, result, flag FROM lab_values
               WHERE test IN ('LDL Cholesterol','Triglycerides','Non-HDL Cholesterol','Total Cholesterol')
               AND flag IS NOT NULL ORDER BY draw_id DESC"""
        ).fetchall()
    return {r["test"]: r for r in rows}


def _parse_serving_grams(raw: str | None) -> float | None:
    if not raw:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*g\b", str(raw).lower())
    if m:
        return float(m.group(1))
    m = re.search(r"(\d+(?:\.\d+)?)", str(raw))
    return float(m.group(1)) if m else None


def meal_macros_from_off(product: dict) -> dict:
    """Convert Open Food Facts product dict to per-serving meal macros."""
    n = product.get("nutriments") or {}
    name = product.get("name") or product.get("product_name") or product.get("generic_name") or "Product"
    brand = product.get("brand") or product.get("brands") or ""
    if brand and brand.lower() not in name.lower():
        name = f"{brand} {name}".strip()

    cal = _num(n.get("energy-kcal_serving")) or _num(n.get("energy_kcal_serving"))
    prot = _num(n.get("proteins_serving"))
    carbs = _num(n.get("carbohydrates_serving"))
    fat = _num(n.get("fat_serving"))
    fiber = _num(n.get("fiber_serving"))
    serving_notes = product.get("serving_size") or product.get("quantity") or ""

    if cal is None:
        serving_g = _parse_serving_grams(product.get("serving_size") or product.get("quantity"))
        factor = (serving_g / 100.0) if serving_g else 1.0
        cal = _num(n.get("energy-kcal_100g")) or _num(n.get("energy_kcal_100g"))
        prot = _num(n.get("proteins_100g"))
        carbs = _num(n.get("carbohydrates_100g"))
        fat = _num(n.get("fat_100g"))
        fiber = _num(n.get("fiber_100g"))
        if factor != 1.0:
            cal = cal * factor if cal is not None else None
            prot = prot * factor if prot is not None else None
            carbs = carbs * factor if carbs is not None else None
            fat = fat * factor if fat is not None else None
            fiber = fiber * factor if fiber is not None else None
            serving_notes = serving_notes or f"{int(serving_g)}g serving"

    return {
        "name": name[:120],
        "calories": round(cal) if cal is not None else None,
        "protein_g": round(prot, 1) if prot is not None else None,
        "carbs_g": round(carbs, 1) if carbs is not None else None,
        "fat_g": round(fat, 1) if fat is not None else None,
        "fiber_g": round(fiber, 1) if fiber is not None else None,
        "serving_notes": serving_notes or None,
    }


def lookup_product_by_name(description: str, *, min_score: float = 0.45) -> dict | None:
    """Search Open Food Facts by product name."""
    query = re.sub(r"\s+", " ", (description or "").strip())
    if not query:
        return None
    try:
        with urlopen(
            f"https://world.openfoodfacts.org/cgi/search.pl?"
            f"search_terms={quote_plus(query)}&search_simple=1&action=process&json=1&page_size=8",
            timeout=12,
        ) as resp:
            products = json.loads(resp.read().decode()).get("products") or []
    except (URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None

    best = None
    best_score = 0.0
    q_norm = query.lower()
    for p in products:
        candidate = f"{p.get('brands') or ''} {p.get('product_name') or p.get('generic_name') or ''}".strip()
        score = SequenceMatcher(None, q_norm, candidate.lower()).ratio()
        if score > best_score:
            best_score = score
            best = p

    if not best or best_score < min_score:
        return None

    n = best.get("nutriments") or {}
    return {
        "barcode": best.get("code"),
        "name": best.get("product_name") or best.get("generic_name") or query,
        "brand": best.get("brands") or "",
        "image_url": best.get("image_front_small_url") or "",
        "nutriscore_grade": (best.get("nutriscore_grade") or "").upper(),
        "nova_group": best.get("nova_group"),
        "ingredients": (best.get("ingredients_text") or "")[:500],
        "nutriments": {
            "sugars_100g": _num(n.get("sugars_100g")),
            "saturated_fat_100g": _num(n.get("saturated-fat_100g")),
            "sodium_100g": _num(n.get("sodium_100g")),
            "fiber_100g": _num(n.get("fiber_100g")),
            "proteins_100g": _num(n.get("proteins_100g")),
            "energy_kcal_100g": _num(n.get("energy-kcal_100g")),
            "energy_kcal_serving": _num(n.get("energy-kcal_serving")),
            "proteins_serving": _num(n.get("proteins_serving")),
            "carbohydrates_serving": _num(n.get("carbohydrates_serving")),
            "fat_serving": _num(n.get("fat_serving")),
            "fiber_serving": _num(n.get("fiber_serving")),
        },
        "serving_size": best.get("serving_size"),
        "quantity": best.get("quantity"),
        "source": "open_food_facts",
        "match_score": round(best_score, 2),
    }


def lookup_barcode(barcode: str) -> dict | None:
    barcode = re.sub(r"\D", "", barcode or "")
    if len(barcode) < 8:
        return None
    try:
        with urlopen(OFF_API.format(barcode=barcode), timeout=12) as resp:
            data = json.loads(resp.read().decode())
    except (URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None
    if data.get("status") != 1:
        return None
    p = data.get("product") or {}
    n = p.get("nutriments") or {}
    return {
        "barcode": barcode,
        "name": p.get("product_name") or p.get("generic_name") or "Unknown product",
        "brand": p.get("brands") or "",
        "image_url": p.get("image_front_small_url") or "",
        "nutriscore_grade": (p.get("nutriscore_grade") or "").upper(),
        "nova_group": p.get("nova_group"),
        "ingredients": (p.get("ingredients_text") or "")[:500],
        "serving_size": p.get("serving_size"),
        "quantity": p.get("quantity"),
        "nutriments": {
            "sugars_100g": _num(n.get("sugars_100g")),
            "saturated_fat_100g": _num(n.get("saturated-fat_100g")),
            "sodium_100g": _num(n.get("sodium_100g")),
            "fiber_100g": _num(n.get("fiber_100g")),
            "proteins_100g": _num(n.get("proteins_100g")),
            "energy_kcal_100g": _num(n.get("energy-kcal_100g")),
            "energy_kcal_serving": _num(n.get("energy-kcal_serving")),
            "proteins_serving": _num(n.get("proteins_serving")),
            "carbohydrates_serving": _num(n.get("carbohydrates_serving")),
            "fat_serving": _num(n.get("fat_serving")),
            "fiber_serving": _num(n.get("fiber_serving")),
        },
        "source": "open_food_facts",
    }


def score_product(product: dict) -> dict:
    """0–100 score + verdict + evidence bullets, personalized to Melani's labs."""
    name = (product.get("name") or "Product").lower()
    n = product.get("nutriments") or product
    if isinstance(n, dict) and "nutriments" in product:
        n = product["nutriments"]

    score = 72
    notes: list[str] = []
    flags = _patient_lipid_flags()
    has_ldl = "LDL Cholesterol" in flags

    sat = _num(n.get("saturated_fat_100g"))
    sugar = _num(n.get("sugars_100g"))
    sodium = _num(n.get("sodium_100g"))
    fiber = _num(n.get("fiber_100g"))

    if sat is not None:
        if sat > 5:
            score -= 15
            notes.append(f"High saturated fat ({sat}g/100g) — AHA: limit for LDL (yours flagged).")
        elif sat < 1.5:
            score += 5
            notes.append("Lower saturated fat — heart-friendly choice.")

    if sugar is not None:
        if sugar > 15:
            score -= 18
            notes.append(f"High sugar ({sugar}g/100g) — AHA: excess sugar raises TG.")
        elif sugar > 10:
            score -= 12
            notes.append(f"Moderate-high sugar ({sugar}g/100g).")
        elif sugar < 5:
            score += 4

    if sodium is not None:
        sodium_mg = sodium * 1000 if sodium < 10 else sodium
        if sodium_mg > 600:
            score -= 10
            notes.append("High sodium — AHA recommends limiting for blood pressure.")

    if fiber is not None and fiber >= 3:
        score += 8
        notes.append(f"Good fiber ({fiber}g/100g) — helps LDL (evidence-based).")

    nova = product.get("nova_group")
    if nova == 4:
        score -= 12
        notes.append("Ultra-processed (NOVA 4) — linked to worse metabolic outcomes.")
    elif nova in (1, 2):
        score += 6
        notes.append("Minimally processed — generally preferred.")

    grade = (product.get("nutriscore_grade") or "").upper()
    if grade in ("A", "B"):
        score += 8
    elif grade in ("D", "E"):
        score -= 10
        notes.append(f"Nutri-Score {grade} — typically higher in sugar/sat fat/sodium.")

    if any(f in name for f in ("salmon", "sardine", "mackerel", "trout")):
        score += 10
        notes.append("Fatty fish — omega-3s support TG and heart health (AHA).")

    if has_ldl and sat and sat > 3:
        score -= 5
        notes.append("Extra caution: your LDL is above goal — watch saturated fat.")

    score = max(0, min(100, int(round(score))))

    if score >= 75:
        verdict = "Great"
        color = "green"
    elif score >= 55:
        verdict = "Good"
        color = "blue"
    elif score >= 40:
        verdict = "Limit"
        color = "yellow"
    else:
        verdict = "Avoid"
        color = "red"

    if not notes:
        notes.append("Limited nutrition data — check the label. Whole foods usually score better.")

    return {
        "score": score,
        "verdict": verdict,
        "color": color,
        "notes": notes[:4],
        "personalized": bool(flags),
    }


def scan_barcode(barcode: str) -> dict:
    product = lookup_barcode(barcode)
    if not product:
        return {
            "ok": False,
            "error": "Product not found. Try scanning the nutrition label instead.",
            "barcode": barcode,
        }
    scoring = score_product(product)
    result = {**product, **scoring, "ok": True}
    _save_scan(result)
    return result


def scan_label_photo(image_path: str) -> dict:
    from .food_scanner import scan_product_label

    parsed = scan_product_label(image_path)
    if parsed.get("error") and not parsed.get("name"):
        return {"ok": False, "error": parsed.get("error", "Could not read label.")}

    product = {
        "name": parsed.get("name") or "Scanned product",
        "barcode": parsed.get("barcode"),
        "nutriments": {
            "sugars_100g": parsed.get("sugars_100g"),
            "saturated_fat_100g": parsed.get("saturated_fat_100g"),
            "sodium_100g": parsed.get("sodium_100g"),
            "fiber_100g": parsed.get("fiber_100g"),
            "proteins_100g": parsed.get("proteins_100g"),
            "energy_kcal_100g": parsed.get("calories_100g"),
        },
        "nova_group": parsed.get("nova_group"),
        "nutriscore_grade": parsed.get("nutriscore_grade"),
        "source": "label_scan",
    }
    scoring = score_product(product)
    result = {**product, **scoring, "ok": True}
    _save_scan(result)
    return result


def _save_scan(result: dict):
    path = HEALTH_DATA / "grocery" / "scans" / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=2, default=str))
