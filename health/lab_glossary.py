from __future__ import annotations

"""Plain-language explanations for lab tests."""

import re

GLOSSARY: dict[str, dict] = {
    "WBC": {
        "full_name": "White Blood Cells",
        "simple": "Your infection-fighting immune cells.",
        "tests_for": "Infection, inflammation, or immune issues.",
        "normal_range": "About 4.1–10.9 (units vary by lab)",
        "high_means": "Often infection, inflammation, or stress on the body.",
        "low_means": "Can mean weakened immunity or some medications.",
    },
    "RBC": {
        "full_name": "Red Blood Cells",
        "simple": "Cells that carry oxygen through your blood.",
        "tests_for": "Anemia and oxygen delivery.",
        "normal_range": "About 3.8–5.2 (female ranges vary)",
        "high_means": "Dehydration or rarely other conditions.",
        "low_means": "Anemia — less oxygen carried.",
    },
    "HGB": {
        "full_name": "Hemoglobin",
        "simple": "The protein inside red cells that holds oxygen.",
        "tests_for": "Anemia and blood oxygen capacity.",
        "normal_range": "About 11.7–15.7 g/dL (female)",
        "high_means": "Dehydration or excess red cells.",
        "low_means": "Anemia — you may feel tired or weak.",
    },
    "HCT": {
        "full_name": "Hematocrit",
        "simple": "What percent of your blood is red cells.",
        "tests_for": "Anemia and hydration.",
        "normal_range": "About 34.9–46.9%",
        "high_means": "Thicker blood — dehydration is common.",
        "low_means": "Anemia or blood loss.",
    },
    "MCV": {
        "full_name": "Mean Cell Volume",
        "simple": "Average size of your red blood cells.",
        "tests_for": "Type of anemia (iron vs B12, etc.).",
        "normal_range": "About 80–100 fL",
        "high_means": "Cells are larger — can relate to B12/folate.",
        "low_means": "Cells are smaller — often iron-related.",
    },
    "MCH": {
        "full_name": "Mean Cell Hemoglobin",
        "simple": "Average amount of hemoglobin per red cell.",
        "tests_for": "Anemia patterns.",
        "normal_range": "About 26–34 pg",
        "high_means": "Usually not urgent alone.",
        "low_means": "Often seen with iron deficiency.",
    },
    "MCHC": {
        "full_name": "Mean Cell Hemoglobin Concentration",
        "simple": "How concentrated hemoglobin is inside red cells.",
        "tests_for": "Anemia and cell health.",
        "normal_range": "About 31–37 g/dL",
        "high_means": "Rare; can relate to cell shape issues.",
        "low_means": "Often iron deficiency.",
    },
    "PLT": {
        "full_name": "Platelets",
        "simple": "Cells that help your blood clot.",
        "tests_for": "Bleeding or clotting risk.",
        "normal_range": "About 150–400",
        "high_means": "Higher clot risk in some cases.",
        "low_means": "Easier bruising/bleeding.",
    },
    "RDW": {
        "full_name": "Red Cell Distribution Width",
        "simple": "How varied your red cell sizes are.",
        "tests_for": "Early anemia or mixed causes.",
        "normal_range": "About 11.5–14.3%",
        "high_means": "Mixed cell sizes — often iron or B12 issues.",
        "low_means": "Usually normal.",
    },
    "MPV": {
        "full_name": "Mean Platelet Volume",
        "simple": "Average size of your platelets.",
        "tests_for": "Platelet production activity.",
        "normal_range": "About 9.2–12.7 fL",
        "high_means": "Newer/larger platelets being made.",
        "low_means": "Usually not concerning alone.",
    },
    "Albumin": {
        "full_name": "Albumin",
        "simple": "Main protein in blood — made by the liver.",
        "tests_for": "Liver, nutrition, and kidney health.",
        "normal_range": "About 3.5–5.2 g/dL",
        "high_means": "Usually dehydration.",
        "low_means": "Liver, kidney, or poor nutrition.",
    },
    "ALT": {
        "full_name": "Alanine Aminotransferase",
        "simple": "Liver enzyme — rises when liver cells are stressed.",
        "tests_for": "Liver inflammation or damage.",
        "normal_range": "About 0–35 U/L (female)",
        "high_means": "Liver irritation — meds, alcohol, fatty liver, etc.",
        "low_means": "Usually fine.",
    },
    "ALP": {
        "full_name": "Alkaline Phosphatase",
        "simple": "Enzyme from liver and bone.",
        "tests_for": "Liver or bone activity.",
        "normal_range": "About 35–105 U/L",
        "high_means": "Liver, bone growth, or bile flow issues.",
        "low_means": "Usually not concerning.",
    },
    "AST": {
        "full_name": "Aspartate Aminotransferase",
        "simple": "Enzyme in liver and muscle.",
        "tests_for": "Liver or muscle stress.",
        "normal_range": "About 0–32 U/L (female)",
        "high_means": "Liver or muscle injury.",
        "low_means": "Usually fine.",
    },
    "BUN": {
        "full_name": "Blood Urea Nitrogen",
        "simple": "Waste from protein — cleared by kidneys.",
        "tests_for": "Kidney function and hydration.",
        "normal_range": "About 6–20 mg/dL",
        "high_means": "Dehydration or kidneys working harder.",
        "low_means": "Low protein intake — usually okay.",
    },
    "Creatinine": {
        "full_name": "Creatinine",
        "simple": "Muscle waste filtered by kidneys.",
        "tests_for": "How well kidneys filter blood.",
        "normal_range": "About 0.51–0.95 mg/dL (female)",
        "high_means": "Kidneys filtering less well.",
        "low_means": "Low muscle mass — often normal for you.",
    },
    "Glucose": {
        "full_name": "Blood Glucose (Sugar)",
        "simple": "Sugar in your blood right now.",
        "tests_for": "Diabetes and blood sugar control.",
        "normal_range": "About 70–99 mg/dL fasting",
        "high_means": "Prediabetes/diabetes or recent food stress.",
        "low_means": "Low blood sugar — shaky, hungry, foggy.",
    },
    "GFR": {
        "full_name": "Glomerular Filtration Rate",
        "simple": "Estimated kidney filtering speed.",
        "tests_for": "Kidney function stage.",
        "normal_range": "90+ mL/min/1.73m² is normal",
        "high_means": "Usually fine.",
        "low_means": "Kidneys filtering less — needs follow-up if low.",
    },
    "Sodium": {
        "full_name": "Sodium",
        "simple": "Salt balance in blood.",
        "tests_for": "Hydration and electrolyte balance.",
        "normal_range": "About 136–145 mmol/L",
        "high_means": "Dehydration or too much salt.",
        "low_means": "Too much water or some meds/illness.",
    },
    "Potassium": {
        "full_name": "Potassium",
        "simple": "Key electrolyte for heart and muscles.",
        "tests_for": "Heart rhythm and muscle function.",
        "normal_range": "About 3.4–5.2 mmol/L",
        "high_means": "Can affect heart — needs attention if high.",
        "low_means": "Weakness, cramps — low diet or loss.",
    },
    "Chloride": {
        "full_name": "Chloride",
        "simple": "Electrolyte that balances fluids and acid.",
        "tests_for": "Hydration and acid-base balance.",
        "normal_range": "About 98–107 mmol/L",
        "high_means": "Dehydration or acid issues.",
        "low_means": "Vomiting, some lung/kidney issues.",
    },
    "CO2": {
        "full_name": "Carbon Dioxide (Bicarbonate)",
        "simple": "Helps keep blood acidity balanced.",
        "tests_for": "Lung/kidney acid-base balance.",
        "normal_range": "About 22–29 mmol/L",
        "high_means": "Lungs clearing CO₂ less or metabolic shift.",
        "low_means": "Acid buildup or fast breathing.",
    },
    "Calcium": {
        "full_name": "Calcium",
        "simple": "Mineral for bones, nerves, and muscles.",
        "tests_for": "Bone, parathyroid, and kidney health.",
        "normal_range": "About 8.8–10.2 mg/dL",
        "high_means": "Parathyroid or vitamin D issues.",
        "low_means": "Vitamin D, low albumin, or deficiency.",
    },
    "Total Protein": {
        "full_name": "Total Protein",
        "simple": "All proteins in blood (albumin + others).",
        "tests_for": "Liver, nutrition, immune status.",
        "normal_range": "About 6.4–8.3 g/dL",
        "high_means": "Dehydration or chronic inflammation.",
        "low_means": "Liver, kidney loss, or malnutrition.",
    },
    "Total Bilirubin": {
        "full_name": "Total Bilirubin",
        "simple": "Breakdown product from red cells — makes jaundice yellow.",
        "tests_for": "Liver and bile flow.",
        "normal_range": "About 0.0–1.0 mg/dL",
        "high_means": "Liver, bile duct, or hemolysis.",
        "low_means": "Usually fine.",
    },
    "Total Cholesterol": {
        "full_name": "Total Cholesterol",
        "simple": "All cholesterol types combined in blood.",
        "tests_for": "Heart and artery disease risk.",
        "normal_range": "Often goal under 170 mg/dL",
        "high_means": "Higher heart risk over time — diet/genes.",
        "low_means": "Usually not a problem.",
    },
    "HDL Cholesterol": {
        "full_name": "HDL (Good Cholesterol)",
        "simple": "Helps remove bad cholesterol from arteries.",
        "tests_for": "Heart protection.",
        "normal_range": "Goal above 45 mg/dL (female)",
        "high_means": "Protective — generally good.",
        "low_means": "Higher heart risk — exercise helps.",
    },
    "LDL Cholesterol": {
        "full_name": "LDL (Bad Cholesterol)",
        "simple": "Can build up in artery walls.",
        "tests_for": "Heart attack and stroke risk.",
        "normal_range": "Goal under 110 mg/dL (often lower if risk)",
        "high_means": "Higher plaque risk — your result was flagged.",
        "low_means": "Generally good for heart health.",
    },
    "Triglycerides": {
        "full_name": "Triglycerides",
        "simple": "Fat in blood — rises after sugary/fatty meals.",
        "tests_for": "Metabolic and heart risk.",
        "normal_range": "Goal under 90 mg/dL fasting",
        "high_means": "Diet, weight, diabetes risk — yours was high.",
        "low_means": "Usually fine.",
    },
    "Non-HDL Cholesterol": {
        "full_name": "Non-HDL Cholesterol",
        "simple": "All cholesterol that isn't HDL — the risky part.",
        "tests_for": "Overall bad cholesterol burden.",
        "normal_range": "Goal under 120 mg/dL",
        "high_means": "Higher artery risk — yours was flagged.",
        "low_means": "Better for heart health.",
    },
    "Chol/HDL Ratio": {
        "full_name": "Cholesterol/HDL Ratio",
        "simple": "Total cholesterol divided by good HDL.",
        "tests_for": "Quick heart risk snapshot.",
        "normal_range": "Goal under 5.0",
        "high_means": "Less favorable balance.",
        "low_means": "Better balance.",
    },
    "Hemoglobin A1c": {
        "full_name": "Hemoglobin A1c",
        "simple": "Average blood sugar over ~3 months.",
        "tests_for": "Diabetes and prediabetes.",
        "normal_range": "Under 5.7%",
        "high_means": "Prediabetes (5.7–6.4) or diabetes (6.5+).",
        "low_means": "Usually fine unless too low with meds.",
    },
    "TSH": {
        "full_name": "Thyroid Stimulating Hormone",
        "simple": "Brain signal telling thyroid how hard to work.",
        "tests_for": "Over- or under-active thyroid.",
        "normal_range": "About 0.4–4.5 mIU/L (lab-specific)",
        "high_means": "Thyroid may be underactive (hypothyroid).",
        "low_means": "Thyroid may be overactive (hyperthyroid).",
    },
    "Segmented Neutrophils": {
        "full_name": "Neutrophils (%)",
        "simple": "Most common white cells — first responders to bacteria.",
        "tests_for": "Bacterial infection or stress.",
        "normal_range": "About 40–70% of white cells",
        "high_means": "Bacterial infection, inflammation, stress.",
        "low_means": "Viral infection or bone marrow issues.",
    },
    "Absolute Neutrophils": {
        "full_name": "Absolute Neutrophil Count",
        "simple": "Actual number of neutrophils in blood.",
        "tests_for": "Infection fighting capacity.",
        "normal_range": "About 1.9–8.6",
        "high_means": "Active infection or inflammation.",
        "low_means": "Higher infection risk if very low.",
    },
    "Lymphocytes": {
        "full_name": "Lymphocytes (%)",
        "simple": "White cells for viruses and long-term immunity.",
        "tests_for": "Viral illness and immune memory.",
        "normal_range": "About 20–40%",
        "high_means": "Viral infection or some chronic states.",
        "low_means": "Stress, steroids, or immune suppression.",
    },
    "Absolute Lymphocytes": {
        "full_name": "Absolute Lymphocyte Count",
        "simple": "Actual number of lymphocytes.",
        "tests_for": "Immune function.",
        "normal_range": "About 0.5–4.4",
        "high_means": "Viral infection common.",
        "low_means": "Immune suppression if very low.",
    },
    "Monocytes": {
        "full_name": "Monocytes (%)",
        "simple": "White cells that clean up and trigger longer immune response.",
        "tests_for": "Chronic infection or inflammation.",
        "normal_range": "About 2–10%",
        "high_means": "Recovery phase or chronic inflammation.",
        "low_means": "Usually not urgent alone.",
    },
    "Absolute Monocytes": {
        "full_name": "Absolute Monocyte Count",
        "simple": "Number of monocytes in blood.",
        "tests_for": "Immune cleanup activity.",
        "normal_range": "About 0.1–1.0",
        "high_means": "Inflammation or recovery.",
        "low_means": "Usually fine.",
    },
    "Eosinophils": {
        "full_name": "Eosinophils (%)",
        "simple": "Allergy and parasite-fighting white cells.",
        "tests_for": "Allergies, asthma, parasites.",
        "normal_range": "About 0–4%",
        "high_means": "Allergies, asthma, eczema common.",
        "low_means": "Stress or steroids — usually okay.",
    },
    "Absolute Eosinophils": {
        "full_name": "Absolute Eosinophil Count",
        "simple": "Number of eosinophils.",
        "tests_for": "Allergy-related inflammation.",
        "normal_range": "About 0.0–0.9",
        "high_means": "Allergic conditions.",
        "low_means": "Usually fine.",
    },
    "Basophils": {
        "full_name": "Basophils (%)",
        "simple": "Rare allergy-related white cells (not bacteria).",
        "tests_for": "Allergies and some immune reactions.",
        "normal_range": "About 0–1%",
        "high_means": "Allergies or rare conditions if very high.",
        "low_means": "Normal — usually nothing to worry about.",
    },
    "Absolute Basophils": {
        "full_name": "Absolute Basophil Count",
        "simple": "Number of basophils in blood.",
        "tests_for": "Allergy-related immune activity.",
        "normal_range": "About 0.0–0.2",
        "high_means": "Allergies if elevated.",
        "low_means": "Normal.",
    },
}


