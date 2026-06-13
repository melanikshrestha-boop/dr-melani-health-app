#!/usr/bin/env bash
# One command to fix stale/empty Gym page — kills stuck servers, starts fresh
set -e
echo "Stopping old servers..."
for port in 8765 8766 8777 8778 8779; do
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "  Killing port $port: $pids"
    kill -9 $pids 2>/dev/null || true
  fi
done
pkill -9 -f "uvicorn web.app:app" 2>/dev/null || true
sleep 2

if lsof -ti :8765 >/dev/null 2>&1; then
  echo ""
  echo "ERROR: Port 8765 still in use. Run this in Terminal, then retry:"
  echo "  kill -9 \$(lsof -ti :8765 :8766)"
  echo ""
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$DIR/start_health.sh"
