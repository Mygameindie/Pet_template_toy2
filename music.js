// ===========================================================
// 🎤 KARAOKE MODE (UPLOAD BUTTON VERSION) — AUTO PLAY AFTER UPLOAD
// ===========================================================
(() => {
  // Stop previous mode if exists
  if (typeof window._modeCleanup === "function") {
    try { window._modeCleanup(); } catch (e) {}
  }

  window._modeName = "karaoke";

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  // =========================
  // Active pet selection (tap pet 1 / 2)
  // =========================
  let _lastFits = [null, null];
  function _getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const t = (e.touches && e.touches[0]) ? e.touches[0] : e;
    const cx = (t.clientX != null) ? t.clientX : 0;
    const cy = (t.clientY != null) ? t.clientY : 0;
    return { x: cx - rect.left, y: cy - rect.top };
  }
  function _selectPetAt(e) {
    const p = _getPointerPos(e);
    // Check top-most first (pet2 drawn after pet1)
    for (let i = 1; i >= 0; i--) {
      const t = _lastFits[i];
      if (!t) continue;
      if (p.x >= t.x && p.x <= t.x + t.w && p.y >= t.y && p.y <= t.y + t.h) {
        if (typeof window.setActivePet === "function") window.setActivePet(i);
        break;
      }
    }
  }
  const _onPetPickMouse = (e) => { _selectPetAt(e); };
  const _onPetPickTouch = (e) => { _selectPetAt(e); };
  canvas.addEventListener("mousedown", _onPetPickMouse, { passive: true });
  canvas.addEventListener("touchstart", _onPetPickTouch, { passive: true });


  // =========================
  // Canvas resize
  // =========================
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  // =========================
  // Images (per pet)
  // =========================
  const petImgs = [
    { a: new Image(), b: new Image(), current: null, toggle: false }, // pet1
    { a: new Image(), b: new Image(), current: null, toggle: false }, // pet2
  ];

  // Pet 1 dance frames
  petImgs[0].a.src = "base_music1.png";
  petImgs[0].b.src = "base_music2.png";

  // Pet 2 dance frames (add these files). If missing, it will fallback to pet1.
  petImgs[1].a.src = "base_music1_2.png";
  petImgs[1].b.src = "base_music2_2.png";

  petImgs[0].current = petImgs[0].a;
  petImgs[1].current = petImgs[1].a;

  let rafId = 0;
  let danceInterval = null;

  function _imgOk(img) {
    return img && img.complete && img.naturalWidth > 0;
  }

  function getFit(img, idx) {
    const scale = 0.5;
    const h = 450;
    // Match the main screen: derive width from the base image's real aspect ratio.
    const w = window.PetArt ? window.PetArt.widthForHeight(h) : 400;
    const x = (idx === 0)
      ? (canvas.width * 0.35 - w / 2)
      : (canvas.width * 0.65 - w / 2);
    const y = canvas.height - h - 80;
    return { x, y, w, h };
  }

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 2; i++) {
      // Each pet can have its own frames; if pet2 frames are missing, fallback to pet1.
      let img = petImgs[i].current;
      if (!_imgOk(img)) img = petImgs[0].current;
      if (!_imgOk(img)) continue;

      const t = getFit(img, i);
      _lastFits[i] = t;
      ctx.drawImage(img, t.x, t.y, t.w, t.h);

      // Outfit overlay (per pet)
      if (window.drawOutfitOverlay) {
        window.drawOutfitOverlay(ctx, "stand", t.x, t.y, t.w, t.h, i);
      }
    }

    rafId = requestAnimationFrame(loop);
  }
  petImgs[0].a.onload = loop;

  function startDance() {
    clearInterval(danceInterval);

    danceInterval = setInterval(() => {
      for (let i = 0; i < 2; i++) {
        const p = petImgs[i];

        // If this pet's B frame is missing/broken, keep A
        if (!_imgOk(p.b)) {
          p.current = p.a;
          p.toggle = false;
          continue;
        }

        p.current = p.toggle ? p.a : p.b;
        p.toggle = !p.toggle;
      }
    }, 400);
  }

  function stopDance() {
    clearInterval(danceInterval);
    danceInterval = null;

    for (let i = 0; i < 2; i++) {
      petImgs[i].toggle = false;
      petImgs[i].current = petImgs[i].a;
    }
  }

  // =========================
  // Hidden File Input
  // =========================
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "audio/*,video/*";
  input.style.display = "none";
  document.body.appendChild(input);

  // =========================
  // Upload Button
  // =========================
  const uploadBtn = document.createElement("button");
  uploadBtn.textContent = "🎵 Upload Song";
  Object.assign(uploadBtn.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    zIndex: "10000",
    background: "#ff4d6d",
    color: "white",
    border: "none",
    borderRadius: "10px",
    padding: "10px 18px",
    fontSize: "16px",
    cursor: "pointer",
  });
  document.body.appendChild(uploadBtn);

  uploadBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    input.value = ""; // allow selecting same file again
    input.click();
  });

  // =========================
  // Player UI
  // =========================
  const progressContainer = document.createElement("div");
  Object.assign(progressContainer.style, {
    position: "fixed",
    bottom: "86px", // sit above the bottom mode-menu bar
    left: "50%",
    transform: "translateX(-50%)",
    width: "80%",
    height: "10px",
    background: "rgba(255,255,255,0.5)",
    borderRadius: "10px",
    overflow: "hidden",
    display: "none",
    zIndex: "9999",
  });

  const progressBar = document.createElement("div");
  Object.assign(progressBar.style, {
    height: "100%",
    width: "0%",
    background: "linear-gradient(90deg, #00bfff, #ff00ff)",
  });

  progressContainer.appendChild(progressBar);
  document.body.appendChild(progressContainer);

  const timeLabel = document.createElement("div");
  Object.assign(timeLabel.style, {
    position: "fixed",
    bottom: "104px", // sit above the bottom mode-menu bar
    left: "50%",
    transform: "translateX(-50%)",
    color: "white",
    fontSize: "14px",
    display: "none",
    zIndex: "9999",
    textShadow: "0 1px 2px rgba(0,0,0,0.6)",
    fontFamily: "Arial, sans-serif",
  });
  document.body.appendChild(timeLabel);

  const playBtn = document.createElement("button");
  playBtn.textContent = "⏸️ Pause";
  Object.assign(playBtn.style, {
    position: "fixed",
    bottom: "96px", // sit above the bottom mode-menu bar
    right: "20px",
    zIndex: "10000",
    display: "none",
    background: "rgba(255,255,255,0.5)",
    border: "2px solid #999",
    borderRadius: "10px",
    padding: "10px 15px",
    fontSize: "18px",
    cursor: "pointer",
  });
  document.body.appendChild(playBtn);

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  // Tap overlay if autoplay is blocked
  function showTapOverlay(onTap) {
    const overlay = document.createElement("div");
    overlay.textContent = "🎬 Tap to start playback";
    Object.assign(overlay.style, {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.55)",
      color: "white",
      fontSize: "24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "20000",
      cursor: "pointer",
      userSelect: "none",
    });
    document.body.appendChild(overlay);

    const handler = async () => {
      try { await onTap(); } catch (e) {}
      try { overlay.remove(); } catch (e) {}
      document.removeEventListener("click", handler);
      document.removeEventListener("touchstart", handler);
    };

    document.addEventListener("click", handler, { once: true });
    document.addEventListener("touchstart", handler, { once: true });
  }

  let mediaPlayer = null;
  let progressTimer = null;
  let isPaused = false;

  function stopAudio() {
    clearInterval(progressTimer);
    progressTimer = null;

    stopDance();

    if (mediaPlayer) {
      try { mediaPlayer.pause(); } catch (e) {}
      try { mediaPlayer.remove(); } catch (e) {}
      mediaPlayer = null;
    }

    progressContainer.style.display = "none";
    playBtn.style.display = "none";
    timeLabel.style.display = "none";
    progressBar.style.width = "0%";
    timeLabel.textContent = "0:00 / 0:00";
    playBtn.textContent = "⏸️ Pause";
    isPaused = false;
  }

  playBtn.addEventListener("click", () => {
    if (!mediaPlayer) return;

    if (!isPaused) {
      mediaPlayer.pause();
      playBtn.textContent = "▶️ Play";
      stopDance();
      isPaused = true;
    } else {
      mediaPlayer.play().then(() => {
        playBtn.textContent = "⏸️ Pause";
        startDance();
        isPaused = false;
      }).catch(() => {
        showTapOverlay(() => mediaPlayer.play().then(() => {
          playBtn.textContent = "⏸️ Pause";
          startDance();
          isPaused = false;
        }));
      });
    }
  });

  function startProgress() {
    clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      if (!mediaPlayer) return;
      const dur = mediaPlayer.duration;
      const cur = mediaPlayer.currentTime;

      if (isFinite(dur) && dur > 0) {
        const percent = (cur / dur) * 100;
        progressBar.style.width = percent + "%";
        timeLabel.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
      } else {
        timeLabel.textContent = `${formatTime(cur)} / 0:00`;
      }
    }, 100);
  }

  input.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    stopAudio();

    const url = URL.createObjectURL(file);

    mediaPlayer = document.createElement("audio");
    mediaPlayer.src = url;
    mediaPlayer.style.display = "none";
    mediaPlayer.volume = 0.9;
    document.body.appendChild(mediaPlayer);

    progressContainer.style.display = "block";
    playBtn.style.display = "block";
    timeLabel.style.display = "block";
    playBtn.textContent = "⏸️ Pause";
    isPaused = false;

    startProgress();

    // ✅ Auto-play immediately
    // Karaoke boosts happiness for both pets
    if (window.PetStats) {
      window.PetStats.karaoke(0);
      window.PetStats.karaoke(1);
    }
    try {
      await mediaPlayer.play();
      startDance();
    } catch (err) {
      // If blocked, show tap overlay instead of needing to upload twice
      playBtn.textContent = "▶️ Play";
      isPaused = true;
      stopDance();
      showTapOverlay(async () => {
        await mediaPlayer.play();
        playBtn.textContent = "⏸️ Pause";
        isPaused = false;
        startDance();
      });
    }

    mediaPlayer.onended = () => {
      stopAudio();
    };
  });

  // =========================
  // Cleanup
  // =========================
  window._modeCleanup = function () {
    cancelAnimationFrame(rafId);
    stopAudio();
    uploadBtn.remove();
    input.remove();
    progressContainer.remove();
    playBtn.remove();
    timeLabel.remove();
    canvas.removeEventListener("mousedown", _onPetPickMouse);
    canvas.removeEventListener("touchstart", _onPetPickTouch);
    window.removeEventListener("resize", resize);
  };
})();