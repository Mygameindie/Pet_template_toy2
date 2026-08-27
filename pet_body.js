// ===========================================================
// 🧍 pet_body.js — draw the pet, ragdoll or flat, from one call
// ===========================================================
// Every mode used to draw the pet as the same four lines:
//
//     drawPetBackLayer(...)      wings, tail, hair behind the body
//     drawImage(base, ...)       the body itself
//     drawOutfitOverlay(...)     the clothes
//     drawPetFrontLayer(...)     the near wing, the front fringe
//
// This replaces those four with one, and decides for itself whether the pet is
// drawn as a ragdoll or as the flat sprite. Everything a mode already worked out
// — where the pet is, how big, which base image, which tint — is passed straight
// through, so a call site stays a single line and no mode has to know the rig
// exists.
//
//   WHICH MODES SIMULATE. Only the ones you can throw the pet around in: Drag,
//   Playground and Troll. Everywhere else the pet is doing something specific —
//   sitting in a bath, lying in bed, being examined — and a body that can flop
//   would fight those animations for no gain. Those modes still go through here
//   and still get the layered back parts; they just get them flat. Pass
//   simulate:true / false in opts to overrule that for one call.
//
//   THE FLAT PATH IS THE ORIGINAL. If the rig is switched off in
//   pet_rig_config.js, still cutting up the artwork, or missing entirely, this
//   draws exactly the four lines above and nothing changes.
//
// opts (all optional):
//   img        the base image this mode wants drawn. Defaults to PetArt.base.
//              Swapping it re-cuts the rig, so swap it on a state change (a toy
//              touching the pet, going to sleep) and never per frame.
//   dt         seconds since the last frame. Omit and the rig is drawn without
//              being advanced, which is what a paused or non-simulating mode
//              wants.
//   floorY     canvas y of the ground, so a thrown limb doesn't sink into it.
//   held       the user is dragging the pet by its body: limbs hang and swing.
//   airborne   the pet is off the ground: full ragdoll, and wings flap.
//   pin        { joint, x, y } — pin one hand or foot to the cursor.
//   simulate   force the ragdoll on or off for this call.
// ===========================================================
(function () {
  // The modes you can throw the pet around in.
  const SIMULATED = { normal: 1, playground: 1, trolling: 1 };

  const rigs = [];
  const seen = [];      // last base image and position, per pet

  function rigFor(i) {
    if (!window.PetRig || typeof window.PetRig.create !== 'function') return null;
    if (!rigs[i]) rigs[i] = window.PetRig.create({ petIndex: i });
    return rigs[i];
  }

  function simulating(o) {
    if (o && typeof o.simulate === 'boolean') return o.simulate;
    return !!SIMULATED[window._modeName];
  }

  function usable(im) {
    return !!(im && !im._failed && im.complete && im.naturalWidth);
  }

  function baseFor(o) {
    if (usable(o.img)) return o.img;
    const art = window.PetArt && window.PetArt.base;
    return usable(art) ? art : null;
  }

  function poseStrength(rig, o) {
    if (typeof o.poseK === 'number') return o.poseK;
    if (o.pin) return rig.pose.heldLimb;
    if (o.held) return rig.pose.heldBody;
    if (o.airborne) return rig.pose.airborne;
    return rig.pose.idle;
  }

  // The flat draw: byte for byte what every mode did before this file existed.
  function drawFlat(ctx, state, x, y, w, h, i, img) {
    let drew = false;
    if (typeof window.drawPetBackLayer === 'function') {
      if (window.drawPetBackLayer(ctx, state, x, y, w, h, i)) drew = true;
    }
    if (usable(img)) { ctx.drawImage(img, x, y, w, h); drew = true; }
    if (typeof window.drawOutfitOverlay === 'function') {
      if (window.drawOutfitOverlay(ctx, state, x, y, w, h, i)) drew = true;
    }
    if (typeof window.drawPetFrontLayer === 'function') {
      if (window.drawPetFrontLayer(ctx, state, x, y, w, h, i)) drew = true;
    }
    return drew;
  }

  window.drawPetBody = function (ctx, state, x, y, w, h, petIndex, opts) {
    const i = typeof petIndex === 'number' ? petIndex : 0;
    const o = opts || {};
    const img = baseFor(o);
    const rig = rigFor(i);

    if (!rig || !simulating(o) || !img) return drawFlat(ctx, state, x, y, w, h, i, img);

    // Re-cut only when the artwork this mode wants actually changes. Cutting is
    // a whole-sprite read; doing it per frame would be a slideshow.
    const memo = seen[i] || (seen[i] = { img: null, x: 0, y: 0, h: 0 });
    if (memo.img !== img) { memo.img = img; rig.setBase(img); }
    if (!rig.ready) return drawFlat(ctx, state, x, y, w, h, i, img);

    const scale = h / rig.srcH;
    const S = {
      petX: x, petY: y, originX: 0, originY: 0, scale,
      floorY: (typeof o.floorY === 'number') ? o.floorY : null,
      poseK: poseStrength(rig, o),
      pin: o.pin || null,
      airborne: !!o.airborne,
    };

    // A jump this large is a teleport — a mode starting, the pet being placed —
    // not a throw. Snap to it, or the limbs spend the next second whipping
    // across the screen catching up with a move that never physically happened.
    const jumped = Math.abs(x - memo.x) > w * 3 || Math.abs(y - memo.y) > h * 3 || memo.h !== h;
    memo.x = x; memo.y = y; memo.h = h;
    if (jumped) { rig.placeRest(S); rig.snap(); }
    else if (o.dt) rig.step(o.dt, S);
    else rig.placeRest(S);

    return rig.draw(ctx, S);
  };

  // So a mode can react to a landing the same way the desktop pets do.
  window.petBodyKick = function (petIndex, impact) {
    const rig = rigs[typeof petIndex === 'number' ? petIndex : 0];
    if (rig && rig.ready) rig.kick(impact);
  };

  // Which limb, if any, is under the cursor — for dragging the pet by a hand or
  // a foot. Returns the joint name to pin, or null to drag the whole body.
  window.petBodyGrab = function (petIndex, cx, cy, h) {
    const rig = rigs[typeof petIndex === 'number' ? petIndex : 0];
    if (!rig || !rig.ready) return null;
    const scale = h / rig.srcH;
    return rig.handleFor(rig.boneAt(cx, cy, scale));
  };

  // Ctrl+Shift+B over the skeleton, the joints, each bone's derived cut and
  // every back-part chain — the way to re-tune pet_rig_config.js against new art.
  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !e.shiftKey || (e.key !== 'B' && e.key !== 'b')) return;
    const on = !(rigs[0] && rigs[0].debug);
    rigs.forEach(r => r && r.setDebug(on));
  });
})();
