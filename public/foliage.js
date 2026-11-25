// foliage.js - trees, palms, bushes and tufts made of alpha-textured leaf cards (procedural, no image files).
// Each kind is one geometry + one material, so a whole forest cell stays a single draw call.
import * as THREE from 'three';

const rng = seed => { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const SOLID = [0.02, 0.02];                    // uv of the opaque white corner, for trunks and canopy cores

// draw on a canvas, then upload as a DataTexture so transparent texels keep a leaf colour (no dark halos in the mipmaps)
function cardTexture(draw, { solidCorner = true, size = 256 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d', { willReadFrequently: true });
  draw(g, size, rng(91));
  if (solidCorner) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 12, 12); }
  const d = g.getImageData(0, 0, size, size).data; let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  const data = new Uint8Array(d); r /= n || 1; gg /= n || 1; b /= n || 1;
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] < 8) { data[i] = r; data[i + 1] = gg; data[i + 2] = b; }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat); t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8; t.needsUpdate = true; return t;
}
const leaf = (g, x, y, len, wid, ang, col) => { g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = col; g.beginPath(); g.moveTo(-len / 2, 0); g.quadraticCurveTo(0, -wid, len / 2, 0); g.quadraticCurveTo(0, wid, -len / 2, 0); g.fill(); g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2, 0); g.stroke(); g.restore(); };
const tone = (r, lo, hi) => `hsl(${75 + r() * 40},${14 + r() * 18}%,${lo + r() * (hi - lo)}%)`;
const clusterTex = () => cardTexture((g, S, r) => { for (let i = 0; i < 230; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * S * 0.4, t = i / 230; leaf(g, S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 26 + r() * 18, 8 + r() * 5, r() * 6.283, tone(r, 52 + t * 22, 68 + t * 28)); } });
const blossomTex = () => cardTexture((g, S, r) => { for (let i = 0; i < 520; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * S * 0.4, x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d, col = `hsl(${335 + r() * 20},${55 + r() * 35}%,${76 + r() * 20}%)`;for (let k = 0; k < 5; k++) leaf(g, x + Math.cos(k * 1.2566) * 5, y + Math.sin(k * 1.2566) * 5, 11, 4.5, k * 1.2566, col); } });
const needleTex = () => cardTexture((g, S, r) => {                       // a conifer branch: stem along u, needles swept toward the tip
  g.strokeStyle = '#b9a98c'; g.lineWidth = 7; g.beginPath(); g.moveTo(14, S / 2); g.lineTo(S - 16, S / 2); g.stroke();
  for (let i = 0; i < 520; i++) { const t = r(), x = 16 + t * (S - 40), len = 18 + (1 - t) * 62 * (0.5 + r() * 0.5), side = r() < 0.5 ? -1 : 1; g.strokeStyle = tone(r, 62, 96); g.lineWidth = 3.4; g.beginPath(); g.moveTo(x, S / 2); g.lineTo(x + len * 0.55, S / 2 + side * len); g.stroke(); } });
const frondTex = () => cardTexture((g, S, r) => {                        // palm frond: rib along u, long leaflets on both sides
  for (let x = 14; x < S - 6; x += 5) { const t = (x - 14) / (S - 20), len = 112 * Math.sin(Math.PI * Math.min(0.96, t * 0.86 + 0.1)); for (const side of [-1, 1]) leaf(g, x + len * 0.24, S / 2 + side * len * 0.5, len * 1.12, 5.5, side * (1.12 - t * 0.35), tone(r, 62, 94)); }
  g.strokeStyle = '#d8d9a8'; g.lineWidth = 6; g.beginPath(); g.moveTo(10, S / 2); g.lineTo(S - 8, S / 2); g.stroke(); });
const tuftTex = (heads) => cardTexture((g, S, r) => {                    // grass / crop / flower tuft, bottom of the card = bottom of the canvas
  for (let i = 0; i < 70; i++) { const x = 20 + r() * (S - 40), h = S * (0.35 + r() * 0.55), lean = (r() - 0.5) * 60;
    g.strokeStyle = tone(r, 55, 92); g.lineWidth = 3.5 + r() * 2; g.beginPath(); g.moveTo(x, S); g.quadraticCurveTo(x + lean * 0.2, S - h * 0.6, x + lean, S - h); g.stroke();
    if (heads && i % heads.every === 0) { g.fillStyle = heads.colors[(r() * heads.colors.length) | 0]; g.beginPath(); g.ellipse(x + lean, S - h, heads.rx, heads.ry, lean * 0.01, 0, 7); g.fill(); } } }, { solidCorner: false });

