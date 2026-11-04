#!/usr/bin/env bash
# ===========================================================
# 🔄 sync_engine.sh — copy the SHARED ENGINE to another game
#
# The engine/ folder must stay identical in every game of a family.
# Edit engine/ ONLY in the family's template repo (Pet_template_toy
# for 1-pet games, Pet_template_toy2 for 2+ pets). Pushing the
# template runs this script for every game in sync_targets.txt
# automatically (.github/workflows/sync_engine.yml).
#
# Manual use (from the template repo's folder), then commit and
# push the game repo:
#   ./sync_engine.sh ../Seafairycookiepet     # or ../Devilangelpet
# ===========================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-}"

if [ -z "$TARGET" ] || [ ! -d "$TARGET" ]; then
  echo "Usage: ./sync_engine.sh <path-to-other-game-repo>"
  echo "Example: ./sync_engine.sh ../Pet_template_toy2"
  exit 1
fi
TARGET="$(cd "$TARGET" && pwd)"

if [ "$TARGET" = "$HERE" ]; then
  echo "Target is this repo itself — pass the OTHER game's folder."
  exit 1
fi

# Copy the shared files: engine/ (exact mirror), this script, and the README.
rm -rf "$TARGET/engine"
cp -R "$HERE/engine" "$TARGET/engine"
cp "$HERE/sync_engine.sh" "$TARGET/sync_engine.sh"
[ -f "$HERE/README.md" ] && cp "$HERE/README.md" "$TARGET/README.md"

echo "✅ Engine synced to $TARGET"
if diff -r "$HERE/engine" "$TARGET/engine" > /dev/null; then
  echo "✅ Verified: engine/ is identical in both repos."
else
  echo "❌ WARNING: engine/ folders still differ!"
  exit 1
fi
echo "Now commit and push BOTH repos."
