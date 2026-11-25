// main.js - client. Phase 1: the world (terrain, road, scenery) + a cruise / fly camera to inspect it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as W from './world.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { newCar, stepCar, groundAt, placeCar, freezeCar, impulseAt, pushOut, syncVel, bodyPoint, probe as probeGround } from './physics.js';
import { CARS, DEFAULT_CAR, carSpec, SPEED_TRAPS, DRIFT_ZONES, DEFAULT_COS, RIMS, RACES } from './catalog.js';
import { initMap } from './map.js';
import { buildTown } from './town.js';
import { makeTrafficTypes } from './traffic-models.js';
import { EngineSound } from './engine-sound.js';
import { initHud, initHelp, initDebug, speedLines } from './hud.js';
import { createFx, makeCarFx } from './fx.js';
import { newChaseState, chaseStep } from './chase-cam.js';
import { detailTextures, asphaltTextures, terrainMaterial, grassField } from './visuals.js';
import { makeFoliage } from './foliage.js';
import { buildScenery, fieldAt } from './scenery.js';
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
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { sun: { value: SUN_DIR }, env: { value: 0 } },
  vertexShader: 'varying vec3 v; void main(){ v=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `varying vec3 v; uniform vec3 sun; uniform float env; void main(){
    float h=clamp(v.y,0.,1.); vec3 hor=vec3(.66,.82,.96), mid=vec3(.31,.60,.94), top=vec3(.11,.35,.80);
    vec3 c=mix(hor,mid,smoothstep(0.,.16,h)); c=mix(c,top,smoothstep(.12,.8,h));
    if(v.y<0.) c=mix(hor,vec3(.34,.31,.26),env);
    float s=max(dot(normalize(v),sun),0.); c+=vec3(1.,.9,.7)*pow(s,900.)*3. + vec3(1.,.85,.6)*pow(s,12.)*.18;
    gl_FragColor=vec4(c,1.); }`
}));
sky.renderOrder = -10; scene.add(sky);
// image-based lighting: capture the sky once and use it for ambient light + reflections on every PBR material (cars, glass, asphalt, paint)
const envTex = (() => { try { const es = new THREE.Scene(), m = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), sky.material.clone()); m.material.uniforms = { sun: { value: SUN_DIR }, env: { value: 1 } }; es.add(m);
  const pm = new THREE.PMREMGenerator(renderer), t = pm.fromScene(es, 0.02, 1, 200).texture; pm.dispose(); return t; } catch (e) { console.warn('env map failed', e); return null; } })();
scene.environment = envTex;

scene.add(new THREE.HemisphereLight(0xbfe3ff, 0xc9b98a, 0.55));
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
const col = { grass: C(0x75a343), grass2: C(0x4f8236), dark: C(0x3a7035), sand: C(0xe2cc96), wet: C(0xc9b47c), shallow: C(0xd9cc94), deep: C(0x2b8fa6), rock: C(0x8d867c), alpine: C(0xa8b49a), pale: C(0xd9ddd6), city: C(0xbfc3ca), lawn: C(0x62c24d), gravel: C(0x9c917e), stone: C(0xcfc8b8) };
const tmp = new THREE.Color(), SPLAT = [1, 0, 0, 0];
function terrainColor(i, j, o) {
  const x = BOUNDS.x0 + i * CELL, z = BOUNDS.z0 + j * CELL, h = H[o], d = Math.min(D[o], TERRAIN.DS[o] + 1);   // gravel verges along every road
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
  if (d > 14) { const f = fieldAt(x, z); if (f) c.set(f.type.color).multiplyScalar(0.9 + n * 0.2); }
  if (d < 10) c.lerp(col.gravel, 1 - sstep((d - 6.6) / 3.4));
  let wP = Math.min(1, cw * 0.9);
  for (const p of W.PADS) { const k = 1 - sstep((Math.hypot(x - p.x, z - p.z) - p.r) / 4); c.lerp(col.stone, k); wP = Math.max(wP, k); }
  const wS = h < 0.2 ? 1 : (beach > 0 && h < 6 ? beach * (1 - sstep((h - 3.6) / 2)) : 0), wR = Math.max(sstep((slope - 0.42) / 0.35), sstep((h - 105) / 55) * 0.7, d < 10 ? 1 - sstep((d - 6.6) / 3.4) : 0);
  const wG = Math.max(0, 1 - wS - wR - wP), sum = wG + wS + wR + wP || 1; SPLAT[0] = wG / sum; SPLAT[1] = wS / sum; SPLAT[2] = wR / sum; SPLAT[3] = wP / sum;
  return c;
}
const terrain = new THREE.Group(); scene.add(terrain);
const terrMat = terrainMaterial(detailTextures());
for (let cz = 0; cz < NZ - 1; cz += 64) for (let cx = 0; cx < NX - 1; cx += 64) {
  const i1 = Math.min(cx + 64, NX - 1), j1 = Math.min(cz + 64, NZ - 1), w = i1 - cx + 1, h = j1 - cz + 1;
  const pos = new Float32Array(w * h * 3), nor = new Float32Array(w * h * 3), cl = new Float32Array(w * h * 3), sp = new Float32Array(w * h * 4), uv = new Float32Array(w * h * 2), idx = new Uint16Array((w - 1) * (h - 1) * 6);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const gi = cx + i, gj = cz + j, o = gi + gj * NX, v = i + j * w;
    pos[v * 3] = BOUNDS.x0 + gi * CELL; pos[v * 3 + 1] = H[o]; pos[v * 3 + 2] = BOUNDS.z0 + gj * CELL;
    const nx = (hAt(gi - 1, gj) - hAt(gi + 1, gj)) / (2 * CELL), nz = (hAt(gi, gj - 1) - hAt(gi, gj + 1)) / (2 * CELL), l = Math.hypot(nx, 1, nz);
    nor[v * 3] = nx / l; nor[v * 3 + 1] = 1 / l; nor[v * 3 + 2] = nz / l;
    const c = terrainColor(gi, gj, o); cl[v * 3] = c.r; cl[v * 3 + 1] = c.g; cl[v * 3 + 2] = c.b; sp.set(SPLAT, v * 4);
    uv[v * 2] = pos[v * 3] / 12; uv[v * 2 + 1] = pos[v * 3 + 2] / 12;
  }
  let k = 0; for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) { const a = i + j * w, b = a + 1, c2 = a + w, d = c2 + 1; idx.set([a, c2, b, b, c2, d], k); k += 6; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.setAttribute('aSplat', new THREE.BufferAttribute(sp, 4)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere(); const m = new THREE.Mesh(g, terrMat); m.receiveShadow = true; terrain.add(m);
}
// ocean: depth-aware water (shallow turquoise -> deep blue, foam bands that roll toward the shore, fresnel sky reflection, two scrolling normal layers)
const seaDepth = (() => { const d = new Uint8Array(NX * NZ); for (let k = 0; k < d.length; k++) d[k] = Math.max(0, Math.min(255, Math.round((H[k] + 6) / 9 * 255))); const tx = new THREE.DataTexture(d, NX, NZ, THREE.RedFormat, THREE.UnsignedByteType); tx.magFilter = tx.minFilter = THREE.LinearFilter; tx.needsUpdate = true; return tx; })();
const waterU = { uDepth: { value: seaDepth }, uTime: { value: 0 }, uBox: { value: new THREE.Vector4(BOUNDS.x0, BOUNDS.z0, (NX - 1) * CELL, (NZ - 1) * CELL) } };
const waterMat = new THREE.MeshStandardMaterial({ color: 0x1a8fb0, transparent: true, opacity: 0.86, roughness: 0.1, metalness: 0.0, envMapIntensity: 0.7, normalMap: waterNormal, normalScale: new THREE.Vector2(0.4, 0.4) });
waterMat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, waterU);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWP; uniform sampler2D uDepth; uniform float uTime; uniform vec4 uBox;
float wHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(wHash(i), wHash(i+vec2(1,0)), f.x), mix(wHash(i+vec2(0,1)), wHash(i+vec2(1,1)), f.x), f.y); }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
  float bed = texture2D(uDepth, (vWP.xz - uBox.xy) / uBox.zw).r * 9.0 - 6.0; float dep = max(0.0, -bed);
  vec3 shallow = vec3(0.30, 0.86, 0.80), deepC = vec3(0.03, 0.26, 0.46); diffuseColor.rgb = mix(shallow, deepC, smoothstep(0.1, 7.0, dep));
  float edgeN = wNoise(vWP.xz * 0.35 + vec2(uTime * 0.05, 0.0));
  float band = sin(dep * 7.0 - uTime * 1.4 + edgeN * 6.0) * 0.5 + 0.5; float foam = smoothstep(0.7, 0.0, dep + (edgeN - 0.5) * 0.5) * (0.35 + 0.65 * band); foam += smoothstep(0.12, 0.0, dep) * 0.6; foam = clamp(foam, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.98, 1.0), foam);
  diffuseColor.a = mix(0.34, 0.9, smoothstep(0.0, 2.2, dep)); diffuseColor.a = mix(diffuseColor.a, 0.96, foam);`)
    .replace('#include <opaque_fragment>', `float fr = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0); outgoingLight = mix(outgoingLight, vec3(0.62, 0.8, 0.96), fr * 0.55);
  #include <opaque_fragment>`);
};
const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), waterMat);water.position.y = 0; scene.add(water);
// grass tufts around the player/camera (only on real grass: not sand, road shoulder, city, garages, mowed estate lawns)
const grass = grassField(scene, { height: terrainH, ok: (x, z) => {
  const h = terrainH(x, z); if (h < 1.2 || h > 140 || (z > 735 && x < 430 && h < 5.4)) return false;
  const E = W.ESTATE, C0 = W.CITY_RECT; if ((x > E.x0 - 5 && x < E.x1 + 5 && z > E.z0 - 5 && z < E.z1 + 5) || (x > C0.x0 - 40 && x < C0.x1 + 40 && z > C0.z0 - 40 && z < C0.z1 + 40)) return false;
  if (fieldAt(x, z) || W.terrainSlope(x, z) > 0.42 || W.anyRoadDist(x, z, 12) < 9) return false;
  for (const g of W.GARAGES) if (Math.hypot(x - g.cx, z - g.cz) < 34) return false; const pd = W.PADS[0]; return Math.hypot(x - pd.x, z - pd.z) > pd.r + 8; } });

