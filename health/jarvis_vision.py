"""Dr. Melani vision — extract product from image, then personalized answer."""

from __future__ import annotations

import base64
import json

from openai import OpenAI

from .food_scanner import VISION_MODELS
from .jarvis_brain import (
    build_supplement_context,
    chart_read,
    melani_briefing,
    synthesize_supplement_answer,
    synthesize_answer,
    build_ai_context,
)
from .jarvis_research import search_evidence, personalized_research_query, search_supplement_bundle
from .product_scanner import score_product
from . import supplement_advisor
from . import supplements

ollama = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama", timeout=120.0)

MAX_IMAGE_BYTES = 10 * 1024 * 1024


def encode_image_bytes(data: bytes) -> str:
    return base64.b64encode(data).decode()


def _parse_json(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass
    return {}


def extract_product_from_image(image_bytes: bytes) -> dict:
    """Stage 1 — read product name, type, ingredients from screenshot."""
    b64 = encode_image_bytes(image_bytes)
    prompt = """Read this product image (supplement bottle, label, Amazon listing, or storefront photo).
Return JSON only:
{
  "name": "product name",
  "brand": "brand or null",
  "product_type": "supplement|food|other",
  "ingredients_or_claims": "visible ingredients, dose, or marketing claims",
  "is_supplement": true/false,
  "form": "capsule|powder|tablet|liquid|unknown"
}
Only include what you can clearly read. If it looks like creatine, ashwagandha, vitamin D, or Patanjali, say so."""

    last_err = None
    for model in VISION_MODELS:
        try:
            resp = ollama.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt, "images": [b64]}],
                temperature=0.1,
            )
            data = _parse_json(resp.choices[0].message.content or "{}")
            if data.get("name"):
                data["model"] = model
                return data
        except Exception as e:
            last_err = e
            continue
    return {"error": str(last_err) if last_err else "Could not read image", "name": "Unknown product"}


def _is_supplement_product(product: dict) -> bool:
    if product.get("is_supplement"):
        return True
    if (product.get("product_type") or "").lower() == "supplement":
        return True
    blob = f"{product.get('name', '')} {product.get('brand', '')} {product.get('ingredients_or_claims', '')}".lower()
    return bool(
        supplement_advisor.match_profile(blob)[0]
        or supplements.find_by_name(blob)
        or any(k in blob for k in ("creatine", "ashwagandha", "vitamin", "capsule", "patanjali", "immunogrid"))
    )


def _supplement_context(product: dict, brand_research: str = "") -> str:
    """Build scoring/context block for supplements."""
    name = product.get("name") or "product"
    brand = product.get("brand") or ""
    ingredients = product.get("ingredients_or_claims") or ""
    catalog_item = supplement_advisor.match_catalog(name, brand)

    scoring = supplement_advisor.score_supplement(
        name,
        brand=brand,
        ingredients=ingredients,
        catalog_item=catalog_item,
    )

    lines = [
        f"Product extracted from image: {name}",
        f"Brand: {brand or 'unknown'}",
        f"Type: {product.get('product_type') or 'unknown'} · Form: {product.get('form') or 'unknown'}",
        f"Fit score: {scoring['score']}/100 — {scoring['verdict_label']}",
        f"Pre-read verdict: {scoring['verdict']}",
    ]
    if catalog_item:
        lines.append(
            f"Matches her catalog: {catalog_item['name']}"
            f"{(' (' + catalog_item['dose'] + ')') if catalog_item.get('dose') else ''}"
        )
    if ingredients:
        lines.append(f"Label/claims: {ingredients[:400]}")
    if scoring["concerns"]:
        lines.append("Concerns:")
        for note in scoring["concerns"][:4]:
            lines.append(f"  - {note}")
    if brand_research:
        lines.append("")
        lines.append(brand_research[:1000])

    low = name.lower()
    if any(k in low for k in ("bar", "cereal", "snack", "chips", "yogurt", "bread")):
        food_scoring = score_product({"name": name, "nutriments": {}})
        lines.append(f"Food score estimate: {food_scoring.get('verdict')} ({food_scoring.get('score')}/100)")
    return "\n".join(lines)


