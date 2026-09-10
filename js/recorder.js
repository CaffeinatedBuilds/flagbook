/* FlagBook — in-app camera. iOS's file-input camera records at "medium" quality with the 1x lens and a
 * tight crop, so the 🎥 buttons open our own recorder instead: getUserMedia on the rear ultra-wide (0.5x)
 * lens at the highest resolution Safari will give (1080p on most iPhones, 4K where offered) and
 * MediaRecorder writing an MP4 that goes through the normal clip pipeline. Everything browser-specific is
 * guarded so this file also loads in the JavaScriptCore test runner; the pure helpers take their inputs
 * as arguments so they can be unit tested. When any of it is missing the app falls back to the file input. */
(function () {
  'use strict';
  const FB = (window.FB = window.FB || {});
  const R = {};

  /* ---------- pure helpers (unit tested) ---------- */
  R.MIME_ORDER = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  /* first type the browser can record, or '' */
  R.pickMime = isTypeSupported => R.MIME_ORDER.find(t => { try { return !!isTypeSupported(t); } catch (e) { return false; } }) || '';
  /* 'video/mp4;codecs=avc1' → 'video/mp4' (what goes on the File so extFor/canShare see a plain type) */
  R.containerOf = mime => (mime || '').split(';')[0].trim();
  /* ~16 Mbps at 1080p30, scaled by pixel count, half again above 30 fps, kept between 4 and 40 Mbps */
  R.bitrateFor = function (w, h, fps) {
    const px = w > 0 && h > 0 ? w * h : 1920 * 1080;
    const base = 16e6 * px / (1920 * 1080) * ((fps || 30) > 30 ? 1.5 : 1);
    return Math.round(Math.min(40e6, Math.max(4e6, base)));
  };
  const isUltra = d => /ultra\s*wide/i.test(d.label || '');
  const cams = devices => (devices || []).filter(d => d && d.kind === 'videoinput');
  const backCams = devices => cams(devices).filter(d => /back|rear|environment/i.test(d.label || ''));
  /* deviceId of the lens we want ('ultra' = 0.5x, 'wide' = 1x), or null when labels are unknown → use facingMode */
  R.pickLens = function (devices, want) {
    const back = backCams(devices);
    if (want === 'ultra') { const u = back.find(isUltra); if (u) return u.deviceId; }
    const plain = back.find(d => !/ultra|tele|dual|triple/i.test(d.label)) || back.find(d => !/ultra|tele/i.test(d.label)) || back[0];
    return plain ? plain.deviceId : null;
  };
  R.hasUltraWide = devices => backCams(devices).some(isUltra);
  R.lensOf = (devices, deviceId) => { const d = cams(devices).find(x => x.deviceId === deviceId); return d && isUltra(d) ? 'ultra' : 'wide'; };
  R.constraintsFor = (deviceId, facing) => ({
    audio: true,
    video: Object.assign(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: facing || 'environment' },
      { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 60, max: 60 } })
  });
  R.fileName = (mime, ts) => 'clip-' + (ts || Date.now()) + FB.media.extFor(R.containerOf(mime));
  R.MAX_MS = 3 * 60 * 1000;                 // auto-stop: the chunks sit in memory until the clip is saved

  /* ---------- feature detection ---------- */
  let supported = null;
  Object.defineProperty(R, 'supported', {
    get() {
      if (supported == null) {
        const gum = typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
        const mr = typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function';
        supported = !!(gum && mr && typeof File !== 'undefined' && R.pickMime(MediaRecorder.isTypeSupported));
      }
      return supported;
    }
  });
  /* the coach can force the old Camera-app path from More → Record clips with */
  R.enabled = () => R.supported && ((FB.store && FB.store.get().settings.recMode) || 'app') !== 'native';

  /* ---------- camera session ---------- */
  const videoTrack = s => s.getVideoTracks()[0];
  const stopTrack = t => { try { t.stop(); } catch (e) { /* ignore */ } };
  R.stopStream = s => { if (s) s.getTracks().forEach(stopTrack); };

  /* Swap only the video track so the microphone permission is not asked twice. Keeps the old track on failure. */
  async function useDevice(session, deviceId) {
    const cur = videoTrack(session.stream);
    if (!deviceId || (cur && cur.getSettings().deviceId === deviceId)) return false;
    let s2;
    try { s2 = await navigator.mediaDevices.getUserMedia({ video: R.constraintsFor(deviceId).video }); }
    catch (e) { return false; }
    const nt = videoTrack(s2);
    if (!nt) return false;
    if (cur) { session.stream.removeTrack(cur); stopTrack(cur); }
    session.stream.addTrack(nt);
    return true;
  }
  function refresh(session) {
    const t = videoTrack(session.stream);
    session.track = t || null;
    session.settings = t ? t.getSettings() : {};
    session.lens = R.lensOf(session.devices, session.settings.deviceId);
    return session;
  }

  /* Open the rear camera, then move to the requested lens once the device labels are known (iOS only
   * names cameras after permission is granted). Resolves { stream, track, settings, devices, hasUltra, lens }. */
  R.open = async function (lens) {
    const stream = await navigator.mediaDevices.getUserMedia(R.constraintsFor(null, 'environment'));
    const session = { stream, devices: [], hasUltra: false };
    try { session.devices = await navigator.mediaDevices.enumerateDevices(); } catch (e) { /* keep the first stream */ }
    session.hasUltra = R.hasUltraWide(session.devices);
    await useDevice(session, R.pickLens(session.devices, lens));
    return refresh(session);
  };
  R.switchLens = async function (session, lens) {
    await useDevice(session, R.pickLens(session.devices, lens));
    return refresh(session);
  };

  /* Start recording the stream; the handle's stop() resolves { file, durationMs, width, height }. */
  R.record = function (stream, videoSettings) {
    videoSettings = videoSettings || {};
    const mime = R.pickMime(MediaRecorder.isTypeSupported);
    const opts = { videoBitsPerSecond: R.bitrateFor(videoSettings.width, videoSettings.height, videoSettings.frameRate), audioBitsPerSecond: 128e3 };
    if (mime) opts.mimeType = mime;
    const rec = new MediaRecorder(stream, opts);
    const chunks = [];
    const t0 = performance.now();
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(res => { rec.onstop = () => res(); rec.onerror = () => res(); });
    rec.start(1000);
    return {
      rec,
      elapsed: () => performance.now() - t0,
      get active() { return rec.state !== 'inactive'; },
      async stop() {
        if (rec.state !== 'inactive') { try { rec.stop(); } catch (e) { /* already stopped */ } }
        await done;
        const type = R.containerOf(rec.mimeType || mime);
        const blob = new Blob(chunks, { type });
        chunks.length = 0;
        return { file: new File([blob], R.fileName(type), { type }), durationMs: Math.round(performance.now() - t0), width: videoSettings.width || 0, height: videoSettings.height || 0 };
      }
    };
  };

  FB.recorder = R;
})();
