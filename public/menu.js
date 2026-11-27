// menu.js - the Esc menu (everything that used to be a keyboard shortcut) and the teleport button on the left.
const $ = id => document.getElementById(id);
const button = (text, run) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.onmousedown = e => e.preventDefault(); b.onclick = run; return b; };   // never takes focus, so Space stays the handbrake

// items: [{ label: () => string, run, stay?: keep the menu open, show?: () => boolean }]   spots: [{ name, run }]
export function initMenu({ items, spots, onOpen }) {
  const box = $('menu'), list = $('menuitems'), tp = $('tp'); let open = false;
  const render = () => { if (!list) return; list.textContent = ''; for (const it of items) { if (it.show && !it.show()) continue; list.appendChild(button(it.label(), () => { if (!it.stay) close(); it.run(); if (it.stay) render(); })); } };
  const set = v => { open = v; if (box) box.style.display = v ? 'flex' : 'none'; if (v) { render(); onOpen(); } };
  const close = () => set(false);
  if (box) box.addEventListener('mousedown', e => { if (e.target === box) close(); });          // click outside the panel
  if (tp) {                                                      // closed until asked for, so it does not cover the road
    const head = button('Teleport', () => tp.classList.toggle('open')), grid = document.createElement('div'); head.className = 'tphead'; grid.className = 'tplist';
    for (const s of spots) grid.appendChild(button(s.name, () => { tp.classList.remove('open'); s.run(); })); tp.append(head, grid); }
  return { toggle: () => set(!open), close, isOpen: () => open };
}
