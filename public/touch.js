// touch.js - on-screen controls for phones and tablets: steer arrows on the left, pedals on the right, handbrake, nitro, menu and map.
export const isTouch = () => matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');
// actions: { menu(), map(), interact() }  ->  returns the live state read by the game every frame
export function initTouch(actions) {
  const state = { left: false, right: false, gas: false, brake: false, hb: false, nitro: false };
  document.body.classList.add('touch');
  const root = document.createElement('div'); root.id = 'touch'; document.body.appendChild(root);
  const group = id => { const g = document.createElement('div'); g.id = id; root.appendChild(g); return g; };
  const left = group('tsteer'), right = group('tpedals'), top = group('ttop');
  // a held button: several fingers work at once because every button keeps its own pointer
  const hold = (parent, key, label, cls) => {
    const b = document.createElement('div'); b.className = 'tb ' + cls; b.textContent = label; parent.appendChild(b);
    const set = on => { state[key] = on; b.classList.toggle('on', on); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (err) { } set(true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
  };
  const tap = (parent, label, run) => { const b = document.createElement('div'); b.className = 'tb small'; b.textContent = label; parent.appendChild(b); b.addEventListener('pointerdown', e => { e.preventDefault(); run(); }); };
  hold(left, 'left', '\u25C0', 'arrow'); hold(left, 'right', '\u25B6', 'arrow');
  hold(right, 'hb', 'HB', 'round'); hold(right, 'nitro', 'N2O', 'round'); hold(right, 'brake', 'BRAKE', 'pedal brake'); hold(right, 'gas', 'GAS', 'pedal gas');
  tap(top, 'MENU', actions.menu); tap(top, 'MAP', actions.map);
  const rotate = document.createElement('div'); rotate.id = 'rotate';
  const msg = document.createElement('div'); msg.textContent = 'Turn your phone sideways to drive'; const anyway = document.createElement('button'); anyway.type = 'button'; anyway.textContent = 'Play like this anyway';
  anyway.onclick = () => { rotate.remove(); }; rotate.append(msg, anyway); document.body.appendChild(rotate);
  addEventListener('blur', () => { for (const k in state) state[k] = false; });
  return state;
}