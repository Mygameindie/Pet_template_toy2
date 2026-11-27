#!/usr/bin/env node
// ===========================================================
// tools/engine.mjs — engine version, lock and drift check (no dependencies)
//
// The engine has ONE source: engine/ in the canonical template
// (Pet_template_toy). Its version is engine/VERSION. Every template has an
// engine.lock that records which engine it carries:
//
//   canonical template: { canonical: true,  version, hash, source: { repo } }
//   other templates   : { canonical: false, version, hash,
//                         source: { repo, ref, commit } }   <- pinned copy
//
// hash = sha256 of every file in engine/ (paths + contents, line endings
// normalised), so a checkout on Windows and on Linux give the same hash.
//
// Commands
//   hash   [--dir D]                       print the engine hash of D/engine
//   check  [--dir D] [--base REF] [--source SRC_DIR] [--require-release]
//          drift check. Fails when engine/ differs from engine.lock, when the
//          canonical engine changed without a version bump (--base), when a
//          pinned copy differs from its source (--source = a git checkout of
//          the source repo at the pinned commit), or, with --require-release,
//          when the pin is not an engine-v<version> release tag.
//   lock   [--dir D]                       canonical template: record the
//          current engine/ (after editing engine/ and bumping engine/VERSION)
//   pull   --from SRC_DIR [--dir D] [--repo owner/name] [--ref R]
//          other templates: copy engine/ from a checkout of the canonical
//          template and pin it (repo/ref/commit are read from SRC_DIR's git)
//   targets [--dir D]                      sync_targets.txt as a JSON array
//   version [--dir D]                      print engine/VERSION
// Exit code 0 = ok, 1 = check failed, 2 = usage error.
// ===========================================================
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const TAG_PREFIX = "engine-v";
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) out[k] = true;
      else { out[k] = v; i++; }
    } else out._.push(a);
  }
  return out;
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else if (e.isFile()) out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out.sort();
}

