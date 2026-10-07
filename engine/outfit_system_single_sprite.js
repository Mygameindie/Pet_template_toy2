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
  // cloth simulation, not a canned animation. The moving part of the picture is
  // cut into rows hanging from the waist. Every row is a spring + damper:
  //   - the blower (a mode calls ClothWind.set(pet, 0..1)) pushes each row toward
  //     a blown-up pose: hem thrown up and out, with gusts running down the cloth;
  //   - gravity/stiffness pull it back, so it lags, overshoots and settles;
  //   - the pet's own movement (walking, dragging, falling) swings and billows it;
  //   - neighbouring rows pull on each other, so the cloth bends smoothly.
  // The picture itself sets the physics: each row bends around its own centre
  // and width as drawn, and a longer skirt swings slower (like a pendulum).
  //
  // Tweak: WIND_PRESETS (the blown-up pose: "flow" soft, "lift" umbrella) and
  // WIND_PHYS (how the cloth moves). Per item, windStyle in outfit_config.js
  // can set tune: { flare, lift, speed, ... } to override a preset.
  const WIND_PRESETS = {
    flow: { flare: 0.45, lift: 0.30, from: 0,    curve: 0,    ripple: 0.03,  cell: 0 },
    lift: { flare: 1.15, lift: 0.33, from: 0.60, curve: 0.12, ripple: 0.012, cell: 4 },
    // A sleeve / cuff / cape tip pinned at one edge: it opens, rises and
    // flutters at the free end (lift is a fraction of the picture height).
    flap: { lift: 0.035, open: 0.38, ripple: 0.02, flutter: 1 },
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
    strip: 2,          // drawn strip height in source pixels
  };

  const windSims = new Map();   // one cloth per pet + garment + piece
  const windMotion = {};        // each pet's recent movement
  function resetWindSims() {
    windSims.clear();
    Object.keys(windMotion).forEach(k => delete windMotion[k]);
  }

  window.ClothWind = window.ClothWind || {
    _strength: {},   // blower strength per pet (0..1), set by the mode
    set(p, s) { this._strength[p] = Math.max(0, Math.min(1, s || 0)); },
    get(p) { return this._strength[p] || 0; },
    reset() { this._strength = {}; resetWindSims(); },
  };

  // Wind settings for an item from OUTFIT_CONFIG.windStyle[id]: a style name
  // ("flow" | "lift") or { style, region, backRegion, backWind, backStyle, tune, parts }.
  // parts = extra pieces that move on their own, e.g. the sleeves and side
  // veils of a long dress (see outfit_config.js):
  //   { kind: "flap" | "skirt", region, on: "front" | "back" | "both",
  //     pin: "left" | "right" (flap), dir: -1 | 1 (skirt: push outward), tune }
  const windCfgCache = new Map();
  function windPart(pt) {
    const kind = pt && pt.kind === "skirt" ? "skirt" : "flap";
    const style = WIND_PRESETS[pt.style] ? pt.style : (kind === "skirt" ? "flow" : "flap");
    return {
      kind, region: pt.region,
      on: pt.on === "back" || pt.on === "both" ? pt.on : "front",
      pin: pt.pin === "left" ? "left" : "right",
      dir: pt.dir ? Math.sign(pt.dir) : 0,
      preset: Object.assign({}, WIND_PRESETS[style], pt.tune || {}),
    };
  }
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
      backPreset: Object.assign({}, WIND_PRESETS[WIND_PRESETS[o.backStyle] ? o.backStyle : style], o.backTune || {}),
      parts: (Array.isArray(o.parts) ? o.parts : []).filter(pt => pt && pt.region).map(windPart),
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

  // Per source row inside the moving area: the cloth's centre and half-width as
  // drawn (smoothed), so each row bends around its own middle, not the box's.
  function rowProfile(image, area) {
    const key = `${area.left}|${area.right}|${area.top}|${area.bottom}`;
    const cache = image._rows || (image._rows = {});
    if (cache[key] !== undefined) return cache[key];
    let out = null;
    const a = alphaOf(image);
    if (a) {
      const nw = image.naturalWidth;
      const y0 = Math.floor(area.top), y1 = Math.ceil(area.bottom);
      const x0 = Math.floor(area.left), x1 = Math.ceil(area.right);
      const n = y1 - y0;
      const left = new Float32Array(n), right = new Float32Array(n);
      let any = false;
      for (let y = 0; y < n; y++) {
        let l = -1, r = -1;
        const base = (y0 + y) * nw;
        for (let x = x0; x < x1; x++) if (a[base + x] > 16) { if (l < 0) l = x; r = x + 1; }
        left[y] = l; right[y] = r;
        if (l >= 0) any = true;
      }
      if (any) {
        let last = -1;                                   // fill empty rows from neighbours
        for (let y = 0; y < n; y++) {
          if (left[y] >= 0) last = y;
          else if (last >= 0) { left[y] = left[last]; right[y] = right[last]; }
        }
        last = -1;
        for (let y = n - 1; y >= 0; y--) {
          if (left[y] >= 0) last = y;
          else if (last >= 0) { left[y] = left[last]; right[y] = right[last]; }
        }
        const cen = new Float32Array(n), hw = new Float32Array(n);
        const R = 5;
        for (let y = 0; y < n; y++) {
          let sc = 0, sh = 0, c = 0;
          for (let j = Math.max(0, y - R); j <= Math.min(n - 1, y + R); j++) {
            sc += (left[j] + right[j]) / 2; sh += (right[j] - left[j]) / 2; c++;
          }
          cen[y] = sc / c; hw[y] = sh / c;
        }
        out = { y0, n, cen, hw };
      }
    }
    cache[key] = out;
    return out;
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

  function newSim() {
    const n = WIND_PHYS.rows, F = () => new Float32Array(n);
    return { n, fl: F(), fv: F(), up: F(), uv: F(), sw: F(), sv: F(), t: 0, rest: true };
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

  function stepWind(sim, now, target, quiet, pr, omega, mo) {
    let dt = sim.t ? (now - sim.t) / 1000 : 0;
    sim.t = now;
    if (dt <= 0) return;
    dt = Math.min(dt, 0.05);
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
        const swEq = target * P.sway * f * Math.sin(tt * gs * 0.8 - f * 3.2) - mo.vx * P.motionSway * f;
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

  // Where the moving part of a garment is (source pixels). With a region
  // ({left,right,top,bottom} as 0..1 fractions of the image) only that piece
  // moves - e.g. the skirt of a dress whose veil and sleeves stay put. Without
  // one, the whole covered area moves (a dress keeps its top dressWaist part
  // still). The top edge is where the cloth is pinned.
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

  // ---- Flaps: sleeves, cuffs, cape tips --------------------------------------
  // A flap is pinned along one vertical edge (pin: "right" for the left sleeve
  // of a front-facing pet, "left" for the right one). Its free end rises, opens
  // up and flutters in a travelling wave, driven by the same kind of spring
  // chain as the skirt (so it lags, overshoots and settles).
  function newFlap() {
    const n = 14, F = () => new Float32Array(n);
    return { n, up: F(), uv: F(), op: F(), ov: F(), t: 0, rest: true };
  }

  function stepFlap(sim, now, target, quiet, pr, omega, mo) {
    let dt = sim.t ? (now - sim.t) / 1000 : 0;
    sim.t = now;
    if (dt <= 0) return;
    dt = Math.min(dt, 0.05);
    const steps = Math.max(1, Math.ceil(dt / (1 / 90))), h = dt / steps;
    const n = sim.n, w2 = omega * omega, c = 2 * WIND_PHYS.zeta * omega;
    const P = WIND_PHYS, gs = P.gustSpeed, kc = P.couple * w2;
    const { up, uv, op, ov } = sim;
    for (let st = 0; st < steps; st++) {
      const tt = now / 1000 - dt + (st + 1) * h;
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        const gust = 1 + P.gust * 1.6 * (0.6 * Math.sin(tt * gs - f * 5) + 0.4 * Math.sin(tt * gs * 1.7 + f * 3 + 1.3));
        const upEq = target * pr.lift * f * f * gust + mo.fall * P.motionLift * 0.6 * f * f + Math.abs(mo.vx) * 0.004 * f;
        const opEq = target * pr.open * Math.pow(f, 1.2) * gust;
        const k = w2 * (1 - P.hemSoft * f);
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        uv[i] += (-k * (up[i] - upEq) - c * uv[i] + kc * ((up[a] + up[b]) / 2 - up[i])) * h;
        ov[i] += (-k * (op[i] - opEq) - c * ov[i] + kc * ((op[a] + op[b]) / 2 - op[i])) * h;
      }
      for (let i = 0; i < n; i++) {
        up[i] = clampN(up[i] + uv[i] * h, -0.05, 0.2);
        op[i] = clampN(op[i] + ov[i] * h, -0.3, 1.2);
      }
    }
    let energy = 0;
    for (let i = 0; i < n; i++) {
      energy = Math.max(energy, Math.abs(up[i]) * 20, Math.abs(op[i]),
        Math.abs(uv[i]) * 2, Math.abs(ov[i]) * 0.1);
    }
    sim.rest = !target && quiet && energy < 0.004;
    if (sim.rest) { up.fill(0); uv.fill(0); op.fill(0); ov.fill(0); }
  }

  // Per source column inside a box: where the cloth's top/bottom edge is.
  function colProfile(image, box) {
    const key = `c${box.left}|${box.right}|${box.top}|${box.bottom}`;
    const cache = image._rows || (image._rows = {});
    if (cache[key] !== undefined) return cache[key];
    let out = null;
    const a = alphaOf(image);
    if (a) {
      const nw = image.naturalWidth;
      const x0 = Math.floor(box.left), x1 = Math.ceil(box.right);
      const y0 = Math.floor(box.top), y1 = Math.ceil(box.bottom);
      const n = x1 - x0;
      const top = new Float32Array(n), bot = new Float32Array(n);
      let any = false;
      for (let x = 0; x < n; x++) {
        let t = -1, bt = -1;
        for (let y = y0; y < y1; y++) if (a[y * nw + x0 + x] > 16) { if (t < 0) t = y; bt = y + 1; }
        top[x] = t; bot[x] = bt;
        if (t >= 0) any = true;
      }
      if (any) {
        let last = -1;                                   // fill empty columns from neighbours
        for (let x = 0; x < n; x++) {
          if (top[x] >= 0) last = x;
          else if (last >= 0) { top[x] = top[last]; bot[x] = bot[last]; }
        }
        last = -1;
        for (let x = n - 1; x >= 0; x--) {
          if (top[x] >= 0) last = x;
          else if (last >= 0) { top[x] = top[last]; bot[x] = bot[last]; }
        }
        const R = 3, mid = new Float32Array(n);
        for (let x = 0; x < n; x++) {
          let sc = 0, c = 0;
          for (let j = Math.max(0, x - R); j <= Math.min(n - 1, x + R); j++) { sc += (top[j] + bot[j]) / 2; c++; }
          mid[x] = sc / c;
        }
        out = { x0, n, mid };
      }
    }
    cache[key] = out;
    return out;
  }

  // ---- Pieces: one cloth simulation each -------------------------------------
  // A garment is drawn as: its still part, plus any number of moving pieces -
  // the main skirt (region / backRegion) and the extra windStyle parts.
  // prepPiece steps a piece's simulation (null = nothing to move), paintPiece
  // draws it.
  function prepPiece(image, pc, fr) {
    const pr = pc.cfg, nw = image.naturalWidth, nh = image.naturalHeight;
    if (pc.kind === "flap") {
      const r = pc.region;
      const b = { left: r.left * nw, right: r.right * nw, top: r.top * nh, bottom: r.bottom * nh };
      const len = b.right - b.left;
      if (len < 4 || b.bottom - b.top < 4) return null;
      let sim = windSims.get(pc.key);
      if (!sim) {
        if (!pc.target && fr.quiet) return null;
        sim = newFlap();
        windSims.set(pc.key, sim);
      }
      if (!pc.target && fr.quiet && sim.rest) return null;
      const omega = clampN(WIND_PHYS.omega * Math.sqrt(WIND_PHYS.refLength / (len / nh)), 4, 16) * (pr.speed || 1);
      stepFlap(sim, fr.now, pc.target, fr.quiet, pr, omega, fr.mo);
      if (sim.rest) return null;
      const cols = colProfile(image, b);
      return cols ? { pc, b, sim, cols, len, nw, nh, box: b } : null;
    }
    const g = windGeometry(image, pc.dressLike, pc.region);
    if (!g) return null;
    const { b, startY, len } = g;
    let sim = windSims.get(pc.key);
    if (!sim) {
      if (!pc.target && fr.quiet) return null;
      sim = newSim();
      windSims.set(pc.key, sim);
    }
    if (!pc.target && fr.quiet && sim.rest) return null;
    const omega = clampN(WIND_PHYS.omega * Math.sqrt(WIND_PHYS.refLength / (len / g.nh)), 4, 14) * (pr.speed || 1);
    stepWind(sim, fr.now, pc.target, fr.quiet, pr, omega, fr.mo);
    if (sim.rest) return null;
    const rows = rowProfile(image, { left: b.left, right: b.right, top: startY, bottom: b.bottom });
    if (!rows) return null;
    return { pc, g, b, sim, rows, startY, len, nw: g.nw, nh: g.nh, box: b };
  }

  function paintFlap(ctx, image, x, y, w, h, st, now) {
    const { pc, b, sim, cols, len, nw, nh } = st;
    const pr = pc.cfg, kx = w / nw, ky = h / nh;
    const rTop = b.top, rH = b.bottom - b.top;
    const step = WIND_PHYS.strip + 1;
    const opMax = Math.max(pr.open, 0.01);
    for (let sx = b.left; sx < b.right; sx += step) {
      const sw = Math.min(step, b.right - sx);
      const t = clampN(pc.pin === "right" ? (b.right - (sx + sw / 2)) / len : ((sx + sw / 2) - b.left) / len, 0, 1);
      const opn = lerpArr(sim.op, t);
      const ef = clampN(opn / opMax, 0, 1.2);
      const wave = pr.ripple * ef * t * Math.sin(t * 11 * (pr.flutter || 1) - now * 0.014 * (pr.flutter || 1));
      const lift = lerpArr(sim.up, t) + wave;
      const ci = clampN(Math.floor(sx + sw / 2) - cols.x0, 0, cols.n - 1);
      const cy = cols.mid[ci];
      const s = Math.max(0.2, 1 + opn);
      const dy = y + (cy + (rTop - cy) * s) * ky - lift * h;
      ctx.drawImage(image, sx, rTop, sw, rH, x + sx * kx, dy, sw * kx + 0.6, rH * ky * s);
    }
  }

  function paintSkirt(ctx, image, x, y, w, h, st, now) {
    const { pc, g, b, sim, rows, startY, len, nw, nh } = st;
    const pr = pc.cfg, kx = w / nw, ky = h / nh, n = sim.n;
    const cell = pr.cell || 0;
    const posY = f => y + (startY + len * (f - lerpArr(sim.up, f))) * ky;
    let prev = -1e9;
    let sy = startY;
    while (sy < b.bottom) {
      // Rows that are not curling are drawn as one strip (cheap); only the
      // curling hem is drawn column by column.
      const efq = clampN(lerpArr(sim.fl, (sy - startY) / len) / Math.max(pr.flare, 0.01), 0, 1.2);
      const curl = cell > 0 && efq > 0.03;
      const step = curl ? WIND_PHYS.strip + 1 : WIND_PHYS.strip;
      const sh = Math.min(step, b.bottom - sy);
      const rowStart = sy;
      sy += step;
      const f0 = (rowStart - startY) / len, f1 = (rowStart + sh - startY) / len, fm = (f0 + f1) / 2;
      const ri = clampN(Math.floor(rowStart) - rows.y0, 0, rows.n - 1);
      const ci = rows.cen[ri], hw = Math.max(1, rows.hw[ri]);
      const flare = lerpArr(sim.fl, fm);
      const ef = clampN(flare / Math.max(pr.flare, 0.01), 0, 1.2);
      const scale = Math.max(0.2, 1 + flare + pr.ripple * ef * Math.sin(fm * 16 - now * 0.013));
      // dir pushes a side panel outward so its inner edge stays by the body.
      const off = lerpArr(sim.sw, fm) * w + (pc.dir ? pc.dir * Math.max(0, flare) * hw * kx : 0);
      let dy0 = Math.max(posY(f0), prev);
      const dy1 = Math.max(posY(f1), dy0 + 0.5);
      prev = dy1;
      const dh = dy1 - dy0 + 0.6;
      const baseX = x + ci * kx + off;
      if (!curl) {
        ctx.drawImage(image, b.left, rowStart, b.right - b.left, sh,
          baseX + (b.left - ci) * kx * scale, dy0, (b.right - b.left) * kx * scale, dh);
      } else {
        for (let sx = b.left; sx < b.right; sx += cell) {
          const sw2 = Math.min(cell, b.right - sx);
          const u = clampN((sx + sw2 / 2 - ci) / hw, -1.3, 1.3);
          const rise = pr.curve * len * ky * ef * u * u;      // hem edges curl up
          ctx.drawImage(image, sx, rowStart, sw2, sh,
            baseX + (sx - ci) * kx * scale, dy0 - rise, sw2 * kx * scale + 0.6, dh);
        }
      }
    }
  }

  // Draw a garment through its cloth simulation(s). pieces = the moving parts
  // [{ kind: "skirt" | "flap", key, cfg, region, target, ... }]. Returns false
  // when every piece is at rest (the caller then draws the picture normally).
  function drawWindy(ctx, image, x, y, w, h, o) {
    const now = performance.now();
    const mo = petMotion(o.p, x, y, w, now);
    const fr = { now, mo, quiet: Math.abs(mo.vx) < 0.02 && mo.fall < 0.02 };
    const act = o.pieces.map(pc => prepPiece(image, pc, fr)).filter(Boolean);
    if (!act.length) return false;
    const nw = image.naturalWidth, nh = image.naturalHeight, kx = w / nw, ky = h / nh;

    // The still part of the picture: everything outside the moving pieces.
    const whole = act.find(st => st.pc.kind === "skirt" && !st.pc.region);
    if (whole) {
      if (whole.startY > 0) ctx.drawImage(image, 0, 0, nw, whole.startY, x, y, w, whole.startY * ky);
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      act.forEach(st => {
        ctx.rect(x + st.box.left * kx, y + st.box.top * ky, (st.box.right - st.box.left) * kx, (st.box.bottom - st.box.top) * ky);
        const hd = st.pc.region && st.pc.region.hide;
        if (hd) ctx.rect(x + hd.left * w, y + hd.top * h, (hd.right - hd.left) * w, (hd.bottom - hd.top) * h);
      });
      ctx.clip("evenodd");
      ctx.drawImage(image, x, y, w, h);
      ctx.restore();
    }

    act.forEach(st => {
      if (st.pc.kind === "flap") { paintFlap(ctx, image, x, y, w, h, st, now); return; }
      // A "hide" area (e.g. an underskirt that lifts away with the skirt) fades out as the skirt rises.
      const hd = st.pc.region && st.pc.region.hide;
      const blown = clampN(st.sim.up[st.sim.n - 1] / Math.max(st.pc.cfg.lift * 0.9, 0.05), 0, 1);
      if (hd && blown < 1) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + hd.left * w, y + hd.top * h, (hd.right - hd.left) * w, (hd.bottom - hd.top) * h);
        ctx.clip();
        ctx.globalAlpha = Math.max(0, 1 - blown * 1.6);
        ctx.drawImage(image, x, y, w, h);
        ctx.restore();
      }
      paintSkirt(ctx, image, x, y, w, h, st, now);
    });
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
  // skirt-like garment. isBack = this is a behind-the-body piece (it uses
  // backRegion / backWind from the windStyle config instead of region).
  function drawCloth(ctx, p, k, id, image, x, y, w, h, isBack) {
    if (!image || image._failed) return false;
    const hex = COLORS[(window.clothingColors[p] && window.clothingColors[p][k]) || DEFAULT_COLOR] || null;
    const drawImg = hex ? tintedImage(image, hex) : image;
    // A back piece stays still unless the config says where its skirt is
    // (backRegion) or asks for the whole piece to move (backWind: true).
    const wc = windConfigOf(id);
    const moves = !isBack || !!wc.backRegion || wc.backWind === true;
    const ready = drawImg.complete && drawImg.naturalWidth && !drawImg._failed;
    if (ready) {
      const target = window.ClothWind ? window.ClothWind.get(p) : 0;
      const base = `${p}|${k}|${id}|${isBack ? "b" : "f"}`;
      const pieces = [];
      if (moves && isSkirtLike(k, id)) {
        pieces.push({ kind: "skirt", key: base, cfg: isBack ? wc.backPreset : wc.preset, region: isBack ? wc.backRegion : wc.region,
          dressLike: k === "dress", p, target });
      }
      // Extra moving parts (sleeves, side veils...) from windStyle[id].parts.
      wc.parts.forEach((pt, i) => {
        if (pt.on !== "both" && (pt.on === "back") !== !!isBack) return;
        pieces.push({ kind: pt.kind, key: `${base}|p${i}`, cfg: pt.preset, region: pt.region,
          pin: pt.pin, dir: pt.dir, p, target });
      });
      if (pieces.length && drawWindy(ctx, drawImg, x, y, w, h, { p, pieces })) return true;
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
