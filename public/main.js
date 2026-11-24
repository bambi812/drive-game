// main.js - client. Phase 1: the world (terrain, road, scenery) + a cruise / fly camera to inspect it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as W from './world.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { newCar, stepCar, groundAt } from './physics.js';
import { CARS, carSpec, SPEED_TRAPS, DRIFT_ZONES, DEFAULT_COS, RIMS, RACES } from './catalog.js';
import { initMap } from './map.js';
import { buildTown } from './town.js';
import * as UI from './meta.js';

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
const col = { grass: C(0x79c64f), grass2: C(0x5aa944), dark: C(0x3f8a3c), sand: C(0xf2dfa6), wet: C(0xd8c38a), shallow: C(0xe3d6a0), deep: C(0x2b8fa6), rock: C(0x8d867c), alpine: C(0xa8b49a), pale: C(0xd9ddd6), city: C(0xbfc3ca), lawn: C(0x62c24d), gravel: C(0x9c917e), stone: C(0xcfc8b8) };
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
  { const E = W.ESTATE, ew = W.sstep(1 - Math.hypot(Math.max(E.x0 - x, 0, x - E.x1), Math.max(E.z0 - z, 0, z - E.z1)) / 30); if (ew > 0) c.lerp(col.lawn, ew); }
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
const free = (x, z, minD) => { const E = W.ESTATE; if (x > E.x0 - 14 && x < E.x1 + 14 && z > E.z0 - 14 && z < E.z1 + 14) return false; for (const g of W.GARAGES) if (Math.hypot(x - g.cx, z - g.cz) < 30) return false; const q = roadQuery(x, z, minD + 5); return q.d === Infinity || q.d > minD; };
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
  buildTown({ scene, R, rnd, merge, paint, instances, canvasTex, boxFaces, ribbon, roadMat, stdV, lampGeo, free });
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

// ---------------------------------------------------------------- PHASE 2: player car, controls, camera, FX, audio, HUD
const loader = new GLTFLoader();
const envTex = (() => { try { const pm = new THREE.PMREMGenerator(renderer); const t = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); return t; } catch (e) { return null; } })();
const player = { id: 'rookie', cos: { paint: '#e53935', finish: 'gloss', rims: 0, underglow: '', spoiler: 0 }, up: {}, spec: carSpec('rookie'), st: null, root: new THREE.Group(), body: new THREE.Group(), model: null, vis: { pitch: 0, roll: 0 } };
player.root.add(player.body); scene.add(player.root);

function procCar(color = 0xe53935) {            // instant fallback car (never waits on a model)
  const g = new THREE.Group(), paint = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.5, envMap: envTex }); paint.userData = { role: 'paint' };
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.55, 4.2), paint); body.position.y = 0.62;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.2, 1.4), paint); hood.position.set(0, 0.95, 1.2);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.5, 1.9), new THREE.MeshStandardMaterial({ color: 0x1d2b3a, roughness: 0.1, metalness: 0.6, envMap: envTex })); cab.position.set(0, 1.12, -0.3);
  g.add(body, hood, cab);
  for (const [x, z] of [[-.93, 1.35], [.93, 1.35], [-.93, -1.3], [.93, -1.3]]) { const wm = new THREE.MeshStandardMaterial({ color: 0x151515 }); wm.userData = { role: 'rims', base: wm.color.clone() }; const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.26, 14).rotateZ(Math.PI / 2), wm); w.position.set(x, 0.33, z); g.add(w); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g;
}
const flips = JSON.parse(localStorage.getItem('carFlip') || '{}');   // per-car 180-degree flip (key V)
// normalise a loaded glTF: longest horizontal axis -> +z, scale to real length, wheels on the ground
function normalizeModel(scene3, def, flip) {
  const inner = new THREE.Group(), outer = new THREE.Group(); inner.add(scene3); outer.add(inner);
  const box = () => { outer.updateMatrixWorld(true); return new THREE.Box3().setFromObject(outer); };
  let b = box(), s = b.getSize(new THREE.Vector3());
  if (s.x > s.z) { inner.rotation.y = Math.PI / 2; b = box(); s = b.getSize(new THREE.Vector3()); }
  inner.scale.setScalar(def.length / s.z); b = box(); const c = b.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -b.min.y + (def.lift || 0), -c.z);
  outer.rotation.y = (def.yaw || 0) + (flip ? Math.PI : 0);
  outer.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = true; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m && envTex && m.isMeshStandardMaterial) { m.envMap = envTex; m.envMapIntensity = 0.9; } }); } });
  return outer;
}
// ---- cosmetics engine: per-instance cloned materials, finish, rims, underglow, spoiler. Works for GLB cars and the fallback car.
const FINISH = { gloss: { r: 0.12, m: 0.35 }, matte: { r: 0.9, m: 0.04 }, metallic: { r: 0.3, m: 0.95 } };
const glowTex = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.55, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
// clone every material (cars must not share materials) and tag paint / rim materials using the per-car regexes in catalog.js
function prepareModel(root, id) {
  const pc = CARS[id].paint;
  root.traverse(o => { if (!o.isMesh) return; const arr = Array.isArray(o.material) ? o.material : [o.material];
    const out = arr.map(m => { const c = m.clone(), n = m.name || ''; c.userData = { role: pc.body.test(n) ? 'paint' : pc.rims.test(n) ? 'rims' : '', base: c.color ? c.color.clone() : null }; return c; }); o.material = Array.isArray(o.material) ? out : out[0]; });
}
function buildSpoiler(level, mat, pos) {
  const g = new THREE.Group(), box = (w, h, d, x, y, z, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; g.add(m); };
  if (level === 1) box(1.5, 0.07, 0.28, 0, 0, 0, -0.15);
  if (level === 2) { box(1.55, 0.09, 0.42, 0, 0.04, -0.05, -0.28); box(0.06, 0.18, 0.4, -0.78, 0.1, -0.05); box(0.06, 0.18, 0.4, 0.78, 0.1, -0.05); }
  if (level === 3) { box(1.8, 0.06, 0.5, 0, 0.42, -0.1, -0.12); for (const sx of [-0.55, 0.55]) box(0.07, 0.5, 0.35, sx, 0.18, 0); for (const sx of [-0.9, 0.9]) box(0.08, 0.22, 0.55, sx, 0.42, -0.1); }
  g.position.set(0, pos.y, pos.z); return g;
}
function styleHolder(holder, id, cos) {
  const def = CARS[id] || CARS.rookie, ud = holder.userData; cos = cos || DEFAULT_COS; ud.cos = cos; const f = FINISH[cos.finish] || FINISH.gloss;
  holder.traverse(o => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { const r = m.userData && m.userData.role;
    if (r === 'paint') { m.color.set(cos.paint); m.roughness = f.r; m.metalness = f.m; if (m.clearcoat !== undefined) m.clearcoat = cos.finish === 'matte' ? 0 : 1; }
    else if (r === 'rims' && m.userData.base) { if (cos.rims > 0) m.color.set(RIMS[cos.rims].color); else m.color.copy(m.userData.base); } }); });
  if (cos.underglow) {                                                                         // underglow: additive glow plane under the car
    if (!ud.glow) { ud.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 })); ud.glow.renderOrder = 3; }
    ud.glow.scale.set(2.9, 1, (def.length || 4.3) + 1.4); ud.glow.position.y = 0.07; ud.glow.material.color.set(cos.underglow); if (!ud.glow.parent) holder.add(ud.glow);
  } else if (ud.glow && ud.glow.parent) ud.glow.parent.remove(ud.glow);
  if (!ud.spoilerMat) ud.spoilerMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 });
  ud.spoilerMat.color.set(cos.paint); ud.spoilerMat.roughness = f.r + 0.15; ud.spoilerMat.metalness = f.m;
  if (ud.spoilerLevel !== cos.spoiler || (ud.spoiler && !ud.spoiler.parent && cos.spoiler)) { if (ud.spoiler && ud.spoiler.parent) ud.spoiler.parent.remove(ud.spoiler); ud.spoiler = cos.spoiler ? buildSpoiler(cos.spoiler, ud.spoilerMat, def.paint.spoiler) : null; ud.spoilerLevel = cos.spoiler; }
  if (ud.spoiler && !ud.spoiler.parent) holder.add(ud.spoiler);
}const rawModels = {}, loading = {};
// shows the procedural fallback instantly, swaps in the real glTF when it arrives; never blocks, safe for any holder (player or remote)
function fillCar(holder, id, cos) {
  const def = CARS[id] || CARS.rookie, token = {}; holder.userData.token = token; holder.clear();
  holder.add(procCar()); styleHolder(holder, id, cos);
  if (!def.model) return;
  const apply = raw => { if (holder.userData.token !== token || !raw) return; const mdl = raw.clone(true); prepareModel(mdl, id); holder.clear(); holder.add(normalizeModel(mdl, def, flips[id])); styleHolder(holder, id, holder.userData.cos); };
  if (rawModels[id]) apply(rawModels[id]); else loadRaw(id).then(apply);
}
function loadRaw(id) {                                   // cached promise of the raw glTF scene
  const def = CARS[id]; if (!def || !def.model) return Promise.resolve(null); if (rawModels[id]) return Promise.resolve(rawModels[id]);
  return loading[id] || (loading[id] = new Promise(res => loader.load(def.model, g => { rawModels[id] = g.scene; delete loading[id]; res(g.scene); }, undefined, e => { delete loading[id]; console.warn('model load failed (fallback kept):', id, e); res(null); })));
}
// background preload: download every car once, then compile its shaders and upload its textures to the GPU (hidden, one car per tick),
// so switching cars later is instant instead of freezing for the load + compile + upload.
async function preloadCars() {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (const id of Object.keys(CARS)) { if (!CARS[id].model) continue; const raw = await loadRaw(id); if (!raw) continue; await wait(300);
    try { const mdl = raw.clone(true); prepareModel(mdl, id); const n = normalizeModel(mdl, CARS[id], flips[id]); n.position.set(0, -3000, 0); n.traverse(o => { o.frustumCulled = false; });
      scene.add(n); renderer.compile(scene, camera);
      n.traverse(o => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { for (const k in m) { const t = m[k]; if (t && t.isTexture) renderer.initTexture(t); } }); });
      scene.remove(n); } catch (e) { console.warn('preload warm-up skipped', id, e); }
    await wait(300); }
}
setTimeout(preloadCars, 1500);
function setCarModel(id) { fillCar(player.body, id, player.cos); player.model = player.body; }
function chooseCar(id, up) { player.id = id; player.up = up || {}; player.spec = carSpec(id, player.up); setCarModel(id); setText('carname', CARS[id].name); if (window.__netReady) sendCar(); }
window.__chooseCar = chooseCar;
function respawn(s, keepSpeed) {
  const p = roadAt(s), c = newCar(p.x, p.z, Math.atan2(p.tx, p.tz)); if (keepSpeed && player.st) { c.u = player.st.u; } player.st = c; camS.yaw = c.yaw;
}
const camS = { mode: 0, yaw: 0, orbitYaw: 0, orbitPitch: 0, drag: false, fov: 62 };
chooseCar('rookie'); respawn(nearS0(-560, 868));
function nearS0(x, z) { return roadQuery(x, z, 1e4).s; }

