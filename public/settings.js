// settings.js - everything the player can change (kept in the browser), the key bindings, and the settings screen.
const $ = id => document.getElementById(id);

export const DEFAULTS = {
  quality: 'high', drawDistance: 1, resolution: 1, autoRes: true, shadows: true, grass: true, speedLines: true, showFps: false,
  camDist: 1, camHeight: 1, fov: 0, camShake: 1,
  volume: 0.8, engineVol: 1, othersVol: 1, hornVol: 1, navVoice: true,
  abs: true, tcs: true, esc: true, countersteer: true, manual: false, steerSens: 1, mph: false,
  traffic: true, trafficCount: 30, showHitbox: false, damageDrive: true, showHud: true, showMinimap: true, showTeleport: true,
};
// action -> [label, default key]
export const ACTIONS = {
  throttle: ['Throttle', 'KeyW'], brake: ['Brake / reverse', 'KeyS'], left: ['Steer left', 'KeyA'], right: ['Steer right', 'KeyD'], handbrake: ['Handbrake', 'Space'], nitro: ['Nitro', 'ShiftLeft'],
  engine: ['Engine on / off', 'KeyI'], lights: ['Headlights', 'KeyL'], blinkLeft: ['Left indicator', 'KeyQ'], blinkRight: ['Right indicator', 'KeyE'], hazards: ['Hazard lights', 'KeyX'], horn: ['Horn', 'KeyH'],
  parkBrake: ['Parking brake', 'KeyP'], cruise: ['Cruise control', 'KeyK'], gearbox: ['Automatic / manual gearbox', 'KeyG'], shiftUp: ['Gear up', 'KeyF'], shiftDown: ['Gear down', 'KeyZ'],
  abs: ['ABS on / off', 'Digit1'], tcs: ['Traction control (TCS)', 'Digit2'], esc: ['Stability control (ESC)', 'Digit3'], countersteer: ['Steering assist', 'Digit4'],
  camera: ['Change camera', 'KeyC'], lookBack: ['Look back', 'KeyB'], reset: ['Reset onto road', 'KeyR'], map: ['Map', 'KeyM'],
};
const load = key => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } };
export function loadSettings() {
  const old = {}; if (localStorage.getItem('quality')) old.quality = localStorage.getItem('quality'); if (localStorage.getItem('units') === 'mph') old.mph = true; if (localStorage.getItem('assists') === 'sim') Object.assign(old, { abs: false, tcs: false, esc: false, countersteer: false });
  const s = { ...DEFAULTS, ...old, ...load('settings2') }, keys = {}, saved = load('keys2');
  for (const [a, [, def]] of Object.entries(ACTIONS)) keys[a] = typeof saved[a] === 'string' ? saved[a] : def;
  return { s, keys };
}
export const keyName = code => !code ? '-' : code.replace(/^Key/, '').replace(/^Digit/, '').replace('Arrow', '').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'R-Shift').replace('ControlLeft', 'Ctrl').replace('Space', 'Space');

