// scenery.js - fills the countryside: patchwork crop fields, groves, farmhouses, roadside dressing, utility poles, beach details.
// Layout is seeded, so every player sees the same world. Solid things stay >= 11 m from the road.
import * as THREE from 'three';
import * as W from './world.js';

const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const near = (R, x, z, m) => x > R.x0 - m && x < R.x1 + m && z > R.z0 - m && z < R.z1 + m;
// open countryside: not city, estate, beach strip, garage yards or the overlook
function rural(x, z, margin = 0) {
  if (near(W.CITY_RECT, x, z, 50 + margin) || near(W.ESTATE, x, z, 45 + margin) || (z > 735 - margin && x < 430)) return false;
  for (const g of W.GARAGES) if (Math.hypot(x - g.cx, z - g.cz) < 34 + margin) return false;
  for (const p of W.PADS) if (Math.hypot(x - p.x, z - p.z) < p.r + 8 + margin) return false;
  return true;
}
const roadDist = (x, z, max) => W.roadQuery(x, z, max + 6).d;

// ---- crop fields: a rotated grid, some cells farmed. fieldAt() is also used by the terrain colouring.
export const FIELD_TYPES = [
  { name: 'wheat', color: 0xcfae52, plant: 'wheat', h: 0.8 }, { name: 'plowed', color: 0x7d5f3f, plant: null, h: 0 }, { name: 'crop', color: 0x6a8c3a, plant: 'crop', h: 0.55 },
  { name: 'rape', color: 0xb9b23a, plant: 'rape', h: 0.65 }, { name: 'lavender', color: 0x7a6a74, plant: 'lavender', h: 0.55 },
];
const FU = 96, FV = 72, CA = 0.94, SA = 0.341, cells = new Map();
const toXZ = (u, v) => [u * CA - v * SA, u * SA + v * CA];
function fieldCell(cu, cv) {
  const key = cu * 4096 + cv; let f = cells.get(key); if (f !== undefined) return f;
  f = null;
  if (hash(cu + 31, cv - 7) < 0.62) {
    const [x, z] = toXZ((cu + 0.5) * FU, (cv + 0.5) * FV), h = W.terrainH(x, z);
    const flat = [[0, 0], [30, 20], [-30, 20], [30, -20], [-30, -20]].every(([a, b]) => W.terrainSlope(x + a, z + b) < 0.12);
    if (flat && h > 3.8 && h < 60 && rural(x, z, 40) && roadDist(x, z, 40) > 34) f = { cu, cv, type: FIELD_TYPES[(hash(cu - 3, cv + 11) * FIELD_TYPES.length) | 0] };
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
  const R = (a, b) => a + (b - a) * rnd(), small = [], mid = [];       // small: hidden far away and on Low; mid: hidden on Low
  const added = (list, fn) => { const n = scene.children.length; fn(); list.push(...scene.children.slice(n)); };
  const tint = (h = 0.28, spread = 0.06, l0 = 0.78, l1 = 1) => new THREE.Color().setHSL(h + R(-spread, spread), R(0.1, 0.35), R(l0, l1)).getHex();
  const put = (kind, list, opts) => instances(foliage[kind].geo, foliage[kind].mat, list, opts);
  const open = (x, z, minRoad) => { const h = W.terrainH(x, z); if (h < 3.7 || h > 150 || !rural(x, z) || W.terrainSlope(x, z) > 0.5 || fieldAt(x, z)) return null; const d = roadDist(x, z, minRoad); return d > minRoad ? h : null; };
  const BX = { x0: -1500, x1: 1350, z0: -1150, z1: 730 };

  // farmhouses (small hamlets), barns and silos
  const house = (wall, roof, w, d, hgt) => {
    const rh = d * 0.36, g = [paint(new THREE.BoxGeometry(w, hgt + 1.2, d).translate(0, (hgt - 1.2) / 2, 0), wall)];
    const prism = new THREE.CylinderGeometry(1, 1, 1, 3, 1).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2); prism.computeBoundingBox(); const bb = prism.boundingBox;
    prism.translate(0, -bb.min.y, 0).scale(w + 0.7, rh / (bb.max.y - bb.min.y), (d + 0.8) / (bb.max.z - bb.min.z)).translate(0, hgt, 0); prism.computeVertexNormals(); g.push(paint(prism, roof));
    g.push(paint(new THREE.BoxGeometry(1.1, 2, 0.12).translate(0, 1, d / 2), '#5a3b28'));
    for (const sx of [-w * 0.3, w * 0.3]) for (const sz of [d / 2, -d / 2]) { g.push(paint(new THREE.BoxGeometry(1.35, 1.2, 0.08).translate(sx, 1.65, sz), '#f4f1e8')); g.push(paint(new THREE.BoxGeometry(1.1, 0.95, 0.12).translate(sx, 1.65, sz), '#4e6d8c')); }
    g.push(paint(new THREE.BoxGeometry(0.6, 1.6, 0.6).translate(w * 0.28, hgt + rh * 0.75, 0), '#8a5a48'));
    return merge(g);
  };
  const kinds = [{ w: 8, d: 6.4, geo: house('#efe6d2', '#a8432e', 8, 6.4, 3.4) }, { w: 7, d: 6, geo: house('#dfe7ec', '#46566b', 7, 6, 3.2) }, { w: 12, d: 8, geo: house('#a8432f', '#6b6f76', 12, 8, 4.2) }];
  const silo = merge([paint(new THREE.CylinderGeometry(2, 2, 9, 12).translate(0, 4.2, 0), '#c9ced2'), paint(new THREE.SphereGeometry(2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 8.7, 0), '#8d969e')]);
  const houseMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), placed = [[], [], []], silos = [], yards = [];
  for (let n = 0; n < 6000 && yards.length < 38; n++) {
    const x = R(BX.x0, BX.x1), z = R(-500, 720), h = open(x, z, 34); if (h === null || roadDist(x, z, 150) > 150 || W.terrainSlope(x, z) > 0.1 || yards.some(p => Math.hypot(x - p.x, z - p.z) < 130)) continue;
    yards.push({ x, z });
    for (let k = 0, got = 0; k < 20 && got < 3; k++) {
      const hx = x + R(-24, 24), hz = z + R(-24, 24), hh = open(hx, hz, 22); if (hh === null || W.terrainSlope(hx, hz) > 0.14 || placed.flat().some(p => Math.hypot(hx - p.x, hz - p.z) < 15)) continue;
      const t = got === 2 ? 2 : (rnd() * 2) | 0, turn = (rnd() * 4 | 0) * Math.PI / 2, k2 = kinds[t]; placed[t].push({ x: hx, y: hh, z: hz, ry: turn }); got++;
      const odd = Math.abs(Math.sin(turn)) > 0.5; solidBox(hx, hz, (odd ? k2.d : k2.w) / 2, (odd ? k2.w : k2.d) / 2);
      if (t === 2) { const sx = hx + 10, sz = hz + 2, sh = open(sx, sz, 22); if (sh !== null) { silos.push({ x: sx, y: sh, z: sz }); solidAdd(sx, sz, 2); } }
    }
  }
  kinds.forEach((k, i) => instances(k.geo, houseMat, placed[i], { receive: true })); instances(silo, houseMat, silos);
  const clearOfHouses = (x, z, d) => !placed.flat().some(p => Math.hypot(x - p.x, z - p.z) < d);

  // groves: clusters of trees across the open land
  const broad = [], pine = [], bush = [];
  for (let n = 0, groves = 0; n < 12000 && groves < 380; n++) {
    const cx = R(BX.x0, BX.x1), cz = R(-650, 720); if (open(cx, cz, 18) === null) continue; groves++;
    const conifer = cz < 50 && rnd() < 0.6, count = 5 + (rnd() * 16 | 0), rad = 10 + rnd() * 26;
    for (let k = 0; k < count; k++) {
      const a = R(0, 6.283), d = Math.sqrt(rnd()) * rad, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, h = open(x, z, 12); if (h === null || !clearOfHouses(x, z, 11)) continue;
      const s = R(0.7, 1.25); (conifer ? pine : broad).push({ x, y: h - 0.2, z, ry: R(0, 6), sx: s, sy: s * R(0.85, 1.3), sz: s, c: tint() }); solidAdd(x, z, 0.4 * s);
      if (rnd() < 0.45) { const bx = x + R(-4, 4), bz = z + R(-4, 4), bh = open(bx, bz, 10); if (bh !== null) bush.push({ x: bx, y: bh - 0.15, z: bz, ry: R(0, 6), sx: R(0.5, 1.1), c: tint() }); }
    }
  }
  // lone trees over the lowland plain, and hedgerows along some field edges
  const oak = (x, z, s) => { const h = open(x, z, 12); if (h === null || !clearOfHouses(x, z, 11)) return; broad.push({ x, y: h - 0.2, z, ry: R(0, 6), sx: s, sy: s * R(0.85, 1.25), sz: s, c: tint() }); solidAdd(x, z, 0.4 * s); };
  for (let n = 0, got = 0; n < 9000 && got < 650; n++) { const before = broad.length; oak(R(-1300, 330), R(60, 720), R(0.6, 1.3)); got += broad.length - before; }
  for (let cu = -24; cu <= 24; cu++) for (let cv = -24; cv <= 24; cv++) {
    if (!fieldCell(cu, cv) || hash(cu + 5, cv + 19) > 0.7) continue;
    for (let u = 3; u < FU; u += 4.5) { const [x, z] = toXZ(cu * FU + u, cv * FV + 3.5), h = open(x, z, 12); if (h === null) continue; if (rnd() < 0.12) oak(x, z, R(0.6, 0.9)); else bush.push({ x, y: h - 0.15, z, ry: R(0, 6), sx: R(0.8, 1.35), sy: R(0.8, 1.5), sz: R(0.8, 1.35), c: tint() }); }
  }
  put('broad', broad); put('pine', pine); added(mid, () => put('bush', bush));

  // roadside dressing along the whole loop: grass clumps, flowers, shrubs, stones (all drive-through)
  const tufts = [], flowers = [], shrubs = [], stones = [], dune = [];
  for (let s = 0; s < W.ROAD.L; s += 2.6) for (const side of [-1, 1]) {
    const beach = (() => { const p = W.roadAt(s); return p.z > 735 && p.x < 430; })();
    const lat = side * (W.ROAD_HALF + 2.6 + Math.pow(rnd(), 1.6) * 16), p = W.roadAt(s + R(-1.2, 1.2), lat), h = W.terrainH(p.x, p.z);
    if (near(W.CITY_RECT, p.x, p.z, 8) || near(W.ESTATE, p.x, p.z, 8) || h < 1.4 || W.BOARDWALK.length && W.boardwalkAt(p.x, p.z).w > 0 || roadDist(p.x, p.z, 8) < 8 || W.GARAGES.some(g => Math.hypot(p.x - g.cx, p.z - g.cz) < 24)) continue;
    const item = (sx, sy) => ({ x: p.x, y: h - 0.05, z: p.z, ry: R(0, 6), sx, sy, sz: sx });
    if (beach) { if (rnd() < 0.3 && Math.abs(lat) > 11) { const k = R(0.6, 1.3); dune.push({ ...item(k, k * R(0.6, 0.9)), c: tint(0.14, 0.03) }); } continue; }
    const roll = rnd();
    if (roll < 0.62) { const k = R(0.6, 1.4); tufts.push({ ...item(k, k * R(0.5, 0.9)), c: tint() }); }
    else if (roll < 0.74) { const k = R(0.7, 1.2); flowers.push(item(k, k * R(0.45, 0.65))); }
    else if (roll < 0.8 && Math.abs(lat) > 11) shrubs.push({ ...item(R(0.45, 0.95), R(0.45, 0.85)), c: tint() });
    else if (roll < 0.815) { const k = R(0.15, 0.5); stones.push({ x: p.x, y: h + k * 0.2, z: p.z, ry: R(0, 6), sx: k * 1.3, sy: k * 0.8, sz: k, c: new THREE.Color().setHSL(0.09, 0.07, R(0.42, 0.66)).getHex() }); }
  }
  // meadow detail away from the road
  for (let n = 0; n < 40000 && flowers.length < 5200; n++) { const x = R(BX.x0, BX.x1), z = R(-500, 725), h = open(x, z, 12); if (h === null || W.fbm(x / 35, z / 35) < 0.58) continue; for (let k = 0; k < 5; k++) { const fx = x + R(-3, 3), fz = z + R(-3, 3); flowers.push({ x: fx, y: W.terrainH(fx, fz) - 0.04, z: fz, ry: R(0, 6), sx: R(0.7, 1.2), sy: R(0.35, 0.6), sz: R(0.7, 1.2) }); } }
  const stoneMat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
  added(small, () => { put('grass', tufts, { cast: false, receive: true }); put('flowers', flowers, { cast: false, receive: true }); put('dune', dune, { cast: false, receive: true }); instances(new THREE.IcosahedronGeometry(1, 0), stoneMat, stones, { cast: false }); });
  added(mid, () => put('bush', shrubs));

  // crops in rows, hay bales on harvested wheat
  const plants = {}, bales = [];
  const baleGeo = merge([paint(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 12).rotateZ(Math.PI / 2), '#d8b455')]);
  for (let cu = -24; cu <= 24; cu++) for (let cv = -24; cv <= 24; cv++) {
    const f = fieldCell(cu, cv); if (!f) continue; const t = f.type;
    if (t.plant) for (let v = 9; v < FV - 2; v += 3.6) for (let u = 9; u < FU - 2; u += 2.2) { const [x, z] = toXZ(cu * FU + u + R(-0.25, 0.25), cv * FV + v + R(-0.2, 0.2)), s = R(0.85, 1.2); (plants[t.plant] ||= []).push({ x, y: W.terrainH(x, z) - 0.05, z, ry: R(0, 6), sx: 2.2 * s, sy: t.h * s, sz: 2.2 * s }); }
    if (t.name === 'wheat' || t.name === 'plowed') for (let k = 0; k < 4; k++) { const [x, z] = toXZ(cu * FU + R(14, FU - 8), cv * FV + R(14, FV - 8)); bales.push({ x, y: W.terrainH(x, z) + 0.65, z, ry: R(0, 3.1) }); solidAdd(x, z, 0.75); }
  }
  added(small, () => { for (const k of Object.keys(plants)) put(k, plants[k], { cast: false, receive: true }); });
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

  // beach: coloured huts and towels
  const hut = merge([paint(new THREE.BoxGeometry(2.4, 2.2, 2.4).translate(0, 1.15, 0), '#ffffff'), paint(new THREE.ConeGeometry(2.1, 1, 4).rotateY(Math.PI / 4).translate(0, 2.75, 0), '#e8e2d6'), paint(new THREE.BoxGeometry(0.8, 1.6, 0.1).translate(0, 0.85, 1.22), '#6a5a50')]);
  const huts = [], towels = [], HUT = [0xff8f8f, 0x8fd0ff, 0xffe08a, 0x9be6b4, 0xffffff];
  for (let x = -1080; x < 20; x += 5) {
    const p = W.roadQuery(x, 900, 400); if (p.d === Infinity) continue; const road = W.roadAt(p.s);
    if (x % 40 === 0 && !(x > -400 && x < -300)) { const z = road.z + 34, h = W.terrainH(x, z); if (h > 1 && h < 4 && roadDist(x, z, 20) > 18 && W.boardwalkAt(x, z).w === 0 && !W.GARAGES.some(g => Math.hypot(x - g.cx, z - g.cz) < 34)) { for (let k = 0; k < 3; k++) { huts.push({ x: x + k * 3.2, y: W.terrainH(x + k * 3.2, z) - 0.15, z, ry: Math.PI, c: HUT[(rnd() * HUT.length) | 0] }); solidBox(x + k * 3.2, z, 1.2, 1.2); } } }
    if (rnd() < 0.5) { const z = road.z + R(44, 80), h = W.terrainH(x, z); if (h > 0.8 && h < 3.2) towels.push({ x, y: h + 0.05, z, ry: R(-0.4, 0.4), c: HUT[(rnd() * 4) | 0] }); }
  }
  instances(hut, houseMat, huts);
  added(small, () => instances(new THREE.BoxGeometry(1, 0.04, 1.9), new THREE.MeshStandardMaterial({ roughness: 1 }), towels, { cast: false, receive: true }));

  // distance culling for the small stuff (each instanced mesh already covers one 300 m cell)
  let low = false, last = 0;
  return {
    counts: { houses: placed.flat().length, trees: broad.length + pine.length, tufts: tufts.length, flowers: flowers.length, crops: Object.values(plants).reduce((a, l) => a + l.length, 0), poles: poles.length, huts: huts.length },
    setQuality(q) { low = q === 'low'; for (const m of mid) m.visible = !low; last = 0; },
    update(cam, now) { if (now - last < 400) return; last = now; for (const m of small) { const s = m.boundingSphere; m.visible = !low && (!s || Math.hypot(s.center.x - cam.x, s.center.z - cam.z) - s.radius < 200); } },
  };
}
