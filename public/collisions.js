// collisions.js - the shapes used for crashes: the car is a rectangle, obstacles are circles or boxes. Pure functions (tested).
export function satObb(a, b) {                       // a, b: {x,z,fx,fz,hl,hw}. Returns {nx,nz,depth,px,pz}; the normal points from b towards a
  const axes = [[a.fx, a.fz], [-a.fz, a.fx], [b.fx, b.fz], [-b.fz, b.fx]], dx = a.x - b.x, dz = a.z - b.z; let best = null, bi = 0;
  for (let i = 0; i < 4; i++) { const ax = axes[i][0], az = axes[i][1], ra = a.hl * Math.abs(a.fx * ax + a.fz * az) + a.hw * Math.abs(-a.fz * ax + a.fx * az), rb = b.hl * Math.abs(b.fx * ax + b.fz * az) + b.hw * Math.abs(-b.fz * ax + b.fx * az), dd = dx * ax + dz * az, ov = ra + rb - Math.abs(dd);
    if (ov <= 0) return null; if (!best || ov < best.depth) { best = { depth: ov, nx: dd < 0 ? -ax : ax, nz: dd < 0 ? -az : az }; bi = i; } }
  // contact point: the corners of each box that are inside the other (head on into a wall = the middle of the bumper, never a far corner of the building)
  const cor = o => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([s1, s2]) => [o.x + o.fx * o.hl * s1 - o.fz * o.hw * s2, o.z + o.fz * o.hl * s1 + o.fx * o.hw * s2]);
  const inside = (q, o) => { const ex = q[0] - o.x, ez = q[1] - o.z; return Math.abs(ex * o.fx + ez * o.fz) <= o.hl + 0.02 && Math.abs(-ex * o.fz + ez * o.fx) <= o.hw + 0.02; };
  const pts = [...cor(a).filter(q => inside(q, b)), ...cor(b).filter(q => inside(q, a))];
  if (pts.length) { best.px = pts.reduce((s, q) => s + q[0], 0) / pts.length; best.pz = pts.reduce((s, q) => s + q[1], 0) / pts.length; }
  else {                                                      // edges cross without a corner inside: nearest point of the car towards the obstacle
    const lf = Math.max(-a.hl, Math.min(a.hl, -dx * a.fx - dz * a.fz)), ll = Math.max(-a.hw, Math.min(a.hw, dx * a.fz - dz * a.fx)); best.px = a.x + a.fx * lf - a.fz * ll; best.pz = a.z + a.fz * lf + a.fx * ll; }
  return best;
}
// a guard rail is one long barrier, not a row of poles: it only pushes sideways (perpendicular to the rail), so a car that
// brushes it slides along. (tx, tz) is the rail direction at this post.
export function railHit(a, ox, oz, tx, tz, r) {
  const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; let nx = -tz, nz = tx, dist = (a.x - ox) * nx + (a.z - oz) * nz; if (dist < 0) { nx = -nx; nz = -nz; dist = -dist; }
  const fn = a.fx * nx + a.fz * nz, ln = -a.fz * nx + a.fx * nz, e = a.hl * Math.abs(fn) + a.hw * Math.abs(ln), depth = e + r - dist; if (depth <= 0) return null;
  if (Math.abs((ox - a.x) * tx + (oz - a.z) * tz) > a.hl * Math.abs(a.fx * tx + a.fz * tz) + a.hw * Math.abs(-a.fz * tx + a.fx * tz) + r) return null;
  const lead = -Math.sign(fn) * a.hl * Math.min(1, Math.abs(fn) * 6) * (1 - Math.abs(fn));         // the end nearer the rail touches first and steers the car away
  return { nx, nz, depth, px: a.x - nx * e + a.fx * lead, pz: a.z - nz * e + a.fz * lead };
}
export function circleHull(a, ox, oz, r, speed = 0) {           // circular obstacle vs the hull: closest point on the rectangle
  const dx = ox - a.x, dz = oz - a.z, lf = dx * a.fx + dz * a.fz, ll = dx * -a.fz + dz * a.fx, qf = Math.max(-a.hl, Math.min(a.hl, lf)), ql = Math.max(-a.hw, Math.min(a.hw, ll)), ef = lf - qf, el = ll - ql, d = Math.hypot(ef, el); if (d >= r) return null;
  let nf, nl, depth; if (d > 1e-4) { nf = -ef / d; nl = -el / d; depth = r - d; } else { const df = a.hl - Math.abs(lf), dl2 = a.hw - Math.abs(ll); if (df < dl2 + speed / 50) { nf = -Math.sign(lf || 1); nl = 0; depth = df + r; } else { nf = 0; nl = -Math.sign(ll || 1); depth = dl2 + r; } }
  const nx = nf * a.fx + nl * -a.fz, nz = nf * a.fz + nl * a.fx; return { nx, nz, depth, px: a.x + qf * a.fx + ql * -a.fz, pz: a.z + qf * a.fz + ql * a.fx };
}
