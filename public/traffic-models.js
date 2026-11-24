// traffic-models.js - four believable traffic body types (sedan, hatchback, SUV, van), built from extruded side silhouettes with rounded edges,
// glass bands, wheels and head/tail lights. Returned as {body, lights} geometries; the body is tinted per instance, lights are not.
import * as THREE from 'three';
const SHAPES = {   // side silhouette [z, y] (front = +z), metres; width, wheelbase half-length
  sedan: { w: 1.82, pts: [[-2.3, 0.38], [-2.3, 0.86], [-2.05, 0.98], [-1.25, 1.02], [-0.8, 1.42], [0.5, 1.42], [1.15, 1.02], [2.0, 0.9], [2.3, 0.74], [2.3, 0.38]], glass: [-1.18, 1.05, -0.78, 1.38, 0.48, 1.38, 1.08, 1.05], wheels: [1.38, -1.38], r: 0.33 },
  hatch: { w: 1.74, pts: [[-2.0, 0.38], [-2.0, 0.95], [-1.9, 1.3], [-1.3, 1.45], [0.35, 1.45], [1.0, 1.04], [1.75, 0.9], [2.0, 0.72], [2.0, 0.38]], glass: [-1.82, 1.1, -1.28, 1.41, 0.32, 1.41, 0.95, 1.08], wheels: [1.2, -1.2], r: 0.31 },
  suv:   { w: 1.94, pts: [[-2.4, 0.5], [-2.4, 1.2], [-2.25, 1.78], [0.7, 1.8], [1.3, 1.25], [2.15, 1.1], [2.4, 0.9], [2.4, 0.5]], glass: [-2.2, 1.28, -2.15, 1.75, 0.62, 1.75, 1.2, 1.28], wheels: [1.55, -1.5], r: 0.4 },
  van:   { w: 1.98, pts: [[-2.6, 0.5], [-2.6, 2.05], [-2.4, 2.2], [1.1, 2.2], [1.9, 1.45], [2.5, 1.2], [2.6, 0.95], [2.6, 0.5]], glass: [0.15, 1.4, 0.3, 2.1, 1.0, 2.1, 1.7, 1.4], wheels: [1.7, -1.7], r: 0.36 },
};
const col = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const clean = g => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; };
function extrude(poly, w, bevel) {   // poly: [[z,y],...] -> geometry spanning x in [-w/2, w/2]
  const sh = new THREE.Shape(); poly.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y))); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: w - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
  g.translate(0, 0, -(w - 2 * bevel) / 2); g.rotateY(-Math.PI / 2); return g;
}
export function makeTrafficTypes(merge) {
  return Object.values(SHAPES).map(S => {
    const body = [col(clean(extrude(S.pts, S.w, 0.1)), '#ffffff')];
    const gl = []; for (let i = 0; i < S.glass.length; i += 2) gl.push([S.glass[i], S.glass[i + 1]]);
    body.push(col(clean(extrude(gl, S.w + 0.05, 0)), '#10161f'));
    const front = Math.max(...S.pts.map(p => p[0])), rear = Math.min(...S.pts.map(p => p[0]));
    for (const wz of S.wheels) for (const sx of [-1, 1]) { body.push(col(clean(new THREE.CylinderGeometry(S.r, S.r, 0.24, 14).rotateZ(Math.PI / 2).translate(sx * (S.w / 2 - 0.1), S.r, wz)), '#0c0c0d')); body.push(col(clean(new THREE.CylinderGeometry(S.r * 0.62, S.r * 0.62, 0.26, 10).rotateZ(Math.PI / 2).translate(sx * (S.w / 2 - 0.1), S.r, wz)), '#7d8289')); }
    const lights = [];
    for (const sx of [-1, 1]) { lights.push(col(clean(new THREE.BoxGeometry(0.42, 0.14, 0.06).translate(sx * (S.w / 2 - 0.3), 0.82, front + 0.02)), '#fff4d0')); lights.push(col(clean(new THREE.BoxGeometry(0.4, 0.13, 0.06).translate(sx * (S.w / 2 - 0.3), 0.9, rear - 0.02)), '#d81818')); }
    lights.push(col(clean(new THREE.BoxGeometry(S.w - 0.5, 0.05, 0.05).translate(0, 0.9, rear - 0.03)), '#a01010'));
    return { len: front - rear, body: merge(body), lights: merge(lights) };
  });
}
