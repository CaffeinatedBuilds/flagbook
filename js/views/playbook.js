/* FlagBook — playbook list + play editor. */
(function () {
  'use strict';
  const FB = window.FB, U = FB.util, S = FB.store, G = FB.geo, F = FB.field;

  /* ---------- lineup bar: which players' names caption the tokens ---------- */
  function lineupBar(compact) {
    const st = S.get(), L = st.lineup, Q = st.settings.quarters || 4;
    const games = U.sortBy(st.games, 'date');
    const src = `<select id="lineupSrc" aria-label="Lineup source"><option value="off"${!L.show ? ' selected' : ''}>Names off</option><option value=""${L.show && !L.gameId ? ' selected' : ''}>Team lineup</option>${games.map(g => `<option value="${g.id}"${L.show && L.gameId === g.id ? ' selected' : ''}>${g.opponent ? 'vs ' + U.esc(g.opponent) : 'Game'} · ${U.fmtDate(g.date, { month: 'short', day: 'numeric' })}</option>`).join('')}</select>`;
    const qs = `<div class="seg qseg" id="lineupQ">${Array.from({ length: Q }, (_, i) => `<button data-q="${i + 1}" class="${L.quarter === i + 1 ? 'on' : ''}"${!L.show ? ' disabled' : ''}>Q${i + 1}</button>`).join('')}</div>`;
    const edit = `<button class="btn sm" id="lineupEdit"${!L.show ? ' disabled' : ''}>Edit lineup</button>`;
    return `<div class="lineup-bar${compact ? ' compact' : ''}">${src}${qs}${edit}</div>`;
  }
  function bindLineupBar(root) {
    const src = root.querySelector('#lineupSrc');
    if (src) src.onchange = e => {
      const v = e.target.value;
      if (v === 'off') S.setLineup({ show: false });
      else S.setLineup({ show: true, gameId: v });
    };
    root.querySelectorAll('#lineupQ button').forEach(b => b.onclick = () => S.setLineup({ quarter: +b.dataset.q }));
    const edit = root.querySelector('#lineupEdit');
    if (edit) edit.onclick = lineupEditor;
  }

  /* Edit the rotation behind the current lineup (team lineup or a game's) in a modal. */
  function lineupEditor() {
    const st = S.get(), L = st.lineup, Q = st.settings.quarters || 4;
    const roster = S.activeRoster();
    const g = L.gameId ? S.game(L.gameId) : null;
    const rotation = S.lineupRotation();
    if (!rotation) return;
    const title = g ? (g.opponent ? 'vs ' + g.opponent : 'Game') + ' lineup' : 'Team lineup';
    const m = FB.ui.modal('', { sticky: true, focus: false });
    const draw = () => {
      m.el.innerHTML = `<h2>${U.esc(title)}</h2>
        ${roster.length ? `<p class="hint" style="margin:0 0 10px">Who plays each spot in each quarter. The playbook shows these names under the tokens.${g ? '' : ' This is the team default; games can have their own rotation.'}</p>${FB.rotationGrid.html(rotation, roster, Q)}`
                        : '<div class="empty">Add players to the <a href="#/roster">roster</a> first.</div>'}
        <div class="actions" style="margin-top:14px">${roster.length ? '<button type="button" class="btn" id="auto">✨ Auto-fill</button><button type="button" class="btn" id="shuffle" title="Reshuffle">↻</button><button type="button" class="btn" id="clear">Clear</button>' : ''}<button type="button" class="btn primary" id="done">Done</button></div>`;
      FB.rotationGrid.bind(m.el, rotation);
      const q = sel => m.el.querySelector(sel);
      q('#done').onclick = m.close;
      if (q('#auto')) q('#auto').onclick = () => FB.rotationGrid.auto(rotation, roster, Q, true, 7, g ? FB.rotationGrid.spotHistory(g.id) : {});
      if (q('#shuffle')) q('#shuffle').onclick = () => FB.rotationGrid.auto(rotation, roster, Q, false, Math.floor(Math.random() * 1e6), g ? FB.rotationGrid.spotHistory(g.id) : {});
      if (q('#clear')) q('#clear').onclick = () => U.confirm('Clear this lineup?', { ok: 'Clear', danger: true }).then(ok => { if (ok) S.mutate(() => { for (const k of Object.keys(rotation)) delete rotation[k]; }); });
    };
    draw();
    // keep the modal in sync while the store changes underneath it (grid edits re-render the page)
    const unsub = S.subscribe(() => { if (document.body.contains(m.bg)) draw(); else unsub(); });
  }

  /* ---------- list ---------- */
  function newPlayDialog() {
    const m = FB.ui.modal(`<h2>New play</h2><form id="f">
      <div class="field-row"><label>Name</label><input type="text" name="name" placeholder="e.g. Trips Right – Y Corner" required autocomplete="off"></div>
      <div class="field-row"><label>Starting formation</label><select name="formation">${Object.keys(S.FORMATIONS).map(k => `<option>${k}</option>`).join('')}<option value="__empty">Empty field</option></select></div>
      <div class="actions"><button type="button" class="btn" id="cancel">Cancel</button><button type="submit" class="btn primary">Create</button></div></form>`);
    m.el.querySelector('#cancel').onclick = m.close;
    m.el.querySelector('#f').onsubmit = e => {
      e.preventDefault();
      const d = FB.ui.formData(e.target);
      const p = S.newPlay(d.name, d.formation);
      if (d.formation === '__empty') S.mutate(() => { p.players = {}; });
      m.close();
      location.hash = '#/playbook/' + p.id;
    };
  }

  function renderList(root, route) {
    const st = S.get();
    const names = S.lineupNames();
    FB.ui.setTitle(`<h1>Playbook</h1><button class="btn sm" id="recDef" title="Record the defense: the clip takes the game's next play number">🎥 Defense</button><a class="btn sm" href="#/print">🖨</a><button class="btn primary sm" id="add">+ New play</button>`);
    document.getElementById('add').onclick = newPlayDialog;
    let html = `<input type="file" accept="video/*" capture="environment" id="recDefIn" class="hidden" aria-hidden="true" tabindex="-1">` + lineupBar(false);
    if (names && !Object.keys(names).length) html += `<p class="hint" style="margin:0 0 12px">No players assigned for ${U.esc(S.lineupLabel())} yet. Tap <b>Edit lineup</b> to fill the quarters.</p>`;
    const subbed = names ? S.subbedPositions() : [];
    if (subbed.length) {
      const row = S.lineupRow(), base = S.lineupBaseRow();
      const desc = subbed.map(pos => `<b>${pos}</b>: ${row[pos] ? U.esc(S.playerName(row[pos]).split(' ')[0]) : 'empty'}${base[pos] ? ' for ' + U.esc(S.playerName(base[pos]).split(' ')[0]) : ''}`).join(', ');
      html += `<p class="hint subs-note" style="margin:0 0 12px">🔁 Subs in ${U.esc(S.lineupLabel())} — ${desc}. <button type="button" class="btn sm" id="clearSubs">Undo subs</button></p>`;
    }
    if (!st.plays.length) html += `<div class="empty">No plays yet.<br><br><button class="btn primary" id="add2">Create your first play</button></div>`;
    else html += `<div class="plays">${st.plays.map(p => `<a class="play-card" href="#/view/${p.id}">${F.svgString(p, { names })}<div class="cap"><span>${U.esc(p.name)}</span>${Object.values(p.routes).some(r => r.hot) ? '<i class="dot" title="has hot route"></i>' : ''}</div></a>`).join('')}</div>`;
    root.innerHTML = html;
    bindLineupBar(root);
    // 🎥 Defense: same camera hand-off as the 🎥 in view mode, tagged as a defensive snap
    const recDefIn = root.querySelector('#recDefIn');
    document.getElementById('recDef').onclick = () => { recDefIn.value = ''; recDefIn.click(); };
    recDefIn.onchange = () => { const file = recDefIn.files && recDefIn.files[0]; recDefIn.value = ''; if (file) FB.clips.capture(file, { id: '', name: 'Defense' }, { side: 'defense' }); };
    const cs = root.querySelector('#clearSubs'); if (cs) cs.onclick = () => S.clearSubs();
    const a2 = root.querySelector('#add2'); if (a2) a2.onclick = newPlayDialog;
  }

  /* ---------- editor ---------- */
  const ed = { id: null, sel: null, mode: 'move', showGrid: false, stroke: null, drag: null, dragLabel: null, svg: null, play: null, names: null, zoom: null /* [x,y,w,h] viewBox when pinched in */ };

  function renderEditor(root, route) {
    const play = S.play(route.id);
    if (!play) { root.innerHTML = '<div class="empty">Play not found. <a href="#/playbook">Back to playbook</a></div>'; return; }
    // every play opens in Move: drawing a route is an explicit opt-in so a stray drag never rewrites one
    if (ed.id !== play.id) { ed.id = play.id; ed.sel = null; ed.stroke = null; ed.drag = null; ed.dragLabel = null; ed.mode = 'move'; ed.zoom = null; }
    ed.play = play; ed.names = S.lineupNames();
    if (ed.sel && !play.players[ed.sel]) ed.sel = null;
    const scrollY = window.scrollY;

    FB.ui.setTitle(`<a class="btn ghost sm" href="#/playbook" aria-label="Back">‹</a>
      <input class="play-name" id="pname" value="${U.esc(play.name)}" aria-label="Play name">
      <a class="btn sm" href="#/view/${play.id}" title="View mode: present and annotate without changing the play">👁 View</a>
      <button class="btn sm icon" id="menu" aria-label="More">⋯</button>`);
    document.getElementById('pname').onchange = e => S.mutate(() => { play.name = e.target.value.trim() || 'Untitled'; play.updatedAt = Date.now(); });
    document.getElementById('menu').onclick = () => playMenu(play, route);

    const sel = ed.sel, r = sel ? play.routes[sel] : null;
    const onField = pos => !!play.players[pos];
    const tokBtn = pos => { const m = S.POSITION_META[pos]; return `<button class="tok ${m.shape}${onField(pos) ? ' onfield' : ''}${sel === pos ? ' sel' : ''}" data-bench="${pos}" style="background:${m.fill};${pos === 'Z' ? 'color:#5b4a00' : ''}" title="${m.name}"><span>${pos}</span></button>`; };

    let html = `<div class="field-wrap"><svg class="field ${ed.mode}" id="field" xmlns="http://www.w3.org/2000/svg"></svg></div>
    <div class="editor-body">
      <div class="full">${lineupBar(true)}</div>
      <div class="toolrow full">
        <div class="seg" id="mode"><button data-mode="move" class="${ed.mode === 'move' ? 'on' : ''}">✋ Move</button><button data-mode="draw" class="${ed.mode === 'draw' ? 'on' : ''}">✏️ Draw route</button></div>
        <button class="btn sm${ed.zoom ? '' : ' hidden'}" id="zoomReset" title="Show the whole field again (pinch with two fingers to zoom)">⤢ Whole field</button>
        <div class="bench" id="bench">${S.POSITIONS.map(tokBtn).join('')}</div>
        <span class="hint grow">${ed.mode === 'draw' ? (sel ? `Drag on the field to draw <b>${sel}</b>'s route.` : 'Tap a player, then drag to draw their route.') : 'Drag players to position them. Drag from the bench to add.'}</span>
      </div>`;

    if (sel) {
      const m = S.POSITION_META[sel];
      const hasRoute = r && r.pts && r.pts.length > 1;
      html += `<div class="card route-panel">
        <div class="head"><span class="tokdot" style="background:${m.fill};${sel === 'Z' ? 'color:#5b4a00' : ''}">${sel}</span><b>${m.name}</b>${ed.names && ed.names[sel] ? `<span class="muted">· ${U.esc(ed.names[sel])}</span>` : ''}<span class="grow"></span><button class="btn sm ghost danger" id="removeP">Remove from field</button></div>
        ${hasRoute ? `
        <div class="toolrow" style="margin-bottom:10px">
          <button class="btn hot ${r.hot ? 'on' : ''}" id="hot">🔥 Hot route</button>
          <div class="row" style="gap:6px"><span class="small muted">Ready on step</span>
            <div class="stepper"><button id="stepDn">−</button><span class="val ${r.hot ? 'red' : ''}" id="stepVal">${r.steps == null ? '<span class="muted small">off</span>' : r.steps}</span><button id="stepUp">+</button></div>
            ${r.steps != null ? '<button class="btn sm ghost" id="stepClr">clear</button>' : ''}</div>
        </div>
        <div class="toolrow">
          <span class="small muted">Ending</span>
          <div class="seg" id="ending">${[['arrow', '➔'], ['dot', '●'], ['block', '⊥'], ['none', '—']].map(([k, l]) => `<button data-end="${k}" class="${(r.end || 'arrow') === k ? 'on' : ''}" title="${k}">${l}</button>`).join('')}</div>
          <button class="btn sm ${r.dashed ? 'on' : ''}" id="dashed">Dashed</button>
          <button class="btn sm" id="flip" title="${r.labelAt ? 'Snap the step number back beside the route' : 'Move the step number to the other side'}">${r.labelAt ? '↺ #' : '⇄ #'}</button>
          <button class="btn sm danger" id="clearRoute">Clear route</button>
        </div>
        <p class="hint" style="margin:10px 0 0">Tip: tap a route on the field to select it; tap it again to toggle hot. Drag the step number to place it where you want. Redraw any time — the route keeps its settings.</p>` :
        `<p class="hint" style="margin:0">No route yet. Switch to <b>Draw route</b> and drag from ${sel} across the field. Sharp cuts stay sharp, curves get smoothed.</p>`}
      </div>`;
    }

    html += `<div class="card">
      <div class="toolrow">
        <label class="switch"><input type="checkbox" id="spacing"${play.spacing.show ? ' checked' : ''}> Show spacing (yds)</label>
        <label class="switch"><input type="checkbox" id="grid"${ed.showGrid ? ' checked' : ''}> Yard grid</label>
        <select id="formation" style="width:auto;min-height:38px;padding:6px 10px"><option value="">Apply formation…</option>${Object.keys(S.FORMATIONS).map(k => `<option>${k}</option>`).join('')}</select>
      </div>
      ${play.spacing.show ? '<p class="hint" style="margin:8px 0 0">Spacing is measured in yards from the player positions. Tap a red number on the field to type your own.</p>' : ''}
      <div class="field-row" style="margin:12px 0 0"><label>Coaching notes</label><textarea id="notes" placeholder="Who's the first read? Snap count? Motion?">${U.esc(play.notes)}</textarea></div>
    </div></div>`;
    root.innerHTML = html;

    ed.svg = root.querySelector('#field');
    drawField();
    bindEditor(root, play, route);
    bindLineupBar(root);
    window.scrollTo(0, scrollY);
  }

  function drawField(live) {
    if (!ed.svg || !ed.play) return;
    F.render(ed.svg, ed.play, { selected: ed.sel, showGrid: ed.showGrid, names: ed.names, interactive: true, liveStroke: live, viewBox: ed.zoom ? ed.zoom.join(' ') : null });
  }

  function save(fn) { S.mutate(() => { fn(); ed.play.updatedAt = Date.now(); }); }

  function tokenAt(play, x, y) {
    let best = null, bd = Infinity;
    for (const pos of Object.keys(play.players)) {
      const d = Math.hypot(play.players[pos][0] - x, play.players[pos][1] - y);
      if (d < G.TOKEN_R + 10 && d < bd) { bd = d; best = pos; }
    }
    return best;
  }
  function routeAt(play, x, y) {
    let best = null, bd = 14;
    for (const pos of Object.keys(play.routes)) {
      const r = play.routes[pos]; if (!play.players[pos] || !r.pts || r.pts.length < 2) continue;
      const d = G.distanceToRoute(r, play.players[pos][0], play.players[pos][1], x, y);
      if (d < bd) { bd = d; best = pos; }
    }
    return best;
  }

  function bindEditor(root, play, route) {
    const svg = ed.svg;
    // mode
    root.querySelectorAll('#mode button').forEach(b => b.onclick = () => { ed.mode = b.dataset.mode; FB.app.rerender(); });

    // bench: tap to place, drag to drop
    root.querySelectorAll('[data-bench]').forEach(btn => {
      const pos = btn.dataset.bench;
      let ghost = null, start = null;
      btn.onpointerdown = e => {
        e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch (err) {}
        start = [e.clientX, e.clientY];
      };
      btn.onpointermove = e => {
        if (!start) return;
        if (!ghost && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 8) {
          ghost = document.createElement('div'); ghost.className = 'ghost-tok'; ghost.textContent = pos;
          ghost.style.background = S.POSITION_META[pos].fill; document.body.appendChild(ghost);
        }
        if (ghost) { ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; }
      };
      const finish = e => {
        if (!start) return;
        const wasDrag = !!ghost;
        if (ghost) { ghost.remove(); ghost = null; }
        start = null;
        const rect = svg.getBoundingClientRect();
        if (wasDrag) {
          if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            const [x, y] = F.pointFromEvent(svg, e);
            save(() => { play.players[pos] = [Math.round(U.clamp(x, 10, G.FIELD_W - 10)), Math.round(U.clamp(y, 10, G.FIELD_H - 10))]; });
            ed.sel = pos;
          }
        } else {
          // tap: select if on field, else place at default spot
          if (play.players[pos]) { ed.sel = ed.sel === pos ? null : pos; FB.app.rerender(); }
          else { save(() => { play.players[pos] = S.DEFAULT_SPOTS[pos].slice(); }); ed.sel = pos; }
        }
      };
      btn.onpointerup = finish; btn.onpointercancel = finish;
    });

    // field interactions
    let downPt = null, moved = false, tapRoute = null, tapGap = null;

    // Two fingers = pinch: zoom and pan the field. Whatever the first finger had started (a stroke,
    // a token or step-number drag) is thrown away, so a pinch can never draw or move anything.
    const pointers = new Map();
    let pinch = null, pinchEnded = false;
    const WHOLE = [0, 0, G.FIELD_W, G.FIELD_H];
    function startPinch() {
      if (ed.drag) { if (ed.drag.from) play.players[ed.drag.pos] = ed.drag.from; ed.drag = null; }
      if (ed.dragLabel) { const r = play.routes[ed.dragLabel.pos]; if (r) { if (ed.dragLabel.from) r.labelAt = ed.dragLabel.from; else delete r.labelAt; } ed.dragLabel = null; }
      ed.stroke = null; downPt = null; tapRoute = null; tapGap = null; moved = false; pinchEnded = false;
      drawField();
      const [a, b] = Array.from(pointers.values());
      const rect = svg.getBoundingClientRect(), box = ed.zoom || WHOLE;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      pinch = {
        d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z0: G.FIELD_W / box[2],
        anchor: [box[0] + (mid[0] - rect.left) / rect.width * box[2], box[1] + (mid[1] - rect.top) / rect.height * box[3]]   // field point under the fingers
      };
    }
    function movePinch() {
      if (pointers.size < 2) return;
      const [a, b] = Array.from(pointers.values());
      const rect = svg.getBoundingClientRect();
      const z = U.clamp(pinch.z0 * (Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d0), 1, 4);
      const w = G.FIELD_W / z, h = G.FIELD_H / z;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const x = U.clamp(pinch.anchor[0] - (mid[0] - rect.left) / rect.width * w, 0, G.FIELD_W - w);
      const y = U.clamp(pinch.anchor[1] - (mid[1] - rect.top) / rect.height * h, 0, G.FIELD_H - h);
      ed.zoom = z > 1.01 ? [x, y, w, h].map(v => Math.round(v * 10) / 10) : null;
      svg.setAttribute('viewBox', (ed.zoom || WHOLE).join(' '));
    }
    const syncZoomUI = () => { const b = root.querySelector('#zoomReset'); if (b) b.classList.toggle('hidden', !ed.zoom); };
    const zoomReset = root.querySelector('#zoomReset'); if (zoomReset) zoomReset.onclick = () => { ed.zoom = null; drawField(); syncZoomUI(); };

    svg.onpointerdown = e => {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      try { svg.setPointerCapture(e.pointerId); } catch (err) {}
      if (pointers.size >= 2 && !pinch) startPinch();
      if (pinch || pinchEnded) return;
      const [x, y] = F.pointFromEvent(svg, e);
      downPt = [x, y]; moved = false; tapRoute = null; tapGap = null;
      const gapEl = e.target.closest && e.target.closest('.gap');
      if (gapEl) { tapGap = gapEl.dataset.gap; return; }
      const lblEl = e.target.closest && e.target.closest('.steplabel');
      if (lblEl && play.routes[lblEl.dataset.pos]) {
        // grab the step number: works in either mode and takes priority over drawing
        const pos = lblEl.dataset.pos, r = play.routes[pos], at = play.players[pos];
        const cur = r.labelAt ? [at[0] + r.labelAt[0], at[1] + r.labelAt[1]] : G.labelPoint(r, at[0], at[1], r.labelSide || 1, 22);
        ed.dragLabel = { pos, dx: cur[0] - x, dy: cur[1] - y, from: r.labelAt ? r.labelAt.slice() : null };
        if (ed.sel !== pos) { ed.sel = pos; drawField(); }
        return;
      }
      const tok = tokenAt(play, x, y);
      if (ed.mode === 'move') {
        if (tok) { ed.sel = tok; ed.drag = { pos: tok, dx: play.players[tok][0] - x, dy: play.players[tok][1] - y, from: play.players[tok].slice() }; drawField(); }
        else tapRoute = routeAt(play, x, y);
      } else {
        const target = tok || ed.sel;
        if (!target) { tapRoute = routeAt(play, x, y); if (!tapRoute) U.toast('Tap a player first'); return; }
        if (tok && tok !== ed.sel) { ed.sel = tok; drawField(); }
        // Pressing on a route (not a token): another player's route selects it; your own
        // route toggles hot on a plain tap. Either way a drag still draws for the target.
        if (!tok) { const rp = routeAt(play, x, y); if (rp) { tapRoute = rp; if (rp !== ed.sel) return; } }
        ed.stroke = [play.players[target].slice()];
      }
    };
    svg.onpointermove = e => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch) { movePinch(); return; }
      if (pinchEnded || !downPt) return;
      const [x, y] = F.pointFromEvent(svg, e);
      if (!moved && Math.hypot(x - downPt[0], y - downPt[1]) > 3) moved = true;
      if (ed.dragLabel) {
        const at = play.players[ed.dragLabel.pos];
        play.routes[ed.dragLabel.pos].labelAt = [U.clamp(x + ed.dragLabel.dx, 12, G.FIELD_W - 12) - at[0], U.clamp(y + ed.dragLabel.dy, 14, G.FIELD_H - 14) - at[1]];
        drawField();
      } else if (ed.drag) {
        play.players[ed.drag.pos] = [U.clamp(x + ed.drag.dx, 10, G.FIELD_W - 10), U.clamp(y + ed.drag.dy, 10, G.FIELD_H - 10)];
        drawField();
      } else if (ed.stroke) {
        const last = ed.stroke[ed.stroke.length - 1];
        if (Math.hypot(x - last[0], y - last[1]) > 1.5) { ed.stroke.push([U.clamp(x, 0, G.FIELD_W), U.clamp(y, 0, G.FIELD_H)]); drawField(ed.stroke); }
      }
    };
    const up = e => {
      pointers.delete(e.pointerId);
      if (pinch) { if (pointers.size < 2) { pinch = null; pinchEnded = pointers.size > 0; syncZoomUI(); } return; }   // the finger still down must not start drawing
      if (pinchEnded) { if (!pointers.size) pinchEnded = false; return; }
      if (!downPt) return;
      const wasDown = downPt; downPt = null;
      if (tapGap && !moved) {
        const cur = (play.spacing.labels || {})[tapGap] || '';
        const v = prompt('Spacing label (yards) for this gap. Leave blank to auto-measure.', cur);
        if (v !== null) save(() => { play.spacing.labels = play.spacing.labels || {}; if (v.trim()) play.spacing.labels[tapGap] = v.trim(); else delete play.spacing.labels[tapGap]; });
        tapGap = null; return;
      }
      if (ed.dragLabel) {
        const pos = ed.dragLabel.pos; ed.dragLabel = null;
        const r = play.routes[pos];
        if (moved && r.labelAt) { r.labelAt = [Math.round(r.labelAt[0]), Math.round(r.labelAt[1])]; save(() => {}); }
        else FB.app.rerender();
        return;
      }
      if (ed.drag) {
        const pos = ed.drag.pos; ed.drag = null;
        // snap onto the line of scrimmage if close
        const p = play.players[pos];
        if (Math.abs(p[1] - G.RECEIVER_Y) < 12) p[1] = G.RECEIVER_Y;
        p[0] = Math.round(p[0]); p[1] = Math.round(p[1]);
        save(() => {});
        return;
      }
      if (ed.stroke) {
        const stroke = ed.stroke; ed.stroke = null;
        const target = ed.sel;
        if (moved && stroke.length > 2) {
          const r = G.processStroke(stroke);
          if (r) {
            save(() => {
              const prev = play.routes[target] || {};
              play.routes[target] = Object.assign({ hot: false, steps: null, end: 'arrow', dashed: false, labelSide: 1 }, prev, r);
              // put the number on the side away from the field edge
              if (!prev.pts) play.routes[target].labelSide = play.players[target][0] > G.FIELD_W - 90 ? -1 : 1;
            });
            return;
          }
        }
        // tiny stroke = a tap: fall through to route-tap handling, else just refresh
        if (!tapRoute) { FB.app.rerender(); return; }
      }
      if (tapRoute && !moved) {
        if (ed.sel === tapRoute) save(() => { play.routes[tapRoute].hot = !play.routes[tapRoute].hot; if (play.routes[tapRoute].hot && play.routes[tapRoute].steps == null) play.routes[tapRoute].steps = 3; });
        else { ed.sel = tapRoute; FB.app.rerender(); }
        return;
      }
      if (!moved && ed.mode === 'move' && !tokenAt(play, wasDown[0], wasDown[1])) { if (ed.sel) { ed.sel = null; FB.app.rerender(); } }
    };
    svg.onpointerup = up; svg.onpointercancel = up;

    // route panel
    const q = s => root.querySelector(s);
    const r = ed.sel ? play.routes[ed.sel] : null;
    if (q('#removeP')) q('#removeP').onclick = () => { const pos = ed.sel; ed.sel = null; save(() => { delete play.players[pos]; delete play.routes[pos]; }); };
    if (r) {
      if (q('#hot')) q('#hot').onclick = () => save(() => { r.hot = !r.hot; if (r.hot && r.steps == null) r.steps = 3; });
      if (q('#stepUp')) q('#stepUp').onclick = () => save(() => { r.steps = r.steps == null ? 1 : Math.min(15, r.steps + 1); });
      if (q('#stepDn')) q('#stepDn').onclick = () => save(() => { r.steps = r.steps == null ? 1 : Math.max(1, r.steps - 1); });
      if (q('#stepClr')) q('#stepClr').onclick = () => save(() => { r.steps = null; });
      root.querySelectorAll('#ending button').forEach(b => b.onclick = () => save(() => { r.end = b.dataset.end; }));
      if (q('#dashed')) q('#dashed').onclick = () => save(() => { r.dashed = !r.dashed; });
      if (q('#flip')) q('#flip').onclick = () => save(() => { if (r.labelAt) delete r.labelAt; else r.labelSide = (r.labelSide || 1) * -1; });
      if (q('#clearRoute')) q('#clearRoute').onclick = () => save(() => { delete play.routes[ed.sel]; });
    }
    q('#spacing').onchange = e => save(() => { play.spacing.show = e.target.checked; });
    q('#grid').onchange = e => { ed.showGrid = e.target.checked; drawField(); };
    q('#formation').onchange = e => {
      const f = S.FORMATIONS[e.target.value]; if (!f) return;
      save(() => { for (const pos of Object.keys(f)) play.players[pos] = f[pos].slice(); });
    };
    q('#notes').onchange = e => save(() => { play.notes = e.target.value; });
  }

  function playMenu(play, route) {
    const m = FB.ui.modal(`<h2>${U.esc(play.name)}</h2><div class="stack">
      <a class="btn" href="#/print/${play.id}">🖨 Print this play</a>
      <button class="btn" id="dup">Duplicate</button>
      <button class="btn" id="up">Move up in playbook</button>
      <button class="btn" id="down">Move down in playbook</button>
      <button class="btn" id="clearAll">Clear all routes</button>
      <button class="btn danger" id="del">Delete play</button>
      <button class="btn ghost" id="cancel">Cancel</button></div>`);
    const q = s => m.el.querySelector(s);
    q('#cancel').onclick = m.close;
    q('a.btn').onclick = m.close;
    q('#dup').onclick = () => { const c = S.duplicatePlay(play.id); m.close(); location.hash = '#/playbook/' + c.id; };
    const move = dir => { S.mutate(st => { const i = st.plays.indexOf(play), j = i + dir; if (j < 0 || j >= st.plays.length) return; st.plays.splice(i, 1); st.plays.splice(j, 0, play); }); m.close(); U.toast('Moved'); };
    q('#up').onclick = () => move(-1); q('#down').onclick = () => move(1);
    q('#clearAll').onclick = () => U.confirm('Clear all routes on this play?', { ok: 'Clear', danger: true }).then(ok => { if (ok) { S.mutate(() => { play.routes = {}; }); m.close(); } });
    q('#del').onclick = () => U.confirm('Delete "' + play.name + '"?', { ok: 'Delete', danger: true }).then(ok => { if (ok) { S.mutate(st => { st.plays = st.plays.filter(p => p.id !== play.id); }); m.close(); location.hash = '#/playbook'; } });
  }

  FB.views.playbook = {
    get className() { return FB.app && FB.app.route() && FB.app.route().id ? 'editor' : ''; },
    render(root, route) { if (route.id) renderEditor(root, route); else renderList(root, route); },
    destroy() { ed.id = null; ed.sel = null; ed.stroke = null; ed.drag = null; }
  };
})();
