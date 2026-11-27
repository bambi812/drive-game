// local-traffic.js - cars on all the side roads: busy streets in town, nearly empty mountain roads. Pure math (no THREE).
// Positions are a function of the server clock, so every player sees the same cars without any network traffic.
// Each side road is a loop: out on one side of the road, back on the other.
import * as W from './world.js';

export const PEAK = 18;                      // car slots per km of road (both directions together) in the busiest place
const LANE = 2.4, GAP_END = 6;
const URBAN = new Set(['downtown', 'shopping', 'business', 'casino', 'food', 'oldtown']), TOWN = new Set(['suburb', 'town', 'campus', 'port', 'resort']);
// cars per km at a point of a road of the given kind
export function densityAt(x, z, kind) {
  const d = W.districtAt(x, z, 1.05);
  if (d) return URBAN.has(d.kind) ? 18 : TOWN.has(d.kind) ? 9 : d.kind === 'airfield' ? 0 : 4;
  const zone = W.zoneAt(x, z);
  if (zone === 'mountain' || zone === 'highlands') return kind === 'highway' ? 1.4 : 0.6;
  if (zone === 'city') return 12;
  return kind === 'highway' ? 3.5 : 2;
}
// speed (m/s) a driver keeps on that road
const speedOn = (kind, urban) => (kind === 'pass' ? 11 : kind === 'highway' ? (urban ? 14 : 21) : urban ? 9 : 14);

export function buildLanes() {
  const lanes = []; let seed = 99; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  W.SIDE_ROADS.forEach((pts, i) => {
    const kind = W.SIDE_ROADS.kinds[i]; if (kind === 'ring' || kind === 'track') return;
    // the usable part: not on top of the main road, and not right at the ends
    const usable = pts.filter(p => p.s > GAP_END && p.s < pts[pts.length - 1].s - GAP_END && W.roadQuery(p.x, p.z, 16).d > 11);
    let run = [], best = []; for (const p of usable) { if (run.length && p.s - run[run.length - 1].s > 12) run = []; run.push(p); if (run.length > best.length) best = run; }
    if (best.length < 12) return;
    const s0 = best[0].s, len = best[best.length - 1].s - s0, mid = best[best.length >> 1];
    const urban = best.filter(p => W.districtAt(p.x, p.z)).length > best.length * 0.5;
    const dens = Float32Array.from(best, p => densityAt(p.x, p.z, kind));
    const loop = 2 * len, slots = Math.floor(loop / 1000 * PEAK / 2); if (!slots) return;      // PEAK is per km of road, the loop is twice the road
    const spacing = loop / slots, cars = [];
    for (let k = 0; k < slots; k++) cars.push({ o: (k + 0.25 + rnd() * 0.5) * spacing, u: rnd(), color: (rnd() * 8) | 0, id: (rnd() * 1e9) | 0, lag: 0, show: null });
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of best) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    lanes.push({ pts: best, dens, s0, len, loop, v: speedOn(kind, urban) * (0.9 + rnd() * 0.2), cars, x0, x1, z0, z1, mid });
  });
  return lanes;
}

// where a car is when the loop position is q (0..loop). Fills and returns `o`.
export function place(lane, q, o) {
  const back = q >= lane.len, s = lane.s0 + (back ? lane.loop - q : q), P = lane.pts;
  let lo = 0, hi = P.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].s <= s) lo = m; else hi = m; }
  const a = P[lo], b = P[hi], f = Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s || 1)));
  const tx = a.tx + (b.tx - a.tx) * f, tz = a.tz + (b.tz - a.tz) * f, l = Math.hypot(tx, tz) || 1, dir = back ? -1 : 1, lat = dir * LANE;
  o.x = a.x + (b.x - a.x) * f - tz / l * lat; o.z = a.z + (b.z - a.z) * f + tx / l * lat;
  o.y = a.y + (b.y - a.y) * f + (a.cross + (b.cross - a.cross) * f) * lat;
  o.fx = tx / l * dir; o.fz = tz / l * dir; o.i = lo;
  return o;
}

// call every frame. t = shared time (s). amount 0..1.6 scales how busy it is. me = {x, z} of the player.
// draw(car, pos, speed) is called for every car within `range` of the camera.
export function createLocalTraffic() {
  const lanes = buildLanes(), o = {};
  return {
    lanes,
    update(t, dt, cam, me, range, amount, draw) {
      if (amount <= 0) return;
      for (const lane of lanes) {
        if (cam.x < lane.x0 - range || cam.x > lane.x1 + range || cam.z < lane.z0 - range || cam.z > lane.z1 + range) continue;
        for (const c of lane.cars) {
          const q = (((c.o + (t - c.lag) * lane.v) % lane.loop) + lane.loop) % lane.loop;
          place(lane, q, o);
          const dx = o.x - cam.x, dz = o.z - cam.z, d2 = dx * dx + dz * dz; if (d2 > range * range) { c.show = null; c.lag = 0; continue; }
          const want = c.u < lane.dens[o.i] * amount / PEAK;
          if (c.show === null || d2 > 130 * 130) c.show = want;                           // never pop in or out right in front of the player
          if (!c.show) continue;
          // wait behind the player instead of driving through
          let v = lane.v; const px = me.x - o.x, pz = me.z - o.z, ahead = px * o.fx + pz * o.fz, side = Math.abs(px * -o.fz + pz * o.fx);
          if (ahead > 0 && ahead < 11 && side < 2.2) { c.lag += dt; v = 0; }
          draw(c, o, v);
        }
      }
    },
  };
}
