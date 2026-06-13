from __future__ import annotations

"""Daily macro targets — Jarvis can adjust calorie_goal in goals.json."""

import json

from .paths import HEALTH_DATA

GOALS_FILE = HEALTH_DATA / "nutrition" / "goals.json"

DEFAULTS = {
    "protein_goal_g": 125,
    "calorie_goal": 2000,
    "carbs_goal_g": 200,
    "fat_goal_g": 65,
    "fiber_goal_g": 30,
    "note": "Protein target 125g/day. Calorie target ~2000 — ask Dr. Melani to adjust based on your labs and training.",
}


def get_goals() -> dict:
    GOALS_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not GOALS_FILE.exists():
        GOALS_FILE.write_text(json.dumps(DEFAULTS, indent=2))
        return dict(DEFAULTS)
    data = json.loads(GOALS_FILE.read_text())
    out = {**DEFAULTS, **data}
    return out


def save_goals(**kwargs) -> dict:
    current = get_goals()
    for key in ("protein_goal_g", "calorie_goal", "carbs_goal_g", "fat_goal_g", "fiber_goal_g", "note"):
        if key in kwargs and kwargs[key] is not None:
            current[key] = kwargs[key]
    GOALS_FILE.write_text(json.dumps(current, indent=2))
    return current