// ---- input
const keys = {}, inp = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false }; let steerRaw = 0;
const SPOTS = { 1: ['BEACH', -560, 868], 2: ['CITY', 1100, 380], 3: ['MOUNTAIN', 500, -640], 4: ['OVERLOOK', -100, -1070] };
const CAR_ORDER = ['rookie', 'brz', 'mustang'];
let mode = 'drive', fly = { yaw: 0, pitch: -0.2 };
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return; if (e.repeat) return; keys[e.code] = true; initAudio();
  if (garage.open) { if (e.code === 'KeyE' || e.code === 'Escape') closeGarage(); return; }
  if (e.code === 'Escape' && mapUI.isOpen()) { mapUI.toggle(); return; }
  if (e.code === 'KeyM') { mapUI.toggle(); return; }
  if (e.code === 'Enter' && mode === 'drive') joinNearbyRace();
  if (e.code === 'KeyX') leaveRace();
  if (e.code === 'KeyT') teleportGarage();
  if (e.code === 'KeyE' && mode === 'drive') { const g = nearGarage(player.st); if (g) openGarage(g); }
  if (e.code === 'KeyL') UI.toggleLeaderboard();
  if (SPOTS[e.key] && !race.id) { respawn(nearS0(SPOTS[e.key][1], SPOTS[e.key][2]) ); setText('zone', SPOTS[e.key][0]); }
  if (e.code === 'KeyR' && !race.id) respawn(roadQuery(player.st.x, player.st.z, 1e4).s);
  if (e.code === 'KeyC') camS.mode = (camS.mode + 1) % 3;
  if (e.code === 'KeyZ') { if (net.sock && profile) { const own = profile.cars, id = own[(own.indexOf(player.id) + 1) % own.length]; net.sock.emit('buy', { kind: 'select', car: id }); } }   // temporary car switch (garage comes in Phase 5)
  if (e.code === 'KeyV') { flips[player.id] = !flips[player.id]; localStorage.setItem('carFlip', JSON.stringify(flips)); setCarModel(player.id); }
  if (e.code === 'KeyF') { mode = mode === 'fly' ? 'drive' : 'fly'; if (mode === 'fly') { const d = new THREE.Vector3(); camera.getWorldDirection(d); fly.yaw = Math.atan2(d.x, d.z); fly.pitch = Math.asin(d.y); } }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('pointerdown', initAudio);
