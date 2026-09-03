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

      FB.ui.setTitle(`<a class="btn ghost sm" href="#/playbook" aria-label="Back to playbook">‹</a>
        <h1 style="font-size:18px">${U.esc(play.name)}</h1>
        <span class="muted small">${idx + 1}/${plays.length}</span>
        <a class="btn sm" href="#/playbook/${play.id}" title="Edit this play">✏️ Edit</a>`);

      root.innerHTML = `
        <div class="viewer">
          <div class="stage">
            <div class="frame">
              <svg class="field" id="vfield" xmlns="http://www.w3.org/2000/svg"></svg>
              <svg class="annot" id="annot" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${G.FIELD_W} ${G.FIELD_H}"></svg>
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
            ${L.show ? `<div class="vgroup seg qseg small-seg">${Array.from({ length: Q }, (_, i) => `<button data-q="${i + 1}" class="${L.quarter === i + 1 ? 'on' : ''}">Q${i + 1}</button>`).join('')}</div>` : ''}
          </div>
          </div>
          ${play.notes ? `<div class="vnotes">${U.esc(play.notes)}</div>` : ''}
        </div>`;

      const field = root.querySelector('#vfield'), annot = root.querySelector('#annot');
      F.render(field, play, { names });
      drawAnnots(annot);

      root.querySelector('#prevPlay').onclick = () => { location.hash = '#/view/' + prev.id; };
      root.querySelector('#nextPlay').onclick = () => { location.hash = '#/view/' + next.id; };
      root.querySelectorAll('[data-pen]').forEach(b => b.onclick = () => { A.pen = b.dataset.pen; root.querySelectorAll('[data-pen]').forEach(x => x.classList.toggle('on', x === b)); });
      root.querySelector('#undo').onclick = () => { A.strokes.pop(); drawAnnots(annot); };
      root.querySelector('#clear').onclick = () => { A.strokes = []; drawAnnots(annot); };
      root.querySelectorAll('[data-q]').forEach(b => b.onclick = () => S.setLineup({ quarter: +b.dataset.q }));

      // freehand drawing on the overlay (raw strokes, lightly thinned)
      let el = null;
      annot.onpointerdown = e => {
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        try { annot.setPointerCapture(e.pointerId); } catch (err) {}
        const p = pen();
        const [x, y] = F.pointFromEvent(annot, e);
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
        A.live.pts.push([U.clamp(x, 0, G.FIELD_W), U.clamp(y, 0, G.FIELD_H)]);
        el.innerHTML = strokeMarkup(A.live);
      };
      const up = () => { if (!A.live) return; A.strokes.push(A.live); A.live = null; el = null; drawAnnots(annot); };
      annot.onpointerup = up; annot.onpointercancel = up;

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
