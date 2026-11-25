// damage.js - what a crash looks like: dented bodywork, flying bits of paint / plastic / glass, a screen jolt, smoke from a battered engine.
import * as THREE from 'three';

const MAX = 260;
export function createDamage({ scene, fx, groundAt }) {
  const dented = new Set(), broken = new Set(); let total = 0, smokeAcc = 0, pull = 0;
  // debris pool
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.35 }), MAX);
  mesh.frustumCulled = false; mesh.castShadow = true; scene.add(mesh);
  const bits = Array.from({ length: MAX }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: new THREE.Vector3() }));
  const dummy = new THREE.Object3D(), color = new THREE.Color(); let next = 0;
  for (let i = 0; i < MAX; i++) { dummy.scale.set(0, 0, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, color.set(0)); }
  function throwBits(point, normal, vel, strength, paint) {
    const n = Math.min(70, Math.round(strength * 4));
    for (let k = 0; k < n; k++) {
      const b = bits[next], i = next; next = (next + 1) % MAX;
      const kind = Math.random(), glass = strength > 9 && kind < 0.35, plastic = !glass && kind < 0.65;
      b.life = 3 + Math.random() * 3; b.p.set(point.x + (Math.random() - 0.5) * 0.7, point.y + Math.random() * 0.5, point.z + (Math.random() - 0.5) * 0.7);
      const sp = 1.5 + Math.random() * strength * 0.45;
      b.v.set(vel.x * 0.5 + normal.x * sp * (Math.random() - 0.2) + (Math.random() - 0.5) * sp, 1 + Math.random() * sp * 0.7, vel.z * 0.5 + normal.z * sp * (Math.random() - 0.2) + (Math.random() - 0.5) * sp);
      b.w.set(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7); b.r.set(Math.random() * 3, Math.random() * 3, 0);
      if (glass) b.s.set(0.035 + Math.random() * 0.05, 0.012, 0.03 + Math.random() * 0.04); else b.s.set(0.05 + Math.random() * 0.17, 0.015 + Math.random() * 0.025, 0.04 + Math.random() * 0.1);
      mesh.setColorAt(i, color.set(glass ? 0xcfe8ff : plastic ? 0x17181b : paint));
    }
    mesh.instanceColor.needsUpdate = true;
  }
  // push the vertices near the impact inwards (the geometry is copied the first time, so other cars with the same model stay intact)
  function dent(body, point, normal, strength) {
    const radius = 0.65 + Math.min(0.75, strength * 0.045), depth = Math.min(0.45, (strength - 1.5) * 0.034);
    if (depth <= 0) return;
    const v = new THREE.Vector3(), w = new THREE.Vector3(), sphere = new THREE.Sphere(), inv = new THREE.Matrix3();
    body.updateWorldMatrix(true, true);
    body.traverse(o => {
      if (!o.isMesh) return; for (let p = o; p && p !== body; p = p.parent) if (p.userData.wheel) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); if (sphere.center.distanceTo(point) > sphere.radius + radius) return;
      const P0 = o.geometry.attributes.position; if (!P0) return;
      // distances are measured in the world: the packed models have uneven scales, so mesh units are not metres
      let hit = null;
      for (let i = 0; i < P0.count; i++) { w.set(P0.getX(i), P0.getY(i), P0.getZ(i)).applyMatrix4(o.matrixWorld); const d2 = w.distanceToSquared(point); if (d2 < radius * radius) (hit ||= []).push([i, 1 - Math.sqrt(d2) / radius, w.x - point.x, w.y - point.y, w.z - point.z]); }
      if (!hit) return;
      // the car models are packed (interleaved, quantised): give the dented copy plain float positions and normals
      if (!o.userData.original) {
        o.userData.original = o.geometry; o.geometry = o.geometry.clone(); dented.add(o);
        for (const name of ['position', 'normal']) { const a = o.userData.original.attributes[name]; if (!a) continue; const f = new Float32Array(a.count * 3); for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); } o.geometry.setAttribute(name, new THREE.BufferAttribute(f, 3)); }
      }
      if (!o.userData.paintMarks) markable(o);
      inv.setFromMatrix4(o.matrixWorld).invert();
      const col = o.geometry.attributes.color, P = o.geometry.attributes.position, N = o.geometry.attributes.normal, push = new THREE.Vector3().copy(normal).multiplyScalar(depth).applyMatrix3(inv);
      for (const [i, f, x, y, z] of hit) {
        v.fromBufferAttribute(P, i);
        const wrinkle = 0.65 + 0.7 * Math.abs(Math.sin(x * 11.3 + y * 17.9 + z * 13.1)), k = Math.min(1, f * 1.6) * wrinkle;
        P.setXYZ(i, v.x + push.x * k, v.y + push.y * k, v.z + push.z * k);
        // scraped paint: dark scuffs, deepest where the hit was hardest
        const scuff = Math.sin(x * 29.1 + z * 5.7) * Math.sin(y * 21.3 - z * 18.9), mark = 1 - Math.min(0.85, f * f * Math.min(1.5, strength / 8) * (0.5 + Math.abs(scuff)));
        col.setXYZ(i, Math.min(col.getX(i), mark), Math.min(col.getY(i), mark), Math.min(col.getZ(i), mark));
        if (N) { v.fromBufferAttribute(N, i); v.x += (wrinkle - 1) * f * 1.1; v.y += Math.sin(i * 12.9898) * f * 0.45; v.z += (1 - wrinkle) * f * 1.1; v.normalize(); N.setXYZ(i, v.x, v.y, v.z); }
      }
      P.needsUpdate = true; col.needsUpdate = true; if (N) N.needsUpdate = true; o.geometry.computeBoundingSphere();
    });
  }
  const matsOf = o => (Array.isArray(o.material) ? o.material : [o.material]);
  function markable(o) {                      // give this mesh a vertex colour layer so it can be scuffed (materials are per car, not shared)
    const g = o.geometry, n = g.attributes.position.count, old = g.attributes.color, f = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { f[i * 3] = old ? old.getX(i) : 1; f[i * 3 + 1] = old ? old.getY(i) : 1; f[i * 3 + 2] = old ? old.getZ(i) : 1; }
    g.setAttribute('color', new THREE.BufferAttribute(f, 3));
    o.userData.paintMarks = matsOf(o).map(m => m.vertexColors); for (const m of matsOf(o)) { m.vertexColors = true; m.needsUpdate = true; }
  }
  function breakLamps(body, point) {          // a lamp close to the hit goes dark
    const w = new THREE.Vector3();
    body.traverse(o => { if (!o.isSprite) return; for (let p = o.parent; p && p !== body; p = p.parent) if (p.userData.wheel) return; if (o.getWorldPosition(w).distanceTo(point) < 0.75) { o.visible = false; broken.add(o); } });
  }
  const flash = () => document.getElementById('hit');
  return {
    // point: world contact, normal: world direction from the obstacle into the car, strength: closing speed (m/s)
    impact(body, point, normal, vel, strength, paint) {
      if (strength < 1.8) return;
      total += strength;
      if (strength > 4) { breakLamps(body, point); const local = body.worldToLocal(point.clone()); pull = Math.max(-1, Math.min(1, pull + Math.sign(local.x) * strength / 30)); }
      dent(body, point, normal, strength);
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
    repair() {
      for (const o of dented) {
        if (o.userData.paintMarks) { matsOf(o).forEach((m, i) => { m.vertexColors = o.userData.paintMarks[i]; m.needsUpdate = true; }); o.userData.paintMarks = null; }
        if (o.userData.original) { o.geometry.dispose(); o.geometry = o.userData.original; o.userData.original = null; } }
      for (const s of broken) s.visible = true; broken.clear(); dented.clear(); total = 0; pull = 0;
    },
    percent: () => Math.min(100, Math.round(total * 0.8)),
    // a battered car loses power and pulls to the damaged side
    affect(inp, kmh) { const p = Math.min(100, total * 0.8); if (p > 25) inp.throttle *= 1 - Math.min(0.4, (p - 25) * 0.0055); if (p > 35 && kmh > 20) inp.steer = Math.max(-1, Math.min(1, inp.steer - pull * Math.min(0.07, (p - 35) * 0.0015))); },
    level: () => total,
  };
}
