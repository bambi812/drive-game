// meta.js — DOM UI helpers (toasts, player list, leaderboard, name prompt, traffic controls).
// Every DOM access is null-guarded, and user-supplied text is only ever set via textContent (never innerHTML).
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export function toast(text, kind = '') {
  const box = $('toasts'); if (!box) return; const t = el('div', 'toast ' + kind, text); box.appendChild(t);
  while (box.children.length > 4) box.firstChild.remove(); setTimeout(() => t.remove(), 4200);
}
export function setZoneHud(text) { const e = $('zonehud'); if (e) e.textContent = text || ''; }
export function setPlayers(list) {
  const box = $('players'); if (!box) return; box.textContent = '';
  box.appendChild(el('div', 'ptitle', 'Players (' + list.length + ')'));
  for (const p of list) box.appendChild(el('div', 'prow' + (p.self ? ' self' : ''), p.name + (p.car ? '  ·  ' + p.car : '')));
}
export function setLeaderboard(lb) {
  const box = $('lbbody'); if (!box || !lb) return; box.textContent = '';
  const col = (title, rows, unit) => { const c = el('div', 'lbcol'); c.appendChild(el('div', 'lbhead', title)); rows.forEach((r, i) => c.appendChild(el('div', 'lbrow', `${i + 1}. ${r.name} — ${r.v}${unit}`))); if (!rows.length) c.appendChild(el('div', 'lbrow', '—')); return c; };
  box.appendChild(col('Top speed', lb.speed || [], ' km/h')); box.appendChild(col('Best drift', lb.drift || [], ' pts'));
}
export const leaderboardOpen = () => lbpanel?.style.display === 'block';
export function toggleLeaderboard() { const p = $('lbpanel'); if (p) p.style.display = p.style.display === 'block' ? 'none' : 'block'; }
// ---- accounts: resume saved session, else show login (Google Identity Services + guest). Tokens come from the server only.
const api = async (path, opts = {}) => { const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } }); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j; };
export const logoutLocal = () => localStorage.removeItem('session');
let accountKind = '';
export async function logout() {
  if (accountKind === 'guest' && !window.confirm('You are playing as a guest. Logging out loses this progress for good. Connect Google first to keep it. Log out anyway?')) return;
  const t = localStorage.getItem('session'); try { if (t) await api('/api/logout', { method: 'POST', headers: { authorization: 'Bearer ' + t } }); } catch (e) { } logoutLocal(); location.reload();
}
// Google Identity Services: the script loads once; the latest button to be shown receives the credential.
let gsi = null, onCredential = null;
async function googleButton(box, text, cb) {
  let cfg = {}; try { cfg = await api('/api/config'); } catch (e) { }
  if (!cfg.googleClientId) return false;
  gsi = gsi || new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => { try { window.google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: r => onCredential && onCredential(r.credential) }); ok(); } catch (e) { no(e); } };
    s.onerror = () => { gsi = null; no(new Error('offline')); }; document.head.appendChild(s);
  });
  try { await gsi; onCredential = cb; box.textContent = ''; window.google.accounts.id.renderButton(box, { theme: 'outline', size: 'large', text }); }
  catch (e) { box.textContent = 'Google sign-in unavailable'; }
  return true;
}
// guests get a "Save with Google" button that moves their current progress onto their Google account
export async function setAccount(kind) {
  accountKind = kind;
  const out = $('logout'); if (out) out.onclick = () => { out.blur(); logout(); };
  const open = $('linkbtn'), ov = $('linkbox'), gb = $('linkg'), close = $('linkclose'), err = $('linkerr'); if (!open || !ov || !gb) return;
  if (kind !== 'guest') { open.style.display = ov.style.display = 'none'; return; }
  let cfg = {}; try { cfg = await api('/api/config'); } catch (e) { }
  if (!cfg.googleClientId) return;
  open.style.display = 'block';
  if (close) close.onclick = () => { ov.style.display = 'none'; };
  open.onclick = () => {
    open.blur(); ov.style.display = 'flex'; if (err) err.textContent = '';
    googleButton(gb, 'continue_with', async credential => {
      try {
        const j = await api('/api/google', { method: 'POST', headers: { authorization: 'Bearer ' + localStorage.getItem('session') }, body: JSON.stringify({ credential }) });
        if (j.existing && !window.confirm('This Google account already has its own saved game. Switch to it? Your guest progress will not move over.')) { await api('/api/logout', { method: 'POST', headers: { authorization: 'Bearer ' + j.token } }); return; }
        localStorage.setItem('session', j.token); location.reload();
      } catch (e) { if (err) err.textContent = e.message; }
    });
  };
}
// the balance counts up to its new value; gains float up beside it
let shownMoney = null, moneyRaf = 0;
export function setMoney(n) {
  const e = $('money'); if (!e) return; n = Number(n) || 0;
  const write = v => { e.textContent = '$' + Math.round(v).toLocaleString(); };
  if (shownMoney === null) { shownMoney = n; write(n); return; }
  const from = shownMoney, t0 = performance.now(); shownMoney = n; cancelAnimationFrame(moneyRaf);
  if (n !== from) { const tag = el('div', 'moneytag' + (n < from ? ' minus' : ''), (n > from ? '+' : '-') + '$' + Math.abs(n - from).toLocaleString()); document.body.appendChild(tag); setTimeout(() => tag.remove(), 1600); }
  const step = now => { const k = Math.min(1, (now - t0) / 900), v = from + (n - from) * (1 - Math.pow(1 - k, 3)); write(v); if (k < 1) moneyRaf = requestAnimationFrame(step); };
  moneyRaf = requestAnimationFrame(step); setTimeout(() => write(n), 1000);
}
export function showKicked() { const o = $('kicked'); if (o) o.style.display = 'flex'; }
export async function login(onToken) {
  const t = localStorage.getItem('session');
  if (t) { try { await api('/api/me', { headers: { authorization: 'Bearer ' + t } }); onToken(t); return; } catch (e) { if (e.status !== 401) { onToken(t); return; } logoutLocal(); } }   // a busy / waking server must not throw away a guest's save
  showLogin(onToken, '');
}
export async function showLogin(onToken, msg) {
  const ov = $('login'), inp = $('nameinp'), btn = $('namebtn'), err = $('loginerr'), gb = $('gbtn'); if (!ov || !inp || !btn) return;
  const say = s => { if (err) err.textContent = s || ''; }; say(msg); ov.style.display = 'flex'; document.body.classList.add('atstart'); inp.value = localStorage.getItem('pname') || ''; setTimeout(() => inp.focus(), 50);
  const done = j => { localStorage.setItem('session', j.token); ov.style.display = 'none'; document.body.classList.remove('atstart'); inp.blur(); onToken(j.token); };
  const guest = async () => { btn.disabled = true; try { const n = inp.value.trim().slice(0, 16); localStorage.setItem('pname', n); done(await api('/api/guest', { method: 'POST', body: JSON.stringify({ name: n }) })); } catch (e) { say(e.message); } btn.disabled = false; };
  btn.onclick = guest; inp.onkeydown = e => { if (e.key === 'Enter') guest(); e.stopPropagation(); };
  if (!gb) return;
  const shown = await googleButton(gb, 'signin_with', async credential => { try { done(await api('/api/google', { method: 'POST', body: JSON.stringify({ credential }) })); } catch (e) { say(e.message); } });
  if (!shown) { gb.textContent = ''; gb.style.display = 'none'; const sep = $('gsep'); if (sep) sep.style.display = 'none'; }          // not configured: no Google button at all
}
// traffic toggle + count slider (the server simulates up to 30 cars for everyone; this only filters what you see)
export function trafficControls(onChange) {
  const on = $('trafon'), cnt = $('trafcnt'), lab = $('trafval'); if (!on || !cnt) return;
  const upd = () => { if (lab) lab.textContent = cnt.value; onChange(on.checked, +cnt.value); }; on.onchange = cnt.oninput = upd; upd();
}

