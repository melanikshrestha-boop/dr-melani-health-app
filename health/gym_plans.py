from __future__ import annotations

"""Notion-style gym plans — editable day pages with checklists."""

import json
import re
import uuid
from datetime import datetime, date, timedelta
from pathlib import Path

from .paths import HEALTH_DATA
from .sleep import week_key as sleep_week_key, _week_start

PLANS_DIR = HEALTH_DATA / "workouts" / "plans"
CARDIO_FILE = HEALTH_DATA / "workouts" / "cardio_day.json"
WEEK_PLAN_FILE = HEALTH_DATA / "workouts" / "week_plan.json"
WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
PLAN_VERSION = 3

WORKOUT_TYPES = {
    "cardio": {
        "label": "Cardio",
        "emoji": "🏃",
        "css": "cardio",
        "max_days": 1,
        "hint": "1 day this week",
    },
    "lower": {
        "label": "Lower Body",
        "emoji": "🦵",
        "css": "lower",
        "max_days": 3,
        "min_gap": 1,
        "hint": "Up to 3 · 48 hrs apart (skip 1 day)",
    },
    "upper_abs": {
        "label": "Upper body + Abs",
        "emoji": "💪",
        "css": "upper-abs",
        "hint": "Pick your days",
    },
    "rest": {
        "label": "Rest",
        "emoji": "🔋",
        "css": "rest",
        "max_days": 1,
        "hint": "1 day this week",
    },
}

LOWER_SLOTS = ("one", "two", "three")
LOWER_PLAN_KEYS = ("lower_one", "lower_two", "lower_three")
LOWER_SLOT_TO_KEY = {"one": "lower_one", "two": "lower_two", "three": "lower_three"}
LOWER_KEY_TO_SLOT = {v: k for k, v in LOWER_SLOT_TO_KEY.items()}
LOWER_PLAN_VERSION = 17

UPPER_ABS_SLOTS = ("one", "two")
UPPER_ABS_PLAN_KEYS = ("upper_abs_one", "upper_abs_two")
UPPER_ABS_SLOT_TO_KEY = {"one": "upper_abs_one", "two": "upper_abs_two"}
UPPER_ABS_KEY_TO_SLOT = {v: k for k, v in UPPER_ABS_SLOT_TO_KEY.items()}
UPPER_ABS_PLAN_VERSION = 6

CARDIO_SLOTS = ("running", "swimming")
CARDIO_PLAN_KEYS = ("cardio_running", "cardio_swimming")
CARDIO_SLOT_TO_KEY = {"running": "cardio_running", "swimming": "cardio_swimming"}
CARDIO_KEY_TO_SLOT = {v: k for k, v in CARDIO_SLOT_TO_KEY.items()}
CARDIO_PLAN_VERSION = 2


def _lower_ex(
    sid: str,
    name: str,
    sets: int,
    reps: str,
    *,
    subtitle: str = "",
    rest_sec: int | None = None,
    rest_label: str = "",
    notes: list[str] | None = None,
    instructions: list[str] | None = None,
    notes_label: str = "Notes",
    set_cues: dict | None = None,
    set_specs: dict | None = None,
    superset_group: str = "",
) -> dict:
    reps_display = reps if re.search(r"rep|sec", reps, re.I) else f"{reps} reps"
    item = {
        "id": sid,
        "text": f"{name} — {sets} x {reps}",
        "name": name,
        "sets_target": sets,
        "reps_label": reps_display,
        "checked": False,
    }
    if subtitle:
        item["subtitle"] = subtitle
    if rest_sec:
        item["rest_sec"] = rest_sec
    if rest_label:
        item["rest_label"] = rest_label
    if notes:
        item["notes"] = notes
    if instructions:
        item["instructions"] = instructions
    if instructions:
        item["notes_label"] = "Notes + Instructions"
    elif notes:
        item["notes_label"] = notes_label
    if set_cues:
        item["set_cues"] = set_cues
    if set_specs:
        item["set_specs"] = set_specs
    if superset_group:
        item["superset_group"] = superset_group
    return item


def _cardio_step(
    sid: str,
    name: str,
    detail: str = "",
    *,
    notes: list[str] | None = None,
    instructions: list[str] | None = None,
) -> dict:
    label = detail or "Complete"
    return _lower_ex(
        sid,
        name,
        1,
        label,
        notes=notes,
        instructions=instructions,
    )


CARDIO_SUB_PLANS = {
    "cardio_running": {
        "day_key": "cardio_running",
        "title": "Running",
        "emoji": "🏃",
        "subtitle": "Progress tracker",
        "tracker_mode": True,
        "sections": [],
    },
    "cardio_swimming": {
        "day_key": "cardio_swimming",
        "title": "Swimming",
        "emoji": "🏊",
        "subtitle": "Pool day",
        "session_mode": True,
        "placeholder": "Swim workout coming soon. You'll add this next.",
        "sections": [{"id": "main", "title": "", "items": []}],
    },
}


