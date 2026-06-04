// ui_cleanup.js
// Prevent UI duplication + fix stacking on small devices

window.UICleanup = (function () {
  const tracked = new Set();

  function ensureContainer() {
    let ui = document.getElementById("ui");

    if (!ui) {
      ui = document.createElement("div");
      ui.id = "ui";
      document.body.appendChild(ui);
    }

    // Layout is handled by pet_style.css — only mark as ready
    if (!ui.dataset.ready) {
      ui.dataset.ready = "1";
    }

    return ui;
  }

  // Responsive sizing is now handled by pet_style.css media queries
  function applyResponsiveSizing() {
    // no-op: CSS handles all responsive button sizing
  }

  function createButton(text, onDown, onUp) {
    const ui = ensureContainer();
    const btn = document.createElement("button");
    btn.textContent = text;

    if (typeof onDown === "function")
      btn.addEventListener("pointerdown", onDown);

    if (typeof onUp === "function") {
      btn.addEventListener("pointerup", onUp);
      btn.addEventListener("pointercancel", onUp);
      btn.addEventListener("pointerleave", onUp);
    }

    ui.appendChild(btn);
    tracked.add(btn);

    applyResponsiveSizing();
    return btn;
  }

  function cleanup() {
    tracked.forEach(el => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    tracked.clear();
  }

  window.addEventListener("resize", applyResponsiveSizing);
  window.addEventListener("orientationchange", applyResponsiveSizing);

  return {
    createButton,
    cleanup
  };
})();