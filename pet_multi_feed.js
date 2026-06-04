// ===========================================================
// 🐾 FEED MODE (Instant Sound + Gravity + Scroll Bar + Mobile)
// Items are 100% JSON-driven via feed_items.json (no DEFAULT config in JS)
// ===========================================================
(function () {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  resizeCanvas();

  const groundHeight = 100;
  let groundY = canvas.height - groundHeight;

  // ===========================================================
  // 🎵 INSTANT SOUND POOLS
  // ===========================================================
  const soundPool = {
    yum: [new Audio("yummy.mp3"), new Audio("yummy.mp3"), new Audio("yummy.mp3")],
    yuck: [new Audio("yuck.mp3"), new Audio("yuck.mp3"), new Audio("yuck.mp3")],
    bounce: [new Audio("bounce.mp3"), new Audio("bounce.mp3")],
    frozen: [new Audio("frozen.mp3"), new Audio("frozen.mp3")],
    spicy: [new Audio("spicy.mp3"), new Audio("spicy.mp3")],
    quack: [new Audio("quack.mp3"), new Audio("quack.mp3"), new Audio("quack.mp3")],
  };
  let soundIndex = 0;

  function playSound(key, volume = 0.9, rate = 1.0) {
    const pool = soundPool[key];
    if (!pool) return;
    const s = pool[soundIndex % pool.length];
    soundIndex++;
    try {
      s.pause();
      s.currentTime = 0;
      s.volume = volume;
      s.playbackRate = rate;
      s.play();
    } catch {}
  }

  // ===========================================================
  // 🦆 Quack Helper (instant, random pitch)
  // ===========================================================
  function playQuack() {
    playSound("quack", 0.9, 0.9 + Math.random() * 0.2);
  }

  // ===========================================================
  // 🐾 PET IMAGES (per pet)
  // Convention for 2 art (optional):
  //   base_2.png, base_happy_2.png, base_disgust_2.png, base_freeze_2.png, base_spicy_2.png
  // If missing, we draw pet1 art with a hue-rotate tint so it still looks like a different pet.
  // ===========================================================
  function createImg(src) {
    const img = new Image();
    img._failed = false;
    img.onerror = () => { img._failed = true; };
    img.src = src;
    return img;
  }

  function loadMoodSet(suffix) {
    return {
      normal: createImg(`base${suffix}.png`),
      happy: createImg(`base_happy${suffix}.png`),
      disgust: createImg(`base_disgust${suffix}.png`),
      yellowgummybearfreeze: createImg(`base_freeze${suffix}.png`),
      spicy: createImg(`base_spicy${suffix}.png`),
    };
  }

  const petMoodSets = [
    loadMoodSet(''),
    loadMoodSet('_2'),
  ];

  const pets = [
    {
      x: canvas.width * 0.35,
      y: canvas.height - 150 - 150,
      w: 400,
      h: 450,
      mood: "normal",
      drawFilter: "none",
    },
    {
      x: canvas.width * 0.65,
      y: canvas.height - 150 - 150,
      w: 400,
      h: 450,
      mood: "normal",
      drawFilter: "hue-rotate(140deg) saturate(1.2)",
    },
  ];

  // Match the main screen: derive width from the base image's real aspect ratio.
  function syncPetWidths() {
    if (!window.PetArt) return;
    pets.forEach(p => { p.w = window.PetArt.widthForHeight(p.h); });
  }
  syncPetWidths();
  if (window.PetArt) window.PetArt.onReady(syncPetWidths);

  function safeDrawPet(i, mood, x, y, w, h) {
    let set = petMoodSets[i] || petMoodSets[0];
    let img = set[mood] || set.normal;
    let useTintFallback = false;
    if (!img || img._failed) {
      set = petMoodSets[0];
      img = (set[mood] || set.normal);
      useTintFallback = (i === 1);
    }
    if (!img || img._failed || !img.complete || img.naturalWidth === 0) return;

    ctx.save();
    ctx.filter = useTintFallback ? (pets[i] && pets[i].drawFilter ? pets[i].drawFilter : "none") : "none";
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }

  // ===========================================================
  // 💬 TEXT BUBBLE
  // ===========================================================
  let bubble = document.getElementById("bubble");
  if (!bubble) {
    bubble = document.createElement("div");
    bubble.id = "bubble";
    bubble.style.position = "absolute";
    bubble.style.transform = "translate(-50%, -100%)";
    bubble.style.background = "rgba(255,255,255,0.95)";
    bubble.style.borderRadius = "10px";
    bubble.style.padding = "6px 10px";
    bubble.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
    bubble.style.pointerEvents = "none";
    bubble.style.fontSize = "14px";
    bubble.style.display = "none";
    document.body.appendChild(bubble);
  }

  function showBubble(text) {
    const i = (typeof window.activePetIndex === "number") ? window.activePetIndex : 0;
    const pet = pets[i] || pets[0];
    bubble.style.left = pet.x + "px";
    bubble.style.top = pet.y - pet.h / 2 - 40 + "px";
    bubble.textContent = text;
    bubble.style.display = "block";
    clearTimeout(showBubble._t);
    showBubble._t = setTimeout(() => (bubble.style.display = "none"), 1200);
  }

  // ===========================================================
  // 🍽️ FOOD OBJECTS
  // ===========================================================
  const foods = [];

  // ===========================================================
  // 🍽️ ITEMS (100% JSON-driven)
  // ===========================================================
  let spawnMap = {};

  async function loadFeedConfig() {
    // NOTE: If you open index.html via file://, some browsers block fetch().
    // Use a local server (VSCode Live Server) so this works.
    const res = await fetch("feed_items.json", { cache: "no-store" });
    if (!res.ok) throw new Error("feed_items.json not found");
    const cfg = await res.json();
    applyFeedConfig(cfg);
  }

  function applyFeedConfig(cfg) {
    if (!cfg || !Array.isArray(cfg.items)) {
      throw new Error("Invalid feed_items.json format (expected { items: [...] })");
    }

    spawnMap = {};
    for (const it of cfg.items) {
      if (!it || !it.key) continue;
      spawnMap[it.key] = {
        name: it.key,
        imgSrc: it.imgSrc,
        liked: !!it.liked,
        w: Number(it.w) || 100,
        h: Number(it.h) || 100,
        type: it.type || "normal",
      };
    }

    buildToolbar(cfg.items);
  }

  function spawnFood(type) {
    const def = spawnMap[type];
    if (!def) return;

    // Check inventory; if empty, show message and abort
    if (window.PetStats && !window.PetStats.useInventory(type)) {
      showBubble("No more " + (def.name || type) + "! 🌱 Garden");
      return;
    }
    refreshToolbar();

    const f = {
      ...def,
      img: new Image(),
      drag: false,
      visible: true,
      justSpawned: true,
      vy: 0,
      x: (pets[(typeof window.activePetIndex === "number") ? window.activePetIndex : 0] || pets[0]).x + (Math.random() * 200 - 100),
      y: (pets[(typeof window.activePetIndex === "number") ? window.activePetIndex : 0] || pets[0]).y - 300,
    };
    f.img.src = def.imgSrc;
    setTimeout(() => (f.justSpawned = false), 800);
    foods.push(f);

    // keep your old behavior
    if (type === "icegummybear") playQuack();
  }

  function clearFoods() {
    foods.length = 0;
  }

  // ===========================================================
  // 🖐️ DRAG LOGIC (Mobile + Desktop)
  // ===========================================================
  let activeFood = null;
  let hasMoved = false;

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.touches ? e.touches[0].clientX : e.clientX) - r.left,
      y: (e.touches ? e.touches[0].clientY : e.clientY) - r.top,
    };
  }

  function down(e) {
    const p = pos(e);

    // Tap a pet to select it for clothes + spawn focus
    for (let i = 0; i < pets.length; i++) {
      const pet = pets[i];
      if (
        p.x > pet.x - pet.w / 2 &&
        p.x < pet.x + pet.w / 2 &&
        p.y > pet.y - pet.h / 2 &&
        p.y < pet.y + pet.h / 2
      ) {
        if (typeof window.setActivePet === "function") window.setActivePet(i);
        break;
      }
    }

    for (const f of foods) {
      if (!f.visible) continue;
      if (
        p.x > f.x - f.w / 2 &&
        p.x < f.x + f.w / 2 &&
        p.y > f.y - f.h / 2 &&
        p.y < f.y + f.h / 2
      ) {
        activeFood = f;
        f.drag = true;
        f.vy = 0;
        hasMoved = false;
        e.preventDefault();
        return;
      }
    }
  }

  function move(e) {
    if (!activeFood) return;
    const p = pos(e);
    activeFood.x = p.x;
    activeFood.y = p.y;
    hasMoved = true;
    if (e.touches) e.preventDefault();
  }

  function up() {
    if (activeFood && hasMoved) checkCollision(activeFood);
    if (activeFood) activeFood.drag = false;
    activeFood = null;
  }

  const listeners = [
    ["mousedown", down],
    ["mousemove", move],
    ["mouseup", up],
    ["touchstart", down],
    ["touchmove", move],
    ["touchend", up],
  ];
  listeners.forEach(([ev, fn]) => canvas.addEventListener(ev, fn, { passive: false }));

  // ===========================================================
  // 💥 COLLISION DETECTION
  // ===========================================================
  function checkCollision(f) {
    if (!f.visible || f.justSpawned) return;
    // Check against BOTH pets; pick the first one hit (closest)
    let hitIdx = -1;
    let best = Infinity;
    for (let i = 0; i < pets.length; i++) {
      const pet = pets[i];
      const dx = Math.abs(f.x - pet.x);
      const dy = Math.abs(f.y - pet.y);
      const hit = dx < f.w / 2 + pet.w / 2 && dy < f.h / 2 + pet.h / 2;
      if (!hit) continue;
      const score = dx * dx + dy * dy;
      if (score < best) {
        best = score;
        hitIdx = i;
      }
    }
    if (hitIdx < 0) return;

    if (typeof window.setActivePet === "function") window.setActivePet(hitIdx);
    const pet = pets[hitIdx];

    if (f.type === "ice") {
      pet.mood = "yellowgummybearfreeze";
      showBubble("Brrr! 🧊");
      playSound("frozen");
      if (window.PetStats) window.PetStats.feedSpecial(hitIdx, "ice");
    } else if (f.type === "spicy") {
      pet.mood = "spicy";
      showBubble("Spicy! 🌶️");
      playSound("spicy");
      if (window.PetStats) window.PetStats.feedSpecial(hitIdx, "spicy");
    } else {
      pet.mood = f.liked ? "happy" : "disgust";
      showBubble(f.liked ? "Yummy!" : "Yuck!");
      playSound(f.liked ? "yum" : "yuck");
      if (window.PetStats) window.PetStats.feed(hitIdx, f.liked);
    }

    f.visible = false;
    setTimeout(() => (pet.mood = "normal"), 1500);
  }

  // ===========================================================
  // 🌍 GRAVITY + DRAW
  // ===========================================================
  const gravity = 0.6;
  const bounce = 0.4;
  let floorY = canvas.height - groundHeight - 10;

  function applyGravity() {
    for (const f of foods) {
      if (f.drag || !f.visible) continue;
      if (f.y + f.h / 2 < floorY) {
        f.vy = (f.vy || 0) + gravity;
        f.y += f.vy;
      } else {
        f.y = floorY - f.h / 2;
        f.vy = -(f.vy || 0) * bounce;
        if (Math.abs(f.vy) < 0.8) f.vy = 0;
      }
    }
  }

  function ground() {
    ctx.fillStyle = "#5c4033";
    ctx.fillRect(0, groundY, canvas.width, groundHeight);
  }

  function drawPet() {
    pets.forEach((pet, i) => {
      const x = pet.x - pet.w / 2;
      const y = pet.y - pet.h / 2;

      // Base
      safeDrawPet(i, pet.mood, x, y, pet.w, pet.h);

      // Outfit overlay (per pet) — tint along with pet if 2 is using fallback
      // (If you provide real 2 outfit art later, it will render without tint.)
      const set = petMoodSets[i] || petMoodSets[0];
      const img = (set && set[pet.mood]) || (set && set.normal);
      const needsTint = (i === 1) && (!img || img._failed);
      if (window.drawOutfitOverlay) {
        ctx.save();
        ctx.filter = needsTint ? (pet.drawFilter || "none") : "none";
        window.drawOutfitOverlay(ctx, "stand", x, y, pet.w, pet.h, i);
        ctx.restore();
      }
    });
  }

  function drawFoods() {
    for (const f of foods) {
      if (!f.visible) continue;
      const img = f.img;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, f.x - f.w / 2, f.y - f.h / 2, f.w, f.h);
      }
    }
  }

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ground();
    drawPet();
    applyGravity();
    drawFoods();
    requestAnimationFrame(loop);
  }
  loop();

  // ===========================================================
  // 📱 RESIZE
  // ===========================================================
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  const onResize = () => {
    resizeCanvas();
    groundY = canvas.height - groundHeight;
    pets.forEach(p => (p.y = groundY - p.h / 2));
    floorY = canvas.height - groundHeight - 10;
  };
  window.addEventListener("resize", onResize);

  // ===========================================================
  // 🧭 SCROLLABLE FEED TOOLBAR (auto from JSON)
  // ===========================================================
  let spawnButtons = document.getElementById("spawn-buttons");

  function enableDragScroll(scrollElement) {
    let isDown = false;
    let startX, scrollLeft;

    const start = (e) => {
      isDown = true;
      startX = (e.touches ? e.touches[0].pageX : e.pageX) - scrollElement.offsetLeft;
      scrollLeft = scrollElement.scrollLeft;
    };
    const end = () => (isDown = false);
    const move = (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = (e.touches ? e.touches[0].pageX : e.pageX) - scrollElement.offsetLeft;
      scrollElement.scrollLeft = scrollLeft - (x - startX) * 1.5;
    };

    scrollElement.addEventListener("mousedown", start);
    scrollElement.addEventListener("touchstart", start, { passive: false });
    scrollElement.addEventListener("mouseup", end);
    scrollElement.addEventListener("mouseleave", end);
    scrollElement.addEventListener("touchend", end);
    scrollElement.addEventListener("mousemove", move);
    scrollElement.addEventListener("touchmove", move, { passive: false });
  }

  function buildToolbar(items) {
    if (spawnButtons) spawnButtons.remove();

    spawnButtons = document.createElement("div");
    spawnButtons.id = "spawn-buttons";
    spawnButtons.classList.add("combined-scroll-bar");
    spawnButtons.style.position = "fixed";
    spawnButtons.style.top = "15px";
    spawnButtons.style.left = "50%";
    spawnButtons.style.transform = "translateX(-50%)";
    spawnButtons.style.zIndex = "999";

    const btnHtml = (items || [])
      .filter((it) => it && it.key)
      .map((it) => {
        const count = window.PetStats ? window.PetStats.getInventory(it.key) : "?";
        return `<button data-spawn="${it.key}" ${count === 0 ? 'disabled style="opacity:0.5"' : ''}>${it.label || it.key} (${count})</button>`;
      })
      .join("");

    spawnButtons.innerHTML = `
      ${btnHtml}
      <button id="clearFoods">🧹 Clear</button>
    `;

    document.body.appendChild(spawnButtons);
    enableDragScroll(spawnButtons);

    spawnButtons.querySelectorAll("button[data-spawn]").forEach((btn) => {
      const k = btn.getAttribute("data-spawn");
      btn.addEventListener("click", () => spawnFood(k));
    });

    const clearBtn = document.getElementById("clearFoods");
    if (clearBtn) clearBtn.onclick = clearFoods;
  }

  function refreshToolbar() {
    if (!spawnButtons) return;
    spawnButtons.querySelectorAll("button[data-spawn]").forEach((btn) => {
      const k = btn.getAttribute("data-spawn");
      const count = window.PetStats ? window.PetStats.getInventory(k) : 0;
      const def = spawnMap[k];
      btn.textContent = `${def ? (def.name || k) : k} (${count})`;
      btn.disabled = count <= 0;
      btn.style.opacity = count <= 0 ? "0.5" : "1";
    });
  }
  window._refreshFeedToolbar = refreshToolbar;

  // ===========================================================
  // 🔌 Load JSON (no fallback)
  // ===========================================================
  loadFeedConfig().catch((e) => {
    console.error(e);
    // Optional: show a bubble so user knows why no buttons
    showBubble("Missing feed_items.json");
  });

  // ===========================================================
  // 🧹 CLEANUP
  // ===========================================================
  window._modeCleanup = function () {
    listeners.forEach(([ev, fn]) => canvas.removeEventListener(ev, fn));
    window.removeEventListener("resize", onResize);
    if (bubble) bubble.style.display = "none";
    if (spawnButtons) spawnButtons.remove();
  };

  window._modeName = "feed";
})();
