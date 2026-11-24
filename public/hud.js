// hud.js - driver HUD (canvas gauge: tachometer, speed, gear, shift lights, nitro, ABS/TCS), help overlay (H), debug / live-tuning panel (F3), speed lines.
const $ = id => document.getElementById(id);
export function initHud() {
  const cv = $('gauge'), g = cv && cv.getContext('2d'); let mph = localStorage.getItem('units') === 'mph';
  const W = 360, H = 230, CX = 180, CY = 128, R = 100, A0 = Math.PI * 0.75, SW = Math.PI * 1.5;
  if (cv) cv.addEventListener('click', () => toggleUnits());
  function toggleUnits() { mph = !mph; localStorage.setItem('units', mph ? 'mph' : 'kmh'); }
  function draw(c, S, flags, now) {
    if (!g) return; g.clearRect(0, 0, W, H); const max = Math.ceil(S.redline / 1000) * 1000, n = c.rpm / max, redN = S.redline / max;
    // shift light bar
    const lit = Math.max(0, Math.min(10, Math.round((c.rpm / S.redline - 0.76) / 0.24 * 10))), blink = c.lim || c.rpm > S.redline * 0.985 ? (Math.floor(now / 70) % 2 === 0) : true;
    for (let i = 0; i < 10; i++) { const on = i < lit && blink, col = i < 4 ? '#3ddc5a' : i < 7 ? '#ffc21a' : '#ff3b30'; g.beginPath(); g.arc(88 + i * 20.5, 16, 6, 0, 7); g.fillStyle = on ? col : 'rgba(255,255,255,.12)'; g.fill(); if (on) { g.shadowColor = col; g.shadowBlur = 10; g.fill(); g.shadowBlur = 0; } }
    // dial
    g.lineCap = 'round'; g.lineWidth = 16; g.strokeStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.arc(CX, CY, R, A0, A0 + SW); g.stroke();
    g.lineWidth = 14; g.strokeStyle = 'rgba(255,60,50,.55)'; g.beginPath(); g.arc(CX, CY, R, A0 + SW * redN, A0 + SW); g.stroke();
    const gr = g.createLinearGradient(40, 200, 320, 40); gr.addColorStop(0, '#ffd23f'); gr.addColorStop(0.7, '#ffb21a'); gr.addColorStop(1, '#ff5a3c'); g.strokeStyle = gr; g.lineWidth = 14; g.beginPath(); g.arc(CX, CY, R, A0, A0 + SW * Math.min(1, n)); g.stroke();
    g.lineCap = 'butt'; g.font = '600 13px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 0; k <= max / 1000; k++) { const a = A0 + SW * (k * 1000 / max), r1 = R - 18, r2 = R - 26; g.strokeStyle = k * 1000 > S.redline ? '#ff6a5a' : 'rgba(255,255,255,.75)'; g.lineWidth = 2; g.beginPath(); g.moveTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1); g.lineTo(CX + Math.cos(a) * (r1 - 7), CY + Math.sin(a) * (r1 - 7)); g.stroke(); g.fillStyle = k * 1000 > S.redline ? '#ff8d80' : 'rgba(255,255,255,.85)'; g.fillText(String(k), CX + Math.cos(a) * r2 * 0.86, CY + Math.sin(a) * r2 * 0.86); }
    // speed + gear
    const sp = Math.round(c.kmh * (mph ? 0.621371 : 1)); g.fillStyle = '#fff'; g.font = '800 58px system-ui,sans-serif'; g.shadowColor = '#000'; g.shadowBlur = 8; g.fillText(String(sp), CX, CY - 4); g.shadowBlur = 0;
    g.font = '600 14px system-ui,sans-serif'; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(mph ? 'MPH' : 'KM/H', CX, CY + 28);
    g.font = '800 44px system-ui,sans-serif'; g.fillStyle = c.lim ? '#ff5a4a' : '#ffd23f'; g.shadowColor = '#000'; g.shadowBlur = 6; g.fillText(c.gear < 0 ? 'R' : (Math.abs(c.u) < 0.4 && c.gear === 1 && flags.thr < 0.05 ? 'N' : String(c.gear)), CX, 202); g.shadowBlur = 0;
    // nitro bar + assists
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(20, 190, 96, 10); g.fillStyle = c.nitroOn ? '#7fe9ff' : '#2d8fb0'; g.fillRect(20, 190, 96 * Math.max(0, Math.min(1, c.nitro / 100)), 10); g.font = '700 11px system-ui,sans-serif'; g.fillStyle = 'rgba(255,255,255,.8)'; g.textAlign = 'left'; g.fillText('NITRO', 20, 182);
    const badge = (txt, x, on, hot) => { g.fillStyle = on ? (hot ? '#ffb21a' : 'rgba(255,255,255,.28)') : 'rgba(255,255,255,.1)'; g.fillRect(x, 214, 34, 15); g.fillStyle = on ? '#111' : 'rgba(255,255,255,.35)'; g.textAlign = 'center'; g.fillText(txt, x + 17, 222); };
    badge('ABS', 244, flags.assists, c.absOn); badge('TCS', 284, flags.assists, c.tcsOn); g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.6)'; g.fillText(flags.assists ? 'ARCADE' : 'SIM', 340, 182);
    if (flags.boost > 0.05) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(244, 190, 76 * flags.boost, 4); g.textAlign = 'left'; g.fillText('BOOST', 244, 184); }
  }
  return { draw, toggleUnits };
}
export function initHelp() {
  const el = $('help'); if (!el) return { toggle() {} };
  el.innerHTML = '<h3>Controls</h3><div class="hg"><b>W / &uarr;</b>gas<b>S / &darr;</b>brake / reverse<b>A D / &larr; &rarr;</b>steer<b>SPACE</b>handbrake<b>SHIFT</b>nitro<b>C</b>camera (chase / far / hood / bumper)<b>B (hold)</b>look back<b>mouse drag</b>orbit<b>R</b>reset on road<b>V</b>flip car model<b>Z</b>next car<b>E</b>garage<b>M</b>map<b>T</b>teleport to garage<b>ENTER / X</b>join / leave race<b>1-4</b>teleport<b>F</b>fly<b>U</b>km/h &harr; mph<b>F2</b>assists (arcade / sim)<b>F3</b>debug + live tuning<b>F4</b>quality (low / medium / high)<b>H</b>this help</div><p>Gamepad: stick steer, RT gas, LT brake, A handbrake, X / RB nitro, Y camera, Back reset.</p>';
  return { toggle() { el.style.display = el.style.display === 'block' ? 'none' : 'block'; } };
}
export function initDebug(getCar, getSpec, getInfo) {
  const el = $('debug'); if (!el) return { toggle() {}, update() {} }; let on = false, last = 0; const TUNE = [['mass', 700, 2600, 10], ['torque', 100, 1000, 5], ['muF', 0.6, 1.8, 0.01], ['muR', 0.6, 1.8, 0.01], ['brakeG', 0.6, 2, 0.01], ['cdA', 0.3, 1.2, 0.01], ['clA', 0, 3, 0.05]];
  el.innerHTML = '<pre id="dbgtxt"></pre><div id="dbgtune"></div>'; const tune = el.querySelector('#dbgtune');
  for (const [k, lo, hi, st] of TUNE) { const row = document.createElement('label'); row.innerHTML = `${k} <input type="range" min="${lo}" max="${hi}" step="${st}"> <span></span>`; const inp = row.querySelector('input'), sp = row.querySelector('span'); inp.addEventListener('input', () => { getSpec()[k] = +inp.value; sp.textContent = inp.value; }); row._k = k; row._inp = inp; row._sp = sp; tune.appendChild(row); }
  const sync = () => { for (const row of tune.children) { const v = getSpec()[row._k]; row._inp.value = v; row._sp.textContent = (+v).toFixed(2); } };
  return { toggle() { on = !on; el.style.display = on ? 'block' : 'none'; if (on) sync(); }, resync: sync, isOn: () => on, update(now) { if (!on || now - last < 120) return; last = now; const c = getCar(), S = getSpec(), i = getInfo(); el.querySelector('#dbgtxt').textContent =
    `FPS ${i.fps.toFixed(0)}   calls ${i.calls}   tris ${(i.tris / 1000).toFixed(0)}k   quality ${i.quality}\nspeed ${c.kmh.toFixed(0)} km/h   rpm ${c.rpm.toFixed(0)}/${S.redline}   gear ${c.gear}   thr ${c.thr.toFixed(2)}   boost ${c.boost.toFixed(2)}\nslip angle ${c.slip.toFixed(1)} deg   rear slip ${c.rearSlip.toFixed(2)}   surface ${c.kind}   ax ${c.ax.toFixed(1)}  ay ${c.ay.toFixed(1)} m/s2\nABS ${c.absOn}  TCS ${c.tcsOn}  lock ${c.locked}  spin ${c.spin}  air ${c.air}  hb ${c.hb}\nmass ${S.mass.toFixed(0)} kg   drive ${S.drive}   front ${(S.front * 100).toFixed(0)}%   steer ${c.steer.toFixed(2)}`; } };
}
export function speedLines() {
  const cv = $('fx'); if (!cv) return { draw() {} }; const g = cv.getContext('2d'); let w = 0, h = 0; const fit = () => { w = cv.width = innerWidth; h = cv.height = innerHeight; }; fit(); addEventListener('resize', fit);
  return { draw(k) { g.clearRect(0, 0, w, h); if (k < 0.02) return; const cx = w / 2, cy = h * 0.52, n = 36 + k * 40; g.lineWidth = 1.5; for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, r0 = (0.28 + Math.random() * 0.25) * Math.min(w, h), r1 = r0 + (40 + Math.random() * 160) * k; g.strokeStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.16 * k})`; g.beginPath(); g.moveTo(cx + Math.cos(a) * r0 * 1.25, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1 * 1.25, cy + Math.sin(a) * r1); g.stroke(); } } };
}