const TABS = [
  ['Graphics', [
    ['quality', 'Quality', 'select', [['low', 'Low (smoothest)'], ['medium', 'Medium'], ['high', 'High']]], ['drawDistance', 'Draw distance', 'range', 0.6, 2.2, 0.1], ['resolution', 'Sharpness', 'range', 0.5, 1.5, 0.05],
    ['autoRes', 'Lower sharpness automatically when it lags', 'toggle'], ['shadows', 'Shadows', 'toggle'], ['grass', '3D grass', 'toggle'], ['speedLines', 'Speed lines', 'toggle'], ['showFps', 'Show FPS', 'toggle']]],
  ['Camera', [['camDist', 'Distance', 'range', 0.7, 1.8, 0.05], ['camHeight', 'Height', 'range', 0.6, 1.8, 0.05], ['fov', 'Field of view', 'range', -12, 20, 1], ['camShake', 'Shake', 'range', 0, 2, 0.1]]],
  ['Sound', [['volume', 'Master volume', 'range', 0, 1, 0.05], ['engineVol', 'Engine and tyres', 'range', 0, 1.5, 0.05], ['othersVol', 'Other cars', 'range', 0, 1.5, 0.05], ['hornVol', 'Horn', 'range', 0, 1, 0.05], ['navVoice', 'Navigation voice', 'toggle']]],
  ['Driving', [['abs', 'ABS', 'toggle'], ['tcs', 'Traction control (TCS)', 'toggle'], ['esc', 'Stability control (ESC)', 'toggle'], ['countersteer', 'Steering assist', 'toggle'], ['manual', 'Manual gearbox', 'toggle'], ['steerSens', 'Steering speed', 'range', 0.5, 1.8, 0.05], ['mph', 'Miles per hour', 'toggle']]],
  ['Keys', null],
  ['Game', [['traffic', 'Traffic', 'toggle'], ['trafficCount', 'Number of cars', 'range', 0, 30, 1], ['damageDrive', 'Damage affects driving', 'toggle'], ['showHitbox', 'Show collision box', 'toggle'], ['showHud', 'Speedometer and panels', 'toggle'], ['showMinimap', 'Minimap', 'toggle'], ['showTeleport', 'Teleport box', 'toggle']]],
];
// state: {s, keys}; onChange(name) applies a setting
export function initSettings(state, onChange) {
  const box = $('settings'); let tab = 0, waiting = null;
  const save = () => { localStorage.setItem('settings2', JSON.stringify(state.s)); localStorage.setItem('keys2', JSON.stringify(state.keys)); };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const button = (text, cls, run) => { const b = el('button', cls, text); b.type = 'button'; b.onmousedown = e => e.preventDefault(); b.onclick = run; return b; };
  const set = (name, value) => { state.s[name] = value; save(); onChange(name); };
  function row([name, label, type, a, b, step]) {
    const r = el('div', 'srow'); r.appendChild(el('span', '', label));
    if (type === 'toggle') r.appendChild(button(state.s[name] ? 'On' : 'Off', 'stog' + (state.s[name] ? ' on' : ''), () => { set(name, !state.s[name]); render(); }));
    else if (type === 'select') { const wrap = el('div', 'sseg'); for (const [v, t] of a) wrap.appendChild(button(t, state.s[name] === v ? 'on' : '', () => { set(name, v); render(); })); r.appendChild(wrap); }
    else { const wrap = el('div', 'sslide'), input = el('input'), val = el('b', '', String(+(+state.s[name]).toFixed(2))); input.type = 'range'; input.min = a; input.max = b; input.step = step; input.value = state.s[name]; input.oninput = () => { val.textContent = String(+(+input.value).toFixed(2)); set(name, +input.value); }; input.onchange = () => input.blur(); wrap.append(input, val); r.appendChild(wrap); }
    return r;
  }
  function render() {
    if (!box) return; box.textContent = '';
    const panel = el('div', 'spanel'), head = el('div', 'shead'), body = el('div', 'sbody');
    head.appendChild(el('h2', '', 'Settings')); head.appendChild(button('Close', 'sclose', () => show(false))); panel.appendChild(head);
    const tabs = el('div', 'stabs'); TABS.forEach(([t], i) => tabs.appendChild(button(t, i === tab ? 'on' : '', () => { tab = i; waiting = null; render(); }))); panel.appendChild(tabs);
    const rows = TABS[tab][1];
    if (rows) rows.forEach(r => body.appendChild(row(r)));
    else {
      body.appendChild(el('div', 'snote', 'Click a key, then press the new one. Esc cancels. Arrow keys always drive too.'));
      for (const [action, [label]] of Object.entries(ACTIONS)) { const r = el('div', 'srow'); r.appendChild(el('span', '', label)); r.appendChild(button(waiting === action ? 'Press a key...' : keyName(state.keys[action]), 'skey' + (waiting === action ? ' wait' : ''), () => { waiting = action; render(); })); body.appendChild(r); }
    }
    const reset = button(rows ? 'Reset this tab' : 'Reset all keys', 'sreset', () => { if (rows) rows.forEach(([n]) => set(n, DEFAULTS[n])); else { for (const [a, [, d]] of Object.entries(ACTIONS)) state.keys[a] = d; save(); } render(); });
    body.appendChild(reset); panel.appendChild(body); box.appendChild(panel);
  }
  function show(v) { if (!box) return; waiting = null; box.style.display = v ? 'flex' : 'none'; if (v) render(); }
  // while waiting for a key, the next key press becomes the binding (a key already in use is moved)
  addEventListener('keydown', e => {
    if (!waiting) return; e.preventDefault(); e.stopImmediatePropagation();
    if (e.code !== 'Escape') { for (const a in state.keys) if (state.keys[a] === e.code) state.keys[a] = ''; state.keys[waiting] = e.code; save(); }
    waiting = null; render();
  }, true);
  return { open: () => show(true), close: () => show(false), isOpen: () => !!box && box.style.display === 'flex', save, refresh: () => { if (box && box.style.display === 'flex') render(); } };
}