// ---------------------------------------------------------------- road + flat strips
function ribbon(pts, halfW, vScale, mat, offset = 0, closed = false) { // pts: {x,y,z,tx,tz,s}
  const n = pts.length, pos = [], uv = [], idx = [];
  pts.forEach(p => { const nx = -p.tz, nz = p.tx; pos.push(p.x - nx * halfW, p.y + offset, p.z - nz * halfW, p.x + nx * halfW, p.y + offset, p.z + nz * halfW); uv.push(0, p.s / vScale, 1, p.s / vScale); });
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); return m;
}
const AT = asphaltTextures(), roadMat = new THREE.MeshStandardMaterial({ map: AT.map, roughnessMap: AT.rough, roughness: 1, metalness: 0.02, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const flatMat = new THREE.MeshStandardMaterial({ map: plainAsphaltTex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
{ const pts = []; for (let i = 0; i <= ROAD.N; i++) { const k = i % ROAD.N; pts.push({ x: ROAD.X[k], y: ROAD.Y[k], z: ROAD.Z[k], tx: ROAD.TX[k], tz: ROAD.TZ[k], s: i * ROAD.ds }); }
  ribbon(pts, W.ROAD_HALF, 16, roadMat);
  // gravel shoulders: the asphalt no longer ends in a hard cut; a rough strip blends it into the sand / grass
  const shTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#8d8372'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { const v = 90 + Math.random() * 90 | 0; g.fillStyle = `rgba(${v},${v - 6},${v - 18},${0.25 + Math.random() * 0.4})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 2); } });
  const shMat = new THREE.MeshStandardMaterial({ map: shTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  for (const sg of [-1, 1]) ribbon(pts.map(p => ({ x: p.x - p.tz * sg * (W.ROAD_HALF + 0.7), y: p.y, z: p.z + p.tx * sg * (W.ROAD_HALF + 0.7), tx: p.tx, tz: p.tz, s: p.s })), 0.8, 6, shMat, -0.015);
  // side roads: same asphalt, drawn just under the main road so junctions stay clean
  const laneMat = roadMat.clone(), vergeMat = shMat.clone(); laneMat.polygonOffsetFactor = laneMat.polygonOffsetUnits = -1.5; vergeMat.polygonOffsetFactor = vergeMat.polygonOffsetUnits = -0.5;
  for (const lane of W.SIDE_ROADS) { ribbon(lane, W.SIDE_HALF, 16, laneMat, -0.02); for (const sg of [-1, 1]) ribbon(lane.map(p => ({ x: p.x - p.tz * sg * (W.SIDE_HALF + 0.6), y: p.y, z: p.z + p.tx * sg * (W.SIDE_HALF + 0.6), tx: p.tx, tz: p.tz, s: p.s })), 0.7, 6, vergeMat, -0.04); } }
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
function instances(geo, mat, list, { cast = true, receive = false } = {}) { // list of {x,y,z,ry,sx,sy,sz,c,rx,rz}; big lists are split into 300 m cells so frustum culling works
  if (!list.length) return null; const cells = new Map();
  if (list.length > 100) for (const o of list) { const k = Math.floor(o.x / 300) * 4096 + Math.floor(o.z / 300); let a = cells.get(k); if (!a) cells.set(k, a = []); a.push(o); } else cells.set(0, list);
  let first = null, cc = new THREE.Color();
  for (const sub of cells.values()) {
    const m = new THREE.InstancedMesh(geo, mat, sub.length);
    sub.forEach((o, i) => { dummy.position.set(o.x, o.y, o.z); dummy.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0); dummy.scale.set(o.sx || 1, o.sy || o.sx || 1, o.sz || o.sx || 1); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); if (o.c !== undefined) m.setColorAt(i, cc.set(o.c)); });
    m.castShadow = cast; m.receiveShadow = receive; m.computeBoundingSphere(); m.frustumCulled = true; scene.add(m); first = first || m;
  }
  return first;
}const stdV = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const stdVflat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
const FOL = makeFoliage();
const dsMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
// box with UVs scaled to metres (texture tile = 1/s metres); faces: 0 +x,1 -x,2 +y,3 -y,4 +z,5 -z
function boxFaces(w, h, d, faces, s = 0.25, color = '#fff') {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(), P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, pos = [], nor = [], uv = [];
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (const f of faces) for (let v = f * 6; v < f * 6 + 6; v++) { pos.push(P.getX(v), P.getY(v), P.getZ(v)); nor.push(N.getX(v), N.getY(v), N.getZ(v)); uv.push(U.getX(v) * dims[f][0] * s, U.getY(v) * dims[f][1] * s); }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); o.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return paint(o, color);
}
const sideOf = (x, z) => ({ x, z });
const free = (x, z, minD) => { const E = W.ESTATE; if (x > E.x0 - 14 && x < E.x1 + 14 && z > E.z0 - 14 && z < E.z1 + 14) return false; for (const g of W.GARAGES) if (Math.hypot(x - g.cx, z - g.cz) < 30) return false; return W.anyRoadDist(x, z, minD + 5) > minD; };
const hasNeighbors = (x, z) => false;

// ---- solid props (lamps, signs, palms, buildings, villas): spatial hash of circles / boxes so the car can crash into them
const solids = new Map(), sKey = (cx, cz) => cx * 4096 + cz;
const solidPut = (cx, cz, o) => { const k = sKey(cx, cz); let a = solids.get(k); if (!a) solids.set(k, a = []); a.push(o); };
const solidAdd = (x, z, r) => solidPut(Math.floor(x / 16), Math.floor(z / 16), { x, z, r, hw: 0, hd: 0 });
const solidBox = (cx, cz, hw, hd) => { const o = { x: cx, z: cz, r: 0, hw, hd }; for (let a = Math.floor((cx - hw) / 16); a <= Math.floor((cx + hw) / 16); a++) for (let b = Math.floor((cz - hd) / 16); b <= Math.floor((cz + hd) / 16); b++) solidPut(a, b, o); };
// ---------------------------------------------------------------- BEACH: palms, umbrellas, boardwalk, pier
{ // palms
  const list = [];
  for (let n = 0; n < 12000 && list.length < 460; n++) { const x = R(-1250, 330), z = R(640, 1060), h = terrainH(x, z);
    if (h < 0.9 || h > 4.8 || !free(x, z, 17) || W.terrainSlope(x, z) > 0.25) continue; if (W.fbm(x / 70, z / 70) < 0.42 && rnd() < 0.7) continue;
    const s = R(0.8, 1.25); solidAdd(x, z, 0.34 * s); list.push({ x, y: h - 0.2, z, ry: R(0, 6.3), rx: R(-0.07, 0.07), rz: R(-0.07, 0.07), sx: s, sy: s * R(0.9, 1.3), sz: s, c: new THREE.Color().setHSL(0.3, 0.1, R(0.85, 1.1)).getHex() }); }
  instances(FOL.palm.geo, FOL.palm.mat, list);
  // umbrellas
  const ug = merge([paint(new THREE.ConeGeometry(1.45, 0.62, 10).translate(0, 2.72, 0), '#ffffff')]), ugBase = merge([paint(new THREE.CylinderGeometry(0.045, 0.045, 3.0, 6).translate(0, 1.2, 0), '#d9d9d9'), paint(new THREE.CylinderGeometry(0.16, 0.5, 0.2, 10).translate(0, 0.06, 0), '#cfbf98'), paint(new THREE.SphereGeometry(0.07, 6, 4).translate(0, 3.05, 0), '#d9d9d9')]), ul = [];   // pole sunk into the sand under a small mound; only the canopy is tinted   // pole sunk into the sand under a small mound, one consistent size
  const cols = [0xe94f64, 0xf2b630, 0x35a7d8, 0xf0803c, 0xd94fa8, 0x2f8f9d];
  for (let n = 0; n < 6000 && ul.length < 70; n++) { const x = R(-900, 40), z = R(780, 1010), h = terrainH(x, z); const q = roadQuery(x, z, 90); if (h < 1 || h > 3 || q.d < 28 || q.d > 85) continue;
    ul.push({ x, y: h - 0.04, z, ry: R(0, 6), rz: R(-0.06, 0.06), c: cols[(rnd() * cols.length) | 0] }); }
  instances(ug, stdV, ul); instances(ugBase, stdV, ul.map(u => ({ ...u, c: 0xffffff })));
  // boardwalk along the sea side of the coast road + lamps
  const bw = W.BOARDWALK; let lamps = [];
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
const lampGeo = merge([paint(new THREE.CylinderGeometry(0.1, 0.14, 8.5, 6).translate(0, 4.25, 0), '#59616b'), paint(new THREE.BoxGeometry(2.2, 0.12, 0.12).translate(1, 8.45, 0), '#59616b'), paint(new THREE.BoxGeometry(0.7, 0.18, 0.4).translate(2, 8.35, 0), '#fff3b0')]).scale(0.8, 0.8, 0.8);
{
  buildTown({ scene, R, rnd, merge, paint, instances, canvasTex, boxFaces, ribbon, roadMat, stdV, lampGeo, free, trees: FOL, solidAdd, solidBox });
  // streetlights: loop road inside the city + avenues
  const ll = []; for (let s = 0; s < ROAD.L; s += 38) { const p = roadAt(s, 0); if (W.zoneAt(p.x, p.z) !== 'city') continue; const side = (s / 38 | 0) % 2 ? 1 : -1, q = roadAt(s, side * 8.4); ll.push({ x: q.x, y: q.y - 0.1, z: q.z, ry: Math.atan2(-(side * -p.tz), -(side * p.tx)) }); }
  for (const x of AVX) for (let z = CR.z0 + 30; z < CR.z1 - 20; z += 48) { if (Math.hypot(x - W.PLAZA.x, z - W.PLAZA.z) < W.PLAZA.r + 14) continue; ll.push({ x: x + 13, y: AVY, z, ry: Math.PI }); ll.push({ x: x - 13, y: AVY, z: z + 24, ry: 0 }); }
  for (const l of window.__lamps || []) ll.push({ x: l.x, y: l.y, z: l.z, ry: 0 });
  instances(lampGeo, stdV, ll); ll.forEach(l => solidAdd(l.x, l.z, 0.16));
  // road signs along the loop (city: blue/green panels, mountain curves: yellow chevrons on the outside)
  const signG = merge([paint(new THREE.CylinderGeometry(0.06, 0.06, 3, 5).translate(0, 1.5, 0), '#8a9199'), paint(new THREE.BoxGeometry(1.6, 1.1, 0.08).translate(0, 3.2, 0), '#ffffff')]), sl = [];
  for (let i = 0; i < ROAD.N; i += 60) { const p = roadAt(i * ROAD.ds, 0), z = W.zoneAt(p.x, p.z); if (z === 'city' && i % 120 === 0) { const q = roadAt(i * ROAD.ds, 9.5); sl.push({ x: q.x, y: q.y, z: q.z, ry: Math.atan2(p.tx, p.tz) + Math.PI / 2, c: [0x2e86de, 0x2bb673, 0xffffff][(i / 120 | 0) % 3] }); } }
  for (let i = 0; i < ROAD.N; i += 12) { const a = roadAt(i * ROAD.ds), b = roadAt((i + 10) * ROAD.ds), z = W.zoneAt(a.x, a.z); if (z !== 'mountain') continue;
    const turn = a.tx * b.tz - a.tz * b.tx; if (Math.abs(turn) < 0.12) continue; const side = turn > 0 ? 1 : -1, q = roadAt(i * ROAD.ds, -side * 9);   // outer side of the bend
    sl.push({ x: q.x, y: q.y, z: q.z, ry: Math.atan2(-b.tz * side * 0 + a.tz * 0 + (-a.tx) * 0 + a.tx, a.tz) + Math.PI, c: 0xffcc00 }); }
  instances(signG, stdV, sl); sl.forEach(l => solidAdd(l.x, l.z, 0.12));
}

// ---------------------------------------------------------------- MOUNTAIN: pines, rocks, posts, guardrails, overlook
{
  const pl = [], tint = () => new THREE.Color().setHSL(0.3 + R(-.05, .05), R(0.15, 0.4), R(0.8, 1.0)).getHex();
  for (let n = 0; n < 60000 && pl.length < 6500; n++) { const x = R(-1650, 1500), z = R(-1400, 650); if (W.zoneAt(x, z) === 'city' && z > -100) continue;
    const h = terrainH(x, z); if (h < 6 || h > 175 || W.terrainSlope(x, z) > 0.7) continue; if (W.fbm(x / 120 + 40, z / 120) < 0.47) continue; if (!free(x, z, 15)) continue;
    if (fieldAt(x, z)) continue; const s = R(0.7, 1.35); pl.push({ x, y: h - 0.3, z, ry: R(0, 6), sx: s, sy: s * R(0.9, 1.5), sz: s, c: tint() }); if (roadQuery(x, z, 45).d < 40) solidAdd(x, z, 0.4 * s); }
  instances(FOL.pine.geo, FOL.pine.mat, pl);
  // lowland round trees near the city outskirts and meadows
  const tl = [];
  for (let n = 0; n < 20000 && tl.length < 320; n++) { const x = R(-1200, 1450), z = R(-400, 800), h = terrainH(x, z); if (h < 1.5 || h > 40 || !free(x, z, 18) || W.fbm(x / 90, z / 90) < 0.5) continue; if (x > CR.x0 - 30 && x < CR.x1 + 30 && z > CR.z0 - 30 && z < CR.z1 + 30) continue; if (z > 650 && x < 400) continue;
    if (fieldAt(x, z)) continue; const s = R(0.8, 1.4); tl.push({ x, y: h - 0.2, z, ry: R(0, 6), sx: s, c: tint() }); solidAdd(x, z, 0.42 * s); }
  instances(FOL.broad.geo, FOL.broad.mat, tl);
  { const bl = []; for (let n = 0; n < 30000 && bl.length < 900; n++) { const x = R(-1500, 1450), z = R(-1300, 780), h = terrainH(x, z); if (h < 1.4 || (z > 735 && x < 430) || h > 90 || !free(x, z, 10) || W.terrainSlope(x, z) > 0.4 || W.fbm(x / 60 + 9, z / 60) < 0.5) continue; if (x > CR.x0 - 30 && x < CR.x1 + 30 && z > CR.z0 - 30 && z < CR.z1 + 30) continue; const s = R(0.6, 1.5); if (!fieldAt(x, z)) bl.push({ x, y: h - 0.1, z, ry: R(0, 6), sx: s, sy: s * R(0.8, 1.2), sz: s, c: tint() }); } instances(FOL.bush.geo, FOL.bush.mat, bl); }
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

const scenery = buildScenery({ scene, rnd, merge, paint, instances, foliage: FOL, solidAdd, solidBox });

// clouds
const clouds = new THREE.Group(); {
  const cvs = document.createElement('canvas'); cvs.width = 256; cvs.height = 128; const cg = cvs.getContext('2d');
  for (let i = 0; i < 46; i++) { const x = 40 + Math.random() * 176, y = 36 + Math.random() * 56, r = 22 + Math.random() * 30, gr = cg.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(.6, 'rgba(250,252,255,.25)'); gr.addColorStop(1, 'rgba(240,247,255,0)'); cg.fillStyle = gr; cg.fillRect(x - r, y - r, r * 2, r * 2); }
  const ct = new THREE.CanvasTexture(cvs); ct.colorSpace = THREE.SRGBColorSpace;
  for (let i = 0; i < 70; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, opacity: R(0.55, 0.95) })); const s = R(450, 1100); sp.scale.set(s * 2, s, 1); sp.position.set(R(-3200, 3200), R(650, 1000), R(-3200, 3200)); clouds.add(sp); } scene.add(clouds); }

// ---------------------------------------------------------------- PHASE 2: player car, controls, camera, FX, audio, HUD
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);

const player = { id: DEFAULT_CAR, cos: { paint: '#e53935', finish: 'gloss', rims: 0, underglow: '', spoiler: 0 }, up: {}, spec: carSpec(DEFAULT_CAR), st: null, root: new THREE.Group(), body: new THREE.Group(), model: null, vis: { pitch: 0, roll: 0 } };
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
  if (def.tire) {                                              // some models carry stray geometry under the car: ground it by the lowest tyre instead
    let mn = Infinity; outer.updateMatrixWorld(true);
    outer.traverse(o => { if (o.isMesh && (Array.isArray(o.material) ? o.material : [o.material]).some(m => def.tire.test(m.name || ''))) mn = Math.min(mn, new THREE.Box3().setFromObject(o).min.y); });
    if (isFinite(mn)) inner.position.y -= mn - (def.lift || 0);
  }
  outer.rotation.y = (def.yaw || 0) + (flip ? Math.PI : 0);
  outer.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = true; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m && envTex && m.isMeshStandardMaterial) { m.envMap = envTex; m.envMapIntensity = 0.9; } }); } });
  return outer;
}
// ---- car rig: wheels become spin/steer pivots (found by geometry: small, low, outboard parts), plus glow sprites for tail / reverse / head lights
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _bx = new THREE.Box3(), _qs = new THREE.Quaternion(), _qp = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
const glowSprite = (() => { const tx = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
  return color => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); s.renderOrder = 4; return s; }; })();
