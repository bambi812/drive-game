// catalog.js - shared by server and client: cars (see car-data.js), upgrades, prices, races, speed traps, drift zones.
import { CARS as CAR_DEFS, CAR_IDS, DEFAULT_CAR } from './car-data.js';
export { CAR_IDS, DEFAULT_CAR };
// two starter cars are free; the rest are bought with winnings
export const STARTERS = ['brz24', 'brz13'];
export const CAR_PRICES = { brz24: 0, brz13: 0, rx7: 28000, mustang: 38000, supra94: 26000, m2: 34000, supra20: 40000, hellcat: 55000, m4: 62000, c4s: 85000, gt3r: 150000, mclaren: 200000,
  mx5: 12000, ae92: 11000, ae86: 15000, z280: 17000, c110: 24000, e30: 26000, elise: 32000, sl300: 70000, p930: 60000, nsx: 48000, r34: 52000, c991: 88000, c7: 64000, gt500: 78000, p1: 260000, suburban: 14000 };
export const CARS = Object.fromEntries(Object.entries(CAR_DEFS).map(([id, c]) => [id, { ...c, price: CAR_PRICES[id] ?? 50000 }]));
// one-off rewards: places pay once when first reached by driving, and each new day of play pays a bonus
export const DAILY_BONUS = 1000, DISCOVER_BONUS = 750;
export const DISCOVER = [['downtown', 'Downtown', 0, -170], ['markets', 'Shopping District', 60, 710], ['harbour', 'The Port', -100, 1800], ['speedway', 'Speedway', 2050, 1380], ['strip', 'The Strip', 2560, -698], ['rim', 'Canyon Bridge', 2200, -1500], ['oasis', 'Oasis', 2000, -90], ['summit', 'Summit', -950, -2300], ['glacier', 'Glacier Road', -2350, -1850], ['lake', 'Mirror Lake', 520, -1270], ['resort', 'Palm Resort', -2300, 360], ['villas', 'Villa Heights', -2250, -50], ['sunset', 'Sunset Bridge', -1550, -230]].map(([id, name, x, z]) => ({ id, name, x, z, r: 90 }));
// Upgrade stages (0..3): multipliers on the base spec. Prices are added in Phase 5.
export const UPGRADES = {
  engine: { torque: [1, 1.07, 1.14, 1.22] },
  tires:  { mu: [1, 1.05, 1.10, 1.16] },
  brakes: { brake: [1, 1.10, 1.20, 1.30] },
  weight: { mass: [1, 0.96, 0.92, 0.88] },
};
// physical spec of a car with its installed upgrades {engine,tires,brakes,weight}
export function carSpec(id, up = {}) {
  const c = CARS[id] || CARS[DEFAULT_CAR], s = { ...c.spec }, g = (k, f) => UPGRADES[k][f][Math.max(0, Math.min(3, up[k] | 0))];
  s.torque *= g('engine', 'torque'); s.muF *= g('tires', 'mu'); s.muR *= g('tires', 'mu'); s.brakeG *= g('brakes', 'brake'); s.mass *= g('weight', 'mass');
  return s;
}

// ---- Phase 3: speed traps (straights) and drift zones (corners). s = arc length along the road loop.
import { roadQuery } from './world.js';
const sAt = (x, z) => roadQuery(x, z, 1e4).s;
export const SPEED_TRAPS = [
  { id: 'seafront', name: 'Port Avenue', x: -48, z: 1330 }, { id: 'south', name: 'Desert Flat', x: 2635, z: 160 },
  { id: 'ridge', name: 'Summit Straight', x: 1180, z: -2060 }, { id: 'eagle', name: 'West Ring', x: -1060, z: 520 },
].map(t => ({ ...t, s: sAt(t.x, t.z) }));
const zone = (id, name, x, z, len = 450) => { const s0 = Math.round(sAt(x, z)); return { id, name, s0, s1: s0 + len }; };
export const DRIFT_ZONES = [          // s0..s1 along the loop
  zone('eagle1', 'Peak Esses', 560, -1950), zone('eagle2', 'Cliff Hairpins', -480, -2150), zone('iron', 'Glacier Bends', -950, -1900),
  zone('serp1', 'Snow Serpent', -1380, -2260), zone('serp2', 'Mountain Drop', -1500, -1700), zone('pines', 'Speedway Gate', 1500, 1950, 400),
];
// ---- Phase 4/5: prices (server validates every purchase against these; clients only display them)
export const START_MONEY = 5000;
export const TIER = { brz24: 1, brz13: 0.8, mustang: 1.3, m2: 1.5, m4: 1.9, supra20: 1.5, supra94: 1.2, rx7: 1, mclaren: 3, c4s: 2.2, gt3r: 3, hellcat: 1.8,
  mx5: 0.9, ae92: 0.9, ae86: 1, z280: 1, c110: 1.1, e30: 1.1, elise: 1.2, sl300: 1.6, p930: 1.5, nsx: 1.3, r34: 1.4, c991: 1.8, c7: 1.5, gt500: 1.7, p1: 3.2, suburban: 1 };                                   // upgrade price multiplier per car
