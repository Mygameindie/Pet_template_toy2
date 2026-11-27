// Browser smoke tests for a pet game built on the shared engine.
//
// The tests read the game's own GAME_CONFIG at runtime, so the same file runs
// against the 1-pet template, the 2-pet template, and every downstream game
// (the release workflow points GAME_DIR at each game after copying the engine
// in). Two-pet checks are skipped when a game has a single pet.
//
// Run: npm test            (this repo)
//      GAME_DIR=../Game npm test   (another game folder)
import { test, expect } from "@playwright/test";

const MODES = [
  ["#feed-btn", "feed"], ["#shower-btn", "shower"], ["#troll-btn", "trolling"],
  ["#karaoke-btn", "karaoke"], ["#sleep-btn", "sleep"], ["#doctor-btn", "doctor"],
  ["#playground-btn", "playground"], ["#garden-btn", "garden"], ["#normal-btn", "normal"],
];

// Missing art is normal (the engine probes optional pictures and falls back),
// so 404s for images are not failures. A missing script, stylesheet or data
// file is.
function watchPage(page) {
  const problems = [];
  page.on("pageerror", e => problems.push(`page error: ${e.message}`));
  page.on("response", r => {
    const url = new URL(r.url());
    if (r.status() >= 400 && /\.(js|css|json|html)$/i.test(url.pathname)) {
      problems.push(`${r.status()} ${url.pathname}`);
    }
  });
  return problems;
}

async function openGame(page) {
  await page.goto("/index.html");
  await page.waitForFunction(() => window._modeName === "normal" && !!window.PetStats, null, { timeout: 20_000 });
  // let the pets land after the first frames of physics
  await page.waitForTimeout(1500);
}

const petCount = page => page.evaluate(() => (window.GAME_CONFIG.pets || [{}]).length);

// Presses on a pet's body on the canvas (a real mouse press, the same as a
// player) and returns the index of the pet the engine selected, or null.
async function pressPet(page, i) {
  const vp = page.viewportSize();
  const xFrac = await page.evaluate(n => {
    const p = window.GAME_CONFIG.pets[n];
    return p.xFrac != null ? p.xFrac : (n + 1) / (window.GAME_CONFIG.pets.length + 1);
  }, i);
  for (const yFrac of [0.65, 0.6, 0.7, 0.55, 0.75, 0.5]) {
    for (const dx of [0, -15, 15]) {
      const x = Math.round(xFrac * vp.width + dx), y = Math.round(yFrac * vp.height);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.waitForTimeout(80);
      await page.mouse.up();
      await page.waitForTimeout(600); // let it settle before the next press
      if (await page.evaluate(n => window.activePetIndex === n, i)) return i;
    }
  }
  return null;
}

// Dress Up panel: pick a character, then the first category that has an item
// different from what it wears now; returns { category, item }.
async function dressCharacter(page, pet, avoid) {
  const panel = page.locator("#dressup-panel");
  if (!(await panel.isVisible())) await page.click("#dressup-btn");
  if ((await petCount(page)) > 1) {
    await panel.getByRole("button", { name: `🐾 Character ${pet + 1}`, exact: true }).click();
  }
  const cats = await page.evaluate(p => {
    const cat = window.dressUpCatalog[p] || {};
    return Object.keys(cat).map(k => ({ key: k, label: cat[k].label || k }));
  }, pet);
  for (const { key, label } of cats) {
    const tab = panel.getByRole("button", { name: label, exact: true });
    if (!(await tab.count())) continue;
    await tab.click();
    const current = await page.evaluate(([p, k]) => String(window.selectedClothes[p][k]), [pet, key]);
    const thumbs = panel.locator("button[title]");
    const n = await thumbs.count();
    for (let t = 0; t < n; t++) {
      const title = await thumbs.nth(t).getAttribute("title");
      if (!title || title === "None") continue;
      await thumbs.nth(t).click();
      const now = await page.evaluate(([p, k]) => String(window.selectedClothes[p][k]), [pet, key]);
      if (now !== current && !(avoid && avoid.category === key && avoid.item === now)) {
        return { category: key, item: now };
      }
    }
  }
  return null;
}

