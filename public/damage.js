// damage.js - what a crash looks like: dented bodywork, flying bits of paint / plastic / glass, a screen jolt, smoke from a battered engine.
import * as THREE from 'three';

const MAX = 260;
export function createDamage({ scene, fx, groundAt }) {
  const broken = new Set(); let soft = [], oldP = null, accN = null, moved = null; let total = 0, smokeAcc = 0, pull = 0;
  // debris pool
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.35 }), MAX);
  mesh.frustumCulled = false; mesh.castShadow = true; scene.add(mesh);
  const bits = Array.from({ length: MAX }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: new THREE.Vector3() }));
  const dummy = new THREE.Object3D(), color = new THREE.Color(); let next = 0;
  for (let i = 0; i < MAX; i++) { dummy.scale.set(0, 0, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, color.set(0)); }
  function throwBits(point, normal, vel, strength, paint) {
    const n = Math.min(45, Math.round(strength * 2.2));
    for (let k = 0; k < n; k++) {
      const b = bits[next], i = next; next = (next + 1) % MAX;
      const kind = Math.random(), glass = strength > 9 && kind < 0.35, plastic = !glass && kind < 0.88;
      b.life = 3 + Math.random() * 3; b.p.set(point.x + (Math.random() - 0.5) * 0.7, point.y + Math.random() * 0.5, point.z + (Math.random() - 0.5) * 0.7);
      const sp = 1.5 + Math.random() * strength * 0.45;
      b.v.set(vel.x * 0.5 + normal.x * sp * (Math.random() - 0.2) + (Math.random() - 0.5) * sp, 1 + Math.random() * sp * 0.7, vel.z * 0.5 + normal.z * sp * (Math.random() - 0.2) + (Math.random() - 0.5) * sp);
      b.w.set(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7); b.r.set(Math.random() * 3, Math.random() * 3, 0);
      if (glass) b.s.set(0.035 + Math.random() * 0.05, 0.012, 0.03 + Math.random() * 0.04); else b.s.set(0.03 + Math.random() * 0.1, 0.012 + Math.random() * 0.018, 0.025 + Math.random() * 0.06);
      mesh.setColorAt(i, color.set(glass ? 0xcfe8ff : plastic ? 0x17181b : paint));
    }
    mesh.instanceColor.needsUpdate = true;
  }
  const matsOf = o => (Array.isArray(o.material) ? o.material : [o.material]);
  // Done once when the car model is loaded, so a crash only has to move numbers around: the packed model data is unpacked into
  // plain arrays, a paint-scuff colour layer is added and the shaders are built for it (doing this at the moment of impact froze the game).
  function prepare(body) {
    soft = []; broken.clear(); let most = 0;
    body.traverse(o => {
      if (!o.isMesh || !o.geometry.attributes.position) return; for (let p = o; p && p !== body; p = p.parent) if (p.userData.wheel) return;
      const src = o.geometry, g = src.clone(), n = src.attributes.position.count;
      const unpack = a => { const f = new Float32Array(n * 3); for (let i = 0; i < n; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); } return new THREE.BufferAttribute(f, 3); };
      g.setAttribute('position', unpack(src.attributes.position)); if (src.attributes.normal) g.setAttribute('normal', unpack(src.attributes.normal));
      g.setAttribute('color', src.attributes.color ? unpack(src.attributes.color) : new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      g.computeBoundingSphere(); g.computeBoundingBox(); for (const name of ['position', 'normal', 'color']) g.attributes[name]?.setUsage(THREE.DynamicDrawUsage); o.geometry = g; for (const m of matsOf(o)) { m.vertexColors = true; m.needsUpdate = true; }
      const A = g.attributes; soft.push({ o, dirty: false, pos: A.position.array.slice(), nor: A.normal ? A.normal.array.slice() : null, col: A.color.array.slice() }); most = Math.max(most, n);
    });
    oldP = new Float32Array(most * 3); accN = new Float32Array(most * 3); moved = new Uint8Array(most);
    // rehearse one crash now, while loading: the browser compiles the dent code, so the first real hit is as quick as the rest
    body.updateWorldMatrix(true, true); for (let k = 0; k < 2; k++) dent(body, body.localToWorld(new THREE.Vector3(0, 0.55, 2)), new THREE.Vector3(0, 0, -1).transformDirection(body.matrixWorld), 20, 1.3);
    restore();
  }
  function restore() { for (const s of soft) { if (!s.dirty) continue; const A = s.o.geometry.attributes; for (const [a, saved] of [[A.position, s.pos], [A.normal, s.nor], [A.color, s.col]]) if (a && saved) { a.array.set(saved); a.clearUpdateRanges?.(); a.needsUpdate = true; } s.dirty = false; } }
  // Crush the bodywork the way sheet metal folds. The new position is a smooth function of the old one, the same for every mesh,
  // so panels, lights and interior stay layered (no parts poking through each other):
  //   the struck face is squashed inwards (a post leaves a narrow notch, a wall flattens the end), the hood buckles upwards,
  //   the sides bulge a little, and long creases run across the damaged area.
  function dent(body, point, normal, strength, width) {
    const narrow = width < 0.8, latR = narrow ? 0.5 : 1.15, upR = 0.95, depth = Math.min(narrow ? 0.5 : 0.38, (strength - 1.5) * (narrow ? 0.036 : 0.026));
    if (depth <= 0) return;
    const nx = normal.x, nz = normal.z, px = point.x, py = point.y, pz = point.z, zone = depth * 2.2 + 0.28, reach = Math.hypot(latR, upR, zone) + 0.1;
    const sphere = new THREE.Sphere(), inv = new THREE.Matrix3(), delta = new THREE.Vector3();
    body.updateWorldMatrix(true, true);
    for (const s of soft) {
      const o = s.o; sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); if (sphere.center.distanceTo(point) > sphere.radius + reach) continue;
      const g = o.geometry, P = g.attributes.position.array, e = o.matrixWorld.elements, count = g.attributes.position.count;
      const paintMesh = matsOf(o).some(m => m.userData?.role === 'paint'), C = g.attributes.color.array;
      inv.setFromMatrix4(o.matrixWorld).invert();
      oldP.set(P.subarray(0, count * 3)); moved.fill(0, 0, count);
      let any = false;
      for (let i = 0, j = 0; i < count; i++, j += 3) {                 // measured in the world: the packed models have uneven scales
        const x = P[j], y = P[j + 1], z = P[j + 2];
        const wy = e[1] * x + e[5] * y + e[9] * z + e[13], h = wy - py; if (h > upR || h < -upR) continue;
        const dx = e[0] * x + e[4] * y + e[8] * z + e[12] - px, dz = e[2] * x + e[6] * y + e[10] * z + e[14] - pz;
        const a = dx * nx + dz * nz; if (a >= zone || a < -0.5) continue;          // a: distance into the car from the struck face
        const l = dx * nz - dz * nx; if (l >= latR || l <= -latR) continue;
        const bump = (1 - (l / latR) * (l / latR)) * (1 - (h / upR) * (h / upR));
        const crease = 1 + 0.2 * Math.sin(l * 8.5 + h * 3.1) * Math.sin(h * 10.5 - l * 4.3);
        const D = depth * bump * crease; if (D < 0.004) continue;
        const along = D * (1 - Math.max(0, a) / zone);                              // monotonic: nothing overtakes the layer behind it
        const u = Math.max(0, Math.min(1, a / zone)), arch = Math.sin(u * Math.PI);
        const high = Math.max(0, Math.min(1, (h + 0.05) / 0.25));
        const up = depth * 0.42 * bump * arch * high * (0.75 + 0.25 * Math.sin(l * 6.5 + 1.3));
        const out = depth * 0.14 * bump * arch * Math.max(-1, Math.min(1, l * 3));
        delta.set(nx * along + nz * out, up - along * 0.08 * (1 - high), nz * along - nx * out).applyMatrix3(inv);
        P[j] = x + delta.x; P[j + 1] = y + delta.y; P[j + 2] = z + delta.z;
        moved[i] = 1; any = true;
        // paint: a few long scrapes where it folded, not a blanket of black
        const scrape = Math.max(0, Math.sin(h * 31 + l * 2.5) * Math.sin(l * 7.3 + a * 5) - 0.35);
        const mark = 1 - Math.min(0.6, (D / depth) * (1 - u) * (paintMesh ? scrape * 1.5 + 0.08 : 0.18));
        if (mark < C[j]) C[j] = C[j + 1] = C[j + 2] = mark;
      }
      if (!any) continue;
      s.dirty = true;
      if (g.attributes.normal) relight(g, count);
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    }
  }
  // turn the normals by as much as the faces around them turned: creases catch the light, original hard edges stay
  function relight(g, count) {
    const P = g.attributes.position.array, N = g.attributes.normal.array, idx = g.index?.array, tris = (idx ? idx.length : count) / 3;
    accN.fill(0, 0, count * 3);
    const face = (A, a, b, c, out) => {
      const ux = A[b] - A[a], uy = A[b + 1] - A[a + 1], uz = A[b + 2] - A[a + 2], vx = A[c] - A[a], vy = A[c + 1] - A[a + 1], vz = A[c + 2] - A[a + 2];
      const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z) || 1;
      out[0] = x / l; out[1] = y / l; out[2] = z / l;
    };
    const was = [0, 0, 0], now = [0, 0, 0];
    for (let t = 0; t < tris; t++) {
      const i = idx ? idx[t * 3] : t * 3, j = idx ? idx[t * 3 + 1] : t * 3 + 1, k = idx ? idx[t * 3 + 2] : t * 3 + 2;
      if (!(moved[i] | moved[j] | moved[k])) continue;
      face(oldP, i * 3, j * 3, k * 3, was); face(P, i * 3, j * 3, k * 3, now);
      for (const v of [i, j, k]) { accN[v * 3] += (now[0] - was[0]) * 0.45; accN[v * 3 + 1] += (now[1] - was[1]) * 0.45; accN[v * 3 + 2] += (now[2] - was[2]) * 0.45; }
    }
    for (let v = 0; v < count; v++) {
      const j = v * 3; if (!accN[j] && !accN[j + 1] && !accN[j + 2]) continue;
      const x = N[j] + accN[j], y = N[j + 1] + accN[j + 1], z = N[j + 2] + accN[j + 2], l = Math.hypot(x, y, z) || 1;
      N[j] = x / l; N[j + 1] = y / l; N[j + 2] = z / l;
    }
    g.attributes.normal.needsUpdate = true;
  }
  function breakLamps(body, point) {          // a lamp close to the hit goes dark
    const w = new THREE.Vector3();
    body.traverse(o => { if (!o.isSprite) return; for (let p = o.parent; p && p !== body; p = p.parent) if (p.userData.wheel) return; if (o.getWorldPosition(w).distanceTo(point) < 0.75) { o.visible = false; broken.add(o); } });
  }
  const flash = () => document.getElementById('hit');
  return {
    prepare,
    // point: world contact, normal: world direction from the obstacle into the car, strength: closing speed (m/s)
    impact(body, point, normal, vel, strength, paint, width = 1.2) {
      if (strength < 1.8) return;
      total += strength;
      if (strength > 4) { breakLamps(body, point); const local = body.worldToLocal(point.clone()); pull = Math.max(-1, Math.min(1, pull + Math.sign(local.x) * strength / 30)); }
      dent(body, point, normal, strength, width);
      throwBits(point, normal, vel, strength, paint);
      for (let i = 0; i < Math.min(14, strength); i++) fx.smoke(point.x + (Math.random() - 0.5), point.y + 0.2, point.z + (Math.random() - 0.5), normal.x * 2 + (Math.random() - 0.5) * 3, 0.6 + Math.random() * 1.5, normal.z * 2 + (Math.random() - 0.5) * 3, 0.35, 1.8 + Math.random(), 1.1 + Math.random(), 0.3, [0.62, 0.6, 0.58], 1.4, 0.1, 0.6);
      const el = flash(); if (el && strength > 5) { el.style.transition = 'none'; el.style.opacity = String(Math.min(0.85, strength / 24)); requestAnimationFrame(() => { el.style.transition = 'opacity .5s'; el.style.opacity = '0'; }); }
    },
    update(dt, car, root) {
      let moved = false;
      for (let i = 0; i < MAX; i++) {
        const b = bits[i]; if (b.life <= 0) continue; moved = true; b.life -= dt;
        b.v.y -= 9.81 * dt; b.p.addScaledVector(b.v, dt);
        const g = groundAt(b.p.x, b.p.z) + 0.02;
        if (b.p.y < g) { b.p.y = g; b.v.y = Math.abs(b.v.y) * 0.28; b.v.x *= 0.7; b.v.z *= 0.7; b.w.multiplyScalar(0.6); if (b.v.y < 0.4) { b.v.y = 0; b.r.x = 0; b.r.z = 0; b.w.set(0, 0, 0); } }
        b.r.x += b.w.x * dt; b.r.y += b.w.y * dt; b.r.z += b.w.z * dt;
        dummy.position.copy(b.p); dummy.rotation.copy(b.r); dummy.scale.copy(b.s).multiplyScalar(Math.max(0, Math.min(1, b.life))); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      }
      if (moved) mesh.instanceMatrix.needsUpdate = true;
      if (total > 18 && root) {                                   // a battered engine smokes
        smokeAcc += dt * Math.min(26, (total - 14) * 0.4);
        const p = new THREE.Vector3(0, 0.85, 1.45).applyQuaternion(root.quaternion).add(root.position), dark = total > 70;
        while (smokeAcc >= 1) { smokeAcc--; fx.smoke(p.x + (Math.random() - 0.5) * 0.4, p.y, p.z + (Math.random() - 0.5) * 0.4, (car.c?.[0] || 0), 1 + Math.random(), 0, 0.2, 1.2 + Math.random(), 1.6 + Math.random(), dark ? 0.45 : 0.25, dark ? [0.12, 0.12, 0.13] : [0.75, 0.76, 0.78], 0.8, 0.6, 0.6); }
      }
    },
    repair() {                                   // put the saved shape and paint back
      restore();
      for (const s of broken) s.visible = true; broken.clear(); total = 0; pull = 0;
    },
    percent: () => Math.min(100, Math.round(total * 0.8)),
    // a battered car loses power and pulls to the damaged side
    affect(inp, kmh) { const p = Math.min(100, total * 0.8); if (p > 25) inp.throttle *= 1 - Math.min(0.4, (p - 25) * 0.0055); if (p > 35 && kmh > 20) inp.steer = Math.max(-1, Math.min(1, inp.steer - pull * Math.min(0.07, (p - 35) * 0.0015))); },
    level: () => total,
  };
}
