// Collision shapes and catalog rules. Run: node test/collision-test.js
import { satObb, circleHull } from '../public/collisions.js';
import { CARS, STARTERS, cleanCos, upgradePrice, stylePrice, DEFAULT_COS, RACES } from '../public/catalog.js';
let fail = 0; const ck = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fail++; };
const car = { x: 0, z: 0, fx: 0, fz: 1, hl: 2.1, hw: 0.9 };
// head on into a long wall whose centre is far to the side: the contact must be on the nose, not at the wall's far corner
const wall = { x: 20, z: 7, fx: 0, fz: 1, hl: 5, hw: 40 }, w = satObb(car, wall);
ck(w && Math.abs(w.px) < 0.5 && Math.abs(w.pz - 2.05) < 0.2 && w.nz < -0.9, `wall: contact at the front bumper (${w?.px.toFixed(2)}, ${w?.pz.toFixed(2)})`);
ck(satObb(car, { x: 10, z: 0, fx: 0, fz: 1, hl: 1, hw: 1 }) === null, 'no contact when apart');
const post = circleHull(car, 0.3, 2.2, 0.17); ck(post && post.nz < -0.9 && Math.abs(post.px - 0.3) < 0.01, 'post at the nose pushes straight back');
const deep = circleHull(car, 0.7, 1.7, 0.17, 25); ck(deep && deep.nz < -0.9, 'a post already inside the nose at speed is still head-on');
ck(circleHull(car, 3, 0, 0.17) === null, 'post beside the car misses');
// catalog
ck(Object.values(CARS).every(c => Number.isInteger(c.price) && c.price >= 0) && STARTERS.every(id => CARS[id].price === 0), 'every car has a whole, non-negative price; starters are free');
ck(upgradePrice('brz24', 'engine', 1) > 0 && upgradePrice('mclaren', 'engine', 3) > upgradePrice('brz24', 'engine', 3), 'upgrade prices rise with the car');
ck(cleanCos({ ...DEFAULT_COS, paint: 'x' }) === null && cleanCos(DEFAULT_COS) && stylePrice(DEFAULT_COS, DEFAULT_COS) === 0, 'style validation and unchanged style is free');
ck(RACES.every(r => r.length > 500 && r.prize > 0), 'races have a length and a prize');
console.log(fail ? `FAIL (${fail})` : 'PASS'); process.exit(fail ? 1 : 0);