// ---- geometry builder: quads and lumpy cores, each vertex with normal, uv and a baked colour
function builder() {
  const pos = [], nor = [], uv = [], col = [], idx = [], C = new THREE.Color();
  const vert = (p, n, u, hex, shade = 1) => { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(u[0], u[1]); C.set(hex).multiplyScalar(shade); col.push(C.r, C.g, C.b); return pos.length / 3 - 1; };
  return {
    quad(p, uvs, n, hex, shades = [1, 1, 1, 1]) { const i = p.map((v, k) => vert(v, n, uvs[k], hex, shades[k])); idx.push(i[0], i[1], i[2], i[0], i[2], i[3]); },
    solid(geo, colourOf) { const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position, N = g.attributes.normal, v = new THREE.Vector3(), n = new THREE.Vector3(); for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i); const [hex, shade] = colourOf(v); idx.push(vert(v, n, SOLID, hex, shade)); } },
    build() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeBoundingSphere(); return g; },
  };
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FULL = [[0, 1], [1, 1], [1, 0], [0, 0]];
// a crown of leaf cards on an ellipsoid; normals point away from the crown centre so it shades like one soft volume
function crown(b, r, { cx = 0, cy, cz = 0, rx, ry, n, size, dark, light }) {
  b.solid(new THREE.IcosahedronGeometry(1, 0).scale(rx * 0.62, ry * 0.62, rx * 0.62).translate(cx, cy, cz), v => [dark, 0.85 + Math.max(0, (v.y - cy) / ry) * 0.5]);
  for (let i = 0; i < n; i++) {
    const y = 1 - 2 * (i + 0.5) / n, a = i * 2.39996, s = Math.sqrt(1 - y * y), out = V(Math.cos(a) * s, y, Math.sin(a) * s), d = 0.68 + r() * 0.34;
    const p = V(cx + out.x * rx * d, cy + out.y * ry * d, cz + out.z * rx * d), face = out.clone().add(V(r() - 0.5, r() - 0.5, r() - 0.5)).normalize();
    const side = V(0, 1, 0).cross(face).normalize().applyAxisAngle(face, r() * 6.283).multiplyScalar(size * (0.8 + r() * 0.4) / 2), up = face.clone().cross(side);
    const nrm = out.clone().add(V(0, 0.5, 0)).normalize(), t = (out.y + 1) / 2, hex = new THREE.Color(dark).lerp(new THREE.Color(light), Math.min(1, t * 0.85 + r() * 0.3));
    b.quad([p.clone().sub(side).sub(up), p.clone().add(side).sub(up), p.clone().add(side).add(up), p.clone().sub(side).add(up)], FULL, nrm, hex);
  }
}
const trunk = (b, r0, r1, h, hex, seg = 7) => b.solid(new THREE.CylinderGeometry(r0, r1, h, seg).translate(0, h / 2, 0), v => [hex, 0.75 + 0.4 * v.y / h]);