test.describe("shared engine smoke", () => {
  test("loads with no script errors", async ({ page }) => {
    const problems = watchPage(page);
    await openGame(page);
    const n = await petCount(page);
    expect(n).toBeGreaterThan(0);
    await expect(page.locator("#canvas")).toBeVisible();
    await expect(page.locator("#pet-stats-panel .stats-card")).toHaveCount(n);
    await expect(page.locator("#dressup-btn")).toBeVisible();
    expect(await page.evaluate(() => window.PET_DRAW_ORDER.length)).toBe(n);
    expect(problems).toEqual([]);
  });

  test("every mode button switches mode and back", async ({ page }) => {
    const problems = watchPage(page);
    await openGame(page);
    for (const [sel, name] of MODES) {
      if (!(await page.locator(sel).count())) continue; // a game may drop a mode
      await page.click(sel);
      await page.waitForFunction(m => window._modeName === m, name, { timeout: 10_000 });
      await expect(page.locator(sel)).toHaveClass(/active/);
    }
    expect(problems).toEqual([]);
  });

  test("pressing a pet selects it; Dress Up changes its clothes", async ({ page }) => {
    const problems = watchPage(page);
    await openGame(page);
    expect(await pressPet(page, 0)).toBe(0);
    const picked = await dressCharacter(page, 0);
    expect(picked, "no clothing item could be changed from the Dress Up panel").not.toBeNull();
    await expect(page.locator("#dressup-btn")).toHaveText(/Dress Up \(\d+ items?\)/);
    await page.click("#confidence-btn");
    await expect(page.locator("#hint")).toHaveText(/Confidence boosted/);
    expect(problems).toEqual([]);
  });

  test("progress is saved and restored after reload", async ({ page }) => {
    const problems = watchPage(page);
    await openGame(page);
    const saveKey = await page.evaluate(() => window.GAME_CONFIG.saveKey || "purelilypet_save");
    const before = await page.evaluate(() => window.PetStats.getInventory());
    const food = Object.keys(before).find(k => before[k] > 0);

    // Player actions: mute with the sound button (UI), heal pet 1, use a food.
    await page.click("#mute-btn");
    await expect(page.locator("#mute-btn")).toHaveText("🔇");
    await page.evaluate(f => {
      window.PetStats.heal(0);
      if (f) window.PetStats.useInventory(f);
    }, food);
    const progress = await page.evaluate(() => ({
      stats: window.PetStats.get(0), inv: window.PetStats.getInventory(), muted: window.PetStats.isMuted(),
    }));
    const raw = await page.evaluate(k => localStorage.getItem(k), saveKey);
    expect(raw, `save not written under GAME_CONFIG.saveKey "${saveKey}"`).not.toBeNull();

    await page.reload();
    await page.waitForFunction(() => window._modeName === "normal" && !!window.PetStats);
    const after = await page.evaluate(() => ({
      stats: window.PetStats.get(0), inv: window.PetStats.getInventory(), muted: window.PetStats.isMuted(),
    }));
    expect(after.muted).toBe(true);
    await expect(page.locator("#mute-btn")).toHaveText("🔇");
    expect(after.inv).toEqual(progress.inv);
    if (food) expect(after.inv[food]).toBe(before[food] - 1);
    for (const k of ["hunger", "happiness", "cleanliness", "energy"]) {
      // stats decay a little per second; a reset to defaults would be far off
      expect(Math.abs(after.stats[k] - progress.stats[k]), k).toBeLessThan(3);
    }
    expect(problems).toEqual([]);
  });

  test("gender setting picks the boy art (games with a gender setting)", async ({ page }) => {
    // Serve game_config.js with gender "boy" (the file on disk is not changed).
    let hasGender = false;
    await page.route("**/game_config.js*", async route => {
      const res = await route.fetch();
      let body = await res.text();
      // the setting line itself, not the "gender: ..." examples in comments
      const setting = /^(\s*)gender:\s*"(girl|boy)"/m;
      hasGender = setting.test(body);
      body = body.replace(setting, '$1gender: "boy"');
      await route.fulfill({ response: res, body });
    });
    const problems = watchPage(page);
    await openGame(page);
    test.skip(!hasGender, "this game has no gender setting");
    expect(await page.evaluate(() => window.GAME_CONFIG.pets.map(p => p.artSuffix))).toEqual(["_2"]);
    expect(problems).toEqual([]);
  });
});

test.describe("two pets", () => {
  test("pressing a pet brings it to the front", async ({ page }) => {
    const problems = watchPage(page);
    await openGame(page);
    const n = await petCount(page);
    test.skip(n < 2, "single-pet game");
    const focus = await page.evaluate(() => !!window.GAME_CONFIG.focusToFront);
    const front = () => page.evaluate(() => window.PET_DRAW_ORDER[window.PET_DRAW_ORDER.length - 1]);
    const start = await front();
    const back = start === 0 ? 1 : 0;

    expect(await pressPet(page, back), `could not press pet ${back + 1} on the canvas`).toBe(back);
    expect(await front()).toBe(focus ? back : start);
    expect(await page.evaluate(() => window.PET_FRONT_FIRST[0])).toBe(await front());

    expect(await pressPet(page, start)).toBe(start);
    expect(await front()).toBe(start);

    // Choosing a character in Dress Up does the same.
    await page.click("#dressup-btn");
    await page.locator("#dressup-panel").getByRole("button", { name: `🐾 Character ${back + 1}`, exact: true }).click();
    expect(await page.evaluate(() => window.activePetIndex)).toBe(back);
    expect(await front()).toBe(focus ? back : start);
    expect(problems).toEqual([]);
  });

  test("each pet keeps its own outfit", async ({ page }) => {
    // A template may not ship clothing art for character 2 yet (the wardrobe
    // hides items without a picture). For this test only, a missing clothing
    // picture is served as a stand-in so both wardrobes have items.
    const STAND_IN = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    await page.route(/\/images\/[^/]+\.png(\?.*)?$/, async route => {
      const res = await route.fetch();
      if (res.status() !== 404) return route.fulfill({ response: res });
      return route.fulfill({ status: 200, contentType: "image/png", body: STAND_IN });
    });
    const problems = watchPage(page);
    await openGame(page);
    test.skip((await petCount(page)) < 2, "single-pet game");

    const snap = () => page.evaluate(() => JSON.parse(JSON.stringify(window.selectedClothes)));
    const start = await snap();

    const a = await dressCharacter(page, 0);
    expect(a, "nothing to change for character 1").not.toBeNull();
    const afterA = await snap();
    expect(afterA[1], "dressing character 1 changed character 2").toEqual(start[1]);

    const b = await dressCharacter(page, 1, a);
    expect(b, "nothing to change for character 2").not.toBeNull();
    const afterB = await snap();
    expect(afterB[0], "dressing character 2 changed character 1").toEqual(afterA[0]);
    expect(afterB[1][b.category]).toBe(b.item);
    expect(afterB[0][a.category]).toBe(a.item);
    expect(problems).toEqual([]);
  });
});
