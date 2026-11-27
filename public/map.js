// map.js - game-style map: rotating minimap, full map (M) with drag / zoom, and GPS navigation (route + turn-by-turn + voice).
// Pure 2D canvas drawn from the shared world data. Every DOM access is guarded.
import * as W from './world.js';
import { SPEED_TRAPS, DRIFT_ZONES, RACES } from './catalog.js';
import { buildGraph, findRoute, guide, TURN_TEXT } from './nav.js';
const $ = id => document.getElementById(id);
const B = W.BOUNDS, BW = B.x1 - B.x0, BH = B.z1 - B.z0, S = 0.36;          // base picture: px per metre

// ---- static base picture: shaded relief, water, forests, city blocks and roads
function drawBase() {
  const w = Math.round(BW * S), h = Math.round(BH * S), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), im = g.createImageData(w, h), d = im.data;
  const ramp = [[0, 126, 168, 92], [25, 104, 156, 82], [80, 76, 128, 70], [150, 96, 122, 78], [200, 138, 128, 108], [255, 168, 162, 154], [275, 240, 244, 250], [600, 255, 255, 255]];
  const DENSE = ['downtown', 'shopping', 'business', 'casino', 'port', 'food', 'oldtown'];
  const cell = 3, hs = new Float32Array((Math.ceil(w / cell) + 3) * (Math.ceil(h / cell) + 3)), hw = Math.ceil(w / cell) + 3;      // heights on a coarse grid, then blended
  for (let j = 0; j < Math.ceil(h / cell) + 3; j++) for (let i = 0; i < hw; i++) hs[i + j * hw] = W.terrainH(B.x0 + (i * cell) / S, B.z0 + (j * cell) / S);
  let urban = null;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const x = B.x0 + px / S, z = B.z0 + py / S, o = (py * w + px) * 4; let r, gr, b;
    const fx = px / cell, fy = py / cell, i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k0 = i + j * hw;
    const hh = (hs[k0] * (1 - u) + hs[k0 + 1] * u) * (1 - v) + (hs[k0 + hw] * (1 - u) + hs[k0 + hw + 1] * u) * v;
    if (px % 4 === 0) { const d = W.districtAt(x, z); urban = d && DENSE.includes(d.kind); }
    if (hh < -0.15) { const k = Math.min(1, -hh / 7); r = 74 - 48 * k; gr = 168 - 76 * k; b = 214 - 62 * k; }
    else {
      let n = 1; while (n < ramp.length - 1 && ramp[n][0] < hh) n++; const a = ramp[n - 1], c = ramp[n], t = Math.max(0, Math.min(1, (hh - a[0]) / (c[0] - a[0])));
      r = a[1] + (c[1] - a[1]) * t; gr = a[2] + (c[2] - a[2]) * t; b = a[3] + (c[3] - a[3]) * t;
      const north = Math.max(0, Math.min(1, (-z - 2600) / 650)) * Math.max(0, Math.min(1, (3250 - x) / 450)) * Math.max(0, Math.min(1, (hh - 32 - 26 * W.fbm(x / 140, z / 140)) / 26)); r += (238 - r) * north; gr += (243 - gr) * north; b += (250 - b) * north;
      const sandy = W.dryness(x, z);
      if (sandy > 0) { const low = Math.max(0, Math.min(1, (24 - hh) / 14)); r += (214 - 56 * low - r) * sandy; gr += (178 - 86 * low - gr) * sandy; b += (122 - 62 * low - b) * sandy; }
      if (hh < 3.5 && px % 2 === 0 && W.seaward(x, z) > -55) { r = 232; gr = 214; b = 160; }
      if (urban && hh > 1.5) { r = 104; gr = 108; b = 122; }
      const sx = hs[k0 + 1] - hs[k0], sz = hs[k0 + hw] - hs[k0], shade = Math.max(0.55, Math.min(1.35, 1 + (sx + sz) * 0.035));   // light from the south-east
      const lush = Math.max(0, Math.min(1, (x - 2920) / 320)) * (hh > -0.15 ? 0.75 : 0); r += (72 - r) * lush; gr += (138 - gr) * lush; b += (66 - b) * lush;
      const mottle = shade * (0.82 + 0.28 * W.fbm(x / 55, z / 55) + 0.08 * W.fbm(x / 17, z / 17));      // uneven ground, so no area is one flat colour
      r *= mottle; gr *= mottle; b *= mottle;
    }
    d[o] = r; d[o + 1] = gr; d[o + 2] = b; d[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const X = x => (x - B.x0) * S, Z = z => (z - B.z0) * S;
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 24000; n++) { const x = B.x0 + rnd() * BW, z = B.z0 + rnd() * BH, hh = W.terrainH(x, z); if (hh < 2 || hh > 185 || W.dryness(x, z) > 0.25 || W.districtAt(x, z) || W.fbm(x / 120 + 40, z / 120) < 0.46 || W.anyRoadDist(x, z, 16) < 14) continue;
    g.fillStyle = z < -2900 && x < 3100 ? 'rgba(92,122,124,.7)' : 'rgba(28,74,40,.75)'; g.beginPath(); g.arc(X(x), Z(z), 1.3 + rnd() * 1.5, 0, 7); g.fill(); }
  // buildings in every district, malls in purple, the paved arena and airfield
  for (const dist of W.DISTRICTS) { const step = DENSE.includes(dist.kind) ? 32 : 44;
    for (let x = dist.x - dist.rx; x < dist.x + dist.rx; x += step) for (let z = dist.z - dist.rz; z < dist.z + dist.rz; z += step) {
      if (((x - dist.x) / dist.rx) ** 2 + ((z - dist.z) / dist.rz) ** 2 > 1 || W.carve(x, z) > 0.1 || W.anyRoadDist(x, z, 24) < 20 || rnd() < 0.18) continue;
      const v = 150 + (rnd() * 70 | 0), warm = !DENSE.includes(dist.kind); g.fillStyle = warm ? `rgb(${v + 20},${v - 40},${v - 70})` : `rgb(${v},${v + 4},${v + 16})`; g.fillRect(X(x) - 3.5, Z(z) - 3.5, 7, 7); } }
  g.fillStyle = '#8e5bd6'; g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; for (const m of W.MALLS) { g.fillRect(X(m.x - 45), Z(m.z - 55), 90 * S, 46 * S); g.strokeRect(X(m.x - 45), Z(m.z - 55), 90 * S, 46 * S); }
  g.fillStyle = '#5a6072'; g.beginPath(); g.arc(X(W.PLAZA.x), Z(W.PLAZA.z), W.PLAZA.r * S, 0, 7); g.fill();
  const A = W.AIRFIELD; g.fillRect(X(A.x0), Z(A.z0), (A.x1 - A.x0) * S, (A.z1 - A.z0) * S);
  for (const [key, [x, z, r]] of Object.entries(W.ROUNDABOUTS)) { void key; g.fillStyle = '#5d9a4c'; g.beginPath(); g.arc(X(x), Z(z), (r - 7) * S, 0, 7); g.fill(); }
  const mini = document.createElement('canvas'); mini.width = w; mini.height = h; const m = mini.getContext('2d'); m.drawImage(cv, 0, 0);
  m.setTransform(S, 0, 0, S, -B.x0 * S, -B.z0 * S); drawRoads(m, S, 1);
  return { terrain: cv, mini };
}
// road shapes in world coordinates, built once and stroked at any zoom
let paths = null;
function roadPaths() {
  if (paths) return paths; const mk = (lists, closed) => { const p = new Path2D(); for (const pts of lists) { pts.forEach((q, i) => (i ? p.lineTo(q.x, q.z) : p.moveTo(q.x, q.z))); if (closed) p.closePath(); } return p; };
  const main = []; for (let i = 0; i < W.ROAD.N; i += 2) main.push({ x: W.ROAD.X[i], z: W.ROAD.Z[i] });
  const of = (...kinds) => mk(W.SIDE_ROADS.filter((_, i) => kinds.includes(W.SIDE_ROADS.kinds[i])));
  return paths = { main: mk([main], true), bridge: mk(W.BRIDGES.map(b => b.pts)), streets: of('street', 'ring'), highway: of('highway'), climb: of('pass'), strip: of('strip'), track: of('track') };
}
function drawRoads(g, k, wide) {          // g is already in world coordinates, k = pixels per metre
  const P = roadPaths(), px = v => v * wide / k; g.lineJoin = g.lineCap = 'round';
  g.strokeStyle = '#ff7a00'; g.lineWidth = px(14); g.stroke(P.bridge);
  for (const [path, w] of [[P.streets, 7], [P.highway, 8.5], [P.climb, 8], [P.strip, 8.5], [P.track, 9], [P.main, 10]]) { g.strokeStyle = '#141a24'; g.lineWidth = px(w); g.stroke(path); }
  for (const [path, color, w] of [[P.streets, '#f6f4ec', 4], [P.highway, '#ffe08a', 5.4], [P.climb, '#ff9a4d', 5], [P.strip, '#ff6fd0', 5.4], [P.track, '#ff5252', 6], [P.main, '#ffd257', 6.6]]) { g.strokeStyle = color; g.lineWidth = px(w); g.stroke(path); }
}
// ---- points of interest and area names
const at = s => W.roadAt(s);
const zonePts = DRIFT_ZONES.map(z => { const pts = []; for (let s = z.s0; s <= z.s1 + (z.s1 < z.s0 ? W.ROAD_LEN : 0); s += 10) { const p = at(s); pts.push({ x: p.x, z: p.z }); } return { name: z.name, pts }; });
const city = (name, type, x, z) => ({ type, name, x, z });
const ROAD_NAMES = W.SIDE_ROADS.names.map((name, i) => ({ name, pts: W.SIDE_ROADS[i] })).filter((r, i, all) => W.SIDE_ROADS.kinds[i] !== 'ring' && all.findIndex(o => o.name === r.name) === i);
const longest = name => ROAD_NAMES.map(r => r.name).includes(name) ? W.SIDE_ROADS.filter((_, i) => W.SIDE_ROADS.names[i] === name).sort((a, b) => b.length - a.length)[0] : null;
for (const r of ROAD_NAMES) r.pts = longest(r.name);
const mid = name => { const P = longest(name); return P[(P.length / 2) | 0]; };
const SPOT_TYPE = { park: 'fun', stadium: 'fun', golf: 'fun', pier: 'sight', central: 'sight' };
const KIND_TYPE = { food: 'food', casino: 'fun' };
const POIS = [
  ...W.GARAGES.map(g => ({ type: 'garage', name: g.name, x: g.zx, z: g.zz })),
  ...RACES.map(r => { const p = at(r.s0); return { type: 'race', name: r.name, x: p.x, z: p.z, color: r.color }; }),
  ...SPEED_TRAPS.map(t => { const p = at(t.s); return { type: 'trap', name: 'Speed trap: ' + t.name, x: p.x, z: p.z }; }),
  { type: 'sight', name: 'Mountain top lookout', x: W.PADS[0].x, z: W.PADS[0].z },
  ...W.SPOTS.map(s => city(s.name, SPOT_TYPE[s.id] || 'sight', s.x, s.z)),
  ...W.MALLS.map(m => city(m.name, 'shop', m.x, m.z)),
  ...W.DISTRICTS.filter(d => KIND_TYPE[d.kind]).map(d => city(d.name[0] + d.name.slice(1).toLowerCase(), KIND_TYPE[d.kind], d.x, d.z)),
  city('Drift arena', 'fun', W.PLAZA.x, W.PLAZA.z),
  ...['Skyline Run', 'Dragon Pass', 'Glacier Flow', 'East Crest', 'Pine Valley', 'Eagle Ridge', 'Timber Road', 'Glacier Road', 'Summit Climb', 'Quarry Road', 'Mesa Switchbacks', 'Villa Hill', 'Speedway', 'The Strip', 'Sunset Bridge'].map(n => { const p = mid(n); return { type: 'road', name: n, x: p.x, z: p.z }; }),
];
const AREAS = [...W.DISTRICTS.map(d => [d.name, d.x, d.z]), ['RED CANYON', 2200, -420], ['THE PEAKS', -1500, -2050], ['DRAGON PASS', -1180, -3030], ['GREEN HIGHLANDS', 4450, -2300], ['SNOW PEAKS', -1950, -3750], ['MIRROR LAKE', W.LAKE.x, W.LAKE.z], ['PALM ISLAND', -2350, 900], ['SPEEDWAY', 2200, 1760]];
const FIRST = new Set(['DOWNTOWN', 'THE PORT', 'THE STRIP', 'SNOW VILLAGE', 'GREEN HIGHLANDS', 'PALM RESORT', 'SPEEDWAY', 'THE PEAKS', 'MIRROR LAKE', 'DRAGON PASS']);      // names that win a crowded spot
const ICON = { garage: ['#ffb300', '🔧'], race: ['#ff3d81', '🏁'], trap: ['#19c6ff', '📷'], sight: ['#7bd34a', '⭐'], shop: ['#c58bff', '🛍'], food: ['#ff7a59', '🍔'], fuel: ['#ffd23f', '⛽'], fun: ['#4fd1c5', '🎬'], road: ['#ff9a4d', '🛣'] };
const TYPES = [['garage', 'Garages'], ['race', 'Races'], ['road', 'Driving roads'], ['shop', 'Shops'], ['food', 'Food'], ['fuel', 'Fuel'], ['fun', 'Fun'], ['sight', 'Sights'], ['trap', 'Speed traps']];
function pin(g, x, y, r, color, letter) { g.fillStyle = color; g.strokeStyle = '#11141b'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#11141b'; g.font = `800 ${Math.round(r * 1.15)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letter, x, y + 0.5); }
function arrow(g, x, y, angle, size) { g.save(); g.translate(x, y); g.rotate(angle); g.fillStyle = '#35c8ff'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -size); g.lineTo(size * 0.75, size * 0.8); g.lineTo(0, size * 0.4); g.lineTo(-size * 0.75, size * 0.8); g.closePath(); g.fill(); g.stroke(); g.restore(); }
const fmtDist = m => (m >= 950 ? (m / 1000).toFixed(1) + ' km' : Math.max(10, Math.round(m / 10) * 10) + ' m');

