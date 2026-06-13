"""Hygiene & skincare — daily checklists, weekly calendar, product inventory."""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timedelta

from .db import get_conn, today
from .paths import HEALTH_DATA
from .sleep import _week_start, week_key as sleep_week_key

HYGIENE_DIR = HEALTH_DATA / "hygiene"
SCHEDULE_FILE = HYGIENE_DIR / "schedule.json"
PRODUCTS_FILE = HYGIENE_DIR / "products.json"
SCHEDULE_LOG_FILE = HYGIENE_DIR / "schedule_log.json"
WEEK_PLAN_FILE = HYGIENE_DIR / "week_plan.json"

ROUTINE_LABELS = {
    "morning": "Morning routine",
    "evening": "Evening skincare",
    "daily_shower": "Daily shower",
    "everything_shower": "Everything shower",
    "hair_care": "Hair care",
    "pm_mark_fading": "Regular night",
    "pm_retinol": "Retinol night",
    "pm_clay_night": "Clay mask night",
    "pm_panoxyl": "PanOxyl night",
}

WEEKDAY_LABELS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]
WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

SHOWER_ROUTINE_TYPES = {
    "daily_shower": {
        "label": "Daily shower",
        "emoji": "🚿",
        "css": "daily-shower",
        "hint": "Pick your days",
    },
    "everything_shower": {
        "label": "Everything shower",
        "emoji": "🛁",
        "css": "everything-shower",
        "max_days": 1,
        "hint": "1× this week",
    },
    "hair_care": {
        "label": "Hair care",
        "emoji": "💇",
        "css": "hair-care",
        "max_days": 2,
        "hint": "2× this week",
    },
}

SKINCARE_ROUTINE_TYPES = {
    "pm_mark_fading": {
        "label": "Regular night",
        "short_label": "Regular",
        "emoji": "🧴",
        "css": "pm-mark-fading",
        "guide_intro": "Fade fresh and embedded acne marks with niacinamide and TXA.",
        "list_subtitle": "Turmeric or collagen mask",
    },
    "pm_retinol": {
        "label": "Retinol night",
        "short_label": "Retinol",
        "emoji": "🫧",
        "css": "pm-retinol",
        "guide_intro": "Cell turnover night. Wait for dry skin before retinol. No mask allowed.",
        "list_subtitle": "No mask allowed",
    },
    "pm_clay_night": {
        "label": "Clay mask night",
        "short_label": "Clay mask",
        "emoji": "🧖",
        "css": "pm-clay-night",
        "guide_intro": "Everything shower night. MediCube pore mask, then face mask. No acids or retinol.",
        "list_subtitle": "MediCube pore mask · face mask",
    },
    "pm_panoxyl": {
        "label": "PanOxyl night",
        "short_label": "PanOxyl",
        "emoji": "💊",
        "css": "pm-panoxyl",
        "guide_intro": "PanOxyl only. Kill deep bacteria and flatten embedded bumps. No mask allowed.",
        "list_subtitle": "No mask allowed",
    },
}

DEFAULT_SKINCARE_WEEK_PLAN: dict[str, list[str]] = {
    "pm_mark_fading": ["saturday", "monday", "thursday"],
    "pm_retinol": ["sunday", "friday"],
    "pm_clay_night": ["tuesday"],
    "pm_panoxyl": ["wednesday"],
}

ROUTINE_TYPES = {**SHOWER_ROUTINE_TYPES, **SKINCARE_ROUTINE_TYPES}

ROUTINE_HREFS = {
    "daily_shower": "/hygiene/daily-shower",
    "everything_shower": "/hygiene/everything-shower",
    "hair_care": "/hygiene/hair-care",
    "pm_mark_fading": "/hygiene/pm-mark-fading",
    "pm_retinol": "/hygiene/pm-retinol",
    "pm_clay_night": "/hygiene/pm-clay-night",
    "pm_panoxyl": "/hygiene/pm-panoxyl",
}

LEGACY_SKINCARE_WEEK_TYPES = frozenset({"night_skincare"})

SHOWER_EXCLUSIVE = frozenset({"daily_shower", "everything_shower"})
ALLOWED_OVERLAP = frozenset({"everything_shower", "hair_care"})

DEFAULT_ROUTINE_STEPS: dict[str, list[str]] = {
    "daily_shower": [
        "La Roche-Posay Lipikar AP+ Gentle Foaming Cleansing Oil",
        "PanOxyl 10% Wash",
        "Soft Services Comfort Cleanse",
        "Nécessaire The Body Serum",
        "La Roche-Posay Lipikar AP+M Triple Repair Body Cream",
    ],
    "everything_shower": [
        "La Roche-Posay Lipikar AP+ Gentle Foaming Cleansing Oil",
        "PanOxyl 10% Benzoyl Peroxide Acne Foaming Wash",
        "Soft Services Comfort Cleanse",
        "Ingrown Hair Exfoliating Scrub",
        "L'Occitane Almond Shower Oil & Razor",
        "The Ordinary Glycolic Acid 7% Exfoliating Solution",
        "Nécessaire The Body Serum",
        "La Roche-Posay Lipikar AP+M Triple Repair Body Cream",
    ],
    "hair_care": [
        "Fable & Mane MahaMane Smooth Scalp & Hair Oil",
        "The Ordinary Natural Moisturizing Factors + HA for Scalp",
        "Kérastase Spécifique Bain Divalent Balancing Shampoo",
        "Redken Frizz Dismiss Conditioner",
        "Wide-Tooth Shower Comb",
        "Microfibre towel",
        "Redken Acidic Bonding Concentrate Leave-In Treatment",
        "Kérastase Genesis Serum Fortifiant",
        "Blow-dry",
        "Kérastase Elixir Ultime Hair Oil",
    ],
}

# Numbered guide for /hygiene/daily-shower (pink + warm gold labels).
DAILY_SHOWER_GUIDE: list[dict] = [
    {
        "id": "pre_shower",
        "title": "Pre-wash",
        "steps": [
            {
                "num": 1,
                "title": "La Roche-Posay Lipikar AP+ Gentle Foaming Cleansing Oil",
                "subtitle": "Pre-wash",
                "note": "Only if sunscreen is applied throughout the body, etc.",
                "bullets": [
                    "Apply onto damp skin all over your body to break down sweat, deodorants, and surface oils before your main cleanse.",
                    "Rinse off.",
                ],
            },
        ],
    },
    {
        "id": "during_shower",
        "title": "In the shower",
        "steps": [
            {
                "num": 2,
                "title": "PanOxyl 10% Wash",
                "subtitle": "Underarms only",
                "bullets": [
                    "Massage a small amount strictly into your underarms.",
                    "Let it sit for 1 minute to completely kill odor-causing bacteria, then rinse thoroughly.",
                ],
            },
            {
                "num": 3,
                "title": "Soft Services Comfort Cleanse",
                "subtitle": "Daily body wash",
                "bullets": [
                    "Pump onto a washcloth or your hands and wash your entire body from top to bottom.",
                    "Rinse completely.",
                ],
            },
        ],
    },
    {
        "id": "post_shower",
        "title": "Post-wash",
        "steps": [
            {
                "num": 4,
                "title": "Nécessaire The Body Serum",
                "subtitle": "Post-wash hydration",
                "bullets": [
                    "Step out of the shower, gently pat your skin so it is still slightly damp.",
                    "Smooth this serum all over your body to flood it with hydration.",
                ],
            },
            {
                "num": 5,
                "title": "La Roche-Posay Lipikar AP+M Triple Repair Body Cream",
                "subtitle": "Barrier lock",
                "bullets": [
                    "Immediately follow up with a generous layer of this cream over your entire body.",
                    "Lock in the serum and protect your skin barrier all day.",
                ],
            },
        ],
    },
]