renderer.domElement.addEventListener('mousedown', () => { camS.drag = true; }); addEventListener('mouseup', () => { camS.drag = false; });
addEventListener('mousemove', e => {
  if (!camS.drag) return;
  if (garage.open) { garage.az -= e.movementX * 0.006; garage.el = Math.max(0.03, Math.min(1.2, garage.el + e.movementY * 0.004)); return; }
  if (mode === 'fly') { fly.yaw -= e.movementX * 0.004; fly.pitch = Math.max(-1.5, Math.min(1.5, fly.pitch - e.movementY * 0.004)); }
  else { camS.orbitYaw -= e.movementX * 0.006; camS.orbitPitch = Math.max(-0.3, Math.min(0.9, camS.orbitPitch + e.movementY * 0.005)); }
});
function readInput(dt) {
  inp.throttle = (keys.KeyW || keys.ArrowUp) ? 1 : 0; inp.brake = (keys.KeyS || keys.ArrowDown) ? 1 : 0;
  const want = ((keys.KeyA || keys.ArrowLeft) ? 1 : 0) - ((keys.KeyD || keys.ArrowRight) ? 1 : 0);     // + = left
  const rate = want === 0 ? 7 : (Math.sign(want) === Math.sign(steerRaw) || steerRaw === 0 ? 4.5 : 9);
  steerRaw += Math.max(-rate * dt, Math.min(rate * dt, want - steerRaw)); inp.steer = steerRaw;
  inp.handbrake = !!keys.Space; inp.nitro = !!(keys.ShiftLeft || keys.ShiftRight);
  if (race.id && race.state === 'countdown') { inp.throttle = 0; inp.brake = 0; inp.handbrake = true; }               // hold the car on the grid
}

// ---- skid marks (ring buffer of quads) + tyre smoke (point sprites)
const SK = 3500, skPos = new Float32Array(SK * 4 * 3).fill(-1e5), skIdx = new Uint32Array(SK * 6); for (let i = 0; i < SK; i++) skIdx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
const skGeo = new THREE.BufferGeometry(); skGeo.setAttribute('position', new THREE.BufferAttribute(skPos, 3)); skGeo.setIndex(new THREE.BufferAttribute(skIdx, 1));
const skMesh = new THREE.Mesh(skGeo, new THREE.MeshBasicMaterial({ color: 0x0b0b0c, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
skMesh.frustumCulled = false; skMesh.renderOrder = 2; scene.add(skMesh);
let skN = 0; const skLast = [null, null, null, null];
function skidTo(k, x, z, y, on) {
  if (!on) { skLast[k] = null; return; }
  const l = skLast[k]; if (!l) { skLast[k] = { x, z, y }; return; }
  const dx = x - l.x, dz = z - l.z, d = Math.hypot(dx, dz); if (d < 0.4) return; if (d > 6) { skLast[k] = { x, z, y }; return; }
  const nx = -dz / d * 0.16, nz = dx / d * 0.16, o = (skN % SK) * 12; skN++;
  skPos.set([l.x - nx, l.y + 0.04, l.z - nz, l.x + nx, l.y + 0.04, l.z + nz, x - nx, y + 0.04, z - nz, x + nx, y + 0.04, z + nz], o);
  skGeo.attributes.position.needsUpdate = true; skLast[k] = { x, z, y };
}
const SM = 220, smPos = new Float32Array(SM * 3), smAge = new Float32Array(SM).fill(1), smSize = new Float32Array(SM), smVel = new Float32Array(SM * 3); let smN = 0;
const smGeo = new THREE.BufferGeometry(); smGeo.setAttribute('position', new THREE.BufferAttribute(smPos, 3)); smGeo.setAttribute('age', new THREE.BufferAttribute(smAge, 1)); smGeo.setAttribute('size', new THREE.BufferAttribute(smSize, 1));
const smokeTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
const smMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { map: { value: smokeTex }, scale: { value: innerHeight } },
  vertexShader: 'attribute float age; attribute float size; uniform float scale; varying float vA; void main(){ vA=age; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*(1.+age*2.5)*scale*0.6/-mv.z; gl_Position=projectionMatrix*mv; }',
  fragmentShader: 'uniform sampler2D map; varying float vA; void main(){ vec4 t=texture2D(map,gl_PointCoord); float a=t.a*(1.-vA)*.5; if(a<.01) discard; gl_FragColor=vec4(vec3(.93),a); }' });
const smoke = new THREE.Points(smGeo, smMat); smoke.frustumCulled = false; scene.add(smoke);
addEventListener('resize', () => { smMat.uniforms.scale.value = innerHeight; });
function puff(x, y, z, vx, vz, size) { const i = smN++ % SM; smPos.set([x, y, z], i * 3); smVel.set([vx, 0.8 + Math.random() * 0.6, vz], i * 3); smAge[i] = 0; smSize[i] = size; }
function updateSmoke(dt) { for (let i = 0; i < SM; i++) { if (smAge[i] >= 1) continue; smAge[i] += dt / 1.4; smPos[i * 3] += smVel[i * 3] * dt; smPos[i * 3 + 1] += smVel[i * 3 + 1] * dt; smPos[i * 3 + 2] += smVel[i * 3 + 2] * dt; smVel[i * 3 + 1] *= 0.98; }
  smGeo.attributes.position.needsUpdate = smGeo.attributes.age.needsUpdate = smGeo.attributes.size.needsUpdate = true; }

// ---- audio (WebAudio, created on first user gesture)
let AC = null, au = null;
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)(); const master = AC.createGain(); master.gain.value = 0.32; master.connect(AC.destination);
    const o1 = AC.createOscillator(), o2 = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain(); o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.Q.value = 3; g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(master); o1.start(); o2.start();
    const buf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = AC.createBufferSource(); n.buffer = buf; n.loop = true; const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5; bp.frequency.value = 1800; const sg = AC.createGain(); sg.gain.value = 0; n.connect(bp); bp.connect(sg); sg.connect(master); n.start();
    au = { o1, o2, f, g, bp, sg };
  } catch (e) { console.warn('audio unavailable', e); AC = null; }
}
function updateAudio(c, S, t) {
  if (!au || !AC) return; const now = AC.currentTime, thr = inp.throttle || (c.gear < 0 ? inp.brake : 0);
  let gain = 0.10 + 0.22 * thr + 0.08 * c.rpm / S.redline; if (c.rpm >= S.redline * 0.985 && thr > 0) gain *= (Math.sin(t * 90) > 0 ? 1 : 0.25);
  au.o1.frequency.setTargetAtTime(Math.max(25, c.rpm / 30), now, 0.03); au.o2.frequency.setTargetAtTime(Math.max(12, c.rpm / 60), now, 0.03);
  au.f.frequency.setTargetAtTime(350 + c.rpm * 0.28 + thr * 700, now, 0.05); au.g.gain.setTargetAtTime(gain, now, 0.04);
  const sq = (c.air || c.kind === 'water') ? 0 : Math.min(0.5, Math.max(0, (c.rearSlip - 0.16) * 1.3) * Math.min(1, c.kmh / 30));
  au.sg.gain.setTargetAtTime(sq, now, 0.05); au.bp.frequency.setTargetAtTime(1400 + c.kmh * 6, now, 0.1);
}