// ---------------------------------------------------------------- Phase 5: garage panel (Cars / Upgrades / Style)
import { CARS, UPGRADES, upgradePrice, STYLE, stylePrice, DEFAULT_COS, RIMS, SPOILERS, PAINTS, GLOWS } from './catalog.js';
export function setPrompt(text, action) { const e = $('prompt'); if (e) { if (e.textContent !== (text || '')) e.textContent = text || ''; e.style.display = text ? 'block' : 'none'; e.onmousedown = ev => ev.preventDefault(); e.onclick = action || null; } }
const money = n => '$' + Number(n).toLocaleString();
const PARTS = [['engine', 'Engine', 'More torque'], ['tires', 'Tires', 'More grip'], ['brakes', 'Brakes', 'Shorter stops'], ['weight', 'Weight reduction', 'Lighter car']];
export function createGarage(api) {
  const root = $('garage'); if (!root) return null;
  const st = { tab: 'cars', view: 'brz24', pv: null, msg: '', name: '' };
  const prof = () => api.profile();
  const btn = (text, cls, fn, disabled) => { const b = el('button', cls, text); if (disabled) b.disabled = true; else b.onclick = fn; return b; };
  const note = t => { st.msg = t; const m = $('gmsg'); if (m) m.textContent = t; };
  const act = async payload => { const r = await api.buy(payload); note(r && r.ok ? 'Done!' : (r && r.error) || 'Failed'); return r; };
  let body = null, totalEl = null, applyBtn = null;
  const zeros = { engine: 0, tires: 0, brakes: 0, weight: 0 };
  function statBars(id, up) {
    const e = api.estimate(id, up), box = el('div', 'gstats'), row = (label, v, max, txt) => { const r = el('div', 'grow2'); r.appendChild(el('span', 'glabel', label)); const bar = el('div', 'gbar'), f = el('div', 'gfill'); f.style.width = Math.max(4, Math.min(100, v / max * 100)) + '%'; bar.appendChild(f); r.appendChild(bar); r.appendChild(el('span', 'gval', txt)); box.appendChild(r); };
    row('0-100 km/h', 14 - e.t100, 10, e.t100 ? e.t100.toFixed(2) + ' s' : '-'); row('Torque', e.torque, 700, e.torque + ' Nm'); row('Grip', e.grip, 1.6, e.grip.toFixed(2)); row('Brakes', e.brake, 1.6, e.brake.toFixed(2) + ' g'); row('Weight', 2200 - e.mass, 1400, Math.round(e.mass) + ' kg'); return box;
  }
  function carsTab() {
    const p = prof(); for (const id of Object.keys(CARS)) {
      const c = CARS[id], owned = p.cars.includes(id), e = api.estimate(id, p.up[id] || zeros), row = el('div', 'carrow' + (st.view === id ? ' on' : ''));
      const info = el('div', 'carinfo'); info.appendChild(el('div', 'carname', c.name)); info.appendChild(el('div', 'carsub', `0-100 ${e.t100 ? e.t100.toFixed(1) : '-'} s  |  ${e.mass} kg  |  ${e.torque} Nm  |  ${c.spec.redline} rpm`)); row.appendChild(info);
      const side = el('div', 'carside'); side.appendChild(el('div', 'carprice', owned ? 'Owned' : money(c.price)));
      if (!owned) side.appendChild(btn('Buy', 'gbtn', async ev => { ev.stopPropagation(); await act({ kind: 'car', car: id }); }, p.money < c.price));
      else side.appendChild(btn(p.sel === id ? 'In use' : 'Select', 'gbtn', async ev => { ev.stopPropagation(); await act({ kind: 'select', car: id }); }, p.sel === id));
      row.appendChild(side); row.onclick = () => { st.view = id; st.pv = null; api.viewCar(id); render(); }; body.appendChild(row);
    }
    body.appendChild(statBars(st.view, prof().up[st.view] || zeros));
  }
  function upgradesTab() {
    const p = prof(); if (!p.cars.includes(st.view)) { body.appendChild(el('div', 'gnote', 'You do not own ' + CARS[st.view].name + ' yet. Buy it in the Cars tab.')); return; }
    body.appendChild(el('div', 'gtitle', CARS[st.view].name)); const up = p.up[st.view];
    for (const [key, name, desc] of PARTS) {
      const stage = up[key], row = el('div', 'uprow'), info = el('div', 'carinfo'); info.appendChild(el('div', 'carname', name)); info.appendChild(el('div', 'carsub', desc));
      const pips = el('div', 'pips'); for (let i = 1; i <= 3; i++) pips.appendChild(el('span', 'pip' + (i <= stage ? ' on' : ''))); info.appendChild(pips); row.appendChild(info);
      if (stage >= 3) row.appendChild(el('div', 'carprice', 'MAX')); else { const price = upgradePrice(st.view, key, stage + 1); row.appendChild(btn('Stage ' + (stage + 1) + '  ' + money(price), 'gbtn', () => act({ kind: 'upgrade', car: st.view, part: key }), p.money < price)); }
      body.appendChild(row);
    }
    body.appendChild(statBars(st.view, up));
  }
  function updateTotals() { if (!totalEl) return; const p = prof(), cost = stylePrice(p.cos[st.view], st.pv); totalEl.textContent = cost ? 'Total ' + money(cost) : 'No changes'; if (applyBtn) applyBtn.disabled = !cost || p.money < cost; }
  function styleTab() {
    const p = prof(); if (!p.cars.includes(st.view)) { body.appendChild(el('div', 'gnote', 'You do not own ' + CARS[st.view].name + ' yet. Buy it in the Cars tab.')); return; }
    const owned = p.cos[st.view]; if (!st.pv) st.pv = { ...owned };
    const pv = st.pv, set = (k, v) => { pv[k] = v; api.previewCos(pv); render(true); };
    const section = (title, price) => { const s = el('div', 'gsec'); s.appendChild(el('div', 'gtitle', title + (price ? '  (' + price + ')' : ''))); body.appendChild(s); return s; };
    const sw = (parent, colors, cur, key, none) => { const w = el('div', 'swatches'); for (const c of colors) { const b = el('button', 'swatch' + (c === cur ? ' on' : ''), c ? '' : 'none'); if (c) b.style.background = c; b.title = c || 'None'; b.onclick = () => set(key, c); w.appendChild(b); } parent.appendChild(w); };
    const s1 = section('Paint', money(STYLE.paint)); sw(s1, PAINTS, pv.paint, 'paint');
    const pick = document.createElement('input'); pick.type = 'color'; pick.value = pv.paint; pick.className = 'picker'; pick.oninput = () => { pv.paint = pick.value; api.previewCos(pv); updateTotals(); }; s1.appendChild(pick);
    const s2 = section('Finish'); const f = el('div', 'opts'); for (const k of Object.keys(STYLE.finish)) f.appendChild(btn(k + (STYLE.finish[k] ? '  ' + money(STYLE.finish[k]) : ''), 'gopt' + (pv.finish === k ? ' on' : ''), () => set('finish', k))); s2.appendChild(f);
    const s3 = section('Rims'); const r = el('div', 'opts'); RIMS.forEach((x, i) => r.appendChild(btn(x.name + (STYLE.rims[i] ? '  ' + money(STYLE.rims[i]) : ''), 'gopt' + (pv.rims === i ? ' on' : ''), () => set('rims', i)))); s3.appendChild(r);
    const s4 = section('Underglow', money(STYLE.underglow)); sw(s4, GLOWS, pv.underglow, 'underglow');
    const s5 = section('Spoiler'); const sp = el('div', 'opts'); SPOILERS.forEach((n, i) => sp.appendChild(btn(n + (STYLE.spoiler[i] ? '  ' + money(STYLE.spoiler[i]) : ''), 'gopt' + (pv.spoiler === i ? ' on' : ''), () => set('spoiler', i)))); s5.appendChild(sp);
    const foot = el('div', 'gfoot'); totalEl = el('div', 'gtotal'); foot.appendChild(totalEl);
    applyBtn = btn('Apply', 'gbtn big', async () => { const r2 = await act({ kind: 'style', car: st.view, cos: st.pv }); if (r2 && r2.ok) st.pv = null; }); foot.appendChild(applyBtn);
    foot.appendChild(btn('Reset', 'gbtn', () => { st.pv = { ...owned }; api.previewCos(st.pv); render(true); })); body.appendChild(foot); updateTotals();
  }
  function render(keepScroll) {
    const keep = keepScroll && body ? body.scrollTop : 0; root.textContent = ''; const p = prof();
    const head = el('div', 'ghead'); head.appendChild(el('div', 'gname', 'GARAGE - ' + st.name)); head.appendChild(el('div', 'gmoney', money(p.money))); head.appendChild(btn('Close (Esc)', 'gbtn', () => api.close())); root.appendChild(head);
    const tabs = el('div', 'gtabs'); for (const [k, n] of [['cars', 'Cars'], ['up', 'Upgrades'], ['style', 'Style']]) tabs.appendChild(btn(n, 'gtab' + (st.tab === k ? ' on' : ''), () => { st.tab = k; if (k !== 'style') { st.pv = null; api.viewCar(st.view); } render(); })); root.appendChild(tabs);
    body = el('div', 'gbody'); root.appendChild(body); totalEl = applyBtn = null;
    if (st.tab === 'cars') carsTab(); else if (st.tab === 'up') upgradesTab(); else styleTab();
    const m = el('div', 'gmsg', st.msg); m.id = 'gmsg'; root.appendChild(m); body.scrollTop = keep;
  }
  return {
    open(g) { st.name = g.name; st.view = prof().sel; st.pv = null; st.msg = ''; root.style.display = 'flex'; api.viewCar(st.view); render(); },
    close() { root.style.display = 'none'; },
    refresh() { if (root.style.display === 'flex') { if (!st.pv) api.viewCar(st.view); render(true); } },
  };
}

