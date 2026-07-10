from __future__ import annotations

"""SQLite schema, init, and seed from baseline labs."""

import csv
import json
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path

from .paths import DB_PATH, HEALTH_DATA, SEED_FILE, ensure_dirs

SCHEMA = """
CREATE TABLE IF NOT EXISTS profile (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS lab_draws (
    id TEXT PRIMARY KEY,
    collected TEXT NOT NULL,
    lab TEXT,
    provider TEXT,
    panels TEXT,
    source TEXT DEFAULT 'import'
);

CREATE TABLE IF NOT EXISTS lab_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    draw_id TEXT NOT NULL,
    test TEXT NOT NULL,
    result REAL,
    result_text TEXT,
    unit TEXT,
    ref_low REAL,
    ref_high REAL,
    ref_text TEXT,
    flag TEXT,
    FOREIGN KEY (draw_id) REFERENCES lab_draws(id)
);

CREATE TABLE IF NOT EXISTS screening_schedule (
    test_name TEXT PRIMARY KEY,
    last_done TEXT,
    interval_months INTEGER,
    next_due TEXT,
    reason TEXT,
    fasting INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_checkins (
    day TEXT PRIMARY KEY,
    bedtime TEXT,
    wake_time TEXT,
    sleep_hours REAL,
    sleep_quality INTEGER,
    mood INTEGER,
    energy INTEGER,
    stress INTEGER,
    notes TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS sleep_logs (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    bedtime TEXT,
    wake_time TEXT,
    sleep_hours REAL,
    notes TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS water_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    amount_ml INTEGER NOT NULL,
    logged_at TEXT
);

CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    slot TEXT NOT NULL,
    name TEXT,
    calories REAL,
    protein_g REAL,
    carbs_g REAL,
    fat_g REAL,
    fiber_g REAL,
    source TEXT DEFAULT 'manual',
    photo_path TEXT,
    created_at TEXT,
    UNIQUE(day, slot)
);

CREATE TABLE IF NOT EXISTS symptoms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    type TEXT,
    severity INTEGER,
    location TEXT,
    notes TEXT,
    logged_at TEXT
);

CREATE TABLE IF NOT EXISTS supplement_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    dose TEXT,
    schedule TEXT
);

CREATE TABLE IF NOT EXISTS supplement_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    supplement_id INTEGER,
    name TEXT,
    taken INTEGER DEFAULT 1,
    logged_at TEXT
);

CREATE TABLE IF NOT EXISTS derm_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    time_of_day TEXT,
    schedule TEXT
);

CREATE TABLE IF NOT EXISTS derm_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    item_id INTEGER,
    name TEXT,
    done INTEGER DEFAULT 1,
    logged_at TEXT
);

CREATE TABLE IF NOT EXISTS vitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL,
    value_text TEXT,
    unit TEXT,
    logged_at TEXT
);

CREATE TABLE IF NOT EXISTS cycle_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    event TEXT,
    flow TEXT,
    cycle_day INTEGER,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS workout_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    type TEXT,
    duration_min INTEGER,
    notes TEXT,
    rpe INTEGER,
    logged_at TEXT
);

CREATE TABLE IF NOT EXISTS workout_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    sets INTEGER,
    reps INTEGER,
    weight REAL,
    distance REAL,
    notes TEXT,
    FOREIGN KEY (session_id) REFERENCES workout_sessions(id)
);

CREATE TABLE IF NOT EXISTS run_logs (
    day TEXT PRIMARY KEY,
    distance_mi REAL NOT NULL,
    duration_sec INTEGER NOT NULL,
    pace_sec_per_mi REAL NOT NULL,
    week_key TEXT NOT NULL,
    target_mi REAL NOT NULL,
    notes TEXT,
    logged_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_run_logs_week ON run_logs(week_key);

CREATE TABLE IF NOT EXISTS progress_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    tag TEXT,
    path TEXT NOT NULL,
    notes TEXT,
    uploaded_at TEXT
);

CREATE TABLE IF NOT EXISTS grocery_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    quantity TEXT,
    checked INTEGER DEFAULT 0,
    added_by TEXT DEFAULT 'manual',
    reason TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT,
    path TEXT,
    doc_type TEXT,
    extracted_text TEXT,
    uploaded_at TEXT
);

CREATE TABLE IF NOT EXISTS migraine_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL UNIQUE,
    severity INTEGER NOT NULL DEFAULT 0,
    triggers TEXT,
    relief TEXT,
    cycle_day INTEGER,
    notes TEXT,
    logged_at TEXT
);

CREATE TABLE IF NOT EXISTS wearable_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    source TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL,
    value_text TEXT,
    unit TEXT,
    imported_at TEXT,
    UNIQUE(day, source, metric)
);

CREATE INDEX IF NOT EXISTS idx_lab_values_draw ON lab_values(draw_id);
CREATE INDEX IF NOT EXISTS idx_meals_day ON meals(day);
CREATE INDEX IF NOT EXISTS idx_water_day ON water_logs(day);
CREATE INDEX IF NOT EXISTS idx_migraine_day ON migraine_logs(day);
CREATE INDEX IF NOT EXISTS idx_wearable_day ON wearable_metrics(day);

CREATE TABLE IF NOT EXISTS doctor_appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id TEXT NOT NULL UNIQUE,
    doctor_name TEXT NOT NULL,
    specialty TEXT,
    appointment_date TEXT NOT NULL,
    appointment_time TEXT NOT NULL,
    location TEXT,
    telehealth_link TEXT,
    reason_for_visit TEXT,
    notes TEXT,
    status TEXT DEFAULT 'scheduled',
    reminder_sent INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS appointment_follow_ups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id TEXT NOT NULL,
    follow_up_type TEXT,
    lab_test TEXT,
    prescription TEXT,
    instructions TEXT,
    status TEXT DEFAULT 'pending',
    completed_at TEXT,
    FOREIGN KEY (appointment_id) REFERENCES doctor_appointments(appointment_id)
);

CREATE TABLE IF NOT EXISTS appointment_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id TEXT NOT NULL,
    reminder_time TEXT NOT NULL,
    reminder_type TEXT DEFAULT 'notification',
    sent INTEGER DEFAULT 0,
    sent_at TEXT,
    FOREIGN KEY (appointment_id) REFERENCES doctor_appointments(appointment_id)
);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON doctor_appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON doctor_appointments(status);
CREATE INDEX IF NOT EXISTS idx_follow_ups_appointment ON appointment_follow_ups(appointment_id);

CREATE TABLE IF NOT EXISTS appointment_lab_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id TEXT NOT NULL,
    lab_draw_id TEXT NOT NULL,
    provider TEXT,
    linked_at TEXT,
    FOREIGN KEY (appointment_id) REFERENCES doctor_appointments(appointment_id),
    UNIQUE(appointment_id, lab_draw_id)
);

CREATE INDEX IF NOT EXISTS idx_lab_links_appointment ON appointment_lab_links(appointment_id);
CREATE INDEX IF NOT EXISTS idx_lab_links_draw ON appointment_lab_links(lab_draw_id);

CREATE TABLE IF NOT EXISTS appointment_whoop_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id TEXT NOT NULL,
    whoop_date TEXT NOT NULL,
    linked_at TEXT,
    FOREIGN KEY (appointment_id) REFERENCES doctor_appointments(appointment_id),
    UNIQUE(appointment_id, whoop_date)
);

CREATE INDEX IF NOT EXISTS idx_whoop_links_appointment ON appointment_whoop_links(appointment_id);
"""


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db(seed: bool = True):
    ensure_dirs()
    try:
        from .gym_plans import ensure_plans
        ensure_plans()
    except Exception:
        pass
    with get_conn() as conn:
        conn.executescript(SCHEMA)
    _write_profile()
    if seed and not _labs_seeded():
        seed_baseline()
    _ensure_screening()
    try:
        from .profile import sync_profile_db
        sync_profile_db()
    except Exception:
        pass
    try:
        from .sleep import migrate_from_checkins
        migrate_from_checkins()
    except Exception:
        pass
    try:
        from .runs import ensure as ensure_runs
        ensure_runs()
    except Exception:
        pass
    try:
        refresh_stored_lab_flags()
    except Exception:
        pass
    try:
        from .cycle import ensure_seed
        ensure_seed()
    except Exception:
        pass
    try:
        from .supplements import ensure_catalog
        ensure_catalog()
    except Exception:
        pass
    try:
        from .derm_hygiene import ensure_catalog as ensure_derm_catalog
        ensure_derm_catalog()
    except Exception:
        pass
    _ensure_checkin_columns()
    _ensure_tracking_tables()


