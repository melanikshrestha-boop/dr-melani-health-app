#!/usr/bin/env bash
set -e
ARCH=$(uname -m)
BIN="$HOME/.melani_assistant/bin"
mkdir -p "$BIN"
case "$ARCH" in
  arm64) ASSET="cloudflared-darwin-arm64.tgz" ;;
  x86_64) ASSET="cloudflared-darwin-amd64.tgz" ;;
  *) echo "Unsupported arch: $ARCH"; exit 1 ;;
esac
curl -fsSL -o /tmp/cloudflared.tgz "https://github.com/cloudflare/cloudflared/releases/latest/download/$ASSET"
tar -xzf /tmp/cloudflared.tgz -C "$BIN" cloudflared
chmod +x "$BIN/cloudflared"
echo "Installed: $BIN/cloudflared"
"$BIN/cloudflared" --version
