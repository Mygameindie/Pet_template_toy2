#!/usr/bin/env bash
# ===========================================================
# 🔄 sync_engine.sh — copy the SHARED ENGINE to the other game
#
# The engine/ folder must stay identical in every game repo.
# After you edit anything inside engine/, run this script to
# copy it to the other game, then commit BOTH repos.
#
# Usage (from this repo's folder):
#   ./sync_engine.sh ../Pet_template_toy2     # or ../Pet_template_toy
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
