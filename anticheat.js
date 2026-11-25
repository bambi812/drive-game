// anticheat.js - the server never trusts what a client says about itself: every position update is checked against what the car can do.
// A move that is impossible without an announced teleport (or an announced one used too often) blocks records and rewards for a while
// and disqualifies from a running race. Limits are deliberately loose so that lag and bumps never punish honest drivers.
import { CARS, DEFAULT_CAR, carSpec } from './public/catalog.js';

const BLOCK_MS = 5000, TELEPORT_EVERY = 1500, WINDOW = 500;
export const topSpeed = acc => { const id = CARS[acc.sel] ? acc.sel : DEFAULT_CAR; return carSpec(id, acc.up?.[id]).vmax / 3.6 * 1.25 + 10; };   // m/s, with nitro, slopes and slack
export const clean = (p, now) => now >= (p.dirtyUntil || 0);
const flag = (p, now, why) => { p.dirtyUntil = now + BLOCK_MS; p.dz = null; p.prevS = null; p.flags = (p.flags || 0) + 1; p.lastFlag = why; p.hist = []; };
// the client announces teleports (menu, reset, race start): allowed, but not in a stream
export function teleport(p, now) { if (now - (p.tpAt || 0) < TELEPORT_EVERY) return false; p.tpAt = now; p.tpPending = now + 2000; return true; }
// call with each new state; returns null when plausible, otherwise the reason
export function check(p, st, now) {
  const hist = (p.hist ||= []), last = hist[hist.length - 1], limit = topSpeed(p.acc);
  if (Math.hypot(st.u, st.v) > limit) { flag(p, now, 'claimed speed'); return 'claimed speed'; }
  if (last) {
    const dt = Math.max((now - last.t) / 1000, 0.05), d = Math.hypot(st.x - last.x, st.z - last.z);
    if (d > limit * dt + 12) {
      if (p.tpPending && now < p.tpPending) { p.tpPending = 0; p.dirtyUntil = now + 2000; p.dz = null; p.prevS = null; p.hist = [{ x: st.x, z: st.z, t: now }]; return null; }
      flag(p, now, 'position jump'); p.hist.push({ x: st.x, z: st.z, t: now }); return 'position jump';
    }
  }
  hist.push({ x: st.x, z: st.z, t: now }); while (hist.length > 40) hist.shift();
  // acceleration, measured over half-second windows: no car gains more than about 2 g
  const a = hist.find(h => now - h.t <= WINDOW * 2), mid = hist.find(h => now - h.t <= WINDOW);
  if (a && mid && mid.t - a.t >= 300 && now - mid.t >= 300) {
    const v0 = Math.hypot(mid.x - a.x, mid.z - a.z) / ((mid.t - a.t) / 1000), v1 = Math.hypot(st.x - mid.x, st.z - mid.z) / ((now - mid.t) / 1000);
    if ((v1 - v0) / ((now - a.t) / 2000) > 45 && v1 > 25) { flag(p, now, 'acceleration'); return 'acceleration'; }
  }
  return null;
}
// the shortest time a race leg can take, ms
export const minLegMs = (acc, metres) => metres / topSpeed(acc) * 1000;