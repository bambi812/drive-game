// junctions.js - where roads meet they become one surface: the overlap is paved over with unmarked asphalt (no lines running
// across another road, no gravel strip across a side road's mouth) and the road that has to give way gets a dashed line.
// road: { pts: [{x, y, z}], half, shoulder, closed, rank }   (higher rank = the through road)
import * as THREE from 'three';

const CELL = 32, STEP = 0.4;
function grid(road) {
  const g = new Map(), n = road.pts.length - 1;
  for (let i = 0; i < n; i++) { const a = road.pts[i], b = road.pts[i + 1];
    for (let x = Math.floor((Math.min(a.x, b.x) - 16) / CELL); x <= Math.floor((Math.max(a.x, b.x) + 16) / CELL); x++) for (let z = Math.floor((Math.min(a.z, b.z) - 16) / CELL); z <= Math.floor((Math.max(a.z, b.z) + 16) / CELL); z++) { const k = x * 4096 + z; let l = g.get(k); if (!l) g.set(k, l = []); l.push(i); } }
  return g;
}
// distance from a point to a road's surface line (only beside the road, not past its dead ends), and the road height there
function near(road, g, x, z, skipFrom = -1) {
  const list = g.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL)); let d = 1e9, y = 0;
  if (!list) return { d, y };
  const last = road.pts.length - 2;
  for (const i of list) { if (skipFrom >= 0 && Math.abs(i - skipFrom) < 12) continue;
    const a = road.pts[i], b = road.pts[i + 1], ex = b.x - a.x, ez = b.z - a.z, len2 = ex * ex + ez * ez || 1; let t = ((x - a.x) * ex + (z - a.z) * ez) / len2;
    if (!road.closed && ((i === 0 && t < -0.05) || (i === last && t > 1.05))) continue;
    t = Math.max(0, Math.min(1, t)); const px = x - a.x - ex * t, pz = z - a.z - ez * t, dd = Math.hypot(px, pz); if (dd < d) { d = dd; y = a.y + (b.y - a.y) * t + ((a.cross || 0) + ((b.cross || 0) - (a.cross || 0)) * t) * ((px * -ez + pz * ex) / Math.sqrt(len2)); } }
  return { d, y };
}
export function buildJunctions({ scene, roads, asphalt, paint }) {
  const grids = roads.map(grid), pos = [], uv = [], idx = [], lp = [], li = [];
  const quad = (P, I, T, corners) => { const o = P.length / 3; for (const [x, y, z] of corners) { P.push(x, y, z); if (T) T.push(x / 12, z / 16); } I.push(o, o + 1, o + 2, o + 2, o + 1, o + 3); };   // wound to face up
  let count = 0;
  roads.forEach((A, a) => roads.forEach((B, b) => {
    if (a === b) return;
    const gb = grids[b], reachA = A.half + (A.shoulder || 0);
    // pave: strips of A that lie on B (the shoulder of A is included, so it never crosses B)
    for (let i = 0; i + 1 < A.pts.length; i++) {
      const p = A.pts[i], q = A.pts[i + 1]; if (near(B, gb, p.x, p.z).d > A.half + B.half + 4) continue;
      const ex = q.x - p.x, ez = q.z - p.z, len = Math.hypot(ex, ez); if (len < 1e-3) continue; const nx = -ez / len, nz = ex / len, own = (t, l) => p.y + (q.y - p.y) * t + ((p.cross || 0) + ((q.cross || 0) - (p.cross || 0)) * t) * l, rows = Math.max(1, Math.round(len / STEP));
      for (let r = 0; r < rows; r++) {
        const t0 = r / rows, t1 = (r + 1) / rows, tm = (t0 + t1) / 2; let from = null;
        const flush = to => { if (from === null) return; const corner = (t, l) => { const x = p.x + ex * t + nx * l, z = p.z + ez * t + nz * l, h = near(B, gb, x, z); return [x, Math.max(own(t, l), h.d < B.half ? h.y : -1e9) + 0.012, z]; };
          quad(pos, idx, uv, [corner(t0, from), corner(t0, to), corner(t1, from), corner(t1, to)]); from = null; count++; };
        for (let l = -reachA; l <= reachA + 1e-6; l += STEP) { const x = p.x + ex * tm + nx * l, z = p.z + ez * tm + nz * l, h = near(B, gb, x, z);
          const on = h.d <= B.half - 0.15 && Math.abs(h.y - own(tm, l)) < 1.5; if (on && from === null) from = l - STEP / 2; else if (!on) flush(l - STEP / 2); }
        flush(reachA);
      }
    }
    // give way: where the lesser road (A) reaches the edge of the through road (B), a dashed white line across it
    if (A.rank >= B.rank) return;
    let prev = near(B, gb, A.pts[0].x, A.pts[0].z).d, lastLine = -99;
    for (let i = 1; i < A.pts.length; i++) {
      const p = A.pts[i], h = near(B, gb, p.x, p.z), d = h.d, edge = B.half + 1.4;
      // no line inside the junction itself (where three roads meet, another road may cover the spot)
      if ((prev - edge) * (d - edge) < 0 && Math.abs(h.y - p.y) < 1 && i - lastLine > 8 && !roads.some((C, c) => c !== a && c !== b && near(C, grids[c], p.x, p.z).d < C.half + 1)) {
        lastLine = i; const o = A.pts[i - 1], ex = p.x - o.x, ez = p.z - o.z, len = Math.hypot(ex, ez) || 1, fx = ex / len, fz = ez / len, nx = -fz, nz = fx;
        for (let l = -A.half + 0.5; l < A.half - 0.6; l += 1.3) { const c = (s, t) => [p.x + fx * s + nx * t, p.y + 0.03, p.z + fz * s + nz * t]; quad(lp, li, null, [c(-0.22, l), c(-0.22, l + 0.75), c(0.22, l), c(0.22, l + 0.75)]); }
      }
      prev = d;
    }
  }));
  const mesh = (P, I, T, mat) => { if (!I.length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); if (T) g.setAttribute('uv', new THREE.Float32BufferAttribute(T, 2)); g.setIndex(I); g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); };
  mesh(pos, idx, uv, asphalt); mesh(lp, li, null, paint);
  return count;
}