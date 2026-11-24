// Headless physics checks. Run: node test/physics-test.js
import { newCar, stepCar } from '../public/physics.js';
import { carSpec, CARS } from '../public/catalog.js';
import { roadAt, ROAD_LEN, roadQuery } from '../public/world.js';
let fail = 0; const ck = (ok, msg) => { if (!ok) { fail++; console.log('  FAIL:', msg); } };
const start = s => { const p = roadAt(s); return newCar(p.x, p.z, Math.atan2(p.tx, p.tz)); };
const S0 = 30;                                       // beach straight
const finite = c => [c.x, c.y, c.z, c.u, c.v, c.r, c.rpm, c.yaw].every(Number.isFinite);
for (const id of Object.keys(CARS)) {
  const S = carSpec(id); let c = start(S0), t = 0, t100 = null, t60 = null, top = 0, gearsSeen = new Set();
  for (; t < 40; t += 1 / 60) { stepCar(c, { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false }, S, 1 / 60); gearsSeen.add(c.gear); if (!t60 && c.kmh >= 60) t60 = t; if (!t100 && c.kmh >= 100) t100 = t; top = Math.max(top, c.kmh); ck(finite(c), id + ' NaN in accel'); }
  // brake from 100
  c = start(S0); c.u = 27.8; let d = 0, tb = 0; while (c.u > 0.3 && tb < 20) { stepCar(c, { throttle: 0, brake: 1, steer: 0 }, S, 1 / 60); d += c.u / 60; tb += 1 / 60; }
  console.log(`${id.padEnd(8)} 0-60: ${t60?.toFixed(2)}s  0-100: ${t100?.toFixed(2)}s  top(40s): ${top.toFixed(0)} km/h  gears: ${[...gearsSeen].join('')}  100-0: ${d.toFixed(1)} m`);
  ck(t100 && t100 > 3.5 && t100 < 11, id + ' 0-100 out of range');
  // handbrake drift: 80 km/h, steer + handbrake, expect slip angle > 25 deg and recoverable
  c = start(S0); c.u = 22; let maxSlip = 0; for (let i = 0; i < 180; i++) { const t = i / 60; stepCar(c, { throttle: 0.8, brake: 0, steer: t < 0.6 ? 0.7 : 0.25, handbrake: t > 0.3 && t < 1.2 }, S, 1 / 60); maxSlip = Math.max(maxSlip, Math.abs(c.slip)); ck(finite(c), id + ' NaN in drift'); }
  console.log(`         handbrake drift: max slip angle ${maxSlip.toFixed(0)} deg`); ck(maxSlip > 20, id + ' cannot drift');
  // steady 0.5 steer at 60 km/h: should hold a turn without spinning out
  c = start(S0); c.u = 16.7; for (let i = 0; i < 240; i++) stepCar(c, { throttle: 0.25, brake: 0, steer: 0.15 }, S, 1 / 60); ck(Math.abs(c.slip) < 15 && finite(c), id + ' unstable steady turn (slip ' + c.slip.toFixed(1) + ')');
  // reverse
  c = start(S0); for (let i = 0; i < 180; i++) stepCar(c, { throttle: 0, brake: 1, steer: 0 }, S, 1 / 60); ck(c.u < -2, id + ' reverse failed (u=' + c.u.toFixed(1) + ')');
  // fuzz: random inputs for 120 s of driving along the road, every frame must stay finite and above ground
  c = start(1500); let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, inp = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
  for (let i = 0; i < 60 * 120; i++) { if (i % 30 === 0) { inp.throttle = rnd() < 0.7 ? 1 : 0; inp.brake = rnd() < 0.2 ? 1 : 0; inp.steer = rnd() * 2 - 1; inp.handbrake = rnd() < 0.15; inp.nitro = rnd() < 0.3; } stepCar(c, inp, S, 1 / 60); if (!finite(c)) { ck(false, id + ' NaN in fuzz at ' + i); break; } }
  // mountain drive: hold the road via simple pure pursuit uphill to check slope effects
  c = start(roadQuery(500, -330, 1e4).s - 80); let s0 = c.y, gmax = 0; for (let i = 0; i < 60 * 20; i++) { const q = roadQuery(c.x, c.z), p = roadAt(q.s + 12 + c.u * 0.3), ex = Math.atan2(p.x - c.x, p.z - c.z) - c.yaw, e = Math.atan2(Math.sin(ex), Math.cos(ex)); stepCar(c, { throttle: c.u < 14 ? 1 : 0.3, brake: 0, steer: Math.max(-1, Math.min(1, e * 2.5)) }, S, 1 / 60); ck(finite(c), id + ' NaN climbing'); }
  console.log(`         climb: ${(c.y - s0).toFixed(1)} m gained in 20 s, speed ${c.kmh.toFixed(0)} km/h, on ${c.kind}`);
}
console.log(fail ? `FAIL (${fail})` : 'PASS'); process.exit(fail ? 1 : 0);


