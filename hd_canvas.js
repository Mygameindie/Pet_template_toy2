// ===========================================================
// 🖥️ hd_canvas.js — Central HD / Retina canvas helper
// ===========================================================
// Makes a <canvas> render at the device pixel ratio so the pet looks crisp on
// phones, WHILE letting all the existing game code keep thinking in CSS pixels.
//
// How it works: we shadow the canvas element's `width`/`height` so that when a
// mode does `canvas.width = window.innerWidth` we:
//   • store that as the CSS size (what the getter returns, so physics/layout
//     keep working exactly as before),
//   • set the real backing store to cssSize × dpr (the actual sharp pixels),
//   • pre-scale the 2D context by dpr and turn on high-quality sampling.
//
// The pixel ratio is capped (see MAX_DPR) so very high-density phones don't pay
// the full fill-rate cost — 2× is already "retina sharp" and keeps frame rates
// smooth, so HD is enabled everywhere without hurting performance.
(function () {
  // 2× is crisp on phones; capping avoids the ~2.25× extra pixels a 3× screen
  // would otherwise have to push every frame.
  const MAX_DPR = 2;

  function dpr() {
    return Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
  }

  const proto = HTMLCanvasElement.prototype;
  const wDesc = Object.getOwnPropertyDescriptor(proto, 'width');
  const hDesc = Object.getOwnPropertyDescriptor(proto, 'height');
  if (!wDesc || !hDesc || !wDesc.set || !hDesc.set) return;

  function enable(canvas) {
    if (!canvas || canvas.__hdEnabled) return canvas;
    canvas.__hdEnabled = true;

    let cssW = Math.max(1, canvas.clientWidth || window.innerWidth);
    let cssH = Math.max(1, canvas.clientHeight || window.innerHeight);

    function apply() {
      const d = dpr();
      // Real (device-pixel) backing store — the sharp part.
      wDesc.set.call(canvas, Math.max(1, Math.floor(cssW * d)));
      hDesc.set.call(canvas, Math.max(1, Math.floor(cssH * d)));
      // Keep the element its CSS size on screen.
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      // Draw in CSS coordinates (so existing code is unchanged) and sample
      // images at high quality. Setting the backing size above resets the
      // transform, so this must run after it.
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(d, 0, 0, d, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
      }
    }

    Object.defineProperty(canvas, 'width', {
      configurable: true,
      get() { return cssW; },
      set(v) { cssW = Math.max(1, Math.floor(Number(v) || 0)); apply(); },
    });
    Object.defineProperty(canvas, 'height', {
      configurable: true,
      get() { return cssH; },
      set(v) { cssH = Math.max(1, Math.floor(Number(v) || 0)); apply(); },
    });

    apply();
    return canvas;
  }

  window.HDCanvas = { enable, maxDPR: MAX_DPR };

  // Auto-enable the main game canvas. It lives above these scripts in the
  // markup, so it already exists; fall back to DOMContentLoaded just in case.
  const main = document.getElementById('canvas');
  if (main) {
    enable(main);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      const c = document.getElementById('canvas');
      if (c) enable(c);
    }, { once: true });
  }
})();