# Numbered guide for /hygiene/everything-shower (sections + expandable bullets).
EVERYTHING_SHOWER_GUIDE: list[dict] = [
    {
        "id": "pre_shower",
        "title": "Pre-wash",
        "steps": [
            {
                "num": 1,
                "title": "La Roche-Posay Lipikar AP+ Gentle Foaming Cleansing Oil",
                "subtitle": "Pre-wash",
                "bullets": [
                    "Undress completely and turn your shower on to a warm, non-scorching temperature.",
                    "Pump 2 to 3 generous squirts of the cleansing oil directly into your dry hands.",
                    "Massage the oil thoroughly over your dry or slightly damp skin, focusing heavily on your legs, arms, and torso before entering the water.",
                    "Wait 0 minutes. There is no need to wait; step straight into the shower stream to let the water hit your skin, transforming the oil into a milky lather to wash away the week's sweat and oils before rinsing completely.",
                ],
            },
        ],
    },
    {
        "id": "during_shower",
        "title": "In the shower",
        "steps": [
            {
                "num": 2,
                "title": "PanOxyl 10% Benzoyl Peroxide Acne Foaming Wash",
                "subtitle": "Underarms",
                "bullets": [
                    "Pump a dime-sized amount into your hands and massage it directly into your underarms.",
                    "Step slightly back from the direct water stream and let it sit on your skin for exactly 2 minutes to eliminate odor-causing bacteria and lighten underarm shadows.",
                ],
            },
            {
                "num": 3,
                "title": "Soft Services Comfort Cleanse",
                "subtitle": "Body wash",
                "bullets": [
                    "While your underarm treatment is sitting, pump a small amount of this gentle cleanser into your hands.",
                    "Wash only your intimate areas to protect your natural pH balance.",
                    "Step fully under the shower stream and thoroughly rinse both your underarms and intimate areas clean.",
                ],
            },
            {
                "num": 4,
                "title": "Ingrown Hair Exfoliating Scrub",
                "subtitle": "Legs",
                "bullets": [
                    "Scoop out a generous amount of the scrub.",
                    "Gently buff it over your legs to mechanically lift dead skin cells and clear the way for your razor.",
                    "Rinse the gritty scrub completely off your skin with warm water.",
                ],
            },
            {
                "num": 5,
                "title": "L'Occitane Almond Shower Oil & Razor",
                "subtitle": "Shave",
                "bullets": [
                    "Smooth a layer of the shower oil over your wet legs, letting it turn into a rich protective veil.",
                    "Take a clean, sharp razor and shave your legs directly through that dense oil layer to prevent razor bumps.",
                    "Perform a final rinse of your legs, turn off the water, step out, and towel-dry your body until damp.",
                ],
            },
        ],
    },
    {
        "id": "post_shower",
        "title": "Post-wash",
        "steps": [
            {
                "num": 6,
                "title": "The Ordinary Glycolic Acid 7% Exfoliating Solution",
                "subtitle": "Knees",
                "bullets": [
                    "Swipe over dark knees.",
                    "Wait 60 seconds to dry.",
                ],
            },
            {
                "num": 7,
                "title": "Nécessaire The Body Serum",
                "subtitle": "Body",
                "bullets": [
                    "Apply to full body.",
                    "Wait 30 seconds before step eight.",
                ],
            },
            {
                "num": 8,
                "title": "La Roche-Posay Lipikar AP+M Triple Repair Body Cream",
                "subtitle": "Body",
                "bullets": [
                    "Apply body cream over full body, including knees on top of dried glycolic and serum.",
                    "Let it absorb.",
                ],
            },
        ],
    },
]

# Numbered guide for /hygiene/hair-care (sections + expandable bullets).
HAIR_CARE_GUIDE: list[dict] = [
    {
        "id": "pre_shower",
        "title": "Pre-shower",
        "steps": [
            {
                "num": 1,
                "title": "Fable & Mane MahaMane Smooth Scalp & Hair Oil",
                "subtitle": "Scalp treatment",
                "bullets": [
                    "Part your dry hair into sections.",
                    "Take 1 to 2 droppers of this clarifying, Ayurvedic oil and massage it directly into your scalp for 2 to 3 minutes.",
                    "This breaks down hard sebum build-up so your Kérastase Bain Divalent shampoo can cleanse your roots more effectively.",
                ],
            },
            {
                "num": 2,
                "title": "The Ordinary Natural Moisturizing Factors + HA for Scalp",
                "subtitle": "Alternative scalp option",
                "bullets": [
                    "If your scalp feels dry, flaky, or irritated instead of oily, substitute the oil for a few drops of this hydrating serum.",
                    "Massage it directly onto your dry scalp.",
                ],
            },
        ],
    },
    {
        "id": "during_shower",
        "title": "During shower",
        "steps": [
            {
                "num": 3,
                "title": "Kérastase Spécifique Bain Divalent Balancing Shampoo",
                "subtitle": "Cleanse",
                "bullet_heading": "Two times cleanse",
                "bullets": [
                    "Apply about half the amount used during the first cleanse.",
                    "Massage into the scalp for 30 to 45 seconds.",
                    "Do not scrub, twist, or pile lengths on top of your head.",
                    "Rinse thoroughly.",
                    "Skip on daily washes unless your scalp is very oily or coated with dry shampoo, sweat, or styling products.",
                ],
            },
            {
                "num": 4,
                "title": "Redken Frizz Dismiss Conditioner",
                "subtitle": "Mid-lengths and ends",
                "bullets": [
                    "Squeeze excess water from the lengths.",
                    "Apply a small amount from ear level down.",
                    "Focus on tangled, frizzy, and dry sections.",
                    "Keep it off the scalp and roots.",
                ],
            },
            {
                "num": 5,
                "title": "Wide-Tooth Shower Comb",
                "subtitle": "Detangle while conditioned",
                "bullets": [
                    "Detangle while conditioner is still in your hair.",
                    "Start at the ends and work up in small sections.",
                    "Hold hair above each knot so you do not pull at the scalp.",
                    "Do not force the comb through resistance.",
                    "Leave conditioner on for 3 to 5 minutes total.",
                ],
            },
            {
                "num": 6,
                "title": "Microfibre towel",
                "subtitle": "Final rinse",
                "bullets": [
                    "Wrap lengths loosely in a microfibre towel or soft cotton T-shirt.",
                ],
            },
        ],
    },
    {
        "id": "post_shower",
        "title": "Post-shower",
        "steps": [
            {
                "num": 7,
                "title": "Redken Acidic Bonding Concentrate Leave-In Treatment",
                "subtitle": "Mid-lengths and ends",
                "bullets": [
                    "Blot with a microfibre towel until damp, not dripping.",
                    "Apply a small amount through mid-lengths and ends.",
                    "Keep it several inches off the scalp.",
                    "Comb through gently with a wide-tooth comb.",
                    "Use less than you think; too much can coat fine or grease-prone hair.",
                    "Already includes heat protection; no separate heat protectant needed.",
                ],
            },
            {
                "num": 8,
                "title": "Kérastase Genesis Serum Fortifiant",
                "subtitle": "Scalp",
                "bullets": [
                    "Part damp or dry hair into sections.",
                    "Apply directly to the scalp, especially where you see breakage-related shedding or reduced density.",
                    "Massage gently with fingertips.",
                    "Do not rinse.",
                    "Use the recommended amount section by section; do not saturate the scalp.",
                ],
            },
            {
                "num": 9,
                "title": "Blow-dry",
                "subtitle": "Roots and lengths",
                "bullet_sections": [
                    {
                        "heading": "Roots first",
                        "bullets": [
                            "Medium heat, medium airflow.",
                            "Point the nozzle downward, not in every direction.",
                            "Dry the roots fully before moving to the lengths.",
                            "Wet roots too long can look flatter and greasier.",
                        ],
                    },
                    {
                        "heading": "Smooth and dry the lengths",
                        "bullets": [
                            "Keep airflow pointing downward.",
                            "Use a brush only after most of the water is gone.",
                            "Do not pass high heat over the same section repeatedly.",
                        ],
                    },
                ],
            },
            {
                "num": 10,
                "title": "Kérastase Elixir Ultime Hair Oil",
                "subtitle": "Mid-lengths and ends only",
                "bullets": [
                    "Apply after drying, or use a very small amount on damp ends.",
                    "About half a pump for fine hair, one pump for medium-to-thick hair.",
                    "Rub between palms, then smooth over ends and outer surface.",
                    "Do not apply to scalp or roots.",
                ],
            },
        ],
    },
]

