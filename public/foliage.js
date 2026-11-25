// foliage.js - varied trees built from leaf cards with a procedural alpha texture: 4 broadleaf species, 3 pines, 3 palms, 2 bushes.
// One shared material: the atlas holds [broad leaves | pine needles | palm frond | bark], tinted by vertex colour and instance colour.
// Uses its own random generator so the rest of the world is laid out exactly as before.
import * as THREE from 'three';

let seed = 4711;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const between = (a, b) => a + (b - a) * rand();
const LEAF = 0, NEEDLE = 1, FROND = 2, BARK = 3;

function atlas() {
  const S = 256, c = document.createElement('canvas'); c.width = S * 4; c.height = S; const g = c.getContext('2d');
  const shade = (lo, hi) => { const v = between(lo, hi) | 0; return `rgb(${v},${v},${v})`; };
  for (let i = 0; i < 230; i++) {                                   // broadleaf cluster: many small pointed leaves
    const a = rand() * 6.283, r = Math.sqrt(rand()) * 104, x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;
    g.save(); g.translate(x, y); g.rotate(rand() * 6.283); g.fillStyle = shade(150, 255);
    g.beginPath(); g.moveTo(-15, 0); g.quadraticCurveTo(0, -10, 15, 0); g.quadraticCurveTo(0, 10, -15, 0); g.fill(); g.restore();
  }
  g.lineCap = 'round';
  for (let k = 0; k < 24; k++) {                                    // pine bough: a stem with needles, growing left to right
    const t = k / 23, x = S + 20 + t * 216, spread = (1 - t) * 112 + 18;
    for (let i = 0; i < 30; i++) { g.strokeStyle = shade(140, 255); g.lineWidth = 6; const y = 128 + between(-spread, spread) * 0.35; g.beginPath(); g.moveTo(x, y); g.lineTo(x + between(6, 24), y + between(-spread, spread) * 0.7); g.stroke(); }
  }
  for (let k = 0; k < 46; k++) {                                    // palm frond: leaflets along a midrib
    const x = S * 2 + 12 + k * 5, t = k / 45, len = 108 * Math.sin(Math.PI * (0.12 + t * 0.82));
    for (const s of [-1, 1]) { g.strokeStyle = shade(160, 255); g.lineWidth = 5; g.beginPath(); g.moveTo(x, 128); g.quadraticCurveTo(x + 10, 128 + s * len * 0.55, x + 22, 128 + s * len); g.stroke(); }
  }
  g.strokeStyle = '#ddd'; g.lineWidth = 5; g.beginPath(); g.moveTo(S * 2 + 6, 128); g.lineTo(S * 3 - 10, 128); g.stroke();
  g.fillStyle = '#d8d8d8'; g.fillRect(S * 3, 0, S, S);              // bark: streaks
  for (let i = 0; i < 700; i++) { g.fillStyle = shade(120, 255); g.fillRect(S * 3 + rand() * S, rand() * S, between(2, 5), between(8, 30)); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function material() {
  const m = new THREE.MeshStandardMaterial({ map: atlas(), vertexColors: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
  // leaf normals point out of the crown on purpose, so they must not flip on back faces
  m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0')); };
  return m;
}
const column = (g, tile) => { const U = g.attributes.uv; for (let i = 0; i < U.count; i++) U.setX(i, (tile + 0.02 + U.getX(i) * 0.96) / 4); return g; };
function colour(g, hex, k = 1) {
  const c = new THREE.Color(hex).multiplyScalar(k), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
// tapered limb from point a to point b
function limb(a, b, r0, r1, hex, sides = 6) {
  const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, true).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())).translate(A.x, A.y, A.z);
  return colour(column(g, BARK), hex);
}
function lightFrom(g, centre) {                                     // soft shading: normals radiate from the crown centre
  const P = g.attributes.position, N = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).sub(centre); v.y += 0.6; v.normalize(); N.setXYZ(i, v.x, v.y, v.z); }
  return g;
}
// leaf cards filling an ellipsoid; lower and inner leaves are darker
function crown(parts, [cx, cy, cz], rx, ry, count, size, hex) {
  const centre = new THREE.Vector3(cx, cy, cz);
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1, a = rand() * 6.283, r = 0.45 + 0.55 * Math.sqrt(rand()), s = Math.sqrt(1 - u * u);
    const g = new THREE.PlaneGeometry(size, size);
    g.rotateX(between(-1.2, 1.2)).rotateY(rand() * 6.283).translate(cx + Math.cos(a) * s * rx * r, cy + u * ry * r, cz + Math.sin(a) * s * rx * r);
    parts.push(colour(column(lightFrom(g, centre), LEAF), hex, 0.55 + 0.35 * (u * 0.5 + 0.5) + 0.2 * r));
  }
}
function broadleaf(merge, { trunk, bark, green, crowns, thick = 0.34 }) {
  const parts = [limb([0, 0, 0], [0.1, trunk, 0], thick, thick * 0.6, bark, 8)];
  for (const [x, y, z, rx, ry, n, size] of crowns) {
    parts.push(limb([0.05, trunk * between(0.7, 1), 0], [x, y, z], thick * 0.4, 0.05, bark, 5));
    crown(parts, [x, y, z], rx, ry, n, size, green);
  }
  return merge(parts);
}
function pine(merge, { height, radius, tiers, green, bare }) {
  const parts = [limb([0, 0, 0], [0, height * 0.97, 0], 0.36, 0.05, '#6a4a34', 7)];
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1), y = bare + (height - bare - 0.6) * f, r = radius * (1 - f * 0.85), n = 8 - Math.floor(f * 3), turn = rand() * 6.283;
    for (let k = 0; k < n; k++) {
      const a = turn + k / n * 6.283 + between(-0.2, 0.2), len = r * between(0.8, 1.15);
      const g = new THREE.PlaneGeometry(len, len * 1.3).rotateX(-Math.PI / 2 + between(-0.5, 0.5)).translate(len / 2, 0, 0).rotateZ(-between(0.15, 0.45)).rotateY(a).translate(0, y, 0);
      parts.push(colour(column(lightFrom(g, new THREE.Vector3(0, y - 0.5, 0)), NEEDLE), green, 0.6 + 0.5 * f));
    }
  }
  for (const turn of [0, Math.PI / 2]) {                            // pointed tip
    const g = new THREE.PlaneGeometry(1.7, 0.9).rotateZ(Math.PI / 2).rotateY(turn).translate(0, height - 0.5, 0);
    parts.push(colour(column(g, NEEDLE), green, 1.1));
  }
  return merge(parts);
}
function palm(merge, { height, bend, fronds }) {
  const parts = [], at = t => [bend * t * t, height * t, 0];
  for (let i = 0; i < 7; i++) parts.push(limb(at(i / 7), at((i + 1) / 7), 0.34 - i * 0.022, 0.28 - i * 0.018, i % 2 ? '#a58a63' : '#8d7352', 8));
  const [tx, ty] = at(1);
  for (let k = 0; k < fronds; k++) {
    const len = between(3.4, 4.6), rise = between(-0.1, 0.9), g = new THREE.PlaneGeometry(len, 1.7, 7, 1).rotateX(-Math.PI / 2).translate(len / 2, 0, 0), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const t = P.getX(i) / len; P.setY(i, rise * P.getX(i) - (0.35 + rise * 0.75) * t * t * len * 0.75 - Math.abs(P.getZ(i)) * 0.25); }   // arch and droop
    g.computeVertexNormals(); const N = g.attributes.normal; for (let i = 0; i < N.count; i++) if (N.getY(i) < 0) N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i));
    g.rotateY(k / fronds * 6.283 + between(-0.25, 0.25)).translate(tx, ty, 0);
    parts.push(colour(column(g, FROND), rise < 0.15 ? '#8f9a3c' : k % 2 ? '#43963c' : '#5cae46'));
  }
  for (let k = 0; k < 3; k++) parts.push(colour(column(new THREE.SphereGeometry(0.22, 6, 5).translate(tx + Math.cos(k * 2.1) * 0.28, ty - 0.3, Math.sin(k * 2.1) * 0.28), BARK), '#6b4a24'));
  return merge(parts);
}

