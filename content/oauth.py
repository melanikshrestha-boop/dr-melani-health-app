"""OAuth token storage with local encryption."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
from datetime import datetime
from pathlib import Path
from typing import Any

from .db import get_conn
from .paths import CONFIG_DIR, TOKEN_DIR, ensure_dirs

try:
    from cryptography.fernet import Fernet
except ImportError:
    Fernet = None  # type: ignore


def _fernet() -> "Fernet | None":
    if Fernet is None:
        return None
    key_file = CONFIG_DIR / "content_token.key"
    if key_file.exists():
        key = key_file.read_bytes()
    else:
        key = Fernet.generate_key()
        key_file.write_bytes(key)
        key_file.chmod(0o600)
    return Fernet(key)


def _encrypt(data: str) -> str:
    f = _fernet()
    if f:
        return f.encrypt(data.encode()).decode()
    return base64.b64encode(data.encode()).decode()


def _decrypt(data: str) -> str:
    f = _fernet()
    if f:
        return f.decrypt(data.encode()).decode()
    return base64.b64decode(data.encode()).decode()


def save_tokens(platform: str, tokens: dict[str, Any], account_name: str = "") -> None:
    ensure_dirs()
    payload = _encrypt(json.dumps(tokens))
    now = datetime.now().isoformat(timespec="seconds")
    expires = tokens.get("expires_at") or tokens.get("expires_in")
    if isinstance(expires, (int, float)):
        expires_at = datetime.fromtimestamp(datetime.now().timestamp() + float(expires)).isoformat(
            timespec="seconds"
        )
    else:
        expires_at = str(expires) if expires else None
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO platform_accounts (platform, account_name, token_json, connected_at, expires_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(platform) DO UPDATE SET
              account_name = excluded.account_name,
              token_json = excluded.token_json,
              connected_at = excluded.connected_at,
              expires_at = excluded.expires_at
            """,
            (platform, account_name, payload, now, expires_at),
        )
    (TOKEN_DIR / f"{platform}.json").write_text(json.dumps({"connected": True, "at": now}))


def get_tokens(platform: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT token_json FROM platform_accounts WHERE platform = ?", (platform,)
        ).fetchone()
    if not row:
        return None
    try:
        return json.loads(_decrypt(row["token_json"]))
    except (json.JSONDecodeError, OSError, ValueError):
        return None


def is_connected(platform: str) -> bool:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM platform_accounts WHERE platform = ?", (platform,)
        ).fetchone()
    return row is not None


def disconnect(platform: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM platform_accounts WHERE platform = ?", (platform,))
    token_file = TOKEN_DIR / f"{platform}.json"
    if token_file.exists():
        token_file.unlink()


def account_info(platform: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT platform, account_name, connected_at, expires_at FROM platform_accounts WHERE platform = ?",
            (platform,),
        ).fetchone()
    return dict(row) if row else None


def all_accounts() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT platform, account_name, connected_at, expires_at FROM platform_accounts"
        ).fetchall()
    return [dict(r) for r in rows]


def oauth_state_store() -> Path:
    path = CONFIG_DIR / "oauth_states.json"
    if not path.exists():
        path.write_text("{}")
    return path


def new_oauth_state(platform: str) -> str:
    state = secrets.token_urlsafe(24)
    store = json.loads(oauth_state_store().read_text())
    store[state] = {"platform": platform, "at": datetime.now().isoformat()}
    oauth_state_store().write_text(json.dumps(store))
    return state


def pop_oauth_state(state: str) -> str | None:
    store = json.loads(oauth_state_store().read_text())
    entry = store.pop(state, None)
    oauth_state_store().write_text(json.dumps(store))
    return entry["platform"] if entry else None