# Numbered guide for /hygiene/am-skincare (daily morning routine).
AM_SKINCARE_GUIDE: list[dict] = [
    {
        "id": "daily",
        "title": "Every day",
        "steps": [
            {
                "num": 1,
                "title": "La Roche-Posay Toleriane Hydrating Gentle Cleanser",
                "subtitle": "Face wash",
                "bullets": [
                    "Gently massage onto your face for 60 seconds.",
                    "Rinse with lukewarm water. Pat dry, leave skin slightly damp.",
                ],
            },
            {
                "num": 2,
                "title": "Anua Rice 70 Glow Milky Toner",
                "subtitle": "Toner",
                "bullets": [
                    "Press a few drops into damp skin.",
                    "Wait 30 seconds.",
                ],
            },
            {
                "num": 3,
                "title": "Anua 10+ Azelaic Acid Serum",
                "subtitle": "Serum #1",
                "bullets": [
                    "Apply evenly across face.",
                    "For embedded bumps and PIE/PIH prevention.",
                ],
            },
            {
                "num": 4,
                "title": "Centella Ampoule",
                "subtitle": "Serum #2",
                "bullets": [
                    "One full dropper over face.",
                    "Calms irritation and fresh acne marks.",
                ],
            },
            {
                "num": 5,
                "title": "Ole Henriksen Banana Bright+ Vitamin C Eye Crème",
                "subtitle": "Eye cream",
                "bullets": [
                    "Tap around orbital bone with ring finger.",
                ],
            },
            {
                "num": 6,
                "title": "La Roche-Posay SPF 50",
                "subtitle": "Sunscreen",
                "bullets": [
                    "Two finger-lengths over entire face, neck, and ears.",
                    "Do not skip.",
                ],
            },
            {
                "num": 7,
                "title": "Tatcha Lip Balm",
                "subtitle": "Lips",
                "bullets": [
                    "Thin layer on lips.",
                ],
            },
        ],
    },
]

# PM skincare guides — one page per night type.
PM_SKINCARE_GUIDES: dict[str, list[dict]] = {
    "pm_mark_fading": [
        {
            "id": "routine",
            "title": "Routine",
            "steps": [
                {
                    "num": 1,
                    "title": "Anua Oil Cleanser",
                    "subtitle": "Pre-wash",
                    "bullets": [
                        "Massage 1 to 2 pumps on dry face to dissolve SPF and sebum.",
                        "Emulsify with warm water, massage, rinse clean.",
                    ],
                },
                {
                    "num": 2,
                    "title": "Anua Heartleaf Pore Deep Cleanse",
                    "subtitle": "Face wash",
                    "bullets": [
                        "Foam on wet hands, cleanse face, rinse warm.",
                        "Pat damp.",
                    ],
                },
                {
                    "num": 3,
                    "title": "Turmeric Mask or Collagen Mask",
                    "subtitle": "Face mask",
                    "bullets": [
                        "Even layer on face after cleanse.",
                        "Rinse per product directions. Pat damp before toner.",
                    ],
                },
                {
                    "num": 4,
                    "title": "Anua Rice 70 Glow Milky Toner",
                    "subtitle": "Toner",
                    "bullets": [
                        "Press a few drops into damp skin.",
                    ],
                },
                {
                    "num": 5,
                    "title": "Centella Brightening Serum",
                    "subtitle": "Serum #1",
                    "bullets": [
                        "Pea-sized amount over face.",
                    ],
                },
                {
                    "num": 6,
                    "title": "Anua Niacinamide 10 + TXA 4 Serum",
                    "subtitle": "Serum #2",
                    "bullets": [
                        "Even layer over face, focus on acne marks.",
                        "Niacinamide + TXA block pigment for PIH and PIE.",
                    ],
                },
                {
                    "num": 7,
                    "title": "Tatcha Luminous Deep Hydration Firming Eye Serum",
                    "subtitle": "Eye serum",
                    "bullets": [
                        "Smooth around eye area.",
                    ],
                },
                {
                    "num": 8,
                    "title": "La Roche-Posay Toleriane Double Repair Face Moisturizer",
                    "subtitle": "PM moisturizer",
                    "bullets": [
                        "Generous layer on face and neck.",
                    ],
                },
                {
                    "num": 9,
                    "title": "Tatcha Lip Balm",
                    "subtitle": "Lip serum",
                    "bullets": [
                        "Thin layer on lips.",
                    ],
                },
                {
                    "num": 10,
                    "title": "Lash/Brow Serum",
                    "subtitle": "Lash & brow",
                    "bullets": [
                        "Swipe on lash lines and brows.",
                    ],
                },
            ],
        },
    ],
    "pm_retinol": [
        {
            "id": "routine",
            "title": "Routine",
            "steps": [
                {
                    "num": 1,
                    "title": "Anua Oil Cleanser",
                    "subtitle": "Pre-wash",
                    "bullets": [
                        "Massage on dry skin to dissolve SPF and oils.",
                        "Rinse with warm water.",
                    ],
                },
                {
                    "num": 2,
                    "title": "Anua Heartleaf Pore Deep Cleanse",
                    "subtitle": "Face wash",
                    "bullets": [
                        "Foam cleanse, rinse, pat damp.",
                    ],
                },
                {
                    "num": 3,
                    "title": "Anua Rice 70 Glow Milky Toner",
                    "subtitle": "Toner",
                    "bullets": [
                        "Press into skin.",
                    ],
                },
                {
                    "num": 4,
                    "title": "Centella Ampoule",
                    "subtitle": "Serum #1",
                    "bullets": [
                        "Apply one full dropper across your face for a soothing, anti-inflammatory layer.",
                        "Crucial: wait 3 to 5 minutes until skin is bone-dry to the touch.",
                        "Do not apply retinol to damp skin. It absorbs too fast, causes irritation, peeling, and fresh red marks.",
                    ],
                },
                {
                    "num": 5,
                    "title": "CeraVe Resurfacing Retinol Serum (Teal Bottle)",
                    "subtitle": "Retinol treatment · no mask allowed",
                    "bullets": [
                        "Pump one pea-sized amount onto your finger.",
                        "Dot on forehead, cheeks, and chin. Smooth evenly over face.",
                        "Keep completely off eyes, eyelids, and lips.",
                    ],
                },
                {
                    "num": 6,
                    "title": "La Roche-Posay Toleriane Double Repair Face Moisturizer",
                    "subtitle": "PM moisturizer",
                    "bullets": [
                        "Wait about 60 seconds for retinol to settle.",
                        "Smooth a generous layer over face and neck to lock in retinol and protect your barrier overnight.",
                    ],
                },
                {
                    "num": 7,
                    "title": "Tatcha Eye Serum",
                    "subtitle": "Eye serum",
                    "bullets": [
                        "Tap around eye area.",
                    ],
                },
                {
                    "num": 8,
                    "title": "Tatcha Lip Balm",
                    "subtitle": "Lip serum",
                    "bullets": [
                        "Thin layer on lips.",
                    ],
                },
                {
                    "num": 9,
                    "title": "Lash/Brow Serum",
                    "subtitle": "Lash & brow",
                    "bullets": [
                        "Swipe on lash lines and brows.",
                    ],
                },
            ],
        },
    ],
    "pm_clay_night": [
        {
            "id": "routine",
            "title": "Routine",
            "steps": [
                {
                    "num": 1,
                    "title": "Anua Oil Cleanser & Heartleaf Pore Deep Cleanse",
                    "subtitle": "Double cleanse",
                    "bullets": [
                        "Full double cleanse at sink or in shower.",
                    ],
                },
                {
                    "num": 2,
                    "title": "MediCube pore mask",
                    "subtitle": "Pore mask",
                    "bullets": [
                        "Even layer on nose, T-zone, or areas with blackheads and embedded bumps.",
                        "Wait 3 to 5 minutes. Do not leave on longer.",
                        "Rinse warm, pat damp.",
                    ],
                },
                {
                    "num": 3,
                    "title": "Turmeric Mask or MediCube Pink Mask",
                    "subtitle": "Face mask",
                    "bullets": [
                        "Even layer on breakout zones and embedded bump areas.",
                        "Wait 10 minutes, rinse warm.",
                    ],
                },
                {
                    "num": 4,
                    "title": "Anua Rice 70 Glow Milky Toner",
                    "subtitle": "Toner",
                    "bullets": [
                        "Press into skin after masking.",
                    ],
                },
                {
                    "num": 5,
                    "title": "Centella Ampoule",
                    "subtitle": "Serum #1",
                    "bullets": [
                        "One full dropper over face.",
                        "No active acids or retinol tonight.",
                    ],
                },
                {
                    "num": 6,
                    "title": "La Roche-Posay Toleriane Double Repair Face Moisturizer",
                    "subtitle": "PM moisturizer",
                    "bullets": [
                        "Thick layer on face and neck.",
                    ],
                },
                {
                    "num": 7,
                    "title": "Tatcha Eye Serum",
                    "subtitle": "Eye serum",
                    "bullets": [
                        "Tap around eye area.",
                    ],
                },
                {
                    "num": 8,
                    "title": "Tatcha Lip Balm",
                    "subtitle": "Lip serum",
                    "bullets": [
                        "Thin layer on lips.",
                    ],
                },
                {
                    "num": 9,
                    "title": "Lash/Brow Serum",
                    "subtitle": "Lash & brow",
                    "bullets": [
                        "Swipe on lash lines and brows.",
                    ],
                },
            ],
        },
    ],
    "pm_panoxyl": [
        {
            "id": "routine",
            "title": "Routine",
            "steps": [
                {
                    "num": 1,
                    "title": "Anua Oil Cleanser",
                    "subtitle": "Pre-wash",
                    "bullets": [
                        "Massage on dry skin to dissolve sunscreen and makeup.",
                        "Rinse clean.",
                    ],
                },
                {
                    "num": 2,
                    "title": "PanOxyl 10% Benzoyl Peroxide Acne Foaming Wash",
                    "subtitle": "Face wash & treatment · no mask allowed",
                    "bullets": [
                        "Dime-sized amount on damp face. Avoid eyes.",
                        "Wait 1 to 2 minutes, rinse lukewarm, pat dry.",
                    ],
                },
                {
                    "num": 3,
                    "title": "Anua Rice 70 Glow Milky Toner",
                    "subtitle": "Toner",
                    "bullets": [
                        "Press into skin after the active wash.",
                    ],
                },
                {
                    "num": 4,
                    "title": "Centella Ampoule",
                    "subtitle": "Serum #1",
                    "bullets": [
                        "One full dropper over face.",
                        "No niacinamide/TXA or retinol tonight. PanOxyl only.",
                    ],
                },
                {
                    "num": 5,
                    "title": "La Roche-Posay Toleriane Double Repair Face Moisturizer",
                    "subtitle": "PM moisturizer",
                    "bullets": [
                        "Generous layer on face and neck.",
                    ],
                },
                {
                    "num": 6,
                    "title": "Tatcha Eye Serum",
                    "subtitle": "Eye serum",
                    "bullets": [
                        "Tap around eye area.",
                    ],
                },
                {
                    "num": 7,
                    "title": "Tatcha Lip Balm",
                    "subtitle": "Lip serum",
                    "bullets": [
                        "Thin layer on lips.",
                    ],
                },
                {
                    "num": 8,
                    "title": "Lash/Brow Serum",
                    "subtitle": "Lash & brow",
                    "bullets": [
                        "Swipe on lash lines and brows.",
                    ],
                },
            ],
        },
    ],
}

