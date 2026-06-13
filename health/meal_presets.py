"""Saved meal presets — one-tap logging for Melani's usual meals."""

from __future__ import annotations

import json
from datetime import datetime

from .paths import HEALTH_DATA
from .nutrition import save_meal, slot_label

PRESETS_FILE = HEALTH_DATA / "nutrition" / "meal_presets.json"

DEFAULT_CHIPOTLE_BOWL = {
    "id": "chipotle_burrito_bowl",
    "slot": "lunch",
    "title": "Chipotle burrito bowl",
    "name": "Chipotle burrito bowl",
    "calories": 585,
    "protein_g": 27,
    "carbs_g": 59,
    "fat_g": 23,
    "fiber_g": 4,
    "source": "preset",
    "notes": (
        "Macros from chipotle.com/nutrition-calculator (US standard portions, Mar 2025). "
        "Fiber from Chipotle US Nutrition Facts PDF where calculator omits it."
    ),
    "ingredients": [
        "Cilantro-Lime Brown Rice (4 oz) — 210 cal · 6g F · 36g C · 4g P",
        "Fresh Tomato Salsa (4 oz) — 25 cal · 0g F · 4g C · 0g P",
        "Chipotle Honey Chicken (4 oz) — 210 cal · 8g F · 13g C · 21g P",
        "Tomatillo-Red Chili Salsa (2 oz) — 30 cal · 0g F · 4g C · 0g P",
        "Sour Cream (2 oz) — 110 cal · 9g F · 2g C · 2g P",
    ],
    "updated_at": datetime.now().isoformat(),
}

DEFAULT_BREAKFAST = {
    "id": "breakfast_usual",
    "slot": "breakfast",
    "title": "My usual breakfast",
    "name": "Melani's usual breakfast",
    "calories": 715,
    "protein_g": 49,
    "carbs_g": 58,
    "fat_g": 28,
    "fiber_g": 14,
    "source": "preset",
    "notes": "0% added sugar · organic when possible · Trader Joe's raw honey",
    "ingredients": [
        "Fage 0% Greek yogurt (plain, organic)",
        "Fage 0% kefir (no added sugar)",
        "2 tsp chia seeds",
        "2 tsp flaxseeds",
        "Small handful pumpkin seeds",
        "2 handfuls blueberries (daily)",
        "5 strawberries (fruit may vary; blueberries stay)",
        "1 handful makhana (fox nuts)",
        "Light drizzle organic raw honey (Trader Joe's)",
        "1 whole boiled egg + 1 egg white only (yolk discarded)",
    ],
    "updated_at": datetime.now().isoformat(),
}


DEFAULT_PRESETS = [DEFAULT_BREAKFAST, DEFAULT_CHIPOTLE_BOWL]


def _ensure_file():
    PRESETS_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not PRESETS_FILE.exists():
        PRESETS_FILE.write_text(
            json.dumps({"presets": DEFAULT_PRESETS}, indent=2)
        )
        return
    data = json.loads(PRESETS_FILE.read_text())
    presets = data.get("presets", [])
    known = {p.get("id") for p in presets}
    changed = False
    for preset in DEFAULT_PRESETS:
        if preset.get("id") not in known:
            presets.append(preset)
            changed = True
    if changed:
        PRESETS_FILE.write_text(json.dumps({"presets": presets}, indent=2))


def list_presets() -> list[dict]:
    _ensure_file()
    data = json.loads(PRESETS_FILE.read_text())
    return data.get("presets", [])


def get_preset(preset_id: str) -> dict | None:
    for p in list_presets():
        if p.get("id") == preset_id:
            return p
    return None


def save_preset(preset: dict) -> dict:
    _ensure_file()
    data = json.loads(PRESETS_FILE.read_text())
    presets = data.get("presets", [])
    preset = dict(preset)
    preset["updated_at"] = datetime.now().isoformat()
    out = []
    replaced = False
    for p in presets:
        if p.get("id") == preset.get("id"):
            out.append(preset)
            replaced = True
        else:
            out.append(p)
    if not replaced:
        out.append(preset)
    PRESETS_FILE.write_text(json.dumps({"presets": out}, indent=2))
    return preset


def log_preset(preset_id: str = "breakfast_usual", day: str | None = None) -> dict:
    preset = get_preset(preset_id)
    if not preset:
        raise ValueError(f"Unknown preset: {preset_id}")
    result = save_meal(
        slot=preset.get("slot", "breakfast"),
        name=preset.get("name", "Preset meal"),
        calories=preset.get("calories"),
        protein_g=preset.get("protein_g"),
        carbs_g=preset.get("carbs_g"),
        fat_g=preset.get("fat_g"),
        fiber_g=preset.get("fiber_g"),
        source="preset",
        day=day,
    )
    return {"preset": preset, "logged": result}


def breakfast_preset() -> dict:
    p = get_preset("breakfast_usual")
    return p or DEFAULT_BREAKFAST


def chipotle_bowl_preset() -> dict:
    p = get_preset("chipotle_burrito_bowl")
    return p or DEFAULT_CHIPOTLE_BOWL


def context_block() -> str:
    breakfast = breakfast_preset()
    chipotle = chipotle_bowl_preset()
    lines = [
        "=== USUAL BREAKFAST (preset) ===",
        breakfast.get("name", "My usual breakfast"),
        f"  {breakfast.get('calories', '?')} cal · {breakfast.get('protein_g', '?')}g protein · "
        f"{breakfast.get('carbs_g', '?')}g carbs · {breakfast.get('fat_g', '?')}g fat",
        f"  Notes: {breakfast.get('notes', '')}",
        "  Ingredients:",
    ]
    for item in breakfast.get("ingredients", []):
        lines.append(f"    · {item}")
    lines.append('  Say "log my breakfast" or tap Log on Meals to record it.')
    lines.extend([
        "",
        "=== COMMON FOODS (occasional — not daily) ===",
        chipotle.get("name", "Chipotle burrito bowl"),
        f"  {chipotle.get('calories', '?')} cal · {chipotle.get('protein_g', '?')}g protein · "
        f"{chipotle.get('carbs_g', '?')}g carbs · {chipotle.get('fat_g', '?')}g fat",
        "  Ingredients:",
    ])
    for item in chipotle.get("ingredients", []):
        lines.append(f"    · {item}")
    lines.append('  Say "log my chipotle bowl" when she had Chipotle — occasional only.')
    return "\n".join(lines)