def _ensure_checkin_columns():
    """Add caffeine/alcohol columns to daily_checkins if missing."""
    with get_conn() as conn:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(daily_checkins)").fetchall()}
        if "caffeine_servings" not in cols:
            conn.execute("ALTER TABLE daily_checkins ADD COLUMN caffeine_servings INTEGER")
        if "alcohol_drinks" not in cols:
            conn.execute("ALTER TABLE daily_checkins ADD COLUMN alcohol_drinks INTEGER")


def _ensure_tracking_tables():
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS migraine_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                day TEXT NOT NULL UNIQUE,
                severity INTEGER NOT NULL DEFAULT 0,
                triggers TEXT,
                relief TEXT,
                cycle_day INTEGER,
                notes TEXT,
                logged_at TEXT
            );
            CREATE TABLE IF NOT EXISTS wearable_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                day TEXT NOT NULL,
                source TEXT NOT NULL,
                metric TEXT NOT NULL,
                value REAL,
                value_text TEXT,
                unit TEXT,
                imported_at TEXT,
                UNIQUE(day, source, metric)
            );
            CREATE INDEX IF NOT EXISTS idx_migraine_day ON migraine_logs(day);
            CREATE INDEX IF NOT EXISTS idx_wearable_day ON wearable_metrics(day);
            """
        )


def refresh_stored_lab_flags():
    """Recompute H/L flags from results vs normal ranges (keeps DB in sync)."""
    from .lab_glossary import normalize_lab_value

    with get_conn() as conn:
        rows = conn.execute("SELECT draw_id, test, result, result_text, unit, ref_low, ref_high, ref_text, flag FROM lab_values").fetchall()
        for row in rows:
            nv = normalize_lab_value(dict(row))
            conn.execute(
                """UPDATE lab_values
                   SET ref_low = ?, ref_high = ?, flag = ?
                   WHERE draw_id = ? AND test = ?""",
                (nv.get("ref_low"), nv.get("ref_high"), nv.get("flag"), row["draw_id"], row["test"]),
            )


def _labs_seeded() -> bool:
    with get_conn() as conn:
        row = conn.execute("SELECT COUNT(*) AS c FROM lab_draws").fetchone()
        return row["c"] > 0


def _write_profile():
    profile = {
        "name": "Melani Shrestha",
        "dob": "2007-08-24",
        "sex": "F",
        "height_ft": "5",
        "height_in": "0",
        "height_display": "5 ft 0 in",
        "patient_id": "2581279882",
        "provider": "Ververis, Megan",
        "conditions": "migraine/chronic pain; cardio/metabolic monitoring",
        "water_goal_ml": "4000",
        "meals_per_day": "3",
    }
    path = HEALTH_DATA / "profile.json"
    path.write_text(json.dumps(profile, indent=2))
    with get_conn() as conn:
        for k, v in profile.items():
            conn.execute(
                "INSERT OR REPLACE INTO profile (key, value) VALUES (?, ?)", (k, v)
            )


def _add_months(d: date, months: int) -> date:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, 28)
    return date(year, month, day)


def _ensure_screening():
    schedule = [
        ("Lipid panel (fasting)", "2026-03-26", 3, "LDL 120, TG 119, Total chol 207 HIGH", 1),
        ("A1C", "2026-03-26", 6, "Metabolic monitoring", 0),
        ("Fasting glucose", "2026-04-06", 6, "Metabolic monitoring", 1),
        ("CBC with diff", "2026-04-06", 6, "HGB 13.6→12.6 trend", 0),
        ("CMP/BMP", "2026-04-06", 12, "Kidney/liver baseline", 0),
        ("TSH", "2026-04-07", 12, "Thyroid baseline 1.06", 0),
    ]
    path = HEALTH_DATA / "screening_schedule.json"
    items = []
    with get_conn() as conn:
        for name, last, months, reason, fasting in schedule:
            last_d = date.fromisoformat(last)
            next_d = _add_months(last_d, months)
            conn.execute(
                """INSERT OR REPLACE INTO screening_schedule
                   (test_name, last_done, interval_months, next_due, reason, fasting)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (name, last, months, next_d.isoformat(), reason, fasting),
            )
            items.append({
                "test_name": name,
                "last_done": last,
                "interval_months": months,
                "next_due": next_d.isoformat(),
                "reason": reason,
                "fasting": bool(fasting),
            })
    path.write_text(json.dumps(items, indent=2))


