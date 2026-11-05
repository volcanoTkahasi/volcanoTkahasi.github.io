// HAYAOSHI LIVE service worker — network-first, falls back to cache (so the app shell opens offline/flaky).
const CACHE = 'hayaoshi-v1';
const SHELL = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const cdn = url.hostname === 'unpkg.com';
  if (!sameOrigin && !cdn) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && (sameOrigin || cdn)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: sameOrigin }).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
