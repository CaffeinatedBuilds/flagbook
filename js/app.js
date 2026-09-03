/* FlagBook — router, shared UI helpers, boot. */
(function () {
  'use strict';
  const FB = (window.FB = window.FB || {});
  const U = FB.util, S = FB.store;
  FB.views = FB.views || {};

  /* ---------- UI helpers ---------- */
  const UI = {};
  UI.modal = function (html, opts) {
    opts = opts || {};
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal" role="dialog">' + html + '</div>';
    document.body.appendChild(bg);
    const close = () => { if (bg.parentNode) bg.parentNode.removeChild(bg); if (opts.onClose) opts.onClose(); };
    bg.addEventListener('click', e => { if (e.target === bg && !opts.sticky) close(); });
    const first = bg.querySelector('input:not([type=hidden]), select, textarea');
    if (first && opts.focus !== false) setTimeout(() => first.focus(), 50);
    return { el: bg.firstElementChild, bg, close };
  };
  UI.formData = function (form) {
    const o = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') {
        if (el.name.endsWith('[]')) { const k = el.name.slice(0, -2); (o[k] = o[k] || []); if (el.checked) o[k].push(el.value); }
        else o[el.name] = el.checked;
      } else o[el.name] = el.value.trim ? el.value.trim() : el.value;
    }
    return o;
  };
  UI.posChip = function (pos) {
    const m = S.POSITION_META[pos];
    return `<span class="chip pos" style="background:${m.fill};${pos === 'Z' ? 'color:#5b4a00' : ''}">${pos}</span>`;
  };
  UI.playerOptions = function (selectedId, includeBlank) {
    let s = includeBlank ? '<option value="">—</option>' : '';
    for (const p of S.activeRoster()) s += `<option value="${p.id}"${p.id === selectedId ? ' selected' : ''}>${p.number ? '#' + U.esc(p.number) + ' ' : ''}${U.esc(p.name)}</option>`;
    return s;
  };
  UI.setTitle = function (html) { document.getElementById('topbar').innerHTML = '<div class="topbar-in">' + html + '</div>'; };
  FB.ui = UI;

  /* ---------- router ---------- */
  const ROUTES = [
    [/^#?\/?$/, 'home'], [/^#\/home/, 'home'], [/^#\/roster/, 'roster'], [/^#\/practices/, 'practices'],
    [/^#\/games\/([^/?]+)/, 'game', 'games'], [/^#\/games/, 'games'],
    [/^#\/playbook\/([^/?]+)/, 'playbook', 'playbook'], [/^#\/playbook/, 'playbook'],
    [/^#\/view\/([^/?]+)/, 'viewer', 'playbook'],
    [/^#\/print(?:\/([^/?]+))?/, 'print', 'playbook'], [/^#\/gamesheet\/([^/?]+)/, 'gamesheet', 'games'],
    [/^#\/settings/, 'settings']
  ];
  let current = null;

  function parse() {
    const hash = location.hash || '#/home';
    const [path, qs] = hash.split('?');
    const query = {};
    if (qs) for (const kv of qs.split('&')) { const [k, v] = kv.split('='); query[decodeURIComponent(k)] = decodeURIComponent(v || ''); }
    for (const r of ROUTES) {
      const m = r[0].exec(path);
      if (m) return { view: r[1], nav: r[2] || r[1], id: m[1] ? decodeURIComponent(m[1]) : null, query, path };
    }
    return { view: 'home', nav: 'home', id: null, query, path };
  }

  function render() {
    const route = parse();
    const view = FB.views[route.view];
    const root = document.getElementById('app');
    if (current && current.view !== route.view && FB.views[current.view] && FB.views[current.view].destroy) FB.views[current.view].destroy();
    current = route;
    root.className = 'page' + (view && view.className ? ' ' + view.className : '');
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === route.nav));
    if (!view) { root.innerHTML = '<div class="empty">Not found</div>'; return; }
    try { view.render(root, route); } catch (e) { console.error(e); root.innerHTML = '<div class="empty">Something went wrong: ' + U.esc(e.message) + '</div>'; }
  }

  FB.app = {
    go(hash) { if (location.hash === hash) render(); else location.hash = hash; },
    rerender: render,
    route: () => current
  };

  window.addEventListener('hashchange', render);
  S.subscribe(() => { const v = FB.views[current && current.view]; if (v && !v.selfManaged) render(); });

  document.addEventListener('DOMContentLoaded', () => {
    S.load();
    render();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  });
})();
