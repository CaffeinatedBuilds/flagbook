/* FlagBook — state, persistence, import/export and seed data. */
(function () {
  'use strict';
  const FB = (window.FB = window.FB || {});
  const U = FB.util;
  const KEY = 'flagbook.v1';

  const POSITIONS = ['Q', 'C', 'X', 'Y', 'Z', 'R'];
  const POSITION_META = {
    Q: { name: 'Quarterback', shape: 'diamond', fill: '#111111', text: '#ffffff' },
    C: { name: 'Center',      shape: 'circle',  fill: '#808080', text: '#ffffff' },
    X: { name: 'X receiver',  shape: 'circle',  fill: '#6A2C91', text: '#ffffff' },
    Y: { name: 'Y receiver',  shape: 'circle',  fill: '#4A6FC4', text: '#ffffff' },
    Z: { name: 'Z receiver',  shape: 'circle',  fill: '#F5D66F', text: '#ffffff' },
    R: { name: 'R receiver',  shape: 'circle',  fill: '#4CAF50', text: '#ffffff' }
  };

  /* Default alignment used when a player is tapped onto the field from the bench. */
  const DEFAULT_SPOTS = {
    Y: [40, 376], Z: [180, 376], C: [360, 376], R: [530, 376], X: [690, 376], Q: [360, 420]
  };

  const FORMATIONS = {
    'Spread':      { Y: [40, 376], Z: [180, 376], C: [360, 376], R: [530, 376], X: [690, 376], Q: [360, 420] },
    'Trips Right': { Y: [60, 376], C: [300, 376], Z: [430, 376], R: [520, 376], X: [640, 376], Q: [300, 420] },
    'Trips Left':  { X: [80, 376], R: [200, 376], Z: [290, 376], C: [420, 376], Y: [660, 376], Q: [420, 420] },
    'Twins':       { Y: [60, 376], Z: [160, 376], C: [360, 376], R: [560, 376], X: [660, 376], Q: [360, 420] },
    'Bunch Right': { Y: [80, 376], C: [330, 376], Z: [440, 376], R: [500, 400], X: [560, 376], Q: [330, 420] },
    'Tight':       { Y: [230, 376], Z: [300, 376], C: [360, 376], R: [420, 376], X: [490, 376], Q: [360, 420] }
  };

  function emptyState() {
    return {
      version: 1,
      team: { name: 'Raiders', season: '' },
      roster: [],
      practices: [],
      games: [],
      plays: [],
      settings: { showYardGrid: false, quarters: 4 },
      lineup: { show: true, gameId: '', quarter: 1 },   // which names the playbook shows
      defaultRotation: {}                                // team lineup used when no game is picked
    };
  }

  /* ---------- seed plays traced from Raiders.pdf ---------- */
  function R(pts, o) {
    // pts: absolute field coords starting at the player's centre
    o = o || {};
    const ox = pts[0][0], oy = pts[0][1];
    const rel = pts.map(p => [Math.round((p[0] - ox) * 10) / 10, Math.round((p[1] - oy) * 10) / 10]);
    const corners = pts.map((_, i) => (o.smooth ? (i === 0 || i === pts.length - 1) : true));
    return {
      pts: rel, corners,
      hot: !!o.hot, steps: o.steps == null ? null : o.steps,
      end: o.end || 'arrow', dashed: !!o.dashed, labelSide: o.labelSide || 1
    };
  }
  const GO = (x, steps, top, side) => R([[x, 376], [x, top || 250]], { steps, labelSide: side || 1 });

  function seedPlays() {
    const now = Date.now();
    const mk = (name, players, routes, extra) => Object.assign({
      id: U.uid(), name, notes: '', players, routes,
      spacing: { show: false, labels: {} }, createdAt: now, updatedAt: now
    }, extra || {});

    return [
      mk('4 Verts – R Swing',
        { Y: [25, 376], Z: [181, 376], C: [362, 376], R: [524, 376], X: [702, 376], Q: [362, 418] },
        { Y: GO(25, 9), Z: GO(181, 9), C: GO(362, 9), X: GO(702, 9),
          R: R([[524, 376], [500, 430], [420, 470], [330, 470], [270, 435], [250, 405]], { smooth: true }),
          Q: R([[362, 418], [345, 440], [370, 452], [440, 452]], { smooth: true }) }),

      mk('4 Verts – Z Swing',
        { Y: [25, 376], Z: [187, 376], C: [362, 376], R: [524, 376], X: [702, 376], Q: [362, 418] },
        { Y: GO(25, 9), C: GO(362, 9), R: GO(524, 9), X: GO(702, 9),
          Z: R([[187, 376], [215, 430], [300, 472], [390, 472], [450, 438], [470, 405]], { smooth: true }),
          Q: R([[362, 418], [385, 438], [360, 452], [295, 452]], { smooth: true }) }),

      mk('Hooks',
        { Y: [30, 376], Z: [163, 376], C: [362, 376], R: [557, 376], X: [702, 376], Q: [362, 418] },
        { Z: R([[163, 376], [163, 224], [173, 250]], { steps: 5, end: 'dot' }),
          C: R([[362, 376], [362, 224], [370, 250]], { steps: 5, end: 'dot' }),
          R: R([[557, 376], [557, 224], [546, 250]], { steps: 5, end: 'dot', labelSide: -1 }),
          Y: R([[30, 376], [45, 410], [95, 430], [165, 438]], { smooth: true, end: 'block' }),
          X: R([[702, 376], [685, 410], [640, 430], [590, 440]], { smooth: true, end: 'block' }) }),

      mk('Y Corner – Z Drag',
        { Y: [173, 376], Z: [247, 376], C: [362, 376], R: [478, 376], X: [702, 376], Q: [362, 418] },
        { Y: R([[173, 376], [173, 196], [300, 132]], { steps: 5 }),
          Z: R([[247, 376], [275, 345], [360, 322], [480, 312], [620, 305]], { smooth: true, steps: 1, labelSide: -1 }),
          C: R([[362, 376], [362, 245], [370, 268]], { steps: 5, end: 'dot' }),
          X: GO(702, 5, 210),
          R: R([[478, 376], [420, 420], [360, 450], [400, 462], [530, 454]], { smooth: true, hot: true, dashed: true, end: 'dot' }),
          Q: R([[362, 418], [300, 462], [200, 475], [80, 430], [22, 258]], { smooth: true, hot: true, dashed: true }) }),

      mk('Smash – 3s',
        { Y: [25, 376], Z: [123, 376], C: [362, 376], R: [580, 376], X: [702, 376], Q: [362, 418] },
        { Y: R([[25, 376], [40, 330], [120, 300], [260, 275]], { smooth: true, steps: 1, labelSide: -1 }),
          Z: GO(123, 3, 190),
          C: R([[362, 376], [362, 290], [418, 246]], { steps: 3, labelSide: -1 }),
          R: GO(580, 3, 175, -1),
          X: R([[702, 376], [688, 330], [610, 300], [460, 278]], { smooth: true, steps: 1 }) }),

      mk('Y Out – Z Post – X Drag (hot)',
        { Y: [182, 376], Z: [258, 376], C: [362, 376], R: [464, 376], X: [540, 376], Q: [362, 418] },
        { Y: R([[182, 376], [182, 224], [264, 132]], { steps: 5, labelSide: -1 }),
          Z: R([[258, 376], [258, 248], [150, 150]], { steps: 3, hot: true, labelSide: -1 }),
          C: R([[362, 376], [362, 224], [370, 250]], { steps: 5, end: 'dot', labelSide: -1 }),
          R: R([[464, 376], [464, 248], [545, 152]], { steps: 5 }),
          X: R([[540, 376], [520, 340], [420, 326], [270, 325]], { smooth: true, steps: 1, hot: true, labelSide: 1 }) }),

      mk('Y Post (hot) – R Out – X Drag (hot)',
        { Y: [167, 376], Z: [258, 376], C: [362, 376], R: [462, 376], X: [552, 376], Q: [362, 418] },
        { Y: R([[167, 376], [167, 248], [88, 135]], { steps: 5, hot: true, labelSide: -1 }),
          Z: GO(258, 9, 160, -1),
          C: R([[362, 376], [362, 257], [445, 257]], { steps: 5 }),
          R: R([[462, 376], [462, 200], [565, 200]], { steps: 9 }),
          X: R([[552, 376], [530, 340], [430, 326], [280, 325]], { smooth: true, steps: 1, hot: true, labelSide: 1 }) },
        { spacing: { show: true, labels: { 'Y|Z': '1', 'Z|C': '4', 'C|R': '4', 'R|X': '1' } } }),

      mk('Q Post – Trick',
        { Z: [163, 376], Q: [262, 376], C: [362, 376], R: [462, 376], X: [362, 408], Y: [362, 505] },
        { Z: GO(163, 7, 152, -1),
          Q: R([[262, 376], [262, 222], [345, 127]], { steps: 7, labelSide: -1 }),
          C: R([[362, 376], [362, 257], [450, 257]], { steps: 5 }),
          R: R([[462, 376], [462, 200], [565, 200]], { steps: 9 }) },
        { spacing: { show: true, labels: { 'Z|Q': '1', 'Q|C': '4', 'C|R': '4' } } })
    ];
  }

  function seedRoster() {
    return [];
  }

  /* ---------- store ---------- */
  const listeners = new Set();
  let state = null;

  function migrate(s) {
    const base = emptyState();
    s = Object.assign(base, s || {});
    s.team = Object.assign({ name: 'Raiders', season: '' }, s.team || {});
    s.settings = Object.assign(base.settings, s.settings || {});
    s.lineup = Object.assign({ show: true, gameId: '', quarter: 1 }, s.lineup || {});
    s.defaultRotation = s.defaultRotation || {};
    s.roster = (s.roster || []).map(p => Object.assign({ id: U.uid(), name: '', number: '', positions: [], guardian: '', phone: '', email: '', notes: '', active: true }, p));
    s.practices = (s.practices || []).map(p => Object.assign({ id: U.uid(), date: '', time: '', location: '', notes: '' }, p));
    s.games = (s.games || []).map(g => Object.assign({ id: U.uid(), date: '', time: '', location: '', opponent: '', snackPlayerId: '', notes: '', rotation: {}, sitting: {} }, g));
    s.plays = (s.plays || []).map(p => Object.assign({ id: U.uid(), name: 'Untitled', notes: '', players: {}, routes: {}, spacing: { show: false, labels: {} } }, p));
    for (const p of s.plays) {
      p.spacing = Object.assign({ show: false, labels: {} }, p.spacing || {});
      for (const k of Object.keys(p.routes || {})) {
        p.routes[k] = Object.assign({ pts: [], corners: [], hot: false, steps: null, end: 'arrow', dashed: false, labelSide: 1 }, p.routes[k]);
      }
    }
    return s;
  }

  const S = {
    POSITIONS, POSITION_META, DEFAULT_SPOTS, FORMATIONS,

    load() {
      let raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
      if (raw) {
        try { state = migrate(JSON.parse(raw)); } catch (e) { state = null; }
      }
      if (!state) {
        state = emptyState();
        state.plays = seedPlays();
        state.roster = seedRoster();
        S.save();
      }
      return state;
    },

    get() { return state; },

    save() {
      try { localStorage.setItem(KEY, JSON.stringify(state)); S.storageOK = true; }
      catch (e) {
        // Quick Look / private mode: nothing persists. Say so once instead of losing work silently.
        if (S.storageOK !== false) { S.storageOK = false; setTimeout(() => U.toast('Heads up: this viewer cannot save. Changes are lost when you close the file.', 5000), 400); }
      }
      listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });
    },

    /* mutate(fn) applies fn(state) then saves + notifies. */
    mutate(fn) { fn(state); S.save(); },

    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    exportJSON() { return JSON.stringify(state, null, 2); },

    importJSON(text, mode) {
      const incoming = migrate(JSON.parse(text));
      if (mode === 'merge') {
        const byId = arr => new Map(arr.map(x => [x.id, x]));
        for (const k of ['roster', 'practices', 'games', 'plays']) {
          const cur = byId(state[k]);
          for (const item of incoming[k]) cur.set(item.id, item);
          state[k] = Array.from(cur.values());
        }
      } else {
        state = incoming;
      }
      S.save();
    },

    resetSeedPlays() { state.plays = seedPlays().concat(state.plays); S.save(); },

    reset() { state = emptyState(); state.plays = seedPlays(); S.save(); },

    /* lookups */
    player(id) { return state.roster.find(p => p.id === id) || null; },
    playerName(id) { const p = S.player(id); return p ? p.name : ''; },
    play(id) { return state.plays.find(p => p.id === id) || null; },
    game(id) { return state.games.find(g => g.id === id) || null; },
    practice(id) { return state.practices.find(p => p.id === id) || null; },
    activeRoster() { return U.sortBy(state.roster.filter(p => p.active !== false), p => (parseInt(p.number, 10) || 999)); },

    /* ---- playbook lineup: which rotation + quarter captions the tokens ---- */
    lineupRotation() {
      const L = state.lineup;
      if (L.gameId) { const g = S.game(L.gameId); return g ? (g.rotation = g.rotation || {}) : null; }
      return state.defaultRotation;
    },
    lineupNames() {
      const L = state.lineup;
      if (!L.show) return null;
      const rot = S.lineupRotation(); if (!rot) return null;
      const row = rot[L.quarter] || {}, names = {};
      for (const pos of Object.keys(row)) if (row[pos]) { const n = S.playerName(row[pos]); if (n) names[pos] = n.split(' ')[0]; }
      return names;
    },
    lineupLabel() {
      const L = state.lineup;
      if (!L.show) return '';
      const g = L.gameId ? S.game(L.gameId) : null;
      const src = g ? (g.opponent ? 'vs ' + g.opponent : U.fmtDate(g.date)) : 'Team lineup';
      return src + ' · Q' + L.quarter;
    },
    setLineup(patch) { Object.assign(state.lineup, patch); S.save(); },

    newPlay(name, formation) {
      const spots = FORMATIONS[formation] || FORMATIONS['Spread'];
      const players = {};
      for (const k of Object.keys(spots)) players[k] = spots[k].slice();
      const p = { id: U.uid(), name: name || 'New play', notes: '', players, routes: {}, spacing: { show: false, labels: {} }, createdAt: Date.now(), updatedAt: Date.now() };
      state.plays.push(p); S.save();
      return p;
    },

    duplicatePlay(id) {
      const src = S.play(id); if (!src) return null;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = U.uid(); copy.name = src.name + ' (copy)'; copy.createdAt = copy.updatedAt = Date.now();
      const idx = state.plays.indexOf(src);
      state.plays.splice(idx + 1, 0, copy); S.save();
      return copy;
    }
  };

  S._seedPlays = seedPlays;
  FB.store = S;
})();
