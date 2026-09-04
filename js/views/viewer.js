/* FlagBook — View mode: show a play full-size and scribble over it without changing it.
 * Annotations are kept in memory only and reset when the play changes. */
(function () {
  'use strict';
  const FB = window.FB, U = FB.util, S = FB.store, G = FB.geo, F = FB.field;

  const PENS = [
    { id: 'yellow', color: '#F5C400', width: 12, opacity: 0.55, label: 'Highlighter' },
    { id: 'red',    color: '#E5352B', width: 5,  opacity: 1,    label: 'Red pen' },
    { id: 'blue',   color: '#2A7DE1', width: 5,  opacity: 1,    label: 'Blue pen' },
    { id: 'black',  color: '#111111', width: 5,  opacity: 1,    label: 'Black pen' }
  ];
  const A = { playId: null, strokes: [], pen: 'red', live: null };

  function resetFor(playId) { if (A.playId !== playId) { A.playId = playId; A.strokes = []; A.live = null; } }
  function pen() { return PENS.find(p => p.id === A.pen) || PENS[1]; }
  const f = n => Math.round(n * 10) / 10;

  function strokeMarkup(s) {
    if (s.pts.length === 1) { const p = s.pts[0]; return `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${s.width / 2}" fill="${s.color}" opacity="${s.opacity}" />`; }
    return `<polyline points="${s.pts.map(p => f(p[0]) + ',' + f(p[1])).join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-opacity="${s.opacity}" stroke-linecap="round" stroke-linejoin="round" />`;
  }
  function drawAnnots(svg) { svg.innerHTML = A.strokes.map(strokeMarkup).join(''); }

  /* ---------- substitutions: swap a bench kid into a spot without leaving the play ---------- */
  function playerLabel(p) { return (p.number ? '#' + U.esc(p.number) + ' ' : '') + U.esc(p.name); }
  function spotLine(pos, row) {
    const id = row[pos], p = id ? S.player(id) : null;
    return `${FB.ui.posChip(pos)}<span class="who">${p ? playerLabel(p) : '<span class="muted">nobody</span>'}</span>`;
  }

  /* Step 1 (from the 🔁 button): which spot is changing? */
  function subSheet(play) {
    if (!S.get().lineup.show) { U.toast('Turn names on in the playbook to make substitutions'); return; }
    const row = S.lineupRow(), positions = Object.keys(play.players);
    const subbed = S.subbedPositions();
    const m = FB.ui.modal(`<h2>Substitution</h2><p class="hint" style="margin:0 0 10px">${U.esc(S.lineupLabel())} · who is coming out?</p>
      <div class="sublist">${positions.map(pos => `<button type="button" class="subrow" data-pos="${pos}">${spotLine(pos, row)}<span class="go">›</span></button>`).join('')}</div>
      <div class="actions">${subbed.length ? '<button type="button" class="btn" id="resetSubs">Undo all subs</button>' : ''}<button type="button" class="btn" id="cancel">Cancel</button></div>`, { focus: false });
    m.el.querySelectorAll('[data-pos]').forEach(b => b.onclick = () => { m.close(); pickSheet(play, b.dataset.pos); });
    m.el.querySelector('#cancel').onclick = m.close;
    const r = m.el.querySelector('#resetSubs'); if (r) r.onclick = () => { m.close(); S.clearSubs(); U.toast('Back to the lineup'); };
  }

  /* Step 2 (also reached by tapping a token): who goes in at this spot? */
  function pickSheet(play, pos) {
    if (!S.get().lineup.show) { U.toast('Turn names on in the playbook to make substitutions'); return; }
    const row = S.lineupRow(), base = S.lineupBaseRow();
    const cur = row[pos] ? S.player(row[pos]) : null;
    const bench = S.benchPlayers();
    const onField = Object.keys(play.players).filter(o => o !== pos && row[o]);
    const isSub = S.subbedPositions().indexOf(pos) >= 0, orig = base[pos] ? S.player(base[pos]) : null;
    const m = FB.ui.modal(`<h2>${FB.ui.posChip(pos)} ${cur ? U.esc(cur.name) : 'Open spot'}</h2>
      <p class="hint" style="margin:0 0 10px">${cur ? 'Who goes in for ' + U.esc(cur.name.split(' ')[0]) + '?' : 'Who takes this spot?'}</p>
      ${isSub ? `<button type="button" class="subrow undo" id="revert">↩ Put ${orig ? U.esc(orig.name) : 'the lineup'} back${orig ? '' : ' (leave empty)'}</button>` : ''}
      ${bench.length ? `<div class="subhead">Bench</div><div class="sublist">${bench.map(p => `<button type="button" class="subrow" data-in="${p.id}"><span class="who">${playerLabel(p)}</span><span class="go">In</span></button>`).join('')}</div>` : '<p class="hint">Nobody on the bench right now.</p>'}
      ${onField.length ? `<div class="subhead">Trade spots with</div><div class="sublist">${onField.map(o => `<button type="button" class="subrow" data-swap="${o}">${spotLine(o, row)}<span class="go">⇄</span></button>`).join('')}</div>` : ''}
      <div class="actions">${cur ? '<button type="button" class="btn" id="empty">Nobody (leave empty)</button>' : ''}<button type="button" class="btn" id="cancel">Cancel</button></div>`, { focus: false });
    const done = msg => { m.close(); if (msg) U.toast(msg); };
    m.el.querySelectorAll('[data-in]').forEach(b => b.onclick = () => { const p = S.player(b.dataset.in); S.setSub(pos, b.dataset.in); done(`${p ? p.name.split(' ')[0] : 'Sub'} in at ${pos}${cur ? ' for ' + cur.name.split(' ')[0] : ''}`); });
    m.el.querySelectorAll('[data-swap]').forEach(b => b.onclick = () => { S.swapSpots(pos, b.dataset.swap); done(`${pos} and ${b.dataset.swap} traded spots`); });
    const rv = m.el.querySelector('#revert'); if (rv) rv.onclick = () => { S.setSub(pos, base[pos] || ''); done('Back to the lineup at ' + pos); };
    const em = m.el.querySelector('#empty'); if (em) em.onclick = () => { S.setSub(pos, ''); done(pos + ' is empty'); };
    m.el.querySelector('#cancel').onclick = m.close;
  }

  /* Which token (if any) is under a field-coordinate point. */
  function tokenAt(play, x, y) {
    const R = G.TOKEN_R + 10;
    let best = null, bd = Infinity;
    for (const pos of Object.keys(play.players)) {
      const [tx, ty] = play.players[pos], d = Math.hypot(tx - x, ty - y);
      if (d < R && d < bd) { best = pos; bd = d; }
    }
    return best;
  }

  FB.views.viewer = {
    className: 'editor viewer-page',
    render(root, route) {
      const st = S.get();
      const plays = st.plays;
      const idx = plays.findIndex(p => p.id === route.id);
      const play = plays[idx];
      if (!play) { root.innerHTML = '<div class="empty">Play not found. <a href="#/playbook">Back to playbook</a></div>'; return; }
      resetFor(play.id);
      document.body.classList.add('viewing');
      const prev = plays[(idx - 1 + plays.length) % plays.length], next = plays[(idx + 1) % plays.length];
      const L = st.lineup, Q = st.settings.quarters || 4;
      const names = S.lineupNames();
      const subbed = L.show ? S.subbedPositions() : [];
      const crop = F.contentCrop(play, { names });   // trim empty sky so the play can go wide

      FB.ui.setTitle(`<a class="btn ghost sm" href="#/playbook" aria-label="Back to playbook">‹</a>
        <h1 style="font-size:18px">${U.esc(play.name)}</h1>
        <span class="muted small">${idx + 1}/${plays.length}</span>
        <a class="btn sm" href="#/playbook/${play.id}" title="Edit this play">✏️ Edit</a>`);

      root.innerHTML = `
        <div class="viewer${play.notes ? ' has-notes' : ''}">
          <div class="stage">
            <div class="frame" style="--ar:${crop.ratio.toFixed(4)}">
              <svg class="field" id="vfield" xmlns="http://www.w3.org/2000/svg"></svg>
              <svg class="annot" id="annot" xmlns="http://www.w3.org/2000/svg" viewBox="${crop.viewBox}"></svg>
            </div>
          <div class="vtools">
            <div class="vgroup nav-plays">
              <button class="btn icon" id="prevPlay" title="Previous play: ${U.esc(prev.name)}">‹</button>
              <button class="btn icon" id="nextPlay" title="Next play: ${U.esc(next.name)}">›</button>
            </div>
            <div class="vgroup pens">
              ${PENS.map(p => `<button class="pen${A.pen === p.id ? ' on' : ''}" data-pen="${p.id}" title="${p.label}" style="--pen:${p.color}"></button>`).join('')}
              <button class="btn icon" id="undo" title="Undo last mark">↶</button>
              <button class="btn icon" id="clear" title="Clear marks">✕</button>
            </div>
            <div class="vgroup">
              <button class="btn icon" id="recBtn" title="Record a clip of this play (you come back to the playbook when you stop)">🎥</button>
              <input type="file" accept="video/*" capture="environment" id="recIn" class="hidden" aria-hidden="true" tabindex="-1">
            </div>
            ${L.show ? `<div class="vgroup seg qseg small-seg">${Array.from({ length: Q }, (_, i) => `<button data-q="${i + 1}" class="${L.quarter === i + 1 ? 'on' : ''}">Q${i + 1}</button>`).join('')}</div>
            <div class="vgroup"><button class="btn icon${subbed.length ? ' on' : ''}" id="subBtn" title="Substitution: swap a player in from the bench (or tap a player on the field)">🔁</button></div>` : ''}
          </div>
          ${play.notes ? `<div class="vnotes" title="Tap for the full notes">${U.esc(play.notes)}</div>` : ''}
          </div>
        </div>`;

      const field = root.querySelector('#vfield'), annot = root.querySelector('#annot');
      F.render(field, play, { names, subbed, viewBox: crop.viewBox });
      drawAnnots(annot);
      const subBtn = root.querySelector('#subBtn'); if (subBtn) subBtn.onclick = () => subSheet(play);
      // notes are clamped to two lines so the whole view fits the screen without scrolling; tap for all of them
      const vn = root.querySelector('.vnotes'); if (vn) vn.onclick = () => {
        const m = FB.ui.modal(`<h2>${U.esc(play.name)}</h2><p style="white-space:pre-wrap;margin:0 0 14px">${U.esc(play.notes)}</p><div class="actions"><button type="button" class="btn primary" id="ok">Done</button></div>`, { focus: false });
        m.el.querySelector('#ok').onclick = m.close;
      };

      root.querySelector('#prevPlay').onclick = () => { location.hash = '#/view/' + prev.id; };
      root.querySelector('#nextPlay').onclick = () => { location.hash = '#/view/' + next.id; };
      root.querySelectorAll('[data-pen]').forEach(b => b.onclick = () => { A.pen = b.dataset.pen; root.querySelectorAll('[data-pen]').forEach(x => x.classList.toggle('on', x === b)); });
      root.querySelector('#undo').onclick = () => { A.strokes.pop(); drawAnnots(annot); };
      root.querySelector('#clear').onclick = () => { A.strokes = []; drawAnnots(annot); };
      root.querySelectorAll('[data-q]').forEach(b => b.onclick = () => S.setLineup({ quarter: +b.dataset.q }));

      // 🎥 opens the camera (iOS: straight into video mode). When the coach taps "Use Video" the file
      // lands here and FB.clips takes over: back to the playbook, clip saved underneath.
      const recBtn = root.querySelector('#recBtn'), recIn = root.querySelector('#recIn');
      recBtn.onclick = () => { recIn.value = ''; recIn.click(); };
      recIn.onchange = () => { const file = recIn.files && recIn.files[0]; recIn.value = ''; if (file) FB.clips.capture(file, play); };
      recIn.addEventListener('cancel', () => { recIn.value = ''; });

      // freehand drawing on the overlay (raw strokes, lightly thinned).
      // A plain tap on a player token (no drag) opens the substitution sheet instead of leaving a dot.
      let el = null, tapPos = null, tapAt = null, tapT = 0;
      annot.onpointerdown = e => {
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        try { annot.setPointerCapture(e.pointerId); } catch (err) {}
        const p = pen();
        const [x, y] = F.pointFromEvent(annot, e);
        tapPos = L.show ? tokenAt(play, x, y) : null; tapAt = [x, y]; tapT = Date.now();
        A.live = { color: p.color, width: p.width, opacity: p.opacity, pts: [[x, y]] };
        el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        el.innerHTML = strokeMarkup(A.live);
        annot.appendChild(el);
      };
      annot.onpointermove = e => {
        if (!A.live) return;
        const [x, y] = F.pointFromEvent(annot, e);
        const last = A.live.pts[A.live.pts.length - 1];
        if (Math.hypot(x - last[0], y - last[1]) < 1.2) return;
        if (tapPos && Math.hypot(x - tapAt[0], y - tapAt[1]) > 6) tapPos = null;   // it's a drag: draw as usual
        A.live.pts.push([U.clamp(x, 0, G.FIELD_W), U.clamp(y, 0, G.FIELD_H)]);
        el.innerHTML = strokeMarkup(A.live);
      };
      const up = () => {
        if (!A.live) return;
        const wasTap = tapPos && Date.now() - tapT < 500;
        if (!wasTap) A.strokes.push(A.live);
        A.live = null; el = null; drawAnnots(annot);
        if (wasTap) { const pos = tapPos; tapPos = null; pickSheet(play, pos); }
        tapPos = null;
      };
      annot.onpointerup = up; annot.onpointercancel = () => { tapPos = null; up(); };

      // keyboard: arrows flip plays, Z undoes, Backspace clears
      document.onkeydown = e => {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        if (e.key === 'ArrowLeft') location.hash = '#/view/' + prev.id;
        else if (e.key === 'ArrowRight') location.hash = '#/view/' + next.id;
        else if (e.key === 'z' || e.key === 'Z') { A.strokes.pop(); drawAnnots(annot); }
        else if (e.key === 'Backspace') { A.strokes = []; drawAnnots(annot); }
      };
    },
    destroy() {
      document.body.classList.remove('viewing');
      document.onkeydown = null;
      A.playId = null; A.strokes = []; A.live = null;
    }
  };
})();
