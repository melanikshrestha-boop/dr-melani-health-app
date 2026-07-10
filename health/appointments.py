"""Doctor's appointment scheduling and management."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from .db import get_conn, today


def create_appointment(
    doctor_name: str,
    specialty: str,
    appointment_date: str,
    appointment_time: str,
    reason_for_visit: str,
    location: Optional[str] = None,
    telehealth_link: Optional[str] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a new doctor's appointment."""
    appointment_id = str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()

    with get_conn() as conn:
        conn.execute(
            """INSERT INTO doctor_appointments
               (appointment_id, doctor_name, specialty, appointment_date, appointment_time,
                location, telehealth_link, reason_for_visit, notes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                appointment_id,
                doctor_name,
                specialty,
                appointment_date,
                appointment_time,
                location,
                telehealth_link,
                reason_for_visit,
                notes,
                now,
                now,
            ),
        )
        _create_default_reminders(conn, appointment_id, appointment_date, appointment_time)

    return get_appointment(appointment_id)


def _create_default_reminders(conn, appointment_id: str, appt_date: str, appt_time: str):
    """Create default reminders: 1 day before and 2 hours before."""
    try:
        # Parse appointment date and time
        appt_datetime = datetime.fromisoformat(f"{appt_date}T{appt_time}:00")

        # 1 day before
        reminder_1day = (appt_datetime - timedelta(days=1)).isoformat()
        conn.execute(
            """INSERT INTO appointment_reminders (appointment_id, reminder_time, reminder_type)
               VALUES (?, ?, ?)""",
            (appointment_id, reminder_1day, "email"),
        )

        # 2 hours before
        reminder_2h = (appt_datetime - timedelta(hours=2)).isoformat()
        conn.execute(
            """INSERT INTO appointment_reminders (appointment_id, reminder_time, reminder_type)
               VALUES (?, ?, ?)""",
            (appointment_id, reminder_2h, "notification"),
        )
    except Exception:
        pass


def get_appointment(appointment_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific appointment by ID."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM doctor_appointments WHERE appointment_id = ?",
            (appointment_id,),
        ).fetchone()
        if not row:
            return None
        appt = dict(row)
        # Get follow-ups
        follow_ups = conn.execute(
            "SELECT * FROM appointment_follow_ups WHERE appointment_id = ?",
            (appointment_id,),
        ).fetchall()
        appt["follow_ups"] = [dict(fu) for fu in follow_ups]
        return appt


def get_all_appointments(status: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get all appointments, optionally filtered by status."""
    with get_conn() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM doctor_appointments WHERE status = ? ORDER BY appointment_date DESC",
                (status,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM doctor_appointments ORDER BY appointment_date DESC"
            ).fetchall()
        return [dict(row) for row in rows]


def get_upcoming_appointments(days_ahead: int = 30) -> List[Dict[str, Any]]:
    """Get upcoming appointments in the next N days."""
    with get_conn() as conn:
        future_date = (datetime.now() + timedelta(days=days_ahead)).date().isoformat()
        rows = conn.execute(
            """SELECT * FROM doctor_appointments
               WHERE appointment_date >= ? AND status != 'cancelled'
               ORDER BY appointment_date, appointment_time""",
            (today(),),
        ).fetchall()
        return [dict(row) for row in rows]


def update_appointment(
    appointment_id: str,
    doctor_name: Optional[str] = None,
    specialty: Optional[str] = None,
    appointment_date: Optional[str] = None,
    appointment_time: Optional[str] = None,
    location: Optional[str] = None,
    telehealth_link: Optional[str] = None,
    reason_for_visit: Optional[str] = None,
    notes: Optional[str] = None,
    status: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Update an appointment."""
    updates = []
    values = []

    if doctor_name is not None:
        updates.append("doctor_name = ?")
        values.append(doctor_name)
    if specialty is not None:
        updates.append("specialty = ?")
        values.append(specialty)
    if appointment_date is not None:
        updates.append("appointment_date = ?")
        values.append(appointment_date)
    if appointment_time is not None:
        updates.append("appointment_time = ?")
        values.append(appointment_time)
    if location is not None:
        updates.append("location = ?")
        values.append(location)
    if telehealth_link is not None:
        updates.append("telehealth_link = ?")
        values.append(telehealth_link)
    if reason_for_visit is not None:
        updates.append("reason_for_visit = ?")
        values.append(reason_for_visit)
    if notes is not None:
        updates.append("notes = ?")
        values.append(notes)
    if status is not None:
        updates.append("status = ?")
        values.append(status)

    if not updates:
        return get_appointment(appointment_id)

    updates.append("updated_at = ?")
    values.append(datetime.now().isoformat())
    values.append(appointment_id)

    with get_conn() as conn:
        conn.execute(
            f"UPDATE doctor_appointments SET {', '.join(updates)} WHERE appointment_id = ?",
            values,
        )

    return get_appointment(appointment_id)


def cancel_appointment(appointment_id: str, reason: Optional[str] = None) -> bool:
    """Cancel an appointment."""
    notes_update = ""
    if reason:
        notes_update = f" Cancellation reason: {reason}"

    with get_conn() as conn:
        appt = conn.execute(
            "SELECT notes FROM doctor_appointments WHERE appointment_id = ?",
            (appointment_id,),
        ).fetchone()
        new_notes = (appt["notes"] or "") + notes_update if appt else notes_update
        conn.execute(
            "UPDATE doctor_appointments SET status = ?, notes = ?, updated_at = ? WHERE appointment_id = ?",
            ("cancelled", new_notes, datetime.now().isoformat(), appointment_id),
        )
    return True


def add_follow_up(
    appointment_id: str,
    follow_up_type: str,
    lab_test: Optional[str] = None,
    prescription: Optional[str] = None,
    instructions: Optional[str] = None,
) -> bool:
    """Add a follow-up task to an appointment."""
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO appointment_follow_ups
               (appointment_id, follow_up_type, lab_test, prescription, instructions)
               VALUES (?, ?, ?, ?, ?)""",
            (appointment_id, follow_up_type, lab_test, prescription, instructions),
        )
    return True


def complete_follow_up(follow_up_id: int) -> bool:
    """Mark a follow-up as completed."""
    with get_conn() as conn:
        conn.execute(
            "UPDATE appointment_follow_ups SET status = ?, completed_at = ? WHERE id = ?",
            ("completed", datetime.now().isoformat(), follow_up_id),
        )
    return True


def get_pending_follow_ups(appointment_id: str) -> List[Dict[str, Any]]:
    """Get pending follow-ups for an appointment."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM appointment_follow_ups WHERE appointment_id = ? AND status = 'pending'",
            (appointment_id,),
        ).fetchall()
        return [dict(row) for row in rows]


def get_all_pending_reminders() -> List[Dict[str, Any]]:
    """Get all reminders that should be sent soon."""
    now = datetime.now().isoformat()
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT ar.*, da.doctor_name, da.appointment_date, da.appointment_time
               FROM appointment_reminders ar
               JOIN doctor_appointments da ON ar.appointment_id = da.appointment_id
               WHERE ar.sent = 0 AND ar.reminder_time <= ?
               ORDER BY ar.reminder_time""",
            (now,),
        ).fetchall()
        return [dict(row) for row in rows]


def mark_reminder_sent(reminder_id: int) -> bool:
    """Mark a reminder as sent."""
    with get_conn() as conn:
        conn.execute(
            "UPDATE appointment_reminders SET sent = 1, sent_at = ? WHERE id = ?",
            (datetime.now().isoformat(), reminder_id),
        )
    return True


def get_appointments_by_date(date_str: str) -> List[Dict[str, Any]]:
    """Get all appointments on a specific date."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM doctor_appointments WHERE appointment_date = ? ORDER BY appointment_time",
            (date_str,),
        ).fetchall()
        return [dict(row) for row in rows]


def get_appointments_by_specialty(specialty: str) -> List[Dict[str, Any]]:
    """Get all appointments for a specific specialty."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM doctor_appointments WHERE specialty = ? ORDER BY appointment_date",
            (specialty,),
        ).fetchall()
        return [dict(row) for row in rows]


def get_doctor_names() -> List[str]:
    """Get list of unique doctor names."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT doctor_name FROM doctor_appointments ORDER BY doctor_name"
        ).fetchall()
        return [row["doctor_name"] for row in rows]
