// world.js — shared by server and client. Pure math (no THREE): the map.
// One mainland and one island: a big city with a river and roundabouts, mountain passes in the north, a desert with a canyon
// and a casino strip in the east, a port in the south, a race circuit and airfield in the south-east, a resort island west.
// Every road follows one smooth height field (ground()), so roads that cross always meet at the same height. Where the land
// is cut away under a road (sea, river, canyon) the road simply carries on as a bridge.
export const ROAD_HALF = 6;           // road half width (m)
export const CORRIDOR = 12;           // terrain flat at road height within this distance of centreline
export const BOUNDS = { x0: -3000, x1: 5400, z0: -4796, z1: 2500 };          // the far north (beyond z = -2500) is the high snow country, the far east (beyond x = 3000) the green highlands
export const CELL = 8;                // terrain mesh resolution (m)
export const NX = Math.round((BOUNDS.x1 - BOUNDS.x0) / CELL) + 1;
export const NZ = Math.round((BOUNDS.z1 - BOUNDS.z0) / CELL) + 1;
export const SEA = 0;
export const DS = 2;                  // road sample spacing target (m)

const sstep = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * t * (t * (t * 6 - 15) + 10); }; // smootherstep
export { sstep };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ---------- deterministic value noise ----------
function hash2(ix, iz) { let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(ix, iz), hash2(ix + 1, iz), u), lerp(hash2(ix, iz + 1), hash2(ix + 1, iz + 1), u), v);
}
export const fbm = (x, z) => vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 7, z * 2.1 + 3) * 0.3 + vnoise(x * 4.3 + 1, z * 4.3 + 9) * 0.15;
export function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- land, water ----------
export const LAND = [
  [[-2850, -3050], [-2800, -4150], [-2200, -4700], [-900, -4740], [300, -4640], [1400, -4740], [2500, -4600], [3300, -4730], [4300, -4650], [5150, -4350], [5270, -3300], [5100, -2300], [5300, -1300], [4900, -300], [4050, 150], [3150, 260], [2930, 550], [2750, 1150], [2900, 1450], [2850, 2300], [2300, 2470], [1330, 2470], [900, 2250], [300, 2420], [-700, 2350], [-1100, 2050], [-1300, 1500], [-1360, 900], [-1450, 300], [-1420, -350], [-1750, -950], [-2300, -1150], [-2780, -1900]],
  [[-2800, -450], [-2050, -750], [-1730, -250], [-1760, 400], [-1700, 1000], [-1980, 1520], [-2660, 1380], [-2880, 600]],      // resort island
];
export const RIVER = [[-1750, 260], [-1450, 180], [-900, 80], [-520, 230], [-120, 100], [250, 300], [620, 160], [900, 330], [1330, 330], [1420, 800], [1250, 1250], [1230, 1700], [1100, 2600]];
export const CANYON = [[1950, -2450], [2150, -1750], [1950, -1250], [2300, -800], [2150, -250], [2450, 250], [2350, 1000]];
export const LAKE = { x: 520, z: -1090, rx: 270, rz: 120 };

