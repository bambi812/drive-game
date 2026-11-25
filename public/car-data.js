// car-data.js - the real cars (glTF models), with physical specs, engine sound profiles and paint/rim material tags.
// Spec units: SI (kg, m, Nm). front = static weight fraction on the front axle. curve = torque fraction at rpm/redline = CURVE_N.
// final = final drive ratio (real values); top speed is whatever drag vs. power allows.
export const CURVE_N = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.0];
// Per-car physics (all tuning lives here). Defaults below apply when a car does not override them:
//  track m (wheel centre spacing) | travel m (suspension stroke) | fHz,rHz ride frequency front/rear (Hz, spring rate follows from the corner mass)
//  zBump,zReb damping ratios (bump / rebound) | arbF,arbR anti-roll bar rate as a fraction of the spring rate (more front = understeer, more rear = oversteer)
//  diff 'open' | 'lsd' | 'locked' (+ lsdK Nm per rad/s, lsdPre preload Nm, lsdMax Nm) | bias = front brake share | hbT = handbrake torque (x m*g*rw, rear wheels only)
//  ie engine inertia kg m2 | wi wheel+tyre+rotor inertia | sig tyre relaxation length m | loadSens = grip lost when the wheel load doubles (0.12 = 12 %)
//  iroll,ipitch,iyaw scale the inertia tensor | eff driveline efficiency | shift gearbox shift time s | upN upshift point (fraction of redline) | final = final drive ratio
const mk = (s, vmax /* = final drive ratio */) => ({ eff: 0.92, rev: 3.4, shift: 0.22, turbo: 0, drive: 'RWD', awdF: 0.4, idle: 850, steerMax: 0.52, brakeG: 1.1, clA: 0.12,
  track: 1.56, travel: 0.2, fHz: 1.7, rHz: 1.85, zBump: 0.3, zReb: 0.55, arbF: 0.55, arbR: 0.3, diff: 'lsd', lsdK: 90, lsdPre: 120, lsdMax: 700, bias: 0.68, hbT: 0.4, ie: 0.22, wi: 1.5, sig: 0.3, loadSens: 0.12, ...s, final: vmax });
