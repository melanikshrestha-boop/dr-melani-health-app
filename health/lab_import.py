"""Import lab PDFs — parse, save, and auto-update screening schedule."""

from __future__ import annotations

import csv
import json
import re
from datetime import date, datetime
from pathlib import Path

from .db import get_conn, _add_months
from .lab_glossary import normalize_lab_value
from .paths import HEALTH_DATA
from .screening import mark_test_done

DOCUMENTS_DIR = HEALTH_DATA / "documents"
DRAWS_DIR = HEALTH_DATA / "labs" / "draws"

# Map parsed panel keywords → screening_schedule test_name
SCREENING_TRIGGERS: list[tuple[str, str]] = [
    (r"ldl|lipid|cholesterol|triglyceride|hdl", "Lipid panel (fasting)"),
    (r"a1c|hemoglobin a1c|hba1c", "A1C"),
    (r"glucose|fasting glucose", "Fasting glucose"),
    (r"wbc|rbc|hgb|hemoglobin|cbc|platelet", "CBC with diff"),
    (r"creatinine|bun|sodium|potassium|cmp|bmp|alt|ast", "CMP/BMP"),
    (r"\btsh\b|thyroid", "TSH"),
]

TEST_ALIASES = {
    "LDL CHOL": "LDL Cholesterol",
    "LDL-CHOLESTEROL": "LDL Cholesterol",
    "HDL CHOL": "HDL Cholesterol",
    "TOTAL CHOL": "Total Cholesterol",
    "TRIGLYCERIDE": "Triglycerides",
    "HGB A1C": "Hemoglobin A1c",
    "HBA1C": "Hemoglobin A1c",
    "GLUCOSE": "Glucose",
    "HGB": "HGB",
    "HEMOGLOBIN": "HGB",
}


def extract_pdf_text(pdf_path: str | Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(pdf_path))
    parts = []
    for page in reader.pages:
        text = page.extract_text() or ""
        parts.append(text)
    return "\n".join(parts)


def _parse_json_block(text: str) -> dict | None:
    start, end = text.find("{"), text.rfind("}") + 1
    if start < 0 or end <= start:
        return None
    try:
        return json.loads(text[start:end])
    except json.JSONDecodeError:
        return None


def _normalize_test(name: str) -> str:
    key = (name or "").strip()
    upper = key.upper()
    for alias, canonical in TEST_ALIASES.items():
        if alias in upper or upper == alias:
            return canonical
    # Title-case common pattern
    if key and key == upper:
        return key.title().replace(" A1c", " A1c").replace(" Ldl ", " LDL ")
    return key


def _compute_flag(result: float | None, ref_low, ref_high) -> str:
    if result is None:
        return ""
    if ref_high is not None and result > ref_high:
        return "H"
    if ref_low is not None and result < ref_low:
        return "L"
    return ""


def _parse_date(text: str) -> str | None:
    patterns = [
        r"(20\d{2}-\d{2}-\d{2})",
        r"(\d{1,2}/\d{1,2}/20\d{2})",
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2}",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if not m:
            continue
        raw = m.group(0).replace(",", "")
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%b %d %Y", "%B %d %Y"):
            try:
                return datetime.strptime(raw.strip(), fmt).date().isoformat()
            except ValueError:
                continue
    return None


def _parse_with_regex(text: str) -> dict | None:
    """Best-effort parse for Quest/Labcorp-style text dumps."""
    collected = _parse_date(text[:3000]) or date.today().isoformat()
    lab = "Imported lab"
    if m := re.search(r"(Quest Diagnostics[^\n]*)", text, re.I):
        lab = m.group(1).strip()[:80]
    elif m := re.search(r"(USC[^\n]*Lab[^\n]*)", text, re.I):
        lab = m.group(1).strip()[:80]

    values = []
    line_pat = re.compile(
        r"^([A-Za-z0-9 \-/().]+?)\s+([\d.]+)\s*(H|L|HH|LL)?\s*"
        r"(?:([<>]?\s*[\d.]+(?:\s*[-–]\s*[\d.]+)?)\s*)?"
        r"(\S+)?\s*$",
        re.M,
    )
    for line in text.splitlines():
        line = line.strip()
        if len(line) < 5 or line.isupper() and "PANEL" in line:
            continue
        m = re.match(
            r"^(.{3,40}?)\s+([\d.]+)\s*(H|L)?\s*(?:([<>][\d.]+(?:\s*[-–]\s*[\d.]+)?))?\s*(\S+)?$",
            line,
        )
        if not m:
            continue
        name = _normalize_test(m.group(1).strip())
        if not name or len(name) < 2:
            continue
        try:
            result = float(m.group(2))
        except ValueError:
            continue
        flag = (m.group(3) or "").upper()[:1]
        ref_text = (m.group(4) or "").strip()
        unit = (m.group(5) or "").strip()
        ref_low, ref_high = None, None
        if ref_text.startswith("<"):
            ref_high = float(re.sub(r"[^\d.]", "", ref_text))
        elif ref_text.startswith(">"):
            ref_low = float(re.sub(r"[^\d.]", "", ref_text))
        elif "–" in ref_text or "-" in ref_text:
            nums = re.findall(r"[\d.]+", ref_text)
            if len(nums) >= 2:
                ref_low, ref_high = float(nums[0]), float(nums[1])
        if not flag:
            flag = _compute_flag(result, ref_low, ref_high)
        values.append({
            "test": name,
            "result": result,
            "unit": unit,
            "ref_low": ref_low,
            "ref_high": ref_high,
            "ref_text": ref_text or None,
            "flag": flag or None,
        })

    if len(values) < 3:
        return None
    panels = []
    lower = text.lower()
    if "lipid" in lower or "cholesterol" in lower:
        panels.append("Lipid Panel")
    if "a1c" in lower or "hemoglobin a1c" in lower:
        panels.append("A1C")
    if "cbc" in lower or "complete blood" in lower:
        panels.append("CBC")
    if "cmp" in lower or "metabolic" in lower:
        panels.append("CMP")
    return {
        "collected": f"{collected}T12:00:00",
        "lab": lab,
        "panels": panels or ["Imported panel"],
        "values": values,
    }


