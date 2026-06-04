// ===========================================================
// 🩺 DOCTOR MODE
// Pets show sick face. Drag the medicine to heal them.
// ✅ 2 pets
// ✅ base_sick.png / base_sick_2.png   — sick face (user provides)
// ✅ base_healed.png / base_healed_2.png — healed face (user provides)
// ✅ Falls back to base.png if sick/healed images not yet added
// ===========================================================

(() => {
  if (typeof window._modeCleanup === 'function') {
    try { window._modeCleanup(); } catch (_) {}
  }
  window._modeName = 'doctor';

  if (window.SoundManager) window.SoundManager.stopAll();

  // ==============================
  // Canvas
  // ==============================
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();

  const groundHeight = 100;
  let groundY = canvas.height - groundHeight;

  // ==============================
  // Images
  // ==============================
  function loadImg(src) {
    const img = new Image();
    img._failed = false;
    img.onerror = () => { img._failed = true; };
    img.src = src;
    return img;
  }

  // Per-pet image sets
  const imgSets = [
    {
      sick:   loadImg('base_sick.png'),
      healed: loadImg('base_healed.png'),
      normal: loadImg('base.png'),
    },
    {
      sick:   loadImg('base_sick_2.png'),
      healed: loadImg('base_healed_2.png'),
      normal: loadImg('base_2.png'),
    },
  ];

  function getImg(set, key) {
    const img = set[key];
    if (img && !img._failed && img.complete && img.naturalWidth > 0) return img;
    // fallback to normal
    if (set.normal.complete && set.normal.naturalWidth > 0) return set.normal;
    return null;
  }

  // ==============================
  // Pet state
  // ==============================
  const PET_H = 450;
  // Match the main screen: derive width from the base image's real aspect ratio.
  let PET_W = window.PetArt ? window.PetArt.widthForHeight(PET_H) : 400;
  if (window.PetArt) window.PetArt.onReady(() => { PET_W = window.PetArt.widthForHeight(PET_H); });

  const pets = [
    { idx: 0, phase: 'sick', healTimer: 0 },
    { idx: 1, phase: 'sick', healTimer: 0 },
  ];

  function petX(i) { return canvas.width * (i === 0 ? 0.35 : 0.65); }
  function petY()   { return groundY - PET_H / 2; }

  // ==============================
  // Medicine (draggable)
  // ==============================
  const PILL_R = 36;

  const medicine = {
    x: canvas.width / 2,
    y: canvas.height * 0.25,
    dragging: false,
  };

  // ==============================
  // Drag logic
  // ==============================
  let offsetX = 0, offsetY = 0;

  function getPtr(e) {
    const r = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - r.left, y: cy - r.top };
  }

  function onDown(e) {
    const p = getPtr(e);
    const dx = p.x - medicine.x;
    const dy = p.y - medicine.y;
    if (Math.sqrt(dx * dx + dy * dy) <= PILL_R + 10) {
      medicine.dragging = true;
      offsetX = dx;
      offsetY = dy;
      e.preventDefault();
    }
  }

  function onMove(e) {
    if (!medicine.dragging) return;
    const p = getPtr(e);
    medicine.x = p.x - offsetX;
    medicine.y = p.y - offsetY;
    if (e.touches) e.preventDefault();
  }

  function onUp() {
    medicine.dragging = false;
  }

  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseup', onUp);
  canvas.addEventListener('touchstart', onDown, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onUp);

  // ==============================
  // Resize
  // ==============================
  function onResize() {
    resizeCanvas();
    groundY = canvas.height - groundHeight;
  }
  window.addEventListener('resize', onResize);

  // ==============================
  // Draw helpers
  // ==============================
  function drawGround() {
    ctx.fillStyle = '#5c4033';
    ctx.fillRect(0, groundY, canvas.width, groundHeight);
  }

  function drawPet(pet) {
    const i = pet.idx;
    const set = imgSets[i];
    let img;

    if (pet.phase === 'healed') {
      img = getImg(set, 'healed');
    } else if (pet.phase === 'sick') {
      img = getImg(set, 'sick');
    } else {
      img = getImg(set, 'normal');
    }

    if (!img) return;

    // pet2 fallback tint
    const needsTint = (i === 1 && set.sick._failed && set.normal.src.endsWith('base.png'));
    ctx.save();
    if (needsTint) ctx.filter = 'hue-rotate(140deg) saturate(1.2)';
    ctx.drawImage(img, petX(i) - PET_W / 2, petY() - PET_H / 2, PET_W, PET_H);
    if (typeof window.drawOutfitOverlay === 'function') {
      window.drawOutfitOverlay(ctx, 'stand', petX(i) - PET_W / 2, petY() - PET_H / 2, PET_W, PET_H, i);
    }
    ctx.restore();
  }

  function drawMedicine() {
    const x = medicine.x;
    const y = medicine.y;

    // Pill body (two halves)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 8;

    // Left half
    ctx.beginPath();
    ctx.arc(x - PILL_R * 0.4, y, PILL_R, Math.PI * 0.5, Math.PI * 1.5);
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    // Right half
    ctx.beginPath();
    ctx.arc(x + PILL_R * 0.4, y, PILL_R, Math.PI * 1.5, Math.PI * 0.5);
    ctx.fillStyle = '#fafafa';
    ctx.fill();

    // Centre divider
    ctx.beginPath();
    ctx.moveTo(x, y - PILL_R);
    ctx.lineTo(x, y + PILL_R);
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Outline
    ctx.beginPath();
    ctx.roundRect(x - PILL_R - PILL_R * 0.4, y - PILL_R, (PILL_R + PILL_R * 0.4) * 2, PILL_R * 2, PILL_R);
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();

    // Label
    ctx.save();
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#555';
    ctx.fillText('Medicine', x, y + PILL_R + 18);
    ctx.restore();
  }

  function drawHint(pet) {
    const i = pet.idx;
    const label = pet.phase === 'sick' ? '😷 Sick!' : pet.phase === 'healed' ? '💚 Healed!' : '';
    if (!label) return;
    ctx.save();
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = pet.phase === 'sick' ? '#ef4444' : '#22c55e';
    ctx.fillText(label, petX(i), petY() - PET_H / 2 - 12);
    ctx.restore();
  }

  // ==============================
  // Overlap check: medicine → pet
  // ==============================
  const HEAL_RADIUS = 120;

  function checkHeal(pet) {
    if (pet.phase !== 'sick') return;
    const i = pet.idx;
    const dx = medicine.x - petX(i);
    const dy = medicine.y - (petY());
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < HEAL_RADIUS) {
      pet.phase = 'healed';
      pet.healTimer = 120; // frames to show healed face
      if (window.PetStats && typeof window.PetStats.heal === 'function') {
        window.PetStats.heal(i);
      }
      // Reset medicine to centre
      medicine.x = canvas.width / 2;
      medicine.y = canvas.height * 0.25;
    }
  }

  // ==============================
  // Victory state
  // ==============================
  let victoryTimer = 0;
  const VICTORY_FRAMES = 200;

  function allHealthy() {
    return pets.every(p => p.phase === 'healthy');
  }

  function drawVictory() {
    if (victoryTimer <= 0) return;

    const alpha = Math.min(1, victoryTimer / 40);
    const scale = 1 + 0.08 * Math.sin(victoryTimer * 0.15);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(canvas.width / 2, canvas.height * 0.38);
    ctx.scale(scale, scale);

    // Background pill
    ctx.beginPath();
    ctx.roundRect(-160, -36, 320, 72, 36);
    ctx.fillStyle = 'rgba(34,197,94,0.92)';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 18;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText('🎉 All Healed! 🎉', 0, 0);
    ctx.restore();
  }

  // ==============================
  // Update
  // ==============================
  function update() {
    for (const pet of pets) {
      if (pet.phase === 'healed') {
        pet.healTimer--;
        if (pet.healTimer <= 0) {
          pet.phase = 'healthy';
        }
      }
    }

    for (const pet of pets) {
      checkHeal(pet);
    }

    // Trigger victory when both pets become healthy
    if (allHealthy() && victoryTimer === 0) {
      victoryTimer = VICTORY_FRAMES;
    }
    if (victoryTimer > 0) victoryTimer--;
  }

  // ==============================
  // Loop
  // ==============================
  let running = true;
  let raf = 0;

  function loop() {
    if (!running) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    update();
    drawGround();

    for (const pet of pets) {
      drawPet(pet);
      drawHint(pet);
    }

    drawMedicine();
    drawVictory();
    raf = requestAnimationFrame(loop);
  }

  loop();

  // ==============================
  // Cleanup
  // ==============================
  window._modeCleanup = function () {
    running = false;
    cancelAnimationFrame(raf);
    canvas.removeEventListener('mousedown', onDown);
    canvas.removeEventListener('mousemove', onMove);
    canvas.removeEventListener('mouseup', onUp);
    canvas.removeEventListener('touchstart', onDown);
    canvas.removeEventListener('touchmove', onMove);
    canvas.removeEventListener('touchend', onUp);
    window.removeEventListener('resize', onResize);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

})();
