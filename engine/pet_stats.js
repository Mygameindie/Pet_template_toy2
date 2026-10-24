// ===========================================================
// 📊 pet_stats.js — Pet Stats, Save/Load, Sound Settings
// Tracks hunger, happiness, cleanliness, energy per pet.
// Persists to localStorage. Provides global API for all modes.
// ===========================================================
(() => {
  // Pet count and save key come from game_config.js. Every character uses the
  // exact same stats system (same defaults, same decay rates, same effects).
  const GAME = window.GAME_CONFIG || {};
  const SAVE_KEY = GAME.saveKey || "purelilypet_save";
  const NUM_PETS = (GAME.pets && GAME.pets.length) || 1;

  // Stat decay rates (points lost per second)
  const DECAY = {
    hunger: 0.15,
    happiness: 0.08,
    cleanliness: 0.06,
    energy: 0.10,
    shy: 0.15,       // shyness fades slowly (~3 min from 100 to 70); the Confidence button resets it
  };
  const SHY_FACE_AT = 70;   // shy at or above this -> head_shy.png (head_shy_1.png while a toy touches)

  // --- Default stats ---
  function defaultStats() {
    return { hunger: 80, happiness: 90, cleanliness: 85, energy: 75, shy: 0 };
  }

  // --- Load from localStorage ---
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  function writeSave(data) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch {}
  }

  // --- Init state ---
  const saved = loadSave();

  const petStats = [];
  for (let i = 0; i < NUM_PETS; i++) {
    petStats.push(
      (saved && saved.pets && saved.pets[i])
        ? { ...defaultStats(), ...saved.pets[i] }
        : defaultStats()
    );
  }

  // Restore outfits if saved
  if (saved && Array.isArray(saved.outfits)) {
    window.currentOutfits = saved.outfits.slice();
    if (typeof window.currentOutfits[0] === "number") {
      window.currentOutfit = window.currentOutfits[0];
    }
  }

  // --- Garden inventory (bag linked to feed mode) ---
  function defaultInventory() {
    return {
      jelly: 2, bittergummybear: 2, pinkgummybear: 2,
      yellowgummybear: 2, icegummybear: 2, giantgummybear: 2, rainbowgummybear: 2,
    };
  }
  let gardenInventory = (saved && saved.gardenInventory)
    ? { ...defaultInventory(), ...saved.gardenInventory }
    : defaultInventory();

  // Sound mute state
  let muted = (saved && saved.muted === true);

  // --- Clamp helper ---
  function clamp(v) { return Math.max(0, Math.min(100, v)); }

  // --- Decay loop ---
  let lastTick = Date.now();

  function tick() {
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;

    for (let i = 0; i < NUM_PETS; i++) {
      const s = petStats[i];
      const isSleeping = Array.isArray(window._petsSleeping) && window._petsSleeping[i];
      s.hunger = clamp(s.hunger - DECAY.hunger * dt);
      s.happiness = clamp(s.happiness - DECAY.happiness * dt);
      s.cleanliness = clamp(s.cleanliness - DECAY.cleanliness * dt);
      s.shy = clamp(s.shy - DECAY.shy * dt);
      if (!isSleeping) {
        s.energy = clamp(s.energy - DECAY.energy * dt);
      }
    }

    updateUI();
  }

  // --- Save periodically ---
  function doSave() {
    writeSave({
      pets: petStats.map(s => ({ ...s })),
      outfits: Array.isArray(window.currentOutfits) ? window.currentOutfits.slice() : new Array(NUM_PETS).fill(0),
      muted,
      gardenInventory: { ...gardenInventory },
      savedAt: Date.now(),
    });
  }

  // --- UI: stat bars ---
  let statsEl = document.getElementById("pet-stats-panel");
  if (!statsEl) {
    statsEl = document.createElement("div");
    statsEl.id = "pet-stats-panel";
    document.body.appendChild(statsEl);
  }

  function buildStatsUI() {
    statsEl.innerHTML = "";

    for (let i = 0; i < NUM_PETS; i++) {
      const card = document.createElement("div");
      card.className = "stats-card";
      card.dataset.pet = i;

      card.innerHTML = `
        <div style="font-weight:600; margin-bottom:3px;">Pet ${i + 1}</div>
        ${statBar("hunger", i, "Hunger", "#fb923c")}
        ${statBar("happiness", i, "Happy", "#4ade80")}
        ${statBar("cleanliness", i, "Clean", "#38bdf8")}
        ${statBar("energy", i, "Energy", "#a78bfa")}
        ${statBar("shy", i, "Shy", "#f472b6")}
      `;
      statsEl.appendChild(card);
    }

    const muteBtn = document.createElement("button");
    muteBtn.id = "mute-btn";
    muteBtn.textContent = muted ? "🔇" : "🔊";
    muteBtn.title = "Toggle sound";
    muteBtn.addEventListener("click", () => {
      muted = !muted;
      muteBtn.textContent = muted ? "🔇" : "🔊";
      applyMute();
      doSave();
    });
    statsEl.appendChild(muteBtn);

    applyMute();
  }

  function statBar(key, petIdx, label, color) {
    return `
      <div style="margin: 3px 0;">
        <div style="display:flex; justify-content:space-between; margin-bottom:1px;">
          <span>${label}</span>
          <span id="stat-val-${key}-${petIdx}">0%</span>
        </div>
        <div style="height:8px; background:#e5e7eb; border-radius:999px; overflow:hidden;">
          <div id="stat-fill-${key}-${petIdx}" style="height:100%; width:0%; background:${color}; border-radius:999px; transition:width .3s ease;"></div>
        </div>
      </div>
    `;
  }

  function updateUI() {
    for (let i = 0; i < NUM_PETS; i++) {
      const s = petStats[i];
      for (const key of ["hunger", "happiness", "cleanliness", "energy", "shy"]) {
        const fill = document.getElementById(`stat-fill-${key}-${i}`);
        const val = document.getElementById(`stat-val-${key}-${i}`);
        if (fill) fill.style.width = Math.round(s[key]) + "%";
        if (val) val.textContent = Math.round(s[key]) + "%";
      }
    }
  }

  function applyMute() {
    if (window.SoundManager) {
      window.SoundManager._muted = muted;
    }

    if (!Audio.prototype._origPlay) {
      Audio.prototype._origPlay = Audio.prototype.play;
      Audio.prototype.play = function () {
        if (window.SoundManager && window.SoundManager._muted) {
          this.volume = 0;
        }
        return Audio.prototype._origPlay.call(this);
      };
    }
  }

  window.PetStats = {
    get(petIdx) {
      return { ...petStats[petIdx || 0] };
    },

    feed(petIdx, liked) {
      const i = (typeof petIdx === "number") ? petIdx : 0;
      const s = petStats[i];
      if (liked) {
        s.hunger = clamp(s.hunger + 20);
        s.happiness = clamp(s.happiness + 5);
      } else {
        s.hunger = clamp(s.hunger + 8);
        s.happiness = clamp(s.happiness - 5);
      }
      doSave();
    },

    feedSpecial(petIdx, type) {
      const i = (typeof petIdx === "number") ? petIdx : 0;
      const s = petStats[i];
      s.hunger = clamp(s.hunger + 12);
      if (type === "ice") s.happiness = clamp(s.happiness + 3);
      if (type === "spicy") s.happiness = clamp(s.happiness - 3);
      doSave();
    },

    shower(petIdx) {
      const i = (typeof petIdx === "number") ? petIdx : 0;
      petStats[i].cleanliness = clamp(petStats[i].cleanliness + 8);
      doSave();
    },

    sprayClean(petIdx) {
      const i = (typeof petIdx === "number") ? petIdx : 0;
      petStats[i].cleanliness = clamp(petStats[i].cleanliness + 1);
      doSave();
    },

    sleep(petIdx, amount) {
      const i = (typeof petIdx === "number") ? petIdx : 0;
      const gain = (typeof amount === "number") ? amount : 15;
      petStats[i].energy = clamp(petStats[i].energy + gain);
      doSave();
    },

    troll(petIdx) {
      const i = (typeof petIdx === "number") ? petIdx : 0;
      petStats[i].happiness = clamp(petStats[i].happiness - 8);
      doSave();
    },

    play(petIdx) {
      const i = (typeof petIdx === "number") ? petIdx : 0;
      petStats[i].happiness = clamp(petStats[i].happiness + 2);
    },

    // Something embarrassing (wind under the skirt ...): raise the Shy stat.
    shyUp(petIdx, amount) {
      const i = (typeof petIdx === "number") ? petIdx : 0;
      petStats[i].shy = clamp(petStats[i].shy + (amount || 10));
    },

    // The Confidence button: the pet is not shy any more.
    confidence(petIdx) {
      const i = (typeof petIdx === "number") ? petIdx : 0;
      petStats[i].shy = 0;
      doSave();
    },

    // A toy started touching the pet (pet_toys.js): makes it shy.
    toyTouch(petIdx) {
      const i = (typeof petIdx === "number") ? petIdx : 0;
      petStats[i].shy = clamp(petStats[i].shy + 10);
    },

    karaoke(petIdx) {
      const i = (typeof petIdx === "number") ? petIdx : 0;
      petStats[i].happiness = clamp(petStats[i].happiness + 10);
      petStats[i].energy = clamp(petStats[i].energy - 5);
      doSave();
    },

    heal(petIdx) {
      const i = (typeof petIdx === "number") ? petIdx : 0;
      const s = petStats[i];
      s.hunger = clamp(s.hunger + 30);
      s.happiness = clamp(s.happiness + 25);
      s.cleanliness = clamp(s.cleanliness + 20);
      s.energy = clamp(s.energy + 30);
      doSave();
    },

    playground(petIdx) {
      const i = (typeof petIdx === "number") ? petIdx : 0;
      const s = petStats[i];
      s.happiness = clamp(s.happiness + 4);
      s.energy = clamp(s.energy - 2);
      doSave();
    },

    isMuted() {
      return muted;
    },

    getInventory(key) {
      if (key === undefined) return { ...gardenInventory };
      return gardenInventory[key] !== undefined ? gardenInventory[key] : 0;
    },
    addInventory(key, amount) {
      gardenInventory[key] = (gardenInventory[key] || 0) + (amount || 1);
      doSave();
    },
    useInventory(key) {
      if ((gardenInventory[key] || 0) <= 0) return false;
      gardenInventory[key]--;
      doSave();
      return true;
    },

    save() { doSave(); },
  };

  buildStatsUI();
  updateUI();
  applyMute();

  setInterval(tick, 500);
  setInterval(doSave, 10000);
  window.addEventListener("beforeunload", doSave);

  // ===========================================================
  // 🙂 FACES — which head a pet wears (head_<name>.png in images/parts/;
  // head_<name>_2.png for character 2, using the artSuffix in game_config.js).
  // A pet whose Shy stat is up wears head_shy.png (head_shy_1.png while a toy
  // touches it). What you do to the pet sets a face for a few seconds, so it is
  // still there when you come back to normal mode: fed something it likes ->
  // happy, disliked / trolled -> disgust, medicine -> heal, karaoke -> music,
  // shower -> shower. A pet with any stat under 20 is sick.
  // window.PetFace.set(i, name, ms) sets one by hand. A head that has no
  // picture for a character is simply skipped: that character keeps its head.
  // ===========================================================
  const faceNow = [];
  window.PetFace = {
    set(i, name, ms) { faceNow[i || 0] = name ? { name, until: performance.now() + (ms || 4000) } : null; },
    get(i) {
      const f = faceNow[i || 0];
      if (f && f.until > performance.now()) return f.name;
      const s = petStats[i || 0];
      if (s && Math.min(s.hunger, s.happiness, s.cleanliness, s.energy) < 20) return 'sick';
      if (s && s.shy >= SHY_FACE_AT) return 'shy';
      return null;
    },
  };
  // Every mode draws the pet from its own base picture. shyImg(img, i) gives
  // back that picture with the shy head on it while the pet is shy
  // (head_shy.png, or head_shy_1.png while a toy touches it), so a mode only
  // has to pass the picture it is about to draw through it. Special pose
  // pictures (base_happy, base_bath2 ...) are left alone: only the plain
  // base.png / base_2.png get the shy head.
  const shyCache = new Map();
  window.PetFace.shyImg = function (img, i) {
    try {
      if (!img || !img.complete || !img.naturalWidth) return img;
      // Wind blowing on the pet (trolling blower) shows head_shy_1 whatever its Shy
      // stat is; otherwise only a shy pet wears the shy head. Sick comes first.
      const face = window.PetFace.get(i);
      const wind = !!(window.ClothWind && window.ClothWind.get(i || 0) > 0);
      if (face !== 'shy' && !(wind && face !== 'sick')) return img;
      if (!img._plainHead && !/(?:^|\/)base(_2)?\.png(?:\?.*)?$/i.test(img.src)) return img;
      // a toy touching it, or wind blowing on it (trolling blower) -> head_shy_1
      const toy = !!(window._petToy && window._petToy[i || 0]) || wind;
      // The head follows the body being drawn: base_2.png (or a body built from
      // the _2 parts) gets the _2 head; character 2 drawing character 1's art
      // (no _2 art yet) gets the plain head.
      const suffix = img._plainHead ? (img._two ? '_2' : '') : (/base_2\.png/i.test(img.src) ? '_2' : '');
      const key = img.src + '|' + (toy ? 'shy_1' : 'shy') + suffix;
      let e = shyCache.get(key);
      if (!e) {
        const head = new Image();
        e = { head, out: null };
        // Draw the shy head over the body. A body built from parts keeps its
        // back hair etc.: the parts (all but the head) are redrawn under the
        // new head. A real base picture just has its head area replaced.
        const paint = layers => {
          try {
            const W = img.naturalWidth, H = img.naturalHeight;
            const c = document.createElement('canvas');
            c.width = W; c.height = H;
            const x = c.getContext('2d');
            if (layers) layers.forEach(l => x.drawImage(l, 0, 0, W, H));
            else { x.drawImage(img, 0, 0, W, H); x.clearRect(0, 0, W, Math.round(H * 606 / 1134)); }
            x.drawImage(head, 0, 0, W, H);
            // look like a loaded <img> to the modes' "is it ready" checks
            c.complete = true; c.naturalWidth = W; c.naturalHeight = H; c._failed = false;
            e.out = c;
          } catch (_) { /* pixels unreadable (file:// page) */ }
        };
        head.onload = () => {
          if (!img._plainHead) return paint(null);
          const cfg = window.RAGDOLL_CONFIG;
          const names = ((cfg && cfg.parts) || []).map(q => q.file).filter(n => n !== 'head');
          const list = names.length ? names : ['back_hair', 'wing_L', 'wing_R', 'back_tail', 'leg_L', 'leg_R', 'arm_L', 'arm_R', 'body', 'chest_L', 'chest_R'];
          const got = {};
          let left = list.length;
          const done = () => { if (--left === 0) paint(list.map(n => got[n]).filter(Boolean)); };
          list.forEach(n => {
            const im = new Image();
            im.onload = () => { got[n] = im; done(); };
            im.onerror = done;
            im.src = 'images/parts/' + n + suffix + '.png';
          });
        };
        const name = 'images/parts/head_' + (toy ? 'shy_1' : 'shy');
        // No head for character 2 yet: use the plain one.
        if (suffix) head.onerror = () => { head.onerror = null; head.src = name + '.png'; };
        head.src = name + suffix + '.png';
        shyCache.set(key, e);
      }
      return e.out || img;
    } catch (_) { return img; }
  };

  (function hookFaces() {
    const P = window.PetStats;
    const on = (method, pick, ms) => {
      const orig = P[method];
      P[method] = function (petIdx) {
        const r = orig.apply(this, arguments);
        const name = pick.apply(null, arguments);
        if (name) window.PetFace.set(typeof petIdx === 'number' ? petIdx : 0, name, ms);
        return r;
      };
    };
    on('feed', (i, liked) => liked ? 'happy' : 'disgust', 4000);
    on('feedSpecial', (i, type) => type === 'spicy' ? 'disgust' : 'happy', 4000);
    on('shower', () => 'shower', 2500);
    on('troll', () => 'disgust', 3000);
    on('karaoke', () => 'music', 5000);
    on('heal', () => 'heal', 5000);
    on('playground', () => 'happy', 3000);
  })();

  // 💪 Confidence button (in the mode bar, works in every mode): resets Shy.
  const confBtn = document.getElementById("confidence-btn");
  if (confBtn) {
    confBtn.addEventListener("click", () => {
      for (let i = 0; i < NUM_PETS; i++) {
        window.PetStats.confidence(i);
        window.PetFace.set(i, "happy", 2000);
      }
      updateUI();
      const hint = document.getElementById("hint-text") || document.getElementById("hint");
      if (hint) hint.textContent = "Confidence boosted!";
    });
  }
})();
