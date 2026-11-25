// Chase camera test: hard acceleration with uneven frame times must not push the camera away or blow up the FOV.
// Run: node test/camera-test.js
import { chaseStep, newChaseState, CAM } from '../public/chase-cam.js';
let fail = 0; const ck = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fail++; };
const st = newChaseState(); let t = 0, kmh = 0, prev = null, maxStep = 0, maxDist = 0, maxFov = 0, i = 0, first = null;
while (t < 12) {
  const dt = [1 / 144, 1 / 60, 1 / 30, 1 / 20][i++ % 4]; t += dt; kmh = Math.min(220, kmh + (kmh < 100 ? 16 : 8) * dt);
  const c = chaseStep(st, { y: 3 + Math.sin(t * 40) * 0.03, kmh, nitroOn: false }, 0, dt);
  first ||= c; if (prev) maxStep = Math.max(maxStep, Math.abs(c.dist - prev.dist) / dt); prev = c; maxDist = Math.max(maxDist, c.dist); maxFov = Math.max(maxFov, c.fov);
}
console.log(`  0-${Math.round(kmh)} km/h: distance ${first.dist.toFixed(2)} -> ${maxDist.toFixed(2)} m, FOV ${first.fov.toFixed(0)} -> ${maxFov.toFixed(1)} deg`);
ck(maxDist - CAM.dist[0] <= 0.5 + 1e-9, 'camera pulls back by at most 0.5 m');
ck(maxFov - CAM.fov[0] <= 7 + 1e-9, 'FOV widens by at most 7 degrees');
ck(maxStep < 0.2, `distance changes slowly (max ${maxStep.toFixed(3)} m/s)`);
const n = chaseStep(st, { y: 3, kmh: 200, nitroOn: true }, 0, 1); ck(n.fov <= CAM.fov[0] + 7 + CAM.nitroFov, 'nitro adds only a small kick');
console.log(fail ? `FAIL (${fail})` : 'PASS'); process.exit(fail ? 1 : 0);
