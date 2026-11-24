// physics.js - shared, headless-testable car physics. Bicycle model + Pacejka tyres + friction ellipse,
// longitudinal weight transfer, RWD, torque curve, 6-speed auto, handbrake, nitro, surfaces, slopes, jumps.
// Conventions: forward = (sin yaw, cos yaw), left = (cos yaw, -sin yaw) in (x,z). u forward speed, v lateral (left+), r yaw rate (left+).
import { ROAD_HALF, roadQuery, terrainH, BOUNDS, sstep } from './world.js';
export const G = 9.81, STEP = 1 / 120;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ground height + surface at (x,z). Road surface is the road ribbon; elsewhere terrain.
const P = { y: 0, grip: 1, rr: 0.012, kind: 'road' };
export function probe(x, z) {
  const q = roadQuery(x, z, 14), th = terrainH(x, z);
  if (q.d < ROAD_HALF + 1.2) { const w = sstep((q.d - ROAD_HALF) / 1.2); P.y = q.y * (1 - w) + th * w; } else P.y = th;
  if (q.d <= ROAD_HALF + 0.3) { P.grip = 1; P.rr = 0.012; P.kind = 'road'; }
  else if (q.d < 10) { P.grip = 0.82; P.rr = 0.03; P.kind = 'gravel'; }
  else if (th < 0.25) { P.grip = 0.35; P.rr = 0.30; P.kind = 'water'; }
  else if (z > 740 && x < 420 && th < 5.2) { P.grip = 0.55; P.rr = 0.09; P.kind = 'sand'; }
  else { P.grip = 0.62; P.rr = 0.05; P.kind = 'grass'; }
  return P;
}
export const groundAt = (x, z) => probe(x, z).y;

// Pacejka "magic formula" (normalised lateral): peak ~ 1 at slip ~6 deg, ~0.85 sliding
const B = 9, Cc = 1.5, E = 0.25;
const pac = a => { const x = B * a; return Math.sin(Cc * Math.atan(x - E * (x - Math.atan(x)))); };
// engine torque curve (fraction of peak) vs rpm/redline
const curve = n => Math.max(0.35, 1 - (n < 0.62 ? 0.8 : 0.3) * Math.pow((n - 0.62) / (n < 0.62 ? 0.62 : 0.38), 2));

export function newCar(x = 0, z = 0, yaw = 0) {
  return { x, z, yaw, u: 0, v: 0, r: 0, y: groundAt(x, z), vy: 0, air: false, rpm: 900, gear: 1, shiftT: 0, nitro: 100, steer: 0, ax: 0, ay: 0,
    pitch: 0, roll: 0, kmh: 0, slip: 0, rearSlip: 0, spin: false, kind: 'road', nitroOn: false, hb: false, airT: 0, landed: 0 };
}

