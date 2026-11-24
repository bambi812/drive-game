// store.js — persistence layer: JSON file at DATA_DIR/data.json, atomic writes (tmp + rename). Swap this class for a DB later.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
export class Store {
  constructor(dir) {
    fs.mkdirSync(dir, { recursive: true }); this.file = path.join(dir, 'data.json'); this.timer = null;
    this.db = { accounts: {}, google: {}, sessions: {} };
    try { Object.assign(this.db, JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch (e) { /* first run */ }
  }
  save() { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 400); }
  flush() { clearTimeout(this.timer); const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.db)); fs.renameSync(tmp, this.file); }
  // accounts
  acc(id) { return this.db.accounts[id] || null; }
  createAccount(profile, googleSub) { const id = crypto.randomBytes(9).toString('hex'); this.db.accounts[id] = { id, ...profile, created: Date.now() }; if (googleSub) this.db.google[googleSub] = id; this.save(); return this.db.accounts[id]; }
  byGoogle(sub) { const id = this.db.google[sub]; return id ? this.acc(id) : null; }
  // sessions: only a hash of the token is stored
  hash(t) { return crypto.createHash('sha256').update(String(t)).digest('hex'); }
  createSession(accId, days = 60) { const token = crypto.randomBytes(32).toString('hex'); this.db.sessions[this.hash(token)] = { acc: accId, exp: Date.now() + days * 864e5 }; this.save(); return token; }
  sessionAcc(token) { if (typeof token !== 'string' || token.length < 32 || token.length > 200) return null; const s = this.db.sessions[this.hash(token)]; if (!s) return null; if (s.exp < Date.now()) { delete this.db.sessions[this.hash(token)]; return null; } return this.acc(s.acc); }
  endSession(token) { delete this.db.sessions[this.hash(token)]; this.save(); }
  all() { return Object.values(this.db.accounts); }
}
