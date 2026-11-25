// world.js — shared by server and client. Pure math (no THREE): road loop + terrain height field.
// Design: closed road loop (centripetal Catmull-Rom through control points, resampled every DS metres,
// elevation low-passed + grade-limited). Terrain: flat at road height in a corridor, eases (smootherstep)
// to a blend of nearby road elevations, then to natural hills.
export const ROAD_HALF = 6;           // road half width (m)
export const CORRIDOR = 14;           // terrain flat at road height within this distance of centreline
export const BLEND1 = 50;             // corridor -> road-elevation blend width
export const BOUNDS = { x0: -1700, x1: 1700, z0: -1450, z1: 1500 };
export const CELL = 5;                // terrain mesh resolution (m)
export const NX = Math.round((BOUNDS.x1 - BOUNDS.x0) / CELL) + 1;
export const NZ = Math.round((BOUNDS.z1 - BOUNDS.z0) / CELL) + 1;
export const SEA = 0;
export const DS = 2;                  // road sample spacing target (m)
export const MAX_GRADE = 0.105;       // grade limiter target (test allows ~12%)

const sstep = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * t * (t * (t * 6 - 15) + 10); }; // smootherstep
export { sstep };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- deterministic value noise ----------
function hash2(ix, iz) { let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(ix, iz), hash2(ix + 1, iz), u), lerp(hash2(ix, iz + 1), hash2(ix + 1, iz + 1), u), v);
}
export const fbm = (x, z) => vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 7, z * 2.1 + 3) * 0.3 + vnoise(x * 4.3 + 1, z * 4.3 + 9) * 0.15;
export function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- control points [x, z, height] ----------
function controls() {
  const C = [[-1000, 760, 3], [-700, 860, 3], [-350, 900, 3], [0, 880, 4],            // BEACH (coast road)
    [350, 840, 6], [700, 860, 6], [1000, 720, 6], [1100, 380, 6], [1010, 0, 6], [860, -240, 6.5]]; // CITY
  // MOUNTAIN: 5 legs along x joined by R=80 hairpins (min radius ok), climbing ~7%
  const XW = 330, XE = 670, R = 80, Z0 = -330, N = 5, sb = []; let dir = -1;
  for (let k = 0; k < N; k++) {
    const z = Z0 - k * 2 * R, xa = dir < 0 ? XE : XW, xb = dir < 0 ? XW : XE;
    if (k === 0) sb.push([xa, z]);
    // sweeping S-bends along each leg (zero offset and zero slope at both ends, so the hairpins still join cleanly)
    const NW = 14; for (let m = 1; m < NW; m++) { const t = m / NW; sb.push([lerp(xa, xb, t), z + (k % 2 ? -1 : 1) * 15 * Math.sin(t * Math.PI * 3) * Math.sin(t * Math.PI)]); }
    sb.push([xb, z]);
    if (k < N - 1) { const cx = xb, cz = z - R; for (let a = 15; a <= 180; a += 15) { const f = a * Math.PI / 180; sb.push([cx + dir * R * Math.sin(f), cz + R * Math.cos(f)]); } }
    dir = -dir;
  }
  const hOf = (pts, from, h0, h1) => { // heights proportional to path length
    let tot = 0, cum = [0], prev = from;
    for (const p of pts) { tot += Math.hypot(p[0] - prev[0], p[1] - prev[1]); cum.push(tot); prev = p; }
    return pts.map((p, i) => [p[0], p[1], lerp(h0, h1, cum[i + 1] / tot)]);
  };
  const climb = hOf(sb, C[C.length - 1], 7, 200);
  const top = [[100, -1030, 200], [-150, -1075, 200]];                                  // overlook plateau
  const desc = hOf([[-500, -1060], [-850, -900], [-1150, -600], [-1300, -250], [-1300, 150], [-1200, 520], [-1000, 760]], [-150, -1075], 200, 3);
  // last of desc is the beach start point (-1000,760): drop it, loop closes to C[0]
  desc.pop();
  return [...C, ...climb, ...top, ...desc];
}

