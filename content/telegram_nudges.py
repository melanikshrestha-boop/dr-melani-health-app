"""Telegram reminders for upcoming content posts."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

from . import calendar
from .paths import CONFIG_DIR

STATE_FILE = CONFIG_DIR / "content_nudge_state.json"


def _load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save_state(state: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


def upcoming_reminders(within_minutes: int = 60) -> list[str]:
    now = datetime.now()
    cutoff = now + timedelta(minutes=within_minutes)
    messages: list[str] = []
    today = calendar.today_items(now.date())
    for b in today["bundles"]:
        when = b.get("scheduled_at")
        if not when:
            continue
        dt = datetime.fromisoformat(when)
        if now <= dt <= cutoff and b.get("status") == "scheduled":
            messages.append(
                f"📱 Short bundle in {int((dt - now).total_seconds() // 60)} min — "
                f"{(b.get('base_caption') or 'Reel')[:50]}"
            )
    for p in today["linkedin"]:
        when = p.get("scheduled_at")
        if not when:
            continue
        dt = datetime.fromisoformat(when)
        if now <= dt <= cutoff and p.get("status") == "scheduled":
            messages.append(
                f"💼 LinkedIn post in {int((dt - now).total_seconds() // 60)} min — "
                f"{(p.get('body') or '')[:50]}"
            )
    for v in today["youtube"]:
        when = v.get("scheduled_at")
        if not when:
            continue
        dt = datetime.fromisoformat(when)
        if now <= dt <= cutoff and v.get("status") == "scheduled":
            kind = "Short" if v.get("is_short") else "Video"
            messages.append(
                f"▶️ YouTube {kind} in {int((dt - now).total_seconds() // 60)} min — "
                f"{(v.get('title') or '')[:50]}"
            )
    return messages


def pending_nudge_message() -> str | None:
    msgs = upcoming_reminders(within_minutes=90)
    if not msgs:
        return None
    state = _load_state()
    key = "|".join(msgs)
    if state.get("last_key") == key:
        return None
    state["last_key"] = key
    state["sent_at"] = datetime.now().isoformat()
    _save_state(state)
    return "Content reminders:\n" + "\n".join(f"• {m}" for m in msgs)
