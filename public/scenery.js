// scenery.js - fills the countryside: patchwork crop fields, woods, hamlets, roadside dressing, utility poles, desert plants.
// Layout is seeded, so every player sees the same world. Solid things stay clear of every road.
import * as THREE from 'three';
import * as W from './world.js';

const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const isDesert = (x, z) => W.dryness(x, z) > 0.5;
export const isSnow = (x, z) => z < -2950 && x < 3100;
// open countryside: not a district, mall, attraction, beach, garage yard or the overlook
export function rural(x, z, margin = 0) {
  if (W.districtAt(x, z, 1.1) || W.seaward(x, z) > -45 - margin || W.pavedAt(x, z)) return false;
  for (const m of W.MALLS) if (Math.abs(x - m.x) < W.MALL_W / 2 + margin && Math.abs(z - m.z) < W.MALL_D / 2 + margin) return false;
  for (const s of W.SPOTS) if (Math.hypot(x - s.x, z - s.z) < s.r * 0.9 + margin) return false;
  for (const g of W.GARAGES) if (Math.hypot(x - g.cx, z - g.cz) < 34 + margin) return false;
  for (const p of W.PADS) if (Math.hypot(x - p.x, z - p.z) < p.r + 8 + margin) return false;
  return true;
}
const roadDist = (x, z, max) => W.anyRoadDist(x, z, max + 6);   // any road

// ---- crop fields: a rotated grid, some cells farmed. fieldAt() is also used by the terrain colouring.
export const FIELD_TYPES = [
  { name: 'paddy', color: 0x5d8f86, plant: 'crop', h: 0.34 }, { name: 'paddy', color: 0x6f9a6a, plant: 'crop', h: 0.5 }, { name: 'tea', color: 0x3c5f2c, plant: 'bush', h: 0.42 },
  { name: 'wheat', color: 0xcfae52, plant: 'wheat', h: 0.8 }, { name: 'rape', color: 0xb9b23a, plant: 'rape', h: 0.65 },
];
const FU = 96, FV = 72, CA = 0.94, SA = 0.341, cells = new Map();
const toXZ = (u, v) => [u * CA - v * SA, u * SA + v * CA];
function fieldCell(cu, cv) {
  const key = cu * 4096 + cv; let f = cells.get(key); if (f !== undefined) return f;
  f = null;
  if (hash(cu + 31, cv - 7) < 0.3) {
    const [x, z] = toXZ((cu + 0.5) * FU, (cv + 0.5) * FV), h = W.terrainH(x, z);
    const flat = [[0, 0], [30, 20], [-30, 20], [30, -20], [-30, -20]].every(([a, b]) => W.terrainSlope(x + a, z + b) < 0.12);
    if (flat && h > 1.8 && h < 45 && !isDesert(x, z) && rural(x, z, 40)) f = { cu, cv, type: FIELD_TYPES[(hash(cu - 3, cv + 11) * FIELD_TYPES.length) | 0] };
  }
  cells.set(key, f); return f;
}
export function fieldAt(x, z) {
  const u = x * CA + z * SA, v = -x * SA + z * CA, cu = Math.floor(u / FU), cv = Math.floor(v / FV);
  if (u - cu * FU < 7 || v - cv * FV < 7) return null;                    // grass lanes between fields
  return fieldCell(cu, cv);
}

