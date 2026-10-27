// Renders public/app-icon.svg to opaque PNGs: 1024x1024 for the iOS App Store, and the web app
// icons (180 for the iOS home screen, 192 and 512 for the manifest).
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const svg = fs.readFileSync('public/app-icon.svg', 'utf8');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
const out = [['public/app-icon-1024.png', 1024], ['public/icon-512.png', 512], ['public/icon-192.png', 192], ['public/icon-180.png', 180]];
const font = fs.readdirSync('public/fonts').find((f) => f.startsWith('bigshoulders'));
const face = `@font-face{font-family:'Big Shoulders Display';font-weight:700 900;src:url(data:font/woff2;base64,${fs.readFileSync('public/fonts/' + font).toString('base64')}) format('woff2')}`;
await p.setContent(`<html><head><style>${face}</style></head><body style="margin:0;background:#140a10">${svg.replace('<svg ', '<svg width="1024" height="1024" ')}</body></html>`);
await p.evaluate(() => document.fonts.load('900 300px "Big Shoulders Display"'));
for (const [path, size] of out) {
  await p.evaluate((n) => { const s = document.querySelector('svg'); s.setAttribute('width', n); s.setAttribute('height', n); }, size);
  await p.screenshot({ path, omitBackground: false, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(path);
}
await b.close();
