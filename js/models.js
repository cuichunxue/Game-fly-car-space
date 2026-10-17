/* ============================================================
 * THRUST ROADSTER — TENMA EDITION · 3D models (all procedural geometry)
 * 車両はオリジナル意匠：ウェッジ型の飛行GT、発光するツインリフトフィン、
 * 三角形のテールランプ、X字のリアスタビライザー、分割キャノピー。
 * ============================================================ */
window.TR = window.TR || {};
TR.Models = (() => {
  'use strict';
  const T = TR.Tex;
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const bump = (t, c, s) => Math.exp(-((t - c) * (t - c)) / (2 * s * s));
  const spow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
  // cosine-smoothed piecewise curve through [t, value] points
  const curve = pts => t => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++){
      if (t <= pts[i][0]){ const [t0, v0] = pts[i - 1], [t1, v1] = pts[i]; const k = (t - t0) / (t1 - t0); const s = (1 - Math.cos(k * Math.PI)) / 2; return v0 + (v1 - v0) * s; }
    }
    return pts[pts.length - 1][1];
  };

  /* Loft: sweeps a superellipse cross-section along z.
   * prof(t) -> { w: half width, yb: bottom, yt: top, p: exponent, tuck: top narrowing } */
  function loft(z0, z1, prof, n = 56, m = 36, capR = .025, capF = .05){
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++){
      const t = i / n, z = z0 + (z1 - z0) * t;
      const P = prof(t);
      const fr = Math.pow(Math.min(1, t / capR), .5), ff = Math.pow(Math.min(1, (1 - t) / capF), .5);
      const f = Math.max(.001, Math.min(fr, ff));
      const yc = (P.yb + P.yt) / 2, hh = (P.yt - P.yb) / 2 * f, w = P.w * f, p = P.p || .5;
      for (let j = 0; j <= m; j++){
        const a = j / m, th = -Math.PI / 2 + a * Math.PI * 2;
        const c = Math.cos(th), s = Math.sin(th);
        const sy = spow(s, p);
        const tuck = 1 - (P.tuck || 0) * Math.max(0, sy);
        pos.push(w * spow(c, p) * tuck, yc + hh * sy, z);
        uv.push(t, a);
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++){
      const a = i * (m + 1) + j, b = a + m + 1, c = a + 1, d = b + 1;
      idx.push(a, c, b, c, d, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  /* ---------- shared materials ---------- */
  let M = null;
  function mats(){
    if (M) return M;
    const road = T.road(), glow = T.glow();
    M = {
      road: new THREE.MeshStandardMaterial({ map: road.map, normalMap: road.normalMap, roughnessMap: road.roughnessMap, roughness: .92, metalness: .05, normalScale: new THREE.Vector2(.5, .5), envMapIntensity: .5 }),
      concrete: new THREE.MeshStandardMaterial({ map: T.concrete(), roughness: .88, metalness: 0, envMapIntensity: .3 }),
      hazard: new THREE.MeshStandardMaterial({ map: T.hazard(), roughness: .6, emissive: 0x332200, emissiveIntensity: .5 }),
      chevron: new THREE.MeshStandardMaterial({ map: T.chevron(), emissiveMap: T.chevron(), emissive: 0xffffff, emissiveIntensity: .3, roughness: .7 }),
      rail: new THREE.MeshStandardMaterial({ color: 0x8a929c, metalness: .85, roughness: .38, envMapIntensity: .7 }),
      railGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9a3c).multiplyScalar(1.4) }),
      cyanGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x63fff0).multiplyScalar(2.5) }),
      pinkGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4fd8).multiplyScalar(2.5) }),
      whiteGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4e0).multiplyScalar(5) }),
      redGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a1a).multiplyScalar(4) }),
      brakeGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3a22).multiplyScalar(10) }),
      amberGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa020).multiplyScalar(3.5) }),
      darkMetal: new THREE.MeshStandardMaterial({ color: 0x2a2c33, metalness: .8, roughness: .35 }),
      pole: new THREE.MeshStandardMaterial({ color: 0x3c4048, metalness: .7, roughness: .45 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x0b1724, metalness: .2, roughness: .04, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 2.2, reflectivity: 1 }),
      tire: new THREE.MeshStandardMaterial({ map: T.tire(), roughness: .9, metalness: 0 }),
      rim: new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 1, roughness: .18, envMapIntensity: 1.6 }),
      carbon: new THREE.MeshStandardMaterial({ map: T.carbon(), metalness: .4, roughness: .35, envMapIntensity: 1.2 }),
      caliper: new THREE.MeshStandardMaterial({ color: 0xff3b2f, roughness: .4, metalness: .3 }),
      nozzle: new THREE.MeshStandardMaterial({ color: 0x8a8f99, metalness: 1, roughness: .22, envMapIntensity: 1.4 }),
      ring: new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa020, emissiveIntensity: 2.2, metalness: .8, roughness: .25 }),
      ringHot: new THREE.MeshStandardMaterial({ color: 0xbaffff, emissive: 0x5cf6ff, emissiveIntensity: 3, metalness: .8, roughness: .25 }),
      cellGlass: new THREE.MeshPhysicalMaterial({ color: 0x9fe8ff, metalness: 0, roughness: .05, transparent: true, opacity: .35, clearcoat: 1, envMapIntensity: 2, depthWrite: false }),
      cellCore: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4fd8ff).multiplyScalar(3) }),
      glowSprite: new THREE.SpriteMaterial({ map: glow, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    return M;
  }
  function sprite(mat, color, size, x = 0, y = 0, z = 0){
    const m = mat.clone(); m.color = new THREE.Color(color);
    const s = new THREE.Sprite(m); s.scale.set(size, size, 1); s.position.set(x, y, z); return s;
  }
  function flareSprite(color, w, h){
    const m = new THREE.SpriteMaterial({ map: T.flare(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const s = new THREE.Sprite(m); s.scale.set(w, h, 1); return s;
  }
  function box(w, h, l, mat, x = 0, y = 0, z = 0){ const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat); m.position.set(x, y, z); return m; }

  /* ---------- flame shader ---------- */
  const flameUniforms = { time: { value: 0 } };
  function flameMaterial(colA, colB){
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { time: flameUniforms.time, colA: { value: new THREE.Color(colA) }, colB: { value: new THREE.Color(colB) }, power: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.); vec3 n = normalize(normalMatrix * normal); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float time; uniform vec3 colA; uniform vec3 colB; uniform float power; varying vec2 vUv; varying float vF;
        float h(float n){ return fract(sin(n)*43758.5453); }
        void main(){
          float v = vUv.y;
          float flick = .78 + .22*sin(time*70. + vUv.x*31.4) * sin(time*43. + v*12.);
          float shock = .65 + .35*sin(v*38. - time*90.);
          float a = pow(1.-v, 1.4) * pow(vF, 1.6) * flick * mix(1., shock, .35) * power;
          vec3 c = mix(colA, colB, smoothstep(0., .8, v));
          gl_FragColor = vec4(c * a * 2.4, a);
        }`
    });
  }
  function flameCone(r, h, colA, colB){
    const g = new THREE.ConeGeometry(r, h, 18, 8, true); g.rotateX(Math.PI); g.translate(0, -h / 2, 0);
    const m = new THREE.Mesh(g, flameMaterial(colA, colB)); m.frustumCulled = false; m.renderOrder = 5;
    return m;
  }

  /* ---------- player car ---------- */
  function wheel(radius = .36, width = .3, opts = {}){
    const Mt = mats(); const g = new THREE.Group();
    // tire: lathe of rounded rectangle profile around y, then turned to x axis
    const pr = []; const rw = width / 2, ri = radius * .66;
    for (let k = 0; k <= 12; k++){ const a = -Math.PI / 2 + k / 12 * Math.PI; pr.push(new THREE.Vector2(radius - .06 + Math.cos(a) * .06, Math.sin(a) * rw)); }
    pr.unshift(new THREE.Vector2(ri, -rw)); pr.push(new THREE.Vector2(ri, rw));
    const tg = new THREE.LatheGeometry(pr, 40); tg.rotateZ(Math.PI / 2);
    const tire = new THREE.Mesh(tg, Mt.tire); tire.castShadow = true; g.add(tire);
    const rimG = new THREE.CylinderGeometry(ri, ri, width * .9, 28); rimG.rotateZ(Math.PI / 2);
    g.add(new THREE.Mesh(rimG, Mt.darkMetal));
    // spokes on outer face
    const sp = new THREE.Group(); const side = opts.side || 1;
    for (let k = 0; k < 5; k++){
      const s = box(.03, ri * 1.9, .07, Mt.rim); s.rotation.x = k / 5 * Math.PI; s.position.x = side * width * .47; sp.add(s);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .05, 12).rotateZ(Math.PI / 2), Mt.rim); hub.position.x = side * width * .5; sp.add(hub);
    g.add(sp);
    if (opts.glow){
      const ringG = new THREE.TorusGeometry(ri * .88, .022, 6, 36); ringG.rotateY(Math.PI / 2);
      const glowRing = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0x63fff0, transparent: true, opacity: 0 }));
      glowRing.position.x = side * width * .48; g.add(glowRing); g.userData.glowRing = glowRing;
    }
    return g;
  }


  /* ---------- the hero vehicle: TENMA ---------- */
  function playerCar(paintKey){
    const Mt = mats();
    const root = new THREE.Group(), inner = new THREE.Group(); root.add(inner);
    const z0 = -2.3, z1 = 2.4;
    // wedge: low sharp nose rising to a high tail deck
    const top = curve([[0, .78], [.08, .9], [.25, .92], [.42, .86], [.6, .74], [.78, .6], [.92, .46], [1, .34]]);
    const prof = t => ({
      w: .9 + .07 * bump(t, .18, .07) + .05 * bump(t, .74, .08) - .3 * smooth(.82, 1, t) - .05 * (1 - smooth(0, .08, t)),
      yb: .22 + .05 * smooth(.9, 1, t) + .04 * (1 - smooth(0, .06, t)),
      yt: top(t), p: .36, tuck: .28,
    });
    const bodyMat = new THREE.MeshPhysicalMaterial({ map: T.livery(paintKey), metalness: .6, roughness: .22, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 1.5, emissive: 0xff9a20, emissiveIntensity: 0 });
    const body = new THREE.Mesh(loft(z0, z1, prof), bodyMat); body.castShadow = true; inner.add(body);
    // split glass canopy: two teardrops separated by a spine
    for (const s of [-1, 1]){
      const ctop = curve([[0, .78], [.3, 1.08], [.6, 1.1], [.9, .95], [1, .78]]);
      const g = loft(-.9, .95, t => ({ w: .27 - .05 * Math.abs(t - .45), yb: .7, yt: ctop(t), p: .55, tuck: .3 }), 28, 20, .14, .2);
      const c = new THREE.Mesh(g, Mt.glass); c.position.x = s * .29; c.castShadow = true; inner.add(c);
    }
    inner.add(box(.06, .07, 1.8, Mt.cyanGlow, 0, 1.1, 0));
    // sculpted underside intakes
    for (const s of [-1, 1]){
      const intake = box(.34, .1, .9, Mt.carbon, s * .55, .22, .9); intake.rotation.x = .08; inner.add(intake);
      inner.add(box(.3, .02, .7, Mt.cyanGlow, s * .55, .18, .9));
      inner.add(box(.025, .025, 3.2, Mt.cyanGlow, s * .93, .26, .1));
    }
    // X-shaped illuminated rear stabilizers
    const stab = new THREE.Group(); stab.position.set(0, .82, -2.05); inner.add(stab);
    for (const a of [.62, -.62, Math.PI - .62, Math.PI + .62]){
      const fin = new THREE.Group(); fin.rotation.z = a;
      const blade = box(.05, .62, .5, Mt.carbon, 0, .31, 0); blade.rotation.x = -.35; fin.add(blade);
      const edge = box(.06, .6, .05, Mt.cyanGlow, 0, .32, -.2); edge.rotation.x = -.35; fin.add(edge);
      stab.add(fin);
    }
    // twin luminous lift fins (fold flat on the ground, deploy in flight)
    const fins = [];
    for (const s of [-1, 1]){
      const pivot = new THREE.Group(); pivot.position.set(s * .95, .52, -.2); inner.add(pivot);
      const sh = new THREE.Shape(); sh.moveTo(0, -.9); sh.lineTo(1.5, -.2); sh.lineTo(1.55, .25); sh.lineTo(0, .9); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: .05, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.translate(0, 0, 0);
      const m = new THREE.Mesh(g, Mt.carbon); m.scale.x = s; pivot.add(m);
      const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x58e1f4).multiplyScalar(2.5), transparent: true, opacity: .0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const gs = new THREE.Shape(); gs.moveTo(.1, -.7); gs.lineTo(1.45, -.12); gs.lineTo(1.45, .12); gs.lineTo(.1, .7); gs.closePath();
      const gg = new THREE.ShapeGeometry(gs); gg.rotateX(-Math.PI / 2);
      const gm = new THREE.Mesh(gg, glowM); gm.scale.x = s; gm.position.y = .04; pivot.add(gm);
      const tip = sprite(Mt.glowSprite, 0x58e1f4, 1.2, s * 1.5, .05, 0); tip.material.opacity = 0; pivot.add(tip);
      pivot.scale.set(.25, 1, .9);
      fins.push({ pivot, glow: glowM, tip, side: s });
    }
    // lights: thin wedge headlights, triangular tail-light language
    for (const s of [-1, 1]){
      const hl = box(.5, .04, .05, Mt.whiteGlow, s * .48, .46, 2.3); hl.rotation.y = s * -.35; inner.add(hl);
      const f = flareSprite(0xcfe8ff, 2.2, .3); f.material.opacity = .7; f.position.set(s * .5, .46, 2.45); inner.add(f);
      const tri = new THREE.Shape(); tri.moveTo(0, 0); tri.lineTo(.42, .1); tri.lineTo(.1, .24); tri.closePath();
      const tl = new THREE.Mesh(new THREE.ShapeGeometry(tri), Mt.redGlow); tl.position.set(s * .25, .58, -2.31); tl.rotation.y = Math.PI; tl.scale.x = -s; inner.add(tl);
    }
    const tailF = flareSprite(0xff3020, 2.2, .3); tailF.material.opacity = .8; tailF.position.set(0, .64, -2.4); inner.add(tailF);
    // rear thrusters (boost)
    const boosts = [];
    for (const s of [-1, 1]){
      const nz = new THREE.Mesh(new THREE.CylinderGeometry(.16, .2, .3, 20, 1, true).rotateX(Math.PI / 2), Mt.nozzle); nz.position.set(s * .5, .44, -2.3); inner.add(nz);
      const core = new THREE.Mesh(new THREE.CircleGeometry(.14, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x58e1f4), side: THREE.DoubleSide })); core.position.set(s * .5, .44, -2.24); core.rotation.y = Math.PI; inner.add(core);
      const fl = flameCone(.16, 2.8, 0xe8fbff, 0x3a6bff); fl.rotation.x = Math.PI / 2; fl.position.set(s * .5, .44, -2.4); inner.add(fl);
      boosts.push({ flame: fl, core });
    }
    // wheels that fold into hover jets
    const wheels = [];
    for (const [z, s] of [[-1.4, 1], [-1.4, -1], [1.45, 1], [1.45, -1]]){
      const pivot = new THREE.Group(); pivot.position.set(s * .92, .36, z); inner.add(pivot);
      const spin = wheel(.36, .3, { side: s, glow: true }); pivot.add(spin);
      const jet = flameCone(.26, 2.4, 0xeafcff, 0x2fb8ff); jet.position.set(0, -.04, 0); pivot.add(jet);
      wheels.push({ pivot, spin, jet, side: s, z, glowRing: spin.userData.glowRing });
    }
    // amber rescue aura + energy shield (emergency boost)
    const aura = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.scale.set(1.7, 1, 3); aura.position.y = .55; inner.add(aura);
    const shieldMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { col: { value: new THREE.Color(0x58e1f4) }, a: { value: 0 }, time: flameUniforms.time },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 col; uniform float a, time; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(1.-max(dot(vN,vV),0.),2.5); float hex = .7+.3*sin(gl_FragCoord.y*.35+time*8.); gl_FragColor = vec4(col*rim*hex*2., rim*a); }' });
    const shield = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), shieldMat); shield.scale.set(1.8, 1.2, 3.2); shield.position.y = .55; shield.visible = false; inner.add(shield);
    // reentry plasma shell (uses the kit plasma texture when available)
    const pt = T.plasma(); pt.wrapS = pt.wrapT = THREE.RepeatWrapping;
    const plasmaMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { map: { value: pt }, time: flameUniforms.time, heat: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.); vec3 n = normalize(normalMatrix*normal); vF = 1.-abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform sampler2D map; uniform float time, heat; varying vec2 vUv; varying float vF; void main(){ vec3 t = texture2D(map, vec2(vUv.x*2., vUv.y*1.5 - time*1.6)).rgb; float front = smoothstep(.2, 1., vUv.y); float a = (t.r*.8+.2) * heat * (.35+vF) * front; vec3 c = mix(vec3(1.,.35,.08), vec3(1.,.85,.6), t.r) * 2.2; gl_FragColor = vec4(c*a, a); }' });
    const pg = new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI * .62); pg.rotateX(Math.PI / 2);
    const plasma = new THREE.Mesh(pg, plasmaMat); plasma.scale.set(1.9, 1.4, 3.6); plasma.position.set(0, .5, .2); plasma.visible = false; plasma.renderOrder = 7; inner.add(plasma);
    // headlight + underglow
    const spot = new THREE.SpotLight(0xfff1d6, 2.6, 70, .5, .55, 1.4); spot.position.set(0, .7, 1.8); spot.target.position.set(0, -.6, 22); inner.add(spot); inner.add(spot.target);
    const under = new THREE.PointLight(0x58e1f4, 0, 10, 1.6); under.position.set(0, -.3, 0); inner.add(under);
    root.userData = { inner, wheels, boosts, spot, under, bodyMat, body, fins, aura, shield, shieldMat, plasma, plasmaMat };
    return root;
  }
  function setPaint(car, key){ const m = car.userData.bodyMat; m.map = T.livery(key); m.needsUpdate = true; }

  /* ---------- city air traffic: hover pods ---------- */
  let podGeo = null;
  const podColors = [0xc9ccd1, 0x1b1d22, 0x8a1c22, 0x2f4f7a, 0xe3e1da, 0xd0a03a, 0x6a3fa0, 0x2a8a7a];
  const podMats = {};
  function airCar(){
    const Mt = mats();
    if (!podGeo){
      const top = curve([[0, .7], [.2, .95], [.8, .95], [1, .6]]);
      podGeo = {
        body: loft(-2.1, 2.1, t => ({ w: .95 - .25 * smooth(.8, 1, t) - .2 * (1 - smooth(0, .15, t)), yb: .2 + .1 * smooth(.85, 1, t), yt: top(t), p: .45, tuck: .2 }), 28, 20, .05, .08),
        cabin: loft(-1.1, 1.0, t => ({ w: .72, yb: .85, yt: 1.3 - .25 * Math.abs(t - .5) * 2, p: .5, tuck: .3 }), 16, 16, .15, .2),
        pods: THREE.BufferGeometryUtils.mergeBufferGeometries([-1, 1].map(s => new THREE.CylinderGeometry(.28, .32, 1.4, 14).rotateX(Math.PI / 2).translate(s * 1.05, .35, 0))),
        tails: THREE.BufferGeometryUtils.mergeBufferGeometries([new THREE.BoxGeometry(.5, .08, .05).translate(-.5, .7, -2.12), new THREE.BoxGeometry(.5, .08, .05).translate(.5, .7, -2.12)]),
        glow: THREE.BufferGeometryUtils.mergeBufferGeometries([-1, 1].map(s => new THREE.CircleGeometry(.25, 14).rotateX(Math.PI / 2).translate(s * 1.05, -.36, 0))),
      };
    }
    const col = podColors[(Math.random() * podColors.length) | 0];
    const mat = podMats[col] || (podMats[col] = new THREE.MeshPhysicalMaterial({ color: col, metalness: .55, roughness: .3, clearcoat: .8, envMapIntensity: 1.1 }));
    const g = new THREE.Group();
    g.add(new THREE.Mesh(podGeo.body, mat)); g.add(new THREE.Mesh(podGeo.cabin, Mt.glass)); g.add(new THREE.Mesh(podGeo.pods, Mt.darkMetal));
    g.add(new THREE.Mesh(podGeo.tails, Mt.redGlow)); g.add(new THREE.Mesh(podGeo.glow, Mt.cyanGlow));
    for (const s of [-1, 1]){ const f = flareSprite(0xff2a1a, 2, .4); f.position.set(s * .5, .7, -2.2); g.add(f); }
    const u = sprite(Mt.glowSprite, 0x58e1f4, 3, 0, -.3, 0); u.material.opacity = .5; g.add(u);
    return { group: g, w: 2.6, l: 4.2, h: 1.4 };
  }
  /* ---------- pickups ---------- */
  let ringGeo = null, discMat = null;
  function ring(){
    const Mt = mats();
    if (!ringGeo){
      ringGeo = new THREE.TorusGeometry(1.9, .14, 14, 56);
      discMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { time: flameUniforms.time },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `uniform float time; varying vec2 vUv; void main(){ vec2 p = vUv*2.-1.; float r = length(p); float a = atan(p.y,p.x);
          float sw = .5+.5*sin(a*6. + r*14. - time*5.); float edge = smoothstep(1.,.75,r);
          float alpha = (pow(r,3.)*.55 + sw*.08) * edge; gl_FragColor = vec4(vec3(1.,.8,.4)*alpha, alpha); }`
      });
    }
    const g = new THREE.Group();
    const t = new THREE.Mesh(ringGeo, Mt.ring); g.add(t);
    const d = new THREE.Mesh(new THREE.CircleGeometry(1.85, 40), discMat); g.add(d);
    const s = sprite(Mt.glowSprite, 0xffb84a, 5.5); s.material.opacity = .35; g.add(s);
    g.userData.torus = t;
    return g;
  }
  let cellGeo = null;
  function airCell(){
    const Mt = mats();
    if (!cellGeo) cellGeo = { glass: new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(.42, .9, 6, 16) : new THREE.CylinderGeometry(.42, .42, 1.6, 16), core: new THREE.CylinderGeometry(.16, .16, 1.1, 12), cap: new THREE.CylinderGeometry(.46, .46, .14, 20) };
    const g = new THREE.Group();
    g.add(new THREE.Mesh(cellGeo.core, Mt.cellCore));
    const gl = new THREE.Mesh(cellGeo.glass, Mt.cellGlass); gl.renderOrder = 2; g.add(gl);
    for (const y of [-.62, .62]){ const c = new THREE.Mesh(cellGeo.cap, Mt.nozzle); c.position.y = y; g.add(c); }
    const band = new THREE.Mesh(new THREE.TorusGeometry(.45, .03, 6, 24).rotateX(Math.PI / 2), Mt.cyanGlow); g.add(band);
    const s = sprite(Mt.glowSprite, 0x40d0ff, 4.2); s.material.opacity = .6; g.add(s);
    return g;
  }

  function displace(geo, amt, seed, freq = .2){
    const N = T.makeNoise(seed); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++){
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = N.fbm(x * freq + 50, z * freq + y * freq * .5 + 50, 3, 1000) - .5;
      const r = Math.hypot(x, z) || 1; const k = 1 + n * amt;
      p.setXYZ(i, x * k, y + n * amt * .4, z * k);
    }
    geo.computeVertexNormals(); return geo;
  }

  /* ---------- gates & beacons ---------- */
  // energy gate (kit shader: energy_gate.frag) — chapter exits, gravity gates, route gates
  function gateMat(col){
    return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: flameUniforms.time, uColor: { value: new THREE.Color(col) }, uOpen: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `precision mediump float; varying vec2 vUv; uniform float uTime, uOpen; uniform vec3 uColor;
        void main(){ vec2 p = vUv*2.0-1.0; float r = length(p); float ring = exp(-pow((r-0.72)*19.0,2.0)); float pulse = 0.7+0.3*sin(uTime*3.0+r*15.0);
          float a = atan(p.y, p.x); float swirl = .5+.5*sin(a*5. - uTime*2. + r*10.); float inner = smoothstep(.72, .2, r) * (.08 + .1*swirl) * uOpen;
          float v = ring*pulse + inner; gl_FragColor = vec4(uColor*v*1.6, v); }` });
  }
  function gate(radius, col, opts = {}){
    const g = new THREE.Group();
    const m = gateMat(col);
    const d = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.8, radius * 2.8), m); g.add(d);
    const tor = new THREE.Mesh(new THREE.TorusGeometry(radius, opts.thick || .35, 10, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.2) })); g.add(tor);
    for (let k = 0; k < 8; k++){ const a = k / 8 * Math.PI * 2; const n = box(.5, .5, 1.2, mats().darkMetal, Math.cos(a) * radius, Math.sin(a) * radius, 0); n.rotation.z = a; g.add(n); }
    g.userData = { mat: m, torus: tor };
    return g;
  }
  // arrow symbol (gravity gates / route signs), drawn as a flat glowing mesh
  function arrowMesh(col, size = 3){
    const s = new THREE.Shape(); s.moveTo(0, 1); s.lineTo(.8, .1); s.lineTo(.3, .1); s.lineTo(.3, -1); s.lineTo(-.3, -1); s.lineTo(-.3, .1); s.lineTo(-.8, .1); s.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2), side: THREE.DoubleSide, transparent: true, opacity: .9 }));
    m.scale.setScalar(size); return m;
  }
  function beaconLight(){
    const Mt = mats(), g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffcb70, emissiveIntensity: 3, roughness: .2, metalness: .3 }));
    g.add(core);
    for (let k = 0; k < 3; k++){ const r = new THREE.Mesh(new THREE.TorusGeometry(2.4 + k * .7, .06, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffcb70).multiplyScalar(2), transparent: true, opacity: .8 })); r.rotation.x = k * 1.1; r.rotation.y = k * .7; g.add(r); }
    const halo = sprite(Mt.glowSprite, 0xffcb70, 16); halo.material.opacity = .7; g.add(halo);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 200, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffcb70, transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(pillar);
    g.userData.core = core;
    return g;
  }
  function energyOrb(){
    const Mt = mats(), g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.55, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffcb70).multiplyScalar(2.5) })));
    const s = sprite(Mt.glowSprite, 0xffb040, 3.6); s.material.opacity = .8; g.add(s);
    return g;
  }

  /* ---------- environment pieces ---------- */
  const geoCache = {};
  const envMats = {};
  function emat(key){
    if (envMats[key]) return envMats[key];
    let m;
    if (key === 'rock'){ const t = T.canyonRock(); m = new THREE.MeshStandardMaterial({ map: t, roughness: .95, metalness: 0, envMapIntensity: .4 }); }
    else if (key === 'rockDark'){ m = new THREE.MeshStandardMaterial({ map: T.canyonRock(), color: 0x8a8090, roughness: .95, envMapIntensity: .3 }); }
    else if (key === 'road'){ const r = T.road(); m = new THREE.MeshStandardMaterial({ map: r.map, normalMap: r.normalMap, roughnessMap: r.roughnessMap, roughness: .92, metalness: .05, normalScale: new THREE.Vector2(.5, .5), envMapIntensity: .5 }); }
    else if (key === 'concrete'){ m = new THREE.MeshStandardMaterial({ map: T.concrete(), roughness: .88, envMapIntensity: .3 }); }
    else if (key === 'panel'){ m = new THREE.MeshStandardMaterial({ map: T.cityPanel(), emissiveMap: T.cityPanel(), emissive: 0xffffff, emissiveIntensity: .9, roughness: .5, metalness: .6 }); }
    else if (key === 'wallLane'){ m = new THREE.MeshBasicMaterial({ map: T.wallLane(), transparent: true, color: new THREE.Color(1.8, 1.8, 1.8), depthWrite: false, side: THREE.DoubleSide }); }
    else if (key === 'asteroid'){ m = new THREE.MeshStandardMaterial({ map: T.canyonRock(), color: 0x9a94a8, roughness: 1, metalness: .05, envMapIntensity: .2 }); }
    else if (key === 'pad'){ m = new THREE.MeshStandardMaterial({ map: T.padMark(), emissiveMap: T.padMark(), emissive: 0xffffff, emissiveIntensity: .8, roughness: .6 }); }
    else if (key === 'homePad'){ m = new THREE.MeshStandardMaterial({ map: T.padMark('#ffcb70', 'HOME'), emissiveMap: T.padMark('#ffcb70', 'HOME'), emissive: 0xffffff, emissiveIntensity: 1, roughness: .6 }); }
    else if (key.startsWith('facade')){ const v = +key.slice(6); const f = T.facade(v); m = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.7, roughness: .45, metalness: .55, envMapIntensity: .8 }); }
    else if (key.startsWith('ad')){ m = new THREE.MeshBasicMaterial({ map: T.billboard(+key.slice(2)), color: new THREE.Color(1.6, 1.6, 1.6) }); }
    return envMats[key] = m;
  }
  function mesa(seed, ms = 'rock'){
    const k = 'mesa' + (seed % 6);
    const g = geoCache[k] || (geoCache[k] = displace(new THREE.CylinderGeometry(.75, 1, 1, 14, 6), .32, 300 + seed % 6, 2.2));
    const m = new THREE.Mesh(g, emat(ms)); m.castShadow = false; m.receiveShadow = true; return m;
  }
  function boulder(seed){
    const k = 'boulder' + (seed % 5);
    const g = geoCache[k] || (geoCache[k] = displace(new THREE.IcosahedronGeometry(1, 2), .5, 400 + seed % 5, 1.3));
    const m = new THREE.Mesh(g, emat('rock')); m.castShadow = true; return m;
  }
  function asteroid(seed){
    const k = 'ast' + (seed % 6);
    const g = geoCache[k] || (geoCache[k] = displace(new THREE.IcosahedronGeometry(1, 2), .65, 500 + seed % 6, 1.1));
    return new THREE.Mesh(g, emat('asteroid'));
  }
  // tower: box with facade on 4 sides, roof
  function tower(v, w, h, d){
    const fm = emat('facade' + (v % 4)), roof = emat('concrete');
    const g = new THREE.BoxGeometry(w, h, d);
    // scale UVs to keep windows a consistent size
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++){ const f = (i / 4) | 0; const sx = f < 2 ? d / 16 : w / 16, sy = f === 2 || f === 3 ? d / 16 : h / 24; uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy); }
    const m = new THREE.Mesh(g, [fm, fm, roof, roof, fm, fm]); m.receiveShadow = true;
    return m;
  }
  // tornado: twisted open cone with scrolling streaks
  let swirlMat = null;
  function tornado(r, h){
    if (!swirlMat){
      const t = T.swirl();
      swirlMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { map: { value: t }, time: flameUniforms.time, col: { value: new THREE.Color(0xc8ccf0) } },
        vertexShader: 'uniform float time; varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec3 p = position; float a = time*.8 + p.y*.04; p.x += sin(a)*p.y*.04; p.z += cos(a*1.3)*p.y*.03; vec4 mv = modelViewMatrix*vec4(p,1.); vec3 n = normalize(normalMatrix*normal); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix*mv; }',
        fragmentShader: 'uniform sampler2D map; uniform float time; uniform vec3 col; varying vec2 vUv; varying float vF; void main(){ vec4 t = texture2D(map, vec2(vUv.x*3. + time*.9 + vUv.y*1.5, vUv.y*2. - time*.3)); float edge = smoothstep(0., .12, vUv.y)*smoothstep(1., .8, vUv.y); float a = t.a*(.25 + (1.-vF)*.55)*edge; gl_FragColor = vec4(col*(.6+t.r*.6), a); }' });
    }
    const g = new THREE.CylinderGeometry(r * 1.6, r * .45, h, 36, 12, true); g.translate(0, h / 2, 0);
    const m = new THREE.Mesh(g, swirlMat); m.renderOrder = 3;
    return m;
  }
  // big soft cloud cluster from billboards
  let puffMat = null;
  function cloudCluster(n, spread, size, tint){
    if (!puffMat) puffMat = new THREE.SpriteMaterial({ map: T.puff(), color: 0xffffff, transparent: true, depthWrite: false, fog: true });
    const g = new THREE.Group();
    for (let i = 0; i < n; i++){
      const m = puffMat.clone(); m.color.set(tint || 0xffffff); m.rotation = Math.random() * 6;
      const s = new THREE.Sprite(m); const k = size * (.6 + Math.random() * .7); s.scale.set(k, k, 1);
      s.position.set((Math.random() - .5) * spread, (Math.random() - .3) * spread * .4, (Math.random() - .5) * spread); g.add(s);
    }
    return g;
  }
  // the home planet with the kit atmosphere-rim shader
  function earth(R){
    const g = new THREE.Group();
    const surf = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.MeshStandardMaterial({ map: T.earth(), roughness: .8, metalness: 0, emissive: 0x081830, emissiveIntensity: .25, fog: false }));
    g.add(surf);
    const cl = new THREE.Mesh(new THREE.SphereGeometry(R * 1.008, 96, 64), new THREE.MeshStandardMaterial({ map: T.earthClouds(), transparent: true, depthWrite: false, roughness: 1, fog: false }));
    g.add(cl);
    const rim = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: false,
      uniforms: { uRimColor: { value: new THREE.Color(0x5ab8ff) }, uIntensity: { value: 2.2 } },
      vertexShader: 'varying vec3 vNormal; varying vec3 vViewDir; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vNormal = normalize(normalMatrix*normal); vViewDir = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'precision mediump float; varying vec3 vNormal; varying vec3 vViewDir; uniform vec3 uRimColor; uniform float uIntensity; void main(){ float d = max(dot(normalize(-vNormal),normalize(vViewDir)),0.0); float rim = pow(1.0-d, 4.0)*smoothstep(0., .25, d)*6.; gl_FragColor = vec4(uRimColor*rim*uIntensity, rim); }' });
    const atm = new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 96, 64), rim); g.add(atm);
    g.userData = { surf, cl, atm };
    return g;
  }
  function update(dt){ flameUniforms.time.value += dt; }

  return { mats, loft, playerCar, setPaint, airCar, ring, airCell, gate, gateMat, arrowMesh, beaconLight, energyOrb, emat, mesa, boulder, asteroid, tower, tornado, cloudCluster, earth, displace, update, sprite, flareSprite, box, flameUniforms };
})();
