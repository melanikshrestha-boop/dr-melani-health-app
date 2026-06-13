#!/usr/bin/env python3
"""Write Desktop HTML for Melani Content — ONE bookmark link only."""

from __future__ import annotations

import json
import socket
import sys
from pathlib import Path

DESKTOP = Path.home() / "Desktop" / "Melani Content"
OUT = DESKTOP / "Send to Phone - Melani Content.html"
PHONE_JSON = Path.home() / ".melani_assistant" / "content_phone_url.json"
PIN = "8299"
DEFAULT_PORT = 8782


def _lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            return ip
    except OSError:
        pass
    return ""


def _pick_base_url(port: int) -> tuple[str, str]:
    if PHONE_JSON.exists():
        try:
            data = json.loads(PHONE_JSON.read_text())
            candidate = (data.get("tunnel_url") or data.get("url") or "").replace("/links", "").rstrip("/")
            if candidate and "api.trycloudflare" not in candidate:
                mode = "Works on Wi‑Fi or cellular" if candidate.startswith("https://") else "Same Wi‑Fi only"
                return candidate, mode
        except (json.JSONDecodeError, OSError):
            pass
    ip = _lan_ip()
    if ip:
        return f"http://{ip}:{port}", "Same Wi‑Fi as your Mac only"
    return f"http://127.0.0.1:{port}", "Mac only — start Melani Content first"


def write_html(port: int = DEFAULT_PORT, override_url: str | None = None) -> Path:
    if override_url:
        base = override_url.replace("/links", "").rstrip("/")
        mode = "Works on Wi‑Fi or cellular" if base.startswith("https://") else "Same Wi‑Fi only"
    else:
        base, mode = _pick_base_url(port)
    app_url = f"{base}/"
    html = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<title>Melani Content</title>
<style>
body{{font-family:-apple-system,sans-serif;background:#191919;color:#fff;padding:24px;max-width:420px;margin:0 auto}}
h1{{font-size:1.5rem}} .sub{{color:#888;line-height:1.5;margin-bottom:20px}}
.pin{{background:#2a2a2a;border-radius:12px;padding:16px;text-align:center;margin-bottom:24px}}
.pin strong{{font-size:2rem;letter-spacing:0.15em;display:block;margin-top:6px}}
.btn{{display:block;background:#22c55e;color:#fff!important;text-decoration:none;padding:20px;border-radius:14px;margin-bottom:16px;text-align:center;font-weight:700;font-size:1.15rem}}
.note{{color:#666;font-size:0.85rem;line-height:1.5}}
code{{color:#c084fc;word-break:break-all}}
</style></head><body>
<h1>Melani Content</h1>
<p class="sub">Bookmark <strong>one link</strong> on your phone. Pull to refresh anytime — always the latest app.<br><em>{mode}</em></p>
<div class="pin">Your PIN<strong>{PIN}</strong></div>
<a class="btn" href="{app_url}">Open Melani Content</a>
<p class="note">Bookmark this page, or copy this URL into Safari:<br><code>{app_url}</code><br><br>After app updates on your Mac, just refresh — no new links needed.</p>
</body></html>"""
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    docs = Path.home() / "Documents" / "Melani Content"
    docs.mkdir(parents=True, exist_ok=True)
    (docs / OUT.name).write_text(html, encoding="utf-8")
    return OUT


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    url = sys.argv[2] if len(sys.argv) > 2 else None
    print(write_html(port, url or None))
