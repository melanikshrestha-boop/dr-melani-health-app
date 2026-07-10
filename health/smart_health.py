"""Smart health analytics - correlations, insights, and AI recommendations."""

from __future__ import annotations

from datetime import datetime, timedelta, date
from typing import Dict, Any, List

from .db import get_conn
from . import apple_health, whoop_enhanced, appointments, lab_providers


class HealthAnalytics:
    """Analyze health data across all sources for insights."""

    @staticmethod
    def get_health_score(date_str: str = None) -> Dict[str, Any]:
        """Calculate composite health score from all sources."""
        if not date_str:
            date_str = date.today().isoformat()

        apple = apple_health.get_apple_health_for_date(date_str)
        whoop = whoop_enhanced.get_whoop_for_date(date_str)

        score = 0
        max_score = 100
        breakdown = {}

        # Apple Watch metrics (40 points)
        apple_score = 0
        if apple.get("heart_rate"):
            hr = apple["heart_rate"].get("avg_bpm")
            if 60 <= hr <= 100:
                apple_score += 15
            elif 50 <= hr <= 110:
                apple_score += 10

        if apple.get("steps"):
            steps = apple["steps"].get("step_count", 0)
            if steps >= 8000:
                apple_score += 15
            elif steps >= 5000:
                apple_score += 10

        if apple.get("blood_oxygen"):
            spo2 = apple["blood_oxygen"].get("avg_spo2", 98)
            if spo2 >= 95:
                apple_score += 10

        breakdown["apple_watch"] = apple_score

        # WHOOP metrics (40 points)
        whoop_score = 0
        if whoop.get("recovery"):
            recovery = whoop["recovery"].get("recovery_score", 0)
            whoop_score += int(recovery / 2.5)  # 0-100 → 0-40

        elif whoop.get("sleep"):
            sleep_hours = whoop["sleep"].get("duration_hours", 0)
            if 7 <= sleep_hours <= 9:
                whoop_score += 20

        breakdown["whoop"] = whoop_score

        # Labs (20 points) - based on recent lab values
        lab_score = HealthAnalytics._calculate_lab_score(date_str)
        breakdown["labs"] = lab_score

        score = apple_score + whoop_score + lab_score

        return {
            "date": date_str,
            "overall_score": score,
            "max_score": max_score,
            "percentage": f"{(score/max_score)*100:.0f}%",
            "breakdown": breakdown,
            "status": HealthAnalytics._score_status(score)
        }

    @staticmethod
    def _calculate_lab_score(date_str: str) -> int:
        """Calculate health score from recent lab results."""
        with get_conn() as conn:
            # Get most recent labs
            labs = conn.execute(
                "SELECT COUNT(*) as count FROM lab_draws WHERE collected <= ? ORDER BY collected DESC LIMIT 1",
                (date_str,)
            ).fetchone()

        return 15 if labs and labs["count"] > 0 else 0

    @staticmethod
    def _score_status(score: int) -> str:
        """Get status text for score."""
        if score >= 80:
            return "Excellent"
        elif score >= 65:
            return "Good"
        elif score >= 50:
            return "Fair"
        else:
            return "Needs attention"

    @staticmethod
    def find_correlations(days: int = 30) -> Dict[str, Any]:
        """Find correlations between different health metrics."""
        with get_conn() as conn:
            # Get dates with multiple data sources
            dates = conn.execute(
                """
                SELECT DISTINCT
                    COALESCE(a.date, w.date, l.date) as date
                FROM apple_heart_rate a
                FULL OUTER JOIN whoop_recovery w ON a.date = w.date
                FULL OUTER JOIN lab_draws l ON a.date = l.collected
                WHERE a.date >= date('now', ?) OR w.date >= date('now', ?) OR l.date >= date('now', ?)
                LIMIT ?
                """,
                (f"-{days} days", f"-{days} days", f"-{days} days", days)
            ).fetchall()

            correlations = []

            for row in dates:
                date_str = row["date"] if row["date"] else None
                if not date_str:
                    continue

                apple = apple_health.get_apple_health_for_date(date_str)
                whoop = whoop_enhanced.get_whoop_for_date(date_str)

                # Look for patterns
                if apple.get("steps") and whoop.get("recovery"):
                    steps = apple["steps"].get("step_count", 0)
                    recovery = whoop["recovery"].get("recovery_score", 0)

                    # High activity correlates with lower recovery
                    if steps > 8000 and recovery < 50:
                        correlations.append({
                            "date": date_str,
                            "type": "activity_recovery",
                            "insight": f"High activity ({steps} steps) correlated with low recovery ({recovery}%)",
                            "severity": "info"
                        })

                    # Low activity with high recovery is good
                    if steps < 5000 and recovery > 70:
                        correlations.append({
                            "date": date_str,
                            "type": "rest_recovery",
                            "insight": f"Rest day ({steps} steps) with excellent recovery ({recovery}%)",
                            "severity": "positive"
                        })

        return {"correlations": correlations, "period_days": days}

    @staticmethod
    def get_health_alerts(days: int = 7) -> List[Dict[str, Any]]:
        """Get alerts for anomalies in health data."""
        alerts = []

        # Check recent heart rate for anomalies
        with get_conn() as conn:
            recent_hr = conn.execute(
                """
                SELECT date, AVG(CAST(bpm AS REAL)) as avg_bpm
                FROM apple_heart_rate
                WHERE date >= date('now', ?)
                GROUP BY date
                ORDER BY date DESC
                LIMIT ?
                """,
                (f"-{days} days", days)
            ).fetchall()

            hr_values = [r["avg_bpm"] for r in recent_hr if r["avg_bpm"]]

            if hr_values:
                avg_hr = sum(hr_values) / len(hr_values)

                for r in recent_hr:
                    if r["avg_bpm"] > avg_hr * 1.2:
                        alerts.append({
                            "date": r["date"],
                            "type": "elevated_heart_rate",
                            "value": f"{r['avg_bpm']:.0f} bpm",
                            "message": f"Heart rate 20% above your average ({avg_hr:.0f} bpm)",
                            "severity": "warning"
                        })

            # Check for low sleep
            low_sleep = conn.execute(
                """
                SELECT date, duration_hours
                FROM apple_sleep
                WHERE date >= date('now', ?) AND duration_hours < 6
                ORDER BY date DESC
                """,
                (f"-{days} days",)
            ).fetchall()

            for s in low_sleep:
                alerts.append({
                    "date": s["date"],
                    "type": "insufficient_sleep",
                    "value": f"{s['duration_hours']:.1f} hours",
                    "message": "Less than recommended 7-9 hours of sleep",
                    "severity": "warning"
                })

        return alerts

    @staticmethod
    def get_recovery_predictions(next_days: int = 7) -> Dict[str, Any]:
        """Predict recovery based on current trends."""
        recent_recovery = whoop_enhanced.get_whoop_trends("recovery", 14)
        recent_strain = whoop_enhanced.get_whoop_trends("strain", 14)

        prediction = {
            "days_ahead": next_days,
            "recovery_trend": "improving" if recent_recovery.get("trend") == "up" else "declining",
            "recommendations": []
        }

        # Generate recommendations
        if recent_recovery.get("average", 0) < 40:
            prediction["recommendations"].append({
                "priority": "high",
                "action": "Prioritize sleep and rest",
                "reason": "Low recovery score suggests body needs recovery"
            })

        if recent_strain.get("average", 0) > 80:
            prediction["recommendations"].append({
                "priority": "high",
                "action": "Reduce intense workouts this week",
                "reason": "High accumulated strain may increase injury risk"
            })

        return prediction

    @staticmethod
    def get_appointment_health_context(appointment_id: str) -> Dict[str, Any]:
        """Get full health context for an appointment date."""
        appt = appointments.get_appointment(appointment_id)
        if not appt:
            return {"error": "Appointment not found"}

        date_str = appt["appointment_date"]

        return {
            "appointment": {
                "doctor": appt["doctor_name"],
                "date": date_str,
                "reason": appt["reason_for_visit"]
            },
            "health_on_date": HealthAnalytics.get_health_score(date_str),
            "apple_health": apple_health.get_apple_health_for_date(date_str),
            "whoop": whoop_enhanced.get_whoop_for_date(date_str),
            "alerts": HealthAnalytics.get_health_alerts(1) if HealthAnalytics.get_health_alerts(1) else []
        }

    @staticmethod
    def generate_health_report(days: int = 30) -> Dict[str, Any]:
        """Generate comprehensive health report."""
        return {
            "period_days": days,
            "generated_at": datetime.now().isoformat(),
            "overall_score": HealthAnalytics.get_health_score(),
            "alerts": HealthAnalytics.get_health_alerts(days),
            "correlations": HealthAnalytics.find_correlations(days),
            "recovery_prediction": HealthAnalytics.get_recovery_predictions(7),
            "recent_appointments": appointments.get_upcoming_appointments(days),
            "summary": HealthAnalytics._generate_summary(days)
        }

    @staticmethod
    def _generate_summary(days: int) -> str:
        """Generate text summary of health status."""
        with get_conn() as conn:
            steps_data = conn.execute(
                "SELECT COUNT(*) as days, AVG(CAST(step_count AS REAL)) as avg_steps FROM apple_steps WHERE date >= date('now', ?)",
                (f"-{days} days",)
            ).fetchone()

            recovery_data = conn.execute(
                "SELECT AVG(CAST(recovery_score AS REAL)) as avg_recovery FROM whoop_recovery WHERE date >= date('now', ?)",
                (f"-{days} days",)
            ).fetchone()

        summary = []

        if steps_data and steps_data["avg_steps"]:
            avg_steps = int(steps_data["avg_steps"])
            summary.append(f"Averaging {avg_steps} steps/day over {steps_data['days']} days")

        if recovery_data and recovery_data["avg_recovery"]:
            avg_recovery = int(recovery_data["avg_recovery"])
            if avg_recovery < 40:
                summary.append(f"Recovery is {avg_recovery}% - body needs rest")
            elif avg_recovery > 70:
                summary.append(f"Recovery is {avg_recovery}% - great to push harder")

        return ". ".join(summary) if summary else "Insufficient data for summary"
