from __future__ import annotations

import hashlib
import json
from pathlib import Path

CONFIG_FILE = Path.home() / ".melani_assistant" / "config.json"
DEFAULT_PIN = "8299"  # Aug 24 — Melani's birthday, easy to remember
SESSION_COOKIE = "health_session"


def _hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.strip().encode()).hexdigest()


def ensure_web_pin() -> str:
    """Ensure config has web_pin_hash; returns hash."""
    cfg = {}
    if CONFIG_FILE.exists():
        cfg = json.loads(CONFIG_FILE.read_text())
    h = cfg.get("web_pin_hash") or ""
    if not h:
        h = _hash_pin(DEFAULT_PIN)
        cfg["web_pin_hash"] = h
        CONFIG_FILE.write_text(json.dumps(cfg, indent=2))
    return h


def pin_ok(cookies: dict) -> bool:
    expected = ensure_web_pin()
    return cookies.get(SESSION_COOKIE) == expected


def verify_pin(pin: str) -> bool:
    return _hash_pin(pin) == ensure_web_pin()


def session_token_for_pin(pin: str) -> str | None:
    if verify_pin(pin):
        return ensure_web_pin()
    return None
