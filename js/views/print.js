(function () {
  'use strict';
  const FB = window.FB, U = FB.util, S = FB.store;

  FB.views.print = {
    className: 'editor',
    render(root, route) {
      const st = S.get();
      const plays = route.id ? [S.play(route.id)].filter(Boolean) : st.plays;
      const Q = st.settings.quarters || 4;
      const showTitles = route.query.titles !== '0';
      const allQ = route.query.quarters === 'all' && st.lineup.show;
      const names = S.lineupNames();
      const label = S.lineupLabel();

      // one sheet per play, or one per play per quarter when printing all quarters
      const sheets = [];
      if (allQ) {
        const saved = st.lineup.quarter;
        for (let q = 1; q <= Q; q++) {
          st.lineup.quarter = q;
          const n = S.lineupNames(), l = S.lineupLabel();
          for (const p of plays) sheets.push({ p, names: n, label: l });
        }
        st.lineup.quarter = saved;
      } else for (const p of plays) sheets.push({ p, names, label });

      FB.ui.setTitle(`<a class="btn ghost sm" href="${route.id ? '#/playbook/' + route.id : '#/playbook'}">‹ Back</a><h1>Print playbook</h1>`);
      root.innerHTML = `<div class="print-bar"><div class="row wrap"><label class="switch"><input type="checkbox" id="titles"${showTitles ? ' checked' : ''}> Play names</label>
          ${st.lineup.show ? `<label class="switch"><input type="checkbox" id="allq"${allQ ? ' checked' : ''}> All ${Q} quarters</label>` : ''}
          <span class="small muted">${sheets.length} page${sheets.length === 1 ? '' : 's'} · ${label ? U.esc(label) + ' · ' : ''}10in × 7.5in</span></div>
          <button class="btn primary" id="print">🖨 Print / Save PDF</button></div>
        <div class="print-pages" style="padding:14px">${sheets.map(s => `<div class="sheet">${FB.field.svgString(s.p, { names: s.names })}${showTitles ? `<div class="title">${U.esc(s.p.name)}</div>` : ''}${s.label ? `<div class="names">${U.esc(s.label)}</div>` : ''}</div>`).join('')}</div>`;
      root.querySelector('#print').onclick = () => window.print();
      const setQuery = patch => {
        const q = Object.assign({}, route.query, patch);
        location.hash = route.path + '?' + Object.keys(q).filter(k => q[k] !== '').map(k => k + '=' + encodeURIComponent(q[k])).join('&');
      };
      root.querySelector('#titles').onchange = e => setQuery({ titles: e.target.checked ? '1' : '0' });
      const allq = root.querySelector('#allq'); if (allq) allq.onchange = e => setQuery({ quarters: e.target.checked ? 'all' : '' });
    }
  };
})();