LOWER_SUB_PLANS = {
    "lower_one": {
        "day_key": "lower_one",
        "title": "Lower body 1",
        "emoji": "🦵",
        "subtitle": "Glute focus",
        "session_mode": True,
        "sections": [
            {
                "id": "main",
                "title": "",
                "items": [
                    _lower_ex(
                        "l1_hip",
                        "Barbell Hip Thrusts",
                        4,
                        "12",
                        subtitle="The King of Glute Mass",
                        rest_sec=120,
                        rest_label="2 min",
                        notes=[
                            "Take your final 2 sets to true 0 RIR (Reps in Reserve).",
                            "You cannot push the bar up for another rep with proper form.",
                            "Hold a 1-second hard squeeze at the top of every rep.",
                            "Do not bounce the weight off the floor.",
                        ],
                        set_specs={
                            "1": {"label": "12 reps"},
                            "2": {"label": "12 reps"},
                            "3": {"label": "Go to failure", "failure": True},
                            "4": {"label": "Go to failure", "failure": True},
                        },
                    ),
                    _lower_ex(
                        "l1_rdl",
                        "Romanian Deadlifts (RDLs)",
                        3,
                        "10",
                        rest_sec=90,
                        rest_label="1 min 30 sec",
                        notes=[
                            "Stop 1 rep short of total failure (1 RIR).",
                            "Absolute failure on RDLs risks your lower back form breaking down.",
                            "Loads the glute in its fully stretched position.",
                            "Push your hips back like you're trying to touch a wall behind you with your butt.",
                        ],
                        set_specs={
                            "1": {"label": "10 reps · 1 RIR"},
                            "2": {"label": "10 reps · 1 RIR"},
                            "3": {"label": "10 reps · 1 RIR"},
                        },
                    ),
                    _lower_ex(
                        "l1_bss",
                        "Bulgarian Split Squats",
                        3,
                        "12",
                        subtitle="The Glute-Biased Method",
                        rest_sec=120,
                        rest_label="2 min",
                        notes=[
                            "Use glute-biased posture so this hits your glutes, not just quads.",
                            "Rest 60 seconds between legs.",
                            "Rest 2 minutes before starting the next set.",
                        ],
                        set_specs={
                            "1": {"label": "12 reps"},
                            "2": {"label": "12 reps"},
                            "3": {"label": "12 reps"},
                        },
                    ),
                    _lower_ex(
                        "l1_kickback",
                        "Cable Glute Kickbacks",
                        3,
                        "12",
                        subtitle="The Final Glute Pump",
                        rest_sec=60,
                        rest_label="1 min",
                        notes=[
                            "Constant cable tension on glute max through the whole movement.",
                            "Go to 0 RIR on your last set for each leg.",
                            "Safe to go to absolute failure on this machine.",
                            "Rest 60 seconds between legs.",
                        ],
                        set_specs={
                            "1": {"label": "12 reps"},
                            "2": {"label": "12 reps"},
                            "3": {"label": "Go to failure", "failure": True},
                        },
                    ),
                ],
            },
        ],
    },
    "lower_two": {
        "day_key": "lower_two",
        "title": "Lower body 2",
        "emoji": "🦵",
        "subtitle": "Glute focus",
        "session_mode": True,
        "sections": [
            {
                "id": "main",
                "title": "",
                "items": [
                    _lower_ex(
                        "l2_sumo",
                        "Sumo Squats",
                        3,
                        "12",
                        subtitle="Gluteus Maximus · Main Mass & Upper Shelf",
                        rest_sec=90,
                        rest_label="1 min 30 sec",
                        notes=[
                            "Glute max is the largest muscle and forms the main bulk of the backside.",
                            "Wide feet stretch the lower base of the glute max.",
                            "Also works glute medius as a secondary mover.",
                        ],
                        set_specs={
                            "1": {"label": "12 reps"},
                            "2": {"label": "12 reps"},
                            "3": {"label": "12 reps"},
                        },
                    ),
                    _lower_ex(
                        "l2_abductor",
                        "Seated Hip Abductor Machine",
                        4,
                        "15",
                        subtitle="The Hip Multi-Angle Method",
                        rest_sec=60,
                        rest_label="1 min",
                        notes=[
                            "15 to 20 reps per set.",
                            "High volume to pump blood into the side glutes.",
                            "Sets 3 and 4 go to absolute failure (0 RIR).",
                            "Rest 1 minute between sets.",
                        ],
                        instructions=[
                            "Sets 1 and 2: lean torso forward 45 degrees, chest up.",
                            "Pushing out while leaned forward targets the upper outer shelf of your glutes.",
                            "Sets 3 and 4: sit upright or slightly leaned back into the pad.",
                            "Leaning back shifts tension to the middle-side of your hip to fill hip dips.",
                        ],
                        set_specs={
                            "1": {"label": "15 reps"},
                            "2": {"label": "15 reps"},
                            "3": {"label": "Go to failure", "failure": True},
                            "4": {"label": "Go to failure", "failure": True},
                        },
                    ),
                    _lower_ex(
                        "l2_backext",
                        "Glute-Focused Back Extensions",
                        3,
                        "12",
                        subtitle="45-Degree Bench",
                        rest_sec=60,
                        rest_label="1 min",
                        notes=[
                            "Builds the upper shelf of the glutes with zero balance needed.",
                            "Set the thigh pad just below your hip crease.",
                            "Turn your toes out 45 degrees.",
                            "Round your upper back and tuck your chin. This locks out your lower back so your glutes do the work.",
                            "Hinge down, squeeze your butt to pull up.",
                            "Stop when hips line up with legs. Do not arch your lower back at the top.",
                        ],
                        set_specs={
                            "1": {"label": "12 reps"},
                            "2": {"label": "12 reps"},
                            "3": {"label": "Go to failure", "failure": True},
                        },
                    ),
                    _lower_ex(
                        "l2_stepup",
                        "The Glute-Biased Step-Up",
                        3,
                        "12",
                        rest_sec=90,
                        rest_label="1 min 30 sec",
                        notes=[
                            "Rest 60 seconds between legs.",
                            "Rest 1 minute 30 seconds between sets.",
                        ],
                        instructions=[
                            "Use a Smith machine or squat rack for stability.",
                            "Set a flat bench or plyo box inside the rack.",
                            "Hold the rack frame with one hand so you load your glutes, not your balance.",
                            "Box height: thigh roughly parallel at the top. Too high rounds your lower back. Too low skips the stretch.",
                            "Lean chest forward about 30 degrees over your thigh. Hinge hips back before you step.",
                            "Drive up through the heel of your top foot.",
                            "Do not push off the floor with your back foot. Top leg does all the work.",
                            "Lower down slowly over 3 seconds.",
                        ],
                        set_specs={
                            "1": {"label": "12 reps · 1 RIR"},
                            "2": {"label": "12 reps · 1 RIR"},
                            "3": {"label": "12 reps · 1 RIR"},
                        },
                    ),
                ],
            },
        ],
    },
    "lower_three": {
        "day_key": "lower_three",
        "title": "Lower body 3",
        "emoji": "🦵",
        "subtitle": "Glute focus · favorites",
        "session_mode": True,
        "sections": [
            {
                "id": "main",
                "title": "",
                "items": [
                    _lower_ex(
                        "l3_hip",
                        "Barbell Hip Thrusts",
                        4,
                        "12",
                        subtitle="The King of Glute Mass",
                        rest_sec=120,
                        rest_label="2 min",
                        notes=[
                            "Take your final 2 sets to true 0 RIR (Reps in Reserve).",
                            "You cannot push the bar up for another rep with proper form.",
                            "Hold a 1-second hard squeeze at the top of every rep.",
                            "Do not bounce the weight off the floor.",
                        ],
                        set_specs={
                            "1": {"label": "12 reps"},
                            "2": {"label": "12 reps"},
                            "3": {"label": "Go to failure", "failure": True},
                            "4": {"label": "Go to failure", "failure": True},
                        },
                    ),
                    _lower_ex(
                        "l3_bss",
                        "Bulgarian Split Squats",
                        3,
                        "12",
                        subtitle="The Glute-Biased Method",
                        rest_sec=120,
                        rest_label="2 min",
                        notes=[
                            "Use glute-biased posture so this hits your glutes, not just quads.",
                            "Rest 60 seconds between legs.",
                            "Rest 2 minutes before starting the next set.",
                        ],
                        set_specs={
                            "1": {"label": "12 reps"},
                            "2": {"label": "12 reps"},
                            "3": {"label": "12 reps"},
                        },
                    ),
                    _lower_ex(
                        "l3_abductor",
                        "Seated Hip Abductor Machine",
                        4,
                        "15",
                        subtitle="The Hip Multi-Angle Method",
                        rest_sec=60,
                        rest_label="1 min",
                        notes=[
                            "15 to 20 reps per set.",
                            "High volume to pump blood into the side glutes.",
                            "Sets 3 and 4 go to absolute failure (0 RIR).",
                            "Rest 1 minute between sets.",
                        ],
                        instructions=[
                            "Sets 1 and 2: lean torso forward 45 degrees, chest up.",
                            "Pushing out while leaned forward targets the upper outer shelf of your glutes.",
                            "Sets 3 and 4: sit upright or slightly leaned back into the pad.",
                            "Leaning back shifts tension to the middle-side of your hip to fill hip dips.",
                        ],
                        set_specs={
                            "1": {"label": "15 reps"},
                            "2": {"label": "15 reps"},
                            "3": {"label": "Go to failure", "failure": True},
                            "4": {"label": "Go to failure", "failure": True},
                        },
                    ),
                    _lower_ex(
                        "l3_stepup",
                        "The Glute-Biased Step-Up",
                        3,
                        "12",
                        rest_sec=90,
                        rest_label="1 min 30 sec",
                        notes=[
                            "Rest 60 seconds between legs.",
                            "Rest 1 minute 30 seconds between sets.",
                        ],
                        instructions=[
                            "Use a Smith machine or squat rack for stability.",
                            "Set a flat bench or plyo box inside the rack.",
                            "Hold the rack frame with one hand so you load your glutes, not your balance.",
                            "Box height: thigh roughly parallel at the top. Too high rounds your lower back. Too low skips the stretch.",
                            "Lean chest forward about 30 degrees over your thigh. Hinge hips back before you step.",
                            "Drive up through the heel of your top foot.",
                            "Do not push off the floor with your back foot. Top leg does all the work.",
                            "Lower down slowly over 3 seconds.",
                        ],
                        set_specs={
                            "1": {"label": "12 reps · 1 RIR"},
                            "2": {"label": "12 reps · 1 RIR"},
                            "3": {"label": "12 reps · 1 RIR"},
                        },
                    ),
                ],
            },
        ],
    },
}

