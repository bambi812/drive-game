// store.js — persistence layer. Two backends, same in-memory db:
//   * default: JSON file at DATA_DIR/data.json, atomic writes (tmp + rename)
//   * remote (Upstash Redis REST): the whole db under one key. Needed on hosts that wipe the disk on restart (Render free).
// Call `await load()` before use. A remote load failure throws, so an empty db can never overwrite saved progress.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
const DAY = 864e5, SESSION_DAYS = 60;
const REMOTE_EVERY = 10000;                          // at most one remote write per 10 s (free-tier command / bandwidth budget)
export class Store {
  constructor(dir, remote = null) {
    this.remote = remote && remote.url && remote.token ? { key: 'drive:db', ...remote } : null;
    if (!this.remote) { fs.mkdirSync(dir, { recursive: true }); this.file = path.join(dir, 'data.json'); }
    this.timer = null; this.writing = Promise.resolve();
    this.db = { accounts: {}, google: {}, sessions: {} };
  }
  async cmd(args) {
    const r = await fetch(this.remote.url, { method: 'POST', headers: { authorization: 'Bearer ' + this.remote.token }, body: JSON.stringify(args), signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error('remote store: ' + (j.error || r.status));
    return j.result;
  }
  async load() {
    if (!this.remote) { try { Object.assign(this.db, JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch (e) { /* first run */ } return this; }
    const raw = await this.cmd(['GET', this.remote.key]);
    if (raw) Object.assign(this.db, JSON.parse(raw));
    return this;
  }
  save() {
    if (!this.remote) { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 400); return; }
    if (!this.timer) this.timer = setTimeout(() => this.flush(), REMOTE_EVERY);      // throttle, not debounce: constant earnings must not starve writes
  }
  flush() {
    clearTimeout(this.timer); this.timer = null;
    if (!this.remote) { const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.db)); fs.renameSync(tmp, this.file); return this.writing; }
    // writes are chained so an older snapshot can never land after a newer one
    this.writing = this.writing.then(() => this.cmd(['SET', this.remote.key, JSON.stringify(this.db)])).then(() => { }, e => { console.error(e.message); this.save(); });
    return this.writing;
  }
  // recovery codes: only the hash is kept; entering the code on another browser signs back into the same account
  setRecovery(a) { const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', code = Array.from(crypto.randomBytes(16), b => abc[b % abc.length]).join('').replace(/(.{4})(?=.)/g, '$1-'); a.recovery = this.hash(code.replace(/-/g, '')); this.save(); return code; }
  byRecovery(code) { const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length !== 16) return null; const h = this.hash(c); return this.all().find(a => a.recovery === h) || null; }
  // accounts
  acc(id) { return this.db.accounts[id] || null; }
  createAccount(profile, googleSub) { const id = crypto.randomBytes(9).toString('hex'); this.db.accounts[id] = { id, ...profile, created: Date.now() }; if (googleSub) this.db.google[googleSub] = id; this.save(); return this.db.accounts[id]; }
  byGoogle(sub) { const id = this.db.google[sub]; return id ? this.acc(id) : null; }
  linkGoogle(a, sub) { this.db.google[sub] = a.id; a.kind = 'google'; this.save(); }          // a guest keeps everything and gains a Google login
  // sessions: only a hash of the token is stored
  hash(t) { return crypto.createHash('sha256').update(String(t)).digest('hex'); }
  createSession(accId, days = SESSION_DAYS) { const token = crypto.randomBytes(32).toString('hex'); this.db.sessions[this.hash(token)] = { acc: accId, exp: Date.now() + days * DAY }; this.save(); return token; }
  sessionAcc(token) {
    if (typeof token !== 'string' || token.length < 32 || token.length > 200) return null;
    const s = this.db.sessions[this.hash(token)]; if (!s) return null;
    if (s.exp < Date.now()) { delete this.db.sessions[this.hash(token)]; return null; }
    if (s.exp - Date.now() < (SESSION_DAYS - 1) * DAY) { s.exp = Date.now() + SESSION_DAYS * DAY; this.save(); }   // sliding: an active player never expires
    return this.acc(s.acc);
  }
  endSession(token) { delete this.db.sessions[this.hash(token)]; this.save(); }
  all() { return Object.values(this.db.accounts); }
}
