// fx.js - physics-driven effects: pooled soft particles (flipbook smoke / dust, lit by the sun + ambient, sorted back-to-front, fade near the ground and the camera),
// velocity-stretched grains / sparks / spray with ballistic arcs, tyre ruts (sand, grass, gravel) and wet tracks.  Every emitter is fed from per-wheel physics values
// (slip speed = |wheel surface speed - ground speed|, load, surface kind, vehicle speed).  Particle simulation runs on the CPU (cheap typed arrays), drawing is instanced on the GPU.
import * as THREE from 'three';

const rand = Math.random, TAU = Math.PI * 2;
// ---- procedural smoke flipbook (4 x 4 frames of billowy puffs, alpha channel)
function flipbook() {
  const S = 512, F = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'); g.clearRect(0, 0, S, S);
  let seed = 12345; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let f = 0; f < 16; f++) {
    const ox = (f % 4) * F, oy = Math.floor(f / 4) * F; g.save(); g.beginPath(); g.rect(ox, oy, F, F); g.clip();
    for (let i = 0; i < 26; i++) { const a = r() * TAU, d = Math.pow(r(), 0.7) * F * 0.3, x = ox + F / 2 + Math.cos(a) * d, y = oy + F / 2 + Math.sin(a) * d, rad = F * (0.14 + r() * 0.2), gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(255,255,255,${0.16 + r() * 0.16})`); gr.addColorStop(0.55, `rgba(255,255,255,${0.07 + r() * 0.06})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(ox, oy, F, F); }
    const m = g.createRadialGradient(ox + F / 2, oy + F / 2, F * 0.14, ox + F / 2, oy + F / 2, F * 0.5); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = m; g.fillRect(ox, oy, F, F); g.globalCompositeOperation = 'source-over'; g.restore();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 2; return t;
}
const QUAD = new THREE.PlaneGeometry(1, 1);
const SOFT_VS = `attribute vec3 aPos; attribute float aSize; attribute float aSeed; attribute vec3 aCol; attribute float aAlpha; attribute float aRot; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uAmb; uniform float uLit;
varying vec2 vUv; varying vec2 vFrame; varying vec3 vCol; varying float vA; varying float vNear; varying float vShade;
void main(){ vec4 mv = viewMatrix * vec4(aPos,1.0); float c = cos(aRot), s = sin(aRot); vec2 q = position.xy; vec2 r = vec2(q.x*c - q.y*s, q.x*s + q.y*c); mv.xy += r * aSize; gl_Position = projectionMatrix * mv;
  vUv = position.xy + 0.5; float f = floor(aSeed*15.99); vFrame = vec2(mod(f,4.0), floor(f/4.0)); vShade = r.y + 0.5;
  vec3 N = normalize(vec3(0.0,1.0,0.0)*0.6 + normalize(cameraPosition - aPos)*0.8); float lam = clamp(dot(N, uSun)*0.5+0.5, 0.0, 1.0);
  vCol = mix(aCol, aCol * (uAmb + uSunCol * lam), uLit); vA = aAlpha; vNear = smoothstep(1.5, 9.0, -mv.z); }`;
const SOFT_FS = `uniform sampler2D uTex; uniform float uAdd; varying vec2 vUv; varying vec2 vFrame; varying vec3 vCol; varying float vA; varying float vNear; varying float vShade;
void main(){ float a = texture2D(uTex, (vFrame + vUv) / 4.0).a; float k = mix(0.58, 1.0, vShade); vec3 col = vCol * mix(1.0, k, 1.0 - uAdd); float al = a * vA * vNear; if (al < 0.004) discard; gl_FragColor = vec4(col, al); }`;
const STREAK_VS = `attribute vec3 aPos; attribute vec3 aVel; attribute float aSize; attribute vec3 aCol; attribute float aAlpha; varying vec2 vUv; varying vec3 vCol; varying float vA;
void main(){ vec4 mv = viewMatrix * vec4(aPos,1.0); vec3 vv = (viewMatrix * vec4(aVel,0.0)).xyz; vec2 d = vv.xy; float sp = length(aVel); d = length(d) > 1e-3 ? normalize(d) : vec2(0.0,1.0); vec2 pr = vec2(-d.y, d.x);
  float len = aSize * (1.0 + sp * 0.07); mv.xy += d * position.y * len + pr * position.x * aSize; gl_Position = projectionMatrix * mv; vUv = position.xy * 2.0; vCol = aCol; vA = aAlpha; }`;