LEGACY_HAIR_CARE_NAME_SETS: tuple[frozenset[str], ...] = (
    frozenset(
        s.lower()
        for s in (
            "Shampoo",
            "Conditioner",
            "Hair mask or treatment",
            "Leave-in / style",
        )
    ),
    frozenset(
        s.lower()
        for s in (
            "Kérastase Spécifique Bain Divalent Balancing Shampoo",
            "Redken Frizz Dismiss Conditioner",
            "Wide-Tooth Shower Comb",
            "Final Rinse",
        )
    ),
    frozenset(
        s.lower()
        for s in (
            "Kérastase Spécifique Bain Divalent Balancing Shampoo",
            "Redken Frizz Dismiss Conditioner",
            "Wide-Tooth Shower Comb",
            "Microfibre towel",
        )
    ),
    frozenset(
        s.lower()
        for s in (
            "Kérastase Spécifique Bain Divalent Balancing Shampoo",
            "Redken Frizz Dismiss Conditioner",
            "Wide-Tooth Shower Comb",
            "Microfibre towel",
            "Redken Acidic Bonding Concentrate Leave-In Treatment",
            "Kérastase Genesis Serum Fortifiant",
            "Blow-dry the roots first",
            "Smooth and dry the lengths",
            "Kérastase Elixir Ultime Hair Oil",
        )
    ),
)

MORNING_ROUTINE: list[str] = [
    "Wake up at 5:45 a.m.",
    "No phone at all for the 1st hour",
    "Drink 2 glasses of water",
    "Oral hygiene + wear sunscreen",
    "Wear your gym clothes",
    "Go to gym/run",
    "Drink water",
    "Take a short cold shower to wake your body up",
    "Do skincare + makeup",
    "Be dressed well for the day",
    "Eat Breakfast while reading at least 10 pages",
    "Drink water with Vitamin D and Ashwagandha",
    "Cold email or shoot LinkedIn messages to at least 20 people",
    "Deep work on your startup before class starts!",
    "Start your day",
    "No social media until noon",
]

EVENING_SKINCARE: list[str] = [
    "Remove makeup / PM cleanse",
    "Toner or essence",
    "Serum or treatment",
    "Moisturizer",
    "Lip balm",
]

DEFAULT_SCHEDULE: list[dict] = [
    {
        "id": "face_mask",
        "title": "Face mask",
        "emoji": "🎭",
        "note": "MediCube pore mask — pore care",
        "recurrence": "weekly",
        "weekday": 6,
        "enabled": True,
    },
]

PRODUCT_LEVELS = ("ok", "low", "out")
PRODUCT_LANES = ("using", "researching", "buy_next")
PRODUCT_CATEGORIES = (
    "spf",
    "cleanser",
    "serum",
    "mask",
    "body",
    "hair",
    "other",
)
SCHEDULE_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _ensure_schema(conn) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(derm_catalog)").fetchall()}
    if "routine_group" not in cols:
        conn.execute("ALTER TABLE derm_catalog ADD COLUMN routine_group TEXT DEFAULT 'morning'")
    if "sort_order" not in cols:
        conn.execute("ALTER TABLE derm_catalog ADD COLUMN sort_order INTEGER DEFAULT 0")


OLD_DERM_NAMES = {
    "am face wash",
    "am moisturizer",
    "am sunscreen (spf)",
    "pm face wash",
    "pm moisturizer",
    "shower / body wash",
}

OLD_EVERYTHING_SHOWER_NAMES = {
    "full body wash / scrub",
    "shampoo",
    "conditioner",
    "deep cleanse / mask",
    "body lotion",
    "skincare after shower",
}

LEGACY_EVERYTHING_SHOWER_NAME_SETS: tuple[frozenset[str], ...] = (
    frozenset(
        s.lower()
        for s in (
            "Lipikar AP+ Cleansing Oil on dry torso, arms, and legs (dry hands, massage in)",
            "Step into warm water — lather the oil, massage, rinse completely",
            "PanOxyl 10% under arms — leave 2 minutes. Soft Services Comfort Cleanse on intimate areas while waiting",
            "Rinse underarms and intimate areas fully",
            "Body scrub on legs — exfoliate, rinse off completely",
            "Ingrown Hair Exfoliating Scrub on legs — exfoliate, rinse off completely",
            "L'Occitane Almond Shower Oil on wet legs — shave, rinse, turn off shower and step out",
            "Towel dry — The Ordinary Glycolic Acid 7% on dark knees, let sit 60 seconds",
        )
    ),
    frozenset(
        s.lower()
        for s in (
            "La Roche-Posay Lipikar AP+ Cleansing Oil on dry torso, arms, and legs (dry hands, massage in)",
            "Step into warm water — lather the oil, massage, rinse completely",
            "PanOxyl Acne Foaming Wash 10% under arms — leave 2 minutes. Soft Services Comfort Cleanse on intimate areas while waiting",
            "Rinse underarms and intimate areas fully",
            "Ingrown Hair Exfoliating Scrub on legs — exfoliate, rinse off completely",
            "L'Occitane Almond Shower Oil on wet legs — shave, rinse, turn off shower and step out",
            "Towel dry — The Ordinary Glycolic Acid 7% Toning Solution on dark knees, let sit 60 seconds",
        )
    ),
    frozenset(
        s.lower()
        for s in (
            "La Roche-Posay Lipikar AP+ Cleansing Oil",
            "PanOxyl Acne Foaming Wash 10%",
            "Soft Services Comfort Cleanse",
            "Rinse",
            "Ingrown Hair Exfoliating Scrub",
            "L'Occitane Almond Shower Oil",
            "The Ordinary Glycolic Acid 7% Toning Solution",
        )
    ),
    frozenset(
        s.lower()
        for s in (
            "La Roche-Posay Lipikar AP+ Gentle Foaming Cleansing Oil",
            "PanOxyl 10% Benzoyl Peroxide Acne Foaming Wash",
            "Soft Services Comfort Cleanse",
            "Ingrown Hair Exfoliating Scrub",
            "L'Occitane Almond Shower Oil & Razor",
            "The Ordinary Glycolic Acid 7% Exfoliating Solution",
            "La Roche-Posay Lipikar AP+M Triple Repair Body Cream",
        )
    ),
    frozenset(
        s.lower()
        for s in (
            "La Roche-Posay Lipikar AP+ Gentle Foaming Cleansing Oil",
            "PanOxyl 10% Benzoyl Peroxide Acne Foaming Wash",
            "Soft Services Comfort Cleanse",
            "Ingrown Hair Exfoliating Scrub",
            "L'Occitane Almond Shower Oil & Razor",
            "The Ordinary Glycolic Acid 7% Exfoliating Solution",
            "Nécessaire The Body Serum",
            "La Roche-Posay Lipikar AP+M Triple Repair Body Cream",
        )
    ),
)


