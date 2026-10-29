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

  // posesFromHeads (game_config.js): the game has no whole-body pictures
  // (base.png, base_sick.png, base_happy.png, base_music2.png, base_bath2.png,
  // base_1.png ...). Every pose is the standing body built from images/parts/
  // plus that pose's head (head_sick.png, head_happy.png, head_music.png,
  // head_shower.png, head_1.png ...), so those files are not even requested.
  const FROM_HEADS = !!(window.GAME_CONFIG && window.GAME_CONFIG.posesFromHeads);

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
  // The image gets _fallbackHead = true, for code that needs to know.
  const POSE = /(?:^|\/)base_([^/]+)\.png(?:\?.*)?$/i;
  function fallbackName(url) {
    const m = POSE.exec(url);
    if (!m) return null;
    const two = /(?:^|_)2(?:_|$)/.test(m[1]);
    return two ? 'base_2.png' : 'base.png';
  }
  // ---- A pose = the pet's normal body + that pose's own head ---------------
  // When base_happy.png is missing but images/parts/head_happy.png exists, the
  // pose is built from base.png with its head area (the top of the picture)
  // replaced by head_happy.png. So a new face only needs a head picture, not a
  // whole redrawn body. Same for head_disgust / head_sick / head_music /
  // head_1 (toy touch). Character 2 adds _2 to the head name: head_2,
  // head_happy_2, head_1_2, ... (built on base_2.png).
  // HEAD_FILE maps a pose name to a different head file: the shower's
  // scrubbing picture (base_bath2.png) uses head_shower.png, the first dance
  // frame (base_music1.png) keeps the normal head.png and the second
  // (base_music2.png) uses head_music.png, and doctor mode's healed picture
  // (base_healed.png) uses head_heal.png.
  const HEAD_FILE = { bath2: 'head_shower', music1: 'head', music2: 'head_music', healed: 'head_heal' };
  const HEAD_CUT = 606 / 1134;          // head area = top 606 rows of the 1134 high art
  const composed = new Map();
  // base.png / base_2.png themselves: when they are missing too (you only draw
  // the parts and heads), the body is built from images/parts/ (everything but
  // the head, in the order of ragdoll_config.js) and the head goes on top.
  const BASE = /(?:^|\/)base(_2)?\.png(?:\?.*)?$/i;
  function partsBody(two, cb) {
    const cfg = window.RAGDOLL_CONFIG;
    const names = ((cfg && cfg.parts) || []).map(q => q.file).filter(n => n !== 'head');
    const list = names.length ? names : ['back_hair', 'wing_L', 'wing_R', 'back_tail', 'leg_L', 'leg_R', 'arm_L', 'arm_R', 'body', 'chest_L', 'chest_R'];
    const imgs = {};
    let left = list.length;
    const done = () => { if (--left === 0) cb(list.map(n => imgs[n]).filter(Boolean), !!imgs.body); };
    list.forEach(n => {
      const im = new Image();
      im.onload = () => { imgs[n] = im; done(); };
      im.onerror = done;
      desc.set.call(im, IMAGE_DIR + 'parts/' + n + (two ? '_2' : '') + '.png');
    });
  }
  function withHead(failed, fb, cb) {
    // 'happy_2' / '2_bath2' -> pose 'happy' / 'bath2' on character 2's body.
    const m = POSE.exec(failed);
    const core = m ? m[1].split('_').filter(t => t !== '2').join('_') : '';
    const two = fb === 'base_2.png';
    const headUrl = IMAGE_DIR + 'parts/' + (m && core ? (HEAD_FILE[core] || 'head_' + core) : 'head') + (two ? '_2' : '') + '.png';
    const key = fb + '+' + headUrl;
    if (composed.has(key)) return cb(composed.get(key));
    const body = new Image(), head = new Image();
    let left = FROM_HEADS ? 1 : 2, bodyOk = !FROM_HEADS, headOk = true;
    const finish = url => { composed.set(key, url); cb(url); };
    const paint = (layers, cutHead) => {
      try {
        const c = document.createElement('canvas');
        const W = (cutHead ? body.naturalWidth : 0) || head.naturalWidth || 851;
        const H = (cutHead ? body.naturalHeight : 0) || head.naturalHeight || 1134;
        c.width = W; c.height = H;
        const x = c.getContext('2d');
        layers.forEach(l => x.drawImage(l, 0, 0, W, H));
        if (cutHead) x.clearRect(0, 0, W, Math.round(H * HEAD_CUT));
        x.drawImage(head, 0, 0, W, H);
        c.toBlob(b => finish(b ? URL.createObjectURL(b) : null));
      } catch (_) { finish(null); }   // pixels unreadable (file:// page)
    };
    const done = () => {
      if (--left > 0) return;
      if (!headOk) return finish(null);
      if (bodyOk) return paint([body], true);
      partsBody(two, (layers, hasBody) => hasBody ? paint(layers, false) : finish(null));
    };
    body.onload = done; head.onload = done;
    body.onerror = () => { bodyOk = false; done(); };
    head.onerror = () => { headOk = false; done(); };
    if (!FROM_HEADS) desc.set.call(body, IMAGE_DIR + fb);
    desc.set.call(head, headUrl);
  }

  function armHeadFallback(img, url) {
    if (img.__headFallbackArmed || typeof url !== 'string' || !(POSE.test(url) || BASE.test(url))) return;
    img.__headFallbackArmed = true;
    img.addEventListener('error', () => {
      const failed = img.src;
      // Let any other fallback (e.g. the boy/girl art switch) go first: only
      // step in if nobody re-pointed the image.
      setTimeout(() => {
        if (img.src !== failed) return;
        const plain = BASE.exec(failed);
        const fb = plain ? (plain[1] ? 'base_2.png' : 'base.png') : fallbackName(failed);
        if (!fb || (!plain && failed.split('?')[0].endsWith('/' + fb))) return;
        withHead(failed, fb, url => {
          if (img.src !== failed) return;
          if (plain && url) { img._plainHead = true; img._two = fb === 'base_2.png'; }   // pet_stats.js PetFace.shyImg: a normal-pose body built from parts
          if (!url && plain) return;           // nothing to build it from
          if (!url) img._fallbackHead = true;
          img.addEventListener('load', () => { img._failed = false; }, { once: true });
          desc.set.call(img, url || IMAGE_DIR + fb);
        });
      }, 0);
    });
  }

  // posesFromHeads: build the picture from parts + head instead of loading it.
  function poseFromHead(img, url) {
    img._poseUrl = url;
    const plain = BASE.exec(url);
    const fb = plain ? (plain[1] ? 'base_2.png' : 'base.png') : fallbackName(url);
    withHead(url, fb, blob => {
      if (img._poseUrl !== url) return;
      if (blob) {
        if (plain) { img._plainHead = true; img._two = fb === 'base_2.png'; }   // pet_stats.js PetFace.shyImg
        img.addEventListener('load', () => { img._failed = false; }, { once: true });
        desc.set.call(img, blob);
      } else {
        // No parts / head for it (e.g. character 2 has no _2 art yet): report
        // it as missing so the mode falls back to character 1's picture.
        img.dispatchEvent(new Event('error'));
      }
    });
  }

  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    enumerable: desc.enumerable,
    get: desc.get,
    set(value) {
      const fixed = shouldPrefix(value) ? IMAGE_DIR + value : value;
      if (FROM_HEADS && typeof fixed === 'string' && (POSE.test(fixed) || BASE.test(fixed))) {
        poseFromHead(this, fixed);
        return;
      }
      armHeadFallback(this, fixed);
      return desc.set.call(this, fixed);
    },
  });
})();