// ---- HUD + drift tracker
const drift = { score: 0, combo: 1, t: 0, idle: 0, best: 0 };
function updateDrift(c, dt) {
  const drifting = !c.air && c.kmh > 35 && Math.abs(c.slip) > 12;
  if (drifting) { drift.t += dt; drift.idle = 0; drift.combo = 1 + Math.floor(drift.t / 2); drift.score += dt * c.kmh * 0.2 * Math.min(Math.abs(c.slip), 60) / 30 * drift.combo; }
  else if (drift.score > 0) { drift.idle += dt; if (drift.idle > 1.2) { drift.best = Math.max(drift.best, Math.round(drift.score)); drift.score = 0; drift.t = 0; drift.combo = 1; } }
  setText('drift', drift.score > 1 ? `DRIFT  ${Math.abs(c.slip).toFixed(0)}°   x${drift.combo}   ${Math.round(drift.score)}` : '');
}
function updateHud(c, S) {
  setText('spd', Math.round(c.kmh)); setText('gear', c.gear < 0 ? 'R' : c.gear);
  const r = $('rpmfill'); if (r) { r.style.width = Math.min(100, c.rpm / S.redline * 100) + '%'; r.style.background = c.rpm > S.redline * 0.92 ? '#ff4040' : '#ffd23f'; }
  const n = $('nitfill'); if (n) { n.style.width = c.nitro + '%'; n.style.background = c.nitroOn ? '#5ee1ff' : '#2d8fb0'; }
}

// ---- camera
function chaseCamera(c, dt) {
  const sp = Math.abs(c.u), want = c.yaw, d = Math.atan2(Math.sin(want - camS.yaw), Math.cos(want - camS.yaw)); camS.yaw += d * (1 - Math.exp(-(camS.drag ? 0 : 5) * dt)) + (camS.drag ? d : 0) * 0;
  if (!camS.drag) { camS.orbitYaw *= Math.exp(-1.6 * dt); camS.orbitPitch *= Math.exp(-1.6 * dt); }
  const ang = camS.yaw + camS.orbitYaw, m = camS.mode, dist = [6.8, 11, 0][m], h = [2.3, 4.2, 0][m] + camS.orbitPitch * 6;
  const fx = Math.sin(ang), fz = Math.cos(ang);
  if (m === 2) { const s0 = Math.sin(c.yaw), c0 = Math.cos(c.yaw); camera.position.set(c.x + s0 * 0.5, c.y + 1.2, c.z + c0 * 0.5); camera.lookAt(c.x + s0 * 30, c.y + 1.1, c.z + c0 * 30); }
  else { const px = c.x - fx * dist, pz = c.z - fz * dist, gy = groundAt(px, pz) + 0.9; const py = Math.max(c.y + h, gy); camera.position.set(px, py, pz); camera.lookAt(c.x + fx * 3, c.y + 1.1, c.z + fz * 3); }
  const tf = 62 + Math.min(22, c.kmh * 0.09) + (c.nitroOn ? 8 : 0); camS.fov += (tf - camS.fov) * (1 - Math.exp(-4 * dt)); if (Math.abs(camera.fov - camS.fov) > 0.05) { camera.fov = camS.fov; camera.updateProjectionMatrix(); }
}

// ---- PHASE 3: networking, remote players, AI traffic, speed traps / drift zones
const net = { sock: null, id: null, joined: false, remotes: new Map(), sendT: 0, traf: [], trafOn: true, trafMax: 30, rxT: 0 };
const wrapS = d => { d = ((d % W.ROAD_LEN) + W.ROAD_LEN) % W.ROAD_LEN; return d > W.ROAD_LEN / 2 ? d - W.ROAD_LEN : d; };
const shortAng = d => Math.atan2(Math.sin(d), Math.cos(d));
const labelTex = (text, color) => canvasTex(512, 128, (g, w, h) => { g.fillStyle = color; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, h - 14, w, 14); g.fillStyle = '#fff'; g.font = 'bold 64px system-ui,Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 - 4); }, false);
function nameTag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.font = 'bold 30px system-ui,Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(text, 128, 32); g.fillStyle = '#fff'; g.fillText(text, 128, 32);   // canvas text: no HTML, safe for any name
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(4.4, 1.1, 1); s.renderOrder = 10; return s;
}
function addRemote(p) {
  if (net.remotes.has(p.id) || p.id === net.id) return;
  const holder = new THREE.Group(), body = new THREE.Group(), root = new THREE.Group(); root.add(body); scene.add(root);
  const tag = nameTag(p.name); tag.position.y = 2.7; root.add(tag);
  fillCar(body, p.car, p.cos);
  net.remotes.set(p.id, { id: p.id, name: p.name, car: p.car, cos: p.cos, root, body, tag, tgt: null, pos: null, pitch: 0, roll: 0 }); refreshPlayers();
}
function removeRemote(id) { const r = net.remotes.get(id); if (!r) return; scene.remove(r.root); net.remotes.delete(id); refreshPlayers(); }
function refreshPlayers() { UI.setPlayers([{ name: net.name || 'You', car: CARS[player.id].name, self: true }, ...[...net.remotes.values()].map(r => ({ name: r.name, car: CARS[r.car]?.name || r.car }))]); }
function sendCar() { refreshPlayers(); }

// traffic cars: one InstancedMesh (body tinted by instance colour)
const TCOL = [0xf44336, 0x2196f3, 0xffeb3b, 0xffffff, 0x4caf50, 0xff9800, 0x9c27b0, 0x607d8b];
const trafGeo = merge([paint(new THREE.BoxGeometry(1.8, 0.55, 4.4).translate(0, 0.65, 0), '#ffffff'), paint(new THREE.BoxGeometry(1.55, 0.5, 2.0).translate(0, 1.15, -0.2), '#2b3440'),
  ...[[-.9, 1.3], [.9, 1.3], [-.9, -1.3], [.9, -1.3]].map(([x, z]) => paint(new THREE.CylinderGeometry(0.32, 0.32, 0.25, 10).rotateZ(Math.PI / 2).translate(x, 0.32, z), '#1a1a1a'))]);
const trafMesh = new THREE.InstancedMesh(trafGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }), 30); trafMesh.castShadow = true; trafMesh.frustumCulled = false; trafMesh.count = 0; scene.add(trafMesh);
const trafCol = new THREE.Color();
UI.trafficControls((on, n) => { net.trafOn = on; net.trafMax = n; });

