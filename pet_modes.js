// ===========================================================
// 🎧 GLOBAL SOUND MANAGER (shared across all modes)
// ===========================================================
if (!window.SoundManager) {
  window.SoundManager = {
    active: [],
    register(s) {
      this.active.push(s);
    },
    stopAll() {
      this.active.forEach(a => {
        try {
          a.pause();
          a.currentTime = 0;
        } catch {}
      });
      this.active = [];
    },
    playClone(base, volume = 0.9) {
      try {
        const s = base.cloneNode();
        s.volume = volume;
        s.play().catch(() => {});
        this.register(s);
      } catch {}
    }
  };
}


// ===========================================================
// 🧠 MODE CONTROLLER
// Ensures only ONE mode runs at a time
// ===========================================================

(function () {

  const hint = document.getElementById('hint-text') || document.getElementById('hint');
  let activeScripts = [];

  function unloadActiveMode() {

    if (window._modeCleanup && typeof window._modeCleanup === 'function') {
      try { window._modeCleanup(); } 
      catch (e) { console.warn('cleanup error', e); }
    }

    window._modeCleanup = null;
    window._modeName = null;

    // Remove all injected scripts
    activeScripts.forEach(s => s.remove());
    activeScripts = [];
  }

  function setActiveButton(id) {
    document.querySelectorAll('#mode-menu button').forEach(b => b.classList.remove('active'));
    const btn = id ? document.getElementById(id) : null;
    if (btn) btn.classList.add('active');
  }

  function loadMode(src, label, btnId) {

    if (window.SoundManager) window.SoundManager.stopAll();
    unloadActiveMode();
    setActiveButton(btnId);

    const scripts = Array.isArray(src) ? src : [src];
    let loadedCount = 0;

    scripts.forEach(path => {

      const s = document.createElement('script');
      s.src = path + '?v=' + Date.now(); // cache bust
      s.defer = true;

      s.onload = () => {
        loadedCount++;

        if (loadedCount === scripts.length) {
          if (hint) hint.textContent = label + ' Loaded';
          // IMPORTANT: do NOT overwrite window._modeName here.
          // Each mode script sets window._modeName (e.g. "shower") and
          // other systems (clothes/drag rules) depend on that exact value.
        }
      };

      s.onerror = () => {
        console.error('Failed to load', path);
        if (hint) hint.textContent = 'Error loading ' + label;
      };

      document.body.appendChild(s);
      activeScripts.push(s);
    });
  }


  // ============================
  // 🎮 BUTTON CONTROLS
  // ============================

  document.getElementById('normal-btn')?.addEventListener('click', () => {
    loadMode('pet_script.js', 'Normal Mode', 'normal-btn');
  });

  document.getElementById('karaoke-btn')?.addEventListener('click', () => {
    loadMode('music.js', 'Karaoke Mode', 'karaoke-btn');
  });

  // 🍱 Feed loads BOTH scripts as ONE mode
  document.getElementById('feed-btn')?.addEventListener('click', () => {
    loadMode(['pet_multi_feed.js'], 'Feeding Mode', 'feed-btn');
  });

  document.getElementById('shower-btn')?.addEventListener('click', () => {
    loadMode('pet_shower.js', 'Shower Mode', 'shower-btn');
  });

  document.getElementById('troll-btn')?.addEventListener('click', () => {
    loadMode('trolling.js', 'Trolling Mode', 'troll-btn');
  });

  document.getElementById('sleep-btn')?.addEventListener('click', () => {
    loadMode('pet_sleep.js', 'Sleep Mode', 'sleep-btn');
  });

  document.getElementById('doctor-btn')?.addEventListener('click', () => {
    loadMode('doctor_mode.js', 'Doctor Mode', 'doctor-btn');
  });

  document.getElementById('playground-btn')?.addEventListener('click', () => {
    loadMode('playground_mode.js', 'Playground Mode', 'playground-btn');
  });

  document.getElementById('garden-btn')?.addEventListener('click', () => {
    loadMode('pet_garden.js', 'Garden Mode', 'garden-btn');
  });

  // Auto-load Normal mode on first open
  loadMode('pet_script.js', 'Normal Mode', 'normal-btn');

})();