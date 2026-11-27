// Worlds test: solo / public / friends-by-code are kept apart; limits, codes and reconnects.
// Run: node test/worlds-test.js
import { spawn } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
import { io } from 'socket.io-client';
import { Worlds, PUBLIC_MAX, PRIVATE_MAX, KEEP_EMPTY_MS } from '../worlds.js';
import { roadAt } from '../public/world.js';
let fail = 0; const ck = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- the rules on their own
{
  const W = new Worlds({ send() { }, award() { } }), player = id => ({ id, world: null });
  const many = Array.from({ length: PUBLIC_MAX + 1 }, (_, i) => player(i + 1)); for (const p of many) W.join(p, { mode: 'public' });
  ck(many[0].world === many[PUBLIC_MAX - 1].world && many[PUBLIC_MAX].world !== many[0].world, `a full public world (${PUBLIC_MAX}) opens a second one`);
  ck(W.publicCount() === PUBLIC_MAX + 1, 'public drivers are counted across worlds');
  const host = player(100), made = W.join(host, { mode: 'create' }), code = made.world.code;
  const friends = Array.from({ length: PRIVATE_MAX }, (_, i) => player(101 + i)), results = friends.map(p => W.join(p, { mode: 'code', code: code.toLowerCase() + ' ' }));
  ck(results.slice(0, -1).every(r => r.ok && r.world === made.world) && !results.at(-1).ok && results.at(-1).error.includes('full'), `a friends world takes ${PRIVATE_MAX}, in any letter case`);
  ck(!W.join(player(200), { mode: 'code', code: 'ZZZZZ' }).ok && !W.join(player(201), { mode: 'code', code: 'x' }).ok && !W.join(player(202), { mode: 'nope' }).ok && !W.join(player(203), null).ok, 'unknown code, short code and bad requests are refused');
  const solo = player(300), other = player(301); W.join(solo, { mode: 'solo' }); W.join(other, { mode: 'solo' });
  ck(solo.world !== other.world && solo.world.players.size === 1, 'every solo driver gets a world of their own');
  const id = solo.world.id; W.leave(solo); ck(!W.all.has(id), 'an empty solo world is removed');
  for (const p of [host, ...friends]) W.leave(p, 1000);
  ck(W.join(player(400), { mode: 'code', code }).ok, 'an empty friends world is still there a moment later');
  const w = W.all.get('w:private:' + code); for (const p of [...w.players.values()]) W.leave(p, 1000); W.sweep(1000 + KEEP_EMPTY_MS + 1);
  ck(!W.all.has(w.id) && !W.join(player(401), { mode: 'code', code }).ok, 'and is removed after a while');
  ck(W.join(player(402), { mode: 'code', code, rejoin: true }).ok, 'a reconnecting driver brings their world back');
}

// ---- over real sockets
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worlds-')), PORT = 3996, URL = 'http://localhost:' + PORT;
const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT, DATA_DIR: dir }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.on('data', d => String(d).includes('running') && r()));
const mk = async name => { const r = await (await fetch(URL + '/api/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })).json();
  return new Promise(res => { const s = io(URL, { transports: ['websocket'], auth: { token: r.token } }); s.ev = {}; ['pjoin', 'pleave', 'snap'].forEach(e => s.on(e, d => { (s.ev[e] ||= []).push(d); })); s.on('welcome', d => { s.id = d.id; s.welcome = d; res(s); }); }); };
const join = (s, req) => new Promise(res => s.emit('world:join', req, res));
const send = s => { const p = roadAt(500); s.emit('state', { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(p.tx, p.tz), u: 10, v: 0, r: 0 }); };
const seen = s => (s.ev.snap?.at(-1)?.p || []).map(a => a[0]).sort().join();
const A = await mk('Ann'), B = await mk('Ben'), C = await mk('Cat'), D = await mk('Dan');
send(A); await sleep(200); ck(!A.welcome.players && !A.ev.snap, 'in the lobby nothing about other drivers arrives');
const made = await join(A, { mode: 'create' }); ck(made.ok && /^[A-Z2-9]{5}$/.test(made.code), `a friends world gets a code (${made.code})`);
const b = await join(B, { mode: 'code', code: made.code }); ck(b.ok && b.players.length === 1 && b.players[0].id === A.id, 'a friend joins with the code and sees the host');
const c = await join(C, { mode: 'public' }), d = await join(D, { mode: 'solo' }); ck(c.ok && !c.players.length && d.ok && !d.players.length, 'public and solo drivers see neither of them');
for (let i = 0; i < 5; i++) { [A, B, C, D].forEach(send); await sleep(60); } await sleep(200);
ck(seen(A) === [A.id, B.id].sort().join() && seen(C) === String(C.id) && seen(D) === String(D.id), 'positions stay inside each world');
ck(A.ev.pjoin?.length === 1 && !C.ev.pjoin && !D.ev.pjoin, 'only the same world is told about a new driver');
const moved = await join(B, { mode: 'public' }); await sleep(200);
ck(moved.ok && moved.players[0].id === C.id && A.ev.pleave?.includes(B.id) && C.ev.pjoin?.some(p => p.id === B.id), 'changing world: the old one is told you left, the new one that you came');
const count = await new Promise(res => A.emit('world:info', res)); ck(count.public === 2 && count.online === 4, `lobby counts: ${count.public} public, ${count.online} online`);
const bad = await join(D, { mode: 'code', code: 'ZZZZZ' }); send(D); await sleep(200); ck(!bad.ok && seen(D) === String(D.id), 'a wrong code leaves you where you were');
const gone = B.id; B.close(); await sleep(250); ck(C.ev.pleave?.includes(gone), 'disconnecting leaves the world');   // the socket library forgets .id on close
[A, C, D].forEach(s => s.close()); srv.kill('SIGINT'); await sleep(500);
console.log(fail ? `FAIL (${fail})` : 'PASS'); process.exit(fail ? 1 : 0);
