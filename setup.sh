#!/usr/bin/env bash
# Install dependencies and run the setup wizard.
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "Installing Python dependencies..."
pip3 install anthropic requests beautifulsoup4 --quiet

echo ""
python3 setup.py
