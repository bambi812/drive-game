// world.js — shared by server and client. Pure math (no THREE): the map.
// Sea and beach on the west, a harbour city in the south-west, a lake in the middle and mountains to the north and east
// with pass roads (long climbs, switchbacks that never repeat, fast ridge esses).
// Main loop = closed centripetal Catmull-Rom (races / traffic). Side roads = open lanes. The ground is relaxed between the roads
// and the natural land, so slopes next to hairpins stay continuous.
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
// points are [x, z] or [x, z, height]; missing heights are filled evenly by distance between the points that have one
function heights(pts) {
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  let last = 0; for (let i = 1; i < pts.length; i++) if (pts[i][2] !== undefined) { for (let k = last + 1; k < i; k++) pts[k][2] = lerp(pts[last][2], pts[i][2], (cum[k] - cum[last]) / (cum[i] - cum[last])); last = i; }
  return pts;
}
function controls() {
  return heights([
    // the coast road, running north beside the sea: bays and one headland
    [-1245, 1235, 4], [-1295, 1050], [-1215, 860], [-1255, 640], [-1330, 430], [-1260, 200], [-1175, 20], [-1260, -190], [-1330, -380], [-1230, -560, 8],
    // Eagle pass: the long climb to the north-west summit, switchbacks of different shapes
    [-1090, -690], [-910, -700], [-800, -820], [-900, -935], [-1100, -905], [-1290, -985], [-1300, -1140], [-1160, -1205], [-985, -1120], [-820, -1055], [-660, -1100], [-640, -1230], [-740, -1285], [-725, -1370], [-600, -1390, 175],
    // the north ridge: fast esses along the top
    [-420, -1300], [-250, -1360], [-90, -1255], [90, -1330], [280, -1300], [400, -1180], [345, -1070], [205, -1045], [112, -975, 125], [135, -895],
    // up again into the great massif
    [250, -880], [450, -860], [580, -960], [540, -1130], [650, -1260], [860, -1290], [1010, -1180], [920, -1050], [980, -900], [1160, -880], [1300, -1010], [1470, -970, 196],
    // the serpent: the long way down the east side
    [1530, -810], [1420, -670], [1220, -690], [1070, -590], [1150, -450], [1380, -490], [1520, -360], [1420, -200], [1210, -250], [1040, -180], [990, -20, 72], [1130, 70], [1360, 20], [1500, 150], [1445, 340, 60],
    // the forest ridge in the south-east: tight esses
    [1255, 420], [1230, 600, 22], [1420, 700], [1480, 880], [1340, 1000], [1160, 920], [1010, 780], [860, 820], [850, 990], [990, 1120], [900, 1280], [680, 1290, 24],
    // the southern valley, back to the harbour
    [460, 1360], [230, 1275], [20, 1360], [-220, 1300], [-480, 1330], [-760, 1290], [-1040, 1340, 4],
  ]);
}
// the mountain side roads
const CLIMBS = {
  // from the lake up to the north ridge: a zig-zag that never repeats itself
  summit: heights([[250, -525, 8], [175, -590], [20, -575], [-130, -640], [-110, -735], [60, -745], [150, -675], [290, -680], [370, -722], [345, -778], [245, -765], [90, -835], [-60, -815], [-170, -890], [-130, -1000], [10, -975, 120]]),
  // from the coast side up to Eagle pass: stacked switchbacks of very different lengths
  falcon: heights([[-720, -135, 10], [-860, -190], [-870, -290], [-720, -320], [-590, -385], [-660, -475], [-850, -430], [-1000, -470], [-1030, -560], [-900, -590], [-740, -560], [-620, -620], [-700, -700], [-860, -705, 62]]),
  // round the hill east of the lake: a wide balcony road
  quarry: heights([[560, -300, 8], [650, -390], [640, -520], [760, -600], [890, -540], [860, -420], [940, -350], [900, -220], [770, -180], [720, -60], [830, 30], [990, -20, 40]]),
};

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

