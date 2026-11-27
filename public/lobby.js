// lobby.js - the hub: choose to drive alone, with friends (a world with a code) or in the public world.
const $ = id => document.getElementById(id);

export function initLobby({ join, info, onClose }) {
  const box = $('lobby'), err = $('lobbyerr'), code = $('lobbycode'), back = $('lobbyback'), count = $('lobbycount');
  let open = false, inside = false, busy = false, timer = 0;
  const say = text => { if (err) err.textContent = text || ''; };
  const refresh = async () => { const d = await info(); if (open && d && count) count.textContent = d.public === 1 ? '1 driver there now' : d.public + ' drivers there now'; };
  function hide() { if (!open) return; open = false; clearInterval(timer); if (box) box.style.display = 'none'; document.body.classList.remove('atstart'); document.activeElement?.blur?.(); onClose(); }
  function show(message, canGoBack) {
    if (!box) return; open = true; inside = !!canGoBack; box.style.display = 'flex'; document.body.classList.add('atstart'); say(message);
    if (back) back.style.display = inside ? 'block' : 'none';
    clearInterval(timer); timer = setInterval(refresh, 3000); refresh();
  }
  async function pick(req) {
    if (busy) return; busy = true; say('');
    const r = await join(req); busy = false;
    if (r && r.ok) hide(); else say((r && r.error) || 'Could not enter');
  }
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  on('lobbysolo', () => pick({ mode: 'solo' }));
  on('lobbypublic', () => pick({ mode: 'public' }));
  on('lobbycreate', () => pick({ mode: 'create' }));
  const enterCode = () => { if (code && code.value.trim()) pick({ mode: 'code', code: code.value }); else say('Type the code your friend sent you'); };
  on('lobbyjoin', enterCode);
  on('lobbyback', hide);
  if (code) code.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') enterCode(); if (e.key === 'Escape' && inside) hide(); };
  return { show, hide, isOpen: () => open, escape: () => { if (inside) hide(); } };
}
