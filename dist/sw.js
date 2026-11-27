// Offline cache for SIGNAL//BREAK. Installed on the first online launch; afterwards the game
// starts from the cache, with or without a connection. A new build installs in the background
// and is used from the next launch.
const BUILD = '058596c3abb0';
const PAGE_HASH = '31681edbe19c5893925a2851545781d9475475e67faeb5580f7a79c424fbaef5';
const PREFIX = 'signalbreak:' + self.registration.scope + ':';
const CACHE = PREFIX + BUILD;
const CORE = ["./index.html","./manifest.webmanifest","./icon.svg","./icon-180.png","./icon-192.png","./icon-512.png"];
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const responses = await Promise.all(CORE.map((u) => fetch(u, { cache: 'reload' })));
    if (responses.some((r) => !r.ok)) throw Error('Incomplete offline build');
    const digest = await crypto.subtle.digest('SHA-256', await responses[0].clone().arrayBuffer());
    const actual = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (actual !== PAGE_HASH) throw Error('Offline page does not match the worker build');
    const cache = await caches.open(CACHE);
    try {
      await Promise.all(CORE.map((u, i) => cache.put(u, responses[i])));
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(async (key) => {
      if (key === CACHE) return;
      if (key.startsWith(PREFIX) || (key.startsWith('signalbreak-') && await caches.match('./index.html', { cacheName: key }))) {
        await caches.delete(key);
      }
    }));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // the game page under any of its addresses (folder, index.html, with a query string); other
  // files in the folder (downloads, the iOS project) go to the network
  const page = req.url.split(/[?#]/)[0];
  if (req.mode === 'navigate' && (page === self.registration.scope || page === self.registration.scope + 'index.html')) {
    e.respondWith(caches.open(CACHE).then((c) => c.match('./index.html')).then((hit) => hit || fetch(req)));
    return;
  }
  e.respondWith(caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true })).then((hit) => hit || fetch(req)));
});
