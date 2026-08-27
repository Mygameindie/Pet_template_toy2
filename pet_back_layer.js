// ===========================================================
// 🪽 pet_back_layer.js — Body parts drawn BEHIND (and in front of) the pet
// ===========================================================
// The pet's base art is one flat sprite. Anything that is part of the BODY but
// sits behind it — wings, a tail, long hair, ear tufts — can't live in that
// sprite: it would be welded to the torso, and it would be destroyed the moment
// the base art is ever cut into separate limbs.
//
// So those parts move into their own image, drawn at the SAME rectangle as the
// body, immediately before it. Same rect = glued to the pet for free: every mode
// already works out where the pet is, so the back layer inherits its position,
// size, aspect ratio and pet-2 tint with no new maths.
//
//   ART (all optional — a missing file simply draws nothing):
//     images/base_back.png            default, and the fallback for every state
//     images/base_back_fly0.png       ┐ the two flap frames, used while airborne
//     images/base_back_fly1.png       ┘ (this is what makes the wing flap real)
//     images/base_back_fall.png       falling fast
//     images/base_back_toy.png        while a toy is touching the pet
//     images/base_back_sick.png       ┐ doctor mode
//     images/base_back_healed.png     ┘
//     images/base_back_sleep.png      asleep in bed
//     images/base_back_bath1.png      ┐ shower mode
//     images/base_back_bath2.png      ┘
//
//   Character 2 uses the same names with "_2" on the end
//   (base_back_2.png, base_back_fly0_2.png, ...). If his art is missing we fall
//   back to character 1's and tint it, exactly like the body already does.
//
//   images/base_front_*.png is the same list for parts that must sit OVER the
//   body and its clothes — a near wing, a front fringe of hair.
//
// Nothing here is configured. A part exists if its PNG loads, the same way a
// missing hat quietly hides character 2's Hat tab. With no art at all, every
// mode draws exactly what it drew before this file existed.
(function () {
  const BACK_PREFIX = 'base_back';
  const FRONT_PREFIX = 'base_front';

  // Matches the tint the modes apply when character 2's art is missing.
  const FALLBACK_FILTER = 'hue-rotate(140deg) saturate(1.2)';

  function createImg(src) {
    const im = new Image();
    im._failed = false;
    im.onerror = () => { im._failed = true; };
    im.src = src; // asset_path_fix.js rewrites this to images/<name>
    return im;
  }

  // Images are created once, on first request, and kept. No fetch, no JSON —
  // the same "can't glitch mid-game" rule the outfit config is built on.
  const cache = new Map();
  function get(name) {
    if (!cache.has(name)) cache.set(name, createImg(name + '.png'));
    return cache.get(name);
  }

  function usable(im) {
    return !!(im && !im._failed && im.complete && im.naturalWidth);
  }

  // Try, in order: this pet's art for this state, this pet's default art, then
  // (for pet 2) character 1's equivalents, which the caller — or we — will tint.
  function resolve(prefix, state, petIndex) {
    const suffix = petIndex === 1 ? '_2' : '';
    const own = [];
    const shared = [];

    if (state) own.push(`${prefix}_${state}${suffix}`);
    own.push(`${prefix}${suffix}`);
    if (suffix) {
      if (state) shared.push(`${prefix}_${state}`);
      shared.push(prefix);
    }

    for (const name of own) {
      const im = get(name);
      if (usable(im)) return { img: im, fellBack: false };
    }
    for (const name of shared) {
      const im = get(name);
      if (usable(im)) return { img: im, fellBack: true };
    }
    return null;
  }

  function drawLayer(ctx, prefix, state, x, y, w, h, petIndex) {
    const found = resolve(prefix, state, petIndex);
    if (!found) return false;

    // If we dropped back to character 1's art, tint it so it matches his body.
    // When the caller is already tinting (because the BODY fell back too) its
    // filter is on the context and does the job — don't apply it twice.
    const callerIsTinting = !!ctx.filter && ctx.filter !== 'none';
    if (found.fellBack && !callerIsTinting) {
      ctx.save();
      ctx.filter = FALLBACK_FILTER;
      ctx.drawImage(found.img, x, y, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(found.img, x, y, w, h);
    }
    return true;
  }

  // Where the body's own back parts sit among the back-layer clothes. Default 0
  // puts them behind every garment — a cape hangs over the wings. Raise it above
  // a category's z to bring the wings out in front of that garment instead.
  function backLayerZ() {
    const z = window.OUTFIT_CONFIG && window.OUTFIT_CONFIG.backLayerZ;
    return Number.isFinite(Number(z)) ? Number(z) : 0;
  }

  function backClothes(ctx, state, x, y, w, h, i, range) {
    if (typeof window.drawOutfitOverlay !== 'function') return false;
    return window.drawOutfitOverlay(ctx, state, x, y, w, h, i,
      Object.assign({ layer: 'back' }, range));
  }

  // ---- Public API -----------------------------------------------------------
  // Signature deliberately mirrors window.drawOutfitOverlay so every mode's call
  // site is a single line, inserted just before it draws the body.
  //
  // Draw order here: back clothes under the wings → the wings/tail themselves →
  // back clothes over the wings. The body and its front clothes follow, drawn by
  // the mode itself.
  window.drawPetBackLayer = function (ctx, state, x, y, w, h, petIndex) {
    const i = typeof petIndex === 'number' ? petIndex : 0;
    const z = backLayerZ();
    let drew = false;

    if (backClothes(ctx, state, x, y, w, h, i, { zMax: z })) drew = true;

    // A coat that swallows the wings, or a bodysuit over a tail, hides them.
    const hidden = typeof window.outfitHidesBack === 'function' && window.outfitHidesBack(i);
    if (!hidden && drawLayer(ctx, BACK_PREFIX, state, x, y, w, h, i)) drew = true;

    if (backClothes(ctx, state, x, y, w, h, i, { zMin: z })) drew = true;

    return drew;
  };

  // Parts that belong over the body AND over its clothes. Call after the mode's
  // drawOutfitOverlay. Purely optional — with no base_front_* art it does nothing.
  window.drawPetFrontLayer = function (ctx, state, x, y, w, h, petIndex) {
    const i = typeof petIndex === 'number' ? petIndex : 0;
    return drawLayer(ctx, FRONT_PREFIX, state, x, y, w, h, i);
  };
})();
