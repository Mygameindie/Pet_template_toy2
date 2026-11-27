// Browser smoke tests: `npm test` (see README.md).
// GAME_DIR=<path> runs the same tests against another game folder (the
// release workflow uses this to test each game after the engine is copied in).
// PW_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
// PORT=<n> picks the port; by default it is derived from the game folder, so
// two games (e.g. both templates) can be tested at the same time.
import { defineConfig } from "@playwright/test";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(process.env.GAME_DIR || here);
const derived = 4173 + (crypto.createHash("sha256").update(gameDir.toLowerCase()).digest().readUInt16BE(0) % 800);
const port = Number(process.env.PORT || derived);

export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.mjs",   // tests/*.test.mjs are node:test unit tests
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 800 },
    channel: process.env.PW_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/static-server.mjs",
    url: `http://127.0.0.1:${port}/index.html`,
    reuseExistingServer: false,
    env: { PORT: String(port), GAME_DIR: gameDir },
  },
});
