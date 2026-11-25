// visuals.js - procedural material detail: tileable noise textures (grass / sand / rock / pavement / asphalt), terrain shader patch (4-way splat with
// two detail scales + fake normal perturbation), grass tufts that follow the player, and richer tree / foliage geometry.
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
export function detailTextures() {
  const S = 256, n1 = tileNoise(S, 4, 5, 11), n2 = tileNoise(S, 16, 3, 23), n3 = tileNoise(S, 8, 4, 37), n4 = tileNoise(S, 32, 2, 41);
  const grass = texFrom(S, (x, y, i) => g8(0.5 + (n1[i] - 0.5) * 0.9 + (n2[i] - 0.5) * 0.45 + (n4[(y * 7 % S) * S + (x * 3 % S)] - 0.5) * 0.35), { normalize: true, srgb: false });                    // mottled turf with fine blade noise
  const sand = texFrom(S, (x, y, i) => g8(0.52 + (n1[i] - 0.5) * 0.42 + (n2[i] - 0.5) * 0.28 + (n4[i] - 0.5) * 0.3), { normalize: true, srgb: false });                         // grain + faint ripples
  const rock = texFrom(S, (x, y, i) => { const r = 1 - Math.abs(n3[i] * 2 - 1); return g8(0.34 + r * 0.5 + (n2[i] - 0.5) * 0.3 + Math.sin((y / S + n1[i] * 0.4) * 6.283 * 7) * 0.05); }, { normalize: true, srgb: false });   // ridged strata
  const pave = texFrom(S, (x, y, i) => { const line = (x % 64 < 2 || y % 64 < 2) ? -0.12 : 0; return g8(0.52 + (n2[i] - 0.5) * 0.3 + (n4[i] - 0.5) * 0.25 + line); }, { normalize: true, srgb: false });
  return { grass, sand, rock, pave };
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
    sh.uniforms.tG = { value: tex.grass }; sh.uniforms.tS = { value: tex.sand }; sh.uniforms.tR = { value: tex.rock }; sh.uniforms.tP = { value: tex.pave };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aSplat; varying vec4 vSplat; varying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = aSplat; vWP = (modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tG; uniform sampler2D tS; uniform sampler2D tR; uniform sampler2D tP; varying vec4 vSplat; varying vec3 vWP;')
      .replace('#include <map_fragment>', `
        vec2 wp = vWP.xz;
        float dg = texture2D(tG, wp / 23.).r * texture2D(tG, wp / 3.7).r * texture2D(tG, wp / 0.9).r * 8.0;
        float ds = texture2D(tS, wp / 17.).r * texture2D(tS, wp / 2.3).r * 4.0;
        float dr = texture2D(tR, wp / 19.).r * texture2D(tR, wp / 3.1).r * 4.2;
        float dp = texture2D(tP, wp / 8.).r * texture2D(tP, wp / 1.7).r * 4.0;
        float dtl = vSplat.x * dg + vSplat.y * ds + vSplat.z * dr + vSplat.w * dp;
        dtl = mix(1.0, dtl, 1.0 - smoothstep(70., 260., length(vWP - cameraPosition)));      // fade detail out with distance: no shimmering on far sand / grass
        diffuseColor.rgb *= clamp(dtl, 0.45, 1.6);`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize(normal + vec3(dFdx(dtl), dFdy(dtl), 0.) * 3.5);');
  };
  return mat;
}

// ---- grass tufts: crossed alpha quads scattered on grass around the player, deterministic per world cell so they never "swim"
export function grassField(scene, { ok, height, count = 9000, radius = 80, cell = 1.55 }) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) { const x = 8 + Math.random() * 112, h = 50 + Math.random() * 74, lean = (Math.random() - .5) * 26, gr = g.createLinearGradient(0, 128, 0, 128 - h); gr.addColorStop(0, '#2c6a1e'); gr.addColorStop(1, `hsl(${85 + Math.random() * 25},60%,${42 + Math.random() * 14}%)`);
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - 3, 128); g.quadraticCurveTo(x + lean * .3, 128 - h * .6, x + lean, 128 - h); g.quadraticCurveTo(x + lean * .3 + 2, 128 - h * .55, x + 3, 128); g.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const q1 = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), q2 = q1.clone().rotateY(Math.PI / 2), pos = [], uv = [], idx = [];
  for (const q of [q1, q2]) { const o = pos.length / 3; pos.push(...q.attributes.position.array); uv.push(...q.attributes.uv.array); idx.push(...[...q.index.array].map(v => v + o)); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
  const mesh = new THREE.InstancedMesh(geo, mat, count); mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.count = 0; scene.add(mesh);
  const d = new THREE.Object3D(), col = new THREE.Color(); let lx = 1e9, lz = 1e9, cap = count;
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  return { mesh, setCap(v) { cap = Math.min(count, v); lx = 1e9; }, update(px, pz, force) {
    if (!force && Math.hypot(px - lx, pz - lz) < 10) return; lx = px; lz = pz; let n = 0;
    const cx0 = Math.floor((px - radius) / cell), cx1 = Math.floor((px + radius) / cell), cz0 = Math.floor((pz - radius) / cell), cz1 = Math.floor((pz + radius) / cell);
    for (let cz = cz0; cz <= cz1 && n < cap; cz++) for (let cx = cx0; cx <= cx1 && n < cap; cx++) {
      const x = (cx + hash(cx, cz)) * cell, z = (cz + hash(cz + 91, cx - 17)) * cell, dd = Math.hypot(x - px, z - pz); if (dd > radius) continue;
      if (hash(cx * 3 + 1, cz * 5 + 2) > 1 - 0.15 * (1 - dd / radius) - 0.35) continue;                      // thin out with distance
      if (!ok(x, z)) continue; const s = 0.55 + hash(cx + 5, cz + 9) * 0.9, fade = Math.min(1, (radius - dd) / 15);
      d.position.set(x, height(x, z) - 0.03, z); d.rotation.set(0, hash(cx, cz + 3) * 6.283, 0); d.scale.set(s * 1.1 * fade, s * (0.7 + hash(cx - 7, cz) * 0.5) * fade, s * 1.1 * fade); d.updateMatrix(); mesh.setMatrixAt(n, d.matrix);
      mesh.setColorAt(n, col.setHSL(0.24 + hash(cx, cz - 4) * 0.08, 0.5, 0.55 + hash(cx + 2, cz + 2) * 0.35)); n++; }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; } };
}

