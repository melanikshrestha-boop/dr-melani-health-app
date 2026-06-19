from __future__ import annotations

"""Grocery list + product scan integration."""

import json
import re
from datetime import datetime
from urllib.parse import quote_plus

from openai import OpenAI

from .db import get_conn
from .paths import HEALTH_DATA

ollama = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")


def ensure_grocery_schema():
    with get_conn() as conn:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(grocery_items)").fetchall()}
        for col, typ in [
            ("barcode", "TEXT"),
            ("health_score", "INTEGER"),
            ("health_verdict", "TEXT"),
        ]:
            if col not in cols:
                conn.execute(f"ALTER TABLE grocery_items ADD COLUMN {col} {typ}")


def walmart_search_url(query: str) -> str:
    return f"https://www.walmart.com/search?q={quote_plus(query.strip())}"


def parse_item_names(text: str) -> list[str]:
    """Pull grocery item names from natural language (ran out of, add X and Y, etc.)."""
    chunk = (text or "").strip()
    if not chunk:
        return []
    for prefix in (
        r"^(?:please\s+)?(?:can you\s+)?",
        r"^(?:add|put)\s+",
        r"^(?:i\s+)?(?:ran|run)\s+out\s+of\s+",
        r"^(?:we(?:'re| are)\s+)?(?:out\s+of|low\s+on|running\s+low\s+on|need(?:ing)?)\s+",
        r"^(?:get|buy|pick\s+up)\s+",
        r"^(?:restock|re-?stock)\s+",
    ):
        chunk = re.sub(prefix, "", chunk, flags=re.I)
    chunk = re.sub(
        r"\s+(?:to|on|for)\s+(?:my\s+)?(?:grocery|shopping)?\s*list\b.*$",
        "",
        chunk,
        flags=re.I,
    )
    chunk = re.sub(r"\s+to\s+grocery\b.*$", "", chunk, flags=re.I)
    parts = re.split(r",|\band\b|\n|;", chunk)
    items: list[str] = []
    skip = {"etc", "stuff", "things", "food", "groceries", "some", "grocery", "list", "shop"}
    for part in parts:
        name = part.strip().strip(".")
        name = re.sub(r"^(some|a few|also|plus|the)\s+", "", name, flags=re.I)
        name = name.strip()
        if len(name) > 1 and name.lower() not in skip:
            items.append(name.title())
    out: list[str] = []
    seen: set[str] = set()
    for name in items:
        key = name.lower()
        if key not in seen:
            seen.add(key)
            out.append(name)
    return out[:30]


def format_sparky_prompt(items: list[str] | None = None) -> str:
    """One paste-ready prompt for Walmart Ask Sparky."""
    if items is None:
        items = [i["name"] for i in list_items(checked_only=False) if not i.get("checked")]
    if not items:
        return ""
    lines = "\n".join(f"- {name}" for name in items)
    return (
        "Add these grocery items to my cart for Walmart+ delivery. "
        "Pick the best value organic option when available:\n"
        f"{lines}"
    )


def add_items(names: list[str], *, added_by: str = "dr_melani", reason: str = "") -> list[dict]:
    added = []
    for name in names:
        n = (name or "").strip()
        if len(n) > 1:
            added.append(add_item(n, added_by=added_by, reason=reason or "Added via Dr. Melani"))
    return added


def list_items(checked_only: bool | None = None) -> list:
    ensure_grocery_schema()
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM grocery_items ORDER BY checked, id DESC").fetchall()
    items = [dict(r) for r in rows]
    if checked_only is True:
        return [i for i in items if i["checked"]]
    if checked_only is False:
        return [i for i in items if not i["checked"]]
    return items