// ---- house and villa models, used by the towns and the countryside
const paintG = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const box = (w, h, d, x, y, z, col) => paintG(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col);
function join(list) {
  const pos = [], nor = [], col = [];
  for (let g of list) { if (g.index) g = g.toNonIndexed(); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); col.push(...g.attributes.color.array); }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); o.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return o;
}
export function houseGeo(wall, roof, w, d, hgt) {
  const g = [box(w, hgt + 2.2, d, 0, (hgt - 2.2) / 2, 0, wall)];
  const r = new THREE.CylinderGeometry(0.34, 0.7071, 1, 4).rotateY(Math.PI / 4).scale(w + 1.4, d * 0.3, d + 1.4).translate(0, hgt + d * 0.15, 0);
  g.push(paintG(r, roof), box(w + 1.6, 0.14, d + 1.6, 0, hgt + 0.07, 0, '#3a3d42'), box(1.3, 2.1, 0.14, 0, 1.05, d / 2, '#3d2a1c'));
  for (const sx of [-w * 0.32, w * 0.32]) for (const sz of [d / 2, -d / 2]) { g.push(box(1.4, 1.1, 0.1, sx, 1.55, sz, '#7fb4d6')); if (hgt > 4) g.push(box(1.4, 1.1, 0.1, sx, 4, sz, '#7fb4d6')); }
  return join(g);
}
export function villaGeo(wall, roof) {
  return join([box(15, 2.4, 13, 0, -1, 0, '#cfc6b4'), box(10, 3.4, 8, -1.5, 1.9, -1.5, wall), box(6, 3, 6, -3, 5.1, -2, wall), box(11, 0.3, 9, -1.5, 3.75, -1.5, roof), box(7, 0.3, 7, -3, 6.75, -2, roof),
    box(7, 2.1, 0.12, -1, 1.5, 2.56, '#7fb4d6'), box(4, 1.7, 0.12, -3, 5.1, 1.06, '#7fb4d6'), box(4.4, 2.8, 6, 5.7, 1.6, -2.5, wall), box(3.4, 2.2, 0.12, 5.7, 1.3, 0.56, '#6d5844'),
    box(6.4, 0.12, 4.4, -2, 0.27, 5, '#f2f2ee'), box(5.6, 0.1, 3.6, -2, 0.32, 5, '#2fb6d9'), box(15, 0.9, 0.6, 0, 0.6, -6.4, '#3f7a3a'), box(0.6, 0.9, 13, -7.4, 0.6, 0, '#3f7a3a')]);
}

