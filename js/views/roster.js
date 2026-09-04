(function () {
  'use strict';
  const FB = window.FB, U = FB.util, S = FB.store;

  function editPlayer(id) {
    const p = id ? S.player(id) : { name: '', number: '', positions: [], guardian: '', phone: '', email: '', guardian2: '', phone2: '', email2: '', notes: '', active: true };
    const m = FB.ui.modal(`<h2>${id ? 'Edit player' : 'Add player'}</h2>
      <form id="pf">
        <div class="two">
          <div class="field-row"><label>Name</label><input type="text" name="name" value="${U.esc(p.name)}" required autocomplete="off"></div>
          <div class="field-row"><label>Jersey #</label><input type="number" name="number" value="${U.esc(p.number)}" inputmode="numeric"></div>
        </div>
        <div class="field-row"><label>Preferred spots (in order of preference)</label>
          <div class="checks">${S.POSITIONS.map(pos => `<label><input type="checkbox" name="positions[]" value="${pos}"${(p.positions || []).includes(pos) ? ' checked' : ''}>${pos} <span class="muted small">${S.POSITION_META[pos].name}</span></label>`).join('')}</div></div>
        <div class="subhead">Parent / guardian 1 <span class="muted">(required)</span></div>
        <div class="two">
          <div class="field-row"><label>Name</label><input type="text" name="guardian" value="${U.esc(p.guardian)}" required autocomplete="off"></div>
          <div class="field-row"><label>Phone</label><input type="tel" name="phone" value="${U.esc(p.phone)}"></div>
        </div>
        <div class="field-row"><label>Email</label><input type="email" name="email" value="${U.esc(p.email)}"></div>
        <div class="subhead">Parent / guardian 2 <span class="muted">(optional)</span></div>
        <div class="two">
          <div class="field-row"><label>Name</label><input type="text" name="guardian2" value="${U.esc(p.guardian2 || '')}" autocomplete="off"></div>
          <div class="field-row"><label>Phone</label><input type="tel" name="phone2" value="${U.esc(p.phone2 || '')}"></div>
        </div>
        <div class="field-row"><label>Email</label><input type="email" name="email2" value="${U.esc(p.email2 || '')}"></div>
        <div class="field-row"><label>Notes</label><textarea name="notes">${U.esc(p.notes)}</textarea></div>
        <div class="field-row"><label class="switch" style="text-transform:none;letter-spacing:0;color:inherit"><input type="checkbox" name="active"${p.active !== false ? ' checked' : ''}> Active this season</label></div>
        <div class="actions">${id ? '<button type="button" class="btn danger" id="del">Delete</button>' : ''}<button type="button" class="btn" id="cancel">Cancel</button><button type="submit" class="btn primary">Save</button></div>
      </form>`);
    const form = m.el.querySelector('#pf');
    m.el.querySelector('#cancel').onclick = m.close;
    if (id) m.el.querySelector('#del').onclick = () => U.confirm('Delete ' + p.name + '? They will also be removed from game rotations.', { ok: 'Delete', danger: true }).then(ok => {
      if (!ok) return;
      S.mutate(st => {
        st.roster = st.roster.filter(x => x.id !== id);
        for (const g of st.games) {
          if (g.snackPlayerId === id) g.snackPlayerId = '';
          for (const q of Object.keys(g.rotation || {})) for (const k of Object.keys(g.rotation[q])) if (g.rotation[q][k] === id) g.rotation[q][k] = '';
        }
      });
      m.close();
    });
    form.onsubmit = e => {
      e.preventDefault();
      const d = FB.ui.formData(form);
      // keep preferred-position order as tapped: order checkboxes by original ordering is fine
      S.mutate(st => {
        if (id) Object.assign(S.player(id), d);
        else st.roster.push(Object.assign({ id: U.uid() }, d));
      });
      m.close();
    };
  }

  FB.views.roster = {
    render(root) {
      const st = S.get();
      FB.ui.setTitle(`<h1>Roster</h1><button class="btn primary sm" id="add">+ Add</button>`);
      document.getElementById('add').onclick = () => editPlayer(null);
      const list = U.sortBy(st.roster, p => (parseInt(p.number, 10) || 999) + (p.active === false ? 1000 : 0));
      if (!list.length) { root.innerHTML = `<div class="empty">No players yet.<br><br><button class="btn primary" id="add2">Add your first player</button></div>`; root.querySelector('#add2').onclick = () => editPlayer(null); return; }
      root.innerHTML = list.map(p => `<div class="card tap" data-id="${p.id}" style="${p.active === false ? 'opacity:.55' : ''}">
        <div class="row">
          <div class="num">${U.esc(p.number || '–')}</div>
          <div class="grow">
            <div class="card-title">${U.esc(p.name)}${p.active === false ? ' <span class="chip">inactive</span>' : ''}</div>
            <div class="row wrap" style="gap:4px;margin-top:4px">${(p.positions || []).map(FB.ui.posChip).join('')}</div>
            ${S.guardians(p.id).map(g => `<div class="row small guardian" style="gap:8px;margin-top:4px"><span class="muted">${U.esc(g.name || '—')}</span>${g.phone ? `<a href="tel:${U.esc(g.phone)}" onclick="event.stopPropagation()">${U.esc(g.phone)}</a>` : ''}${g.email ? `<a href="mailto:${U.esc(g.email)}" onclick="event.stopPropagation()" class="muted">✉︎</a>` : ''}</div>`).join('')}
          </div>
          ${p.phone ? `<a class="btn icon ghost" href="tel:${U.esc(p.phone)}" title="Call ${U.esc(p.guardian || 'parent')}" onclick="event.stopPropagation()">📞</a>` : ''}
        </div></div>`).join('');
      root.querySelectorAll('.card[data-id]').forEach(c => c.onclick = () => editPlayer(c.dataset.id));
    }
  };
  FB.views.roster.editPlayer = editPlayer;
})();
