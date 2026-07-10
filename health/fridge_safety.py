"""Food safety & spoilage detection for fridge items."""

from __future__ import annotations

import json
import base64
from datetime import datetime, date, timedelta
from typing import Optional, Dict, Any, List
from pathlib import Path

from .db import get_conn


def get_claude_client():
    """Get Anthropic Claude client."""
    try:
        from anthropic import Anthropic
        return Anthropic()
    except ImportError:
        return None


# Spoilage indicators by food type
SPOILAGE_PROFILES = {
    "milk_dairy": {
        "shelf_life_days": 7,
        "visual_signs": ["curdling", "separation", "discoloration", "lumps"],
        "smell": ["sour", "off"],
        "texture": ["chunky", "separated"]
    },
    "meat_poultry": {
        "shelf_life_days": 3,
        "visual_signs": ["gray", "brown", "slime", "mold"],
        "smell": ["sour", "rotten", "off"],
        "texture": ["slimy", "sticky"]
    },
    "produce": {
        "shelf_life_days": 5,
        "visual_signs": ["mold", "brown spots", "wrinkled", "dark areas"],
        "smell": ["fermented", "musty"],
        "texture": ["soft", "mushy", "spongy"]
    },
    "leftovers": {
        "shelf_life_days": 3,
        "visual_signs": ["mold", "discoloration", "separation"],
        "smell": ["sour", "off"],
        "texture": ["slimy"]
    },
    "condiments": {
        "shelf_life_days": 180,
        "visual_signs": ["mold", "crystallization"],
        "smell": ["sour"],
        "texture": []
    }
}


def analyze_fridge_photo(image_bytes: bytes) -> Dict[str, Any]:
    """Analyze fridge photo using Claude Vision API."""
    client = get_claude_client()
    if not client:
        return {"error": "Claude API not configured"}

    image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    prompt = """You are a food safety expert analyzing a fridge photo. For EACH visible item:

1. **Item identification**: What is it? (be specific)
2. **Visual assessment**:
   - Color (normal/abnormal)
   - Visible mold/growth
   - Texture (slime, crystallization, wrinkled, etc)
   - Packaging condition (opened/sealed)
3. **Safety verdict**: 🟢 SAFE / 🟡 RISKY / 🔴 TOSS
4. **Action**: "Eat today", "Freeze now", "Check smell test", "Toss it"

Format as JSON:
{
  "items": [
    {
      "name": "item name",
      "category": "meat/dairy/produce/leftovers/condiments/other",
      "visual_signs": ["list any concerning signs"],
      "estimated_days_left": number or null,
      "safety_level": "safe/risky/unsafe",
      "reason": "brief why",
      "action": "eat today/freeze/smell test/toss",
      "college_tip": "cheap advice on this item"
    }
  ],
  "fridge_overall": "generally safe/has concerns/needs cleanup",
  "urgent_actions": ["list anything needing immediate action"]
}"""

    try:
        response = client.messages.create(
            model="claude-opus-4-1-20250805",
            max_tokens=2000,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": image_b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": prompt
                        }
                    ],
                }
            ],
        )

        response_text = response.content[0].text

        import re
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            fridge_data = json.loads(json_match.group())
            return fridge_data
        else:
            return {"error": "Could not parse fridge analysis", "raw": response_text}

    except Exception as e:
        return {"error": f"Claude API error: {str(e)}"}


def assess_item_from_description(name: str, description: str = "") -> Dict[str, Any]:
    """Assess a single food item from description (no photo)."""
    client = get_claude_client()
    if not client:
        return {"error": "Claude API not configured"}

    prompt = f"""Quick food safety check for: {name}
Description: {description}

Assess:
1. Typical shelf life
2. Common spoilage signs to watch for
3. Safe storage tips for college (minimal effort)
4. Red flags that mean "toss it"

Format as JSON:
{{
  "item": "{name}",
  "shelf_life_days": number,
  "spoilage_signs": ["list visual/smell indicators"],
  "storage_tip": "brief storage advice",
  "red_flags": ["danger signs"],
  "college_hack": "quick preservation trick"
}}"""

    try:
        response = client.messages.create(
            model="claude-opus-4-1-20250805",
            max_tokens=500,
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
        )

        response_text = response.content[0].text

        import re
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        else:
            return {"error": "Could not parse assessment"}

    except Exception as e:
        return {"error": f"Claude API error: {str(e)}"}


