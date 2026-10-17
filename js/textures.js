/* ============================================================
 * THRUST ROADSTER — TENMA EDITION · procedural textures
 * ほぼすべての画像はCanvas 2Dで実行時に描き起こす。
 * アセットキットのPNG（assets/tex）は読み込めた場合のみ上書きで使い、
 * 読めない環境（file:// など）では手続き生成版がそのまま使われる。
 * ============================================================ */
window.TR = window.TR || {};
TR.Tex = (() => {
  'use strict';

  const ANISO = () => (TR.renderer ? TR.renderer.capabilities.getMaxAnisotropy() : 4);
  const FONT_JP = '"Hiragino Sans","Noto Sans JP","Yu Gothic","Meiryo",sans-serif';
  const FONT_EN = '"Arial Black","Helvetica Neue",Arial,sans-serif';

  function mulberry32(a){
    return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // Tileable value noise + fbm
  function makeNoise(seed){
    const rnd = mulberry32(seed);
    const perm = new Uint8Array(256), vals = new Float32Array(256);
    for (let i = 0; i < 256; i++){ perm[i] = i; vals[i] = rnd(); }
    for (let i = 255; i > 0; i--){ const j = (rnd() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    const lat = (ix, iy, px, py) => { ix = ((ix % px) + px) % px; iy = ((iy % py) + py) % py; return vals[perm[(perm[ix & 255] + iy) & 255]]; };
    function noise(x, y, px, py){
      const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
      fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const a = lat(ix, iy, px, py), b = lat(ix + 1, iy, px, py), c = lat(ix, iy + 1, px, py), d = lat(ix + 1, iy + 1, px, py);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }
    function fbm(x, y, oct, px, py){
      let amp = .5, f = 1, s = 0, n = 0;
      for (let o = 0; o < oct; o++){ s += amp * noise(x * f, y * f, px * f, (py || px) * f); n += amp; amp *= .5; f *= 2; }
      return s / n;
    }
    return { noise, fbm, rnd };
  }

  function canvas(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
  function toTex(c, o = {}){
    const t = new THREE.CanvasTexture(c);
    if (o.srgb !== false) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = o.aniso || ANISO();
    if (o.repeat !== false){ t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    if (o.nomip){ t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
    return t;
  }
  // per-pixel painter
  function paint(w, h, fn){
    const [c, x] = canvas(w, h); const img = x.createImageData(w, h); const d = img.data;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++){
      const k = (j * w + i) * 4; const col = fn(i, j);
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = col.length > 3 ? col[3] : 255;
    }
    x.putImageData(img, 0, 0); return [c, x];
  }
  // height canvas -> tangent-space normal map
  function normalFromHeight(hc, strength){
    const w = hc.width, h = hc.height; const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
    const H = (i, j) => src[(((j + h) % h) * w + ((i + w) % w)) * 4] / 255;
    return paint(w, h, (i, j) => {
      const dx = (H(i + 1, j) - H(i - 1, j)) * strength, dy = (H(i, j + 1) - H(i, j - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      return [(-dx / l * .5 + .5) * 255, (dy / l * .5 + .5) * 255, (1 / l * .5 + .5) * 255];
    })[0];
  }
  const cache = {};
  const memo = (k, fn) => cache[k] || (cache[k] = fn());

  /* ---------- road: asphalt with lane markings (12m wide x 12m long per tile) ---------- */
  function road(){
    return memo('road', () => {
      const W = 512, Hh = 512, N = makeNoise(11);
      const heightC = paint(W, Hh, (i, j) => {
        const n = N.fbm(i / 10, j / 10, 3, 51.2, 51.2);
        const grit = N.rnd();
        const v = clamp01(n * .85 + grit * .15) * 255; return [v, v, v];
      })[0];
      const [c, x] = paint(W, Hh, (i, j) => {
        const n = N.fbm(i / 64, j / 64, 5, 8, 8), g = N.rnd();
        let v = 30 + n * 26 + (g > .93 ? 26 * g : 0) - (g < .05 ? 10 : 0);
        // tire wear lanes (darker, smoother)
        const lanePos = (i / W) * 12 - 6; // meters
        for (const L of [-3.6, 0, 3.6]) for (const s of [-.85, .85]){ const d = Math.abs(lanePos - (L + s)); if (d < .35) v -= (1 - d / .35) * 7; }
        const tar = N.fbm(i / 40 + 7, j / 40 + 3, 3, 13, 13); if (tar > .66) v -= (tar - .66) * 60;
        return [v * .92, v * .95, v * 1.04];
      });
      // cracks
      x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 1;
      for (let k = 0; k < 14; k++){ let px = N.rnd() * W, py = N.rnd() * Hh; x.beginPath(); x.moveTo(px, py); for (let s = 0; s < 12; s++){ px += (N.rnd() - .5) * 14; py += (N.rnd() - .5) * 14; x.lineTo(px, py); } x.stroke(); }
      // markings
      const mx = m => (m + 6) / 12 * W, my = m => m / 12 * Hh;
      const mark = (x0, y0, w, h, col) => {
        x.fillStyle = col; x.fillRect(mx(x0), my(y0), w / 12 * W, h / 12 * Hh);
        // worn paint speckle
        const img = x.getImageData(mx(x0) | 0, my(y0) | 0, Math.max(1, (w / 12 * W) | 0), Math.max(1, (h / 12 * Hh) | 0));
        for (let q = 0; q < img.data.length; q += 4){ if (N.rnd() < .22){ img.data[q] *= .55; img.data[q + 1] *= .55; img.data[q + 2] *= .55; } }
        x.putImageData(img, mx(x0) | 0, my(y0) | 0);
      };
      for (const L of [-1.8, 1.8]){ mark(L - .07, 1.5, .14, 4.5, '#e9ecef'); }
      mark(-5.55, 0, .16, 12, '#f2c14e'); mark(5.39, 0, .16, 12, '#e9ecef');
      const map = toTex(c), normalMap = toTex(normalFromHeight(heightC, 2.2), { srgb: false });
      const rough = toTex(paint(W, Hh, (i, j) => { const v = 170 + N.fbm(i / 32, j / 32, 3, 16, 16) * 70; return [v, v, v]; })[0], { srgb: false });
      return { map, normalMap, roughnessMap: rough };
    });
  }

  function concrete(){
    return memo('concrete', () => {
      const N = makeNoise(21), W = 256;
      const [c, x] = paint(W, W, (i, j) => {
        const n = N.fbm(i / 32, j / 32, 5, 8, 8), g = N.rnd();
        let v = 120 + n * 60 + g * 14;
        const stain = N.fbm(i / 50 + 3, j / 18, 3, 5, 14); if (stain > .6) v -= (stain - .6) * 140 * (j / W);
        return [v * .98, v * .97, v * .95];
      });
      x.fillStyle = 'rgba(0,0,0,.18)'; for (let k = 0; k < 4; k++) x.fillRect(0, k * 64, W, 1.5);
      return toTex(c);
    });
  }

  function hazard(){
    return memo('hazard', () => {
      const [c, x] = canvas(256, 64); const N = makeNoise(31);
      x.fillStyle = '#16161a'; x.fillRect(0, 0, 256, 64);
      x.fillStyle = '#f5b800';
      for (let k = -2; k < 10; k++){ x.beginPath(); x.moveTo(k * 32, 64); x.lineTo(k * 32 + 16, 64); x.lineTo(k * 32 + 48, 0); x.lineTo(k * 32 + 32, 0); x.closePath(); x.fill(); }
      const img = x.getImageData(0, 0, 256, 64);
      for (let q = 0; q < img.data.length; q += 4){ const n = N.rnd(); if (n < .08){ img.data[q] *= .4; img.data[q + 1] *= .4; img.data[q + 2] *= .4; } }
      x.putImageData(img, 0, 0); return toTex(c);
    });
  }

  function chevron(){
    return memo('chevron', () => {
      const [c, x] = canvas(256, 512);
      const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#1d1b22'); g.addColorStop(1, '#2a2530');
      x.fillStyle = g; x.fillRect(0, 0, 256, 512);
      x.fillStyle = '#ffcf33'; x.shadowColor = '#ffcf33'; x.shadowBlur = 12;
      for (let k = 0; k < 3; k++){ const y = 60 + k * 160; x.beginPath(); x.moveTo(28, y + 90); x.lineTo(128, y); x.lineTo(228, y + 90); x.lineTo(228, y + 130); x.lineTo(128, y + 40); x.lineTo(28, y + 130); x.closePath(); x.fill(); }
      return toTex(c);
    });
  }

  // boost pad: glowing cyan chevrons pointing "forward" (canvas up)
  function boostPad(){
    return memo('boostpad', () => {
      const [c, x] = canvas(128, 256);
      x.fillStyle = 'rgba(10,30,50,.55)'; x.fillRect(0, 0, 128, 256);
      x.strokeStyle = 'rgba(124,255,230,.9)'; x.lineWidth = 4; x.strokeRect(4, 4, 120, 248);
      x.fillStyle = '#7cffe6'; x.shadowColor = '#7cffe6'; x.shadowBlur = 14;
      for (let k = 0; k < 3; k++){ const y = 30 + k * 72; x.beginPath(); x.moveTo(16, y + 52); x.lineTo(64, y); x.lineTo(112, y + 52); x.lineTo(112, y + 72); x.lineTo(64, y + 24); x.lineTo(16, y + 72); x.closePath(); x.fill(); }
      return toTex(c, { repeat: false });
    });
  }

  /* ---------- soft sprites ---------- */
  function glow(){
    return memo('glow', () => {
      const [c, x] = canvas(128, 128); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.18, 'rgba(255,255,255,.7)'); g.addColorStop(.45, 'rgba(255,255,255,.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128); return toTex(c, { repeat: false });
    });
  }
  // anamorphic lens flare: bright core + horizontal streak
  function flare(){
    return memo('flare', () => {
      const [c, x] = canvas(256, 64);
      const g = x.createLinearGradient(0, 0, 256, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 30, 256, 4);
      const r = x.createRadialGradient(128, 32, 0, 128, 32, 32);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = r; x.fillRect(96, 0, 64, 64); return toTex(c, { repeat: false });
    });
  }
  function smoke(){
    return memo('smoke', () => {
      const N = makeNoise(41);
      const [c] = paint(128, 128, (i, j) => {
        const d = Math.hypot(i - 64, j - 64) / 64; const n = N.fbm(i / 18, j / 18, 4, 8, 8);
        const a = Math.max(0, 1 - d) ** 1.6 * (.5 + n * .8); return [255, 255, 255, clamp01(a) * 255];
      });
      return toTex(c, { repeat: false });
    });
  }
  function streak(){
    return memo('streak', () => {
      const [c, x] = canvas(16, 128); const g = x.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.8, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(6, 0, 4, 128); return toTex(c, { repeat: false });
    });
  }

  /* ---------- car paint livery (u along length, v around body) ---------- */
  const PAINTS = {
    obsidian:{ name: 'オブシディアン', base: '#14171f', accent: '#58e1f4', stripe: '#0b1224', number: '#58e1f4' },
    pearl:   { name: 'パール',         base: '#e9eef2', accent: '#16b8c7', stripe: '#0d1a24', number: '#0d1a24' },
    dawn:    { name: 'ドーン',         base: '#f08a3c', accent: '#0b1224', stripe: '#1a1a22', number: '#ffffff' },
    aurora:  { name: 'オーロラ',       base: '#1b3f6e', accent: '#ffcb70', stripe: '#0b1224', number: '#ffcb70' },
    coral:   { name: 'コーラル',       base: '#c8364a', accent: '#f6f8ff', stripe: '#141014', number: '#f6f8ff' },
  };
  function livery(key){
    return memo('livery_' + key, () => {
      const P = PAINTS[key]; const W = 1024, H = 512; const [c, x] = canvas(W, H);
      // canvas x -> along length (0 = rear, 1 = front); canvas y -> around (top of canvas = v 1)
      // v: 0 bottom, .25 right side, .5 top, .75 left side
      const vy = v => (1 - v) * H;
      x.fillStyle = P.base; x.fillRect(0, 0, W, H);
      // subtle metallic flake
      const N = makeNoise(51); const img = x.getImageData(0, 0, W, H);
      for (let q = 0; q < img.data.length; q += 4){ const f = (N.rnd() - .5) * 10; img.data[q] += f; img.data[q + 1] += f; img.data[q + 2] += f; }
      x.putImageData(img, 0, 0);
      // carbon lower skirt (bottom & lower sides)
      const carbon = x.createPattern(carbonCanvas(), 'repeat');
      x.fillStyle = carbon; x.fillRect(0, vy(.13), W, vy(0) - vy(.13)); x.fillRect(0, vy(1), W, vy(.87) - vy(1));
      x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, vy(.135), W, 3); x.fillRect(0, vy(.865) - 3, W, 3);
      // twin racing stripes over the top
      x.fillStyle = P.stripe;
      x.fillRect(0, vy(.535), W, vy(.505) - vy(.535)); x.fillRect(0, vy(.495), W, vy(.465) - vy(.495));
      x.fillStyle = P.accent; x.fillRect(0, vy(.539), W, 3); x.fillRect(0, vy(.461) - 3, W, 3);
      // side accent swoosh
      for (const side of [.25, .75]){
        const up = side === .25 ? 1 : -1;
        x.save(); x.fillStyle = P.accent; x.beginPath();
        x.moveTo(W * .05, vy(side - up * .06)); x.bezierCurveTo(W * .35, vy(side - up * .07), W * .55, vy(side + up * .02), W * .97, vy(side + up * .085));
        x.lineTo(W * .97, vy(side + up * .06)); x.bezierCurveTo(W * .55, vy(side - up * .005), W * .35, vy(side - up * .045), W * .05, vy(side - up * .035)); x.closePath(); x.fill(); x.restore();
        // number roundel + sponsor text, oriented to read correctly from outside
        x.save(); x.translate(W * .5, vy(side + up * .01));
        if (side === .25) x.scale(-1, 1); else x.scale(1, -1);
        x.fillStyle = '#f4f4f4'; x.beginPath(); x.arc(0, 0, 34, 0, Math.PI * 2); x.fill();
        x.lineWidth = 5; x.strokeStyle = P.accent; x.stroke();
        x.fillStyle = '#111'; x.font = `900 38px ${FONT_JP}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('天', 0, 2);
        x.fillStyle = P.number; x.font = `900 26px ${FONT_EN}`; x.fillText('TENMA', 150, 2);
        x.font = `700 15px ${FONT_JP}`; x.fillText('スラスト・ロードスター', -170, 3);
        x.restore();
      }
      // hood vents (front, top)
      x.fillStyle = 'rgba(0,0,0,.5)';
      for (let k = 0; k < 5; k++){ x.fillRect(W * (.8 + k * .018), vy(.43), 6, vy(.4) - vy(.43)); x.fillRect(W * (.8 + k * .018), vy(.6), 6, vy(.57) - vy(.6)); }
      // panel lines
      x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 2;
      for (const u of [.32, .68]){ x.beginPath(); x.moveTo(W * u, 0); x.lineTo(W * u, H); x.stroke(); }
      return toTex(c, { repeat: false });
    });
  }
  function carbonCanvas(){
    const [c, x] = canvas(16, 16);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++){
      const a = ((i >> 2) + (j >> 2)) & 1; const v = a ? 28 + (i % 4) * 6 : 18 + (j % 4) * 6; x.fillStyle = `rgb(${v},${v},${v + 3})`; x.fillRect(i, j, 1, 1);
    }
    return c;
  }
  function carbon(){ return memo('carbon', () => { const t = toTex(carbonCanvas()); t.magFilter = THREE.NearestFilter; return t; }); }

  function tire(){
    return memo('tire', () => {
      const [c, x] = canvas(512, 64); x.fillStyle = '#121214'; x.fillRect(0, 0, 512, 64);
      x.fillStyle = '#060607';
      for (let k = 0; k < 48; k++){ const px = k * 512 / 48; x.save(); x.translate(px, 32); x.rotate(.5); x.fillRect(-2, -16, 4, 14); x.restore(); x.save(); x.translate(px, 32); x.rotate(-.5); x.fillRect(-2, 2, 4, 14); x.restore(); }
      x.fillRect(0, 30, 512, 4);
      return toTex(c);
    });
  }

  /* ---------- signs ---------- */
  function sign(lines, opt = {}){
    const key = 'sign_' + lines.join('|') + (opt.style || '');
    return memo(key, () => {
      const W = 512, H = 192; const [c, x] = canvas(W, H);
      const style = opt.style || 'green';
      const bg = { green: ['#0d6b45', '#0a5a3a'], amber: ['#d88a00', '#b36b00'], red: ['#b81a1a', '#8e1010'], blue: ['#1d4fa8', '#153d85'] }[style];
      const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
      x.fillStyle = g; roundRect(x, 4, 4, W - 8, H - 8, 18); x.fill();
      x.strokeStyle = '#f2f2f2'; x.lineWidth = 6; roundRect(x, 14, 14, W - 28, H - 28, 12); x.stroke();
      x.fillStyle = style === 'amber' ? '#111' : '#f5f5f5'; x.textAlign = 'center'; x.textBaseline = 'middle';
      if (lines.length === 1){ x.font = `900 76px ${FONT_JP}`; x.fillText(lines[0], W / 2, H / 2 + 4, W - 60); }
      else { x.font = `900 56px ${FONT_JP}`; x.fillText(lines[0], W / 2, H * .36, W - 60); x.font = `700 40px ${FONT_JP}`; x.fillText(lines[1], W / 2, H * .72, W - 60); }
      // grime
      const N = makeNoise(61); const img = x.getImageData(0, 0, W, H);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++){ const q = (j * W + i) * 4; const n = N.fbm(i / 40, j / 40, 3, 13, 5); const d = (n - .5) * 30 + (j / H) * 14; img.data[q] -= d; img.data[q + 1] -= d; img.data[q + 2] -= d; }
      x.putImageData(img, 0, 0);
      return toTex(c, { repeat: false });
    });
  }

  /* ---------- neon billboards (city) ---------- */
  const ADS = [
    { bg: ['#2a0845', '#6441a5'], t1: 'THRUST FM', t2: '88.8 MHz · NIGHT DRIVE', col: '#ff4fd8', icon: 'wave' },
    { bg: ['#000428', '#004e92'], t1: 'ソラ・コーラ', t2: 'SORA COLA — 空まで、爽快。', col: '#5ff4ff', icon: 'bubble' },
    { bg: ['#1f0808', '#7a1010'], t1: 'きつねラーメン', t2: 'KITSUNE RAMEN 24H', col: '#ffc24a', icon: 'bowl' },
    { bg: ['#0b0b0b', '#262626'], t1: 'HYPER DRIVE', t2: 'NEXT-GEN AIR ENGINE 2088', col: '#7cffe6', icon: 'bolt' },
    { bg: ['#091a12', '#0f3d2a'], t1: '風速エクスプレス', t2: 'KAZE EXPRESS LOGISTICS', col: '#a2ff6b', icon: 'arrow' },
    { bg: ['#29001f', '#5c0a3b'], t1: 'NEO KANSAI', t2: 'ネオ関西 · 夜景ドライブ', col: '#ff6b9e', icon: 'star' },
  ];
  function billboard(i){
    return memo('ad' + i, () => {
      const A = ADS[i % ADS.length]; const W = 512, H = 256; const [c, x] = canvas(W, H);
      const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, A.bg[0]); g.addColorStop(1, A.bg[1]); x.fillStyle = g; x.fillRect(0, 0, W, H);
      // scanlines
      x.fillStyle = 'rgba(255,255,255,.04)'; for (let y = 0; y < H; y += 4) x.fillRect(0, y, W, 1);
      x.save(); x.shadowColor = A.col; x.shadowBlur = 24; x.strokeStyle = A.col; x.lineWidth = 6;
      roundRect(x, 12, 12, W - 24, H - 24, 16); x.stroke();
      drawIcon(x, A.icon, 92, H / 2, 54, A.col);
      x.fillStyle = '#fff'; x.textAlign = 'left'; x.textBaseline = 'middle';
      x.font = `900 52px ${/[^\x00-\x7f]/.test(A.t1) ? FONT_JP : FONT_EN}`; x.fillText(A.t1, 170, H * .42, W - 190);
      x.shadowBlur = 10; x.fillStyle = A.col; x.font = `700 22px ${FONT_JP}`; x.fillText(A.t2, 172, H * .7, W - 190);
      x.restore();
      return toTex(c, { repeat: false });
    });
  }
  function drawIcon(x, type, cx, cy, r, col){
    x.save(); x.translate(cx, cy); x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 6; x.lineCap = 'round';
    if (type === 'wave'){ for (let k = 1; k <= 3; k++){ x.beginPath(); x.arc(-r * .6, 0, r * .35 * k, -.8, .8); x.stroke(); } x.beginPath(); x.arc(-r * .6, 0, 6, 0, 7); x.fill(); }
    else if (type === 'bubble'){ x.beginPath(); x.moveTo(-r * .4, -r * .8); x.lineTo(r * .4, -r * .8); x.lineTo(r * .3, r * .8); x.lineTo(-r * .3, r * .8); x.closePath(); x.stroke(); for (let k = 0; k < 4; k++){ x.beginPath(); x.arc((k % 2 - .5) * 14, r * .4 - k * 20, 5, 0, 7); x.stroke(); } }
    else if (type === 'bowl'){ x.beginPath(); x.arc(0, 0, r * .8, 0, Math.PI); x.closePath(); x.stroke(); for (let k = -1; k <= 1; k++){ x.beginPath(); x.moveTo(k * 14, -8); x.bezierCurveTo(k * 14 + 10, -24, k * 14 - 10, -36, k * 14, -52); x.stroke(); } }
    else if (type === 'bolt'){ x.beginPath(); x.moveTo(8, -r); x.lineTo(-r * .5, 6); x.lineTo(0, 6); x.lineTo(-8, r); x.lineTo(r * .5, -6); x.lineTo(0, -6); x.closePath(); x.fill(); }
    else if (type === 'arrow'){ x.beginPath(); x.moveTo(-r * .8, 0); x.lineTo(r * .7, 0); x.moveTo(r * .2, -r * .5); x.lineTo(r * .75, 0); x.lineTo(r * .2, r * .5); x.stroke(); }
    else { x.beginPath(); for (let k = 0; k < 10; k++){ const a = k / 10 * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? r * .4 : r * .9; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.closePath(); x.fill(); }
    x.restore();
  }

  /* ---------- building facades: albedo + emissive windows ---------- */
  function facade(v){
    return memo('facade' + v, () => {
      const W = 256, H = 512; const N = makeNoise(70 + v);
      const [c, x] = canvas(W, H), [e, ex] = canvas(W, H);
      const base = ['#1a1d26', '#20232b', '#161a22', '#24202a'][v % 4];
      x.fillStyle = base; x.fillRect(0, 0, W, H); ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
      const cols = [8, 6, 10, 5][v % 4], rows = [24, 18, 32, 16][v % 4];
      const cw = W / cols, rh = H / rows;
      const warm = ['#ffd9a0', '#ffe8c4', '#ffc070'], cool = ['#a8d8ff', '#d4f0ff', '#7fd4ff'], neon = ['#ff6ad5', '#7cffe6'];
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++){
        const wx = k * cw + cw * .14, wy = r * rh + rh * .2, ww = cw * .72, wh = rh * .58;
        x.fillStyle = '#0b0d12'; x.fillRect(wx, wy, ww, wh);
        const zone = N.fbm(k / 3, r / 4, 2, 10, 20);
        if (N.rnd() < .25 + zone * .5){
          const pal = N.rnd() < .7 ? warm : (N.rnd() < .85 ? cool : neon); const col = pal[(N.rnd() * pal.length) | 0];
          const b = .45 + N.rnd() * .55;
          ex.globalAlpha = b; ex.fillStyle = col; ex.fillRect(wx, wy, ww, wh);
          ex.globalAlpha = b * .5; ex.fillStyle = '#000'; if (N.rnd() < .4) ex.fillRect(wx, wy, ww * (.2 + N.rnd() * .5), wh); // curtains
          ex.globalAlpha = 1; x.fillStyle = col; x.globalAlpha = .35; x.fillRect(wx, wy, ww, wh); x.globalAlpha = 1;
        }
      }
      // vertical mullions highlight
      x.fillStyle = 'rgba(255,255,255,.05)'; for (let k = 0; k < cols; k++) x.fillRect(k * cw, 0, 2, H);
      return { map: toTex(c), emissiveMap: toTex(e) };
    });
  }

  /* ---------- terrain ---------- */
  function sand(){
    return memo('sand', () => {
      const N = makeNoise(81), W = 512;
      const [c] = paint(W, W, (i, j) => {
        const n = N.fbm(i / 64, j / 64, 5, 8, 8); const rip = Math.sin((j + n * 60) * .35) * .5 + .5; const g = N.rnd();
        const v = .55 + n * .35 + rip * .08 + g * .06; return [196 * v, 120 * v, 78 * v];
      });
      return toTex(c);
    });
  }
  function rockStrata(){
    return memo('strata', () => {
      const N = makeNoise(91), W = 256, H = 512;
      const [c] = paint(W, H, (i, j) => {
        const n = N.fbm(i / 40, j / 12, 4, 6.4, 42.66);
        const band = Math.sin(j * .09 + n * 6) * .5 + .5; const g = N.rnd();
        const v = .5 + band * .3 + n * .25 + g * .05;
        return [178 * v, 92 * v + band * 18, 64 * v];
      });
      return toTex(c);
    });
  }
  function cityGround(){
    return memo('cityground', () => {
      const W = 512; const N = makeNoise(101); const [c, x] = canvas(W, W), [e, ex] = canvas(W, W);
      x.fillStyle = '#121419'; x.fillRect(0, 0, W, W); ex.fillStyle = '#000'; ex.fillRect(0, 0, W, W);
      // blocks
      for (let by = 0; by < 4; by++) for (let bx = 0; bx < 4; bx++){
        x.fillStyle = `rgb(${24 + N.rnd() * 10},${26 + N.rnd() * 10},${32 + N.rnd() * 10})`; x.fillRect(bx * 128 + 14, by * 128 + 14, 100, 100);
        for (let k = 0; k < 30; k++){ ex.fillStyle = N.rnd() < .7 ? '#ffcf8a' : '#8fd8ff'; ex.globalAlpha = .3 + N.rnd() * .7; ex.fillRect(bx * 128 + 16 + N.rnd() * 94, by * 128 + 16 + N.rnd() * 94, 2, 2); }
      }
      ex.globalAlpha = 1;
      // street lights along roads
      for (let k = 0; k < 4; k++) for (let s = 0; s < 32; s++){
        ex.fillStyle = '#ffb35a'; ex.fillRect(k * 128 + 6, s * 16 + 4, 2, 2); ex.fillRect(s * 16 + 4, k * 128 + 6, 2, 2);
        if (N.rnd() < .3){ ex.fillStyle = N.rnd() < .5 ? '#ff3030' : '#ffffff'; ex.fillRect(k * 128 + 3, s * 16 + N.rnd() * 16, 1.5, 3); }
      }
      return { map: toTex(c), emissiveMap: toTex(e) };
    });
  }
  function snow(){
    return memo('snow', () => {
      const N = makeNoise(111), W = 512;
      const [c] = paint(W, W, (i, j) => {
        const n = N.fbm(i / 70, j / 70, 5, 512 / 70, 512 / 70); const g = N.rnd();
        const v = .72 + n * .25 + (g > .985 ? .2 : 0); return [205 * v, 222 * v, 245 * v];
      });
      return toTex(c);
    });
  }
  function ice(){
    return memo('ice', () => {
      const N = makeNoise(121), W = 256, H = 512;
      const [c] = paint(W, H, (i, j) => {
        const n = N.fbm(i / 30, j / 60, 5, 8.53, 8.53); const snowCap = j < H * (.3 + n * .2) ? 1 : 0;
        const v = .45 + n * .5;
        return snowCap ? [235 * (.85 + n * .15), 242 * (.85 + n * .15), 255] : [90 * v, 130 * v, 170 * v];
      });
      return toTex(c);
    });
  }
  function container(i){
    return memo('container' + i, () => {
      const W = 512, H = 128; const [c, x] = canvas(W, H);
      const cols = [['#c4302b', '#fff'], ['#1e5aa8', '#ffd23f'], ['#e8e8e8', '#0e7c4a'], ['#2b2b30', '#ff8a00']][i % 4];
      x.fillStyle = cols[0]; x.fillRect(0, 0, W, H);
      for (let k = 0; k < W; k += 8){ x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(k, 0, 3, H); x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(k + 4, 0, 2, H); }
      x.fillStyle = cols[1]; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `900 40px ${FONT_JP}`; x.fillText(['風速エクスプレス', 'SORA LOGISTICS', '緑風運輸', 'TR CARGO'][i % 4], W / 2, H * .45, W - 40);
      x.font = `700 16px ${FONT_EN}`; x.fillText(['KAZE EXPRESS · 24H', 'SKY DELIVERY NETWORK', 'MIDORI KAZE TRANSPORT', 'THRUST ROADSTER PARTNER'][i % 4], W / 2, H * .78);
      const N = makeNoise(130 + i); const img = x.getImageData(0, 0, W, H);
      for (let q = 0; q < img.data.length; q += 4){ const j = (q / 4 / W) | 0; const d = N.rnd() * 10 + (j / H) * 20; img.data[q] -= d; img.data[q + 1] -= d; img.data[q + 2] -= d; }
      x.putImageData(img, 0, 0);
      return toTex(c, { repeat: false });
    });
  }

  /* ---------- TENMA additions ---------- */
  // load a kit PNG into an existing texture (keeps the procedural one if loading fails)
  function upgrade(tex, url, o = {}){
    if (location.protocol === 'file:') return tex;
    const img = new Image();
    img.onload = () => { tex.image = img; if (o.srgb !== false) tex.encoding = THREE.sRGBEncoding; tex.needsUpdate = true; };
    img.src = url; return tex;
  }
  // canyon rock: graphite + amber strata (kit rock_512 used as detail when available)
  function canyonRock(){
    return memo('canyonRock', () => {
      const N = makeNoise(93), W = 256, H = 512;
      const [c] = paint(W, H, (i, j) => {
        const n = N.fbm(i / 40, j / 14, 5, 6.4, 36.57);
        const band = Math.sin(j * .07 + n * 7) * .5 + .5; const g = N.rnd();
        const v = .42 + band * .32 + n * .3 + g * .05;
        const warm = band * .55;
        return [ (120 + warm * 90) * v, (100 + warm * 40) * v, (92 - warm * 20) * v ];
      });
      return toTex(c);
    });
  }
  function plasma(){
    return memo('plasma', () => {
      const N = makeNoise(141), W = 256;
      const [c] = paint(W, W, (i, j) => { const n = N.fbm(i / 32, j / 32, 5, 8, 8); const v = clamp01((n - .3) * 1.8); return [255 * Math.min(1, v * 1.4), 120 * v * v + 40 * v, 40 * v * v * v]; });
      return upgrade(toTex(c), 'assets/tex/plasma_noise_512.png');
    });
  }
  function cityPanel(){
    return memo('cityPanel', () => {
      const [c, x] = canvas(256, 256);
      x.fillStyle = '#0f1b2b'; x.fillRect(0, 0, 256, 256);
      x.strokeStyle = 'rgba(88,225,244,.35)'; x.lineWidth = 2;
      for (let k = 0; k <= 8; k++){ x.beginPath(); x.moveTo(k * 32, 0); x.lineTo(k * 32, 256); x.stroke(); x.beginPath(); x.moveTo(0, k * 32); x.lineTo(256, k * 32); x.stroke(); }
      const N = makeNoise(151);
      for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) if (N.rnd() < .6){ x.fillStyle = N.rnd() < .8 ? '#2ab3c4' : '#ff6a62'; x.fillRect(k * 32 + 6, r * 32 + 8, 18, 7); }
      return toTex(c);
    });
  }
  // wall-ride lane: cyan chevrons running along the facade (canvas x = along z)
  function wallLane(){
    return memo('wallLane', () => {
      const [c, x] = canvas(512, 64);
      x.fillStyle = 'rgba(0,0,0,0)'; x.clearRect(0, 0, 512, 64);
      x.fillStyle = 'rgba(88,225,244,.25)'; x.fillRect(0, 26, 512, 12);
      x.fillStyle = '#9ff4ff'; x.shadowColor = '#58e1f4'; x.shadowBlur = 10;
      for (let k = 0; k < 4; k++){ const px = k * 128 + 30; x.beginPath(); x.moveTo(px, 6); x.lineTo(px + 46, 32); x.lineTo(px, 58); x.lineTo(px + 18, 58); x.lineTo(px + 64, 32); x.lineTo(px + 18, 6); x.closePath(); x.fill(); }
      x.fillRect(0, 0, 512, 3); x.fillRect(0, 61, 512, 3);
      return toTex(c);
    });
  }
  // landing / refuel pad marker
  function padMark(col = '#58e1f4', label = 'TENMA'){
    return memo('pad' + col + label, () => {
      const [c, x] = canvas(256, 256);
      x.fillStyle = '#1a1f2a'; x.fillRect(0, 0, 256, 256);
      x.strokeStyle = col; x.lineWidth = 10; x.shadowColor = col; x.shadowBlur = 18;
      x.beginPath(); x.arc(128, 128, 100, 0, Math.PI * 2); x.stroke();
      x.lineWidth = 4; x.beginPath(); x.arc(128, 128, 76, 0, Math.PI * 2); x.stroke();
      x.fillStyle = col; x.font = `900 46px ${FONT_EN}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('H', 128, 112);
      x.font = `800 20px ${FONT_EN}`; x.fillText(label, 128, 158);
      x.shadowBlur = 0; x.fillStyle = '#ffcb70'; for (let k = 0; k < 8; k++){ const a = k / 8 * Math.PI * 2; x.fillRect(128 + Math.cos(a) * 116 - 4, 128 + Math.sin(a) * 116 - 4, 8, 8); }
      return toTex(c, { repeat: false });
    });
  }
  // the home planet: oceans, continents, ice caps, cloud layer (equirectangular)
  function earth(){
    return memo('earth', () => {
      const N = makeNoise(161), W = 1024, H = 512;
      const [c] = paint(W, H, (i, j) => {
        const u = i / W, v = j / H, lat = Math.abs(v - .5) * 2;
        const n = N.fbm(u * 8, v * 4, 6, 8, 4);
        const land = n > .53;
        const d = N.fbm(u * 24 + 3, v * 12, 3, 24, 12);
        let r, g, b;
        if (land){ const k = (n - .53) * 4; r = 70 + k * 120 + d * 40; g = 98 + d * 50 - k * 20; b = 52 + d * 20; if (k > .6){ r += 50; g += 20; } }
        else { const deep = clamp01((.53 - n) * 5); r = 14 + (1 - deep) * 30; g = 52 + (1 - deep) * 70; b = 120 + (1 - deep) * 70; }
        if (lat > .82){ const k = clamp01((lat - .82) * 8); r += (240 - r) * k; g += (246 - g) * k; b += (255 - b) * k; }
        return [r, g, b];
      });
      return toTex(c, { repeat: false });
    });
  }
  function earthClouds(){
    return memo('earthClouds', () => {
      const N = makeNoise(171), W = 1024, H = 512;
      const [c] = paint(W, H, (i, j) => { const n = N.fbm(i / W * 10, j / H * 5, 6, 10, 5); const sw = N.fbm(i / W * 30, j / H * 15, 3, 30, 15); const a = clamp01((n + sw * .25 - .55) * 3); return [255, 255, 255, a * 230]; });
      return toTex(c, { repeat: false });
    });
  }
  // soft billowy cloud sprite
  function puff(){
    return memo('puff', () => {
      const N = makeNoise(181);
      const [c] = paint(128, 128, (i, j) => { const d = Math.hypot(i - 64, j - 64) / 64; const n = N.fbm(i / 22, j / 22, 5, 5.8, 5.8); const a = clamp01((1 - d) * 1.6 - .2 + (n - .5) * 1.2); const s = 200 + n * 55 - (j / 128) * 40; return [s, s, s + 10, a * a * 255]; });
      return toTex(c, { repeat: false });
    });
  }
  // tornado body: vertical streaks that scroll
  function swirl(){
    return memo('swirl', () => {
      const N = makeNoise(191), W = 256, H = 256;
      const [c] = paint(W, H, (i, j) => { const n = N.fbm(i / 16, j / 64, 4, 16, 4); const s = clamp01((n - .35) * 2.2); return [220, 225, 255, s * 255]; });
      return toTex(c);
    });
  }

  function roundRect(x, X, Y, W, H, r){ x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }
  function clamp01(v){ return v < 0 ? 0 : v > 1 ? 1 : v; }

  return { upgrade, canyonRock, plasma, cityPanel, wallLane, padMark, earth, earthClouds, puff, swirl, boostPad, road, concrete, hazard, chevron, glow, flare, smoke, streak, livery, carbon, tire, sign, billboard, facade, sand, rockStrata, cityGround, snow, ice, container, PAINTS, ADS, makeNoise, mulberry32 };
})();
