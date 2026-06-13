#!/usr/bin/env bash
# Private HTTPS link for your phone (Cloudflare Tunnel — works on Wi‑Fi or cellular)
set -e
CF="$HOME/.melani_assistant/bin/cloudflared"
LOG="$HOME/.melani_assistant/tunnel.log"
PID_FILE="$HOME/.melani_assistant/tunnel.pid"
URL_FILE="$HOME/.melani_assistant/phone_url.json"
PORT="${1:-8781}"

if [ ! -x "$CF" ]; then
  echo "cloudflared missing — run: bash $(dirname "$0")/install_tunnel.sh"
  exit 1
fi

reuse_tunnel() {
  if [ ! -f "$PID_FILE" ] || [ ! -f "$URL_FILE" ]; then
    return 1
  fi
  local pid tunnel_url links_url
  pid=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
    return 1
  fi
  read -r tunnel_url links_url <<PYOUT
$(python3 - <<PY
import json
from pathlib import Path
try:
    d = json.loads(Path("$URL_FILE").read_text())
except Exception:
    print("")
    print("")
else:
    t = (d.get("tunnel_url") or "").rstrip("/")
    u = d.get("url") or (t + "/links" if t else "")
    print(t)
    print(u)
PY
)
PYOUT
  if [ -z "$tunnel_url" ]; then
    return 1
  fi
  if curl -sf --max-time 10 -o /dev/null "${tunnel_url}/login" 2>/dev/null; then
    echo "${links_url:-${tunnel_url}/links}"
    return 0
  fi
  return 1
}

if reuse_tunnel; then
  exit 0
fi

if [ -f "$PID_FILE" ]; then
  old=$(cat "$PID_FILE")
  kill "$old" 2>/dev/null || true
fi
pkill -f "cloudflared tunnel --url http://127.0.0.1:$PORT" 2>/dev/null || true
sleep 1

: > "$LOG"
nohup "$CF" tunnel --url "http://127.0.0.1:$PORT" >> "$LOG" 2>&1 &
echo $! > "$PID_FILE"

URL=""
for _ in $(seq 1 45); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | grep -v 'api\.trycloudflare' | tail -1 || true)
  if [ -n "$URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$URL" ]; then
  echo "Tunnel failed — last lines:" >&2
  tail -8 "$LOG" >&2
  exit 1
fi

python3 - <<PY
import json
from datetime import datetime
from pathlib import Path
url = "$URL"
path = Path("$URL_FILE")
data = {}
if path.exists():
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        data = {}
data.update({
    "url": url + "/links",
    "tunnel_url": url,
    "type": "cloudflare_tunnel",
    "port": $PORT,
    "updated_at": datetime.now().isoformat(),
    "note": "Private HTTPS link. PIN required (8299). Same URL while tunnel stays running on your Mac.",
})
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(data, indent=2))
print(data["url"])
PY