def seed_baseline():
    if not SEED_FILE.exists():
        return
    from .lab_glossary import normalize_lab_value

    data = json.loads(SEED_FILE.read_text())
    draws_dir = HEALTH_DATA / "labs" / "draws"
    rows_for_csv = []

    with get_conn() as conn:
        for draw in data["draws"]:
            draw_id = draw["id"]
            conn.execute(
                """INSERT OR REPLACE INTO lab_draws (id, collected, lab, provider, panels, source)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    draw_id,
                    draw["collected"],
                    draw.get("lab"),
                    draw.get("provider"),
                    json.dumps(draw.get("panels", [])),
                    "import",
                ),
            )
            conn.execute("DELETE FROM lab_values WHERE draw_id = ?", (draw_id,))
            for v in draw["values"]:
                nv = normalize_lab_value(v)
                result = nv.get("result")
                conn.execute(
                    """INSERT INTO lab_values
                       (draw_id, test, result, result_text, unit, ref_low, ref_high, ref_text, flag)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        draw_id,
                        nv["test"],
                        float(result) if result is not None and isinstance(result, (int, float)) else None,
                        str(result) if result is not None else nv.get("result_text"),
                        nv.get("unit"),
                        nv.get("ref_low"),
                        nv.get("ref_high"),
                        nv.get("ref_text"),
                        nv.get("flag"),
                    ),
                )
                rows_for_csv.append({
                    "date": draw["collected"][:10],
                    "draw_id": draw_id,
                    "lab": draw.get("lab", ""),
                    "panel": ",".join(draw.get("panels", [])),
                    "test": v["test"],
                    "result": result,
                    "unit": v.get("unit", ""),
                    "ref_low": v.get("ref_low"),
                    "ref_high": v.get("ref_high"),
                    "flag": v.get("flag") or "",
                })
            (draws_dir / f"{draw_id}.json").write_text(json.dumps(draw, indent=2))

    csv_path = HEALTH_DATA / "labs" / "master_export.csv"
    if rows_for_csv:
        with csv_path.open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows_for_csv[0].keys()))
            w.writeheader()
            w.writerows(rows_for_csv)


def today() -> str:
    return date.today().isoformat()


def water_total_ml(day: str | None = None) -> int:
    day = day or today()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COALESCE(SUM(amount_ml), 0) AS t FROM water_logs WHERE day = ?", (day,)
        ).fetchone()
        return int(row["t"])


def meal_count(day: str | None = None) -> int:
    day = day or today()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM meals WHERE day = ?", (day,)
        ).fetchone()
        return int(row["c"])