UPPER_ABS_SUB_PLANS = {
    "upper_abs_one": {
        "day_key": "upper_abs_one",
        "title": "Upper body + Abs 1",
        "emoji": "💪",
        "subtitle": "Back taper & sleek arms",
        "session_mode": True,
        "sections": [
            {
                "id": "upper",
                "title": "Upper Body",
                "items": [
                    _lower_ex(
                        "u1_lat",
                        "Wide-Grip Lat Pulldowns",
                        3,
                        "12",
                        subtitle="The Back Taper",
                        rest_sec=90,
                        rest_label="1 min 30 sec",
                        notes=[
                            "Target: the upper back (lats) to narrow the appearance of your waist.",
                            "Pick a weight where reps 11 and 12 force you to slow down.",
                            "If you hit 12 and could easily keep going to 20, go 1–2 plates heavier.",
                            "Sit tall, lock your thighs under the pads, pull the bar to your upper chest.",
                            "Drive your elbows down toward your back pockets.",
                            "Squeeze your shoulder blades tightly at the bottom.",
                        ],
                        set_specs={
                            "1": {"label": "12 reps"},
                            "2": {"label": "12 reps"},
                            "3": {"label": "Go to failure", "failure": True},
                        },
                    ),
                    _lower_ex(
                        "u1_row",
                        "Seated Cable Rows",
                        3,
                        "12",
                        subtitle="Mid-back & posture",
                        rest_sec=90,
                        rest_label="1 min 30 sec",
                        notes=[
                            "Target: mid-back and rear shoulders for posture and a tighter upper profile.",
                            "Use a weight similar to or slightly lighter than lat pulldowns.",
                            "It should heavily challenge your grip by the 12th rep.",
                            "Use the close-grip V-bar attachment.",
                            "Sit with knees slightly bent, pull the handle to your belly button.",
                            "Puff your chest out proud as you squeeze your back muscles.",
                        ],
                        set_specs={
                            "1": {"label": "12 reps"},
                            "2": {"label": "12 reps"},
                            "3": {"label": "12 reps"},
                        },
                    ),
                    _lower_ex(
                        "u1_curl",
                        "Cable Bicep Curls",
                        3,
                        "12",
                        subtitle="Sleek arm pull",
                        rest_sec=60,
                        rest_label="1 min",
                        notes=[
                            "Target: the front of the arms to tighten skin and tone the upper arm.",
                            "Use light-to-moderate weight on the low cable with a straight bar or rope.",
                            "Sets 1 and 2: clean 12 reps. Set 3: go to failure.",
                            "Stand tall, pin your elbows firmly against your ribcage.",
                            "Curl the bar toward your shoulders.",
                            "Keep your elbows frozen so your arms do 100% of the work.",
                        ],
                        set_specs={
                            "1": {"label": "12 reps"},
                            "2": {"label": "12 reps"},
                            "3": {"label": "Go to failure", "failure": True},
                        },
                    ),
                ],
            },
            {
                "id": "abs",
                "title": "Ab Section",
                "items": [
                    _lower_ex(
                        "u1_deadbug",
                        "Deadbugs",
                        3,
                        "10 per side",
                        subtitle="The Deep Core Stability Anchor",
                        rest_sec=60,
                        rest_label="1 min",
                        notes=[
                            "Keeps your lower back safe and teaches your deep core to stabilize your hips without adding width to your waist.",
                            "Lie flat on your back, gluing your spine into the floor.",
                            "Raise your arms straight up and bend your knees to 90 degrees.",
                            "Slowly lower your right arm behind you while extending your left leg straight out just above the floor.",
                            "Return to the center and switch sides — 10 reps per side (20 total).",
                        ],
                        set_specs={
                            "1": {"label": "10 per side (20 total)"},
                            "2": {"label": "10 per side (20 total)"},
                            "3": {"label": "10 per side (20 total)"},
                        },
                    ),
                    _lower_ex(
                        "u1_knee_raise",
                        "Hanging Knee Raises or Captain's Chair Raises",
                        3,
                        "15",
                        subtitle="The Lower Ab Wall Flatteners",
                        rest_sec=60,
                        rest_label="1 min",
                        notes=[
                            "Targets the lower portion of the front ab wall by forcing your pelvis to tilt upward, tightening that lower pouch.",
                            "Hang from a pull-up bar or lock your forearms into a Captain's Chair frame.",
                            "Do not just swing your legs up — focus on rolling your pelvis upward and bringing your knees all the way up to your chest.",
                            "Squeeze your abs at the top for a split second, then lower slowly under complete control to prevent swinging.",
                        ],
                        set_specs={
                            "1": {"label": "15 reps"},
                            "2": {"label": "15 reps"},
                            "3": {"label": "15 reps"},
                        },
                    ),
                ],
            },
        ],
    },
    "upper_abs_two": {
        "day_key": "upper_abs_two",
        "title": "Upper body + Abs 2",
        "emoji": "💪",
        "subtitle": "Bust-lift & under-arm sleeking",
        "session_mode": True,
        "sections": [
            {
                "id": "upper",
                "title": "Upper Body",
                "items": [
                    _lower_ex(
                        "u2_incline",
                        "Incline Dumbbell Chest Press",
                        3,
                        "12",
                        subtitle="Lift & firm the bust · bypass the shoulders",
                        rest_sec=90,
                        rest_label="1 min 30 sec",
                        notes=[
                            "Target: the upper chest to lift and firm the bust area while safely bypassing the shoulder joints.",
                            "Set the bench to a 30-degree incline.",
                            "Pick a weight where reps 11 and 12 are genuinely tough to push up.",
                            "Feet flat on the floor, elbows tucked in an arrow shape at your sides.",
                            "Press the dumbbells straight up, then lower slowly for a deep stretch at the bottom.",
                        ],
                        set_specs={
                            "1": {"label": "12 reps"},
                            "2": {"label": "12 reps"},
                            "3": {"label": "12 reps"},
                        },
                    ),
                    _lower_ex(
                        "u2_lateral",
                        "Dumbbell Lateral Raises",
                        3,
                        "15",
                        subtitle="Kept for subtle definition",
                        rest_sec=60,
                        rest_label="1 min",
                        notes=[
                            "Target: keeping the muscle active so it stays tight and firm against the bone, preventing softness.",
                            "Use very light weights (like 5 lb dumbbells).",
                            "High reps and light weight here purely to flush blood into the muscle and tone the skin — not to build size.",
                            "Stand tall, lift the weights out to your sides until they are level with your shoulders.",
                            "Lower them slowly — do not swing your body.",
                        ],
                        set_specs={
                            "1": {"label": "15 reps"},
                            "2": {"label": "15 reps"},
                            "3": {"label": "15 reps"},
                        },
                    ),
                    _lower_ex(
                        "u2_pushdown",
                        "Tricep Rope Pushdowns",
                        3,
                        "15",
                        subtitle="Under-arm sleeking",
                        rest_sec=60,
                        rest_label="1 min",
                        notes=[
                            "Target: the back of the arms to completely tighten and tone down the under-arm skin.",
                            "Select a weight on the cable machine that allows you to get a massive, deep burning sensation in the back of your arms by the 15th rep.",
                            "Pin your elbows firmly against your ribs and do not let them move.",
                            "Push the rope straight down to the floor, and forcefully flare the two ends of the rope completely apart at the very bottom to maximize the skin-tightening squeeze.",
                        ],
                        set_specs={
                            "1": {"label": "15 reps"},
                            "2": {"label": "15 reps"},
                            "3": {"label": "15 reps"},
                        },
                    ),
                ],
            },
            {
                "id": "abs",
                "title": "Ab Section",
                "items": [
                    _lower_ex(
                        "u2_hslr",
                        "Hanging Straight-Leg Raises",
                        3,
                        "12",
                        subtitle="The Maximum Leverage Front Core Builder",
                        rest_sec=60,
                        rest_label="1 min",
                        notes=[
                            "Keeping your legs straight forces your lower and upper front ab wall to fight heavy leverage.",
                            "Deeply conditions the front of your stomach without touching your sides.",
                            "Hang completely straight from a pull-up bar.",
                            "Without swinging or momentum, contract your abs to lift your legs straight out in front until parallel to the floor (an L shape).",
                            "Hold for a split second at the top, then lower slowly under strict control.",
                        ],
                        set_specs={
                            "1": {"label": "12 reps"},
                            "2": {"label": "12 reps"},
                            "3": {"label": "12 reps"},
                        },
                    ),
                    _lower_ex(
                        "u2_deadbug",
                        "Deadbugs",
                        3,
                        "10 per side",
                        subtitle="The Deep Core Stability Anchor",
                        rest_sec=60,
                        rest_label="1 min",
                        notes=[
                            "Keeps your lower back safe and teaches your deep core to stabilize your hips without adding width to your waist.",
                            "Lie flat on your back, gluing your spine into the floor.",
                            "Raise your arms straight up and bend your knees to 90 degrees.",
                            "Slowly lower your right arm behind you while extending your left leg straight out just above the floor.",
                            "Return to the center and switch sides — 10 reps per side (20 total).",
                        ],
                        set_specs={
                            "1": {"label": "10 per side (20 total)"},
                            "2": {"label": "10 per side (20 total)"},
                            "3": {"label": "10 per side (20 total)"},
                        },
                    ),
                ],
            },
        ],
    },
}

