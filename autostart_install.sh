#!/usr/bin/env bash
# Install LaunchAgents so Melani Health auto-starts at login and self-heals.
DIR="$(cd "$(dirname "$0")" && pwd)"
HEALTH_PLIST="$HOME/Library/LaunchAgents/com.melani.health.plist"
WATCH_PLIST="$HOME/Library/LaunchAgents/com.melani.health.watchdog.plist"

chmod +x "$DIR/start_health.sh" "$DIR/stop_health.sh" "$DIR/health_watchdog.sh"

cat > "$HEALTH_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.melani.health</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${DIR}/start_health.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>${HOME}/.melani_assistant/launchd-health.log</string>
    <key>StandardErrorPath</key>
    <string>${HOME}/.melani_assistant/launchd-health.log</string>
</dict>
</plist>
EOF

cat > "$WATCH_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.melani.health.watchdog</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${DIR}/health_watchdog.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>300</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${HOME}/.melani_assistant/watchdog.log</string>
    <key>StandardErrorPath</key>
    <string>${HOME}/.melani_assistant/watchdog.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/com.melani.assistant" 2>/dev/null || launchctl unload "$HOME/Library/LaunchAgents/com.melani.assistant.plist" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$HEALTH_PLIST" 2>/dev/null || launchctl load "$HEALTH_PLIST"
launchctl bootstrap "gui/$(id -u)" "$WATCH_PLIST" 2>/dev/null || launchctl load "$WATCH_PLIST"

echo "Auto-start installed."
echo "  • Full stack at login: start_health.sh (web + Telegram)"
echo "  • Watchdog every 5 min: health_watchdog.sh"
echo ""
echo "To remove:"
echo "  launchctl bootout gui/\$(id -u)/com.melani.health"
echo "  launchctl bootout gui/\$(id -u)/com.melani.health.watchdog"
echo "  rm $HEALTH_PLIST $WATCH_PLIST"
