// main.js — client. Phase 1: the world (terrain, road, scenery) + a cruise / fly camera to inspect it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as W from './world.js';

const $ = id => document.getElementById(id);            // always null-guard DOM use (elements can be removed)
const setText = (id, t) => { const e = $(id); if (e) e.textContent = t; };
const rnd = W.mulberry(20240611);
const R = (a, b) => a + (b - a) * rnd();
const clamp01 = v => Math.max(0, Math.min(1, v));
const { ROAD, BOUNDS, NX, NZ, CELL, TERRAIN, sstep, terrainH, roadAt, roadQuery } = W;

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const FOG = 0xbfe0f5;
scene.fog = new THREE.Fog(FOG, 700, 4800);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.8, 7000);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// sky dome: gradient + sun glow
const SUN_DIR = new THREE.Vector3(0.5, 0.68, 0.38).normalize();
const sky = new THREE.Mesh(new THREE.SphereGeometry(5500, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { sun: { value: SUN_DIR } },
  vertexShader: 'varying vec3 v; void main(){ v=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `varying vec3 v; uniform vec3 sun; void main(){
    float h=clamp(v.y,0.,1.); vec3 hor=vec3(.80,.91,.98), mid=vec3(.42,.70,.96), top=vec3(.16,.42,.88);
    vec3 c=mix(hor,mid,smoothstep(0.,.25,h)); c=mix(c,top,smoothstep(.2,.9,h));
    if(v.y<0.) c=hor;
    float s=max(dot(normalize(v),sun),0.); c+=vec3(1.,.9,.7)*pow(s,900.)*3. + vec3(1.,.85,.6)*pow(s,12.)*.18;
    gl_FragColor=vec4(c,1.); }`
}));
sky.renderOrder = -10; scene.add(sky);

scene.add(new THREE.HemisphereLight(0xbfe3ff, 0xd9c79a, 1.15));
const sun = new THREE.DirectionalLight(0xfff0d0, 2.7);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 1, far: 1000 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

// ---------------------------------------------------------------- procedural textures
function canvasTex(w, h, draw, rep = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const speckle = (g, w, h, n, a) => { for (let i = 0; i < n; i++) { const v = (Math.random() * 255) | 0; g.fillStyle = `rgba(${v},${v},${v},${a})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); } };
// road: u across (12 m), v along (16 m): worn lanes, dashed centre line, edge lines
const asphaltTex = canvasTex(256, 512, (g, w, h) => {
  g.fillStyle = '#3c3e44'; g.fillRect(0, 0, w, h); speckle(g, w, h, 5000, .22);
  g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(w * .18, 0, w * .12, h); g.fillRect(w * .70, 0, w * .12, h);
  g.fillStyle = '#e9e9e2'; g.fillRect(w * .045, 0, 4, h); g.fillRect(w * .955 - 4, 0, 4, h);              // edge lines
  g.fillStyle = '#f2c230'; for (let k = 0; k < 2; k++) g.fillRect(w / 2 - 2, k * 256 + 24, 4, 112);       // dashed centre (4 m dash, 4 m gap)
});
const plainAsphaltTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#3f4147'; g.fillRect(0, 0, w, h); speckle(g, w, h, 4000, .2); });
const plankTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#b98a58'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { g.fillStyle = `hsl(30,${35 + Math.random() * 15}%,${40 + Math.random() * 14}%)`; g.fillRect(0, y, w, 14); g.fillStyle = '#5b3d22'; g.fillRect(0, y + 14, w, 2); } });
const windowTex = canvasTex(64, 64, (g, w, h) => {   // one 4x4 m facade tile: wall + window
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#58759a'; g.fillRect(10, 12, 44, 40);
  g.fillStyle = '#a9d2f2'; g.fillRect(10, 12, 44, 14); g.fillStyle = '#e8eef4'; g.fillRect(31, 12, 2, 40); });
const grainTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, w, h); speckle(g, w, h, 1800, .10); });
const waterNormal = (() => { const s = 256, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'), im = g.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const u = x / s * 6.2832, v = y / s * 6.2832;
    const dx = Math.cos(u * 2 + Math.sin(v)) * .5 + Math.cos(u * 5 + v * 3) * .25, dy = Math.cos(v * 2 + Math.sin(u)) * .5 + Math.cos(v * 4 - u * 2) * .25, o = (y * s + x) * 4;
    im.data[o] = 128 + dx * 70; im.data[o + 1] = 128 + dy * 70; im.data[o + 2] = 255; im.data[o + 3] = 255; }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(300, 300); return t; })();