def _seed_group(conn, routine_group: str, steps: list[str]) -> None:
    label = ROUTINE_LABELS.get(routine_group, routine_group.title())
    for i, name in enumerate(steps):
        conn.execute(
            """INSERT INTO derm_catalog (name, time_of_day, schedule, routine_group, sort_order)
               VALUES (?, ?, ?, ?, ?)""",
            (name, label, "Daily", routine_group, i),
        )


def _ensure_group(conn, routine_group: str, steps: list[str]) -> None:
    rows = conn.execute(
        """SELECT id, name FROM derm_catalog WHERE routine_group = ?
           ORDER BY sort_order, id""",
        (routine_group,),
    ).fetchall()
    if not rows:
        _seed_group(conn, routine_group, steps)
        return
    if routine_group == "morning":
        names = {r["name"].lower() for r in rows}
        if names and names.issubset(OLD_DERM_NAMES):
            conn.execute("DELETE FROM derm_catalog WHERE routine_group = 'morning'")
            conn.execute("DELETE FROM derm_logs")
            _seed_group(conn, routine_group, steps)
        return
    if routine_group == "everything_shower":
        names = {r["name"].lower() for r in rows}
        expected = {s.lower() for s in steps}
        if names == expected:
            return
        if names and (
            names.issubset(OLD_EVERYTHING_SHOWER_NAMES)
            or names in LEGACY_EVERYTHING_SHOWER_NAME_SETS
        ):
            item_ids = [r["id"] for r in rows]
            if item_ids:
                placeholders = ",".join("?" * len(item_ids))
                conn.execute(
                    f"DELETE FROM derm_logs WHERE item_id IN ({placeholders})",
                    item_ids,
                )
            conn.execute("DELETE FROM derm_catalog WHERE routine_group = 'everything_shower'")
            _seed_group(conn, routine_group, steps)
        return
    if routine_group == "hair_care":
        names = {r["name"].lower() for r in rows}
        expected = {s.lower() for s in steps}
        if names == expected:
            return
        if names in LEGACY_HAIR_CARE_NAME_SETS or names != expected:
            item_ids = [r["id"] for r in rows]
            if item_ids:
                placeholders = ",".join("?" * len(item_ids))
                conn.execute(
                    f"DELETE FROM derm_logs WHERE item_id IN ({placeholders})",
                    item_ids,
                )
            conn.execute("DELETE FROM derm_catalog WHERE routine_group = 'hair_care'")
            _seed_group(conn, routine_group, steps)


def ensure_catalog() -> None:
    with get_conn() as conn:
        _ensure_schema(conn)
        _ensure_group(conn, "morning", MORNING_ROUTINE)
        _ensure_group(conn, "evening", EVENING_SKINCARE)
        for group, steps in DEFAULT_ROUTINE_STEPS.items():
            _ensure_group(conn, group, steps)
        rows = conn.execute(
            """SELECT id FROM derm_catalog
               WHERE routine_group IS NULL OR routine_group = ''""",
        ).fetchall()
        for r in rows:
            conn.execute(
                "UPDATE derm_catalog SET routine_group = 'morning' WHERE id = ?",
                (r["id"],),
            )


def _read_json(path, default):
    HYGIENE_DIR.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps(default, indent=2))
        return default
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return default


def _write_json(path, data) -> None:
    HYGIENE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))


def ensure_schedule() -> list[dict]:
    data = _read_json(SCHEDULE_FILE, {"events": DEFAULT_SCHEDULE})
    events = data.get("events") or []
    if not events:
        events = list(DEFAULT_SCHEDULE)
        _write_json(SCHEDULE_FILE, {"events": events})
    return events


def _normalize_product(raw: dict) -> dict:
    lane = (raw.get("lane") or "using").lower()
    if lane not in PRODUCT_LANES:
        lane = "using"
    category = (raw.get("category") or "other").lower()
    if category not in PRODUCT_CATEGORIES:
        category = "other"
    level = (raw.get("level") or "ok").lower()
    if level not in PRODUCT_LEVELS:
        level = "ok"
    return {
        **raw,
        "lane": lane,
        "category": category,
        "level": level,
        "note": (raw.get("note") or "").strip(),
        "shop_added": bool(raw.get("shop_added")),
    }


def ensure_products() -> list[dict]:
    data = _read_json(PRODUCTS_FILE, {"products": []})
    products = data.get("products") or []
    changed = False
    normalized = []
    for p in products:
        item = _normalize_product(p)
        if item != p:
            changed = True
        normalized.append(item)
    if changed:
        _write_json(PRODUCTS_FILE, {"products": normalized})
    return normalized


def _schedule_log() -> dict:
    return _read_json(SCHEDULE_LOG_FILE, {})


def _save_schedule_log(log: dict) -> None:
    _write_json(SCHEDULE_LOG_FILE, log)


def list_schedule() -> list[dict]:
    return ensure_schedule()


def list_products(lane: str | None = None) -> list[dict]:
    products = ensure_products()
    if lane:
        lane = lane.lower()
        products = [p for p in products if p.get("lane", "using") == lane]
    return products


def _load_products_raw() -> list[dict]:
    data = _read_json(PRODUCTS_FILE, {"products": []})
    return [_normalize_product(p) for p in (data.get("products") or [])]


def _save_products_raw(products: list[dict]) -> None:
    _write_json(PRODUCTS_FILE, {"products": products})


def week_calendar(day: str | None = None) -> dict:
    day = day or today()
    anchor = date.fromisoformat(day)
    start = _week_start(anchor)
    schedule = list_schedule()
    log = _schedule_log()
    days = []
    due_today = 0
    done_today = 0
    for i in range(7):
        cur = start + timedelta(days=i)
        ds = cur.isoformat()
        is_today = ds == day
        events = []
        for ev in schedule:
            if not ev.get("enabled", True):
                continue
            due = False
            if ev.get("recurrence") == "weekly" and cur.weekday() == int(ev.get("weekday", 6)):
                due = True
            elif ev.get("recurrence") == "daily":
                due = True
            if not due:
                continue
            key = f"{ds}:{ev['id']}"
            done = bool(log.get(key, {}).get("done"))
            if is_today:
                due_today += 1
                if done:
                    done_today += 1
            events.append(
                {
                    "id": ev["id"],
                    "title": ev.get("title") or "Skincare",
                    "emoji": ev.get("emoji") or "🧴",
                    "note": ev.get("note") or "",
                    "day": ds,
                    "done": done,
                    "is_today": is_today,
                    "is_past": cur < anchor,
                }
            )
        days.append(
            {
                "date": ds,
                "weekday": WEEKDAY_LABELS[i],
                "label": str(cur.day),
                "is_today": is_today,
                "events": events,
            }
        )
    return {
        "week_start": start.isoformat(),
        "week_label": f"Week of {start.strftime('%b')} {start.day}",
        "days": days,
        "due_today": due_today,
        "done_today": done_today,
        "today_summary": (
            f"{done_today} of {due_today} skincare tasks done today"
            if due_today
            else "No calendar tasks today"
        ),
    }


