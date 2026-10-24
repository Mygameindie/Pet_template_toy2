// ===========================================================
// 🐾 pet_script.js — Head + Button Outfit System (SINGLE IIFE)
// ===========================================================
(function () {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const groundHeight = 100;
  let groundY = canvas.height - groundHeight;

  // Characters come from game_config.js (count, art suffix, position, tint).
  const PET_CFG = (window.GAME_CONFIG && Array.isArray(window.GAME_CONFIG.pets) && window.GAME_CONFIG.pets.length)
    ? window.GAME_CONFIG.pets
    : [{ artSuffix: '', xFrac: 0.5, drawFilter: 'none' }];

  // ===========================================================
  // 🖼️ Images
  // Clothes are handled globally by outfit_system.js
  // ===========================================================
  function createImg(src) {
    const img = new Image();
    img._failed = false;
    img.onerror = () => { img._failed = true; };
    img.src = src;
    return img;
  }

  // Per-pet base sets.
  // Each pet's art uses its config artSuffix: "" -> base.png, "_2" -> base_2.png.
  // If missing, we fall back to pet1 art and apply the pet's drawFilter so it is still visually distinct.
  function loadHeadSet(suffix) {
    return {
      stand: createImg(`base${suffix}.png`),
      fall: createImg(`base${suffix}.png`),
      fly0: createImg(`base${suffix}.png`),
      fly1: createImg(`base${suffix}.png`),
      // Toy3-style alternate base shown while a toy is touching the pet.
      // Mirrors Toy3's base{num}_1.png convention; falls back to the normal
      // base image if this art is missing.
      toy: createImg(`base${suffix}_1.png`),
      _suffix: suffix,
    };
  }

  // === Head images (per pet) ===
  const headSets = PET_CFG.map(c => loadHeadSet(c.artSuffix || ''));

  // NOTE: Do NOT create a clothes button here.
  // outfit_system.js creates ONE global button and keeps outfit state in window.currentOutfit.

  // === Safe draw (prevents broken-image crash) ===
  function safeDraw(img, x, y, w, h) {
    if (!img || img._failed || !img.complete || img.naturalWidth === 0) return;
    ctx.drawImage(img, x, y, w, h);
  }

  // === Pets (from config) ===
  function makePet(x, idx) {
    const p = {
      x,
      y: canvas.height - 170 - 170,
      w: 400,
      h: 450,
      type: 'pet' + (idx + 1),
      // If this pet's art is missing, we tint the fallback so it still looks like a different pet.
      drawFilter: PET_CFG[idx].drawFilter || 'none',
      dragging: false,
      oldx: 0,
      oldy: 0,
      vx: 0,
      vy: 0,
      angle: 0,        // tilt in radians (0 = upright)
      angVel: 0,
      squash: 0,       // landing squash 0..MAX_SQUASH, springs back to 0
      grabX: 0,        // where the pet was grabbed, relative to its centre
      grabY: 0,
      hist: [],        // recent pointer samples, used to throw on release
      onGround: false,
      frame: 0,
      timer: 0,
      _toyActive: false,
    };
    p.oldx = p.x;
    p.oldy = p.y;
    return p;
  }

  
  const pets = PET_CFG.map((c, i) =>
    makePet(canvas.width * (c.xFrac != null ? c.xFrac : (i + 1) / (PET_CFG.length + 1)), i)
  );

  // === Original-size base (uniform for both pets) ===
  // Match every pet's box to pet 1's base art aspect ratio, so both pets render
  // at the art's true proportions AND at the same size. Height stays the display
  // size; width is derived from the image's natural dimensions once it loads.
  function syncPetAspect() {
    const img = headSets[0].stand;
    if (!img || img._failed || !img.naturalWidth || !img.naturalHeight) return;
    const aspect = img.naturalWidth / img.naturalHeight;
    pets.forEach(pet => {
      const bottom = pet.y + pet.h / 2;   // keep feet anchored to current spot
      pet.w = pet.h * aspect;
      pet.y = bottom - pet.h / 2;
      pet.oldx = pet.x;
      pet.oldy = pet.y;
    });
  }

  const headImg = headSets[0].stand;
  if (headImg && headImg.complete && headImg.naturalWidth) syncPetAspect();
  else if (headImg) headImg.addEventListener('load', syncPetAspect);

  // === Physics ===
  // All values are tuned per 60fps frame; update() scales by real elapsed time
  // so high-refresh screens behave the same.
  const gravity = 1.2;
  const airDrag = 0.995;        // gentle air resistance (per frame)
  const restitution = 0.42;     // fraction of speed kept after a floor bounce
  const wallRestitution = 0.5;
  const ceilingRestitution = 0.6;  // fraction of speed kept bouncing off the top of the screen
  const EDGE_PUSH = 20;            // px/frame a ragdoll is eased back on screen (never teleported)
  const groundFriction = 0.82;  // horizontal speed kept per frame while sliding
  const REST_SPEED = 2.5;       // below this a landing settles instead of bouncing
  const MIN_IMPACT = 6;         // impact speed that makes noise / squash
  const MAX_SPEED = 55;
  const MAX_SQUASH = 0.16;
  const MAX_TILT = 0.5;         // radians a held/flying pet can lean
  const FOLLOW = 0.35;          // how tightly a held pet chases the pointer (0..1)
  const THROW_WINDOW = 90;      // ms of pointer history used for the throw
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // === Ragdoll (ported from Computer-pet) ===
  // A pet whose body-part pictures all exist (images/parts/head.png, body.png,
  // arm_L.png ... see ragdoll_config.js) is drawn as a skeleton instead of one
  // flat sprite: pick it up by a hand and it hangs from that hand, throw it and
  // it tumbles limp, then gets back up on its feet. Clothes are cut along the
  // body parts so they move with the arms, legs and chest. A pet without a full
  // set of parts keeps the normal sprite. Turn it off with ragdoll: false in
  // game_config.js.
  const RD = window.PetRagdoll, RCFG = window.RAGDOLL_CONFIG;
  const RAGDOLL_ON = !!(RD && RCFG) && !(window.GAME_CONFIG && window.GAME_CONFIG.ragdoll === false);
  const PX_PER_S2 = 3600;            // 1 px/frame² at 60fps, in px/s²
  let alive = true;                  // false once this mode is unloaded

  function hdDpr() {
    const max = (window.HDCanvas && window.HDCanvas.maxDPR) || 2;
    return Math.min(max, Math.max(1, window.devicePixelRatio || 1));
  }
  function partSuffix(i) { return (PET_CFG[i] && PET_CFG[i].artSuffix) || ''; }

  // Heads besides the normal one: 1 = touched by a toy (head_1.png), the rest
  // are set by PetFace (pet_stats.js) from what you do to the pet (shy_1 = shy + toy).
  const FACES = ['1', 'happy', 'disgust', 'sick', 'heal', 'music', 'shower', 'shy', 'shy_1'];
  // The face the pet wears right now, or null for its normal head.
  function faceOf(pet, i) {
    let name = window.PetFace ? window.PetFace.get(i) : null;
    // A shy pet touched by a toy wears head_shy_1.png (else head_1.png).
    if (pet._toyActive) name = name === 'shy' ? 'shy_1' : '1';
    return name && pet.faceImgs && pet.faceImgs[name] ? name : null;
  }

  function loadParts(pet, i) {
    if (!RAGDOLL_ON) return;
    if (!pet.body) {
      pet.body = new RD.Ragdoll();
      pet.body.gravity = gravity * PX_PER_S2;   // limbs fall exactly as fast as the pet
    }
    const suffix = partSuffix(i);
    const imgs = {};
    // Optional faces: head_<name>.png (head_<name>_2.png for character 2) for
    // each name in FACES. Same ragdoll body, only the head picture changes.
    const faces = FACES.map(n => ({ file: 'head', key: 'face_' + n, name: 'head_' + n + suffix }));
    let pending = RCFG.parts.length + faces.length;
    pet.partsSuffix = suffix;
    // Character art that doesn't exist yet (head_2.png ...) falls back to the
    // plain picture, so every character is a ragdoll as soon as character 1 is.
    // If the BODY itself is the plain one, the pet is drawn with its drawFilter
    // tint so it still looks like a different character.
    let borrowed = false;
    RCFG.parts.concat(faces).forEach(part => {
      const im = new Image();
      const plain = 'images/parts/' + (part.file) + '.png';
      let triedPlain = !suffix;
      const done = ok => {
        if (ok) imgs[part.key || part.file] = im;
        if (!ok && !triedPlain) {
          triedPlain = true;
          if (part.file === 'body') borrowed = true;
          if (part.key) { im.src = 'images/parts/' + part.name.replace(suffix, '') + '.png'; return; }
          im.src = plain;
          return;
        }
        if (--pending > 0 || !alive || pet.partsSuffix !== suffix) return;
        pet.partImgs = imgs;
        pet.faceImgs = {};
        FACES.forEach(n => { if (imgs['face_' + n]) pet.faceImgs[n] = imgs['face_' + n]; });
        pet.hasParts = RCFG.parts.every(q => q.optional || imgs[q.file]);
        pet.tintArt = borrowed;   // drawing character 1's body: tint it (drawFilter)
        pet.artSig = null;
        pet.placed = false;
      };
      im.onload = () => done(true);
      im.onerror = () => done(false);
      im.src = 'images/parts/' + (part.name || part.file + suffix) + '.png';
    });
  }

  // What the cut-up clothes were built from: the outfit, the colours and which
  // of the worn pictures have finished loading.
  function wornSig(i) {
    const sel = (window.selectedClothes || [])[i] || {};
    const col = (window.clothingColors || [])[i] || {};
    const cat = (window.dressUpCatalog || {})[i] || (window.dressUpCatalog || {})[0] || {};
    let ready = '';
    Object.keys(sel).forEach(k => {
      const it = cat[k] && cat[k].items && cat[k].items[sel[k]];
      if (!it) return;
      ['img', 'back', 'over', 'under', 'armL', 'armR', 'legL', 'legR'].forEach(n => {
        const im = it[n];
        ready += im ? (im._failed ? 'x' : im.complete && (!window.outfitTintReady || window.outfitTintReady(im, col[k])) ? '1' : '0') : '-';
      });
    });
    return JSON.stringify(sel) + JSON.stringify(col) + ready + '|' + window._modeName + '|' + pet_h_sig();
  }
  function pet_h_sig() { return pets.map(p => p.h).join(','); }

  // Does a garment cover the chest (a top, a dress, a bra)? Those are kept in
  // one piece over the chest and stretch with its bounce, instead of being cut
  // along the chest's outline (which tore them where the cut moved).
  const chestCover = new Map();
  function coversChest(it) {
    const im = it && it.img;
    if (!im || im._failed || !im.complete || !im.naturalWidth) return false;
    if (chestCover.has(im.src)) return chestCover.get(im.src);
    let hit = false;
    try {
      const S = 0.25, W = Math.round(RCFG.SRC_W * S), H = Math.round(RCFG.SRC_H * S);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(im, 0, 0, W, H);
      const d = x.getImageData(0, 0, W, H).data;
      for (const q of RCFG.parts) {
        const r = q.region;
        if (!q.offset || !r || r.t !== 'ellipse') continue;
        let n = 0, tot = 0;
        for (let yy = Math.floor((r.cy - r.ry) * S); yy <= (r.cy + r.ry) * S; yy++) {
          for (let xx = Math.floor((r.cx - r.rx) * S); xx <= (r.cx + r.rx) * S; xx++) {
            if (((xx / S - r.cx) / r.rx) ** 2 + ((yy / S - r.cy) / r.ry) ** 2 > 1) continue;
            tot++;
            if (d[(yy * W + xx) * 4 + 3] > 40) n++;
          }
        }
        if (tot && n / tot > 0.2) hit = true;
      }
    } catch (_) { /* pixels unreadable: cut it the old way */ }
    chestCover.set(im.src, hit);
    return hit;
  }

  // Cut the clothes up along the body parts and hand them to the skeleton.
  // Only redone when the outfit or the art changes.
  function buildBody(pet, i) {
    // A garment with cuffs: true (outfit_config.js) has its sleeves stuck to the top,
    // so the arms can't move away from them.
    pet.body.armsLocked = Object.keys(window.selectedClothes[i] || {}).some(k => {
      const cat = (window.dressUpCatalog[i] || window.dressUpCatalog[0] || {})[k];
      const it = cat && cat.items && cat.items[window.selectedClothes[i][k]];
      return !!(it && it.cuffs);
    });
    const face = faceOf(pet, i);
    const sig = wornSig(i) + '|face' + (face || '');
    if (sig === pet.artSig) return;
    pet.artSig = sig;
    const cs = (pet.h / RCFG.SRC_H) * hdDpr();
    const W = Math.round(RCFG.SRC_W * cs), H = Math.round(RCFG.SRC_H * cs);
    const sized = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const cloth = sized(), hang = sized(), over = sized(), under = sized(), blow = sized(),
      stiff = sized(), armL = sized(), armR = sized(), legL = sized(), legR = sized(), legTop = sized(), back = sized(), overTop = sized();
    let blowFrom = Infinity;
    const D = window.drawOutfitOverlay;
    if (typeof D === 'function') {
      // whole: true (outfit_config.js): carried by the body in one piece, drawn
      // over the chest (a bra: its cups and straps never go off with an arm).
      const covers = it => !it.stiff && !it.whole && coversChest(it);
      // A garment with its own <name>_L / <name>_R leg pictures (shoes, socks) is
      // not cut along the legs: those two pictures replace it on the legs.
      const legPic = im => !!im && !im._failed && im.complete && im.naturalWidth > 0;
      const ownLegs = it => legPic(it.legL) || legPic(it.legR);
      D(cloth.getContext('2d'), 'stand', 0, 0, W, H, i, it => !ownLegs(it) && !it.stiff && !it.whole && !it.blows && !(covers(it) && !it.hangs));
      // Clothes worn OVER the leg pictures (pants over shoes, by z in outfit_config.js)
      // are also drawn again above them, on the legs only (see buildArt).
      let legZ = -Infinity;
      Object.keys(window.selectedClothes[i] || {}).forEach(k => {
        const cat = (window.dressUpCatalog[i] || window.dressUpCatalog[0] || {})[k];
        const it = cat && cat.items && cat.items[window.selectedClothes[i][k]];
        if (it && ownLegs(it)) legZ = Math.max(legZ, it.z || 0);
      });
      if (isFinite(legZ)) {
        D(legTop.getContext('2d'), 'stand', 0, 0, W, H, i, it => it.z > legZ && !ownLegs(it) && !it.stiff && !it.whole && !it.blows && !it.hangs && !covers(it));
      }
      D(hang.getContext('2d'), 'stand', 0, 0, W, H, i, it => (it.hangs || it.blows) && !it.stiff && !it.whole);
      D(blow.getContext('2d'), 'stand', 0, 0, W, H, i, it => {
        if (!it.blows || it.stiff || it.whole) return false;
        if (typeof it.blows === 'number') blowFrom = Math.min(blowFrom, it.blows);
        return true;
      });
      // A garment's own _over picture (a dress's bust pieces) goes ABOVE that
      // garment; the over pictures of other things (a bra's straps) stay
      // under the stiff top / dress worn over them.
      // A whole garment (a bra) is drawn first on the body's over layer, so a dress
      // or stiff top worn over it still covers it.
      const ownsTop = it => !it.whole && (it.stiff || coversChest(it));
      D(over.getContext('2d'), 'stand', 0, 0, W, H, i, it => it.whole);
      D(over.getContext('2d'), 'stand', 0, 0, W, H, i, it => !ownsTop(it), 'over');
      D(overTop.getContext('2d'), 'stand', 0, 0, W, H, i, ownsTop, 'over');
      const sx = stiff.getContext('2d');
      // cuffs: true (outfit_config.js): the sleeves are part of the top, not the arms:
      // carried by the body and drawn just under the top, so they stay stuck to it.
      D(sx, 'stand', 0, 0, W, H, i, it => it.cuffs, 'armL');
      D(sx, 'stand', 0, 0, W, H, i, it => it.cuffs, 'armR');
      D(sx, 'stand', 0, 0, W, H, i, it => !it.whole && (it.stiff || (covers(it) && !it.hangs && !it.blows)));
      // A dress (or other hanging garment) that covers the chest: its top half
      // goes over the chest like a top, its skirt still hangs / blows.
      const tops = sized(), tx = tops.getContext('2d');
      let topLine = Infinity;
      D(tx, 'stand', 0, 0, W, H, i, it => {
        if (!covers(it) || !(it.hangs || it.blows)) return false;
        const cut = typeof it.blows === 'number' ? it.blows : RCFG.particles.HipL.y;
        topLine = Math.min(topLine, cut);
        return true;
      });
      if (isFinite(topLine)) {
        tx.clearRect(0, Math.round(topLine * cs), W, H);
        sx.drawImage(tops, 0, 0);
      }
      D(under.getContext('2d'), 'stand', 0, 0, W, H, i, null, 'under');
      D(armL.getContext('2d'), 'stand', 0, 0, W, H, i, it => !it.cuffs, 'armL');
      D(armR.getContext('2d'), 'stand', 0, 0, W, H, i, it => !it.cuffs, 'armR');
      D(legL.getContext('2d'), 'stand', 0, 0, W, H, i, null, 'legL');
      D(legR.getContext('2d'), 'stand', 0, 0, W, H, i, null, 'legR');
    }
    if (typeof window.drawOutfitBehind === 'function') {
      window.drawOutfitBehind(back.getContext('2d'), 'stand', 0, 0, W, H, i, () => true);
    }
    pet.body.layout(pet.h / RCFG.SRC_H);
    try {
      const partImgs = face ? Object.assign({}, pet.partImgs, { head: pet.faceImgs[face] }) : pet.partImgs;
      pet.body.buildArt(partImgs, cloth, cs, hang, over, under, blow,
        isFinite(blowFrom) ? blowFrom : null, stiff, { arm_L: armL, arm_R: armR, armArt: !!pet.body.armsLocked, leg_L: legL, leg_R: legR, legTop }, back, overTop);
    } catch (err) {
      // Reading the pictures' pixels is refused when the game is opened as a
      // file:// page (serve it over http, e.g. GitHub Pages). Keep the sprite.
      console.warn('Ragdoll off (could not read the art):', err && err.message);
      pet.hasParts = false;
      pet.body.parts = null;
    }
  }

  // Is this pet drawn and moved as a ragdoll right now? A few things still use
  // the flat sprite: the troll blower (the skirt's wind animation is drawn on
  // the sprite) and the toy-touched picture.
  function isRag(pet, i) {
    if (!RAGDOLL_ON || !pet.body || !pet.hasParts) return false;
    const now = performance.now();
    if (window.ClothWind && window.ClothWind.get(i) > 0) pet.spriteUntil = now + 1500;
    if (pet._toyActive && !(pet.faceImgs && pet.faceImgs['1'])) {
      const set = headSets[i] || headSets[0];
      if (set.toy && !set.toy._failed && !set.toy._fallbackHead && set.toy.complete && set.toy.naturalWidth) pet.spriteUntil = now + 300;
    }
    return !(pet.spriteUntil > now);
  }

  // The box around the skeleton as drawn (joints plus their size), screen px.
  function bodyExtent(pet) {
    const j = pet.body.p, r = pet.body.rest;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n in j) {
      const rr = (r[n] && r[n].r) || 0;
      if (j[n].x - rr < x0) x0 = j[n].x - rr;
      if (j[n].x + rr > x1) x1 = j[n].x + rr;
      if (j[n].y - rr < y0) y0 = j[n].y - rr;
      if (j[n].y + rr > y1) y1 = j[n].y + rr;
    }
    return { x0, y0, x1, y1 };
  }

  // Is point p on the ragdoll's body? Distance to each bone, as wide as the art.
  function onRagdoll(pet, p) {
    const j = pet.body.p, k = pet.body.k;
    const seg = (a, b, r) => {
      const A = j[a], B = j[b];
      if (!A || !B) return false;
      const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy || 1;
      const t = clamp(((p.x - A.x) * dx + (p.y - A.y) * dy) / l2, 0, 1);
      return Math.hypot(p.x - (A.x + dx * t), p.y - (A.y + dy * t)) < r * k;
    };
    return seg('N', 'P', 95) || seg('SL', 'HL', 45) || seg('SR', 'HR', 45) ||
      seg('HipL', 'FL', 50) || seg('HipR', 'FR', 50) || seg('N', 'Hd', 120);
  }

  function hitPet(pet, i, p) {
    if (isRag(pet, i) && pet.body.parts) return onRagdoll(pet, p);
    return p.x > pet.x - pet.w / 2 && p.x < pet.x + pet.w / 2 &&
      p.y > pet.y - pet.h / 2 && p.y < pet.y + pet.h / 2;
  }

  // Feed the box to the skeleton and step it.
  function syncBody(pet, i, dtSec) {
    const body = pet.body;
    const bx = pet.x - pet.w / 2, by = pet.y - pet.h / 2;
    if (!pet.placed) {
      body.box.x = bx; body.box.y = by;
      body.boxVel.x = 0; body.boxVel.y = 0;
      body.snapToPose();
      pet.placed = true;
    }
    body.setFloor(groundY);
    body.setWalls(0, canvas.width, 0);
    body.setBox(bx, by, performance.now());
    const held = !!pet.dragging;
    body.setMode(held, !held && pet.y + pet.h / 2 < groundY - 1);
    body.tick(dtSec);
    // A joint that went NaN would lose the pet for good: stand it back up.
    for (const n in body.p) {
      if (!isFinite(body.p[n].x) || !isFinite(body.p[n].y)) { pet.placed = false; break; }
    }
  }

  pets.forEach(loadParts);

  // === Fly animation ===
  const speed = 10;

  // === Sound ===
  const landSound = new Audio('fly.mp3');
  landSound.volume = 0.6;

  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    landSound.play().then(() => {
      landSound.pause();
      landSound.currentTime = 0;
      audioUnlocked = true;
    }).catch(() => {});
  }
  window.addEventListener('mousedown', unlockAudio, { once: true });
  window.addEventListener('touchstart', unlockAudio, { once: true });

  // Active dragging pet
  let activePet = null;

  // === Drag controls ===
  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return { x, y };
  }

  function startDrag(e) {
  // ✅ Drag allowed in EVERY mode except shower and garden
  if (window._modeName === "shower") return;
  if (window._gardenMode) return;

  const p = getPos(e);

  // Pick top-most pet under pointer
  for (let i = pets.length - 1; i >= 0; i--) {
    const pet = pets[i];
    if (hitPet(pet, i, p)) {
      pet.dragging = true;
      activePet = pet;
      // Remember WHERE on the body we grabbed (in the pet's own un-tilted space)
      // so it hangs from that spot instead of snapping its centre to the pointer.
      const dx = p.x - pet.x, dy = p.y - pet.y;
      const c = Math.cos(-pet.angle), sn = Math.sin(-pet.angle);
      pet.grabX = dx * c - dy * sn;
      pet.grabY = dx * sn + dy * c;
      pet.vx = pet.vy = 0;
      pet.hist = [{ x: p.x, y: p.y, t: performance.now() }];
      pet.pointer = p;
      // Ragdoll: the skeleton picks up the joint nearest the pointer, so a pet
      // grabbed by its hand hangs by that hand.
      if (isRag(pet, i) && pet.body.parts) {
        pet.angle = 0; pet.angVel = 0; pet.squash = 0;
        pet.grabX = p.x - pet.x; pet.grabY = p.y - pet.y;
        pet.body.grab(p.x, p.y);
      }
      if (typeof window.setActivePet === 'function') window.setActivePet(i);
      e.preventDefault();
      break;
    }
  }
}

  function moveDrag(e) {
    if (!activePet || !activePet.dragging) return;
    const p = getPos(e);
    activePet.pointer = p;
    const now = performance.now();
    activePet.hist.push({ x: p.x, y: p.y, t: now });
    while (activePet.hist.length > 2 && now - activePet.hist[0].t > 200) activePet.hist.shift();
    if (e.touches) e.preventDefault();
  }

  function playImpactSound(volume = 0.6) {
    if (!audioUnlocked) return;
    try {
      landSound.volume = volume;
      landSound.currentTime = 0;
      landSound.play().catch(() => {});
    } catch (_) {}
  }

  function endDrag() {
    if (activePet && activePet.dragging) {
      // Throw: use the pointer's average velocity over the last few ms.
      const pet = activePet;
      const now = performance.now();
      const h = pet.hist.filter(s => now - s.t <= THROW_WINDOW);
      let tvx = 0, tvy = 0;
      if (h.length >= 2) {
        const a = h[0], b = h[h.length - 1];
        const dt = Math.max(8, b.t - a.t) / 16.667;   // in 60fps frames
        tvx = (b.x - a.x) / dt;
        tvy = (b.y - a.y) / dt;
      }
      // Held still before letting go = just drop it.
      if (now - (pet.hist[pet.hist.length - 1] || { t: 0 }).t > 80) { tvx = 0; tvy = 0; }
      pet.vx = clamp(tvx, -MAX_SPEED, MAX_SPEED);
      pet.vy = clamp(tvy, -MAX_SPEED, MAX_SPEED);
      pet.angVel = clamp(pet.vx * 0.006, -0.12, 0.12);
      pet.hist = [];
      pet.pointer = null;
      if (pet.body) pet.body.release();
    }
    if (activePet) {
      // Playing with pet boosts happiness
      const petIdx = pets.indexOf(activePet);
      if (petIdx >= 0 && window.PetStats) {
        window.PetStats.play(petIdx);
        window.PetStats.shyUp(petIdx, 8);   // being picked up / petted
      }
      activePet.dragging = false;
    }
    activePet = null;
  }

  // The drag starts on the canvas, but follows the pointer (and is let go)
  // anywhere on the page: over the stats boxes, the buttons, or outside the window.
  const listeners = [
    [canvas, 'mousedown', startDrag],
    [canvas, 'touchstart', startDrag],
    [window, 'mousemove', moveDrag],
    [window, 'mouseup', endDrag],
    [window, 'touchmove', moveDrag],
    [window, 'touchend', endDrag],
    [window, 'touchcancel', endDrag],
    [window, 'blur', endDrag],
  ];
  listeners.forEach(([el, ev, fn]) =>
    el.addEventListener(ev, fn, { passive: false })
  );

  // === Resize ===
  function onResize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    syncGround();
  }
  // canvas_fix.js resizes the canvas on its own (after coming back from the
  // share sheet / another app, the window size settles late and no 'resize'
  // reaches this mode), so the ground is re-read from the canvas every frame.
  function syncGround() {
    const gy = canvas.height - groundHeight;
    if (gy === groundY) return;
    groundY = gy;

    // keep pets in bounds
    pets.forEach(p => {
      p.x = Math.max(p.w / 2, Math.min(p.x, canvas.width - p.w / 2));
      if (p.y + p.h / 2 > groundY) {
        p.y = groundY - p.h / 2;
        p.oldy = p.y;
        p.vy = 0;
      }
    });
  }
  window.addEventListener('resize', onResize);

  // === Update ===
  let lastT = performance.now();
  function update() {
    syncGround();
    const now = performance.now();
    // dt in "60fps frames", capped so a background-tab hiccup can't launch pets.
    const dt = clamp((now - lastT) / 16.667, 0.25, 2.5);
    lastT = now;

    for (let i = 0; i < pets.length; i++) {
      const pet = pets[i];
      const halfW = Math.min(pet.w / 2, canvas.width / 2);
      const halfH = pet.h / 2;
      const rag = isRag(pet, i);
      if (rag) buildBody(pet, i);

      if (pet.dragging && rag && pet.body.parts) {
        // Ragdoll held: the box sticks to the pointer and the body hangs from
        // the grabbed joint (the skeleton does the swinging).
        const p = pet.pointer;
        if (p) {
          // Free: the grabbed spot stays exactly under the pointer, wherever it goes.
          const nx = p.x - pet.grabX;
          const ny = p.y - pet.grabY;
          pet.vx = (nx - pet.x) / dt;
          pet.vy = (ny - pet.y) / dt;
          pet.x = nx; pet.y = ny;
        }
        pet.angle = 0; pet.angVel = 0; pet.squash = 0;
        pet.onGround = false;
        pet.oldx = pet.x; pet.oldy = pet.y;
        syncBody(pet, i, dt / 60);
        continue;
      }

      if (pet.dragging) {
        // Held: hang from the grab point, chasing the pointer smoothly.
        const p = pet.pointer;
        if (p) {
          const c = Math.cos(pet.angle), sn = Math.sin(pet.angle);
          const tx = p.x - (pet.grabX * c - pet.grabY * sn);
          const ty = p.y - (pet.grabX * sn + pet.grabY * c);
          const k = 1 - Math.pow(1 - FOLLOW, dt);
          const nx = pet.x + (tx - pet.x) * k;
          const ny = pet.y + (ty - pet.y) * k;
          pet.vx = (nx - pet.x) / dt;
          pet.vy = (ny - pet.y) / dt;
          pet.x = nx;
          pet.y = ny;
        }
        // Swing like it's hanging: lean against the motion, plus a bit for
        // being grabbed off-centre, with a springy, damped return.
        const lean = clamp(-pet.vx * 0.018 + (pet.grabX / pet.w) * 0.25, -MAX_TILT, MAX_TILT);
        pet.angVel += (lean - pet.angle) * 0.12 * dt;
        pet.angVel *= Math.pow(0.86, dt);
        pet.angle = clamp(pet.angle + pet.angVel * dt, -MAX_TILT, MAX_TILT);
        pet.squash *= Math.pow(0.8, dt);
        pet.onGround = false;
        pet.oldx = pet.x;
        pet.oldy = pet.y;
        continue;
      }

      const bottomBefore = pet.y + halfH;
      const grounded = bottomBefore >= groundY - 0.5;

      // --- forces ---
      pet.vy += gravity * dt;
      const drag = Math.pow(airDrag, dt);
      pet.vx *= drag;
      pet.vy *= drag;
      pet.vx = clamp(pet.vx, -MAX_SPEED, MAX_SPEED);
      pet.vy = clamp(pet.vy, -MAX_SPEED, MAX_SPEED);

      // --- integrate ---
      pet.x += pet.vx * dt;
      pet.y += pet.vy * dt;
      pet.angle += pet.angVel * dt;

      // --- walls + ceiling ---
      // Measured on what you actually see: the skeleton for a ragdoll (a pet
      // thrown by its foot can hit the top head-first), else the sprite box.
      let left = pet.x - halfW, right = pet.x + halfW, top = pet.y - halfH;
      const ragDrawn = rag && pet.body.parts;
      if (ragDrawn) { const e = bodyExtent(pet); left = e.x0; right = e.x1; top = e.y0; }
      // A ragdoll released past an edge is eased back; snapping the box would
      // fling its limbs.
      const push = ragDrawn ? EDGE_PUSH * dt : Infinity;
      if (left < 0) {
        pet.x += Math.min(-left, push);
        if (pet.vx < 0) { pet.vx = -pet.vx * wallRestitution; pet.angVel += 0.03; }
      } else if (right > canvas.width) {
        pet.x -= Math.min(right - canvas.width, push);
        if (pet.vx > 0) { pet.vx = -pet.vx * wallRestitution; pet.angVel -= 0.03; }
      }
      if (top < 0) {
        pet.y += Math.min(-top, push);
        if (pet.vy < 0) {
          const hit = -pet.vy;
          pet.vy = hit * ceilingRestitution;
          if (hit > MIN_IMPACT) {
            playImpactSound(clamp(0.15 + hit / 40, 0.15, 1));
            pet.angVel += clamp(-pet.vx * 0.004, -0.08, 0.08);   // knocked into a spin
          }
        }
      }

      // --- floor ---
      pet.onGround = false;
      if (pet.y + halfH >= groundY) {
        const impact = pet.vy;
        const sink = pet.y + halfH - groundY;
        pet.y = sink > EDGE_PUSH * dt && ragDrawn ? pet.y - EDGE_PUSH * dt : groundY - halfH;
        if (impact > REST_SPEED) {
          pet.vy = -impact * restitution;
          if (pet.vy > -REST_SPEED) pet.vy = 0;   // too weak to bounce again
          if (impact > MIN_IMPACT) {
            if (!grounded) playImpactSound(clamp(0.15 + impact / 40, 0.15, 1));
            // The ragdoll's limbs, head and chest are thrown down by the hit.
            if (rag && pet.body.parts) pet.body.impact((impact * 60) / (1800 * pet.h / 250));
            pet.squash = Math.max(pet.squash, clamp(impact / 200, 0.03, MAX_SQUASH));
            // Landing off-balance makes it wobble.
            pet.angVel += clamp(pet.vx * 0.004, -0.08, 0.08);
          }
        } else {
          pet.vy = 0;
        }
        pet.onGround = true;
      }

      if (pet.onGround) {
        // Friction slows a slide to a stop instead of gliding forever.
        pet.vx *= Math.pow(groundFriction, dt);
        if (Math.abs(pet.vx) < 0.05) pet.vx = 0;
        // Pull back upright, springy and damped, so it settles with a wobble.
        pet.angVel += -pet.angle * 0.14 * dt;
        pet.angVel *= Math.pow(0.82, dt);
      } else {
        // Tumbling in the air slowly loses spin.
        pet.angVel *= Math.pow(0.985, dt);
        // ...and drifts toward upright so it never stays sideways forever.
        pet.angVel += -pet.angle * 0.004 * dt;
      }
      pet.angle = clamp(pet.angle, -MAX_TILT, MAX_TILT);
      if (Math.abs(pet.angle) < 0.001 && Math.abs(pet.angVel) < 0.001) { pet.angle = 0; pet.angVel = 0; }

      // Squash springs back.
      pet.squash *= Math.pow(0.82, dt);
      if (pet.squash < 0.002) pet.squash = 0;

      if (rag && pet.body.parts) {
        // The skeleton does the tumbling and the landing squash itself.
        pet.angle = 0; pet.angVel = 0; pet.squash = 0;
        syncBody(pet, i, dt / 60);
      }

      pet.oldx = pet.x;
      pet.oldy = pet.y;
    }
  }

  // === Draw ===
  function drawGround() {
    ctx.fillStyle = '#5c4033';
    ctx.fillRect(0, groundY, canvas.width, groundHeight);
  }

  function getState(pet) {
    let state = 'stand';

    if (pet.y + pet.h / 2 < groundY) {
      if (pet.vy > 8) {
        state = 'fall';
      } else {
        pet.timer++;
        if (pet.timer > speed) {
          pet.timer = 0;
          pet.frame = (pet.frame + 1) % 2;
        }
        state = pet.frame ? 'fly1' : 'fly0';
      }
    }

    return state;
  }

  function drawPet() {
    pets.forEach((pet, i) => {
      const state = getState(pet);

      // choose base set
      let set = headSets[i] || headSets[0];
      let img = set[state];
      let useTintFallback = false;
      if (!img || img._failed) {
        set = headSets[0];
        img = set[state];
        useTintFallback = (i !== 0);
      }

      // Toy3-style: while a toy is touching this pet, swap to the toy-touched
      // base and hold it until the toy leaves. Falls back to the normal base
      // image when the alternate art is missing (so behavior degrades cleanly).
      if (pet._toyActive) {
        let toyImg = set.toy;
        if (!toyImg || toyImg._failed) {
          toyImg = headSets[0].toy;
          if (toyImg && !toyImg._failed && i !== 0) useTintFallback = true;
        }
        if (toyImg && !toyImg._failed) img = toyImg;
      }

      if (window.PetFace && window.PetFace.shyImg && !pet._toyActive) img = window.PetFace.shyImg(img, i);

      if (isRag(pet, i) && pet.body && pet.body.parts) {
        ctx.save();
        if (pet.tintArt) ctx.filter = pet.drawFilter;
        pet.body.draw(ctx, 0, 0, hdDpr());
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.filter = useTintFallback ? pet.drawFilter : 'none';

      // Tilt about the centre, then squash/stretch anchored at the feet.
      const sq = pet.squash || 0;
      if (pet.angle || sq) {
        ctx.translate(pet.x, pet.y);
        ctx.rotate(pet.angle);
        ctx.translate(0, pet.h / 2);
        ctx.scale(1 + sq * 0.6, 1 - sq);
        ctx.translate(0, -pet.h / 2);
        ctx.translate(-pet.x, -pet.y);
      }

      // Back pieces (behind the body)
      if (typeof window.drawOutfitBehind === 'function') window.drawOutfitBehind(ctx, state, pet.x - pet.w / 2, pet.y - pet.h / 2, pet.w, pet.h, i);

      // Head (naked)
      safeDraw(img, pet.x - pet.w / 2, pet.y - pet.h / 2, pet.w, pet.h);

      // Outfit overlay (per pet)
      if (typeof window.drawOutfitOverlay === 'function') {
        window.drawOutfitOverlay(
          ctx,
          state,
          pet.x - pet.w / 2,
          pet.y - pet.h / 2,
          pet.w,
          pet.h,
          i
        );
      }

      ctx.restore();
    });
  }

  // === Toy hook ===
  // Analog of Toy3's setGenital(num, on): toggles a pet's base image to the
  // toy-touched state while a toy overlaps it, and reverts when the toy leaves.
  window.setPetToyState = function (index, on) {
    const pet = pets[index];
    if (pet) pet._toyActive = !!on;
  };

  // === Pose broadcast ===
  window.getPetPose = function () {
    return {
      pets: pets.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h })),
      activePetIndex: (typeof window.activePetIndex === 'number') ? window.activePetIndex : 0,
      groundY,
      canvasRect: canvas.getBoundingClientRect(),
    };
  };

  // === Loop ===
  let raf = 0;
  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    update();
    drawGround();
    drawPet();

    try {
      const pose = {
        pets: pets.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h })),
        activePetIndex: (typeof window.activePetIndex === 'number') ? window.activePetIndex : 0,
      };
      window.dispatchEvent(new CustomEvent('pet:pose', { detail: pose }));
    } catch (_) {}

    raf = requestAnimationFrame(loop);
  }
  loop();

  // === Cleanup ===
  window._modeCleanup = function () {
    alive = false;
    cancelAnimationFrame(raf);
    listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
    window.removeEventListener('resize', onResize);
  };
  window._modeName = 'normal';
})();