REFERENCE_LIMITS: dict[str, dict[str, float | None]] = {
    "WBC": {"ref_low": 4.1, "ref_high": 10.9},
    "RBC": {"ref_low": 3.8, "ref_high": 5.2},
    "HGB": {"ref_low": 11.7, "ref_high": 15.7},
    "HCT": {"ref_low": 34.9, "ref_high": 46.9},
    "MCV": {"ref_low": 80.0, "ref_high": 100.0},
    "MCH": {"ref_low": 26.0, "ref_high": 34.0},
    "MCHC": {"ref_low": 31.0, "ref_high": 37.0},
    "PLT": {"ref_low": 150, "ref_high": 400},
    "RDW": {"ref_low": 11.5, "ref_high": 14.3},
    "MPV": {"ref_low": 9.2, "ref_high": 12.7},
    "Albumin": {"ref_low": 3.5, "ref_high": 5.2},
    "ALT": {"ref_low": 0.0, "ref_high": 35.0},
    "ALP": {"ref_low": 35.0, "ref_high": 105.0},
    "AST": {"ref_low": 0.0, "ref_high": 32.0},
    "BUN": {"ref_low": 6.0, "ref_high": 20.0},
    "Chloride": {"ref_low": 98, "ref_high": 107},
    "CO2": {"ref_low": 22, "ref_high": 29},
    "Creatinine": {"ref_low": 0.51, "ref_high": 0.95},
    "Glucose": {"ref_low": 70, "ref_high": 99},
    "Potassium": {"ref_low": 3.4, "ref_high": 5.2},
    "Sodium": {"ref_low": 136, "ref_high": 145},
    "Calcium": {"ref_low": 8.8, "ref_high": 10.2},
    "Total Protein": {"ref_low": 6.4, "ref_high": 8.3},
    "GFR": {"ref_low": 90, "ref_high": None},
    "Total Bilirubin": {"ref_low": 0.0, "ref_high": 1.0},
    "Total Cholesterol": {"ref_high": 170},
    "HDL Cholesterol": {"ref_low": 45},
    "Triglycerides": {"ref_high": 90},
    "LDL Cholesterol": {"ref_high": 110},
    "Chol/HDL Ratio": {"ref_high": 5.0},
    "Non-HDL Cholesterol": {"ref_high": 120},
    "Hemoglobin A1c": {"ref_high": 5.7},
    "Absolute Neutrophils": {"ref_low": 1.9, "ref_high": 8.6},
    "Absolute Lymphocytes": {"ref_low": 0.5, "ref_high": 4.4},
    "Absolute Monocytes": {"ref_low": 0.1, "ref_high": 1.0},
    "Absolute Eosinophils": {"ref_low": 0.0, "ref_high": 0.9},
    "Absolute Basophils": {"ref_low": 0.0, "ref_high": 0.2},
    "TSH": {"ref_low": 0.5, "ref_high": 4.3},
}