DAYS = [
    ("monday", "Monday (Glutes + Abs)", "🫁"),
    ("tuesday", "Tuesday (Upper Body + Abs)", "💪"),
    ("wednesday", "Wednesday (Glutes + Upper/Lower Abs)", "〰️"),
    ("thursday", "Thursday (Chest + Abs)", "🔭"),
    ("friday", "Friday (Glutes + Abs)", "🌲"),
    ("saturday", "Saturday (Glutes + Abs)", "🪐"),
    ("sunday", "Sunday (Leg day)", "🦵"),
]


def _sec(sid: str, title: str, items: list) -> dict:
    return {
        "id": sid,
        "title": title,
        "items": [{"id": iid, "text": text, "checked": False} for iid, text in items],
    }


WEEKLY_PLANS = {
    "monday": {
        "day_key": "monday",
        "title": "Monday (Glutes + Abs)",
        "emoji": "🫁",
        "subtitle": "Gym (5x/week) & Run (2x/week)",
        "sections": [
            _sec("warmup", "Warm up:", [
                ("w1", "7 mins on treadmill"),
                ("w2", "Dynamic stretches — deep lunge w/ reach, 90/90, leg swings, kick-backs, hip circles, squat"),
            ]),
            _sec("glutes", "Glutes workout:", [
                ("g1", "Sumo Squats — 4 x Failure (progressive overload)"),
                ("g2", "Barbell Hip Thrusts — 4 x Failure; 2 sec holds (progressive overload)"),
                ("g3", "Bulgarian Split Squats — 4 x Failure; Split: 4/3; progressive overload to 35"),
                ("g4", "Cable Pull-Throughs — 4 x 6 (split: 8/7/6/6) w/ progressive overload"),
                ("g5", "Glute Kickbacks on the Machine — 3 x Failure (progressive overload)"),
            ]),
            _sec("abs", "Abs workout:", [
                ("a1", "Rope Cable Crunches — 4 x Failure (progressive overload)"),
                ("a2", "Hanging Leg Raises — 3 x Failure"),
                ("a3", "Ab Machine — 3 x Failure"),
                ("a4", "Decline Bench Weighted Crunches — 3 x Failure"),
            ]),
            _sec("wrap", "Cardio:", [
                ("r1", "20 mins on treadmill (incline: 12.0, speed: 3.5)"),
                ("r2", "Stretch (split: 13 mins / 17 mins) (30 mins)"),
            ]),
        ],
    },
    "tuesday": {
        "day_key": "tuesday",
        "title": "Tuesday (Upper Body + Abs)",
        "emoji": "💪",
        "subtitle": "",
        "sections": [
            _sec("warmup", "Warm up:", [
                ("w1", "7 mins on treadmill"),
                ("w2", "Dynamic stretches"),
            ]),
            _sec("upper", "Upper Body:", [
                ("u1", "Lat Pulldown — 3 x 12"),
                ("u2", "Seated Cable Rows — 3 x 12"),
                ("u3", "Bent Over Rows — 3 x 12"),
                ("u4", "Lateral Raises — 3 x 15"),
            ]),
            _sec("abs", "Abs:", [
                ("a1", "Hanging Leg Raises — 3 x 12"),
                ("a2", "Kneeling Cable Crunch — 3 x 8 (progressive overload)"),
                ("a3", "Plank w hip dips — 3 x 45 secs"),
                ("a4", "Side Plank + Reach-Through Twist — 3 x 45 secs"),
            ]),
            _sec("cardio", "Cardio:", [
                ("c1", "Stair master (30 mins)"),
            ]),
        ],
    },
    "wednesday": {
        "day_key": "wednesday",
        "title": "Wednesday (Glutes + Upper/Lower Abs)",
        "emoji": "〰️",
        "subtitle": "",
        "sections": [
            _sec("warmup", "Warm up:", [
                ("w1", "Treadmill (7 mins)"),
                ("w2", "Dynamic Stretches"),
            ]),
            _sec("glutes", "Glutes workout:", [
                ("g1", "Barbell Hip Thrusts — 4 x Failure; 2 sec holds (progressive overload)"),
                ("g2", "Barbell Squats — 3 x 10 (progressive overload)"),
                ("g3", "Hip abductions — 3 x 12 (progressive overload)"),
                ("g4", "Cable kickbacks — 3 x 10 (progressive overload)"),
            ]),
            _sec("abs", "Abs Workout:", [
                ("a1", "Weighted Dead Bugs — 4 x 12"),
                ("a2", "Russian twists — 3 x 45 secs"),
                ("a3", "Hanging Leg Raises — 4 x 10"),
                ("a4", "Side to Side Leg Raises — 4 x 20 inches"),
            ]),
            _sec("cardio", "Cardio:", [
                ("c1", "Incline Treadmill (30 mins)"),
            ]),
        ],
    },
    "thursday": {
        "day_key": "thursday",
        "title": "Thursday (Chest + Abs)",
        "emoji": "🔭",
        "subtitle": "",
        "sections": [
            _sec("warmup", "Warm up:", [
                ("w1", "Dynamic stretches"),
            ]),
            _sec("block1", "Block 1: Triceps & Arms:", [
                ("b1", "Tricep Rope Pushdowns — 3 x 15 (Weight: 25 lbs, Rest: 45 sec)"),
                ("b2", "Lat pulldowns — 3 x 15 (Weight: 40 lbs)"),
            ]),
            _sec("abs", "Abs:", [
                ("a1", "Hanging Leg Raises — 3 x 12"),
                ("a2", "Dead Bugs — 3 x 12"),
                ("a3", "Plank with hip dips — 3 x 45 secs"),
            ]),
        ],
    },
    "friday": {
        "day_key": "friday",
        "title": "Friday (Glutes + Abs)",
        "emoji": "🌲",
        "subtitle": "",
        "sections": [
            _sec("warmup", "Warm up:", [
                ("w1", "Treadmill (7 mins)"),
                ("w2", "Dynamic Stretches"),
            ]),
            _sec("glutes", "Glutes workout:", [
                ("g1", "Barbell Hip Thrusts — 4 x Failure; 2 sec holds (progressive overload)"),
                ("g2", "Bulgarian Split Squats w/ weights — 3 x 10 (progressive overload)"),
                ("g3", "Romanian Deadlifts (RDLs) — 4 x 10 (progressive overload)"),
                ("g4", "Hyperextensions — 3 x 10 (progressive overload)"),
            ]),
            _sec("abs", "Abs Workout:", [
                ("a1", "Weighted Dead Bugs — 4 x 12"),
                ("a2", "Hanging Leg Raises + side to side — 4 x 10"),
                ("a3", "Side to Side w/ bottle in front — 3 x 20"),
                ("a4", "Plank with hip dips — 3 x 45 secs"),
            ]),
            _sec("cardio", "Cardio:", [
                ("c1", "Incline Treadmill (30 mins)"),
            ]),
        ],
    },
    "saturday": {
        "day_key": "saturday",
        "title": "Saturday (Glutes + Abs)",
        "emoji": "🪐",
        "subtitle": "",
        "sections": [
            _sec("warmup", "Warm up:", [
                ("w1", "Stretching"),
            ]),
            _sec("main", "", [
                ("m1", "Hip Thrusts (3 x 8) — progressive overload & 10 sec hold"),
                ("m2", "Bulgarian Split Squats w/ weights (3 x 8) — progressive overload"),
                ("m3", "Sumo Squats (3 x 10) — progressive overload"),
                ("m4", "RDLs (3 x 10) — progressive overload"),
                ("m5", "In and outs + weight (3 x 30)"),
                ("m6", "Leg raises w/ weights (3 x 30)"),
                ("m7", "Russian twists w/ weights (3 x 50)"),
                ("m8", "Decline sit-ups with weights (3 x 20)"),
                ("m9", "Over-unders (3 x 30)"),
                ("m10", "Hollow Body Hold (2 mins x 3)"),
                ("m11", "Plank (2 mins x 3)"),
                ("m12", "Treadmill (10 mins at least)"),
            ]),
        ],
    },
    "sunday": {
        "day_key": "sunday",
        "title": "Sunday (Leg day)",
        "emoji": "🦵",
        "subtitle": "Edit this plan to match your leg routine",
        "sections": [
            _sec("warmup", "Warm up:", [
                ("w1", "7 mins on treadmill"),
                ("w2", "Dynamic stretches — leg swings, hip circles"),
            ]),
            _sec("legs", "Leg workout:", [
                ("l1", "Add your leg exercises here — tap Edit plan"),
            ]),
            _sec("cardio", "Cardio:", [
                ("c1", "Optional cardio"),
            ]),
        ],
    },
}


