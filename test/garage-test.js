// Garage placement check: flat ground under each garage + drive-in zone, building clear of the road. Run: node test/garage-test.js
import { GARAGES, terrainH, roadQuery, ROAD_HALF, CORRIDOR } from '../public/world.js';
let fail = 0;
for (const g of GARAGES) {
  let lo = 1e9, hi = -1e9; const c = Math.cos(g.yaw), s = Math.sin(g.yaw);
  for (let a = -9; a <= 9; a += 1.5) for (let b = -7; b <= 7; b += 1.5) { const h = terrainH(g.bx + c * a + s * b, g.bz - s * a + c * b); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  let zlo = 1e9, zhi = -1e9; for (let a = 0; a < 6.3; a += 0.5) for (const r of [0, 4, 7]) { const h = terrainH(g.zx + Math.cos(a) * r, g.zz + Math.sin(a) * r); zlo = Math.min(zlo, h); zhi = Math.max(zhi, h); }
  const d = roadQuery(g.bx, g.bz, 100).d, dz = roadQuery(g.zx, g.zz, 100).d;
  const ok = hi - lo < 0.6 && zhi - zlo < 0.6 && d > 30 && dz > ROAD_HALF + 7 && Math.abs(hi - g.y) < 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${g.name.padEnd(16)} building ground spread ${(hi - lo).toFixed(2)} m, zone spread ${(zhi - zlo).toFixed(2)} m, building ${d.toFixed(0)} m / zone ${dz.toFixed(0)} m from road, road-level offset ${(hi - g.y).toFixed(2)}`);
  if (!ok) fail++;
}
console.log(fail ? `FAIL (${fail})` : 'PASS'); process.exit(fail ? 1 : 0);
