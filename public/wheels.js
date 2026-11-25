// Fixes for the way some downloaded car models store their wheels.
import * as THREE from 'three';

const GET = ['getX', 'getY', 'getZ', 'getW'];
// the triangles listed in `tris` (vertex numbers, three per triangle) as a geometry of their own
function subset(geo, tris) {
  const map = new Map(), order = [], index = [];
  for (const v of tris) { let n = map.get(v); if (n === undefined) { n = order.length; map.set(v, n); order.push(v); } index.push(n); }
  const out = new THREE.BufferGeometry();
  for (const name in geo.attributes) {
    const a = geo.attributes[name], arr = new Float32Array(order.length * a.itemSize);
    order.forEach((v, i) => { for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a[GET[k]](v); });
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  out.setIndex(index); return out;
}

// Some models keep two or four wheels in one mesh, which cannot spin or steer. Meshes whose name (or material
// name) matches `re` are cut into one mesh per corner of the car.
export function splitCorners(scene, re) {
  scene.updateMatrixWorld(true);
  const mid = new THREE.Box3().setFromObject(scene, true).getCenter(new THREE.Vector3()), found = [], p = new THREE.Vector3();
  scene.traverse(o => { if (o.isMesh && (re.test(o.name) || re.test(o.material.name || ''))) found.push(o); });
  for (const mesh of found) {
    const geo = mesh.geometry, pos = geo.attributes.position, idx = geo.index, n = idx ? idx.count : pos.count, corners = [[], [], [], []];
    for (let i = 0; i + 2 < n; i += 3) {
      const t = [0, 1, 2].map(k => idx ? idx.getX(i + k) : i + k); let x = 0, z = 0;
      for (const v of t) { p.fromBufferAttribute(pos, v).applyMatrix4(mesh.matrixWorld); x += p.x / 3; z += p.z / 3; }
      corners[(x > mid.x ? 1 : 0) + (z > mid.z ? 2 : 0)].push(...t);
    }
    for (const tris of corners) {
      if (!tris.length) continue;
      const part = new THREE.Mesh(subset(geo, tris), mesh.material); part.name = mesh.name;
      part.position.copy(mesh.position); part.quaternion.copy(mesh.quaternion); part.scale.copy(mesh.scale); mesh.parent.add(part);
    }
    mesh.parent.remove(mesh);
  }
}

// How far a wheel was modelled turned (radians about the vertical axis). A tyre is much thinner along its axle
// than across it, so the axle is the horizontal direction in which its points are least spread out.
export function modelledSteer(mesh) {
  const pos = mesh.geometry.attributes.position, p = new THREE.Vector3(), c = new THREE.Box3().setFromObject(mesh, true).getCenter(new THREE.Vector3());
  let xx = 0, zz = 0, xz = 0;
  for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).sub(c); xx += p.x * p.x; zz += p.z * p.z; xz += p.x * p.z; }
  let a = 0.5 * Math.atan2(2 * xz, xx - zz) + Math.PI / 2;            // direction of least spread
  while (a > Math.PI / 2) a -= Math.PI;
  while (a <= -Math.PI / 2) a += Math.PI;
  return a;
}
