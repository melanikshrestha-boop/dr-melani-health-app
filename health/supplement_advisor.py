"""Personalized supplement critique — evidence, brand checks, chart fit."""

from __future__ import annotations

import re
from typing import Any

from .jarvis_data import flagged_labs_summary
from . import supplements

# Known profiles for Melani's stack.
SUPPLEMENT_PROFILES: dict[str, dict[str, Any]] = {
    "vitamin d": {
        "aliases": ("vitamin d", "vit d", "d3", "cholecalciferol"),
        "evidence": "Strong for deficiency correction; modest benefit for bone/immune health when levels are low.",
        "benefits_for_her": "Reasonable if labs show low 25-OH vitamin D — supports bone health during growth.",
        "concerns": "Fat-soluble — avoid megadoses without labs. Take with food containing fat.",
        "lipid_note": "Neutral for LDL/TG when dosed appropriately.",
        "migraine_note": "Low vitamin D is linked to headache disorders in some studies — worth checking her level.",
        "brand_note": "Any reputable US brand with third-party testing (USP, NSF) beats unknown fillers.",
        "default_verdict": "Good fit if deficient — take right after breakfast; confirm level with Dr. Ververis.",
    },
    "ashwagandha": {
        "aliases": ("ashwagandha", "withania"),
        "evidence": "Moderate evidence for stress/cortisol; mixed quality across products.",
        "benefits_for_her": "May help stress-related fatigue — but she already tracks brain fog; watch for overlap.",
        "concerns": "Can affect thyroid labs, liver enzymes, and blood pressure in some people. Not ideal to stack blindly.",
        "lipid_note": "Some small trials show lipid improvements; evidence not strong enough to rely on instead of diet.",
        "migraine_note": "Stress reduction may help migraines indirectly — also watch sleep disruption if overstimulated.",
        "brand_note": "Ayurvedic brands vary widely. Patanjali products have had quality scrutiny in media — prefer batch-tested brands.",
        "default_verdict": "Proceed with caution — 7 p.m. timing; discuss with Dr. Ververis given thyroid/migraine monitoring.",
    },
    "immunogrid gold": {
        "aliases": ("immunogrid", "immuno grid", "immunogrid gold"),
        "evidence": "Proprietary Ayurvedic blend — limited published trials under this exact name.",
        "benefits_for_her": "Marketing claims immunity support; no substitute for sleep, protein, and flagged-lipid nutrition.",
        "concerns": "Multi-herb blends hide individual doses — hard to know interactions with migraines or future meds.",
        "lipid_note": "No strong evidence this improves LDL/TG; don't expect it to fix flagged lipids.",
        "migraine_note": "Unknown herb interactions — proprietary blends are a migraine trigger wildcard.",
        "brand_note": "Patanjali — verify label, batch, and expiry; research whether this SKU is sold for your market.",
        "default_verdict": "Low evidence for her goals — I'd prioritize vitamin D + food over immunity blends.",
    },
    "creatine": {
        "aliases": ("creatine", "creatine monohydrate"),
        "evidence": "Strong for strength/power; creatine monohydrate is the best-studied form.",
        "benefits_for_her": "Supports gym gains (she trains glutes/legs) — 3–5 g/day monohydrate is standard in research.",
        "concerns": "Hydrate well; avoid if kidney disease (discuss with Dr. Ververis). Not a lipid fix.",
        "lipid_note": "Neutral to mildly helpful with resistance training — not a cholesterol treatment.",
        "migraine_note": "Dehydration worsens migraines — pair creatine with her 4 L water goal.",
        "brand_note": "Choose creatine monohydrate only; Creapure or third-party tested (NSF/Informed Sport) to avoid adulterants.",
        "default_verdict": "Good fit for training — 3–5 g/day monohydrate with water; ask Dr. Ververis if kidney concerns.",
    },
}

PATANJALI_BRAND_FLAGS = (
    "Patanjali is a mass-market Ayurvedic brand — quality varies by product and batch.",
    "Indian Ayurvedic supplements have historically had heavy-metal contamination risks in some independent tests — third-party COA matters.",
    "If the label is unclear, expired, or bought from an unofficial seller, treat it as high risk.",
)


def _normalize_name(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower().strip())


def match_profile(name: str, ingredients: str = "") -> tuple[str, dict] | tuple[None, None]:
    blob = _normalize_name(f"{name} {ingredients}")
    for key, profile in SUPPLEMENT_PROFILES.items():
        if any(alias in blob for alias in profile.get("aliases", (key,))):
            return key, profile
    return None, None


def match_catalog(name: str, brand: str = "") -> dict | None:
    blob = _normalize_name(f"{name} {brand}")
    hit = supplements.find_by_name(blob)
    if hit:
        return hit
    if "creatine" in blob:
        return supplements.find_by_name("creatine")
    if "patanjali" in blob and "ashwagandha" in blob:
        return supplements.find_by_name("ashwagandha")
    if "patanjali" in blob and "immunogrid" in blob:
        return supplements.find_by_name("immunogrid")
    return None


