// ===========================================================
// 🖼️ Global image path resolver
// Keeps JS filenames simple, but loads images from /images/
// Example: "base.png" -> "images/base.png"
// Does not change audio, JSON, absolute URLs, data/blob URLs,
// or paths that already include a folder.
// ===========================================================
(() => {
  const IMAGE_DIR = 'images/';
  const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|avif)(\?.*)?$/i;

  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (!desc || !desc.set || !desc.get) return;
  if (HTMLImageElement.prototype.__petTemplateImagePathFixed) return;

  Object.defineProperty(HTMLImageElement.prototype, '__petTemplateImagePathFixed', {
    value: true,
    configurable: false,
  });

  function shouldPrefix(value) {
    if (typeof value !== 'string') return false;
    const src = value.trim();
    if (!src || !IMAGE_EXT.test(src)) return false;

    if (/^(https?:)?\/\//i.test(src)) return false;
    if (/^(data:|blob:|file:)/i.test(src)) return false;
    if (src.startsWith('/') || src.startsWith('./') || src.startsWith('../')) return false;
    if (src.startsWith(IMAGE_DIR)) return false;
    if (src.includes('/')) return false;

    return true;
  }

  // ---- Missing pet poses fall back to the pet's normal picture ------------
  // Modes switch the pet to a pose picture for a moment: base_happy.png after
  // eating, base_disgust.png when hit, base_sick.png, base_music1.png, ...
  // When that picture doesn't exist the mode had nothing to draw and the pet
  // vanished. So a missing base_<anything>.png loads the pet's own base.png
  // (base_2.png for character 2 / the boy) into the same image instead, and
  // counts as loaded. Real pose art, when it exists, is used as before.
  // The image gets _fallbackBase = true, for code that needs to know.
  const POSE = /(?:^|\/)base_([^/]+)\.png(?:\?.*)?$/i;
  function fallbackName(url) {
    const m = POSE.exec(url);
    if (!m) return null;
    let two = /(?:^|_)2(?:_|$)/.test(m[1]);
    if (!two && window.PetGender && typeof window.PetGender.get === 'function') two = window.PetGender.get() === 'boy';
    return two ? 'base_2.png' : 'base.png';
  }
  function armBaseFallback(img, url) {
    if (img.__baseFallbackArmed || typeof url !== 'string' || !POSE.test(url)) return;
    img.__baseFallbackArmed = true;
    img.addEventListener('error', () => {
      const failed = img.src;
      // Let any other fallback (e.g. the boy/girl art switch) go first: only
      // step in if nobody re-pointed the image.
      setTimeout(() => {
        if (img.src !== failed) return;
        const fb = fallbackName(failed);
        if (!fb || failed.split('?')[0].endsWith('/' + fb)) return;
        img._fallbackBase = true;
        img.addEventListener('load', () => { img._failed = false; }, { once: true });
        desc.set.call(img, IMAGE_DIR + fb);
      }, 0);
    });
  }

  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    enumerable: desc.enumerable,
    get: desc.get,
    set(value) {
      const fixed = shouldPrefix(value) ? IMAGE_DIR + value : value;
      armBaseFallback(this, fixed);
      return desc.set.call(this, fixed);
    },
  });
})();