// advance one fixed substep. inp: {throttle,brake,steer,handbrake,nitro}
function sub(c, inp, S, h) {
  const m = S.mass, L = S.wb, b = L * S.front, a = L - b, Iz = 1.15 * m * a * b + 400;
  const p = probe(c.x, c.z), sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
  // ground probes for slope / alignment (front, rear, left, right)
  const hf = groundAt(c.x + sy * a, c.z + cy * a), hr = groundAt(c.x - sy * b, c.z - cy * b), hl = groundAt(c.x + cy * 0.8, c.z - sy * 0.8), hrr = groundAt(c.x - cy * 0.8, c.z + sy * 0.8);
  const slopeL = (hf - hr) / L, slopeS = (hl - hrr) / 1.6, g0 = probe(c.x, c.z); const gy = g0.y, grip = g0.grip, rr = g0.rr; c.kind = g0.kind;
  c.pitch = Math.atan(slopeL); c.roll = Math.atan(slopeS);

  // --- vertical: follow ground, or fly off crests
  if (!c.air) {
    const free = c.y + c.vy * h - 0.5 * G * h * h;            // where gravity alone would put the car
    if (free > gy + 0.05 && c.vy > -1e9 && (c.u > 8 || c.u < -8)) { c.air = true; c.airT = 0; }
    else { c.vy = (gy - c.y) / h; c.vy = clamp(c.vy, -30, 30); c.y = gy; }
  }
  if (c.air) {
    c.y += c.vy * h; c.vy -= G * h; c.airT += h; c.r *= (1 - 0.6 * h);
    c.pitch = clamp(Math.atan2(c.vy, Math.max(5, Math.abs(c.u))) * 0.8, -0.5, 0.5);
    if (c.y <= gy) { c.y = gy; c.landed = Math.max(0, -c.vy); c.air = false; const k = clamp(c.landed / 25, 0, 0.35); c.u *= (1 - k * 0.5); c.v *= (1 - k * 0.5); c.vy = 0; }
  }

  // --- inputs
  const thr = clamp(inp.throttle, 0, 1), brk = clamp(inp.brake, 0, 1), hb = !!inp.handbrake;
  c.hb = hb;
  if (c.gear < 0) { if (thr > 0.05 && c.u > -1) c.gear = 1; } else if (brk > 0.05 && c.u < 0.8 && thr < 0.05) c.gear = -1;
  const rev = c.gear < 0, drive = rev ? brk : thr, brakeIn = rev ? thr : brk;
  // steering: speed-sensitive lock + counter-steer assist (so keyboard drifts are catchable)
  const spd = Math.abs(c.u), lock = S.steerMax / (1 + Math.pow(spd / 22, 1.6)) + 0.05;
  let target = clamp(inp.steer, -1, 1) * lock;
  if (!c.air && spd > 6) { const slipR = Math.atan2(c.v - b * c.r, Math.max(spd, 1)); target += clamp(slipR * 0.55, -0.35, 0.35) * (Math.abs(inp.steer) > 0.05 ? 0.6 : 1); }
  c.steer += clamp(target - c.steer, -7 * h * (Math.abs(target) > Math.abs(c.steer) ? 1 : 1.6), 7 * h * (Math.abs(target) > Math.abs(c.steer) ? 1 : 1.6));
  const d = clamp(c.steer, -0.65, 0.65), cd = Math.cos(d), sd = Math.sin(d);

  // --- engine + gearbox
  const ratio = rev ? S.rev : S.gears[c.gear - 1], wheelRpm = Math.abs(c.u) / S.rw * ratio * S.final * 60 / (2 * Math.PI);
  const launch = S.idle + drive * (0.55 * S.redline - S.idle);
  const engTarget = Math.max(S.idle, wheelRpm, Math.abs(c.u) < 8 ? launch : 0);
  c.rpm += (engTarget - c.rpm) * Math.min(1, 18 * h);
  if (c.rpm > S.redline * 1.02) c.rpm = S.redline * 1.02;
  c.shiftT = Math.max(0, c.shiftT - h);
  if (!rev && c.shiftT === 0) {
    if (c.gear < 6 && wheelRpm > 0.93 * S.redline && drive > 0.2) { c.gear++; c.shiftT = 0.22; }
    else if (c.gear > 1 && wheelRpm < 0.40 * S.redline) { c.gear--; c.shiftT = 0.12; }
  }
  const nitroOn = !!inp.nitro && c.nitro > 0 && drive > 0.1 && !rev; c.nitroOn = nitroOn;
  c.nitro = clamp(c.nitro + (nitroOn ? -24 : 6) * h, 0, 100);
  let T = S.torque * curve(c.rpm / S.redline) * drive * (nitroOn ? 1.5 : 1);
  if (c.rpm >= S.redline || c.shiftT > 0) T = 0;                                       // rev limiter / shift cut
  const dir = rev ? -1 : 1;
  let Fdrive = dir * T * ratio * S.final * S.eff / S.rw;
  if (drive < 0.05) Fdrive -= Math.sign(c.u) * Math.min(1, Math.abs(c.u) / 3) * 0.18 * S.torque * ratio * S.final / S.rw * (c.rpm / S.redline) * 0.4; // engine braking

  // --- loads (weight transfer from last step's accel, small aero downforce)
  const v2 = c.u * c.u + c.v * c.v, down = 0.5 * 1.2 * S.clA * v2;
  let Fzf = m * G * b / L - m * c.ax * S.cgh / L + down * 0.45, Fzr = m * G * a / L + m * c.ax * S.cgh / L + down * 0.55;
  if (hb) Fzr *= 0.6;                                                                    // handbrake unloads the rear
  Fzf = Math.max(Fzf, 0.15 * m * G); Fzr = Math.max(Fzr, 0.15 * m * G);
  const muF = S.muF * grip, muR = S.muR * grip * (hb ? 0.78 : 1);
  const sgn = c.u / Math.sqrt(c.u * c.u + 0.09);

  // longitudinal: rear drive, brakes front 62/ rear 38, friction limits
  const FmaxR = muR * Fzr, FmaxF = muF * Fzf;
  const stopCap = m * Math.abs(c.u) / h * 0.9;                                           // brakes can never reverse the car in one step
  let Fb = Math.min(brakeIn * S.brakeG * m * G, stopCap), Fxf = -sgn * Math.min(Fb * 0.62, FmaxF), Fxr = -sgn * Math.min(Fb * 0.38 + (hb ? FmaxR * 0.6 : 0), Math.min(stopCap, FmaxR * 1.2));
  c.spin = false;
  if (Fb === 0 || brakeIn < 0.02) { Fxr = Fdrive; if (Math.abs(Fxr) > FmaxR) { Fxr = Math.sign(Fxr) * FmaxR * 0.93; c.spin = true; } if (hb) { Fxr = -sgn * Math.min(stopCap, FmaxR * 0.6); } }
  const ellF = Math.sqrt(Math.max(0.1, 1 - 0.7 * Math.pow(Fxf / FmaxF, 2))), ellR = Math.sqrt(Math.max(0.1, 1 - 0.7 * Math.pow(Fxr / Math.max(FmaxR, 1), 2)));

  // lateral (Pacejka)
  const ue = c.u >= 0 ? Math.max(c.u, 1.5) : Math.min(c.u, -1.5);
  const ua = Math.abs(ue), aF = Math.atan((c.v + a * c.r) / ua) - d * Math.sign(ue), aR = Math.atan((c.v - b * c.r) / ua);   // valid for reverse too
  let Fyf = -Fzf * muF * pac(aF) * ellF, Fyr = -Fzr * muR * pac(aR) * ellR;
  if (c.air) { Fyf = Fyr = Fxf = Fxr = 0; }
  const low = 1 - sstep(spd / 4);                                                        // low-speed damping (avoids slip-angle singularity)
  Fyf += -c.v * m * 3 * low; Fyr += -c.v * m * 3 * low;
  const drag = 0.5 * 1.2 * S.cdA * v2 * Math.sign(c.u) + rr * m * G * sgn * (c.air ? 0 : 1) + (c.kind === 'water' ? 400 * c.u : 0);
  const gl = c.air ? 0 : -m * G * slopeL / Math.hypot(1, slopeL), gs = c.air ? 0 : -m * G * slopeS * 0.6;

  const du = (Fxf * cd + Fxr - Fyf * sd - drag + gl + (nitroOn ? 0.0 : 0)) / m + c.v * c.r;
  const dv = (Fyf * cd + Fyr + Fxf * sd + gs) / m - c.u * c.r;
  const dr = (a * (Fyf * cd + Fxf * sd) - b * Fyr) / Iz - c.r * 0.6 * low * 5 - c.r * 0.9 * (1 - low);   // yaw damping (tyre/chassis), keeps drifts catchable
  c.u += du * h; c.v += dv * h; c.r += dr * h;
  if (!(Math.abs(c.u) < 200)) { c.u = 0; } if (!(Math.abs(c.v) < 100)) c.v = 0; if (!(Math.abs(c.r) < 20)) c.r = 0;
  c.ax += (du - c.v * c.r - c.ax) * Math.min(1, 12 * h);                                // smoothed body accel (for weight transfer + visuals)
  c.ay += (c.u * c.r - c.ay) * Math.min(1, 10 * h);
  c.yaw += c.r * h; c.x += (c.u * sy + c.v * cy) * h; c.z += (c.u * cy - c.v * sy) * h;
  // keep inside the map
  const x0 = BOUNDS.x0 + 40, x1 = BOUNDS.x1 - 40, z0 = BOUNDS.z0 + 40, z1 = BOUNDS.z1 - 40;
  if (c.x < x0 || c.x > x1 || c.z < z0 || c.z > z1) { c.x = clamp(c.x, x0, x1); c.z = clamp(c.z, z0, z1); c.u *= 0.9; }
  c.kmh = Math.hypot(c.u, c.v) * 3.6; c.slip = spd > 2 ? Math.atan2(c.v, Math.abs(c.u)) * 180 / Math.PI : 0;
  c.rearSlip = Math.abs(aR) + (c.spin ? 0.1 : 0) + (hb && spd > 3 ? 0.3 : 0);
}
// advance by frame time (fixed substeps)
export function stepCar(c, inp, S, dt) { c._acc = (c._acc || 0) + dt; let n = 0; while (c._acc >= STEP && n < 12) { sub(c, inp, S, STEP); c._acc -= STEP; n++; } if (n === 12) c._acc = 0; }





