"""Melani profile — age, height, weight (auto from logs)."""

from __future__ import annotations

from datetime import date

from .db import get_conn, today
from . import vitals

# Birthday stored in data only — never shown on screen. Age bumps every Aug 24.
DOB = date(2007, 8, 24)
SEX_LABEL = "female"
HEIGHT_FT = 5
HEIGHT_IN = 0


def age_years(on: date | None = None) -> int:
    on = on or date.today()
    years = on.year - DOB.year
    if (on.month, on.day) < (DOB.month, DOB.day):
        years -= 1
    return years


def height_display() -> str:
    return f"{HEIGHT_FT} ft {HEIGHT_IN} in"


def age_display() -> str:
    return str(age_years())


def header_tagline() -> str:
    return f"{age_years()}-year-old {SEX_LABEL}"


def data_stats() -> dict:
    w = vitals.get_latest_weight()
    weight_line = "—"
    weight_lb = None
    if w:
        weight_lb = w["value"]
        weight_line = f"{weight_lb:g} lb"
        if w.get("day") and w["day"] != today():
            weight_line += f" · logged {w['day']}"
    return {
        "age": age_years(),
        "age_display": age_display(),
        "sex_label": SEX_LABEL,
        "header_tagline": header_tagline(),
        "height": height_display(),
        "weight_lb": weight_lb,
        "weight_display": weight_line,
    }


def jarvis_context() -> str:
    s = data_stats()
    return (
        f"{s['header_tagline']}. "
        f"Birthday Aug 24 (stored in system, age updates automatically each year). "
        f"Height {s['height']}. "
        f"Weight {s['weight_display']} (auto from Today log)."
    )


def sync_profile_db():
    with get_conn() as conn:
        for key, val in {
            "name": "Melani Shrestha",
            "dob": DOB.isoformat(),
            "sex": "F",
            "height_ft": str(HEIGHT_FT),
            "height_in": str(HEIGHT_IN),
            "height_display": height_display(),
        }.items():
            conn.execute(
                "INSERT OR REPLACE INTO profile (key, value) VALUES (?, ?)",
                (key, val),
            )
