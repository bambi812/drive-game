// hud.js - driver HUD (canvas gauge: tachometer, speed, gear, shift lights, nitro, ABS/TCS), debug / live-tuning panel (from the Esc menu), speed lines.
const $ = id => document.getElementById(id);
export function initHud() {
  const cv = $('gauge'), g = cv && cv.getContext('2d'); let mph = localStorage.getItem('units') === 'mph';
  const W = 360, H = 230;
  if (cv) cv.addEventListener('click', () => toggleUnits());
  function toggleUnits() { mph = !mph; localStorage.setItem('units', mph ? 'mph' : 'kmh'); }
  // game dial: segmented tachometer, italic speed, gear badge, nitro arc, assist pills
  const A0 = Math.PI * 0.80, SW = Math.PI * 1.40, CX = 190, CY = 132, SEG = 44;
  const text = (t, x, y, size, color, weight = 800) => { g.font = `italic ${weight} ${size}px "Segoe UI",system-ui,sans-serif`; g.fillStyle = color; g.fillText(t, x, y); };
  function draw(c, S, flags, now) {
    if (!g) return; g.clearRect(0, 0, W, H); g.textAlign = 'center'; g.textBaseline = 'middle';
    const max = Math.ceil(S.redline / 1000) * 1000, n = Math.min(1, c.rpm / max), redN = S.redline / max, flash = (c.lim || c.rpm > S.redline * 0.975) && Math.floor(now / 70) % 2 === 0;
    const back = g.createRadialGradient(CX, CY, 30, CX, CY, 128); back.addColorStop(0, 'rgba(8,11,20,.88)'); back.addColorStop(0.72, 'rgba(8,11,20,.66)'); back.addColorStop(1, 'rgba(8,11,20,0)');
    g.fillStyle = back; g.beginPath(); g.arc(CX, CY, 128, 0, 7); g.fill();
    for (let i = 0; i < SEG; i++) {                                              // tachometer segments
      const f = i / SEG, a = A0 + SW * f, lit = f < n, hot = f >= redN - 0.1, red = f >= redN - 0.02;
      g.strokeStyle = lit ? (flash ? '#ffffff' : red ? '#ff2e63' : hot ? '#ffc53d' : '#22d3ee') : red ? 'rgba(255,46,99,.35)' : 'rgba(255,255,255,.13)';
      g.lineWidth = lit ? 15 : 11; g.shadowColor = g.strokeStyle; g.shadowBlur = lit ? 9 : 0; g.beginPath(); g.arc(CX, CY, 96, a + 0.012, a + SW / SEG - 0.012); g.stroke();
    }
    g.shadowBlur = 0;
    for (let k = 0; k <= max / 1000; k++) { const a = A0 + SW * (k * 1000 / max); text(String(k), CX + Math.cos(a) * 73, CY + Math.sin(a) * 73, 12, k * 1000 > S.redline - 400 ? '#ff6b8b' : 'rgba(255,255,255,.7)', 700); }
    const speed = Math.round(c.kmh * (mph ? 0.621371 : 1));
    g.shadowColor = '#22d3ee'; g.shadowBlur = 14; text(String(speed), CX, CY - 6, 62, '#fff', 900); g.shadowBlur = 0;
    text(mph ? 'MPH' : 'KM/H', CX, CY + 31, 12, '#8fa3bf');
    const gear = c.gear < 0 ? 'R' : (Math.abs(c.u) < 0.4 && c.gear === 1 && flags.thr < 0.05 ? 'N' : String(c.gear));
    g.fillStyle = flash ? '#ff2e63' : '#ffd23f'; g.beginPath(); g.moveTo(CX - 20, 188); g.lineTo(CX + 28, 188); g.lineTo(CX + 20, 224); g.lineTo(CX - 28, 224); g.closePath(); g.fill(); text(gear, CX, 207, 30, '#0b0f18', 900);
    // nitro: outer arc on the left
    const na = Math.PI * 0.80, nb = Math.PI * 1.45, nf = Math.max(0, Math.min(1, c.nitro / 100));
    g.lineCap = 'round'; g.lineWidth = 7; g.strokeStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.arc(CX, CY, 114, na, nb); g.stroke();
    if (nf > 0.01) { g.strokeStyle = c.nitroOn ? '#e0faff' : '#38bdf8'; g.shadowColor = '#38bdf8'; g.shadowBlur = c.nitroOn ? 18 : 6; g.beginPath(); g.arc(CX, CY, 114, na, na + (nb - na) * nf); g.stroke(); g.shadowBlur = 0; }
    g.lineCap = 'butt'; text('NITRO', 62, 213, 11, '#7dd3fc');
    if (flags.boost > 0.05) { g.lineWidth = 4; g.strokeStyle = '#ffc53d'; g.beginPath(); g.arc(CX, CY, 114, Math.PI * 1.55, Math.PI * (1.55 + 0.65 * flags.boost)); g.stroke(); text('BOOST', 322, 74, 11, '#ffc53d'); }
    const pill = (label, y, on, hot) => { g.fillStyle = !flags.assists ? 'rgba(255,255,255,.07)' : on && hot ? '#ffc53d' : 'rgba(255,255,255,.16)'; g.beginPath(); g.moveTo(304, y); g.lineTo(350, y); g.lineTo(345, y + 18); g.lineTo(299, y + 18); g.closePath(); g.fill(); text(label, 325, y + 9.5, 11, !flags.assists ? 'rgba(255,255,255,.3)' : on && hot ? '#0b0f18' : '#fff'); };
    pill('ABS', 182, true, c.absOn); pill('TCS', 204, true, c.tcsOn);
    text(flags.assists ? 'ASSIST' : 'DRIFT', 325, 170, 10, flags.assists ? '#8fa3bf' : '#ff2e63');
  }
  return { draw, toggleUnits };
}
export function initDebug(getCar, getSpec, getInfo) {
  const el = $('debug'); if (!el) return { toggle() {}, update() {} }; let on = false, last = 0; const TUNE = [['mass', 700, 2600, 10], ['torque', 100, 1000, 5], ['muF', 0.6, 1.8, 0.01], ['muR', 0.6, 1.8, 0.01], ['brakeG', 0.6, 2, 0.01], ['cdA', 0.3, 1.2, 0.01], ['clA', 0, 3, 0.05]];
  el.innerHTML = '<pre id="dbgtxt"></pre><div id="dbgtune"></div>'; const tune = el.querySelector('#dbgtune');
  for (const [k, lo, hi, st] of TUNE) { const row = document.createElement('label'); row.innerHTML = `${k} <input type="range" min="${lo}" max="${hi}" step="${st}"> <span></span>`; const inp = row.querySelector('input'), sp = row.querySelector('span'); inp.addEventListener('input', () => { getSpec()[k] = +inp.value; sp.textContent = inp.value; }); row._k = k; row._inp = inp; row._sp = sp; tune.appendChild(row); }
  const sync = () => { for (const row of tune.children) { const v = getSpec()[row._k]; row._inp.value = v; row._sp.textContent = (+v).toFixed(2); } };
  return { toggle() { on = !on; el.style.display = on ? 'block' : 'none'; if (on) sync(); }, resync: sync, isOn: () => on, update(now) { if (!on || now - last < 120) return; last = now; const c = getCar(), S = getSpec(), i = getInfo(); if (!c.w) return; const G = 9.81, f2 = (v, n = 2) => (+v).toFixed(n), d = c.dbg || {};
    const rows = ['FL', 'FR', 'RL', 'RR'].map((nm, k) => { const w = c.w[k]; return `${nm} ${w.hit ? f2(w.N / 1000, 1).padStart(5) : '  air'}kN  slip ${f2(w.kapR || 0).padStart(5)}  ang ${f2((w.alp || 0) * 57.3, 1).padStart(5)}  Fx ${f2((w.Fx || 0) / 1000, 1).padStart(5)} Fy ${f2((w.Fy || 0) / 1000, 1).padStart(5)}  ${f2(w.om * 9.549, 0).padStart(5)}rpm  comp ${f2((w.x || 0) * 100, 0).padStart(3)}cm  ${w.kind}`; });
    el.querySelector('#dbgtxt').textContent =
    `FPS ${i.fps.toFixed(0)}   calls ${i.calls}   tris ${(i.tris / 1000).toFixed(0)}k   particles ${i.particles}   quality ${i.quality}\nspeed ${c.kmh.toFixed(0)} km/h   rpm ${c.rpm.toFixed(0)}/${S.redline}   gear ${c.gear}   thr ${c.thr.toFixed(2)}   boost ${c.boost.toFixed(2)}   clutch ${f2(d.eng == null ? 1 : d.eng)}   Te ${f2(d.Te || 0, 0)} Tcl ${f2(d.Tcl || 0, 0)} Nm\nyaw rate ${f2(c.r)} rad/s   slip angle ${c.slip.toFixed(1)} deg   long ${f2(c.ax / G)} g   lat ${f2(c.ay / G)} g   air ${c.air}  scrape ${f2(c.scrape)}\nABS ${c.absOn}  TCS ${c.tcsOn}  ESC ${c.escOn}  spin ${c.spin}  surface ${c.kind}  wet ${f2(c.wetT)}\nmass ${S.mass.toFixed(0)} kg   drive ${S.drive}/${S.diff}   front ${(S.front * 100).toFixed(0)}%   steer ${c.steer.toFixed(2)}\n\n${rows.join('\n')}`; } };
}
export function speedLines() {
  const cv = $('fx'); if (!cv) return { draw() {} }; const g = cv.getContext('2d'); let w = 0, h = 0; const fit = () => { w = cv.width = innerWidth; h = cv.height = innerHeight; }; fit(); addEventListener('resize', fit);
  return { draw(k) { g.clearRect(0, 0, w, h); if (k < 0.02) return; const cx = w / 2, cy = h * 0.52, n = 36 + k * 40; g.lineWidth = 1.5; for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, r0 = (0.28 + Math.random() * 0.25) * Math.min(w, h), r1 = r0 + (40 + Math.random() * 160) * k; g.strokeStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.16 * k})`; g.beginPath(); g.moveTo(cx + Math.cos(a) * r0 * 1.25, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1 * 1.25, cy + Math.sin(a) * r1); g.stroke(); } } };
}