// lamp glows sit on the body surface: cast a ray at each lamp position from in front of / behind the car (cached per model)
const lampZ = new Map(), _ray = new THREE.Raycaster();
function lampSurface(outer, key, x, y, dir, edge) {
  const k = `${key}|${x.toFixed(2)}|${y.toFixed(2)}|${dir}`; let z = lampZ.get(k); if (z !== undefined) return z;
  _ray.set(new THREE.Vector3(x, y, edge + dir), new THREE.Vector3(0, 0, -dir)); const hit = _ray.intersectObject(outer, true)[0];
  z = hit && Math.abs(hit.point.z - edge) < 1.2 ? hit.point.z + dir * 0.04 : edge - dir * 0.15; lampZ.set(k, z); return z;
}
function rigCar(outer, id) {
  outer.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(outer), size = box.getSize(new THREE.Vector3()), parts = [];
  outer.traverse(o => { if (!o.isMesh) return; _bx.setFromObject(o); const s = _bx.getSize(_a), c = _bx.getCenter(_b);
    if (s.y > 0.1 && s.y < 0.95 && s.z < 0.95 && s.x < 0.62 && c.y < 0.55 && Math.abs(c.x) > size.x * 0.28 && Math.abs(c.z) > size.z * 0.16) parts.push({ o, c: c.clone(), s: s.clone() }); });
  const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(outer.quaternion.clone().invert()), groups = {}, wheels = [];
  for (const p of parts) (groups[(p.c.x > 0 ? 1 : 0) + (p.c.z > 0 ? 2 : 0)] ||= []).push(p);
  for (const k in groups) { const g = groups[k], ub = new THREE.Box3(); let r = 0; for (const p of g) { ub.union(_bx.setFromObject(p.o)); r = Math.max(r, p.s.y / 2); }
    const piv = new THREE.Group(), cen = ub.getCenter(new THREE.Vector3()); outer.add(piv); piv.position.copy(outer.worldToLocal(cen.clone())); piv.updateMatrixWorld(true); for (const p of g) piv.attach(p.o);
    wheels.push({ piv, front: (k & 2) !== 0, idx: ((k & 2) ? 0 : 2) + ((k & 1) ? 0 : 1), base: piv.position.clone(), r: Math.max(0.25, r), spin: 0 }); }
  const H = size.y, lights = { tail: [], rev: [], head: [] }, yb = box.min.y;
  const lamps = CARS[id]?.lamps || { head: [size.x * 0.32, H * 0.5], tail: [size.x * 0.32, H * 0.6] }, spots = [];
  for (const sx of [-1, 1]) {
    spots.push(['tail', 0xff1a1a, sx * lamps.tail[0], yb + lamps.tail[1], -1], ['rev', 0xffffff, sx * lamps.tail[0] * 0.62, yb + lamps.tail[1] - 0.07, -1], ['head', 0xfff1cc, sx * lamps.head[0], yb + lamps.head[1], 1]); }
  const placed = spots.map(([kind, color, x, y, dir]) => ({ kind, color, x, y, z: lampSurface(outer, id, x, y, dir, dir > 0 ? box.max.z : box.min.z) }));   // all rays first: sprites cannot be ray-cast
  for (const l of placed) { const s = glowSprite(l.color); s.position.set(l.x, l.y, l.z); outer.add(s); lights[l.kind].push(s); }
  const glows = []; for (const w of wheels) { const gs = glowSprite(0xff7a2a); gs.material.opacity = 0; gs.scale.set(w.r * 1.7, w.r * 1.7, 1); gs.position.set(0, 0, 0); w.piv.add(gs); glows.push({ s: gs, idx: w.idx }); }
  outer.userData.rig = { wheels, ax, lights, glows, len: size.z, width: size.x };
  lightsRig(outer.userData.rig, false, false, 1);                    // a freshly built car starts with the right sizes (no 1 m white squares)
}
function updateRig(rig, c, S, brake, dt) {                 // local car: wheels follow the physics (own spin = real wheelspin / lockup, per-wheel steer, suspension travel)
  if (!rig) return;
  for (const w of rig.wheels) { const pw = c.w[w.idx]; _qp.setFromAxisAngle(rig.ax, pw.ang); if (w.front) { _qs.setFromAxisAngle(UP, pw.steer); w.piv.quaternion.copy(_qs).multiply(_qp); } else w.piv.quaternion.copy(_qp);
    w.piv.position.y = w.base.y - Math.max(-0.14, Math.min(0.14, pw.sus_rel || 0)); }
  lightsRig(rig, brake, c.gear < 0, dt);
}
function updateRigRemote(rig, u, steer, brake, rev, dt) {  // remote cars: spin from their speed
  if (!rig) return;
  for (const w of rig.wheels) { w.spin += u / w.r * dt; _qp.setFromAxisAngle(rig.ax, w.spin); if (w.front) { _qs.setFromAxisAngle(UP, steer); w.piv.quaternion.copy(_qs).multiply(_qp); } else w.piv.quaternion.copy(_qp); }
  lightsRig(rig, brake, rev, dt);
}
function lightsRig(rig, brake, rev, dt) {
  const L = rig.lights, b = brake ? 1 : 0;
  for (const s of L.tail) { s.material.opacity += ((0.3 + 0.7 * b) - s.material.opacity) * Math.min(1, 25 * dt); const k = 0.26 + 0.3 * b; s.scale.set(k, k, 1); }
  for (const s of L.rev) { s.material.opacity = rev ? 0.85 : 0; s.scale.set(0.22, 0.22, 1); }
  for (const s of L.head) { s.material.opacity = 0.38; s.scale.set(0.3, 0.3, 1); }
}
const contactTex = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 8, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(0.55, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
const contactBlob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
contactBlob.renderOrder = 1; contactBlob.position.y = 0.045; contactBlob.scale.set(2.5, 1, 5.4); scene.add(contactBlob);
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
  const def = CARS[id] || CARS[DEFAULT_CAR], ud = holder.userData; cos = cos || DEFAULT_COS; ud.cos = cos; const f = FINISH[cos.finish] || FINISH.gloss;
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
  const def = CARS[id] || CARS[DEFAULT_CAR], token = {}; holder.userData.token = token; holder.userData.rig = null; holder.clear();
  holder.add(procCar()); styleHolder(holder, id, cos);
  if (!def.model) return;
  const apply = raw => { if (holder.userData.token !== token || !raw) return; const mdl = raw.clone(true); prepareModel(mdl, id); const nm = normalizeModel(mdl, def, flips[id]); rigCar(nm, id); holder.clear(); holder.add(nm); holder.userData.rig = nm.userData.rig; if (holder === player.body) contactBlob.scale.set(nm.userData.rig.width * 1.25, 1, nm.userData.rig.len * 1.12); styleHolder(holder, id, holder.userData.cos); };
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
  for (const id of Object.keys(CARS)) { if (!CARS[id].model) continue; const raw = await loadRaw(id); if (!raw) continue; await wait(900);
    try { const mdl = raw.clone(true); prepareModel(mdl, id); const n = normalizeModel(mdl, CARS[id], flips[id]); n.position.set(0, -3000, 0); n.traverse(o => { o.frustumCulled = false; });
      scene.add(n); renderer.compile(scene, camera);
      n.traverse(o => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { for (const k in m) { const t = m[k]; if (t && t.isTexture) renderer.initTexture(t); } }); });
      scene.remove(n); } catch (e) { console.warn('preload warm-up skipped', id, e); }
    await wait(1200); }
}
setTimeout(preloadCars, 2500);
function setCarModel(id) { fillCar(player.body, id, player.cos); player.model = player.body; }
function chooseCar(id, up) { player.id = id; player.up = up || {}; player.spec = carSpec(id, player.up); setCarModel(id); setText('carname', CARS[id].name); if (window.__netReady) sendCar(); }
window.__chooseCar = chooseCar;
function respawn(s, keepSpeed) {
  const p = roadAt(s), c = newCar(p.x, p.z, Math.atan2(p.tx, p.tz)); if (keepSpeed && player.st) { c.u = player.st.u; } player.st = c; camS.yaw = c.yaw; if (window.__resetFx) window.__resetFx();
}
const camS = { mode: 0, yaw: 0, orbitYaw: 0, orbitPitch: 0, drag: false, fov: 62 };
chooseCar(DEFAULT_CAR); respawn(nearS0(-560, 868));
function nearS0(x, z) { return roadQuery(x, z, 1e4).s; }

