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

## Ragdoll (ported from Computer-pet)

In normal mode a character is a skeleton instead of a flat picture when every
required body part exists in `images/parts/` (`head`, `body`, `arm_L`, `arm_R`,
`leg_L`, `leg_R`; optional `chest_L/R`, `back_hair`, `wing_L/R`, `back_tail`;
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
