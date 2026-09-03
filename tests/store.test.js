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
  test('migrate fills defaults on partial data', () => {
    S.importJSON(JSON.stringify({ plays: [{ id: 'a', name: 'x', players: { Q: [1, 2] }, routes: { Q: { pts: [[0, 0], [0, -50]], corners: [true, true] } } }] }), 'replace');
    const p = S.get().plays[0];
    eq(p.routes.Q.end, 'arrow'); eq(p.spacing.show, false); eq(S.get().roster, []);
  });
})();
