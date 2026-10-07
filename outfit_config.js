// ===========================================================
// 👗 outfit_config.js — THE one place to add / edit clothes
// ===========================================================
//
//  HOW TO ADD A NEW CLOTHING ITEM (3 steps):
//    1. Save the artwork as   images/<name>.png   (transparent PNG, same
//       canvas size as the pet base so it lines up).
//    2. Add "<name>" to the matching list below — under pet1 (character 1)
//       and/or pet2 (character 2). Example: add a 2nd top -> "top2".
//    3. Refresh. Done. It shows up in the Dress Up panel automatically.
//
//  LABELS are made automatically from the name:  "top2" -> "Top 2".
//    Want a custom name? Use an object instead of a string:
//        { id: "top2", label: "Cool Hoodie" }
//
//  CHARACTERS CAN HAVE DIFFERENT CLOTHES. Each character only shows the
//  categories/items it actually has: if a category is missing from pet2's
//  list below — or an item's PNG doesn't exist in images/ — that item (or the
//  whole tab) is hidden for that character automatically. So if character 1
//  has a hat but character 2 doesn't, that's fine: character 2 just won't
//  show a Hat tab, and presets that include a hat simply skip it for him.
//
//  UNDERWEAR: a one-piece is a complete set and replaces the separate top +
//  bottom. Switching OFF a one-piece to a separate piece completes the set
//  (top1 -> also bottom1). Once you're already in separates you can mix any
//  top with any bottom (top1 + bottom2) — they are not re-paired.
//
//  WIND (troll blower): skirt-like clothes (dresses + anything with "skirt"
//  in its name) blow in the wind automatically. The normal skirt image is
//  bent in code (flared, lifted and fluttered), so no extra "blown" art is
//  needed. Two styles: "flow" (soft billow, the default) and "lift" (the hem
//  is thrown up and flared wide like an umbrella). Pick per item with
//  windStyle below. The skirt is a small cloth simulation: it lags,
//  overshoots and settles, reacts to gusts and to the pet moving, and reads
//  its own shape from the picture (a longer skirt swings slower). Tune it with
//  WIND_PRESETS / WIND_PHYS in outfit_system_single_sprite.js.
//
//  This is a plain JS file (no network/JSON loading) so it can't glitch or
//  fail to load mid-game — it's the smoothest, simplest setup.
// ===========================================================

// The moving skirt piece of dress1, as fractions (0..1) of the picture.
const DRESS1_SKIRT = {
  left: 0.41, right: 0.59, top: 0.605, bottom: 0.80,
  // the lower underskirt outline: it fades away while the skirt is blown up
  hide: { left: 0.37, right: 0.63, top: 0.83, bottom: 0.91 },
};

// The long dress1 has sleeves that flap in the wind. (Its back piece blows as a whole, like a normal dress: backWind + backStyle below.) Same idea:
// boxes as fractions (0..1) of the picture. A "flap" is pinned on its inner
// edge (pin: "right" for the sleeve on the left of the picture) and opens, rises
// and flutters at the free end. A "skirt" part hangs from its top edge; dir
// pushes it outward from the body (-1 = left, 1 = right).
const DRESS1_PARTS = [
  { kind: "flap", on: "front", pin: "right", region: { left: 0.245, right: 0.40, top: 0.52, bottom: 0.73 } },
  { kind: "flap", on: "front", pin: "left",  region: { left: 0.60,  right: 0.755, top: 0.52, bottom: 0.73 } },
];

