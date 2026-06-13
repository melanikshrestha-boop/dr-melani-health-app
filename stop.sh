#!/usr/bin/env bash
PID_FILE="$HOME/.melani_assistant/agent.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        rm "$PID_FILE"
        echo "Melani's Assistant stopped."
    else
        echo "Process not running. Cleaning up."
        rm "$PID_FILE"
    fi
else
    echo "No PID file found — assistant may not be running."
fi
