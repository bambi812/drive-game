// scenery.js - fills the countryside: patchwork crop fields, groves, farmhouses, roadside dressing, utility poles, beach details.
// Layout is seeded, so every player sees the same world. Solid things stay >= 11 m from the road.
import * as THREE from 'three';
import * as W from './world.js';

const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const near = (R, x, z, m) => x > R.x0 - m && x < R.x1 + m && z > R.z0 - m && z < R.z1 + m;
// open countryside: not city, estate, beach strip, garage yards or the overlook
function rural(x, z, margin = 0) {
  if (near(W.CITY_RECT, x, z, 50 + margin) || W.isBeach(x, z, margin)) return false;
  if (Math.hypot(x - W.ESTATE.x, z - W.ESTATE.z) < W.ESTATE.r * 0.55 + margin) return false;
  for (const g of W.GARAGES) if (Math.hypot(x - g.cx, z - g.cz) < 34 + margin) return false;
  for (const p of W.PADS) if (Math.hypot(x - p.x, z - p.z) < p.r + 8 + margin) return false;
  return true;
}
const roadDist = (x, z, max) => W.anyRoadDist(x, z, max + 6);   // any road: main loop, side roads, city streets

// ---- crop fields: a rotated grid, some cells farmed. fieldAt() is also used by the terrain colouring.
export const FIELD_TYPES = [
  { name: 'paddy', color: 0x5d8f86, plant: 'crop', h: 0.34 }, { name: 'paddy', color: 0x6f9a6a, plant: 'crop', h: 0.5 }, { name: 'tea', color: 0x3c5f2c, plant: 'bush', h: 0.42 },
  { name: 'wheat', color: 0xcfae52, plant: 'wheat', h: 0.8 }, { name: 'rape', color: 0xb9b23a, plant: 'rape', h: 0.65 },
];const FU = 96, FV = 72, CA = 0.94, SA = 0.341, cells = new Map();
const toXZ = (u, v) => [u * CA - v * SA, u * SA + v * CA];
function fieldCell(cu, cv) {
  const key = cu * 4096 + cv; let f = cells.get(key); if (f !== undefined) return f;
  f = null;
  if (hash(cu + 31, cv - 7) < 0.4) {
    const [x, z] = toXZ((cu + 0.5) * FU, (cv + 0.5) * FV), h = W.terrainH(x, z);
    const flat = [[0, 0], [30, 20], [-30, 20], [30, -20], [-30, -20]].every(([a, b]) => W.terrainSlope(x + a, z + b) < 0.12);
    if (flat && h > 1.4 && h < 60 && rural(x, z, 40)) f = { cu, cv, type: FIELD_TYPES[(hash(cu - 3, cv + 11) * FIELD_TYPES.length) | 0] };
  }
  cells.set(key, f); return f;
}
export function fieldAt(x, z) {
  const u = x * CA + z * SA, v = -x * SA + z * CA, cu = Math.floor(u / FU), cv = Math.floor(v / FV);
  if (u - cu * FU < 7 || v - cv * FV < 7) return null;                    // grass lanes between fields
  return fieldCell(cu, cv);
}

