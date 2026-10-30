// ===========================================================
// 🎛️ GAME CONFIG — this file is PER-GAME (safe to edit here).
// The engine/ folder is SHARED between games: never edit it in
// only one repo — edit it once, then run ./sync_engine.sh
//
// pets: one entry per character.
//   artSuffix : filename suffix for this pet's art.
//               "" -> base.png, "_2" -> base_2.png, etc.
//               If a pet's art is missing, the engine falls back
//               to pet 1's art and applies drawFilter (a CSS
//               filter tint) so the pet still looks different.
//   xFrac     : horizontal start position, 0..1 of screen width.
//   drawFilter: CSS filter used when this pet falls back to
//               pet 1's art ("none" for no tint).
//   z         : (optional) stacking order, higher = in front of the others.
//               Default: later in this list = in front. Here the girl is
//               in front of the boy.
//
// posesFromHeads: true = there are no whole-body pictures (base.png,
//   base_sick.png, base_happy.png ...). Every pose is the body built from
//   images/parts/ plus that pose's head (head_sick.png, head_happy.png ...).
// ===========================================================
window.GAME_CONFIG = {
  saveKey: "purelilypet_save",
  posesFromHeads: false,
  // true = the character you pick comes in front of the other one (z below is
  // only the starting order). false = z is a fixed stacking order.
  focusToFront: true,
  pets: [
    { artSuffix: "",   xFrac: 0.35, drawFilter: "none", z: 2 },
    { artSuffix: "_2", xFrac: 0.65, drawFilter: "hue-rotate(140deg) saturate(1.2)", z: 1 },
  ],
};