function distPoly(x, z, P, closed) {
  let d = 1e9;
  for (let i = 0, n = P.length - (closed ? 0 : 1); i < n; i++) { const a = P[i], b = P[(i + 1) % P.length], ex = b[0] - a[0], ez = b[1] - a[1], t = clamp(((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez || 1), 0, 1), dx = x - a[0] - ex * t, dz = z - a[1] - ez * t, q = dx * dx + dz * dz; if (q < d) d = q; }
  return Math.sqrt(d);
}
const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < (P[j][0] - P[i][0]) * (z - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
// the drawn outlines are bent by noise, so coasts, rivers and borders wander like natural ones
const bentX = (x, z, s, a) => x + (fbm(x / s + 11, z / s + 3) - 0.5) * a, bentZ = (x, z, s, a) => z + (fbm(x / s + 47, z / s + 29) - 0.5) * a;
// signed distance into the sea: > 0 in the water, negative on land
let seaX = NaN, seaZ = NaN, seaD = 0;               // the terrain asks for the same point several times in a row
export function seaward(px, pz) { if (px === seaX && pz === seaZ) return seaD; const x = bentX(px, pz, 240, 190) + (fbm(px / 60, pz / 60) - 0.5) * 36, z = bentZ(px, pz, 240, 190) + (fbm(px / 60 + 5, pz / 60 + 8) - 0.5) * 36; let best = 1e9; for (const P of LAND) { const d = distPoly(x, z, P, true), s = inPoly(x, z, P) ? -d : d; if (s < best) best = s; } seaX = px; seaZ = pz; return seaD = best; }
// how much the land is cut away here (sea, river, canyon, lake); a road over a cut is a bridge
export function carve(x, z) {
  const sea = 18 * sstep((seaward(x, z) + 4) / 50);
  const river = 12 * sstep((62 + 26 * fbm(x / 130 + 2, z / 130) - distPoly(bentX(x, z, 170, 90), bentZ(x, z, 170, 90), RIVER, false)) / 28);
  const cd = distPoly(bentX(x, z, 150, 130) + (fbm(x / 45, z / 45) - 0.5) * 30, bentZ(x, z, 150, 130), CANYON, false), canyon = cd < 100 ? 25 * sstep((92 - cd) / 42) : 0;
  const ld = Math.hypot((bentX(x, z, 90, 110) - LAKE.x) / LAKE.rx, (bentZ(x, z, 90, 110) - LAKE.z) / LAKE.rz), lake = 11 * sstep((1 - ld) / 0.25);
  return Math.max(sea, river, canyon, lake);
}
// 0 = green country, 1 = full desert
export function dryness(x, z) { const wx = bentX(x, z, 330, 520) + (fbm(x / 70, z / 70) - 0.5) * 110, wz = bentZ(x, z, 330, 520) + (fbm(x / 70 + 9, z / 70) - 0.5) * 110; return sstep((wx - 1320) / 320) * sstep((920 - wz) / 340) * sstep((z + 2640) / 340) * (1 - sstep((wx - 2930) / 260)); }
// the smooth height every road follows (grades stay driveable)
const bump = (x, z, cx, cz, r, h) => h * (1 - sstep(Math.hypot(x - cx, z - cz) / r));
export function ground(x, z) {
  const desert = 24 * sstep((x - 1150) / 650) * sstep((1100 - z) / 650);
  const north = 50 * sstep((-z - 800) / 1150) * (1 - sstep((x - 400) / 1100));
  const high = 60 * sstep((-z - 2450) / 1500) + bump(x, z, -2400, -3500, 520, 15) + bump(x, z, -1150, -3300, 560, 15) + bump(x, z, 100, -3200, 470, 16) + bump(x, z, 1150, -3150, 500, 20) + bump(x, z, -500, -4350, 450, 17) + bump(x, z, 1900, -4150, 470, 18)
    + bump(x, z, 4150, -1500, 650, 24) + bump(x, z, 4500, -3050, 750, 32) + bump(x, z, 3400, -2700, 550, 18) + bump(x, z, 4550, -600, 480, 18) + bump(x, z, 3600, -4150, 500, 18);
  return 6 + Math.max(desert, north) + high + bump(x, z, -1650, -2150, 900, 26) + bump(x, z, -300, -2150, 700, 18) + bump(x, z, -2330, -200, 520, 16);
}

// ---------- roads ----------
// the main loop (races, traffic, speed traps, drift zones): a grand tour of every part of the map
const MAIN = [
  [0, 880], [-30, 1260], [-100, 1650], [600, 1780], [700, 2100],                                                         // south to the port
  [1100, 2060], [1500, 1950], [1440, 1650], [1580, 1440], [2050, 1380], [2200, 1010], [2250, 650],                       // past the race circuit
  [2600, 500], [2650, -150], [2550, -750], [2650, -1500], [2520, -2000], [2150, -2150], [1750, -2000],                   // up the desert
  [1180, -2060], [560, -1950], [300, -2230], [-100, -2250], [-480, -2150], [-420, -1820], [-780, -1680], [-950, -1900], [-700, -2050], [-950, -2300], [-1380, -2260], [-1250, -2000], [-1500, -1700], [-1300, -1420], // the mountains
  [-1090, -990], [-950, -560], [-1180, -220], [-960, 220], [-1100, 720], [-650, 1010],                                   // down into the city
];
export const ROUNDABOUTS = {
  central: [0, -250, 80], north: [-80, -640, 48], west: [-720, -170, 55], east: [700, -200, 55], south: [60, 640, 70], sw: [-700, 720, 48], se: [720, 760, 48],
  strip: [2430, -750, 52], port: [-100, 1900, 52], resort: [-2300, 300, 60],
};
// [name, kind, closed, points]; 'o:name' = the road starts / ends on that roundabout
const L = (name, kind, ...pts) => ({ name, kind, pts });
const SIDE_DEF = [
  L('Ring highway', 'highway', [0, 880], [700, 970], [1100, 780], [980, 200], [1050, -260], [850, -620], [250, -740], [-450, -780], [-950, -560]),
  L('Grand Avenue', 'street', 'o:central', 'o:north', [-90, -900]),
  L('West Boulevard', 'street', 'o:central', [-380, -270], 'o:west', [-940, -130], [-1180, -220]),
  L('East Boulevard', 'street', 'o:central', [360, -280], 'o:east', [1050, -260]),
  L('Bridge Street', 'street', 'o:central', [20, -30], [-40, 150], [40, 420], 'o:south', [0, 880]),
  L('Arc Road', 'street', 'o:north', [-460, -500], 'o:west', [-640, 120], [-720, 400], 'o:sw', [-1100, 720]),
  L('Garden Road', 'street', 'o:north', [380, -520], 'o:east', [620, 150], [760, 450], 'o:se', [1100, 780]),
  L('Diagonal', 'street', 'o:central', [330, -40], [330, 300], [200, 500], 'o:south'),
  L('Canal Road', 'street', 'o:central', [-340, -40], [-420, 230], [-340, 480], 'o:south'),
  L('River Drive', 'street', [-960, 220], [-900, -50], [-520, 80], [-120, -30], [250, 170], [620, 30], [980, 200]),
  L('South Bank', 'street', [-996, 340], [-520, 380], [-120, 260], [250, 460], [620, 320], [980, 440], [1050, 480]),
  L('Market Street', 'street', 'o:sw', [-340, 640], 'o:south', [420, 700], 'o:se'),
  L('Old Town Loop', 'street', [-640, -330], [-420, -380], [-300, -520], [-460, -620], [-650, -560], [-640, -330]),
  L('Suburb Crescent', 'street', [330, -560], [520, -480], [640, -360], [880, -420], [850, -620]),
  L('Lake Shore', 'street', [-90, -900], [180, -940], [150, -1180], [520, -1270], [920, -1190], [940, -960], [850, -620]),
  L('Farm Lane', 'street', [-950, -560], [-1150, -850], [-850, -1000], [-620, -870], [-380, -1130], [-90, -900]),
  L('Forest Road', 'street', [-1300, -1420], [-1200, -1150], [-850, -1000]),
  L('Park Way', 'highway', [1050, -260], [1500, -420], [1600, -700], [1300, -900], [940, -960]),
  L('Desert Road', 'highway', [1050, -260], [1450, -90], [1850, -50]),
  // mountains
  L('Glacier Road', 'pass', [-1300, -1420], [-1700, -1500], [-2000, -1650], [-2250, -1520], [-2500, -1750], [-2350, -1850], [-2050, -2200], [-1750, -2050], [-1850, -1800], [-1500, -1700]),
  L('Summit Climb', 'pass', [-1500, -1700], [-1600, -1900], [-1450, -2030], [-1620, -2150], [-1750, -2300], [-2050, -2200]),
  L('Eagle Nest', 'pass', [560, -1950], [300, -1800], [480, -1550], [100, -1420], [-200, -1600], [-500, -1450], [-1000, -1560], [-1300, -1420]),
  L('Lumber Road', 'pass', [-200, -1600], [-250, -1850], [-100, -1950], [-250, -2070], [-100, -2250]),
  L('North Road', 'highway', [-90, -900], [-250, -1250], [-200, -1600]),
  L('Quarry Road', 'pass', [920, -1190], [1250, -1350], [1050, -1600], [1350, -1750], [1100, -1950], [850, -1880], [560, -1950]),
  L('Windmill Road', 'street', [1250, -1350], [1550, -1300], [1750, -1000]),
  // the high snow country: a few long driving roads, linked corners of different sizes over crests and dips
  L('Skyline Run', 'highway', [-1750, -2300], [-1950, -2490], [-2250, -2600], [-2480, -2850], [-2560, -3200], [-2600, -3550], [-2640, -3900], [-2500, -4180], [-2200, -4300],
    [-1750, -4330], [-1350, -4300], [-1080, -4160], [-840, -4280], [-560, -4430], [-290, -4340], [-180, -4130], [60, -4030], [310, -4130], [650, -4330], [1050, -4380], [1500, -4360], [1950, -4250],
    [2260, -4020], [2400, -3660], [2330, -3300], [2060, -3170], [1960, -2970], [2160, -2790], [2060, -2590], [1830, -2520], [1690, -2300], [1750, -2000]),
  L('Dragon Pass', 'pass', [-950, -2300], [-920, -2500], [-1080, -2620], [-1400, -2590], [-1490, -2665], [-1410, -2740], [-1160, -2725], [-880, -2790], [-815, -2875], [-900, -2945], [-1120, -2915],
    [-1370, -2975], [-1435, -3075], [-1340, -3135], [-1120, -3070], [-960, -3115], [-935, -3225], [-1080, -3275], [-1320, -3300], [-1480, -3380], [-1440, -3485], [-1250, -3480], [-980, -3390], [-760, -3500],
    [-800, -3720], [-1060, -3790], [-1210, -3970], [-1080, -4160]),
  L('Glacier Flow', 'pass', [-100, -2250], [-40, -2480], [190, -2670], [190, -2930], [-40, -3110], [-160, -3340], [30, -3560], [300, -3650], [380, -3860], [210, -3990], [60, -4030]),
  L('East Crest', 'pass', [300, -3650], [560, -3570], [730, -3340], [640, -3120], [800, -2920], [1090, -2890], [1260, -3090], [1200, -3350], [1390, -3530], [1660, -3500], [1890, -3410], [2110, -3450], [2330, -3300]),
  // the green highlands in the far east
  L('Pine Valley', 'highway', [2780, -750], [3150, -700], [3500, -900], [3700, -1300], [3610, -1750], [3820, -2150], [4200, -2420], [4230, -2850], [3950, -3200], [4000, -3700], [3680, -4110], [3180, -4260], [2720, -4100], [2390, -3660]),
  L('Eagle Ridge', 'pass', [3700, -1300], [4040, -1170], [4360, -1290], [4310, -1470], [4060, -1540], [4090, -1720], [4310, -1700], [4480, -1790], [4750, -1950], [4640, -2200], [4820, -2450], [4720, -2730], [4470, -2790], [4510, -3030], [4850, -3150], [4790, -3480], [4480, -3640], [4240, -3520], [4000, -3700]),
  L('Timber Road', 'pass', [2650, -1500], [3020, -1690], [3040, -2040], [3340, -2240], [3300, -2580], [3060, -2840], [3240, -3140], [3590, -3010], [3880, -2860], [4230, -2850]),
  L('Meadow Climb', 'street', [3500, -900], [3830, -560], [4180, -700], [4440, -410], [4760, -590], [4860, -980], [4640, -1330], [4750, -1950]),
  // more roads over the snow
  L('Frost Ridge', 'pass', [-760, -3500], [-520, -3320], [-470, -3030], [-260, -2860], [-290, -2620], [-40, -2480]),
  L('Avalanche Road', 'pass', [-1210, -3970], [-1640, -3900], [-1900, -3640], [-1790, -3330], [-2040, -3060], [-2330, -2720]),
  L('Husky Trail', 'highway', [650, -4330], [690, -4060], [960, -3860], [880, -3600], [560, -3570]),
  // desert
  L('Canyon Rim', 'highway', [2600, 500], [2250, 650], [1850, 450], [1850, -50], [2000, -500], [1750, -1000], [1750, -1500], [1750, -2000]),
  L('Mesa Switchbacks', 'pass', [1750, -2000], [1720, -1750], [1860, -1620], [1700, -1480], [1860, -1330], [1750, -1000]),
  L('The Strip', 'strip', 'o:strip', [2520, -1150], [2650, -1500]),
  L('Neon Boulevard', 'strip', [2000, -500], 'o:strip', [2780, -750]),
  L('Rim Bridge North', 'highway', [1750, -1500], [2200, -1500], [2650, -1500]),
  L('Rim Bridge South', 'highway', [1850, -50], [2250, -90], [2650, -150]),
  // south-east
  L('Stadium Road', 'street', [1100, 780], [1500, 620], [1850, 450]),
  L('East Village', 'street', [1500, 620], [1650, 950], [2200, 1010], [2520, 860], [2600, 500]),
  L('Speedway', 'track', [1580, 1440], [2020, 1470], [2270, 1620], [2060, 1760], [2300, 1880], [2700, 1600], [2750, 2050], [2350, 2250], [2150, 2050], [1850, 2200], [1500, 1950]),
  L('Runway', 'highway', [1500, 1950], [1430, 2200], [1560, 2340], [1950, 2360], [2450, 2370]),
  // south
  L('Harbour Loop', 'highway', [700, 2100], [250, 2250], [-650, 2180], [-950, 1960], [-850, 1750], [-100, 1650]),
  L('Dock Road', 'street', [-850, 1750], [-500, 1900], 'o:port', [300, 1900], [700, 2100]),
  L('Crane Street', 'street', [-100, 1650], 'o:port', [-100, 2205]),
  L('Valley Road', 'street', [-1100, 720], [-1180, 1100], [-950, 1450], [-950, 1960]),
  L('Meadow Road', 'street', [0, 880], [450, 1150], [900, 1250], [800, 1550], [600, 1780]),
  L('Ranch Road', 'street', [-950, 1450], [-500, 1250], [-100, 1450], [450, 1150]),
  // the resort island and its two bridges
  L('Sunset Bridge', 'highway', [-1180, -220], [-1550, -230], [-1920, -150]),
  L('Marina Causeway', 'highway', [-1880, 1000], [-1400, 1420], [-850, 1750]),
  L('Coast Road', 'street', [-2650, -300], [-2100, -550], [-1920, -150], [-2060, 400], [-1880, 1000], [-2080, 1350], [-2550, 1220], [-2720, 600], [-2650, -300]),
  L('Palm Avenue', 'street', 'o:resort', [-2060, 400]),
  L('Marina Road', 'street', 'o:resort', [-2720, 600]),
  L('Villa Hill', 'pass', 'o:resort', [-2450, 100], [-2250, -50], [-2480, -200], [-2300, -380], [-2100, -550]),
  L('Beach Street', 'street', 'o:resort', [-2200, 620], [-2420, 780], [-2200, 950], [-2300, 1150], [-2080, 1350]),
];

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

// ---------- build the main loop ----------
export const ROAD = (() => {
  const C = MAIN, n = C.length, dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = C[(i - 1 + n) % n], p1 = C[i], p2 = C[(i + 1) % n], p3 = C[(i + 2) % n];
    const steps = Math.max(6, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 1.5));
    for (let k = 0; k < steps; k++) dense.push(crc(p0, p1, p2, p3, k / steps));
  }
  const m = dense.length, cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) { const a = dense[i], b = dense[(i + 1) % m]; cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const len = cum[m], N = Math.round(len / DS), ds = len / N;
  const X = new Float32Array(N), Z = new Float32Array(N), Y = new Float32Array(N), TX = new Float32Array(N), TZ = new Float32Array(N), S = new Float32Array(N); let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * ds; while (cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j]), a = dense[j], b = dense[(j + 1) % m];
    X[i] = lerp(a[0], b[0], f); Z[i] = lerp(a[1], b[1], f); Y[i] = ground(X[i], Z[i]);
  }
  for (let i = 0; i < N; i++) { // averaged tangent over +-3 samples
    const a = (i - 3 + N) % N, b = (i + 3) % N, dx = X[b] - X[a], dz = Z[b] - Z[a], l = Math.hypot(dx, dz); TX[i] = dx / l; TZ[i] = dz / l; S[i] = i * ds; }
  return { N, ds, L: len, X, Z, Y, TX, TZ, S };
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
  const cx = Math.floor((x - BOUNDS.x0) / GC), cz = Math.floor((z - BOUNDS.z0) / GC), R = Math.min(Math.ceil(maxD / GC) + 1, GW + GH);
  let best = Infinity, bi = -1;
  for (let r = 0; r <= R; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx += (Math.abs(dz) === r ? 1 : 2 * r || 1)) {
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

// ---------- side roads (open lanes; roundabouts are lanes too) ----------
export const SIDE_HALF = 5;
export const SIDE_ROADS = [];
SIDE_ROADS.names = []; SIDE_ROADS.kinds = [];
function addLane(name, kind, ctrl) {
  const C = ctrl, dense = [], closed = Math.hypot(C[0][0] - C[C.length - 1][0], C[0][1] - C[C.length - 1][1]) < 1;
  const first = closed ? C[C.length - 2] : [2 * C[0][0] - C[1][0], 2 * C[0][1] - C[1][1]], last = closed ? C[1] : [2 * C[C.length - 1][0] - C[C.length - 2][0], 2 * C[C.length - 1][1] - C[C.length - 2][1]];
  const ext = [first, ...C, last];
  for (let i = 1; i < ext.length - 2; i++) { const steps = Math.max(2, Math.ceil(Math.hypot(ext[i + 1][0] - ext[i][0], ext[i + 1][1] - ext[i][1]) / 4)); for (let k = 0; k < steps; k++) dense.push(crc(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], k / steps)); }
  dense.push(C[C.length - 1]);
  let s = 0; const pts = dense.map(([x, z], i) => { const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; if (i) s += Math.hypot(x - a[0], z - a[1]); return { x, z, y: ground(x, z), tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l, s, cross: 0 }; });
  for (const p of pts) {                                          // sideways tilt of the land, and a flat meeting with the main road
    const nx = -p.tz, nz = p.tx; p.cross = clamp((ground(p.x + nx * 4, p.z + nz * 4) - ground(p.x - nx * 4, p.z - nz * 4)) / 8, -0.11, 0.11);
    const q = roadQuery(p.x, p.z, 45); if (q.d < 36) { const w = 1 - sstep((q.d - ROAD_HALF - 3) / 32); p.y = lerp(p.y, q.y, w); p.cross *= 1 - w; }
  }
  SIDE_ROADS.push(pts); SIDE_ROADS.names.push(name); SIDE_ROADS.kinds.push(kind);
}
// a road drawn through a roundabout stops on its ring on the way in and starts again on the way out
const onRing = (name, toward) => { const [cx, cz, r] = ROUNDABOUTS[name], dx = toward[0] - cx, dz = toward[1] - cz, l = Math.hypot(dx, dz) || 1; return [[cx + dx / l * r, cz + dz / l * r], [cx + dx / l * (r + 28), cz + dz / l * (r + 28)]]; };
// long stretches in the high country get a swing to one side between their corners (junctions stay where they are)
const wander = pts => pts.flatMap((p, i) => { const q = pts[i + 1]; if (!q || typeof p === 'string' || typeof q === 'string' || Math.min(p[1], q[1]) > -2300 || Math.max(p[1], q[1]) > -1900 || Math.min(p[1], q[1]) < -2480 || Math.max(p[0], q[0]) > 2900) return [p];
  const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz); if (l < 240) return [p];
  const t = 0.38 + 0.24 * hash2(p[0] | 0, p[1] | 0), a = (hash2(q[0] | 0, q[1] | 0) < 0.5 ? -1 : 1) * Math.min(80, l * 0.16) * (0.5 + 0.7 * hash2(l | 0, 5));
  return [p, [p[0] + dx * t - dz / l * a, p[1] + dz * t + dx / l * a]]; });