// ---------------------------------------------------------------- terrain (chunked, vertex-coloured)
const H = TERRAIN.H, D = TERRAIN.D, hAt = (i, j) => H[Math.min(NX - 1, Math.max(0, i)) + Math.min(NZ - 1, Math.max(0, j)) * NX];
const C = hex => new THREE.Color(hex);
const col = { grass: C(0x79c64f), grass2: C(0x5aa944), dark: C(0x3f8a3c), sand: C(0xf2dfa6), wet: C(0xd8c38a), shallow: C(0xe3d6a0), deep: C(0x2b8fa6), rock: C(0x8d867c), alpine: C(0xa8b49a), pale: C(0xd9ddd6), city: C(0xbfc3ca), gravel: C(0x9c917e), stone: C(0xcfc8b8) };
const tmp = new THREE.Color();
function terrainColor(i, j, o) {
  const x = BOUNDS.x0 + i * CELL, z = BOUNDS.z0 + j * CELL, h = H[o], d = D[o];
  const sx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * CELL), sz = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * CELL), slope = Math.hypot(sx, sz);
  const n = W.fbm(x / 40, z / 40);
  const c = new THREE.Color().copy(col.grass).lerp(col.grass2, n);
  const beach = sstep((z - 760) / 90) * (x < 350 ? 1 : sstep((600 - x) / 250));
  if (beach > 0 && h < 6) c.lerp(h < 0.9 ? col.wet : col.sand, beach * (1 - sstep((h - 3.6) / 2)));
  const hi = sstep((h - 25) / 90); c.lerp(col.dark, hi * 0.55 * (0.6 + n * 0.4));
  c.lerp(col.alpine, sstep((h - 105) / 55)).lerp(col.pale, sstep((h - 175) / 25));
  c.lerp(col.rock, sstep((slope - 0.42) / 0.35));
  const cw = W.sstep(1 - Math.min(1, Math.hypot(Math.max(W.CITY_RECT.x0 - x, 0, x - W.CITY_RECT.x1), Math.max(W.CITY_RECT.z0 - z, 0, z - W.CITY_RECT.z1)) / 40));
  if (cw > 0) c.lerp(col.city, cw);
  if (h < 0) c.lerp(col.shallow, 1).lerp(col.deep, sstep(-h / 7));
  if (d < 10) c.lerp(col.gravel, 1 - sstep((d - 6.6) / 3.4));
  for (const p of W.PADS) c.lerp(col.stone, 1 - sstep((Math.hypot(x - p.x, z - p.z) - p.r) / 4));
  return c;
}
const terrain = new THREE.Group(); scene.add(terrain);
const terrMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: grainTex });
for (let cz = 0; cz < NZ - 1; cz += 64) for (let cx = 0; cx < NX - 1; cx += 64) {
  const i1 = Math.min(cx + 64, NX - 1), j1 = Math.min(cz + 64, NZ - 1), w = i1 - cx + 1, h = j1 - cz + 1;
  const pos = new Float32Array(w * h * 3), nor = new Float32Array(w * h * 3), cl = new Float32Array(w * h * 3), uv = new Float32Array(w * h * 2), idx = new Uint16Array((w - 1) * (h - 1) * 6);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const gi = cx + i, gj = cz + j, o = gi + gj * NX, v = i + j * w;
    pos[v * 3] = BOUNDS.x0 + gi * CELL; pos[v * 3 + 1] = H[o]; pos[v * 3 + 2] = BOUNDS.z0 + gj * CELL;
    const nx = (hAt(gi - 1, gj) - hAt(gi + 1, gj)) / (2 * CELL), nz = (hAt(gi, gj - 1) - hAt(gi, gj + 1)) / (2 * CELL), l = Math.hypot(nx, 1, nz);
    nor[v * 3] = nx / l; nor[v * 3 + 1] = 1 / l; nor[v * 3 + 2] = nz / l;
    const c = terrainColor(gi, gj, o); cl[v * 3] = c.r; cl[v * 3 + 1] = c.g; cl[v * 3 + 2] = c.b;
    uv[v * 2] = pos[v * 3] / 12; uv[v * 2 + 1] = pos[v * 3 + 2] / 12;
  }
  let k = 0; for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) { const a = i + j * w, b = a + 1, c2 = a + w, d = c2 + 1; idx.set([a, c2, b, b, c2, d], k); k += 6; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere(); const m = new THREE.Mesh(g, terrMat); m.receiveShadow = true; terrain.add(m);
}
// ocean
const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x23c4d8, transparent: true, opacity: 0.8, roughness: 0.12, metalness: 0.1, normalMap: waterNormal, normalScale: new THREE.Vector2(0.35, 0.35) }));
water.position.y = 0; scene.add(water);

