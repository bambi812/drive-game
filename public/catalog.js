// catalog.js — shared by server and client: cars, upgrades (prices/races are added in later phases).
// Spec units: SI (kg, m, Nm). front = static weight fraction on the front axle.
const GEARS = [3.62, 2.19, 1.54, 1.20, 1.00, 0.83];
export const CARS = {
  rookie:  { name: 'Rookie',  price: 0,     model: null, paint: { body: /^paint$/, rims: /^rim$/, spoiler: { y: 1.1, z: -1.95 } },
    spec: { mass: 1100, wb: 2.50, front: 0.57, cgh: 0.50, torque: 200, idle: 900, redline: 6600, gears: GEARS, rev: 3.3, final: 4.1, eff: 0.88, rw: 0.31, cdA: 0.70, clA: 0.0, muF: 1.00, muR: 1.02, brakeG: 1.0, steerMax: 0.52 } },
  brz:     { name: 'Subaru BRZ TS', price: 12000, model: 'models/brz/scene.gltf', length: 4.27, yaw: 0, lift: 0, paint: { body: /Paint_Material1$/, rims: /Wheel1A_3D/, spoiler: { y: 1.12, z: -1.9 } },   // material names found in scene.gltf
    spec: { mass: 1270, wb: 2.58, front: 0.53, cgh: 0.46, torque: 250, idle: 850, redline: 7400, gears: GEARS, rev: 3.4, final: 4.10, eff: 0.88, rw: 0.325, cdA: 0.66, clA: 0.10, muF: 1.08, muR: 1.10, brakeG: 1.08, steerMax: 0.54 } },
  mustang: { name: 'Ford Mustang GT', price: 45000, model: 'models/mustang/scene.gltf', length: 4.78, yaw: 0, lift: 0, paint: { body: /PaintTNR_Material$/, rims: /3DWheel2A|^RIM_B$/, spoiler: { y: 1.22, z: -2.15 } },
    spec: { mass: 1750, wb: 2.72, front: 0.54, cgh: 0.52, torque: 540, idle: 800, redline: 7000, gears: [3.66, 2.43, 1.69, 1.32, 1.00, 0.65], rev: 3.3, final: 3.55, eff: 0.88, rw: 0.345, cdA: 0.78, clA: 0.08, muF: 1.10, muR: 1.12, brakeG: 1.08, steerMax: 0.52 } },
};
// Upgrade stages (0..3): multipliers on the base spec. Prices are added in Phase 5.
export const UPGRADES = {
  engine: { torque: [1, 1.07, 1.14, 1.22] },
  tires:  { mu: [1, 1.05, 1.10, 1.16] },
  brakes: { brake: [1, 1.10, 1.20, 1.30] },
  weight: { mass: [1, 0.96, 0.92, 0.88] },
};
// physical spec of a car with its installed upgrades {engine,tires,brakes,weight}
export function carSpec(id, up = {}) {
  const c = CARS[id] || CARS.rookie, s = { ...c.spec }, g = (k, f) => UPGRADES[k][f][Math.max(0, Math.min(3, up[k] | 0))];
  s.torque *= g('engine', 'torque'); s.muF *= g('tires', 'mu'); s.muR *= g('tires', 'mu'); s.brakeG *= g('brakes', 'brake'); s.mass *= g('weight', 'mass');
  return s;
}

// ---- Phase 3: speed traps (straights) and drift zones (corners). s = arc length along the road loop.
import { roadQuery } from './world.js';
const sAt = (x, z) => roadQuery(x, z, 1e4).s;
export const SPEED_TRAPS = [
  { id: 'beach', name: 'Coast Blast', x: -175, z: 895 }, { id: 'city', name: 'Eastside Run', x: 1100, z: 330 },
  { id: 'summit', name: 'Summit Straight', x: -300, z: -1068 }, { id: 'west', name: 'Westside Descent', x: -1300, z: -50 },
].map(t => ({ ...t, s: sAt(t.x, t.z) }));
export const DRIFT_ZONES = [
  { id: 'hp1', name: 'Hairpin I', a: [330, -330], b: [330, -490] }, { id: 'hp2', name: 'Hairpin II', a: [670, -490], b: [670, -650] },
  { id: 'hp3', name: 'Hairpin III', a: [330, -650], b: [330, -810] }, { id: 'hp4', name: 'Hairpin IV', a: [670, -810], b: [670, -970] },
  { id: 'city', name: 'Downtown Sweeper', a: [900, 800], b: [1090, 520] }, { id: 'desc', name: 'Ridge Bend', a: [-700, -1000], b: [-1000, -780] },
].map(z => ({ ...z, s0: sAt(...z.a), s1: sAt(...z.b) }));

// ---- Phase 4/5: prices (server validates every purchase against these; clients only display them)
export const START_MONEY = 5000;
export const TIER = { rookie: 0.5, brz: 1, mustang: 1.8 };                                   // upgrade price multiplier per car
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
  { id: 'sprint', name: 'Downtown Sprint', s0: 1450, cps: [1700, 1950, 2200, 2450, 2700], prize: 2000, color: '#ff3d81' },
  { id: 'coastal', name: 'Coastal Dash', s0: 50, cps: [350, 650, 950, 1200, 1450], prize: 2500, color: '#19c6d8' },
  { id: 'mountain', name: 'Mountain Run', s0: 3300, cps: [3900, 4400, 4900, 5400, 5900], prize: 5000, color: '#7bd34a' },
  { id: 'loop', name: 'Grand Loop', s0: 200, cps: [1700, 3200, 4700, 6200, 7700, 9364], prize: 12000, color: '#ffb300' },
].map(r => ({ ...r, length: r.cps[r.cps.length - 1] - r.s0 }));
export const PLACE_PRIZE = [1, 0.6, 0.4, 0.25], SOLO_PRIZE = 0.4;   // share of the race prize by finishing place; a solo race pays 40%