for (const { name, kind, pts: drawn } of SIDE_DEF) {
  const pts = wander(drawn);
  const where = p => typeof p === 'string' ? ROUNDABOUTS[p.slice(2)].slice(0, 2) : p;
  let run = [];
  pts.forEach((p, i) => {
    if (typeof p !== 'string') { run.push(p); return; }
    const key = p.slice(2);
    if (i > 0) { const [ring, near] = onRing(key, where(pts[i - 1])); run.push(near, ring); addLane(name, kind, run); }
    run = [];
    if (i < pts.length - 1) { const [ring, near] = onRing(key, where(pts[i + 1])); run.push(ring, near); }
  });
  if (run.length > 1) addLane(name, kind, run);
}
for (const [key, [cx, cz, r]] of Object.entries(ROUNDABOUTS)) addLane('Roundabout ' + key, 'ring', Array.from({ length: 17 }, (_, i) => [cx + r * Math.cos(i / 16 * Math.PI * 2), cz + r * Math.sin(i / 16 * Math.PI * 2)]));

// nearest side road: d = distance to its centre line (Infinity beyond maxD), y = its height there, half = half width
const SG = 32, sideGrid = new Map(), SQ = { d: Infinity, y: 0, half: SIDE_HALF };
for (const pts of SIDE_ROADS) for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1], seg = { a, b }; for (let gx = Math.floor(Math.min(a.x, b.x) / SG); gx <= Math.floor(Math.max(a.x, b.x) / SG); gx++) for (let gz = Math.floor(Math.min(a.z, b.z) / SG); gz <= Math.floor(Math.max(a.z, b.z) / SG); gz++) { const k = gx * 4096 + gz; let l = sideGrid.get(k); if (!l) sideGrid.set(k, l = []); l.push(seg); } }

