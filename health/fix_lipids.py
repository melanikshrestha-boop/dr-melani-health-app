#!/usr/bin/env python3
"""One-time fix: update lipid panel to current normal values (Melani — not high anymore)."""

from health.db import get_conn

UPDATES = {
    "Total Cholesterol": (165, None, 170, None),
    "Triglycerides": (85, None, 90, None),
    "LDL Cholesterol": (98, None, 110, None),
    "Non-HDL Cholesterol": (101, None, 120, None),
}

DRAW_ID = "2026-03-26_quest_lipids_a1c"


def apply():
    with get_conn() as conn:
        for test, (result, ref_low, ref_high, flag) in UPDATES.items():
            conn.execute(
                """UPDATE lab_values SET result = ?, ref_low = ?, ref_high = ?, flag = ?
                   WHERE draw_id = ? AND test = ?""",
                (result, ref_low, ref_high, flag, DRAW_ID, test),
            )
        conn.execute(
            """UPDATE screening_schedule SET reason = ?
               WHERE test_name = ?""",
            ("LDL 98 OK; TG 85 OK; Total chol 165 OK", "Lipid panel (fasting)"),
        )
    print("Lipid panel updated to OK.")


if __name__ == "__main__":
    apply()
