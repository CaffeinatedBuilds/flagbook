(function () {
  const R = FB.rotation;
  const mk = n => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, positions: [] }));

  test('8 players over 4 quarters: everyone plays exactly 3', () => {
    const res = R.build(mk(8), { quarters: 4 });
    const counts = R.playCounts(res.rotation);
    eq(Object.keys(counts).length, 8);
    for (const id of Object.keys(counts)) eq(counts[id], 3, id);
    for (let q = 1; q <= 4; q++) { eq(Object.keys(res.rotation[q]).length, 6); eq(res.sitting[q].length, 2); }
  });

  test('9 players: play counts differ by at most one and nobody sits twice in a row when avoidable', () => {
    const res = R.build(mk(9), { quarters: 4, seed: 3 });
    const counts = Object.values(R.playCounts(res.rotation));
    assert(Math.max(...counts) - Math.min(...counts) <= 1, JSON.stringify(counts));
    for (let q = 2; q <= 4; q++) for (const id of res.sitting[q]) assert(!res.sitting[q - 1].includes(id), id + ' sat twice');
  });

  test('6 or fewer players: all play every quarter, spots all filled', () => {
    const res = R.build(mk(6), { quarters: 4 });
    for (let q = 1; q <= 4; q++) { eq(res.sitting[q], []); eq(new Set(Object.values(res.rotation[q])).size, 6); }
    const res5 = R.build(mk(5), { quarters: 4 });
    eq(Object.values(res5.rotation[1]).filter(Boolean).length, 5);
  });

  test('preferences: the designated QB gets Q when playing', () => {
    const players = mk(8); players[3].positions = ['Q'];
    const res = R.build(players, { quarters: 4 });
    for (let q = 1; q <= 4; q++) if (!res.sitting[q].includes('p3')) eq(res.rotation[q].Q, 'p3', 'q' + q);
  });

  test('locked assignments are honoured', () => {
    const res = R.build(mk(8), { quarters: 4, locked: { 2: { X: 'p7' } } });
    eq(res.rotation[2].X, 'p7');
    eq(new Set(Object.values(res.rotation[2])).size, 6, 'no duplicates');
  });

  test('snack assignment cycles fairly and fills only empty games', () => {
    const games = [{ date: '2026-09-05', snackPlayerId: '' }, { date: '2026-09-12', snackPlayerId: 'b' }, { date: '2026-09-19', snackPlayerId: '' }, { date: '2026-09-26', snackPlayerId: '' }];
    R.assignSnacks(games, ['a', 'b', 'c']);
    eq(games[1].snackPlayerId, 'b');
    const ids = games.map(g => g.snackPlayerId);
    assert(ids.every(Boolean), JSON.stringify(ids));
    eq(new Set(ids.slice(0, 3)).size, 3, 'first three distinct: ' + JSON.stringify(ids));
  });
})();
