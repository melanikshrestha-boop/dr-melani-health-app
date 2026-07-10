"""Apple Watch/Health data integration via HealthKit."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, date
from typing import Optional, Dict, Any, List
from pathlib import Path

from .db import get_conn
from .paths import HEALTH_DATA


class AppleHealthKit:
    """Import and manage Apple Health data."""

    EXPORT_DIR = HEALTH_DATA / "apple_health"

    @staticmethod
    def import_health_export(xml_file_path: str | Path) -> Dict[str, Any]:
        """Import Apple Health XML export file."""
        try:
            from xml.etree import ElementTree as ET
        except ImportError:
            return {"error": "XML parser not available"}

        AppleHealthKit.EXPORT_DIR.mkdir(parents=True, exist_ok=True)

        try:
            tree = ET.parse(xml_file_path)
            root = tree.getroot()

            # Parse all health records
            records = {
                "heart_rate": [],
                "heart_rate_variability": [],
                "sleep": [],
                "steps": [],
                "calories": [],
                "workouts": [],
                "blood_oxygen": [],
                "body_temperature": [],
                "respiratory_rate": [],
                "ecg": [],
                "walking_speed": [],
                "cycling": [],
                "other": []
            }

            for record in root.findall(".//Record"):
                record_type = record.get("type", "").split("/")[-1]
                value = record.get("value", "")
                start_date = record.get("startDate", "")
                end_date = record.get("endDate", "")
                source = record.get("sourceName", "")

                data_point = {
                    "type": record_type,
                    "value": value,
                    "start_date": start_date,
                    "end_date": end_date,
                    "source": source,
                    "metadata": {k: v for k, v in record.attrib.items() if k not in ["type", "value", "startDate", "endDate", "sourceName"]}
                }

                # Categorize
                if "HeartRate" in record_type:
                    records["heart_rate"].append(data_point)
                elif "HRV" in record_type:
                    records["heart_rate_variability"].append(data_point)
                elif "Sleep" in record_type:
                    records["sleep"].append(data_point)
                elif "Step" in record_type:
                    records["steps"].append(data_point)
                elif "Calorie" in record_type or "EnergyBurned" in record_type:
                    records["calories"].append(data_point)
                elif "Workout" in record_type:
                    records["workouts"].append(data_point)
                elif "BloodOxygen" in record_type or "SpO2" in record_type:
                    records["blood_oxygen"].append(data_point)
                elif "Temperature" in record_type:
                    records["body_temperature"].append(data_point)
                elif "RespiratoryRate" in record_type:
                    records["respiratory_rate"].append(data_point)
                elif "ECG" in record_type:
                    records["ecg"].append(data_point)
                elif "WalkingSpeed" in record_type:
                    records["walking_speed"].append(data_point)
                elif "Cycling" in record_type:
                    records["cycling"].append(data_point)
                else:
                    records["other"].append(data_point)

            # Store in database
            AppleHealthKit._store_health_data(records)

            return {
                "ok": True,
                "imported": sum(len(v) for v in records.values()),
                "records_by_type": {k: len(v) for k, v in records.items() if v}
            }

        except Exception as e:
            return {"error": f"Failed to parse Apple Health export: {str(e)}"}

    @staticmethod
    def _store_health_data(records: Dict[str, List[Dict]]):
        """Store Apple Health data in database."""
        with get_conn() as conn:
            # Create tables
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS apple_heart_rate (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT,
                    bpm INTEGER,
                    source TEXT,
                    recorded_at TEXT,
                    UNIQUE(date, bpm)
                );

                CREATE TABLE IF NOT EXISTS apple_hrv (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT UNIQUE,
                    hrv_value REAL,
                    unit TEXT,
                    source TEXT,
                    recorded_at TEXT
                );

                CREATE TABLE IF NOT EXISTS apple_sleep (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT UNIQUE,
                    duration_hours REAL,
                    sleep_type TEXT,
                    source TEXT,
                    recorded_at TEXT
                );

                CREATE TABLE IF NOT EXISTS apple_steps (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT UNIQUE,
                    step_count INTEGER,
                    source TEXT,
                    recorded_at TEXT
                );

                CREATE TABLE IF NOT EXISTS apple_calories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT UNIQUE,
                    calories REAL,
                    source TEXT,
                    recorded_at TEXT
                );

                CREATE TABLE IF NOT EXISTS apple_workouts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT,
                    workout_type TEXT,
                    duration_min REAL,
                    calories REAL,
                    distance_km REAL,
                    source TEXT,
                    recorded_at TEXT
                );

                CREATE TABLE IF NOT EXISTS apple_blood_oxygen (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT,
                    spo2_percent REAL,
                    source TEXT,
                    recorded_at TEXT
                );

                CREATE TABLE IF NOT EXISTS apple_temperature (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT,
                    temp_celsius REAL,
                    source TEXT,
                    recorded_at TEXT
                );

                CREATE TABLE IF NOT EXISTS apple_respiratory_rate (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT,
                    breaths_per_min REAL,
                    source TEXT,
                    recorded_at TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_heart_rate_date ON apple_heart_rate(date);
                CREATE INDEX IF NOT EXISTS idx_steps_date ON apple_steps(date);
                CREATE INDEX IF NOT EXISTS idx_workouts_date ON apple_workouts(date);
            """)

            # Insert data
            now = datetime.now().isoformat()

            for hr in records.get("heart_rate", []):
                try:
                    date_str = hr["start_date"][:10] if hr["start_date"] else None
                    if date_str:
                        conn.execute(
                            "INSERT OR IGNORE INTO apple_heart_rate (date, bpm, source, recorded_at) VALUES (?, ?, ?, ?)",
                            (date_str, int(float(hr["value"])), hr["source"], now)
                        )
                except (ValueError, KeyError):
                    pass

            for hrv in records.get("heart_rate_variability", []):
                try:
                    date_str = hrv["start_date"][:10] if hrv["start_date"] else None
                    if date_str:
                        conn.execute(
                            "INSERT OR IGNORE INTO apple_hrv (date, hrv_value, unit, source, recorded_at) VALUES (?, ?, ?, ?, ?)",
                            (date_str, float(hrv["value"]), "ms", hrv["source"], now)
                        )
                except (ValueError, KeyError):
                    pass

            for step in records.get("steps", []):
                try:
                    date_str = step["start_date"][:10] if step["start_date"] else None
                    if date_str:
                        conn.execute(
                            "INSERT OR IGNORE INTO apple_steps (date, step_count, source, recorded_at) VALUES (?, ?, ?, ?)",
                            (date_str, int(float(step["value"])), step["source"], now)
                        )
                except (ValueError, KeyError):
                    pass

            for cal in records.get("calories", []):
                try:
                    date_str = cal["start_date"][:10] if cal["start_date"] else None
                    if date_str:
                        conn.execute(
                            "INSERT OR IGNORE INTO apple_calories (date, calories, source, recorded_at) VALUES (?, ?, ?, ?)",
                            (date_str, float(cal["value"]), cal["source"], now)
                        )
                except (ValueError, KeyError):
                    pass

            for workout in records.get("workouts", []):
                try:
                    date_str = workout["start_date"][:10] if workout["start_date"] else None
                    if date_str:
                        conn.execute(
                            "INSERT INTO apple_workouts (date, workout_type, duration_min, source, recorded_at) VALUES (?, ?, ?, ?, ?)",
                            (date_str, workout["type"], 30, workout["source"], now)
                        )
                except (ValueError, KeyError):
                    pass

            for spo2 in records.get("blood_oxygen", []):
                try:
                    date_str = spo2["start_date"][:10] if spo2["start_date"] else None
                    if date_str:
                        conn.execute(
                            "INSERT INTO apple_blood_oxygen (date, spo2_percent, source, recorded_at) VALUES (?, ?, ?, ?)",
                            (date_str, float(spo2["value"]), spo2["source"], now)
                        )
                except (ValueError, KeyError):
                    pass


