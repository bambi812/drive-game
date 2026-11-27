// worlds.js - every driver is in at most one world: alone, with friends (by code) or the public one.
// Players, AI traffic and races belong to a world, so nobody outside it sees or affects them.
import { Traffic } from './traffic.js';
import { Races } from './races.js';

const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';           // no 0/O or 1/I: codes are read out loud
export const CODE_LEN = 5, PUBLIC_MAX = 20, PRIVATE_MAX = 12;
export const KEEP_EMPTY_MS = 5 * 60e3;                     // a friends' world outlives a short drop-out (a phone switching apps to send the code)
export const cleanCode = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
const validCode = c => c.length === CODE_LEN && [...c].every(ch => ABC.includes(ch));

export class Worlds {
  constructor(raceHooks, random = Math.random) { this.all = new Map(); this.raceHooks = raceHooks; this.random = random; this.n = 0; }
  make(id, mode, code = '') {
    const w = { id, mode, code, players: new Map(), traffic: new Traffic(48, 7), races: new Races(this.raceHooks), emptyAt: 0 };
    this.all.set(id, w); return w;
  }
  newCode() { for (;;) { let c = ''; for (let i = 0; i < CODE_LEN; i++) c += ABC[Math.floor(this.random() * ABC.length)]; if (!this.all.has('w:private:' + c)) return c; } }
  publicCount() { let n = 0; for (const w of this.all.values()) if (w.mode === 'public') n += w.players.size; return n; }
  // the world a request leads to: { mode: 'solo' | 'public' | 'create' | 'code', code, rejoin }
  find(p, req) {
    const mode = req && req.mode;
    if (mode === 'solo') return { world: this.all.get('w:solo:' + p.id) || this.make('w:solo:' + p.id, 'solo') };
    if (mode === 'public') {
      if (p.world?.mode === 'public') return { world: p.world };
      for (const w of this.all.values()) if (w.mode === 'public' && w.players.size < PUBLIC_MAX) return { world: w };
      return { world: this.make('w:public:' + (++this.n), 'public') };
    }
    if (mode === 'create') { const code = this.newCode(); return { world: this.make('w:private:' + code, 'private', code) }; }
    if (mode === 'code') {
      const code = cleanCode(req.code); if (!validCode(code)) return { error: `A world code has ${CODE_LEN} letters and numbers` };
      let w = this.all.get('w:private:' + code);
      if (!w && req.rejoin) w = this.make('w:private:' + code, 'private', code);        // after a server restart the friends meet again
      if (!w) return { error: 'No world with that code' };
      if (w !== p.world && w.players.size >= PRIVATE_MAX) return { error: 'That world is full' };
      return { world: w };
    }
    return { error: 'Bad request' };
  }
  // moves a player; `left` is the world they came out of (null if they stayed or had none)
  join(p, req, now = Date.now()) {
    const { world, error } = this.find(p, req); if (error) return { ok: false, error };
    if (world === p.world) return { ok: true, world, left: null };
    const left = this.leave(p, now);
    world.players.set(p.id, p); world.emptyAt = 0; p.world = world;
    return { ok: true, world, left };
  }
  leave(p, now = Date.now()) {
    const w = p.world; if (!w) return null;
    w.races.leave(p); w.players.delete(p.id); p.world = null;
    if (!w.players.size) { if (w.mode === 'private') w.emptyAt = now; else this.all.delete(w.id); }
    return w;
  }
  sweep(now = Date.now()) { for (const w of this.all.values()) if (w.emptyAt && now - w.emptyAt >= KEEP_EMPTY_MS) this.all.delete(w.id); }
}