// ---------- zones, coast, flat pads ----------
export const coastX = z => -1450 + 34 * Math.sin(z / 250);                  // sea begins west of this
export const seaward = (x, z) => coastX(z) - x;                              // > 0 in the sea, negative on land
export const isBeach = (x, z, margin = 0) => seaward(x, z) > -78 - margin;
export const CITY_RECT = { x0: -1140, z0: 330, x1: -380, z1: 1190, h: 5.88, blend: 70 };   // flat city pad (avenues, plaza)
export const AVX = [CITY_RECT.x0 + 130, CITY_RECT.x0 + 380, CITY_RECT.x0 + 630], AVZ = [CITY_RECT.z0 + 130, CITY_RECT.z0 + 430, CITY_RECT.z0 + 730];
export const PLAZA = { x: CITY_RECT.x0 + 255, z: CITY_RECT.z0 + 280, r: 100 };         // open drifting plaza inside the city
export const LAKE = { x: 250, z: -270, r: 185 };
export const VILLAGE = { x: 230, z: 620, r: 130 };                                      // the old town
export const ESTATE = { x: -960, z: -70, r: 200 };                                      // villas on the hill above the coast
export function zoneAt(x, z) {
  const C = CITY_RECT; if (x > C.x0 - 80 && x < C.x1 + 80 && z > C.z0 - 80 && z < C.z1 + 80) return 'city';
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < 330) return 'lake';
  if (seaward(x, z) > -300) return 'beach';
  return z > -520 && x < 880 ? 'valley' : 'mountain';
}
// garages: building 40 m from the road centreline, glowing drive-in zone 19 m out; `yaw` makes the building front face the road
const GAR = [['beach', 'Coast Garage', -1215, -70, 1], ['city', 'Downtown Garage', -620, 1310, 1], ['mountain', 'Pass Garage', 1455, 255, 1]];
export const GARAGES = GAR.map(([id, name, x, z, side]) => {
  const s = roadQuery(x, z, 1e4).s, c = roadAt(s, side * 32), zn = roadAt(s, side * 19), b = roadAt(s, side * 40);
  return { id, name, s, side, y: c.y, cx: c.x, cz: c.z, bx: b.x, bz: b.z, zx: zn.x, zz: zn.z, r: 7, yaw: Math.atan2(side * c.tz, -side * c.tx), roadYaw: Math.atan2(c.tx, c.tz) };
});
export const PADS = (() => { // circular flat pads; the overlook sits beside the highest road point
  let hi = 0; for (let i = 0; i < ROAD.N; i++) if (ROAD.Y[i] > ROAD.Y[hi]) hi = i;
  const a = roadAt(hi * ROAD.ds, 34), b = roadAt(hi * ROAD.ds, -34), c = a.z < b.z ? a : b;
  return [{ x: c.x, z: c.z, r: 22, h: ROAD.Y[hi] - 0.15, blend: 40, name: 'overlook' },
    ...GARAGES.map(g => ({ x: g.cx, z: g.cz, r: 17, h: g.y - 0.15, blend: 25, name: g.id }))];
})();

