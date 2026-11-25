// town.js - the city (real buildings: podium shops, tiered glass/apartment towers, rooftop gear, sidewalks, street trees, crosswalks, traffic lights)
// and the gated "Gold Coast Estates" neighbourhood (villas with pools, palms, hedges, fountain roundabout, gate).
// Everything is merged into a handful of meshes (vertex colours + 3 facade textures) so it costs only a few draw calls.
import * as THREE from 'three';
import * as W from './world.js';

export function buildTown(c) {
  const { scene, R, rnd, merge, paint, instances, canvasTex, boxFaces, ribbon, roadMat, stdV, lampGeo, free, trees: TG } = c;
  const CR = W.CITY_RECT, [ax1, ax2] = W.AVX, [az1, az2] = W.AVZ, pick = a => a[(rnd() * a.length) | 0], snap4 = v => Math.max(8, Math.round(v / 4) * 4);
  const mk = (geoms, mat, cast = true) => { if (!geoms.length) return null; const m = new THREE.Mesh(merge(geoms), mat); m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m; };
  const B = (w, h, d, x, y, z, col) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col);

  // ---------------------------------------------------------------- facade textures (one tile = 16 m x 16 m = 4 floors; windows repeat every 4 m or 2 m)
  const glassTex = canvasTex(256, 256, (g, w, h) => {                      // office curtain wall: 8 panes x 4 floors with random reflections
    g.fillStyle = '#dfe9f1'; g.fillRect(0, 0, w, h);
    for (let f = 0; f < 4; f++) for (let k = 0; k < 8; k++) { const v = 170 + ((Math.sin(f * 12.9 + k * 7.1) * 43758.5) % 1 + 1) % 1 * 85 | 0, x = k * 32, y = f * 64;
      const gr = g.createLinearGradient(x, y, x + 32, y + 56); gr.addColorStop(0, `rgb(${v},${v + 10},${Math.min(255, v + 25)})`); gr.addColorStop(1, `rgb(${v - 55},${v - 40},${v - 15})`);
      g.fillStyle = gr; g.fillRect(x + 2, y + 6, 28, 50); }
    g.fillStyle = '#5b6874'; for (let k = 0; k <= 8; k++) g.fillRect(k * 32 - 1, 0, 3, h);
    g.fillStyle = '#7e8b97'; for (let f = 0; f < 4; f++) g.fillRect(0, f * 64, w, 6); }, true);
  const aptTex = canvasTex(256, 256, (g, w, h) => {                        // apartments: 4 windows x 4 floors, balconies, some curtains
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let f = 0; f < 4; f++) for (let k = 0; k < 4; k++) { const x = k * 64, y = f * 64, lit = (f * 5 + k * 3) % 7 === 0, cur = (f + k * 2) % 5 === 1;
      g.fillStyle = '#f4f4f4'; g.fillRect(x + 12, y + 10, 40, 42); g.fillStyle = lit ? '#ffe9a8' : '#3b5878'; g.fillRect(x + 15, y + 13, 34, 36);
      if (!lit) { g.fillStyle = '#8fb6d9'; g.fillRect(x + 15, y + 13, 34, 11); }
      if (cur) { g.fillStyle = '#f0dcc4'; g.fillRect(x + 15, y + 13, 16, 36); }
      g.fillStyle = '#f4f4f4'; g.fillRect(x + 31, y + 13, 2, 36); g.fillStyle = '#d0d3d8'; g.fillRect(x + 4, y + 52, 56, 6); g.fillStyle = '#9ca3ab'; g.fillRect(x + 4, y + 57, 56, 2); }
    g.fillStyle = 'rgba(0,0,0,.06)'; for (let f = 0; f < 4; f++) g.fillRect(0, f * 64 + 62, w, 2); }, true);
  const shopTex = canvasTex(256, 256, (g, w, h) => {                       // street-level storefronts: the bottom 5 m of the tile (80 px)
    g.fillStyle = '#e9e6df'; g.fillRect(0, 0, w, h); const y0 = 176;
    g.fillStyle = '#3a3d42'; g.fillRect(0, y0, w, 80);
    for (let k = 0; k < 4; k++) { const x = k * 64, hue = ((k * 83 + 20) % 360);
      g.fillStyle = `hsl(${hue},70%,52%)`; g.fillRect(x + 2, y0 + 6, 60, 15); g.fillStyle = 'rgba(255,255,255,.35)'; for (let s = 0; s < 6; s++) g.fillRect(x + 2 + s * 10, y0 + 6, 5, 15);
      g.fillStyle = k % 2 ? '#b9dff2' : '#ffe9b8'; g.fillRect(x + 5, y0 + 24, 54, 44); g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.moveTo(x + 5, y0 + 24); g.lineTo(x + 30, y0 + 24); g.lineTo(x + 5, y0 + 54); g.fill();
      g.fillStyle = '#23252a'; g.fillRect(x + 28, y0 + 24, 4, 44); g.fillStyle = '#55595f'; g.fillRect(x, y0 + 70, 64, 10); }
    g.fillStyle = '#7a7f87'; g.fillRect(0, y0 - 3, w, 3); }, true);
  const paveTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#c9ccd0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#a9adb3'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); } }, true);
  const lawnTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#6ccf55'; g.fillRect(0, 0, w, h); for (let i = 0; i < 700; i++) { g.fillStyle = `hsl(${100 + Math.random() * 25},${50 + Math.random() * 20}%,${38 + Math.random() * 18}%)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 3); } }, true);
  const mApt = new THREE.MeshStandardMaterial({ vertexColors: true, map: aptTex, roughness: 0.7 });
  const mGlass = new THREE.MeshStandardMaterial({ vertexColors: true, map: glassTex, roughness: 0.18, metalness: 0.35 });
  const mShop = new THREE.MeshStandardMaterial({ vertexColors: true, map: shopTex, roughness: 0.6 });
  const mSolid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  const mVilla = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  const mWin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.7 });
  const mWater = new THREE.MeshStandardMaterial({ color: 0x2fc6e8, roughness: 0.04, metalness: 0.25, emissive: 0x08536a, emissiveIntensity: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mPave = new THREE.MeshStandardMaterial({ map: paveTex, vertexColors: true, roughness: 0.9 });
  const mFlat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const treeGeo = TG.broad.geo, palmGeo = TG.palm.geo;

  // ================================================================ CITY
  const shopG = [], aptG = [], glassG = [], solidG = [], paveG = [], flatG = [];
  const GLASS = ['#8fb9d8', '#7aa6c4', '#93c9cf', '#8497ad', '#6f8aa6', '#a7c3d6'], WALLS = ['#f1e6d3', '#e3c9a8', '#d9a98a', '#c98d6b', '#eeeeea', '#cfd8dc', '#e8d6b0', '#b7c7d6'];
  function building(cx, cz, w, d, floors, y0, kind) {
    const tint = pick(kind === 'glass' ? GLASS : WALLS), pod = 5; c.solidBox(cx, cz, (w + 4) / 2, (d + 4) / 2);
    shopG.push(boxFaces(w + 4, pod, d + 4, [0, 1, 4, 5], 1 / 16, '#ffffff').translate(cx, y0 + pod / 2, cz));
    solidG.push(B(w + 4.6, 0.5, d + 4.6, cx, y0 + pod + 0.25, cz, '#80858e'));
    let yb = y0 + pod + 0.5; const tiers = floors > 16 ? [[0.55, 1], [0.27, 0.76], [0.18, 0.5]] : floors > 8 ? [[0.7, 1], [0.3, 0.72]] : [[1, 1]]; let tw = w, td = d;
    for (const [fr, sc] of tiers) { const f = Math.max(2, Math.round(floors * fr)), h = f * 4; tw = snap4(w * sc); td = snap4(d * sc);
      (kind === 'glass' ? glassG : aptG).push(boxFaces(tw, h, td, [0, 1, 4, 5], 1 / 16, tint).translate(cx, yb + h / 2, cz));
      solidG.push(B(tw + 0.9, 0.8, td + 0.9, cx, yb + h + 0.4, cz, kind === 'glass' ? '#4f5a66' : '#6b6f76')); yb += h + 0.8; }
    const top = yb, nAC = 2 + ((rnd() * 3) | 0);                             // rooftop gear
    for (let i = 0; i < nAC; i++) solidG.push(B(R(1.6, 3), R(1, 1.8), R(1.4, 2.6), cx + R(-tw / 2 + 2.5, tw / 2 - 2.5), top + 0.7, cz + R(-td / 2 + 2.5, td / 2 - 2.5), '#a2a8ae'));
    if (floors >= 10) { solidG.push(B(0.18, 7 + floors * 0.25, 0.18, cx + tw * 0.2, top + 3.5 + floors * 0.12, cz, '#bcc2c9')); solidG.push(B(0.5, 0.5, 0.5, cx + tw * 0.2, top + 7 + floors * 0.25, cz, '#ff3b30')); }
    if (floors >= 22) { solidG.push(paint(new THREE.CylinderGeometry(Math.min(tw, td) / 2.6, Math.min(tw, td) / 2.6, 0.2, 20).translate(cx, top + 0.1, cz), '#3a3f46')); solidG.push(B(0.6, 0.05, 4, cx, top + 0.23, cz, '#ffffff')); solidG.push(B(0.6, 0.05, 4, cx, top + 0.23, cz, '#ffffff').rotateY(0)); }
    if (kind === 'apt' && rnd() < 0.7) { solidG.push(paint(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 10).translate(cx - tw * 0.25, top + 2.4, cz + td * 0.15), '#8a6a4c')); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) solidG.push(B(0.2, 1.2, 0.2, cx - tw * 0.25 + sx * 0.9, top + 0.6, cz + td * 0.15 + sz * 0.9, '#555')); }
    return top - y0;
  }
  const lots = [], xs = [CR.x0 + 4, ax1 - 12, ax1 + 12, ax2 - 12, ax2 + 12, CR.x1 - 4], zs = [CR.z0 + 4, az1 - 12, az1 + 12, az2 - 12, az2 + 12, CR.z1 - 4];
  const blocks = []; for (const k of [0, 2, 4]) for (const m of [0, 2, 4]) blocks.push([xs[k], xs[k + 1], zs[m], zs[m + 1]]);
  for (const [bx0, bx1, bz0, bz1] of blocks) {
    paveG.push(boxFaces(bx1 - bx0, 0.04, bz1 - bz0, [2], 1 / 4, '#8a8e94').translate((bx0 + bx1) / 2, CR.h + 0.04, (bz0 + bz1) / 2));          // sidewalk paving over the whole block
    for (let x = bx0 + 14; x < bx1 - 24;) { const w = snap4(R(24, 40)); let z = bz0 + 14;
      while (z < bz1 - 24) { const d = snap4(R(24, 40)), cx = x + w / 2, cz = z + d / 2; z += d + 18;
        if (cx + w / 2 + 6 > bx1 - 6 || cz + d / 2 + 6 > bz1 - 6) continue;
        if (Math.hypot(cx - W.PLAZA.x, cz - W.PLAZA.z) < W.PLAZA.r + 40 || !free(cx, cz, 34 + Math.max(w, d) / 2)) continue;
        const center = 1 - Math.min(1, Math.hypot(cx - W.PLAZA.x, cz - W.PLAZA.z) / 480), floors = Math.round(3 + Math.pow(rnd(), 1.5) * 26 * (0.2 + center * 0.95)), kind = floors > 11 ? (rnd() < 0.75 ? 'glass' : 'apt') : (rnd() < 0.3 ? 'glass' : 'apt');
        const hgt = building(cx, cz, w, d, floors, CR.h - 0.02, kind); lots.push({ cx, cz, w, d, h: hgt }); }
      x += w + 18; }
  }
  mk(paveG, mPave, false); mk(shopG, mShop); mk(aptG, mApt); mk(glassG, mGlass); mk(solidG, mSolid);
  // street trees, crosswalks and traffic lights along the avenues
  const AVX = W.AVX, AVZ = W.AVZ, tl = [], stripe = paint(new THREE.BoxGeometry(3.2, 0.03, 0.7), '#f4f4f0'), sl = [], tlGeo = merge([paint(new THREE.CylinderGeometry(0.1, 0.12, 6, 6).translate(0, 3, 0), '#4a4f57'), paint(new THREE.BoxGeometry(0.45, 1.3, 0.4).translate(0, 5.6, 0), '#22252a'),
    paint(new THREE.SphereGeometry(0.15, 6, 4).translate(0, 6, 0.22), '#ff3030'), paint(new THREE.SphereGeometry(0.15, 6, 4).translate(0, 5.6, 0.22), '#ffc830'), paint(new THREE.SphereGeometry(0.15, 6, 4).translate(0, 5.2, 0.22), '#38e060')]), tls = [];
  const nearPlaza = (x, z, m) => Math.hypot(x - W.PLAZA.x, z - W.PLAZA.z) < W.PLAZA.r + m, nearX = (x, z) => AVX.some(a => Math.abs(x - a) < 22) && AVZ.some(b => Math.abs(z - b) < 22);
  for (const x of AVX) for (const sgn of [-1, 1]) for (let z = CR.z0 + 24; z < CR.z1 - 14; z += 22) { if (nearPlaza(x, z, 14) || AVZ.some(b => Math.abs(z - b) < 24)) continue; tl.push({ x: x + sgn * 16.5, y: CR.h, z, ry: R(0, 6), sx: R(0.4, 0.55), c: new THREE.Color().setHSL(R(0.27, 0.34), 0.3, R(0.8, 1.0)).getHex() }); }
  for (const z of AVZ) for (const sgn of [-1, 1]) for (let x = CR.x0 + 24; x < CR.x1 - 14; x += 22) { if (nearPlaza(x, z, 14) || AVX.some(a => Math.abs(x - a) < 24)) continue; tl.push({ x, y: CR.h, z: z + sgn * 16.5, ry: R(0, 6), sx: R(0.4, 0.55), c: new THREE.Color().setHSL(R(0.27, 0.34), 0.3, R(0.8, 1.0)).getHex() }); }
  for (const ax of AVX) for (const az of AVZ) { if (nearPlaza(ax, az, 0)) continue;
    for (let k = -5; k <= 5; k++) { const o = k * 2; for (const s of [-1, 1]) { sl.push({ x: ax + s * 18, y: CR.h + 0.13, z: az + o, ry: 0 }); sl.push({ x: ax + o, y: CR.h + 0.13, z: az + s * 18, ry: Math.PI / 2 }); } }
    for (const [sx, sz, ry] of [[1, 1, Math.PI], [-1, 1, Math.PI / 2], [1, -1, -Math.PI / 2], [-1, -1, 0]]) tls.push({ x: ax + sx * 14, y: CR.h, z: az + sz * 14, ry }); }
  instances(treeGeo, TG.broad.mat, tl); instances(stripe, mFlat, sl, { cast: false, receive: true }); instances(tlGeo, stdV, tls); tls.forEach(l => c.solidAdd(l.x, l.z, 0.15)); tl.forEach(l => c.solidAdd(l.x, l.z, 0.4));

  return { lots };
}

