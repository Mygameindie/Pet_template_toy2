// ===========================================================
// 🧼 SHOWER MODE (No Toolbar Version)
// ✅ 2 PET (pet1 / pet2)
// ✅ pet1 base: base.png / base_bath2.png
// ✅ pet2 base: base_2.png / base_2_bath2.png
// ✅ LAYER ORDER (ONE BIG POOL covering BOTH):
//    pool2 (bottom, one big) -> both bases (middle) -> sponge -> pool1 (top, one big)
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
  // Bath Bases (Per Pet)
  // ==============================

  const baseSets = [
    { bath1: new Image(), bath2: new Image() }, // pet1
    { bath1: new Image(), bath2: new Image() }, // pet2
  ];

  // pet1
  baseSets[0].bath1.src = "base.png";
  baseSets[0].bath2.src = "base_bath2.png";

  // pet2
  baseSets[1].bath1.src = "base_2.png";
  baseSets[1].bath2.src = "base_2_bath2.png";

  const baths = [
    { currentBaseKey: "bath1", lastDrawnBaseKey: "bath1", wasTouching: false, x: 0, y: 0, w: 0, h: 0 },
    { currentBaseKey: "bath1", lastDrawnBaseKey: "bath1", wasTouching: false, x: 0, y: 0, w: 0, h: 0 },
  ];

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
    x: 100,
    y: 100,
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
      splashSound.play();
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

  // Wash hitbox expressed as fractions of the drawn base, so it scales with the
  // pet size (previously tuned in px for a 520x520 base: 120/90/130/150).
  const hitbox = {
    xOffset: 0.231,
    yOffset: 0.173,
    width: 0.25,
    height: 0.288,
  };

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

    const leftX = canvas.width * 0.35 - scaledW / 2;
    const rightX = canvas.width * 0.65 - scaledW / 2;
    const groundedY = groundY - scaledH;

    const positions = [leftX, rightX];

    // Update bath rects
    for (let i = 0; i < baths.length; i++) {
      baths[i].x = positions[i];
      baths[i].y = groundedY;
      baths[i].w = scaledW;
      baths[i].h = scaledH;
    }

    // ONE big pool rect covering both baths
    const poolX = leftX;
    const poolY = groundedY;
    const poolW = (rightX - leftX) + scaledW; // covers left bath to right bath
    const poolH = scaledH;

    // helper: draw base with fallback
    function drawBase(i, key) {
      let imgToDraw = baseSets[i][key];

      if (!(imgToDraw && imgToDraw.complete && imgToDraw.naturalWidth > 0)) {
        imgToDraw = baseSets[i][baths[i].lastDrawnBaseKey];
      }

      if (imgToDraw && imgToDraw.complete && imgToDraw.naturalWidth > 0) {
        ctx.drawImage(imgToDraw, baths[i].x, baths[i].y, baths[i].w, baths[i].h);
        baths[i].lastDrawnBaseKey = (imgToDraw === baseSets[i].bath2) ? "bath2" : "bath1";
      }
    }

    // 1) pool2 bottom (ONE big)
    if (poolImgs.bottom.complete && poolImgs.bottom.naturalWidth > 0) {
      ctx.drawImage(poolImgs.bottom, poolX, poolY, poolW, poolH);
    }

    // 2) bases middle (both pets)
    for (let i = 0; i < baths.length; i++) {
      drawBase(i, baths[i].currentBaseKey);
    }

    // 3) sponge (guard against a broken/missing image — drawImage throws on those)
    if (sponge.img.complete && sponge.img.naturalWidth > 0) {
      ctx.drawImage(sponge.img, sponge.x, sponge.y, sponge.width, sponge.height);
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
        baths[i].currentBaseKey = "bath2";
        if (!baths[i].wasTouching) {
          playSplash();
          if (window.PetStats) window.PetStats.shower(i);
        }
        if (typeof window.setActivePet === "function") window.setActivePet(i);
      } else {
        baths[i].currentBaseKey = "bath1";
      }

      baths[i].wasTouching = touching;
    }

    // 5) pool1 top (ONE big, covers both bases)
    if (poolImgs.top.complete && poolImgs.top.naturalWidth > 0) {
      ctx.drawImage(poolImgs.top, poolX, poolY, poolW, poolH);
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