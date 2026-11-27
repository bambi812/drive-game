// hud.js - driver HUD (canvas gauge: tachometer, speed, gear, shift lights, nitro, ABS/TCS), debug / live-tuning panel (from the Esc menu), speed lines.
const $ = id => document.getElementById(id);
export function initHud() {
  const cv = $('gauge'), g = cv && cv.getContext('2d'); let mph = localStorage.getItem('units') === 'mph';
  const W = 360, H = 230;
  if (cv) cv.addEventListener('click', () => toggleUnits());
  function toggleUnits() { mph = !mph; localStorage.setItem('units', mph ? 'mph' : 'kmh'); }
  const setUnits = v => { mph = !!v; };
  // dial: a smooth rev arc around a big speed readout, gear in a disc below, thin nitro arc, assist chips on the right
  let drawnAt = 0;
  const A0 = Math.PI * 0.76, SW = Math.PI * 1.48, CX = 180, CY = 124, R = 100;
  const FONT = '"Bahnschrift","DIN Alternate","Segoe UI",system-ui,sans-serif';
  const text = (t, x, y, size, color, weight = 700) => { g.font = `${weight} ${size}px ${FONT}`; g.fillStyle = color; g.fillText(t, x, y); };
  const arc = (r, a, b, w, color) => { g.lineWidth = w; g.strokeStyle = color; g.beginPath(); g.arc(CX, CY, r, a, b); g.stroke(); };
  function draw(c, S, flags, now) {
    if (!g || now - drawnAt < 33) return; drawnAt = now; g.clearRect(0, 0, W, H); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineCap = 'round';
    const max = Math.ceil(S.redline / 1000) * 1000, n = Math.max(0, Math.min(1, c.rpm / max)), redN = S.redline / max, flash = (c.lim || c.rpm > S.redline * 0.975) && Math.floor(now / 70) % 2 === 0;
    g.fillStyle = 'rgba(11,15,20,.80)'; g.beginPath(); g.arc(CX, CY, R + 13, 0, 7); g.fill();
    arc(R, A0, A0 + SW, 10, 'rgba(255,255,255,.10)');
    arc(R, A0 + SW * (redN - 0.04), A0 + SW, 10, 'rgba(255,77,94,.38)');
    if (n > 0.005) { const color = flash ? '#ffffff' : n >= redN - 0.04 ? '#ff4d5e' : n >= redN - 0.16 ? '#ff8a3d' : '#c6ff3d'; g.shadowColor = color; g.shadowBlur = 10; arc(R, A0, A0 + SW * n, 10, color); g.shadowBlur = 0; }
    for (let k = 0; k <= max / 1000; k++) { const a = A0 + SW * (k * 1000 / max); text(String(k), CX + Math.cos(a) * (R - 17), CY + Math.sin(a) * (R - 17), 11, k * 1000 > S.redline - 400 ? '#ff7b88' : 'rgba(255,255,255,.55)'); }
    text(String(Math.round(c.kmh * (mph ? 0.621371 : 1))), CX, CY - 8, 66, '#ffffff');
    text(mph ? 'mph' : 'km/h', CX, CY + 30, 13, '#9aa7b8');
    const gear = c.gear < 0 ? 'R' : (Math.abs(c.u) < 0.4 && c.gear === 1 && flags.thr < 0.05 ? 'N' : String(c.gear));
    g.fillStyle = flash ? '#ff4d5e' : '#c6ff3d'; g.beginPath(); g.arc(CX, 196, 23, 0, 7); g.fill(); text(gear, CX, 198, 28, '#0b0f14');
    const nf = Math.max(0, Math.min(1, c.nitro / 100)), na = Math.PI * 0.80, nb = Math.PI * 1.40;
    arc(R + 21, na, nb, 6, 'rgba(255,255,255,.14)'); if (nf > 0.01) arc(R + 21, na, na + (nb - na) * nf, 6, c.nitroOn ? '#e0faff' : '#5ad1ff');
    text('NITRO', 54, 208, 11, '#a9e4ff');
    if (flags.boost > 0.05) { arc(R + 21, Math.PI * 1.60, Math.PI * (1.60 + 0.28 * flags.boost), 4, '#ff8a3d'); text('BOOST', 308, 46, 11, '#ff8a3d'); }
    const chip = (label, y, on, hot) => { g.fillStyle = hot && on ? '#ff8a3d' : on ? 'rgba(11,15,20,.80)' : 'rgba(11,15,20,.45)'; g.beginPath(); if (g.roundRect) g.roundRect(305, y, 46, 18, 9); else g.rect(305, y, 46, 18); g.fill(); text(label, 328, y + 10, 11, !on ? 'rgba(255,255,255,.30)' : hot ? '#0b0f14' : '#ffffff'); };
    chip('ABS', 160, flags.abs, c.absOn); chip('TCS', 182, flags.tcs, c.tcsOn); chip('ESC', 204, flags.esc, c.escOn);
    text(flags.manual ? 'MANUAL' : 'AUTO', 328, 148, 11, flags.manual ? '#c6ff3d' : '#9aa7b8');
    const car = flags.car || {}, tick = (now % 760) < 400;
    if ((car.blink === 1 || car.hazard) && tick) text('\u25C0', 52, 52, 22, '#c6ff3d');
    if ((car.blink === -1 || car.hazard) && tick) text('\u25B6', 308, 68, 22, '#c6ff3d');
    if (car.lights) text('LIGHTS', 34, 150, 11, '#a9e4ff');
    if (car.park) text('PARKED', 34, 168, 11, '#ff7b88');
    if (car.cruise) text('CRUISE ' + Math.round(car.cruise * (mph ? 2.237 : 3.6)), CX, CY - 52, 11, '#a9e4ff');
    if (car.engine === false) text('ENGINE OFF', CX, CY + 48, 12, '#ff4d5e');
  }
  return { draw, toggleUnits, setUnits };
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
