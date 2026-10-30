// ===========================================================
// 📐 pet_art.js — Shared pet sprite metrics
// ===========================================================
// The main screen (pet_script.js) sizes the pet by deriving its WIDTH from the
// base image's real aspect ratio (width = height × naturalWidth/naturalHeight),
// instead of hardcoding it. Every other mode used a fixed 400×450 (or 520×520
// in shower), so if the real art isn't a 400:450 ratio the pet looked a
// different size/shape in those modes.
//
// This module preloads the base sprite once and exposes its true aspect ratio
// so every mode can size the pet identically to the main screen.
// Stacking order of the characters (game_config.js: pets[i].z, higher = in
// front; default = its position in the list, so a later pet is drawn over an
// earlier one). PET_DRAW_ORDER lists pet indexes back to front (draw in this
// order), PET_FRONT_FIRST front to back (hit tests: the pet on top wins).
(function () {
  const cfg = (window.GAME_CONFIG && window.GAME_CONFIG.pets) || [{}];
  const z = i => (cfg[i] && cfg[i].z != null) ? cfg[i].z : i;
  window.PET_DRAW_ORDER = cfg.map((_, i) => i).sort((a, b) => z(a) - z(b) || a - b);
  window.PET_FRONT_FIRST = window.PET_DRAW_ORDER.slice().reverse();

  // focusToFront (game_config.js): the character you pick (press on it, tap it,
  // choose it in Dress Up) comes in front of the others and stays there. Every
  // mode already calls setActivePet(i) when one is chosen, which calls this.
  // The two lists are changed in place, so every mode sees the new order.
  window.bringPetToFront = function (i) {
    if (!window.GAME_CONFIG || !window.GAME_CONFIG.focusToFront) return;
    const back = window.PET_DRAW_ORDER, front = window.PET_FRONT_FIRST;
    const a = back.indexOf(i);
    if (a < 0 || a === back.length - 1) return;
    back.splice(a, 1); back.push(i);
    front.splice(front.indexOf(i), 1); front.unshift(i);
  };
})();

(function () {
  const FALLBACK_ASPECT = 400 / 450; // matches the old hardcoded ratio

  const base = new Image();
  // asset_path_fix.js rewrites this to images/base.png.
  base.src = 'base.png';

  window.PetArt = {
    base,
    // True width:height ratio of the base sprite (falls back until it loads).
    aspect() {
      return (base.complete && base.naturalWidth > 0 && base.naturalHeight > 0)
        ? base.naturalWidth / base.naturalHeight
        : FALLBACK_ASPECT;
    },
    // Width that matches the main screen for a given drawn height.
    widthForHeight(h) {
      return h * this.aspect();
    },
    // Register a callback to re-sync sizes once the real aspect ratio is known.
    onReady(cb) {
      if (typeof cb !== 'function') return;
      if (base.complete && base.naturalWidth > 0) { cb(); return; }
      base.addEventListener('load', cb, { once: true });
    },
  };
})();
