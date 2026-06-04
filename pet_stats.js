// ===========================================================
// 📊 pet_stats.js — Pet Stats, Save/Load, Sound Settings
// Tracks hunger, happiness, cleanliness, energy per pet.
// Persists to localStorage. Provides global API for all modes.
// ===========================================================
(() => {
  const SAVE_KEY = "purelilypet_save";
  // Two pets. Character 2 uses the exact same stats system as character 1
  // (same defaults, same decay rates, same interaction effects).
  const NUM_PETS = 2;

  // Stat decay rates (points lost per second)
  const DECAY = {
    hunger: 0.15,
    happiness: 0.08,
    cleanliness: 0.06,
    energy: 0.10,
  };

  // --- Default stats ---
  function defaultStats() {
    return { hunger: 80, happiness: 90, cleanliness: 85, energy: 75 };
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
      outfits: Array.isArray(window.currentOutfits) ? window.currentOutfits.slice() : [0, 0],
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
      for (const key of ["hunger", "happiness", "cleanliness", "energy"]) {
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
})();
