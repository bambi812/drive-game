// town.js - everything built on the map: shops, restaurants, malls, towers, homes, the casino strip, the port, the airfield and
// the attractions. Buildings stand along the roads of each district; a lot is only used if no road, water or other building is there.
// Geometry is merged per 400 m cell (few draw calls, hidden when off screen); repeated small things are instanced.
import * as THREE from 'three';
import * as W from './world.js';
import { houseGeo, villaGeo } from './scenery.js';

// shopfront atlas: [name, second line, sign colour, text colour, kind]
const SHOPS = [
  ['NOODLE BAR', 'OPEN LATE', '#b3221c', '#fff6e0', 'food'], ['THE CATCH', 'SEAFOOD', '#1d2f55', '#ffffff', 'food'], ['THE TAVERN', 'PUB', '#3b2416', '#ffd98a', 'food'], ['CAFE LUNA', 'COFFEE', '#6d4a3a', '#fff0e8', 'cafe'],
  ['BAKERY', 'FRESH DAILY', '#d98a2b', '#fff8ea', 'cafe'], ['QUICK MART', '24h', '#ffffff', '#12813f', 'mart'], ['PHARMACY', 'HEALTH', '#1c8f57', '#ffffff', 'shop'], ['BOOK NOOK', 'BOOKS', '#264b3a', '#f1e7c8', 'shop'],
  ['MODE', 'FASHION', '#18181c', '#f4f4f4', 'shop'], ['VOLT', 'ELECTRONICS', '#0f5fb5', '#fff200', 'shop'], ['BLOOM', 'FLOWERS', '#c8517a', '#fff4f8', 'shop'], ['BURGER BAY', 'BURGERS', '#d8461f', '#ffe27a', 'food'],
  ['HARBOUR BANK', 'BANK', '#e9e4d6', '#1f3a6b', 'bank'], ['GAME PARK', 'ARCADE', '#4b1f8f', '#6ef7ff', 'shop'], ['SUPER FRESH', 'MARKET', '#e8f4e0', '#d6251f', 'mart'], ['KARAOKE', 'MUSIC BOX', '#c21f6b', '#ffffff', 'shop'],
];
const FOOD = [0, 1, 2, 11], CAFES = [3, 4], RETAIL = [6, 7, 8, 9, 10, 13, 15], ANY = [...FOOD, ...CAFES, ...RETAIL, 5, 12];

