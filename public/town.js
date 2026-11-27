// town.js - the city: a shopping mall with its car park, shopping streets and restaurants, konbini and gas station, supermarket, cinema,
// car showroom, school, park, apartment blocks and downtown towers, plus street furniture.
// Buildings are merged per quarter of the city (few draw calls, hidden when off screen); repeated small things are instanced.
import * as THREE from 'three';
import * as W from './world.js';

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
  const CR = W.CITY_RECT, H = CR.h, AVX = W.AVX, AVZ = W.AVZ, P = W.PLAZA, PI = Math.PI, pick = a => a[(rnd() * a.length) | 0], snap4 = v => Math.max(8, Math.round(v / 4) * 4);
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
  };
  const CAST = { shop: false, apt: true, glass: true, solid: true, vsign: false, pave: false, lot: false, lawn: false, flat: false };
  const quads = new Map();   // merged geometry per quarter of the city
  const midX = (CR.x0 + CR.x1) / 2, midZ = (CR.z0 + CR.z1) / 2;
  const add = (mat, x, z, geo) => { const k = (x > midX ? 1 : 0) + (z > midZ ? 2 : 0); let q = quads.get(k); if (!q) quads.set(k, q = {}); (q[mat] ||= []).push(geo); };

  // ---------------------------------------------------------------- placement helpers (local frame: the front of a building is +z)
  const place = (g, cx, cz, ry, lx = 0, ly = 0, lz = 0) => g.translate(lx, ly, lz).rotateY(ry).translate(cx, H, cz);
  const at = (cx, cz, ry, lx, lz) => [cx + lx * Math.cos(ry) + lz * Math.sin(ry), cz - lx * Math.sin(ry) + lz * Math.cos(ry)];
  const solidRect = (cx, cz, w, d, ry) => { const side = Math.abs(Math.sin(ry)) > 0.5; c.solidBox(cx, cz, (side ? d : w) / 2, (side ? w : d) / 2); };
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
  const I = { lantern: [], table: [], chair: [], umbrella: [], car: [], bench: [], vendR: [], vendB: [], balcony: [], bay: [], pole: [], busstop: [], post: [], bollard: [], tree: [], sakura: [], planter: [], bin: [] };
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
    lots.push({ cx, cz, w, d, h: yb });
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
  function mall(x0, z0, x1, z1) {
    const cx = (x0 + x1) / 2, w = x1 - x0 - 16, d = 64, cz = z0 + 6 + d / 2, h = 17, front = cz + d / 2, add1 = (mat, g) => add(mat, cx, cz, g);
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
    bigSign(cx, 22.6, front + 9.2, 0, 40, 4.2, 'CITY MALL', 'HARBOUR CITY', '#b3243c', '#ffffff');
    bigSign(x1 - 8 + 0.1, 12, cz, PI / 2, 26, 3.4, 'CITY MALL', null, '#b3243c', '#ffffff'); bigSign(x0 + 8 - 0.1, 12, cz, -PI / 2, 26, 3.4, 'CITY MALL', null, '#b3243c', '#ffffff');
    bigSign(cx, 12, z0 + 6 - 0.15, PI, 36, 3.6, 'CITY MALL', 'FASHION · FOOD · CINEMA', '#b3243c', '#ffffff');
    for (let i = 0; i < 22; i++) add1('solid', B(R(3, 7), R(1, 2.2), R(3, 6), cx + R(-w / 2 + 6, w / 2 - 6), H + h + 1.6, cz + R(-d / 2 + 5, d / 2 - 5), pick(['#b4bac0', '#9aa1a8', '#c9ced3'])));
    // forecourt with fountain, then the car park
    flatRect('pave', x0, front, x1, front + 26, 0.07, '#e9e4da');
    add1('solid', CYL(5, 5.4, 0.8, 24, cx, H + 0.4, front + 20, '#cfc8b8')); add('water', cx, front + 20, CYL(4.5, 4.5, 0.1, 24, cx, H + 0.82, front + 20, '#ffffff')); add1('solid', CYL(0.5, 0.8, 2.4, 10, cx, H + 1.6, front + 20, '#cfc8b8')); c.solidAdd(cx, front + 20, 5.2);
    for (let x = x0 + 10; x <= x1 - 10; x += 22) { if (Math.abs(x - cx) < 12) continue; tree(x, front + 17, 0.5, true); prop(I.bench, x + 5, front + 19, 0, 0.8); }
    carPark(x0 + 4, front + 30, x1 - 4, z1 - 4, 0.6);
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

  // ---------------------------------------------------------------- the city plan: 4 x 4 blocks between the avenues
  const cuts = (lo, hi, av) => { const out = [lo + 4]; for (const a of av) out.push(a - 18, a + 18); out.push(hi - 4); return out; };
  const xs = cuts(CR.x0, CR.x1, AVX), zs = cuts(CR.z0, CR.z1, AVZ);
  const rect = (i, j) => { const a = 3 - i, b = [0, 2, 1, 3][j]; return [xs[a * 2], zs[b * 2], xs[a * 2 + 1], zs[b * 2 + 1]]; };   // column 0 is the east side
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const [a, b, c2, d] = rect(i, j); flatRect('pave', a, b, c2, d, 0.04, '#a4a8b0', 5); }
  const ring = (i, j, sides, types, minF, maxF) => { const [a, b, c2, d] = rect(i, j); for (const s of sides) edge(a, b, c2, d, s, types, minF, maxF); };
  // north row
  park(...rect(0, 0));
  { const [a, b, c2, d] = rect(1, 0); gasStation(a + 42, (b + d) / 2 + 12); konbini(c2 - 40, b + 40); edge(a, b, c2, b + 10, 's', ANY, 0, 2); carPark(a + 74, b + 56, c2 - 6, d - 6, 0.45); }
  ring(2, 0, 's', ANY, 2, 4); { const [a, b, c2, d] = rect(2, 0); towers(a + 4, b + 2, c2 - 4, d - 34, 6, 11, 0.15); }
  ring(3, 0, 's', [...FOOD, ...RETAIL], 1, 2); { const [a, b, c2, d] = rect(3, 0); towers(a + 8, b + 4, c2 - 8, d - 30, 5, 9, 0.1); }
  // second row
  ring(0, 1, 'w', [...FOOD, ...CAFES], 0, 2); ring(0, 1, 'ns', RETAIL, 1, 2); { const [a, b, c2, d] = rect(0, 1); towers(a + 24, b + 24, c2 - 4, d - 24, 4, 9, 0.2); }
  mall(...rect(1, 1));
  { const [a, b, c2, d] = rect(2, 1); edge(a, b, c2, d, 's', [12, 8, 3, 9], 1, 2); edge(a, b, c2, d, 'e', [12, 3, 4, 8], 1, 2); towers(a + 4, b + 6, c2 - 20, d - 24, 12, 30, 0.8); bigSign((a + c2) / 2, 9, d + 0.2, 0, 14, 1.8, 'DOWNTOWN', 'CITY CENTRE', '#14213d', '#ffffff'); }
  ring(3, 1, 'e', ANY, 1, 3); { const [a, b, c2, d] = rect(3, 1); towers(a + 4, b + 6, c2 - 24, d - 6, 9, 18, 0.55); }
  // third row
  { const [a, b, c2, d] = rect(0, 2); school(a, b, c2, b + 126); edge(a, b + 134, c2, d, 'w', ANY, 0, 2); edge(a, b + 134, c2, d, 's', [...FOOD, ...CAFES], 0, 2); towers(a + 24, b + 134, c2 - 4, d - 26, 3, 7, 0.1); }
  shotengai(...rect(1, 2));
  { const [a, b, c2, d] = rect(2, 2); for (const [x, z] of [[a + 14, b + 10], [c2 - 14, b + 10], [a + 14, d - 10], [c2 - 14, d - 10]]) if (Math.hypot(x - P.x, z - P.z) > P.r + 12) shop(x, z, z < P.z ? PI : 0, 14, pick(FOOD), 1);
    for (let k = 0; k < 24; k++) { const an = k / 24 * PI * 2, x = P.x + Math.cos(an) * (P.r + 6), z = P.z + Math.sin(an) * (P.r + 6); if (x > a + 2 && x < c2 - 2 && z > b + 2 && z < d - 2 && k % 6) tree(x, z, 0.55, true); } }
  supermarket(...rect(3, 2));
  // south row
  ring(0, 3, 'n', [...FOOD, ...CAFES], 0, 2); { const [a, b, c2, d] = rect(0, 3); towers(a + 4, b + 30, c2 - 4, d - 2, 4, 7, 0.1); }
  ring(1, 3, 'n', ANY, 1, 3); { const [a, b, c2, d] = rect(1, 3); towers(a + 4, b + 30, c2 - 4, d - 2, 5, 10, 0.15); }
  { const [a, b, c2, d] = rect(2, 3); cinema(a + 46, b + 28); edge(a + 86, b, c2, d, 'n', [...FOOD, 13, 15], 1, 3); carPark(a + 4, b + 56, c2 - 4, d - 4, 0.45); }
  { const [a, b, c2, d] = rect(3, 3); showroom((a + c2) / 2, b + 30); carPark(a + 6, b + 56, c2 - 6, d - 6, 0.6); }

  // ---------------------------------------------------------------- avenues: trees, crosswalks, traffic lights, poles and wires, bus stops
  const nearPlaza = (x, z, m) => Math.hypot(x - P.x, z - P.z) < P.r + m;
  const wires = [], stripes = [], lights = [], trees = [];
  const along = (alongX, at0) => {                                           // one avenue
    const from = (alongX ? CR.x0 : CR.z0) + 14, to = (alongX ? CR.x1 : CR.z1) - 14, cross = alongX ? AVX : AVZ;
    const pos = (t, off) => alongX ? [t, at0 + off] : [at0 + off, t];
    const clear = (t, m) => !cross.some(a => Math.abs(t - a) < m);
    for (const s of [-1, 1]) for (let t = from + 8; t < to; t += 24) { const [x, z] = pos(t, s * 15.8); if (!nearPlaza(x, z, 14) && clear(t, 24)) trees.push([x, z]); }
    let prev = null;
    for (let t = from; t < to; t += 28) { const [x, z] = pos(t, 17.3); if (!clear(t, 20) || nearPlaza(x, z, 6)) { prev = null; continue; } prop(I.pole, x, z, alongX ? 0 : PI / 2, 0.18); if (prev) wires.push([prev, [x, z]]); prev = [x, z]; }
    for (let t = from + 60; t < to; t += 170) { const [x, z] = pos(t, -17); if (clear(t, 28) && !nearPlaza(x, z, 14)) prop(I.busstop, x, z, alongX ? 0 : PI / 2, 0.9); const [px, pz] = pos(t + 9, -16.6); if (clear(t + 9, 28)) prop(I.post, px, pz, 0, 0.3); }
    for (let t = from + 20; t < to; t += 90) { const [x, z] = pos(t, 16.8); if (clear(t, 28) && !nearPlaza(x, z, 14)) prop(I.bench, x, z, alongX ? PI : -PI / 2, 0.8); }
  };
  AVX.forEach(x => along(false, x)); AVZ.forEach(z => along(true, z));
  for (const [x, z] of trees) tree(x, z, R(0.4, 0.55));
  for (const ax of AVX) for (const az of AVZ) { if (nearPlaza(ax, az, 0)) continue;
    for (let k = -5; k <= 5; k++) for (const s of [-1, 1]) { stripes.push({ x: ax + s * 18, y: H + 0.13, z: az + k * 2, ry: 0 }); stripes.push({ x: ax + k * 2, y: H + 0.13, z: az + s * 18, ry: PI / 2 }); }
    for (const [sx, sz, ry] of [[1, 1, PI], [-1, 1, PI / 2], [1, -1, -PI / 2], [-1, -1, 0]]) lights.push({ x: ax + sx * 14, y: H, z: az + sz * 14, ry }); }
  lights.forEach(l => c.solidAdd(l.x, l.z, 0.15));

  // ---------------------------------------------------------------- build the merged meshes and the instances
  for (const q of quads.values()) for (const [name, list] of Object.entries(q)) { const m = new THREE.Mesh(merge(list), mats[name]); m.castShadow = !!CAST[name]; m.receiveShadow = true; scene.add(m); }

  const G = list => merge(list);
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
  instances(TG.broad.geo, TG.broad.mat, I.tree); instances(TG.sakura.geo, TG.sakura.mat, I.sakura);
  // overhead wires between the utility poles
  if (wires.length) { const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.03, 1), new THREE.MeshBasicMaterial({ color: 0x1b1d22 }), wires.length * 3), o = new THREE.Object3D(); let n = 0;
    for (const [[ax, az], [bx, bz]] of wires) for (const [off, y] of [[-0.7, 8.65], [0.7, 8.65], [0, 8.05]]) { const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), px = -dz / len * off, pz = dx / len * off; o.position.set((ax + bx) / 2 + px, H + y - 0.12, (az + bz) / 2 + pz); o.rotation.set(0, Math.atan2(dx, dz), 0); o.scale.set(1, 1, len); o.updateMatrix(); wm.setMatrixAt(n++, o.matrix); }
    wm.computeBoundingSphere(); scene.add(wm); }

  return { lots };
}
