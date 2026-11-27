// tools/prep-car.mjs - clean a downloaded car model before 'gltf-transform optimize' (see README: Add a new car).
// Needs (outside the game's dependencies): npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer
// prep.mjs <in.glb> <out.glb> <lengthMetres> [extraJunkRegex] [triangleBudget] [simplifyError]
// Cleans a downloaded car for the game: drops shadow planes / floors / figures, bakes every transform, turns the car so its long
// axis is z, scales it to the real length, centres it, grounds it on the tyres, and splits the four wheels (tyre, rim, disc...)
// into one mesh per corner so the game's rig can spin and steer them. Heavy models are simplified to a triangle budget.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds, dequantize, transformMesh, compactPrimitive, weld, simplify, prune, dedup } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [IN, OUT, LEN_S, EXTRA, BUDGET_S, ERR_S] = process.argv.slice(2); const LEN = +LEN_S, BUDGET = +BUDGET_S || 200000, SIMPLIFY_ERR = +ERR_S || 0.0015;   // traffic cars: a smaller budget and a looser error
const JUNK = new RegExp('shadow|^SOL|NANA|^material_0$' + (EXTRA ? '|' + EXTRA : ''), 'i');
const doc = await io.read(IN), root = doc.getRoot(); await doc.transform(dequantize());
const scene = root.getDefaultScene() || root.listScenes()[0];
const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
const matName = p => p.getMaterial()?.getName() || '';

// 1. collect mesh nodes with their world matrices, drop junk
const meshNodes = []; scene.traverse(n => { if (n.getMesh()) meshNodes.push(n); });
const B0 = getBounds(scene), L0 = Math.max(B0.max[0] - B0.min[0], B0.max[2] - B0.min[2]);
let dropped = [];
for (const n of meshNodes) {
  const m = n.getMesh(), names = [n.getName(), m.getName(), ...m.listPrimitives().map(matName)].join(' ');
  const b = getBounds(n), sy = b.max[1] - b.min[1], sx = b.max[0] - b.min[0], sz = b.max[2] - b.min[2];
  const flatHuge = sy < 0.01 * L0 && sx > 0.6 * (B0.max[0] - B0.min[0]) && sz > 0.6 * (B0.max[2] - B0.min[2]);
  if (m.listPrimitives().some(p => JUNK.test(matName(p))) || JUNK.test(n.getName()) || flatHuge) { dropped.push(n.getName() + '[' + m.listPrimitives().map(matName) + ']'); n.setMesh(null); }
}
// 2. bake world transforms into fresh, flat nodes
const flat = []; const used = new Map();
for (const n of meshNodes) { let m = n.getMesh(); if (!m) continue; if (used.has(m)) m = m.clone(); used.set(m, 1); flat.push({ m, w: n.getWorldMatrix() }); }
for (const f of flat) transformMesh(f.m, f.w);
for (const c of scene.listChildren()) c.dispose();
const carRoot = doc.createNode('car'); scene.addChild(carRoot);
let nodes = flat.map((f, i) => { const n = doc.createNode('part' + i).setMesh(f.m); carRoot.addChild(n); return n; });
// ground shadow planes (flat, at the bottom, covering the whole footprint) would set the length: drop them before scaling
{ const Bb = getBounds(scene), span = [0, 1, 2].map(a => Bb.max[a] - Bb.min[a]);
  for (const n of nodes) { const b = getBounds(n), s = [0, 1, 2].map(a => b.max[a] - b.min[a]);
    if (s[1] < 0.004 * Math.max(span[0], span[2]) && s[0] > 0.8 * span[0] && s[2] > 0.8 * span[2] && b.min[1] - Bb.min[1] < 0.1 * span[1]) { dropped.push('flat:' + n.getMesh().listPrimitives().map(matName)); n.setMesh(null); } } }
nodes = nodes.filter(n => n.getMesh());
// 3. normalise: long axis -> z, scale to real length, centre
let B = getBounds(scene); const rot = (B.max[0] - B.min[0]) > (B.max[2] - B.min[2]);
const R = rot ? [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1] : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
for (const n of nodes) transformMesh(n.getMesh(), R);
B = getBounds(scene); const k = LEN / (B.max[2] - B.min[2]);
const S = [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, -k * (B.min[0] + B.max[0]) / 2, -k * B.min[1], -k * (B.min[2] + B.max[2]) / 2, 1];
for (const n of nodes) transformMesh(n.getMesh(), S);
B = getBounds(scene); const W = B.max[0] - B.min[0];
// 4. connected components (welded by position) of every triangle primitive
const comps = [];
for (const n of nodes) if (n.getMesh()) for (const p of n.getMesh().listPrimitives()) {
  if (p.getMode() !== 4) continue; const pos = p.getAttribute('POSITION').getArray(); const nv = pos.length / 3;
  let idx = p.getIndices()?.getArray(); if (!idx) { idx = new Uint32Array(nv); for (let i = 0; i < nv; i++) idx[i] = i; p.setIndices(doc.createAccessor().setType('SCALAR').setArray(idx)); }
  const key = new Map(), rep = new Int32Array(nv); for (let i = 0; i < nv; i++) { const kk = Math.round(pos[i * 3] * 2e4) + ',' + Math.round(pos[i * 3 + 1] * 2e4) + ',' + Math.round(pos[i * 3 + 2] * 2e4); let r = key.get(kk); if (r === undefined) { r = i; key.set(kk, r); } rep[i] = r; }
  const par = new Int32Array(nv).map((_, i) => i), find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let t = 0; t < idx.length; t += 3) { const a = find(rep[idx[t]]), b = find(rep[idx[t + 1]]), c = find(rep[idx[t + 2]]); par[b] = a; par[find(c)] = a; }
  const byRoot = new Map();
  for (let t = 0; t < idx.length; t += 3) { const r = find(rep[idx[t]]); let c = byRoot.get(r); if (!c) { c = { p, tris: [], min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9], mat: matName(p) }; byRoot.set(r, c); comps.push(c); }
    c.tris.push(t); for (let j = 0; j < 3; j++) { const v = idx[t + j]; for (let a = 0; a < 3; a++) { const x = pos[v * 3 + a]; if (x < c.min[a]) c.min[a] = x; if (x > c.max[a]) c.max[a] = x; } } }
}
for (const c of comps) { c.s = [0, 1, 2].map(a => c.max[a] - c.min[a]); c.c = [0, 1, 2].map(a => (c.max[a] + c.min[a]) / 2); }
// 5. find the tyre of each corner: the biggest round, low, outboard component
const q = c => (c.c[0] > 0 ? 'L' : 'R') + (c.c[2] > 0 ? 'F' : 'B');
const wheel = {};
for (const c of comps) { const [sx, sy, sz] = c.s;
  if (sy > 0.42 && sy < 1.05 && Math.abs(sy - sz) < 0.12 * sy && sx > 0.07 && sx < 0.55 && c.c[1] < 0.65 && Math.abs(c.c[0]) > W * 0.22 && Math.abs(c.c[2]) > LEN * 0.14) {
    const k2 = q(c); if (!wheel[k2] || sy > wheel[k2].s[1] + 0.01 || (Math.abs(sy - wheel[k2].s[1]) <= 0.01 && c.tris.length > wheel[k2].tris.length)) wheel[k2] = c; } }
