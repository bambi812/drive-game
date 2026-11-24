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
export function askName(cb) {
  const ov = $('login'), inp = $('nameinp'), btn = $('namebtn'); if (!ov || !inp || !btn) { cb(localStorage.getItem('pname') || ''); return; }
  inp.value = localStorage.getItem('pname') || ''; ov.style.display = 'flex'; setTimeout(() => inp.focus(), 50);
  const go = () => { const n = inp.value.trim().slice(0, 16); localStorage.setItem('pname', n); ov.style.display = 'none'; inp.blur(); cb(n); };
  btn.onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); e.stopPropagation(); };
}
// traffic toggle + count slider (the server simulates up to 30 cars for everyone; this only filters what you see)
export function trafficControls(onChange) {
  const on = $('trafon'), cnt = $('trafcnt'), lab = $('trafval'); if (!on || !cnt) return;
  const upd = () => { if (lab) lab.textContent = cnt.value; onChange(on.checked, +cnt.value); }; on.onchange = cnt.oninput = upd; upd();
}
