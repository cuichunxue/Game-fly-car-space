/* ============================================================
 * THRUST ROADSTER — TENMA EDITION · world
 * 5つの章（断崖 → 道路のない都市 → 天空 → 宇宙 → 帰還）をZ軸上に連続して並べ、
 * 暗転なしで空・霧・光・雲・惑星をブレンドしてつなぐ。
 * 章の中身はデータ駆動（CHAPTERS と各ジェネレータ）で、乱数はシード固定。
 * ============================================================ */
window.TR = window.TR || {};
TR.World = (() => {
  'use strict';
  const T = TR.Tex, Md = TR.Models;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ---------- chapter definitions (data-driven) ---------- */
  // phys: G gravity, term max descent, thrust, latV lateral speed, latDamp, inertia (space), drag
  const CHAPTERS = [
    { id: 'cliff',   code: 'S1', name: 'GRAVITY CLIFF',   jp: '重力の断崖',     z0: 0,     z1: 3560,  song: 0, weather: 1, emotion: '好奇心 → 驚き',
      goal: '峡谷出口のゲートを通過', intro: '断崖の台地を走り、大地の果てから跳べ。',
      phys: { G: 22, term: 26, thrust: 38, latV: 13, latDamp: 13, airDamp: 8, inertia: 0 }, speed: 36 },
    { id: 'city',    code: 'S2', name: 'ROADLESS CITY',   jp: '道のない都市',   z0: 3560,  z1: 7950,  song: 1, weather: 0, emotion: 'スリル',
      goal: '都市頂上の気流ゲートへ', intro: '道路はない。壁が道になる。',
      phys: { G: 15, term: 13, thrust: 34, latV: 14, latDamp: 12, airDamp: 9, inertia: 0 }, speed: 40 },
    { id: 'sky',     code: 'S3', name: 'SKY BREAKER',     jp: '天空突破',       z0: 7950,  z1: 12750, song: 2, weather: 2, emotion: '解放感',
      goal: '成層圏の出口へ', intro: '竜巻は、敵にも翼にもなる。',
      phys: { G: 11, term: 11, thrust: 30, latV: 14, latDamp: 10, airDamp: 8, inertia: 0 }, speed: 42 },
    { id: 'cosmos',  code: 'S4', name: 'COSMIC ODYSSEY',  jp: '宇宙の旅',       z0: 12750, z1: 17900, song: 3, weather: 3, emotion: '畏敬・静寂',
      goal: '光のビーコンを集め、帰還航路を選ぶ', intro: '音のない空で、地球を見下ろす。',
      phys: { G: 5, term: 12, thrust: 13, latV: 16, latDamp: 1.6, airDamp: 1.6, inertia: 1 }, speed: 46 },
    { id: 'reentry', code: 'S5', name: 'EARTH RETURN',    jp: '地球帰還',       z0: 17900, z1: 23400, song: 4, weather: 4, emotion: '緊張 → 感動',
      goal: '安全な着地点へ帰還', intro: '熱の壁を越えて、出発した台地へ。',
      phys: { G: 12, term: 30, thrust: 24, latV: 14, latDamp: 9, airDamp: 7, inertia: 0 }, speed: 52 },
  ];
  const TOTAL = CHAPTERS[4].z1;
  function chapterAt(z){ for (let i = CHAPTERS.length - 1; i >= 0; i--) if (z >= CHAPTERS[i].z0) return i; return 0; }

  /* ---------- atmosphere keyframes along the journey ---------- */
  const K = (z, o) => Object.assign({ z }, o);
  const ATMO = [
    K(0,     { top: 0x2a3d6e, mid: 0xc9776a, hor: 0xffb070, sunCol: 0xffb060, sunDir: [-.35, .09, 1], sunSize: 1.6, stars: 0, clouds: .7, fog: 0xd99a78, fogNear: 120, fogFar: 1300, hemiSky: 0xffd2a8, hemiGround: 0x4a3040, hemiI: .9, dirCol: 0xffc080, dirI: 2.3, exposure: 1.0, env: 0 }),
    K(3000,  { top: 0x1c2550, mid: 0x9a5a78, hor: 0xff8a5a, sunCol: 0xff8040, sunDir: [-.4, .03, 1], sunSize: 2.2, stars: .2, clouds: .6, fog: 0xa86a72, fogNear: 100, fogFar: 1200, hemiSky: 0xff9a80, hemiGround: 0x30203a, hemiI: .8, dirCol: 0xff9a60, dirI: 1.7, exposure: 1.0, env: 0 }),
    K(4100,  { top: 0x060a1e, mid: 0x152a4a, hor: 0x2a6a80, sunCol: 0x58e1f4, sunDir: [.5, .3, 1], sunSize: 0, stars: .6, clouds: .2, fog: 0x0d2235, fogNear: 60, fogFar: 900, hemiSky: 0x6ab8ff, hemiGround: 0x401830, hemiI: .7, dirCol: 0x9ad8ff, dirI: .9, exposure: 1.05, env: 1 }),
    K(7400,  { top: 0x0a0a24, mid: 0x2a1840, hor: 0x8a3a5a, sunCol: 0xff6a62, sunDir: [-.5, .2, 1], sunSize: 0, stars: .5, clouds: .3, fog: 0x2a1530, fogNear: 60, fogFar: 900, hemiSky: 0xff8a9a, hemiGround: 0x102030, hemiI: .7, dirCol: 0xffa0b0, dirI: .9, exposure: 1.05, env: 1 }),
    K(8300,  { top: 0x120e30, mid: 0x2a2a58, hor: 0x54548a, sunCol: 0xc0b0ff, sunDir: [.3, .25, 1], sunSize: .6, stars: 0, clouds: .9, fog: 0x34345e, fogNear: 50, fogFar: 750, hemiSky: 0xa0a8e0, hemiGround: 0x2a2840, hemiI: .9, dirCol: 0xb0b0e0, dirI: 1.1, exposure: 1.05, env: 2 }),
    K(11500, { top: 0x1c1440, mid: 0x3a3a70, hor: 0x7a70a8, sunCol: 0xffd090, sunDir: [.2, .2, 1], sunSize: 1, stars: 0, clouds: .9, fog: 0x484878, fogNear: 60, fogFar: 800, hemiSky: 0xb0b0e8, hemiGround: 0x303050, hemiI: .95, dirCol: 0xd0c0ff, dirI: 1.3, exposure: 1.05, env: 2 }),
    K(12250, { top: 0x2a5aa8, mid: 0x7aa8e0, hor: 0xffd890, sunCol: 0xffcb70, sunDir: [0, .25, 1], sunSize: 2.6, stars: 0, clouds: .5, fog: 0xd8c8b0, fogNear: 150, fogFar: 1600, hemiSky: 0xffe8c0, hemiGround: 0x5a6080, hemiI: 1.1, dirCol: 0xffe0a0, dirI: 2.6, exposure: 1.0, env: 2 }),
    K(12800, { top: 0x050a24, mid: 0x14285a, hor: 0x4a7ac0, sunCol: 0xfff0d8, sunDir: [.45, .15, 1], sunSize: 1.2, stars: .7, clouds: 0, fog: 0x0a1430, fogNear: 400, fogFar: 3000, hemiSky: 0x9ab8ff, hemiGround: 0x101830, hemiI: .6, dirCol: 0xfff4e0, dirI: 2.4, exposure: 1.0, env: 3 }),
    K(13300, { top: 0x000005, mid: 0x02040e, hor: 0x0a1430, sunCol: 0xfff6e8, sunDir: [.5, .18, 1], sunSize: .8, stars: 1, clouds: 0, fog: 0x02040c, fogNear: 600, fogFar: 4000, hemiSky: 0x5a6a90, hemiGround: 0x0a1020, hemiI: .45, dirCol: 0xffffff, dirI: 2.6, exposure: 1.05, env: 3 }),
    K(17900, { top: 0x000005, mid: 0x020410, hor: 0x0e1838, sunCol: 0xfff6e8, sunDir: [.3, .1, 1], sunSize: .8, stars: 1, clouds: 0, fog: 0x02040c, fogNear: 600, fogFar: 4000, hemiSky: 0x5a6a90, hemiGround: 0x0a1020, hemiI: .45, dirCol: 0xffffff, dirI: 2.6, exposure: 1.05, env: 3 }),
    K(19300, { top: 0x0a0a20, mid: 0x3a1a20, hor: 0xff7a30, sunCol: 0xffa060, sunDir: [-.3, .12, 1], sunSize: 1, stars: .5, clouds: 0, fog: 0x4a2018, fogNear: 200, fogFar: 2000, hemiSky: 0xffa070, hemiGround: 0x201018, hemiI: .7, dirCol: 0xffb080, dirI: 2.2, exposure: 1.0, env: 4 }),
    K(20300, { top: 0x163a7a, mid: 0x4a88d0, hor: 0xa8d0f0, sunCol: 0xffd8a0, sunDir: [-.35, .06, 1], sunSize: 1.6, stars: .05, clouds: .7, fog: 0x9ac0e0, fogNear: 120, fogFar: 1500, hemiSky: 0xd0e8ff, hemiGround: 0x506070, hemiI: 1, dirCol: 0xffe0b0, dirI: 2.2, exposure: 1.0, env: 4 }),
    K(21400, { top: 0x2a4a8a, mid: 0xe0a080, hor: 0xffcb70, sunCol: 0xffcb70, sunDir: [-.3, .07, 1], sunSize: 2.6, stars: 0, clouds: .8, fog: 0xe8b890, fogNear: 140, fogFar: 1500, hemiSky: 0xffe0b8, hemiGround: 0x504050, hemiI: 1.05, dirCol: 0xffd090, dirI: 2.6, exposure: 1.0, env: 0 }),
    K(23400, { top: 0x3a5a9a, mid: 0xf0b890, hor: 0xffd890, sunCol: 0xffd890, sunDir: [-.3, .12, 1], sunSize: 2.4, stars: 0, clouds: .8, fog: 0xf0c8a0, fogNear: 150, fogFar: 1600, hemiSky: 0xffe8c8, hemiGround: 0x605060, hemiI: 1.1, dirCol: 0xffe0a0, dirI: 2.6, exposure: 1.0, env: 0 }),
  ];
  const TITLE_ATMO = K(-1, { top: 0x1a2a5a, mid: 0x8a6a90, hor: 0xffb880, sunCol: 0xffc070, sunDir: [-.5, .07, 1], sunSize: 2, stars: .25, clouds: .7, fog: 0xc89a90, fogNear: 100, fogFar: 1100, hemiSky: 0xffd8b8, hemiGround: 0x403048, hemiI: .95, dirCol: 0xffc890, dirI: 2.2, exposure: 1.0, env: 0 });

  /* ---------- scene, sky, clouds, earth ---------- */
  let scene, renderer, sky, skyMat, hemi, sun, fill, cloud, cloudMat, earthG, envMaps = [];
  const roots = new THREE.Group();
  function makeSky(){
    skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0, .1, 1).normalize() }, sunSize: { value: 1 }, stars: { value: 0 }, clouds: { value: 0 }, time: { value: 0 }, shafts: { value: 0 },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }',
      fragmentShader: `
        uniform vec3 top, mid, hor, sunCol, sunDir; uniform float sunSize, stars, clouds, time, shafts;
        varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*.3183099+.1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0., a = .5; for(int i=0;i<5;i++){ s += a*n2(p); p *= 2.03; a *= .5; } return s; }
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 c = mix(hor, mid, smoothstep(-.03, .2, h));
          c = mix(c, top, smoothstep(.2, .8, h));
          c = mix(c, hor*.35, smoothstep(0., -.25, h));
          float sd = max(dot(d, normalize(sunDir)), 0.);
          c += sunCol * (smoothstep(.9994 - .0004*sunSize, .9998, sd)*8. + pow(sd, 22.)*.55 + pow(sd, 5.)*.18*sunSize);
          // milky way band + stars
          vec3 q = d*420.; vec3 id = floor(q); float s = hash(id);
          float star = step(.9965, s) * smoothstep(.5, .1, length(fract(q)-.5)) * smoothstep(-.1, .2, h);
          float band = exp(-pow(d.x*.9 + d.y*.5 - .1, 2.)*9.) * fbm(d.xz*6. + d.y*3.);
          c += vec3(.9,.95,1.) * star * stars * (.55 + .45*sin(time*2.5 + s*80.)) * 1.7;
          c += vec3(.35,.4,.7) * band * stars * .35;
          if (clouds > 0. && h > -.02){
            vec2 uv = d.xz/(h+.12);
            float cl = fbm(uv*1.4 + vec2(time*.01, 0.));
            float bandc = smoothstep(.0, .06, h) * smoothstep(.45, .12, h);
            float a = smoothstep(.48, .78, cl) * bandc * clouds;
            vec3 lit = mix(mid*.7, sunCol*1.4 + hor*.4, pow(sd, 3.)*.9 + .1);
            c = mix(c, lit, a*.85);
          }
          if (shafts > 0.){ float ang = atan(d.x - sunDir.x, d.y - sunDir.y); float r = sin(ang*14. + time*.05)*.5+.5; c += sunCol * pow(r, 6.) * pow(sd, 3.) * shafts * .5; }
          gl_FragColor = vec4(c, 1.);
        }`
    });
    sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), skyMat);
    sky.renderOrder = -10; sky.frustumCulled = false;
    return sky;
  }
  function makeCloud(){
    cloudMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, top: { value: new THREE.Color(0xfff0f4) }, bot: { value: new THREE.Color(0x6a6480) }, sunCol: { value: new THREE.Color(0xffc890) }, cam: { value: new THREE.Vector3() }, opacity: { value: 0 }, storm: { value: 0 } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: `
        uniform float time, opacity, storm; uniform vec3 top, bot, sunCol, cam; varying vec3 vW;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0., a = .5; for(int i=0;i<6;i++){ s += a*n2(p); p *= 2.07; a *= .5; } return s; }
        void main(){
          vec2 p = vW.xz*.0055 + vec2(time*.012, time*.03);
          float d = fbm(p) + .35*fbm(p*3.1 - time*.02);
          float a = smoothstep(.38 - storm*.1, .9, d);
          float dist = length(vW.xz - cam.xz);
          a *= smoothstep(2600., 1100., dist);
          vec3 c = gl_FrontFacing ? top : bot;
          c *= .65 + .6*smoothstep(.5, 1.2, d);
          c += sunCol * .3 * smoothstep(.9, 1.3, d) * (gl_FrontFacing ? 1. : 0.);
          gl_FragColor = vec4(c, clamp(a*1.2, 0., 1.) * opacity);
        }`
    });
    cloud = new THREE.Mesh(new THREE.PlaneGeometry(5600, 5600, 1, 1).rotateX(-Math.PI / 2), cloudMat);
    cloud.frustumCulled = false; cloud.renderOrder = 4;
    return cloud;
  }
  function applyAtmo(u, A){
    u.top.value.setHex(A.top); u.mid.value.setHex(A.mid); u.hor.value.setHex(A.hor); u.sunCol.value.setHex(A.sunCol);
    u.sunDir.value.set(...A.sunDir).normalize(); u.sunSize.value = A.sunSize; u.stars.value = A.stars; u.clouds.value = A.clouds;
  }
  function buildEnvMaps(){
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const s = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat.clone()); envScene.add(s);
    const panel = (c, x, y, z, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m); };
    const picks = [ATMO[0], ATMO[2], ATMO[4], ATMO[8], ATMO[11]];
    picks.forEach((A, i) => {
      applyAtmo(s.material.uniforms, A);
      while (envScene.children.length > 1) envScene.remove(envScene.children[1]);
      if (i === 1){ panel(new THREE.Color(0xff6a62).multiplyScalar(2.5), -60, 10, 30, 30, 40); panel(new THREE.Color(0x58e1f4).multiplyScalar(2.5), 60, 15, -10, 30, 50); panel(new THREE.Color(0xffffff).multiplyScalar(1.2), 0, 90, 0, 60, 20); }
      else if (i === 3){ panel(new THREE.Color(0x3a70c0).multiplyScalar(1.4), 0, -80, 0, 200, 40); panel(new THREE.Color(0xffffff).multiplyScalar(4), 50, 20, 60, 14, 14); }
      else { panel(new THREE.Color(A.sunCol).multiplyScalar(3), A.sunDir[0] * 60, 25, 60, 50, 12); panel(new THREE.Color(A.mid).multiplyScalar(1.4), 0, 80, -20, 90, 30); }
      envMaps[i] = pm.fromScene(envScene, .02).texture;
    });
    pm.dispose();
  }

  function init(sc, r){
    scene = sc; renderer = r;
    scene.add(makeSky()); scene.add(makeCloud());
    scene.fog = new THREE.Fog(0x000000, 60, 600);
    hemi = new THREE.HemisphereLight(0xffffff, 0x000000, .8); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffffff, 2); sun.castShadow = true;
    sun.shadow.camera.left = -24; sun.shadow.camera.right = 24; sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 160; sun.shadow.bias = -.0008; sun.shadow.normalBias = .06;
    scene.add(sun); scene.add(sun.target);
    fill = new THREE.DirectionalLight(0x6fa8ff, .35); fill.position.set(30, 20, -60); scene.add(fill);
    earthG = Md.earth(2400); earthG.visible = false; earthG.renderOrder = -5; scene.add(earthG);
    scene.add(roots);
    buildEnvMaps();
    setAtmo(-1);
  }
  function setShadowSize(n){ sun.castShadow = n > 0; if (n > 0){ sun.shadow.mapSize.set(n, n); if (sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; } } }

  const cB = new THREE.Color(), cA = new THREE.Color();
  const lerpHex = (out, a, b, t) => out.setHex(a).lerp(cB.setHex(b), t);
  let currentEnv = -1;
  function setAtmo(z){
    let A, B, t;
    if (z < 0){ A = B = TITLE_ATMO; t = 0; }
    else {
      let i = 0; while (i < ATMO.length - 2 && z > ATMO[i + 1].z) i++;
      A = ATMO[i]; B = ATMO[i + 1]; t = smooth(A.z, B.z, z);
    }
    const u = skyMat.uniforms;
    lerpHex(u.top.value, A.top, B.top, t); lerpHex(u.mid.value, A.mid, B.mid, t); lerpHex(u.hor.value, A.hor, B.hor, t); lerpHex(u.sunCol.value, A.sunCol, B.sunCol, t);
    u.sunDir.value.set(lerp(A.sunDir[0], B.sunDir[0], t), lerp(A.sunDir[1], B.sunDir[1], t), 1).normalize();
    u.sunSize.value = lerp(A.sunSize, B.sunSize, t); u.stars.value = lerp(A.stars, B.stars, t); u.clouds.value = lerp(A.clouds, B.clouds, t);
    u.shafts.value = z > 11900 && z < 12900 ? smooth(11900, 12250, z) * (1 - smooth(12500, 12900, z)) : (z > 21000 && z < 23400 ? .4 : 0);
    lerpHex(scene.fog.color, A.fog, B.fog, t); scene.fog.near = lerp(A.fogNear, B.fogNear, t); scene.fog.far = lerp(A.fogFar, B.fogFar, t);
    lerpHex(hemi.color, A.hemiSky, B.hemiSky, t); lerpHex(hemi.groundColor, A.hemiGround, B.hemiGround, t); hemi.intensity = lerp(A.hemiI, B.hemiI, t);
    lerpHex(sun.color, A.dirCol, B.dirCol, t); sun.intensity = lerp(A.dirI, B.dirI, t);
    renderer.toneMappingExposure = lerp(A.exposure, B.exposure, t);
    const envI = t < .5 ? A.env : B.env;
    if (envI !== currentEnv){ currentEnv = envI; scene.environment = envMaps[envI]; }
    return u.sunDir.value;
  }

  /* where the sea of clouds sits for each part of the journey (null = hidden) */
  function cloudY(z){
    if (z < 0) return -260;                       // title: far below the plateau
    if (z < 3560) return -260;                    // the canyon floor sits above a cloud sea
    if (z < 7950) return lerp(-170, -110, smooth(3560, 7950, z));   // mist under the roadless city
    if (z < 12750) return pathY(z) - 38;          // the storm deck
    if (z < 13600) return lerp(pathY(12750) - 38, -1400, smooth(12750, 13600, z)); // dropping away: ascent
    if (z < 19600) return null;
    if (z < 21300) return lerp(-500, 70, smooth(19500, 20300, z)) - smooth(20300, 21300, z) * 330; // pass through on the way down
    return -260;
  }
  function earthOffset(z){ // how far below the camera the planet's top sits (null = hidden)
    if (z < 12600 || z > 19900) return null;
    if (z < 13400) return lerp(-4000, -900, smooth(12600, 13400, z));
    if (z < 18200) return -900;
    return lerp(-900, -380, smooth(18200, 19900, z));
  }

  /* ---------- the flight path (center line) per chapter ---------- */
  let routeSteep = false;
  function pathY(z){
    if (z < 1600) return 0;
    if (z < 3560) return -90;
    if (z < 7950){ if (z > 7650) return lerp(-28, 12, smooth(7650, 7920, z)); return lerp(-84, -28, smooth(3650, 7650, z)); }
    if (z < 12750){ if (z > 12100) return lerp(150, 192, smooth(12100, 12620, z)); return lerp(16, 150, smooth(8000, 12100, z)); }
    if (z < 17900) return lerp(192, 200, smooth(12750, 13300, z));
    // reentry: steep route drops early and fast, gentle route spreads it out
    const k = smooth(17900, 22150, z);
    const s = routeSteep ? 1 - Math.pow(1 - k, 1.8) : k * k * (3 - 2 * k) * .55 + k * .45;
    return Math.max(4, lerp(200, 6, s));
  }

  /* ---------- per-chapter content containers ---------- */
  const built = [];    // CHAPTERS index -> content
  const BUCKET = 40;
  function makeContent(ci){
    return { ci, group: new THREE.Group(), solids: [], buckets: new Map(), items: [], movers: [], vols: [], storms: [], bolts: [], gates: [], checkpoints: [], signs: [], anim: [], cull: [] };
  }
  function addSolid(C, s){
    s.yb = s.yb === undefined ? -1e5 : s.yb;
    C.solids.push(s);
    for (let b = Math.floor(s.z0 / BUCKET); b <= Math.floor(s.z1 / BUCKET); b++){ let l = C.buckets.get(b); if (!l) C.buckets.set(b, l = []); l.push(s); }
    return s;
  }
  function solidsNear(z, out){
    out.length = 0; const b = Math.floor(z / BUCKET);
    for (const C of built) if (C) for (let k = b - 1; k <= b + 1; k++){ const l = C.buckets.get(k); if (l) for (const s of l) if (out.indexOf(s) < 0) out.push(s); }
    return out;
  }
  // top surface height of a solid at z (linear slope)
  const topAt = (s, z) => s.y0 + (s.y1 - s.y0) * clamp((z - s.z0) / Math.max(.001, s.z1 - s.z0), 0, 1);

  function add(C, obj, x, y, z, cull = true){ obj.position.set(x, y, z); C.group.add(obj); if (cull) C.cull.push(obj); return obj; }
  function item(C, kind, x, y, z, extra = {}){
    let mesh;
    if (kind === 'ring') mesh = Md.ring();
    else if (kind === 'cell') mesh = Md.airCell();
    else if (kind === 'orb') mesh = Md.energyOrb();
    else if (kind === 'beacon') mesh = Md.beaconLight();
    add(C, mesh, x, y, z);
    const it = Object.assign({ kind, x, y, z, got: false, mesh, r: kind === 'beacon' ? 4.5 : kind === 'ring' ? 2.2 : 1.8 }, extra);
    C.items.push(it); return it;
  }
  function ringArc(C, x, z0, z1, y0, y1, h, n){
    for (let i = 0; i < n; i++){ const t = (i + .5) / n; item(C, 'ring', x, lerp(y0, y1, t) + Math.sin(t * Math.PI) * h, lerp(z0, z1, t)); }
  }
  function checkpoint(C, z, x, y, label){ C.checkpoints.push({ z, x, y, label }); }

  /* ---------- road ribbon (S1 / S5): top surface + rock skirt ---------- */
  function ribbon(C, pts, half, opts = {}){
    const top = [], side = [];
    const pos = [], uv = [], idx = [];
    const skirt = opts.skirt || 60;
    let acc = 0;
    for (let i = 0; i < pts.length; i++){
      const [z, y] = pts[i]; if (i) acc += Math.hypot(z - pts[i - 1][0], y - pts[i - 1][1]);
      pos.push(-half, y, z, half, y, z); uv.push(0, acc / 12, 1, acc / 12);
    }
    for (let i = 0; i < pts.length - 1; i++){ const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const road = new THREE.Mesh(g, Md.emat('road')); road.receiveShadow = true; C.group.add(road);
    // skirt walls (both sides + front face) so gaps read as real chasms
    const sp = [], su = [], si = [];
    let n = 0;
    for (const s of [-1, 1]){
      for (let i = 0; i < pts.length; i++){ const [z, y] = pts[i]; sp.push(s * half * 1.25, y - .1, z, s * half * 1.6, y - skirt, z); su.push(z / 20, 0, z / 20, skirt / 20); }
      for (let i = 0; i < pts.length - 1; i++){ const a = n + i * 2; if (s < 0) si.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else si.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      n += pts.length * 2;
    }
    // top shoulders
    for (const s of [-1, 1]){
      for (let i = 0; i < pts.length; i++){ const [z, y] = pts[i]; sp.push(s * half, y + .02, z, s * half * 1.25, y - .1, z); su.push(z / 20, 0, z / 20, .2); }
      for (let i = 0; i < pts.length - 1; i++){ const a = n + i * 2; if (s < 0) si.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else si.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      n += pts.length * 2;
    }
    for (const end of [0, pts.length - 1]){
      const [z, y] = pts[end]; const b = n;
      sp.push(-half * 1.25, y, z, half * 1.25, y, z, -half * 1.6, y - skirt, z, half * 1.6, y - skirt, z); su.push(0, 0, 1, 0, 0, 2, 1, 2);
      if (end === 0) si.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); else si.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      n += 4;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2)); sg.setIndex(si); sg.computeVertexNormals();
    const skirtM = new THREE.Mesh(sg, Md.emat('rock')); skirtM.receiveShadow = true; C.group.add(skirtM);
    // edge lights
    if (opts.lights !== false){
      const lg = []; for (let i = 0; i < pts.length; i++){ const [z, y] = pts[i]; if (i % 2) continue; for (const s of [-1, 1]) lg.push(new THREE.BoxGeometry(.18, .12, .5).translate(s * (half - .25), y + .07, z)); }
      if (lg.length){ const m = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(lg), opts.lightMat || Md.mats().amberGlow); C.group.add(m); }
    }
    // collision: one solid per segment
    for (let i = 0; i < pts.length - 1; i++){
      const [za, ya] = pts[i], [zb, yb] = pts[i + 1];
      addSolid(C, { x0: -half * 1.3, x1: half * 1.3, z0: za, z1: zb, y0: ya, y1: yb, kind: opts.kind || 'road', refuel: true, home: !!opts.home });
    }
  }
  const flat = (z0, z1, y, step = 12) => { const p = []; for (let z = z0; z < z1; z += step) p.push([z, y]); p.push([z1, y]); return p; };

  // rails along the plateau so the road edges are readable and safe (visual only; lateral clamp in game)
  function rails(C, z0, z1, y, x, col){
    const mat = col || Md.mats().cyanGlow;
    for (const s of [-1, 1]){
      const r = Md.box(.12, .12, z1 - z0, mat, s * x, y + .9, (z0 + z1) / 2); C.group.add(r);
      for (let z = z0; z < z1; z += 16) C.group.add(Md.box(.12, .9, .12, Md.mats().darkMetal, s * x, y + .45, z));
    }
  }

  /* ---------- S1 GRAVITY CLIFF ---------- */
  const LIP_Z = 1600, LIP_Y = 7, CANYON_Y = -90;
  let hillPts = null;
  function jumpTrajectory(speed){
    // simulate the car leaving the lip (same arcade physics as the game, no thrust)
    const P = CHAPTERS[0].phys; let z = LIP_Z, y = LIP_Y, vy = speed * .3; const pts = [];
    while (y > CANYON_Y && z < 2400){ vy = Math.max(-P.term, vy - P.G * .05); y += vy * .05; z += speed * .05; pts.push([z, y]); }
    return pts;
  }
  function genCliff(C, rnd){
    const Mt = Md.mats();
    // plateau road with chasms
    const segs = [[-60, 380, 0], [392, 700, 0], [720, 1000, 0], [1024, 1300, 3], [1330, 1500, 0]];
    for (const [a, b, y] of segs) ribbon(C, flat(a, b, y), 8);
    // the launch ramp: curve up to the lip
    const ramp = []; for (let z = 1500; z <= LIP_Z; z += 5){ const t = (z - 1500) / (LIP_Z - 1500); ramp.push([z, LIP_Y * t * t]); }
    ribbon(C, ramp, 8, { lightMat: Mt.cyanGlow });
    // landing hill shaped to the jump arc, then down to the canyon floor
    const traj = jumpTrajectory(CHAPTERS[0].speed + 4);
    hillPts = [];
    for (const [z, y] of traj){ if (z < 1690) continue; if (hillPts.length && z - hillPts[hillPts.length - 1][0] < 8) continue; hillPts.push([z, Math.max(CANYON_Y, y - 1.5 - (z - 1690) * .004)]); }
    const lastZ = hillPts.length ? hillPts[hillPts.length - 1][0] : 1900;
    // ease out onto the floor
    for (let z = lastZ + 8, k = 1; z < lastZ + 80; z += 8, k++){ hillPts.push([z, CANYON_Y]); }
    hillPts.unshift([1660, hillPts[0][1] + 6]);
    ribbon(C, hillPts, 10, { skirt: 140 });
    const floorStart = hillPts[hillPts.length - 1][0];
    ribbon(C, flat(floorStart, 2500, CANYON_Y), 9);
    ribbon(C, flat(2526, 2900, CANYON_Y), 9);
    ribbon(C, flat(2932, 3250, CANYON_Y), 9);
    ribbon(C, flat(3250, 3560, CANYON_Y), 9, { lightMat: Mt.cyanGlow });
    rails(C, -60, 1500, 0, 8.6);
    // gap rings and refuel
    ringArc(C, 0, 372, 404, 1.8, 1.8, 3, 4);
    ringArc(C, 3, 690, 735, 1.8, 1.8, 5, 5);
    ringArc(C, 0, 1295, 1338, 4.8, 1.8, 4, 4);
    ringArc(C, 0, 2490, 2535, CANYON_Y + 1.8, CANYON_Y + 1.8, 4, 5);
    ringArc(C, -3, 2890, 2942, CANYON_Y + 1.8, CANYON_Y + 1.8, 6, 6);
    // the big jump: rings trace the arc (reward for holding the line)
    traj.forEach(([z, y], i) => { if (i % 9 === 4 && z < 1880) item(C, 'ring', 0, y + 2.4, z); });
    for (const z of [160, 300, 560, 860, 1180, 1420, 2200, 2700, 3100]) item(C, 'cell', (rnd() - .5) * 8, (z > 1600 ? CANYON_Y : z > 1024 && z < 1300 ? 3 : 0) + 1.2, z);
    for (const z of [640, 1100, 2350, 3000]) item(C, 'orb', (rnd() - .5) * 10, (z > 1600 ? CANYON_Y : z > 1024 && z < 1300 ? 3 : 0) + 4, z);
    // boulders on the road: jump or steer
    for (const [z, x] of [[520, -3], [600, 4], [850, 0], [1180, -4], [1240, 3], [1420, 0], [2300, 4], [2380, -4], [2650, 0], [2780, -5], [3080, 3]]){
      const y = z > 1600 ? CANYON_Y : z > 1024 && z < 1300 ? 3 : 0;
      const b = Md.boulder((z | 0) % 5); b.scale.set(1.7, 1.4, 1.7); add(C, b, x, y + 1, z);
      addSolid(C, { x0: x - 1.6, x1: x + 1.6, z0: z - 1.5, z1: z + 1.5, y0: y + 2.2, y1: y + 2.2, yb: y - 1, kind: 'rock' });
    }
    // canyon walls after the jump, distant mesas everywhere
    for (let z = 1700; z < 3700; z += 70){
      for (const s of [-1, 1]){
        const m = Md.mesa((z / 70 | 0) + (s > 0 ? 3 : 0)); const w = 30 + rnd() * 20, h = 70 + rnd() * 80;
        m.scale.set(w, h, 50); add(C, m, s * (24 + w * .7 + rnd() * 10), CANYON_Y - 20 + h / 2, z);
      }
    }
    for (let i = 0; i < 46; i++){
      const z = -200 + i * 85 + rnd() * 40, s = rnd() < .5 ? -1 : 1, d = 90 + rnd() * 380;
      const m = Md.mesa(i); const w = 25 + rnd() * 50, h = 60 + rnd() * 160;
      m.scale.set(w, h, w); add(C, m, s * d, (z > 1600 ? CANYON_Y : 0) - 140 + h / 2 + rnd() * 30, z);
    }
    // a sign before the cliff
    const sign = signBoard('▲ 断崖まで 300m', 'amber'); add(C, sign, 0, 7, 1200);
    const sign2 = signBoard('跳べ。', 'blue'); add(C, sign2, 0, 12, 1560);
    // exit gate (clear condition)
    const g = Md.gate(10, 0xffcb70); add(C, g, 0, CANYON_Y + 7, 3420); C.gates.push({ kind: 'exit', x: 0, y: CANYON_Y + 7, z: 3420, r: 12, mesh: g, done: false });
    C.anim.push(() => { g.rotation.z += .004; });
    for (const z of [20, 730, 1338, Math.round(floorStart + 20), 2940]) checkpoint(C, z, 0, z > 1600 ? CANYON_Y : z > 1024 && z < 1300 ? 3 : 0, '');
  }
  function signBoard(text, style){
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), new THREE.MeshBasicMaterial({ map: T.sign([text], { style }), transparent: true, side: THREE.DoubleSide }));
    m.rotation.y = Math.PI; return m;
  }

  /* ---------- S2 ROADLESS CITY ---------- */
  function tower(C, x, z, w, d, yTop, opts = {}){
    const yBot = yTop - (opts.h || 260);
    const m = Md.tower(opts.v || 0, w, yTop - yBot, d); add(C, m, x, (yTop + yBot) / 2, z);
    const s = addSolid(C, { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: yTop, y1: yTop, yb: yBot, kind: 'tower', wall: !!opts.wall, refuel: !!opts.pad });
    if (opts.wall){
      // glowing wall-ride lane on the face toward the corridor
      const side = x > 0 ? -1 : 1;
      for (const dy of [-3, 6]){
        const lane = new THREE.Mesh(new THREE.PlaneGeometry(d, 3), Md.emat('wallLane')); lane.material.map.repeat.set(d / 12, 1);
        lane.rotation.y = side * Math.PI / 2; add(C, lane, x + side * (w / 2 + .05), opts.laneY + dy, z);
      }
    }
    if (opts.pad){
      const p = new THREE.Mesh(new THREE.CircleGeometry(Math.min(w, d) * .42, 40).rotateX(-Math.PI / 2), Md.emat('pad')); add(C, p, x, yTop + .05, z);
      const l = Md.sprite(Md.mats().glowSprite, 0x58e1f4, 8, x, yTop + 1, z); l.material.opacity = .5; C.group.add(l);
    }
    if (opts.antenna){ const a = Md.box(.3, 14, .3, Md.mats().darkMetal, x, yTop + 7, z); C.group.add(a); const b = Md.sprite(Md.mats().glowSprite, 0xff3020, 3, x, yTop + 14, z); C.group.add(b); }
    return s;
  }
  function genCity(C, rnd){
    const Mt = Md.mats();
    // the launch deck where the canyon road meets the bay
    tower(C, 0, 3620, 22, 90, -88, { v: 1, pad: true, h: 140 });
    let z = 3690;
    const plan = ['corridor', 'pad', 'traffic', 'wall1', 'corridor', 'pad', 'split', 'bridges', 'wall2', 'traffic', 'pad', 'split', 'updraft', 'wall1', 'bridges', 'pad', 'traffic', 'wall2', 'corridor', 'pad', 'split', 'traffic', 'wall2', 'pad'];
    let wallSide = -1, introWall = true;
    for (const kind of plan){
      if (z > 7480) break;
      const len = kind.startsWith('wall') ? 170 : kind === 'pad' ? 110 : 150;
      const py = pathY(z + len / 2);
      // side towers forming the corridor (taller than the flight band)
      const sideTowers = (half, z0, z1) => { for (let tz = z0; tz < z1; tz += 34 + rnd() * 20){ for (const s of [-1, 1]){ const w = 14 + rnd() * 10; tower(C, s * (half + w / 2 + rnd() * 6), tz + 14, w, 24 + rnd() * 10, py + 70 + rnd() * 120, { v: (rnd() * 4) | 0, antenna: rnd() < .3 }); } } };
      if (kind === 'corridor'){
        sideTowers(13, z, z + len);
        for (let k = 0; k < 4; k++) item(C, 'ring', (rnd() - .5) * 10, py + rnd() * 6, z + 25 + k * 30);
        item(C, 'cell', (rnd() - .5) * 8, py + 2, z + len * .7);
      } else if (kind === 'pad'){
        sideTowers(18, z, z + len);
        tower(C, 0, z + len / 2, 16, 60, py - 6, { v: 2, pad: true });
        checkpoint(C, z + len / 2 - 20, 0, py - 6, 'pad');
        item(C, 'cell', 0, py - 4, z + len / 2 - 10); item(C, 'orb', 6, py + 3, z + len / 2 + 25);
      } else if (kind === 'traffic'){
        sideTowers(14, z, z + len);
        for (let k = 0; k < 5; k++){
          const car = Md.airCar(); const lane = [-6, 0, 6][(rnd() * 3) | 0], ly = py + [-3, 3, 8][(rnd() * 3) | 0];
          add(C, car.group, lane, ly, z + 30 + k * 26, false);
          C.movers.push({ kind: 'car', x: lane, y: ly, z: z + 30 + k * 26, vz: 20 + rnd() * 8, vx: 0, vy: 0, w: car.w, h: car.h, l: car.l, mesh: car.group, bob: rnd() * 6 });
        }
        item(C, 'orb', 0, py + 12, z + len - 20);
      } else if (kind.startsWith('wall')){
        // a long wall-rideable facade; below it the abyss. ride it, or burn fuel.
        const both = kind === 'wall2';
        for (const s of both ? [-1, 1] : [wallSide]){
          tower(C, s * (10 + 9), z + len / 2, 18, len, py + 160, { v: 3, wall: true, laneY: py });
        }
        if (!both){ for (let tz = z; tz < z + len; tz += 40){ const w = 14; tower(C, -wallSide * (16 + w / 2), tz + 20, w, 28, py + 90 + rnd() * 80, { v: 1 }); } }
        for (let k = 0; k < 5; k++){ const s = both ? (k % 2 ? 1 : -1) : wallSide; item(C, 'ring', s * 8, py + 2, z + 20 + k * 30); }
        if (introWall){ C.signs.push({ z: z - 40, kind: 'wallIntro', side: wallSide }); introWall = false; }
        wallSide = -wallSide;
      } else if (kind === 'split'){
        sideTowers(22, z, z + len);
        tower(C, 0, z + len / 2 + 10, 9, 70, py + 120, { v: 0, antenna: true });
        for (const s of [-1, 1]) for (let k = 0; k < 3; k++) item(C, 'ring', s * 13, py + 1, z + 40 + k * 25);
        item(C, 'cell', 13 * (rnd() < .5 ? -1 : 1), py + 3, z + len - 10);
      } else if (kind === 'bridges'){
        sideTowers(14, z, z + len);
        for (let k = 0; k < 3; k++){
          const by = py + (k % 2 ? 7 : -1), bz = z + 30 + k * 45;
          const b = Md.box(30, 2.4, 6, Md.emat('panel'), 0, by, bz); C.group.add(b); C.cull.push(b);
          C.group.add(Md.box(30, .2, .2, Mt.cyanGlow, 0, by + 1.3, bz - 3)); C.group.add(Md.box(30, .2, .2, Mt.cyanGlow, 0, by - 1.3, bz - 3));
          addSolid(C, { x0: -15, x1: 15, z0: bz - 3, z1: bz + 3, y0: by + 1.2, y1: by + 1.2, yb: by - 1.2, kind: 'bridge' });
          item(C, 'ring', 0, k % 2 ? by - 5 : by + 5, bz);
        }
      } else if (kind === 'updraft'){
        sideTowers(16, z, z + len);
        C.vols.push({ kind: 'updraft', x: 0, z: z + len / 2, r: 8, y0: py - 60, y1: py + 26, lift: 30 });
        const col = updraftMesh(8, 90, 0x58e1f4); add(C, col, 0, py - 60, z + len / 2);
        for (let k = 0; k < 4; k++) item(C, 'ring', 0, py + 6 + k * 5, z + len / 2 + 8 + k * 8);
      }
      if (z > 3800 && ['corridor', 'split', 'traffic'].includes(kind)){ const lz = z + 10; checkpoint(C, lz, 0, pathY(lz) + 2, ''); }
      if (kind !== 'pad') item(C, 'cell', (rnd() - .5) * 6, py + 1, z + len * .45);
      z += len;
    }
    // the summit: a spire, a column of rising air, the gate at the top of the city
    const fz = 7560;
    tower(C, 0, fz, 26, 60, pathY(fz) - 6, { v: 2, pad: true });
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) tower(C, s * (26 + k * 3), fz + 40 + k * 50, 16, 26, 60 + k * 20, { v: k % 4, antenna: true });
    C.vols.push({ kind: 'updraft', x: 0, z: 7740, r: 11, y0: -60, y1: 26, lift: 34, big: true });
    add(C, updraftMesh(11, 110, 0xffcb70), 0, -70, 7740);
    for (let k = 0; k < 6; k++) item(C, 'ring', 0, -20 + k * 7, 7700 + k * 18);
    const g = Md.gate(12, 0x58e1f4); add(C, g, 0, 12, 7900); C.gates.push({ kind: 'exit', x: 0, y: 12, z: 7900, r: 14, mesh: g, done: false });
    C.anim.push(() => { g.rotation.z -= .005; });
    checkpoint(C, 3640, 0, -80, ''); checkpoint(C, fz, 0, pathY(fz) + 2, '');
    // background skyline (instanced), far away on both sides and below
    const N = 260, geo = new THREE.BoxGeometry(1, 1, 1);
    for (let v = 0; v < 4; v++){
      const inst = new THREE.InstancedMesh(geo, Md.emat('facade' + v), N / 4); const m4 = new THREE.Matrix4();
      for (let i = 0; i < N / 4; i++){
        const s = rnd() < .5 ? -1 : 1, x = s * (60 + rnd() * 340), zz = 3500 + rnd() * 4800, w = 16 + rnd() * 30, h = 80 + rnd() * 260;
        m4.compose(new THREE.Vector3(x, -200 + h / 2 + rnd() * 60, zz), new THREE.Quaternion(), new THREE.Vector3(w, h, w)); inst.setMatrixAt(i, m4);
      }
      C.group.add(inst);
    }
    // neon billboards on corridor towers
    for (let i = 0; i < 16; i++){ const zz = 3800 + i * 230 + rnd() * 80, s = rnd() < .5 ? -1 : 1; const b = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), Md.emat('ad' + (i % 6))); b.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; add(C, b, s * 40, pathY(zz) + 14, zz); }
  }
  function updraftMesh(r, h, col){
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32, 1, true).translate(0, h / 2, 0), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { time: Md.flameUniforms.time, col: { value: new THREE.Color(col) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform float time; uniform vec3 col; varying vec2 vUv; void main(){ float s = pow(.5+.5*sin(vUv.y*40. - time*9. + vUv.x*6.28*3.), 6.); float a = (.08 + s*.35) * smoothstep(0., .15, vUv.y) * smoothstep(1., .7, vUv.y); gl_FragColor = vec4(col*a*1.6, a); }' }));
    return m;
  }

  /* ---------- S3 SKY BREAKER ---------- */
  function genSky(C, rnd){
    // rising ring lines & fuel
    for (let z = 8100; z < 12000; z += 150){ const py = pathY(z); const x = (rnd() - .5) * 20; for (let k = 0; k < 3; k++) item(C, 'ring', x + (k - 1) * 2, py + 2 + k, z + k * 18); item(C, 'cell', (rnd() - .5) * 14, py + 1 + rnd() * 4, z + 70); }
    for (let z = 8400; z < 12000; z += 420) item(C, 'orb', (rnd() - .5) * 24, pathY(z) - 4 + rnd() * 6, z);
    // tornadoes: lift + turbulence (warned ahead)
    const tz = [8600, 9150, 9800, 10400, 11100, 11700];
    tz.forEach((z, i) => {
      const x = (i % 2 ? 1 : -1) * (6 + rnd() * 8), py = pathY(z), r = 9;
      C.vols.push({ kind: 'tornado', x, z, r, y0: py - 50, y1: py + 55, lift: 36, swirl: 1 });
      const m = Md.tornado(r, 140); add(C, m, x, py - 60, z);
      C.anim.push(dt => { m.rotation.y += .03; });
      for (let k = 0; k < 4; k++) item(C, 'ring', x, py + 18 + k * 9, z + 6 + k * 4);
      C.signs.push({ z: z - 260, kind: 'tornado', x });
    });
    // thunderclouds: lightning columns with a readable warning
    for (let z = 9300, i = 0; z < 11800; z += 330, i++){
      const x = ((i * 7) % 3 - 1) * 12 + (rnd() - .5) * 6, py = pathY(z) + 14;
      const cl = Md.cloudCluster(9, 26, 22, 0x6a6a90); add(C, cl, x, py + 10, z);
      C.storms.push({ x, z, r: 9, y: py, mesh: cl });
      C.bolts.push({ x, z, r: 7, top: py + 6, period: 3.2 + rnd() * 1.6, phase: rnd() * 3, warn: 1.1, mesh: null, state: 0 });
    }
    // gravity gates (reused in the cosmos): flip to reach the upper lane
    for (const z of [10650, 11350]){
      const py = pathY(z); const g = Md.gate(7, 0xb48cff); add(C, g, 0, py, z);
      const ar = Md.arrowMesh(0xb48cff, 2.2); ar.rotation.y = Math.PI; add(C, ar, 0, py, z - .5);
      C.gates.push({ kind: 'gravity', x: 0, y: py, z, r: 7.5, mesh: g, done: false, dur: 4.5 });
      for (let k = 0; k < 8; k++) item(C, 'ring', 0, py + 26 + Math.sin(k / 7 * Math.PI) * 14, z + 30 + k * 20);
      // a storm wall in the lower lane
      for (let k = 0; k < 3; k++){ const cl = Md.cloudCluster(8, 30, 26, 0x50507a); const sx = (k - 1) * 18; add(C, cl, sx, py + 4, z + 120); C.storms.push({ x: sx, z: z + 120, r: 10, y: py, mesh: cl }); C.bolts.push({ x: sx, z: z + 120, r: 8, top: py + 8, period: 2.6 + k * .5, phase: k, warn: 1.1, state: 0 }); }
    }
    // sunbreak: the golden column to the stratosphere
    C.vols.push({ kind: 'updraft', x: 0, z: 12360, r: 14, y0: 100, y1: 196, lift: 38, big: true, gold: true });
    add(C, updraftMesh(14, 110, 0xffcb70), 0, 95, 12360);
    for (let k = 0; k < 8; k++) item(C, 'ring', 0, 150 + k * 6, 12290 + k * 22);
    const g = Md.gate(14, 0xffcb70); add(C, g, 0, 192, 12640); C.gates.push({ kind: 'exit', x: 0, y: 192, z: 12640, r: 16, mesh: g, done: false });
    C.anim.push(() => { g.rotation.z += .004; });
    // scenic cloud towers
    for (let i = 0; i < 40; i++){ const z = 8000 + i * 120 + rnd() * 60, s = rnd() < .5 ? -1 : 1; const cl = Md.cloudCluster(7, 60, 60, i % 3 ? 0xb8b8e0 : 0x8888b8); add(C, cl, s * (60 + rnd() * 200), pathY(z) - 20 + rnd() * 60, z); }
    for (const z of [8020, 8800, 9600, 10300, 11000, 11900]) checkpoint(C, z, 0, pathY(z) + 2, '');
  }

  /* ---------- S4 COSMIC ODYSSEY ---------- */
  function genCosmos(C, rnd){
    const beacons = [[13900, 18, 6], [14700, -20, -10], [15550, 0, 26], [16350, 22, 4], [17150, -16, 12]];
    beacons.forEach(([z, x, dy], i) => item(C, 'beacon', x, 200 + dy, z, { idx: i }));
    // asteroid fields: drifting, rotating rocks
    for (let z = 13500; z < 17500; z += 26){
      if (rnd() < .38) continue;
      const x = (rnd() - .5) * 80, y = 200 + (rnd() - .5) * 60, r = 1.5 + rnd() * 4.2;
      const m = Md.asteroid((z | 0) % 6); m.scale.setScalar(r); add(C, m, x, y, z);
      C.movers.push({ kind: 'rock', x, y, z, vx: (rnd() - .5) * 3, vy: (rnd() - .5) * 2, vz: 0, r: r * .9, mesh: m, spin: [(rnd() - .5) * 1.4, (rnd() - .5) * 1.4] });
    }
    // energy orbs on the safe line
    for (let z = 13400; z < 17600; z += 380) item(C, 'orb', (rnd() - .5) * 14, 200 + (rnd() - .5) * 10, z);
    for (let z = 13600; z < 17600; z += 520) item(C, 'cell', (rnd() - .5) * 20, 200 + (rnd() - .5) * 14, z);
    // gravity gates reused (to reach the high beacon)
    for (const z of [15300, 16700]){ const g = Md.gate(7, 0xb48cff); add(C, g, 0, 200, z); const ar = Md.arrowMesh(0xb48cff, 2.2); ar.rotation.y = Math.PI; add(C, ar, 0, 200, z - .5); C.gates.push({ kind: 'gravity', x: 0, y: 200, z, r: 7.5, mesh: g, done: false, dur: 5 }); }
    // route choice gates
    const big = Md.asteroid(2); big.scale.setScalar(12); add(C, big, 0, 200, 17720); C.movers.push({ kind: 'rock', x: 0, y: 200, z: 17720, vx: 0, vy: 0, vz: 0, r: 11, mesh: big, spin: [.1, .05], fixed: true });
    const A = Md.gate(10, 0xff6a62); add(C, A, 17, 200, 17760); C.gates.push({ kind: 'route', route: 'steep', x: 17, y: 200, z: 17760, r: 11, mesh: A, done: false });
    const B = Md.gate(10, 0x58e1f4); add(C, B, -17, 200, 17760); C.gates.push({ kind: 'route', route: 'gentle', x: -17, y: 200, z: 17760, r: 11, mesh: B, done: false });
    const sA = signBoard('急降下 · HOT', 'red'); add(C, sA, 17, 213, 17758); const sB = signBoard('緩降下 · SAFE', 'blue'); add(C, sB, -17, 213, 17758);
    C.signs.push({ z: 17350, kind: 'route' });
    for (const z of [12800, 13900, 14800, 15650, 16450, 17250]) checkpoint(C, z, 0, 200, '');
  }

  /* ---------- S5 EARTH RETURN ---------- */
  function genReentry(C, rnd){
    // corridor guide rings follow the path (rebuilt when the route is chosen)
    const Mt = Md.mats();
    C.corridor = new THREE.Group(); C.group.add(C.corridor);
    buildCorridor(C);
    // home plateau at dawn: fields, the road you started on, a landing pad
    ribbon(C, flat(21300, 23400, 0, 20), 46, { kind: 'home', home: true, lights: false, skirt: 200 });
    ribbon(C, flat(21900, 23400, .05, 20), 8, { kind: 'home', home: true });
    const pad = new THREE.Mesh(new THREE.CircleGeometry(16, 48).rotateX(-Math.PI / 2), Md.emat('homePad')); add(C, pad, 0, .12, 22250, false);
    for (let k = 0; k < 12; k++){ const a = k / 12 * Math.PI * 2; const l = Md.sprite(Mt.glowSprite, 0xffcb70, 4, Math.cos(a) * 17, .6, 22250 + Math.sin(a) * 17); C.group.add(l); }
    C.homePad = { x: 0, z: 22250, r: 16 };
    for (let i = 0; i < 36; i++){ const z = 21000 + i * 70 + rnd() * 40, s = rnd() < .5 ? -1 : 1, d = 80 + rnd() * 300; const m = Md.mesa(i); const w = 25 + rnd() * 50, h = 50 + rnd() * 140; m.scale.set(w, h, w); add(C, m, s * d, -60 + h / 2, z); }
    for (let i = 0; i < 18; i++){ const b = Md.boulder(i); b.scale.setScalar(1 + rnd() * 2); add(C, b, (rnd() < .5 ? -1 : 1) * (50 + rnd() * 40), .5, 21400 + rnd() * 1900); }
    // waiting lights of home (lighthouse-like beacon)
    const tower = Md.box(2.4, 18, 2.4, Mt.darkMetal, 24, 9, 22330); C.group.add(tower);
    const lamp = Md.sprite(Mt.glowSprite, 0xffe0a0, 16, 24, 19, 22330); C.group.add(lamp); C.homeLamp = lamp;
    for (let z = 18400; z < 21200; z += 260) item(C, 'cell', (rnd() - .5) * 10, pathY(z), z);
    for (let z = 18200; z < 21300; z += 300) item(C, 'orb', (rnd() - .5) * 16, pathY(z) + (rnd() - .5) * 6, z);
    for (const z of [17920, 18800, 19700, 20500, 21250]) checkpoint(C, z, 0, pathY(z) + 2, '');
  }
  function buildCorridor(C){
    if (!C || !C.corridor) return;
    while (C.corridor.children.length) C.corridor.remove(C.corridor.children[0]);
    C.items.forEach(i => { if (i.kind === 'ring' && i.mesh.parent) i.mesh.parent.remove(i.mesh); });
    C.cull = C.cull.filter(o => !(o.userData && o.userData.corridorRing));
    C.items = C.items.filter(i => i.kind !== 'ring');
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(routeSteep ? 0xff8a5a : 0x58e1f4).multiplyScalar(2), transparent: true, opacity: .55, depthWrite: false });
    const geo = new THREE.TorusGeometry(9, .12, 6, 48);
    for (let z = 18100; z < 21600; z += 130){
      const r = new THREE.Mesh(geo, mat); r.position.set(0, pathY(z), z); C.corridor.add(r);
      if ((z / 130 | 0) % 3 === 0){ const it = item(C, 'ring', 0, pathY(z), z + 6); it.mesh.userData.corridorRing = true; }
    }
  }

  /* ---------- build / stream / reset ---------- */
  const GENS = [genCliff, genCity, genSky, genCosmos, genReentry];
  function build(ci){
    if (ci < 0 || ci >= CHAPTERS.length || built[ci]) return;
    const C = makeContent(ci);
    GENS[ci](C, T.mulberry32(1000 + ci * 77));
    C.checkpoints.sort((a, b) => a.z - b.z);
    roots.add(C.group); built[ci] = C;
  }
  function disposeChapter(ci){
    const C = built[ci]; if (!C) return;
    roots.remove(C.group);
    C.group.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    built[ci] = null;
  }
  function reset(startCi){
    for (let i = 0; i < CHAPTERS.length; i++) disposeChapter(i);
    routeSteep = false;
    build(startCi);
    if (startCi + 1 < CHAPTERS.length) build(startCi + 1);
  }
  // keep the current chapter and the next one ready; free what is far behind
  function stream(z){
    const ci = chapterAt(z);
    build(ci);
    if (z > CHAPTERS[ci].z1 - 1000) build(ci + 1);
    for (let i = 0; i < ci; i++) if (built[i] && z > CHAPTERS[i].z1 + 500) disposeChapter(i);
  }
  function setRoute(steep){ routeSteep = steep; if (built[4]) buildCorridor(built[4]); }

  function boundsAt(z){
    const ci = chapterAt(z), py = pathY(z);
    if (ci === 0){
      const ref = z < 1620 ? (z > 1024 && z < 1300 ? 3 : 0) : CANYON_Y;
      const jumping = z > 1560 && z < 2000;
      return { xl: z < 1600 ? 8.4 : 12, kill: (jumping ? CANYON_Y : ref) - 34, ceil: jumping ? LIP_Y + 18 : ref + 15, soft: false, ref };
    }
    if (ci === 1) return { xl: 34, kill: py - 52, ceil: py + 30, soft: false, ref: py };
    if (ci === 2) return { xl: 40, kill: cloudY(z) - 22, ceil: py + 34, soft: false, ref: py };
    if (ci === 3) return { xl: 46, kill: -1e5, ceil: py + 40, floor: py - 40, soft: true, ref: py };
    return { xl: z > 21300 ? 44 : 42, kill: -1e5, ceil: py + 26, floor: z > 21300 ? -10 : py - 42, soft: true, ref: py };
  }
  // physics blended across chapter boundaries
  const PB = {};
  function physAt(z){
    const ci = chapterAt(z), A = CHAPTERS[ci].phys;
    const nb = ci + 1 < CHAPTERS.length ? CHAPTERS[ci + 1] : null;
    const t = nb ? smooth(nb.z0 - 200, nb.z0 + 200, z) : 0;
    const B = nb ? nb.phys : A;
    for (const k in A) PB[k] = lerp(A[k], B[k], t);
    // the cosmos starts a little after the stratosphere gate
    return PB;
  }
  function speedAt(z){
    const ci = chapterAt(z), base = CHAPTERS[ci].speed;
    if (ci === 0){ if (z < 200) return 30 + z * .03; if (z > 1450 && z < 1620) return base + 4; }
    if (ci === 4){ if (z > 21300) return lerp(base, 30, smooth(21300, 21900, z)); return base * (routeSteep ? 1.12 : 1); }
    return base;
  }

  /* ---------- per-frame: animate, cull, environment ---------- */
  let time = 0;
  const camTmp = new THREE.Vector3();
  function update(dt, z, simDt){
    time += dt; skyMat.uniforms.time.value = time; cloudMat.uniforms.time.value = time;
    for (const C of built){
      if (!C) continue;
      for (const f of C.anim) f(dt);
      for (const m of C.movers){
        if (m.fixed){ m.mesh.rotation.x += m.spin[0] * simDt; continue; }
        m.z += m.vz * simDt; m.x += m.vx * simDt; m.y += m.vy * simDt;
        if (m.kind === 'car'){ m.bob += simDt; m.mesh.position.set(m.x, m.y + Math.sin(m.bob * 2) * .2, m.z); m.mesh.rotation.z = Math.sin(m.bob) * .04; }
        else { m.mesh.position.set(m.x, m.y, m.z); m.mesh.rotation.x += m.spin[0] * simDt; m.mesh.rotation.y += m.spin[1] * simDt; }
      }
      for (const it of C.items){
        if (it.got) continue; const m = it.mesh;
        if (it.kind === 'ring') m.rotation.z += dt * .8;
        else if (it.kind === 'cell'){ m.rotation.y += dt * 2; m.position.y = it.y + Math.sin(time * 2 + it.z) * .25; }
        else if (it.kind === 'orb'){ m.rotation.y += dt * 3; m.position.y = it.y + Math.sin(time * 3 + it.z) * .3; }
        else if (it.kind === 'beacon'){ m.rotation.y += dt * .6; m.children.forEach((c, i) => { if (c.geometry && c.geometry.type === 'TorusGeometry'){ c.rotation.x += dt * (.4 + i * .2); } }); }
      }
      // distance culling keeps draw calls down on phones
      for (const o of C.cull){ const d = o.position.z - z; o.visible = d > -120 && d < 1100; }
    }
  }
  function env(z, cam){
    const sd = setAtmo(z);
    sky.position.copy(cam);
    // sea of clouds
    const cy = cloudY(z);
    const u = cloudMat.uniforms; u.cam.value.copy(cam);
    cloud.position.set(cam.x, cy === null ? -9999 : cy, cam.z);
    const want = cy === null ? 0 : 1;
    u.opacity.value += (want - u.opacity.value) * .05;
    cloud.visible = u.opacity.value > .01;
    u.storm.value = z > 8200 && z < 12000 ? 1 : 0;
    u.sunCol.value.copy(skyMat.uniforms.sunCol.value);
    const dark = z > 3700 && z < 7900 ? 1 : (z > 8200 && z < 11900 ? .6 : 0);
    u.top.value.copy(skyMat.uniforms.hor.value).lerp(cB.setHex(0xffffff), .6 - dark * .5); if (dark) u.top.value.multiplyScalar(1 - dark * .45);
    u.bot.value.copy(skyMat.uniforms.mid.value).lerp(cB.setHex(0x9a96aa), .5);
    if (cy !== null && cloud.visible){
      const inside = 1 - smooth(6, 40, Math.abs(cam.y - cy));
      if (inside > 0){ scene.fog.color.lerp(cB.setHex(0xe8e4ee), inside * .9); scene.fog.near = scene.fog.near * (1 - inside) + 2 * inside; scene.fog.far = scene.fog.far * (1 - inside) + 90 * inside; }
    }
    // the planet below
    const eo = earthOffset(z);
    earthG.visible = eo !== null;
    if (eo !== null){
      earthG.position.set(cam.x + 300, cam.y + eo - 2400, cam.z + 900);
      earthG.rotation.y = time * .004 + z * .00002; earthG.userData.cl.rotation.y = time * .002;
      const re = z > 18600 ? smooth(18600, 19400, z) : 0;
      earthG.userData.atm.material.uniforms.uRimColor.value.setHex(re > .5 ? 0xff9a50 : 0x5ab8ff);
    }
    return sd;
  }

  return {
    CHAPTERS, TOTAL, ATMO, init, setShadowSize, reset, stream, build, update, env, setAtmo, chapterAt, pathY, boundsAt, physAt, speedAt, solidsNear, topAt, setRoute,
    get built(){ return built; }, get sun(){ return sun; }, get sky(){ return sky; }, get routeSteep(){ return routeSteep; }, LIP_Z, LIP_Y, CANYON_Y, cloudY,
  };
})();