// ---------------------------------------------------------------- road + flat strips
function ribbon(pts, halfW, vScale, mat, offset = 0, closed = false) { // pts: {x,y,z,tx,tz,s}
  const n = pts.length, pos = [], uv = [], idx = [];
  pts.forEach(p => { const nx = -p.tz, nz = p.tx; pos.push(p.x - nx * halfW, p.y + offset, p.z - nz * halfW, p.x + nx * halfW, p.y + offset, p.z + nz * halfW); uv.push(0, p.s / vScale, 1, p.s / vScale); });
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); return m;
}
const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const flatMat = new THREE.MeshStandardMaterial({ map: plainAsphaltTex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
{ const pts = []; for (let i = 0; i <= ROAD.N; i++) { const k = i % ROAD.N; pts.push({ x: ROAD.X[k], y: ROAD.Y[k], z: ROAD.Z[k], tx: ROAD.TX[k], tz: ROAD.TZ[k], s: i * ROAD.ds }); }
  ribbon(pts, W.ROAD_HALF, 16, roadMat); }
// city avenues (decorative flat strips on the city pad) + central drift plaza
const CR = W.CITY_RECT, AVY = CR.h + 0.1;
function strip(x0, z0, x1, z1, wid) { const L = Math.hypot(x1 - x0, z1 - z0), tx = (x1 - x0) / L, tz = (z1 - z0) / L, pts = [];
  for (let s = 0; s <= L; s += 20) pts.push({ x: x0 + tx * s, y: AVY, z: z0 + tz * s, tx, tz, s }); ribbon(pts, wid / 2, 16, roadMat); }
const AVX = [480, 850], AVZ = [190, 650];
AVX.forEach(x => strip(x, CR.z0 + 6, x, CR.z1 - 6, 24)); AVZ.forEach(z => strip(CR.x0 + 6, z, CR.x1 - 6, z, 24));
{ const plaza = new THREE.Mesh(new THREE.CircleGeometry(W.PLAZA.r, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#44464c'; g.fillRect(0, 0, w, h); speckle(g, w, h, 8000, .2);
    g.strokeStyle = '#f2f2ee'; g.lineWidth = 6; for (const r of [60, 120, 190, 240]) { g.beginPath(); g.arc(w / 2, h / 2, r, 0, 7); g.stroke(); } g.fillStyle = '#f2c230'; for (let a = 0; a < 12; a++) { g.save(); g.translate(w / 2, h / 2); g.rotate(a * Math.PI / 6); g.fillRect(122, -3, 60, 6); g.restore(); } }, false), roughness: .9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  plaza.position.set(W.PLAZA.x, AVY + 0.02, W.PLAZA.z); plaza.receiveShadow = true; scene.add(plaza);
  const rim = new THREE.Mesh(new THREE.RingGeometry(W.PLAZA.r, W.PLAZA.r + 2, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: .8 })); rim.position.set(W.PLAZA.x, AVY + 0.15, W.PLAZA.z); scene.add(rim); }

// ---------------------------------------------------------------- geometry helpers
const paint = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const merge = gs => mergeGeometries(gs.map(g => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }));
const dummy = new THREE.Object3D();
function instances(geo, mat, list, { cast = true, receive = false } = {}) { // list of {x,y,z,ry,sx,sy,sz,c,rx,rz}
  if (!list.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, list.length), cc = new THREE.Color();
  list.forEach((o, i) => { dummy.position.set(o.x, o.y, o.z); dummy.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0); dummy.scale.set(o.sx || 1, o.sy || o.sx || 1, o.sz || o.sx || 1); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); if (o.c !== undefined) m.setColorAt(i, cc.set(o.c)); });
  m.castShadow = cast; m.receiveShadow = receive; m.frustumCulled = false; scene.add(m); return m;
}
const stdV = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const stdVflat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
const dsMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
// box with UVs scaled to metres (texture tile = 1/s metres); faces: 0 +x,1 -x,2 +y,3 -y,4 +z,5 -z
function boxFaces(w, h, d, faces, s = 0.25, color = '#fff') {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(), P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, pos = [], nor = [], uv = [];
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (const f of faces) for (let v = f * 6; v < f * 6 + 6; v++) { pos.push(P.getX(v), P.getY(v), P.getZ(v)); nor.push(N.getX(v), N.getY(v), N.getZ(v)); uv.push(U.getX(v) * dims[f][0] * s, U.getY(v) * dims[f][1] * s); }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); o.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return paint(o, color);
}
const sideOf = (x, z) => ({ x, z });
const free = (x, z, minD) => { const q = roadQuery(x, z, minD + 5); return q.d === Infinity || q.d > minD; };
const hasNeighbors = (x, z) => false;

