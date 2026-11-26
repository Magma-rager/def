// Web app (PWA) check for the built game, as it runs from GitHub Pages: first online launch,
// launches with no connection, and an update to a new build.
//
// Usage: node tools/pwa.mjs [workDir]   (after npm run build)
// Copies dist/ to <workDir>/site/def/dist and serves it like GitHub Pages (site under /def/,
// Cache-Control max-age=600, folder URLs open index.html). PWA_PATH=/signalbreak/ serves the build
// at that path instead, as on the storage mirror (no site-root redirect then). Chromium stands in
// for Safari; an iPhone or iPad is still needed to confirm Add to Home Screen itself.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RU } from '../src/i18n/ru.js';
const { chromium } = createRequire(import.meta.url)('playwright');

const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'sb-pwa-')));
const site = path.join(work, 'site');
const BASE = process.env.PWA_PATH || '/def/dist/';
const PAGES = BASE === '/def/dist/';
const dist = path.join(site, BASE);
fs.rmSync(site, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dist), { recursive: true });
fs.cpSync('dist', dist, { recursive: true });
// the repository root page redirects to the build on github.io; here the host is localhost
if (PAGES) fs.writeFileSync(path.join(site, 'def', 'index.html'), fs.readFileSync('index.html', 'utf8').replace('/\\.github\\.io$/', '/^localhost$/'));

const PORT = 8200;
const HOST = `http://localhost:${PORT}`;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let requests = [];
let server = null;
const start = () => new Promise((resolve) => {
  server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    requests.push(p);
    let file = path.join(site, p);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
      file = path.join(file, 'index.html');
    }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
      res.end(data);
    });
  }).listen(PORT, resolve);
});
const stop = () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });

