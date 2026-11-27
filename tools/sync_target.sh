#!/usr/bin/env bash
# ===========================================================
# tools/sync_target.sh — release the engine to ONE game
#
#   tools/sync_target.sh <owner/repo> <clone-url> [workdir]
#
# 1. clones the game, 2. records its current engine version,
# 3. copies engine/ in (sync_engine.sh), 4. runs the browser smoke
# tests against the game with the new engine (unless RUN_TESTS=0),
# 5. commits and pushes (unless DRY_RUN=1, or nothing changed).
# The game is NOT pushed when its tests fail.
#
# Writes one JSON result to $RESULT_DIR/<owner_repo>.json (default
# ./sync-results) and a line to $GITHUB_STEP_SUMMARY when set.
# Exit code: 0 = updated / already up to date / dry run ok, 1 = failed.
# Run from the template's folder (needs `npm ci` done for the tests).
# ===========================================================
set -uo pipefail

REPO="${1:?usage: sync_target.sh <owner/repo> <clone-url> [workdir]}"
URL="${2:?usage: sync_target.sh <owner/repo> <clone-url> [workdir]}"
WORK="${3:-${RUNNER_TEMP:-/tmp}/engine-sync}"
TEMPLATE="$(cd "$(dirname "$0")/.." && pwd)"
RESULT_DIR="${RESULT_DIR:-$TEMPLATE/sync-results}"
DRY_RUN="${DRY_RUN:-0}"
RUN_TESTS="${RUN_TESTS:-1}"
SAFE="${REPO//\//_}"
DIR="$WORK/game_$SAFE"
mkdir -p "$WORK" "$RESULT_DIR"

NEW_VERSION="$(node "$TEMPLATE/tools/engine.mjs" version --dir "$TEMPLATE")"
SRC_SHA="$(git -C "$TEMPLATE" rev-parse --short HEAD 2>/dev/null || echo unknown)"
SRC_REPO="${GITHUB_REPOSITORY:-$(basename "$TEMPLATE")}"
OLD_VERSION="—"
TESTS="not run"
STATUS="failed"
DETAIL=""
COMMIT=""

log() { echo "[$REPO] $*"; }
ann() { # level message
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::$1 title=$REPO::$2"; else echo "$1: $2"; fi
}

write_result() {
  local icon
  case "$STATUS" in
    updated) icon="✅ updated" ;; up-to-date) icon="✅ already up to date" ;;
    dry-run) icon="🧪 dry run (not pushed)" ;; *) icon="❌ failed" ;;
  esac
  node -e '
    const [f, repo, oldV, newV, tests, status, detail, commit] = process.argv.slice(1);
    require("fs").writeFileSync(f, JSON.stringify({ repo, oldVersion: oldV, newVersion: newV, tests, status, detail, commit }, null, 2));
  ' "$RESULT_DIR/$SAFE.json" "$REPO" "$OLD_VERSION" "$NEW_VERSION" "$TESTS" "$STATUS" "$DETAIL" "$COMMIT"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "### $REPO"
      echo ""
      echo "| Engine before | Engine after | Smoke tests | Result |"
      echo "|---|---|---|---|"
      echo "| $OLD_VERSION | $NEW_VERSION | $TESTS | $icon${DETAIL:+ — $DETAIL} |"
    } >> "$GITHUB_STEP_SUMMARY"
  fi
  log "engine $OLD_VERSION -> $NEW_VERSION, tests: $TESTS, result: $STATUS${DETAIL:+ ($DETAIL)}"
}

fail() { DETAIL="$1"; STATUS="failed"; ann error "$1"; write_result; exit 1; }

rm -rf "$DIR"
if ! git clone --quiet --depth 1 "$URL" "$DIR" 2>"$WORK/clone_$SAFE.err"; then
  # never print the URL (it can hold a token)
  fail "could not clone (missing repo, or the sync token has no access to it)"
fi

if [ -f "$DIR/engine/VERSION" ]; then
  OLD_VERSION="$(tr -d '\r\n' < "$DIR/engine/VERSION")"
elif [ -d "$DIR/engine" ]; then
  OLD_VERSION="unversioned ($(node "$TEMPLATE/tools/engine.mjs" hash --dir "$DIR" | cut -c8-19))"
fi

if ! "$TEMPLATE/sync_engine.sh" "$DIR" >"$WORK/sync_$SAFE.log" 2>&1; then
  cat "$WORK/sync_$SAFE.log"
  fail "copying engine/ failed"
fi

if [ "$RUN_TESTS" = "1" ]; then
  log "running smoke tests with engine $NEW_VERSION"
  # each game gets its own port so parallel runs on one machine don't clash
  PORT="$((4200 + $(printf '%s' "$REPO" | cksum | cut -d' ' -f1) % 700))"
  if (cd "$TEMPLATE" && GAME_DIR="$DIR" PORT="$PORT" npx playwright test --reporter=line --output="$WORK/test-results-$SAFE"); then
    TESTS="✅ passed"
  else
    TESTS="❌ failed"
    fail "smoke tests failed with engine $NEW_VERSION, game NOT updated"
  fi
fi

cd "$DIR" || fail "game folder missing"
git add -A engine sync_engine.sh README.md
if git diff --cached --quiet; then
  STATUS="up-to-date"
  write_result; exit 0
fi

if [ "$DRY_RUN" = "1" ]; then
  STATUS="dry-run"
  DETAIL="would change $(git diff --cached --name-only | wc -l | tr -d ' ') file(s)"
  write_result; exit 0
fi

git -c user.name="${GIT_AUTHOR_NAME:-engine-sync-bot}" -c user.email="${GIT_AUTHOR_EMAIL:-engine-sync-bot@users.noreply.github.com}" \
  commit --quiet -m "Engine $NEW_VERSION from $SRC_REPO@$SRC_SHA" || fail "commit failed"
if ! git push --quiet origin HEAD 2>"$WORK/push_$SAFE.err"; then
  fail "push failed (branch protection, or the token cannot write)"
fi
COMMIT="$(git rev-parse --short HEAD)"
STATUS="updated"
write_result
exit 0