// ---------- natural land: plains, ridged mountains, the lake and the sea ----------
const ridged = (x, z) => { let sum = 0, amp = 0.62, f = 1 / 300, prev = 1; for (let o = 0; o < 4; o++) { let n = 1 - Math.abs(vnoise(x * f + o * 19.1, z * f + o * 7.7) * 2 - 1); n *= n; sum += n * amp * (0.35 + 0.65 * prev); prev = n; f *= 2.15; amp *= 0.5; } return sum; };
const PEAKS = [        // x, z, radius, height
  [-960, -1060, 560, 200], [-300, -1520, 520, 260], [900, -1120, 620, 270], [1330, -230, 620, 190], [1330, 880, 520, 150],
  [-820, -420, 420, 130], [-20, -820, 400, 150], [-960, -90, 300, 45], [790, -370, 330, 85], [1750, -1300, 600, 380],
  [1760, 520, 420, 240], [420, -1560, 420, 300], [-1250, -1500, 430, 280], [620, 420, 260, 40],
];
// a smooth surface through the roads' own heights, so the land under a road already rises with it (no tall embankments)
const SUPPORT = (() => {
  const FC = 10, FW = Math.round((BOUNDS.x1 - BOUNDS.x0) / FC) + 1, FH = Math.round((BOUNDS.z1 - BOUNDS.z0) / FC) + 1, num = new Float32Array(FW * FH), den = new Float32Array(FW * FH), sig = 55, r = Math.ceil(3 * sig / FC);
  const add = (x, z, h) => { const px = (x - BOUNDS.x0) / FC, pz = (z - BOUNDS.z0) / FC;
    for (let gz = Math.max(0, Math.floor(pz) - r); gz <= Math.min(FH - 1, Math.floor(pz) + r); gz++) for (let gx = Math.max(0, Math.floor(px) - r); gx <= Math.min(FW - 1, Math.floor(px) + r); gx++) { const d2 = ((gx - px) ** 2 + (gz - pz) ** 2) * FC * FC, w = Math.exp(-d2 / (2 * sig * sig)); num[gx + gz * FW] += w * h; den[gx + gz * FW] += w; } };
  for (let i = 0; i < ROAD.N; i += 4) add(ROAD.X[i], ROAD.Z[i], ROAD.Y[i]);
  for (const road of Object.values(CLIMBS)) for (let i = 1; i < road.length; i++) { const a = road[i - 1], b = road[i], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8)); for (let k = 0; k < n; k++) add(lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n), lerp(a[2], b[2], k / n)); }
  return (x, z, h) => { const gx = Math.max(0, Math.min(FW - 1, Math.round((x - BOUNDS.x0) / FC))), gz = Math.max(0, Math.min(FH - 1, Math.round((z - BOUNDS.z0) / FC))), o = gx + gz * FW; return den[o] > 0.01 ? lerp(h, num[o] / den[o], sstep(den[o] / 9)) : h; };
})();
function natural(x, z) {
  let h = 3.4 + (fbm(x / 260, z / 260) - 0.5) * 4.5;
  let m = 0; for (const [px, pz, R, H] of PEAKS) { const d = Math.hypot(x - px, z - pz) / R; if (d < 1) { const v = H * Math.pow(1 - d, 1.15) * (0.55 + 0.72 * ridged(x + px, z - pz)); m = Math.max(m, v) + Math.min(m, v) * 0.25; } }
  h += m * sstep((Math.hypot(x - LAKE.x, z - LAKE.z) - 300) / 220);
  h = SUPPORT(x, z, h);
  const cw = 1 - sstep(Math.hypot(Math.max(CITY_RECT.x0 - x, 0, x - CITY_RECT.x1), Math.max(CITY_RECT.z0 - z, 0, z - CITY_RECT.z1)) / CITY_RECT.blend); if (cw > 0) h = lerp(h, CITY_RECT.h, cw);
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z) + (fbm(x / 70, z / 70) - 0.5) * 46; h = lerp(h, -7, 1 - sstep((ld - LAKE.r + 55) / 60));
  const de = Math.min(x - BOUNDS.x0, BOUNDS.x1 - x, z - BOUNDS.z0, BOUNDS.z1 - z);
  h = lerp(h, Math.min(h, 2.1), sstep((seaward(x, z) + 100) / 45) * (1 - sstep((h - 9) / 10)));      // a low sandy shore (not where mountains meet the sea)
  return h - 14 * sstep((seaward(x, z) + 12) / 110) - 60 * sstep(1 - de / 150) * (seaward(x, z) > -40 ? 1 : 0);
}

