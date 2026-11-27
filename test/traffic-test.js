// Side-road traffic: busy in town, sparse in the mountains, on the road, and no two cars on top of each other.
// Run: node test/traffic-test.js
import * as W from '../public/world.js';
import { createLocalTraffic } from '../public/local-traffic.js';
let fail = 0; const ck = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fail++; };

const T = createLocalTraffic(), far = { x: 1e7, z: 1e7 };
const around = (x, z, amount = 1) => { const out = []; T.update(1000, 0.016, { x, z }, far, 300, amount, (c, p) => out.push({ x: p.x, y: p.y, z: p.z })); return out; };
const city = around(30, -330), shops = around(40, 660), peaks = around(-1200, -3100), high = around(4300, -2400), none = around(30, -330, 0);
ck(city.length >= 20, `downtown is busy (${city.length} cars within 300 m)`);
ck(shops.length >= 20, `shopping district is busy (${shops.length})`);
ck(peaks.length <= city.length / 4 && high.length <= city.length / 4, `mountains are quiet (${peaks.length} snow, ${high.length} highlands)`);
ck(none.length === 0, 'traffic amount 0 shows nothing');
ck(around(30, -330).length === city.length, 'same time gives the same cars');
ck(city.concat(shops, peaks).every(p => W.sideQuery(p.x, p.z, 8).d <= 4), 'every car is on a road');
let close = 0; for (const lane of T.lanes) { const pos = lane.cars.map(c => c.o).sort((a, b) => a - b); for (let i = 1; i < pos.length; i++) if (pos[i] - pos[i - 1] < 6) close++; }
ck(close === 0, 'cars on the same road keep their distance');
// a car stops for a player standing in front of it
let first = null; T.update(1000, 0.016, { x: 30, z: -330 }, far, 200, 1, (c, p) => { first ||= { c, x: p.x, z: p.z, fx: p.fx, fz: p.fz }; });
const me = { x: first.x + first.fx * 7, z: first.z + first.fz * 7 }; let moved = null;
for (let i = 1; i <= 120; i++) T.update(1000 + i / 60, 1 / 60, { x: 30, z: -330 }, me, 200, 1, (c, p) => { if (c === first.c) moved = Math.hypot(p.x - first.x, p.z - first.z); });
ck(moved !== null && moved < 2.5, `a car waits behind the player (moved ${moved?.toFixed(1)} m in 2 s)`);
console.log(fail ? 'FAIL' : 'PASS'); process.exit(fail ? 1 : 0);
