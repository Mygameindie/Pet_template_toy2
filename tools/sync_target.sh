#!/usr/bin/env bash
# ===========================================================
# tools/sync_target.sh — release the engine to ONE game, in three phases
#
#   tools/sync_target.sh prepare <owner/repo> <clone-url> <workdir>
#       clone the game, record its engine version, copy engine/ in
#   tools/sync_target.sh test    <owner/repo> <workdir>
#       browser smoke tests of the game with the new engine
#   tools/sync_target.sh publish <owner/repo> <workdir>
#       commit + push (or, with DRY_RUN=1, only report what would change)
#   tools/sync_target.sh all     <owner/repo> <clone-url> <workdir>
#       the three in a row (local use / tests)
#
# Credentials: SYNC_TOKEN (optional) is used ONLY by the git clone/push
# commands of prepare/publish, as a per-command header for https://github.com/
# passed through GIT_CONFIG_* environment variables. It is never put in a URL,
# never written to git config or any file, and the test phase runs with all
# token variables removed. The clone URL must not contain credentials.
#
# State between phases: <workdir>/state_<owner_repo>.json (no secrets).
# Result: $RESULT_DIR/<owner_repo>.json (default ./sync-results), updated by
# every phase, plus a line in $GITHUB_STEP_SUMMARY when set. Fields:
#   oldVersion        engine the game had before this run
#   candidateVersion  engine this run releases
#   resultVersion     engine the game has after this run (= oldVersion unless
#                     the push succeeded, or it was already up to date)
#   phase             prepare | test | publish (where it stopped)
# Exit code 0 = ok (updated / up to date / dry run), 1 = failed.
# Run from the template's folder (needs `npm ci` for the test phase).
# ===========================================================
set -uo pipefail

PHASE="${1:-}"; shift || true
TEMPLATE="$(cd "$(dirname "$0")/.." && pwd)"
RESULT_DIR="${RESULT_DIR:-$TEMPLATE/sync-results}"
usage() { echo "usage: sync_target.sh prepare|test|publish|all <owner/repo> [<clone-url>] <workdir>" >&2; exit 2; }

case "$PHASE" in
  prepare|all) REPO="${1:-}"; URL="${2:-}"; WORK="${3:-}"; [ -n "$REPO" ] && [ -n "$URL" ] && [ -n "$WORK" ] || usage ;;
  test|publish) REPO="${1:-}"; WORK="${2:-}"; [ -n "$REPO" ] && [ -n "$WORK" ] || usage ;;
  *) usage ;;
esac
SAFE="${REPO//\//_}"
mkdir -p "$WORK" "$RESULT_DIR"
WORK="$(cd "$WORK" && pwd)"
DIR="$WORK/game_$SAFE"
STATE="$WORK/state_$SAFE.json"