// ---------- height field ----------
export const TERRAIN = { H: new Float32Array(NX * NZ), D: new Float32Array(NX * NZ), DS: new Float32Array(NX * NZ) };   // height, distance to main road, distance to side road
const NAT = new Float32Array(NX * NZ);
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
  const x = BOUNDS.x0 + i * CELL, z = BOUNDS.z0 + j * CELL, o = i + j * NX; let h = natural(x, z);
  for (const p of PADS) { const w = 1 - sstep((Math.hypot(x - p.x, z - p.z) - p.r) / p.blend); if (w > 0) h = lerp(h, p.h, w); }
  NAT[o] = h; TERRAIN.D[o] = roadQuery(x, z, 200).d; TERRAIN.DS[o] = 1e9;
}
// fit the ground to a set of roads: vertices on a road take its height, the band beside it is relaxed (a smooth surface
// stretched between the roads and the natural land), so neighbouring hairpin legs never make a step
function shapeGround(lanes) {
  const N = NX * NZ, d = new Float32Array(N).fill(1e9), y = new Float32Array(N), fix = new Uint8Array(N), BAND = 110, H = TERRAIN.H;
  const stamp = (pts, closed, core, rank) => {
    const n = pts.length;
    for (let i = 0; i < n - (closed ? 0 : 1); i++) {
      const a = pts[i], b = pts[(i + 1) % n], ex = b.x - a.x, ez = b.z - a.z, L2 = ex * ex + ez * ez || 1, reach = rank ? 70 : BAND;
      if (!rank && i % 2) continue;
      const bx = rank ? b : pts[(i + 2) % n], fx = bx.x - a.x, fz = bx.z - a.z, F2 = fx * fx + fz * fz || 1;
      for (let gj = Math.max(0, Math.floor((Math.min(a.z, bx.z) - reach - BOUNDS.z0) / CELL)); gj <= Math.min(NZ - 1, Math.ceil((Math.max(a.z, bx.z) + reach - BOUNDS.z0) / CELL)); gj++)
        for (let gi = Math.max(0, Math.floor((Math.min(a.x, bx.x) - reach - BOUNDS.x0) / CELL)); gi <= Math.min(NX - 1, Math.ceil((Math.max(a.x, bx.x) + reach - BOUNDS.x0) / CELL)); gi++) {
          const x = BOUNDS.x0 + gi * CELL, z = BOUNDS.z0 + gj * CELL, u = Math.max(0, Math.min(1, ((x - a.x) * fx + (z - a.z) * fz) / F2)), dd = Math.hypot(x - a.x - fx * u, z - a.z - fz * u), o = gi + gj * NX;
          if (rank) TERRAIN.DS[o] = Math.min(TERRAIN.DS[o], dd);
          if (fix[o] === 2 && rank) continue;                              // the main road always wins
          if (dd < d[o]) { const tilt = rank ? (a.cross || 0) * Math.max(-5.6, Math.min(5.6, ((x - a.x) * -fz + (z - a.z) * fx) / Math.sqrt(F2))) : 0; d[o] = dd; y[o] = a.y + (bx.y - a.y) * u + tilt - 0.15; if (dd < core) fix[o] = rank ? 1 : 2; }
        }
    }
  };
  const main = []; for (let i = 0; i < ROAD.N; i++) main.push({ x: ROAD.X[i], y: ROAD.Y[i], z: ROAD.Z[i] });
  stamp(main, true, CORRIDOR + 0.6, 0); for (const pts of lanes) stamp(pts, false, 10, 1);
  const free = [], pull = [];
  for (let o = 0; o < N; o++) {
    if (fix[o]) { H[o] = y[o]; continue; }
    if (d[o] > BAND) { H[o] = NAT[o]; continue; }
    const w = sstep((d[o] - 10) / (BAND - 10)); H[o] = lerp(y[o], NAT[o], w); const i = o % NX, j = (o / NX) | 0;
    if (i > 0 && j > 0 && i < NX - 1 && j < NZ - 1) { free.push(o); pull.push(0.004 + w * w * 0.16); }
  }
  for (let it = 0; it < 320; it++) for (let k = 0; k < free.length; k++) { const o = free[k], avg = (H[o - 1] + H[o + 1] + H[o - NX] + H[o + NX]) * 0.25, v = H[o] + (avg - H[o]) * 1.5; H[o] = v + (NAT[o] - v) * pull[k]; }
  for (const p of PADS) {                                                   // flat pads under garages and the overlook survive the relaxation
    for (let j = Math.max(0, Math.floor((p.z - p.r - p.blend - BOUNDS.z0) / CELL)); j <= Math.min(NZ - 1, Math.ceil((p.z + p.r + p.blend - BOUNDS.z0) / CELL)); j++) for (let i = Math.max(0, Math.floor((p.x - p.r - p.blend - BOUNDS.x0) / CELL)); i <= Math.min(NX - 1, Math.ceil((p.x + p.r + p.blend - BOUNDS.x0) / CELL)); i++) {
      const o = i + j * NX, w = 1 - sstep((Math.hypot(BOUNDS.x0 + i * CELL - p.x, BOUNDS.z0 + j * CELL - p.z) - p.r) / p.blend); if (w > 0 && fix[o] !== 2) H[o] = lerp(H[o], p.h, w); } }
}
shapeGround([]);

