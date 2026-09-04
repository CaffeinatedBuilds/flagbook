/* FlagBook — small shared helpers. Classic script; everything hangs off window.FB. */
(function () {
  'use strict';
  const FB = (window.FB = window.FB || {});
  FB.views = FB.views || {};

  const U = {};

  U.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  U.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  U.el = function (sel, root) { return (root || document).querySelector(sel); };
  U.els = function (sel, root) { return Array.from((root || document).querySelectorAll(sel)); };

  U.clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

  U.todayISO = function () {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  U.parseISODate = function (iso) {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  };

  U.fmtDate = function (iso, opts) {
    const d = U.parseISODate(iso);
    if (!d) return '';
    return d.toLocaleDateString(undefined, opts || { weekday: 'short', month: 'short', day: 'numeric' });
  };

  U.fmtDateLong = function (iso) {
    return U.fmtDate(iso, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  U.fmtTime = function (hhmm) {
    if (!hhmm) return '';
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return hhmm;
    let h = +m[1];
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + m[2] + ' ' + ampm;
  };

  U.isPast = function (iso) {
    const d = U.parseISODate(iso);
    if (!d) return false;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return d < t;
  };

  U.sortBy = function (arr, key) {
    return arr.slice().sort((a, b) => {
      const ka = typeof key === 'function' ? key(a) : a[key];
      const kb = typeof key === 'function' ? key(b) : b[key];
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  };

  U.mapsLink = function (location) {
    return 'https://maps.apple.com/?q=' + encodeURIComponent(location || '');
  };

  U.download = function (filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  };

  U.toast = function (msg, ms) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(U._toastTimer);
    U._toastTimer = setTimeout(() => t.classList.remove('show'), ms || 1800);
  };

  U.hideToast = function () { const t = document.getElementById('toast'); if (t) t.classList.remove('show'); clearTimeout(U._toastTimer); };

  /* Ask yes/no with an in-app sheet; resolves true/false. (window.confirm silently fails in iOS
   * home-screen web apps, which is why "Clear" looked broken.) opts: {ok, cancel, danger} */
  U.confirm = function (msg, opts) {
    opts = opts || {};
    if (!FB.ui || !FB.ui.modal || typeof document === 'undefined' || !document.body) return Promise.resolve(!!window.confirm(msg));
    return new Promise(res => {
      let done = false, m = null;
      const finish = v => { if (done) return; done = true; if (m) m.close(); res(v); };
      m = FB.ui.modal(`<p style="margin:0 0 16px;font-size:16px;white-space:pre-wrap">${U.esc(msg)}</p>
        <div class="actions"><button type="button" class="btn" id="cNo">${U.esc(opts.cancel || 'Cancel')}</button><button type="button" class="btn ${opts.danger ? 'danger' : 'primary'}" id="cYes">${U.esc(opts.ok || 'OK')}</button></div>`,
        { focus: false, onClose: () => finish(false) });
      m.el.querySelector('#cYes').onclick = () => finish(true);
      m.el.querySelector('#cNo').onclick = () => finish(false);
    });
  };

  FB.util = U;
})();
