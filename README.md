# Pet Game — Shared Engine + Per-Game Content

This game and its sibling repo run on **the same engine** but are
**different games**. The rule is simple:

```
engine/           SHARED — identical in every game repo. Never edit it
                  in only one repo: edit once, run ./sync_engine.sh,
                  commit BOTH repos.
sync_engine.sh    SHARED — the script that copies engine/ to the other repo.
README.md         SHARED — this file.

game_config.js    PER-GAME — how many characters, their positions,
                  art suffixes, and fallback tints.
outfit_config.js  PER-GAME — each character's wardrobe (clothes lists).
outfit_presets.js PER-GAME — saved outfit "looks" (data only; the
                  Outfits button UI lives in engine/outfit_presets_ui.js).
feed_items.json   PER-GAME — foods.
garden_items.json PER-GAME — garden plants.
toys.json         PER-GAME — toys. A toy id ending in a number (toy_1)
                  only works on that character; an id without a number
                  works on everyone.
images/           PER-GAME — all art.
index.html        PER-GAME — page title + script list.
```

## How to change something

**Game behavior for BOTH games** (physics, a mode, a bug fix):
1. Edit the file in `engine/` in either repo.
2. Run `./sync_engine.sh <path-to-other-repo>` — e.g. `./sync_engine.sh ../Pet_template_toy2`
3. Commit and push **both** repos.

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
