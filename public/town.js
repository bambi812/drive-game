// town.js - the city (real buildings: podium shops, tiered glass/apartment towers, rooftop gear, sidewalks, street trees, crosswalks, traffic lights)
// and the gated "Gold Coast Estates" neighbourhood (villas with pools, palms, hedges, fountain roundabout, gate).
// Everything is merged into a handful of meshes (vertex colours + 3 facade textures) so it costs only a few draw calls.
import * as THREE from 'three';
import * as W from './world.js';

export function buildTown(c) {
  const { scene, R, rnd, merge, paint, instances, canvasTex, boxFaces, ribbon, roadMat, stdV, lampGeo, free, trees: TG } = c, stdVs = c.stdVsmooth;
  const CR = W.CITY_RECT, E = W.ESTATE, pick = a => a[(rnd() * a.length) | 0], snap4 = v => Math.max(8, Math.round(v / 4) * 4);
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
  const treeGeo = TG.broad;
  const palmGeo = (() => { const p = [paint(new THREE.CylinderGeometry(0.22, 0.38, 8, 6).translate(0, 4, 0), '#a07a4c')];
    for (let k = 0; k < 8; k++) { const fr = paint(new THREE.BoxGeometry(3.6, 0.07, 0.8).translate(1.8, 0, 0), k % 2 ? '#3c9c3c' : '#52b848'); fr.rotateZ(-0.38); fr.rotateY(k * Math.PI / 4); fr.translate(0, 8, 0); p.push(fr); } return merge(p); })();

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
  const lots = [], xs = [CR.x0 + 4, 468, 492, 838, 862, CR.x1 - 4], zs = [CR.z0 + 4, 178, 202, 638, 662, CR.z1 - 4];
  const blocks = [[xs[0], 468, zs[0], 178], [xs[0], 468, 202, 638], [xs[0], 468, 662, zs[5]], [492, 838, zs[0], 178], [492, 838, 202, 638], [492, 838, 662, zs[5]], [862, xs[5], zs[0], 178], [862, xs[5], 202, 638], [862, xs[5], 662, zs[5]]];
  for (const [bx0, bx1, bz0, bz1] of blocks) {
    paveG.push(boxFaces(bx1 - bx0, 0.04, bz1 - bz0, [2], 1 / 4, '#8a8e94').translate((bx0 + bx1) / 2, CR.h + 0.04, (bz0 + bz1) / 2));          // sidewalk paving over the whole block
    for (let x = bx0 + 14; x < bx1 - 24;) { const w = snap4(R(24, 40)); let z = bz0 + 14;
      while (z < bz1 - 24) { const d = snap4(R(24, 40)), cx = x + w / 2, cz = z + d / 2; z += d + 18;
        if (cx + w / 2 + 6 > bx1 - 6 || cz + d / 2 + 6 > bz1 - 6) continue;
        if (Math.hypot(cx - W.PLAZA.x, cz - W.PLAZA.z) < W.PLAZA.r + 40 || !free(cx, cz, 34 + Math.max(w, d) / 2)) continue;
        const center = 1 - Math.min(1, Math.hypot(cx - 665, cz - 410) / 480), floors = Math.round(3 + Math.pow(rnd(), 1.5) * 26 * (0.2 + center * 0.95)), kind = floors > 11 ? (rnd() < 0.75 ? 'glass' : 'apt') : (rnd() < 0.3 ? 'glass' : 'apt');
        const hgt = building(cx, cz, w, d, floors, CR.h - 0.02, kind); lots.push({ cx, cz, w, d, h: hgt }); }
      x += w + 18; }
  }
  mk(paveG, mPave, false); mk(shopG, mShop); mk(aptG, mApt); mk(glassG, mGlass); mk(solidG, mSolid);
  // street trees, crosswalks and traffic lights along the avenues
  const AVX = [480, 850], AVZ = [190, 650], tl = [], stripe = paint(new THREE.BoxGeometry(3.2, 0.03, 0.7), '#f4f4f0'), sl = [], tlGeo = merge([paint(new THREE.CylinderGeometry(0.1, 0.12, 6, 6).translate(0, 3, 0), '#4a4f57'), paint(new THREE.BoxGeometry(0.45, 1.3, 0.4).translate(0, 5.6, 0), '#22252a'),
    paint(new THREE.SphereGeometry(0.15, 6, 4).translate(0, 6, 0.22), '#ff3030'), paint(new THREE.SphereGeometry(0.15, 6, 4).translate(0, 5.6, 0.22), '#ffc830'), paint(new THREE.SphereGeometry(0.15, 6, 4).translate(0, 5.2, 0.22), '#38e060')]), tls = [];
  const nearPlaza = (x, z, m) => Math.hypot(x - W.PLAZA.x, z - W.PLAZA.z) < W.PLAZA.r + m, nearX = (x, z) => AVX.some(a => Math.abs(x - a) < 22) && AVZ.some(b => Math.abs(z - b) < 22);
  for (const x of AVX) for (const sgn of [-1, 1]) for (let z = CR.z0 + 24; z < CR.z1 - 14; z += 22) { if (nearPlaza(x, z, 14) || AVZ.some(b => Math.abs(z - b) < 24)) continue; tl.push({ x: x + sgn * 16.5, y: CR.h, z, ry: R(0, 6), sx: R(0.4, 0.55), c: new THREE.Color().setHSL(R(0.27, 0.34), 0.3, R(0.8, 1.0)).getHex() }); }
  for (const z of AVZ) for (const sgn of [-1, 1]) for (let x = CR.x0 + 24; x < CR.x1 - 14; x += 22) { if (nearPlaza(x, z, 14) || AVX.some(a => Math.abs(x - a) < 24)) continue; tl.push({ x, y: CR.h, z: z + sgn * 16.5, ry: R(0, 6), sx: R(0.4, 0.55), c: new THREE.Color().setHSL(R(0.27, 0.34), 0.3, R(0.8, 1.0)).getHex() }); }
  for (const ax of AVX) for (const az of AVZ) { if (nearPlaza(ax, az, 0)) continue;
    for (let k = -5; k <= 5; k++) { const o = k * 2; for (const s of [-1, 1]) { sl.push({ x: ax + s * 18, y: CR.h + 0.13, z: az + o, ry: 0 }); sl.push({ x: ax + o, y: CR.h + 0.13, z: az + s * 18, ry: Math.PI / 2 }); } }
    for (const [sx, sz, ry] of [[1, 1, Math.PI], [-1, 1, Math.PI / 2], [1, -1, -Math.PI / 2], [-1, -1, 0]]) tls.push({ x: ax + sx * 14, y: CR.h, z: az + sz * 14, ry }); }
  instances(treeGeo, stdVs, tl); instances(stripe, mFlat, sl, { cast: false, receive: true }); instances(tlGeo, stdV, tls); tls.forEach(l => c.solidAdd(l.x, l.z, 0.25)); tl.forEach(l => c.solidAdd(l.x, l.z, 0.4));

  // ================================================================ GOLD COAST ESTATES
  const EY = E.h, EX = -475, st = 0.1;                                              // spine street x, street surface offset
  const road0 = W.roadQuery(EX, 900, 400), roadZ = W.roadAt(road0.s).z;           // where the coast road passes in front of the gate
  const S1 = 640, S2 = 740, STREETS = [[EX, E.z0 + 30, EX, roadZ - 5, 14], [E.x0 + 26, S1, E.x1 - 26, S1, 12], [E.x0 + 26, S2, E.x1 - 26, S2, 12]];
  for (const [x0, z0, x1, z1, wid] of STREETS) { const L = Math.hypot(x1 - x0, z1 - z0), tx = (x1 - x0) / L, tz = (z1 - z0) / L, pts = []; for (let s = 0; s <= L; s += 12) pts.push({ x: x0 + tx * s, y: EY + st, z: z0 + tz * s, tx, tz, s }); ribbon(pts, wid / 2, 16, roadMat); }
  // fountain roundabout where the spine meets the middle street
  { const fx = EX, fz = S2, fl = [], pave = new THREE.Mesh(new THREE.CircleGeometry(17, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8d3c4, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); pave.position.set(fx, EY + 0.14, fz); pave.receiveShadow = true; scene.add(pave);
    fl.push(paint(new THREE.CylinderGeometry(8, 8.6, 0.9, 32).translate(fx, EY + 0.55, fz), '#efe9dc'), paint(new THREE.CylinderGeometry(2.4, 3, 1.8, 20).translate(fx, EY + 1.6, fz), '#e6dfd0'), paint(new THREE.CylinderGeometry(1.2, 1.6, 1.4, 16).translate(fx, EY + 3, fz), '#efe9dc'), paint(new THREE.SphereGeometry(0.7, 12, 8).translate(fx, EY + 4.1, fz), '#f4efe4'));
    c.solidAdd(fx, fz, 8.8); mk(fl, mSolid); const wt = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 0.12, 32), mWater); wt.position.set(fx, EY + 1.02, fz); scene.add(wt);
    for (let a = 0; a < 6; a++) { const pl = new THREE.Mesh(new THREE.ConeGeometry(0.22, 2.2, 6), mWater); pl.position.set(fx + Math.cos(a) * 1.9, EY + 2.2, fz + Math.sin(a) * 1.9); scene.add(pl); } }
  // gate arch + sign
  { const gz = E.z1 - 14, g = [];
    for (const sx of [-10, 10]) { c.solidAdd(EX + sx, gz, 1.8); g.push(B(2.6, 7.5, 2.6, EX + sx, EY + 3.75, gz, '#efe9dc'), B(3.2, 0.5, 3.2, EX + sx, EY + 7.7, gz, '#bfa76a'), B(1.2, 1.2, 1.2, EX + sx, EY + 8.5, gz, '#e9c46a')); }
    g.push(B(23, 2.4, 1.6, EX, EY + 7.6, gz, '#efe9dc'), B(23.6, 0.35, 2, EX, EY + 8.9, gz, '#bfa76a'));
    mk(g, mSolid); const sign = new THREE.Mesh(new THREE.PlaneGeometry(19, 2), new THREE.MeshBasicMaterial({ map: canvasTex(1024, 128, (c2, w, h) => { c2.fillStyle = '#10243d'; c2.fillRect(0, 0, w, h); c2.strokeStyle = '#e9c46a'; c2.lineWidth = 6; c2.strokeRect(6, 6, w - 12, h - 12); c2.fillStyle = '#e9c46a'; c2.font = 'bold 66px Georgia, serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText('GOLD COAST ESTATES', w / 2, h / 2 + 3); }, false), side: THREE.DoubleSide }));
    sign.position.set(EX, EY + 7.6, gz + 0.85); scene.add(sign); const sign2 = sign.clone(); sign2.position.z = gz - 0.85; scene.add(sign2);
    const hut = [B(5, 3.4, 4, EX + 16, EY + 1.7, gz, '#efe9dc'), B(6, 0.4, 5, EX + 16, EY + 3.6, gz, '#2b2d31'), B(3, 1.6, 0.1, EX + 16, EY + 2, gz - 2.05, '#223344')]; mk(hut, mVilla); }
  // spine median palms + lamps, gate hedges
  { const pl = [], lm = [];
    let side = 1; for (let z = E.z0 + 40; z < E.z1 - 28; z += 14) { if (Math.abs(z - S1) < 14 || Math.abs(z - S2) < 22) continue; side = -side; pl.push({ x: EX + side * 10.5, y: EY, z, ry: R(0, 6), sx: R(0.9, 1.1), sy: R(0.95, 1.2), sz: 1 }); }
    for (const sz of [S1, S2]) for (let x = E.x0 + 40; x < E.x1 - 30; x += 18) { if (Math.abs(x - EX) < 20) continue; pl.push({ x, y: EY, z: sz + 8.4, ry: R(0, 6), sx: 0.95, sy: 1.05, sz: 0.95 }); }
    for (let z = E.z0 + 40; z < E.z1 - 28; z += 34) { lm.push({ x: EX + 9, y: EY, z, ry: Math.PI }); lm.push({ x: EX - 9, y: EY, z: z + 17, ry: 0 }); }   // palms sit at +-10.5 m, lamps at +-9 m
    for (const sz of [S1, S2]) for (let x = E.x0 + 50; x < E.x1 - 40; x += 40) lm.push({ x, y: EY, z: sz - 8, ry: 0 });
    instances(palmGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), pl); instances(lampGeo, stdV, lm); pl.forEach(p => c.solidAdd(p.x, p.z, 0.4)); lm.forEach(l => c.solidAdd(l.x, l.z, 0.3)); }

  // ---- villas
  const solid = [], vill = [], glass = [], water = [], pave = [], trees = [], palms = [], PW = ['#ffffff', '#f7f3ea', '#efe8d8', '#e9edf0', '#f3e7d3'], ROOF = ['#b5532f', '#a24a2c', '#8f3f26'];
  function villa(cx, cz, face, lotW, type) {                                      // face: +1 = front looks toward +z (south), -1 = toward -z
    const f = face, y = EY, wall = pick(PW), fz = z => cz + z * f, w = type === 'modern' ? R(22, 28) : R(20, 24), d = type === 'modern' ? R(17, 21) : R(15, 18), garX = -w / 2 + 4.5;
    const S = (list, bw, bh, bd, x, yy, z, col) => list.push(B(bw, bh, bd, cx + x, y + yy, fz(z), col)); c.solidBox(cx, fz(-1), w / 2, d * 0.42);
    if (type === 'modern') {
      S(vill, w, 3.8, d * 0.78, 0, 1.9, -1, wall); S(vill, w + 1.2, 0.4, d * 0.78 + 1.2, 0, 4, -1, '#2b2e33');
      S(vill, w * 0.64, 3.5, d * 0.74, w * 0.1, 5.95, 2, pick(['#f7f3ea', '#e5d9c6', '#d8dde1'])); S(vill, w * 0.64 + 1.2, 0.4, d * 0.74 + 1.4, w * 0.1, 7.9, 2, '#2b2e33');
      S(glass, w * 0.55, 3, 0.12, w * 0.1, 5.8, 2 + d * 0.37 + 0.06, '#2a4157'); S(glass, w * 0.5, 2.8, 0.12, w * 0.12, 1.7, -1 + d * 0.39 + 0.06, '#2a4157'); S(vill, w * 0.18, 3.8, 0.45, w * 0.37, 1.9, -1 + d * 0.39 + 0.2, '#8b5a2b');
      S(vill, 5.2, 2.7, 0.12, garX, 1.45, -1 + d * 0.39 + 0.07, '#3a3d42'); S(pave, 6, 0.04, 20, garX, 0.04, d * 0.39 + 10, '#ddd8cc'); S(pave, 2.4, 0.04, 20, w * 0.05, 0.04, d * 0.39 + 10, '#ddd8cc');
      const pz = -1 - d * 0.39 - 7.5; S(pave, w * 0.6 + 2.4, 0.08, 11.6, 0, 0.05, pz, '#efe9dd'); S(water, w * 0.6, 0.05, 9, 0, 0.1, pz, '#2fc6e8');
      for (let k = 0; k < 3; k++) S(vill, 0.8, 0.3, 2, -w * 0.28 + k * 1.5, 0.3, pz - 7.2, '#ffffff');
    } else {
      S(vill, w, 7.6, d * 0.8, 0, 3.8, 0, '#f2e6d0'); S(vill, w * 0.34, 4.6, d * 0.55, -w * 0.64, 2.3, -2, '#ecdcbf'); S(vill, w * 0.34, 4.6, d * 0.55, w * 0.64, 2.3, -2, '#ecdcbf');
      const roof = paint(new THREE.ConeGeometry(0.7071, 1, 4).rotateY(Math.PI / 4).scale(w + 2, 4, d * 0.8 + 2).translate(cx, y + 7.6 + 2, fz(0)), pick(ROOF)); vill.push(roof);
      for (const sx of [-1, 1]) vill.push(paint(new THREE.ConeGeometry(0.7071, 1, 4).rotateY(Math.PI / 4).scale(w * 0.34 + 1.6, 2.2, d * 0.55 + 1.6).translate(cx + sx * w * 0.64, y + 4.6 + 1.1, fz(-2)), pick(ROOF)));
      const fy = d * 0.4; S(vill, w * 0.5, 0.5, 3.6, 0, 7.2, fy + 1.5, '#fbf7ee'); for (const sx of [-0.22, -0.07, 0.07, 0.22]) vill.push(paint(new THREE.CylinderGeometry(0.34, 0.38, 7, 10).translate(cx + sx * w, y + 3.5, fz(fy + 2.8)), '#fbf7ee'));
      S(vill, w * 0.5, 0.3, 3.8, 0, 0.18, fy + 1.9, '#d8d3c4'); S(glass, 2.2, 3.2, 0.12, 0, 1.7, fy + 0.07, '#3a2a1c');
      for (const sx of [-0.38, -0.3, 0.3, 0.38, -0.2, 0.2]) { S(glass, 1.5, 2.2, 0.12, sx * w, 2, d * 0.4 + 0.07, '#2a4157'); S(glass, 1.5, 2.2, 0.12, sx * w, 5.4, d * 0.4 + 0.07, '#2a4157'); }
      S(pave, 3, 0.04, 26, 0, 0.04, d * 0.4 + 13, '#d8d3c4'); const pz = -d * 0.4 - 7.5; S(pave, w * 0.55 + 2.4, 0.08, 11.6, 0, 0.05, pz, '#efe9dd'); S(water, w * 0.55, 0.05, 9, 0, 0.1, pz, '#2fc6e8');
    }
    const fr = 19.2;                                                              // front wall + hedge + gate pillars along the street edge of the lot
    for (const [x0, x1] of [[-lotW / 2, (type === 'modern' ? garX : 0) - 3.4], [(type === 'modern' ? garX : 0) + 3.4, lotW / 2]]) { if (x1 - x0 < 1) continue; S(vill, x1 - x0, 1.1, 0.5, (x0 + x1) / 2, 0.55, fr, '#f4f0e6'); S(solid, x1 - x0, 0.9, 1.2, (x0 + x1) / 2, 1.5, fr - 0.4, '#2f7d36'); }
    for (const sx of [(type === 'modern' ? garX : 0) - 3.4, (type === 'modern' ? garX : 0) + 3.4]) { S(vill, 0.9, 2.6, 0.9, sx, 1.3, fr, '#f4f0e6'); S(vill, 1.1, 0.3, 1.1, sx, 2.75, fr, '#e9c46a'); }
    for (const [sx, sz] of [[w * 0.55, 3], [-w * 0.55, 6], [w * 0.2, -d * 0.7]]) palms.push({ x: cx + sx, y, z: fz(sz), ry: R(0, 6), sx: R(0.9, 1.2), sy: R(0.9, 1.3), sz: 1 });
    for (let k = 0; k < 3; k++) trees.push({ x: cx + R(-lotW / 2 + 3, lotW / 2 - 3), y, z: fz(R(-18, -14)), ry: R(0, 6), sx: R(0.45, 0.7), c: new THREE.Color().setHSL(R(0.27, 0.35), 0.3, R(0.8, 1.0)).getHex() });
  }
  const bands = [[S1 - 26, 1, 0], [S1 + 26, -1, 0], [S2 - 26, 1, 0], [S2 + 26, -1, 0]];                // [centre z, face toward street, -]
  const lotXs = [-640, -590, -540, -410, -360, -310], pad = [E.x0, E.x1];
  for (const [bz, face] of bands) for (const lx of lotXs) { if (bz + 20 > E.z1 - 50) continue; villa(lx, bz, face, 46, rnd() < 0.55 ? 'modern' : 'classic'); }
  // front gardens near the gate: hedged flower beds, palms, benches
  { const fl = [];
    for (const side of [-1, 1]) for (let k = 0; k < 4; k++) { const x = EX + side * (22 + k * 28), z = E.z1 - 38; fl.push(B(16, 1, 1.2, x, EY + 0.5, z, '#2f7d36'), B(9, 0.3, 2.6, x, EY + 0.15, z + 2.4, pick(['#e8a0b4', '#f4c27a', '#f1d98a', '#d98fb0', '#f7e1a0'])));
      palms.push({ x: x - 7, y: EY, z: z + 1, ry: R(0, 6), sx: 1, sy: 1.2, sz: 1 }); }
    mk(fl, mSolid); }
  mk(solid, mSolid); mk(vill, mVilla); mk(glass, mWin, false); mk(pave, mFlat, false); mk(water, mWater, false);
  palms.forEach(p => c.solidAdd(p.x, p.z, 0.4)); instances(palmGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), palms); instances(treeGeo, stdVs, trees);
  return { lots };
}