// ---- everything else
export function buildScenery({ scene, rnd, merge, paint, instances, foliage, solidAdd, solidBox, taken }) {
  const R = (a, b) => a + (b - a) * rnd();
  const tint = (h = 0.28, spread = 0.06, l0 = 0.78, l1 = 1) => new THREE.Color().setHSL(h + R(-spread, spread), R(0.1, 0.35), R(l0, l1)).getHex();
  const put = (kind, list, opts) => instances(foliage[kind].geo, foliage[kind].mat, list, opts);
  const B = W.BOUNDS, more = (B.x1 - B.x0) * (B.z1 - B.z0) / 3e7, anywhere = () => [R(B.x0 + 80, B.x1 - 80), R(B.z0 + 80, B.z1 - 80)];
  const open = (x, z, minRoad) => { const h = W.terrainH(x, z); if (h < 1.8 || h > (z < -2450 || x > 3000 ? 240 : 150) || !rural(x, z) || taken(x, z) || W.terrainSlope(x, z) > 0.5 || fieldAt(x, z)) return null; const d = roadDist(x, z, minRoad); return d > minRoad ? h : null; };
  const houseMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

  // hamlets: a few farmhouses in the open
  const kinds = [houseGeo('#f2ede2', '#3a4350', 8, 6.4, 3.2), houseGeo('#8a6246', '#2f3338', 7, 6, 3.1), houseGeo('#f2ede2', '#8f4636', 11, 8, 5.4)], placed = [[], [], []], yards = [], all = [];
  for (let n = 0; n < 9000 * more && yards.length < 45 * more; n++) {
    const [x, z] = anywhere(); if (isDesert(x, z) || open(x, z, 34) === null || roadDist(x, z, 130) > 130 || W.terrainSlope(x, z) > 0.1 || yards.some(p => Math.hypot(x - p.x, z - p.z) < 220)) continue;
    yards.push({ x, z });
    for (let k = 0, got = 0; k < 20 && got < 3; k++) {
      const hx = x + R(-26, 26), hz = z + R(-26, 26), hh = open(hx, hz, 20); if (hh === null || W.terrainSlope(hx, hz) > 0.14 || all.some(p => Math.hypot(hx - p.x, hz - p.z) < 15)) continue;
      const t = (rnd() * 3) | 0, turn = (rnd() * 4 | 0) * Math.PI / 2; placed[t].push({ x: hx, y: hh, z: hz, ry: turn }); all.push({ x: hx, z: hz }); got++; solidBox(hx, hz, 4.5, 4.5);
    }
  }
  kinds.forEach((g, i) => instances(g, houseMat, placed[i], { receive: true }));
  const clearOfHouses = (x, z, d) => !all.some(p => Math.abs(x - p.x) < d && Math.abs(z - p.z) < d);

  // woods
  const frost = () => new THREE.Color(1.9, 2.15, 2.6).multiplyScalar(R(0.8, 1.15));   // snow-covered firs
  const broad = [], pine = [], bush = [], cactus = [];
  const tree = (list, x, z, d, s, c, sy = 1.15) => { const h = open(x, z, d); if (h === null || !clearOfHouses(x, z, 10)) return false; list.push({ x, y: h - 0.25, z, ry: R(0, 6), sx: s, sy: s * R(0.85, sy), sz: s, c }); if (roadDist(x, z, 40) < 36) solidAdd(x, z, 0.4 * s); return true; };
  for (let n = 0, groves = 0; n < 20000 * more && groves < 800 * more; n++) {
    const [cx, cz] = anywhere(); if (isDesert(cx, cz) || open(cx, cz, 16) === null) continue; groves++;
    const conifer = cz < -900 && rnd() < (cx > 3050 ? 0.5 : 0.85), count = 5 + (rnd() * 14 | 0), rad = 12 + rnd() * 30;
    for (let k = 0; k < count; k++) {
      const a = R(0, 6.283), d = Math.sqrt(rnd()) * rad, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, s = R(0.7, 1.25);
      tree(conifer || isSnow(x, z) ? pine : broad, x, z, 12, s, isSnow(x, z) ? frost() : tint(), conifer ? 1.45 : 1.25);
    }
  }
  for (let n = 0; n < 30000 * more && bush.length < 2200 * more; n++) { const [x, z] = anywhere(), h = isDesert(x, z) || isSnow(x, z) ? null : open(x, z, 10); if (h !== null) { const s = R(0.5, 1.4); bush.push({ x, y: h - 0.15, z, ry: R(0, 6), sx: s, sy: s * R(0.8, 1.2), sz: s, c: tint() }); } }
  // forest up the sides of the green highlands (too far from the road to drive into)
  for (let n = 0, got = 0; n < 60000 && got < 4500; n++) { const x = R(3060, B.x1 - 90), z = R(B.z0 + 90, 150), h = W.terrainH(x, z); if (h < 3 || h > 200 || W.terrainSlope(x, z) < 0.22 || W.terrainSlope(x, z) > 1.25 || roadDist(x, z, 30) < 24 || taken(x, z) || W.districtAt(x, z, 1.1) || W.fbm(x / 140, z / 140) < 0.4) continue;
    const s = R(0.8, 1.5); (rnd() < 0.65 ? pine : broad).push({ x, y: h - 0.9 * s, z, ry: R(0, 6), sx: s, sy: s * R(0.9, 1.3), sz: s, c: tint() }); got++; }
  // desert: cacti, dry scrub and boulders
  const arm = (x, y, h) => [paint(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 7).rotateZ(Math.PI / 2).translate(x / 2, y, 0), '#4f7a46'), paint(new THREE.CylinderGeometry(0.22, 0.22, h, 7).translate(x, y + h / 2, 0), '#4f7a46')];
  const cactusG = merge([paint(new THREE.CylinderGeometry(0.34, 0.4, 4.6, 9).translate(0, 2.2, 0), '#4f7a46'), ...arm(0.9, 2, 1.6), ...arm(-0.9, 2.6, 1.2)]), boulders = [], scrub = [];
  for (let n = 0; n < 40000 && cactus.length < 900; n++) { const x = R(1500, B.x1 - 60), z = R(B.z0 + 60, 750); if (!isDesert(x, z)) continue; const h = open(x, z, 12); if (h === null) continue; const s = R(0.7, 1.5); cactus.push({ x, y: h - 0.2, z, ry: R(0, 6), sx: s, sy: s * R(0.8, 1.3), sz: s }); if (roadDist(x, z, 30) < 26) solidAdd(x, z, 0.45 * s); }
  for (let n = 0; n < 60000 && scrub.length < 2600; n++) { const x = R(1500, B.x1 - 40), z = R(B.z0 + 40, 750), h = W.terrainH(x, z); if (!isDesert(x, z) || h < 1.8 || roadDist(x, z, 9) < 8.6 || taken(x, z) || W.districtAt(x, z)) continue; const s = R(0.4, 1.1); scrub.push({ x, y: h - 0.1, z, ry: R(0, 6), sx: s, sy: s * 0.7, sz: s, c: tint(0.12, 0.03, 0.55, 0.85) });
    if (rnd() < 0.18) { const k = R(0.6, 3), bx = x + R(-6, 6), bz = z + R(-6, 6); if (roadDist(bx, bz, 14) > 12) { boulders.push({ x: bx, y: W.terrainH(bx, bz) + k * 0.2, z: bz, ry: R(0, 6), rx: R(-0.3, 0.3), sx: k * 1.3, sy: k * 0.8, sz: k, c: new THREE.Color().setHSL(0.06, 0.35, R(0.34, 0.52)).getHex() }); solidAdd(bx, bz, k * 0.9); } } }
  instances(cactusG, houseMat, cactus);
  // rocks on the slopes
  for (let n = 0; n < 60000 * more && boulders.length < 3000 * more; n++) { const [x, z] = anywhere(), h = W.terrainH(x, z), sl = W.terrainSlope(x, z); if (h < 9 || !(sl > 0.32 || rnd() < 0.03) || roadDist(x, z, 12) < 11 || taken(x, z) || W.districtAt(x, z)) continue;
    const k = R(0.8, 3.4) * (sl > 0.7 ? 0.6 : 1), dry = isDesert(x, z); boulders.push({ x, y: h + k * 0.15 - Math.min(1, sl) * k * 0.55, z, ry: R(0, 6), rx: R(-.3, .3), sx: k * R(0.9, 1.5), sy: k * R(0.6, 1), sz: k * R(0.9, 1.4), c: new THREE.Color().setHSL(dry ? 0.06 : 0.08, dry ? 0.35 : 0.06, R(0.35, 0.58)).getHex() }); }
  instances(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), boulders);

  // roadside dressing along every road (all drive-through)
  const tufts = [], flowers = [];
  const verge = (p, nx, nz, from) => {
    for (const side of [-1, 1]) {
      const lat = side * (from + Math.pow(rnd(), 1.6) * 14), x = p.x + nx * lat, z = p.z + nz * lat, h = W.terrainH(x, z);
      if (h < 1.8 || isDesert(x, z) || isSnow(x, z) || W.districtAt(x, z, 1.02) || taken(x, z) || roadDist(x, z, 9) < 8.2) continue;
      const roll = rnd(), k = R(0.6, 1.3), item = { x, y: h - 0.05, z, ry: R(0, 6), sx: k, sy: k * R(0.5, 0.9), sz: k };
      if (roll < 0.7) tufts.push({ ...item, c: tint() }); else if (roll < 0.82) flowers.push({ ...item, sy: k * 0.5 });
    }
  };
  for (let s = 0; s < W.ROAD.L; s += 4.5) { const p = W.roadAt(s); verge(p, -p.tz, p.tx, W.ROAD_HALF + 2.6); }
  for (const pts of W.SIDE_ROADS) { let next = 0; for (const p of pts) if (p.s >= next) { next = p.s + 5; verge(p, -p.tz, p.tx, 7.6); } }
  for (let n = 0; n < 40000 * more && flowers.length < 6000; n++) { const [x, z] = anywhere(), h = isDesert(x, z) || isSnow(x, z) ? null : open(x, z, 12); if (h === null || W.fbm(x / 35, z / 35) < 0.58) continue; for (let k = 0; k < 5; k++) { const fx = x + R(-3, 3), fz = z + R(-3, 3); flowers.push({ x: fx, y: W.terrainH(fx, fz) - 0.04, z: fz, ry: R(0, 6), sx: R(0.7, 1.2), sy: R(0.35, 0.6), sz: R(0.7, 1.2) }); } }
  // tree lines beside country roads
  for (let k = 0; k < W.SIDE_ROADS.length; k++) {
    const kind = W.SIDE_ROADS.kinds[k]; if (kind === 'ring' || kind === 'track') continue; let next = 12;
    for (const p of W.SIDE_ROADS[k]) { if (p.s < next) continue; next = p.s + R(14, 26); for (const side of [-1, 1]) { if (rnd() < 0.4) continue; const lat = side * R(10, 15), x = p.x - p.tz * lat, z = p.z + p.tx * lat; if (isDesert(x, z)) continue; tree(kind === 'pass' || isSnow(x, z) ? pine : broad, x, z, 9.6, R(0.75, 1.15), isSnow(x, z) ? frost() : tint(), 1.3); } }
  }
  put('broad', broad); put('pine', pine); put('bush', bush.concat(scrub));
  put('grass', tufts, { cast: false, receive: true }); put('flowers', flowers, { cast: false, receive: true });

  // marker posts on the mountain and desert roads
  const posts = [];
  W.SIDE_ROADS.forEach((pts, k) => { if (!['pass', 'highway'].includes(W.SIDE_ROADS.kinds[k])) return; let next = 6; for (const p of pts) { if (p.s < next) continue; next = p.s + 24; for (const side of [-1, 1]) { const x = p.x - p.tz * side * 6.2, z = p.z + p.tx * side * 6.2; if (roadDist(x, z, 8) < 6.5 || W.carve(x, z) > 0.3) continue; posts.push({ x, y: W.terrainH(x, z), z }); } } });
  instances(merge([paint(new THREE.BoxGeometry(0.12, 0.9, 0.12).translate(0, 0.45, 0), '#f2f2f2'), paint(new THREE.BoxGeometry(0.13, 0.18, 0.13).translate(0, 0.72, 0), '#e63946')]), houseMat, posts);

  // crops in rows, hay bales on the wheat
  const plants = {}, bales = [];
  const baleGeo = merge([paint(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 12).rotateZ(Math.PI / 2), '#d8b455')]);
  for (let cu = -48; cu <= 48; cu++) for (let cv = -48; cv <= 48; cv++) {
    const f = fieldCell(cu, cv); if (!f) continue; const t = f.type;
    if (t.plant) for (let v = 9; v < FV - 2; v += 5.5) for (let u = 9; u < FU - 2; u += 3.4) { const [x, z] = toXZ(cu * FU + u + R(-0.25, 0.25), cv * FV + v + R(-0.2, 0.2)), s = R(0.9, 1.3); if (roadDist(x, z, 14) < 11 || taken(x, z)) continue; (plants[t.plant] ||= []).push({ x, y: W.terrainH(x, z) - 0.05, z, ry: R(0, 6), sx: (t.plant === 'bush' ? 1 : 3) * s, sy: t.h * s * (t.plant === 'bush' ? 2 : 1), sz: (t.plant === 'bush' ? 1 : 3) * s }); }
    if (t.name === 'wheat') for (let k = 0; k < 4; k++) { const [x, z] = toXZ(cu * FU + R(14, FU - 8), cv * FV + R(14, FV - 8)); if (roadDist(x, z, 14) < 11 || taken(x, z)) continue; bales.push({ x, y: W.terrainH(x, z) + 0.65, z, ry: R(0, 3.1) }); solidAdd(x, z, 0.75); }
  }
  for (const k of Object.keys(plants)) put(k, plants[k], { cast: false, receive: true });
  instances(baleGeo, houseMat, bales);

  // utility poles with sagging wires along the main road in the open country
  const pole = merge([paint(new THREE.CylinderGeometry(0.11, 0.17, 9, 7).translate(0, 4.4, 0), '#6d4f36'), paint(new THREE.BoxGeometry(2, 0.14, 0.14).translate(0, 8.4, 0), '#5a412c')]), poles = [], wire = [];
  let prev = null;
  for (let s = 0; s < W.ROAD.L; s += 34) {
    const p = W.roadAt(s, 11.5), h = W.terrainH(p.x, p.z), c = W.roadAt(s);
    if (!rural(p.x, p.z) || h < 3 || Math.abs(h - c.y) > 2.5 || roadDist(p.x, p.z, 11) < 10 || taken(p.x, p.z)) { prev = null; continue; }
    poles.push({ x: p.x, y: h - 0.2, z: p.z, ry: Math.atan2(c.tx, c.tz) }); solidAdd(p.x, p.z, 0.17);
    const ends = [-0.85, 0.85].map(o => new THREE.Vector3(p.x - c.tz * o, h + 8.25, p.z + c.tx * o));
    if (prev) ends.forEach((e, k) => { for (let i = 0; i < 6; i++) for (const t of [i / 6, (i + 1) / 6]) { const v = prev[k].clone().lerp(e, t); v.y -= 2.4 * t * (1 - t); wire.push(v.x, v.y, v.z); } });
    prev = ends;
  }
  instances(pole, houseMat, poles);
  if (wire.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3)); scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2a2d33, transparent: true, opacity: 0.6 }))); }

  // windmills over the meadows
  const mill = merge([paint(new THREE.CylinderGeometry(1.8, 3.4, 14, 10).translate(0, 6.6, 0), '#f2ede2'), paint(new THREE.ConeGeometry(2.5, 2.8, 10).translate(0, 15, 0), '#5a3b28'), ...[0, 1, 2, 3].map(i => paint(new THREE.BoxGeometry(1.5, 9, 0.15).translate(0, 5, 2.7).rotateZ(i * Math.PI / 2 + 0.4).translate(0, 12.6, 0), '#8a6246'))]);
  const mills = [];
  for (let n = 0; n < 4000 && mills.length < 7; n++) { const [x, z] = anywhere(); if (isDesert(x, z) || open(x, z, 24) === null || roadDist(x, z, 90) > 90 || !clearOfHouses(x, z, 14) || mills.some(m => Math.hypot(x - m.x, z - m.z) < 600)) continue; mills.push({ x, y: W.terrainH(x, z) - 0.2, z, ry: R(-0.5, 0.5) }); solidAdd(x, z, 3.4); }
  instances(mill, houseMat, mills);
  // arrow boards on every tight bend
  const boards = [];
  for (let k = 0; k < W.SIDE_ROADS.length; k++) { if (W.SIDE_ROADS.kinds[k] === 'ring') continue; const P = W.SIDE_ROADS[k]; let next = 0; for (let i = 5; i + 5 < P.length; i++) { const p = P[i], a = P[i - 5], b = P[i + 5], turn = a.tx * b.tz - a.tz * b.tx; if (Math.abs(turn) < 0.42 || p.s < next) continue; next = p.s + 9; const out = turn > 0 ? 1 : -1, x = p.x + p.tz * out * 7, z = p.z - p.tx * out * 7; if (roadDist(x, z, 9) < 6.6 || !rural(x, z)) continue; boards.push({ x, y: Math.max(W.terrainH(x, z), p.y - 0.6) - 0.05, z, ry: Math.atan2(-p.tx, -p.tz), left: turn > 0 }); } }
  const board = dir => merge([paint(new THREE.BoxGeometry(0.1, 1, 0.1).translate(0, 0.5, 0), '#8a9199'), paint(new THREE.BoxGeometry(1.1, 0.8, 0.07).translate(0, 1.35, 0), '#ffcc00'), ...[-0.2, 0.22].flatMap(cx => [1, -1].map(s => paint(new THREE.BoxGeometry(0.14, 0.42, 0.09).rotateZ(s * dir * 0.7).translate(cx, 1.35 + s * 0.14, 0.01), '#17181c')))]);
  instances(board(-1), houseMat, boards.filter(b => !b.left).map(({ left, ...b }) => b)); instances(board(1), houseMat, boards.filter(b => b.left).map(({ left, ...b }) => b));
  return {
    counts: { hamlets: all.length, windmills: mills.length, trees: broad.length + pine.length, cacti: cactus.length, rocks: boulders.length, tufts: tufts.length, flowers: flowers.length, crops: Object.values(plants).reduce((a, l) => a + l.length, 0), poles: poles.length },
  };
}
