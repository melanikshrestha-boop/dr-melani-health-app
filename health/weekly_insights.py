from __future__ import annotations

"""Weekly correlation card — migraines, nutrition, sleep, brain fog, HRV."""

from datetime import date, timedelta

from . import checkins, migraines, symptoms, wearables
from .db import get_conn, today
from .nutrition import daily_macro_totals
from .sleep import _week_start, get_sleep, week_key, week_range_label, week_start_from_key


def _week_days(week: str | None = None) -> list[str]:
    if week:
        start = week_start_from_key(week)
    else:
        start = _week_start(date.today())
    return [(start + timedelta(days=i)).isoformat() for i in range(7)]


def build_card(week: str | None = None) -> dict:
    if week:
        start = week_start_from_key(week)
        wk = week_key(start)
    else:
        start = _week_start(date.today())
        wk = week_key(start)

    days = _week_days(wk)
    migraine_days = 0
    brain_fog_days = 0
    sleep_hours: list[float] = []
    protein_g: list[float] = []
    low_protein_days = 0
    migraine_with_low_sleep = 0

    for d in days:
        mig = migraines.get_migraine(d)
        if mig and mig["severity"] > 0:
            migraine_days += 1
            sl = get_sleep(d)
            if sl and sl.get("sleep_hours") and float(sl["sleep_hours"]) < 6:
                migraine_with_low_sleep += 1

        bf = symptoms.get_brain_fog(d)
        if bf and bf.get("yes"):
            brain_fog_days += 1

        sl = get_sleep(d)
        if sl and sl.get("sleep_hours") is not None:
            sleep_hours.append(float(sl["sleep_hours"]))

        macros = daily_macro_totals(d)
        prot = float(macros.get("protein_g") or 0)
        if macros.get("meals_logged", 0) > 0:
            protein_g.append(prot)
            if prot < 80:
                low_protein_days += 1

    avg_sleep = round(sum(sleep_hours) / len(sleep_hours), 1) if sleep_hours else None
    avg_protein = round(sum(protein_g) / len(protein_g), 0) if protein_g else None

    hrv = wearables.week_metrics("whoop", "hrv_rmssd", wk)
    rhr = wearables.week_metrics("whoop", "rhr", wk)
    steps = wearables.week_metrics("apple", "steps", wk)
    steps_total = int(sum(d["value"] or 0 for d in steps.get("days", [])))

    insights: list[str] = []
    if migraine_days >= 2 and migraine_with_low_sleep >= 1:
        insights.append(
            f"{migraine_with_low_sleep} migraine day(s) followed short sleep (<6 h) — worth protecting bedtime."
        )
    if brain_fog_days >= 3:
        insights.append(f"Brain fog on {brain_fog_days} days — check protein, sleep, and hydration together.")
    if low_protein_days >= 3 and avg_protein:
        insights.append(f"Protein under 80g on {low_protein_days} logged days (avg {int(avg_protein)}g).")
    if hrv.get("average") and hrv["logged_count"] >= 3:
        insights.append(f"WHOOP overnight HRV avg {hrv['average']} ms — trend only, not a recovery score.")
    if not insights:
        insights.append("Keep logging — patterns get clearer after a full week of data.")

    return {
        "week": wk,
        "week_label": week_range_label(start),
        "migraine_days": migraine_days,
        "brain_fog_days": brain_fog_days,
        "avg_sleep_hours": avg_sleep,
        "avg_protein_g": int(avg_protein) if avg_protein else None,
        "sleep_logged_days": len(sleep_hours),
        "meals_logged_days": len(protein_g),
        "hrv_avg": hrv.get("average"),
        "hrv_logged_days": hrv.get("logged_count", 0),
        "rhr_avg": rhr.get("average"),
        "steps_total": steps_total if steps_total else None,
        "insights": insights,
    }


def context_block() -> str:
    card = build_card()
    lines = [f"=== WEEKLY INSIGHTS ({card['week_label']}) ==="]
    lines.append(
        f"Migraines: {card['migraine_days']} day(s) · Brain fog: {card['brain_fog_days']} day(s)"
    )
    if card.get("avg_sleep_hours"):
        lines.append(f"Avg sleep: {card['avg_sleep_hours']} h ({card['sleep_logged_days']} days logged)")
    if card.get("avg_protein_g"):
        lines.append(f"Avg protein: {card['avg_protein_g']}g ({card['meals_logged_days']} days with meals)")
    if card.get("hrv_avg"):
        lines.append(f"WHOOP HRV avg: {card['hrv_avg']} ms")
    for ins in card.get("insights") or []:
        lines.append(f"  · {ins}")
    return "\n".join(lines)
