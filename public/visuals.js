// visuals.js - procedural material detail: tileable noise textures (grass / sand / rock / pavement / asphalt), terrain shader patch (4-way splat with
// two detail scales + fake normal perturbation), grass tufts that follow the player.
import * as THREE from 'three';

// ---- tileable value noise (periodic lattice), fbm, returned as Float32Array in 0..1
function tileNoise(size, cells, octaves, seed) {
  const rnd = (() => { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  const out = new Float32Array(size * size); let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const n = cells << o, lat = new Float32Array(n * n); for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = x / size * n, fy = y / size * n, ix = Math.floor(fx), iy = Math.floor(fy), ux = fx - ix, uy = fy - iy, sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
      const a = lat[(iy % n) * n + (ix % n)], b = lat[(iy % n) * n + ((ix + 1) % n)], c = lat[((iy + 1) % n) * n + (ix % n)], d = lat[((iy + 1) % n) * n + ((ix + 1) % n)];
      out[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot; return out;
}
function texFrom(size, fn, { repeat = true, srgb = true, normalize = false } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), im = g.createImageData(size, size), px = new Float32Array(size * size * 3); let sum = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = y * size + x, [r, gg, b] = fn(x, y, i); px[i * 3] = r; px[i * 3 + 1] = gg; px[i * 3 + 2] = b; sum += r; }
  const shift = normalize ? 127.5 - sum / (size * size) : 0;           // detail maps are re-centred on mid grey so they brighten/darken the base colour without changing its average
  for (let i = 0; i < size * size; i++) { im.data[i * 4] = px[i * 3] + shift; im.data[i * 4 + 1] = px[i * 3 + 1] + shift; im.data[i * 4 + 2] = px[i * 3 + 2] + shift; im.data[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; return t;
}
const g8 = v => { v = Math.max(0, Math.min(255, v * 255)); return [v, v, v]; };
// painted ground tile: thousands of small marks, wrapped at the edges, then each channel re-centred on mid grey (it only modulates the base colour)
function paintedTex(size, base, count, mark) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d', { willReadFrequently: true });
  let a = 1234; const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) { const x = r() * size, y = r() * size, seed = a; for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) { if (x + ox < -24 || x + ox > size + 24 || y + oy < -24 || y + oy > size + 24) continue; a = seed; mark(g, x + ox, y + oy, r, i / count); } a = seed; mark({ beginPath() {}, moveTo() {}, quadraticCurveTo() {}, stroke() {}, ellipse() {}, fill() {} }, 0, 0, r, i / count); }
  const im = g.getImageData(0, 0, size, size), d = im.data, sum = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k];
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, d[i + k] * 127.5 / (sum[k] / (size * size))));
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; return t;
}
export function detailTextures() {
  const S = 256, n1 = tileNoise(S, 4, 5, 11), n2 = tileNoise(S, 16, 3, 23), n3 = tileNoise(S, 8, 4, 37), n4 = tileNoise(S, 32, 2, 41);
  const grass = paintedTex(512, '#5c8a38', 9000, (g, x, y, r, t) => {        // individual blades, a few straw-coloured ones
    const len = 7 + r() * 13, lean = (r() - 0.5) * 9, straw = r() < 0.1; g.strokeStyle = straw ? `hsl(${48 + r() * 12},48%,${46 + r() * 20}%)` : `hsl(${78 + r() * 36},${38 + r() * 24}%,${22 + t * 18 + r() * 18}%)`;
    g.lineWidth = 1.4 + r() * 1.4; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + lean * 0.3, y - len * 0.6, x + lean, y - len); g.stroke(); });
  const sand = paintedTex(512, '#c9b183', 14000, (g, x, y, r) => {          // grains, small pebbles and shell flecks (no stripes)
    const pebble = r() < 0.025, rad = pebble ? 2.2 + r() * 3.5 : 0.8 + r() * 1.5; g.fillStyle = pebble ? `hsl(${25 + r() * 20},${14 + r() * 20}%,${38 + r() * 45}%)` : `hsl(${34 + r() * 12},${30 + r() * 25}%,${52 + r() * 28}%)`;
    g.beginPath(); g.ellipse(x, y, rad, rad * (0.6 + r() * 0.4), r() * 3, 0, 7); g.fill(); });
  const macro = texFrom(S, (x, y, i) => g8(0.5 + (n1[i] - 0.5) * 1.5), { normalize: true, srgb: false });                              // large dry / lush patches
  const rock = texFrom(S, (x, y, i) => { const r = 1 - Math.abs(n3[i] * 2 - 1); return g8(0.34 + r * 0.5 + (n2[i] - 0.5) * 0.3 + Math.sin((y / S + n1[i] * 0.4) * 6.283 * 7) * 0.05); }, { normalize: true, srgb: false });   // ridged strata
  const pave = texFrom(S, (x, y, i) => { const line = (x % 64 < 2 || y % 64 < 2) ? -0.12 : 0; return g8(0.52 + (n2[i] - 0.5) * 0.3 + (n4[i] - 0.5) * 0.25 + line); }, { normalize: true, srgb: false });
  return { grass, sand, rock, pave, macro };
}
export function asphaltTextures() {   // 12 m x 16 m tile: worn lanes, tar seams, patches, cracks, aggregate; returns {map, rough}
  const W = 256, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); const r = document.createElement('canvas'); r.width = W; r.height = H; const q = r.getContext('2d');
  const rng = (() => { let a = 77; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
  g.fillStyle = '#3a3c41'; g.fillRect(0, 0, W, H); q.fillStyle = '#e4e4e4'; q.fillRect(0, 0, W, H);
  for (let i = 0; i < 16000; i++) { const v = 40 + rng() * 55 | 0; g.fillStyle = `rgba(${v},${v},${v + 3},${0.18 + rng() * 0.25})`; g.fillRect(rng() * W, rng() * H, 1 + rng() * 2.2, 1 + rng() * 2.2); }
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(170,170,175,${0.12 + rng() * 0.2})`; g.fillRect(rng() * W, rng() * H, 1, 1); }
  for (const x of [W * .235, W * .765]) { const wd = W * 0.1, gr = g.createLinearGradient(x - wd, 0, x + wd, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,.13)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - wd, 0, wd * 2, H);   // worn wheel tracks: soft gradient, no hard edges
    const gq = q.createLinearGradient(x - wd, 0, x + wd, 0); gq.addColorStop(0, 'rgba(120,120,120,0)'); gq.addColorStop(0.5, 'rgba(120,120,120,.3)'); gq.addColorStop(1, 'rgba(120,120,120,0)'); q.fillStyle = gq; q.fillRect(x - wd, 0, wd * 2, H); }
  for (let k = 0; k < 9; k++) { const x = rng() * W, y = rng() * H, rr = 40 + rng() * 70, gr = g.createRadialGradient(x, y, 4, x, y, rr); const dk = rng() < 0.5; gr.addColorStop(0, dk ? 'rgba(20,20,24,.16)' : 'rgba(150,150,155,.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }   // soft mottling instead of hard-edged patches
  g.strokeStyle = 'rgba(8,8,10,.8)'; g.lineWidth = 1.4; for (let y of [H * .31, H * .83]) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + (rng() - .5) * 6); g.stroke(); }          // tar seams
  g.lineWidth = 0.8; for (let k = 0; k < 16; k++) { let x = rng() * W, y = rng() * H; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 8; s++) { x += (rng() - .5) * 22; y += rng() * 16; g.lineTo(x, y); } g.stroke(); }      // cracks
  for (let k = 0; k < 6; k++) { const x = rng() * W, y = rng() * H, rr = 8 + rng() * 14, gr = g.createRadialGradient(x, y, 1, x, y, rr); gr.addColorStop(0, 'rgba(10,10,12,.5)'); gr.addColorStop(1, 'rgba(10,10,12,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }  // oil
  const edge = (x, a) => { for (let y = 0; y < H; y += 2) if (rng() > 0.06) { g.fillStyle = `rgba(236,236,228,${a * (0.75 + rng() * 0.25)})`; g.fillRect(x, y, 4, 2.2); } };
  edge(W * 0.045, 0.95); edge(W * 0.955 - 4, 0.95);                                                                                   // worn edge lines
  for (let k = 0; k < 2; k++) for (let y = k * 256 + 24; y < k * 256 + 136; y += 2) if (rng() > 0.1) { g.fillStyle = `rgba(242,194,48,${0.8 + rng() * 0.2})`; g.fillRect(W / 2 - 2, y, 4, 2.2); }          // dashed centre line
  const map = new THREE.CanvasTexture(c), rough = new THREE.CanvasTexture(r); map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, rough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; } return { map, rough };
}

// ---- terrain material: vertex colour (macro tint) x detail textures chosen by a per-vertex splat (grass, sand, rock, pavement)
export function terrainMaterial(tex) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.tG = { value: tex.grass }; sh.uniforms.tS = { value: tex.sand }; sh.uniforms.tR = { value: tex.rock }; sh.uniforms.tP = { value: tex.pave }; sh.uniforms.tM = { value: tex.macro };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aSplat; varying vec4 vSplat; varying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = aSplat; vWP = (modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tG; uniform sampler2D tS; uniform sampler2D tR; uniform sampler2D tP; uniform sampler2D tM; varying vec4 vSplat; varying vec3 vWP;')
      .replace('#include <map_fragment>', `
        vec2 wp = vWP.xz, wr = mat2(0.8, 0.6, -0.6, 0.8) * wp;                                   // rotated second sample hides the tiling
        vec3 dg = texture2D(tG, wp / 3.4).rgb * texture2D(tG, wr / 14.0).rgb * 4.0;
        vec3 ds = texture2D(tS, wp / 2.6).rgb * texture2D(tS, wr / 15.0).rgb * 4.0;
        float dr = texture2D(tR, wp / 19.).r * texture2D(tR, wp / 3.1).r * 4.2;
        float dp = texture2D(tP, wp / 8.).r * texture2D(tP, wp / 1.7).r * 4.0;
        vec3 dtl = vSplat.x * dg + vSplat.y * ds + vec3(vSplat.z * dr + vSplat.w * dp);
        dtl = mix(vec3(1.0), dtl, 1.0 - smoothstep(180., 720., length(vWP - cameraPosition)));    // fade fine detail with distance: no shimmering
        float big = texture2D(tM, wp / 340.).r, mid = texture2D(tM, wr / 77.).r;                 // large patches stay visible far away
        vec3 patches = mix(vec3(0.84, 0.96, 0.96), vec3(1.2, 1.05, 0.72), smoothstep(0.4, 0.62, big)) * (0.74 + 0.52 * mid);
        diffuseColor.rgb *= clamp(dtl, 0.45, 1.65) * mix(vec3(1.0), patches, vSplat.x);`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n float lum = dot(dtl, vec3(0.333)); normal = normalize(normal + vec3(dFdx(lum), dFdy(lum), 0.) * 1.2);');
  };
  return mat;
}

// ---- grass tufts: crossed alpha quads scattered on grass around the player, deterministic per world cell so they never "swim"
export function grassField(scene, { ok, height, count = 9000, radius = 80, cell = 1.55 }) {
  const known = new Map();                                       // per cell: ground height, or null where no grass grows (the checks are costly)
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) { const x = 8 + Math.random() * 112, h = 50 + Math.random() * 74, lean = (Math.random() - .5) * 26, gr = g.createLinearGradient(0, 128, 0, 128 - h); gr.addColorStop(0, '#5c8f34'); gr.addColorStop(1, `hsl(${85 + Math.random() * 25},60%,${42 + Math.random() * 14}%)`);
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - 3, 128); g.quadraticCurveTo(x + lean * .3, 128 - h * .6, x + lean, 128 - h); g.quadraticCurveTo(x + lean * .3 + 2, 128 - h * .55, x + 3, 128); g.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const q1 = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), q2 = q1.clone().rotateY(Math.PI / 2), pos = [], uv = [], idx = [];
  for (const q of [q1, q2]) { const o = pos.length / 3; pos.push(...q.attributes.position.array); uv.push(...q.attributes.uv.array); idx.push(...[...q.index.array].map(v => v + o)); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
  const mesh = new THREE.InstancedMesh(geo, mat, count); mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.count = 0; scene.add(mesh);
  const d = new THREE.Object3D(), col = new THREE.Color(); let lx = 1e9, lz = 1e9, cap = count;
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  return { mesh, setCap(v, r) { cap = Math.min(count, v); if (r) radius = r; lx = 1e9; }, update(px, pz, force) {
    if (!force && Math.hypot(px - lx, pz - lz) < 14) return; if (known.size > 200000) known.clear(); lx = px; lz = pz; let n = 0;
    const cx0 = Math.floor((px - radius) / cell), cx1 = Math.floor((px + radius) / cell), cz0 = Math.floor((pz - radius) / cell), cz1 = Math.floor((pz + radius) / cell);
    for (let cz = cz0; cz <= cz1 && n < cap; cz++) for (let cx = cx0; cx <= cx1 && n < cap; cx++) {
      const x = (cx + hash(cx, cz)) * cell, z = (cz + hash(cz + 91, cx - 17)) * cell, dd = Math.hypot(x - px, z - pz); if (dd > radius) continue;
      if (hash(cx * 3 + 1, cz * 5 + 2) > 1 - 0.15 * (1 - dd / radius) - 0.35) continue;                      // thin out with distance
      const key = cx * 65536 + cz; let gy = known.get(key); if (gy === undefined) known.set(key, gy = ok(x, z) ? height(x, z) : null); if (gy === null) continue; const s = 0.55 + hash(cx + 5, cz + 9) * 0.9, fade = Math.min(1, (radius - dd) / 15);
      d.position.set(x, gy - 0.03, z); d.rotation.set(0, hash(cx, cz + 3) * 6.283, 0); d.scale.set(s * 1.1 * fade, s * (0.7 + hash(cx - 7, cz) * 0.5) * fade, s * 1.1 * fade); d.updateMatrix(); mesh.setMatrixAt(n, d.matrix);
      mesh.setColorAt(n, col.setHSL(0.22 + hash(cx, cz - 4) * 0.08, 0.35, 0.72 + hash(cx + 2, cz + 2) * 0.25)); n++; }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; } };
}
