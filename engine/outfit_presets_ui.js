// ===========================================================
// ⚙️ outfit_presets_ui.js — Apply logic + UI for outfit presets (SHARED ENGINE)
// The preset LIST lives per-game in outfit_presets.js; this file only
// provides the button, panel, and apply logic. No need to edit this
// to add presets.
// ===========================================================
(() => {
  const DEFAULT_COLOR = "Original";

  function categoryKeys() {
    if (window.OUTFIT_CONFIG && Array.isArray(window.OUTFIT_CONFIG.categories)) {
      return window.OUTFIT_CONFIG.categories.map(c => c.key);
    }
    // Fallback: whatever the active outfit object already has.
    return Object.keys((window.selectedClothes && window.selectedClothes[0]) || {});
  }

  // Presets list pet1's item ids (e.g. "top1"). Character 2's wardrobe uses the
  // "_2" suffix ("top1_2"), so translate each id to the one that actually
  // exists in the target character's catalog. An item whose art is missing for
  // this character (e.g. no hat PNG for character 2) resolves to 0 (None), so
  // the same preset works on both characters — each just wears what it has.
  function resolveItemForPet(p, category, id) {
    if (id === 0 || id === "0" || id == null) return 0;
    const items = (window.dressUpCatalog && window.dressUpCatalog[p] &&
      window.dressUpCatalog[p][category] && window.dressUpCatalog[p][category].items) || null;
    if (!items) return id;
    const ok = key => !!(items[key] && (!items[key].img || !items[key].img._failed));
    if (ok(id)) return id;
    if (ok(id + "_2")) return id + "_2";
    const stripped = String(id).replace(/_2$/, "");
    if (ok(stripped)) return stripped;
    return 0;
  }

  // A preset can define a different look per character: a `pet1`/`pet2` block
  // ({ clothes, colors }) wins for that character; otherwise the preset's
  // top-level clothes/colors are used. This is how the girl can wear a dress
  // while the boy wears a top + pants for the same preset.
  function outfitForPet(preset, p) {
    const per = preset["pet" + (p + 1)];
    // A per-character clothes list is a complete look of its own, so it does
    // NOT inherit the other look's colors (those may belong to garments this
    // character isn't wearing) — omit colors and you get Original.
    if (per && per.clothes) return { clothes: per.clothes, colors: per.colors || {} };
    // Colors-only override: same clothes, different colors for this character.
    if (per && per.colors) return { clothes: preset.clothes || {}, colors: per.colors };
    return { clothes: preset.clothes || {}, colors: preset.colors || {} };
  }

  // Apply a full preset to the active character. Every category not named by
  // the preset is cleared, so a preset always defines the complete look.
  function applyPreset(preset) {
    if (!preset) return;
    if (window._modeName === "shower") return; // clothes are off in the shower

    if (!Array.isArray(window.selectedClothes)) window.selectedClothes = [{}];
    if (!Array.isArray(window.clothingColors)) window.clothingColors = [{}];
    const p = (typeof window.activePetIndex === "number") ? window.activePetIndex : 0;
    const sel = (window.selectedClothes[p] = window.selectedClothes[p] || {});
    const col = (window.clothingColors[p] = window.clothingColors[p] || {});

    const { clothes, colors } = outfitForPet(preset, p);

    categoryKeys().forEach(k => {
      sel[k] = (clothes[k] != null) ? resolveItemForPet(p, k, clothes[k]) : 0;
      col[k] = colors[k] || DEFAULT_COLOR;
    });

    // Refresh the Dress Up panel/button if the outfit system exposes the hook.
    if (typeof window.refreshDressUpUI === "function") window.refreshDressUpUI();
  }

  // Public API so other code can apply a preset by name.
  window.applyOutfitPreset = function (name) {
    const list = window.OUTFIT_PRESETS || [];
    const preset = list.find(p => p && p.name === name);
    applyPreset(preset);
    return !!preset;
  };

  // -------------------------------------------------------------------------
  // UI: floating "🎀 Outfits" button + popup of preset buttons
  // -------------------------------------------------------------------------
  const btnCss =
    "position:fixed;left:10px;bottom:calc(65px + env(safe-area-inset-bottom));" +
    "z-index:9998;padding:6px 12px;font-size:clamp(11px,2.5vw,14px);cursor:pointer;" +
    "border-radius:8px;border:none;background:rgba(255,255,255,.92);" +
    "box-shadow:0 2px 8px rgba(0,0,0,.15);white-space:nowrap;";

  let presetBtn = document.getElementById("preset-btn");
  if (!presetBtn) {
    presetBtn = document.createElement("button");
    presetBtn.id = "preset-btn";
    presetBtn.textContent = "🎀 Outfits";
    presetBtn.style.cssText = btnCss;
    document.body.appendChild(presetBtn);
  }

  let panel = document.getElementById("preset-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "preset-panel";
    panel.style.cssText =
      "position:fixed;left:10px;bottom:calc(108px + env(safe-area-inset-bottom));" +
      "width:min(280px,calc(100vw - 20px));max-height:54vh;overflow:auto;display:none;" +
      "z-index:9999;padding:10px;border-radius:12px;background:rgba(255,255,255,.97);" +
      "box-shadow:0 6px 24px rgba(0,0,0,.22);" +
      "font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
    document.body.appendChild(panel);
  }

  function renderPanel() {
    panel.innerHTML = "";

    const title = document.createElement("div");
    title.style.cssText =
      "font-weight:700;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;";
    title.innerHTML = "<span>Outfit Presets</span>";
    const close = document.createElement("button");
    close.textContent = "✕";
    close.style.cssText = "border:0;border-radius:9px;padding:4px 8px;background:rgba(0,0,0,.08);cursor:pointer;";
    close.onclick = () => { panel.style.display = "none"; };
    title.appendChild(close);
    panel.appendChild(title);

    const list = document.createElement("div");
    list.style.cssText = "display:flex;flex-direction:column;gap:6px;";
    (window.OUTFIT_PRESETS || []).forEach(preset => {
      if (!preset || !preset.name) return;
      const b = document.createElement("button");
      b.textContent = `${preset.emoji ? preset.emoji + " " : ""}${preset.name}`;
      b.style.cssText =
        "text-align:left;border:1px solid rgba(0,0,0,.12);border-radius:10px;padding:9px 12px;" +
        "background:#fff;cursor:pointer;font-size:14px;";
      b.onmouseenter = () => { b.style.background = "#fff7e6"; b.style.borderColor = "#f59e0b"; };
      b.onmouseleave = () => { b.style.background = "#fff"; b.style.borderColor = "rgba(0,0,0,.12)"; };
      b.onclick = () => { applyPreset(preset); };
      list.appendChild(b);
    });
    panel.appendChild(list);

    const note = document.createElement("div");
    note.textContent = "Tip: add or edit looks in outfit_presets.js.";
    note.style.cssText = "font-size:11px;opacity:.6;margin-top:8px;";
    panel.appendChild(note);
  }

  presetBtn.onclick = () => {
    if (window._modeName === "shower") return;
    panel.style.display = panel.style.display === "none" ? "block" : "none";
    if (panel.style.display === "block") renderPanel();
  };

  // -------------------------------------------------------------------------
  // Stay in sync with the shower rules: clothes (and presets) are hidden there.
  // -------------------------------------------------------------------------
  function hidePresetUI() {
    presetBtn.style.display = "none";
    panel.style.display = "none";
  }
  function showPresetUI() {
    presetBtn.style.display = "block";
  }

  const _enterShower = window.enterShowerClothesRules;
  window.enterShowerClothesRules = function () {
    hidePresetUI();
    if (typeof _enterShower === "function") return _enterShower.apply(this, arguments);
  };
  const _exitShower = window.exitShowerClothesRules;
  window.exitShowerClothesRules = function () {
    showPresetUI();
    if (typeof _exitShower === "function") return _exitShower.apply(this, arguments);
  };

  if (window._modeName === "shower") hidePresetUI();
})();