const CURVES = {
  boxer24: [0.80, 0.92, 1.0, 1.0, 0.97, 0.93, 0.86], boxer20: [0.76, 0.83, 0.88, 0.92, 0.96, 1.0, 0.96], v8: [0.74, 0.88, 0.96, 1.0, 1.0, 0.96, 0.86], v8sc: [0.82, 0.94, 1.0, 1.0, 0.97, 0.90, 0.80],
  i6t: [0.45, 0.85, 1.0, 1.0, 0.97, 0.88, 0.76], i6tl: [0.40, 0.60, 0.85, 1.0, 1.0, 0.95, 0.82], rotary: [0.50, 0.62, 0.78, 0.95, 1.0, 0.95, 0.80], v8t: [0.55, 0.82, 0.95, 1.0, 1.0, 0.97, 0.90],
  f6t: [0.55, 0.85, 1.0, 1.0, 0.98, 0.90, 0.80], f6na: [0.55, 0.70, 0.82, 0.92, 1.0, 1.0, 0.93],
};
// lamps: [x from the centre line, height above ground] in metres of the right-hand headlight / tail light (mirrored); the depth is found on the body surface.
// paint: regexes on glTF material names (body paint / rim metal). spoiler: where the procedural spoiler sits.
export const CARS = {
  brz24:   { name: 'Subaru BRZ TS (2024)', model: 'models/brz24.glb', width: 1.78, lamps: { head: [0.68, 0.65], tail: [0.62, 0.80] }, length: 4.27, yaw: 0, paint: { body: /Paint_Material1$/, rims: /Wheel1A_3D/, spoiler: { y: 1.12, z: -1.9 } },
    snd: { kind: 'boxer', cyl: 4, rough: 0.55 },
    spec: mk({ vmax: 225, mass: 1280, wb: 2.58, front: 0.53, cgh: 0.46, torque: 250, redline: 7400, curve: CURVES.boxer24, gears: [3.626, 2.188, 1.541, 1.213, 1.0, 0.767], rw: 0.31, cdA: 0.66, muF: 1.14, muR: 1.16, brakeG: 1.12, steerMax: 0.54, track: 1.52, diff: 'lsd' /* Torsen */, shift: 0.18 }, 4.1) },
  brz13:   { name: 'Subaru BRZ (2013)', model: 'models/brz13.glb', width: 1.78, lamps: { head: [0.66, 0.62], tail: [0.66, 0.77] }, length: 4.24, yaw: 0, paint: { body: /^S1M_CarPaint_Max1$/, rims: /^S1M_Rim_Main_Max1$/, spoiler: { y: 1.12, z: -1.9 } },
    snd: { kind: 'boxer', cyl: 4, rough: 0.6 },
    spec: mk({ vmax: 225, mass: 1250, wb: 2.57, front: 0.54, cgh: 0.46, torque: 205, redline: 7400, curve: CURVES.boxer20, gears: [3.626, 2.188, 1.541, 1.213, 1.0, 0.767], rw: 0.31, cdA: 0.66, muF: 1.06, muR: 1.08, brakeG: 1.06, steerMax: 0.54 }, 4.1) },
  mustang: { name: 'Ford Mustang GT (2018)', model: 'models/mustang.glb', width: 1.92, lamps: { head: [0.71, 0.63], tail: [0.62, 0.80] }, length: 4.78, yaw: 0, paint: { body: /PaintTNR_Material$/, rims: /3DWheel2A|^RIM_B$/, spoiler: { y: 1.22, z: -2.15 } },
    snd: { kind: 'v8', cyl: 8, rough: 0.8 },
    spec: mk({ vmax: 250, mass: 1710, wb: 2.72, front: 0.54, cgh: 0.52, torque: 569, redline: 7000, curve: CURVES.v8, gears: [3.66, 2.43, 1.69, 1.32, 1.0, 0.65], rw: 0.345, cdA: 0.78, muF: 1.10, muR: 1.22, brakeG: 1.08, muX: 1.4, shift: 0.22, diff: 'lsd' }, 3.73) },
  m2:      { name: 'BMW M2 Competition (2019)', model: 'models/m2.glb', width: 1.85, lamps: { head: [0.65, 0.67], tail: [0.66, 0.82] }, length: 4.46, yaw: 0, paint: { body: /2018Paint_Material1$/, rims: /3DWheel1A_Material1$/, spoiler: { y: 1.22, z: -2.0 } },
    snd: { kind: 'i6', cyl: 6, rough: 0.35, turbo: 0.55 },
    spec: mk({ vmax: 250, mass: 1600, wb: 2.69, front: 0.52, cgh: 0.50, torque: 550, redline: 7600, curve: CURVES.i6t, turbo: 0.4, shift: 0.12, gears: [4.35, 2.49, 1.67, 1.23, 1.0, 0.83, 0.69], rw: 0.335, cdA: 0.72, muF: 1.16, muR: 1.20, brakeG: 1.15, muX: 1.3 }, 3.46) },
  m4:      { name: 'BMW M4 Competition (2021)', model: 'models/m4.glb', width: 1.89, lamps: { head: [0.68, 0.67], tail: [0.66, 0.88] }, length: 4.79, yaw: 0, paint: { body: /^Material_692$/, rims: /^Material_753$/, spoiler: { y: 1.25, z: -2.15 } },
    snd: { kind: 'i6', cyl: 6, rough: 0.3, turbo: 0.6 },
    spec: mk({ vmax: 290, mass: 1730, wb: 2.85, front: 0.52, cgh: 0.51, torque: 650, redline: 7200, curve: CURVES.i6t, turbo: 0.4, shift: 0.12, gears: [5.0, 3.2, 2.143, 1.72, 1.314, 1.0, 0.822, 0.64], rw: 0.34, cdA: 0.74, clA: 0.2, muF: 1.22, muR: 1.32, brakeG: 1.18, muX: 1.45 }, 3.15) },
  supra20: { name: 'Toyota GR Supra (2020)', model: 'models/supra20.glb', width: 1.85, lamps: { head: [0.67, 0.61], tail: [0.60, 0.75] }, length: 4.38, yaw: 0, paint: { body: /PaintTNR_Material1$/, rims: /Rim84A_Material1$/, spoiler: { y: 1.2, z: -2.0 } },
    snd: { kind: 'i6', cyl: 6, rough: 0.3, turbo: 0.5 },
    spec: mk({ vmax: 250, mass: 1540, wb: 2.47, front: 0.50, cgh: 0.47, torque: 500, redline: 7000, curve: CURVES.i6t, turbo: 0.38, shift: 0.12, gears: [5.25, 3.03, 1.95, 1.46, 1.22, 1.0, 0.81, 0.67], rw: 0.34, cdA: 0.66, muF: 1.20, muR: 1.30, brakeG: 1.15, muX: 1.4 }, 3.15) },
  supra94: { name: 'Toyota Supra Mk IV (1994)', model: 'models/supra94.glb', width: 1.81, lamps: { head: [0.55, 0.62], tail: [0.45, 0.80] }, length: 4.51, yaw: 0, paint: { body: /CAR_PAINT$/, rims: /SUPRA_RIM$/, spoiler: { y: 1.25, z: -2.1 } },
    snd: { kind: 'i6', cyl: 6, rough: 0.5, turbo: 0.8 },
    spec: mk({ vmax: 250, mass: 1500, wb: 2.55, front: 0.53, cgh: 0.49, torque: 440, redline: 6800, curve: CURVES.i6tl, turbo: 0.55, shift: 0.3, gears: [3.827, 2.36, 1.685, 1.312, 1.0, 0.793], rw: 0.325, cdA: 0.72, muF: 1.08, muR: 1.10, brakeG: 1.05, muX: 1.45 }, 3.133) },
  rx7:     { name: 'Mazda RX-7 (FD)', model: 'models/rx7.glb', width: 1.76, lamps: { head: [0.52, 0.56], tail: [0.52, 0.72] }, length: 4.30, yaw: 0, tire: /^Material\.014$/, paint: { body: /^Material\.007$/, rims: /^Material\.011$/, spoiler: { y: 1.15, z: -2.0 } },
    snd: { kind: 'rotary', cyl: 6, rough: 0.9, turbo: 0.6 },
    spec: mk({ vmax: 250, mass: 1280, wb: 2.43, front: 0.50, cgh: 0.45, torque: 314, redline: 8000, curve: CURVES.rotary, turbo: 0.5, shift: 0.3, gears: [3.483, 2.015, 1.391, 1.0, 0.806], rw: 0.31, cdA: 0.64, muF: 1.06, muR: 1.08, brakeG: 1.05, steerMax: 0.55, muX: 1.4, diff: 'lsd' }, 4.1) },
  mclaren: { name: 'McLaren 720S (2017)', model: 'models/mclaren.glb', width: 1.93, lamps: { head: [0.72, 0.57], tail: [0.62, 0.78] }, length: 4.54, yaw: 0, paint: { body: /^body$/, rims: /^rims$/, spoiler: { y: 1.1, z: -2.1 } },
    snd: { kind: 'v8flat', cyl: 8, rough: 0.4, turbo: 0.45 },
    spec: mk({ vmax: 341, mass: 1419, wb: 2.67, front: 0.42, cgh: 0.42, torque: 770, redline: 8200, curve: CURVES.v8t, turbo: 0.35, shift: 0.1, gears: [3.9, 2.59, 1.9, 1.44, 1.15, 0.94, 0.78], rw: 0.345, cdA: 0.62, clA: 0.9, muF: 1.28, muR: 1.34, brakeG: 1.3, muX: 1.45, shift: 0.08 }, 3.2) },
  c4s:     { name: 'Porsche 911 Carrera 4S', model: 'models/c4s.glb', width: 1.85, lamps: { head: [0.60, 0.55], tail: [0.55, 0.80] }, length: 4.53, yaw: 0, paint: { body: /^paint$/, rims: /^__none__$/, spoiler: { y: 1.2, z: -2.1 } },
    snd: { kind: 'flat6', cyl: 6, rough: 0.45, turbo: 0.4 },
    spec: mk({ vmax: 308, mass: 1560, wb: 2.45, front: 0.38, cgh: 0.46, torque: 580, redline: 7500, curve: CURVES.f6t, turbo: 0.3, shift: 0.08, launch: 4300, drive: 'AWD', awdF: 0.36, gears: [3.91, 2.29, 1.65, 1.30, 1.08, 0.88, 0.72, 0.59], rw: 0.34, cdA: 0.66, clA: 0.25, muF: 1.25, muR: 1.30, brakeG: 1.25 }, 3.5) },
  gt3r:    { name: 'Porsche 911 GT3 R (2024)', model: 'models/gt3r.glb', width: 2, lamps: { head: [0.70, 0.61], tail: [0.60, 0.64] }, length: 4.60, yaw: 0, paint: { body: /^EXT_Carpaint_Inst$/, rims: /^EXT_RIM(_\d)?$/, spoiler: { y: 1.3, z: -2.2 } },
    snd: { kind: 'flat6na', cyl: 6, rough: 0.5 },
    spec: mk({ mass: 1290, wb: 2.46, front: 0.38, cgh: 0.43, torque: 470, redline: 9000, curve: CURVES.f6na, shift: 0.07, idle: 1100, gears: [2.9, 2.1, 1.7, 1.42, 1.2, 1.05], rw: 0.33, cdA: 0.95, clA: 2.6, muF: 1.55, muR: 1.62, brakeG: 1.7, steerMax: 0.5 }, 3.8) },
  hellcat: { name: 'Dodge Challenger SRT Hellcat', model: 'models/hellcat.glb', width: 1.92, lamps: { head: [0.70, 0.70], tail: [0.55, 0.90] }, length: 5.02, yaw: 0, paint: { body: /^Body$/, rims: /^Wheel$/, spoiler: { y: 1.3, z: -2.4 } },
    snd: { kind: 'v8sc', cyl: 8, rough: 0.85, whine: 1 },
    spec: mk({ mass: 1990, wb: 2.94, front: 0.55, cgh: 0.54, torque: 881, redline: 6200, curve: CURVES.v8sc, shift: 0.22, gears: [4.71, 3.14, 2.1, 1.67, 1.285, 1.0, 0.839, 0.667], rw: 0.35, cdA: 0.85, muF: 1.12, muR: 1.38, brakeG: 1.05, muX: 1.4, shift: 0.15 }, 2.62) },
};
export const CAR_IDS = Object.keys(CARS), DEFAULT_CAR = 'brz24';



