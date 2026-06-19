#!/usr/bin/env bash
# One-time helper to push Dr. Melani to GitHub.
# Usage: bash push_to_github.sh YOUR_GITHUB_TOKEN

set -euo pipefail

TOKEN="${1:-}"
REPO="https://github.com/melanikshrestha-boop/dr.-Melani.git"
ROOT="$HOME/melani_assistant"

if [[ -z "$TOKEN" ]]; then
  echo "Usage: bash push_to_github.sh YOUR_GITHUB_TOKEN"
  echo ""
  echo "Create a token at:"
  echo "  https://github.com/settings/tokens/new"
  echo "Check the 'repo' box, generate, copy the ghp_... token."
  exit 1
fi

cd "$ROOT"

# Push using token in URL (only for this one command; not saved to git config)
git push "https://melanikshrestha-boop:${TOKEN}@github.com/melanikshrestha-boop/dr.-Melani.git" main

echo ""
echo "Success. Code is on GitHub:"
echo "  https://github.com/melanikshrestha-boop/dr.-Melani"
