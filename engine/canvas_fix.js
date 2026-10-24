// canvas_fix.js
// Sizes the canvas to the viewport on load / resize / rotation, and keeps the
// page from getting stuck zoomed in (pinch / double-tap / ctrl+wheel zoom
// can't be undone once the canvas has been resized while zoomed).
// The HD (devicePixelRatio) scaling and crisp image sampling are handled
// centrally by hd_canvas.js — here we only deal with CSS-pixel dimensions.

(function () {
  const canvas = document.getElementById("canvas");
  if (!canvas) return;

  // Size from the layout viewport, ignoring any pinch zoom, so the canvas
  // never gets sized to a zoomed-in visual viewport.
  function viewportSize() {
    const de = document.documentElement;
    return {
      w: de.clientWidth || window.innerWidth,
      h: window.innerHeight || de.clientHeight,
    };
  }

  let lastW = 0, lastH = 0;
  function resizeCanvas() {
    const { w: cssWidth, h: cssHeight } = viewportSize();
    if (cssWidth === lastW && cssHeight === lastH) return;
    lastW = cssWidth;
    lastH = cssHeight;

    // Assigning width/height routes through hd_canvas.js, which scales the
    // backing store by the (capped) device pixel ratio for a sharp image.
    canvas.width = cssWidth;
    canvas.height = cssHeight;

    // Optional callback for your game
    if (typeof window.onGameResize === "function") {
      window.onGameResize(cssWidth, cssHeight);
    }
  }

  let resizeTimer = null;
  function scheduleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeCanvas, 80);
  }

  window.addEventListener("resize", scheduleResize);
  // Safari / iPad often send no resize event after the share sheet, the link
  // bar or another app (the window size settles late), which left the canvas
  // at its old size. Re-check when the page comes back, and now and then
  // while it is open (resizeCanvas does nothing when the size is unchanged).
  document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleResize(); });
  window.addEventListener("pageshow", scheduleResize);
  window.addEventListener("focus", scheduleResize);
  setInterval(() => { if (!document.hidden) resizeCanvas(); }, 500);

  window.addEventListener("orientationchange", () => {
    setTimeout(resizeCanvas, 200);
  });

  // ---- Zoom lock -------------------------------------------------------
  // iOS Safari ignores user-scalable=no, so block its pinch gestures.
  ["gesturestart", "gesturechange", "gestureend"].forEach((t) =>
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false })
  );

  // Multi-finger touches = pinch zoom on other browsers.
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches && e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );

  // Double-tap zoom.
  let lastTap = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      if (now - lastTap < 300 && e.cancelable) e.preventDefault();
      lastTap = now;
    },
    { passive: false }
  );

  // Desktop ctrl+wheel / trackpad pinch and ctrl +/- / 0 keyboard zoom.
  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false }
  );
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "_", "0"].includes(e.key)) {
      e.preventDefault();
    }
  });

  // If the page still ends up zoomed (visual viewport scaled), snap it back.
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      const vv = window.visualViewport;
      if (vv.scale > 1.01) {
        window.scrollTo(0, 0);
        const meta = document.querySelector('meta[name="viewport"]');
        if (meta) {
          const orig = meta.getAttribute("content");
          meta.setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no");
          setTimeout(() => meta.setAttribute("content", orig), 50);
        }
      }
      scheduleResize();
    });
  }

  // Keep fixed UI (stats panel) clear of any top inset / toolbar overlap and
  // undo stray page scroll that can push the page edge out of view.
  function syncTopInset() {
    const vv = window.visualViewport;
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    const off = vv && vv.scale <= 1.01 ? Math.max(0, vv.offsetTop) : 0;
    if (off > 0) document.documentElement.style.setProperty("--safe-top", off + "px");
    else document.documentElement.style.removeProperty("--safe-top");
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener("scroll", syncTopInset);
    window.visualViewport.addEventListener("resize", syncTopInset);
  }
  window.addEventListener("scroll", syncTopInset);
  window.addEventListener("pageshow", syncTopInset);
  syncTopInset();

  resizeCanvas();
})();
