(function () {
  const S = FB.store;
  test('store seeds the 8 Raiders plays on first load', () => {
    localStorage.removeItem('flagbook.v1');
    const st = S.load();
    eq(st.plays.length, 8);
    for (const p of st.plays) {
      assert(p.name, 'name');
      for (const pos of Object.keys(p.routes)) assert(p.players[pos], p.name + ' route without player ' + pos);
      for (const pos of Object.keys(p.routes)) { const r = p.routes[pos]; eq(r.pts.length, r.corners.length, 'pts/corners length'); }
    }
  });
  test('seed plays render to svg without throwing and include hot routes in red', () => {
    const st = S.get();
    const svg = FB.field.svgString(st.plays[6], {});
    assert(svg.includes('#E5352B'), 'red hot route');
    assert(svg.includes('>1<') && svg.includes('>5<'), 'step labels');
    assert(svg.includes('class="spacing"'), 'spacing group');
  });
  test('export/import round trip and merge', () => {
    const json = S.exportJSON();
    const p = S.newPlay('Temp', 'Trips Right');
    eq(Object.keys(p.players).length, 6);
    S.importJSON(json, 'replace');
    eq(S.get().plays.length, 8);
    const dup = S.duplicatePlay(S.get().plays[0].id);
    assert(dup && dup.name.endsWith('(copy)'));
    eq(S.get().plays.length, 9);
    eq(S.get().plays[1].id, dup.id, 'inserted after source');
  });
  test('substitutions overlay the lineup and reset with the quarter', () => {
    S.importJSON(JSON.stringify({
      roster: [{ id: 'a', name: 'Ava A' }, { id: 'b', name: 'Ben B' }, { id: 'c', name: 'Cy C' }, { id: 'd', name: 'Dee D' }],
      defaultRotation: { 1: { Q: 'a', C: 'b', X: 'c' }, 2: { Q: 'b', C: 'c', X: 'd' } },
      lineup: { show: true, gameId: '', quarter: 1 }
    }), 'replace');
    eq(S.lineupNames(), { Q: 'Ava', C: 'Ben', X: 'Cy' });
    eq(S.benchPlayers().map(p => p.id), ['d']);
    S.setSub('C', 'd');                                   // Dee in for Ben
    eq(S.lineupNames(), { Q: 'Ava', C: 'Dee', X: 'Cy' });
    eq(S.subbedPositions(), ['C']);
    eq(S.benchPlayers().map(p => p.id), ['b']);
    eq(S.get().defaultRotation[1].C, 'b', 'rotation record untouched');
    S.setSub('Q', 'c');                                   // Cy moves from X to Q: X empties
    eq(S.lineupNames(), { Q: 'Cy', C: 'Dee' });
    S.swapSpots('Q', 'C');
    eq(S.lineupNames(), { Q: 'Dee', C: 'Cy' });
    S.setSub('X', 'c'); S.setSub('C', 'b'); S.setSub('Q', 'a');   // manually back to the lineup
    eq(S.subbedPositions(), []);
    eq(Object.keys(S.lineupSubs()).length, 0, 'subs equal to the lineup are dropped');
    S.setSub('C', 'd');
    S.setLineup({ quarter: 2 });
    eq(S.subbedPositions(), [], 'quarter change clears subs');
    eq(S.lineupNames(), { Q: 'Ben', C: 'Cy', X: 'Dee' });
    S.setSub('X', 'a'); S.clearSubs();
    eq(S.lineupNames(), { Q: 'Ben', C: 'Cy', X: 'Dee' });
  });
  test('clip metadata lives in state.videos and survives import/merge', () => {
    S.importJSON(JSON.stringify({ games: [{ id: 'g1', opponent: 'Bears' }] }), 'replace');
    eq(S.get().videos, [], 'empty by default');
    S.importJSON(JSON.stringify({ videos: [{ id: 'v1', playId: 'p1', playName: 'Slant', gameId: 'g1', quarter: 2, sizeBytes: 5 }] }), 'merge');
    const v = S.get().videos[0];
    eq(v.id, 'v1'); eq(v.label, ''); eq(v.durationMs, null); eq(v.mimeType, '');
    eq(S.clipsFor('g1').length, 1); eq(S.clipsFor('nope').length, 0);
    S.importJSON(JSON.stringify({ videos: [{ id: 'v1', label: 'renamed' }, { id: 'v2' }] }), 'merge');
    eq(S.get().videos.length, 2); eq(S.get().videos.find(x => x.id === 'v1').label, 'renamed', 'merge is by id');
    assert(S.exportJSON().includes('"videos"'), 'exported');
    S.importJSON(JSON.stringify({ videos: 'garbage' }), 'replace');
    eq(S.get().videos, [], 'bad shape tolerated');
  });
  test('migrate fills defaults on partial data', () => {
    S.importJSON(JSON.stringify({ plays: [{ id: 'a', name: 'x', players: { Q: [1, 2] }, routes: { Q: { pts: [[0, 0], [0, -50]], corners: [true, true] } } }] }), 'replace');
    const p = S.get().plays[0];
    eq(p.routes.Q.end, 'arrow'); eq(p.spacing.show, false); eq(S.get().roster, []);
  });
})();
