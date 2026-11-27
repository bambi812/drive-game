// Race flow test: lobby -> countdown -> GO -> ordered checkpoints -> places/prizes; joining rules, teleport DQ, solo prize, leaving.
// Run: node test/race-test.js   (uses short lobby/countdown timers via env)
import { spawn } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
import { io } from 'socket.io-client';
import { roadAt } from '../public/world.js';
import { RACES, PLACE_PRIZE, SOLO_PRIZE } from '../public/catalog.js';
let fail = 0; const ck = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'race-')), PORT = 3997, URL = 'http://localhost:' + PORT;
const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT, DATA_DIR: dir, RACE_LOBBY_MS: '2500', RACE_COUNT_MS: '1000', RACE_RESULTS_MS: '1500' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.on('data', d => String(d).includes('running') && r()));
const mk = async name => { const r = await (await fetch(URL + '/api/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })).json();
  return new Promise(res => { const s = io(URL, { transports: ['websocket'], auth: { token: r.token } }); s.ev = {}; s.money = 5000; s.name = r.profile.name;
    ['race:joined', 'race:error', 'race:update', 'race:results', 'race:out', 'profile', 'earn'].forEach(e => s.on(e, d => { (s.ev[e] ||= []).push(d); if (e === 'profile') s.money = d.money; })); s.on('welcome', d => { s.id = d.id; s.emit('world:join', { mode: 'public' }, () => res(s)); }); }); };
const at = (s, lat = 0) => roadAt(s, lat);
const send = (c, s, sp = 20, lat = 0) => { const p = at(s, lat); c.emit('state', { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(p.tx, p.tz), u: sp, v: 0, r: 0 }); };
const drive = async (c, s0, s1, speed) => { let s = s0, tl = Date.now(); while (s < s1) { send(c, s, speed); await sleep(50); const tn = Date.now(); s += speed * (tn - tl) / 1000; tl = tn; } send(c, s1, speed); };
const R = RACES.find(r => r.id === 'harbor'), last = a => a[a.length - 1];
const A = await mk('Ann'), B = await mk('Ben'), C = await mk('Cat');
// joining rules
send(A, R.s0 + 300); await sleep(150); A.emit('race:join', 'harbor'); await sleep(200);
ck(A.ev['race:error']?.[0]?.error?.includes('start line'), `cannot join away from the start ("${A.ev['race:error']?.[0]?.error}")`);
A.emit('race:join', 'nope'); await sleep(150); ck(A.ev['race:error']?.length === 2, 'unknown race rejected');
send(A, R.s0 - 8); send(B, R.s0 - 14); send(C, R.s0 - 20); await sleep(150);
A.emit('race:join', 'harbor'); B.emit('race:join', 'harbor'); C.emit('race:join', 'harbor'); await sleep(300);
ck(A.ev['race:joined']?.length === 1 && B.ev['race:joined']?.length === 1, 'A and B joined the lobby'); A.emit('race:join', 'harbor'); await sleep(150); ck(last(A.ev['race:error']).error.includes('Already'), 'cannot join twice');
// lobby -> countdown -> running
await sleep(2300); const states = A.ev['race:update'].map(u => u.state); const order = [...new Set(states)];
ck(order.join() === 'lobby,countdown', `lobby then countdown seen (${order.join(' > ')})`); ck(A.ev['race:update'].find(u => u.state === 'lobby').left > 1000, 'lobby timer reported');
await sleep(1200); ck(last(A.ev['race:update']).state === 'running', 'race is running after the countdown');
// late join refused
const D = await mk('Dan'); send(D, R.s0 - 5); await sleep(150); D.emit('race:join', 'harbor'); await sleep(200); ck(D.ev['race:error']?.[0]?.error.includes('already started'), 'cannot join a race in progress');
// C teleports straight to the last checkpoint -> disqualified; A (70 m/s) and B (55 m/s) drive the real route
const t0 = Date.now(); C.emit('state', { ...(() => { const p = at(R.cps.at(-1)); return { x: p.x, y: p.y, z: p.z, yaw: 0, u: 20, v: 0, r: 0 }; })() });
await Promise.all([drive(A, R.s0 - 8, R.cps.at(-1) + 25, 70), drive(B, R.s0 - 14, R.cps.at(-1) + 25, 55)]); await sleep(900);
const res = A.ev['race:results']?.[0]; ck(!!res, 'results sent after the last finisher');
const byName = n => res.list.find(x => x.name === n);
ck(byName(A.name)?.pos === 1 && byName(B.name)?.pos === 2 && byName(A.name).done && byName(B.name).done, 'A finished 1st, B 2nd (ordered checkpoints)');
ck(byName(C.name)?.dnf && byName(C.name).reason.includes('teleport') && byName(C.name).prize === 0, `teleporting to the finish is disqualified, no prize ("${byName(C.name)?.reason}")`);
ck(byName(A.name).prize === Math.round(R.prize * PLACE_PRIZE[0]) && byName(B.name).prize === Math.round(R.prize * PLACE_PRIZE[1]), `prizes by place: $${byName(A.name).prize} / $${byName(B.name).prize}`);
const paid = (c, a) => c.ev.earn?.some(e => e.reason === 'race' && e.amount === a); ck(paid(A, byName(A.name).prize) && paid(B, byName(B.name).prize) && A.money >= 5000 + byName(A.name).prize, 'race prizes credited on the server (earn events + profile)');
ck(byName(A.name).time < byName(B.name).time && byName(A.name).time > 15000, `finish times plausible (${(byName(A.name).time / 1000).toFixed(1)} s vs ${(byName(B.name).time / 1000).toFixed(1)} s)`);
// rejoin cooldown, then a SOLO race pays 40%
await sleep(300); send(B, R.s0 - 5); await sleep(150); B.emit('race:join', 'harbor'); await sleep(200); ck(last(B.ev['race:error'] || [{ error: '' }]).error.includes('Wait'), 'rejoin cooldown applies (the last finisher cannot rejoin at once)');
const R2 = RACES.find(r => r.id === 'forest'); send(D, R2.s0 - 6); await sleep(150); D.emit('race:join', 'forest'); await sleep(200);
await sleep(4200); D.emit('race:restart'); await sleep(300); D.on('race:restarted', () => { D.restarted = true; }); D.emit('race:restart'); await sleep(200); ck(D.restarted, 'a solo racer can restart the race'); send(D, R2.s0 - 6); await sleep(1300); await drive(D, R2.s0 - 6, R2.cps.at(-1) + 25, 75); await sleep(700);
const r2 = D.ev['race:results']?.[0]; ck(r2?.mine?.time > 0 && r2.mine.best === r2.mine.time && !r2.mine.prevBest, 'results carry the personal best');
ck(r2?.solo && r2.list[0].prize === Math.round(R2.prize * SOLO_PRIZE) && paid(D, r2.list[0].prize), `solo race pays 40% ($${r2?.list[0].prize})`);
// leaving: X before GO -> no race, no prize
await sleep(1800); const E = await mk('Eve'); send(E, R2.s0 - 6); await sleep(150); E.emit('race:join', 'forest'); await sleep(200); E.emit('race:leave'); await sleep(300);
ck(E.ev['race:out']?.length === 1 && !E.ev.earn, 'leaving a lobby with X works');
[A, B, C, D, E].forEach(s => s.close()); srv.kill('SIGINT'); await sleep(500);
console.log(fail ? `FAIL (${fail})` : 'PASS'); process.exit(fail ? 1 : 0);