// ---------------------------------------------------------------- BEACH: palms, umbrellas, boardwalk, pier
{ // palms
  const blades = []; for (let k = 0; k < 8; k++) { const len = 4.4, seg = 5, pos = [], idx = [];
      for (let i = 0; i <= seg; i++) { const t = i / seg, w = 0.55 * (1 - t * 0.85); pos.push(t * len, -0.9 * t * t * len * 0.45, -w, t * len, -0.9 * t * t * len * 0.45, w); }
      for (let i = 0; i < seg; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); g.rotateY(k * Math.PI / 4); g.rotateZ(0.18 * (k % 2)); g.translate(0, 7.1, 0); blades.push(paint(g, k % 2 ? '#3fa63f' : '#52b848')); }
  const trunk = paint(new THREE.CylinderGeometry(0.2, 0.36, 7.2, 6).translate(0, 3.6, 0), '#9a7448');
  const nut = paint(new THREE.SphereGeometry(0.35, 6, 4).translate(0.2, 6.9, 0.1), '#5a3a1e');
  const palmGeo = merge([trunk, nut, ...blades]), list = [];
  for (let n = 0; n < 9000 && list.length < 320; n++) { const x = R(-1250, 330), z = R(640, 1060), h = terrainH(x, z);
    if (h < 0.9 || h > 4.8 || !free(x, z, 17) || W.terrainSlope(x, z) > 0.25) continue; if (W.fbm(x / 70, z / 70) < 0.42 && rnd() < 0.7) continue;
    const s = R(0.8, 1.25); list.push({ x, y: h - 0.2, z, ry: R(0, 6.3), rx: R(-0.07, 0.07), rz: R(-0.07, 0.07), sx: s, sy: s * R(0.9, 1.3), sz: s, c: new THREE.Color().setHSL(0.3, 0.1, R(0.85, 1.1)).getHex() }); }
  instances(palmGeo, dsMat, list);
  // umbrellas
  const ug = merge([paint(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5).translate(0, 1.3, 0), '#f4f4f4'), paint(new THREE.ConeGeometry(1.5, 0.7, 8).translate(0, 2.8, 0), '#ffffff')]), ul = [];
  const cols = [0xff4d6d, 0xffd23f, 0x3ec7f5, 0xff8c42, 0x7be05a, 0xf26ad2];
  for (let n = 0; n < 6000 && ul.length < 70; n++) { const x = R(-900, 40), z = R(780, 1010), h = terrainH(x, z); const q = roadQuery(x, z, 90); if (h < 1 || h > 3 || q.d < 28 || q.d > 85) continue;
    ul.push({ x, y: h, z, ry: R(0, 6), rz: R(-0.12, 0.12), c: cols[(rnd() * cols.length) | 0] }); }
  instances(ug, stdV, ul);
  // boardwalk along the sea side of the coast road + lamps
  const bw = [], s0 = ROAD.Y.length; let lamps = [];
  for (let s = 0; s < ROAD.L; s += 6) { const p = roadAt(s, 19.5); if (p.x > -820 && p.x < -40 && p.z > 760 && p.tx > 0.3) { const y = terrainH(p.x, p.z) + 0.3; bw.push({ x: p.x, y, z: p.z, tx: p.tx, tz: p.tz, s: bw.length * 6 }); } }
  if (bw.length > 2) ribbon(bw, 2.4, 3, new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.8 }), 0);
  for (let i = 0; i < bw.length; i += 6) lamps.push({ x: bw[i].x + bw[i].tz * 2.6, y: bw[i].y, z: bw[i].z - bw[i].tx * 2.6, ry: 0 });
  // pier: deck on piles running into the sea at x ~ -350
  let bi = 0, bd = 1e9; for (let s = 0; s < ROAD.L; s += 4) { const p = roadAt(s); if (p.z > 800 && p.tx > 0.5 && Math.abs(p.x + 350) < bd) { bd = Math.abs(p.x + 350); bi = s; } }
  const a = roadAt(bi, 20), dx = a.tz * -1 * 0 + (-a.tz), dz = a.tx; // seaward unit vector = (-tz, tx) (+z side when heading east)
  const yaw = Math.atan2(dx, dz), len = W.coastZ(a.x) + 115 - a.z, deckY = 1.5;
  const pierG = []; const deck = boxFaces(5, 0.3, len, [0, 1, 2, 3, 4, 5], 0.33, '#c8a070'); deck.translate(0, deckY, len / 2); pierG.push(deck);
  const end = boxFaces(14, 0.3, 14, [0, 1, 2, 3, 4, 5], 0.33, '#c8a070'); end.translate(0, deckY, len); pierG.push(end);
  for (let t = 0; t < len; t += 6) for (const sx of [-2.2, 2.2]) pierG.push(paint(new THREE.CylinderGeometry(0.22, 0.22, 10, 6).translate(sx, deckY - 5, t), '#6b4a2b'));
  for (const sx of [-2.4, 2.4]) pierG.push(boxFaces(0.1, 0.9, len, [0, 1, 2, 4, 5], 0.33, '#e8e0d0').translate(sx, deckY + 0.6, len / 2));
  const hut = boxFaces(5, 3, 5, [0, 1, 2, 4, 5], 0.25, '#ff8a65').translate(0, deckY + 1.6, len); pierG.push(hut);
  const pier = new THREE.Mesh(merge(pierG), new THREE.MeshStandardMaterial({ vertexColors: true, map: plankTex, roughness: 0.85 })); pier.position.set(a.x, 0, a.z); pier.rotation.y = yaw; pier.castShadow = true; pier.receiveShadow = true; scene.add(pier);
  window.__lamps = lamps;
}

