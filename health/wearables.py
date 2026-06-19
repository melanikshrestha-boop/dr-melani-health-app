from __future__ import annotations

"""Wearable import — WHOOP raw metrics + Apple Health CSV. No vendor scores."""

import csv
import io
import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import requests

from .db import get_conn, today
from .paths import CONFIG_DIR, HEALTH_DATA
from .sleep import _week_start, week_key, week_range_label, week_start_from_key

WEARABLE_DIR = HEALTH_DATA / "wearables"
WHOOP_CONFIG = CONFIG_DIR / "whoop_config.json"
WHOOP_TOKENS = CONFIG_DIR / "whoop_tokens.json"

WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth"
WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"
WHOOP_API = "https://api.prod.whoop.com/developer/v1"

# Raw metrics only — never import recovery % or strain scores as health truth.
WHOOP_RAW_METRICS = {
    "resting_heart_rate": ("whoop", "rhr", "bpm"),
    "hrv_rmssd_milli": ("whoop", "hrv_rmssd", "ms"),
    "respiratory_rate": ("whoop", "respiratory_rate", "rpm"),
    "sleep_duration_hours": ("whoop", "sleep_hours", "h"),
    "skin_temp_celsius": ("whoop", "skin_temp_c", "C"),
}

APPLE_METRIC_MAP = {
    "stepcount": ("apple", "steps", "count"),
    "step count": ("apple", "steps", "count"),
    "activeenergyburned": ("apple", "active_energy", "kcal"),
    "active energy burned": ("apple", "active_energy", "kcal"),
    "heartrate": ("apple", "heart_rate", "bpm"),
    "heart rate": ("apple", "heart_rate", "bpm"),
    "restingheartrate": ("apple", "rhr", "bpm"),
    "resting heart rate": ("apple", "rhr", "bpm"),
    "heartratevariabilitysdnn": ("apple", "hrv_sdnn", "ms"),
    "heart rate variability": ("apple", "hrv_sdnn", "ms"),
    "sleepanalysis": ("apple", "sleep_hours", "h"),
    "sleep analysis": ("apple", "sleep_hours", "h"),
}


def _normalize_apple_type(raw: str) -> str:
    t = (raw or "").strip().lower()
    for prefix in ("hkquantitytypeidentifier", "hkcategorytypeidentifier"):
        if t.startswith(prefix):
            t = t[len(prefix):]
    return t.replace("_", "").replace(" ", "")


def _load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def _save_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))


def whoop_config() -> dict:
    return _load_json(WHOOP_CONFIG)


def save_whoop_config(client_id: str, client_secret: str, redirect_uri: str = ""):
    _save_json(
        WHOOP_CONFIG,
        {
            "client_id": client_id.strip(),
            "client_secret": client_secret.strip(),
            "redirect_uri": redirect_uri.strip() or "http://127.0.0.1:8781/data/wearables/whoop/callback",
        },
    )


def whoop_connected() -> bool:
    return bool(_load_json(WHOOP_TOKENS).get("access_token"))


def whoop_auth_url(state: str = "melani") -> str:
    cfg = whoop_config()
    cid = cfg.get("client_id", "")
    redirect = cfg.get("redirect_uri", "http://127.0.0.1:8781/data/wearables/whoop/callback")
    scopes = "read:recovery read:sleep read:cycles read:profile offline"
    return (
        f"{WHOOP_AUTH_URL}?client_id={cid}&response_type=code"
        f"&redirect_uri={requests.utils.quote(redirect, safe='')}"
        f"&scope={requests.utils.quote(scopes, safe='')}&state={state}"
    )


def whoop_exchange_code(code: str) -> dict:
    cfg = whoop_config()
    resp = requests.post(
        WHOOP_TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "client_id": cfg.get("client_id", ""),
            "client_secret": cfg.get("client_secret", ""),
            "redirect_uri": cfg.get("redirect_uri", ""),
        },
        timeout=30,
    )
    resp.raise_for_status()
    tokens = resp.json()
    _save_json(WHOOP_TOKENS, tokens)
    return tokens


def _whoop_headers() -> dict[str, str]:
    tokens = _load_json(WHOOP_TOKENS)
    access = tokens.get("access_token", "")
    if not access:
        raise RuntimeError("WHOOP not connected")
    return {"Authorization": f"Bearer {access}"}


