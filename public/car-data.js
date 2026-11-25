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
  na4: [0.62, 0.75, 0.86, 0.95, 1.0, 0.97, 0.88], na4hi: [0.55, 0.65, 0.75, 0.86, 0.97, 1.0, 0.92], na6old: [0.75, 0.88, 0.97, 1.0, 0.97, 0.90, 0.80], na6hi: [0.60, 0.72, 0.84, 0.95, 1.0, 0.97, 0.88],
  diesel: [0.70, 1.0, 1.0, 0.97, 0.88, 0.75, 0.60], hybrid: [0.85, 0.95, 1.0, 1.0, 0.98, 0.95, 0.88],
};
const lamp = (hx, hy, tx, ty) => ({ head: [hx, hy], tail: [tx, ty] });
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
  supra94: { name: 'Toyota Supra Mk IV (1994)', model: 'models/supra94.glb', split: /^TOYOTA_SUPRA_TIRE$/, width: 1.81, lamps: { head: [0.55, 0.62], tail: [0.45, 0.80] }, length: 4.51, yaw: 0, paint: { body: /CAR_PAINT$/, rims: /SUPRA_RIM$/, spoiler: { y: 1.25, z: -2.1 } },
    snd: { kind: 'i6', cyl: 6, rough: 0.5, turbo: 0.8 },
    spec: mk({ vmax: 250, mass: 1500, wb: 2.55, front: 0.53, cgh: 0.49, torque: 440, redline: 6800, curve: CURVES.i6tl, turbo: 0.55, shift: 0.3, gears: [3.827, 2.36, 1.685, 1.312, 1.0, 0.793], rw: 0.325, cdA: 0.72, muF: 1.08, muR: 1.10, brakeG: 1.05, muX: 1.45 }, 3.133) },
  rx7:     { name: 'Mazda RX-7 (FD)', model: 'models/rx7.glb', width: 1.76, lamps: { head: [0.52, 0.56], tail: [0.52, 0.72] }, length: 4.30, yaw: 0, tire: /^Material\.011$/, paint: { body: /^Material\.007$/, rims: /^Material\.014$/, spoiler: { y: 1.15, z: -2.0 } },
    snd: { kind: 'rotary', cyl: 6, rough: 0.9, turbo: 0.6 },
    spec: mk({ vmax: 250, mass: 1280, wb: 2.43, front: 0.50, cgh: 0.45, torque: 314, redline: 8000, curve: CURVES.rotary, turbo: 0.5, shift: 0.3, gears: [3.483, 2.015, 1.391, 1.0, 0.806], rw: 0.31, cdA: 0.64, muF: 1.06, muR: 1.08, brakeG: 1.05, steerMax: 0.55, muX: 1.4, diff: 'lsd' }, 4.1) },
  mclaren: { name: 'McLaren 720S (2017)', model: 'models/mclaren.glb', split: /^tyres/, flatPaint: true, noRims: true, width: 1.93, lamps: { head: [0.72, 0.57], tail: [0.62, 0.78] }, length: 4.54, yaw: 0, paint: { body: /^body$/, rims: /^__none__$/, spoiler: { y: 1.1, z: -2.1 } },
    snd: { kind: 'v8flat', cyl: 8, rough: 0.4, turbo: 0.45 },
    spec: mk({ vmax: 341, mass: 1419, wb: 2.67, front: 0.42, cgh: 0.42, torque: 770, redline: 8200, curve: CURVES.v8t, turbo: 0.35, shift: 0.1, gears: [3.9, 2.59, 1.9, 1.44, 1.15, 0.94, 0.78], rw: 0.345, cdA: 0.62, clA: 0.9, muF: 1.28, muR: 1.34, brakeG: 1.3, muX: 1.45, shift: 0.08 }, 3.2) },
  c4s:     { name: 'Porsche 911 Carrera 4S', model: 'models/c4s.glb', split: /^Cylinder00[01]_[012]$/, drop: /^(Plane_0|coat)$/, width: 1.85, lamps: { head: [0.60, 0.55], tail: [0.55, 0.80] }, length: 4.53, yaw: 0, paint: { body: /^paint$/, rims: /^__none__$/, rimPart: /^Cylinder00[01]_0\/silver$/, spoiler: { y: 1.2, z: -2.1 } },
    snd: { kind: 'flat6', cyl: 6, rough: 0.45, turbo: 0.4 },
    spec: mk({ vmax: 308, mass: 1560, wb: 2.45, front: 0.38, cgh: 0.46, torque: 580, redline: 7500, curve: CURVES.f6t, turbo: 0.3, shift: 0.08, launch: 4300, drive: 'AWD', awdF: 0.36, gears: [3.91, 2.29, 1.65, 1.30, 1.08, 0.88, 0.72, 0.59], rw: 0.34, cdA: 0.66, clA: 0.25, muF: 1.25, muR: 1.30, brakeG: 1.25 }, 3.5) },
  gt3r:    { name: 'Porsche 911 GT3 R (2024)', model: 'models/gt3r.glb', width: 2, lamps: { head: [0.70, 0.61], tail: [0.60, 0.64] }, length: 4.60, yaw: 0, paint: { body: /^EXT_Carpaint_Inst$/, rims: /^EXT_RIM(_\d)?$/, spoiler: { y: 1.3, z: -2.2 } },
    snd: { kind: 'flat6na', cyl: 6, rough: 0.5 },
    spec: mk({ mass: 1290, wb: 2.46, front: 0.38, cgh: 0.43, torque: 470, redline: 9000, curve: CURVES.f6na, shift: 0.07, idle: 1100, gears: [2.9, 2.1, 1.7, 1.42, 1.2, 1.05], rw: 0.33, cdA: 0.95, clA: 2.6, muF: 1.55, muR: 1.62, brakeG: 1.7, steerMax: 0.5 }, 3.8) },
  hellcat: { name: 'Dodge Challenger SRT Hellcat', model: 'models/hellcat.glb', width: 1.92, lamps: { head: [0.70, 0.70], tail: [0.55, 0.90] }, length: 5.02, yaw: 0, paint: { body: /^Body$/, rims: /^Wheel$/, spoiler: { y: 1.3, z: -2.4 } },
    snd: { kind: 'v8sc', cyl: 8, rough: 0.85, whine: 1 },
    spec: mk({ mass: 1990, wb: 2.94, front: 0.55, cgh: 0.54, torque: 881, redline: 6200, curve: CURVES.v8sc, shift: 0.22, gears: [4.71, 3.14, 2.1, 1.67, 1.285, 1.0, 0.839, 0.667], rw: 0.35, cdA: 0.85, muF: 1.12, muR: 1.38, brakeG: 1.05, muX: 1.4, shift: 0.15 }, 2.62) },
  // ---- added from the free Sketchfab pack (models cleaned by tools/prep-car: real length, grounded on the tyres, one mesh per wheel)
  mx5:     { name: 'Mazda MX-5 Miata (NA)', model: 'models/mx5.glb', width: 1.68, lamps: lamp(0.58, 0.62, 0.62, 0.74), length: 3.97, yaw: 0, paint: { body: /^Material\.002$/, rims: /^Material\.015$/, spoiler: { y: 1.0, z: -1.75 } },
    snd: { kind: 'i4', cyl: 4, rough: 0.5 },
    spec: mk({ mass: 960, wb: 2.265, front: 0.52, cgh: 0.45, torque: 136, redline: 7200, curve: CURVES.na4, gears: [3.136, 1.888, 1.33, 1.0, 0.814], rw: 0.30, cdA: 0.76, muF: 1.0, muR: 1.02, brakeG: 1.0, steerMax: 0.56, track: 1.41, shift: 0.22, idle: 850 }, 4.3) },
  ae92:    { name: 'Toyota Corolla Levin AE92 GT Apex', model: 'models/ae92.glb', flatPaint: true, width: 1.67, lamps: lamp(0.6, 0.66, 0.62, 0.82), length: 4.24, yaw: 0, paint: { body: /^body$/, rims: /^wheel2$/, spoiler: { y: 1.1, z: -1.95 } },
    snd: { kind: 'i4', cyl: 4, rough: 0.45 },
    spec: mk({ mass: 1000, wb: 2.43, front: 0.62, cgh: 0.48, torque: 147, redline: 7600, curve: CURVES.na4hi, gears: [3.166, 1.904, 1.31, 0.969, 0.815], rw: 0.29, cdA: 0.9, muF: 1.0, muR: 0.98, brakeG: 1.0, drive: 'FWD', diff: 'open', track: 1.43, shift: 0.24 }, 4.312) },
  ae86:    { name: 'Toyota Sprinter Trueno AE86', model: 'models/ae86.glb', width: 1.63, lamps: lamp(0.58, 0.64, 0.6, 0.8), length: 4.18, yaw: 0, paint: { body: /^Primary$/, rims: /^RimMaterial$/, spoiler: { y: 1.12, z: -1.95 } },
    snd: { kind: 'i4', cyl: 4, rough: 0.55 },
    spec: mk({ mass: 940, wb: 2.40, front: 0.53, cgh: 0.48, torque: 149, redline: 7600, curve: CURVES.na4hi, gears: [3.587, 2.022, 1.384, 1.0, 0.861], rw: 0.31, cdA: 0.9, muF: 0.98, muR: 1.0, brakeG: 1.0, steerMax: 0.56, track: 1.35, shift: 0.22 }, 4.3) },
  z280:    { name: 'Datsun 280Z', model: 'models/z280.glb', width: 1.82, lamps: lamp(0.6, 0.66, 0.62, 0.78), length: 4.27, yaw: 0, paint: { body: /^280z_CarPaint$/, rims: /^SSR_Rim$/, spoiler: { y: 1.1, z: -2.0 } },
    snd: { kind: 'i6', cyl: 6, rough: 0.6 },
    spec: mk({ mass: 1290, wb: 2.32, front: 0.53, cgh: 0.5, torque: 220, redline: 6000, curve: CURVES.na6old, gears: [3.321, 2.077, 1.308, 1.0, 0.864], rw: 0.32, cdA: 0.94, muF: 1.0, muR: 1.02, brakeG: 1.0, track: 1.36, shift: 0.26 }, 3.7) },
  c110:    { name: 'Nissan Skyline GT-R (C110 Kenmeri)', model: 'models/c110.glb', width: 1.70, lamps: lamp(0.6, 0.66, 0.58, 0.8), length: 4.46, yaw: Math.PI, paint: { body: /^Paint$/, rims: /^Primary_Color$/, spoiler: { y: 1.15, z: -2.05 } },
    snd: { kind: 'i6', cyl: 6, rough: 0.55 },
    spec: mk({ mass: 1145, wb: 2.61, front: 0.55, cgh: 0.5, torque: 177, redline: 7800, curve: CURVES.na6hi, gears: [2.957, 1.858, 1.311, 1.0, 0.852], rw: 0.33, cdA: 1.02, muF: 0.98, muR: 1.0, brakeG: 1.0, track: 1.37, shift: 0.26 }, 4.444) },
  e30:     { name: 'BMW M3 (E30)', model: 'models/e30.glb', width: 1.68, lamps: lamp(0.6, 0.66, 0.6, 0.8), length: 4.35, yaw: 0, paint: { body: /^BMW_E30_M3_PAINT$/, rims: /^BMW_E30_M3_RIM$/, spoiler: { y: 1.12, z: -2.0 } },
    snd: { kind: 'i4', cyl: 4, rough: 0.4 },
    spec: mk({ mass: 1200, wb: 2.565, front: 0.52, cgh: 0.48, torque: 240, redline: 7250, curve: CURVES.na4, gears: [3.72, 2.40, 1.77, 1.26, 1.0], rw: 0.31, cdA: 0.79, muF: 1.06, muR: 1.08, brakeG: 1.05, track: 1.41, shift: 0.22 }, 3.25) },
  elise:   { name: 'Lotus Elise 111R', model: 'models/elise.glb', width: 1.72, lamps: lamp(0.6, 0.62, 0.58, 0.78), length: 3.79, yaw: Math.PI, paint: { body: /^CAR\.carros$/, rims: /^__none__$/, rimPart: /^wheel_\w\w_\d+\/CAR\.chrome$/, spoiler: { y: 1.05, z: -1.7 } },
    snd: { kind: 'i4', cyl: 4, rough: 0.35 },
    spec: mk({ mass: 860, wb: 2.30, front: 0.38, cgh: 0.42, torque: 205, redline: 8500, curve: CURVES.na4hi, gears: [3.17, 2.05, 1.48, 1.17, 0.92, 0.738], rw: 0.31, cdA: 0.66, muF: 1.12, muR: 1.16, brakeG: 1.1, steerMax: 0.55, track: 1.45, shift: 0.18 }, 4.53) },
  sl300:   { name: 'Mercedes-Benz 300 SL Gullwing', model: 'models/sl300.glb', width: 1.79, lamps: lamp(0.6, 0.7, 0.56, 0.64), length: 4.57, yaw: 0, paint: { body: /^main_color$/, rims: /^mid-chrome$/, spoiler: { y: 1.1, z: -2.1 } },
    snd: { kind: 'i6', cyl: 6, rough: 0.5 },
    spec: mk({ mass: 1295, wb: 2.40, front: 0.5, cgh: 0.5, torque: 230, redline: 6400, curve: CURVES.na6old, gears: [3.34, 1.97, 1.39, 1.0], rw: 0.34, cdA: 0.74, muF: 0.95, muR: 0.97, brakeG: 0.95, track: 1.39, shift: 0.3 }, 3.25) },
  p930:    { name: 'Porsche 911 Turbo (930, 1975)', model: 'models/p930.glb', drop: /^coat$/, width: 1.78, lamps: lamp(0.6, 0.66, 0.6, 0.64), length: 4.29, yaw: 0, paint: { body: /^paint$/, rims: /^930_rim$/, spoiler: { y: 1.15, z: -2.0 } },
    snd: { kind: 'flat6', cyl: 6, rough: 0.55, turbo: 0.7 },
    spec: mk({ mass: 1195, wb: 2.27, front: 0.39, cgh: 0.48, torque: 343, redline: 6800, curve: CURVES.i6tl, turbo: 0.6, lag: 1.2, gears: [3.181, 1.833, 1.261, 0.925], rw: 0.31, cdA: 0.68, muF: 1.02, muR: 1.1, brakeG: 1.02, muX: 1.35, track: 1.45, shift: 0.3 }, 3.444) },
  nsx:     { name: 'Honda NSX (1990)', model: 'models/nsx.glb', width: 1.81, lamps: lamp(0.62, 0.62, 0.62, 0.8), length: 4.43, yaw: 0, paint: { body: /^Material\.003$/, rims: /^Material\.023$/, spoiler: { y: 1.1, z: -2.05 } },
    snd: { kind: 'v6', cyl: 6, rough: 0.35 },
    spec: mk({ mass: 1365, wb: 2.53, front: 0.42, cgh: 0.44, torque: 284, redline: 8000, curve: CURVES.na6hi, gears: [3.066, 1.956, 1.428, 1.125, 0.914], rw: 0.30, cdA: 0.62, muF: 1.08, muR: 1.12, brakeG: 1.06, track: 1.51, shift: 0.2 }, 3.55) },
  r34:     { name: 'Nissan Skyline GT-R V-Spec (R34)', model: 'models/r34.glb', width: 1.79, lamps: lamp(0.62, 0.66, 0.6, 0.86), length: 4.60, yaw: 0, paint: { body: /^Material\.001$/, rims: /^Material\.012$/, spoiler: { y: 1.25, z: -2.1 } },
    snd: { kind: 'i6', cyl: 6, rough: 0.45, turbo: 0.75 },
    spec: mk({ mass: 1560, wb: 2.665, front: 0.55, cgh: 0.48, torque: 392, redline: 8000, curve: CURVES.i6tl, turbo: 0.5, gears: [3.827, 2.36, 1.685, 1.312, 1.0, 0.793], rw: 0.32, cdA: 0.68, clA: 0.25, muF: 1.12, muR: 1.14, brakeG: 1.1, muX: 1.4, drive: 'AWD', awdF: 0.25, track: 1.48, shift: 0.2, vmax: 250 }, 4.111) },
  c991:    { name: 'Porsche 911 Carrera S (991)', model: 'models/c991.glb', noRims: true, width: 1.81, lamps: lamp(0.6, 0.62, 0.6, 0.74), length: 4.49, yaw: 0, paint: { body: /^(waike_t|Left_door_t|Right_door_t)$/, rims: /^__none__$/, spoiler: { y: 1.15, z: -2.1 } },
    snd: { kind: 'flat6na', cyl: 6, rough: 0.45 },
    spec: mk({ mass: 1395, wb: 2.45, front: 0.39, cgh: 0.45, torque: 440, redline: 7800, curve: CURVES.f6na, gears: [3.91, 2.29, 1.65, 1.30, 1.08, 0.88, 0.62], rw: 0.34, cdA: 0.62, clA: 0.2, muF: 1.18, muR: 1.24, brakeG: 1.2, track: 1.54, shift: 0.1 }, 3.44) },
  c7:      { name: 'Chevrolet Corvette Stingray (C7)', model: 'models/c7.glb', width: 1.97, lamps: lamp(0.7, 0.62, 0.66, 0.78), length: 4.49, yaw: 0, paint: { body: /^Car_Paint$/, rims: /^material$/, spoiler: { y: 1.1, z: -2.1 } },
    snd: { kind: 'v8', cyl: 8, rough: 0.75 },
    spec: mk({ mass: 1496, wb: 2.71, front: 0.5, cgh: 0.46, torque: 624, redline: 6600, curve: CURVES.v8, gears: [2.97, 2.07, 1.43, 1.0, 0.71, 0.57, 0.44], rw: 0.35, cdA: 0.88, clA: 0.3, muF: 1.18, muR: 1.28, brakeG: 1.18, muX: 1.4, track: 1.62, shift: 0.2 }, 3.42) },
  gt500:   { name: 'Ford Mustang Shelby GT500 (2020)', model: 'models/gt500.glb', width: 1.92, lamps: lamp(0.7, 0.66, 0.62, 0.86), length: 4.82, yaw: 0, paint: { body: /^carpaint$/, rims: /^__none__$/, rimPart: /^wheel_\w\w_\d+\/(lambert1|glossblack)$/, spoiler: { y: 1.22, z: -2.2 } },
    snd: { kind: 'v8sc', cyl: 8, rough: 0.85, whine: 1 },
    spec: mk({ mass: 1916, wb: 2.72, front: 0.57, cgh: 0.5, torque: 847, redline: 7500, curve: CURVES.v8sc, gears: [3.13, 2.15, 1.58, 1.2, 1.0, 0.81, 0.66], rw: 0.35, cdA: 0.78, clA: 0.35, muF: 1.2, muR: 1.34, brakeG: 1.2, muX: 1.4, track: 1.60, shift: 0.1, vmax: 290 }, 3.73) },
  p1:      { name: 'McLaren P1', model: 'models/p1.glb', width: 1.95, lamps: lamp(0.7, 0.58, 0.62, 0.78), length: 4.59, yaw: 0, paint: { body: /^Carpaint$/, rims: /^material$/, spoiler: { y: 1.1, z: -2.1 } },
    snd: { kind: 'v8flat', cyl: 8, rough: 0.4, turbo: 0.5 },
    spec: mk({ vmax: 350, mass: 1490, wb: 2.67, front: 0.42, cgh: 0.42, torque: 900, redline: 8500, curve: CURVES.hybrid, turbo: 0.2, gears: [3.2, 2.1, 1.6, 1.3, 1.1, 0.9, 0.75], rw: 0.335, cdA: 0.66, clA: 1.4, muF: 1.32, muR: 1.40, brakeG: 1.35, muX: 1.45, track: 1.65, shift: 0.06 }, 3.3) },
  hilux:   { name: 'Toyota Hilux (2022)', model: 'models/hilux.glb', width: 1.86, lamps: lamp(0.66, 0.95, 0.75, 1.0), length: 5.33, yaw: Math.PI, paint: { body: /^primary$/, rims: /^__none__$/, rimPart: /^wheel_\w\w_\d+\/wheel_rf\.0$/, spoiler: { y: 1.6, z: -2.55 } },
    snd: { kind: 'diesel', cyl: 4, rough: 0.9, turbo: 0.6 },
    spec: mk({ vmax: 175, mass: 2100, wb: 3.085, front: 0.58, cgh: 0.75, torque: 500, redline: 4400, idle: 750, curve: CURVES.diesel, turbo: 0.5, gears: [3.6, 2.09, 1.49, 1.0, 0.69, 0.58], rw: 0.38, cdA: 1.35, muF: 0.98, muR: 0.98, brakeG: 0.9, drive: 'AWD', awdF: 0.45, track: 1.54, travel: 0.28, fHz: 1.4, rHz: 1.6, steerMax: 0.6, shift: 0.3 }, 3.909) },
  suburban: { name: 'Chevrolet Suburban (1989)', model: 'models/suburban.glb', solid: true, width: 2.0, lamps: lamp(0.7, 0.9, 0.78, 0.95), length: 5.58, yaw: Math.PI, paint: { body: /paintmetallic1Mtl$/, rims: /^Wheelsdually004wheelsdually004gmc89wheel1Mtl$/, spoiler: { y: 1.95, z: -2.7 } },
    snd: { kind: 'v8', cyl: 8, rough: 0.9 },
    spec: mk({ mass: 2400, wb: 3.32, front: 0.55, cgh: 0.78, torque: 407, redline: 4500, idle: 650, curve: CURVES.v8, gears: [2.48, 1.48, 1.0, 0.75], rw: 0.41, cdA: 2.1, muF: 0.9, muR: 0.92, brakeG: 0.85, track: 1.62, travel: 0.28, fHz: 1.3, rHz: 1.5, steerMax: 0.6, diff: 'open', shift: 0.4 }, 3.73) },
};
export const CAR_IDS = Object.keys(CARS), DEFAULT_CAR = 'brz24';



