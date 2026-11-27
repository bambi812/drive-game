// traffic-real.js - real everyday cars for the AI traffic (free CC-BY Sketchfab models, cleaned by tools/prep-car.mjs: real length,
// grounded on the tyres, front = +z, wheels split into wheel_LF/RF/LB/RB). Each model is turned into a few InstancedMeshes:
//  - the body paint (tinted per car, so the same model shows up in different colours),
//  - one mesh per textured material, and one merged mesh for every plain material (vertex colours) and one for the glass,
// so a model costs a handful of draw calls however many copies are on the road. Wheels spin in the vertex shader (per-instance angle).
// Models load only when a traffic car using them comes near; until then (and far away) the caller draws its simple procedural shapes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// id, real length (m), how often it appears (relative), yaw = model faces backwards
export const TRAFFIC_MODELS = [
  // kei cars, kei vans, kei trucks (Japan)
  ['kei', 3.4, 1.2], ['minicab', 3.4, 1.0], ['keivan', 3.4, 0.8], ['hijet', 3.4, 1.0], ['carry', 3.4, 1.0], ['keitruck', 3.4, 0.8],
  // hatchbacks
  ['fit3', 3.99, 1.4], ['cube', 3.89, 1.0], ['golf5', 4.22, 1.0, Math.PI], ['golf8', 4.28, 1.0, Math.PI], ['p206', 3.84, 0.8], ['punto', 3.76, 0.7], ['civic', 4.07, 0.8],
  // sedans and a wagon
  ['mazda6', 4.87, 1.2], ['octavia', 4.7, 1.0], ['logan', 4.25, 0.7], ['logan2', 4.29, 0.7, Math.PI], ['tesla3', 4.69, 1.0], ['crownvic', 5.39, 0.6], ['caprice', 5.5, 0.4, Math.PI],
  // SUVs and minivans
  ['tucson', 4.47, 1.2], ['ioniq5', 4.64, 0.9], ['gsuv', 4.6, 0.8], ['vellfire', 4.94, 1.2],
  // vans and trucks
  ['sprinter', 5.91, 0.7], ['daily', 5.57, 0.5], ['ducato', 5.41, 0.6], ['econo', 5.4, 0.4], ['tnvan', 5.2, 0.4], ['boxtruck', 7.5, 0.5], ['garbage', 8.0, 0.25],
  // buses and service cars
  ['erga', 9.0, 0.45], ['townbus', 10.5, 0.3], ['taxi1', 5.39, 0.5], ['police', 4.67, 0.3], ['ambulance', 6.2, 0.25],
].map(([id, len, w, yaw = 0]) => ({ id, len, w, yaw }));

const CAP = 12;                                    // max copies of one model drawn at once
const cum = []; { let s = 0; for (const m of TRAFFIC_MODELS) { s += m.w; cum.push(s); } }
// a stable model for each traffic car: same car number -> same model on every client
export function modelFor(i) { const h = (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296 * cum[cum.length - 1]; let k = 0; while (cum[k] < h) k++; return k; }

const wheelShader = shader => {                    // spin the wheel vertices about their axle (x axis through aWheel.xy = y, z of the centre)
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aWheel;\nattribute float iSpin;')
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nfloat wC = 1.0, wS = 0.0; if (aWheel.z > 0.5) { wC = cos(iSpin); wS = sin(iSpin); objectNormal = vec3(objectNormal.x, wC * objectNormal.y - wS * objectNormal.z, wS * objectNormal.y + wC * objectNormal.z); }')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (aWheel.z > 0.5) { vec3 wp = transformed - vec3(0.0, aWheel.x, aWheel.y); transformed = vec3(wp.x, wC * wp.y - wS * wp.z, wS * wp.y + wC * wp.z) + vec3(0.0, aWheel.x, aWheel.y); }');
};
const lum = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
// meshopt files store quantised (normalised integer) attributes: turn them into plain floats before moving the vertices
function toFloat(g) {
  for (const k of Object.keys(g.attributes)) { const a = g.attributes[k]; if (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute) continue;
    const n = a.count, s = a.itemSize, f = new Float32Array(n * s); for (let i = 0; i < n; i++) for (let j = 0; j < s; j++) f[i * s + j] = a.getComponent ? a.getComponent(i, j) : [a.getX(i), a.getY(i), a.getZ(i), a.getW(i)][j];
    g.setAttribute(k, new THREE.BufferAttribute(f, s)); }
  return g;
}

