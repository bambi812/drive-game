// Navigation: every teleport spot / point of interest is reachable by road, routes are sensible, guidance advances.
// Run: node test/nav-test.js
import * as W from '../public/world.js';
import { buildGraph, findRoute, guide } from '../public/nav.js';
let fail = 0; const ck = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fail++; };
const g = buildGraph(W);
const seen = new Uint8Array(g.nodes.length), stack = [0]; seen[0] = 1; while (stack.length) for (const [j] of g.adj[stack.pop()]) if (!seen[j]) { seen[j] = 1; stack.push(j); }
const lost = new Set(g.nodes.filter((_, i) => !seen[i]).map(n => n.road));
ck(lost.size === 0, `all ${g.nodes.length} road points are connected${lost.size ? ' - cut off: ' + [...lost] : ''}`);
const P = { coast: [-450, 905], village: [-520, 640], lake: [-100, 122], city: [770, 390], eastPass: [1000, -434], top: [-420, -1060], westPass: [-1000, -710] };
let worst = 0;
for (const [a, from] of Object.entries(P)) for (const [b, to] of Object.entries(P)) {
  if (a === b) continue; const r = findRoute(g, { x: from[0], z: from[1] }, { x: to[0], z: to[1] });
  if (!r) { ck(false, `no route ${a} -> ${b}`); continue; } worst = Math.max(worst, r.length / Math.hypot(to[0] - from[0], to[1] - from[1]));
}
ck(worst < 7, `longest detour x${worst.toFixed(1)} of the straight line`);
const r = findRoute(g, { x: -450, z: 905 }, { x: -100, z: 122 });
ck(r.turns.length >= 2 && r.turns.at(-1).type === 'arrive', `coast -> lake: ${(r.length / 1000).toFixed(2)} km, turns: ${r.turns.map(t => t.type).join(' ')}`);
const mid = r.pts[Math.floor(r.pts.length / 2)], gm = guide(r, mid.x, mid.z), start = guide(r, r.pts[0].x, r.pts[0].z);
ck(start.remaining > gm.remaining && gm.off < 1, `guidance advances (${start.remaining.toFixed(0)} m -> ${gm.remaining.toFixed(0)} m left)`);
ck(guide(r, mid.x + 80, mid.z + 80).off > 35, 'leaving the route is detected');
console.log(fail ? `FAIL (${fail})` : 'PASS'); process.exit(fail ? 1 : 0);
