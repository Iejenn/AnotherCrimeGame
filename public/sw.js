// Underworld's service worker. It's here so the game can be installed as an app; it caches NOTHING on purpose:
// the game is online-only, and it updates itself when a new version is out (src/useUpdateCheck.ts), so every
// request simply goes to the network as usual.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request));
});
