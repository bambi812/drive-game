// controls.js - extra driver controls: engine start/stop, manual gearbox, clutch, headlights, indicators, hazards, horn.
// Lights and horn are local only (other players do not see or hear them).
import * as THREE from 'three';
import { shiftGear } from './physics.js';

export function initControls({ root, glowSprite, getCar, getSpec, getRig, getAudio, toast }) {
  const state = { engineOn: true, manual: localStorage.getItem('gearbox') === 'manual', lights: 0, signal: 0, hazard: false };
  const LIGHTS = ['OFF', 'LOW', 'HIGH'];

  // headlight beams: created once with intensity 0 so switching them on does not recompile shaders
  const beams = [1, -1].map(side => {
    const l = new THREE.SpotLight(0xfff1cc, 0, 60, 0.5, 0.6, 1);
    l.position.set(side * 0.6, 0.7, 2.0); l.target.position.set(side * 0.9, 0, 14);
    root.add(l, l.target); return l;
  });
  // indicator lamps at the four corners (+x is the car's left)
  const lamps = [];
  for (const side of [1, -1]) for (const end of [1, -1]) {
    const s = glowSprite(0xff9500); s.scale.set(0.55, 0.55, 1); s.visible = false; root.add(s); lamps.push({ s, side, end });
  }

  const dash = document.createElement('div');
  dash.style.cssText = 'position:fixed;left:12px;top:70px;display:flex;gap:10px;align-items:center;background:#000a;padding:5px 14px;border-radius:16px;font-size:12px;font-weight:800;white-space:nowrap;pointer-events:none';
  document.body.appendChild(dash);
  const cell = () => dash.appendChild(document.createElement('span'));
  const dLeft = cell(), dEngine = cell(), dBox = cell(), dLights = cell(), dRight = cell();
  dLeft.textContent = '◀'; dRight.textContent = '▶';

  let horn = null;
  function hornOn() {
    const au = getAudio(); if (!au || horn) return;
    const AC = au.AC, g = AC.createGain(); g.gain.value = 0.12; g.connect(au.out);
    const osc = [410, 515].map(f => { const o = AC.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(g); o.start(); return o; });
    horn = { g, osc };
  }
  function hornOff() { if (!horn) return; horn.osc.forEach(o => o.stop()); horn.g.disconnect(); horn = null; }

  function shift(dir) {
    if (!state.manual) { toast('Press K for manual gears'); return; }
    if (!shiftGear(getCar(), getSpec(), dir)) toast('Cannot shift now');
  }

  function keydown(e) {
    switch (e.code) {
      case 'KeyI': state.engineOn = !state.engineOn; toast(state.engineOn ? 'Engine started' : 'Engine off'); break;
      case 'KeyK': state.manual = !state.manual; localStorage.setItem('gearbox', state.manual ? 'manual' : 'auto'); toast(state.manual ? 'Gearbox: MANUAL (G up, Q down, N clutch)' : 'Gearbox: AUTOMATIC'); break;
      case 'KeyG': shift(1); break;
      case 'KeyQ': shift(-1); break;
      case 'KeyO': state.lights = (state.lights + 1) % 3; toast('Headlights: ' + LIGHTS[state.lights]); break;
      case 'Comma': state.signal = state.signal === 1 ? 0 : 1; break;
      case 'Period': state.signal = state.signal === -1 ? 0 : -1; break;
      case 'Slash': e.preventDefault(); state.hazard = !state.hazard; break;
      case 'KeyJ': hornOn(); break;
    }
  }
  addEventListener('keyup', e => { if (e.code === 'KeyJ') hornOff(); });
  addEventListener('blur', hornOff);

  let blinkT = 0;
  function update(dt) {
    const rig = getRig(), len = rig ? rig.len : 4.4, width = rig ? rig.width : 1.85;
    if (rig) rig.headLevel = state.lights;
    beams.forEach(l => { l.intensity = [0, 40, 90][state.lights]; l.distance = state.lights === 2 ? 110 : 55; });
    const left = state.hazard || state.signal === 1, right = state.hazard || state.signal === -1;
    blinkT = left || right ? blinkT + dt : 0;
    const on = (blinkT % 0.7) < 0.35;
    for (const l of lamps) {
      l.s.position.set(l.side * width * 0.45, 0.7, l.end * (len / 2 - 0.1));
      l.s.visible = on && (l.side === 1 ? left : right);
    }
    dLeft.style.color = left && on ? '#3ddc5a' : '#fff4';
    dRight.style.color = right && on ? '#3ddc5a' : '#fff4';
    dEngine.textContent = state.engineOn ? 'ENGINE ON' : 'ENGINE OFF (I)';
    dEngine.style.color = state.engineOn ? '#fff' : '#ff6a5a';
    dBox.textContent = state.manual ? 'MANUAL' : 'AUTO';
    dLights.textContent = 'LIGHTS ' + LIGHTS[state.lights];
    dLights.style.color = state.lights === 2 ? '#7fc8ff' : '#fff';
  }
  return { state, keydown, update };
}