export function makeFoliage(merge) {
  const broads = [
    broadleaf(merge, { trunk: 3.2, bark: '#6b4d32', green: '#5d9a3c', crowns: [[0, 5.6, 0, 2.3, 2.0, 55, 1.5], [1.5, 4.7, 0.5, 1.5, 1.3, 25, 1.3], [-1.5, 4.9, -0.5, 1.5, 1.3, 25, 1.3]] }),   // oak
    broadleaf(merge, { trunk: 2.4, bark: '#5c4634', green: '#3f7d34', thick: 0.28, crowns: [[0, 4.2, 0, 1.2, 2.2, 45, 1.1], [0, 6.4, 0, 0.9, 2.0, 30, 0.9]] }),                           // tall and narrow
    broadleaf(merge, { trunk: 2.8, bark: '#74553a', green: '#7aa83a', thick: 0.4, crowns: [[0, 4.6, 0, 2.6, 1.3, 40, 1.4], [2.2, 4.1, -0.6, 1.7, 1.0, 25, 1.2], [-2.1, 4.3, 0.8, 1.7, 1.0, 25, 1.2]] }),   // wide
    broadleaf(merge, { trunk: 4.0, bark: '#e4e0d4', green: '#93b94a', thick: 0.2, crowns: [[0.2, 5.4, 0, 1.4, 1.8, 40, 1.0], [-0.7, 4.4, 0.4, 0.9, 1.0, 14, 0.9]] }),                    // birch
  ];
  const pines = [
    pine(merge, { height: 11, radius: 3.0, tiers: 9, green: '#2f6a3a', bare: 2.0 }),
    pine(merge, { height: 13.5, radius: 2.2, tiers: 11, green: '#285c40', bare: 2.4 }),
    pine(merge, { height: 9, radius: 3.5, tiers: 7, green: '#467536', bare: 1.4 }),
  ];
  const palms = [palm(merge, { height: 7.6, bend: 0.2, fronds: 12 }), palm(merge, { height: 8.8, bend: 1.3, fronds: 11 }), palm(merge, { height: 6.2, bend: -0.7, fronds: 13 })];
  const bushes = ['#4d8a35', '#6f9a3a'].map((green, i) => { const p = []; crown(p, [0, 0.7, 0], 1.1, 0.8, 26, 0.9, green); crown(p, [0.8, 0.45, 0.2 - i * 0.5], 0.7, 0.55, 12, 0.7, green); return merge(p); });
  return { broads, pines, palms, bushes, mat: material() };
}
// place a list of trees, spreading it over the species (chosen from position and order, so it is the same on every load)
export function plant(instances, geos, mat, list) {
  const groups = geos.map(() => []);
  list.forEach((o, i) => groups[Math.abs(Math.floor(o.x * 7.31 + o.z * 3.17) + i) % geos.length].push(o));
  groups.forEach((g, i) => instances(geos[i], mat, g));
}