const results = [];
const check = (name, ok, info = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`);
};

await start();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, locale: 'ru-RU' });
// Seed the genuine Phase 8 profile once. The app itself must migrate and retain its earned unlocks.
const historical = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/meta-v2-phase8.json', import.meta.url)));
await ctx.addInitScript((profile) => {
  if (!localStorage.getItem('signalbreak.meta.v1')) localStorage.setItem('signalbreak.meta.v1', JSON.stringify(profile));
}, historical);
const errors = [];
const open = async (url) => {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.__sb, null, { timeout: 10000 });
  return p;
};

// 1. First launch, online, from the site address
let p = await open(PAGES ? `${HOST}/def/` : `${HOST}${BASE}index.html`);
if (PAGES) check('Site root opens the built game', p.url() === `${HOST}/def/dist/`, p.url());
await p.waitForFunction(() => window.__sb.offline === 'ready', null, { timeout: 30000 }).catch(() => {});
check('Title screen reports the game is available offline', await p.evaluate(() => window.__sb.offline === 'ready'), await p.textContent('.title-offline'));
const cached = await p.evaluate(async () => {
  const names = await caches.keys();
  const c = await caches.open(names[0]);
  return { names, files: (await c.keys()).map((r) => new URL(r.url).pathname.split('/').pop()) };
});
check('Cache holds the page, manifest and icons', cached.names.length === 1 && cached.files.length === 6, cached.files.join(' '));
const head = await p.evaluate(() => ({
  icon: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'),
  capable: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.content,
  title: document.querySelector('meta[name=apple-mobile-web-app-title]')?.content,
}));
check('iOS home-screen icon, title and standalone mode declared', head.icon === 'icon-180.png' && head.capable === 'yes' && !!head.title, JSON.stringify(head));
const manifest = await p.evaluate(async () => (await fetch('manifest.webmanifest')).json());
check('Manifest: start URL, scope, standalone display, PNG icons', manifest.start_url && manifest.scope && manifest.display === 'standalone' && manifest.icons.some((i) => i.sizes === '512x512'), `${manifest.start_url} ${manifest.scope} ${manifest.display}`);
check('Other files in the folder still come from the network', !(await p.evaluate(async () => (await fetch('app.html')).text())).includes('rel="manifest"'));
await p.evaluate(() => { const a = window.__sb; a.meta.tutorialDone = true; a.startFixtureRun('beta_badge'); });
await p.waitForTimeout(500);
await p.evaluate(() => { const s = document.querySelector('.dlg-skip'); if (s) s.click(); });
await p.waitForTimeout(300);
await p.close();

// 2. No connection: server stopped and the browser offline
await stop();
await ctx.setOffline(true);
requests = [];
for (const url of [`${HOST}${BASE}index.html`, `${HOST}${BASE}`, `${HOST}${BASE}index.html?source=homescreen`]) {
  let info = null;
  try {
    p = await open(url);
    info = await p.evaluate(async () => {
      await document.fonts.ready;
      const faces = ['700 12px "Barlow Condensed"', '900 12px "Big Shoulders Display"', '400 12px Spectral'];
      return { menu: document.querySelector('.title-menu .btn').textContent, cyrillic: faces.every((f) => document.fonts.check(f, 'Жя')) };
    });
  } catch (e) { /* reported below */ }
  check(`Offline launch: ${url.replace(HOST, '')}`, !!info && info.cyrillic, JSON.stringify(info));
  if (info && url.endsWith('/index.html')) {
    check('Offline: the saved run is offered', await p.evaluate(() => window.__sb.hasSave()));
    await p.evaluate(() => window.__sb.continueRun());
    await p.waitForTimeout(600);
    await p.evaluate(() => { const r = window.__sb.run; r.enterNode(r.availableNodes()[0]); window.__sb.route(); });
    await p.waitForTimeout(1500);
    const fight = await p.evaluate(() => {
      const bs = window.__sb.battle;
      if (!bs || !bs.combat) return null;
      const c = bs.combat;
      const u = c.hand.find((x) => x && c.check(x).ok);
      if (u) bs.doPlay(u);
      return { time: +c.t.toFixed(1), played: !!u };
    });
    check('Offline: a battle runs and a card plays', !!fight && fight.played, JSON.stringify(fight));
  }
  if (p) await p.close();
}
p = await open(`${HOST}${BASE}`);
const tap = (label, container = p) => container.getByRole('button', { name: RU.ui[label] || label, exact: true }).first().tap();
await tap('Museum');
await p.locator('.museum [data-tab="Achievements"]').tap();
check('Offline: migrated victory achievement remains visible', await p.locator('[data-achievement="victory"][data-earned="true"]').isVisible());
await p.locator('.museum [data-tab="Journal"]').tap();
check('Offline: Combo Journal opens with saved discoveries', await p.evaluate(() =>
  Object.keys(window.__sb.meta.combos).length > 0 && !!document.querySelector('.museum-body').innerText.trim()));
await tap('Close', p.locator('.museum'));
await tap('New Run');
await tap('Abandon & start new');
await p.locator('.starter-panel [data-relic="echo_splice"]').tap();
await tap('Begin', p.locator('.starter-panel'));
check('Offline: unlocked relic starts a normal run', await p.evaluate(() => window.__sb.run.d.relics.join() === 'echo_splice'));
await p.reload();
await tap('Continue');
check('Offline: new loadout and achievement survive reload', await p.evaluate(() =>
  window.__sb.run.d.relics.join() === 'echo_splice' && !!window.__sb.meta.progress.earned.victory));
await p.close();
check('Nothing was requested from the network while offline', requests.length === 0, requests.join(' '));

// 3. A new build is published: installed in the background, used from the next launch
await ctx.setOffline(false);
const page = path.join(dist, 'index.html');
fs.writeFileSync(page, fs.readFileSync(page, 'utf8').replace('<div id="app"></div>', '<div id="app"></div><!--next-build-->'));
const sw = path.join(dist, 'sw.js');
fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/signalbreak-[0-9a-f]+/, 'signalbreak-nextbuild'));
await start();
const isNext = () => p.evaluate(() => document.documentElement.outerHTML.includes('<!--next-build-->'));
p = await open(`${HOST}${BASE}index.html`);
const firstNext = await isNext();
// Ask for the same update the app requests on foregrounding. Chromium may deduplicate the
// launch's update with a previous offline attempt for the same registration.
const updateError = await p.evaluate(async () => {
  try { await (await navigator.serviceWorker.ready).update(); return ''; }
  catch (e) { return e.message; }
});
let names = [];
for (let i = 0; i < 40; i++) {
  names = await p.evaluate(() => caches.keys());
  if (names.join() === 'signalbreak-nextbuild') break;
  await p.waitForTimeout(250);
}
await p.close();
check('Update: the new build is cached and the old cache removed', names.join() === 'signalbreak-nextbuild', [names.join(), updateError].filter(Boolean).join(' · '));
p = await open(`${HOST}${BASE}index.html`);
const secondNext = await isNext();
await p.close();
check('Update: the next launch runs the new build', !firstNext && secondNext, `launch 1: ${firstNext ? 'new' : 'old'}, launch 2: ${secondNext ? 'new' : 'old'}`);
await stop();
await ctx.setOffline(true);
p = await open(`${HOST}${BASE}`);
check('Update: the new build starts offline', await isNext());

await b.close();
check('No page errors', errors.length === 0, errors.join(' | '));
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