// 6. every component that fits inside a wheel's cylinder joins that wheel (callipers stay on the body: they do not spin)
const parts = { LF: [], RF: [], LB: [], RB: [] };
for (const c of comps) { if (/calip/i.test(c.mat)) continue; const w = wheel[q(c)]; if (!w) continue; const r = w.s[1] / 2 * 1.06, hw = w.s[0] / 2 + 0.09;
  if (Math.abs(c.c[1] - w.c[1]) + c.s[1] / 2 <= r && Math.abs(c.c[2] - w.c[2]) + c.s[2] / 2 <= r && Math.abs(c.c[0] - w.c[0]) + c.s[0] / 2 <= hw) parts[q(c)].push(c); }
const take = new Map();   // prim -> Set of triangle starts moved to a wheel
for (const k2 in parts) { const meshW = doc.createMesh('wheel_' + k2); const byPrim = new Map();
  for (const c of parts[k2]) { let a = byPrim.get(c.p); if (!a) byPrim.set(c.p, a = []); a.push(...c.tris); let s = take.get(c.p); if (!s) take.set(c.p, s = new Set()); c.tris.forEach(t => s.add(t)); }
  for (const [p, tris] of byPrim) { const idx = p.getIndices().getArray(), ni = new Uint32Array(tris.length * 3); tris.forEach((t, i) => { ni[i * 3] = idx[t]; ni[i * 3 + 1] = idx[t + 1]; ni[i * 3 + 2] = idx[t + 2]; });
    const np = p.clone(); np.setIndices(doc.createAccessor().setType('SCALAR').setArray(ni)); meshW.addPrimitive(np); }
  if (meshW.listPrimitives().length) carRoot.addChild(doc.createNode('wheel_' + k2).setMesh(meshW)); }
for (const [p, set] of take) { const idx = p.getIndices().getArray(), keep = []; for (let t = 0; t < idx.length; t += 3) if (!set.has(t)) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  if (keep.length) p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep))); else for (const m of p.listParents()) if (m.propertyType === 'Mesh') m.removePrimitive(p); }
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) compactPrimitive(p);
// 7. ground on the tyres
const tyreBottom = Math.min(...Object.values(wheel).map(w => w.min[1]));
if (isFinite(tyreBottom)) for (const m of root.listMeshes()) transformMesh(m, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -tyreBottom, 0, 1]);
// 8. simplify heavy models
const triCount = () => root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((s2, p) => s2 + (p.getIndices()?.getCount() || 0) / 3, 0), 0);
const before = triCount();
if (before > BUDGET) await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: BUDGET / before, error: SIMPLIFY_ERR, lockBorder: false }));
await doc.transform(dedup(), prune());
// report: size, wheels, nose direction hint (tail-light material centroid behind the centre = nose is +z)
B = getBounds(scene); const lamp = (re) => { let s = 0, n = 0; for (const c of comps) if (re.test(c.mat)) { s += c.c[2] * c.tris.length; n += c.tris.length; } return n ? s / n : NaN; };
const tail = lamp(/tail|rear.?light|brake.?l|stop|rearlight|feu/i), head = lamp(/head/i);
console.log(JSON.stringify({ file: IN.split(/[\\/]/).pop(), size: [0, 1, 2].map(a => +(B.max[a] - B.min[a]).toFixed(2)), minY: +B.min[1].toFixed(3), rotated: rot,
  wheels: Object.fromEntries(Object.entries(wheel).map(([k2, w]) => [k2, { r: +(w.s[1] / 2).toFixed(3), x: +w.c[0].toFixed(2), z: +w.c[2].toFixed(2), parts: parts[k2].length }])),
  noseHint: isNaN(tail) && isNaN(head) ? '?' : ((!isNaN(tail) ? tail < 0 : head > 0) ? '+z ok' : 'BACKWARDS (yaw PI)'), tris: [Math.round(before / 1000) + 'k', Math.round(triCount() / 1000) + 'k'], dropped }));
await io.write(OUT, doc);