log() { echo "[$REPO] $*"; }
ann() { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::$1 title=$REPO::$2"; else echo "$1: $2"; fi; }

# --- state (plain JSON, no secrets) -------------------------------------------
st_get() { node -e 'const f=process.argv[1];const s=require("fs").existsSync(f)?JSON.parse(require("fs").readFileSync(f,"utf8")):{};process.stdout.write(String(s[process.argv[2]]??""))' "$STATE" "$1"; }
st_set() { node -e 'const fs=require("fs");const [f,...kv]=process.argv.slice(1);const s=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,"utf8")):{};for(let i=0;i<kv.length;i+=2)s[kv[i]]=kv[i+1];fs.writeFileSync(f,JSON.stringify(s,null,2))' "$STATE" "$@"; }

# --- result ------------------------------------------------------------------
write_result() { # status detail
  st_set repo "$REPO" status "$1" detail "${2:-}" phase "$PHASE_NOW"
  node -e '
    const fs = require("fs");
    const [stateFile, out, summary] = process.argv.slice(1);
    const s = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    const r = {
      repo: s.repo, oldVersion: s.oldVersion || "unknown", candidateVersion: s.candidateVersion,
      resultVersion: s.resultVersion || s.oldVersion || "unknown",
      tests: s.tests || "not run", status: s.status, phase: s.phase, detail: s.detail || "", commit: s.commit || "",
    };
    fs.writeFileSync(out, JSON.stringify(r, null, 2));
    if (summary) {
      const icon = { updated: "✅ updated", "up-to-date": "✅ already up to date", "dry-run": "🧪 dry run (not pushed)", tested: "… tested, not published yet", prepared: "… prepared" }[r.status] || "❌ failed";
      fs.appendFileSync(summary, [
        `### ${r.repo}`, "",
        "| Engine before | Candidate | Engine after this run | Smoke tests | Result |",
        "|---|---|---|---|---|",
        `| ${r.oldVersion} | ${r.candidateVersion} | ${r.resultVersion} | ${r.tests} | ${icon}${r.detail ? " — " + r.detail : ""} |`, "", ""].join("\n"));
    }
  ' "$STATE" "$RESULT_DIR/$SAFE.json" "${GITHUB_STEP_SUMMARY:-}"
  log "phase $PHASE_NOW: engine $(st_get oldVersion) (candidate $(st_get candidateVersion), now $(st_get resultVersion)), tests: $(st_get tests), result: $1${2:+ ($2)}"
}
fail() { ann error "$1"; write_result failed "$1"; exit 1; }

# --- git with per-command credentials -----------------------------------------
# The header lives only in this process's environment for one git command.
git_auth() {
  if [ -n "${SYNC_TOKEN:-}" ]; then
    local b64; b64="$(printf 'x-access-token:%s' "$SYNC_TOKEN" | base64 | tr -d '\n')"
    GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0="http.https://github.com/.extraheader" \
      GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $b64" GIT_TERMINAL_PROMPT=0 git "$@"
  else
    GIT_TERMINAL_PROMPT=0 git "$@"
  fi
}
# A clone must not keep credentials anywhere the test server could reach.
assert_no_saved_credentials() {
  local url; url="$(git -C "$DIR" remote get-url origin)"
  case "$url" in *://*@*) fail "clone URL holds credentials" ;; esac
  if git -C "$DIR" config --local --get-regexp '(extraheader|credential|insteadof)' >/dev/null 2>&1; then
    fail "credentials were saved in the game's git config"
  fi
}

# --- phases ---------------------------------------------------------------------
do_prepare() {
  PHASE_NOW=prepare
  rm -f "$STATE"
  local cand; cand="$(node "$TEMPLATE/tools/engine.mjs" version --dir "$TEMPLATE")"
  st_set repo "$REPO" candidateVersion "$cand" oldVersion "unknown" resultVersion "unknown" tests "not run"
  case "$URL" in *://*@*) fail "refusing a clone URL with credentials in it (use SYNC_TOKEN)" ;; esac
  if [ "${REQUIRE_TOKEN:-0}" = "1" ] && [ -z "${SYNC_TOKEN:-}" ]; then
    fail "ENGINE_SYNC_TOKEN secret missing (needed to publish; see README.md)"
  fi
  rm -rf "$DIR"
  if ! git_auth clone --quiet --depth 1 "$URL" "$DIR" 2>"$WORK/clone_$SAFE.err"; then
    fail "could not clone (missing repo, or the sync token has no access to it)"
  fi
  assert_no_saved_credentials
  local old="none"
  if [ -f "$DIR/engine/VERSION" ]; then old="$(tr -d ' \r\n' < "$DIR/engine/VERSION")"
  elif [ -d "$DIR/engine" ]; then old="unversioned ($(node "$TEMPLATE/tools/engine.mjs" hash --dir "$DIR" | cut -c8-19))"
  fi
  st_set oldVersion "$old" resultVersion "$old"
  if ! "$TEMPLATE/sync_engine.sh" "$DIR" >"$WORK/sync_$SAFE.log" 2>&1; then
    cat "$WORK/sync_$SAFE.log"; fail "copying engine/ failed"
  fi
  write_result prepared ""
}

do_test() {
  PHASE_NOW=test
  [ -f "$STATE" ] && [ -d "$DIR" ] || fail "nothing prepared for this game"
  if [ "${RUN_TESTS:-1}" != "1" ]; then st_set tests "skipped (RUN_TESTS=0)"; write_result tested ""; return; fi
  log "running smoke tests with engine $(st_get candidateVersion)"
  local game_path="$DIR"   # node on Windows (Git Bash) needs C:/... not /c/...
  command -v cygpath >/dev/null 2>&1 && game_path="$(cygpath -m "$DIR")"
  local cmd="${SMOKE_CMD:-npx playwright test --reporter=line --output='$WORK/test-results-$SAFE'}"
  # No credentials in the test processes (browser, file server, npm).
  if (cd "$TEMPLATE" && env -u SYNC_TOKEN -u ENGINE_SYNC_TOKEN -u GITHUB_TOKEN -u GH_TOKEN \
        -u ACTIONS_RUNTIME_TOKEN -u ACTIONS_ID_TOKEN_REQUEST_TOKEN \
        GAME_DIR="$game_path" bash -c "$cmd"); then
    st_set tests "✅ passed"; write_result tested ""
  else
    st_set tests "❌ failed"; fail "smoke tests failed with engine $(st_get candidateVersion); game NOT updated"
  fi
}

do_publish() {
  PHASE_NOW=publish
  [ -f "$STATE" ] && [ -d "$DIR" ] || fail "nothing prepared for this game"
  case "$(st_get status)" in tested) ;; *) fail "not published: the test phase did not pass" ;; esac
  assert_no_saved_credentials
  cd "$DIR" || fail "game folder missing"
  git add -A engine sync_engine.sh README.md
  if git diff --cached --quiet; then
    st_set resultVersion "$(st_get candidateVersion)"; write_result up-to-date ""; return
  fi
  if [ "${DRY_RUN:-0}" = "1" ]; then
    write_result dry-run "would change $(git diff --cached --name-only | wc -l | tr -d ' ') file(s); still on $(st_get oldVersion)"; return
  fi
  local src_sha; src_sha="$(git -C "$TEMPLATE" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  git -c user.name="${GIT_AUTHOR_NAME:-engine-sync-bot}" -c user.email="${GIT_AUTHOR_EMAIL:-engine-sync-bot@users.noreply.github.com}" \
    commit --quiet -m "Engine $(st_get candidateVersion) from ${GITHUB_REPOSITORY:-$(basename "$TEMPLATE")}@$src_sha" || fail "commit failed"
  if ! git_auth push --quiet origin HEAD 2>"$WORK/push_$SAFE.err"; then
    fail "push failed (branch protection, or the token cannot write); game still on $(st_get oldVersion)"
  fi
  st_set commit "$(git rev-parse --short HEAD)" resultVersion "$(st_get candidateVersion)"
  write_result updated ""
}

case "$PHASE" in
  prepare) do_prepare ;;
  test) do_test ;;
  publish) do_publish ;;
  all) do_prepare && do_test && do_publish ;;
esac
