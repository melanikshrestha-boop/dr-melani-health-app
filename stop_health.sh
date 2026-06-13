#!/usr/bin/env bash
for port in 8765 8766 8777 8778 8779 8780 8781; do
  kill -9 $(lsof -ti :$port) 2>/dev/null || true
done
pkill -9 -f "uvicorn web.app:app" 2>/dev/null || true
pkill -f "cloudflared tunnel --url" 2>/dev/null || true
for PID_FILE in "$HOME/.melani_assistant/agent.pid" "$HOME/.melani_assistant/web.pid" "$HOME/.melani_assistant/tunnel.pid" "$HOME/.melani_assistant/caffeinate.pid"; do
  if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
done
echo "Stopped."
