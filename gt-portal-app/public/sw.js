/* Growth Terminal service worker. App shell cached, navigations network first
   so a deploy is picked up on the next load, assets cache first. */
const SHELL = 'gt-shell-v1';
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(['/', '/manifest.webmanifest']); }));
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== SHELL; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});
self.addEventListener('fetch', function (e) {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(function (r) {
      const copy = r.clone();
      caches.open(SHELL).then(function (c) { c.put('/', copy); });
      return r;
    }).catch(function () { return caches.match('/'); }));
    return;
  }
  e.respondWith(caches.match(e.request).then(function (hit) {
    return hit || fetch(e.request).then(function (r) {
      const copy = r.clone();
      caches.open(SHELL).then(function (c) { c.put(e.request, copy); });
      return r;
    });
  }));
});