function normalised(buf) {
  // Text files: CRLF -> LF so core.autocrlf does not change the hash.
  if (buf.includes(0)) return buf;
  return Buffer.from(buf.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
}

export function engineHash(repoDir) {
  const engineDir = path.join(repoDir, "engine");
  if (!fs.existsSync(engineDir)) throw new Error(`no engine/ folder in ${repoDir}`);
  const h = crypto.createHash("sha256");
  for (const rel of listFiles(engineDir)) {
    const fh = crypto.createHash("sha256").update(normalised(fs.readFileSync(path.join(engineDir, rel)))).digest("hex");
    h.update(`${rel}\0${fh}\n`);
  }
  return "sha256:" + h.digest("hex");
}

function readVersion(repoDir) {
  const f = path.join(repoDir, "engine", "VERSION");
  if (!fs.existsSync(f)) return null;
  return fs.readFileSync(f, "utf8").trim();
}

function readLock(repoDir) {
  const f = path.join(repoDir, "engine.lock");
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

function writeLock(repoDir, lock) {
  fs.writeFileSync(path.join(repoDir, "engine.lock"), JSON.stringify(lock, null, 2) + "\n");
}

function git(dir, args, opts = {}) {
  return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
}
function gitOk(dir, args) {
  try { return git(dir, args); } catch { return null; }
}

function cmpSemver(a, b) {
  const pa = a.split("-")[0].split(".").map(Number), pb = b.split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  const ra = a.includes("-"), rb = b.includes("-");
  if (ra !== rb) return ra ? -1 : 1; // 1.0.0-rc < 1.0.0
  return a < b ? -1 : a > b ? 1 : 0;
}

// GitHub annotations when running in Actions; plain text otherwise.
const GH = !!process.env.GITHUB_ACTIONS;
const errors = [], warnings = [], notes = [];
const err = m => { errors.push(m); console.log(GH ? `::error title=Engine drift::${m}` : `ERROR: ${m}`); };
const warn = m => { warnings.push(m); console.log(GH ? `::warning title=Engine pin::${m}` : `WARNING: ${m}`); };
const note = m => { notes.push(m); console.log(GH ? `::notice::${m}` : `ok: ${m}`); };

function summary(lines) {
  const f = process.env.GITHUB_STEP_SUMMARY;
  if (f) fs.appendFileSync(f, lines.join("\n") + "\n");
}

function remoteRepo(dir) {
  const url = gitOk(dir, ["remote", "get-url", "origin"]);
  if (!url) return null;
  const m = url.match(/github\.com[/:]([^/]+\/[^/]+?)(\.git)?$/i);
  return m ? m[1] : url;
}

// ---------------------------------------------------------------- check
function check(opts) {
  const dir = path.resolve(opts.dir || ".");
  const lock = readLock(dir);
  const version = readVersion(dir);
  const hash = engineHash(dir);

  if (!lock) { err("engine.lock is missing. Canonical template: run `npm run engine:lock`; other templates: `npm run engine:pull -- --from <canonical checkout>`."); return finish(dir, null, version, hash); }
  if (!version) err("engine/VERSION is missing.");
  else if (!SEMVER.test(version)) err(`engine/VERSION "${version}" is not a version like 1.2.3.`);
  if (version && lock.version !== version) err(`engine/VERSION is ${version} but engine.lock says ${lock.version}.`);

  if (lock.hash !== hash) {
    if (lock.canonical) err("engine/ changed but engine.lock was not updated. Bump engine/VERSION, then run `npm run engine:lock` and commit both.");
    else err(`engine/ differs from the pinned engine ${lock.version} (${lock.source && lock.source.repo}@${lock.source && lock.source.ref}). Do not edit engine/ here: change it in the canonical template, then run \`npm run engine:pull\`.`);
  } else note(`engine/ matches engine.lock (${lock.version}, ${hash.slice(0, 19)}).`);

  // Canonical: any engine change needs a new version (compared with --base).
  if (lock.canonical && opts.base && opts.base !== true && !/^0+$/.test(opts.base)) {
    const baseLockRaw = gitOk(dir, ["show", `${opts.base}:engine.lock`]);
    if (!baseLockRaw) note(`base ${opts.base} has no engine.lock yet (first versioned engine).`);
    else {
      const baseLock = JSON.parse(baseLockRaw);
      if (baseLock.hash !== lock.hash && baseLock.version === lock.version) err(`engine/ changed since ${opts.base.slice(0, 12)} but the version is still ${lock.version}. Bump engine/VERSION and run \`npm run engine:lock\`.`);
      else if (version && cmpSemver(lock.version, baseLock.version) < 0) err(`engine version went down: ${baseLock.version} -> ${lock.version}.`);
      else if (baseLock.version !== lock.version) note(`engine version ${baseLock.version} -> ${lock.version}.`);
    }
  }

  // Canonical + release: a release tag for this version must not point at a
  // different engine (a version number is never reused).
  if (lock.canonical && opts["require-release"]) {
    const tag = TAG_PREFIX + lock.version;
    const tagLock = gitOk(dir, ["show", `refs/tags/${tag}:engine.lock`]);
    if (tagLock && JSON.parse(tagLock).hash !== lock.hash) err(`tag ${tag} already exists with a different engine. Bump engine/VERSION.`);
    else if (tagLock) note(`release tag ${tag} already exists for this engine.`);
    else note(`release tag ${tag} will be created by the release workflow.`);
  }

  // Pinned copy: compare with the source checkout.
  if (!lock.canonical) {
    const src = lock.source || {};
    if (!src.repo || !src.ref || !src.commit) err("engine.lock source must have repo, ref and commit.");
    const isRelease = src.ref === TAG_PREFIX + lock.version;
    if (opts.source && opts.source !== true) {
      const sdir = path.resolve(opts.source);
      const head = gitOk(sdir, ["rev-parse", "HEAD"]);
      if (head && src.commit && head !== src.commit) err(`source checkout is at ${head.slice(0, 12)}, lock pins ${src.commit.slice(0, 12)}.`);
      const sHash = engineHash(sdir), sVer = readVersion(sdir);
      if (sHash !== hash) err(`engine/ differs from ${src.repo}@${src.commit ? src.commit.slice(0, 12) : "?"} (the pinned source). Run \`npm run engine:pull\` to re-copy it.`);
      else note(`engine/ is identical to ${src.repo}@${(src.commit || "").slice(0, 12)}.`);
      if (sVer !== lock.version) err(`source engine/VERSION is ${sVer}, lock says ${lock.version}.`);
      if (opts["require-release"] && isRelease) {
        const tagCommit = gitOk(sdir, ["rev-parse", "-q", "--verify", `refs/tags/${src.ref}^{commit}`]);
        if (!tagCommit) err(`release tag ${src.ref} does not exist in ${src.repo} yet. Release the engine from the canonical template first.`);
        else if (tagCommit !== src.commit) err(`release tag ${src.ref} is ${tagCommit.slice(0, 12)}, lock pins ${src.commit.slice(0, 12)}. Run \`npm run engine:pull\` from the tag.`);
        else note(`pinned to release ${src.ref}.`);
      }
    } else if (!opts["no-source"]) {
      warn("source not checked (pass --source <checkout of the source repo at the pinned commit>).");
    }
    if (!isRelease) {
      const m = `engine is pinned to ${src.repo}@${src.ref} (${(src.commit || "").slice(0, 12)}), not to a release tag ${TAG_PREFIX}${lock.version}. OK on a work branch during a coordinated update; releases need the tag.`;
      if (opts["require-release"]) err(m); else warn(m);
    }
  }
  return finish(dir, lock, version, hash);
}

function finish(dir, lock, version, hash) {
  const status = errors.length ? "❌ drift / pin problem" : warnings.length ? "⚠️ ok with warnings" : "✅ in sync";
  const src = lock && (lock.canonical ? `canonical (${lock.source && lock.source.repo || "this repo"})` : `${lock.source.repo}@${lock.source.ref}`);
  summary([
    `### Engine check: ${path.basename(dir)}`,
    "",
    "| Engine version | Hash | Source | Result |",
    "|---|---|---|---|",
    `| ${version || "—"} | \`${hash.slice(7, 19)}\` | ${src || "—"} | ${status} |`,
    "",
    ...errors.map(e => `- ❌ ${e}`), ...warnings.map(w => `- ⚠️ ${w}`),
    "",
  ]);
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, `version=${version || ""}\nhash=${hash}\ncanonical=${!!(lock && lock.canonical)}\n`);
  console.log(errors.length ? `engine check FAILED (${errors.length} problem${errors.length > 1 ? "s" : ""})` : "engine check passed");
  return errors.length ? 1 : 0;
}

// ---------------------------------------------------------------- lock / pull
function lock(opts) {
  const dir = path.resolve(opts.dir || ".");
  const old = readLock(dir);
  if (old && !old.canonical) { console.error("This template pins a copy of the engine: use `pull`, not `lock`."); return 1; }
  const version = readVersion(dir);
  if (!version || !SEMVER.test(version)) { console.error("engine/VERSION must hold a version like 1.2.3."); return 1; }
  const hash = engineHash(dir);
  if (old && old.hash !== hash && old.version === version) {
    console.error(`engine/ changed but engine/VERSION is still ${version}. Bump it first.`); return 1;
  }
  const repo = (old && old.source && old.source.repo) || opts.repo || remoteRepo(dir);
  writeLock(dir, { canonical: true, version, hash, source: { repo } });
  console.log(`engine.lock: ${version} ${hash}`);
  return 0;
}

function pull(opts) {
  const dir = path.resolve(opts.dir || ".");
  if (!opts.from || opts.from === true) { console.error("pull needs --from <checkout of the canonical template>"); return 2; }
  const from = path.resolve(opts.from);
  const old = readLock(dir);
  if (old && old.canonical) { console.error("This is the canonical template: edit engine/ here and use `lock`."); return 1; }
  const srcLock = readLock(from);
  if (!srcLock || !srcLock.canonical) { console.error(`${from} is not the canonical template (its engine.lock is missing or not canonical).`); return 1; }
  const version = readVersion(from);
  const hash = engineHash(from);
  if (srcLock.hash !== hash || srcLock.version !== version) { console.error(`${from}: engine/ does not match its own engine.lock; pick a clean, released commit.`); return 1; }
  const commit = gitOk(from, ["rev-parse", "HEAD"]);
  if (!commit) { console.error(`${from} is not a git checkout.`); return 1; }
  const tag = gitOk(from, ["describe", "--tags", "--exact-match", "--match", `${TAG_PREFIX}*`, "HEAD"]);
  const branch = gitOk(from, ["symbolic-ref", "-q", "--short", "HEAD"]);
  const ref = (opts.ref !== true && opts.ref) || tag || branch || commit;
  const repo = (opts.repo !== true && opts.repo) || srcLock.source.repo || remoteRepo(from);

  fs.rmSync(path.join(dir, "engine"), { recursive: true, force: true });
  fs.cpSync(path.join(from, "engine"), path.join(dir, "engine"), { recursive: true });
  writeLock(dir, { canonical: false, version, hash, source: { repo, ref, commit } });
  console.log(`engine ${version} pulled from ${repo}@${ref} (${commit.slice(0, 12)})`);
  if (ref !== TAG_PREFIX + version) console.log(`note: ${ref} is not a release tag; fine for a work branch, releases need ${TAG_PREFIX}${version}.`);
  return 0;
}

function targets(opts) {
  const dir = path.resolve(opts.dir || ".");
  const f = path.join(dir, "sync_targets.txt");
  const list = fs.existsSync(f)
    ? fs.readFileSync(f, "utf8").split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"))
    : [];
  console.log(JSON.stringify(list));
  return 0;
}

const [cmd, ...rest] = process.argv.slice(2);
const opts = parseArgs(rest);
const cmds = {
  hash: o => { console.log(engineHash(path.resolve(o.dir || "."))); return 0; },
  version: o => { console.log(readVersion(path.resolve(o.dir || ".")) || ""); return 0; },
  check, lock, pull, targets,
};
if (!cmds[cmd]) {
  console.error("usage: node tools/engine.mjs <hash|version|check|lock|pull|targets> [options] (see the top of this file)");
  process.exit(2);
}
try { process.exit(cmds[cmd](opts)); }
catch (e) { console.error(`ERROR: ${e.message}`); process.exit(1); }
