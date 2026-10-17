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
  // ---- A pose = the pet's normal body + that pose's own head ---------------
  // When base_happy.png is missing but images/parts/head_happy.png exists, the
  // pose is built from base.png with its head area (the top of the picture)
  // replaced by head_happy.png. So a new face only needs a head picture, not a
  // whole redrawn body. Same for head_disgust / head_sick / head_music /
  // head_1 (toy touch) and, for character 2, head_happy_2 and so on.
  // HEAD_FILE maps a pose name to a different head file: the shower's
  // scrubbing picture (base_bath2.png) uses head_shower.png, the first dance
  // frame (base_music1.png) keeps the normal head.png and the second
  // (base_music2.png) uses head_music.png.
  const HEAD_FILE = { bath2: 'head_shower', music1: 'head', music2: 'head_music' };
  const HEAD_CUT = 606 / 1134;          // head area = top 606 rows of the 1134 high art
  const composed = new Map();
  function withHead(failed, fb, cb) {
    const name = POSE.exec(failed)[1];
    const headUrl = IMAGE_DIR + 'parts/' + (HEAD_FILE[name] || 'head_' + name) + '.png';
    const key = fb + '+' + headUrl;
    if (composed.has(key)) return cb(composed.get(key));
    const body = new Image(), head = new Image();
    let left = 2, bad = false;
    const done = () => {
      if (--left > 0) return;
      const finish = url => { composed.set(key, url); cb(url); };
      if (bad) return finish(null);
      try {
        const c = document.createElement('canvas');
        c.width = body.naturalWidth; c.height = body.naturalHeight;
        const x = c.getContext('2d');
        x.drawImage(body, 0, 0);
        x.clearRect(0, 0, c.width, Math.round(c.height * HEAD_CUT));
        x.drawImage(head, 0, 0, c.width, c.height);
        c.toBlob(b => finish(b ? URL.createObjectURL(b) : null));
      } catch (_) { finish(null); }   // pixels unreadable (file:// page)
    };
    body.onload = head.onload = done;
    body.onerror = head.onerror = () => { bad = true; done(); };
    desc.set.call(body, IMAGE_DIR + fb);
    desc.set.call(head, headUrl);
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
        withHead(failed, fb, url => {
          if (img.src !== failed) return;
          if (!url) img._fallbackBase = true;
          img.addEventListener('load', () => { img._failed = false; }, { once: true });
          desc.set.call(img, url || IMAGE_DIR + fb);
        });
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
