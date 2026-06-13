#!/usr/bin/env python3
"""Put all Melani Health shortcuts in one obvious folder + open Finder."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from write_phone_page import PIN, write_html

PORT = 8781
FOLDERS = [
    Path.home() / "Documents" / "Melani Health",
    Path.home() / "Desktop" / "Melani Health",
]
PHONE_JSON = Path.home() / ".melani_assistant" / "phone_url.json"
RESTART_SRC = Path(__file__).resolve().parent / "1 - DOUBLE CLICK THIS FIRST.command"


def _link_info(port: int, override: str | None) -> tuple[str, str, str]:
    """Return (phone_links_url, mac_url, short_note)."""
    mac = f"http://127.0.0.1:{port}/login"
    if override and "api.trycloudflare" not in override:
        phone = override if override.endswith("/links") else f"{override.rstrip('/')}/links"
        if phone.startswith("https://"):
            note = "Works on Wi‑Fi or cellular"
        else:
            note = "Phone must be on the same Wi‑Fi as your Mac"
        return phone, mac, note

    if PHONE_JSON.exists():
        try:
            data = json.loads(PHONE_JSON.read_text())
            tunnel = (data.get("tunnel_url") or "").rstrip("/")
            url = (data.get("url") or "").replace("/links", "").rstrip("/")
            candidate = tunnel or url
            if candidate and "api.trycloudflare" not in candidate:
                phone = f"{candidate}/links"
                note = (
                    "Works on Wi‑Fi or cellular"
                    if candidate.startswith("https://")
                    else "Phone must be on the same Wi‑Fi as your Mac"
                )
                return phone, mac, note
        except (json.JSONDecodeError, OSError):
            pass

    return "", mac, "Double-click Turn On Melani Health — this file updates with your link"


def _write_text(folder: Path, name: str, body: str) -> None:
    (folder / name).write_text(body, encoding="utf-8")


def _write_mac_html(folder: Path, port: int) -> None:
    mac = f"http://127.0.0.1:{port}/login"
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Melani Health — Mac</title>
  <style>
    body {{ font-family: -apple-system, sans-serif; background: #191919; color: #fff;
      padding: 40px; text-align: center; }}
    a {{ display: inline-block; background: #2383e2; color: #fff; text-decoration: none;
      padding: 18px 28px; border-radius: 14px; font-size: 1.1rem; font-weight: 600; }}
    p {{ color: #888; max-width: 380px; margin: 16px auto; line-height: 1.6; }}
  </style>
</head>
<body>
  <h1>Melani Health</h1>
  <p>PIN: <strong>{PIN}</strong></p>
  <a href="{mac}">Open on this Mac</a>
</body>
</html>
"""
    (folder / "Open on Mac.html").write_text(html, encoding="utf-8")


def organize(port: int = PORT, override_url: str | None = None, open_finder: bool = True) -> Path:
    phone_url, mac_url, note = _link_info(port, override_url or None)
    primary = FOLDERS[0]

    for folder in FOLDERS:
        folder.mkdir(parents=True, exist_ok=True)

    html_path = write_html(port, override_url or None)
    phone_html = html_path.read_text(encoding="utf-8")

    link_body = f"""MELANI HEALTH — YOUR PHONE LINK
Updated: {datetime.now().strftime("%B %d, %Y at %I:%M %p")}

"""
    if phone_url:
        link_body += f"""📱 PHONE — copy this link (text it to yourself in Messages):

{phone_url}

🔒 PIN: {PIN}

{note}
Your Mac must stay ON at home (plugged in, lid open or plugged in).
Do NOT close the black window after double-clicking start.
"""
        text_phone = f"""TEXT THIS TO YOUR PHONE
======================

1. Select and copy the link below (Command+C)
2. Open Messages on your Mac
3. Start a text to YOURSELF (your own phone number)
4. Paste the link and send
5. On iPhone, tap the link → PIN {PIN}

{phone_url}

PIN: {PIN}
"""
    else:
        link_body += f"""📱 PHONE LINK — not ready yet.

Double-click "1 - DOUBLE CLICK THIS FIRST.command" in this folder.
Wait 20 seconds. This file will update automatically.

🔒 PIN: {PIN}
"""

    link_body += f"""
💻 MAC (this computer only):
{mac_url}
"""

    start_here = f"""MELANI HEALTH — START HERE
============================

WHEN NEW FEATURES ARE ADDED (or anything looks old):
   Double-click "1 - DOUBLE CLICK THIS FIRST.command"
   Wait 20 seconds. Done — Mac has the latest version.

YOUR DATA (meals, gym checks, grocery) is saved automatically.
You never lose it when you update.

PHONE after an update or if phone stops working:
   • Double-click "1 - DOUBLE CLICK THIS FIRST.command" on your Mac
   • Open "TEXT THIS TO YOUR PHONE.txt"
   • Copy the link → text it to yourself in Messages (no AirDrop needed)

WHY PHONE STOPPED? Your Mac at home probably slept. Keep it plugged in
and on after you start the app. We now keep it awake automatically.

FIRST TIME SETUP
================

STEP 1 — Double-click:
   1 - DOUBLE CLICK THIS FIRST.command

STEP 2 — Wait ~20 seconds.

STEP 3 — Mac: open Open on Mac.html (or http://127.0.0.1:8781/login)
   PIN: {PIN}

STEP 4 — Phone: open TEXT THIS TO YOUR PHONE.txt → copy link →
   text it to yourself in Messages

Files in this folder:
• 1 - DOUBLE CLICK THIS FIRST.command  ← turn on + get updates
• TEXT THIS TO YOUR PHONE.txt  ← copy link, text to yourself
• MY PHONE LINK.txt  ← same link + instructions
• Send to Phone - Melani Health.html  ← optional (AirDrop)
• Open on Mac.html  ← open on this Mac
"""

    text_phone_body = ""
    if phone_url:
        text_phone_body = f"""TEXT THIS TO YOUR PHONE
======================

Copy the link below. Open Messages. Text it to YOURSELF.
On iPhone, tap the link. Enter PIN {PIN}.

{phone_url}

PIN: {PIN}
"""

    for folder in FOLDERS:
        (folder / "Send to Phone - Melani Health.html").write_text(phone_html, encoding="utf-8")
        _write_text(folder, "MY PHONE LINK.txt", link_body)
        if text_phone_body:
            _write_text(folder, "TEXT THIS TO YOUR PHONE.txt", text_phone_body)
        _write_text(folder, "START HERE.txt", start_here)
        _write_mac_html(folder, port)
        if RESTART_SRC.exists():
            dest = folder / "1 - DOUBLE CLICK THIS FIRST.command"
            shutil.copy2(RESTART_SRC, dest)
            dest.chmod(0o755)

    # Legacy Desktop shortcuts — point into the folder
    legacy_restart = Path.home() / "Desktop" / "Restart Health App.command"
    legacy_restart.write_text(
        '#!/bin/bash\nopen "$HOME/Documents/Melani Health/1 - DOUBLE CLICK THIS FIRST.command"\n',
        encoding="utf-8",
    )
    legacy_restart.chmod(0o755)

    if open_finder:
        subprocess.run(["open", str(primary)], check=False)

    if phone_url:
        subprocess.run(
            [
                "osascript",
                "-e",
                f'display notification "{phone_url}" with title "Melani Health — phone link ready" subtitle "PIN {PIN}"',
            ],
            check=False,
        )

    return primary


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    url = sys.argv[2] if len(sys.argv) > 2 else None
    open_f = "--no-open" not in sys.argv
    path = organize(port, url or None, open_finder=open_f)
    print(path)
