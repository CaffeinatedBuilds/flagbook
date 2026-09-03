(function () {
  'use strict';
  const FB = window.FB, U = FB.util, S = FB.store;

  function edit(id) {
    const last = U.sortBy(S.get().practices, 'date').slice(-1)[0];
    const p = id ? S.practice(id) : { date: U.todayISO(), time: last ? last.time : '17:30', location: last ? last.location : '', notes: '' };
    const m = FB.ui.modal(`<h2>${id ? 'Edit practice' : 'Add practice'}</h2>
      <form id="f">
        <div class="two">
          <div class="field-row"><label>Date</label><input type="date" name="date" value="${U.esc(p.date)}" required></div>
          <div class="field-row"><label>Time</label><input type="time" name="time" value="${U.esc(p.time)}"></div>
        </div>
        <div class="field-row"><label>Location</label><input type="text" name="location" value="${U.esc(p.location)}" placeholder="Field name / address"></div>
        <div class="field-row"><label>Notes / focus</label><textarea name="notes" placeholder="e.g. Install plays 1–4, flag pulling drills">${U.esc(p.notes)}</textarea></div>
        ${id ? '' : `<div class="field-row"><label>Repeat weekly</label><select name="repeat"><option value="1">Just this one</option><option value="4">4 weeks</option><option value="6">6 weeks</option><option value="8">8 weeks</option><option value="10">10 weeks</option><option value="12">12 weeks</option></select></div>`}
        <div class="actions">${id ? '<button type="button" class="btn danger" id="del">Delete</button>' : ''}<button type="button" class="btn" id="cancel">Cancel</button><button type="submit" class="btn primary">Save</button></div>
      </form>`);
    const form = m.el.querySelector('#f');
    m.el.querySelector('#cancel').onclick = m.close;
    if (id) m.el.querySelector('#del').onclick = () => { if (U.confirm('Delete this practice?')) { S.mutate(st => st.practices = st.practices.filter(x => x.id !== id)); m.close(); } };
    form.onsubmit = e => {
      e.preventDefault();
      const d = FB.ui.formData(form);
      const repeat = parseInt(d.repeat || '1', 10); delete d.repeat;
      S.mutate(st => {
        if (id) Object.assign(S.practice(id), d);
        else for (let i = 0; i < repeat; i++) {
          const dt = U.parseISODate(d.date); dt.setDate(dt.getDate() + i * 7);
          const iso = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
          st.practices.push(Object.assign({ id: U.uid() }, d, { date: iso }));
        }
      });
      m.close();
    };
  }

  FB.views.practices = {
    render(root) {
      const st = S.get();
      FB.ui.setTitle(`<h1>Practice</h1><button class="btn primary sm" id="add">+ Add</button>`);
      document.getElementById('add').onclick = () => edit(null);
      const today = U.todayISO();
      const all = U.sortBy(st.practices, p => p.date + (p.time || ''));
      const upcoming = all.filter(p => p.date >= today), past = all.filter(p => p.date < today).reverse();
      const card = p => `<div class="card tap" data-id="${p.id}">
          <div class="row spread"><div class="card-title">${U.fmtDate(p.date, { weekday: 'long', month: 'short', day: 'numeric' })}</div><div class="muted">${U.fmtTime(p.time)}</div></div>
          ${p.location ? `<div class="small" style="margin-top:4px">📍 <a href="${U.mapsLink(p.location)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${U.esc(p.location)}</a></div>` : ''}
          ${p.notes ? `<div class="small muted" style="margin-top:6px">${U.esc(p.notes)}</div>` : ''}</div>`;
      let html = '';
      if (!all.length) html = `<div class="empty">No practices scheduled.<br><br><button class="btn primary" id="add2">Add practice</button></div>`;
      else {
        html += `<div class="section"><h3>Upcoming</h3>${upcoming.length ? upcoming.map(card).join('') : '<div class="card empty">Nothing upcoming</div>'}</div>`;
        if (past.length) html += `<div class="section"><h3>Past</h3>${past.map(card).join('')}</div>`;
      }
      root.innerHTML = html;
      const a2 = root.querySelector('#add2'); if (a2) a2.onclick = () => edit(null);
      root.querySelectorAll('.card[data-id]').forEach(c => c.onclick = () => edit(c.dataset.id));
    }
  };
})();
