/* FlagBook — quarter-by-quarter rotation and snack assignment. */
(function () {
  'use strict';
  const FB = (window.FB = window.FB || {});
  const ROT = {};

  /* Deterministic tiny PRNG so "shuffle" is repeatable for a given seed. */
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /**
   * Build a fair rotation.
   * @param players  [{id, positions:[...preferred spot letters]}]
   * @param opts     { quarters=4, spots=[...6 letters], locked:{q:{spot:id}}, seed, history:{playerId:{spot:count}} }
   * @returns { rotation:{1:{Q:id,...},...}, sitting:{1:[ids],...}, plays:{id:count} }
   */
  ROT.build = function (players, opts) {
    opts = opts || {};
    const quarters = opts.quarters || 4;
    const spots = opts.spots || FB.store.POSITIONS;
    const locked = opts.locked || {};
    const rand = rng(opts.seed == null ? 7 : opts.seed);
    const spotCount = {};          // playerId -> spot -> times played this game
    const plays = {};              // playerId -> quarters played
    const lastSat = {};            // playerId -> last quarter they sat (for fairness)
    for (const p of players) { plays[p.id] = 0; spotCount[p.id] = {}; lastSat[p.id] = 0; }
    const history = opts.history || {};

    const rotation = {}, sitting = {};
    for (let q = 1; q <= quarters; q++) {
      const lockedQ = locked[q] || {};
      const lockedIds = new Set(Object.values(lockedQ).filter(Boolean));
      // Choose who plays this quarter: locked first, then fewest quarters played, then longest since sat.
      const need = Math.min(spots.length, players.length);
      const pool = players.filter(p => !lockedIds.has(p.id));
      const order = pool.map(p => ({ p, r: rand() })).sort((a, b) => {
        const d = plays[a.p.id] - plays[b.p.id];
        if (d) return d;
        const s = lastSat[b.p.id] - lastSat[a.p.id];
        if (s) return s;                 // sat most recently plays first
        return a.r - b.r;
      }).map(x => x.p);
      const playing = players.filter(p => lockedIds.has(p.id)).concat(order.slice(0, Math.max(0, need - lockedIds.size)));
      const bench = players.filter(p => !playing.includes(p));

      // Assign spots: locked, then preference-aware greedy (Q and C first since they're specialised).
      const assign = {};
      for (const s of spots) if (lockedQ[s]) assign[s] = lockedQ[s];
      const free = playing.filter(p => !Object.values(assign).includes(p.id));
      const spotOrder = ['Q', 'C'].filter(s => spots.includes(s)).concat(spots.filter(s => s !== 'Q' && s !== 'C'));
      for (const s of spotOrder) {
        if (assign[s]) continue;
        if (!free.length) break;
        // score: prefers this spot (+), has played it fewer times this game / historically (+)
        let best = null, bestScore = -Infinity;
        for (const p of free) {
          const prefIdx = (p.positions || []).indexOf(s);
          const hasPrefs = (p.positions || []).length > 0;
          let score = 0;
          if (prefIdx >= 0) score += 10 - prefIdx;
          else if (hasPrefs) score -= 4;          // they'd rather be elsewhere
          score -= (spotCount[p.id][s] || 0) * 3;
          score -= ((history[p.id] || {})[s] || 0) * 0.5;
          score += rand() * 0.01;
          if (score > bestScore) { bestScore = score; best = p; }
        }
        assign[s] = best.id;
        free.splice(free.indexOf(best), 1);
      }
      rotation[q] = assign;
      sitting[q] = bench.map(p => p.id);
      for (const id of Object.values(assign)) { plays[id]++; }
      for (const s of Object.keys(assign)) { const id = assign[s]; spotCount[id][s] = (spotCount[id][s] || 0) + 1; }
      for (const p of bench) lastSat[p.id] = q;
    }
    return { rotation, sitting, plays };
  };

  /* Summarise how many quarters each player plays in a rotation. */
  ROT.playCounts = function (rotation) {
    const out = {};
    for (const q of Object.keys(rotation || {})) {
      for (const id of Object.values(rotation[q] || {})) if (id) out[id] = (out[id] || 0) + 1;
    }
    return out;
  };

  /* Who sits in quarter q, given roster ids and a rotation. */
  ROT.sittingFor = function (rotation, q, rosterIds) {
    const on = new Set(Object.values((rotation || {})[q] || {}).filter(Boolean));
    return rosterIds.filter(id => !on.has(id));
  };

  /* Assign snacks to games without one, cycling through the roster in order,
   * starting after whoever most recently had it. */
  ROT.assignSnacks = function (games, rosterIds) {
    if (!rosterIds.length) return games;
    const sorted = games.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let idx = -1;
    for (const g of sorted) {
      if (g.snackPlayerId) { const i = rosterIds.indexOf(g.snackPlayerId); if (i >= 0) idx = i; }
    }
    // Count how many times each has done it, prefer fewest
    const counts = {}; rosterIds.forEach(id => counts[id] = 0);
    for (const g of sorted) if (g.snackPlayerId && counts[g.snackPlayerId] != null) counts[g.snackPlayerId]++;
    for (const g of sorted) {
      if (g.snackPlayerId) continue;
      // next in order with the minimum count
      const min = Math.min(...rosterIds.map(id => counts[id]));
      let pick = null;
      for (let k = 1; k <= rosterIds.length; k++) {
        const id = rosterIds[(idx + k) % rosterIds.length];
        if (counts[id] === min) { pick = id; idx = (idx + k) % rosterIds.length; break; }
      }
      g.snackPlayerId = pick; counts[pick]++;
    }
    return games;
  };

  FB.rotation = ROT;
})();
