// Headless physics checks: target vs measured per car. Run: node test/physics-test.js   (flat test ground for the numbers, the real world for slopes / fuzz)
import { newCar, stepCar, placeCar, TEST, probe } from '../public/physics.js';
import { carSpec, CARS } from '../public/catalog.js';
import { roadAt, roadQuery } from '../public/world.js';
let fail = 0; const ck = (ok, msg) => { if (!ok) { fail++; console.log('  FAIL:', msg); } };
const G = 9.81, only = process.argv[2];
// [0-100 km/h s, top km/h] from manufacturer / road-test figures
const REAL = { brz24: [6.4, 225], brz13: [7.2, 222], mustang: [4.4, 250], m2: [4.2, 250], m4: [3.8, 290], supra20: [4.0, 250], supra94: [4.8, 250], rx7: [5.4, 250], mclaren: [2.9, 330], c4s: [3.6, 306], gt3r: [3.2, 290], hellcat: [3.8, 320] };
const finite = c => [c.x, c.y, c.z, c.u, c.v, c.r, c.rpm, c.yaw].every(Number.isFinite);
const SIM = { abs: false, tcs: false, assist: false }, ARC = { abs: true, tcs: true, assist: true };
function run(c, S, inp, sec, fps, f) { const dt = 1 / fps; for (let t = 0; t < sec; t += dt) { const i = typeof inp === 'function' ? inp(t, c) : inp; stepCar(c, i, S, dt); if (f && f(t, c) === false) break; } return c; }
const flat = (S, kind = 'road') => { TEST.flat = true; TEST.kind = kind; const c = newCar(0, 0, 0); run(c, S, { throttle: 0, brake: 0, steer: 0 }, 1.2, 60); return c; };
const rows = [];
for (const id of Object.keys(CARS)) {
  if (only && id !== only) continue; const S = carSpec(id), R = { id }; TEST.flat = true; TEST.kind = 'road';
  // static: settles level, does not creep
  let c = flat(S); run(c, S, { throttle: 0, brake: 0, steer: 0 }, 3, 60); R.creep = c.kmh; R.pitch = c.pitch * 57.3; ck(c.kmh < 0.3 && Math.abs(c.pitch) < 0.02 && Math.abs(c.y) < 0.05, `${id} static: ${c.kmh.toFixed(2)} km/h pitch ${R.pitch.toFixed(2)} y ${c.y.toFixed(3)}`);
  // 0-100, top speed
  c = flat(S); let t60 = 0, t100 = 0, top = 0, topT = 0; run(c, S, { throttle: 1, brake: 0, steer: 0, ...ARC }, 110, 60, (t, c) => { if (!t60 && c.kmh >= 60) t60 = t; if (!t100 && c.kmh >= 100) t100 = t; if (c.kmh > top + 0.05) { top = c.kmh; topT = t; } ck(finite(c), id + ' NaN accel'); return t - topT < 12 || t < 20; });
  R.t60 = t60; R.t100 = t100; R.top = top; const real = REAL[id];
  ck(t100 && t100 > real[0] * 0.85 && t100 < real[0] * 1.2, `${id} 0-100 ${t100.toFixed(2)} s vs real ${real[0]} s`); ck(top > real[1] * 0.92 && top < real[1] * 1.08, `${id} top speed ${top.toFixed(0)} vs real ~${real[1]} km/h`);
  // braking 100 -> 0 with ABS, and without (locks)
  for (const [k, ass] of [['brake', ARC], ['brakeNoABS', SIM]]) { c = flat(S); placeCar(c, 0, 0, 0, 27.78); c.b = null; run(c, S, { throttle: 0, brake: 0, steer: 0 }, 0.05, 60); let d = 0; run(c, S, { throttle: 0, brake: 1, steer: 0, ...ass }, 8, 60, (t, c) => { d += c.u / 60; return c.u > 0.3; }); R[k] = d; }
  // skidpad: R = 30 m circle, slow speed ramp, peak sustained lateral g while within 3 m of the line
  { c = flat(S); const Rr = 30; placeCar(c, 0, 0, Math.PI / 2, 8); run(c, S, { throttle: 0, brake: 0, steer: 0 }, 0.02, 60); let best = 0;
    run(c, S, (t, c) => { const vt = 8 + t * 0.3, r = Math.hypot(c.x, c.z + Rr), er = r - Rr, ang = Math.atan2(c.x, c.z + Rr), want = Math.atan2(Math.cos(ang), -Math.sin(ang)), he = Math.atan2(Math.sin(want - c.yaw), Math.cos(want - c.yaw));
      return { throttle: c.u < vt ? Math.min(1, (vt - c.u) * 0.6) : 0, brake: 0, steer: Math.max(-1, Math.min(1, he * 1.5 + er * 0.2)), ...ARC, assist: false }; }, 60, 60, (t, c) => { const r = Math.hypot(c.x, c.z + Rr); if (Math.abs(r - Rr) < 3 && t > 2) best = Math.max(best, Math.abs(c.ay) / G); else if (t > 2 && Math.abs(r - Rr) > 8) return false; });
    R.skid = best; }
  // handbrake flick at 80 km/h (assists off): the driver tries a few handbrake lengths; throttle + counter-steer hold the slide. Slip reached, time held between 25 and 55 deg, speed drop
  { const tryFlick = lvl => { const cc = flat(S); placeCar(cc, 0, 0, 0, 22.2); run(cc, S, { throttle: 0, brake: 0, steer: 0 }, 0.02, 60); let ms = 0, hold = 0, vmin = 999; const v0 = cc.kmh;
      run(cc, S, (t, c) => { const s = c.slip; return { throttle: t < 0.5 ? 0.3 : (Math.abs(s) < 33 ? 1 : 0.5), brake: 0, steer: t < 0.3 ? 1 : Math.max(-1, Math.min(1, s / 30 * 1.1)), handbrake: t > 0.1 && t < 0.1 + lvl, ...SIM }; }, 5, 60, (t, c) => { ms = Math.max(ms, Math.abs(c.slip)); if (t > 0.5 && Math.abs(c.slip) > 25 && Math.abs(c.slip) < 55) hold += 1 / 60; if (t > 0.5) vmin = Math.min(vmin, c.kmh); });
      return { ms, hold, drop: v0 - vmin }; };
    let best = null; for (const lvl of [0.25, 0.4, 0.55, 0.7, 0.9, 1.2]) { const r = tryFlick(lvl); if (!best || (r.ms >= 28 && r.ms < 62 && r.hold > (best.hold || 0)) || (best.ms < 28 && r.ms > best.ms)) best = r; if (best.ms >= 28 && best.ms < 62 && best.hold > 0.4) break; }
    R.flick = best.ms; R.flickHold = best.hold; R.flickDrop = best.drop; }
  // lift-off oversteer: 100 km/h in a long right-left sweep, lift off. yaw-rate gain & rear slip must stay moderate
  { c = flat(S); placeCar(c, 0, 0, 0, 27.8); run(c, S, { throttle: 0.4, brake: 0, steer: 0 }, 0.5, 60); let r0 = 0, r1 = 0; run(c, S, (t, c) => ({ throttle: t < 1.5 ? 0.35 : 0, brake: 0, steer: 0.10, ...SIM }), 3, 60, (t, c) => { if (t > 1.3 && t < 1.5) r0 = c.r; if (t > 1.5 && t < 3) r1 = Math.max(r1, c.r); }); R.lift = r1 / Math.max(0.01, r0); R.liftSlip = Math.abs(c.slip); }
  // sand: acceleration relative to road (distance in 6 s)
  { const dist = k => { const cc = flat(S, k); let x0 = 0; run(cc, S, { throttle: 1, brake: 0, steer: 0, ...ARC }, 6, 60, () => {}); return Math.hypot(cc.x, cc.z); }; const dr = dist('road'), ds = dist('sand'); R.sand = ds / dr; R.sandSpeed = (() => { const cc = flat(S, 'sand'); run(cc, S, { throttle: 1, brake: 0, steer: 0, ...ARC }, 30, 60); return cc.kmh; })(); }
  // traction / stability control: full throttle while steering (assists on) must not turn into a slide or a spin
  { R.power = 0; for (const [kmh, steer] of [[0, 1], [30, 1], [60, 1], [60, 0.5], [100, 1]]) { const cc = flat(S); placeCar(cc, 0, 0, 0, kmh / 3.6); run(cc, S, { throttle: 0, brake: 0, steer: 0 }, 0.02, 60); let rear = 0; run(cc, S, t => ({ throttle: 1, brake: 0, steer: steer * Math.min(1, t * 4.5), ...ARC }), 4, 60, (t, c) => { if (c.kmh > 8) { rear = Math.max(rear, Math.abs(Math.atan2(c.v - 1.3 * c.r, Math.max(c.u, 1))) * 57.3); R.power = Math.max(R.power, rear); } }); ck(rear < 14, `${id} slides ${rear.toFixed(0)} deg at the rear: throttle from ${kmh} km/h, steer ${steer}, assists on`); } }
  // frame-rate independence: 0-100 at 30 / 60 / 144 fps
  { const tt = fps => { const cc = flat(S); let t = 0; run(cc, S, { throttle: 1, brake: 0, steer: 0, ...ARC }, 14, fps, (tm, c) => { if (c.kmh >= 100) { t = tm; return false; } }); return t; }; R.fps = [tt(30), tt(60), tt(144)]; const sp = Math.max(...R.fps) - Math.min(...R.fps); ck(sp < 0.12, `${id} fps dependence ${R.fps.map(v => v.toFixed(2))}`); }
  // reverse
  c = flat(S); run(c, S, { throttle: 0, brake: 1, steer: 0 }, 3, 60); ck(c.u < -2, `${id} reverse failed u=${c.u.toFixed(1)}`);
  // airborne: drop from 1.5 m, must land, settle, stay finite
  c = flat(S); c.b.p[1] += 1.5; c.b.pp[1] += 1.5; run(c, S, { throttle: 0, brake: 0, steer: 0 }, 4, 60, (t, cc) => { ck(finite(cc), id + ' NaN landing'); }); ck(Math.abs(c.y) < 0.05 && c.kmh < 1, `${id} landing: y ${c.y.toFixed(3)} v ${c.kmh.toFixed(1)}`);
  // real world: random inputs for 90 s along the road, always finite and on the ground
  TEST.flat = false; { const p = roadAt(1500); c = newCar(p.x, p.z, Math.atan2(p.tx, p.tz)); let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, inp = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
    run(c, S, (t) => { if (Math.round(t * 60) % 30 === 0) { inp.throttle = rnd() < 0.7 ? 1 : 0; inp.brake = rnd() < 0.2 ? 1 : 0; inp.steer = rnd() * 2 - 1; inp.handbrake = rnd() < 0.15; inp.nitro = rnd() < 0.3; } return inp; }, 90, 60, (t, cc) => { if (!finite(cc) || cc.y < -50 || cc.y > 600) { ck(false, `${id} fuzz bad state at ${t.toFixed(1)} y=${cc.y}`); return false; } }); }
  // real world: parked on the steepest road grade it must not creep
  { let bs = 0, bg = 0; for (let s = 0; s < 9000; s += 20) { const a = roadAt(s), b = roadAt(s + 10), g = Math.abs(b.y - a.y) / 10; if (g > bg) { bg = g; bs = s; } } const p = roadAt(bs), dir = roadAt(bs + 5).y > p.y ? 1 : -1; c = newCar(p.x, p.z, Math.atan2(p.tx, p.tz) + (dir < 0 ? Math.PI : 0)); run(c, S, { throttle: 0, brake: 0, steer: 0 }, 1.5, 60); const x0 = c.x, z0 = c.z; run(c, S, { throttle: 0, brake: 0, steer: 0 }, 6, 60); R.slopeHold = Math.hypot(c.x - x0, c.z - z0); R.grade = bg; ck(R.slopeHold < 0.4, `${id} creeps ${R.slopeHold.toFixed(2)} m on a ${(bg * 100).toFixed(0)}% grade`); }
  TEST.flat = true;
  // checks against targets
  if (id === 'brz24') { ck(R.t100 > 6.0 && R.t100 < 6.8, `BRZ 0-100 ${R.t100.toFixed(2)} (6.0-6.8)`); ck(R.top > 215 && R.top < 235, `BRZ top ${R.top.toFixed(0)} (~225)`); ck(R.brake > 33 && R.brake < 39, `BRZ 100-0 ${R.brake.toFixed(1)} (35-38)`); ck(R.skid > 0.88 && R.skid < 1.05, `BRZ skidpad ${R.skid.toFixed(2)} g (~0.95)`); }
  ck(R.flick >= (id === 'brz24' ? 30 : 18), `${id} handbrake flick slip only ${R.flick.toFixed(0)} deg`); if (id === 'brz24') ck(R.flickHold > 1, `BRZ flick not holdable: ${R.flickHold.toFixed(1)} s between 25-55 deg`); ck(R.lift < 1.9 && R.liftSlip < 14, `${id} lift-off oversteer too snappy: yaw x${R.lift.toFixed(2)} slip ${R.liftSlip.toFixed(0)}`);
  ck(R.sand > 0.35 && R.sand < (id === 'brz24' ? 0.56 : 0.8), `${id} sand/road accel ${(R.sand * 100).toFixed(0)}% (40-55%)`); ck(R.sandSpeed > 60, `${id} sand speed wall ${R.sandSpeed.toFixed(0)}`);
  ck(R.brake < 60, `${id} stops in ${R.brake.toFixed(1)} m`);
  rows.push(R);
}
const f = (v, n = 1) => (v == null || !Number.isFinite(v)) ? '-' : v.toFixed(n);
console.log('car      0-60  0-100(real)  top(real)   100-0 ABS/none   skidpad  flick(hold s,drop)  lift   sand%(spd)  fps30/60/144   slope-creep   power-turn rear slip');
for (const R of rows) console.log(`${R.id.padEnd(8)} ${f(R.t60, 2)}  ${f(R.t100, 2)} (${REAL[R.id][0]})   ${f(R.top, 0)} (${REAL[R.id][1]})   ${f(R.brake)}/${f(R.brakeNoABS)} m     ${f(R.skid, 2)} g   ${f(R.flick, 0)} deg (${f(R.flickHold)} s, -${f(R.flickDrop, 0)})   x${f(R.lift, 2)}   ${f(R.sand * 100, 0)}% (${f(R.sandSpeed, 0)})   ${R.fps.map(v => f(v, 2)).join('/')}   ${f(R.slopeHold, 2)} m @${f(R.grade * 100, 0)}%   ${f(R.power, 0)} deg`);
console.log(fail ? `FAIL (${fail})` : 'PASS'); process.exit(fail ? 1 : 0);



