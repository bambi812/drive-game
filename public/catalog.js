// catalog.js — shared by server and client: cars, upgrades (prices/races are added in later phases).
// Spec units: SI (kg, m, Nm). front = static weight fraction on the front axle.
const GEARS = [3.62, 2.19, 1.54, 1.20, 1.00, 0.83];
export const CARS = {
  rookie:  { name: 'Rookie',  price: 0,     model: null,
    spec: { mass: 1100, wb: 2.50, front: 0.57, cgh: 0.50, torque: 200, idle: 900, redline: 6600, gears: GEARS, rev: 3.3, final: 4.1, eff: 0.88, rw: 0.31, cdA: 0.70, clA: 0.0, muF: 1.00, muR: 1.02, brakeG: 1.0, steerMax: 0.52 } },
  brz:     { name: 'Subaru BRZ TS', price: 12000, model: 'models/brz/scene.gltf', length: 4.27, yaw: 0, lift: 0,
    spec: { mass: 1270, wb: 2.58, front: 0.53, cgh: 0.46, torque: 250, idle: 850, redline: 7400, gears: GEARS, rev: 3.4, final: 4.10, eff: 0.88, rw: 0.325, cdA: 0.66, clA: 0.10, muF: 1.08, muR: 1.10, brakeG: 1.08, steerMax: 0.54 } },
  mustang: { name: 'Ford Mustang GT', price: 45000, model: 'models/mustang/scene.gltf', length: 4.78, yaw: 0, lift: 0,
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