// ---------- open paved ground (counts as road for the tyres) ----------
export const PLAZA = { x: 346, z: 1480, r: 80 };                                  // drift arena
export const AIRFIELD = { x0: 1640, z0: 2255, x1: 2420, z1: 2335 };               // apron beside the runway
export const MALLS = [          // [x, z] = centre of the lot: building on the north side, car park to the south
  { name: 'City Mall', x: -176, z: 474 }, { name: 'South Bay Mall', x: 225, z: 835 }, { name: 'Central Galleria', x: -283, z: -197 }, { name: 'Farm Outlet', x: -800, z: -840 },
  { name: 'Meadow Park Mall', x: 657, z: 1260 }, { name: 'East Gate Mall', x: 1921, z: 1092 }, { name: 'Dune Mall', x: 2420, z: -1130 }, { name: 'Marina Mall', x: -2163, z: 187 }, { name: 'Harbour Outlet', x: -520, z: 2040 },
];
export const MALL_W = 150, MALL_D = 120;
export function pavedAt(x, z) {
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r) return true;
  return x > AIRFIELD.x0 && x < AIRFIELD.x1 && z > AIRFIELD.z0 && z < AIRFIELD.z1;
}
export function sideQuery(x, z, maxD = 16) {
  SQ.d = Infinity; const r = Math.ceil((maxD + 12) / SG), cx = Math.floor(x / SG), cz = Math.floor(z / SG); let best = Infinity;
  if (pavedAt(x, z)) { SQ.d = 0; SQ.y = ground(x, z) + 0.06; SQ.half = SIDE_HALF; return SQ; }
  for (let i = cx - r; i <= cx + r; i++) for (let j = cz - r; j <= cz + r; j++) { const l = sideGrid.get(i * 4096 + j); if (!l) continue;
    for (const { a, b } of l) { const ex = b.x - a.x, ez = b.z - a.z, u = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez || 1))), d = Math.hypot(x - a.x - ex * u, z - a.z - ez * u);
      if (d < best && d <= maxD) { best = d; SQ.d = d; const lat = clamp(((x - a.x - ex * u) * -ez + (z - a.z - ez * u) * ex) / (Math.hypot(ex, ez) || 1), -SIDE_HALF, SIDE_HALF); SQ.y = a.y + (b.y - a.y) * u + (a.cross + (b.cross - a.cross) * u) * lat; SQ.half = SIDE_HALF; } } }
  return SQ;
}
// distance to the nearest road of any kind, measured as if every road had the main road's half width (for keeping scenery clear)
export function anyRoadDist(x, z, maxD = 40) { const s = sideQuery(x, z, maxD), sd = s.d === Infinity ? Infinity : s.d + (ROAD_HALF - SIDE_HALF), md = roadQuery(x, z, maxD).d; return Math.min(md, sd); }

