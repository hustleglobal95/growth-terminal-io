/* Growth Terminal service worker. App shell cached, navigations network first
   so a deploy is picked up on the next load, assets cache first.

   v3. v2 named the disease and only cured half of it.

   _redirects is a catch all: '/*  /index.html  200'. A request for a hashed
   asset that is not on the server yet does not 404, it answers 200 with the
   HTML shell. v2 stored any response that was ok, status 200 and same origin,
   and an HTML shell is all three. So during a deploy window a request for
   index-abc.css could be answered with HTML, and that HTML was written into
   the cache under the stylesheet URL. Cache first meant it was served from
   then on, forever, and a browser will not apply HTML as CSS. The app
   rendered with no styles on every later load and could not heal itself.

   v3 adds the check v2's own comment promised but never wrote: a response is
   only stored, and only served, if its content type matches what the request
   actually asked for. HTML is never acceptable for a stylesheet or a script.

   Two defences, not one:

     1. On write. A mismatched response is passed to the page and dropped
        rather than cached, so the window can no longer poison the cache.
     2. On read. A cached entry that fails the same check is deleted and
        refetched, so a cache already poisoned by v1 or v2 repairs itself on
        the next load instead of waiting for the version bump to reach it.

   The version bump alone would evict the bad entries on activate. The read
   check is there because caches outlive assumptions. */
/* v4. The mark changed and nobody saw it.

   Assets are cache first and the activate handler only clears caches whose
   name is not SHELL, so an image stored under v3 is served from v3 forever.
   The new logo shipped on the 24th and every browser that had already opened
   the app kept handing back the old one, phones included, where an installed
   copy has no reason to ever ask again. Renaming the cache is the eviction. */
/* v5. The mark changed again, and v4's own note is the reason this line exists.

   Every logo asset in this cache is precached by URL and served cache first,
   so a returning browser keeps handing back whatever it stored the first time
   it opened the app. The lockup, the mark and the whole icon set were replaced
   on the 26th: the favicons and app icons moved off the amber tile onto the
   ink ground, and the in-app mark lost its coloured tile entirely. None of
   that reaches a browser that already holds v4 until the cache is renamed.

   Renaming is the eviction. There is no other lever, because activate only
   deletes caches whose name is not SHELL. */
const SHELL = 'gt-shell-v5';

/* Only a real, successful, same origin response is worth keeping. An opaque,
   redirected or error response is passed through to the page and dropped. */
function storable(r) {
  return !!r && r.ok && r.status === 200 && r.type === 'basic';
}

function ctype(r) {
  return ((r && r.headers && r.headers.get('content-type')) || '').toLowerCase();
}

function isHtml(r) {
  return ctype(r).indexOf('text/html') !== -1;
}

/* The app shell must actually be a document. Navigating straight to an asset
   URL is still mode navigate, and caching that under '/' would hand the
   offline fallback a stylesheet instead of the app. */
function isDocument(r) {
  return isHtml(r);
}

/* What did this request actually ask for. destination is the honest answer
   when the browser sets one; a bare fetch() leaves it empty, so fall back to
   the extension, which is enough for the hashed assets we care about. */
function wants(req) {
  const d = req.destination;
  if (d === 'style' || d === 'script' || d === 'image' || d === 'font') return d;
  const p = new URL(req.url).pathname.toLowerCase();
  if (p.endsWith('.css')) return 'style';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'script';
  if (p.endsWith('.woff2') || p.endsWith('.woff') || p.endsWith('.ttf')) return 'font';
  if (/\.(png|jpg|jpeg|gif|svg|webp|avif|ico)$/.test(p)) return 'image';
  return '';
}

/* True when the response is a plausible answer to the request. Anything we
   cannot classify is allowed through, because guessing wrong here would break
   a request that works; the one thing we are certain about is that the HTML
   shell is never a stylesheet, a script, a font or an image. */
function typeOk(req, res) {
  const w = wants(req);
  if (!w) return true;
  const t = ctype(res);
  if (!t) return true;
  if (isHtml(res)) return false;
  if (w === 'style') return t.indexOf('css') !== -1;
  if (w === 'script') return t.indexOf('javascript') !== -1 || t.indexOf('ecmascript') !== -1;
  if (w === 'image') return t.indexOf('image/') !== -1;
  if (w === 'font') return t.indexOf('font') !== -1 || t.indexOf('octet-stream') !== -1;
  return true;
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

  const req = e.request;

  e.respondWith(caches.match(req).then(function (hit) {
    /* A cached entry that is not what the request asked for is poison from an
       older worker. Drop it and go to the network. */
    if (hit && !typeOk(req, hit)) {
      caches.open(SHELL).then(function (c) { c.delete(req); });
      hit = null;
    }
    if (hit) return hit;

    return fetch(req).then(function (r) {
      if (storable(r) && typeOk(req, r)) {
        const copy = r.clone();
        caches.open(SHELL).then(function (c) { c.put(req, copy); });
      }
      return r;
    });
  }));
});