// ---------------------------------------------------------------- CITY: buildings, lamps, signs
const lampGeo = merge([paint(new THREE.CylinderGeometry(0.1, 0.14, 8.5, 6).translate(0, 4.25, 0), '#59616b'), paint(new THREE.BoxGeometry(2.2, 0.12, 0.12).translate(1, 8.45, 0), '#59616b'), paint(new THREE.BoxGeometry(0.7, 0.18, 0.4).translate(2, 8.35, 0), '#fff3b0')]);
{
  const walls = [], roofs = [], pal = ['#f4c9a8', '#a8d4f4', '#f4a8c4', '#c5f4a8', '#f4ec9c', '#d6c4f4', '#ffffff', '#9fe0d0', '#ffb98a'];
  const lots = [], xs = [CR.x0 + 4, 468, 492, 838, 862, CR.x1 - 4].map(v => v), zs = [CR.z0 + 4, 178, 202, 638, 662, CR.z1 - 4];
  const blocks = [[xs[0], 468, zs[0], 178], [xs[0], 468, 202, 638], [xs[0], 468, 662, zs[5]], [492, 838, zs[0], 178], [492, 838, 202, 638], [492, 838, 662, zs[5]], [862, xs[5], zs[0], 178], [862, xs[5], 202, 638], [862, xs[5], 662, zs[5]]];
  for (const [bx0, bx1, bz0, bz1] of blocks) for (let x = bx0 + 6; x < bx1 - 30; x += R(42, 56)) for (let z = bz0 + 6; z < bz1 - 30; z += R(42, 56)) {
    const w = R(26, 40), d = R(26, 40), cx = x + w / 2, cz = z + d / 2;
    if (cx + w / 2 > bx1 - 5 || cz + d / 2 > bz1 - 5) continue;
    if (Math.hypot(cx - W.PLAZA.x, cz - W.PLAZA.z) < W.PLAZA.r + 40) continue; if (!free(cx, cz, 34 + Math.max(w, d) / 2)) continue;
    const center = 1 - Math.min(1, Math.hypot(cx - 665, cz - 410) / 480), h = 14 + Math.pow(rnd(), 1.6) * 80 * (0.25 + center * 0.9), y0 = terrainH(cx, cz) - 0.4, c = pal[(rnd() * pal.length) | 0], yaw = 0;
    const wg = boxFaces(w, h, d, [0, 1, 4, 5], 0.25, c).translate(cx, y0 + h / 2, cz), rg = boxFaces(w + 0.6, 0.8, d + 0.6, [0, 1, 2, 4, 5], 0.25, '#7a7f87').translate(cx, y0 + h + 0.4, cz);
    walls.push(wg); roofs.push(rg); lots.push({ cx, cz, w, d, h, y0 }); }
  const bm = new THREE.Mesh(merge(walls), new THREE.MeshStandardMaterial({ vertexColors: true, map: windowTex, roughness: 0.55, metalness: 0.05 })); bm.castShadow = bm.receiveShadow = true; scene.add(bm);
  const rm = new THREE.Mesh(merge(roofs), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })); rm.castShadow = true; scene.add(rm);
  // streetlights: loop road inside the city + avenues
  const ll = []; for (let s = 0; s < ROAD.L; s += 38) { const p = roadAt(s, 0); if (W.zoneAt(p.x, p.z) !== 'city') continue; const side = (s / 38 | 0) % 2 ? 1 : -1, q = roadAt(s, side * 8.4); ll.push({ x: q.x, y: q.y - 0.1, z: q.z, ry: Math.atan2(-(side * -p.tz), -(side * p.tx)) }); }
  for (const x of AVX) for (let z = CR.z0 + 30; z < CR.z1 - 20; z += 48) { if (Math.hypot(x - W.PLAZA.x, z - W.PLAZA.z) < W.PLAZA.r + 14) continue; ll.push({ x: x + 13, y: AVY, z, ry: Math.PI }); ll.push({ x: x - 13, y: AVY, z: z + 24, ry: 0 }); }
  for (const l of window.__lamps || []) ll.push({ x: l.x, y: l.y, z: l.z, ry: 0 });
  instances(lampGeo, stdV, ll);
  // road signs along the loop (city: blue/green panels, mountain curves: yellow chevrons on the outside)
  const signG = merge([paint(new THREE.CylinderGeometry(0.06, 0.06, 3, 5).translate(0, 1.5, 0), '#8a9199'), paint(new THREE.BoxGeometry(1.6, 1.1, 0.08).translate(0, 3.2, 0), '#ffffff')]), sl = [];
  for (let i = 0; i < ROAD.N; i += 60) { const p = roadAt(i * ROAD.ds, 0), z = W.zoneAt(p.x, p.z); if (z === 'city' && i % 120 === 0) { const q = roadAt(i * ROAD.ds, 9.5); sl.push({ x: q.x, y: q.y, z: q.z, ry: Math.atan2(p.tx, p.tz) + Math.PI / 2, c: [0x2e86de, 0x2bb673, 0xffffff][(i / 120 | 0) % 3] }); } }
  for (let i = 0; i < ROAD.N; i += 12) { const a = roadAt(i * ROAD.ds), b = roadAt((i + 10) * ROAD.ds), z = W.zoneAt(a.x, a.z); if (z !== 'mountain') continue;
    const turn = a.tx * b.tz - a.tz * b.tx; if (Math.abs(turn) < 0.12) continue; const side = turn > 0 ? 1 : -1, q = roadAt(i * ROAD.ds, -side * 9);   // outer side of the bend
    sl.push({ x: q.x, y: q.y, z: q.z, ry: Math.atan2(-b.tz * side * 0 + a.tz * 0 + (-a.tx) * 0 + a.tx, a.tz) + Math.PI, c: 0xffcc00 }); }
  instances(signG, stdV, sl);
}

