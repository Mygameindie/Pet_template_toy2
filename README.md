# Pet Game — Shared Engine + Per-Game Content

Several games run on **the same engine** but are **different games**.
There are two families, each with one TEMPLATE repo that releases the engine
to its games. Both families run **one engine with one source**: `engine/` in
`Pet_template_toy` (its version is `engine/VERSION`). `Pet_template_toy2`
carries a pinned copy of a released version (`engine.lock`).

| Family | Template (releases to its games) | Games that get its engine |
|---|---|---|
| 1 pet | `Pet_template_toy` | `Seafairycookiepet` |
| 2+ pets | `Pet_template_toy2` | `Devilangelpet`, `Temu` |

```
engine/           SHARED — the same in every game. Edit it ONLY in
                  Pet_template_toy; it is released to the games (see below).
engine/VERSION    SHARED — the engine version every game shows.
sync_engine.sh    SHARED — the script that copies engine/ to another repo.
README.md         SHARED — this file.
sync_targets.txt  TEMPLATE ONLY — the games this template's engine goes to.
engine.lock       TEMPLATE ONLY — which engine version this template has.
tools/, tests/    TEMPLATE ONLY — release tools and browser smoke tests
                  (package.json etc. are for these only; the game needs no build).

game_config.js    PER-GAME — how many characters, their positions,
                  art suffixes, and fallback tints.
outfit_config.js  PER-GAME — each character's wardrobe (clothes lists).
outfit_presets.js PER-GAME — saved outfit "looks" (data only; the
                  Outfits button UI lives in engine/outfit_presets_ui.js).
feed_items.json   PER-GAME — foods (the starting bag of each food is
                  GAME_CONFIG.startInventory in game_config.js).
garden_items.json PER-GAME — garden plants.
toys.json         PER-GAME — toys. A toy id ending in a number (toy_1)
                  only works on that character; an id without a number
                  works on everyone.
images/           PER-GAME — all art.
index.html        PER-GAME — page title + script list.
```

## How to change something

**Game behavior for every game** (physics, a mode, a bug fix):
1. In `Pet_template_toy`, on a work branch: edit `engine/`, raise the number
   in `engine/VERSION` (1.2.3 -> 1.2.4 for a fix, 1.3.0 for a feature), then
   run `npm run engine:lock` and commit `engine/` and `engine.lock` together.
2. Open a pull request. The **Engine check** runs the browser smoke tests on
   this template AND on `Pet_template_toy2` with the new engine. If you also
   change `Pet_template_toy2` for it, use a branch with the **same name** there:
   the check then tests the two branches together.
3. Merge. The **Release engine to games** workflow tests again, tags the
   release `engine-v<version>`, and releases it to the games in
   `sync_targets.txt`: one job per game, each tested with the new engine
   before it is pushed. A game whose tests fail is not changed; the run shows
   it as failed and the others still get the engine.
4. `Pet_template_toy2` takes the release when you choose: on a branch, run
   `git clone --branch engine-v<version> https://github.com/Mygameindie/Pet_template_toy ../engine-src`
   then `npm run engine:pull -- --from ../engine-src`, commit, open a pull
   request, merge. Its release workflow then sends it to its games.

Never edit `engine/` inside a game repo (Seafairycookiepet, Devilangelpet, Temu) or in
`Pet_template_toy2`: the Engine check fails on a changed copy ("engine
drift"), and the next release overwrites it.

**Checks and releases on GitHub** (Actions tab):
- *Engine check* (every push and pull request): engine drift, smoke tests.
  A pull request into the default branch of `Pet_template_toy2` also needs
  its engine pinned to a release tag; a work branch may pin a branch of
  `Pet_template_toy` while both are being changed (a warning, not an error).
- *Release engine to games*: the run summary has one row per game with its
  engine version before and after, the test result and the outcome. A run by
  hand is a dry run unless you untick it: it tests every game, pushes nothing.

Run the tests yourself: `npm ci`, `npx playwright install chromium`, then
`npm test` (`GAME_DIR=../<GameRepo> npm test` tests another game folder).
`npm run engine:check` runs the drift check, `npm run test:tools` the release
tools' own tests (local throw-away repos, no network, no token).

Adding a new game to a family: add its `owner/repo` line to the template's
`sync_targets.txt` (and give the sync token access to it, see below).

Manual sync (no GitHub needed): from the template's folder run
`./sync_engine.sh ../<GameRepo>`, then commit and push the game repo.

One-time setup for the automatic sync: create a GitHub fine-grained token
(Settings → Developer settings → Fine-grained tokens) with
**Contents: Read and write** on every game repo in `sync_targets.txt`, then
add it to the template repo as an Actions secret named `ENGINE_SYNC_TOKEN`
(template repo → Settings → Secrets and variables → Actions).

**Content for ONE game** (characters, clothes, items, art):
1. Edit that game's `game_config.js` / `outfit_config.js` / JSON files / `images/`.
2. Commit and push just that repo. No sync needed.

## How the engine knows which game it's running

`index.html` loads `game_config.js` **first**. It defines
`window.GAME_CONFIG` — the list of characters (one entry per pet:
art filename suffix, screen position, fallback tint). Every engine
file reads that list instead of hardcoding a pet count, so the same
engine runs a 1-pet game, a 2-pet game, or more.

Per-character art convention: pet 1 uses plain names (`base.png`),
other pets add their `artSuffix` (`base_2.png`, `base_sick_2.png`,
`skirt1_2.png`, ...). If a pet's art file is missing, the engine
draws pet 1's art with that pet's `drawFilter` tint so it still
looks like a different character.

## Ragdoll (ported from Computer-pet)

In normal mode a character is a skeleton instead of a flat picture when every
required body part exists in `images/parts/` (`head`, `body`, `arm_L`, `arm_R`,
`leg_L`, `leg_R`; optional `chest_L/R`, `back_hair`, `wing_L/R`, `back_tail`
(renamed with `tailFile` in `game_config.js`, e.g. `tailFile: "tail"`);
character 2 adds `_2`, e.g. `head_2.png`). Pick it up by a hand and it hangs by
that hand, throw it and it tumbles limp, then gets back up. A character without
a full set keeps its normal sprite. Turn it off with `ragdoll: false` in
`game_config.js`.

- `engine/ragdoll_config.js` — joints, limb limits, and which canvas area of a
  garment moves with which body part.
- `engine/ragdoll.js` — the physics and the code that cuts the clothes up.
- Drawing parts: `sprite_template/README.md`. Drawing clothes:
  `clothing_template/README.md` (incl. the `hangs` / `blows` / `stiff` / `suit` flags
  and the optional `_over`, `_under`, `_arm_L`, `_arm_R` pictures).
- The other modes draw `base.png`. It is the parts stacked in the standing
  pose, so keep it in sync when you redraw a part.

## Shy, faces and Confidence (ported from Devilangelpet)

Every character has a **Shy** stat. Being picked up, a toy touching it, or
the troll blower under its skirt raises it; it fades slowly, and the
💪 Confidence button resets it. A shy pet wears `head_shy.png`
(`head_shy_1.png` while a toy or wind touches it). Other heads are set by
what you do: `head_happy`, `head_disgust`, `head_sick`, `head_heal`,
`head_music`, `head_shower`, `head_1` (toy). Put them in `images/parts/`;
character 2 adds `_2` (`head_shy_2.png`). A head with no picture is skipped,
so a character without the art just keeps its normal head.
