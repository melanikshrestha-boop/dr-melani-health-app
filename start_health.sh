#!/usr/bin/env bash
# Start Health Jarvis: web dashboard + Telegram agent
DIR="$(cd "$(dirname "$0")" && pwd)"
PID_AGENT="$HOME/.melani_assistant/agent.pid"
PID_WEB="$HOME/.melani_assistant/web.pid"
LOG="$HOME/.melani_assistant/agent.log"
WEB_LOG="$HOME/.melani_assistant/web.log"

pip3 install -q -r "$DIR/requirements.txt" 2>/dev/null || true

# Dr. Melani image reading — one-time vision model download
chmod +x "$DIR/ensure_vision_model.sh" 2>/dev/null || true
bash "$DIR/ensure_vision_model.sh" 2>/dev/null &

cd "$DIR"
python3 -c "from health.db import init_db; init_db(seed=True); print('Health DB ready.')"

PORT=8781
# Kill ALL old web servers on our ports
kill -9 $(lsof -ti :8765) 2>/dev/null || true
kill -9 $(lsof -ti :8766) 2>/dev/null || true
kill -9 $(lsof -ti :8777) 2>/dev/null || true
kill -9 $(lsof -ti :8778) 2>/dev/null || true
kill -9 $(lsof -ti :8779) 2>/dev/null || true
kill -9 $(lsof -ti :8780) 2>/dev/null || true
kill -9 $(lsof -ti :$PORT) 2>/dev/null || true
pkill -9 -f "uvicorn web.app:app" 2>/dev/null || true
sleep 2

echo "Starting web dashboard on 0.0.0.0:$PORT (auto-updates when code changes) ..."
nohup python3 -m uvicorn web.app:app \
  --host 0.0.0.0 \
  --port "$PORT" \
  --reload \
  --reload-dir "$DIR/web" \
  --reload-dir "$DIR/health" \
  >> "$WEB_LOG" 2>&1 &
WEB_PID=$!
echo $WEB_PID > "$PID_WEB"
# Keep Mac awake while the app runs (so phone link stays alive at home)
nohup caffeinate -dims -w "$WEB_PID" >> /dev/null 2>&1 &
echo $! > "$HOME/.melani_assistant/caffeinate.pid"
sleep 3

# Verify (login page should load)
if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/login" | grep -q 200; then
  echo "Server OK"
else
  echo "Server FAILED — check $WEB_LOG"
  tail -20 "$WEB_LOG"
  exit 1
fi

# Private HTTPS link for phone (works on Wi‑Fi or cellular)
chmod +x "$DIR/start_tunnel.sh" "$DIR/install_tunnel.sh" 2>/dev/null || true
[ -x "$HOME/.melani_assistant/bin/cloudflared" ] || bash "$DIR/install_tunnel.sh" 2>/dev/null || true
PHONE_URL=""
if [ -x "$HOME/.melani_assistant/bin/cloudflared" ]; then
  PHONE_URL=$(bash "$DIR/start_tunnel.sh" "$PORT" 2>/dev/null) || PHONE_URL=""
fi

echo ""
echo "============================================"
if [ -n "$PHONE_URL" ]; then
  echo "  📱 PHONE LINK — bookmark on iPhone:"
  echo "  $PHONE_URL"
  echo ""
  echo "  🔒 PIN: 8299 (your birthday Aug 24)"
  echo "  (Only you — keep link + PIN private)"
else
  echo "  Phone tunnel failed — open on Mac:"
  echo "  http://127.0.0.1:$PORT/login"
fi
echo "  💻 Mac: http://127.0.0.1:$PORT/login"
echo "============================================"

if [ -n "$PHONE_URL" ]; then
  echo "$PHONE_URL" > "$HOME/Desktop/MY HEALTH LINK.txt"
  python3 - <<PY
from pathlib import Path
Path("$HOME/Desktop/MY HEALTH LINK.txt").write_text(
    "📱 YOUR PHONE LINK (bookmark in Safari):\\n\\n"
    + "$PHONE_URL"
    + "\\n\\n🔒 PIN: 8299\\n\\n"
    + "Works on Wi‑Fi or cellular. Keep this link private.\\n"
    + "Your Mac must stay on with the app running.\\n"
)
PY
  echo "(Saved to Desktop → MY HEALTH LINK.txt)"
  echo "$PHONE_URL" | pbcopy 2>/dev/null || true
  echo "  📋 Phone link copied — paste into Messages and text yourself"
else
  LAN=$(ifconfig en0 2>/dev/null | awk '/inet / {print $2; exit}')
  if [ -n "$LAN" ] && [ "$LAN" != "127.0.0.1" ]; then
    FALLBACK="http://${LAN}:$PORT/links"
    echo "  📱 Same Wi‑Fi only: $FALLBACK"
    echo "$FALLBACK" > "$HOME/Desktop/MY HEALTH LINK.txt"
    python3 - <<PY
from pathlib import Path
Path("$HOME/Desktop/MY HEALTH LINK.txt").write_text(
    "📱 SAME Wi‑Fi LINK (phone must be on same Wi‑Fi as Mac):\\n\\n"
    + "$FALLBACK"
    + "\\n\\n🔒 PIN: 8299\\n\\n"
    + "For a link that works anywhere, re-run Restart when online.\\n"
)
PY
  else
    FALLBACK=""
  fi
fi

WRITE_URL="${PHONE_URL:-$FALLBACK}"
python3 "$DIR/organize_health_files.py" "$PORT" "$WRITE_URL" --no-open 2>/dev/null || true
python3 "$DIR/write_phone_page.py" "$PORT" "$WRITE_URL" 2>/dev/null || true
if [ -d "$HOME/Documents/Melani Health" ]; then
  echo ""
  echo "  📁 YOUR FILES (Finder):"
  echo "  Documents → Melani Health"
  echo "  Desktop → Melani Health"
  echo ""
  echo "  📎 Send to phone: Send to Phone - Melani Health.html"
  open "$HOME/Documents/Melani Health" 2>/dev/null || true
  osascript -e 'display notification "Same phone link if tunnel was already running." with title "Melani Health updated ✓" subtitle "PIN 8299 — bookmark /links on iPhone once"' 2>/dev/null || true
fi
echo ""

if [ -f "$PID_AGENT" ] && kill -0 "$(cat "$PID_AGENT")" 2>/dev/null; then
  echo "Telegram agent already running."
else
  echo "Starting Telegram agent..."
  nohup python3 "$DIR/agent.py" >> "$LOG" 2>&1 &
  echo $! > "$PID_AGENT"
fi

echo "Stop: bash $DIR/stop_health.sh"
