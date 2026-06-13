"""Content app PIN auth — same PIN as Melani Health."""

from __future__ import annotations

from health.web_auth import (
    DEFAULT_PIN,
    ensure_web_pin,
    session_token_for_pin,
    verify_pin,
)

CONTENT_SESSION_COOKIE = "content_session"


def pin_ok(cookies: dict) -> bool:
    expected = ensure_web_pin()
    return cookies.get(CONTENT_SESSION_COOKIE) == expected
