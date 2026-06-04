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
