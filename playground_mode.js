// ===========================================================
// 🛝 PLAYGROUND MODE
// Pets stand still and play with balls.
// Drag balls at them — they'll jump when hit!
// Tap "Add Ball" to spawn more balls.
// ===========================================================

(() => {
  if (typeof window._modeCleanup === 'function') {
    try { window._modeCleanup(); } catch (_) {}
  }
  window._modeName = 'playground';

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

  const baseSets = [
    { stand: loadImg('base.png'),   fly0: loadImg('base.png'),   fly1: loadImg('base.png'),   fall: loadImg('base.png') },
    { stand: loadImg('base_2.png'), fly0: loadImg('base_2.png'), fly1: loadImg('base_2.png'), fall: loadImg('base_2.png') },
  ];

  function safeDraw(img, x, y, w, h) {
    if (!img || img._failed || !img.complete || img.naturalWidth === 0) return;
    ctx.drawImage(img, x, y, w, h);
  }

  // ==============================
  // Pet state — stationary
  // ==============================
  const PET_H = 450;
  // Match the main screen: derive width from the base image's real aspect ratio.
  let PET_W = window.PetArt ? window.PetArt.widthForHeight(PET_H) : 400;
  if (window.PetArt) window.PetArt.onReady(() => { PET_W = window.PetArt.widthForHeight(PET_H); });
  const gravity = 1.2;

  function makePet(xFrac, idx) {
    return {
      idx,
      x: canvas.width * xFrac,
      y: groundY - PET_H / 2,
      vy: 0,
      onGround: true,
      frame: 0,
      frameTimer: 0,
      jumpCooldown: 0,
    };
  }

  const pets = [makePet(0.3, 0), makePet(0.7, 1)];

  // ==============================
  // Balls
  // ==============================
  const BALL_R = 28;
  let ballIdCounter = 0;

  function makeBall(x, y) {
    return {
      id: ballIdCounter++,
      x,
      y,
      vx: (Math.random() - 0.5) * 6,
      vy: 0,
      dragging: false,
      hovering: false,
      lastX: x,
      lastY: y,
    };
  }

  const balls = [makeBall(canvas.width / 2, canvas.height * 0.3)];

  // ==============================
  // Drag
  // ==============================
  let draggedBall = null;
  let offsetX = 0, offsetY = 0;

  function getPtr(e) {
    const r = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - r.left, y: cy - r.top };
  }

  function ballAt(p) {
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      const dx = p.x - b.x, dy = p.y - b.y;
      if (Math.sqrt(dx * dx + dy * dy) <= BALL_R + 14) return b;
    }
    return null;
  }

  function onDown(e) {
    const p = getPtr(e);
    const b = ballAt(p);
    if (b) {
      draggedBall = b;
      b.dragging = true;
      b.vx = 0;
      b.vy = 0;
      offsetX = p.x - b.x;
      offsetY = p.y - b.y;
      b.lastX = b.x;
      b.lastY = b.y;
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    }
  }

  function onMove(e) {
    const p = getPtr(e);
    if (draggedBall) {
      draggedBall.lastX = draggedBall.x;
      draggedBall.lastY = draggedBall.y;
      draggedBall.x = p.x - offsetX;
      draggedBall.y = p.y - offsetY;
      if (e.touches) e.preventDefault();
    } else {
      // Hover cursor
      const b = ballAt(p);
      balls.forEach(ball => {
        const wasHover = ball.hovering;
        ball.hovering = (ball === b);
        if (wasHover !== ball.hovering) {
          canvas.style.cursor = ball.hovering ? 'grab' : 'default';
        }
      });
      if (!b) canvas.style.cursor = 'default';
    }
  }

  function onUp() {
    if (!draggedBall) return;
    draggedBall.dragging = false;
    draggedBall.vx = (draggedBall.x - draggedBall.lastX) * 1.4;
    draggedBall.vy = (draggedBall.y - draggedBall.lastY) * 1.4;
    draggedBall = null;
    canvas.style.cursor = 'default';
  }

  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseup', onUp);
  canvas.addEventListener('touchstart', onDown, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onUp);

  // ==============================
  // Add Ball button
  // ==============================
  const addBallBtn = document.createElement('button');
  addBallBtn.id = 'add-ball-btn';
  addBallBtn.innerText = '➕ Add Ball';
  addBallBtn.style.cssText = `
    position:fixed; bottom:calc(110px + env(safe-area-inset-bottom));
    left:10px; padding:6px 12px;
    font-size:clamp(11px,2.5vw,14px); cursor:pointer; z-index:9998;
    border-radius:8px; border:none; background:rgba(255,255,255,0.92);
    box-shadow:0 2px 8px rgba(0,0,0,0.15); white-space:nowrap;
  `;
  addBallBtn.addEventListener('click', () => {
    // Spawn from a random x near top
    balls.push(makeBall(
      canvas.width * (0.2 + Math.random() * 0.6),
      canvas.height * 0.15
    ));
  });
  document.body.appendChild(addBallBtn);

  // ==============================
  // Resize
  // ==============================
  function onResize() {
    resizeCanvas();
    groundY = canvas.height - groundHeight;
    // Keep pets on the ground after resize
    for (const pet of pets) {
      if (pet.onGround) pet.y = groundY - PET_H / 2;
    }
  }
  window.addEventListener('resize', onResize);

  // ==============================
  // Physics
  // ==============================
  function updateBalls() {
    for (const ball of balls) {
      if (ball.dragging) continue;

      ball.vy += gravity;
      ball.x += ball.vx;
      ball.y += ball.vy;

      // Ground bounce
      if (ball.y + BALL_R >= groundY) {
        ball.y = groundY - BALL_R;
        ball.vy *= -0.55;
        ball.vx *= 0.85;
        if (Math.abs(ball.vy) < 1.5) ball.vy = 0;
      }

      // Wall bounce
      if (ball.x - BALL_R < 0) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) * 0.7; }
      if (ball.x + BALL_R > canvas.width) { ball.x = canvas.width - BALL_R; ball.vx = -Math.abs(ball.vx) * 0.7; }
    }
  }

  function updatePets() {
    for (const pet of pets) {
      if (pet.jumpCooldown > 0) pet.jumpCooldown--;

      // Gravity when airborne
      if (!pet.onGround) {
        pet.vy += gravity;
        pet.y += pet.vy;
        if (pet.y + PET_H / 2 >= groundY) {
          pet.y = groundY - PET_H / 2;
          pet.vy = 0;
          pet.onGround = true;
        }
      }

      // Check each ball for collision
      for (const ball of balls) {
        const dx = ball.x - pet.x;
        const dy = ball.y - (pet.y - PET_H * 0.15);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < BALL_R + 90 && pet.onGround && pet.jumpCooldown === 0) {
          pet.vy = -20;
          pet.onGround = false;
          pet.jumpCooldown = 50;
          // Bounce ball away from pet
          const nx = dx / dist;
          ball.vx = nx * (Math.abs(ball.vx) + 5);
          ball.vy = -12;
          if (window.PetStats && typeof window.PetStats.playground === 'function') {
            window.PetStats.playground(pet.idx);
          }
        }
      }

      // Animate wing frames while airborne
      pet.frameTimer++;
      if (pet.frameTimer > 8) {
        pet.frameTimer = 0;
        pet.frame = (pet.frame + 1) % 2;
      }
    }
  }

  // ==============================
  // Draw
  // ==============================
  function drawGround() {
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(0, groundY, canvas.width, 14);
    ctx.fillStyle = '#5c4033';
    ctx.fillRect(0, groundY + 14, canvas.width, groundHeight - 14);
  }

  function drawBall(ball) {
    ctx.save();
    // Shadow
    ctx.beginPath();
    ctx.ellipse(ball.x, groundY + 6, Math.max(8, BALL_R - Math.max(0, groundY - ball.y - BALL_R) * 0.3), 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();

    // Glow when hovered/dragged
    if (ball.hovering || ball.dragging) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Body
    const grad = ctx.createRadialGradient(ball.x - BALL_R * 0.3, ball.y - BALL_R * 0.3, BALL_R * 0.1, ball.x, ball.y, BALL_R);
    grad.addColorStop(0, '#fde68a');
    grad.addColorStop(0.5, '#f59e0b');
    grad.addColorStop(1, '#b45309');
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Stripe
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, -0.4, 0.4);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }

  function getPetState(pet) {
    if (!pet.onGround) {
      return pet.vy > 5 ? 'fall' : (pet.frame === 0 ? 'fly0' : 'fly1');
    }
    return 'stand';
  }

  function drawPets() {
    for (const pet of pets) {
      const i = pet.idx;
      const state = getPetState(pet);

      let set = baseSets[i];
      let img = set[state];
      const needsTint = i === 1 && (img?._failed || !img?.complete);
      if (needsTint) { set = baseSets[0]; img = set[state]; }

      ctx.save();
      if (needsTint) ctx.filter = 'hue-rotate(140deg) saturate(1.2)';
      safeDraw(img, pet.x - PET_W / 2, pet.y - PET_H / 2, PET_W, PET_H);
      if (typeof window.drawOutfitOverlay === 'function') {
        window.drawOutfitOverlay(ctx, state, pet.x - PET_W / 2, pet.y - PET_H / 2, PET_W, PET_H, i);
      }
      ctx.restore();
    }
  }

  // ==============================
  // Loop
  // ==============================
  let running = true;
  let raf = 0;

  function loop() {
    if (!running) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    updateBalls();
    updatePets();

    drawGround();
    drawPets();
    for (const ball of balls) drawBall(ball);

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
    canvas.style.cursor = 'default';
    addBallBtn.remove();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

})();
