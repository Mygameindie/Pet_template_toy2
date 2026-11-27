#!/usr/bin/env node
// tools/sync_report.mjs <results-dir> [expected-targets-json] [--stage name=result ...] [--publish yes|no]
//
// Combines the per-game results of tools/sync_target.sh into one table
// (stdout + GitHub step summary), with the pipeline stages first:
//   --stage gate=success --stage tag=skipped --stage plan=success
// (GitHub job results: success | failure | cancelled | skipped).
// --publish no = this run does not release to games (push of the default
// branch: verify + tag only). Games are then listed as "not run", not failed.
//
// A game in the target list without a result is explained by the stage that
// stopped it (gate / tag failed) or counted as a setup failure. The engine
// columns: before (what the game had), candidate (what this run releases),
// after (what the game has now: changes only on a successful push).
// Exit 1 when a stage or any game failed (a partial release shows as failed).
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dir = args[0] || "sync-results";
const expected = args[1] && !args[1].startsWith("--") ? JSON.parse(args[1]) : [];
const stages = {};
let publish = true;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--stage") { const [k, v] = String(args[++i]).split("="); stages[k] = v; }
  if (args[i] === "--publish") publish = args[++i] !== "no";
}
const stageOk = v => v === undefined || v === "success" || v === "skipped";
const stageFailed = Object.entries(stages).filter(([, v]) => !stageOk(v));

const results = [];
if (fs.existsSync(dir)) {
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    if (String(f).endsWith(".json")) results.push(JSON.parse(fs.readFileSync(path.join(dir, String(f)), "utf8")));
  }
}
const why = !publish ? { status: "not-run", detail: "this run only verifies and tags; publish with a manual run (dry_run off)" }
  : !stageOk(stages.gate) ? { status: "failed", detail: `not attempted: gate ${stages.gate}` }
  : !stageOk(stages.plan) ? { status: "failed", detail: `not attempted: plan ${stages.plan}` }
  : !stageOk(stages.tag) ? { status: "failed", detail: `not attempted: release tag ${stages.tag}` }
  : { status: "failed", detail: "no result (job setup failed or was cancelled)" };
for (const repo of expected) {
  if (!results.some(r => r.repo.toLowerCase() === repo.toLowerCase())) {
    results.push({ repo, oldVersion: "?", candidateVersion: "?", resultVersion: "?", tests: "not run", ...why });
  }
}
results.sort((a, b) => a.repo.localeCompare(b.repo));

const icon = {
  updated: "✅ updated", "up-to-date": "✅ up to date", "dry-run": "🧪 dry run, not pushed",
  "not-run": "⏸ not run", failed: "❌ failed", prepared: "❌ stopped after prepare", tested: "❌ stopped before publish",
};
const isFail = r => !["updated", "up-to-date", "dry-run", "not-run"].includes(r.status);
const failed = results.filter(isFail);
const ok = results.filter(r => !isFail(r) && r.status !== "not-run").length;
const headline = stageFailed.length ? `❌ Stopped: ${stageFailed.map(([k, v]) => `${k} ${v}`).join(", ")}`
  : !publish ? "✅ Verified (games are released by a manual run)"
  : !results.length ? "⚠️ No games in sync_targets.txt"
  : failed.length === 0 ? `✅ All ${results.length} game(s) ok`
  : ok === 0 ? `❌ All ${results.length} game(s) failed`
  : `⚠️ Partial release: ${ok} ok, ${failed.length} failed`;

const lines = [`## Engine release: ${headline}`, ""];
if (Object.keys(stages).length) {
  lines.push("| Stage | Result |", "|---|---|", ...Object.entries(stages).map(([k, v]) => `| ${k} | ${stageOk(v) ? (v === "skipped" ? "⏭ skipped" : "✅ success") : "❌ " + v} |`), "");
}
lines.push(
  "| Game | Engine before | Candidate | Engine after this run | Smoke tests | Result | Details |",
  "|---|---|---|---|---|---|---|",
  ...results.map(r => `| ${r.repo} | ${r.oldVersion} | ${r.candidateVersion} | ${r.resultVersion} | ${r.tests} | ${icon[r.status] || r.status}${r.phase && isFail(r) ? ` (${r.phase})` : ""} | ${r.detail || (r.commit ? "commit " + r.commit : "")} |`),
  "");
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
for (const [k, v] of stageFailed) console.log(process.env.GITHUB_ACTIONS ? `::error title=Engine release::stage ${k}: ${v}` : `FAILED stage ${k}: ${v}`);
for (const r of failed) {
  const m = `${r.repo}: ${r.detail || "failed"}`;
  console.log(process.env.GITHUB_ACTIONS ? `::error title=Engine release failed::${m}` : `FAILED ${m}`);
}
process.exit(failed.length || stageFailed.length ? 1 : 0);
