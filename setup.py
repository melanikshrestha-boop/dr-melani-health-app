#!/usr/bin/env python3
"""Setup wizard for Melani's Health Jarvis."""

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

CONFIG_DIR = Path.home() / ".melani_assistant"
CONFIG_FILE = CONFIG_DIR / "config.json"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_CONFIG = {
    "telegram_token": "",
    "passphrase_hash": "",
    "session_timeout_minutes": 60,
    "web_pin_hash": "",
    "nudge_hour": 20,
}


def hash_value(s: str) -> str:
    return hashlib.sha256(s.strip().encode()).hexdigest()


def main():
    print("=" * 55)
    print("     Melani Health Jarvis — Setup")
    print("=" * 55)

    cfg = {}
    if CONFIG_FILE.exists():
        cfg = json.loads(CONFIG_FILE.read_text())
        print("Existing config found. Press Enter to keep values.\n")

    token = input(f"Telegram bot token [{cfg.get('telegram_token', '')[:8]}...]: ").strip()
    if token:
        cfg["telegram_token"] = token
    elif cfg.get("telegram_token"):
        pass
    else:
        print("Telegram token required.")
        sys.exit(1)

    phrase = input("Unlock passphrase (for Telegram): ").strip()
    if phrase:
        cfg["passphrase_hash"] = hash_value(phrase)
    elif not cfg.get("passphrase_hash"):
        print("Passphrase required.")
        sys.exit(1)

    pin = input("Web dashboard PIN [1234]: ").strip() or "1234"
    cfg["web_pin_hash"] = hash_value(pin)

    for k, v in DEFAULT_CONFIG.items():
        cfg.setdefault(k, v)

    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))
    os.chmod(CONFIG_FILE, 0o600)

    subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"], check=False)

    sys.path.insert(0, str(Path(__file__).parent))
    from health.db import init_db
    init_db(seed=True)

    print("\nSetup complete.")
    print("Start: bash start_health.sh")
    print(f"Config: {CONFIG_FILE}")


if __name__ == "__main__":
    main()
