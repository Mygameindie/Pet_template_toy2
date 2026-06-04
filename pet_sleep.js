// ===========================================================
// 😴 pet_sleep.js — Sleep Mode (shared bed, blanket covers body not head)
// ===========================================================
(function () {
  const baseCanvas = document.getElementById("canvas");
  const baseCtx = baseCanvas.getContext("2d");

  // --- Top canvas (blanket only) ---
  let blanketCanvas = document.getElementById("blanketCanvas");
  if (!blanketCanvas) {
    blanketCanvas = document.createElement("canvas");
    blanketCanvas.id = "blanketCanvas";
    blanketCanvas.style.position = "fixed";
    blanketCanvas.style.top = "0";
    blanketCanvas.style.left = "0";
    blanketCanvas.style.width = "100vw";
    blanketCanvas.style.height = "100vh";
    blanketCanvas.style.zIndex = "99";
    blanketCanvas.style.pointerEvents = "none";
    blanketCanvas.style.background = "transparent";
    document.body.appendChild(blanketCanvas);
  }
  const blanketCtx = blanketCanvas.getContext("2d");

  // Render the blanket layer in HD too (the main #canvas is auto-enabled).
  if (window.HDCanvas) window.HDCanvas.enable(blanketCanvas);

  // CONFIG
  const BED_OFFSET = 450;
  const GROUND_OFFSET = 100;
  const BED_W = 700;
  const BED_H = 450;
  const PET_H = 450;
  // Match the main screen: derive width from the base image's real aspect ratio.
  let PET_W = window.PetArt ? window.PetArt.widthForHeight(PET_H) : 400;

  function resizeCanvas() {
    baseCanvas.width = window.innerWidth;
    baseCanvas.height = window.innerHeight;
    blanketCanvas.width = window.innerWidth;
    blanketCanvas.height = window.innerHeight;
  }
  resizeCanvas();

  // === Images ===
  function createImg(src) {
    const img = new Image();
    img._failed = false;
    img.onerror = () => { img._failed = true; };
    img.src = src;
    return img;
  }

  function loadBaseSet(suffix) {
    return {
      stand: createImg(`base${suffix}.png`),
      fall: createImg(`base${suffix}.png`),
      fly0: createImg(`base${suffix}.png`),
      fly1: createImg(`base${suffix}.png`),
    };
  }

  const baseSets = [loadBaseSet(''), loadBaseSet('_2')];

  const imgs = {
    bed: createImg("bed.png"),
    blanket1: createImg("blanket1.png"),
  };

  // === Pets (2) ===
  function makePet(x, idx) {
    const p = {
      x,
      y: baseCanvas.height - 170 - 170,
      w: PET_W,
      h: PET_H,
      dragging: false,
      oldx: 0,
      oldy: 0,
      visible: true,
      drawFilter: idx === 1 ? "hue-rotate(140deg) saturate(1.2)" : "none",
    };
    p.oldx = p.x;
    p.oldy = p.y;
    return p;
  }

  const pets = [
    makePet(baseCanvas.width * 0.3, 0),
    makePet(baseCanvas.width * 0.7, 1),
  ];

  // Re-sync widths to the true aspect ratio once the base image has loaded.
  if (window.PetArt) window.PetArt.onReady(() => {
    PET_W = window.PetArt.widthForHeight(PET_H);
    pets.forEach(p => { p.w = window.PetArt.widthForHeight(p.h); });
  });

  // === One shared bed (centered) ===
  const bed = {
    x: baseCanvas.width * 0.5,
    y: baseCanvas.height - BED_OFFSET,
    w: BED_W,
    h: BED_H,
    petsInBed: [false, false],   // which pets are in the bed
    sleeping: false,             // blanket is locked = actually sleeping
  };

  // === One blanket ===
  const blanket = {
    x: bed.x + bed.w / 2 + 80,
    y: bed.y,
    w: BED_W + 40,
    h: BED_H * 0.45,
    visible: false,
    dragging: false,
    locked: false,
  };

  function snapBlanketToBed() {
    blanket.x = bed.x;
    // Position blanket to cover lower body area (not heads)
    blanket.y = bed.y + bed.h * 0.25;
  }

  // === Physics ===
  const vy = [0, 0];
  const vx = [0, 0];
  const gravity = 1.0;
  const damping = 0.94;
  let groundY = baseCanvas.height - GROUND_OFFSET;
  const MIN_IMPACT = 1.5;

  // === Helpers ===
  function getPos(canvasEl, e) {
    const r = canvasEl.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return { x, y };
  }

  function anyPetInBed() {
    return bed.petsInBed[0] || bed.petsInBed[1];
  }

  function setBlanketPointerEvents() {
    const interactable = blanket.visible && !blanket.locked;
    blanketCanvas.style.pointerEvents = interactable ? "auto" : "none";
  }

  // Where each pet sits inside the bed (left / right)
  function petBedX(petIdx) {
    return petIdx === 0 ? bed.x - bed.w * 0.18 : bed.x + bed.w * 0.18;
  }
  function petBedY() {
    return bed.y;
  }

  // Active drag targets
  let activePetIndex = -1;

  // === Drag Start (PET) ===
  function startDragPet(e) {
    const p = getPos(baseCanvas, e);
    for (let i = pets.length - 1; i >= 0; i--) {
      const pet = pets[i];
      if (
        pet.visible &&
        p.x > pet.x - pet.w / 2 &&
        p.x < pet.x + pet.w / 2 &&
        p.y > pet.y - pet.h / 2 &&
        p.y < pet.y + pet.h / 2
      ) {
        pet.dragging = true;
        activePetIndex = i;
        vx[i] = 0;
        vy[i] = 0;
        if (typeof window.setActivePet === "function") window.setActivePet(i);
        e.preventDefault();
        return;
      }
    }
  }

  function moveDragPet(e) {
    if (activePetIndex < 0) return;
    const pet = pets[activePetIndex];
    if (!pet.dragging) return;
    const p = getPos(baseCanvas, e);
    pet.x = p.x;
    pet.y = p.y;
  }

  function endDragPet() {
    if (activePetIndex < 0) return;
    const i = activePetIndex;
    const pet = pets[i];
    if (!pet.dragging) return;

    pet.dragging = false;
    pet.oldx = pet.x;
    pet.oldy = pet.y;

    // Check overlap with the shared bed
    const petBottom = pet.y + pet.h / 2;
    const bedTop = bed.y - bed.h / 2;
    const overlapX = Math.abs(pet.x - bed.x) < (pet.w / 2 + bed.w / 2) * 0.6;
    const overlapY = petBottom > bedTop && petBottom < bed.y + bed.h / 2;

    if (overlapX && overlapY && !bed.petsInBed[i]) {
      bed.petsInBed[i] = true;
      pet.visible = false;
      vy[i] = 0;
      vx[i] = 0;

      // Show blanket only when BOTH pets are in bed
      if (!bed.sleeping && bed.petsInBed[0] && bed.petsInBed[1]) {
        blanket.visible = true;
        blanket.locked = false;
        setBlanketPointerEvents();
      }
    }

    activePetIndex = -1;
  }

  // === Drag Blanket (top canvas) ===
  let blanketDragging = false;

  function startDragBlanket(e) {
    if (!blanket.visible || blanket.locked) return;
    const p = getPos(blanketCanvas, e);
    if (
      p.x > blanket.x - blanket.w / 2 &&
      p.x < blanket.x + blanket.w / 2 &&
      p.y > blanket.y - blanket.h / 2 &&
      p.y < blanket.y + blanket.h / 2
    ) {
      blanketDragging = true;
      e.preventDefault();
    }
  }

  function moveDragBlanket(e) {
    if (!blanketDragging) return;
    const p = getPos(blanketCanvas, e);
    blanket.x = p.x;
    blanket.y = p.y;
  }

  function endDragBlanket() {
    if (!blanketDragging) return;
    blanketDragging = false;

    const overlapX = Math.abs(blanket.x - bed.x) < (blanket.w / 2 + bed.w / 2) * 0.5;
    const overlapY = Math.abs(blanket.y - bed.y) < (blanket.h / 2 + bed.h / 2) * 0.5;

    if (overlapX && overlapY && anyPetInBed()) {
      blanket.locked = true;
      snapBlanketToBed();
      bed.sleeping = true;

      // Start sleeping for all pets in bed
      for (let i = 0; i < 2; i++) {
        if (bed.petsInBed[i] && window.PetStats) {
          window.PetStats.sleep(i);
        }
      }

      window._sleepClickBlocked = true;
      setTimeout(() => { window._sleepClickBlocked = false; }, 100);
    }

    setBlanketPointerEvents();
  }

  // === Wake click ===
  function handleWakeClick(e, sourceCanvas) {
    if (window._sleepClickBlocked) return;
    if (!anyPetInBed()) return;

    const p = getPos(sourceCanvas, e);
    const bedLeft = bed.x - bed.w / 2;
    const bedRight = bed.x + bed.w / 2;
    const bedTop = bed.y - bed.h / 2;
    const bedBottom = bed.y + bed.h / 2;

    if (p.x > bedLeft && p.x < bedRight && p.y > bedTop && p.y < bedBottom) {
      // Wake up all pets in the bed
      for (let i = 0; i < 2; i++) {
        if (!bed.petsInBed[i]) continue;

        const pet = pets[i];
        pet.visible = true;
        // Pop out above the bed
        pet.x = petBedX(i);
        pet.y = bed.y - bed.h / 2 - pet.h / 2;
        vx[i] = 0;
        vy[i] = 0;
        pet.oldx = pet.x;
        pet.oldy = pet.y;
      }

      bed.petsInBed = [false, false];
      bed.sleeping = false;
      blanket.visible = false;
      blanket.locked = false;
      blanket.dragging = false;
      setBlanketPointerEvents();
    }
  }

  // === Event Listeners ===
  const wakeClickBase = (e) => handleWakeClick(e, baseCanvas);
  const wakeClickBlanket = (e) => handleWakeClick(e, blanketCanvas);

  const baseListeners = [
    ["mousedown", startDragPet],
    ["mousemove", moveDragPet],
    ["mouseup", endDragPet],
    ["touchstart", startDragPet],
    ["touchmove", moveDragPet],
    ["touchend", endDragPet],
    ["click", wakeClickBase],
  ];
  const blanketListeners = [
    ["mousedown", startDragBlanket],
    ["mousemove", moveDragBlanket],
    ["mouseup", endDragBlanket],
    ["touchstart", startDragBlanket],
    ["touchmove", moveDragBlanket],
    ["touchend", endDragBlanket],
    ["click", wakeClickBlanket],
  ];

  baseListeners.forEach(([ev, fn]) =>
    baseCanvas.addEventListener(ev, fn, { passive: false })
  );
  blanketListeners.forEach(([ev, fn]) =>
    blanketCanvas.addEventListener(ev, fn, { passive: false })
  );

  // === Resize ===
  function onResize() {
    resizeCanvas();
    bed.x = baseCanvas.width * 0.5;
    bed.y = baseCanvas.height - BED_OFFSET;
    groundY = baseCanvas.height - GROUND_OFFSET;
    if (blanket.locked) snapBlanketToBed();
  }
  window.addEventListener("resize", onResize);

  // === Physics ===
  function update() {
    for (let i = 0; i < pets.length; i++) {
      const pet = pets[i];
      if (!pet.visible || bed.petsInBed[i]) continue;
      if (pet.dragging) continue;

      const nx = pet.x;
      const ny = pet.y;
      vx[i] = (nx - pet.oldx) * damping;
      vy[i] = (ny - pet.oldy) * damping;
      pet.oldx = nx;
      pet.oldy = ny;

      vy[i] += gravity;
      pet.x += vx[i];
      pet.y += vy[i];

      if (pet.y + pet.h / 2 >= groundY) {
        pet.y = groundY - pet.h / 2;
        if (Math.abs(vy[i]) > MIN_IMPACT) vy[i] = -vy[i] * 0.25;
        else vy[i] = 0;
      }
    }
  }

  // === Draw ===
  function safeDraw(ctx, img, x, y, w, h) {
    if (!img || img._failed || !img.complete || img.naturalWidth === 0) return;
    try { ctx.drawImage(img, x, y, w, h); } catch (_) {}
  }

  function drawBed() {
    safeDraw(baseCtx, imgs.bed, bed.x - bed.w / 2, bed.y - bed.h / 2, bed.w, bed.h);
  }

  function drawPetsInBed() {
    // Draw sleeping pets at their left/right positions inside the bed
    for (let i = 0; i < 2; i++) {
      if (!bed.petsInBed[i]) continue;

      const px = petBedX(i);
      const py = petBedY();
      const pet = pets[i];

      let set = baseSets[i] || baseSets[0];
      let img = set.stand;
      let useTint = false;
      if (!img || img._failed) {
        set = baseSets[0];
        img = set.stand;
        useTint = (i === 1);
      }

      baseCtx.save();
      baseCtx.filter = useTint ? (pet.drawFilter || "none") : "none";
      safeDraw(baseCtx, img, px - pet.w / 2, py - pet.h / 2, pet.w, pet.h);

      // Outfit overlay
      if (window.drawOutfitOverlay) {
        const drawn = window.drawOutfitOverlay(baseCtx, "sleep", px - pet.w / 2, py - pet.h / 2, pet.w, pet.h, i);
        if (!drawn) window.drawOutfitOverlay(baseCtx, "stand", px - pet.w / 2, py - pet.h / 2, pet.w, pet.h, i);
      }
      baseCtx.restore();
    }
  }

  function drawFreePets() {
    pets.forEach((pet, i) => {
      if (!pet.visible) return;

      const state = pet.dragging ? "fly0" : vy[i] > 2 ? "fall" : "stand";
      let set = baseSets[i] || baseSets[0];
      let img = set[state];
      let useTint = false;
      if (!img || img._failed) {
        set = baseSets[0];
        img = set[state];
        useTint = (i === 1);
      }

      baseCtx.save();
      baseCtx.filter = useTint ? (pet.drawFilter || "none") : "none";
      safeDraw(baseCtx, img, pet.x - pet.w / 2, pet.y - pet.h / 2, pet.w, pet.h);

      if (window.drawOutfitOverlay) {
        window.drawOutfitOverlay(baseCtx, state, pet.x - pet.w / 2, pet.y - pet.h / 2, pet.w, pet.h, i);
      }
      baseCtx.restore();
    });
  }

  function drawBlanketTopCanvas() {
    blanketCtx.clearRect(0, 0, blanketCanvas.width, blanketCanvas.height);
    if (!blanket.visible) return;
    safeDraw(
      blanketCtx,
      imgs.blanket1,
      blanket.x - blanket.w / 2,
      blanket.y - blanket.h / 2,
      blanket.w,
      blanket.h
    );
  }

  // === Energy restore ===
  const ENERGY_PER_TICK = 10;
  const sleepInterval = setInterval(() => {
    if (!bed.sleeping) return;
    for (let i = 0; i < 2; i++) {
      if (bed.petsInBed[i] && window.PetStats) {
        window.PetStats.sleep(i, ENERGY_PER_TICK);
      }
    }
  }, 1000);

  function updateSleepingFlags() {
    window._petsSleeping = [false, false];
    for (let i = 0; i < 2; i++) {
      if (bed.sleeping && bed.petsInBed[i]) {
        window._petsSleeping[i] = true;
      }
    }
  }

  // === Main Loop ===
  let raf = 0;
  function loop() {
    baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);

    update();
    updateSleepingFlags();

    drawBed();
    drawPetsInBed();
    drawFreePets();
    drawBlanketTopCanvas();

    raf = requestAnimationFrame(loop);
  }

  setBlanketPointerEvents();
  loop();

  // === Cleanup ===
  window._modeCleanup = function () {
    cancelAnimationFrame(raf);
    clearInterval(sleepInterval);
    window._petsSleeping = null;
    window.removeEventListener("resize", onResize);
    baseListeners.forEach(([ev, fn]) => baseCanvas.removeEventListener(ev, fn));
    blanketListeners.forEach(([ev, fn]) => blanketCanvas.removeEventListener(ev, fn));
    if (blanketCanvas && blanketCanvas.parentNode) {
      blanketCanvas.parentNode.removeChild(blanketCanvas);
    }
  };

  window._modeName = "sleep";
})();