// turn one loaded model into instanced groups
function build(gltfScene, def, envTex) {
  gltfScene.updateMatrixWorld(true);
  const parts = [];                                // { geo, mat, wheel: [cy, cz] | null, area }
  gltfScene.traverse(o => {
    if (!o.isMesh) return; let w = null;
    for (let p = o; p; p = p.parent) if (/^wheel_(LF|RF|LB|RB)/.test(p.name || '')) { const b = new THREE.Box3().setFromObject(p), c = b.getCenter(new THREE.Vector3()); w = [c.y, c.z]; break; }
    const mats = Array.isArray(o.material) ? o.material : [o.material], g0 = o.geometry;
    const groups = g0.groups.length ? g0.groups : [{ start: 0, count: (g0.index ? g0.index.count : g0.attributes.position.count), materialIndex: 0 }];
    for (const gr of groups) {
      let g = g0.clone(); if (g0.groups.length) { const idx = g0.index ? g0.index.array.slice(gr.start, gr.start + gr.count) : null; if (idx) { g.setIndex(new THREE.BufferAttribute(idx, 1)); } g.clearGroups(); }
      toFloat(g); g.applyMatrix4(o.matrixWorld); g = g.index ? g.toNonIndexed() : g;
      const p = g.attributes.position; let area = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); area += b.sub(a).cross(c.sub(a)).length() / 2; }
      parts.push({ geo: g, mat: mats[gr.materialIndex] || mats[0], wheel: w, area });
    }
  });
  // the paint: the plain (untextured), opaque, coloured, non-chrome body material with the most surface
  const byMat = new Map(), onWheel = new Set(); let bodyArea = 0; for (const pt of parts) { if (pt.wheel) { onWheel.add(pt.mat); continue; } bodyArea += pt.area; byMat.set(pt.mat, (byMat.get(pt.mat) || 0) + pt.area); }
  let paint = null, best = 0;
  for (const [m, ar] of byMat) { if (onWheel.has(m) || ar < 0.2 * bodyArea || m.map || (m.opacity ?? 1) < 0.95 || !m.color) continue; if (lum(m.color) < 0.03 || (m.metalness > 0.85 && Math.abs(m.color.r - m.color.b) < 0.05 && lum(m.color) > 0.5)) continue; if (ar > best) { best = ar; paint = m; } }
  // groups: 'paint', 'glass', 'plain' (vertex colours) and one per textured material
  const G = new Map(), keyOf = m => m === paint ? 'paint' : ((m.opacity ?? 1) < 0.95 || (m.transmission > 0 && /glass|window|wind|lens|scheibe|vitre|cristal/i.test(m.name || ''))) ? 'glass' : m.map ? 'tex:' + m.uuid : 'plain';
  for (const pt of parts) { const k = keyOf(pt.mat); if (!G.has(k)) G.set(k, { mat: pt.mat, geos: [] }); G.get(k).geos.push(pt); }
  const out = [];
  for (const [k, { mat, geos }] of G) {
    const textured = k.startsWith('tex:');
    const list = geos.map(({ geo, mat: m, wheel }) => {
      const n = geo.attributes.position.count, g = new THREE.BufferGeometry();
      g.setAttribute('position', geo.attributes.position); if (geo.attributes.normal) g.setAttribute('normal', geo.attributes.normal);
      if (textured) g.setAttribute('uv', geo.attributes.uv || new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      if (k === 'plain' || k === 'glass') { const col = new Float32Array(n * 3), cc = (m.color || new THREE.Color(1, 1, 1)).clone(); for (let i = 0; i < n; i++) { col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
      const aw = new Float32Array(n * 4); if (wheel) for (let i = 0; i < n; i++) { aw[i * 4] = wheel[0]; aw[i * 4 + 1] = wheel[1]; aw[i * 4 + 2] = 1; } g.setAttribute('aWheel', new THREE.BufferAttribute(aw, 4));
      if (!g.attributes.normal) g.computeVertexNormals(); return g; });
    const geo = mergeGeometries(list); if (!geo) continue;
    let m2;
    if (k === 'paint') m2 = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.45, envMap: envTex, envMapIntensity: 0.8 });
    else if (k === 'glass') m2 = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55, depthWrite: false, envMap: envTex, envMapIntensity: 1 });
    else if (k === 'plain') m2 = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3, envMap: envTex, envMapIntensity: 0.6 });
    else { m2 = mat.clone(); m2.envMap = envTex; m2.envMapIntensity = 0.7; if (m2.transmission) m2.transmission = 0; if (m2.transparent) { m2.transparent = false; m2.alphaTest = 0; m2.depthWrite = true; } }   // body parts flagged 'blend' / transmission by the exporter: drawn solid (no see-through bodies)
    m2.onBeforeCompile = wheelShader; m2.customProgramCacheKey = () => 'trafficWheel';
    const spin = new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1); spin.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('iSpin', spin);
    const im = new THREE.InstancedMesh(geo, m2, CAP); im.count = 0; im.frustumCulled = false; im.castShadow = k !== 'glass'; im.receiveShadow = false; im.visible = false;
    if (k === 'paint') im.setColorAt(0, new THREE.Color(1, 1, 1));
    out.push({ im, spin, paint: k === 'paint' });
  }
  return { meshes: out, wheelR: 0.33, n: 0 };
}

