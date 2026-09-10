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
    eq(v.id, 'v1'); eq(v.label, ''); eq(v.durationMs, null); eq(v.mimeType, ''); eq(v.side, 'offense', 'old clips count as offense');
    eq(S.clipsFor('g1').length, 1); eq(S.clipsFor('nope').length, 0);
    S.importJSON(JSON.stringify({ videos: [{ id: 'v1', label: 'renamed' }, { id: 'v2' }] }), 'merge');
    eq(S.get().videos.length, 2); eq(S.get().videos.find(x => x.id === 'v1').label, 'renamed', 'merge is by id');
    assert(S.exportJSON().includes('"videos"'), 'exported');
    eq(S.get().videos[0].seq, null, 'old clips have no number');
    eq(S.nextClipSeq('g1'), 1, 'numbering starts at 1 when no clip is numbered');
    S.importJSON(JSON.stringify({ videos: [{ id: 'v3', gameId: 'g1', seq: 3 }, { id: 'v7', gameId: '', seq: 7 }] }), 'merge');
    eq(S.nextClipSeq('g1'), 4); eq(S.nextClipSeq(''), 8, 'clips without a game count separately'); eq(S.nextClipSeq('other'), 1);
    // comments: signed and time-stamped; a legacy single note becomes the first comment
    S.importJSON(JSON.stringify({ videos: [{ id: 'n1', notes: 'old note', createdAt: 5 }] }), 'merge');
    const n1 = S.get().videos.find(v => v.id === 'n1');
    eq(n1.comments.length, 1); eq(n1.comments[0].text, 'old note'); eq(n1.comments[0].at, 5); eq(n1.notes, undefined);
    eq(S.addClipComment('n1', '   ', 'Ray'), null, 'empty comment ignored');
    const c = S.addClipComment('n1', ' Great catch ', ' Coach Ray ');
    eq(c.text, 'Great catch'); eq(c.by, 'Coach Ray'); assert(c.at > 0, 'timestamp');
    eq(S.get().settings.coachName, 'Coach Ray', 'name remembered');
    eq(S.get().settings.lens, 'ultra', 'default lens'); eq(S.get().settings.recMode, 'app', 'default recorder');
    eq(S.get().videos.find(v => v.id === 'n1').comments.length, 2);
    S.removeClipComment('n1', c.id);
    eq(S.get().videos.find(v => v.id === 'n1').comments.length, 1);
    S.importJSON(JSON.stringify({ videos: 'garbage' }), 'replace');
    eq(S.get().videos, [], 'bad shape tolerated');
  });
  test('two guardians per player; snack duty is labelled by the family', () => {
    S.importJSON(JSON.stringify({ roster: [
      { id: 'a', name: 'Ava Adams', guardian: 'Jane Adams', phone: '555-1', guardian2: 'John Adams', phone2: '555-2' },
      { id: 'b', name: 'Ben Brown', guardian: 'Pat Brown' },
      { id: 'c', name: 'Cy Cole' }] }), 'replace');
    eq(S.get().roster[2].guardian2, '', 'migrate default');
    eq(S.guardians('a').map(g => g.name), ['Jane Adams', 'John Adams']);
    eq(S.guardians('b').length, 1); eq(S.guardians('c'), []); eq(S.guardians('nope'), []);
    eq(S.snackLabel('a'), 'Jane & John Adams (Ava)'.replace('Jane & John Adams', 'Jane Adams & John Adams'));
    eq(S.snackLabel('b'), 'Pat Brown (Ben)');
    eq(S.snackLabel('c'), 'Cy Cole', 'falls back to the player');
    eq(S.snackLabel('nope'), '');
  });
  test('migrate fills defaults on partial data', () => {
    S.importJSON(JSON.stringify({ plays: [{ id: 'a', name: 'x', players: { Q: [1, 2] }, routes: { Q: { pts: [[0, 0], [0, -50]], corners: [true, true] } } }] }), 'replace');
    const p = S.get().plays[0];
    eq(p.routes.Q.end, 'arrow'); eq(p.spacing.show, false); eq(S.get().roster, []);
  });
})();
