// traffic.js — server-side AI traffic: two lanes (one per direction) around the loop.
// IDM car-following; speed limited by road curvature (pre-computed, with braking distance); reacts to players.
import { ROAD } from './public/world.js';
const { N, ds, L } = ROAD;
const A_LAT = 3.2, A_BRAKE = 3.0, VMAX = 25, LANE = 3.1, CAR_LEN = 4.6;
// curvature per sample -> max cornering speed, then propagate braking in each travel direction
const kap = new Float32Array(N);
for (let i = 0; i < N; i++) { const a = (i - 3 + N) % N, b = (i + 3) % N; let d = Math.atan2(ROAD.TZ[b], ROAD.TX[b]) - Math.atan2(ROAD.TZ[a], ROAD.TX[a]); d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); kap[i] = d / (6 * ds); }
const vF = new Float32Array(N), vB = new Float32Array(N);
for (let i = 0; i < N; i++) vF[i] = vB[i] = Math.min(VMAX, Math.sqrt(A_LAT / Math.max(kap[i], 1e-4)));
for (let pass = 0; pass < 2; pass++) {
  for (let i = N - 1; i >= 0; i--) vF[i] = Math.min(vF[i], Math.sqrt(vF[(i + 1) % N] ** 2 + 2 * A_BRAKE * ds));   // cars heading +s slow before corners
  for (let i = 0; i < N; i++) vB[i] = Math.min(vB[i], Math.sqrt(vB[(i - 1 + N) % N] ** 2 + 2 * A_BRAKE * ds));    // cars heading -s
}
const wrap = d => ((d % L) + L) % L;
export class Traffic {
  constructor(count = 30, seed = 1) {
    let r = seed; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647; this.cars = [];
    for (let i = 0; i < count; i++) { const dir = i % 2 ? -1 : 1, slot = Math.floor(i / 2), per = Math.ceil(count / 2);
      this.cars.push({ i, dir, lat: dir * LANE, s: wrap((slot + rnd() * 0.5) * L / per + (dir < 0 ? L / (2 * per) : 0)), v: 12, v0: 14 + rnd() * 9, color: (rnd() * 8) | 0, type: (() => { const q = rnd(); return q < 0.4 ? 0 : q < 0.65 ? 1 : q < 0.92 ? 2 : 3; })(), len: CAR_LEN }); }
  }
  // obstacles: [{s, lat, vs}] (players), vs = speed along +s (signed)
  step(dt, obstacles = []) {
    for (const c of this.cars) {
      const idx = Math.round(c.s / ds) % N, vlim = c.dir > 0 ? vF[idx] : vB[idx], vt = Math.max(3, Math.min(c.v0, vlim));
      let acc = 2.2 * (1 - Math.pow(c.v / vt, 4));
      let gap = 1e9, vl = 0;                                                                     // nearest leader in my lane (cars + players)
      for (const o of this.cars) { if (o === c || o.dir !== c.dir) continue; const g = wrap(c.dir * (o.s - c.s)) - CAR_LEN; if (g < gap) { gap = g; vl = o.v; } }
      for (const o of obstacles) { if (Math.abs(o.lat - c.lat) > 2.8) continue; const g = wrap(c.dir * (o.s - c.s)) - 3; if (g < gap) { gap = g; vl = o.vs * c.dir; } }
      if (gap < 90) { const sStar = 3 + Math.max(0, c.v * 1.4 + c.v * (c.v - vl) / (2 * Math.sqrt(2.2 * 3))); acc -= 2.2 * Math.pow(sStar / Math.max(gap, 0.3), 2); }
      c.v = Math.max(0, c.v + Math.max(-9, Math.min(2.5, acc)) * dt); c.s = wrap(c.s + c.dir * c.v * dt);
    }
  }
  snapshot() { return this.cars.map(c => [c.i, +c.s.toFixed(2), c.dir, +c.v.toFixed(2), c.color, c.type]); }
}
