/* FlagBook — game clips. Record straight from view mode (iOS opens the camera, the clip comes back
 * to the app), land on the playbook ready for the next play, and browse clips per game. */
(function () {
  'use strict';
  const FB = window.FB, U = FB.util, S = FB.store, M = FB.media;
  const C = {};
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  function clipLabel(c) { return c.label || c.playName || 'Clip'; }
  function gameTitle(g) { return g.opponent ? 'vs ' + g.opponent : 'Game'; }
  function when(ms) { return ms ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; }
  function detail(c) { return `${U.esc(c.playName)}${c.quarter ? ' · Q' + c.quarter : ''} · ${M.fmtDuration(c.durationMs) || '?:??'} · ${M.fmtBytes(c.sizeBytes)}`; }
  function fileFor(c, blob) {
    const name = clipLabel(c).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'clip';
    const type = c.mimeType || blob.type || 'video/quicktime';
    return new File([blob], name + M.extFor(type), { type });
  }
  /* iOS share sheet → "Save Video" puts it in Photos. Resolves false when cancelled/unavailable. */
  async function shareFile(file, title) {
    if (!canShare) { U.toast('Sharing is not available here'); return false; }
    try {
      if (navigator.canShare && !navigator.canShare({ files: [file] })) { U.toast('This browser cannot share video files'); return false; }
      await navigator.share({ files: [file], title: title || file.name });
      return true;
    } catch (e) { return false; }
  }
  function removeClip(id) {
    M.remove(id).catch(() => {});
    S.mutate(st => { st.videos = st.videos.filter(v => v.id !== id); });
  }
  const mediaCleanup = (m, url) => () => { const v = m && m.el && m.el.querySelector('video'); if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* ignore */ } } URL.revokeObjectURL(url); };

  /* ---------- from view mode: the camera just handed us a file ---------- */
  C.capture = async function (file, play) {
    if (!file) return;
    const L = S.get().lineup;
    const lineup = { show: L.show, gameId: L.gameId || '', quarter: L.quarter || null };
    const id = U.uid();
    FB.app.go('#/playbook');                       // back to the grid right away; the save finishes underneath
    U.toast('Saving clip…', 60000);
    const durationMs = await M.probeDuration(file);
    const meta = M.meta({ id, file, play, lineup, durationMs });
    let stored = false, why = '';
    if (!M.available) why = location.protocol === 'file:' ? 'The single-file version cannot keep clips.' : 'This browser cannot store clips.';
    else if (file.size > M.MAX_KEEP_BYTES) why = 'This clip is too big to keep in FlagBook (' + M.fmtBytes(file.size) + ').';
    else {
      try { await M.put(id, file); stored = true; }
      catch (e) { why = e && e.name === 'QuotaExceededError' ? 'Not enough space on this device to keep it.' : 'Could not store the clip' + (e && e.message ? ': ' + e.message : '.'); }
    }
    if (stored) S.mutate(st => st.videos.push(meta));
    U.hideToast();
    captureSheet(meta, file, stored, why);
  };

  function captureSheet(meta, file, stored, why) {
    const url = URL.createObjectURL(file);
    let m = null;
    m = FB.ui.modal(`<h2>${stored ? '🎥 Clip saved' : '🎥 Clip not saved'}</h2>
      <video class="clip-video" src="${url}" playsinline controls muted preload="metadata"></video>
      <div class="small muted" style="margin:8px 0 12px">${detail(meta)}</div>
      ${stored ? `<div class="field-row"><label>Label</label><input type="text" id="clabel" value="${U.esc(meta.label)}"></div>`
               : `<p class="hint" style="margin:0 0 12px">${U.esc(why)} Save it to Photos so you keep it.</p>`}
      <div class="actions">${stored ? '<button type="button" class="btn danger" id="cdel">Delete</button>' : ''}${canShare ? `<button type="button" class="btn${stored ? '' : ' primary'}" id="cshare">Save to Photos</button>` : ''}<button type="button" class="btn${stored ? ' primary' : ''}" id="cdone">Done</button></div>`,
      { focus: false, onClose: () => mediaCleanup(m, url)() });
    const q = sel => m.el.querySelector(sel);
    q('#cdone').onclick = m.close;
    const share = q('#cshare'); if (share) share.onclick = async () => { if (await shareFile(file, meta.label)) U.toast('Sent to Photos / shared'); };
    const label = q('#clabel'); if (label) label.onchange = () => S.mutate(st => { const c = st.videos.find(v => v.id === meta.id); if (c) c.label = label.value.trim() || meta.label; });
    const del = q('#cdel'); if (del) del.onclick = () => { if (U.confirm('Delete this clip?')) { removeClip(meta.id); m.close(); U.toast('Clip deleted'); } };
  }

  /* ---------- playback ---------- */
  async function playClip(c) {
    const blob = await M.get(c.id);
    if (!blob) return U.toast('This clip is not on this device');
    const url = URL.createObjectURL(blob);
    let m = null;
    m = FB.ui.modal(`<h2>${U.esc(clipLabel(c))}</h2>
      <video class="clip-video" src="${url}" playsinline controls preload="metadata"></video>
      <div class="small muted" style="margin:8px 0 12px">${detail(c)}</div>
      <div class="actions">${canShare ? '<button type="button" class="btn" id="cshare">Save to Photos</button>' : ''}<button type="button" class="btn primary" id="cdone">Done</button></div>`,
      { focus: false, onClose: () => mediaCleanup(m, url)() });
    m.el.querySelector('#cdone').onclick = m.close;
    const share = m.el.querySelector('#cshare'); if (share) share.onclick = () => shareFile(fileFor(c, blob), clipLabel(c));
    const v = m.el.querySelector('video'); if (v) v.play().catch(() => {});
  }

  /* ---------- clips list: #/clips or #/clips?game=<id> ---------- */
  function rowHTML(c) {
    return `<div class="card clip-row" data-clip="${c.id}">
      <div class="grow"><div class="card-title">${U.esc(clipLabel(c))}</div>
        <div class="small muted">${detail(c)}${c.createdAt ? ' · ' + U.esc(when(c.createdAt)) : ''}</div>
        <div class="small missing-note hidden" style="color:var(--red)">Not on this device</div></div>
      <div class="row" style="gap:6px"><button class="btn icon" data-play title="Play">▶</button>${canShare ? '<button class="btn icon" data-share title="Save to Photos / share">⤴</button>' : ''}<button class="btn icon danger" data-del title="Delete">🗑</button></div>
    </div>`;
  }

  FB.views.clips = {
    render(root, route) {
      const st = S.get();
      const gid = (route.query && route.query.game) || '';
      const g = gid ? S.game(gid) : null;
      FB.ui.setTitle(`<a class="btn ghost sm" href="${g ? '#/games/' + g.id : '#/games'}" aria-label="Back">‹</a><h1>${g ? 'Clips · ' + U.esc(gameTitle(g)) : 'Clips'}</h1>${g ? '<a class="btn sm" href="#/clips">All clips</a>' : ''}`);
      let clips = st.videos.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      if (gid) clips = clips.filter(c => c.gameId === gid);
      if (!clips.length) {
        root.innerHTML = `<div class="empty">No clips${g ? ' for this game' : ''} yet.<br><br><span class="small">Open a play in the <a href="#/playbook">playbook</a> and tap <b>🎥</b> to record one. When you stop, you land back on the playbook.</span></div>`;
        return;
      }
      const groups = new Map();                      // most recent game first (clips are sorted newest first)
      for (const c of clips) { const k = c.gameId && S.game(c.gameId) ? c.gameId : ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
      let html = '';
      for (const [k, list] of groups) {
        const gg = k ? S.game(k) : null;
        html += `<div class="section"><h3>${gg ? U.esc(gameTitle(gg)) + ' · ' + U.fmtDate(gg.date) : (groups.size > 1 ? 'Other clips' : 'Clips')}</h3>${list.map(rowHTML).join('')}</div>`;
      }
      html += `<p class="small muted" style="text-align:center;margin-top:16px">Clips stay on this device and are not in the JSON backup. Use Save to Photos for a permanent copy.</p>`;
      root.innerHTML = html;

      root.querySelectorAll('[data-clip]').forEach(el => {
        const c = st.videos.find(v => v.id === el.dataset.clip); if (!c) return;
        el.querySelector('[data-play]').onclick = () => playClip(c);
        const sh = el.querySelector('[data-share]'); if (sh) sh.onclick = async () => { const blob = await M.get(c.id); if (!blob) return U.toast('This clip is not on this device'); shareFile(fileFor(c, blob), clipLabel(c)); };
        el.querySelector('[data-del]').onclick = () => { if (U.confirm('Delete this clip?')) { removeClip(c.id); U.toast('Clip deleted'); } };
        M.has(c.id).then(ok => {
          if (ok || !el.isConnected) return;
          el.querySelector('.missing-note').classList.remove('hidden');
          el.querySelector('[data-play]').disabled = true;
          if (sh) sh.disabled = true;
        });
      });
    }
  };

  FB.clips = C;
})();