// ---- input
const keys = {}, inp = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false }; let steerRaw = 0;
const SPOTS = { 1: ['BEACH', -560, 868], 2: ['CITY', 1100, 380], 3: ['MOUNTAIN', 500, -640], 4: ['OVERLOOK', -100, -1070] };
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
  if (e.code === 'KeyC') camS.mode = (camS.mode + 1) % 4;
  if (e.code === 'KeyH') help.toggle(); if (e.code === 'KeyU') hud.toggleUnits(); if (e.code === 'F2') { e.preventDefault(); settings.assists = !settings.assists; localStorage.setItem('assists', settings.assists ? 'arcade' : 'sim'); UI.toast(settings.assists ? 'Assists: ARCADE (ABS, TCS, counter-steer)' : 'Assists: SIMULATION (all off)', 'blue'); }
  if (e.code === 'F3') { e.preventDefault(); dbg.toggle(); } if (e.code === 'F4') { e.preventDefault(); applyQuality(settings.quality === 'high' ? 'medium' : settings.quality === 'medium' ? 'low' : 'high', true); }
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
  inp.handbrake = !!keys.Space; inp.nitro = !!(keys.ShiftLeft || keys.ShiftRight); inp.abs = inp.tcs = inp.assist = settings.assists; readPad();
  if (race.id && race.state === 'countdown') { inp.throttle = 0; inp.brake = 0; inp.handbrake = true; }               // hold the car on the grid
}