export function initMap(api) {          // api: { me():{x,z,yaw,speed}, others():[{name,x,z}], onWaypoint(wp|null), race():{x,z}|null, toast(text) }
  let base = null, graph = null, wp = null, route = null, info = null, open = false, offSince = 0, spoken = '', hover = null, listAt = 0; const hidden = new Set(['trap']);
  const mini = $('minimap'), big = $('bigmap'), wrap = $('mapwrap'), mc = mini && mini.getContext('2d'), bc = big && big.getContext('2d');
  const view = { x: 0, z: 0, k: 0.3 };
  const say = text => { if (!api.voice() || !window.speechSynthesis) return; window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 1.05; window.speechSynthesis.speak(u); };
  const ensure = () => { base ||= drawBase(); graph ||= buildGraph(W); };

  function plan() { const me = api.me(); route = wp ? findRoute(graph, me, wp) : null; offSince = 0; spoken = ''; }
  function setWaypoint(w) { ensure(); wp = w; plan(); if (!wp) { info = null; renderNav(); } api.onWaypoint(wp); if (wp && route) say('Route to ' + wp.name); }

  // ---- navigation banner
  function renderNav() {
    const box = $('nav'); if (!box) return; box.style.display = info && wp ? 'flex' : 'none'; if (!info || !wp) return;
    const set = (id, t) => { const e = $(id); if (e && e.textContent !== t) e.textContent = t; };
    const type = info.next.type === 'arrive' && info.toNext > 220 ? 'straight' : info.next.type;
    set('navicon', type === 'left' ? '↰' : type === 'right' ? '↱' : type === 'uturn' ? '⮌' : type === 'straight' ? '↑' : '⚑');
    set('navmain', `${type === 'straight' ? 'Follow the road' : TURN_TEXT[type]} · ${fmtDist(info.toNext)}`);
    const speed = Math.max(14, api.me().speed || 0), eta = Math.round(info.remaining / speed);
    set('navsub', `${wp.name} · ${fmtDist(info.remaining)} · ${eta >= 60 ? Math.floor(eta / 60) + ' min ' : ''}${eta % 60} s`);
    set('navmute', api.voice() ? '🔊' : '🔇');
  }
  let lastUpdate = 0, miniAt = 0;
  function update(now) {
    if (!wp || now - lastUpdate < 200) return; lastUpdate = now;
    const me = api.me(), end = route ? route.pts[route.pts.length - 1] : wp;          // places off the road: arriving beside them counts
    if (Math.hypot(me.x - wp.x, me.z - wp.z) < 26 || Math.hypot(me.x - end.x, me.z - end.z) < 22) { api.toast('Arrived: ' + wp.name); say('You have arrived'); setWaypoint(null); return; }
    if (!route) { info = null; renderNav(); return; }
    info = guide(route, me.x, me.z);
    if (info.off > 250) { plan(); if (!route) return; info = guide(route, me.x, me.z); }                 // teleported: re-route at once
    if (info.off > 40) { offSince ||= now; if (now - offSince > 1600) { plan(); say('Recalculating'); if (route) info = guide(route, me.x, me.z); } } else offSince = 0;
    const t = info.next, key = `${t.s.toFixed(0)}:${info.toNext < 45 ? 'now' : 'soon'}`;
    if (t.type !== 'arrive' && info.toNext < 170 && key !== spoken) { spoken = key; say(info.toNext < 45 ? TURN_TEXT[t.type] + ' now' : `In ${Math.round(info.toNext / 10) * 10} meters, ${TURN_TEXT[t.type].toLowerCase()}`); }
    renderNav();
  }

  // ---- drawing
  const strokeRoute = (g, project, width) => { if (!route) return; g.lineJoin = g.lineCap = 'round'; for (const [color, w] of [['#ffffff', width + 3], ['#a238ff', width]]) { g.strokeStyle = color; g.lineWidth = w; g.beginPath(); route.pts.forEach((p, i) => { const [a, b] = project(p.x, p.z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); } };
  function drawMini() {
    if (!mc || !base) return; const me = api.me(), size = mini.width, k = size / 420, turn = me.yaw - Math.PI, cos = Math.cos(turn), sin = Math.sin(turn);
    const project = (x, z) => { const dx = (x - me.x) * k, dz = (z - me.z) * k; return [size / 2 + dx * cos - dz * sin, size / 2 + dx * sin + dz * cos]; };   // heading is always up
    mc.fillStyle = '#1a5c92'; mc.fillRect(0, 0, size, size);
    mc.save(); mc.translate(size / 2, size / 2); mc.rotate(turn); mc.scale(k, k); mc.drawImage(base.mini, B.x0 - me.x, B.z0 - me.z, BW, BH); mc.restore();
    strokeRoute(mc, project, 5);
    for (const p of POIS) { if (p.type !== 'garage' && p.type !== 'race' && p.type !== 'fuel') continue; const [a, b] = project(p.x, p.z); if (Math.hypot(a - size / 2, b - size / 2) < size / 2 - 8) pin(mc, a, b, 7, p.color || ICON[p.type][0], ICON[p.type][1]); }
    for (const o of api.others()) { const [a, b] = project(o.x, o.z); pin(mc, a, b, 5, '#3ddc5a', ''); }
    if (wp) { let [a, b] = project(wp.x, wp.z); const dx = a - size / 2, dy = b - size / 2, d = Math.hypot(dx, dy), max = size / 2 - 11; if (d > max) { a = size / 2 + dx / d * max; b = size / 2 + dy / d * max; } pin(mc, a, b, 8, '#a238ff', '⚑'); }   // off-map destinations stick to the rim
    arrow(mc, size / 2, size / 2, 0, 9);
    pin(mc, size / 2 + (size / 2 - 11) * sin, size / 2 - (size / 2 - 11) * cos, 7, '#ffffff', 'N');
  }
  const toScreen = (x, z) => [big.width / 2 + (x - view.x) * view.k, big.height / 2 + (z - view.z) * view.k];
  const toWorld = (px, py) => [view.x + (px - big.width / 2) / view.k, view.z + (py - big.height / 2) / view.k];
  function drawBig() {
    if (!bc || !open || !base) return; const now = performance.now(); bc.setTransform(1, 0, 0, 1, 0, 0); bc.fillStyle = '#10507f'; bc.fillRect(0, 0, big.width, big.height);
    const [x0, y0] = toScreen(B.x0, B.z0); bc.imageSmoothingEnabled = true; bc.imageSmoothingQuality = 'high'; bc.drawImage(base.terrain, x0, y0, BW * view.k, BH * view.k);
    bc.setTransform(view.k, 0, 0, view.k, big.width / 2 - view.x * view.k, big.height / 2 - view.z * view.k); drawRoads(bc, view.k, Math.max(0.75, Math.min(2.4, view.k * 2.2))); bc.setTransform(1, 0, 0, 1, 0, 0);
    bc.lineJoin = bc.lineCap = 'round'; bc.strokeStyle = '#ff3d3dcc'; bc.lineWidth = 3; bc.setLineDash([9, 7]); for (const z of zonePts) { bc.beginPath(); z.pts.forEach((p, i) => { const [a, b] = toScreen(p.x, p.z); i ? bc.lineTo(a, b) : bc.moveTo(a, b); }); bc.stroke(); } bc.setLineDash([]);
    strokeRoute(bc, toScreen, 7);
    if (route) { bc.strokeStyle = '#ffffff'; bc.lineWidth = 2.5; bc.setLineDash([2, 16]); bc.lineDashOffset = -(now / 40) % 18; bc.beginPath(); route.pts.forEach((p, i) => { const [a, b] = toScreen(p.x, p.z); i ? bc.lineTo(a, b) : bc.moveTo(a, b); }); bc.stroke(); bc.setLineDash([]); }
    const label = (text, a, b, px, color = '#fff') => { bc.font = `800 ${px}px sans-serif`; bc.textAlign = 'center'; bc.textBaseline = 'middle'; bc.lineWidth = 4; bc.strokeStyle = '#0b1119d0'; bc.strokeText(text, a, b); bc.fillStyle = color; bc.fillText(text, a, b); };
    if (view.k > 0.42) for (const r of ROAD_NAMES) { const i = (r.pts.length * 0.42) | 0, p = r.pts[i], [a, b] = toScreen(p.x, p.z); let ang = Math.atan2(p.tz, p.tx); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI; bc.save(); bc.translate(a, b); bc.rotate(ang); label(r.name, 0, -11, 11, '#ffe9c4'); bc.restore(); }
    for (const p of POIS) { if (hidden.has(p.type) || p.type === 'road') continue; const inCity = p.type === 'shop' || p.type === 'food' || p.type === 'fuel' || p.type === 'fun'; if (inCity && view.k < 0.3) continue; const [a, b] = toScreen(p.x, p.z), r = view.k > 0.5 ? 12 : 9; pin(bc, a, b, r, p.color || ICON[p.type][0], ICON[p.type][1]); if (view.k > 0.75 || hover?.poi === p) label(p.name, a, b - r - 9, 12); }
    // area names: after the pins, and never on top of a pin or of another name (a name that has no room waits for a closer zoom)
    { const size = view.k > 0.6 ? 19 : view.k > 0.3 ? 14 : 11, taken = [];
      for (const p of POIS) { if (hidden.has(p.type) || p.type === 'road' || (view.k < 0.3 && (p.type === 'shop' || p.type === 'food' || p.type === 'fuel' || p.type === 'fun'))) continue; const [a, b] = toScreen(p.x, p.z), r = view.k > 0.5 ? 12 : 9; taken.push([a - r, b - r, a + r, b + r]); }
      bc.font = `800 ${size}px sans-serif`;
      for (const [text, x, z] of [...AREAS].sort((p, q) => FIRST.has(q[0]) - FIRST.has(p[0]))) { const [a, b] = toScreen(x, z); bc.font = `800 ${size}px sans-serif`; const w = bc.measureText(text).width / 2 + 2, h = size / 2 + 1;
        for (const dy of [0, -size - 3, size + 3, -2 * size - 4, 2 * size + 4]) { const box = [a - w, b + dy - h, a + w, b + dy + h]; if (taken.some(o => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) continue; taken.push(box); label(text, a, b + dy, size); break; } } }
    for (const o of api.others()) { const [a, b] = toScreen(o.x, o.z); pin(bc, a, b, 6, '#3ddc5a', ''); label(o.name, a, b - 14, 11); }
    if (wp) { const [a, b] = toScreen(wp.x, wp.z); pin(bc, a, b, 13, '#a238ff', '⚑'); label(wp.name, a, b + 24, 12, '#e5c8ff'); }
    const rc = api.race && api.race(); if (rc) { const [a, b] = toScreen(rc.x, rc.z); bc.strokeStyle = '#ffe600'; bc.lineWidth = 4; bc.beginPath(); bc.arc(a, b, 14, 0, 7); bc.stroke(); }
    const me = api.me(), [mx, my] = toScreen(me.x, me.z), pulse = (now % 1400) / 1400; bc.strokeStyle = `rgba(53,200,255,${1 - pulse})`; bc.lineWidth = 3; bc.beginPath(); bc.arc(mx, my, 14 + pulse * 22, 0, 7); bc.stroke(); arrow(bc, mx, my, Math.PI - me.yaw, 14);
    // cursor: what is under it and how far it is
    if (hover) { const [hx, hz] = toWorld(hover.px, hover.py), d = Math.hypot(hx - me.x, hz - me.z), text = (hover.poi ? hover.poi.name + ' · ' : '') + fmtDist(d); bc.font = '700 12px sans-serif'; const tw = bc.measureText(text).width + 16; bc.fillStyle = '#0d131de8'; bc.fillRect(hover.px + 14, hover.py + 12, tw, 22); bc.fillStyle = '#fff'; bc.textAlign = 'left'; bc.textBaseline = 'middle'; bc.fillText(text, hover.px + 22, hover.py + 23); }
    // scale bar and north mark
    const step = [100, 200, 500, 1000].find(m => m * view.k >= 70) || 1000, len = step * view.k, sx = big.width - len - 26, sy = big.height - 80;                 // above the bar along the bottom
    bc.strokeStyle = '#0b1119'; bc.lineWidth = 7; bc.beginPath(); bc.moveTo(sx, sy); bc.lineTo(sx + len, sy); bc.stroke(); bc.strokeStyle = '#fff'; bc.lineWidth = 3; bc.stroke(); label(fmtDist(step), sx + len / 2, sy - 14, 12);
    pin(bc, big.width - 34, 34, 15, '#ffffff', 'N');
    if (now - listAt > 700) { listAt = now; for (const el of document.querySelectorAll('#maplist [data-i]')) { const p = POIS[+el.dataset.i], d = el.querySelector('i'); if (d) d.textContent = fmtDist(Math.hypot(p.x - me.x, p.z - me.z)); } }
  }
  // side panel: filter chips and a clickable list of places, nearest first
  function buildList() {
    const box = $('maplist'); if (!box) return; box.textContent = ''; listAt = 0; const me = api.me();
    const legend = document.createElement('div'); legend.className = 'mlegend'; legend.textContent = 'Legend (tap to show or hide)'; box.appendChild(legend);
    const nearest = document.createElement('button'); nearest.type = 'button'; nearest.className = 'mnear'; nearest.textContent = '\uD83D\uDD27 Route to nearest garage'; nearest.onclick = () => { const g = W.GARAGES.map(g => ({ g, d: Math.hypot(g.zx - me.x, g.zz - me.z) })).sort((a, b) => a.d - b.d)[0].g; setWaypoint({ x: g.zx, z: g.zz, name: g.name }); view.x = g.zx; view.z = g.zz; view.k = Math.max(view.k, 0.7); }; box.appendChild(nearest);
    const chips = document.createElement('div'); chips.className = 'mchips';
    for (const [type, title] of TYPES) { const b = document.createElement('button'); b.type = 'button'; b.className = hidden.has(type) ? 'off' : ''; b.textContent = `${ICON[type][1]} ${title}`; b.style.borderColor = ICON[type][0]; b.onclick = () => { hidden.has(type) ? hidden.delete(type) : hidden.add(type); buildList(); }; chips.appendChild(b); }
    box.appendChild(chips); const list = document.createElement('div'); list.className = 'mlist';
    POIS.map((p, i) => ({ p, i, d: Math.hypot(p.x - me.x, p.z - me.z) })).filter(e => !hidden.has(e.p.type)).sort((a, b) => a.d - b.d).forEach(({ p, i }) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.i = i; const icon = document.createElement('em'), name = document.createElement('span'), dist = document.createElement('i'); icon.textContent = ICON[p.type][1]; icon.style.background = p.color || ICON[p.type][0]; name.textContent = p.name; b.append(icon, name, dist);
      b.onclick = () => { setWaypoint({ x: p.x, z: p.z, name: p.name }); view.x = p.x; view.z = p.z; view.k = Math.max(view.k, 0.7); }; list.appendChild(b); });
    box.appendChild(list);
  }
  function sizeBig() { if (!big) return; big.width = innerWidth; big.height = innerHeight; }
  function show(v) { open = v; if (wrap) wrap.style.display = open ? 'block' : 'none'; if (open) { ensure(); sizeBig(); view.k = Math.max(0.08, Math.min(innerWidth / BW, (innerHeight - 64) / BH)); view.x = (B.x0 + B.x1) / 2; view.z = (B.z0 + B.z1) / 2 + 32 / view.k; hover = null; buildList(); } }
  if (big) {
    let drag = null; const fingers = new Map(); let pinch = 0;
    big.addEventListener('pointerdown', e => { fingers.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
    big.addEventListener('pointermove', e => { if (!fingers.has(e.pointerId)) return; fingers.set(e.pointerId, [e.clientX, e.clientY]); if (fingers.size !== 2) return; const [a, b] = [...fingers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) view.k = Math.max(0.08, Math.min(3, view.k * d / pinch)); pinch = d; drag = null; });
    for (const ev of ['pointerup', 'pointercancel']) big.addEventListener(ev, e => { fingers.delete(e.pointerId); pinch = 0; });
    big.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vz: view.z, moved: false }; big.setPointerCapture(e.pointerId); });
    big.addEventListener('pointerleave', () => { hover = null; });
    big.addEventListener('pointermove', e => { { const r = big.getBoundingClientRect(), px = (e.clientX - r.left) * big.width / r.width, py = (e.clientY - r.top) * big.height / r.height; const poi = POIS.find(p => !hidden.has(p.type) && p.type !== 'road' && Math.hypot(...toScreen(p.x, p.z).map((v, i) => v - (i ? py : px))) < 14); hover = { px, py, poi }; } if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 6) drag.moved = true; if (drag.moved) { view.x = Math.max(B.x0, Math.min(B.x1, drag.vx - dx / view.k)); view.z = Math.max(B.z0, Math.min(B.z1, drag.vz - dy / view.k)); } });
    big.addEventListener('pointerup', e => { const d = drag; drag = null; if (!d || d.moved) return;           // a click picks a destination
      const r = big.getBoundingClientRect(), px = (e.clientX - r.left) * big.width / r.width, py = (e.clientY - r.top) * big.height / r.height;
      if (wp) { const [a, b] = toScreen(wp.x, wp.z); if (Math.hypot(px - a, py - b) < 18) { setWaypoint(null); return; } }
      let best = null, bd = 20; for (const p of POIS) { if (hidden.has(p.type)) continue; const [a, b] = toScreen(p.x, p.z), dd = Math.hypot(px - a, py - b); if (dd < bd) { bd = dd; best = p; } }
      const [x, z] = toWorld(px, py); setWaypoint(best ? { x: best.x, z: best.z, name: best.name } : { x, z, name: 'Destination' }); });
    big.addEventListener('wheel', e => { e.preventDefault(); const [x, z] = toWorld(e.clientX, e.clientY), k = Math.max(0.08, Math.min(3, view.k * Math.exp(-e.deltaY * 0.0012))); view.x = x - (e.clientX - big.width / 2) / k; view.z = z - (e.clientY - big.height / 2) / k; view.k = k; }, { passive: false });
  }
  const bind = (id, fn) => { const b = $(id); if (b) { b.onmousedown = e => e.preventDefault(); b.onclick = fn; } };
  bind('mapclose', () => show(false)); bind('mapclear', () => setWaypoint(null)); bind('mapme', () => { const me = api.me(); view.x = me.x; view.z = me.z; view.k = Math.max(view.k, 0.8); });
  bind('navstop', () => setWaypoint(null)); bind('navmute', () => { api.setVoice(!api.voice()); if (!api.voice() && window.speechSynthesis) window.speechSynthesis.cancel(); renderNav(); });
  addEventListener('resize', () => { if (open) sizeBig(); });
  return {
    toggle() { show(!open); }, isOpen: () => open, setWaypoint, getWaypoint: () => wp, getRoute: () => route,
    draw() { ensure(); const now = performance.now(); update(now); if (now - miniAt > 50) { miniAt = now; drawMini(); } drawBig(); },
  };
}