def _validate_schedule_event(event: dict, *, require_id: bool = False) -> dict:
    title = (event.get("title") or "").strip()
    if not title:
        raise ValueError("Title required")
    recurrence = (event.get("recurrence") or "weekly").lower()
    if recurrence not in ("weekly", "daily"):
        raise ValueError("Recurrence must be weekly or daily")
    weekday = int(event.get("weekday", 6))
    if weekday < 0 or weekday > 6:
        raise ValueError("Weekday must be 0–6 (Mon–Sun)")
    event_id = (event.get("id") or "").strip()
    if require_id and not event_id:
        raise ValueError("Event id required")
    if not event_id:
        event_id = uuid.uuid4().hex[:8]
    return {
        "id": event_id,
        "title": title,
        "emoji": (event.get("emoji") or "🧴").strip() or "🧴",
        "note": (event.get("note") or "").strip(),
        "recurrence": recurrence,
        "weekday": weekday,
        "enabled": bool(event.get("enabled", True)),
    }


def add_schedule_event(event: dict) -> list[dict]:
    payload = _validate_schedule_event(event)
    events = ensure_schedule()
    if any(ev.get("id") == payload["id"] for ev in events):
        raise ValueError("Event id already exists")
    events.append(payload)
    _write_json(SCHEDULE_FILE, {"events": events})
    return list_schedule()


def update_schedule_event(event: dict) -> list[dict]:
    payload = _validate_schedule_event(event, require_id=True)
    events = ensure_schedule()
    found = False
    for i, ev in enumerate(events):
        if ev.get("id") == payload["id"]:
            events[i] = payload
            found = True
            break
    if not found:
        raise ValueError("Unknown schedule event")
    _write_json(SCHEDULE_FILE, {"events": events})
    return list_schedule()


def delete_schedule_event(event_id: str) -> list[dict]:
    event_id = (event_id or "").strip()
    if not event_id:
        raise ValueError("Event id required")
    events = ensure_schedule()
    new_events = [ev for ev in events if ev.get("id") != event_id]
    if len(new_events) == len(events):
        raise ValueError("Unknown schedule event")
    _write_json(SCHEDULE_FILE, {"events": new_events})
    log = _schedule_log()
    suffix = f":{event_id}"
    for key in list(log.keys()):
        if key.endswith(suffix):
            del log[key]
    _save_schedule_log(log)
    return list_schedule()


def set_schedule_done(event_id: str, day: str, done: bool) -> dict:
    day = day or today()
    ensure_schedule()
    log = _schedule_log()
    key = f"{day}:{event_id}"
    if done:
        log[key] = {"done": True, "logged_at": datetime.now().isoformat()}
    elif key in log:
        del log[key]
    _save_schedule_log(log)
    return week_calendar(day)


def add_product(
    name: str,
    category: str = "other",
    lane: str = "using",
    note: str = "",
) -> list[dict]:
    name = (name or "").strip()
    if not name:
        raise ValueError("Product name required")
    lane = (lane or "using").lower()
    if lane not in PRODUCT_LANES:
        raise ValueError("Lane must be using, researching, or buy_next")
    products = _load_products_raw()
    products.append(
        _normalize_product(
            {
                "id": uuid.uuid4().hex[:8],
                "name": name,
                "category": category,
                "lane": lane,
                "level": "ok",
                "note": note,
                "shop_added": False,
            }
        )
    )
    _save_products_raw(products)
    return list_products()


def set_product_lane(product_id: str, lane: str) -> list[dict]:
    lane = (lane or "using").lower()
    if lane not in PRODUCT_LANES:
        raise ValueError("Lane must be using, researching, or buy_next")
    products = _load_products_raw()
    found = False
    for p in products:
        if p.get("id") == product_id:
            p["lane"] = lane
            if lane != "using":
                p["level"] = "ok"
            found = True
            break
    if not found:
        raise ValueError("Unknown product")
    _save_products_raw(products)
    return list_products()


def set_product_note(product_id: str, note: str) -> list[dict]:
    products = _load_products_raw()
    found = False
    for p in products:
        if p.get("id") == product_id:
            p["note"] = (note or "").strip()
            found = True
            break
    if not found:
        raise ValueError("Unknown product")
    _save_products_raw(products)
    return list_products()


def add_product_to_shop(product_id: str) -> list[dict]:
    from . import grocery

    products = _load_products_raw()
    target = None
    for p in products:
        if p.get("id") == product_id:
            target = p
            break
    if not target:
        raise ValueError("Unknown product")
    if target.get("lane") != "buy_next":
        raise ValueError("Only buy-next items can be added to Shop")
    grocery.add_item(
        target["name"],
        category=target.get("category") or "other",
        added_by="hygiene",
        reason=(target.get("note") or "").strip(),
    )
    target["shop_added"] = True
    _save_products_raw(products)
    return list_products()


def set_product_level(product_id: str, level: str) -> list[dict]:
    level = (level or "ok").lower()
    if level not in PRODUCT_LEVELS:
        raise ValueError("Level must be ok, low, or out")
    products = _load_products_raw()
    found = False
    for p in products:
        if p.get("id") == product_id:
            if p.get("lane", "using") != "using":
                raise ValueError("Stock levels only apply to products in use")
            p["level"] = level
            found = True
            break
    if not found:
        raise ValueError("Unknown product")
    _save_products_raw(products)
    return list_products()


def delete_product(product_id: str) -> list[dict]:
    products = [p for p in _load_products_raw() if p.get("id") != product_id]
    _save_products_raw(products)
    return list_products()


def products_summary() -> str:
    products = list_products()
    if not products:
        return "No products tracked yet"
    using = [p for p in products if p.get("lane", "using") == "using"]
    researching = [p for p in products if p.get("lane") == "researching"]
    buy_next = [p for p in products if p.get("lane") == "buy_next"]
    parts: list[str] = []
    low = sum(1 for p in using if p["level"] == "low")
    out = sum(1 for p in using if p["level"] == "out")
    if out:
        parts.append(f"{out} ran out")
    if low:
        parts.append(f"{low} low")
    if buy_next:
        parts.append(f"{len(buy_next)} to buy")
    if researching:
        parts.append(f"{len(researching)} researching")
    if parts:
        return " · ".join(parts)
    if using:
        return f"{len(using)} in use — all stocked"
    return "No products tracked yet"


