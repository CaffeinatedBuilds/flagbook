/* FlagBook — route geometry: turn a hand-drawn stroke into a clean playbook route.
 *
 * Field space is the PDF page: 720 x 540 units (10in x 7.5in, 4:3 landscape).
 * A route is stored relative to its player's centre as
 *   { pts: [[dx,dy], ...], corners: [bool, ...] }
 * where corners[i] marks a sharp cut at vertex i. Runs of non-corner interior
 * vertices are rendered as a Catmull-Rom spline; everything else is straight.
 */
(function () {
  'use strict';
  const FB = (window.FB = window.FB || {});
  const G = {};

  G.FIELD_W = 720;
  G.FIELD_H = 540;
  G.LOS_Y = 358;              // line of scrimmage (matches Raiders.pdf)
  G.RECEIVER_Y = 376;         // token centre hanging just under the line
  G.UNITS_PER_YARD = 24;      // 30-yard-wide field across the page
  G.TOKEN_R = 17;

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  G.dist = dist;

  /* Remove consecutive near-duplicates. */
  G.dedupe = function (pts, eps) {
    eps = eps == null ? 0.75 : eps;
    const out = [];
    for (const p of pts) {
      if (!out.length || dist(out[out.length - 1], p) > eps) out.push([p[0], p[1]]);
    }
    return out;
  };

  /* Resample a polyline at a fixed step so jitter is uniform before simplification. */
  G.resample = function (pts, step) {
    step = step || 4;
    if (pts.length < 2) return pts.slice();
    const out = [[pts[0][0], pts[0][1]]];
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      let a = pts[i - 1], b = pts[i];
      const segLen = dist(a, b);
      if (segLen === 0) continue;
      let t = step - carry;
      while (t <= segLen) {
        const k = t / segLen;
        out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
        t += step;
      }
      carry = segLen - (t - step);
    }
    const last = pts[pts.length - 1];
    if (dist(out[out.length - 1], last) > step * 0.35) out.push([last[0], last[1]]);
    return out;
  };

  /* Perpendicular distance from p to segment ab. */
  function perpDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return dist(p, a);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return dist(p, [a[0] + t * dx, a[1] + t * dy]);
  }

  /* Ramer-Douglas-Peucker simplification. */
  G.rdp = function (pts, tol) {
    if (pts.length < 3) return pts.slice();
    const keep = new Array(pts.length).fill(false);
    keep[0] = keep[pts.length - 1] = true;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      let maxD = -1, idx = -1;
      for (let i = s + 1; i < e; i++) {
        const d = perpDist(pts[i], pts[s], pts[e]);
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > tol && idx > 0) { keep[idx] = true; stack.push([s, idx], [idx, e]); }
    }
    return pts.filter((_, i) => keep[i]);
  };

  /* Turn angle (degrees, 0..180) at vertex i. */
  G.turnAngle = function (pts, i) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]);
    if (!l1 || !l2) return 0;
    let cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2);
    cos = Math.max(-1, Math.min(1, cos));
    return Math.acos(cos) * 180 / Math.PI;
  };

  /* Snap a vector's direction to the nearest multiple of 45deg if within `within` degrees. */
  G.snapVector = function (dx, dy, within) {
    within = within == null ? 12 : within;
    const len = Math.hypot(dx, dy);
    if (len === 0) return [dx, dy];
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    const target = Math.round(ang / 45) * 45;
    let diff = Math.abs(ang - target);
    if (diff > 180) diff = 360 - diff;
    if (diff > within) return [dx, dy];
    const r = target * Math.PI / 180;
    return [Math.cos(r) * len, Math.sin(r) * len];
  };

  /* Local turn angle at resampled index i, measured over a window of `w` samples each
   * side. A true cut is sharp inside a short window; an arc bends gradually. */
  function localAngle(pts, i, w) {
    const a = pts[Math.max(0, i - w)], b = pts[i], c = pts[Math.min(pts.length - 1, i + w)];
    if (a === b || b === c) return 0;
    return G.turnAngle([a, b, c], 1);
  }

  /* RDP returning kept indices. */
  function rdpIdx(pts, tol, s0, e0) {
    const keep = new Set([s0, e0]);
    const stack = [[s0, e0]];
    while (stack.length) {
      const [s, e] = stack.pop();
      let maxD = -1, idx = -1;
      for (let i = s + 1; i < e; i++) {
        const d = perpDist(pts[i], pts[s], pts[e]);
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > tol && idx > 0) { keep.add(idx); stack.push([s, idx], [idx, e]); }
    }
    return Array.from(keep).sort((a, b) => a - b);
  }

  /* Main entry: raw stroke (absolute field coords, first point = player centre)
   * -> { pts (relative), corners }. Returns null if the stroke is too short. */
  G.processStroke = function (raw, opts) {
    opts = opts || {};
    const tol = opts.tolerance == null ? 7 : opts.tolerance;
    const cornerDeg = opts.cornerDeg == null ? 38 : opts.cornerDeg;
    const snapDeg = opts.snapDeg == null ? 12 : opts.snapDeg;
    const minLen = opts.minLen == null ? 18 : opts.minLen;
    const STEP = 4, WIN = 3;

    let pts = G.dedupe(raw);
    if (pts.length < 2) return null;
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
    if (total < minLen) return null;

    const rs = G.resample(pts, STEP);
    if (rs.length < 2) return null;
    let idx = rdpIdx(rs, tol, 0, rs.length - 1);
    // Drop tiny head/tail wobble.
    while (idx.length > 2 && dist(rs[idx[idx.length - 2]], rs[idx[idx.length - 1]]) < tol * 1.2) idx.splice(idx.length - 2, 1);
    while (idx.length > 2 && dist(rs[idx[0]], rs[idx[1]]) < tol * 1.2) idx.splice(1, 1);

    // Classify each kept interior vertex by its local angle on the raw stroke.
    const isCorner = i => localAngle(rs, i, WIN) >= cornerDeg;
    const cornerIdx = [idx[0]];
    for (let k = 1; k < idx.length - 1; k++) if (isCorner(idx[k])) cornerIdx.push(idx[k]);
    cornerIdx.push(idx[idx.length - 1]);

    // Build legs between consecutive corners. A leg is straight if the raw stroke
    // between the corners stays close to the chord; otherwise it is a curve and we
    // re-simplify it finely so the spline follows the hand-drawn arc.
    const out = [rs[cornerIdx[0]].slice()], corners = [true];
    for (let k = 0; k < cornerIdx.length - 1; k++) {
      const s = cornerIdx[k], e = cornerIdx[k + 1];
      let maxDev = 0;
      for (let i = s + 1; i < e; i++) maxDev = Math.max(maxDev, perpDist(rs[i], rs[s], rs[e]));
      if (maxDev <= tol * 1.4) {
        out.push(rs[e].slice()); corners.push(true);
      } else {
        const fine = rdpIdx(rs, Math.max(2.5, tol * 0.4), s, e);
        for (let m = 1; m < fine.length - 1; m++) { out.push(rs[fine[m]].slice()); corners.push(false); }
        out.push(rs[e].slice()); corners.push(true);
      }
    }
    if (out.length < 2) return null;

    // Snap straight legs (corner -> corner with no smooth vertices) to 45deg multiples,
    // translating everything downstream so the shape stays connected.
    for (let a = 0; a < out.length - 1; a++) {
      const b = a + 1;
      if (!corners[a] || !corners[b]) continue;
      const dx = out[b][0] - out[a][0], dy = out[b][1] - out[a][1];
      const [sx, sy] = G.snapVector(dx, dy, snapDeg);
      const ddx = out[a][0] + sx - out[b][0], ddy = out[a][1] + sy - out[b][1];
      if (ddx || ddy) for (let k = b; k < out.length; k++) { out[k][0] += ddx; out[k][1] += ddy; }
    }

    const ox = out[0][0], oy = out[0][1];
    return {
      pts: out.map(p => [Math.round((p[0] - ox) * 10) / 10, Math.round((p[1] - oy) * 10) / 10]),
      corners
    };
  };

  /* Catmull-Rom (uniform) through points -> cubic bezier segments as SVG path commands. */
  function catmullRomPath(pts) {
    let d = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ' C' + f(c1[0]) + ' ' + f(c1[1]) + ' ' + f(c2[0]) + ' ' + f(c2[1]) + ' ' + f(p2[0]) + ' ' + f(p2[1]);
    }
    return d;
  }
  const f = n => Math.round(n * 100) / 100;

  /* Build an SVG path "d" string for a route placed at origin (ox, oy).
   * The path is shortened at the end by `trimEnd` so an arrowhead can sit flush. */
  G.routePath = function (route, ox, oy, trimEnd) {
    const abs = route.pts.map(p => [p[0] + ox, p[1] + oy]);
    if (abs.length < 2) return '';
    if (trimEnd) {
      const n = abs.length;
      const a = abs[n - 2], b = abs[n - 1];
      const L = dist(a, b);
      if (L > trimEnd) {
        const k = (L - trimEnd) / L;
        abs[n - 1] = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      }
    }
    const corners = route.corners || abs.map(() => true);
    let d = 'M' + f(abs[0][0]) + ' ' + f(abs[0][1]);
    let i = 0;
    while (i < abs.length - 1) {
      let j = i + 1;
      while (j < abs.length - 1 && !corners[j]) j++;
      if (j - i > 1) d += catmullRomPath(abs.slice(i, j + 1));
      else d += ' L' + f(abs[j][0]) + ' ' + f(abs[j][1]);
      i = j;
    }
    return d;
  };

  /* Direction (unit vector) at the end of the route. */
  G.endDirection = function (route) {
    const n = route.pts.length;
    if (n < 2) return [0, -1];
    const a = route.pts[n - 2], b = route.pts[n - 1];
    const L = dist(a, b) || 1;
    return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  };

  /* Where to put the step number: beside the first leg, ~45% along it,
   * offset perpendicular. side = 1 (right of travel) or -1. */
  G.labelPoint = function (route, ox, oy, side, offset) {
    offset = offset || 24;
    const a = route.pts[0], b = route.pts[1] || route.pts[0];
    const L = dist(a, b) || 1;
    const t = Math.min(0.5, Math.max(0.35, 40 / L));
    const mx = ox + a[0] + (b[0] - a[0]) * t, my = oy + a[1] + (b[1] - a[1]) * t;
    // perpendicular (rotate direction by +90deg)
    const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
    return [mx + nx * offset * side, my + ny * offset * side];
  };

  /* Distance from a point to a route (absolute coords), for hit testing. */
  G.distanceToRoute = function (route, ox, oy, px, py) {
    const abs = route.pts.map(p => [p[0] + ox, p[1] + oy]);
    let best = Infinity;
    for (let i = 1; i < abs.length; i++) best = Math.min(best, perpDist([px, py], abs[i - 1], abs[i]));
    return best;
  };

  FB.geo = G;
})();