function broadGeo() {
  const b = builder(), r = rng(5);
  trunk(b, 0.2, 0.42, 4.2, '#6b4d34');
  for (const [rx, rz] of [[0.7, 0.25], [-0.65, -0.35], [0.1, -0.75]]) b.solid(new THREE.CylinderGeometry(0.08, 0.17, 2.4, 5).translate(0, 1.2, 0).rotateZ(-rx * 0.8).rotateX(rz * 0.8).translate(0, 2.8, 0), () => ['#5a4128', 1]);
  crown(b, r, { cy: 5.6, rx: 3.0, ry: 2.5, n: 44, size: 2.3, dark: '#2f6224', light: '#93c64e' });
  crown(b, r, { cx: 1.4, cy: 4.4, cz: 0.9, rx: 1.5, ry: 1.2, n: 11, size: 1.8, dark: '#2f6224', light: '#7fb845' });
  return b.build();
}
function sakuraGeo() {
  const b = builder(), r = rng(31);
  trunk(b, 0.18, 0.4, 3.2, '#4a3330');
  for (const [rx, rz] of [[0.9, 0.2], [-0.8, -0.3], [0.1, 0.85]]) b.solid(new THREE.CylinderGeometry(0.07, 0.15, 2.6, 5).translate(0, 1.3, 0).rotateZ(-rx * 0.9).rotateX(rz * 0.9).translate(0, 2.5, 0), () => ['#4a3330', 1]);
  crown(b, r, { cy: 4.6, rx: 3.5, ry: 1.9, n: 52, size: 2.2, dark: '#e59ab4', light: '#fff0f5' });
  return b.build();
}
function bushGeo() { const b = builder(), r = rng(8); crown(b, r, { cy: 0.65, rx: 1.15, ry: 0.8, n: 22, size: 1.05, dark: '#356b2a', light: '#8ec153' }); return b.build(); }
function pineGeo() {
  const b = builder(), r = rng(13);
  trunk(b, 0.16, 0.4, 5, '#5c4230', 5);
  b.solid(new THREE.ConeGeometry(1.5, 8.4, 7, 1, true).translate(0, 6.3, 0), v => ['#1f4426', 0.7 + 0.05 * (v.y - 2)]);   // dense core behind the branches
  const TIERS = 9;
  for (let i = 0; i < TIERS; i++) {
    const t = i / TIERS, y = 2.5 + i * 0.93, len = 3.1 * (1 - t * 0.8), k = len > 1.8 ? 6 : 4;
    for (let j = 0; j < k; j++) {
      const a = j / k * 6.283 + i * 0.9 + r() * 0.3, dir = V(Math.cos(a), 0, Math.sin(a)), across = V(-dir.z, 0, dir.x).multiplyScalar(len * 0.46);
      const base = V(0, y + 0.45, 0), tip = V(dir.x * len, y - len * 0.3 + r() * 0.2, dir.z * len), nrm = V(dir.x * 0.6, 0.8, dir.z * 0.6).normalize();
      const roll = V(0, len * 0.2, 0), hex = new THREE.Color('#2c5c30').lerp(new THREE.Color('#6a9c4c'), t * 0.8 + r() * 0.2);
      b.quad([base.clone().sub(across).sub(roll), tip.clone().sub(across).sub(roll), tip.clone().add(across).add(roll), base.clone().add(across).add(roll)], [[0, 0], [1, 0], [1, 1], [0, 1]], nrm, hex, [0.7, 1.1, 1.1, 0.7]);
    }
  }
  for (let j = 0; j < 3; j++) { const a = j * 1.047, s = V(Math.cos(a) * 0.55,0, Math.sin(a) * 0.55); b.quad([V(-s.x, 9.8, -s.z), V(s.x, 9.8, s.z), V(s.x, 12.2, s.z), V(-s.x, 12.2, -s.z)], [[0, 0], [0, 1], [1, 1], [1, 0]], V(-s.z, 0.8, s.x).normalize(), '#5f9348'); }
  return b.build();
}
function palmGeo() {
  const b = builder(), r = rng(21), H = 7.4, bend = t => 0.9 * t * t;
  for (let i = 0; i < 9; i++) { const y0 = i * H / 9, y1 = (i + 1) * H / 9, r0 = 0.34 - 0.15 * i / 9, g = new THREE.CylinderGeometry(r0 * 0.88, r0 * 1.08, y1 - y0, 8, 1, true).translate(bend((i + 0.5) / 9), (y0 + y1) / 2, 0); b.solid(g, () => [i % 2 ? '#9b7a50' : '#7f6140', 1]); }
  const top = V(bend(1), H, 0);
  b.solid(new THREE.IcosahedronGeometry(0.42, 0).translate(top.x, top.y, 0), () => ['#6d5a2a', 1]);
  for (let f = 0; f < 12; f++) {
    const a = f / 12 * 6.283 + r() * 0.3, dir = V(Math.cos(a), 0, Math.sin(a)), side = V(-dir.z, 0, dir.x), len = 4.2 + r() * 1.1, rise = f % 3 === 0 ? 3.2 : 1.7, SEG = 6;
    const hex = new THREE.Color('#2f7a2c').lerp(new THREE.Color('#9ac64a'), r()), mid = [], edge = [[], []];
    for (let i = 0; i <= SEG; i++) { const t = i / SEG, p = top.clone().addScaledVector(dir, t * len); p.y += rise * t - 3.3 * t * t; mid.push(p); [-1, 1].forEach((s, k) => edge[k].push(p.clone().addScaledVector(side, s * 0.95).add(V(0, -0.35, 0)))); }
    for (let i = 0; i < SEG; i++) { const u0 = i / SEG, u1 = (i + 1) / SEG, n = V(dir.x * (u0 - 0.3), 1, dir.z * (u0 - 0.3)).normalize();
      b.quad([edge[0][i], edge[0][i + 1], mid[i + 1], mid[i]], [[u0, 0], [u1, 0], [u1, 0.5], [u0, 0.5]], n, hex, [0.85, 0.85, 1.05, 1.05]);
      b.quad([mid[i], mid[i + 1], edge[1][i + 1], edge[1][i]], [[u0, 0.5], [u1, 0.5], [u1, 1], [u0, 1]], n, hex, [1.05, 1.05, 0.85, 0.85]); }
  }
  return b.build();
}
// three crossed vertical cards, 1 m wide and 1 m tall, normals up so they light like the ground
function tuftGeo(bottom, top, cards = 3) {
  const b = builder(), up = V(0, 1, 0);
  for (let j = 0; j < cards; j++) { const a = j * Math.PI / cards, s = V(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5); b.quad([V(-s.x, 0, -s.z), V(s.x, 0, s.z), V(s.x, 1, s.z), V(-s.x, 1, -s.z)], [[0, 1], [1, 1], [1, 0], [0, 0]], up, '#ffffff'); }
  const g = b.build(), C = g.attributes.color, P = g.attributes.position, cb = new THREE.Color(bottom), ct = new THREE.Color(top), c = new THREE.Color();
  for (let i = 0; i < P.count; i++) { c.copy(cb).lerp(ct, P.getY(i)); C.setXYZ(i, c.r, c.g, c.b); }
  return g;
}

