#!/usr/bin/env bash
# Make sure Ollama is running and Dr. Melani can read images.
set -e

if ! curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "Starting Ollama…"
  open -a Ollama 2>/dev/null || true
  for i in $(seq 1 30); do
    sleep 1
    curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break
  done
fi

if ! curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "Ollama is not running. Open the Ollama app from Applications, then try again."
  exit 1
fi

has_model() {
  curl -s http://127.0.0.1:11434/api/tags | grep -q "\"name\":\"$1"
}

if has_model "moondream:latest" || has_model "moondream"; then
  echo "Vision model ready (moondream)."
  exit 0
fi

if has_model "llama3.2-vision:latest" || has_model "llama3.2-vision"; then
  echo "Vision model ready (llama3.2-vision)."
  exit 0
fi

echo "Downloading vision model for Dr. Melani (moondream, ~1.7 GB — one time only)…"
ollama pull moondream
echo "Done — Dr. Melani can read images now."