def _parse_with_ai(text: str) -> dict | None:
    from openai import OpenAI

    ollama = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
    snippet = text[:12000]
    prompt = f"""Extract blood lab results from this report text.
Return JSON only:
{{
  "collected": "YYYY-MM-DD",
  "lab": "lab name",
  "panels": ["panel name"],
  "values": [
    {{"test": "LDL Cholesterol", "result": 120, "unit": "mg/dL", "ref_low": null, "ref_high": 110, "ref_text": "<110", "flag": "H"}}
  ]
}}
Use clear test names (LDL Cholesterol, Hemoglobin A1c, WBC, etc.). Compute flag H/L from reference range if missing.

Report text:
{snippet}"""

    try:
        resp = ollama.chat.completions.create(
            model="llama3",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )
        data = _parse_json_block(resp.choices[0].message.content or "")
        if data and data.get("values"):
            return data
    except Exception:
        pass
    return None


def parse_lab_pdf_text(text: str) -> dict:
    data = _parse_with_ai(text) or _parse_with_regex(text)
    if not data or not data.get("values"):
        raise ValueError("Could not read lab results from this PDF. Try a clearer scan or export.")
    collected = data.get("collected") or date.today().isoformat()
    if "T" not in collected:
        collected = f"{collected[:10]}T12:00:00"
    data["collected"] = collected
    data["lab"] = (data.get("lab") or "Imported lab").strip()
    data["panels"] = data.get("panels") or ["Imported panel"]
    cleaned = []
    for v in data["values"]:
        name = _normalize_test(str(v.get("test", "")))
        if not name:
            continue
        result = v.get("result")
        try:
            result = float(result) if result is not None else None
        except (TypeError, ValueError):
            result = None
        ref_low = v.get("ref_low")
        ref_high = v.get("ref_high")
        try:
            ref_low = float(ref_low) if ref_low is not None else None
        except (TypeError, ValueError):
            ref_low = None
        try:
            ref_high = float(ref_high) if ref_high is not None else None
        except (TypeError, ValueError):
            ref_high = None
        flag = (v.get("flag") or "").upper()[:1] if v.get("flag") else ""
        if not flag:
            flag = _compute_flag(result, ref_low, ref_high)
        cleaned.append(normalize_lab_value({
            "test": name,
            "result": result,
            "result_text": str(result) if result is not None else v.get("result_text"),
            "unit": v.get("unit"),
            "ref_low": ref_low,
            "ref_high": ref_high,
            "ref_text": v.get("ref_text"),
            "flag": flag or None,
        }))
    data["values"] = cleaned
    return data


def _draw_id(draw: dict) -> str:
    day = draw["collected"][:10].replace("-", "")
    lab_slug = re.sub(r"[^a-z0-9]+", "_", draw.get("lab", "lab").lower())[:24]
    panels = draw.get("panels") or []
    panel_slug = re.sub(r"[^a-z0-9]+", "_", (panels[0] if panels else "import").lower())[:16]
    return f"{day}_{lab_slug}_{panel_slug}"


