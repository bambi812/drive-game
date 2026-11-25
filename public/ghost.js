// ghost.js - your best run of each race, replayed as a see-through car so a solo race has someone to chase.
// Recorded in the browser (10 samples a second); only a run that set a new personal best replaces the ghost.
import * as THREE from 'three';

const STEP = 100;   // ms between samples
export function createGhost(scene) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x7ee8ff, transparent: true, opacity: 0.38, depthWrite: false });
  const car = new THREE.Group();
  const part = (w, h, d, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(0, y, z); car.add(m); };
  part(1.8, 0.5, 4.3, 0.62, 0); part(1.55, 0.45, 2.1, 1.08, -0.25);
  for (const [x, z] of [[-0.82, 1.35], [0.82, 1.35], [-0.82, -1.35], [0.82, -1.35]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.26, 12).rotateZ(Math.PI / 2), mat); w.position.set(x, 0.33, z); car.add(w); }
  car.visible = false; scene.add(car);
  let run = [], best = null, bestId = '', id = '', start = 0;
  const load = key => { try { return JSON.parse(localStorage.getItem('ghost:' + key)); } catch (e) { return null; } };
  return {
    reset() { run = []; start = 0; car.visible = false; },
    update(c, race, now) {
      if (!race.id || race.state !== 'running') { car.visible = false; if (race.state !== 'running') start = 0; return; }
      if (!start || id !== race.id) { id = race.id; run = []; start = now - (race.t || 0); if (bestId !== id) { best = load(id); bestId = id; } }
      const t = now - start, i = Math.floor(t / STEP);
      while (run.length <= i && run.length < 6000) run.push([Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10, Math.round(c.z * 10) / 10, Math.round(c.yaw * 100) / 100]);
      if (!best || i + 1 >= best.length) { car.visible = false; return; }
      const a = best[i], b = best[i + 1], u = t / STEP - i, turn = Math.atan2(Math.sin(b[3] - a[3]), Math.cos(b[3] - a[3]));
      car.visible = true; car.position.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u); car.rotation.y = a[3] + turn * u;
    },
    finish(raceId, mine) {
      if (mine && raceId === id && run.length > 10 && (!mine.prevBest || mine.time <= mine.best)) { try { localStorage.setItem('ghost:' + raceId, JSON.stringify(run)); } catch (e) { } best = run; bestId = raceId; }
      run = []; start = 0; car.visible = false;
    },
  };
}