// ---------- bridges: runs of any road with the land cut away below it ----------
export const BRIDGES = (() => {
  const out = [];
  const scan = (pts, half) => { let run = null; for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (carve(p.x, p.z) > 1.2) (run ||= []).push(p); else if (run) { if (run.length > 3) out.push({ pts: run, half }); run = null; } } if (run && run.length > 3) out.push({ pts: run, half }); };
  const main = []; for (let i = 0; i < ROAD.N; i += 3) main.push({ x: ROAD.X[i], y: ROAD.Y[i], z: ROAD.Z[i], tx: ROAD.TX[i], tz: ROAD.TZ[i] });
  scan(main, ROAD_HALF); for (const pts of SIDE_ROADS) scan(pts, SIDE_HALF);
  return out;
})();

// ---------- places ----------
// kind decides what gets built there (town.js / scenery.js); name is shown on the map
export const DISTRICTS = [
  { id: 'downtown', name: 'DOWNTOWN', x: 30, z: -330, rx: 390, rz: 300, kind: 'downtown' },
  { id: 'oldtown', name: 'OLD TOWN', x: -500, z: -470, rx: 260, rz: 220, kind: 'oldtown' },
  { id: 'suburbs', name: 'THE SUBURBS', x: 650, z: -470, rx: 330, rz: 220, kind: 'suburb' },
  { id: 'university', name: 'UNIVERSITY', x: -950, z: -330, rx: 200, rz: 220, kind: 'campus' },
  { id: 'food', name: 'FOOD QUARTER', x: -720, z: 500, rx: 300, rz: 250, kind: 'food' },
  { id: 'shopping', name: 'SHOPPING DISTRICT', x: 40, z: 660, rx: 440, rz: 260, kind: 'shopping' },
  { id: 'business', name: 'BUSINESS PARK', x: 700, z: 560, rx: 300, rz: 240, kind: 'business' },
  { id: 'port', name: 'THE PORT', x: -120, z: 1930, rx: 760, rz: 280, kind: 'port' },
  { id: 'meadows', name: 'MEADOW TOWN', x: 560, z: 1330, rx: 390, rz: 240, kind: 'suburb' },
  { id: 'ranch', name: 'RANCH VILLAGE', x: -520, z: 1320, rx: 300, rz: 170, kind: 'village' },
  { id: 'farm', name: 'FARM VILLAGE', x: -820, z: -940, rx: 280, rz: 170, kind: 'village' },
  { id: 'lake', name: 'LAKE VILLAGE', x: 540, z: -1330, rx: 320, rz: 100, kind: 'village' },
  { id: 'ski', name: 'SKI VILLAGE', x: -960, z: -1720, rx: 250, rz: 140, kind: 'ski' },
  { id: 'snow', name: 'SNOW VILLAGE', x: -40, z: -3420, rx: 250, rz: 210, kind: 'ski' },
  { id: 'alpine', name: 'ALPINE RESORT', x: 1380, z: -3900, rx: 270, rz: 170, kind: 'ski' },
  { id: 'highland', name: 'HIGHLAND VILLAGE', x: 3720, z: -2050, rx: 240, rz: 200, kind: 'village' },
  { id: 'timber', name: 'TIMBER TOWN', x: 3880, z: -3750, rx: 230, rz: 190, kind: 'town' },
  { id: 'dune', name: 'DUNE TOWN', x: 1900, z: -1860, rx: 260, rz: 220, kind: 'desert' },
  { id: 'strip', name: 'THE STRIP', x: 2530, z: -900, rx: 240, rz: 540, kind: 'casino' },
  { id: 'east', name: 'EAST VILLAGE', x: 1950, z: 920, rx: 400, rz: 200, kind: 'town' },
  { id: 'resort', name: 'PALM RESORT', x: -2330, z: 430, rx: 320, rz: 350, kind: 'resort' },
  { id: 'villas', name: 'VILLA HEIGHTS', x: -2330, z: -250, rx: 270, rz: 220, kind: 'villas' },
  { id: 'airfield', name: 'AIRFIELD', x: 2000, z: 2290, rx: 450, rz: 90, kind: 'airfield' },
];
export const districtAt = (x, z, grow = 1) => DISTRICTS.find(d => ((x - d.x) / (d.rx * grow)) ** 2 + ((z - d.z) / (d.rz * grow)) ** 2 < 1) || null;
export const SPOTS = [
  { id: 'park', name: 'Fun Park', x: 1245, z: -57, r: 95 }, { id: 'stadium', name: 'Stadium', x: 1700, z: 220, r: 120 }, { id: 'turbines', name: 'Wind Farm', x: 1254, z: -1159, r: 110 },
  { id: 'quarry', name: 'Quarry', x: 536, z: -1805, r: 90 }, { id: 'barns', name: 'Big Farm', x: -870, z: 1200, r: 80 }, { id: 'lighthouse', name: 'Lighthouse', x: -2600, z: 1260, r: 30 },
  { id: 'castle', name: 'Castle', x: -2100, z: -1420, r: 80 }, { id: 'oasis', name: 'Oasis', x: 2000, z: 250, r: 80 }, { id: 'golf', name: 'Golf Club', x: -1147, z: 458, r: 100 },
  { id: 'pier', name: 'Pier', x: -2780, z: 380, r: 40 }, { id: 'central', name: 'Central Park', x: 0, z: -250, r: 70 },
];
export function zoneAt(x, z) {
  if (x > 3080) return 'highlands';
  if (z < -2450) return 'mountain';
  if (x < -1650 && z > -800 && z < 1600) return 'island';
  if (x > 1550 && z < 750) return 'desert';
  if (z < -1330 && x < 900) return 'mountain';
  if (x > 1450 && z > 1250) return 'track';
  if (z > 1580) return x > 1250 ? 'track' : 'port';
  if (x > -1200 && x < 1150 && z > -800 && z < 1050) return 'city';
  return 'valley';
}
export const isBeach = (x, z, margin = 0) => seaward(x, z) > -55 - margin && zoneAt(x, z) !== 'port';

