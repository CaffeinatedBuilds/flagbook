/* FlagBook — Film. Record straight from view mode (iOS opens the camera, the clip comes back to the
 * app), land on the playbook ready for the next play, and review clips per game with comments. */
(function () {
  'use strict';
  const FB = window.FB, U = FB.util, S = FB.store, M = FB.media;
  const C = {};
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  function clipLabel(c) { return c.label || c.playName || 'Clip'; }
  function gameTitle(g) { return g.opponent ? 'vs ' + g.opponent : 'Game'; }
  function when(ms) { return ms ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; }
  const coachName = () => (S.get().settings.coachName || '').trim();
  const byLabel = c => c.by || 'Coach';
  function commentHTML(c, clipId) {
    return `<div class="comment" data-comment="${c.id}"><div class="row spread"><span class="small"><b>${U.esc(byLabel(c))}</b> <span class="muted">· ${U.esc(when(c.at))}</span></span>${clipId ? '<button type="button" class="btn ghost sm" data-del-comment title="Delete comment">✕</button>' : ''}</div><div class="comment-text">${U.esc(c.text)}</div></div>`;
  }
  /* the textarea + name box used by both sheets */
  function commentForm(placeholder) {
    const name = coachName();
    return `<div class="field-row" style="margin-bottom:8px"><label>Comment</label><textarea id="ctext" placeholder="${U.esc(placeholder || 'What happened? Who made the play?')}" style="min-height:60px"></textarea></div>
      <div class="row" style="gap:8px;margin-bottom:12px"><input type="text" id="cby" placeholder="Your name" value="${U.esc(name)}" autocomplete="name" style="flex:1"><button type="button" class="btn" id="cpost">Post</button></div>`;
  }
  function detail(c) { return `${U.esc(c.playName)}${c.quarter ? ' · Q' + c.quarter : ''} · ${M.fmtDuration(c.durationMs) || '?:??'} · ${M.fmtBytes(c.sizeBytes)}`; }
  const sideChip = c => c.side === 'defense' ? '<span class="chip side-def">DEF</span>' : '<span class="chip side-off">OFF</span>';
  function fileFor(c, blob) {
    const base = (c.seq ? 'Play-' + String(c.seq).padStart(2, '0') + ' ' : '') + clipLabel(c).replace(/^Play \d+ · /, '');
    const name = base.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'clip';
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
  /* Every clip of a game in one share sheet → "Save N Videos" puts them all in Photos. */
  async function shareAll(clips, title) {
    if (!canShare) return U.toast('Sharing is not available here');
    U.toast(`Preparing ${clips.length} clip${clips.length === 1 ? '' : 's'}…`, 60000);
    const files = [];
    for (const c of clips) { const blob = await M.get(c.id); if (blob) files.push(fileFor(c, blob)); }
    U.hideToast();
    if (!files.length) return U.toast('None of these clips are on this device');
    if (navigator.canShare && !navigator.canShare({ files })) return U.toast('This browser cannot share that many videos at once. Save them one at a time.');
    try { await navigator.share({ files, title }); U.toast(files.length < clips.length ? `Shared ${files.length} of ${clips.length} (the rest are not on this device)` : 'Sent to Photos / shared'); }
    catch (e) { /* cancelled */ }
  }
  function removeClip(id) {
    M.remove(id).catch(() => {});
    S.mutate(st => { st.videos = st.videos.filter(v => v.id !== id); });
  }
  const mediaCleanup = (m, url) => () => { const v = m && m.el && m.el.querySelector('video'); if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* ignore */ } } URL.revokeObjectURL(url); };

  /* ---------- from view mode: the camera just handed us a file ---------- */
  /* opts.side = 'defense' for a defensive snap (recorded from the playbook grid); the play number keeps
   * counting across offense and defense so the whole game reads in order. */
  C.capture = async function (file, play, opts) {
    if (!file) return;
    opts = opts || {};
    const L = S.get().lineup;
    const lineup = { show: L.show, gameId: L.gameId || '', quarter: L.quarter || null };
    const id = U.uid();
    FB.app.go('#/playbook');                       // back to the grid right away; the save finishes underneath
    U.toast('Saving clip…', 60000);
    const seq = S.nextClipSeq(lineup.gameId);
    const durationMs = await M.probeDuration(file);
    const meta = M.meta({ id, file, play, lineup, durationMs, seq, side: opts.side });
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
      ${stored ? `<div class="field-row"><label>Label</label><input type="text" id="clabel" value="${U.esc(meta.label)}"></div>
                  <div id="clist"></div>${commentForm()}`
               : `<p class="hint" style="margin:0 0 12px">${U.esc(why)} Save it to Photos so you keep it.</p>`}
      <div class="actions">${stored ? '<button type="button" class="btn danger" id="cdel">Delete</button>' : ''}${canShare ? `<button type="button" class="btn${stored ? '' : ' primary'}" id="cshare">Save to Photos</button>` : ''}<button type="button" class="btn${stored ? ' primary' : ''}" id="cdone">Done</button></div>`,
      { focus: false, onClose: () => mediaCleanup(m, url)() });
    const q = sel => m.el.querySelector(sel);
    q('#cdone').onclick = m.close;
    const share = q('#cshare'); if (share) share.onclick = async () => { if (await shareFile(file, meta.label)) U.toast('Sent to Photos / shared'); };
    const label = q('#clabel'); if (label) label.onchange = () => S.mutate(st => { const c = st.videos.find(v => v.id === meta.id); if (c) c.label = label.value.trim() || meta.label; });
    if (stored) bindComments(m, meta.id);
    const del = q('#cdel'); if (del) del.onclick = () => U.confirm('Delete this clip?', { ok: 'Delete', danger: true }).then(ok => { if (ok) { removeClip(meta.id); m.close(); U.toast('Clip deleted'); } });
  }

  /* ---------- comments (shared by the capture sheet and the clip sheet) ---------- */
  function bindComments(m, clipId) {
    const q = sel => m.el.querySelector(sel);
    const list = q('#clist'), text = q('#ctext'), by = q('#cby'), post = q('#cpost');
    const draw = () => {
      const v = S.get().videos.find(x => x.id === clipId); const cs = (v && v.comments) || [];
      list.innerHTML = cs.length ? `<div class="subhead">Comments · ${cs.length}</div>` + cs.map(c => commentHTML(c, clipId)).join('') : '';
      list.querySelectorAll('[data-del-comment]').forEach(b => b.onclick = () => U.confirm('Delete this comment?', { ok: 'Delete', danger: true }).then(ok => { if (ok) { S.removeClipComment(clipId, b.closest('[data-comment]').dataset.comment); draw(); } }));
    };
    const submit = () => {
      if (!text.value.trim()) return U.toast('Write a comment first');
      if (!by.value.trim()) { by.focus(); return U.toast('Add your name so the team knows who said it'); }
      S.addClipComment(clipId, text.value, by.value); text.value = ''; draw();
    };
    post.onclick = submit;
    text.onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); };
    draw();
  }

  /* ---------- label + comments sheet ---------- */
  function clipSheet(c) {
    const m = FB.ui.modal(`<h2>${U.esc(clipLabel(c))}</h2>
      <div class="small muted" style="margin:-8px 0 12px">${detail(c)}${c.createdAt ? ' · ' + U.esc(when(c.createdAt)) : ''}</div>
      <div class="field-row"><label>Label</label><input type="text" id="clabel" value="${U.esc(clipLabel(c))}"></div>
      <div id="clist"></div>${commentForm()}
      <div class="actions"><button type="button" class="btn primary" id="cdone">Done</button></div>`, { focus: false });
    m.el.querySelector('#cdone').onclick = m.close;
    m.el.querySelector('#clabel').onchange = e => S.mutate(st => { const v = st.videos.find(x => x.id === c.id); if (v) v.label = e.target.value.trim() || clipLabel(c); });
    bindComments(m, c.id);
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
    const cs = c.comments || [], last = cs[cs.length - 1];
    return `<div class="card clip-row tap" data-clip="${c.id}" title="Tap for comments">
      <div class="grow"><div class="card-title">${sideChip(c)} ${U.esc(clipLabel(c))}</div>
        <div class="small muted">${detail(c)}${c.createdAt ? ' · ' + U.esc(when(c.createdAt)) : ''}</div>
        ${last ? `<div class="small clip-notes">💬 ${cs.length > 1 ? cs.length + ' · ' : ''}<b>${U.esc(byLabel(last))}:</b> ${U.esc(last.text)}</div>` : `<div class="small muted clip-notes">💬 <i>Add a comment</i></div>`}
        <div class="small missing-note hidden" style="color:var(--red)">Not on this device</div></div>
      <div class="row" style="gap:6px"><button class="btn icon" data-play title="Play">▶</button>${canShare ? '<button class="btn icon" data-share title="Save to Photos / share">⤴</button>' : ''}<button class="btn icon danger" data-del title="Delete">🗑</button></div>
    </div>`;
  }

  const FOOT = `<p class="small muted" style="text-align:center;margin-top:16px">Film stays on this device and is not in the JSON backup (comments are). Use Save to Photos for a permanent copy.<span id="mediaUse"></span></p>`;
  const showUsage = root => M.usage().then(u => { const el = root.querySelector('#mediaUse'); if (el && u && u.usage) el.textContent = ` Using ${M.fmtBytes(u.usage)}${u.quota ? ' of ' + M.fmtBytes(u.quota) : ''}.`; });
  const bySeq = (a, b) => (+a.seq || 0) - (+b.seq || 0) || (a.createdAt || 0) - (b.createdAt || 0);   // Play 1, 2, 3… within a game
  const groupKey = c => (c.gameId && S.game(c.gameId) ? c.gameId : 'none');

  /* #/film → one card per game; #/film?game=<id|none> → that game's clips */
  FB.views.clips = {
    render(root, route) {
      const st = S.get();
      const gid = (route.query && route.query.game) || '';
      if (gid) return renderGame(root, st, gid);
      FB.ui.setTitle(`<h1>Film</h1>`);
      if (!st.videos.length) {
        root.innerHTML = `<div class="empty">No film yet.<br><br><span class="small">Open a play in the <a href="#/playbook">playbook</a> and tap <b>🎥</b> to record a clip. When you stop, you land back on the playbook.</span></div>`;
        return;
      }
      const groups = new Map();                      // most recent game first
      for (const c of st.videos.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))) { const k = groupKey(c); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
      let html = '';
      for (const [k, list] of groups) {
        const gg = k !== 'none' ? S.game(k) : null;
        const ms = list.reduce((t, c) => t + (c.durationMs || 0), 0), bytes = list.reduce((t, c) => t + (c.sizeBytes || 0), 0);
        const comments = list.reduce((t, c) => t + ((c.comments || []).length), 0);
        html += `<a class="card tap" href="#/film?game=${k}" style="display:block;text-decoration:none">
          <div class="row spread"><div class="card-title">🎬 ${gg ? U.esc(gameTitle(gg)) : 'Other clips'}</div><div class="muted">${gg ? U.fmtDate(gg.date) : ''}</div></div>
          <div class="row wrap small muted" style="margin-top:6px;gap:12px"><span>${list.length} clip${list.length === 1 ? '' : 's'}</span>${ms ? `<span>${M.fmtDuration(ms)}</span>` : ''}<span>${M.fmtBytes(bytes)}</span>${comments ? `<span>💬 ${comments}</span>` : ''}</div></a>`;
      }
      root.innerHTML = html + FOOT;
      showUsage(root);
    }
  };

  function renderGame(root, st, gid) {
    const g = gid !== 'none' ? S.game(gid) : null;
    FB.ui.setTitle(`<a class="btn ghost sm" href="#/film" aria-label="All film">‹</a><h1>${g ? U.esc(gameTitle(g)) + ' · film' : 'Other clips'}</h1>${g ? `<a class="btn sm" href="#/games/${g.id}">Game</a>` : ''}`);
    const clips = st.videos.filter(c => groupKey(c) === gid).sort(bySeq);
    if (!clips.length) {
      root.innerHTML = `<div class="empty">No film for this game yet.<br><br><span class="small">Pick this game in the playbook's lineup bar, open a play and tap <b>🎥</b>.</span></div>`;
      return;
    }
    const nDef = clips.filter(c => c.side === 'defense').length, nOff = clips.length - nDef;
    root.innerHTML = `<div class="section" style="margin-top:0"><div class="row spread"><h3>${g ? U.fmtDate(g.date) + ' · ' : ''}${clips.length} clip${clips.length === 1 ? '' : 's'}${nDef ? ` <span class="muted" style="font-weight:600">· ${nOff} off · ${nDef} def</span>` : ''}</h3>${canShare ? `<button class="btn sm" id="shareAll" title="Every clip of this game in one share sheet → Save Video">⤴ Save all to Photos</button>` : ''}</div>${clips.map(rowHTML).join('')}</div>${FOOT}`;
    const sa = root.querySelector('#shareAll'); if (sa) sa.onclick = () => shareAll(clips, g ? gameTitle(g) + ' clips' : 'FlagBook clips');
    root.querySelectorAll('[data-clip]').forEach(el => {
        const c = st.videos.find(v => v.id === el.dataset.clip); if (!c) return;
        el.onclick = e => { if (!e.target.closest('button, a')) clipSheet(c); };
        el.querySelector('[data-play]').onclick = () => playClip(c);
        const sh = el.querySelector('[data-share]'); if (sh) sh.onclick = async () => { const blob = await M.get(c.id); if (!blob) return U.toast('This clip is not on this device'); shareFile(fileFor(c, blob), clipLabel(c)); };
        el.querySelector('[data-del]').onclick = () => U.confirm('Delete this clip?', { ok: 'Delete', danger: true }).then(ok => { if (ok) { removeClip(c.id); U.toast('Clip deleted'); } });
        M.has(c.id).then(ok => {
          if (ok || !el.isConnected) return;
          el.querySelector('.missing-note').classList.remove('hidden');
          el.querySelector('[data-play]').disabled = true;
          if (sh) sh.disabled = true;
        });
    });
    showUsage(root);
  }

  FB.clips = C;
})();