// ---- skid marks: one continuous soft-edged ribbon per wheel (ring buffer of quads), tread texture, alpha by slip intensity, slow fade
const SK = 4000, skPos = new Float32Array(SK * 4 * 3).fill(-1e5), skUv = new Float32Array(SK * 4 * 2), skInfo = new Float32Array(SK * 4 * 2), skIdx = new Uint32Array(SK * 6); for (let i = 0; i < SK; i++) skIdx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
const skGeo = new THREE.BufferGeometry(); skGeo.setAttribute('position', new THREE.BufferAttribute(skPos, 3)); skGeo.setAttribute('uv', new THREE.BufferAttribute(skUv, 2)); skGeo.setAttribute('aInfo', new THREE.BufferAttribute(skInfo, 2)); skGeo.setIndex(new THREE.BufferAttribute(skIdx, 1));
const treadTex = canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(6, y, w - 12, 3); } for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .35})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } });
const skMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, uniforms: { uT: { value: 0 }, tex: { value: treadTex } },
  vertexShader: 'attribute vec2 aInfo; varying vec2 vUv; varying vec2 vInfo; void main(){ vUv=uv; vInfo=aInfo; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform float uT; uniform sampler2D tex; varying vec2 vUv; varying vec2 vInfo; void main(){ float age=uT-vInfo.y; float fade=1.-smoothstep(30.,80.,age); float edge=smoothstep(0.,.28,vUv.x)*smoothstep(1.,.72,vUv.x); float tr=texture2D(tex,vUv).r; float a=edge*vInfo.x*fade*(.5+.5*tr)*.85; if(a<.01) discard; gl_FragColor=vec4(vec3(.025),a); }' });
const skMesh = new THREE.Mesh(skGeo, skMat); skMesh.frustumCulled = false; skMesh.renderOrder = 2; scene.add(skMesh);
let skN = 0; const skLast = [null, null, null, null];
function skidTo(k, x, z, y, on, inten = 1) {
  if (!on) { skLast[k] = null; return; }
  const l = skLast[k]; if (!l) { skLast[k] = { x, z, y, len: 0, nx: 0, nz: 0, i: 0, has: false }; return; }
  const dx = x - l.x, dz = z - l.z, d = Math.hypot(dx, dz); if (d < 0.2) return; if (d > 6) { skLast[k] = { x, z, y, len: 0, nx: 0, nz: 0, i: 0, has: false }; return; }
  const nx = -dz / d * 0.15, nz = dx / d * 0.15, px = l.has ? l.nx : nx, pz = l.has ? l.nz : nz, q = skN % SK, o = q * 12, u = q * 8, L0 = l.len / 0.55, L1 = (l.len + d) / 0.55; skN++;
  skPos.set([l.x - px, l.y + 0.035, l.z - pz, l.x + px, l.y + 0.035, l.z + pz, x - nx, y + 0.035, z - nz, x + nx, y + 0.035, z + nz], o);
  skUv.set([0, L0, 1, L0, 0, L1, 1, L1], u); skInfo.set([l.i, t, l.i, t, inten, t, inten, t], u);
  skGeo.attributes.position.needsUpdate = skGeo.attributes.uv.needsUpdate = skGeo.attributes.aInfo.needsUpdate = true; skLast[k] = { x, z, y, len: l.len + d, nx, nz, i: inten, has: true };
}
// ---- effects: soft particles (smoke / dust / spray), grains, sparks, ruts - see fx.js. All emitters are fed from the per-wheel physics.
const FX = createFx({ scene, camera, groundAt, sun, sea: W.SEA || 0 }), carFxState = makeCarFx(FX);
window.__resetFx = () => { FX.reset(); carFxState.resetDirt(); };
const dustCol = new THREE.Color(), baseCol = new THREE.Color();
function setDirt(v, col) { baseCol.set(player.cos.paint); dustCol.setRGB(col[0], col[1], col[2]); player.body.traverse(o => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m && m.userData && m.userData.role === 'paint') m.color.copy(baseCol).lerp(dustCol, v * 0.55); }); }); }
function carFx(c, S, dt) {
  contactBlob.position.set(c.x, groundAt(c.x, c.z) + 0.045, c.z); contactBlob.rotation.y = c.yaw; contactBlob.visible = !c.air || c.y - groundAt(c.x, c.z) < 2;
  carFxState.update(c, S, inp, dt, t, { skidTo, au, rig: player.body.userData.rig, setDirt });
}
function updateFx(dt) { FX.update(dt, t); skMat.uniforms.uT.value = t; }
// F3: force vectors per wheel (green = load, red = longitudinal, blue = lateral), drawn only while the debug panel is open
const dbgV = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false })); dbgV.frustumCulled = false; dbgV.renderOrder = 20; dbgV.visible = false; scene.add(dbgV);
dbgV.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3 * 6), 3)); dbgV.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(4 * 3 * 6), 3));
function updateDbgVectors(c) {
  dbgV.visible = !!(dbg && dbg.isOn()) && !!c.w; if (!dbgV.visible) return; const P = dbgV.geometry.attributes.position.array, C = dbgV.geometry.attributes.color.array; let o = 0;
  const seg = (a, b, col) => { P.set(a, o); P.set(b, o + 3); C.set(col, o); C.set(col, o + 3); o += 6; };
  c.w.forEach(w => { if (!w.hit) { for (let k = 0; k < 3; k++) seg([0, -1e4, 0], [0, -1e4, 0], [0, 0, 0]); return; } const p = [w.cx, w.cy + 0.05, w.cz], k = 1 / 6000;
    seg(p, [p[0] + w.nrm[0] * w.N * k, p[1] + w.nrm[1] * w.N * k, p[2] + w.nrm[2] * w.N * k], [0.2, 1, 0.3]); seg(p, [p[0] + w.Fg[0] * w.Fx * k, p[1] + w.Fg[1] * w.Fx * k, p[2] + w.Fg[2] * w.Fx * k], [1, 0.25, 0.2]); seg(p, [p[0] + w.Lg[0] * w.Fy * k, p[1] + w.Lg[1] * w.Fy * k, p[2] + w.Lg[2] * w.Fy * k], [0.3, 0.5, 1]); });
  dbgV.geometry.attributes.position.needsUpdate = dbgV.geometry.attributes.color.needsUpdate = true;
}
// ---- audio (WebAudio, created on first user gesture): engine model per car (engine-sound.js) + tyre squeal, wind, road noise
let AC = null, au = null, audioMaster = null;
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); const master = AC.createGain(); master.gain.value = 0.55; master.connect(AC.destination); audioMaster = master; au = new EngineSound(AC, master); au.setCar(CARS[player.id].snd); }
  catch (e) { console.warn('audio unavailable', e); AC = null; au = null; }
}
function updateAudio(c, S, t) {
  if (!au || !AC) return; au.setCar(CARS[player.id].snd);
  const thr = inp.throttle || (c.gear < 0 ? inp.brake : 0); let sq = 0; for (const w of c.w) if (w.hit && (w.kind === 'road' || w.kind === 'wood') && (w.slipN || 0) > 0.75) sq = Math.max(sq, Math.min(0.5, ((w.slipN - 0.75) * 0.22) * Math.min(1, (Math.hypot(w.vx || 0, w.vy || 0) + Math.abs(w.sv || 0)) / 6)));   // squeal per wheel, from its own slip
  au.update(c, S, thr, t, sq);
}
// ---- HUD + drift tracker
const drift = { score: 0, combo: 1, t: 0, idle: 0, best: 0 };
function updateDrift(c, dt) {
  const drifting = !c.air && c.kmh > 35 && Math.abs(c.slip) > 12;
  if (drifting) { drift.t += dt; drift.idle = 0; drift.combo = 1 + Math.floor(drift.t / 2); drift.score += dt * c.kmh * 0.2 * Math.min(Math.abs(c.slip), 60) / 30 * drift.combo; }
  else if (drift.score > 0) { drift.idle += dt; if (drift.idle > 1.2) { drift.best = Math.max(drift.best, Math.round(drift.score)); drift.score = 0; drift.t = 0; drift.combo = 1; } }
  setText('drift', drift.score > 1 ? `DRIFT  ${Math.abs(c.slip).toFixed(0)}ֲ°   x${drift.combo}   ${Math.round(drift.score)}` : '');
}
function updateHud(c, S) { hud.draw(c, S, { thr: inp.throttle, assists: settings.assists, boost: S.turbo ? c.boost : 0 }, performance.now()); }