def _preserve_checks(old: dict | None, new: dict) -> dict:
    if not old:
        return new
    checked = {item["id"]: item for sec in old.get("sections", []) for item in sec.get("items", []) if item.get("checked")}
    for sec in new["sections"]:
        for item in sec["items"]:
            if item["id"] in checked:
                item["checked"] = True
                if checked[item["id"]].get("checked_at"):
                    item["checked_at"] = checked[item["id"]]["checked_at"]
    return new


def seed_weekly_plans(force: bool = False):
    PLANS_DIR.mkdir(parents=True, exist_ok=True)
    meta = PLANS_DIR / "_version.json"
    current = 0
    if meta.exists():
        current = json.loads(meta.read_text()).get("version", 0)
    if not force and current >= PLAN_VERSION:
        return
    for day_key in WEEKLY_PLANS:
        path = PLANS_DIR / f"{day_key}.json"
        old = json.loads(path.read_text()) if path.exists() else None
        plan = _preserve_checks(old, json.loads(json.dumps(WEEKLY_PLANS[day_key])))
        plan["plan_version"] = PLAN_VERSION
        path.write_text(json.dumps(plan, indent=2))
    meta.write_text(json.dumps({"version": PLAN_VERSION}))


def ensure_plans():
    PLANS_DIR.mkdir(parents=True, exist_ok=True)
    seed_weekly_plans()
    seed_lower_plans()
    seed_upper_abs_plans()
    seed_cardio_plans()


def seed_cardio_plans(force: bool = False):
    PLANS_DIR.mkdir(parents=True, exist_ok=True)
    meta = PLANS_DIR / "_cardio_version.json"
    current = 0
    if meta.exists():
        current = json.loads(meta.read_text()).get("version", 0)
    if not force and current >= CARDIO_PLAN_VERSION:
        return
    for plan_key, template in CARDIO_SUB_PLANS.items():
        path = PLANS_DIR / f"{plan_key}.json"
        old = json.loads(path.read_text()) if path.exists() else None
        plan = _preserve_checks(old, json.loads(json.dumps(template)))
        plan["plan_version"] = CARDIO_PLAN_VERSION
        path.write_text(json.dumps(plan, indent=2))
    meta.write_text(json.dumps({"version": CARDIO_PLAN_VERSION}))


def seed_lower_plans(force: bool = False):
    PLANS_DIR.mkdir(parents=True, exist_ok=True)
    meta = PLANS_DIR / "_lower_version.json"
    current = 0
    if meta.exists():
        current = json.loads(meta.read_text()).get("version", 0)
    if not force and current >= LOWER_PLAN_VERSION:
        return
    for plan_key, template in LOWER_SUB_PLANS.items():
        path = PLANS_DIR / f"{plan_key}.json"
        old = json.loads(path.read_text()) if path.exists() else None
        plan = _preserve_checks(old, json.loads(json.dumps(template)))
        plan["plan_version"] = LOWER_PLAN_VERSION
        path.write_text(json.dumps(plan, indent=2))
    meta.write_text(json.dumps({"version": LOWER_PLAN_VERSION}))


def seed_upper_abs_plans(force: bool = False):
    PLANS_DIR.mkdir(parents=True, exist_ok=True)
    meta = PLANS_DIR / "_upper_abs_version.json"
    current = 0
    if meta.exists():
        current = json.loads(meta.read_text()).get("version", 0)
    if not force and current >= UPPER_ABS_PLAN_VERSION:
        return
    for plan_key, template in UPPER_ABS_SUB_PLANS.items():
        path = PLANS_DIR / f"{plan_key}.json"
        old = json.loads(path.read_text()) if path.exists() else None
        plan = _preserve_checks(old, json.loads(json.dumps(template)))
        plan["plan_version"] = UPPER_ABS_PLAN_VERSION
        path.write_text(json.dumps(plan, indent=2))
    meta.write_text(json.dumps({"version": UPPER_ABS_PLAN_VERSION}))


def lower_days_ordered(week: str | None = None) -> list[str]:
    """Weekday keys tagged lower, in Sat→Fri order."""
    plan = get_week_plan(week)
    d = date.fromisoformat(week) if week and len(week) == 10 else date.today()
    start = _week_start(d)
    out = []
    for i in range(7):
        cell = start + timedelta(days=i)
        dk = WEEKDAY_KEYS[cell.weekday()]
        if plan.get(dk) == "lower":
            out.append(dk)
    return out


def lower_slot_for_day(day_key: str, week: str | None = None) -> str | None:
    """Map a lower-tagged weekday to one|two|three."""
    dk = (day_key or "").strip().lower()
    lowers = lower_days_ordered(week)
    if dk not in lowers:
        return None
    idx = lowers.index(dk)
    if idx >= len(LOWER_SLOTS):
        return None
    return LOWER_SLOTS[idx]


def lower_plan_key_for_day(day_key: str, week: str | None = None) -> str | None:
    slot = lower_slot_for_day(day_key, week)
    return LOWER_SLOT_TO_KEY.get(slot or "")


