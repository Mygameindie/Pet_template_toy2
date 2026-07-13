// ===========================================================
// 🎀 outfit_presets.js — Save & apply whole outfit "looks"
// ===========================================================
//
//  A PRESET is a named set of clothes (and optional colors) that you can
//  apply to the pet with a single tap. Think of it as a saved outfit.
//
//  HOW TO ADD / EDIT A PRESET (one place — the list below):
//    1. Add an object to window.OUTFIT_PRESETS.
//    2. `clothes` maps a category -> the item id from outfit_config.js.
//       Categories: topUnderwear, bottomUnderwear, onepieceUnderwear,
//                   top, bottom, dress, shoes, hat.
//       Any category you leave out is treated as "None" (taken off).
//    3. `colors` is OPTIONAL. Map a category -> a color name:
//       Original, Red, Orange, Yellow, Green, Cyan, Blue, Purple, Pink.
//    4. Refresh. A button for the preset appears in the 🎀 Outfits panel.
//
//  Example:
//    { name: "Cool", emoji: "😎",
//      clothes: { top: "top1", bottom: "pants1", shoes: "shoes1" },
//      colors:  { top: "Blue", bottom: "Green" } }
//
//  DIFFERENT OUTFIT PER CHARACTER: the two characters don't wear the same
//  things (character 1 is a girl, character 2 is a boy — he has no dress or
//  skirt). Give a preset a `pet2` (or `pet1`) block to say what THAT
//  character wears for this look; the top-level clothes/colors are used for
//  everyone else. Example — girl wears a dress, boy wears top + pants:
//
//    { name: "Party", emoji: "🎀",
//      clothes: { dress: "dress1", shoes: "shoes1" },        // character 1
//      colors:  { dress: "Red" },
//      pet2: {                                               // character 2
//        clothes: { top: "top1", bottom: "pants1", shoes: "shoes1" },
//        colors:  { top: "Red" },
//      } }
//
//  You can write ids either way ("top1" or "top1_2") — they are translated
//  to the id that exists for the character being dressed, and anything the
//  character doesn't have (no item / missing PNG) is simply skipped.
// ===========================================================

window.OUTFIT_PRESETS = [
  {
    name: "Casual",
    emoji: "👕",
    clothes: { top: "top1", bottom: "pants1", shoes: "shoes1" },
    colors:  { bottom: "Blue" },
  },
  {
    name: "Skirt Day",
    emoji: "🌸",
    clothes: { top: "top1", bottom: "skirt1", shoes: "shoes1", hat: "hat1" },
    colors:  { top: "Pink", bottom: "Purple" },
    // Boy version: no skirt — same look with pants.
    pet2: {
      clothes: { top: "top1", bottom: "pants1", shoes: "shoes1", hat: "hat1" },
      colors:  { top: "Pink", bottom: "Purple" },
    },
  },
  {
    name: "Party Dress",
    emoji: "🎀",
    clothes: { dress: "dress1", shoes: "shoes1", hat: "hat1" },
    colors:  { dress: "Red", hat: "Yellow" },
    // Boy version: no dress — a red top + pants instead.
    pet2: {
      clothes: { top: "top1", bottom: "pants1", shoes: "shoes1", hat: "hat1" },
      colors:  { top: "Red", hat: "Yellow" },
    },
  },
  {
    name: "Comfy",
    emoji: "🩲",
    clothes: { topUnderwear: "topunderwear1", bottomUnderwear: "bottomunderwear1" },
    // Boy version: just boxers.
    pet2: {
      clothes: { bottomUnderwear: "boxers1" },
    },
  },
  {
    name: "Swimsuit",
    emoji: "🩱",
    clothes: { onepieceUnderwear: "onepieceunderwear1" },
    colors:  { onepieceUnderwear: "Cyan" },
    // Boy version: no one-piece — swim in boxers.
    pet2: {
      clothes: { bottomUnderwear: "boxers1" },
      colors:  { bottomUnderwear: "Cyan" },
    },
  },
  {
    name: "Birthday Suit",
    emoji: "🚫",
    clothes: {}, // take everything off
  },
];


// The apply logic + Outfits button UI live in the shared engine:
// engine/outfit_presets_ui.js (loaded by index.html after this file).