def _chart_flags() -> dict[str, bool]:
    labs = flagged_labs_summary().lower()
    return {
        "ldl": "ldl" in labs and "flag" in labs,
        "tg": "triglyceride" in labs and "flag" in labs,
        "migraine": True,
    }


def score_supplement(
    name: str,
    *,
    brand: str = "",
    ingredients: str = "",
    catalog_item: dict | None = None,
) -> dict[str, Any]:
    """Structured critique — not medical advice."""
    key, profile = match_profile(name, ingredients)
    flags = _chart_flags()
    brand_low = _normalize_name(brand)
    name_display = (catalog_item or {}).get("name") or name or "Supplement"
    dose = (catalog_item or {}).get("dose") or brand or ""

    score = 72
    concerns: list[str] = []
    benefits: list[str] = []
    brand_notes: list[str] = []

    if profile:
        benefits.append(profile.get("benefits_for_her", ""))
        concerns.append(profile.get("concerns", ""))
        if flags["ldl"] or flags["tg"]:
            concerns.append(profile.get("lipid_note", ""))
        if flags["migraine"]:
            concerns.append(profile.get("migraine_note", ""))
        verdict = profile.get("default_verdict", "Discuss with Dr. Ververis.")
    else:
        score = 50
        concerns.append("I don't have a dedicated profile for this exact product — treat claims skeptically.")
        verdict = "Unknown product — photo the label and verify ingredients with Dr. Ververis."

    if "patanjali" in brand_low or "patanjali" in _normalize_name(dose):
        score -= 12
        brand_notes.extend(PATANJALI_BRAND_FLAGS)
        concerns.append("Mass-market Ayurvedic products deserve extra brand verification before trusting daily use.")

    if ingredients and re.search(r"proprietary blend| proprietary ", ingredients, re.I):
        score -= 10
        concerns.append("Proprietary blend — you can't see individual herb doses.")

    if re.search(r"cure|miracle|guaranteed|fda approved", f"{name} {ingredients}", re.I):
        score -= 15
        concerns.append("Red-flag marketing language on label or listing.")

    if key == "creatine" and catalog_item and (catalog_item.get("schedule") or "").lower() == "considering":
        verdict = profile.get("default_verdict", verdict) if profile else verdict

    score = max(15, min(95, score))
    if score >= 75:
        verdict_label = "Good fit with caveats"
    elif score >= 55:
        verdict_label = "Proceed with caution"
    else:
        verdict_label = "Not recommended without doctor sign-off"

    return {
        "name": name_display,
        "brand": brand or dose or "unknown",
        "score": score,
        "verdict_label": verdict_label,
        "verdict": verdict,
        "benefits": [b for b in benefits if b],
        "concerns": [c for c in concerns if c],
        "brand_notes": brand_notes,
        "profile_key": key,
    }


def critique_block(
    *,
    name: str = "",
    brand: str = "",
    ingredients: str = "",
    catalog_id: int | None = None,
    brand_research: str = "",
) -> str:
    """Text block for Dr. Melani context."""
    catalog_item = None
    if catalog_id:
        for item in supplements.list_catalog():
            if item["id"] == catalog_id:
                catalog_item = item
                break
    if not name and catalog_item:
        name = catalog_item["name"]
        if catalog_item.get("dose"):
            brand = brand or catalog_item["dose"]

    scoring = score_supplement(
        name,
        brand=brand,
        ingredients=ingredients,
        catalog_item=catalog_item,
    )

    lines = [
        "=== SUPPLEMENT CRITIQUE (personalized — not medical advice) ===",
        f"Product: {scoring['name']}",
        f"Brand/source: {scoring['brand']}",
        f"Fit score: {scoring['score']}/100 — {scoring['verdict_label']}",
        f"Verdict: {scoring['verdict']}",
    ]
    if scoring["benefits"]:
        lines.append("Potential upside for her:")
        for b in scoring["benefits"][:3]:
            lines.append(f"  + {b}")
    if scoring["concerns"]:
        lines.append("Concerns for her chart:")
        for c in scoring["concerns"][:4]:
            lines.append(f"  - {c}")
    if scoring["brand_notes"]:
        lines.append("Brand quality flags:")
        for n in scoring["brand_notes"][:3]:
            lines.append(f"  ! {n}")
    if brand_research:
        lines.append("")
        lines.append("=== BRAND / ONLINE CHECK ===")
        lines.append(brand_research[:1200])
    lines.append("")
    lines.append(supplements.context_block())
    return "\n".join(lines)


def catalog_advisor_lines() -> list[str]:
    """One-line critique hints for each catalog item."""
    lines = []
    for item in supplements.list_catalog():
        scoring = score_supplement(item["name"], brand=item.get("dose") or "")
        sched = item.get("schedule") or "Daily"
        lines.append(
            f"  • {item['name']}"
            f"{(' (' + item['dose'] + ')') if item.get('dose') else ''}"
            f" [{sched}] — {scoring['verdict_label']}: {scoring['verdict'][:100]}"
        )
    return lines