def list_catalog(routine_group: str | None = None) -> list[dict]:
    ensure_catalog()
    with get_conn() as conn:
        if routine_group:
            rows = conn.execute(
                """SELECT id, name, time_of_day, schedule, routine_group, sort_order
                   FROM derm_catalog WHERE routine_group = ?
                   ORDER BY sort_order, id""",
                (routine_group,),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT id, name, time_of_day, schedule, routine_group, sort_order
                   FROM derm_catalog ORDER BY routine_group, sort_order, id"""
            ).fetchall()
    return [dict(r) for r in rows]


def _sync_log(day: str, item_id: int, name: str, done: bool):
    HYGIENE_DIR.mkdir(parents=True, exist_ok=True)
    path = HYGIENE_DIR / f"{day}_{item_id}.json"
    if done:
        path.write_text(
            json.dumps(
                {
                    "day": day,
                    "item_id": item_id,
                    "name": name,
                    "done": True,
                    "logged_at": datetime.now().isoformat(),
                },
                indent=2,
            )
        )
    elif path.exists():
        path.unlink()


def set_done(item_id: int, done: bool, day: str | None = None) -> dict:
    day = day or today()
    ensure_catalog()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, name, routine_group FROM derm_catalog WHERE id = ?",
            (item_id,),
        ).fetchone()
        if not row:
            raise ValueError("Unknown hygiene item")
        group = row["routine_group"] or "morning"
        conn.execute(
            "DELETE FROM derm_logs WHERE day = ? AND item_id = ?",
            (day, item_id),
        )
        if done:
            conn.execute(
                """INSERT INTO derm_logs (day, item_id, name, done, logged_at)
                   VALUES (?, ?, ?, 1, ?)""",
                (day, item_id, row["name"], datetime.now().isoformat()),
            )
        _sync_log(day, item_id, row["name"], done)
    return group_status(group, day)


def add_item(text: str, routine_group: str = "morning") -> dict:
    text = (text or "").strip()
    if not text:
        raise ValueError("Step text required")
    ensure_catalog()
    with get_conn() as conn:
        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) AS m FROM derm_catalog WHERE routine_group = ?",
            (routine_group,),
        ).fetchone()["m"]
        conn.execute(
            """INSERT INTO derm_catalog (name, time_of_day, schedule, routine_group, sort_order)
               VALUES (?, ?, ?, ?, ?)""",
            (text, ROUTINE_LABELS.get(routine_group, routine_group), "Daily", routine_group, int(max_order) + 1),
        )
    return group_status(routine_group)


def update_item(item_id: int, text: str) -> dict:
    text = (text or "").strip()
    if not text:
        raise ValueError("Step text required")
    ensure_catalog()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT routine_group FROM derm_catalog WHERE id = ?",
            (item_id,),
        ).fetchone()
        if not row:
            raise ValueError("Unknown hygiene item")
        conn.execute(
            "UPDATE derm_catalog SET name = ? WHERE id = ?",
            (text, item_id),
        )
        group = row["routine_group"] or "morning"
    return group_status(group)


def delete_item(item_id: int) -> dict:
    ensure_catalog()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT routine_group FROM derm_catalog WHERE id = ?",
            (item_id,),
        ).fetchone()
        if not row:
            raise ValueError("Unknown hygiene item")
        group = row["routine_group"] or "morning"
        conn.execute("DELETE FROM derm_logs WHERE item_id = ?", (item_id,))
        conn.execute("DELETE FROM derm_catalog WHERE id = ?", (item_id,))
    return group_status(group)


def log_all_group(routine_group: str = "morning", day: str | None = None) -> dict:
    day = day or today()
    for item in list_catalog(routine_group):
        set_done(item["id"], True, day)
    return group_status(routine_group, day)


def group_status(routine_group: str, day: str | None = None) -> dict:
    day = day or today()
    ensure_catalog()
    items = []
    done_count = 0
    catalog = list_catalog(routine_group)
    with get_conn() as conn:
        for item in catalog:
            log = conn.execute(
                "SELECT done FROM derm_logs WHERE day = ? AND item_id = ?",
                (day, item["id"]),
            ).fetchone()
            item_done = bool(log and log["done"])
            if item_done:
                done_count += 1
            items.append({**item, "done": item_done})
    total = len(items)
    return {
        "routine_group": routine_group,
        "title": ROUTINE_LABELS.get(routine_group, routine_group.title()),
        "day": day,
        "items": items,
        "done_count": done_count,
        "total": total,
        "summary": f"{done_count} of {total} done today" if total else "No steps yet",
        "all_done": total > 0 and done_count == total,
    }


def current_week_key(d: date | None = None) -> str:
    return sleep_week_key(d or date.today())


def today_day_key() -> str:
    return WEEKDAY_KEYS[date.today().weekday()]


def _load_week_plans() -> dict:
    return _read_json(WEEK_PLAN_FILE, {})


def _save_week_plans(data: dict) -> None:
    if len(data) > 20:
        for k in sorted(data.keys())[:-20]:
            data.pop(k, None)
    _write_json(WEEK_PLAN_FILE, data)


def _normalize_week_plan(raw: dict) -> dict[str, list[str]]:
    empty = {t: [] for t in ROUTINE_TYPES}
    if not raw:
        return empty
    sample_key = next(iter(raw.keys()), "")
    if str(sample_key).strip().lower() in WEEKDAY_KEYS:
        out = {t: [] for t in ROUTINE_TYPES}
        for dk, rt in raw.items():
            key = str(dk).strip().lower()
            kind = str(rt).strip().lower()
            if key in WEEKDAY_KEYS and kind in ROUTINE_TYPES and key not in out[kind]:
                out[kind].append(key)
        return out
    out = {t: [] for t in ROUTINE_TYPES}
    for rtype, days in raw.items():
        kind = str(rtype).strip().lower()
        if kind in LEGACY_SKINCARE_WEEK_TYPES or kind not in ROUTINE_TYPES:
            continue
        items = days if isinstance(days, list) else [days]
        for dk in items:
            key = str(dk).strip().lower()
            if key in WEEKDAY_KEYS and key not in out[kind]:
                out[kind].append(key)
    return out


def _raw_week_entry(week: str | None = None) -> dict:
    week = week or current_week_key()
    return dict(_load_week_plans().get(week) or {})


def _week_has_explicit_skincare(raw: dict) -> bool:
    return any(k in raw for k in SKINCARE_ROUTINE_TYPES)


def _apply_skincare_defaults(plan: dict[str, list[str]], raw: dict) -> dict[str, list[str]]:
    if _week_has_explicit_skincare(raw):
        return plan
    merged = {t: list(days) for t, days in plan.items()}
    for rtype, days in DEFAULT_SKINCARE_WEEK_PLAN.items():
        merged[rtype] = list(days)
    return merged


def get_week_plan(week: str | None = None) -> dict[str, list[str]]:
    week = week or current_week_key()
    raw = _raw_week_entry(week)
    plan = _normalize_week_plan(raw)
    return _apply_skincare_defaults(plan, raw)


def get_day_routines(day_key: str, week: str | None = None) -> list[str]:
    day_key = (day_key or "").strip().lower()
    plan = get_week_plan(week)
    return [rtype for rtype, days in plan.items() if day_key in days]


def get_day_routine(day_key: str, week: str | None = None) -> str | None:
    routines = get_day_routines(day_key, week)
    return routines[0] if routines else None


def day_routines_valid(on_day: list[str]) -> bool:
    shower = [str(t).strip().lower() for t in on_day if t in SHOWER_ROUTINE_TYPES]
    skincare = [str(t).strip().lower() for t in on_day if t in SKINCARE_ROUTINE_TYPES]
    if len(skincare) > 1:
        return False
    if len(shower) > 2:
        return False
    if len(shower) == 2:
        kinds = set(shower)
        if kinds == ALLOWED_OVERLAP:
            return True
        if SHOWER_EXCLUSIVE.issubset(kinds):
            return False
        return False
    return True


def routine_conflict_message(day_label: str, on_day: list[str], new_type: str) -> str | None:
    combined = list({str(t).strip().lower() for t in on_day if t in ROUTINE_TYPES} | {new_type})
    if day_routines_valid(combined):
        return None
    if SHOWER_EXCLUSIVE.issubset(combined):
        return f"{day_label} — pick daily shower or everything shower, not both."
    return f"{day_label} — only everything shower + hair care can share a day."


def routines_can_coexist(existing: list[str], new_type: str) -> bool:
    if new_type in existing:
        return True
    return day_routines_valid(existing + [new_type])


def hygiene_href_for_routine(routine_type: str | None) -> str:
    if routine_type and routine_type in ROUTINE_HREFS:
        return ROUTINE_HREFS[routine_type]
    return "/hygiene"


def day_routine_display(
    day_key: str,
    week: str | None = None,
    allowed_types: frozenset[str] | None = None,
) -> dict:
    routines = get_day_routines(day_key, week)
    if allowed_types is not None:
        routines = [rt for rt in routines if rt in allowed_types]
    if not routines:
        return {
            "routine_types": [],
            "routine_type": None,
            "label": "",
            "emoji": "",
            "css": "",
            "href": "/hygiene",
        }
    labels = []
    emojis = []
    css_priority = list(SHOWER_ROUTINE_TYPES) + list(SKINCARE_ROUTINE_TYPES)
    css = ""
    for key in css_priority:
        if key in routines:
            css = ROUTINE_TYPES[key]["css"]
            break
    for rt in routines:
        meta = ROUTINE_TYPES[rt]
        labels.append(meta.get("short_label") or meta["label"])
        emojis.append(meta["emoji"])
    href = hygiene_href_for_routine(routines[0]) if len(routines) == 1 else "/hygiene"
    return {
        "routine_types": routines,
        "routine_type": routines[0],
        "label": " + ".join(labels),
        "emoji": "".join(emojis),
        "css": css,
        "href": href,
    }


def validate_week_plan(plan: dict[str, list[str]], ordered_days: list[str] | None = None) -> list[dict]:
    ordered = ordered_days or WEEKDAY_KEYS
    violations: list[dict] = []
    plan = _normalize_week_plan(plan)
    for rtype, meta in ROUTINE_TYPES.items():
        max_days = meta.get("max_days")
        if not max_days:
            continue
        count = len(plan.get(rtype) or [])
        if count > max_days:
            violations.append(
                {
                    "level": "block",
                    "code": f"{rtype}_max_days",
                    "message": (
                        f"{meta['emoji']} {meta['label']} is {max_days}× this week max — "
                        f"unpick one first."
                    ),
                }
            )
    for dk in ordered:
        on_day = [rtype for rtype, days in plan.items() if dk in (days or [])]
        skincare = [t for t in on_day if t in SKINCARE_ROUTINE_TYPES]
        if len(skincare) > 1:
            label = dk.capitalize()
            violations.append(
                {
                    "level": "block",
                    "code": "pm_overlap",
                    "message": f"{label} — pick one PM skincare night only.",
                }
            )
            continue
        if len(on_day) <= 1:
            continue
        if day_routines_valid(on_day):
            continue
        label = dk.capitalize()
        if SHOWER_EXCLUSIVE.issubset(on_day):
            msg = f"{label} — pick daily shower or everything shower, not both."
        else:
            msg = f"{label} — only everything shower + hair care can share a day."
        violations.append({"level": "block", "code": "overlap_conflict", "message": msg})
    return violations


def save_week_plan(
    assignments: dict[str, list[str]],
    week: str | None = None,
    *,
    category: str | None = None,
) -> dict:
    week = week or current_week_key()
    clean = _normalize_week_plan(assignments or {})
    anchor = date.fromisoformat(week) if len(week) == 10 else date.today()
    strip = week_strip(anchor)
    ordered = [c["day_key"] for c in strip]
    violations = validate_week_plan(clean, ordered)
    if any(v["level"] == "block" for v in violations):
        return {"ok": False, "week": week, "plan": clean, "violations": violations}

    data = _load_week_plans()
    stored = dict(data.get(week) or {})

    if category == "shower":
        for rtype in SHOWER_ROUTINE_TYPES:
            days = clean.get(rtype) or []
            if days:
                stored[rtype] = days
            else:
                stored.pop(rtype, None)
    elif category == "skincare":
        for rtype in SKINCARE_ROUTINE_TYPES:
            stored[rtype] = clean.get(rtype) or []
    else:
        stored = {
            rtype: clean[rtype]
            for rtype in ROUTINE_TYPES
            if clean.get(rtype)
        }

    if not stored:
        data.pop(week, None)
    else:
        data[week] = stored
    _save_week_plans(data)
    effective = get_week_plan(week)
    return {"ok": True, "week": week, "plan": effective, "violations": violations}


def week_plan_from_form(
    form_lists: dict[str, list[str]],
    week: str | None = None,
    category: str | None = None,
) -> dict:
    plan = _normalize_week_plan(get_week_plan(week))
    if category == "shower":
        update_types = SHOWER_ROUTINE_TYPES
    elif category == "skincare":
        update_types = SKINCARE_ROUTINE_TYPES
    else:
        update_types = ROUTINE_TYPES
        plan = {t: [] for t in ROUTINE_TYPES}

    if category:
        for rtype in update_types:
            plan[rtype] = []

    for rtype in update_types:
        for dk in form_lists.get(rtype, []) or []:
            key = str(dk).strip().lower()
            if key in WEEKDAY_KEYS and key not in plan[rtype]:
                plan[rtype].append(key)
    return save_week_plan(plan, week, category=category)


def week_plan_summary(week: str | None = None) -> str:
    plan = get_week_plan(week)
    if not any(plan.get(t) for t in ROUTINE_TYPES):
        return "No hygiene routines assigned this week yet."
    strip = week_strip()
    ordered = {c["day_key"]: c["full"] for c in strip}
    lines = []
    for cell in strip:
        dk = cell["day_key"]
        routines = [t for t, days in plan.items() if dk in (days or [])]
        if not routines:
            continue
        parts = [f"{ROUTINE_TYPES[rt]['emoji']} {ROUTINE_TYPES[rt]['label']}" for rt in routines]
        lines.append(f"  {ordered.get(dk, dk)}: {' + '.join(parts)}")
    if not lines:
        return "No hygiene routines assigned this week yet."
    return "This week's hygiene:\n" + "\n".join(lines)


def week_strip(d: date | None = None, category: str | None = None) -> list:
    d = d or date.today()
    start = _week_start(d)
    today_iso = date.today().isoformat()
    week = current_week_key(d)
    plan = get_week_plan(week)
    if category == "shower":
        allowed = frozenset(SHOWER_ROUTINE_TYPES)
    elif category == "skincare":
        allowed = frozenset(SKINCARE_ROUTINE_TYPES)
    else:
        allowed = frozenset(ROUTINE_TYPES)
    out = []
    for i in range(7):
        cell = start + timedelta(days=i)
        dk = WEEKDAY_KEYS[cell.weekday()]
        routines = [
            t for t, days in plan.items() if dk in (days or []) and t in allowed
        ]
        display = day_routine_display(dk, week, allowed)
        css_classes = [ROUTINE_TYPES[rt]["css"] for rt in routines if rt in ROUTINE_TYPES]
        out.append(
            {
                "day_key": dk,
                "label": cell.strftime("%a"),
                "full": cell.strftime("%A"),
                "initial": cell.strftime("%a")[:1],
                "date_num": cell.day,
                "iso_date": cell.isoformat(),
                "is_today": cell.isoformat() == today_iso,
                "routine_types": routines,
                "routine_type": display["routine_type"],
                "routine_emoji": display["emoji"],
                "routine_label": display["label"],
                "routine_css": display["css"],
                "routine_css_classes": css_classes,
                "href": display["href"],
            }
        )
    return out


def routine_hub_card(routine_type: str, week: str | None = None) -> dict:
    meta = ROUTINE_TYPES[routine_type]
    week = week or current_week_key()
    plan = get_week_plan(week)
    assigned = plan.get(routine_type) or []
    today = today_day_key()
    status = group_status(routine_type)
    return {
        "routine_type": routine_type,
        "title": meta["label"],
        "emoji": meta["emoji"],
        "css": meta["css"],
        "assigned_days": assigned,
        "assigned_label": ", ".join(d.capitalize() for d in assigned) if assigned else "",
        "is_today": today in assigned,
        "summary": status["summary"],
        "href": ROUTINE_HREFS[routine_type],
    }


def page_data(day: str | None = None) -> dict:
    day = day or today()
    products = list_products()
    return {
        "day": day,
        "week_strip": week_strip(),
        "shower_week_strip": week_strip(category="shower"),
        "skincare_week_strip": week_strip(category="skincare"),
        "week_plan": get_week_plan(),
        "routine_types": ROUTINE_TYPES,
        "shower_routine_types": SHOWER_ROUTINE_TYPES,
        "skincare_routine_types": SKINCARE_ROUTINE_TYPES,
        "products": products,
        "products_by_lane": {
            lane: [p for p in products if p.get("lane", "using") == lane]
            for lane in PRODUCT_LANES
        },
        "products_summary": products_summary(),
        "schedule": list_schedule(),
    }


def today_status(day: str | None = None) -> dict:
    """Backward-compatible flat status."""
    morning = group_status("morning", day)
    return {
        "day": morning["day"],
        "items": morning["items"],
        "done_count": morning["done_count"],
        "total": morning["total"],
        "summary": morning["summary"],
        "all_done": morning["all_done"],
    }


def context_block(day: str | None = None) -> str:
    data = page_data(day)
    lines = ["=== HYGIENE & SKINCARE ==="]
    today_routines = get_day_routines(today_day_key())
    if today_routines:
        parts = [f"{ROUTINE_TYPES[rt]['emoji']} {ROUTINE_TYPES[rt]['label']}" for rt in today_routines]
        lines.append("Today: " + " + ".join(parts))
    else:
        lines.append("Today: no routine picked yet")
    lines.append(data["products_summary"])
    lines.append(week_plan_summary())
    buy_next = data["products_by_lane"].get("buy_next") or []
    if buy_next:
        lines.append("\nBUY NEXT:")
        for p in buy_next:
            extra = f" — {p['note']}" if p.get("note") else ""
            lines.append(f"  · {p['name']}{extra}")
    return "\n".join(lines)
