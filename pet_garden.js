// ===========================================================
// 🌱 pet_garden.js — Garden Mode
// Plant seeds in dirt patches, water them to grow instantly,
// harvest with scythe → food flies to bag → linked to feed mode inventory.
// HD/Retina canvas enabled. Base image names: base.png, base_2.png
// ===========================================================
(function () {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  // ===== HD / RETINA CANVAS SETUP =====
  // HD (devicePixelRatio) scaling + crisp sampling are handled centrally by
  // hd_canvas.js. We just set the CSS-pixel size; the helper does the rest.
  function resizeCanvasHD() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  resizeCanvasHD();

  // ===== LAYOUT CONSTANTS =====
  const FENCE_Y_RATIO = 0.48;

  function getCanvasW() {
    return window.innerWidth;
  }

  function getCanvasH() {
    return window.innerHeight;
  }

  function getFenceY() {
    return getCanvasH() * FENCE_Y_RATIO;
  }

  function getDirtPatches() {
    const w = getCanvasW();
    const fenceY = getFenceY();
    const dirtTop = fenceY + 18;
    const dirtH = Math.min(getCanvasH() * 0.28, 180);
    const patchW = Math.min(w * 0.24, 200);

    return [
      { x: w * 0.08, y: dirtTop, w: patchW, h: dirtH },
      { x: w * 0.5 - patchW / 2, y: dirtTop, w: patchW, h: dirtH },
      { x: w * 0.92 - patchW, y: dirtTop, w: patchW, h: dirtH },
    ];
  }

  // ===== PET IMAGES =====
  function createImg(src) {
    const img = new Image();
    img._failed = false;
    img.onerror = () => {
      img._failed = true;
    };
    img.src = src;
    return img;
  }

  const petImgs = [
    createImg('base.png'),
    createImg('base_2.png')
  ];

  // ===== GROWTH TIMING =====
  const SEC_GROWING = 7;
  const SEC_READY = 15;

  // ===== GARDEN STATE =====
  const GARDEN_KEY = 'purelilypet_garden';
  const patches = [[], [], []];

  function loadGardenState() {
    try {
      const raw = localStorage.getItem(GARDEN_KEY);
      if (!raw) return;

      const data = JSON.parse(raw);

      if (Array.isArray(data.patches)) {
        data.patches.forEach((p, i) => {
          if (Array.isArray(p) && patches[i]) {
            patches[i] = p.map(pl => ({ ...pl }));
          }
        });
      }
    } catch {}
  }

  function saveGardenState() {
    try {
      localStorage.setItem(GARDEN_KEY, JSON.stringify({
        patches: patches.map(p => p.map(pl => ({
          crop: pl.crop,
          plantedAt: pl.plantedAt,
          stage: pl.stage,
          offX: pl.offX || 0,
        }))),
      }));
    } catch {}
  }

  loadGardenState();

  function updateStages() {
    const now = Date.now();

    patches.forEach(patch => {
      patch.forEach(plant => {
        const elapsed = (now - plant.plantedAt) / 1000;

        if (elapsed >= SEC_READY) {
          plant.stage = 'ready';
        } else if (elapsed >= SEC_GROWING) {
          plant.stage = 'growing';
        } else {
          plant.stage = 'seedling';
        }
      });
    });
  }

  // ===== CROPS CONFIG =====
  let crops = [];
  const cropImgs = {};

  async function loadCrops() {
    const res = await fetch('garden_items.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('garden_items.json not found');

    const cfg = await res.json();
    crops = cfg.crops || [];

    crops.forEach(c => {
      const img = new Image();
      img.src = c.seedImg;
      cropImgs[c.key] = img;
    });

    buildToolbar();
  }

  // ===== TOOL STATE =====
  let selectedTool = 'plant';
  let selectedCrop = null;

  // ===== TOOLBAR DOM =====
  let toolbar = null;

  function buildToolbar() {
    if (toolbar) toolbar.remove();

    toolbar = document.createElement('div');
    toolbar.id = 'garden-toolbar';

    Object.assign(toolbar.style, {
      position: 'fixed',
      bottom: '70px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: '6px',
      background: 'rgba(255,255,255,0.93)',
      borderRadius: '14px',
      padding: '6px 10px',
      zIndex: '9999',
      maxWidth: '92vw',
      overflowX: 'auto',
      alignItems: 'center',
      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
    });

    [
      { key: 'plant', emoji: '🌱', label: 'Plant seed' },
      { key: 'water', emoji: '💧', label: 'Water (instant grow)' },
      { key: 'scythe', emoji: '🌾', label: 'Harvest ready crops' },
    ].forEach(t => {
      const btn = document.createElement('button');
      btn.dataset.tool = t.key;
      btn.textContent = t.emoji;
      btn.title = t.label;

      applyToolStyle(btn, t.key === selectedTool);

      btn.addEventListener('click', () => {
        selectedTool = t.key;
        updateHighlights();
      });

      toolbar.appendChild(btn);
    });

    const sep = document.createElement('div');
    Object.assign(sep.style, {
      width: '1px',
      background: '#e5e7eb',
      margin: '0 4px',
      alignSelf: 'stretch',
    });
    toolbar.appendChild(sep);

    crops.forEach(crop => {
      const btn = document.createElement('button');
      btn.dataset.crop = crop.key;
      btn.title = crop.label;

      const img = document.createElement('img');
      img.src = crop.seedImg;

      Object.assign(img.style, {
        width: '28px',
        height: '28px',
        objectFit: 'contain',
        display: 'block',
      });

      img.onerror = () => {
        btn.textContent = crop.label[0] || '?';
      };

      btn.appendChild(img);
      applyToolStyle(btn, false);

      btn.addEventListener('click', () => {
        selectedCrop = crop.key;
        selectedTool = 'plant';
        updateHighlights();
      });

      toolbar.appendChild(btn);
    });

    document.body.appendChild(toolbar);

    if (!selectedCrop && crops.length > 0) {
      selectedCrop = crops[0].key;
    }

    updateHighlights();
  }

  function applyToolStyle(btn, active) {
    Object.assign(btn.style, {
      border: active ? '2px solid #f59e0b' : '2px solid #e5e7eb',
      borderRadius: '8px',
      padding: '4px 6px',
      background: active ? '#fef3c7' : 'white',
      cursor: 'pointer',
      fontSize: '18px',
      lineHeight: '1',
    });
  }

  function updateHighlights() {
    if (!toolbar) return;

    toolbar.querySelectorAll('button[data-tool]').forEach(btn => {
      applyToolStyle(btn, btn.dataset.tool === selectedTool);
    });

    toolbar.querySelectorAll('button[data-crop]').forEach(btn => {
      applyToolStyle(
        btn,
        btn.dataset.crop === selectedCrop && selectedTool === 'plant'
      );
    });
  }

  // ===== BAG DOM =====
  let bagEl = null;

  function buildBag() {
    bagEl = document.createElement('div');
    bagEl.id = 'garden-bag';

    Object.assign(bagEl.style, {
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: 'rgba(255,255,255,0.93)',
      borderRadius: '12px',
      padding: '6px 12px',
      fontSize: '15px',
      zIndex: '9999',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      transition: 'transform 0.15s',
    });

    document.body.appendChild(bagEl);
    updateBagUI();
  }

  function updateBagUI() {
    if (!bagEl || !window.PetStats) return;

    const inv = window.PetStats.getInventory();
    const total = Object.values(inv).reduce((a, b) => a + b, 0);

    bagEl.textContent = '🎒 ' + total;
  }

  // ===== FLY-TO-BAG ANIMATION =====
  function flyToBag(screenX, screenY, cropKey, onDone) {
    const el = document.createElement('div');
    el.textContent = '🍬';

    Object.assign(el.style, {
      position: 'fixed',
      fontSize: '22px',
      left: screenX + 'px',
      top: screenY + 'px',
      zIndex: '99999',
      pointerEvents: 'none',
    });

    document.body.appendChild(el);

    const bagRect = bagEl
      ? bagEl.getBoundingClientRect()
      : {
          left: window.innerWidth - 80,
          top: 10,
          width: 60,
          height: 30,
        };

    const tx = bagRect.left + bagRect.width / 2;
    const ty = bagRect.top + bagRect.height / 2;

    requestAnimationFrame(() => {
      Object.assign(el.style, {
        transition: 'left 0.55s ease-in, top 0.55s ease-in, opacity 0.55s ease-in',
        left: tx + 'px',
        top: ty + 'px',
        opacity: '0',
      });

      setTimeout(() => {
        el.remove();

        if (window.PetStats) {
          window.PetStats.addInventory(cropKey, 2);
          updateBagUI();

          if (typeof window._refreshFeedToolbar === 'function') {
            window._refreshFeedToolbar();
          }
        }

        if (bagEl) {
          bagEl.style.transform = 'scale(1.35)';
          setTimeout(() => {
            if (bagEl) bagEl.style.transform = '';
          }, 180);
        }

        if (onDone) onDone();
      }, 580);
    });
  }

  // ===== CANVAS INTERACTION =====
  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;

    return {
      x: src.clientX - r.left,
      y: src.clientY - r.top,
      screenX: src.clientX,
      screenY: src.clientY,
    };
  }

  let dragPos = null;

  function onDown(e) {
    const p = canvasPos(e);
    dragPos = p;
    e.preventDefault();
  }

  function onMove(e) {
    if (!dragPos) return;

    dragPos = canvasPos(e);

    if (e.touches) e.preventDefault();
  }

  function onUp() {
    if (!dragPos) return;

    const p = dragPos;
    dragPos = null;

    handleAction(p);
  }

  function pointInPatch(p, patch) {
    return (
      p.x >= patch.x &&
      p.x <= patch.x + patch.w &&
      p.y >= patch.y &&
      p.y <= patch.y + patch.h
    );
  }

  function handleAction(p) {
    const dirtPatches = getDirtPatches();

    for (let i = 0; i < dirtPatches.length; i++) {
      const patch = dirtPatches[i];

      if (!pointInPatch(p, patch)) continue;

      if (selectedTool === 'plant' && selectedCrop) {
        patches[i].push({
          crop: selectedCrop,
          plantedAt: Date.now(),
          stage: 'seedling',
          offX: (Math.random() - 0.5) * (patch.w * 0.55),
        });

        saveGardenState();

      } else if (selectedTool === 'water') {
        patches[i].forEach(plant => {
          plant.stage = 'ready';
          plant.plantedAt = Date.now() - SEC_READY * 1000;
        });

        saveGardenState();

      } else if (selectedTool === 'scythe') {
        const ready = patches[i].filter(pl => pl.stage === 'ready');

        if (ready.length === 0) break;

        const canvasRect = canvas.getBoundingClientRect();

        ready.forEach((plant, idx) => {
          const plantCanvasX = patch.x + patch.w / 2 + (plant.offX || 0);
          const plantCanvasY = patch.y + patch.h * 0.35;
          const sx = canvasRect.left + plantCanvasX;
          const sy = canvasRect.top + plantCanvasY;

          setTimeout(() => {
            flyToBag(sx, sy, plant.crop, null);
          }, idx * 140);
        });

        patches[i] = patches[i].filter(pl => pl.stage !== 'ready');
        saveGardenState();
      }

      break;
    }
  }

  canvas.addEventListener('mousedown', onDown, { passive: false });
  canvas.addEventListener('mousemove', onMove, { passive: false });
  canvas.addEventListener('mouseup', onUp);
  canvas.addEventListener('touchstart', onDown, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onUp);

  // ===== DRAW HELPERS =====
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawScene() {
    const w = getCanvasW();
    const h = getCanvasH();
    const fenceY = getFenceY();
    const dirtPatches = getDirtPatches();

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, fenceY);
    sky.addColorStop(0, '#bfdbfe');
    sky.addColorStop(1, '#dbeafe');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, fenceY);

    // Grass
    ctx.fillStyle = '#86efac';
    ctx.fillRect(0, fenceY, w, h - fenceY);

    // Dirt patches
    dirtPatches.forEach(patch => {
      ctx.fillStyle = '#7c3f14';
      roundRect(patch.x - 2, patch.y - 2, patch.w + 4, patch.h + 4, 10);
      ctx.fill();

      ctx.fillStyle = '#a16207';
      roundRect(patch.x, patch.y, patch.w, patch.h, 8);
      ctx.fill();

      ctx.fillStyle = '#92400e';
      roundRect(patch.x + 5, patch.y + 5, patch.w - 10, patch.h - 10, 5);
      ctx.fill();
    });

    // Pets behind fence
    drawLockedPets(fenceY);

    // Fence
    drawFence(w, fenceY);

    // Plants
    drawPlants(dirtPatches);

    // Tool cursor
    if (dragPos) drawToolCursor(dragPos.x, dragPos.y);
  }

  function drawFence(w, fenceY) {
    const postW = 10;
    const postSpacing = 55;
    const postTop = fenceY - 28;
    const postH = 70;

    ctx.fillStyle = '#b45309';

    for (let x = 5; x < w; x += postSpacing) {
      roundRect(x, postTop, postW, postH, 3);
      ctx.fill();
    }

    ctx.fillStyle = '#d97706';
    ctx.fillRect(0, fenceY - 14, w, 10);
    ctx.fillRect(0, fenceY + 16, w, 10);
  }

  function drawLockedPets(fenceY) {
    const petH = Math.min(getCanvasH() * 0.28, 210);
    // Use the base image's real aspect ratio (matches every other mode).
    const petW = window.PetArt ? window.PetArt.widthForHeight(petH) : petH * (400 / 450);
    const petY = fenceY - petH - 10;

    [
      {
        x: getCanvasW() * 0.22 - petW / 2,
        idx: 0,
        filter: 'none',
      },
      {
        x: getCanvasW() * 0.78 - petW / 2,
        idx: 1,
        filter: 'hue-rotate(140deg) saturate(1.2)',
      },
    ].forEach(({ x, idx, filter }) => {
      let img = petImgs[idx];
      let useFilter = filter;

      if (!img || img._failed || !img.complete || img.naturalWidth === 0) {
        img = petImgs[0];
        useFilter = idx === 1
          ? 'hue-rotate(140deg) saturate(1.2)'
          : 'none';
      }

      if (img && img.complete && img.naturalWidth > 0 && !img._failed) {
        ctx.save();

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.filter = useFilter;

        ctx.drawImage(img, x, petY, petW, petH);

        if (typeof window.drawOutfitOverlay === 'function') {
          window.drawOutfitOverlay(ctx, 'stand', x, petY, petW, petH, idx);
        }

        ctx.restore();
      }
    });
  }

  function drawPlants(dirtPatches) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    dirtPatches.forEach((patch, pi) => {
      patches[pi].forEach(plant => {
        const px = patch.x + patch.w / 2 + (plant.offX || 0);
        const py = patch.y + patch.h * 0.38;

        let emoji = '🌱';
        let size = 20;

        if (plant.stage === 'growing') {
          emoji = '🌿';
          size = 28;
        } else if (plant.stage === 'ready') {
          emoji = '🌻';
          size = 36;
        }

        if (plant.stage === 'ready') {
          ctx.save();
          ctx.shadowColor = '#fbbf24';
          ctx.shadowBlur = 14;
        }

        ctx.font = size + 'px serif';
        ctx.fillText(emoji, px, py);

        if (plant.stage === 'ready' && cropImgs[plant.crop]) {
          const fi = cropImgs[plant.crop];

          if (fi && fi.complete && fi.naturalWidth > 0) {
            ctx.drawImage(fi, px - 14, py - size - 20, 28, 28);
          }
        }

        if (plant.stage === 'ready') ctx.restore();
      });
    });
  }

  function drawToolCursor(x, y) {
    let emoji = '🌱';

    if (selectedTool === 'water') {
      emoji = '💧';
    } else if (selectedTool === 'scythe') {
      emoji = '🌾';
    }

    ctx.font = '28px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x, y - 20);
  }

  // ===== RESIZE =====
  function onResize() {
    resizeCanvasHD();
  }

  window.addEventListener('resize', onResize);

  // ===== MAIN LOOP =====
  let raf = 0;

  function loop() {
    ctx.clearRect(0, 0, getCanvasW(), getCanvasH());
    updateStages();
    drawScene();
    raf = requestAnimationFrame(loop);
  }

  const saveInterval = setInterval(saveGardenState, 10000);

  // ===== INIT =====
  window._gardenMode = true;
  window._modeName = 'garden';

  buildBag();

  loadCrops().catch(err => {
    console.error(err);
    buildToolbar();
  });

  loop();

  // ===== CLEANUP =====
  window._modeCleanup = function () {
    cancelAnimationFrame(raf);
    clearInterval(saveInterval);

    canvas.removeEventListener('mousedown', onDown);
    canvas.removeEventListener('mousemove', onMove);
    canvas.removeEventListener('mouseup', onUp);
    canvas.removeEventListener('touchstart', onDown);
    canvas.removeEventListener('touchmove', onMove);
    canvas.removeEventListener('touchend', onUp);

    window.removeEventListener('resize', onResize);

    window._gardenMode = false;

    saveGardenState();

    if (toolbar) {
      toolbar.remove();
      toolbar = null;
    }

    if (bagEl) {
      bagEl.remove();
      bagEl = null;
    }
  };
})();