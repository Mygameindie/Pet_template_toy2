#!/usr/bin/env bash
# ===========================================================
# tools/test_release_tools.sh — tests for the drift check and the release
# (sync) tools, on throw-away local git repos. No network, no token, nothing
# outside a temporary folder is changed. Run from the template's folder:
#   npm run test:tools            (RUN_TESTS=0 skips the browser part)
# ===========================================================
set -uo pipefail

TEMPLATE="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE="node $TEMPLATE/tools/engine.mjs"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/engine-tools-test.XXXXXX")"
RUN_TESTS="${RUN_TESTS:-1}"
KEEP="${KEEP:-0}"
[ "$KEEP" = "1" ] || trap 'rm -rf "$TMP"' EXIT
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.invalid GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.invalid
export GIT_CONFIG_GLOBAL="$TMP/gitconfig"   # no user hooks / autocrlf in the fixtures
git config --file "$GIT_CONFIG_GLOBAL" init.defaultBranch main
git config --file "$GIT_CONFIG_GLOBAL" core.autocrlf false
unset GITHUB_ACTIONS GITHUB_STEP_SUMMARY GITHUB_OUTPUT

pass=0; failn=0
ok()   { echo "  PASS $1"; pass=$((pass + 1)); }
bad()  { echo "  FAIL $1"; failn=$((failn + 1)); }
# expect <0|1> <name> <command...>  (exit code 0 = pass, non-zero = fail)
expect() {
  local want="$1" name="$2"; shift 2
  local out code; out="$("$@" 2>&1)"; code=$?
  if { [ "$want" = 0 ] && [ $code = 0 ]; } || { [ "$want" != 0 ] && [ $code != 0 ]; }; then ok "$name"
  else bad "$name (exit $code)"; echo "$out" | sed 's/^/      /'; fi
  LAST="$out"
}
has() { if printf '%s' "$LAST" | grep -q "$2"; then ok "$1"; else bad "$1 (missing: $2)"; printf '%s\n' "$LAST" | sed 's/^/      /'; fi; }
commit() { git -C "$1" add -A && git -C "$1" commit -q -m "$2"; }

# The files a game/template has (git archive = no untracked/ignored files).
export_tree() { mkdir -p "$2" && git -C "$TEMPLATE" archive "$1" | tar -x -C "$2"; }

echo "== fixtures in $TMP"
# canonical template: this repo's current commit, as its own repo
CAN="$TMP/canonical"; export_tree HEAD "$CAN"
(cd "$CAN" && git init -q && echo '{"canonical":true}' >/dev/null)
node -e '
  const f=process.argv[1]; const fs=require("fs"); const l=JSON.parse(fs.readFileSync(f,"utf8"));
  l.canonical=true; l.source={repo:"fixture/canonical"}; delete l.consumers; fs.writeFileSync(f, JSON.stringify(l,null,2)+"\n");
' "$CAN/engine.lock"
commit "$CAN" "canonical 1.0.0"
VER="$($ENGINE version --dir "$CAN")"
git -C "$CAN" tag "engine-v$VER"

echo "== drift: canonical template"
expect 0 "clean canonical passes" $ENGINE check --dir "$CAN" --require-release
echo "// local edit" >> "$CAN/engine/pet_art.js"
expect 1 "engine edit without lock fails" $ENGINE check --dir "$CAN"
has "  says to bump VERSION and lock" "Bump engine/VERSION"
expect 1 "lock refuses an engine change without a version bump" $ENGINE lock --dir "$CAN"
# simulate someone hand-editing the lock hash but keeping the version
node -e '
  const [f,h]=process.argv.slice(1); const fs=require("fs"); const l=JSON.parse(fs.readFileSync(f,"utf8"));
  l.hash=h; fs.writeFileSync(f, JSON.stringify(l,null,2)+"\n");
