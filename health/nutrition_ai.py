"""AI-powered nutrition tracking with Claude API."""

from __future__ import annotations

import json
import base64
from datetime import datetime, date
from typing import Optional, Dict, Any, List
from pathlib import Path

from .db import get_conn
from .paths import HEALTH_DATA


def get_claude_client():
    """Get Anthropic Claude client."""
    try:
        from anthropic import Anthropic
        return Anthropic()
    except ImportError:
        return None


def analyze_food_photo(image_bytes: bytes) -> Dict[str, Any]:
    """Analyze food photo with Claude Vision API."""
    client = get_claude_client()
    if not client:
        return {"error": "Claude API not configured"}

    # Convert to base64
    image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    prompt = """Analyze this food image and provide:

1. **Food items identified** (list each distinct item)
2. **Estimated portion size** (e.g., 1 cup, 6 oz, etc.)
3. **Nutritional estimates** for the ENTIRE meal:
   - Calories (total)
   - Protein (grams)
   - Carbs (grams)
   - Fat (grams)
   - Fiber (grams)
   - Key micronutrients (iron, calcium, vitamins, etc.)
4. **Meal quality assessment**: Excellent/Good/Fair/Poor
5. **Health notes**: Any notable aspects (high sodium, good fiber, etc.)
6. **Suggestions**: How to improve nutritionally

Format as JSON with these exact keys:
{
  "items": ["item1", "item2"],
  "portion": "description",
  "nutrition": {
    "calories": number,
    "protein_g": number,
    "carbs_g": number,
    "fat_g": number,
    "fiber_g": number,
    "sodium_mg": number,
    "micronutrients": {"nutrient": "amount"}
  },
  "quality": "Excellent/Good/Fair/Poor",
  "health_notes": ["note1", "note2"],
  "suggestions": ["suggestion1", "suggestion2"]
}"""

    try:
        response = client.messages.create(
            model="claude-opus-4-1-20250805",
            max_tokens=1024,
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

        # Parse response
        response_text = response.content[0].text

        # Extract JSON
        import re
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            nutrition_data = json.loads(json_match.group())
            nutrition_data["raw_response"] = response_text
            return nutrition_data
        else:
            return {"error": "Could not parse nutrition data", "raw": response_text}

    except Exception as e:
        return {"error": f"Claude API error: {str(e)}"}


def analyze_food_text(description: str) -> Dict[str, Any]:
    """Analyze food based on text description."""
    client = get_claude_client()
    if not client:
        return {"error": "Claude API not configured"}

    prompt = f"""Analyze this meal description and provide nutrition info:

Meal: {description}

Provide:
1. **Food items** (list each)
2. **Estimated portions**
3. **Nutritional content**:
   - Calories (total)
   - Protein (g)
   - Carbs (g)
   - Fat (g)
   - Fiber (g)
   - Sodium (mg)
   - Key micronutrients
4. **Quality assessment**: Excellent/Good/Fair/Poor
5. **Health notes**
6. **Improvement suggestions**

Format as JSON:
{{
  "items": ["item1", "item2"],
  "portion": "description",
  "nutrition": {{
    "calories": number,
    "protein_g": number,
    "carbs_g": number,
    "fat_g": number,
    "fiber_g": number,
    "sodium_mg": number,
    "micronutrients": {{"nutrient": "amount"}}
  }},
  "quality": "Excellent/Good/Fair/Poor",
  "health_notes": ["note1"],
  "suggestions": ["suggestion1"]
}}"""

    try:
        response = client.messages.create(
            model="claude-opus-4-1-20250805",
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
        )

        response_text = response.content[0].text

        # Extract JSON
        import re
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            nutrition_data = json.loads(json_match.group())
            return nutrition_data
        else:
            return {"error": "Could not parse nutrition data"}

    except Exception as e:
        return {"error": f"Claude API error: {str(e)}"}


def log_meal(date_str: str, meal_type: str, nutrition_data: Dict[str, Any], notes: str = "") -> Dict[str, Any]:
    """Log a meal with AI-analyzed nutrition."""
    with get_conn() as conn:
        # Create meal record
        cursor = conn.execute(
            """INSERT INTO nutrition_ai_meals
               (date, meal_type, calories, protein_g, carbs_g, fat_g, fiber_g,
                sodium_mg, quality, items, notes, analyzed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                date_str,
                meal_type,
                nutrition_data.get("nutrition", {}).get("calories", 0),
                nutrition_data.get("nutrition", {}).get("protein_g", 0),
                nutrition_data.get("nutrition", {}).get("carbs_g", 0),
                nutrition_data.get("nutrition", {}).get("fat_g", 0),
                nutrition_data.get("nutrition", {}).get("fiber_g", 0),
                nutrition_data.get("nutrition", {}).get("sodium_mg", 0),
                nutrition_data.get("quality", ""),
                json.dumps(nutrition_data.get("items", [])),
                notes,
                datetime.now().isoformat()
            )
        )

        meal_id = cursor.lastrowid

        # Store micronutrients
        for nutrient, amount in nutrition_data.get("nutrition", {}).get("micronutrients", {}).items():
            conn.execute(
                "INSERT INTO nutrition_ai_micronutrients (meal_id, nutrient, amount) VALUES (?, ?, ?)",
                (meal_id, nutrient, amount)
            )

        return {
            "id": meal_id,
            "date": date_str,
            "meal_type": meal_type,
            "nutrition": nutrition_data.get("nutrition", {}),
            "quality": nutrition_data.get("quality", ""),
            "logged_at": datetime.now().isoformat()
        }


def get_daily_nutrition(date_str: str) -> Dict[str, Any]:
    """Get nutrition summary for a day."""
    with get_conn() as conn:
        meals = conn.execute(
            """SELECT * FROM nutrition_ai_meals
               WHERE date = ?
               ORDER BY analyzed_at""",
            (date_str,)
        ).fetchall()

        totals = {
            "calories": 0,
            "protein_g": 0,
            "carbs_g": 0,
            "fat_g": 0,
            "fiber_g": 0,
            "sodium_mg": 0
        }

        meal_list = []

        for meal in meals:
            meal_dict = dict(meal)
            totals["calories"] += meal_dict.get("calories", 0)
            totals["protein_g"] += meal_dict.get("protein_g", 0)
            totals["carbs_g"] += meal_dict.get("carbs_g", 0)
            totals["fat_g"] += meal_dict.get("fat_g", 0)
            totals["fiber_g"] += meal_dict.get("fiber_g", 0)
            totals["sodium_mg"] += meal_dict.get("sodium_mg", 0)

            meal_list.append({
                "id": meal_dict["id"],
                "meal_type": meal_dict["meal_type"],
                "calories": meal_dict.get("calories", 0),
                "quality": meal_dict.get("quality", ""),
                "items": json.loads(meal_dict.get("items", "[]")),
                "notes": meal_dict.get("notes", "")
            })

        # Calculate macros percentage
        total_cals = totals["calories"] or 1
        macros = {
            "protein_pct": int((totals["protein_g"] * 4 / total_cals) * 100) if total_cals else 0,
            "carbs_pct": int((totals["carbs_g"] * 4 / total_cals) * 100) if total_cals else 0,
            "fat_pct": int((totals["fat_g"] * 9 / total_cals) * 100) if total_cals else 0,
        }

        return {
            "date": date_str,
            "totals": totals,
            "macros": macros,
            "meals": meal_list,
            "meal_count": len(meal_list)
        }


def get_nutrition_insights(date_str: str) -> Dict[str, Any]:
    """Get AI insights on daily nutrition."""
    daily = get_daily_nutrition(date_str)

    insights = {
        "date": date_str,
        "insights": [],
        "recommendations": [],
        "quality_score": 0
    }

    totals = daily["totals"]
    cals = totals["calories"]

    # Calorie insights
    if cals < 1200:
        insights["insights"].append("Undereating: Calorie intake is low")
        insights["recommendations"].append("Aim for at least 1200-1500 calories daily")
    elif cals > 3500:
        insights["insights"].append("High calorie intake")
        insights["recommendations"].append("Consider reducing portion sizes if weight loss is goal")
    else:
        insights["insights"].append(f"Good calorie intake: {cals} kcal")

    # Protein insights
    protein_target = cals * 0.30 / 4  # 30% of calories
    if totals["protein_g"] < protein_target * 0.8:
        insights["insights"].append(f"Low protein: {totals['protein_g']}g vs {protein_target:.0f}g target")
        insights["recommendations"].append("Add protein: chicken, fish, eggs, legumes, yogurt")
    else:
        insights["insights"].append(f"Good protein intake: {totals['protein_g']}g")

    # Fiber insights
    if totals["fiber_g"] < 25:
        insights["insights"].append(f"Low fiber: {totals['fiber_g']}g vs 25g recommended")
        insights["recommendations"].append("Add vegetables, fruits, whole grains, legumes")
    else:
        insights["insights"].append(f"Excellent fiber: {totals['fiber_g']}g")

    # Sodium insights
    if totals["sodium_mg"] > 2300:
        insights["insights"].append(f"High sodium: {totals['sodium_mg']}mg")
        insights["recommendations"].append("Reduce salt, processed foods")

    # Quality score (0-100)
    score = 50
    if 1500 <= cals <= 2500:
        score += 15
    if 50 <= totals["protein_g"] <= 150:
        score += 15
    if totals["fiber_g"] >= 25:
        score += 15
    if totals["sodium_mg"] <= 2300:
        score += 10

    insights["quality_score"] = min(100, score)
    insights["quality_rating"] = "Excellent" if score >= 85 else "Good" if score >= 70 else "Fair" if score >= 55 else "Needs Work"

    return insights


def correlate_nutrition_with_activity(date_str: str) -> Dict[str, Any]:
    """Correlate nutrition with activity (Apple Watch + WHOOP data)."""
    from . import apple_health, whoop_enhanced

    daily_nutrition = get_daily_nutrition(date_str)
    apple_data = apple_health.get_apple_health_for_date(date_str)
    whoop_data = whoop_enhanced.get_whoop_for_date(date_str)

    cals_consumed = daily_nutrition["totals"]["calories"]
    cals_burned = apple_data.get("calories", {}).get("calories", 0) if apple_data.get("calories") else 0
    net_cals = cals_consumed - cals_burned

    return {
        "date": date_str,
        "calories_consumed": cals_consumed,
        "calories_burned": cals_burned,
        "net_calories": net_cals,
        "balance": "surplus" if net_cals > 0 else "deficit",
        "insight": f"{'Energy surplus' if net_cals > 0 else 'Energy deficit'}: {abs(net_cals)} kcal",
        "recovery_impact": whoop_data.get("recovery", {}).get("recovery_score", 0) if whoop_data.get("recovery") else None,
        "workouts": apple_data.get("workouts", []) if apple_data.get("workouts") else []
    }


def create_nutrition_tables():
    """Create nutrition AI tables."""
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS nutrition_ai_meals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                meal_type TEXT,
                calories REAL,
                protein_g REAL,
                carbs_g REAL,
                fat_g REAL,
                fiber_g REAL,
                sodium_mg REAL,
                quality TEXT,
                items TEXT,
                notes TEXT,
                analyzed_at TEXT,
                UNIQUE(date, meal_type)
            );

            CREATE TABLE IF NOT EXISTS nutrition_ai_micronutrients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meal_id INTEGER NOT NULL,
                nutrient TEXT,
                amount TEXT,
                FOREIGN KEY (meal_id) REFERENCES nutrition_ai_meals(id)
            );

            CREATE INDEX IF NOT EXISTS idx_meals_date ON nutrition_ai_meals(date);
        """)
