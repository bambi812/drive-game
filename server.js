// server.js ג€” Express static host + Socket.io multiplayer (Phase 3): players, AI traffic, speed traps, drift zones, leaderboard.
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { ROAD, ROAD_LEN, ROAD_HALF, roadQuery, BOUNDS } from './public/world.js';
import { CARS, SPEED_TRAPS, DRIFT_ZONES } from './public/catalog.js';
import { Traffic } from './traffic.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- storage: JSON file with atomic writes (swap for a DB later by replacing load/save) ----------
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data'), DATA_FILE = path.join(DATA_DIR, 'data.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { lb: { speed: {}, drift: {} } };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }; } catch (e) { /* first run */ }
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { const tmp = DATA_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, DATA_FILE); }, 500); }
process.on('SIGINT', () => { try { fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(db)); fs.renameSync(DATA_FILE + '.tmp', DATA_FILE); } catch (e) { } process.exit(0); });

const app = express();
app.use('/three', express.static(path.join(__dirname, 'node_modules/three')));
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000 });
const PORT = process.env.PORT || 3000;

// ---------- helpers ----------
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>"'`&\\]/g, '').trim().slice(0, n);
const num = (v, lim = 1e5) => (Number.isFinite(v) && Math.abs(v) < lim ? v : null);
const HEX = /^#[0-9a-fA-F]{6}$/;
const cleanCos = c => ({ paint: HEX.test(c?.paint) ? c.paint : '#e53935', finish: ['gloss', 'matte', 'metallic'].includes(c?.finish) ? c.finish : 'gloss', rims: Math.max(0, Math.min(5, c?.rims | 0)), underglow: HEX.test(c?.underglow) ? c.underglow : '', spoiler: Math.max(0, Math.min(3, c?.spoiler | 0)) });
const wrapD = d => { d = ((d % ROAD_LEN) + ROAD_LEN) % ROAD_LEN; return d > ROAD_LEN / 2 ? d - ROAD_LEN : d; };   // signed shortest delta on the loop

// ---------- leaderboard ----------
const top = m => Object.entries(m).map(([name, v]) => ({ name, v })).sort((a, b) => b.v - a.v).slice(0, 10);
const lbPayload = () => ({ speed: top(db.lb.speed), drift: top(db.lb.drift) });
let lbDirty = false;
function lbUpdate(kind, name, v) { v = Math.round(v); if (v > (db.lb[kind][name] || 0)) { db.lb[kind][name] = v; lbDirty = true; save(); return true; } return false; }
setInterval(() => { if (lbDirty) { lbDirty = false; io.emit('lb', lbPayload()); } }, 1000);

// ---------- world state ----------
const players = new Map();
const traffic = new Traffic(30, 7);
let nextId = 1;

io.on('connection', socket => {
  let me = null;
  socket.on('join', (d, ack) => {
    if (me) return;
    const id = nextId++, car = CARS[d?.car] ? d.car : 'rookie';
    me = { id, sid: socket.id, name: clean(d?.name, 16) || 'Guest' + (1000 + id), car, cos: cleanCos(d?.cos), st: null, prev: null, lastMsg: 0, trapAt: {}, dz: null, msgs: 0, msgWin: Date.now() };
    players.set(id, me);
    const list = [...players.values()].filter(p => p.id !== id).map(p => ({ id: p.id, name: p.name, car: p.car, cos: p.cos }));
    socket.emit('welcome', { id, players: list, lb: lbPayload(), traffic: traffic.cars.length });
    socket.broadcast.emit('pjoin', { id, name: me.name, car: me.car, cos: me.cos });
    if (typeof ack === 'function') ack({ id, name: me.name });
  });
  socket.on('car', d => { if (!me) return; if (CARS[d?.car]) me.car = d.car; me.cos = cleanCos(d?.cos); socket.broadcast.emit('pcar', { id: me.id, car: me.car, cos: me.cos }); });
  socket.on('state', s => {
    if (!me || !s) return;
    const now = Date.now(); if (now - me.msgWin > 1000) { me.msgWin = now; me.msgs = 0; } if (++me.msgs > 40) return;   // rate limit
    const x = num(s.x, 5000), y = num(s.y, 1000), z = num(s.z, 5000), yaw = num(s.yaw, 1e4), u = num(s.u, 200), v = num(s.v, 200), r = num(s.r, 50);
    if ([x, y, z, yaw, u, v, r].some(q => q === null)) return;
    me.prev = me.st ? { ...me.st, t: me.lastMsg } : null; me.lastMsg = now;
    me.st = { x: Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, x)), y, z: Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, z)), yaw, u, v, r, p: num(s.p, 3) || 0, rl: num(s.rl, 3) || 0 };
    track(me, now);
  });
  socket.on('disconnect', () => { if (me) { players.delete(me.id); io.emit('pleave', me.id); } });
});

