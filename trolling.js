// ===========================================================
// 😈 TROLL MODE
// Hammer: click hammer button -> tap pet -> synced impact.
// Spray: click spray button -> drag/move spray bottle near pet -> click/tap to spray.
// Both tools use the disgust face and reduce happiness through PetStats.troll().
// ===========================================================

(() => {
  window._modeName = "trolling";

  const canvas = document.getElementById("canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // === Resize ===
  const groundHeight = 100;
  let groundY = 0;

  // === Base Pet (per pet)
  function createImg(src) {
    const img = new Image();
    img._failed = false;
    img.onerror = () => { img._failed = true; };
    img.src = src;
    return img;
  }

  // Optional 2 art naming:
  //   base_2.png, base_disgust_2.png
  const baseSets = [
    { normal: createImg("base.png"), hurt: createImg("base_disgust.png") },
    { normal: createImg("base_2.png"), hurt: createImg("base_disgust_2.png") },
  ];

  const pets = [
    { x: 0, y: 0, w: 400, h: 450, hurtUntil: 0, recoilUntil: 0, drawFilter: "none" },
    { x: 0, y: 0, w: 400, h: 450, hurtUntil: 0, recoilUntil: 0, drawFilter: "hue-rotate(140deg) saturate(1.2)" },
  ];

  // Match the main screen: derive width from the base image's real aspect ratio.
  function syncPetWidths() {
    if (!window.PetArt) return;
    pets.forEach(p => { p.w = window.PetArt.widthForHeight(p.h); });
  }
  syncPetWidths();
  if (window.PetArt) window.PetArt.onReady(() => { syncPetWidths(); resizeCanvas(); });

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    groundY = canvas.height - groundHeight;
    pets[0].x = canvas.width * 0.35 - pets[0].w / 2;
    pets[1].x = canvas.width * 0.65 - pets[1].w / 2;
    pets.forEach(p => { p.y = groundY - 500; });
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // === Sounds ===
  const hammerSound = new Audio("hammer.mp3");
  const spraySound = new Audio("spray.mp3");
  if (window.SoundManager) {
    SoundManager.register(hammerSound);
    SoundManager.register(spraySound);
  }

  function playHammerImpact() {
    try {
      const clone = hammerSound.cloneNode();
      clone.volume = 0.95;
      clone.currentTime = 0;
      clone.play().catch(() => {});
      if (window.SoundManager) SoundManager.register(clone);
    } catch {}
  }

  function playSpraySound() {
    try {
      const clone = spraySound.cloneNode();
      clone.volume = 0.85;
      clone.currentTime = 0;
      clone.play().catch(() => {});
      if (window.SoundManager) SoundManager.register(clone);
    } catch {}
  }

  // ===========================================================
  // 🧭 TOOLBAR
  // ===========================================================
  const trollBar = document.createElement("div");
  trollBar.id = "troll-bar";
  trollBar.classList.add("combined-scroll-bar");
  trollBar.style.position = "fixed";
  trollBar.style.top = "15px";
  trollBar.style.left = "50%";
  trollBar.style.transform = "translateX(-50%)";
  trollBar.style.zIndex = "999";
  trollBar.innerHTML = `
    <button id="hammer-btn" title="Arm hammer, then tap the pet">🔨 Hammer</button>
    <button id="spray-btn" title="Drag spray near a pet, then tap to spray">🧴 Spray</button>
    <button id="remove-btn" title="Clear tool & reset face">❌ Remove</button>
  `;
  document.body.appendChild(trollBar);

  // ===========================================================
  // 🔨 HAMMER CURSOR + 🧴 SPRAY CURSOR
  // ===========================================================
  const hammerCursor = document.createElement("div");
  hammerCursor.id = "hammer-cursor";
  hammerCursor.textContent = "🔨";
  hammerCursor.style.display = "none";
  document.body.appendChild(hammerCursor);

  const SPRAY_READY_SRC = "spray.png";
  const SPRAY_ACTIVE_SRC = "sprayed.png";

  const sprayCursor = document.createElement("div");
  sprayCursor.id = "spray-cursor";
  sprayCursor.innerHTML = `<img src="${SPRAY_READY_SRC}" alt="Spray bottle" draggable="false"><span>🧴</span>`;
  sprayCursor.style.display = "none";
  document.body.appendChild(sprayCursor);

  const sprayMist = document.createElement("div");
  sprayMist.id = "spray-mist";
  sprayMist.textContent = "💦";
  sprayMist.style.display = "none";
  document.body.appendChild(sprayMist);

  const sprayImg = sprayCursor.querySelector("img");
  const sprayFallback = sprayCursor.querySelector("span");
  let sprayAssetFallback = false;

  function setSprayImage(active) {
    if (sprayAssetFallback) return;
    sprayImg.dataset.mode = active ? "active" : "ready";
    sprayImg.src = active ? SPRAY_ACTIVE_SRC : SPRAY_READY_SRC;
    sprayImg.style.display = "block";
    sprayFallback.style.display = "none";
  }

  sprayImg.onerror = () => {
    if (sprayImg.dataset.mode === "active") {
      sprayImg.dataset.mode = "ready";
      sprayImg.src = SPRAY_READY_SRC;
      return;
    }
    sprayAssetFallback = true;
    sprayImg.style.display = "none";
    sprayFallback.style.display = "inline";
  };
  sprayImg.onload = () => {
    if (sprayAssetFallback) return;
    sprayImg.style.display = "block";
    sprayFallback.style.display = "none";
  };
  setSprayImage(false);

  // Inject minimal CSS so animation always works (even if CSS file changes)
  const style = document.createElement("style");
  style.textContent = `
    #hammer-cursor{
      position:fixed;
      left:0; top:0;
      transform: translate(-50%,-55%) rotate(-18deg);
      font-size:48px;
      pointer-events:none;
      z-index:1000;
      filter: drop-shadow(0 2px 2px rgba(0,0,0,.25));
    }
    #hammer-cursor.swing{
      animation: hammerSwing .32s ease-in-out;
      transform-origin: 70% 30%;
    }
    @keyframes hammerSwing{
      0%{ transform: translate(-50%,-55%) rotate(-18deg); }
      55%{ transform: translate(-50%,-55%) rotate(65deg) translateY(6px); }
      100%{ transform: translate(-50%,-55%) rotate(-18deg); }
    }
    #spray-cursor{
      position:fixed;
      left:0; top:0;
      width:80px;
      height:80px;
      transform: translate(-50%,-50%) rotate(-18deg);
      pointer-events:none;
      user-select:none;
      z-index:1000;
      filter: drop-shadow(0 4px 5px rgba(0,0,0,.25));
    }
    #spray-cursor img{
      width:100%;
      height:100%;
      object-fit:contain;
      display:block;
    }
    #spray-cursor span{
      display:none;
      font-size:50px;
      line-height:58px;
    }
    #spray-cursor.spraying{
      animation: sprayShake .22s ease-in-out;
    }
    @keyframes sprayShake{
      0%{ transform: translate(-50%,-50%) rotate(-18deg); }
      45%{ transform: translate(-48%,-52%) rotate(-30deg) scale(1.04); }
      100%{ transform: translate(-50%,-50%) rotate(-18deg); }
    }
    #spray-mist{
      position:fixed;
      left:0; top:0;
      transform: translate(18px,-45px);
      pointer-events:none;
      z-index:1001;
      font-size:34px;
      opacity:0;
    }
    #spray-mist.show{
      animation: sprayMistPop .42s ease-out;
    }
    @keyframes sprayMistPop{
      0%{ opacity:0; transform: translate(10px,-30px) scale(.65); }
      35%{ opacity:1; transform: translate(32px,-48px) scale(1); }
      100%{ opacity:0; transform: translate(70px,-62px) scale(1.25); }
    }
    #troll-bar button.active{ outline: 2px solid rgba(255,255,255,.65); }
  `;
  document.head.appendChild(style);

  let activeTool = null;
  let isSwinging = false;
  let isSpraying = false;
  let lastPointer = { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 };

  const hammerBtn = document.getElementById("hammer-btn");
  const sprayBtn = document.getElementById("spray-btn");
  const removeBtn = document.getElementById("remove-btn");

  function setActiveTool(tool) {
    activeTool = activeTool === tool ? null : tool;
    hammerBtn.classList.toggle("active", activeTool === "hammer");
    sprayBtn.classList.toggle("active", activeTool === "spray");
    hammerCursor.style.display = "none";
    sprayCursor.style.display = activeTool === "spray" ? "block" : "none";
    if (activeTool === "spray") {
      setSprayImage(false);
      moveSprayCursor(lastPointer.clientX, lastPointer.clientY);
    }
  }

  function moveSprayCursor(clientX, clientY) {
    lastPointer = { clientX, clientY };
    if (activeTool !== "spray") return;
    sprayCursor.style.left = clientX + "px";
    sprayCursor.style.top = clientY + "px";
  }

  hammerBtn.addEventListener("click", () => setActiveTool("hammer"));
  sprayBtn.addEventListener("click", () => setActiveTool("spray"));

  removeBtn.addEventListener("click", () => {
    activeTool = null;
    hammerBtn.classList.remove("active");
    sprayBtn.classList.remove("active");
    hammerCursor.style.display = "none";
    sprayCursor.style.display = "none";
    sprayMist.style.display = "none";
    setSprayImage(false);
    pets.forEach(p => { p.hurtUntil = 0; p.recoilUntil = 0; });
  });

  // ===========================================================
  // 🎯 Pixel-perfect hit test (opaque pixels only)
  // ===========================================================
  const alphaMasks = [
    { data: null, w: 0, h: 0 },
    { data: null, w: 0, h: 0 },
  ];
  const ALPHA_THRESHOLD = 10;

  function rebuildAlphaMask(img, idx) {
    try {
      const oc = document.createElement("canvas");
      oc.width = img.naturalWidth || img.width;
      oc.height = img.naturalHeight || img.height;
      const octx = oc.getContext("2d", { willReadFrequently: true });
      octx.clearRect(0, 0, oc.width, oc.height);
      octx.drawImage(img, 0, 0);
      const id = octx.getImageData(0, 0, oc.width, oc.height);
      alphaMasks[idx] = { data: id.data, w: oc.width, h: oc.height };
    } catch (e) {
      alphaMasks[idx] = { data: null, w: 0, h: 0 };
    }
  }

  baseSets.forEach((set, i) => {
    const img = set && set.normal;
    if (!img) return;
    img.addEventListener("load", () => rebuildAlphaMask(img, i));
    if (img.complete && img.naturalWidth > 0) rebuildAlphaMask(img, i);
  });

  function getCanvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches && e.touches[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;

    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    return { x, y, clientX, clientY };
  }

  function isOpaqueHit(p, pet, idx) {
    if (p.x < pet.x || p.x > pet.x + pet.w || p.y < pet.y || p.y > pet.y + pet.h) return false;

    const m = alphaMasks[idx] || alphaMasks[0];
    if (!m.data || !m.w || !m.h) return true;

    const ix = Math.floor((p.x - pet.x) * (m.w / pet.w));
    const iy = Math.floor((p.y - pet.y) * (m.h / pet.h));
    if (ix < 0 || ix >= m.w || iy < 0 || iy >= m.h) return false;

    const a = m.data[(iy * m.w + ix) * 4 + 3];
    return a > ALPHA_THRESHOLD;
  }

  function isNearPet(p, pet, idx) {
    const pad = 70;
    const insideNearBox = p.x >= pet.x - pad && p.x <= pet.x + pet.w + pad && p.y >= pet.y - pad && p.y <= pet.y + pet.h + pad;
    return insideNearBox || isOpaqueHit(p, pet, idx);
  }

  function getTargetPet(p, nearMode = false) {
    for (let i = pets.length - 1; i >= 0; i--) {
      if (nearMode ? isNearPet(p, pets[i], i) : isOpaqueHit(p, pets[i], i)) return i;
    }
    return -1;
  }

  function disgustPet(idx, recoilMs, hurtMs) {
    if (idx < 0) return;
    const pet = pets[idx];
    pet.recoilUntil = Date.now() + recoilMs;
    pet.hurtUntil = Date.now() + hurtMs;
    if (typeof window.setActivePet === "function") window.setActivePet(idx);
    if (window.PetStats) window.PetStats.troll(idx);
  }

  function sprayCleanPet(idx) {
    if (idx < 0) return;
    if (window.PetStats && typeof window.PetStats.sprayClean === "function") {
      window.PetStats.sprayClean(idx);
    }
  }

  // ===========================================================
  // 🔨 Hammer hit + 🧴 Spray hit
  // ===========================================================
  const SWING_MS = 320;
  const IMPACT_AT = 0.62;

  function doHammerHit(hit, clientX, clientY, hitIdx) {
    if (activeTool !== "hammer" || isSwinging) return;
    isSwinging = true;

    hammerCursor.style.left = clientX + "px";
    hammerCursor.style.top = clientY + "px";
    hammerCursor.style.display = "block";

    hammerCursor.classList.remove("swing");
    void hammerCursor.offsetWidth;
    hammerCursor.classList.add("swing");

    const impactTimer = setTimeout(() => {
      if (hit) {
        playHammerImpact();
        disgustPet(hitIdx, 120, 450);
      }
    }, Math.floor(SWING_MS * IMPACT_AT));

    setTimeout(() => {
      clearTimeout(impactTimer);
      hammerCursor.classList.remove("swing");
      hammerCursor.style.display = "none";
      isSwinging = false;
    }, SWING_MS + 30);
  }

  function doSprayHit(hit, clientX, clientY, hitIdx) {
    if (activeTool !== "spray" || isSpraying) return;
    isSpraying = true;

    moveSprayCursor(clientX, clientY);
    setSprayImage(true);
    playSpraySound();
    sprayCursor.classList.remove("spraying");
    void sprayCursor.offsetWidth;
    sprayCursor.classList.add("spraying");

    sprayMist.style.left = clientX + "px";
    sprayMist.style.top = clientY + "px";
    sprayMist.style.display = "block";
    sprayMist.classList.remove("show");
    void sprayMist.offsetWidth;
    sprayMist.classList.add("show");

    if (hit) {
      disgustPet(hitIdx, 80, 700);
      sprayCleanPet(hitIdx);
    }

    setTimeout(() => {
      sprayCursor.classList.remove("spraying");
      sprayMist.classList.remove("show");
      sprayMist.style.display = "none";
      setSprayImage(false);
      isSpraying = false;
    }, 460);
  }

  function onPointerMove(e) {
    const p = getCanvasPoint(e);
    moveSprayCursor(p.clientX, p.clientY);
  }

  function onCanvasDown(e) {
    if (!activeTool) return;
    const p = getCanvasPoint(e);
    let hitIdx = -1;

    if (activeTool === "hammer") {
      hitIdx = getTargetPet(p, false);
      e.preventDefault();
      doHammerHit(hitIdx >= 0, p.clientX, p.clientY, hitIdx);
      return;
    }

    if (activeTool === "spray") {
      hitIdx = getTargetPet(p, false);
      e.preventDefault();
      doSprayHit(hitIdx >= 0, p.clientX, p.clientY, hitIdx);
    }
  }

  canvas.addEventListener("mousemove", onPointerMove);
  canvas.addEventListener("touchmove", onPointerMove, { passive: true });
  canvas.addEventListener("mousedown", onCanvasDown);
  canvas.addEventListener("touchstart", onCanvasDown, { passive: false });

  // ===========================================================
  // 🎨 DRAW LOOP
  // ===========================================================
  let running = true;
  function draw() {
    if (!running) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#5c4033";
    ctx.fillRect(0, groundY, canvas.width, groundHeight);

    const now = Date.now();
    for (let i = 0; i < pets.length; i++) {
      const pet = pets[i];
      const recoil = (pet.recoilUntil && now < pet.recoilUntil) ? 10 : 0;
      const wantHurt = (pet.hurtUntil && now < pet.hurtUntil);

      let set = baseSets[i] || baseSets[0];
      let img = wantHurt ? set.hurt : set.normal;
      let useTintFallback = false;
      if (!img || img._failed) {
        set = baseSets[0];
        img = wantHurt ? set.hurt : set.normal;
        useTintFallback = (i === 1);
      }

      if (img && !img._failed && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.filter = useTintFallback ? (pet.drawFilter || "none") : "none";
        ctx.drawImage(img, pet.x, pet.y + recoil, pet.w, pet.h);

        if (window.drawOutfitOverlay) {
          window.drawOutfitOverlay(ctx, "stand", pet.x, pet.y + recoil, pet.w, pet.h, i);
        }
        ctx.restore();
      }
    }

    requestAnimationFrame(draw);
  }
  draw();

  // ===========================================================
  // 🧹 CLEANUP
  // ===========================================================
  window._modeCleanup = function () {
    running = false;
    trollBar?.remove();
    hammerCursor?.remove();
    sprayCursor?.remove();
    sprayMist?.remove();
    style?.remove();
    window.removeEventListener("resize", resizeCanvas);
    canvas.removeEventListener("mousemove", onPointerMove);
    canvas.removeEventListener("touchmove", onPointerMove);
    canvas.removeEventListener("mousedown", onCanvasDown);
    canvas.removeEventListener("touchstart", onCanvasDown);
    if (window.SoundManager) SoundManager.stopAll();
  };
})();