window.OUTFIT_CONFIG = {

  // -------------------------------------------------------------------------
  // BACK PIECES (drawn BEHIND the body)
  // A clothing item can have a second picture that sits behind the pet, so a
  // skirt/dress can have a back part (seen between and behind the legs) and a
  // front part. Draw both on the same canvas size, then in the wardrobe list:
  //     dress: [ "dress1", { id: "dress2", back: true } ]
  //   -> dress2.png       = front piece (on top of the body, as usual)
  //   -> dress2_back.png  = back piece  (behind the body)
  // (use back: "myname" to pick a different file name). The back piece gets the
  // same colour. For skirts/dresses it stays STILL by default; to make it move
  // in the wind, add backRegion (the box of its skirt part, same idea as
  // region) or backWind: true (the whole piece moves) in windStyle.
  //
  // A whole category can also sit behind the body: add behind: true to its line
  // in categories below (e.g. a cape or back hair).
  // -------------------------------------------------------------------------

  // Wind style per skirt/dress id: "flow" or "lift". Anything not listed uses
  // "default". Add a line here for each skirt that should blow up high.
  //
  // For a dress that also has a veil, sleeves, crown... use { style, region }
  // so ONLY the skirt piece moves. region is the skirt's box as fractions
  // (0..1) of the image: left/right edges, top = waist, bottom = hem.
  // If the hem gets cut off, raise bottom; if veil bits get dragged along,
  // narrow left/right. Optional tune: { flare, lift, speed } changes the blown-up
  // pose of one item (flare = hem widening, lift = how high the hem rises,
  // speed = swing speed). Optional hide = a box (same fractions) that fades away
  // while blowing, for parts of the dress that shouldn't stay under a lifted skirt.
  // parts: [...] adds more pieces that move on their own (sleeves, side veils,
  // a cape...) - see DRESS1_PARTS above. Each part is { kind, region, on, pin, dir, tune }.
  windStyle: {
    default: "flow",
    skirt1: "lift",
    // The gold skirt of dress1. Its back picture has the same skirt in the same
    // place, so the back piece uses the same box and lifts together with it.
    dress1: { style: "lift", region: DRESS1_SKIRT, backWind: true, backStyle: "flow", parts: DRESS1_PARTS },
  },

  // -------------------------------------------------------------------------
  // CATEGORIES — order, display name, and draw layer (z). Higher z = on top.
  // Add a line here to create a brand-new clothing category, then add a
  // matching list under pet1 below.
  // -------------------------------------------------------------------------

  categories: [
    { key: "topUnderwear",      label: "Top Underwear",             z: 60  },
    { key: "bottomUnderwear",   label: "Bottom Underwear / Boxers", z: 50  },
    { key: "onepieceUnderwear", label: "One-Piece Underwear",       z: 65  },
    { key: "top",               label: "Top",                       z: 120 },
    { key: "bottom",            label: "Pants / Skirt",             z: 110 },
    { key: "dress",             label: "Dress",                     z: 130 },
    { key: "bodysuit",          label: "Bodysuit",                  z: 128 },
    { key: "shoes",             label: "Shoes",                     z: 90  },
    { key: "glove",             label: "Glove",                     z: 140 },
    { key: "bunnysuitbow",      label: "Bunnysuit Bow",             z: 150 },
    { key: "glasses",           label: "Glasses",                   z: 160 },
    { key: "ears",              label: "Ears",                      z: 170 },
    { key: "hat",               label: "Hat",                       z: 180 },
  ],

  pet1: {
    topUnderwear:      ["topunderwear1", "topunderwear2", "topunderwear3", "topunderwear4"],
    bottomUnderwear:   ["bottomunderwear1", "bottomunderwear2", "bottomunderwear3", "bottomunderwear4"],
    onepieceUnderwear: ["onepieceunderwear1"],
    top:               ["top1"],
    bottom:            ["pants1", "skirt1"],
    dress:             [{ id: "dress1", back: true }],
    bodysuit:          ["bodysuit1"],
    shoes:             ["shoes1"],
    glove:             ["glove1"],
    bunnysuitbow:      ["bunnysuitbow1"],
    glasses:           ["glasses1"],
    ears:              ["ears1"],
    hat:               ["hat1"],
  },

  // -------------------------------------------------------------------------
  // PET 2 — character 2 is a BOY. Boy clothing rules: no top underwear, no
  // one-piece underwear, no dress, no skirt. He wears boxers and pants instead,
  // but CAN wear a bunnysuit bow and a bodysuit. Art uses the "_2" suffix
  // (e.g. "top1_2"); drop the matching PNGs in images/. (Any category omitted
  // here is hidden from his Dress Up panel.)
  // -------------------------------------------------------------------------
  pet2: {
    bottomUnderwear:   ["bottomunderwear1_2", "boxers1_2"],
    top:               ["top1_2"],
    bottom:            ["pants1_2"],
    bodysuit:          ["bodysuit1_2"],
    shoes:             ["shoes1_2"],
    glove:             ["glove1_2"],
    bunnysuitbow:      ["bunnysuitbow1_2"],
    glasses:           ["glasses1_2"],
    ears:              ["ears1_2"],
    hat:               ["hat1_2"],
  },

  defaults: {
    pet1: {
      onepieceUnderwear: "onepieceunderwear1",
      glove: "glove1",
      shoes: "shoes1",
      ears: "ears1",
      bunnysuitbow: "bunnysuitbow1",
    },
    pet2: {
      bottomUnderwear: "boxers1_2",
      glove: "glove1_2",
      shoes: "shoes1_2",
      hat: "hat1_2",
    },
  },
};
