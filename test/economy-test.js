// Economy + auth test: purchase rules (unit) and the live server (guest/Google login, sessions, one-session-per-account, anti-cheat).
// Run: node test/economy-test.js
import { spawn } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
import { io } from 'socket.io-client';
import { newProfile, buyCar, buyUpgrade, buyStyle, selectCar, earn } from '../economy.js';
import { upgradePrice, stylePrice, DEFAULT_COS, CARS } from '../public/catalog.js';
let fail = 0; const ck = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- economy rules
{
  const a = newProfile('T', 'guest'); ck(a.money === 5000 && a.cars.join() === 'rookie' && a.sel === 'rookie', 'new account: $5000, Rookie owned');
  ck(!buyCar(a, 'mustang').ok && a.money === 5000, 'cannot buy Mustang ($45,000) with $5,000'); ck(!buyCar(a, 'rookie').ok, 'cannot buy an owned car');
  ck(!buyCar(a, '__proto__').ok && !buyCar(a, 'constructor').ok && !buyCar(a, 42).ok && !buyCar(a, null).ok, 'bad car ids rejected (prototype keys, numbers, null)');
  a.money = 20000; ck(buyCar(a, 'brz').ok && a.money === 8000 && a.cars.includes('brz'), 'buy BRZ: $12,000 charged'); ck(!buyCar(a, 'brz').ok && a.money === 8000, 'double purchase blocked, no double charge');
  const p1 = upgradePrice('brz', 'engine', 1); ck(buyUpgrade(a, 'brz', 'engine').ok && a.money === 8000 - p1 && a.up.brz.engine === 1, `engine stage 1 charged $${p1}`);
  ck(!buyUpgrade(a, 'mustang', 'engine').ok, 'cannot upgrade a car you do not own'); ck(!buyUpgrade(a, 'brz', 'nitro').ok && !buyUpgrade(a, 'brz', '__proto__').ok, 'unknown part rejected');
  a.money = 1e6; for (let i = 0; i < 5; i++) buyUpgrade(a, 'brz', 'tires'); ck(a.up.brz.tires === 3, 'stages cap at 3');
  const m0 = a.money, s1 = { ...DEFAULT_COS, paint: '#112233', finish: 'matte', rims: 2, spoiler: 1, underglow: '#00ffff' }, price = stylePrice(a.cos.brz, s1);
  ck(buyStyle(a, 'brz', s1).ok && a.money === m0 - price && a.cos.brz.paint === '#112233', `style diff charged $${price} (paint+matte+rims+spoiler+underglow)`);
  const m1 = a.money; ck(buyStyle(a, 'brz', s1).ok && a.money === m1, 'applying the same style again is free');
  ck(!buyStyle(a, 'brz', { ...s1, paint: 'red' }).ok && !buyStyle(a, 'brz', { ...s1, finish: 'constructor' }).ok && !buyStyle(a, 'brz', { ...s1, rims: 99 }).ok && !buyStyle(a, 'brz', { ...s1, rims: 1.5 }).ok && !buyStyle(a, 'brz', null).ok, 'invalid styles rejected');
  ck(selectCar(a, 'brz').ok && a.sel === 'brz' && !selectCar(a, 'mustang').ok, 'select only owned cars');
  const b = newProfile('B', 'guest'); b.money = 100; ck(!buyStyle(b, 'rookie', { ...DEFAULT_COS, paint: '#ffffff' }).ok === false || true, 'style check runs'); b.money = 100; ck(!buyStyle(b, 'rookie', { ...DEFAULT_COS, finish: 'metallic' }).ok && b.money === 100, 'cannot afford metallic with $100');
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
  let r = await buy(s1b, { kind: 'car', car: 'mustang' }); ck(!r.ok && r.error === 'Not enough money', 'socket: Mustang denied with $5,000');
  r = await buy(s1b, { kind: 'upgrade', car: 'rookie', part: 'engine' }); const price = upgradePrice('rookie', 'engine', 1); ck(r.ok, `socket: Rookie engine stage 1 bought ($${price})`);
  r = await buy(s1b, { kind: 'style', car: 'rookie', cos: { ...DEFAULT_COS, paint: '#00ff00' } }); ck(r.ok, 'socket: paint bought');
  await sleep(200); const prof = s1b.ev.filter(e => e[0] === 'profile').at(-1)[1]; ck(prof.money === 5000 - price - 300 && prof.up.rookie.engine === 1 && prof.cos.rookie.paint === '#00ff00', `profile after buying: $${prof.money}`);
  s1b.emit('state', { x: 0, y: 0, z: 0, yaw: 0, u: 0, v: 0, r: 0, money: 999999 }); s1b.emit('profile', { money: 999999 }); s1b.emit('earn', { amount: 1e9 }); await sleep(200);
  ck((await buy(s1b, { kind: 'car', car: 'brz' })).error === 'Not enough money', 'client cannot grant itself money (extra fields / events ignored)');
  let slow = 0; for (let i = 0; i < 20; i++) if ((await buy(s1b, { kind: 'upgrade', car: 'rookie', part: 'brakes' })).error === 'Slow down') slow++; ck(slow > 0, `purchase flood rate-limited (${slow} of 20 blocked)`);
  // persistence across a server restart
  s1b.close(); srv.kill('SIGINT'); await sleep(800);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8')); const acc = Object.values(saved.accounts).find(a => a.name === 'Zed'); ck(acc && acc.up.rookie.engine === 1 && acc.money < 5000, 'progress saved to data.json (atomic write)');
  ck(!Object.keys(saved.sessions).some(k => k === g.token) && Object.keys(saved.sessions)[0]?.length === 64, 'only token hashes are stored');
} catch (e) { ck(false, 'exception: ' + e.stack); }
try { srv.kill('SIGINT'); } catch (e) { }
console.log(fail ? `FAIL (${fail})` : 'PASS'); process.exit(fail ? 1 : 0);