// gates for speed traps and drift zones (posts + beam + banner across the road)
function gate(s, text, color, tall = 6.2) {
  const p = W.roadAt(s), yaw = Math.atan2(p.tx, p.tz), g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.y = yaw;
  const mat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6 });
  for (const sx of [-8.2, 8.2]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, tall, 0.5), mat); post.position.set(sx, tall / 2, 0); post.castShadow = true; g.add(post); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(17.4, 0.4, 0.5), mat); beam.position.y = tall; g.add(beam);
  const bt = labelTex(text, color); for (const ry of [Math.PI, 0]) { const ban = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.4), new THREE.MeshBasicMaterial({ map: bt })); ban.position.set(0, tall - 1.4, ry ? 0.02 : -0.02); ban.rotation.y = ry; g.add(ban); }
  const line = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, transparent: true, opacity: 0.85 })); line.position.y = 0.06; g.add(line);
  scene.add(g);
}
for (const t of SPEED_TRAPS) gate(t.s, 'SPEED TRAP', '#0f9bd7');
for (const z of DRIFT_ZONES) { gate(z.s0, 'DRIFT START', '#e8590c'); gate(z.s1, 'DRIFT END', '#2f9e44', 5.4); }
const zoneName = id => (DRIFT_ZONES.find(z => z.id === id) || {}).name || id;

let profile = null;
function applyProfile(p) {                                   // server is the source of truth for money, cars, upgrades, cosmetics
  const first = !profile, selChanged = first || profile.sel !== p.sel || player.id !== p.sel; profile = p; UI.setMoney(p.money); player.cos = p.cos[p.sel];
  if (selChanged) chooseCar(p.sel, p.up[p.sel]); else { player.up = p.up[p.sel]; player.spec = carSpec(p.sel, player.up); if (!garage.open && JSON.stringify(player.cos) !== JSON.stringify(net.lastCos)) styleHolder(player.body, player.id, player.cos); }
  net.lastCos = player.cos; refreshPlayers(); if (garage.ui) garage.ui.refresh();
}function connect(token) {
  if (typeof io === 'undefined') { setText('net', 'offline (no server)'); refreshPlayers(); return; }
  const sock = net.sock = io({ auth: { token } });
  sock.on('connect', () => setText('net', 'online'));
  sock.on('connect_error', e => { if (e.message === 'auth') { UI.logoutLocal(); UI.showLogin(startLogin, 'Session expired - please sign in again'); } });
  sock.on('disconnect', () => { net.joined = false; setText('net', 'reconnecting...'); });
  sock.on('kicked', () => { net.joined = false; sock.close(); UI.showKicked(); });
  sock.on('welcome', d => { net.id = d.id; net.joined = true; net.remotes.forEach((_, id) => removeRemote(id)); d.players.forEach(addRemote); UI.setLeaderboard(d.lb); net.name = d.profile.name; applyProfile(d.profile); });
  sock.on('profile', applyProfile); sock.on('earn', d => UI.toast('+$' + d.amount.toLocaleString(), 'green'));
  sock.on('pjoin', addRemote); sock.on('pleave', removeRemote);
  sock.on('pcar', d => { const r = net.remotes.get(d.id); if (r) { r.car = d.car; r.cos = d.cos; fillCar(r.body, d.car, d.cos); refreshPlayers(); } });
  sock.on('lb', UI.setLeaderboard); raceEvents(sock);
  sock.on('snap', d => {
    const now = performance.now();
    for (const a of d.p) { const r = net.remotes.get(a[0]); if (!r) continue; r.tgt = { x: a[1], y: a[2], z: a[3], yaw: a[4], u: a[5], v: a[6], r: a[7], p: a[8], rl: a[9], t: now }; if (!r.pos) r.pos = { x: a[1], y: a[2], z: a[3], yaw: a[4] }; }
    net.traf = d.tr.map(a => { const o = net.traf.find(t => t.i === a[0]); return { i: a[0], s: a[1], dir: a[2], v: a[3], color: a[4], t: now, ds: o ? o.ds : a[1] }; });
  });
  sock.on('trap', d => { UI.toast(`SPEED TRAP  ${d.kmh} km/h` + (d.best ? '  -  NEW RECORD' : ''), d.best ? 'gold' : 'blue'); });
  sock.on('driftlive', d => UI.setZoneHud(`${zoneName(d.id)}: ${d.score} pts`));
  sock.on('driftdone', d => { UI.setZoneHud(''); UI.toast(`${zoneName(d.id)}  drift score ${d.score}` + (d.best ? '  -  NEW RECORD' : ''), d.best ? 'gold' : 'orange'); });
}
const startLogin = token => connect(token);
const _v = new THREE.Vector3();
function netFrame(dt, c) {
  const now = performance.now();
  // send my state at 20 Hz
  net.sendT += dt;
  if (net.sendT >= 0.05 && net.sock && net.joined && mode === 'drive') { net.sendT = 0; const f = n => Math.round(n * 1000) / 1000; net.sock.volatile.emit('state', { x: f(c.x), y: f(c.y), z: f(c.z), yaw: f(c.yaw), u: f(c.u), v: f(c.v), r: f(c.r), p: f(c.pitch), rl: f(c.roll) }); }
  // remote players: velocity prediction from the last snapshot + smoothed follow
  net.remotes.forEach(r => {
    if (!r.tgt || !r.pos) { r.root.visible = false; return; } r.root.visible = true;
    const t = r.tgt, age = Math.min(0.25, (now - t.t) / 1000), sy = Math.sin(t.yaw), cy = Math.cos(t.yaw);
    const px = t.x + (t.u * sy + t.v * cy) * age, pz = t.z + (t.u * cy - t.v * sy) * age, pyaw = t.yaw + t.r * age, k = 1 - Math.exp(-12 * dt), P = r.pos;
    if (Math.hypot(px - P.x, pz - P.z) > 40) { P.x = px; P.z = pz; P.y = t.y; P.yaw = pyaw; }
    P.x += (px - P.x) * k; P.z += (pz - P.z) * k; P.y += (t.y - P.y) * k; P.yaw += shortAng(pyaw - P.yaw) * k;
    r.pitch += (-t.p - r.pitch) * k; r.roll += (t.rl - r.roll) * k;
    r.root.position.set(P.x, P.y, P.z); r.root.rotation.y = P.yaw; r.body.rotation.set(r.pitch, 0, r.roll);
    const d = Math.hypot(P.x - c.x, P.z - c.z); r.tag.visible = d < 350; { const f = Math.max(1, d / 40); r.tag.scale.set(4.4 * f, 1.1 * f, 1); }
    if (mode === 'drive' && d < 3.2 && Math.abs(P.y - c.y) < 2) bump(c, P.x, P.z, t.u * sy + t.v * cy, t.u * cy - t.v * sy);
  });
  // traffic: advance server positions by their speed, ease the shown value toward it
  let n = 0;
  for (const T of net.traf) {
    if (!net.trafOn || T.i >= net.trafMax) continue;
    const age = Math.min(0.3, (now - T.t) / 1000), tgt = T.s + T.dir * T.v * age; T.ds += wrapS(tgt - T.ds) * (1 - Math.exp(-14 * dt)); T.ds = (T.ds + W.ROAD_LEN) % W.ROAD_LEN;
    const p = W.roadAt(T.ds, T.dir * 3.1); dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, Math.atan2(p.tx, p.tz) + (T.dir < 0 ? Math.PI : 0), 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    trafMesh.setMatrixAt(n, dummy.matrix); trafMesh.setColorAt(n, trafCol.setHex(TCOL[T.color % 8])); n++;
    if (mode === 'drive' && Math.abs(p.x - c.x) < 4 && Math.abs(p.z - c.z) < 4 && Math.hypot(p.x - c.x, p.z - c.z) < 3.4 && Math.abs(p.y - c.y) < 2) { const sg = T.dir; bump(c, p.x, p.z, p.tx * T.v * sg, p.tz * T.v * sg); }
  }
  trafMesh.count = n; trafMesh.instanceMatrix.needsUpdate = true; if (trafMesh.instanceColor) trafMesh.instanceColor.needsUpdate = true;
}
// simple circle collision: remove the closing velocity component and separate (other body treated as heavy)
function bump(c, ox, oz, ovx, ovz) {
  const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw); let nx = c.x - ox, nz = c.z - oz; const d = Math.hypot(nx, nz) || 1; nx /= d; nz /= d;
  const vx = c.u * sy + c.v * cy - ovx, vz = c.u * cy - c.v * sy - ovz, vn = vx * nx + vz * nz;
  if (vn < 0) { const nvx = vx - 1.35 * vn * nx + ovx, nvz = vz - 1.35 * vn * nz + ovz; c.u = (nvx * sy + nvz * cy) * 0.92; c.v = (nvx * cy - nvz * sy) * 0.92; }
  const pen = 3.2 - d; if (pen > 0) { c.x += nx * pen * 0.6; c.z += nz * pen * 0.6; }
}
UI.login(startLogin);

