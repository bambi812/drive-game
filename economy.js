// economy.js — server-authoritative money rules. Pure functions on an account object (no sockets), easy to test.
// The client can never set money: it can only ask to buy/select, and every request is validated here.
import { CARS, CAR_IDS, DEFAULT_CAR, STARTERS, UPGRADES, START_MONEY, DEFAULT_COS, upgradePrice, stylePrice, cleanCos } from './public/catalog.js';
const PARTS = Object.keys(UPGRADES);
const freshUp = () => ({ engine: 0, tires: 0, brakes: 0, weight: 0 });
// Cars are bought now. Accounts made before cars had prices (no `eco` mark) already had every car: they keep them all.
export function ensureCars(a) {
  a.up = a.up || {}; a.cos = a.cos || {}; a.found = a.found || []; a.pb = a.pb || {};
  if (a.eco !== 2) { a.cars = CAR_IDS.slice(); a.eco = 2; }
  a.cars = (a.cars || []).filter(id => Object.hasOwn(CARS, id)); for (const id of STARTERS) if (!a.cars.includes(id)) a.cars.push(id);
  for (const id of CAR_IDS) { if (!a.up[id]) a.up[id] = freshUp(); if (!a.cos[id]) a.cos[id] = { ...DEFAULT_COS }; }
  for (const id of Object.keys(a.up)) if (!Object.hasOwn(CARS, id)) delete a.up[id];
  for (const id of Object.keys(a.cos)) if (!Object.hasOwn(CARS, id)) delete a.cos[id];
  if (!a.cars.includes(a.sel)) a.sel = DEFAULT_CAR; return a;
}
export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export const newProfile = (name, kind) => ensureCars({
  name, kind, eco: 2, daily: today(), money: START_MONEY, cars: STARTERS.slice(), up: {}, cos: {}, sel: DEFAULT_CAR,
  stats: { topSpeed: 0, bestDrift: 0, traps: 0, drifts: 0, earned: 0, races: 0, wins: 0 }, earnLog: [],
});
// what the client may see
export const publicProfile = a => (ensureCars(a), { name: a.name, kind: a.kind, money: a.money, cars: a.cars, up: a.up, cos: a.cos, sel: a.sel, stats: a.stats, found: a.found, pb: a.pb });
const fail = error => ({ ok: false, error }), ok = () => ({ ok: true });
const spend = (a, price) => { if (!Number.isInteger(price) || price < 0) return false; if (a.money < price) return false; a.money -= price; return true; };

export function buyCar(a, id) {
  if (typeof id !== 'string' || !Object.hasOwn(CARS, id)) return fail('Unknown car'); const c = CARS[id];
  if (a.cars.includes(id)) return fail('Already owned');
  if (!spend(a, c.price)) return fail('Not enough money');
  a.cars.push(id); a.up[id] = freshUp(); a.cos[id] = { ...DEFAULT_COS }; a.sel = id; return ok();
}
export function buyUpgrade(a, car, part) {
  if (!a.cars.includes(car)) return fail('You do not own that car'); if (typeof part !== 'string' || !PARTS.includes(part)) return fail('Unknown part');
  const cur = a.up[car][part]; if (cur >= 3) return fail('Already maxed');
  if (!spend(a, upgradePrice(car, part, cur + 1))) return fail('Not enough money');
  a.up[car][part] = cur + 1; return ok();
}
export function buyStyle(a, car, cos) {
  if (!a.cars.includes(car)) return fail('You do not own that car'); const n = cleanCos(cos); if (!n) return fail('Invalid style');
  if (!spend(a, stylePrice(a.cos[car], n))) return fail('Not enough money'); a.cos[car] = n; return ok();
}
export function selectCar(a, id) { if (!a.cars.includes(id)) return fail('You do not own that car'); a.sel = id; return ok(); }

// rewards: per-event cap + rolling 60 s cap (rate-limit against farming / bugs)
const EVENT_CAP = { trap: 2500, drift: 3000, race: 50000, daily: 1000, discover: 750 }, WINDOW_CAP = 9000;
export function earn(a, amount, reason, now = Date.now()) {
  amount = Math.floor(amount); if (!Number.isFinite(amount) || amount <= 0 || !Object.hasOwn(EVENT_CAP, reason)) return 0;
  amount = Math.min(amount, EVENT_CAP[reason]);
  a.earnLog = (a.earnLog || []).filter(e => now - e[0] < 60000);
  if (reason !== 'race' && reason !== 'daily') { const recent = a.earnLog.reduce((s, e) => s + e[1], 0); amount = Math.max(0, Math.min(amount, WINDOW_CAP - recent)); }
  if (amount <= 0) return 0;
  a.money += amount; a.stats.earned += amount; a.earnLog.push([now, amount]); return amount;
}
export const trapPay = kmh => (kmh >= 80 ? Math.round((kmh - 60) * 4) : 0);
export const driftPay = score => Math.round(score * 1.2);
