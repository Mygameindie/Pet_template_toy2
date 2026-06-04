// ===========================================================
// 🐾 pet_script.js — Base + Button Outfit System (SINGLE IIFE)
// ===========================================================
(function () {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const groundHeight = 100;
  let groundY = canvas.height - groundHeight;

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
  // Convention: if you add another pet's art, name it:
  //   base_pet2.png, base2_pet2.png, base3_pet2.png, base4_pet2.png
  // If missing, we fall back to pet1 art and apply a hue-rotate filter so pet2 is still visually distinct.
  function loadBaseSet(suffix) {
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

  // === Base images (per pet) ===
  const baseSets = [
    loadBaseSet(''),
    loadBaseSet('_2'),
  ];

  // NOTE: Do NOT create a clothes button here.
  // outfit_system.js creates ONE global button and keeps outfit state in window.currentOutfit.

  // === Safe draw (prevents broken-image crash) ===
  function safeDraw(img, x, y, w, h) {
    if (!img || img._failed || !img.complete || img.naturalWidth === 0) return;
    ctx.drawImage(img, x, y, w, h);
  }

  // === Pets (2) ===
  function makePet(x, idx) {
    const p = {
      x,
      y: canvas.height - 170 - 170,
      w: 400,
      h: 450,
      type: idx === 1 ? 'pet2' : 'pet1',
      // If pet2 art is missing, we tint the fallback so it still looks like a different pet.
      drawFilter: idx === 1 ? 'hue-rotate(140deg) saturate(1.2)' : 'none',
      dragging: false,
      oldx: 0,
      oldy: 0,
      vy: 0,
      onGround: false,
      frame: 0,
      timer: 0,
      _toyActive: false,
    };
    p.oldx = p.x;
    p.oldy = p.y;
    return p;
  }

  
  const pets = [
    makePet(canvas.width * 0.35, 0),
    makePet(canvas.width * 0.65, 1),
  ];

  // === Original-size base (uniform for both pets) ===
  // Match every pet's box to pet 1's base art aspect ratio, so both pets render
  // at the art's true proportions AND at the same size. Height stays the display
  // size; width is derived from the image's natural dimensions once it loads.
  function syncPetAspect() {
    const img = baseSets[0].stand;
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

  const baseImg = baseSets[0].stand;
  if (baseImg && baseImg.complete && baseImg.naturalWidth) syncPetAspect();
  else if (baseImg) baseImg.addEventListener('load', syncPetAspect);

  // === Physics ===
  const gravity = 1.2;
  const damping = 0.985;
  const bouncePower = 25;
  const MIN_IMPACT = 2.0;

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
    if (
      p.x > pet.x - pet.w / 2 &&
      p.x < pet.x + pet.w / 2 &&
      p.y > pet.y - pet.h / 2 &&
      p.y < pet.y + pet.h / 2
    ) {
      pet.dragging = true;
      activePet = pet;
      if (typeof window.setActivePet === 'function') window.setActivePet(i);
      e.preventDefault();
      break;
    }
  }
}

  function moveDrag(e) {
    if (!activePet || !activePet.dragging) return;
    const p = getPos(e);
    activePet.x = p.x;
    activePet.y = p.y;
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
      activePet.oldx = activePet.x;
      activePet.oldy = activePet.y;
      if (activePet.y + activePet.h / 2 > groundY) {
        activePet.y = groundY - activePet.h / 2;
        activePet.vy = -Math.max(12, bouncePower * 0.6);
        playImpactSound(0.5);
      }
    }
    if (activePet) {
      // Playing with pet boosts happiness
      const petIdx = pets.indexOf(activePet);
      if (petIdx >= 0 && window.PetStats) window.PetStats.play(petIdx);
      activePet.dragging = false;
    }
    activePet = null;
  }

  const listeners = [
    ['mousedown', startDrag],
    ['mousemove', moveDrag],
    ['mouseup', endDrag],
    ['touchstart', startDrag],
    ['touchmove', moveDrag],
    ['touchend', endDrag],
  ];
  listeners.forEach(([ev, fn]) =>
    canvas.addEventListener(ev, fn, { passive: false })
  );

  // === Resize ===
  function onResize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    groundY = canvas.height - groundHeight;

    // keep pets in bounds and spaced
    pets[0].x = Math.min(pets[0].x, canvas.width - pets[0].w / 2);
    pets[1].x = Math.max(pets[1].x, pets[1].w / 2);
    pets.forEach(p => {
      if (p.y + p.h / 2 > groundY) {
        p.y = groundY - p.h / 2;
        p.oldy = p.y;
      }
    });
  }
  window.addEventListener('resize', onResize);

  // === Update ===
  function update() {
    for (const pet of pets) {
      if (pet.dragging) continue;

      const vx = (pet.x - pet.oldx) * damping;
      pet.vy = (pet.y - pet.oldy) * damping;

      const prevBottom = pet.oldy + pet.h / 2;

      pet.oldx = pet.x;
      pet.oldy = pet.y;
      pet.x += vx;

      let vyNext = pet.vy + gravity;
      let yNext = pet.y + vyNext;

      const nextBottom = yNext + pet.h / 2;
      const wasAbove = prevBottom < groundY;
      const willBeBelow = nextBottom >= groundY;
      const crossingGround = wasAbove && willBeBelow && vyNext > 0;

      if (crossingGround) {
        pet.y = groundY - pet.h / 2;
        const impactSpeed = vyNext;
        if (impactSpeed > MIN_IMPACT) {
          pet.vy = -bouncePower;
          if (!pet.onGround) {
            const vol = Math.min(0.2 + (impactSpeed / 30), 1.0);
            playImpactSound(vol);
          }
        } else {
          pet.vy = 0;
        }
        pet.onGround = true;
      } else {
        pet.y = yNext;
        if (pet.y + pet.h / 2 > groundY) {
          pet.y = groundY - pet.h / 2;
          pet.vy = 0;
          pet.onGround = true;
        } else {
          pet.vy = vyNext;
          pet.onGround = false;
        }
      }
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
      if (pet.vy > 5) {
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

      // choose base set; if pet2 asset missing, use pet1 and tint
      let set = baseSets[i] || baseSets[0];
      let img = set[state];
      let useTintFallback = false;
      if (!img || img._failed) {
        set = baseSets[0];
        img = set[state];
        useTintFallback = (i === 1);
      }

      // Toy3-style: while a toy is touching this pet, swap to the toy-touched
      // base and hold it until the toy leaves. Falls back to the normal base
      // image when the alternate art is missing (so behavior degrades cleanly).
      if (pet._toyActive) {
        let toyImg = set.toy;
        if (!toyImg || toyImg._failed) {
          toyImg = baseSets[0].toy;
          if (toyImg && !toyImg._failed && i === 1) useTintFallback = true;
        }
        if (toyImg && !toyImg._failed) img = toyImg;
      }

      ctx.save();
      ctx.filter = useTintFallback ? pet.drawFilter : 'none';

      // Base (naked)
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
    cancelAnimationFrame(raf);
    listeners.forEach(([ev, fn]) => canvas.removeEventListener(ev, fn));
    window.removeEventListener('resize', onResize);
  };
  window._modeName = 'normal';
})();