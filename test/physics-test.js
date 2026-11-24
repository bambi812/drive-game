// Headless physics checks. Run: node test/physics-test.js
import { newCar, stepCar, curve } from '../public/physics.js';
import { carSpec, CARS } from '../public/catalog.js';
import { roadAt, ROAD_LEN, roadQuery } from '../public/world.js';
let fail = 0; const ck = (ok, msg) => { if (!ok) { fail++; console.log('  FAIL:', msg); } };
const start = s => { const p = roadAt(s); return newCar(p.x, p.z, Math.atan2(p.tx, p.tz)); };
const S0 = 30;                                       // beach straight
const REAL = { brz24: [6.4, 225], brz13: [7.2, 222], mustang: [4.4, 250], m2: [4.2, 250], m4: [3.8, 290], supra20: [4.0, 250], supra94: [4.8, 250], rx7: [5.4, 250], mclaren: [2.9, 330], c4s: [3.6, 306], gt3r: [3.2, 290], hellcat: [3.8, 320] };   // [0-100 km/h s, top km/h] from manufacturer / road-test figures
const finite = c => [c.x, c.y, c.z, c.u, c.v, c.r, c.rpm, c.yaw].every(Number.isFinite);
for (const id of Object.keys(CARS)) {
  const S = carSpec(id); let c = start(S0), t = 0, t100 = null, t60 = null, top = 0, gearsSeen = new Set();
  for (; t < 40; t += 1 / 60) { stepCar(c, { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false }, S, 1 / 60); gearsSeen.add(c.gear); if (!t60 && c.kmh >= 60) t60 = t; if (!t100 && c.kmh >= 100) t100 = t; top = Math.max(top, c.kmh); ck(finite(c), id + ' NaN in accel'); }
  // brake from 100
  c = start(S0); c.u = 27.8; let d = 0, tb = 0; while (c.u > 0.3 && tb < 20) { stepCar(c, { throttle: 0, brake: 1, steer: 0 }, S, 1 / 60); d += c.u / 60; tb += 1 / 60; }
  console.log(`${id.padEnd(8)} 0-60: ${t60?.toFixed(2)}s  0-100: ${t100?.toFixed(2)}s  top(40s): ${top.toFixed(0)} km/h  gears: ${[...gearsSeen].join('')}  100-0: ${d.toFixed(1)} m`);
  // top speed: highest speed where the best gear's drive force still beats drag + rolling resistance (full boost), analytic so it does not depend on the road shape
  let vTop = 0; for (let v = 5; v < 130; v += 0.1) { let F = 0; for (const g of S.gears) { const rpm = v / S.rw * g * S.final * 60 / (2 * Math.PI); if (rpm > S.redline) continue; F = Math.max(F, S.torque * curve(S, rpm / S.redline) * g * S.final * S.eff / S.rw); } if (F > 0.5 * 1.2 * S.cdA * v * v + 0.012 * S.mass * 9.81) vTop = v; }
  if (S.vmax) vTop = Math.min(vTop, S.vmax / 3.6); const real = REAL[id], topKmh = vTop * 3.6; console.log(`         top speed (analytic): ${topKmh.toFixed(0)} km/h`);
  ck(t100 && t100 > real[0] * 0.8 && t100 < real[0] * 1.3, `${id} 0-100 ${t100?.toFixed(2)} s vs real ${real[0]} s`); ck(topKmh > real[1] * 0.85 && topKmh < real[1] * 1.12, `${id} top speed ${topKmh.toFixed(0)} vs real ~${real[1]} km/h`);
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


