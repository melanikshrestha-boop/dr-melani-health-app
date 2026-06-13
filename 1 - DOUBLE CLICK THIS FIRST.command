#!/bin/bash
DIR="$HOME/melani_assistant"
cd "$DIR" || exit 1
# Stop any stuck old server first (fixes blank / old My Data page)
bash "$DIR/stop_health.sh"
sleep 2
bash "$DIR/start_health.sh"
open "http://127.0.0.1:8781/labs"
