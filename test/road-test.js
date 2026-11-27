// Drives the whole loop and checks road/terrain quality. Run: node test/road-test.js
import { ROAD, terrainH, terrainSlope, TERRAIN, NX, NZ, CELL, ROAD_HALF, CORRIDOR, SIDE_ROADS, roadQuery, carve } from '../public/world.js';
// side roads: gentle enough to drive, ground never pokes through them
let sideOk = true;
{ let grade = 0, above = -9, len = 0;
  for (const pts of SIDE_ROADS) { len += pts[pts.length - 1].s; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; grade = Math.max(grade, Math.abs(b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z)); for (const lat of [-4, 0, 4]) { const x = b.x - b.tz * lat, z = b.z + b.tx * lat; if (roadQuery(x, z, 12).d > 9) above = Math.max(above, terrainH(x, z) - b.y - (b.cross || 0) * lat); } } }
  console.log(`side roads       : ${(len / 1000).toFixed(1)} km, max grade ${(grade * 100).toFixed(1)} %, ground above road max ${above.toFixed(2)} m`);
  if (grade > 0.125 || above > 0.25) { console.log('FAIL: side roads'); sideOk = false; } }
const t0 = Date.now(); const { N, ds, Y, TX, TZ, L } = ROAD;
let maxGrade = 0, minR = Infinity, worstAbove = -Infinity, maxSlope = 0, maxJump = 0;
for (let i = 0; i < N; i++) {
  const k = 5; maxGrade = Math.max(maxGrade, Math.abs(Y[(i + k) % N] - Y[(i - k + N) % N]) / (2 * k * ds));
  const a = Math.atan2(TZ[(i - k + N) % N], TX[(i - k + N) % N]), b = Math.atan2(TZ[(i + k) % N], TX[(i + k) % N]);
  let dth = Math.abs(b - a); if (dth > Math.PI) dth = 2 * Math.PI - dth; if (dth > 1e-4) minR = Math.min(minR, 2 * k * ds / dth);
  const nx = -TZ[i], nz = TX[i], px = ROAD.X[i], pz = ROAD.Z[i], y = Y[i];
  const bridge = carve(px, pz) > 0.3 || carve(px + nx * 40, pz + nz * 40) > 0.3 || carve(px - nx * 40, pz - nz * 40) > 0.3;
  for (let lat = -(ROAD_HALF + 2); lat <= ROAD_HALF + 2; lat += 1) worstAbove = Math.max(worstAbove, terrainH(px + nx * lat, pz + nz * lat) - y);
  if (!bridge) for (let lat = ROAD_HALF + 2; lat <= 40; lat += 2) for (const sg of [-1, 1]) maxSlope = Math.max(maxSlope, terrainSlope(px + nx * lat * sg, pz + nz * lat * sg));
}
// slope jump across cell borders (gradient change between neighbouring cells) near the road
for (let j = 1; j < NZ - 1; j++) for (let i = 1; i < NX - 1; i++) { const o = i + j * NX; if (TERRAIN.D[o] > 40 || carve(-3000 + i * CELL, -2500 + j * CELL) > 0.01) continue;                 // canyon and river walls are meant to be steep
  maxJump = Math.max(maxJump, Math.abs(TERRAIN.H[o + 1] - 2 * TERRAIN.H[o] + TERRAIN.H[o - 1]) / CELL, Math.abs(TERRAIN.H[o + NX] - 2 * TERRAIN.H[o] + TERRAIN.H[o - NX]) / CELL); }
let minH = Infinity, maxH = -Infinity; for (const y of Y) { minH = Math.min(minH, y); maxH = Math.max(maxH, y); }
const r = (v, n = 3) => +v.toFixed(n);
console.log(`loop length      : ${r(L / 1000, 2)} km (${N} samples, elevation ${r(minH, 1)}..${r(maxH, 1)} m)`);
console.log(`max grade        : ${r(maxGrade * 100, 1)} %   (limit 12)`);
console.log(`min turn radius  : ${r(minR, 1)} m   (limit 30)`);
console.log(`terrain-road max : ${r(worstAbove)} m   (must be < 0.35, across road + 2 m shoulders)`);
console.log(`max slope 8-40 m : ${r(maxSlope)}   (rise/run beside road)`);
console.log(`max slope jump   : ${r(maxJump)}   (gradient change per cell, within 40 m of road)`);
console.log(`built in ${Date.now() - t0} ms`);
const ok = sideOk && maxGrade <= 0.12 && minR >= 30 && worstAbove < 0.35 && maxJump < 1.7 && maxSlope < 1.7;   // mountain passes: rock banks beside hairpins are expected
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