// ---------------------------------------------------------------- Phase 6: race HUD, countdown, results, GPS arrow
export function setRaceHud(text) { const e = $('racehud'); if (e) { e.textContent = text || ''; e.style.display = text ? 'block' : 'none'; } }
export function setCount(text) { const e = $('racecount'); if (e) { e.textContent = text || ''; e.style.display = text ? 'block' : 'none'; } }
const fmtTime = ms => { const s = ms / 1000, m = Math.floor(s / 60); return m + ':' + (s % 60).toFixed(2).padStart(5, '0'); };
export const raceTime = fmtTime;
export function showResults(res, myId, again) {
  const box = $('raceresults'); if (!box) return; box.textContent = ''; box.style.display = 'block';
  box.appendChild(el('div', 'rrtitle', res.name + (res.solo ? '  (solo race: 40% prize)' : '') + ' - results'));
  for (const m of res.list) { const row = el('div', 'rrrow' + (m.id === myId ? ' me' : '')); row.appendChild(el('span', 'rrpos', m.done ? String(m.pos) : '-')); row.appendChild(el('span', 'rrname', m.name)); row.appendChild(el('span', 'rrtime', m.done ? fmtTime(m.time) : (m.reason || 'DNF'))); row.appendChild(el('span', 'rrprize', m.prize ? '+$' + m.prize.toLocaleString() : '')); box.appendChild(row); }
  const mine = res.mine;
  if (mine) {                                       // personal best and how this run compares with it
    const line = el('div', 'rrbest'); if (!mine.prevBest) line.textContent = 'First finish: ' + fmtTime(mine.time) + ' is your personal best';
    else { const d = mine.time - mine.prevBest; line.textContent = (d < 0 ? 'NEW PERSONAL BEST ' + fmtTime(mine.time) : 'Personal best ' + fmtTime(mine.best)) + '   ' + (d < 0 ? '-' : '+') + (Math.abs(d) / 1000).toFixed(2) + ' s'; line.classList.toggle('good', d < 0); }
    box.appendChild(line); }
  const close = () => { box.style.display = 'none'; clearTimeout(showResults.t); };
  if (again) { const r = el('button', 'gbtn big', 'Race again'); r.onclick = () => { close(); again(); }; box.appendChild(r); }
  const b = el('button', 'gbtn', 'Close'); b.onclick = close; box.appendChild(b); clearTimeout(showResults.t); showResults.t = setTimeout(close, 40000);
}