// ---- everything else
export function buildScenery({ scene, rnd, merge, paint, instances, foliage, solidAdd, solidBox }) {
  const R = (a, b) => a + (b - a) * rnd();
  const tint = (h = 0.28, spread = 0.06, l0 = 0.78, l1 = 1) => new THREE.Color().setHSL(h + R(-spread, spread), R(0.1, 0.35), R(l0, l1)).getHex();
  const put = (kind, list, opts) => instances(foliage[kind].geo, foliage[kind].mat, list, opts);
  const open = (x, z, minRoad) => { const h = W.terrainH(x, z); if (h < 1.2 || h > 150 || !rural(x, z) || W.terrainSlope(x, z) > 0.5 || fieldAt(x, z)) return null; const d = roadDist(x, z, minRoad); return d > minRoad ? h : null; };
  const BX = { x0: -1330, x1: 1650, z0: -1250, z1: 1380 };

  // farmhouses (small hamlets), barns and silos
  const house = (wall, roof, w, d, hgt) => {
    const g = [paint(new THREE.BoxGeometry(w, hgt + 1.2, d).translate(0, (hgt - 1.2) / 2, 0), wall)];
    const tiles = (y, ww, dd, rise) => {                                       // hipped tile roof with wide eaves and a ridge
      const r = new THREE.CylinderGeometry(0.34, 0.7071, 1, 4).rotateY(Math.PI / 4).scale(ww, rise, dd).translate(0, y + rise / 2, 0);
      g.push(paint(r, roof), paint(new THREE.BoxGeometry(ww + 0.25, 0.14, dd + 0.25).translate(0, y + 0.07, 0), '#23262b'), paint(new THREE.BoxGeometry(ww * 0.52, 0.2, 0.32).translate(0, y + rise + 0.05, 0), '#23262b')); };
    tiles(hgt, w + 2, d + 2, d * 0.28);
    if (hgt > 4) tiles(hgt * 0.5, w + 1.1, d + 1.1, 0.5);                       // a lower eave between the floors
    for (const sx of [-w / 2, -w / 6, w / 6, w / 2]) g.push(paint(new THREE.BoxGeometry(0.18, hgt, 0.12).translate(sx, hgt / 2, d / 2 + 0.02), '#5a3b28'));
    g.push(paint(new THREE.BoxGeometry(w, 0.18, 0.12).translate(0, hgt * 0.5, d / 2 + 0.02), '#5a3b28'), paint(new THREE.BoxGeometry(1.3, 2.1, 0.14).translate(0, 1.05, d / 2), '#3d2a1c'));
    for (const sx of [-w * 0.33, w * 0.33]) for (const sz of [d / 2, -d / 2]) g.push(paint(new THREE.BoxGeometry(1.4, 1.1, 0.1).translate(sx, 1.55, sz), '#f6efd9'), paint(new THREE.BoxGeometry(0.07, 1.1, 0.14).translate(sx, 1.55, sz), '#5a3b28'));
    return merge(g);
  };
  const kinds = [{ w: 8, d: 6.4, geo: house('#f2ede2', '#3a4350', 8, 6.4, 3.2) }, { w: 7, d: 6, geo: house('#8a6246', '#2f3338', 7, 6, 3.1) }, { w: 11, d: 8, geo: house('#f2ede2', '#4a3f45', 11, 8, 5.4) }];
  const silo = merge([paint(new THREE.CylinderGeometry(2, 2, 7, 12).translate(0, 3.2, 0), '#e8e2d2'), paint(new THREE.ConeGeometry(2.9, 2, 4).rotateY(Math.PI / 4).translate(0, 7.7, 0), '#2f3338')]);  const houseMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), placed = [[], [], []], silos = [], yards = [];
  for (let n = 0; n < 6000 && yards.length < 38; n++) {
    if (yards.length === 0) yards.push({ x: W.VILLAGE.x, z: W.VILLAGE.z });
    const x = R(BX.x0, BX.x1), z = R(-550, 1350), h = open(x, z, 34); if (h === null || roadDist(x, z, 150) > 150 || W.terrainSlope(x, z) > 0.1 || yards.some(p => Math.hypot(x - p.x, z - p.z) < 130)) continue;
    yards.push({ x, z });
    const vil = yards.length === 1, spread = vil ? W.VILLAGE.r : 24, want = vil ? 34 : 3;
    for (let k = 0, got = 0; k < (vil ? 600 : 20) && got < want; k++) {
      const hx = x + R(-spread, spread), hz = z + R(-spread, spread), hh = open(hx, hz, 22); if (hh === null || W.terrainSlope(hx, hz) > 0.14 || placed.flat().some(p => Math.hypot(hx - p.x, hz - p.z) < 15)) continue;
      const t = got % 5 === 2 ? 2 : (rnd() * 2) | 0, turn = (rnd() * 4 | 0) * Math.PI / 2, k2 = kinds[t]; placed[t].push({ x: hx, y: hh, z: hz, ry: turn }); got++;
      const odd = Math.abs(Math.sin(turn)) > 0.5; solidBox(hx, hz, (odd ? k2.d : k2.w) / 2, (odd ? k2.w : k2.d) / 2);
      if (t === 2) { const sx = hx + 10, sz = hz + 2, sh = open(sx, sz, 22); if (sh !== null) { silos.push({ x: sx, y: sh, z: sz }); solidAdd(sx, sz, 2); } }
    }
  }
  kinds.forEach((k, i) => instances(k.geo, houseMat, placed[i], { receive: true })); instances(silo, houseMat, silos);
  const clearOfHouses = (x, z, d) => !placed.flat().some(p => Math.hypot(x - p.x, z - p.z) < d);

  // groves: clusters of trees across the open land
  const broad = [], pine = [], bush = [];
  for (let n = 0, groves = 0; n < 12000 && groves < 380; n++) {
    const cx = R(BX.x0, BX.x1), cz = R(-750, 1380); if (open(cx, cz, 18) === null) continue; groves++;
    const conifer = (cz < -300 || cx > 700) && rnd() < 0.75, count = 5 + (rnd() * 16 | 0), rad = 10 + rnd() * 26;
    for (let k = 0; k < count; k++) {
      const a = R(0, 6.283), d = Math.sqrt(rnd()) * rad, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, h = open(x, z, 12); if (h === null || !clearOfHouses(x, z, 11)) continue;
      const s = R(0.7, 1.25); (conifer ? pine : broad).push({ x, y: h - 0.2, z, ry: R(0, 6), sx: s, sy: s * R(0.85, 1.3), sz: s, c: tint() }); solidAdd(x, z, 0.4 * s);
      if (rnd() < 0.45) { const bx = x + R(-4, 4), bz = z + R(-4, 4), bh = open(bx, bz, 10); if (bh !== null) bush.push({ x: bx, y: bh - 0.15, z: bz, ry: R(0, 6), sx: R(0.5, 1.1), c: tint() }); }
    }
  }
  // lone trees over the lowland plain, and hedgerows along some field edges
  const oak = (x, z, s) => { const h = open(x, z, 12); if (h === null || !clearOfHouses(x, z, 11)) return; broad.push({ x, y: h - 0.2, z, ry: R(0, 6), sx: s, sy: s * R(0.85, 1.25), sz: s, c: tint() }); solidAdd(x, z, 0.4 * s); };
  for (let n = 0, got = 0; n < 9000 && got < 650; n++) { const before = broad.length; oak(R(-350, 900), R(-500, 1350), R(0.6, 1.3)); got += broad.length - before; }
  for (let cu = -24; cu <= 24; cu++) for (let cv = -24; cv <= 24; cv++) {
    if (!fieldCell(cu, cv) || hash(cu + 5, cv + 19) > 0.45) continue;
    for (let u = 3; u < FU; u += 6.5) { const [x, z] = toXZ(cu * FU + u, cv * FV + 3.5), h = open(x, z, 12); if (h === null) continue; if (rnd() < 0.12) oak(x, z, R(0.6, 0.9)); else bush.push({ x, y: h - 0.15, z, ry: R(0, 6), sx: R(0.8, 1.35), sy: R(0.8, 1.5), sz: R(0.8, 1.35), c: tint() }); }
  }
  // character of the roads: a deep pine wood along Pine road, clipped orchard rows beside Orchard road, firs on the climbs
  const lane = name => W.SIDE_ROADS[W.SIDE_ROADS.names.indexOf(name)] || [];
  { let next = 0; for (const p of lane('Pine road')) { if (p.s < next) continue; next = p.s + 7.5; for (const side of [-1, 1]) for (const d of [9.5, 17]) { const lat = side * (d + R(-1.2, 2)), x = p.x - p.tz * lat + R(-2, 2), z = p.z + p.tx * lat + R(-2, 2), h = open(x, z, 8.8); if (h === null || !clearOfHouses(x, z, 9)) continue; const s = R(0.9, 1.45); pine.push({ x, y: h - 0.3, z, ry: R(0, 6), sx: s, sy: s * R(1.1, 1.6), sz: s, c: tint(0.34, 0.03, 0.62, 0.85) }); solidAdd(x, z, 0.4 * s); } } }
  { let next = 0; for (const p of lane('Orchard road')) { if (p.s < next) continue; next = p.s + 2.1; for (const side of [-1, 1]) for (const d of [9.4, 12, 14.6]) { const x = p.x - p.tz * side * d, z = p.z + p.tx * side * d, h = W.terrainH(x, z); if (h < 1.2 || !rural(x, z) || roadDist(x, z, 10) < 8.6) continue; bush.push({ x, y: h - 0.2, z, ry: Math.atan2(p.tx, p.tz), sx: 1.05, sy: 0.75, sz: 1.7, c: tint(0.31, 0.01, 0.55, 0.65) }); } } }
  for (const name of ['Summit climb', 'Falcon pass', 'Quarry pass']) { let next = 0; for (const p of lane(name)) { if (p.s < next) continue; next = p.s + 11; for (const side of [-1, 1]) { if (rnd() < 0.4) continue; const lat = side * R(10, 26), x = p.x - p.tz * lat, z = p.z + p.tx * lat, h = W.terrainH(x, z); if (W.terrainSlope(x, z) > 0.7 || roadDist(x, z, 11) < 9) continue; const s = R(0.7, 1.15); pine.push({ x, y: h - 0.3, z, ry: R(0, 6), sx: s, sy: s * R(0.9, 1.4), sz: s, c: tint(0.32, 0.04, 0.65, 0.9) }); solidAdd(x, z, 0.4 * s); } } }
  put('pine', pine); put('bush', bush);

  // roadside dressing along the whole loop: grass clumps, flowers, shrubs, stones (all drive-through)
  const tufts = [], flowers = [], shrubs = [], stones = [], dune = [];
  for (let s = 0; s < W.ROAD.L; s += 2.6) for (const side of [-1, 1]) {
    const beach = (() => { const p = W.roadAt(s); return W.isBeach(p.x, p.z, 40); })();
    const lat = side * (W.ROAD_HALF + 2.6 + Math.pow(rnd(), 1.6) * 16), p = W.roadAt(s + R(-1.2, 1.2), lat), h = W.terrainH(p.x, p.z);
    if (near(W.CITY_RECT, p.x, p.z, 8) || h < 1.4 || W.BOARDWALK.length && W.boardwalkAt(p.x, p.z).w > 0 || roadDist(p.x, p.z, 8) < 8 || W.GARAGES.some(g => Math.hypot(p.x - g.cx, p.z - g.cz) < 24)) continue;
    const item = (sx, sy) => ({ x: p.x, y: h - 0.05, z: p.z, ry: R(0, 6), sx, sy, sz: sx });
    if (beach) { if (rnd() < 0.3 && Math.abs(lat) > 11) { const k = R(0.6, 1.3); dune.push({ ...item(k, k * R(0.6, 0.9)), c: tint(0.14, 0.03) }); } continue; }
    const roll = rnd();
    if (roll < 0.62) { const k = R(0.6, 1.4); tufts.push({ ...item(k, k * R(0.5, 0.9)), c: tint() }); }
    else if (roll < 0.74) { const k = R(0.7, 1.2); flowers.push(item(k, k * R(0.45, 0.65))); }
    else if (roll < 0.8 && Math.abs(lat) > 11) shrubs.push({ ...item(R(0.45, 0.95), R(0.45, 0.85)), c: tint() });
    else if (roll < 0.815) { const k = R(0.15, 0.5); stones.push({ x: p.x, y: h + k * 0.2, z: p.z, ry: R(0, 6), sx: k * 1.3, sy: k * 0.8, sz: k, c: new THREE.Color().setHSL(0.09, 0.07, R(0.42, 0.66)).getHex() }); }
  }
  // along the side roads: tree lines, grass verges, red-and-white marker posts and power lines
  const posts = [];
  W.SIDE_ROADS.forEach((pts, k) => {
    let nextTree = 12, nextPost = 6, nextTuft = 0;
    for (const p of pts) {
      const at = lat => ({ x: p.x - p.tz * lat, z: p.z + p.tx * lat });
      if (p.s >= nextTuft) { nextTuft = p.s + 3.2; for (const side of [-1, 1]) { const q = at(side * (7.6 + Math.pow(rnd(), 1.5) * 8)); if (roadDist(q.x, q.z, 9) < 8.2 || !rural(q.x, q.z)) continue; const h = W.terrainH(q.x, q.z) - 0.05, s = R(0.6, 1.3); if (rnd() < 0.15) flowers.push({ x: q.x, y: h, z: q.z, ry: R(0, 6), sx: s, sy: s * 0.5, sz: s }); else tufts.push({ x: q.x, y: h, z: q.z, ry: R(0, 6), sx: s, sy: s * R(0.5, 0.9), sz: s, c: tint() }); } }
      if (p.s >= nextPost) { nextPost = p.s + 24; for (const side of [-1, 1]) { const q = at(side * 6.2); if (roadDist(q.x, q.z, 8) < 6.5) continue; posts.push({ x: q.x, y: W.terrainH(q.x, q.z), z: q.z }); } }
      if (k % 3 !== 2 && p.s >= nextTree) { nextTree = p.s + R(13, 22); for (const side of [-1, 1]) { if (rnd() < 0.35) continue; const q = at(side * R(11, 14)), h = W.terrainH(q.x, q.z); if (h < 1.2 || !rural(q.x, q.z) || roadDist(q.x, q.z, 12) < 10) continue; const s = R(0.75, 1.15); broad.push({ x: q.x, y: h - 0.2, z: q.z, ry: R(0, 6), sx: s, sy: s * R(0.9, 1.3), sz: s, c: tint() }); solidAdd(q.x, q.z, 0.4 * s); } }
    }
  });
  const postGeo = merge([paint(new THREE.BoxGeometry(0.12, 0.9, 0.12).translate(0, 0.45, 0), '#f2f2f2'), paint(new THREE.BoxGeometry(0.13, 0.18, 0.13).translate(0, 0.72, 0), '#e63946')]);
  // meadow detail away from the road
  for (let n = 0; n < 40000 && flowers.length < 5200; n++) { const x = R(BX.x0, BX.x1), z = R(-600, 1350), h = open(x, z, 12); if (h === null || W.fbm(x / 35, z / 35) < 0.58) continue; for (let k = 0; k < 5; k++) { const fx = x + R(-3, 3), fz = z + R(-3, 3); flowers.push({ x: fx, y: W.terrainH(fx, fz) - 0.04, z: fz, ry: R(0, 6), sx: R(0.7, 1.2), sy: R(0.35, 0.6), sz: R(0.7, 1.2) }); } }
  put('broad', broad); instances(postGeo, houseMat, posts);
  const stoneMat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
  put('grass', tufts, { cast: false, receive: true }); put('flowers', flowers, { cast: false, receive: true }); put('dune', dune, { cast: false, receive: true }); instances(new THREE.IcosahedronGeometry(1, 0), stoneMat, stones, { cast: false, lod: 'small' });
  put('bush', shrubs);

  // crops in rows, hay bales on harvested wheat
  const plants = {}, bales = [];
  const baleGeo = merge([paint(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 12).rotateZ(Math.PI / 2), '#d8b455')]);
  for (let cu = -24; cu <= 24; cu++) for (let cv = -24; cv <= 24; cv++) {
    const f = fieldCell(cu, cv); if (!f) continue; const t = f.type;
    if (t.plant) for (let v = 9; v < FV - 2; v += 3.6) for (let u = 9; u < FU - 2; u += 2.2) { const [x, z] = toXZ(cu * FU + u + R(-0.25, 0.25), cv * FV + v + R(-0.2, 0.2)), s = R(0.85, 1.2); if (roadDist(x, z, 14) < 11) continue; (plants[t.plant] ||= []).push({ x, y: W.terrainH(x, z) - 0.05, z, ry: R(0, 6), sx: (t.plant === 'bush' ? 0.8 : 2.2) * s, sy: t.h * s * (t.plant === 'bush' ? 2 : 1), sz: (t.plant === 'bush' ? 0.8 : 2.2) * s }); }
    if (t.name === 'wheat' || t.name === 'plowed') for (let k = 0; k < 4; k++) { const [x, z] = toXZ(cu * FU + R(14, FU - 8), cv * FV + R(14, FV - 8)); if (roadDist(x, z, 14) < 11) continue; bales.push({ x, y: W.terrainH(x, z) + 0.65, z, ry: R(0, 3.1) }); solidAdd(x, z, 0.75); }
  }
  for (const k of Object.keys(plants)) put(k, plants[k], { cast: false, receive: true });
  instances(baleGeo, houseMat, bales);

  // utility poles with sagging wires along the lowland road
  const pole = merge([paint(new THREE.CylinderGeometry(0.11, 0.17, 9, 7).translate(0, 4.4, 0), '#6d4f36'), paint(new THREE.BoxGeometry(2, 0.14, 0.14).translate(0, 8.4, 0), '#5a412c')]), poles = [], wire = [];
  let prev = null;
  for (let s = 0; s < W.ROAD.L; s += 34) {
    const p = W.roadAt(s, 11.5), h = W.terrainH(p.x, p.z), c = W.roadAt(s);
    if (!rural(p.x, p.z) || h > 60 || h < 3 || Math.abs(h - c.y) > 2.5 || roadDist(p.x, p.z, 11) < 10) { prev = null; continue; }
    poles.push({ x: p.x, y: h - 0.2, z: p.z, ry: Math.atan2(c.tx, c.tz) }); solidAdd(p.x, p.z, 0.17);
    const ends = [-0.85, 0.85].map(o => new THREE.Vector3(p.x - c.tz * o, h + 8.25, p.z + c.tx * o));
    if (prev) ends.forEach((e, k) => { for (let i = 0; i < 6; i++) for (const t of [i / 6, (i + 1) / 6]) { const v = prev[k].clone().lerp(e, t); v.y -= 2.4 * t * (1 - t); wire.push(v.x, v.y, v.z); } });
    prev = ends;
  }
  instances(pole, houseMat, poles);
  if (wire.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3)); scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2a2d33, transparent: true, opacity: 0.6 }))); }

  // beach: coloured huts and towels, on the sand west of the coast road
  const hut = merge([paint(new THREE.BoxGeometry(2.4, 2.2, 2.4).translate(0, 1.15, 0), '#ffffff'), paint(new THREE.ConeGeometry(2.1, 1, 4).rotateY(Math.PI / 4).translate(0, 2.75, 0), '#e8e2d6'), paint(new THREE.BoxGeometry(0.8, 1.6, 0.1).translate(0, 0.85, 1.22), '#6a5a50')]);
  const huts = [], towels = [], HUT = [0xff8f8f, 0x8fd0ff, 0xffe08a, 0x9be6b4, 0xffffff];
  for (let z = -150; z < 1150; z += 5) {
    const sand = W.coastX(z);
    if (z % 40 === 0) { const x = sand + 58, h = W.terrainH(x, z); if (h > 1 && h < 4.5 && roadDist(x, z, 20) > 18 && W.boardwalkAt(x, z).w === 0 && !W.GARAGES.some(g => Math.hypot(x - g.cx, z - g.cz) < 34)) for (let k = 0; k < 3; k++) { huts.push({ x, y: W.terrainH(x, z + k * 3.2) - 0.15, z: z + k * 3.2, ry: -Math.PI / 2, c: HUT[(rnd() * HUT.length) | 0] }); solidBox(x, z + k * 3.2, 1.2, 1.2); } }
    if (rnd() < 0.5) { const x = sand + R(18, 52), h = W.terrainH(x, z); if (h > 0.8 && h < 3.2 && roadDist(x, z, 14) > 12) towels.push({ x, y: h + 0.05, z, ry: Math.PI / 2 + R(-0.4, 0.4), c: HUT[(rnd() * 4) | 0] }); }
  }
  instances(hut, houseMat, huts);
  instances(new THREE.BoxGeometry(1, 0.04, 1.9), new THREE.MeshStandardMaterial({ roughness: 1 }), towels, { cast: false, receive: true, lod: 'small' });

  // ---- Sunset Hills: villas with terraces, pools, garages and hedges, along their own road
  const box = (w, h, d, x, y, z, col) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col);
  const villa = (wall, roof) => merge([box(15, 1.4, 13, 0, -0.5, 0, '#cfc6b4'), box(10, 3.4, 8, -1.5, 1.9, -1.5, wall), box(6, 3, 6, -3, 5.1, -2, wall), box(11, 0.3, 9, -1.5, 3.75, -1.5, roof), box(7, 0.3, 7, -3, 6.75, -2, roof),
    box(7, 2.1, 0.12, -1, 1.5, 2.56, '#7fb4d6'), box(4, 1.7, 0.12, -3, 5.1, 1.06, '#7fb4d6'), box(4.4, 2.8, 6, 5.7, 1.6, -2.5, wall), box(3.4, 2.2, 0.12, 5.7, 1.3, 0.56, '#6d5844'),
    box(6.4, 0.12, 4.4, -2, 0.27, 5, '#f2f2ee'), box(5.6, 0.1, 3.6, -2, 0.32, 5, '#2fb6d9'), box(15, 0.9, 0.6, 0, 0.6, -6.4, '#3f7a3a'), box(0.6, 0.9, 13, -7.4, 0.6, 0, '#3f7a3a')]);
  const villas = [villa('#f6f1e6', '#8f4636'), villa('#e9d9bd', '#3b4654'), villa('#dfe6ea', '#2f3338')], sites = [[], [], []], taken = [];
  { let next = 10; for (const p of lane('Sunset hills')) { if (p.s < next) continue; next = p.s + 16; for (const side of [-1, 1]) { const x = p.x - p.tz * side * 19, z = p.z + p.tx * side * 19, h = W.terrainH(x, z);
    if (h < 2 || roadDist(x, z, 18) < 15 || W.terrainSlope(x, z) > 0.3 || taken.some(q => Math.hypot(x - q.x, z - q.z) < 21)) continue;
    const front = Math.atan2(p.x - x, p.z - z), turn = Math.round(front / (Math.PI / 2)) * Math.PI / 2, k = (rnd() * 3) | 0; taken.push({ x, z }); sites[k].push({ x, y: h + 0.1, z, ry: turn }); solidBox(x, z, 5.5, 5.5); } } }
  villas.forEach((g, i) => instances(g, houseMat, sites[i], { receive: true }));

  // ---- landmarks: a church in the old town, windmills over the meadows, a lighthouse on the shore
  const church = merge([box(9, 7, 16, 0, 3, 0, '#e8e0cf'), paint(new THREE.CylinderGeometry(0.01, 6.6, 3.6, 4).rotateY(Math.PI / 4).scale(1, 1, 1.7).translate(0, 8.2, 0), '#8f4636'), box(5, 17, 5, 0, 8, 10, '#e8e0cf'), paint(new THREE.ConeGeometry(4, 8, 4).rotateY(Math.PI / 4).translate(0, 20.5, 10), '#3b4654'), box(2, 3.4, 0.15, 0, 1.7, 12.55, '#5a3b28'), box(1.4, 2, 0.15, 0, 12, 12.55, '#314a66')]);
  for (let k = 0; k < 200; k++) { const x = W.VILLAGE.x + R(-80, 80), z = W.VILLAGE.z + R(-80, 80); if (roadDist(x, z, 24) > 19 && W.terrainSlope(x, z) < 0.15 && clearOfHouses(x, z, 15)) { instances(church, houseMat, [{ x, y: W.terrainH(x, z) - 0.2, z }]); solidBox(x, z, 4.5, 8); solidBox(x, z + 10, 2.5, 2.5); break; } }
  const mill = merge([paint(new THREE.CylinderGeometry(1.8, 3.4, 14, 10).translate(0, 6.6, 0), '#f2ede2'), paint(new THREE.ConeGeometry(2.5, 2.8, 10).translate(0, 15, 0), '#5a3b28'), ...[0, 1, 2, 3].map(i => paint(new THREE.BoxGeometry(1.5, 9, 0.15).translate(0, 5, 2.7).rotateZ(i * Math.PI / 2 + 0.4).translate(0, 12.6, 0), '#8a6246'))]);
  const mills = [];
  for (const [px, pz] of [[-250, 130], [420, 250], [560, 920], [-60, 520]]) for (let k = 0; k < 60; k++) { const x = px + R(-60, 60), z = pz + R(-60, 60); if (roadDist(x, z, 28) > 22 && W.terrainSlope(x, z) < 0.2 && rural(x, z) && clearOfHouses(x, z, 12)) { mills.push({ x, y: W.terrainH(x, z) - 0.2, z, ry: R(-0.5, 0.5) }); solidAdd(x, z, 3.4); break; } }
  instances(mill, houseMat, mills);
  { const z = -300, x = W.coastX(z) + 28, y = Math.max(0.4, W.terrainH(x, z));
    const tower = merge([paint(new THREE.CylinderGeometry(2.4, 3.4, 22, 14).translate(0, 11, 0), '#f4f4f0'), ...[5, 13].map(h => paint(new THREE.CylinderGeometry(3.35 - h * 0.047, 3.35 - h * 0.044, 3, 14).translate(0, h, 0), '#d2362a')), paint(new THREE.CylinderGeometry(3, 3, 0.5, 14).translate(0, 22.2, 0), '#23262b'), paint(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 10).translate(0, 23.6, 0), '#ffe9a8'), paint(new THREE.ConeGeometry(2.2, 2, 14).translate(0, 25.8, 0), '#d2362a')]);
    instances(tower, houseMat, [{ x, y: y - 0.5, z }]); solidAdd(x, z, 3.4); }
  // flowering trees round the lake and the old town, street trees in places, arrow boards on every tight bend
  const sakura = [];
  const bloom = (x, z, s) => { const h = W.terrainH(x, z); if (h < 1 || h > 130 || roadDist(x, z, 12) < 9.5 || W.terrainSlope(x, z) > 0.45 || !clearOfHouses(x, z, 8) || taken.some(q => Math.hypot(x - q.x, z - q.z) < 12)) return; sakura.push({ x, y: h - 0.2, z, ry: R(0, 6), sx: s, sy: s * R(0.85, 1.15), sz: s, c: new THREE.Color().setHSL(0.27, R(0.1, 0.3), R(0.75, 0.95)).getHex() }); solidAdd(x, z, 0.4 * s); };
  for (let k = 0; k < 340; k++) { const a = R(0, 6.283), r = R(W.LAKE.r + 15, W.LAKE.r + 130); bloom(W.LAKE.x + Math.cos(a) * r, W.LAKE.z + Math.sin(a) * r, R(0.7, 1.2)); }
  for (let k = 0; k < 160; k++) bloom(W.VILLAGE.x + R(-190, 190), W.VILLAGE.z + R(-170, 170), R(0.6, 1.05));
  const boards = [];
  for (const P of W.SIDE_ROADS) { let next = 0; for (let i = 5; i + 5 < P.length; i++) { const p = P[i], a = P[i - 5], b = P[i + 5], turn = a.tx * b.tz - a.tz * b.tx; if (Math.abs(turn) < 0.42 || p.s < next) continue; next = p.s + 9; const out = turn > 0 ? 1 : -1, x = p.x + p.tz * out * 7, z = p.z - p.tx * out * 7; if (roadDist(x, z, 9) < 6.6 || !rural(x, z)) continue; boards.push({ x, y: Math.max(W.terrainH(x, z), p.y - 0.6) - 0.05, z, ry: Math.atan2(-p.tx, -p.tz), left: turn > 0 }); } }
  const board = dir => merge([paint(new THREE.BoxGeometry(0.1, 1, 0.1).translate(0, 0.5, 0), '#8a9199'), paint(new THREE.BoxGeometry(1.1, 0.8, 0.07).translate(0, 1.35, 0), '#ffcc00'), ...[-0.2, 0.22].flatMap(cx => [1, -1].map(s => paint(new THREE.BoxGeometry(0.14, 0.42, 0.09).rotateZ(s * dir * 0.7).translate(cx, 1.35 + s * 0.14, 0.01), '#17181c')))]);
  instances(board(-1), houseMat, boards.filter(b => !b.left).map(({ left, ...b }) => b)); instances(board(1), houseMat, boards.filter(b => b.left).map(({ left, ...b }) => b));
  put('sakura', sakura);
  return {
    counts: { villas: taken.length, windmills: mills.length, blossom: sakura.length, houses: placed.flat().length, trees: broad.length + pine.length, tufts: tufts.length, flowers: flowers.length, crops: Object.values(plants).reduce((a, l) => a + l.length, 0), poles: poles.length, huts: huts.length },
  };
}
