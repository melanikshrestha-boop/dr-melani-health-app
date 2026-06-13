#!/usr/bin/env bash
# Print the URL to open on your phone
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
PORT=8779

if ! lsof -i :$PORT -sTCP:LISTEN 2>/dev/null | grep -q ":$PORT"; then
  echo "Server not running."
  echo "Double-click Restart Health App on Desktop, or run: bash start_health.sh"
  exit 1
fi

IP=$(python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.connect(('8.8.8.8', 80))
print(s.getsockname()[0])
s.close()
" 2>/dev/null || echo "127.0.0.1")

echo ""
echo "📱 PHONE (same Wi-Fi) — bookmark this:"
echo "   http://${IP}:${PORT}/links"
echo ""
echo "🏋️ Gym today:"
echo "   http://${IP}:${PORT}/gym/monday"
echo ""
