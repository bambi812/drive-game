// races.js - server-managed races: lobby (15 s) -> 3-2-1 countdown -> GO -> ordered checkpoints -> results.
// Everything is validated here from server-observed positions: join near the start, checkpoints in order and within range, teleports disqualify.
import { roadAt, ROAD_LEN } from './public/world.js';
import { RACES, PLACE_PRIZE, SOLO_PRIZE } from './public/catalog.js';
const LOBBY = +process.env.RACE_LOBBY_MS || 15000, COUNT = +process.env.RACE_COUNT_MS || 3000, RESULTS_MS = +process.env.RACE_RESULTS_MS || 10000;
const START_R = 40, CP_R = 30, GO_R = 150, COOLDOWN = 3000;
const wrap = d => ((d % ROAD_LEN) + ROAD_LEN) % ROAD_LEN;
export class Races {
  constructor({ send, award }) {
    this.send = send; this.award = award; this.of = new Map();
    this.r = Object.fromEntries(RACES.map(d => [d.id, { def: d, state: 'idle', members: [], lobbyEnd: 0, goAt: 0, startedAt: 0, resultsEnd: 0, solo: false, finished: 0, sent: false, start: roadAt(d.s0), cps: d.cps.map(s => roadAt(s)) }]));
  }
  status() { return Object.values(this.r).map(r => ({ id: r.def.id, state: r.state, n: r.members.length, left: r.state === 'lobby' ? Math.max(0, r.lobbyEnd - Date.now()) : 0 })); }
  join(p, id, now = Date.now()) {
    const r = this.r[id]; if (!r) return { ok: false, error: 'Unknown race' };
    if (this.of.has(p.id)) return { ok: false, error: 'Already in a race (leave it first)' };
    if (!p.st) return { ok: false, error: 'No position yet' };
    if (r.state !== 'idle' && r.state !== 'lobby') return { ok: false, error: r.state === 'results' ? 'Race just finished - try again shortly' : 'Race already started' };
    if (Math.hypot(p.st.x - r.start.x, p.st.z - r.start.z) > START_R) return { ok: false, error: 'Drive to the start line first' };
    if ((p.raceCool?.[id] || 0) > now) return { ok: false, error: 'Wait a few seconds before racing again' };
    if (r.state === 'idle') { r.state = 'lobby'; r.lobbyEnd = now + LOBBY; r.members = []; }
    r.members.push({ p, k: 0, done: false, dnf: false, time: 0, place: 0, prize: 0, reason: '', remaining: 1e9 }); this.of.set(p.id, r);
    return { ok: true };
  }
  leave(p, reason = 'Left the race') {
    const r = this.of.get(p.id); if (!r) return false; const m = r.members.find(x => x.p === p); this.of.delete(p.id);
    if (r.state === 'lobby' || r.state === 'countdown') { r.members = r.members.filter(x => x !== m); if (!r.members.length) this.reset(r); }
    else if (m && !m.done) { m.dnf = true; m.reason = reason; }
    p.raceCool = { ...(p.raceCool || {}), [r.def.id]: Date.now() + COOLDOWN }; return true;
  }
  // a solo racer can start over without leaving: back to the countdown (the client puts the car on the start line)
  restart(p, now = Date.now()) {
    const r = this.of.get(p.id); if (!r || (r.state !== 'running' && r.state !== 'countdown')) return { ok: false, error: 'No race to restart' };
    if (r.members.length !== 1) return { ok: false, error: 'Only a solo race can restart' };
    const m = r.members[0]; Object.assign(m, { k: 0, done: false, dnf: false, time: 0, reason: '', remaining: 1e9 }); p.prev = null; r.state = 'countdown'; r.goAt = now + COUNT; r.finished = 0;
    return { ok: true, id: r.def.id };
  }
  reset(r) { r.members.forEach(m => this.of.delete(m.p.id)); r.state = 'idle'; r.members = []; r.finished = 0; r.sent = false; }
  // called for every position update of a player
  onState(p, now) {
    const r = this.of.get(p.id); if (!r || r.state !== 'running') return; const m = r.members.find(x => x.p === p); if (!m || m.done || m.dnf) return; const st = p.st;
    if (p.prev) { const dt = Math.max((now - p.prev.t) / 1000, 0.05), jump = Math.hypot(st.x - p.prev.x, st.z - p.prev.z); if (jump > 100 * dt + 25) { m.dnf = true; m.reason = 'Disqualified (teleport)'; this.of.delete(p.id); return; } }
    const cp = r.cps[m.k];
    if (Math.hypot(st.x - cp.x, st.z - cp.z) < CP_R && Math.abs(st.y - cp.y) < 15) { m.k++; if (m.k >= r.def.cps.length) this.finish(r, m, now); }
    if (!m.done && p.road) m.remaining = wrap(r.def.cps[m.k] - p.road.s);
  }
  finish(r, m, now) {
    m.done = true; m.time = now - r.startedAt; m.place = ++r.finished; this.of.delete(m.p.id);
    const base = r.def.prize * (r.solo ? SOLO_PRIZE : PLACE_PRIZE[Math.min(m.place - 1, PLACE_PRIZE.length - 1)]);
    m.prize = this.award(m.p, Math.round(base)) || 0; m.p.acc.stats.races++;
    const pb = (m.p.acc.pb ||= {}), prev = pb[r.def.id] || 0; m.prevBest = prev; if (!prev || m.time < prev) pb[r.def.id] = m.time; m.best = pb[r.def.id]; if (m.place === 1 && !r.solo) m.p.acc.stats.wins++;
    m.p.raceCool = { ...(m.p.raceCool || {}), [r.def.id]: now + COOLDOWN };
  }
  ranking(r) {
    return [...r.members].sort((a, b) => (a.done !== b.done ? (a.done ? -1 : 1) : a.done ? a.place - b.place : a.dnf !== b.dnf ? (a.dnf ? 1 : -1) : b.k - a.k || a.remaining - b.remaining));
  }
  tick(now = Date.now()) {
    for (const r of Object.values(this.r)) {
      if (r.state === 'lobby' && now >= r.lobbyEnd) { r.state = 'countdown'; r.goAt = now + COUNT; }
      else if (r.state === 'countdown' && now >= r.goAt) {
        for (const m of [...r.members]) if (!m.p.st || Math.hypot(m.p.st.x - r.start.x, m.p.st.z - r.start.z) > GO_R) { this.send(m.p, 'race:out', { reason: 'You were not at the start line' }); this.of.delete(m.p.id); r.members = r.members.filter(x => x !== m); }
        if (!r.members.length) { this.reset(r); continue; }
        r.state = 'running'; r.startedAt = now; r.solo = r.members.length === 1; r.finished = 0;
      } else if (r.state === 'running') {
        const timeout = (r.def.length / 9 + 45) * 1000; if (now - r.startedAt > timeout) r.members.forEach(m => { if (!m.done && !m.dnf) { m.dnf = true; m.reason = 'Out of time'; this.of.delete(m.p.id); } });
        if (r.members.every(m => m.done || m.dnf)) { r.state = 'results'; r.resultsEnd = now + RESULTS_MS; r.sent = false; }
      } else if (r.state === 'results' && now >= r.resultsEnd) { this.reset(r); continue; }
      if (r.state === 'idle') continue;
      const rank = this.ranking(r), t = now - r.startedAt;
      const list = rank.map((m, i) => ({ id: m.p.id, name: m.p.name, k: m.k, pos: i + 1, done: m.done, dnf: m.dnf, time: m.time, prize: m.prize, reason: m.reason }));
      const left = r.state === 'lobby' ? r.lobbyEnd - now : r.state === 'countdown' ? r.goAt - now : 0;
      for (const m of r.members) this.send(m.p, 'race:update', { id: r.def.id, state: r.state, left: Math.max(0, left), t: r.state === 'running' || r.state === 'results' ? t : 0, n: r.def.cps.length, list });
      if (r.state === 'results' && !r.sent) { r.sent = true; for (const m of r.members) this.send(m.p, 'race:results', { id: r.def.id, name: r.def.name, solo: r.solo, list, mine: m.done ? { time: m.time, prevBest: m.prevBest, best: m.best } : null }); }
    }
  }
}
