// lod.js - level of detail: what is drawn at which distance, which things cast shadows, and cheap stand-ins ("impostors") for far trees.
import * as THREE from 'three';

// distances in metres per graphics quality and class. Multiplied by the draw-distance setting.
const RANGE = {
  high: { small: 520, mid: 1100, near: 260, shadow: 190 },
  medium: { small: 340, mid: 750, near: 170, shadow: 130 },
  low: { small: 140, mid: 420, near: 100, shadow: 0 },
};
export function createLod() {
  const items = []; let last = 0, quality = 'high', scale = 1;
  const add = (mesh, cls, cast = mesh.castShadow) => { const s = mesh.boundingSphere || (mesh.geometry.computeBoundingSphere(), mesh.geometry.boundingSphere); items.push({ mesh, cls, cast, x: s.center.x + (mesh.boundingSphere ? 0 : mesh.position.x), z: s.center.z + (mesh.boundingSphere ? 0 : mesh.position.z), r: s.radius }); };
  return {
    add,
    set(q, k) { quality = q; scale = k; last = 0; },
    update(cam, now) {
      if (now - last < 250) return; last = now; const R = RANGE[quality];
      for (const it of items) {
        const d = Math.max(0, Math.hypot(it.x - cam.x, it.z - cam.z) - it.r * 0.75);
        // near = the detailed tree, far = its stand-in (always drawn beyond the near range), mid / small = bushes / tufts
        it.mesh.visible = it.cls === 'near' ? d < R.near * scale : it.cls === 'far' ? d >= R.near * scale : it.cls === 'mid' ? d < R.mid * scale : it.cls === 'small' ? d < R.small * scale : true;
        if (it.cast) it.mesh.castShadow = it.mesh.visible && d < R.shadow;
      }
    },
  };
}

// render a tree once into a texture and use it on two crossed quads (4 triangles instead of hundreds)
export function makeImpostor(renderer, geo, mat) {
  geo.computeBoundingBox(); const b = geo.boundingBox, w = 2 * Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z), h = b.max.y - Math.min(0, b.min.y), size = 256;
  const rt = new THREE.WebGLRenderTarget(size, size, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }), scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h, 0, 0.1, 200); cam.position.set(0, 0, 100); cam.lookAt(0, 0, 0);
  const tmp = new THREE.Mesh(geo, mat); scene.add(tmp, new THREE.AmbientLight(0xffffff, 2.2), new THREE.HemisphereLight(0xffffff, 0x445533, 1.2));
  const prevColor = new THREE.Color(), prevAlpha = renderer.getClearAlpha(), prevTarget = renderer.getRenderTarget(); renderer.getClearColor(prevColor);
  renderer.setRenderTarget(rt); renderer.setClearColor(0x3d6b34, 0); renderer.clear(); renderer.render(scene, cam); renderer.setRenderTarget(prevTarget); renderer.setClearColor(prevColor, prevAlpha);
  const pos = [], uv = [], nor = [], idx = [];
  for (let k = 0; k < 2; k++) { const dx = k ? 0 : w / 2, dz = k ? w / 2 : 0, o = k * 4; pos.push(-dx, 0, -dz, dx, 0, dz, dx, h, dz, -dx, h, -dz); uv.push(0, 0, 1, 0, 1, 1, 0, 1); for (let i = 0; i < 4; i++) nor.push(0, 1, 0); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); g.computeBoundingSphere();
  const m = new THREE.MeshStandardMaterial({ map: rt.texture, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1, metalness: 0, envMapIntensity: 0.5 });
  m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal); nonPerturbedNormal = normal;'); };
  return { geo: g, mat: m };
}