const STREAK_FS = `varying vec2 vUv; varying vec3 vCol; varying float vA; void main(){ float d = length(vUv); float a = smoothstep(1.0, 0.25, d) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vCol, a); }`;

export function createFx({ scene, camera, groundAt, sun, hemi, sea = 0 }) {
  const Q = { high: 1, medium: 0.6, low: 0.3 }; let quality = 'high', qk = 1;
  const tex = flipbook(), sunDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize(), sunCol = new THREE.Color(1, 0.95, 0.85), amb = new THREE.Color(0.55, 0.6, 0.7);
  const shared = () => ({ uTex: { value: tex }, uSun: { value: sunDir }, uSunCol: { value: sunCol }, uAmb: { value: amb }, uLit: { value: 1 }, uAdd: { value: 0 } });
  // ---------------- soft particles
  function softPool(cap, additive) {
    const P = { cap, n: 0, head: 0, px: new Float32Array(cap), py: new Float32Array(cap), pz: new Float32Array(cap), vx: new Float32Array(cap), vy: new Float32Array(cap), vz: new Float32Array(cap), s0: new Float32Array(cap), s1: new Float32Array(cap), age: new Float32Array(cap).fill(9), life: new Float32Array(cap).fill(1), seed: new Float32Array(cap), rot: new Float32Array(cap), rv: new Float32Array(cap),
      cr: new Float32Array(cap), cg: new Float32Array(cap), cb: new Float32Array(cap), a0: new Float32Array(cap), drag: new Float32Array(cap), buoy: new Float32Array(cap), turb: new Float32Array(cap) };
    const geo = new THREE.InstancedBufferGeometry(); geo.index = QUAD.index; geo.setAttribute('position', QUAD.attributes.position);
    const mk = (n, k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * k), k); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, a); return a; };
    P.aPos = mk('aPos', 3); P.aSize = mk('aSize', 1); P.aSeed = mk('aSeed', 1); P.aCol = mk('aCol', 3); P.aAlpha = mk('aAlpha', 1); P.aRot = mk('aRot', 1);
    const u = shared(); u.uAdd.value = additive ? 1 : 0; if (additive) u.uLit.value = 0;
    P.mat = new THREE.ShaderMaterial({ vertexShader: SOFT_VS, fragmentShader: SOFT_FS, uniforms: u, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    P.mesh = new THREE.Mesh(geo, P.mat); P.mesh.frustumCulled = false; P.mesh.renderOrder = additive ? 6 : 5; geo.instanceCount = 0; scene.add(P.mesh); P.geo = geo; P.order = []; return P;
  }
  const smokeP = softPool(2600, false), addP = softPool(500, true);
  function spawn(P, x, y, z, vx, vy, vz, s0, s1, life, a0, col, drag = 1, buoy = 0, turb = 0.6) {
    const i = P.head; P.head = (P.head + 1) % P.cap; P.px[i] = x; P.py[i] = y; P.pz[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz; P.s0[i] = s0; P.s1[i] = s1; P.age[i] = 0; P.life[i] = life; P.seed[i] = rand(); P.rot[i] = rand() * TAU; P.rv[i] = (rand() - 0.5) * 1.4;
    P.cr[i] = col[0]; P.cg[i] = col[1]; P.cb[i] = col[2]; P.a0[i] = a0; P.drag[i] = drag; P.buoy[i] = buoy; P.turb[i] = turb; return i;
  }
  // ---------------- streaks: sand / stone grains (ballistic), sparks (additive), spray droplets
  function streakPool(cap, additive) {
    const P = { cap, head: 0, px: new Float32Array(cap), py: new Float32Array(cap), pz: new Float32Array(cap), vx: new Float32Array(cap), vy: new Float32Array(cap), vz: new Float32Array(cap), size: new Float32Array(cap), age: new Float32Array(cap).fill(9), life: new Float32Array(cap).fill(1), cr: new Float32Array(cap), cg: new Float32Array(cap), cb: new Float32Array(cap), bounce: new Float32Array(cap), grav: new Float32Array(cap) };
    const geo = new THREE.InstancedBufferGeometry(); geo.index = QUAD.index; geo.setAttribute('position', QUAD.attributes.position);
    const mk = (n, k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * k), k); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, a); return a; };
    P.aPos = mk('aPos', 3); P.aVel = mk('aVel', 3); P.aSize = mk('aSize', 1); P.aCol = mk('aCol', 3); P.aAlpha = mk('aAlpha', 1);
    P.mat = new THREE.ShaderMaterial({ vertexShader: STREAK_VS, fragmentShader: STREAK_FS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    P.mesh = new THREE.Mesh(geo, P.mat); P.mesh.frustumCulled = false; P.mesh.renderOrder = additive ? 7 : 4; geo.instanceCount = 0; scene.add(P.mesh); P.geo = geo; return P;
  }
  const grainP = streakPool(3200, false), sparkP = streakPool(700, true);
  function spawnS(P, x, y, z, vx, vy, vz, size, life, col, bounce = 0, grav = 9.81) { const i = P.head; P.head = (P.head + 1) % P.cap; P.px[i] = x; P.py[i] = y; P.pz[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz; P.size[i] = size; P.age[i] = 0; P.life[i] = life; P.cr[i] = col[0]; P.cg[i] = col[1]; P.cb[i] = col[2]; P.bounce[i] = bounce; P.grav[i] = grav; }
  // ---------------- ribbons: tyre ruts / wet tracks (ring buffer of quads, one strip per wheel)
  function ribbon(cap, kind) {
    const pos = new Float32Array(cap * 12).fill(-1e5), uv = new Float32Array(cap * 8), info = new Float32Array(cap * 12), idx = new Uint32Array(cap * 6); for (let i = 0; i < cap; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const fs = kind === 'rut'
      ? `uniform float uT; varying vec2 vUv; varying vec3 vInfo; void main(){ float age=uT-vInfo.y; float fade=1.-smoothstep(70.,200.,age); float edge=smoothstep(0.,.32,vUv.x)*smoothstep(1.,.68,vUv.x); float tr=0.72+0.28*step(.5,fract(vUv.y*3.5)); float side=mix(1.-vUv.x,vUv.x,step(0.,vInfo.z)); vec3 col=vec3(.2,.155,.1)*tr+vec3(.34,.27,.18)*pow(side,3.)*.55; float a=edge*vInfo.x*fade*.78; if(a<.01) discard; gl_FragColor=vec4(col,a); }`
      : `uniform float uT; varying vec2 vUv; varying vec3 vInfo; void main(){ float age=uT-vInfo.y; float fade=1.-smoothstep(1.,9.,age); float edge=smoothstep(0.,.3,vUv.x)*smoothstep(1.,.7,vUv.x); float a=edge*vInfo.x*fade*.5; if(a<.01) discard; gl_FragColor=vec4(vec3(.03,.035,.04),a); }`;
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, uniforms: { uT: { value: 0 } },
      vertexShader: 'attribute vec3 aInfo; varying vec2 vUv; varying vec3 vInfo; void main(){ vUv=uv; vInfo=aInfo; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: fs });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = kind === 'rut' ? 2 : 3; scene.add(mesh);
    const last = []; let n = 0, w = kind === 'rut' ? 0.13 : 0.12, dirty = false;
    return { mat, reset() { pos.fill(-1e5); geo.attributes.position.needsUpdate = true; last.length = 0; },
      add(k, x, y, z, on, inten, t, sunSide) {
        if (!on) { last[k] = null; return; } const l = last[k]; if (!l) { last[k] = { x, y, z, len: 0, nx: 0, nz: 0, i: 0, has: false }; return; }
        const dx = x - l.x, dz = z - l.z, d = Math.hypot(dx, dz); if (d < 0.22) return; if (d > 6) { last[k] = { x, y, z, len: 0, nx: 0, nz: 0, i: 0, has: false }; return; }
        const nx = -dz / d * w, nz = dx / d * w, px = l.has ? l.nx : nx, pz = l.has ? l.nz : nz, q = n % cap, o = q * 12, u = q * 8, L0 = l.len / 0.6, L1 = (l.len + d) / 0.6; n++;
        const lift = 0.03; pos.set([l.x - px, l.y + lift, l.z - pz, l.x + px, l.y + lift, l.z + pz, x - nx, y + lift, z - nz, x + nx, y + lift, z + nz], o); uv.set([0, L0, 1, L0, 0, L1, 1, L1], u);
        const sd = (nx * sunSide[0] + nz * sunSide[1]) >= 0 ? 1 : -1; info.set([l.i, t, sd, l.i, t, sd, inten, t, sd, inten, t, sd], q * 12);
        geo.attributes.position.needsUpdate = geo.attributes.uv.needsUpdate = geo.attributes.aInfo.needsUpdate = true; last[k] = { x, y, z, len: l.len + d, nx, nz, i: inten, has: true }; } };
  }
  const ruts = ribbon(3600, 'rut'), wets = ribbon(1200, 'wet');
  // ---------------- simulation
  const _c = new THREE.Vector3(); let tNow = 0, frameN = 0;
  function updateSoft(P, dt, t) {
    let n = 0; const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, ord = P.order; ord.length = 0;
    for (let i = 0; i < P.cap; i++) {
      if (P.age[i] >= P.life[i]) continue; const a = P.age[i] += dt; if (a >= P.life[i]) continue;
      const k = a / P.life[i], dr = Math.exp(-P.drag[i] * dt), tb = P.turb[i], sx = P.seed[i] * 40;
      // cheap curl-like turbulence + buoyancy (+ slow expansion of the plume)
      P.vx[i] = P.vx[i] * dr + Math.sin(P.py[i] * 1.9 + t * 1.3 + sx) * tb * dt * 2.6; P.vz[i] = P.vz[i] * dr + Math.cos(P.px[i] * 1.7 + t * 1.1 + sx) * tb * dt * 2.6; P.vy[i] = P.vy[i] * dr + (P.buoy[i] + Math.sin(P.px[i] * 2.1 + P.pz[i] * 1.3 + t + sx) * tb * 0.4) * dt;
      P.px[i] += P.vx[i] * dt; P.py[i] += P.vy[i] * dt; P.pz[i] += P.vz[i] * dt; P.rot[i] += P.rv[i] * dt;
      const dx = P.px[i] - cx, dy = P.py[i] - cy, dz = P.pz[i] - cz; ord.push(i); P.dist2 = P.dist2 || new Float32Array(P.cap); P.dist2[i] = dx * dx + dy * dy + dz * dz; n++;
    }
    if (frameN % (quality === 'high' ? 1 : 2) === 0) ord.sort((a, b) => P.dist2[b] - P.dist2[a]);
    for (let j = 0; j < ord.length; j++) {
      const i = ord[j], k = P.age[i] / P.life[i], size = P.s0[i] + (P.s1[i] - P.s0[i]) * (1 - Math.pow(1 - k, 2.2)), g = groundAt(P.px[i], P.pz[i]);
      const soft = Math.max(0, Math.min(1, (P.py[i] - g) / (size * 0.32 + 0.05))), a = P.a0[i] * Math.pow(1 - k, 1.35) * Math.min(1, k * 14) * (0.25 + 0.75 * soft);
      P.aPos.array.set([P.px[i], P.py[i], P.pz[i]], j * 3); P.aSize.array[j] = size; P.aSeed.array[j] = P.seed[i]; P.aCol.array.set([P.cr[i], P.cg[i], P.cb[i]], j * 3); P.aAlpha.array[j] = a; P.aRot.array[j] = P.rot[i];
    }
    P.geo.instanceCount = ord.length; for (const at of [P.aPos, P.aSize, P.aSeed, P.aCol, P.aAlpha, P.aRot]) at.needsUpdate = true;
  }
  function updateStreak(P, dt, cull) {
    let m = 0;
    for (let i = 0; i < P.cap; i++) {
      if (P.age[i] >= P.life[i]) continue; const a = P.age[i] += dt; if (a >= P.life[i]) continue;
      P.vy[i] -= P.grav[i] * dt; P.vx[i] *= 1 - 0.35 * dt; P.vz[i] *= 1 - 0.35 * dt; P.px[i] += P.vx[i] * dt; P.py[i] += P.vy[i] * dt; P.pz[i] += P.vz[i] * dt;
      const g = Math.max(groundAt(P.px[i], P.pz[i]), cull ? sea - 0.05 : -1e9); if (P.py[i] < g + 0.02 && P.vy[i] < 0) { if (P.bounce[i] > 0.05) { P.py[i] = g + 0.03; P.vy[i] *= -P.bounce[i]; P.vx[i] *= 0.7; P.vz[i] *= 0.7; P.bounce[i] *= 0.5; } else { P.age[i] = 9; continue; } }
      const k = a / P.life[i]; P.aPos.array.set([P.px[i], P.py[i], P.pz[i]], m * 3); P.aVel.array.set([P.vx[i], P.vy[i], P.vz[i]], m * 3); P.aSize.array[m] = P.size[i]; P.aCol.array.set([P.cr[i], P.cg[i], P.cb[i]], m * 3); P.aAlpha.array[m] = Math.min(1, (1 - k) * 2.2); m++;
    }
    P.geo.instanceCount = m; for (const at of [P.aPos, P.aVel, P.aSize, P.aCol, P.aAlpha]) at.needsUpdate = true;
  }
  // ---------------- public API
  const api = {
    setQuality(q) { quality = Q[q] ? q : 'high'; qk = Q[quality]; },
    setLight(sunLight, hemiLight) { if (sunLight) { sunDir.copy(sunLight.position).sub(sunLight.target.position).normalize(); sunCol.copy(sunLight.color).multiplyScalar(0.55 * Math.min(1.4, sunLight.intensity)); } if (hemiLight) { amb.copy(hemiLight.color).lerp(hemiLight.groundColor, 0.35).multiplyScalar(0.55 * Math.min(1.6, hemiLight.intensity + 0.2)); } },
    reset() { for (const P of [smokeP, addP]) { P.age.fill(9); P.geo.instanceCount = 0; } for (const P of [grainP, sparkP]) { P.age.fill(9); P.geo.instanceCount = 0; } ruts.reset(); wets.reset(); },
    smoke(x, y, z, vx, vy, vz, s0, s1, life, a, col, drag, buoy, turb) { spawn(smokeP, x, y, z, vx, vy, vz, s0, s1, life, a, col, drag, buoy, turb); },
    flame(x, y, z, vx, vy, vz, s0, s1, life, a, col) { spawn(addP, x, y, z, vx, vy, vz, s0, s1, life, a, col, 2.5, 0.4, 0.2); },
    grain(x, y, z, vx, vy, vz, size, life, col, bounce) { spawnS(grainP, x, y, z, vx, vy, vz, size, life, col, bounce); },
    sparks(x, y, z, vx, vz, n, power = 1) { for (let i = 0; i < n * qk + 1; i++) { const sp = (3 + rand() * 9) * (0.6 + power); spawnS(sparkP, x, y, z, vx + (rand() - 0.5) * sp, 1 + rand() * sp * 0.6, vz + (rand() - 0.5) * sp, 0.035 + rand() * 0.03, 0.35 + rand() * 0.5, [1, 0.62 + rand() * 0.3, 0.2], 0.4); } },
    rut: (k, x, y, z, on, inten, t, sunSide) => ruts.add(k, x, y, z, on, inten, t, sunSide), wet: (k, x, y, z, on, inten, t, sunSide) => wets.add(k, x, y, z, on, inten, t, sunSide),
    update(dt, t) { tNow = t; frameN++; updateSoft(smokeP, dt, t); updateSoft(addP, dt, t); updateStreak(grainP, dt, true); updateStreak(sparkP, dt, false); ruts.mat.uniforms.uT.value = t; wets.mat.uniforms.uT.value = t; },
    get qk() { return qk; }, get quality() { return quality; }, stats() { return smokeP.geo.instanceCount + addP.geo.instanceCount + grainP.geo.instanceCount + sparkP.geo.instanceCount; },
  };
  return api;
}

// ---------------- per-vehicle emitters: everything below reads per-wheel physics (c.w[i]) -----------------
const SURF_COL = { sand: [0.86, 0.75, 0.52], grass: [0.42, 0.46, 0.27], gravel: [0.62, 0.6, 0.55], wood: [0.5, 0.4, 0.3] };
export function makeCarFx(fxApi) {
  const acc = [0, 0, 0, 0], heat = [0, 0, 0, 0], wetUntil = [0, 0, 0, 0], wind = [2.2, 0.15, 0.9], prevThr = { v: 0 }; let dirt = 0, dirtT = 0;
  const sunSide = [0.7, 0.4];
  return {
    update(c, S, inp, dt, t, o) {              // o: { skidTo(k,x,z,y,on,inten), au, rig, setDirt(v) }
      if (!c.b) return; const q = fxApi.qk, speed = c.kmh / 3.6, soft = ['sand', 'grass', 'gravel'], driveW = S.drive === 'AWD' ? [1, 1, 1, 1] : S.drive === 'FWD' ? [1, 1, 0, 0] : [0, 0, 1, 1], mg4 = S.mass * 9.81 / 4;
      const cvx = c.b.vel[0], cvz = c.b.vel[2];
      for (let i = 0; i < 4; i++) {
        const w = c.w[i]; if (!w.hit || w.N < 10) { if (o.skidTo) o.skidTo(i, 0, 0, 0, false); fxApi.rut(i, 0, 0, 0, false); fxApi.wet(i, 0, 0, 0, false); continue; }
        const load = Math.min(2, w.N / mg4), sl = w.slipV || 0, energy = sl * Math.max(0.3, load), kind = w.kind, x = w.cx, y = w.cy, z = w.cz, Fg = w.Fg, Lg = w.Lg, sv = w.sv || 0, onRoad = kind === 'road' || kind === 'wood';
        const sliding = (w.slipN || 0) > 1.15 && (speed > 1.5 || Math.abs(sv) > 3);
        if (onRoad) {
          if (o.skidTo) o.skidTo(i, x, z, y, sliding, Math.min(1, 0.45 + Math.min(1, ((w.slipN || 1) - 1) * 0.35)));
          if (sliding || (wetUntil[i] > t)) { /* wet marks drawn below */ }
          if (sliding) { acc[i] += Math.min(40, energy * 8) * q * dt * (1 + load * 0.2); const burn = Math.abs(sv) > 4 ? 1 : 0, tint = burn ? [0.88, 0.92, 1] : [0.82, 0.82, 0.84];
            while (acc[i] >= 1) { acc[i]--; fxApi.smoke(x + (Math.random() - 0.5) * 0.25, y + 0.12, z + (Math.random() - 0.5) * 0.25, cvx * 0.22 + (Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.9, cvz * 0.22 + (Math.random() - 0.5) * 0.8, 0.28 + Math.random() * 0.2, 1.8 + Math.random() * 1.9 + energy * 0.12, 2.4 + Math.min(3.4, energy * 0.35) + Math.random() * 1.2, burn ? 0.34 : 0.22, tint, 0.7, 0.35, 0.8); } }
          // wet tyre tracks after driving out of water
          fxApi.wet(i, x, y, z, wetUntil[i] > t && speed > 1, Math.max(0, Math.min(1, (wetUntil[i] - t) / 5)) * 0.9, t, sunSide);
          fxApi.rut(i, 0, 0, 0, false);
        } else {
          if (o.skidTo) o.skidTo(i, 0, 0, 0, false);
          fxApi.wet(i, 0, 0, 0, false);
          if (kind === 'water') {                                              // splash sheets + mist, scaled by speed
            wetUntil[i] = t + 6; const sp = Math.hypot(w.vx, w.vy); acc[i] += Math.min(200, sp * 5.5) * q * dt; fxApi.rut(i, 0, 0, 0, false);
            while (acc[i] >= 1) { acc[i]--; const side = (w.side || (i % 2 ? -1 : 1)) * (0.8 + Math.random() * 1.6); fxApi.grain(x, y + 0.1, z, cvx * 0.3 + Lg[0] * side * (1.5 + sp * 0.12) + (Math.random() - 0.5) * 1.5, 2.2 + sp * 0.18 * Math.random() + Math.random() * 2, cvz * 0.3 + Lg[2] * side * (1.5 + sp * 0.12) + (Math.random() - 0.5) * 1.5, 0.05 + Math.random() * 0.05, 0.9 + Math.random() * 0.7, [0.82, 0.9, 0.95], 0);
              if (Math.random() < 0.35) fxApi.smoke(x, y + 0.2, z, cvx * 0.25 + Lg[0] * side, 0.8 + Math.random(), cvz * 0.25 + Lg[2] * side, 0.4, 1.7, 1.3, 0.22, [0.9, 0.95, 1], 1.2, 0.2, 0.5); }
          } else if (soft.indexOf(kind) >= 0) {
            const col = SURF_COL[kind], drv = driveW[i], dustA = kind === 'sand' ? 0.34 : kind === 'grass' ? 0.22 : 0.26;
            // tracks: persistent ruts, deeper when spinning / braking
            fxApi.rut(i, x, y, z, speed > 0.8 || Math.abs(sv) > 1.5, Math.min(1, 0.45 + Math.min(0.5, Math.abs(sv) * 0.06) + (kind === 'sand' ? 0.1 : 0)), t, sunSide);
            // dust cloud: density follows speed (light at 20 km/h, thick at 100 km/h), plus slip
            acc[i] += (Math.min(60, speed * 1.3) + Math.min(50, energy * 3.5)) * q * dt * (kind === 'sand' ? 1.0 : 0.7);
            while (acc[i] >= 1) { acc[i]--; const big = 1.2 + Math.min(3.2, speed * 0.05) + Math.min(1.2, energy * 0.1); fxApi.smoke(x - Fg[0] * 0.3 + (Math.random() - 0.5) * 0.5, y + 0.1, z - Fg[2] * 0.3 + (Math.random() - 0.5) * 0.5, cvx * 0.22 + wind[0] * 0.25 + (Math.random() - 0.5) * 1.1, 0.5 + Math.random() * 0.9, cvz * 0.22 + wind[2] * 0.25 + (Math.random() - 0.5) * 1.1, 0.5 + Math.random() * 0.3, big * (0.9 + Math.random() * 0.8), 3 + Math.random() * 2.2, dustA, col, 0.55, 0.22, 1.1); }
            // roost: grains thrown backward and up from the driven wheels (rate + speed follow slip speed and vehicle speed)
            if (drv || kind !== 'sand') { const g = (Math.abs(sv) * 1.6 + speed * 0.9) * (drv ? 1 : 0.35) * q; w.gacc = (w.gacc || 0) + Math.min(260, g) * dt; const back = 1.5 + Math.abs(sv) * 0.34 + speed * 0.22;
              while (w.gacc >= 1) { w.gacc--; fxApi.grain(x + (Math.random() - 0.5) * 0.25, y + 0.06, z + (Math.random() - 0.5) * 0.25, cvx * 0.5 - Fg[0] * back * (0.5 + Math.random() * 0.8) + (Math.random() - 0.5) * 1.8, 1.6 + Math.random() * (2.2 + Math.abs(sv) * 0.16), cvz * 0.5 - Fg[2] * back * (0.5 + Math.random() * 0.8) + (Math.random() - 0.5) * 1.8, 0.022 + Math.random() * 0.03, 0.8 + Math.random() * 0.9, col.map(v => v * (0.75 + Math.random() * 0.3)), kind === 'gravel' ? 0.45 : 0); } }
            // side spray from the front wheels when steering hard
            if (w.front && Math.abs(w.alp || 0) > 0.1 && speed > 5) { w.sacc = (w.sacc || 0) + Math.min(80, Math.abs(w.alp) * speed * 9) * q * dt; const sd = -Math.sign(w.vy || 1);
              while (w.sacc >= 1) { w.sacc--; fxApi.grain(x, y + 0.08, z, cvx * 0.3 + Lg[0] * sd * (2.5 + speed * 0.2) + (Math.random() - 0.5), 1.2 + Math.random() * 2, cvz * 0.3 + Lg[2] * sd * (2.5 + speed * 0.2) + (Math.random() - 0.5), 0.025 + Math.random() * 0.025, 0.7 + Math.random() * 0.6, col, 0); } }
            // landing puffs after jumps
            if (c.landed > 3 && !w.landDone) { w.landDone = true; for (let k = 0; k < 14 * q; k++) fxApi.smoke(x + (Math.random() - 0.5), y + 0.1, z + (Math.random() - 0.5), (Math.random() - 0.5) * 5, 0.8 + Math.random() * 1.8, (Math.random() - 0.5) * 5, 0.6, 2.8 + Math.random() * 1.6, 2.4 + Math.random() * 1.2, 0.36, col, 0.7, 0.1, 1.0); }
          }
        }
        if (c.landed <= 3) w.landDone = false;
        // brake heat for the glow on the discs
        heat[i] += (inp.brake > 0.1 && c.u > 3 ? (w.front ? 1 : 0.5) * Math.min(1, speed / 25) * inp.brake * 0.35 : -0.12) * dt; heat[i] = Math.max(0, Math.min(1, heat[i]));
      }
      // exhaust: lift-off backfire (flame + pop), nitro flame / trail
      const thr = inp.throttle || 0, hl = (S.wb + 1.7) / 2, ex = [c.cx - c.F[0] * (hl + 0.1) - c.U[0] * 0.25, c.cy - c.F[1] * (hl + 0.1) - c.U[1] * 0.25, c.cz - c.F[2] * (hl + 0.1) - c.U[2] * 0.25];
      if (prevThr.v > 0.6 && thr < 0.1 && c.rpm > 0.55 * S.redline && c.gear > 0 && o.au && S.turbo !== undefined) { const n = 2 + Math.round(Math.random() * 3); for (let k = 0; k < n; k++) fxApi.flame(ex[0] + c.L[0] * (k % 2 ? 0.45 : -0.45), ex[1], ex[2] + c.L[2] * (k % 2 ? 0.45 : -0.45), -c.F[0] * (4 + Math.random() * 3) + cvx * 0.5, 0.3 + Math.random() * 0.5, -c.F[2] * (4 + Math.random() * 3) + cvz * 0.5, 0.22, 0.75, 0.13 + Math.random() * 0.08, 0.9, [1, 0.55 + Math.random() * 0.2, 0.15]); if (o.au.pop) o.au.pop(); }
      prevThr.v += (thr - prevThr.v) * Math.min(1, 12 * dt);
      if (c.nitroOn) { w_n = (w_n || 0) + 160 * q * dt; while (w_n >= 1) { w_n--; fxApi.flame(ex[0] + c.L[0] * (Math.random() - 0.5) * 0.9, ex[1], ex[2] + c.L[2] * (Math.random() - 0.5) * 0.9, -c.F[0] * (7 + Math.random() * 4) + cvx * 0.6, (Math.random() - 0.3) * 0.5, -c.F[2] * (7 + Math.random() * 4) + cvz * 0.6, 0.24, 0.9, 0.2 + Math.random() * 0.12, 0.85, [0.45, 0.7 + Math.random() * 0.2, 1]); } }
      // sparks while scraping the body
      if (c.scrape > 0.04 && c.hitX !== undefined) fxApi.sparks(c.hitX, c.hitY, c.hitZ, cvx * 0.3, cvz * 0.3, Math.min(10, Math.ceil(c.scrape * 40)), 0.5);
      // brake disc glow + dirt on the paint after soft ground
      if (o.rig && o.rig.glows) for (const g of o.rig.glows) { const hh = heat[g.idx]; g.s.material.opacity = Math.max(0, hh - 0.25) * 1.1; }
      dirtT += dt; if (c.kind === 'sand' || c.kind === 'grass') dirt = Math.min(1, dirt + dt * Math.min(0.06, speed * 0.003)); else if (c.kind === 'water') dirt = Math.max(0, dirt - dt * 0.2); else dirt = Math.max(0, dirt - dt * 0.002);
      if (dirtT > 0.6 && o.setDirt) { dirtT = 0; o.setDirt(dirt, c.kind === 'sand' ? [0.78, 0.66, 0.45] : [0.4, 0.34, 0.24]); }
    },
    heat, resetDirt() { dirt = 0; },
  };
}
let w_n = 0;

