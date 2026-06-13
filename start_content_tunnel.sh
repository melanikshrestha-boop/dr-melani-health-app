#!/usr/bin/env bash
set -e
CF="$HOME/.melani_assistant/bin/cloudflared"
LOG="$HOME/.melani_assistant/content_tunnel.log"
PID_FILE="$HOME/.melani_assistant/content_tunnel.pid"
URL_FILE="$HOME/.melani_assistant/content_phone_url.json"
PORT="${1:-8782}"

if [ ! -x "$CF" ]; then
  echo "cloudflared missing — run: bash $(dirname "$0")/install_tunnel.sh"
  exit 1
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
data = {
    "url": url + "/",
    "tunnel_url": url,
    "type": "cloudflare_tunnel",
    "port": $PORT,
    "updated_at": datetime.now().isoformat(),
    "note": "Melani Content — PIN 8299",
}
Path("$URL_FILE").write_text(json.dumps(data, indent=2))
cfg_path = Path.home() / ".melani_assistant" / "content_config.json"
if cfg_path.exists():
    cfg = json.loads(cfg_path.read_text())
else:
    cfg = {}
cfg["public_video_base_url"] = url
cfg_path.write_text(json.dumps(cfg, indent=2))
print(data["url"])
PY
