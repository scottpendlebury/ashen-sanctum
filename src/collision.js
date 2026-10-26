// Minimal capsule-vs-AABB collision. Colliders: {x1,y1,z1,x2,y2,z2}.
// Movement is resolved axis by axis (x, then z) which gives natural wall sliding.
const R = 0.35;

function overlaps(p, y0, y1, c, r = R) {
  return p + r > c.x1 && p - r < c.x2 && y1 > c.y1 && y0 < c.y2 && p + r > c.z1 && p - r < c.z2;
}

// Horizontal resolve for a capsule standing at feetY with height h.
export function resolve(pos, feetY, height, colliders, r = R) {
  const y0 = feetY + 0.1, y1 = feetY + height - 0.05;
  for (const c of colliders) {
    if (!c) continue;
    if (overlaps(pos.x, y0, y1, c, r) && pos.x + r > c.x1 && pos.x - r < c.x2) {
      const mid = (c.x1 + c.x2) / 2;
      pos.x = pos.x < mid ? c.x1 - r : c.x2 + r;
    }
  }
  for (const c of colliders) {
    if (!c) continue;
    if (overlaps(pos.z, y0, y1, c, r) && pos.z + r > c.z1 && pos.z - r < c.z2) {
      const mid = (c.z1 + c.z2) / 2;
      pos.z = pos.z < mid ? c.z1 - r : c.z2 + r;
    }
  }
}

// True if a circle (radius r) at (x,z) would collide at height range [y0,y1].
export function blocked(x, z, y0, y1, colliders, r = R) {
  for (const c of colliders) {
    if (!c) continue;
    if (x + r > c.x1 && x - r < c.x2 && y1 > c.y1 && y0 < c.y2 && z + r > c.z1 && z - r < c.z2) return c;
  }
  return null;
}

// Ground height under a point (highest collider top below fromY that is close).
export function groundAt(x, z, fromY, colliders, r = 0.3) {
  let g = 0; // floor plane
  for (const c of colliders) {
    if (!c) continue;
    if (x + r > c.x1 && x - r < c.x2 && z + r > c.z1 && z - r < c.z2) {
      if (c.y2 <= fromY + 0.55 && c.y2 > g) g = c.y2; // step-up tolerance
    }
  }
  return g;
}

// Ray vs AABB (slab method) for hitscan/projectiles in 3D.
export function rayHit(ox, oy, oz, dx, dy, dz, maxDist, colliders) {
  let best = null;
  for (const c of colliders) {
    if (!c || c.noRay) continue;
    let tmin = 0, tmax = maxDist;
    const lo = [c.x1, c.y1, c.z1], hi = [c.x2, c.y2, c.z2];
    const o = [ox, oy, oz], d = [dx, dy, dz];
    let ok = true;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) { ok = false; break; } continue; }
      let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) { ok = false; break; }
    }
    if (ok && tmin < maxDist && (best === null || tmin < best.t)) best = { t: tmin, collider: c };
  }
  return best;
}