export function createRealTraffic({ scene, loader, envTex }) {
  const models = TRAFFIC_MODELS.map(def => ({ def, state: 0, built: null }));    // state 0 = not asked, 1 = loading, 2 = ready, 3 = failed
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), _c = new THREE.Color(), UPV = new THREE.Vector3(0, 1, 0);
  function ensure(k) {
    const M = models[k]; if (M.state) return M.state === 2;
    M.state = 1; loader.load(`models/traffic/${M.def.id}.glb`, g => { try { M.built = build(g.scene, M.def, envTex); for (const x of M.built.meshes) scene.add(x.im); M.state = 2; } catch (e) { console.warn('traffic model failed', M.def.id, e); M.state = 3; } }, undefined, () => { M.state = 3; });
    return false;
  }
  return {
    count: TRAFFIC_MODELS.length, modelFor,
    begin() { for (const M of models) if (M.built) M.built.n = 0; },
    // draw one car: returns false if its model is not ready yet (the caller draws the simple shape instead)
    add(k, x, y, z, yaw, colorHex, spinAngle) {
      const M = models[k]; if (!ensure(k)) return false; const B = M.built; if (B.n >= CAP) return false;
      _p.set(x, y, z); _q.setFromAxisAngle(UPV, yaw + M.def.yaw); _m.compose(_p, _q, _s); _c.setHex(colorHex);
      for (const x2 of B.meshes) { x2.im.setMatrixAt(B.n, _m); x2.spin.array[B.n] = spinAngle; if (x2.paint) x2.im.setColorAt(B.n, _c); }
      B.n++; return true;
    },
    end() {
      for (const M of models) { const B = M.built; if (!B) continue;
        for (const x of B.meshes) { x.im.count = B.n; x.im.visible = B.n > 0; if (B.n) { x.im.instanceMatrix.needsUpdate = true; x.spin.needsUpdate = true; if (x.im.instanceColor) x.im.instanceColor.needsUpdate = true; } } }
    },
  };
}