def add_item(
    name: str,
    category: str = "",
    quantity: str = "",
    added_by: str = "manual",
    reason: str = "",
    barcode: str | None = None,
    health_score: int | None = None,
    health_verdict: str | None = None,
) -> dict:
    ensure_grocery_schema()
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO grocery_items
               (name, category, quantity, checked, added_by, reason, barcode, health_score, health_verdict, created_at)
               VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)""",
            (
                name, category, quantity, added_by, reason,
                barcode, health_score, health_verdict, datetime.now().isoformat(),
            ),
        )
        iid = cur.lastrowid
    _sync_list()
    return {"id": iid, "name": name, "health_score": health_score, "health_verdict": health_verdict}


def delete_item(item_id: int):
    ensure_grocery_schema()
    with get_conn() as conn:
        conn.execute("DELETE FROM grocery_items WHERE id = ?", (item_id,))
    _sync_list()


def clear_all_items():
    ensure_grocery_schema()
    with get_conn() as conn:
        conn.execute("DELETE FROM grocery_items")
    _sync_list()


def toggle_item(item_id: int, checked: bool):
    ensure_grocery_schema()
    with get_conn() as conn:
        conn.execute("UPDATE grocery_items SET checked = ? WHERE id = ?", (1 if checked else 0, item_id))
    _sync_list()


def _sync_list():
    items = list_items()
    (HEALTH_DATA / "grocery" / "shopping_list.json").write_text(json.dumps(items, indent=2, default=str))


PANTRY_FILE = HEALTH_DATA / "grocery" / "pantry.json"


def _ensure_pantry_file():
    PANTRY_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not PANTRY_FILE.exists():
        PANTRY_FILE.write_text(json.dumps({"items": [], "updated_at": None}, indent=2))


def list_pantry() -> list[dict]:
    _ensure_pantry_file()
    data = json.loads(PANTRY_FILE.read_text())
    return data.get("items", [])


def set_pantry(names: list[str], *, source: str = "dr_melani") -> dict:
    """Replace kitchen inventory — use after a grocery haul."""
    clean = []
    seen = set()
    for raw in names:
        name = (raw or "").strip().title()
        key = name.lower()
        if len(name) < 2 or key in seen:
            continue
        seen.add(key)
        clean.append({"name": name, "added_at": datetime.now().isoformat(), "source": source})
    _ensure_pantry_file()
    snap = {"items": clean, "updated_at": datetime.now().isoformat(), "source": source}
    PANTRY_FILE.write_text(json.dumps(snap, indent=2))
    return snap


def add_pantry_items(names: list[str], *, source: str = "dr_melani") -> dict:
    """Append items to kitchen inventory."""
    existing = {i["name"].lower(): i for i in list_pantry()}
    for raw in names:
        name = (raw or "").strip().title()
        if len(name) < 2:
            continue
        existing[name.lower()] = {
            "name": name,
            "added_at": datetime.now().isoformat(),
            "source": source,
        }
    snap = {
        "items": list(existing.values()),
        "updated_at": datetime.now().isoformat(),
        "source": source,
    }
    _ensure_pantry_file()
    PANTRY_FILE.write_text(json.dumps(snap, indent=2))
    return snap


def pantry_context_block() -> str:
    items = list_pantry()
    if not items:
        return (
            "=== KITCHEN / PANTRY ===\n"
            "Empty — after grocery shopping, voice-dump what you bought and ask for lunch/dinner ideas."
        )
    names = [i["name"] for i in items[:24]]
    updated = ""
    if PANTRY_FILE.exists():
        try:
            updated = json.loads(PANTRY_FILE.read_text()).get("updated_at", "")[:10]
        except Exception:
            pass
    head = f"Updated {updated}" if updated else "Current stock"
    lines = [
        "=== KITCHEN / PANTRY (what she has at home) ===",
        f"{head}: " + ", ".join(names),
        "Use these ingredients for lunch/dinner suggestions. Breakfast is her saved preset — do not replan breakfast unless asked.",
    ]
    return "\n".join(lines)


def _lab_context() -> str:
    with get_conn() as conn:
        flagged = conn.execute(
            """SELECT lv.test, lv.result, lv.unit, lv.flag, ld.collected
               FROM lab_values lv JOIN lab_draws ld ON lv.draw_id = ld.id
               WHERE lv.flag IS NOT NULL ORDER BY ld.collected DESC"""
        ).fetchall()
        recent = conn.execute(
            """SELECT lv.test, lv.result, lv.unit, ld.collected
               FROM lab_values lv JOIN lab_draws ld ON lv.draw_id = ld.id
               ORDER BY ld.collected DESC LIMIT 15"""
        ).fetchall()
    lines = ["Flagged labs:"]
    for r in flagged:
        lines.append(f"  {r['test']}: {r['result']} {r['unit'] or ''} ({r['collected'][:10]})")
    lines.append("Recent labs:")
    for r in recent:
        lines.append(f"  {r['test']}: {r['result']} ({r['collected'][:10]})")
    return "\n".join(lines)


def suggest_groceries() -> dict:
    ctx = _lab_context()
    prompt = f"""Based on this patient's lab data, suggest 8-12 grocery items for a shopping list.
Patient: 18F, monitors lipids and metabolic markers. Migraine history.
Labs:
{ctx}

Return JSON only: {{"items": [{{"name": "...", "category": "...", "reason": "..."}}]}}
Clinical tone. Cite lab values in reasons. Not medical advice — general wellness foods only."""

    try:
        resp = ollama.chat.completions.create(
            model="llama3",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        text = resp.choices[0].message.content or "{}"
        start, end = text.find("{"), text.rfind("}") + 1
        data = json.loads(text[start:end]) if start >= 0 else {"items": []}
    except Exception as e:
        data = {"items": [
            {"name": "Oats", "category": "grains", "reason": "Soluble fiber — LDL 120 flagged"},
            {"name": "Salmon", "category": "protein", "reason": "Omega-3 — TG 119 flagged"},
        ], "error": str(e)}

    added = []
    for item in data.get("items", []):
        rec = add_item(
            item.get("name", "Item"),
            item.get("category", ""),
            added_by="ai",
            reason=item.get("reason", ""),
        )
        added.append(rec)

    snap = {"at": datetime.now().isoformat(), "lab_context": ctx, "suggestions": data.get("items", []), "added": added}
    path = HEALTH_DATA / "grocery" / "suggestions" / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    path.write_text(json.dumps(snap, indent=2))
    return snap