// ---- camera
// modes (C): 0 chase near, 1 chase far, 2 hood, 3 bumper. Fixed-distance follow (chase-cam.js), smoothed heading, drift swing, ground collision, impact shake, look-back (B)
const chase = newChaseState(); let lookBack = 0, rough = 0;
function chaseCamera(c, dt) {
  const m = camS.mode, sp = Math.abs(c.u), slip = Math.atan2(c.v, Math.max(sp, 4));
  const slideSwing = sp > 6 ? Math.max(-0.55, Math.min(0.55, -Math.sign(slip) * Math.max(0, Math.abs(slip) - 0.09) * 0.9)) : 0;   // swing only in a real slide (> 5 degrees): wheelspin wiggle does not move the view
  const cam = chaseStep(chase, { y: c.y, kmh: c.kmh, nitroOn: c.nitroOn }, m, dt);
  const want = c.yaw + slideSwing * (m < 2 ? 1 : 0.2), d = Math.atan2(Math.sin(want - camS.yaw), Math.cos(want - camS.yaw));
  camS.yaw += d * (1 - Math.exp(-(camS.drag ? 0 : (c.u < -1 ? 2.2 : 4.5)) * dt));
  if (!camS.drag) { camS.orbitYaw *= Math.exp(-1.6 * dt); camS.orbitPitch *= Math.exp(-1.6 * dt); }
  lookBack += ((keys.KeyB ? 1 : 0) - lookBack) * (1 - Math.exp(-9 * dt));
  const ang = camS.yaw + camS.orbitYaw + lookBack * Math.PI, fx = Math.sin(ang), fz = Math.cos(ang);
  rough += (((c.kind === 'road' || c.air) ? 0 : Math.min(1, c.kmh / 120)) - rough) * (1 - Math.exp(-4 * dt)); shake *= Math.exp(-3.2 * dt);
  const sh = (shake * 0.4 + rough * 0.012), nx = (Math.sin(t * 61) + Math.sin(t * 37.3)) * 0.5 * sh, ny = (Math.sin(t * 53.1) + Math.cos(t * 29)) * 0.5 * sh;
  if (m >= 2) {                                              // hood / bumper: rigidly attached, slight lag in orientation
    const s0 = Math.sin(c.yaw), c0 = Math.cos(c.yaw), fwd = m === 2 ? 0.45 : 2.05, hgt = m === 2 ? 1.28 : 0.62;
    camera.position.set(c.x + s0 * fwd + nx, c.y + hgt + ny, c.z + c0 * fwd); const ly = camS.yaw + camS.orbitYaw + lookBack * Math.PI; camera.lookAt(camera.position.x + Math.sin(ly) * 30, camera.position.y - 0.1 + camS.orbitPitch * 2, camera.position.z + Math.cos(ly) * 30);
  } else {
    const tx = c.x - fx * cam.dist, tz = c.z - fz * cam.dist, ty = Math.max(cam.y + cam.height + camS.orbitPitch * 6, groundAt(tx, tz) + 0.9);
    // keep the camera out of buildings: march from the car toward the camera and stop short of solid props
    let back = 1;
    for (let k = 1; k <= 8; k++) { const f = k / 8, px = c.x + (tx - c.x) * f, pz = c.z + (tz - c.z) * f, arr = solids.get(sKey(Math.floor(px / 16), Math.floor(pz / 16))); if (!arr) continue; let hit = false; for (const o of arr) { if (o.hw) { if (Math.abs(px - o.x) < o.hw + 0.8 && Math.abs(pz - o.z) < o.hd + 0.8) { hit = true; break; } } } if (hit) { back = Math.max(0.18, f - 0.14); break; } }
    camera.position.set(c.x + (tx - c.x) * back + nx, cam.y + (ty - cam.y) * back + ny, c.z + (tz - c.z) * back);
    const ahead = (3 + cam.ahead) * (1 - lookBack * 2); camera.lookAt(c.x + fx * ahead, cam.y + 1.1, c.z + fz * ahead);
  }
  camS.fov = cam.fov; if (Math.abs(camera.fov - camS.fov) > 0.05) { camera.fov = camS.fov; camera.updateProjectionMatrix(); }
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
const TCOL = [0xf2f2f2, 0xb8bcc2, 0x2a2d33, 0x1f3a5f, 0x8a1f26, 0x5f6b6b, 0xdcdcdc, 0x3b5a3a];            // believable paint colours: whites, silvers, blacks, dark blue / red / green
const trafTypes = makeTrafficTypes(merge).map(t => {
  const body = new THREE.InstancedMesh(t.body, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.45, envMap: envTex, envMapIntensity: 0.7 }), 64), lights = new THREE.InstancedMesh(t.lights, new THREE.MeshBasicMaterial({ vertexColors: true }), 64);
  for (const m of [body, lights]) { m.frustumCulled = false; m.count = 0; scene.add(m); } body.castShadow = true; return { body, lights, n: 0 }; });
