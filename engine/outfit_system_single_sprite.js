// ===========================================================
// 👕 outfit_system_single_sprite.js — Layered dress-up system
// ===========================================================
// Reads everything from window.OUTFIT_CONFIG (see outfit_config.js) — one
// plain-JS source of truth, loaded synchronously (no fetch, can't glitch).
//
// To ADD CLOTHES you only edit outfit_config.js. This file just renders and
// applies that config: the Dress Up panel (with image thumbnails), the colour
// tinting, the layering by z, and the girl/boy clothing rules.
//
// Rules preserved from before:
// - Top underwear + bottom underwear, OR a one-piece (mutually exclusive).
// - A one-piece is a complete set: selecting it clears top/bottom underwear.
// - Switching OFF a one-piece to a separate piece completes the set: picking
//   top1 also puts on the matching bottom1 (and vice versa).
// - Once you're already wearing separates, they are independent: changing one
//   does NOT change the other, so you can mix freely (top1 + bottom2).
// - Dress clears top + bottom; top or bottom clears dress.
(() => {
  const DEFAULT_COLOR = "Original";
  const COLORS = {
    Original: null,
    Red: "#ff3b30", Orange: "#ff9500", Yellow: "#ffcc00",
    Green: "#34c759", Cyan: "#32ade6", Blue: "#007aff",
    Purple: "#af52de", Pink: "#ff2d55",
  };

  // ---- Built-in fallback so the game still runs if the config is missing ----
  const FALLBACK_CONFIG = {
    categories: [
      { key: "topUnderwear", label: "Top Underwear", z: 60 },
      { key: "bottomUnderwear", label: "Bottom Underwear / Boxers", z: 50 },
      { key: "onepieceUnderwear", label: "One-Piece Underwear", z: 65 },
      { key: "top", label: "Top", z: 120 },
      { key: "bottom", label: "Pants / Skirt", z: 110 },
      { key: "dress", label: "Dress", z: 130 },
      { key: "shoes", label: "Shoes", z: 90 },
      { key: "hat", label: "Hat", z: 180 },
    ],
    pet1: {},
    defaults: { pet1: {} },
  };

  // ---- Helpers --------------------------------------------------------------
  function img(src) {
    const im = new Image();
    im._failed = false;
    im.onerror = () => { im._failed = true; scheduleArtRefresh(); };
    im.onload = () => { scheduleArtRefresh(); };
    im.src = src; // asset_path_fix.js rewrites bare names to images/<name>
    return im;
  }


  // Characters can have different wardrobes (e.g. pet 2 has no hat art). When
  // an item's PNG finishes loading — or fails — re-check everything once so
  // missing items disappear from the panel, invalid selections get cleared,
  // and the button count stays honest for whichever character is active.
  let artRefreshTimer = 0;
  function scheduleArtRefresh() {
    clearTimeout(artRefreshTimer);
    artRefreshTimer = setTimeout(() => {
      validateSelections();
      if (panel && panel.style.display !== "none") renderPanel();
      updateButtonLabel();
    }, 60);
  }

  // An item is available if its art hasn't failed to load. Id 0 ("None") is
  // always available. Art that is still loading counts as available; if it
  // later fails, scheduleArtRefresh() hides it.
  function itemAvailable(it) {
    if (!it) return false;
    if (it.id === 0 || it.id === "0") return true;
    return !!(it.img && !it.img._failed);
  }
  function availableItems(p, key) {
    const cat = (window.dressUpCatalog[p] || {})[key];
    const out = {};
    if (!cat) return out;
    Object.entries(cat.items || {}).forEach(([id, it]) => {
      if (itemAvailable(it)) out[id] = it;
    });
    return out;
  }

  // "top2" -> "Top 2", "top1_2" -> "Top 1", "boxers1_2" -> "Boxers 1"
  function humanize(id) {
    const base = String(id).replace(/_\d+$/, "");
    const m = base.match(/^([a-zA-Z]+?)(\d+)$/);
    if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1) + " " + m[2];
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  // Accept either "top1" or { id, label, prefix, back }.
  function normItem(entry) {
    if (entry === null || entry === undefined) return null;
    if (typeof entry === "string" || typeof entry === "number") {
      const id = String(entry);
      return { id, label: humanize(id), prefix: id, back: null };
    }
    const id = entry.id || entry.prefix;
    if (!id) return null;
    return {
      id: String(id),
      label: entry.label || humanize(id),
      prefix: String(entry.prefix || id),
      // back: true -> "<prefix>_back.png" is drawn BEHIND the body; or give a name.
      back: entry.back ? (typeof entry.back === "string" ? entry.back : `${entry.prefix || id}_back`) : null,
    };
  }

  function emptyCat(def) {
    return {
      label: def.label || def.key,
      z: Number(def.z) || 100,
      behind: !!def.behind,
      items: { 0: { id: 0, label: "None", img: null } },
    };
  }

  // ---- Build the catalog from the config (synchronous) ----------------------
  const cfg = (window.OUTFIT_CONFIG && Array.isArray(window.OUTFIT_CONFIG.categories))
    ? window.OUTFIT_CONFIG
    : FALLBACK_CONFIG;

  const cats = cfg.categories.map(c => ({
    key: c.key, label: c.label || c.key, z: Number(c.z) || 100, behind: !!c.behind,
  }));

  // Every pet shares the same dress-up system. Pet count comes from
  // game_config.js; each pet reads its wardrobe from cfg.pet1 / cfg.pet2 / ...
  // in outfit_config.js (same structure per pet, art suffixed per pet).
  const NUM_PETS = (window.GAME_CONFIG && Array.isArray(window.GAME_CONFIG.pets) && window.GAME_CONFIG.pets.length) || 1;
  const PETS = Array.from({ length: NUM_PETS }, (_, i) => i);
  const wardrobeFor = p => cfg["pet" + (p + 1)] || {};
  const defaultsFor = p => (cfg.defaults && cfg.defaults["pet" + (p + 1)]) || {};

  function buildCatalog() {
    const catalog = {};
    PETS.forEach(p => { catalog[p] = {}; cats.forEach(c => { catalog[p][c.key] = emptyCat(c); }); });
    PETS.forEach(p => {
      const wardrobe = wardrobeFor(p);
      cats.forEach(c => {
        const list = wardrobe[c.key];
        if (!Array.isArray(list)) return;
        list.forEach(entry => {
          const it = normItem(entry);
          if (it) catalog[p][c.key].items[it.id] = { id: it.id, label: it.label, img: img(`${it.prefix}.png`), back: it.back ? img(`${it.back}.png`) : null };
        });
      });
    });
    return catalog;
  }

  const defaults = (() => {
    const out = {};
    PETS.forEach(p => { out[p] = {}; const src = defaultsFor(p); cats.forEach(c => { out[p][c.key] = src[c.key] != null ? src[c.key] : 0; }); });
    return out;
  })();

  window.dressUpCatalog = buildCatalog();
  if (typeof window.activePetIndex !== "number") window.activePetIndex = 0;

  function makeSelected() {
    return PETS.map(p => {
      const o = {};
      cats.forEach(c => o[c.key] = defaults[p][c.key] != null ? defaults[p][c.key] : 0);
      return o;
    });
  }
  function makeColors() {
    return PETS.map(() => {
      const o = {};
      cats.forEach(c => o[c.key] = DEFAULT_COLOR);
      return o;
    });
  }

  window.selectedClothes = window.selectedClothes || makeSelected();
  window.clothingColors = window.clothingColors || makeColors();
  window.currentOutfits = PETS.map(() => 0);
  window.currentOutfit = 0;

  function activePet() {
    const p = window.activePetIndex;
    return PETS.includes(p) ? p : 0;
  }

  // Only show categories this character actually owns clothes for. This is what
  // enforces the boy clothing rules: character 2 (boy) has no top underwear,
  // one-piece, dress, or bunnysuit-bow items, so those tabs never appear.
  // Items whose art is missing don't count either, so a character without a
  // hat PNG simply has no Hat tab — each character's panel matches its art.
  function catKeys(p = activePet()) {
    return cats.map(c => c.key).filter(k =>
      Object.keys(availableItems(p, k)).length > 1 // more than just "None"
    );
  }

  // Clear any worn item that this character doesn't actually have (not in its
  // catalog, or its art failed to load). Keeps each character's outfit
  // consistent with its own wardrobe after switching characters or presets.
  function validateSelections() {
    PETS.forEach(p => {
      const sc = window.selectedClothes && window.selectedClothes[p];
      if (!sc) return;
      const catalog = window.dressUpCatalog[p] || {};
      cats.forEach(c => {
        const id = sc[c.key];
        if (id === 0 || id === "0" || id == null) return;
        const it = catalog[c.key] && catalog[c.key].items && catalog[c.key].items[id];
        if (!itemAvailable(it)) sc[c.key] = 0;
      });
    });
  }

  function normalizeState() {
    const sel = makeSelected();
    const cols = makeColors();
    PETS.forEach(p => {
      window.selectedClothes[p] = window.selectedClothes[p] || {};
      window.clothingColors[p] = window.clothingColors[p] || {};
      cats.forEach(c => {
        if (window.selectedClothes[p][c.key] === undefined) window.selectedClothes[p][c.key] = sel[p][c.key];
        if (window.clothingColors[p][c.key] === undefined) window.clothingColors[p][c.key] = cols[p][c.key];
      });
    });
  }

  // ---- Clothing rules -------------------------------------------------------
  // Set number = the trailing digits of an id ("bottomunderwear3" -> "3").
  function setNumberFromId(id) {
    const m = String(id || "").match(/(\d+)(?:_\d+)?$/);
    return m ? m[1] : null;
  }
  // Find an item in a category whose set number matches n ("3" -> "bottomunderwear3").
  function findItemBySetNumber(p, category, n) {
    if (!n) return 0;
    const items = (window.dressUpCatalog[p] && window.dressUpCatalog[p][category] && window.dressUpCatalog[p][category].items) || {};
    const ids = Object.keys(items).filter(id => id !== "0");
    return ids.find(id => setNumberFromId(id) === String(n)) || 0;
  }
  function applyUnderwearRules(p, category, id) {
    if (id === 0 || id === "0") return;
    const sc = window.selectedClothes[p];

    // A one-piece is a complete set: it replaces the separate top + bottom.
    if (category === "onepieceUnderwear") {
      sc.topUnderwear = 0;
      sc.bottomUnderwear = 0;
      return;
    }

    if (category === "topUnderwear" || category === "bottomUnderwear") {
      // Switching to separates always removes the (exclusive) one-piece.
      const cameFromOnepiece = sc.onepieceUnderwear && sc.onepieceUnderwear !== "0";
      sc.onepieceUnderwear = 0;

      // Coming OFF a one-piece, complete the set by adding the matching
      // counterpart (top1 -> also bottom1). But once you're already wearing
      // separates, leave the other piece alone so you can mix freely
      // (top1 + bottom1 -> top1 + bottom2).
      if (cameFromOnepiece) {
        const other = (category === "topUnderwear") ? "bottomUnderwear" : "topUnderwear";
        const match = findItemBySetNumber(p, other, setNumberFromId(id));
        if (match) sc[other] = match;
      }
    }
  }
  function applyDressRules(p, category, id) {
    if (id === 0 || id === "0") return;
    const sc = window.selectedClothes[p];
    // Full-body garments (dress, bodysuit) replace the separate top + bottom,
    // and replace each other (you can't wear a dress and a bodysuit at once).
    if (category === "dress" || category === "bodysuit") {
      sc.top = 0;
      sc.bottom = 0;
      sc.dress = (category === "dress") ? sc.dress : 0;
      sc.bodysuit = (category === "bodysuit") ? sc.bodysuit : 0;
      return;
    }
    // Putting on a separate top/bottom removes any full-body garment.
    if (category === "top" || category === "bottom") {
      sc.dress = 0;
      sc.bodysuit = 0;
    }
  }
  function applyClothingRules(p, category, id) {
    applyUnderwearRules(p, category, id);
    applyDressRules(p, category, id);
  }

  // ---- Colour tinting -------------------------------------------------------
  const tintCache = new Map();
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
  }
  function tintedImage(source, hex) {
    if (!hex || !source || source._failed || !source.complete || !source.naturalWidth) return source;
    const key = `${source.src}|${hex}`;
    if (tintCache.has(key)) return tintCache.get(key);
    const rgb = hexToRgb(hex);
    if (!rgb) return source;
    const cv = document.createElement("canvas");
    cv.width = source.naturalWidth;
    cv.height = source.naturalHeight;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    try {
      cx.drawImage(source, 0, 0);
      const imageData = cx.getImageData(0, 0, cv.width, cv.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        const shade = Math.max(0.18, Math.min(1.25, lum * 1.35));
        d[i] = Math.min(255, rgb.r * shade);
        d[i + 1] = Math.min(255, rgb.g * shade);
        d[i + 2] = Math.min(255, rgb.b * shade);
      }
      cx.putImageData(imageData, 0, 0);
    } catch (_) {
      return source;
    }
    const out = new Image();
    out.src = cv.toDataURL("image/png");
    tintCache.set(key, out);
    return out;
  }
  function safeDraw(ctx, image, x, y, w, h) {
    if (!image || image._failed || !image.complete || !image.naturalWidth) return false;
    ctx.drawImage(image, x, y, w, h);
    return true;
  }

  // ---- Cloth wind (used by the troll blower) --------------------------------
  // Skirt-like garments (dresses + anything with "skirt" in its id) are a small
  // cloth simulation, not a canned animation.
  //
  // ONLY THE SKIRT MOVES. The picture is split in two once (and cached):
  //   - the skirt: the piece of cloth that hangs from the waist down to the hem
  //     (found in the picture itself - see findSkirt below);
  //   - everything else (bodice, sleeves, arms/hands drawn in the dress, veil,
  //     bows...): drawn exactly as it is, never bent.
  //
  // The skirt is cut into a fine mesh of cells hanging from the waist. Each row
  // is a spring + damper:
  //   - the blower (a mode calls ClothWind.set(pet, 0..1, side)) pushes it into
  //     a blown-up pose: hem thrown up and out like an umbrella;
  //   - gravity/stiffness pull it back, so it lags, overshoots and settles;
  //   - the pet's own movement (walking, dragging, falling) swings and billows it;
  //   - neighbouring rows pull on each other, so the cloth bends smoothly.
  // On top of that the hem flutters: waves run around the hem, the side above
  // the blower lifts first/highest, and folds get soft light and shade, so it
  // reads like real fabric catching air instead of a stretched picture.
  //
  // Tweak: WIND_PRESETS (the blown-up pose: "flow" soft, "lift" umbrella) and
  // WIND_PHYS (how the cloth moves). Per item, windStyle in outfit_config.js
  // can set tune: { flare, lift, speed, wave, ... } to override a preset.
  const WIND_PRESETS = {
    //        flare: hem widening, lift: how high the hem rises, from: where the
    //        flare starts (0 = waist), curve: hem sides curl up more than the
    //        middle, wave: hem flutter, tilt: one side lifts before the other
    flow: { flare: 0.30, lift: 0.17, from: 0,    curve: 0.03, ripple: 0.03,  wave: 0.07, tilt: 0.10 },
    lift: { flare: 0.60, lift: 0.26, from: 0.10, curve: 0.07, ripple: 0.015, wave: 0.10, tilt: 0.14 },
  };
  const WIND_PHYS = {
    omega: 9,          // swing speed (rad/s) of a skirt about refLength long
    refLength: 0.17,   // skirt length, as a fraction of the picture height
    zeta: 0.45,        // damping: lower = bouncier, higher = settles faster
    hemSoft: 0.55,     // how much looser the hem is than the waist
    couple: 0.35,      // how strongly neighbouring rows pull on each other
    gust: 0.14,        // gusts change the blown-up pose by this much
    gustSpeed: 5.5,    // gust speed
    sway: 0.03,        // sideways gust sway (fraction of the width)
    motionSway: 0.06,  // sideways lag when the pet moves
    motionLift: 0.07,  // billow when the pet falls
    dressWaist: 0.40,  // a dress with no region: its top 40% stays still
    rows: 24,          // simulated rows per piece
    meshCols: 48,      // drawn mesh: at most this many columns ...
    meshRows: 48,      // ... and rows across the skirt
    shade: 0.22,       // how dark the folds get (0 = no fold shading)
    cut: 3,            // sleeves/hands touching the skirt by up to ~2x this
                       // many pixels are cut off it (they never move)
  };

  const windSims = new Map();   // one cloth per pet + garment + piece
  const windMotion = {};        // each pet's recent movement
  function resetWindSims() {
    windSims.clear();
    Object.keys(windMotion).forEach(k => delete windMotion[k]);
  }

  window.ClothWind = window.ClothWind || {
    _strength: {},   // blower strength per pet (0..1), set by the mode
    _side: {},       // where the blower is under the pet: -1 left .. 0 middle .. 1 right
    set(p, s, side) {
      this._strength[p] = Math.max(0, Math.min(1, s || 0));
      if (typeof side === "number" && isFinite(side)) this._side[p] = Math.max(-1, Math.min(1, side));
    },
    get(p) { return this._strength[p] || 0; },
    side(p) { return this._side[p] || 0; },
    reset() { this._strength = {}; this._side = {}; resetWindSims(); },
  };

  // Wind settings for an item from OUTFIT_CONFIG.windStyle[id]: a style name
  // ("flow" | "lift") or { style, region, backRegion, backWind, keep, backKeep, tune }.
  const windCfgCache = new Map();
  function windConfigOf(id) {
    const m = (window.OUTFIT_CONFIG && window.OUTFIT_CONFIG.windStyle) || {};
    const c = m[id] !== undefined ? m[id] : m.default;
    const hit = windCfgCache.get(id);
    if (hit && hit.src === c) return hit.out;
    const o = (c && typeof c === "object") ? c : { style: c };
    const style = WIND_PRESETS[o.style] ? o.style : "flow";
    const out = {
      style,
      preset: Object.assign({}, WIND_PRESETS[style], o.tune || {}),
      region: o.region || null,
      backRegion: o.backRegion || null,
      backWind: o.backWind,
      keep: Array.isArray(o.keep) ? o.keep : null,
      backKeep: Array.isArray(o.backKeep) ? o.backKeep : (Array.isArray(o.keep) ? o.keep : null),
    };
    windCfgCache.set(id, { src: c, out });
    return out;
  }

  function isSkirtLike(key, id) {
    return key === "dress" || /skirt/i.test(String(id));
  }

  // ---- Reading the picture: where the cloth actually is ---------------------
  function alphaOf(image) {
    if (image._alpha !== undefined) return image._alpha;
    let a = null;
    try {
      const w = image.naturalWidth, h = image.naturalHeight;
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const cx = cv.getContext("2d", { willReadFrequently: true });
      cx.drawImage(image, 0, 0);
      const d = cx.getImageData(0, 0, w, h).data;
      a = new Uint8Array(w * h);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    } catch (_) { a = null; }
    image._alpha = a;
    return a;
  }

  // The rows/columns a garment covers (cached on the image).
  function opaqueBounds(image) {
    if (image._bounds !== undefined) return image._bounds;
    let b = null;
    const a = alphaOf(image);
    if (a) {
      const w = image.naturalWidth, h = image.naturalHeight;
      let top = h, bottom = -1, left = w, right = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (a[y * w + x] > 16) {
            if (y < top) top = y;
            if (y > bottom) bottom = y;
            if (x < left) left = x;
            if (x > right) right = x;
          }
        }
      }
      if (bottom >= 0) b = { top, bottom: bottom + 1, left, right: right + 1 };
    }
    image._bounds = b;
    return b;
  }

  // Shrink (erode) or grow a 0/1 mask by r pixels (square, done in two passes).
  function morph(m, w, h, r, erode) {
    const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let v = erode ? 1 : 0;
        for (let k = -r; k <= r; k++) {
          const xx = x + k;
          const mv = (xx < 0 || xx >= w) ? 0 : m[row + xx];
          if (erode ? !mv : mv) { v = erode ? 0 : 1; break; }
        }
        t[row + x] = v;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = erode ? 1 : 0;
        for (let k = -r; k <= r; k++) {
          const yy = y + k;
          const mv = (yy < 0 || yy >= h) ? 0 : t[yy * w + x];
          if (erode ? !mv : mv) { v = erode ? 0 : 1; break; }
        }
        o[y * w + x] = v;
      }
    }
    return o;
  }

  // The run of cloth the skirt hangs to: in the lowest rows of the band, the
  // run closest to the middle (a wide run wins a near tie).
  function findSeed(m, w, h) {
    const mid = (w - 1) / 2;
    let best = null, bestScore = Infinity;
    const stop = Math.max(0, h - Math.ceil(h * 0.3));
    for (let y = h - 1; y >= stop; y--) {
      let x = 0;
      while (x < w) {
        if (!m[y * w + x]) { x++; continue; }
        const l = x;
        while (x < w && m[y * w + x]) x++;
        const r = x;
        const dist = (l <= mid && mid < r) ? 0 : Math.min(Math.abs(l - mid), Math.abs(r - 1 - mid));
        const score = dist - (r - l) * 0.25 + (h - 1 - y) * 0.05;
        if (score < bestScore) { bestScore = score; best = { y, l, r }; }
      }
    }
    return best;
  }

  // ---- Finding the skirt ------------------------------------------------------
  // Inside the moving band (waist..hem, or the configured region) the skirt is
  // the blob of cloth that reaches the hem near the middle. Sleeves, hands and
  // veil bits are separate blobs, or touch the skirt only with a thin edge: the
  // cloth is first shrunk a few pixels (cutting those thin joins), filled from
  // the hem, then grown back - so only the skirt itself is picked up. "keep"
  // boxes (fractions of the picture) are never part of the skirt.
  //
  // Result (cached per picture): the skirt alone (moving) and the picture with
  // the skirt removed (still), plus each skirt row's centre/half-width/extent.
  function skirtLayers(image, g, keep) {
    const cache = image._skirt || (image._skirt = {});
    const key = `${g.b.left}|${g.b.right}|${g.startY}|${g.b.bottom}|${keep ? JSON.stringify(keep) : ""}`;
    if (cache[key] !== undefined) return cache[key];
    let out = null;
    try { out = buildSkirtLayers(image, g, keep); } catch (_) { out = null; }
    cache[key] = out;
    return out;
  }

  function buildSkirtLayers(image, g, keep) {
    const a = alphaOf(image);
    if (!a) return null;
    const { nw, nh } = g;
    const x0 = Math.max(0, Math.floor(g.b.left)), x1 = Math.min(nw, Math.ceil(g.b.right));
    const y0 = Math.max(0, Math.floor(g.startY)), y1 = Math.min(nh, Math.ceil(g.b.bottom));
    const bw = x1 - x0, bh = y1 - y0;
    if (bw < 4 || bh < 4) return null;

    // Cloth inside the band (solid = clearly opaque, any = even faint edges).
    const solid = new Uint8Array(bw * bh), any = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const v = a[(y0 + y) * nw + x0 + x];
        solid[y * bw + x] = v > 16 ? 1 : 0;
        any[y * bw + x] = v > 0 ? 1 : 0;
      }
    }
    if (keep) {
      keep.forEach(k => {
        const kx0 = Math.max(0, Math.floor(k.left * nw) - x0), kx1 = Math.min(bw, Math.ceil(k.right * nw) - x0);
        const ky0 = Math.max(0, Math.floor(k.top * nh) - y0), ky1 = Math.min(bh, Math.ceil(k.bottom * nh) - y0);
        for (let y = ky0; y < ky1; y++) for (let x = kx0; x < kx1; x++) { solid[y * bw + x] = 0; any[y * bw + x] = 0; }
      });
    }

    // Shrink, find the hem, fill the skirt from it.
    const R = WIND_PHYS.cut;
    let base = morph(solid, bw, bh, R, true);
    let seed = findSeed(base, bw, bh);
    if (!seed) { base = solid; seed = findSeed(base, bw, bh); }   // very thin skirt: no shrinking
    if (!seed) return null;
    const comp = new Uint8Array(bw * bh);
    const stack = new Int32Array(bw * bh);
    let sp = 0;
    for (let x = seed.l; x < seed.r; x++) { const i = seed.y * bw + x; comp[i] = 1; stack[sp++] = i; }
    while (sp) {
      const i = stack[--sp], x = i % bw;
      if (x > 0 && base[i - 1] && !comp[i - 1]) { comp[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < bw - 1 && base[i + 1] && !comp[i + 1]) { comp[i + 1] = 1; stack[sp++] = i + 1; }
      if (i >= bw && base[i - bw] && !comp[i - bw]) { comp[i - bw] = 1; stack[sp++] = i - bw; }
      if (i < bw * (bh - 1) && base[i + bw] && !comp[i + bw]) { comp[i + bw] = 1; stack[sp++] = i + bw; }
    }
    // Grow back to the real edge (plus its soft anti-aliased rim and sharp
    // hem corners), but never into the other blobs (sleeves, hands...).
    let mask = comp;
    if (base !== solid) {
      const others = new Uint8Array(bw * bh);
      for (let i = 0; i < others.length; i++) others[i] = base[i] && !comp[i] ? 1 : 0;
      const blocked = morph(others, bw, bh, R + 1, false);
      mask = morph(comp, bw, bh, R + 1, false);
      for (let i = 0; i < mask.length; i++) if (!any[i] || (blocked[i] && !comp[i])) mask[i] = 0;
      for (let it = 0; it < R * 3; it++) {           // creep into thin tips the shrink lost
        let grew = false;
        for (let i = 0; i < mask.length; i++) {
          if (mask[i] || !any[i] || blocked[i]) continue;
          const x = i % bw;
          if ((x > 0 && mask[i - 1]) || (x < bw - 1 && mask[i + 1]) ||
              (i >= bw && mask[i - bw]) || (i < bw * (bh - 1) && mask[i + bw])) { mask[i] = 2; grew = true; }
        }
        for (let i = 0; i < mask.length; i++) if (mask[i] === 2) mask[i] = 1;
        if (!grew) break;
      }
    } else {
      for (let i = 0; i < mask.length; i++) if (!any[i]) mask[i] = 0;
    }

    // Split the picture: the skirt alone, and everything else.
    const full = document.createElement("canvas");
    full.width = nw; full.height = nh;
    const fx = full.getContext("2d", { willReadFrequently: true });
    fx.drawImage(image, 0, 0);
    const all = fx.getImageData(0, 0, nw, nh);
    const d = all.data;
    const mov = document.createElement("canvas");
    mov.width = bw; mov.height = bh;
    const mx = mov.getContext("2d");
    const md = mx.createImageData(bw, bh);
    const left = new Float32Array(bh).fill(-1), right = new Float32Array(bh).fill(-1);
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        if (!mask[y * bw + x]) continue;
        const si = ((y0 + y) * nw + x0 + x) * 4, di = (y * bw + x) * 4;
        md.data[di] = d[si]; md.data[di + 1] = d[si + 1]; md.data[di + 2] = d[si + 2]; md.data[di + 3] = d[si + 3];
        d[si + 3] = 0;
        if (left[y] < 0) left[y] = x;
        right[y] = x + 1;
      }
    }
    mx.putImageData(md, 0, 0);
    fx.putImageData(all, 0, 0);

    // Each row's centre and half-width (smoothed), so the cloth bends around
    // its own middle. Empty rows borrow from their neighbours.
    let last = -1;
    for (let y = 0; y < bh; y++) {
      if (left[y] >= 0) last = y;
      else if (last >= 0) { left[y] = left[last]; right[y] = right[last]; }
    }
    last = -1;
    for (let y = bh - 1; y >= 0; y--) {
      if (left[y] >= 0) last = y;
      else if (last >= 0) { left[y] = left[last]; right[y] = right[last]; }
    }
    if (last < 0) return null;
    const cen = new Float32Array(bh), hw = new Float32Array(bh);
    const S = 5;
    for (let y = 0; y < bh; y++) {
      let sc = 0, sh = 0, c = 0;
      for (let j = Math.max(0, y - S); j <= Math.min(bh - 1, y + S); j++) {
        sc += (left[j] + right[j]) / 2; sh += (right[j] - left[j]) / 2; c++;
      }
      cen[y] = x0 + sc / c; hw[y] = Math.max(1, sh / c);
    }
    return { x0, y0, bw, bh, moving: mov, still: full, cen, hw, left, right };
  }

  // ---- The cloth simulation -------------------------------------------------
  const smooth01 = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  function lerpArr(a, f) {
    const p = f * a.length - 0.5;
    if (p <= 0) return a[0];
    const i = Math.floor(p);
    if (i >= a.length - 1) return a[a.length - 1];
    const t = p - i;
    return a[i] * (1 - t) + a[i + 1] * t;
  }

  function newSim(key) {
    const n = WIND_PHYS.rows, F = () => new Float32Array(n);
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    return {
      n, fl: F(), fv: F(), up: F(), uv: F(), sw: F(), sv: F(), t: 0, rest: true,
      side: 0, phase: (Math.abs(h) % 628) / 100, cv: null,
    };
  }

  // How the pet is moving right now, in pet-widths per second. Computed once
  // per frame per pet (the behind pass and the front pass share it).
  function petMotion(p, x, y, w, now) {
    let m = windMotion[p];
    if (!m) { m = windMotion[p] = { x, y, t: now, vx: 0, fall: 0 }; return m; }
    const dt = (now - m.t) / 1000;
    if (dt > 0.004) {
      if (dt < 0.25 && w > 0) {
        const a = 1 - Math.exp(-dt * 12);
        m.vx += (clampN((x - m.x) / dt / w, -3, 3) - m.vx) * a;
        m.fall += (clampN((y - m.y) / dt / w, 0, 3) - m.fall) * a;
      } else { m.vx = 0; m.fall = 0; }
      m.x = x; m.y = y; m.t = now;
    }
    return m;
  }

  function stepWind(sim, now, target, quiet, pr, omega, mo, side) {
    let dt = sim.t ? (now - sim.t) / 1000 : 0;
    sim.t = now;
    if (dt <= 0) return;
    dt = Math.min(dt, 0.05);
    sim.side += (side - sim.side) * (1 - Math.exp(-dt * 4));   // the blower side, eased
    const steps = Math.max(1, Math.ceil(dt / (1 / 90))), h = dt / steps;
    const n = sim.n, w2 = omega * omega, c = 2 * WIND_PHYS.zeta * omega;
    const P = WIND_PHYS, gs = P.gustSpeed;
    const { fl, fv, up, uv, sw, sv } = sim;
    for (let st = 0; st < steps; st++) {
      const tt = now / 1000 - dt + (st + 1) * h;
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        const e = pr.from > 0 ? smooth01((f - pr.from) / (1 - pr.from)) : Math.pow(f, 1.3);
        const gust = 1 + P.gust * (0.6 * Math.sin(tt * gs - f * 4) + 0.4 * Math.sin(tt * gs * 1.7 + f * 2 + 1.3));
        const flEq = target * pr.flare * e * gust + mo.fall * 0.3 * e;
        const upEq = target * pr.lift * f * f * gust + mo.fall * P.motionLift * f * f;
        // Air from an off-centre blower also pushes the cloth away from it a little.
        const swEq = target * (P.sway * f * Math.sin(tt * gs * 0.8 - f * 3.2) - 0.02 * sim.side * f) - mo.vx * P.motionSway * f;
        const k = w2 * (1 - P.hemSoft * f);
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        const kc = P.couple * w2;
        fv[i] += (-k * (fl[i] - flEq) - c * fv[i] + kc * ((fl[a] + fl[b]) / 2 - fl[i])) * h;
        uv[i] += (-k * (up[i] - upEq) - c * uv[i] + kc * ((up[a] + up[b]) / 2 - up[i])) * h;
        sv[i] += (-k * (sw[i] - swEq) - c * sv[i] + kc * ((sw[a] + sw[b]) / 2 - sw[i])) * h;
      }
      for (let i = 0; i < n; i++) {
        fl[i] = clampN(fl[i] + fv[i] * h, -0.3, 2.4);
        up[i] = clampN(up[i] + uv[i] * h, -0.12, 0.44);
        sw[i] = clampN(sw[i] + sv[i] * h, -0.2, 0.2);
      }
    }
    let energy = 0;
    for (let i = 0; i < n; i++) {
      energy = Math.max(energy, Math.abs(fl[i]), Math.abs(up[i]), Math.abs(sw[i]) * 3,
        Math.abs(fv[i]) * 0.1, Math.abs(uv[i]) * 0.1);
    }
    sim.rest = !target && quiet && energy < 0.004;
    if (sim.rest) { fl.fill(0); fv.fill(0); up.fill(0); uv.fill(0); sw.fill(0); sv.fill(0); }
  }

  // Where the moving band of a garment is (source pixels). With a region
  // ({left,right,top,bottom} as 0..1 fractions of the image) only the skirt
  // inside that box moves. Without one, the skirt is looked for in the whole
  // covered area (a dress skips its top dressWaist part). The top edge is
  // where the cloth is pinned.
  function windGeometry(image, dressLike, region) {
    const nw = image.naturalWidth, nh = image.naturalHeight;
    let b, startY;
    if (region) {
      b = { left: region.left * nw, right: region.right * nw, top: region.top * nh, bottom: region.bottom * nh };
      startY = b.top;
    } else {
      b = opaqueBounds(image);
      if (!b) return null;
      startY = b.top + (b.bottom - b.top) * (dressLike ? WIND_PHYS.dressWaist : 0);
    }
    const len = b.bottom - startY;
    if (len < 4) return null;
    return { nw, nh, b, startY, len };
  }

  // Ready-made fold shades (dark for folds turning away, light for ones facing us).
  const SHADES = [];
  for (let i = 1; i <= 8; i++) {
    SHADES.push(`rgba(30,20,40,${(i / 8).toFixed(3)})`);
  }
  const LIGHTS = [];
  for (let i = 1; i <= 8; i++) {
    LIGHTS.push(`rgba(255,255,255,${(i / 8 * 0.55).toFixed(3)})`);
  }

  // Draw a skirt-like garment through its cloth simulation. Returns false when
  // the cloth is at rest (the caller then draws the picture normally).
  function drawWindy(ctx, image, x, y, w, h, o) {
    const g = windGeometry(image, o.dressLike, o.region);
    if (!g) return false;
    const { nw, nh, startY, len } = g;
    const pr = o.cfg;
    const now = performance.now();
    const mo = petMotion(o.p, x, y, w, now);
    const quiet = Math.abs(mo.vx) < 0.02 && mo.fall < 0.02;
    let sim = windSims.get(o.key);
    if (!sim) {
      if (!o.target && quiet) return false;
      sim = newSim(o.key);
      windSims.set(o.key, sim);
    }
    if (!o.target && quiet && sim.rest) return false;
    const omega = clampN(WIND_PHYS.omega * Math.sqrt(WIND_PHYS.refLength / (len / nh)), 4, 14) * (pr.speed || 1);
    stepWind(sim, now, o.target, quiet, pr, omega, mo, o.side || 0);
    if (sim.rest) return false;
    const L = skirtLayers(image, g, o.keep);
    if (!L) return false;

    const kx = w / nw, ky = h / nh;
    const n = sim.n;
    const blown = clampN(sim.up[n - 1] / Math.max(pr.lift * 0.9, 0.05), 0, 1);

    // 1) Everything that is not the skirt, exactly as drawn.
    const hd = o.region && o.region.hide;
    if (hd) {
      // A "hide" area (e.g. an underskirt that lifts away with the skirt) fades out as the skirt rises.
      const hx = x + hd.left * w, hy = y + hd.top * h, hw2 = (hd.right - hd.left) * w, hh = (hd.bottom - hd.top) * h;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.rect(hx, hy, hw2, hh);
      ctx.clip("evenodd");
      ctx.drawImage(L.still, x, y, w, h);
      ctx.restore();
      if (blown < 1) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(hx, hy, hw2, hh);
        ctx.clip();
        ctx.globalAlpha *= Math.max(0, 1 - blown * 1.6);
        ctx.drawImage(L.still, x, y, w, h);
        ctx.restore();
      }
    } else {
      ctx.drawImage(L.still, x, y, w, h);
    }

    // 2) The skirt, bent through a mesh into its own small canvas (in picture
    //    pixels, at about screen resolution), shaded, then drawn on top.
    const { x0, y0, bw, bh, cen, hw, left: rowL, right: rowR } = L;
    const padX = Math.ceil(bw * 1.5 + 8), padTop = Math.ceil(len * 0.9 + 8), padBot = 8;
    const ox = x0 - padX, oy = y0 - padTop;
    const cw = bw + padX * 2, chh = bh + padTop + padBot;
    let devScale = 1;
    try { const t = ctx.getTransform(); devScale = Math.hypot(t.a, t.b) || 1; } catch (_) {}
    const s = clampN(devScale * kx * 1.1, 0.2, 1);
    const CW = Math.max(1, Math.ceil(cw * s)), CH = Math.max(1, Math.ceil(chh * s));
    let cv = sim.cv;
    if (!cv) cv = sim.cv = document.createElement("canvas");
    if (cv.width !== CW || cv.height !== CH) { cv.width = CW; cv.height = CH; }
    const cx = cv.getContext("2d");
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.globalCompositeOperation = "source-over";
    cx.clearRect(0, 0, CW, CH);

    const tt = now / 1000, ph = sim.phase;
    const cols = clampN(Math.round(bw / 4), 6, WIND_PHYS.meshCols);
    const rowsN = clampN(Math.round(bh / 4), 6, WIND_PHYS.meshRows);
    const cellW = bw / cols, cellH = bh / rowsN;
    const flareMax = Math.max(pr.flare, 0.01);
    const wave = pr.wave || 0, curve = pr.curve || 0;
    // One side lifts first: the side above the blower, plus a slow wobble.
    const tilt = (pr.tilt || 0) * clampN(sim.side * 0.9 + 0.35 * Math.sin(tt * 1.7 + ph), -1.2, 1.2);

    // Where a point of the skirt goes. sx = picture x, v = 0 waist .. 1 hem.
    // Also returns the fold slope there (for shading).
    let outX = 0, outY = 0, outSlope = 0;
    function place(sx, sy) {
      const v = clampN((sy - startY) / len, 0, 1);
      const ri = clampN(Math.round(sy - y0), 0, bh - 1);
      const c0 = cen[ri], hw0 = hw[ri];
      const u = clampN((sx - c0) / hw0, -1.4, 1.4);
      const fl = lerpArr(sim.fl, v), up = lerpArr(sim.up, v), sw = lerpArr(sim.sw, v);
      const ef = clampN(fl / flareMax, 0, 1.2);
      const hem = ef * Math.pow(v, 1.5);
      // Waves running round the hem (three of them, so it never looks looped).
      const a1 = u * 2.6 - tt * 7.1 + ph, a2 = u * 5.3 + tt * 11.3 + ph * 1.7, a3 = u * 9.1 - tt * 17 + ph * 2.3;
      const wv = 0.55 * Math.sin(a1) + 0.30 * Math.sin(a2) + 0.15 * Math.sin(a3);
      const slope = 0.55 * 2.6 * Math.cos(a1) + 0.30 * 5.3 * Math.cos(a2) + 0.15 * 9.1 * Math.cos(a3);
      const breathe = 1 + fl + (pr.ripple || 0) * ef * Math.sin(v * 16 - now * 0.013);
      outX = c0 + (sx - c0) * Math.max(0.2, breathe) + sw * nw +
        wave * len * 0.25 * hem * Math.cos(u * 3.1 - tt * 8.3 + ph);
      outY = startY + len * (v - up) - len * hem * (curve * u * u + wave * wv + tilt * u);
      outSlope = hem * wave * slope;
    }

    // Mesh corners, two rows at a time (top edge of the current row, bottom edge).
    const E = cols + 1;
    let topX = new Float32Array(E), topY = new Float32Array(E), topS = new Float32Array(E);
    let botX = new Float32Array(E), botY = new Float32Array(E), botS = new Float32Array(E);
    const lowY = startY - len * 0.75;
    for (let c = 0; c < E; c++) {
      place(x0 + c * cellW, y0);
      topX[c] = outX; topY[c] = Math.max(outY, lowY); topS[c] = outSlope;
    }
    const minH = cellH * 0.22;   // the cloth folds up, it never turns inside out
    const shadeK = WIND_PHYS.shade;
    for (let r = 0; r < rowsN; r++) {
      const sy0 = y0 + r * cellH, sy1 = sy0 + cellH;
      for (let c = 0; c < E; c++) {
        place(x0 + c * cellW, sy1);
        botX[c] = outX; botY[c] = Math.max(Math.max(outY, lowY), topY[c] + minH); botS[c] = outSlope;
      }
      // Only the cells that hold cloth in this row.
      const ri = clampN(Math.floor(sy0 + cellH / 2 - y0), 0, bh - 1);
      if (rowL[ri] >= 0) {
        const c0 = clampN(Math.floor(rowL[ri] / cellW) - 1, 0, cols - 1);
        const c1 = clampN(Math.ceil(rowR[ri] / cellW) + 1, 1, cols);
        for (let c = c0; c < c1; c++) {
          const dx0 = ((topX[c] + botX[c]) / 2 - ox) * s;
          const dx1 = ((topX[c + 1] + botX[c + 1]) / 2 - ox) * s;
          const dy0 = ((topY[c] + topY[c + 1]) / 2 - oy) * s;
          const dy1 = ((botY[c] + botY[c + 1]) / 2 - oy) * s;
          const lx = Math.min(dx0, dx1), dw = Math.abs(dx1 - dx0) + 1.2, dh = dy1 - dy0 + 1;
          cx.drawImage(L.moving, c * cellW, r * cellH, cellW, cellH, lx, dy0, dw, dh);
        }
        // Fold light and shade, only where the cloth is waving.
        if (shadeK > 0) {
          cx.globalCompositeOperation = "source-atop";
          for (let c = c0; c < c1; c++) {
            const dx0 = ((topX[c] + botX[c]) / 2 - ox) * s;
            const dx1 = ((topX[c + 1] + botX[c + 1]) / 2 - ox) * s;
            const dy0 = ((topY[c] + topY[c + 1]) / 2 - oy) * s;
            const dy1 = ((botY[c] + botY[c + 1]) / 2 - oy) * s;
            // Folds turning away are darker; cloth bunched up (rows pushed
            // together as the hem rises) shows its shadowed inside.
            const bunch = Math.max(0, 0.85 - (dy1 - dy0) / (cellH * s)) * 1.6;
            const sl = (topS[c] + topS[c + 1] + botS[c] + botS[c + 1]) / 4 + bunch * 0.3;
            const lvl = Math.min(8, Math.round(Math.abs(sl) * 20));
            if (lvl < 1) continue;
            cx.globalAlpha = shadeK;
            cx.fillStyle = sl > 0 ? SHADES[lvl - 1] : LIGHTS[lvl - 1];
            cx.fillRect(Math.min(dx0, dx1), dy0, Math.abs(dx1 - dx0) + 0.8, dy1 - dy0 + 0.8);
          }
          cx.globalAlpha = 1;
          cx.globalCompositeOperation = "source-over";
        }
      }
      let t = topX; topX = botX; botX = t;
      t = topY; topY = botY; botY = t;
      t = topS; topS = botS; botS = t;
    }
    ctx.drawImage(cv, 0, 0, CW, CH, x + ox * kx, y + oy * ky, (CW / s) * kx, (CH / s) * ky);
    return true;
  }

  // ---- UI: button + panel ---------------------------------------------------
  let selectedCategory = catKeys()[0] || (cats[0] && cats[0].key) || "top";

  const btnCss = "border:0;border-radius:9px;padding:7px 10px;margin:3px;background:rgba(0,0,0,.08);cursor:pointer;font-size:13px;white-space:nowrap;";
  function btn(text) {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.cssText = btnCss;
    return b;
  }

  let dressBtn = document.getElementById("dressup-btn");
  if (!dressBtn) {
    dressBtn = document.createElement("button");
    dressBtn.id = "dressup-btn";
    dressBtn.style.cssText = "position:fixed;right:10px;bottom:calc(65px + env(safe-area-inset-bottom));z-index:9998;padding:6px 12px;font-size:clamp(11px,2.5vw,14px);cursor:pointer;border-radius:8px;border:none;background:rgba(255,255,255,.92);box-shadow:0 2px 8px rgba(0,0,0,.15);white-space:nowrap;";
    document.body.appendChild(dressBtn);
  }
  window.clothesBtn = dressBtn;

  let panel = document.getElementById("dressup-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "dressup-panel";
    panel.style.cssText = "position:fixed;right:10px;bottom:calc(108px + env(safe-area-inset-bottom));width:min(360px,calc(100vw - 20px));max-height:54vh;overflow:auto;display:none;z-index:9999;padding:10px;border-radius:12px;background:rgba(255,255,255,.97);box-shadow:0 6px 24px rgba(0,0,0,.22);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
    document.body.appendChild(panel);
  }

  function updateButtonLabel() {
    const p = activePet();
    // Count only items this character actually has — a selection whose art is
    // missing (e.g. a hat this character has no PNG for) doesn't count.
    const count = catKeys(p).filter(k => {
      const id = window.selectedClothes[p] && window.selectedClothes[p][k];
      if (id === 0 || id === "0" || id == null) return false;
      return itemAvailable(availableItems(p, k)[id]);
    }).length;
    dressBtn.textContent = `👗 Dress Up (${count} item${count === 1 ? "" : "s"})`;
  }

  // A clothing item shown as an image thumbnail (falls back to text/emoji).
  function itemThumb(it, active, onClick) {
    const b = document.createElement("button");
    b.title = it.label || String(it.id);
    b.style.cssText =
      "display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;" +
      "width:66px;height:78px;padding:5px;cursor:pointer;border-radius:10px;" +
      `border:2px solid ${active ? "#f59e0b" : "rgba(0,0,0,.12)"};` +
      `background:${active ? "#fff7e6" : "#fff"};`;

    const isNone = it.id === 0 || it.id === "0";
    if (isNone) {
      const icon = document.createElement("div");
      icon.textContent = "🚫";
      icon.style.cssText = "flex:1;display:flex;align-items:center;font-size:24px;opacity:.7;";
      b.appendChild(icon);
    } else if (it.img && !it.img._failed) {
      const im = document.createElement("img");
      im.src = it.img.src;
      im.alt = it.label || "";
      im.draggable = false;
      im.style.cssText = "flex:1;width:48px;height:48px;object-fit:contain;";
      im.onerror = () => { im.replaceWith(emojiFallback()); };
      b.appendChild(im);
    } else {
      b.appendChild(emojiFallback());
    }

    const lab = document.createElement("div");
    lab.textContent = it.label || String(it.id);
    lab.style.cssText = "font-size:10px;line-height:1.1;text-align:center;max-width:62px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    b.appendChild(lab);

    b.onclick = onClick;
    return b;

    function emojiFallback() {
      const d = document.createElement("div");
      d.textContent = "👕";
      d.style.cssText = "flex:1;display:flex;align-items:center;font-size:24px;opacity:.55;";
      return d;
    }
  }

  function renderPanel() {
    const p = activePet();
    const catalog = window.dressUpCatalog[p] || window.dressUpCatalog[0] || {};
    const keys = catKeys(p);
    if (!keys.includes(selectedCategory)) selectedCategory = keys[0] || (cats[0] && cats[0].key);
    panel.innerHTML = "";

    // Title + close
    const title = document.createElement("div");
    title.style.cssText = "font-weight:700;margin-bottom:8px;display:flex;justify-content:space-between;gap:8px;align-items:center;";
    title.innerHTML = `<span>Dress Up</span>`;
    const close = btn("✕");
    close.style.padding = "4px 8px";
    close.onclick = () => { panel.style.display = "none"; };
    title.appendChild(close);
    panel.appendChild(title);

    // Which character to dress (both share the same wardrobe system)
    const petRow = document.createElement("div");
    petRow.style.cssText = "display:flex;gap:6px;margin-bottom:8px;";
    PETS.forEach(pi => {
      const b = btn(`🐾 Character ${pi + 1}`);
      if (pi === p) b.style.cssText += "background:#fff7e6;border:2px solid #f59e0b;font-weight:700;";
      b.onclick = () => { if (typeof window.setActivePet === "function") window.setActivePet(pi); };
      petRow.appendChild(b);
    });
    panel.appendChild(petRow);

    // Category tabs
    const row = document.createElement("div");
    row.style.cssText = "display:flex;overflow-x:auto;padding-bottom:4px;margin-bottom:8px;";
    keys.forEach(k => {
      const b = btn(catalog[k].label || k);
      if (k === selectedCategory) b.style.cssText += "background:rgba(0,0,0,.22);font-weight:700;";
      b.onclick = () => { selectedCategory = k; renderPanel(); };
      row.appendChild(b);
    });
    panel.appendChild(row);

    const cat = catalog[selectedCategory];
    if (!cat) return;

    // Items as thumbnails
    const itemTitle = document.createElement("div");
    itemTitle.textContent = "Item";
    itemTitle.style.cssText = "font-weight:600;margin:4px 0;";
    panel.appendChild(itemTitle);

    const items = document.createElement("div");
    items.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;";
    // Only offer items this character has art for.
    Object.entries(availableItems(p, selectedCategory)).forEach(([id, it]) => {
      const active = String(window.selectedClothes[p] && window.selectedClothes[p][selectedCategory]) === String(id);
      const b = itemThumb(it, active, () => {
        window.selectedClothes[p][selectedCategory] = id === "0" ? 0 : id;
        applyClothingRules(p, selectedCategory, window.selectedClothes[p][selectedCategory]);
        renderPanel();
        updateButtonLabel();
      });
      items.appendChild(b);
    });
    panel.appendChild(items);

    // Colours
    const colorTitle = document.createElement("div");
    colorTitle.textContent = "Color";
    colorTitle.style.cssText = "font-weight:600;margin:8px 0 4px;";
    panel.appendChild(colorTitle);

    const colorRow = document.createElement("div");
    colorRow.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;";
    Object.entries(COLORS).forEach(([name, hex]) => {
      const active = ((window.clothingColors[p] && window.clothingColors[p][selectedCategory]) || DEFAULT_COLOR) === name;
      const b = btn(name === DEFAULT_COLOR ? DEFAULT_COLOR : "");
      b.title = name;
      b.style.cssText += `min-width:${name === DEFAULT_COLOR ? "72px" : "30px"};height:30px;border:${active ? "2px solid #111" : "1px solid rgba(0,0,0,.2)"};background:${hex || "linear-gradient(45deg,#fff,#ddd)"};`;
      b.onclick = () => { window.clothingColors[p][selectedCategory] = name; renderPanel(); };
      colorRow.appendChild(b);
    });
    panel.appendChild(colorRow);

    const note = document.createElement("div");
    note.textContent = "Tip: add new clothes in outfit_config.js — drop the image in images/ and add its name to the list.";
    note.style.cssText = "font-size:11px;opacity:.6;margin-top:8px;";
    panel.appendChild(note);
    updateButtonLabel();
  }

  dressBtn.onclick = () => {
    if (window._modeName === "shower") return;
    panel.style.display = panel.style.display === "none" ? "block" : "none";
    renderPanel();
  };

  // ---- Public draw + lifecycle API (used by every mode) ---------------------
  // Lets other systems (e.g. outfit_presets.js) refresh the Dress Up panel and
  // button after they change window.selectedClothes / window.clothingColors.
  window.refreshDressUpUI = function () {
    normalizeState();
    validateSelections();
    renderPanel();
    updateButtonLabel();
  };

  // Draw one clothing image: colour tint, then the wind effect when it is a
  // skirt-like garment (only its skirt part moves). isBack = this is a
  // behind-the-body piece (it uses backRegion / backKeep / backWind from the
  // windStyle config instead of region / keep).
  function drawCloth(ctx, p, k, id, image, x, y, w, h, isBack) {
    if (!image || image._failed) return false;
    const hex = COLORS[(window.clothingColors[p] && window.clothingColors[p][k]) || DEFAULT_COLOR] || null;
    const drawImg = hex ? tintedImage(image, hex) : image;
    // A back piece stays still unless the config says where its skirt is
    // (backRegion) or asks for the whole piece to move (backWind: true).
    const wc = windConfigOf(id);
    const moves = !isBack || !!wc.backRegion || wc.backWind === true;
    if (moves && isSkirtLike(k, id) && drawImg.complete && drawImg.naturalWidth && !drawImg._failed) {
      const target = window.ClothWind ? window.ClothWind.get(p) : 0;
      if (drawWindy(ctx, drawImg, x, y, w, h, {
        key: `${p}|${k}|${id}|${isBack ? "b" : "f"}`,
        p, dressLike: k === "dress", cfg: wc.preset,
        region: isBack ? wc.backRegion : wc.region,
        keep: isBack ? wc.backKeep : wc.keep,
        target, side: window.ClothWind ? window.ClothWind.side(p) : 0,
      })) return true;
    }
    return safeDraw(ctx, drawImg, x, y, w, h);
  }

  // Two passes per pet: the BEHIND pass (call before drawing the body) draws
  // back pieces - an item's "<name>_back.png" and whole categories marked
  // behind:true; the normal pass (call after the body) draws everything else.
  function drawLayers(ctx, x, y, w, h, petIndex, behind) {
    if (window._modeName === "shower") return false;
    const p = typeof petIndex === "number" ? petIndex : activePet();
    const catalog = window.dressUpCatalog[p] || window.dressUpCatalog[0] || {};
    let drew = false;
    catKeys(p).slice().sort((a, b) => (catalog[a].z || 0) - (catalog[b].z || 0)).forEach(k => {
      const id = (window.selectedClothes[p] && window.selectedClothes[p][k]) ?? 0;
      if (id === 0 || id === "0") return;
      const it = catalog[k] && catalog[k].items && catalog[k].items[id];
      if (!it || !it.img || it.img._failed) return;
      const catBehind = !!catalog[k].behind;
      if (behind) {
        const piece = catBehind ? it.img : it.back;
        if (piece && drawCloth(ctx, p, k, id, piece, x, y, w, h, true)) drew = true;
      } else if (!catBehind) {
        if (drawCloth(ctx, p, k, id, it.img, x, y, w, h, false)) drew = true;
      }
    });
    return drew;
  }

  window.drawOutfitOverlay = function (ctx, state, x, y, w, h, petIndex) {
    return drawLayers(ctx, x, y, w, h, petIndex, false);
  };

  // Call this BEFORE drawing the pet's body so back pieces sit behind it.
  window.drawOutfitBehind = function (ctx, state, x, y, w, h, petIndex) {
    return drawLayers(ctx, x, y, w, h, petIndex, true);
  };

  window.enterShowerClothesRules = function () {
    if (!Array.isArray(window._prevDressUpBeforeShower)) {
      window._prevDressUpBeforeShower = window.selectedClothes.map(p => ({ ...p }));
    }
    window.selectedClothes = window.selectedClothes.map(p => {
      const next = { ...p };
      Object.keys(next).forEach(k => next[k] = 0);
      return next;
    });
    dressBtn.style.display = "none";
    panel.style.display = "none";
    updateButtonLabel();
  };

  window.exitShowerClothesRules = function () {
    if (Array.isArray(window._prevDressUpBeforeShower)) {
      window.selectedClothes = window._prevDressUpBeforeShower.map(p => ({ ...p }));
      delete window._prevDressUpBeforeShower;
    }
    dressBtn.style.display = "block";
    updateButtonLabel();
  };

  window.setActivePet = function (petIndex) {
    window.activePetIndex = PETS.includes(petIndex) ? petIndex : 0;
    validateSelections();
    renderPanel();
    updateButtonLabel();
  };

  // ---- Init -----------------------------------------------------------------
  normalizeState();
  validateSelections();
  renderPanel();
  updateButtonLabel();
})();