def save_metric(day: str, source: str, metric: str, value: float | None, unit: str = "", value_text: str = ""):
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO wearable_metrics (day, source, metric, value, value_text, unit, imported_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(day, source, metric) DO UPDATE SET
                 value = excluded.value,
                 value_text = excluded.value_text,
                 unit = excluded.unit,
                 imported_at = excluded.imported_at""",
            (day, source, metric, value, value_text or None, unit or None, datetime.now().isoformat()),
        )


def get_metric(day: str, source: str, metric: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            """SELECT day, source, metric, value, value_text, unit, imported_at
               FROM wearable_metrics WHERE day = ? AND source = ? AND metric = ?""",
            (day, source, metric),
        ).fetchone()
    return dict(row) if row else None


def week_metrics(source: str, metric: str, week: str | None = None) -> dict:
    if week:
        start = week_start_from_key(week)
        wk = week_key(start)
    else:
        start = _week_start(date.today())
        wk = week_key(start)

    days = []
    values = []
    for i in range(7):
        d = start + timedelta(days=i)
        iso = d.isoformat()
        row = get_metric(iso, source, metric)
        val = row["value"] if row else None
        days.append({"day": iso, "label": d.strftime("%a"), "value": val})
        if val is not None:
            values.append(val)

    avg = round(sum(values) / len(values), 2) if values else None
    return {
        "week": wk,
        "week_label": week_range_label(start),
        "days": days,
        "average": avg,
        "logged_count": len(values),
    }


def sync_whoop(days_back: int = 7) -> dict[str, Any]:
    """Pull raw recovery + sleep fields from WHOOP API."""
    if not whoop_connected():
        return {"ok": False, "error": "WHOOP not connected"}

    end = date.today()
    start = end - timedelta(days=max(1, days_back) - 1)
    imported = 0
    errors: list[str] = []

    try:
        resp = requests.get(
            f"{WHOOP_API}/recovery",
            headers=_whoop_headers(),
            params={
                "start": start.isoformat(),
                "end": end.isoformat(),
            },
            timeout=30,
        )
        if resp.status_code == 401:
            return {"ok": False, "error": "WHOOP token expired — reconnect"}
        resp.raise_for_status()
        body = resp.json()
        records = body.get("records") if isinstance(body, dict) else body
        if records is None and isinstance(body, list):
            records = body
    except requests.RequestException as exc:
        return {"ok": False, "error": str(exc)}

    for rec in records or []:
        try:
            created = (rec.get("created_at") or rec.get("sleep_id") or "")[:10]
            if not created:
                continue
            score = rec.get("score") or {}
            rhr = score.get("resting_heart_rate")
            hrv = score.get("hrv_rmssd_milli")
            resp_rate = score.get("respiratory_rate")
            if rhr is not None:
                save_metric(created, "whoop", "rhr", float(rhr), "bpm")
                imported += 1
            if hrv is not None:
                save_metric(created, "whoop", "hrv_rmssd", float(hrv), "ms")
                imported += 1
            if resp_rate is not None:
                save_metric(created, "whoop", "respiratory_rate", float(resp_rate), "rpm")
                imported += 1
        except (TypeError, ValueError) as exc:
            errors.append(str(exc))

    try:
        sresp = requests.get(
            f"{WHOOP_API}/activity/sleep",
            headers=_whoop_headers(),
            params={"start": start.isoformat(), "end": end.isoformat()},
            timeout=30,
        )
        sresp.raise_for_status()
        sleeps = sresp.json().get("records") or []
        for srec in sleeps:
            day = (srec.get("start") or "")[:10]
            score = srec.get("score") or {}
            stage = score.get("stage_summary") or {}
            total_ms = stage.get("total_in_bed_time_milli") or stage.get("total_sleep_time_milli")
            if day and total_ms:
                hours = round(float(total_ms) / 3_600_000, 2)
                save_metric(day, "whoop", "sleep_hours", hours, "h")
                imported += 1
    except requests.RequestException as exc:
        errors.append(f"sleep: {exc}")

    _save_json(WEARABLE_DIR / "whoop_last_sync.json", {"at": datetime.now().isoformat(), "imported": imported})
    return {"ok": True, "imported": imported, "errors": errors}


def import_apple_health_csv(content: str | bytes) -> dict[str, Any]:
    """Parse Apple Health export CSV (Health app → Export). Aggregates by day."""
    text = content.decode("utf-8", errors="replace") if isinstance(content, bytes) else content
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return {"ok": False, "error": "Empty CSV"}

    # Normalize headers
    field_map = {f.lower().strip(): f for f in reader.fieldnames}
    type_key = field_map.get("type") or field_map.get("Type")
    value_key = field_map.get("value") or field_map.get("Value")
    start_key = field_map.get("startdate") or field_map.get("start") or field_map.get("StartDate")
    if not type_key or not start_key:
        return {"ok": False, "error": "Not an Apple Health CSV — missing Type/StartDate columns"}

    daily: dict[tuple[str, str, str], float] = {}
    sleep_ms: dict[str, float] = {}
    imported = 0

    for row in reader:
        raw_type = (row.get(type_key) or "").strip()
        norm = _normalize_apple_type(raw_type)
        mapped = APPLE_METRIC_MAP.get(norm) or APPLE_METRIC_MAP.get(raw_type.lower().strip())
        if not mapped:
            continue
        source, metric, unit = mapped
        day = (row.get(start_key) or "")[:10]
        if not day or len(day) < 10:
            continue

        if metric == "sleep_hours":
            end_key = field_map.get("enddate") or field_map.get("end") or field_map.get("EndDate")
            try:
                start_dt = datetime.fromisoformat(row.get(start_key, "").replace("Z", "+00:00"))
                end_dt = datetime.fromisoformat((row.get(end_key) or row.get(start_key, "")).replace("Z", "+00:00"))
                sleep_ms[day] = sleep_ms.get(day, 0) + max(0, (end_dt - start_dt).total_seconds() * 1000)
            except (ValueError, TypeError):
                continue
            continue

        try:
            val = float(row.get(value_key) or 0)
        except (TypeError, ValueError):
            continue
        key = (day, source, metric)
        daily[key] = daily.get(key, 0) + val

    for (day, source, metric), val in daily.items():
        _, _, unit = next(v for k, v in APPLE_METRIC_MAP.items() if v[1] == metric)
        save_metric(day, source, metric, round(val, 2), unit)
        imported += 1

    for day, ms in sleep_ms.items():
        hours = round(ms / 3_600_000, 2)
        save_metric(day, "apple", "sleep_hours", hours, "h")
        imported += 1

    _save_json(
        WEARABLE_DIR / "apple_last_import.json",
        {"at": datetime.now().isoformat(), "rows": imported},
    )
    return {"ok": True, "imported": imported}


def status() -> dict:
    whoop = whoop_connected()
    last_whoop = _load_json(WEARABLE_DIR / "whoop_last_sync.json")
    last_apple = _load_json(WEARABLE_DIR / "apple_last_import.json")
    hrv_week = week_metrics("whoop", "hrv_rmssd")
    rhr_week = week_metrics("whoop", "rhr")
    steps_week = week_metrics("apple", "steps")
    return {
        "whoop_connected": whoop,
        "whoop_configured": bool(whoop_config().get("client_id")),
        "whoop_last_sync": last_whoop.get("at"),
        "apple_last_import": last_apple.get("at"),
        "hrv_week_avg": hrv_week.get("average"),
        "rhr_week_avg": rhr_week.get("average"),
        "steps_week_total": sum(d["value"] or 0 for d in steps_week.get("days", [])),
    }


def context_block() -> str:
    st = status()
    lines = ["=== WEARABLES (raw metrics only — no Recovery/Strain scores) ==="]
    lines.append(f"WHOOP connected: {'yes' if st['whoop_connected'] else 'no'}")
    if st.get("whoop_last_sync"):
        lines.append(f"WHOOP last sync: {st['whoop_last_sync'][:16]}")
    if st.get("hrv_week_avg"):
        lines.append(f"WHOOP HRV RMSSD 7-day avg: {st['hrv_week_avg']} ms")
    if st.get("rhr_week_avg"):
        lines.append(f"WHOOP resting HR 7-day avg: {st['rhr_week_avg']} bpm")
    if st.get("apple_last_import"):
        lines.append(f"Apple Health last import: {st['apple_last_import'][:16]}")
    today_hrv = get_metric(today(), "whoop", "hrv_rmssd")
    if today_hrv and today_hrv.get("value"):
        lines.append(f"Latest WHOOP HRV: {today_hrv['value']} ms ({today_hrv['day']})")
    return "\n".join(lines)
