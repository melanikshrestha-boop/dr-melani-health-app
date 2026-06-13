"""Organize labs into body-system sections + gynecology reports."""

from __future__ import annotations

import json
from pathlib import Path

from .lab_glossary import explain_value, enrich_draws
from .paths import HEALTH_DATA

GYN_FILE = HEALTH_DATA / "reports" / "gynecology.json"

LAB_SECTIONS: list[dict] = [
    {
        "id": "cholesterol",
        "title": "Cholesterol",
        "explainer": (
            "Measures the fat in your blood that affects your heart and arteries. "
            "Includes LDL (bad), HDL (good), triglycerides, and total cholesterol."
        ),
        "tests": [
            "LDL Cholesterol",
            "HDL Cholesterol",
            "Triglycerides",
            "Total Cholesterol",
            "Non-HDL Cholesterol",
            "Chol/HDL Ratio",
        ],
    },
    {
        "id": "blood_sugar",
        "title": "Blood sugar",
        "explainer": "Shows how your body handles sugar — fasting glucose and A1c (3-month average).",
        "tests": ["Glucose", "Hemoglobin A1c"],
    },
    {
        "id": "blood_cells",
        "title": "Blood cells",
        "explainer": "Your CBC — red cells, white cells, and platelets. Checks for anemia, infection, and clotting.",
        "tests": [
            "WBC", "RBC", "HGB", "HCT", "MCV", "MCH", "MCHC", "PLT", "RDW", "MPV",
            "Segmented Neutrophils", "Absolute Neutrophils",
            "Lymphocytes", "Absolute Lymphocytes",
            "Monocytes", "Absolute Monocytes",
            "Eosinophils", "Absolute Eosinophils",
            "Basophils", "Absolute Basophils",
        ],
    },
    {
        "id": "liver",
        "title": "Liver",
        "explainer": (
            "Enzymes and proteins from your liver. ALP also reflects bone activity. "
            "ALT and AST rise when liver cells are stressed."
        ),
        "tests": ["ALT", "AST", "ALP", "Total Bilirubin", "Albumin", "Total Protein"],
    },
    {
        "id": "kidney",
        "title": "Kidney",
        "explainer": "How well your kidneys filter waste and balance fluids — creatinine, BUN, and GFR.",
        "tests": ["Creatinine", "BUN", "GFR"],
    },
    {
        "id": "electrolytes",
        "title": "Electrolytes & minerals",
        "explainer": "Salt, potassium, and calcium balance — important for heart, muscles, and hydration.",
        "tests": ["Sodium", "Potassium", "Chloride", "CO2", "Calcium"],
    },
    {
        "id": "thyroid",
        "title": "Thyroid",
        "explainer": "TSH tells your thyroid how hard to work — checks for over- or under-active thyroid.",
        "tests": ["TSH"],
    },
]

GYN_SECTION = {
    "id": "gynecology",
    "title": "Gynecology",
    "explainer": (
        "Women's health visits — Pap smear, HPV, pelvic exam, and related results. "
        "Upload a gynecologist report PDF to add a new visit here."
    ),
}

_TEST_SECTION: dict[str, dict] = {}
for _spec in LAB_SECTIONS:
    for _name in _spec["tests"]:
        _TEST_SECTION[_name] = _spec


def format_lab_date(iso: str) -> str:
    """Format ISO datetime as Date: MM/DD/YYYY."""
    if not iso:
        return "Date: —"
    try:
        y, m, d = iso[:10].split("-")
        return f"Date: {m}/{d}/{y}"
    except ValueError:
        return f"Date: {iso[:10]}"


def _latest_values_by_test(draws: list) -> dict[str, dict]:
    latest: dict[str, dict] = {}
    history: dict[str, dict] = {}
    for draw in sorted(draws, key=lambda d: d.get("collected") or ""):
        for v in draw.get("values", []):
            name = v["test"]
            prev = history.get(name)
            enriched = dict(v)
            enriched["collected"] = (draw.get("collected") or "")[:10]
            enriched["lab"] = draw.get("lab") or ""
            enriched["info"] = explain_value(v, prev)
            latest[name] = enriched
            history[name] = v
    return latest


def _section_status(tests: list[dict]) -> tuple[str, str]:
    """Return (badge, chip_class) for a section."""
    if not tests:
        return "—", "neutral"
    badges = [t["info"]["status_badge"] for t in tests]
    if any(b == "HIGH" for b in badges):
        return "HIGH", "high"
    if any(b == "LOW" for b in badges):
        return "LOW", "low"
    return "OK", "ok"


def load_gynecology_reports() -> list[dict]:
    if not GYN_FILE.exists():
        return []
    try:
        return json.loads(GYN_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return []


def save_gynecology_report(report: dict) -> dict:
    GYN_FILE.parent.mkdir(parents=True, exist_ok=True)
    reports = load_gynecology_reports()
    reports = [r for r in reports if r.get("id") != report.get("id")]
    reports.insert(0, report)
    reports.sort(key=lambda r: r.get("collected") or "", reverse=True)
    GYN_FILE.write_text(json.dumps(reports, indent=2))
    return report


def build_lab_sections(draws: list) -> list[dict]:
    enriched = enrich_draws(draws)
    latest = _latest_values_by_test(enriched)
    sections = []

    for spec in LAB_SECTIONS:
        tests = []
        for name in spec["tests"]:
            if name in latest:
                tests.append(latest[name])
        if not tests:
            continue
        badge, chip = _section_status(tests)
        sections.append({
            **spec,
            "tests": tests,
            "status_badge": badge,
            "chip_class": chip,
            "last_date": max(t["collected"] for t in tests),
            "last_date_display": format_lab_date(max(t["collected"] for t in tests)),
        })
    return sections


def build_organized_visits(draws: list) -> list[dict]:
    """Lab history grouped by visit date, then by body-system topic (not lab name)."""
    enriched = enrich_draws(draws)
    visits = []

    for draw in sorted(enriched, key=lambda d: d.get("collected") or "", reverse=True):
        by_section: dict[str, list] = {}
        unmatched: list = []
        for v in draw.get("values", []):
            spec = _TEST_SECTION.get(v.get("test", ""))
            if spec:
                by_section.setdefault(spec["id"], []).append(v)
            else:
                unmatched.append(v)

        sections_out = []
        for spec in LAB_SECTIONS:
            tests = by_section.get(spec["id"])
            if tests:
                sections_out.append({
                    "explainer": spec["explainer"],
                    "tests": tests,
                })
        if unmatched:
            sections_out.append({
                "explainer": "Other results from this visit.",
                "tests": unmatched,
            })

        visits.append({
            "date_display": format_lab_date(draw.get("collected") or ""),
            "sections": sections_out,
        })
    return visits


def current_section_status(draws: list) -> list[dict]:
    """Neon strip — one chip per section (Cholesterol OK, Liver OK, …)."""
    out = []
    for sec in build_lab_sections(draws):
        out.append({
            "short": sec["title"],
            "value_display": sec["last_date_display"],
            "status_badge": sec["status_badge"],
            "chip_class": sec["chip_class"],
        })
    gyn = load_gynecology_reports()
    if gyn:
        out.append({
            "short": "Gynecology",
            "value_display": format_lab_date(gyn[0].get("collected", "")),
            "status_badge": "OK",
            "chip_class": "ok",
        })
    return out


def build_gynecology_section() -> dict | None:
    reports = load_gynecology_reports()
    if not reports:
        return None
    return {**GYN_SECTION, "reports": reports}
