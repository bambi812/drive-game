// server.js - Express + Socket.io: auth (Google + guest), economy, multiplayer, AI traffic, speed traps, drift zones, leaderboard.
import express from 'express';
import compression from 'compression';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { OAuth2Client } from 'google-auth-library';
import { fileURLToPath } from 'url';
import { ROAD, ROAD_LEN, ROAD_HALF, roadQuery, BOUNDS } from './public/world.js';
import { SPEED_TRAPS, DRIFT_ZONES, DISCOVER, DISCOVER_BONUS, DAILY_BONUS } from './public/catalog.js';
import { Traffic } from './traffic.js';
import { Races } from './races.js';
import { Store } from './store.js';
import { newProfile, publicProfile, buyCar, buyUpgrade, buyStyle, selectCar, earn, trapPay, driftPay, today } from './economy.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = k => (process.env[k] || '').trim().replace(/^["']+|["']+$/g, '');   // values pasted from a .env snippet often keep their quotes
const PORT = process.env.PORT || 3000, GOOGLE_ID = env('GOOGLE_CLIENT_ID');
const store = new Store(process.env.DATA_DIR || path.join(__dirname, 'data'), { url: env('UPSTASH_REDIS_REST_URL'), token: env('UPSTASH_REDIS_REST_TOKEN') });
await store.load();                                                  // throws if the remote store is unreachable: better not to start than to lose saves
console.log('storage: ' + (store.remote ? 'Upstash Redis' : 'local file'));
const shutdown = async () => { try { await store.flush(); } catch (e) { console.error(e.message); } process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ---------- helpers ----------
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>"'`&\\]/g, '').trim().slice(0, n);
const num = (v, lim = 1e5) => (Number.isFinite(v) && Math.abs(v) < lim ? v : null);
const wrapD = d => { d = ((d % ROAD_LEN) + ROAD_LEN) % ROAD_LEN; return d > ROAD_LEN / 2 ? d - ROAD_LEN : d; };   // signed shortest delta on the loop
const hits = new Map();
const limited = (key, max, ms) => { const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < ms); a.push(now); hits.set(key, a); return a.length > max; };
setInterval(() => hits.clear(), 3600e3);

// ---------- Google token verification (server-side, google-auth-library) ----------
const gClient = GOOGLE_ID ? new OAuth2Client(GOOGLE_ID) : null;
async function verifyGoogle(cred) {
  if (process.env.ALLOW_TEST_LOGIN === '1' && typeof cred === 'string' && cred.startsWith('test:')) { const [, sub, name] = cred.split(':'); return { sub: 'test-' + sub, name }; }   // tests only; never set in production
  if (!gClient) throw new Error('Google sign-in is not configured');
  const t = await gClient.verifyIdToken({ idToken: String(cred), audience: GOOGLE_ID }), p = t.getPayload();
  if (!p || !p.sub) throw new Error('Bad token'); return { sub: p.sub, name: p.given_name || p.name || 'Driver' };
}

// ---------- HTTP ----------
const app = express();
app.set('trust proxy', 1);
app.use(compression());                                            // gltf/bin/js compress 3-5x: big win for the 15-19 MB car models
app.use('/three', express.static(path.join(__dirname, 'node_modules/three'), { maxAge: '7d' }));
app.use('/models', express.static(path.join(__dirname, 'public/models'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', express.json({ limit: '8kb' }), (req, res, next) => (limited('ip:' + req.ip, 60, 60e3) ? res.status(429).json({ error: 'Too many requests' }) : next()));
app.get('/api/config', (req, res) => res.json({ googleClientId: GOOGLE_ID, storage: store.remote ? 'database' : 'file' }));
app.get('/api/me', (req, res) => { const a = store.sessionAcc((req.headers.authorization || '').replace(/^Bearer /, '')); a ? res.json({ profile: publicProfile(a) }) : res.status(401).json({ error: 'Session expired' }); });
app.post('/api/guest', (req, res) => {
  if (limited('guest:' + req.ip, 20, 3600e3)) return res.status(429).json({ error: 'Too many new guests from this address' });
  const a = store.createAccount(newProfile(clean(req.body?.name, 16) || 'Guest' + Math.floor(1000 + Math.random() * 9000), 'guest'));
  res.json({ token: store.createSession(a.id), profile: publicProfile(a) });
});
app.post('/api/google', async (req, res) => {
  try {
    const g = await verifyGoogle(req.body?.credential); let a = store.byGoogle(g.sub), linked = false, existing = !!a;
    const old = (req.headers.authorization || '').replace(/^Bearer /, ''), guest = store.sessionAcc(old);   // sent when a guest connects Google
    if (!a && guest && guest.kind === 'guest') { store.linkGoogle(guest, g.sub); a = guest; linked = true; }
    if (!a) a = store.createAccount(newProfile(clean(g.name, 16) || 'Driver', 'google'), g.sub);
    if (guest && guest.id === a.id) store.endSession(old);
    res.json({ token: store.createSession(a.id), profile: publicProfile(a), linked, existing });
  } catch (e) { res.status(401).json({ error: 'Google sign-in failed' }); }
});
app.post('/api/logout', (req, res) => { store.endSession((req.headers.authorization || '').replace(/^Bearer /, '')); res.json({ ok: true }); });
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, maxHttpBufferSize: 1e5 });

// ---------- leaderboard (computed from account stats) ----------
const top = k => store.all().filter(a => a.stats && a.stats[k] > 0).map(a => ({ name: a.name, v: a.stats[k] })).sort((a, b) => b.v - a.v).slice(0, 10);
const lbPayload = () => ({ speed: top('topSpeed'), drift: top('bestDrift') });
let lbDirty = false;
setInterval(() => { if (lbDirty) { lbDirty = false; io.emit('lb', lbPayload()); } }, 1000);

// ---------- world state ----------
const players = new Map(), sockets = new Map();         // sockets: accountId -> socket (one live session per account)
const traffic = new Traffic(48, 7);
let nextId = 1;
const sendProfile = p => io.to(p.sid).emit('profile', publicProfile(p.acc));
const races = new Races({ send: (p, ev, d) => io.to(p.sid).emit(ev, d), award: (p, amount) => reward(p, amount, 'race') });
setInterval(() => races.tick(Date.now()), 200);
setInterval(() => io.emit('races', races.status()), 1000);
function syncPresence(p) { p.car = p.acc.sel; p.cos = p.acc.cos[p.acc.sel]; io.emit('pcar', { id: p.id, car: p.car, cos: p.cos }); }

io.use((socket, next) => { const a = store.sessionAcc(socket.handshake.auth?.token); if (!a) return next(new Error('auth')); socket.acc = a; next(); });
io.on('connection', socket => {
  const acc = socket.acc, old = sockets.get(acc.id);
  if (old && old.id !== socket.id) { old.emit('kicked'); old.disconnect(true); }                 // one session per account
  sockets.set(acc.id, socket);
  const id = nextId++, me = { id, sid: socket.id, acc, name: acc.name, car: acc.sel, cos: acc.cos[acc.sel], st: null, prev: null, lastMsg: 0, trapAt: {}, dz: null, msgs: 0, msgWin: Date.now() };
  players.set(id, me);
  socket.emit('welcome', { id, players: [...players.values()].filter(p => p.id !== id).map(p => ({ id: p.id, name: p.name, car: p.car, cos: p.cos })), lb: lbPayload(), profile: publicProfile(acc) });
  socket.broadcast.emit('pjoin', { id, name: me.name, car: me.car, cos: me.cos });
  if (acc.daily !== today()) { acc.daily = today(); setTimeout(() => reward(me, DAILY_BONUS, 'daily'), 1500); store.save(); }      // first visit of a new day
  socket.on('buy', (d, ack) => {                                                                // buy / upgrade / style / select: server decides everything
    const reply = r => { if (typeof ack === 'function') ack(r); };
    if (limited('buy:' + acc.id, 12, 5000)) return reply({ ok: false, error: 'Slow down' });
    let r; switch (d && d.kind) {
      case 'car': r = buyCar(acc, d.car); break; case 'upgrade': r = buyUpgrade(acc, d.car, d.part); break;
      case 'style': r = buyStyle(acc, d.car, d.cos); break; case 'select': r = selectCar(acc, d.car); break; default: r = { ok: false, error: 'Bad request' }; }
    if (r.ok) { store.save(); syncPresence(me); } sendProfile(me); reply(r);
  });
  socket.on('state', s => {
    if (!s) return;
    const now = Date.now(); if (now - me.msgWin > 1000) { me.msgWin = now; me.msgs = 0; } if (++me.msgs > 40) return;   // rate limit
    const x = num(s.x, 5000), y = num(s.y, 1000), z = num(s.z, 5000), yaw = num(s.yaw, 1e4), u = num(s.u, 200), v = num(s.v, 200), r = num(s.r, 50);
    if ([x, y, z, yaw, u, v, r].some(q => q === null)) return;
    me.prev = me.st ? { ...me.st, t: me.lastMsg } : null; me.lastMsg = now;
    me.st = { x: Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, x)), y, z: Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, z)), yaw, u, v, r, p: num(s.p, 3) || 0, rl: num(s.rl, 3) || 0, rpm: Math.max(0, Math.min(15000, Math.round(num(s.rpm, 20000) || 0))), g: Math.max(-1, Math.min(9, Math.round(num(s.g, 20) || 0))), sw: Math.max(-1, Math.min(1, num(s.sw, 5) || 0)), br: s.br ? 1 : 0, nt: s.nt ? 1 : 0 };
    track(me, now); races.onState(me, now);
  });
  socket.on('race:join', raceId => { const r = races.join(me, String(raceId), Date.now()); socket.emit(r.ok ? 'race:joined' : 'race:error', r.ok ? { id: raceId } : { error: r.error }); });
  socket.on('race:leave', () => { if (races.leave(me)) socket.emit('race:out', { reason: 'You left the race' }); });
  socket.on('disconnect', () => { races.leave(me); players.delete(id); if (sockets.get(acc.id) === socket) sockets.delete(acc.id); io.emit('pleave', id); store.save(); });
});