window.__netReady = true;

// ---- PHASE 5: garages (3 buildings beside the road, glowing drive-in zones) + garage mode (E to enter; car stays visible, camera orbits)
const garageFx = [];
{
  const doorTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#d7dde4'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { g.fillStyle = y % 32 ? '#c3cad3' : '#b4bcc7'; g.fillRect(0, y, w, 14); } }, false);
  const beamTex = canvasTex(8, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.9)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
  const signTex = (txt, col) => canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#10151f'; g.fillRect(0, 0, w, h); g.fillStyle = col; g.fillRect(0, h - 18, w, 18); g.fillStyle = '#fff'; g.font = 'bold 66px system-ui,Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2 - 8); }, false);
  const accent = { beach: '#19c6d8', city: '#ff9f1c', mountain: '#7bd34a' };
  for (const g of W.GARAGES) {
    const grp = new THREE.Group(), a = accent[g.id] || '#19c6d8'; grp.position.set(g.bx, g.y - 0.15, g.bz); grp.rotation.y = g.yaw;
    const wall = new THREE.MeshStandardMaterial({ color: 0xe8ebef, roughness: 0.8 }), dark = new THREE.MeshStandardMaterial({ color: 0x2b303a, roughness: 0.7 }), acc = new THREE.MeshStandardMaterial({ color: a, roughness: 0.5, emissive: a, emissiveIntensity: 0.25 });
    const add = (geo, mat, x, y, z, cast = true) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; grp.add(o); return o; };
    add(new THREE.BoxGeometry(18, 6.4, 13), wall, 0, 3.2, 0);                                   // main block (front face = +z, faces the road)
    add(new THREE.BoxGeometry(19.2, 0.5, 14.2), dark, 0, 6.6, 0);                                // roof slab
    add(new THREE.BoxGeometry(19.2, 0.9, 0.3), acc, 0, 5.9, 6.65);                               // accent stripe
    const door = add(new THREE.PlaneGeometry(9, 4.6), new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.6 }), 0, 2.4, 6.52, false);
    add(new THREE.BoxGeometry(9.8, 0.4, 0.4), dark, 0, 4.85, 6.6); for (const sx of [-4.9, 4.9]) add(new THREE.BoxGeometry(0.4, 4.9, 0.4), dark, sx, 2.45, 6.6);
    const sign = add(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: signTex(g.name.toUpperCase(), a) }), 0, 7.9, 6.6, false); sign.rotation.y = 0;
    add(new THREE.BoxGeometry(8.4, 2.4, 0.3), dark, 0, 7.9, 6.45); for (const sx of [-3.2, 3.2]) add(new THREE.BoxGeometry(0.3, 1.4, 0.3), dark, sx, 7.0, 6.45);
    for (const sx of [-7, 7]) add(new THREE.BoxGeometry(2.6, 1.6, 0.1), new THREE.MeshStandardMaterial({ color: 0x7fb5d8, roughness: 0.1, metalness: 0.5 }), sx, 3.4, 6.52, false);
    scene.add(grp);
    // glowing drive-in zone: pulsing disc + ring + light beam
    const z = new THREE.Group(); z.position.set(g.zx, g.y - 0.05, g.zz); const gm = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(g.r, 48).rotateX(-Math.PI / 2), gm(a)), ring = new THREE.Mesh(new THREE.RingGeometry(g.r - 0.5, g.r, 48).rotateX(-Math.PI / 2), gm('#ffffff')), beam = new THREE.Mesh(new THREE.CylinderGeometry(g.r - 0.3, g.r - 0.3, 34, 32, 1, true), gm(a));
    beam.material.map = beamTex; beam.position.y = 17; disc.position.y = 0.03; ring.position.y = 0.05; ring.material.opacity = 0.9; z.add(disc, ring, beam); scene.add(z); garageFx.push({ disc, beam });
  }
}
const garage = { open: false, g: null, az: 0.6, el: 0.25, viewId: 'rookie', ui: null };
const nearGarage = c => W.GARAGES.find(g => Math.hypot(c.x - g.zx, c.z - g.zz) < g.r) || null;
const estCache = {};
function estimate(id, up) {                 // real 0-100 km/h from the physics model on the beach straight, plus spec numbers
  const key = id + JSON.stringify(up || {}); if (estCache[key]) return estCache[key];
  const S = carSpec(id, up), p = W.roadAt(700), c = newCar(p.x, p.z, Math.atan2(p.tx, p.tz)); let t100 = null;
  for (let t = 0; t < 16; t += 1 / 60) { stepCar(c, { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false }, S, 1 / 60); if (c.kmh >= 100) { t100 = t; break; } }
  return (estCache[key] = { t100: t100 || 16, mass: Math.round(S.mass), torque: Math.round(S.torque), grip: +S.muR.toFixed(2), brake: +S.brakeG.toFixed(2) });
}
garage.ui = UI.createGarage({
  profile: () => profile, estimate,
  viewCar: id => { garage.viewId = id; fillCar(player.body, id, (profile.cos[id]) || DEFAULT_COS); },
  previewCos: cos => styleHolder(player.body, garage.viewId, cos),
  buy: payload => new Promise(res => (net.sock && net.joined ? net.sock.emit('buy', payload, res) : res({ ok: false, error: 'Offline' }))),
  close: () => closeGarage(),
});
function openGarage(g) {
  const c = player.st; if (!profile) return; if (Math.abs(c.u) > 20) { UI.toast('Slow down to enter the garage', 'blue'); return; }
  garage.open = true; garage.g = g; garage.az = g.roadYaw + 2.4; garage.el = 0.22; c.x = g.zx; c.z = g.zz; c.yaw = g.roadYaw + 0.5; c.u = c.v = c.r = 0; c.y = groundAt(c.x, c.z); c.air = false; UI.setPrompt('');
  if (garage.ui) garage.ui.open(g); camera.fov = 50; camera.updateProjectionMatrix();
}
function closeGarage() {
  if (!garage.open) return; garage.open = false; if (garage.ui) garage.ui.close();
  fillCar(player.body, profile.sel, profile.cos[profile.sel]); player.id = profile.sel; camS.fov = 62; camS.yaw = player.st.yaw;
}
function garageCamera(c, dt) {
  if (!camS.drag) garage.az += dt * 0.35; const d = 8.2, ce = Math.cos(garage.el);
  camera.position.set(c.x + Math.sin(garage.az) * ce * d, Math.max(c.y + Math.sin(garage.el) * d + 0.8, groundAt(c.x, c.z) + 0.6), c.z + Math.cos(garage.az) * ce * d); camera.lookAt(c.x, c.y + 0.75, c.z);
}
// ---- PHASE 6: races (world markers + HUD + flow), minimap / full map / GPS waypoint, T = garage teleport
const race = { id: null, state: null, left: 0, recvAt: 0, t: 0, n: 0, list: [], status: {}, goUntil: 0, cp: null };
const raceBeamTex = canvasTex(8, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.95)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
const beamMesh = (color, r, h) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20, 1, true), new THREE.MeshBasicMaterial({ color, map: raceBeamTex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
const raceLabels = {};
function raceLabel(def) {                                                               // floating label above each race start (canvas text, redrawn when the status changes)
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 200; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); spr.scale.set(30, 11.7, 1); spr.renderOrder = 11;
  const draw = third => { const g = cv.getContext('2d'); g.clearRect(0, 0, 512, 200); g.fillStyle = 'rgba(10,14,22,.85)'; g.fillRect(0, 0, 512, 200); g.fillStyle = def.color; g.fillRect(0, 0, 512, 14);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 46px system-ui,Arial'; g.fillText(def.name.toUpperCase(), 256, 72); g.font = '28px system-ui,Arial'; g.fillText(`${(def.length / 1000).toFixed(1)} km  -  prize $${def.prize.toLocaleString()}`, 256, 118); g.fillStyle = def.color; g.font = 'bold 32px system-ui,Arial'; g.fillText(third, 256, 168); tex.needsUpdate = true; };
  draw('Press ENTER at the start line'); return { spr, draw, text: '' };
}
for (const def of RACES) {
  const p = W.roadAt(def.s0, 11), b = beamMesh(def.color, 2.4, 70); b.position.set(p.x, p.y + 35, p.z); scene.add(b);
  const L = raceLabel(def); L.spr.position.set(p.x, p.y + 26, p.z); scene.add(L.spr); raceLabels[def.id] = L;
  gate(def.s0, 'RACE START', def.color); if ((def.cps[def.cps.length - 1] - def.s0) % W.ROAD_LEN > 1) gate(def.cps[def.cps.length - 1], 'FINISH', '#2f9e44');
}
const cpBeam = beamMesh('#ffe600', 4.5, 60); cpBeam.visible = false; scene.add(cpBeam);
const wpBeam = beamMesh('#ff2bd6', 3.2, 120); wpBeam.visible = false; scene.add(wpBeam);
const nearRace = c => RACES.find(r => { const p = W.roadAt(r.s0); return Math.hypot(c.x - p.x, c.z - p.z) < 38; }) || null;
function joinNearbyRace() { if (race.id || garage.open || !net.sock || !net.joined) return; const r = nearRace(player.st); if (r) net.sock.emit('race:join', r.id); }
function leaveRace() { if (race.id && net.sock) net.sock.emit('race:leave'); }
function teleportGarage() {
  if (race.id || garage.open || mode !== 'drive') return; const c = player.st; let best = null, bd = 1e9;
  for (const g of W.GARAGES) { const d = Math.hypot(c.x - g.zx, c.z - g.zz); if (d < bd) { bd = d; best = g; } }
  c.x = best.zx; c.z = best.zz; c.yaw = best.roadYaw; c.u = c.v = c.r = 0; c.y = groundAt(c.x, c.z); c.air = false; camS.yaw = c.yaw; UI.toast('Teleported to ' + best.name, 'blue');
}
const mapUI = initMap({
  me: () => ({ x: player.st.x, z: player.st.z, yaw: player.st.yaw }),
  others: () => [...net.remotes.values()].filter(r => r.pos).map(r => ({ name: r.name, x: r.pos.x, z: r.pos.z })),
  race: () => race.cp,
  onWaypoint: wp => { wpBeam.visible = !!wp; if (wp) { wpBeam.position.set(wp.x, W.terrainH(wp.x, wp.z) + 60, wp.z); UI.toast('GPS: ' + wp.name, 'blue'); } },
});
function raceEvents(sock) {
  sock.on('races', list => { for (const s of list) { race.status[s.id] = s; const L = raceLabels[s.id], txt = s.state === 'lobby' ? `LOBBY ${Math.ceil(s.left / 1000)}s  -  ${s.n} racer${s.n === 1 ? '' : 's'}` : s.state === 'idle' ? 'Press ENTER at the start line' : s.state === 'results' ? 'Race finished' : 'RACE IN PROGRESS'; if (L && L.text !== txt) { L.text = txt; L.draw(txt); } } });
  sock.on('race:joined', d => { race.id = d.id; race.state = 'lobby'; race.list = []; UI.toast('Joined ' + RACES.find(r => r.id === d.id).name + ' - press X to leave', 'orange'); });
  sock.on('race:error', d => UI.toast(d.error, 'orange'));
  sock.on('race:update', d => {
    const wasRun = race.state === 'running'; Object.assign(race, { state: d.state, left: d.left, t: d.t, n: d.n, list: d.list, recvAt: performance.now() }); if (!wasRun && d.state === 'running') race.goUntil = performance.now() + 1300;
    if (race.id !== d.id && d.list.some(m => m.id === net.id)) race.id = d.id; const mine = d.list.find(m => m.id === net.id); if (mine && (mine.done || mine.dnf) && race.id) { race.id = null; race.cp = null; cpBeam.visible = false; }
  });
  sock.on('race:results', res => { UI.showResults(res, net.id); race.id = null; });
  sock.on('race:out', d => { race.id = null; race.state = null; race.cp = null; cpBeam.visible = false; UI.setRaceHud(''); UI.setCount(''); UI.toast(d.reason, 'orange'); });
}
function raceFrame(dt, c) {
  const now = performance.now(), mine = race.list.find(m => m.id === net.id), def = race.id ? RACES.find(r => r.id === race.id) : null;
  if (def && race.state === 'lobby') UI.setRaceHud(`${def.name}  -  starts in ${Math.ceil(Math.max(0, race.left - (now - race.recvAt)) / 1000)} s  -  ${race.list.length} racer(s)  -  X to leave`);
  else if (def && race.state === 'running' && mine) UI.setRaceHud(`${def.name}   POS ${mine.pos}/${race.list.length}   CP ${mine.k}/${race.n}   ${UI.raceTime(race.t + now - race.recvAt)}`);
  else if (def && race.state === 'countdown') UI.setRaceHud(def.name); else UI.setRaceHud('');
  UI.setCount(def && race.state === 'countdown' ? String(Math.max(1, Math.ceil((race.left - (now - race.recvAt)) / 1000))) : (now < race.goUntil ? 'GO!' : ''));
  if (def && race.state === 'running' && mine && !mine.done && mine.k < def.cps.length) { const p = W.roadAt(def.cps[mine.k]); race.cp = { x: p.x, z: p.z }; cpBeam.position.set(p.x, p.y + 30, p.z); cpBeam.visible = true; } else { race.cp = null; cpBeam.visible = false; }
  const wp = mapUI.getWaypoint();                                                                    // GPS arrow (relative to where the camera looks)
  if (wp) { const dx = wp.x - c.x, dz = wp.z - c.z, dist = Math.hypot(dx, dz);
    if (dist < 25) { mapUI.setWaypoint(null); UI.toast('Arrived: ' + wp.name, 'green'); UI.setGps(null, ''); }
    else { camera.getWorldDirection(_v); const rel = shortAng(Math.atan2(dx, dz) - Math.atan2(_v.x, _v.z)); UI.setGps(-rel * 180 / Math.PI, (dist >= 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m') + '  ' + wp.name); } } else UI.setGps(null, '');
  wpBeam.material.opacity = 0.45 + 0.15 * Math.sin(now / 250); cpBeam.material.opacity = 0.5 + 0.2 * Math.sin(now / 180);
}
// ---- main loop
const clock = new THREE.Clock(), v3 = new THREE.Vector3(); let t = 0;
setText('info', 'W/S gas·brake·reverse  A/D steer  SPACE handbrake  SHIFT nitro  C camera  mouse-drag orbit  R reset  Z next car  V flip  L leaderboard  M map  T garage  ENTER join race  X leave  1-4 teleport  F fly');
function frame() {
  requestAnimationFrame(frame);                                   // scheduled first so one bad frame can never freeze the game
  const dt = Math.min(clock.getDelta(), 0.05); t += dt;
  const c = player.st, S = player.spec;
  if (mode === 'drive') {
    if (garage.open) { c.u = c.v = c.r = 0; c.vy = 0; inp.throttle = inp.brake = 0; } else { readInput(dt); stepCar(c, inp, S, dt); }
    // visuals: terrain alignment + dive/squat/roll
    const v = player.vis, lerpK = 1 - Math.exp(-14 * dt);
    v.pitch += ((-c.pitch) + (-c.ax * 0.0042) - v.pitch) * lerpK; v.roll += ((c.roll) + (c.ay * 0.0032) - v.roll) * lerpK;
    player.root.position.set(c.x, c.y, c.z); player.root.rotation.set(0, c.yaw, 0);
    player.body.rotation.set(Math.max(-0.35, Math.min(0.35, v.pitch)), 0, Math.max(-0.35, Math.min(0.35, v.roll)), 'XYZ');
    // FX
    const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), b = S.wb * S.front, a = S.wb - b, onRoad = c.kind === 'road' || c.kind === 'gravel';
    const slipping = !c.air && (c.rearSlip > 0.2 || c.spin) && c.kmh > 4, hard = !c.air && inp.brake > 0.9 && c.u > 6 && c.kmh > 30;
    [[0, -b, 0.78], [1, -b, -0.78], [2, a, 0.78], [3, a, -0.78]].forEach(([k, fo, lo]) => {
      const x = c.x + sy * fo + cy * lo, z = c.z + cy * fo - sy * lo, y = groundAt(x, z), on = (k < 2 ? slipping : hard) && onRoad;
      skidTo(k, x, z, y, on);
      if ((k < 2 ? slipping : hard) && Math.random() < 0.55 * Math.min(1, c.kmh / 40 + 0.3)) puff(x + (Math.random() - .5) * .3, y + 0.25, z + (Math.random() - .5) * .3, -sy * c.u * 0.05 + (Math.random() - .5), -cy * c.u * 0.05 + (Math.random() - .5), 1.1 + Math.random() * 0.7);
    });
    updateDrift(c, dt); updateHud(c, S); updateAudio(c, S, t);
    if (garage.open) garageCamera(c, dt); else chaseCamera(c, dt);
    { const ng = garage.open ? null : nearGarage(c); const nr = (garage.open || race.id) ? null : nearRace(c); UI.setPrompt(ng ? 'Press E - ' + ng.name : nr ? 'Press ENTER - join ' + nr.name : ''); }
    garageFx.forEach((f, i) => { const k = 0.16 + 0.07 * Math.sin(t * 3 + i); f.disc.visible = f.beam.visible = !garage.open; f.disc.material.opacity = k; f.beam.material.opacity = k * 0.9; });
    const zn = W.zoneAt(c.x, c.z); setText('zone', zn.toUpperCase());
  } else {
    const k = keys, sp = (k.ShiftLeft ? 260 : 70) * dt, f = new THREE.Vector3(Math.sin(fly.yaw) * Math.cos(fly.pitch), Math.sin(fly.pitch), Math.cos(fly.yaw) * Math.cos(fly.pitch)), r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(-1);
    if (k.KeyW) camera.position.addScaledVector(f, sp); if (k.KeyS) camera.position.addScaledVector(f, -sp); if (k.KeyD) camera.position.addScaledVector(r, -sp); if (k.KeyA) camera.position.addScaledVector(r, sp);
    if (k.KeyE) camera.position.y += sp; if (k.KeyQ) camera.position.y -= sp; camera.lookAt(camera.position.clone().add(f));
  }
  netFrame(dt, c); raceFrame(dt, c); mapUI.draw();
  updateSmoke(dt);
  sky.position.copy(camera.position);
  const fx = mode === 'drive' ? player.root.position : camera.position;
  sun.position.copy(fx).addScaledVector(SUN_DIR, 400); sun.target.position.copy(fx);
  waterNormal.offset.set(t * 0.004, t * 0.002); clouds.position.x = (t * 6) % 600;
  renderer.render(scene, camera);
}
const ld = $('load'); if (ld) ld.remove();
frame();
window.__dbg = { styleHolder, fillCar, openGarage, garage, scene, camera, player, W, renderer, keys, get mode() { return mode; }, set mode(v) { mode = v; }, fly, camS };

