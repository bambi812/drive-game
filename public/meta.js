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
export function toggleLeaderboard() { const p = $('lbpanel'); if (p) p.style.display = p.style.display === 'block' ? 'none' : 'block'; }
// ---- accounts: resume saved session, else show login (Google Identity Services + guest). Tokens come from the server only.
const api = async (path, opts = {}) => { const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Request failed'); return j; };
export const logoutLocal = () => localStorage.removeItem('session');
export async function logout() { const t = localStorage.getItem('session'); try { if (t) await api('/api/logout', { method: 'POST', headers: { authorization: 'Bearer ' + t } }); } catch (e) { } logoutLocal(); location.reload(); }
export function setMoney(n) { const e = $('money'); if (e) e.textContent = '$' + Number(n).toLocaleString(); }
export function showKicked() { const o = $('kicked'); if (o) o.style.display = 'flex'; }
export async function login(onToken) {
  const t = localStorage.getItem('session');
  if (t) { try { await api('/api/me', { headers: { authorization: 'Bearer ' + t } }); onToken(t); return; } catch (e) { logoutLocal(); } }
  showLogin(onToken, '');
}
export async function showLogin(onToken, msg) {
  const ov = $('login'), inp = $('nameinp'), btn = $('namebtn'), err = $('loginerr'), gb = $('gbtn'); if (!ov || !inp || !btn) return;
  const say = s => { if (err) err.textContent = s || ''; }; say(msg); ov.style.display = 'flex'; inp.value = localStorage.getItem('pname') || ''; setTimeout(() => inp.focus(), 50);
  const done = j => { localStorage.setItem('session', j.token); ov.style.display = 'none'; inp.blur(); onToken(j.token); };
  const guest = async () => { btn.disabled = true; try { const n = inp.value.trim().slice(0, 16); localStorage.setItem('pname', n); done(await api('/api/guest', { method: 'POST', body: JSON.stringify({ name: n }) })); } catch (e) { say(e.message); } btn.disabled = false; };
  btn.onclick = guest; inp.onkeydown = e => { if (e.key === 'Enter') guest(); e.stopPropagation(); };
  let cfg = {}; try { cfg = await api('/api/config'); } catch (e) { }
  if (!gb) return;
  if (!cfg.googleClientId) { gb.textContent = 'Google sign-in is not configured on this server (set GOOGLE_CLIENT_ID).'; return; }
  const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
  s.onload = () => { try { window.google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: async r => { try { done(await api('/api/google', { method: 'POST', body: JSON.stringify({ credential: r.credential }) })); } catch (e) { say(e.message); } } });
    window.google.accounts.id.renderButton(gb, { theme: 'outline', size: 'large', text: 'signin_with' }); } catch (e) { gb.textContent = 'Google sign-in unavailable'; } };
  s.onerror = () => { gb.textContent = 'Google sign-in unavailable (offline?)'; }; document.head.appendChild(s);
}
// traffic toggle + count slider (the server simulates up to 30 cars for everyone; this only filters what you see)
export function trafficControls(onChange) {
  const on = $('trafon'), cnt = $('trafcnt'), lab = $('trafval'); if (!on || !cnt) return;
  const upd = () => { if (lab) lab.textContent = cnt.value; onChange(on.checked, +cnt.value); }; on.onchange = cnt.oninput = upd; upd();
}