// ---------- side roads ----------
export const SIDE_HALF = 5;
// control points: [x, z] or [x, z, height]. 'm' before a point snaps it onto the main loop.
const ring = [262, 236, 286, 250, 232, 276, 296, 245, 228, 262, 288, 240].map((r, i) => [LAKE.x + r * Math.cos(i * Math.PI / 6), LAKE.z + r * Math.sin(i * Math.PI / 6), 4]);
ring.push(ring[0]);
const CITY = CITY_RECT;
const SIDE_DEF = [
  { name: 'Lake road', ctrl: ring },
  // out of the city: west to the coast, south to the harbour road, east to the old town, north to the hills
  { name: 'Harbour link', ctrl: ['m', [-1255, 760], [CITY.x0 + 6, AVZ[1]]] },
  { name: 'South gate', ctrl: [[AVX[1], CITY.z1 - 6], 'm', [-760, 1295]] },
  { name: 'Valley road', ctrl: [[CITY.x1 - 6, AVZ[2]], [-250, 1075], [-130, 930], [60, 890], [120, 740], [230, 620], [380, 545], [560, 640], [720, 560], [880, 470], [1080, 520], 'm', [1235, 580]] },
  { name: 'North road', ctrl: [[AVX[2], CITY.z0 + 6], [-500, 210], [-640, 80], [-560, -60], [-720, -135, 10]] },
  { name: 'Lake approach', ctrl: ['j', [230, 620], [110, 470], [260, 320], [120, 160], [260, 40], 'j', [250, -40]] },
  { name: 'Meadow road', ctrl: ['j', [-560, -60], [-380, 20], [-300, -150], [-170, -250], 'j', [-10, -270]] },
  { name: 'Orchard road', ctrl: [[CITY.x1 - 6, AVZ[0]], [-240, 440], [-120, 330], [-230, 200], [-120, 90], [40, 120], 'j', [120, 160]] },
  { name: 'Sunset hills', ctrl: ['m', [-1260, 195], [-1110, 190], [-960, 90], [-1060, -40], [-950, -170], [-820, -90], 'j', [-720, -135]] },
  { name: 'Pine road', ctrl: ['j', [60, 890], [200, 990], [180, 1130], [330, 1190], [480, 1090], [620, 1160], 'm', [690, 1290]] },
  { name: 'Mill lane', ctrl: ['j', [-130, 930], [-260, 830], [-170, 690], [-260, 560], [-140, 470], 'j', [-120, 330]] },
  { name: 'Summit climb', climb: true, ctrl: [...CLIMBS.summit, 'm', [150, -990]] },
  { name: 'Falcon pass', climb: true, ctrl: [...CLIMBS.falcon.slice(0, -1), 'm', [-910, -700]] },
  { name: 'Quarry pass', climb: true, ctrl: ['j', [512, -270], ...CLIMBS.quarry.slice(0, -1), 'm', [995, -20]] },
];
// heights of a lane without given heights: smoothed natural ground, easing into the main road
function laneH(x, z) {
  let sum = terrainH(x, z) * 2, n = 2;
  for (const [r, k] of [[18, 8], [38, 8]]) for (let i = 0; i < k; i++) { const a = i / k * Math.PI * 2; sum += terrainH(x + Math.cos(a) * r, z + Math.sin(a) * r); n++; }
  const h = Math.max(1.6, sum / n), q = roadQuery(x, z, 60); return q.d < 55 ? lerp(q.y, h, sstep((q.d - 8) / 47)) : h;
}
export const SIDE_ROADS = [];
// nearest point of one lane: distance and surface height there
function laneAt(lane, x, z) {
  let d = 1e9, y = 0;
  for (let i = 0; i + 1 < lane.length; i++) { const a = lane[i], b = lane[i + 1]; if (Math.abs(a.x - x) > 60 || Math.abs(a.z - z) > 60) continue;
    const ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2)), px = x - a.x - ex * t, pz = z - a.z - ez * t, dd = Math.hypot(px, pz);
    if (dd < d) { d = dd; y = a.y + (b.y - a.y) * t + ((a.cross || 0) + ((b.cross || 0) - (a.cross || 0)) * t) * ((px * -ez + pz * ex) / Math.sqrt(l2)); } }
  return { d, y };
}
for (const { ctrl, climb } of SIDE_DEF) SIDE_ROADS.push((() => {
  const C = []; for (let i = 0; i < ctrl.length; i++) { if (ctrl[i] === 'm') { const p = ctrl[++i], q = roadQuery(p[0], p[1], 1e4), c = roadAt(q.s); C.push([c.x, c.z, c.y]); }
    else if (ctrl[i] === 'j') { const p = ctrl[++i]; let best = null, bd = 1e9; for (const lane of SIDE_ROADS) for (const q of lane) { const d = Math.hypot(q.x - p[0], q.z - p[1]); if (d < bd) { bd = d; best = q; } } C.push([best.x, best.z, best.y]); }
    else C.push(ctrl[i]); }
  const dense = [], ext = [[2 * C[0][0] - C[1][0], 2 * C[0][1] - C[1][1]], ...C, [2 * C[C.length - 1][0] - C[C.length - 2][0], 2 * C[C.length - 1][1] - C[C.length - 2][1]]];
  for (let i = 1; i < ext.length - 2; i++) {
    const steps = Math.max(2, Math.ceil(Math.hypot(ext[i + 1][0] - ext[i][0], ext[i + 1][1] - ext[i][1]) / 4)), h0 = ext[i][2], h1 = ext[i + 1][2];
    for (let k = 0; k < steps; k++) { const [x, z] = crc(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], k / steps); dense.push([x, z, h0 !== undefined && h1 !== undefined ? lerp(h0, h1, k / steps) : undefined]); }
  }
  dense.push(C[C.length - 1]);
  let s = 0; const pts = dense.map(([x, z, h], i) => { const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; if (i) s += Math.hypot(x - a[0], z - a[1]); return { x, z, y: h !== undefined ? h : laneH(x, z), tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l, s }; });
  const last = pts.length - 1, smooth = climb ? 2 : 8;
  for (let pass = 0; pass < smooth; pass++) for (let i = 1; i < last; i++) pts[i].y = (pts[i - 1].y + 2 * pts[i].y + pts[i + 1].y) / 4;
  for (const p of pts) {                                          // meet the main road and earlier lanes at exactly their height
    const q = roadQuery(p.x, p.z, 45); if (q.d < 36) p.y = lerp(q.y, p.y, sstep((q.d - 11) / 25));
    let bd = 28, by = 0; for (const lane of SIDE_ROADS) for (const o of lane) { const d = Math.abs(o.x - p.x) + Math.abs(o.z - p.z); if (d < bd * 1.5) { const e = Math.hypot(o.x - p.x, o.z - p.z); if (e < bd) { bd = e; by = o.y; } } }
    if (bd < 28) p.y = lerp(by, p.y, sstep((bd - 7) / 21)); }
  // Where this lane meets the main road or an earlier lane it lies exactly on that road's surface - same height and same sideways
  // tilt (p.cross, metres per metre) - and eases back over 25 m. Without this one road floated up to half a metre over the other.
  for (const p of pts) {
    let edge = 1e9, height = null;
    const m = roadQuery(p.x, p.z, 45); if (m.d < 45) { edge = m.d - ROAD_HALF; height = (x, z) => roadQuery(x, z, 60).y; }
    for (const lane of SIDE_ROADS) { const d = laneAt(lane, p.x, p.z).d - SIDE_HALF; if (d < edge) { edge = d; height = (x, z) => laneAt(lane, x, z).y; } }
    const w = 1 - sstep((edge - 6) / 25); if (!height || w <= 0) continue;
    const nx = -p.tz, nz = p.tx, centre = height(p.x, p.z), tilt = (height(p.x + nx * 4, p.z + nz * 4) - height(p.x - nx * 4, p.z - nz * 4)) / 8;
    p.y = lerp(p.y, centre, w); p.cross = Math.max(-0.11, Math.min(0.11, tilt)) * w; if (w > 0.97) p.fix = true;
  }
  // never steeper than 9.5 %, with both ends held (junction heights stay exact)
  for (let pass = 0; pass < 4000; pass++) { let moved = false; for (let i = 0; i < last; i++) { const a = pts[i], b = pts[i + 1], lim = 0.095 * (b.s - a.s), over = Math.abs(b.y - a.y) - lim; if (over > 1e-4) { const e = over * Math.sign(b.y - a.y) / 2; const holdA = i === 0 || a.fix, holdB = i + 1 === last || b.fix; if (holdA && holdB) continue; if (!holdA) a.y += holdB ? 2 * e : e; if (!holdB) b.y -= holdA ? 2 * e : e; moved = true; } } if (!moved) break; }
  return pts;
})());
SIDE_ROADS.names = SIDE_DEF.map(d => d.name);
// flat city streets (avenues + plaza): they only need to count as road for the tyres
const CITY_LANES = [...AVX.map(x => [x, CITY_RECT.z0 + 6, x, CITY_RECT.z1 - 6]), ...AVZ.map(z => [CITY_RECT.x0 + 6, z, CITY_RECT.x1 - 6, z])];
// nearest side road: d = distance to its centre line (Infinity beyond maxD), y = its height there, half = half width
const SG = 32, sideGrid = new Map(), SQ = { d: Infinity, y: 0, half: SIDE_HALF };
{ const add = (a, b, half) => { const seg = { a, b, half }; for (let i = Math.floor(Math.min(a.x, b.x) / SG); i <= Math.floor(Math.max(a.x, b.x) / SG); i++) for (let j = Math.floor(Math.min(a.z, b.z) / SG); j <= Math.floor(Math.max(a.z, b.z) / SG); j++) { const k = i * 4096 + j; let l = sideGrid.get(k); if (!l) sideGrid.set(k, l = []); l.push(seg); } };
  for (const pts of SIDE_ROADS) for (let i = 0; i + 1 < pts.length; i++) add(pts[i], pts[i + 1], SIDE_HALF);
  for (const [x0, z0, x1, z1] of CITY_LANES) { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 20); for (let i = 0; i < n; i++) add({ x: lerp(x0, x1, i / n), z: lerp(z0, z1, i / n), y: CITY_RECT.h + 0.1 }, { x: lerp(x0, x1, (i + 1) / n), z: lerp(z0, z1, (i + 1) / n), y: CITY_RECT.h + 0.1 }, 12); } }