def lower_plan_key_for_slot(slot: str) -> str | None:
    return LOWER_SLOT_TO_KEY.get((slot or "").strip().lower())


def lower_hub_cards(week: str | None = None) -> list[dict]:
    """Cards for /gym/lower hub."""
    week = week or current_week_key()
    lowers = lower_days_ordered(week)
    today = today_day_key()
    cards = []
    for i, slot in enumerate(LOWER_SLOTS):
        plan_key = LOWER_SLOT_TO_KEY[slot]
        template = LOWER_SUB_PLANS[plan_key]
        assigned_day = lowers[i] if i < len(lowers) else None
        plan = get_plan(plan_key)
        total_sets = sum(
            len(item.get("sets") or [])
            or item.get("sets_target")
            or 1
            for sec in plan.get("sections", [])
            for item in sec.get("items", [])
        )
        done_sets = sum(
            1
            for sec in plan.get("sections", [])
            for item in sec.get("items", [])
            for s in item.get("sets") or []
            if s.get("done")
        )
        exercise_count = sum(len(sec.get("items", [])) for sec in plan.get("sections", []))
        cards.append({
            "slot": slot,
            "plan_key": plan_key,
            "title": template["title"],
            "subtitle": template.get("subtitle", ""),
            "emoji": template.get("emoji", "🦵"),
            "assigned_day": assigned_day,
            "is_today": assigned_day == today,
            "exercise_count": exercise_count,
            "progress": f"{done_sets}/{total_sets}" if total_sets else "—",
            "has_content": exercise_count > 0,
            "placeholder": plan.get("placeholder", ""),
        })
    return cards


def upper_abs_days_ordered(week: str | None = None) -> list[str]:
    """Weekday keys tagged upper_abs, in Sat→Fri order."""
    plan = get_week_plan(week)
    d = date.fromisoformat(week) if week and len(week) == 10 else date.today()
    start = _week_start(d)
    out = []
    for i in range(7):
        cell = start + timedelta(days=i)
        dk = WEEKDAY_KEYS[cell.weekday()]
        if plan.get(dk) == "upper_abs":
            out.append(dk)
    return out


def upper_abs_slot_for_day(day_key: str, week: str | None = None) -> str | None:
    dk = (day_key or "").strip().lower()
    days = upper_abs_days_ordered(week)
    if dk not in days:
        return None
    idx = days.index(dk)
    if idx >= len(UPPER_ABS_SLOTS):
        return None
    return UPPER_ABS_SLOTS[idx]


def upper_abs_plan_key_for_day(day_key: str, week: str | None = None) -> str | None:
    slot = upper_abs_slot_for_day(day_key, week)
    return UPPER_ABS_SLOT_TO_KEY.get(slot or "")


def upper_abs_plan_key_for_slot(slot: str) -> str | None:
    return UPPER_ABS_SLOT_TO_KEY.get((slot or "").strip().lower())


def upper_abs_hub_cards(week: str | None = None) -> list[dict]:
    """Cards for /gym/upper hub."""
    week = week or current_week_key()
    assigned = upper_abs_days_ordered(week)
    today = today_day_key()
    cards = []
    for i, slot in enumerate(UPPER_ABS_SLOTS):
        plan_key = UPPER_ABS_SLOT_TO_KEY[slot]
        template = UPPER_ABS_SUB_PLANS[plan_key]
        assigned_day = assigned[i] if i < len(assigned) else None
        plan = get_plan(plan_key)
        total_sets = sum(
            len(item.get("sets") or [])
            or item.get("sets_target")
            or 1
            for sec in plan.get("sections", [])
            for item in sec.get("items", [])
        )
        done_sets = sum(
            1
            for sec in plan.get("sections", [])
            for item in sec.get("items", [])
            for s in item.get("sets") or []
            if s.get("done")
        )
        exercise_count = sum(len(sec.get("items", [])) for sec in plan.get("sections", []))
        cards.append({
            "slot": slot,
            "plan_key": plan_key,
            "title": template["title"],
            "subtitle": template.get("subtitle", ""),
            "emoji": template.get("emoji", "💪"),
            "assigned_day": assigned_day,
            "is_today": assigned_day == today,
            "exercise_count": exercise_count,
            "progress": f"{done_sets}/{total_sets}" if total_sets else "—",
            "has_content": exercise_count > 0,
            "placeholder": plan.get("placeholder", ""),
        })
    return cards


def cardio_hub_cards(week: str | None = None) -> list[dict]:
    """Cards for /gym/cardio hub."""
    week = week or current_week_key()
    cardio_day = get_cardio_day(week)
    today = today_day_key()
    cards = []
    for slot in CARDIO_SLOTS:
        plan_key = CARDIO_SLOT_TO_KEY[slot]
        template = CARDIO_SUB_PLANS[plan_key]
        if slot == "running":
            try:
                from . import runs

                runs.ensure()
                target = runs.week_target(week)
                latest = runs.latest_run()
                week_runs = runs.runs_this_week(week)
                if latest:
                    progress = f"{latest['miles']:.2f} mi"
                    subtitle = f"Target {target:.1f} mi · {latest['pace_display']}"
                else:
                    progress = f"Target {target:.1f} mi"
                    subtitle = template.get("subtitle", "Progress tracker")
                cards.append({
                    "slot": slot,
                    "plan_key": plan_key,
                    "title": template["title"],
                    "subtitle": subtitle,
                    "emoji": template.get("emoji", "🏃"),
                    "assigned_day": cardio_day,
                    "is_today": cardio_day == today,
                    "exercise_count": len(week_runs),
                    "progress": progress,
                    "has_content": True,
                    "placeholder": "",
                })
                continue
            except Exception:
                pass

        plan = get_plan(plan_key)
        total_sets = sum(
            len(item.get("sets") or [])
            or item.get("sets_target")
            or 1
            for sec in plan.get("sections", [])
            for item in sec.get("items", [])
        )
        done_sets = sum(
            1
            for sec in plan.get("sections", [])
            for item in sec.get("items", [])
            for s in item.get("sets") or []
            if s.get("done")
        )
        exercise_count = sum(len(sec.get("items", [])) for sec in plan.get("sections", []))
        cards.append({
            "slot": slot,
            "plan_key": plan_key,
            "title": template["title"],
            "subtitle": template.get("subtitle", ""),
            "emoji": template.get("emoji", "🏃"),
            "assigned_day": cardio_day,
            "is_today": cardio_day == today,
            "exercise_count": exercise_count,
            "progress": f"{done_sets}/{total_sets}" if total_sets else "—",
            "has_content": exercise_count > 0,
            "placeholder": plan.get("placeholder", ""),
        })
    return cards


def cardio_plan_key_for_slot(slot: str) -> str | None:
    return CARDIO_SLOT_TO_KEY.get((slot or "").strip().lower())


def gym_href_for_day(day_key: str, week: str | None = None) -> str:
    """Resolve the best link for a weekday or sub-plan."""
    dk = (day_key or "").strip().lower()
    if dk in LOWER_PLAN_KEYS:
        slot = LOWER_KEY_TO_SLOT.get(dk, "one")
        return f"/gym/lower/{slot}"
    if dk in UPPER_ABS_PLAN_KEYS:
        slot = UPPER_ABS_KEY_TO_SLOT.get(dk, "one")
        return f"/gym/upper/{slot}"
    if dk in CARDIO_PLAN_KEYS:
        slot = CARDIO_KEY_TO_SLOT.get(dk, "running")
        return f"/gym/cardio/{slot}"
    if lower_slot_for_day(dk, week):
        return "/gym/lower"
    if upper_abs_slot_for_day(dk, week):
        return "/gym/upper"
    if get_day_workout(dk, week) == "cardio":
        return "/gym/cardio"
    if get_day_workout(dk, week) == "upper_abs":
        return "/gym/upper"
    return f"/gym/{dk}"


