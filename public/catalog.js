// catalog.js - shared by server and client: cars (see car-data.js), upgrades, prices, races, speed traps, drift zones.
import { CARS as CAR_DEFS, CAR_IDS, DEFAULT_CAR } from './car-data.js';
export { CAR_IDS, DEFAULT_CAR };
export const CARS = Object.fromEntries(Object.entries(CAR_DEFS).map(([id, c]) => [id, { ...c, price: 0 }]));   // every car is free for now (price 0)
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
  { id: 'beach', name: 'Coast Blast', x: -300, z: 880 }, { id: 'city', name: 'Eastside Run', x: 1405, z: 455 },
  { id: 'summit', name: 'Ridge Straight', x: -300, z: -960 }, { id: 'west', name: 'Seaside Descent', x: -1415, z: 235 },
].map(t => ({ ...t, s: sAt(t.x, t.z) }));
export const DRIFT_ZONES = [
  { id: 'hp1', name: 'East Pass I', a: [800, -340], b: [1050, -405] }, { id: 'hp2', name: 'East Pass II', a: [1250, -355], b: [1245, -610] },
  { id: 'hp3', name: 'East Pass III', a: [700, -515], b: [640, -765] }, { id: 'hp4', name: 'West Pass I', a: [-1055, -865], b: [-1175, -590] },
  { id: 'city', name: 'West Pass II', a: [-1005, -645], b: [-905, -405] }, { id: 'desc', name: 'Harbour Sweeper', a: [1270, 900], b: [1500, 620] },
].map(z => ({ ...z, s0: sAt(...z.a), s1: sAt(...z.b) }));
// ---- Phase 4/5: prices (server validates every purchase against these; clients only display them)
export const START_MONEY = 5000;
export const TIER = { brz24: 1, brz13: 0.8, mustang: 1.3, m2: 1.5, m4: 1.9, supra20: 1.5, supra94: 1.2, rx7: 1, mclaren: 3, c4s: 2.2, gt3r: 3, hellcat: 1.8 };                                   // upgrade price multiplier per car
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
export const RACES = [
  { id: 'sprint', name: 'Neon Sprint', s0: 2350, cps: [2600, 2850, 3100, 3350, 3600], prize: 2000, color: '#ff3d81' },
  { id: 'coastal', name: 'Coastal Dash', s0: 50, cps: [350, 650, 950, 1200, 1450], prize: 2500, color: '#19c6d8' },
  { id: 'mountain', name: 'Touge Climb', s0: 3750, cps: [4400, 5100, 5800, 6500, 7200], prize: 5000, color: '#7bd34a' },
  { id: 'loop', name: 'Grand Loop', s0: 1700, cps: [4000, 6300, 8600, 10900, 13200, 14440], prize: 12000, color: '#ffb300' },
].map(r => ({ ...r, length: r.cps[r.cps.length - 1] - r.s0 }));
export const PLACE_PRIZE = [1, 0.6, 0.4, 0.25], SOLO_PRIZE = 0.4;   // share of the race prize by finishing place; a solo race pays 40%
