#!/usr/bin/env bash
# Health server watchdog — restarts Melani Health if the web app stops responding.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=8781
LOG="$HOME/.melani_assistant/watchdog.log"
WEB_LOG="$HOME/.melani_assistant/web.log"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"

health_ok() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 5 "http://127.0.0.1:${PORT}/healthz" 2>/dev/null || echo "000")
  [ "$code" = "200" ]
}

mkdir -p "$HOME/.melani_assistant"

if health_ok; then
  exit 0
fi

echo "[$STAMP] Health check failed on :$PORT — restarting..." >> "$LOG"
bash "$DIR/stop_health.sh" >> "$LOG" 2>&1 || true
sleep 2
if bash "$DIR/start_health.sh" >> "$LOG" 2>&1; then
  echo "[$STAMP] Restart OK" >> "$LOG"
  osascript -e 'display notification "Melani Health restarted itself." with title "Health app recovered"' 2>/dev/null || true
else
  echo "[$STAMP] Restart FAILED — see $WEB_LOG" >> "$LOG"
  tail -5 "$WEB_LOG" >> "$LOG" 2>/dev/null || true
  exit 1
fi
