(function () {
  const M = FB.media;
  test('media is unavailable outside a browser and its API resolves null instead of throwing', () => {
    eq(M.available, false);
    let results = [];
    M.put('a', {}).then(r => results.push(r));
    M.get('a').then(r => results.push(r));
    M.remove('a').then(r => results.push(r));
    M.usage().then(r => results.push(r));
    assert(typeof M.clear().then === 'function', 'promises');
  });
  test('fmtBytes and fmtDuration', () => {
    eq(M.fmtBytes(0), '0 B'); eq(M.fmtBytes(2048), '2 KB'); eq(M.fmtBytes(5.5 * 1024 * 1024), '5.5 MB');
    eq(M.fmtBytes(120 * 1024 * 1024), '120 MB'); eq(M.fmtBytes(1.5 * 1024 * 1024 * 1024), '1.50 GB');
    eq(M.fmtDuration(null), ''); eq(M.fmtDuration(0), '0:00'); eq(M.fmtDuration(65_400), '1:05'); eq(M.fmtDuration(3_723_000), '1:02:03');
    eq(M.extFor('video/quicktime'), '.mov'); eq(M.extFor('video/mp4'), '.mp4'); eq(M.extFor(''), '.mov');
  });
  test('meta() tags a clip with the play and the lineup game/quarter', () => {
    const m = M.meta({ id: 'v9', file: { size: 1234, type: 'video/quicktime' }, play: { id: 'p1', name: 'Slant' }, lineup: { show: true, gameId: 'g1', quarter: 3 }, durationMs: 4200, createdAt: 7, seq: 4 });
    eq(m, { id: 'v9', playId: 'p1', playName: 'Slant', side: 'offense', gameId: 'g1', quarter: 3, seq: 4, label: 'Play 4 · Slant · Q3', comments: [], createdAt: 7, durationMs: 4200, sizeBytes: 1234, mimeType: 'video/quicktime' });
    const d = M.meta({ file: {}, play: { id: '', name: 'Defense' }, lineup: { gameId: 'g1', quarter: 2 }, seq: 5, side: 'defense' });
    eq(d.side, 'defense'); eq(d.label, 'Play 5 · Defense · Q2'); eq(d.playId, '');
    eq(M.meta({ file: {}, play: {}, lineup: {}, side: 'bogus' }).side, 'offense');
    const hd = M.meta({ file: {}, play: {}, lineup: {}, width: 1920.4, height: 1080 });
    eq(hd.width, 1920); eq(hd.height, 1080);
    assert(!('width' in M.meta({ file: {}, play: {}, lineup: {}, width: 0, height: 1080 })), 'no half-known size');
    const m2 = M.meta({ file: {}, play: {}, lineup: {} });
    assert(m2.id, 'id generated'); eq(m2.label, 'Play'); eq(m2.quarter, null); eq(m2.seq, null); eq(m2.gameId, ''); eq(m2.durationMs, null); eq(m2.sizeBytes, 0);
  });
})();