// garages: building 40 m from the road centreline, glowing drive-in zone 19 m out; `yaw` makes the building front face the road
const GAR = [['beach', 'Harbour Garage', 320, 1700, -1], ['city', 'Downtown Garage', -1000, 940, 1], ['mountain', 'Pass Garage', -620, -2300, 1]];
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

// ---------- natural relief away from the roads ----------
const ridged = (x, z) => { let sum = 0, amp = 0.62, f = 1 / 300, prev = 1; for (let o = 0; o < 4; o++) { let n = 1 - Math.abs(vnoise(x * f + o * 19.1, z * f + o * 7.7) * 2 - 1); n *= n; sum += n * amp * (0.35 + 0.65 * prev); prev = n; f *= 2.15; amp *= 0.5; } return sum; };
const PEAKS = [        // x, z, radius, height: mountains in the north, mesas in the desert
  [-300, -2520, 520, 230], [-2650, -2050, 600, 250], [850, -2350, 520, 200], [-2000, -1250, 420, 130], [150, -1750, 320, 100], [-1150, -2550, 480, 220],
  [-760, -1350, 330, 80], [-1900, -2420, 450, 200], [800, -1550, 300, 90], [-2150, -1950, 260, 90], [-700, -1780, 220, 55],
  [-1700, -2650, 380, 210], [-600, -2500, 300, 170], [700, -2750, 520, 280], [-520, -3900, 300, 200], [-1950, -3400, 440, 260], [-450, -3050, 280, 190], [850, -2800, 420, 270], [-3000, -3000, 500, 270], [-2750, -4350, 620, 290],
  [-1250, -4700, 500, 260], [450, -4750, 540, 310], [2350, -2650, 340, 190], [1900, -3750, 360, 210], [2950, -3100, 500, 240], [2800, -4400, 600, 290], [750, -3850, 300, 190],
  [3350, -1250, 330, 130], [4050, -2100, 380, 190], [4900, -1600, 420, 200], [3550, -3450, 360, 180], [5000, -2750, 420, 220], [4400, -4200, 520, 240], [3900, -350, 300, 110], [3300, -3800, 330, 170], [4400, -950, 300, 130],
  [2900, -1150, 380, 90], [1550, -1750, 260, 55], [2100, -1130, 200, 42], [2880, 150, 360, 70], [2050, 100, 170, 30], [1500, -1150, 240, 40],
];
const flatAround = (x, z) => { let k = 1; for (const s of SPOTS) if (Math.abs(x - s.x) < s.r + 60 && Math.abs(z - s.z) < s.r + 60) k = Math.min(k, sstep((Math.hypot(x - s.x, z - s.z) - s.r) / 60)); for (const m of MALLS) if (Math.abs(x - m.x) < 160 && Math.abs(z - m.z) < 160) k = Math.min(k, sstep((Math.hypot(x - m.x, z - m.z) - 100) / 60));
  for (const d of DISTRICTS) if (Math.abs(x - d.x) < 1.3 * d.rx && Math.abs(z - d.z) < 1.3 * d.rz) k = Math.min(k, sstep((Math.hypot((x - d.x) / d.rx, (z - d.z) / d.rz) - 0.9) / 0.4)); return k; };
