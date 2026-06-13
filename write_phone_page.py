#!/usr/bin/env python3
"""Write Desktop HTML file Melani can AirDrop / text to her iPhone."""

from __future__ import annotations

import json
import socket
import sys
from pathlib import Path

DESKTOP = Path.home() / "Desktop"
OUT = DESKTOP / "Send to Phone - Melani Health.html"
PHONE_JSON = Path.home() / ".melani_assistant" / "phone_url.json"
PIN = "8299"
DEFAULT_PORT = 8781


def _lan_ip() -> str:
    import subprocess

    try:
        out = subprocess.run(
            ["ifconfig", "en0"],
            capture_output=True,
            text=True,
            timeout=2,
        )
        for line in out.stdout.splitlines():
            if "inet " in line and "127.0.0.1" not in line:
                parts = line.split()
                idx = parts.index("inet")
                ip = parts[idx + 1]
                if ip and not ip.startswith("127."):
                    return ip
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
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
    """Return (base_url, mode_label)."""
    if PHONE_JSON.exists():
        try:
            data = json.loads(PHONE_JSON.read_text())
            tunnel = (data.get("tunnel_url") or "").rstrip("/")
            url = (data.get("url") or "").replace("/links", "").rstrip("/")
            candidate = tunnel or url
            if candidate and "api.trycloudflare" not in candidate:
                return candidate, "Works on Wi‑Fi or cellular"
        except (json.JSONDecodeError, OSError):
            pass

    ip = _lan_ip()
    if ip:
        return f"http://{ip}:{port}", "Same Wi‑Fi as your Mac only"

    return f"http://127.0.0.1:{port}", "Mac only — run Restart Health App first, then send this file again"


def write_html(port: int = DEFAULT_PORT, override_url: str | None = None) -> Path:
    if override_url:
        base = override_url.replace("/links", "").rstrip("/")
        if "api.trycloudflare" not in base:
            mode = (
                "Works on Wi‑Fi or cellular"
                if base.startswith("https://")
                else "Same Wi‑Fi as your Mac only"
            )
        else:
            base, mode = _pick_base_url(port)
    else:
        base, mode = _pick_base_url(port)
    login = f"{base}/login"
    links = [
        ("Open Melani Health", f"{base}/links"),
        ("Today", f"{base}/"),
        ("Meals", f"{base}/meals"),
        ("Gym", f"{base}/gym"),
        ("Hygiene", f"{base}/hygiene"),
        ("Shop", f"{base}/grocery"),
        ("Labs", f"{base}/labs"),
    ]
    btn = "\n".join(
        f'  <a class="btn" href="{href}">{label}</a>' for label, href in links
    )
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Melani Health">
  <title>Melani Health</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #191919;
      color: #fff;
      margin: 0;
      padding: 24px 20px 40px;
      max-width: 420px;
      margin-inline: auto;
    }}
    h1 {{ font-size: 1.5rem; margin: 0 0 8px; }}
    .sub {{ color: #888; font-size: 0.95rem; line-height: 1.5; margin-bottom: 20px; }}
    .pin {{
      background: #2a2a2a;
      border-radius: 12px;
      padding: 16px;
      text-align: center;
      margin-bottom: 24px;
    }}
    .pin strong {{ font-size: 2rem; letter-spacing: 0.15em; display: block; margin-top: 6px; }}
    .btn {{
      display: block;
      background: #2383e2;
      color: #fff !important;
      text-decoration: none;
      padding: 18px;
      border-radius: 14px;
      margin-bottom: 12px;
      text-align: center;
      font-size: 1.05rem;
      font-weight: 600;
    }}
    .btn:first-of-type {{ background: #22c55e; font-size: 1.15rem; }}
    .note {{ color: #666; font-size: 0.85rem; line-height: 1.5; margin-top: 20px; }}
  </style>
</head>
<body>
  <h1>Melani Health</h1>
  <p class="sub">Tap a button below. When asked, enter your PIN.<br><em>{mode}</em></p>
  <div class="pin">
    Your PIN
    <strong>{PIN}</strong>
  </div>
{btn}
  <p class="note">Your Mac must be on. If links fail, double‑click <strong>Restart Health App</strong> on your Mac, then send this file to your phone again.</p>
</body>
</html>
"""
    OUT.write_text(html, encoding="utf-8")
    for folder in (
        Path.home() / "Documents" / "Melani Health",
        Path.home() / "Desktop" / "Melani Health",
    ):
        folder.mkdir(parents=True, exist_ok=True)
        (folder / OUT.name).write_text(html, encoding="utf-8")
    return OUT


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    url = sys.argv[2] if len(sys.argv) > 2 else None
    path = write_html(port, url or None)
    print(path)
