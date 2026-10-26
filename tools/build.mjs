// Bundles the game into self-contained HTML files:
//   dist/index.html    — full document (PWA: manifest + service worker alongside)
//   dist/artifact.html — page fragment for hosting inside an artifact frame
import { build } from 'esbuild';
import fs from 'node:fs';

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&family=Big+Shoulders+Display:wght@700;800;900&family=Spectral:ital,wght@0,400;0,600;1,400&display=swap">';

const res = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', target: ['es2020', 'safari15'], write: false, legalComments: 'none' });
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
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
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

const fragment = `<title>SIGNAL//BREAK</title>
${FONTS}
<style>${css}</style>
<div id="app"></div>
<script>${js}</script>
`;
fs.writeFileSync('dist/artifact.html', fragment);

fs.copyFileSync('public/manifest.webmanifest', 'dist/manifest.webmanifest');
fs.copyFileSync('public/icon.svg', 'dist/icon.svg');
const version = Date.now().toString(36);
fs.writeFileSync('dist/sw.js', `// Offline cache for SIGNAL//BREAK
const CACHE = 'signalbreak-${version}';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => hit)));
});
`);
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log('dist/index.html', kb(full.length), '| dist/artifact.html', kb(fragment.length));
