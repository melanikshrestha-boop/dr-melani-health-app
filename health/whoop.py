"""Whoop sleep and recovery tracking integration."""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from pathlib import Path

import requests

from .db import get_conn, today
from .paths import HEALTH_DATA

WHOOP_API_BASE = "https://api.whoop.com/developer/v1"
WHOOP_SLEEP_DIR = HEALTH_DATA / "whoop"
WHOOP_TOKEN_FILE = WHOOP_SLEEP_DIR / "token.json"


def _get_api_token() -> str:
    """Get Whoop API token from environment or stored file."""
    token = os.environ.get("WHOOP_API_TOKEN")
    if token:
        return token

    # Try loading from file if it exists
    if WHOOP_TOKEN_FILE.exists():
        try:
            data = json.loads(WHOOP_TOKEN_FILE.read_text())
            return data.get("token", "")
        except (json.JSONDecodeError, OSError):
            pass

    return ""


def _headers() -> dict:
    """Get headers for Whoop API requests."""
    token = _get_api_token()
    if not token:
        return {}
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def fetch_sleep_data(days_back: int = 7) -> list[dict]:
    """Fetch sleep data from Whoop for the past N days."""
    token = _get_api_token()
    if not token:
        return [{"error": "WHOOP_API_TOKEN not configured. Set it in your environment or call set_whoop_token()"}]

    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)

        params = {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        }

        response = requests.get(
            f"{WHOOP_API_BASE}/activity/sleep",
            headers=_headers(),
            params=params,
            timeout=10
        )
        response.raise_for_status()

        data = response.json()
        sleep_records = data.get("records", [])

        # Store in database and local files
        _store_sleep_records(sleep_records)

        return sleep_records
    except requests.RequestException as e:
        return [{"error": f"Failed to fetch Whoop data: {str(e)}"}]


def get_today_sleep() -> dict | None:
    """Get today's sleep data from Whoop."""
    records = fetch_sleep_data(days_back=1)
    if not records or "error" in records[0]:
        return None

    for record in records:
        if record.get("days", [{}])[0].get("calendar_date") == today():
            return record

    return records[0] if records else None


def get_sleep_summary(days: int = 7) -> dict:
    """Get sleep summary for the past N days."""
    records = fetch_sleep_data(days_back=days)

    if not records or "error" in records[0]:
        return {
            "error": records[0].get("error", "No sleep data available") if records else "No sleep data"
        }

    sleep_stats = {
        "total_nights": len(records),
        "avg_duration_hours": 0,
        "avg_quality_percent": 0,
        "nights": []
    }

    total_duration = 0
    total_quality = 0

    for record in records:
        day_data = record.get("days", [{}])[0]
        duration_secs = record.get("duration_ms", 0) / 1000 / 3600  # Convert to hours
        quality = day_data.get("sleep_quality_percent", 0)

        sleep_stats["nights"].append({
            "date": day_data.get("calendar_date"),
            "duration_hours": round(duration_secs, 1),
            "quality_percent": quality,
            "onset_latency_minutes": day_data.get("sleep_onset_latency", {}).get("value", 0),
        })

        total_duration += duration_secs
        total_quality += quality

    if records:
        sleep_stats["avg_duration_hours"] = round(total_duration / len(records), 1)
        sleep_stats["avg_quality_percent"] = round(total_quality / len(records), 1)

    return sleep_stats


def _store_sleep_records(records: list[dict]):
    """Store sleep records in database and local files."""
    WHOOP_SLEEP_DIR.mkdir(parents=True, exist_ok=True)

    with get_conn() as conn:
        # Create table if it doesn't exist
        conn.execute("""
            CREATE TABLE IF NOT EXISTS whoop_sleep (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT UNIQUE,
                duration_hours REAL,
                quality_percent INTEGER,
                recovery_percent INTEGER,
                data_json TEXT,
                synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        for record in records:
            day_data = record.get("days", [{}])[0]
            calendar_date = day_data.get("calendar_date")
            duration_ms = record.get("duration_ms", 0)
            duration_hours = duration_ms / 1000 / 3600
            quality = day_data.get("sleep_quality_percent", 0)
            recovery = day_data.get("recovery_percent", 0)

            if calendar_date:
                conn.execute("""
                    INSERT OR REPLACE INTO whoop_sleep
                    (date, duration_hours, quality_percent, recovery_percent, data_json)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    calendar_date,
                    round(duration_hours, 1),
                    quality,
                    recovery,
                    json.dumps(record)
                ))

                # Also store as JSON file
                file_path = WHOOP_SLEEP_DIR / f"{calendar_date}.json"
                file_path.write_text(json.dumps({
                    "date": calendar_date,
                    "duration_hours": round(duration_hours, 1),
                    "quality_percent": quality,
                    "recovery_percent": recovery,
                    "full_data": record
                }, indent=2))


def set_whoop_token(token: str):
    """Store Whoop API token."""
    WHOOP_SLEEP_DIR.mkdir(parents=True, exist_ok=True)
    WHOOP_TOKEN_FILE.write_text(json.dumps({"token": token}, indent=2))


def context_block() -> str:
    """Get sleep context for the agent."""
    summary = get_sleep_summary(days=7)

    if "error" in summary:
        return f"=== SLEEP (WHOOP) ===\n{summary['error']}\nTo fix: set WHOOP_API_TOKEN environment variable"

    lines = [
        "=== SLEEP (WHOOP) ===",
        f"Last 7 nights average: {summary['avg_duration_hours']}h, {summary['avg_quality_percent']}% quality"
    ]

    if summary["nights"]:
        latest = summary["nights"][-1]
        lines.append(f"Most recent: {latest['date']} - {latest['duration_hours']}h, {latest['quality_percent']}% quality")

    return "\n".join(lines)