// centripetal Catmull-Rom (xz)
function crc(P0, P1, P2, P3, u) {
  const d = (A, B) => Math.max(Math.sqrt(Math.hypot(B[0] - A[0], B[1] - A[1])), 1e-4);
  const t0 = 0, t1 = d(P0, P1), t2 = t1 + d(P1, P2), t3 = t2 + d(P2, P3), t = lerp(t1, t2, u), o = [0, 0];
  for (let k = 0; k < 2; k++) {
    const A1 = lerp(P0[k], P1[k], (t - t0) / (t1 - t0)), A2 = lerp(P1[k], P2[k], (t - t1) / (t2 - t1)), A3 = lerp(P2[k], P3[k], (t - t2) / (t3 - t2));
    const B1 = lerp(A1, A2, (t - t0) / (t2 - t0)), B2 = lerp(A2, A3, (t - t1) / (t3 - t1));
    o[k] = lerp(B1, B2, (t - t1) / (t2 - t1));
  }
  return o;
}
const ucr = (a, b, c, d, u) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);

// ---------- build road ----------
export const ROAD = (() => {
  const C = controls(), n = C.length, dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = C[(i - 1 + n) % n], p1 = C[i], p2 = C[(i + 1) % n], p3 = C[(i + 2) % n];
    const steps = Math.max(6, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 1.5));
    for (let k = 0; k < steps; k++) { const u = k / steps, [x, z] = crc(p0, p1, p2, p3, u); dense.push([x, z, ucr(p0[2], p1[2], p2[2], p3[2], u)]); }
  }
  const m = dense.length, cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) { const a = dense[i], b = dense[(i + 1) % m]; cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const L = cum[m], N = Math.round(L / DS), ds = L / N;
  const X = new Float32Array(N), Z = new Float32Array(N); let H = new Float64Array(N), j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * ds; while (cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j]), a = dense[j], b = dense[(j + 1) % m];
    X[i] = lerp(a[0], b[0], f); Z[i] = lerp(a[1], b[1], f); H[i] = lerp(a[2], b[2], f);
  }
  // low-pass elevation (periodic gaussian), then grade limiter, then light smoothing again
  const smooth = (arr, sig) => { const r = Math.ceil(sig * 3), w = [], o = new Float64Array(N); let sw = 0;
    for (let k = -r; k <= r; k++) { const v = Math.exp(-k * k / (2 * sig * sig)); w.push(v); sw += v; }
    for (let i = 0; i < N; i++) { let a = 0; for (let k = -r; k <= r; k++) a += arr[(i + k + N * 4) % N] * w[k + r]; o[i] = a / sw; } return o; };
  H = smooth(H, 16);
  const lim = MAX_GRADE * ds;
  for (let pass = 0; pass < 400; pass++) { let ch = false;
    for (let i = 0; i < N; i++) { const k = (i + 1) % N, d = H[k] - H[i]; if (Math.abs(d) > lim) { const e = (Math.abs(d) - lim) / 2 * Math.sign(d); H[i] += e; H[k] -= e; ch = true; } }
    if (!ch) break; }
  H = smooth(H, 6);
  const Y = Float32Array.from(H), TX = new Float32Array(N), TZ = new Float32Array(N), S = new Float32Array(N);
  for (let i = 0; i < N; i++) { // averaged tangent over +-3 samples
    const a = (i - 3 + N) % N, b = (i + 3) % N, dx = X[b] - X[a], dz = Z[b] - Z[a], l = Math.hypot(dx, dz); TX[i] = dx / l; TZ[i] = dz / l; S[i] = i * ds; }
  return { N, ds, L, X, Z, Y, TX, TZ, S };
})();
export const ROAD_LEN = ROAD.L;
// point on road at arc length s, lateral offset lat (+lat = (-tz, tx) side). Returns {x,y,z,tx,tz}
export function roadAt(s, lat = 0) {
  const { N, ds } = ROAD; let f = ((s % ROAD.L) + ROAD.L) % ROAD.L / ds; const i = Math.floor(f) % N, k = (i + 1) % N; f -= Math.floor(f);
  const tx = lerp(ROAD.TX[i], ROAD.TX[k], f), tz = lerp(ROAD.TZ[i], ROAD.TZ[k], f), l = Math.hypot(tx, tz) || 1, ux = tx / l, uz = tz / l;
  return { x: lerp(ROAD.X[i], ROAD.X[k], f) - uz * lat, z: lerp(ROAD.Z[i], ROAD.Z[k], f) + ux * lat, y: lerp(ROAD.Y[i], ROAD.Y[k], f), tx: ux, tz: uz };
}