const trafCol = new THREE.Color();   // traffic is always on: the server simulates 48 cars for everyone

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
  const first = !profile, selChanged = first || profile.sel !== p.sel || player.id !== p.sel; profile = p; UI.setMoney(p.money); player.cos = p.cos[p.sel]; if (first) UI.setAccount(p.kind);
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
  sock.on('pcar', d => { const r = net.remotes.get(d.id); if (r) { r.car = d.car; r.spec = null; r.cos = d.cos; fillCar(r.body, d.car, d.cos); refreshPlayers(); } });
  sock.on('lb', UI.setLeaderboard); raceEvents(sock);
  sock.on('snap', d => {
    const now = performance.now();
    for (const a of d.p) { const r = net.remotes.get(a[0]); if (!r) continue; r.tgt = { x: a[1], y: a[2], z: a[3], yaw: a[4], u: a[5], v: a[6], r: a[7], p: a[8], rl: a[9], rpm: a[10], g: a[11], sw: a[12], br: a[13], nt: a[14], t: now }; if (!r.pos) r.pos = { x: a[1], y: a[2], z: a[3], yaw: a[4] }; }
    net.traf = d.tr.map(a => { const o = net.traf.find(t => t.i === a[0]); return { i: a[0], s: a[1], dir: a[2], v: a[3], color: a[4], type: a[5], t: now, ds: o ? o.ds : a[1] }; });
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
  if (net.sendT >= 0.05 && net.sock && net.joined && mode === 'drive') { net.sendT = 0; const f = n => Math.round(n * 1000) / 1000; net.sock.volatile.emit('state', { x: f(c.x), y: f(c.y), z: f(c.z), yaw: f(c.yaw), u: f(c.u), v: f(c.v), r: f(c.r), p: f(c.pitch), rl: f(c.roll), rpm: Math.round(c.rpm), g: c.gear, sw: f(c.steer), br: inp.brake > 0.05 ? 1 : 0, nt: c.nitroOn ? 1 : 0 }); }
  // remote players: velocity prediction from the last snapshot + smoothed follow
  net.remotes.forEach(r => {
    if (!r.tgt || !r.pos) { r.root.visible = false; return; } r.root.visible = true;
    const t = r.tgt, age = Math.min(0.25, (now - t.t) / 1000), sy = Math.sin(t.yaw), cy = Math.cos(t.yaw);
    const px = t.x + (t.u * sy + t.v * cy) * age, pz = t.z + (t.u * cy - t.v * sy) * age, pyaw = t.yaw + t.r * age, k = 1 - Math.exp(-12 * dt), P = r.pos;
    if (Math.hypot(px - P.x, pz - P.z) > 40) { P.x = px; P.z = pz; P.y = t.y; P.yaw = pyaw; }
    P.x += (px - P.x) * k; P.z += (pz - P.z) * k; P.y += (t.y - P.y) * k; P.yaw += shortAng(pyaw - P.yaw) * k;
    r.pitch += (-t.p - r.pitch) * k; r.roll += (t.rl - r.roll) * k;
    r.root.position.set(P.x, P.y, P.z); r.root.rotation.y = P.yaw; r.body.rotation.set(r.pitch, 0, r.roll); updateRigRemote(r.body.userData.rig, t.u, t.sw || 0, !!t.br, (t.g | 0) < 0, dt);
    const d = Math.hypot(P.x - c.x, P.z - c.z); r.tag.visible = d < 350; { const f = Math.max(1, d / 40); r.tag.scale.set(4.4 * f, 1.1 * f, 1); }
    if (mode === 'drive' && d < 5.5 && Math.abs(P.y - c.y) < 2 && !garage.open) hitCar(c, player.spec, P.x, P.z, P.yaw, t.u * sy + t.v * cy, t.u * cy - t.v * sy, 1500);
  });
  // traffic: advance server positions by their speed, ease the shown value toward it
  for (const k of trafTypes) k.n = 0;
  for (const T of net.traf) {
    const age = Math.min(0.3, (now - T.t) / 1000), tgt = T.s + T.dir * T.v * age; T.ds += wrapS(tgt - T.ds) * (1 - Math.exp(-14 * dt)); T.ds = (T.ds + W.ROAD_LEN) % W.ROAD_LEN;
    const p = W.roadAt(T.ds, T.dir * 3.1), k = trafTypes[T.type | 0] || trafTypes[0]; if (k.n >= 64) continue;
    dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, Math.atan2(p.tx, p.tz) + (T.dir < 0 ? Math.PI : 0), 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    k.body.setMatrixAt(k.n, dummy.matrix); k.body.setColorAt(k.n, trafCol.setHex(TCOL[T.color % 8])); k.lights.setMatrixAt(k.n, dummy.matrix); k.n++;
    if (mode === 'drive' && !garage.open && Math.abs(p.x - c.x) < 6 && Math.abs(p.z - c.z) < 6 && Math.abs(p.y - c.y) < 2) { const sg = T.dir; hitCar(c, player.spec, p.x, p.z, Math.atan2(p.tx, p.tz) + (sg < 0 ? Math.PI : 0), p.tx * T.v * sg, p.tz * T.v * sg, 1400); }
  }
  for (const k of trafTypes) { k.body.count = k.lights.count = k.n; k.body.instanceMatrix.needsUpdate = k.lights.instanceMatrix.needsUpdate = true; if (k.body.instanceColor) k.body.instanceColor.needsUpdate = true; }
}
// ---- collisions: the car's rectangular hull vs props (circles / boxes) and vs other cars. Impulses act at the contact point (the body spins on off-centre hits), with wall friction.
let shake = 0;
const hullOf = () => { const def = CARS[player.id] || CARS[DEFAULT_CAR], rig = player.body.userData.rig; return { hl: (def.length || 4.4) / 2 - 0.05, hw: (rig ? rig.width : 1.85) / 2 - 0.02 }; };
function satObb(a, b) {                       // a, b: {x,z,fx,fz,hl,hw}. Returns {nx,nz,depth,px,pz}; the normal points from b towards a
  const axes = [[a.fx, a.fz], [-a.fz, a.fx], [b.fx, b.fz], [-b.fz, b.fx]], dx = a.x - b.x, dz = a.z - b.z; let best = null, bi = 0;
  for (let i = 0; i < 4; i++) { const ax = axes[i][0], az = axes[i][1], ra = a.hl * Math.abs(a.fx * ax + a.fz * az) + a.hw * Math.abs(-a.fz * ax + a.fx * az), rb = b.hl * Math.abs(b.fx * ax + b.fz * az) + b.hw * Math.abs(-b.fz * ax + b.fx * az), dd = dx * ax + dz * az, ov = ra + rb - Math.abs(dd);
    if (ov <= 0) return null; if (!best || ov < best.depth) { best = { depth: ov, nx: dd < 0 ? -ax : ax, nz: dd < 0 ? -az : az }; bi = i; } }
  const cor = o => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([s1, s2]) => [o.x + o.fx * o.hl * s1 - o.fz * o.hw * s2, o.z + o.fz * o.hl * s1 + o.fx * o.hw * s2]);
  let bp = null, bv = bi < 2 ? -1e9 : 1e9; if (bi < 2) { for (const q of cor(b)) { const v = q[0] * best.nx + q[1] * best.nz; if (v > bv) { bv = v; bp = q; } } } else { for (const q of cor(a)) { const v = q[0] * best.nx + q[1] * best.nz; if (v < bv) { bv = v; bp = q; } } }
  best.px = bp[0]; best.pz = bp[1]; return best;
}
function circleHull(a, ox, oz, r) {           // circular obstacle vs the hull: closest point on the rectangle
  const dx = ox - a.x, dz = oz - a.z, lf = dx * a.fx + dz * a.fz, ll = dx * -a.fz + dz * a.fx, qf = Math.max(-a.hl, Math.min(a.hl, lf)), ql = Math.max(-a.hw, Math.min(a.hw, ll)), ef = lf - qf, el = ll - ql, d = Math.hypot(ef, el); if (d >= r) return null;
  let nf, nl, depth; if (d > 1e-4) { nf = -ef / d; nl = -el / d; depth = r - d; } else { const df = a.hl - Math.abs(lf), dl2 = a.hw - Math.abs(ll); if (df < dl2) { nf = -Math.sign(lf || 1); nl = 0; depth = df + r; } else { nf = 0; nl = -Math.sign(ll || 1); depth = dl2 + r; } }
  const nx = nf * a.fx + nl * -a.fz, nz = nf * a.fz + nl * a.fx; return { nx, nz, depth, px: a.x + qf * a.fx + ql * -a.fz, pz: a.z + qf * a.fz + ql * a.fx };
}
function crashFx(c, S, ct, vn) {              // feedback for a hit: shake, sound, sparks
  if (vn < 1.5) return; shake = Math.max(shake, Math.min(1, vn / 14)); if (au) au.crash(Math.min(1, vn / 20)); if (FX) FX.sparks(ct.px, c.cy - 0.2, ct.pz, c.F[0] * c.u * 0.3, c.F[2] * c.u * 0.3, Math.min(30, Math.round(vn * 2.2)), Math.min(1, vn / 12)); lastHit = vn;
}
let lastHit = 0;
function resolveHit(c, S, ct, ov, mOther, e, push) {
  const vn = impulseAt(c, S, [ct.px, c.cy - 0.15, ct.pz], [ct.nx, 0, ct.nz], e, 0.4, ov, mOther), d = Math.min(ct.depth, 0.9) * push; pushOut(c, S, ct.nx * d, 0, ct.nz * d); syncVel(c); crashFx(c, S, ct, vn); return vn;
}
const hullPose = (c, h) => { const n = Math.hypot(c.F[0], c.F[2]) || 1; return { x: c.cx, z: c.cz, fx: c.F[0] / n, fz: c.F[2] / n, hl: h.hl, hw: h.hw }; };
function collideProps(c, S, dt) {
  if (c.air || !c.b || c.cy - groundAt(c.cx, c.cz) > 3.2) return; const h = hullOf(), a = hullPose(c, h), cx0 = Math.floor(c.cx / 16), cz0 = Math.floor(c.cz / 16);
  for (let i = cx0 - 1; i <= cx0 + 1; i++) for (let j = cz0 - 1; j <= cz0 + 1; j++) { const arr = solids.get(sKey(i, j)); if (!arr) continue;
    for (const o of arr) { if (Math.abs(o.x - c.cx) > 12 || Math.abs(o.z - c.cz) > 12) continue; const ct = o.hw ? satObb(a, { x: o.x, z: o.z, fx: 0, fz: 1, hl: o.hd, hw: o.hw }) : circleHull(a, o.x, o.z, o.r); if (ct) { resolveHit(c, S, ct, [0, 0, 0], Infinity, 0.22, 1); a.x = c.cx; a.z = c.cz; } } }
}
function hitCar(c, S, x, z, yaw, ovx, ovz, mOther) {      // another car (remote player or traffic): mass-based impulse, only my side reacts
  const h = hullOf(), a = hullPose(c, h), ct = satObb(a, { x, z, fx: Math.sin(yaw), fz: Math.cos(yaw), hl: 2.2, hw: 0.95 }); if (ct) resolveHit(c, S, ct, [ovx, 0, ovz], mOther, 0.3, 0.6);
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
const garage = { open: false, g: null, az: 0.6, el: 0.25, viewId: DEFAULT_CAR, ui: null };
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
  garage.open = true; garage.g = g; garage.az = g.roadYaw + 2.4; garage.el = 0.22; placeCar(c, g.zx, g.zz, g.roadYaw + 0.5); UI.setPrompt('');
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
  placeCar(c, best.zx, best.zz, best.roadYaw); camS.yaw = c.yaw; UI.toast('Teleported to ' + best.name, 'blue');
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
// ---- settings, quality presets, gamepad, positional engine voices for other players + traffic
const settings = { assists: localStorage.getItem('assists') !== 'sim', quality: localStorage.getItem('quality') || 'high' };
const hud = initHud(), help = initHelp(), fxLines = speedLines(); let fpsAvg = 60;
const dbg = initDebug(() => player.st, () => player.spec, () => ({ fps: fpsAvg, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, quality: settings.quality, particles: FX.stats() }));
function applyQuality(q, announce) {
  settings.quality = q; localStorage.setItem('quality', q); FX.setQuality(q); FX.setLight(sun); const dpr = devicePixelRatio || 1;
  renderer.setPixelRatio(q === 'high' ? Math.min(dpr, 2) : q === 'medium' ? Math.min(dpr, 1.5) : 1); renderer.setSize(innerWidth, innerHeight);
  sun.castShadow = q !== 'low'; const size = q === 'high' ? 2048 : 1024; if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  grass.setCap(q === 'high' ? 9000 : q === 'medium' ? 5000 : 1800); scenery.setQuality(q); if (announce) UI.toast('Quality: ' + q.toUpperCase(), 'blue');
}
applyQuality(settings.quality);
let padPrev = [];
function readPad() {
  const gp = (navigator.getGamepads ? [...navigator.getGamepads()] : []).find(g => g && g.connected); if (!gp) { padPrev = []; return null; }
  const b = i => gp.buttons[i] ? gp.buttons[i].value : 0, edge = i => b(i) > 0.5 && !(padPrev[i] > 0.5), ax = gp.axes[0] || 0, dz = 0.12, s = Math.abs(ax) < dz ? 0 : Math.sign(ax) * Math.pow((Math.abs(ax) - dz) / (1 - dz), 1.5);
  if (Math.abs(s) > 0.01) { inp.steer = -s; steerRaw = -s; } if (b(7) > 0.04) inp.throttle = b(7); if (b(6) > 0.04) inp.brake = b(6); if (b(0) > 0.5) inp.handbrake = true; if (b(5) > 0.5 || b(2) > 0.5) inp.nitro = true;
  if (edge(3)) camS.mode = (camS.mode + 1) % 4; if (edge(8) && !race.id) respawn(roadQuery(player.st.x, player.st.z, 1e4).s); padPrev = gp.buttons.map(x => x.value); return gp;
}
let rumbleT = 0;
function rumble(c, gp, now) {
  if (!gp || !gp.vibrationActuator || now - rumbleT < 90) return; rumbleT = now;
  const strong = Math.min(1, shake * 1.3 + (c.locked ? 0.35 : 0) + (c.landed > 6 ? 0.4 : 0)), weak = Math.min(1, (c.kmh > 20 ? c.rearSlip * 0.9 : 0) + (c.kind !== 'road' ? Math.min(0.4, c.kmh / 250) : 0) + (c.absOn ? 0.3 : 0));
  if (strong > 0.05 || weak > 0.05) gp.vibrationActuator.playEffect('dual-rumble', { duration: 100, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
}
const voices = []; let lastCamPos = new THREE.Vector3(), camVel = new THREE.Vector3();
function ensureVoices() { if (voices.length || !AC || !audioMaster) return; for (let i = 0; i < 4; i++) { const pan = AC.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 10; pan.rolloffFactor = 1.5; pan.maxDistance = 400; pan.connect(audioMaster); voices.push({ pan, es: new EngineSound(AC, pan) }); } }
function setPan(pan, x, y, z) { if (pan.positionX) { pan.positionX.value = x; pan.positionY.value = y; pan.positionZ.value = z; } else pan.setPosition(x, y, z); }
function updateVoices(c, dt, tnow) {
  if (!AC || !au) return; ensureVoices(); if (!voices.length) return; const L = AC.listener, cam = camera.position; camVel.copy(cam).sub(lastCamPos).multiplyScalar(1 / Math.max(dt, 1e-3)); lastCamPos.copy(cam); _v.set(0, 0, -1).applyQuaternion(camera.quaternion);
  if (L.positionX) { L.positionX.value = cam.x; L.positionY.value = cam.y; L.positionZ.value = cam.z; L.forwardX.value = _v.x; L.forwardY.value = _v.y; L.forwardZ.value = _v.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
  const now = AC.currentTime, cand = []; net.remotes.forEach(r => { if (r.pos && r.tgt && r.tgt.rpm) { const d = Math.hypot(r.pos.x - cam.x, r.pos.z - cam.z); if (d < 250) cand.push({ d, r }); } }); cand.sort((a, b) => a.d - b.d);
  const dopp = (px, pz, vx, vz) => { const dx = px - cam.x, dz = pz - cam.z, dd = Math.hypot(dx, dz) || 1, vr = ((vx - camVel.x) * dx + (vz - camVel.z) * dz) / dd; return Math.max(0.8, Math.min(1.2, 343 / (343 + vr))); };
  for (let i = 0; i < 3; i++) { const v = voices[i], s = cand[i]; v.es.bus.gain.setTargetAtTime(s ? 1 : 0, now, 0.15); if (!s) continue;
    const r = s.r, t = r.tgt, def = CARS[r.car] || CARS[DEFAULT_CAR]; v.es.setCar(def.snd); r.spec = r.spec && r.specId === r.car ? r.spec : carSpec(r.car); r.specId = r.car; setPan(v.pan, r.pos.x, r.pos.y + 0.8, r.pos.z);
    const vx = t.u * Math.sin(t.yaw), vz = t.u * Math.cos(t.yaw), thr = t.br ? 0 : (t.rpm > (r.lastRpm || 0) + 20 ? 0.9 : 0.3); r.lastRpm = t.rpm;
    v.es.update({ rpm: t.rpm * dopp(r.pos.x, r.pos.z, vx, vz), kmh: Math.abs(t.u) * 3.6, boost: thr, shiftT: 0, lim: false, air: false, kind: 'road', ax: 0, shifts: 0, nitroOn: !!t.nt, gear: t.g, nitro: 0, boostOn: 0 }, r.spec, thr, tnow, 0); }
  let best = null, bd = 1e9; for (const T of net.traf) { const p = W.roadAt(T.ds, T.dir * 3.1), d = Math.hypot(p.x - cam.x, p.z - cam.z); if (d < bd) { bd = d; best = { T, p }; } }
  const v = voices[3]; v.es.bus.gain.setTargetAtTime(best && bd < 140 ? 0.8 : 0, now, 0.2); if (best && bd < 140) { const { T, p } = best; v.es.setCar({ kind: 'i6', cyl: 4, rough: 0.5 }); setPan(v.pan, p.x, p.y + 0.7, p.z);
    const spd = T.v * 3.6, vx = p.tx * T.v * T.dir, vz = p.tz * T.v * T.dir; v.es.update({ rpm: (1100 + T.v * 85) * dopp(p.x, p.z, vx, vz), kmh: spd, boost: 0, shiftT: 0, lim: false, air: false, kind: 'road', ax: 0, shifts: 0, nitroOn: false, gear: 3 }, { redline: 6500 }, 0.35, tnow, 0); }
}// ---- main loop
const clock = new THREE.Clock(), v3 = new THREE.Vector3(); let t = 0;
setText('info', 'H = controls   F2 assists   F3 debug   F4 quality'); void ('W/S gasֲ·brakeֲ·reverse  A/D steer  SPACE handbrake  SHIFT nitro  C camera  mouse-drag orbit  R reset  Z next car  V flip  L leaderboard  M map  T garage  ENTER join race  X leave  1-4 teleport  F fly');
function frame() {
  requestAnimationFrame(frame);                                   // scheduled first so one bad frame can never freeze the game
  const dt = Math.min(clock.getDelta(), 0.05); t += dt;
  const c = player.st, S = player.spec;
  if (mode === 'drive') {
    if (garage.open) { freezeCar(c); inp.throttle = inp.brake = 0; stepCar(c, inp, S, 0); } else { readInput(dt); stepCar(c, inp, S, dt); collideProps(c, S, dt); }
    if (c.drowned && !race.id) { UI.toast('Your car was swept away - back on the road', 'blue'); respawn(roadQuery(c.x, c.z, 1e4).s); }
    // the body is a real rigid body: pose comes straight from the physics quaternion (pitch / roll / dive / squat emerge from the suspension)
    player.root.position.set(c.x, c.y, c.z); player.root.quaternion.set(c.mq[0], c.mq[1], c.mq[2], c.mq[3]); player.body.rotation.set(0, 0, 0);
    // FX: tyre marks, smoke, dust, spray - all driven by per-wheel physics
    carFx(c, S, dt); updateDbgVectors(c);
    updateRig(player.body.userData.rig, c, S, inp.brake > 0.05 && c.u > 0.5 || inp.handbrake, dt);
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
  updateFx(dt);
  sky.position.copy(camera.position);
  const fx = mode === 'drive' ? player.root.position : camera.position;
  sun.position.copy(fx).addScaledVector(SUN_DIR, 400); sun.target.position.copy(fx);
  waterNormal.offset.set(t * 0.004, t * 0.002); waterU.uTime.value = t; clouds.position.x = (t * 6) % 600;
  grass.update(camera.position.x, camera.position.z); scenery.update(camera.position, performance.now());
  fpsAvg += (1 / Math.max(dt, 1e-3) - fpsAvg) * 0.05; if (mode === 'drive') { fxLines.draw(settings.quality === 'low' ? 0 : Math.min(1, Math.max(0, (c.kmh - 160) / 140) + (c.nitroOn ? 0.45 : 0))); updateVoices(c, dt, t); rumble(c, navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null, performance.now()); } dbg.update(performance.now());
  renderer.render(scene, camera);
}
const ld = $('load'); if (ld) ld.remove();
frame();
window.__dbg = { solids, scenery, FX,placeCar, respawn, inp, settings, skN: () => skN, styleHolder, fillCar, openGarage, garage, scene, camera, player, W, renderer, keys, get mode() { return mode; }, set mode(v) { mode = v; }, fly, camS };














