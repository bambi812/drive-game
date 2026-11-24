// economy.js — server-authoritative money rules. Pure functions on an account object (no sockets), easy to test.
// The client can never set money: it can only ask to buy/select, and every request is validated here.
import { CARS, UPGRADES, START_MONEY, DEFAULT_COS, upgradePrice, stylePrice, cleanCos } from './public/catalog.js';
const PARTS = Object.keys(UPGRADES);
export const newProfile = (name, kind) => ({
  name, kind, money: START_MONEY, cars: ['rookie'], up: { rookie: { engine: 0, tires: 0, brakes: 0, weight: 0 } }, cos: { rookie: { ...DEFAULT_COS } }, sel: 'rookie',
  stats: { topSpeed: 0, bestDrift: 0, traps: 0, drifts: 0, earned: 0, races: 0, wins: 0 }, earnLog: [],
});
// what the client may see
export const publicProfile = a => ({ name: a.name, kind: a.kind, money: a.money, cars: a.cars, up: a.up, cos: a.cos, sel: a.sel, stats: a.stats });
const fail = error => ({ ok: false, error }), ok = () => ({ ok: true });
const spend = (a, price) => { if (!Number.isInteger(price) || price < 0) return false; if (a.money < price) return false; a.money -= price; return true; };

export function buyCar(a, id) {
  if (typeof id !== 'string' || !Object.hasOwn(CARS, id)) return fail('Unknown car'); const c = CARS[id];
  if (a.cars.includes(id)) return fail('Already owned');
  if (!spend(a, c.price)) return fail('Not enough money');
  a.cars.push(id); a.up[id] = { engine: 0, tires: 0, brakes: 0, weight: 0 }; a.cos[id] = { ...DEFAULT_COS }; return ok();
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
const EVENT_CAP = { trap: 2500, drift: 3000, race: 50000 }, WINDOW_CAP = 9000;
export function earn(a, amount, reason, now = Date.now()) {
  amount = Math.floor(amount); if (!Number.isFinite(amount) || amount <= 0 || !Object.hasOwn(EVENT_CAP, reason)) return 0;
  amount = Math.min(amount, EVENT_CAP[reason]);
  a.earnLog = (a.earnLog || []).filter(e => now - e[0] < 60000);
  if (reason !== 'race') { const recent = a.earnLog.reduce((s, e) => s + e[1], 0); amount = Math.max(0, Math.min(amount, WINDOW_CAP - recent)); }
  if (amount <= 0) return 0;
  a.money += amount; a.stats.earned += amount; a.earnLog.push([now, amount]); return amount;
}
export const trapPay = kmh => (kmh >= 80 ? Math.round((kmh - 60) * 4) : 0);
export const driftPay = score => Math.round(score * 1.2);
