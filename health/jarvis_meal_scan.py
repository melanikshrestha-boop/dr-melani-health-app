"""Dr. Melani meal photo scan — portion-aware macro logging (Cal AI style)."""

from __future__ import annotations

import re
from datetime import datetime

from .db import today
from .food_scanner import scan_meal_from_bytes
from .jarvis_actions import _infer_meal_slot
from .nutrition import save_meal, slot_label
from .paths import HEALTH_DATA


def is_meal_photo(question: str, photo_mode: str = "auto") -> bool:
    if (photo_mode or "auto").lower() == "supplement":
        return False
    if (photo_mode or "auto").lower() == "meal":
        return True
    q = (question or "").lower().strip()
    if re.search(
        r"supplement|vitamin|capsule|ashwagandha|probiotic|barcode|nutrition label|"
        r"creatine|monohydrate|patanjali|immunogrid|powder|bottle|tub|label|"
        r"good for me\?|is this ok|is this good|sketchy|brand|legit|product shot|screenshot of",
        q,
    ):
        return False
    if re.search(
        r"scan|log|meal|lunch|dinner|breakfast|snack|ate|macro|calories|portion|food|plate",
        q,
    ):
        return True
    return len(q) < 35


def _save_scan_image(image_bytes: bytes) -> str:
    path = HEALTH_DATA / "nutrition" / "meals" / f"_chat_scan_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(image_bytes)
    return str(path)


def handle_meal_photo(question: str, image_bytes: bytes, photo_mode: str = "auto") -> dict | None:
    if not is_meal_photo(question, photo_mode):
        return None

    data = scan_meal_from_bytes(image_bytes)
    if not data.get("name") and not data.get("calories"):
        return None

    hint = (data.get("meal_slot_hint") or "").lower()
    slot = _infer_meal_slot(question or hint or "lunch")
    if hint in ("breakfast", "lunch", "dinner"):
        slot = hint
    elif hint == "snack":
        slot = _infer_meal_slot(question or "snack")

    photo_path = _save_scan_image(image_bytes)
    save_meal(
        slot=slot,
        name=data.get("name") or "Scanned meal",
        calories=data.get("calories"),
        protein_g=data.get("protein_g"),
        carbs_g=data.get("carbs_g"),
        fat_g=data.get("fat_g"),
        fiber_g=data.get("fiber_g"),
        source="ai_scan",
        photo_path=photo_path,
        day=today(),
    )

    name = data.get("name") or "Meal"
    cal = int(data.get("calories") or 0)
    prot = int(data.get("protein_g") or 0)
    conf = data.get("confidence") or "medium"
    items = data.get("items") or []
    item_line = ""
    if items:
        item_line = "\n" + ", ".join(items[:4])
        if len(items) > 4:
            item_line += f" +{len(items) - 4} more"

    answer = (
        f"✓ {slot_label(slot)}: {name}\n"
        f"~{cal} cal · {prot}g protein · {conf} confidence"
        f"{item_line}"
    )
    if data.get("portion_notes"):
        answer += f"\n({data['portion_notes'][:120]})"

    return {
        "answer": answer,
        "links": [],
        "logged": [answer],
        "auto_log": True,
        "log_only": True,
        "meal_scan": True,
    }