export function foliageMaterial(map, alphaTest = 0.34) {
  const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, alphaTest, side: THREE.DoubleSide, roughness: 0.92, metalness: 0, envMapIntensity: 0.75 });
  m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal); nonPerturbedNormal = normal;'); };   // both faces keep the soft outward normal (no black backsides)
  return m;
}
export function makeFoliage() {
  const leaves = foliageMaterial(clusterTex()), needles = foliageMaterial(needleTex(), 0.3), fronds = foliageMaterial(frondTex(), 0.32);
  const grass = foliageMaterial(tuftTex(null), 0.4), flowers = foliageMaterial(tuftTex({ every: 5, rx: 8, ry: 8, colors: ['#ffffff', '#ffe34d', '#ff7aa8', '#c79bff', '#ff8a4d'] }), 0.4), wheat = foliageMaterial(tuftTex({ every: 2, rx: 5, ry: 16, colors: ['#fff3c4', '#ffe9a0'] }), 0.4);
  const blossoms = foliageMaterial(blossomTex(), 0.36);
  return {
    sakura: { geo: sakuraGeo(), mat: blossoms },
    broad: { geo: broadGeo(), mat: leaves }, bush: { geo: bushGeo(), mat: leaves }, pine: { geo: pineGeo(), mat: needles }, palm: { geo: palmGeo(), mat: fronds },
    grass: { geo: tuftGeo('#7fa845', '#d2ec86'), mat: grass }, dune: { geo: tuftGeo('#8f9a52', '#d9d58e'), mat: grass }, flowers: { geo: tuftGeo('#5f8a36', '#ffffff'), mat: flowers },
    wheat: { geo: tuftGeo('#a8842f', '#f0d478', 2), mat: wheat }, crop: { geo: tuftGeo('#3f7a2c', '#97cf55', 2), mat: grass }, lavender: { geo: tuftGeo('#5d6f4a', '#a98ad8', 2), mat: wheat }, rape: { geo: tuftGeo('#5f8f2c', '#f2dc3a', 2), mat: wheat },
  };
}
