// Economy + auth test: purchase rules (unit) and the live server (guest/Google login, sessions, one-session-per-account, anti-cheat).
// Run: node test/economy-test.js
import { spawn } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http';
import { Store } from '../store.js';
import { io } from 'socket.io-client';
import { newProfile, buyCar, buyUpgrade, buyStyle, selectCar, earn, ensureCars } from '../economy.js';
import { upgradePrice, stylePrice, DEFAULT_COS, CARS } from '../public/catalog.js';
let fail = 0; const ck = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- economy rules
{
  const a = newProfile('T', 'guest'); ck(a.money === 5000 && a.cars.length === 2 && a.sel === 'brz24', `new account: $5000, ${a.cars.length} starter cars, BRZ TS selected`);
  ck(Object.entries(CARS).every(([id, c]) => (c.price === 0) === (id === 'brz24' || id === 'brz13')), 'only the starter cars are free'); ck(!buyCar(a, 'mustang').ok && a.money === 5000, 'a car you cannot afford is refused, no charge'); a.money = CARS.mustang.price + 5; ck(buyCar(a, 'mustang').ok && a.money === 5 && a.cars.includes('mustang') && a.sel === 'mustang', 'buying charges the price and selects the car'); a.money = 5000; selectCar(a, 'brz24'); ck(!selectCar(a, 'mclaren').ok, 'cannot select a car you do not own');
  ck(!buyCar(a, '__proto__').ok && !buyCar(a, 'constructor').ok && !buyCar(a, 42).ok && !buyCar(a, null).ok, 'bad car ids rejected (prototype keys, numbers, null)');
  ck(!buyCar(a, 'brz24').ok && a.money === 5000, 'double purchase blocked'); const old = { name: 'Old', kind: 'guest', money: 777, cars: ['rookie'], up: { rookie: {} }, cos: { rookie: {} }, sel: 'rookie', stats: {} }; ensureCars(old); ck(old.cars.length === Object.keys(CARS).length && !old.up.rookie && old.sel === 'brz24' && old.money === 777, 'old accounts (everything was free) keep every car and their money'); a.money = 20000;
  const p1 = upgradePrice('brz24', 'engine', 1); ck(buyUpgrade(a, 'brz24', 'engine').ok && a.money === 20000 - p1 && a.up.brz24.engine === 1, `engine stage 1 charged $${p1}`);
  ck(!buyUpgrade(a, 'nonexistent', 'engine').ok, 'cannot upgrade an unknown car'); ck(!buyUpgrade(a, 'brz24', 'nitro').ok && !buyUpgrade(a, 'brz24', '__proto__').ok, 'unknown part rejected');
  a.money = 1e6; for (let i = 0; i < 5; i++) buyUpgrade(a, 'brz24', 'tires'); ck(a.up.brz24.tires === 3, 'stages cap at 3');
  const m0 = a.money, s1 = { ...DEFAULT_COS, paint: '#112233', finish: 'matte', rims: 2, spoiler: 1, underglow: '#00ffff' }, price = stylePrice(a.cos.brz24, s1);
  ck(buyStyle(a, 'brz24', s1).ok && a.money === m0 - price && a.cos.brz24.paint === '#112233', `style diff charged $${price} (paint+matte+rims+spoiler+underglow)`);
  const m1 = a.money; ck(buyStyle(a, 'brz24', s1).ok && a.money === m1, 'applying the same style again is free');
  ck(!buyStyle(a, 'brz24', { ...s1, paint: 'red' }).ok && !buyStyle(a, 'brz24', { ...s1, finish: 'constructor' }).ok && !buyStyle(a, 'brz24', { ...s1, rims: 99 }).ok && !buyStyle(a, 'brz24', { ...s1, rims: 1.5 }).ok && !buyStyle(a, 'brz24', null).ok, 'invalid styles rejected');
  a.cars.push('mclaren'); a.cos.mclaren = { ...DEFAULT_COS }; const m2 = a.money; ck(!buyStyle(a, 'mclaren', { ...DEFAULT_COS, rims: 3 }).ok && a.money === m2 && buyStyle(a, 'mclaren', { ...DEFAULT_COS, paint: '#112233' }).ok, 'rim colour is not sold on a car that cannot show it');
  ck(selectCar(a, 'brz24').ok && a.sel === 'brz24' && selectCar(a, 'mustang').ok && !selectCar(a, 'rookie').ok, 'select any owned car, not a removed one');
  const b = newProfile('B', 'guest'); b.money = 100; ck(!buyStyle(b, 'brz24', { ...DEFAULT_COS, finish: 'metallic' }).ok && b.money === 100, 'cannot afford metallic with $100');
  const c = newProfile('C', 'guest'); c.money = 0; const t = 1e6; ck(earn(c, 99999, 'trap', t) === 2500, 'single trap payout capped at $2,500');
  let got = 0; for (let i = 0; i < 10; i++) got += earn(c, 2500, 'drift', t + i * 1000); ck(c.money <= 9000, `60 s earnings window capped at $9,000 (got $${c.money})`);
  ck(earn(c, -50, 'trap', t) === 0 && earn(c, NaN, 'trap', t) === 0 && earn(c, 100, 'hack', t) === 0 && earn(c, 100, '__proto__', t) === 0, 'negative / NaN / unknown reasons earn nothing');
  ck(earn(c, 1000, 'trap', t + 120000) === 1000, 'cap window resets after 60 s');
}

