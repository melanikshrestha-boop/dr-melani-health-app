"""Enhanced WHOOP integration - Recovery, Strain, Sleep, HRV, RHR."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, date
from typing import Optional, Dict, Any, List

import requests

from .db import get_conn
from .paths import HEALTH_DATA


WHOOP_API = "https://api.whoop.com/developer/v1"


class WHOOPClient:
    """Client for WHOOP API v1."""

    def __init__(self, token: Optional[str] = None):
        self.token = token or self._load_token()
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _load_token() -> str:
        """Load WHOOP token from file."""
        import os
        token = os.environ.get("WHOOP_API_TOKEN", "")
        if token:
            return token

        token_file = HEALTH_DATA / "whoop" / "token.json"
        if token_file.exists():
            try:
                data = json.loads(token_file.read_text())
                return data.get("token", "")
            except Exception:
                pass
        return ""

    def _get(self, endpoint: str, **params) -> Dict[str, Any]:
        """Make GET request to WHOOP API."""
        if not self.token:
            return {"error": "WHOOP_API_TOKEN not set"}

        try:
            url = f"{WHOOP_API}/{endpoint}"
            resp = requests.get(url, headers=self.headers, params=params, timeout=10)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            return {"error": str(e)}

    def get_recovery(self, start: str, end: str) -> List[Dict]:
        """Get recovery data for date range."""
        data = self._get("recovery", start=start, end=end)
        return data.get("records", [])

    def get_strain(self, start: str, end: str) -> List[Dict]:
        """Get strain data for date range."""
        data = self._get("activity/strain", start=start, end=end)
        return data.get("records", [])

    def get_sleep(self, start: str, end: str) -> List[Dict]:
        """Get sleep data for date range."""
        data = self._get("activity/sleep", start=start, end=end)
        return data.get("records", [])

    def get_heart_rate(self, start: str, end: str) -> List[Dict]:
        """Get heart rate data for date range."""
        data = self._get("metric/heart_rate", start=start, end=end)
        return data.get("records", [])

    def get_hrv(self, start: str, end: str) -> List[Dict]:
        """Get HRV (Heart Rate Variability) data."""
        data = self._get("metric/hrv", start=start, end=end)
        return data.get("records", [])

    def get_body_metrics(self, start: str, end: str) -> List[Dict]:
        """Get body metrics (temp, respiratory rate)."""
        data = self._get("metric/body", start=start, end=end)
        return data.get("records", [])

    def get_resting_heart_rate(self, start: str, end: str) -> List[Dict]:
        """Get resting heart rate."""
        data = self._get("metric/resting_heart_rate", start=start, end=end)
        return data.get("records", [])


def sync_all_whoop_data(days: int = 90) -> Dict[str, Any]:
    """Sync all WHOOP data for past N days."""
    client = WHOOPClient()
    if "error" in client._get(""):
        return {"error": "WHOOP API token not configured"}

    end = datetime.now().isoformat()
    start = (datetime.now() - timedelta(days=days)).isoformat()

    recovery = client.get_recovery(start, end)
    strain = client.get_strain(start, end)
    sleep = client.get_sleep(start, end)
    hrv = client.get_hrv(start, end)
    rhr = client.get_resting_heart_rate(start, end)

    # Store in database
    _store_whoop_data(recovery, strain, sleep, hrv, rhr)

    return {
        "recovery": recovery,
        "strain": strain,
        "sleep": sleep,
        "hrv": hrv,
        "resting_heart_rate": rhr,
        "synced_at": datetime.now().isoformat()
    }


def _store_whoop_data(recovery, strain, sleep, hrv, rhr):
    """Store WHOOP data in database."""
    with get_conn() as conn:
        # Create tables
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS whoop_recovery (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT UNIQUE,
                recovery_score REAL,
                resting_heart_rate INTEGER,
                hrv_balance REAL,
                sleep_performance REAL,
                notes TEXT,
                synced_at TEXT
            );

            CREATE TABLE IF NOT EXISTS whoop_strain (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT UNIQUE,
                strain_score REAL,
                kilojoules REAL,
                average_heart_rate INTEGER,
                max_heart_rate INTEGER,
                synced_at TEXT
            );

            CREATE TABLE IF NOT EXISTS whoop_sleep (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT UNIQUE,
                duration_hours REAL,
                quality_percent REAL,
                sleep_debt_ms INTEGER,
                bedtime TEXT,
                wake_time TEXT,
                synced_at TEXT
            );

            CREATE TABLE IF NOT EXISTS whoop_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT,
                metric_type TEXT,
                value REAL,
                unit TEXT,
                synced_at TEXT
            );
        """)

        # Insert recovery data
        for rec in recovery:
            days_data = rec.get("days", [{}])[0]
            date_str = days_data.get("calendar_date")
            if date_str:
                conn.execute(
                    """INSERT OR REPLACE INTO whoop_recovery
                       (date, recovery_score, resting_heart_rate, hrv_balance, sleep_performance, synced_at)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        date_str,
                        days_data.get("recovery_score"),
                        days_data.get("resting_heart_rate"),
                        days_data.get("hrv_balance"),
                        days_data.get("sleep_performance"),
                        datetime.now().isoformat()
                    )
                )

        # Insert strain data
        for s in strain:
            days_data = s.get("days", [{}])[0]
            date_str = days_data.get("calendar_date")
            if date_str:
                conn.execute(
                    """INSERT OR REPLACE INTO whoop_strain
                       (date, strain_score, kilojoules, average_heart_rate, max_heart_rate, synced_at)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        date_str,
                        days_data.get("strain_score"),
                        s.get("kilojoules"),
                        days_data.get("average_heart_rate"),
                        days_data.get("max_heart_rate"),
                        datetime.now().isoformat()
                    )
                )

        # Insert sleep data
        for s in sleep:
            days_data = s.get("days", [{}])[0]
            date_str = days_data.get("calendar_date")
            if date_str:
                conn.execute(
                    """INSERT OR REPLACE INTO whoop_sleep
                       (date, duration_hours, quality_percent, sleep_debt_ms, bedtime, wake_time, synced_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        date_str,
                        s.get("duration_ms", 0) / 1000 / 3600,
                        days_data.get("sleep_quality_percent"),
                        days_data.get("sleep_debt_ms"),
                        days_data.get("bedtime_start_time"),
                        days_data.get("bedtime_end_time"),
                        datetime.now().isoformat()
                    )
                )


def get_whoop_dashboard(days: int = 30) -> Dict[str, Any]:
    """Get comprehensive WHOOP dashboard."""
    with get_conn() as conn:
        # Get recovery data
        recovery = conn.execute(
            """SELECT * FROM whoop_recovery
               WHERE date >= date('now', ?)
               ORDER BY date DESC LIMIT ?""",
            (f"-{days} days", days)
        ).fetchall()

        # Get strain data
        strain = conn.execute(
            """SELECT * FROM whoop_strain
               WHERE date >= date('now', ?)
               ORDER BY date DESC LIMIT ?""",
            (f"-{days} days", days)
        ).fetchall()

        # Get sleep data
        sleep = conn.execute(
            """SELECT * FROM whoop_sleep
               WHERE date >= date('now', ?)
               ORDER BY date DESC LIMIT ?""",
            (f"-{days} days", days)
        ).fetchall()

        # Calculate averages
        recovery_avg = sum(r["recovery_score"] or 0 for r in recovery) / len(recovery) if recovery else 0
        strain_avg = sum(s["strain_score"] or 0 for s in strain) / len(strain) if strain else 0
        sleep_avg = sum(s["duration_hours"] or 0 for s in sleep) / len(sleep) if sleep else 0

        return {
            "period_days": days,
            "recovery": {
                "data": [dict(r) for r in recovery],
                "average": round(recovery_avg, 1)
            },
            "strain": {
                "data": [dict(s) for s in strain],
                "average": round(strain_avg, 1)
            },
            "sleep": {
                "data": [dict(s) for s in sleep],
                "average_hours": round(sleep_avg, 1)
            }
        }


def get_whoop_for_date(date_str: str) -> Dict[str, Any]:
    """Get all WHOOP data for a specific date."""
    with get_conn() as conn:
        recovery = conn.execute(
            "SELECT * FROM whoop_recovery WHERE date = ?", (date_str,)
        ).fetchone()
        strain = conn.execute(
            "SELECT * FROM whoop_strain WHERE date = ?", (date_str,)
        ).fetchone()
        sleep = conn.execute(
            "SELECT * FROM whoop_sleep WHERE date = ?", (date_str,)
        ).fetchone()

        return {
            "date": date_str,
            "recovery": dict(recovery) if recovery else None,
            "strain": dict(strain) if strain else None,
            "sleep": dict(sleep) if sleep else None
        }


def get_whoop_context_for_appointment(appointment_date: str) -> str:
    """Get WHOOP context for an appointment date."""
    data = get_whoop_for_date(appointment_date)

    if not any([data["recovery"], data["strain"], data["sleep"]]):
        return "No WHOOP data available for this date"

    lines = ["📊 Your Health That Day:"]

    if data["recovery"]:
        r = data["recovery"]
        lines.append(f"  Recovery: {r.get('recovery_score', 'N/A')}% | RHR: {r.get('resting_heart_rate')} bpm")

    if data["strain"]:
        s = data["strain"]
        lines.append(f"  Strain: {s.get('strain_score', 'N/A')} | Max HR: {s.get('max_heart_rate')} bpm")

    if data["sleep"]:
        sl = data["sleep"]
        lines.append(f"  Sleep: {sl.get('duration_hours', 0):.1f}h | Quality: {sl.get('quality_percent', 'N/A')}%")

    return "\n".join(lines)


def link_whoop_to_appointment(appointment_id: str, date: str) -> bool:
    """Link WHOOP data to an appointment."""
    with get_conn() as conn:
        conn.execute(
            """INSERT OR IGNORE INTO appointment_whoop_links (appointment_id, whoop_date, linked_at)
               VALUES (?, ?, ?)""",
            (appointment_id, date, datetime.now().isoformat())
        )
    return True


def get_whoop_trends(metric: str = "recovery", days: int = 90) -> Dict[str, Any]:
    """Get trends for WHOOP metric over time."""
    with get_conn() as conn:
        if metric == "recovery":
            rows = conn.execute(
                """SELECT date, recovery_score FROM whoop_recovery
                   WHERE date >= date('now', ?)
                   ORDER BY date""",
                (f"-{days} days",)
            ).fetchall()
            key = "recovery_score"
        elif metric == "strain":
            rows = conn.execute(
                """SELECT date, strain_score FROM whoop_strain
                   WHERE date >= date('now', ?)
                   ORDER BY date""",
                (f"-{days} days",)
            ).fetchall()
            key = "strain_score"
        else:  # sleep
            rows = conn.execute(
                """SELECT date, duration_hours FROM whoop_sleep
                   WHERE date >= date('now', ?)
                   ORDER BY date""",
                (f"-{days} days",)
            ).fetchall()
            key = "duration_hours"

        values = [r[key] for r in rows if r[key] is not None]
        dates = [r["date"] for r in rows if r[key] is not None]

        return {
            "metric": metric,
            "days": days,
            "dates": dates,
            "values": values,
            "average": sum(values) / len(values) if values else 0,
            "min": min(values) if values else 0,
            "max": max(values) if values else 0,
            "trend": "up" if values and values[-1] > values[0] else "flat"
        }