export function sideQuery(x, z, maxD = 16) {
  SQ.d = Infinity; const r = Math.ceil((maxD + 12) / SG), cx = Math.floor(x / SG), cz = Math.floor(z / SG); let best = Infinity;
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r) { SQ.d = 0; SQ.y = CITY_RECT.h + 0.1; SQ.half = SIDE_HALF; return SQ; }
  for (let i = cx - r; i <= cx + r; i++) for (let j = cz - r; j <= cz + r; j++) { const l = sideGrid.get(i * 4096 + j); if (!l) continue;
    for (const { a, b, half } of l) { const ex = b.x - a.x, ez = b.z - a.z, u = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez || 1))), d = Math.hypot(x - a.x - ex * u, z - a.z - ez * u), edge = d - half;   // closest by distance to the road EDGE (avenues are wide)
      if (edge < best && d <= maxD + half - SIDE_HALF) { best = edge; SQ.d = d; const lat = Math.max(-half, Math.min(half, ((x - a.x - ex * u) * -ez + (z - a.z - ez * u) * ex) / (Math.hypot(ex, ez) || 1))); SQ.y = a.y + (b.y - a.y) * u + ((a.cross || 0) + ((b.cross || 0) - (a.cross || 0)) * u) * lat; SQ.half = half; } } }
  return SQ;
}
// distance to the nearest road of any kind, measured as if every road had the main road's half width (for keeping scenery clear)
export function anyRoadDist(x, z, maxD = 40) { const s = sideQuery(x, z, maxD), sd = s.d === Infinity ? Infinity : s.d - (s.half - SIDE_HALF), md = roadQuery(x, z, maxD).d; return Math.min(md, sd); }
shapeGround(SIDE_ROADS);