// ---------------------------------------------------------------- MOUNTAIN: pines, rocks, posts, guardrails, overlook
{
  const pine = merge([paint(new THREE.CylinderGeometry(0.28, 0.4, 3, 6).translate(0, 1.5, 0), '#6b4a2f'), paint(new THREE.ConeGeometry(2.8, 4.2, 7).translate(0, 4.6, 0), '#2f7d3a'), paint(new THREE.ConeGeometry(2.2, 3.6, 7).translate(0, 7, 0), '#37914a'), paint(new THREE.ConeGeometry(1.4, 3, 7).translate(0, 9, 0), '#44a655')]), pl = [];
  for (let n = 0; n < 60000 && pl.length < 7500; n++) { const x = R(-1650, 1500), z = R(-1400, 650); if (W.zoneAt(x, z) === 'city' && z > -100) continue;
    const h = terrainH(x, z); if (h < 6 || h > 175 || W.terrainSlope(x, z) > 0.7) continue; if (W.fbm(x / 120 + 40, z / 120) < 0.47) continue; if (!free(x, z, 15)) continue;
    const s = R(0.8, 1.7); pl.push({ x, y: h - 0.3, z, ry: R(0, 6), sx: s, sy: s * R(0.9, 1.5), sz: s, c: new THREE.Color().setHSL(0.34 + R(-.03, .03), 0.2, R(0.85, 1.15)).getHex() }); }
  instances(pine, stdVflat, pl);
  // lowland round trees near the city outskirts and meadows
  const tree = merge([paint(new THREE.CylinderGeometry(0.25, 0.35, 2.6, 6).translate(0, 1.3, 0), '#7a5538'), paint(new THREE.IcosahedronGeometry(2.1, 0).translate(0, 4.2, 0), '#6fcf4f')]), tl = [];
  for (let n = 0; n < 20000 && tl.length < 320; n++) { const x = R(-1200, 1450), z = R(-400, 800), h = terrainH(x, z); if (h < 1.5 || h > 40 || !free(x, z, 18) || W.fbm(x / 90, z / 90) < 0.5) continue; if (x > CR.x0 - 30 && x < CR.x1 + 30 && z > CR.z0 - 30 && z < CR.z1 + 30) continue; if (z > 650 && x < 400) continue;
    const s = R(0.9, 1.5); tl.push({ x, y: h - 0.2, z, ry: R(0, 6), sx: s, c: new THREE.Color().setHSL(R(.24, .36), .55, R(.4, .55)).getHex() }); }
  instances(tree, stdVflat, tl);
  // rocks
  const rl = []; for (let n = 0; n < 40000 && rl.length < 1100; n++) { const x = R(-1650, 1500), z = R(-1400, 800), h = terrainH(x, z), sl = W.terrainSlope(x, z); if (h < 10 || !(sl > 0.32 || rnd() < 0.04) || !free(x, z, 11)) continue;
    const s = R(0.8, 3.6); rl.push({ x, y: h + s * 0.15, z, ry: R(0, 6), rx: R(-.3, .3), sx: s * R(0.9, 1.5), sy: s * R(0.6, 1), sz: s * R(0.9, 1.4), c: new THREE.Color().setHSL(0.08, 0.06, R(0.35, 0.6)).getHex() }); }
  instances(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), rl);
  // edge posts + guardrails on steep drops
  const postG = merge([paint(new THREE.BoxGeometry(0.12, 1, 0.12).translate(0, 0.5, 0), '#f2f2f2'), paint(new THREE.BoxGeometry(0.14, 0.2, 0.14).translate(0, 0.75, 0), '#e63946')]), ps = [];
  const drop = (i, sg) => { const q = roadAt(i * ROAD.ds, sg * 17); return ROAD.Y[i] - terrainH(q.x, q.z); };
  const guard = [[], []]; // per side: run flags
  const flag = [new Uint8Array(ROAD.N), new Uint8Array(ROAD.N)];
  for (let i = 0; i < ROAD.N; i++) for (let k = 0; k < 2; k++) { const sg = k ? 1 : -1; if (W.zoneAt(ROAD.X[i], ROAD.Z[i]) === 'mountain' && drop(i, sg) > 2.2) flag[k][i] = 1; }
  for (let i = 0; i < ROAD.N; i += 5) for (let k = 0; k < 2; k++) { const sg = k ? 1 : -1, p = roadAt(i * ROAD.ds, sg * 7.0); if (W.zoneAt(p.x, p.z) === 'mountain' && !flag[k][i] && i % 10 === 0) ps.push({ x: p.x, y: p.y, z: p.z, ry: 0 }); }
  instances(postG, stdV, ps);
  const rail = [], gp = [];
  for (let k = 0; k < 2; k++) { const sg = k ? 1 : -1; let i = 0;
    while (i < ROAD.N) { if (!flag[k][i]) { i++; continue; } let j = i; while (j < ROAD.N && flag[k][j]) j++; if (j - i > 10) { // run i..j
        const pos = [], idx = []; for (let m = i; m < j; m++) { const p = roadAt(m * ROAD.ds, sg * 7.4); pos.push(p.x, p.y + 0.55, p.z, p.x, p.y + 0.95, p.z); if (m % 2 === 0) gp.push({ x: p.x, y: p.y, z: p.z, ry: 0 }); }
        for (let m = 0; m < j - i - 1; m++) idx.push(m * 2, m * 2 + 1, m * 2 + 2, m * 2 + 1, m * 2 + 3, m * 2 + 2);
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); rail.push(paint(g, '#c9ced4')); }
      i = j + 1; } }
  if (rail.length) { const rm = new THREE.Mesh(merge(rail), dsMat); rm.castShadow = true; scene.add(rm); }
  instances(merge([paint(new THREE.BoxGeometry(0.14, 1.1, 0.14).translate(0, 0.55, 0), '#7d858f')]), stdV, gp);
  // overlook at the summit: stone deck, low wall facing away from the road, binoculars, flag
  const pd = W.PADS[0], pr = roadQuery(pd.x, pd.z), toward = Math.atan2(pd.z - roadAt(pr.s).z, pd.x - roadAt(pr.s).x);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(pd.r - 1, pd.r - 1, 0.3, 40), new THREE.MeshStandardMaterial({ color: 0xd9d2c0, roughness: 0.85 })); deck.position.set(pd.x, pd.h + 0.12, pd.z); deck.receiveShadow = true; scene.add(deck);
  const segs = [], posts = []; for (let a = -1.5; a <= 1.5; a += 0.075) { const ang = toward + a, x = pd.x + Math.cos(ang) * (pd.r - 2), z = pd.z + Math.sin(ang) * (pd.r - 2); posts.push({ x, y: pd.h + 0.25, z, ry: 0 });
    segs.push({ x, y: pd.h + 1.15, z, ry: -(ang + Math.PI / 2), sx: 1 }); }
  instances(merge([paint(new THREE.BoxGeometry(0.16, 1.1, 0.16).translate(0, 0.55, 0), '#8c8f94')]), stdV, posts);
  instances(merge([paint(new THREE.BoxGeometry(1.8, 0.12, 0.14), '#b9bec5')]), stdV, segs);
  const bino = merge([paint(new THREE.CylinderGeometry(0.1, 0.12, 1.4, 6).translate(0, 0.7, 0), '#555'), paint(new THREE.BoxGeometry(0.5, 0.35, 0.8).translate(0, 1.5, 0), '#e63946')]);
  instances(bino, stdV, [{ x: pd.x + Math.cos(toward) * (pd.r - 5), y: pd.h + 0.25, z: pd.z + Math.sin(toward) * (pd.r - 5), ry: -toward }]);
  const flagG = merge([paint(new THREE.CylinderGeometry(0.07, 0.07, 9, 6).translate(0, 4.5, 0), '#ddd'), paint(new THREE.BoxGeometry(2.4, 1.3, 0.05).translate(1.3, 8.2, 0), '#ff595e')]);
  instances(flagG, stdV, [{ x: pd.x - Math.cos(toward) * 6, y: pd.h + 0.25, z: pd.z - Math.sin(toward) * 6, ry: 0.5 }]);
}