def analyze_image(
    question: str,
    image_bytes: bytes,
    system_context: str,
    history: list | None = None,
    *,
    supplement_id: int | None = None,
    force_supplement: bool = False,
) -> str:
    """Stage 2 — extract product, research, synthesize personalized answer."""
    if len(image_bytes) > MAX_IMAGE_BYTES:
        return "That image is too large — try under 10 MB or crop it tighter."

    product = extract_product_from_image(image_bytes)
    if product.get("error") and not product.get("name"):
        return _vision_fallback(question, image_bytes, system_context, supplement=True)

    user_q = (question or "").strip() or "Is this good for me? Is this brand legit?"
    is_sup = force_supplement or _is_supplement_product(product) or supplement_id

    name = product.get("name") or ""
    brand = product.get("brand") or ""
    ingredients = product.get("ingredients_or_claims") or ""

    if is_sup:
        ctx, brand_research = build_supplement_context(
            user_q,
            supplement_id=supplement_id,
            product_name=name,
            brand=brand,
            ingredients=ingredients,
        )
        product_ctx = _supplement_context(product, brand_research)
        ctx += f"\n\n=== IMAGE EXTRACTION ===\n{product_ctx}\n\nUser question: {user_q}\n"
        chart = chart_read(user_q, ctx)
        research = brand_research or search_evidence(
            personalized_research_query(f"{brand} {name} {user_q}", melani_briefing()),
            force=True,
        )
        answer = synthesize_supplement_answer(user_q, ctx, chart, research, history or [])
        if answer:
            return answer
        return _vision_fallback(question, image_bytes, ctx, supplement=True)

    briefing = melani_briefing()
    product_ctx = _supplement_context(product)
    research_q = personalized_research_query(f"{name} {user_q}", briefing)
    _, brand_research = search_supplement_bundle(name, brand, briefing, ingredients)
    research = search_evidence(research_q, force=True)
    if brand_research:
        research = (research + "\n\n" + brand_research) if research else brand_research

    ctx = (
        f"{system_context}\n\n"
        f"=== IMAGE EXTRACTION ===\n{product_ctx}\n\n"
        f"User question: {user_q}\n"
    )
    if research:
        ctx += f"\n=== ONLINE RESEARCH ===\n{research}\n"

    chart = chart_read(user_q, ctx)
    answer = synthesize_answer(user_q, ctx, chart, research, history or [])
    if answer:
        return answer

    return _vision_fallback(question, image_bytes, ctx)


def _vision_fallback(
    question: str,
    image_bytes: bytes,
    system_context: str,
    *,
    supplement: bool = False,
) -> str:
    """Direct vision answer if synthesis fails."""
    b64 = encode_image_bytes(image_bytes)
    user_q = (question or "").strip() or "What do you see and is it good for my health?"

    if supplement:
        sections = (
            "**Your chart:** **This product:** **Brand check:** "
            "**What evidence says:** **Verdict:**"
        )
    else:
        sections = "**Your chart:** **What I see:** **What evidence says:** **For you:**"

    prompt = f"""{system_context}

User question: {user_q}

Use sections: {sections}
Never diagnose. Be skeptical of sketchy supplement brands."""

    last_err = None
    for model in VISION_MODELS:
        try:
            resp = ollama.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt, "images": [b64]}],
                temperature=0.35,
            )
            text = (resp.choices[0].message.content or "").strip()
            if text:
                return text
        except Exception as e:
            last_err = e
            continue

    err = str(last_err) if last_err else ""
    if "not found" in err.lower() or "404" in err:
        return (
            "I can't read images yet — restart from your **Melani Health start file**, "
            "then try again in a minute."
        )
    return (
        "I couldn't read that image right now. Try a clearer photo of the label "
        "(front + ingredients panel) and send again."
    )
