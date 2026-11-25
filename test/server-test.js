// Server logic test: traffic AI (standalone) + socket flow (join, snapshots, traps, drift zones, anti-cheat, leaderboard).
// Run: node test/server-test.js
import { spawn } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
import { io } from 'socket.io-client';
import { Traffic } from '../traffic.js';
import * as anticheat from '../anticheat.js';
import { roadAt, ROAD_LEN } from '../public/world.js';
import { SPEED_TRAPS, DRIFT_ZONES } from '../public/catalog.js';
let fail = 0; const ck = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- traffic AI
{
  const T = new Traffic(48, 3); let minGap = 1e9, maxV = 0, bad = false;
  const blocker = { s: 4000, lat: 3.1, vs: 0 };                       // a stopped player sitting in a forward lane
  for (let i = 0; i < 20 * 300; i++) { T.step(0.05, [blocker]);
    for (const c of T.cars) { if (!Number.isFinite(c.s) || !Number.isFinite(c.v)) bad = true; maxV = Math.max(maxV, c.v);
      for (const o of T.cars) if (o !== c && o.dir === c.dir) { const g = ((c.dir * (o.s - c.s)) % ROAD_LEN + ROAD_LEN) % ROAD_LEN; if (g < 100) minGap = Math.min(minGap, g - 4.6); } } }
  const nearBlock = T.cars.filter(c => c.dir > 0 && ((4000 - c.s) % ROAD_LEN + ROAD_LEN) % ROAD_LEN < 60);
  ck(!bad, 'traffic: no NaN over 5 min'); ck(minGap > 0.2, `traffic: cars never overlap (min bumper gap ${minGap.toFixed(1)} m)`);
  ck(maxV <= 25.5, `traffic: top speed ${(maxV * 3.6).toFixed(0)} km/h <= limit`);
  ck(T.cars.every(c => !(c.dir > 0 && c.s > 3999 && c.s < 4001 && c.v > 1)), 'traffic: cars stop for a player in their lane');
}

// ---- anti-cheat rules
{
  const me = { acc: { sel: 'brz24', up: {} } }; let now = 1000, why = null;
  const at = (x, u = 20) => { now += 50; return anticheat.check(me, { x, z: 0, u, v: 0 }, now); };
  for (let i = 0; i < 40; i++) why = why || at(i * 1.5, 30); ck(!why && anticheat.clean(me, now), 'anti-cheat: honest driving passes');
  ck(at(60, 150) === 'claimed speed' && !anticheat.clean(me, now), 'anti-cheat: a speed no car has is rejected and records are blocked');
  me.dirtyUntil = 0; me.hist = []; at(0); ck(at(900) === 'position jump', 'anti-cheat: an unannounced jump is flagged');
  me.dirtyUntil = 0; me.hist = []; at(0); anticheat.teleport(me, now); ck(at(900) === null && !anticheat.clean(me, now), 'anti-cheat: an announced teleport is allowed but earns nothing for a moment');
  ck(!anticheat.teleport(me, now + 100), 'anti-cheat: teleports cannot be spammed');
  me.dirtyUntil = 0; me.hist = []; let x = 0, v = 0, bad = null; for (let i = 0; i < 40; i++) { v = i < 15 ? 5 : 70; x += v * 0.05; bad = bad || at(x, v); } ck(bad === 'acceleration' || bad === 'position jump', `anti-cheat: instant acceleration is flagged (${bad})`);
}