// clouds
const clouds = new THREE.Group(); { const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 26; i++) { const c = new THREE.Group(); for (let k = 0; k < 6; k++) { const s = R(40, 90), m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), cm); m.scale.set(s * 1.5, s * 0.5, s); m.position.set(k * 55 - 140 + R(-20, 20), R(-10, 12), R(-40, 40)); c.add(m); }
    c.position.set(R(-2800, 2800), R(520, 760), R(-2800, 2800)); clouds.add(c); } scene.add(clouds); }

// ---------------------------------------------------------------- cruise car (placeholder for scale) + camera rig
const car = new THREE.Group(); {
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 4.3), new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.3, metalness: 0.4 })); body.position.y = 0.65;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2), new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.1 })); cab.position.set(0, 1.15, -0.2);
  car.add(body, cab); for (const [x, z] of [[-.95, 1.35], [.95, 1.35], [-.95, -1.35], [.95, -1.35]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x111111 })); w.position.set(x, 0.34, z); car.add(w); }
  car.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(car); }
const view = { mode: 'cruise', s: 0, speed: 30, yaw: 0, pitch: -0.2, keys: {} };
const nearS = (x, z) => roadQuery(x, z, 1e4).s;
const SPOTS = { 1: ['BEACH', -560, 868], 2: ['CITY', 1100, 380], 3: ['MOUNTAIN', 500, -640], 4: ['OVERLOOK', -100, -1070] };
const goto = k => { const [n, x, z] = SPOTS[k]; view.s = nearS(x, z); setText('zone', n); const b = roadAt(view.s - 20); camera.position.set(b.x, b.y + 7, b.z); };
view.s = nearS(-560, 868);
addEventListener('keydown', e => { view.keys[e.code] = true;
  if (SPOTS[e.key]) { view.mode = 'cruise'; goto(e.key); }
  if (e.code === 'KeyF') { view.mode = view.mode === 'fly' ? 'cruise' : 'fly'; if (view.mode === 'fly') { const d = new THREE.Vector3(); camera.getWorldDirection(d); view.yaw = Math.atan2(d.x, d.z); view.pitch = Math.asin(d.y); } }
  if (e.code === 'Equal' || e.code === 'NumpadAdd') view.speed = Math.min(120, view.speed + 10); if (e.code === 'Minus' || e.code === 'NumpadSubtract') view.speed = Math.max(0, view.speed - 10); });
