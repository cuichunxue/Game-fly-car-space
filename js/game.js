/* ============================================================
 * THRUST ROADSTER — TENMA EDITION · game core
 * 状態遷移（title / countdown / play / transition / pause / result / gameover / finale）、
 * 固定刻み 1/60 秒の物理、入力、カメラ、HUD、救済、記録の保存。
 * ============================================================ */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const W = TR.World, Md = TR.Models, FX = TR.FX, AU = TR.Audio, CH = W.CHAPTERS;
const fmtT = s => { const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); };

/* ---------- tuning (arcade, not a real-world simulation) ---------- */
const DIFF = {
  easy:   { key: 'easy',   label: 'かんたん',   rescues: 3, crashV: 30, hit: .7,  cp: 'dense',  lives: 0, note: '姿勢補助：強／救済：章ごと3回／チェックポイント：多め。到達と探索を楽しもう。' },
  normal: { key: 'normal', label: 'ふつう',     rescues: 2, crashV: 25, hit: .85, cp: 'normal', lives: 0, note: '姿勢補助：中／救済：章ごと2回／チェックポイント：標準。' },
  hard:   { key: 'hard',   label: 'むずかしい', rescues: 1, crashV: 20, hit: 1,   cp: 'sparse', lives: 5, note: '姿勢補助：弱／救済：章ごと1回／チェックポイント：少なめ／章ごと5機。技術と速度。' },
};
const PH = { CAR_HW: .95, CAR_HL: 2.3, CAR_H: 1.2, JUMP: 9.6, CUSHION: 16, VYMAX: 13, COYOTE: .14,
  FUEL_DRAIN: 10, FUEL_GROUND: 34, JUMP_COST: 3, PERFECT_V: 6, HARD_V: 14, EBOOST_T: 2.8, WALL_MAX: 3.4, NEAR: 1.15 };
const QUAL = {
  high: { dpr: 2,   shadow: 2048, bloom: true,  bloomScale: 1,  msaa: true,  fx: 1 },
  mid:  { dpr: 1.5, shadow: 1024, bloom: true,  bloomScale: .6, msaa: false, fx: .6 },
  low:  { dpr: 1,   shadow: 0,    bloom: false, bloomScale: .5, msaa: false, fx: .35 },
};
const isTouch = () => matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);

/* ---------- settings & progress (local only; no accounts, no personal data) ---------- */
function load(k, d){ try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' ? Object.assign({}, d, v) : d; } catch(e){ return d; } }
function save(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEF_SET = { music: .6, sfx: .8, musicOn: true, sfxOn: true, subs: true, motion: reduce, flash: reduce, slow: true, short: false, vib: true, guide: true, assist: 0, quality: 'auto', paint: 'obsidian', diff: 'normal' };
const settings = load('tenma_settings', DEF_SET);
if (!TR.Tex.PAINTS[settings.paint]) settings.paint = 'obsidian';
if (!DIFF[settings.diff]) settings.diff = 'normal';
const DEF_PROG = { unlocked: 0, story: false, chapters: CH.map(() => null), ranking: [] };
let progress = load('tenma_progress', DEF_PROG);
if (!Array.isArray(progress.chapters) || progress.chapters.length !== CH.length) progress.chapters = CH.map(() => null);
if (!Array.isArray(progress.ranking)) progress.ranking = [];
const saveSettings = () => save('tenma_settings', settings);
const saveProgress = () => save('tenma_progress', progress);

/* ---------- renderer & post-processing ---------- */
const stage = $('stage');
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false }); }
catch(e){ $('loading').innerHTML = '<div class="card" style="margin:auto"><h2>3D画面を開けませんでした</h2><p class="lead">WebGL対応の最新の Safari / Chrome / Edge で開いてください。</p><button class="go" onclick="location.reload()"><span>再読み込み</span></button></div>'; return; }
TR.renderer = renderer;
renderer.outputEncoding = THREE.LinearEncoding; renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(64, 1, .3, 9000);
scene.add(camera);
let qualityKey = settings.quality === 'auto' ? (isTouch() ? 'mid' : 'high') : settings.quality;
let Q = QUAL[qualityKey];

