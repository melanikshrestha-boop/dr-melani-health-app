"""Integration with major lab providers: Quest, LabCorp, NYU, Sonora, etc."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from pathlib import Path

from .db import get_conn
from .paths import HEALTH_DATA


LAB_PROVIDERS = {
    "quest": {
        "name": "Quest Diagnostics",
        "url": "https://www.questdiagnostics.com",
        "patient_portal": "https://www.questdiagnostics.com/account/login"
    },
    "labcorp": {
        "name": "LabCorp",
        "url": "https://www.labcorp.com",
        "patient_portal": "https://www.labcorp.com/patient-login"
    },
    "nyu": {
        "name": "NYU Labs",
        "url": "https://www.nyuhealth.org",
        "patient_portal": "https://www.nyuhealth.org"
    },
    "sonora": {
        "name": "Sonora Quest Laboratories",
        "url": "https://www.sonoraquest.com",
        "patient_portal": "https://www.sonoraquest.com/patient-login"
    },
    "alab": {
        "name": "ALAB - American Laboratory",
        "url": "https://www.alabcorp.com",
        "patient_portal": "https://www.alabcorp.com/patient"
    },
    "lifespan": {
        "name": "Lifespan Laboratories",
        "url": "https://www.lifespan.org",
        "patient_portal": "https://www.lifespan.org/mylifespanrecord"
    },
    "mayo": {
        "name": "Mayo Clinic Laboratories",
        "url": "https://www.mayocliniclabs.com",
        "patient_portal": "https://www.mayoclinicpatient.org"
    },
    "uw": {
        "name": "UW Medicine Laboratories",
        "url": "https://www.uwmedicine.org",
        "patient_portal": "https://www.uwmedicine.org/patient-login"
    },
    "cvs": {
        "name": "CVS/Aetna Laboratories",
        "url": "https://www.cvs.com",
        "patient_portal": "https://www.cvs.com"
    },
    "walgreens": {
        "name": "Walgreens Laboratory",
        "url": "https://www.walgreens.com",
        "patient_portal": "https://www.walgreens.com"
    }
}


def get_lab_provider_list() -> List[Dict[str, str]]:
    """Get list of supported lab providers."""
    return list(LAB_PROVIDERS.values())


def get_provider_portal(provider_key: str) -> Optional[str]:
    """Get patient portal URL for a lab provider."""
    provider = LAB_PROVIDERS.get(provider_key.lower())
    return provider["patient_portal"] if provider else None


def add_lab_connection(provider: str, user_id: str, access_token: Optional[str] = None) -> Dict[str, Any]:
    """Store lab provider connection credentials."""
    connection_id = f"{provider}_{user_id}_{datetime.now().timestamp()}"

    config_path = HEALTH_DATA / "lab_connections.json"
    connections = {}

    if config_path.exists():
        connections = json.loads(config_path.read_text())

    connections[connection_id] = {
        "provider": provider,
        "user_id": user_id,
        "connected_at": datetime.now().isoformat(),
        "access_token": access_token,  # In production, encrypt this!
        "last_sync": None,
        "status": "connected"
    }

    config_path.write_text(json.dumps(connections, indent=2))

    return {"id": connection_id, "provider": provider, "status": "connected"}


def get_lab_connections() -> List[Dict[str, Any]]:
    """Get all configured lab provider connections."""
    config_path = HEALTH_DATA / "lab_connections.json"

    if not config_path.exists():
        return []

    connections = json.loads(config_path.read_text())
    return list(connections.values())


def link_lab_to_appointment(appointment_id: str, lab_draw_id: str, provider: str) -> bool:
    """Link a lab result to a doctor appointment."""
    with get_conn() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO appointment_lab_links (appointment_id, lab_draw_id, provider, linked_at)
               VALUES (?, ?, ?, ?)""",
            (appointment_id, lab_draw_id, provider, datetime.now().isoformat())
        )
    return True


def get_appointment_labs(appointment_id: str) -> List[Dict[str, Any]]:
    """Get all labs linked to an appointment."""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT * FROM appointment_lab_links WHERE appointment_id = ?
               ORDER BY linked_at DESC""",
            (appointment_id,)
        ).fetchall()
        return [dict(row) for row in rows]


def get_labs_by_provider(provider: str) -> List[Dict[str, Any]]:
    """Get all lab results from a specific provider."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT draw_id, collected, lab, provider FROM lab_draws WHERE provider = ? ORDER BY collected DESC",
            (provider,)
        ).fetchall()
        return [dict(row) for row in rows]


def sync_lab_results_timeline(days: int = 90) -> Dict[str, Any]:
    """Get lab results timeline for the past N days with appointment context."""
    cutoff_date = (datetime.now() - timedelta(days=days)).date().isoformat()

    with get_conn() as conn:
        # Get labs from past N days
        labs = conn.execute(
            """SELECT id, draw_id, collected, lab, provider FROM lab_draws
               WHERE collected >= ? ORDER BY collected DESC""",
            (cutoff_date,)
        ).fetchall()

        # Get appointments in same period
        appointments = conn.execute(
            """SELECT appointment_id, doctor_name, appointment_date, reason_for_visit
               FROM doctor_appointments
               WHERE appointment_date >= ? ORDER BY appointment_date DESC""",
            (cutoff_date,)
        ).fetchall()

        timeline = {
            "period_days": days,
            "labs": [dict(lab) for lab in labs],
            "appointments": [dict(appt) for appt in appointments],
            "connections": get_lab_connections()
        }

        return timeline


def get_lab_status_for_appointment(appointment_id: str) -> Dict[str, Any]:
    """Get status of lab results for an appointment - ordered, pending, complete."""
    with get_conn() as conn:
        # Get the appointment
        appt = conn.execute(
            "SELECT * FROM doctor_appointments WHERE appointment_id = ?",
            (appointment_id,)
        ).fetchone()

        if not appt:
            return {"status": "not_found"}

        # Get linked labs
        linked_labs = conn.execute(
            """SELECT all_labs.draw_id, all_labs.collected, all_labs.provider
               FROM appointment_lab_links links
               JOIN lab_draws all_labs ON links.lab_draw_id = all_labs.draw_id
               WHERE links.appointment_id = ?""",
            (appointment_id,)
        ).fetchall()

        return {
            "appointment": dict(appt),
            "linked_labs": [dict(lab) for lab in linked_labs],
            "lab_count": len(linked_labs),
            "status": "complete" if linked_labs else "pending"
        }


def get_dashboard_summary() -> Dict[str, Any]:
    """Get summary of all lab providers and recent results."""
    with get_conn() as conn:
        # Count labs by provider
        provider_counts = conn.execute(
            """SELECT provider, COUNT(*) as count FROM lab_draws
               GROUP BY provider ORDER BY count DESC"""
        ).fetchall()

        # Get most recent labs
        recent_labs = conn.execute(
            """SELECT draw_id, collected, provider, lab FROM lab_draws
               ORDER BY collected DESC LIMIT 10"""
        ).fetchall()

        # Get upcoming appointments needing labs
        upcoming = conn.execute(
            """SELECT appointment_id, doctor_name, appointment_date, reason_for_visit
               FROM doctor_appointments
               WHERE status = 'scheduled' AND appointment_date >= date('now')
               ORDER BY appointment_date LIMIT 10"""
        ).fetchall()

    return {
        "providers": {dict(row)["provider"]: dict(row)["count"] for row in provider_counts},
        "recent_labs": [dict(row) for row in recent_labs],
        "upcoming_appointments": [dict(row) for row in upcoming],
        "available_providers": list(LAB_PROVIDERS.keys())
    }
