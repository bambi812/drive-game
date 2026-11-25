// physics.js - shared, headless-testable vehicle physics: 4-wheel raycast RIGID BODY (deterministic, fixed 120 Hz substeps, render interpolation).
//  body   : position, velocity, quaternion, angular velocity, diagonal inertia tensor (roll/pitch/yaw), COM height from the car spec
//  wheels : 4 raycast suspensions (spring + separate bump/rebound damping + bump stop + anti-roll bars), forces applied at each contact patch,
//           per-wheel surface probe, wheel angular velocity (drive/brake/tyre torque), bristle-style tyre with relaxation length (no creep, no jitter)
//  drive  : engine torque curve + inertia -> slipping clutch -> auto gearbox (hysteresis, shift time) -> open/LSD/locked diff -> wheels
//  assists: ABS, TCS, stability control, counter-steer are a separate layer (inp.abs / inp.tcs / inp.assist). They only modulate brake/throttle/steer.
// Conventions: world y up. Body axes F (forward), L (left), U (up), right-handed (F x L = U). forward = (sin yaw, cos yaw). u forward speed, v lateral (left +), r yaw rate (left +).
import { ROAD_HALF, roadQuery, sideQuery, terrainH, BOUNDS, sstep, SEA, boardwalkAt, coastZ, CITY_RECT, AVX, AVZ } from './world.js';
import { CURVE_N } from './car-data.js';
export const G = 9.81, STEP = 1 / 120;
const NW = 4, TAU = Math.PI * 2, RHO = 1.2;                         // tyre/driveline inner steps per physics step, air density
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, sg = v => v < 0 ? -1 : 1, lerp = (a, b, t) => a + (b - a) * t;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const TEST = { flat: false, kind: 'road' };                  // tests: force a flat surface of one kind (headless, no world dependence)

// ---- surfaces (per wheel). mu = grip multiplier, rr = rolling resistance coefficient, sink = static sinkage (m)
export const SURF = {
  road:   { mu: 1.00, rr: 0.012, sink: 0 },      gravel: { mu: 0.80, rr: 0.032, sink: 0.012 }, grass: { mu: 0.62, rr: 0.058, sink: 0.024 },
  sand:   { mu: 0.55, rr: 0.088, sink: 0.052 },  water:  { mu: 0.42, rr: 0.120, sink: 0 },     wood:  { mu: 0.86, rr: 0.016, sink: 0 },
};
const P = { y: 0, mu: 1, rr: 0.012, sink: 0, kind: 'road', depth: 0, wet: 0 };
const BWO = { w: 0, y: 0 };
export function probe(x, z, o = P) {
  if (TEST.flat) { const s = SURF[TEST.kind]; o.y = 0; o.mu = s.mu; o.rr = s.rr; o.sink = s.sink; o.kind = TEST.kind; o.depth = 0; return o; }
  const q = roadQuery(x, z, 14), th = terrainH(x, z); let y = th;
  if (q.d < ROAD_HALF + 1.2) { const w = sstep((q.d - ROAD_HALF) / 1.2); y = q.y * (1 - w) + th * w; }
  let rd_ = q.d;                                                                                     // distance to the nearest road, as if it had the main road's width
  if (q.d > ROAD_HALF + 1.2) { const s = sideQuery(x, z, 14), ds = s.d - (s.half - ROAD_HALF);          // side roads and city streets
    if (ds < rd_) { rd_ = ds; if (s.d < s.half + 1.2) { const w = sstep((s.d - s.half) / 1.2); y = s.y * (1 - w) + th * w; } } }
  const paved = x > CITY_RECT.x0 && x < CITY_RECT.x1 && z > CITY_RECT.z0 && z < CITY_RECT.z1 && !(x < AVX[0] - 18 && z < AVZ[0] - 18);   // city pavement, except the park
  const wR = paved ? 1 : 1 - sstep((rd_ - ROAD_HALF - 0.1) / 0.7), wGv = (1 - wR) * (1 - sstep((rd_ - 8.5) / 2)), wSd = sstep((z - (coastZ(x) - 82)) / 10) * (1 - sstep((th - 5.0) / 0.5)), depth = SEA - th, wW = (1 - wR) * sstep(depth / 0.25);
  const gr = SURF.grass, sa = SURF.sand, gv = SURF.gravel, rd = SURF.road, wt = SURF.water;
  const mix = k => { let v = lerp(gr[k], sa[k], wSd); v = lerp(v, gv[k], wGv); v = lerp(v, rd[k], wR); return lerp(v, wt[k], wW); };
  o.y = y; o.mu = mix('mu'); o.rr = mix('rr'); o.sink = mix('sink'); o.depth = depth > 0 ? depth : 0;
  o.kind = wW > 0.5 ? 'water' : wR > 0.5 ? 'road' : wGv > 0.5 ? 'gravel' : wSd > 0.5 ? 'sand' : 'grass';
  const bumpK = o.kind === 'road' ? 0.0025 : o.kind === 'grass' ? 0.024 : o.kind === 'gravel' ? 0.018 : o.kind === 'sand' ? 0.016 : 0;
  if (bumpK) o.y += bumpK * (Math.sin(x * 2.9 + z * 1.7) * Math.sin(z * 2.2 - x * 0.8) + 0.5 * Math.sin(x * 6.1 + z) * Math.sin(z * 5.3 - x));
  const bw = boardwalkAt(x, z, BWO); if (bw.w > 0) { const wd = SURF.wood; o.y = lerp(o.y, bw.y, bw.w); o.mu = lerp(o.mu, wd.mu, bw.w); o.rr = lerp(o.rr, wd.rr, bw.w); o.sink = lerp(o.sink, 0, bw.w); o.depth = 0; if (bw.w > 0.5) o.kind = 'wood'; }                    // raised wooden boardwalk
  return o;
}
export const groundAt = (x, z) => TEST.flat ? 0 : probe(x, z).y;
// ---- normalised tyre curve ("magic formula" shape, peak 1 at s = 1). C > 1.5 makes a steeper post-peak drop (wheelspin / lockup lose grip)
const E_ = 0.25, mfB = C => { const T = Math.tan(Math.PI / (2 * C)); let lo = 0.1, hi = 20; for (let i = 0; i < 50; i++) { const z = (lo + hi) / 2; (z - E_ * (z - Math.atan(z)) < T) ? lo = z : hi = z; } return lo; };
const APK = 0.17;                                                    // lateral slip angle at peak grip (rad)
const CY = 1.42, CX = 1.62, BY = mfB(CY), BX = mfB(CX);
const fmag = (s, mix) => { const z = lerp(BY, BX, mix) * s; return Math.sin(lerp(CY, CX, mix) * Math.atan(z - E_ * (z - Math.atan(z)))); };
// engine torque curve (fraction of peak) at n = rpm/redline, piecewise-linear through the car's own dyno points (CURVE_N)
export const curve = (S, n) => {
  const C = S.curve, X = CURVE_N; if (n <= X[0]) return C[0] * (0.4 + 0.6 * Math.max(0, n) / X[0]); if (n >= X[X.length - 1]) return C[C.length - 1] * Math.max(0, 1 - (n - 1) * 12);
  let i = 1; while (X[i] < n) i++; return C[i - 1] + (C[i] - C[i - 1]) * (n - X[i - 1]) / (X[i] - X[i - 1]);
};
// ---- quaternion helpers [w,x,y,z]
const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
const qnorm = q => { const n = 1 / Math.hypot(q[0], q[1], q[2], q[3]); q[0] *= n; q[1] *= n; q[2] *= n; q[3] *= n; return q; };
function basisQ(q) { const [w, x, y, z] = q; return { F: [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)], L: [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)], U: [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)] }; }
function quatBasis(F, L, U) {
  const m00 = F[0], m10 = F[1], m20 = F[2], m01 = L[0], m11 = L[1], m21 = L[2], m02 = U[0], m12 = U[1], m22 = U[2], tr = m00 + m11 + m22; let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [s / 4, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [(m21 - m12) / s, s / 4, (m01 + m10) / s, (m02 + m20) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m02 - m20) / s, (m01 + m10) / s, s / 4, (m12 + m21) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, s / 4]; }
  return qnorm(q);
}
const Q1 = [0.5, 0.5, 0.5, 0.5];                                    // body frame (F,L,U) -> mesh frame (x = left, y = up, z = forward)

