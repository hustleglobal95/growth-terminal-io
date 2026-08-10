/* Growth Terminal service worker. App shell cached, navigations network first
   so a deploy is picked up on the next load, assets cache first.

   v2. Two faults in v1 combined to serve an unstyled app after a deploy, and
   it could not heal itself:

     1. The cache name never changed, so a cache written by an older build
        outlived every deploy.
     2. Every response was stored, including the SPA HTML fallback that
        _redirects returns for a path that is not on the server yet. During a
        deploy window a request for a new hashed asset could answer with that
        HTML, and the HTML was then cached under the stylesheet URL forever.
        The browser refused to apply HTML as CSS, so the app rendered with no
        styles on every later load.

   The fixes: version the cache name, so activate evicts the previous one, and
   only store a successful same origin response whose type matches what the
   request asked for. */
const SHELL = 'gt-shell-v2';

/* Only a real, successful, same origin response is worth keeping. An opaque,
   redirected or error response is passed through to the page and dropped. */
function storable(r) {
  return !!r && r.ok && r.status === 200 && r.type === 'basic';
}

/* The app shell must actually be a document. Navigating straight to an asset
   URL is still mode navigate, and caching that under '/' would hand the
   offline fallback a stylesheet instead of the app. */
function isDocument(r) {
  const t = r.headers.get('content-type') || '';
  return t.indexOf('text/html') !== -1;
}

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
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(function (r) {
      if (storable(r) && isDocument(r)) {
        const copy = r.clone();
        caches.open(SHELL).then(function (c) { c.put('/', copy); });
      }
      return r;
    }).catch(function () { return caches.match('/'); }));
    return;
  }

  e.respondWith(caches.match(e.request).then(function (hit) {
    return hit || fetch(e.request).then(function (r) {
      if (storable(r)) {
        const copy = r.clone();
        caches.open(SHELL).then(function (c) { c.put(e.request, copy); });
      }
      return r;
    });
  }));
});