// terrain height, bilinear on the same triangulation as the mesh (diagonal b-c)
export function terrainH(x, z) {
  const fx = Math.min(NX - 1.001, Math.max(0, (x - BOUNDS.x0) / CELL)), fz = Math.min(NZ - 1.001, Math.max(0, (z - BOUNDS.z0) / CELL));
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, o = i + j * NX, H = TERRAIN.H;
  const a = H[o], b = H[o + 1], c = H[o + NX], d = H[o + NX + 1];
  return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
}
export function terrainSlope(x, z) { const e = 2; return Math.hypot(terrainH(x + e, z) - terrainH(x - e, z), terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e); }

// ---- boardwalk along the sea side of the coast road: planks raised 0.3 m, 4.8 m wide. The renderer and the physics share this polyline (physics: surface 'wood', solid floor).
export const BOARDWALK = (() => { const pts = []; for (let s = 0; s < ROAD.L; s += 6) { const p = roadAt(s, -19.5); if (p.x < -1150 && p.z > 260 && p.z < 1080 && p.tz < -0.3) pts.push({ x: p.x, y: terrainH(p.x, p.z) + 0.3, z: p.z, tx: p.tx, tz: p.tz, s: pts.length * 6 }); } return pts; })();
const BWC = 10, BWG = new Map(); BOARDWALK.forEach((p, i) => { const k = Math.floor(p.x / BWC) * 4096 + Math.floor(p.z / BWC); let a = BWG.get(k); if (!a) BWG.set(k, a = []); a.push(i); });
export const BW_HALF = 2.4;
export function boardwalkAt(x, z, out = { w: 0, y: 0 }) {                     // out.w = 0..1 on the planks (soft 0.35 m edge), out.y = plank height
  out.w = 0; if (x > -1150 || z < 240 || z > 1100) return out; const cx = Math.floor(x / BWC), cz = Math.floor(z / BWC); let bd = 1e9, by = 0;
  for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) { const a = BWG.get(i * 4096 + j); if (!a) continue;
    for (const k of a) for (const m of [k - 1, k]) { if (m < 0 || m + 1 >= BOARDWALK.length) continue; const A = BOARDWALK[m], B = BOARDWALK[m + 1], ex = B.x - A.x, ez = B.z - A.z, L2 = ex * ex + ez * ez; if (L2 > 100 || L2 < 1e-6) continue; const u = Math.max(0, Math.min(1, ((x - A.x) * ex + (z - A.z) * ez) / L2)), d = Math.hypot(x - (A.x + ex * u), z - (A.z + ez * u)); if (d < bd) { bd = d; by = A.y + (B.y - A.y) * u; } } }
  if (bd < BW_HALF + 0.35) { out.w = 1 - sstep((bd - BW_HALF) / 0.35); out.y = by; } return out;
}
