// Defensive tests for the smoke-test file server: `npm run test:server`.
// Builds a throw-away game folder with a secret file next to it, a .git
// folder inside it and (where the OS allows) symlinks pointing out.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { realRoot, resolveRequest, createServer } from "./static-server.mjs";

let tmp, root, game;
const canLink = { file: false, dir: false };

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "static-server-test-"));
  game = path.join(tmp, "game");
  fs.mkdirSync(path.join(game, "engine"), { recursive: true });
  fs.mkdirSync(path.join(game, ".git"));
  fs.mkdirSync(path.join(game, "images", "parts"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "game-evil"));            // sibling with the same prefix
  fs.writeFileSync(path.join(game, "index.html"), "<html></html>");
  fs.writeFileSync(path.join(game, "engine", "a.js"), "1");
  fs.writeFileSync(path.join(game, "images", "parts", "head.png"), "png");
  fs.writeFileSync(path.join(game, ".git", "config"), "[http] extraheader = SECRET");
  fs.writeFileSync(path.join(game, ".env"), "SECRET");
  fs.writeFileSync(path.join(tmp, "secret.txt"), "SECRET");
  fs.writeFileSync(path.join(tmp, "game-evil", "x.js"), "SECRET");
  try { fs.symlinkSync(path.join(tmp, "secret.txt"), path.join(game, "link-out.txt"), "file"); canLink.file = true; } catch {}
  try { fs.symlinkSync(tmp, path.join(game, "dir-out"), "junction"); canLink.dir = true; } catch {}
  try { fs.symlinkSync(path.join(game, "engine", "a.js"), path.join(game, "link-in.js"), "file"); } catch {}
  root = realRoot(game);
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const status = p => resolveRequest(root, p).status;

test("serves files inside the game folder", () => {
  assert.equal(status("/index.html"), 200);
  assert.equal(status("/"), 200);
  assert.equal(status("/engine/a.js?v=20261104b"), 200);
  assert.equal(status("/images/parts/head.png"), 200);
  assert.equal(resolveRequest(root, "/engine/a.js").file, path.join(root, "engine", "a.js"));
});

test("missing files and folders are 404", () => {
  assert.equal(status("/nope.js"), 404);
  assert.equal(status("/engine"), 404);
});

test("refuses .git, dotfiles and dot folders", () => {
  for (const p of ["/.git/config", "/.git/", "/.env", "/%2egit/config", "/engine/.hidden", "/.github/workflows/x.yml"]) {
    assert.equal(status(p), 403, p);
  }
});

test("refuses traversal out of the game folder", () => {
  for (const p of ["/../secret.txt", "/%2e%2e/secret.txt", "/engine/%2e%2e/%2e%2e/secret.txt", "/..%2fsecret.txt", "/../game-evil/x.js"]) {
    assert.notEqual(status(p), 200, p);
  }
  assert.equal(status("/..%5csecret.txt"), 400);   // backslash
  assert.equal(status("/a%00.js"), 400);           // NUL byte
});

test("refuses a symlink that points outside", t => {
  if (!canLink.file && !canLink.dir) return t.skip("this OS/user cannot create symlinks");
  if (canLink.file) assert.equal(status("/link-out.txt"), 403);
  if (canLink.dir) assert.equal(status("/dir-out/secret.txt"), 403);
});

test("allows a symlink that stays inside", t => {
  if (!fs.existsSync(path.join(game, "link-in.js"))) return t.skip("cannot create symlinks");
  assert.equal(status("/link-in.js"), 200);
});

test("HTTP server answers with the same rules", async () => {
  const server = createServer(game);
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + "/index.html")).status, 200);
    assert.equal((await fetch(base + "/.git/config")).status, 403);
    const body = await (await fetch(base + "/.git/config")).text();
    assert.ok(!body.includes("SECRET"));
    assert.equal((await fetch(base + "/x", { method: "POST" })).status, 405);
  } finally { server.close(); }
});