// ---- socket flow
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drv-')), PORT = 3999;
const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT, DATA_DIR: dir, ALLOW_TEST_LOGIN: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.on('data', d => String(d).includes('running') && r()));
const mk = async name => { const r = await (await fetch('http://localhost:' + PORT + '/api/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })).json();
  return new Promise(res => { const s = io('http://localhost:' + PORT, { transports: ['websocket'], auth: { token: r.token } }); s.ev = {}; ['welcome', 'snap', 'trap', 'driftlive', 'driftdone', 'lb', 'pjoin', 'earn', 'profile'].forEach(e => s.on(e, d => { (s.ev[e] ||= []).push(d); })); s.on('welcome', d => { s.me = { id: d.id, name: r.profile.name }; res(s); }); }); };
const A = await mk('<b>Alice</b>'), B = await mk('Bob');
await sleep(300);
ck(A.me.name === 'bAlice/b' || !/[<>]/.test(A.me.name), `names are sanitised ("${A.me.name}")`);
ck(A.ev.welcome?.[0]?.id === A.me.id, 'welcome received'); ck(A.ev.pjoin?.some(p => p.name === 'Bob'), 'A is told about B (name, car, cosmetics)');
// drive A along the road at 40 m/s through the 'beach' trap, sending 20 Hz state
const drive = async (cl, s0, s1, speed, yawOff = 0, lat = 0) => { let s = s0, tl = Date.now(); while (s < s1) { const p = roadAt(s, lat), yaw = Math.atan2(p.tx, p.tz) + yawOff; cl.emit('state', { x: p.x, y: p.y, z: p.z, yaw, u: speed * Math.cos(yawOff), v: -speed * Math.sin(yawOff), r: 0 }); await sleep(50); const tn = Date.now(); s += speed * (tn - tl) / 1000; tl = tn; } };
const trap = SPEED_TRAPS[0]; await drive(A, trap.s - 60, trap.s + 30, 40);
ck(A.ev.trap?.length === 1 && Math.abs(A.ev.trap[0].kmh - 144) < 8, `speed trap measured ${A.ev.trap?.[0]?.kmh} km/h (expected ~144)`);
// cheat: B reports 300 km/h but moves slowly across the same gate
await drive({ emit: (e, d) => B.emit(e, { ...d, u: 83, v: 0 }) }, trap.s - 12, trap.s + 12, 4);
ck(B.ev.trap?.length === 1 && B.ev.trap[0].kmh < 40, `cheated speed capped by measured motion (${B.ev.trap?.[0]?.kmh} km/h, claimed 299)`);
// drift zone: crab sideways (35 deg slip) through hairpin I
const dz = DRIFT_ZONES[0]; await drive(A, dz.s0 - 20, dz.s1 + 20, 18, 0.6);
ck(A.ev.driftlive?.length > 0, 'drift zone: live score updates received'); ck(A.ev.driftdone?.length === 1 && A.ev.driftdone[0].score > 20, `drift zone: finished with score ${A.ev.driftdone?.[0]?.score}`);
// straight driving (no slip) in a zone scores nothing
await drive(B, dz.s0 - 20, dz.s1 + 20, 18, 0);
ck(!(B.ev.driftdone?.length), 'no drift score when driving straight');
await sleep(1300);
const lb = A.ev.lb?.at(-1); ck(lb?.speed?.some(e => e.name === A.me.name) && lb?.drift?.some(e => e.name === A.me.name), 'leaderboard broadcast has both records');
const snap = A.ev.snap?.at(-1); ck(snap?.p?.length === 2 && snap.tr.length === 48, `snapshot: ${snap?.p?.length} players, ${snap?.tr?.length} traffic cars`);
ck(A.ev.snap.length > 15, `snapshots arrive at ~20 Hz (${A.ev.snap.length} in ~10 s window, volatile)`);
A.close(); B.close(); await sleep(600); srv.kill('SIGINT'); await sleep(600);
let saved = null; try { saved = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8')); } catch (e) { }
ck(saved && Object.values(saved.accounts).some(a => a.stats.topSpeed > 100), 'stats persisted to data.json'); const aliceAcc = saved && Object.values(saved.accounts).find(a => a.name === A.me.name); ck(aliceAcc && aliceAcc.money > 5000, 'trap + drift paid Alice (money ' + aliceAcc?.money + ')'); ck(A.ev.earn?.length >= 2, 'earn events received');
console.log(fail ? `FAIL (${fail})` : 'PASS'); process.exit(fail ? 1 : 0);
