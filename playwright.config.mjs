// Browser smoke tests: `npm test` (see tests/README.md).
// GAME_DIR=<path> runs the same tests against another game folder (the
// release workflow uses this to test each game after the engine is copied in).
// PW_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
import { defineConfig } from "@playwright/test";

const port = Number(process.env.PORT || 4173);

export default defineConfig({
  testDir: "tests",
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
    env: { PORT: String(port), GAME_DIR: process.env.GAME_DIR || "" },
  },
});