function relief(x, z) {
  const wx = bentX(x, z, 230, 330) + (fbm(x / 85, z / 85) - 0.5) * 90, wz = bentZ(x, z, 230, 330) + (fbm(x / 85 + 4, z / 85 + 6) - 0.5) * 90;
  let m = 0; for (const [px, pz, R, H] of PEAKS) { if (Math.abs(wz - pz) >= R || Math.abs(wx - px) >= R / 0.7) continue; const d = Math.hypot((wx - px) * (1 + 0.3 * Math.sin(px)), wz - pz) / R; if (d < 1) { const v = H * Math.pow(1 - d, 1.15) * (0.38 + 1.0 * ridged(x + px, z - pz)); m = Math.max(m, v) + Math.min(m, v) * 0.25; } }
  const wild = Math.max(sstep((-z - 2450) / 350), sstep((x - 2980) / 320));
  if (wild > 0) m = Math.max(m, 150 * ridged(wx * 1.15 + 400, wz * 1.15) * wild);
  return m + (fbm(x / 260, z / 260) - 0.42) * 7;
}

// ---------- height field ----------
export const TERRAIN = { H: new Float32Array(NX * NZ), D: new Float32Array(NX * NZ), DS: new Float32Array(NX * NZ) };   // height, distance to main road, distance to side road
(() => {
  const N = NX * NZ, near = new Float32Array(N).fill(1e9), ny = new Float32Array(N);
  TERRAIN.D.fill(1e9); TERRAIN.DS.fill(1e9);
  const stamp = (a, b, dist, reach) => {
    const ex = b.x - a.x, ez = b.z - a.z, L2 = ex * ex + ez * ez || 1, len = Math.sqrt(L2);
    for (let j = Math.max(0, Math.floor((Math.min(a.z, b.z) - reach - BOUNDS.z0) / CELL)); j <= Math.min(NZ - 1, Math.ceil((Math.max(a.z, b.z) + reach - BOUNDS.z0) / CELL)); j++)
      for (let i = Math.max(0, Math.floor((Math.min(a.x, b.x) - reach - BOUNDS.x0) / CELL)); i <= Math.min(NX - 1, Math.ceil((Math.max(a.x, b.x) + reach - BOUNDS.x0) / CELL)); i++) {
        const x = BOUNDS.x0 + i * CELL, z = BOUNDS.z0 + j * CELL, u = clamp(((x - a.x) * ex + (z - a.z) * ez) / L2, 0, 1), px = x - a.x - ex * u, pz = z - a.z - ez * u, d = Math.sqrt(px * px + pz * pz), o = i + j * NX;
        if (d < dist[o]) dist[o] = d;
        if (d < near[o]) { near[o] = d; const tilt = ((a.cross || 0) + ((b.cross || 0) - (a.cross || 0)) * u) * clamp((px * -ez + pz * ex) / len, -5.6, 5.6); ny[o] = a.y + (b.y - a.y) * u + tilt; }
      }
  };
  for (let i = 0; i < ROAD.N; i += 4) { const k = (i + 4) % ROAD.N; stamp({ x: ROAD.X[i], y: ROAD.Y[i], z: ROAD.Z[i] }, { x: ROAD.X[k], y: ROAD.Y[k], z: ROAD.Z[k] }, TERRAIN.D, 56); }
  for (const pts of SIDE_ROADS) for (let i = 0; i + 1 < pts.length; i += 2) stamp(pts[i], pts[Math.min(pts.length - 1, i + 2)], TERRAIN.DS, 56);
  // coarse distance to any road: mountains rise only gradually away from the roads
  const FC = 32, FW = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / FC) + 1, FH = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / FC) + 1, far = new Float32Array(FW * FH).fill(420);
  const mark = p => { const gx = (p.x - BOUNDS.x0) / FC, gz = (p.z - BOUNDS.z0) / FC; for (let j = Math.max(0, Math.floor(gz) - 13); j <= Math.min(FH - 1, Math.floor(gz) + 14); j++) for (let i = Math.max(0, Math.floor(gx) - 13); i <= Math.min(FW - 1, Math.floor(gx) + 14); i++) { const d = Math.hypot(i - gx, j - gz) * FC, o = i + j * FW; if (d < far[o]) far[o] = d; } };
  for (let i = 0; i < ROAD.N; i += 8) mark({ x: ROAD.X[i], z: ROAD.Z[i] }); for (const pts of SIDE_ROADS) for (let i = 0; i < pts.length; i += 4) mark(pts[i]);
  const farAt = (x, z) => { const fx = clamp((x - BOUNDS.x0) / FC, 0, FW - 1.001), fz = clamp((z - BOUNDS.z0) / FC, 0, FH - 1.001), i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, o = i + j * FW; return lerp(lerp(far[o], far[o + 1], u), lerp(far[o + FW], far[o + FW + 1], u), v); };
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = BOUNDS.x0 + i * CELL, z = BOUNDS.z0 + j * CELL, o = i + j * NX, base = ground(x, z), d = near[o];
    let h = d < 1e8 ? lerp(ny[o], base, sstep((d - CORRIDOR) / 40)) : base;
    h -= 0.15 * (1 - sstep((d - 20) / 20));
    const open = sstep((Math.min(d, farAt(x, z)) - 26) / 20);
    if (open > 0) {
      if (seaward(x, z) < 0) {                                              // nothing rises out of the water
        const r = relief(x, z), band = z < -2450 || x > 3050 ? Math.max(55, r * 0.7) : Math.max(80, r * 1.35);
        h += r * sstep((farAt(x, z) - 30) / band) * open * flatAround(x, z) * sstep(-seaward(x, z) / 90);
      }
      const shore = sstep((seaward(x, z) + 75) / 55); if (shore > 0 && h < 14) h = lerp(h, Math.min(h, 1.7), shore * open);   // sandy shore
    }
    for (const p of PADS) { const w = (1 - sstep((Math.hypot(x - p.x, z - p.z) - p.r) / p.blend)) * sstep((d - 13) / 8); if (w > 0) h = lerp(h, p.h, w); }
    TERRAIN.H[o] = h - carve(x, z);
  }
})();

// terrain height, bilinear on the same triangulation as the mesh (diagonal b-c)
export function terrainH(x, z) {
  const fx = Math.min(NX - 1.001, Math.max(0, (x - BOUNDS.x0) / CELL)), fz = Math.min(NZ - 1.001, Math.max(0, (z - BOUNDS.z0) / CELL));
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, o = i + j * NX, H = TERRAIN.H;
  const a = H[o], b = H[o + 1], c = H[o + NX], d = H[o + NX + 1];
  return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
}
export function terrainSlope(x, z) { const e = 3; return Math.hypot(terrainH(x + e, z) - terrainH(x - e, z), terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e); }