// ---- foliage: organic trees with baked ambient occlusion (darker under the canopy / inside), several blobs per crown
const hex = h => new THREE.Color(h);
function colorize(g, base, top, bottomY, topY, jitter = 0.06) {
  const P = g.attributes.position, n = P.count, a = new Float32Array(n * 3), cb = hex(base), ct = hex(top), c = new THREE.Color();
  for (let i = 0; i < n; i++) { const t = Math.max(0, Math.min(1, (P.getY(i) - bottomY) / (topY - bottomY))); c.copy(cb).lerp(ct, t); const j = 1 + (Math.sin(P.getX(i) * 7.3 + P.getZ(i) * 5.1 + P.getY(i) * 3.7) * jitter); a[i * 3] = c.r * j; a[i * 3 + 1] = c.g * j; a[i * 3 + 2] = c.b * j; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
function lumpy(g, amt, seed) {   // push vertices along their normals with smooth noise -> organic silhouette
  g = g.index ? g.toNonIndexed() : g; const P = g.attributes.position, N = g.attributes.normal;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), k = 1 + (Math.sin(x * 2.1 + seed) * Math.cos(z * 1.9 + seed * 1.3) + Math.sin(y * 2.7 + seed * .7) * .6) * amt; P.setXYZ(i, x * k, y * (0.92 + (k - 1) * .5), z * k); }
  g.computeVertexNormals(); return g;
}
export function treeGeometries(merge) {
  const keep = g => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };
  const solidColor = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3), cc = hex(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  // conifer: 7 drooping tiers
  const pineParts = [keep(colorize(new THREE.CylinderGeometry(0.22, 0.45, 4.2, 7).translate(0, 2.1, 0), '#3d2a1b', '#6a4a2c', 0, 4.2))];
  for (let i = 0; i < 5; i++) { const t = i / 4, r = 3.1 * (1 - t * 0.82) + 0.35, h = 3.4 - t * 1.3, y = 2.0 + i * 1.85; pineParts.push(keep(colorize(lumpy(new THREE.ConeGeometry(r, h, 9, 1, false).translate(0, y + h / 2, 0), 0.07, i * 3.1), '#12361a', '#3b8a42', y, y + h, 0.09))); }
  // broadleaf: trunk + 2 limbs + 6 lumpy blobs
  const leaf = [keep(colorize(new THREE.CylinderGeometry(0.2, 0.4, 3.4, 7).translate(0, 1.7, 0), '#3a2a1e', '#6b4d32', 0, 3.4))];
  for (const [rx, rz] of [[0.9, 0.3], [-0.8, -0.4]]) leaf.push(keep(solidColor(new THREE.CylinderGeometry(0.1, 0.18, 2.2, 5).rotateZ(rx * 0.6).rotateX(rz * 0.5).translate(rx * 0.5, 3.8, rz * 0.5), '#5a4128')));
  [[0, 5.6, 0, 2.5], [1.5, 4.8, 0.5, 1.9], [-1.5, 4.9, -0.4, 1.9], [0.4, 4.7, 1.5, 1.8], [-0.5, 6.5, 0.3, 1.7], [0.2, 4.6, -1.5, 1.7]].forEach(([x, y, z, r], i) => leaf.push(keep(colorize(lumpy(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), 0.13, i * 2.3), '#235c25', '#7bcf52', y - r, y + r, 0.1))));
  // bush
  const bush = []; [[0, 0.7, 0, 1.0], [0.8, 0.5, 0.2, 0.75], [-0.7, 0.55, -0.3, 0.8]].forEach(([x, y, z, r], i) => bush.push(keep(colorize(lumpy(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), 0.14, i * 4.1), '#1f5524', '#5fb246', y - r, y + r, 0.1))));
  return { pine: merge(pineParts), broad: merge(leaf), bush: merge(bush) };
}