def _refresh_master_csv():
    from .agent_tools import all_lab_draws

    rows = []
    for draw in all_lab_draws():
        for v in draw["values"]:
            rows.append({
                "date": draw["collected"][:10],
                "draw_id": draw["id"],
                "lab": draw.get("lab", ""),
                "panel": draw.get("panels", ""),
                "test": v["test"],
                "result": v.get("result") or v.get("result_text"),
                "unit": v.get("unit", ""),
                "ref_low": v.get("ref_low"),
                "ref_high": v.get("ref_high"),
                "flag": v.get("flag") or "",
            })
    csv_path = HEALTH_DATA / "labs" / "master_export.csv"
    if rows:
        with csv_path.open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)


def _auto_update_screening(draw: dict):
    collected = draw["collected"][:10]
    blob = " ".join(
        [draw.get("lab", "")]
        + list(draw.get("panels") or [])
        + [v["test"] for v in draw.get("values", [])]
    ).lower()
    updated = []
    for pattern, test_name in SCREENING_TRIGGERS:
        if re.search(pattern, blob, re.I):
            if mark_test_done(test_name, collected):
                updated.append(test_name)
    return updated


def _sync_screening_reasons(draw: dict):
    """Update screening notes when latest labs improve."""
    from .lab_glossary import explain_value

    by_test = {v["test"]: v for v in draw.get("values", [])}

    lipid_parts = []
    for key in ("LDL Cholesterol", "Triglycerides", "Total Cholesterol"):
        if key in by_test:
            v = by_test[key]
            info = explain_value(v)
            short = key.replace(" Cholesterol", "").replace("Total ", "Total chol ")
            lipid_parts.append(f"{short} {v.get('result')} {info['status_badge']}")
    if lipid_parts:
        with get_conn() as conn:
            conn.execute(
                "UPDATE screening_schedule SET reason = ? WHERE test_name = ?",
                ("; ".join(lipid_parts), "Lipid panel (fasting)"),
            )

    if "Hemoglobin A1c" in by_test:
        v = by_test["Hemoglobin A1c"]
        info = explain_value(v)
        with get_conn() as conn:
            conn.execute(
                "UPDATE screening_schedule SET reason = ? WHERE test_name = ?",
                (f"A1c {v.get('result')}% {info['status_badge']}", "A1C"),
            )


def save_draw(draw: dict, pdf_path: Path | None = None) -> dict:
    """Insert or replace a lab draw. Returns summary for UI."""
    draw_id = _draw_id(draw)
    draw["id"] = draw_id
    draw_record = {
        "id": draw_id,
        "collected": draw["collected"],
        "lab": draw.get("lab"),
        "provider": draw.get("provider"),
        "panels": draw.get("panels", []),
        "values": draw["values"],
        "source": "pdf_import",
    }

    with get_conn() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO lab_draws (id, collected, lab, provider, panels, source)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                draw_id,
                draw["collected"],
                draw.get("lab"),
                draw.get("provider"),
                json.dumps(draw.get("panels", [])),
                "pdf_import",
            ),
        )
        conn.execute("DELETE FROM lab_values WHERE draw_id = ?", (draw_id,))
        for raw in draw["values"]:
            v = normalize_lab_value(raw)
            conn.execute(
                """INSERT INTO lab_values
                   (draw_id, test, result, result_text, unit, ref_low, ref_high, ref_text, flag)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    draw_id,
                    v["test"],
                    v.get("result"),
                    v.get("result_text"),
                    v.get("unit"),
                    v.get("ref_low"),
                    v.get("ref_high"),
                    v.get("ref_text"),
                    v.get("flag"),
                ),
            )

    (DRAWS_DIR / f"{draw_id}.json").write_text(json.dumps(draw_record, indent=2))
    _refresh_master_csv()

    doc_id = None
    if pdf_path and pdf_path.exists():
        dest = DOCUMENTS_DIR / pdf_path.name
        if pdf_path.resolve() != dest.resolve():
            dest.write_bytes(pdf_path.read_bytes())
        with get_conn() as conn:
            cur = conn.execute(
                """INSERT INTO documents (filename, path, doc_type, extracted_text, uploaded_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    pdf_path.name,
                    str(dest),
                    f"lab_pdf:{draw_id}",
                    json.dumps({"draw_id": draw_id, "tests": len(draw["values"])}),
                    datetime.now().isoformat(),
                ),
            )
            doc_id = cur.lastrowid

    screening_updated = _auto_update_screening(draw)
    _sync_screening_reasons(draw)
    return {
        "draw_id": draw_id,
        "collected": draw["collected"][:10],
        "lab": draw.get("lab"),
        "tests_imported": len(draw["values"]),
        "screening_updated": screening_updated,
        "document_id": doc_id,
    }


