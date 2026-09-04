(function () {
  'use strict';
  const FB = window.FB, U = FB.util, S = FB.store, UI = FB.ui || {};

  function nextOf(list) {
    const today = U.todayISO();
    return U.sortBy(list.filter(x => x.date >= today), 'date')[0] || null;
  }

  FB.views.home = {
    render(root) {
      const st = S.get();
      FB.ui.setTitle(`<h1>${U.esc(st.team.name || 'FlagBook')}</h1>${st.team.season ? `<span class="muted small">${U.esc(st.team.season)}</span>` : ''}`);
      const g = nextOf(st.games), p = nextOf(st.practices);
      const rosterN = st.roster.filter(x => x.active !== false).length;
      let html = '';

      html += `<div class="section"><h3>Next game</h3>`;
      if (g) {
        const snack = g.snackPlayerId ? S.snackLabel(g.snackPlayerId) : '';
        const q1 = g.rotation && g.rotation[1] ? Object.keys(g.rotation[1]).filter(k => g.rotation[1][k]).length : 0;
        html += `<a class="card tap" href="#/games/${g.id}" style="display:block;text-decoration:none">
          <div class="row spread"><div class="card-title">${g.opponent ? 'vs ' + U.esc(g.opponent) : 'Game'}</div><div class="muted">${U.fmtDate(g.date)}${g.time ? ' · ' + U.fmtTime(g.time) : ''}</div></div>
          ${g.location ? `<div class="muted small" style="margin-top:4px">📍 ${U.esc(g.location)}</div>` : ''}
          <div class="row wrap" style="margin-top:10px;gap:14px">
            <div><span class="muted small">Snacks</span><br><b>${snack ? U.esc(snack) : '<span class="muted">not assigned</span>'}</b></div>
            <div><span class="muted small">Rotation</span><br><b>${q1 ? 'set' : '<span class="muted">not set</span>'}</b></div>
          </div></a>`;
      } else html += `<div class="card empty">No upcoming games. <a href="#/games">Add one</a></div>`;
      html += `</div>`;

      html += `<div class="section"><h3>Next practice</h3>`;
      if (p) {
        html += `<a class="card tap" href="#/practices" style="display:block;text-decoration:none">
          <div class="row spread"><div class="card-title">${U.fmtDate(p.date, { weekday: 'long', month: 'short', day: 'numeric' })}</div><div class="muted">${U.fmtTime(p.time)}</div></div>
          ${p.location ? `<div class="muted small" style="margin-top:4px">📍 ${U.esc(p.location)}</div>` : ''}
          ${p.notes ? `<div class="small" style="margin-top:6px">${U.esc(p.notes)}</div>` : ''}</a>`;
      } else html += `<div class="card empty">No upcoming practices. <a href="#/practices">Schedule one</a></div>`;
      html += `</div>`;

      html += `<div class="section"><h3>Team</h3><div class="row wrap">
        <a class="card tap grow" href="#/roster" style="text-decoration:none;text-align:center"><div style="font-size:28px;font-weight:800">${rosterN}</div><div class="muted small">players</div></a>
        <a class="card tap grow" href="#/playbook" style="text-decoration:none;text-align:center"><div style="font-size:28px;font-weight:800">${st.plays.length}</div><div class="muted small">plays</div></a>
        <a class="card tap grow" href="#/games" style="text-decoration:none;text-align:center"><div style="font-size:28px;font-weight:800">${st.games.length}</div><div class="muted small">games</div></a>
      </div></div>`;
      root.innerHTML = html;
    }
  };
})();
