(function () {
  'use strict';
  const FB = window.FB, U = FB.util, S = FB.store, ROT = FB.rotation;

  function editGame(id) {
    const last = U.sortBy(S.get().games, 'date').slice(-1)[0];
    const g = id ? S.game(id) : { date: U.todayISO(), time: last ? last.time : '09:00', location: last ? last.location : '', opponent: '', notes: '' };
    const m = FB.ui.modal(`<h2>${id ? 'Edit game' : 'Add game'}</h2>
      <form id="f">
        <div class="two">
          <div class="field-row"><label>Date</label><input type="date" name="date" value="${U.esc(g.date)}" required></div>
          <div class="field-row"><label>Kickoff</label><input type="time" name="time" value="${U.esc(g.time)}"></div>
        </div>
        <div class="field-row"><label>Opponent</label><input type="text" name="opponent" value="${U.esc(g.opponent)}"></div>
        <div class="field-row"><label>Location</label><input type="text" name="location" value="${U.esc(g.location)}" placeholder="Field / address"></div>
        <div class="field-row"><label>Notes</label><textarea name="notes">${U.esc(g.notes)}</textarea></div>
        <div class="actions">${id ? '<button type="button" class="btn danger" id="del">Delete</button>' : ''}<button type="button" class="btn" id="cancel">Cancel</button><button type="submit" class="btn primary">Save</button></div>
      </form>`);
    const form = m.el.querySelector('#f');
    m.el.querySelector('#cancel').onclick = m.close;
    if (id) m.el.querySelector('#del').onclick = () => { if (U.confirm('Delete this game?')) { S.mutate(st => st.games = st.games.filter(x => x.id !== id)); m.close(); location.hash = '#/games'; } };
    form.onsubmit = e => {
      e.preventDefault();
      const d = FB.ui.formData(form);
      let newId = id;
      S.mutate(st => {
        if (id) Object.assign(S.game(id), d);
        else { newId = U.uid(); st.games.push(Object.assign({ id: newId, snackPlayerId: '', rotation: {}, sitting: {} }, d)); }
      });
      m.close();
      if (!id) location.hash = '#/games/' + newId;
    };
  }

  function gameCard(g) {
    const snack = g.snackPlayerId ? S.snackLabel(g.snackPlayerId) : '';
    const set = g.rotation && Object.keys(g.rotation).some(q => Object.values(g.rotation[q]).some(Boolean));
    const clips = S.clipsFor(g.id).length;
    return `<a class="card tap" href="#/games/${g.id}" style="display:block;text-decoration:none">
      <div class="row spread"><div class="card-title">${g.opponent ? 'vs ' + U.esc(g.opponent) : 'Game'}</div><div class="muted">${U.fmtDate(g.date)}${g.time ? ' · ' + U.fmtTime(g.time) : ''}</div></div>
      ${g.location ? `<div class="small muted" style="margin-top:4px">📍 ${U.esc(g.location)}</div>` : ''}
      <div class="row wrap small" style="margin-top:8px;gap:12px"><span>🍎 ${snack ? U.esc(snack) : '<span class="muted">no snack assigned</span>'}</span><span>${set ? '✅ rotation set' : '<span class="muted">rotation not set</span>'}</span>${clips ? `<span>🎥 ${clips} clip${clips === 1 ? '' : 's'}</span>` : ''}</div></a>`;
  }

  FB.views.games = {
    render(root) {
      const st = S.get();
      FB.ui.setTitle(`<h1>Games</h1><button class="btn sm" id="snacks" title="Assign snacks to games without one">🍎 Auto-snacks</button><button class="btn primary sm" id="add">+ Add</button>`);
      document.getElementById('add').onclick = () => editGame(null);
      document.getElementById('snacks').onclick = () => {
        const ids = S.activeRoster().map(p => p.id);
        if (!ids.length) return U.toast('Add players to the roster first');
        S.mutate(s => ROT.assignSnacks(s.games, ids));
        U.toast('Snacks assigned');
      };
      const today = U.todayISO();
      const all = U.sortBy(st.games, g => g.date + (g.time || ''));
      const upcoming = all.filter(g => g.date >= today), past = all.filter(g => g.date < today).reverse();
      let html = '';
      if (!all.length) html = `<div class="empty">No games yet.<br><br><button class="btn primary" id="add2">Add a game</button></div>`;
      else {
        html += `<div class="section"><h3>Upcoming</h3>${upcoming.length ? upcoming.map(gameCard).join('') : '<div class="card empty">Nothing upcoming</div>'}</div>`;
        if (past.length) html += `<div class="section"><h3>Past</h3>${past.map(gameCard).join('')}</div>`;
      }
      root.innerHTML = html;
      const a2 = root.querySelector('#add2'); if (a2) a2.onclick = () => editGame(null);
    }
  };

  /* ---------- single game: details, snack, rotation ---------- */
  let fieldQ = 1;
  FB.views.game = {
    render(root, route) {
      const g = S.game(route.id);
      if (!g) { root.innerHTML = '<div class="empty">Game not found</div>'; return; }
      const st = S.get();
      const Q = st.settings.quarters || 4;
      const roster = S.activeRoster();
      FB.ui.setTitle(`<a class="btn ghost sm" href="#/games">‹ Games</a><h1>${g.opponent ? 'vs ' + U.esc(g.opponent) : 'Game'}</h1><button class="btn sm" id="edit">Edit</button>`);
      document.getElementById('edit').onclick = () => editGame(g.id);
      g.rotation = g.rotation || {};

      const counts = ROT.playCounts(g.rotation);
      const anySet = Object.keys(g.rotation).some(q => Object.values(g.rotation[q]).some(Boolean));

      let html = `<div class="card">
        <div class="row spread"><div><div class="card-title">${U.fmtDateLong(g.date)}</div><div class="muted">${g.time ? 'Kickoff ' + U.fmtTime(g.time) : ''}</div></div>
        <div class="row" style="gap:6px"><a class="btn sm" href="#/clips?game=${g.id}">🎥 Clips${S.clipsFor(g.id).length ? ' · ' + S.clipsFor(g.id).length : ''}</a><a class="btn sm" href="#/gamesheet/${g.id}">🖨 Game sheet</a></div></div>
        ${g.location ? `<div style="margin-top:8px">📍 <a href="${U.mapsLink(g.location)}" target="_blank" rel="noopener">${U.esc(g.location)}</a></div>` : ''}
        ${g.notes ? `<div class="small muted" style="margin-top:6px">${U.esc(g.notes)}</div>` : ''}
        <div class="field-row" style="margin:12px 0 0"><label>🍎 Snack duty (the family brings snacks)</label><select id="snack"><option value="">—</option>${S.activeRoster().map(p => `<option value="${p.id}"${p.id === g.snackPlayerId ? ' selected' : ''}>${U.esc(S.snackLabel(p.id))}</option>`).join('')}</select></div>
        ${g.snackPlayerId && S.guardians(g.snackPlayerId).length ? `<div class="row wrap small" style="gap:10px;margin-top:8px">${S.guardians(g.snackPlayerId).map(gd => `<span>${U.esc(gd.name || 'Parent')}${gd.phone ? ` · <a href="tel:${U.esc(gd.phone)}">${U.esc(gd.phone)}</a>` : ''}</span>`).join('')}</div>` : ''}
      </div>`;

      html += `<div class="section"><div class="row spread"><h3>Rotation by quarter</h3>
        <div class="row" style="gap:6px"><button class="btn sm primary" id="auto">${anySet ? 'Fill empty spots' : '✨ Auto-rotate'}</button><button class="btn sm" id="shuffle" title="Re-do the whole rotation">↻</button><button class="btn sm" id="clear">Clear</button></div></div>`;
      if (roster.length < 1) html += `<div class="card empty">Add players to the <a href="#/roster">roster</a> first.</div>`;
      else {
        html += `<div class="card">${rotationGridHTML(g.rotation, roster, Q)}</div>`;

        // field view of a quarter
        html += `<div class="section"><div class="row spread"><h3>On the field</h3><div class="seg" id="qseg">${Array.from({ length: Q }, (_, i) => `<button data-q="${i + 1}" class="${fieldQ === i + 1 ? 'on' : ''}">Q${i + 1}</button>`).join('')}</div></div>
          <div class="card mini-field">${FB.field.svgString(lineupPlay(), { names: namesFor(g, fieldQ) })}
          <div class="row spread" style="margin-top:10px"><button class="btn sm" id="openPB">Open playbook with Q${fieldQ} names</button></div></div></div>`;
      }
      html += `</div>`;
      root.innerHTML = html;

      root.querySelector('#snack').onchange = e => S.mutate(() => { g.snackPlayerId = e.target.value; });
      bindRotationGrid(root, g.rotation);
      const auto = root.querySelector('#auto'), shuffle = root.querySelector('#shuffle'), clear = root.querySelector('#clear');
      const doAuto = (respectExisting, seed) => autoRotate(g.rotation, roster, Q, respectExisting, seed, spotHistory(g.id));
      if (auto) auto.onclick = () => doAuto(true);
      if (shuffle) shuffle.onclick = () => doAuto(false, Math.floor(Math.random() * 1e6));
      if (clear) clear.onclick = () => { if (U.confirm('Clear the whole rotation?')) S.mutate(() => { g.rotation = {}; }); };
      const openPB = root.querySelector('#openPB'); if (openPB) openPB.onclick = () => { S.setLineup({ show: true, gameId: g.id, quarter: fieldQ }); location.hash = '#/playbook'; };
      const qseg = root.querySelector('#qseg'); if (qseg) qseg.querySelectorAll('button').forEach(b => b.onclick = () => { fieldQ = +b.dataset.q; FB.app.rerender(); });
    }
  };

  /* ---------- shared rotation grid (game page + playbook lineup editor) ---------- */
  function rotationGridHTML(rotation, roster, Q) {
    rotation = rotation || {};
    const ids = roster.map(p => p.id);
    let html = `<div class="rot-wrap"><table class="rot"><thead><tr><th></th>${S.POSITIONS.map(p => `<th class="pos" style="background:${S.POSITION_META[p].fill};${p === 'Z' ? 'color:#5b4a00' : ''}">${p}</th>`).join('')}</tr></thead><tbody>`;
    for (let q = 1; q <= Q; q++) {
      const row = rotation[q] || {};
      html += `<tr><td class="q">Q${q}</td>${S.POSITIONS.map(p => `<td><select data-q="${q}" data-pos="${p}">${shortOptions(roster, row[p] || '')}</select></td>`).join('')}</tr>`;
      const sit = ROT.sittingFor(rotation, q, ids).map(id => S.playerName(id)).filter(Boolean);
      html += `<tr><td></td><td colspan="${S.POSITIONS.length}" class="sit" style="text-align:left;border-bottom:2px solid var(--line)">${sit.length ? 'Sitting: ' + sit.map(U.esc).join(', ') : (roster.length > S.POSITIONS.length ? '' : 'Everyone plays')}</td></tr>`;
    }
    html += `</tbody></table></div>`;
    const dups = [];
    for (let q = 1; q <= Q; q++) { const vals = Object.values(rotation[q] || {}).filter(Boolean); if (new Set(vals).size !== vals.length) dups.push(q); }
    if (dups.length) html += `<div class="small" style="color:var(--red);margin-top:8px">⚠️ Same player in two spots in Q${dups.join(', Q')}</div>`;
    const anySet = Object.keys(rotation).some(q => Object.values(rotation[q]).some(Boolean));
    if (anySet && roster.length) {
      const counts = ROT.playCounts(rotation);
      const max = Math.max(...roster.map(p => counts[p.id] || 0)), min = Math.min(...roster.map(p => counts[p.id] || 0));
      html += `<div class="counts">${roster.map(p => `<span class="chip ${counts[p.id] === min && min !== max ? 'low' : counts[p.id] === max && min !== max ? 'high' : ''}">${U.esc(p.name)} · ${counts[p.id] || 0}</span>`).join('')}</div>`;
    }
    return html;
  }
  function bindRotationGrid(root, rotation) {
    root.querySelectorAll('select[data-q]').forEach(sel => sel.onchange = () => S.mutate(() => {
      rotation[sel.dataset.q] = rotation[sel.dataset.q] || {};
      rotation[sel.dataset.q][sel.dataset.pos] = sel.value;
    }));
  }
  function autoRotate(rotation, roster, Q, respectExisting, seed, history) {
    if (!roster.length) return U.toast('Add players to the roster first');
    const locked = {};
    if (respectExisting) for (const q of Object.keys(rotation)) { locked[q] = {}; for (const p of Object.keys(rotation[q])) if (rotation[q][p]) locked[q][p] = rotation[q][p]; }
    const res = ROT.build(roster.map(p => ({ id: p.id, positions: p.positions || [] })), { quarters: Q, locked, seed: seed == null ? 7 : seed, history: history || {} });
    S.mutate(() => { for (const k of Object.keys(rotation)) delete rotation[k]; Object.assign(rotation, res.rotation); });
    U.toast('Rotation built');
  }
  FB.rotationGrid = { html: rotationGridHTML, bind: bindRotationGrid, auto: autoRotate, spotHistory: id => spotHistory(id) };

  function shortOptions(roster, selectedId) {
    let s = '<option value="">—</option>';
    for (const p of roster) s += `<option value="${p.id}"${p.id === selectedId ? ' selected' : ''}>${U.esc((p.name || '').split(' ')[0] || ('#' + p.number))}</option>`;
    return s;
  }

  /* how often each player has played each spot in *other* games (for fairness across the season) */
  function spotHistory(exceptGameId) {
    const h = {};
    for (const g of S.get().games) {
      if (g.id === exceptGameId) continue;
      for (const q of Object.keys(g.rotation || {})) for (const [pos, id] of Object.entries(g.rotation[q])) if (id) { h[id] = h[id] || {}; h[id][pos] = (h[id][pos] || 0) + 1; }
    }
    return h;
  }

  function lineupPlay() {
    const players = {}; for (const k of Object.keys(S.FORMATIONS.Spread)) players[k] = S.FORMATIONS.Spread[k].slice();
    players.Q = [360, 450];
    return { players, routes: {}, spacing: { show: false, labels: {} } };
  }
  function namesFor(g, q) {
    const names = {}; const row = (g.rotation || {})[q] || {};
    for (const p of Object.keys(row)) if (row[p]) names[p] = (S.playerName(row[p]) || '').split(' ')[0];
    return names;
  }
  FB.views.game.namesFor = namesFor;

  /* ---------- printable game sheet ---------- */
  FB.views.gamesheet = {
    className: 'editor',
    render(root, route) {
      const g = S.game(route.id); if (!g) { root.innerHTML = '<div class="empty">Game not found</div>'; return; }
      const st = S.get(), Q = st.settings.quarters || 4, roster = S.activeRoster();
      FB.ui.setTitle(`<a class="btn ghost sm" href="#/games/${g.id}">‹ Back</a><h1>Game sheet</h1><button class="btn primary sm" id="print">🖨 Print / PDF</button>`);
      document.getElementById('print').onclick = () => window.print();
      let html = `<div class="gamesheet"><h1>${U.esc(st.team.name)}${g.opponent ? ' vs ' + U.esc(g.opponent) : ''}</h1>
        <div>${U.fmtDateLong(g.date)}${g.time ? ' · ' + U.fmtTime(g.time) : ''}${g.location ? ' · ' + U.esc(g.location) : ''}</div>
        <div style="margin:6px 0 14px">🍎 Snacks: <b>${g.snackPlayerId ? U.esc(S.snackLabel(g.snackPlayerId)) : '—'}</b></div>
        <table><thead><tr><th></th>${S.POSITIONS.map(p => `<th>${p}</th>`).join('')}<th>Sitting</th></tr></thead><tbody>`;
      for (let q = 1; q <= Q; q++) {
        const row = (g.rotation || {})[q] || {};
        const sit = ROT.sittingFor(g.rotation, q, roster.map(p => p.id)).map(id => S.playerName(id));
        html += `<tr><th>Q${q}</th>${S.POSITIONS.map(p => `<td>${row[p] ? U.esc(S.playerName(row[p])) : ''}</td>`).join('')}<td style="font-size:12px">${sit.map(U.esc).join(', ')}</td></tr>`;
      }
      html += `</tbody></table>${g.notes ? `<p>${U.esc(g.notes)}</p>` : ''}</div>`;
      root.innerHTML = html;
    }
  };
  FB.views.games.editGame = editGame;
})();