def get_apple_health_dashboard(days: int = 30) -> Dict[str, Any]:
    """Get comprehensive Apple Health dashboard."""
    with get_conn() as conn:
        # Heart rate
        hr_data = conn.execute(
            "SELECT date, AVG(CAST(bpm AS REAL)) as avg_bpm FROM apple_heart_rate WHERE date >= date('now', ?) GROUP BY date ORDER BY date DESC LIMIT ?",
            (f"-{days} days", days)
        ).fetchall()

        # Steps
        steps_data = conn.execute(
            "SELECT date, step_count FROM apple_steps WHERE date >= date('now', ?) ORDER BY date DESC LIMIT ?",
            (f"-{days} days", days)
        ).fetchall()

        # Calories
        cal_data = conn.execute(
            "SELECT date, calories FROM apple_calories WHERE date >= date('now', ?) ORDER BY date DESC LIMIT ?",
            (f"-{days} days", days)
        ).fetchall()

        # Workouts
        workout_data = conn.execute(
            "SELECT date, workout_type, duration_min FROM apple_workouts WHERE date >= date('now', ?) ORDER BY date DESC LIMIT ?",
            (f"-{days} days", days)
        ).fetchall()

        # Blood oxygen
        spo2_data = conn.execute(
            "SELECT date, AVG(CAST(spo2_percent AS REAL)) as avg_spo2 FROM apple_blood_oxygen WHERE date >= date('now', ?) GROUP BY date ORDER BY date DESC LIMIT ?",
            (f"-{days} days", days)
        ).fetchall()

        return {
            "period_days": days,
            "heart_rate": [dict(r) for r in hr_data],
            "steps": [dict(r) for r in steps_data],
            "calories": [dict(r) for r in cal_data],
            "workouts": [dict(r) for r in workout_data],
            "blood_oxygen": [dict(r) for r in spo2_data]
        }