// ---- derived parameters from the car spec (see car-data.js for the per-car numbers)
function derive(S) {
  const m = S.mass, L = S.wb, b = L * S.front, a = L - b, t = S.track || 1.55, T = S.travel || 0.2, rw = S.rw, cgh = S.cgh;
  const fHz = S.fHz || 1.7, rHz = S.rHz || 1.85, wf = m * S.front / 2, wr = m * (1 - S.front) / 2;                                       // static load per front / rear wheel (kg)
  const kF = wf * (TAU * fHz) ** 2, kR = wr * (TAU * rHz) ** 2, zb = S.zBump || 0.3, zr = S.zReb || 0.55;
  const xF = G / (TAU * fHz) ** 2, xR = G / (TAU * rHz) ** 2;                                                                            // static compression
  return { m, L, a, b, t, T, rw, cgh, kF, kR, cbF: 2 * zb * Math.sqrt(kF * wf), crF: 2 * zr * Math.sqrt(kF * wf), cbR: 2 * zb * Math.sqrt(kR * wr), crR: 2 * zr * Math.sqrt(kR * wr), xF, xR,
    hAF: T - xF + rw - cgh, hAR: T - xR + rw - cgh, arbF: (S.arbF == null ? 0.55 : S.arbF) * kF, arbR: (S.arbR == null ? 0.3 : S.arbR) * kR,
    IF: m * (0.4 * t) ** 2 * (S.iroll || 1), IL: m * (0.45 * L) ** 2 * (S.ipitch || 1), IU: m * (0.45 * L) ** 2 * (S.iyaw || 1), Iw: S.wi || 1.5, Ie: S.ie || 0.22, sig: S.sig || 0.3 };
}
const newWheel = (front, side) => ({ front, side, om: 0, ang: 0, xd: 0, yd: 0, x: 0, xp: null, hit: false, N: 0, sink: 0, kind: 'road', abs: 1, kap: 0, alp: 0, temp: 65, Fx: 0, Fy: 0, slipV: 0, sus: 0, cx: 0, cy: 0, cz: 0, nrm: [0, 1, 0], mu: 1, wet: 0, dg: 0, air: 0, steer: 0 });
export function newCar(x = 0, z = 0, yaw = 0) {
  return { x, z, yaw, u: 0, v: 0, r: 0, y: groundAt(x, z), vy: 0, air: false, rpm: 900, gear: 1, shiftT: 0, shifts: 0, boost: 0, lim: false, thr: 0, nitro: 100, steer: 0, ax: 0, ay: 0, absOn: false, tcsOn: false, escOn: false, locked: false,
    pitch: 0, roll: 0, kmh: 0, slip: 0, rearSlip: 0, spin: false, kind: 'road', nitroOn: false, hb: false, airT: 0, landed: 0, scrape: 0, drowned: false, wetT: 0, impact: 0, b: null, init: { x, z, yaw }, w: [newWheel(1, 1), newWheel(1, -1), newWheel(0, 1), newWheel(0, -1)], mq: [0, 0, 0, 1], F: [0, 0, 1], L: [1, 0, 0], U: [0, 1, 0], _acc: 0 };
}
// teleport / respawn: the rigid body is rebuilt on the next step (needs the spec). u = initial forward speed
export function placeCar(c, x, z, yaw, u = 0) { c.init = { x, z, yaw }; c.x = x; c.z = z; c.yaw = yaw; c.y = groundAt(x, z); c.u = u; c.v = c.r = c.vy = 0; c.b = null; c.drowned = false; c.air = false; c._acc = 0; }
export function freezeCar(c) { if (!c.b) { c.u = c.v = c.r = c.vy = 0; return; } c.b.vel = [0, 0, 0]; c.b.wb = [0, 0, 0]; c.u = c.v = c.r = c.vy = 0; for (const w of c.w) { w.om = 0; w.xd = w.yd = 0; } }
function initBody(c, S) {
  const d = derive(S), I = c.init, sy = Math.sin(I.yaw), cy = Math.cos(I.yaw), u0 = c.u || 0, v0 = c.v || 0;
  const hf = groundAt(I.x + sy * d.a, I.z + cy * d.a), hr = groundAt(I.x - sy * d.b, I.z - cy * d.b), hl = groundAt(I.x + cy * d.t / 2, I.z - sy * d.t / 2), hrr = groundAt(I.x - cy * d.t / 2, I.z + sy * d.t / 2);
  const sl = (hf - hr) / d.L, ss = (hl - hrr) / d.t; let F = [sy, sl, cy], Lr = [cy, ss, -sy]; const n = Math.hypot(...F); F = F.map(v => v / n);
  let U = cross(F, Lr); const nu = Math.hypot(...U); U = U.map(v => v / nu); const Lv = cross(U, F), g0 = (hf + hr + hl + hrr) / 4;
  c.b = { p: [I.x, g0 + d.cgh, I.z], pp: [I.x, g0 + d.cgh, I.z], vel: [u0 * sy + v0 * cy, 0, u0 * cy - v0 * sy], q: quatBasis(F, Lv, U), qp: null, wb: [0, 0, 0], we: (S.idle || 900) * TAU / 60, ecl: 0, ramp: 1, limT: 0, thrS: 0, shiftBlock: 0, hold: 0, bumpHold: 0, aPrev: [0, 0, 0], wasAir: 0, drown: 0, esc: 0, tcsS: 1, steerT: 0 };
  c.b.qp = c.b.q.slice(); c.gear = u0 < -0.5 ? -1 : 1;
  if (u0 > 0.5) for (let g = 1; g < S.gears.length; g++) { if (u0 / d.rw * S.gears[c.gear - 1] * S.final * 60 / TAU < 0.62 * S.redline) break; c.gear = g + 1; }   // start in a sensible gear when spawned moving
  c.rpm = Math.max(S.idle || 900, u0 > 0.5 ? Math.abs(u0) / d.rw * (c.gear < 0 ? S.rev : S.gears[c.gear - 1]) * S.final * 60 / TAU : 0); c.b.we = c.rpm * TAU / 60;
  for (const w of c.w) { w.om = u0 / d.rw; w.xd = w.yd = 0; w.xp = null; w.abs = 1; w.sink = 0; }
}
// grip against tyre temperature (deg C): full between 60 and 105, less when cold, falling off as the rubber overheats
export const tyreGrip = T => (T < 60 ? 1 - 0.07 * Math.min(1, (60 - T) / 40) : T > 105 ? 1 - 0.17 * Math.min(1, (T - 105) / 55) : 1);
// ---- one fixed step
function sub(c, S, inp, h) {
  const B = c.b, d = derive(S), m = d.m, { rw, T, t } = d, W = c.w;
  B.pp = B.p.slice(); B.qp = B.q.slice();
  const { F, L, U } = basisQ(B.q), p = B.p, vel = B.vel;
  const wr = [F[0] * B.wb[0] + L[0] * B.wb[1] + U[0] * B.wb[2], F[1] * B.wb[0] + L[1] * B.wb[1] + U[1] * B.wb[2], F[2] * B.wb[0] + L[2] * B.wb[1] + U[2] * B.wb[2]];   // world angular velocity
  const hn = Math.hypot(F[0], F[2]) || 1, hF = [F[0] / hn, 0, F[2] / hn], hL = [hF[2], 0, -hF[0]];
  const u = dot(vel, hF), v = dot(vel, hL), spd = Math.abs(u), yawRate = wr[1];
  // ---- inputs / assists (a separate layer: it only modulates steering, brake and throttle)
  const thr = clamp(inp.throttle, 0, 1), brk = clamp(inp.brake, 0, 1), hb = !!inp.handbrake, aABS = inp.abs !== false, aTCS = inp.tcs !== false, aESC = inp.esc !== undefined ? !!inp.esc : !!inp.assist, aCS = inp.cs !== undefined ? !!inp.cs : !!inp.assist, manual = !!inp.manual, engineOff = !!inp.engineOff;
  c.hb = hb;
  if (manual) {                                                    // the driver picks the gear: ... R <- 1 <-> 2 <-> ... (reverse only when nearly stopped)
    if (inp.shiftReq) { const g0 = c.gear, up = inp.shiftReq > 0; inp.shiftReq = 0; const g1 = up ? (g0 < 0 ? (spd < 2 ? 1 : g0) : Math.min(S.gears.length, g0 + 1)) : (g0 > 1 ? g0 - 1 : g0 === 1 && spd < 2 ? -1 : g0); if (g1 !== g0) { c.gear = g1; c.shiftT = S.shift * 0.7; B.ramp = 0; c.shifts++; } }
  } else if (c.gear < 0) { if (thr > 0.05 && u > -1) c.gear = 1; } else if (brk > 0.05 && u < 0.8 && thr < 0.05) c.gear = -1;
  const rev = c.gear < 0, drive = engineOff ? 0 : manual ? thr : rev ? brk : thr, brakeIn = manual ? brk : rev ? thr : brk;
  let lock = S.steerMax / (1 + Math.pow(spd / 22, 1.6)) + 0.05;
  if (aCS && spd > 8) lock = Math.min(lock, Math.max(0.06, d.L * 1.15 * G * S.muF / (spd * spd) + APK * 0.8));   // steering assist: full input turns the front wheels only as far as the tyres can use (a held key no longer overdrives them into understeer)
  let target = clamp(inp.steer, -1, 1) * lock;
  if (aCS && spd > 6 && c.air === false) { const slipR = Math.atan2(v - d.b * yawRate, Math.max(spd, 1)); target += clamp(slipR * 0.55, -0.35, 0.35) * (Math.abs(inp.steer) > 0.05 ? 0.6 : 1); }   // counter-steer assist
  const rate = 7 * h * (Math.abs(target) > Math.abs(c.steer) ? 1 : 1.6); c.steer += clamp(target - c.steer, -rate, rate);
  const dl = clamp(c.steer, -0.65, 0.65), tn = Math.tan(dl);
  const dFL = Math.atan(d.L * tn / (d.L - t / 2 * tn)), dFR = Math.atan(d.L * tn / (d.L + t / 2 * tn));
  // ---- suspension: raycast each wheel along -U from its attach point
  let Ftot = [0, -m * G, 0], Ttot = [0, 0, 0], anyHit = false, maxX = 0;
  const addF = (f, r) => { Ftot[0] += f[0]; Ftot[1] += f[1]; Ftot[2] += f[2]; const tq = cross(r, f); Ttot[0] += tq[0]; Ttot[1] += tq[1]; Ttot[2] += tq[2]; };
  let nHit = 0;
  for (let i = 0; i < 4; i++) {
    const w = W[i], fr = w.front, ax = fr ? d.a : -d.b, ay = w.side * t / 2, az = fr ? d.hAF : d.hAR, Lr = T + rw;
    const A = [p[0] + F[0] * ax + L[0] * ay + U[0] * az, p[1] + F[1] * ax + L[1] * ay + U[1] * az, p[2] + F[2] * ax + L[2] * ay + U[2] * az]; w.A = A;
    w.steer = fr ? (i === 0 ? dFL : dFR) : 0;
    let hit = false, tt = Lr, sf = P;
    if (U[1] > 0.12) {
      tt = clamp(Lr * 0.8, 0, Lr);
      for (let k = 0; k < 3; k++) { const px = A[0] - U[0] * tt, pz = A[2] - U[2] * tt; sf = probe(px, pz); const g = sf.y - w.sink; tt = (A[1] - g) / U[1]; if (tt > Lr + 0.4) { tt = Lr + 0.4; break; } if (tt < 0) tt = 0; }
      hit = tt <= Lr;
    }
    w.hit = hit; const x = T - (tt - rw); w.x = hit ? x : 0;
    w.sus = hit ? (tt - rw) : T;                                                          // wheel-centre distance below the attach point (visual travel)
    if (hit) {
      nHit++; const cp = [A[0] - U[0] * tt, A[1] - U[1] * tt, A[2] - U[2] * tt]; w.cx = cp[0]; w.cy = cp[1]; w.cz = cp[2]; w.kind = sf.kind; w.mu = sf.mu; w.rr = sf.rr; w.wet = sf.depth; w.air = 0;
      const e = 0.5, gx = (probe(cp[0] + e, cp[2]).y - cp[1] - w.sink) / e, gz = (probe(cp[0], cp[2] + e).y - cp[1] - w.sink) / e; w.sinkT = sf.sink; w.rrr = sf.rr;   // slope under the wheel
      let nn = [-gx, 1, -gz]; const nl = Math.hypot(...nn); w.nrm = [nn[0] / nl, nn[1] / nl, nn[2] / nl];
      maxX = Math.max(maxX, x);
    } else { w.air += h; w.N = 0; w.cx = A[0] - U[0] * Lr; w.cy = A[1] - U[1] * Lr; w.cz = A[2] - U[2] * Lr; }
  }
  // spring / damper / bump stop / anti-roll
  for (let i = 0; i < 4; i++) {
    const w = W[i]; if (!w.hit) { w.N = 0; w.xp = null; continue; }
    const fr = w.front, k = fr ? d.kF : d.kR, xd = w.xp === null ? 0 : clamp((w.x - w.xp) / h, -9, 9); w.xp = w.x;
    const cd = xd > 0 ? (fr ? d.cbF : d.cbR) : (fr ? d.crF : d.crR), mate = W[i ^ 1], arb = (fr ? d.arbF : d.arbR) * (w.x - (mate.hit ? mate.x : 0));
    let N = k * w.x + cd * xd + (w.x > 0.88 * T ? 14 * k * (w.x - 0.88 * T) + 6 * cd * xd * (xd > 0 ? 1 : 0) : 0) + arb;
    w.N = clamp(N, 0, 7 * m * G / 4);
  }
  // ---- buoyancy / water drag (shallow water drags and lifts a little, deep water floats then drowns)
  let ds = 0; if (p[1] < SEA + 2.5 && probe(p[0], p[2]).depth > 0.02) { const bot = p[1] - 0.55; if (bot < SEA) ds = SEA - bot; }
  if (ds > 0) { const fb = m * G * clamp(ds / 1.1, 0, 1.3); Ftot[1] += fb; Ftot[1] -= 3.5 * m * vel[1] * clamp(ds, 0, 1); Ftot[0] -= 0.8 * m * vel[0] * clamp(ds, 0, 1) * (1 + Math.hypot(vel[0], vel[2]) * 0.12); Ftot[2] -= 0.8 * m * vel[2] * clamp(ds, 0, 1) * (1 + Math.hypot(vel[0], vel[2]) * 0.12); c.wetT = ds; }
  else c.wetT = 0;
  B.drown = ds > 0.95 ? B.drown + h : Math.max(0, B.drown - h); if (B.drown > 2.2) c.drowned = true;
  // ---- tyres + driveline, NW inner iterations. Contact geometry first.
  let gAvg = 0; for (let i = 0; i < 4; i++) { const w = W[i]; if (!w.hit) continue;
    const r = [w.cx - p[0], w.cy - p[1], w.cz - p[2]], vc = [vel[0] + wr[1] * r[2] - wr[2] * r[1], vel[1] + wr[2] * r[0] - wr[0] * r[2], vel[2] + wr[0] * r[1] - wr[1] * r[0]];
    const cs = Math.cos(w.steer), sn = Math.sin(w.steer), Fw = [F[0] * cs + L[0] * sn, F[1] * cs + L[1] * sn, F[2] * cs + L[2] * sn], n = w.nrm, fn = dot(Fw, n);
    let Fg = [Fw[0] - n[0] * fn, Fw[1] - n[1] * fn, Fw[2] - n[2] * fn]; const fl = Math.hypot(...Fg); Fg = [Fg[0] / fl, Fg[1] / fl, Fg[2] / fl]; const Lg = cross(n, Fg);
    w.Fg = Fg; w.Lg = Lg; w.r = r; w.vx = dot(vc, Fg); w.vy = dot(vc, Lg); w.vn = dot(vc, n);
    // load-sensitive grip, per-surface multiplier
    const N0 = m * G / 4, ls = S.loadSens == null ? 0.12 : S.loadSens; w.muE = (fr_(w) ? S.muF : S.muR) * w.mu * clamp(1 - ls * (w.N / N0 - 1), 0.55, 1.25) * (inp.heat ? tyreGrip(w.temp) : 1);
    gAvg += 1; }
  // brake torques (bias, ABS state, handbrake rear only, hold at standstill)
  const bias = S.bias || 0.7, Tbk = brakeIn * S.brakeG * m * G * rw * 0.97, hbT = (S.hbT || 0.5) * m * G * rw * clamp(S.muR / 1.1, 1, 1.7), hold = (!rev ? (thr < 0.02 && brakeIn < 0.02) : (brk < 0.02 && thr < 0.02)) ? (1 - sstep(spd / 1.2)) : 0;
  const Tb = [Tbk * bias / 2, Tbk * bias / 2, Tbk * (1 - bias) / 2, Tbk * (1 - bias) / 2]; let escBrake = [0, 0, 0, 0];
  const slipRear = spd > 4 ? Math.abs(Math.atan2(v - d.b * yawRate, spd)) : 0;                    // how far the rear axle is sliding sideways, rad
  c.escOn = false;
  if (aESC && spd > 5 && !hb && c.air === false) {                                                // stability control: brake the outer front wheel when the car turns more than asked (never damps yaw directly)
    const grip = S.muR * G / Math.max(spd, 5), rd = clamp(u * Math.tan(clamp(inp.steer, -1, 1) * lock) / d.L / (1 + (spd / 38) ** 2), -grip, grip);   // yaw rate the driver asked for, within what the tyres can hold
    const over = (yawRate - rd) * sg(yawRate), k = Math.max(clamp((over - 0.12) / 0.3, 0, 1), clamp((slipRear - 0.09) / 0.12, 0, 1));
    if (k > 0 && over > 0) { escBrake[yawRate > 0 ? 1 : 0] = k * 0.3 * m * G * rw; c.escOn = true; } }
  for (let i = 0; i < 4; i++) { Tb[i] = Tb[i] * W[i].abs + escBrake[i] + (hb && i >= 2 ? hbT : 0) + hold * 0.3 * m * G * rw / 4; }
  // engine / gearbox state
  const redline = S.redline, idleW = (S.idle || 900) * TAU / 60; let we = B.we;
  const ratioOf = g => g < 0 ? -S.rev * S.final : S.gears[g - 1] * S.final, Rg = ratioOf(c.gear), nrOf = w_ => w_ * 60 / TAU / redline;
  const drv = S.drive === 'AWD' ? [S.awdF / 2, S.awdF / 2, (1 - S.awdF) / 2, (1 - S.awdF) / 2] : S.drive === 'FWD' ? [0.5, 0.5, 0, 0] : [0, 0, 0.5, 0.5];
  const nitroOn = !!inp.nitro && c.nitro > 0 && drive > 0.1 && !rev; c.nitroOn = nitroOn; c.nitro = clamp(c.nitro + (nitroOn ? -24 : 6) * h, 0, 100);
  B.thrS += (drive - B.thrS) * Math.min(1, h / 0.045); const thrE = B.thrS;
  c.shiftT = Math.max(0, c.shiftT - h); B.shiftBlock = Math.max(0, B.shiftBlock - h); B.limT = Math.max(0, B.limT - h); c.thr = drive;
  if (c.shiftT === 0 && B.ramp < 1) B.ramp = Math.min(1, B.ramp + h / Math.min(0.06, S.shift * 0.6));
  // drive-wheel mean speed for the gearbox decisions
  let wbar = 0; for (let i = 0; i < 4; i++) wbar += drv[i] * W[i].om; const inW = Math.min(Math.abs(wbar), (Math.hypot(u, v) * 1.3 + 2.5) / rw);   // gearbox decisions use road speed when the wheels are spinning (no upshift into wheelspin)
  if (!manual && !rev && c.shiftT === 0 && B.shiftBlock === 0) {
    const top = S.gears.length, wheelRpm = inW * ratioOf(c.gear) * 60 / TAU, lowerRpm = c.gear > 1 ? inW * ratioOf(c.gear - 1) * 60 / TAU : 0;
    if (c.gear < top && wheelRpm > (S.upN || 0.93) * redline && drive > 0.2) { c.gear++; c.shiftT = S.shift; B.ramp = 0; B.shiftBlock = 0.7; c.shifts++; }
    else if (c.gear > 1 && ((wheelRpm < 0.40 * redline && lowerRpm < 0.86 * redline) || (drive > 0.9 && lowerRpm < 0.82 * redline && wheelRpm < 0.7 * redline && B.thrS > 0.9))) { c.gear--; c.shiftT = S.shift * 0.6; B.ramp = 0; B.shiftBlock = 0.6; c.shifts++; }
  }
  const Rg2 = ratioOf(c.gear);
  const boostT = S.turbo > 0 ? thrE * sstep((nrOf(we) - 0.22) / 0.3) : thrE, brate = boostT > c.boost ? (S.lag || 1.7) : 4; c.boost = S.turbo > 0 ? c.boost + clamp(boostT - c.boost, -brate * h, brate * h) : thrE;
  // TCS: only modulates engine torque. Works straight and in corners; off while the handbrake is held (F2 turns it off for drifting)
  c.tcsOn = false;
  // ---- inner loop: tyre forces -> wheel + engine dynamics (semi-implicit, closed-form clutch coupling)
  const hi = h / NW, acc = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]; let rearS = 0; c.absOn = false;
  for (let it = 0; it < NW; it++) {
    const rpm = we * 60 / TAU, nr = rpm / redline;
    let pk = S.torque * curve(S, nr) * (1 - S.turbo + S.turbo * c.boost) * (nitroOn ? 1.35 : 1) * (S.vmax && u > 0 ? clamp((S.vmax / 3.6 - u) / 1.5, 0, 1) : 1) * (rev ? clamp((11 + u) / 2, 0, 1) : 1);
    c.lim = rpm >= redline * 0.995 && thrE > 0.2; if (rpm >= redline) B.limT = 0.07;
    let thrC = thrE * (aTCS ? 0.4 + 0.6 * B.tcsS : 1); if (B.limT > 0 || c.shiftT > 0) thrC = 0;
    // launch control (manual gearbox): standing on brake and throttle together holds the engine at the best revs with the clutch out
    const launching = !!inp.launch && manual && c.gear > 0 && spd < 1 && brk > 0.5 && thr > 0.5, launchRpm = S.launch || redline * (S.turbo ? 0.55 : 0.6);
    if (launching && rpm > launchRpm) thrC = 0; c.launch = launching;
    let Te = pk * thrC - S.torque * (0.06 + 0.2 * nr) * (1 - 0.9 * thrC);
    if (!engineOff && we < idleW * 1.03) Te += clamp((idleW - we) * d.Ie * 35, 0, 0.4 * S.torque);
    if (c.shiftT > 0) Te += clamp((Math.abs(Rg2 * wbar) - we) * d.Ie * 25, -0.5 * S.torque, 0.5 * S.torque);   // rev-match during the shift
    const Lr = (S.idle + 700) + ((S.launch || redline * (S.turbo ? 0.52 : 0.5)) - (S.idle + 700)) * thrE;   // launch rpm (scales with the pedal): the auto clutch bites around here and slips until the wheels catch up
    const win = sstep((Math.abs(Rg2 * wbar) / Math.max(we, idleW) - 0.55) / 0.35);                    // input shaft approaching engine speed -> clutch locks up progressively (also engine braking on overrun)
    const eng = Math.min(B.ramp, Math.max(sstep((rpm - (Lr - 250)) / 600), win)) * (c.shiftT > 0 ? 0 : 1);
    const Tcmax = 2.0 * S.torque * (S.turbo ? 1.2 : 1), Tc = Tcmax * (engineOff ? 0 : eng) * (aTCS && c.gear > 0 ? B.tcsS : 1), w0 = 7, dW = we - Rg2 * wbar, th2 = Math.tanh(dW / w0), Tcl0 = launching ? 0 : Tc * th2, kc = launching ? 0 : Tc / w0 * (1 - th2 * th2) + 0.02 * Tc / w0;
    // tyres
    let Aa = 0, Bc = 0; const xi = [0, 0, 0, 0], aI = [0, 0, 0, 0], Fxs = [0, 0, 0, 0];
    // LSD / locked diff: torque between left and right wheel of a driven axle
    const lsd = [0, 0, 0, 0]; if (S.diff !== 'open') for (const [a, bb] of [[0, 1], [2, 3]]) { if (drv[a] === 0) continue; const dW2 = W[a].om - W[bb].om, K = S.diff === 'locked' ? 600 : (S.lsdK || 90), mx = S.diff === 'locked' ? 1e5 : (S.lsdMax || 700), tq = clamp(K * dW2 + (S.diff === 'locked' ? 0 : (S.lsdPre || 120) * Math.tanh(dW2 * 2)), -mx, mx); lsd[a] = tq; lsd[bb] = -tq; }
    for (let i = 0; i < 4; i++) {
      const w = W[i]; let Fx = 0, Fy = 0, K = 0;
      if (w.hit && w.N > 1) {
        const N = w.N, mu = w.muE, den = Math.abs(w.vx) / d.sig, sv = rw * w.om - w.vx, lf = 1 - sstep(Math.abs(w.vx) / 3);
        w.xd = (w.xd + hi * sv) / (1 + hi * den); w.yd = (w.yd - hi * w.vy) / (1 + hi * den); const lim = d.sig * 4; w.xd = clamp(w.xd, -lim * 0.35, lim * 0.35); w.yd = clamp(w.yd, -lim, lim);
        const kx = w.xd / d.sig / 0.12, ky = w.yd / d.sig / APK, s = Math.hypot(kx, ky);
        const mx = S.muX || 1.15;                                                                   // longitudinal grip is a bit higher than lateral on real tyres (friction ellipse)
        if (s > 1e-6) { const f = fmag(s, kx * kx / (s * s)); Fx = mu * mx * N * f * kx / s; Fy = mu * N * f * ky / s; const kx2 = kx + (hi * rw * 0.5 / (1 + hi * den)) / d.sig / 0.12, s2 = Math.hypot(kx2, ky), f2 = fmag(s2, kx2 * kx2 / (s2 * s2)); K = (mu * mx * N * f2 * kx2 / s2 - Fx) / 0.5; }
        else K = mu * N * 3 / 0.12 * hi * rw / d.sig;
        const cd = 3.5 * N * lf; Fx += cd * sv * 0.5; Fy += -cd * w.vy; K += cd * 0.5 * rw;
        const fm = Math.hypot(Fx / mx, Fy), cap = mu * N * 1.02; if (fm > cap) { Fx *= cap / fm; Fy *= cap / fm; }
        // rolling resistance
        Fx += -w.rr * N * Math.tanh(w.vx / 0.4);
        w.kap = w.xd / d.sig; w.alp = w.yd / d.sig;
      } else { w.xd *= 0.9; w.yd *= 0.9; w.kap = 0; w.alp = 0; }
      w.Fx = Fx; w.Fy = Fy; Fxs[i] = Fx; K = Math.max(0, K);
      const aI_ = hi / (d.Iw + hi * rw * K); aI[i] = aI_;
      xi[i] = rw * Fx + lsd[i];                                                             // torque opposing the wheel: tyre reaction + diff transfer (the brake is applied below as exact Coulomb friction: it can hold a wheel at rest)
      // ABS: reduce pressure on a wheel that is locking (slip ratio below peak)
      if (it === 0 && w.hit) { const kapR = (rw * w.om - w.vx) / Math.max(Math.abs(w.vx), 1.5); w.kapR = kapR;
        if (aABS && brakeIn > 0.05 && Math.abs(w.vx) > 2.5 && kapR * sg(w.vx) < -0.13 && !hb) { w.abs = Math.max(0.05, w.abs - 14 * h * 3); c.absOn = true; } else w.abs = Math.min(1, w.abs + 7 * h); }
      else if (it === 0) w.abs = Math.min(1, w.abs + 7 * h);
      Aa += drv[i] * drv[i] * aI_ * Rg2 * S.eff; Bc += drv[i] * aI_ * xi[i];
    }
    const Tcl = clamp((Tcl0 + kc * (hi * Te / d.Ie + Rg2 * Bc)) / (1 + kc * (hi / d.Ie + Rg2 * Aa)), -Tc, Tc);
    we = Math.max(engineOff ? 0 : 0.35 * idleW, we + hi * (Te - Tcl) / d.Ie); c.dbg = { Te, Tcl, Tc, eng, wbar, thrC, tcs: B.tcsS };
    let wbarN = 0;
    for (let i = 0; i < 4; i++) { const w = W[i], dw = aI[i] * (drv[i] * Rg2 * S.eff * Tcl - xi[i]); let on = w.om + dw; if (Tb[i] > 0) { const bd = hi * Tb[i] / d.Iw; on = Math.abs(on) <= bd ? 0 : on - sg(on) * bd; } w.om = on; w.ang += on * hi; wbarN += drv[i] * on;
      acc[i][0] += w.Fx; acc[i][1] += w.Fy; }
    wbar = wbarN;
    // traction control: holds the driven wheels near peak slip - much less slip while turning (the tyre needs its grip sideways) - and backs off if the rear starts to slide
    if (it === NW - 1 && aTCS) { let mx_ = 0, sm = 0, cnt = 0; for (let i = 0; i < 4; i++) if (drv[i] && W[i].hit) { const k_ = W[i].kapR || 0; mx_ = Math.max(mx_, k_); sm += k_; cnt++; } const mk = cnt ? 0.5 * mx_ + 0.5 * sm / cnt : 0;
      if (thrE > 0.1 && !rev && !hb && c.air === false) {
        const turning = clamp(Math.max(Math.abs(yawRate) / 0.35, Math.abs(inp.steer) * 0.8, (slipRear - 0.05) * 20), 0, 1), over = Math.max(mk - (0.17 - 0.11 * turning), (slipRear - 0.07) * 2);
        B.tcsS = clamp(B.tcsS - over * h * (over > 0 ? 14.4 + 10 * turning : 7), 0.18 - 0.12 * turning, 1); if (over > 0.02 && B.tcsS < 0.95) c.tcsOn = true;
      } else B.tcsS = Math.min(1, B.tcsS + 4 * h); }
    else if (!aTCS) B.tcsS = 1;
  }
  B.we = we; c.rpm = we * 60 / TAU;
  // ---- apply averaged tyre forces at the contact patches
  c.spin = false; let sl = 0;
  for (let i = 0; i < 4; i++) { const w = W[i]; if (!w.hit || w.N <= 0) { w.slipV = 0; continue; }
    const fx = acc[i][0] / NW, fy = acc[i][1] / NW, Fv = [w.Fg[0] * fx + w.Lg[0] * fy + w.nrm[0] * w.N, w.Fg[1] * fx + w.Lg[1] * fy + w.nrm[1] * w.N, w.Fg[2] * fx + w.Lg[2] * fy + w.nrm[2] * w.N];
    addF(Fv, w.r); w.Fx = fx; w.Fy = fy;
    // sliding speed of the contact patch (for sound, smoke, tracks)
    const sv = rw * w.om - w.vx; w.slipV = Math.hypot(sv * (Math.abs(w.kap) > 0.02 ? 1 : 0.4), w.vy); w.sv = sv;
    w.temp = clamp(w.temp + h * ((Math.abs(fx * sv) * (Math.abs(w.kap) > 0.05 ? 1 : 0.15) + Math.abs(fy * w.vy)) / 15000 - (w.temp - 65) * 0.045 * (1 + spd / 40)), 20, 180);
    const nk = Math.hypot(w.kap / 0.12, w.alp / APK); w.slipN = nk; if (nk > 1.15 && Math.hypot(w.vx, w.vy) > 1.5) { sl++; if (i >= 2) rearS += nk; } if (Math.abs(sv) > 3 && drv[i] > 0) c.spin = true;
    // sinkage in soft ground: deeper when spinning, a bit less at speed
    const spdK = Math.min(1, Math.hypot(w.vx, w.vy) / 25), tgS = w.sinkT * (1 - 0.45 * spdK) + (w.sinkT > 0.01 ? 0.03 * Math.min(1, Math.abs(sv) / 8) : 0); w.sink += (tgS - w.sink) * Math.min(1, 8 * h);
    // soft-ground drag adds extra resistance by sinkage; water drag by depth
    if (w.wet > 0.02) { const dg = Math.min(w.wet, 0.6) * 1800 * (1 + 0.15 * Math.hypot(w.vx, w.vy)); addF([-w.vx * w.Fg[0] * dg / 3 - w.vy * w.Lg[0] * dg / 3, 0, -w.vx * w.Fg[2] * dg / 3 - w.vy * w.Lg[2] * dg / 3], w.r); }
    if (w.sink > 0.012) { const vp = Math.hypot(w.vx, w.vy), plough = Math.min(2600, w.sink * 130 * Math.max(0, vp - 14) ** 2); if (plough > 0) addF([-(w.vx * w.Fg[0] + w.vy * w.Lg[0]) / vp * plough, 0, -(w.vx * w.Fg[2] + w.vy * w.Lg[2]) / vp * plough], w.r); }   // at speed the wheel ploughs: drag grows with the square
    if (w.sink > 0.02) { const dg = w.sink * 9000; addF([-(w.vx * w.Fg[0] + w.vy * w.Lg[0]) * dg / 25, 0, -(w.vx * w.Fg[2] + w.vy * w.Lg[2]) * dg / 25], w.r); } }
  c.rearSlip = (W[2].hit || W[3].hit) ? Math.min(1.2, (rearS / 2) * 0.17) : 0; c.locked = brakeIn > 0.2 && !aABS && (W[0].hit && W[0].kapR < -0.8 && Math.abs(W[0].vx) > 3);
  // ---- aerodynamics: drag + downforce at the axles (pitch balance emerges)
  const sp2 = Math.hypot(vel[0], vel[1], vel[2]);
  if (sp2 > 0.1) { const fd = 0.5 * RHO * S.cdA * sp2, dF = [-vel[0] * fd, -vel[1] * fd, -vel[2] * fd]; addF(dF, [U[0] * 0.2, U[1] * 0.2, U[2] * 0.2]);
    const fdn = 0.5 * RHO * (S.clA || 0) * sp2 * sp2; if (fdn > 1) { addF([-U[0] * fdn * 0.45, -U[1] * fdn * 0.45, -U[2] * fdn * 0.45], [F[0] * d.a, F[1] * d.a, F[2] * d.a]); addF([-U[0] * fdn * 0.55, -U[1] * fdn * 0.55, -U[2] * fdn * 0.55], [-F[0] * d.b, -F[1] * d.b, -F[2] * d.b]); } }
  // ---- body vs ground (bottoming out, landing, rolling over)
  c.scrape = 0;
  if (c.air || U[1] < 0.92 || maxX > 0.78 * T) {
    const hl = d.L * 0.5 + 0.55, pts = [[d.a + 0.82, 0, -d.cgh + 0.16], [-d.b - 0.88, 0, -d.cgh + 0.18], [0, t / 2 + 0.1, -d.cgh + 0.22], [0, -t / 2 - 0.1, -d.cgh + 0.22], [d.a * 0.2, t / 2 - 0.1, 0.78 - d.cgh * 0.0], [d.a * 0.2, -t / 2 + 0.1, 0.78], [-d.b * 0.6, t / 2 - 0.1, 0.8], [-d.b * 0.6, -t / 2 + 0.1, 0.8]];
    for (const pt of pts) { const r = [F[0] * pt[0] + L[0] * pt[1] + U[0] * pt[2], F[1] * pt[0] + L[1] * pt[1] + U[1] * pt[2], F[2] * pt[0] + L[2] * pt[1] + U[2] * pt[2]], wx = p[0] + r[0], wy = p[1] + r[1], wz = p[2] + r[2], gy = probe(wx, wz).y, dep = gy - wy; if (dep <= 0) continue;
      const pv = [vel[0] + wr[1] * r[2] - wr[2] * r[1], vel[1] + wr[2] * r[0] - wr[0] * r[2], vel[2] + wr[0] * r[1] - wr[1] * r[0]], vn = pv[1], fn = clamp(160000 * dep + (vn < 0 ? -vn * 4500 : 0), 0, 90000), tv = Math.hypot(pv[0], pv[2]) + 0.4;
      const f = [-pv[0] / tv * 0.8 * fn, fn, -pv[2] / tv * 0.8 * fn]; addF(f, r); c.scrape = Math.max(c.scrape, fn * (0.5 + Math.hypot(pv[0], pv[2])) / 100000); c.hitX = wx; c.hitY = wy; c.hitZ = wz; }
  }
  // ---- integrate the rigid body
  const iv = 1 / m; const acl = [Ftot[0] * iv, Ftot[1] * iv, Ftot[2] * iv];
  vel[0] += acl[0] * h; vel[1] += acl[1] * h; vel[2] += acl[2] * h;
  const Tb3 = [dot(Ttot, F), dot(Ttot, L), dot(Ttot, U)], I3 = [d.IF, d.IL, d.IU], w3 = B.wb, gy = [(I3[1] - I3[2]) * w3[1] * w3[2], (I3[2] - I3[0]) * w3[2] * w3[0], (I3[0] - I3[1]) * w3[0] * w3[1]];
  for (let k = 0; k < 3; k++) w3[k] += (Tb3[k] - gy[k]) / I3[k] * h;
  for (let k = 0; k < 3; k++) w3[k] = clamp(w3[k], -25, 25);
  p[0] += vel[0] * h; p[1] += vel[1] * h; p[2] += vel[2] * h;
  const hw = [w3[0] * h / 2, w3[1] * h / 2, w3[2] * h / 2]; B.q = qnorm(qmul(B.q, [1, hw[0], hw[1], hw[2]]));
  // map edge
  const x0 = BOUNDS.x0 + 40, x1 = BOUNDS.x1 - 40, z0 = BOUNDS.z0 + 40, z1 = BOUNDS.z1 - 40; if (!TEST.flat && (p[0] < x0 || p[0] > x1 || p[2] < z0 || p[2] > z1)) { p[0] = clamp(p[0], x0, x1); p[2] = clamp(p[2], z0, z1); vel[0] *= 0.9; vel[2] *= 0.9; }
  if (!(Math.abs(vel[0]) < 300 && Math.abs(vel[1]) < 300 && Math.abs(vel[2]) < 300 && Math.abs(p[1]) < 1e5 && Number.isFinite(B.q[0]))) { if (TEST.debug) console.warn('physics reset', JSON.stringify({ vel, p, q: B.q, wb: B.wb, we, om: W.map(w => w.om), xd: W.map(w => [w.xd, w.yd]), N: W.map(w => w.N) })); placeCar(c, c.init.x, c.init.z, c.init.yaw, 0); return; }
  // ---- airborne bookkeeping, public derived values
  const airNow = nHit === 0; if (airNow) { c.airT += h; if (c.airT > 0.06) c.air = true; } else { if (c.air || c.airT > 0.15) { c.landed = Math.max(0, -B.aPrev[1]); c.impact = c.landed; } else c.landed *= 0.98; c.air = false; c.airT = 0; }
  B.aPrev = [vel[0], vel[1], vel[2]];
  const u1 = dot(vel, hF), v1 = dot(vel, hL); c.u = u1; c.v = v1; c.vy = vel[1]; c.r = (B.wb[0] * F[1] + B.wb[1] * L[1] + B.wb[2] * U[1]);
  c.ax += (dot(acl, hF) - c.ax) * Math.min(1, 12 * h); c.ay += (dot(acl, hL) - c.ay) * Math.min(1, 10 * h);
  c.kmh = Math.hypot(vel[0], vel[2]) * 3.6; c.slip = Math.hypot(u1, v1) > 2 ? Math.atan2(v1, Math.abs(u1)) * 180 / Math.PI : 0;
  // dominant surface under the wheels
  { const cnt = {}; let best = 'road', bn = -1; for (const w of W) { if (!w.hit) continue; cnt[w.kind] = (cnt[w.kind] || 0) + 1; if (cnt[w.kind] > bn) { bn = cnt[w.kind]; best = w.kind; } } c.kind = best; }
  for (const w of W) { w.sus_rel = w.sus - (w.front ? (T - d.xF) : (T - d.xR)); }
}
const fr_ = w => w.front === 1 || w.front === true;
// ---- publish the interpolated render pose (mesh origin on the ground below the COM) + orientation, and the derived angles
function publish(c, S, alpha) {
  const B = c.b, d = derive(S), q = B.qp.map((v, i) => v + (B.q[i] - v) * alpha); qnorm(q); const bs = basisQ(q), p = [B.pp[0] + (B.p[0] - B.pp[0]) * alpha, B.pp[1] + (B.p[1] - B.pp[1]) * alpha, B.pp[2] + (B.p[2] - B.pp[2]) * alpha];
  c.F = bs.F; c.L = bs.L; c.U = bs.U; c.x = p[0] - bs.U[0] * d.cgh; c.y = p[1] - bs.U[1] * d.cgh; c.z = p[2] - bs.U[2] * d.cgh; c.cx = p[0]; c.cy = p[1]; c.cz = p[2];
  c.yaw = Math.atan2(bs.F[0], bs.F[2]); c.pitch = Math.asin(clamp(bs.F[1], -1, 1)); c.roll = Math.asin(clamp(bs.L[1], -1, 1));
  const m = qmul(q, Q1); c.mq = [m[1], m[2], m[3], m[0]];
}
// advance by frame time (fixed substeps) then publish an interpolated pose
export function stepCar(c, inp, S, dt) {
  if (!c.b) initBody(c, S); c._acc = (c._acc || 0) + dt; let n = 0;
  while (c._acc >= STEP && n < 30) { sub(c, S, inp, STEP); c._acc -= STEP; n++; if (!c.b) { initBody(c, S); } }
  if (n === 30) c._acc = 0; publish(c, S, clamp(c._acc / STEP, 0, 1));   // at most a quarter second per call
}
// world position of a point given in body coordinates (f forward, l left, up above the COM)
export const bodyPoint = (c, f, l, up) => { const B = c.b; return [B.p[0] + c.F[0] * f + c.L[0] * l + c.U[0] * up, B.p[1] + c.F[1] * f + c.L[1] * l + c.U[1] * up, B.p[2] + c.F[2] * f + c.L[2] * l + c.U[2] * up]; };
// impulse at a world point (collision response). n: contact normal (pointing away from the obstacle, towards the car). e: restitution, mu: friction.
// other: velocity of the obstacle [x,y,z] and its mass (Infinity for static). Returns the closing speed along n (0 if separating).
// how much a crash bounces back: bodywork crumples and soaks up the energy, so the harder the hit the less rebound
export const crashBounce = (base = 0.12) => closing => base / (1 + closing / 8);
export function impulseAt(c, S, P0, n, e = 0.25, mu = 0.45, ov = [0, 0, 0], mOther = Infinity) {
  const B = c.b; if (!B) return 0; const d = derive(S), bs = basisQ(B.q), F = bs.F, L = bs.L, U = bs.U, r = [P0[0] - B.p[0], P0[1] - B.p[1], P0[2] - B.p[2]];
  const wr = [F[0] * B.wb[0] + L[0] * B.wb[1] + U[0] * B.wb[2], F[1] * B.wb[0] + L[1] * B.wb[1] + U[1] * B.wb[2], F[2] * B.wb[0] + L[2] * B.wb[1] + U[2] * B.wb[2]];
  const pv = [B.vel[0] + wr[1] * r[2] - wr[2] * r[1] - ov[0], B.vel[1] + wr[2] * r[0] - wr[0] * r[2] - ov[1], B.vel[2] + wr[0] * r[1] - wr[1] * r[0] - ov[2]], vn = dot(pv, n); if (vn >= 0) return 0;
  const invI = (v3) => { const b3 = [dot(v3, F), dot(v3, L), dot(v3, U)], s = [b3[0] / d.IF, b3[1] / d.IL, b3[2] / d.IU]; return [F[0] * s[0] + L[0] * s[1] + U[0] * s[2], F[1] * s[0] + L[1] * s[1] + U[1] * s[2], F[2] * s[0] + L[2] * s[1] + U[2] * s[2]]; };
  const apply = (J) => { B.vel[0] += J[0] / d.m; B.vel[1] += J[1] / d.m; B.vel[2] += J[2] / d.m; const dw = invI(cross(r, J)); B.wb[0] += dot(dw, F); B.wb[1] += dot(dw, L); B.wb[2] += dot(dw, U); };
  const den = (dir) => { const rn = cross(r, dir), t = invI(rn); return 1 / d.m + dot(cross(t, r), dir) + (mOther === Infinity ? 0 : 1 / mOther); };
  const j = -(1 + (typeof e === 'function' ? e(-vn) : e)) * vn / den(n); apply([n[0] * j, n[1] * j, n[2] * j]);
  const vt = [pv[0] - vn * n[0], pv[1] - vn * n[1], pv[2] - vn * n[2]], vtl = Math.hypot(...vt);
  if (vtl > 1e-3) { const tdir = [-vt[0] / vtl, -vt[1] / vtl, -vt[2] / vtl], jt = Math.min(mu * j, vtl / den(tdir)); apply([tdir[0] * jt, tdir[1] * jt, tdir[2] * jt]); }
  c.impact = Math.max(c.impact || 0, -vn); return -vn;
}
export function pushOut(c, S, dx, dy, dz) { const B = c.b; if (!B) return; B.p[0] += dx; B.p[1] += dy; B.p[2] += dz; B.pp[0] += dx; B.pp[1] += dy; B.pp[2] += dz; c.x += dx; c.y += dy; c.z += dz; }
export function syncVel(c) { const B = c.b; if (!B) return; const hn = Math.hypot(c.F[0], c.F[2]) || 1, sy = c.F[0] / hn, cy = c.F[2] / hn; c.u = B.vel[0] * sy + B.vel[2] * cy; c.v = B.vel[0] * cy - B.vel[2] * sy; c.kmh = Math.hypot(B.vel[0], B.vel[2]) * 3.6; }
export const carMass = S => S.mass;
// after a hard hit the wheels must not keep their old speed: left spinning they would drive the stopped car on and twist it round
export function settleWheels(c, S) { const B = c.b; if (!B) return; for (const w of c.w) { w.om = c.u / S.rw; w.xd = 0; w.yd = 0; w.xp = null; } B.we = Math.max((S.idle || 900) * TAU / 60, Math.min(B.we, Math.abs(c.u) / S.rw * Math.abs(c.gear < 0 ? S.rev : S.gears[c.gear - 1]) * S.final)); }