' "$CAN/engine.lock" "$($ENGINE hash --dir "$CAN")"
commit "$CAN" "engine change, same version"
expect 1 "changed engine with the same version fails against base" $ENGINE check --dir "$CAN" --base HEAD~1
has "  explains the missing bump" "version is still"
expect 1 "release check: existing tag with different engine fails" $ENGINE check --dir "$CAN" --require-release
has "  names the tag" "already exists with a different engine"
git -C "$CAN" reset -q --hard HEAD~1
# proper update: edit, bump, lock
echo "// fix" >> "$CAN/engine/pet_art.js"
echo "1.0.1" > "$CAN/engine/VERSION"
expect 0 "lock after a version bump" $ENGINE lock --dir "$CAN"
commit "$CAN" "engine 1.0.1"
expect 0 "bumped engine passes against base" $ENGINE check --dir "$CAN" --base HEAD~1 --require-release
has "  reports the version change" "1.0.0 -> 1.0.1"
git -C "$CAN" branch -q feature/coordinated
git -C "$CAN" tag engine-v1.0.1

echo "== drift: pinned copy (2-pet template)"
FOL="$TMP/follower"; mkdir -p "$FOL"
if [ -n "${FOLLOWER_TREE:-}" ]; then cp -R "$FOLLOWER_TREE/." "$FOL/"; else export_tree HEAD "$FOL"; fi
rm -f "$FOL/engine.lock"
git -C "$FOL" init -q
SRC="$TMP/source-checkout"
git clone -q "$CAN" "$SRC" && git -C "$SRC" checkout -q engine-v1.0.1
expect 0 "pull from the release tag" $ENGINE pull --dir "$FOL" --from "$SRC" --repo fixture/canonical
has "  pins the tag" "fixture/canonical@engine-v1.0.1"
commit "$FOL" "pin 1.0.1"
expect 0 "pinned copy at a release passes the release check" $ENGINE check --dir "$FOL" --source "$SRC" --require-release
echo "// hotfix in the wrong repo" >> "$FOL/engine/ragdoll.js"
expect 1 "edited pinned copy fails (drift)" $ENGINE check --dir "$FOL" --source "$SRC"
has "  tells to change it in the canonical template" "Do not edit engine/ here"
git -C "$FOL" checkout -q -- engine
# coordinated update: canonical work branch ahead of the release
git -C "$CAN" checkout -q feature/coordinated
echo "// new feature" >> "$CAN/engine/pet_modes.js"; echo "1.1.0" > "$CAN/engine/VERSION"
$ENGINE lock --dir "$CAN" >/dev/null && commit "$CAN" "engine 1.1.0 (unreleased)"
git -C "$SRC" fetch -q origin && git -C "$SRC" checkout -q origin/feature/coordinated
expect 0 "pull from a canonical work branch" $ENGINE pull --dir "$FOL" --from "$SRC" --repo fixture/canonical --ref feature/coordinated
commit "$FOL" "pin work branch"
expect 0 "work branch pin passes a branch check (warning)" $ENGINE check --dir "$FOL" --source "$SRC"
has "  warns it is not a release" "not to a release tag"
expect 1 "work branch pin fails the release check" $ENGINE check --dir "$FOL" --source "$SRC" --require-release
# lock names a release tag that the source does not have
node -e '
  const f=process.argv[1]; const fs=require("fs"); const l=JSON.parse(fs.readFileSync(f,"utf8"));
  l.source.ref="engine-v"+l.version; fs.writeFileSync(f, JSON.stringify(l,null,2)+"\n");
' "$FOL/engine.lock"
expect 1 "pin to a tag that does not exist fails the release check" $ENGINE check --dir "$FOL" --source "$SRC" --require-release
has "  says to release first" "does not exist"
# source checkout at another commit than the lock
git -C "$SRC" checkout -q engine-v1.0.0
expect 1 "source checkout at a different commit fails" $ENGINE check --dir "$FOL" --source "$SRC"