addEventListener('keyup', e => { view.keys[e.code] = false; });
let drag = false; renderer.domElement.addEventListener('mousedown', () => drag = true); addEventListener('mouseup', () => drag = false);
addEventListener('mousemove', e => { if (drag && view.mode === 'fly') { view.yaw -= e.movementX * 0.004; view.pitch = Math.max(-1.5, Math.min(1.5, view.pitch - e.movementY * 0.004)); } });
setText('info', 'Keys: 1 beach · 2 city · 3 mountain · 4 overlook · F fly camera (WASD/QE, drag to look, Shift fast) · +/- cruise speed');

const clock = new THREE.Clock(), v3 = new THREE.Vector3(), look = new THREE.Vector3(); let t = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05); t += dt;
  if (view.mode === 'cruise') {
    view.s += view.speed * dt; const p = roadAt(view.s), ahead = roadAt(view.s + 40), behind = roadAt(view.s - 20);
    car.position.set(p.x, p.y + 0.02, p.z); car.lookAt(ahead.x, ahead.y + 0.02, ahead.z);
    v3.set(behind.x, behind.y + 7, behind.z); camera.position.lerp(v3, 1 - Math.exp(-5 * dt)); look.set(ahead.x, ahead.y + 1.5, ahead.z); camera.lookAt(look);
    const z = W.zoneAt(p.x, p.z); setText('zone', z.toUpperCase());
  } else {
    const k = view.keys, sp = (k.ShiftLeft ? 260 : 70) * dt, f = new THREE.Vector3(Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), Math.cos(view.yaw) * Math.cos(view.pitch)), r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(-1);
    if (k.KeyW) camera.position.addScaledVector(f, sp); if (k.KeyS) camera.position.addScaledVector(f, -sp); if (k.KeyD) camera.position.addScaledVector(r, -sp); if (k.KeyA) camera.position.addScaledVector(r, sp);
    if (k.KeyE) camera.position.y += sp; if (k.KeyQ) camera.position.y -= sp; camera.lookAt(camera.position.clone().add(f));
  }
  sky.position.copy(camera.position);
  sun.position.set(camera.position.x + SUN_DIR.x * 400, camera.position.y + SUN_DIR.y * 400, camera.position.z + SUN_DIR.z * 400); sun.target.position.set(camera.position.x, camera.position.y, camera.position.z);
  if (view.mode === 'cruise') { sun.target.position.copy(car.position); sun.position.copy(car.position).addScaledVector(SUN_DIR, 400); }
  waterNormal.offset.set(t * 0.004, t * 0.002); clouds.position.x = (t * 6) % 600;
  renderer.render(scene, camera); requestAnimationFrame(frame);
}
const ld = $('load'); if (ld) ld.remove();
{ const p = roadAt(view.s - 20); camera.position.set(p.x, p.y + 7, p.z); }
frame();
window.__dbg = { scene, camera, view, W, renderer };