def log_fridge_scan(items: List[Dict[str, Any]], photo_path: str = None) -> Dict[str, Any]:
    """Log fridge scan results to database."""
    with get_conn() as conn:
        scan_id = conn.execute(
            """INSERT INTO fridge_scans (scanned_at, photo_path, item_count, urgent_count)
               VALUES (?, ?, ?, ?)""",
            (
                datetime.now().isoformat(),
                photo_path,
                len(items),
                sum(1 for item in items if item.get("safety_level") in ["risky", "unsafe"])
            )
        ).lastrowid

        for item in items:
            conn.execute(
                """INSERT INTO fridge_items
                   (scan_id, name, category, safety_level, action, days_left, visual_signs)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    scan_id,
                    item.get("name"),
                    item.get("category"),
                    item.get("safety_level"),
                    item.get("action"),
                    item.get("estimated_days_left"),
                    json.dumps(item.get("visual_signs", []))
                )
            )

        return {
            "scan_id": scan_id,
            "item_count": len(items),
            "logged_at": datetime.now().isoformat()
        }


def get_fridge_status() -> Dict[str, Any]:
    """Get current fridge status and alerts."""
    with get_conn() as conn:
        # Get most recent scan
        latest = conn.execute(
            "SELECT * FROM fridge_scans ORDER BY scanned_at DESC LIMIT 1"
        ).fetchone()

        if not latest:
            return {"status": "no_data", "message": "No fridge scans yet"}

        latest_dict = dict(latest)

        # Get all items from that scan
        items = conn.execute(
            "SELECT * FROM fridge_items WHERE scan_id = ? ORDER BY safety_level DESC",
            (latest_dict["id"],)
        ).fetchall()

        parsed_items = []
        for item in items:
            item_dict = dict(item)
            item_dict["visual_signs"] = json.loads(item_dict.get("visual_signs", "[]"))
            parsed_items.append(item_dict)

        # Categorize by safety level
        unsafe_items = [i for i in parsed_items if i["safety_level"] == "unsafe"]
        risky_items = [i for i in parsed_items if i["safety_level"] == "risky"]
        safe_items = [i for i in parsed_items if i["safety_level"] == "safe"]

        return {
            "last_scanned": latest_dict["scanned_at"],
            "total_items": latest_dict["item_count"],
            "unsafe_count": len(unsafe_items),
            "risky_count": len(risky_items),
            "safe_count": len(safe_items),
            "unsafe_items": unsafe_items,
            "risky_items": risky_items,
            "safe_items": safe_items,
            "alert_level": "critical" if unsafe_items else ("warning" if risky_items else "good")
        }


def get_safety_alerts() -> List[Dict[str, Any]]:
    """Get all current food safety alerts."""
    with get_conn() as conn:
        # Get items marked as risky or unsafe from recent scans (last 7 days)
        cutoff = (datetime.now() - timedelta(days=7)).isoformat()

        alerts = conn.execute(
            """SELECT fi.*, fs.scanned_at FROM fridge_items fi
               JOIN fridge_scans fs ON fi.scan_id = fs.id
               WHERE fi.safety_level IN ('risky', 'unsafe')
               AND fs.scanned_at > ?
               ORDER BY fi.safety_level DESC, fs.scanned_at DESC""",
            (cutoff,)
        ).fetchall()

        return [dict(a) for a in alerts]


def create_fridge_tables():
    """Create fridge safety tracking tables."""
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS fridge_scans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scanned_at TEXT NOT NULL,
                photo_path TEXT,
                item_count INTEGER,
                urgent_count INTEGER
            );

            CREATE TABLE IF NOT EXISTS fridge_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scan_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                category TEXT,
                safety_level TEXT,
                action TEXT,
                days_left INTEGER,
                visual_signs TEXT,
                FOREIGN KEY (scan_id) REFERENCES fridge_scans(id)
            );

            CREATE INDEX IF NOT EXISTS idx_scans_date ON fridge_scans(scanned_at);
            CREATE INDEX IF NOT EXISTS idx_items_safety ON fridge_items(safety_level);
        """)
