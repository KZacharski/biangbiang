/*
 * Minimal service worker.
 *
 * Its only purpose is to satisfy the PWA installability requirement (a
 * registered service worker). It deliberately performs NO caching, so the app
 * has no offline functionality - every request is passed straight to the
 * network.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network-only passthrough: nothing is ever read from or written to a cache.
  event.respondWith(fetch(event.request));
});