// ---------- per-player road tracking: speed traps + drift zones (computed from server-observed positions, not client claims) ----------
function track(p, now) {
  const st = p.st, q = roadQuery(st.x, st.z, 40);
  if (q.d === Infinity) { p.road = null; p.dz = null; p.prevS = null; return; }
  const s = q.s, lat = q.lat, prevS = p.prevS ?? null; p.prevS = s;
  const tx = ROAD.TX[Math.round(s / ROAD.ds) % ROAD.N], tz = ROAD.TZ[Math.round(s / ROAD.ds) % ROAD.N];
  p.road = { s, lat, vs: (st.u * Math.sin(st.yaw) + st.v * Math.cos(st.yaw)) * tx + (st.u * Math.cos(st.yaw) - st.v * Math.sin(st.yaw)) * tz };
  if (!p.prev || prevS === null) return;
  const dt = (now - p.prev.t) / 1000; if (dt < 0.02 || dt > 0.5) return;
  const mvx = (st.x - p.prev.x) / dt, mvz = (st.z - p.prev.z) / dt, meas = Math.hypot(mvx, mvz);
  if (meas > 130 || Math.abs(st.y - q.y) > 12) { p.dz = null; return; }                       // teleport / airborne-off-road: ignore
  const ds = wrapD(s - prevS); if (Math.abs(ds) > 40) { p.dz = null; return; }
  // speed traps: gate crossing within the road width
  for (const t of SPEED_TRAPS) {
    const a = wrapD(t.s - prevS), crossed = (ds > 0 && a > 0 && a <= ds) || (ds < 0 && a < 0 && a >= ds);
    if (crossed && Math.abs(lat) < ROAD_HALF + 3 && (p.trapAt[t.id] || 0) < now - 3000) {
      p.trapAt[t.id] = now; const kmh = Math.min(Math.hypot(st.u, st.v), meas + 3) * 3.6, best = lbUpdate('speed', p.name, kmh);
      io.to(p.sid).emit('trap', { id: t.id, kmh: Math.round(kmh), best });
    }
  }
  // drift zones: enter at gate s0 (forward), score drift angle*speed until gate s1
  const heading = [Math.sin(st.yaw), Math.cos(st.yaw)];
  for (const z of DRIFT_ZONES) {
    const a0 = wrapD(z.s0 - prevS);
    if (!p.dz && ds > 0 && a0 > 0 && a0 <= ds && Math.abs(lat) < ROAD_HALF + 3) p.dz = { id: z.id, score: 0, lastEmit: 0 };
    if (p.dz && p.dz.id === z.id) {
      if (s < z.s0 - 6 || Math.abs(lat) > 16) { p.dz = null; continue; }
      if (meas > 6) { const ang = Math.acos(Math.max(-1, Math.min(1, (mvx * heading[0] + mvz * heading[1]) / meas))) * 180 / Math.PI;
        if (ang > 8 && ang < 120) p.dz.score += dt * meas * 3.6 * Math.min(ang, 60) / 150; }
      if (now - p.dz.lastEmit > 250) { p.dz.lastEmit = now; io.to(p.sid).emit('driftlive', { id: z.id, score: Math.round(p.dz.score) }); }
      if (s >= z.s1) { const sc = Math.round(p.dz.score); p.dz = null; if (sc > 0) { const best = lbUpdate('drift', p.name, sc); io.to(p.sid).emit('driftdone', { id: z.id, score: sc, best }); } }
    }
  }
}

// ---------- 20 Hz simulation + snapshot ----------
setInterval(() => {
  const obstacles = []; for (const p of players.values()) if (p.road) obstacles.push({ s: p.road.s, lat: p.road.lat, vs: p.road.vs });
  traffic.step(0.05, obstacles);
  if (!players.size) return;
  const ps = []; for (const p of players.values()) if (p.st) { const s = p.st; ps.push([p.id, +s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2), +s.yaw.toFixed(3), +s.u.toFixed(2), +s.v.toFixed(2), +s.r.toFixed(3), +s.p.toFixed(3), +s.rl.toFixed(3)]); }
  io.volatile.emit('snap', { t: Date.now(), p: ps, tr: traffic.snapshot() });
}, 50);

server.listen(PORT, () => console.log(`Drive game running on http://localhost:${PORT}`));