echo "== release (sync) to disposable game repos"
REM="$TMP/remotes"; mkdir -p "$REM"
make_game() { # name tree-ish [mutator]
  local w="$TMP/seed_$1"; export_tree "$2" "$w"
  rm -rf "$w/tools" "$w/tests" "$w/.github" "$w/package.json" "$w/package-lock.json" "$w/playwright.config.mjs" "$w/engine.lock" "$w/sync_targets.txt"
  [ -n "${3:-}" ] && (cd "$w" && eval "$3")
  git -C "$w" init -q && commit "$w" "game $1"
  git clone -q --bare "$w" "$REM/$1.git"
}
# the commit before engine.lock was added = a game on the old, unversioned engine
OLD="$(git -C "$TEMPLATE" log --diff-filter=A --format=%H -- engine.lock | tail -1)~1"
make_game old-one-pet "$OLD"                                     # unversioned older engine
make_game current HEAD                                          # already has this engine
make_game broken "$OLD" "sed -i 's/window.GAME_CONFIG = {/window.GAME_CONFIG = {{/' game_config.js"   # game whose page breaks
RES="$TMP/results"; WORK="$TMP/work"
sync() { RESULT_DIR="$RES" RUN_TESTS="$RUN_TESTS" "$TEMPLATE/tools/sync_target.sh" "$1" "$REM/$2.git" "$WORK"; }
before_old="$(git -C "$REM/old-one-pet.git" rev-parse HEAD)"
before_cur="$(git -C "$REM/current.git" rev-parse HEAD)"
before_brk="$(git -C "$REM/broken.git" rev-parse HEAD)"

DRY_RUN=1 expect 0 "dry run reports a change and pushes nothing" sync fixture/old-one-pet old-one-pet
has "  dry run result" "result: dry-run"
[ "$(git -C "$REM/old-one-pet.git" rev-parse HEAD)" = "$before_old" ] && ok "  remote unchanged after dry run" || bad "  remote changed after dry run"
rm -rf "$RES"

expect 0 "out-of-date game is updated" sync fixture/old-one-pet old-one-pet
has "  shows engine before -> after" "engine — -> $($ENGINE version)\|engine unversioned"
after_old="$(git -C "$REM/old-one-pet.git" rev-parse HEAD)"
if [ "$after_old" != "$before_old" ] && [ "$(git -C "$REM/old-one-pet.git" show HEAD:engine/VERSION | tr -d '\r\n')" = "$($ENGINE version)" ]; then
  ok "  remote got the engine and engine/VERSION"; else bad "  remote not updated"; fi
changed="$(git -C "$REM/old-one-pet.git" diff --name-only "$before_old" HEAD | grep -v -E '^(engine/|sync_engine.sh$|README.md$)' || true)"
[ -z "$changed" ] && ok "  only shared files changed (game files untouched)" || bad "  game files changed: $changed"
git -C "$REM/old-one-pet.git" log -1 --format=%s | grep -q "^Engine $($ENGINE version) from " && ok "  commit message names the version" || bad "  commit message"

expect 0 "up-to-date game is left alone" sync fixture/current current
has "  up to date" "result: up-to-date"
[ "$(git -C "$REM/current.git" rev-parse HEAD)" = "$before_cur" ] && ok "  no commit pushed" || bad "  unexpected push"

expect 1 "missing repo fails" sync fixture/missing missing
has "  clone failure reported" "could not clone"

if [ "$RUN_TESTS" = "1" ]; then
  expect 1 "game whose smoke tests fail is not pushed" sync fixture/broken broken
  has "  test failure reported" "smoke tests failed"
  [ "$(git -C "$REM/broken.git" rev-parse HEAD)" = "$before_brk" ] && ok "  broken game unchanged" || bad "  broken game was pushed"
fi

TARGETS='["fixture/old-one-pet","fixture/current","fixture/missing","fixture/broken","fixture/never-ran"]'
expect 1 "report fails the run on a partial failure" node "$TEMPLATE/tools/sync_report.mjs" "$RES" "$TARGETS"
has "  headline says partial" "Partial release"
has "  per-game row with versions" "| fixture/old-one-pet | unversioned"
has "  job that never reported counts as failed" "fixture/never-ran | ? | ? | ? | ❌ failed"
echo "$LAST" | sed 's/^/      /'
# the same report over only the games that went fine
mkdir -p "$TMP/good" && cp "$RES/fixture_old-one-pet.json" "$RES/fixture_current.json" "$TMP/good/"
expect 0 "report passes when every game is ok" node "$TEMPLATE/tools/sync_report.mjs" "$TMP/good" '["fixture/old-one-pet","fixture/current"]'
has "  all released headline" "All 2 game(s) released"

echo
echo "release tools: $pass passed, $failn failed"
[ "$KEEP" = "1" ] && echo "(fixtures kept in $TMP)"
[ "$failn" = 0 ]