const FinalShader = {
  uniforms: { tDiffuse: { value: null }, exposure: { value: 1 }, vignette: { value: .5 }, grain: { value: .03 }, time: { value: 0 }, aberr: { value: 0 }, blur: { value: 0 }, sat: { value: 1.08 }, res: { value: new THREE.Vector2(1, 1) }, tint: { value: new THREE.Color(0, 0, 0) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float exposure, vignette, grain, time, aberr, blur, sat; uniform vec2 res; uniform vec3 tint;
    varying vec2 vUv;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
    vec3 srgb(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1./2.4)) - .055, step(.0031308, c)); }
    void main(){
      vec2 dc = vUv - .5; vec3 col;
      if (blur > .002){ vec3 acc = vec3(0.); for (int i = 0; i < 7; i++){ float s = 1. - blur*float(i)*.012; acc += texture2D(tDiffuse, .5 + dc*s).rgb; } col = acc/7.; }
      else col = texture2D(tDiffuse, vUv).rgb;
      if (aberr > .001){ float a = aberr*.006*length(dc)*2.; col.r = texture2D(tDiffuse, vUv + dc*a).r; col.b = texture2D(tDiffuse, vUv - dc*a).b; }
      col = col*exposure + tint;
      col = aces(col);
      float l = dot(col, vec3(.2126,.7152,.0722)); col = mix(vec3(l), col, sat);
      float v = smoothstep(.95, .25, length(dc*vec2(1., .82))); col *= mix(1., v, vignette);
      col = srgb(col);
      col += (fract(sin(dot(vUv*res + time*61.7, vec2(12.9898,78.233)))*43758.5453) - .5)*grain;
      gl_FragColor = vec4(col, 1.);
    }`
};
let composer, bloom, finalPass;
function buildComposer(){
  if (composer){ composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); }
  const pr = renderer.getPixelRatio(), w = innerWidth, h = innerHeight;
  const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: (renderer.capabilities.isWebGL2 && Q.msaa) ? 4 : 0 });
  composer = new THREE.EffectComposer(renderer, rt);
  composer.addPass(new THREE.RenderPass(scene, camera));
  bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), .7, .5, 1.0);
  bloom.enabled = Q.bloom; composer.addPass(bloom);
  finalPass = new THREE.ShaderPass(FinalShader); composer.addPass(finalPass);
}
let dynScale = 1; // dynamic resolution (drops when frames are slow)
function applyQuality(){
  Q = QUAL[qualityKey];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr) * dynScale);
  W.setShadowSize(Q.shadow); FX.setDensity(Q.fx);
  buildComposer(); resize();
}
let baseFov = 64;
function resize(){
  const w = innerWidth, h = innerHeight, pr = renderer.getPixelRatio();
  renderer.setSize(w, h, false);
  if (composer){ composer.setPixelRatio(pr); composer.setSize(w, h); bloom.setSize(w * pr * Q.bloomScale, h * pr * Q.bloomScale); finalPass.uniforms.res.value.set(w * pr, h * pr); }
  camera.aspect = w / h; baseFov = camera.aspect < 1 ? 78 : camera.aspect < 1.4 ? 70 : 63; camera.updateProjectionMatrix();
  FX.setPointScale(h * pr / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));

/* ---------- state ---------- */
// game states and the transitions allowed between them (guards)
const FSM = {
  loading: ['title'],
  title: ['countdown'],
  countdown: ['play', 'pause', 'title'],
  play: ['transition', 'pause', 'result', 'gameover', 'finale', 'title'],
  transition: ['play', 'pause', 'result', 'finale'],
  pause: ['play', 'countdown', 'transition', 'title'],
  result: ['title', 'countdown'],
  gameover: ['countdown', 'title'],
  finale: ['result', 'title'],
};
const S = {
  mode: 'loading', diff: DIFF[settings.diff], ta: false, startCh: 0, chapter: 0, pausedFrom: null,
  x: 0, y: 0, z: 0, vx: 0, vy: 0, speed: 0, fuel: 100, energy: 0, grounded: true, coyote: 0, floorS: null,
  airT: 0, prevX: 0, prevY: 0, prevZ: 0, gflip: false, gflipT: 0, wall: null, wallT: 0, eboostT: 0, heat: 0,
  rescueLeft: 2, rescueT: 0, invuln: 0, crashT: 0, lives: 0, cp: null, failStreak: 0, assistOffered: false,
  timeScale: 1, slowT: 0, shake: 0, nearZoom: 0, cine: null, finaleT: 0, rollout: false, route: null,
  t: 0, chT: 0, stats: null, results: [], combo: 0, comboT: 0, flightRings: 0, beacons: 0,
  hints: {}, subsSaid: {}, thrustNow: 0, fold: 0, finX: 0, lastReason: '', nearCool: 0,
};
const input = { kL: false, kR: false, kT: false, kB: false, tL: false, tR: false, tT: false, tB: false, pSteer: 0, pT: false, pB: false, steer: 0, thrust: false, boost: false, prevThrust: false, prevBoost: false };
let car;
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
const camPos = new THREE.Vector3(0, 3, -8), camLook = new THREE.Vector3();

function newStats(ci){ return { ci, t: 0, rings: 0, ringsTotal: 0, near: 0, wallSec: 0, perfect: 0, landings: 0, crashes: 0, rescues: 0, explore: 0, exploreTotal: 0, tornadoSec: 0, bigAir: 0, cleared: false, live: 0 }; }

function setMode(m){
  if (S.mode === m) return true;
  if (!(FSM[S.mode] || []).includes(m)){ console.warn('blocked state transition', S.mode, '->', m); return false; }
  S.mode = m;
  document.body.dataset.mode = m;
  return true;
}

/* ---------- boot ---------- */
function setLoad(p, txt){ $('loadFill').style.width = (p * 100) + '%'; if (txt) $('loadTxt').textContent = txt; }
const bootSteps = [
  ['空と大地を描いています…', () => { TR.Tex.road(); TR.Tex.canyonRock(); TR.Tex.concrete(); TR.Tex.glow(); TR.Tex.puff(); }],
  ['都市に灯りをともしています…', () => { for (let i = 0; i < 4; i++) TR.Tex.facade(i); for (let i = 0; i < 6; i++) TR.Tex.billboard(i); TR.Tex.cityPanel(); TR.Tex.wallLane(); }],
  ['地球を回しています…', () => { TR.Tex.earth(); TR.Tex.earthClouds(); TR.Tex.plasma(); TR.Tex.swirl(); }],
  ['大気と光を整えています…', () => { W.init(scene, renderer); FX.init(scene); applyQuality(); }],
  ['TENMAを組み立てています…', () => { TR.Tex.livery(settings.paint); car = Md.playerCar(settings.paint); scene.add(car); }],
  ['断崖への道を敷いています…', () => { W.reset(0); }],
  ['シェーダーを準備しています…', () => { camera.position.set(6, 2.4, 6); camera.lookAt(0, 1, 0); renderer.compile(scene, camera); }],
];
let bootI = 0;
function boot(){
  if (bootI < bootSteps.length){
    const [txt, fn] = bootSteps[bootI]; setLoad(bootI / bootSteps.length, txt);
    setTimeout(() => { try { fn(); } catch(e){ console.error(e); } bootI++; boot(); }, 16);
    return;
  }
  setLoad(1, 'READY');
  buildTitleUI(); applySettingsUI();
  setTimeout(() => { $('loading').classList.add('out'); setTimeout(() => $('loading').hidden = true, 800); }, 150);
  goTitle();
  requestAnimationFrame(frame);
}

/* ---------- UI: title, settings, records ---------- */
function showScreen(id){ ['title', 'pause', 'result', 'settings', 'how', 'records'].forEach(s => $(s).hidden = s !== id); }
let selCh = 0, settingsReturn = 'title';
function buildTitleUI(){
  const ps = $('paintSeg'); ps.innerHTML = '';
  Object.entries(TR.Tex.PAINTS).forEach(([k, P]) => {
    const b = document.createElement('button'); b.style.background = `linear-gradient(135deg, ${P.base} 55%, ${P.accent} 55%)`;
    b.setAttribute('aria-label', P.name); b.title = P.name; b.setAttribute('aria-pressed', k === settings.paint);
    b.onclick = () => { settings.paint = k; saveSettings(); Md.setPaint(car, k); [...ps.children].forEach(c => c.setAttribute('aria-pressed', c === b)); AU.sfx('select'); };
    ps.appendChild(b);
  });
  segGroup('diffSeg', v => { settings.diff = v; S.diff = DIFF[v]; saveSettings(); $('diffNote').textContent = DIFF[v].note; renderChapters(); }, settings.diff);
  $('diffNote').textContent = S.diff.note;
  renderChapters();
  $('startBtn').onclick = () => { AU.init(); AU.sfx('confirm'); startRun(selCh, false); };
  $('taBtn').onclick = () => { AU.init(); AU.sfx('confirm'); startRun(selCh, true); };
  $('setBtnT').onclick = () => { AU.init(); AU.sfx('select'); settingsReturn = 'title'; showScreen('settings'); };
  $('howBtn').onclick = () => { AU.init(); AU.sfx('select'); showScreen('how'); };
  $('howClose').onclick = () => { AU.sfx('back'); showScreen('title'); };
  $('recBtn').onclick = () => { AU.init(); AU.sfx('select'); renderRecords(); showScreen('records'); };
  $('recClose').onclick = () => { AU.sfx('back'); showScreen('title'); };
  $('recReset').onclick = () => {
    if (!confirm('ローカルに保存された記録と解放状況をすべて消去しますか？（設定は残ります）')) return;
    progress = JSON.parse(JSON.stringify(DEF_PROG)); saveProgress(); selCh = 0; renderRecords(); renderChapters(); AU.sfx('back');
  };
  $('setClose').onclick = () => { AU.sfx('back'); if (settingsReturn === 'pause') showScreen('pause'); else showScreen('title'); };
  $('setBtnP').onclick = () => { AU.sfx('select'); settingsReturn = 'pause'; showScreen('settings'); };
  $('resumeBtn').onclick = () => togglePause(false);
  $('cpBtn').onclick = () => { togglePause(false); respawn(true); };
  $('restartBtn').onclick = () => { showScreen(null); S.mode = 'pause'; startRun(S.chapter, S.ta, true); };
  $('quitBtn').onclick = () => { S.mode = 'pause'; setMode('title'); goTitle(true); };
  $('nextBtn').onclick = () => { AU.sfx('confirm'); S.mode = 'result'; startRun(S.ta ? S.startCh : 0, S.ta); };
  $('retryBtn').onclick = () => { AU.sfx('confirm'); S.mode = 'result'; startRun(S.chapter, S.ta); };
  $('homeBtn').onclick = () => { AU.sfx('back'); S.mode = 'result'; setMode('title'); goTitle(true); };
  $('pauseBtn').onclick = () => togglePause(true);
  $('muteBtn').onclick = () => { AU.init(); AU.setMute(!AU.muted); $('muteIco').src = 'assets/ui/' + (AU.muted ? 'mute' : 'sound') + '.svg'; };
  $('skipBtn').onclick = () => skipCine();
}
function renderChapters(){
  const el = $('chapters'); el.innerHTML = '';
  CH.forEach((c, i) => {
    const b = document.createElement('button'); const rec = progress.chapters[i];
    b.innerHTML = `<b>${c.code}</b><span>${c.jp}</span><em>${rec && rec.time ? fmtT(rec.time) : ''}</em>`;
    b.disabled = i > progress.unlocked; b.setAttribute('aria-pressed', i === selCh);
    b.title = c.name + ' — ' + c.goal;
    b.onclick = () => { selCh = i; AU.init(); AU.sfx('select'); renderChapters(); };
    el.appendChild(b);
  });
  $('startBtn').querySelector('span').textContent = selCh === 0 ? '冒険をはじめる' : CH[selCh].code + ' ' + CH[selCh].jp + ' から';
  $('taBtn').hidden = !progress.story;
  const b = progress.chapters.reduce((a, r) => a + (r ? r.score : 0), 0);
  $('bestLine').textContent = progress.story ? 'STORY CLEAR ✦  章ベスト合計 ' + b.toLocaleString() : (progress.unlocked ? '到達：' + CH[progress.unlocked].code + ' ' + CH[progress.unlocked].jp : '');
}
function renderRecords(){
  let h = '<tr><th>章</th><th>ベストスコア</th><th>ベストタイム</th><th>救済</th><th>墜落</th></tr>';
  CH.forEach((c, i) => { const r = progress.chapters[i]; h += `<tr><td>${c.code} ${c.jp}</td><td>${r ? r.score.toLocaleString() : '—'}</td><td>${r && r.time ? fmtT(r.time) : '—'}</td><td>${r ? r.rescues : '—'}</td><td>${r ? r.crashes : '—'}</td></tr>`; });
  $('recTable').innerHTML = h;
  $('rankList').innerHTML = progress.ranking.length ? progress.ranking.map(r => `<li>${r.score.toLocaleString()} — ${r.diff} · ${fmtT(r.time)} · 救済${r.rescues}回 <small>(${r.date})</small></li>`).join('') : '<li style="list-style:none;opacity:.6">まだ記録がありません</li>';
}
function segGroup(id, cb, initial){
  const el = $(id); [...el.children].forEach(b => {
    b.setAttribute('aria-pressed', b.dataset.v === String(initial));
    b.onclick = () => { [...el.children].forEach(c => c.setAttribute('aria-pressed', c === b)); AU.sfx('select'); cb(b.dataset.v); };
  });
}
function applySettingsUI(){
  const bind = (id, key, after) => { const el = $(id); el.checked = !!settings[key]; el.onchange = () => { settings[key] = el.checked; saveSettings(); if (after) after(); }; };
  bind('musicOn', 'musicOn', () => AU.setMusicOn(settings.musicOn));
  bind('sfxOn', 'sfxOn', () => AU.setSfxOn(settings.sfxOn));
  bind('subChk', 'subs', () => { if (!settings.subs) $('subtitle').classList.remove('on'); });
  bind('motionChk', 'motion'); bind('flashChk', 'flash'); bind('slowChk', 'slow'); bind('shortChk', 'short'); bind('vibChk', 'vib'); bind('guideChk', 'guide');
  const mv = $('musicVol'), sv = $('sfxVol');
  mv.value = settings.music * 100; sv.value = settings.sfx * 100;
  mv.oninput = () => { settings.music = mv.value / 100; AU.setMusicVol(settings.music); saveSettings(); };
  sv.oninput = () => { settings.sfx = sv.value / 100; AU.setSfxVol(settings.sfx); saveSettings(); };
  AU.setMusicVol(settings.music); AU.setSfxVol(settings.sfx); AU.setMusicOn(settings.musicOn); AU.setSfxOn(settings.sfxOn);
  segGroup('qualSeg', v => { settings.quality = v; saveSettings(); qualityKey = v === 'auto' ? (isTouch() ? 'mid' : 'high') : v; dynScale = 1; applyQuality(); }, settings.quality);
  segGroup('assistSeg', v => { settings.assist = +v; saveSettings(); }, settings.assist);
}

/* ---------- flow ---------- */
let titleT = 0;
function goTitle(fromGame){
  showScreen('title'); $('hud').hidden = true; $('touch').hidden = true;
  if (S.mode === 'loading') setMode('title'); else S.mode = 'title';
  document.body.dataset.mode = 'title';
  if (fromGame){ W.reset(0); }
  S.x = 0; S.y = 0; S.z = 40; S.vx = S.vy = 0; S.speed = 0; S.grounded = true; S.gflip = false; S.wall = null; S.heat = 0; S.cine = null;
  car.visible = true; car.rotation.set(0, 0, 0); car.userData.inner.rotation.set(0, 0, 0);
  FX.clear(); FX.setWeather(1); clearCine(); $('letterbox').classList.remove('on');
  AU.setMode('title'); AU.silenceLoops();
  renderChapters();
}

function startRun(ci, ta, restart){
  showScreen(null); $('hud').hidden = false; $('touch').hidden = !isTouch(); document.body.classList.toggle('touch', isTouch());
  S.mode = S.mode === 'title' || S.mode === 'result' || S.mode === 'gameover' || S.mode === 'pause' ? S.mode : 'title';
  if (!setMode('countdown')){ S.mode = 'title'; setMode('countdown'); }
  S.ta = !!ta; S.startCh = ci; S.chapter = ci; S.results = []; S.t = 0;
  S.route = null; S.beacons = 0; S.hints = restart ? S.hints : {}; S.subsSaid = {};
  W.reset(ci);
  if (ci === 4) W.setRoute(false);
  enterChapter(ci, true);
  placeAtStart(ci);
  S.fuel = 100; S.energy = ci > 0 ? 40 : 0; S.heat = 0; S.combo = 0; S.countdown = S.ta ? 2.2 : (ci === 0 && !restart ? 3.2 : 2.2); S.lightStep = -1;
  S.lives = S.diff.lives; S.crashT = 0; S.invuln = 0; S.eboostT = 0; S.rescueT = 0; S.timeScale = 1; S.cine = null; S.rollout = false; S.finaleT = 0;
  const L = $('lights'); L.hidden = false; L.querySelectorAll('i').forEach(i => i.classList.remove('on'));
  FX.clear(); clearCine(); car.visible = true;
  AU.init(); AU.zoneNow(CH[ci].song); AU.setMode('play');
  showBanner(ci, true);
  rescueIcons(); hud(true);
}
function placeAtStart(ci){
  const c = CH[ci], z = c.z0 + (ci === 0 ? 30 : 30);
  const cp = firstCheckpoint(ci);
  S.x = 0; S.z = cp ? cp.z : z; S.y = cp ? cp.y : W.pathY(z); S.vx = 0; S.vy = 0;
  S.speed = ci === 0 ? 0 : W.speedAt(S.z) * .8;
  S.cp = cp || { z: S.z, x: 0, y: S.y, ci };
  settle();
  camPos.set(S.x, S.y + 3, S.z - 9);
}
function firstCheckpoint(ci){ const C = W.built[ci]; return C && C.checkpoints.length ? Object.assign({ ci }, C.checkpoints[0]) : null; }
// put the car on the floor if there is one under it
const near = [];
function settle(){
  W.solidsNear(S.z, near);
  let best = null, bh = -1e9;
  for (const s of near){ if (S.x < s.x0 || S.x > s.x1 || S.z < s.z0 || S.z > s.z1) continue; const h = W.topAt(s, S.z); if (h <= S.y + 1.5 && h > bh){ bh = h; best = s; } }
  if (best){ S.y = bh; S.grounded = true; S.floorS = best; } else { S.grounded = false; S.floorS = null; }
  S.gflip = false; S.gflipT = 0; S.wall = null; S.airT = 0;
  S.prevX = S.x; S.prevY = S.y; S.prevZ = S.z;
}
function enterChapter(ci, silent){
  S.chapter = ci;
  S.stats = newStats(ci);
  const C = W.built[ci];
  if (C){ S.stats.ringsTotal = C.items.filter(i => i.kind === 'ring').length; S.stats.exploreTotal = C.items.filter(i => i.kind !== 'ring').length; }
  S.rescueLeft = S.diff.rescues + settings.assist;
  S.lives = S.diff.lives; S.failStreak = 0;
  FX.setWeather(CH[ci].weather);
  AU.setZone(CH[ci].song);
  rescueIcons();
  if (!silent){ AU.zoneNow(CH[ci].song); showBanner(ci, false); AU.sfx('chapter'); }
  sayChapter(ci);
}

/* ---------- messages ---------- */
let toastT = 0, toastPri = 0, banT = 0, subT = 0, subQ = [];
function toast(big, small = '', dur = 1.2, cls = '', pri = 1){
  if (toastT > 0 && pri < toastPri) return;
  const t = $('toast'); $('toastBig').textContent = big; $('toastSmall').textContent = small;
  t.className = 'toast on ' + cls; toastT = dur; toastPri = pri;
}
function showBanner(ci, start){
  const c = CH[ci];
  $('banCode').textContent = (start && S.ta ? 'TIME ATTACK · ' : '') + 'CHAPTER ' + (ci + 1) + ' · ' + c.code;
  $('banName').textContent = c.name; $('banJp').textContent = c.jp; $('banSub').textContent = c.intro + '　目標：' + c.goal;
  $('banner').classList.add('on'); banT = 4.2;
}
// subtitles: radio lines from SORA, the navigation AI (important cues are always also shown as text/icons)
function say(text, dur = 3.6, who = 'ソラ'){
  subQ.push({ text, dur, who });
}
function sayOnce(k, text, dur){ if (S.subsSaid[k]) return; S.subsSaid[k] = 1; say(text, dur); }
function updateSubs(dt){
  if (S.mode === 'countdown') return;
  if (subT > 0){ subT -= dt; if (subT <= 0) $('subtitle').classList.remove('on'); return; }
  const n = subQ.shift(); if (!n) return;
  if (!settings.subs){ subT = .01; return; }
  $('subWho').textContent = n.who; $('subTxt').textContent = n.text; $('subtitle').classList.add('on'); subT = n.dur;
}
const CH_LINES = [
  ['TENMA、起動を確認。今日の空は、まだ誰のものでもないよ。', '推力を長押しすれば浮かぶ。離せば、ゆっくり降りる。'],
  ['道路のない街。……でも大丈夫、壁が道になる。', '光るレーンの壁に横から寄せてみて。'],
  ['嵐の上へ。竜巻は怖いけど、上昇気流は味方だ。'],
  ['高度100キロ。……見えるかい。あれが、ぼくらの星だ。', '光のビーコンを集めて、帰り道を照らそう。'],
  ['大気圏に突入する。熱に気をつけて——浅く、まっすぐ。'],
];
function sayChapter(ci){ if (ci === 3) return; CH_LINES[ci].forEach((l, i) => sayOnce('ch' + ci + '_' + i, l)); }
function hint(html, buttons){
  const c = $('hintCard'); $('hintTxt').innerHTML = html; const b = $('hintBtns'); b.innerHTML = '';
  (buttons || [['OK', () => {}]]).forEach(([label, fn], i) => { const e = document.createElement('button'); e.className = i ? 'ghost' : 'go'; e.innerHTML = '<span>' + label + '</span>'; e.onclick = () => { c.hidden = true; fn(); AU.sfx('select'); }; b.appendChild(e); });
  c.hidden = false;
}
function flash(strength = .7){
  if (settings.flash){ strength *= .25; }
  const f = $('flash'); f.style.transition = 'none'; f.style.opacity = strength;
  requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = 'opacity .7s'; f.style.opacity = 0; }));
}
function pulse(){ if (settings.flash) return; const p = $('pulse'); p.style.transition = 'none'; p.style.opacity = .5; requestAnimationFrame(() => { p.style.transition = 'opacity .5s'; p.style.opacity = 0; }); }
function vibrate(p){ if (!settings.vib) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch(e){} }
function popup(text, cls = ''){
  const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text;
  el.style.top = (-Math.random() * 30) + 'px'; $('popups').appendChild(el); setTimeout(() => el.remove(), 1000);
}
function rescueIcons(){
  const el = $('rescues'); el.innerHTML = '';
  const n = S.diff.rescues + settings.assist;
  for (let i = 0; i < n; i++){ const b = document.createElement('i'); if (i >= S.rescueLeft) b.className = 'off'; el.appendChild(b); }
  if (S.diff.lives){ const e = document.createElement('em'); e.textContent = '×' + S.lives; el.appendChild(e); }
}

/* ---------- scoring (normalized per chapter, balanced across categories) ---------- */
const PAR = [95, 115, 120, 125, 110];
function chapterScore(st, final){
  const ci = st.ci;
  const clear = st.cleared ? 2500 : 0;
  // chapters without rings (the cosmos) score this category from beacons instead
  const rings = st.ringsTotal ? 2000 * st.rings / st.ringsTotal : (ci === 3 ? 2000 * S.beacons / 5 : 0);
  const skill = Math.min(2000, st.near * 140 + st.wallSec * 90 + st.perfect * 260 + st.tornadoSec * 60 + st.bigAir * 220);
  const explore = st.exploreTotal ? 1500 * st.explore / st.exploreTotal : 0;
  const safety = Math.max(0, 1500 - st.crashes * 350) * (final ? 1 : clamp(st.t / PAR[ci], 0, 1));
  const time = final && st.cleared ? 500 * clamp((PAR[ci] * 1.5 - st.t) / (PAR[ci] * .7), 0, 1) : 0;
  return { clear, rings, skill, explore, safety, time, total: Math.round(clear + rings + skill + explore + safety + time) };
}
function liveScore(){ return S.results.reduce((a, r) => a + r.score.total, 0) + (S.stats ? chapterScore(S.stats, false).total : 0); }
function comboUp(){ S.combo++; S.comboT = 5; if (S.combo > 1) AU.sfx('combo', S.combo); }
function addEnergy(v, label){
  const was = S.energy >= 100;
  S.energy = Math.min(100, S.energy + v);
  if (!was && S.energy >= 100){ AU.sfx('ready'); toast('BOOST READY', isTouch() ? 'BOOSTボタンで緊急ブースト' : 'Shift で緊急ブースト', 1.4, 'gold', 2); once('eb', () => sayOnce('eb', '緊急ブーストが使えるよ。危ない時の切り札だ。')); }
  if (label) popup(label, 'gold');
}
function once(k, fn){ if (!S.hints[k]){ S.hints[k] = 1; fn(); } }

/* ---------- danger: rescue or crash ---------- */
function danger(reason, kind){
  if (S.invuln > 0 || S.crashT > 0 || S.rescueT > 0) return;
  if (S.rescueLeft > 0){ rescue(reason, kind); return; }
  crash(reason);
}
function rescue(reason, kind){
  S.rescueLeft--; S.stats.rescues++; rescueIcons();
  const real = settings.slow ? clamp(.7 + settings.assist * .15, .7, 1.2) : 0;
  S.rescueT = Math.max(real, .01); S.timeScale = settings.slow ? .22 : 1;
  S.invuln = 1.9;
  const up = S.gflip ? -1 : 1;
  if (kind === 'fall'){ const b = W.boundsAt(S.z); S.y = Math.max(S.y, b.kill + 6); S.vy = 15 * up; S.fuel = Math.max(S.fuel, 55); S.wall = null; }
  else if (kind === 'heat'){ S.heat = 35; S.vy = Math.max(S.vy, -2); }
  else if (kind === 'land'){ S.vy = 0; }
  else { S.speed *= .75; S.vy = Math.max(S.vy, 4 * up); }
  AU.sfx('rescue'); vibrate([20, 40, 20]);
  FX.rescueGlow(S.x, S.y, S.z);
  toast('RESCUE', reason + '　救済で回避（残り' + S.rescueLeft + '）', 1.6, 'gold', 3);
  $('rescueVeil').style.opacity = 1;
}
function crash(reason){
  S.crashT = 1.7; S.lastReason = reason; S.stats.crashes++; S.failStreak++;
  S.combo = 0; S.wall = null; S.eboostT = 0;
  if (S.diff.lives){ S.lives--; rescueIcons(); }
  AU.sfx('crash'); vibrate([60, 40, 90]);
  FX.explosion(S.x, S.y, S.z, S.speed * .4, 0xffffff);
  S.shake = 1; flash(.35);
  toast(reason, S.diff.lives && S.lives <= 0 ? '' : 'チェックポイントから再開', 1.6, 'warn', 3);
}
const TIPS = {
  '岩に激突!': '岩は<b>推力を短く押して</b>跳び越えるか、<b>左右</b>でよけよう。',
  '谷へ落下!': '谷の手前で<b>推力を長押し</b>。燃料は地面で回復するよ。',
  'ビルに激突!': '光るレーンのない壁は危ない。<b>早めに操舵</b>して隙間を通ろう。',
  '車両と接触!': '空中車両の<b>真横をすり抜ける</b>とニアミス。でも当たらないように。',
  '落雷!': '黄色く光る雷柱は<b>約1秒後に落ちる</b>。光ったら横へ。',
  '熱限界!': '<b>推力で機首を上げると</b>減速して熱が下がる。リングの通路の中を飛ぼう。',
  '小惑星に衝突!': '宇宙は慣性が強い。<b>早めに少しだけ</b>操舵しよう。',
  '着地失敗!': '着地の直前に<b>推力をふわっと</b>。ガイドが緑なら安全。',
  '雲海に呑まれた!': '雲海の近くでは<b>推力で高度を保とう</b>。竜巻に入れば一気に上昇できる。',
  '都市の谷へ落下!': '燃料が少ない時は<b>発着パッドに着地</b>して回復しよう。',
};
function afterCrash(){
  if (S.diff.lives && S.lives <= 0){ gameOver(); return; }
  respawn(false);
  if (S.failStreak === 3) hint('ヒント：' + (TIPS[S.lastReason] || '少し手前から慎重に。'), [['OK', () => {}]]);
  if (S.failStreak >= 5 && !S.assistOffered && settings.assist < 2){
    S.assistOffered = true;
    hint('なかなか手ごわいね。<b>操作アシスト</b>を強めますか？（救済回数と姿勢補助が増えます。いつでも設定で戻せます）', [['強める', () => { settings.assist = Math.min(2, settings.assist + 1); saveSettings(); applySettingsUI(); S.rescueLeft++; rescueIcons(); toast('アシスト強化', '救済 +1・姿勢補助アップ', 1.4, 'cyan', 2); }], ['このまま', () => {}]]);
  }
}
function respawn(manual){
  const cp = S.cp || { z: CH[S.chapter].z0 + 30, x: 0, y: W.pathY(CH[S.chapter].z0 + 30) };
  // the chapter may have been streamed out (very rare); rebuild it
  W.build(W.chapterAt(cp.z));
  S.x = cp.x; S.z = cp.z; S.y = cp.y + (W.chapterAt(cp.z) === 0 ? 0 : 2); S.vx = 0; S.vy = 0;
  S.speed = W.speedAt(S.z) * .75; S.fuel = 100; S.heat = Math.min(S.heat, 25);
  S.crashT = 0; S.invuln = 2; S.wall = null; S.eboostT = 0; S.rescueT = 0; S.timeScale = 1; S.rollout = false;
  settle();
  if (W.chapterAt(S.z) === 0 && S.grounded) S.speed = 20;
  camPos.set(S.x, S.y + 3, S.z - 9);
  car.visible = true; FX.setGuide(false);
  if (manual) toast('チェックポイント', '', .8, 'cyan', 1);
}
function gameOver(){
  if (!setMode('gameover')) return;
  showResult(true);
}

/* ---------- chapter progress ---------- */
function chapterClear(ci, sub){
  const st = S.stats; if (!st || st.cleared || st.ci !== ci) return;
  st.cleared = true;
  const score = chapterScore(st, true);
  const r = { ci, t: st.t, score, st: Object.assign({}, st) };
  S.results.push(r);
  // records
  const prev = progress.chapters[ci];
  r.newBest = !prev || score.total > prev.score; r.newTime = !prev || !prev.time || st.t < prev.time;
  progress.chapters[ci] = { score: Math.max(score.total, prev ? prev.score : 0), time: prev && prev.time ? Math.min(prev.time, st.t) : st.t, rescues: r.newBest ? st.rescues : prev.rescues, crashes: r.newBest ? st.crashes : prev.crashes };
  progress.unlocked = Math.max(progress.unlocked, Math.min(CH.length - 1, ci + 1));
  saveProgress();
  AU.sfx('gate'); pulse(); vibrate(30);
  $('banCode').textContent = 'CHAPTER CLEAR · ' + CH[ci].code;
  $('banName').textContent = CH[ci].name; $('banJp').textContent = fmtT(st.t) + '　SCORE ' + score.total.toLocaleString() + (r.newBest ? '　NEW BEST!' : '');
  $('banSub').textContent = sub || '';
  $('banner').classList.add('on'); banT = 3.4;
  if (S.ta || ci === 4){ if (ci === 4) return; setMode('transition'); setTimeout(() => { if (S.mode === 'transition' || S.mode === 'play'){ S.mode = 'transition'; setMode('result'); showResult(false); } }, 2600); return; }
  setMode('transition'); S.transT = 2.6;
}

/* ---------- input ---------- */
const KEY = { ArrowLeft: 'kL', KeyA: 'kL', ArrowRight: 'kR', KeyD: 'kR', Space: 'kT', ArrowUp: 'kT', KeyW: 'kT', ShiftLeft: 'kB', ShiftRight: 'kB' };
addEventListener('keydown', e => {
  if (e.code === 'Escape' || e.code === 'KeyP'){ if (S.mode === 'pause') togglePause(false); else togglePause(true); e.preventDefault(); return; }
  if (e.code === 'Enter' && S.mode === 'title' && $('title').hidden === false){ $('startBtn').click(); return; }
  const k = KEY[e.code]; if (!k) return;
  input[k] = true; e.preventDefault();
  if (k === 'kB' && S.cine) skipCine();
});
addEventListener('keyup', e => { const k = KEY[e.code]; if (k){ input[k] = false; e.preventDefault(); } });
addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => { if (document.hidden){ releaseAll(); if (S.mode === 'play' || S.mode === 'countdown' || S.mode === 'transition') togglePause(true); AU.suspend(true); } else AU.suspend(false); });
function releaseAll(){ for (const k of ['kL', 'kR', 'kT', 'kB', 'tL', 'tR', 'tT', 'tB']) input[k] = false; document.querySelectorAll('.tbtn.down').forEach(b => b.classList.remove('down')); }
function holdBtn(id, key){
  const el = $(id); const ids = new Set();
  const on = e => { e.preventDefault(); AU.init(); ids.add(e.pointerId); input[key] = true; el.classList.add('down'); try { el.setPointerCapture(e.pointerId); } catch(_){} if (key === 'tB' && S.cine) skipCine(); };
  const off = e => { ids.delete(e.pointerId); if (!ids.size){ input[key] = false; el.classList.remove('down'); } };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
  el.addEventListener('contextmenu', e => e.preventDefault());
}
holdBtn('leftBtn', 'tL'); holdBtn('rightBtn', 'tR'); holdBtn('thrustBtn', 'tT'); holdBtn('eboostBtn', 'tB');
$('stage').addEventListener('pointerdown', () => { AU.init(); if (S.cine && S.cine.skippable) skipCine(); });
let padPrevStart = false;
function pollPad(){
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; const p = pads && [...pads].find(x => x);
  input.pSteer = 0; input.pT = false; input.pB = false; if (!p) return;
  let ax = p.axes[0] || 0; if (Math.abs(ax) < .2) ax = 0;
  if (p.buttons[14] && p.buttons[14].pressed) ax = -1; if (p.buttons[15] && p.buttons[15].pressed) ax = 1;
  input.pSteer = ax; input.pT = !!(p.buttons[0] && p.buttons[0].pressed); input.pB = !!((p.buttons[7] && p.buttons[7].pressed) || (p.buttons[2] && p.buttons[2].pressed));
  const st = !!(p.buttons[9] && p.buttons[9].pressed); if (st && !padPrevStart) togglePause(S.mode !== 'pause'); padPrevStart = st;
}
function combineInput(){
  pollPad();
  const k = (input.kR || input.tR ? 1 : 0) - (input.kL || input.tL ? 1 : 0);
  input.steer = clamp(k + input.pSteer, -1, 1);
  input.thrust = input.kT || input.tT || input.pT;
  input.boost = input.kB || input.tB || input.pB;
}
function togglePause(on){
  if (on){
    if (!['play', 'countdown', 'transition'].includes(S.mode)) return;
    S.pausedFrom = S.mode; if (!setMode('pause')) return;
    releaseAll(); AU.setMode('off'); AU.silenceLoops();
    $('pauseInfo').textContent = CH[S.chapter].code + ' ' + CH[S.chapter].jp + '　' + fmtT(S.stats ? S.stats.t : 0) + '　燃料 ' + Math.round(S.fuel) + '%';
    showScreen('pause'); AU.sfx('back');
  } else {
    if (S.mode !== 'pause') return;
    const back = S.pausedFrom || 'play'; setMode(back);
    showScreen(null); AU.setMode('play'); AU.sfx('confirm'); lastT = performance.now();
  }
}

/* ---------- cinematics (short, always skippable; player keeps control unless stated) ---------- */
function startCine(kind, dur, opts = {}){
  if (settings.short) dur = Math.min(dur, opts.min || 1.5);
  S.cine = { kind, t: 0, dur, skippable: true, ...opts };
  $('skipBtn').hidden = dur < 1.6;
  if (opts.letterbox && !settings.short) $('letterbox').classList.add('on');
}
function skipCine(){ if (!S.cine) return; S.cine.t = S.cine.dur; }
function clearCine(){ S.cine = null; $('skipBtn').hidden = true; $('letterbox').classList.remove('on'); }

/* ---------- physics: one fixed step ---------- */
const STEP = 1 / 60;
function step(dt){
  const realDt = dt; dt *= S.timeScale;
  W.update(realDt, S.z, dt);
  Md.update(realDt);
  if (S.mode === 'title') return;
  if (S.mode === 'finale'){ finaleStep(realDt); return; }

  // countdown
  if (S.mode === 'countdown'){
    S.countdown -= realDt;
    const total = 2.4, idx = Math.min(3, Math.floor((total - S.countdown) / (total / 3)));
    if (idx !== S.lightStep && S.countdown > 0 && idx >= 0){ S.lightStep = idx; const L = $('lights').querySelectorAll('i'); if (idx < 3){ L[idx].classList.add('on'); AU.sfx('beep', 0); } }
    if (S.countdown <= 0){
      const L = $('lights').querySelectorAll('i'); L.forEach(i => i.classList.remove('on')); L[3].classList.add('on');
      AU.sfx('beep', 1); setTimeout(() => { $('lights').hidden = true; }, 500);
      setMode('play');
      if (S.chapter === 0 && S.grounded) once('t0', () => toast('GO!', isTouch() ? '右下の「推力」を長押しで浮上' : 'Space 長押しで浮上', 1.6, 'gold', 3));
      else toast('GO!', '', .8, 'gold', 3);
    }
    placeCar(realDt); camFollow(realDt); hudThrottled(realDt);
    AU.update({ speed: S.speed, thrust: 0, grounded: S.grounded, playing: true });
    return;
  }
  if (S.mode === 'transition'){ S.transT -= realDt; if (S.transT <= 0) setMode('play'); }

  // crashed: wait, then respawn
  if (S.crashT > 0){
    S.crashT -= realDt; S.speed *= Math.pow(.3, realDt);
    car.visible = false;
    if (S.crashT <= 0) afterCrash();
    camFollow(realDt); hudThrottled(realDt); FX.setGuide(false);
    AU.update({ speed: 0, thrust: 0, grounded: true, playing: false });
    return;
  }
  // rescue slow-motion (real-time clock)
  if (S.rescueT > 0){ S.rescueT -= realDt; if (S.rescueT <= 0){ S.timeScale = S.slowT > 0 ? S.timeScale : 1; $('rescueVeil').style.opacity = 0; } }
  if (S.slowT > 0){ S.slowT -= realDt; S.timeScale = S.slowT > 0 ? S.slowScale : (S.rescueT > 0 ? .22 : 1); }
  if (S.invuln > 0) S.invuln -= dt;
  if (S.comboT > 0){ S.comboT -= dt; if (S.comboT <= 0) S.combo = 0; }
  if (S.nearCool > 0) S.nearCool -= dt;
  S.t += dt; S.stats.t += dt;

  const ci = W.chapterAt(S.z);
  if (ci !== S.chapter && ci > S.chapter){
    // crossing into the next chapter: no blackout, just a title card and a new song
    if (!S.ta){ enterChapter(ci, false); if (ci === 3) arriveInSpace(); }
    else { /* time attack ends at the gate */ }
  }
  const P = W.physAt(S.z), B = W.boundsAt(S.z);
  const assist = settings.assist + (S.diff.key === 'easy' ? 1 : S.diff.key === 'hard' ? -1 : 0);

  /* emergency boost */
  const bPressed = input.boost && !input.prevBoost;
  if (bPressed && S.energy >= 100 && S.eboostT <= 0 && !S.cine){
    S.eboostT = PH.EBOOST_T; S.energy = 0; S.invuln = Math.max(S.invuln, PH.EBOOST_T);
    AU.sfx('eboost'); flash(.25); vibrate(40); toast('EMERGENCY BOOST', '', 1, 'gold', 2);
    if (S.wall) leaveWall(true);
  }
  const eb = S.eboostT > 0;
  if (eb) S.eboostT -= dt;

  /* forward speed */
  let target = W.speedAt(S.z) * (eb ? 1.45 : 1) * (S.wall ? 1.1 : 1);
  if (S.inStorm) target *= .8;
  // caught by rising air: the vortex holds you so the ride lasts (environment as a resource)
  if (S.volIn) target *= S.volIn.big ? .22 : S.volIn.kind === 'tornado' ? .28 : .5;
  if (ci === 4 && input.thrust && !S.grounded && S.z < 21300) target *= .82; // flare: thrust bleeds speed during reentry
  if (S.rollout){ target = 0; }
  if (S.grounded && ci === 0 && S.z < 60 && S.speed < 1 && !input.thrust && !input.steer) target = Math.max(target, 0);
  const acc = S.rollout ? 2.2 : S.volIn ? 4.5 : (S.speed < target ? (eb ? 3 : 1.1) : .9);
  S.speed = damp(S.speed, target, acc, dt);

  /* steering */
  if (S.wall) wallStep(dt);
  else if (P.inertia > .5){
    // space: inertia with gentle auto-damping (keeps beginners from drifting away)
    S.vx += -input.steer * 26 * dt;
    const dk = P.latDamp + (input.steer ? 0 : 1.2 + assist * .6);
    S.vx *= Math.exp(-dk * dt); S.vx = clamp(S.vx, -P.latV, P.latV);
  } else {
    const tvx = -input.steer * (P.latV + S.speed * .04);
    S.vx = damp(S.vx, tvx, S.grounded ? P.latDamp : P.airDamp, dt);
  }
  S.prevX = S.x; S.prevY = S.y; S.prevZ = S.z;
  S.x += S.vx * dt;
  if (!S.wall && Math.abs(S.x) > B.xl){
    const side = Math.sign(S.x);
    if (B.soft){ S.vx -= side * 20 * dt; S.x = clamp(S.x, -B.xl - 4, B.xl + 4); if (Math.abs(S.x) > B.xl + 3.9) S.vx = -side * 2; }
    else { S.x = side * B.xl; if (Math.abs(S.vx) > 3){ scrape(side); } S.vx = 0; }
  }

  /* thrust & fuel */
  const pressed = input.thrust && !input.prevThrust;
  let thrust = 0;
  if (input.thrust && S.fuel > 0 && !S.rollout){ thrust = 1; if (!S.grounded && !eb) S.fuel = Math.max(0, S.fuel - PH.FUEL_DRAIN * (S.wall ? .3 : 1) * dt); }
  if (input.thrust && S.fuel <= 0 && !S.emptyWarned){ S.emptyWarned = true; AU.sfx('empty'); toast('燃料切れ!', '地面・パッド・燃料セル・気流で回復', 1.4, 'warn', 2); }
  if (S.fuel > 25) S.emptyWarned = false;
  S.thrustNow = thrust;

  S.z += S.speed * dt;
  const gDir = S.gflip ? 1 : -1;   // direction gravity pulls (y)
  const up = -gDir;

  /* vertical */
  if (S.grounded && !S.wall){
    const fl = floorUnder(S.x, S.z, S.y + .8);
    if (!fl || fl.h < S.y - .4 || S.gflip){
      S.grounded = false; S.airT = 0; S.coyote = fl ? 0 : PH.COYOTE; S.flightRings = 0; S.floorS = null;
      if (S.z > W.LIP_Z - 15 && S.z < W.LIP_Z + 20 && ci === 0) bigLaunch();
    } else {
      const slope = (W.topAt(fl.s, S.z + .5) - W.topAt(fl.s, S.z - .5));
      S.y = fl.h; S.vy = S.speed * slope; S.floorS = fl.s;
      if (fl.s.refuel && !eb) S.fuel = Math.min(100, S.fuel + PH.FUEL_GROUND * dt);
      if (pressed && S.fuel > 0){
        S.grounded = false; S.vy = Math.max(S.vy, PH.JUMP); S.fuel = Math.max(0, S.fuel - PH.JUMP_COST); S.airT = 0; S.flightRings = 0; S.coyote = 0;
        AU.sfx('jump'); FX.groundDust(S.x, S.y, S.z, S.speed * .4);
      }
    }
  }
  if (!S.grounded && !S.wall){
    if (S.coyote > 0){ S.coyote -= dt; if (pressed && S.fuel > 0){ S.vy = Math.max(S.vy, PH.JUMP * .9); S.coyote = 0; AU.sfx('jump'); } }
    let ay = gDir * P.G;
    if (thrust){
      const h = (up > 0 ? S.y - B.ceil : B.ceil - S.y);    // distance past the ceiling
      const ceilK = S.gflip ? 1 : 1 - clamp((h + 4) / 8, 0, 1);
      ay += up * P.thrust * ceilK;
      if (S.vy * gDir > 2.5) ay += up * PH.CUSHION;        // strong retro-burn when falling: easy soft landings
    }
    if (eb) ay += up * 10;
    // assist: gentle stabilization near the flight path in open-air chapters
    if (ci >= 1 && !S.gflip && assist > 0 && S.vy < -6) ay += (assist * 3);
    // air volumes (updraft / tornado) — environment as a resource
    let vol = null;
    for (const C of W.built){ if (!C) continue; for (const v of C.vols){ if (Math.abs(v.z - S.z) > v.r + 4) continue; const d = Math.hypot(S.x - v.x, S.z - v.z); if (d < v.r && S.y > v.y0 && S.y < v.y1){ vol = v; break; } } if (vol) break; }
    if (vol){
      const k = 1 - (Math.hypot(S.x - vol.x, S.z - vol.z) / vol.r) * .45;
      ay += vol.lift * k + (S.vy < 0 ? -S.vy * 3 : 0);
      S.fuel = Math.min(100, S.fuel + 26 * dt);
      if (vol.kind === 'tornado' || vol.big){ S.vx += (vol.kind === 'tornado' ? Math.sin(S.t * 7.3) * 22 * dt : 0) + (vol.x - S.x) * 2.2 * dt; }
      if (vol.kind === 'tornado'){ S.stats.tornadoSec += dt; addEnergy(7 * dt); S.shake = Math.max(S.shake, settings.motion ? 0 : .25); }
      if (S.volIn !== vol){ S.volIn = vol; AU.sfx(vol.kind === 'tornado' ? 'tornado' : 'updraft'); toast(vol.kind === 'tornado' ? '竜巻で上昇!' : '上昇気流!', '燃料回復中', 1.1, 'cyan', 1); if (vol.big) sayOnce('big' + vol.z, vol.gold ? '雲が……割れる。光の柱だ！' : 'この気流に乗れば、街のてっぺんまで行ける！'); }
      S.ctag = vol.kind === 'tornado' ? '竜巻 — 上昇中' : '上昇気流';
    } else { S.volIn = null; S.ctag = ''; }
    // space soft bounds: drift back toward the path instead of getting lost
    if (B.soft){ if (S.y > B.ceil) ay -= (S.y - B.ceil) * 3; if (B.floor !== undefined && S.y < B.floor) ay += (B.floor - S.y) * 3; }
    S.vy += ay * dt;
    const maxUp = vol ? (vol.big ? 30 : 24) : (eb ? 18 : PH.VYMAX);
    const termK = ci === 4 && S.z < 21300 ? P.term : P.term;
    if (gDir < 0) S.vy = clamp(S.vy, -termK, maxUp); else S.vy = clamp(S.vy, -maxUp, termK);
    if (B.soft) S.vy *= Math.exp(-.4 * dt);
    S.y += S.vy * dt; S.airT += dt;
    // fins deploy for long glides: lift on the way down
    if (S.airT > 2.2 && !S.bigAirCounted){ S.bigAirCounted = true; S.stats.bigAir++; }
  }
  if (S.grounded) S.bigAirCounted = false;

  /* collisions with solids */
  collideSolids(dt, ci);
  if (S.crashT > 0) return;

  /* falling out of the world */
  if (!S.wall && B.kill > -1e4 && S.y < B.kill){ danger(ci === 2 ? '雲海に呑まれた!' : ci === 1 ? '都市の谷へ落下!' : '谷へ落下!', 'fall'); if (S.crashT > 0) return; }
  if (S.gflip && S.y > B.ceil + 30){ S.y = B.ceil + 30; S.vy = Math.min(S.vy, 0); }

  /* gravity gate timer */
  if (S.gflip){
    S.gflipT -= dt;
    if (S.gflipT < 1.5 && !S.gWarned){ S.gWarned = true; AU.sfx('warn'); toast('重力が戻る!', '推力で落下にそなえて', 1.2, 'violet', 2); }
    if (S.gflipT <= 0){ S.gflip = false; AU.sfx('gravity', 0); }
  }

  /* movers, items, gates, hazards */
  interact(dt, ci);
  if (S.crashT > 0) return;

  /* reentry heat */
  heatStep(dt, ci, thrust);

  /* checkpoints */
  const C = W.built[ci];
  if (C){
    for (let i = 0; i < C.checkpoints.length; i++){
      const cp = C.checkpoints[i];
      if (cp.z <= S.z && (!S.cp || cp.z > S.cp.z) && cpAllowed(i)){
        const first = !S.cp || S.cp.ci !== ci;
        S.cp = Object.assign({ ci }, cp); S.failStreak = 0;
        if (!first && i > 0){ AU.sfx('checkpoint'); popup('CHECKPOINT', 'cyan'); }
      }
    }
  }

  /* contextual radio & hints */
  storyBeats(ci);

  /* stream the world */
  W.stream(S.z);

  /* effects */
  placeCar(dt);
  emitters(dt, thrust, eb, ci);
  if (!S.grounded && settings.guide && (ci === 0 || (ci === 4 && S.z > 21000) || (S.floorBelow && S.floorBelow < 40))) predictGuide(); else FX.setGuide(false);

  camFollow(realDt);
  AU.update({ speed: S.speed, thrust, boost: eb, grounded: S.grounded, wall: !!S.wall, playing: true, combo: S.combo, storm: S.inStorm ? 1 : (S.volIn && S.volIn.kind === 'tornado' ? .8 : (ci === 2 ? .25 : 0)), heat: S.plasmaK || 0, space: ci === 3 ? 1 : 0, threat: S.threat || 0, slowmo: S.timeScale < .9, alt: 0 });
  hudThrottled(realDt);
}
function cpAllowed(i){ const m = S.diff.cp; if (i === 0) return true; if (m === 'dense') return true; if (m === 'normal') return i % 3 !== 2; return i % 2 === 0; }
function scrape(side){
  S.scrapeT = (S.scrapeT || 0) - STEP;
  if (S.scrapeT <= 0){ S.scrapeT = .08; AU.sfx('scrape', 0, { pan: -side * .8 }); FX.sparks(S.x + side * PH.CAR_HW, S.y + .4, S.z, S.speed * .6, 4, -side); }
  S.speed *= .995;
}

// highest floor under (x, z) that is at or below yMax
function floorUnder(x, z, yMax){
  W.solidsNear(z, near);
  let best = null, bh = -1e9;
  for (const s of near){
    if (x < s.x0 - .2 || x > s.x1 + .2 || z < s.z0 || z > s.z1) continue;
    const h = W.topAt(s, z);
    if (h <= yMax && h > bh){ bh = h; best = s; }
  }
  return best ? { s: best, h: bh } : null;
}

function collideSolids(dt, ci){
  W.solidsNear(S.z, near);
  const hw = PH.CAR_HW * S.diff.hit, hl = PH.CAR_HL;
  S.floorBelow = null;
  for (const s of near){
    const inX = S.x + hw > s.x0 && S.x - hw < s.x1;
    const inZ = S.z + hl > s.z0 && S.z - hl < s.z1;
    const top = W.topAt(s, clamp(S.z, s.z0, s.z1));
    if (inX && S.z > s.z0 && S.z < s.z1 && S.y > top && !S.gflip){ const d = S.y - top; if (S.floorBelow === null || d < S.floorBelow) S.floorBelow = d; }
    if (!inX || !inZ) continue;
    if (S.y + PH.CAR_H < s.yb || S.y >= top - .05) continue;     // above or below the solid
    // penetrating: from above -> landing; from the front -> hit; from the side -> wall
    const prevTop = W.topAt(s, clamp(S.prevZ, s.z0, s.z1));
    if (S.prevY >= prevTop - .45 && !S.gflip){
      if (S.grounded){ S.y = top; continue; }
      land(s, top); if (S.crashT > 0) return; continue;
    }
    const prevInX = S.prevX + hw > s.x0 && S.prevX - hw < s.x1;
    const prevInZ = S.prevZ + hl > s.z0;
    if (!prevInX && prevInZ){
      // side contact
      const side = S.prevX < s.x0 ? -1 : 1;   // which side of the solid we are on
      if (s.wall && !S.grounded && S.speed > 18 && ci === 1){ startWall(s, side); continue; }
      S.x = side < 0 ? s.x0 - hw - .02 : s.x1 + hw + .02; S.vx = 0; scrape(-side);
      continue;
    }
    if (S.invuln > 0) continue;
    // head-on
    if (S.gflip && S.prevY + PH.CAR_H <= s.yb + .3){ S.y = s.yb - PH.CAR_H; S.vy = Math.min(S.vy, 0); continue; }
    danger(s.kind === 'rock' ? '岩に激突!' : s.kind === 'tower' || s.kind === 'bridge' ? 'ビルに激突!' : '壁に激突!', 'hit');
    if (S.crashT > 0) return;
  }
}

function land(s, top){
  const slope = (W.topAt(s, S.z + .5) - W.topAt(s, S.z - .5));
  const n = Math.sqrt(1 + slope * slope);
  const impact = Math.max(0, (S.speed * slope - S.vy) / n);   // velocity into the surface
  const pitch = Math.abs(car.userData.inner.rotation.x + Math.atan(slope));
  const limit = S.diff.crashV + settings.assist * 4;
  S.y = top; S.grounded = true; S.floorS = s;
  const at = S.airT; S.vy = S.speed * slope; S.airT = 0;
  if (impact > limit){ danger('着地失敗!', 'land'); if (S.crashT > 0) return; }
  const k = clamp(impact / limit, 0, 1);
  AU.sfx('land', k); S.shake = Math.max(S.shake, k * .8); landKick = settings.motion ? 0 : Math.min(.35, impact * .02);
  FX.groundDust(S.x, top, S.z, S.speed * .5); FX.groundDust(S.x, top, S.z, S.speed * .5);
  if (at > .6){
    S.stats.landings++;
    if (impact < PH.PERFECT_V && pitch < .25){
      S.stats.perfect++; comboUp(); addEnergy(16, 'PERFECT +ENERGY'); AU.sfx('perfect'); pulse(); FX.touchdown(S.x, top, S.z, true); vibrate(15);
      toast('パーフェクト着地!', '垂直 ' + impact.toFixed(1) + ' m/s · 角度 ' + Math.round(pitch * 57) + '°', 1.2, 'cyan', 2);
    } else if (impact > PH.HARD_V){
      AU.sfx('hard'); S.speed *= .85; FX.touchdown(S.x, top, S.z, false); vibrate(50);
      toast('ハード着地', '着地の直前に推力でふわっと', 1.2, 'warn', 2);
    } else { FX.touchdown(S.x, top, S.z, false); toast('着地', '垂直 ' + impact.toFixed(1) + ' m/s', .8, '', 0); }
  }
  if (s.home && W.chapterAt(S.z) === 4 && !S.rollout) homeTouchdown(impact);
}

/* ---------- wall ride (S2): the wall becomes the road ---------- */
function startWall(s, side){
  S.wall = { s, side }; S.wallT = 0; S.grounded = false;
  S.x = side < 0 ? s.x0 - PH.CAR_HW - .05 : s.x1 + PH.CAR_HW + .05;
  S.vx = 0; S.vy = Math.max(S.vy, -2); S.gflip = false;
  AU.sfx('wallride'); vibrate(20); comboUp();
  toast('WALL RIDE!', '反対へ操舵で離脱', 1, 'cyan', 1);
  once('wallfirst', () => sayOnce('wall1', 'いいね、壁が道になった！ 時間切れの前に離れて。'));
}
function wallStep(dt){
  const w = S.wall, s = w.s;
  S.wallT += dt; S.stats.wallSec += dt;
  S.fuel = Math.min(100, S.fuel + 18 * dt); addEnergy(9 * dt);
  S.vy = damp(S.vy, input.thrust ? 3 : -1.2, 3, dt);
  S.y += S.vy * dt;
  // keep glued to the face
  S.x = w.side < 0 ? s.x0 - PH.CAR_HW - .05 : s.x1 + PH.CAR_HW + .05; S.vx = 0;
  const away = input.steer !== 0 && Math.sign(-input.steer) === w.side; // steering away from the wall
  if (away) leaveWall(false);
  else if (S.z > s.z1 - 1) leaveWall(false, 'end');
  else if (S.wallT > PH.WALL_MAX + settings.assist * .6) leaveWall(false, 'time');
  else if (S.y < s.yb + 2) leaveWall(false);
}
function leaveWall(boost, why){
  const w = S.wall; if (!w) return;
  S.wall = null; S.vx = w.side * 9; S.vy = Math.max(S.vy, 5);
  AU.sfx('walloff');
  if (why === 'time') toast('グリップ切れ', '壁面走行は約3秒まで', .9, 'warn', 1);
  else popup('WALL ' + S.wallT.toFixed(1) + 's', 'cyan');
}

/* ---------- interactions: pickups, traffic, gates, storms ---------- */
function interact(dt, ci){
  const hw = PH.CAR_HW * S.diff.hit;
  S.inStorm = false; S.threat = Math.max(0, (S.threat || 0) - dt * .3);
  let warnTxt = null;
  for (const C of W.built){
    if (!C) continue;
    // pickups
    for (const it of C.items){
      if (it.got || Math.abs(it.z - S.z) > 6) continue;
      const d = Math.hypot(S.x - it.x, S.y + .5 - it.mesh.position.y, S.z - it.z);
      if (d > it.r + 1.2) continue;
      it.got = true; it.mesh.visible = false;
      if (it.kind === 'ring'){
        S.stats.rings++; S.flightRings = S.grounded ? 1 : S.flightRings + 1;
        const chain = Math.min(S.flightRings, 11);
        AU.sfx('ring', chain - 1, { pan: clamp(-(it.x - S.x) / 6, -.7, .7) }); FX.ringBurst(it.x, it.y, it.z, S.speed * .6, chain > 2);
        if (chain >= 3){ comboUp(); addEnergy(5); }
        popup('RING' + (chain > 1 ? ' ×' + chain : ''), chain > 2 ? 'cyan' : 'gold');
      } else if (it.kind === 'cell'){
        S.stats.explore++; S.fuel = Math.min(100, S.fuel + 40); AU.sfx('cell'); FX.cellBurst(it.x, it.mesh.position.y, it.z, S.speed * .6); popup('FUEL +40', 'cyan');
      } else if (it.kind === 'orb'){
        S.stats.explore++; addEnergy(22, 'ENERGY +22'); AU.sfx('energy'); FX.burst(it.x, it.mesh.position.y, it.z, S.speed * .5, [1, .8, .4], 30, 7);
      } else if (it.kind === 'beacon'){
        S.stats.explore++; S.beacons++; addEnergy(30); AU.sfx('beacon', S.beacons); FX.burst(it.x, it.y, it.z, S.speed * .4, [1, .85, .5], 80, 14); pulse(); vibrate(25);
        toast('光のビーコン ' + S.beacons + ' / 5', S.beacons >= 5 ? '帰り道が照らされた' : '次のビーコンへ', 1.4, 'gold', 2);
        if (S.beacons === 1) sayOnce('b1', 'ひとつ灯った。その光が、帰り道の目印になる。');
        if (S.beacons === 5) sayOnce('b5', '全部そろった。地球が、待ってる。');
      }
    }
    // traffic and asteroids
    for (const m of C.movers){
      const dz = m.z - S.z; if (dz < -12 || dz > 12) continue;
      if (m.kind === 'car'){
        const reach = PH.CAR_HL + m.l / 2;
        const dx = Math.abs(S.x - m.x) - (hw + m.w / 2), dy = Math.abs(S.y + .5 - m.y - .6) - (.6 + m.h / 2);
        if (Math.abs(dz) < reach){
          if (dx < 0 && dy < 0 && S.invuln <= 0 && !S.wall){ danger('車両と接触!', 'hit'); if (S.crashT > 0) return; }
          const clear = Math.max(dx, dy); m.minClear = Math.min(m.minClear === undefined ? 99 : m.minClear, clear);
        } else if (!m.passed && dz < -reach){
          m.passed = true;
          if (m.minClear !== undefined && m.minClear >= 0 && m.minClear < PH.NEAR) nearMiss(m.x);
        }
      } else {
        const d = Math.hypot(S.x - m.x, S.y + .5 - m.y, S.z - m.z) - m.r - .9 * S.diff.hit;
        if (d < 0 && S.invuln <= 0){ danger('小惑星に衝突!', 'hit'); if (S.crashT > 0) return; }
        if (d < 5) m.minClear = Math.min(m.minClear === undefined ? 99 : m.minClear, d);
        if (!m.passed && dz < -m.r - 2){ m.passed = true; if (m.minClear !== undefined && m.minClear >= 0 && m.minClear < 1.6){ nearMiss(m.x); AU.sfx('asteroid', 0, { pan: clamp((m.x - S.x) * -.2, -.8, .8) }); } }
      }
    }
    // gates
    for (const g of C.gates){
      if (g.done) continue;
      if (S.prevZ <= g.z && S.z > g.z){
        const d = Math.hypot(S.x - g.x, S.y + .5 - g.y);
        if (d < g.r){
          g.done = true;
          if (g.kind === 'gravity'){
            S.gflip = true; S.gflipT = g.dur + settings.assist * .5; S.gWarned = false; S.grounded = false; S.wall = null; S.vy = Math.max(S.vy, 4);
            AU.sfx('gravity', 1); pulse(); toast('重力反転!', '上に「落ちる」——推力は下向きに効く', 1.6, 'violet', 3);
            sayOnce('grav' + ci, '重力がひっくり返る！ 上に“落ちる”よ。');
          } else if (g.kind === 'route'){
            chooseRoute(g.route === 'steep');
          } else if (g.kind === 'exit'){
            FX.burst(g.x, g.y, g.z, S.speed * .4, [.5, .9, 1], 120, 18); flash(.3);
            chapterClear(C.ci, C.ci === 0 ? '峡谷の出口を通過。この先は、道のない都市。' : C.ci === 1 ? '気流ゲートを通過。雲の上へ。' : '成層圏の出口を通過。その先は——');
          }
        } else if (g.kind === 'exit' && Math.abs(S.z - g.z) < 1){ g.missT = (g.missT || 0); }
      }
      // exit gates are generous: pass the plane anywhere nearby and still clear
      if (g.kind === 'exit' && !g.done && S.z > g.z + 2 && S.prevZ <= g.z + 2){ g.done = true; chapterClear(C.ci, ''); }
    }
    // storm cells: turbulence
    for (const st of C.storms){
      if (Math.abs(st.z - S.z) > st.r * 2) continue;
      const d = Math.hypot(S.x - st.x, S.y - st.y, S.z - st.z);
      if (d < st.r * 1.5){ S.inStorm = true; S.vx += Math.sin(S.t * 9 + st.z) * 18 * dt; S.vy += Math.cos(S.t * 7) * 10 * dt; S.threat = Math.min(1, S.threat + dt); }
    }
    // lightning: warn ~1s ahead (visual column + sound), then strike
    for (const b of C.bolts){
      const dz = b.z - S.z; if (dz < -30 || dz > 260) continue;
      const ph = (S.t + b.phase) % b.period, warn = ph > b.period - b.warn;
      if (!b.col){ b.col = boltColumn(b); C.group.add(b.col); }
      b.col.visible = warn || b.flashT > 0;
      if (warn){ b.col.material.color.setHex(0xffcb70); b.col.material.opacity = .25 + .25 * Math.sin(S.t * 30) * (settings.flash ? .2 : 1); if (dz < 120 && dz > -5){ S.threat = Math.min(1, S.threat + dt * 2); if (!b.warned){ b.warned = true; if (dz < 80) AU.sfx('warn'); } if (Math.hypot(S.x - b.x, S.z - b.z) < b.r + 6) warnTxt = '⚡ 落雷注意 — 横へ!'; } }
      if (b.last !== undefined && ph < b.last){
        // strike
        b.warned = false; b.flashT = .25;
        if (dz < 300){
          FX.lightning(b.x, b.top + 40, b.top - 70, b.z);
          AU.sfx('thunder', 0, { pan: clamp((b.x - S.x) * -.05, -.8, .8) });
          if (dz < 120) flash(.18);
          const d = Math.hypot(S.x - b.x, S.z - b.z);
          if (d < b.r && S.y < b.top + 12 && S.y > b.top - 80 && S.invuln <= 0){ danger('落雷!', 'hit'); }
        }
      }
      if (b.flashT > 0){ b.flashT -= dt; b.col.material.color.setHex(0xe8f0ff); b.col.material.opacity = .5; }
      b.last = ph;
    }
  }
  // tornado ahead warning (visual twin of the wind sound)
  S.radarOverride = warnTxt;
}
function boltColumn(b){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r, 140, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffcb70, transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(b.x, b.top - 60, b.z); m.visible = false; return m;
}
function nearMiss(x){
  if (S.nearCool > 0) return; S.nearCool = .25;
  S.stats.near++; comboUp(); addEnergy(20);
  AU.sfx('nearmiss', 0, { pan: clamp((x - S.x) * -.3, -.8, .8) }); vibrate(15);
  S.nearZoom = settings.motion ? 0 : 1;
  toast('ニアミス!', 'NEAR MISS · ENERGY +20', .7, 'cyan', 0);
}
function chooseRoute(steep){
  if (S.route) return;
  S.route = steep ? 'steep' : 'gentle'; W.setRoute(steep);
  AU.sfx('route'); pulse();
  toast(steep ? '急降下航路' : '緩降下航路', steep ? '速く、熱い。スコア重視' : '穏やか。熱が上がりにくい', 1.8, steep ? 'warn' : 'cyan', 3);
  chapterClear(3, (steep ? '急降下' : '緩降下') + '航路を選択。ビーコン ' + S.beacons + '/5');
}

/* ---------- reentry heat (S5): heat ↔ angle ↔ deceleration ---------- */
function heatStep(dt, ci, thrust){
  S.plasmaK = 0;
  if (ci === 3 && S.z > 17790 && !S.route) chooseRoute(false);
  if (ci !== 4 || S.z > 20400 || S.z < 18050){ S.heat = Math.max(0, S.heat - 20 * dt); return; }
  const py = W.pathY(S.z), dev = Math.hypot(S.x, S.y - py);
  const angle = -S.vy / Math.max(10, S.speed);
  const steep = W.routeSteep ? 1.3 : .85;
  const env = smooth(18050, 18500, S.z) * (1 - smooth(19700, 20300, S.z));
  let rate = env * steep * (5 + Math.max(0, angle - .05) * 110 + Math.max(0, dev - 9) * 1.1 + Math.max(0, S.speed - 50) * .4);
  if (thrust) rate -= 13;
  if (dev < 9) rate -= 5;
  S.heat = clamp(S.heat + rate * dt, 0, 110);
  S.plasmaK = clamp(env * (.35 + S.heat / 130), 0, 1);
  if (S.heat > 75){ S.heatBeep = (S.heatBeep || 0) - dt; if (S.heatBeep <= 0){ S.heatBeep = .6; AU.sfx('heat'); } S.threat = 1; }
  if (S.heat >= 100) danger('熱限界!', 'heat');
}

/* ---------- story beats & radar ---------- */
function storyBeats(ci){
  const z = S.z;
  if (ci === 0){
    if (!S.grounded && S.airT > .4) sayOnce('air', '浮いた！ 噴射を離すと、ゆっくり降りる。');
    if (z > 300) once('gapHint', () => {});
    if (z > 1180) sayOnce('cliff', 'この先は崖。……大丈夫、跳べる。止まらずに行こう。');
    if (z > 2000 && S.grounded) sayOnce('canyon', '着地成功！ 峡谷の出口を目指そう。');
  }
  if (ci === 1 && z > 7480) sayOnce('summit', '街のてっぺんへ。光の柱に飛び込んで！');
  if (ci === 2 && z > 8450) sayOnce('torn', '竜巻だ。中に入ると一気に持ち上がる。燃料も回復するよ。');
  if (ci === 2 && z > 9250) sayOnce('bolt', '黄色く光った柱には、すぐ雷が落ちる。光ったら横へ！');
  if (ci === 2 && z > 12000) sayOnce('sunbreak', '雲が……割れる。');
  if (ci === 3 && z > 17300) sayOnce('route', '帰り道を選んで。急いで帰るか、やさしく帰るか。');
  if (ci === 4){
    if (z > 18350 && !S.subsSaid.reentry){ AU.sfx('reentry'); S.shake = settings.motion ? 0 : .5; }
    if (z > 18350) sayOnce('reentry', '大気圏に突入！ 推力で機首を上げれば減速できる。リングの通路の中を。');
    if (z > 20350 && !S.subsSaid.clouds){ AU.sfx('clouds'); }
    if (z > 20350) sayOnce('clouds', '雲を抜けた——朝だ。');
    if (z > 21250) sayOnce('home', 'あの台地……出発した場所だ。光るパッドに、ふわっと降りよう。');
  }
}
let radarState = '';
function setRadar(text, cls){ const k = text + '|' + cls; if (k === radarState) return; radarState = k; const r = $('radar'); r.textContent = text; r.className = 'radar ' + (cls || ''); }
function radar(){
  if (S.radarOverride){ setRadar(S.radarOverride, 'danger'); return; }
  const ci = S.chapter, z = S.z;
  let txt = '', cls = '';
  if (S.crashT > 0){ setRadar('', ''); return; }
  if (ci === 4 && S.heat > 75){ txt = '🔥 熱が危険 — 推力で減速、通路の中へ'; cls = 'danger'; }
  else if (!S.grounded && S.predKind === 2 && S.vy < -2 && S.floorBelow !== null){ txt = '↓ このままだと強い衝撃 — 推力で調整!'; cls = 'danger'; }
  else if (!S.grounded && S.predKind === 0 && S.vy < -2 && S.floorBelow !== null && S.floorBelow < 20){ txt = '✓ 着地OK'; cls = 'good'; }
  else if (S.wall){ txt = '壁面走行中 — 反対へ操舵で離脱'; cls = 'good'; }
  else if (ci === 0 && z > 1450 && z < W.LIP_Z) { txt = '▲ 断崖まで ' + Math.ceil(W.LIP_Z - z) + 'm — そのまま加速!'; cls = 'warn'; }
  else if (S.fuel < 20 && !S.grounded){ txt = '燃料わずか — パッド・燃料セル・気流で回復'; cls = 'warn'; }
  else {
    // look ahead for hazards (visual twin of audio cues)
    const C = W.built[ci];
    if (C){
      for (const sg of C.signs){ if (sg.z > z && sg.z - z < 220){ if (sg.kind === 'tornado'){ txt = '🌀 前方に竜巻 — 入ると上昇'; cls = 'warn'; } else if (sg.kind === 'wallIntro'){ txt = '▮ 光るレーンの壁 — 横から寄せて壁面走行'; cls = 'good'; } else if (sg.kind === 'route'){ txt = '◆ 帰還航路を選択：左右のゲート'; cls = 'warn'; } break; } }
      if (!txt && ci === 0){ const gapAhead = [380, 700, 1000, 1300, 2500, 2900].find(g => g > z && g - z < S.speed * 2.2 && (g < 1600 ? true : z > 1900)); if (gapAhead && S.grounded){ const d = Math.ceil(gapAhead - z); txt = '▲ 谷まで ' + d + 'm' + (d < S.speed * .8 ? ' — 推力!' : ''); cls = d < S.speed * .8 ? 'danger' : 'warn'; } }
    }
    if (!txt && S.gflip){ txt = ''; }
  }
  setRadar(txt, cls);
}

/* ---------- special beats ---------- */
function bigLaunch(){
  if (S.launched) return; S.launched = true;
  AU.drop(.9); AU.sfx('reveal'); AU.sfx('takeoff');
  S.slowT = settings.short ? .4 : 1.1; S.slowScale = .42; S.timeScale = .42;
  startCine('cliff', 3.2, { min: 1.2 });
  sayOnce('jump', '見て、地平線が開く——！');
  vibrate(30);
}
function arriveInSpace(){
  AU.hush(settings.short ? 1.5 : 4.5);
  setTimeout(() => AU.sfx('awe'), settings.short ? 600 : 2600);
  startCine('earth', 6, { letterbox: true, min: 1.5 });
  say(CH_LINES[3][0], 5); say(CH_LINES[3][1], 4);
  S.subsSaid['ch3_0'] = S.subsSaid['ch3_1'] = 1;
}
function homeTouchdown(impact){
  S.rollout = true;
  const pad = W.built[4] && W.built[4].homePad;
  const onPad = pad && Math.hypot(S.x - pad.x, S.z - pad.z) < pad.r + 6;
  S.onPad = onPad;
  if (onPad){ S.stats.perfect++; }
  AU.sfx('touchdown'); vibrate([30, 30, 60]);
  toast(onPad ? 'ホームパッドに着陸!' : '帰還!', '垂直 ' + impact.toFixed(1) + ' m/s', 2, 'gold', 4);
}
function finale(){
  if (!setMode('finale')) return;
  chapterClear(4, '');
  progress.story = true; saveProgress();
  S.finaleT = 0; AU.setMode('finale');
  startCine('finale', 14, { letterbox: true, min: 4 });
  say('着陸を確認。……おかえりなさい、TENMA。', 4.5);
  say('空の果てまで行って、ちゃんと帰ってきた。それがいちばんの冒険だよ。', 5.5);
  $('hud').classList.add('cine');
}
function finaleStep(dt){
  S.finaleT += dt;
  S.speed = damp(S.speed, 0, 2, dt); S.z += S.speed * dt;
  if (S.finaleT > 1.5 && Math.random() < dt * 2.2){ const a = Math.random() * 6.28; FX.firework(S.x + Math.cos(a) * 60, 50 + Math.random() * 40, S.z + 40 + Math.sin(a) * 60); AU.sfx('firework'); }
  placeCar(dt); camFollow(dt); hudThrottled(dt);
  AU.update({ speed: S.speed, thrust: 0, grounded: true, playing: true });
  if (S.cine && S.cine.t >= S.cine.dur){ clearCine(); setMode('result'); showResult(false); }
}

/* ---------- results ---------- */
function showResult(over){
  $('hud').classList.remove('cine');
  $('touch').hidden = true; AU.setMode(over ? 'off' : 'title'); AU.silenceLoops();
  const total = S.results.reduce((a, r) => a + r.score.total, 0);
  const rescues = S.results.reduce((a, r) => a + r.st.rescues, 0) + (S.stats && !S.stats.cleared ? S.stats.rescues : 0);
  const crashes = S.results.reduce((a, r) => a + r.st.crashes, 0) + (S.stats && !S.stats.cleared ? S.stats.crashes : 0);
  const time = S.results.reduce((a, r) => a + r.t, 0);
  const full = S.results.length === CH.length && !S.ta;
  const avg = S.results.length ? total / S.results.length : 0;
  const grade = over ? '—' : avg > 8200 ? 'S' : avg > 6800 ? 'A' : avg > 5200 ? 'B' : 'C';
  $('grade').textContent = grade;
  $('resEyebrow').textContent = over ? 'GAME OVER' : full ? 'JOURNEY COMPLETE' : S.ta ? 'TIME ATTACK' : 'RESULT';
  $('resTitle').textContent = over ? 'もう一度、空へ。' : full ? 'おかえり、TENMA。' : CH[S.chapter].code + ' ' + CH[S.chapter].jp;
  $('debrief').textContent = over ? '機体は無事。チェックポイントの位置は覚えたはず。' : full ? '断崖から都市、嵐、宇宙、そして地球へ。5つの空を越えて、出発した台地に帰ってきました。章別タイムアタックが解放されました。' : (S.results.length ? '記録を保存しました。' : '');
  let h = '<tr><th>章</th><th>タイム</th><th>到達</th><th>リング</th><th>技術</th><th>探索</th><th>安全</th><th>速さ</th><th>合計</th></tr>';
  for (const r of S.results){ const s = r.score; h += `<tr><td>${CH[r.ci].code} ${CH[r.ci].jp}</td><td class="${r.newTime ? 'new' : ''}">${fmtT(r.t)}</td><td>${s.clear}</td><td>${Math.round(s.rings)}</td><td>${Math.round(s.skill)}</td><td>${Math.round(s.explore)}</td><td>${Math.round(s.safety)}</td><td>${Math.round(s.time)}</td><td class="${r.newBest ? 'new' : ''}">${s.total.toLocaleString()}</td></tr>`; }
  $('resTable').innerHTML = S.results.length ? h : '';
  const st = [['合計スコア', total.toLocaleString()], ['総タイム', fmtT(time)], ['救済（別記）', rescues + '回'], ['墜落', crashes + '回'], ['難易度', S.diff.label]];
  if (S.route) st.push(['帰還航路', S.route === 'steep' ? '急降下' : '緩降下']);
  if (S.results.some(r => r.ci === 3)) st.push(['ビーコン', S.beacons + '/5']);
  $('resStats').innerHTML = st.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
  if (full && !over){
    progress.ranking.push({ score: total, time, rescues, diff: S.diff.label, date: new Date().toLocaleDateString('ja-JP') });
    progress.ranking.sort((a, b) => b.score - a.score); progress.ranking = progress.ranking.slice(0, 5); saveProgress();
  }
  $('retryBtn').hidden = !(over || S.ta);
  $('nextBtn').querySelector('span').textContent = over ? 'この章をはじめから' : full ? 'もう一度、最初から' : S.ta ? 'もう一度' : 'つづきから';
  if (over){ $('nextBtn').onclick = () => { S.mode = 'gameover'; startRun(S.chapter, S.ta); }; }
  else if (!full && !S.ta){ $('nextBtn').onclick = () => { S.mode = 'result'; startRun(Math.min(CH.length - 1, S.chapter + 1), false); }; }
  else { $('nextBtn').onclick = () => { AU.sfx('confirm'); S.mode = 'result'; startRun(S.ta ? S.startCh : 0, S.ta); }; }
  showScreen('result');
}

/* ---------- landing guide ---------- */
const predList = [];
function predictGuide(){
  predList.length = 0;
  let x = S.x, y = S.y, z = S.z, vy = S.vy, vx = S.vx;
  const P = W.physAt(S.z), g = S.gflip ? 1 : -1;
  let kind = 2, landP = null;
  for (let i = 0; i < 70; i++){
    vy = clamp(vy + g * P.G * .06, -P.term, PH.VYMAX); y += vy * .06; z += S.speed * .06; x += vx * .06;
    if (i % 2 === 0) predList.push({ x, y, z });
    const f = floorUnder(x, z, y + 1.2);
    if (f && y <= f.h){
      const slope = W.topAt(f.s, z + .5) - W.topAt(f.s, z - .5);
      const impact = (S.speed * slope - vy) / Math.sqrt(1 + slope * slope);
      kind = impact < PH.HARD_V ? 0 : impact < S.diff.crashV ? 1 : 2; landP = { x, y: f.h, z }; break;
    }
  }
  S.predKind = landP ? kind : -1;
  FX.setGuide(!!landP, predList, landP, Math.max(0, kind));
}

/* ---------- car pose ---------- */
let landKick = 0;
function placeCar(dt){
  const U = car.userData, inner = U.inner;
  car.position.set(S.x, S.y, S.z);
  const fl = S.grounded && S.floorS ? S.floorS : null;
  const slope = fl ? (W.topAt(fl, S.z + .5) - W.topAt(fl, S.z - .5)) : 0;
  const pitch = S.grounded ? -Math.atan(slope) : clamp(-S.vy * .03, -.45, .35);
  inner.rotation.x = damp(inner.rotation.x, pitch, 10, dt);
  const bank = S.grounded ? S.vx * .012 : -S.vx * .045;
  inner.rotation.z = damp(inner.rotation.z, bank, 8, dt);
  inner.rotation.y = S.vx * .02;
  // roll onto the wall / flip with gravity
  const roll = S.wall ? -S.wall.side * Math.PI / 2 : S.gflip ? Math.PI : 0;
  car.rotation.z = damp(car.rotation.z, roll, 9, dt);
  if (S.wall) car.position.y += .1;
  // hover-fold wheels & lift fins
  const flying = !S.grounded && !S.wall && S.airT > .1;
  S.fold = damp(S.fold, flying ? 1 : 0, flying ? 7 : 16, dt);
  const thr = S.thrustNow ? 1 : 0;
  for (const w of U.wheels){
    w.pivot.rotation.z = -w.side * S.fold * Math.PI / 2;
    w.spin.rotation.x += (S.grounded ? S.speed : S.speed * .3 + 10 * S.fold) * dt / .36;
    w.jet.rotation.z = -w.pivot.rotation.z;
    const pw = Math.max(thr, S.fold * .18);
    w.jet.material.uniforms.power.value = pw;
    w.jet.scale.set(1, .35 + pw * (thr ? .9 + Math.random() * .25 : .5), 1);
    w.jet.visible = pw > .02;
    if (w.glowRing) w.glowRing.material.opacity = S.fold;
  }
  S.finX = damp(S.finX, flying || S.wall ? 1 : .25, 6, dt);
  for (const f of U.fins){ f.pivot.scale.x = .25 + S.finX * .75; f.glow.opacity = (S.finX - .25) * (.55 + thr * .4); f.tip.material.opacity = (S.finX - .25) * .8; }
  const eb = S.eboostT > 0;
  for (const b of U.boosts){ const p = eb ? 1 : 0; b.flame.material.uniforms.power.value = p; b.flame.scale.set(1, .6 + p * (.8 + Math.random() * .3), 1); b.flame.visible = p > 0; }
  U.under.intensity = thr ? 7 : S.fold * 1.8;
  // rescue amber mode, shield, plasma shell
  const amber = S.rescueT > 0 || (S.invuln > 0 && S.mode === 'play' && S.eboostT <= 0);
  U.bodyMat.emissiveIntensity = damp(U.bodyMat.emissiveIntensity, amber ? .55 : 0, 8, dt);
  U.aura.material.opacity = damp(U.aura.material.opacity, S.rescueT > 0 ? .28 : 0, 8, dt);
  U.shield.visible = eb; U.shieldMat.uniforms.a.value = eb ? Math.min(1, S.eboostT) : 0;
  U.plasma.visible = (S.plasmaK || 0) > .02; U.plasmaMat.uniforms.heat.value = S.plasmaK || 0;
  if (S.mode === 'play' || S.mode === 'transition') car.visible = S.crashT > 0 ? false : (S.invuln > 0 && S.rescueT <= 0 && S.eboostT <= 0 ? Math.floor(performance.now() / 90) % 2 === 0 : true);
}

/* ---------- emitters ---------- */
function emitters(dt, thrust, eb, ci){
  const U = car.userData;
  if (thrust){
    for (const w of U.wheels){ w.pivot.getWorldPosition(tmpV); FX.jet(tmpV.x, tmpV.y - .2, tmpV.z, S.vx * .5, (S.gflip ? 1 : -1) * rand(14, 22), S.speed * rand(.5, .75)); }
    if (S.floorBelow !== null && S.floorBelow < 4.5) FX.groundDust(S.x, S.y - S.floorBelow, S.z, S.speed * .7, ci === 0 ? [.85, .62, .5] : [.6, .6, .7]);
  }
  if (eb) for (const b of U.boosts){ b.flame.getWorldPosition(tmpV); FX.boostFlame(tmpV.x, tmpV.y, tmpV.z, S.speed * .4 - 12); }
  if (S.wall && Math.random() < .7) FX.sparks(S.x - S.wall.side * -PH.CAR_HW, S.y + .3, S.z - 1, S.speed * .6, 2, S.wall.side);
  if ((S.plasmaK || 0) > .1) for (let i = 0; i < 3; i++) FX.plasma(S.x, S.y + .6, S.z + 1.8, S.vx, S.vy, -S.speed * .2 + rand(-8, -2), S.plasmaK);
  if (S.finX > .6 && !S.grounded && Math.random() < .5) for (const f of U.fins){ f.tip.getWorldPosition(tmpV); FX.wake(tmpV.x, tmpV.y, tmpV.z, S.speed * .6, [.35, .85, 1]); }
}

/* ---------- camera ---------- */
let camRoll = 0;
function camFollow(dt){
  const ci = W.chapterAt(S.z);
  const air = S.grounded ? 0 : clamp(S.floorBelow === null ? 6 : S.floorBelow, 0, 12);
  S.nearZoom = Math.max(0, S.nearZoom - dt * 2.5);
  const space = ci === 3 ? 1 : 0;
  let back = 7.6 + S.speed * .05 + air * .14 - (S.eboostT > 0 ? .8 : 0) - S.nearZoom * 1.6 + space * 2;
  let height = 2.7 + air * .26 + (S.grounded ? 0 : .5) + space * 1.2;
  const up = S.gflip ? -1 : 1;
  tmpV.set(S.x * .8, S.y + height * (S.gflip ? .55 : 1), S.z - back);
  let lookY = S.y + 1.1 - (S.grounded ? 0 : air * .2);
  let look = tmpV2.set(S.x * .9, lookY, S.z + 10 + S.speed * .18);
  // cinematics
  const c = S.cine;
  if (c){
    c.t += dt; const k = clamp(c.t / c.dur, 0, 1), e = Math.sin(k * Math.PI);
    if (c.kind === 'cliff'){ // side-on wide shot as the horizon opens
      tmpV.set(S.x + 16 * e, S.y + 4 + 6 * e, S.z - back + 6 * e); look.set(S.x, S.y - 8 * e, S.z + 30);
    } else if (c.kind === 'earth'){ // pull back and up: the planet fills the frame
      tmpV.set(S.x + 10 * e, S.y + 8 + 26 * e, S.z - back - 30 * e); look.set(S.x, S.y - 40 * e, S.z + 60);
    } else if (c.kind === 'finale'){
      const a = 2.6 + c.t * .18; const r = 9 + c.t * .5;
      tmpV.set(S.x + Math.cos(a) * r, S.y + 2.2 + c.t * .25, S.z + Math.sin(a) * r); look.set(S.x, S.y + 1 + c.t * .2, S.z);
    }
    if (c.t >= c.dur && c.kind !== 'finale') clearCine();
  }
  const kpos = c ? 3 : 6;
  camPos.x = damp(camPos.x, tmpV.x, kpos, dt); camPos.y = damp(camPos.y, tmpV.y, c ? 3 : 4.5, dt); camPos.z = damp(camPos.z, tmpV.z, c ? 4 : 12, dt);
  camera.position.copy(camPos);
  landKick = damp(landKick, 0, 9, dt); camera.position.y -= landKick;
  if (settings.motion) S.shake = 0;
  if (S.shake > 0){ S.shake = Math.max(0, S.shake - dt * 2.2); const k = S.shake * S.shake * .45; camera.position.x += rand(-1, 1) * k; camera.position.y += rand(-1, 1) * k; }
  camLook.x = damp(camLook.x, look.x, 8, dt); camLook.y = damp(camLook.y, look.y, 6, dt); camLook.z = c ? damp(camLook.z, look.z, 6, dt) : look.z;
  camera.up.set(0, 1, 0);
  camera.lookAt(camLook);
  camRoll = damp(camRoll, settings.motion ? 0 : (S.wall ? S.wall.side * .12 : S.vx * .008), 5, dt); camera.rotateZ(camRoll);
  const fov = baseFov + clamp(S.speed - 24, 0, 34) * .38 + (S.eboostT > 0 ? 9 : 0) - S.nearZoom * 5 + (c && c.kind === 'cliff' ? 12 * Math.sin(clamp(c.t / c.dur, 0, 1) * Math.PI) : 0);
  camera.fov = damp(camera.fov, fov, 3, dt); camera.updateProjectionMatrix();
  const sd = W.env(S.mode === 'title' ? -1 : S.z, camera.position);
  const sun = W.sun; tmpV.copy(sd).normalize();
  sun.position.set(S.x + tmpV.x * 70, S.y + Math.max(tmpV.y, .5) * 70, S.z + 8 + tmpV.z * 70); sun.target.position.set(S.x, S.y, S.z + 8); sun.target.updateMatrixWorld();
}

/* ---------- title showroom ---------- */
function titleUpdate(dt){
  titleT += dt;
  W.update(dt, 40, dt); Md.update(dt);
  const cycle = titleT % 10, hover = cycle > 5 && cycle < 8.6;
  S.grounded = !hover; S.thrustNow = hover ? 1 : 0; S.airT = hover ? 1 : 0;
  S.y = damp(S.y, hover ? 2.2 + Math.sin(titleT * 2) * .2 : 0, hover ? 2.5 : 5, dt); S.vy = 0; S.vx = Math.sin(titleT * .7) * .4; S.speed = 0;
  S.floorS = null;
  placeCar(dt);
  car.userData.inner.rotation.y = Math.sin(titleT * .5) * .12;
  if (hover) for (const w of car.userData.wheels){ w.pivot.getWorldPosition(tmpV); FX.jet(tmpV.x, tmpV.y - .2, tmpV.z, 0, -rand(9, 13), rand(-.5, .5)); if (Math.random() < .4) FX.groundDust(tmpV.x, 0, tmpV.z, 0); }
  const narrow = innerWidth < 760;
  const a = titleT * .14 + 2.3, r = narrow ? 11 : 8.4;
  camera.position.set(Math.cos(a) * r + (narrow ? 0 : -2.2), 2.4 + Math.sin(titleT * .3) * .4 + (narrow ? 1.6 : 0), 40 + Math.sin(a) * r);
  camera.up.set(0, 1, 0); camera.lookAt(narrow ? 0 : -1.6, 1 + (narrow ? -1.5 : 0), 40);
  camera.fov = baseFov; camera.updateProjectionMatrix();
  const sd = W.env(-1, camera.position);
  W.sun.position.set(sd.x * 70, Math.max(sd.y, .5) * 70, 40 + sd.z * 70); W.sun.target.position.set(0, 0, 40); W.sun.target.updateMatrixWorld();
  AU.update({ speed: 0, thrust: hover ? .6 : 0, grounded: !hover, playing: true, title: true });
}

/* ---------- HUD ---------- */
let hudClock = 0;
function hudThrottled(dt){ hudClock -= dt; if (hudClock <= 0){ hudClock = .066; hud(); } toastTick(dt); }
function toastTick(dt){
  if (toastT > 0){ toastT -= dt; if (toastT <= 0) $('toast').classList.remove('on'); }
  if (banT > 0){ banT -= dt; if (banT <= 0) $('banner').classList.remove('on'); }
  updateSubs(dt);
}
function displayAlt(z, y){
  const ci = W.chapterAt(z);
  if (ci === 0) return [Math.round(620 + y), 'm'];
  if (ci === 1) return [Math.round(530 + (y + 90) * 4), 'm'];
  if (ci === 2) return [(1.0 + smooth(7950, 12750, z) * 11 + (y - W.pathY(z)) * .01).toFixed(1), 'km'];
  if (ci === 3) return [Math.round(100 + smooth(12750, 13600, z) * 300), 'km'];
  const k = smooth(17900, 21300, z);
  if (k < .97) return [Math.max(1, Math.round(lerp(400, 1.2, Math.pow(k, .6)))), 'km'];
  return [Math.max(0, Math.round(y * 6 + 20)), 'm'];
}
function hud(){
  const ci = W.chapterAt(S.z);
  $('score').textContent = Math.round(liveScore()).toLocaleString();
  $('clock').textContent = fmtT(S.t) + (S.ta ? '  TA' : '');
  const jp = clamp(S.z / W.TOTAL, 0, 1);
  $('jFill').style.width = (jp * 100) + '%'; $('jCar').style.left = (jp * 100) + '%';
  document.querySelectorAll('.journey .jl span').forEach((s, i) => s.classList.toggle('on', i === ci));
  const [alt, unit] = displayAlt(S.z, S.y); $('altNum').textContent = alt; $('altUnit').textContent = unit;
  if (ci === 3 || (ci === 4 && S.z < 20200)){ const kms = ci === 3 ? 7.7 + (S.speed - 46) * .02 : lerp(7.7, .4, smooth(18000, 20200, S.z)); $('spdNum').textContent = kms.toFixed(1); $('spdUnit').textContent = 'km/s'; }
  else { $('spdNum').textContent = Math.round(S.speed * 3.6); $('spdUnit').textContent = 'km/h'; }
  $('ringNum').textContent = S.stats ? S.stats.rings : 0;
  $('beaconG').hidden = ci !== 3; $('beaconNum').textContent = S.beacons + '/5';
  $('fuelArc').style.strokeDasharray = S.fuel + ' 100'; $('fuelPct').textContent = Math.round(S.fuel);
  document.querySelector('.fuel').classList.toggle('low', S.fuel < 25);
  $('energyFill').style.width = S.energy + '%'; document.querySelector('.energy').classList.toggle('ready', S.energy >= 100);
  $('eboostBtn').disabled = !(S.energy >= 100 && S.eboostT <= 0);
  const heatOn = ci === 4 && S.z > 18050 && S.z < 20400;
  $('heatM').hidden = !heatOn; if (heatOn){ $('heatFill').style.width = Math.min(100, S.heat) + '%'; $('heatTxt').textContent = Math.round(S.heat) + '%'; $('heatM').classList.toggle('hot', S.heat > 75); }
  $('heatVeil').style.opacity = heatOn ? clamp((S.heat - 50) / 60, 0, .8) : 0;
  $('wallM').hidden = !S.wall; if (S.wall) $('wallFill').style.width = (100 - S.wallT / (PH.WALL_MAX + settings.assist * .6) * 100) + '%';
  const g = $('gravity'); g.hidden = !S.gflip; if (S.gflip){ $('gravArrow').textContent = '↑'; $('gravT').textContent = Math.max(0, S.gflipT).toFixed(1); g.classList.toggle('ending', S.gflipT < 1.5); }
  const tag = $('ctag'); tag.hidden = !S.ctag; if (S.ctag) tag.textContent = S.ctag;
  $('boostVeil').style.opacity = S.eboostT > 0 ? .8 : 0;
  // beacon direction marker (space: goal-direction UI against getting lost)
  beaconMarker(ci);
  radar();
}
const proj = new THREE.Vector3();
function beaconMarker(ci){
  const el = $('target');
  if (ci !== 3 || S.cine){ el.hidden = true; return; }
  const C = W.built[3]; if (!C){ el.hidden = true; return; }
  let tgt = null;
  for (const it of C.items){ if (it.kind === 'beacon' && !it.got && it.z > S.z - 10){ tgt = it; break; } }
  if (!tgt && S.z > 17200 && !S.route) tgt = { x: 0, y: 200, z: 17760, route: true };
  if (!tgt){ el.hidden = true; return; }
  proj.set(tgt.x, tgt.y, tgt.z).project(camera);
  const behind = proj.z > 1;
  let sx = (proj.x * .5 + .5) * innerWidth, sy = (-proj.y * .5 + .5) * innerHeight;
  if (behind){ sx = innerWidth - sx; sy = innerHeight - 40; }
  const m = 60; const cx = clamp(sx, m, innerWidth - m), cy = clamp(sy, m + 70, innerHeight - m - 120);
  el.hidden = false; el.style.transform = `translate(${cx}px, ${cy}px)`;
  const rot = Math.atan2(sy - cy, sx - cx) * 57.3 + 90;
  el.style.setProperty('--rot', (cx !== sx || cy !== sy ? rot : 180) + 'deg');
  $('targetD').textContent = tgt.route ? '帰還ゲート' : Math.round(Math.hypot(tgt.x - S.x, tgt.y - S.y, tgt.z - S.z)) + ' m';
}

/* ---------- main loop ---------- */
let lastT = performance.now(), acc = 0, perfAcc = 0, perfN = 0, perfWarm = 0;
function frame(now){
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000; lastT = now;
  if (dt > .25) dt = .25;
  combineInput();
  if (S.mode === 'title'){ titleUpdate(dt); FX.update(dt, camera.position, 0, false); }
  else if (S.mode !== 'pause' && S.mode !== 'result' && S.mode !== 'gameover'){
    acc += dt; let n = 0;
    while (acc >= STEP && n < 5){ step(STEP); input.prevThrust = input.thrust; input.prevBoost = input.boost; acc -= STEP; n++; }
    if (n >= 5) acc = 0;       // long frame: cap the number of steps
    // finale gate: stop when the rollout ends
    if (S.mode === 'play' && S.rollout && S.speed < 1.5) finale();
    const dir = tmpV.set(S.vx, S.vy, S.speed).normalize();
    FX.update(dt * S.timeScale, camera.position, S.speed, S.eboostT > 0, dir);
  } else { input.prevThrust = input.thrust; input.prevBoost = input.boost; }
  const fu = finalPass.uniforms; fu.time.value = now / 1000;
  const fast = S.mode === 'play' || S.mode === 'transition';
  fu.blur.value = damp(fu.blur.value, fast && !settings.motion ? clamp((S.speed - 40) / 25, 0, 1) * .7 + (S.eboostT > 0 ? .8 : 0) : 0, 4, dt);
  fu.aberr.value = damp(fu.aberr.value, fast ? (S.eboostT > 0 ? 1 : 0) + (S.rescueT > 0 ? .8 : 0) : 0, 5, dt);
  fu.sat.value = S.rescueT > 0 ? .6 : 1.08;
  composer.render();
  // adaptive quality: watch frame time after warm-up and lower resolution if needed (30fps floor target)
  if (S.mode === 'play' && settings.quality === 'auto'){
    perfWarm += dt;
    if (perfWarm > 4){ perfAcc += dt; perfN++; if (perfN >= 120){ const avg = perfAcc / perfN; perfAcc = perfN = 0;
      if (avg > 1 / 28 && (qualityKey !== 'low' || dynScale > .6)){ if (dynScale > .7) dynScale -= .15; else if (qualityKey === 'high'){ qualityKey = 'mid'; dynScale = 1; } else if (qualityKey === 'mid'){ qualityKey = 'low'; dynScale = 1; } applyQuality(); }
      else if (avg < 1 / 55 && dynScale < 1){ dynScale = Math.min(1, dynScale + .1); applyQuality(); } } }
  }
}

/* ---------- debug / test hooks (used by automated playtests) ---------- */
TR.debug = { S, W, input, settings, camera, scene, fu: () => finalPass.uniforms, comp: () => composer, car: () => car, progress: () => progress, sim(n, bot){ for (let i = 0; i < n; i++){ if (bot) bot(S, W, input); if (S.mode === 'title' || S.mode === 'result' || S.mode === 'gameover' || S.mode === 'pause') return S.mode; step(STEP); input.prevThrust = input.thrust; input.prevBoost = input.boost; if (S.mode === 'play' && S.rollout && S.speed < 1.5) finale(); } return S.mode; }, warp(z){ S.z = z; S.x = 0; S.y = W.pathY(z) + 2; W.stream(z); W.build(W.chapterAt(z)); settle(); }, setMode, startRun, chapterClear, finale };

boot();
})();
