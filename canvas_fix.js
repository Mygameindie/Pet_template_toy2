// canvas_fix.js
// Sizes the canvas to the viewport on load / resize / rotation.
// The HD (devicePixelRatio) scaling and crisp image sampling are handled
// centrally by hd_canvas.js — here we only deal with CSS-pixel dimensions.

(function () {
  const canvas = document.getElementById("canvas");
  if (!canvas) return;

  function resizeCanvas() {
    const cssWidth = window.innerWidth;
    const cssHeight = window.innerHeight;

    // Assigning width/height routes through hd_canvas.js, which scales the
    // backing store by the (capped) device pixel ratio for a sharp image.
    canvas.width = cssWidth;
    canvas.height = cssHeight;

    // Optional callback for your game
    if (typeof window.onGameResize === "function") {
      window.onGameResize(cssWidth, cssHeight);
    }
  }

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("orientationchange", resizeCanvas);

  resizeCanvas();
})();
