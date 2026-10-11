// Service worker for the home-screen app.
// Pages always come from the network so the site never shows stale content;
// the cached offline page is only used when there's no connection.
// Supabase and other cross-origin requests are never touched.
var CACHE = 'tcsc-offline-v1';
var OFFLINE_URL = '/offline.html';

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll([OFFLINE_URL, '/assets/app/icon-192.png']); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  event.respondWith(
    fetch(req).catch(function () { return caches.match(OFFLINE_URL); })
  );
});
