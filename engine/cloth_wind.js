// ===========================================================
// 💨 cloth_wind.js — cloth in the wind: skirts, dresses, sleeves, capes
// ===========================================================
// The blower (trolling mode) calls ClothWind.set(pet, strength, dir). The
// outfit system hands every garment picture to ClothWind.draw(), which bends
// it in code — no extra "blown" art is needed. When nothing is moving, draw()
// returns false and the caller draws the picture normally.
//
// HOW IT WORKS
//   A garment is its STILL picture plus MOVING PIECES. A piece is a part of the
//   picture (a box, as fractions 0..1 of the image) that is cut into thin strips
//   hanging from a pinned edge. The strips are a chain of springs + dampers
//   (one solver, stepChain, for every kind of piece), pushed by:
//     - the blower: strength 0..1, gusts running down the cloth, and dir
//       (-1..1, which side of the pet the blower is on);
//     - the pet's own movement: walking swings the cloth, falling billows it.
//   So the cloth lags, overshoots and settles instead of playing an animation.
//   The picture sets the physics: each strip bends around its own centre and
//   width as drawn, and a longer piece swings slower (like a pendulum).
//
// PIECE KINDS
//   "skirt"  hangs from its top edge: the hem flares wide, lifts and ripples.
//            Styles: "flow" (soft billow, default) and "lift" (umbrella).
//   "flap"   pinned on one side edge (a sleeve, cuff, cape tip): the free end
//            opens, rises and flutters in a wave.
//
// CONFIG  (OUTFIT_CONFIG.windStyle in outfit_config.js, one entry per item id)
//   "lift"                          just a style name, or
//   {
//     style:  "flow" | "lift",      the front skirt piece (default "flow")
//     region: { left, right, top, bottom, hide? },
//                                   only this box moves (omit = the whole
//                                   garment below the waist). hide = a box that
//                                   fades away while the skirt is blown up.
//     tune:   { flare, lift, speed, ripple, ... }   override the style
//     back:   true | { style, region, tune }
//                                   make the "<name>_back.png" piece move too
//                                   (omit = it stays still). With no region
//                                   the whole back piece moves.
//     parts:  [ { kind, region, on, pin, dir, style, tune } ]
//                                   extra pieces: sleeves, side veils, a cape.
//                                   on: "front" (default) | "back" | "both"
//                                   pin ("flap"): "right" | "left" = the edge
//                                   that stays fixed; dir ("skirt"): -1 | 1
//                                   pushes the piece outward from the body.
//   }
//
// Tuning numbers live in PRESETS (poses) and PHYS (how the cloth moves).
// ===========================================================
(() => {
  "use strict";

  // ---- Tuning ---------------------------------------------------------------
  const PRESETS = {
    flow: { flare: 0.45, lift: 0.30, from: 0,    curve: 0,    ripple: 0.03,  cell: 0 },
    lift: { flare: 1.15, lift: 0.33, from: 0.60, curve: 0.12, ripple: 0.012, cell: 4 },
    // lift = how far the free end rises (fraction of picture height), open =
    // how much the sleeve widens at the free end.
    flap: { lift: 0.035, open: 0.38, ripple: 0.02, flutter: 1 },
  };
  const PHYS = {
    omega: 9,          // swing speed (rad/s) of a piece about refLength long
    refLength: 0.17,   // that length, as a fraction of the picture height
    zeta: 0.45,        // damping: lower = bouncier, higher = settles faster
    hemSoft: 0.55,     // how much looser the free end is than the pinned end
    couple: 0.35,      // how strongly neighbouring strips pull on each other
    gust: 0.14,        // gusts change the blown pose by this much
    gustSpeed: 5.5,    // gust speed
    sway: 0.03,        // sideways gust sway (fraction of the width)
    push: 0.05,        // sideways push away from the blower (fraction of the width)
    motionSway: 0.06,  // sideways lag when the pet moves
    motionLift: 0.07,  // billow when the pet falls
    dressWaist: 0.40,  // a dress with no region: its top 40% stays still
    skirtRows: 24,     // simulated strips per skirt piece
    flapRows: 14,      // ... per flap piece
    strip: 2,          // drawn strip size in source pixels
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth01 = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  function sample(a, f) {                       // a[] read at 0..1, interpolated
    const p = f * a.length - 0.5;
    if (p <= 0) return a[0];
    const i = Math.floor(p);
    if (i >= a.length - 1) return a[a.length - 1];
    const t = p - i;
    return a[i] * (1 - t) + a[i + 1] * t;
  }

  // ---- 1. Config --------------------------------------------------------------
  const pieceCache = new Map();

  function preset(style, tune, fallback) {
    return Object.assign({}, PRESETS[PRESETS[style] ? style : fallback], tune || {});
  }
  const skirtStyle = s => (s === "lift" ? "lift" : "flow");

  // The moving pieces of an item: { front: [...], back: [...] }. A piece is
  // { name, kind, cfg, region, main, pin, dir }. "main" pieces (the skirt
  // itself) only move on skirt-like garments; extra parts always move.
  function piecesOf(id) {
    const map = (window.OUTFIT_CONFIG && window.OUTFIT_CONFIG.windStyle) || {};
    const raw = map[id] !== undefined ? map[id] : map.default;
    const hit = pieceCache.get(id);
    if (hit && hit.src === raw) return hit.out;

    const o = (raw && typeof raw === "object") ? raw : { style: raw };
    const style = skirtStyle(o.style);
    const out = {
      front: [{ name: "skirt", kind: "skirt", main: true, cfg: preset(style, o.tune), region: o.region || null }],
      back: [],
    };
    if (o.back) {
      const b = o.back === true ? {} : o.back;
      out.back.push({ name: "skirt", kind: "skirt", main: true,
        cfg: preset(b.style ? skirtStyle(b.style) : style, b.tune), region: b.region || null });
    }
    (Array.isArray(o.parts) ? o.parts : []).forEach((pt, i) => {
      if (!pt || !pt.region) return;
      const kind = pt.kind === "skirt" ? "skirt" : "flap";
      const piece = {
        name: "p" + i, kind, main: false, region: pt.region,
        cfg: preset(pt.style, pt.tune, kind === "skirt" ? "flow" : "flap"),
        pin: pt.pin === "left" ? "left" : "right",
        dir: pt.dir ? Math.sign(pt.dir) : 0,
      };
      if (pt.on !== "back") out.front.push(piece);
      if (pt.on === "back" || pt.on === "both") out.back.push(piece);
    });
    pieceCache.set(id, { src: raw, out });
    return out;
  }

  // ---- 2. Reading the picture: where the cloth actually is --------------------
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

  // The cloth's shape inside a box (source pixels), smoothed. axis "y": one
  // entry per row -> where the cloth's centre / half-width are along x (so a
  // skirt row bends around its own middle). axis "x": one entry per column ->
  // the centre along y (so a sleeve opens around its own middle).
  function profile(image, box, axis) {
    const key = `${axis}|${box.left}|${box.right}|${box.top}|${box.bottom}`;
    const cache = image._profiles || (image._profiles = {});
    if (cache[key] !== undefined) return cache[key];
    let out = null;
    const a = alphaOf(image);
    if (a) {
      const nw = image.naturalWidth;
      const rows = axis === "y";
      const u0 = Math.floor(rows ? box.top : box.left), u1 = Math.ceil(rows ? box.bottom : box.right);
      const v0 = Math.floor(rows ? box.left : box.top), v1 = Math.ceil(rows ? box.right : box.bottom);
      const n = u1 - u0;
      const lo = new Float32Array(n), hi = new Float32Array(n);
      let any = false;
      for (let u = 0; u < n; u++) {
        let l = -1, r = -1;
        for (let v = v0; v < v1; v++) {
          if (a[rows ? (u0 + u) * nw + v : v * nw + (u0 + u)] > 16) { if (l < 0) l = v; r = v + 1; }
        }
        lo[u] = l; hi[u] = r;
        if (l >= 0) any = true;
      }
      if (any) {
        let last = -1;                                   // fill empty entries from neighbours
        for (let u = 0; u < n; u++) {
          if (lo[u] >= 0) last = u;
          else if (last >= 0) { lo[u] = lo[last]; hi[u] = hi[last]; }
        }
        last = -1;
        for (let u = n - 1; u >= 0; u--) {
          if (lo[u] >= 0) last = u;
          else if (last >= 0) { lo[u] = lo[last]; hi[u] = hi[last]; }
        }
        const mid = new Float32Array(n), half = new Float32Array(n);
        const R = rows ? 5 : 3;
        for (let u = 0; u < n; u++) {
          let sm = 0, sh = 0, c = 0;
          for (let j = Math.max(0, u - R); j <= Math.min(n - 1, u + R); j++) {
            sm += (lo[j] + hi[j]) / 2; sh += (hi[j] - lo[j]) / 2; c++;
          }
          mid[u] = sm / c; half[u] = sh / c;
        }
        out = { u0, n, mid, half };
      }
    }
    cache[key] = out;
    return out;
  }

  // ---- 3. The cloth simulation ------------------------------------------------
  // A chain of n strips from the pinned end (0) to the free end (1). Each
  // strip has one value per channel (skirt: flare, lift, sway; flap: lift,
  // open) and each value is a spring + damper pulled toward the target eq()
  // gives it, and toward its neighbours.
  const sims = new Map();     // one chain per pet + garment + piece
  const motion = {};          // each pet's recent movement

  function makeChain(n, channels) {
    const mk = () => Array.from({ length: channels }, () => new Float32Array(n));
    return { n, x: mk(), v: mk(), t: 0, rest: true };
  }

  // spec: { lo[], hi[], weight[] } = value limits and how much each channel
  // counts when deciding the cloth has come to rest.
  function stepChain(sim, now, omega, spec, eq) {
    let dt = sim.t ? (now - sim.t) / 1000 : 0;
    sim.t = now;
    if (dt <= 0) return;
    dt = Math.min(dt, 0.05);
    const steps = Math.max(1, Math.ceil(dt * 90)), h = dt / steps;
    const { n, x, v } = sim, C = x.length;
    const w2 = omega * omega, damp = 2 * PHYS.zeta * omega, kc = PHYS.couple * w2;
    const out = new Array(C).fill(0);
    for (let st = 0; st < steps; st++) {
      const tt = now / 1000 - dt + (st + 1) * h;
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        eq(i, f, tt, out);
        const k = w2 * (1 - PHYS.hemSoft * f);
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        for (let c = 0; c < C; c++) {
          const xc = x[c], vc = v[c];
          vc[i] += (-k * (xc[i] - out[c]) - damp * vc[i] + kc * ((xc[a] + xc[b]) / 2 - xc[i])) * h;
        }
      }
      for (let c = 0; c < C; c++) {
        for (let i = 0; i < n; i++) x[c][i] = clamp(x[c][i] + v[c][i] * h, spec.lo[c], spec.hi[c]);
      }
    }
    let energy = 0;
    for (let c = 0; c < C; c++) {
      for (let i = 0; i < n; i++) {
        energy = Math.max(energy, Math.abs(x[c][i]) * spec.weight[c], Math.abs(v[c][i]) * spec.weight[c] * 0.1);
      }
    }
    sim.rest = energy < 0.004 && !sim.driven;
    if (sim.rest) for (let c = 0; c < C; c++) { x[c].fill(0); v[c].fill(0); }
  }

  const SKIRT = { lo: [-0.3, -0.12, -0.2], hi: [2.4, 0.44, 0.2], weight: [1, 1, 3] };   // flare, lift, sway
  const FLAP  = { lo: [-0.05, -0.3],      hi: [0.2, 1.2],        weight: [20, 1] };      // lift, open

  // Gusts: a few waves of different speeds running down the cloth. 1 = calm.
  function gustAt(tt, f, amp) {
    const g = PHYS.gustSpeed;
    return 1 + amp * (0.5 * Math.sin(tt * g - f * 4) + 0.3 * Math.sin(tt * g * 1.7 + f * 2 + 1.3)
      + 0.2 * Math.sin(tt * g * 2.9 - f * 1.5 + 0.4));
  }

  // How the pet is moving right now, in pet-widths per second. Computed once
  // per frame per pet (the behind pass and the front pass share it).
  function motionOf(pet, x, y, w, now) {
    let m = motion[pet];
    if (!m) { m = motion[pet] = { x, y, t: now, vx: 0, fall: 0 }; return m; }
    const dt = (now - m.t) / 1000;
    if (dt > 0.004) {
      if (dt < 0.25 && w > 0) {
        const a = 1 - Math.exp(-dt * 12);
        m.vx += (clamp((x - m.x) / dt / w, -3, 3) - m.vx) * a;
        m.fall += (clamp((y - m.y) / dt / w, 0, 3) - m.fall) * a;
      } else { m.vx = 0; m.fall = 0; }
      m.x = x; m.y = y; m.t = now;
    }
    return m;
  }

  // ---- 4. Pieces: step the simulation, then paint ----------------------------
  // fr = this frame's shared state: { now, mo, quiet, s (strength), dir }.
  // prep* return null when the piece is at rest (nothing to move).

  function chainFor(key, n, channels, fr) {
    let sim = sims.get(key);
    if (!sim) {
      if (!fr.s && fr.quiet) return null;
      sim = makeChain(n, channels);
      sims.set(key, sim);
    }
    if (!fr.s && fr.quiet && sim.rest) return null;
    sim.driven = fr.s > 0 || !fr.quiet;
    return sim;
  }

  const omegaFor = (len, nh, speed, max) =>
    clamp(PHYS.omega * Math.sqrt(PHYS.refLength / (len / nh)), 4, max) * (speed || 1);

  function prepSkirt(image, pc, key, fr) {
    const nw = image.naturalWidth, nh = image.naturalHeight, r = pc.region;
    let box, startY;
    if (r) {
      box = { left: r.left * nw, right: r.right * nw, top: r.top * nh, bottom: r.bottom * nh };
      startY = box.top;
    } else {
      box = opaqueBounds(image);
      if (!box) return null;
      startY = box.top + (box.bottom - box.top) * (pc.dressLike ? PHYS.dressWaist : 0);
    }
    const len = box.bottom - startY;
    if (len < 4) return null;
    const sim = chainFor(key, PHYS.skirtRows, 3, fr);
    if (!sim) return null;

    const cfg = pc.cfg, s = fr.s, mo = fr.mo;
    stepChain(sim, fr.now, omegaFor(len, nh, cfg.speed, 14), SKIRT, (i, f, tt, o) => {
      const e = cfg.from > 0 ? smooth01((f - cfg.from) / (1 - cfg.from)) : Math.pow(f, 1.3);
      const gust = gustAt(tt, f, PHYS.gust);
      o[0] = s * cfg.flare * e * gust + mo.fall * 0.3 * e;                      // flare
      o[1] = s * cfg.lift * f * f * gust + mo.fall * PHYS.motionLift * f * f;   // lift
      o[2] = s * PHYS.sway * f * Math.sin(tt * PHYS.gustSpeed * 0.8 - f * 3.2)  // sway
        - mo.vx * PHYS.motionSway * f - fr.dir * s * PHYS.push * f;
    });
    if (sim.rest) return null;
    const rows = profile(image, { left: box.left, right: box.right, top: startY, bottom: box.bottom }, "y");
    return rows ? { pc, box, sim, prof: rows, startY, len, nw, nh } : null;
  }

  function prepFlap(image, pc, key, fr) {
    const nw = image.naturalWidth, nh = image.naturalHeight, r = pc.region;
    const box = { left: r.left * nw, right: r.right * nw, top: r.top * nh, bottom: r.bottom * nh };
    const len = box.right - box.left;
    if (len < 4 || box.bottom - box.top < 4) return null;
    const sim = chainFor(key, PHYS.flapRows, 2, fr);
    if (!sim) return null;

    const cfg = pc.cfg, s = fr.s, mo = fr.mo;
    const near = 1 + 0.6 * fr.dir * (pc.pin === "right" ? -1 : 1);   // the side by the blower lifts more
    stepChain(sim, fr.now, omegaFor(len, nh, cfg.speed, 16), FLAP, (i, f, tt, o) => {
      const gust = gustAt(tt, f, PHYS.gust * 1.6);
      o[0] = s * cfg.lift * near * f * f * gust + mo.fall * PHYS.motionLift * 0.6 * f * f + Math.abs(mo.vx) * 0.004 * f;
      o[1] = s * cfg.open * Math.pow(f, 1.2) * gust;
    });
    if (sim.rest) return null;
    const cols = profile(image, box, "x");
    return cols ? { pc, box, sim, prof: cols, len, nw, nh } : null;
  }

  function paintFlap(ctx, image, x, y, w, h, st, now) {
    const { pc, box, sim, prof, len, nw, nh } = st;
    const cfg = pc.cfg, kx = w / nw, ky = h / nh;
    const top = box.top, hgt = box.bottom - box.top;
    const step = PHYS.strip + 1, openMax = Math.max(cfg.open, 0.01);
    const [up, open] = sim.x;
    const fl = cfg.flutter || 1;
    for (let sx = box.left; sx < box.right; sx += step) {
      const sw = Math.min(step, box.right - sx);
      const mid = sx + sw / 2;
      const t = clamp(pc.pin === "right" ? (box.right - mid) / len : (mid - box.left) / len, 0, 1);
      const opn = sample(open, t);
      const wave = cfg.ripple * clamp(opn / openMax, 0, 1.2) * t * Math.sin(t * 11 * fl - now * 0.014 * fl);
      const cy = prof.mid[clamp(Math.floor(mid) - prof.u0, 0, prof.n - 1)];
      const scale = Math.max(0.2, 1 + opn);
      const dy = y + (cy + (top - cy) * scale) * ky - (sample(up, t) + wave) * h;
      ctx.drawImage(image, sx, top, sw, hgt, x + sx * kx, dy, sw * kx + 0.6, hgt * ky * scale);
    }
  }

  function paintSkirt(ctx, image, x, y, w, h, st, now) {
    const { pc, box, sim, prof, startY, len, nw, nh } = st;
    const cfg = pc.cfg, kx = w / nw, ky = h / nh;
    const [flareA, upA, swayA] = sim.x;
    const cell = cfg.cell || 0;
    const posY = f => y + (startY + len * (f - sample(upA, f))) * ky;
    let prev = -1e9;
    let sy = startY;
    while (sy < box.bottom) {
      // Strips that are not curling are drawn whole (cheap); only the curling
      // hem is drawn column by column.
      const ef = clamp(sample(flareA, (sy - startY) / len) / Math.max(cfg.flare, 0.01), 0, 1.2);
      const curl = cell > 0 && ef > 0.03;
      const step = curl ? PHYS.strip + 1 : PHYS.strip;
      const sh = Math.min(step, box.bottom - sy);
      const rowStart = sy;
      sy += step;
      const f0 = (rowStart - startY) / len, f1 = (rowStart + sh - startY) / len, fm = (f0 + f1) / 2;
      const ri = clamp(Math.floor(rowStart) - prof.u0, 0, prof.n - 1);
      const ci = prof.mid[ri], hw = Math.max(1, prof.half[ri]);
      const flare = sample(flareA, fm);
      const efm = clamp(flare / Math.max(cfg.flare, 0.01), 0, 1.2);
      const scale = Math.max(0.2, 1 + flare + cfg.ripple * efm * Math.sin(fm * 16 - now * 0.013));
      // dir pushes a side panel outward so its inner edge stays by the body.
      const off = sample(swayA, fm) * w + (pc.dir ? pc.dir * Math.max(0, flare) * hw * kx : 0);
      const dy0 = Math.max(posY(f0), prev);
      const dy1 = Math.max(posY(f1), dy0 + 0.5);
      prev = dy1;
      const dh = dy1 - dy0 + 0.6;
      const baseX = x + ci * kx + off;
      if (!curl) {
        ctx.drawImage(image, box.left, rowStart, box.right - box.left, sh,
          baseX + (box.left - ci) * kx * scale, dy0, (box.right - box.left) * kx * scale, dh);
      } else {
        for (let sx = box.left; sx < box.right; sx += cell) {
          const sw = Math.min(cell, box.right - sx);
          const u = clamp((sx + sw / 2 - ci) / hw, -1.3, 1.3);
          const rise = cfg.curve * len * ky * efm * u * u;      // hem edges curl up
          ctx.drawImage(image, sx, rowStart, sw, sh,
            baseX + (sx - ci) * kx * scale, dy0 - rise, sw * kx * scale + 0.6, dh);
        }
      }
    }
  }

  // ---- 5. Public: strength per pet + draw -----------------------------------
  const wind = {};    // blower state per pet: { s: 0..1, dir: -1..1 }

  // o: { pet, id, cat, back, skirtLike }. Draws the garment through its
  // moving pieces; false = everything is at rest (draw the picture normally).
  function draw(ctx, image, x, y, w, h, o) {
    const set = piecesOf(o.id);
    const list = (o.back ? set.back : set.front).filter(pc => !pc.main || o.skirtLike);
    if (!list.length || !image.naturalWidth) return false;

    const now = performance.now();
    const mo = motionOf(o.pet, x, y, w, now);
    const ws = wind[o.pet] || { s: 0, dir: 0 };
    const fr = { now, mo, quiet: Math.abs(mo.vx) < 0.02 && mo.fall < 0.02, s: ws.s, dir: ws.dir };
    const side = o.back ? "b" : "f";
    const act = [];
    list.forEach(pc => {
      const key = `${o.pet}|${o.id}|${side}|${pc.name}`;
      const piece = Object.assign({ dressLike: o.cat === "dress" }, pc);
      const st = pc.kind === "flap" ? prepFlap(image, piece, key, fr) : prepSkirt(image, piece, key, fr);
      if (st) act.push(st);
    });
    if (!act.length) return false;

    const nw = image.naturalWidth, nh = image.naturalHeight, kx = w / nw, ky = h / nh;
    const rect = (c, b) => c.rect(x + b.left * w, y + b.top * h, (b.right - b.left) * w, (b.bottom - b.top) * h);

    // The still part: everything outside the moving boxes. A skirt with no box
    // moves from the waist down, so only the part above it is still.
    const whole = act.find(st => st.pc.kind === "skirt" && !st.pc.region);
    if (whole) {
      if (whole.startY > 0) ctx.drawImage(image, 0, 0, nw, whole.startY, x, y, w, whole.startY * ky);
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      act.forEach(st => {
        ctx.rect(x + st.box.left * kx, y + st.box.top * ky, (st.box.right - st.box.left) * kx, (st.box.bottom - st.box.top) * ky);
        if (st.pc.region && st.pc.region.hide) rect(ctx, st.pc.region.hide);
      });
      ctx.clip("evenodd");
      ctx.drawImage(image, x, y, w, h);
      ctx.restore();
    }

    act.forEach(st => {
      if (st.pc.kind === "flap") { paintFlap(ctx, image, x, y, w, h, st, now); return; }
      // A "hide" area (e.g. an underskirt that lifts away with the skirt) fades out as the skirt rises.
      const hd = st.pc.region && st.pc.region.hide;
      const blown = clamp(st.sim.x[1][st.sim.n - 1] / Math.max(st.pc.cfg.lift * 0.9, 0.05), 0, 1);
      if (hd && blown < 1) {
        ctx.save();
        ctx.beginPath();
        rect(ctx, hd);
        ctx.clip();
        ctx.globalAlpha = Math.max(0, 1 - blown * 1.6);
        ctx.drawImage(image, x, y, w, h);
        ctx.restore();
      }
      paintSkirt(ctx, image, x, y, w, h, st, now);
    });
    return true;
  }

  window.ClothWind = {
    // The blower: strength 0..1, dir -1..1 = which side of the pet it is on
    // (-1 left, 1 right; the cloth nearest the blower lifts more, the rest
    // is pushed away from it).
    set(pet, strength, dir) {
      wind[pet] = { s: clamp(strength || 0, 0, 1), dir: clamp(dir || 0, -1, 1) };
    },
    get(pet) { return wind[pet] ? wind[pet].s : 0; },
    reset() {
      Object.keys(wind).forEach(k => delete wind[k]);
      sims.clear();
      Object.keys(motion).forEach(k => delete motion[k]);
    },
    draw,
  };
})();
