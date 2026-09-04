/* FlagBook service worker: cache-first for the app shell so it works offline on the field. */
const CACHE = 'flagbook-v10';
const ASSETS = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/util.js', './js/geometry.js', './js/store.js', './js/media.js', './js/rotation.js', './js/field.js',
  './js/views/home.js', './js/views/roster.js', './js/views/practices.js', './js/views/games.js',
  './js/views/playbook.js', './js/views/viewer.js', './js/views/clips.js', './js/views/print.js', './js/views/settings.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];
// Precache straight from the network (cache: 'reload'): GitHub Pages sends max-age=600, and going through
// the HTTP cache could mix a fresh index.html with a stale app.js, which made new tabs route to Home.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request, { cache: 'no-cache' }).then(res => {
        if (res && res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
