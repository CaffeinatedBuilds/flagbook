/* FlagBook — video clips. The files are far too big for the localStorage JSON, so the blob lives in
 * IndexedDB (this device only) and the store keeps just the metadata (id, play, game, quarter, size…).
 * Everything here degrades to "unavailable" (resolves null) when there is no IndexedDB, e.g. the
 * single-file dist/flagbook.html opened from Files, or the JavaScriptCore test runner. */
(function () {
  'use strict';
  const FB = (window.FB = window.FB || {});
  const M = {};

  const hasIDB = typeof indexedDB !== 'undefined' && indexedDB !== null;
  const isFile = typeof location !== 'undefined' && location.protocol === 'file:';
  M.available = hasIDB && !isFile;

  M.WARN_BYTES = 500 * 1024 * 1024;          // warn above this
  M.MAX_KEEP_BYTES = 1.5 * 1024 * 1024 * 1024; // refuse to keep in-app above this (share to Photos instead)

  /* ---------- IndexedDB: one store of {id, blob, createdAt} ---------- */
  const DB = 'flagbook-media', STORE = 'videos';
  let dbp = null;
  function db() {
    if (!M.available) return Promise.resolve(null);
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      let req;
      try { req = indexedDB.open(DB, 1); } catch (e) { dbp = null; return rej(e); }
      req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => { const d = req.result; d.onversionchange = () => { d.close(); dbp = null; }; res(d); };
      req.onerror = () => { dbp = null; rej(req.error); };
    });
    return dbp;
  }
  /* run fn(store) in a transaction; resolves with the request's result (or null) once the transaction commits. */
  function tx(mode, fn) {
    return db().then(d => {
      if (!d) return null;
      return new Promise((res, rej) => {
        const t = d.transaction(STORE, mode);
        let out = null;
        const r = fn(t.objectStore(STORE));
        if (r) r.onsuccess = () => { out = r.result === undefined ? null : r.result; };
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error || (r && r.error) || new Error('IndexedDB error'));
        t.onabort = () => rej(t.error || (r && r.error) || new Error('IndexedDB aborted'));
      });
    });
  }

  M.put = (id, blob) => tx('readwrite', s => s.put({ id, blob, createdAt: Date.now() })).then(() => (M.available ? true : null));
  M.get = id => tx('readonly', s => s.get(id)).then(rec => (rec && rec.blob) || null);
  M.has = id => tx('readonly', s => s.getKey(id)).then(k => k != null).catch(() => false);
  M.remove = id => tx('readwrite', s => s.delete(id));
  M.clear = () => tx('readwrite', s => s.clear());

  /* {usage, quota} in bytes, or null when the browser will not say. */
  M.usage = function () {
    const st = typeof navigator !== 'undefined' && navigator.storage;
    if (!st || !st.estimate) return Promise.resolve(null);
    return st.estimate().then(e => ({ usage: e.usage || 0, quota: e.quota || 0 })).catch(() => null);
  };
  /* true / false, or null when unknown. Keeps 10% headroom. */
  M.canFit = bytes => M.usage().then(e => (e && e.quota ? (e.usage + bytes) * 1.1 < e.quota : null));

  /* ---------- pure helpers (unit tested) ---------- */
  M.fmtBytes = function (n) {
    n = +n || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    if (n < 1024 * 1024 * 1024) { const mb = n / (1024 * 1024); return (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + ' MB'; }
    return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };
  M.fmtDuration = function (ms) {
    if (ms == null || !isFinite(ms) || ms < 0) return '';
    const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const two = n => String(n).padStart(2, '0');
    return h ? h + ':' + two(m) + ':' + two(sec) : m + ':' + two(sec);
  };
  M.extFor = type => (type === 'video/mp4' ? '.mp4' : type === 'video/webm' ? '.webm' : '.mov');

  /* Metadata record kept in the store. lineup = {show, gameId, quarter} snapshot taken before navigating away. */
  M.meta = function (o) {
    const play = o.play || {}, L = o.lineup || {}, file = o.file || {};
    const quarter = L.quarter ? +L.quarter : null;
    const playName = play.name || 'Play';
    const seq = o.seq ? +o.seq : null;                       // 1, 2, 3… within the game
    return {
      id: o.id || FB.util.uid(),
      playId: play.id || '',
      playName,
      gameId: L.gameId || '',
      quarter,
      seq,
      label: o.label || ((seq ? 'Play ' + seq + ' · ' : '') + playName + (quarter ? ' · Q' + quarter : '')),
      notes: o.notes || '',
      createdAt: o.createdAt || Date.now(),
      durationMs: o.durationMs == null ? null : o.durationMs,
      sizeBytes: file.size || 0,
      mimeType: file.type || ''
    };
  };

  /* Duration of a video blob in ms via a detached <video>; null if the browser cannot tell within 3s. */
  M.probeDuration = function (blob) {
    return new Promise(res => {
      if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return res(null);
      let url; try { url = URL.createObjectURL(blob); } catch (e) { return res(null); }
      const v = document.createElement('video');
      let done = false, timer = null;
      const finish = ms => {
        if (done) return; done = true; clearTimeout(timer);
        try { v.removeAttribute('src'); v.load(); } catch (e) { /* ignore */ }
        URL.revokeObjectURL(url); res(ms);
      };
      timer = setTimeout(() => finish(null), 3000);
      v.preload = 'metadata'; v.muted = true;
      v.onloadedmetadata = () => finish(isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration * 1000) : null);
      v.onerror = () => finish(null);
      v.src = url;
    });
  };

  FB.media = M;
})();
