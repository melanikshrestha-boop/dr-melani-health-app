#!/usr/bin/env python3
"""Put all Melani Content shortcuts in Documents + Desktop folders."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from write_content_phone_page import PIN, write_html

PORT = 8782
FOLDERS = [
    Path.home() / "Documents" / "Melani Content",
    Path.home() / "Desktop" / "Melani Content",
]
PHONE_JSON = Path.home() / ".melani_assistant" / "content_phone_url.json"
RESTART_SRC = Path(__file__).resolve().parent / "1 - DOUBLE CLICK START CONTENT.command"


def _link_info(port: int, override: str | None) -> tuple[str, str, str]:
    mac = f"http://127.0.0.1:{port}/"
    if override and "api.trycloudflare" not in override:
        phone = override.rstrip("/") + "/"
        note = "Works on Wi‑Fi or cellular — refresh tab anytime for updates"
        return phone, mac, note
    if PHONE_JSON.exists():
        try:
            data = json.loads(PHONE_JSON.read_text())
            candidate = (data.get("tunnel_url") or data.get("url") or "").replace("/links", "").rstrip("/")
            if candidate and "api.trycloudflare" not in candidate:
                phone = f"{candidate}/"
                note = "Works on Wi‑Fi or cellular — refresh tab anytime for updates"
                return phone, mac, note
        except (json.JSONDecodeError, OSError):
            pass
    return "", mac, "Double-click start command — bookmark ONE link from MY PHONE LINK.txt"


def organize(port: int = PORT, override_url: str | None = None, open_finder: bool = True) -> Path:
    phone_url, mac_url, note = _link_info(port, override_url)
    primary = FOLDERS[0]
    for folder in FOLDERS:
        folder.mkdir(parents=True, exist_ok=True)

    html_path = write_html(port, override_url)
    phone_html = html_path.read_text(encoding="utf-8")

    link_body = f"""MELANI CONTENT — YOUR PHONE LINK
Updated: {datetime.now().strftime("%B %d, %Y at %I:%M %p")}

"""
    if phone_url:
        link_body += f"""📱 ONE LINK — bookmark this in Safari on your phone:

{phone_url}

🔒 PIN: {PIN}

{note}
Pull down to refresh anytime — you always get the latest version.
Mac must stay ON while you use the app.
"""
    else:
        link_body += f"""📱 PHONE LINK — not ready yet.
Double-click "1 - DOUBLE CLICK START CONTENT.command"

🔒 PIN: {PIN}
"""

    link_body += f"""
💻 MAC: {mac_url}
"""

    start_here = f"""MELANI CONTENT — START HERE
============================

STEP 1 — Double-click:
   1 - DOUBLE CLICK START CONTENT.command

STEP 2 — Wait ~20 seconds.

STEP 3 — Mac: open Open on Mac.html (or http://127.0.0.1:8782/)
   PIN: {PIN}

STEP 4 — Phone: bookmark the ONE link in MY PHONE LINK.txt
   After updates, just refresh — no new links

WHAT THIS APP DOES
• Your private Repurpose.io — upload once, auto-post everywhere
• Refresh any tab to see latest queue, workflows, and posts
• Connect platforms in Setup tab (free APIs)
"""

    for folder in FOLDERS:
        (folder / "Send to Phone - Melani Content.html").write_text(phone_html, encoding="utf-8")
        (folder / "MY PHONE LINK.txt").write_text(link_body, encoding="utf-8")
        (folder / "START HERE.txt").write_text(start_here, encoding="utf-8")
        mac_html = f"""<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Melani Content</title>
<style>body{{font-family:-apple-system,sans-serif;background:#191919;color:#fff;padding:40px;text-align:center}}
a{{display:inline-block;background:#a855f7;color:#fff;text-decoration:none;padding:18px 28px;border-radius:14px;font-weight:600}}</style></head>
<body><h1>Melani Content</h1><p>PIN: <strong>{PIN}</strong></p>
<a href="{mac_url}">Open Melani Content on this Mac</a></body></html>"""
        (folder / "Open on Mac.html").write_text(mac_html, encoding="utf-8")
        if RESTART_SRC.exists():
            dest = folder / RESTART_SRC.name
            shutil.copy2(RESTART_SRC, dest)
            dest.chmod(0o755)

    if open_finder:
        subprocess.run(["open", str(primary)], check=False)
    return primary


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    url = sys.argv[2] if len(sys.argv) > 2 else None
    open_f = "--no-open" not in sys.argv
    print(organize(port, url or None, open_finder=open_f))