def today_day_key() -> str:
    return WEEKDAY_KEYS[datetime.now().weekday()]


# ── Weekly workout plan (Sat→Fri) ───────────────────────────────────────────

def current_week_key(d: date | None = None) -> str:
    return sleep_week_key(d or date.today())


def _load_week_plans() -> dict:
    if WEEK_PLAN_FILE.exists():
        try:
            return json.loads(WEEK_PLAN_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _load_cardio() -> dict:
    if CARDIO_FILE.exists():
        try:
            return json.loads(CARDIO_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_week_plans(data: dict) -> None:
    if len(data) > 20:
        for k in sorted(data.keys())[:-20]:
            data.pop(k, None)
    WEEK_PLAN_FILE.parent.mkdir(parents=True, exist_ok=True)
    WEEK_PLAN_FILE.write_text(json.dumps(data, indent=2))


def _migrate_workout_type_keys(all_plans: dict) -> None:
    """Rename retired workout type keys in saved week plans."""
    changed = False
    for week, plan in all_plans.items():
        if not isinstance(plan, dict):
            continue
        for dk, wt in list(plan.items()):
            if wt == "full":
                plan[dk] = "upper_abs"
                changed = True
            elif wt == "upper":
                plan[dk] = "upper_abs"
                changed = True
    if changed:
        _save_week_plans(all_plans)


def _migrate_cardio_into_week_plan(all_plans: dict) -> None:
    legacy = _load_cardio()
    changed = False
    for week, day in legacy.items():
        if not day or week in all_plans:
            continue
        dk = str(day).strip().lower()
        if dk in WEEKDAY_KEYS:
            all_plans[week] = {dk: "cardio"}
            changed = True
    if changed:
        _save_week_plans(all_plans)


def _dedupe_single_day_types(plan: dict[str, str], ordered_days: list[str] | None = None) -> dict[str, str]:
    """Keep at most one day per workout type that has max_days=1."""
    ordered = ordered_days or WEEKDAY_KEYS
    seen_single: set[str] = set()
    out: dict[str, str] = {}
    for dk in ordered:
        wt = plan.get(dk)
        if not wt:
            continue
        if WORKOUT_TYPES.get(wt, {}).get("max_days") == 1:
            if wt in seen_single:
                continue
            seen_single.add(wt)
        out[dk] = wt
    return out


def get_week_plan(week: str | None = None) -> dict[str, str]:
    """day_key → workout type for the given Sat-start week."""
    week = week or current_week_key()
    data = _load_week_plans()
    _migrate_cardio_into_week_plan(data)
    _migrate_workout_type_keys(data)
    raw = data.get(week) or {}
    out: dict[str, str] = {}
    for dk, wt in raw.items():
        key = str(dk).strip().lower()
        kind = str(wt).strip().lower()
        if key in WEEKDAY_KEYS and kind in WORKOUT_TYPES:
            out[key] = kind
    return _dedupe_single_day_types(out, WEEKDAY_KEYS)


def get_cardio_day(week: str | None = None) -> str | None:
    plan = get_week_plan(week)
    for dk, wt in plan.items():
        if wt == "cardio":
            return dk
    return None


def get_day_workout(day_key: str, week: str | None = None) -> str | None:
    return get_week_plan(week).get((day_key or "").strip().lower())


def day_workout_display(day_key: str, week: str | None = None) -> dict:
    wt = get_day_workout(day_key, week)
    if wt and wt in WORKOUT_TYPES:
        meta = WORKOUT_TYPES[wt]
        label = meta["label"]
        return {
            "workout_type": wt,
            "label": label,
            "emoji": meta["emoji"],
            "css": meta["css"],
            "lower_slot": lower_slot_for_day(day_key, week),
            "upper_abs_slot": upper_abs_slot_for_day(day_key, week),
        }
    return {
        "workout_type": None,
        "label": "",
        "emoji": "",
        "css": "",
        "lower_slot": None,
        "upper_abs_slot": None,
    }


def validate_week_plan(plan: dict[str, str], ordered_days: list[str] | None = None) -> list[dict]:
    """Return rule violations. level: block (hard stop) | warn."""
    ordered = ordered_days or WEEKDAY_KEYS
    violations: list[dict] = []
    idx = {dk: i for i, dk in enumerate(ordered)}

    for wtype, meta in WORKOUT_TYPES.items():
        max_days = meta.get("max_days")
        if max_days:
            count = sum(1 for dk in ordered if plan.get(dk) == wtype)
            if count > max_days:
                label = meta["label"]
                violations.append({
                    "level": "block",
                    "code": f"{wtype}_max_days",
                    "message": (
                        f"{meta['emoji']} {label} is {max_days}× this week max — "
                        f"unpick one first."
                    ),
                })

    lower_days = [idx[dk] for dk in ordered if plan.get(dk) == "lower" and dk in idx]
    min_gap = int(WORKOUT_TYPES["lower"].get("min_gap") or 1)
    for a in range(len(lower_days)):
        for b in range(a + 1, len(lower_days)):
            gap = lower_days[b] - lower_days[a]
            if gap < (min_gap + 1):
                violations.append({
                    "level": "block",
                    "code": "lower_too_close",
                    "message": (
                        "🦵 Lower body needs 48 hours between sessions — "
                        "leave at least one day in between (Mon → Wed, not Mon → Tue)."
                    ),
                })
                break
        else:
            continue
        break

    if not any(plan.get(d) == "rest" for d in ordered):
        violations.append({
            "level": "warn",
            "code": "no_rest_day",
            "message": "🔋 Schedule one rest day this week.",
        })

    return violations


def save_week_plan(assignments: dict[str, str], week: str | None = None) -> dict:
    week = week or current_week_key()
    clean: dict[str, str] = {}
    for dk, wt in (assignments or {}).items():
        key = str(dk).strip().lower()
        kind = str(wt).strip().lower()
        if key in WEEKDAY_KEYS and kind in WORKOUT_TYPES:
            clean[key] = kind

    strip = week_strip(date.fromisoformat(week) if len(week) == 10 else date.today())
    ordered = [c["day_key"] for c in strip]
    violations = validate_week_plan(clean, ordered)
    blocked = any(v["level"] == "block" for v in violations)
    if blocked:
        return {
            "ok": False,
            "week": week,
            "plan": clean,
            "violations": violations,
        }

    data = _load_week_plans()
    _migrate_cardio_into_week_plan(data)
    _migrate_workout_type_keys(data)
    if clean:
        data[week] = clean
    else:
        data.pop(week, None)
    _save_week_plans(data)

    legacy = _load_cardio()
    cardio_day = get_cardio_day(week)
    if cardio_day:
        legacy[week] = cardio_day
    elif week in legacy:
        legacy.pop(week, None)
    CARDIO_FILE.parent.mkdir(parents=True, exist_ok=True)
    CARDIO_FILE.write_text(json.dumps(legacy, indent=2))

    return {
        "ok": True,
        "week": week,
        "plan": clean,
        "violations": violations,
    }


def set_cardio_day(day_key: str, week: str | None = None) -> dict:
    week = week or current_week_key()
    plan = get_week_plan(week)
    dk = (day_key or "").strip().lower()
    for key, wt in list(plan.items()):
        if wt == "cardio":
            plan.pop(key, None)
    if dk in WEEKDAY_KEYS:
        plan[dk] = "cardio"
    return save_week_plan(plan, week)


def week_plan_from_form(form_lists: dict[str, list[str]], week: str | None = None) -> dict:
    """Build day→type map from checkbox lists keyed by workout type."""
    plan: dict[str, str] = {}
    for wtype, day_keys in form_lists.items():
        if wtype not in WORKOUT_TYPES:
            continue
        meta = WORKOUT_TYPES[wtype]
        keys = [
            str(dk).strip().lower()
            for dk in day_keys
            if str(dk).strip().lower() in WEEKDAY_KEYS
        ]
        if meta.get("max_days") == 1 and len(keys) > 1:
            keys = keys[-1:]
        for key in keys:
            plan[key] = wtype
    return save_week_plan(plan, week)


def week_plan_summary(week: str | None = None) -> str:
    plan = get_week_plan(week)
    if not plan:
        return "No workouts assigned this week yet."
    strip = week_strip()
    ordered = {c["day_key"]: c["full"] for c in strip}
    lines = []
    for dk in [c["day_key"] for c in strip]:
        wt = plan.get(dk)
        if not wt:
            continue
        meta = WORKOUT_TYPES[wt]
        lines.append(f"  {ordered.get(dk, dk)}: {meta['emoji']} {meta['label']}")
    return "This week's workouts:\n" + "\n".join(lines) if lines else "No workouts assigned this week yet."


def week_strip(d: date | None = None) -> list:
    """Sat→Fri cells for the current week."""
    d = d or date.today()
    start = _week_start(d)
    today_iso = date.today().isoformat()
    week = current_week_key(d)
    plan = get_week_plan(week)
    out = []
    for i in range(7):
        cell = start + timedelta(days=i)
        dk = WEEKDAY_KEYS[cell.weekday()]
        wt = plan.get(dk)
        meta = WORKOUT_TYPES.get(wt or "", {})
        lower_slot = lower_slot_for_day(dk, week) if wt == "lower" else None
        upper_abs_slot = upper_abs_slot_for_day(dk, week) if wt == "upper_abs" else None
        display_label = meta.get("label", "")
        out.append({
            "day_key": dk,
            "label": cell.strftime("%a"),
            "full": cell.strftime("%A"),
            "initial": cell.strftime("%a")[:1],
            "date_num": cell.day,
            "iso_date": cell.isoformat(),
            "is_today": cell.isoformat() == today_iso,
            "workout_type": wt,
            "workout_emoji": meta.get("emoji", ""),
            "workout_label": display_label,
            "workout_css": meta.get("css", ""),
            "is_cardio": wt == "cardio",
            "lower_slot": lower_slot,
            "upper_abs_slot": upper_abs_slot,
            "href": gym_href_for_day(dk, week),
        })
    return out


def list_days() -> list:
    ensure_plans()
    today_key = today_day_key()
    plan = get_week_plan()
    out = []
    for day_key, title, emoji in DAYS:
        gym_plan = get_plan(day_key)
        total = sum(len(s["items"]) for s in gym_plan["sections"])
        done = sum(1 for s in gym_plan["sections"] for i in s["items"] if i.get("checked"))
        wt = plan.get(day_key)
        meta = WORKOUT_TYPES.get(wt or "", {})
        display = day_workout_display(day_key)
        out.append({
            "day_key": day_key,
            "title": title,
            "emoji": emoji,
            "progress": f"{done}/{total}" if total else "0/0",
            "is_today": day_key == today_key,
            "workout_type": wt,
            "workout_emoji": display["emoji"],
            "workout_label": display["label"],
            "workout_css": display["css"],
            "is_cardio": wt == "cardio",
            "display_title": display["label"] or title,
            "display_emoji": display["emoji"] or emoji,
            "lower_slot": display.get("lower_slot"),
            "href": gym_href_for_day(day_key),
        })
    return out


def get_plan(day_key: str) -> dict:
    ensure_plans()
    path = PLANS_DIR / f"{day_key}.json"
    if path.exists():
        return json.loads(path.read_text())
    if day_key in LOWER_SUB_PLANS:
        return json.loads(json.dumps(LOWER_SUB_PLANS[day_key]))
    if day_key in UPPER_ABS_SUB_PLANS:
        return json.loads(json.dumps(UPPER_ABS_SUB_PLANS[day_key]))
    if day_key in CARDIO_SUB_PLANS:
        return json.loads(json.dumps(CARDIO_SUB_PLANS[day_key]))
    return WEEKLY_PLANS.get(day_key, WEEKLY_PLANS["monday"])


def save_plan(plan: dict):
    PLANS_DIR.mkdir(parents=True, exist_ok=True)
    path = PLANS_DIR / f"{plan['day_key']}.json"
    path.write_text(json.dumps(plan, indent=2))


def toggle_item(day_key: str, item_id: str, checked: bool) -> dict:
    plan = get_plan(day_key)
    for sec in plan["sections"]:
        for item in sec["items"]:
            if item["id"] == item_id:
                item["checked"] = checked
                item["checked_at"] = datetime.now().isoformat() if checked else None
    save_plan(plan)
    return plan


def update_item_text(day_key: str, item_id: str, text: str) -> dict:
    plan = get_plan(day_key)
    for sec in plan["sections"]:
        for item in sec["items"]:
            if item["id"] == item_id:
                item["text"] = text.strip()
    save_plan(plan)
    return plan


def add_item(day_key: str, section_id: str, text: str) -> dict:
    plan = get_plan(day_key)
    text = (text or "").strip()
    if not text:
        raise ValueError("Exercise text required")
    added = False
    for sec in plan["sections"]:
        if sec["id"] == section_id:
            sec["items"].append({"id": str(uuid.uuid4())[:8], "text": text, "checked": False})
            added = True
            break
    if not added:
        raise ValueError(f"Section not found: {section_id}")
    save_plan(plan)
    return plan


def add_section(day_key: str, title: str) -> dict:
    title = (title or "").strip()
    if not title:
        raise ValueError("Section title required")
    plan = get_plan(day_key)
    plan["sections"].append({"id": str(uuid.uuid4())[:8], "title": title, "items": []})
    save_plan(plan)
    return plan


def reset_checks(day_key: str) -> dict:
    plan = get_plan(day_key)
    for sec in plan["sections"]:
        for item in sec["items"]:
            item["checked"] = False
            item.pop("checked_at", None)
            item.pop("sets", None)
    save_plan(plan)
    return plan


def plan_context_for_ai(day_key: str) -> str:
    plan = get_plan(day_key)
    lines = [f"Workout plan: {plan['title']}"]
    for sec in plan["sections"]:
        if sec.get("title"):
            lines.append(f"\n{sec['title']}")
        for item in sec["items"]:
            mark = "[x]" if item.get("checked") else "[ ]"
            lines.append(f"  {mark} {item['text']}")
    return "\n".join(lines)


def ask_gym_ai(day_key: str, question: str) -> dict:
    from .gym_gifs import find_gif_for_request, wants_gif

    q = (question or "").strip()
    if wants_gif(q):
        gif = find_gif_for_request(q)
        if gif.get("url"):
            label = gif.get("label") or gif.get("query") or "that exercise"
            return {
                "answer": f"Here's {label}:",
                "gif_url": gif["url"],
            }
        return {
            "answer": (
                f"I couldn't find a clean demo GIF for that. "
                f"Try rephrasing — e.g. *gif of barbell hip thrust form*."
            ),
            "gif_url": None,
        }

    from openai import OpenAI

    ctx = plan_context_for_ai(day_key)
    prompt = f"""You are Melani's personal gym assistant. Clinical, concise, practical.
Answer using HER workout plan below. Give sets, rest times (minutes), form tips when relevant.
Not a doctor. If unsure, say so.

{ctx}

Question: {q}"""

    ollama = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
    try:
        resp = ollama.chat.completions.create(
            model="llama3",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
        )
        text = (resp.choices[0].message.content or "").strip()
        return {"answer": text, "gif_url": None}
    except Exception as e:
        return {"answer": f"AI offline — start Ollama. ({e})", "gif_url": None}
