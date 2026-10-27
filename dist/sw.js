// Offline cache for SIGNAL//BREAK. Installed on the first online launch; afterwards the game
// starts from the cache, with or without a connection. A new build installs in the background
// and is used from the next launch.
const CACHE = 'signalbreak-694758a6befc';
const CORE = ["./index.html","./manifest.webmanifest","./icon.svg","./icon-180.png","./icon-192.png","./icon-512.png"];
self.addEventListener('install', (e) => {
  // bypass the HTTP cache so a new build never stores a stale copy of the page
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('signalbreak-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
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
