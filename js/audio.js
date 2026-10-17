/* ============================================================
 * THRUST ROADSTER — TENMA EDITION · audio engine
 * エンジン・噴射・風・効果音・章ごとのアダプティブBGMを Web Audio でリアルタイム合成。
 * アセットキットの短いWAV（assets/sfx）は読み込めた時だけ合成音に重ねる。
 * ============================================================ */
window.TR = window.TR || {};
TR.Audio = (() => {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  const A = {
    ctx: null, muted: false, musicVol: .6, sfxVol: .8,
    mode: 'off', zone: 0, intensity: 1, airborne: false, step: 0, nextT: 0, timer: 0, wall: -1, dropUntil: 0, threat: 0, silence: 0, wav: {}, sfxOn: true, musicOn: true,
  };

  function init(){
    if (A.ctx){ if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = A.ctx = new AC({ latencyHint: 'interactive' });
    A.master = ctx.createGain(); A.master.gain.value = A.muted ? 0 : .9;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -8; lim.knee.value = 6; lim.ratio.value = 10; lim.attack.value = .003; lim.release.value = .2;
    A.master.connect(lim); lim.connect(ctx.destination);

    // reverb (generated impulse response)
    A.verb = ctx.createConvolver(); A.verb.buffer = impulse(ctx, 2.6, 2.8);
    A.verbIn = ctx.createGain(); A.verbIn.gain.value = 1; A.verbIn.connect(A.verb);
    const verbOut = ctx.createGain(); verbOut.gain.value = .55; A.verb.connect(verbOut); verbOut.connect(A.master);
    // ping-pong delay
    A.delayIn = ctx.createGain();
    const dl = ctx.createDelay(1), dr = ctx.createDelay(1), fb = ctx.createGain(), pl = ctx.createStereoPanner(), pr = ctx.createStereoPanner(), dlp = ctx.createBiquadFilter();
    dl.delayTime.value = .3; dr.delayTime.value = .3; fb.gain.value = .38; pl.pan.value = -.7; pr.pan.value = .7; dlp.type = 'lowpass'; dlp.frequency.value = 3500;
    A.delayIn.connect(dl); dl.connect(pl); dl.connect(dr); dr.connect(pr); dr.connect(dlp); dlp.connect(fb); fb.connect(dl);
    const dOut = ctx.createGain(); dOut.gain.value = .5; pl.connect(dOut); pr.connect(dOut); dOut.connect(A.master); dOut.connect(A.verbIn);
    A.delays = [dl, dr];

    A.sfxBus = ctx.createGain(); A.sfxBus.gain.value = A.sfxVol; A.sfxBus.connect(A.master);
    A.musicBus = ctx.createGain(); A.musicBus.gain.value = 0;
    A.musicLP = ctx.createBiquadFilter(); A.musicLP.type = 'lowpass'; A.musicLP.frequency.value = 18000; A.musicLP.Q.value = .8;
    A.musicBus.connect(A.musicLP); A.musicLP.connect(A.master);
    A.duck = ctx.createGain(); A.duck.connect(A.musicBus); // sidechain-ducked bus (pads, bass)
    A.drums = ctx.createGain(); A.drums.connect(A.musicBus);

    // noise buffers
    A.white = noiseBuf(ctx, 'white'); A.brown = noiseBuf(ctx, 'brown');

    buildEngine(ctx);
    A.nextT = ctx.currentTime + .1;
    A.timer = setInterval(schedule, 25);
    loadWavs();
  }

  function impulse(ctx, dur, decay){
    const len = ctx.sampleRate * dur | 0, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++){
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++){
        const t = i / len; let v = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
        if (i < ctx.sampleRate * .08 && Math.random() < .004) v *= 6; // early reflections
        d[i] = v * (c ? .95 : 1);
      }
    }
    return b;
  }
  function noiseBuf(ctx, kind){
    const len = ctx.sampleRate * 3, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++){
      const d = b.getChannelData(c); let last = 0;
      for (let i = 0; i < len; i++){
        const w = Math.random() * 2 - 1;
        if (kind === 'brown'){ last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
    }
    return b;
  }
  function loopNoise(buf){ const s = A.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2); return s; }
  function gain(v, to){ const g = A.ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; }
  function filt(type, f, q, to){ const b = A.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; if (to) b.connect(to); return b; }
  function osc(type, f, to){ const o = A.ctx.createOscillator(); o.type = type; o.frequency.value = f; if (to) o.connect(to); o.start(); return o; }

  /* ---------- continuous layers: engine, turbine, thrust, boost, wind, tires ---------- */
  function buildEngine(ctx){
    const E = A.E = {};
    // engine core
    E.out = gain(0, A.sfxBus);
    const shaper = ctx.createWaveShaper(); const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++){ const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.4); } shaper.curve = curve;
    E.lp = filt('lowpass', 600, 2.2, E.out);
    shaper.connect(E.lp);
    E.am = gain(1, shaper);
    E.o1 = osc('sawtooth', 60, E.am); E.o2 = osc('sawtooth', 60.4, E.am); E.o3 = osc('square', 30, gain(.6, E.am));
    // combustion pulse (AM)
    E.lfo = osc('sine', 30); E.lfoDepth = gain(.35, E.am.gain); E.lfo.connect(E.lfoDepth);
    // turbine whine (hover mode)
    E.turb = gain(0, A.sfxBus);
    E.t1 = osc('sine', 900, E.turb); E.t2 = osc('triangle', 1803, gain(.3, E.turb));
    // thrust jets: band + rumble + crackle
    E.thr = gain(0, A.sfxBus);
    const n1 = loopNoise(A.white); E.thrBP = filt('bandpass', 1200, .7); n1.connect(E.thrBP); E.thrBP.connect(E.thr);
    E.rum = gain(0, A.sfxBus); const n2 = loopNoise(A.brown); const rlp = filt('lowpass', 160, 1); n2.connect(rlp); rlp.connect(E.rum);
    // boost afterburner
    E.boost = gain(0, A.sfxBus);
    const n3 = loopNoise(A.white); E.boostBP = filt('bandpass', 700, .9); n3.connect(E.boostBP); E.boostBP.connect(E.boost);
    E.bo = osc('sawtooth', 48, filt('lowpass', 220, 4, gain(.5, E.boost)));
    // wind
    E.wind = gain(0, A.sfxBus); const n4 = loopNoise(A.white); E.windLP = filt('lowpass', 600, .3); n4.connect(E.windLP);
    const wp = ctx.createStereoPanner(); E.windLP.connect(wp); wp.connect(E.wind);
    E.windPan = osc('sine', .13); const wpd = gain(.5, wp.pan); E.windPan.connect(wpd);
    // tires
    E.tire = gain(0, A.sfxBus); const n5 = loopNoise(A.brown); E.tireLP = filt('lowpass', 300, .7); n5.connect(E.tireLP); E.tireLP.connect(E.tire);
    // storm / tornado roar, reentry plasma roar, cosmic hum
    E.storm = gain(0, A.sfxBus); const n6 = loopNoise(A.brown); E.stormLP = filt('lowpass', 500, .6); n6.connect(E.stormLP); E.stormLP.connect(E.storm);
    E.plasma = gain(0, A.sfxBus); const n7 = loopNoise(A.white); E.plasmaBP = filt('bandpass', 600, .5); n7.connect(E.plasmaBP); E.plasmaBP.connect(E.plasma);
    E.plasmaLo = osc('sawtooth', 38, filt('lowpass', 140, 2, gain(.6, E.plasma)));
    E.hum = gain(0, A.sfxBus); osc('sine', 55, E.hum); osc('sine', 82.5, gain(.5, E.hum)); osc('sine', 110.3, gain(.25, E.hum));
    E.wallGain = gain(0, A.sfxBus); const n8 = loopNoise(A.white); E.wallBP = filt('bandpass', 2400, 2); n8.connect(E.wallBP); E.wallBP.connect(E.wallGain);
    E.rpm = 900; E.gear = 1; E.prevThrust = false; E.prevBoost = false;
  }

  const GEARS = [0, 9, 17, 25, 33, 42, 99]; // m/s gear thresholds
  function update(s){
    if (!A.ctx || !A.E) return;
    const E = A.E, t = A.ctx.currentTime, on = s.playing ? 1 : 0;
    // rpm with gear shifts
    let g = 1; while (g < GEARS.length - 1 && s.speed > GEARS[g]) g++;
    const lo = GEARS[g - 1], hi = GEARS[g]; let k = clamp((s.speed - lo) / (hi - lo), 0, 1);
    let rpm = 1800 + k * 4600 + (g - 1) * 180;
    if (!s.grounded) rpm = 3200 + s.thrust * 2200;
    if (s.boost) rpm += 900;
    if (g !== E.gear && s.grounded && s.playing){ if (g > E.gear) shiftSound(); E.gear = g; }
    E.rpm += (rpm - E.rpm) * .25;
    const f = E.rpm / 60;
    E.o1.frequency.setTargetAtTime(f, t, .03); E.o2.frequency.setTargetAtTime(f * 1.007, t, .03); E.o3.frequency.setTargetAtTime(f / 2, t, .03);
    E.lfo.frequency.setTargetAtTime(f / 2, t, .03);
    E.lp.frequency.setTargetAtTime(300 + E.rpm * .22 + (s.boost ? 900 : 0), t, .05);
    E.out.gain.setTargetAtTime(on * (s.grounded ? .13 : .06) * (s.title ? .6 : 1), t, .08);
    // turbine
    E.turb.gain.setTargetAtTime(on * ((s.grounded && !s.wall ? 0 : .025) + s.thrust * .03 + (s.wall ? .012 + (s.over || 0) * .05 : 0)), t, .1);
    E.t1.frequency.setTargetAtTime(700 + s.thrust * 700 + s.speed * (s.wall ? 14 : 8), t, .1); E.t2.frequency.setTargetAtTime(1400 + s.thrust * 1500 + s.speed * (s.wall ? 29 : 17), t, .1);
    // thrust
    E.thr.gain.setTargetAtTime(on * s.thrust * .34, t, .025); E.rum.gain.setTargetAtTime(on * s.thrust * .85, t, .03);
    E.thrBP.frequency.setTargetAtTime(900 + s.thrust * 1400 + Math.random() * 500, t, .02);
    if (s.playing && s.thrust && !E.prevThrust) ignite();
    if (s.playing && !s.thrust && E.prevThrust) release();
    E.prevThrust = !!(s.playing && s.thrust);
    // boost
    E.boost.gain.setTargetAtTime(on * (s.boost ? .36 : 0), t, s.boost ? .05 : .2);
    E.boostBP.frequency.setTargetAtTime(500 + Math.random() * 400, t, .02);
    if (s.playing && s.boost && !E.prevBoost) sfx('boost');
    E.prevBoost = !!(s.playing && s.boost);
    // wind & tires
    const sp = clamp(s.speed / 55, 0, 1.3);
    E.wind.gain.setTargetAtTime(on * (sp * sp * (s.wall ? .26 : s.grounded ? .09 : .2) + (s.alt || 0) * .06) + (s.title ? .02 : 0), t, .2);
    E.windLP.frequency.setTargetAtTime(400 + sp * 1600 + (s.grounded && !s.wall ? 0 : 900) + (s.redline ? 900 : 0), t, .2);
    E.tire.gain.setTargetAtTime(on * (s.grounded ? sp * .3 : 0), t, .05);
    E.tireLP.frequency.setTargetAtTime(200 + sp * 500, t, .1);
    E.storm.gain.setTargetAtTime(on * (s.storm || 0) * .5, t, .3); E.stormLP.frequency.setTargetAtTime(300 + (s.storm || 0) * 900, t, .3);
    E.plasma.gain.setTargetAtTime(on * (s.heat || 0) * .42, t, .15); E.plasmaBP.frequency.setTargetAtTime(400 + (s.heat || 0) * 1400 + Math.random() * 200, t, .05);
    E.hum.gain.setTargetAtTime(on * (s.space || 0) * .05, t, .8);
    E.wallGain.gain.setTargetAtTime(on * (s.wall ? .09 : 0), t, .05);
    // music reacts to flight
    A.airborne = !s.grounded && s.playing;
    A.musicLP.frequency.setTargetAtTime(A.mode === 'play' ? (s.slowmo ? 900 : 18000) : (A.mode === 'title' || A.mode === 'finale' ? 9000 : 900), t, .12);
    A.intensity = s.combo >= 3 || s.boost ? 2 : 1;
    A.threat += ((s.threat || 0) - A.threat) * .08;
  }
  function ignite(){ const t = A.ctx.currentTime; tone(70, t, .2, 'sine', .4, 160); noiseHit(t, .16, .35, 1800, 'bandpass', 1.2); noiseHit(t, .05, .25, 5000, 'highpass'); }
  function release(){ const t = A.ctx.currentTime; noiseHit(t, .35, .12, 3500, 'highpass', 0, 1200); }
  function shiftSound(){ const t = A.ctx.currentTime; A.E.am.gain.setValueAtTime(.35, t); A.E.am.gain.linearRampToValueAtTime(1, t + .12); noiseHit(t, .1, .06, 800, 'bandpass'); }

  /* ---------- one-shot helpers ---------- */
  function tone(f, t, dur, type, vol, f2, opts = {}){
    const ctx = A.ctx; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur * (opts.glide || 1));
    if (opts.detune) o.detune.value = opts.detune;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (opts.att || .006)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    let node = g;
    if (opts.pan){ const p = ctx.createStereoPanner(); p.pan.value = opts.pan; g.connect(p); node = p; }
    o.connect(g); node.connect(opts.bus || A.sfxBus);
    if (opts.verb){ const s = gain(opts.verb, A.verbIn); node.connect(s); }
    if (opts.delay){ const s = gain(opts.delay, A.delayIn); node.connect(s); }
    o.start(t); o.stop(t + dur + .05); return o;
  }
  function noiseHit(t, dur, vol, freq, type, q, freq2, opts = {}){
    const ctx = A.ctx; const s = ctx.createBufferSource(); s.buffer = opts.brown ? A.brown : A.white;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.setValueAtTime(freq, t); if (q) f.Q.value = q;
    if (freq2) f.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (opts.att || .004)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g);
    let node = g; if (opts.pan !== undefined){ const p = ctx.createStereoPanner(); p.pan.setValueAtTime(opts.pan, t); if (opts.pan2 !== undefined) p.pan.linearRampToValueAtTime(opts.pan2, t + dur); g.connect(p); node = p; }
    node.connect(opts.bus || A.sfxBus); if (opts.verb){ node.connect(gain(opts.verb, A.verbIn)); }
    s.start(t, Math.random() * 2); s.stop(t + dur + .05);
  }
  function bell(f, t, vol, opts = {}){
    tone(f, t, 1.4, 'sine', vol, 0, { verb: .5, delay: .25, pan: opts.pan });
    tone(f * 2.0, t, .8, 'sine', vol * .35, 0, { verb: .4, pan: opts.pan });
    tone(f * 3.01, t, .45, 'sine', vol * .18, 0, { verb: .3 });
    tone(f * .5, t, .3, 'triangle', vol * .3, 0, {});
  }

  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
  function sfx(name, v = 0, opt = {}){
    if (!A.ctx) return; const t = A.ctx.currentTime + .005;
    switch (name){
      case 'jump': tone(110, t, .22, 'sine', .45, 240); noiseHit(t, .22, .3, 500, 'bandpass', 1, 2400); break;
      case 'ring': { const n = PENTA[Math.min(PENTA.length - 1, v)]; bell(mtof(81 + n - 12) , t, .2, { pan: opt.pan || 0 }); noiseHit(t, .12, .08, 7000, 'highpass', 0, 0, { verb: .4 }); break; }
      case 'cell': [0, 7, 12, 19].forEach((n, i) => tone(mtof(76 + n), t + i * .045, .4, 'triangle', .12, 0, { verb: .4 })); noiseHit(t, .5, .2, 1500, 'highpass', 0, 9000); break;
      case 'land': { const k = clamp(v, 0, 1); tone(95, t, .28, 'sine', .55 * (.4 + k), 38); noiseHit(t, .22, .4 * (.3 + k), 380, 'lowpass', 0, 0, { brown: true }); noiseHit(t + .03, .09, .12, 2400, 'bandpass', 3); break; }
      case 'perfect': [0, 4, 7, 11, 14].forEach((n, i) => tone(mtof(72 + n), t + i * .055, 1.1, i % 2 ? 'sine' : 'triangle', .13, 0, { verb: .6, delay: .2 })); noiseHit(t, .6, .12, 800, 'bandpass', 1, 6000, { verb: .3 }); break;
      case 'hard': tone(80, t, .35, 'sine', .7, 30); noiseHit(t, .3, .5, 600, 'lowpass'); [523, 1130, 1764].forEach(f => tone(f, t, .25, 'triangle', .05)); break;
      case 'crash':
        noiseHit(t, 1.6, .9, 4000, 'lowpass', 1, 120, { verb: .5 }); tone(70, t, 1.1, 'sine', .9, 22);
        [431, 977, 1544, 2213].forEach((f, i) => tone(f, t + i * .01, .9, 'triangle', .07, f * .92, { verb: .4 }));
        for (let i = 0; i < 9; i++) noiseHit(t + .1 + Math.random() * .6, .05, .1, 5000 + Math.random() * 4000, 'bandpass', 4);
        break;
      case 'scrape': noiseHit(t, .12, .16, 2600 + Math.random() * 1500, 'bandpass', 2, 0, { pan: opt.pan || 0 }); break;
      case 'nearmiss': wav('near_miss', .3); noiseHit(t, .5, .5, 2600, 'bandpass', 1.4, 500, { pan: opt.pan || .6, pan2: -(opt.pan || .6) }); tone(880, t + .05, .25, 'triangle', .07, 1320, { verb: .3 }); break;
      case 'roll': noiseHit(t, .6, .3, 400, 'bandpass', 1.2, 3000, { pan: -.6, pan2: .6 }); tone(330, t, .6, 'sine', .1, 990, { verb: .4 }); break;
      case 'combo': tone(mtof(84 + Math.min(12, v * 2)), t, .2, 'square', .05, 0, { delay: .3 }); break;
      case 'beep': tone(v ? 1320 : 660, t, v ? .5 : .18, 'square', .13, 0, { verb: .25 }); if (v) tone(1980, t, .5, 'sine', .08, 0, { verb: .3 }); break;
      case 'empty': tone(196, t, .14, 'square', .1); tone(147, t + .16, .2, 'square', .1); break;
      case 'zone': [0, 7, 12, 16, 19, 24].forEach((n, i) => tone(mtof(57 + n), t + i * .04, 2.2, 'sawtooth', .035, 0, { verb: .7, att: .3 })); tone(55, t, 1.5, 'sine', .6, 40); noiseHit(t, 2, .25, 300, 'lowpass', 1, 6000, { verb: .5 }); break;
      case 'milestone': [0, 5, 9, 12, 17].forEach((n, i) => tone(mtof(72 + n), t + i * .07, .5, 'triangle', .12, 0, { verb: .5 })); break;
      case 'fanfare': [0, 4, 7, 12, 7, 12, 16, 19].forEach((n, i) => tone(mtof(67 + n), t + i * .11, .5, 'square', .07, 0, { verb: .4, delay: .2 })); break;
      case 'click': tone(1800, t, .04, 'square', .05); break;
      case 'select': tone(990, t, .08, 'triangle', .1); tone(1480, t + .05, .1, 'triangle', .08); break;
      case 'boost': noiseHit(t, .7, .45, 300, 'bandpass', 1, 3500); tone(60, t, .6, 'sawtooth', .18, 140); break;
      // --- the drop ---
      case 'dropin': {  // stomach drop: sub boom, a long falling sweep, a choir-like stab that sinks
        tone(42, t, 2.4, 'sine', 1, 24); noiseHit(t, .5, .6, 2200, 'bandpass', .8, 300);
        noiseHit(t, 2.6, .45, 9000, 'lowpass', .7, 180, { verb: .6 });
        tone(mtof(91), t, 2.2, 'sine', .07, mtof(55), { verb: .7, delay: .3 });
        [0, 3, 7, 10].forEach(n => { tone(mtof(57 + n), t + .02, 1.8, 'sawtooth', .04, mtof(45 + n), { verb: .8, detune: -7, att: .02 }); tone(mtof(57 + n), t + .02, 1.8, 'sawtooth', .04, mtof(45 + n), { detune: 7, att: .02 }); });
        [1244, 1864].forEach(f => tone(f, t, .5, 'triangle', .05, f * .5, { verb: .5 }));
        break;
      }
      case 'takeoff': {  // launch: whoosh, rising sweep, the big chord + bells
        noiseHit(t, 1.2, .55, 300, 'bandpass', 1, 7000, { pan: -.5, pan2: .5, verb: .4 }); tone(55, t, 1.6, 'sine', .8, 110);
        const ch = [0, 4, 7, 11, 14, 19, 24];
        ch.forEach(n => { tone(mtof(55 + n), t + .05, 3, 'sawtooth', .04, 0, { verb: .8, att: .08, detune: -8 }); tone(mtof(55 + n), t + .05, 3, 'sawtooth', .04, 0, { att: .08, detune: 8 }); });
        [0, 4, 7, 12, 16, 19, 24, 28].forEach((n, i) => bell(mtof(79 + n), t + .2 + i * .07, .09, { pan: (i % 2 ? .5 : -.5) }));
        break;
      }
      case 'kpoint': {  // beyond the K-point: brass fanfare + crowd-like noise swell
        [0, 7, 12, 16, 19, 24].forEach((n, i) => { tone(mtof(60 + n), t + i * .09, .9, 'square', .06, 0, { verb: .5, delay: .2 }); tone(mtof(48 + n), t + i * .09, .9, 'sawtooth', .05, 0, { verb: .4 }); });
        noiseHit(t, 2.6, .3, 1200, 'bandpass', .5, 2600, { verb: .7, att: .4 }); tone(43, t, 1.8, 'sine', .6, 30);
        break;
      }
      case 'squeal': noiseHit(t, .14, .12 + v * .18, 3200 + Math.random() * 1600, 'bandpass', 6, 0, { pan: (Math.random() - .5) * .8 }); break;
      case 'redline': tone(1760, t, .07, 'square', .06); tone(1320, t + .08, .07, 'square', .05); tone(60, t, .14, 'sine', .4, 40); break;
      case 'clamp':   // tires bite into the wall: metal clunk + rising whoosh
        tone(140, t, .25, 'square', .16, 60); [620, 1240, 1860].forEach((f, i) => tone(f, t + .01 * i, .4, 'triangle', .06, f * .97, { verb: .4 }));
        noiseHit(t, .9, .35, 300, 'bandpass', 1.2, 4200, { verb: .3 }); tone(55, t, .5, 'sine', .5, 30); break;
      case 'catch': [0, 7, 12].forEach((n, i) => tone(mtof(74 + n), t + i * .04, .5, 'square', .06, 0, { verb: .4, delay: .2 })); noiseHit(t, .4, .3, 900, 'bandpass', 1, 5000); break;
      case 'heart': tone(62, t, .16, 'sine', .55, 40); tone(58, t + .2, .2, 'sine', .4, 36); break;
      case 'rockwarn': noiseHit(t, 1.4, .5, 140, 'lowpass', 1, 0, { brown: true, pan: opt.pan || 0 }); tone(40, t, 1.2, 'sawtooth', .12, 30); [0, .25, .5].forEach(d => tone(988, t + d, .12, 'square', .05)); break;
      case 'rockpass': noiseHit(t, .6, .55, 900, 'bandpass', 1, 200, { pan: opt.pan || 0, brown: true }); tone(80, t, .4, 'sine', .3, 40); break;
      case 'pad': noiseHit(t, .5, .4, 800, 'bandpass', 1.5, 6000, { pan: -.4, pan2: .4 }); [0, 4, 7, 12].forEach((n, i) => tone(mtof(79 + n), t + i * .03, .25, 'triangle', .07, 0, { delay: .25 })); break;
      case 'cloud': noiseHit(t, 2.2, .45, 400, 'lowpass', 1, 9000, { verb: .6 }); [0, 7, 14, 19, 24].forEach((n, i) => tone(mtof(69 + n), t + .2 + i * .09, 2.4, 'sine', .07, 0, { verb: .8, delay: .3 })); break;
      case 'summit': {
        tone(48, t, 2.2, 'sine', .9, 28); noiseHit(t, 3.2, .4, 6000, 'highpass', 0, 2500, { verb: .7 }); noiseHit(t, .4, .6, 1800, 'bandpass', .7);
        const ch = [0, 4, 7, 11, 14, 19, 24];
        ch.forEach((n, i) => { tone(mtof(55 + n), t + .02, 3.4, 'sawtooth', .045, 0, { verb: .8, att: .05, detune: -8 }); tone(mtof(55 + n), t + .02, 3.4, 'sawtooth', .045, 0, { att: .05, detune: 8 }); });
        [0, 4, 7, 12, 16, 19, 24, 28].forEach((n, i) => bell(mtof(79 + n), t + .25 + i * .08, .1, { pan: (i % 2 ? .5 : -.5) }));
        break;
      }
      case 'chapter': [0, 7, 12, 16, 19, 24].forEach((n, i) => tone(mtof(60 + n), t + i * .06, 1.6, 'triangle', .08, 0, { verb: .6, delay: .25 })); break;
      case 'goal': {
        const mel = [0, 4, 7, 12, 11, 12, 16, 19, 24];
        mel.forEach((n, i) => { tone(mtof(67 + n), t + i * .14, .7, 'square', .06, 0, { verb: .5, delay: .25 }); tone(mtof(55 + n), t + i * .14, .7, 'sawtooth', .04, 0, { verb: .4 }); });
        tone(43, t, 3, 'sine', .7, 30); noiseHit(t + 1.2, 3, .3, 7000, 'highpass', 0, 3000, { verb: .8 });
        break;
      }
      case 'firework': { const p = (Math.random() - .5) * 1.4; noiseHit(t, .08, .3, 3000, 'bandpass', 1, 0, { pan: p }); noiseHit(t + .02, 1.6, .25, 5000, 'highpass', 0, 1500, { pan: p, verb: .6 }); tone(70, t, .6, 'sine', .4, 35); break; }
      case 'checkpoint': [0, 7, 12].forEach((n, i) => tone(mtof(79 + n), t + i * .06, .6, 'triangle', .1, 0, { verb: .5, delay: .2 })); wav('checkpoint', .5); break;
      case 'gate': {  // chapter gate: a rising choir swell + bells
        noiseHit(t, 2.4, .35, 300, 'bandpass', .8, 8000, { verb: .7 }); tone(49, t, 2, 'sine', .7, 98);
        [0, 7, 12, 16, 19, 24, 28].forEach((n, i) => { tone(mtof(55 + n), t + i * .05, 2.8, 'sawtooth', .03, 0, { verb: .9, att: .4, detune: -6 }); tone(mtof(55 + n), t + i * .05, 2.8, 'sawtooth', .03, 0, { att: .4, detune: 6 }); });
        [0, 4, 7, 12, 16, 19].forEach((n, i) => bell(mtof(79 + n), t + .3 + i * .09, .08, { pan: i % 2 ? .5 : -.5 })); wav('stage_reveal', .45); break;
      }
      case 'wallride': tone(180, t, .2, 'square', .1, 90); noiseHit(t, .6, .3, 600, 'bandpass', 1.2, 5000, { verb: .3 }); [0, 7, 12].forEach((n, i) => tone(mtof(76 + n), t + i * .03, .3, 'triangle', .07, 0, { delay: .25 })); break;
      case 'walloff': noiseHit(t, .4, .25, 3000, 'bandpass', 1, 600); tone(660, t, .15, 'triangle', .06, 990); break;
      case 'energy': [0, 4, 7].forEach((n, i) => tone(mtof(84 + n + v), t + i * .04, .3, 'sine', .1, 0, { verb: .4 })); wav('energy_collect', .4); break;
      case 'ready': [0, 4, 7, 12, 16].forEach((n, i) => tone(mtof(72 + n), t + i * .05, .5, 'square', .05, 0, { verb: .4, delay: .2 })); wav('rescue_ready', .4); break;
      case 'eboost': noiseHit(t, 1.2, .6, 200, 'bandpass', 1, 6000, { verb: .4 }); tone(48, t, 1.2, 'sawtooth', .3, 160); [0, 7, 12, 19].forEach((n, i) => tone(mtof(60 + n), t + i * .03, 1, 'sawtooth', .05, mtof(72 + n), { verb: .5 })); wav('boost_start', .5); break;
      case 'tornado': noiseHit(t, 2, .45, 150, 'lowpass', 1, 1800, { brown: true, verb: .5 }); tone(60, t, 1.6, 'sine', .4, 140); break;
      case 'updraft': noiseHit(t, 1.2, .3, 400, 'bandpass', 1, 4000, { verb: .4 }); [0, 5, 12].forEach((n, i) => tone(mtof(69 + n), t + i * .08, .8, 'sine', .07, mtof(81 + n), { verb: .6 })); break;
      case 'gravity': { tone(220, t, .9, 'sine', .25, v ? 880 : 55, { verb: .6 }); tone(330, t, .9, 'triangle', .1, v ? 1320 : 82, { verb: .5 }); noiseHit(t, .8, .3, v ? 300 : 4000, 'bandpass', 2, v ? 4000 : 300); wav('gravity_shift', .5); break; }
      case 'warn': [0, .18].forEach(d => tone(880, t + d, .12, 'square', .07)); tone(110, t, .4, 'sawtooth', .1, 80); wav('warning', .35); break;
      case 'thunder': { const p = opt.pan || 0; noiseHit(t, .12, .8, 5000, 'highpass', 0, 0, { pan: p }); noiseHit(t + .05, 2.6, .8, 900, 'lowpass', .7, 60, { brown: true, verb: .7, pan: p }); tone(40, t, 1.8, 'sine', .8, 25); break; }
      case 'rescue': { // time slows: a reversed swell, then a warm chord
        noiseHit(t, .9, .4, 6000, 'lowpass', 1, 300, { verb: .5 }); tone(mtof(74), t, 1.1, 'sine', .14, mtof(62), { verb: .7 });
        [0, 4, 7, 11].forEach((n, i) => tone(mtof(62 + n), t + .5 + i * .03, 1.4, 'triangle', .07, 0, { verb: .8, att: .1 })); wav('rescue_trigger', .5); break;
      }
      case 'beacon': [0, 7, 12, 19, 24].forEach((n, i) => bell(mtof(76 + n + (v % 3) * 2), t + i * .07, .08, { pan: (i % 2 ? .5 : -.5) })); noiseHit(t, 1.6, .15, 4000, 'highpass', 0, 9000, { verb: .8 }); break;
      case 'asteroid': noiseHit(t, .5, .4, 300, 'lowpass', 1, 80, { brown: true, pan: opt.pan || 0 }); break;
      case 'heat': tone(1046, t, .1, 'square', .06); tone(784, t + .12, .1, 'square', .05); break;
      case 'reentry': noiseHit(t, 3, .6, 200, 'lowpass', 1, 2400, { brown: true, verb: .4 }); tone(36, t, 3, 'sawtooth', .2, 60); wav('reentry', .6); break;
      case 'clouds': noiseHit(t, 2.2, .45, 400, 'lowpass', 1, 9000, { verb: .6 }); [0, 7, 14, 19, 24].forEach((n, i) => tone(mtof(69 + n), t + .2 + i * .09, 2.4, 'sine', .07, 0, { verb: .8, delay: .3 })); break;
      case 'reveal': { // horizon opens: low swell + wide open fifths
        tone(41, t, 3, 'sine', .7, 55); noiseHit(t, 3, .3, 200, 'lowpass', .7, 5000, { verb: .8, att: .8 });
        [0, 7, 12, 19, 24, 31].forEach((n, i) => { tone(mtof(50 + n), t + i * .08, 3.6, 'sawtooth', .03, 0, { verb: .9, att: .6, detune: -7 }); tone(mtof(50 + n), t + i * .08, 3.6, 'sawtooth', .03, 0, { att: .6, detune: 7 }); });
        break;
      }
      case 'awe': { // first sight of the planet: glass bells in a wide space
        [0, 7, 14, 16, 21, 28].forEach((n, i) => { tone(mtof(64 + n), t + i * .45, 4, 'sine', .07, 0, { verb: .9, delay: .4, att: .02 }); tone(mtof(76 + n), t + i * .45, 2.2, 'sine', .025, 0, { verb: .9 }); });
        tone(mtof(40), t, 6, 'sine', .25, 0, { att: 2 }); break;
      }
      case 'route': [0, 5, 7, 12].forEach((n, i) => tone(mtof(67 + n), t + i * .08, .6, 'triangle', .1, 0, { verb: .5 })); break;
      case 'touchdown': { tone(70, t, .6, 'sine', .7, 35); noiseHit(t, .5, .5, 500, 'lowpass', 0, 0, { brown: true }); [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => bell(mtof(74 + n), t + .25 + i * .1, .09, { pan: i % 2 ? .4 : -.4 })); wav('mission_complete', .5); break; }
      case 'confirm': tone(990, t, .08, 'triangle', .1); tone(1480, t + .05, .1, 'triangle', .08); wav('ui_confirm', .4); break;
      case 'back': tone(660, t, .08, 'triangle', .08); tone(440, t + .05, .1, 'triangle', .07); wav('ui_back', .4); break;
      case 'ice': noiseHit(t, .5, .2, 6000, 'highpass', 0, 2000, { verb: .4 }); [0, 5, 12].forEach((n, i) => tone(mtof(88 + n), t + i * .03, .5, 'sine', .05, 0, { verb: .6 })); break;
    }
  }


  /* ---------- optional kit WAV layer ---------- */
  const WAVS = ['boost_start', 'checkpoint', 'energy_collect', 'gravity_shift', 'mission_complete', 'near_miss', 'reentry', 'rescue_ready', 'rescue_trigger', 'ring_collect', 'stage_reveal', 'ui_back', 'ui_confirm', 'warning', 'collision_soft'];
  function loadWavs(){
    if (location.protocol === 'file:' || !window.fetch) return;
    WAVS.forEach(n => fetch('assets/sfx/' + n + '.wav').then(r => r.ok ? r.arrayBuffer() : null).then(b => b && A.ctx.decodeAudioData(b, buf => { A.wav[n] = buf; }, () => {})).catch(() => {}));
  }
  function wav(n, vol = .5){
    const b = A.wav[n]; if (!b || !A.ctx) return;
    const s = A.ctx.createBufferSource(); s.buffer = b; const g = gain(vol, A.sfxBus); s.connect(g); s.start();
  }

  /* ---------- adaptive score: one song per chapter (BPM per the composer brief) ---------- */
  // style: 'pulse' cliff, 'neon' city, 'storm' sky, 'space' cosmos, 'reentry' return, 'home' finale
  const SONGS = [
    { bpm: 118, style: 'pulse',   prog: [[50, [0, 3, 7, 14]], [46, [0, 4, 7, 11]], [53, [0, 4, 7, 9]], [48, [0, 4, 7, 14]]] },   // Dm Bb F C — tense pulse -> freedom
    { bpm: 136, style: 'neon',    prog: [[52, [0, 3, 7, 10]], [48, [0, 4, 7, 11]], [55, [0, 4, 7, 14]], [50, [0, 4, 7, 9]]] },   // Em C G D — neon velocity
    { bpm: 124, style: 'storm',   prog: [[55, [0, 3, 7, 10]], [51, [0, 4, 7, 11]], [58, [0, 4, 7, 14]], [53, [0, 4, 7, 9]]] },   // Gm Eb Bb F — storm -> soaring
    { bpm: 78,  style: 'space',   prog: [[52, [0, 7, 14, 16]], [48, [0, 7, 11, 16]], [57, [0, 3, 7, 14]], [55, [0, 4, 7, 14]]] }, // sparse awe
    { bpm: 142, style: 'reentry', prog: [[48, [0, 3, 7, 10]], [44, [0, 4, 7, 11]], [51, [0, 4, 7, 14]], [46, [0, 4, 7, 9]]] },   // Cm Ab Eb Bb — danger -> triumph
    { bpm: 92,  style: 'home',    prog: [[50, [0, 4, 7, 14]], [55, [0, 4, 7, 11]], [59, [0, 3, 7, 10]], [57, [0, 4, 7, 14]]] },  // D G Bm A — homecoming
  ];
  const TITLE = { bpm: 80, style: 'title', prog: [[57, [0, 3, 7, 14]], [53, [0, 4, 7, 11]], [48, [0, 4, 7, 14]], [55, [0, 2, 7, 11]]] };
  // the TENMA theme: a short motif reused in title, the cosmos and the finale
  const THEME = [[0, 0], [2, 4], [4, 7], [6, 12], [10, 11], [12, 7], [14, 9]];
  let songIdx = 0, pendingZone = 0;
  function voice(type, f, t, dur, vol, out, opts = {}){
    const ctx = A.ctx; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f; if (opts.detune) o.detune.value = opts.detune;
    let node = o;
    if (opts.lp){ const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = opts.q || 1; fl.frequency.setValueAtTime(opts.lp, t); if (opts.lp2) fl.frequency.exponentialRampToValueAtTime(opts.lp2, t + dur * .9); o.connect(fl); node = fl; }
    const att = opts.att || .005;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att);
    if (opts.sus){ g.gain.setValueAtTime(vol, t + dur - (opts.rel || .1)); g.gain.linearRampToValueAtTime(0, t + dur); }
    else g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    node.connect(g); g.connect(out);
    if (opts.verb) g.connect(gain(opts.verb, A.verbIn)); if (opts.delay) g.connect(gain(opts.delay, A.delayIn));
    o.start(t); o.stop(t + dur + .05);
  }
  function drum(kind, t, vol = 1){
    const ctx = A.ctx;
    if (kind === 'kick'){
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .14);
      g.gain.setValueAtTime(.95 * vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + .32); o.connect(g); g.connect(A.drums); o.start(t); o.stop(t + .35);
      A.duck.gain.cancelScheduledValues(t); A.duck.gain.setValueAtTime(.35, t); A.duck.gain.linearRampToValueAtTime(1, t + .22);
    } else if (kind === 'snare'){
      noiseHit(t, .22, .42 * vol, 1900, 'bandpass', .8, 0, { bus: A.drums, verb: .45 });
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(160, t + .1);
      g.gain.setValueAtTime(.3 * vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + .12); o.connect(g); g.connect(A.drums); o.start(t); o.stop(t + .15);
    } else if (kind === 'hat'){ noiseHit(t, .035, .09 * vol, 8500, 'highpass', 0, 0, { bus: A.drums }); }
    else if (kind === 'ohat'){ noiseHit(t, .16, .07 * vol, 7500, 'highpass', 0, 0, { bus: A.drums }); }
    else if (kind === 'tom'){ const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(70, t + .25); g.gain.setValueAtTime(.6 * vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + .4); o.connect(g); g.connect(A.drums); g.connect(gain(.3, A.verbIn)); o.start(t); o.stop(t + .45); }
    else if (kind === 'taiko'){ const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(45, t + .3); g.gain.setValueAtTime(.9 * vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + .6); o.connect(g); g.connect(A.drums); g.connect(gain(.5, A.verbIn)); o.start(t); o.stop(t + .65); noiseHit(t, .08, .3 * vol, 900, 'lowpass', 0, 0, { bus: A.drums }); }
  }
  // choir-ish pad: detuned saws through two formant bandpasses
  function choir(f, t, dur, vol){
    const ctx = A.ctx;
    for (const d of [-8, 0, 8]){
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * .3); g.gain.setValueAtTime(vol, t + dur * .7); g.gain.linearRampToValueAtTime(0, t + dur);
      const f1 = filt('bandpass', 700, 4), f2 = filt('bandpass', 1150, 5);
      o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(A.duck); g.connect(gain(.6, A.verbIn));
      o.start(t); o.stop(t + dur + .05);
    }
  }
  function schedule(){
    const ctx = A.ctx; if (!ctx) return;
    if (A.mode === 'off' || document.hidden){ A.nextT = ctx.currentTime + .08; return; }
    if (A.nextT < ctx.currentTime - .3) A.nextT = ctx.currentTime + .05;
    const play = A.mode === 'play', fin = A.mode === 'finale';
    const song = A.mode === 'title' ? TITLE : fin ? SONGS[5] : SONGS[songIdx];
    const sp = 60 / (song.bpm + (play ? A.tempoBoost || 0 : 0)) / 4;
    A.delays.forEach(d => d.delayTime.setTargetAtTime(sp * 3, ctx.currentTime, .1));
    while (A.nextT < ctx.currentTime + .14){
      const st = A.step % 64, beat = st % 16, bar = (st / 16) | 0, t = A.nextT;
      if (beat === 0 && bar === 0 && play && pendingZone !== songIdx){ songIdx = pendingZone; }
      const [root, chord] = song.prog[bar];
      const style = song.style, thr = A.threat, hot = A.intensity >= 2;
      const silent = (play && t < A.dropUntil) || t < A.silence;
      // pad
      if (beat === 0 && !silent){
        const lp = style === 'space' ? 900 : play ? 1400 : 1000;
        chord.forEach(n => {
          const f = mtof(root + 12 + n);
          voice('sawtooth', f, t, sp * 16, style === 'space' ? .016 : .022, A.duck, { detune: -9, lp, lp2: lp * 1.7, att: style === 'space' ? 1.5 : .35, sus: true, rel: .3, verb: .4 });
          voice('sawtooth', f, t, sp * 16, style === 'space' ? .016 : .022, A.duck, { detune: 9, lp, att: style === 'space' ? 1.5 : .35, sus: true, rel: .3 });
        });
        if (!play || style === 'space' || style === 'home') voice('sine', mtof(root - 12), t, sp * 16, .12, A.duck, { att: .5, sus: true, rel: .5 });
        if ((style === 'storm' && thr < .5) || style === 'reentry' && bar % 2 === 0 || fin) choir(mtof(root + 12 + chord[2]), t, sp * 16, .018);
      }
      if (silent){ /* held breath */ }
      else if (style === 'title' || style === 'home'){
        if (beat % 4 === 0){ const n = chord[(beat / 4 + bar) % chord.length]; voice('triangle', mtof(root + 24 + n), t, sp * 6, .05, A.musicBus, { delay: .5, verb: .5 }); }
        const th = THEME.find(e => e[0] === beat); if (th && bar % 2 === 0) voice('sine', mtof(62 + 12 + th[1]), t, sp * 3.5, .07, A.musicBus, { verb: .6, delay: .3, att: .02 });
        if (style === 'home'){ if (beat % 8 === 0) drum('kick', t, .6); if (beat === 8) drum('snare', t, .5); if (beat % 2 === 1) drum('hat', t, .6); }
        else if (beat === 8 && bar % 2 === 1) drum('ohat', t);
      } else if (style === 'space'){
        // near silence: glass tones and a slow low pulse
        if (beat === 0 || beat === 8) voice('sine', mtof(root - 24), t, sp * 6, .1, A.duck, { att: .3 });
        if (beat % 4 === 2 && Math.random() < .55){ const n = chord[(Math.random() * chord.length) | 0]; voice('sine', mtof(root + 36 + n), t, sp * 10, .035, A.musicBus, { verb: .9, delay: .5 }); voice('sine', mtof(root + 48 + n) * 1.002, t, sp * 5, .012, A.musicBus, { verb: .9 }); }
        const th = THEME.find(e => e[0] === beat); if (th && bar === 2) voice('triangle', mtof(root + 24 + th[1]), t, sp * 4, .04, A.musicBus, { verb: .8, delay: .4 });
      } else {
        // driving styles
        const neon = style === 'neon', storm = style === 'storm', re = style === 'reentry', pulse = style === 'pulse';
        if (pulse){ if (beat % 4 === 0) drum('kick', t); if (beat === 4 || beat === 12) drum('snare', t); if (beat % 2 === 1) drum('hat', t); if (hot && beat % 4 === 2) drum('ohat', t); }
        if (neon){ if ([0, 6, 10].includes(beat)) drum('kick', t); if (beat === 4 || beat === 12) drum('snare', t); drum('hat', t, beat % 2 ? .6 : 1); if (beat === 14) drum('ohat', t); }
        if (storm){ if (beat % 4 === 0) drum(thr > .4 ? 'taiko' : 'kick', t); if (beat === 12) drum('snare', t); if (thr > .3 && beat % 2 === 1) drum('tom', t, .5 + thr * .4); if (beat % 4 === 2) drum('hat', t); }
        if (re){ if (beat % 4 === 0 || beat === 10) drum('taiko', t); if (beat === 4 || beat === 12) drum('snare', t); drum('hat', t, .7); if (beat >= 12 && bar === 3) drum('tom', t, .8); }
        if (beat === 14 && bar === 3) drum('snare', t + sp * .5);
        // bass
        if (beat % 2 === 0){ const oct = (beat === 6 || beat === 14) ? 12 : 0; voice('sawtooth', mtof(root - 12 + oct), t, sp * 1.8, .15, A.duck, { lp: 700 + thr * 600, lp2: 220, q: 6 }); }
        // arp
        const arp = neon ? [0, 2, 1, 3, 2, 0, 3, 1] : [0, 1, 2, 3, 2, 1, 2, 3];
        const n = chord[arp[beat % 8]] + (beat >= 8 ? 12 : 0);
        if (!storm || thr > .2) voice(neon ? 'square' : 'triangle', mtof(root + 24 + n), t, sp * 1.2, neon ? .03 : .026, A.musicBus, { lp: neon ? 4200 : 3000, delay: .35 });
        // brass stabs (sky catharsis / reentry triumph)
        if ((storm && thr < .3 || re && hot) && (beat === 0 || beat === 10)) chord.forEach(c => voice('sawtooth', mtof(root + 12 + c), t, sp * 3, .022, A.musicBus, { lp: 2600, lp2: 900, verb: .4, detune: 5 }));
        // lead hook when hot
        if (hot && [0, 3, 6, 10, 12].includes(beat)){ const k = chord[[0, 1, 2, 3, 2][[0, 3, 6, 10, 12].indexOf(beat)]]; voice('sawtooth', mtof(root + 36 + k), t, sp * 2.4, .03, A.musicBus, { lp: 4200, delay: .35, verb: .3, detune: 6 }); }
      }
      A.nextT += sp; A.step++;
    }
  }

  function setMode(m){
    if (!A.ctx){ A.mode = m; return; }
    if (m !== A.mode) A.step = 0;
    if (m === 'play' && A.mode !== 'play') songIdx = pendingZone;
    A.mode = m;
    const t = A.ctx.currentTime;
    A.musicBus.gain.setTargetAtTime(m === 'off' || !A.musicOn ? 0 : A.musicVol * (m === 'title' ? .7 : m === 'finale' ? .8 : .55), t, .4);
  }
  function setZone(z){ pendingZone = Math.min(z, 4); }
  function zoneNow(z){ pendingZone = Math.min(z, 4); songIdx = pendingZone; A.step = 0; }
  // hold the groove for a moment (cliff launch, arrival in space)
  function drop(len = .75){ if (!A.ctx) return; A.dropUntil = A.ctx.currentTime + len; A.step = 0; songIdx = pendingZone; }
  function hush(len){ if (!A.ctx) return; A.silence = A.ctx.currentTime + len; const t = A.ctx.currentTime; A.musicBus.gain.cancelScheduledValues(t); A.musicBus.gain.setTargetAtTime(0, t, .6); A.musicBus.gain.setTargetAtTime(A.musicOn ? A.musicVol * .55 : 0, t + len, 1.5); }
  function setWall(p){ A.wall = p; }
  function setTempoBoost(b){ A.tempoBoost = b; }
  function setMusicVol(v){ A.musicVol = v; if (A.ctx) setMode(A.mode); }
  function setSfxVol(v){ A.sfxVol = v; if (A.ctx) A.sfxBus.gain.setTargetAtTime(A.sfxOn ? v : 0, A.ctx.currentTime, .05); }
  function setMusicOn(b){ A.musicOn = b; if (A.ctx) setMode(A.mode); }
  function setSfxOn(b){ A.sfxOn = b; setSfxVol(A.sfxVol); }
  function setMute(m){ A.muted = m; if (A.ctx) A.master.gain.setTargetAtTime(m ? 0 : .9, A.ctx.currentTime, .05); }
  function silenceLoops(){ if (A.ctx) update({ speed: 0, thrust: 0, boost: false, grounded: true, playing: false }); }
  function suspend(b){ if (!A.ctx) return; if (b) A.ctx.suspend(); else A.ctx.resume(); }

  return { setWall, drop, hush, zoneNow, init, update, sfx, setMode, setZone, setTempoBoost, setMusicVol, setSfxVol, setMusicOn, setSfxOn, setMute, silenceLoops, suspend, get muted(){ return A.muted; }, get ready(){ return !!A.ctx; } };
})();