export function buildTown(c) {
  const { scene, R, rnd, merge, paint, instances, canvasTex, boxFaces, stdV, trees: TG } = c;
  let H = 6;                                        // ground height of the lot being built
  const PI = Math.PI, pick = a => a[(rnd() * a.length) | 0], snap4 = v => Math.max(8, Math.round(v / 4) * 4);
  const B = (w, h, d, x, y, z, col) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col);
  const CYL = (r1, r2, h, n, x, y, z, col) => paint(new THREE.CylinderGeometry(r1, r2, h, n).translate(x, y, z), col);

  // ---------------------------------------------------------------- textures
  const sky = (g, x, y, w, h, a, b) => { const gr = g.createLinearGradient(x, y, x + w * 0.4, y + h); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(x, y, w, h); };
  const glassTex = canvasTex(512, 512, (g, w, h) => {                      // office curtain wall: 8 panes x 4 floors
    g.fillStyle = '#c3ced8'; g.fillRect(0, 0, w, h);
    for (let f = 0; f < 4; f++) for (let k = 0; k < 8; k++) { const x = k * 64, y = f * 128, v = rnd() * 50 | 0;
      sky(g, x + 3, y + 8, 58, 98, `rgb(${185 + v},${205 + v * 0.8},${232 + v * 0.4})`, `rgb(${70 + v},${92 + v},${122 + v})`);
      if (rnd() < 0.3) { g.fillStyle = 'rgba(235,240,245,.55)'; g.fillRect(x + 3, y + 8, 58, 12 + rnd() * 40); }          // blinds
      if (rnd() < 0.14) { g.fillStyle = 'rgba(255,226,150,.6)'; g.fillRect(x + 8, y + 40, 48, 60); }                      // lights on
      g.fillStyle = 'rgba(30,40,55,.35)'; g.fillRect(x + 3, y + 106, 58, 18); }                                           // spandrel
    g.fillStyle = '#56636f'; for (let k = 0; k <= 8; k++) g.fillRect(k * 64 - 2, 0, 4, h);
    g.fillStyle = '#e6ebf0'; for (let f = 0; f < 4; f++) g.fillRect(0, f * 128, w, 5); }, true);
  const aptTex = canvasTex(512, 512, (g, w, h) => {                        // homes / offices over shops: 4 windows x 4 floors
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(90,80,70,${rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * h, 2, 2 + rnd() * 5); }   // render grain
    for (let f = 0; f < 4; f++) for (let k = 0; k < 4; k++) { const x = k * 128, y = f * 128, lit = rnd() < 0.13;
      g.fillStyle = '#7d8389'; g.fillRect(x + 22, y + 22, 84, 80); g.fillStyle = '#eef0f2'; g.fillRect(x + 25, y + 25, 78, 74);
      if (lit) sky(g, x + 29, y + 29, 70, 66, '#fff0bd', '#e9b866'); else sky(g, x + 29, y + 29, 70, 66, '#a8c6e0', '#2a4260');
      if (rnd() < 0.45) { g.fillStyle = pick(['#f2dfc4', '#dce6ee', '#e9c9c9', '#cfe0cc']); g.fillRect(x + 29, y + 29, 14 + rnd() * 30, 66); }  // curtain
      g.fillStyle = '#eef0f2'; g.fillRect(x + 62, y + 29, 4, 66); g.fillStyle = '#9aa0a6'; g.fillRect(x + 18, y + 102, 92, 6); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 20, y + 108, 90, 7);
      if (rnd() < 0.3) { g.fillStyle = '#d6d9dc'; g.fillRect(x + 4, y + 80, 20, 20); g.strokeStyle = '#8b9096'; g.lineWidth = 2; g.beginPath(); g.arc(x + 14, y + 90, 7, 0, 7); g.stroke(); } }  // AC unit
    g.fillStyle = 'rgba(0,0,0,.08)'; for (let f = 0; f < 4; f++) g.fillRect(0, f * 128 + 122, w, 6);
    g.fillStyle = '#b9bdc2'; g.fillRect(124, 0, 5, h); }, true);
  const atlasTex = canvasTex(2048, 1024, g => {                           // 16 shopfronts, 512 x 256 each
    SHOPS.forEach(([jp, en, bg, fg, kind], i) => {
      g.save(); g.translate((i % 4) * 512, ((i / 4) | 0) * 256); g.beginPath(); g.rect(0, 0, 512, 256); g.clip();
      g.fillStyle = kind === 'bank' ? '#cdc8bb' : kind === 'food' ? '#4a342a' : '#d9d6cf'; g.fillRect(0, 0, 512, 256);
      // sign board
      g.fillStyle = bg; g.fillRect(6, 6, 500, 66); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 4; g.strokeRect(6, 6, 500, 66);
      g.fillStyle = fg; g.textBaseline = 'middle'; g.font = 'bold 40px sans-serif'; g.textAlign = 'left'; g.fillText(jp, 22, 41, 300); g.font = 'bold 22px sans-serif'; g.textAlign = 'right'; g.fillText(en, 492, 42, 160);
      if (kind === 'mart') { for (const [y, col] of [[74, '#ee7b22'], [82, '#1c9c4e'], [90, '#d6251f']]) { g.fillStyle = col; g.fillRect(0, y, 512, 7); } }
      // windows with a lit interior
      const warm = kind === 'food' || kind === 'cafe', door = 196 + (rnd() < 0.5 ? 0 : 56);
      const pane = (x, y, w, h) => { sky(g, x, y, w, h, warm ? '#ffe3ae' : '#e8f6ff', warm ? '#b9743a' : '#8fb3cc');
        for (let s = 0; s < 3; s++) { const sy = y + h * (0.34 + s * 0.22); g.fillStyle = 'rgba(70,50,40,.55)'; g.fillRect(x + 4, sy, w - 8, 4);
          for (let px = x + 8; px < x + w - 12; px += 9 + rnd() * 9) { const ph = 8 + rnd() * 18; g.fillStyle = kind === 'bank' ? '#9fb2c4' : `hsl(${rnd() * 360},${warm ? 45 : 65}%,${38 + rnd() * 30}%)`; g.fillRect(px, sy - ph, 5 + rnd() * 6, ph); } }
        g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * 0.45, y); g.lineTo(x, y + h * 0.7); g.fill();
        g.strokeStyle = kind === 'food' ? '#241610' : '#3c4046'; g.lineWidth = 7; g.strokeRect(x, y, w, h); g.lineWidth = 3; g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.stroke(); };
      pane(18, 104, door - 36, 128); pane(door + 118, 104, 512 - door - 136, 128);
      // door
      sky(g, door, 104, 100, 148, '#bcd6e6', '#51708a'); g.strokeStyle = '#2b2f35'; g.lineWidth = 8; g.strokeRect(door, 104, 100, 148); g.beginPath(); g.moveTo(door + 50, 104); g.lineTo(door + 50, 252); g.stroke(); g.fillStyle = '#e6e9ec'; g.fillRect(door + 38, 170, 6, 28); g.fillRect(door + 56, 170, 6, 28);
      if (kind === 'food') { g.fillStyle = i === 1 ? '#1d3b73' : '#8f1d18'; for (let s = 0; s < 4; s++) g.fillRect(door - 6 + s * 29, 104, 25, 46);
        g.fillStyle = '#f4ead2'; g.fillRect(24, 176, 46, 58); g.fillStyle = '#5a3b24'; for (let s = 0; s < 5; s++) g.fillRect(29, 183 + s * 10, 36, 3); }   // menu board
      g.fillStyle = '#6c7076'; g.fillRect(0, 246, 512, 10); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 72, 512, 6);
      g.restore(); }); }, false);
  const VWORDS = ['HOTEL', 'DINER', 'MUSIC', 'PIZZA', 'ARCADE', 'GRILL', 'COFFEE', 'SPA'];
  const vTex = canvasTex(1024, 384, g => VWORDS.forEach((word, i) => { const x = i * 128, hue = [8, 320, 36, 205, 265, 130, 0, 185][i];
    g.fillStyle = `hsl(${hue},75%,38%)`; g.fillRect(x, 0, 128, 384); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(x + 8, 8, 112, 368); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold ${Math.min(78, 320 / word.length)}px sans-serif`;
    [...word].forEach((ch, k) => g.fillText(ch, x + 64, 384 * (k + 0.5) / word.length)); }), false);
  const paveTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#c7c9cc'; g.fillRect(0, 0, w, h); for (let y = 0; y < 8; y++) for (let x = -1; x < 8; x++) { const v = 178 + rnd() * 38 | 0; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(x * 32 + (y % 2) * 16 + 1, y * 32 + 1, 30, 30); }
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.1})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); } }, true);
  const lotTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#54565c'; g.fillRect(0, 0, w, h); for (let i = 0; i < 6000; i++) { const v = 60 + rnd() * 70 | 0; g.fillStyle = `rgba(${v},${v},${v + 5},.5)`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
    for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(20,20,22,.18)'; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 6 + rnd() * 14, 4 + rnd() * 8, rnd() * 3, 0, 7); g.fill(); } }, true);
  const lawnTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#69a944'; g.fillRect(0, 0, w, h); for (let i = 0; i < 4000; i++) { g.strokeStyle = `hsl(${88 + rnd() * 30},${40 + rnd() * 25}%,${28 + rnd() * 26}%)`; const x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd() * 3 - 1.5, y - 3 - rnd() * 4); g.stroke(); } }, true);

  const std = o => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const flatOff = { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };
  const mats = {
    shop: std({ map: atlasTex, emissiveMap: atlasTex, emissive: 0x2a2a2a, roughness: 0.45 }), apt: std({ map: aptTex, roughness: 0.75 }), glass: std({ map: glassTex, roughness: 0.12, metalness: 0.55 }),
    solid: std({ roughness: 0.8 }), vsign: std({ map: vTex, emissiveMap: vTex, emissive: 0x777777, side: THREE.DoubleSide }),
    pave: std({ map: paveTex, roughness: 0.92 }), lot: std({ map: lotTex, roughness: 0.95, ...flatOff }), lawn: std({ map: lawnTex, roughness: 1, ...flatOff }), flat: std({ roughness: 0.85, ...flatOff }),
    window: new THREE.MeshStandardMaterial({ color: 0x9fd0ea, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.28 }),
    water: new THREE.MeshStandardMaterial({ color: 0x2f8fb5, roughness: 0.05, metalness: 0.3, ...flatOff }),
    neon: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  const CAST = { shop: false, apt: true, glass: true, solid: true, vsign: false, pave: false, lot: false, lawn: false, flat: false, neon: false };
  const quads = new Map();   // merged geometry per 400 m cell
  const add = (mat, x, z, geo) => { const k = Math.floor(x / 400) * 64 + Math.floor(z / 400); let q = quads.get(k); if (!q) quads.set(k, q = {}); (q[mat] ||= []).push(geo); };

  // ---------------------------------------------------------------- placement helpers (local frame: the front of a building is +z)
  const place = (g, cx, cz, ry, lx = 0, ly = 0, lz = 0) => g.translate(lx, ly, lz).rotateY(ry).translate(cx, H, cz);
  const at = (cx, cz, ry, lx, lz) => [cx + lx * Math.cos(ry) + lz * Math.sin(ry), cz - lx * Math.sin(ry) + lz * Math.cos(ry)];
  const solidRect = (cx, cz, w, d, ry) => {                  // square to the axes: one box; turned: a row of circles
    const k = Math.abs(Math.sin(ry * 2)); if (k < 0.2) { const side = Math.abs(Math.sin(ry)) > 0.5; c.solidBox(cx, cz, (side ? d : w) / 2, (side ? w : d) / 2); return; }
    const long = Math.max(w, d), short = Math.min(w, d), along = w >= d ? 0 : PI / 2, n = Math.max(1, Math.ceil(long / (short * 0.6)));
    for (let i = 0; i < n; i++) { const o = n === 1 ? 0 : -long / 2 + short / 2 + i * (long - short) / (n - 1), a = ry + along; c.solidAdd(cx + Math.cos(a) * o, cz - Math.sin(a) * o, short / 2); } };
  const atlasQuad = (i, w, h) => { const g = new THREE.PlaneGeometry(w, h), u = g.attributes.uv, u0 = (i % 4) / 4, v0 = 1 - (((i / 4) | 0) + 1) / 4; for (let k = 0; k < u.count; k++) u.setXY(k, u0 + u.getX(k) * 0.25, v0 + u.getY(k) * 0.25); return paint(g, '#ffffff'); };
  const vQuad = i => { const g = new THREE.PlaneGeometry(1, 3), u = g.attributes.uv; for (let k = 0; k < u.count; k++) u.setXY(k, (i + u.getX(k)) / 8, u.getY(k)); return paint(g, '#ffffff'); };
  const flatRect = (mat, x0, z0, x1, z1, y, col = '#ffffff', tile = 4) => add(mat, (x0 + x1) / 2, (z0 + z1) / 2, boxFaces(x1 - x0, 0.04, z1 - z0, [2], 1 / tile, col).translate((x0 + x1) / 2, H + y, (z0 + z1) / 2));
  // a standing sign with its own texture (mall, gas station, cinema...)
  function bigSign(x, y, z, ry, w, h, main, sub, bg, fg) {
    const tex = canvasTex(1024, Math.round(1024 * h / w), (g, cw, ch) => { g.fillStyle = bg; g.fillRect(0, 0, cw, ch); g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(10, 10, cw - 20, ch - 20); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `bold ${ch * (sub ? 0.46 : 0.62)}px sans-serif`; g.fillText(main, cw / 2, ch * (sub ? 0.37 : 0.52), cw - 50); if (sub) { g.font = `bold ${ch * 0.24}px sans-serif`; g.fillText(sub, cw / 2, ch * 0.76, cw - 50); } }, false);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0x666666, roughness: 0.5 }));
    m.position.set(x, H + y, z); m.rotation.y = ry; scene.add(m);
  }

  // ---------------------------------------------------------------- repeated small things (instanced at the end)
  const I = { lantern: [], table: [], chair: [], umbrella: [], car: [], bench: [], vendR: [], vendB: [], balcony: [], bay: [], pole: [], busstop: [], post: [], bollard: [], tree: [], sakura: [], planter: [], bin: [], palm: [], pine: [], box: [] };
  const CAR_COLS = [0xf4f4f4, 0x23262b, 0xb9bec5, 0x9d1f26, 0x1f4f96, 0xe8c33a, 0x2f7d55, 0x6a6f77, 0xdadde1, 0x111316];
  const parkCar = (x, z, ry) => { I.car.push({ x, y: H + 0.07, z, ry: ry + (rnd() - 0.5) * 0.04, c: pick(CAR_COLS) }); solidRect(x, z, 1.85, 4.3, ry); };
  const tree = (x, z, s = R(0.45, 0.6), sak = false) => { (sak ? I.sakura : I.tree).push({ x, y: H, z, ry: R(0, 6), sx: s, c: sak ? 0xffffff : new THREE.Color().setHSL(R(0.27, 0.34), 0.3, R(0.8, 1.0)).getHex() }); c.solidAdd(x, z, 0.35); };
  const prop = (list, x, z, ry = 0, r = 0.3, y = 0.05) => { list.push({ x, y: H + y, z, ry }); if (r) c.solidAdd(x, z, r); };

  // ---------------------------------------------------------------- one small shop: front on the street, 0-3 floors above
  const WALLS = ['#f1e6d3', '#e3c9a8', '#d9a98a', '#c98d6b', '#eeeeea', '#cfd8dc', '#e8d6b0', '#b7c7d6', '#d7d2c8', '#a9b8a2', '#8f9aa6'];
  const AWN = ['#c0392b', '#1f6f50', '#1d4e89', '#d98a2b', '#7b2d8b', '#2d2f36'];
  function shop(cx, cz, ry, w, type, floors) {
    const d = 10, kind = SHOPS[type][4], gh = 4.2, uh = floors * 3.2, top = gh + uh, tint = pick(WALLS), add1 = (mat, g) => add(mat, cx, cz, g);
    add1('solid', place(B(w, gh, d - 0.1, 0, 0, 0, tint), cx, cz, ry, 0, gh / 2, -0.05));
    add1('shop', place(atlasQuad(type, w - 0.3, gh - 0.05), cx, cz, ry, 0, gh / 2, d / 2 + 0.02));
    if (floors) {
      add1('apt', place(boxFaces(w - 0.1, uh, d - 0.5, [0, 1, 4, 5], 1 / 12.8, tint), cx, cz, ry, 0, gh + uh / 2, -0.25));
      for (let f = 1; f <= floors; f++) add1('solid', place(B(w, 0.14, d - 0.3, 0, 0, 0, '#9aa0a8'), cx, cz, ry, 0, gh + (f - 1) * 3.2 + 0.07, -0.25));
      add1('solid', place(B(w + 0.1, 0.45, d - 0.2, 0, 0, 0, '#7c828b'), cx, cz, ry, 0, top + 0.22, -0.2));
      add1('solid', place(B(R(1.2, 2.2), R(0.6, 1.2), R(1, 1.8), 0, 0, 0, '#b4bac0'), cx, cz, ry, R(-w / 4, w / 4), top + 0.85, R(-3, 1)));
      if (rnd() < 0.3) add1('solid', place(CYL(0.8, 0.8, 1.5, 10, 0, 0, 0, '#d7dade'), cx, cz, ry, R(-w / 4, w / 4), top + 1.6, -2));
      if (rnd() < 0.55) add1('vsign', place(vQuad((rnd() * 8) | 0).rotateY(PI / 2), cx, cz, ry, w / 2 - 0.5, gh + 1.7, d / 2 + 0.35));
    } else {                                                                // single storey: tiled gable roof
      const roof = pick(['#3d4350', '#5a3a30', '#2f4a45']);
      for (const s of [-1, 1]) add1('solid', place(B(w + 0.3, 0.22, d / 2 + 0.9, 0, 0, 0, roof).rotateX(s * 0.38), cx, cz, ry, 0, gh + 1.05, s * (d / 4 + 0.1)));
      add1('solid', place(B(w + 0.4, 0.28, 0.5, 0, 0, 0, '#23272e'), cx, cz, ry, 0, gh + 2.05, 0));
    }
    if (kind !== 'bank' && kind !== 'mart') add1('solid', place(B(w - 0.7, 0.09, 1.5, 0, 0, 0, kind === 'food' ? '#2a2018' : pick(AWN)).rotateX(0.3), cx, cz, ry, 0, 3.05, d / 2 + 0.7));
    if (kind === 'food') for (const lx of [-w / 2 + 0.8, -w / 2 + 1.7, w / 2 - 1.7, w / 2 - 0.8]) { const [x, z] = at(cx, cz, ry, lx, d / 2 + 1.15); I.lantern.push({ x, y: H + 2.55, z, ry }); }
    if (kind === 'cafe') for (const lx of [-w / 4, w / 4]) { const [x, z] = at(cx, cz, ry, lx, d / 2 + 2.1); prop(I.table, x, z, ry, 0.4); I.umbrella.push({ x, y: H + 0.05, z, ry: R(0, 6), c: pick([0xd8433b, 0xf2efe6, 0x2f7d6b, 0xe9a32f]) });
      for (const s of [-1, 1]) { const [px, pz] = at(x, z, ry, s * 0.75, 0); I.chair.push({ x: px, y: H + 0.05, z: pz, ry: ry + s * PI / 2 }); } }
    solidRect(cx, cz, w, d, ry);
  }
  // a row of shops along one side of a rectangle, facing outwards ('n' = the -z side, 's' = +z, 'w' = -x, 'e' = +x)
  function edge(x0, z0, x1, z1, side, types, minF = 0, maxF = 3) {
    const ry = { n: PI, s: 0, w: -PI / 2, e: PI / 2 }[side], horizontal = side === 'n' || side === 's';
    let p = horizontal ? x0 : z0 + 11; const end = horizontal ? x1 : z1 - 11; let last = -1;
    while (p < end - 7) {
      let w = Math.round(R(8, 12.5) * 2) / 2; if (end - p - w < 8) w = Math.min(14, end - p);
      let type = pick(types); if (type === last) type = pick(types); last = type;
      const back = SHOPS[type][4] === 'cafe' ? 8 : 5;                       // cafes are set back to leave room for their terrace
      const cx = horizontal ? p + w / 2 : side === 'w' ? x0 + back : x1 - back, cz = horizontal ? (side === 'n' ? z0 + back : z1 - back) : p + w / 2;
      shop(cx, cz, ry, w - 0.2, type, minF + ((rnd() * (maxF - minF + 1)) | 0));
      p += w;
      if (rnd() < 0.16 && p < end - 12) {                                   // an alley with vending machines
        const mx = horizontal ? p + 1.2 : side === 'w' ? x0 + 1.5 : x1 - 1.5, mz = horizontal ? (side === 'n' ? z0 + 1.5 : z1 - 1.5) : p + 1.2, [ax, az] = at(mx, mz, ry, -0.55, 0), [bx, bz] = at(mx, mz, ry, 0.55, 0);
        prop(I.vendR, ax, az, ry, 0.55); prop(I.vendB, bx, bz, ry, 0.55); p += 2.6; }
    }
  }

  // ---------------------------------------------------------------- towers: shop base, tiers, balconies on homes, rooftop gear
  const lots = [];
  const GLASS = ['#8fb9d8', '#7aa6c4', '#93c9cf', '#8497ad', '#6f8aa6', '#a7c3d6'];
  function tower(cx, cz, w, d, floors, kind) {
    const tint = pick(kind === 'glass' ? GLASS : WALLS), pod = 4.6, add1 = (mat, g) => add(mat, cx, cz, g); c.solidBox(cx, cz, w / 2 + 1, d / 2 + 1);
    add1('solid', B(w + 1.9, pod, d + 1.9, cx, H + pod / 2, cz, '#cfcac0'));
    for (const [ry, len, off] of [[0, w + 2, d / 2 + 1], [PI, w + 2, d / 2 + 1], [PI / 2, d + 2, w / 2 + 1], [-PI / 2, d + 2, w / 2 + 1]]) { const n = Math.max(1, Math.round(len / 10)); for (let i = 0; i < n; i++) add1('shop', place(atlasQuad(pick(ANY), len / n - 0.15, pod - 0.1), cx, cz, ry, -len / 2 + (i + 0.5) * len / n, pod / 2, off)); }
    add1('solid', B(w + 3, 0.5, d + 3, cx, H + pod + 0.25, cz, '#80858e'));
    let yb = pod + 0.5, tw = w, td = d; const tiers = floors > 16 ? [[0.55, 1], [0.27, 0.76], [0.18, 0.5]] : floors > 8 ? [[0.7, 1], [0.3, 0.72]] : [[1, 1]];
    for (const [fr, sc] of tiers) {
      const f = Math.max(2, Math.round(floors * fr)), h = f * 4; tw = snap4(w * sc); td = snap4(d * sc);
      add1(kind === 'glass' ? 'glass' : 'apt', boxFaces(tw, h, td, [0, 1, 4, 5], 1 / 16, tint).translate(cx, H + yb + h / 2, cz));
      if (kind === 'glass') { for (let i = 0; i <= 1; i++) for (let j = 0; j <= 1; j++) add1('solid', B(0.5, h, 0.5, cx + (i - 0.5) * tw, H + yb + h / 2, cz + (j - 0.5) * td, '#c9d2da')); }
      else for (let level = 0; level < f; level++) for (const s of [-1, 1]) for (let x = -tw / 2 + 2; x <= tw / 2 - 2; x += 4) I.balcony.push({ x: cx + x, y: H + yb + level * 4 + 0.5, z: cz + s * td / 2, ry: s > 0 ? 0 : PI });
      add1('solid', B(tw + 0.9, 0.8, td + 0.9, cx, H + yb + h + 0.4, cz, kind === 'glass' ? '#4f5a66' : '#6b6f76')); yb += h + 0.8;
    }
    for (let i = 0, n = 2 + ((rnd() * 3) | 0); i < n; i++) add1('solid', B(R(1.6, 3), R(1, 1.8), R(1.4, 2.6), cx + R(-tw / 2 + 2.5, tw / 2 - 2.5), H + yb + 0.7, cz + R(-td / 2 + 2.5, td / 2 - 2.5), '#a2a8ae'));
    if (floors >= 10) { add1('solid', B(0.18, 7 + floors * 0.25, 0.18, cx + tw * 0.2, H + yb + 3.5 + floors * 0.12, cz, '#bcc2c9')); add1('solid', B(0.5, 0.5, 0.5, cx + tw * 0.2, H + yb + 7 + floors * 0.25, cz, '#ff3b30')); }
    if (floors >= 22) { add1('solid', CYL(Math.min(tw, td) / 2.6, Math.min(tw, td) / 2.6, 0.2, 20, cx - tw * 0.1, H + yb + 0.1, cz, '#3a3f46')); add1('solid', B(0.6, 0.05, 4, cx - tw * 0.1, H + yb + 0.23, cz, '#ffffff')); }
    lots.push({ cx, cz, w, d, h: yb, y: H });
  }
  // fill a rectangle with towers on a loose grid
  function towers(x0, z0, x1, z1, minF, maxF, glassShare) {
    const nx = Math.max(1, Math.floor((x1 - x0) / 48)), nz = Math.max(1, Math.floor((z1 - z0) / 48)), sx = (x1 - x0) / nx, sz = (z1 - z0) / nz;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const w = snap4(Math.min(sx - 14, R(20, 34))), d = snap4(Math.min(sz - 14, R(20, 34))), cx = x0 + (i + 0.5) * sx, cz = z0 + (j + 0.5) * sz;
      tower(cx, cz, w, d, Math.round(R(minF, maxF)), rnd() < glassShare ? 'glass' : 'apt');
      if (rnd() < 0.6) tree(cx - sx / 2 + 3, cz - sz / 2 + 3);
    }
  }
  // car park with painted bays, parked cars and a few trees
  function carPark(x0, z0, x1, z1, fill = 0.55) {
    flatRect('lot', x0, z0, x1, z1, 0.05, '#ffffff', 8);
    for (let z = z0 + 4; z <= z1 - 4; z += 14) for (let x = x0 + 3; x <= x1 - 3; x += 3.1) {
      I.bay.push({ x: x - 1.55, y: H + 0.09, z, ry: 0 }); if (rnd() < fill) parkCar(x, z, rnd() < 0.5 ? 0 : PI);
    }
    for (let x = x0 + 8; x < x1 - 6; x += 26) for (const z of [z0 + 0.8, z1 - 0.8]) { tree(x, z, 0.42); prop(I.planter, x + 4, z, 0, 0.5); }
  }

  // ---------------------------------------------------------------- the big buildings
  function mall(x0, z0, x1, z1, name) {
    const cx = (x0 + x1) / 2, w = x1 - x0 - 16, d = 40, cz = z0 + 6 + d / 2, h = 17, front = cz + d / 2, add1 = (mat, g) => add(mat, cx, cz, g);
    add1('solid', B(w, h, d, cx, H + h / 2, cz, '#ece6da')); solidRect(cx, cz, w, d, 0);
    for (const [y, th, col] of [[5.1, 0.7, '#b08a5a'], [10.8, 0.45, '#c9c2b4'], [h + 0.5, 1, '#8a8f98']]) add1('solid', B(w + 0.8, th, d + 0.8, cx, H + y, cz, col));
    for (const [ry, len, off] of [[0, w, d / 2], [PI, w, d / 2], [PI / 2, d, w / 2], [-PI / 2, d, w / 2]]) {      // shops all round, glazing above
      const n = Math.round(len / 10); for (let i = 0; i < n; i++) { const lx = -len / 2 + (i + 0.5) * len / n; if (ry === 0 && Math.abs(lx) < 25) continue; add1('shop', place(atlasQuad(pick([8, 9, 7, 10, 3, 4, 13, 6]), len / n - 0.5, 4.6), cx, cz, ry, lx, 2.35, off + 0.05)); }
      for (const y of [8, 13.7]) add1('glass', place(boxFaces(len - 6, 4, 0.1, [4], 1 / 16, '#bcd6e8'), cx, cz, ry, 0, y, off + 0.03)); }
    // entrance atrium
    add1('glass', boxFaces(46, 20, 9, [0, 1, 4], 1 / 16, '#a8d4ee').translate(cx, H + 10, front + 4.5)); add1('solid', B(48, 0.8, 10.5, cx, H + 20.4, front + 4.5, '#e8ecef')); c.solidBox(cx, front + 4.5, 23, 4.5);
    add1('solid', B(52, 0.35, 6, cx, H + 5, front + 11, '#d64545')); for (const x of [-24, -12, 0, 12, 24]) { add1('solid', CYL(0.18, 0.18, 5, 8, cx + x, H + 2.5, front + 13.5, '#d9dde1')); c.solidAdd(cx + x, front + 13.5, 0.25); }
    add1('shop', atlasQuad(3, 11, 4.4).translate(cx - 16, H + 2.3, front + 9.05)); add1('shop', atlasQuad(8, 11, 4.4).translate(cx + 16, H + 2.3, front + 9.05));
    add1('solid', B(12, 4.4, 0.2, cx, H + 2.2, front + 9.02, '#35546b')); for (const x of [-4, 0, 4]) add1('solid', B(0.18, 4.4, 0.1, cx + x, H + 2.2, front + 9.17, '#dfe4e8'));
    const tone = ['#b3243c', '#1f4f96', '#7b2d8b', '#1f6f50', '#c8641e'][name.length % 5];
    bigSign(cx, 22.6, front + 9.2, 0, 40, 4.2, name, 'SHOPPING MALL', tone, '#ffffff');
    bigSign(x1 - 8 + 0.1, 12, cz, PI / 2, 26, 3.4, name, null, tone, '#ffffff'); bigSign(x0 + 8 - 0.1, 12, cz, -PI / 2, 26, 3.4, name, null, tone, '#ffffff');
    bigSign(cx, 12, z0 + 6 - 0.15, PI, 36, 3.6, name, 'FASHION · FOOD · CINEMA', tone, '#ffffff');
    for (let i = 0; i < 22; i++) add1('solid', B(R(3, 7), R(1, 2.2), R(3, 6), cx + R(-w / 2 + 6, w / 2 - 6), H + h + 1.6, cz + R(-d / 2 + 5, d / 2 - 5), pick(['#b4bac0', '#9aa1a8', '#c9ced3'])));
    // forecourt with fountain, then the car park
    flatRect('pave', x0, front, x1, front + 24, 0.07, '#e9e4da');
    add1('solid', CYL(5, 5.4, 0.8, 24, cx, H + 0.4, front + 20, '#cfc8b8')); add('water', cx, front + 20, CYL(4.5, 4.5, 0.1, 24, cx, H + 0.82, front + 20, '#ffffff')); add1('solid', CYL(0.5, 0.8, 2.4, 10, cx, H + 1.6, front + 20, '#cfc8b8')); c.solidAdd(cx, front + 20, 5.2);
    for (let x = x0 + 10; x <= x1 - 10; x += 22) { if (Math.abs(x - cx) < 12) continue; tree(x, front + 17, 0.5, true); prop(I.bench, x + 5, front + 19, 0, 0.8); }
    carPark(x0 + 4, front + 28, x1 - 4, z1 - 2, 0.6);
    bigSign(x0 + 14, 7, z1 - 2, 0, 9, 3, 'P', 'MALL PARKING', '#1565c0', '#ffffff'); add1('solid', B(0.3, 5.5, 0.3, x0 + 14, H + 2.75, z1 - 2.2, '#8a9199')); c.solidAdd(x0 + 14, z1 - 2.2, 0.25);
  }
  function gasStation(cx, cz) {                                             // canopy faces +z
    const add1 = (mat, g) => add(mat, cx, cz, g);
    flatRect('lot', cx - 22, cz - 12, cx + 22, cz + 18, 0.06, '#d8d8d8', 8);
    for (const [x, z] of [[-11, -5], [11, -5], [-11, 7], [11, 7]]) { add1('solid', B(0.55, 5.4, 0.55, cx + x, H + 2.7, cz + z, '#eef0f2')); c.solidAdd(cx + x, cz + z, 0.4); }
    add1('solid', B(28, 0.5, 17, cx, H + 5.65, cz + 1, '#f4f5f7')); add1('solid', B(28.3, 0.55, 17.3, cx, H + 6.1, cz + 1, '#d92d27'));
    for (const x of [-6, 6]) { add1('solid', B(1.6, 0.25, 8, cx + x, H + 0.18, cz + 1, '#c9ccd0'));
      for (const z of [-1.5, 3.5]) { add1('solid', B(0.75, 1.7, 0.55, cx + x, H + 1.1, cz + z, '#e8eaed')); add1('solid', B(0.8, 0.45, 0.6, cx + x, H + 1.75, cz + z, '#d92d27')); add1('solid', B(0.5, 0.3, 0.58, cx + x, H + 1.35, cz + z, '#24303c')); c.solidAdd(cx + x, cz + z, 0.5); } }
    bigSign(cx, 6.1, cz + 9.75, 0, 12, 0.9, 'DRIVE OIL', null, '#d92d27', '#ffffff');
    add1('solid', B(0.5, 9, 0.5, cx - 20, H + 4.5, cz + 15, '#9aa0a8')); bigSign(cx - 20, 8, cz + 15.3, 0, 4.4, 3.4, 'DRIVE OIL', 'REG 168  HIGH 179', '#102a43', '#ffe14d'); c.solidAdd(cx - 20, cz + 15, 0.35);
    shop(cx + 4, cz - 19, 0, 14, 5, 0);                                     // station shop
  }
  function konbini(cx, cz) {                                                // faces +z, parking in front
    const add1 = (mat, g) => add(mat, cx, cz, g);
    add1('solid', B(22, 4.4, 11, cx, H + 2.2, cz - 0.1, '#f2f2ee')); add1('shop', atlasQuad(5, 10.9, 4.2).translate(cx - 5.5, H + 2.1, cz + 5.45)); add1('shop', atlasQuad(5, 10.9, 4.2).translate(cx + 5.5, H + 2.1, cz + 5.45));
    add1('solid', B(22.6, 0.7, 11.6, cx, H + 4.75, cz, '#e9ecef')); for (const [y, col] of [[4.6, '#ee7b22'], [4.85, '#1c9c4e']]) add1('solid', B(22.8, 0.2, 11.8, cx, H + y, cz, col));
    solidRect(cx, cz, 22, 11, 0); flatRect('lot', cx - 13, cz + 6, cx + 13, cz + 20, 0.06, '#d8d8d8', 8);
    for (let k = -3; k <= 3; k++) { I.bay.push({ x: cx + k * 3.1, y: H + 0.09, z: cz + 13, ry: 0 }); if (k < 3 && rnd() < 0.55) parkCar(cx + k * 3.1 + 1.55, cz + 13, PI); }
    for (const x of [-12.2, 12.2]) { prop(I.bin, cx + x, cz + 6.5, 0, 0.35); prop(I.vendB, cx + x, cz + 4, 0, 0.55); }
  }
  function supermarket(x0, z0, x1, z1) {                                    // building on the east side, car park on the west
    const d = 34, w = z1 - z0 - 30, cx = x1 - d / 2 - 3, cz = (z0 + z1) / 2, ry = -PI / 2, add1 = (mat, g) => add(mat, cx, cz, g);
    add1('solid', place(B(w, 9, d, 0, 0, 0, '#f0ede4'), cx, cz, ry, 0, 4.5, 0)); solidRect(cx, cz, w, d, ry);
    add1('solid', place(B(w + 0.6, 1.1, d + 0.6, 0, 0, 0, '#2e8b45'), cx, cz, ry, 0, 8.6, 0));
    const n = Math.round(w / 10); for (let i = 0; i < n; i++) add1('shop', place(atlasQuad(14, w / n - 0.2, 4.6), cx, cz, ry, -w / 2 + (i + 0.5) * w / n, 2.35, d / 2 + 0.05));
    add1('solid', place(B(w, 0.25, 3.4, 0, 0, 0, '#d6251f'), cx, cz, ry, 0, 4.9, d / 2 + 1.7));
    const [sx, sz] = at(cx, cz, ry, 0, d / 2 + 0.2); bigSign(sx, 7, sz, ry, 28, 2.6, 'SUPER FRESH', 'SUPERMARKET', '#ffffff', '#d6251f');
    carPark(x0 + 3, z0 + 6, x1 - d - 11, z1 - 6, 0.5);
    for (let z = cz - 24; z <= cz + 24; z += 3) prop(I.bollard, x1 - d - 7, z, 0, 0.18);
  }
  function cinema(cx, cz) {                                                 // faces -z (the avenue north of it)
    const add1 = (mat, g) => add(mat, cx, cz, g);
    add1('solid', B(54, 15, 30, cx, H + 7.5, cz, '#3a2d4d')); solidRect(cx, cz, 54, 30, 0); add1('solid', B(55, 1, 31, cx, H + 15.5, cz, '#211a2e'));
    for (let i = -2; i <= 2; i++) add1('shop', atlasQuad(i === 0 ? 13 : i % 2 ? 11 : 3, 10, 4.5).rotateY(PI).translate(cx + i * 10.5, H + 2.3, cz - 15.05));
    add1('solid', B(40, 0.8, 4, cx, H + 5.3, cz - 17, '#e8b53a')); for (let x = -19; x <= 19; x += 2) add1('solid', B(0.35, 0.25, 0.35, cx + x, H + 4.8, cz - 18.7, '#fff3b0'));
    bigSign(cx, 12.6, cz - 15.15, PI, 24, 3.8, 'CINEMA', '7 SCREENS', '#1a1026', '#ffd24d');
    ['NIGHT DRIFT', 'MOUNTAIN AIR', 'SKY CITY', 'LAST LAP'].forEach((t, i) => bigSign(cx - 19.5 + i * 13, 8.2, cz - 15.1, PI, 7, 4.6, t, 'NOW SHOWING', ['#7d1f2b', '#1f3f7d', '#17635a', '#6a4510'][i], '#ffffff'));
  }
  function showroom(cx, cz) {                                               // glass hall full of cars, faces -z
    const add1 = (mat, g) => add(mat, cx, cz, g);
    flatRect('pave', cx - 20, cz - 13, cx + 20, cz + 13, 0.1, '#f4f4f4', 3);
    add1('solid', B(42, 0.9, 28, cx, H + 6.9, cz, '#e9ecef')); add1('solid', B(40, 6.5, 0.6, cx, H + 3.25, cz + 13, '#c9ced4'));
    for (const x of [-20, -10, 0, 10, 20]) { add1('solid', B(0.4, 6.5, 0.4, cx + x, H + 3.25, cz - 13, '#8a9199')); }
    const pane = new THREE.Mesh(new THREE.BoxGeometry(40, 6.4, 26), mats.window); pane.position.set(cx, H + 3.25, cz); scene.add(pane); solidRect(cx, cz, 40, 26, 0);
    for (const x of [-13, 0, 13]) for (const z of [-5, 5]) I.car.push({ x: cx + x, y: H + 0.14, z: cz + z, ry: PI / 2 + R(-0.5, 0.5), c: pick([0x9d1f26, 0x1f4f96, 0xe8c33a, 0xf4f4f4]) });
    bigSign(cx, 8.6, cz - 14.1, PI, 22, 2.4, 'AUTO SHOWROOM', null, '#101418', '#ffffff');
  }
  function school(x0, z0, x1, z1) {                                         // classrooms along the north, sports yard below
    const cx = (x0 + x1) / 2, cz = z0 + 14, w = x1 - x0 - 14, add1 = (mat, g) => add(mat, cx, cz, g);
    add1('apt', boxFaces(w, 12.8, 14, [0, 1, 4, 5], 1 / 12.8, '#f6f1e4').translate(cx, H + 6.4, cz)); add1('solid', B(w + 0.6, 0.6, 14.6, cx, H + 13.1, cz, '#9a8f7c')); solidRect(cx, cz, w, 14, 0);
    add1('solid', B(12, 17, 15, cx, H + 8.5, cz, '#efe7d4')); add1('solid', CYL(2, 2, 0.2, 24, 0, 0, 0, '#ffffff').rotateX(PI / 2).translate(cx, H + 14, cz + 7.65)); add1('solid', B(0.18, 1.5, 0.1, cx, H + 14.6, cz + 7.8, '#222222')); add1('solid', B(1.1, 0.18, 0.1, cx + 0.5, H + 14, cz + 7.8, '#222222'));
    bigSign(cx, 4.2, cz + 7.65, 0, 9, 1.6, 'HARBOUR SCHOOL', null, '#ffffff', '#222222');
    flatRect('flat', x0 + 4, z0 + 26, x1 - 4, z1 - 4, 0.07, '#d6bf8e');
    for (const z of [z0 + 34, z1 - 12]) for (const [x, h, wd] of [[-3.5, 2.4, 0.15], [3.5, 2.4, 0.15]]) { add1('solid', B(wd, h, wd, cx + x, H + h / 2, z, '#ffffff')); add1('solid', B(7.15, 0.15, 0.15, cx, H + 2.4, z, '#ffffff')); c.solidAdd(cx + x, z, 0.2); }
    for (let z = z0 + 30; z < z1 - 8; z += 18) for (const x of [x0 + 7, x1 - 7]) tree(x, z, 0.55, true);
  }
  function park(x0, z0, x1, z1) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, add1 = (mat, g) => add(mat, cx, cz, g);
    flatRect('lawn', x0 + 1, z0 + 1, x1 - 1, z1 - 1, 0.08, '#ffffff', 6);
    flatRect('pave', cx - 2.2, z0 + 1, cx + 2.2, z1 - 1, 0.11, '#e8ddc8', 3); flatRect('pave', x0 + 1, cz - 2.2, x1 - 1, cz + 2.2, 0.11, '#e8ddc8', 3);
    const px = cx - 26, pz = cz - 24; add1('solid', CYL(13, 13.6, 0.35, 28, px, H + 0.12, pz, '#a39c8a')); add('water', px, pz, CYL(12, 12, 0.08, 28, px, H + 0.3, pz, '#ffffff'));
    for (const s of [-1, 1]) { add1('solid', B(1.1, 4.8, 1.1, cx + s * 3.4, H + 2.4, z1 - 5, '#d8d2c4')); c.solidAdd(cx + s * 3.4, z1 - 5, 0.7); }      // stone arch at the entrance
    add1('solid', B(8.2, 0.9, 1.2, cx, H + 5.2, z1 - 5, '#d8d2c4')); add1('solid', B(8.6, 0.25, 1.5, cx, H + 5.8, z1 - 5, '#8f4636'));
    for (let i = 0; i < 46; i++) { const x = R(x0 + 5, x1 - 5), z = R(z0 + 5, z1 - 5); if (Math.abs(x - cx) < 6 || Math.abs(z - cz) < 6 || Math.hypot(x - px, z - pz) < 17) continue; tree(x, z, R(0.5, 0.75), rnd() < 0.45); }
    for (const [x, z, ry] of [[cx + 4, cz - 14, -PI / 2], [cx - 4, cz + 14, PI / 2], [cx + 16, cz + 4, PI], [cx - 16, cz - 4, 0], [cx + 4, cz + 28, -PI / 2]]) prop(I.bench, x, z, ry, 0.8);
  }
  function shotengai(x0, z0, x1, z1) {                                      // shops all round + a walking street of restaurants down the middle
    const cx = (x0 + x1) / 2;
    edge(x0, z0, x1, z1, 'n', ANY, 1, 3); edge(x0, z0, x1, z1, 's', ANY, 1, 3); edge(x0, z0, x1, z1, 'w', ANY, 1, 3); edge(x0, z0, x1, z1, 'e', ANY, 1, 3);
    const in0 = z0 + 26, in1 = z1 - 26;
    flatRect('pave', cx - 7, z0 + 11, cx + 7, z1 - 11, 0.09, '#d9b9a0', 3);
    edge(cx - 17, in0 - 11, cx - 7, in1 + 11, 'e', [...FOOD, ...CAFES, 15], 0, 2); edge(cx + 7, in0 - 11, cx + 17, in1 + 11, 'w', [...FOOD, ...CAFES, 13], 0, 2);
    for (let z = in0; z <= in1; z += 16) { add('solid', cx, z, B(15, 0.05, 0.05, cx, H + 5.2, z, '#222222')); for (let x = -5; x <= 5; x += 2) I.lantern.push({ x: cx + x, y: H + 4.7, z, ry: 0 }); }
    for (const z of [z0 + 13, z1 - 13]) bigSign(cx, 7.2, z, z < (z0 + z1) / 2 ? PI : 0, 15, 2.2, 'OLD MARKET', 'SHOPPING STREET', '#b3221c', '#ffffff');
    for (const [x0b, x1b] of [[x0 + 22, cx - 34], [cx + 34, x1 - 22]]) if (x1b - x0b > 24) towers(x0b, z0 + 34, x1b, z1 - 34, 4, 8, 0.2);
  }

  // ---------------------------------------------------------------- lots: what ground is free
  const occ = new Set(), CELL4 = 4, key4 = (i, j) => i * 8192 + j;
  // points of a turned rectangle, every ~4 m
  function footprint(cx, cz, w, d, ry, fn) {
    const nx = Math.max(1, Math.ceil(w / 3.5)), nz = Math.max(1, Math.ceil(d / 3.5));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) { const [x, z] = at(cx, cz, ry, -w / 2 + w * i / nx, -d / 2 + d * j / nz); if (fn(x, z) === false) return false; }
    return true;
  }
  const taken = (x, z) => occ.has(key4(Math.floor(x / CELL4), Math.floor(z / CELL4)));
  const reserve = (cx, cz, w, d, ry = 0) => footprint(cx, cz, w, d, ry, (x, z) => { occ.add(key4(Math.floor(x / CELL4), Math.floor(z / CELL4))); });
  // is the lot free? if so sets H to its ground height, marks it and returns true
  function claim(cx, cz, w, d, ry = 0, spread = 1.8, road = 9.2) {
    let lo = 1e9, hi = -1e9;
    if (!footprint(cx, cz, w, d, ry, (x, z) => { if (taken(x, z) || W.anyRoadDist(x, z, 14) < road || W.carve(x, z) > 0.15 || W.pavedAt(x, z)) return false; const h = W.terrainH(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); if (hi - lo > spread) return false; })) return false;
    H = lo + (hi - lo) * 0.5; reserve(cx, cz, w, d, ry); return true;
  }
  // nearest free axis-aligned lot to a wanted spot
  function findLot(px, pz, w, d, spread = 2.6, reach = 260) {
    for (let r = 0; r <= reach; r += 12) for (let a = 0; a < 6.28; a += r ? 12 / r : 7) { const x = Math.round(px + r * Math.cos(a)), z = Math.round(pz + r * Math.sin(a)); if (claim(x, z, w, d, 0, spread, 10.5)) return [x, z]; }
    return null;
  }
  for (const g of W.GARAGES) reserve(g.cx, g.cz, 56, 56);
  for (const p of W.PADS) reserve(p.x, p.z, p.r * 2 + 8, p.r * 2 + 8);
  reserve(W.PLAZA.x, W.PLAZA.z, W.PLAZA.r * 2 + 6, W.PLAZA.r * 2 + 6);
  reserve((W.AIRFIELD.x0 + W.AIRFIELD.x1) / 2, (W.AIRFIELD.z0 + W.AIRFIELD.z1) / 2, W.AIRFIELD.x1 - W.AIRFIELD.x0, W.AIRFIELD.z1 - W.AIRFIELD.z0);

  const flatAt = (x, z, w, d, y, col, mat = 'flat') => add(mat, x, z, boxFaces(w, 0.1, d, [2], 1 / 8, col).translate(x, y, z));
  // paving that follows the ground: tiles of 10 m
  function pad(x0, z0, x1, z1, mat, col) {
    const nx = Math.ceil((x1 - x0) / 10), nz = Math.ceil((z1 - z0) / 10), w = (x1 - x0) / nx, d = (z1 - z0) / nz;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const x = x0 + (i + 0.5) * w, z = z0 + (j + 0.5) * d; if (W.anyRoadDist(x, z, 12) < 10 || W.carve(x, z) > 0.1) continue; flatAt(x, z, w, d, W.terrainH(x, z) + 0.02, col, mat); }
  }

  // ---------------------------------------------------------------- malls first: they need the most room
  for (const m of W.MALLS) {
    const x0 = m.x - W.MALL_W / 2, x1 = m.x + W.MALL_W / 2, z0 = m.z - W.MALL_D / 2 + 4, z1 = m.z + W.MALL_D / 2;
    let hi = -1e9, lo = 1e9; for (let x = x0; x <= x1; x += 8) for (let z = z0; z <= z1; z += 8) { const h = W.terrainH(x, z); hi = Math.max(hi, h); lo = Math.min(lo, h); }
    H = (hi + lo) / 2; reserve(m.x, (z0 + z1) / 2, x1 - x0, z1 - z0);
    mall(x0, z0, x1, z1, m.name.toUpperCase());
  }

  // ---------------------------------------------------------------- roundabout centres
  Object.entries(W.ROUNDABOUTS).forEach(([name, [x, z, r]]) => {
    H = W.terrainH(x, z); reserve(x, z, (r - 6) * 1.6, (r - 6) * 1.6);
    const add1 = (mat, g) => add(mat, x, z, g), R1 = Math.max(7, r * 0.22);
    add1('lawn', paint(new THREE.CircleGeometry(r - 8, 32).rotateX(-PI / 2).translate(x, H + 0.12, z), '#ffffff'));
    add1('solid', CYL(R1, R1 + 0.6, 1, 28, x, H + 0.5, z, '#d6cfbd')); add('water', x, z, CYL(R1 - 0.7, R1 - 0.7, 0.12, 28, x, H + 1.03, z, '#ffffff'));
    if (name === 'central' || name === 'strip') { add1('solid', CYL(1.1, 2.2, 34, 4, x, H + 17, z, '#e8e2d2')); add1('solid', CYL(0.01, 1.2, 4, 4, x, H + 36, z, '#e0b43a')); }
    else { add1('solid', CYL(0.9, 1.4, 6, 10, x, H + 3.5, z, '#cfc8b8')); add1('solid', paint(new THREE.IcosahedronGeometry(2.2, 0).translate(x, H + 8, z), name === 'port' ? '#2f6d8f' : '#c8663a')); }
    c.solidAdd(x, z, R1 + 0.7);
    for (let a = 0; a < 6.28; a += PI / 6) (name === 'resort' ? I.palm : I.sakura).push({ x: x + Math.cos(a) * (r - 14), y: H, z: z + Math.sin(a) * (r - 14), ry: a, sx: 0.6 });
  });

  // ---------------------------------------------------------------- attractions
  const spot = id => W.SPOTS.find(s => s.id === id);
  const ground = s => { H = W.terrainH(s.x, s.z); reserve(s.x, s.z, s.r * 1.5, s.r * 1.5); return [s.x, s.z, (mat, g) => add(mat, s.x, s.z, g)]; };
  { const [x, z, a1] = ground(spot('park'));                   // fun park: ferris wheel, carousel, tents
    const wheel = (g, col) => a1('solid', paint(g.translate(x, H + 30, z), col));
    wheel(new THREE.TorusGeometry(25, 0.5, 8, 48), '#ff4fa0'); wheel(new THREE.TorusGeometry(17, 0.3, 8, 40), '#ffd23f');
    for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; a1('solid', paint(new THREE.BoxGeometry(0.3, 25, 0.3).translate(0, 12.5, 0).rotateZ(a).translate(x, H + 30, z), '#f4f4f4'));
      a1('solid', B(3.2, 2.6, 2.6, x - Math.sin(a) * 25, H + 30 + Math.cos(a) * 25 - 1.6, z, ['#e63946', '#2a9d8f', '#f4a261', '#457b9d'][i % 4])); }
    for (const s of [-1, 1]) for (const k of [-1, 1]) { a1('solid', paint(new THREE.BoxGeometry(0.9, 33, 0.9).translate(0, 16.5, 0).rotateZ(k * 0.36).translate(x + k * 11.6, H, z + s * 2.4), '#9aa0a8')); c.solidAdd(x + k * 11.6, z + s * 2.4, 0.8); }
    for (const [dx, dz, col] of [[-45, 25, '#e63946'], [-45, -25, '#2a9d8f'], [45, 28, '#f4a261'], [45, -25, '#7b2d8b'], [0, 45, '#457b9d']]) { a1('solid', CYL(6.5, 6.5, 3, 12, x + dx, H + 1.5, z + dz, '#f4ead2')); a1('solid', CYL(0.2, 8, 5, 12, x + dx, H + 5.5, z + dz, col)); c.solidAdd(x + dx, z + dz, 6.5); }
    bigSign(x, 6, z + 62, 0, 30, 5, 'FUN PARK', 'OPEN EVERY DAY', '#7b2d8b', '#fff06a'); }
  { const [x, z, a1] = ground(spot('stadium'));                // stadium: pitch, stands, floodlights
    a1('lawn', paint(new THREE.CircleGeometry(48, 40).rotateX(-PI / 2).scale(1.4, 1, 0.9).translate(x, H + 0.1, z), '#9be07a'));
    for (let i = 0; i < 40; i++) { const a = i / 40 * PI * 2; if (i % 20 < 2) continue; const px = x + Math.cos(a) * 80, pz = z + Math.sin(a) * 56, ry = Math.atan2(-Math.cos(a) * 56, -Math.sin(a) * 80);
      for (let k = 0; k < 4; k++) { const [sx, sz] = at(px, pz, ry, 0, -k * 3); a1('solid', B(12, 2.4 + k * 2.4, 3, 0, 0, 0, k % 2 ? '#d9dde1' : '#2f6d8f').rotateY(ry).translate(sx, H + 1.2 + k * 1.2, sz)); }
      c.solidAdd(px, pz, 6); }
    for (const [dx, dz] of [[-88, -62], [88, -62], [-88, 62], [88, 62]]) { a1('solid', B(1.2, 34, 1.2, x + dx, H + 17, z + dz, '#9aa0a8')); a1('solid', B(7, 3.5, 1.2, x + dx, H + 35, z + dz, '#fff6c4')); c.solidAdd(x + dx, z + dz, 0.9); }
    bigSign(x, 14, z + 70, 0, 34, 4.5, 'CITY STADIUM', null, '#101418', '#ffffff'); }
  { const [x, z, a1] = ground(spot('turbines'));               // wind turbines
    for (const [dx, dz] of [[-70, -20], [0, 30], [70, -35], [30, -75], [-35, 70]]) { H = W.terrainH(x + dx, z + dz);
      a1('solid', CYL(0.9, 1.9, 52, 12, x + dx, H + 26, z + dz, '#f4f5f7')); a1('solid', B(2.4, 2.4, 6, x + dx, H + 52.5, z + dz, '#e9ecef'));
      for (let k = 0; k < 3; k++) a1('solid', paint(new THREE.BoxGeometry(1.7, 24, 0.25).translate(0, 12, 0).rotateZ(k * PI * 2 / 3 + dx).translate(x + dx, H + 52.5, z + dz + 3.3), '#ffffff'));
      c.solidAdd(x + dx, z + dz, 1.9); } }
  { const [x, z, a1] = ground(spot('quarry'));                 // quarry: stone piles, a crane, trucks
    for (let i = 0; i < 26; i++) { const px = x + R(-55, 55), pz = z + R(-55, 55), r = R(3, 9); if (W.anyRoadDist(px, pz, 20) < r + 9) continue; H = W.terrainH(px, pz); a1('solid', paint(new THREE.ConeGeometry(r, r * 0.8, 7).translate(px, H + r * 0.4, pz), pick(['#9a938a', '#b3a690', '#7f7a73']))); c.solidAdd(px, pz, r * 0.8); }
    H = W.terrainH(x, z); a1('solid', B(2, 28, 2, x, H + 14, z, '#e8b53a')); a1('solid', B(30, 1.4, 1.4, x + 9, H + 28, z, '#e8b53a')); a1('solid', B(0.15, 12, 0.15, x + 22, H + 22, z, '#222222')); c.solidAdd(x, z, 1.6); }
  { const [x, z, a1] = ground(spot('barns'));                  // big farm: red barns, silos, bales
    for (const [dx, dz] of [[-30, -18], [5, -22], [-18, 20]]) { a1('solid', B(20, 8, 13, x + dx, H + 4, z + dz, '#a8442f')); for (const s of [-1, 1]) a1('solid', B(21, 0.4, 8.4, 0, 0, 0, '#3d2a1c').rotateX(s * 0.62).translate(x + dx, H + 10, z + dz + s * 3.3)); a1('solid', B(5, 5, 0.2, x + dx, H + 2.5, z + dz + 6.6, '#f4f4f0')); c.solidBox(x + dx, z + dz, 10, 6.5); }
    for (const [dx, dz] of [[30, -10], [38, 4], [28, 18]]) { a1('solid', CYL(5, 5, 18, 16, x + dx, H + 9, z + dz, '#d9d4c6')); a1('solid', CYL(0.1, 5.2, 4, 16, x + dx, H + 20, z + dz, '#8a9199')); c.solidAdd(x + dx, z + dz, 5); }
    for (let i = 0; i < 18; i++) { const px = x + R(-40, 40), pz = z + R(34, 48); a1('solid', CYL(1.1, 1.1, 1.8, 12, 0, 0, 0, '#d8b455').rotateZ(PI / 2).translate(px, H + 1.1, pz)); c.solidAdd(px, pz, 1.1); } }
  { const [x, z, a1] = ground(spot('lighthouse'));
    a1('solid', CYL(3, 4.6, 30, 16, x, H + 15, z, '#f4f4f0')); for (const h of [7, 17]) a1('solid', CYL(4.3 - h * 0.053, 4.36 - h * 0.05, 4, 16, x, H + h, z, '#d2362a')); a1('solid', CYL(4, 4, 0.6, 16, x, H + 30.3, z, '#23262b')); a1('solid', CYL(2.2, 2.2, 3.4, 12, x, H + 32.2, z, '#ffe9a8')); a1('solid', CYL(0.1, 3, 3, 16, x, H + 35.4, z, '#d2362a')); c.solidAdd(x, z, 4.6); }
  { const [x, z, a1] = ground(spot('castle'));                 // castle: walls with four towers, a keep
    for (const [dx, dz, w, d] of [[0, -30, 60, 3.5], [0, 30, 60, 3.5], [-30, 0, 3.5, 60], [30, 0, 3.5, 60]]) { a1('solid', B(w, 12, d, x + dx, H + 5, z + dz, '#a59f94')); c.solidBox(x + dx, z + dz, w / 2, d / 2); for (let k = -26; k <= 26; k += 5) a1('solid', B(2.4, 1.6, 2.4, x + dx + (w > d ? k : 0), H + 11.8, z + dz + (w > d ? 0 : k), '#a59f94')); }
    for (const dx of [-30, 30]) for (const dz of [-30, 30]) { a1('solid', CYL(6, 6.6, 22, 14, x + dx, H + 10, z + dz, '#b3ada1')); a1('solid', CYL(0.2, 7.4, 10, 14, x + dx, H + 26, z + dz, '#8f4636')); c.solidAdd(x + dx, z + dz, 6.6); }
    a1('solid', B(24, 24, 20, x, H + 11, z, '#b9b3a6')); a1('solid', CYL(0.2, 17, 12, 4, 0, 0, 0, '#8f4636').rotateY(PI / 4).translate(x, H + 29, z)); a1('solid', B(7, 8, 0.4, x, H + 4, z + 31.9, '#4a3020')); c.solidBox(x, z, 12, 10); }
  { const [x, z, a1] = ground(spot('oasis'));                  // oasis: a pool ringed by palms, tents
    add('water', x, z, CYL(26, 26, 0.14, 32, x, H + 0.12, z, '#ffffff')); a1('solid', CYL(28, 29, 0.16, 32, x, H + 0.02, z, '#7fb05a'));
    for (let i = 0; i < 46; i++) { const a = R(0, 6.28), r = R(28, 50), px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (W.anyRoadDist(px, pz, 14) < 10) continue; I.palm.push({ x: px, y: W.terrainH(px, pz) - 0.2, z: pz, ry: a, sx: R(0.8, 1.3) }); c.solidAdd(px, pz, 0.35); }
    for (const [dx, dz, col] of [[-48, 18, '#d6322c'], [44, 30, '#2160c4'], [30, -48, '#e8b53a']]) { a1('solid', CYL(0.2, 5, 4, 4, x + dx, H + 2, z + dz, col)); c.solidAdd(x + dx, z + dz, 3.4); } }
  { const [x, z, a1] = ground(spot('golf'));                   // golf: greens with flags, clubhouse
    pad(x - 70, z - 70, x + 70, z + 70, 'lawn', '#d6ffb0');
    for (let i = 0; i < 9; i++) { const px = x + R(-60, 60), pz = z + R(-60, 40); if (W.anyRoadDist(px, pz, 14) < 12) continue; const h = W.terrainH(px, pz); a1('solid', CYL(5, 5, 0.1, 18, px, h + 0.12, pz, '#8fd45f')); a1('solid', B(0.12, 2.6, 0.12, px, h + 1.3, pz, '#eeeeee')); a1('solid', B(1.1, 0.7, 0.05, px + 0.6, h + 2.3, pz, '#e63946')); }
    H = W.terrainH(x, z + 55); shop(x, z + 55, 0, 22, 3, 1); bigSign(x, 8, z + 61, 0, 14, 2.2, 'GOLF CLUB', null, '#1f6f50', '#ffffff'); }
  { const [x, z, a1] = ground(spot('central'));                // the middle of the city already has its roundabout monument
    void x; void z; void a1; }
  { const s = spot('pier'); let edgeX = s.x; while (W.seaward(edgeX, s.z) > -3 && edgeX < s.x + 160) edgeX += 4; while (W.seaward(edgeX, s.z) < -3 && edgeX > s.x - 160) edgeX -= 4;
    const len = 90, deckY = 2.2; H = 0;
    add('solid', edgeX, s.z, B(len + 14, 0.4, 7, edgeX - len / 2 + 7, deckY, s.z, '#c8a070')); add('solid', edgeX, s.z, B(18, 0.4, 20, edgeX - len, deckY, s.z, '#c8a070'));
    for (let k = 0; k <= len; k += 9) for (const side of [-1, 1]) add('solid', edgeX, s.z, CYL(0.28, 0.28, 9, 6, edgeX - k, deckY - 4.4, s.z + side * 3, '#6b4a2b'));
    add('solid', edgeX, s.z, B(8, 4, 8, edgeX - len, deckY + 2.2, s.z, '#ff8a65')); add('solid', edgeX, s.z, CYL(0.2, 6.5, 3, 4, edgeX - len, deckY + 5.7, s.z, '#2f3338')); }

  // ---------------------------------------------------------------- the airfield: hangars, planes, a control tower
  { H = W.ground(2000, 2295);
    flatAt((W.AIRFIELD.x0 + W.AIRFIELD.x1) / 2, (W.AIRFIELD.z0 + W.AIRFIELD.z1) / 2, W.AIRFIELD.x1 - W.AIRFIELD.x0, W.AIRFIELD.z1 - W.AIRFIELD.z0, H + 0.03, '#6a6d73');
    for (let x = W.AIRFIELD.x0 + 20; x < W.AIRFIELD.x1 - 20; x += 40) flatAt(x, 2295, 18, 0.9, H + 0.1, '#f4f4f0');
    for (let x = 1700; x <= 2300; x += 150) { if (!claim(x, 2215, 46, 30, 0, 4, 10)) continue; add('solid', x, 2215, CYL(15, 15, 44, 18, 0, 0, 0, '#c9ced4').rotateZ(PI / 2).translate(x, H, 2215)); add('solid', x, 2215, B(30, 8, 0.4, x, H + 4, 2230.3, '#4a4f57')); c.solidBox(x, 2215, 22, 15); }
    H = W.ground(2000, 2330);
    const plane = (px, pz, col) => { const a1 = (g) => add('solid', px, pz, g); a1(CYL(1.5, 1.5, 17, 10, 0, 0, 0, '#f4f5f7').rotateZ(PI / 2).translate(px, H + 2.6, pz)); a1(B(3.4, 0.3, 22, px, H + 2.4, pz, col)); a1(B(2, 4, 0.3, px - 7.6, H + 4.6, pz, col)); a1(B(2, 0.25, 8, px - 7.6, H + 3, pz, col)); a1(CYL(0.01, 1.5, 3, 10, 0, 0, 0, '#f4f5f7').rotateZ(-PI / 2).translate(px + 10, H + 2.6, pz)); c.solidBox(px, pz, 9, 1.6); c.solidBox(px, pz, 1.7, 11); };
    plane(1750, 2300, '#d6322c'); plane(2150, 2308, '#2160c4');
    if (claim(2400, 2220, 12, 12, 0, 4, 10)) { add('solid', 2400, 2220, CYL(3, 3.6, 22, 12, 2400, H + 11, 2220, '#d9dde1')); add('glass', 2400, 2220, boxFaces(10, 5, 10, [0, 1, 4, 5], 1 / 16, '#a8d4ee').translate(2400, H + 24.5, 2220)); add('solid', 2400, 2220, B(11, 0.8, 11, 2400, H + 27.4, 2220, '#8a9199')); c.solidAdd(2400, 2220, 3.6); } }

  // ---------------------------------------------------------------- one-off big places
  const once = (px, pz, w, d, fn) => { const p = findLot(px, pz, w, d); if (p) fn(...p); };
  for (const [x, z] of [[-90, -560], [820, -40], [-860, 640], [330, 1000], [1700, -700], [2480, -300], [-600, -1330], [1500, 900], [-2150, 700]]) once(x, z, 48, 44, (px, pz) => gasStation(px, pz + 2));
  for (const [x, z] of [[420, -120], [-520, 700], [650, -620], [-780, -880], [2000, 900], [-2300, 600], [450, 1250]]) once(x, z, 28, 36, (px, pz) => konbini(px, pz - 6));
  for (const [x, z] of [[500, -330], [-750, 330], [700, 1330], [2000, -1850]]) once(x, z, 110, 80, (px, pz) => supermarket(px - 55, pz - 40, px + 55, pz + 40));
  for (const [x, z] of [[180, 540], [-420, -140], [2560, -1000]]) once(x, z, 60, 40, (px, pz) => cinema(px, pz + 2));
  for (const [x, z] of [[860, 560], [-60, 1000]]) once(x, z, 46, 34, (px, pz) => showroom(px, pz));
  for (const [x, z] of [[760, -520], [-1000, -330], [620, 1380], [-980, -400]]) once(x, z, 90, 90, (px, pz) => school(px - 45, pz - 45, px + 45, pz + 45));
  for (const [x, z] of [[170, -380], [-180, -400], [-420, 520], [440, 700], [-2200, 330], [-900, -150]]) once(x, z, 70, 70, (px, pz) => park(px - 35, pz - 35, px + 35, pz + 35));

  // ---------------------------------------------------------------- homes
  const homes = [houseGeo('#f2ede2', '#8f4636', 8, 7, 3.2), houseGeo('#e9d9bd', '#3a4350', 8, 7, 5.4), houseGeo('#cfd8dc', '#2f4a45', 8, 7, 3.2), houseGeo('#f4f4f4', '#eef2f6', 8, 7, 3.6), houseGeo('#d9a06a', '#a86a42', 8, 7, 3.4)];
  const homeAt = homes.map(() => []), villas = [villaGeo('#f6f1e6', '#8f4636'), villaGeo('#e9d9bd', '#3b4654'), villaGeo('#dfe6ea', '#2f3338')], villaAt = villas.map(() => []);
  function home(cx, cz, ry, kind) {
    const k = kind === 'ski' ? 3 : kind === 'desert' ? 4 : kind === 'resort' ? (rnd() < 0.5 ? 0 : 2) : (rnd() * 3) | 0;
    if (!claim(cx, cz, 10.5, 9.5, ry, 2.2)) return false;
    homeAt[k].push({ x: cx, y: H - 0.2, z: cz, ry }); solidRect(cx, cz, 8, 7, ry);
    if (rnd() < 0.5) { const [x, z] = at(cx, cz, ry, rnd() < 0.5 ? -6.5 : 6.5, 1); if (!taken(x, z) && W.anyRoadDist(x, z, 10) > 8.5) (kind === 'resort' ? I.palm : kind === 'ski' ? I.pine : I.tree).push({ x, y: W.terrainH(x, z) - 0.2, z, ry: R(0, 6), sx: R(0.45, 0.7) }); }
    return true;
  }
  function villa(cx, cz, ry) { if (!claim(cx, cz, 18, 16, ry, 2.4)) return false; const k = (rnd() * 3) | 0; villaAt[k].push({ x: cx, y: H + 0.1, z: cz, ry }); solidRect(cx, cz, 11, 11, ry); return true; }
  function tallOne(cx, cz, w, floors, kind) { if (!claim(cx, cz, w + 4, w + 4, 0, 2.6, 10)) return false; tower(cx, cz, w, w, floors, kind); return true; }
  const NEON = ['LUCKY STAR', 'GOLDEN SANDS', 'MIRAGE', 'ROYAL FLUSH', 'NEON PALMS', 'JACKPOT', 'DIAMOND', 'OASIS CLUB', 'STARLIGHT', 'CASINO ROYAL'];
  let neon = 0;
  function casino(cx, cz, w, floors) {
    if (!tallOne(cx, cz, w, floors, rnd() < 0.7 ? 'glass' : 'apt')) return false;
    const a1 = (mat, g) => add(mat, cx, cz, g), col = pick(['#ff2bd6', '#00e5ff', '#ffd400', '#7dff3a', '#ff3b30']);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) a1('neon', B(0.5, floors * 3.6, 0.5, cx + dx * (w / 2 + 0.4), H + floors * 1.8 + 5, cz + dz * (w / 2 + 0.4), col));
    a1('neon', B(w + 3, 0.5, w + 3, cx, H + 5.3, cz, col));
    if (neon < 14) { const name = NEON[neon % NEON.length]; neon++; for (const s of [-1, 1]) bigSign(cx + s * (w / 2 + 1.6), 12, cz, s * PI / 2, w + 2, 4.4, name, null, '#160a24', col); }
    return true;
  }
  const CONT = [0xd6322c, 0x2160c4, 0x2f9e44, 0xe8a317, 0x8a8f98, 0x7b2d8b];
  function warehouse(cx, cz, ry) {
    if (!claim(cx, cz, 30, 20, ry, 2.4, 10)) return false;
    const a1 = (mat, g) => add(mat, cx, cz, g), col = pick(['#b4bac0', '#a8896a', '#8fa0b0', '#c9c2b4', '#9a6a52']);
    a1('solid', place(B(28, 8, 18, 0, 0, 0, col), cx, cz, ry, 0, 4, 0)); a1('solid', place(CYL(9.4, 9.4, 28, 3, 0, 0, 0, '#5a6068').rotateZ(PI / 2).rotateX(PI), cx, cz, ry, 0, 9.4, 0).scale(1, 1, 1));
    for (const lx of [-8, 0, 8]) a1('solid', place(B(5, 5, 0.2, 0, 0, 0, '#3a3f46'), cx, cz, ry, lx, 2.5, 9.05)); solidRect(cx, cz, 28, 18, ry); return true;
  }
  function containers(cx, cz) {
    if (!claim(cx, cz, 22, 18, 0, 2, 10)) return false;
    for (let k = 0; k < 4; k++) { const z = cz - 6 + k * 4.2, n = 1 + ((rnd() * 3) | 0); for (let h = 0; h < n; h++) for (const dx of [-5.2, 5.2]) if (rnd() < 0.85 || h === 0) I.box.push({ x: cx + dx, y: H + 1.35 + h * 2.7, z, ry: 0, c: pick(CONT) }); }
    solidRect(cx, cz, 21, 16, 0); return true;
  }
  function crane(cx, cz) {
    if (!claim(cx, cz, 18, 18, 0, 2, 11)) return false;
    const a1 = g => add('solid', cx, cz, g);
    for (const dx of [-7, 7]) for (const dz of [-6, 6]) { a1(B(1.2, 30, 1.2, cx + dx, H + 15, cz + dz, '#d6551f')); c.solidAdd(cx + dx, cz + dz, 0.8); }
    a1(B(16, 2, 14, cx, H + 31, cz, '#d6551f')); a1(B(4, 2, 46, cx, H + 33, cz + 12, '#d6551f')); a1(B(0.2, 14, 0.2, cx, H + 25, cz + 28, '#222222')); a1(B(6, 2.6, 2.6, cx, H + 17, cz + 28, '#2160c4')); return true;
  }

  // ---------------------------------------------------------------- buildings along every road of every district
  const mainPts = []; for (let i = 0; i < W.ROAD.N; i += 2) mainPts.push({ x: W.ROAD.X[i], z: W.ROAD.Z[i], tx: W.ROAD.TX[i], tz: W.ROAD.TZ[i], s: i * W.ROAD.ds });
  const streets = [mainPts, ...W.SIDE_ROADS.filter((_, i) => W.SIDE_ROADS.kinds[i] !== 'ring' && W.SIDE_ROADS.kinds[i] !== 'track'), ...W.SIDE_ROADS.filter((_, i) => W.SIDE_ROADS.kinds[i] === 'ring')];
  // one frontage lot: p on the road, side = which side. Returns the length used along the road.
  function frontage(kind, p, side) {
    const nx = -p.tz * side, nz = p.tx * side, ry = Math.atan2(-nx, -nz), spot2 = off => [p.x + nx * off, p.z + nz * off];
    const shopLot = (types, minF, maxF) => { const w = Math.round(R(8, 12) * 2) / 2, type = pick(types), cafe = SHOPS[type][4] === 'cafe', back = cafe ? 14 : 11.5, [x, z] = spot2(back + 5);
      if (!claim(x, z, w, 10.4, ry, 1.8)) return 0; shop(x, z, ry, w - 0.2, type, minF + ((rnd() * (maxF - minF + 1)) | 0)); return w + 0.3; };
    if (kind === 'downtown') { if (rnd() < 0.45) { const w = snap4(R(18, 26)), [x, z] = spot2(13 + w * 0.7); return tallOne(x, z, w, Math.round(R(9, 28)), rnd() < 0.65 ? 'glass' : 'apt') ? w + 5 : 0; } return shopLot(ANY, 2, 4); }
    if (kind === 'business') { const w = snap4(R(18, 28)), [x, z] = spot2(14 + w * 0.7); return tallOne(x, z, w, Math.round(R(5, 13)), 'glass') ? w + 12 : 0; }
    if (kind === 'oldtown') return shopLot(ANY, 0, 2);
    if (kind === 'food') return shopLot([...FOOD, ...CAFES, 15], 0, 1);
    if (kind === 'shopping') return shopLot(ANY, 0, 3);
    if (kind === 'casino') { if (rnd() < 0.55) { const w = snap4(R(20, 30)), [x, z] = spot2(15 + w * 0.7); return casino(x, z, w, Math.round(R(8, 22))) ? w + 8 : 0; } return shopLot([...FOOD, 13, 15], 0, 1); }
    if (kind === 'town' || kind === 'village') { if (rnd() < 0.25) return shopLot([5, 3, 4, 2, 10, 6], 0, 1); const [x, z] = spot2(17); return home(x, z, ry, kind) ? 14 : 0; }
    if (kind === 'resort') { if (rnd() < 0.3) return shopLot([...CAFES, ...FOOD, 8, 10], 0, 1); const [x, z] = spot2(17); return home(x, z, ry, kind) ? 13 : 0; }
    if (kind === 'villas') { const [x, z] = spot2(21); return villa(x, z, ry) ? 22 : 0; }
    if (kind === 'port') { const [x, z] = spot2(23); return (rnd() < 0.6 ? warehouse(x, z, ry) : containers(x, z)) ? 34 : 0; }
    if (kind === 'campus') { const [x, z] = spot2(22); if (rnd() < 0.5) return tallOne(x, z, 20, Math.round(R(3, 5)), 'apt') ? 30 : 0; return shopLot(CAFES, 1, 2); }
    if (kind === 'airfield') return 0;
    const [x, z] = spot2(17); return home(x, z, ry, kind) ? 13.5 : 0;                // suburb, ski, desert
  }
  for (const road of streets) for (const side of [-1, 1]) {
    let next = 0, along = 0, prev = null;
    for (const p of road) {
      if (prev) along += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; if (along < next) continue;
      const d = W.districtAt(p.x, p.z, 1.12); if (!d) { next = along + 8; continue; }
      const used = frontage(d.kind, p, side); next = along + (used || 4);
    }
  }
  // behind the front rows: more blocks, so a district is full and not a single line of houses
  for (const d of W.DISTRICTS) {
    const step = { downtown: 34, business: 50, casino: 42, port: 34, villas: 30, campus: 44, airfield: 0, shopping: 26, food: 22, oldtown: 20, resort: 22, ski: 20, village: 24, town: 22, suburb: 19, desert: 22 }[d.kind];
    if (!step) continue;
    for (let x = d.x - d.rx; x <= d.x + d.rx; x += step) for (let z = d.z - d.rz; z <= d.z + d.rz; z += step) {
      if (((x - d.x) / d.rx) ** 2 + ((z - d.z) / d.rz) ** 2 > 1) continue;
      const px = x + R(-3, 3), pz = z + R(-3, 3); if (taken(px, pz)) continue;
      const q = W.roadQuery(px, pz, 200), face = ((rnd() * 4) | 0) * PI / 2, roll = rnd(); void q;
      if (roll < 0.1) { if (claim(px, pz, 22, 18, 0, 2)) carPark(px - 11, pz - 9, px + 11, pz + 9, 0.6); continue; }
      if (roll < 0.2) { if (W.anyRoadDist(px, pz, 14) > 11 && W.carve(px, pz) < 0.1) { for (let k = 0; k < 4; k++) { const tx = px + R(-7, 7), tz = pz + R(-7, 7); if (!taken(tx, tz) && W.anyRoadDist(tx, tz, 12) > 9.5) (d.kind === 'desert' || d.kind === 'casino' || d.kind === 'resort' ? I.palm : d.kind === 'ski' ? I.pine : I.tree).push({ x: tx, y: W.terrainH(tx, tz) - 0.2, z: tz, ry: R(0, 6), sx: R(0.5, 0.75) }); } } continue; }
      if (d.kind === 'downtown') tallOne(px, pz, snap4(R(18, 24)), Math.round(R(10, 34)), rnd() < 0.75 ? 'glass' : 'apt');
      else if (d.kind === 'business') tallOne(px, pz, snap4(R(18, 28)), Math.round(R(4, 14)), 'glass');
      else if (d.kind === 'casino') casino(px, pz, snap4(R(18, 28)), Math.round(R(7, 18)));
      else if (d.kind === 'port') { if (roll < 0.3) crane(px, pz); else if (roll < 0.65) containers(px, pz); else warehouse(px, pz, face); }
      else if (d.kind === 'villas') villa(px, pz, face);
      else if (d.kind === 'campus') tallOne(px, pz, 20, Math.round(R(2, 5)), 'apt');
      else if (d.kind === 'shopping' || d.kind === 'food' || d.kind === 'oldtown') { const type = pick(d.kind === 'food' ? [...FOOD, ...CAFES] : ANY), w = R(9, 13); if (claim(px, pz, w, 11, face, 1.8)) shop(px, pz, face, w, type, (rnd() * 3) | 0); }
      else home(px, pz, face, d.kind);
    }
  }
  const builtHomes = homeAt.map(a => a.length);
  homes.forEach((g, i) => instances(g, stdV, homeAt[i].slice(), { receive: true })); villas.forEach((g, i) => instances(g, stdV, villaAt[i], { receive: true }));

  // ---------------------------------------------------------------- street furniture inside the districts
  const wires = [], stripes = [], lights = [];
  for (let k = 0; k < streets.length; k++) {
    let along = 0, prev = null, tree = 8, pole = 20, extra = 40, last = null, step = 0;
    for (const p of streets[k]) {
      if (prev) along += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p;
      const d = W.districtAt(p.x, p.z, 1.05); if (!d || d.kind === 'airfield' || W.carve(p.x, p.z) > 0.5) { last = null; continue; }
      const side = off => [p.x - p.tz * off, p.z + p.tx * off], clear = (x, z) => !taken(x, z) && W.anyRoadDist(x, z, 12) > 7.6;
      const heading = Math.atan2(p.tx, p.tz);
      if (along >= tree) { tree = along + 21; for (const s of [-1, 1]) { const [x, z] = side(s * 8.8); if (clear(x, z)) { (d.kind === 'resort' || d.kind === 'casino' || d.kind === 'desert' || d.kind === 'villas' ? I.palm : d.kind === 'ski' ? I.pine : I.tree).push({ x, y: W.terrainH(x, z) - 0.15, z, ry: R(0, 6), sx: R(0.4, 0.55) }); c.solidAdd(x, z, 0.35); } } }
      if (along >= pole) { pole = along + 30; const [x, z] = side(9.6); if (clear(x, z)) { H = W.terrainH(x, z); prop(I.pole, x, z, heading, 0.18); if (last && Math.hypot(last[0] - x, last[1] - z) < 40) wires.push([last, [x, z, H]]); last = [x, z, H]; } else last = null; }
      if (along >= extra) { extra = along + R(35, 70); const s = rnd() < 0.5 ? -1 : 1, [x, z] = side(s * 8.2); if (clear(x, z)) { H = W.terrainH(x, z); const face = heading - s * PI / 2; const kindI = step++ % 5;
        if (kindI === 0) prop(I.busstop, x, z, face, 0.9); else if (kindI === 1) prop(I.bench, x, z, face, 0.8); else if (kindI === 2) prop(I.post, x, z, face, 0.3); else if (kindI === 3) prop(I.vendR, x, z, face, 0.55); else prop(I.planter, x, z, heading, 0.5); } }
    }
  }
  // crosswalks and traffic lights where an arm meets a roundabout
  for (const [x, z, r] of Object.values(W.ROUNDABOUTS)) for (let i = 0; i < W.SIDE_ROADS.length; i++) {
    if (W.SIDE_ROADS.kinds[i] === 'ring') continue; const lane = W.SIDE_ROADS[i];
    for (const end of [0, lane.length - 1]) { const p = lane[end]; if (Math.abs(Math.hypot(p.x - x, p.z - z) - r) > 3) continue;
      const q = lane[end === 0 ? Math.min(4, lane.length - 1) : Math.max(0, end - 4)], dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
      for (let k = -4; k <= 4; k += 1.6) stripes.push({ x: p.x + ux * 10 - uz * k, y: W.terrainH(p.x + ux * 10, p.z + uz * 10) + 0.2, z: p.z + uz * 10 + ux * k, ry: Math.atan2(-uz, ux) });
      const lx = p.x + ux * 12 - uz * 7.4, lz = p.z + uz * 12 + ux * 7.4; lights.push({ x: lx, y: W.terrainH(lx, lz), z: lz, ry: Math.atan2(ux, uz) }); }
  }
  lights.forEach(l => c.solidAdd(l.x, l.z, 0.15));

  // ---------------------------------------------------------------- the open road: something to look at between the districts
  const ADS = [['TURBO COLA', 'ICE COLD', '#c4161c', '#ffffff'], ['SUNSET MOTEL', 'ROOMS FREE', '#161a3a', '#ffd23f'], ['DRIVE OIL', 'NEXT EXIT', '#d92d27', '#ffffff'], ['PALM ISLAND', 'COME AS YOU ARE', '#0f7f8c', '#ffffff'],
    ['BURGER BARN', '24 HOURS', '#f4a11a', '#1c1208'], ['GRIP TYRES', 'HOLD THE LINE', '#101418', '#9dff4d'], ['SKI THE PEAKS', 'SNOW ALL YEAR', '#2160c4', '#ffffff'], ['CITY MALL', 'OVER 200 STORES', '#7b2d8b', '#fff06a']];
  ADS.forEach(([main, sub, bg, fg], i) => { const tex = canvasTex(512, 220, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 76px sans-serif'; g.fillText(main, w / 2, h * 0.4, w - 40); g.font = 'bold 38px sans-serif'; g.fillText(sub, w / 2, h * 0.74, w - 40); }, false);
    mats['ad' + i] = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0x555555, roughness: 0.6 }); });
  const solidAt = (x, z, ...geos) => geos.forEach(g => add('solid', x, z, g));
  const box = (cx, cz, ry, w, h, d, lx, ly, lz, col) => place(B(w, h, d, 0, 0, 0, col), cx, cz, ry, lx, ly, lz);
  const ROADSIDE = {
    billboard(x, z, ry) { if (!claim(x, z, 9, 2.5, ry, 3)) return false; const i = (rnd() * ADS.length) | 0;
      solidAt(x, z, box(x, z, ry, 0.3, 6, 0.3, -3, 3, -0.2, '#5a6068'), box(x, z, ry, 0.3, 6, 0.3, 3, 3, -0.2, '#5a6068'), box(x, z, ry, 9.3, 4.1, 0.2, 0, 7, -0.15, '#2f3338'));
      add('ad' + i, x, z, place(paint(new THREE.PlaneGeometry(9, 3.85), '#ffffff'), x, z, ry, 0, 7, 0)); for (const s of [-3, 3]) c.solidAdd(...at(x, z, ry, s, -0.2), 0.3); return true; },
    barn(x, z, ry) { if (!claim(x, z, 24, 14, ry, 2.4)) return false;
      solidAt(x, z, box(x, z, ry, 14, 6, 10, -3, 3, 0, '#a8442f'), box(x, z, ry, 15, 0.8, 11, -3, 6.3, 0, '#3d2a1c'), box(x, z, ry, 9, 2, 6, -3, 7.5, 0, '#a8442f'), box(x, z, ry, 4, 4, 0.2, -3, 2, 5.05, '#f4f4f0'),
        place(CYL(3, 3, 12, 12, 0, 0, 0, '#d9d4c6'), x, z, ry, 8, 6, 0), place(CYL(0.1, 3.2, 2.6, 12, 0, 0, 0, '#8a9199'), x, z, ry, 8, 13.3, 0));
      solidRect(x, z, 23, 11, ry); return true; },
    bales(x, z, ry) { if (!claim(x, z, 16, 10, ry, 2)) return false; for (let k = 0; k < 7; k++) { const [px, pz] = at(x, z, ry, R(-6, 6), R(-3, 3)); solidAt(x, z, CYL(1.1, 1.1, 1.8, 10, 0, 0, 0, '#d8b455').rotateZ(PI / 2).translate(px, H + 1.1, pz)); c.solidAdd(px, pz, 1.1); } return true; },
    diner(x, z, ry) { if (!claim(x, z, 12, 11, ry, 1.8)) return false; shop(x, z, ry, 11.6, pick([...FOOD, ...CAFES]), (rnd() * 2) | 0); return true; },
    motel(x, z, ry) { if (!claim(x, z, 30, 11, ry, 2.2)) return false; for (const lx of [-9.8, 0, 9.8]) { const [px, pz] = at(x, z, ry, lx, 0); shop(px, pz, ry, 9.6, pick([...FOOD, ...CAFES]), 1); } return true; },
    mesa(x, z, ry) { const r = R(6, 13); if (!claim(x, z, r * 2, r * 2, ry, 7)) return false; let y = H - 4; for (let k = 0; k < 3; k++) { const h = R(4, 9), rr = r * (1 - k * 0.22); solidAt(x, z, CYL(rr * 0.82, rr, h, 7, x, y + h / 2, z, ['#a8603a', '#bd7646', '#934f31'][k])); y += h; } c.solidAdd(x, z, r * 0.9); return true; },
    tank(x, z, ry) { if (!claim(x, z, 10, 10, ry, 2)) return false; for (const dx of [-2.6, 2.6]) for (const dz of [-2.6, 2.6]) { solidAt(x, z, B(0.35, 9, 0.35, x + dx, H + 4.5, z + dz, '#6b6f76')); c.solidAdd(x + dx, z + dz, 0.3); } solidAt(x, z, CYL(4.2, 4.2, 5, 12, x, H + 11.5, z, '#c9ced4'), CYL(0.1, 4.5, 2, 12, x, H + 15, z, '#8f4636')); return true; },
    logs(x, z, ry) { if (!claim(x, z, 12, 9, ry, 2.4)) return false; for (let k = 0; k < 9; k++) solidAt(x, z, place(CYL(0.55, 0.55, 8, 8, 0, 0, 0, '#8a5a3a').rotateZ(PI / 2), x, z, ry, 0, 0.55 + (k > 4 ? 1 : 0), (k > 4 ? k - 7.5 + 0.5 : k - 2) * 1.15)); solidRect(x, z, 8, 6, ry); return true; },
    cabin(x, z, ry) { return home(x, z, ry, 'ski'); },
    house(x, z, ry) { return home(x, z, ry, 'village'); },
    picnic(x, z, ry) { if (!claim(x, z, 20, 14, ry, 1.2)) return false; flatAt(x, z, 14, 10, H + 0.03, '#b9b3a6'); for (const lx of [-5, 0, 5]) { const [px, pz] = at(x, z, ry, lx, 0); prop(I.table, px, pz, ry, 0.6); I.umbrella.push({ x: px, y: H, z: pz, ry: 0, c: pick([0xd6322c, 0x2160c4, 0xf2c230, 0x2f9e44]) }); } return true; },
    grandstand(x, z, ry) { if (!claim(x, z, 28, 13, ry, 2.4)) return false; for (let k = 0; k < 5; k++) { solidAt(x, z, box(x, z, ry, 26, 1.1 * (k + 1), 2, 0, 0.55 * (k + 1), 3 - k * 2, '#b4bac0')); solidAt(x, z, box(x, z, ry, 25, 0.5, 1, 0, 1.1 * (k + 1) + 0.25, 3 - k * 2, ['#d6322c', '#f4f4f0', '#2160c4', '#f2c230', '#2f9e44'][k])); }
      solidAt(x, z, box(x, z, ry, 27, 0.3, 11, 0, 9, -1, '#2f3338')); for (const s of [-13, 13]) solidAt(x, z, box(x, z, ry, 0.35, 9, 0.35, s, 4.5, -6, '#6b6f76')); solidRect(x, z, 26, 10, ry); return true; },
    pits(x, z, ry) { if (!claim(x, z, 30, 12, ry, 2.2)) return false; solidAt(x, z, box(x, z, ry, 28, 5, 9, 0, 2.5, 0, '#e9ecef'), box(x, z, ry, 29, 0.8, 10, 0, 5.3, 0, '#d6322c')); for (let lx = -11; lx <= 11; lx += 5.5) solidAt(x, z, box(x, z, ry, 4.4, 3.4, 0.2, lx, 1.7, 4.55, '#2f3338')); solidRect(x, z, 28, 9, ry); return true; },
    floodlight(x, z, ry) { if (!claim(x, z, 4, 4, ry, 3)) return false; solidAt(x, z, B(0.6, 22, 0.6, x, H + 11, z, '#9aa0a8'), box(x, z, ry, 5, 2.4, 0.8, 0, 22.5, 0, '#fff6c4')); c.solidAdd(x, z, 0.5); return true; },
  };
  const MIX = {
    desert: ['mesa', 'billboard', 'mesa', 'diner', 'tank', 'mesa', 'motel', 'billboard'],
    track: ['grandstand', 'floodlight', 'billboard', 'pits', 'grandstand', 'billboard'],
    mountain: ['cabin', 'logs', 'cabin', 'billboard', 'picnic', 'logs'],
    valley: ['barn', 'house', 'billboard', 'bales', 'diner', 'house', 'picnic', 'tank'],
    island: ['house', 'picnic', 'diner', 'billboard', 'house'],
  };
  for (const road of [mainPts, ...W.SIDE_ROADS.filter((_, i) => W.SIDE_ROADS.kinds[i] !== 'ring')]) {
    let next = 30, along = 0, prev = null, side = 1;
    for (const p of road) {
      if (prev) along += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; if (along < next) continue; next = along + 8;
      if (W.districtAt(p.x, p.z, 1.12) || W.carve(p.x, p.z) > 0.2) continue;
      const mix = MIX[W.zoneAt(p.x, p.z)] || MIX.valley; side = -side;
      const name = pick(mix), off = name === 'billboard' ? 12 : name === 'floodlight' ? 11 : 22, x = p.x - p.tz * side * off, z = p.z + p.tx * side * off;
      const ry = name === 'billboard' ? Math.atan2(-p.tx, -p.tz) - side * 0.35 : Math.atan2(p.tz * side, -p.tx * side);
      if (ROADSIDE[name](x, z, ry)) next = along + R(45, 75);
    }
  }
  W.SIDE_ROADS.forEach((road, i) => {                    // tyre walls round the race track
    if (W.SIDE_ROADS.kinds[i] !== 'track') return; let along = 0, prev = null, next = 0;
    for (const p of road) { if (prev) along += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; if (along < next) continue; next = along + 5;
      for (const s of [-1, 1]) { const x = p.x - p.tz * s * 8.4, z = p.z + p.tx * s * 8.4; if (taken(x, z) || W.anyRoadDist(x, z, 12) < 8) continue; const h = W.terrainH(x, z);
        for (let k = 0; k < 2; k++) add('solid', x, z, CYL(0.7, 0.7, 0.5, 8, x, h + 0.25 + k * 0.52, z, k ? ((along / 20 | 0) % 2 ? '#d6322c' : '#f4f4f0') : '#17181b')); c.solidAdd(x, z, 0.7); } }
  });
  // homes added along the open road
  homes.forEach((g, i) => instances(g, stdV, homeAt[i].splice(builtHomes[i]), { receive: true }));

  // ---------------------------------------------------------------- build the merged meshes and the instances
  for (const q of quads.values()) for (const [name, list] of Object.entries(q)) { const m = new THREE.Mesh(merge(list), mats[name]); m.castShadow = !!CAST[name]; m.receiveShadow = true; scene.add(m); }

  const G = list => merge(list);
  instances(new THREE.BoxGeometry(10, 2.6, 3.9), new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.3 }), I.box, { cast: true, receive: true });
  const carGeo = (() => {                                                    // parked car: white paint takes the instance colour
    const cab = new THREE.BoxGeometry(1.66, 0.56, 2.45), p = cab.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setZ(i, p.getZ(i) * 0.62 - 0.12); p.setX(i, p.getX(i) * 0.88); }
    cab.computeVertexNormals();
    const parts = [B(1.82, 0.5, 4.3, 0, 0.62, 0, '#ffffff'), B(1.7, 0.16, 4.0, 0, 0.35, 0, '#202226'), paint(cab.translate(0, 1.14, -0.1), '#28323f'), B(1.34, 0.07, 1.4, 0, 1.44, -0.22, '#ffffff')];
    for (const x of [-0.82, 0.82]) for (const z of [-1.38, 1.38]) parts.push(paint(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 8).rotateZ(PI / 2).translate(x, 0.34, z), '#141517'));
    for (const x of [-0.6, 0.6]) parts.push(B(0.42, 0.14, 0.05, x, 0.68, 2.16, '#fff6cf'), B(0.42, 0.14, 0.05, x, 0.7, -2.16, '#c4161c'));
    return G(parts); })();
  instances(carGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.35 }), I.car, { cast: true, lod: 'small' });
  const lanternGeo = G([paint(new THREE.SphereGeometry(0.17, 8, 6), '#ffe7ad'), CYL(0.17, 0.17, 0.1, 8, 0, 0.39, 0, '#1c1c1c'), CYL(0.17, 0.17, 0.1, 8, 0, -0.39, 0, '#1c1c1c')]);
  instances(lanternGeo, new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x806020, roughness: 0.6 }), I.lantern, { cast: false, lod: 'small' });
  const small = (geo, list, cast = true, cls = 'small') => instances(geo, stdV, list, { cast, lod: cls });
  small(G([CYL(0.55, 0.55, 0.07, 14, 0, 0.74, 0, '#e8e4da'), CYL(0.05, 0.05, 0.72, 6, 0, 0.37, 0, '#6b6f76'), CYL(0.3, 0.3, 0.04, 10, 0, 0.02, 0, '#4a4e55')]), I.table);
  small(G([B(0.46, 0.07, 0.46, 0, 0.46, 0, '#8a5a3a'), B(0.46, 0.5, 0.06, 0, 0.74, -0.2, '#8a5a3a'), B(0.4, 0.44, 0.4, 0, 0.22, 0, '#3c3f45')]), I.chair, false);
  instances(G([paint(new THREE.ConeGeometry(1.25, 0.5, 10).translate(0, 2.45, 0), '#ffffff'), CYL(0.035, 0.035, 2.3, 6, 0, 1.15, 0, '#d9d9d9')]), stdV, I.umbrella, { cast: true, lod: 'mid' });
  small(G([B(1.7, 0.09, 0.5, 0, 0.45, 0, '#a8713f'), B(1.7, 0.4, 0.08, 0, 0.78, -0.24, '#a8713f'), B(0.1, 0.45, 0.45, -0.7, 0.22, 0, '#34383f'), B(0.1, 0.45, 0.45, 0.7, 0.22, 0, '#34383f')]), I.bench);
  const vend = body => { const parts = [B(1, 1.9, 0.7, 0, 0.95, 0, body), B(0.86, 1.05, 0.04, 0, 1.25, 0.36, '#dff1ff'), B(0.7, 0.18, 0.05, 0, 0.35, 0.36, '#15181c')]; for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) parts.push(B(0.09, 0.2, 0.03, -0.32 + k * 0.16, 0.95 + r * 0.32, 0.39, ['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#e9c46a'][(k + r) % 5])); return G(parts); };
  small(vend('#d6322c'), I.vendR); small(vend('#2160c4'), I.vendB);
  small(G([B(3.5, 0.12, 0.95, 0, 0.06, 0.45, '#c9ced4'), B(3.5, 0.95, 0.05, 0, 0.55, 0.9, '#9fb6c8'), B(3.5, 0.07, 0.07, 0, 1.05, 0.9, '#eceff2')]), I.balcony, false, 'small');
  small(G([B(4.2, 0.12, 1.7, 0, 2.6, 0, '#2f6d8f'), B(4, 1.6, 0.06, 0, 1.4, -0.75, '#a8c6da'), CYL(0.06, 0.06, 2.6, 6, -2, 1.3, 0.7, '#7a828b'), CYL(0.06, 0.06, 2.6, 6, 2, 1.3, 0.7, '#7a828b'), CYL(0.06, 0.06, 2.6, 6, -2, 1.3, -0.75, '#7a828b'), CYL(0.06, 0.06, 2.6, 6, 2, 1.3, -0.75, '#7a828b'), B(3.2, 0.1, 0.45, 0, 0.5, -0.45, '#a8713f'), CYL(0.05, 0.05, 2.7, 6, 2.5, 1.35, 0.7, '#9aa0a8'), CYL(0.32, 0.32, 0.06, 14, 2.5, 2.9, 0.7, '#f2c230')]), I.busstop, true, 'mid');
  instances(G([CYL(0.13, 0.18, 9, 8, 0, 4.5, 0, '#8d867a'), B(0.1, 0.1, 1.8, 0, 8.6, 0, '#5f5a52'), B(0.1, 0.1, 1.3, 0, 8.0, 0, '#5f5a52'), CYL(0.32, 0.32, 0.8, 10, 0.28, 6.9, 0, '#9aa1a8')]), stdV, I.pole, { cast: true, lod: 'mid' });
  small(G([B(0.55, 0.75, 0.45, 0, 0.9, 0, '#d6251f'), B(0.62, 0.1, 0.52, 0, 1.32, 0, '#a81c18'), CYL(0.08, 0.08, 0.55, 6, 0, 0.27, 0, '#5a5e66'), B(0.34, 0.05, 0.02, 0, 1.08, 0.23, '#111111')]), I.post);
  small(G([CYL(0.11, 0.13, 0.85, 8, 0, 0.42, 0, '#3c4048'), CYL(0.12, 0.12, 0.09, 8, 0, 0.78, 0, '#f2c230')]), I.bollard);
  small(G([B(1.6, 0.55, 0.7, 0, 0.28, 0, '#8d8577'), paint(new THREE.IcosahedronGeometry(0.4, 0).translate(-0.42, 0.72, 0), '#3f8a44'), paint(new THREE.IcosahedronGeometry(0.45, 0).translate(0.3, 0.75, 0), '#4f9a3e'), paint(new THREE.IcosahedronGeometry(0.14, 0).translate(0.05, 1.05, 0.2), '#e85d8a')]), I.planter);
  small(G([B(0.5, 0.95, 0.5, 0, 0.48, 0, '#4a6741'), B(0.55, 0.08, 0.55, 0, 0.99, 0, '#2f3f2a')]), I.bin);
  small(G([B(0.12, 0.02, 5, 0, 0, 0, '#e8e8e2')]), I.bay, false, 'small');
  instances(paint(new THREE.BoxGeometry(3.2, 0.03, 0.7), '#f4f4f0'), mats.flat, stripes, { cast: false, receive: true });
  instances(G([CYL(0.1, 0.12, 6, 6, 0, 3, 0, '#4a4f57'), B(0.45, 1.3, 0.4, 0, 5.6, 0, '#22252a'), paint(new THREE.SphereGeometry(0.15, 6, 4).translate(0, 6, 0.22), '#ff3030'), paint(new THREE.SphereGeometry(0.15, 6, 4).translate(0, 5.6, 0.22), '#ffc830'), paint(new THREE.SphereGeometry(0.15, 6, 4).translate(0, 5.2, 0.22), '#38e060')]), stdV, lights);
  instances(TG.broad.geo, TG.broad.mat, I.tree); instances(TG.sakura.geo, TG.sakura.mat, I.sakura); instances(TG.palm.geo, TG.palm.mat, I.palm); instances(TG.pine.geo, TG.pine.mat, I.pine);
  // overhead wires between the utility poles
  if (wires.length) { const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.03, 1), new THREE.MeshBasicMaterial({ color: 0x1b1d22 }), wires.length * 3), o = new THREE.Object3D(); let n = 0;
    for (const [[ax, az, ay], [bx, bz, by]] of wires) for (const [off, y] of [[-0.7, 8.65], [0.7, 8.65], [0, 8.05]]) { const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), px = -dz / len * off, pz = dx / len * off; o.position.set((ax + bx) / 2 + px, (ay + by) / 2 + y - 0.12, (az + bz) / 2 + pz); o.rotation.set(-Math.atan2(by - ay, len), Math.atan2(dx, dz), 0, 'YXZ'); o.scale.set(1, 1, Math.hypot(len, by - ay)); o.updateMatrix(); wm.setMatrixAt(n++, o.matrix); }
    wm.computeBoundingSphere(); scene.add(wm); }

  return { lots, taken };
}
