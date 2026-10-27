// Bundles the game into self-contained HTML files:
//   dist/index.html    — full document (PWA: manifest + service worker alongside)
//   dist/artifact.html — page fragment for hosting inside an artifact frame
import { build } from 'esbuild';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Build stamp shown on the title screen: build date plus the commit it was built from
// ("+" when built with uncommitted changes). Not a version number.
const git = (cmd) => { try { return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return ''; } };
const commit = git('rev-parse --short HEAD');
const dirty = commit && git('status --porcelain -- src') ? '+' : '';
const BUILD = { date: new Date().toISOString().slice(0, 10), commit: commit ? commit + dirty : '' };

// Fonts are embedded as base64 so every build (file, PWA, iOS app) renders identically offline.
// Faces that share one variable-font file are merged into a single weight-range face.
const faces = new Map();
for (const block of fs.readFileSync('public/fonts/fonts.css', 'utf8').split('@font-face').slice(1)) {
  const file = block.match(/url\(([^)]+\.woff2)\)/)[1];
  const weight = +block.match(/font-weight: (\d+)/)[1];
  const f = faces.get(file);
  if (f) { f.min = Math.min(f.min, weight); f.max = Math.max(f.max, weight); } else faces.set(file, { block, min: weight, max: weight });
}
const fontCss = [...faces].map(([file, f]) => '@font-face' + f.block
  .replace(/font-weight: \d+/, `font-weight: ${f.min === f.max ? f.min : `${f.min} ${f.max}`}`)
  .replace(file, `data:font/woff2;base64,${fs.readFileSync('public/fonts/' + file).toString('base64')}`)).join('');
const FONTS = `<style>${fontCss}</style>`;

const res = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', target: ['es2020', 'safari15'], write: false, legalComments: 'none', charset: 'utf8', define: { __BUILD__: JSON.stringify(BUILD) } });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('src/styles.css', 'utf8');
fs.mkdirSync('dist', { recursive: true });

const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>SIGNAL//BREAK</title>
<meta name="theme-color" content="#1c1018">
<meta name="description" content="A real-time party-based roguelite deckbuilding JRPG.">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="SignalBreak">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon-180.png">
${FONTS}
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script>${js}</script>
</body>
</html>
`;
fs.writeFileSync('dist/index.html', full);

const fragment = `<meta charset="utf-8">
<title>SIGNAL//BREAK</title>
${FONTS}
<style>${css}</style>
<div id="app"></div>
<script>${js}</script>
`;
fs.writeFileSync('dist/artifact.html', fragment);

// Page used inside native wrappers (iOS app): no manifest, icon or service worker links.
const app = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>SIGNAL//BREAK</title>
${FONTS}
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script>${js}</script>
</body>
</html>
`;
fs.writeFileSync('dist/app.html', app);

// Web app files: the page is self-contained, so these are everything it needs offline. The
// storage mirror (.github/workflows/mirror.yml) uploads the same files.
const WEB = ['manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
for (const f of WEB) fs.copyFileSync(`public/${f}`, `dist/${f}`);
// The cache name is a hash of the cached files, so a new build replaces the cache and an
// unchanged one keeps it.
const hash = createHash('sha256').update(full);
for (const f of WEB) hash.update(fs.readFileSync(`dist/${f}`));
const version = hash.digest('hex').slice(0, 12);
fs.writeFileSync('dist/sw.js', `// Offline cache for SIGNAL//BREAK. Installed on the first online launch; afterwards the game
// starts from the cache, with or without a connection. A new build installs in the background
// and is used from the next launch.
const CACHE = 'signalbreak-${version}';
const CORE = ${JSON.stringify(['./index.html', ...WEB.map((f) => './' + f)])};
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
`);
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log('dist/index.html', kb(full.length), '| dist/artifact.html', kb(fragment.length));
