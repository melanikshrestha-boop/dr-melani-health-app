#!/bin/bash
DIR="$HOME/melani_assistant"
cd "$DIR" || exit 1
bash "$DIR/stop_content.sh"
sleep 1
bash "$DIR/start_content.sh"
open "http://127.0.0.1:8782/setup"
