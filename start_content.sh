#!/usr/bin/env bash
# Start Melani Content: web dashboard on port 8782
DIR="$(cd "$(dirname "$0")" && pwd)"
PID_WEB="$HOME/.melani_assistant/content_web.pid"
WEB_LOG="$HOME/.melani_assistant/content_web.log"
PORT=8782

pip3 install -q -r "$DIR/requirements.txt" 2>/dev/null || true

PY="python3"
if command -v python3.12 >/dev/null 2>&1; then
  PY="python3.12"
fi

cd "$DIR"
$PY -c "from content.db import init_db; init_db(); print('Content DB ready.')"

kill -9 $(lsof -ti :$PORT) 2>/dev/null || true
pkill -9 -f "uvicorn web.content_app:app" 2>/dev/null || true
sleep 1

echo "Starting Melani Content on 0.0.0.0:$PORT ..."
nohup $PY -m uvicorn web.content_app:app \
  --host 0.0.0.0 \
  --port "$PORT" \
  --reload \
  --reload-dir "$DIR/web" \
  --reload-dir "$DIR/content" \
  >> "$WEB_LOG" 2>&1 &
WEB_PID=$!
echo $WEB_PID > "$PID_WEB"
nohup caffeinate -dims -w "$WEB_PID" >> /dev/null 2>&1 &
echo $! > "$HOME/.melani_assistant/content_caffeinate.pid"
sleep 3

if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/login" | grep -q 200; then
  echo "Server OK"
else
  echo "Server FAILED — check $WEB_LOG"
  tail -20 "$WEB_LOG"
  exit 1
fi

chmod +x "$DIR/start_content_tunnel.sh" "$DIR/install_tunnel.sh" 2>/dev/null || true
[ -x "$HOME/.melani_assistant/bin/cloudflared" ] || bash "$DIR/install_tunnel.sh" 2>/dev/null || true
PHONE_URL=""
if [ -x "$HOME/.melani_assistant/bin/cloudflared" ]; then
  PHONE_URL=$(bash "$DIR/start_content_tunnel.sh" "$PORT" 2>/dev/null) || PHONE_URL=""
fi

echo ""
echo "============================================"
if [ -n "$PHONE_URL" ]; then
  echo "  📱 PHONE LINK — bookmark on iPhone:"
  echo "  $PHONE_URL"
  echo ""
  echo "  🔒 PIN: 8299"
else
  echo "  Phone tunnel failed — open on Mac:"
  echo "  http://127.0.0.1:$PORT/"
fi
echo "  💻 Mac: http://127.0.0.1:$PORT/"
echo "  ↻ Refresh any tab to get the latest — one link only"
echo "============================================"

WRITE_URL="${PHONE_URL:-http://127.0.0.1:$PORT/}"
python3 "$DIR/organize_content_files.py" "$PORT" "$WRITE_URL" --no-open 2>/dev/null || true
python3 "$DIR/write_content_phone_page.py" "$PORT" "$WRITE_URL" 2>/dev/null || true

if [ -d "$HOME/Documents/Melani Content" ]; then
  echo ""
  echo "  📁 YOUR FILES (Finder):"
  echo "  Documents → Melani Content"
  echo "  Desktop → Melani Content"
  open "$HOME/Documents/Melani Content" 2>/dev/null || true
fi
echo ""
echo "Stop: bash $DIR/stop_content.sh"