def _as_float(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def _parse_ref_text(ref_text: str | None) -> tuple[float | None, float | None]:
    if not ref_text:
        return None, None
    text = str(ref_text).strip()
    if text.startswith("<"):
        return None, _as_float(re.sub(r"[^\d.]", "", text))
    if text.startswith(">"):
        return _as_float(re.sub(r"[^\d.]", "", text)), None
    nums = re.findall(r"[\d.]+", text)
    if len(nums) >= 2:
        return _as_float(nums[0]), _as_float(nums[1])
    if len(nums) == 1:
        val = _as_float(nums[0])
        if "<" in text:
            return None, val
        if ">" in text:
            return val, None
    return None, None


def _resolve_references(v: dict) -> tuple[float | None, float | None]:
    ref_low = _as_float(v.get("ref_low"))
    ref_high = _as_float(v.get("ref_high"))
    if ref_low is None and ref_high is None:
        parsed_low, parsed_high = _parse_ref_text(v.get("ref_text"))
        ref_low = parsed_low
        ref_high = parsed_high
    limits = REFERENCE_LIMITS.get(v.get("test", ""), {})
    if ref_low is None:
        ref_low = _as_float(limits.get("ref_low"))
    if ref_high is None:
        ref_high = _as_float(limits.get("ref_high"))
    return ref_low, ref_high


def normalize_lab_value(v: dict) -> dict:
    """Fill reference ranges and recompute H/L flags from the numeric result."""
    out = dict(v)
    ref_low, ref_high = _resolve_references(out)
    out["ref_low"] = ref_low
    out["ref_high"] = ref_high
    result = _as_float(out.get("result"))
    if result is not None:
        out["result"] = result
    flag = _effective_flag(out)
    out["flag"] = flag or None
    return out


def compute_status_badge(v: dict) -> str:
    """OK, HIGH, or LOW — always derived from result vs normal range."""
    _, _, badge = _verdict(normalize_lab_value(v))
    return badge


def _format_range(v: dict) -> str:
    if v.get("ref_text"):
        return str(v["ref_text"])
    ref_low, ref_high = _resolve_references(v)
    unit = v.get("unit") or ""
    if ref_low is not None and ref_high is not None:
        return f"{ref_low}–{ref_high} {unit}".strip()
    if ref_high is not None:
        return f"under {ref_high} {unit}".strip()
    if ref_low is not None:
        return f"above {ref_low} {unit}".strip()
    info = GLOSSARY.get(v.get("test", ""), {})
    return info.get("normal_range", "See lab report")


def _was_abnormal(v: dict) -> bool:
    nv = normalize_lab_value(v)
    flag = (nv.get("flag") or "").upper()
    return flag in ("H", "L", "HH", "LL")


def _effective_flag(v: dict) -> str:
    """Compare result to normal range — auto HIGH/LOW even on new PDF imports."""
    ref_low, ref_high = _resolve_references(v)
    result = _as_float(v.get("result"))
    if result is not None:
        if ref_high is not None and result > ref_high:
            return "H"
        if ref_low is not None and result < ref_low:
            return "L"
        if ref_low is not None or ref_high is not None:
            return ""
    flag = (v.get("flag") or "").upper()
    if flag in ("H", "HH"):
        return "H"
    if flag in ("L", "LL"):
        return "L"
    return ""


def _verdict(v: dict, previous: dict | None = None) -> tuple[str, str, str]:
    """Return (verdict_class, verdict_text, status_badge)."""
    nv = normalize_lab_value(v)
    eff = _effective_flag(nv)
    result = _as_float(nv.get("result"))

    if eff == "H":
        text = "Above normal for you — worth tracking with your doctor."
        if previous and _was_abnormal(previous) and not _was_abnormal(nv):
            text = "Was flagged before — now in range."
        return "bad", text, "HIGH"
    if eff == "L":
        text = "Below normal for you — worth tracking with your doctor."
        return "bad", text, "LOW"

    if result is not None or nv.get("result_text"):
        if previous and _was_abnormal(previous):
            return "good", "Improved — was flagged before, now OK.", "OK"
        return "good", "Within normal range on this report.", "OK"

    flag = (nv.get("flag") or "").upper()
    if flag in ("H", "HH"):
        return "bad", "Flagged high on your lab report.", "HIGH"
    if flag in ("L", "LL"):
        return "bad", "Flagged low on your lab report.", "LOW"

    return "good", "Within normal range on this report.", "OK"


def explain_value(v: dict, previous: dict | None = None) -> dict:
    test = v.get("test", "")
    base = GLOSSARY.get(test, {
        "full_name": test,
        "simple": "A blood test marker from your lab panel.",
        "tests_for": "General health monitoring.",
        "normal_range": "Varies by lab — see your report.",
        "high_means": "May be above expected — ask your doctor if flagged.",
        "low_means": "May be below expected — ask your doctor if flagged.",
    })
    verdict_class, verdict_text, status_badge = _verdict(v, previous)
    nv = normalize_lab_value(v)
    result_display = v.get("result")
    if result_display is None:
        result_display = v.get("result_text")
    trend = ""
    if previous and previous.get("result") is not None and v.get("result") is not None:
        diff = v["result"] - previous["result"]
        if abs(diff) >= 0.1:
            direction = "up" if diff > 0 else "down"
            trend = f"Changed from {previous['result']} ({previous.get('collected', 'prior draw')[:10]}) — {direction}."
    return {
        **base,
        "test": test,
        "your_result": f"{result_display} {v.get('unit') or ''}".strip(),
        "report_range": _format_range(v),
        "verdict_class": verdict_class,
        "verdict_text": verdict_text,
        "status_badge": status_badge,
        "flag": _effective_flag(nv),
        "trend": trend,
    }


KEY_STATUS_TESTS: list[tuple[str, str]] = [
    ("LDL Cholesterol", "LDL"),
    ("HDL Cholesterol", "HDL"),
    ("Triglycerides", "TG"),
    ("Total Cholesterol", "Total chol"),
    ("Non-HDL Cholesterol", "Non-HDL"),
    ("Hemoglobin A1c", "A1c"),
    ("Glucose", "Glucose"),
    ("HGB", "HGB"),
    ("TSH", "TSH"),
]


def current_lab_status(draws: list) -> list[dict]:
    """Latest result per key test — for neon status strip."""
    latest: dict[str, dict] = {}
    for draw in sorted(draws, key=lambda d: d.get("collected") or ""):
        for v in draw.get("values", []):
            latest[v["test"]] = {**v, "collected": draw.get("collected", "")[:10]}

    out = []
    for test_name, short in KEY_STATUS_TESTS:
        v = latest.get(test_name)
        if not v:
            continue
        info = explain_value(v)
        chip = "ok" if info["status_badge"] == "OK" else (
            "high" if info["status_badge"] == "HIGH" else (
                "low" if info["status_badge"] == "LOW" else "ok"
            )
        )
        val = v.get("result")
        if val is None:
            val = v.get("result_text")
        unit = v.get("unit") or ""
        out.append({
            "test": test_name,
            "short": short,
            "value": val,
            "unit": unit,
            "value_display": f"{val} {unit}".strip() if val is not None else "—",
            "status_badge": info["status_badge"],
            "chip_class": chip,
            "collected": v.get("collected", ""),
        })
    return out


def enrich_draws(draws: list) -> list:
    sorted_draws = sorted(draws, key=lambda d: d.get("collected") or "")
    history: dict[str, dict] = {}
    history_date: dict[str, str] = {}
    enriched_by_id: dict[str, dict] = {}

    for draw in sorted_draws:
        d = dict(draw)
        values_out = []
        for v in draw["values"]:
            prev = history.get(v["test"])
            if prev:
                prev = {**prev, "collected": history_date.get(v["test"], "")}
            info = explain_value(v, prev)
            values_out.append({**v, "info": info})
            history[v["test"]] = dict(v)
            history_date[v["test"]] = draw.get("collected") or ""
        d["values"] = values_out
        enriched_by_id[draw["id"]] = d

    return [enriched_by_id[d["id"]] for d in draws if d["id"] in enriched_by_id]
