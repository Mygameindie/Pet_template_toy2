// ===========================================================
// 🎮 MODE MANAGER
// ===========================================================

window._modeName = "none";
window._modeCleanup = null;

window.setMode = function (name, startFunction) {

  if (typeof window._modeCleanup === "function") {
    try { window._modeCleanup(); } catch (e) {}
  }

  window._modeName = name;

  if (typeof startFunction === "function") {
    startFunction();
  }
};