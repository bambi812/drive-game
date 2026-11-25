// Car switches: manual gearbox, engine off, assists can be set one by one. Run: node test/controls-test.js
import { newCar, stepCar, TEST, tyreGrip } from '../public/physics.js';
import { carSpec } from '../public/catalog.js';
let fail = 0; const ck = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fail++; };
const S = carSpec('brz24'), ASSIST = { abs: true, tcs: true, esc: true, cs: true };
TEST.flat = true; TEST.kind = 'road';
const car = () => { const c = newCar(0, 0, 0); for (let i = 0; i < 60; i++) stepCar(c, { throttle: 0, brake: 0, steer: 0 }, S, 1 / 60); return c; };
const run = (c, inp, sec) => { for (let i = 0; i < sec * 60; i++) stepCar(c, inp, S, 1 / 60); return c; };
const m = { throttle: 1, brake: 0, steer: 0, manual: true, ...ASSIST };
let c = run(car(), m, 6); ck(c.gear === 1, `manual: stays in first gear without shifting (gear ${c.gear}, ${c.kmh.toFixed(0)} km/h)`);
const v1 = c.kmh; m.shiftReq = 1; run(c, m, 6); ck(c.gear === 2 && c.kmh > v1 + 15 && m.shiftReq === 0, `manual: one press shifts up once (gear ${c.gear}, ${c.kmh.toFixed(0)} km/h)`);
c = car(); const r = { throttle: 0, brake: 0, steer: 0, manual: true, shiftReq: -1, ...ASSIST }; run(c, r, 0.5); r.throttle = 1; run(c, r, 3); ck(c.gear === -1 && c.u < -3, `manual: down from first at standstill is reverse (u ${c.u.toFixed(1)} m/s)`);
c = run(car(), { throttle: 1, brake: 0, steer: 0, engineOff: true, ...ASSIST }, 4); ck(c.kmh < 1, `engine off: throttle does nothing (${c.kmh.toFixed(1)} km/h)`);
c = run(car(), { throttle: 1, brake: 0, steer: 0, ...ASSIST }, 4); ck(c.kmh > 50, `engine on again drives (${c.kmh.toFixed(0)} km/h)`);
{ const b = car(), burn = { throttle: 1, brake: 0, steer: 1, handbrake: false, heat: true, abs: false, tcs: false, esc: false, cs: false }; run(b, burn, 14); const rear = (b.w[2].temp + b.w[3].temp) / 2, front = (b.w[0].temp + b.w[1].temp) / 2; ck(rear > 85 && rear > front, `tyre heat: spinning warms the rears (rear ${rear.toFixed(0)} C, front ${front.toFixed(0)} C)`); ck(tyreGrip(150) < 0.9 && tyreGrip(80) === 1 && tyreGrip(25) < 0.95, 'tyre grip falls when overheated or cold'); const h = b.w[2].temp; run(b, { throttle: 0, brake: 1, steer: 0, heat: true, ...ASSIST }, 25); ck(b.w[2].temp < h - 10, `tyres cool down again (${h.toFixed(0)} -> ${b.w[2].temp.toFixed(0)} C)`); }
console.log(fail ? `FAIL (${fail})` : 'PASS'); process.exit(fail ? 1 : 0);
