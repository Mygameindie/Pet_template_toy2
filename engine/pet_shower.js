// ===========================================================
// 🧼 SHOWER MODE (No Toolbar Version)
// ✅ Pets come from game_config.js
// ✅ per-pet base: base.png / base_bath2.png (+ artSuffix, e.g. base_2.png / base_2_bath2.png)
// ✅ LAYER ORDER (ONE BIG POOL covering ALL PETS):
//    pool2 (bottom, one big) -> heads (middle) -> pool1 (top, one big) -> sponge (always visible)
// ===========================================================

(() => {

  // ==============================
  // 🚿 ENTER SHOWER MODE
  // ==============================

  if (typeof window._modeCleanup === "function") {
    try { window._modeCleanup(); } catch (e) {}
  }

  window._modeName = "shower";

  // Force naked + hide button (multi-pet aware)
  if (typeof window.enterShowerClothesRules === "function") {
    window.enterShowerClothesRules();
  } else {
    window._blockClothesInShower = true;
    if (typeof window.currentOutfit !== "undefined") window.currentOutfit = 0;
    if (window.clothesBtn) window.clothesBtn.style.display = "none";
  }

  if (window.SoundManager) SoundManager.stopAll();

  // ==============================
  // Canvas
  // ==============================

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  const groundHeight = 100;

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();

  let groundY = canvas.height - groundHeight;

  // ==============================
  // Bath Heads (Per Pet)
  // ==============================

  // Characters come from game_config.js (count, art suffix, position).
  // Bath art per pet: base.png / base_bath2.png plus the pet's artSuffix
  // (e.g. base_2.png / base_2_bath2.png).
  const PET_CFG = (window.GAME_CONFIG && Array.isArray(window.GAME_CONFIG.pets) && window.GAME_CONFIG.pets.length)
    ? window.GAME_CONFIG.pets
    : [{ artSuffix: "", xFrac: 0.5 }];

  const headSets = PET_CFG.map(c => {
    const sfx = c.artSuffix || "";
    const set = { bath1: new Image(), bath2: new Image() };
    set.bath1.src = `base${sfx}.png`;
    set.bath2.src = `base${sfx}_bath2.png`;
    return set;
  });

  const baths = PET_CFG.map(() => (
    { currentHeadKey: "bath1", lastDrawnHeadKey: "bath1", wasTouching: false, x: 0, y: 0, w: 0, h: 0 }
  ));

  // ==============================
  // Pool overlays (ONE BIG pool covering BOTH)
  // ==============================

  const poolImgs = {
    top: new Image(),     // pool1.png (top layer)
    bottom: new Image(),  // pool2.png (bottom layer)
  };
  poolImgs.top.src = "pool1.png";
  poolImgs.bottom.src = "pool2.png";

  // ==============================
  // Sponge
  // ==============================

  const sponge = {
    img: new Image(),
    // Starts clear of the stats panel in the top-left corner (it used to sit under
    // it, so the sponge could hardly be picked up).
    x: Math.max(220, canvas.width * 0.7),
    y: Math.max(120, canvas.height * 0.25),
    width: 100,
    height: 100,
    dragging: false,
  };
  sponge.img.src = "sponge1.png";

  // ==============================
  // Sound
  // ==============================

  const splashSound = new Audio("splash.mp3");

  function playSplash() {
    try {
      splashSound.pause();
      splashSound.currentTime = 0;
      const p = splashSound.play();
      if (p && p.catch) p.catch(() => {});
    } catch {}
  }

  // ==============================
  // Drag Logic
  // ==============================

  let dragTarget = null;
  let offsetX = 0;
  let offsetY = 0;

  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startDrag(e) {
    e.preventDefault();
    const { x, y } = getPointerPos(e);

    if (
      x >= sponge.x &&
      x <= sponge.x + sponge.width &&
      y >= sponge.y &&
      y <= sponge.y + sponge.height
    ) {
      dragTarget = sponge;
      offsetX = x - sponge.x;
      offsetY = y - sponge.y;
      sponge.dragging = true;
    }
  }

  function moveDrag(e) {
    if (!dragTarget) return;
    e.preventDefault();
    const { x, y } = getPointerPos(e);
    dragTarget.x = x - offsetX;
    dragTarget.y = y - offsetY;
  }

  function stopDrag() {
    sponge.dragging = false;
    dragTarget = null;
  }

  canvas.addEventListener("mousedown", startDrag);
  canvas.addEventListener("mousemove", moveDrag);
  canvas.addEventListener("mouseup", stopDrag);

  canvas.addEventListener("touchstart", startDrag, { passive: false });
  canvas.addEventListener("touchmove", moveDrag, { passive: false });
  canvas.addEventListener("touchend", stopDrag);

  // ==============================
  // Hitbox
  // ==============================

  // Wash hitbox as fractions of the drawn base: the whole pet, so the sponge
  // washes it wherever it touches.
  const hitbox = {
    xOffset: 0,
    yOffset: 0,
    width: 1,
    height: 1,
  };

  // The sponge scrubs while it washes: it rocks side to side and bobs. `scrub`
  // eases in and out so it settles when the sponge is lifted off the pet.
  let scrub = 0;
  let scrubT = 0;

  // ==============================
  // Update Loop
  // ==============================

  let running = true;
  let raf = 0;

  function update() {
    if (!running) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Match the main screen: same height, width from the base image's aspect ratio.
    const scaledH = 450;
    const scaledW = window.PetArt ? window.PetArt.widthForHeight(scaledH) : 400;

    const groundedY = groundY - scaledH;

    const positions = PET_CFG.map((c, i) => {
      const xFrac = (c.xFrac != null) ? c.xFrac : (i + 1) / (PET_CFG.length + 1);
      return canvas.width * xFrac - scaledW / 2;
    });

    // Update bath rects
    for (let i = 0; i < baths.length; i++) {
      baths[i].x = positions[i];
      baths[i].y = groundedY;
      baths[i].w = scaledW;
      baths[i].h = scaledH;
    }

    // ONE big pool rect covering every bath
    const poolX = Math.min(...positions);
    const poolY = groundedY;
    const poolW = (Math.max(...positions) - poolX) + scaledW; // covers left-most to right-most bath
    const poolH = scaledH;

    // helper: draw base with fallback
    function drawHead(i, key) {
      let imgToDraw = headSets[i][key];

      if (!(imgToDraw && imgToDraw.complete && imgToDraw.naturalWidth > 0)) {
        imgToDraw = headSets[i][baths[i].lastDrawnHeadKey];
      }

      if (imgToDraw && imgToDraw.complete && imgToDraw.naturalWidth > 0) {
        if (imgToDraw === headSets[i].bath1) imgToDraw = (window.PetFace && window.PetFace.shyImg ? window.PetFace.shyImg(imgToDraw, i) : imgToDraw);
        ctx.drawImage(imgToDraw, baths[i].x, baths[i].y, baths[i].w, baths[i].h);
        baths[i].lastDrawnHeadKey = (imgToDraw === headSets[i].bath2) ? "bath2" : "bath1";
      }
    }

    // 1) pool2 bottom (ONE big)
    if (poolImgs.bottom.complete && poolImgs.bottom.naturalWidth > 0) {
      ctx.drawImage(poolImgs.bottom, poolX, poolY, poolW, poolH);
    }

    // 2) heads middle (both pets)
    for (let i = 0; i < baths.length; i++) {
      drawHead(i, baths[i].currentHeadKey);
    }

    // 4) touching/state update
    for (let i = 0; i < baths.length; i++) {
      const bx = baths[i].x;
      const by = baths[i].y;

      const hbX = bx + baths[i].w * hitbox.xOffset;
      const hbY = by + baths[i].h * hitbox.yOffset;
      const hbW = baths[i].w * hitbox.width;
      const hbH = baths[i].h * hitbox.height;
      const touching =
        sponge.x + sponge.width > hbX &&
        sponge.x < hbX + hbW &&
        sponge.y + sponge.height > hbY &&
        sponge.y < hbY + hbH;

      if (touching) {
        baths[i].currentHeadKey = "bath2";
        if (!baths[i].wasTouching) {
          playSplash();
          if (window.PetStats) window.PetStats.shower(i);
        }
        if (typeof window.setActivePet === "function") window.setActivePet(i);
      } else {
        baths[i].currentHeadKey = "bath1";
      }

      baths[i].wasTouching = touching;
    }

    // 5) pool1 top (ONE big, covers both heads)
    if (poolImgs.top.complete && poolImgs.top.naturalWidth > 0) {
      ctx.drawImage(poolImgs.top, poolX, poolY, poolW, poolH);
    }

    // 6) sponge on top of everything, so you can always see it scrub
    if (sponge.img.complete && sponge.img.naturalWidth > 0) {
      const washing = baths.some(b => b.wasTouching);
      scrub += ((washing ? 1 : 0) - scrub) * 0.2;
      if (washing) scrubT += 0.5;
      const cx = sponge.x + sponge.width / 2, cy = sponge.y + sponge.height / 2;
      ctx.save();
      ctx.translate(cx + Math.sin(scrubT) * 14 * scrub, cy + Math.abs(Math.sin(scrubT * 0.5)) * -8 * scrub);
      ctx.rotate(Math.sin(scrubT) * 0.25 * scrub);
      ctx.drawImage(sponge.img, -sponge.width / 2, -sponge.height / 2, sponge.width, sponge.height);
      ctx.restore();
    }

    raf = requestAnimationFrame(update);
  }

  update();

  // ==============================
  // CLEANUP
  // ==============================

  window._modeCleanup = function () {
    running = false;
    cancelAnimationFrame(raf);

    if (typeof window.exitShowerClothesRules === "function") {
      window.exitShowerClothesRules();
    } else {
      if (window.clothesBtn) window.clothesBtn.style.display = "block";
      window._blockClothesInShower = false;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    canvas.removeEventListener("mousedown", startDrag);
    canvas.removeEventListener("mousemove", moveDrag);
    canvas.removeEventListener("mouseup", stopDrag);
    canvas.removeEventListener("touchstart", startDrag);
    canvas.removeEventListener("touchmove", moveDrag);
    canvas.removeEventListener("touchend", stopDrag);
  };

})();