def import_lab_pdf(pdf_path: str | Path) -> dict:
    path = Path(pdf_path)
    text = extract_pdf_text(path)
    if len(text.strip()) < 50:
        raise ValueError("PDF looks empty — try a text-based lab report PDF, not a photo scan.")
    lower = text.lower()
    if any(k in lower for k in ("gynecol", "pap smear", "pap test", "hpv", "pelvic exam", "obgyn", "ob/gyn")):
        return import_gynecology_pdf(path, text)
    draw = parse_lab_pdf_text(text)
    return save_draw(draw, path)


def _detect_report_type(text: str) -> str:
    lower = text.lower()
    if any(k in lower for k in ("gynecol", "pap smear", "pap test", "hpv", "pelvic exam", "obgyn", "ob/gyn")):
        return "gynecology"
    return "blood"


def parse_gynecology_pdf_text(text: str) -> dict:
    from openai import OpenAI

    collected = _parse_date(text) or date.today().isoformat()
    ollama = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
    prompt = f"""Extract gynecology visit info from this report.
Return JSON only:
{{
  "collected": "YYYY-MM-DD",
  "provider": "doctor or clinic name",
  "title": "short visit title e.g. Annual gynecology exam",
  "items": [
    {{"label": "Pap smear", "value": "Normal", "note": "brief plain English"}},
    {{"label": "HPV", "value": "Negative", "note": ""}}
  ]
}}
Use simple section labels (Pap smear, HPV, Pelvic exam, etc.) — NOT diagnosis codes.

Report:
{text[:10000]}"""
    data = None
    try:
        resp = ollama.chat.completions.create(
            model="llama3",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )
        data = _parse_json_block(resp.choices[0].message.content or "")
    except Exception:
        pass
    if not data or not data.get("items"):
        items = []
        for label, pat in (
            ("Pap smear", r"pap[^\n]{0,40}?(normal|negative|abnormal|ascus)[^\n]*"),
            ("HPV", r"hpv[^\n]{0,30}?(negative|positive|not detected)[^\n]*"),
        ):
            m = re.search(pat, text, re.I)
            if m:
                items.append({"label": label, "value": m.group(0).strip()[:80], "note": ""})
        data = {
            "collected": collected,
            "provider": "Gynecologist",
            "title": "Gynecology visit",
            "items": items or [{"label": "Visit summary", "value": "See uploaded report", "note": ""}],
        }
    data["collected"] = (data.get("collected") or collected)[:10]
    return data


def import_gynecology_pdf(pdf_path: Path, text: str | None = None) -> dict:
    from .lab_sections import save_gynecology_report

    text = text or extract_pdf_text(pdf_path)
    parsed = parse_gynecology_pdf_text(text)
    report_id = f"gyn_{parsed['collected'].replace('-', '')}_{pdf_path.stem[:20]}"
    report_id = re.sub(r"[^a-z0-9_]", "_", report_id.lower())
    dest = DOCUMENTS_DIR / pdf_path.name
    if pdf_path.resolve() != dest.resolve():
        dest.write_bytes(pdf_path.read_bytes())

    report = {
        "id": report_id,
        "collected": parsed["collected"],
        "provider": parsed.get("provider") or "Gynecologist",
        "title": parsed.get("title") or "Gynecology visit",
        "items": parsed.get("items") or [],
        "pdf_filename": pdf_path.name,
    }
    save_gynecology_report(report)

    with get_conn() as conn:
        conn.execute(
            """INSERT INTO documents (filename, path, doc_type, extracted_text, uploaded_at)
               VALUES (?, ?, ?, ?, ?)""",
            (
                pdf_path.name,
                str(dest),
                f"gyn_pdf:{report_id}",
                json.dumps({"report_id": report_id}),
                datetime.now().isoformat(),
            ),
        )
    return {
        "report_id": report_id,
        "collected": parsed["collected"],
        "type": "gynecology",
        "items_imported": len(report["items"]),
    }


def import_health_pdf(pdf_path: str | Path) -> dict:
    """Auto-detect blood lab vs gynecology report."""
    path = Path(pdf_path)
    text = extract_pdf_text(path)
    if len(text.strip()) < 50:
        raise ValueError("PDF looks empty — try a text-based PDF, not a photo scan.")
    if _detect_report_type(text) == "gynecology":
        return import_gynecology_pdf(path, text)
    draw = parse_lab_pdf_text(text)
    return save_draw(draw, path)


def list_lab_documents(limit: int = 8) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT id, filename, path, doc_type, uploaded_at
               FROM documents WHERE doc_type LIKE 'lab_pdf:%'
               ORDER BY uploaded_at DESC LIMIT ?""",
            (limit,),
        ).fetchall()
    out = []
    for r in rows:
        draw_id = (r["doc_type"] or "").split(":", 1)[-1]
        out.append({
            "id": r["id"],
            "filename": r["filename"],
            "draw_id": draw_id,
            "uploaded_at": (r["uploaded_at"] or "")[:10],
        })
    return out