// ---------- spatial grid for nearest-road lookup ----------
const GC = 32, GW = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / GC) + 1, GH = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / GC) + 1;
const gStart = new Int32Array(GW * GH + 1), gIdx = new Int32Array(ROAD.N);
(() => { const cell = i => Math.floor((ROAD.X[i] - BOUNDS.x0) / GC) + Math.floor((ROAD.Z[i] - BOUNDS.z0) / GC) * GW;
  for (let i = 0; i < ROAD.N; i++) gStart[cell(i) + 1]++;
  for (let c = 0; c < GW * GH; c++) gStart[c + 1] += gStart[c];
  const fill = gStart.slice(0, GW * GH); for (let i = 0; i < ROAD.N; i++) gIdx[fill[cell(i)]++] = i; })();
const Q = { d: Infinity, s: 0, y: 0, lat: 0, i: 0 };
// nearest point on the road centreline; fills & returns shared object Q (d = Infinity if none within maxD)
export function roadQuery(x, z, maxD = 200) {
  const cx = Math.floor((x - BOUNDS.x0) / GC), cz = Math.floor((z - BOUNDS.z0) / GC), R = Math.ceil(maxD / GC) + 1;
  let best = Infinity, bi = -1;
  for (let r = 0; r <= R; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const gx = cx + dx, gz = cz + dz; if (gx < 0 || gz < 0 || gx >= GW || gz >= GH) continue;
      const c = gx + gz * GW;
      for (let k = gStart[c]; k < gStart[c + 1]; k++) { const i = gIdx[k], ex = ROAD.X[i] - x, ez = ROAD.Z[i] - z, d2 = ex * ex + ez * ez; if (d2 < best) { best = d2; bi = i; } }
    }
    if (best <= (r * GC) * (r * GC)) break;
  }
  if (bi < 0 || best > maxD * maxD) { Q.d = Infinity; return Q; }
  // refine on the two adjacent segments
  let bd = Infinity;
  for (const a of [(bi - 1 + ROAD.N) % ROAD.N, bi]) {
    const b = (a + 1) % ROAD.N, ax = ROAD.X[a], az = ROAD.Z[a], sx = ROAD.X[b] - ax, sz = ROAD.Z[b] - az;
    let t = ((x - ax) * sx + (z - az) * sz) / (sx * sx + sz * sz); t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + sx * t, pz = az + sz * t, d = Math.hypot(x - px, z - pz);
    if (d < bd) { bd = d; Q.d = d; Q.y = lerp(ROAD.Y[a], ROAD.Y[b], t); Q.s = (a + t) * ROAD.ds; Q.i = a;
      Q.lat = ((x - px) * -sz + (z - pz) * sx) / Math.hypot(sx, sz); }
  }
  return Q;
}

// ---------- smooth fields from road elevations (splatted gaussians on a 10 m grid) ----------
const FC = 10, FW = Math.round((BOUNDS.x1 - BOUNDS.x0) / FC) + 1, FH = Math.round((BOUNDS.z1 - BOUNDS.z0) / FC) + 1;
function makeField(sig) {
  const num = new Float32Array(FW * FH), den = new Float32Array(FW * FH), r = Math.ceil(3 * sig / FC);
  for (let i = 0; i < ROAD.N; i += 5) {
    const px = (ROAD.X[i] - BOUNDS.x0) / FC, pz = (ROAD.Z[i] - BOUNDS.z0) / FC, h = ROAD.Y[i];
    for (let gz = Math.max(0, Math.floor(pz) - r); gz <= Math.min(FH - 1, Math.floor(pz) + r); gz++)
      for (let gx = Math.max(0, Math.floor(px) - r); gx <= Math.min(FW - 1, Math.floor(px) + r); gx++) {
        const d2 = ((gx - px) * (gx - px) + (gz - pz) * (gz - pz)) * FC * FC, w = Math.exp(-d2 / (2 * sig * sig));
        num[gx + gz * FW] += w * h; den[gx + gz * FW] += w; }
  }
  const bil = (A, x, z) => { const fx = Math.min(FW - 1.001, Math.max(0, (x - BOUNDS.x0) / FC)), fz = Math.min(FH - 1.001, Math.max(0, (z - BOUNDS.z0) / FC));
    const ix = fx | 0, iz = fz | 0, u = fx - ix, v = fz - iz, o = ix + iz * FW;
    return lerp(lerp(A[o], A[o + 1], u), lerp(A[o + FW], A[o + FW + 1], u), v); };
  return { val: (x, z) => { const d = bil(den, x, z); return d > 1e-6 ? bil(num, x, z) / d : null; }, w: (x, z) => bil(den, x, z) };
}
const FSMALL = makeField(45), FLARGE = makeField(170);

