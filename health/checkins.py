from __future__ import annotations

"""Structured daily check-in — mood, energy, stress, caffeine, alcohol."""

from datetime import datetime

from .db import get_conn, today
from .nutrition import get_checkin, save_checkin


def save_ratings(
    mood: int | None = None,
    energy: int | None = None,
    stress: int | None = None,
    day: str | None = None,
) -> dict:
    day = day or today()
    existing = get_checkin(day)

    def _clamp(val: int | None, current) -> int | None:
        if val is None:
            return current
        return max(1, min(5, int(val)))

    return save_checkin(
        mood=_clamp(mood, existing.get("mood")),
        energy=_clamp(energy, existing.get("energy")),
        stress=_clamp(stress, existing.get("stress")),
        day=day,
        bedtime=existing.get("bedtime"),
        wake_time=existing.get("wake_time"),
        sleep_hours=existing.get("sleep_hours"),
        sleep_quality=existing.get("sleep_quality"),
        notes=existing.get("notes"),
    )


def save_modifiers(
    caffeine_servings: int | None = None,
    alcohol_drinks: int | None = None,
    day: str | None = None,
) -> dict:
    day = day or today()
    existing = get_checkin(day)
    caf = existing.get("caffeine_servings")
    alc = existing.get("alcohol_drinks")
    if caffeine_servings is not None:
        caf = max(0, min(20, int(caffeine_servings)))
    if alcohol_drinks is not None:
        alc = max(0, min(20, int(alcohol_drinks)))

    with get_conn() as conn:
        row = conn.execute("SELECT day FROM daily_checkins WHERE day = ?", (day,)).fetchone()
        if row:
            conn.execute(
                """UPDATE daily_checkins
                   SET caffeine_servings = ?, alcohol_drinks = ?, updated_at = ?
                   WHERE day = ?""",
                (caf, alc, datetime.now().isoformat(), day),
            )
        else:
            conn.execute(
                """INSERT INTO daily_checkins
                   (day, caffeine_servings, alcohol_drinks, updated_at)
                   VALUES (?, ?, ?, ?)""",
                (day, caf, alc, datetime.now().isoformat()),
            )
    return get_daily(day)


def get_daily(day: str | None = None) -> dict:
    data = get_checkin(day)
    data.setdefault("caffeine_servings", None)
    data.setdefault("alcohol_drinks", None)
    return data


def context_block() -> str:
    c = get_daily()
    lines = ["=== DAILY CHECK-IN ==="]
    for label, key in (("Mood", "mood"), ("Energy", "energy"), ("Stress", "stress")):
        val = c.get(key)
        lines.append(f"{label}: {val}/5" if val else f"{label}: not logged")
    caf = c.get("caffeine_servings")
    alc = c.get("alcohol_drinks")
    lines.append(f"Caffeine servings today: {caf if caf is not None else 'not logged'}")
    lines.append(f"Alcohol drinks today: {alc if alc is not None else 'not logged'}")
    return "\n".join(lines)