def get_apple_health_for_date(date_str: str) -> Dict[str, Any]:
    """Get all Apple Health data for a specific date."""
    with get_conn() as conn:
        hr = conn.execute(
            "SELECT AVG(CAST(bpm AS REAL)) as avg_bpm, MIN(bpm) as min_bpm, MAX(bpm) as max_bpm FROM apple_heart_rate WHERE date = ?",
            (date_str,)
        ).fetchone()

        steps = conn.execute(
            "SELECT step_count FROM apple_steps WHERE date = ?",
            (date_str,)
        ).fetchone()

        calories = conn.execute(
            "SELECT calories FROM apple_calories WHERE date = ?",
            (date_str,)
        ).fetchone()

        workouts = conn.execute(
            "SELECT workout_type, duration_min FROM apple_workouts WHERE date = ?",
            (date_str,)
        ).fetchall()

        spo2 = conn.execute(
            "SELECT AVG(CAST(spo2_percent AS REAL)) as avg_spo2 FROM apple_blood_oxygen WHERE date = ?",
            (date_str,)
        ).fetchone()

        return {
            "date": date_str,
            "heart_rate": dict(hr) if hr else None,
            "steps": dict(steps) if steps else None,
            "calories": dict(calories) if calories else None,
            "workouts": [dict(w) for w in workouts],
            "blood_oxygen": dict(spo2) if spo2 else None
        }


def get_activity_level(date_str: str) -> str:
    """Determine activity level for a date (low, moderate, high)."""
    data = get_apple_health_for_date(date_str)

    if not data.get("steps"):
        return "no_data"

    step_count = data["steps"].get("step_count", 0)

    if step_count < 3000:
        return "low"
    elif step_count < 8000:
        return "moderate"
    else:
        return "high"


def get_daily_summary(date_str: str) -> Dict[str, Any]:
    """Get complete daily health summary from all sources."""
    data = get_apple_health_for_date(date_str)

    summary = {
        "date": date_str,
        "activity": get_activity_level(date_str),
        "metrics": {
            "heart_rate": data.get("heart_rate"),
            "steps": data.get("steps", {}).get("step_count"),
            "calories": data.get("calories", {}).get("calories"),
            "blood_oxygen": data.get("blood_oxygen", {}).get("avg_spo2"),
            "workouts": len(data.get("workouts", []))
        },
        "status": {}
    }

    # Add status indicators
    hr = data.get("heart_rate")
    if hr and hr.get("avg_bpm"):
        avg_bpm = hr["avg_bpm"]
        if avg_bpm < 60:
            summary["status"]["heart_rate"] = "low"
        elif avg_bpm > 100:
            summary["status"]["heart_rate"] = "elevated"
        else:
            summary["status"]["heart_rate"] = "normal"

    spo2 = data.get("blood_oxygen")
    if spo2 and spo2.get("avg_spo2"):
        if spo2["avg_spo2"] < 95:
            summary["status"]["blood_oxygen"] = "low"

    return summary