// ---------- zones, coast, flat pads ----------
export const coastZ = x => 1000 + 50 * Math.sin(x / 260);                    // sea begins south of this
export function zoneAt(x, z) { return (z > 650 && x < 250) ? 'beach' : (x >= 250 && z > -150 && x < 1400) ? 'city' : 'mountain'; }
export const CITY_RECT = { x0: 330, z0: 40, x1: 1000, z1: 780, h: 5.88, blend: 70 };   // flat city pad (avenues, plaza)
export const ESTATE = { x0: -680, z0: 560, x1: -270, z1: 842, h: 3.1, blend: 45 };   // gated rich neighbourhood: flat pad just inland of the coast road
export const PLAZA = { x: 665, z: 410, r: 105 };                                     // open drifting plaza inside the city
// garages: building 40 m from the road centreline, glowing drive-in zone 19 m out; `yaw` makes the building front face the road
const GAR = [['beach', 'Beach Garage', -760, 870, -1], ['city', 'Downtown Garage', 500, 850, 1], ['mountain', 'Mountain Garage', 860, -240, 1]];
export const GARAGES = GAR.map(([id, name, x, z, side]) => {
  const s = roadQuery(x, z, 1e4).s, c = roadAt(s, side * 32), zn = roadAt(s, side * 19), b = roadAt(s, side * 40);
  return { id, name, s, side, y: c.y, cx: c.x, cz: c.z, bx: b.x, bz: b.z, zx: zn.x, zz: zn.z, r: 7, yaw: Math.atan2(side * c.tz, -side * c.tx), roadYaw: Math.atan2(c.tx, c.tz) };
});
export const PADS = (() => { // circular flat pads; overlook placed beside the highest road point
  let hi = 0; for (let i = 0; i < ROAD.N; i++) if (ROAD.Y[i] > ROAD.Y[hi] - 0.01 && ROAD.X[i] < -60 && ROAD.X[i] > -160) { hi = i; }
  const north = (-ROAD.TX[hi] > 0 ? 1 : -1); // choose lateral side with smaller z (outer/north side)
  const a = roadAt(hi * ROAD.ds, 34), b = roadAt(hi * ROAD.ds, -34), c = a.z < b.z ? a : b;
  return [{ x: c.x, z: c.z, r: 22, h: ROAD.Y[hi] - 0.15, blend: 40, name: 'overlook' },
    ...GARAGES.map(g => ({ x: g.cx, z: g.cz, r: 17, h: g.y - 0.15, blend: 25, name: g.id }))];   // flat pad under each garage (extends the road corridor)
})();

function drop(x, z) { // ocean + island edge depression
  const de = Math.min(x - BOUNDS.x0, BOUNDS.x1 - x, z - BOUNDS.z0, BOUNDS.z1 - z);
  return 12 * sstep((z - coastZ(x)) / 110) + 75 * sstep(1 - de / 260);
}
function base(x, z) { // natural hills (before road influence)
  const mm = sstep((-250 - z) / 450);
  return 3 + (fbm(x / 260, z / 260) - 0.5) * 7 + mm * 55 * (0.35 + 0.65 * fbm(x / 420 + 11, z / 420));
}
function natural(x, z) { const b = base(x, z), c = 1 - Math.exp(-FLARGE.w(x, z) / 6), F = FLARGE.val(x, z); return F === null ? b : b + c * (F - b); }
function cityW(x, z) { const R = CITY_RECT, dx = Math.max(R.x0 - x, 0, x - R.x1), dz = Math.max(R.z0 - z, 0, z - R.z1); return 1 - sstep(Math.hypot(dx, dz) / R.blend); }

