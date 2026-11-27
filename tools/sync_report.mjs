#!/usr/bin/env node
// tools/sync_report.mjs <results-dir> [expected-targets-json]
// Combines the per-game results of tools/sync_target.sh into one table
// (stdout + GitHub step summary). A game in the target list with no result
// (its job crashed or was cancelled) counts as failed.
// Exit 1 when any game failed, so a partial failure shows as a failed run.
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] || "sync-results";
const expected = process.argv[3] ? JSON.parse(process.argv[3]) : [];
const results = [];
if (fs.existsSync(dir)) {
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    if (String(f).endsWith(".json")) results.push(JSON.parse(fs.readFileSync(path.join(dir, String(f)), "utf8")));
  }
}
for (const repo of expected) {
  if (!results.some(r => r.repo.toLowerCase() === repo.toLowerCase())) {
    results.push({ repo, oldVersion: "?", newVersion: "?", tests: "?", status: "failed", detail: "no result (job did not finish)" });
  }
}
results.sort((a, b) => a.repo.localeCompare(b.repo));

const icon = { updated: "✅ updated", "up-to-date": "✅ up to date", "dry-run": "🧪 dry run", failed: "❌ failed" };
const failed = results.filter(r => r.status === "failed");
const ok = results.length - failed.length;
const headline = !results.length ? "⚠️ No games in sync_targets.txt"
  : failed.length === 0 ? `✅ All ${results.length} game(s) released`
  : ok === 0 ? `❌ All ${results.length} game(s) failed`
  : `⚠️ Partial release: ${ok} ok, ${failed.length} failed`;

const lines = [
  `## Engine release: ${headline}`, "",
  "| Game | Engine before | Engine after | Smoke tests | Result | Details |",
  "|---|---|---|---|---|---|",
  ...results.map(r => `| ${r.repo} | ${r.oldVersion} | ${r.newVersion} | ${r.tests} | ${icon[r.status] || r.status} | ${r.detail || (r.commit ? "commit " + r.commit : "")} |`),
  "",
];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
for (const r of failed) {
  const m = `${r.repo}: ${r.detail || "failed"}`;
  console.log(process.env.GITHUB_ACTIONS ? `::error title=Engine release failed::${m}` : `FAILED ${m}`);
}
process.exit(failed.length ? 1 : 0);