// ---- live server
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-')), PORT = 3998, URL = 'http://localhost:' + PORT;
const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT, DATA_DIR: dir, ALLOW_TEST_LOGIN: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.on('data', d => String(d).includes('running') && r()));
const post = async (p, body, token) => { const r = await fetch(URL + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) }); return { status: r.status, ...(await r.json()) }; };
const conn = (token, ev = {}) => new Promise(res => { const s = io(URL, { transports: ['websocket'], auth: { token }, reconnection: false }); s.ev = []; ['kicked', 'profile'].forEach(e => s.on(e, d => s.ev.push([e, d]))); s.on('welcome', d => { s.welcome = d; res(s); }); s.on('connect_error', e => { s.err = e.message; res(s); }); });
const buy = (s, d) => new Promise(r => s.emit('buy', d, r));
try {
  const g = await post('/api/guest', { name: '<img src=x onerror=alert(1)>' });
  ck(g.token?.length === 64 && g.profile.money === 5000 && !/[<>"']/.test(g.profile.name), `guest account created, name sanitised ("${g.profile.name}")`);
  const me = await (await fetch(URL + '/api/me', { headers: { authorization: 'Bearer ' + g.token } })).json(); ck(me.profile?.money === 5000, 'session token resumes the account');
  ck((await fetch(URL + '/api/me', { headers: { authorization: 'Bearer nope' } })).status === 401, 'bad token rejected (401)');
  const gg = await post('/api/google', { credential: 'garbage' }); ck(gg.status === 401, 'Google login with an invalid credential rejected (401)');
  const g1 = await post('/api/google', { credential: 'test:u1:Zed' }), g2 = await post('/api/google', { credential: 'test:u1:Other' });
  const s1 = await conn(g1.token); ck(s1.welcome?.profile.name === 'Zed', 'Google account created (test-mode verifier)');
  const s1b = await conn(g2.token); await sleep(300); ck(s1.ev.some(e => e[0] === 'kicked') && s1.disconnected, 'second login of the same account kicks the first session (one session per account)');
  ck(s1b.welcome?.profile.name === 'Zed', 'same Google identity maps to the same account');
  const bad = await conn('x'.repeat(64)); ck(bad.err === 'auth', 'socket without a valid token refused');
  // purchases over the socket
  let r = await buy(s1b, { kind: 'car', car: 'mclaren' }); ck(!r.ok && r.error === 'Not enough money', 'socket: cannot buy a car without the money');
  r = await buy(s1b, { kind: 'upgrade', car: 'brz24', part: 'engine' }); const price = upgradePrice('brz24', 'engine', 1); ck(r.ok, `socket: BRZ engine stage 1 bought ($${price})`);
  r = await buy(s1b, { kind: 'style', car: 'brz24', cos: { ...DEFAULT_COS, paint: '#00ff00' } }); ck(r.ok, 'socket: paint bought');
  await sleep(200); const prof = s1b.ev.filter(e => e[0] === 'profile').at(-1)[1]; ck(prof.money === 5000 - price - 300 && prof.up.brz24.engine === 1 && prof.cos.brz24.paint === '#00ff00', `profile after buying: $${prof.money}`);
  s1b.emit('state', { x: 0, y: 0, z: 0, yaw: 0, u: 0, v: 0, r: 0, money: 999999 }); s1b.emit('profile', { money: 999999 }); s1b.emit('earn', { amount: 1e9 }); await sleep(200);
  await sleep(100); { const pf = s1b.ev.filter(e => e[0] === 'profile').at(-1)[1]; ck(pf.money === 5000 - price - 300, 'client cannot grant itself money (extra fields / events ignored)'); }
  let slow = 0; for (let i = 0; i < 20; i++) if ((await buy(s1b, { kind: 'upgrade', car: 'brz24', part: 'brakes' })).error === 'Slow down') slow++; ck(slow > 0, `purchase flood rate-limited (${slow} of 20 blocked)`);
  // persistence across a server restart
  s1b.close(); srv.kill('SIGINT'); await sleep(800);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8')); const acc = Object.values(saved.accounts).find(a => a.name === 'Zed'); ck(acc && acc.up.brz24.engine === 1 && acc.money < 5000, 'progress saved to data.json (atomic write)');
  ck(!Object.keys(saved.sessions).some(k => k === g.token) && Object.keys(saved.sessions)[0]?.length === 64, 'only token hashes are stored');

  // remote storage (a stand-in for the Upstash REST API), guest -> Google linking, and survival of a wiped disk
  const kv = new Map(); let down = false;
  const fake = http.createServer((q, s) => { let b = ''; q.on('data', d => b += d); q.on('end', () => { if (down || q.headers.authorization !== 'Bearer t0k') { s.writeHead(500); return s.end('{"error":"nope"}'); } const [op, k, v] = JSON.parse(b); if (op === 'SET') kv.set(k, v); s.end(JSON.stringify({ result: op === 'SET' ? 'OK' : kv.get(k) ?? null })); }); });
  await new Promise(r => fake.listen(3997, r));
  const remote = { url: 'http://localhost:3997', token: 't0k' };
  const boot = async () => { const p = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT, DATA_DIR: dir, ALLOW_TEST_LOGIN: '1', UPSTASH_REDIS_REST_URL: remote.url, UPSTASH_REDIS_REST_TOKEN: remote.token }, stdio: ['ignore', 'pipe', 'inherit'] }); await new Promise(r => p.stdout.on('data', d => String(d).includes('running') && r())); return p; };
  const meOf = async t => fetch(URL + '/api/me', { headers: { authorization: 'Bearer ' + t } });
  const p1 = await boot();
  const gu = await post('/api/guest', { name: 'Gus' }), s2 = await conn(gu.token); await buy(s2, { kind: 'upgrade', car: 'brz24', part: 'engine' }); s2.close();
  const ln = await post('/api/google', { credential: 'test:link1:Real' }, gu.token);
  ck(ln.linked && ln.profile.kind === 'google' && ln.profile.name === 'Gus' && ln.profile.up.brz24.engine === 1, 'guest connects Google: same save, now a Google account');
  ck((await meOf(gu.token)).status === 401, 'the old guest token stops working after linking');
  const again = await post('/api/google', { credential: 'test:link1:Real' }); ck(again.profile.up.brz24.engine === 1, 'signing in with that Google later loads the guest progress');
  const gu2 = await post('/api/guest', { name: 'Other' }), ex = await post('/api/google', { credential: 'test:link1:Real' }, gu2.token);
  ck(ex.existing && !ex.linked && ex.profile.name === 'Gus' && (await meOf(gu2.token)).status === 200, 'a Google account that already has a save is never overwritten; the guest save is kept');
  await sleep(10600); ck(kv.has('drive:db'), 'remote store written');
  p1.kill('SIGKILL'); await sleep(500); fs.rmSync(dir, { recursive: true, force: true });
  const p2 = await boot();
  ck((await post('/api/google', { credential: 'test:link1:Real' })).profile.up.brz24.engine === 1, 'progress survives a restart with the disk wiped');
  p2.kill('SIGKILL'); await sleep(500);
  down = true; const st = new Store(dir, remote); let threw = false; try { await st.load(); } catch (e) { threw = true; } ck(threw, 'unreachable remote store: load fails instead of starting empty');
  fake.close();
} catch (e) { ck(false, 'exception: ' + e.stack); }
try { srv.kill('SIGINT'); } catch (e) { }
console.log(fail ? `FAIL (${fail})` : 'PASS'); process.exit(fail ? 1 : 0);