// ---------- height field ----------
export const TERRAIN = { H: new Float32Array(NX * NZ), D: new Float32Array(NX * NZ) };
(() => {
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = BOUNDS.x0 + i * CELL, z = BOUNDS.z0 + j * CELL, q = roadQuery(x, z, 200), d = q.d, nat = natural(x, z) - drop(x, z);
    let mid = nat;
    if (d < 175) { const Fs = FSMALL.val(x, z); if (Fs !== null) mid = lerp(Fs - drop(x, z), nat, sstep((d - 40) / 130)); }
    const cw = cityW(x, z); if (cw > 0) mid = lerp(mid, CITY_RECT.h, cw);
    { const E = ESTATE, ew = 1 - sstep(Math.hypot(Math.max(E.x0 - x, 0, x - E.x1), Math.max(E.z0 - z, 0, z - E.z1)) / E.blend); if (ew > 0) mid = lerp(mid, E.h, ew); }
    for (const p of PADS) { const w = 1 - sstep((Math.hypot(x - p.x, z - p.z) - p.r) / p.blend); if (w > 0) mid = lerp(mid, p.h, w); }
    TERRAIN.H[i + j * NX] = d < CORRIDOR + BLEND1 ? lerp(q.y - 0.15, mid, sstep((d - CORRIDOR) / BLEND1)) : mid;
    TERRAIN.D[i + j * NX] = d;
  }
})();
// terrain height, bilinear on the same triangulation as the mesh (diagonal b-c)
export function terrainH(x, z) {
  const fx = Math.min(NX - 1.001, Math.max(0, (x - BOUNDS.x0) / CELL)), fz = Math.min(NZ - 1.001, Math.max(0, (z - BOUNDS.z0) / CELL));
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, o = i + j * NX, H = TERRAIN.H;
  const a = H[o], b = H[o + 1], c = H[o + NX], d = H[o + NX + 1];
  return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
}
export function terrainSlope(x, z) { const e = 2; return Math.hypot(terrainH(x + e, z) - terrainH(x - e, z), terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e); }

// ---- boardwalk along the sea side of the coast road: planks raised 0.3 m, 4.8 m wide. The renderer and the physics share this polyline (physics: surface 'wood', solid floor).
export const BOARDWALK = (() => { const pts = []; for (let s = 0; s < ROAD.L; s += 6) { const p = roadAt(s, 19.5); if (p.x > -820 && p.x < -40 && p.z > 760 && p.tx > 0.3) pts.push({ x: p.x, y: terrainH(p.x, p.z) + 0.3, z: p.z, tx: p.tx, tz: p.tz, s: pts.length * 6 }); } return pts; })();
const BWC = 10, BWG = new Map(); BOARDWALK.forEach((p, i) => { const k = Math.floor(p.x / BWC) * 4096 + Math.floor(p.z / BWC); let a = BWG.get(k); if (!a) BWG.set(k, a = []); a.push(i); });
export const BW_HALF = 2.4;
export function boardwalkAt(x, z, out = { w: 0, y: 0 }) {                     // out.w = 0..1 on the planks (soft 0.35 m edge), out.y = plank height
  out.w = 0; if (x < -830 || x > -30 || z < 750) return out; const cx = Math.floor(x / BWC), cz = Math.floor(z / BWC); let bd = 1e9, by = 0;
  for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) { const a = BWG.get(i * 4096 + j); if (!a) continue;
    for (const k of a) for (const m of [k - 1, k]) { if (m < 0 || m + 1 >= BOARDWALK.length) continue; const A = BOARDWALK[m], B = BOARDWALK[m + 1], ex = B.x - A.x, ez = B.z - A.z, L2 = ex * ex + ez * ez; if (L2 > 100 || L2 < 1e-6) continue; const u = Math.max(0, Math.min(1, ((x - A.x) * ex + (z - A.z) * ez) / L2)), d = Math.hypot(x - (A.x + ex * u), z - (A.z + ez * u)); if (d < bd) { bd = d; by = A.y + (B.y - A.y) * u; } } }
  if (bd < BW_HALF + 0.35) { out.w = 1 - sstep((bd - BW_HALF) / 0.35); out.y = by; } return out;
}
