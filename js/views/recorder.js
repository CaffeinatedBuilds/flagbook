/* FlagBook — the in-app camera page (#/record/<playId> or #/record/defense). Full-bleed preview from the
 * rear ultra-wide lens, one big record button, then the clip goes through FB.clips.capture exactly like a
 * file from the iOS camera. selfManaged: saving the lens choice must not re-render and kill the stream. */
(function () {
  'use strict';
  const FB = window.FB, U = FB.util, S = FB.store, M = FB.media, R = FB.recorder;

  const V = { session: null, recording: null, timer: null, wake: null, pq: null, onVis: null, onOrient: null, root: null, play: null, side: 'offense', gone: false };

  function clipTitle(play, side) {
    const L = S.get().lineup;
    return M.meta({ play, lineup: { gameId: L.gameId || '', quarter: L.quarter || null }, seq: S.nextClipSeq(L.gameId || ''), side }).label;
  }
  const dims = s => (s && s.width && s.height ? s.width + '×' + s.height + (s.frameRate ? ' · ' + Math.round(s.frameRate) + ' fps' : '') : '');
  const q = sel => V.root && V.root.querySelector(sel);

  async function wakeOn() { try { if (navigator.wakeLock && !V.wake) V.wake = await navigator.wakeLock.request('screen'); } catch (e) { V.wake = null; } }
  function wakeOff() { if (V.wake) { try { V.wake.release(); } catch (e) { /* ignore */ } V.wake = null; } }

  function showPreview() {
    const v = q('#recPrev'); if (!v || !V.session) return;
    v.srcObject = V.session.stream;
    v.play().catch(() => {});
    const d = q('#recDim'); if (d) d.textContent = dims(V.session.settings);
    const lens = q('#lens');
    if (lens) {
      lens.classList.toggle('ghost', !V.session.hasUltra);   // keeps its space so the record button stays centred
      lens.querySelectorAll('[data-lens]').forEach(b => b.classList.toggle('on', b.dataset.lens === V.session.lens));
    }
    if (V.session.track) V.session.track.onended = () => { if (V.recording) handoff(); };
  }

  /* camera refused or missing → the old path, from a real tap so the file input may open */
  function nativeFallback(msg) {
    const stage = q('#recStage'); if (!stage) return;
    V.fallback = true; const hint = q('#rotHint'); if (hint) hint.classList.add('hidden');   // the rotate nag would sit on top of the message
    stage.innerHTML = `<div class="rec-fallback"><p>${U.esc(msg)}</p><button class="btn primary" id="recNative">Open iPhone Camera</button>
      <input type="file" accept="video/*" capture="environment" id="recNativeIn" class="hidden" aria-hidden="true" tabindex="-1"></div>`;
    const inp = q('#recNativeIn');
    q('#recNative').onclick = () => { inp.value = ''; inp.click(); };
    inp.onchange = () => { const f = inp.files && inp.files[0]; inp.value = ''; if (f) FB.clips.capture(f, V.play, { side: V.side }); };
    const lens = q('#lens'); if (lens) lens.classList.add('ghost');
    const rb = q('#recBtn'); if (rb) rb.disabled = true;
  }

  async function openCamera() {
    if (V.session || V.gone) return;
    try {
      const s = await R.open(S.get().settings.lens || 'ultra');
      if (V.gone) { R.stopStream(s.stream); return; }
      V.session = s;
      showPreview();
    } catch (e) {
      const name = e && e.name;
      nativeFallback(name === 'NotAllowedError' ? 'FlagBook was not allowed to use the camera. You can still record with the iPhone camera.'
        : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'No rear camera found here.'
        : 'The camera could not be started' + (e && e.message ? ' (' + e.message + ')' : '') + '.');
    }
  }
  function closeCamera() { if (V.session) { R.stopStream(V.session.stream); V.session = null; } const v = q('#recPrev'); if (v) v.srcObject = null; }

  function setRecording(on) {
    const rb = q('#recBtn'); if (rb) { rb.classList.toggle('on', on); rb.setAttribute('aria-label', on ? 'Stop' : 'Record'); }
    ['#recClose', '#recImport'].forEach(s => { const b = q(s); if (b) b.disabled = on; });
    q('#lens') && q('#lens').querySelectorAll('button').forEach(b => { b.disabled = on; });
    const t = q('#recTime'); if (t) { t.classList.toggle('live', on); if (!on) t.textContent = '0:00'; }
  }
  function tick() {
    if (!V.recording) return;
    const ms = V.recording.elapsed();
    const t = q('#recTime'); if (t) t.textContent = M.fmtDuration(ms);
    if (ms >= R.MAX_MS) { U.toast('Clips stop at ' + M.fmtDuration(R.MAX_MS)); handoff(); }
  }
  function start() {
    if (!V.session || V.recording) return;
    try { V.recording = R.record(V.session.stream, V.session.settings); }
    catch (e) { U.toast('Could not start recording' + (e && e.message ? ': ' + e.message : '')); return; }
    setRecording(true);
    wakeOn();
    clearInterval(V.timer); V.timer = setInterval(tick, 250);
  }
  /* stop and hand the clip to the normal pipeline (which lands on the playbook and saves underneath) */
  async function handoff() {
    const rec = V.recording; if (!rec) return;
    V.recording = null; clearInterval(V.timer); V.timer = null;
    const r = await rec.stop();
    wakeOff();
    if (V.gone) return;                                   // navigated away mid-recording: nothing to keep
    setRecording(false);
    if (!r.file.size || r.durationMs < 1000) { U.toast('Too short — nothing saved'); return; }
    const play = V.play, side = V.side;
    history.replaceState(null, '', '#/playbook');         // Back must not reopen the camera
    FB.clips.capture(r.file, play, { side, durationMs: r.durationMs, width: r.width, height: r.height });
  }

  FB.views.recorder = {
    className: 'editor recorder-page',
    selfManaged: true,
    render(root, route) {
      V.root = root; V.gone = false; V.fallback = false;
      const def = route.id === 'defense';
      V.play = def ? { id: '', name: 'Defense' } : S.play(route.id);
      V.side = def ? 'defense' : 'offense';
      if (!V.play) { root.innerHTML = '<div class="empty">Play not found. <a href="#/playbook">Back to playbook</a></div>'; return; }
      document.body.classList.add('viewing', 'recording');
      FB.ui.setTitle('');
      const lens = S.get().settings.lens || 'ultra';
      root.innerHTML = `<div class="recorder">
        <div class="rec-stage" id="recStage"><video id="recPrev" autoplay muted playsinline></video></div>
        <div class="rec-top">
          <button class="rbtn" id="recClose" aria-label="Close">✕</button>
          <div class="rec-title">${U.esc(clipTitle(V.play, V.side))}</div>
          <div class="rec-dim" id="recDim"></div>
        </div>
        <div class="rec-hint hidden" id="rotHint">⟳ Turn your phone sideways to get the whole field</div>
        <div class="rec-notice hidden" id="lowSpace"></div>
        <div class="rec-bottom">
          <div class="seg lens ghost" id="lens"><button type="button" data-lens="ultra"${lens === 'ultra' ? ' class="on"' : ''}>0.5×</button><button type="button" data-lens="wide"${lens !== 'ultra' ? ' class="on"' : ''}>1×</button></div>
          <button class="rec-btn" id="recBtn" aria-label="Record"><span></span></button>
          <div class="rec-right"><span class="rec-time" id="recTime">0:00</span><button class="rbtn" id="recImport" title="Add a video from Photos">📥 Import</button></div>
        </div>
      </div>`;
      q('#recClose').onclick = () => { FB.app.go(def ? '#/playbook' : '#/view/' + V.play.id); };
      q('#recBtn').onclick = () => { if (V.recording) handoff(); else start(); };
      q('#recImport').onclick = () => FB.clips.pickImport(V.play, { side: V.side });
      root.querySelectorAll('[data-lens]').forEach(b => b.onclick = async () => {
        if (V.recording || !V.session) return;
        const want = b.dataset.lens;
        S.mutate(st => { st.settings.lens = want; });
        await R.switchLens(V.session, want);
        showPreview();
      });
      // landscape gets the whole field; iOS has no orientation lock, so just say so
      if (typeof matchMedia === 'function') {
        V.pq = matchMedia('(orientation: portrait)');
        V.onOrient = () => { const h = q('#rotHint'); if (h) h.classList.toggle('hidden', V.fallback || !V.pq.matches); };
        V.pq.addEventListener('change', V.onOrient); V.onOrient();
      }
      // iOS ends the camera when the app goes to the background: keep what was recorded, restart the preview on return
      V.onVis = () => {
        if (document.hidden) { if (V.recording) handoff(); else closeCamera(); }
        else { if (V.recording) wakeOn(); else if (!V.session) openCamera(); }
      };
      document.addEventListener('visibilitychange', V.onVis);
      M.usage().then(u => {
        const el = q('#lowSpace'); if (!el || !u || !u.quota) return;
        const free = u.quota - u.usage;
        if (free < 300 * 1024 * 1024) { el.textContent = 'Low storage: ' + M.fmtBytes(Math.max(0, free)) + ' free. The clip can still be saved to Photos.'; el.classList.remove('hidden'); }
      });
      openCamera();
    },
    destroy() {
      V.gone = true;
      document.body.classList.remove('viewing', 'recording');
      clearInterval(V.timer); V.timer = null;
      if (V.recording) { const rec = V.recording; V.recording = null; rec.stop().catch(() => {}); }   // leaving = cancel
      closeCamera();
      wakeOff();
      if (V.onVis) { document.removeEventListener('visibilitychange', V.onVis); V.onVis = null; }
      if (V.pq && V.onOrient) { V.pq.removeEventListener('change', V.onOrient); V.pq = null; V.onOrient = null; }
      V.root = null; V.play = null;
    }
  };
})();
