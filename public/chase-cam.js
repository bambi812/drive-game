// chase-cam.js - chase camera numbers (pure math, no THREE, testable in node).
// The camera stays a fixed distance behind the car: no positional spring, so it never falls behind under acceleration.
// Only the heading (done by the caller) and the height are smoothed; speed adds a small, slow pull-back and FOV widening.
export const CAM = {
  dist: [6.8, 11], height: [2.3, 4.2],        // near / far chase, metres
  pull: 0.5, pullPerKmh: 0.003,               // extra distance at speed (max, per km/h)
  fov: [62, 62, 70, 76],                      // near, far, hood, bumper
  fovGain: 7, fovPerKmh: 0.03, nitroFov: 4,   // speed widening (max, per km/h) and nitro kick, degrees
  easeSpeed: 2.5, easeY: 14, easeFov: 3,      // 1/s
};
export const newChaseState = () => ({ ready: false, kmh: 0, y: 0, fov: CAM.fov[0] });
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
// car: {y, kmh, nitroOn}. Returns {dist, height, y (smoothed car height), fov, ahead (look-ahead, m)}
export function chaseStep(st, car, mode, dt) {
  if (!st.ready) { st.ready = true; st.y = car.y; st.kmh = car.kmh; st.fov = CAM.fov[mode]; }
  st.kmh += (car.kmh - st.kmh) * ease(CAM.easeSpeed, dt);
  st.y += (car.y - st.y) * ease(CAM.easeY, dt); st.y = Math.max(car.y - 0.6, Math.min(car.y + 0.6, st.y));   // soak up bumps, never drift far
  const want = CAM.fov[mode] + Math.min(CAM.fovGain, st.kmh * CAM.fovPerKmh) + (car.nitroOn ? CAM.nitroFov : 0);
  st.fov += (want - st.fov) * ease(CAM.easeFov, dt);
  const m = mode ? 1 : 0;
  return { dist: CAM.dist[m] + Math.min(CAM.pull, st.kmh * CAM.pullPerKmh), height: CAM.height[m], y: st.y, fov: st.fov, ahead: Math.min(1.5, st.kmh * 0.01) };
}