// ---------- per-player road tracking: speed traps + drift zones (computed from server-observed positions, not client claims) ----------
function reward(p, amount, reason) { const got = earn(p.acc, amount, reason); if (got) { store.save(); io.to(p.sid).emit('earn', { amount: got, reason }); sendProfile(p); } return got; }
function best(p, key, v) { v = Math.round(v); if (v > (p.acc.stats[key] || 0)) { p.acc.stats[key] = v; lbDirty = true; store.save(); return true; } return false; }
// a place counts as discovered only after driving a stretch to reach it (teleporting in does not pay)
function discover(p) {
  const st = p.st, last = p.last; p.last = { x: st.x, z: st.z }; if (!last) return;
  const step = Math.hypot(st.x - last.x, st.z - last.z); p.driven = step > 25 ? 0 : (p.driven || 0) + step; if (p.driven < 150) return;
  p.acc.found = p.acc.found || [];
  for (const a of DISCOVER) if (!p.acc.found.includes(a.id) && Math.hypot(st.x - a.x, st.z - a.z) < a.r) { p.acc.found.push(a.id); store.save(); reward(p, DISCOVER_BONUS, 'discover'); io.to(p.sid).emit('found', { name: a.name, n: p.acc.found.length, of: DISCOVER.length }); }
}
function track(p, now) {
  discover(p);
  const st = p.st, q = roadQuery(st.x, st.z, 40);
  if (q.d === Infinity) { p.road = null; p.dz = null; p.prevS = null; return; }
  const s = q.s, lat = q.lat, prevS = p.prevS ?? null; p.prevS = s;
  const tx = ROAD.TX[Math.round(s / ROAD.ds) % ROAD.N], tz = ROAD.TZ[Math.round(s / ROAD.ds) % ROAD.N];
  p.road = { s, lat, vs: (st.u * Math.sin(st.yaw) + st.v * Math.cos(st.yaw)) * tx + (st.u * Math.cos(st.yaw) - st.v * Math.sin(st.yaw)) * tz };
  if (!p.prev || prevS === null) return;
  const dt = (now - p.prev.t) / 1000; if (dt < 0.02 || dt > 0.5) return;
  const mvx = (st.x - p.prev.x) / dt, mvz = (st.z - p.prev.z) / dt, meas = Math.hypot(mvx, mvz);
  if (meas > 130 || Math.abs(st.y - q.y) > 12) { p.dz = null; return; }                       // teleport / off-road airborne: ignore
  const ds = wrapD(s - prevS); if (Math.abs(ds) > 40) { p.dz = null; return; }
  for (const t of SPEED_TRAPS) {                                                              // speed traps: gate crossing within the road width
    const a = wrapD(t.s - prevS), crossed = (ds > 0 && a > 0 && a <= ds) || (ds < 0 && a < 0 && a >= ds);
    if (crossed && Math.abs(lat) < ROAD_HALF + 3 && (p.trapAt[t.id] || 0) < now - 3000) {
      p.trapAt[t.id] = now; const kmh = Math.min(Math.hypot(st.u, st.v), meas + 3) * 3.6, rec = best(p, 'topSpeed', kmh); p.acc.stats.traps++;
      io.to(p.sid).emit('trap', { id: t.id, kmh: Math.round(kmh), best: rec, pay: reward(p, trapPay(kmh), 'trap') });
    }
  }
  const heading = [Math.sin(st.yaw), Math.cos(st.yaw)];                                       // drift zones: enter at gate s0, score angle*speed until gate s1
  for (const z of DRIFT_ZONES) {
    const a0 = wrapD(z.s0 - prevS);
    if (!p.dz && ds > 0 && a0 > 0 && a0 <= ds && Math.abs(lat) < ROAD_HALF + 3) p.dz = { id: z.id, score: 0, lastEmit: 0 };
    if (p.dz && p.dz.id === z.id) {
      if (s < z.s0 - 6 || Math.abs(lat) > 16) { p.dz = null; continue; }
      if (meas > 6) { const ang = Math.acos(Math.max(-1, Math.min(1, (mvx * heading[0] + mvz * heading[1]) / meas))) * 180 / Math.PI;
        if (ang > 8 && ang < 120) p.dz.score += dt * meas * 3.6 * Math.min(ang, 60) / 150; }
      if (now - p.dz.lastEmit > 250) { p.dz.lastEmit = now; io.to(p.sid).emit('driftlive', { id: z.id, score: Math.round(p.dz.score) }); }
      if (s >= z.s1) { const sc = Math.round(p.dz.score); p.dz = null;
        if (sc > 0) { const rec = best(p, 'bestDrift', sc); p.acc.stats.drifts++; io.to(p.sid).emit('driftdone', { id: z.id, score: sc, best: rec, pay: reward(p, driftPay(sc), 'drift') }); } }
    }
  }
}

// ---------- 20 Hz simulation + snapshot ----------
setInterval(() => {
  const obstacles = []; for (const p of players.values()) if (p.road) obstacles.push({ s: p.road.s, lat: p.road.lat, vs: p.road.vs });
  traffic.step(0.05, obstacles);
  if (!players.size) return;
  const ps = []; for (const p of players.values()) if (p.st) { const s = p.st; ps.push([p.id, +s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2), +s.yaw.toFixed(3), +s.u.toFixed(2), +s.v.toFixed(2), +s.r.toFixed(3), +s.p.toFixed(3), +s.rl.toFixed(3), s.rpm | 0, s.g | 0, +s.sw.toFixed(2), s.br | 0, s.nt | 0]); }
  io.volatile.emit('snap', { t: Date.now(), p: ps, tr: traffic.snapshot() });
}, 50);

server.listen(PORT, () => console.log(`Drive game running on http://localhost:${PORT}`));
