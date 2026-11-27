// nav.js - road navigation: a graph of every road, shortest route (A*), turn-by-turn instructions. Pure math, tested in node.
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function buildGraph(W) {
  const nodes = [], adj = [];
  const node = (x, z, road) => { nodes.push({ x, z, road }); adj.push([]); return nodes.length - 1; };
  const link = (a, b) => { if (a === b || adj[a].some(e => e[0] === b)) return; const d = dist(nodes[a], nodes[b]); adj[a].push([b, d]); adj[b].push([a, d]); };
  const line = (pts, road, closed = false) => { let first = -1, prev = -1; pts.forEach(p => { const n = node(p.x, p.z, road); if (prev >= 0) link(prev, n); else first = n; prev = n; }); if (closed) link(prev, first); };
  const R = W.ROAD, main = []; for (let i = 0; i < R.N; i += 3) main.push({ x: R.X[i], z: R.Z[i] }); line(main, 'main', true);
  W.SIDE_ROADS.forEach((pts, k) => line(pts.filter((p, i) => i % 2 === 0 || i === pts.length - 1), 'side' + k));
  // junctions: nodes of different roads that touch
  const G = 20, grid = new Map(); nodes.forEach((p, i) => { const k = Math.floor(p.x / G) * 4096 + Math.floor(p.z / G); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(i); });
  const best = new Map();      // per (node, other road): only its closest node
  nodes.forEach((p, i) => { const cx = Math.floor(p.x / G), cz = Math.floor(p.z / G);
    for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) for (const j of grid.get(a * 4096 + b) || []) { const q = nodes[j]; if (q.road === p.road) continue; const d = dist(p, q); if (d > 13) continue; const key = i + '|' + q.road, cur = best.get(key); if (!cur || d < cur[1]) best.set(key, [j, d]); } });
  for (const [key, [j]] of best) link(+key.split('|')[0], j);
  return { nodes, adj };
}
export function nearestNode(g, x, z) { let bi = 0, bd = Infinity; for (let i = 0; i < g.nodes.length; i++) { const d = (g.nodes[i].x - x) ** 2 + (g.nodes[i].z - z) ** 2; if (d < bd) { bd = d; bi = i; } } return bi; }

// A* between two world points; returns {pts, junction[], length} or null
export function findRoute(g, from, to) {
  const s = nearestNode(g, from.x, from.z), t = nearestNode(g, to.x, to.z), n = g.nodes.length, cost = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n), heap = [];
  const push = (f, i) => { heap.push([f, i]); let c = heap.length - 1; while (c) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let p = 0; for (;;) { let c = p * 2 + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; p = c; } } return top; };
  cost[s] = 0; push(0, s);
  while (heap.length) { const [, i] = pop(); if (done[i]) continue; done[i] = 1; if (i === t) break; for (const [j, d] of g.adj[i]) { const c = cost[i] + d; if (c < cost[j]) { cost[j] = c; prev[j] = i; push(c + dist(g.nodes[j], g.nodes[t]), j); } } }
  if (!done[t]) return null;
  const ids = []; for (let i = t; i >= 0; i = prev[i]) ids.push(i); ids.reverse();
  const pts = ids.map(i => ({ x: g.nodes[i].x, z: g.nodes[i].z })), at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + dist(pts[i - 1], pts[i]));
  const route = { pts, at, length: at[at.length - 1], to: { x: to.x, z: to.z } };
  route.turns = turnsOf(route, ids.map(i => g.adj[i].length >= 3));
  return route;
}
const along = (r, s) => { let i = 0; while (i < r.pts.length - 2 && r.at[i + 1] < s) i++; const a = r.pts[i], b = r.pts[i + 1] || a, u = Math.max(0, Math.min(1, (s - r.at[i]) / ((r.at[i + 1] - r.at[i]) || 1))); return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u }; };
// a turn is a junction where the route changes heading (positive angle = left, as the car sees it)
function turnsOf(r, junction) {
  const out = [];
  for (let i = 1; i < r.pts.length - 1; i++) {
    if (!junction[i]) continue; const s = r.at[i], a = along(r, s - 30), m = r.pts[i], b = along(r, s + 30);
    const h0 = Math.atan2(m.x - a.x, m.z - a.z), h1 = Math.atan2(b.x - m.x, b.z - m.z), d = Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)) * 180 / Math.PI;
    if (Math.abs(d) < 32) continue;
    const turn = { s, angle: d, type: Math.abs(d) > 135 ? 'uturn' : (d > 0 ? 'left' : 'right') };
    const last = out[out.length - 1]; if (last && s - last.s < 45) { if (Math.abs(d) > Math.abs(last.angle)) out[out.length - 1] = turn; } else out.push(turn);
  }
  out.push({ s: r.length, angle: 0, type: 'arrive' });
  return out;
}
export const TURN_TEXT = { left: 'Turn left', right: 'Turn right', uturn: 'Turn around', arrive: 'Destination' };
// progress along a route for a position: {s, off (distance from the route), next turn, toNext, remaining}
export function guide(r, x, z) {
  let bd = Infinity, bs = 0;
  for (let i = 0; i + 1 < r.pts.length; i++) { const a = r.pts[i], b = r.pts[i + 1], ex = b.x - a.x, ez = b.z - a.z, u = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez || 1))), d = Math.hypot(x - a.x - ex * u, z - a.z - ez * u); if (d < bd) { bd = d; bs = r.at[i] + u * (r.at[i + 1] - r.at[i]); } }
  const next = r.turns.find(t => t.s > bs + 4) || r.turns[r.turns.length - 1];
  return { s: bs, off: bd, next, toNext: Math.max(0, next.s - bs), remaining: Math.max(0, r.length - bs) };
}
