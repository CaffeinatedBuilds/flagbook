(function () {
  const G = FB.geo;

  test('resample keeps endpoints and spacing', () => {
    const r = G.resample([[0, 0], [100, 0]], 10);
    near(r[0][0], 0); near(r[r.length - 1][0], 100, 0.01);
    assert(r.length >= 10 && r.length <= 12, 'count ' + r.length);
  });

  test('rdp collapses a straight jittery line to two points', () => {
    const pts = []; for (let i = 0; i <= 100; i++) pts.push([i, (i % 2) * 2]);
    eq(G.rdp(pts, 5).length, 2);
  });

  test('processStroke: near-vertical go route snaps to exactly vertical', () => {
    const raw = []; for (let i = 0; i <= 60; i++) raw.push([300 + Math.sin(i) * 1.5 + i * 0.08, 376 - i * 2]);
    const r = G.processStroke(raw);
    assert(r, 'route'); eq(r.pts.length, 2, 'two vertices');
    near(r.pts[1][0], 0, 0.01, 'dx'); near(r.pts[1][1], -120, 1.5, 'dy');
  });

  test('processStroke: L-shaped out route keeps a sharp corner and both legs snapped', () => {
    const raw = [];
    for (let i = 0; i <= 50; i++) raw.push([200 + Math.sin(i * 3) * 1.2, 376 - i * 2]);
    for (let i = 1; i <= 40; i++) raw.push([200 + i * 2, 276 + Math.cos(i) * 1.2]);
    const r = G.processStroke(raw);
    eq(r.pts.length, 3, 'three vertices: ' + JSON.stringify(r.pts));
    eq(r.corners, [true, true, true]);
    near(r.pts[1][0], 0, 0.01); near(r.pts[2][1], r.pts[1][1], 0.01, 'horizontal second leg');
  });

  test('processStroke: a swing (arc) keeps smooth interior vertices', () => {
    const raw = [];
    for (let a = 0; a <= 90; a += 2) { const t = a * Math.PI / 180; raw.push([500 - Math.sin(t) * 150, 376 + Math.sin(2 * t) * 60]); }
    const r = G.processStroke(raw);
    assert(r.pts.length >= 3, 'has interior pts ' + r.pts.length);
    assert(r.corners.slice(1, -1).some(c => c === false), 'some smooth vertices: ' + JSON.stringify(r.corners));
  });

  test('processStroke rejects tiny scribbles', () => {
    eq(G.processStroke([[0, 0], [3, 2], [5, 4]]), null);
  });

  test('routePath uses curves for smooth runs and lines for corners', () => {
    const straight = G.routePath({ pts: [[0, 0], [0, -100], [50, -100]], corners: [true, true, true] }, 100, 300, 0);
    assert(/^M100 300 L100 200 L150 200$/.test(straight), straight);
    const curvy = G.routePath({ pts: [[0, 0], [20, 30], [60, 40], [100, 30]], corners: [true, false, false, true] }, 0, 0, 0);
    assert(curvy.includes(' C'), curvy); assert(!curvy.includes(' L'), curvy);
  });

  test('routePath trims the end so the arrowhead sits flush', () => {
    const d = G.routePath({ pts: [[0, 0], [0, -100]], corners: [true, true] }, 100, 300, 12);
    assert(/L100 212$/.test(d), d);
  });

  test('snapVector snaps within tolerance only', () => {
    const [x, y] = G.snapVector(100, 8, 12); near(x, Math.hypot(100, 8)); near(y, 0);
    const [x2, y2] = G.snapVector(100, 40, 12); near(x2, 100); near(y2, 40);
  });

  test('labelPoint offsets to the requested side of the first leg', () => {
    const r = { pts: [[0, 0], [0, -100]], corners: [true, true] };
    const [rx] = G.labelPoint(r, 300, 376, 1, 22);   // travelling up: right side = +x
    const [lx] = G.labelPoint(r, 300, 376, -1, 22);
    assert(rx > 300 && lx < 300, rx + ' ' + lx);
  });

  test('distanceToRoute hit-tests', () => {
    const r = { pts: [[0, 0], [0, -100]], corners: [true, true] };
    near(G.distanceToRoute(r, 100, 300, 105, 250), 5);
  });
})();
