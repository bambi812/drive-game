// map.js - minimap (bottom-left) + full map (M) + GPS waypoint. Pure 2D canvas, drawn from the shared world data.
import * as W from './world.js';
import { SPEED_TRAPS, DRIFT_ZONES, RACES } from './catalog.js';
const $ = id => document.getElementById(id);
const B = W.BOUNDS, S = 0.25, MW = Math.round((B.x1 - B.x0) * S), MH = Math.round((B.z1 - B.z0) * S);   // base map: 0.25 px per metre

// ---- static base map: terrain colours + roads (rendered once)
const base = document.createElement('canvas'); base.width = MW; base.height = MH;
{
  const g = base.getContext('2d'), im = g.createImageData(MW, MH), d = im.data, R = W.CITY_RECT;
  for (let py = 0; py < MH; py++) for (let px = 0; px < MW; px++) {
    const x = B.x0 + px / S, z = B.z0 + py / S, h = W.terrainH(x, z); let r, gr, b;
    if (h < -0.2) { const k = Math.min(1, -h / 8); r = 120 - 70 * k; gr = 200 - 80 * k; b = 215 - 60 * k; }                     // sea (deeper = darker)
    else if (z > 760 && x < 400 && h < 4.5) { r = 238; gr = 220; b = 160; }                                                 // beach sand
    else if (x > R.x0 - 10 && x < R.x1 + 10 && z > R.z0 - 10 && z < R.z1 + 10) { r = 190; gr = 192; b = 198; }              // city pad
    else { const k = Math.min(1, Math.max(0, h / 200)); r = 120 + 70 * k; gr = 190 - 30 * k; b = 100 + 80 * k; if (h > 110) { r += 20; gr += 10; b += 20; } }
    const o = (py * MW + px) * 4; d[o] = r; d[o + 1] = gr; d[o + 2] = b; d[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); for (let i = 0; i <= W.ROAD.N; i += 3) { const k = i % W.ROAD.N, px = (W.ROAD.X[k] - B.x0) * S, py = (W.ROAD.Z[k] - B.z0) * S; i ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.closePath(); g.strokeStyle = '#2a2d33'; g.lineWidth = 4.2; g.stroke(); g.strokeStyle = '#f4f1e6'; g.lineWidth = 2.2; g.stroke();
}
// ---- points of interest (shared with the 3D world)
const road = (s, lat = 0) => W.roadAt(s, lat);
const zonePts = DRIFT_ZONES.map(z => { const pts = []; for (let s = z.s0; s <= z.s1; s += 12) { const p = road(s); pts.push([p.x, p.z]); } return { name: z.name, pts, x: pts[Math.floor(pts.length / 2)][0], z: pts[Math.floor(pts.length / 2)][1] }; });
const POIS = [
  ...W.GARAGES.map(g => ({ type: 'garage', name: g.name, x: g.zx, z: g.zz })),
  ...RACES.map(r => { const p = road(r.s0); return { type: 'race', name: r.name, x: p.x, z: p.z, color: r.color }; }),
  ...SPEED_TRAPS.map(t => { const p = road(t.s); return { type: 'trap', name: 'Speed trap: ' + t.name, x: p.x, z: p.z }; }),
  ...zonePts.map(z => ({ type: 'drift', name: 'Drift zone: ' + z.name, x: z.x, z: z.z })),
];
export function initMap(api) {          // api: { me():{x,z,yaw}, others():[{name,x,z}], onWaypoint(wp|null), race():{id,k}|null }
  let wp = null, open = false, hits = [];
  const mini = $('minimap'), big = $('bigmap'), wrap = $('mapwrap'), mc = mini && mini.getContext('2d'), bc = big && big.getContext('2d');
  const setWp = w => { wp = w; api.onWaypoint(w); };
  function icons(g, tx, size, labels) {              // draws every point of interest through the transform tx(x,z)->[px,py]
    const u = size; g.lineJoin = 'round';
    g.lineWidth = Math.max(2.5, u * 0.35); g.strokeStyle = '#ff7a1a'; for (const z of zonePts) { g.beginPath(); z.pts.forEach(([x, zz], i) => { const [a, b] = tx(x, zz); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); }
    for (const p of POIS) {
      const [a, b] = tx(p.x, p.z); g.save(); g.translate(a, b); g.fillStyle = '#fff';
      if (p.type === 'garage') { g.fillStyle = '#ffb300'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.fillRect(-u, -u, 2 * u, 2 * u); g.strokeRect(-u, -u, 2 * u, 2 * u); g.fillStyle = '#000'; g.font = `bold ${u * 1.6}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('G', 0, 1); }
      else if (p.type === 'race') { g.fillStyle = p.color; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, u * 1.1, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.font = `bold ${u * 1.5}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('R', 0, 1); }
      else if (p.type === 'trap') { g.fillStyle = '#19c6ff'; g.strokeStyle = '#000'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -u); g.lineTo(u, u); g.lineTo(-u, u); g.closePath(); g.fill(); g.stroke(); }
      g.restore();
      if (labels && (p.type === 'garage' || p.type === 'race')) { g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = '#000c'; g.strokeText(p.name, a, b - u * 1.8); g.fillStyle = '#fff'; g.fillText(p.name, a, b - u * 1.8); }
    }
    for (const o of api.others()) { const [a, b] = tx(o.x, o.z); g.fillStyle = '#3ddc5a'; g.strokeStyle = '#000'; g.lineWidth = 1.2; g.beginPath(); g.arc(a, b, u * 0.8, 0, 7); g.fill(); g.stroke(); if (labels) { g.font = '11px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText(o.name, a, b - u * 1.3); g.fillText(o.name, a, b - u * 1.3); } }
    if (wp) { const [a, b] = tx(wp.x, wp.z); g.fillStyle = '#ff2bd6'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(a, b - u * 1.8); g.lineTo(a + u * 1.2, b); g.lineTo(a, b + u * 1.8); g.lineTo(a - u * 1.2, b); g.closePath(); g.fill(); g.stroke(); }
    const rc = api.race && api.race(); if (rc) { const [a, b] = tx(rc.x, rc.z); g.strokeStyle = '#ffe600'; g.lineWidth = 3; g.beginPath(); g.arc(a, b, u * 1.5, 0, 7); g.stroke(); }
    const me = api.me(), [mx, my] = tx(me.x, me.z); g.save(); g.translate(mx, my); g.rotate(Math.PI - me.yaw); g.fillStyle = '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -u * 1.5); g.lineTo(u * 1.1, u * 1.1); g.lineTo(0, u * 0.5); g.lineTo(-u * 1.1, u * 1.1); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
  function drawMini() {
    if (!mc) return; const me = api.me(), VIEW = 700, k = mini.width / VIEW, sx = (me.x - VIEW / 2 - B.x0) * S, sy = (me.z - VIEW / 2 - B.z0) * S, sw = VIEW * S;
    mc.fillStyle = '#5ab4cf'; mc.fillRect(0, 0, mini.width, mini.height); mc.drawImage(base, sx, sy, sw, sw, 0, 0, mini.width, mini.height);
    icons(mc, (x, z) => [(x - me.x + VIEW / 2) * k, (z - me.z + VIEW / 2) * k], 5, false);
  }
  const bigTx = () => { const k = big.width / (B.x1 - B.x0); return [(x, z) => [(x - B.x0) * k, (z - B.z0) * k], k]; };
  function drawBig() {
    if (!bc || !open) return; const [tx] = bigTx(); bc.drawImage(base, 0, 0, MW, MH, 0, 0, big.width, big.height); icons(bc, tx, 8, true); hits = POIS.map(p => ({ ...p, sp: tx(p.x, p.z) }));
  }
  function sizeBig() { if (!big) return; const w = Math.min(innerWidth * 0.94, innerHeight * 0.88 * MW / MH); big.width = Math.round(w); big.height = Math.round(w * MH / MW); big.style.width = big.width + 'px'; big.style.height = big.height + 'px'; }
  if (big) big.addEventListener('click', e => {                    // click a point of interest (or anywhere) -> GPS waypoint; click the waypoint again to clear it
    const r = big.getBoundingClientRect(), cx = (e.clientX - r.left) * big.width / r.width, cy = (e.clientY - r.top) * big.height / r.height, [tx, k] = bigTx();
    if (wp) { const [a, b] = tx(wp.x, wp.z); if (Math.hypot(cx - a, cy - b) < 16) { setWp(null); return; } }
    let best = null, bd = 18; for (const h of hits) { const d = Math.hypot(cx - h.sp[0], cy - h.sp[1]); if (d < bd) { bd = d; best = h; } }
    if (best) setWp({ x: best.x, z: best.z, name: best.name }); else setWp({ x: B.x0 + cx / k, z: B.z0 + cy / k, name: 'Waypoint' });
  });
  addEventListener('resize', sizeBig);
  return {
    toggle() { open = !open; if (wrap) wrap.style.display = open ? 'flex' : 'none'; if (open) sizeBig(); },
    isOpen: () => open, setWaypoint: setWp, getWaypoint: () => wp, draw() { drawMini(); drawBig(); },
  };
}