export const UPGRADE_BASE = { engine: [2500, 6000, 12000], tires: [1500, 4000, 8000], brakes: [1200, 3000, 6000], weight: [2000, 5000, 10000] };
export const upgradePrice = (car, part, nextStage) => Math.round(UPGRADE_BASE[part][nextStage - 1] * (TIER[car] ?? 1) / 50) * 50;   // nextStage = 1..3
export const DEFAULT_COS = { paint: '#e53935', finish: 'gloss', rims: 0, underglow: '', spoiler: 0 };
export const STYLE = { paint: 300, finish: { gloss: 0, matte: 400, metallic: 700 }, rims: [0, 600, 900, 1200, 1500, 2000], spoiler: [0, 800, 1400, 2200], underglow: 900 };
const HEXC = /^#[0-9a-fA-F]{6}$/;
// returns a validated cosmetics object or null
export function cleanCos(c) {
  if (!c || typeof c !== 'object' || typeof c.paint !== 'string' || !HEXC.test(c.paint) || typeof c.finish !== 'string' || !Object.hasOwn(STYLE.finish, c.finish) || !Number.isInteger(c.rims) || c.rims < 0 || c.rims > 5 || !Number.isInteger(c.spoiler) || c.spoiler < 0 || c.spoiler > 3) return null;
  if (typeof c.underglow !== 'string' || (c.underglow !== '' && !HEXC.test(c.underglow))) return null;
  return { paint: c.paint.toLowerCase(), finish: c.finish, rims: c.rims, underglow: c.underglow.toLowerCase(), spoiler: c.spoiler };
}
// price of changing cosmetics from `a` to `b` (both validated): only changed items are charged
export function stylePrice(a, b) {
  let p = 0; if (a.paint !== b.paint) p += STYLE.paint; if (a.finish !== b.finish) p += STYLE.finish[b.finish]; if (a.rims !== b.rims) p += STYLE.rims[b.rims];
  if (a.spoiler !== b.spoiler) p += STYLE.spoiler[b.spoiler]; if (a.underglow !== b.underglow && b.underglow !== '') p += STYLE.underglow; return p;
}

// ---- Phase 5: cosmetic option tables (index = value stored in cosmetics; prices live in STYLE above)
export const RIMS = [{ name: 'Stock', color: '#ffffff' }, { name: 'Silver', color: '#d3d8de' }, { name: 'Gloss black', color: '#1c1c1f' }, { name: 'Gold', color: '#e0b43a' }, { name: 'Bronze', color: '#a8643a' }, { name: 'Neon blue', color: '#3a8bff' }];
export const SPOILERS = ['None', 'Lip', 'Ducktail', 'GT wing'];
export const PAINTS = ['#e53935', '#ff7043', '#ffb300', '#fdd835', '#7cb342', '#00897b', '#00acc1', '#1e88e5', '#3949ab', '#8e24aa', '#d81b60', '#f5f5f5', '#9e9e9e', '#212121', '#6d4c41', '#c0a060'];
export const GLOWS = ['', '#00e5ff', '#ff2bd6', '#7dff3a', '#ff3b30', '#ffd400', '#7b5cff'];
// ---- Phase 6: races. s0 = start gate, cps = ordered checkpoints (last = finish), s in metres along the loop (may exceed the loop length for a full lap)
const race = (id, name, s0, len, n, prize, color) => ({ id, name, s0, cps: Array.from({ length: n }, (_, i) => Math.round(s0 + len * (i + 1) / n)), prize, color });
export const RACES = [
  race('harbor', 'Port Dash', 40, 1410, 5, 2500, '#19c6d8'),
  race('forest', 'Desert Sprint', Math.round(sAt(2600, 500)), 1300, 5, 2000, '#ff3d81'),
  race('eagle', 'Mountain Climb', Math.round(sAt(560, -1950)), 3400, 5, 5000, '#7bd34a'),
  race('grand', 'Grand Tour', 200, 16900, 6, 12000, '#ffb300'),
].map(r => ({ ...r, length: r.cps[r.cps.length - 1] - r.s0 }));
export const PLACE_PRIZE = [1, 0.6, 0.4, 0.25], SOLO_PRIZE = 0.4;   // share of the race prize by finishing place; a solo race pays 40%
