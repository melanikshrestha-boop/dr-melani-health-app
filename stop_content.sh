#!/usr/bin/env bash
PORT=8782
kill -9 $(lsof -ti :$PORT) 2>/dev/null || true
pkill -9 -f "uvicorn web.content_app:app" 2>/dev/null || true
pkill -f "cloudflared tunnel --url http://127.0.0.1:$PORT" 2>/dev/null || true
for PID_FILE in "$HOME/.melani_assistant/content_web.pid" "$HOME/.melani_assistant/content_tunnel.pid" "$HOME/.melani_assistant/content_caffeinate.pid"; do
  if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
done
echo "Melani Content stopped."
